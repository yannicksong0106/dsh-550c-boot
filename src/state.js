/**
 * 系列共享状态：跨插件、跨渲染的标记一律放这里，不再往 window 上随手挂。
 *
 * 为什么要有这个文件（两次真故障的代价）：
 *
 *   ① boot 曾经读一个「页面归属」旗子判断皮肤是否在场，而皮肤写的是版本号，
 *      没人写那个旗子 —— 于是判定永远为假：推荐行不消失，550C 页也会被 boot 抢走。
 *   ② window 上的变量变了不会触发 React 重渲染，于是有人加了 1.2 秒轮询兜底，
 *      而那个值在页面生命周期里根本不会变 —— 轮询纯属白烧。
 *
 * 规则：
 *   · 键名只在本文件登记，业务代码一律 dsh550cGet / dsh550cSet
 *   · 判断"皮肤在不在"只准调 dsh550cSkinInstalled()，别处不许再读 window 旗子
 *   · skin 是独立包，不 import 本文件；它由宿主半边注入版本号（见下），
 *     本文件把那个注入值当作唯一事实来源
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】—— 那会把外层字符串当场撕开。
 */

/** window 上唯一的状态根。 */
const DSH550C_STATE_KEY = '__dsh550cState'

/**
 * 皮肤版本号：由皮肤的【宿主半边】经 webserver/index-inject 注入
 * （dsh-550c-skin/lib/index.js，VERSION_GLOBAL）。
 * 它在文档解析阶段就写好，所以客户端半边读到的值在整个页面生命周期里是稳定的 ——
 * 这也是"这里不需要订阅/轮询"的原因。
 */
const DSH550C_SKIN_VERSION_GLOBAL = '__dsh550cSkinVersion'

/**
 * 状态对象的初始值。
 *
 * 键名集中登记是刻意的：以前的死键与名字错位都发生在"两边各写一个字符串"的时候。
 */
function dsh550cDefaults() {
  return {
    /** apply() 是否已经跑过：重复 register 同一个 slot id 会抛错。 */
    applied: false,
    /** 本页面是否已经自动播过片头：客户端重渲染时不许重播。 */
    splashPlayed: false,
    /** 本插件是否已经声明了「550C」页（皮肤不在场时由 boot 顶上）。 */
    bootPageOwned: false,
  }
}

/** 取状态对象；第一次调用时在 window 上建一个。 */
function dsh550cState() {
  const existing = window[DSH550C_STATE_KEY]
  if (existing !== undefined && existing !== null) return existing
  const created = dsh550cDefaults()
  window[DSH550C_STATE_KEY] = created
  return created
}

/** 读一个键。 */
function dsh550cGet(key) {
  return dsh550cState()[key]
}

/** 写一个键。只放标记位，不放需要 React 感知的数据（那类状态归组件自己）。 */
function dsh550cSet(key, value) {
  dsh550cState()[key] = value
}

/**
 * 皮肤是否在场 —— 唯一判定入口。
 *
 * 读的是注入的版本号字符串：空/未定义就是没装。boot 与 skin 之外的代码
 * 只准调这个函数，不许自己去看 window 上有没有某个旗子。
 */
function dsh550cSkinInstalled() {
  try {
    const injected = window[DSH550C_SKIN_VERSION_GLOBAL]
    return typeof injected === 'string' && injected !== ''
  } catch (error) {
    return false
  }
}
