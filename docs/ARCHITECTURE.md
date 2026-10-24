# 工程结构与时序

[← 回到 README](../README.md)

## 目录结构

```
assets/550C-source.html   原版独立页面（归档，构建的输入）
scripts/extract.mjs       从原页面提取样式表 / DOM / 脚本 → src/assets.js + src/show.js
scripts/build.mjs         把四段拼成 lib/client.js（无打包器、无构建依赖）
scripts/check-skin-contract.mjs  boot ↔ skin 的跨仓库契约检查（11 条，无皮肤仓库时跳过）
src/state.js              跨插件共享状态 + 唯一的"皮肤在不在"判定
src/client.js             手写：遮罩层、通用设置那一行、插件导出
src/login-ueg.js          UEG 档：iframe + postMessage（与终端档无关）
src/login-gate.js         登录相位调度器 + 终端档（五步时间轴闭包）
src/enhance.js            内容增强层：追加样式表 + 观察 stage（含桌面标题栏那两段）
lib/client.js             构建产物（浏览器半边，提交进仓库）
lib/index.js              宿主半边：往 index 注入首帧
cordis.patch.yml          bundle 补丁：把插件挂进 profile
```

## 为什么是「提取」而不是「重写」

动画不重新实现，而是把原页面的 `<style>`、DOM 结构和 `<script>` 机械搬运过来，只做定点改写。
这样移植不会和作者调好的动画效果产生偏差；原文件改了，重跑 `npm run build` 就能同步。

定点改写清单（全部写在 `scripts/extract.mjs` 里，每条都带原因）：

| 改写 | 原因 |
|---|---|
| `html, body` / `:root` / `body::before` / `body::after` → `:host` | Shadow DOM 里这些选择器匹配不到任何东西，`:root` 那条尤其致命——调色板变量全在里面 |
| `$()` 绑定到 shadow root 的 stage | 所有查询都在遮罩内部，不能落到宿主文档上 |
| 弹窗 append 到 stage 而不是 `document.body` | 否则作用域样式表够不着它们 |
| `sleep` / `setTimeout` → 可取消版本 | 一次跳过要能解开整条 async 链，不留孤儿定时器 |
| 删掉页面级的空格键监听和自动启动 | 触发权归遮罩层，页面级监听会重复触发 |
| 删掉 `#hint`（"REFRESH TO REPLAY"） | 插件是渐出，不是提示刷新 |

**为什么用 Shadow DOM**：原页面的 CSS 里有 `.w`、`.ln`、`.dt`、`.sect` 这类极通用的类名，
放进宿主文档会污染 DSH 自己的界面。Shadow DOM 让原样式表原样生效且零泄漏。

## 启动时序与挂载策略

DSH 自己有一张开机卡片（`[data-dsh-boot]`，"HARNESS / Loading plugins…"），由 shell 的内核绘制，
按插件加载进度更新，**全部加载完才移除**。`shell.overlay` 这类槽位要等 shell 渲染后才存在，shell
渲染又要等所有插件加载完——也就是说：**走槽位的开机动画永远排在 DSH 那张卡片后面**。

所以遮罩**不走槽位**：在客户端半边**模块求值的那一刻**就直接命令式挂到 `document.body` 上
（见 [`src/client.js`](../src/client.js) 的 `mountOverlay()`）。生命周期仍归插件所有——
`apply()` 里注册 `ctx.effect` 负责卸载。

但客户端半边仍然**太晚**。实测（CDP 在页面脚本之前预注入探针，从导航开始计时）：

| 事件 | 时刻 |
|---|---|
| DSH boot card 出现 | 67 ms |
| 本插件遮罩挂载 | 338 ms |
| DSH boot card 被移除 | 517 ms |

内核先画卡片，插件的包要先被下载并求值——**中间 271ms 是客户端插件怎么调 z-index 都盖不住的**。

### 首帧交给宿主半边

能早于 shell 的只有**被送出的那份文档**本身。DSH 正好留了这个口子：`webserver/index-inject`
收集一张 index 注入行表，Web 载体把它渲染进 index.html（**紧跟 `<head>`**，早于 shell 的 module
script），桌面载体则在 settle `__DSH_BOOT_READY__` 之前**在页面里逐行应用**同一张表（`script` 行
走 `createElement`，所以会执行）——两条路都在内核建卡片之前。

于是 [`lib/index.js`](../lib/index.js) 推两行：一条 `style`，一条同步 `script`。
效果是**卡片从来没被画到屏幕上**：文档还在解析时，盖住全屏的首帧（就是动画自己的底色 `#050403`）
已经在了；遮罩挂载的同一帧移除它，两者无缝交接。

两个约定（两边注释里都写了，改一边要改另一边）：

| 约定 | 作用 |
|---|---|
| `dsh-550c-boot:mode` | 注入脚本自己读这个键：**关闭**档直接不作画，一张黑屏都不会出现 |
| `window.__dsh550cFirstFrame.end()` | 遮罩挂载后调用它退役首帧（同一任务、同一帧，无缝） |

首帧也不会赖着不走：注入脚本每 250ms 看一眼那张卡片——卡片消失（应用挂载）或卡片丢掉 spinner
（shell 自己的失败态）就自己撤；再加 12s 绝对上限。客户端挂了、别的插件把 shell 弄挂了，页面都还是
能看能点的。

### 结束时的两段式交接

片头播完（或被跳过）后**不是**整屏一次性 cross-fade：片头结尾往往是一枚放大的高对比度 logo，
一次性淡出会在半秒里把它的灰色幽灵盖在已经加载好的对话页上（用真实时间的逐帧截图量到过）。

所以 `finish()` 之后分两段：

| 段 | 时长 | 做什么 |
|---|---|---|
| 内容 | 200ms | `.dsh550c-stage` 淡到透明——logo 与面板先化进片头的底色 |
| 黑底 | 延迟 200ms，再 420ms | `:host(.dsh550c-out)` 淡出，露出下面的对话页 |

遮罩自己用 `background:var(--bg)` 画那层黑底（`--bg` 就是动画自己的底色变量，两段颜色因此天然一致），
总时长 620ms 与 `FADE_MS` 对齐——它同时是移除元素的定时器。
