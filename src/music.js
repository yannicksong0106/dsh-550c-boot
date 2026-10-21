/**
 * 开机音乐：本地曲库 + 片头配乐。
 *
 * 两块东西：
 *
 *   曲库   把用户自己的音频文件原样存进 localStorage（不转码、不裁剪、不降采样），
 *          设置页里可以试听、改名、删除、选一首作为开机曲目。
 *   配乐   550C 片头播放时同时放这首曲子。片头先结束就渐弱淡出，
 *          曲子先结束就短促地淡一下再停 —— 谁先到谁触发，两边都不硬切。
 *
 * 为什么原样存字节：转码要引依赖（这个仓库刻意零依赖），降采样会丢音质。
 * 存不下就明确拒绝，是这里唯一诚实的做法。
 *
 * 容量是硬约束，而且比看上去紧：实测 Chrome 的 localStorage 配额是
 * 5,177,344 个字符（QuotaExceededError 出现在第 79 个 64KB 块），也就是 9.88MiB
 * 的 UTF-16 —— 配额是按【字符】算的，一个字符占两个字节。
 * 曲库里存的是 base64 字符串，3 个原始字节编成 4 个字符，落到存储里是 8 个字节，
 * 所以真实膨胀是 8/3 字节/原始字节，不是想当然的 4/3。
 * 曲库总上限因此取 3MB：放大后是 4M 个字符（8MB 的 UTF-16），
 * 给 DSH 自己和同源的其它插件留 1M 多个字符。
 * （早先按 4/3 取过 6MB —— 那要 8M 字符 = 16MB UTF-16，早就越过配额了，
 *  结果是浏览器先抛 QuotaExceededError，"曲库已满，请先删除一首"永远轮不到说。）
 * 单曲上限 3MB：15 秒 44.1k 立体声 WAV 是 2.65MB，这个数覆盖所有格式的推荐时长。
 *
 * 只配 550C 片头，不配 UEG 登录界面 —— UEG 自带男声配音，两个一起响会撞。
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】。
 */

/* 存储键：索引、音频字节、当前曲目、开关、音量、淡出时长。 */
const BGM_INDEX_KEY = 'dsh-550c-boot:bgm:index'
const BGM_DATA_KEY = 'dsh-550c-boot:bgm:data:'
const BGM_CURRENT_KEY = 'dsh-550c-boot:bgm:current'
const BGM_ENABLED_KEY = 'dsh-550c-boot:bgm:enabled'
const BGM_VOLUME_KEY = 'dsh-550c-boot:bgm:volume'
const BGM_FADE_KEY = 'dsh-550c-boot:bgm:fade'

/** 单曲上限 3MB（原始字节，不含 base64 放大）。 */
const BGM_SINGLE_MAX_BYTES = 3686 * 1024
/**
 * 曲库总上限 3MB（原始字节）。
 *
 * 这里不是"想当然"的数：localStorage 里放的是 base64 字符串，而字符串在
 * 存储里是 UTF-16 —— 一个字符两个字节。所以 3MB 原始音频要占 4M 个字符、
 * 8MB 的 UTF-16 空间。
 *
 * 实测 Chrome 的配额是 5,177,344 个字符（79 个 64KB 块，正好 9.88 MiB 的
 * UTF-16），本插件用掉 4M 个字符，给 DSH 自己和同源的其它插件留 1M 多个
 * 字符（约 2MB）。
 *
 * 早先按"base64 只膨胀 4/3 字节"取过 6MB：6MB 原始音频要 8M 字符 = 16MB 的
 * UTF-16，远超 10 MiB 配额 —— 结果是浏览器先抛 QuotaExceededError，
 * "曲库已满，请先删除一首"那句话永远轮不到说。3MB 才是能真正触发上限的值。
 */
const BGM_TOTAL_MAX_BYTES = 3686 * 1024
/** 默认音量 0.6。 */
const BGM_DEFAULT_VOLUME = 0.6
/** 默认淡出时长 1500ms。 */
const BGM_DEFAULT_FADE_MS = 1500
/** 曲子先播完时的短淡出：直接切会爆音。 */
const BGM_END_FADE_MS = 400
/** 淡出时长的可调范围（毫秒）。 */
const BGM_FADE_MIN_MS = 300
const BGM_FADE_MAX_MS = 4000

/** MIME → 人话标签，错误提示里用。 */
const BGM_FORMAT_LABELS = {
  'audio/mpeg': 'MP3',
  'audio/wav': 'WAV',
  'audio/ogg': 'OGG',
  'audio/ogg;codecs=opus': 'Opus',
  'audio/flac': 'FLAC',
  'audio/mp4': 'M4A',
  'audio/aac': 'AAC',
  'audio/webm': 'WebM',
  'audio/aiff': 'AIFF',
}

