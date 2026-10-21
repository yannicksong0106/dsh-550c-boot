# DSH 550C 启动动画 —— 项目现状

> 最后更新：2026-10-22
> 主仓库：`F:\项目\dsh-start`
> 试装副本：`F:\项目\dsh-start-web`

---

## 一、当前状态

```
版本        0.5.0（已发布）
本地 HEAD   cb824f7  fix(qr): 识别二维码改成多尺度尝试
远端 main   62f9fa5  ← 落后本地 2 个提交（推送被 hosts 挡住，见下）
tag         v0.5.0 → 97a3f8a
npm         dsh-550c-boot@0.5.0（latest）
工作区      干净
```

未推送的两个提交：

```
cb824f7  fix(qr): 识别二维码改成多尺度尝试
075b54f  docs: 更新项目现状到 0.5.0
```

### 推送受阻的原因（重要）

```
C:\Windows\System32\drivers\etc\hosts 里把 GitHub 全家族指到了 127.0.0.1：
  github.com / api.github.com / raw.githubusercontent.com / githubusercontent.com …（共 28 条）

结果：git push 报 SSL/TLS timeout 或 Connection refused；
      api.github.com 也不通 → 之前能用 API 合并 PR、建 Release，现在不行 ✗

解决：删掉 hosts 里这些行，或重新打开写它们的代理工具 ✓ 需要管理员权限 ✗
```

---

## 二、0.5.0 已发布的内容

| 类型 | 内容 | 位置 |
|---|---|---|
| 新增 | 身份卡二维码自定义：填文字/链接本地编码，或选图本地识别后按卡片风格重绘 | `src/login.js`、`preview/ueg.html`、`preview/assets/qrcode-gen.js`、`jsqr.js` |
| 新增 | 开机音乐（PR #8）：曲库导入/试听/重命名/删除/指定，音量与淡出，片头结束渐弱 | `src/music.js`、`src/client.js` |
| 修复 | 地球自转方向与大陆形状：改用 Natural Earth 110m 数据重烘 | `preview/assets/ueg-land.js`、`scripts/bake-land.mjs` |
| 修复 | 核验结论状态条（反显白条 + 逐字解码 + 读取光带）、底部竖条随结论收平 | `preview/ueg.html` |
| 修复 | 设置页二维码行布局：移出字段网格、占满整行 | `src/login.js` |

### 0.5.0 之后修的（未发布）

```
二维码识别改成多尺度尝试：
  jsQR 对图片尺寸极敏感 —— 同一张微信二维码（968x1433）原尺寸解不出，
  缩到长边约 900px 才成功。现在按 900 / 700 / 1100 / 1400 / 原尺寸 各试一次，
  命中即止，inversionAttempts 设为 attemptBoth（反色码也试）。
  实测：用户的微信码缩到 608x900 时解出 https://u.wechat.com/…
```

---

## 三、待办（按优先级）

### P1 · 开机音乐"淡出听不出来"

```
现象：用户反馈片头结束时没有渐弱的感觉
原因：finish() 是【画面结束那一刻】才调 fadeOutBootMusic()，
      淡出 1.5 秒发生在画面已经消失之后 → 主观上像硬切 ✗
正解：在片头结束前 fadeMs 就开始淡出，让"画面渐隐"与"音乐渐弱"同时收尾
待办：先确认 createShow 里 full / simple 的真实时长常量（不能凭 UI 文案写），
      再改成提前淡出，finish() 里只做兜底
另注：导入 11 秒音频 + 11 秒片头时，'ended' 的 400ms 短淡出会叠加，更难听出来
      建议导入 13–14 秒（留 2–3 秒余量）
```

### P2 · 曲库容量（讨论中，未定）

```
现状：localStorage 存 base64，硬上限 3MB（单曲与总量），
      实测配额 5,177,344 字符 ≈ 最大音频 3.88MB ✗ 再高会先撞 QuotaExceededError

用户诉求：想放"原本的高音质"（96k/24bit、11 秒就要 4.72MB）✗ localStorage 无解

三条路（待选）：
  甲 自己剪好再导入（44.1k/16bit 11 秒 = 1.85MB）✓ 零改动、无损
  乙 导入时转 Opus 160k（11 秒 ≈ 0.21MB）✓ 体积小，但有损 + 实时录制要等 11 秒 + Safari 兼容差
  丙 换 IndexedDB（直接存 Blob，无 base64 膨胀）✓ 能放无损，但约 150–200 行改动 + 迁移

已实测：用户这首源是 48k/24bit，11 秒无损 FLAC 只有 2.59MB → 3MB 装得下 ✓
        所以"必须换存储"这个前提对这首先不成立 ✓
```

### P3 · 其他

```
· 设置页「生物特征 / 预览」那一行的对齐未逐行核对
· PR #8 自带的 scripts/verify.mjs（192 行）未并入主仓库（要 --url 才能跑）
· npm 包内 README 仍是旧版（用户要求先不动，下次发版再更新）
· dsh-start-web 试装区仍保留 PR#8 的 src/music.js 等文件，不影响主仓库
```

---

## 四、素材与工具

### 已剪好的测试音频（在桌面）

```
C:\Users\Song\Desktop\550C-片头-1m26s-11s.flac        2.59 MB
    48 kHz / 24 bit / 立体声 / 11.00 秒   ← 无损，能直接放进 3MB 曲库 ✓
C:\Users\Song\Desktop\550C-片头-1m26s-11s-44k16.wav   1.85 MB
    44.1 kHz / 16 bit / 立体声 / 11.00 秒 ← 通用兼容版
```

剪法（两遍法，关键：先转 WAV 再压 FLAC，否则 STREAMINFO 里没有总采样数，
浏览器读不出时长，插件会报"文件无法解码" ✗）：

```powershell
ffmpeg -ss 86 -t 11 -i "<源>.flac" -c:a pcm_s24le tmp.wav
ffmpeg -i tmp.wav -c:a flac -compression_level 8 out.flac
```

### ffmpeg 位置

```
C:\Users\Song\AppData\Local\Temp\ffmpeg-tool\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe
（npm 装的，因为系统里没有 ffmpeg；注意它在 %TEMP%，可能被清理）
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

# 起 web 实例（每次启动 token 都不同，从输出里取）
& "$env:LOCALAPPDATA\Programs\dsh-launcher\dsh.cmd" --profile web --port 3845 --no-open

# 同步到试装副本（不删多余文件）
Copy-Item F:\项目\dsh-start\src,F:\项目\dsh-start\lib,F:\项目\dsh-start\preview,F:\项目\dsh-start\scripts F:\项目\dsh-start-web -Recurse -Force

# 推送（hosts 修复后；origin 走 ghproxy 会 403，必须直连）
git push "https://<token>@github.com/yannicksong0106/dsh-550c-boot.git" master:main
```

---

## 六、文件地图

```
src/client.js        客户端入口、ROW_CSS、面板外壳、片头收口（fadeOutBootMusic 在 448 行）
src/panel.js         PANEL_TABS / PANEL_SLOTS / Panel550c
src/login.js         登录界面设置行（含二维码那一行、多尺度识别）
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
   （第一个 <script> 是外链 ueg-land.js，抓错了等于没检查）
3. 改完立刻提交，别攒着（这个文件丢过两次）
```
