/**
 * 「550C」设置页里的三个行组件：外观行、版本行、配色行。
 *
 * 都是纯 UI，和插件装载逻辑（apply / mountOverlay / adaptCaption）分开 ——
 * client.js 原本 971 行，这三兄弟就占了三分之一。
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】。
 */

/** The General-settings row: mode segmented control + a preview button. */
function SettingsRow() {
  const [mode, setMode] = React.useState(readMode)

  React.useEffect(() => {
    ensureRowStyle()
  }, [])

  const choose = React.useCallback((next) => {
        // 互斥：UEG 登录界面开着时不能开片头 —— 否则会先播 16 秒片头、再播 UEG 三幕（两段片头）。
        // 反向的那一半在 login.js 的档位按钮上（片头开着时 UEG 那档直接 disabled）。
        if (next !== 'off' && typeof readLoginScreen === 'function' && readLoginScreen() === 'ueg') {
          window.alert('UEG 登录界面开着，两者只能留一个：请先把「登录授权界面」设为关闭')
          return
        }
        writeMode(next)
    setMode(next)
  }, [])

  const options = [
    { value: 'off', label: '关闭' },
    { value: 'simple', label: '简易' },
    { value: 'full', label: '完整' },
  ]

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '550C 开机动画'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        '启动时播放 550C 片头；完整模式可用点击或 Esc 跳过。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        options.map((option) =>
          React.createElement(
            'button',
            {
              key: option.value,
              type: 'button',
              className: mode === option.value ? 'on' : '',
              onClick: () => choose(option.value),
            },
            option.label,
          ),
        ),
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'dsh550c-preview', onClick: () => mountOverlay(true) },
        '预览',
      ),
    ),
  )
}

/**
 * The version row: what is installed, whether anything newer exists, and — when
 * the host is allowed to do it — the update itself.
 *
 * DSH has no plugin updater of its own (the inventory surface is read-only), so
 * this is the one place a user can ask. Both calls go to the HOST half's routes
 * (`GET /dsh-550c-boot/update`, `POST /dsh-550c-boot/update/apply`), not to the
 * registry: the served document's CSP is restrictive and the host process already
 * owns outbound network access, so same-origin calls keep the client free of CORS
 * and CSP questions. The check reads npm (the host tries the npmmirror mirror
 * first, then the official registry); the update runs the profile's own package
 * manager through the DSH CLI, which is the only supported way to change a
 * profile's plugins. Nothing happens until a button is pressed.
 */
