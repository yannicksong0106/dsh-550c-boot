# DSH 550C 启动动画 —— 项目现状

> 最后更新：2026-10-23
> 主仓库：`F:\项目\dsh-start`
> 试装副本：`F:\项目\dsh-start-web`

---

## 一、当前状态

```
版本        0.5.2（发布就绪；本轮以「代码结构」为看点）
远端 main   62f9fa5（落后本地，推送被 hosts 挡住）
npm         dsh-550c-boot@0.5.0
tag         v0.5.0 → 97a3f8a
```

### 0.5.2 代码结构重构（2026-10-23）

计划与验收标准见 [REFACTOR-0.5.2.md](REFACTOR-0.5.2.md)，逐批结果：

| 批次 | 内容 | 结果 |
|---|---|---|
| S1+S2 | 新增 `src/state.js`，10 个 window 旗子收口；修三条真 bug | 完成 |
| S3 | 曲库容量单一来源；`MusicRow` 295 → 50 行 | 完成 |
| S4 | `LoginRow` 340 → 53 行；`decodeQrImage()` 可单测 | 完成 |
| S5 | `mountLoginGate` 450 → 25 行；UEG 独立成 `src/login-ueg.js` | 完成 |
| S6 | 常量具名化（`BGM_CAP_BYTES` / `BGM_TAIL_MS` / `QR_DECODE_TARGETS` / `SEG_ACTIVE_RULE`） | 完成 |
| S9 | 收尾：`apply` 192 → 15 行、`VersionRow` 170 → 73 行、42 项功能清单断言、行尾归一 | 完成 |
| S10 | `mountOverlay` 167 → 26 行（拆三块）；音乐去抖去重 + 3 条浏览器断言 | 完成 |
| S11 | 页面归属修正（boot 唯一声明）+ 跨仓库契约检查 11 条 + 皮肤侧注释互指 | 完成 |

**发布前检查（2026-10-24 实测）**

```
node scripts/extract.mjs && node scripts/build.mjs   → git status 干净（两端幂等）
npm test                                             → 98 宿主断言 + 11 条皮肤契约，0 失败
node scripts/harness/run.mjs                         → 76 断言 / 17 用例全过
npm pack --dry-run                                   → 25 个文件，无多余产物
皮肤仓库  npm run build && node --test test/*.test.mjs → 24 条全过
```
| S7 | 文档同步 | 完成 |

结构断言的守卫在 `scripts/test-host.mjs` 的「bundle structure / component budgets」两段：
死键回来、外壳重新长胖、拆分被合回去，都会直接红。

待推送的提交（hosts 把 github.com / api.github.com 指到 127.0.0.1，见下节）：
二维码多尺度识别、多轮文档、开机音乐淡出系列修复、曲库上限调整、0.5.1 发布准备。

### 推送受阻

```
C:\Windows\System32\drivers\etc\hosts 里有 28 条把 GitHub 指到 127.0.0.1
→ git push 报 SSL/TLS timeout 或 Connection refused
→ api.github.com 也不通（之前能用 API 合并 PR、建 Release）
解决：删掉这些行，或重新打开写它们的代理工具（需管理员）
```

---

## 二、0.5.1 修了什么（开机音乐淡出）

这一轮绕了 7 轮才修好，三个 bug 叠在一起，每个都会造成"没有淡出"：

| # | 问题 | 现象 | 修法 |
|---|---|---|---|
| ① | 拆除路径直接 `pause()` | 某一帧突然断，与音频长度无关 | `stopBgm()` 改为先淡出再停；淡出中忽略其它停请求 |
| ② | 淡出时长秒/毫秒错位 | 设置 4 秒 → 实得 4 毫秒 = 瞬间静音 | 读写两端单位归一，下限 300ms |
| ③ | 片头时长写死 14.01 秒 | 桌面端（实际 17 秒）淡出提前 3 秒收完 | 常量改 17000（桌面端实测） |

### 排程公式

```
delay = 片头时长 + 500ms − 淡出时长
完整档 17000：淡出 4s → 13.5s 开始，17.5s 收完（画面 17.0s 收口）✓
简易档  3590：同理
```

### 教训（下次别再犯）

