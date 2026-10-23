/**
 * The login / access-authorization phase — the middle act of this plugin.
 *
 *   boot (src/show.js)  →  LOGIN (this file)  →  the real UI
 *
 * Two themes share one timeline:
 *
 *   ueg   — UEG 联合政府：暖白、全息、官样文书
 *   550c  — 550C 控制终端：磷光 CRT；配色跟随设置里已选的磷光方案
 *
 * MOTION, not slides. The first version swapped text and called it a login; it read
 * as a slide deck because nothing moved. The animation vocabulary here is ported
 * from `6shenhonghong9/dsh-startup-screen` (MIT © 沈宏宏) — see CREDITS.md:
 *
 *   over-exposure wash   the screen blows out to white, then settles on the board
 *   letter-spacing draw  the title tightens as it fades in, with a light sweep
 *   clip-path wipes      every line is wiped on, left to right or top to bottom
 *   bloom + streak       a ring blooms and a streak crosses on each step change
 *   scan line            a thin bright line sweeps the whole screen, always running
 *   stroke-draw mark     the emblem is an SVG path drawn by stroke-dashoffset
 *   chromatic glitch     the finale duplicates the text twice, blurs 0.5px and
 *                        slices it with clip-path in steps(3) — so it reads as a
 *                        lens aberration rather than three copies of a word
 *
 * The acts are driven by CLASSES and every animation is declared in CSS. That is the
 * whole trick: JS decides *when*, CSS decides *how*, and nothing is a hard cut.
 *
 * No bundled media: TTS for speech, WebAudio for the blips.
 */

const LOGIN_KEY = 'dsh-550c-boot:login'

/* 界面档位白名单：读/写都会拿它归一化 —— 少了它，读写都会抛错并被 catch 吞掉，
   表现就是「点 UEG 高亮不动」。550C 那一档已删，只剩关闭 / UEG。 */
const LOGIN_VALUES = ['off', 'ueg']
/* 配音：关闭 / 女声 / 男声 —— 映射到 UEG 动画页的 ?voice= 与 ?audio=0 */
const LOGIN_VOICES = [
  { id: 'off', label: '关闭' },
  { id: 'female', label: '女声 · 开发中' },
  { id: 'male', label: '男声' },
]
const LOGIN_VOICE_KEY = 'dsh-550c-boot:login-voice'
/* 自动播放：由用户决定要不要自动进入第二幕（默认开） */
const LOGIN_AUTOPLAY_KEY = 'dsh-550c-boot:login-autoplay'
const LOGIN_AUTOPLAYS = [
  { id: 'on', label: '自动' },
  { id: 'off', label: '手动' },
]
const LOGIN_PHOTO_KEY = 'dsh-550c-boot:login-photo'
// 身份卡二维码：存的是【位矩阵载荷】（模块数:base64 的位），不是图片。
// 这样一是不占空间（25x25 只有 110 个字符），二是动画页不用带编码器。
const LOGIN_QR_KEY = 'dsh-550c-boot:login-qr'
const LOGIN_QR_TEXT_KEY = 'dsh-550c-boot:login-qr-text'
/* 身份卡上还能 DIY 的字段：[参数名, 标签, 默认值] */
const LOGIN_CARD_KEYS = [
  ['en', '英文名 / 拼音', ''],
  ['post', '职务 / 所属单位', ''],
  ['level', '授权等级', 'LEVEL 3 · 生活区通行'],
  ['issuer', '签发机构', 'UEG 联合政府 · 身份管理局'],
  ['valid', '有效期', '本次会话 · 随登出失效'],
  ['scope', '许可范围', '550C 终端 · 只读查询'],
  ['bio', '生物特征', '虹膜 · 指纹'],
]
const LOGIN_CARD_KEY = (name) => 'dsh-550c-boot:login-card:' + name   // 模板字符串不能用：build 会把 src/*.js 插进模板字符串
const LOGIN_USER_KEY = 'dsh-550c-boot:login-user'
const LOGIN_SPEED_KEY = 'dsh-550c-boot:login-speed'
const LOGIN_DONE_EVENT = 'dsh550c:login-done'
const LOGIN_SHEET_ID = 'dsh-550c-boot-login-sheet'

/** Per-step ceiling when there is no voice to wait for. */
const LOGIN_STEP_MS = { slow: 3400, normal: 2200, fast: 1200 }
/** How long the wash holds before the board wipes on. */
const WASH_MS = { slow: 1500, normal: 1100, fast: 750 }

