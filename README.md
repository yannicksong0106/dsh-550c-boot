# dsh-550c-boot

[中文](README.md) | [English](README.en.md)

[![npm](https://img.shields.io/npm/v/dsh-550c-boot?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/dsh-550c-boot)
[![npm downloads](https://img.shields.io/npm/dm/dsh-550c-boot?style=flat-square&label=npm%20%E6%9C%88%E4%B8%8B%E8%BD%BD)](https://www.npmjs.com/package/dsh-550c-boot)
[![npm total](https://img.shields.io/npm/dt/dsh-550c-boot?style=flat-square&label=npm%20%E6%80%BB%E4%B8%8B%E8%BD%BD)](https://www.npmjs.com/package/dsh-550c-boot)
[![Stars](https://img.shields.io/github/stars/yannicksong0106/dsh-550c-boot?style=flat-square&logo=github&label=Stars)](https://github.com/yannicksong0106/dsh-550c-boot/stargazers)
[![Forks](https://img.shields.io/github/forks/yannicksong0106/dsh-550c-boot?style=flat-square&label=Forks)](https://github.com/yannicksong0106/dsh-550c-boot/forks)
[![Last commit](https://img.shields.io/github/last-commit/yannicksong0106/dsh-550c-boot?style=flat-square&label=%E6%9C%80%E8%BF%91%E6%8F%90%E4%BA%A4)](https://github.com/yannicksong0106/dsh-550c-boot/commits/main)
[![License](https://img.shields.io/github/license/yannicksong0106/dsh-550c-boot?style=flat-square&label=%E8%AE%B8%E5%8F%AF%E8%AF%81)](LICENSE)

**给 DeepSeek Harness 加一段 550C 开机片头，接一段能点着玩的 UEG 访问授权。**

打开 DSH 先看片头。片头之后，你是一名为联合政府工作的操作员 —— 终端在跑、身份卡在核验、地球在转。点击或按 `Enter` 往下走，`Esc` 随时跳过。

0.5.0 起，身份卡上的二维码和片头音乐都可以换成你自己的。

![完整档：47 个节点逐点覆写](docs/preview-full.png)

---

## 功能

### 🎬 开机片头

- **两个档位**：简易档约 4 秒（logo 书写）／ 完整档约 17 秒（覆写全流程），也可以一键关掉
- **随时跳过**：点一下画面，或按 `Esc`
- **不露馅**：首帧由宿主半边在文档解析阶段就盖上去，DSH 自己的 `HARNESS / Loading plugins…` 卡片不会再闪出来
- **桌面端也照顾到**：片头播放时，窗口右上角那三个系统按钮会跟着变透明，符号色跟着主题走
- **开机音乐**：导入自己的音频，试听、改名、删除、指定曲目。音量和淡出时长（0.5–4 秒）都能调；
  淡出按片头时长提前排程，收在画面结束后约半秒，不会硬切。
  只在 550C 片头播放，曲库存在本机（上限 3.6 MB），所以建议剪 19 秒左右的片段再导入

### 🛰️ UEG 访问授权界面

片头之后可以接着走一段**可交互**的访问授权，一共三幕：

1. **过曝洗白 → 底板擦出** —— 终端、身份卡、地球依次到位
2. **五步授权** —— 身份核验、权限判定、许可证签发，一路打字机 + 语音播报
3. **色散揭幕** —— 终幕把整屏收成一句话

- 点击或按 `Enter` 推进，`Esc` 跳过
- **两套主题**：UEG 联合政府（浅色公文风）／ 550C 控制终端（暗色终端风）
- **可以 DIY 你的身份卡**：操作员姓名、头像、编号、授权等级、签发机构、有效期、许可范围、生物特征
- **二维码也能换成你自己的**：填一段文字或链接，本机编码成二维码；也可以选一张现成的二维码图片，本机识别出内容后按卡片风格重绘。全程不联网
- **结论落定的那一拍**：核验完成时整卡刷过一条读取光带，底部浮出「▸ 核验通过 · ACCESS GRANTED」，文字先乱码再逐字定格，底部竖条随之收平
- **配音**：男声已就绪；女声仍在制作中（界面标着「开发中」）
- **自动播放**：默认开启，也可以改成手动

### 🎛️ 设置页

设置里多一个 **550C** 页，顶部是胶囊切换条：

| 分组 | 里面放什么 |
| --- | --- |
| **外观** | 皮肤相关的设置行 |
| **550C 开机动画** | 片头档位、配色、开机音乐（导入 / 试听 / 音量 / 淡出）、版本与更新 |
| **UEG 登录界面** | 界面档位、自动播放、配音、卡面 DIY、身份卡二维码、预览 |

- **检查更新**：直接读 npm 上的最新版本，告诉你有没有新版，支持一键更新（桌面端会让你去「设置 → 插件」里装）
- **预览**：不用重启，点一下就能看动画

### 🎨 配套皮肤

想要整套视觉一致，配一个同套件的皮肤插件：

> **[dsh-550c-skin](https://www.npmjs.com/package/dsh-550c-skin)** —— 把 DSH 整个界面换成 550C 控制台（四套磷光配色、扫描线、等宽字体、机器读数栏）。

两个插件**各自独立安装、互不依赖**；同时装上时，550C 设置页由本插件提供，皮肤只往里加自己的设置行。

## 也可以试试这两个启动动画插件

如果你正在挑启动动画，这两个项目也值得看一眼：

- **[dsh-startup-secret](https://github.com/huzhengcai471-crypto/dsh-startup-secret)** —— by [@huzhengcai471-crypto](https://github.com/huzhengcai471-crypto)
- **[dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen)** —— by [@6shenhonghong9](https://github.com/6shenhonghong9)

三个插件各自独立，装哪个都不影响另外两个。如果它们对你的口味，去给两位作者点个 ⭐ 就是最好的鼓励。

---

## 安装

```bash
npm i dsh-550c-boot
```

或者直接在 DSH 里：**设置 → 插件 → 安装** `dsh-550c-boot@latest`。装完重启一次客户端。

---

## 怎么用

```
设置 → 550C
  ├─ 550C 开机动画   选档位（简易 / 完整 / 关闭）、换配色
  └─ UEG 登录界面    选界面、开自动播放、选配音、改身份卡、点「预览」看效果
```

> 片头和 UEG 界面**只能留一个**：UEG 自带完整三幕，所以它开着的时候片头会自动让位。关掉其中一个就能用另一个。

---

## 已知限制

- **女声配音**还在做（界面上标着「开发中」）
- **桌面端不能自动更新**（desktop profile 由客户端独占管理）—— 点「检查更新」会告诉你去「设置 → 插件」里装
- 片头和 UEG 界面互斥，不能同时开
- **开机音乐只存在本机**（曲库上限 3.6 MB，再高会撞浏览器存储配额），不随插件同步，换设备要重新导入
- **音乐要比片头长 2 秒以上**（完整档约 17 秒），否则会先播完、听不到淡出
- **二维码内容建议控制在 80 字节以内**，太长模块会变密、手机不好扫
- **UEG 登录界面开启时不播开机音乐** —— 那里自带配音，避免两个声音打架

---

## 授权与致谢

MIT © [Ziyang Song](https://github.com/yannicksong0106)

550C 片头动画与 HTML 原稿由 **[Voidpocket](https://github.com/Voidpocket)** 提供；插件工程、移植与 UEG 界面由 **Ziyang Song** 完成。详见 [CREDITS.md](CREDITS.md)。

## 贡献者

| 贡献者 | 分工 |
|---|---|
| **[Ziyang Song](https://github.com/yannicksong0106)** | 项目发起与维护：插件工程与移植、UEG 登录界面、设置页、身份卡二维码（本地编码与识别）、地球陆地点云重烘、核验结论状态条、发布与文档 |
| **[Voidpocket](https://github.com/Voidpocket)** | 550C 片头动画与 HTML 原稿。本项目在这份原稿上做定点移植，配色、面板布局与时间线节奏都出自其手 |
| **[Eileenes](https://github.com/Eileenes)**（提交署名 Duke） | 开机音乐：曲库导入 / 试听 / 重命名 / 删除 / 指定曲目，音量与淡出时长，以及片头结束时的淡出衔接 |
| **[沈宏宏](https://github.com/6shenhonghong9)** | 登录授权阶段的交互思路启发：分步推进、由语音时长驱动节奏、首次点击门 |

想参与的话，issue、PR、把用法写清楚，都算贡献。
