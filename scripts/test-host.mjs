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

console.log(failures === 0 ? '\nall cases pass' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