```
1. 遇到"设置不生效"，第一件事是把实际读到的值打出来，不要先改代码 ✗
   日志里 ms=0 / ms=1500 一看就明白；猜了 6 轮都是白猜
2. 时长类常量不能按一个环境实测就写死 ✗
   本项目 Web 端完整档 14.01s、桌面端 17s，硬编码必然有一边错
3. 单位（秒/毫秒）在存储层必须两端一致，并且下限要挡住"0"
4. 音频"停"的路径有多条（收口/拆除/切歌/dispose），必须统一到一条淡出逻辑
```

---

> 代码质量与技术债的完整清理计划见 **docs/MAINTENANCE.md**（P0/P1/P2 分批 + 验收标准 + 禁区）。

## 三、待办

### P1 · 片头时长跨环境自适应

```
现在写死 17000（桌面端准、Web 端会偏 3 秒）
正解：首次播放实测 → 存 localStorage（键 dsh-550c-boot:bgm:splash-ms:<mode>）→ 下次复用
（曾尝试一次，补丁写崩已回滚；重做时注意 build.mjs 会做语法校验）
```

### P2 · 其他

```
· 设置页「生物特征 / 预览」那一行对齐未逐行核对
· PR #8 自带的 scripts/verify.mjs（192 行）未并入（要 --url 才能跑）
· npm 包内 README 仍是旧版（0.5.1 发版时会更新）
```

---

## 四、曲库容量的硬上限

```
localStorage 配额        5,177,344 字符（实测）
base64 膨胀              ×1.3333
理论最大音频             3.70 MB
当前上限                 3.6 MB（3686 KB）

想要无损大文件只能换 IndexedDB（直接存 Blob、无膨胀、按可用磁盘算）
用户已决定暂不做 ✗
```

---

## 五、常用命令

```powershell
node scripts/build.mjs          # 构建（改完 src/*.js 必须跑）
node --check lib/client.js      # 语法
npm test                        # 单元测试
npm run test:harness            # 71 个断言
npm run bake:land -- "$env:TEMP/ne_land.geojson" 9500

# 起 web 实例（每次 token 不同，从输出里取）
& "$env:LOCALAPPDATA\Programs\dsh-launcher\dsh.cmd" --profile web --port 3845 --no-open

# 同步到试装副本
Copy-Item F:\项目\dsh-start\src,F:\项目\dsh-start\lib,F:\项目\dsh-start\preview,F:\项目\dsh-start\scripts F:\项目\dsh-start-web -Recurse -Force

# 推送（hosts 修复后；origin 走 ghproxy 会 403，必须直连）
git push "https://<token>@github.com/yannicksong0106/dsh-550c-boot.git" master:main
```

### ffmpeg（剪片头音乐用）

```
C:\Users\Song\AppData\Local\Temp\ffmpeg-tool\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe
（npm 装的，在 %TEMP% 可能被清；重装：npm i @ffmpeg-installer/ffmpeg）

两遍法：先转 WAV 再压 FLAC，否则 STREAMINFO 没有总采样数，
        浏览器读不出时长，插件会报"文件无法解码"✗
  ffmpeg -ss <起点秒> -t <时长> -i src.flac -c:a pcm_s24le tmp.wav
  ffmpeg -i tmp.wav -c:a flac -compression_level 8 out.flac
```

---

## 六、文件地图

```
src/client.js     入口、面板外壳、片头收口、scheduleBootFade 排程（约第 500 行）
src/music.js      开机音乐：曲库、音量、淡出（readBgmFade / writeBgmFade 单位归一）
src/login.js      登录设置行 + 二维码多尺度识别
src/show.js       片头时间轴：playBoot 返回 totalMs = 250 + 路径数*300 + 400 + 600
src/panel.js      PANEL_TABS / PANEL_SLOTS
lib/client.js     构建产物（不要手改）
preview/ueg.html  动画本体 —— 最常改、最容易改坏
docs/STATUS.md    本文件
```

### 改 preview/ueg.html 的铁律

```
1. 禁止 indexOf/slice 取区间（曾吃掉 61 行），用唯一上下文的字符串替换
2. 改完取【最后一个】内联 <script> 块做语法检查（第一个是外链 ueg-land.js）
3. 改完立刻提交（这个文件丢过两次）
```