const LOGIN_SPEEDS = [
  { id: 'slow', label: '慢' },
  { id: 'normal', label: '标准' },
  { id: 'fast', label: '快' },
]

/** The four phosphor schemes, mirroring the splash so the two read as one machine. */
const LOGIN_SCHEMES = {
  amber: { ink: '#e8a020', dim: '#8a6a24', bg: '#050403', deep: '#0b0906' },
  green: { ink: '#3ddc84', dim: '#25764a', bg: '#030604', deep: '#08120c' },
  cyan: { ink: '#3fd8e0', dim: '#1f6f76', bg: '#020607', deep: '#07131a' },
  white: { ink: '#e8eef4', dim: '#8b98a6', bg: '#04050a', deep: '#0b0f18' },
}

/** An abstract emblem, drawn as one continuous path so it can be stroke-drawn. */
const EMBLEM_PATH =
  'M32 4 L58 18 L58 46 L32 60 L6 46 L6 18 Z M32 14 L18 22 L18 42 L32 50 L46 42 L46 22 Z M32 24 L32 40 M24 32 L40 32'


function readLoginScreen() {
  try {
    const raw = window.localStorage.getItem(LOGIN_KEY)
    return LOGIN_VALUES.includes(raw) ? raw : 'off'
  } catch {
    return 'off'
  }
}

function writeLoginScreen(screen) {
  try {
    window.localStorage.setItem(LOGIN_KEY, LOGIN_VALUES.includes(screen) ? screen : 'off')
  } catch {
    /* private mode */
  }
}

function readLoginPref(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null || raw === '' ? fallback : raw
  } catch {
    return fallback
  }
}

function writeLoginPref(key, value) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    /* private mode */
  }
}

function loginTheme(id, schemeId) {
  const theme = LOGIN_THEMES.find((candidate) => candidate.id === id) ?? LOGIN_THEMES[0]
  if (theme.id !== '550c') return theme
  const scheme = LOGIN_SCHEMES[schemeId] ?? LOGIN_SCHEMES.amber
  return {
    ...theme,
    vars: {
      ...theme.vars,
      '--bg': scheme.bg,
      '--bg-deep': scheme.deep,
      '--ink': scheme.ink,
      '--ink-dim': scheme.dim,
      '--accent': scheme.ink,
      '--line': scheme.ink + '47',
      '--glow': scheme.ink + '73',
    },
  }
}

function ensureLoginSheet() {
  if (document.getElementById(LOGIN_SHEET_ID) !== null) return
  const style = document.createElement('style')
  style.id = LOGIN_SHEET_ID
  style.textContent = [
    'body>.dsh550c-login{position:fixed !important;inset:0 !important;z-index:2147483085 !important;',
    'background:var(--bg,#050403) !important;pointer-events:auto !important;opacity:1;',
    'transition:opacity 420ms cubic-bezier(.4,0,.2,1)}',
    'body>.dsh550c-login.dsh550c-login-out{opacity:0;pointer-events:none !important}',
    '@media (prefers-reduced-motion: reduce){body>.dsh550c-login{transition:none}}',
  ].join('')
  document.head.appendChild(style)
}


let liveLogin = null
// 登录相位只走一次。splash 被摘掉或重复触发时，UEG 否则会一遍遍重播，
// 表现就是进不去对话界面、动画循环播放。
let loginPhaseDone = false

/**
 * Mount the login phase. Returns a disposer, or null when it is switched off.
 * `force` is what the settings preview button uses.
 */

/** The settings row: which login screen, speed, operator name and a preview. */
/**
 * 「550C」设置页的外壳：这个系列（boot / skin / …）共用同一个入口。
 * 页与子插槽都由本插件声明，所以 skin 没装 / 被关掉时，boot 的设置行照样在。
 * skin 也注册同一个 id（550c）—— 插槽按 id 唯一，同时在场也只会有一个标签。
 */
/** 页面顶部可选的分组：以后再加启动动画，就往这里加一项 + 一个插槽。 */


/**
 * jsQR 的多尺度重试目标（长边像素）。
 *
 * 为什么要试这么多档：同一张微信二维码，原尺寸（968×1433）解不出，
 * 缩到约 900px 才成功；太小的图又需要放大。命中即止，最后再补一次原尺寸。
 * 删档之前先拿真图各试一遍 —— 这几个数是实测出来的，不是凑的。
 */
const QR_DECODE_TARGETS = [900, 700, 1100, 1400]

