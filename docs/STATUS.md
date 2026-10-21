# DSH 550C 启动动画 —— 项目现状与开发计划

> 最后更新：2026-10-20
> 主仓库：`F:\项目\dsh-start`
> 试装副本：`F:\项目\dsh-start-web`（与主仓库逐字节同步，用来试装别人的 PR）

---

## 一、当前状态（一句话）

本地已有一次提交 `1e64873`，包含「身份卡二维码自定义」与「地球数据重烘」；
**未推 GitHub、未发 npm**。桌面端与 web 端读的都是主仓库。

```
提交          1e64873  feat: 身份卡二维码可自定义（本地编码/识别）+ 设置页布局修正
工作区        干净
远端 main     仍停在 2fc9fd3（比本地落后 1 个提交）
npm           dsh-550c-boot@0.4.1 已发布；本地改动未发布
```

---

## 二、已完成且验证过的功能

| 功能 | 位置 | 验证方式 |
|---|---|---|
| 身份卡二维码可自定义（填内容本地编码 / 选图本地识别） | `src/login.js`、`src/login-gate.js`、`preview/ueg.html` | 手机实测可扫 ✓ |
| 二维码渲染成卡片风格（深色底 + 浅色点阵、定位角实心、模块取整） | `preview/ueg.html` `drawCustomQr()` | 从画布解码回原文一致 ✓ |
| 两个纯 JS 库按需加载 | `preview/assets/qrcode-gen.js`(MIT)、`jsqr.js`(Apache-2.0) | 只在设置里用时才加载，登录动画页不加载 ✓ |
| 地球陆地点云换成 Natural Earth 数据 | `preview/assets/ueg-land.js` | 铺图对照真大陆轮廓 ✓ |
| 烘焙脚本固化、可复现 | `scripts/bake-land.mjs`（`npm run bake:land`） | 连跑两次逐字节相同 ✓ |
| 设置页二维码行移出字段网格、标题与状态分行 | `src/login.js` | 构建通过 ✓（视觉效果待确认） |

### 二维码的关键约束（踩过的坑，别再踩）

```
· Windows 上的 Chromium 没有 BarcodeDetector，只能内联纯 JS 解码器
· 数据区留 2px 间隙会解不出；现在 gap 1px + 4px 实块是"还能扫"的极限
· 三个定位角与两条时序线必须实心，打散就找不到码
· 模块尺寸与坐标必须取整，小数会抗锯齿、整片解不出
· 反色码（浅模块/深底）部分手机不认；标准极性（深模块/浅底）最稳
```

---

## 三、已丢失、待补回的两项

> 起因：一次错误的 `slice` 区间把 `preview/ueg.html` 吃掉 61 行，`git checkout` 回退时连带冲掉了这两项未提交的改动。

1. **底部 40 根竖条「随结论从左往右压平」**
   - 现状：仍是 CSS 关键帧 `l-bars` 无限脉动（`preview/ueg.html` 350-354 行）
   - 目标：改成脚本驱动，落定时把脉动幅度平滑衰减到 0.14，逐根延迟 8ms
   - 已知定位点：`const bars = document.getElementById('idBars')`（约 1376 行）
   - 注意：三个状态变量 `let barsRaf / barsStart / barsSettleAt` 必须声明在 `play()` 之前（否则踩 TDZ，整个初始化中断）

2. **「核验通过」反显状态条**
   - 现状：这一版是原来的"老印章"，没有白条
   - 目标：整卡宽反显条（`▸ 核验通过` + `ACCESS GRANTED`），从左往右擦出 + 文字逐字解码，配一条整卡读取光带
   - 注意：这个版本里**没有 `playStamp()` 函数**，要先把老印章的实现看清再替换

---

## 四、PR #8 审查状态（进行中）

```
作者    Eileenes
标题    feat: 设置页新增开机音乐（导入/试听/改名/删除/指定曲目），片头结束渐弱淡出
地址    https://github.com/yannicksong0106/dsh-550c-boot/pull/8
规模    9 文件  +2329 / -24
```

### 已做

```
① 拉下 diff（87 KB）存于 %TEMP%\pr8.diff
② 应用到试装区 F:\项目\dsh-start-web（8 个文件；package.json 手动合并一行 verify 脚本）
③ npm 构建：build: wrote lib/client.js (241920 chars) ✓
④ node --check lib/client.js ✓
⑤ PR 自带静态检查 node scripts/verify.mjs --static：
     ok bundle 可读 / ok 嗅探函数可执行 / ok 有真实 wav 可验 / ok wav→audio/wav ×3
```

### 尚未做（下一步）

