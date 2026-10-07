/**
 * The login / access-authorization phase — the middle act of this plugin.
 *
 *   boot (src/show.js)  →  LOGIN (this file)  →  the real UI
 *
 * Two themes share one state machine:
 *
 *   ueg   — UEG 联合政府：暖白、全息、官样文书
 *   550c  — 550C 控制终端：磷光 CRT；配色跟随设置里已选的磷光方案
 *
 * Interaction rules, all of them learned from the sibling implementations:
 *
 *   - The first step is a click gate. Browsers refuse to start speech without a
 *     user gesture, and the flow is paced by speech, so something has to be
 *     clicked before anything can advance.
 *   - A step is held by the *voice*, not by a timer: `speechSynthesis.onend`
 *     advances when the line is actually over, and clicking merely hurries it.
 *   - Esc (or the skip button) leaves immediately, and every path ends in the
 *     same fade — a broken voice or a missing API can never trap anyone.
 *   - No bundled media: TTS for speech, WebAudio for the blips. See CREDITS.md.
 *
 * Declarations the app must not be able to override live in the document-level
 * sheet below with `!important`, because a document rule outranks `:host` — the
 * same reason the splash declares its own geometry there.
 */

const LOGIN_KEY = 'dsh-550c-boot:login'
const LOGIN_VALUES = ['off', 'ueg', '550c']
const LOGIN_USER_KEY = 'dsh-550c-boot:login-user'
const LOGIN_SPEED_KEY = 'dsh-550c-boot:login-speed'
const LOGIN_DONE_EVENT = 'dsh550c:login-done'
const LOGIN_SHEET_ID = 'dsh-550c-boot-login-sheet'

/** Per-step ceiling when there is no voice to wait for. */
const LOGIN_STEP_MS = { slow: 2600, normal: 1500, fast: 800 }

const LOGIN_SPEEDS = [
  { id: 'slow', label: '慢' },
  { id: 'normal', label: '标准' },
  { id: 'fast', label: '快' },
]

/** The four phosphor schemes, mirroring the splash so the two read as one machine. */
const LOGIN_SCHEMES = {
  amber: { ink: '#e8a020', dim: '#8a6a24', bg: '#050403', deep: '#0b0906' },
  green: { ink: '#3ddc84', dim: '#25764a', bg: '#030604', deep: '#08120c' },
  cyan: { ink: '#3fd8e0', dim: '#1f6f76', bg: '#020607', deep: '#07131a' },
  white: { ink: '#e8eef4', dim: '#8b98a6', bg: '#04050a', deep: '#0b0f18' },
}

