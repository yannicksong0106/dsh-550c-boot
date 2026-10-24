# 构建与验证

[← 回到 README](../README.md)

## 三条命令

```sh
npm run build          # extract + build（只重写 lib/client.js）
npm test               # 宿主半边：路由处理器、版本比较、apply() 的接线（纯 node，无需浏览器）
npm run test:harness   # 浏览器里跑真实插件：15 个用例 / 54 条断言（自动起静态服务器）
```

`npm run verify` 把三件事串起来（build → check → test → harness）。构建是**幂等**的：
`npm run build` 之后再 `git diff --exit-code -- lib/client.js` 必须是空的，CI 就在盯这件事。

## 浏览器套件（`scripts/harness/`）

把**真实的 index.html**（从 app.asar 取出的 web-frontend dist）用 DSH 自己的行渲染器
（`scripts/harness/render-rows.mjs`）套上**插件自己产出的行**，再用无头浏览器跑。

拿不到真实页面时（新克隆、没装 DSH）会自动退回仓里的 `scripts/harness/fallback.html`：
断言会弱一些，但套件仍然可跑 —— 这是把它提交进仓的意义。也可以用 `DSH_550C_PAGE=<path>` 指定页面、
`DSH_550C_BROWSER=<path>` 指定浏览器；找不到任何浏览器时套件会**跳过并退出 0**，宿主测试才是硬门。

| 用例 | 断言 |
|---|---|
| `simple · plugin rows` | 首帧早于任何插件代码、退役与挂载同一任务、`data-caption=windows` |
| `simple · rows withheld` / `off · plugin rows` | 对照组：没有行 / 关闭档时首帧与遮罩都不出现 |
| `full · plugin rows` | 完整档 HUD 在、浏览器里预留塌成 0 |
| `darwin · window drag guard` | 有守卫 `none`、抽掉守卫 `no-drag`（对照）、插回 `none`、官方 `[data-window-drag]` 行仍 `drag` |
| `darwin · HUD reserve` | 让位 `76px`；HUD **没有**被标 `data-window-drag`（shadow 里标了也没用） |
| `… fullscreen before/after mount` | 全屏时让位塌成 `0px`，宿主元素同步到 `data-fullscreen`（挂载前后两条路径） |
| `family bundle · marker collision` | 家族包的 `[data-dsh-boot-splash]` 规则与 shield 都碰不到我们：z-index 仍是 2147483000、`pointer-events:auto`、背景是本片头底色、拖拽带 `drag`、点击跳过仍有效 |
| `caption · transparent strip` | 桌面 preload 探针：底色 `rgba(0,0,0,0)`、符号 `rgb(232,160,32)`，而 app 自己的 token 原样不动 |
| `failure card · cover retires itself` | shell 的失败卡片不会被首帧盖住 |
| 4 张截图 | 有行时纯黑首帧、抽掉行时 HARNESS 卡片可见、简易/完整档播放中 |

## 真机探针（一条命令看"能不能用"）

```powershell
# 1) 起 web 实例，从输出里取 token
node "C:\Users\Song\AppData\Local\npm-cache\_npx\<hash>\node_modules\@deepseek-ai\dsh\lib\bin.js" `
     --profile web --port 3850 --no-open

# 2) 探针：片头有没有播完、三个页签有没有行、控制台有没有插件报错
node scripts/dev/probe-live.mjs <token> 3850
```

与 harness 的分工：harness 验 bundle 在受控页面里的行为；`probe-live` 验**真实 DSH + 真实 profile**
（含皮肤同时安装的场景）下插件是否可用。0.5.2 的真机结果：1.2s 遮罩在、首帧已撤；
7.2s 遮罩拆净；开机动画页 5 行 / 3 段；UEG 页 2 行 / 4 段 / 11 个输入；控制台无 `[dsh-550c-boot]` 报错。

## 真实 GUI

`scripts/verify.mjs` 用 DevTools 协议驱动真实浏览器，可以在**精确时刻**、**指定模式**下截图并读取
遮罩层的内部状态。普通 `--screenshot` 做不到：模式存在 localStorage 里，而且新 profile 的引导弹窗
挡在整个 shell 前面，不点掉它插件的槽位根本不存在。

```sh
node scripts/verify.mjs --url 'http://127.0.0.1:3080/?token=…' --mode simple --at 2600
node scripts/verify.mjs --url '…' --mode full  --at 7000
node scripts/verify.mjs --url '…' --mode off   --at 1000 --settings   # 设置行巡检
node scripts/verify.mjs --url '…' --mode full  --at 3000 --skip       # 跳过验证
```

已实测通过的项（web profile，`link:` 安装）：

| 项 | 证据 |
|---|---|
| 简易模式播放 | 2.6s 截图：logo 正在逐路径书写，红 0 已发光，`550C SYSTEM BOOT` 打字机 |
| 简易模式收尾 | 7s 时 `host: false`，屏幕顶层元素变回 DSH 输入框 |
| 完整模式播放 | 7s 时 `appInShadow: true`、63 行日志、47 节点全部 `done` |
| 完整模式收尾 | 15s 时 `host: false`，遮罩已卸载 |
| 关闭档 | `--mode off` 时 `host: false`，遮罩从不挂载 |
| 通用设置行 | 行标题、三档 `["关闭","简易","完整"]`、当前档高亮、`预览` 按钮在 |
| Esc 跳过 | 3s 时 `hostBefore: true` → Esc 后 `hostAfterEsc: false` |

截图存在 `.verify/shots/`；README 顶部那三张对外预览在 [`docs/`](.)。
`.verify/` 整个目录已 gitignore —— 里面有从 app.asar 取出的 DSH 包文件，不该进仓库。

> web profile 首次启动会串联几个引导弹窗（内测声明 → API Key），它们盖在整个 shell 之上，
> 所以全新 profile 下动画会被弹窗挡住。桌面 profile 的引导已经走完，不存在这个问题。
