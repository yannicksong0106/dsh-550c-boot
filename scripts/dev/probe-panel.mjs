import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const TOKEN = process.argv[2]
const PORT = process.argv[3] || '3847'
const T = process.env.TEMP
const DBG = 9660
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p))

const b = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1400,1000', '--remote-debugging-port=' + DBG, '--user-data-dir=' + T + '/pp' + Date.now(), 'about:blank'], { stdio: 'ignore', windowsHide: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let t = null
for (let i = 0; i < 60 && !t; i++) { try { const l = await (await fetch('http://127.0.0.1:' + DBG + '/json/list')).json(); t = l.find((e) => e.type === 'page' && e.webSocketDebuggerUrl) } catch {} if (!t) await sleep(300) }
if (!t) { console.log('  ✗ 页面启动失败'); process.exit(1) }

const s = new WebSocket(t.webSocketDebuggerUrl)
await new Promise((r) => { s.onopen = r })
let id = 0
const w = new Map()
const errs = []
s.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errs.push(String((d.exception && d.exception.description) || d.text).split('\n')[0].slice(0, 160)) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') { errs.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 160)) }
  if (m.id && w.has(m.id)) { w.get(m.id)(m.result); w.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => { id += 1; w.set(id, res); s.send(JSON.stringify({ id, method, params })) })
const val = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); if (r && r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.text).slice(0, 120); return r && r.result ? r.result.value : 'undef' }

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?token=' + TOKEN })
await sleep(20000)

const clickAria = (label) => val("(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === " + JSON.stringify(label) + "); if (!el) return 'no'; el.click(); return 'ok' })()")
const clickExact = (txt) => val("(() => { const all = [...document.querySelectorAll('button,a,div,span,li')]; const el = all.reverse().find((e) => e.offsetParent !== null && (e.textContent||'').trim() === " + JSON.stringify(txt) + "); if (!el) return 'no'; el.click(); return 'ok' })()")

await clickAria('账号菜单'); await sleep(900)
await clickExact('设置'); await sleep(1500)
await clickExact('550C'); await sleep(2000)

console.log('  ═══ 全局旗子 ═══')
console.log('    __dsh550cPageOwner    = ' + (await val('window.__dsh550cPageOwner')))
console.log('    __dsh550cBootPage     = ' + (await val('window.__dsh550cBootPage')))
console.log('    __dsh550cRowsOnSeries = ' + (await val('window.__dsh550cRowsOnSeries')))
console.log('    __dsh550cApplied      = ' + (await val('window.__dsh550cApplied')))
console.log('\n  ═══ 页面里有没有我们的行 ═══')
console.log('    dsh550c-row 数量      = ' + (await val("document.querySelectorAll('.dsh550c-row').length")))
console.log('    dsh550c-seg 数量      = ' + (await val("document.querySelectorAll('.dsh550c-seg').length")))
console.log('    含「启动时播放 550C 片头」= ' + (await val("(document.body.innerText||'').includes('启动时播放 550C 片头')")))
console.log('    含「推荐搭配」          = ' + (await val("(document.body.innerText||'').includes('推荐搭配')")))
console.log('\n  ═══ 550C 面板容器内容长度 ═══')
console.log('    ' + (await val("(() => { const el = [...document.querySelectorAll('*')].find((e) => (e.textContent||'').trim() === '外观' && e.className); const box = el ? el.closest('div') : null; return box ? box.innerText.length : -1 })()")))
console.log('\n  ═══ 报错（前 8 条）═══')
if (errs.length === 0) console.log('    无')
for (const e of errs.slice(0, 8)) console.log('    ' + e)

s.close(); spawnSync('taskkill', ['/PID', String(b.pid), '/T', '/F'], { stdio: 'ignore' })
