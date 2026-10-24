/**
 * Build the verification harness pages (verification scaffolding, not shipped).
 *
 * What is real here:
 *   - the rows under test come from the plugin's own host half (lib/index.js),
 *     collected exactly the way WebServer.collectIndexInjections() collects
 *     them (emit 'webserver/index-inject' with a fresh table);
 *   - the index.html is the real @deepseek-ai/dsh-web-frontend dist document,
 *     lifted out of app.asar;
 *   - the rendering is DSH's own renderIndexInjections (.verify/dsh-render-rows.mjs);
 *   - the plugin bundle is the real build output, loaded over http.
 *
 * What is stubbed, and why:
 *   - the shell's module script is dropped (this page has no DSH host to boot
 *     against) and its boot card is stood in for, so the page still has the very
 *     thing the cover has to hide. The card's markup is not the shell's (its CSS
 *     module hashes are not reproducible here) but the two hooks the plugin keys
 *     on are: `data-dsh-boot`, and `data-dsh-boot-spinner` on the spinner;
 *   - <html> carries data-platform="win32", which is what the Desktop preload
 *     sets — the caption half of the client code only runs there;
 *   - 'react' resolves to a three-method shim: the factory needs it at module
 *     scope, but no settings row is rendered in this page.
 *
 * Usage: node .verify/build-harness.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { apply } from '../../lib/index.js'
import { renderIndexInjections } from './render-rows.mjs'

const here = dirname(fileURLToPath(import.meta.url))
// Generated pages are build output, not sources: they live in the ignored .verify
// tree so `git status` stays clean after a run.
const out = resolve(here, '../../.verify/harness')
mkdirSync(out, { recursive: true })

/* ── the rows under test, collected the way DSH collects them ─────────── */
const subscribers = []
const routes = []
apply({
  on(event, handler) {
    if (event === 'webserver/index-inject') subscribers.push(handler)
  },
  // The plugin registers its update route through an optional injection; the
  // harness has no HTTP carrier, so it records what would have been registered and
  // reports it alongside the rows. (scripts/test-host.mjs drives the handler.)
  inject(deps, callback) {
    callback({
      effect(fn) {
        routes.push({ deps: deps, route: fn() })
      },
      webServer: {
        register(route) {
          return route
        },
      },
    })
  },
})
const pluginRows = []
for (const push of subscribers) push(pluginRows)
writeFileSync(resolve(out, 'rows.json'), JSON.stringify({ rows: pluginRows, routes: routes }, null, 2) + '\n', 'utf8')
process.stdout.write(`plugin rows collected: ${pluginRows.map((row) => row.kind).join(', ')}\n`)
process.stdout.write(`routes registered: ${routes.map((item) => item.route.path).join(', ')}\n`)

/**
 * DSH's registration facade (the first row of ClientModuleRegistry's own
 * bootInjections), standing in for the module system this page has no host to
 * boot: identity copied from bootInjections, `create()` cut down to a throw.
 * The plugin rows are still the plugin's own, untouched.
 */
const FACADE_ROW = {
  kind: 'script',
  placement: 'head',
  text: `(()=>{
const pendingQueue=[]
window.__ModuleLoader__={
  mode:"queue",
  pendingQueue,
  load(registration){pendingQueue.push(registration)},
  create(){throw new Error("harness: the module system is not part of this page")}
}
})()`,
}
const table = [FACADE_ROW, ...pluginRows]

/* ── the shell's boot card, stood in for ─────────────────────────────── */
const CARD_STYLE =
  'position:fixed;inset:0;background:#1b1b1c;color:#f9fafb;display:grid;' +
  'place-content:center;justify-items:center;gap:18px'
const CARD =
  `<div data-dsh-boot style="${CARD_STYLE};font:600 34px/1 system-ui">` +
  '<div>HARNESS</div>' +
  '<div data-dsh-boot-spinner style="width:20px;height:20px;border:2px solid #4a4a4a;border-radius:50%"></div>' +
  '<div style="font-size:15px;font-weight:400">Loading plugins…</div></div>'
