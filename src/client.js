/**
 * dsh-550c-boot — browser half.
 *
 * Two surfaces:
 *
 *   the splash            mounted IMPERATIVELY from apply(), not through a slot
 *                         — see mountOverlay() for why that matters
 *   settings.general.item  the 关闭 / 简易 / 完整 row, next to Appearance
 *
 * The row is a plain React element (createElement, no JSX: the client loader
 * hands this module `require`, and `react` is one of the externals it resolves —
 * the same shape tsdown emits for the published client plugins). The splash is
 * plain DOM in a shadow root, so the original page's generic class names
 * (.w, .ln, .dt) cannot leak into DSH's own UI.
 *
 * The show plays once per client boot. `#app`'s markup is only mounted in full
 * mode, and the splash never waits for anything: it plays to the end and then
 * fades, whatever state the app behind it is in.
 */

const React = require('react')

const MODE_KEY = 'dsh-550c-boot:mode'
const MODE_VALUES = ['off', 'simple', 'full']
const DEFAULT_MODE = 'simple'
const SCHEME_KEY = 'dsh-550c-boot:scheme'
/** Amber is the original author's palette and the default: choosing it clears
 *  the data-scheme attribute entirely, so nothing is overridden. */
const SCHEME_VALUES = ['amber', 'green', 'cyan', 'white']
const DEFAULT_SCHEME = 'amber'
/** Skip token: thrown through the show's awaits when the user skips. */
const CANCELLED = Symbol('dsh-550c-cancelled')
/** How long the whole hand-off takes: the content fade (200 ms) plus the delay
 *  and the backdrop fade (200 + 420 ms). Must match :host(.dsh550c-out). */
const FADE_MS = 620
const ROW_STYLE_ID = 'dsh-550c-boot-row-style'
/** Handshake with the host half's first frame (see endFirstFrame + lib/index.js). */
const FIRST_FRAME_GLOBAL = '__dsh550cFirstFrame'
/** The host half's injected version (see lib/index.js VERSION_GLOBAL). */
const VERSION_GLOBAL = '__dsh550cVersion'

/**
 * 片头时长的兜底值（毫秒）。这两个数不是拍的，也不是"哪个环境都能用"：
 *
 *   完整档  Web 端实测 14010ms、桌面端 17000ms
 *           （同一个 bundle、同一份 CSS；差在窗口合成开销与 preload 的标题栏重测）
 *   简易档  两端都约 3590ms（实测 3587）
 *
 * 所以常量只当兜底：先按 dataset.platform 选载体，首次播完再把实测值写进
 * localStorage，下次直接用实测值 —— 写死一边必然另一边偏（0.5.1 的教训）。
 */
const SPLASH_MS = {
  simple: { web: 3590, desktop: 3590 },
  full: { web: 14010, desktop: 17000 },
}
/** 实测时长的存储键前缀；完整键名 = 前缀 + 档位。 */
const SPLASH_MS_KEY_PREFIX = 'dsh-550c-boot:splash-ms:'
/** 只接受这个区间内的实测值：太小是跳过/异常，太大是看门狗，都不是"播完"。 */
const SPLASH_MS_MIN = 1000
const SPLASH_MS_MAX = 60000

/** 桌面端才有 data-platform（Electron preload 写的），浏览器标签里没有。 */
function meteredSplashMsDesktop() {
  const platform = document.documentElement.dataset.platform
  return platform !== undefined && platform !== ''
}

/** 读片头时长：上一轮实测 > 载体兜底。 */
function readSplashMs(mode) {
  const key = SPLASH_MS_KEY_PREFIX + (mode === 'full' ? 'full' : 'simple')
  try {
    const parsed = Number(window.localStorage.getItem(key))
    if (Number.isFinite(parsed) && parsed >= SPLASH_MS_MIN && parsed <= SPLASH_MS_MAX) return parsed
  } catch (error) {
    /* private mode：读不到就用兜底 */
  }
  const table = SPLASH_MS[mode] === undefined ? SPLASH_MS.simple : SPLASH_MS[mode]
  return meteredSplashMsDesktop() ? table.desktop : table.web
}

/** 写片头时长：只写合理值，写不进去就算了（下一轮继续用兜底）。 */
function rememberSplashMs(mode, measured) {
  if (!(Number.isFinite(measured) && measured >= SPLASH_MS_MIN && measured <= SPLASH_MS_MAX)) return
  const key = SPLASH_MS_KEY_PREFIX + (mode === 'full' ? 'full' : 'simple')
  try {
    window.localStorage.setItem(key, String(Math.round(measured)))
  } catch (error) {
    /* private mode：这次学到的东西不留下来 */
  }
}
/** The host half's update routes (see lib/index.js UPDATE_ROUTE / APPLY_ROUTE). */
const UPDATE_ROUTE = '/dsh-550c-boot/update'
const APPLY_ROUTE = '/dsh-550c-boot/update/apply'
/** Where the row sends anyone the check cannot help. */
const PACKAGE_URL = 'https://www.npmjs.com/package/dsh-550c-boot'
/** What to install to get a newer build; works in the in-app box and in the CLI. */
const INSTALL_SPEC = 'dsh-550c-boot@latest'
/** The host-document sheet that makes the Desktop caption strip see-through. */
const CAPTION_STYLE_ID = 'dsh-550c-boot-caption'
/** The host-document sheet that owns the overlay's geometry, drag guard and band. */
const HOST_SHEET_ID = 'dsh-550c-boot-host'