const LOGIN_THEMES = [
  {
    id: 'ueg',
    label: 'UEG 联合政府',
    vars: {
      '--bg': '#eef1f4',
      '--bg-deep': '#dfe5ea',
      '--ink': '#12212e',
      '--ink-dim': '#5b6f80',
      '--accent': '#2f6fb3',
      '--line': 'rgba(18, 33, 46, 0.16)',
      '--glow': 'rgba(47, 111, 179, 0.35)',
      '--font': '"Inter", "Noto Sans SC", "Segoe UI", system-ui, sans-serif',
      '--letter': '0.08em',
    },
    steps: [
      {
        main: '需要访问许可',
        sub: 'ACCESS PERMISSION REQUIRED',
        say: '需要访问许可。',
        detail: ['本终端受 UEG 联合政府信息系统管辖', '继续操作即表示你已阅读并同意访问条款'],
        action: '点击以继续',
      },
      {
        main: '身份资料确认',
        sub: 'IDENTITY VERIFICATION',
        say: '身份资料确认。',
        detail: ['姓名：{user}', '权限等级：{clearance}', '凭据来源：本机 profile'],
        action: '确认',
      },
      {
        main: '接收访问需求',
        sub: 'ACCESS REQUEST RECEIVED',
        say: '已接收访问需求。',
        detail: ['需求编号：{ticket}', '受理节点：550C 控制终端', '正在分配核验通道'],
        action: null,
      },
      {
        main: '开始读取权限',
        sub: 'PERMISSION READ STARTED',
        say: '开始读取权限。',
        detail: ['逐项比对授权清单', '只读取本机 DSH 会话所需的权限'],
        action: null,
        waterfall: true,
      },
      {
        main: '读取完毕 · 核验通过',
        sub: 'READ COMPLETE · VERIFIED',
        say: '读取完毕，核验通过。',
        detail: ['授权范围已写入本机会话', '欢迎访问，{user}'],
        action: null,
        seal: true,
      },
    ],
  },
  {
    id: '550c',
    label: '550C 控制终端',
    vars: {
      '--bg': '#050403',
      '--bg-deep': '#0b0906',
      '--ink': '#e8a020',
      '--ink-dim': '#8a6a24',
      '--accent': '#e8a020',
      '--line': 'rgba(232, 160, 32, 0.28)',
      '--glow': 'rgba(232, 160, 32, 0.45)',
      '--font': '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
      '--letter': '0.14em',
    },
    steps: [
      {
        main: '550C · POST',
        sub: 'POWER ON SELF TEST',
        say: '五百五十C，开机自检完成，等待操作员接入。',
        detail: ['内存校验 …………… OK', '光路阵列 …………… OK', '等待操作员接入'],
        action: '点击以接入',
      },
      {
        main: '操作员身份',
        sub: 'OPERATOR IDENTITY',
        say: '请确认操作员身份。',
        detail: ['操作员：{user}', '权限：{clearance}', '工作站：本机 DSH profile'],
        action: '确认',
      },
      {
        main: '接入请求已受理',
        sub: 'REQUEST ACCEPTED',
        say: '接入请求已受理。',
        detail: ['工单：{ticket}', '通道：550C-0', '正在装载授权表'],
        action: null,
      },
      {
        main: '读取授权表',
        sub: 'READING PERMISSION TABLE',
        say: '正在读取授权表。',
        detail: ['逐扇区比对', '不写入任何未授权区域'],
        action: null,
        waterfall: true,
      },
      {
        main: '核验通过',
        sub: 'VERIFIED',
        say: '核验通过。欢迎回来。',
        detail: ['会话已建立', '欢迎回来，{user}'],
        action: null,
        seal: true,
      },
    ],
  },
]

function readLoginScreen() {
  try {
    const raw = window.localStorage.getItem(LOGIN_KEY)
    return LOGIN_VALUES.includes(raw) ? raw : 'off'
  } catch {
    return 'off'
  }
}

function writeLoginScreen(screen) {
  try {
    window.localStorage.setItem(LOGIN_KEY, LOGIN_VALUES.includes(screen) ? screen : 'off')
  } catch {
    /* private mode */
  }
}

function readLoginPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null || raw === '' ? fallback : raw
  } catch {
    return fallback
  }
}

function writeLoginPref(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    /* private mode */
  }
}

function loginTheme(id, schemeId) {
  const theme = LOGIN_THEMES.find((candidate) => candidate.id === id) ?? LOGIN_THEMES[0]
  if (theme.id !== '550c') return theme
  const scheme = LOGIN_SCHEMES[schemeId] ?? LOGIN_SCHEMES.amber
  return {
    ...theme,
    vars: {
      ...theme.vars,
      '--bg': scheme.bg,
      '--bg-deep': scheme.deep,
      '--ink': scheme.ink,
      '--ink-dim': scheme.dim,
      '--accent': scheme.ink,
      '--line': scheme.ink + '47',
      '--glow': scheme.ink + '73',
    },
  }
}

function ensureLoginSheet() {
  if (document.getElementById(LOGIN_SHEET_ID) !== null) return
  const style = document.createElement('style')
  style.id = LOGIN_SHEET_ID
  style.textContent = [
    'body>.dsh550c-login{position:fixed !important;inset:0 !important;z-index:2147483085 !important;',
    'background:var(--bg,#050403) !important;pointer-events:auto !important;opacity:1;',
    'transition:opacity 420ms cubic-bezier(.4,0,.2,1)}',
    'body>.dsh550c-login.dsh550c-login-out{opacity:0;pointer-events:none !important;',
    'transition:opacity 420ms cubic-bezier(.4,0,.2,1)}',
    'body>.dsh550c-login-cover{position:fixed !important;inset:0 !important;',
    'z-index:2147483080 !important;background:#050403 !important;pointer-events:none !important}',
    '@media (prefers-reduced-motion: reduce){body>.dsh550c-login{transition:none}}',
  ].join('')
  document.head.appendChild(style)
}

