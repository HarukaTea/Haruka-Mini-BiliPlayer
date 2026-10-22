// 探测当前系统上哪些全局热键还空着（Windows 上被别的程序占用时 register 会返回 false）
// 用法: electron tools/probes/hotkeys.js
const { app, globalShortcut } = require('electron')

const CANDS = [
  'Control+Alt+Space',
  'Control+Alt+Left', 'Control+Alt+Right', 'Control+Alt+Up', 'Control+Alt+Down',
  'Control+Alt+Shift+Left', 'Control+Alt+Shift+Right',
  'Control+Alt+Shift+Up', 'Control+Alt+Shift+Down',
  'Control+Alt+PageUp', 'Control+Alt+PageDown',
  'Control+Alt+BracketLeft', 'Control+Alt+BracketRight',
  'Control+Alt+Comma', 'Control+Alt+Period',
  'Control+Alt+V', 'Control+Alt+C', 'Control+Alt+B', 'Control+Alt+H',
  'Control+Alt+L', 'Control+Alt+R', 'Control+Alt+E',
  'Control+Alt+1', 'Control+Alt+2', 'Control+Alt+3', 'Control+Alt+4',
  'Control+Alt+Z', 'Control+Alt+X', 'Control+Alt+S', 'Control+Alt+D',
  'Control+Shift+Alt+Left', 'Control+Shift+Alt+Right',
]

app.whenReady().then(() => {
  const ok = []
  const bad = []
  for (const c of CANDS) {
    try {
      ;(globalShortcut.register(c, () => {}) ? ok : bad).push(c)
    } catch {
      bad.push(c + ' (throw)')
    }
  }
  globalShortcut.unregisterAll()
  console.log(JSON.stringify({ available: ok, taken: bad }, null, 2))
  app.exit(0)
})
