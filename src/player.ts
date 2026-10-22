import type { WebContentsView } from 'electron'
import { formatTime } from './core/format'
import { BASE_CSS, ISOLATE_JS, UNISOLATE_JS, VIDEO_EXPR } from './injected'

type ViewGetter = () => WebContentsView | null

/**
 * 页面桥接层：所有「对 B 站页面做的事」都收敛在这里。
 * 播放控制全部直接操作 document.querySelector('video') 的
 * paused / currentTime / volume / playbackRate，不依赖 B 站内部 API。
 */
export class PlayerPage {
  constructor(private readonly getView: ViewGetter) {}

  /** 在页面里执行 JS；视图已销毁或脚本抛错时返回 undefined，调用方不必处理异常 */
  async run<T = unknown>(js: string): Promise<T | undefined> {
    const view = this.getView()
    if (!view || view.webContents.isDestroyed()) return undefined
    try {
      return (await view.webContents.executeJavaScript(js, true)) as T
    } catch {
      return undefined
    }
  }

  /** 注入基础样式：去滚动条 / 去黑边，让 <video> 铺满窗口 */
  applyBaseCss(): void {
    const view = this.getView()
    if (!view || view.webContents.isDestroyed()) return
    void view.webContents.insertCSS(BASE_CSS)
  }

  /** 把页面裁剪成纯播放器（只有小窗模式该调用） */
  isolate(): void {
    void this.run(ISOLATE_JS)
  }

  /** 还原被裁剪前的页面（切回浏览模式时调用） */
  unisolate(): void {
    void this.run(UNISOLATE_JS)
  }

  /** 左上角闪一条提示 */
  osd(text: string): void {
    const payload = JSON.stringify(text)
    void this.run(`(() => {
      let el = document.getElementById('__dsh_osd');
      if (!el) {
        el = document.createElement('div');
        el.id = '__dsh_osd';
        el.style.cssText =
          'position:fixed;left:10px;top:10px;z-index:2147483647;padding:3px 10px;' +
          'border-radius:999px;background:rgba(0,0,0,.72);color:#fff;' +
          'font:12px/1.7 "Microsoft YaHei UI",system-ui;pointer-events:none;' +
          'transition:opacity .25s;opacity:0';
        (document.body || document.documentElement).appendChild(el);
      }
      el.textContent = ${payload};
      el.style.opacity = '1';
      clearTimeout(window.__dsh_osd_t);
      window.__dsh_osd_t = setTimeout(() => { el.style.opacity = '0'; }, 1100);
    })()`)
  }

  async togglePlay(): Promise<void> {
    const r = await this.run<string>(`(() => {
      const v = ${VIDEO_EXPR};
      if (!v) return 'none';
      if (v.paused) { v.play().catch(() => {}); return 'playing'; }
      v.pause(); return 'paused';
    })()`)
    if (r === 'playing') this.osd('▶ 播放')
    else if (r === 'paused') this.osd('⏸ 暂停')
    else this.osd('还没有载入视频')
  }

  async seek(delta: number): Promise<void> {
    const t = await this.run<number | null>(`(() => {
      const v = ${VIDEO_EXPR};
      if (!v) return null;
      const max = isFinite(v.duration) ? v.duration : 1e9;
      v.currentTime = Math.max(0, Math.min(max, v.currentTime + (${delta})));
      return v.currentTime;
    })()`)
    if (typeof t === 'number') this.osd(`${delta > 0 ? '+' : ''}${delta}s  ${formatTime(t)}`)
    else this.osd('还没有载入视频')
  }

  async volume(delta: number): Promise<void> {
    const pct = await this.run<number | null>(`(() => {
      const v = ${VIDEO_EXPR};
      if (!v) return null;
      v.muted = false;
      v.volume = Math.max(0, Math.min(1, v.volume + (${delta / 100})));
      return Math.round(v.volume * 100);
    })()`)
    if (typeof pct === 'number') this.osd(`音量 ${pct}%`)
  }

  async speed(rate: number): Promise<void> {
    const r = await this.run<number | null>(`(() => {
      const v = ${VIDEO_EXPR};
      if (!v) return null;
      v.playbackRate = ${rate};
      return v.playbackRate;
    })()`)
    if (typeof r === 'number') this.osd(`速度 ${r}×`)
  }

  /** 页面里是否真有一个在放的视频（URL 认不出来时靠这个兜底） */
  async hasVideo(): Promise<boolean> {
    const r = await this.run<boolean>(`(() => {
      const v = document.querySelector('video');
      if (!v) return false;
      return !!((v.currentSrc || v.src) && v.duration > 1);
    })()`)
    return r === true
  }
}
