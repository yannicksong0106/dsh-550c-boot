#!/usr/bin/env node
/**
 * 跨仓库接口检查：dsh-550c-boot ↔ dsh-550c-skin。
 *
 * 两个包各自独立发布、互不 import，唯一的连接是**四条口头约定**：
 *
 *   ① 「550C」页由 boot 声明，皮肤只往 settings.550c.item 里加行
 *   ② 号段（按插槽分）：「外观」页皮肤占 10..59、boot 兜底 ≥90；
 *      「开机动画 / UEG」页 boot 占 50..89、皮肤不碰
 *   ③ 皮肤在场与否，靠皮肤宿主半边注入的 __dsh550cSkinVersion 判定
 *   ④ 分段控件选中态那条 CSS 两边逐字相同
 *
 * 这四条以前只写在注释里 —— 撞号、改键名、改配色，全靠人记得。
 * 这个脚本把它们变成可执行的检查：皮肤仓库不在（CI、单独 clone）就跳过，
 * 在就逐条核对，不合规直接退出 1。
 *
 * 用法：
 *   node scripts/check-skin-contract.mjs
 *   DSH_550C_SKIN=<path> node scripts/check-skin-contract.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const SKIN = process.env.DSH_550C_SKIN ?? resolve(root, '../dsh-550c-skin')

if (!existsSync(SKIN)) {
  process.stdout.write('skin-contract: no dsh-550c-skin next door; skipping (this is fine for CI).\n')
  process.stdout.write('skin-contract: set DSH_550C_SKIN=<path> to check a checkout elsewhere.\n')
  process.exit(0)
}

let failures = 0
const check = (name, ok, detail) => {
  if (ok) {
    process.stdout.write('  ok   ' + name + (detail === undefined ? '' : '  (' + detail + ')') + '\n')
    return
  }
  failures += 1
  process.stdout.write('  FAIL ' + name + (detail === undefined ? '' : '  (' + detail + ')') + '\n')
}

const bootClient = readFileSync(resolve(root, 'src/client.js'), 'utf8')
const bootState = readFileSync(resolve(root, 'src/state.js'), 'utf8')
const bootPanel = readFileSync(resolve(root, 'src/panel.js'), 'utf8')
const skinClient = readFileSync(resolve(SKIN, 'src/client.js'), 'utf8')

/** 取某个插槽上注册的所有 order（register 对象是单行的，够用）。 */
function ordersFor(text, slot) {
  const pattern = new RegExp("name: '" + slot + "'[^}]*order: (\\d+)", 'g')
  const out = []
  let match = pattern.exec(text)
  while (match !== null) {
    out.push(Number(match[1]))
    match = pattern.exec(text)
  }
  return out
}

process.stdout.write('\nskin contract (boot ↔ skin)\n')

/* ① 页面归属：皮肤不许声明，boot 必须声明 */
check(
  'skin does not register settings.section',
  !skinClient.includes("name: 'settings.section'"),
  'page belongs to boot',
)
check('skin injects into the slot boot declares', skinClient.includes("ctx.slots.inject('settings.550c.item'"))
check('boot declares the settings page', bootClient.includes("name: 'settings.section'") && bootClient.includes("id: '550c'"))
check(
  'boot declares every child slot the series uses',
  ['settings.550c.item', 'settings.550c.anim.550c', 'settings.550c.anim.ueg'].every((slot) => bootPanel.includes("'" + slot + "'")),
)

/* ② 号段 */
const skinItemOrders = ordersFor(skinClient, 'settings.550c.item')
const bootPageOrders = ordersFor(bootClient, 'settings.550c.anim.550c')
const bootLookOrders = ordersFor(bootClient, 'settings.550c.item')
// 号段是【按插槽】分的，不是全局一条线：
//   「外观」页由皮肤填（10..59），boot 只在这页放兜底行（≥90）
//   「开机动画 / UEG」两页由 boot 填（50..89），皮肤不碰
check('skin uses the 10..59 band on the look page', skinItemOrders.length > 0 && skinItemOrders.every((n) => n >= 10 && n <= 59), skinItemOrders.join(','))
check('boot uses the 50..89 band on the animation page', bootPageOrders.length > 0 && bootPageOrders.every((n) => n >= 50 && n <= 89), bootPageOrders.join(','))
check('boot fallback rows stay at 90+ on the look page', bootLookOrders.every((n) => n >= 90), bootLookOrders.join(',') || 'none')

/* ③ 皮肤在场信号 */
check('skin injects the version global boot reads', skinClient.includes("'__dsh550cSkinVersion'"))
check('boot reads the same global', bootState.includes("'__dsh550cSkinVersion'"))

/* ④ 选中态配色：两边逐字相同 */
const RULE = '.dsh550c-seg button.on{background:#111;color:#fff;font-weight:600}'
const SKIN_RULE = '.dsh550c-skin-seg button.on{background:#111;color:#fff;font-weight:600}'
check('boot keeps the black-on-white active rule', bootClient.includes(RULE))
check('skin keeps the same active rule', skinClient.includes(SKIN_RULE), SKIN_RULE)

process.stdout.write(failures === 0 ? '\nskin contract: all checks pass\n' : '\nskin contract: ' + String(failures) + ' FAILURES\n')
process.exit(failures === 0 ? 0 : 1)
