import { MINI_DEFAULT } from './constants'

/** 命令行参数解析结果，供窗口 / 自检模块使用 */
export interface CliOptions {
  /** --self-test：打印诊断信息后退出 */
  selfTest: boolean
  /** --resume：启动时恢复上次看的视频（仍是正常浏览窗口） */
  resume: boolean
  /** 小窗尺寸，默认 480x270，可用 --size=640x360 覆盖 */
  miniSize: [number, number]
  /** 命令行里直接指定的视频：BV 号 / av 号 / 链接 */
  initialVideo: string | null
  /** --shot=out.png：自检时把画面截图存到 out.png */
  screenshot: string | null
  /** --no-click：自检停在浏览模式，不自动点视频 */
  noClick: boolean
  /** --roundtrip：自检「浏览 → 点视频（保持浏览）→ 回首页」整条链路 */
  roundTrip: boolean
}

const SIZE_RE = /^(\d{2,4})x(\d{2,4})$/i

export function parseCli(argv: readonly string[]): CliOptions {
  const has = (flag: string): boolean => argv.includes(flag)
  const valueOf = (prefix: string): string | null => {
    const hit = argv.find((a) => a.startsWith(prefix))
    return hit === undefined ? null : hit.slice(prefix.length)
  }

  // 小窗尺寸：默认 480x270（16:9），--size=640x360 之类覆盖；下限 240x135
  const sizeArg = valueOf('--size=')
  const sizeMatch = sizeArg ? SIZE_RE.exec(sizeArg) : null
  const miniSize: [number, number] = sizeMatch
    ? [Math.max(240, Number(sizeMatch[1])), Math.max(135, Number(sizeMatch[2]))]
    : MINI_DEFAULT

  return {
    selfTest: has('--self-test'),
    resume: has('--resume'),
    miniSize,
    initialVideo:
      argv.find(
        (a) => /^https?:\/\//i.test(a) || /BV[0-9A-Za-z]{10}/.test(a) || /av\d+/i.test(a),
      ) ?? null,
    screenshot: valueOf('--shot='),
    noClick: has('--no-click'),
    roundTrip: has('--roundtrip'),
  }
}
