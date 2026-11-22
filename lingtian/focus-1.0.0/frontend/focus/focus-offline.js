/* 静修本机控制器：持久化、前台计时、番茄循环与跨页面所有权。 */
(function (global) {
  'use strict';
  const Core = global.SpiritFocusCore;
  const PREFIX = 'yunjian-focus-v1:', LEASE_MS = 12000, CHECKPOINT_MS = 5000, MAX_GAP_MS = 5000;
  const instances = new Map();
  const keyFor = profileId => PREFIX + encodeURIComponent(profileId);
  const id = () => global.crypto?.randomUUID?.() || 'focus-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  const failure = error => ({ ok: false, code: error?.code || 'focus_action_failed', message: error?.message || '本次操作未完成，请稍后重试。' });
  function parseExport(value) {
    if (typeof value === 'string') { if (value.length > 6000000) Core.fail('focus_save_too_large', '静修存档过大。'); value = JSON.parse(value); }
    return Core.validate(value);
  }
  function validateExport(value) { try { return { ok: true, data: parseExport(value) }; } catch (error) { return failure(error); } }
  function defaultStorage() {
    try { return global.localStorage; } catch (_) { return null; }
  }
  function getAppearance(profileId) {
    const equipped = { ...global.SpiritFocusCatalog.DEFAULT_EQUIPPED };
    const fallback = { avatarId: null, equipped, focusRevision: 0 };
    try {
      if (typeof profileId !== 'string' || !profileId) return fallback;
      const raw = defaultStorage()?.getItem(keyFor(profileId));
      if (typeof raw !== 'string' || !raw || raw.length > 6000000) return fallback;
      // Read the saved ownership ledger only. Opening a portrait must never
      // acquire a timer lease, repair a save, or grant progress rewards.
      const state = Core.validate(JSON.parse(raw), profileId);
      for (const slot of Object.keys(equipped)) equipped[slot] = state.equipped[slot];
      return { avatarId: state.identity?.avatarId || null, equipped, focusRevision: state.revision };
    } catch (_) { return fallback; }
  }
  function create(options = {}) {
    const profileId = String(options.profileId || 'offline:main');
    const nickname = String(options.nickname || '修习者').trim().slice(0, 40) || '修习者';
    const storage = options.storage || defaultStorage();
    const clock = options.clock || { wall: () => Date.now(), mono: () => global.performance?.now?.() ?? Date.now() };
    const host = options.host || global, doc = options.document || global.document;
    const timers = options.timers || { setInterval: (...args) => global.setInterval(...args), clearInterval: handle => global.clearInterval(handle) };
    const locks = options.locks === undefined ? global.navigator?.locks : options.locks;
    const key = keyFor(profileId), leaseKey = key + ':lease', owner = id();
    let state = Core.empty(profileId, nickname, clock.wall());
    let sharedIdentity = options.identity;
    const requestedIdentity = () => typeof options.getIdentity === 'function' ? options.getIdentity() : sharedIdentity;
    let storedRevision = 0, protectedSave = false, storageError = '', lockConflict = false;
    let activeView = false, destroyed = false, ownerHeld = false, interval = null;
    let browserRelease = null, browserRequest = null, browserLocksUnavailable = false;
    let lastMono = clock.mono(), lastWall = clock.wall(), lastCheckpoint = lastWall, lastLease = lastWall, fraction = 0;
    let activityEpoch = 0, queue = Promise.resolve(), taskRunning = false;
    const listeners = new Set(), removers = [];
    if (typeof options.onChange === 'function') listeners.add(options.onChange);

    function visible() { return !doc || (doc.visibilityState !== 'hidden' && (typeof doc.hasFocus !== 'function' || doc.hasFocus())); }
    function loadStored() {
      if (!storage?.getItem || !storage?.setItem) Core.fail('focus_storage_unavailable', '当前浏览器无法保存静修记录，请允许本机存储后再试。');
      const raw = storage.getItem(key);
      if (!raw) return null;
      if (raw.length > 6000000) Core.fail('focus_save_too_large', '静修存档过大，原记录已保留。');
      return Core.validate(JSON.parse(raw), profileId);
    }
    function restorePause(value) {
      if (value.active?.status === 'running') { value.active.status = 'paused'; value.active.pauseReason = 'restore'; }
      value.nickname = nickname; return value;
    }
    try {
      const saved = loadStored();
      if (saved) { storedRevision = saved.revision; state = restorePause(saved); }
    } catch (error) { protectedSave = true; storageError = failure(error).message; }
    let lastSavedState = Core.clone(state);

    function getSnapshot() {
      return { ...Core.snapshot(state, clock.wall()), storageError, protectedSave, lockConflict, activeView };
    }
    function emit() {
      const view = getSnapshot();
      for (const listener of listeners) { try { listener(view); } catch (_) { /* 视图回调不能打断账本保存。 */ } }
    }
    function readLease() {
      try {
        const raw = storage?.getItem(leaseKey); if (!raw) return null;
        const value = JSON.parse(raw);
        return value && typeof value.owner === 'string' && Number.isFinite(value.expiresAt) ? value : null;
      } catch (_) { return null; }
    }
    function leaseMine() { const value = readLease(); return !!value && value.owner === owner; }
    function otherLease() { const value = readLease(); return !!value && value.owner !== owner && value.expiresAt > clock.wall(); }
    function renewLease() {
      if (!ownerHeld || !leaseMine()) return false;
      try { storage.setItem(leaseKey, JSON.stringify({ owner, expiresAt: clock.wall() + LEASE_MS })); lastLease = clock.wall(); return true; }
      catch (_) { return false; }
    }
    function stopTimer() { if (interval !== null) { timers.clearInterval(interval); interval = null; } }
    function releaseOwner() {
      ownerHeld = false;
      try { if (leaseMine()) storage.removeItem ? storage.removeItem(leaseKey) : storage.setItem(leaseKey, ''); } catch (_) { /* 已保存的记录不依赖释放成功。 */ }
      if (browserRelease) { const release = browserRelease; browserRelease = null; release(); }
    }
    function resetClock() { lastMono = clock.mono(); lastWall = clock.wall(); fraction = 0; }
    function acceptNewerState() {
      const saved = loadStored();
      if (saved && saved.revision !== storedRevision) { state = restorePause(saved); storedRevision = saved.revision; lastSavedState = Core.clone(state); resetClock(); }
    }
    async function acquireBrowserLock() {
      if (!locks?.request || browserLocksUnavailable) return true;
      if (browserRelease) return true;
      if (browserRequest) { try { await browserRequest; } catch (_) {} browserRequest = null; }
      return new Promise(resolve => {
        let resolved = false;
        const settle = result => { if (!resolved) { resolved = true; resolve(result); } };
        try {
          browserRequest = locks.request(key + ':owner', { mode: 'exclusive', ifAvailable: true }, async lock => {
            if (!lock) { settle(false); return; }
            const released = new Promise(done => { browserRelease = done; });
            settle(true); await released;
          });
          Promise.resolve(browserRequest).catch(() => { browserLocksUnavailable = true; settle(true); });
        } catch (_) { browserLocksUnavailable = true; browserRequest = null; settle(true); }
      });
    }
    async function claimOwner() {
      if (ownerHeld && leaseMine()) return true;
      if (otherLease()) { lockConflict = true; return false; }
      if (!await acquireBrowserLock()) { lockConflict = true; return false; }
      if (otherLease()) { releaseOwner(); lockConflict = true; return false; }
      try {
        storage.setItem(leaseKey, JSON.stringify({ owner, expiresAt: clock.wall() + LEASE_MS }));
        if (!leaseMine()) { releaseOwner(); lockConflict = true; return false; }
        ownerHeld = true; lockConflict = false; lastLease = clock.wall();
        if (!protectedSave) acceptNewerState();
        return true;
      } catch (error) { releaseOwner(); Core.fail('focus_storage_unavailable', '静修进度暂时无法保存，请检查浏览器本机存储。'); }
    }
    function save(force = false) {
      if (protectedSave && !force) Core.fail('focus_save_protected', storageError || '原静修存档已保留，请先恢复备份。');
      if (!ownerHeld || !leaseMine()) Core.fail('focus_other_tab', '另一页面正在静修，请先暂停那一页。');
      if (!force) {
        const previous = loadStored();
        if (previous && previous.revision !== storedRevision) Core.fail('focus_save_changed', '静修记录已在另一页面更新，请重新读取后继续。');
      }
      try { storage.setItem(key, JSON.stringify(state)); }
      catch (_) { Core.fail('focus_storage_unavailable', '静修记录保存失败，原存档已保留。请检查本机存储后继续。'); }
      storedRevision = state.revision; lastSavedState = Core.clone(state); lastCheckpoint = clock.wall(); storageError = '';
    }
    function requireActive() {
      if (!activeView || !visible()) Core.fail('focus_not_foreground', '请回到静修页面后点击继续。');
    }
    // 只采信连续的前台时间。系统挂起或时钟异常留下的空档直接暂停。
    function accrue() {
      if (state.active?.status !== 'running') { resetClock(); return { completed: false }; }
      const mono = clock.mono(), wall = clock.wall();
      const delta = mono - lastMono, wallDelta = wall - lastWall;
      if (!Number.isFinite(delta) || delta < 0 || delta > MAX_GAP_MS || Math.abs(wallDelta - delta) > MAX_GAP_MS) {
        Core.pause(state, 'suspended', wall); resetClock(); return { suspended: true, completed: false };
      }
      const exact = delta + fraction, amount = Math.floor(exact); fraction = exact - amount;
      lastMono = mono; lastWall = wall;
      return Core.advance(state, amount, wall);
    }
    function ensureTimer() {
      if (!destroyed && activeView && state.active?.status === 'running' && ownerHeld) {
        if (interval === null) interval = timers.setInterval(step, 250);
      } else stopTimer();
    }
    function storageFailure(error) {
      storageError = failure(error).message;
      state = Core.clone(lastSavedState);
      Core.pause(state, 'storage', clock.wall()); stopTimer(); releaseOwner();
    }
    function step() {
      if (destroyed || taskRunning || state.active?.status !== 'running') return;
      if (!activeView || !visible()) { pauseNow(!activeView ? 'leave' : doc?.visibilityState === 'hidden' ? 'hidden' : 'blur', true); return; }
      if (!ownerHeld || !leaseMine()) { pauseNow('other_tab', false); return; }
      try {
        const result = accrue();
        if (result.completed || result.suspended || result.newUnlocks?.length || clock.wall() - lastCheckpoint >= CHECKPOINT_MS) save();
        if (clock.wall() - lastLease >= 2000 && !renewLease()) Core.fail('focus_storage_unavailable', '静修进度暂时无法保存，计时已暂停。');
        if (state.active?.status !== 'running') releaseOwner();
        ensureTimer(); emit();
      } catch (error) { storageFailure(error); emit(); }
    }
    // 离开事件在当前调用栈保存，避免等待 Promise 时页面已被关闭。
    function pauseNow(reason = 'manual', credit = true) {
      activityEpoch++;
      if (state.active?.status === 'running') {
        try {
          if (ownerHeld && leaseMine()) {
            if (credit) accrue();
            Core.pause(state, reason, clock.wall()); save();
          } else {
            Core.pause(state, 'other_tab', clock.wall()); lockConflict = true;
            try { acceptNewerState(); } catch (_) {}
          }
        } catch (error) { storageFailure(error); }
      }
      stopTimer(); releaseOwner(); resetClock(); emit();
      return { ok: !storageError, ...(storageError ? { code: 'focus_storage_unavailable', message: storageError } : {}) };
    }
    function perform(mutator, { foreground = false, recovering = false } = {}) {
      const requestedEpoch = activityEpoch;
      const task = async () => {
        if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭，请重新进入。' };
        if (protectedSave && !recovering) return { ok: false, code: 'focus_save_protected', message: storageError };
        let before = null;
        try {
          if (foreground) requireActive();
          if (!await claimOwner()) Core.fail('focus_other_tab', '另一页面正在静修，请先暂停那一页，再回来继续。');
          if (destroyed) Core.fail('focus_closed', '静修已关闭，请重新进入。');
          if (foreground) { requireActive(); if (requestedEpoch !== activityEpoch) Core.fail('focus_left_during_action', '你已离开过静修，请重新点击开始或继续。'); }
          taskRunning = true;
          if (state.active?.status === 'running' && activeView && visible()) accrue();
          before = Core.clone(state);
          const result = mutator();
          Core.ensureProgress(state, clock.wall());
          save(recovering);
          if (recovering) { protectedSave = false; storageError = ''; }
          resetClock();
          if (state.active?.status !== 'running') releaseOwner();
          ensureTimer(); emit(); return result || { ok: true };
        } catch (error) {
          if (before) state = before;
          if (error?.code === 'focus_other_tab') lockConflict = true;
          const interrupted = !error?.code || ['focus_closed', 'focus_storage_unavailable', 'focus_save_changed', 'focus_other_tab', 'focus_not_foreground', 'focus_left_during_action'].includes(error.code);
          if (interrupted) {
            if (!error?.code || ['focus_storage_unavailable', 'focus_save_changed'].includes(error.code)) storageError = failure(error).message;
            if (error?.code === 'focus_save_changed') { try { acceptNewerState(); } catch (_) {} }
            else if (!error?.code || error?.code === 'focus_storage_unavailable') state = Core.clone(lastSavedState);
            if (state.active?.status === 'running') Core.pause(state, error?.code === 'focus_other_tab' ? 'other_tab' : 'storage', clock.wall());
            stopTimer(); releaseOwner();
          } else {
            // 输入校验失败不能抹掉刚才已确认的时间，也不应无故中止专注。
            try { if (before && ownerHeld && leaseMine()) save(); } catch (saveError) { storageFailure(saveError); }
            if (state.active?.status !== 'running') releaseOwner();
            resetClock(); ensureTimer();
          }
          emit(); return failure(error);
        } finally { taskRunning = false; }
      };
      const result = queue.then(task, task); queue = result.then(() => undefined, () => undefined); return result;
    }
    async function persistProgress() {
      await queue;
      if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭，请重新进入。' };
      if (protectedSave) return { ok: false, code: 'focus_save_protected', message: storageError };
      try {
        if (!ownerHeld) acceptNewerState();
        // 先检查副本；另一页持有计时权时，浏览面板不能争抢或改写它的账本。
        if (otherLease()) return { ok: true };
        const probe = { ...state, owned: [...state.owned], achievements: { ...(state.achievements || {}) } };
        if (!Core.ensureProgress(probe, clock.wall()).changed) return { ok: true };
        return await perform(() => ({ ok: true, ...Core.ensureProgress(state, clock.wall()) }));
      } catch (error) { return failure(error); }
    }
    function listen(target, name, fn) {
      if (typeof target?.addEventListener !== 'function') return;
      target.addEventListener(name, fn); removers.push(() => target.removeEventListener?.(name, fn));
    }
    listen(doc, 'visibilitychange', () => { if (doc.visibilityState === 'hidden') pauseNow('hidden'); });
    listen(host, 'blur', () => { if (activeView) pauseNow('blur'); });
    listen(host, 'pagehide', () => { pauseNow('leave'); activeView = false; });
    listen(host, 'storage', event => {
      if (event.key !== key && event.key !== leaseKey) return;
      if (ownerHeld && !leaseMine()) { pauseNow('other_tab', false); return; }
      if (!ownerHeld) {
        try { acceptNewerState(); lockConflict = otherLease(); } catch (error) { protectedSave = true; storageError = failure(error).message; }
        emit();
      }
    });

    const api = {
      getSnapshot,
      async getProgress(options = {}) {
        await queue;
        if (protectedSave) return { ok: false, code: 'focus_save_protected', message: storageError };
        try {
          // 先校验查询，错误日期不会触发升级写入或取得计时权。
          Core.progress(state, clock.wall(), options);
          const saved = await persistProgress();
          if (!saved.ok) return saved;
          return { ok: true, progress: Core.progress(state, clock.wall(), options) };
        } catch (error) { return failure(error); }
      },
      subscribe(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
      setActive(value) {
        if (!value) { const result = pauseNow('leave'); activeView = false; ensureTimer(); emit(); return Promise.resolve(result); }
        activeView = true;
        try { if (!ownerHeld && !protectedSave) acceptNewerState(); lockConflict = otherLease(); } catch (error) { protectedSave = true; storageError = failure(error).message; }
        emit();
        if (protectedSave) return Promise.resolve({ ok: false, code: 'focus_save_protected', message: storageError });
        return persistProgress().then(result => {
          if (!result.ok) return result;
          const identity = requestedIdentity();
          return identity === undefined ? result : api.syncIdentity(identity);
        });
      },
      syncIdentity(value) {
        let next; try { next = Core.normalizeIdentity(value); } catch (error) { return Promise.resolve(failure(error)); }
        sharedIdentity = next;
        return perform(() => Core.setIdentity(state, next, clock.wall()));
      },
      selectScene(sceneId) {
        pauseNow('scene');
        return perform(() => { if (!global.SpiritFocusCatalog.SCENES.some(scene => scene.id === sceneId)) Core.fail('scene_unknown', '该场景暂不可用。'); if (state.sceneId !== sceneId) { state.sceneId = sceneId; state.seatId = null; Core.touch(state, clock.wall()); } return { ok: true }; });
      },
      selectSeat(seatId) {
        if (state.seatId !== seatId) pauseNow('seat');
        return perform(() => { if (!Number.isInteger(seatId) || seatId < 0 || seatId > 7) Core.fail('seat_invalid', '请选择有效座位。'); state.seatId = seatId; Core.touch(state, clock.wall()); return { ok: true }; });
      },
      start(input) { return perform(() => Core.start(state, input, clock.wall(), id()), { foreground: true }); },
      pause(reason = 'manual') { return Promise.resolve(pauseNow(reason)); },
      resume() { return perform(() => Core.resume(state, clock.wall()), { foreground: true }); },
      cancel() { return perform(() => Core.cancel(state, clock.wall())); },
      startBreak() { return perform(() => Core.startBreak(state, clock.wall(), id()), { foreground: true }); },
      endBreak() { return perform(() => Core.endBreak(state, clock.wall())); },
      setSettings(patch) { return perform(() => Core.setSettings(state, patch, clock.wall())); },
      buy(itemId) { pauseNow('panel'); return perform(() => Core.buy(state, itemId, clock.wall())); },
      equip(itemId) { pauseNow('panel'); return perform(() => Core.equip(state, itemId, clock.wall())); },
      exportData() {
        if (protectedSave) Core.fail('focus_save_protected', storageError);
        if (!ownerHeld) acceptNewerState();
        // 导出本身不发奖；正在进行的段在新页面中一律恢复为暂停。
        const exported = Core.validate(state, profileId);
        if (exported.active?.status === 'running') { exported.active.status = 'paused'; exported.active.pauseReason = 'restore'; }
        return exported;
      },
      importData(value) {
        let next; try { next = parseExport(value); } catch (error) { return Promise.resolve(failure(error)); }
        pauseNow('restore');
        return perform(() => {
          next.profileId = profileId; next.nickname = nickname; restorePause(next);
          next.revision = Math.max(next.revision, state.revision) + 1; next.updatedAt = Math.floor(clock.wall());
          state = Core.clone(next);
          const identity = requestedIdentity();
          if (identity !== undefined) Core.setIdentity(state, identity, clock.wall());
          return { ok: true };
        }, { recovering: true });
      },
      async destroy() {
        if (destroyed) return { ok: true };
        pauseNow('leave'); activeView = false; destroyed = true;
        for (const remove of removers) remove(); removers.length = 0; listeners.clear();
        instances.get(profileId)?.delete(api); if (instances.get(profileId)?.size === 0) instances.delete(profileId);
        return { ok: true };
      }
    };
    if (!instances.has(profileId)) instances.set(profileId, new Set());
    instances.get(profileId).add(api);
    return api;
  }
  function exportProfile(profileId) {
    const pool = [...(instances.get(profileId) || [])];
    const active = pool.find(engine => engine.getSnapshot().activeView && engine.getSnapshot().active?.status === 'running') || pool[0];
    if (active) return active.exportData();
    const storage = defaultStorage();
    if (!storage) Core.fail('focus_storage_unavailable', '当前浏览器无法读取静修存档。');
    const raw = storage.getItem(keyFor(profileId));
    if (!raw) return null;
    const state = Core.validate(JSON.parse(raw), profileId);
    if (state.active?.status === 'running') { state.active.status = 'paused'; state.active.pauseReason = 'restore'; }
    return state;
  }
  async function importProfile(profileId, value) {
    const current = [...(instances.get(profileId) || [])][0];
    if (current) return current.importData(value);
    const engine = create({ profileId });
    try { return await engine.importData(value); } finally { await engine.destroy(); }
  }
  global.SpiritFocus = Object.freeze({ create, getAppearance, exportProfile, importProfile, validateExport, storageKey: keyFor });
})(typeof globalThis !== 'undefined' ? globalThis : window);
