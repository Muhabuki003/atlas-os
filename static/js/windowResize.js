// Shared window-resize helper. Companion to makeWindowDraggable: gives every
// draggable tool window (Library, Notes, Tasks, Calendar, Gallery, Email,
// Cookbook, Memory, Settings, Theme, Compare, Research, Sessions) edge- and
// corner-resize, the same way a native desktop window resizes — grab any of
// the four edges or four corners and drag.
//
// Why edge-proximity detection instead of injected handle elements:
//   The windows differ structurally. `.modal-content` scrolls its own body
//   (overflow:auto) while `.notes-pane` keeps overflow:hidden and scrolls an
//   inner element. Absolutely-positioned handle children would scroll away
//   with the content in the first case. Detecting pointer proximity to the
//   window's border works uniformly regardless of the overflow model and
//   matches the user's mental model ("drag the edges or corners").
//
// API:
//   makeWindowResizable(content, {
//     modal,        // optional wrapping .modal (for id-based size persistence)
//     mobileSkip,   // viewport width at/below which resize is disabled (sheets)
//     isLocked,     // () => bool — skip while fullscreen / docked
//     minWidth, minHeight,
//     storageKey,   // localStorage key to persist {w,h}; null disables
//     onResizeEnd,  // ({rect}) => void
//     onResizeStart, // () => void
//     important,    // use setProperty(..., 'important') for Atlas modals
//   })

const EDGE = 7;          // px proximity to a border that arms a resize grip
const MIN_W = 320;       // smallest a window may be dragged to
const MIN_H = 200;
// Controls that must keep their own click/drag behaviour even when they sit
// within EDGE px of the window border (close buttons, sliders, inputs, links).
const INTERACTIVE = 'button, input, select, textarea, a, [contenteditable=""], [contenteditable="true"]';

