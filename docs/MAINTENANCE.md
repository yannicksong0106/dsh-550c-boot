# 代码维护计划 —— dsh-550c-boot / dsh-550c-skin

> 建立于：2026-10-23
> 触发原因：0.5.0 → 0.5.2 三天内 22 个提交，迭代速度过快，需要一次系统性的技术债清理
> 本文档是**交接材料**：在全新对话里照着它执行，不需要重新调研

---

## 0. 一分钟读懂

```
结论    现在不是屎山，但有三处结构性债务正在累积，越晚收拾越贵
优先级  P0 收敛全局状态（半天）→ P1 拆巨型组件（一天）→ P2 共享样式与断言（半天）
原则    每一批都独立可发布、可回滚；不改行为，只改结构；每批都跑全门禁 + 实测脚本
禁区    见第 7 节（历史上踩过的坑，全部有代价）
```

### 仓库与环境

```
主仓库        F:\项目\dsh-start            （dsh-550c-boot）
皮肤仓库      F:\项目\dsh-550c-skin       （dsh-550c-skin）
Web 试装副本  F:\项目\dsh-start-web       （与主仓库同步，用来跑 web 实例）

profile 链接
  ~/.dsh/profiles/desktop/node_modules/dsh-550c-boot  → link:F:/项目/dsh-start
  ~/.dsh/profiles/web/node_modules/dsh-550c-boot      → link:F:/项目/dsh-start-web
  ~/.dsh/profiles/*/node_modules/dsh-550c-skin        → link:F:/项目/dsh-550c-skin

改动生效方式
  桌面端：改完必须【完全退出 deepseek harness 再重开】，bundle 在启动时加载
  Web 端：同步到 dsh-start-web 后重启实例（token 每次都不同，从启动输出里取）

起 web 实例
  & "$env:LOCALAPPDATA\Programs\dsh-launcher\dsh.cmd" --profile web --port 3845 --no-open

同步到副本（不要用 /MIR，会删掉副本独有的文件）
  Copy-Item F:\项目\dsh-start\src,F:\项目\dsh-start\lib,F:\项目\dsh-start\preview,F:\项目\dsh-start\scripts F:\项目\dsh-start-web -Recurse -Force
  Copy-Item F:\项目\dsh-start\package.json F:\项目\dsh-start-web -Force
```

---

## 1. 审计数据（2026-10-23 实测）

### 1.1 体量分布

```
文件                              行数      体积
preview/assets/jsqr.js           10107    251 KB   ← 第三方 vendored（Apache-2.0）
preview/assets/qrcode-gen.js      2304     56 KB   ← 第三方 vendored（MIT）
preview/ueg.html                  1748     92 KB   ← 动画本体（单文件，见 7.9）
src/music.js                      1091     40 KB   ← 自研，本轮债务最集中
src/client.js                      763     38 KB
scripts/verify.mjs                 637     27 KB   ← 来自 PR #8
src/show.js                        589     30 KB   ← 移植自 550C 原稿
scripts/harness/build.mjs          558     25 KB
src/login.js                       533     22 KB
src/login-gate.js                  462     17 KB
src/enhance.js                     455     23 KB
src/rows.js                        327     12 KB

自研源文件合计   约 9300 行
含 vendored 合计 21670 行 / 800 KB
```

### 1.2 债务标记（好消息）

```
TODO / FIXME / HACK / XXX / 待删：仅 src/show.js 3 处"临时"字样，且是既有注释，非未完成项 ✓
调试残留：client.js 1 处 console.*（正当错误日志）、preview/ueg.html 1 处 ✓
[550C-DIAG] 诊断体系：已全部移除 ✓（0.5.1 时清理）
```

### 1.3 巨型函数（坏消息）

```
文件 · 函数                  行数     说明
src/show.js · createShow      573     整个片头的闭包集合（移植原稿，改动风险高）
src/login-gate.js · mountLoginGate  450   授权界面全流程
src/login.js · LoginRow       340     登录设置行全部字段 + 二维码
scripts/verify.mjs · main     327     PR 自带测试入口
src/music.js · MusicRow       295     音乐设置行：开关/导入/音量/淡出/曲库列表
src/enhance.js · enhanceShow  216     桌面端增强
src/client.js · apply         172     注册所有 slot + 页面归属 +
src/rows.js · VersionRow      170     版本与更新
src/client.js · mountOverlay  152     片头挂载 + 首帧 + 收口
src/login-css.js · loginShadowCss  179   CSS 字符串
```

