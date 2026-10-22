import type { BrowserWindow, WebContentsView } from 'electron'
import { screen } from 'electron'
import { BROWSE_DEFAULT, BROWSE_PADDING, IMMERSIVE_OPACITY, MARGIN, MINI_MIN, type Mode } from './constants'
import { bottomLeftPosition, centeredPosition, fitBrowseSize } from './core/layout'
import { isVideoUrl } from './core/url'
import type { PlayerPage } from './player'

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

export interface ModeDeps {
  getWindow(): BrowserWindow | null
  getView(): WebContentsView | null
  page: PlayerPage
  /** 小窗尺寸（--size 已解析） */
  miniSize: readonly [number, number]
  /** 顶栏让位 / 复位后重排 WebContentsView */
  layout(): void
  /**
   * 模式切换完成后的通知。小窗会 setFocusable(false) 再 blur()，
   * Windows 上这次失焦不一定触发 blur 事件，需要显式重算全局热键。
   */
  onModeChange?: (mode: Mode) => void
  /** 沉浸模式开关后通知 main 收窄 / 恢复全局热键 */
  onImmersiveChange?: (on: boolean) => void
}

/**
 * 窗口模式控制器：browse（正常浏览）⇄ mini（左下角置顶播放器）。
 *
 * 这里只回答「窗口该怎么摆、页面该不该裁剪」；
 * 「什么时候切模式」由 PlayerApp 的热键动作（0 键）决定。
 */
export class ModeController {
  private active: Mode = 'browse'
  private polishTimers: NodeJS.Timeout[] = []
  private topWatch: NodeJS.Timeout | null = null
  /** 小窗当前尺寸：允许拖拽缩放，切回浏览再切回来时沿用 */
  private miniWidth: number
  private miniHeight: number
  /** 一次拖拽的固定锚点：整个拖拽过程都从 mousedown 时的外框算，避免 1px 取整误差累积 */
  private resizeAnchor: {
    corner: ResizeCorner
    left: number
    top: number
    right: number
    bottom: number
    borderW: number
    borderH: number
  } | null = null
  /** 沉浸模式：鼠标进入窗口时整窗半透明；只停用 0，播放键与 9 仍可用 */
  private immersive = false
  /** 沉浸模式下轮询鼠标是否在窗口内，只在悬停时降低不透明度 */
  private hoverTimer: NodeJS.Timeout | null = null
  private cursorInside = false

  constructor(private readonly deps: ModeDeps) {
    this.miniWidth = deps.miniSize[0]
    this.miniHeight = deps.miniSize[1]
  }

  /** 当前模式；启动固定为 browse，小窗只由 0 / 9 键手动进入 */
  get mode(): Mode {
    return this.active
  }

  get isImmersive(): boolean {
    return this.immersive
  }

  // -------------------------------------------------------------- 沉浸模式

  /** 9 键：进入 / 退出沉浸模式；在浏览模式按 9 会先确认有视频，再进小窗 */
  async toggleImmersive(): Promise<void> {
    if (this.immersive) {
      this.exitImmersive()
      return
    }
    const isMini = (): boolean => this.active === 'mini'
    if (!isMini()) {
      if (!(await this.deps.page.hasVideo())) {
        this.deps.page.osd('先点开一个视频，再按 9')
        return
      }
      await this.enterMini(true)
      if (!isMini()) return
    }
    this.enterImmersive()
  }

  enterImmersive(): void {
    if (this.immersive || this.active !== 'mini') return
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return

    this.immersive = true
    this.deps.page.run('document.body.classList.add("dsh-immersive")')
    try {
      // 进入时先保持不透明；鼠标移到窗口上才降透明度。
      win.setOpacity(1)
    } catch {
      /* ignore */
    }
    try {
      win.setIgnoreMouseEvents(true, { forward: true })
      // 沉浸时窗口不接受焦点，避免点任务栏把游戏切走；退出仍靠全局 9。
      win.setFocusable(false)
      win.blur()
    } catch {
      /* ignore */
    }
    this.startHoverWatch()
    this.deps.onImmersiveChange?.(true)
    console.log('[mode] → immersive, hover opacity=' + IMMERSIVE_OPACITY)
  }