/**
 * 魔数嗅探：不信扩展名，也不信 file.type（用户从别处拷来的文件常带错类型）。
 *
 * 映射表（实测 10 个真实 wav + 8 个合成文件头全部正确）：
 *   RIFF....WAVE → audio/wav
 *   OggS         → audio/ogg
 *   fLaC         → audio/flac
 *   ftyp（偏移 4）→ audio/mp4
 *   ID3          → audio/mpeg
 *   FF Ex        → audio/mpeg
 *   1A 45 DF A3  → audio/webm
 *   FORM....AIFF → audio/aiff
 *
 * Ogg 有两个候选（audio/ogg 与 audio/ogg;codecs=opus），取环境支持得更好的那个：
 * MIME 字符串本身很敏感 —— audio/opus → no，audio/ogg;codecs=opus → probably。
 *
 * @param bytes   文件头（至少 12 字节）
 * @param canPlay 可选的 canPlayType 探针；没有它时 Ogg 一律按 audio/ogg 处理
 * @returns 规范 MIME，识别不出来时是 null
 */
function sniffAudioMime(bytes, canPlay) {
  const probe = typeof canPlay === 'function' ? canPlay : () => ''
  const at = (offset, text) => {
    if (bytes.length < offset + text.length) return false
    for (let i = 0; i < text.length; i += 1) {
      if (bytes[offset + i] !== text.charCodeAt(i)) return false
    }
    return true
  }
  const rank = (mime) => {
    const answer = probe(mime)
    if (answer === 'probably') return 2
    if (answer === 'maybe') return 1
    if (answer === 'no') return -1
    return 0
  }
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'audio/wav'
  if (at(0, 'OggS')) {
    const plain = rank('audio/ogg')
    const opus = rank('audio/ogg;codecs=opus')
    return opus > plain ? 'audio/ogg;codecs=opus' : 'audio/ogg'
  }
  if (at(0, 'fLaC')) return 'audio/flac'
  // ftyp 在偏移 4（ISO BMFF 的固定位置），后面的品牌字节是什么都算 MP4 家族。
  if (at(4, 'ftyp')) return 'audio/mp4'
  if (at(0, 'ID3')) return 'audio/mpeg'
  // MP3 帧头：0xFF 后面那字节的高 3 位是同步位。
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  // WebM / Matroska 的 EBML 头。
  if (at(0, '\x1a\x45\xdf\xa3')) return 'audio/webm'
  if (at(0, 'FORM') && at(8, 'AIFF')) return 'audio/aiff'
  return null
}

/**
 * canPlayType 探针：复用一个 audio 元素，别每次都新建。
 *
 * 返回值按规范只有三种：'probably' / 'maybe' / ''（空串 = 不支持）。
 * 实测 Chrome 对 audio/aiff 返回的是空串而不是 'no' —— 只认 'no' 的写法
 * 会把 AIFF 放过去，拖到解码那一步才炸，提示就变成"无法解码"而不是人话。
 * 探针自己坏掉时返回 null：那说明我们不知道，别替用户做决定。
 */
let bgmProbeAudio = null

function bgmCanPlayType(mime) {
  try {
    if (bgmProbeAudio === null) bgmProbeAudio = document.createElement('audio')
    return bgmProbeAudio.canPlayType(mime)
  } catch (error) {
    return null
  }
}

/** 读曲库索引。存储被外部改坏时返回空数组，不往上抛。 */
function readBgmIndex() {
  try {
    const raw = window.localStorage.getItem(BGM_INDEX_KEY)
    if (raw === null || raw === '') return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => item !== null && typeof item === 'object' && typeof item.id === 'string')
  } catch (error) {
    console.error('[dsh-550c-boot] 曲库索引读不出来', error)
    return []
  }
}

function writeBgmIndex(index) {
  try {
    window.localStorage.setItem(BGM_INDEX_KEY, JSON.stringify(index))
    return true
  } catch (error) {
    console.error('[dsh-550c-boot] 曲库索引写不进去', error)
    return false
  }
}

function readBgmCurrent() {
  try {
    const raw = window.localStorage.getItem(BGM_CURRENT_KEY)
    return raw === null ? '' : raw
  } catch (error) {
    return ''
  }
}

function writeBgmCurrent(id) {
  try {
    window.localStorage.setItem(BGM_CURRENT_KEY, id)
  } catch (error) {
    /* private mode: 选中的曲目不持久 */
  }
}

function readBgmEnabled() {
  try {
    return window.localStorage.getItem(BGM_ENABLED_KEY) === '1'
  } catch (error) {
    return false
  }
}

function writeBgmEnabled(on) {
  try {
    window.localStorage.setItem(BGM_ENABLED_KEY, on ? '1' : '0')
  } catch (error) {
    /* private mode */
  }
}

/** 读音量。空值走默认值 —— Number(null) 是 0，不能直接当音量用。 */
function readBgmVolume() {
  try {
    const raw = window.localStorage.getItem(BGM_VOLUME_KEY)
    if (raw === null || raw === '') return BGM_DEFAULT_VOLUME
    const value = Number(raw)
    if (!Number.isFinite(value)) return BGM_DEFAULT_VOLUME
    return Math.min(1, Math.max(0, value))
  } catch (error) {
    return BGM_DEFAULT_VOLUME
  }
}

function writeBgmVolume(value) {
  try {
    window.localStorage.setItem(BGM_VOLUME_KEY, String(value))
  } catch (error) {
    /* private mode */
  }
}