/** The same card as the shell renders it once a plugin failed: the spinner is gone. */
const CARD_FAILED =
  `<div data-dsh-boot style="${CARD_STYLE};font:600 34px/1.4 system-ui">` +
  '<div>HARNESS</div><div style="font-size:15px;font-weight:400">Failed to load plugins</div></div>'

/* ── the index document under test ───────────────────────────────────── */
// Preferred: the real @deepseek-ai/dsh-web-frontend dist document, lifted out of
// app.asar by scripts/extract-asar.mjs (or pointed at with DSH_550C_PAGE). The
// assertions are much stronger against the real thing — it brings the shell's own
// stylesheets, the boot card and the module loader.
//
// Fallback: the tracked minimal page. A fresh clone with nothing but a browser can
// still run the suite, which is the point of committing it.
const EXTRACTED_PAGE = resolve(
  here,
  '../../.verify/asar/dsh__node_modules__@deepseek-ai__dsh-web-frontend__dist__index.html',
)
const pageSource = process.env.DSH_550C_PAGE ?? (existsSync(EXTRACTED_PAGE) ? EXTRACTED_PAGE : null)
const usingRealPage = pageSource !== null
const rawIndex = usingRealPage ? readFileSync(pageSource, 'utf8') : readFileSync(resolve(here, 'fallback.html'), 'utf8')
const doctype = rawIndex.indexOf('<!doctype')
const index = (doctype < 0 ? rawIndex : rawIndex.slice(doctype))
  // The asar read lands one byte short at the tail ("</html"), which would make
  // the parser swallow the tags appended after it as a bogus end tag.
  .replace(/<\/html\s*$/, '</html>')
  .replace('<html lang="en">', '<html lang="en" data-platform="win32">')
  .replace(/<script type="module"[^>]*><\/script>\s*/, '')
  .replace(/<link rel="modulepreload"[^>]*>\s*/, '')

