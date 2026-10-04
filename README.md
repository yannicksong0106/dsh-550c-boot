# dsh-550c-boot

[中文](README.md) | [English](README.en.md)

[![Stars](https://img.shields.io/github/stars/yannicksong0106/dsh-550c-boot?style=flat-square&logo=github&label=Stars)](https://github.com/yannicksong0106/dsh-550c-boot/stargazers)
[![npm](https://img.shields.io/npm/v/dsh-550c-boot?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/dsh-550c-boot)
[![npm downloads](https://img.shields.io/npm/dm/dsh-550c-boot?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/dsh-550c-boot)
[![Downloads](https://img.shields.io/github/downloads/yannicksong0106/dsh-550c-boot/total?style=flat-square&label=Downloads)](https://github.com/yannicksong0106/dsh-550c-boot/releases)
[![Last commit](https://img.shields.io/github/last-commit/yannicksong0106/dsh-550c-boot?style=flat-square)](https://github.com/yannicksong0106/dsh-550c-boot/commits/main)
[![License](https://img.shields.io/github/license/yannicksong0106/dsh-550c-boot?style=flat-square)](LICENSE)
[![Topic](https://img.shields.io/badge/topic-dsh--plugin-blue?style=flat-square)](https://github.com/topics/dsh-plugin)
[![Visitors](https://visitor-badge.laobi.icu/badge?page_id=yannicksong0106.dsh-550c-boot)](https://github.com/yannicksong0106/dsh-550c-boot)

**给 DeepSeek Harness（DSH）加一段 550C 开机片头。**
每次启动客户端全屏播放，播完渐出，露出真正的界面。*Full-screen 550C boot intro for DSH.*

动画与 HTML 原稿由 **Voidpocket**（[@Voidpoket](https://github.com/Voidpocket)）提供，插件工程与移植由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）完成。详见 [CREDITS.md](CREDITS.md)。

![完整模式：47 节点逐点覆写](docs/preview-full.png)

- 🎬 **两个档位**：简易档 4 秒（logo 书写）/ 完整档 16 秒（覆写全流程），可一键关闭
- ⏭️ **随时跳过**：点击画面或按 `Esc`
- 🖥️ **盖住 DSH 自己的开机卡片**：首帧由宿主半边在文档解析阶段注入，`HARNESS / Loading plugins…` 不会再露脸
- 🎨 **四套磷光配色**，默认是原作者的琥珀；桌面窗口右上角那三个原生按钮会被收编成同一套颜色

## 安装

```sh
# 从 npm 安装（最省事：免 allowBuilds，市场里也是一条命令）
dsh plugin --profile web add dsh-550c-boot

# 从 GitHub 安装（仓库带构建产物，无安装期脚本）
dsh plugin --profile web add github:yannicksong0106/dsh-550c-boot

# 或用预构建 tarball（Release 附件，附件名不带版本号，latest 链接不会随发版失效）
dsh plugin --profile web add https://github.com/yannicksong0106/dsh-550c-boot/releases/latest/download/dsh-550c-boot.tgz

# 或从本地目录安装
dsh plugin --profile web add <本目录绝对路径>
```

装完**必须重启一次 DSH**（bundle 在启动时装配）。升级或重装后请按 **Ctrl+Shift+R** 硬刷新——
DSH 的客户端 bundle 带 `max-age=31536000, immutable`，而 URL 上的 `rev` 是进程 nonce、不随内容变化，
普通 F5 会一直用第一次抓到的副本。

## 使用

模式开关在 **设置 → 通用 → 550C 开机动画**，旁边有「预览」按钮可以立刻看一遍。

| 档位 | 时长 | 内容 |
|---|---|---|
| **简易**（默认） | ~4 秒 | 550C logo 逐路径书写 |
| **完整** | ~16 秒 | logo → 基站接管终端 → 47 节点逐点覆写 → `SYSTEM IS REWRITTEN` |
| **关闭** | — | 不播放，一张黑屏都不会出现 |

- 动画**播完才渐出**，不等软件加载状态；无论 DSH 是否早已就绪都会完整播完
- 完整档下**点击画面或按 `Esc`** 跳过
- 偏好存在浏览器 `localStorage`（键 `dsh-550c-boot:mode`），与已装的第三方设置行做法一致
- 每次客户端加载都会播（刷新页面也算）；「每个会话只播一次」需要额外去重，目前故意不做
- 片头播放期间，桌面窗口右上角那几个原生按钮**浮在动画上**（条带透明、符号用当前配色），
  窗口顶部 40px 仍可拖动窗口；片头结束自动还原
- **零运行时依赖**：`dependencies` 是空的，宿主半边只用 `node:fs`

### 版本与更新

DSH 自身没有插件更新入口，所以通用设置里多了一行 **版本与更新**：

- **检查更新**：向本机宿主查询 npm 上的最新版本。宿主先打**国内镜像** `registry.npmmirror.com`，
  失败再退官方源，响应里带上来源（实测这台机器镜像 160ms、官方 2078ms）；缓存 5 分钟，
  两个源都问不到就直说问不到。只有按下按钮才会联网。
- **立即更新**（`web` 等 profile）：由宿主调用 DSH CLI 执行
  `plugin --profile <当前 profile> add dsh-550c-boot@latest` —— 唯一受支持的改 profile 方式 ——
  把 CLI 输出原样回报，然后提示重启客户端生效。
- **桌面端走提示词**：`dsh plugin` 硬编码拒绝 `desktop`（Electron 应用独占管理该 profile），
  所以那里不给「立即更新」，而是显示「在 设置 → 插件 里安装 `dsh-550c-boot@latest`，然后重启」
  加一个复制包名按钮。

两个请求都走宿主半边的同源路由（`GET /dsh-550c-boot/update`、`POST /dsh-550c-boot/update/apply`）：
页面 CSP 很紧，而宿主进程本来就管出网。

### 配色

| 方案 | 说明 |
|---|---|
| **琥珀**（默认） | 原作者的 CRT 配色，一个 token 都不覆盖 |
| 绿 | P1 绿磷光终端 |
| 青 | 冷青磷光 |
| 白 | P4 白/灰磷光 |

「琥珀」故意没有对应的 CSS 块：选它会把 `data-scheme` 整个清掉，默认值重新接管。

![简易模式](docs/preview-simple.png)
![青磷光配色](docs/preview-cyan.png)

## 兼容与限制

- **DSH 版本要求 `>=0.2.0-rc.1`**（`package.json#dsh.engines`）。宿主半边依赖 `webserver/index-inject`
  的行渲染行为，我只在 `0.2.0-rc.1` 上实测过，不声明没验过的下限。在更低的宿主（如 `0.1.7-rc.2`）上
  安装能过，但之后的应用内更新会被以 412 拒掉；需要 `0.1.7` 支持可以提 issue。
- 只能在 **Web UI 加载之后**覆盖全屏，做不到早于 Electron 窗口首帧（窗口本身仍有一瞬间空白）。
- 首帧是一块**纯色**（动画自己的底色），不是动画的第一帧画面——它只负责在插件求值前占住屏幕。
- 桌面窗口的原生按钮仍在，只是被改成同一套配色；要去掉得改桌面壳。
- macOS 上片头播放期间，顶部条带归窗口拖动，点击跳过请点别处或按 `Esc`。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 工程结构、为什么是「提取」而不是重写、启动时序与首帧注入策略 |
| [docs/ENHANCEMENTS.md](docs/ENHANCEMENTS.md) | 内容增强层：等宽字体、字符单元进度条、真实时钟戳、固件页脚与 CRC32 |
| [docs/DESKTOP-CHROME.md](docs/DESKTOP-CHROME.md) | 桌面标题栏三个按钮的让位与换色、macOS 拖拽守卫 |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | 构建与验证：harness 探针、真实 GUI 的 CDP 截图断言 |
| [docs/PUBLISHING.md](docs/PUBLISHING.md) | 发布与收录：GitHub 直装 / OMDSH Hub 投稿 / npm |
| [docs/PLAN-macos-and-update-check.md](docs/PLAN-macos-and-update-check.md) | 评估稿：macOS 适配待办、设置里的「检查更新」方案对比 |

> 顶部徽章都是外部图片（shields.io / 第三方访客计数器），加载不出来不影响 README 本身。

## 致谢

动画与 HTML 原稿由 **Voidpocket**（[@Voidpoket](https://github.com/Voidpocket)）提供，插件工程与移植由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）完成。详见 [CREDITS.md](CREDITS.md)。

[MIT](LICENSE) © 2026 Ziyang Song
