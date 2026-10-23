# 0.5.2 代码结构重构 —— 执行计划（目标模式）

> 建立于：2026-10-23
> 目标版本：**0.5.2（未发布）** —— 这一版以「代码结构大优化」为看点，不是发个补丁号
> 依据：docs/MAINTENANCE.md（P0/P1/P2）+ 本轮实测补出的 6 条债务
> 执行方式：目标模式。计划即合同；每条改动都必须过第 1 节的门禁，禁止"看着差不多就提交"。

---

## 0. 目标与非目标

**目标**

1. 把散在 window 上的 10 个临时全局收进一个状态对象，消灭"死键 / 名字对不上"这类故障的土壤。
2. 把 5 个巨型函数拆到可读、可单测的粒度（createShow 除外，见非目标）。
3. 让"皮肤在不在"只有一个判定入口，且默认页签、推荐行、页面归属三处共用它。
4. 每个 bug 修复都带一条断言 —— 这一轮修的三条以前都没被任何断言看着。
5. 结构变了，**行为不变**：除了明确列出的 3 条 bug，其余一律按原样搬迁。

**非目标（本轮明确不做）**

- 不拆 src/show.js 的 createShow（573 行）：它是 550C 原稿的逐字移植，拆了以后没法合上游更新。
  只在文件头补"相对上游做了哪些定点改写"的清单。
- 不改 preview/ueg.html（1748 行单文件）：本轮只动 src/。
- 不引入构建依赖、不引 bundler、不加运行时依赖（仓库卖点之一是零依赖）。
- 不动 lib/index.js 的宿主逻辑（这一轮它没有问题，改它只会扩大回归面）。
- 不做 IndexedDB 迁移（用户已决定暂不做）。

---

## 1. 门禁与验证矩阵（每批都必须全过）

| # | 门禁 | 命令 | 通过标准 |
|---|---|---|---|
| G1 | 构建 | node scripts/build.mjs | 退出 0，打印 bundle 长度 |
| G2 | 语法 | node --check lib/client.js && node --check lib/index.js | 退出 0 |
| G3 | 构建幂等 | git diff --exit-code -- lib/client.js（build 之后） | 空 diff |
| G4 | 宿主测试 | node scripts/test-host.mjs | 退出 0，0 FAILURES |
| G5 | 静态否决 | test-host.mjs 里的结构断言（S2 落地） | 死键 0 命中 |
| G6 | 浏览器套件 | node scripts/harness/run.mjs | 退出 0（无浏览器时允许跳过） |
| G7 | 行为等价 | 每批单列人工清单 | 与改前一致 |

> **反复验证**的含义：G1–G4 每完成一个 Stage 跑一次；G5 在 S2 落地后每批跑；
> 全部 Stage 结束后，从干净构建再跑一次完整 verify，并复核"三次幂等"（build 两次、diff 空）。

---

## 2. 分批执行

### S1 · 状态收敛（P0）

| 文件 | 改动 |
|---|---|
| src/state.js | **新增**。dsh550cGet/Set、dsh550cState、dsh550cSkinInstalled；键名集中登记 |
| scripts/build.mjs | PARTS 最前面插入 src/state.js |
| src/client.js | 8 处 window.__dsh550c* → state；record.startedAt；finish(reason) |
| src/panel.js | 默认页签改 dsh550cSkinInstalled()；修缩进 |

> 备注（执行中核实）：上面"不许反引号"这条原计划写错了，见第 4 节第 1 条更正。

**验收**：G1–G4；Git grep 查 window.__dsh550c(Applied|BootPage|RowsOnSeries|SplashPlayed|PageOwner) 在 src/ 下 0 命中。

### S2 · 三条真 bug + 断言（P0）

| bug | 位置 | 修法 |
|---|---|---|
| ① 默认页签判死键 | panel.js:39 | 走 dsh550cSkinInstalled() |
| ② 页面归属判死键 | client.js:664 | 同上；删掉无人写入的 __dsh550cPageOwner |
| ③ 归属定时器泄漏 | client.js:683 | 归属落定即停 + ctx.effect 卸载时清 |

**断言（写进 scripts/test-host.mjs，静态检查构建产物）**