/** 读淡出时长（毫秒）。 */
function readBgmFade() {
  try {
    const raw = window.localStorage.getItem(BGM_FADE_KEY)
    if (raw === null || raw === '') return BGM_DEFAULT_FADE_MS
    const value = Number(raw)
    if (!Number.isFinite(value)) return BGM_DEFAULT_FADE_MS
    // 单位兼容：滑块存的是【秒】（0.5–4），老版本存的是【毫秒】（500–4000）。
    // <=10 一律当秒处理，否则 4 会被当成 4 毫秒 —— 那就是"瞬间静音"，
    // 表现上就是"没有任何淡出"✗（这就是之前一直查不出来的原因）
    const ms = value > 0 && value <= 10 ? value * 1000 : value
    if (ms <= 0) return BGM_DEFAULT_FADE_MS
    return Math.min(BGM_FADE_MAX_MS, Math.max(BGM_FADE_MIN_MS, ms))
  } catch (error) {
    return BGM_DEFAULT_FADE_MS
  }
}

function writeBgmFade(value) {
  try {
    // 写入端也做单位归一：滑块的秒值（0.5–4）先乘 1000 再落库，
    // 否则存的 "4" 会被读端当成 4 毫秒 → 瞬间静音 ✗
    const raw = Number(value)
    const ms = Number.isFinite(raw) && raw > 0 && raw <= 10 ? raw * 1000 : raw
    const safe = Math.min(BGM_FADE_MAX_MS, Math.max(BGM_FADE_MIN_MS, Number.isFinite(ms) ? ms : BGM_DEFAULT_FADE_MS))
    window.localStorage.setItem(BGM_FADE_KEY, String(safe))
  } catch (error) {
    console.error('[dsh-550c-boot] 淡出时长写入失败', error)
  }
}

/** Uint8Array → base64。btoa 只吃 latin1，所以先转成二进制字符串。 */
function bytesToBase64(bytes) {
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step))
  }
  return window.btoa(binary)
}

/** base64 → Uint8Array。 */
function base64ToBytes(text) {
  const binary = window.atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 读单曲的原始字节；取不到返回 null（存储被外部改坏过）。 */
function readBgmBytes(id) {
  try {
    const raw = window.localStorage.getItem(BGM_DATA_KEY + id)
    if (raw === null || raw === '') return null
    return base64ToBytes(raw)
  } catch (error) {
    console.error('[dsh-550c-boot] 曲目数据读不出来', error)
    return null
  }
}

/** 秒 → m:ss。 */
function formatBgmDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return String(minutes) + ':' + (rest < 10 ? '0' : '') + String(rest)
}

/** 字节 → MB（一位小数）。 */
function formatBgmSize(bytes) {
  return (Math.max(0, Number(bytes) || 0) / 1024 / 1024).toFixed(1)
}

/**
 * 真实解码验证：建一个 blob URL 让 <audio> 读一次 metadata。
 *
 * 能读出时长才算这个文件真的能被环境解出来 —— 光看魔数不够，
 * 一个套着 WAV 头、内容却是垃圾的假文件在这一步会被拦下。
 *
 * @returns 时长（秒），解不出来时是 null
 */
function probeBgmDuration(bytes, mime) {
  return new Promise((resolve) => {
    let url = null
    try {
      url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    } catch (error) {
      console.error('[dsh-550c-boot] 音频 blob 建不出来', error)
      resolve(null)
      return
    }
    const audio = document.createElement('audio')
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      try {
        URL.revokeObjectURL(url)
      } catch (error) {
        /* 已经释放过 */
      }
      resolve(value)
    }
    // 兜底：有些环境既不报 error 也不报 metadata，别让导入界面一直转。
    const timer = window.setTimeout(() => finish(null), 8000)
    audio.preload = 'metadata'
    audio.addEventListener('loadedmetadata', () => {
      const duration = Number(audio.duration)
      finish(Number.isFinite(duration) && duration > 0 ? duration : null)
    })
    audio.addEventListener('error', () => finish(null))
    audio.src = url
  })
}

/**
 * 导入一个本地音频文件。
 *
 * 三道关，顺序固定：
 *   ① 魔数嗅探 —— 不信扩展名，也不信 file.type
 *   ② canPlayType —— 环境根本解不了这个格式就别装进来
 *   ③ 真实解码 —— blob 交给 <audio> 读一次 metadata，能读出时长才算数
 *
 * @returns {ok: boolean, text: string}
 */
