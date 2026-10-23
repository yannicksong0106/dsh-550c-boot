import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const TOKEN = process.argv[2]
const PORT = 3846
const T = process.env.TEMP
const DBG = 9640
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p))

const probe = `
window.__probe = { t0: performance.now(), log: [] }
const L = (tag, extra) => window.__probe.log.push(Math.round(performance.now() - window.__probe.t0) + 'ms  ' + tag + (extra ? '  ' + extra : ''))
window.__audios = []
const P = HTMLMediaElement.prototype
const oPlay = P.play, oPause = P.pause
P.play = function () { if (window.__audios.indexOf(this) < 0) window.__audios.push(this); L('audio.play', 'vol=' + this.volume.toFixed(2)); return oPlay.apply(this, arguments) }
P.pause = function () { L('>>> audio.pause', 'vol=' + this.volume.toFixed(2) + ' t=' + (this.currentTime||0).toFixed(2)); return oPause.apply(this, arguments) }
const AC = (window.AudioContext || window.webkitAudioContext).prototype
;['close','suspend','resume'].forEach((k) => { const o = AC[k]; AC[k] = function () { L('>>> AudioContext.' + k); return o.apply(this, arguments) } })
setInterval(() => {
  const a = window.__audios[window.__audios.length - 1]
  if (a) L('vol', a.volume.toFixed(2) + ' paused=' + a.paused + ' t=' + (a.currentTime || 0).toFixed(2))
}, 250)
let sawHost = false
const scan = () => {
  const hosts = [...document.querySelectorAll('[class*="dsh550c"]')]
  const host = hosts.find((e) => /dsh550c-(host|overlay|root)/.test(e.className) || e.shadowRoot)
  if (host) {
    if (!sawHost) { sawHost = true; L('overlay 出现', String(host.className).slice(0, 40)) }
    if (String(host.className).includes('dsh550c-out')) L('>>> overlay 收口（dsh550c-out）')
    if (!document.body.contains(host)) L('>>> overlay 已从 DOM 移除')
  } else if (sawHost) { L('>>> overlay 消失') ; sawHost = false }
}
setInterval(scan, 100)
`

const b = spawn(edge, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + DBG,
  '--user-data-dir=' + T + '/pb' + Date.now(),
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
  if (r && r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.text).slice(0, 140)
  return r && r.result ? r.result.value : 'undef'
}

await send('Page.enable')
await send('Runtime.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: probe })
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?token=' + TOKEN })
await sleep(24000)

const log = await val('JSON.stringify(window.__probe ? window.__probe.log : ["no probe"])')
const rows = JSON.parse(String(log))
console.log('  记录 ' + rows.length + ' 条\n')
let lastVol = null
for (const r of rows) {
  if (r.includes('  vol  ')) {
    // 音量采样压缩：只在变化或异常时打印
    const v = r.split('vol  ')[1]
    if (v !== lastVol) { console.log('  ' + r); lastVol = v }
  } else {
    console.log('  ' + r)
  }
}

s.close()
spawnSync('taskkill', ['/PID', String(b.pid), '/T', '/F'], { stdio: 'ignore' })
