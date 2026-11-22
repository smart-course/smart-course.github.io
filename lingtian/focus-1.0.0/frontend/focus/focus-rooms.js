/* 雅室精绘环境：房间静态绘制一次，人物与书案继续独立交互。 */
(function (global) {
  'use strict';
  const ROOM_FILES = {"library":"assets/room-library-v87.webp","rain":"assets/room-rain-v87.webp"};
  const script = global.document?.currentScript;
  const source = name => name.startsWith('data:') ? name : script?.src && typeof URL !== 'undefined' ? new URL(name, script.src).href : './focus/' + name;
  const images = new Map(), pending = new Map();
  const validScene = id => id === 'rain' ? 'rain' : 'library';

  function ready(value) {
    const id = validScene(value);
    if (images.has(id)) return Promise.resolve(true);
    if (pending.has(id)) return pending.get(id);
    if (typeof global.Image !== 'function') return Promise.resolve(false);
    const promise = new Promise(resolve => {
      const image = new global.Image();
      let finished = false, decoding = false;
      function finish(available) {
        if (finished) return;
        finished = true; image.onload = image.onerror = null;
        const valid = available && (image.naturalWidth || image.width) > 0 && (image.naturalHeight || image.height) > 0;
        if (valid) images.set(id, image);
        else pending.delete(id);
        resolve(!!valid);
      }
      image.decoding = 'async';
      image.onload = async () => {
        if (finished || decoding) return;
        decoding = true;
        try { if (typeof image.decode === 'function') await image.decode(); } catch (_) { /* 已触发 load 的浏览器可直接绘制。 */ }
        finish(true);
      };
      image.onerror = () => finish(false);
      try { image.src = source(ROOM_FILES[id]); } catch (_) { finish(false); }
    });
    pending.set(id, promise);
    // 同步拒绝的环境也允许下次重新进入时重试，不保留已经失败的 Promise。
    promise.then(ok => { if (!ok && pending.get(id) === promise) pending.delete(id); });
    return promise;
  }

  function draw(context, image, width, height, id) {
    const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
    context.clearRect(0, 0, width, height);
    const portrait = width <= 600 && height / width >= 1.35;
    if (portrait) {
      // 手机四排席位需要纵向地面。墙面等比裁切，只有无人物的地板延展，圆窗不会被拉长。
      const seam = sh * (id === 'rain' ? .50 : .45);
      const wallHeight = Math.min(height * .25, 208);
      const scale = Math.max(width / sw, wallHeight / seam);
      const cropWidth = width / scale, cropLeft = (sw - cropWidth) / 2, cropHeight = wallHeight / scale;
      context.drawImage(image, cropLeft, Math.max(0, seam - cropHeight), cropWidth, cropHeight, 0, 0, width, wallHeight);
      // 只让地面向上覆盖一像素接缝，墙面与窗框始终严格等比。
      context.drawImage(image, cropLeft, seam, cropWidth, sh - seam, 0, wallHeight - 1, width, height - wallHeight + 1);
    } else {
      const scale = Math.max(width / sw, height / sh);
      const w = sw * scale, h = sh * scale;
      context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    }
  }

  function create(options = {}) {
    const container = options.container;
    if (!container || !global.document?.createElement) return null;
    const root = global.document.createElement('div');
    root.className = 'fx-room-backdrop';
    root.setAttribute('aria-hidden', 'true');
    Object.assign(root.style, { position: 'absolute', inset: '0', zIndex: '0', pointerEvents: 'none', overflow: 'hidden', background: 'linear-gradient(#f4dfbe,#f0cf9e)' });
    const reduced = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const layers = [0, 1].map(() => {
      const canvas = global.document.createElement('canvas');
      Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', opacity: '0', transition: reduced ? 'none' : 'opacity 320ms ease' });
      root.appendChild(canvas);
      return { canvas, ctx: canvas.getContext('2d'), id: '', paintedKey: '' };
    });
    if (layers.some(layer => !layer.ctx)) return null;
    container.appendChild(root);
    let scene = '', active = -1, revision = 0, destroyed = false, width = 0, height = 0, sceneRequest = null;
    function paint(layer) {
      const image = images.get(layer.id);
      if (!image || !layer.ctx || !width || !height) return;
      const key = layer.id + ':' + width + ':' + height;
      if (layer.paintedKey === key) return;
      // 背景按 CSS 像素缓存；不随主场景动画、姓名或计时更新，也不占用新 WebGL 上下文。
      layer.canvas.width = width; layer.canvas.height = height;
      draw(layer.ctx, image, width, height, layer.id);
      layer.paintedKey = key;
    }
    function resize() {
      if (destroyed) return;
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
      if (width === w && height === h) return;
      width = w; height = h;
      root.dataset.layout = w <= 600 && h / w >= 1.35 ? 'portrait' : 'wide';
      // 隐藏缓冲等到下次切房时再画，旋转/缩放只更新正在显示的这一层。
      if (active >= 0) paint(layers[active]);
    }
    function setScene(value) {
      if (destroyed) return Promise.resolve(false);
      const id = validScene(value);
      if (scene === id && root.dataset.status === 'ready') return Promise.resolve(true);
      if (scene === id && sceneRequest) return sceneRequest;
      scene = id;
      const request = ++revision;
      root.dataset.scene = id; root.dataset.status = 'loading';
      const result = ready(id).then(ok => {
        if (destroyed || request !== revision) return false;
        sceneRequest = null;
        if (!ok) { root.dataset.status = 'error'; return false; }
        resize();
        const next = active === 0 ? 1 : 0;
        layers[next].id = id; paint(layers[next]);
        layers[next].canvas.style.opacity = '1';
        if (active >= 0) layers[active].canvas.style.opacity = '0';
        active = next; root.dataset.status = 'ready';
        try { options.onReady?.(id); } catch (_) { /* 已关闭的控制层不应影响背景本身。 */ }
        return true;
      });
      sceneRequest = result; return result;
    }
    const observer = typeof global.ResizeObserver === 'function' ? new global.ResizeObserver(resize) : null;
    observer?.observe(container);
    if (!observer) global.addEventListener?.('resize', resize);
    resize();
    return Object.freeze({ setScene, resize, destroy() {
      if (destroyed) return;
      destroyed = true; revision++; sceneRequest = null; observer?.disconnect();
      if (!observer) global.removeEventListener?.('resize', resize);
      root.remove();
      layers.forEach(layer => { layer.canvas.width = layer.canvas.height = 1; });
    }});
  }

  global.FocusRooms = Object.freeze({ ready, create });
})(typeof window !== 'undefined' ? window : globalThis);
