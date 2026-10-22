import { app, screen } from 'electron'
import * as fs from 'node:fs'
import type { PlayerApp } from './app'
import type { CliOptions } from './cli'
import { HOME_URL } from './constants'

/**
 * --self-test：在没有显示器的环境里也能检查「窗口 / 页面 / 热键」是否正常。
 * 按时间线跑：截图 → 模拟点开视频 → 调控制函数 → 截图 →（可选）回首页 → 退出。
 */
export function runSelfTest(
  player: PlayerApp,
  cli: CliOptions,
  missingHotkeys: string[],
): void {
  const readDiag = (): Promise<unknown> =>
    player.page.run(`(() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      };
      const v = document.querySelector('video');
      const p = document.querySelector('[data-dsh-iso="1"]');
      return {
        title: (document.title || '').slice(0, 30),
        viewport: [innerWidth, innerHeight, devicePixelRatio],
        hasVideo: !!v,
        isolated: !!p,
        playerSel: p ? p.id || p.className : null,
        playerRect: rect(p),
        videoRect: rect(v),
        videoIntrinsic: v ? [v.videoWidth, v.videoHeight] : null,
        videoFit: v ? getComputedStyle(v).objectFit : null,
        paused: v ? v.paused : null,
        time: v ? Math.round(v.currentTime * 10) / 10 : null,
        duration: v ? Math.round(v.duration * 10) / 10 : null,
        rate: v ? v.playbackRate : null,
        volume: v ? Math.round(v.volume * 100) : null,
        muted: v ? v.muted : null,
        currentSrc: v ? (v.currentSrc || '').slice(0, 60) : null,
        ctrls: (() => {
          const e = document.querySelector('.bpx-player-mini-progress');
          const r = e ? e.getBoundingClientRect() : null;
          return r ? [Math.round(r.width), Math.round(r.height)] : null;
        })(),
      };
    })()`)

  /** 顶栏按钮：读 DOM → 点最大化 → 校验 → 点还原 → 校验 */
  const probeWindowChrome = async (): Promise<void> => {
    const win = player.window
    const wc = win?.webContents
    if (!win || !wc || wc.isDestroyed()) return
    let info: unknown = null
    let error: string | null = null
    let maximized = false
    let restored = false
    try {
      info = await wc.executeJavaScript(`(() => {
        const bar = document.querySelector('.bar');
        return {
          titlebar: !!bar,
          height: bar ? Math.round(bar.getBoundingClientRect().height) : null,
          buttons: document.querySelectorAll('button[data-action]').length,
        };
      })()`)
      // 用真实鼠标事件点按钮（不是 DOM click），顺便验证命中区域：
      // 顶栏从右往左依次是 关闭 / 最大化 / 最小化，各 46px。
      const clickMaximize = (): void => {
        const [width] = win.getContentSize()
        const x = width - 69
        wc.sendInputEvent({ type: 'mouseDown', x, y: 18, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', x, y: 18, button: 'left', clickCount: 1 })
      }
      win.focus()
      clickMaximize()
      await new Promise((r) => setTimeout(r, 900))
      maximized = win.isMaximized()
      clickMaximize()
      await new Promise((r) => setTimeout(r, 900))
      restored = !win.isMaximized()
      await new Promise((r) => setTimeout(r, 200))
    } catch (e) {
      error = String(e)
    }
    console.log('[chrome]', JSON.stringify({ info, maximized, restored, error }))
  }

  const snap = async (tag: string): Promise<void> => {
    const win = player.window
    const ok = !!win && !win.isDestroyed()
    const page = await readDiag()
    console.log(
      '[selftest]',
      JSON.stringify({
        tag,
        mode: player.currentMode,
        window: ok,
        bounds: ok ? win!.getBounds() : null,
        contentSize: ok ? win!.getContentSize() : null,
        workArea: screen.getPrimaryDisplay().workArea,
        focusable: ok ? win!.isFocusable() : null,
        alwaysOnTop: ok ? win!.isAlwaysOnTop() : null,
        maximized: ok ? win!.isMaximized() : null,
        visible: ok ? win!.isVisible() : null,
        hotkeysMissing: missingHotkeys,
        url: player.webView ? player.webView.webContents.getURL().slice(0, 70) : null,
        page: page ?? null,
      }),
    )

    if (cli.screenshot && player.webView) {
      const target =
        tag === 'mini' ? cli.screenshot : cli.screenshot.replace(/\.png$/i, `-${tag}.png`)
      // 刚切尺寸时 capturePage 偶尔抛 UnknownVizError，重试几次
      for (let i = 0; i < 4; i++) {
        try {
          const img = await player.webView.webContents.capturePage()
          fs.writeFileSync(target, img.toPNG())
          console.log('[shot]', target)
          break
        } catch (e) {
          if (i === 3) console.error('[shot-fail]', String(e))
          else await new Promise((r) => setTimeout(r, 400))
        }
      }
    }
  }

  setTimeout(async () => {
    // 1) 浏览模式：先留一张图，再模拟「点开首页第一个视频」
    if (player.currentMode === 'browse') {
      await probeWindowChrome()
      await snap('browse')
      if (cli.noClick) {
        app.exit(0)
        return
      }
      const clicked = await player.page.run(`(() => {
        const a = document.querySelector('a[href*="/video/BV"], a[href*="//www.bilibili.com/video/"]');
        if (!a) return 'no-link';
        const href = a.href || '';
        a.click();
        return href.slice(0, 70);
      })()`)
      console.log('[click]', JSON.stringify(clicked))
      await new Promise((r) => setTimeout(r, 9000))
    }

    // 2) 直接调用控制函数（等价于按热键），验证真的作用到了 <video> 上
    // 先记住原始音量 / 静音 / 倍速：B 站会把音量写进 localStorage，自检不能把它改成 0。
    const mediaBefore = await player.page.run<{
      volume: number
      muted: boolean
      rate: number
    } | null>(`(() => {
      const v = document.querySelector('video');
      return v ? { volume: v.volume, muted: v.muted, rate: v.playbackRate } : null;
    })()`)
    await player.page.seek(30)
    await player.page.speed(1.5)
    await player.page.volume(-10)
    await player.page.togglePlay()
    await player.page.togglePlay()
    await new Promise((r) => setTimeout(r, 900))
    // 点开视频后应该仍是浏览模式（不再自动进小窗），看到的也就是普通 B 站视频页
    await snap('video')

    // 自检结束，恢复原始音量，避免下次启动「默认没声音」
    if (mediaBefore) {
      await player.page.run(`(() => {
        const v = document.querySelector('video');
        if (!v) return;
        const before = ${JSON.stringify(mediaBefore)};
        v.muted = before.muted;
        v.volume = before.volume;
        v.playbackRate = before.rate;
      })()`)
      console.log('[media] 已恢复音量 / 倍速', JSON.stringify(mediaBefore))
    }

    // 3) 回首页，再确认还是浏览模式
    if (cli.roundTrip) {
      if (player.webView) void player.webView.webContents.loadURL(HOME_URL)
      await new Promise((r) => setTimeout(r, 9000))
      await snap('back')
    }

    app.exit(0)
  }, 11000)
}