function loginShadowCss() {
  return [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    '.screen{position:absolute;inset:0;display:flex;flex-direction:column;font-family:var(--font);',
    'color:var(--ink);background:radial-gradient(120% 90% at 50% 0%,var(--bg-deep) 0%,var(--bg) 62%),var(--bg);overflow:hidden}',
    '.scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(180deg,transparent 0 2px,rgba(0,0,0,.045) 2px 3px)}',
    '.vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 100% at 50% 50%,transparent 55%,rgba(0,0,0,.30) 100%)}',
    '.frame{position:absolute;inset:22px;border:1px solid var(--line);pointer-events:none}',
    '.corner{position:absolute;width:18px;height:18px;border:2px solid var(--accent);opacity:.7}',
    '.corner.tl{top:22px;left:22px;border-right:0;border-bottom:0}',
    '.corner.tr{top:22px;right:22px;border-left:0;border-bottom:0}',
    '.corner.bl{bottom:22px;left:22px;border-right:0;border-top:0}',
    '.corner.br{bottom:22px;right:22px;border-left:0;border-top:0}',
    '.brand{position:absolute;left:56px;top:44px;display:flex;align-items:center;gap:12px;',
    'font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--ink-dim)}',
    '.mark{width:22px;height:22px;border:1px solid var(--accent);position:relative}',
    '.mark::before{content:"";position:absolute;inset:5px;background:var(--accent);opacity:.85}',
    '.head{display:flex;justify-content:space-between;padding:44px 56px 0;font-family:var(--mono,var(--font));',
    'font-size:11px;letter-spacing:var(--letter);text-transform:uppercase;color:var(--ink-dim)}',
    '.head b{color:var(--ink);font-weight:600}',
    '.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:0 56px}',
    '.kicker{font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);',
    'color:var(--accent);text-transform:uppercase;display:flex;align-items:center;gap:10px}',
    '.kicker::before{content:"";width:26px;height:1px;background:var(--accent);display:inline-block}',
    'h1{font-size:clamp(28px,5vw,58px);line-height:1.05;font-weight:600;letter-spacing:.02em}',
    '.sub{font-family:var(--mono,var(--font));font-size:clamp(11px,1.3vw,14px);letter-spacing:var(--letter);',
    'color:var(--ink-dim);text-transform:uppercase;min-height:1.4em}',
    'ul{list-style:none;display:flex;flex-direction:column;gap:7px;font-family:var(--mono,var(--font));',
    'font-size:clamp(11px,1.35vw,14px);color:var(--ink-dim);letter-spacing:.04em}',
    '.progress{display:flex;gap:9px;align-items:center}',
    '.pip{width:26px;height:3px;background:var(--line)}',
    '.pip.on{background:var(--accent);box-shadow:0 0 12px var(--glow)}',
    '.pip.now{background:var(--accent);box-shadow:0 0 18px var(--glow);animation:pulse 1.4s ease-in-out infinite}',
    '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}',
    '.foot{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:0 56px 44px;',
    'font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--ink-dim);text-transform:uppercase}',
    '.hint{color:var(--accent)}',
    'button.skip{font:inherit;font-family:var(--mono,var(--font));letter-spacing:var(--letter);',
    'text-transform:uppercase;color:var(--ink);background:transparent;border:1px solid var(--line);',
    'padding:8px 14px;cursor:pointer;pointer-events:auto}',
    'button.skip:hover{border-color:var(--accent);box-shadow:0 0 14px var(--glow)}',
    'button.skip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    '.ring{position:absolute;right:64px;bottom:64px;width:130px;height:130px;pointer-events:none;',
    'border:1px solid var(--line);border-radius:50%;opacity:.85}',
    '.ring::before{content:"";position:absolute;inset:14px;border:1px dashed var(--accent);',
    'border-radius:50%;opacity:.55;animation:spin 9s linear infinite}',
    '.ring::after{content:"";position:absolute;left:50%;top:-3px;width:6px;height:6px;margin-left:-3px;',
    'background:var(--accent);box-shadow:0 0 10px var(--glow)}',
    '@keyframes spin{to{transform:rotate(360deg)}}',
    '.waterfall{position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:.5}',
    '.waterfall i{position:absolute;top:-12%;font-family:var(--mono,var(--font));font-size:11px;line-height:1.7;',
    'color:var(--accent);opacity:.55;white-space:pre;animation:fall 1.5s linear infinite}',
    '@keyframes fall{to{transform:translateY(120vh)}}',
    '.seal{position:absolute;right:64px;top:50%;transform:translateY(-50%) rotate(-8deg);',
    'border:2px solid var(--accent);color:var(--accent);font-family:var(--mono,var(--font));',
    'letter-spacing:var(--letter);padding:10px 16px;font-size:13px;text-transform:uppercase;',
    'box-shadow:0 0 26px var(--glow);animation:stamp 320ms cubic-bezier(.2,1.6,.4,1)}',
    '@keyframes stamp{from{transform:translateY(-50%) rotate(-8deg) scale(1.6);opacity:0}}',
    '@media (prefers-reduced-motion: reduce){.ring::before,.pip.now,.waterfall i{animation:none}}',
  ].join('')
}

let liveLogin = null

/**
 * Mount the login phase. Returns a disposer, or null when it is switched off.
 * `force` is what the settings preview button uses.
 */
function mountLoginGate(force) {
  if (liveLogin !== null) return liveLogin

  const screen = force ?? readLoginScreen()
  if (screen === 'off') return null

  ensureLoginSheet()

  const schemeId = readScheme()
  const theme = loginTheme(screen, schemeId)
  const speedId = LOGIN_SPEEDS.some((candidate) => candidate.id === readLoginPref(LOGIN_SPEED_KEY, 'normal'))
    ? readLoginPref(LOGIN_SPEED_KEY, 'normal')
    : 'normal'
  const user = readLoginPref(LOGIN_USER_KEY, '操作员')

  const host = document.createElement('div')
  host.className = 'dsh550c-login'
  host.dataset.dsh550cLogin = ''
  host.setAttribute('aria-hidden', 'true')
  // Declared on the element: the app defines its own tokens on `body`, and a
  // closer ancestor always wins — so a :root rule would never reach here.
  for (const [name, value] of Object.entries(theme.vars)) host.style.setProperty(name, value)

  const shadow = host.attachShadow({ mode: 'open' })
  const sheet = document.createElement('style')
  sheet.textContent = loginShadowCss()
  shadow.appendChild(sheet)

  const element = document.createElement('div')
  element.className = 'screen'
  element.innerHTML = [
    '<div class="scan"></div>',
    '<div class="vignette"></div>',
    '<div class="frame"></div>',
    '<div class="corner tl"></div><div class="corner tr"></div>',
    '<div class="corner bl"></div><div class="corner br"></div>',
    '<div class="brand"><span class="mark"></span><span data-login="brand"></span></div>',
    '<div class="head"><span data-login="head-left"></span><b data-login="head-right"></b></div>',
    '<div class="body">',
    '<div class="kicker" data-login="kicker"></div>',
    '<h1 data-login="main"></h1>',
    '<div class="sub" data-login="sub"></div>',
    '<ul data-login="detail"></ul>',
    '<div class="progress" data-login="progress"></div>',
    '</div>',
    '<div class="foot">',
    '<span data-login="foot-left"></span>',
    '<span class="hint" data-login="action"></span>',
    '<button class="skip" type="button" data-login="skip">跳过 / SKIP</button>',
    '</div>',
    '<div class="waterfall" data-login="waterfall"></div>',
  ].join('')
  shadow.appendChild(element)

  const ui = {}
  for (const node of element.querySelectorAll('[data-login]')) ui[node.dataset.login] = node

  const stage = element.querySelector('.waterfall')
  const ticket = String(Math.floor(Math.random() * 900000) + 100000)
  const clearance = readLoginPref('dsh-550c-boot:login-clearance', 'LEVEL-2 / 观察员')
  const fill = (text) =>
    String(text).replaceAll('{user}', user).replaceAll('{clearance}', clearance).replaceAll('{ticket}', ticket)

  ui.brand.textContent = theme.id === 'ueg' ? 'UEG · 联合政府 · 访问终端' : '550C · CONTROL TERMINAL'
  ui['head-left'].textContent = theme.id === 'ueg' ? 'UEG INFORMATION SYSTEM' : '550C CONTROL TERMINAL'
  ui['head-right'].textContent = new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z'
  ui['foot-left'].textContent = theme.id === 'ueg' ? '授权范围：本机会话' : 'SESSION LOCAL ONLY'

  let index = 0
  let timer = null
  let typed = []
  let finished = false
  let disposed = false
  let audio = null

  const record = {
    dispose() {
      disposed = true
      finished = true
      stopTimer()
      stopVoice()
      document.removeEventListener('keydown', onKey, true)
      host.remove()
      if (liveLogin === record) liveLogin = null
    },
  }

  function stopTimer() {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    for (const id of typed) window.clearTimeout(id)
    typed = []
  }

  function stopVoice() {
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* no speech API: nothing to stop */
    }
  }

  /** Synthesized blip: the package carries no audio assets. */
  function blip(frequency, durationMs) {
    try {
      audio ??= new (window.AudioContext ?? window.webkitAudioContext)()
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = theme.id === 'ueg' ? 'sine' : 'square'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.045
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + durationMs / 1000)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start()
      oscillator.stop(audio.currentTime + durationMs / 1000)
    } catch {
      /* audio is a bonus */
    }
  }

  function typeSubtitle(text) {
    ui.sub.textContent = ''
    for (let position = 0; position < text.length; position += 1) {
      typed.push(
        window.setTimeout(() => {
          ui.sub.textContent = text.slice(0, position + 1)
        }, position * (theme.id === 'ueg' ? 18 : 26)),
      )
    }
  }

  function paint() {
    const step = theme.steps[index]
    ui.kicker.textContent =
      index === 0 && theme.id === 'ueg'
        ? '访问授权 / ACCESS CONTROL'
        : 'STEP ' + String(index + 1) + ' / ' + String(theme.steps.length)
    ui.main.textContent = fill(step.main)
    typeSubtitle(step.sub)
    ui.detail.textContent = ''
    for (const line of step.detail) {
      const item = document.createElement('li')
      item.textContent = fill(line)
      ui.detail.appendChild(item)
    }
    ui.action.textContent = step.action === null ? '' : fill(step.action) + ' ▸'
    ui.progress.textContent = ''
    for (let position = 0; position < theme.steps.length; position += 1) {
      const pip = document.createElement('span')
      pip.className = position < index ? 'pip on' : position === index ? 'pip now' : 'pip'
      ui.progress.appendChild(pip)
    }
    stage.textContent = ''
    if (step.waterfall === true) {
      for (let column = 0; column < 7; column += 1) {
        const stream = document.createElement('i')
        stream.style.left = String(6 + column * 13) + '%'
        stream.style.animationDelay = String(column * 0.17) + 's'
        let dump = ''
        for (let row = 0; row < 14; row += 1) {
          dump += Math.floor(Math.random() * 65535)
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')
          dump += '\n'
        }
        stream.textContent = dump
        stage.appendChild(stream)
      }
    }
    if (step.seal === true) {
      const seal = document.createElement('div')
      seal.className = 'seal'
      seal.textContent = theme.id === 'ueg' ? '核验通过 · VERIFIED' : 'VERIFIED'
      element.appendChild(seal)
    }
    blip(theme.id === 'ueg' ? 660 : 880, 90)
  }

  function advance() {
    stopTimer()
    index += 1
    if (index >= theme.steps.length) {
      finish()
      return
    }
    present()
  }

  function speak(text, onDone) {
    if (typeof window.SpeechSynthesisUtterance !== 'function') {
      timer = window.setTimeout(onDone, LOGIN_STEP_MS[speedId] ?? LOGIN_STEP_MS.normal)
      return
    }
    try {
      const utterance = new window.SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = speedId === 'slow' ? 0.9 : speedId === 'fast' ? 1.25 : 1.05
      let settled = false
      const settle = () => {
        if (settled || disposed) return
        settled = true
        onDone()
      }
      utterance.onend = settle
      utterance.onerror = settle
      // A voice that never fires onend must not freeze the gate.
      timer = window.setTimeout(settle, (LOGIN_STEP_MS[speedId] ?? LOGIN_STEP_MS.normal) * 4)
      window.speechSynthesis.speak(utterance)
    } catch {
      timer = window.setTimeout(onDone, LOGIN_STEP_MS[speedId] ?? LOGIN_STEP_MS.normal)
    }
  }

  function present() {
    paint()
    speak(fill(theme.steps[index].say), advance)
  }

  /** Click / Enter: stop the voice and move on now. */
  function hurry() {
    if (finished) return
    stopVoice()
    advance()
  }

  function skip() {
    if (finished) return
    stopTimer()
    stopVoice()
    index = theme.steps.length - 1
    paint()
    timer = window.setTimeout(finish, 420)
  }

  function finish() {
    if (finished) return
    finished = true
    stopTimer()
    document.removeEventListener('keydown', onKey, true)
    host.classList.add('dsh550c-login-out')
    timer = window.setTimeout(() => {
      record.dispose()
      document.dispatchEvent(new CustomEvent(LOGIN_DONE_EVENT, { detail: { theme: theme.id } }))
    }, 430)
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      skip()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      hurry()
    }
  }

  document.addEventListener('keydown', onKey, true)
  host.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button.skip') !== null) return
    hurry()
  })
  ui.skip.addEventListener('click', (event) => {
    event.stopPropagation()
    skip()
  })

  document.body.appendChild(host)
  present()
  liveLogin = record
  return record
}