const HARNESS_SCRIPT = `
<script src="/scripts/harness/rows.js"></script>
<script src="/lib/client.js"></script>
<script>
(function () {
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var report = { coverApplied: root.classList.contains('dsh550c-first') };

  // ── the Desktop preload's caption probe, reproduced faithfully ───────────
  // (lib/types/preload-windows.js: an anonymous body-level span whose inline
  // style names the two tokens, measured with getComputedStyle and re-measured
  // whenever <head> mutates.) That measurement is what decides the colour of the
  // OS-drawn strip, so the harness has to model it before it can say anything
  // about the caption modes.
  var probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
    'background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)';
  document.body.appendChild(probe);
  var measured = { color: null, background: null, sends: 0 };
  function measure() {
    var style = getComputedStyle(probe);
    measured.color = style.color;
    measured.background = style.backgroundColor;
    measured.sends += 1;
  }
  measure();
  var probeObserver = new MutationObserver(measure);
  probeObserver.observe(root, { attributes: true, attributeFilter: ['lang'] });
  probeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] });
  probeObserver.observe(document.head, { childList: true, subtree: true, characterData: true });

  function write(extra) {
    for (var key in extra) report[key] = extra[key];
    var probe = document.createElement('div');
    probe.id = 'probe';
    probe.textContent = JSON.stringify(report);
    document.body.appendChild(probe);
  }
  // Cover-only mode: whatever happens (or does not happen) to the plugin, report
  // the cover's state at ?coverAt ms — used for the failure-card page.
  var coverAt = Number(params.get('coverAt') || 0);
  if (coverAt > 0) {
    window.setTimeout(function () {
      write({ coverAfterWatch: root.classList.contains('dsh550c-first') });
    }, coverAt);
    return;
  }
  function materialise() {
    var queue = (window.__ModuleLoader__ && window.__ModuleLoader__.pendingQueue) || [];
    var registration = queue.filter(function (row) { return row.id === 'dsh-550c-boot'; })[0];
    report.registration = registration !== undefined;
    if (registration === undefined) { finish(); return; }
    // A recording React: the shim in scripts/harness/rows.js reads the element tree
    // back out of it, so the settings rows can be rendered (and their text checked)
    // without react-dom. createElement has to keep its children, which the old
    // throwaway shim dropped.
    var React = {
      createElement: function (type, props) {
        var children = [];
        for (var i = 2; i < arguments.length; i += 1) children.push(arguments[i]);
        return { type: type, props: props || {}, children: children };
      },
      useState: function (value) { return [typeof value === 'function' ? value() : value, function () {}]; },
      useEffect: function () {},
      useCallback: function (fn) { return fn; }
    };
    var exports = null;
    try {
      exports = registration.factory(function (spec) {
        if (spec === 'react') return React;
        throw new Error('unexpected external ' + spec);
      });
    } catch (error) {
      report.materialiseError = String((error && error.message) || error);
    }
    // The rows only exist once the plugin is given a context — the factory alone
    // only mounts the splash — so run them here and report before the probe.
    if (exports !== null && typeof exports.apply === 'function' && window.__dsh550cRows !== undefined) {
      var realFetch = window.fetch;
      try {
        window.__dsh550cRows.run({
          exports: exports,
          React: React,
          skin: params.get('skin') === '1',
          setFetch: function (impl) { window.fetch = impl; },
          done: function (rows) {
            window.fetch = realFetch;
            report.rows = rows;
            finish();
          }
        });
        return;
      } catch (error) {
        window.fetch = realFetch;
        report.rowsError = String((error && error.message) || error);
      }
    }
    finish();
  }
  function finish() {
    var host = document.querySelector('.dsh550c-host');
    var hud = host === null ? null : host.shadowRoot.querySelector('#hud-top');
    var sheets = host === null ? [] : Array.prototype.slice.call(host.shadowRoot.querySelectorAll('style'));
    // MutationObserver callbacks are microtasks, so the shell's own re-measure
    // has not run yet at this point; flush it, the way the real preload would
    // have by the time the strip is repainted.
    measure();
    write({
      registration: report.registration,
      overlayMounted: host !== null,
      coverAfterModule: root.classList.contains('dsh550c-first'),
      firstFrameGlobal: typeof window.__dsh550cFirstFrame,
      captionAttr: host === null ? null : host.getAttribute('data-caption'),
      captionStyleInHead: document.getElementById('dsh-550c-boot-caption') !== null,
      captionFill: host === null ? null : getComputedStyle(host).getPropertyValue('--caption-fill').trim(),
      captionSymbol: host === null ? null : getComputedStyle(host).getPropertyValue('--caption-symbol').trim(),
      shadowBoot: host === null ? null : host.shadowRoot.querySelector('#boot') !== null,
      hudPresent: hud !== null,
      hudPadRight: hud === null ? null : getComputedStyle(hud).paddingRight,
      hudPadLeft: hud === null ? null : getComputedStyle(hud).paddingLeft,
      reserveRule: sheets.some(function (sheet) {
        return sheet.textContent.indexOf('data-caption="windows"') >= 0;
      }),
      captionMode: host === null ? null : host.getAttribute('data-caption-mode'),
      // What the Desktop shell would push to setTitleBarOverlay({color, symbolColor}).
      // The strip must come out transparent (rgba(0, 0, 0, 0)) with a legible
      // symbol colour, whatever the app's own theme says.
      probeBackground: measured.background,
      probeColor: measured.color,
      probeSends: measured.sends,
      // diagnostics: the plugin's sheet, and whether its selector reaches the probe
      captionSheet: (document.getElementById('dsh-550c-boot-caption') || {}).textContent || null,
      probeSelectorMatches: document.querySelectorAll('body>span[style*="dsw-specific-sidebar-fill"]').length,
      probeIsBodyChild: probe.parentNode === document.body,
      // The app's own tokens must be left exactly as they were.
      rootLabelPrimary: getComputedStyle(root).getPropertyValue('--dsw-alias-label-primary').trim(),
      rootSidebarFill: getComputedStyle(root).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
      bodyLabelPrimary: getComputedStyle(document.body).getPropertyValue('--dsw-alias-label-primary').trim(),
      bodySidebarFill: getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill').trim()
    });
  }
  var delay = Number(params.get('delay') || 0);
  if (delay > 0) window.setTimeout(materialise, delay);
  else materialise();
})()
</script>
`

/**
 * The app's own theme definitions, stood in for.
 *
 * The real app declares `--dsw-specific-sidebar-fill` / `--dsw-alias-label-primary`
 * from class-scoped selectors, which outrank a plain `:root` rule. The harness
 * has to reproduce that, or it cannot catch the regression it caused on the real
 * window: a caption sheet without `!important` silently lost and the OS strip
 * kept the app's colours for the whole splash.
 */
