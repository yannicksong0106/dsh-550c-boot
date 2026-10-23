/**
 * 登录相位的调度与终端档实现。
 *
 *   mountLoginGate(force)   调度器：ueg → src/login-ueg.js，off → 不放，其余 → 终端档
 *   mountTerminalGate(s)    终端档：五步授权 → 打字机 → 逐句配音 → 收尾
 *
 * 两条实现没有任何共享状态，所以 UEG 那条搬进了独立文件 —— 这个文件原来
 * 450 行里有一半是 iframe 与 postMessage，跟终端档的五步时间轴混在一起，
 * 想改其中一条得先读完另一条。
 *
 * 终端档本身仍是一个闭包（时间轴 / 打字机 / 配音 / 清理共享同一批状态）：
 * 硬拆成"状态机"只会把状态搬来搬去，风险远大于收益 —— 本轮只挪位置，逻辑一行未改。
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】。
 */

/** 归一化档位 → 收掉上一条 → 分派；语义见文件头。 */
function mountLoginGate(force) {
  if (liveLogin !== null) {
    if ((force ?? null) === null) return liveLogin
    try {
      liveLogin.dispose()
    } catch (error) {
      /* 已经收掉了 */
    }
    liveLogin = null
  }

  const screen = force ?? readLoginScreen()
  if (screen === 'ueg') return mountUegCinema()
  if (screen === 'off') return null
  return mountTerminalGate(screen)
}

/**
 * 终端档：五步授权（洗白 → 擦出 → 五步 → 色散）。
 *
 * 这里是一个闭包：时间轴、打字机、配音、清理共享同一批状态，
 * 硬拆成"状态机"只会把状态搬来搬去，风险远大于收益 —— 本轮只把它从
 * mountLoginGate 里挪出来，逻辑一行未改。
 */
function mountTerminalGate(screen) {
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