### 1.4 模式统计

```
React.createElement     114 次   （不能用 JSX：build.mjs 会把 src/*.js 拼进模板字符串）
try {                   100 处   （防御性好，但静默 catch 有过两次吞掉真 bug）
readLoginPref(           27 次
ensureRowStyle()          6 次
console.*（自研源）        2 处
```

---

## 2. P0：全局状态收敛（最高优先级）

### 2.1 问题实证

现有临时全局（散落在 boot 与 skin 两个仓库）：

```
boot:
  window.__dsh550cApplied         apply() 只执行一次（防重复注册 slot）
  window.__dsh550cBootPage        boot 自己声明了 550C 页
  window.__dsh550cRowsOnSeries    行已搬到 550C 页
  window.__dsh550cSplashPlayed    片头本页面已播过
  window.__dsh550cBootStart       本图片头起点（测时长用）
  window.__dsh550cSplashKey       实测时长存储键
  window.__dsh550cFirstFrame      首帧已盖（常量名 FIRST_FRAME_GLOBAL）
  window.__dsh550cVersion         版本号缓存（VERSION_GLOBAL）
  window.__dsh550cPageOwner       ⚠ 页面归属旗子 —— 见下
skin:
  window.__dsh550cSkinVersion     皮肤版本（skin/src/client.js:40）
```

**已经造成的两次真实故障：**

| 故障 | 成因 | 代价 |
|---|---|---|
| 推荐行在皮肤启用后不消失 | boot 用 `__dsh550cPageOwner` 判断皮肤是否存在，而皮肤实际写的是 `__dsh550cSkinVersion`，没人设前者 | 一轮排查 + 一次错误修复 |
| 推荐行改了旗子后仍不消失 | window 变量变化不触发 React 重渲染，只能靠 1.2s 轮询兜住 | 额外一轮 |

**还有一段死判断：**

```js
// src/client.js · claimSectionIfFree()
if (window.__dsh550cPageOwner) return     // ← 这个键没有任何代码写入
if (window.__dsh550cBootPage === true) return
```

`__dsh550cPageOwner` 从头到尾没人写 → 这行永远为假 → 页面归属判断实际上只剩
`__dsh550cBootPage` 一条。皮肤在场时 boot 仍会抢页，这正是「550C 页在皮肤启用时也可能
被 boot 接管」的隐患来源。

### 2.2 目标设计

新建 `src/state.js`（放在 build.mjs 的拼接顺序里，位置在 client.js 之前）：

```js
/**
 * 系列共享状态：所有跨插件、跨渲染的标记都放这里，不再往 window 上随手挂。
 * 键名集中登记，杜绝"两边名字不一致"这类 bug。
 * 注意：build.mjs 会把 src/*.js 拼进模板字符串 —— 本文件禁止出现反引号与美元加大括号。
 */
const DSH550C_STATE_KEY = '__dsh550cState'

function dsh550cState() {
  if (!window[DSH550C_STATE_KEY]) {
    window[DSH550C_STATE_KEY] = {
      // ── boot 自己的生命周期 ──
      applied: false,        // apply() 是否已跑过
      splashPlayed: false,   // 本页面片头是否已自动播过一次
      bootPageOwned: false,  // boot 是否声明了 550C 页
      rowsOnSeries: false,   // 行是否已搬到 550C 页
      firstFramePainted: false,
      bootStartAt: 0,        // performance.now()，测片头时长用
      splashKey: '',
      // ── 皮肤（由 dsh-550c-skin 写入）──
      skinVersion: null,
      // ── 订阅者 ──
      listeners: [],
    }
  }
  return window[DSH550C_STATE_KEY]
}

function dsh550cGet(key) {
  return dsh550cState()[key]
}

function dsh550cSet(key, value) {
  const state = dsh550cState()
  if (state[key] === value) return
  state[key] = value
  for (const fn of state.listeners.slice()) {
    try { fn(key, value) } catch (error) { /* 订阅者自己炸了不牵连别人 */ }
  }
}

/** 订阅状态变化，返回退订函数。React 里配 useEffect 用。 */
function dsh550cSubscribe(fn) {
  const state = dsh550cState()
  state.listeners.push(fn)
  return () => {
    const at = state.listeners.indexOf(fn)
    if (at >= 0) state.listeners.splice(at, 1)
  }
}

/** 皮肤是否在场：唯一判定入口，boot 与 skin 之外的代码只准调这个。 */
function dsh550cSkinInstalled() {
  const state = dsh550cState()
  if (state.skinVersion) return true
  // 兼容：老版本皮肤只写 window.__dsh550cSkinVersion
  return typeof window.__dsh550cSkinVersion !== 'undefined'
}

/** 皮肤一侧调用：登记版本，同时让所有订阅者知道。 */
function dsh550cMarkSkin(version) {
  dsh550cSet('skinVersion', version || 'unknown')
}
```

