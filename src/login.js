/**
 * The login / access-authorization phase — the middle act of this plugin.
 *
 *   boot (src/show.js)  →  LOGIN (this file)  →  the real UI
 *
 * Two themes share one timeline:
 *
 *   ueg   — UEG 联合政府：暖白、全息、官样文书
 *   550c  — 550C 控制终端：磷光 CRT；配色跟随设置里已选的磷光方案
 *
 * MOTION, not slides. The first version swapped text and called it a login; it read
 * as a slide deck because nothing moved. The animation vocabulary here is ported
 * from `6shenhonghong9/dsh-startup-screen` (MIT © 沈宏宏) — see CREDITS.md:
 *
 *   over-exposure wash   the screen blows out to white, then settles on the board
 *   letter-spacing draw  the title tightens as it fades in, with a light sweep
 *   clip-path wipes      every line is wiped on, left to right or top to bottom
 *   bloom + streak       a ring blooms and a streak crosses on each step change
 *   scan line            a thin bright line sweeps the whole screen, always running
 *   stroke-draw mark     the emblem is an SVG path drawn by stroke-dashoffset
 *   chromatic glitch     the finale duplicates the text twice, blurs 0.5px and
 *                        slices it with clip-path in steps(3) — so it reads as a
 *                        lens aberration rather than three copies of a word
 *
 * The acts are driven by CLASSES and every animation is declared in CSS. That is the
 * whole trick: JS decides *when*, CSS decides *how*, and nothing is a hard cut.
 *
 * No bundled media: TTS for speech, WebAudio for the blips.
 */

const LOGIN_KEY = 'dsh-550c-boot:login'
const LOGIN_VALUES = ['off', 'ueg', '550c']
const LOGIN_USER_KEY = 'dsh-550c-boot:login-user'
const LOGIN_SPEED_KEY = 'dsh-550c-boot:login-speed'
const LOGIN_DONE_EVENT = 'dsh550c:login-done'
const LOGIN_SHEET_ID = 'dsh-550c-boot-login-sheet'

/** Per-step ceiling when there is no voice to wait for. */
const LOGIN_STEP_MS = { slow: 3400, normal: 2200, fast: 1200 }
/** How long the wash holds before the board wipes on. */
const WASH_MS = { slow: 1500, normal: 1100, fast: 750 }

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

/** An abstract emblem, drawn as one continuous path so it can be stroke-drawn. */
const EMBLEM_PATH =
  'M32 4 L58 18 L58 46 L32 60 L6 46 L6 18 Z M32 14 L18 22 L18 42 L32 50 L46 42 L46 22 Z M32 24 L32 40 M24 32 L40 32'

const LOGIN_THEMES = [
  {
    id: 'ueg',
    label: 'UEG 联合政府',
    wash: '#ffffff',
    brand: 'UEG · 联合政府 · 访问终端',
    head: 'UEG INFORMATION SYSTEM',
    vars: {
      '--bg': '#e7ebef',
      '--bg-deep': '#f7fafc',
      '--ink': '#101d29',
      '--ink-dim': '#5b6f80',
      '--accent': '#2f6fb3',
      '--line': 'rgba(16, 29, 41, 0.18)',
      '--glow': 'rgba(47, 111, 179, 0.35)',
      '--font': '"Inter", "Noto Sans SC", "Segoe UI", system-ui, sans-serif',
      '--letter': '0.10em',
      '--glitch-1': '#e8342f',
      '--glitch-2': '#1f8fd8',
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
        card: true,
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
        finale: true,
      },
    ],
  },
  {
    id: '550c',
    label: '550C 控制终端',
    wash: '#fff3d6',
    brand: '550C · CONTROL TERMINAL',
    head: '550C CONTROL TERMINAL',
    vars: {
      '--bg': '#050403',
      '--bg-deep': '#0b0906',
      '--ink': '#e8a020',
      '--ink-dim': '#8a6a24',
      '--accent': '#e8a020',
      '--line': 'rgba(232, 160, 32, 0.28)',
      '--glow': 'rgba(232, 160, 32, 0.45)',
      '--font': '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
      '--letter': '0.16em',
      '--glitch-1': '#e8342f',
      '--glitch-2': '#3fd8e0',
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
        card: true,
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
        finale: true,
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
    'body>.dsh550c-login.dsh550c-login-out{opacity:0;pointer-events:none !important}',
    '@media (prefers-reduced-motion: reduce){body>.dsh550c-login{transition:none}}',
  ].join('')
  document.head.appendChild(style)
}

