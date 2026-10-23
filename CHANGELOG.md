# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号用 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.5.2] - 2026-10-23

这一版的主线是**代码结构**：把散在 `window` 上的临时全局收进一个状态对象、把五个巨型函数拆开、
让"皮肤在不在"只剩一个判定入口。顺手修掉三个一直没人看见的真 bug，其中两个是 0.5.2 自己声称修过、
实际没生效的。

行为不变 —— 除了下面明确列出的三条修复，其余都是原样搬迁。

### 代码结构

- **共享状态收口**：新增 `src/state.js`。十个 `window.__dsh550c*` 旗子合并成一个状态对象
  （`dsh550cGet` / `dsh550cSet`），键名集中登记；"皮肤在不在"只剩一个入口
  `dsh550cSkinInstalled()`，默认页签、推荐行、页面归属三处共用它。
  皮肤侧无需改动 —— 它的宿主半边注入的版本号本来就是唯一事实来源。
- **三处巨型函数拆开**（MAINTENANCE 列的五个里挑的三个；`createShow` 与 `verify.mjs` 按下述理由不动）：
  - `MusicRow` 295 → 50 行：状态与写入口抽成 `useMusicLibrary()`，界面拆成
    `MusicToggle` / `MusicTransport` / `MusicLibrary` / `MusicTrackItem` / `MusicEmptyHint`。
  - `LoginRow` 340 → 53 行：拆成 `ScreenModeRow` / `AutoplayRow` / `VoiceRow` / `QrRow` / `CardFields`。
  - `mountLoginGate` 450 → 25 行：UEG 那条路（iframe + postMessage）搬进新文件
    `src/login-ueg.js`，终端档改名 `mountTerminalGate()`，`mountLoginGate` 只负责分派。
  - `createShow`（573 行）**不动**：它是 550C 原稿的逐字移植，拆了没法合上游更新。
- **可单测的抽离**：二维码多尺度识别从组件里拿出来，变成
  `decodeQrImage(file) → { ok, text } | { ok: false, reason }`，不再直接改组件状态。
- **常量去重**：曲库容量原来有两个同值常量（各写一遍 `3686 * 1024`，注释还写着 3MB），
  合并成 `BGM_CAP_BYTES`；`BGM_TAIL_MS`、`QR_DECODE_TARGETS`、`SEG_ACTIVE_RULE` 提成具名常量并注明来源。
- **卡片字段由数据驱动**：七个 input 原来各手写一遍，而 `LOGIN_CARD_KEYS` 早就列好了却没人用 ——
  现在由它渲染，加字段只改常量。
- **片头时长改成"实测回写"**：不再写死 17000。首轮按载体（桌面 / Web）取兜底值，
  播完把真实时长写进 `localStorage`，下一轮直接用。跳过与看门狗不参与回写（否则会越调越早）。
- **断言补齐**：`scripts/test-host.mjs` 新增 21 条结构断言 —— 死键回来、外壳重新长胖、
  拆分被合回去，都会直接红。此前这几处 UI 一条断言都没有。
- **浏览器套件适配拆分**：`scripts/harness/rows.js` 的 React shim 现在会展开函数组件
  （原来只读 createElement 的原始结果，拆完就看不见子组件里的按钮）。这一条是套件自己抓出来的回归，
  修的是 shim，不是断言。

### 修复

- **浅色主题下选中项看不清**：分段控件的选中态原来借用主题变量
  （`brand-primary` / `brand-text`），而这两个值在深浅主题里是翻面的，
  皮肤还会改写它们 —— 结果一会儿黑底黑字、一会儿白底白字。
  现在固定黑底白字，两套主题、皮肤开或关都一致可读。
- **550C 页打开是空白**：`panel.js` 默认停在「外观」页签，而那一页由皮肤填充，
  皮肤没启用时整页是白板。现在按皮肤状态选默认页签：有皮肤停「外观」，
  没皮肤停「550C 开机动画」。

### 新增

