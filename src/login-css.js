/**
 * 「550C」设置行用到的样式表（在 shadow root 里注入）。
 *
 * 纯粹是字符串拼装，和编排逻辑分开 —— login.js 原本 969 行，
 * 光这一个函数就占 189 行，混在一起看代码很累。
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】。
 */

function loginShadowCss() {
  return `
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
.screen{position:absolute;inset:0;overflow:hidden;font-family:var(--font);color:var(--ink);
  background:var(--bg);-webkit-font-smoothing:antialiased}
.screen *{color:inherit}

/* ── atmosphere ─────────────────────────────────────────────────────────── */
.grain,.scanlines,.vignette{position:absolute;inset:0;pointer-events:none}
.grain{opacity:.5;background-image:
  repeating-linear-gradient(0deg,rgba(255,255,255,.020) 0 1px,transparent 1px 2px),
  repeating-linear-gradient(90deg,rgba(255,255,255,.014) 0 1px,transparent 1px 3px)}
.scanlines{background:repeating-linear-gradient(180deg,transparent 0 2px,rgba(0,0,0,.16) 2px 3px)}
.vignette{background:radial-gradient(120% 100% at 50% 50%,transparent 52%,rgba(0,0,0,.42) 100%)}
.sweep{position:absolute;top:0;bottom:0;width:34%;pointer-events:none;opacity:0;
  background:linear-gradient(100deg,transparent,var(--accent),transparent);filter:blur(2px)}
.sweep.on{animation:l-sweep 1100ms cubic-bezier(.4,0,.2,1) both}
@keyframes l-sweep{from{left:-40%;opacity:0}30%{opacity:.35}to{left:112%;opacity:0}}
.scanline{position:absolute;left:0;right:0;height:2px;top:-14%;pointer-events:none;opacity:0;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);filter:blur(.4px)}
.scanline.on{animation:l-scan 3.6s linear infinite}
@keyframes l-scan{0%{top:-14%;opacity:0}10%{opacity:.85}86%{opacity:.85}100%{top:102%;opacity:0}}

/* ── the over-exposure wash ─────────────────────────────────────────────── */
.wash{position:absolute;inset:0;pointer-events:none;background:var(--wash,#fff);opacity:0}
.wash.on{animation:l-wash 900ms cubic-bezier(.22,.9,.28,1) both}
@keyframes l-wash{0%{opacity:0}22%{opacity:1}55%{opacity:.86}100%{opacity:0}}

/* ── the board, wiped on left to right ──────────────────────────────────── */
.board{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;
  clip-path:inset(0 100% 0 0)}
.board.on{animation:l-board 900ms cubic-bezier(.16,1,.3,1) 120ms both}
@keyframes l-board{0%{opacity:0;clip-path:inset(0 100% 0 0)}12%{opacity:1}
  100%{opacity:1;clip-path:inset(0 0 0 0)}}
.frame{position:absolute;inset:26px;border:1px solid var(--line)}
.corner{position:absolute;width:22px;height:22px;border:2px solid var(--accent);opacity:0}
.board.on .corner{animation:l-fade 520ms ease-out 520ms both}
.corner.tl{top:26px;left:26px;border-right:0;border-bottom:0}
.corner.tr{top:26px;right:26px;border-left:0;border-bottom:0}
.corner.bl{bottom:26px;left:26px;border-right:0;border-top:0}
.corner.br{bottom:26px;right:26px;border-left:0;border-top:0}
@keyframes l-fade{from{opacity:0}to{opacity:1}}

.head{display:flex;justify-content:space-between;align-items:flex-start;padding:46px 58px 0;
  font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);text-transform:uppercase;
  color:var(--ink-dim);opacity:0}
.board.on .head{animation:l-fade 600ms ease-out 420ms both}
.head b{color:var(--ink);font-weight:600}
.brandline{position:absolute;left:58px;top:26px;display:flex;align-items:center;gap:12px;
  font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--ink-dim)}
.mark{width:26px;height:26px;color:var(--accent)}
.mark path{fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round;
  stroke-dasharray:320;stroke-dashoffset:320}
.board.on .mark path{animation:l-draw 1500ms cubic-bezier(.5,0,.2,1) 240ms both}
@keyframes l-draw{to{stroke-dashoffset:0}}

/* ── the title: letter-spacing draws it in, the sweep glints across ──────── */
.body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:0 58px;
  position:relative;z-index:2}
.kicker{font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--accent);
  text-transform:uppercase;display:flex;align-items:center;gap:12px;opacity:0}
.kicker::before{content:"";width:0;height:1px;background:var(--accent)}
.step.on .kicker{animation:l-fade 420ms ease-out both}
.step.on .kicker::before{animation:l-rule 520ms cubic-bezier(.16,1,.3,1) 60ms both}
@keyframes l-rule{to{width:34px}}
h1{font-size:clamp(30px,5.4vw,62px);line-height:1.03;font-weight:600;letter-spacing:.34em;
  white-space:pre-wrap;opacity:1}
.step.on h1{animation:l-title 900ms cubic-bezier(.16,1,.3,1) both}
@keyframes l-title{0%{opacity:0;letter-spacing:.44em;filter:blur(6px)}
  55%{opacity:1;filter:blur(0)}100%{opacity:1;letter-spacing:.02em;filter:blur(0)}}
.sub{font-family:var(--mono,var(--font));font-size:clamp(11px,1.3vw,14px);letter-spacing:var(--letter);
  color:var(--ink-dim);text-transform:uppercase;min-height:1.4em;white-space:pre}
.cursor{display:inline-block;width:8px;height:1em;vertical-align:-2px;background:var(--accent);
  margin-left:4px;animation:l-blink 1s steps(1) infinite}
@keyframes l-blink{50%{opacity:0}}
ul{list-style:none;display:flex;flex-direction:column;gap:8px;font-family:var(--mono,var(--font));
  font-size:clamp(11px,1.35vw,14px);color:var(--ink-dim);letter-spacing:.04em}
li{opacity:0;clip-path:inset(0 100% 0 0)}
.step.on li{animation:l-wipe 560ms cubic-bezier(.16,1,.3,1) both}
.step.on li:nth-child(1){animation-delay:260ms}
.step.on li:nth-child(2){animation-delay:400ms}
.step.on li:nth-child(3){animation-delay:540ms}
@keyframes l-wipe{0%{opacity:0;clip-path:inset(0 100% 0 0)}60%{opacity:1}
  100%{opacity:1;clip-path:inset(0 0 0 0)}}

/* ── the identity card, wiped in as a plate ─────────────────────────────── */
.card{display:flex;flex-direction:column;gap:10px;padding:18px 20px;border:1px solid var(--line);
  background:var(--bg-deep);opacity:0;clip-path:inset(0 0 100% 0);max-width:520px;
  font-family:var(--mono,var(--font));font-size:clamp(11px,1.35vw,14px);color:var(--ink-dim)}
.card:empty{display:none}
.step.on .card{animation:l-plate 620ms cubic-bezier(.16,1,.3,1) 320ms both}
@keyframes l-plate{from{opacity:0;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}

/* ── the ring reticle: blooms on every step change, spins throughout ─────── */
.reticle{position:absolute;right:74px;bottom:74px;width:150px;height:150px;pointer-events:none;opacity:0}
.reticle.on{animation:l-fade 700ms ease-out both}
.reticle::before,.reticle::after{content:"";position:absolute;border-radius:50%}
.reticle::before{inset:0;border:1px solid var(--line)}
.reticle::after{inset:16px;border:1px dashed var(--accent);opacity:.6;animation:l-spin 11s linear infinite}
.reticle i{position:absolute;left:50%;top:-4px;width:8px;height:8px;margin-left:-4px;background:var(--accent);
  box-shadow:0 0 12px var(--glow)}
.reticle i:nth-child(2){top:auto;bottom:-4px;opacity:.6}
@keyframes l-spin{to{transform:rotate(360deg)}}
.bloom{position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:50%;
  border:1px solid var(--accent)}
.bloom.on{animation:l-bloom 900ms cubic-bezier(.2,.8,.2,1) both}
@keyframes l-bloom{0%{opacity:0;transform:scale(.08)}20%{opacity:.9;transform:scale(.42)}
  58%{opacity:.7;transform:scale(.96)}100%{opacity:0;transform:scale(1.42)}}
.streak{position:absolute;left:50%;top:50%;height:2px;background:var(--accent);opacity:0;
  transform:translate(-50%,-50%);box-shadow:0 0 18px var(--glow)}
.streak.on{animation:l-streak 1000ms cubic-bezier(.16,1,.3,1) both}
@keyframes l-streak{0%{opacity:0;width:0;height:1px}26%{opacity:1;width:62vw;height:3px}
  60%{opacity:.6;width:96vw;height:2px}100%{opacity:0;width:132vw;height:1px}}

/* ── progress pips and footer ───────────────────────────────────────────── */
.progress{display:flex;gap:10px;align-items:center}
.pip{width:28px;height:3px;background:var(--line);transform-origin:left center}
.pip.on{background:var(--accent);box-shadow:0 0 12px var(--glow);animation:l-pip 420ms ease-out both}
.pip.now{background:var(--accent);box-shadow:0 0 18px var(--glow);animation:l-pulse 1.5s ease-in-out infinite}
@keyframes l-pip{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes l-pulse{0%,100%{opacity:1}50%{opacity:.45}}
.foot{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:0 58px 46px;
  font-family:var(--mono,var(--font));font-size:11px;letter-spacing:var(--letter);color:var(--ink-dim);
  text-transform:uppercase;opacity:0}
.board.on .foot{animation:l-fade 600ms ease-out 600ms both}
.hint{color:var(--accent)}
button.skip{font:inherit;font-family:var(--mono,var(--font));letter-spacing:var(--letter);
  text-transform:uppercase;color:var(--ink);background:transparent;border:1px solid var(--line);
  padding:9px 16px;cursor:pointer;pointer-events:auto;position:relative;overflow:hidden;
  transition:border-color 180ms ease,box-shadow 180ms ease}
button.skip:hover{border-color:var(--accent);box-shadow:0 0 16px var(--glow)}
button.skip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* ── the hex waterfall ─────────────────────────────────────────────────── */
.waterfall{position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:0}
.waterfall.on{animation:l-fade 500ms ease-out both}
.waterfall i{position:absolute;top:-30%;font-family:var(--mono,var(--font));font-size:11px;line-height:1.7;
  color:var(--accent);opacity:.5;white-space:pre;animation:l-fall 1.6s linear infinite}
@keyframes l-fall{to{transform:translateY(150vh)}}

/* ── the verdict seal ──────────────────────────────────────────────────── */
.seal{position:absolute;right:74px;top:46%;border:2px solid var(--accent);color:var(--accent);
  font-family:var(--mono,var(--font));letter-spacing:var(--letter);padding:12px 18px;font-size:13px;
  text-transform:uppercase;box-shadow:0 0 30px var(--glow);opacity:0}
.seal.on{animation:l-stamp 460ms cubic-bezier(.2,1.7,.4,1) both}
@keyframes l-stamp{0%{opacity:0;transform:rotate(-14deg) scale(1.7)}60%{opacity:1}
  100%{opacity:1;transform:rotate(-8deg) scale(1)}}

/* ── the chromatic aberration, ported from upstream ────────────────────── */
.glitch{position:relative;display:inline-block}
.glitch[data-text]::before,.glitch[data-text]::after{content:attr(data-text);position:absolute;left:0;top:0;
  width:100%;opacity:0;pointer-events:none;filter:blur(.5px)}
.glitch[data-text]::before{color:var(--glitch-1)}
.glitch[data-text]::after{color:var(--glitch-2)}
.glitch.on::before{animation:l-gx 430ms steps(3,end) 2 both}
.glitch.on::after{animation:l-gy 430ms steps(3,end) 2 both}
@keyframes l-gx{0%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}
  14%{transform:translate(-3px,0);opacity:.7;clip-path:inset(6% 0 68% 0)}
  34%{transform:translate(2px,0);opacity:.5;clip-path:inset(54% 0 28% 0)}
  56%{transform:translate(-2px,0);opacity:.6;clip-path:inset(22% 0 56% 0)}
  100%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}}
@keyframes l-gy{0%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}
  14%{transform:translate(3px,0);opacity:.7;clip-path:inset(62% 0 14% 0)}
  34%{transform:translate(-2px,0);opacity:.5;clip-path:inset(8% 0 74% 0)}
  56%{transform:translate(2px,0);opacity:.6;clip-path:inset(44% 0 34% 0)}
  100%{transform:translate(0,0);opacity:0;clip-path:inset(0 0 100% 0)}}
.reveal{position:absolute;inset:0;background:var(--bg);clip-path:inset(0 0 0 0);pointer-events:none}
.reveal.on{animation:l-reveal 900ms cubic-bezier(.7,0,.2,1) 260ms both}
@keyframes l-reveal{from{clip-path:inset(0 0 0 0)}to{clip-path:inset(0 0 0 100%)}}

@media (prefers-reduced-motion: reduce){
  .sweep.on,.scanline.on,.wash.on,.board.on,.step.on *,.reticle::after,.pip.now,.waterfall i,
  .bloom.on,.streak.on,.seal.on,.glitch.on::before,.glitch.on::after,.reveal.on{animation:none !important}
  .board,.head,.foot,.kicker,h1,li,.card,.mark path,.reticle,.seal{opacity:1 !important;
    clip-path:none !important;stroke-dashoffset:0 !important}
}
`
}