/** 头像控件插在哪个字段之后（保持原来的视觉顺序：姓名 → 拼音 → 职务 → 头像）。 */
const CARD_PHOTO_AFTER = 'post'

/**
 * 从一张图片里识别二维码。**不碰组件状态**：输入 File，返回结果。
 *
 * 抽出来的原因：多尺度重试是本文件最值得单测的一段逻辑
 * （同一张微信二维码，原尺寸解不出、缩到约 900px 才成功），
 * 而它原来内联在 LoginRow 里，只能靠手点界面验。
 *
 * @returns Promise<{ ok: true, text: string } | { ok: false, reason: string }>
 */
async function decodeQrImage(file) {
  try {
    if (typeof window.jsQR !== 'function') await loadQrScript('jsqr.js')
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
    const image = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = dataUrl
    })
    // jsQR 对图片尺寸很敏感：按几个不同的长边尺寸各试一次，命中即止；都不行再提示。
    const longSide = Math.max(image.width, image.height)
    const targets = QR_DECODE_TARGETS.concat([longSide])
    for (const target of targets) {
      const scale = Math.min(3, target / longSide)
      const w = Math.max(1, Math.round(image.width * scale))
      const h = Math.max(1, Math.round(image.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, w, h)
      const pixels = context.getImageData(0, 0, w, h)
      let result = null
      try {
        result = window.jsQR(pixels.data, w, h, { inversionAttempts: 'attemptBoth' })
      } catch (error) {
        result = null
      }
      if (result !== null && result.data) return { ok: true, text: result.data }
    }
    return { ok: false, reason: '没识别出二维码，换一张清晰、四周留白的图试试' }
  } catch (error) {
    return { ok: false, reason: '识别失败：' + error.message }
  }
}

/** 把一张文本编码成位矩阵载荷（模块数:base64 的位），存进 localStorage 而不是存图片。 */
function makeQrPayload(text) {
  const qr = window.qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const count = qr.getModuleCount()
  const bytes = new Uint8Array(Math.ceil((count * count) / 8))
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (!qr.isDark(y, x)) continue
      const index = y * count + x
      bytes[index >> 3] |= 1 << (7 - (index & 7))
    }
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return count + ':' + window.btoa(binary)
}

/**
 * 「登录授权界面」设置行。
 *
 * 原来是一个 340 行的函数：三组胶囊、二维码（生成 / 清除 / 识别）、七个卡片字段、
 * 头像，全挤在一起。现在拆成外壳 + 五个子组件：
 *
 *   LoginRow        外壳：三组档位与头像的状态、拼装
 *   ScreenModeRow   关闭 / UEG
 *   AutoplayRow     自动 / 手动
 *   VoiceRow        关闭 / 女声（开发中）/ 男声
 *   QrRow           二维码：生成 / 清除 / 选图识别（状态自带，外壳不需要知道）
 *   CardFields      姓名 + 七个卡片字段 + 头像 + 预览按钮
 *
 * 规矩同 music：子组件不各自读存储，值由外壳下发、写入由外壳的回调完成。
 */
function LoginRow() {
  const [screen, setScreen] = React.useState(readLoginScreen)
  const [user, setUser] = React.useState(() => readLoginPref(LOGIN_USER_KEY, ''))
  const [voice, setVoice] = React.useState(() => readLoginPref(LOGIN_VOICE_KEY, 'off'))
  const [photo, setPhoto] = React.useState(() => readLoginPref(LOGIN_PHOTO_KEY, ''))
  const [autoplay, setAutoplay] = React.useState(() => readLoginPref(LOGIN_AUTOPLAY_KEY, 'on'))

  const choose = (next) => {
    writeLoginScreen(next)
    setScreen(readLoginScreen())
  }
  const chooseAutoplay = (next) => {
    writeLoginPref(LOGIN_AUTOPLAY_KEY, next)
    setAutoplay(next)
  }
  const chooseVoice = (next) => {
    writeLoginPref(LOGIN_VOICE_KEY, next)
    setVoice(next)
  }

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '登录授权界面'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        '片头之后先走一段访问授权：过曝洗白 → 底板擦出 → 五步授权 → 色散揭幕；点击或 Enter 推进，Esc 跳过。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl', style: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'flex-start', width: '100%', rowGap: '12px', maxWidth: '780px' } },
      React.createElement(ScreenModeRow, { screen: screen, onChoose: choose }),
      React.createElement(AutoplayRow, { autoplay: autoplay, onChoose: chooseAutoplay }),
      React.createElement(VoiceRow, { voice: voice, onChoose: chooseVoice }),
      React.createElement(QrRow),
      React.createElement(CardFields, {
        user: user,
        onUser: setUser,
        photo: photo,
        onPhoto: setPhoto,
        onPreview: () => mountLoginGate(screen === 'off' ? 'ueg' : screen),
      }),
    ),
  )
}

