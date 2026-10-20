#!/usr/bin/env node
/**
 * 重烘 preview/assets/ueg-land.js —— 那颗点云地球的陆地数据。
 *
 * 为什么需要这个脚本：这份数据以前是 `preview/make-land.py` 烘的，后来在整理仓库时
 * 被删掉了。等到要修"地球转起来像南北方向在动"时，只剩一个二进制点云，
 * 既看不出它是什么投影、也没法重烘 —— 只能从头考古。这份脚本就是为了不再重演。
 *
 * 数据源：Natural Earth 110m land（公有领域，GeoJSON，坐标本身就是经度/纬度）。
 *   https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson
 *   把下载到的文件路径作为第一个参数传进来（默认读 $TEMP/ne_land.geojson）。
 *
 * 做法：对多边形做扫描线栅格化（奇偶规则，洞自动镂空），得到 0.5° 的陆地网格，
 * 再均匀抽样，按 [纬度, 经度] 各量化 1 字节打包成 base64，写成
 * `window.UEG_LAND = "..."`。渲染端按等距圆柱 → 正射投影画成球，
 * 所以"经度绕竖轴转"就是几何正确的自转。
 *
 * 用法：
 *   node scripts/bake-land.mjs [geojson 路径] [点数，默认 9500]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const input = process.argv[2] ?? resolve(process.env.TEMP ?? '.', 'ne_land.geojson')
const target = Number(process.argv[3] ?? 9500)

if (!existsSync(input)) {
  console.error(`bake-land: 没找到 ${input}\n  先下载：\n    curl -L -o "$TEMP/ne_land.geojson" https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson`)
  process.exit(1)
}

const geo = JSON.parse(readFileSync(input, 'utf8'))

// ── 收集所有环的边（扫描线用奇偶规则，外环与洞混在一起也不用区分）──
const edges = []
let polygons = 0
const addRing = (ring) => {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    edges.push([a[0], a[1], b[0], b[1]])
  }
}
for (const feature of geo.features) {
  const g = feature.geometry
  if (!g) continue
  if (g.type === 'Polygon') {
    polygons += 1
    for (const ring of g.coordinates) addRing(ring)
  } else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) {
      polygons += 1
      for (const ring of poly) addRing(ring)
    }
  }
}

// ── 扫描线栅格化：0.5° 网格 ──
const COLS = 720
const ROWS = 360
const land = new Uint8Array(COLS * ROWS)
let landCells = 0
for (let ry = 0; ry < ROWS; ry++) {
  const lat = 90 - (ry + 0.5) * (180 / ROWS)
  const crossings = []
  for (const [x1, y1, x2, y2] of edges) {
    if ((y1 > lat) === (y2 > lat)) continue
    crossings.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1))
  }
  if (crossings.length < 2) continue
  crossings.sort((a, b) => a - b)
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const west = crossings[i]
    const east = crossings[i + 1]
    if (east <= west) continue
    const c0 = Math.max(0, Math.ceil(((west + 180) / 360) * COLS - 0.5))
    const c1 = Math.min(COLS - 1, Math.floor(((east + 180) / 360) * COLS - 0.5))
    for (let c = c0; c <= c1; c++) {
      land[ry * COLS + c] = 1
      landCells += 1
    }
  }
}

// ── 均匀抽样 ──
const cells = []
for (let ry = 0; ry < ROWS; ry++) {
  for (let cx = 0; cx < COLS; cx++) {
    if (land[ry * COLS + cx]) cells.push([ry, cx])
  }
}
let picked = cells
if (cells.length > target) {
  // 固定种子：同一份输入永远烘出同一份输出，diff 才看得懂
  let seed = 20261019
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const seen = new Set()
  picked = []
  while (picked.length < target) {
    const index = Math.floor(random() * cells.length)
    if (seen.has(index)) continue
    seen.add(index)
    picked.push(cells[index])
  }
}

// ── 打包：每点 2 字节（纬度、经度各 0..255）──
const bytes = Buffer.alloc(picked.length * 2)
picked.forEach(([ry, cx], i) => {
  const lat = 90 - (ry + 0.5) * (180 / ROWS)
  const lon = -180 + (cx + 0.5) * (360 / COLS)
  bytes[i * 2] = Math.max(0, Math.min(255, Math.round(((lat + 90) / 180) * 255)))
  bytes[i * 2 + 1] = Math.max(0, Math.min(255, Math.round(((lon + 180) / 360) * 255)))
})

const output = [
  '/* 陆地点云：由 scripts/bake-land.mjs 从 Natural Earth 110m land（公有领域）烘出。',
  '   每点 2 字节：纬度、经度各量化到 0..255。渲染端按等距圆柱 → 正射投影画成球，',
  '   所以经度绕竖轴自转是几何正确的（大陆横着转，不会南北方向动）。',
  `   共 ${picked.length} 个点（陆地网格 ${landCells} / ${COLS * ROWS} = ${((landCells / (COLS * ROWS)) * 100).toFixed(1)}%）。`,
  '   预先烘好是为了让页面在 file:// 下也能显示 —— 从画布读像素会污染画布。',
  '   别手改这个文件：改 scripts/bake-land.mjs 再跑一遍。 */',
  `window.UEG_LAND = "${bytes.toString('base64')}"`,
  '',
].join('\n')

const outFile = resolve(root, 'preview/assets/ueg-land.js')
writeFileSync(outFile, output)
process.stdout.write(
  `bake-land: ${polygons} 个多边形 / ${edges.length} 条边 → 陆地 ${landCells} 格 → 取 ${picked.length} 点 → ${outFile}\n`,
)