- **未装皮肤时推荐 550C 皮肤**：在 550C 页（以及「外观」页）显示一行推荐，
  说明皮肤做什么、给一个「去安装」按钮指向 npm。皮肤启用后 1.2 秒内自动消失，
  不用手动关。
## [0.5.1] - 2026-10-22

这一版只修开机音乐，不动其他功能。

### 修复

- **淡出听不出来**：淡出时长在存储层发生了"秒 / 毫秒"错位 —— 设置页滑块存的是
  秒（0.5–4），读取时却按毫秒解释，于是"4"变成 4 毫秒、"0"变成零时长，
  听感上就是没有淡出（音量瞬间归零）。现在读写两端都做单位归一，
  并把下限抬到 300ms，保证任何情况下都有可闻的渐弱。
- **拆除脚手架时硬停**：片头收口 / overlay 拆除任何一条路径都会调停止，
  原来直接 `pause()`。现在 `stopBgm()` 一律先按设置时长淡出再停；
  淡出进行中时其它停请求会被忽略，不会被半路掐断。
- **淡出收尾点对不上画面**：改为按片头总时长提前排程，
  `delay = 片头时长 + 0.5 秒 − 淡出时长`，让渐弱正好收在画面结束之后半秒。
- **片头时长写死成错的值**：原按 Web 端实测的 14.01 秒写死，
  而桌面端完整档实际是 17 秒，导致桌面端淡出提前 3 秒收完。现已改为 17 秒。

### 其他

- 曲库上限 3 MB → 3.6 MB（3686 KB），贴近 localStorage 5,177,344 字符配额的上限；
  再高会先抛 `QuotaExceededError`，不是不想给，是存不下。
- 设置页文案同步：完整档约 14 秒 → 约 17 秒；补一句"音乐要比片头长 2 秒以上"。
## [0.5.0] - 2026-10-21

### 新增

- **身份卡二维码可自定义**：设置里填链接/文本即可在本地编码成二维码，
  也可以选一张现成的二维码图片，在本地识别出内容后回填。
  动画页按卡片本身的点阵风格重绘（深色底、浅色模块、定位角实心），
  既可扫又不破坏观感。编码与识别全在本机完成，不联网。
- **开机音乐**（来自社区 PR #8，作者 [@Eileenes](https://github.com/Eileenes)）：
  导入 / 试听 / 重命名 / 删除 / 指定曲目，音量与淡出时长可调，
  片头开始播放、结束前渐弱淡出。曲库上限 3 MB，
  且 UEG 登录界面下自动不播（那里自带配音，避免两个声音打架）。

### 修复

- **地球自转方向不对**：陆地点云原先按"图片像素 = 经纬度"采样，
  但那枚徽记里的地球是北极俯视的方位等距投影，导致大陆形状错误、
  转起来像南北方向在动。现改用 Natural Earth 110m 陆地多边形重烘，
  并固化为 `scripts/bake-land.mjs`（`npm run bake:land`），可复现。
- **核验结论与底部动画不搭**：结尾由旋转印章改为整卡宽的反显状态条
  （`▸ 核验通过` + `ACCESS GRANTED`），从左往右擦出、文字逐字解码，
  配一条整卡读取光带；底部 40 根竖条改为脚本驱动，
  结论落定时脉动幅度平滑衰减，从左往右收平。
- **设置页二维码行布局**：移出卡片字段网格、占满整行，标题与状态分行。
## [0.4.1] - 2026-10-18

### 修复

- **桌面端（DSH Desktop）身份卡头像不显示**（#6）：桌面客户端把顶层文档的 `localStorage`
  换成了宿主存储代理，而 `/ueg/` 的 iframe 是独立 realm，拿不到那层覆写 —— `getItem` 返回空，
  照片框永远停在 `PHOTO` 占位符。现在由父页用 `postMessage` 把头像递进 iframe
  （不塞进 URL，所以也不会撞 base64 引发的 431），浏览器里的 `localStorage` 老路径保留。