/** 档位胶囊：关闭 / UEG（550C 那一档已删，LOGIN_THEMES 里仍留着主题定义）。 */
function ScreenModeRow(props) {
  const options = [
    { value: 'off', label: '关闭' },
    ...LOGIN_THEMES.filter((theme) => theme.id !== '550c').map((theme) => ({ value: theme.id, label: theme.label.split(' ')[0] })),
  ]
  return React.createElement(
    'div',
    { className: 'dsh550c-seg' },
    options.map((option) =>
      React.createElement(
        'button',
        {
          key: option.value,
          type: 'button',
          className: props.screen === option.value ? 'on' : '',
          // 不禁用，只在该拦的时候拦 —— 禁用会让「当前档位明明是关闭」的人也点不动这一档。
          onClick: () => props.onChoose(option.value),
        },
        option.label,
      ),
    ),
  )
}

/** 自动播放：自动 / 手动 —— 有人不想点第一幕那个按钮，这个开关交给他决定。 */
function AutoplayRow(props) {
  return React.createElement(
    'div',
    { className: 'dsh550c-seg' },
    LOGIN_AUTOPLAYS.map((option) =>
      React.createElement(
        'button',
        {
          key: option.id,
          type: 'button',
          className: props.autoplay === option.id ? 'on' : '',
          onClick: () => props.onChoose(option.id),
        },
        option.label,
      ),
    ),
  )
}

/** 配音：关闭 / 女声（开发中）/ 男声。 */
function VoiceRow(props) {
  return React.createElement(
    'div',
    { className: 'dsh550c-seg' },
    LOGIN_VOICES.map((option) =>
      React.createElement(
        'button',
        {
          key: option.id,
          type: 'button',
          className: props.voice === option.id ? 'on' : '',
          onClick: () => {
            if (option.id === 'female') {
              window.alert('女声还在开发中，敬请期待')
              return
            }
            props.onChoose(option.id)
          },
        },
        option.label,
      ),
    ),
  )
}

/**
 * 身份卡二维码：填内容 → 本机编码成位矩阵；也可以选一张现成的二维码图片本机识别。
 * 两条路都不联网。状态是这一块自己的 —— 外壳不需要知道用户在输入什么。
 */
function QrRow() {
  const [text, setText] = React.useState(() => readLoginPref(LOGIN_QR_TEXT_KEY, ''))
  const [status, setStatus] = React.useState(() => {
    const saved = readLoginPref(LOGIN_QR_KEY, '')
    return saved === '' ? '未设置 · 用证件编号生成装饰点阵' : '已设置 · ' + saved.split(':')[0] + '×' + saved.split(':')[0]
  })

  const apply = async () => {
    const next = text.trim()
    if (next === '') {
      writeLoginPref(LOGIN_QR_KEY, '')
      writeLoginPref(LOGIN_QR_TEXT_KEY, '')
      setStatus('未设置：用证件编号生成的装饰点阵')
      return
    }
    if (next.length > 400) {
      window.alert('内容太长了，二维码会太密扫不出，建议 80 个字符以内')
      return
    }
    setStatus('正在生成…')
    try {
      if (typeof window.qrcode !== 'function') await loadQrScript('qrcode-gen.js')
      const payload = makeQrPayload(next)
      writeLoginPref(LOGIN_QR_KEY, payload)
      writeLoginPref(LOGIN_QR_TEXT_KEY, next)
      const count = payload.split(':')[0]
      setStatus('已生成 ' + count + 'x' + count + '，共 ' + text.length + ' 个字符')
    } catch (error) {
      setStatus('生成失败：' + error.message)
    }
  }

  const clear = () => {
    writeLoginPref(LOGIN_QR_KEY, '')
    writeLoginPref(LOGIN_QR_TEXT_KEY, '')
    setText('')
    setStatus('未设置：用证件编号生成的装饰点阵')
  }

  const pickImage = async (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    setStatus('正在识别图片…')
    const result = await decodeQrImage(file)
    if (!result.ok) {
      setStatus(result.reason)
      return
    }
    setText(result.text)
    setStatus('识别成功，点「生成」生效')
  }

  return React.createElement(
    'div',
    { className: 'dsh550c-row', style: { flexBasis: '100%', borderTop: '1px solid rgba(127,127,127,.14)', marginTop: '6px', paddingTop: '12px' } },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('b', { style: { display: 'block', fontSize: '13px', fontWeight: 600 } }, '身份卡二维码'),
      React.createElement('span', { style: { display: 'block', marginTop: '2px', fontSize: '11.5px', lineHeight: '1.5', opacity: 0.62 } }, status),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl', style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', flex: '1 1 320px', minWidth: 0 } },
      React.createElement('input', {
        className: 'dsh550c-input',
        style: { flex: '1 1 220px', minWidth: 0 },
        type: 'text',
        value: text,
        placeholder: '链接 / 文本，留空＝默认装饰码',
        onChange: (event) => setText(event.target.value),
      }),
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        React.createElement('button', { type: 'button', onClick: () => { apply() } }, '生成'),
        React.createElement('button', { type: 'button', onClick: clear }, '清除'),
      ),
      React.createElement('input', {
        className: 'dsh550c-input',
        type: 'file',
        accept: 'image/*',
        title: '选一张二维码图片，本地识别出内容',
        onChange: pickImage,
      }),
    ),
  )
}