/** The one live splash; the boot trigger and the preview button share it. */
let liveOverlay = null
/** Set while the plugin is being disabled, so the teardown does not start the login. */
let pluginTornDown = false

function readMode() {
  try {
    const raw = window.localStorage.getItem(MODE_KEY)
    return MODE_VALUES.indexOf(raw) >= 0 ? raw : DEFAULT_MODE
  } catch (error) {
    return DEFAULT_MODE
  }
}

function writeMode(mode) {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch (error) {
    /* private mode: the choice simply does not persist */
  }
}

function readScheme() {
  try {
    const raw = window.localStorage.getItem(SCHEME_KEY)
    return SCHEME_VALUES.indexOf(raw) >= 0 ? raw : DEFAULT_SCHEME
  } catch (error) {
    return DEFAULT_SCHEME
  }
}

function writeScheme(scheme) {
  try {
    window.localStorage.setItem(SCHEME_KEY, scheme)
  } catch (error) {
    /* private mode: the choice simply does not persist */
  }
}

/** The overlay's own sheet: host geometry + the extracted animation styles. */
const HOST_CSS = `
:host{position:fixed;inset:0;display:block;box-sizing:border-box;z-index:2147483000;background:var(--bg,#050403)}
/* The hand-off is deliberately two-phase, because a single cross-fade is ugly:
   the port ends on a big, bright logo, and dissolving that straight into the
   conversation page stamps a grey ghost of it over the UI for half a second
   (measured frame by frame). So the CONTENT goes first — the logo and panels
   fade into the splash's own background, which the host now paints itself — and
   only then does that clean backdrop fade away to reveal the app. The backdrop
   is read from the animation's own --bg, so both phases agree on the colour. */
:host(.dsh550c-out){opacity:0;transition:opacity 420ms cubic-bezier(.4,0,.2,1) 200ms}
:host(.dsh550c-out) .dsh550c-stage{opacity:0;transition:opacity 200ms ease-out}
/* Height only — deliberately NOT position:fixed. A fixed stage would create a
   stacking context and trap #boot's z-index 2000 inside it, which lets the
   ported vignette (z-index 899) and scanlines paint OVER the logo. In the
   original page #boot was a direct child of body and nothing wrapped it. */
.dsh550c-stage{height:100%}
`

/**
 * 分段控件的选中态：固定黑底白字。
 *
 * 不能借用主题变量（brand-primary / brand-text）—— 那两个值在深浅主题里是翻面的，
 * 皮肤还会改写它们，结果就是一会儿黑底黑字、一会儿白底白字（0.5.2 反复修过三次的那个 bug）。
 *
 * 皮肤仓库里有一份逐字相同的规则（dsh-550c-skin 的 .dsh550c-skin-seg button.on）。
 * 【改这里必须同步改那边】，两个包各自独立发布，靠这条注释维持一致。
 */
const SEG_ACTIVE_RULE = '.dsh550c-seg button.on{background:#111;color:#fff;font-weight:600}'

