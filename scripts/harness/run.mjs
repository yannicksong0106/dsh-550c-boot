/**
 * Run the harness in a headless browser and report.
 *
 * Usage: node scripts/harness/run.mjs [port]
 *
 * Each case loads a generated harness page over http, dumps the DOM after a
 * virtual time budget, and reads the #probe JSON the page writes for itself.
 * Screenshot cases save a PNG instead, which is what shows whether DSH's boot card
 * is visible or covered.
 *
 * Run scripts/harness/build.mjs first (npm run verify does both). The browser is
 * Edge, Chrome or Chromium — whichever is found, or DSH_550C_BROWSER. When none is
 * installed the suite reports that and exits 0, so a host-only CI run is not a
 * failure; scripts/test-host.mjs is the part that always has to pass.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.argv[2] ?? 3499)
// Generated pages are build output (.verify/harness); the seed page is a tracked
// source, served straight out of scripts/harness.
const base = `http://127.0.0.1:${String(port)}/.verify/harness`
const HARNESS = '/.verify/harness'
const SEED = '/scripts/harness/seed.html'

// The pages and the bundle are served from the project root, so the suite is one
// command: it starts the static server itself and stops it on the way out.
const server = spawn(process.execPath, [resolve(here, 'serve.mjs'), String(port)], {
  stdio: 'ignore',
  windowsHide: true,
})
const stopServer = () => {
  try {
    server.kill()
  } catch {
    /* already gone */
  }
}
process.on('exit', stopServer)
process.on('SIGINT', () => {
  stopServer()
  process.exit(130)
})

const BROWSER = [
  process.env.DSH_550C_BROWSER,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].find((candidate) => candidate !== undefined && existsSync(candidate))
if (BROWSER === undefined) {
  process.stdout.write('harness: no Edge/Chrome/Chromium found; skipping the browser suite.\n')
  process.stdout.write('harness: set DSH_550C_BROWSER to a browser binary to run it.\n')
  process.exit(0)
}

const profile = resolve(here, '../../.verify/harness-profile')
const shots = resolve(here, '../../.verify/shots')
mkdirSync(shots, { recursive: true })

const COMMON = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars']

function edge(url, extra) {
  const args = [...COMMON, `--user-data-dir=${profile}`, ...extra, url]
  const result = spawnSync(BROWSER, args, { encoding: 'utf8', windowsHide: true })
  return result.stdout ?? ''
}

function probe(mode, file, query, budget) {
  const html = edge(seedUrl(mode, file, query), [`--virtual-time-budget=${String(budget)}`, '--dump-dom'])
  const match = /<div id="probe">(.*?)<\/div>/s.exec(html)
  if (match === null) throw new Error(`run-harness: no probe for ${file}?${query} (mode ${mode})`)
  return JSON.parse(match[1])
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}${SEED}`, { method: 'HEAD' })
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 100))
  }
  throw new Error('harness: the static server never came up')
}
await waitForServer()

function shoot(mode, file, query, budget, name, caption) {
  const path = resolve(shots, `${name}.png`)
  rmSync(path, { force: true })
  edge(seedUrl(mode, file, query), [`--virtual-time-budget=${String(budget)}`, `--screenshot=${path}`, '--window-size=1280,820'])
  if (!existsSync(path)) throw new Error(`run-harness: the browser wrote no ${path}`)
  return path
}

/**
 * Seed the mode and navigate to the harness page inside one browser session:
 * a separate seeding run is not reliable, because the write can be lost when a
 * headless process exits.
 */
function seedUrl(mode, file, query) {
  const next = `${HARNESS}/${file}?${query}`
  return `http://127.0.0.1:${String(port)}${SEED}?mode=${mode}&next=${encodeURIComponent(next)}`
}

const cases = []

// 1. the plugin's own rows: cover before any plugin code, caption adaptation, splash
cases.push(['simple · plugin rows', probe('simple', 'index.html', 'delay=0', 1500)])

// 2. the control: same page, same stub card, rows withheld
cases.push(['simple · rows withheld', probe('simple', 'index-norows.html', 'delay=0', 1500)])

// 3. full mode: #hud-top exists, so the caption strip has something to reserve
cases.push(['full · plugin rows', probe('full', 'index.html', 'delay=0', 1500)])

// 4. the mode pref still wins: the cover must not appear for 关闭
cases.push(['off · plugin rows', probe('off', 'index.html', 'delay=0', 1500)])

// 4b. macOS: the overlay must not subtract the window from the drag region.
//     index-darwin.html carries the official `body>:not(#root){no-drag}` rule and
//     a [data-window-drag] chrome row, and reports the computed app-region with
//     our guard sheet, without it (the control), and after restoring it.
cases.push(['darwin · window drag guard', probe('simple', 'index-darwin.html', 'delay=0', 4000)])

