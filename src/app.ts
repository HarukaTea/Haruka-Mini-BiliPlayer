import {
  BrowserWindow,
  Menu,
  WebContentsView,
  ipcMain,
  screen,
} from 'electron'
import * as path from 'node:path'
import type { CliOptions } from './cli'
import { readConfig, writeConfig } from './config'
import { HOME_URL, TITLEBAR_HEIGHT, UA } from './constants'
import { centeredPosition } from './core/layout'
import { isVideoUrl, normalizeVideoInput } from './core/url'
import type { HotkeyHost } from './hotkeys'
import { ModeController, type ResizeCorner } from './modes'
import { PlayerPage } from './player'
import { TITLEBAR_HTML } from './titlebar'

/**
 * 应用控制器：创建窗口 / 接好页面事件 / 导航后维持浏览布局。
 *
 *  - 窗口怎么摆、页面怎么裁剪  → ModeController
 *  - 页面里的操作             → PlayerPage
 *  - 纯计算                   → core/*
 */
export class PlayerApp implements HotkeyHost {
  private win: BrowserWindow | null = null
  private view: WebContentsView | null = null
  /** 每次导航自增，用来丢弃过期的路由判断 */
  private routeSeq = 0

  /** 页面操作入口（OSD / 播放控制 / 自检都走这里） */
  readonly page: PlayerPage
  private readonly modes: ModeController
  /** main 在模式切换后重新同步全局热键（小窗失焦不一定触发 blur） */
  onModeChanged?: (mode: 'browse' | 'mini') => void
  /** 9 键切换沉浸模式后，main 需要把全局热键收窄成只剩 9 */
  onImmersiveChanged?: (on: boolean) => void

  constructor(private readonly cli: CliOptions) {
    this.page = new PlayerPage(() => this.view)
    this.modes = new ModeController({
      getWindow: () => this.win,
      getView: () => this.view,
      page: this.page,
      miniSize: cli.miniSize,
      layout: () => this.layoutView(),
      onModeChange: (mode) => this.onModeChanged?.(mode),
      onImmersiveChange: (on) => this.onImmersiveChanged?.(on),
    })
    this.registerWindowControls()
    this.registerPageHotkeys()
  }

  get currentMode(): 'browse' | 'mini' {
    return this.modes.mode
  }

  get isImmersive(): boolean {
    return this.modes.isImmersive
  }

  get window(): BrowserWindow | null {
    return this.win
  }

  get webView(): WebContentsView | null {
    return this.view
  }

  // ------------------------------------------------------------------ 主窗口