- **第一次点开「UEG 登录界面」时整行没有样式**：设置行的样式表原本只在 `src/rows.js`
  的行组件里按需注入，而 UEG 这一行由 `src/login.js` 渲染、从不触发注入。于是首次进入该 tab 时，
  输入框退回浏览器默认外观（`<input>` 是 inline-block，按容器宽度自动流排），看起来像挤成三列，
  描述文字没有行距、胶囊没有分组、文件框顶破右边。现在在设置页壳 `Panel550c` 开头注入 ——
  先点哪个 tab，第一帧就有样式。
- **身份卡「姓名下面那行」不再写死**：`LIU PEIQIANG · 联合政府 航天员大队` 原本是硬编码纯文本，
  DIY 姓名完全改不动它。现在这行有单独的 id，并新增两个设置项 **英文名 / 拼音** 与
  **职务 / 所属单位**：填了就显示「拼音 · 职务」，只填一个就显示那一个，都不填则留空。
- **卡片字段改成两列网格**：`repeat(2, minmax(0, 1fr))`，宽容器下不再排成三列把占位文字截断；
  占位文字也相应缩短。
- **面板容器补 `width:100%; min-width:0`**：不再被内容撑开，随容器宽度重排。

### 适配

- **适配 DSH `0.2.0-rc.2`**：在 rc.2 的 profile 里实测通过 —— 插槽体系
  （`settings.section` / `settings.general.item` / `settings.550c.item`）、
  `webserver/index-inject`、`webServer.register` 与客户端模块加载器均未变，
  **插件零代码改动即可运行**（0 报错，设置页与三个分组、版本注入、首帧黑帧全部正常）。
- `dshWorkshop.compatibility.dshVersions` 增加 `0.2.0-rc.2`；
  `engines.dsh` 保持 `>=0.2.0-rc.1`（rc.1 仍可用，不额外收紧）。
- `docs/PUBLISHING.md` 的实测基线补充 rc.2。
## [0.4.0] - 2026-10-16

### 界面与设置页改版

- **「550C」设置页换成筛选式**：顶部是胶囊切换条（外观 / 550C 开机动画 / UEG 登录界面），
  内容区是一张圆角卡片；胶囊吸顶，滚动时跟着走。颜色改成跟随主题（用 `color-mix` 与
  `currentColor`），白主题下也看得清。
- **发布硬伤修复**：`lib/index.js` 里写死的绝对路径改成基于 `import.meta.url` 的仓库相对解析；
  配音收进 `preview/voice/`（每句一个 wav，共 10 个），发布出去的包不再让 `/ueg/` 404。
- **新增检查更新 / 一键更新**：宿主代理两条路由（先 npmmirror 后 npmjs，5 分钟缓存、
  6 秒查询超时），设置页显示已装版本与最新版本；桌面端只能提示去「设置 → 插件」里装。
- **配置元数据**：`keywords` + `dsh.suite`（声明与 `dsh-550c-skin` 同属一套件、互相推荐、无依赖）。

### 修复

- `LOGIN_VALUES` 常量缺失导致档位读写静默失效，表现是**点 UEG 档位高亮不动**
  （读写都抛错并被 `try/catch` 吞掉）。
- splash 互斥在 `mountOverlay()` 返回 `null` 时调用 `dispose()`，异常会让**插件整包加载失败**，
  表现是**设置里没有 550C、皮肤一起崩**。
- UEG 动画的凝聚起点偏右：窗口由小变全屏时画布属性尺寸没跟着更新，坐标被拉伸；
  现在监听 `resize` 同步画布与凝聚中心。

### 代码整理

- 新增 `src/panel.js`：`PANEL_TABS` / `PANEL_SLOTS` / `Panel550c` 的单一事实来源，
  加新动画只需改一处；`login.js` 与 `client.js` 全部改为引用它。
- 拆出 `login-css.js` / `login-gate.js` / `login-themes.js` / `rows.js`：
  `login.js` 1125 → 363 行，`client.js` 971 → 655 行。