// 4b-2. macOS HUD geometry: 76px clears trafficLightPosition{x:16} + the shell's
//       own 52px strip + 8px of room; fullscreen collapses it, whether the shell
//       reports fullscreen before the mount or while the splash is on screen.
cases.push(['darwin · HUD reserve', probe('full', 'index-darwin.html', 'delay=0', 4000)])
cases.push(['darwin · HUD reserve, fullscreen before mount', probe('full', 'index-darwin.html', 'delay=0&fs=initial', 4000)])
cases.push(['darwin · HUD reserve, fullscreen after mount', probe('full', 'index-darwin.html', 'delay=0&fs=late', 4000)])

// 4b-3. the family-hostile page: the dsh-web aggregate styles and reuses
//       `[data-dsh-boot-splash]`. The splash must keep its own marker, its own
//       geometry (z-index 2147483000, not 9999), pointer-events for click-to-skip,
//       its own hand-off transition and a document-tree drag band — and the
//       family's shield query must find nothing to reuse.
cases.push(['family bundle · marker collision', probe('simple', 'index-family.html', 'delay=0', 4000)])

// 4c. the caption strip, measured through the preload's own probe: while the
//     splash plays the strip must be transparent (buttons float on the animation)
//     with the symbols in the scheme's accent, and the app's own tokens untouched.
cases.push(['caption · transparent strip', probe('simple', 'index.html', 'delay=0', 1500)])

// 4d. the settings rows, rendered for real (scripts/harness/rows.js): the text a
//     user reads, the buttons they get, and the three outcomes of the update check.
cases.push(['settings rows · rendered text', probe('simple', 'index.html', 'delay=0', 2500)])

// 5. the shell's failure card keeps its spinner removed: the cover must retire
//    itself rather than hide the failure (the plugin never materialises here)
cases.push(['failure card · cover retires itself', probe('simple', 'index-failure.html', 'delay=999999&coverAt=1500', 2500)])

// screenshots: the card, covered and not, then the splash actually playing
cases.push(['shot · card state, rows active (expect black cover)', shoot('simple', 'index.html', 'delay=9000', 700, 'card-covered')])
cases.push(['shot · card state, rows withheld (expect HARNESS card)', shoot('simple', 'index-norows.html', 'delay=9000', 700, 'card-exposed')])
cases.push(['shot · simple splash playing', shoot('simple', 'index.html', 'delay=0', 2500, 'splash-simple')])
cases.push(['shot · full splash playing', shoot('full', 'index.html', 'delay=0', 7000, 'splash-full')])

/**
 * What each case has to show, field by field.
 *
 * The suite used to print the probes and leave the judging to a human, which is
 * exactly how 0.1.4 shipped a `data-window-drag` attribute that could never work
 * (the assertion checked that the attribute existed, not that it did anything) and
 * how the dsh-web marker collision stayed invisible. Every case below therefore
 * names the fields it depends on; a mismatch fails the run.
 *
 * Screenshot cases carry no expectations: they are evidence for a human, not
 * assertions.
 */
