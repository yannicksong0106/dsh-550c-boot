# dsh-550c-boot

[中文](README.md) | [English](README.en.md)

[![npm](https://img.shields.io/npm/v/dsh-550c-boot?style=flat-square&logo=npm&label=npm)](https://www.npmjs.com/package/dsh-550c-boot)
[![npm downloads](https://img.shields.io/npm/dm/dsh-550c-boot?style=flat-square&label=npm%20downloads%2Fmo)](https://www.npmjs.com/package/dsh-550c-boot)
[![npm total](https://img.shields.io/npm/dt/dsh-550c-boot?style=flat-square&label=npm%20downloads)](https://www.npmjs.com/package/dsh-550c-boot)
[![Stars](https://img.shields.io/github/stars/yannicksong0106/dsh-550c-boot?style=flat-square&logo=github&label=Stars)](https://github.com/yannicksong0106/dsh-550c-boot/stargazers)
[![Forks](https://img.shields.io/github/forks/yannicksong0106/dsh-550c-boot?style=flat-square&label=Forks)](https://github.com/yannicksong0106/dsh-550c-boot/forks)
[![Last commit](https://img.shields.io/github/last-commit/yannicksong0106/dsh-550c-boot?style=flat-square&label=last%20commit)](https://github.com/yannicksong0106/dsh-550c-boot/commits/main)
[![License](https://img.shields.io/github/license/yannicksong0106/dsh-550c-boot?style=flat-square&label=license)](LICENSE)

**A 550C boot intro for DeepSeek Harness, followed by a UEG access-permission sequence you can actually click through.**

Open DSH and the intro plays first. After it, you are an operator working for the United Earth Government - terminals running, your ID being verified, the globe turning. Click or press `Enter` to move on, `Esc` to skip.

![Full mode: 47 nodes overwritten one by one](docs/preview-full.png)

---

## Features

### 🎬 Boot intro

- **Two modes**: simple (~4s, logo drawn in) / full (~16s, the whole overwrite sequence) - or turn it off entirely
- **Skip anytime**: click anywhere, or press `Esc`
- **No flash of the stock loader**: the host half paints the first frame while the document is still parsing, so DSH's own `HARNESS / Loading plugins...` card never shows
- **Desktop-friendly**: while the intro plays, the three caption buttons in the window corner go transparent and take the theme's accent colour

### 🛰️ UEG access-permission sequence

A three-act, interactive sequence that can follow the intro:

1. **Blown-out wash, then the board wipes in** - terminal, ID card and globe arrive in order
2. **Five verification steps** - identity check, clearance, permit issued - typed out with voice-over
3. **Chromatic reveal** - the finale collapses the screen into a single line

- Click or press `Enter` to advance, `Esc` to skip
- **Two themes**: UEG (light, official paperwork) / 550C control terminal (dark)
- **Make the ID card yours**: operator name, photo, serial, clearance level, issuer, validity, scope, biometrics
- **Voice-over**: male is ready (one audio file per line - it never rushes or clips the last word); female is still in progress and marked "开发中" in the UI
- **Autoplay**: on by default, can be switched to manual

### 🎛️ Settings page

A new **550C** page in Settings, with a pill-style switcher on top:

| Group | What is in it |
| --- | --- |
| **外观 / Look** | skin-related rows |
| **550C 开机动画 / Boot** | intro mode, colour scheme, version and update |
| **UEG 登录界面 / Login** | screen mode, autoplay, voice, ID card, preview |

- **Check for updates**: reads the latest version from npm and offers a one-click update (on the desktop client it points you to Settings → Plugins instead)
- **Preview**: play the animation without restarting

### 🎨 Companion skin

For a matching look, pair it with the skin from the same suite:

> **[dsh-550c-skin](https://www.npmjs.com/package/dsh-550c-skin)** - repaints the whole DSH shell as a 550C console (four phosphor schemes, scan line, monospace, readout rails).

The two plugins **install independently and have no code dependency**; when both are present, this plugin owns the 550C settings page and the skin only adds its own rows to it.

---

## Install

```bash
npm i dsh-550c-boot
```

Or inside DSH: **Settings → Plugins → install** `dsh-550c-boot@latest`, then restart the client.

---

## Usage

```
Settings → 550C
  ├─ 550C 开机动画   pick a mode (simple / full / off), change the colour scheme
  └─ UEG 登录界面    pick the screen, autoplay, voice, edit the ID card, hit Preview
```

> The intro and the UEG sequence are **mutually exclusive**: UEG brings its own three acts, so the intro steps aside while it is on. Turn one off to use the other.

---

## Known limitations

- **Female voice-over** is still in progress (marked in the UI)
- **No self-update on the desktop client** (the desktop profile is managed exclusively by the app) - the update check points you to Settings → Plugins
- Intro and UEG sequence cannot both be on

---

## License and credits

MIT © [Ziyang Song](https://github.com/yannicksong0106)

The original 550C intro animation and HTML came from **[Voidpocket](https://github.com/Voidpocket)**; the plugin, the port and the UEG sequence are by **Ziyang Song**. See [CREDITS.md](CREDITS.md).
