// 探测：普通窗口在运行时切「置顶 + 不可聚焦 + 跳过任务栏 + 鼠标穿透」后，
// isAlwaysOnTop() 到底还是不是 true，找出是哪一步把它顶掉的。
const { app, BrowserWindow } = require('electron')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    focusable: true,
    show: true,
  })
  const report = (step) => console.log(step.padEnd(28), 'alwaysOnTop=' + win.isAlwaysOnTop())
  report('initial')
  await new Promise((r) => setTimeout(r, 500))

  win.setAlwaysOnTop(true, 'screen-saver')
  report('after setAlwaysOnTop')
  await new Promise((r) => setTimeout(r, 300))

  win.setSkipTaskbar(true)
  report('after setSkipTaskbar')
  await new Promise((r) => setTimeout(r, 300))

  win.setFocusable(false)
  report('after setFocusable(false)')
  await new Promise((r) => setTimeout(r, 300))

  win.setIgnoreMouseEvents(true, { forward: true })
  report('after setIgnoreMouseEvents')
  await new Promise((r) => setTimeout(r, 300))

  win.blur()
  win.showInactive()
  report('after blur+showInactive')
  await new Promise((r) => setTimeout(r, 300))

  win.setContentSize(480, 270)
  report('after setContentSize')
  await new Promise((r) => setTimeout(r, 300))

  win.setFocusable(true)
  report('after setFocusable(true)')
  await new Promise((r) => setTimeout(r, 300))

  win.setAlwaysOnTop(true, 'screen-saver')
  report('re-assert topmost')
  await new Promise((r) => setTimeout(r, 300))

  win.setFocusable(false)
  report('setFocusable(false) again')
  app.exit(0)
})