/**
 * The motion sheet. Every effect the sequence uses lives here, as a named keyframe
 * plus the class that plays it — the upstream arrangement, adapted to this plugin's
 * two themes.
 */
function loginShadowCss() {
  return `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
.screen{position:absolute;inset:0;overflow:hidden;font-family:var(--font);color:var(--ink);
  background:var(--bg);-webkit-font-smoothing:antialiased}
.screen *{color:inherit}

/* ── atmosphere ─────────────────────────────────────────────────────────── */
.grain,.scanlines,.vignette{position:absolute;inset:0;pointer-events:none}
.grain{opacity:.5;background-image:
  repeating-linear-gradient(0deg,rgba(255,255,255,.020) 0 1px,transparent 1px 2px),
  repeating-linear-gradient(90deg,rgba(255,255,255,.014) 0 1px,transparent 1px 3px)}
.scanlines{background:repeating-linear-gradient(180deg,transparent 0 2px,rgba(0,0,0,.16) 2px 3px)}
.vignette{background:radial-gradient(120% 100% at 50% 50%,transparent 52%,rgba(0,0,0,.42) 100%)}
.sweep{position:absolute;top:0;bottom:0;width:34%;pointer-events:none;opacity:0;
  background:linear-gradient(100deg,transparent,var(--accent),transparent);filter:blur(2px)}
.sweep.on{animation:l-sweep 1100ms cubic-bezier(.4,0,.2,1) both}
@keyframes l-sweep{from{left:-40%;opacity:0}30%{opacity:.35}to{left:112%;opacity:0}}
.scanline{position:absolute;left:0;right:0;height:2px;top:-14%;pointer-events:none;opacity:0;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);filter:blur(.4px)}
.scanline.on{animation:l-scan 3.6s linear infinite}
@keyframes l-scan{0%{top:-14%;opacity:0}10%{opacity:.85}86%{opacity:.85}100%{top:102%;opacity:0}}

/* ── the over-exposure wash ─────────────────────────────────────────────── */
.wash{position:absolute;inset:0;pointer-events:none;background:var(--wash,#fff);opacity:0}
.wash.on{animation:l-wash 900ms cubic-bezier(.22,.9,.28,1) both}
@keyframes l-wash{0%{opacity:0}22%{opacity:1}55%{opacity:.86}100%{opacity:0}}

/* ── the board, wiped on left to right ──────────────────────────────────── */
.board{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;
  clip-path:inset(0 100% 0 0)}
.board.on{animation:l-board 900ms cubic-bezier(.16,1,.3,1) 120ms both}
@keyframes l-board{0%{opacity:0;clip-path:inset(0 100% 0 0)}12%{opacity:1}
  100%{opacity:1;clip-path:inset(0 0 0 0)}}
.frame{position:absolute;inset:26px;border:1px solid var(--line)}
.corner{position:absolute;width:22px;height:22px;border:2px solid var(--accent);opacity:0}
.board.on .corner{animation:l-fade 520ms ease-out 520ms both}
.corner.tl{top:26px;left:26px;border-right:0;border-bottom:0}
.corner.tr{top:26px;right:26px;border-left:0;border-bottom:0}
.corner.bl{bottom:26px;left:26px;border-right:0;border-top:0}
.corner.br{bottom:26px;right:26px;border-left:0;border-top:0}
@keyframes l-fade{from{opacity:0}to{opacity:1}}

.head{display:flex;justify-content:space-between;align-items:flex-start;padding:46px 58px 0;
  font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);text-transform:uppercase;
  color:var(--ink-dim);opacity:0}
.board.on .head{animation:l-fade 600ms ease-out 420ms both}
.head b{color:var(--ink);font-weight:600}
.brandline{position:absolute;left:58px;top:26px;display:flex;align-items:center;gap:12px;
  font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--ink-dim)}
.mark{width:26px;height:26px;color:var(--accent)}
.mark path{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round;
  stroke-dasharray:320;stroke-dashoffset:320}
.board.on .mark path{animation:l-draw 1500ms cubic-bezier(.5,0,.2,1) 240ms both}
@keyframes l-draw{to{stroke-dashoffset:0}}

/* ── the title: letter-spacing draws it in, the sweep glints across ──────── */
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:0 58px;
  position:relative;z-index:2}
.kicker{font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--accent);
  text-transform:uppercase;display:flex;align-items:center;gap:12px;opacity:0}
.kicker::before{content:"";width:0;height:1px;background:var(--accent)}
.step.on .kicker{animation:l-fade 420ms ease-out both}
.step.on .kicker::before{animation:l-rule 520ms cubic-bezier(.16,1,.3,1) 60ms both}
@keyframes l-rule{to{width:34px}}
h1{font-size:clamp(30px,5.4vw,62px);line-height:1.03;font-weight:600;letter-spacing:.34em;
  white-space:pre-wrap;opacity:1}
.step.on h1{animation:l-title 900ms cubic-bezier(.16,1,.3,1) both}
@keyframes l-title{0%{opacity:0;letter-spacing:.44em;filter:blur(6px)}
  55%{opacity:1;filter:blur(0)}100%{opacity:1;letter-spacing:.02em;filter:blur(0)}}
.sub{font-family:var(--mono,var(--font));font-size:clamp(11px,1.3vw,14px);letter-spacing:var(--letter);
  color:var(--ink-dim);text-transform:uppercase;min-height:1.4em;white-space:pre}
.cursor{display:inline-block;width:8px;height:1em;vertical-align:-2px;background:var(--accent);
  margin-left:4px;animation:l-blink 1s steps(1) infinite}
@keyframes l-blink{50%{opacity:0}}
ul{list-style:none;display:flex;flex-direction:column;gap:8px;font-family:var(--mono,var(--font));
  font-size:clamp(11px,1.35vw,14px);color:var(--ink-dim);letter-spacing:.04em}
li{opacity:0;clip-path:inset(0 100% 0 0)}
.step.on li{animation:l-wipe 560ms cubic-bezier(.16,1,.3,1) both}
.step.on li:nth-child(1){animation-delay:260ms}
.step.on li:nth-child(2){animation-delay:400ms}
.step.on li:nth-child(3){animation-delay:540ms}
@keyframes l-wipe{0%{opacity:0;clip-path:inset(0 100% 0 0)}60%{opacity:1}
  100%{opacity:1;clip-path:inset(0 0 0 0)}}

/* ── the identity card, wiped in as a plate ─────────────────────────────── */
.card{display:flex;flex-direction:column;gap:10px;padding:18px 20px;border:1px solid var(--line);
  background:var(--bg-deep);opacity:0;clip-path:inset(0 0 100% 0);max-width:520px;
  font-family:var(--mono,var(--font));font-size:clamp(11px,1.35vw,14px);color:var(--ink-dim)}
.card:empty{display:none}
.step.on .card{animation:l-plate 620ms cubic-bezier(.16,1,.3,1) 320ms both}
@keyframes l-plate{from{opacity:0;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}

/* ── the ring reticle: blooms on every step change, spins throughout ─────── */
.reticle{position:absolute;right:74px;bottom:74px;width:150px;height:150px;pointer-events:none;opacity:0}
.reticle.on{animation:l-fade 700ms ease-out both}
.reticle::before,.reticle::after{content:"";position:absolute;border-radius:50%}
.reticle::before{inset:0;border:1px solid var(--line)}
.reticle::after{inset:16px;border:1px dashed var(--accent);opacity:.6;animation:l-spin 11s linear infinite}
.reticle i{position:absolute;left:50%;top:-4px;width:8px;height:8px;margin-left:-4px;background:var(--accent);
  box-shadow:0 0 12px var(--glow)}
.reticle i:nth-child(2){top:auto;bottom:-4px;opacity:.6}
@keyframes l-spin{to{transform:rotate(360deg)}}
.bloom{position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:50%;
  border:1px solid var(--accent)}
.bloom.on{animation:l-bloom 900ms cubic-bezier(.2,.8,.2,1) both}
@keyframes l-bloom{0%{opacity:0;transform:scale(.08)}20%{opacity:.9;transform:scale(.42)}
  58%{opacity:.7;transform:scale(.96)}100%{opacity:0;transform:scale(1.42)}}
.streak{position:absolute;left:50%;top:50%;height:2px;background:var(--accent);opacity:0;
  transform:translate(-50%,-50%);box-shadow:0 0 18px var(--glow)}
.streak.on{animation:l-streak 1000ms cubic-bezier(.16,1,.3,1) both}
@keyframes l-streak{0%{opacity:0;width:0;height:1px}26%{opacity:1;width:62vw;height:3px}
  60%{opacity:.6;width:96vw;height:2px}100%{opacity:0;width:132vw;height:1px}}

/* ── progress pips and footer ───────────────────────────────────────────── */
.progress{display:flex;gap:10px;align-items:center}
.pip{width:28px;height:3px;background:var(--line);transform-origin:left center}
.pip.on{background:var(--accent);box-shadow:0 0 12px var(--glow);animation:l-pip 420ms ease-out both}
.pip.now{background:var(--accent);box-shadow:0 0 18px var(--glow);animation:l-pulse 1.5s ease-in-out infinite}
@keyframes l-pip{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes l-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.foot{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:0 58px 46px;
  font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--ink-dim);
  text-transform:uppercase;opacity:0}
.board.on .foot{animation:l-fade 600ms ease-out 600ms both}
.hint{color:var(--accent)}
button.skip{font:inherit;font-family:var(--mono,var(--font));letter-spacing:var(--letter);
  text-transform:uppercase;color:var(--ink);background:transparent;border:1px solid var(--line);
  padding:9px 16px;cursor:pointer;pointer-events:auto;position:relative;overflow:hidden;
  transition:border-color 180ms ease,box-shadow 180ms ease}
button.skip:hover{border-color:var(--accent);box-shadow:0 0 16px var(--glow)}
button.skip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* ── the hex waterfall ─────────────────────────────────────────────────── */
.waterfall{position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:0}
.waterfall.on{animation:l-fade 500ms ease-out both}
.waterfall i{position:absolute;top:-30%;font-family:var(--mono,var(--font));font-size:11px;line-height:1.7;
  color:var(--accent);opacity:.5;white-space:pre;animation:l-fall 1.6s linear infinite}
@keyframes l-fall{to{transform:translateY(150vh)}}

/* ── the verdict seal ──────────────────────────────────────────────────── */
.seal{position:absolute;right:74px;top:46%;border:2px solid var(--accent);color:var(--accent);
  font-family:var(--mono,var(--font));letter-spacing:var(--letter);padding:12px 18px;font-size:13px;
  text-transform:uppercase;box-shadow:0 0 30px var(--glow);opacity:0}
.seal.on{animation:l-stamp 460ms cubic-bezier(.2,1.7,.4,1) both}
@keyframes l-stamp{0%{opacity:0;transform:rotate(-14deg) scale(1.7)}60%{opacity:1}
  100%{opacity:1;transform:rotate(-8deg) scale(1)}}

/* ── the chromatic aberration, ported from upstream ────────────────────── */
.glitch{position:relative;display:inline-block}
.glitch[data-text]::before,.glitch[data-text]::after{content:attr(data-text);position:absolute;left:0;top:0;
  width:100%;opacity:0;pointer-events:none;filter:blur(.5px)}
.glitch[data-text]::before{color:var(--glitch-1)}
.glitch[data-text]::after{color:var(--glitch-2)}
.glitch.on::before{animation:l-gx 430ms steps(3,end) 2 both}
.glitch.on::after{animation:l-gy 430ms steps(3,end) 2 both}
@keyframes l-gx{0%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}
  14%{transform:translate(-3px,0);opacity:.7;clip-path:inset(6% 0 68% 0)}
  34%{transform:translate(2px,0);opacity:.5;clip-path:inset(54% 0 28% 0)}
  56%{transform:translate(-2px,0);opacity:.6;clip-path:inset(22% 0 56% 0)}
  100%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}}
@keyframes l-gy{0%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}
  14%{transform:translate(3px,0);opacity:.7;clip-path:inset(62% 0 14% 0)}
  34%{transform:translate(-2px,0);opacity:.5;clip-path:inset(8% 0 74% 0)}
  56%{transform:translate(2px,0);opacity:.6;clip-path:inset(44% 0 34% 0)}
  100%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}}
.reveal{position:absolute;inset:0;background:var(--bg);clip-path:inset(0 0 0 0);pointer-events:none}
.reveal.on{animation:l-reveal 900ms cubic-bezier(.7,0,.2,1) 260ms both}
@keyframes l-reveal{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 0 100%)}}

@media (prefers-reduced-motion: reduce){
  .sweep.on,.scanline.on,.wash.on,.board.on,.step.on *,.reticle::after,.pip.now,.waterfall i,
  .bloom.on,.streak.on,.seal.on,.glitch.on::before,.glitch.on::after,.reveal.on{animation:none !important}
  .board,.head,.foot,.kicker,h1,li,.card,.mark path,.reticle,.seal{opacity:1 !important;
    clip-path:none !important;stroke-dashoffset:0 !important}
}
`
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
  for (const [name, value] of Object.entries(theme.vars)) host.style.setProperty(name, value)
  host.style.setProperty('--wash', theme.wash)

  const shadow = host.attachShadow({ mode: 'open' })
  const sheet = document.createElement('style')
  sheet.textContent = loginShadowCss()
  shadow.appendChild(sheet)

  const element = document.createElement('div')
  element.className = 'screen'
  element.innerHTML = [
    '<div class="grain"></div>',
    '<div class="scanlines"></div>',
    '<div class="vignette"></div>',
    '<div class="scanline" data-login="scanline"></div>',
    '<div class="board" data-login="board">',
    '  <div class="frame"></div>',
    '  <div class="corner tl"></div><div class="corner tr"></div>',
    '  <div class="corner bl"></div><div class="corner br"></div>',
    '  <div class="brandline">',
    '    <svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><path d="' + EMBLEM_PATH + '"></path></svg>',
    '    <span data-login="brand"></span>',
    '  </div>',
    '  <div class="head"><span data-login="head-left"></span><b data-login="head-right"></b></div>',
    '  <div class="body">',
    '    <div class="step" data-login="step">',
    '      <div class="kicker" data-login="kicker"></div>',
    '      <h1 class="glitch" data-login="main"></h1>',
    '      <div class="sub"><span data-login="sub"></span><span class="cursor"></span></div>',
    '      <div class="card" data-login="card"></div>',
    '      <ul data-login="detail"></ul>',
    '      <div class="progress" data-login="progress"></div>',
    '    </div>',
    '  </div>',
    '  <div class="foot">',
    '    <span data-login="foot-left"></span>',
    '    <span class="hint" data-login="action"></span>',
    '    <button class="skip" type="button" data-login="skip">跳过 / SKIP</button>',
    '  </div>',
    '</div>',
    '<div class="reticle" data-login="reticle"><i></i><i></i><span class="bloom" data-login="bloom"></span></div>',
    '<div class="streak" data-login="streak"></div>',
    '<div class="waterfall" data-login="waterfall"></div>',
    '<div class="seal" data-login="seal"></div>',
    '<div class="sweep" data-login="sweep"></div>',
    '<div class="wash" data-login="wash"></div>',
    '<div class="reveal" data-login="reveal"></div>',
  ].join('')
  shadow.appendChild(element)

  const ui = {}
  for (const node of element.querySelectorAll('[data-login]')) ui[node.dataset.login] = node

  const ticket = String(Math.floor(Math.random() * 900000) + 100000)
  const clearance = readLoginPref('dsh-550c-boot:login-clearance', 'LEVEL-2 / 观察员')
  const fill = (text) =>
    String(text).replaceAll('{user}', user).replaceAll('{clearance}', clearance).replaceAll('{ticket}', ticket)

  ui.brand.textContent = theme.brand
  ui['head-left'].textContent = theme.head
  ui['head-right'].textContent = new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z'
  ui['foot-left'].textContent = theme.id === 'ueg' ? '授权范围：本机会话' : 'SESSION LOCAL ONLY'

  let index = -1
  let timer = null
  let typed = []
  let finished = false
  let disposed = false
  let audio = null

  const record = {
    dispose() {
      disposed = true
      finished = true
      stopTimers()
      stopVoice()
      document.removeEventListener('keydown', onKey, true)
      host.remove()
      if (liveLogin === record) liveLogin = null
    },
  }

  function stopTimers() {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    for (const id of typed) window.clearTimeout(id)
    typed = []
  }

  function stopVoice() {
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* no speech API */
    }
  }

  function blip(frequency, durationMs) {
    try {
      audio ??= new (window.AudioContext ?? window.webkitAudioContext)()
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = theme.id === 'ueg' ? 'sine' : 'square'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.05
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + durationMs / 1000)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start()
      oscillator.stop(audio.currentTime + durationMs / 1000)
    } catch {
      /* audio is a bonus */
    }
  }

  /** Play a one-shot animation by class, restarting it if it is already running. */
  function play(role, className = 'on') {
    const node = ui[role]
    if (node === undefined) return
    node.classList.remove(className)
    void node.offsetWidth
    node.classList.add(className)
  }

  const stepMs = () => LOGIN_STEP_MS[speedId] ?? LOGIN_STEP_MS.normal

  function typeSubtitle(text) {
    ui.sub.textContent = ''
    for (let position = 0; position < text.length; position += 1) {
      typed.push(
        window.setTimeout(
          () => {
            ui.sub.textContent = text.slice(0, position + 1)
          },
          position * (theme.id === 'ueg' ? 20 : 30),
        ),
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
    ui.main.dataset.text = fill(step.main)
    typeSubtitle(step.sub)
    ui.detail.textContent = ''
    for (const line of step.detail) {
      const item = document.createElement('li')
      item.textContent = fill(line)
      ui.detail.appendChild(item)
    }
    ui.card.textContent = ''
    ui.detail.style.display = step.card === true ? 'none' : ''
    if (step.card === true) {
      for (const line of step.detail) {
        const row = document.createElement('div')
        row.textContent = fill(line)
        ui.card.appendChild(row)
      }
    }
    ui.action.textContent = step.action === null ? '' : fill(step.action) + ' ▸'
    ui.progress.textContent = ''
    for (let position = 0; position < theme.steps.length; position += 1) {
      const pip = document.createElement('span')
      pip.className = position < index ? 'pip on' : position === index ? 'pip now' : 'pip'
      ui.progress.appendChild(pip)
    }

    // Every step plays the same motion kit. The class is removed and re-added so the
    // CSS animation restarts even when the same step is painted twice.
    ui.step.classList.remove('on')
    void ui.step.offsetWidth
    ui.step.classList.add('on')

    ui.waterfall.textContent = ''
    ui.waterfall.classList.toggle('on', step.waterfall === true)
    if (step.waterfall === true) {
      for (let column = 0; column < 7; column += 1) {
        const stream = document.createElement('i')
        stream.style.left = String(6 + column * 13) + '%'
        stream.style.animationDelay = String(column * 0.17) + 's'
        let dump = ''
        for (let row = 0; row < 16; row += 1) {
          dump += Math.floor(Math.random() * 65535)
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')
          dump += '\n'
        }
        stream.textContent = dump
        ui.waterfall.appendChild(stream)
      }
    }

    play('bloom')
    play('streak')
    play('sweep')
    if (step.seal === true) {
      ui.seal.textContent = theme.id === 'ueg' ? '核验通过 · VERIFIED' : 'VERIFIED'
      play('seal')
    }
    blip(theme.id === 'ueg' ? 620 : 880, 90)
  }

  function advance() {
    stopTimers()
    index += 1
    if (index >= theme.steps.length) {
      finish()
      return
    }
    present()
  }

  function speak(text, onDone) {
    if (typeof window.SpeechSynthesisUtterance !== 'function') {
      timer = window.setTimeout(onDone, stepMs())
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
      timer = window.setTimeout(settle, stepMs() * 4)
      window.speechSynthesis.speak(utterance)
    } catch {
      timer = window.setTimeout(onDone, stepMs())
    }
  }

  function present() {
    const step = theme.steps[index]
    paint()
    if (step.finale === true) {
      // The finale glitches, then the curtain wipes away.
      play('main', 'on')
      speak(fill(step.say), () => {
        play('main', 'on')
        timer = window.setTimeout(finish, 900)
      })
      return
    }
    speak(fill(step.say), advance)
  }

  function hurry() {
    if (finished) return
    stopVoice()
    advance()
  }

  function skip() {
    if (finished) return
    stopTimers()
    stopVoice()
    index = theme.steps.length - 1
    paint()
    timer = window.setTimeout(finish, 520)
  }

  function finish() {
    if (finished) return
    finished = true
    stopTimers()
    document.removeEventListener('keydown', onKey, true)
    play('reveal')
    host.classList.add('dsh550c-login-out')
    timer = window.setTimeout(() => {
      record.dispose()
      document.dispatchEvent(new CustomEvent(LOGIN_DONE_EVENT, { detail: { theme: theme.id } }))
    }, 560)
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

  /** Act 0: the wash blows out, the board wipes on underneath it. */
  function start() {
    play('wash')
    play('sweep')
    timer = window.setTimeout(
      () => {
        play('board')
        play('scanline')
        play('reticle')
        timer = window.setTimeout(advance, Math.round(stepMs() * 0.35))
      },
      Math.round((WASH_MS[speedId] ?? WASH_MS.normal) * 0.55),
    )
  }

  document.body.appendChild(host)
  start()
  liveLogin = record
  return record
}

/** The settings row: which login screen, speed, operator name and a preview. */
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
        '片头之后先走一段访问授权：过曝洗白 → 底板擦出 → 五步授权 → 色散揭幕；点击或 Enter 推进，Esc 跳过。',
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
