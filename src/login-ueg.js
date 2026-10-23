/**
 * UEG 档：三幕登入动画（自包含的一页，由宿主以同源 iframe 提供 /ueg/）。
 *
 * 这一段原来塞在 mountLoginGate 里，跟终端档共用同一个 450 行的闭包 ——
 * 但两条路没有任何共享状态：UEG 这边只有一个 iframe 加几个 postMessage，
 * 终端档那边是五步时间轴加语音时序。拆开是纯搬家，收益是可读性。
 *
 * 与父页的三条约定（改动时三条都要一起看）：
 *   ① 头像/二维码绝不放进 query：base64 会把 URL 撑爆（实测 431），改由 postMessage 递
 *   ② iframe load 之后才撤退宿主黑帧：早撤会露出 DSH 原生加载卡
 *   ③ 收场时【不】清空 liveLogin：清了会让下一次相位钩子再挂一个 iframe，动画从头重播
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】—— 那会把外层字符串当场撕开。
 */

/** 挂 UEG 三幕动画。返回 disposer 记录；已挂过时由调用方负责先收旧。 */
function mountUegCinema() {
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
  // 把设置里的 DIY 项与配音一起带进动画页：姓名、男声/女声、或关闭配音。
  // 头像不在这里 —— 见下面那条注释。
  const params = new URLSearchParams()
  const operator = readLoginPref(LOGIN_USER_KEY, '')
  const voiceChoice = readLoginPref(LOGIN_VOICE_KEY, 'off')
  if (operator !== '') params.set('name', operator)
  // 头像【绝不放进 query】：base64 太长会把 URL 撑爆 —— 实测直接 431（请求头过大），
  // iframe 就加载失败，表现正是"进得去网页、打不开 DSH"。
  // 动画页改成自己从 localStorage 读那张图（同源，读得到）；桌面端读不到时由 postMessage 递。
  for (const [key] of LOGIN_CARD_KEYS) {
    const value = readLoginPref(LOGIN_CARD_KEY(key), '')
    if (value !== '') params.set(key, value)
  }
  if (readLoginPref(LOGIN_AUTOPLAY_KEY, 'on') === 'off') params.set('auto', '0')
  if (voiceChoice === 'off') params.set('audio', '0')
  else params.set('voice', voiceChoice)
  inner.src = '/ueg/' + (params.size === 0 ? '' : '?' + params.toString())
  // 动画页画出来之后再撤退宿主的首帧黑帧 —— 这样从开机到 UEG 第一帧没有空档。
  inner.addEventListener('load', () => {
    // 头像主动推一次：桌面端 iframe 读不到 localStorage（主窗口被宿主代理接管了），
    // 只能由父页递进去；iframe 自己也会发 ueg:need-photo 来要，两条路都通。
    try {
      const photoNow = readLoginPref(LOGIN_PHOTO_KEY, '')
      if (photoNow !== '') inner.contentWindow.postMessage({ type: 'ueg:photo', photo: photoNow }, '*')
      // 二维码同理：动画页自己会读 localStorage，但桌面端 iframe 读不到代理层，
      // 所以父页主动递一次；动画页发 ueg:need-qr 时再补一次。
      const qrNow = readLoginPref(LOGIN_QR_KEY, '')
      if (qrNow !== '') inner.contentWindow.postMessage({ type: 'ueg:qr', qr: qrNow }, '*')
    } catch (error) {
      /* 窗口还没就绪，等它来要 */
    }
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
      try {
        captionDispose()
      } catch (error) {
        /* 已经收掉了 */
      }
      captionDispose = null
    }
    window.removeEventListener('message', onMessage)
    frame.style.opacity = '0'
    window.setTimeout(() => frame.remove(), 700)
    // 这里【刻意不清空 liveLogin】，理由见文件头第 ③ 条。
  }

  const onMessage = (event) => {
    if (event.source !== inner.contentWindow) return
    if (event.data === 'ueg:done') {
      dismiss()
      return
    }
    // 桌面端（DSH Desktop）把主窗口的 localStorage 换成了宿主存储代理，
    // iframe 是独立 realm，拿不到那层覆写 —— 读原生存储是空的，头像就永远是占位符。
    // 所以头像既不塞 URL（base64 会撞 431），也不指望 localStorage，改由这里递进去。
    if (event.data === 'ueg:need-qr') {
      let qrPayload = ''
      try {
        qrPayload = readLoginPref(LOGIN_QR_KEY, '')
      } catch (error) {
        qrPayload = ''
      }
      try {
        inner.contentWindow.postMessage({ type: 'ueg:qr', qr: qrPayload }, '*')
      } catch (error) {
        /* 窗口已关闭 */
      }
      return
    }
    if (event.data === 'ueg:need-photo') {
      let photo = ''
      try {
        photo = readLoginPref(LOGIN_PHOTO_KEY, '')
      } catch (error) {
        photo = ''
      }
      if (photo !== '') {
        try {
          inner.contentWindow.postMessage({ type: 'ueg:photo', photo: photo }, '*')
        } catch (error) {
          /* 窗口已关闭 */
        }
      }
    }
  }

  const record = { dispose: dismiss, dismiss: dismiss }
  window.addEventListener('message', onMessage)
  liveLogin = record
  return record
}