### 2.3 迁移清单（逐条照做）

```
① 新建 src/state.js，内容如上；在 scripts/build.mjs 的 PARTS 列表里
   插到 client.js 之前、panel.js 之前（必须是最前面之一，供其他文件使用）

② src/client.js
   · __dsh550cApplied       → dsh550cGet('applied') / dsh550cSet('applied', true)
   · __dsh550cBootPage      → 'bootPageOwned'
   · __dsh550cRowsOnSeries  → 'rowsOnSeries'
   · __dsh550cSplashPlayed  → 'splashPlayed'
   · __dsh550cBootStart     → 'bootStartAt'
   · __dsh550cSplashKey     → 'splashKey'
   · __dsh550cFirstFrame    → 'firstFramePainted'（同时保留 window 兼容别名一版）
   · __dsh550cVersion       → 保留 window 别名（外部可能有引用），内部改读 state
   · claimSectionIfFree() 里删掉 `if (window.__dsh550cPageOwner) return`
     这一行死判断，改为 `if (dsh550cSkinInstalled()) return` —— 语义才正确：
     皮肤在场时页面归皮肤，boot 让位

③ SkinPromoRow 组件
   · 去掉 useState + setInterval(1200) 轮询
   · 改为：const [installed, setInstalled] = React.useState(dsh550cSkinInstalled())
          React.useEffect(() => dsh550cSubscribe(() => setInstalled(dsh550cSkinInstalled())), [])
   · 这样皮肤一启用同一帧就消失，不用等 1.2 秒

④ skin 仓库 src/client.js
   · apply(ctx) 开头加 dsh550cMarkSkin(VERSION_GLOBAL 对应的版本号)
   · 注意：skin 是独立包，不能 import boot 的 state.js ✗
     → 在 skin 里复制一份最小实现（state.js 的 40 行），或者约定"谁先加载谁建对象"：
       skin 只调 dsh550cSet 等价逻辑，若 window.__dsh550cState 不存在就自己建
     → 推荐：复制一份 state.js 到 skin，保持两个文件逐字相同（第 6 节有说明）
```

### 2.4 验收标准

```
· grep -rn "__dsh550cApplied\|__dsh550cBootPage\|__dsh550cRowsOnSeries\|__dsh550cSplashPlayed" src/
  应只在 state.js 的兼容别名处命中，业务代码 0 命中
· 桌面端实测：
    皮肤关闭 → 「外观」页出现推荐行
    启用皮肤 → 推荐行在【1 帧内】消失（不再等 1.2 秒）
    关闭皮肤 → 重新出现
· 550C 页归属：皮肤在场时页面归皮肤（boot 不再抢），皮肤撤销后 boot 顶上
· node scripts/build.mjs && node --check lib/client.js
· npm test && npm run test:harness  全绿
```

### 2.5 风险与回滚