  exitImmersive(): void {
    if (!this.immersive) return
    this.immersive = false
    this.stopHoverWatch()
    this.cursorInside = false
    this.deps.page.run('document.body.classList.remove("dsh-immersive")')
    const win = this.deps.getWindow()
    if (win && !win.isDestroyed()) {
      try {
        win.setOpacity(1)
      } catch {
        /* ignore */
      }
      try {
        win.setIgnoreMouseEvents(true, { forward: true })
        win.setFocusable(true)
        win.setSkipTaskbar(false)
      } catch {
        /* ignore */
      }
    }
    this.deps.onImmersiveChange?.(false)
    console.log('[mode] ← immersive')
  }

  /** 鼠标一进窗口就把整窗降到半透明，离开立刻恢复不透明 */
  private startHoverWatch(): void {
    this.stopHoverWatch()
    this.cursorInside = false
    this.updateHover(true)
    this.hoverTimer = setInterval(() => this.updateHover(), 40)
  }

  private stopHoverWatch(): void {
    if (this.hoverTimer) {
      clearInterval(this.hoverTimer)
      this.hoverTimer = null
    }
  }

  private updateHover(force = false): void {
    if (!this.immersive) return
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return

    const point = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    const inside =
      point.x >= bounds.x &&
      point.y >= bounds.y &&
      point.x < bounds.x + bounds.width &&
      point.y < bounds.y + bounds.height
    if (!force && inside === this.cursorInside) return

    this.cursorInside = inside
    try {
      win.setOpacity(inside ? IMMERSIVE_OPACITY : 1)
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ 布局

  /** 小窗位置：左下角（用窗口真实高度，避开小数缩放屏幕上的 DIP 取整误差） */
  placeMini(): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return
    const area = screen.getPrimaryDisplay().workArea
    // frameless 窗口在浏览模式会有一圈不可见边框；按 content 区域贴边，
    // 再把窗口原点减掉边框偏移，视觉上才真正贴住左下角（小窗关掉 resize 后偏移为 0）。
    const bounds = win.getBounds()
    const content = win.getContentBounds()
    const [x, y] = bottomLeftPosition(area, content.height || this.miniHeight, MARGIN)
    win.setPosition(x - (content.x - bounds.x), y - (content.y - bounds.y))
  }

  /** 浏览窗口位置：屏幕居中 */
  placeBrowse(): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return
    const area = screen.getPrimaryDisplay().workArea
    // 用外框尺寸居中：浏览模式 resizable 为 true，Windows 会加一圈不可见边框
    const { width, height } = win.getBounds()
    const [x, y] = centeredPosition(area, width, height)
    win.setPosition(x, y)
  }

  /** 浏览窗口尺寸：默认 1200x760，但不超过屏幕、也不小于小窗 */
  browseSize(): [number, number] {
    return fitBrowseSize(
      screen.getPrimaryDisplay().workArea,
      BROWSE_DEFAULT,
      this.deps.miniSize,
      BROWSE_PADDING,
    )
  }

