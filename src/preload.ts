import { contextBridge, ipcRenderer } from 'electron'

/**
 * 顶栏页面的 preload：只暴露窗口控制所需的四个方法，不向页面开放 Node。
 * 主进程会校验消息确实来自本窗口（见 app.ts）。
 */
const windowControls = {
  minimize: (): void => ipcRenderer.send('window:minimize'),
  toggleMaximize: (): void => ipcRenderer.send('window:toggle-maximize'),
  close: (): void => ipcRenderer.send('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback: (maximized: boolean) => void): void => {
    ipcRenderer.on('window:maximized-changed', (_event: Electron.IpcRendererEvent, maximized: boolean) => {
      callback(maximized)
    })
  },
}

contextBridge.exposeInMainWorld('windowControls', windowControls)

// 顶栏获得键盘焦点时也接管这四个裸键（例如刚启动、还没点进页面）
const HOTKEYS = new Set(['0', '5', '6', '9', '`'])

window.addEventListener(
  'keydown',
  (event) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return
    if (!HOTKEYS.has(event.key)) return

    event.preventDefault()
    event.stopPropagation()
    ipcRenderer.send('page:hotkey', event.key)
  },
  true,
)