1. lib/client.js 不含 __dsh550cPageOwner（死键不许回来）
2. lib/client.js 含 __dsh550cState（状态根存在）
3. lib/client.js 不含 __dsh550cApplied / __dsh550cBootPage / __dsh550cSplashPlayed（已迁移）
4. 区域顺序：src/state.js 出现在 src/panel.js 与 src/client.js 之前
5. panel.js 区域里默认页签调用 dsh550cSkinInstalled（按区域切片断言，不靠全文 contains）
6. claimRetry 存在且带清理（区域切片里同时出现 clearInterval 与 ctx.effect）

### S3 · music.js：常量去重 + MusicRow 拆分（P1）

| 改动 | 说明 |
|---|---|
| 常量 | BGM_SINGLE_MAX_BYTES 与 BGM_TOTAL_MAX_BYTES 值相同却各写一遍、注释还自相矛盾（写 3MB，实际 3.6MB）→ 合成 BGM_CAP_BYTES，两个旧名保留为别名 |
| 注释 | 把"3MB"的推导按 3.6MB 重写，只留一处 |
| 组件 | MusicRow（295 行）→ 外壳 + MusicToggle + MusicTransport + MusicLibrary + MusicTrackItem + MusicEmptyHint；状态留在外壳，props 下发 |

**行为等价清单**：导入 → 首次导入自动开启 → 试听/停止 → 重命名（Enter 或失焦提交；原实现**没有** Esc 取消，本轮也不加）→ 删除（二次确认）→ 设为开机 → 空库提示 → 容量显示。

### S4 · login.js：LoginRow 拆分 + 二维码抽离（P1）

| 改动 | 说明 |
|---|---|
| 组件 | LoginRow（340 行）→ 外壳 + ScreenModeRow + AutoplayRow + VoiceRow + CardFields + QrRow |
| 抽离 | decodeQrImage(file) 从组件里拿出来：输入 File，返回 { ok, text } 或 { ok:false, reason }，不直接 setState → 可单测 |
| 去重 | 卡片字段 7 个 input 各手写一遍，而 LOGIN_CARD_KEYS 早列好 7 项却没人用 → 由它驱动渲染 |

**行为等价清单**：关闭/UEG 切换 → 自动/手动 → 关闭/女声（提示开发中）/男声 → 7 个卡片字段写入 → 头像选择与预览 → 二维码生成/清除/识别 → 预览按钮。

### S5 · login-gate.js：拆两条互不相干的实现（P1，风险最高放最后）

| 改动 | 说明 |
|---|---|
| 新增 src/login-ueg.js | mountUegCinema(force)：把 UEG iframe 那一整段（约 95 行）原样搬出去 |
| src/login-gate.js | mountLoginGate(force) 退化成调度器（归一化 → 收旧 → 分派）；终端档主体改名 mountTerminalGate(screen) |
| 不动 | 五步时间轴、语音时序、Esc/Enter、cleanup —— 一行逻辑都不改，只搬位置 |

**为什么不做全面状态机化**：那要重写 450 行推进逻辑，属于改行为，与本轮约束冲突；
UEG 与终端是两套独立实现，拆开是纯搬家，风险最低、收益最大。

### S6 · P2：常量、共享样式、注释对齐

| 项 | 做法 |
|---|---|
| 片头时长 | readSplashMs / rememberSplashMs（S1 已落地），注释与兜底表对齐 |
| 分段控件配色 | 抽出 SEG_ACTIVE_CSS 常量（黑底白字），两侧仓库逐字复制 + 注释互指 |
| 硬编码清单 | FADE_MS / TAIL_MS / QR targets 各自加来源注释；TAIL_MS 提到模块级 |
| 过时注释 | client.js 重复的两段 JSDoc 合并；panel.js 缩进修平 |

### S7 · 文档

CHANGELOG 的 [0.5.2] 增加「代码结构」章节；docs/STATUS.md 更新；
docs/MAINTENANCE.md 勾掉已完成项并指向本文件；docs/ARCHITECTURE.md 更新目录结构。

### S8 · 收尾