  /** 开始一次小窗拖拽：记录当前外框，之后所有 resize 都以它为锚，避免累积漂移 */
  beginMiniResize(corner: ResizeCorner): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return
    const bounds = win.getBounds()
    const content = win.getContentBounds()
    this.resizeAnchor = {
      corner,
      left: bounds.x,
      top: bounds.y,
      right: bounds.x + bounds.width,
      bottom: bounds.y + bounds.height,
      borderW: Math.max(0, bounds.width - content.width),
      borderH: Math.max(0, bounds.height - content.height),
    }
  }

  /** 松开鼠标：下一次拖拽重新取锚点 */
  endMiniResize(): void {
    this.resizeAnchor = null
  }

  /** 小窗四角拖拽缩放：夹在 MINI_MIN 与工作区之间，并让拖拽角的对角保持不动 */
  resizeMini(width: number, height: number, corner: ResizeCorner): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed() || this.active !== 'mini') return
    const area = screen.getPrimaryDisplay().workArea
    const maxWidth = Math.max(MINI_MIN[0], area.width - MARGIN * 2)
    const maxHeight = Math.max(MINI_MIN[1], area.height - MARGIN * 2)
    const w = Math.min(Math.max(MINI_MIN[0], Math.round(width)), maxWidth)
    const h = Math.min(Math.max(MINI_MIN[1], Math.round(height)), maxHeight)
    this.miniWidth = w
    this.miniHeight = h

    if (!this.resizeAnchor || this.resizeAnchor.corner !== corner) this.beginMiniResize(corner)
    const anchor = this.resizeAnchor
    if (!anchor) return

    // 拖哪个角，就固定它的对角：NW 固定右下、NE 固定左下、SW 固定右上、SE 固定左上。
    // 始终用拖拽开始时的外框锚点，而不是上一帧的 bounds；后者会因 Windows 的
    // 1px 取整在每次 mousemove 后累积，表现就是窗口一直往右/往下漂。
    const outerW = w + anchor.borderW
    const outerH = h + anchor.borderH
    let x = anchor.left
    let y = anchor.top
    if (corner === 'nw' || corner === 'sw') x = anchor.right - outerW
    if (corner === 'nw' || corner === 'ne') y = anchor.bottom - outerH
    // 贴到屏幕边缘时不再继续出界；夹住后对角可能略微移动，优先保证窗口可见。
    x = Math.min(Math.max(x, area.x), Math.max(area.x, area.x + area.width - outerW))
    y = Math.min(Math.max(y, area.y), Math.max(area.y, area.height - outerH))
    win.setBounds({ x, y, width: outerW, height: outerH })
    this.deps.layout()
  }

  /** 程序改尺寸后同步记录，避免切回小窗时跳回旧尺寸 */
  syncMiniSize(): void {
    if (this.active !== 'mini') return
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return
    const [w, h] = win.getContentSize()
    this.miniWidth = w
    this.miniHeight = h
  }

  // ------------------------------------------------------------------ 模式切换

  /** 切到小窗：左下角、置顶、鼠标穿透、页面裁剪成纯播放器 */
  async enterMini(silent = false): Promise<void> {
    if (this.immersive) return
    let win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return

    if (this.active === 'mini') {
      this.placeMini()
      return
    }

    const view = this.deps.getView()
    const url = view && !view.webContents.isDestroyed() ? view.webContents.getURL() : ''
    if (!isVideoUrl(url) && !(await this.deps.page.hasVideo())) {
      if (!silent) this.deps.page.osd('先点开一个视频，再按这个键')
      return
    }

    // hasVideo() 期间窗口可能被关掉，重新取一次
    win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return

    this.active = 'mini'
    this.resizeAnchor = null
    try {
      win.setOpacity(1)
    } catch {
      /* ignore */
    }

    // 从最大化直接切小窗时先还原，否则 setContentSize 会被还原动画覆盖。
    if (win.isMaximized()) {
      win.unmaximize()
      await new Promise((resolve) => setTimeout(resolve, 260))
      win = this.deps.getWindow()
      if (!win || win.isDestroyed()) return
    }

    // 小窗缩放完全由页面四角手柄 + 固定锚点 setBounds 完成。必须关掉原生 resize / 移动，
    // 否则四角 24px 热区会先被 Windows 当成非客户区边框，拖拽时触发系统停靠。
    win.setResizable(false)
    win.setMovable(false)
    win.setMinimumSize(MINI_MIN[0], MINI_MIN[1])

    // 顺序很重要：先置顶再改尺寸。反过来的话紧跟 setContentSize 的那次 setAlwaysOnTop
    // 会被 Windows 吞掉（实测 isAlwaysOnTop() 一直是 false），窗口就压不住游戏了。
    win.setAlwaysOnTop(true, 'screen-saver')
    win.moveTop()
    win.setContentSize(this.miniWidth, this.miniHeight)
    this.deps.layout()
    try {
      // 小窗保留任务栏图标（否则用户找不到窗口）；可聚焦但鼠标穿透，
      // 点任务栏图标能把焦点还给小窗，点画面仍然直接落到游戏。
      win.setSkipTaskbar(false)
      win.setFocusable(true)
      win.setIgnoreMouseEvents(true, { forward: true })
    } catch {
      /* ignore */
    }
    win.blur()
    win.showInactive()
    console.log('[mode] → mini, top=' + win.isAlwaysOnTop())
    // 切换焦点状态时 Windows 不一定会发 blur，显式通知 main 重新同步热键
    this.deps.onModeChange?.('mini')
    void this.deps.page.run('window.dispatchEvent(new Event("resize"))')
    this.polish()
    if (!silent) this.deps.page.osd('🔒 小窗模式')
    setTimeout(() => this.placeMini(), 60)
    setTimeout(() => this.placeMini(), 500)
    // 尺寸变化 / 别的程序抢顶层都可能把置顶顶掉，隔一会儿补几次，之后交给看门狗
    for (const delay of [150, 600, 1500]) {
      setTimeout(() => {
        const w = this.deps.getWindow()
        if (this.active !== 'mini' || !w || w.isDestroyed()) return
        w.setAlwaysOnTop(true, 'screen-saver')
      }, delay)
    }
    this.startTopWatch()
  }

  /** 切到浏览：正常大小的窗口，可搜索 / 登录 / 点视频 */
  enterBrowse(silent = false): void {
    const win = this.deps.getWindow()
    if (!win || win.isDestroyed()) return
    if (this.immersive) this.exitImmersive()
    try {
      win.setOpacity(1)
    } catch {
      /* ignore */
    }

    if (this.active === 'browse') {
      this.placeBrowse()
      return
    }

    this.active = 'browse'
    this.resizeAnchor = null
    // 小窗阶段排队的裁剪任务必须全部取消，否则它们会在浏览模式里把页面又裁成播放器
    for (const t of this.polishTimers) clearTimeout(t)
    this.polishTimers = []
    void this.deps.page.unisolate()
    // 页面自己也可能重排，稍后再还原一次
    setTimeout(() => {
      if (this.active === 'browse') void this.deps.page.unisolate()
    }, 600)

    const [w, h] = this.browseSize()
    // 回到浏览模式恢复可拉伸 / 可移动 / 可最大化，顶栏让出的 36px 由 layout() 重排
    win.setResizable(true)
    win.setMovable(true)
    win.setMinimumSize(this.deps.miniSize[0], this.deps.miniSize[1])
    win.setContentSize(w, h)
    this.deps.layout()
    win.setAlwaysOnTop(false)
    this.stopTopWatch()
    console.log('[mode] → browse, alwaysOnTop=' + win.isAlwaysOnTop())
    try {
      win.setSkipTaskbar(false)
      win.setFocusable(true)
      win.setIgnoreMouseEvents(false)
    } catch {
      /* ignore */
    }
    win.show()
    win.focus()
    // 小窗切回来时重新评估一次；focus 事件也会触发同样的同步
    this.deps.onModeChange?.('browse')
    setTimeout(() => this.placeBrowse(), 60)
    if (!silent) this.deps.page.osd('🔓 浏览模式：可以搜索 / 登录 / 点视频')
  }

  /** 小窗 ←→ 浏览；沉浸模式下 0 不生效，避免误触退出 */
  toggleMode(): void {
    if (this.immersive) return
    if (this.active === 'mini') this.enterBrowse()
    else void this.enterMini()
  }

  // ------------------------------------------------------------------ 页面裁剪

  /** 只有小窗模式才把页面裁剪成播放器；浏览模式下必须保持原样，否则没法搜索和点视频 */
  polish(): void {
    const view = this.deps.getView()
    if (!view || view.webContents.isDestroyed()) return
    const url = view.webContents.getURL()
    if (!url.includes('bilibili.com')) return

    for (const t of this.polishTimers) clearTimeout(t)
    this.polishTimers = []
    this.deps.page.applyBaseCss()
    if (this.active !== 'mini') return

    // 播放器可能晚于 dom-ready 出现，多戳几次；每次真正执行前再确认一次模式，
    // 否则用户已经切回浏览模式时这些排队任务会把页面重新裁成播放器。
    for (const delay of [0, 400, 1200, 2500]) {
      this.polishTimers.push(
        setTimeout(() => {
          if (this.active === 'mini') this.deps.page.isolate()
        }, delay),
      )
    }
  }

  /** 退出前清掉所有排队中的裁剪任务和看门狗 */
  dispose(): void {
    for (const t of this.polishTimers) clearTimeout(t)
    this.polishTimers = []
    this.stopTopWatch()
    this.stopHoverWatch()
  }

  /** 小窗模式下守着置顶状态：别的窗口抢了顶层就再顶回来 */
  private startTopWatch(): void {
    this.stopTopWatch()
    this.topWatch = setInterval(() => {
      const win = this.deps.getWindow()
      if (this.active !== 'mini' || !win || win.isDestroyed()) return
      if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver')
    }, 2000)
  }

  private stopTopWatch(): void {
    if (this.topWatch) clearInterval(this.topWatch)
    this.topWatch = null
  }
}
