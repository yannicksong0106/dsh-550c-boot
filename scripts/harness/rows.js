/**
 * Render the settings rows inside the harness page and report what they say.
 *
 * The rows live in the client bundle and only exist once the module system hands
 * the plugin a context, which is exactly what the harness never did: it used the
 * factory for its module-evaluation side effect (the splash) and ignored the
 * exports it returned. So the row text was never verified anywhere — the browser
 * suite could not render React components and the node tests had no react-dom.
 *
 * This file closes that: it calls apply() with a fake ctx, renders every component
 * the plugin registers through a shim that records the element tree, drives the
 * buttons, and hands back the text a user would actually read. No react-dom, no
 * build step, and it runs in CI with the rest of the browser suite.
 */
;(function () {
  function textOf(node) {
    if (node === null || node === undefined || node === false) return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    return textOf(node.children)
  }

  function findByClass(node, className) {
    if (node === null || typeof node !== 'object') return null
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i += 1) {
        var hit = findByClass(node[i], className)
        if (hit !== null) return hit
      }
      return null
    }
    if (typeof node.props.className === 'string' && node.props.className.split(' ').indexOf(className) >= 0) return node
    return findByClass(node.children, className)
  }

  function buttonsOf(node, found) {
    var out = found || []
    if (node === null || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i += 1) buttonsOf(node[i], out)
      return out
    }
    if (node.type === 'button') out.push({ label: textOf(node), onClick: node.props.onClick })
    buttonsOf(node.children, out)
    return out
  }

  function describe(tree) {
    var note = findByClass(tree, 'dsh550c-note')
    var desc = findByClass(tree, 'dsh550c-row-desc')
    var buttons = buttonsOf(tree)
    return {
      title: textOf(findByClass(tree, 'dsh550c-row-title')),
      desc: textOf(desc),
      note: note === null ? null : textOf(note),
      buttons: buttons
        .map(function (button) {
          return button.label
        })
        .join(','),
      canUpdate: buttons.some(function (button) {
        return button.label === '立即更新' || button.label === '更新中…'
      }),
      _checkButton: buttons.filter(function (button) {
        return button.label === '检查更新'
      })[0],
    }
  }

  window.__dsh550cRows = {
    /**
     * @param options.exports  what the module factory returned (apply lives there)
     * @param options.React    the same shim the factory was given
     * @param options.setFetch replaces window.fetch for one drive
     * @param options.done     called with the report, once everything is read
     */
    run: function (options) {
      var rows = {}
      var ctx = {
        on: function () {
          return function () {}
        },
        inject: function () {},
        effect: function () {},
        slots: {
          inject: function (name, factory) {
            factory()
          },
          register: function (spec, Component) {
            rows[spec.id] = Component
            return function () {}
          },
        },
      }
      try {
        options.exports.apply(ctx)
      } catch (error) {
        options.done({ error: String((error && error.message) || error) })
        return
      }

      // One renderer per component: hook cells have to be stable across redraws,
      // which is what a real React instance would keep for us. The patched useState
      // has to be in place DURING the component call — restoring it first (the
      // obvious way to write this) makes every redraw start from the initial state
      // and the driven states never appear.
      function renderer(Component) {
        var cells = []
        var cursor = 0
        var React = options.React
        var realUseState = React.useState
        var patched = function (initial) {
          var index = cursor
          cursor += 1
          if (cells[index] === undefined) cells[index] = typeof initial === 'function' ? initial() : initial
          return [
            cells[index],
            function (next) {
              cells[index] = typeof next === 'function' ? next(cells[index]) : next
            },
          ]
        }
        return {
          draw: function () {
            cursor = 0
            React.useState = patched
            try {
              return Component()
            } finally {
              React.useState = realUseState
            }
          },
        }
      }

      var report = { ids: Object.keys(rows).join(String.fromCharCode(44)) }
      var mode = renderer(rows['boot-550c'])
      report.mode = describe(mode.draw())
      delete report.mode._checkButton
      var scheme = renderer(rows['boot-550c-scheme'])
      report.scheme = describe(scheme.draw())
      delete report.scheme._checkButton

      var login = renderer(rows['boot-550c-login'])
      report.login = describe(login.draw())
      delete report.login._checkButton
      var version = renderer(rows['boot-550c-update'])
      report.versionIdle = describe(version.draw())
      delete report.versionIdle._checkButton

      function drive(payload, reject) {
        return new Promise(function (resolve) {
          options.setFetch(function () {
            if (reject) return Promise.reject(new Error('HTTP 404'))
            return Promise.resolve({
              ok: true,
              status: 200,
              json: function () {
                return Promise.resolve(payload)
              },
            })
          })
          var idle = describe(version.draw())
          if (idle._checkButton === undefined) {
            resolve(null)
            return
          }
          idle._checkButton.onClick()
          window.setTimeout(function () {
            resolve(describe(version.draw()))
          }, 40)
        })
      }

      drive({ state: 'current', current: '0.3.2', latest: '0.3.2' })
        .then(function (current) {
          report.versionCurrent = current
          return drive({ state: 'outdated', latest: '9.9.9', canApply: false, profile: 'desktop' })
        })
        .then(function (desktop) {
          report.versionDesktop = desktop
          return drive({ state: 'outdated', latest: '9.9.9', canApply: true, profile: 'web' })
        })
        .then(function (web) {
          report.versionWeb = web
          return drive(null, true)
        })
        .then(function (missing) {
          report.versionMissing = missing
          for (var key in report) {
            if (report[key] !== null && typeof report[key] === 'object' && report[key]._checkButton !== undefined) {
              delete report[key]._checkButton
            }
          }
          options.done(report)
        })
    },
  }
})()
