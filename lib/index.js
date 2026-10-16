/**
 * Host half of dsh-550c-boot.
 *
 * The animation itself is browser-side (lib/client.js). Its FIRST FRAME cannot
 * be: DSH's boot card ("HARNESS / Loading plugins…") is drawn by the shell
 * before any client plugin is materialised — measured on this machine, card at
 * 67 ms, this plugin's bundle evaluated at 338 ms, card disposed at 517 ms — so
 * a plugin that only paints from its own JS always leaves the card on screen
 * for a few hundred milliseconds, at any z-index.
 *
 * The one surface that exists earlier than the shell is the served document, and
 * DSH exposes it: `webserver/index-inject` collects a table of index rows, which
 * the Web carrier renders into index.html immediately after `<head>` and the
 * Desktop carrier applies page-side before it settles `__DSH_BOOT_READY__` —
 * both ahead of the shell kernel that builds the card. A `style` row plus one
 * synchronous `script` row is therefore on the glass while the document is still
 * parsing, and the card is never visible in the first place.
 *
 * Two contracts with src/client.js:
 *
 *   MODE_KEY   the same localStorage key and the same default; the script below
 *              bows out for 'off' so that setting still boots straight through
 *              to DSH with no black frame.
 *   FIRST_FRAME_GLOBAL
 *              `window.__dsh550cFirstFrame.end()` is how the splash retires the
 *              cover once its shadow root is on screen — same task, one paint,
 *              no seam. The boot watch and the timeout below are the fallbacks:
 *              a client bundle that fails to load must never leave a black
 *              window behind.
 *
 * @module dsh-550c-boot
 */

import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, resolve, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'boot-550c'

/** src/client.js MODE_KEY / DEFAULT_MODE — keep in sync. */
const MODE_KEY = 'dsh-550c-boot:mode'
/** src/client.js FIRST_FRAME_GLOBAL — keep in sync. */
const FIRST_FRAME_GLOBAL = '__dsh550cFirstFrame'
/** src/client.js VERSION_GLOBAL — the running version, for the settings row. */
const VERSION_GLOBAL = '__dsh550cVersion'
/** Painted under the splash's own --bg, so the handoff is invisible. */
const FIRST_FRAME_BG = '#050403'
/** Absolute ceiling (ms): past this the cover yields whatever is on the page. */
const FIRST_FRAME_MAX_MS = 12000
/** The splash's own :host z-index (src/client.js HOST_CSS) minus one. */
const FIRST_FRAME_Z = 2147482000

/**
 * Where the settings row's 检查更新 button gets its answer, and where its
 * 立即更新 button goes to actually install.
 *
 * Both run HERE, not in the page: the served document's CSP is restrictive and the
 * host process already owns outbound network access, so same-origin routes keep the
 * client free of cross-origin requests, CORS and CSP questions.
 *
 * The source is npm, not GitHub releases. Measured from this machine: the npmmirror
 * mirror answers in ~160 ms and registry.npmjs.org in ~2.1 s, so the mirror is tried
 * first and the official registry is the fallback — a China-side install gets the
 * fast one, everyone else silently gets the authoritative one.
 */
const PACKAGE_NAME = 'dsh-550c-boot'
/** 更新检查的路由（GET）。 */
const UPDATE_ROUTE = '/dsh-550c-boot/update'
const APPLY_ROUTE = '/dsh-550c-boot/update/apply'
const REGISTRIES = [
  { id: 'npmmirror', base: 'https://registry.npmmirror.com' },
  { id: 'npmjs', base: 'https://registry.npmjs.org' },
]
/** One upstream answer is reused for this long; the button is cheap to press. */
const UPDATE_TTL_MS = 5 * 60 * 1000
const UPDATE_TIMEOUT_MS = 6000
/** An install is slower than a lookup, and is killed rather than left running. */
const APPLY_TIMEOUT_MS = 180000
const APPLY_OUTPUT_LIMIT = 4000