/** The General-settings row sheet; DSH tokens so it matches either theme. */
const ROW_CSS = `
.dsh550c-row{display:flex;align-items:center;gap:16px;padding:10px 0;flex-wrap:wrap}
.dsh550c-row-text{flex:1;min-width:220px}
.dsh550c-row-title{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#191919)}
.dsh550c-row-desc{margin-top:2px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666)}
.dsh550c-row-ctrl{display:flex;align-items:center;gap:8px}
.dsh550c-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;overflow:hidden}
.dsh550c-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-family:inherit;font-size:12.5px;line-height:1.4;padding:5px 14px;cursor:pointer}
.dsh550c-seg button+button{border-left:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.dsh550c-seg button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
${SEG_ACTIVE_RULE}
.dsh550c-preview{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent;color:var(--dsw-alias-label-primary,#191919);font-family:inherit;font-size:12.5px;line-height:1.4;padding:5px 14px;border-radius:8px;cursor:pointer}
.dsh550c-preview:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.dsh550c-preview[disabled]{opacity:.55;cursor:default}
.dsh550c-input{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent;color:var(--dsw-alias-label-primary,#111);border-radius:6px;padding:6px 10px;font:inherit;min-width:120px}
.dsh550c-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}
.dsh550c-note{margin-top:6px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666)}
.dsh550c-note b{color:var(--dsw-alias-label-primary,#191919);font-weight:600}
.dsh550c-note.up{color:var(--dsw-alias-brand-primary,#4d6bfe)}
.dsh550c-note.bad{color:var(--dsw-alias-label-error,#d4380d)}
.dsh550c-link{border:0;background:transparent;padding:0;margin:0 0 0 8px;font-family:inherit;font-size:12px;color:var(--dsw-alias-brand-primary,#4d6bfe);cursor:pointer;text-decoration:underline}
.dsh550c-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));border-radius:6px;padding:2px 6px}
/* 面板不能被内容撑开：首次挂载时容器宽度可能还没定下来，
   若让内容自己决定宽度，就会停在"3 个输入挤一行并溢出"的状态，
   直到重新挂载才回缩。这里显式占满容器并允许收缩。 */
.dsh550c-panel-frame{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
/* 卡片字段固定两列：auto-fit 会让它在宽容器里变成三列，占位文字全被截断。
   满两列时每格约 300-400px，读起来才正常。 */
.dsh550c-card-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;
  align-items:center;width:100%;min-width:0;box-sizing:border-box}
.dsh550c-card-fields .dsh550c-input{width:100%;min-width:0;max-width:100%;box-sizing:border-box;flex:none}
.dsh550c-card-fields .dsh550c-preview{justify-self:start}
/* 文件选择框与头像也要服从网格：否则文件框按自身内容撑开，会顶破列宽。 */
.dsh550c-card-fields input[type=file]{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
.dsh550c-card-fields img{justify-self:start;width:32px;height:32px;object-fit:cover;border-radius:3px;border:1px solid rgba(255,255,255,.3)}
/* 窄容器（手机/窄窗）退回单列，避免两列各 130px 挤成一团。 */
@media (max-width: 620px){.dsh550c-card-fields{grid-template-columns:minmax(0,1fr)}}
.dsh550c-panel-card{width:100%;min-width:0;max-width:100%;box-sizing:border-box;overflow:hidden}
.dsh550c-row{min-width:0;max-width:100%}
.dsh550c-row-text{min-width:0}
.dsh550c-row-ctrl{min-width:0;max-width:100%;flex-wrap:wrap}
.dsh550c-input{min-width:0;max-width:100%;box-sizing:border-box;flex:1 1 190px}
`

