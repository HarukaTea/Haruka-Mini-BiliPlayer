/**
 * 注入到 B 站页面里的脚本与样式。
 *
 * 这里是「字符串形式的页面代码」，不是 Node 侧逻辑：
 *  - ISOLATE_JS / UNISOLATE_JS：把整页裁剪成纯播放器 / 原样还原
 *  - BASE_CSS：去掉滚动条、黑边，压过播放器自己算出来的行内尺寸
 *  - VIDEO_EXPR：所有播放控制共用的 <video> 选择器
 */

export const VIDEO_EXPR = `document.querySelector('video')`

export const ISOLATE_JS = `(() => {
  const cands = ['#bilibili-player', '.bpx-player-container', '#playerWrap', '.bilibili-player'];
  let p = null;
  for (const s of cands) {
    const el = document.querySelector(s);
    if (el && el.querySelector('video')) { p = el; break; }
  }
  if (!p) for (const s of cands) { const el = document.querySelector(s); if (el) { p = el; break; } }
  if (!p) { const v = document.querySelector('video'); if (v) p = v.parentElement; }
  if (!p) return 'no-player';

  const mark = (el) => {
    if (!el || el.id === 'dsh-mini-grip') return;
    if (el.dataset.dshHidden === '1') return;
    el.dataset.dshHidden = '1';
    el.dataset.dshPrev = el.style.display || '';
    el.style.display = 'none';
  };

  if (p.dataset.dshIso !== '1') {
    p.dataset.dshIso = '1';
    p.dataset.dshPrevStyle = p.getAttribute('style') || '';
  }
  p.style.cssText =
    'position:fixed!important;left:0!important;top:0!important;right:auto!important;' +
    'bottom:auto!important;width:100vw!important;height:100vh!important;' +
    'max-width:none!important;max-height:none!important;margin:0!important;' +
    'padding:0!important;transform:none!important;z-index:2147483000!important;' +
    'border-radius:0!important;box-shadow:none!important';

  // B 站播放器会按自己的算法给 <video> 和几层包裹元素写死 px 尺寸，
  // 在 480x270 的小窗里就成了四周一圈黑边。这里从 <video> 往上到播放器根节点
  // 逐层用行内 !important 强制撑满（行内 !important 优先级最高，压得住宿主）。
  const fill = (e) => {
    e.style.setProperty('position', 'absolute', 'important');
    e.style.setProperty('left', '0', 'important');
    e.style.setProperty('top', '0', 'important');
    e.style.setProperty('width', '100%', 'important');
    e.style.setProperty('height', '100%', 'important');
    e.style.setProperty('max-width', 'none', 'important');
    e.style.setProperty('max-height', 'none', 'important');
    e.style.setProperty('min-width', '0', 'important');
    e.style.setProperty('min-height', '0', 'important');
    e.style.setProperty('margin', '0', 'important');
    e.style.setProperty('padding', '0', 'important');
    e.style.setProperty('transform', 'none', 'important');
    e.style.setProperty('object-fit', 'contain', 'important');
    e.style.setProperty('z-index', 'auto', 'important');
  };
  const vid = p.querySelector('video');
  if (vid) {
    const chain = [];
    let q = vid;
    while (q && q !== p && chain.length < 14) {
      chain.push(q);
      q = q.parentElement;
    }
    for (const node of chain) fill(node);
  }

  // 小窗只保留画面：B 站会把「xx 人正在看 + 发个友善的弹幕」输入条塞在
  // 播放器顶部，裁剪后它就成了画面之上的一条白栏。这里连同视频信息条一起隐藏，
  // 播放控制条和弹幕层保留。用 mark() 记录原样，退出小窗时统一还原。
  for (const s of [
    '.bpx-player-sending-area',
    '.bpx-player-video-info',
    '.bilibili-player-video-sendbar',
    '.bilibili-player-video-info',
  ]) {
    for (const el of Array.from(document.querySelectorAll(s))) {
      if (el === p || el.contains(p) || el.contains(vid)) continue;
      mark(el);
    }
  }

  let el = p, guard = 0;
  while (el && el.parentElement && el !== document.body && guard++ < 16) {
    const parent = el.parentElement;
    for (const sib of Array.from(parent.children)) {
      if (sib !== el && !sib.contains(p)) mark(sib);
    }
    parent.style.setProperty('overflow', 'visible', 'important');
    el = parent;
  }
  for (const c of Array.from(document.body.children)) {
    if (c !== p && !c.contains(p)) mark(c);
  }
  document.documentElement.style.setProperty('overflow', 'hidden', 'important');
  document.body.style.setProperty('overflow', 'hidden', 'important');
  document.body.style.setProperty('margin', '0', 'important');
  // 四角缩放手柄。小窗默认鼠标穿透，page-preload 在光标进入手柄时
  // 临时关闭穿透，才能接住拖拽事件。
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const id = 'dsh-mini-grip-' + corner;
    let grip = document.getElementById(id);
    if (!grip) {
      grip = document.createElement('div');
      grip.id = id;
      grip.className = 'dsh-mini-grip dsh-mini-grip-' + corner;
      grip.title = '拖动调节小窗大小';
      document.body.appendChild(grip);
    }
  }
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  return 'ok';
})()`