async function importBgmFile(file) {
  const size = Number(file && file.size) || 0
  if (size > BGM_SINGLE_MAX_BYTES) {
    return {
      ok: false,
      text: '文件 ' + formatBgmSize(size) + ' MB，超出 ' + String(BGM_SINGLE_MAX_BYTES / 1024 / 1024) + ' MB 上限。',
    }
  }
  const index = readBgmIndex()
  const used = index.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0)
  if (used + size > BGM_TOTAL_MAX_BYTES) {
    return { ok: false, text: '曲库已满，请先删除一首。' }
  }
  let bytes = null
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch (error) {
    console.error('[dsh-550c-boot] 文件读不出来', error)
    return { ok: false, text: '文件读不出来，请重试。' }
  }
  const mime = sniffAudioMime(bytes, bgmCanPlayType)
  if (mime === null) {
    return { ok: false, text: '无法识别音频格式，只支持 MP3 / WAV / OGG / FLAC / M4A。' }
  }
  const support = bgmCanPlayType(mime)
  if (support === 'no' || support === '') {
    // AIFF 是 Mac 录音的默认格式，撞上的人不少，单独说一句人话。
    if (mime === 'audio/aiff') {
      return { ok: false, text: 'AIFF 不受支持（Mac 录音默认格式），请转成 WAV 或 MP3。' }
    }
    const label = BGM_FORMAT_LABELS[mime] ?? mime
    return { ok: false, text: '当前环境不支持 ' + label + ' 格式，请转成 MP3 / WAV / OGG。' }
  }
  const duration = await probeBgmDuration(bytes, mime)
  if (duration === null) {
    return { ok: false, text: '文件无法解码，换一个文件试试。' }
  }
  const id = 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const name = typeof file.name === 'string' && file.name !== '' ? file.name : '未命名'
  try {
    window.localStorage.setItem(BGM_DATA_KEY + id, bytesToBase64(bytes))
  } catch (error) {
    console.error('[dsh-550c-boot] 音频数据存不进去', error)
    return { ok: false, text: '浏览器存储写不下了，请先删除一首再试。' }
  }
  const next = index.concat([{ id: id, name: name, mime: mime, bytes: size, duration: duration, createdAt: Date.now() }])
  if (!writeBgmIndex(next)) {
    try {
      window.localStorage.removeItem(BGM_DATA_KEY + id)
    } catch (error) {
      /* 存不下就算了 */
    }
    return { ok: false, text: '曲库索引写不进去，请重试。' }
  }
  // 第一首曲子直接设为开机曲目：曲库里没有别的东西可播。
  if (readBgmCurrent() === '') writeBgmCurrent(id)
  return { ok: true, text: '已导入 ' + name + '（' + formatBgmDuration(duration) + '）。', id: id }
}

/* ── 播放器 ────────────────────────────────────────────────────────────── */

/**
 * 正在放的东西。开机配乐和设置页试听共用一套播放器，
 * 所以它们天然互斥 —— 新的一个开播之前，旧的一定先停。
 */
const bgmPlayer = {
  audio: null,
  url: null,
  context: null,
  gain: null,
  source: null,
  kind: null,
  trackId: null,
  fadeTimer: null,
  levelTimer: null,
}

/** 播放状态变化的订阅者（设置页靠它把「试听」按钮切成「停止」）。 */
const bgmListeners = new Set()

function notifyBgm() {
  for (const listener of bgmListeners) {
    try {
      listener()
    } catch (error) {
      console.error('[dsh-550c-boot] 播放状态回调出错', error)
    }
  }
}

/** 当前正在试听的曲目 id（不在试听时是 null）。 */
function readPreviewTrackId() {
  return bgmPlayer.kind === 'preview' ? bgmPlayer.trackId : null
}

/**
 * 把音轨接进 AudioContext 的增益节点。
 *
 * 只有 context 真的在跑（state 是 running）才接：接上的那一刻元素的声音
 * 就被重定向进图里，context 若是挂起状态，声音会直接消失。
 * 没有可用 context 时退回 element.volume。
 */
function attachBgmGain(audio, volume) {
  const Ctor = window.AudioContext ?? window.webkitAudioContext
  if (typeof Ctor !== 'function') return null
  let context = null
  try {
    context = new Ctor()
  } catch (error) {
    console.error('[dsh-550c-boot] AudioContext 建不出来，退回 element.volume', error)
    return null
  }
  if (context.state !== 'running') {
    // context 挂起时不能接增益图（接上的那一刻元素的声音就被重定向进图里，
    // 挂起的图等于把声音吞了）。但它已经开着了，不关掉就是白占一个 context
    // ——浏览器给每个页面的 AudioContext 数量是有上限的。
    try {
      context.close()
    } catch (error) {
      /* 关不掉就算了，它没接上任何东西 */
    }
    return null
  }
  try {
    const source = context.createMediaElementSource(audio)
    const gain = context.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(context.destination)
    bgmPlayer.context = context
    bgmPlayer.source = source
    bgmPlayer.gain = gain
    return gain
  } catch (error) {
    console.error('[dsh-550c-boot] 音频图接不上，退回 element.volume', error)
    return null
  }
}

/**
 * 把音量线性拉到 target，耗时 ms。
 *
 * 有增益节点就走 linearRampToValueAtTime（采样点之间是连续的，没有爆音）；
 * 没有就退回 element.volume，按 40ms 一档慢慢降 —— 效果糙一点，但不会硬切。
 */
function rampBgmLevel(target, ms) {
  const audio = bgmPlayer.audio
  if (audio === null) return
  if (bgmPlayer.gain !== null && bgmPlayer.context !== null) {
    try {
      const now = bgmPlayer.context.currentTime
      const gain = bgmPlayer.gain.gain
      gain.cancelScheduledValues(now)
      gain.setValueAtTime(gain.value, now)
      gain.linearRampToValueAtTime(target, now + ms / 1000)
      return
    } catch (error) {
      /* context 已经没了，落到下面的 element 兜底 */
    }
  }
  if (bgmPlayer.levelTimer !== null) window.clearTimeout(bgmPlayer.levelTimer)
  const from = audio.volume
  const started = Date.now()
  const step = () => {
    const ratio = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms)
    audio.volume = Math.max(0, from + (target - from) * ratio)
    if (ratio < 1) {
      bgmPlayer.levelTimer = window.setTimeout(step, 40)
    } else {
      bgmPlayer.levelTimer = null
    }
  }
  step()
}