function ensureRowStyle() {
  if (document.getElementById(ROW_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = ROW_STYLE_ID
  style.textContent = ROW_CSS
  document.head.appendChild(style)
}

/**
 * The host element's own sheet, in the DOCUMENT rather than the shadow root.
 *
 * Two separate reasons, both measured against real third-party sheets:
 *
 *   geometry   any document-level rule outranks a `:host` declaration, because
 *              the shadow root cannot defend its host from outside. The dsh-web
 *              family bundle ships exactly such a rule for a marker this plugin
 *              used to borrow —
 *              `[data-dsh-boot-splash]{position:fixed;inset:0;z-index:9999;
 *              background:var(--dsw-alias-bg-base,#1e1e20);pointer-events:none;
 *              transition:opacity 160ms …}` — which silently disabled
 *              click-to-skip (`pointer-events:none`), dropped the overlay under
 *              the app's own layers (9999), repainted it and replaced the
 *              hand-off transition. The marker is now this plugin's own
 *              (`data-dsh-550c-boot`, see mountOverlay) and these declarations
 *              are `!important`, so no third-party sheet can take the overlay
 *              over again.
 *
 *   drag       DSH's official base stylesheet turns every DIRECT body child into
 *              a `-webkit-app-region: no-drag` region on darwin — its selector,
 *              `html[data-platform=darwin] body>:not(#root)`, spares only the
 *              app's own root element. A viewport-spanning body child therefore
 *              subtracts the whole window from the draggable region: while the
 *              splash is up the window cannot be dragged by its title area and
 *              macOS stops running the system double-click action there.
 *              `pointer-events: none` does not exempt an element from that
 *              computation; only a declaration of its own does. `initial` is the
 *              initial value (`none`), which takes the element OUT of the
 *              computation instead of turning the whole overlay into a drag
 *              handle — click-to-skip keeps working. `!important` is required
 *              because the official selector outranks this one.
 *
 * `aria-hidden="true"` on the host is the second half of the drag story: the
 * family bundle exempts that standard attribute too, so an install that ships it
 * gets the same treatment without this plugin borrowing a family-private name.
 */
const HOST_SHEET_CSS = `
body>.dsh550c-host{position:fixed;inset:0;display:block;box-sizing:border-box;z-index:2147483000 !important;background:var(--bg,#050403);pointer-events:auto !important}
body>.dsh550c-host.dsh550c-out{opacity:0;transition:opacity 420ms cubic-bezier(.4,0,.2,1) 200ms !important}
html[data-platform="darwin"] body>.dsh550c-host{-webkit-app-region:initial !important}
/* A real drag region for the window's top strip while the splash plays. The HUD
   strip lives inside the shadow root, where the official rule
   html[data-platform=darwin] [data-window-drag]{-webkit-app-region:drag} can
   never match — the shell's own queries and that sheet are all in the document
   tree — so the band is a document-level element instead, and the property is
   declared explicitly so Windows (where that rule does not exist at all) drags
   too. It sits above the overlay, which is why clicks inside the top 40px go to
   the window rather than to skip-the-splash: press Esc, or click below the band. */
body>.dsh550c-dragband{position:fixed;top:0;left:0;right:0;height:40px;z-index:2147483001;-webkit-app-region:drag}
`

function ensureHostSheet() {
  if (document.getElementById(HOST_SHEET_ID) !== null) return
  const style = document.createElement('style')
  style.id = HOST_SHEET_ID
  style.textContent = HOST_SHEET_CSS
  document.head.appendChild(style)
}

/**
 * Retire the host half's first frame.
 *
 * `lib/index.js` contributes an index-injection row that covers the screen with
 * the splash's own opening colour *before the shell exists* — that is the only
 * way to keep DSH's boot card off the glass, because a client plugin is
 * materialised long after the card is painted (measured: card 67 ms, this
 * bundle 338 ms, card disposed 517 ms). The splash paints the same colour
 * itself, so calling this on the same task as mounting the overlay swaps them
 * inside one frame: no seam, no flash, nothing left behind. The injected script
 * watches the boot card and carries its own timeout, so a client half that never
 * arrives cannot leave a black window behind.
 */
function endFirstFrame() {
  const handle = window[FIRST_FRAME_GLOBAL]
  if (handle === undefined || handle === null) return
  delete window[FIRST_FRAME_GLOBAL]
  try {
    handle.end()
  } catch (error) {
    console.error('[dsh-550c-boot] first frame refused to end', error)
  }
}

/**
 * Make the Desktop window's caption buttons belong to the splash.
 *
 * On Windows the shell hands Electron `titleBarStyle: 'hidden'` plus a
 * `titleBarOverlay` 40 px tall and ~138 px wide, and the buttons are drawn by the
 * browser process ABOVE the page: no z-index in this document can reach them
 * (the ported UI keeps its own ─ □ ✕ inside the fake window titles, which is
 * where the design wants them). Two things stop them reading as foreign chrome:
 *
 *   footprint  the stylesheet reserves the strip inside #hud-top, so the HUD's
 *              TIME / ● REC are not pushed under the buttons (data-caption).
 *   strip      the Desktop preload measures a probe element's computed
 *              `background-color` / `color` and pushes them to
 *              `setTitleBarOverlay({color, symbolColor})` over IPC, re-measuring
 *              whenever <head> mutates. Both values accept alpha, so the strip is
 *              made TRANSPARENT while the splash plays: the buttons float on the
 *              animation instead of sitting on an opaque bar, and the symbols are
 *              painted in the splash's accent so they stay legible on it.
 *
 * The colours are declared ON THE PROBE ELEMENT, not on :root. The probe is a
 * body-level `<span>` whose inline style reads the app's two tokens, and the app
 * defines them on `body`: custom properties resolve from the CLOSEST ancestor, so
 * a `:root` override never reaches it — `!important` on `html` loses to a plain
 * declaration on `body` (measured on the real window: the strip stayed opaque for
 * the whole splash while the sheet looked correct). Declaring both colours on the
 * probe sidesteps inheritance and leaves the app's own tokens — and its text
 * colour — untouched. `transparent` is a real value here: the preload normalises
 * it through a canvas to `rgba(0, 0, 0, 0)`, which the shell's own colour check
 * accepts, so the strip really does become see-through.
 *
 * Removing the sheet afterwards puts the app's own colours back, because that
 * mutation of <head> is itself the re-measure trigger.
 *
 * A browser tab has neither the strip nor `data-platform` (the Electron preload
 * never runs), so this is a no-op outside the Desktop app.
 *
 * @returns a disposer, or null when there is nothing to adapt
 */
function adaptCaption(host) {
  const platform = document.documentElement.dataset.platform
  if (platform === undefined || platform === '') return null

  const darwin = platform === 'darwin'
  host.dataset.caption = darwin ? 'darwin' : 'windows'

  // Mirror the shell's fullscreen flag onto the host, and keep it in sync: the
  // HUD's caption reservation has to collapse in fullscreen, because macOS hides
  // the traffic lights there and Windows hides the overlay buttons. The preload
  // writes html[data-fullscreen] for both platforms (desktop main process ->
  // dsh-desktop:window-fullscreen -> root.dataset.fullscreen), so watching that
  // one attribute is enough — and it also covers the user entering fullscreen
  // while the splash is on screen.
  const mirrorFullscreen = () => {
    if (document.documentElement.dataset.fullscreen === 'true') host.dataset.fullscreen = ''
    else delete host.dataset.fullscreen
  }
  mirrorFullscreen()
  const fullscreenObserver = new MutationObserver(mirrorFullscreen)
  fullscreenObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-fullscreen'],
  })

  const dispose = () => {
    fullscreenObserver.disconnect()
    delete host.dataset.caption
    delete host.dataset.fullscreen
  }

  // macOS has no titleBarOverlay at all (the shell's whole bundle contains zero
  // `titlebar-area` hits): the preload's probe is never created there either,
  // because syncWindowsAppearance() returns early off win32. So the reservation
  // above is the entire darwin story — nothing to repaint, nothing to inject.
  if (darwin) return dispose

  // The accent follows the scheme for free: `--caption-symbol` is a literal on
  // :host (see ENHANCE_CSS), and the host's computed style is the scheme's answer.
  const symbol = getComputedStyle(host).getPropertyValue('--caption-symbol').trim() || '#e8a020'

  const style = document.createElement('style')
  style.id = CAPTION_STYLE_ID
  const probe = 'body>span[style*="dsw-specific-sidebar-fill"]'
  style.textContent =
    probe + '{background-color:transparent !important;color:' + symbol + ' !important}'
  // Appending to <head> is itself the trigger: the preload's MutationObserver
  // re-measures the probe and repaints the strip.
  document.head.appendChild(style)

  return () => {
    style.remove()
    dispose()
  }
}

