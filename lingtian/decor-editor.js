/* A local placement draft. Only the explicit Save action writes game state. */
(function (global) {
  'use strict';
  const clone = layout => (layout || []).map(entry => ({ id: entry.id, x: entry.x, z: entry.z, rotation: entry.rotation }));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const glyphs = { bambooFence: '竹', stoneLantern: '灯', spiritPond: '池', masterStele: '碑', springBanner: '春', summerBanner: '夏', autumnBanner: '秋', winterBanner: '冬', sectGate: '门', sectSpring: '泉', sectLibrary: '阁',verdantPine:'松',banyanTree:'榕',weepingWillow:'柳' };
  const icons = {
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    up: '<path d="m5 12 7-7 7 7M12 5v15"/>', down: '<path d="m5 12 7 7 7-7M12 4v15"/>',
    left: '<path d="m12 5-7 7 7 7M5 12h15"/>', right: '<path d="m12 5 7 7-7 7M4 12h15"/>',
    rotateLeft: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>', rotateRight: '<path d="M20 10a8 8 0 1 0-1 8M20 4v6h-6"/>',
    undo: '<path d="m9 5-6 6 6 6M3 11h11a6 6 0 0 1 6 6v2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    check: '<path d="m5 12 4 4L19 6"/>', leaf: '<path d="M20 4C10 2 4 6 4 13a7 7 0 0 0 7 7c7 0 10-6 9-16ZM4 20 15 9"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>', warning: '<path d="m12 3 10 18H2L12 3ZM12 9v5m0 3v.2"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.leaf}</svg>`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const decorationName=item=>item?.repeatable?`${item.speciesName||item.name} · 第 ${item.copyIndex} 棵`:item?.name||'庭院装饰';

  global.createSpiritDecorEditor = function (options) {
    const { scene, engine } = options;
    const card = options.container?.matches?.('.garden-card') ? options.container : options.container?.closest?.('.garden-card') || document.querySelector('.garden-card');
    let active = false, disposed = false, busy = false, unconfirmed = false, pendingLayout = null, selectedId = '', draft = [], baseline = [], equipped = [], history = [], gestureBefore = null;
    let root = null, placeholder = null, originalParent = null, returnFocus = null, inertStates = [], showAreas = true, validation = { ok: true, message: '' }, feedback = '';
    let choicesSignature = '', buttonSignature = '', lastAnnounced = '', resizeFrame = 0;
    const toast = (message, type = 'info') => options.toast?.(message, type);
    const current = () => draft.find(entry => entry.id === selectedId);
    const canEdit = () => active && !busy && !unconfirmed;
    const refs = {};
    const getRules = () => global.SpiritGame;
    function remember(previous) {
      if (same(previous, draft)) return;
      history.push(clone(previous)); if (history.length > 30) history.shift();
    }
    function validate() {
      validation = typeof getRules()?.validateDecorLayout === 'function'
        ? getRules().validateDecorLayout(draft, equipped)
        : { ok: false, message: '布置规则尚未加载，请关闭后重试。' };
      return validation;
    }
    function draw() {
      if (!active) return;
      validate();
      scene.setDecorationEdit({ layout: draft, selectedId, valid: validation.ok, showAreas,
        onSelect: select, onMove: moveFromScene, onGestureStart: beginGesture, onGestureEnd: endGesture });
      update();
    }
    function select(id) {
      if (!canEdit() || !equipped.includes(id)) return;
      selectedId = id; feedback = ''; draw();
    }
    function beginGesture() { if (canEdit()) { gestureBefore = clone(draft); feedback = ''; } }
    function moveFromScene(entry) {
      if (!canEdit() || !equipped.includes(entry.id)) return;
      draft = draft.map(item => item.id === entry.id ? { ...entry } : item); draw();
    }
    function endGesture(result) {
      if (!active || !gestureBefore) return;
      if (result?.cancelled) draft = clone(gestureBefore); else remember(gestureBefore);
      gestureBefore = null; draw();
    }
    function edit(change) {
      if (!canEdit() || !current()) return;
      const previous = clone(draft); feedback = '';
      draft = change(clone(draft)); remember(previous); draw();
    }
    function nudge(direction) {
      const step = scene.getDecorationStepVector?.(direction) || { x: direction === 'left' ? -.25 : direction === 'right' ? .25 : 0, z: direction === 'up' ? -.25 : direction === 'down' ? .25 : 0 };
      edit(layout => layout.map(entry => entry.id === selectedId ? { ...entry, x: entry.x + step.x, z: entry.z + step.z } : entry));
    }
    function rotate(delta) {
      edit(layout => layout.map(entry => entry.id === selectedId ? { ...entry, rotation: (entry.rotation + delta + 360) % 360 } : entry));
    }
    function undo() {
      if (!canEdit() || !history.length) return;
      draft = history.pop(); feedback = ''; draw();
    }
    function reset() {
      if (!canEdit() || !getRules()?.getDefaultDecorLayout) return;
      edit(() => clone(getRules().getDefaultDecorLayout(equipped)));
    }
    function update() {
      if (!active || !root) return;
      const info = engine.getDecorInfo(), items = info.items || [], selected = items.find(item => item.id === selectedId);
      if (unconfirmed && !busy && !engine.pending && !engine.busy) {
        const confirmed = pendingLayout && same(clone(info.layout), pendingLayout);
        unconfirmed = false; pendingLayout = null;
        if (confirmed) { finish('saved', { ok: true, recovered: true }); return; }
        feedback = '云端已完成核对，这份布局尚未保存，可以重新调整后保存。';
      }
      const inventoryChanged = !same(info.equipped || [], equipped);
      const signature = JSON.stringify([equipped, items.filter(item => equipped.includes(item.id)).map(item => [item.id, decorationName(item)])]);
      if (signature !== choicesSignature) {
        choicesSignature = signature;
        refs.choices.innerHTML = equipped.map(id => {
          const item = items.find(value => value.id === id);
          return `<button type="button" class="decor-editor-choice" data-decor-select="${escape(id)}" aria-label="选择${escape(decorationName(item))}" aria-pressed="false"><span aria-hidden="true">${glyphs[item?.speciesId||id] || '景'}</span><strong>${escape(item?.name || '庭院装饰')}${item?.repeatable?`<small>第 ${escape(item.copyIndex)} 棵</small>`:''}</strong>${icon('check')}</button>`;
        }).join('');
      }
      for (const button of refs.choices.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.decorSelect === selectedId)); button.disabled = busy || unconfirmed;
      }
      refs.name.textContent = decorationName(selected);
      refs.orientation.textContent = `朝向 ${current()?.rotation || 0}°`;
      let message = inventoryChanged ? '已布置的装饰有变化，请返回收藏后重新打开布置。' : feedback || (validation.ok ? '这个位置可以摆放。' : validation.message || '请把装饰移到可用的草地上。');
      for (const item of items) {
        const baseName = getRules()?.DECORATIONS?.find(definition => definition.id === item.id)?.name;
        if (baseName && item.name && item.name !== baseName) message = message.split(`「${baseName}」`).join(`「${item.name}」`);
      }
      refs.status.classList.toggle('is-invalid', inventoryChanged || !validation.ok || !!feedback);
      refs.statusIcon.innerHTML = icon(validation.ok && !feedback && !inventoryChanged ? 'check' : 'warning');
      if (message !== lastAnnounced) { refs.statusText.textContent = message; lastAnnounced = message; }
      const changed = !same(draft, baseline);
      refs.state.textContent = busy ? '正在保存…' : unconfirmed ? '等待云端确认' : changed ? '预览中 · 尚未保存' : '当前已保存的布局';
      refs.save.disabled = busy || unconfirmed || inventoryChanged || !!engine.busy || !!engine.pending || !validation.ok || !changed;
      refs.save.textContent = busy ? '正在保存…' : '保存布局';
      refs.cancel.disabled = busy; refs.close.disabled = busy;
      refs.cancel.textContent = unconfirmed ? '返回田园' : '取消';
      refs.close.setAttribute('aria-label', unconfirmed ? '返回田园' : '取消布置并返回');
      const controlsState = `${busy}|${unconfirmed}|${history.length}|${showAreas}`;
      if (controlsState !== buttonSignature) {
        buttonSignature = controlsState;
        for (const button of root.querySelectorAll('[data-decor-action]:not([data-decor-action="save"]):not([data-decor-action="cancel"]):not([data-decor-action="close"])')) {
          button.disabled = busy || unconfirmed || button.dataset.decorAction === 'undo' && !history.length;
        }
        refs.areas.setAttribute('aria-pressed', String(showAreas));
      }
    }
    function finish(kind, result) {
      if (!active) return;
      active = false; gestureBefore = null;
      scene.setDecorationEdit?.(null);
      if (placeholder?.parentNode) placeholder.replaceWith(card); else if (originalParent) originalParent.appendChild(card);
      for (const [node, value] of inertStates) if (node.isConnected) node.inert = value;
      inertStates = []; root?.remove(); root = null;
      document.body.classList.remove('spirit-decor-open');
      document.removeEventListener('keydown', onKey, true);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; scene.resize?.(); });
      if (returnFocus?.isConnected && !returnFocus.closest('[inert]') && returnFocus.getClientRects().length) returnFocus.focus({ preventScroll: true });
      else document.querySelector('[data-fullscreen-command="decor"]')?.focus({ preventScroll: true });
      options.onClose?.({ saved: kind === 'saved', pending: unconfirmed });
      if (kind === 'saved') options.onSaved?.(result);
      busy = false; unconfirmed = false; pendingLayout = null;
    }
    function close() {
      if (!active) return true;
      if (busy) { toast('正在保存这份布局，请稍候。'); return false; }
      finish('cancel'); return true;
    }
    async function save() {
      if (!canEdit()) return;
      if (engine.busy || engine.pending) { feedback = '还有操作正在同步，确认后即可保存布局。'; update(); return; }
      if (!validate().ok) { draw(); return; }
      if (same(draft, baseline)) return;
      const submitted = clone(draft); busy = true; feedback = ''; update();
      try {
        const result = await engine.saveDecorLayout(submitted);
        if (disposed || !active) return;
        if (result?.ok === false || result?.pending) {
          unconfirmed = !!result.pending;
          pendingLayout = unconfirmed ? submitted : null;
          feedback = result.message || (unconfirmed ? '保存尚待确认，恢复连接后会自动核对。' : '这份布局尚未保存，请调整后重试。');
        } else { busy = false; finish('saved', result); return; }
      } catch (error) {
        if (disposed || !active) return;
        feedback = error?.message || '暂时未能保存，当前预览仍在，可以稍后再试。';
      } finally { busy = false; if (active) update(); }
    }
    function onClick(event) {
      const selected = event.target.closest('[data-decor-select]');
      if (selected) { event.stopPropagation(); select(selected.dataset.decorSelect); return; }
      const button = event.target.closest('[data-decor-action]');
      if (!button || button.disabled) return;
      event.preventDefault(); event.stopPropagation();
      const action = button.dataset.decorAction;
      if (action === 'save') save();
      else if (action === 'close' || action === 'cancel') close();
      else if (['up','down','left','right'].includes(action)) nudge(action);
      else if (action === 'rotate-left') rotate(-45);
      else if (action === 'rotate-right') rotate(45);
      else if (action === 'undo') undo();
      else if (action === 'reset') reset();
      else if (action === 'frame') scene.frameDecorations?.();
      else if (action === 'areas') { showAreas = !showAreas; draw(); }
    }
    function onKey(event) {
      if (!active) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if (event.key === 'Tab') {
        const controls = [...root.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length && !node.hidden);
        const first = controls[0], last = controls.at(-1);
        if (!root.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
      if (direction) { event.preventDefault(); event.stopPropagation(); nudge(direction); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
      else if (!event.ctrlKey && !event.metaKey && ['q', 'e'].includes(event.key.toLowerCase())) { event.preventDefault(); rotate(event.key.toLowerCase() === 'q' ? -45 : 45); }
    }
    function open(id) {
      if (disposed) return false;
      if (active) { if (id) select(id); return true; }
      if (!card || !scene?.supported || !scene.setDecorationEdit || typeof engine.saveDecorLayout !== 'function') { toast('当前设备暂时无法打开立体布置，请重新加载页面后再试。'); return false; }
      const info = engine.getDecorInfo();
      equipped = [...(info.equipped || [])];
      if (!equipped.length) { toast('先在洞天收藏中布置一件装饰，再来挑选它的位置。'); return false; }
      draft = clone(info.layout || getRules()?.getDefaultDecorLayout?.(equipped)); baseline = clone(draft);
      selectedId = equipped.includes(id) ? id : equipped[0]; history = []; busy = false; unconfirmed = false; pendingLayout = null; feedback = ''; showAreas = true;
      choicesSignature = ''; buttonSignature = ''; lastAnnounced = ''; returnFocus = document.activeElement;
      root = document.createElement('section'); root.className = 'spirit-decor-workspace'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'decor-editor-title');
      root.innerHTML = `<header class="decor-editor-header"><span class="decor-editor-emblem" aria-hidden="true">${icon('leaf')}</span><div><span class="decor-editor-overline">一景一物 · 随心安放</span><h2 id="decor-editor-title">布置洞天</h2></div><span class="decor-editor-state" data-editor-state></span><button type="button" class="decor-editor-close" data-decor-action="close" aria-label="取消布置并返回">${icon('close')}</button></header>
        <div class="decor-editor-stage"><div class="decor-editor-stage-note"><span>选择装饰，点草地摆放</span><button type="button" data-decor-action="frame">回到全景</button></div></div>
        <aside class="decor-editor-panel" aria-label="装饰位置工具"><div class="decor-editor-choices" role="group" aria-label="选择要摆放的装饰"></div>
          <div class="decor-editor-selection"><strong data-editor-name></strong><span data-editor-orientation></span></div>
          <div class="decor-editor-adjust"><div class="decor-editor-pad" role="group" aria-label="小步调整位置"><button type="button" data-decor-action="up" aria-label="向画面上方挪动一小步">${icon('up')}</button><button type="button" data-decor-action="left" aria-label="向画面左方挪动一小步">${icon('left')}</button><span aria-hidden="true">微调</span><button type="button" data-decor-action="right" aria-label="向画面右方挪动一小步">${icon('right')}</button><button type="button" data-decor-action="down" aria-label="向画面下方挪动一小步">${icon('down')}</button></div><div class="decor-editor-rotations"><button type="button" data-decor-action="rotate-left" aria-label="逆时针旋转装饰45度">${icon('rotateLeft')}<span>左转 45°</span></button><button type="button" data-decor-action="rotate-right" aria-label="顺时针旋转装饰45度">${icon('rotateRight')}<span>右转 45°</span></button></div></div>
          <div class="decor-editor-tools"><button type="button" data-decor-action="undo">${icon('undo')}撤销</button><button type="button" data-decor-action="reset">${icon('reset')}初始景位</button><button type="button" data-decor-action="areas" aria-pressed="true">${icon('grid')}可放位置</button></div>
          <p class="decor-editor-tip">电脑可直接拖动装饰；手机先选装饰，再点草地或用箭头微调。双指或滚轮可调整视角。除了灵田和水渠，草地上都能摆，小景之间可以挨着；压住原有的松树、灵石时，它们会自动收起，挪开又回来。</p>
          <footer class="decor-editor-footer"><div class="decor-editor-status" role="status" aria-live="polite"><span data-editor-status-icon></span><p data-editor-status-text></p></div><button type="button" data-decor-action="cancel">取消</button><button type="button" data-decor-action="save">保存布局</button><small>布置免费 · 保存后生效</small></footer></aside>`;
      refs.choices = root.querySelector('.decor-editor-choices'); refs.name = root.querySelector('[data-editor-name]'); refs.orientation = root.querySelector('[data-editor-orientation]');
      refs.state = root.querySelector('[data-editor-state]'); refs.status = root.querySelector('.decor-editor-status'); refs.statusText = root.querySelector('[data-editor-status-text]'); refs.statusIcon = root.querySelector('[data-editor-status-icon]');
      refs.save = root.querySelector('[data-decor-action="save"]'); refs.cancel = root.querySelector('[data-decor-action="cancel"]'); refs.close = root.querySelector('[data-decor-action="close"]'); refs.areas = root.querySelector('[data-decor-action="areas"]');
      originalParent = card.parentNode; placeholder = document.createComment('decor-editor-garden-location'); originalParent.insertBefore(placeholder, card);
      document.body.appendChild(root); root.querySelector('.decor-editor-stage').prepend(card);
      for (const node of [...document.body.children]) if (node !== root && node.id !== 'toast-stack') { inertStates.push([node, node.inert]); node.inert = true; }
      root.addEventListener('click', onClick); document.addEventListener('keydown', onKey, true); document.body.classList.add('spirit-decor-open');
      active = true; draw();
      resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; if (active) { scene.resize?.(); refs.choices.querySelector(`[data-decor-select="${selectedId}"]`)?.focus({ preventScroll: true }); } });
      return true;
    }
    return { open, close, update, isOpen: () => active,
      destroy() { disposed = true; if (active) finish('destroy'); if (resizeFrame) cancelAnimationFrame(resizeFrame); resizeFrame = 0; }
    };
  };
})(window);