export const UNISOLATE_JS = `(() => {
  for (const el of Array.from(document.querySelectorAll('[data-dsh-hidden="1"]'))) {
    el.style.display = el.dataset.dshPrev || '';
    delete el.dataset.dshHidden; delete el.dataset.dshPrev;
  }
  for (const p of Array.from(document.querySelectorAll('[data-dsh-iso="1"]'))) {
    const prev = p.dataset.dshPrevStyle || '';
    if (prev) p.setAttribute('style', prev); else p.removeAttribute('style');
    delete p.dataset.dshIso; delete p.dataset.dshPrevStyle;
  }
  document.documentElement.style.removeProperty('overflow');
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('margin');
  for (const grip of Array.from(document.querySelectorAll('.dsh-mini-grip'))) grip.remove();
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  return 'ok';
})()`

export const BASE_CSS = `
  /* 只做视觉修饰：浏览模式必须保留页面自身的滚动能力。
     小窗的「禁止滚动」由 ISOLATE_JS 用行内 !important 单独设置。 */
  html, body { margin: 0 !important; background: #000 !important; }
  ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }

  /* B 站播放器会用自己的逻辑给 <video> 算一个居中缩小后的 px 尺寸（行内样式），
     在 480x270 这种小窗里就变成四周一圈黑边。用 !important 样式表压过行内样式。 */
  video {
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    object-fit: contain !important;
    transform: none !important;
  }
  video::-webkit-media-controls { display: none !important; }

  /* 小窗四角拖拽缩放柄。默认几乎透明，光标进入时由 page-preload 加 .dsh-grip-hot。
     小窗本身是鼠标穿透的，只有光标进入四角 24px 区域才会临时关闭穿透。 */
  .dsh-mini-grip {
    position: fixed !important;
    width: 24px !important;
    height: 24px !important;
    z-index: 2147483647 !important;
    background: transparent !important;
    -webkit-app-region: no-drag !important;
  }
  .dsh-mini-grip-nw { left: 0 !important; top: 0 !important; cursor: nwse-resize !important; }
  .dsh-mini-grip-ne { right: 0 !important; top: 0 !important; cursor: nesw-resize !important; }
  .dsh-mini-grip-sw { left: 0 !important; bottom: 0 !important; cursor: nesw-resize !important; }
  .dsh-mini-grip-se { right: 0 !important; bottom: 0 !important; cursor: nwse-resize !important; }
  /* 沉浸模式：四角手柄和一切交互都退场，窗口只负责显示视频 */
  body.dsh-immersive .dsh-mini-grip { display: none !important; }
  .dsh-mini-grip::before {
    content: '' !important;
    position: absolute !important;
    width: 9px !important;
    height: 9px !important;
    border: 0 solid rgba(255, 255, 255, 0.4) !important;
    border-radius: 1px !important;
    transition: border-color 0.12s ease !important;
  }
  .dsh-mini-grip-nw::before {
    left: 5px !important; top: 5px !important;
    border-left-width: 2px !important; border-top-width: 2px !important;
    border-top-left-radius: 1px !important;
  }
  .dsh-mini-grip-ne::before {
    right: 5px !important; top: 5px !important;
    border-right-width: 2px !important; border-top-width: 2px !important;
    border-top-right-radius: 1px !important;
  }
  .dsh-mini-grip-sw::before {
    left: 5px !important; bottom: 5px !important;
    border-left-width: 2px !important; border-bottom-width: 2px !important;
    border-bottom-left-radius: 1px !important;
  }
  .dsh-mini-grip-se::before {
    right: 5px !important; bottom: 5px !important;
    border-right-width: 2px !important; border-bottom-width: 2px !important;
    border-bottom-right-radius: 1px !important;
  }
  .dsh-mini-grip.dsh-grip-hot::before { border-color: rgba(255, 255, 255, 0.95) !important; }
  body.dsh-resizing { user-select: none !important; }
`
