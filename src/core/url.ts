/** 纯函数：视频 URL / 输入识别，不依赖 Electron，方便单独调试。 */

/**
 * 是不是「可以直接进小窗」的视频页。
 * 覆盖：常规视频页 / 番剧 / 课程 / 文集 / 稍后再看 / 活动专题页
 * （很多活动页其实就是个播放器）。
 */
export function isVideoUrl(url: string): boolean {
  return /bilibili\.com\/(video|bangumi\/play|cheese\/play|medialist\/play|list\/watchlater|festival)/i.test(
    url,
  )
}

/** BV 号 / av 号 / 链接 → 可直接载入的 URL；认不出来返回 null */
export function normalizeVideoInput(raw: string): string | null {
  const text = (raw || '').trim()
  if (!text) return null

  const bv = text.match(/BV[0-9A-Za-z]{10}/)
  if (bv) {
    const p = text.match(/[?&]p=(\d+)/)
    return `https://www.bilibili.com/video/${bv[0]}${p ? `?p=${p[1]}` : ''}`
  }

  const av = text.match(/av(\d+)/i)
  if (av) return `https://www.bilibili.com/video/av${av[1]}`

  if (/^https?:\/\//i.test(text)) return text
  return null
}
