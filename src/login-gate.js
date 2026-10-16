/**
 * 登录相位的编排：五步授权 → 打字机 → 逐句配音 → 收尾。
 *
 * 整个函数是一个闭包（19 个内部函数共享 ui / record / timers 等状态），
 * 拆开它们只会把状态搬来搬去、风险高收益低 —— 所以【整体】挪到本文件，
 * 让 login.js 只留设置行的部分。
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】。
 */

function mountLoginGate(force) {
  // 自动相位（force 为 null）只放一次：放完后 liveLogin 仍指向那条记录，
  // 下一次相位钩子就直接早退 —— 否则会再挂一个新的 iframe，动画播完又从头开始，
  // 表现就是"进不去对话页、动画重播"。「预览」是用户主动点的（force 有值），
  // 所以先把旧的那条收掉，再放一遍。
  if (liveLogin !== null) {
    if ((force ?? null) === null) return liveLogin
    try { liveLogin.dispose() } catch { /* 已经收掉了 */ }
    liveLogin = null
  }

  // ── UEG 档：播放我们做的三幕登入动画（新增内容）─────────────────────────
  // 它是自包含的一页（/ueg/，由宿主以同源 iframe 提供：自己的 style/script/canvas/音频）。
  // 这里只做"这一档走那条路"的短路 —— 550C 档与片头动画一律不动。
  if ((force ?? readLoginScreen()) === 'ueg') {
    const frame = document.createElement('div')
    frame.className = 'dsh550c-ueg-cinema'
    // 让窗口右上角那三个原生按钮也「浮」在这次动画上 —— 和片头用的是同一套：
    // adaptCaption 会注入一段 CSS 把 DSH 的探针 span 背景改成 transparent，
    // Desktop 的 preload 重新测量后经 IPC 把 titleBarOverlay 也设成透明。
    // 浏览器标签里没有 data-platform，这个调用天然是 no-op。
    let captionDispose = null
    try {
      if (typeof adaptCaption === 'function') captionDispose = adaptCaption(document.body)
    } catch (error) {
      console.error('[dsh-550c-boot] caption adapt failed', error)
    }
    frame.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;background:#05060a;opacity:1;transition:opacity 650ms ease'
    const inner = document.createElement('iframe')
    // 把设置里的 DIY 项与配音一起带进动画页：姓名、头像、男声/女声、或关闭配音
    const params = new URLSearchParams()
    const operator = readLoginPref(LOGIN_USER_KEY, '')
    const avatar = readLoginPref(LOGIN_PHOTO_KEY, '')
    const voiceChoice = readLoginPref(LOGIN_VOICE_KEY, 'off')
    if (operator !== '') params.set('name', operator)
    // 头像【绝不放进 query】：base64 太长会把 URL 撑爆 —— 实测直接 431（请求头过大），
    // iframe 就加载失败，表现正是"进得去网页、打不开 DSH"。
    // 动画页改成自己从 localStorage 读那张图（同源，读得到）。
    for (const [key] of LOGIN_CARD_KEYS) {
      const value = readLoginPref(LOGIN_CARD_KEY(key), '')
      if (value !== '') params.set(key, value)
    }
    if (readLoginPref(LOGIN_AUTOPLAY_KEY, 'on') === 'off') params.set('auto', '0')
    if (voiceChoice === 'off') params.set('audio', '0')
    else params.set('voice', voiceChoice)
    inner.src = '/ueg/' + (params.size === 0 ? '' : '?' + params.toString())   // 同上
    // 动画页画出来之后再撤退宿主的首帧黑帧 —— 这样从开机到 UEG 第一帧没有空档。
    inner.addEventListener('load', () => {
      try {
        if (typeof endFirstFrame === 'function') endFirstFrame()
      } catch (error) {
        console.error('[dsh-550c-boot] first-frame retire failed', error)
      }
    }, { once: true })
    inner.setAttribute('title', 'UEG 访问终端')
    inner.style.cssText = 'width:100%;height:100%;border:0;display:block'
    frame.appendChild(inner)
    document.body.appendChild(frame)

    const dismiss = () => {
      if (captionDispose !== null) {
        try { captionDispose() } catch { /* 已经收掉了 */ }
        captionDispose = null
      }
      window.removeEventListener('message', onMessage)
      frame.style.opacity = '0'
      window.setTimeout(() => frame.remove(), 700)
      // 这里【刻意不清空 liveLogin】：清空会让下一次相位钩子再挂一个新 iframe，
      // 动画就从头重播。保留记录 = 已放完，后续钩子一律早退。
    }
    const onMessage = (event) => {
      if (event.data === 'ueg:done' && event.source === inner.contentWindow) dismiss()
    }
    const record = { dispose: dismiss, dismiss }
    window.addEventListener('message', onMessage)
    liveLogin = record
    return record
  }

  const screen = force ?? readLoginScreen()
  if (screen === 'off') return null

  ensureLoginSheet()

  const schemeId = readScheme()
  const theme = loginTheme(screen, schemeId)
  const speedId = LOGIN_SPEEDS.some((candidate) => candidate.id === readLoginPref(LOGIN_SPEED_KEY, 'normal'))
    ? readLoginPref(LOGIN_SPEED_KEY, 'normal')
    : 'normal'
  const user = readLoginPref(LOGIN_USER_KEY, '操作员')

  const host = document.createElement('div')
  host.className = 'dsh550c-login'
  host.dataset.dsh550cLogin = ''
  host.setAttribute('aria-hidden', 'true')
  for (const [name, value] of Object.entries(theme.vars)) host.style.setProperty(name, value)
  host.style.setProperty('--wash', theme.wash)

  const shadow = host.attachShadow({ mode: 'open' })
  const sheet = document.createElement('style')
  sheet.textContent = loginShadowCss()
  shadow.appendChild(sheet)

  const element = document.createElement('div')
  element.className = 'screen'
  element.innerHTML = [
    '<div class="grain"></div>',
    '<div class="scanlines"></div>',
    '<div class="vignette"></div>',
    '<div class="scanline" data-login="scanline"></div>',
    '<div class="board" data-login="board">',
    '  <div class="frame"></div>',
    '  <div class="corner tl"></div><div class="corner tr"></div>',
    '  <div class="corner bl"></div><div class="corner br"></div>',
    '  <div class="brandline">',
    '    <svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><path d="' + EMBLEM_PATH + '"></path></svg>',
    '    <span data-login="brand"></span>',
    '  </div>',
    '  <div class="head"><span data-login="head-left"></span><b data-login="head-right"></b></div>',
    '  <div class="body">',
    '    <div class="step" data-login="step">',
    '      <div class="kicker" data-login="kicker"></div>',
    '      <h1 class="glitch" data-login="main"></h1>',
    '      <div class="sub"><span data-login="sub"></span><span class="cursor"></span></div>',
    '      <div class="card" data-login="card"></div>',
    '      <ul data-login="detail"></ul>',
    '      <div class="progress" data-login="progress"></div>',
    '    </div>',
    '  </div>',
    '  <div class="foot">',
    '    <span data-login="foot-left"></span>',
    '    <span class="hint" data-login="action"></span>',
    '    <button class="skip" type="button" data-login="skip">跳过 / SKIP</button>',
    '  </div>',
    '</div>',
    '<div class="reticle" data-login="reticle"><i></i><i></i><span class="bloom" data-login="bloom"></span></div>',
    '<div class="streak" data-login="streak"></div>',
    '<div class="waterfall" data-login="waterfall"></div>',
    '<div class="seal" data-login="seal"></div>',
    '<div class="sweep" data-login="sweep"></div>',
    '<div class="wash" data-login="wash"></div>',
    '<div class="reveal" data-login="reveal"></div>',
  ].join('')
  shadow.appendChild(element)

  const ui = {}
  for (const node of element.querySelectorAll('[data-login]')) ui[node.dataset.login] = node

  const ticket = String(Math.floor(Math.random() * 900000) + 100000)
  const clearance = readLoginPref('dsh-550c-boot:login-clearance', 'LEVEL-2 / 观察员')
  const fill = (text) =>
    String(text).replaceAll('{user}', user).replaceAll('{clearance}', clearance).replaceAll('{ticket}', ticket)

  ui.brand.textContent = theme.brand
  ui['head-left'].textContent = theme.head
  ui['head-right'].textContent = new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z'
  ui['foot-left'].textContent = theme.id === 'ueg' ? '授权范围：本机会话' : 'SESSION LOCAL ONLY'

  let index = -1
  let timer = null
  let typed = []
  let finished = false
  let disposed = false
  let audio = null

  const record = {
    dispose() {
      disposed = true
      finished = true
      stopTimers()
      stopVoice()
      document.removeEventListener('keydown', onKey, true)
      host.remove()
      if (liveLogin === record) liveLogin = null
    },
  }

  function stopTimers() {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    for (const id of typed) window.clearTimeout(id)
    typed = []
  }

  function stopVoice() {
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* no speech API */
    }
  }

  function blip(frequency, durationMs) {
    try {
      audio ??= new (window.AudioContext ?? window.webkitAudioContext)()
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = theme.id === 'ueg' ? 'sine' : 'square'
      oscillator.frequency.value = frequency
      gain.gain.value = 0.05
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + durationMs / 1000)
      oscillator.connect(gain).connect(audio.destination)
      oscillator.start()
      oscillator.stop(audio.currentTime + durationMs / 1000)
    } catch {
      /* audio is a bonus */
    }
  }

  /** Play a one-shot animation by class, restarting it if it is already running. */
  function play(role, className = 'on') {
    const node = ui[role]
    if (node === undefined) return
    node.classList.remove(className)
    void node.offsetWidth
    node.classList.add(className)
  }

  const stepMs = () => LOGIN_STEP_MS[speedId] ?? LOGIN_STEP_MS.normal

  function typeSubtitle(text) {
    ui.sub.textContent = ''
    for (let position = 0; position < text.length; position += 1) {
      typed.push(
        window.setTimeout(
          () => {
            ui.sub.textContent = text.slice(0, position + 1)
          },
          position * (theme.id === 'ueg' ? 20 : 30),
        ),
      )
    }
  }

  function paint() {
    const step = theme.steps[index]
    ui.kicker.textContent =
      index === 0 && theme.id === 'ueg'
        ? '访问授权 / ACCESS CONTROL'
        : 'STEP ' + String(index + 1) + ' / ' + String(theme.steps.length)
    ui.main.textContent = fill(step.main)
    ui.main.dataset.text = fill(step.main)
    typeSubtitle(step.sub)
    ui.detail.textContent = ''
    for (const line of step.detail) {
      const item = document.createElement('li')
      item.textContent = fill(line)
      ui.detail.appendChild(item)
    }
    ui.card.textContent = ''
    ui.detail.style.display = step.card === true ? 'none' : ''
    if (step.card === true) {
      for (const line of step.detail) {
        const row = document.createElement('div')
        row.textContent = fill(line)
        ui.card.appendChild(row)
      }
    }
    ui.action.textContent = step.action === null ? '' : fill(step.action) + ' ▸'
    ui.progress.textContent = ''
    for (let position = 0; position < theme.steps.length; position += 1) {
      const pip = document.createElement('span')
      pip.className = position < index ? 'pip on' : position === index ? 'pip now' : 'pip'
      ui.progress.appendChild(pip)
    }

    // Every step plays the same motion kit. The class is removed and re-added so the
    // CSS animation restarts even when the same step is painted twice.
    ui.step.classList.remove('on')
    void ui.step.offsetWidth
    ui.step.classList.add('on')

    ui.waterfall.textContent = ''
    ui.waterfall.classList.toggle('on', step.waterfall === true)
    if (step.waterfall === true) {
      for (let column = 0; column < 7; column += 1) {
        const stream = document.createElement('i')
        stream.style.left = String(6 + column * 13) + '%'
        stream.style.animationDelay = String(column * 0.17) + 's'
        let dump = ''
        for (let row = 0; row < 16; row += 1) {
          dump += Math.floor(Math.random() * 65535)
            .toString(16)
            .toUpperCase()
            .padStart(4, '0')
          dump += '\n'
        }
        stream.textContent = dump
        ui.waterfall.appendChild(stream)
      }
    }

    play('bloom')
    play('streak')
    play('sweep')
    if (step.seal === true) {
      ui.seal.textContent = theme.id === 'ueg' ? '核验通过 · VERIFIED' : 'VERIFIED'
      play('seal')
    }
    blip(theme.id === 'ueg' ? 620 : 880, 90)
  }

  function advance() {
    stopTimers()
    index += 1
    if (index >= theme.steps.length) {
      finish()
      return
    }
    present()
  }

  function speak(text, onDone) {
    if (typeof window.SpeechSynthesisUtterance !== 'function') {
      timer = window.setTimeout(onDone, stepMs())
      return
    }
    try {
      const utterance = new window.SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-CN'
      utterance.rate = speedId === 'slow' ? 0.9 : speedId === 'fast' ? 1.25 : 1.05
      let settled = false
      const settle = () => {
        if (settled || disposed) return
        settled = true
        onDone()
      }
      utterance.onend = settle
      utterance.onerror = settle
      timer = window.setTimeout(settle, stepMs() * 4)
      window.speechSynthesis.speak(utterance)
    } catch {
      timer = window.setTimeout(onDone, stepMs())
    }
  }

  function present() {
    const step = theme.steps[index]
    paint()
    if (step.finale === true) {
      // The finale glitches, then the curtain wipes away.
      play('main', 'on')
      speak(fill(step.say), () => {
        play('main', 'on')
        timer = window.setTimeout(finish, 900)
      })
      return
    }
    speak(fill(step.say), advance)
  }

  function hurry() {
    if (finished) return
    stopVoice()
    advance()
  }

  function skip() {
    if (finished) return
    stopTimers()
    stopVoice()
    index = theme.steps.length - 1
    paint()
    timer = window.setTimeout(finish, 520)
  }

  function finish() {
    if (finished) return
    finished = true
    stopTimers()
    document.removeEventListener('keydown', onKey, true)
    play('reveal')
    host.classList.add('dsh550c-login-out')
    timer = window.setTimeout(() => {
      record.dispose()
      document.dispatchEvent(new CustomEvent(LOGIN_DONE_EVENT, { detail: { theme: theme.id } }))
    }, 560)
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      skip()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      hurry()
    }
  }

  document.addEventListener('keydown', onKey, true)
  host.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button.skip') !== null) return
    hurry()
  })
  ui.skip.addEventListener('click', (event) => {
    event.stopPropagation()
    skip()
  })

  /** Act 0: the wash blows out, the board wipes on underneath it. */
  function start() {
    play('wash')
    play('sweep')
    timer = window.setTimeout(
      () => {
        play('board')
        play('scanline')
        play('reticle')
        timer = window.setTimeout(advance, Math.round(stepMs() * 0.35))
      },
      Math.round((WASH_MS[speedId] ?? WASH_MS.normal) * 0.55),
    )
  }

  document.body.appendChild(host)
  start()
  liveLogin = record
  return record
}
