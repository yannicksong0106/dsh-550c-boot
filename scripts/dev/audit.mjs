import { readFileSync, readdirSync, statSync } from 'node:fs'

const dirs = ['F:/项目/dsh-start/src', 'F:/项目/dsh-start/scripts', 'F:/项目/dsh-start/preview']
const rows = []
function walk(d) {
  for (const name of readdirSync(d)) {
    const p = d + '/' + name
    const st = statSync(p)
    if (st.isDirectory()) { if (!p.includes('node_modules')) walk(p) }
    else if (/\.(js|mjs|html|css)$/.test(name)) rows.push({ p, kb: st.size / 1024 })
  }
}
for (const d of dirs) walk(d)

console.log('  ═══ 源文件体量（按行数）═══')
const lineRows = rows.map((r) => {
  const t = readFileSync(r.p, 'utf8')
  return { name: r.p.replace('F:/项目/dsh-start/', ''), kb: r.kb, lines: t.split('\n').length, text: t }
}).sort((a, b) => b.lines - a.lines)
for (const r of lineRows.slice(0, 14)) {
  console.log('    ' + r.name.padEnd(34) + String(r.lines).padStart(6) + ' 行' + String(Math.round(r.kb)).padStart(6) + ' KB')
}
console.log('    合计: ' + lineRows.reduce((s, r) => s + r.lines, 0) + ' 行 / ' + Math.round(lineRows.reduce((s, r) => s + r.kb, 0)) + ' KB')

console.log('\n  ═══ 债务标记 ═══')
let debt = 0
for (const r of lineRows) {
  const hits = (r.text.match(/TODO|FIXME|HACK|XXX|临时|暂时|先这样|待删/g) || [])
  if (hits.length) { console.log('    ' + r.name.padEnd(34) + hits.length + ' 处: ' + [...new Set(hits)].join(',')); debt += hits.length }
}
if (debt === 0) console.log('    无 ✓')

console.log('\n  ═══ 诊断/调试残留 ═══')
let dbg = 0
for (const r of lineRows) {
  const hits = (r.text.match(/console\.(log|info|warn)\(/g) || [])
  if (hits.length) { console.log('    ' + r.name.padEnd(34) + hits.length + ' 处 console.*'); dbg += hits.length }
}

console.log('\n  ═══ 重复模式 ═══')
const all = lineRows.map((r) => r.text).join('\n')
const patterns = [
  ['window.open(https://www.npmjs.com', '跳 npm 页面'],
  ['logic 同名函数 __skinInstalled', '皮肤判定'],
  ['readLoginPref(', '读设置'],
  ['ensureRowStyle()', '注入行样式'],
  ['React.createElement', '手写 createElement'],
  ['try {', 'try 块'],
]
for (const [pat, label] of patterns) {
  const n = all.split(pat).length - 1
  console.log('    ' + label.padEnd(18) + n + ' 次')
}

console.log('\n  ═══ 函数体量（最大的 8 个）═══')
for (const r of lineRows) {
  if (!/\.(js|mjs)$/.test(r.name)) continue
  const lines = r.text.split('\n')
  const fns = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(async\s+)?function\s+\w+/.test(lines[i])) {
      const name = (lines[i].match(/function\s+(\w+)/) || [])[1]
      let depth = 0, end = i
      for (let j = i; j < lines.length; j++) {
        depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length
        if (depth === 0 && j > i) { end = j; break }
      }
      fns.push({ name, size: end - i + 1 })
    }
  }
  for (const f of fns.sort((a, b) => b.size - a.size).slice(0, 3)) {
    if (f.size > 80) console.log('    ' + (r.name + ' · ' + f.name).padEnd(40) + f.size + ' 行')
  }
}