/**
 * The splash, mounted imperatively into document.body.
 *
 * NOT through the `shell.overlay` slot: the shell — and with it every slot —
 * renders only after the client module system has loaded every plugin, which is
 * also the moment DSH's own boot card (`[data-dsh-boot]`, "HARNESS / Loading
 * plugins…") is disposed. A slot-based splash therefore always comes AFTER that
 * card, leaving a visible gap. apply() runs during the load phase instead, so
 * this is as early as a client plugin can draw.
 *
 * Even that is ~271 ms too late for the card (67 ms card, 338 ms this bundle,
 * 517 ms card disposal), which is why the frame on screen before this module
 * ever runs comes from the host half (lib/index.js) — this mount retires it in
 * the same task (endFirstFrame), so the two read as one animation.
 *
 * Every exit path — played out, skipped, or a throw inside the show — ends in
 * the same fade, so a broken animation can never trap anyone behind a black
 * screen.
 *
 * @param force - play even when the stored mode is 'off' (the preview button)
 * @returns the live overlay record, or null when nothing was mounted
 */
function mountOverlay(force) {
  // 非 force（自动播放）时每个文档只放一次：
  // 思考/流式输出期间客户端会重渲染，原来每次都会把片头重新拉起来 ✗
  if (force !== true) {
    if (dsh550cGet('splashPlayed') === true) return null
    dsh550cSet('splashPlayed', true)
  }
  if (liveOverlay !== null) return liveOverlay

  const stored = readMode()
  if (!force && stored === 'off') return null
  const mode = stored === 'full' ? 'full' : 'simple'

  if (document.body === null) {
    // The factory can be evaluated while the document is still parsing; the
    // splash needs a body to attach to, so it waits for one.
    document.addEventListener('DOMContentLoaded', () => mountOverlay(force), { once: true })
    return null
  }

  const host = document.createElement('div')
  host.className = 'dsh550c-host'
  // This plugin's OWN marker. It used to borrow the dsh-web family's
  // `data-dsh-boot-splash`, which turned out to be a trap: that name is not an
  // exemption but a contract — the family styles it (opaque background,
  // pointer-events:none, z-index 9999, its own transition) and its boot shield
  // reuses and then REMOVES any `div[data-dsh-boot-splash]` it finds. Carrying it
  // meant the splash lost click-to-skip, its fade and its lifetime on every
  // install that ships the family bundle. `aria-hidden="true"` is the standard
  // attribute that earns the same drag exemption without borrowing a private name.
  host.dataset.dsh550cBoot = ''
  host.setAttribute('aria-hidden', 'true')
  ensureHostSheet()
  // The document-level drag band that makes the window draggable while the splash
  // plays (the HUD strip is inside the shadow root, where the official rule cannot
  // reach — see HOST_SHEET_CSS).
  const dragBand = document.createElement('div')
  dragBand.className = 'dsh550c-dragband'
  dragBand.setAttribute('data-window-drag', '')
  // The scheme is applied as data on the host, which is what the stylesheet's
  // :host([data-scheme=…]) blocks key on. Amber sets nothing on purpose.
  const scheme = readScheme()
  if (scheme !== DEFAULT_SCHEME) host.dataset.scheme = scheme
  // Recorded for the stylesheet: only the full mode mounts #hud-top, and the
  // caption strip's fill has to match whichever surface is at the top.
  host.dataset.mode = mode
  // Recorded before anything else: did the splash beat DSH's own boot card to
  // the screen? (Read by scripts/verify.mjs.)
  host.dataset.sawBootCard = String(document.querySelector('[data-dsh-boot]') !== null)
  document.body.appendChild(host)
  // Above the overlay, so the window can still be dragged by its title strip.
  document.body.appendChild(dragBand)

  const record = { host: host, dragBand: dragBand, show: null, enhance: null, caption: null, finished: false, fadeTimer: null, watchdog: null, dispose: null, startedAt: 0 }

  const skip = () => {
    if (record.show !== null) record.show.cancel()
  }
  const onKey = (event) => {
    if (event.key === 'Escape') skip()
  }
  const dispose = () => {
    if (record.fadeTimer !== null) window.clearTimeout(record.fadeTimer)
    if (record.watchdog !== null) window.clearTimeout(record.watchdog)
    if (record.show !== null) record.show.cancel()
    if (record.enhance !== null) record.enhance()
    if (record.caption !== null) record.caption()
    host.removeEventListener('click', skip)
    window.removeEventListener('keydown', onKey, true)
    dragBand.remove()
    host.remove()
    if (liveOverlay === record) liveOverlay = null
    // The splash owns the first act and nothing else; the login phase (src/login.js)
    // starts here, from the single exit every path already funnels through. It also
    // announces the hand-off, so a separately installed login plugin can take over.
    if (!pluginTornDown) startLoginPhase()
  }
  const finish = (reason) => {
    if (record.finished) return
    record.finished = true
    // 只有"片子自己播完"才是有效样本：跳过、看门狗、启动异常都会让间隔变短，
    // 拿它们回写只会让下一轮的淡出排程一次比一次早。
    if (reason === 'played' && record.startedAt > 0) {
      rememberSplashMs(mode, performance.now() - record.startedAt)
    }
    if (record.watchdog !== null) {
      window.clearTimeout(record.watchdog)
      record.watchdog = null
    }
    // 片头结束 = 音乐淡出的起点。渐弱比片头自己的 620ms 长，
    // 免得音乐在画面消失的那一刻硬切（硬切会爆音）。
    // 这条路径是片头唯一的收口 —— 播完、Esc 跳过、点击跳过、看门狗兜底都汇到这儿。
    fadeOutBootMusic(FADE_MS)
    host.classList.add('dsh550c-out')
    record.fadeTimer = window.setTimeout(dispose, FADE_MS + 40)
  }
  record.dispose = dispose

  // Absolute watchdog. The show has its own end, the click/Esc skip and a catch
  // around startup, but this is the one guarantee that matters on a daily-driver
  // install: the splash can never outlive its own animation and lock the user
  // out of Settings — which is where the switch that disables it lives.
  record.watchdog = window.setTimeout(() => {
    console.error('[dsh-550c-boot] watchdog fired; dismissing the splash')
    finish()
  }, mode === 'full' ? 30000 : 12000)

  try {
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HOST_CSS + CSS_550C
    shadow.appendChild(style)

    const stage = document.createElement('div')
    stage.className = 'dsh550c-stage'
    stage.innerHTML = mode === 'full' ? BOOT_MARKUP + APP_MARKUP : BOOT_MARKUP
    shadow.appendChild(stage)

    // Content upgrades (terminal texture, self-consistent data, panel depth)
    // live outside the ported code, so re-extracting never loses them.
    record.enhance = enhanceShow(stage, { mode: mode })

    // After enhanceShow: `--caption-fill` / `--caption-symbol` are defined by the
    // enhancement sheet, so reading them any earlier silently falls back to the
    // built-in default and the strip keeps the wrong colour for the whole splash.
    record.caption = adaptCaption(host)

    // UEG 档例外：片头马上会被摘掉，而 UEG 的 iframe 还没挂上 ——
    // 这里撤退黑帧的话，中间那一段会露出 DSH 的原生加载卡（实测就是这个问题）。
    // 改由 UEG iframe 的 load 事件撤退；万一 UEG 没挂上，宿主侧 12 秒兜底会自动撤。
    // 开机音乐同样归 UEG 让位：UEG 自带男声配音，两个一起响会撞。
    let uegOwnsFirstFrame = false
    try {
      uegOwnsFirstFrame = typeof readLoginScreen === 'function' && readLoginScreen() === 'ueg'
    } catch { uegOwnsFirstFrame = false }

    record.show = createShow(stage, { mode: mode, cancelled: CANCELLED })
    host.addEventListener('click', skip)
    window.addEventListener('keydown', onKey, true)
    // 开机音乐：只配 550C 片头，UEG 档不配（见上面）。
    startBootMusic()
    // 片头总时长 = 上一轮实测（没有就按载体兜底，见 SPLASH_MS）。
    // 淡出按它提前排程，收尾落在画面结束后 0.5 秒。
    record.startedAt = performance.now()
    scheduleBootFade(readSplashMs(mode))
    // 第一个回调 = 播完（可回写时长），第二个 = 被跳过/取消（不回写）。
    record.show.start().then(() => finish('played'), () => finish('skipped'))
    // Last statement of the same task that put the overlay on screen: the host
    // half's first frame and this shadow root swap inside one paint.
    if (!uegOwnsFirstFrame) endFirstFrame()
  } catch (error) {
    console.error('[dsh-550c-boot] show failed to start', error)
    finish()
  }

  liveOverlay = record
  return record
}