/** 放一首曲子。kind 是 'boot'（开机配乐）或 'preview'（设置页试听）。 */
function playBgmTrack(track, bytes, kind) {
  stopBgmNow()
  let url = null
  try {
    url = URL.createObjectURL(new Blob([bytes], { type: track.mime }))
  } catch (error) {
    console.error('[dsh-550c-boot] 音频 blob 建不出来', error)
    return
  }
  const audio = document.createElement('audio')
  audio.preload = 'auto'
  // 只播一遍，绝不循环。
  audio.loop = false
  const volume = readBgmVolume()
  audio.volume = volume
  const gain = attachBgmGain(audio, volume)
  if (gain !== null) audio.volume = 1
  // 接增益图必须在给 src 之前：createMediaElementSource 之后元素的声音
  // 就被重定向进图里了，顺序反了会丢头一段。
  audio.src = url
  bgmPlayer.audio = audio
  bgmPlayer.url = url
  bgmPlayer.kind = kind
  bgmPlayer.trackId = track.id
  audio.addEventListener('ended', () => {
    // 曲子先播完：短淡一下再停，直接切会爆音。
    fadeBgm(BGM_END_FADE_MS)
  })
  audio.addEventListener('error', () => {
    if (bgmPlayer.audio !== audio) return
    console.error('[dsh-550c-boot] 音频播放出错', audio.error)
    stopBgm()
  })
  let started = null
  try {
    started = audio.play()
  } catch (error) {
    // 老浏览器里 play() 可能直接抛 —— 音乐失败不该拖垮片头。
    console.error('[dsh-550c-boot] 音频起不来', error)
    stopBgm()
    return
  }
  if (started !== undefined && typeof started.catch === 'function') {
    started.catch((error) => {
      // 自动播放被策略拦下（浏览器标签页没有用户手势）：静默降级，不影响片头。
      console.error('[dsh-550c-boot] 音频自动播放被拒绝', error)
      stopBgm()
    })
  }
  notifyBgm()
}

/** 淡出到 0 然后停下。 */
function fadeBgm(ms) {
  if (bgmPlayer.audio === null) return
  // 已经在淡出：不要重开一条斜坡（否则收口/拆除阶段会把正在跑的淡出打断重来）✗
  if (bgmPlayer.fading === true) return
  bgmPlayer.fading = true

  if (bgmPlayer.fadeTimer !== null) window.clearTimeout(bgmPlayer.fadeTimer)
  const duration = Math.max(0, ms)
  rampBgmLevel(0, duration)
  // 双保险：GainNode 可能因为 AudioContext 挂起/没连上而根本不生效，
  // 那种情况下声音会在 duration 结束后被 stopBgm 硬切 —— 听感就是"戛然而止" ✗
  // 所以这里同时把【元素音量】也按同样的时长降下来，两条任一生效都能听见淡出 ✓
  const audio = bgmPlayer.audio
  if (bgmPlayer.levelTimer !== null) window.clearTimeout(bgmPlayer.levelTimer)
  const from = audio.volume
  const started = Date.now()
  const step = () => {
    const ratio = duration <= 0 ? 1 : Math.min(1, (Date.now() - started) / duration)
    audio.volume = Math.max(0, from * (1 - ratio))
    if (ratio < 1) { bgmPlayer.levelTimer = window.setTimeout(step, 40) } else { bgmPlayer.levelTimer = null }
  }
  step()
  bgmPlayer.fadeTimer = window.setTimeout(() => {
    bgmPlayer.fadeTimer = null
    bgmPlayer.fading = false
    stopBgmNow()
  }, duration + 180)
}

/** 停：先淡出 600ms 再真正停。任何路径调它都不会硬切 ✓ */
function stopBgm() {
  if (bgmPlayer.audio === null) { stopBgmNow(); return }
  fadeBgm(Math.max(120, readBgmFade()))
}
/** 立刻停：暂停、释放 blob URL、断开增益图。 */
function stopBgmNow() {
  // 淡出还在跑：不要抢停（桌面端拆除脚手架时会调到这里，
  // 一停就是"淡到一半突然没了"，正是用户听到的那一帧）✗
  if (bgmPlayer.fading === true) return
  bgmPlayer.fading = false
  if (bgmPlayer.fadeTimer !== null) {
    window.clearTimeout(bgmPlayer.fadeTimer)
    bgmPlayer.fadeTimer = null
  }
  if (bgmPlayer.levelTimer !== null) {
    window.clearTimeout(bgmPlayer.levelTimer)
    bgmPlayer.levelTimer = null
  }
  const audio = bgmPlayer.audio
  // 先把状态清掉再动元素：load() 会抛一个 error 事件，
  // 那时如果还认得这个 audio，处理器会再停一次。
  bgmPlayer.audio = null
  bgmPlayer.gain = null
  bgmPlayer.source = null
  bgmPlayer.context = null
  bgmPlayer.kind = null
  bgmPlayer.trackId = null
  if (audio !== null) {
    try {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    } catch (error) {
      /* 元素已经不在了 */
    }
  }
  if (bgmPlayer.url !== null) {
    try {
      URL.revokeObjectURL(bgmPlayer.url)
    } catch (error) {
      /* 已经释放过 */
    }
    bgmPlayer.url = null
  }
  notifyBgm()
}

