/**
 * 「550C」登录阶段用的主题表：每个主题一套配色与一段文案。
 *
 * 纯数据，和编排逻辑分开放 —— login.js 已经太长了（一千多行、其中 mountLoginGate
 * 一个函数就占四成），把它挪出来至少让配色改动不必在大文件里翻。
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】。
 */

const LOGIN_THEMES = [
  {
    id: 'ueg',
    label: 'UEG 联合政府',
    wash: '#ffffff',
    brand: 'UEG · 联合政府 · 访问终端',
    head: 'UEG INFORMATION SYSTEM',
    vars: {
      '--bg': '#e7ebef',
      '--bg-deep': '#f7fafc',
      '--ink': '#101d29',
      '--ink-dim': '#5b6f80',
      '--accent': '#2f6fb3',
      '--line': 'rgba(16, 29, 41, 0.18)',
      '--glow': 'rgba(47, 111, 179, 0.35)',
      '--font': '"Inter", "Noto Sans SC", "Segoe UI", system-ui, sans-serif',
      '--letter': '0.10em',
      '--glitch-1': '#e8342f',
      '--glitch-2': '#1f8fd8',
    },
    steps: [
      {
        main: '需要访问许可',
        sub: 'ACCESS PERMISSION REQUIRED',
        say: '需要访问许可。',
        detail: ['本终端受 UEG 联合政府信息系统管辖', '继续操作即表示你已阅读并同意访问条款'],
        action: '点击以继续',
      },
      {
        main: '身份资料确认',
        sub: 'IDENTITY VERIFICATION',
        say: '身份资料确认。',
        detail: ['姓名：{user}', '权限等级：{clearance}', '凭据来源：本机 profile'],
        action: '确认',
        card: true,
      },
      {
        main: '接收访问需求',
        sub: 'ACCESS REQUEST RECEIVED',
        say: '已接收访问需求。',
        detail: ['需求编号：{ticket}', '受理节点：550C 控制终端', '正在分配核验通道'],
        action: null,
      },
      {
        main: '开始读取权限',
        sub: 'PERMISSION READ STARTED',
        say: '开始读取权限。',
        detail: ['逐项比对授权清单', '只读取本机 DSH 会话所需的权限'],
        action: null,
        waterfall: true,
      },
      {
        main: '读取完毕 · 核验通过',
        sub: 'READ COMPLETE · VERIFIED',
        say: '读取完毕，核验通过。',
        detail: ['授权范围已写入本机会话', '欢迎访问，{user}'],
        action: null,
        seal: true,
        finale: true,
      },
    ],
  },
  {
    id: '550c',
    label: '550C 控制终端',
    wash: '#fff3d6',
    brand: '550C · CONTROL TERMINAL',
    head: '550C CONTROL TERMINAL',
    vars: {
      '--bg': '#050403',
      '--bg-deep': '#0b0906',
      '--ink': '#e8a020',
      '--ink-dim': '#8a6a24',
      '--accent': '#e8a020',
      '--line': 'rgba(232, 160, 32, 0.28)',
      '--glow': 'rgba(232, 160, 32, 0.45)',
      '--font': '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
      '--letter': '0.16em',
      '--glitch-1': '#e8342f',
      '--glitch-2': '#3fd8e0',
    },
    steps: [
      {
        main: '550C · POST',
        sub: 'POWER ON SELF TEST',
        say: '五百五十C，开机自检完成，等待操作员接入。',
        detail: ['内存校验 …………… OK', '光路阵列 …………… OK', '等待操作员接入'],
        action: '点击以接入',
      },
      {
        main: '操作员身份',
        sub: 'OPERATOR IDENTITY',
        say: '请确认操作员身份。',
        detail: ['操作员：{user}', '权限：{clearance}', '工作站：本机 DSH profile'],
        action: '确认',
        card: true,
      },
      {
        main: '接入请求已受理',
        sub: 'REQUEST ACCEPTED',
        say: '接入请求已受理。',
        detail: ['工单：{ticket}', '通道：550C-0', '正在装载授权表'],
        action: null,
      },
      {
        main: '读取授权表',
        sub: 'READING PERMISSION TABLE',
        say: '正在读取授权表。',
        detail: ['逐扇区比对', '不写入任何未授权区域'],
        action: null,
        waterfall: true,
      },
      {
        main: '核验通过',
        sub: 'VERIFIED',
        say: '核验通过。欢迎回来。',
        detail: ['会话已建立', '欢迎回来，{user}'],
        action: null,
        seal: true,
        finale: true,
      },
    ],
  },
]
