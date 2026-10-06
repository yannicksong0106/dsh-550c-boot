/**
 * 按固定时间点抓帧。
 *
 * 用法：
 *   node dev/overwrite-console/shoot.mjs                       # 默认 12 个关键时间点
 *   node dev/overwrite-console/shoot.mjs --times 3900,10760    # 只看某几帧
 *   node dev/overwrite-console/shoot.mjs --size 1280x800 --out shots
 *
 * 页面是自包含的（无外链），本来 file:// 直接打开就行，但 Chromium 对 file:// 的
 * 缓存以路径为键、会忽略查询串：改了代码却抓出字节完全相同的一帧，会把结论带偏。
 * 所以这里自己起一个 no-store 的静态服务，每帧再带一个时间戳查询串。
 *
 * 每帧都带 ?at=<ms>&still=1&w=&h=：still 模式冻结 CSS 动画、只渲染一帧；w/h 把
 * 舞台尺寸钉死（无头浏览器带 --screenshot 时，脚本先于 --window-size 生效，
 * 页面自己量到的尺寸会与画面不一致）。于是同一时间点反复抓，像素完全一致。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const page = resolve(here, 'index.html')
const HTML = readFileSync(page)

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}

const times = String(opt('times', '0,900,1500,2600,3900,5200,6600,7600,9200,9800,10760,11600,12600,13400,14600'))
  .split(',')
  .map(Number)
  .filter((n) => Number.isFinite(n) && n >= 0)
const size = String(opt('size', '1440x860'))
const outDir = resolve(here, String(opt('out', 'shots')))
const budget = Number(opt('budget', 2500))
const debug = argv.includes('--debug')
/** --live：不带 at/still，让页面真的按 rAF 播一遍，用虚拟时间预算当"放映时长"。
 *  用来验证实时播放路径（定时器、逐节组装、循环）与 still 定格是同一套画面。 */
const live = argv.includes('--live')

const BROWSER = [
  process.env.DSH_550C_BROWSER,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => candidate !== undefined && existsSync(candidate))

if (BROWSER === undefined) {
  process.stdout.write('shoot: 没找到 Edge/Chrome；用 DSH_550C_BROWSER 指一个浏览器可执行文件。\n')
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
const profile = resolve(outDir, '.profile')

// no-store 的静态服务：只发这一个页面
const server = createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/index.html')) {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0',
    })
    res.end(HTML)
  } else {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  }
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port
const stop = () => { try { server.close() } catch { /* already closed */ } }
process.on('exit', stop)

const COMMON = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--disable-http-cache',
  `--user-data-dir=${profile}`,
  `--window-size=${size}`,
]

const [vw, vh] = size.split('x').map(Number)

/** 用异步 spawn 而不是 spawnSync：抓帧的服务就跑在本进程里，spawnSync 会阻塞
 *  事件循环，浏览器永远等不到响应，整个脚本会挂死。 */
function shootOnce(url, png, budgetMs) {
  return new Promise((done) => {
    const child = spawn(BROWSER, [...COMMON, `--virtual-time-budget=${budgetMs}`, `--screenshot=${png}`, url], {
      stdio: 'ignore',
      windowsHide: true,
    })
    const timer = setTimeout(() => { try { child.kill() } catch { /* gone */ } }, 60000)
    child.on('exit', () => { clearTimeout(timer); done() })
    child.on('error', () => { clearTimeout(timer); done() })
  })
}

/** 抓一帧的 DOM（自检用）：--virtual-time-budget 会等到脚本跑完。 */
function dumpDom(url, budgetMs) {
  return new Promise((done) => {
    const child = spawn(BROWSER, [...COMMON, `--virtual-time-budget=${budgetMs}`, '--dump-dom', url], {
      windowsHide: true,
    })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    const timer = setTimeout(() => { try { child.kill() } catch { /* gone */ } }, 120000)
    child.on('exit', () => { clearTimeout(timer); done(out) })
    child.on('error', () => { clearTimeout(timer); done(out) })
  })
}

/* --sweep：不抓图，改跑页面内置的整条时间线自检（?sweep=1），读 <html data-sweep> */
if (argv.includes('--sweep')) {
  const page_html = readFileSync(page, 'utf8')
  const url = `http://127.0.0.1:${port}/index.html?sweep=1&w=${vw}&h=${vh}&cb=${Date.now()}`
  const dom = await dumpDom(url, 20000)
  const count = /data-sweep="(\d+)"/.exec(dom)
  const hud = /id="hud"[^>]*>([\s\S]*?)<\/div>/.exec(dom)
  process.stdout.write(`页面自检：容器 ${vw}x${vh}\n`)
  process.stdout.write(hud ? hud[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '\n' : '（没找到自检输出）\n')
  if (count === null) {
    process.stdout.write('sweep: 读不到 data-sweep，页面可能没跑起来\n')
    stop()
    process.exit(1)
  }
  const problems = Number(count[1])
  process.stdout.write(problems === 0
    ? 'sweep: 整条时间线 0 问题\n'
    : `sweep: 时间线上有 ${String(problems)} 处问题\n`)
  process.stdout.write(`（页面 ${String(page_html.length)} 字符）\n`)
  stop()
  process.exit(problems === 0 ? 0 : 1)
}

const results = []
for (const t of times) {
  const name = live ? `live${String(t).padStart(5, '0')}.png` : `t${String(t).padStart(5, '0')}.png`
  const png = resolve(outDir, name)
  rmSync(png, { force: true })
  const query = live
    ? `cb=${Date.now()}${debug ? '&debug=1' : ''}`
    : `at=${t}&still=1&w=${vw}&h=${vh}&cb=${Date.now()}${debug ? '&debug=1' : ''}`
  const url = `http://127.0.0.1:${port}/index.html?${query}`
  await shootOnce(url, png, live ? t : budget)
  const ok = existsSync(png)
  results.push({ t, png, ok, bytes: ok ? statSync(png).size : 0 })
}

let bad = 0
for (const r of results) {
  if (!r.ok || r.bytes < 4000) {
    bad += 1
    process.stdout.write(`!! t=${r.t} 抓帧失败或几乎空白（${r.bytes} B）→ ${r.png}\n`)
  } else {
    process.stdout.write(`ok  t=${String(r.t).padStart(5)}  ${String(Math.round(r.bytes / 1024)).padStart(4)} KB  ${r.png}\n`)
  }
}
process.stdout.write(
  bad === 0
    ? `\nshoot: ${results.length} 帧全部写出（${size}）\n`
    : `\nshoot: ${bad} / ${results.length} 帧有问题\n`,
)
stop()
process.exit(bad === 0 ? 0 : 1)
