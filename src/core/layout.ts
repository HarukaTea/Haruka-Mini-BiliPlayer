/**
 * 纯函数：窗口尺寸 / 位置计算。
 * 只接受「矩形」这类普通数据，不直接碰 screen / BrowserWindow，
 * 方便在无显示器环境（比如单测）里推演贴边、居中的结果。
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 浏览窗口尺寸：优先用默认值，但不超出屏幕（留 padding），也不小于小窗 */
export function fitBrowseSize(
  area: Rect,
  preferred: readonly [number, number],
  minimum: readonly [number, number],
  padding: number,
): [number, number] {
  return [
    Math.min(preferred[0], Math.max(minimum[0], area.width - padding)),
    Math.min(preferred[1], Math.max(minimum[1], area.height - padding)),
  ]
}

/** 贴左下角：用窗口真实高度算，避免小数缩放屏上的 DIP 取整误差 */
export function bottomLeftPosition(
  area: Rect,
  height: number,
  margin: number,
): [number, number] {
  return [Math.round(area.x + margin), Math.round(area.y + area.height - height - margin)]
}

/** 屏幕居中 */
export function centeredPosition(
  area: Rect,
  width: number,
  height: number,
): [number, number] {
  return [
    Math.round(area.x + (area.width - width) / 2),
    Math.round(area.y + (area.height - height) / 2),
  ]
}