- 删除临时目录与开发残留（`.verify-*` 归档进 `_dev/` 并加进 `.gitignore`）。

### 新增

- **登录/授权阶段（`src/login.js`）**：片头结束之后、进界面之前，先走一段**可交互的访问授权**。
  两套主题共用一套状态机：**UEG 联合政府**（暖白全息、档案文书）与 **550C 控制终端**
  （磷光 CRT，配色跟随设置里已选的方案）。五步：需要许可 → 身份确认 → 接收需求 → 读取权限 → 核验通过。
- **设置行「登录授权界面」**：选 关闭 / UEG / 550C，另有速度（慢/标准/快）、操作员姓名与「预览」按钮；
  通用页 order 29，550C 页 order 80。
- **交互规则**：第一步是点击门（绕过浏览器 autoplay 限制）；每一步由**语音时长**驱动推进
  （`speechSynthesis` 的 `onend`），点击或 Enter 只是"催一下"，不会掐断语音；`Esc` 或跳过按钮立即离场。
- **零素材**：语音走系统 TTS，音效由 WebAudio 现场合成；不携带任何影视画面、声音、音乐、配音或标识。
  出处与免责见 [CREDITS.md](CREDITS.md)（交互思路致谢 6shenhonghong9/dsh-startup-screen，MIT © 沈宏宏）。

### 变更

- 片头的唯一出口 `dispose()` 现在会调用 `startLoginPhase()`，并在 `document` 上派发
  `dsh550c:boot-done`；禁用插件时不会启动登录阶段（`pluginTornDown` 守卫）。

### 验证

- 浏览器套件新增登录行的渲染断言：**71 条断言 / 16 用例**（此前 68 条）。

## [0.3.3] - 2026-10-01

### 变更

- **设置行文案砍短**：按「检查更新」后只说结果 —— 「已是最新 vX。」「有新版本 vY。」（并说明怎么更新）
  或错误一行，不再解释插件原理；三行的描述各缩成一句。

### 新增

- **设置行的文案进测试**：新增 `scripts/harness/rows.js`，用记录元素树的 React shim 在 harness 页里
  真正渲染三个设置行、驱动按钮、读回用户会看到的文字；`settings rows · rendered text` 用例断言三行的
  标题/描述/按钮，以及检查更新的五种结果（未按、已最新、桌面提示词、web 一键更新、404）。
  此前行的 UI 从没被验过：harness 只用过工厂的副作用（片头）、没调用 `apply()`，node 侧又没有 react-dom。
## [0.3.2] - 2026-10-01

### 修复

- **「检查更新」在只刷新页面时会 404**：客户端半边随页面刷新就更新，宿主半边只在进程启动时加载，
  所以刷新过页面但没重启客户端时，这条路由根本不存在。现在行内直接用宿主注入的版本号判断这件事
  （没有版本号 = 宿主是旧的），提示「重启 DSH 客户端后这个按钮就能用」，404 时也给出同样的解释，
  并保留复制包名与 npm 页面入口。

## [0.3.1] - 2026-09-30

### 变更

- **只是版本号对齐**：npm 上的 latest 已经是 0.3.1 —— 0.3.0 那次 PUT 被网络重置后进了 npm 的
  暂存流程，随后一次发布把它提交上线，两个版本的代码完全相同。仓库版本随之对齐，免得
  「仓库最新」和「npm 最新」对不上。

## [0.3.0] - 2026-09-30

### 变更

- **「检查更新」改成查 npm，优先国内源**。原来查 GitHub Releases，实测这台机器上 npmmirror
  **160ms**、registry.npmjs.org **2078ms**（13 倍），所以宿主半边先打 `registry.npmmirror.com`、
  失败再退官方源，响应里带上来源（`source: npmmirror | npmjs`）让用户知道这份答案从哪来。
  缓存 5 分钟；两个源都问不到时 `state: unknown` 并附上错误，不假装知道。

### 新增

