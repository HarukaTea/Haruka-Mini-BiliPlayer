import { ipcRenderer } from 'electron'

/**
 * B 站页面内的裸键处理。只在窗口聚焦时工作：输入框聚焦时直接放行，
 * 其余情况把 0 / 5 / 6 / ` 转给主进程，避免全局 RegisterHotKey 抢走输入。
 */
const HOTKEYS = new Set(['0', '5', '6', '9', '`'])

/** 沉浸模式由主进程给 body 加类，页面内不再抢任何键 / 手柄 */
function isImmersive(): boolean {
  return document.body?.classList.contains('dsh-immersive') === true
}

function isEditable(el: Element | null): boolean {
  if (!el) return false
  if (document.designMode === 'on') return true
  if ((el as HTMLElement).isContentEditable === true) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

window.addEventListener(
  'keydown',
  (event) => {
    if (event.defaultPrevented || event.isComposing) return
    if (isImmersive()) return
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
    if (!HOTKEYS.has(event.key)) return
    if (isEditable(document.activeElement)) return

    event.preventDefault()
    event.stopPropagation()
    ipcRenderer.send('page:hotkey', event.key)
  },
  true,
)

/**
 * 小窗四角的拖拽缩放。
 *
 * 小窗默认 setIgnoreMouseEvents(true)（鼠标穿透到游戏），因此不能依赖原生
 * 窗口边框。光标进入任意一角 24px 热区时临时开启窗口交互，拖拽期间用
 * screenX/Y 算新尺寸，并把「哪个角」一起发给主进程，由主进程让对角保持不动。
 */
type Corner = 'nw' | 'ne' | 'sw' | 'se'

const GRIP_SIZE = 24
const CURSORS: Record<Corner, string> = {
  nw: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  se: 'nwse-resize',
}
let interactive = false
let dragging = false
let activeCorner: Corner | null = null
let startScreenX = 0
let startScreenY = 0
let startWidth = 0
let startHeight = 0
let resizeFrame = 0
let pendingSize: { width: number; height: number; corner: Corner } | null = null

function cornerAt(x: number, y: number): Corner | null {
  if (isImmersive()) return null
  const left = x <= GRIP_SIZE
  const right = x >= window.innerWidth - GRIP_SIZE
  const top = y <= GRIP_SIZE
  const bottom = y >= window.innerHeight - GRIP_SIZE
  if (left && top) return 'nw'
  if (right && top) return 'ne'
  if (left && bottom) return 'sw'
  if (right && bottom) return 'se'
  return null
}

function setHot(corner: Corner | null): void {
  for (const grip of Array.from(document.querySelectorAll<HTMLElement>('.dsh-mini-grip'))) {
    grip.classList.toggle('dsh-grip-hot', corner !== null && grip.id === `dsh-mini-grip-${corner}`)
  }
}

function setInteractive(on: boolean): void {
  if (interactive === on) return
  interactive = on
  ipcRenderer.send('mini:interactive', on)
}

function flushResize(): void {
  resizeFrame = 0
  if (!pendingSize) return
  ipcRenderer.send('mini:resize', pendingSize)
  pendingSize = null
}

window.addEventListener(
  'mousemove',
  (event) => {
    if (isImmersive()) return
    if (dragging && activeCorner) {
      const dx = event.screenX - startScreenX
      const dy = event.screenY - startScreenY
      const west = activeCorner === 'nw' || activeCorner === 'sw'
      const north = activeCorner === 'nw' || activeCorner === 'ne'
      pendingSize = {
        width: Math.round(startWidth + (west ? -dx : dx)),
        height: Math.round(startHeight + (north ? -dy : dy)),
        corner: activeCorner,
      }
      if (!resizeFrame) resizeFrame = requestAnimationFrame(flushResize)
      return
    }

    const corner = cornerAt(event.clientX, event.clientY)
    activeCorner = corner
    setHot(corner)
    setInteractive(corner !== null)
  },
  true,
)

window.addEventListener(
  'mousedown',
  (event) => {
    if (event.button !== 0) return
    const corner = cornerAt(event.clientX, event.clientY)
    if (!corner) return
    event.preventDefault()
    event.stopPropagation()
    dragging = true
    activeCorner = corner
    ipcRenderer.send('mini:resize-start', corner)
    startScreenX = event.screenX
    startScreenY = event.screenY
    startWidth = window.innerWidth
    startHeight = window.innerHeight
    document.body.classList.add('dsh-resizing')
    document.body.style.cursor = CURSORS[corner]
    setHot(corner)
    setInteractive(true)
  },
  true,
)

window.addEventListener(
  'mouseup',
  (event) => {
    if (!dragging) return
    dragging = false
    document.body.classList.remove('dsh-resizing')
    document.body.style.cursor = ''
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame)
      resizeFrame = 0
    }
    if (pendingSize) {
      ipcRenderer.send('mini:resize', pendingSize)
      pendingSize = null
    }
    ipcRenderer.send('mini:resize-stop')
    // 松手时如果还在角上，保持交互，避免下一次移动又来回切换穿透
    activeCorner = cornerAt(event.clientX, event.clientY)
    setHot(activeCorner)
    setInteractive(activeCorner !== null)
  },
  true,
)

window.addEventListener('blur', () => {
  if (dragging) ipcRenderer.send('mini:resize-stop')
  dragging = false
  activeCorner = null
  document.body.classList.remove('dsh-resizing')
  document.body.style.cursor = ''
  setHot(null)
  setInteractive(false)
})