const APP_THEME_TOKENS = `<style>
html[data-ds-dark-theme] body{--dsw-specific-sidebar-fill:#141008;--dsw-alias-label-primary:#f9fafb}
html[data-ds-dark-theme] body>span{color:var(--dsw-alias-label-primary)}
</style>`

/**
 * The macOS variant: the same real document and the same plugin rows, with the
 * shell's own darwin behaviour stood in for — the official
 * `body>:not(#root){-webkit-app-region:no-drag}` rule, a `[data-window-drag]`
 * chrome row, and the preload's `html[data-fullscreen]` flag.
 *
 * It is generated rather than hand-written so it keeps the plugin's real rows and
 * the ported full-mode markup (#hud-top), which is what the HUD reservation
 * assertions need.
 */
const DARWIN_HEAD = `<style>html[data-platform="darwin"] body>:not(#root){-webkit-app-region:no-drag}</style>`
const DARWIN_CHROME =
  '<div data-window-drag id="chrome" style="position:fixed;top:0;left:0;right:0;height:40px;-webkit-app-region:drag"></div>'

const DARWIN_SCRIPT = `
<script src="/lib/client.js"></script>
<script>
(function () {
  var root = document.documentElement;
  var params = new URLSearchParams(location.search);
  var report = { platform: root.getAttribute('data-platform') };
  function write(extra) {
    for (var key in extra) report[key] = extra[key];
    var probe = document.createElement('div');
    probe.id = 'probe';
    probe.textContent = JSON.stringify(report);
    document.body.appendChild(probe);
  }
  function appRegion(element) {
    return element === null ? null : getComputedStyle(element).getPropertyValue('-webkit-app-region').trim();
  }
  function materialise() {
    var queue = (window.__ModuleLoader__ && window.__ModuleLoader__.pendingQueue) || [];
    var registration = queue.filter(function (row) { return row.id === 'dsh-550c-boot'; })[0];
    report.registration = registration !== undefined;
    if (registration === undefined) { finish(); return; }
    var React = {
      createElement: function () { return null; },
      useState: function (value) { return [value, function () {}]; },
      useEffect: function () {},
      useCallback: function (fn) { return fn; }
    };
    try {
      registration.factory(function (spec) {
        if (spec === 'react') return React;
        throw new Error('unexpected external ' + spec);
      });
    } catch (error) {
      report.materialiseError = String((error && error.message) || error);
    }
    finish();
  }
  function finish() {
    var host = document.querySelector('.dsh550c-host');
    var shadow = host === null ? null : host.shadowRoot;
    var hud = shadow === null ? null : shadow.querySelector('#hud-top');
    var guard = document.getElementById('dsh-550c-boot-host');
    var chrome = document.getElementById('chrome');

    // (a) with the plugin's drag-guard sheet, (b) without it (control), (c) restored
    var withGuard = appRegion(host);
    var guardParent = guard === null ? null : guard.parentNode;
    var guardNext = guard === null ? null : guard.nextSibling;
    if (guard !== null) guard.remove();
    var withoutGuard = appRegion(host);
    if (guardParent !== null) guardParent.insertBefore(guard, guardNext);
    var restored = appRegion(host);

    // Everything about the host is read BEFORE the click, which retires it.
    var snapshot = {
      registration: report.registration,
      overlayMounted: host !== null,
      hostMarker: host === null ? null : host.getAttribute('data-dsh-boot-splash'),
      guardSheetInHead: guard !== null,
      appRegionWithGuard: withGuard,
      appRegionWithoutGuard: withoutGuard,
      appRegionRestored: restored,
      chromeAppRegion: appRegion(chrome),
      captionAttr: host === null ? null : host.getAttribute('data-caption'),
      captionSheetInHead: document.getElementById('dsh-550c-boot-caption') !== null,
      hudPresent: hud !== null,
      hudPadLeft: hud === null ? null : getComputedStyle(hud).paddingLeft,
      hudWindowDrag: hud === null ? null : hud.hasAttribute('data-window-drag'),
      rootFullscreen: root.getAttribute('data-fullscreen'),
      hostFullscreen: host === null ? null : host.hasAttribute('data-fullscreen'),
      search: location.search
    };
    if (host !== null) host.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // fs=late: the shell reports fullscreen AFTER the splash is on screen, which is
    // the MutationObserver's job — so flip it here, once the overlay is mounted, and
    // re-read the two values that depend on it on the next task. (A timer scheduled
    // before the mount raced the report under --virtual-time-budget: page timers are
    // not wall-clock there, and the 1200 ms report fired first.)
    if (fs === 'late') {
      root.dataset.fullscreen = 'true';
      window.setTimeout(function () {
        var live = document.querySelector('.dsh550c-host');
        var liveShadow = live === null ? null : live.shadowRoot;
        var liveHud = liveShadow === null ? null : liveShadow.querySelector('#hud-top');
        snapshot.rootFullscreen = root.getAttribute('data-fullscreen');
        snapshot.hostFullscreen = live === null ? null : live.hasAttribute('data-fullscreen');
        snapshot.hudPadLeft = liveHud === null ? null : getComputedStyle(liveHud).paddingLeft;
        snapshot.fsLateFired = true;
        write(snapshot);
      }, 50);
      return;
    }

    window.setTimeout(function () {
      write(Object.assign({ overlayGoneAfterClick: document.querySelector('.dsh550c-host') === null }, snapshot));
    }, 1200);
  }
  var delay = Number(params.get('delay') || 0);
  var fs = params.get('fs');
  // fs=initial: the shell reports fullscreen before the splash mounts.
  if (fs === 'initial') root.dataset.fullscreen = 'true';
  if (delay > 0) window.setTimeout(materialise, delay);
  else materialise();
})()
</script>
`

