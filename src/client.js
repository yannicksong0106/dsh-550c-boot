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
/* 选中态的文字必须用 brand-text，不能写死白色：
   DSH 的 brand-primary 是随主题翻面的（浅色近黑、深色近白），
   写死 color:#fff 在暗色主题下就成了白底白字，整个分段控件的文字看不见。 */
.dsh550c-seg button.on{background:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-brand-text,#fff)}
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
    if (window.__dsh550cSplashPlayed === true) return null
    window.__dsh550cSplashPlayed = true
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

  const record = { host: host, dragBand: dragBand, show: null, enhance: null, caption: null, finished: false, fadeTimer: null, watchdog: null, dispose: null }

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
  const finish = () => {
    if (record.finished) return
    record.finished = true
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
    // 片头总时长用实测值，淡出提前 fadeMs 开始，收尾落在画面结束后 0.5 秒
    // 实测值（浏览器打点 2026-10-22）：简易档 3587ms、完整档 14010ms
    // 从 overlay 出现到 dsh550c-out 的真实间隔，不是文案里的估值
    scheduleBootFade(mode === 'simple' ? 3590 : 17000)
    record.show.start().then(finish, finish)
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

function apply(ctx) {
  // 客户端重连 / 热重挂载会再次调用 apply：
  // 重复 register 同一个 slot id 会抛错，抛错之后 550C 面板就注册不上了
  // —— 表现就是"设置里 550C 那个按键不见了，只能重启找回来" ✗
  if (window.__dsh550cApplied === true) {
    console.info('[dsh-550c-boot] apply 已执行过，跳过重复注册')
    return
  }
  window.__dsh550cApplied = true
  // The settings rows are ordinary slot contributions: they belong to a panel
  // and should live and die with it.
  //
  // WHERE THEY LIVE IS NEGOTIATED, and the reason is the shared ledger. The
  // obvious home is `settings.general.item`, which every feature package shares —
  // and `dsh-550c-skin` was injecting its three rows there with the SAME order
  // numbers as this plugin (26/27/28). Equal orders tie, a list slot sorts by
  // (priority, order), a stable sort leaves ties in registration order, and the
  // General page came out as two unrelated plugins alternating row by row:
  //
  //   550C 开机动画 · 550C 皮肤 · 开机动画配色 · CRT 气氛 · 版本与更新 · 控制台外观
  //
  // Measured live: 17 rows in General, 6 of them ours, interleaved. So the skin
  // now declares a 550C page of its own (`settings.section` id `550c`) and the
  // 550C rows gather there. Slot names are declared exactly once — a second
  // `children` table for the same key THROWS — so this plugin injects into the
  // page the skin declares rather than declaring one of its own.
  //
  // The fallback to General is not politeness: `register()` throws for an
  // undeclared slot, so a plugin loaded without the skin has nowhere else to go.
  //
  // A plain "check whether the page exists, then choose" does NOT work. `inject`
  // runs its callback the moment its slot is DECLARED, and General is declared by
  // the settings shell long before a third-party plugin declares its own page —
  // so at the moment General asks, the honest answer is still "General". The rows
  // are therefore placed in General and MOVED when the 550C page appears.
  // `register()` returns a disposer and registering the same id twice in one list
  // slot throws, so the move always disposes before it registers.

  /** The fallback placement in the shared General ledger, while it is the home. */
  let inGeneral = null
  /** The placement on the 550C page, once that page exists. */
  let onSeries = null

  /** Place the rows in the shared General ledger. */
  const placeInGeneral = () => {
    const placed = [
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c', order: 26 }, SettingsRow),
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-scheme', order: 27 }, SchemeRow),
      ctx.slots.register({ name: 'settings.general.item', id: 'boot-550c-update', order: 28 }, VersionRow),
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
   * Place the three rows on the 550C page the skin declares.
   *
   * The orders start at 50, NOT at 10. The page's first four rows are the skin's
   * — 配色 10, 气氛 20, 仪表盘 30, 控制台外观 40 — so copying this plugin's old
   * 26/27/28 across would have recreated the exact collision it was written to
   * fix, one page over. The convention for the series is tens: the skin owns
   * 10..40, this plugin takes 50..80, and a later plugin slots into the gaps.
   * 开机音乐挨着开机动画和配色（都是片头的事），版本与更新挪到 80 收尾 ——
   * 它是"关于这个插件"的信息，不该插在片头设置中间。
   */
  const placeOnSeries = () => {
    const placed = [
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c', order: 50 }, SettingsRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-scheme', order: 60 }, SchemeRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-music', order: 70 }, MusicRow),
      ctx.slots.register({ name: 'settings.550c.anim.550c', id: 'boot-550c-update', order: 80 }, VersionRow),
      ctx.slots.register({ name: 'settings.550c.anim.ueg', id: 'boot-550c-login', order: 80 }, LoginRow),
    ]
    onSeries = () => {
      for (const dispose of placed) dispose()
    }
  }

    // 「550C」页由本插件提供：skin 不在时也不会缺页（系列共用同一个入口）。
    // 系列约定：skin 在场时「550C」页归它（它会先插旗），boot 直接让位；
    // 推到微任务执行，才来得及看到同一轮里 skin 插的旗子。
    // 注意：不能用模板字符串（build 会把 src/*.js 插进模板字符串）。
    // 页面归谁：skin 在就归 skin，skin 走了 boot 顶上。
    // 不能只判断一次 —— skin 可能在运行时被禁用，它的注册会随之撤销，
    // 那时页面就空了（实测：两个都开时关掉 skin，550C 这一页会消失）。
    // 所以这里持续确认：旗子不在就注册一次，注册过就不再重复。
    // 注意：不能用模板字符串，build 会把 src/*.js 插进模板字符串。
    function claimSectionIfFree() {
      if (window.__dsh550cPageOwner) return
      if (window.__dsh550cBootPage === true) return
      window.__dsh550cBootPage = true
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
    window.setTimeout(claimSectionIfFree, 0)
    window.setInterval(claimSectionIfFree, 1500)

    ctx.slots.inject('settings.550c.item', () => {
    // The page wins. Drop the General placement first, or the same three rows
    // render in both ledgers.
    inGeneral?.()
    inGeneral = null
    placeOnSeries()
    return () => {
      onSeries?.()
      onSeries = null
      // The page went away — the skin was unloaded at run time. Go back to the
      // shared ledger rather than leaving this plugin with no settings at all.
      // Guarded because a teardown can race the shell's own, and registering into
      // a slot that is already gone throws.
      try {
        if (inGeneral === null) placeInGeneral()
      } catch (error) {
        /* General is gone too; there is nothing left to fall back to. */
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

  // The login is a phase of its own, not a child of the splash: with the splash
  // switched off nothing would ever call the hand-off, and a user who wants the
  // authorization screen without the 16-second intro would otherwise get neither.
  if (readMode() === 'off' && readLoginScreen() !== 'off') {
    ctx.effect(() => {
      const timer = window.setTimeout(() => startLoginPhase(), 150)
      return () => window.clearTimeout(timer)
    }, 'dsh-550c-boot: login without the splash')
  }

  // The splash is deliberately NOT a slot contribution — mountOverlay() explains
  // why. Registered as an effect so disabling the plugin takes the splash down.
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
  // 两者都开会先播 16 秒片头、再播 UEG 三幕，等于两段片头。
  // 注意 bootSplash 是 const，只调 dispose()、不重新赋值。
  try {
    if (bootSplash !== null && typeof readLoginScreen === 'function' && readLoginScreen() === 'ueg') bootSplash.dispose()
  } catch (error) {
    console.error('[dsh-550c-boot] splash exclusion failed', error)
  }

exports.name = 'boot-550c'
exports.inject = ['slots']
exports.apply = apply
