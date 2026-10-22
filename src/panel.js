/**
 * 「550C」设置页的唯一事实来源。
 *
 * 这一页是【整个系列共用】的入口：boot 的启动动画、skin 的外观、以后再加的动画，
 * 都往同一页里加自己的设置行。页面本身（筛选条 + 子插槽声明）从这里出，别处不要再抄：
 *
 *   PANEL_TABS   顶部筛选条上的分组（加一个动画 = 这里加一项）
 *   PANEL_SLOTS  三个子插槽的声明（注册页面的一方必须原样声明它们，
 *                否则别人往里注册行时会抛 "slot ... is not declared"）
 *   Panel550c    页壳组件（筛选条 + 卡片容器）
 *
 * 注意：本文件会被 build.mjs 拼进一个模板字符串里，
 * 所以【绝对不能出现反引号或美元加大括号】—— 那会把外层字符串当场撕开。
 */

/** 顶部筛选条：id 同时决定渲染哪个子插槽。 */
const PANEL_TABS = [
  { id: 'look', label: '外观', slot: 'settings.550c.item' },
  { id: 'boot550c', label: '550C 开机动画', slot: 'settings.550c.anim.550c' },
  { id: 'ueg', label: 'UEG 登录界面', slot: 'settings.550c.anim.ueg' },
]

/** 子插槽声明表：谁注册「550C」这一页，谁就把它原样放进 children。 */
const PANEL_SLOTS = {
  'settings.550c.item': { kind: 'list', scope: 'root' },
  'settings.550c.anim.550c': { kind: 'list', scope: 'root' },
  'settings.550c.anim.ueg': { kind: 'list', scope: 'root' },
}

/** 页壳：顶部是灵动岛式胶囊筛选条（吸顶），下面是框住内容的卡片。 */
function Panel550c(props) {
  // 设置行的整套样式（.dsh550c-row / -input / -seg / -preview …）必须在这里注入：
  // 以前只有 rows.js 的行组件会调 ensureRowStyle，于是"第一次点 UEG"时那套 CSS 还没进页面，
  // 整行退回浏览器默认样式 —— 输入框是 inline-block，按宽度自动流排，看起来就像挤成三列。
  // 放到页壳上：进 550C 页的第一帧就有样式，先点哪个 tab 都一样。
  ensureRowStyle()
  // 默认落在有内容的页签：
// 「外观」是皮肤填的，皮肤没启用时那一页是空的（实测：打开设置就看到白板）✗
const [tab, setTab] = React.useState(window.__dsh550cPageOwner === true ? 'look' : 'boot550c')
  const active = PANEL_TABS.find((item) => item.id === tab) ?? PANEL_TABS[0]
  return React.createElement(
    'div',
    { className: 'dsh550c-panel-frame', style: { display: 'flex', flexDirection: 'column', gap: '18px', paddingBottom: '8px' } },
    React.createElement(
      'div',
      {
        style: {
          position: 'sticky',
          top: '8px',
          zIndex: 3,
          alignSelf: 'flex-start',
          display: 'flex',
          gap: '4px',
          padding: '5px',
          borderRadius: '999px',
          background: 'color-mix(in srgb, currentColor 8%, transparent)',
          border: '1px solid color-mix(in srgb, currentColor 16%, transparent)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.45)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        },
      },
      PANEL_TABS.map((item) =>
        React.createElement(
          'button',
          {
            key: item.id,
            type: 'button',
            onClick: () => setTab(item.id),
            style: {
              appearance: 'none',
              border: '0',
              cursor: 'pointer',
              padding: '7px 16px',
              borderRadius: '999px',
              font: 'inherit',
              fontSize: '13px',
              letterSpacing: '0.02em',
              transition: 'background 180ms ease, color 180ms ease',
              background: tab === item.id ? 'color-mix(in srgb, currentColor 18%, transparent)' : 'transparent',
              color: 'inherit',
              opacity: tab === item.id ? 1 : 0.62,
            },
          },
          item.label,
        ),
      ),
    ),
    React.createElement(
      'div',
      {
        className: 'dsh550c-panel-card',
        style: {
          borderRadius: '18px',
          border: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
          background: 'color-mix(in srgb, currentColor 5%, transparent)',
          padding: '20px 22px 22px',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        },
      },
      props.renderSlot(active.slot, {}),
    ),
  )
}
