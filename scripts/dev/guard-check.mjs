import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
const TOKEN = process.argv[2]
const T = process.env.TEMP
const DBG = 9651
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p))
const b = spawn(edge, ['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=' + DBG,'--user-data-dir=' + T + '/gd' + Date.now(),'about:blank'], { stdio: 'ignore', windowsHide: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let t = null
for (let i = 0; i < 60 && !t; i++) { try { const l = await (await fetch('http://127.0.0.1:' + DBG + '/json/list')).json(); t = l.find((e) => e.type === 'page' && e.webSocketDebuggerUrl) } catch {} if (!t) await sleep(300) }
if (!t) { console.log('  ✗'); process.exit(1) }
const s = new WebSocket(t.webSocketDebuggerUrl)
await new Promise((r) => { s.onopen = r })
let id = 0; const w = new Map()
s.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m.result); w.delete(m.id) } }
const send = (method, params = {}) => new Promise((res) => { id += 1; w.set(id, res); s.send(JSON.stringify({ id, method, params })) })
const val = async (x) => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r && r.result ? r.result.value : 'undef' }
await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'http://127.0.0.1:3847/?token=' + TOKEN })
await sleep(20000)
console.log('  __dsh550cApplied      = ' + (await val('window.__dsh550cApplied')))
console.log('  __dsh550cSplashPlayed = ' + (await val('window.__dsh550cSplashPlayed')))
console.log('  host 元素              = ' + (await val("document.querySelectorAll('[class*=\"dsh550c-host\"]').length")))
console.log('  550C 页签存在          = ' + (await val("[...document.querySelectorAll('*')].some((e) => (e.textContent||'').trim() === '550C' && e.offsetParent !== null)")))
s.close(); spawnSync('taskkill', ['/PID', String(b.pid), '/T', '/F'], { stdio: 'ignore' })