/** UEG 登录界面自带男声配音，两个一起响会撞。 */
function isUegLoginScreen() {
  try {
    return typeof readLoginScreen === 'function' && readLoginScreen() === 'ueg'
  } catch (error) {
    return false
  }
}

/**
 * 开机配乐：片头一开始就放。只播一遍，片头结束由 finish() 收。
 *
 * 整个函数吞掉自己的异常：音乐是配菜，片头是主菜 ——
 * 配菜出问题绝不能把主菜带下去。
 */
function startBootMusic() {
  try {
    if (!readBgmEnabled()) return
    if (isUegLoginScreen()) return
    const track = currentBgmTrack()
    if (track === null) return
    const bytes = readBgmBytes(track.id)
    if (bytes === null) return
    playBgmTrack(track, bytes, 'boot')
  } catch (error) {
    console.error('[dsh-550c-boot] 开机音乐起不来', error)
  }
}

/** 当前生效的曲目。 */
function currentBgmTrack() {
  const id = readBgmCurrent()
  if (id === '') return null
  const found = readBgmIndex().find((item) => item.id === id)
  return found === undefined ? null : found
}

/**
 * 片头结束：音乐开始淡出。
 *
 * 这条路径在 finish() 里，而 finish() 是片头唯一的收口 —— 它要是抛出去，
 * 遮罩就永远退不掉了（用户会卡在一块黑屏前，连设置都进不去）。所以这里
 * 同样吞掉自己的异常。
 */
function fadeOutBootMusic(overrideMs) {
  try {
    // 不再用 kind 做门禁：片头收口时不管当前是哪条路径起的，都要淡出，
    // 否则一旦 kind 不是 'boot'，这里直接 return，音乐就被后续 stopBgm 硬切 ✗
    if (bgmPlayer.audio === null) return
    // 不传就用设置里的淡出时长；片头收口时传画面的 620ms ——
    // 让「画面渐隐」和「音乐渐弱」同时结束，否则音乐会比画面多响一截，听着像硬切。
    // 优先用设置里的淡出时长（用户可调 0.5–4 秒）；只有显式传参时才覆盖 ✓
    const ms = typeof overrideMs === "number" ? overrideMs : readBgmFade()
        fadeBgm(ms)
  } catch (error) {
    console.error('[dsh-550c-boot] 开机音乐淡出失败', error)
  }
}
/** 按片头总时长提前排好淡出：淡出正好收在画面结束的那一刻 ✓ */
let bootFadeTimer = null
function scheduleBootFade(splashTotalMs) {
  try {
    if (bootFadeTimer !== null) window.clearTimeout(bootFadeTimer)
    bootFadeTimer = null
    if (bgmPlayer.audio === null) return
    const fade = Math.max(BGM_FADE_MIN_MS, readBgmFade())
    // 让淡出在【画面结束后约 0.5 秒】才收完，听感上更自然 ✓
    const TAIL_MS = 500
    const delay = Math.max(0, Number(splashTotalMs) + TAIL_MS - fade)
    bootFadeTimer = window.setTimeout(() => {
      bootFadeTimer = null
      fadeBgm(fade)
    }, delay)
  } catch (error) {
    console.error('[dsh-550c-boot] 排程淡出失败', error)
  }
}

/** 试听一首曲子（设置页用）。与开机配乐互斥：这里先把正在放的停掉。 */
function previewBgm(track) {
  stopBgm()
  const bytes = readBgmBytes(track.id)
  if (bytes === null) return false
  playBgmTrack(track, bytes, 'preview')
  return true
}

/** 停掉正在试听的曲子。 */
function stopPreviewBgm() {
  if (bgmPlayer.kind !== 'preview') return
  stopBgm()
}

/* ── 设置页组件 ────────────────────────────────────────────────────────── */

const MUSIC_STYLE_ID = 'dsh550c-boot-music-style'

/** 开机音乐区块自己的样式表：跟随 DSH 的明暗主题，只用中性底 + 一处强调色。 */
const MUSIC_CSS = [
  '.dsh550c-music{display:flex;flex-direction:column;gap:10px;padding:12px 0 4px;min-width:0}',
  '.dsh550c-music-controls{display:flex;align-items:center;gap:16px;flex-wrap:wrap;min-width:0}',
  '.dsh550c-music-slider{display:flex;align-items:center;gap:8px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}',
  '.dsh550c-music-slider input[type=range]{width:120px;accent-color:var(--dsw-alias-brand-primary,#4d6bfe)}',
  '.dsh550c-music-value{font-variant-numeric:tabular-nums;min-width:40px;text-align:right;color:var(--dsw-alias-label-primary,#191919)}',
  '.dsh550c-music-list{display:flex;flex-direction:column;gap:8px;min-width:0}',
  '.dsh550c-music-item{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;min-width:0}',
  '.dsh550c-music-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}',
  '.dsh550c-music-name{font-size:13px;line-height:1.5;font-weight:600;color:var(--dsw-alias-label-primary,#191919);word-break:break-all;min-width:0}',
  '.dsh550c-music-meta{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;margin-left:auto}',
  '.dsh550c-music-tag{font-size:11px;line-height:1.6;color:var(--dsw-alias-brand-primary,#4d6bfe);border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:4px;padding:0 5px}',
  '.dsh550c-music-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.dsh550c-music-empty{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666)}',
].join('\n')