function VersionRow() {
  const [current] = React.useState(() =>
    typeof window[VERSION_GLOBAL] === 'string' && window[VERSION_GLOBAL] !== '' ? window[VERSION_GLOBAL] : null,
  )
  const [state, setState] = React.useState({ status: 'idle', payload: null, error: null })
  const [applying, setApplying] = React.useState({ status: 'idle', result: null })
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    ensureRowStyle()
  }, [])

  const check = React.useCallback(() => {
    setState({ status: 'checking', payload: null, error: null })
    setApplying({ status: 'idle', result: null })
    setCopied(false)
    let failed = false
    fetch(UPDATE_ROUTE, { headers: { accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + String(response.status))
        return response.json()
      })
      .then((payload) => {
        if (!failed) setState({ status: 'done', payload: payload, error: null })
      })
      .catch((error) => {
        failed = true
        setState({ status: 'failed', payload: null, error: String(error?.message ?? error) })
      })
  }, [])

  const apply = React.useCallback(() => {
    setApplying({ status: 'running', result: null })
    fetch(APPLY_ROUTE, { method: 'POST', headers: { accept: 'application/json' } })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload: payload })))
      .then((answer) => setApplying({ status: answer.payload?.ok === true ? 'done' : 'failed', result: answer.payload }))
      .catch((error) => setApplying({ status: 'failed', result: { hint: String(error?.message ?? error) } }))
  }, [])

  const copy = React.useCallback((text) => {
    setCopied(false)
    try {
      const clipboard = navigator.clipboard
      if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
        clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }
    } catch (error) {
      /* clipboard refused: the spec is on screen to select by hand */
    }
  }, [])

  const openPackagePage = React.useCallback(() => {
    const url = state.payload?.url ?? PACKAGE_URL
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      /* a blocked popup is not worth an error state; the URL is public */
    }
  }, [state.payload])

  const payload = state.payload
  const source = payload?.source === 'npmmirror' ? '国内镜像' : payload?.source === 'npmjs' ? 'npm 官方' : null
  const outdated = state.status === 'done' && payload !== null && payload.state === 'outdated'
  const canApply = payload?.canApply === true
  // The host half loads when the process starts, the client half on every page
  // load — so a refresh can show this row while the host still has no routes.
  const hostStale = current === null
  let note = null

  if (state.status === 'checking') {
    note = React.createElement('div', { className: 'dsh550c-note' }, '检查中…')
  } else if (state.status === 'failed') {
    note = React.createElement(
      'div',
      { className: 'dsh550c-note bad' },
      /404/.test(state.error) ? '宿主半边是旧版本，重启客户端后可用。' : '检查失败：' + state.error,
      React.createElement('button', { type: 'button', className: 'dsh550c-link', onClick: openPackagePage }, '打开 npm 页面'),
    )
  } else if (outdated && applying.status === 'running') {
    note = React.createElement('div', { className: 'dsh550c-note up' }, '更新中…')
  } else if (outdated && applying.status === 'done') {
    note = React.createElement(
      'div',
      { className: 'dsh550c-note up' },
      '已更新到 v' + String(applying.result?.version ?? payload.latest) + '，重启客户端生效。',
    )
  } else if (outdated && applying.status === 'failed') {
    note = React.createElement(
      'div',
      { className: 'dsh550c-note bad' },
      String(applying.result?.hint ?? '更新失败。'),
      React.createElement('button', { type: 'button', className: 'dsh550c-link', onClick: () => copy(INSTALL_SPEC) }, copied ? '已复制' : '复制包名'),
    )
  } else if (outdated) {
    note = React.createElement(
      'div',
      { className: 'dsh550c-note up' },
      '有新版本 v' + String(payload.latest) + '。',
      canApply
        ? '点「立即更新」，然后重启客户端。'
        : React.createElement(
            'span',
            null,
            '在 设置 → 插件 里装 ',
            React.createElement('span', { className: 'dsh550c-code' }, INSTALL_SPEC),
            '，然后重启。',
          ),
      canApply
        ? null
        : React.createElement('button', { type: 'button', className: 'dsh550c-link', onClick: () => copy(INSTALL_SPEC) }, copied ? '已复制' : '复制包名'),
    )
  } else if (state.status === 'done') {
    note = React.createElement(
      'div',
      { className: 'dsh550c-note' },
      payload !== null && payload.state === 'unknown'
        ? '查不到最新版本。'
        : '已是最新 v' + String(payload?.current ?? current ?? '?') + '。',
      React.createElement('button', { type: 'button', className: 'dsh550c-link', onClick: openPackagePage }, '打开 npm 页面'),
    )
  }

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '版本与更新'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        current === null ? '从 npm 查询最新版本。' : '当前 v' + current + '，从 npm 查询最新版本。',
      ),
      hostStale && state.status === 'idle'
        ? React.createElement('div', { className: 'dsh550c-note bad' }, '宿主半边是旧版本，重启客户端后可用。')
        : null,
      note,
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsh550c-preview',
          disabled: state.status === 'checking',
          onClick: check,
        },
        state.status === 'checking' ? '检查中…' : '检查更新',
      ),
      outdated && canApply && applying.status !== 'done'
        ? React.createElement(
            'button',
            {
              type: 'button',
              className: 'dsh550c-preview',
              disabled: applying.status === 'running',
              onClick: apply,
            },
            applying.status === 'running' ? '更新中…' : '立即更新',
          )
        : null,
    ),
  )
}

/**
 * The colour-scheme row. Amber is the original author's palette — the default,
 * and the only one that overrides nothing at all.
 */
function SchemeRow() {
  const [scheme, setScheme] = React.useState(readScheme)

  React.useEffect(() => {
    ensureRowStyle()
  }, [])

  const choose = React.useCallback((next) => {
    writeScheme(next)
    setScheme(next)
  }, [])

  const options = [
    { value: 'amber', label: '琥珀' },
    { value: 'green', label: '绿' },
    { value: 'cyan', label: '青' },
    { value: 'white', label: '白' },
  ]

  return React.createElement(
    'div',
    { className: 'dsh550c-row' },
    React.createElement(
      'div',
      { className: 'dsh550c-row-text' },
      React.createElement('div', { className: 'dsh550c-row-title' }, '开机动画配色'),
      React.createElement(
        'div',
        { className: 'dsh550c-row-desc' },
        '琥珀是原作的配色，也是默认值。',
      ),
    ),
    React.createElement(
      'div',
      { className: 'dsh550c-row-ctrl' },
      React.createElement(
        'div',
        { className: 'dsh550c-seg' },
        options.map((option) =>
          React.createElement(
            'button',
            {
              key: option.value,
              type: 'button',
              className: scheme === option.value ? 'on' : '',
              onClick: () => choose(option.value),
            },
            option.label,
          ),
        ),
      ),
    ),
  )
}

/**
 * Mount both surfaces.
 *
 * Slot names are inlined as literals on purpose: the injector's pre-flight
 * check reads register() calls statically and cannot follow a constant.
 */
