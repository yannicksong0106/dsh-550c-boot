# 发布 / 收录清单

**当前状态（2026-09-28）**：仓库已公开并推上 GitHub（`yannicksong0106/dsh-550c-boot`，topic 含
`dsh-plugin`），CI 全绿；v2 投稿 Issue 已开：
[omdsh-dev/dsh-hub-workshop#169](https://github.com/omdsh-dev/dsh-hub-workshop/issues/169)
（钉 `ed86fb0e…`）。Hub 的 bot 回了"预检未通过"，但**失败点在它们仓库侧**——`prepare-issue-intake.mjs`
（单份投稿预检）通过，挂在 `npm run validate` 的 `check-public-site.mjs:138`；且该工作流最近 15 次运行
（含定时运行与 9 月其它投稿）**0 成功**，其 #172 运行标题即
`intake: profile-bundle submissions cannot pass preflight`。等上游流水线恢复后重跑即可：编辑一下
Issue 正文（或留一条评论）就会重新触发 `intake` 工作流，无需改动本仓库的清单与固定 commit。

本仓库的目标是同时满足两条分发路径：

| 路径 | 谁在用 | 需要什么 |
|---|---|---|
| **GitHub 直装** | `dsh plugin --profile <p> add github:yannicksong0106/dsh-550c-boot` | 公开仓库 + 提交好的构建产物（`lib/`），无需构建授权 |
| **awesome-dsh-plugin**（[awesome-dsh-plugin.com](https://awesome-dsh-plugin.com)） | 社区精选列表 / 站点 | PR 加一个文件 `data/plugins/<owner>__<repo>.yml`；门槛：`dsh.bundle` + `dsh-plugin` topic + **仓库满 1 天**（CI 自动查） |
| **dsh-market 社区索引**（[dsh-market.com](https://dsh-market.com)） | 创意工坊商店 | PR 往 `zhu1090093659/dsh-community-plugins` 的 `community.json` 追加一条 |
| **OMDSH Hub（hub.omdsh.dev）插件区域** | 应用内插件市场 / 索引站 | `package.json#dshWorkshop`（`omdsh-workshop-package/v1`）+ 固定 40 位 commit 的 v2 投稿 Issue |
| **npm**（可选，但市场按包名安装需要） | `dsh plugin --profile <p> add dsh-550c-boot` | `npm publish`（`publishConfig.access: public` 已就位） |

## awesome-dsh-plugin 的投稿文件

投稿文件**跟代码放在一起**（`submission/data/plugins/yannicksong0106__dsh-550c-boot.yml`），
这样它随仓库版本化，不会和实际能力脱节；提 PR 时把它复制到列表仓的同名路径即可。
entry 允许的键只有 `url` / `name` / `category` / `description` / `tarball` / `file`——
**`npm` 不许写**（列表自己从仓库解析 npm 包名），`tarball` 必须是 GitHub Release 上的 `.tgz`。

截图**放在自己仓库**：`screenshots.json`（`package.json` 旁边，1–8 张，相对路径，不能含 `..`）。
市场（如 dsh-market 详情页）按它展示；不声明也能用（市场会从 README 抽图），声明只是为了控制顺序与选图。
好处是以后换图推自己的仓库即可，不用再提 PR。官方推荐把 `@deepseek-ai/*` 声明成 `peerDependencies`
而不是 `dependencies`（避免 profile 里出现重复运行时）——本项目零运行时依赖，天然满足。


> README 里的文档链接是**仓库相对路径**（GitHub 优先，marketplace 也直接渲染 GitHub 的 README）。
> 将来真要发 npm，得把这些链接换成绝对 URL —— npmjs 不提供仓库文件，相对链接在那里会 404。

> 事实来源：`omdsh-dev/dsh-hub-workshop` 的 `INTAKE.zh.md`、`agent-submission-prompt.zh.md`、
> `package-manifest.schema.json`、`official-baseline.json`。收集于 2026-09（官方基线
> `@deepseek-ai/dsh@0.1.0-rc.6`，Registry `entries` 当时为空 —— 还没有项目拿到安装授权）。

## 0. 提交前必须成立的事实

- [x] `dsh.bundle.patch` **和** `dsh.client` 都在（市场明确拒绝"只声明 dsh.client"的包）
- [x] `lib/client.js` 是提交进仓库的构建产物，且 `npm run build` 幂等（CI 会 `git diff --exit-code` 卡住漂移）
- [x] 没有 `prepare` / `postinstall` 之类的安装期脚本（避免 pnpm 的 `allowBuilds` 授权，供应链审查也看这条）
- [x] 零运行时依赖（`react` 只是可选 peer，客户端 external）
- [x] `package.json#dshWorkshop` 与仓库真实能力一致，未验证的项写 `null` 或 `unknown`
- [x] LICENSE + CREDITS（动画原稿署名 Voidpocket）

## 1. 推到 GitHub

```sh
git remote add origin git@github.com:yannicksong0106/dsh-550c-boot.git
git push -u origin main
```

然后给仓库加上 topic（索引站按 topic 抓，`dsh-plugin` 是硬要求）：

```sh
gh repo edit yannicksong0106/dsh-550c-boot \
  --add-topic dsh-plugin,deepseek-harness,dsh,dsh-extension,boot-splash \
  --description "550C 开机动画 for DeepSeek Harness — 首帧由宿主半边注入，DSH 的 Loading 卡片不会露脸；桌面窗口的原生按钮收编成终端配色"
```

- `dsh-plugin` topic 会进 `usertianziyang/DSH-Plugin-Hub` 这类**自动索引站**（约 6 小时同步一次），
  但这只是"被发现"，不是安装授权。
- OMDSH 官方口径：**topic 命中 ≠ Catalog 收录 ≠ Registry 安装权限**。

## 2. 投稿到 OMDSH Hub（真正的"插件区域"）

流程（`agent-submission-prompt.zh.md` 的标准做法，作者也可以走
[Author Studio](https://hub.omdsh.dev/publish.html) 手填）：

1. 把这一轮的工作**先 commit + push**（投稿必须钉在公开远端已有的完整 40 位 commit 上）。
2. 生成 `omdsh-workshop-submission/v2` 清单 —— 用仓库自带的生成器，事实全部读自工作树，
   不靠手抄（工作树脏了它会拒绝运行：未提交的改动不该进入投稿事实）：

   ```sh
   node scripts/make-submission.mjs --out "$TEMP/submission.json"   # 也可直接打到 stdout
   ```

   它填的关键字段：`packageManifest` 逐字取自 `package.json#dshWorkshop`；`release.ref` = `git rev-parse HEAD`
   （完整 40 位）；`management.method` = `profile-bundle`，`protocol` = `harness-profile`；
   `release.profileBundle.spec` = `github:<owner>/<repo>#<commit>`（走 npm 发版就把它换成裸版本号）；
   `declarations.installScriptsMustRemainDisabled` = `true`。
3. 本地校验（只读，不执行投稿仓库代码）：

   ```sh
   # 官方校验器（权威）
   git clone --depth 1 https://github.com/omdsh-dev/dsh-hub-workshop /tmp/dsh-hub-workshop
   node /tmp/dsh-hub-workshop/scripts/intake.mjs validate /tmp/submission.json

   # 脚手架里的 schema 校验（快，离线可重复；用的是 Hub 的 submission.schema.json）
   node .verify/validate-json.mjs package-manifest.schema.json ../package.json#dshWorkshop
   node .verify/validate-json.mjs submission.schema.json "$TEMP/submission.json"
   ```

4. 校验通过后，在 `omdsh-dev/dsh-hub-workshop` 开一个 Issue：
   标题 `[Submission] dsh-550c-boot@0.1.0`，正文按模板粘贴完整清单 + 三条确认。
   自动化会只读核验仓库/commit/声明路径，然后由 bot 开出 `pending-review` PR —— **不会**执行仓库脚本、
   也**不会**批准项目。

### 会被问到的地方

| 项目 | 我们的事实 | 备注 |
|---|---|---|
| 接入类型 | `method: profile-bundle` + `protocol: harness-profile` | 850/896 个目录项都走这条，公开契约可用 |
| install adapter | **必须是 `profile-bundle`** | 官方校验器 `scripts/workshop-manifest-lib.mjs` 有一条 schema 看不出的跨字段规则：`BUILTIN_PROTOCOL_ADAPTERS['harness-profile'] = ['profile-bundle']`。写成 `harness-profile` 会被判 `install adapter does not match the integration protocol` —— 这条就是离线 schema 校验抓不到的坑 |
| 基线 | 我们只在 `@deepseek-ai/dsh@0.2.0-rc.1` 上实测过；Hub 公布的基线是 `0.1.0-rc.6` | 清单里只声明实测版本，**不猜**；若审核要求基线复验，就在临时 profile 里装 RC.6 重跑 `scripts/verify.mjs` |
| 能力断言 | `capability.id = boot-splash`（`kind: ui`） | 断言里写的是可执行的观察方式（挂载点 + 首帧类名），不是"加载成功" |
| 证据路径 | 四项都是 `null`（未声明） | 宁缺毋滥：声明了就要有对应证据文件；等 RC.6 生命周期跑完再补 |
| 权限 | `web:index-inject` / `dom:overlay` / `browser:local-storage` / `desktop:titlebar-overlay` | 逐条对应真实行为：注入 index 行、挂遮罩、存偏好、改标题栏 token |
| 失败隔离 / 热重载 | `dispose: supported`，`activation: restart-profile` | bundle 层是启动时装配的，装完必须重启 DSH（README 已写） |

## 3. npm（已发布）

`dsh-550c-boot@0.2.0` 于 2026-09-30 发布到 npm（`https://www.npmjs.com/package/dsh-550c-boot`），
发布后 `dsh plugin --profile web add dsh-550c-boot` 就能按包名安装；市场里的"按名安装"走的是这条路，
dsh-market 社区索引那一条也因此补上了 `npm` 字段。

```sh
node .verify/publish-npm.mjs            # 一键发布（脚本在 .verify/，见下）
node .verify/publish-npm.mjs --check    # 只验身份 + dry run
node .verify/publish-npm.mjs 123456     # 账号要 OTP 时带上 6 位码
```

`publish-npm.mjs` 的约定：凭据优先取环境变量 `NPM_TOKEN`，其次本机的一个凭据文件，
再退到本机已有的 `npm login` 会话；令牌只写进 `%TEMP%` 下的**临时** npmrc、`finally` 里删除、
**绝不打印**，不进仓库也不进全局 npm 配置。发布后自动 `npm view` 核对版本与 tarball 完整性。

两个踩过的坑：Node 24 不允许无 shell 直接 spawn `npm.cmd`（EINVAL，会被误判成"未登录"），
所以脚本直调 `npm-cli.js`；账号开了 2FA 时 `npm publish` 会 403 要求 OTP，
此时要么给 `--otp`，要么用勾了 **Bypass 2FA** 的 Granular Token（npm 正在收紧这类令牌）。

**第三个坑（会吃掉版本号）**：npm 11 的**暂存发布**。一次 PUT 被网络重置后，服务端把那个版本记成
"staged"：`GET /<pkg>/<version>` 仍是 404，但再发同一个版本会 `E409 Cannot publish over previously
staged version`，而 `npm stage list` 又查不到它。0.3.0 就这么卡了一轮 —— 之后一次新版本的发布把它
一并提交上线了。遇到 `E409 ... staged` 时：别反复重试同一个版本号，直接**换版本号**（那次把仓库
版本改回已上线的 0.3.0 而不是硬推 0.3.1），并去 npm 网页的 Staged versions 面板确认/清理。

## 4. 版本与升级

- 改动画原稿 → `npm run build` → 提交 `lib/client.js`（CI 会验证同步）
- 发新版：`npm version patch|minor` → push tag → `npm publish`（或 `node .verify/publish-npm.mjs`）
  → 若是已收录项目，再开一条 `add-release` 投稿（`operation: add-release`，同样钉完整 commit）
- 官方基线一变，旧的 `current-baseline-passed` 自动过期，需要重新复验 —— 这是 Hub 的规则，不是我们的选择。
