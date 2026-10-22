import { globalShortcut } from 'electron'

/**
 * 热键最终调用的动作集合，由 PlayerApp 实现。
 * 这样 hotkeys 只依赖一个接口，不需要反过来 import app（避免循环依赖）。
 */
export interface HotkeyHost {
  togglePlay(): void
  seek(seconds: number): void
  toggleMode(): void
  toggleImmersive(): void
}

type HotkeyMode = 'normal' | 'immersive' | 'off'

interface HotkeyAction {
  label: string
  accel: string
  run(host: HotkeyHost): void
}

/**
 * 五个裸键：
 *   0  进入 / 退出视频模式（小窗）
 *   5  后退 5 秒
 *   6  前进 5 秒
 *   `  播放 / 暂停
 *   9  进入 / 退出沉浸模式（鼠标移入时整窗半透明，0 停用，播放键仍可用）
 *
 * 裸键做全局热键会抢走输入框里的数字。所以窗口在前台时这几个键交给
 * page-preload / 顶栏 preload 在页面内处理（输入框聚焦时放行），
 * 只有窗口失焦（游戏在前台）时才注册成全局热键。
 * 沉浸模式注册 9 / 5 / 6 / `，只禁用 0，避免误触切换小窗。
 */
const ACTIONS: HotkeyAction[] = [
  { label: '进入 / 退出视频模式', accel: '0', run: (h) => h.toggleMode() },
  { label: '后退 5 秒', accel: '5', run: (h) => h.seek(-5) },
  { label: '前进 5 秒', accel: '6', run: (h) => h.seek(5) },
  { label: '播放 / 暂停', accel: '`', run: (h) => h.togglePlay() },
  { label: '进入 / 退出沉浸模式', accel: '9', run: (h) => h.toggleImmersive() },
]

export interface HotkeyRegistration {
  /** [动作名, 实际绑定的加速键] */
  resolved: Array<[string, string]>
  /** 注册失败的动作 */
  missing: string[]
}

let host: HotkeyHost | null = null
let mode: HotkeyMode = 'normal'

function register(actions: HotkeyAction[]): HotkeyRegistration {
  const resolved: Array<[string, string]> = []
  const missing: string[] = []

  globalShortcut.unregisterAll()
  for (const action of actions) {
    try {
      if (globalShortcut.register(action.accel, () => action.run(host as HotkeyHost))) {
        resolved.push([action.label, action.accel])
      } else {
        missing.push(action.label)
      }
    } catch {
      missing.push(action.label)
    }
  }
  return { resolved, missing }
}

/**
 * 先按 normal 注册一次，拿到「哪些键可用」用于自检；随后由 main 根据
 * 窗口焦点 / 沉浸模式调用 setHotkeysMode() 切换实际生效的集合。
 */
export function registerHotkeys(nextHost: HotkeyHost): HotkeyRegistration {
  host = nextHost
  mode = 'normal'
  return register(ACTIONS)
}

/**
 * normal    = 0 / 5 / 6 / ` / 9 全部可用
 * immersive = 9 / 5 / 6 / `（只禁用 0，避免误触退出小窗）
 * off       = 全部注销（窗口在前台，由页面 preload 处理）
 */
export function setHotkeysMode(next: HotkeyMode): void {
  if (next === mode) return
  mode = next
  if (next === 'off') {
    globalShortcut.unregisterAll()
    return
  }
  register(next === 'immersive' ? ACTIONS.filter((a) => a.accel !== '0') : ACTIONS)
}
