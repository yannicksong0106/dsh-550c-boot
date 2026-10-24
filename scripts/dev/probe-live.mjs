/**
 * 真机探针：起一个 web 实例，用 CDP 打开它，验证「插件在真实应用里能用」。
 *
 * 和 harness 的分工：harness 验的是 bundle 在受控页面里的行为；
 * 这个探针验的是**真实 DSH + 真实 profile（含皮肤）**下的三件事：
 *
 *   ① 片头：挂载 → 首帧撤退 → 7 秒内拆干净
 *   ② 设置页：三个页签都在，且每页都真的有行
 *   ③ 控制台：没有 [dsh-550c-boot] 的报错
 *
 * 用法（先起实例，从输出里取 token）：
 *   node "C:\...\@deepseek-ai\dsh\lib\bin.js" --profile web --port 3850 --no-open
 *   node scripts/dev/probe-live.mjs <token> 3850
 */
import { spawn } from 'node:child_process'

const TOKEN = process.argv[2]
const PORT = process.argv[3]
const DBG = 9771
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1440,1000',
  '--remote-debugging-port=' + DBG, '--user-data-dir=' + process.env.TEMP + '/pl' + Date.now(), 'about:blank'],
  { stdio: 'ignore', windowsHide: true })

let target = null
for (let i = 0; i < 60 && target === null; i += 1) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + DBG + '/json/list')).json()
    target = list.find((e) => e.type === 'page' && e.webSocketDebuggerUrl) ?? null
  } catch { /* not up */ }
  if (target === null) await sleep(300)
}
if (target === null) { console.log('no page'); process.exit(1) }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => { ws.onopen = r })
let id = 0
const waiting = new Map()
const errors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + String(m.params.exceptionDetails.text).slice(0, 200))
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
    if (text.includes('550c')) errors.push('console.error ' + text.slice(0, 260))
  }
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id) }
}
const send = (method, params = {}) => new Promise((res) => { id += 1; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
const val = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r?.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.text).slice(0, 160)
  return r?.result?.value
}

await send('Page.enable'); await send('Runtime.enable')
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?token=' + TOKEN })

await sleep(1200)
const atStart = await val("JSON.stringify({host: document.querySelectorAll('.dsh550c-host').length, first: document.documentElement.classList.contains('dsh550c-first'), bootCard: !!document.querySelector('[data-dsh-boot]')})")
console.log('1.2s  :', atStart)

await sleep(6000)
const atEnd = await val("JSON.stringify({host: document.querySelectorAll('.dsh550c-host').length, first: document.documentElement.classList.contains('dsh550c-first'), state: window.__dsh550cState || null, skin: String(window.__dsh550cSkinVersion)})")
console.log('7.2s  :', atEnd)

// 打开设置：先找账号菜单，再找「设置」
const clickByText = async (text) => val("(() => { const all = [...document.querySelectorAll('button,[role=menuitem],a,div,span')]; const el = all.reverse().find((e) => e.offsetParent !== null && (e.textContent || '').trim() === " + JSON.stringify(text) + "); if (!el) return 'no'; el.click(); return 'ok' })()")
console.log('账号菜单:', await val("(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => /账号|账户|account/i.test(e.getAttribute('aria-label'))); if (!el) return 'no'; el.click(); return 'ok' })()"))
await sleep(900)
console.log('设置    :', await clickByText('设置'))
await sleep(1500)
console.log('550C    :', await clickByText('550C'))
await sleep(1200)

const panel = await val("(() => { const rows = document.querySelectorAll('.dsh550c-row').length; const segs = document.querySelectorAll('.dsh550c-seg').length; const card = document.querySelector('.dsh550c-panel-card'); const tabs = [...document.querySelectorAll('.dsh550c-panel-frame button')].map((b) => (b.textContent || '').trim()); return JSON.stringify({rows, segs, cardLen: card ? card.innerText.length : -1, tabs, text: card ? card.innerText.replace(/\\s+/g, ' ').slice(0, 220) : null}) })()")
console.log('panel  :', panel)
// 切到 boot 自己的两个 tab，逐页读行
const clickTab = async (label) => val("(() => { const el = [...document.querySelectorAll('.dsh550c-panel-frame button')].find((b) => (b.textContent || '').trim() === " + JSON.stringify(label) + "); if (!el) return 'no'; el.click(); return 'ok' })()")
const readTab = async () => val("(() => { const card = document.querySelector('.dsh550c-panel-card'); const rows = card ? card.querySelectorAll('.dsh550c-row').length : -1; const segs = card ? card.querySelectorAll('.dsh550c-seg').length : -1; const inputs = card ? card.querySelectorAll('.dsh550c-input').length : -1; const titles = card ? [...card.querySelectorAll('.dsh550c-row-title')].map((n) => n.textContent.trim()) : []; return JSON.stringify({rows, segs, inputs, titles, len: card ? card.innerText.length : -1}) })()")

console.log('tab 开机动画 click:', await clickTab('550C 开机动画'))
await sleep(1200)
console.log('tab 开机动画   :', await readTab())
console.log('tab UEG click :', await clickTab('UEG 登录界面'))
await sleep(1200)
console.log('tab UEG       :', await readTab())
console.log('tab 外观 click:', await clickTab('外观'))
await sleep(900)
console.log('tab 外观      :', await readTab())

console.log('errors :', errors.length ? JSON.stringify(errors.slice(0, 6), null, 1) : '(none containing 550c)')

browser.kill()
