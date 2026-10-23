import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const TOKEN = process.argv[2]
const APP = 'http://127.0.0.1:3847'
const T = process.env.TEMP
const DBG = 9650
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))

const probe = `
window.__probe = { t0: performance.now(), log: [], hosts: 0 }
const L = (tag) => window.__probe.log.push(Math.round(performance.now() - window.__probe.t0) + 'ms|' + tag)
setInterval(() => {
  const hosts = document.querySelectorAll('[class*="dsh550c-host"]').length
  if (hosts !== window.__probe.hosts) { window.__probe.hosts = hosts; L('host 数量=' + hosts) }
}, 100)
window.__origInfo = console.info
console.info = function () {
  const s = Array.prototype.join.call(arguments, ' ')
  if (s.indexOf('dsh-550c-boot') >= 0) L('LOG ' + s.slice(0, 60))
  return window.__origInfo.apply(console, arguments)
}
`

const b = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + DBG,
  '--user-data-dir=' + T + '/rg' + Date.now(),
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target = null
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + DBG + '/json/list')).json()
    target = list.find((e) => e.type === 'page' && e.url === 'about:blank' && e.webSocketDebuggerUrl)
      ?? list.find((e) => e.type === 'page' && e.webSocketDebuggerUrl)
  } catch {}
  if (!target) await sleep(300)
}
if (!target) { console.log('  ✗ 页面启动失败'); process.exit(1) }

const s = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { s.onopen = r; s.onerror = () => j(new Error('ws')) })
let id = 0
const waiters = new Map()
s.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id !== undefined && waiters.has(m.id)) { waiters.get(m.id)(m.result); waiters.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => { id += 1; waiters.set(id, res); s.send(JSON.stringify({ id, method, params })) })
const val = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r && r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.text).slice(0, 120)
  return r && r.result ? r.result.value : 'undef'
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: probe })
await send('Page.navigate', { url: APP + '/?token=' + TOKEN })

// 片头自动播一次；等它走完
await sleep(22000)

const log = JSON.parse(String(await val('JSON.stringify(window.__probe.log)')))
console.log('  ═══ 片头与 host 时间轴 ═══')
for (const l of log) console.log('    ' + l.replace('|', '  '))

console.log('\n  ═══ 面板是否还在 ═══')
const body = String(await val("(document.body.innerText || '')"))
console.log('    设置里 550C 存在: ' + (body.includes('550C') ? '✓（页面文本含 550C）' : '（页面未打开设置，下面用 DOM 检查）'))

// 打开设置，检查 550C 页签
const clickAria = (label) => val(
  "(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === " + JSON.stringify(label) + "); if (!el) return 'no'; el.click(); return 'ok' })()")
const clickExact = (txt) => val(
  "(() => { const all = [...document.querySelectorAll('button,a,div,span,li')]; const el = all.reverse().find((e) => e.offsetParent !== null && (e.textContent||'').trim() === " + JSON.stringify(txt) + "); if (!el) return 'no'; el.click(); return 'ok' })()")

await clickAria('账号菜单'); await sleep(900)
await clickExact('设置'); await sleep(1500)
const hasTab = String(await val("[...document.querySelectorAll('*')].some((e) => (e.textContent||'').trim() === '550C' && e.offsetParent !== null) ? 'yes' : 'no'"))
console.log('    设置侧栏有 550C: ' + (hasTab === 'yes' ? '✓' : '✗ 消失了'))

console.log('\n  ═══ host 元素最终数量 ═══')
console.log('    ' + (await val("document.querySelectorAll('[class*=\"dsh550c-host\"]').length")) + ' 个（应为 0 或 1，不应堆积）')

s.close()
spawnSync('taskkill', ['/PID', String(b.pid), '/T', '/F'], { stdio: 'ignore' })