/**
 * The family-hostile page: what an install of the dsh-web aggregate sees.
 *
 * `data-dsh-boot-splash` is not an exemption, it is a contract. The aggregate
 * styles that marker —
 *   [data-dsh-boot-splash]{position:fixed;inset:0;z-index:9999;
 *     background:var(--dsw-alias-bg-base,#1e1e20);pointer-events:none;
 *     transition:opacity 160ms cubic-bezier(0.4,0,0.2,1)}
 * — and its boot shield does `document.querySelector('div[data-dsh-boot-splash]')`,
 * reuses what it finds, then removes it about 1.2s later. A splash that borrows
 * the name therefore loses click-to-skip, its own fade and its lifetime. This page
 * reproduces all of that against the real plugin, so the regression cannot come
 * back silently.
 */
const FAMILY_CSS = `<style>
[data-dsh-boot-splash]{position:fixed;inset:0;z-index:9999;background:var(--dsw-alias-bg-base,#1e1e20);pointer-events:none;transition:opacity 160ms cubic-bezier(0.4,0,0.2,1)}
html[data-platform="darwin"] body>:not(#root){-webkit-app-region:no-drag}
html[data-platform="darwin"] [data-dsh-skin-layer],html[data-platform="darwin"] [data-dsh-boot-splash],html[data-platform="darwin"] [aria-hidden="true"]{-webkit-app-region:initial !important}
</style>`