```
⑥ 起 web 实例进设置页，确认「开机音乐」入口是否出现
⑦ 实测：导入 wav → 试听 → 改名 → 删除 → 指定曲目 → 片头结束是否渐弱
⑧ 判定：音频文件落在哪个目录、重启后是否还在、是否写进用户不可写路径
⑨ 结论：合并 / 要求修改（附具体意见）/ 我们自己重写
```

### 初判风险点

```
· lib/client.js 被直接改了 +1060 行 —— 必须确认与 src 同步重建，否则 CI 的 diff 门禁会挂
· src/client.js 只加 29 行、music.js 却有 1028 行 —— 要确认它被正确挂到 slots 上
· 音频落盘位置是最大风险：插件是要发 npm 的，写到包目录里在只读安装下会炸
· PR 动过 .github/workflows/ci.yml（+2 行）要看清是不是放宽了门禁
· PR 基于 main→main 提交，看不出基线 commit，可能有无关合并
```

### 重要提醒

```
web profile 加载的插件目录可能指向主仓库 dsh-start，
而不是试装区 dsh-start-web ✗
→ 若在设置页看不到「开机音乐」，先确认这一点，别误判成 PR 功能不可用
→ 临时办法：把 PR 的 8 个文件复制进主仓库跑一次，测完 git checkout 回滚
```

---

## 五、其他已知问题

```
· 语音：第 4 句（核验完成）时长 4.32s，原窗口只有 3.11s 会被第 5 句掐断
        → 已确认可用的方案：卡片停留拉到 2600ms + 第 5 句固定在终幕开始后 1400ms
        → 当前版本是 wait(1100) + 固定 1000ms（用户反馈"语音现在正常"，暂不再动）
· 设置页布局：二维码行已移出网格，但「生物特征」「预览」那几行尚未逐行核对对齐
· 二维码风格：现在是深色底浅色点阵；若要更"点阵感"需牺牲可扫性，方案见下
```

---

## 六、开发计划（按优先级）

### P0 —— 先别丢东西

```
1. 每次改完 preview/ueg.html 立刻 git commit（这个文件已经丢过两次）
2. 改大文件禁止用 indexOf/slice 取区间，必须用带唯一上下文的字符串替换
3. 每次改完跑：node --check lib/client.js + 内联脚本语法检查（取最后一个 <script> 块）
```

### P1 —— 完成 PR #8 评估

```
1. 确认 web 实例加载的是哪个目录
2. 设置页验证「开机音乐」全链路
3. 输出结论（可合并 / 需修改 / 重写），并把意见整理成可直接回复 PR 的文字
```

### P2 —— 补回丢失的两项

```
1. 底部竖条压平（定位点已确认，改动小）
2. 「核验通过」状态条（需先看清老印章实现）
```

### P3 —— 打磨

```
1. 设置页剩余行对齐
2. 二维码可选"更点阵"模式（用 170px 画布换 gap 2px 的空间）
3. 考虑把 jssqr.js 压缩（251 KB → 约 60 KB），降低插件体积
```

### P4 —— 发布（用户明确要求先不做）

```
· 推 GitHub：等用户说可以
· 发 npm：等用户说可以
· 两者都要先跑通 CI（含 git diff --exit-code -- lib/client.js 这条门禁）
```

---

## 七、常用命令

```powershell
# 构建客户端包（改完 src/*.js 必须跑）
node scripts/build.mjs
node --check lib/client.js

# 测试
npm test

# 重烘地球点云（需要 ne_110m_land.geojson，路径作为第一个参数）
npm run bake:land -- "$env:TEMP/ne_land.geojson" 9500

# 起 web 实例（--no-open 不自动开浏览器）
& "$env:LOCALAPPDATA\Programs\dsh-launcher\dsh.cmd" --profile web --port 3831 --no-open

# 同步到试装副本
robocopy F:\项目\dsh-start F:\项目\dsh-start-web /MIR /XD node_modules .git
```

---

## 八、文件地图

```
src/client.js        客户端入口、ROW_CSS、面板外壳
src/panel.js         PANEL_TABS / PANEL_SLOTS / Panel550c（设置页骨架）
src/login.js         登录界面设置行（含二维码那一行）、LOGIN_* 常量
src/login-gate.js    启动时拉起 iframe 动画、参数与 postMessage 递送
src/rows.js          外观点击区
lib/client.js        构建产物（不要手改）
scripts/build.mjs    把 src/*.js 拼成一个浏览器模块（注意：源码里不能出现 ${ 和反引号）
scripts/bake-land.mjs 地球点云烘焙
preview/ueg.html     动画本体（地球、终端、身份卡、终幕）—— 最常改、也最容易改坏的文件
preview/assets/      ueg-land.js、qrcode-gen.js、jsqr.js、徽记图、配音 wav
docs/STATUS.md       本文件
```