export function makeWindowResizable(content, options = {}) {
  if (!content) return;
  const modal = options.modal || null;
  const mobileSkip = (typeof options.mobileSkip === 'number') ? options.mobileSkip : 768;
  const minW = options.minWidth || MIN_W;
  const minH = options.minHeight || MIN_H;
  const isLocked = options.isLocked || (() => false);
  const onResizeEnd = options.onResizeEnd || null;
  const onResizeStart = options.onResizeStart || null;
  const storageKey = options.storageKey || null;
  const important = !!options.important;

  const _skip = () => (mobileSkip > 0 && window.innerWidth <= mobileSkip) || isLocked();

  function _setStyle(prop, value) {
    if (important) content.style.setProperty(prop, value, 'important');
    else content.style[prop] = value;
  }

  // Which borders is (cx,cy) within EDGE px of? Only counts when the pointer
  // is also within the window's span on the perpendicular axis, so the corners
  // resolve to true diagonal grips rather than the whole side.
  function edgesAt(cx, cy) {
    const r = content.getBoundingClientRect();
    const within = (cy >= r.top - EDGE && cy <= r.bottom + EDGE && cx >= r.left - EDGE && cx <= r.right + EDGE);
    if (!within) return { l: false, r: false, t: false, b: false, rect: r };
    const onY = cy >= r.top - EDGE && cy <= r.bottom + EDGE;
    const onX = cx >= r.left - EDGE && cx <= r.right + EDGE;
    return {
      l: Math.abs(cx - r.left) <= EDGE && onY,
      r: Math.abs(cx - r.right) <= EDGE && onY,
      t: Math.abs(cy - r.top) <= EDGE && onX,
      b: Math.abs(cy - r.bottom) <= EDGE && onX,
      rect: r,
    };
  }

  function cursorFor(e) {
    if ((e.l && e.t) || (e.r && e.b)) return 'nwse-resize';
    if ((e.r && e.t) || (e.l && e.b)) return 'nesw-resize';
    if (e.l || e.r) return 'ew-resize';
    if (e.t || e.b) return 'ns-resize';
    return '';
  }

  let hoverCursor = false;
  function clearHoverCursor() {
    if (hoverCursor) { content.style.cursor = ''; hoverCursor = false; }
  }
  function onHover(ev) {
    if (resizing) return;
    if (_skip()) { clearHoverCursor(); return; }
    if (ev.target && ev.target.closest && ev.target.closest(INTERACTIVE)) { clearHoverCursor(); return; }
    const c = cursorFor(edgesAt(ev.clientX, ev.clientY));
    if (c) { content.style.cursor = c; hoverCursor = true; }
    else clearHoverCursor();
  }

  let resizing = false;
  let active = null;
  let startRect = null, startX = 0, startY = 0;

  function begin(cx, cy, edges) {
    resizing = true;
    active = edges;
    // Kill the modal/pane open-animation (a scale transform that runs for the
    // first ~200-250ms) BEFORE measuring. Done as a permanent inline style
    // rather than a toggled class on purpose: a class that flips animation
    // off→on would re-trigger the scale-in on mouseup, mis-measuring the final
    // size and visibly popping the window. The open animation is a one-shot,
    // so killing it for this instance is harmless (it replays on next open).
    content.style.animation = 'none';
    content.classList.add('window-resizing');
    if (onResizeStart) { try { onResizeStart(); } catch (_) {} }
    const r = content.getBoundingClientRect();
    startRect = { left: r.left, top: r.top, width: r.width, height: r.height };
    startX = cx; startY = cy;
    // Pin to fixed with explicit box, same as the drag helper does, so the
    // centering transform / margin stops fighting the new dimensions. Drop the
    // max-width/height caps (e.g. 85vh) so the window can actually grow.
    _setStyle('position', 'fixed');
    _setStyle('margin', '0');
    _setStyle('transform', 'none');
    _setStyle('right', 'auto');
    _setStyle('bottom', 'auto');
    _setStyle('inset', 'auto');
    _setStyle('left', `${r.left}px`);
    _setStyle('top', `${r.top}px`);
    _setStyle('width', `${r.width}px`);
    _setStyle('height', `${r.height}px`);
    _setStyle('max-width', 'none');
    _setStyle('max-height', 'none');
    document.body.classList.add('window-resizing-active');
    document.body.style.cursor = cursorFor(edges);
  }

  function move(cx, cy) {
    if (!resizing) return;
    const dx = cx - startX, dy = cy - startY;
    let { left, top, width, height } = startRect;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (active.r) width = startRect.width + dx;
    if (active.b) height = startRect.height + dy;
    if (active.l) { width = startRect.width - dx; left = startRect.left + dx; }
    if (active.t) { height = startRect.height - dy; top = startRect.top + dy; }
    // Min-size clamps — keep the opposite edge anchored when pulling from
    // the left/top so the window doesn't jump.
    if (width < minW) { if (active.l) left = startRect.left + (startRect.width - minW); width = minW; }
    if (height < minH) { if (active.t) top = startRect.top + (startRect.height - minH); height = minH; }
    // Keep the window on-screen and never larger than the viewport.
    if (active.l && left < 0) { width += left; left = 0; }
    if (active.t && top < 0) { height += top; top = 0; }
    if (left + width > vw) width = Math.max(minW, vw - left);
    if (top + height > vh) height = Math.max(minH, vh - top);
    _setStyle('left', `${left}px`);
    _setStyle('top', `${top}px`);
    _setStyle('width', `${width}px`);
    _setStyle('height', `${height}px`);
  }

  function end() {
    if (!resizing) return;
    resizing = false;
    active = null;
    content.classList.remove('window-resizing');
    document.body.classList.remove('window-resizing-active');
    document.body.style.cursor = '';
    clearHoverCursor();
    document.querySelectorAll('.window-resizing').forEach((node) => {
      if (node !== content) node.classList.remove('window-resizing');
    });
    const r = content.getBoundingClientRect();
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) })); } catch (_) {}
    }
    if (onResizeEnd) { try { onResizeEnd({ rect: r }); } catch (_) {} }
  }

  function armFrom(target, cx, cy) {
    if (_skip()) return false;
    if (target && target.closest && target.closest(INTERACTIVE)) return false;
    const edges = edgesAt(cx, cy);
    if (!(edges.l || edges.r || edges.t || edges.b)) return false;
    begin(cx, cy, edges);
    return true;
  }

  // Capture phase: pre-empt the header's drag listener (which lives on a
  // descendant and fires in the bubble phase) when the grab lands on a border.
  content.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    if (!armFrom(ev.target, ev.clientX, ev.clientY)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const mu = () => {
      end();
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup', mu);
    };
    // Self-heal a missed mouseup (released outside the window, dropped event,
    // window blur): a move with no buttons pressed means the drag is over —
    // finish instead of running away on every subsequent mousemove.
    const mm = (e) => {
      if (e.buttons === 0) { mu(); return; }
      move(e.clientX, e.clientY);
    };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  }, true);

  content.addEventListener('mousemove', onHover);
  content.addEventListener('mouseleave', clearHoverCursor);

  content.addEventListener('touchstart', (ev) => {
    const t = ev.touches[0];
    if (!t) return;
    if (!armFrom(ev.target, t.clientX, t.clientY)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const tm = (e) => { const tt = e.touches[0]; if (tt) move(tt.clientX, tt.clientY); };
    const te = () => {
      end();
      document.removeEventListener('touchmove', tm);
      document.removeEventListener('touchend', te);
      document.removeEventListener('touchcancel', te);
    };
    document.addEventListener('touchmove', tm, { passive: false });
    document.addEventListener('touchend', te);
    document.addEventListener('touchcancel', te);
  }, true);

  // Restore a previously chosen size on (re)open. Applying width/height inline
  // while the window is still centered by its overlay keeps it centered at the
  // new size; once dragged/resized it pins to fixed as usual.
  //
  // Deferred one frame on purpose: some windows (e.g. Notes) snap to an edge
  // dock or fullscreen synchronously right AFTER this helper is wired. Waiting a
  // frame lets that settle so we can re-check _skip() and NOT stretch a
  // docked/fullscreen window to a stale windowed size. The open animation masks
  // the one-frame delay, so there is no visible jump.
  function forceEnd() {
    if (resizing) end();
  }

  window.addEventListener('blur', forceEnd);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) forceEnd();
  });

  if (storageKey) {
    requestAnimationFrame(() => {
      if (_skip() || !content.isConnected) return;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved && saved.w && saved.h) {
          const w = Math.max(minW, Math.min(saved.w, window.innerWidth));
          const h = Math.max(minH, Math.min(saved.h, window.innerHeight));
          _setStyle('width', `${w}px`);
          _setStyle('height', `${h}px`);
          _setStyle('max-width', 'none');
          _setStyle('max-height', 'none');
        }
      } catch (_) {}
    });
  }
}

/** Clear a stuck document-level resize lock (e.g. missed mouseup). */
export function clearWindowResizeLock() {
  document.body.classList.remove('window-resizing-active');
  document.body.style.cursor = '';
}
