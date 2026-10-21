# DSH 550C 启动动画 —— 项目现状

> 最后更新：2026-10-21
> 主仓库：`F:\项目\dsh-start`
> 试装副本：`F:\项目\dsh-start-web`

---

## 一、当前状态

```
版本        0.5.0
本地 HEAD   62f9fa5  docs(readme): 补 0.5.0 的新功能，去掉多余说明
远端 main   62f9fa5（一致）
tag         v0.5.0 → 97a3f8a
npm         dsh-550c-boot@0.5.0（latest）
工作区      干净
```

GitHub Release：<https://github.com/yannicksong0106/dsh-550c-boot/releases/tag/v0.5.0>

---

## 二、0.5.0 包含什么

| 类型 | 内容 | 位置 |
|---|---|---|
| 新增 | 身份卡二维码自定义：填文字/链接本地编码，或选图本地识别后按卡片风格重绘 | `src/login.js`、`preview/ueg.html`、`preview/assets/qrcode-gen.js`、`jsqr.js` |
| 新增 | 开机音乐（PR #8）：曲库导入/试听/重命名/删除/指定，音量与淡出，片头结束渐弱 | `src/music.js`、`src/client.js` |
| 修复 | 地球自转方向与大陆形状：改用 Natural Earth 110m 数据重烘 | `preview/assets/ueg-land.js`、`scripts/bake-land.mjs` |
| 修复 | 核验结论状态条（反显白条 + 逐字解码 + 读取光带）、底部竖条随结论收平 | `preview/ueg.html` |
| 修复 | 设置页二维码行布局：移出字段网格、占满整行 | `src/login.js` |

### 关键技术约束（别再踩）

```
· Windows Chromium 没有 BarcodeDetector → 只能内联纯 JS 解码器（jsQR）
· 二维码数据区 gap 2px 解不出；现在 gap 1px + 4px 实块是"还能扫"的极限
· 三个定位角与两条时序线必须实心；模块尺寸与坐标必须取整（小数会抗锯齿）
· 反色码（浅模块/深底）部分手机不认 → 现在用的就是浅模块深底，已验证可扫
· 底部竖条的状态变量必须声明在 play() 之前，否则 TDZ 会打断整个初始化
· src/*.js 里不能出现 ${ 和反引号（build 用模板字面量拼接）
```

---

## 三、贡献者分工

| 贡献者 | 分工 |
|---|---|
| [Ziyang Song](https://github.com/yannicksong0106) | 项目发起与维护：插件工程与移植、UEG 登录界面、设置页、身份卡二维码、地球数据重烘、结论状态条、发布与文档 |
| [Voidpocket](https://github.com/Voidpocket) | 550C 片头动画与 HTML 原稿 |
| [Eileenes](https://github.com/Eileenes)（提交署名 Duke） | 开机音乐：曲库、音量与淡出、片头衔接 |
| [沈宏宏](https://github.com/6shenhonghong9) | 登录授权阶段的交互思路启发 |

---

## 四、遗留事项（都不阻塞）

```
· npm 包内的 README 仍是旧版（0.5.0 打包时用的旧文件）；下次发版会更新
· dsh-start-web 试装区仍保留 PR#8 的 src/music.js 等文件，不影响主仓库
· 设置页「生物特征 / 预览」那一行的对齐未逐行核对
· PR #8 自带的 scripts/verify.mjs 那 192 行测试未并入主仓库（需要 --url 才能跑）
```

---

## 五、常用命令

```powershell
# 构建 + 语法（改完 src/*.js 必须跑）
node scripts/build.mjs
node --check lib/client.js

# 全门禁
npm test
npm run test:harness

# 重烘地球点云
npm run bake:land -- "$env:TEMP/ne_land.geojson" 9500

# 起 web 实例
& "$env:LOCALAPPDATA\Programs\dsh-launcher\dsh.cmd" --profile web --port 3845 --no-open

# 同步到试装副本（不删多余文件）
Copy-Item F:\项目\dsh-start\src,F:\项目\dsh-start\lib,F:\项目\dsh-start\preview,F:\项目\dsh-start\scripts F:\项目\dsh-start-web -Recurse -Force
```

远端说明：`origin` 走 `ghproxy.net` 代理，**推送会 403**，必须直连：

```powershell
git push "https://<token>@github.com/yannicksong0106/dsh-550c-boot.git" master:main
```

---

## 六、文件地图

```
src/client.js        客户端入口、ROW_CSS、面板外壳
src/panel.js         PANEL_TABS / PANEL_SLOTS / Panel550c
src/login.js         登录界面设置行（含二维码那一行）
src/login-gate.js    拉起 iframe 动画、参数与 postMessage 递送（photo / qr）
src/music.js         开机音乐：曲库、音量、淡出（PR #8）
src/rows.js          外观点击区
lib/client.js        构建产物（不要手改）
scripts/build.mjs    把 src/*.js 拼成一个浏览器模块
scripts/bake-land.mjs 地球点云烘焙
preview/ueg.html     动画本体 —— 最常改、也最容易改坏的文件
preview/assets/      ueg-land.js、qrcode-gen.js、jsqr.js、徽记图、配音 wav
docs/STATUS.md       本文件
```

### 改 `preview/ueg.html` 的铁律

```
1. 禁止用 indexOf/slice 取区间（曾经吃掉 61 行）
   必须用带唯一上下文的字符串替换
2. 改完立刻：取最后一个内联 <script> 块做语法检查
3. 改完立刻提交，别攒着（这个文件丢过两次）
```