/**
 * 推荐行：只在没装 dsh-550c-skin 时出现。
 *
 * 判定走 state.js 的 dsh550cSkinInstalled()。这里曾经挂过一个 1.2 秒的轮询，
 * 理由是"window 上的旗子变了 React 不会重渲染" —— 但那个版本号是皮肤的宿主半边
 * 在 index-inject 阶段一次性注入的，页面生命周期里根本不会变，轮询纯属白烧 CPU。
 * 读一次就够；真要让它在运行时复活，那也得等插件启停机制先能热加载。
 */
function SkinPromoRow() {
  const [installed] = React.useState(dsh550cSkinInstalled)
  if (installed) return null
  return React.createElement("div", { className: "dsh550c-row" },
    React.createElement("div", { className: "dsh550c-row-text" },
      React.createElement("b", { style: { display: "block", fontSize: "13px", fontWeight: 600 } }, "推荐搭配：550C 皮肤"),
      React.createElement("span", null, "把整个 DSH 界面换成 550C 控制台配色 —— 磷光四色、扫描线、暗角、等宽字体。只改外观，不动布局。装上它之后这一行会自动消失。"),
    ),
    React.createElement("div", { className: "dsh550c-row-ctrl" },
      React.createElement("button", {
        type: "button",
        className: "dsh550c-preview",
        onClick: () => { try { window.open("https://www.npmjs.com/package/dsh-550c-skin", "_blank") } catch (error) { /* 打不开就算了 */ } },
      }, "去安装"),
    ),
  )
}