```
风险：state.js 若被 build 拼错位置，会 ReferenceError 打断整个插件初始化（历史上有过 TDZ 事故）
对策：build 后立刻 node --check，并在 web 实例里打开设置确认面板正常
回滚：单文件新增 + 若干处替换，git revert 该提交即可
估时：半天
```

---

## 3. P1：拆巨型组件

### 3.1 src/music.js · MusicRow（295 行）

现状：开关、时长提示、导入按钮、音量滑块、淡出滑块、曲库列表、每首曲目的
试听/重命名/删除、空库提示 —— 全在一个函数里。

建议拆成：

```
MusicRow            外壳：读状态、把下面几块拼起来        ~60 行
  MusicToggle       开关 + 两行说明                        ~30 行
  MusicTransport    导入按钮 + 音量 + 淡出三个控件          ~70 行
  MusicLibrary      曲库列表容器（已用/上限 + 条目）        ~50 行
  MusicTrackItem    单首曲目：试听 / 重命名 / 删除 / 当前     ~80 行
  MusicEmptyHint    空库提示                               ~15 行
```

注意事项：
```
· 这几块都要读同一份状态，建议在 MusicRow 里用 useState 存 tracks/current，
  以 props 往下传，避免每块各自读 localStorage ✗（现在就是这么写的，改一次要改多处）
· 重命名是就地输入框，注意 blur 与 Enter 都要提交、Esc 取消
· 拆完务必手工验：导入 → 试听 → 重命名 → 删除 → 切换当前曲
```

### 3.2 src/login.js · LoginRow（340 行）

```
LoginRow            外壳                          ~50 行
  ScreenModeRow     关闭 / UEG / 550C 三选         ~30 行
  PlaybackRow       自动 / 手动                     ~25 行
  VoiceRow          女声 / 男声（女声标"开发中"）    ~35 行
  CardFields        姓名/拼音/职务/头像/编号等输入   ~90 行
  QrRow             二维码：编码 / 识别 / 生成 / 清除 ~110 行
```

二维码那块单独抽出来的收益最大：多尺度识别的重试逻辑现在是内联在
LoginRow 里的（`targets = [900, 700, 1100, 1400, longSide]`），抽成
`decodeQrImage(file)` 独立函数后可以单独测试。

### 3.3 src/login-gate.js · mountLoginGate（450 行）

建议改成状态机：

```
phase: 'in' → 'wash' → 'board' → 'auth' → 'disperse' → 'done'
每个 phase 一个函数，返回 { next, cleanup }
mountLoginGate 只负责：建节点、推进 phase、收 cleanup
```

风险最高的一步 ✗ —— 这块涉及 iframe postMessage、语音时序、`Esc` 跳过。
拆之前必须先补一条"全流程能走完"的实测脚本（第 5 节有现成探针可扩展）。

### 3.4 src/show.js · createShow（573 行）

**建议不动** ✓ 它是 550C 原稿的逐字移植（见 docs/STATUS.md 与 CREDITS.md），
风格与上游一致反而是优点；拆了以后重新移植上游更新会痛苦 ✗
只做一件事：在文件头补一段"这次移植相对上游做了哪些定点改写"的清单，
方便将来合并上游。

---

## 4. P2：共享样式与断言

### 4.1 分段控件 CSS 两份 → 一份

```
boot:  .dsh550c-seg button.on{background:#111;color:#fff;font-weight:600}
skin:  .dsh550c-skin-seg button.on{background:#111;color:#fff;font-weight:600}
```

同一个"选中态在浅色主题下看不清"的 bug 在两个仓库各犯了一次 ✗

方案（二选一）：
```
甲 各自保留类名，但配色抽成同一个常量字符串，两仓库里逐字相同，加注释互相指向
   （优点：不引入跨包依赖；缺点：靠纪律维持）
乙 boot 导出 CSS 片段，skin 运行时读取（引入跨包依赖，build 顺序敏感）✗ 不推荐
```
建议甲 ✓ 并在两个文件里各写一行注释：「改这里必须同步改另一个仓库」。

### 4.2 合并历史硬编码清单

以下数值目前写死在代码里，都应在注释里标明来源，或提取为常量：