const EXPECT = {
  'simple · plugin rows': {
    coverApplied: true,
    registration: true,
    overlayMounted: true,
    coverAfterModule: false,
    captionAttr: 'windows',
  },
  'simple · rows withheld': { coverApplied: false, registration: false, overlayMounted: false },
  'full · plugin rows': { coverApplied: true, overlayMounted: true, hudPresent: true, hudPadRight: '0px' },
  'off · plugin rows': { coverApplied: false, overlayMounted: false },
  'darwin · window drag guard': {
    // With the guard sheet the overlay leaves the app-region computation entirely
    // (`none`); without it the official rule claims it (`no-drag`) — that control is
    // what proves the guard is doing the work.
    appRegionWithGuard: 'none',
    appRegionWithoutGuard: 'no-drag',
    appRegionRestored: 'none',
    chromeAppRegion: 'drag',
    overlayGoneAfterClick: true,
  },
  'darwin · HUD reserve': {
    captionAttr: 'darwin',
    hudPadLeft: '76px',
    hostFullscreen: false,
    // The HUD strip lives in the shadow root, where the official rule cannot reach:
    // it must NOT be marked (0.1.4 did, to no effect).
    hudWindowDrag: false,
  },
  'darwin · HUD reserve, fullscreen before mount': {
    hudPadLeft: '0px',
    hostFullscreen: true,
    rootFullscreen: 'true',
    hudWindowDrag: false,
  },
  'darwin · HUD reserve, fullscreen after mount': {
    hudPadLeft: '0px',
    hostFullscreen: true,
    rootFullscreen: 'true',
    hudWindowDrag: false,
  },
  'family bundle · marker collision': {
    // The dsh-web aggregate styles and reuses [data-dsh-boot-splash]; none of that
    // may touch this overlay.
    shieldFoundHost: false,
    borrowedFamilyMarker: false,
    markerIsOurs: true,
    hostPointerEvents: 'auto',
    hostZIndex: '2147483000',
    hostBackground: 'rgb(5, 4, 3)',
    dragBandPresent: true,
    dragBandAppRegion: 'drag',
    dragBandMarker: true,
    overlayGoneAfterClick: true,
    dragBandGoneAfterClick: true,
  },
  'caption · transparent strip': {
    captionAttr: 'windows',
    captionStyleInHead: true,
    captionFill: '#050403',
    // The Desktop preload's own probe: transparent strip, accent symbols.
    probeBackground: 'rgba(0, 0, 0, 0)',
    probeColor: 'rgb(232, 160, 32)',
    // 3, not 2: rendering the settings rows adds their style sheet to <head>,
    // which is itself a re-measure trigger — the same mechanism the strip uses.
    probeSends: 3,
    probeSelectorMatches: 1,
    probeIsBodyChild: true,
    // The app's own tokens are still the app's, which is what makes the probe
    // measurement meaningful: our declaration has to win over these.
    bodySidebarFill: '#141008',
    bodyLabelPrimary: '#f9fafb',
  },
  'failure card · cover retires itself': { coverApplied: true, coverAfterWatch: false },
  // The settings rows, rendered for real by scripts/harness/rows.js: these are the
  // exact strings a user reads, so a wording change has to be deliberate.
  'settings rows · rendered text': {
    'rows.ids': 'boot-550c,boot-550c-scheme,boot-550c-update,boot-550c-login',
    'rows.mode.title': '550C 开机动画',
    'rows.mode.desc': '启动时播放 550C 片头；完整模式可用点击或 Esc 跳过。',
    'rows.mode.buttons': '关闭,简易,完整,预览',
    'rows.scheme.desc': '琥珀是原作的配色，也是默认值。',
    'rows.login.title': '登录授权界面',
    'rows.login.desc': '片头之后先走一段访问授权：点击或 Enter 推进，Esc 跳过；语音与音效在本机生成，不带素材。',
    'rows.login.buttons': '关闭,UEG,550C,慢,标准,快,预览',
    'rows.versionIdle.desc': /^当前 v\d+\.\d+\.\d+，从 npm 查询最新版本。$/,
    'rows.versionIdle.buttons': '检查更新',
    'rows.versionCurrent.note': /^已是最新 v\d+\.\d+\.\d+。打开 npm 页面$/,
    'rows.versionDesktop.note': '有新版本 v9.9.9。在 设置 → 插件 里装 dsh-550c-boot@latest，然后重启。复制包名',
    'rows.versionDesktop.canUpdate': false,
    'rows.versionWeb.note': '有新版本 v9.9.9。点「立即更新」，然后重启客户端。',
    'rows.versionWeb.canUpdate': true,
    'rows.versionWeb.buttons': '检查更新,立即更新',
    'rows.versionMissing.note': '宿主半边是旧版本，重启客户端后可用。打开 npm 页面',
  },
}

let failures = 0
let asserted = 0
/** Field paths may be dotted: the settings-row report is a nested object. */
const pick = (value, path) =>
  path.split('.').reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), value)

for (const [name, value] of cases) {
  const expected = EXPECT[name]
  const isShot = typeof value === 'string'
  process.stdout.write(`\n### ${name}\n`)
  if (isShot) {
    process.stdout.write(`${value}\n`)
    continue
  }
  if (expected === undefined) {
    failures += 1
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    process.stdout.write(`  !! no expectations declared for "${name}"\n`)
    continue
  }
  const problems = []
  for (const [field, want] of Object.entries(expected)) {
    asserted += 1
    const got = pick(value, field)
    // A RegExp expectation keeps version-bearing strings stable across releases.
    const matches = want instanceof RegExp ? want.test(String(got)) : got === want
    if (!matches) problems.push(`${field}: expected ${String(want)}, got ${JSON.stringify(got)}`)
  }
  if (problems.length === 0) {
    process.stdout.write(`  ok  ${String(Object.keys(expected).length)} assertions\n`)
  } else {
    failures += problems.length
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
    for (const problem of problems) process.stdout.write(`  !! ${problem}\n`)
  }
}

// the built bundle is the artifact under test: make sure the page really loaded it
const bundle = readFileSync(resolve(here, '../../lib/client.js'), 'utf8')
process.stdout.write(`\nlib/client.js: ${String(bundle.length)} chars\n`)
process.stdout.write(
  failures === 0
    ? `\nharness: ${String(asserted)} assertions passed (${String(cases.length)} cases)\n`
    : `\nharness: ${String(failures)} FAILED of ${String(asserted)} assertions\n`,
)
// The static server is a child process, so the event loop would otherwise stay
// alive and the suite would hang after printing its result.
stopServer()
process.exit(failures === 0 ? 0 : 1)