/**
 * 设置行：先落「通用」页，等「550C」页出现再搬过去。
 *
 * 背景（实测）：两个插件曾经都往 `settings.general.item` 里插、还用了同一批 order 号
 * （26/27/28）。同号在稳定排序里按注册顺序排，结果通用页变成两个插件逐行交替：
 * 17 行里 6 行是本系列的，"550C 开机动画 · 550C 皮肤 · 开机动画配色 · CRT 气氛 · …"。
 * 所以皮肤改成自己声明一页，本插件把行搬过去；插槽名只能声明一次（重复的 children 表会抛），
 * 因此这里是注入皮肤声明的那一页，而不是自己再声明一页。
 *
 * 为什么是"先落再搬"而不是"先判断再落"：`inject` 的回调在插槽【声明的那一刻】就跑，
 * 而通用页由设置壳声明，远早于第三方插件声明自己的页 —— 所以通用页问起来时，
 * 诚实的答案只能是"通用页"。等 550C 页出现，再把行搬过去（register 返回 disposer，
 * 同一个 id 在同一个 list 插槽里注册两次会抛，所以搬之前必须先 dispose）。
 */
function installSettingsRows(ctx) {
  /** 落在共享的「通用」账本上时的 disposer 集合。 */
  let inGeneral = null
  /** 落在「550C」页上时的 disposer 集合。 */
  let onSeries = null

  const placeInGeneral = () => {
    const placed = [
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c', order: 26 }, SettingsRow),
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-scheme', order: 27 }, SchemeRow),
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-update', order: 28 }, VersionRow),
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-skin-promo', order: 29 }, SkinPromoRow),
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-login', order: 29 }, LoginRow),
      // 通用页是共享账本，别去动别人的号：开机音乐整个追加到末尾。
      // 550C 页上它是 70（挨着片头那两行），通用页上只能排最后 ——
      // 这个页只有在 550C 页不存在时才会出现，是兜底，不是主场。
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-music', order: 30 }, MusicRow),
    ]
    inGeneral = () => {
      for (const dispose of placed) dispose()
    }
  }

  /**
   * 「550C」页上的号段从 50 起，不是 10 —— 那一页的前四行是皮肤的
   * （配色 10、气氛 20、仪表盘 30、控制台外观 40）。把老的 26/27/28 照搬过去，
   * 等于把当初要修的撞号原样复制到另一页。系列的约定是按十位分段：
   * 皮肤占 10..40，本插件占 50..85，后来的插件往缝里插。
   */
  const placeOnSeries = () => {
    const placed = [
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c', order: 50 }, SettingsRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-scheme', order: 60 }, SchemeRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-music', order: 70 }, MusicRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-update', order: 80 }, VersionRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-skin-promo', order: 85 }, SkinPromoRow),
      // 「外观」页是皮肤的地盘；皮肤不在时放一行推荐，免得整页空白 ✗
      ctx.slots.register({ name: 'settings.550c.item', id: 'boot-550c-skin-promo-look', order: 10 }, SkinPromoRow),
      ctx.slots.register({ name: 'settings.550c.anim.ueg', id: 'boot-550c-login', order: 80 }, LoginRow),
    ]
    onSeries = () => {
      for (const dispose of placed) dispose()
    }
  }

  // 550C 页的子插槽先注入：同一轮里两个插槽都声明时，页内的那份要先挂上。
  ctx.slots.inject('settings.550c.item', () => {
    // 页面赢了：先把通用页那份收掉，否则同一批行会在两个账本里各渲染一遍。
    inGeneral?.()
    inGeneral = null
    placeOnSeries()
    return () => {
      onSeries?.()
      onSeries = null
      // 页面没了（皮肤被运行期卸载）：退回共享账本，别让这个插件一行设置都不剩。
      // try：卸载可能与 shell 自己的拆除赛跑，往已经消失的插槽里注册会抛。
      try {
        if (inGeneral === null) placeInGeneral()
      } catch (error) {
        /* 通用页也没了，没有可退的地方 */
      }
    }
  })

  ctx.slots.inject('settings.general.item', () => {
    if (onSeries === null) placeInGeneral()
    return () => {
      inGeneral?.()
      inGeneral = null
    }
  })
}

/**
 * 「550C」页归谁：皮肤在场就归皮肤，皮肤不在 boot 顶上。
 *
 * 不能只判断一次：skin 可能在运行时被禁用，它的注册随之撤销，那一页就空了
 * （实测：两个都开时关掉 skin，550C 这一页会消失）。所以隔 1.5 秒再确认一次。
 *
 * 但确认必须收着做 —— 这里原来是一个永不清理的 setInterval，插件被禁用之后
 * 它还在跑，一边跑一边往 window 上写旗子。现在：归属落定即停，卸载时也停。
 */