| 位置 | 值 | 含义 | 备注 |
|---|---|---|---|
| client.js · scheduleBootFade 调用 | 3590 / 17000 | 简易档 / 完整档片头时长（ms） | 实测值：Web 14010、桌面 17000 ✗ 跨环境不一致，见 4.3 |
| client.js · FADE_MS | 620 | 画面淡出时长 | |
| music.js · TAIL_MS | 500 | 淡出比画面多收 0.5 秒 | |
| music.js · BGM_TOTAL_MAX_BYTES | 3686 * 1024 | 曲库上限 3.6 MB | localStorage 5,177,344 字符配额的天花板 |
| music.js · BGM_FADE_MIN/MAX_MS | 300 / 4000 | 淡出可调范围 | 下限必须 > 0，否则等于瞬间静音 ✗ |
| music.js · BGM_SINGLE/END_FADE | 1500 / 400 | 默认淡出 / 曲终短淡 | |
| login.js · QR targets | 900/700/1100/1400 | jsQR 多尺度重试 | 微信码 968×1433 只有 900 那档能解 |

### 4.3 片头时长跨环境自适应（遗留问题）

```
现状：写死 17000（桌面端准、Web 端偏 3 秒）
正解：首次播放实测 → 存 localStorage → 下次复用
键名：dsh-550c-boot:bgm:splash-ms:<mode>

曾经尝试过一次，补丁写崩（多写了占位语句导致 build 语法错）已回滚 ✗
重做时注意：
  · build.mjs 会做语法校验，错一个字符就构建失败
  · 改动点只有两处：scheduleBootFade 的入参、finish() 里写回实测值
  · 写成独立函数 readSplashMs / writeSplashMs，别塞进 apply 里
```

### 4.4 补"设置页渲染"断言（这轮两个 UI bug 都没被覆盖）

在 `scripts/test-host.mjs` 里加静态断言，或在 harness 里加渲染断言：

```
· 渲染 Panel550c（用假的 renderSlot）→ 断言三个页签都存在
· 断言默认 tab：__dsh550cState.bootPageOwned 为真且皮肤不在场时 tab === 'boot550c'
· 断言 SkinPromoRow 在 dsh550cSkinInstalled() 为真时返回 null
· 断言分段控件 CSS 含 background:#111 且不含 brand-primary（防止回退）
```

最后一条尤其值得：这轮"黑底黑字"反复出现，就是因为没有任何断言看着这个配色 ✗

---

## 5. 现有实测工具（可复用）

这些探针平时放在 `%TEMP%`，**容易被清理** ✗ 建议移到 `scripts/dev/` 并纳入版本管理：

```
probe-splash.mjs    量片头时长：注入探针 → 记录 overlay 出现/收口/移除时刻
                    → 实测得 简易档 3587ms、完整档 14010ms（Web）
probe-panel.mjs     开设置 → 点 550C → 读全局旗子、dsh550c-row 计数、
                    面板是否空白、捕获 console 报错
                    ← 这个脚本直接抓出了"重复注册 slot"的真实报错
test-replay.mjs     片头是否重播、host 元素是否堆积
guard-check.mjs     读 __dsh550cApplied / SplashPlayed 是否置位
```

共同用法：先起 web 实例拿 token，再把 token 作为参数传进去。

```powershell
& $env:LOCALAPPDATA\Programs\dsh-launcher\dsh.cmd --profile web --port 3848 --no-open
# 从输出里取 token=...
& node scripts/dev/probe-panel.mjs <token> 3848
```

**强烈建议：清理工作开工前先把这四个脚本搬进仓库** ✓
否则每轮排查都要重写一遍（这轮已经重写过三次 ✗）

---

## 6. 跨仓库同步约定（boot ↔ skin）

```
· 两个仓库各自独立发布，不互相 import
· 需要一致的东西（配色、类名规则、状态键名）逐字复制 + 两侧注释互相指向
· 改动顺序：先改 boot → 验证 → 再同步到 skin → 验证
· skin 版本号独立（当前 0.1.0-beta.2），发 npm 时注意 dist-tag：
  beta 版建议 npm publish --tag beta，避免顶掉 latest
```

---

## 7. 禁区与铁律（全部有代价，别重犯）

