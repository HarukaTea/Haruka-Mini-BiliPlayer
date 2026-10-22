/**
 * 全局常量：窗口尺寸、留白、首页地址。
 * 这里不放任何运行时状态，方便被窗口 / 布局 / 自检等模块共用。
 */

/** 窗口贴边留白（px） */
export const MARGIN = 16

/** 浏览窗口自绘顶栏高度（px）；小窗模式下顶栏被页面盖住 */
export const TITLEBAR_HEIGHT = 36

export const HOME_URL = 'https://www.bilibili.com'

// 小窗（跟跑视频用）与浏览窗口（搜索 / 登录 / 挑视频用）的默认尺寸
export const MINI_DEFAULT: [number, number] = [480, 270]
export const BROWSE_DEFAULT: [number, number] = [1200, 760]

/** 小窗拖拽缩放的下限；再小视频就看不清了 */
export const MINI_MIN: [number, number] = [240, 135]

/** 浏览窗口计算尺寸时给屏幕四周预留的边距（px） */
export const BROWSE_PADDING = 120

/** 沉浸模式：鼠标悬停在窗口上时的不透明度（1 = 不透明，越低越透） */
export const IMMERSIVE_OPACITY = 0.4

/** browse = 正常网页，可点可输入；mini = 左下角置顶播放器，鼠标穿透 */
export type Mode = 'browse' | 'mini'

/** B 站会检查 UA，用桌面 Chrome 的 UA 避免被当成不支持的浏览器 */
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