function installPageClaim(ctx) {
  let claimTimer = null
  const stopClaimTimer = () => {
    if (claimTimer === null) return
    window.clearTimeout(claimTimer)
    claimTimer = null
  }

  const claimSectionIfFree = () => {
    // 皮肤在场：页面归它，boot 不抢。唯一判据，别再读 window 上的旗子。
    if (dsh550cSkinInstalled()) return
    if (dsh550cGet('bootPageOwned') === true) {
      stopClaimTimer()
      return
    }
    dsh550cSet('bootPageOwned', true)
    stopClaimTimer()
    ctx.slots.inject('settings.section', () =>
      ctx.slots.register(
        {
          name: 'settings.section',
          id: '550c',
          order: 30,
          label: () => '550C',
          // 子插槽的声明只在 src/panel.js 里写一次，这里只引用 ——
          // 以后加新动画时不会再出现"页面声明了、行注册的地方忘了改"的崩。
          children: Object.assign({}, PANEL_SLOTS),
        },
        Panel550c,
      ),
    )
  }

  claimTimer = window.setTimeout(claimSectionIfFree, 0)
  const claimRetry = window.setInterval(() => {
    if (dsh550cGet('bootPageOwned') === true || dsh550cSkinInstalled()) stopClaimTimer()
    else claimSectionIfFree()
  }, 1500)
  ctx.effect(() => () => {
    stopClaimTimer()
    window.clearInterval(claimRetry)
  }, 'dsh-550c-boot: 550C page claim guard')
}

/**
 * 片头关掉、只留登录授权时的入口。
 *
 * 登录是独立相位，不是片头的子步骤：片头关着的时候没人会调交接函数，
 * 想要"只要授权界面"的用户否则两边都拿不到。延迟 150ms 让设置行先渲染完。
 */
function installLoginWithoutSplash(ctx) {
  const splashOff = readMode() === 'off'
  const loginOn = readLoginScreen() !== 'off'
  if (!splashOff || !loginOn) return
  ctx.effect(() => {
    const timer = window.setTimeout(() => startLoginPhase(), 150)
    return () => window.clearTimeout(timer)
  }, 'dsh-550c-boot: login without the splash')
}

/**
 * 卸载：插件被禁用时把片头、登录、音乐全部收掉。
 *
 * 片头故意不是槽位贡献（原因见 mountOverlay 的注释），所以它没有天然的
 * 生命周期，只能由这个 effect 负责。
 */
function installTeardown(ctx) {
  ctx.effect(
    () => () => {
      pluginTornDown = true
      liveLogin?.dispose()
      if (bootSplash !== null) bootSplash.dispose()
      if (liveOverlay !== null) liveOverlay.dispose()
      // 插件被关掉时音乐必须立刻停：那 1.5 秒的淡出是留给片头正常收尾的。
      stopBgm()
    },
    'dsh-550c-boot: splash teardown',
  )
}

/**
 * 插件入口。
 *
 * 四件事分开装，各自能单独读：
 *   设置行（含"通用页 → 550C 页"的搬迁）
 *   550C 页归属（皮肤不在时由 boot 声明）
 *   无片头时的登录相位
 *   卸载清理
 */
function apply(ctx) {
  // 客户端重连 / 热重挂载会再次调用 apply：
  // 重复 register 同一个 slot id 会抛错，抛错之后 550C 面板就注册不上了
  // —— 表现就是"设置里 550C 那个按键不见了，只能重启找回来" ✗
  if (dsh550cGet('applied') === true) {
    console.info('[dsh-550c-boot] apply 已执行过，跳过重复注册')
    return
  }
  dsh550cSet('applied', true)

  installSettingsRows(ctx)
  installPageClaim(ctx)
  installLoginWithoutSplash(ctx)
  installTeardown(ctx)
}

/**
 * Mount the boot splash at MODULE EVALUATION time.
 *
 * This is as early as a client plugin can possibly draw: the factory below runs
 * while the module system is still draining, before cordis has resolved the
 * service graph and called apply(). Every millisecond here is a millisecond of
 * DSH's own "Loading plugins…" card that the splash covers instead.
 *
 * The lifecycle is still owned by the plugin: apply() registers the teardown
 * effect, so disabling the plugin removes whatever this started.
 */
const bootSplash = mountOverlay(false)
// 互斥：UEG 档自带完整的三幕片头，所以 UEG 开着就别再播 550C 片头 ——
// 两者都开会先播 17 秒片头、再播 UEG 三幕，等于两段片头。
// 注意 bootSplash 是 const，只调 dispose()、不重新赋值。
try {
  if (bootSplash !== null && typeof readLoginScreen === 'function' && readLoginScreen() === 'ueg') bootSplash.dispose()
} catch (error) {
  console.error('[dsh-550c-boot] splash exclusion failed', error)
}

exports.name = 'boot-550c'
exports.inject = ['slots']
exports.apply = apply
