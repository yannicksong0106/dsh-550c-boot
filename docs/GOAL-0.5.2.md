# 目标：0.5.2 发布就绪（目标模式）

> 立约：2026-10-24
> 交付判定：下面每一条都能用命令复现，缺一条就不算完成。
> 约束：**不改行为、不删功能**。唯一允许的行为变化是"修 bug"，每条 bug 都必须有断言看着。

---

## 1. 目标

把 0.5.2 做成"结构版"：用户装上去看到的功能与 0.5.1 一致（外加三个 bug 修复），
但代码从"三天 22 个提交堆出来的形状"整理成"下一版能安全动刀的形状"，
并把 boot ↔ skin 的口头约定变成可执行检查。

## 2. 完成定义（DoD）

| # | 条目 | 证据（可复现） | 状态 |
|---|---|---|---|
| 1 | 全局状态收口：`window.__dsh550c*` 直接访问 0 处 | `git grep -c 'window\.__dsh550c' src/` → 0；test-host「retired global is gone」 | ✅ |
| 2 | ≥150 行函数从 9 个降到 ≤4 个 | 函数分布脚本；剩余 4 个均有书面理由 | ✅ |
| 3 | 五个巨型函数：MusicRow / LoginRow / apply / VersionRow / mountOverlay 全部降到 ≤80 行 | test-host「component budgets」逐条断言 | ✅ |
| 4 | 三个死键/泄漏 bug 修复 | test-host：死键 0 命中、页归属无条件、无遗留 timer | ✅ |
| 5 | 「两边都装时 550C 页消失」回归修复 | harness「settings rows · skin installed」+ 契约检查 | ✅ |
| 6 | 功能不丢：42 项能力清单 | test-host「feature manifest」 | ✅ |
| 7 | 渲染文本零变化 | harness「settings rows · rendered text」（期望值写于重构前） | ✅ |
| 8 | 跨仓库契约 11 条 | `node scripts/check-skin-contract.mjs` | ✅ |
| 9 | 构建幂等（源码 → bundle 可复现） | build ×2 + `git status` 干净；extract 也幂等 | ✅ |
| 10 | 发布包内容正确 | `npm pack --dry-run` → 25 个文件 | ✅ |
| 11 | 文档同步 | CHANGELOG / STATUS / ARCHITECTURE / MAINTENANCE / REFACTOR / 本文件 | ✅ |

## 3. 最终门禁（2026-10-24 实测）

```
node scripts/build.mjs                 256,577 chars，两次 sha256 一致
node --check lib/client.js lib/index.js 均 0
node scripts/test-host.mjs             100 条断言，0 失败
node scripts/check-skin-contract.mjs   11 条，全过
node scripts/harness/run.mjs           76 条断言 / 17 用例，全过
皮肤仓库 node --test test/*.test.mjs   24 条，全过
```

## 4. 不在本目标内（明确不做，不是漏）

| 项 | 理由 |
|---|---|
| 删 `mountTerminalGate`（341 行） | 它当前 UI 不可达（档位只剩 off/ueg），但删除属于产品决定；代码里已标注，断言已钉住"只开放两档" |
| 拆 `createShow`（573 行） | 550C 原稿逐字移植，拆了无法合上游更新 |
| 改 `preview/ueg.html` | 本轮只动 `src/`；该文件历史上丢过两次功能，动它要单独一轮 |
| IndexedDB 曲库 | 用户已决定暂不做 |
| 发布 / 推送 | 需要你的 npm token 与 GitHub 网络；命令见下 |

## 5. 发布步骤（你执行）

```powershell
# 1) 确认门禁
npm test
node scripts/harness/run.mjs

# 2) 打标签（本地已打 v0.5.2，如重来）
git tag -a v0.5.2 -m "0.5.2 —— 代码结构大优化"

# 3) 推送（hosts 若仍指向 127.0.0.1，先修 hosts 或开代理）
git push origin master:main --tags

# 4) 发布
npm publish

# 5) 皮肤（注释改动，可选同发）
cd F:\项目\dsh-550c-skin && npm publish --tag beta
```

## 6. 回滚

代码：`git revert` 对应提交即可，`lib/client.js` 是生成物，重跑 `node scripts/build.mjs` 复原。
发布：npm 用 `npm dist-tag add dsh-550c-boot@0.5.1 latest` 指回上一版（0.5.2 的 tarball 仍在）。
用户侧：装回 `dsh-550c-boot@0.5.1` 并重启客户端。

## 7. 一句话验收

> 装上 0.5.2，用户看到的东西与 0.5.1 一样；打开代码，最短的那个函数是入口，最长的那个有理由。