- **直接提供更新服务**：新增 `POST /dsh-550c-boot/update/apply`，宿主调 DSH CLI 执行
  `plugin --profile <当前 profile> add dsh-550c-boot@latest`（唯一受支持的改 profile 方式），
  把 CLI 输出原样回报，并提示重启生效。profile 名从 `DSH_PROFILE` 读。
- **桌面端走提示词**：`dsh plugin` 硬编码拒绝 `desktop`（`profile.toLowerCase() === "desktop"`，
  因为 Electron 应用独占管理它），所以 desktop profile 下不显示「立即更新」，而是给出
  「在 设置 → 插件 里安装 `dsh-550c-boot@latest`，然后重启」+ 复制包名按钮。
- 清单权限补上 `web:http-route` 与 `network:npm-registry`（此前只声明了 `web:index-inject` 等）。

## [0.2.0] - 2026-09-30

### 新增

- **设置里的「版本与更新」**：DSH 自身没有插件更新入口，这一行向本机宿主查询 GitHub 上的最新发布。
  请求走宿主半边的同源路由 `GET /dsh-550c-boot/update`（页面 CSP 很紧，而宿主进程本来就管出网），
  按下按钮才查、上游结果缓存 10 分钟；有新版本时给出安装包名与发布页，查不到就直说查不到。
  宿主半边顺带用 `global` 注入行把运行版本交给页面；路由通过**可选注入**
  （`ctx.inject(['webServer'], …)`）注册 —— 没有 HTTP carrier 的 profile 照样有片头，只是这行少个按钮。

### 修复

- **不再借 `dsh-web` 全家桶的 `data-dsh-boot-splash` 标记**（维护者 review 指出，真机后果很重）。
  那个名字不是豁免而是契约：全家桶会样式化它（`pointer-events:none`、`z-index:9999`、不透明底色、
  自己的 `transition`），它的 boot shield 还会找到并复用、约 1.2 秒后 `remove()`。装全家桶的用户会
  失去点击跳过、失去两段式交接、片头一秒出头被删。现在带自己的 `data-dsh-550c-boot`，用标准的
  `aria-hidden="true"` 换同一条拖拽豁免；`z-index` / `background` / `pointer-events` / `transition`
  显式声明在 document 级样式表里并带 `!important` —— 文档树的普通声明本来就压过 shadow 里的 `:host`。
- **0.1.4 给 shadow root 里的 `#hud-top` 标 `data-window-drag` 是无效的**（维护者 review 指出）：
  官方规则是 `html[data-platform=darwin] [data-window-drag]{-webkit-app-region:drag}`，与 shell 的
  同步查询都在文档树里，看不见 shadow root 内的属性。改成一条 40px 的**文档级拖拽带**，并显式声明
  `-webkit-app-region:drag`（Windows 也生效）。代价：这 40px 里的点击归窗口拖动，跳过按 `Esc`。
- 去掉没有任何源码 import 的 `ajv`：本插件现在是**零运行时依赖**。
- **可复现的断言进仓**：新增 `scripts/test-host.mjs`（宿主半边，纯 node，CI 硬门）与
  `scripts/harness/`（浏览器套件：15 用例 / 54 断言，自动起静态服务器，拿不到真实页面时退回内置
  兜底页，找不到浏览器则跳过）。此前这些断言都在 gitignore 的 `.verify/` 里，新克隆拿不到。

## [0.1.4] - 2026-09-30

### 修复

- **macOS 三处收尾**（此前只做了"不吞掉窗口拖拽"）：
  - HUD 让位常量从拍脑袋的 `86px` 改成按 shell 自己数字推导的 **76px**（红绿灯 x=16 + shell 给它们
    留的 52px 条宽 + 8px 呼吸位）；
  - **全屏时让位塌成 0**：macOS 全屏收红绿灯、Windows 全屏收 overlay 按钮，preload 用
    `html[data-fullscreen]` 报这件事；插件用 `MutationObserver` 盯这个属性并镜像到宿主元素，
    所以片头正在放的时候切全屏也跟得上；
  - **HUD 条带标 `data-window-drag`**：这是官方 base.css 认的标记（"被标记行的空白段可拖、
    控件仍可点"），补上之后完整档片头期间窗口不再拖不动。
