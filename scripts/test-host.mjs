/**
 * Host-half tests: the npm update check, the update service, the version
 * comparison, and the wiring apply() performs. Pure node — no browser, no DSH —
 * so CI always runs it.
 *
 * The handlers are module-private on purpose (the plugin exposes one apply()), so
 * the test lifts them out of the built lib/index.js and drives them with fake
 * req/res objects and a fake child process. That keeps the risky parts covered
 * without a running profile: the mirror-first lookup and its fallback, the
 * desktop-profile refusal, the install argv, and the routes that get registered.
 */
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(here, '../lib/index.js')
const source = readFileSync(LIB, 'utf8')

const lift = (from, to, name) => {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)
  if (start < 0 || end < 0) throw new Error(`cannot lift ${name}`)
  // `import.meta` is not available inside new Function(); packageVersion() only
  // uses it to locate package.json, and the stub below does that itself.
  return source.slice(start, end).replaceAll('import.meta.url', 'globalThis.__metaUrl')
}

/** A child process that reports the exit code the test wants. */
function fakeSpawn(code, output) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setTimeout(() => {
      if (output !== '') {
        child.stdout.emit('data', Buffer.from(output, 'utf8'))
      }
      child.emit('close', code)
    }, 0)
    return child
  }
}

const factory = new Function(
  'fetch',
  'readFileSync',
  'existsSync',
  'spawn',
  lift('const VERSION_GLOBAL', 'const FIRST_FRAME_CSS', 'helpers') +
    '; return { compareVersions, updateHandler, applyHandler, latestPublished, profileInfo, installCommand, packageVersion }',
)

const readFileSyncStub = (path, encoding) =>
  readFileSync(path instanceof URL ? fileURLToPath(path) : String(path), encoding)
globalThis.__metaUrl = import.meta.url

const load = (fetchImpl, options = {}) =>
  factory(
    fetchImpl,
    readFileSyncStub,
    options.existsSync ?? (() => true),
    options.spawn ?? fakeSpawn(0, ''),
  )

const registryOk = (version) => async (url) => {
  if (!String(url).startsWith(REGISTRY)) throw new Error(`unexpected url ${String(url)}`)
  return { ok: true, status: 200, json: async () => ({ version, dist: { tarball: `https://x/${version}.tgz` } }) }
}
const REGISTRY = 'https://registry.npmmirror.com'
const OFFICIAL = 'https://registry.npmjs.org'

/** Answer the mirror and the official registry differently, to prove the order. */
const bothRegistries = (mirror, official) => async (url) => {
  const target = String(url).startsWith(REGISTRY) ? mirror : String(url).startsWith(OFFICIAL) ? official : null
  if (target === null) throw new Error(`unexpected url ${String(url)}`)
  if (target instanceof Error) throw target
  return { ok: true, status: 200, json: async () => ({ version: target, dist: { tarball: `https://x/${target}.tgz` } }) }
}

const fakeResponse = () => {
  const out = { status: null, headers: null, body: null, ended: false }
  return {
    out,
    res: {
      writeHead(status, headers) {
        out.status = status
        out.headers = headers ?? null
      },
      end(body) {
        out.ended = true
        out.body = body ?? null
      },
    },
  }
}

const fakeRequest = (method, body = '') => ({
  method,
  async *[Symbol.asyncIterator]() {
    if (body !== '') yield Buffer.from(body, 'utf8')
  },
})