/** The settings row: which login screen, and a preview button. */
function LoginRow() {
  const [screen, setScreen] = React.useState(readLoginScreen)
  const [speed, setSpeed] = React.useState(() => readLoginPref(LOGIN_SPEED_KEY, 'normal'))
  const [user, setUser] = React.useState(() => readLoginPref(LOGIN_USER_KEY, ''))
  const choose = (next) => {
    writeLoginScreen(next)
    setScreen(readLoginScreen())
  }
  const chooseSpeed = (next) => {
    writeLoginPref(LOGIN_SPEED_KEY, next)
    setSpeed(next)
  }
  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '登录授权界面'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        '片头之后先走一段访问授权：点击或 Enter 推进，Esc 跳过；语音与音效在本机生成，不带素材。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        [{ value: 'off', label: '关闭' }, ...LOGIN_THEMES.map((theme) => ({ value: theme.id, label: theme.label.split(' ')[0] }))].map((option) =>
          React.createElement(
            'button',
            {
              key: option.value,
              type: 'button',
              className: screen === option.value ? 'on' : '',
              onClick: () => choose(option.value),
            },
            option.label,
          ),
        ),
      ),
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        LOGIN_SPEEDS.map((option) =>
          React.createElement(
            'button',
            {
              key: option.id,
              type: 'button',
              className: speed === option.id ? 'on' : '',
              onClick: () => chooseSpeed(option.id),
            },
            option.label,
          ),
        ),
      ),
      React.createElement('input', {
        className: 'dsh550c-input',
        type: 'text',
        placeholder: '操作员姓名',
        value: user,
        onChange: (event) => {
          setUser(event.target.value)
          writeLoginPref(LOGIN_USER_KEY, event.target.value)
        },
      }),
      React.createElement(
        'button',
        { type: 'button', className: 'dsh550c-preview', onClick: () => mountLoginGate(screen === 'off' ? 'ueg' : screen) },
        '预览',
      ),
    ),
  )
}

/**
 * The phase hook the splash calls when it has finished fading out: this is what
 * keeps the two acts from overlapping. Safe to call when nothing is enabled.
 */
function startLoginPhase() {
  if (liveLogin !== null) return
  mountLoginGate(null)
  document.dispatchEvent(new CustomEvent('dsh550c:boot-done'))
}
