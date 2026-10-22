/**
 * 浏览窗口的自绘顶栏（最小化 / 最大化 / 关闭）。
 *
 * 顶栏跑在 BrowserWindow 自己的 webContents 里，B 站页面在下面的
 * WebContentsView 中；浏览模式下 view 从 TITLEBAR_HEIGHT 开始，小窗模式下
 * view 铺满整个窗口，顶栏自然被盖住。
 *
 * 按钮通过 preload 暴露的 window.windowControls 发 IPC，主进程只处理
 * 来自本窗口的请求（见 app.ts 的 registerWindowControls）。
 */

export const TITLEBAR_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>哔哩哔哩 · 跑图小窗</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 36px; overflow: hidden; background: #16161a; }
  body {
    font: 12px/1 "Microsoft YaHei UI", "Segoe UI", system-ui, sans-serif;
    color: #8d8d98;
    user-select: none;
    cursor: default;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding-left: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    -webkit-app-region: drag;
  }
  .logo { display: flex; width: 16px; height: 16px; flex: none; }
  .logo svg { width: 16px; height: 16px; }
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hint { color: #5c5c66; white-space: nowrap; }
  .spacer { flex: 1; height: 100%; }
  .actions { display: flex; height: 36px; -webkit-app-region: no-drag; }
  .actions button {
    width: 46px;
    height: 36px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #b9b9c3;
    display: grid;
    place-items: center;
    cursor: default;
    outline: none;
    -webkit-app-region: no-drag;
  }
  .actions button:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  .actions button:active { background: rgba(255, 255, 255, 0.14); }
  .actions button:focus-visible { background: rgba(255, 255, 255, 0.08); }
  #close:hover { background: #e81123; color: #fff; }
  .actions svg { width: 10px; height: 10px; display: block; }
</style>
</head>
<body>
  <div class="bar">
    <span class="logo" aria-hidden="true">
      <svg viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#fb7299"/><path d="M6 4.6 11 8l-5 3.4z" fill="#fff"/></svg>
    </span>
    <span class="title">哔哩哔哩 · 跑图小窗</span>
    <span class="hint">拖动顶栏移动窗口，双击最大化 / 还原</span>
    <span class="spacer"></span>
    <div class="actions">
      <button type="button" data-action="minimize" title="最小化" aria-label="最小化">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.5h6" stroke="currentColor" stroke-width="1"/></svg>
      </button>
      <button type="button" id="max" data-action="maximize" title="最大化" aria-label="最大化">
        <svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor"/></svg>
      </button>
      <button type="button" id="close" data-action="close" title="关闭" aria-label="关闭">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="m2 2 6 6M8 2 2 8" stroke="currentColor" stroke-width="1"/></svg>
      </button>
    </div>
  </div>
<script>
(function () {
  'use strict';
  var api = window.windowControls;
  var actions = document.querySelector('.actions');
  if (!api) {
    if (actions) actions.style.display = 'none';
    return;
  }
  var maxBtn = document.getElementById('max');
  var ICON_MAX = '<svg viewBox="0 0 10 10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor"/></svg>';
  var ICON_RESTORE = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 3V1h6v6H7" fill="none" stroke="currentColor"/><rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor"/></svg>';
  function paint(maximized) {
    if (!maxBtn) return;
    maxBtn.innerHTML = maximized ? ICON_RESTORE : ICON_MAX;
    maxBtn.title = maximized ? '还原' : '最大化';
    maxBtn.setAttribute('aria-label', maxBtn.title);
  }
  var minBtn = document.querySelector('[data-action="minimize"]');
  var closeBtn = document.querySelector('[data-action="close"]');
  if (minBtn) minBtn.addEventListener('click', function () { api.minimize(); });
  if (maxBtn) maxBtn.addEventListener('click', function () { api.toggleMaximize(); });
  if (closeBtn) closeBtn.addEventListener('click', function () { api.close(); });
  api.isMaximized().then(paint);
  api.onMaximizedChange(paint);
})();
</script>
</body>
</html>`