const FAMILY_SCRIPT = `
<script src="/lib/client.js"></script>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var report = { familyHostile: true };
  // The family's own boot shield, in behaviour: find the marker, reuse it, retire
  // it about 1.2s later whatever it is.
  function installBootShield() {
    var found = document.querySelector('div[data-dsh-boot-splash]');
    report.shieldFoundHost = found !== null;
    if (found === null) return;
    found.setAttribute('data-ready', '');
    window.setTimeout(function () { found.remove(); }, 1180);
  }
  function appRegion(element) {
    return element === null ? null : getComputedStyle(element).getPropertyValue('-webkit-app-region').trim();
  }
  function write(extra) {
    for (var key in extra) report[key] = extra[key];
    report.overlayGoneAfterClick = document.querySelector('.dsh550c-host') === null;
    report.dragBandGoneAfterClick = document.querySelector('.dsh550c-dragband') === null;
    var probe = document.createElement('div');
    probe.id = 'probe';
    probe.textContent = JSON.stringify(report);
    document.body.appendChild(probe);
  }
  function materialise() {
    var queue = (window.__ModuleLoader__ && window.__ModuleLoader__.pendingQueue) || [];
    var registration = queue.filter(function (row) { return row.id === 'dsh-550c-boot'; })[0];
    report.registration = registration !== undefined;
    if (registration === undefined) { write({}); return; }
    var React = {
      createElement: function () { return null; },
      useState: function (value) { return [value, function () {}]; },
      useEffect: function () {},
      useCallback: function (fn) { return fn; }
    };
    try {
      registration.factory(function (spec) {
        if (spec === 'react') return React;
        throw new Error('unexpected external ' + spec);
      });
    } catch (error) {
      report.materialiseError = String((error && error.message) || error);
    }
    var host = document.querySelector('.dsh550c-host');
    var band = document.querySelector('.dsh550c-dragband');
    var style = host === null ? null : getComputedStyle(host);
    var snapshot = {
      registration: report.registration,
      overlayMounted: host !== null,
      markerIsOurs: host === null ? null : host.hasAttribute('data-dsh550c-boot'),
      borrowedFamilyMarker: host === null ? null : host.hasAttribute('data-dsh-boot-splash'),
      ariaHidden: host === null ? null : host.getAttribute('aria-hidden'),
      hostPointerEvents: style === null ? null : style.pointerEvents,
      hostZIndex: style === null ? null : style.zIndex,
      hostBackground: style === null ? null : style.backgroundColor,
      hostTransition: style === null ? null : style.transitionDuration + ' delay ' + style.transitionDelay,
      dragBandPresent: band !== null,
      dragBandAppRegion: appRegion(band),
      dragBandMarker: band === null ? null : band.hasAttribute('data-window-drag'),
      hostSheetInHead: document.getElementById('dsh-550c-boot-host') !== null
    };
    // The shield runs BEFORE the click on purpose: if it had reused the host it
    // would also have scheduled its removal, so the click below is the only thing
    // keeping the splash alive for the rest of this run.
    installBootShield();
    if (host !== null) host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    window.setTimeout(function () { write(snapshot); }, 1600);
  }
  var delay = Number(params.get('delay') || 0);
  if (delay > 0) window.setTimeout(materialise, delay);
  else materialise();
})()
</script>
`

function page(card, rows) {
  return renderIndexInjections(
    index
      .replace(/<html([^>]*)>/, '<html$1 data-ds-dark-theme>')
      .replace('</head>', APP_THEME_TOKENS + '</head>')
      .replace('<div id="root"></div>', `<div id="root">${card}</div>`)
      .replace('</body>', HARNESS_SCRIPT + '</body>'),
    rows,
  )
}

function familyPage(card, rows) {
  return renderIndexInjections(
    index
      .replace(/<html([^>]*)>/, '<html$1 data-ds-dark-theme>')
      .replace('</head>', APP_THEME_TOKENS + FAMILY_CSS + '</head>')
      .replace('<div id="root"></div>', `<div id="root">${card}</div>`)
      .replace('</body>', FAMILY_SCRIPT + '</body>'),
    rows,
  )
}

function darwinPage(card, rows) {
  return renderIndexInjections(
    index
      // The source document already carries data-platform="win32" (the Desktop
      // preload's mark for Windows). It has to be REPLACED, not appended: a second
      // attribute of the same name is ignored by the HTML parser and the page would
      // quietly stay Windows.
      .replace('data-platform="win32"', 'data-platform="darwin"')
      .replace('</head>', DARWIN_HEAD + '</head>')
      .replace('<div id="root"></div>', `<div id="root">${card}</div>${DARWIN_CHROME}`)
      .replace('</body>', DARWIN_SCRIPT + '</body>'),
    rows,
  )
}

const pages = {
  'index.html': page(CARD, table),
  'index-norows.html': page(CARD, []),
  'index-failure.html': page(CARD_FAILED, table),
  'index-darwin.html': darwinPage(CARD, table),
  'index-family.html': familyPage(CARD, table),
}
for (const [name, html] of Object.entries(pages)) {
  writeFileSync(resolve(out, name), html, 'utf8')
  process.stdout.write(`wrote harness/${name} (${html.length} chars)\n`)
}