  createWindow(): void {
    const area = screen.getPrimaryDisplay().workArea
    const lastUrl = this.cli.resume ? readConfig().lastUrl : undefined
    // 启动一律是正常浏览窗口；带视频参数 / --resume 也只是直接打开那个视频页，
    // 不再自动缩成小窗（小窗由 0 键手动进入）。
    const [w, h] = this.modes.browseSize()
    const [x, y] = centeredPosition(area, w, h)

    const win = new BrowserWindow({
      width: w,
      height: h,
      x,
      y,
      frame: false,
      // 浏览窗口允许拉伸 / 最大化，交给 Windows 原生窗口管理；
      // 小窗模式会再 setResizable(false)——frameless + resizable 时 Windows 会加一圈
      // 不可见的拖拽边框，bounds 比内容大 7~8px，贴左下角就不准了。
      resizable: true,
      useContentSize: true,
      movable: true,
      maximizable: true,
      minimizable: true,
      fullscreenable: false,
      skipTaskbar: false,
      alwaysOnTop: false,
      focusable: true,
      hasShadow: false,
      backgroundColor: '#16161a',
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    })
    this.win = win

    Menu.setApplicationMenu(null)

    // 顶栏跑在主窗口自己的 webContents 里；B 站页面是下面的 WebContentsView。
    void win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(TITLEBAR_HTML),
    )

    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:bili',
        autoplayPolicy: 'no-user-gesture-required',
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'page-preload.js'),
      },
    })
    this.view = view
    try {
      view.setBackgroundColor('#000000')
    } catch {
      /* ignore */
    }

    win.contentView.addChildView(view)
    this.layoutView()

    win.on('resize', () => {
      if (win.isDestroyed()) return
      this.layoutView()
      this.modes.syncMiniSize()
      void this.page.run(`window.dispatchEvent(new Event('resize'))`)
    })
    win.on('maximize', () => {
      this.layoutView()
      this.notifyMaximized()
    })
    win.on('unmaximize', () => {
      this.layoutView()
      this.notifyMaximized()
      // 还原动画结束后再量一次，避免把动画中间态写进 view bounds
      setTimeout(() => this.layoutView(), 80)
    })
    win.on('restore', () => this.layoutView())

    const wc = view.webContents
    wc.setUserAgent(UA)
    // B 站首页/搜索页的视频卡片都是 target="_blank"，直接 deny 的话点了毫无反应。
    // 这里统统改成「在当前 view 里打开」，视频页也保持正常浏览窗口。
    wc.setWindowOpenHandler(({ url }) => {
      if (url.includes('bilibili.com') || url.includes('b23.tv')) void wc.loadURL(url)
      return { action: 'deny' }
    })
    wc.on('will-navigate', (e, url) => {
      if (url.startsWith('data:') || url.includes('bilibili.com') || url.includes('b23.tv')) return
      e.preventDefault()
    })
    // 视频页不再自动切小窗；只有手动小窗导航到非视频页时才恢复浏览布局
    wc.on('did-navigate', (_e, url) => this.route(url))
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.route(url)
    })
    wc.on('dom-ready', () => this.modes.polish())
    wc.on('did-fail-load', (_e, code, desc, url) => {
      if (code === -3) return // aborted，忽略
      console.error('[load-fail]', code, desc, url)
    })

    win.on('closed', () => {
      this.win = null
      this.view = null
    })

    // 初始页面
    if (this.cli.initialVideo) {
      this.loadVideo(
        normalizeVideoInput(this.cli.initialVideo) ??
          `https://www.bilibili.com/video/${this.cli.initialVideo}`,
      )
    } else if (lastUrl) {
      this.loadVideo(lastUrl)
    } else {
      void wc.loadURL(HOME_URL)
    }

    win.show()
    win.focus()
    setTimeout(() => this.modes.placeBrowse(), 60)
  }

  /** 第二个实例被启动时，把已有窗口提出来 */
  focusExisting(): void {
    if (this.win && !this.win.isDestroyed()) this.win.showInactive()
  }

  /** 跟随显示器变化重新贴边 / 居中 */
  watchDisplays(): void {
    const relayout = (): void => {
      if (this.modes.mode === 'mini') this.modes.placeMini()
      else this.modes.placeBrowse()
    }
    screen.on('display-metrics-changed', relayout)
    screen.on('display-added', relayout)
    screen.on('display-removed', relayout)
  }

  /** 退出前清掉所有排队中的裁剪任务和看门狗 */
  dispose(): void {
    this.modes.dispose()
  }

  // ------------------------------------------------------------------ 窗口控制（顶栏）

  /** 浏览模式给顶栏让出 TITLEBAR_HEIGHT；小窗模式页面铺满整个窗口 */
  private layoutView(): void {
    const win = this.win
    const view = this.view
    if (!win || win.isDestroyed() || !view || view.webContents.isDestroyed()) return
    const [width, height] = win.getContentSize()
    const top = this.modes.mode === 'browse' ? TITLEBAR_HEIGHT : 0
    view.setBounds({ x: 0, y: top, width, height: Math.max(1, height - top) })
  }

  private notifyMaximized(): void {
    const win = this.win
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    win.webContents.send('window:maximized-changed', win.isMaximized())
  }

  /**
   * 顶栏按钮的 IPC。只接受本窗口主 webContents 发来的消息：
   * 小窗的 B 站 view 没有 preload，即使页面被注入也调不到这些通道。
   */
  private registerWindowControls(): void {
    const senderWindow = (
      event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    ): BrowserWindow | null => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return win && win === this.win ? win : null
    }

    ipcMain.on('window:minimize', (event) => {
      senderWindow(event)?.minimize()
    })
    ipcMain.on('window:toggle-maximize', (event) => {
      const win = senderWindow(event)
      if (!win) return
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    })
    ipcMain.on('window:close', (event) => {
      senderWindow(event)?.close()
    })
    ipcMain.handle('window:is-maximized', (event) => {
      return senderWindow(event)?.isMaximized() ?? false
    })

    // 小窗四角缩放手柄：只在 mini 模式下接受 B 站 view 的消息。
    // 手柄 hover 时关掉鼠标穿透，离开 / 松手后再恢复，游戏点击不受影响。
    ipcMain.on('mini:interactive', (event, interactive: unknown) => {
      if (event.sender !== this.view?.webContents) return
      if (this.modes.mode !== 'mini' || !this.win || this.win.isDestroyed()) return
      this.win.setIgnoreMouseEvents(interactive !== true, { forward: true })
    })
    ipcMain.on('mini:resize-start', (event, corner: unknown) => {
      if (event.sender !== this.view?.webContents) return
      if (this.modes.mode !== 'mini') return
      if (corner !== 'nw' && corner !== 'ne' && corner !== 'sw' && corner !== 'se') return
      this.modes.beginMiniResize(corner as ResizeCorner)
    })
    ipcMain.on('mini:resize-stop', (event) => {
      if (event.sender !== this.view?.webContents) return
      this.modes.endMiniResize()
    })
    ipcMain.on('mini:resize', (event, size: unknown) => {
      if (event.sender !== this.view?.webContents) return
      if (this.modes.mode !== 'mini' || !size || typeof size !== 'object') return
      const { width, height, corner } = size as {
        width?: unknown
        height?: unknown
        corner?: unknown
      }
      if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        return
      }
      if (corner !== 'nw' && corner !== 'ne' && corner !== 'sw' && corner !== 'se') return
      this.modes.resizeMini(width, height, corner as ResizeCorner)
    })
  }

  // ------------------------------------------------------------------ 页面内热键

  /**
   * 窗口聚焦时，裸键由页面 / 顶栏的 preload 捕获后发到这里。
   * 只接受本窗口两个 webContents 的消息，页面里的脚本即使拿到 ipcRenderer 也调不动。
   */
  private registerPageHotkeys(): void {
    ipcMain.on('page:hotkey', (event, key: unknown) => {
      if (typeof key !== 'string') return
      const wc = event.sender
      if (wc !== this.view?.webContents && wc !== this.win?.webContents) return
      this.handleHotkey(key)
    })
  }

  private handleHotkey(key: string): void {
    if (key === '9') {
      this.toggleImmersive()
      return
    }
    // 沉浸模式下页面不应再收到其它键；这里再兜一层，避免旧页面状态漏进来
    if (this.modes.isImmersive) return
    switch (key) {
      case '0':
        this.toggleMode()
        break
      case '5':
        this.seek(-5)
        break
      case '6':
        this.seek(5)
        break
      case '`':
        this.togglePlay()
        break
    }
  }

  // ------------------------------------------------------------------ 导航 / 载入

  /** 载入一个视频（BV 号或完整 URL），并记住它供 --resume 使用 */
  private loadVideo(src: string): void {
    if (!this.view) return
    const url = /^https?:\/\//i.test(src) ? src : `https://www.bilibili.com/video/${src}`
    void this.view.webContents.loadURL(url)
    writeConfig({ lastUrl: url })
  }

  // ------------------------------------------------------------------ 路由

  /**
   * 导航后保持正常浏览窗口：视频页也只是普通 B 站页面，不再自动进小窗。
   * 只有用户手动进过小窗（0 键）时，导航到非视频页才恢复浏览布局。
   */
  private route(url: string): void {
    if (!url || url.startsWith('data:') || !url.includes('bilibili.com')) return
    const seq = ++this.routeSeq
    if (this.modes.mode !== 'mini') return
    if (isVideoUrl(url)) return

    // URL 认不出来的页面（活动专题 / 番剧特殊路径等）看页面里有没有真的在放视频
    setTimeout(async () => {
      if (seq !== this.routeSeq) return
      const video = await this.page.hasVideo()
      if (seq !== this.routeSeq) return
      if (!video) this.modes.enterBrowse(true)
    }, 1500)
  }

  // ------------------------------------------------------------------ 热键动作

  togglePlay(): void {
    void this.page.togglePlay()
  }

  seek(seconds: number): void {
    void this.page.seek(seconds)
  }

  toggleMode(): void {
    this.modes.toggleMode()
  }

  toggleImmersive(): void {
    void this.modes.toggleImmersive()
  }
}