/**
 * 身份卡字段：姓名 + LOGIN_CARD_KEYS 里的七项 + 头像 + 预览。
 *
 * 七个 input 原来各手写一遍（占位文字、存储键、写回逻辑各抄一次），
 * 而 LOGIN_CARD_KEYS 早就把键与标签列好了却没人用 —— 现在由它驱动渲染，
 * 加字段只改常量，不再改这一段 JSX。
 */
function CardFields(props) {
  const children = []

  children.push(
    React.createElement('input', {
      key: 'name',
      className: 'dsh550c-input',
      type: 'text',
      placeholder: '操作员姓名',
      value: props.user,
      onChange: (event) => {
        props.onUser(event.target.value)
        writeLoginPref(LOGIN_USER_KEY, event.target.value)
      },
    }),
  )

  const photoPicked = (event) => {
    const file = event.target.files && event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        // 缩到 256px 再存 data URL：localStorage 装得下，也不必把长 base64 塞进 iframe 的 query。
        const side = 256
        const canvas = document.createElement('canvas')
        canvas.width = side
        canvas.height = side
        const context = canvas.getContext('2d')
        const scale = Math.max(side / image.width, side / image.height)
        const w = image.width * scale
        const h = image.height * scale
        context.drawImage(image, (side - w) / 2, (side - h) / 2, w, h)
        try {
          const data = canvas.toDataURL('image/jpeg', 0.85)
          writeLoginPref(LOGIN_PHOTO_KEY, data)
          props.onPhoto(data)
        } catch (error) {
          /* 取图失败就不改 */
        }
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  for (const field of LOGIN_CARD_KEYS) {
    const name = field[0]
    children.push(
      React.createElement('input', {
        key: name,
        className: 'dsh550c-input',
        type: 'text',
        placeholder: field[1],
        defaultValue: readLoginPref(LOGIN_CARD_KEY(name), ''),
        onChange: (event) => writeLoginPref(LOGIN_CARD_KEY(name), event.target.value),
      }),
    )
    // 头像保持在原来的位置（职务之后），不挪到字段末尾。
    if (name === CARD_PHOTO_AFTER) {
      children.push(
        React.createElement('input', {
          key: 'photo-file',
          className: 'dsh550c-input',
          type: 'file',
          accept: 'image/*',
          onChange: photoPicked,
        }),
      )
      if (props.photo !== '') {
        children.push(
          React.createElement('img', {
            key: 'photo-preview',
            src: props.photo,
            alt: '头像预览',
            style: { width: '32px', height: '32px', objectFit: 'cover', borderRadius: '3px', border: '1px solid rgba(255,255,255,.3)' },
          }),
        )
      }
    }
  }

  children.push(
    React.createElement('button', { key: 'preview', type: 'button', className: 'dsh550c-preview', onClick: props.onPreview }, '预览'),
  )

  return React.createElement('div', { className: 'dsh550c-card-fields' }, children)
}

/**
 * The phase hook the splash calls when it has finished fading out: this is what
 * keeps the two acts from overlapping. Safe to call when nothing is enabled.
 */
function startLoginPhase() {
  if (loginPhaseDone) return
  loginPhaseDone = true
  if (liveLogin !== null) return
  mountLoginGate(null)
  document.dispatchEvent(new CustomEvent('dsh550c:boot-done'))
}