let failures = 0
const check = (label, condition, detail) => {
  if (!condition) failures += 1
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : `  (${detail})`}`)
}

console.log('version comparison')
{
  const { compareVersions } = load(registryOk('0.0.1'))
  for (const [a, b, want] of [
    ['0.2.0', '0.1.4', 1],
    ['0.1.4', '0.2.0', -1],
    ['0.1.4', '0.1.4', 0],
    ['v0.1.5', '0.1.4', 1],
    ['0.2.0-rc.1', '0.1.4', 1],
  ['0.2.0-rc.2', '0.2.0-rc.1', 1],
  ['0.2.0-rc.2', '0.2.0', -1],
    ['0.1.4', '0.1.4-rc.1', 1],
    ['0.1.10', '0.1.9', 1],
    ['nonsense', '0.1.4', 0],
  ]) {
    check(`compare(${a}, ${b}) = ${String(want)}`, compareVersions(a, b) === want, `got ${String(compareVersions(a, b))}`)
  }
}

console.log('\npackage version')
{
  const { packageVersion } = load(registryOk('0.0.1'))
  check('reads the installed package.json', /^\d+\.\d+\.\d+/.test(String(packageVersion())), String(packageVersion()))
}

console.log('\nregistry lookup (mirror first)')
{
  const { latestPublished } = load(bothRegistries('9.9.9', '8.8.8'))
  const found = await latestPublished()
  check('prefers the mirror', found.source === 'npmmirror' && found.latest === '9.9.9', JSON.stringify(found))

  const { latestPublished: fallback } = load(bothRegistries(new Error('mirror down'), '8.8.8'))
  const second = await fallback()
  check('falls back to the official registry', second.source === 'npmjs' && second.latest === '8.8.8', JSON.stringify(second))

  const { latestPublished: broken } = load(
    bothRegistries(new Error('mirror down'), new Error('official down')),
  )
  let threw = null
  try {
    await broken()
  } catch (error) {
    threw = error
  }
  check('reports both failures', threw !== null && String(threw.message).includes('mirror down') && String(threw.message).includes('official down'))

  let calls = 0
  const { latestPublished: cached } = load(async (url) => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({ version: '9.9.9', dist: {} }) }
  })
  await cached()
  await cached()
  check('a second press reuses the cache', calls === 1, `upstream calls ${String(calls)}`)
}

console.log('\nprofile handling')
{
  // The environment the CLI path is derived from has to be pinned: on this
  // machine DSH_HOME and DSH_PROFILE_DIR are inherited from the running app, but
  // CI has neither, and the argv assertion below would then compare against an
  // empty path.
  const saved = { DSH_PROFILE: process.env.DSH_PROFILE, DSH_HOME: process.env.DSH_HOME, DSH_PROFILE_DIR: process.env.DSH_PROFILE_DIR }
  process.env.DSH_HOME = '/tmp/dsh-home'
  process.env.DSH_PROFILE_DIR = '/tmp/dsh-home/profiles/web'

  const { profileInfo, installCommand } = load(registryOk('0.0.1'))
  process.env.DSH_PROFILE = 'web'
  const web = profileInfo()
  check('web profile may be updated by the host', web.canApply === true && web.profile === 'web', JSON.stringify(web))
  const command = installCommand('web')
  check('install argv targets the CLI', String(command.args[0]).endsWith('dsh/lib/bin.js'), String(command.args[0]))
  check('install argv adds the package at latest', command.args.join(' ') === `${command.args[0]} plugin --profile web add dsh-550c-boot@latest`, command.args.join(' '))

  process.env.DSH_PROFILE = 'desktop'
  const desktop = profileInfo()
  check('desktop is refused before spawning anything', desktop.canApply === false && desktop.reason === 'desktop-profile', JSON.stringify(desktop))

  delete process.env.DSH_PROFILE
  const unknown = profileInfo()
  check('unknown profile is refused', unknown.canApply === false && unknown.reason === 'unknown-profile', JSON.stringify(unknown))

  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('\nupdate route')
{
  const { updateHandler } = load(bothRegistries('9.9.9', '8.8.8'))
  const refused = fakeResponse()
  await updateHandler(fakeRequest('POST'), refused.res)
  check('POST is refused with 405', refused.out.status === 405, `status ${String(refused.out.status)}`)

  const probe = fakeResponse()
  await updateHandler(fakeRequest('GET'), probe.res)
  const payload = JSON.parse(String(probe.out.body))
  check('GET answers 200 JSON', probe.out.status === 200 && probe.out.headers['content-type'].includes('json'))
  check('newer version -> outdated', payload.state === 'outdated' && payload.latest === '9.9.9', JSON.stringify(payload))
  check('names the source registry', payload.source === 'npmmirror')
  check('reports the running version', typeof payload.current === 'string' && payload.current.length > 0)
  check('points at the npm page', String(payload.url).includes('npmjs.com/package/dsh-550c-boot'))
  check('no-store', probe.out.headers['cache-control'] === 'no-store')

  const { updateHandler: same } = load(bothRegistries('0.0.1', '0.0.1'))
  const answer = fakeResponse()
  await same(fakeRequest('GET'), answer.res)
  check('older version -> current', JSON.parse(String(answer.out.body)).state === 'current')

  const { updateHandler: unknown } = load(bothRegistries(new Error('x'), new Error('y')))
  const down = fakeResponse()
  await unknown(fakeRequest('GET'), down.res)
  const downPayload = JSON.parse(String(down.out.body))
  check('both registries down -> unknown + error', downPayload.state === 'unknown' && String(downPayload.error).includes('x'))
}

console.log('\nupdate service')
{
  // Same reason as above: the CLI path comes from the environment, so pin it here
  // too rather than relying on whatever the developer's shell happens to carry.
  const savedEnv = {
    DSH_PROFILE: process.env.DSH_PROFILE,
    DSH_HOME: process.env.DSH_HOME,
    DSH_PROFILE_DIR: process.env.DSH_PROFILE_DIR,
  }
  process.env.DSH_HOME = '/tmp/dsh-home'
  process.env.DSH_PROFILE_DIR = '/tmp/dsh-home/profiles/web'
  process.env.DSH_PROFILE = 'desktop'
  const { applyHandler } = load(registryOk('0.0.1'), { spawn: fakeSpawn(0, 'should not run') })
  const desktop = fakeResponse()
  await applyHandler(fakeRequest('POST'), desktop.res)
  const desktopPayload = JSON.parse(String(desktop.out.body))
  check('desktop is refused with 409', desktop.out.status === 409 && desktopPayload.ok === false, `status ${String(desktop.out.status)}`)
  check('the refusal explains the in-app route', String(desktopPayload.hint).includes('设置 → 插件'), String(desktopPayload.hint))
  check('nothing was spawned', desktopPayload.output === undefined)

  process.env.DSH_PROFILE = 'web'
  const { applyHandler: allowed } = load(registryOk('0.0.1'), { spawn: fakeSpawn(0, 'added 1 package') })
  const ok = fakeResponse()
  await allowed(fakeRequest('POST'), ok.res)
  const okPayload = JSON.parse(String(ok.out.body))
  check('allowed profile -> 200 ok', ok.out.status === 200 && okPayload.ok === true, JSON.stringify(okPayload))
  check('the CLI output is passed through', String(okPayload.output).includes('added 1 package'), String(okPayload.output))
  check('restart is required', okPayload.restart === true)
  check('the version comes from the cached lookup', typeof okPayload.version === 'string', String(okPayload.version))

  const { applyHandler: failed } = load(registryOk('0.0.1'), { spawn: fakeSpawn(1, 'ERR_PNPM_NO_MATCHING_VERSION') })
  const bad = fakeResponse()
  await failed(fakeRequest('POST'), bad.res)
  const badPayload = JSON.parse(String(bad.out.body))
  check('a failing install -> 500 with the output', bad.out.status === 500 && String(badPayload.output).includes('ERR_PNPM'), JSON.stringify(badPayload.output).slice(0, 80))

  const { applyHandler: wrongMethod } = load(registryOk('0.0.1'))
  const method = fakeResponse()
  await wrongMethod(fakeRequest('GET'), method.res)
  check('GET is refused with 405', method.out.status === 405)

  const { applyHandler: noCli } = load(registryOk('0.0.1'), { existsSync: () => false })
  const missing = fakeResponse()
  await noCli(fakeRequest('POST'), missing.res)
  check('no CLI -> 409 no-cli', missing.out.status === 409 && JSON.parse(String(missing.out.body)).reason === 'no-cli')

  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('\nplugin wiring')
{
  const { apply } = await import(pathToFileURL(LIB).href)
  const events = new Map()
  const routes = []
  let injected = null
  const ctx = {
    on(name, handler) {
      events.set(name, handler)
      return () => {}
    },
    inject(deps, callback) {
      injected = deps
      callback({
        effect(fn) {
          const route = fn()
          if (route !== null && typeof route === 'object' && 'path' in route) routes.push(route)
        },
        webServer: {
          register(route) {
            return route
          },
        },
      })
    },
  }
  apply(ctx)

  const table = []
  const injectHandler = events.get('webserver/index-inject')
  check('listens to webserver/index-inject', typeof injectHandler === 'function')
  injectHandler(table)
  check('injects style + script + global', table.map((row) => row.kind).join(',') === 'style,script,global', table.map((row) => row.kind).join(','))
  check('global is __dsh550cVersion', table.find((row) => row.kind === 'global')?.name === '__dsh550cVersion')
  check('global carries a version', /^\d+\.\d+\.\d+/.test(String(table.find((row) => row.kind === 'global')?.value)))
  check('script row is head-placed', table.find((row) => row.kind === 'script')?.placement === 'head')
  check('cover css mentions the splash background', String(table[0].text).includes('#050403'))

  check('injects webServer optionally', JSON.stringify(injected) === '["webServer"]', JSON.stringify(injected))
  const paths = routes.map((route) => `${route.kind} ${route.path}`)
  check(
    'registers the check and the update route',
    paths.includes('exact /dsh-550c-boot/update') && paths.includes('exact /dsh-550c-boot/update/apply'),
    paths.join(', '),
  )
  check('both handlers are functions', routes.every((route) => typeof route.handler === 'function'))
}

// The settings rows are rendered and asserted by the browser suite
// (scripts/harness/rows.js + the "settings rows · rendered text" case): they live in
// the client bundle, which only runs inside a page.

// ── 客户端 bundle 的结构断言 ────────────────────────────────────────────────
// 这些不是"风格检查"，是三条真 bug 的看门人：
//   ① 有个页面归属旗子从来没人写入，却有两处代码拿它做判断（默认页签 / 页归属）
//   ② 归属定时器没有清理路径，插件禁用后还在跑
//   ③ 皮肤判定散在三个地方，各自读不同的键
// 结构一退回去，这里立刻红。
console.log('\nbundle structure')

const CLIENT = readFileSync(resolve(here, '../lib/client.js'), 'utf8')
/** 按 //#region <file> 切出一段源码在 bundle 里的样子；缺文件直接抛。 */
const regionOf = (name) => {
  const marker = '//#region ' + name
  const start = CLIENT.indexOf(marker)
  if (start < 0) throw new Error('bundle is missing region ' + name)
  const end = CLIENT.indexOf('//#endregion', start)
  if (end < 0) throw new Error('bundle region ' + name + ' is not closed')
  return CLIENT.slice(start, end)
}

check('bundle has the state module', CLIENT.includes('//#region src/state.js'))
check('state module declares the single skin check', regionOf('src/state.js').includes('function dsh550cSkinInstalled'))
check(
  'dead page-owner key is gone',
  !CLIENT.includes('__dsh550cPageOwner'),
  'still referenced somewhere in the bundle',
)
for (const retired of ['__dsh550cApplied', '__dsh550cBootPage', '__dsh550cRowsOnSeries', '__dsh550cSplashPlayed']) {
  check('retired global is gone: ' + retired, !CLIENT.includes(retired))
}
check('state root exists', CLIENT.includes('__dsh550cState'))
check(
  'state module comes first',
  CLIENT.indexOf('//#region src/state.js') < CLIENT.indexOf('//#region src/panel.js') &&
    CLIENT.indexOf('//#region src/state.js') < CLIENT.indexOf('//#region src/client.js'),
)
check(
  'panel default tab asks the state module',
  regionOf('src/panel.js').includes('dsh550cSkinInstalled()') && !regionOf('src/panel.js').includes('__dsh550c'),
)
const claimRegion = regionOf('src/client.js')
check('page claim uses the single skin check', claimRegion.includes('if (dsh550cSkinInstalled()) return'))
check('page claim retry timer is owned by the plugin', claimRegion.includes('claimRetry') && claimRegion.includes('clearInterval(claimRetry)'))
check('splash duration is measured, not hardcoded', claimRegion.includes('readSplashMs(mode)') && claimRegion.includes('rememberSplashMs(mode'))

// ── 组件预算：拆开的壳不许再长回去 ──────────────────────────────────────────
// 巨型函数是这轮的主要债务。断言行数不是为了"好看"：外壳一旦重新长到 200 行，
// 说明写的人又把业务塞回渲染函数里了，下一次改动就得再读两百行。
console.log('\ncomponent budgets')

/** 量一段源码的行数（从 from 到 to，不含 to 之后）。 */
const spanLines = (text, from, to) => {
  const start = text.indexOf(from)
  const end = text.indexOf(to, start + 1)
  if (start < 0 || end < 0) throw new Error('cannot measure ' + from + ' .. ' + to)
  return text.slice(start, end).split('\n').length
}

const musicRowLines = spanLines(CLIENT, 'function MusicRow()', 'function MusicToggle(')
check('MusicRow shell stays under 160 lines', musicRowLines < 160, String(musicRowLines) + ' lines')
for (const part of ['function MusicToggle(', 'function MusicTransport(', 'function MusicLibrary(', 'function MusicTrackItem(', 'function MusicEmptyHint(']) {
  check('music block is split: ' + part.trim(), CLIENT.includes(part))
}

const loginRowLines = spanLines(CLIENT, 'function LoginRow()', 'function ScreenModeRow(')
check('LoginRow shell stays under 160 lines', loginRowLines < 160, String(loginRowLines) + ' lines')
for (const part of ['function ScreenModeRow(', 'function AutoplayRow(', 'function VoiceRow(', 'function QrRow(', 'function CardFields(', 'async function decodeQrImage(']) {
  check('login block is split: ' + part.trim(), CLIENT.includes(part))
}
check('qr decode returns a result instead of setting state', CLIENT.includes('return { ok: true, text: result.data }'))
check(
  'card fields are driven by LOGIN_CARD_KEYS',
  CLIENT.includes('for (const field of LOGIN_CARD_KEYS)') && CLIENT.includes('readLoginPref(LOGIN_CARD_KEY(name),'),
)

const dispatchLines = spanLines(CLIENT, 'function mountLoginGate(force)', 'function mountTerminalGate(screen)')
check('mountLoginGate is a dispatcher, not the whole phase', dispatchLines < 60, String(dispatchLines) + ' lines')
check('terminal phase has its own entry', CLIENT.includes('function mountTerminalGate(screen)'))
check('ueg phase lives in its own region', CLIENT.includes('//#region src/login-ueg.js') && CLIENT.includes('function mountUegCinema()'))
check(
  'ueg region comes before the gate region',
  CLIENT.indexOf('//#region src/login-ueg.js') < CLIENT.indexOf('//#region src/login-gate.js'),
)
check('dispatcher routes all three states', CLIENT.includes("if (screen === 'ueg') return mountUegCinema()") && CLIENT.includes("if (screen === 'off') return null"))

console.log(failures === 0 ? '\nall cases pass' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
