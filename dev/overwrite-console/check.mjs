/** 一次性体检：确认这个页面真的自包含、而且 CSS 块能安全搬进模板字符串。 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(resolve(here, 'index.html'), 'utf8')
const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1]
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1]

const backticks = (style.match(/`/g) ?? []).length
const externals = html.match(/<link\b|src=["']https?:|href=["']https?:|@import/g) ?? []
const problems = []
if (backticks !== 0) problems.push(`CSS 块里有 ${backticks} 个反引号：搬进 enhance.js 的模板字符串会把它截断`)
if (externals.length !== 0) problems.push(`有 ${externals.length} 处外部引用：页面不再自包含`)

process.stdout.write(`index.html       ${html.length} 字符\n`)
process.stdout.write(`  CSS            ${style.length} 字符，反引号 ${backticks} 个\n`)
process.stdout.write(`  JS             ${script.length} 字符\n`)
process.stdout.write(`  外部引用       ${externals.length} 处\n`)
process.stdout.write(problems.length === 0 ? '\n体检通过：自包含，CSS 块可直接搬进模板字符串。\n' : `\n${problems.join('\n')}\n`)
process.exit(problems.length === 0 ? 0 : 1)
