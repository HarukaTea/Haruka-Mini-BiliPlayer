// 复现主程序：先建一个浏览大小的窗口 + WebContentsView，再在运行时切「左下角小窗」，
// 逐步打印 isAlwaysOnTop()，找出置顶到底被哪一步吃掉了。
const { app, BrowserWindow, WebContentsView, screen, Menu } = require('electron')

const URL0 = 'https://bilibili.com/video/BV19J41157iE'

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  const a = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    x: Math.round(a.x + (a.width - 1200) / 2),
    y: Math.round(a.y + (a.height - 760) / 2),
    frame: false,
    resizable: false,
    useContentSize: true,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    focusable: true,
    hasShadow: false,
    backgroundColor: '#000000',
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  const view = new WebContentsView({
    webPreferences: { partition: 'persist:bili', autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  })
  win.contentView.addChildView(view)
  view.setBounds({ x: 0, y: 0, width: 1200, height: 760 })
  win.on('resize', () => {
    const [w, h] = win.getContentSize()
    view.setBounds({ x: 0, y: 0, width: w, height: h })
  })
  win.show()
  win.focus()
  void view.webContents.loadURL(URL0)

  const log = (s) => console.log(String(s).padEnd(34), 'topmost=' + win.isAlwaysOnTop())
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))

  await wait(6000)
  log('page loaded')

  // —— 完全照 src/modes.ts 里的 enterMini 顺序来 ——
  win.setContentSize(480, 270)
  log('after setContentSize')
  win.setAlwaysOnTop(true, 'screen-saver')
  log('after setAlwaysOnTop(level)')
  win.moveTop()
  log('after moveTop')
  win.setSkipTaskbar(true)
  log('after setSkipTaskbar')
  win.setFocusable(false)
  log('after setFocusable(false)')
  win.setIgnoreMouseEvents(true, { forward: true })
  log('after setIgnoreMouseEvents')
  win.blur()
  log('after blur')
  win.showInactive()
  log('after showInactive')
  await wait(400)
  log('t+400ms')
  await wait(800)
  log('t+1200ms')
  win.setAlwaysOnTop(true, 'screen-saver')
  await wait(300)
  log('re-assert(level) +300ms')
  win.setAlwaysOnTop(true)
  await wait(300)
  log('re-assert(no level) +300ms')
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  await wait(300)
  log('re-assert(level,rel=1) +300ms')
  app.exit(0)
})