/**
 * The running version, read from the package that is actually installed.
 *
 * Reading package.json beats a build-time constant: a linked working tree (the
 * maintainer's own install) and a tarball both report the truth, and the version
 * can never drift from the manifest a release was cut from.
 */
function packageVersion() {
  try {
    const url = new URL('../package.json', import.meta.url)
    return JSON.parse(readFileSync(url, 'utf8')).version ?? null
  } catch (error) {
    return null
  }
}

const VERSION = packageVersion()

/**
 * Compare two semver-ish versions. Returns 1 when `a` is newer, -1 when `b` is,
 * 0 when they are equal. Build metadata is ignored; a prerelease ranks below its
 * own release (`0.2.0-rc.1 < 0.2.0`), which is what decides "an update is out".
 */
function compareVersions(a, b) {
  const parse = (value) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(value ?? ''))
    return match === null ? null : { parts: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null }
  }
  const left = parse(a)
  const right = parse(b)
  if (left === null || right === null) return 0
  for (let index = 0; index < 3; index += 1) {
    if (left.parts[index] !== right.parts[index]) return left.parts[index] > right.parts[index] ? 1 : -1
  }
  if (left.pre === right.pre) return 0
  if (left.pre === null) return 1
  if (right.pre === null) return -1
  return left.pre > right.pre ? 1 : -1
}

/** The cached upstream answer, so repeated presses do not hammer the registry. */
let cachedRelease = null
let cachedAt = 0

async function latestFrom(base) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS)
  try {
    const response = await fetch(`${base}/${PACKAGE_NAME}/latest`, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-550c-boot-update-check' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`${base} responded ${String(response.status)}`)
    const manifest = await response.json()
    const version = typeof manifest.version === 'string' ? manifest.version : null
    if (version === null) throw new Error(`${base} sent no version`)
    return { version, tarball: typeof manifest.dist?.tarball === 'string' ? manifest.dist.tarball : null }
  } finally {
    clearTimeout(timer)
  }
}

/** Mirror first, official registry second; the first one that answers wins. */
async function latestPublished() {
  if (cachedRelease !== null && Date.now() - cachedAt < UPDATE_TTL_MS) return cachedRelease
  const failures = []
  for (const registry of REGISTRIES) {
    try {
      const found = await latestFrom(registry.base)
      cachedRelease = { latest: found.version, tarball: found.tarball, source: registry.id }
      cachedAt = Date.now()
      return cachedRelease
    } catch (caught) {
      failures.push(`${registry.id}: ${caught instanceof Error ? caught.message : String(caught)}`)
    }
  }
  throw new Error(failures.join('; '))
}

/**
 * Which profile is running, and whether this plugin may install into it.
 *
 * `dsh plugin` refuses `desktop` outright — its check is literally
 * `profile.toLowerCase() === "desktop"` — because the Electron application owns
 * that profile. So the row offers the one-click install everywhere else and the
 * in-app instructions on the Desktop, where the app's own plugin manager is the
 * only thing allowed to touch it.
 */
function profileInfo() {
  const profile = typeof process.env.DSH_PROFILE === 'string' ? process.env.DSH_PROFILE : null
  if (profile === null || profile === '') {
    return { profile: null, canApply: false, reason: 'unknown-profile' }
  }
  if (profile.toLowerCase() === 'desktop') {
    return { profile, canApply: false, reason: 'desktop-profile' }
  }
  return { profile, canApply: true, reason: null }
}