verify 全绿 → 从干净构建重跑 → git status 只含预期文件 → 提交（一个结构提交 + 一个文档提交）。

---

## 3. 回滚

每个 Stage 一个 commit，独立可 revert。S5 是唯一动到运行路径的一批，回滚只需 revert 该提交；
lib/client.js 是生成物，revert 源码后重跑 build 即可复原。

---

## 4. 禁区（违反即返工）

1. src/*.js 的注释里允许反引号（实测：build.mjs 把拼好的 body 作为变量插值，不会撕开外层模板串；
   login.js 早就带着 4 个注释反引号，构建一直正常）。真正的雷是 `</script` 与 `<!--` —— build.mjs 已强制拦截。
2. preview/ueg.html 不许用 indexOf/slice 取区间。
3. 不许用 git checkout -- / 重置工作区来"解决"冲突。
4. 不许改 lib/client.js（生成物）。
5. 不许为了过门禁而放宽断言。

---

## 5. 完成定义（DoD）

- G1..G7 全过（含三次幂等复核）
- 死键静态断言 0 命中
- MusicRow / LoginRow / mountLoginGate 均小于 150 行
- CHANGELOG 有「代码结构」章节，STATUS/MAINTENANCE/ARCHITECTURE 同步
- git status 干净，提交信息写明批次

---

## 6. 计划自检（写计划时逐条核对过）

| 计划里的断言 | 怎么核对的 |
|---|---|
| __dsh550cPageOwner 无人写入 | git grep → 只有 client.js:528/664 与 panel.js:39 三处读，0 处写 |
| MusicRow 295 / LoginRow 340 / mountLoginGate 450 行 | 按函数起止行实测 |
| 两个 BGM 常量值相同 | 都是 3686 * 1024 |
| LOGIN_CARD_KEYS 无人使用 | git grep → 只有定义与 login-gate.js:51 的循环 |
| build.mjs 的 PARTS 顺序可控 | 单一数组、无 glob |
| 构建幂等 | 改前实跑：build 后 git status 为空 |

---

## 7. 执行记录（2026-10-23）

| 批次 | 提交 | 结果 |
|---|---|---|
| S1+S2 | refactor(state) | `src/state.js` 落地；死键 0 命中；三条 bug 修完并断言 |
| S3 | refactor(music) | `MusicRow` 295 → 50 行；容量常量合并 |
| S4 | refactor(login) | `LoginRow` 340 → 53 行；`decodeQrImage` 可单测 |
| S5 | refactor(login-gate) | `mountLoginGate` 450 → 25 行；UEG 独立成文件 |
| S6 | 随批次 | `BGM_TAIL_MS` / `QR_DECODE_TARGETS` / `SEG_ACTIVE_RULE` 具名化 |
| S7 | 文档 | CHANGELOG / STATUS / ARCHITECTURE / MAINTENANCE 同步 |

**门禁结果（真实 node，非 Electron）**

```
build ×3       同一份 sha256（幂等）
node --check   client / index 均 0
test-host      81 条断言，0 失败
harness        71 条断言 / 16 用例全过（Edge headless）
```

**执行中发现并修正的三处计划错误（都已回写上文）**

1. **"src 不许有反引号"这条是错的**：build.mjs 把拼好的 body 当变量插值，注释里的反引号不会撕开模板串
   （login.js 一直带着 4 个，构建从没出过问题）。真正的雷是 `</script` 与 `<!--`，build 已拦。
2. **"重命名支持 Esc 取消"是错的**：原实现只有 Enter 与失焦提交，本轮不加行为。
3. **环境坑**：本机的 `process.execPath` 指向 Electron，用它跑 `node scripts/*.mjs` 会静默退出 0 ——
   早期"门禁全绿"是假绿。所有门禁必须用 `C:\Program Files\nodejs\node.exe` 跑。

**唯一一条由套件抓出的回归**

拆分 `LoginRow` 之后，`scripts/harness/rows.js` 的 shim 读不到子组件里的按钮（它不做 React 调和）。
修的是 shim（新增 `expand()` 展开函数组件），断言一条没放宽 —— 修完 71 条断言仍全过，
说明拆出来的树与改前渲染结果逐字一致。