- darwin 上不再注入标题栏换色样式表：preload 的探针元素只在 win32 创建，那边没有可改的条带。

## [0.1.3] - 2026-09-30

### 修复

- **片头到对话页的交接改成两段式**。原来整屏一次性 cross-fade，而片头结尾是一枚放大的高对比度
  logo，那半秒里会有一枚灰色 logo 幽灵盖在已经加载好的对话页上（用真实时间的逐帧截图确认过）。
  现在：内容先淡进片头自己的底色（`--bg`，由遮罩自己绘制）→ 一屏干净的黑 → 再淡出黑底露出对话页。
  总时长 620ms（内容 200ms，黑底延迟 200ms 后 420ms 淡出）。

## [0.1.2] - 2026-09-30

### 变更

- **桌面标题栏条带改为透明**：片头播放期间，右上角那几个原生按钮**浮在动画上**，不再压着一条
  不透明的色带。做法是把 preload 探针元素的 `background-color` 设成 `transparent`、符号色设成当前
  配色 —— 探针这两个 computed 值就是 `setTitleBarOverlay({color, symbolColor})` 的来源。
- 两处只在真机暴露的坑修掉了：颜色必须写在探针元素**自己**身上（app 把 token 定义在 `body` 上，
  `:root` 上的 `!important` 因"最近祖先"规则压不过它，整段片头条带都不变）；读配色要等增强层样式表
  挂上之后再读，否则静默落到兜底值。

## [0.1.1] - 2026-09-29

### 修复

- **macOS：片头播放期间窗口拖不动**。官方基础样式表把每个 body 直接子元素都算成
  `-webkit-app-region: no-drag`，铺满视口的遮罩会把整扇窗口从 macOS 可拖拽区域里减掉，
  双击缩放也失效。现在宿主元素带 `data-dsh-boot-splash`（`dsh-web-all` 全家桶豁免的标记之一），
  并自带一条 `-webkit-app-region: initial !important` 覆盖没装全家桶的纯 DSH。
  点击 / `Esc` 跳过不受影响。

### 文档

- README 重排为「是什么 / 装 / 怎么用 / 配色 / 兼容与限制 / 文档索引」，工程细节拆进 `docs/`：
  `ARCHITECTURE.md`、`ENHANCEMENTS.md`、`DESKTOP-CHROME.md`、`VERIFICATION.md`。
- 新增 `docs/PLAN-macos-and-update-check.md`：macOS 适配待办与设置里「检查更新」的方案评估。
- 新增 README 顶部实时徽章（Stars / Downloads / 最近提交 / 许可 / topic / 访客）。

## [0.1.0] - 2026-09-28

### 新增

- 550C 开机片头：简易档约 4 秒、完整档约 16 秒，点击画面或 `Esc` 跳过，播完渐出。
- 首帧由宿主半边经 `webserver/index-inject` 在文档解析阶段注入 —— DSH 自己的
  `HARNESS / Loading plugins…` 卡片不会露脸；卡片消失或进入失败态时首帧自行退役，另有 12s 上限。
- 通用设置里的设置行：三档（关闭 / 简易 / 完整）、四套配色（琥珀 / 绿 / 青 / 白）与「预览」按钮。
- 桌面窗口右上角原生按钮的收编：`#hud-top` 按 `env(titlebar-area-width)` 让位，
  条带底色与符号色跟随当前配色（走 `dsh-desktop:windows-appearance`）。
- 内容增强层：等宽字体栈、字符单元进度条、块光标与真实时钟戳、固件注入页脚（行号 / 地址 / CRC32）、
  集群节点信号条。

[0.1.1]: https://github.com/yannicksong0106/dsh-550c-boot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/yannicksong0106/dsh-550c-boot/releases/tag/v0.1.0