/** The DSH CLI that owns profiles, located from the environment it was booted in. */
function cliEntry() {
  const candidates = [
    process.env.DSH_PROFILE_DIR === undefined ? null : `${process.env.DSH_PROFILE_DIR}/node_modules/@deepseek-ai/dsh/lib/bin.js`,
    process.env.DSH_HOME === undefined ? null : `${process.env.DSH_HOME}/profiles/node_modules/@deepseek-ai/dsh/lib/bin.js`,
    process.env.DSH_HOME === undefined ? null : `${process.env.DSH_HOME}/node_modules/@deepseek-ai/dsh/lib/bin.js`,
  ].filter((candidate) => candidate !== null)
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

/** The command an update runs. Pure, so the tests can pin the argv. */
function installCommand(profile) {
  return { file: process.execPath, args: [cliEntry() ?? '', 'plugin', '--profile', profile, 'add', `${PACKAGE_NAME}@latest`] }
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * GET /dsh-550c-boot/update ->
 *   { current, latest, state, source, tarball, package, profile, canApply, reason }
 *
 * `state` is the whole answer the row needs: 'current', 'outdated', or 'unknown'
 * when neither registry could be reached — the row then says so instead of
 * pretending to know.
 */
async function updateHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  const who = profileInfo()
  let found = null
  let error = null
  try {
    found = await latestPublished()
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }
  const latest = found?.latest ?? null
  const state =
    latest === null ? 'unknown' : VERSION === null ? 'unknown' : compareVersions(latest, VERSION) > 0 ? 'outdated' : 'current'
  sendJson(res, 200, {
    current: VERSION,
    latest,
    state,
    source: found?.source ?? null,
    tarball: found?.tarball ?? null,
    package: PACKAGE_NAME,
    url: `https://www.npmjs.com/package/${PACKAGE_NAME}`,
    profile: who.profile,
    canApply: who.canApply,
    reason: who.reason,
    error,
  })
}

/**
 * POST /dsh-550c-boot/update/apply -> { ok, output, restart, version }
 *
 * The update service: it runs the profile's own package manager through the DSH
 * CLI, which is the only supported way to change a profile's plugins, and reports
 * the CLI's output verbatim — including its refusal, which is how the Desktop's
 * app-managed profile answers. The caller has to ask for it explicitly; nothing
 * here runs on its own.
 */
async function applyHandler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end()
    return
  }
  await readBody(req).catch(() => '')
  const who = profileInfo()
  if (!who.canApply) {
    sendJson(res, 409, {
      ok: false,
      reason: who.reason,
      profile: who.profile,
      hint:
        who.reason === 'desktop-profile'
          ? `桌面客户端独占管理 desktop profile，请在 设置 → 插件 里安装 ${PACKAGE_NAME}@latest，然后重启客户端。`
          : `无法确定当前 profile，请在插件管理器里安装 ${PACKAGE_NAME}@latest。`,
    })
    return
  }
  const entry = cliEntry()
  if (entry === null) {
    sendJson(res, 409, { ok: false, reason: 'no-cli', hint: `找不到 DSH CLI，请在插件管理器里安装 ${PACKAGE_NAME}@latest。` })
    return
  }
  const command = installCommand(who.profile)
  const result = await new Promise((resolve) => {
    const child = spawn(command.file, command.args, { cwd: process.env.DSH_PROFILE_DIR ?? undefined, windowsHide: true })
    let output = ''
    const collect = (chunk) => {
      if (output.length < APPLY_OUTPUT_LIMIT) output += chunk.toString('utf8')
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => {
      output += `\n[update] timed out after ${String(APPLY_TIMEOUT_MS)} ms`
      child.kill()
    }, APPLY_TIMEOUT_MS)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: null, output: `${output}\n${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })
  const ok = result.code === 0
  // The row normally checks first, which fills the cache; an apply that arrives on
  // its own looks the version up once more so the answer always names a version.
  const version = ok ? (cachedRelease?.latest ?? (await latestPublished().then((found) => found.latest).catch(() => null))) : null
  sendJson(res, ok ? 200 : 500, {
    ok,
    code: result.code,
    output: result.output.slice(0, APPLY_OUTPUT_LIMIT),
    profile: who.profile,
    package: PACKAGE_NAME,
    restart: ok,
    version,
    hint: ok
      ? '更新完成，重启客户端生效。'
      : `更新失败。也可以在插件管理器里安装 ${PACKAGE_NAME}@latest。`,
  })
}

/**
 * The cover itself: the port's own background colour, above anything the page
 * paints and below the splash that replaces it. pointer-events stays off — the
 * card it covers is not interactive either.
 */
const FIRST_FRAME_CSS =
  'html.dsh550c-first::before{content:"";position:fixed;inset:0;background:' +
  FIRST_FRAME_BG +
  ';z-index:' +
  String(FIRST_FRAME_Z) +
  ';pointer-events:none}\n' +
  'html.dsh550c-first{background:' +
  FIRST_FRAME_BG +
  ';--dsw-specific-sidebar-fill:#141008;--dsw-alias-label-primary:#e8a020}'

/**
 * The class marker plus the handshake, the boot watch and the timeout.
 *
 * Deliberately tiny and synchronous: it runs while <head> is being parsed, so
 * the cover is applied before the first paint. The two DSH tokens it also sets
 * are the ones the Desktop preload measures into `setTitleBarOverlay` (see
 * src/client.js adaptCaption), which paints the OS caption strip black-and-amber
 * for the same window instead of leaving a grey Windows bar above a terminal.
 *
 * The cover must not outlive the reason for it, so a 250 ms watch ends it as
 * soon as the boot card is gone (the kernel removes the card exactly when the
 * application mounts) — or as soon as the card drops its spinner, which is how
 * the card renders its own failure state, since a broken page must be readable
 * rather than hidden. Nothing here is on the critical path: the splash retires
 * the cover itself, synchronously, the moment its shadow root is on screen.
 */
const FIRST_FRAME_SCRIPT =
  '(function(){' +
  'var mode=null;var login=null;' +
  'try{mode=window.localStorage.getItem(' +
  JSON.stringify(MODE_KEY) +
  ');login=window.localStorage.getItem("dsh-550c-boot:login")}catch(error){}' +
  'if(mode==="off"&&login!=="ueg")return;' +
  'var root=document.documentElement;' +
  'var watch=null;' +
  'var end=function(){' +
  'if(watch!==null){window.clearInterval(watch);watch=null}' +
  'root.classList.remove("dsh550c-first")' +
  '};' +
  'window.' +
  FIRST_FRAME_GLOBAL +
  '={end:end};' +
  'root.classList.add("dsh550c-first");' +
  'var seen=false;' +
  'watch=window.setInterval(function(){' +
  'var card=document.querySelector("[data-dsh-boot]");' +
  'if(card===null){if(seen)end();return}' +
  'seen=true;' +
  'if(card.querySelector("[data-dsh-boot-spinner]")===null)end()' +
  '},250);' +
  'window.setTimeout(end,' +
  String(FIRST_FRAME_MAX_MS) +
  ');' +
  '})()'

/**
 * UEG 启动动画 · web 端验证用的本地路由。
 *
 * 把预览页与配音挂到插件自己的 HTTP 前缀下，于是能在 DSH 的 web 实例里直接打开看：
 *   /ueg/          → preview/ueg.html
 *   /ueg/assets/*  → preview/assets/*
 *   /ueg/voice/*   → preview/voice/*（配音随包发布：每句一个 wav，由 Python 逐句切）
 *
 * 页面里的素材与配音都写成相对路径，所以这三条前缀天然对齐：
 * 预览页 URL 是 /ueg.html → 相对解析成 /voice/；插件页是 /ueg/ → 变成 /ueg/voice/。
 */
const UEG_PREFIX = '/ueg'
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** 动画页随包发布，所以按【本文件所在位置】解析，不写死机器路径。 */
const UEG_PAGE_ROOT = resolve(REPO_ROOT, 'preview')
/** 语音也随包发布：preview/voice/ 下每句一个文件。 */
const UEG_VOICE_ROOT = resolve(UEG_PAGE_ROOT, 'voice')
const UEG_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
}

/** @param req - the incoming request. @param res - the response to fill. */
function uegHandler(req, res) {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const clean = decodeURIComponent(url.pathname.slice(UEG_PREFIX.length)).replace(/^\/+/, '')
  const inVoice = clean === 'voice' || clean.startsWith('voice/')
  const base = inVoice ? UEG_VOICE_ROOT : UEG_PAGE_ROOT
  const relative = inVoice
    ? clean.slice('voice'.length).replace(/^\/+/, '')
    : clean === '' ? 'ueg.html' : clean
  const file = resolve(base, relative)
  // 目录穿越防护：解析后的绝对路径必须仍在该根目录内
  if (!file.startsWith(resolve(base) + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('forbidden')
    return
  }
  try {
    const body = readFileSync(file)
    res.writeHead(200, {
      'content-type': UEG_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    res.end(body)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
  }
}

/**
 * 把 UEG 界面装成 DSH 的启动动画：打开 web 端时先整屏盖住，动画走完再撤掉。
 *
 * 用 iframe 而不是把整页 HTML 拆进 index：那页是自包含的完整文档（含自己的 style/script、
 * canvas、音频解码），塞进 iframe 才能原样运行、也不会和 DSH 自己的样式互相污染。
 * 收尾由页面 postMessage('ueg:done') 通知，这里淡出并移除。
 *
 * 关掉的办法：URL 加 ?ueg=0，或在控制台 localStorage.setItem('dsh-ueg-off','1')。
 */
const UEG_BOOT_CSS = `.dsh-ueg-boot{position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483000;background:#05060a;transition:opacity 650ms ease}`

const UEG_BOOT_SCRIPT = `(function () {
  try {
    var params = new URLSearchParams(location.search);
    if (params.get('ueg') === '0') return;
    if (localStorage.getItem('dsh-ueg-off') === '1') return;
  } catch (error) { /* 隐私模式取不到 localStorage，就按默认装上 */ }
  function mount() {
    var frame = document.createElement('iframe');
    frame.className = 'dsh-ueg-boot';
    frame.setAttribute('title', 'UEG access terminal');
    frame.src = '/ueg/';
    document.body.appendChild(frame);
    window.addEventListener('message', function (event) {
      if (event.data !== 'ueg:done' || event.source !== frame.contentWindow) return;
      frame.style.opacity = '0';
      window.setTimeout(function () { frame.remove(); }, 700);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})()`

/**
 * Contribute the first frame to every index response.
 *
 * No service is injected: `webserver/index-inject` is a plain composition event
 * that the carrier emits per response, and a table is only rendered when a page
 * is actually served — so this costs one row and nothing when nobody asks.
 *
 * The update routes are registered through an optional injection instead
 * (`ctx.inject(['webServer'], …)`), so a profile without an HTTP carrier — or one
 * that renames the service — still gets the splash; only the settings row loses
 * its buttons.
 *
 * @param ctx - the plugin context.
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: FIRST_FRAME_CSS })
    table.push({ kind: 'script', placement: 'head', text: FIRST_FRAME_SCRIPT })
    // Ahead of the script rows: the settings row reads its own version from here
    // rather than asking the host for something it can already know.
    if (VERSION !== null) table.push({ kind: 'global', name: VERSION_GLOBAL, value: VERSION })
  })

  ctx.inject(['webServer'], (webCtx) => {
    // UEG 启动动画（web 端验证）：页面 + 素材 + 配音
    webCtx.effect(
      () => {
        try {
          return webCtx.webServer.register({
            kind: 'prefix',
            path: UEG_PREFIX,
            handler: uegHandler,
          })
        } catch (error) {
          // 桌面端的 webServer 若不支持 prefix 路由，注册失败也只能少一个 /ueg 通道，
          // 绝不能让一个可选路由把插件连带宿主一起带崩。
          console.error('[dsh-550c-boot] /ueg route registration failed', error)
          return () => {}
        }
      },
      `boot-550c: GET ${UEG_PREFIX}/*`,
    )
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: UPDATE_ROUTE,
          handler: updateHandler,
        }),
      `boot-550c: GET ${UPDATE_ROUTE}`,
    )
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: 'exact',
          path: APPLY_ROUTE,
          handler: applyHandler,
        }),
      `boot-550c: POST ${APPLY_ROUTE}`,
    )
  })
}
