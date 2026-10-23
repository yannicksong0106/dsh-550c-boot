#!/usr/bin/env node
/**
 * Builds lib/client.js — the single browser module the client loader expects.
 *
 * No bundler and no build dependencies on purpose. The client half may be
 * written in plain JavaScript: the loader's factory hands the module a
 * `require` that resolves the externals a plugin is allowed to use (`react`,
 * `react/jsx-runtime`), and the plugin's own sources are concatenated below
 * into that factory's body. That is exactly the shape tsdown emits for the
 * published client plugins — see any `lib/client.js` under
 * $DSH_HOME/profiles/*\/node_modules.
 *
 * Order matters: assets (stylesheet + markup) → show (the animation) → client
 * (the React surfaces and the plugin export). All three are plain top-level
 * declarations, so concatenation is a valid module body.
 *
 * Usage: node scripts/build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Script } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const PLUGIN_ID = 'dsh-550c-boot'
// src/music.js 排在 panel.js 之后、login-css.js 之前：它要在 client.js 之前
// 定义好开机音乐的存储与播放接口（client.js 在模块求值末尾就挂载片头并开播音乐），
// 又不能早于它去引用 client.js 里的顶层 const。
// src/state.js 必须排最前：跨插件状态（含「皮肤在不在」的唯一判定）只有这一份，
// 后面的 panel.js / client.js 都在函数里引用它。
const PARTS = ['src/state.js', 'src/assets.js', 'src/show.js', 'src/enhance.js', 'src/panel.js', 'src/music.js', 'src/login-css.js', 'src/login-gate.js', 'src/login-themes.js', 'src/login.js', 'src/rows.js', 'src/client.js']

// 行尾必须先归一化：Windows 检出是 CRLF，空行读出来是 "\r"（长度 1），
// 会被下面的缩进逻辑当成非空行补上 \t\t；Linux 检出是 LF，空行是 ""（长度 0），不补。
// 不归一化的话同一份源码在两个平台会构建出不同的 bundle，
// CI 那条 `git diff --exit-code -- lib/client.js` 就必然失败。
const read = (file) => readFileSync(resolve(root, file), 'utf8').replace(/\r\n/g, '\n')
const body = PARTS.map((file) => `//#region ${file}\n${read(file).trimEnd()}\n//#endregion`).join('\n\n')

const out = `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PLUGIN_ID)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
${body
  .split('\n')
  .map((line) => (line.length > 0 ? `\t\t${line}` : line))
  .join('\n')}
\t\treturn module.exports;
\t}
});
`

// A client bundle is loaded as a <script> by the browser: the parser ends the
// block at the first `</script`, whatever the JavaScript around it means. The
// same trap the reference plugin documents for backticks in its CSS.
if (/<\/script/i.test(out)) throw new Error('build: output contains </script and would truncate in the browser')
if (/<!--/.test(out)) throw new Error('build: output contains <!-- (HTML comment open) and is unsafe in a script block')

// Parse the bundle before shipping it. The usual way this file goes wrong is a
// stray backtick inside a CSS template literal — the sheet is one template
// string, so a single backtick ends it early and the rest of the stylesheet
// becomes JavaScript. Compiling (not running) the output turns that into a loud
// build failure instead of a client that silently fails to load.
try {
  new Script(out)
} catch (error) {
  throw new Error(
    `build: generated bundle does not parse — ${error.message}\n` +
      '  (most likely a backtick inside a CSS template literal in src/enhance.js or src/assets.js)',
  )
}

writeFileSync(resolve(root, 'lib/client.js'), out)
process.stdout.write(`build: wrote lib/client.js (${out.length} chars)\n`)