function ensureMusicStyle() {
  if (document.getElementById(MUSIC_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = MUSIC_STYLE_ID
  style.textContent = MUSIC_CSS
  document.head.appendChild(style)
}

/** 文件选择框的 id 序号：同一个设置页可能同时挂着两份（通用页 + 550C 页）。 */
let bgmFileSeq = 0

/**
 * 「开机音乐」区块。
 *
 * 注册成整块组件而不是单行：曲库列表需要纵向空间，挤在一行里没法读。
 * 内部还是用现成的 .dsh550c-row / -input / -preview / -seg / -note 那几套类，
 * 所以它跟同一页的其它行看起来是一家人。
 */
function MusicRow() {
  const [enabled, setEnabled] = React.useState(readBgmEnabled)
  const [volume, setVolume] = React.useState(readBgmVolume)
  const [fade, setFade] = React.useState(readBgmFade)
  const [index, setIndex] = React.useState(readBgmIndex)
  const [current, setCurrent] = React.useState(readBgmCurrent)
  const [note, setNote] = React.useState(null)
  const [editing, setEditing] = React.useState(null)
  const [confirming, setConfirming] = React.useState(null)
  const [previewing, setPreviewing] = React.useState(readPreviewTrackId)
  const [fileId] = React.useState(() => 'dsh550c-bgm-file-' + String(++bgmFileSeq))

  React.useEffect(() => {
    ensureRowStyle()
    ensureMusicStyle()
  }, [])

  // 播放状态是模块里的，界面靠这个订阅跟着变（试听按钮在「试听 / 停止」之间切）。
  React.useEffect(() => {
    const listener = () => setPreviewing(readPreviewTrackId())
    bgmListeners.add(listener)
    return () => {
      bgmListeners.delete(listener)
    }
  }, [])

  // 滑杆是连续拖动的，写存储按 200ms 收一次，不然拖一次写几十次。
  React.useEffect(() => {
    const timer = window.setTimeout(() => writeBgmVolume(volume), 200)
    return () => window.clearTimeout(timer)
  }, [volume])

  React.useEffect(() => {
    const timer = window.setTimeout(() => writeBgmFade(fade), 200)
    return () => window.clearTimeout(timer)
  }, [fade])

  const toggleEnabled = (next) => {
    writeBgmEnabled(next)
    setEnabled(next)
  }

  const pickFile = () => {
    const input = document.getElementById(fileId)
    if (input === null) return
    input.click()
  }

  const onFilePicked = (event) => {
    const input = event.target
    const file = input.files && input.files[0]
    // 选同一个文件不会再触发 change，先把值清空。
    input.value = ''
    if (!file) return
    const wasEmpty = readBgmIndex().length === 0
    const wasEnabled = readBgmEnabled()
    importBgmFile(file).then((result) => {
      if (result.ok) {
        if (wasEmpty && !wasEnabled) {
          // 第一次导入：直接把它接上，省得用户导入完还要自己再拨一遍开关。
          writeBgmEnabled(true)
          setEnabled(true)
          result.text = result.text + '已设为开机曲目，开机音乐已打开。'
        }
        setIndex(readBgmIndex())
        setCurrent(readBgmCurrent())
      }
      setNote({ ok: result.ok, text: result.text })
    })
  }

  const setCurrentTrack = (id) => {
    writeBgmCurrent(id)
    setCurrent(id)
    setNote({ ok: true, text: '已设为开机曲目。' })
  }

  const startRename = (id) => {
    setConfirming(null)
    setEditing(id)
  }

  const commitRename = (id, value) => {
    const name = String(value ?? '').trim()
    const track = readBgmIndex().find((item) => item.id === id)
    setEditing(null)
    if (name === '' || track === undefined || name === track.name) return
    const next = readBgmIndex().map((item) => (item.id === id ? Object.assign({}, item, { name: name }) : item))
    if (writeBgmIndex(next)) setIndex(next)
  }

  const removeTrack = (id) => {
    const track = readBgmIndex().find((item) => item.id === id)
    stopPreviewBgm()
    try {
      window.localStorage.removeItem(BGM_DATA_KEY + id)
    } catch (error) {
      /* 存不下也就那样 */
    }
    const next = readBgmIndex().filter((item) => item.id !== id)
    writeBgmIndex(next)
    if (readBgmCurrent() === id) writeBgmCurrent(next.length > 0 ? next[0].id : '')
    setIndex(next)
    setCurrent(readBgmCurrent())
    setConfirming(null)
    setNote({ ok: true, text: '已删除' + (track === undefined ? '' : '「' + track.name + '」') + '。' })
  }

  const togglePreview = (track) => {
    if (previewing === track.id) {
      stopPreviewBgm()
      setPreviewing(null)
      return
    }
    // 试听和开机配乐互斥：开新的之前先停旧的。
    if (!previewBgm(track)) {
      setNote({ ok: false, text: '这条曲目的音频数据读不出来，删掉重导一次。' })
      return
    }
    setPreviewing(track.id)
  }

  const used = index.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0)

  const renderTrack = (track) => {
    const isCurrent = current === track.id
    const isEditing = editing === track.id
    const isConfirming = confirming === track.id
    const isPreviewing = previewing === track.id
    return React.createElement(
      'div',
      { className: 'dsh550c-music-item', key: track.id },
      React.createElement(
        'div',
        { className: 'dsh550c-music-head' },
        isEditing
          ? React.createElement('input', {
              className: 'dsh550c-input',
              type: 'text',
              defaultValue: track.name,
              autoFocus: true,
              onKeyDown: (event) => {
                if (event.key === 'Enter') commitRename(track.id, event.target.value)
              },
              onBlur: (event) => commitRename(track.id, event.target.value),
            })
          : React.createElement('span', { className: 'dsh550c-music-name' }, track.name),
        React.createElement(
          'span',
          { className: 'dsh550c-music-meta' },
          formatBgmDuration(track.duration) + ' · ' + formatBgmSize(track.bytes) + ' MB',
        ),
        isCurrent ? React.createElement('span', { className: 'dsh550c-music-tag' }, '当前') : null,
      ),
      React.createElement(
        'div',
        { className: 'dsh550c-music-acts' },
        React.createElement(
          'button',
          { type: 'button', className: 'dsh550c-preview', onClick: () => togglePreview(track) },
          isPreviewing ? '停止' : '试听',
        ),
        isCurrent
          ? null
          : React.createElement(
              'button',
              { type: 'button', className: 'dsh550c-preview', onClick: () => setCurrentTrack(track.id) },
              '设为开机',
            ),
        isEditing
          ? null
          : React.createElement(
              'button',
              { type: 'button', className: 'dsh550c-preview', onClick: () => startRename(track.id) },
              '重命名',
            ),
        isConfirming
          ? React.createElement(
              'button',
              { type: 'button', className: 'dsh550c-preview', onClick: () => removeTrack(track.id) },
              '确认删除？',
            )
          : React.createElement(
              'button',
              { type: 'button', className: 'dsh550c-preview', onClick: () => setConfirming(track.id) },
              '删除',
            ),
      ),
    )
  }

  return React.createElement(
    'div',
    { className: 'dsh550c-music' },
    React.createElement(
      'div',
      { className: 'dsh550c-row' },
      React.createElement(
        'div',
        { className: 'dsh550c-row-text' },
        React.createElement('div', { className: 'dsh550c-row-title' }, '开机音乐'),
        React.createElement('div', { className: 'dsh550c-row-desc' }, '片头播放时播放该音频，片头结束前渐弱淡出。音乐要比片头长 2 秒以上，否则会先播完。'),
      ),
      React.createElement(
        'div',
        { className: 'dsh550c-row-ctrl' },
        React.createElement(
          'div',
          { className: 'dsh550c-seg' },
          [
            { value: false, label: '关闭' },
            { value: true, label: '开启' },
          ].map((option) =>
            React.createElement(
              'button',
              {
                key: String(option.value),
                type: 'button',
                className: enabled === option.value ? 'on' : '',
                onClick: () => toggleEnabled(option.value),
              },
              option.label,
            ),
          ),
        ),
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-note' },
      '完整档约 17 秒 · 简易档约 4 秒 · 建议导入 19 秒左右。超过片头长度的部分不会播放，音乐会随片头结束渐弱淡出。',
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row' },
      React.createElement(
        'div',
        { className: 'dsh550c-music-controls' },
        React.createElement('button', { type: 'button', className: 'dsh550c-preview', onClick: pickFile }, '导入音频'),
        React.createElement('input', {
          type: 'file',
          id: fileId,
          accept: 'audio/*',
          style: { display: 'none' },
          onChange: onFilePicked,
        }),
        React.createElement(
          'label',
          { className: 'dsh550c-music-slider' },
          '音量',
          React.createElement('input', {
            type: 'range',
            min: 0,
            max: 1,
            step: 0.05,
            value: volume,
            onChange: (event) => setVolume(Number(event.target.value)),
          }),
          React.createElement('span', { className: 'dsh550c-music-value' }, Math.round(volume * 100) + '%'),
        ),
        React.createElement(
          'label',
          { className: 'dsh550c-music-slider' },
          '淡出',
          React.createElement('input', {
            type: 'range',
            min: BGM_FADE_MIN_MS,
            max: BGM_FADE_MAX_MS,
            step: 100,
            value: fade,
            onChange: (event) => setFade(Number(event.target.value)),
          }),
          React.createElement('span', { className: 'dsh550c-music-value' }, (fade / 1000).toFixed(1) + 's'),
        ),
      ),
    ),
    // 导入结果紧跟在操作行下面：反馈离动作越近越好，
    // 隔着一行容量信息的话，导入失败时用户会先去找别的问题。
    note === null
      ? null
      : React.createElement('div', { className: 'dsh550c-note ' + (note.ok ? 'up' : 'bad') }, note.text),
    React.createElement(
      'div',
      { className: 'dsh550c-note' },
      '曲库已用 ' + formatBgmSize(used) + ' / ' + String(Math.round(BGM_TOTAL_MAX_BYTES / 1024 / 1024 * 10) / 10) + ' MB',
    ),
    index.length === 0
      ? React.createElement('div', { className: 'dsh550c-music-empty' }, '曲库为空。点「导入音频」选一个本地音频文件。')
      : React.createElement(
          'div',
          { className: 'dsh550c-music-list' },
          index.map((track) => renderTrack(track)),
        ),
  )
}
