/**
 * 原神跑图小窗 —— 左下角置顶的 B 站播放器
 *
 * 设计要点：
 *  1. 独立置顶窗口（不是注入式 overlay），不碰游戏进程，反作弊安全
 *  2. 默认鼠标穿透 + 不抢焦点，点击不会把原神切到后台
 *  3. 热键按焦点切换：窗口在前台走页面 preload（不抢输入），失焦后用系统级全局热键（游戏在前台也能收到）
 *  4. 直接内嵌 B 站播放页，然后把它「裁剪」成纯播放器，白嫖登录态 / 高画质 / 弹幕
 *
 * 模块划分见同目录：
 *  cli / config / constants     启动参数与持久化
 *  app                         窗口 + 双模式 + 导航路由
 *  titlebar / preload          自绘窗口顶栏（最小化 / 最大化 / 关闭）与安全桥
 *  player / injected           页面桥接与注入脚本
 *  hotkeys                     全局热键
 *  selftest                    --self-test 诊断
 *  core/                       纯函数（URL / 时间 / 布局）
 */
import { app, globalShortcut } from 'electron'
import { PlayerApp } from './app'
import { parseCli } from './cli'
import { registerHotkeys, setHotkeysMode } from './hotkeys'
import { runSelfTest } from './selftest'

const cli = parseCli(process.argv.slice(2))

// 不打成安装包直接跑时，Electron 的默认应用名是 "Electron"，userData 会落到
// %APPDATA%\Electron —— 浏览器登录态（partition persist:bili）也会跟着放那儿，
// 和其它 Electron 程序混在一起。显式命名，让数据进自己的目录。
app.setName('haruka-genshin-mini-player')

const player = new PlayerApp(cli)
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // 某些 Windows 安全策略 / 便携环境里，userData 下的单实例锁文件不可写，
  // 这时不能静默退出——宁可多开一个实例，也要让窗口正常起来。
  console.warn('[app] 单实例锁不可用（已有实例或锁文件不可写），按独立实例启动')
} else {
  app.on('second-instance', () => player.focusExisting())
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

app.whenReady().then(() => {
  player.createWindow()

  const { resolved, missing } = registerHotkeys(player)
  console.log('[hotkeys] 已绑定: ' + resolved.map(([l, a]) => `${l}=${a}`).join(' | '))
  if (missing.length) console.log('[hotkeys] 未绑定: ' + missing.join(', '))

  // 窗口聚焦时关闭全局裸键，交给页面 preload（输入框能正常打 0/5/6/9/`）；
  // 失焦（游戏在前台）时再注册，游戏里也能用。
  // 沉浸模式注册 9/5/6/`，只禁用 0，避免误触切换小窗。
  const win = player.window
  const syncHotkeys = (): void => {
    if (player.isImmersive) {
      setHotkeysMode('immersive')
      return
    }
    setHotkeysMode(win && !win.isDestroyed() && win.isFocused() ? 'off' : 'normal')
  }
  // 小窗 blur() / 沉浸切换时 Windows 不一定发 blur 事件，
  // 由模式切换显式补一次同步，否则全局热键会停在错误的集合上。
  player.onModeChanged = syncHotkeys
  player.onImmersiveChanged = syncHotkeys
  win?.on('focus', syncHotkeys)
  win?.on('blur', syncHotkeys)
  syncHotkeys()
  console.log('[hotkeys] 窗口聚焦时页面内处理，失焦后全局生效')

  player.watchDisplays()

  if (cli.selfTest) runSelfTest(player, cli, missing)
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())

// 清理未执行的裁剪定时器
app.on('before-quit', () => player.dispose())
