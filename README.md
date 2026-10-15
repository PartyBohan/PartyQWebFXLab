# PartyKeys Web FX Lab

A premium, browser-based performance interface for the **PartyKeys** 36-key MIDI
keyboard. Press keys to trigger high-quality Tone.js instruments, run them through a
real-time DSP effects rack, see live visual feedback, and drive the keyboard's LEDs by
note / scale / chord / FX state.

> React + TypeScript · Web MIDI API · Web Audio + Tone.js · Tailwind CSS · **no backend, no paid APIs**

📘 完整架构 / 模块 / LED 协议 / 决策沉淀 → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173  (use Chrome desktop for Web MIDI)
npm run build    # type-check + production bundle into dist/
```

Click **Enable Audio** (browsers require a user gesture before audio), then **Connect
PartyKeys**. No hardware? Play with the mouse, touch, or the **A–L** computer keys.

## Features

- **Device Connection** — Web MIDI access (with SysEx), auto-detects PartyKeys, separate
  input/output selection, live connection status, safe fallbacks when MIDI is unavailable.
- **Performance Keyboard** — 36 visual keys (C3–B5), glowing on press, mouse/touch
  preview with glissando, animated particle bursts, live note / octave / velocity / chord
  readout, and scale-tone dots.
- **Sound Engine** — 12 presets (Dream Piano, Neon EP, Soft Pad, Analog Lead, Bass Pulse,
  Pluck Bell, Lo-fi Keys, Cyber Choir, Warm Organ, Future Marimba, Synth Brass, Space Arp)
  each with editable ADSR + master volume.
- **DSP FX Rack** — Reverb / Delay / Chorus / Filter / Distortion / Compressor with on-off
  toggles and rotary knobs, plus 8 one-tap modes (Clean, Space, Lo-fi, Stadium, Dream,
  EDM, Cinematic, Practice).
- **LED Light Control** — Note / Scale Guide / Chord Guide / FX Reactive / Trail modes,
  5 color palettes (Blue, Purple, Orange, Gradient, Rainbow), brightness, and a live
  on-screen LED strip preview.
- **AI Sound Designer** — type a prompt (“dreamy synth piano in a huge glass hall”) and the
  offline keyword engine maps it to a preset + FX configuration. No external API.

## Project structure

```
src/
  lib/
    midi/      MidiEngine.ts        Web MIDI wrapper (note routing, device list, output)
    audio/     AudioEngine.ts       Tone.js synth + DSP FX chain
    led/       sendLedMessage.ts    >>> PartyKeys LED protocol lives here <<<
               colors.ts            palette / gradient / rainbow helpers
    presets/   soundPresets.ts      12 instruments
               fxPresets.ts         8 FX modes + defaults
               aiKeywords.ts        offline prompt -> preset/FX mapper
    music.ts   note names, scales, chord detection (C3–B5 = MIDI 48–83)
    types.ts   shared TypeScript types
  store.ts     Zustand store wiring UI <-> engines
  components/  DevicePanel, Keyboard, SoundPanel, FxRack, LedPanel, AiSoundPrompt, ui/
```

## ⚡ Plugging in the real PartyKeys LED protocol

All LED output flows through **one file**: [`src/lib/led/sendLedMessage.ts`](src/lib/led/sendLedMessage.ts).

```ts
sendLedMessage(output, note, color, brightness, duration)
```

It ships with the documented PartyKeys SysEx protocols already implemented:

- `0x71` indexed 12-color (hardware-verified — the **default**)
- `0x15` per-key full RGB (newer)

Flip `LED_PROTOCOL` at the top of the file, or edit `buildLedSysEx()` to match the exact
firmware. Everything else in the app stays protocol-agnostic. Note the ~200 ms hardware LED
latency comment when syncing LEDs tightly to audio.

## Deploy (GitHub → Vercel)

Vite is auto-detected; leave **Root Directory** empty. `vercel.json` adds SPA rewrites.
```bash
git add . && git commit -m "PartyKeys Web FX Lab" && git push
```

## 部署信息

- 部署环境：生产 · 阿里云华东1（cn-hangzhou）
- 部署方案：纯静态 OSS + CDN（方案 A）
- 目标域名：https://fx.popumusic.cn （已验证 200，HTTPS 正常）
- OSS Bucket：`popumusic-web`（与其他 popumusic 子域共用），前缀 `apps/fx/`
- CDN 加速域名：`fx.popumusic.cn`，源站 `popumusic-web.oss-cn-hangzhou.aliyuncs.com`（oss，443），边缘函数 `back_to_origin_url_rewrite` 将 `^/(.*)$` 重写为 `/apps/fx/$1`（另配 `oss_auth`、`set_req_host_header`）
- DNS：`fx.popumusic.cn` CNAME → `fx.popumusic.cn.w.kunlunaq.com`（阿里云 DNS）
- 证书：CAS `popumusic-c-popumusic-cn-2026`（CertId 26624284，`*.popumusic.cn`，有效期至 2027-02-20）
- 构建：`npm run build` → 上传（带缓存头，降低 CDN 回源 TTFB）：
  - `cd dist && aliyun oss cp . oss://popumusic-web/apps/fx/ -r -f --meta Cache-Control:no-cache`（2026-08-25 已从独立 bucket `fx-popumusic-cn` 迁入，迁移后验证 200）
  - `aliyun oss cp dist/assets oss://popumusic-web/apps/fx/assets -r -f --meta Cache-Control:public,max-age=31536000,immutable`（文件名带 hash，可永久缓存）
  - 部署后在 CDN 控制台刷新 `/`；并建议为 `*.html` 配 5-10 分钟边缘缓存（实测 TTFB ~940ms，瓶颈在 CDN 每请求执行 3 个边缘函数 + HTML 无边缘缓存）
- 注意：部署到 PopuMusic MIDI Browser 前需将 `fx.popumusic.cn` 加入发布清单 Whitelist（cpfile.poputar.com/MidiBrowser/publish.json）

### 返回按钮（BackEntry）显示规则与踩坑记录

`src/components/BackEntry/BackEntry.tsx` 在标题行内渲染返回按钮，满足以下任一条件时显示：

1. URL 带 `?popu-back=1`（Portal 入口标记，见接入指南 §8.1）
2. 运行在 PopuMusic WebView 内（`isPopuWebview()` 检测 `popuDisplayInfo` / `samplerBridge` / `__webMIDIBridge`）
3. 存在跨域 `document.referrer`

**2026-08 踩坑**：最初只实现了条件 1 和 3。但 App WebView 不提供 `document.referrer`，而 Portal 只给课程/曲库/超级曲库三个入口附加 `popu-back=1`，FX 页面入口没有带——两个条件都不成立，按钮在 App 内从不显示。修复：补充条件 2，在 WebView 内必然显示（用户离开页面的唯一途径就是返回）；点击逻辑改为与 `popumusic-web-collection` 的 `packages/learning-ui/back-entry.js` 一致：`history.length > 1` 则 `history.back()`，否则跳转可解析的跨站 referrer。普通浏览器直接打开仍不显示按钮。