```
7.1 src/*.js 禁止出现反引号与 ${ } 
    build.mjs 把每个文件拼进一个模板字符串，出现即整包构建失败
    （连注释里也不能写）

7.2 preview/ueg.html 禁止用 indexOf/slice 取区间改代码
    曾经吃掉 61 行 ✓ 只用带唯一上下文的字符串替换

7.3 改完 ueg.html 取【最后一个】内联 <script> 块做语法检查
    第一个 <script> 是外链 ueg-load.js，抓错等于没检查 ✓

7.4 状态变量声明必须早于使用（TDZ）
    曾因 let barsSettleAt 写在 play() 之后，整个初始化 ReferenceError ✓

7.5 "设置不生效"类问题，第一步打印实际读取值
    淡出那次绕了 7 轮，就是因为先改代码猜原因 ✗
    日志里 ms=0 / ms=1500 一眼就能定案 ✓

7.6 时长/尺寸类常量不能只按一个环境实测就写死
    Web 片头 14.01s、桌面 17s ✓ 写死必然有一边错

7.7 音频"停"的路径有多条（收口 / 拆除 / 切歌 / dispose）
    必须统一到一条淡出逻辑，否则总有一条在硬切 ✓

7.8 不要写 window 全局做跨插件状态（本计划第 2 节就是来还这笔债）

7.9 preview/ueg.html 单文件 1748 行 —— 接受，但改动前先备份
    这个文件历史上丢过两次功能 ✓
```

---

## 8. 执行顺序与批次

```
批次 A（P0，半天，独立可发布 → 0.5.3）
  ① 新建 src/state.js + build.mjs 拼接顺序
  ② 迁移全部全局旗子，修掉 claimSectionIfFree 的死判断
  ③ SkinPromoRow 改用订阅（去掉 1.2s 轮询）
  ④ skin 侧登记版本（dsh550cMarkSkin）
  ⑤ 四个探针脚本搬进 scripts/dev/
  验收：第 2.4 节全部条目

批次 B（P1 上半，一天，独立可发布 → 0.5.4）
  ⑥ 拆 MusicRow → 6 个小组件
  ⑦ 拆 LoginRow → 5 个小组件，二维码识别抽成 decodeQrImage()
  验收：导入/试听/重命名/删除/切当前曲；二维码编码/识别/生成/清除 全手工过一遍

批次 C（P1 下半 + P2，一天，独立可发布 → 0.5.5）
  ⑧ mountLoginGate 改状态机（风险最高，先补"全流程走完"的实测脚本）
  ⑨ 分段控件配色常量两侧同步 + 注释互指
  ⑩ 补设置页渲染断言（4.4）
  ⑪ 片头时长跨环境自适应（4.3）

可选
  ⑫ show.js 文件头补"相对上游的定点改写清单"
```

---

## 9. 每批的固定动作（DoD）

```
① node scripts/build.mjs && node --check lib/client.js
② npm test && npm run test:harness
③ 同步到 dsh-start-web，起实例，跑 probe-panel.mjs 确认面板非空、无报错
④ 桌面端重启实测一遍（设置页 + 片头 + 音乐）
⑤ 更新 CHANGELOG（批次编号 + 具体改动）
⑥ 更新 docs/STATUS.md 的"当前状态"与"待办"
⑦ 版本号 +1（patch），提交
⑧ 发布：push main → tag → GitHub Release → npm publish
```

---

## 10. 这份文档之外，还有哪些未决事项

```
· npm 包内 README 与仓库 README 是同源（README.md 随包发布）✓ 已一致
· scripts/verify.mjs（PR #8 带来，637 行）尚未纳入 npm test 主链路
  它需要 --url 参数才能跑，考虑改造成可离线跑的静态检查
· docs/STATUS.md 与本文件有信息重叠：STATUS 记"是什么/到哪一步"，本文件记"怎么改"
  两者都保留，互相引用，不要合并成一个巨型文档
· hosts 曾把 github.com / api.github.com 指到 127.0.0.1（导致推送与 API 全断）
  若再次出现：删 hosts 里那 28 条，或重开写它们的代理工具
```
