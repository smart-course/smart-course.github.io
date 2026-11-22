/* 静修在线控制器：云端账本、前台心跳与房间同步；本机存档不参与在线发币。 */
(function (global) {
  'use strict';
  // 智慧课堂接入（2026-11-22）：云间灵田的后台是云开发云函数＋数据接口，每次心跳都要按次计费（约 3 次数据接口调用），
  // 原 v93 每 3 秒一次心跳在这里改为每 10 秒一次；失联判定 8 秒→25 秒、请求超时 8 秒→15 秒（云函数冷启动要几秒），与云函数里的 FOCUS_* 常量配套
  const HEARTBEAT_MS = 10000, STALE_MS = 25000, MAX_TICK_GAP_MS = 5000, REQUEST_TIMEOUT_MS = 15000;
  const BACKGROUND_ACTIONS = new Set(['heartbeat', 'refreshRooms', 'getProgress']);
  const PUBLIC_PAUSE_REASONS = new Set([...Object.keys(global.SpiritFocusCatalog?.PAUSE_REASONS || {}), 'module', 'network', 'disconnected', 'connection', 'reconnect', 'owner', 'room']);
  const publicPauseReason = value => typeof value === 'string' && PUBLIC_PAUSE_REASONS.has(value) ? value : 'manual';
  const uuid = () => global.crypto?.randomUUID?.() || 'focus-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  const clone = value => JSON.parse(JSON.stringify(value));
  const failure = error => ({ ok: false, code: error?.code || 'focus_network_error', message: error?.message || '静修连接已中断，计时已暂停。请重新连接后手动继续。' });
  function makeError(code, message, status) { const error = new Error(message); error.code = code; error.status = status; return error; }
  function create(options = {}) {
    const Core = global.SpiritFocusCore;
    if (!Core) throw new Error('静修资源尚未准备完成。');
    const accountKey = String(options.accountKey || '');
    const profileId = String(options.profileId || 'cloud:' + accountKey);
    const clientId = String(options.clientId || uuid());
    const nickname = String(options.nickname || '修习者').trim().slice(0, 40) || '修习者';
    const host = options.host || global, doc = options.document || global.document;
    const fetcher = options.fetch || (global.fetch && global.fetch.bind(global));
    const clock = options.clock || { wall: () => Date.now(), mono: () => global.performance?.now?.() ?? Date.now() };
    const timers = options.timers || {
      setInterval: (...args) => global.setInterval(...args), clearInterval: handle => global.clearInterval(handle),
      setTimeout: (...args) => global.setTimeout(...args), clearTimeout: handle => global.clearTimeout(handle)
    };
    const listeners = new Set(), removers = [];
    if (typeof options.onChange === 'function') listeners.add(options.onChange);
    const initial = Core.empty(profileId, nickname, clock.wall());
    if (options.identity !== undefined) Core.setIdentity(initial, options.identity, clock.wall());
    let state = Core.snapshot(initial, clock.wall());
    const peerDisplay = new Map();
    let lastPeerDisplaySecond = -1;
    let legacyLocal = null, legacySnapshot = null, legacyError = '';
    // 只读取 v78 的本机档案，保留原键和值，绝不将它导入云端余额。
    try {
      legacyLocal = global.SpiritFocus?.exportProfile?.(profileId) || null;
      if (legacyLocal) { legacyLocal = clone(legacyLocal); legacySnapshot = Core.snapshot(legacyLocal, clock.wall()); }
    } catch (_) { legacyError = '此前的本机静修记录暂时无法读取，原存档仍已保留。'; }
    let activeView = false, destroyed = false, connection = 'connecting', connectionError = '';
    let interval = null, pending = 0, interactivePending = 0, heartbeatPending = false, queue = Promise.resolve();
    let queuedMutations = 0, backgroundRequest = null, pauseRequest = null, lastRunSequence = 0;
    const runIntents = new Set();
    let revision = -1, serverTime = 0, sequence = 0, epoch = 0, foregroundRevision = 0, latestSuccessfulSequence = 0, lastAcceptedAt = clock.mono();
    let lastTickMono = clock.mono(), lastTickWall = clock.wall(), lastHeartbeatAt = clock.mono(), lastDirectoryAt = clock.mono();
    let displayAnchorAt = clock.mono(), displayAnchorElapsed = 0;
    let pauseLatch = true, pauseReason = 'restore', frozenElapsed = null, lockConflict = false;
    let pauseInFlight = 0;
    let lastHistoryKey = '', frozenHistory = Object.freeze([]);
    const foreground = () => activeView && (!doc || (doc.visibilityState !== 'hidden' && (typeof doc.hasFocus !== 'function' || doc.hasFocus())));
    const ownSession = () => !state.active?.ownerClientId || state.active.ownerClientId === clientId;
    const running = () => state.active?.status === 'running' && ownSession() && !pauseLatch && !lockConflict && foreground() && connection === 'connected';
    function currentElapsed() {
      if (!state.active) return 0;
      if (frozenElapsed !== null) return frozenElapsed;
      const projected = running() ? Math.max(0, Math.min(STALE_MS, clock.mono() - displayAnchorAt)) : 0;
      // 显示可以平滑插值，但完成、收入和历史只采信服务端结果。
      return Math.min(state.active.minutes * 60000, (running() ? displayAnchorElapsed : state.active.elapsedMs) + projected);
    }
    function peerElapsed(person, at = clock.mono()) {
      const duration = Number.isFinite(person.durationMs) ? Math.max(0, person.durationMs) : 0;
      const base = Number.isFinite(person.elapsedMs) ? Math.min(duration, Math.max(0, person.elapsedMs)) : 0;
      const anchor = Number.isFinite(person.timerAt) && person.timerAt > 0 ? person.timerAt : serverTime;
      const age = Math.max(0, serverTime - anchor) + Math.max(0, at - lastAcceptedAt);
      const flowing = ['focus', 'rest'].includes(person.status);
      return { base, duration, age, elapsed: Math.min(duration, base + (flowing ? Math.min(STALE_MS, age) : 0)) };
    }
    function freezePeers() {
      if (connection !== 'connected') return;
      for (const person of state.participants || []) {
        if (!person.isSelf && person.sessionId) peerDisplay.set(person.id, { sessionId: person.sessionId, elapsedMs: peerElapsed(person).elapsed });
      }
    }
    function participantViews(active) {
      const ids = new Set(), visible = foreground() && connection === 'connected';
      const participants = (state.participants || []).map(person => {
        ids.add(person.id);
        if (person.isSelf) return { ...person, avatarId: state.identity?.avatarId || person.avatarId || null, equipped: { ...state.equipped },
          sessionId: active?.id || null, kind: active?.kind || null, elapsedMs: active ? active.elapsedMs : 0, durationMs: active ? active.minutes * 60000 : 0,
          pauseReason: active?.status === 'paused' ? publicPauseReason(active.pauseReason) : '', timerStale: false,
          // 已结束的会话仍留在 active 中供复盘，不能被兜底状态重新显示为暂停。
          status: active?.status === 'running' ? active.kind === 'break' ? 'rest' : 'focus' : active?.status === 'completed' ? 'completed' : active?.status === 'cancelled' ? 'ended' : active?.status === 'paused' ? 'paused' : 'idle' };
        const reportedPauseReason = person.status === 'paused' ? publicPauseReason(person.pauseReason) : '';
        if (!person.sessionId || !Number.isFinite(person.durationMs)) return { ...person, pauseReason: reportedPauseReason };
        const timing = peerElapsed(person), cached = peerDisplay.get(person.id);
        const flowing = ['focus', 'rest'].includes(person.status);
        let elapsedMs = timing.base;
        if (flowing) elapsedMs = visible ? timing.elapsed : Math.min(timing.duration, Math.max(timing.base, cached?.sessionId === person.sessionId ? cached.elapsedMs : timing.base));
        peerDisplay.set(person.id, { sessionId: person.sessionId, elapsedMs });
        // 仅头顶时间做有界插值；失联与离页冻结，结算仍只读服务端账本。
        const stale = flowing && (!visible || timing.age > STALE_MS);
        return { ...person, elapsedMs, status: stale ? 'paused' : person.status,
          pauseReason: stale ? 'disconnected' : reportedPauseReason, timerStale: stale };
      });
      for (const id of peerDisplay.keys()) if (!ids.has(id)) peerDisplay.delete(id);
      return participants;
    }
    function getSnapshot() {
      const active = state.active ? { ...state.active } : null;
      const effectiveLock = lockConflict || (!!active?.ownerClientId && active.ownerClientId !== clientId && active.status === 'running');
      if (active) {
        active.elapsedMs = currentElapsed(); active.remainingMs = Math.max(0, active.minutes * 60000 - active.elapsedMs);
        if (active.status === 'running' && (pauseLatch || effectiveLock || !foreground() || connection !== 'connected')) {
          active.status = 'paused'; active.pauseReason = effectiveLock ? 'other_tab' : pauseReason || 'network';
        }
        active.pauseReason = active.status === 'paused' ? publicPauseReason(active.pauseReason) : '';
      }
      const projectedFocus = active?.kind === 'focus' ? Math.max(0, active.elapsedMs - (state.active?.elapsedMs || 0)) : 0;
      return { ...state, active, online: true, profileId, clientId, activeView,
        connection, connected: connection === 'connected', connectionError, busy: interactivePending > 0 || queuedMutations > 0,
        storageError: '', protectedSave: false, lockConflict: effectiveLock,
        totalFocusMs: state.totalFocusMs + projectedFocus, todayFocusMs: state.todayFocusMs + projectedFocus,
        room: state.room || null, rooms: state.rooms || [], participants: participantViews(active),
        friends: state.friends || [], friendRequests: state.friendRequests || [], friendCode: state.friendCode || '',
        legacyLocal, legacySnapshot, legacyError, localRecoveryAvailable: !!legacyLocal,
        authRequired: connection === 'auth_required', accountChanged: connection === 'account_changed',
        syncIntervalMs: HEARTBEAT_MS, serverTime
      };
    }
    function emit() {
      if (destroyed) return;
      const value = getSnapshot();
      for (const fn of listeners) { try { fn(value); } catch (_) { /* 视图回调不影响同步状态。 */ } }
    }
    function stopTimer() { if (interval !== null) { timers.clearInterval(interval); interval = null; } }
    function resetClock() { lastTickMono = clock.mono(); lastTickWall = clock.wall(); }
    function ensureTimer() {
      if (!destroyed && foreground() && connection === 'connected') {
        if (interval === null) { resetClock(); interval = timers.setInterval(tick, 250); }
      } else stopTimer();
    }
    function freeze(reason) {
      freezePeers();
      if (state.active?.status === 'running' && ownSession() && frozenElapsed === null) frozenElapsed = currentElapsed();
      // 离页与旧请求报错分开记录；重连可以重建连接，不能越过新的离页意图。
      if (['hidden', 'blur', 'leave'].includes(reason)) foregroundRevision++;
      pauseLatch = true; pauseReason = reason; epoch++; resetClock();
    }
    function connectionFailure(error) {
      freeze(error?.code === 'focus_other_tab' ? 'other_tab' : 'network');
      if (error?.code === 'account_mismatch') connection = 'account_changed';
      else if (error?.status === 401 || error?.code === 'authentication_required') connection = 'auth_required';
      else connection = 'disconnected';
      connectionError = failure(error).message; stopTimer(); emit();
    }
    function command(action, args = {}) {
      return { accountKey, requestId: uuid(), action, args: { ...args, clientId, clientSequence: ++sequence } };
    }
    function superseded() { return { ok: false, code: 'focus_request_superseded', message: '' }; }
    function cancelBackground() {
      const previous = backgroundRequest;
      if (!previous) return;
      backgroundRequest = null; previous.cancelled = true;
      previous.resolveCancelled(superseded());
      previous.interrupt?.(makeError('focus_request_superseded', ''));
    }
    function readiness({ needsForeground = false, connect = false } = {}) {
      if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭，请重新进入。' };
      if (!/^[a-f0-9]{64}$/.test(accountKey)) return { ok: false, code: 'account_mismatch', message: '静修账户无效，请刷新游戏后继续。' };
      if (needsForeground && !foreground()) return { ok: false, code: 'focus_not_foreground', message: '请回到静修页面，再点击开始或继续。' };
      if (!connect && connection !== 'connected') return { ok: false, code: connection === 'connecting' ? 'focus_connecting' : 'focus_disconnected', message: connection === 'connecting' ? '正在连接雅室，连接完成后即可入席。' : connectionError || '请先重新连接静修。' };
      return null;
    }
    async function request(body, { keepalive = false, control = null } = {}) {
      if (typeof fetcher !== 'function') throw makeError('focus_network_error', '当前页面无法连接静修服务。');
      const controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;
      let timeout = null, interrupt;
      const interrupted = new Promise((_, reject) => { interrupt = error => { reject(error); controller?.abort(); }; });
      if (control) control.interrupt = interrupt;
      // 超时与主动取消均能结束等待，即使旧浏览器或自定义 fetch 没有响应 abort。
      if (timers.setTimeout) timeout = timers.setTimeout(() => interrupt(makeError('focus_timeout', '静修连接超时，计时已暂停。请重新连接后手动继续。')), REQUEST_TIMEOUT_MS);
      try {
        const transport = (async () => {
          const url = body ? '/api/focus' : '/api/focus?clientId=' + encodeURIComponent(clientId) + '&accountKey=' + encodeURIComponent(accountKey);
          const response = await fetcher(url, {
            method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', keepalive,
            headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
            ...(controller ? { signal: controller.signal } : {})
          });
          let data; try { data = await response.json(); } catch (error) { if (error?.name === 'AbortError') throw error; throw makeError('focus_response_invalid', '静修服务暂未返回完整记录，计时已暂停。'); }
          if (!response.ok || data?.ok === false) {
            const error = makeError(data?.code || 'focus_request_failed', data?.message || '本次操作未完成，请稍后重试。', response.status);
            error.payload = data; throw error;
          }
          if (!data || data.accountKey !== accountKey) throw makeError('account_mismatch', '登录账户已变化，请刷新页面后继续。', 409);
          return data;
        })();
        return await Promise.race([transport, interrupted]);
      } catch (error) {
        if (error?.name === 'AbortError') throw makeError('focus_timeout', '静修连接超时，计时已暂停。请重新连接后手动继续。');
        throw error;
      } finally {
        if (timeout !== null) timers.clearTimeout(timeout);
        if (control?.interrupt === interrupt) control.interrupt = null;
      }
    }
    function accept(payload, context = {}) {
      const next = payload.snapshot;
      if (!next || typeof next !== 'object' || !Number.isSafeInteger(next.revision ?? payload.revision) || !Number.isFinite(payload.serverTime) || (next.history !== undefined && !Array.isArray(next.history)) || (revision < 0 && !Array.isArray(next.history)) || !next.settings || !Number.isFinite(next.jade)) throw makeError('focus_response_invalid', '静修服务暂未返回完整记录，计时已暂停。');
      const incomingRevision = next.revision ?? payload.revision;
      if (incomingRevision < revision || (incomingRevision === revision && payload.serverTime < serverTime)) return false;
      revision = incomingRevision; serverTime = payload.serverTime;
      const active = next.active ? { ...next.active } : null;
      const priorDisplay = currentElapsed(), continuous = running() && active?.status === 'running' && active.id === state.active?.id;
      // 重复心跳复用历史引用，避免每 250 毫秒重建记录列表。
      if (Array.isArray(next.history)) {
        const historyKey = JSON.stringify(next.history);
        if (lastHistoryKey !== historyKey) { frozenHistory = Object.freeze(next.history.map(row => Object.freeze({ ...row }))); lastHistoryKey = historyKey; }
      }
      if (Object.hasOwn(next, 'rooms')) lastDirectoryAt = clock.mono();
      state = { ...state, ...next, revision, active, history: frozenHistory, profileId };
      lockConflict = !!next.lockConflict || (!!active?.ownerClientId && active.ownerClientId !== clientId && active.status === 'running');
      lastAcceptedAt = clock.mono();
      // 普通设置响应不能推迟心跳，也不能令秒表向回跳；账本仍只采用服务器确认值。
      if (context.heartbeat) lastHeartbeatAt = lastAcceptedAt;
      displayAnchorAt = lastAcceptedAt; displayAnchorElapsed = active ? Math.max(active.elapsedMs, continuous ? priorDisplay : 0) : 0;
      resetClock();
      if (active?.status !== 'running') frozenElapsed = null;
      else if (pauseLatch && frozenElapsed !== null) frozenElapsed = Math.max(active.elapsedMs, Math.min(frozenElapsed, active.minutes * 60000));
      if (context.allowRun && context.epoch === epoch && foreground() && !lockConflict && active?.status === 'running' && ownSession()) {
        pauseLatch = false; pauseReason = ''; frozenElapsed = null;
      }
      if (context.connect && context.epoch === epoch) { connection = 'connected'; connectionError = ''; }
      ensureTimer(); emit(); return true;
    }
    function isTransportError(error) {
      return !error?.status || error.status >= 500 || error.status === 401 || ['account_mismatch', 'authentication_required'].includes(error.code);
    }
    async function execute(body, context = {}) {
      // 无感同步只在收到数据时更新视图，避免请求前后各触发一轮完整界面刷新。
      // pending 仍覆盖所有请求，保留心跳防重和原有命令顺序；交互操作单独提示忙碌。
      const interactive = !BACKGROUND_ACTIONS.has(body.action);
      pending++;
      if (interactive) { interactivePending++; emit(); }
      try {
        const payload = await request(body, context);
        if (context.control?.cancelled) return superseded();
        if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭。' };
        const accepted = accept(payload, { ...context, heartbeat: ['open', 'heartbeat', 'refreshRooms', 'start', 'resume', 'startBreak'].includes(body.action) }); latestSuccessfulSequence = Math.max(latestSuccessfulSequence, body.args.clientSequence);
        // 开始请求尚未返回时离开，新的暂停命令会越过队列并使早到/晚到响应都失去继续权。
        // 已被较新暂停覆盖的旧响应不能再次冻结用户随后主动排队的“继续”。
        if (accepted && context.allowRun && context.epoch !== epoch && payload.snapshot?.active?.status === 'running' && ownSession()) void pauseNow(pauseReason || 'leave');
        return { ...payload, ok: true };
      } catch (error) {
        if (context.control?.cancelled || error?.code === 'focus_request_superseded') return superseded();
        if (!destroyed && (body.args.clientSequence >= latestSuccessfulSequence || error?.code === 'account_mismatch' || error?.status === 401)) {
          if (isTransportError(error)) connectionFailure(error);
          else {
            if (error.code === 'focus_other_tab' || error.code === 'focus_session_owned') {
              freeze('other_tab'); lockConflict = true; connection = 'disconnected'; connectionError = error.message; stopTimer();
              // 读取当前进度供本人查看，不用 open 夺取另一设备的席位或会话。
              try { const latest = await request(null); if (!destroyed) accept(latest); } catch (readError) { if (readError?.code === 'account_mismatch' || readError?.status === 401) connectionFailure(readError); }
            }
            if (error.payload?.snapshot && error.payload.accountKey === accountKey) { try { accept(error.payload); } catch (_) {} }
            emit();
          }
        }
        return failure(error);
      } finally {
        pending--;
        if (interactive) { interactivePending--; emit(); }
      }
    }
    function performBackground(action, args) {
      const refused = readiness(); if (refused) return Promise.resolve(refused);
      const key = action + ':' + JSON.stringify(args);
      if (backgroundRequest?.key === key && !backgroundRequest.cancelled) return backgroundRequest.promise;
      cancelBackground();
      const requestedEpoch = epoch, control = { key, cancelled: false, interrupt: null, resolveCancelled: null, promise: null };
      const cancelled = new Promise(resolve => { control.resolveCancelled = resolve; });
      // 后台只等待既有用户修改和必要暂停；后续用户操作可以立即取消它，绝不排在它后面。
      const task = Promise.all([queue, pauseRequest?.promise]).then(() => {
        if (control.cancelled || requestedEpoch !== epoch || destroyed) return superseded();
        const blocked = readiness(); if (blocked) return blocked;
        return execute(command(action, args), { epoch: requestedEpoch, control });
      });
      control.promise = Promise.race([task, cancelled]).finally(() => { if (backgroundRequest === control) backgroundRequest = null; });
      backgroundRequest = control; return control.promise;
    }
    function perform(action, args = {}, { needsForeground = false, allowRun = false, connect = false } = {}) {
      if (BACKGROUND_ACTIONS.has(action)) return performBackground(action, args);
      const refused = readiness({ needsForeground, connect }); if (refused) return Promise.resolve(refused);
      cancelBackground();
      const requestedEpoch = epoch;
      const intent = allowRun ? {} : null;
      if (intent) runIntents.add(intent);
      queuedMutations++;
      const task = async () => {
        // 必要暂停必须先落到服务器，不能让较新的购买、设置或继续命令使它的序号过期。
        // 这里只等待安全屏障；慢心跳和目录读取不占用用户操作队列。
        while (pauseRequest) {
          const paused = await pauseRequest.promise;
          if (!paused.ok) return paused;
        }
        const blocked = readiness({ needsForeground, connect }); if (blocked) return blocked;
        if (needsForeground && (!foreground() || requestedEpoch !== epoch)) return { ok: false, code: 'focus_not_foreground', message: '请回到静修页面，再点击开始或继续。' };
        const body = command(action, args);
        if (intent) lastRunSequence = body.args.clientSequence;
        return execute(body, { epoch: requestedEpoch, allowRun, connect });
      };
      const result = queue.then(task, task).finally(() => { queuedMutations--; if (intent) runIntents.delete(intent); emit(); });
      queue = result.then(() => undefined, () => undefined); return result;
    }
    // 暂停必须立即发送，不能排在可能挂起的开始/心跳之后。
    function pauseNow(reason = 'manual', action = 'pause') {
      const needsRemote = action === 'close' || (state.active?.status === 'running' && ownSession()) || runIntents.size > 0;
      const lifecycle = action === 'close' || ['hidden', 'blur', 'leave', 'network', 'suspended', 'other_tab'].includes(reason);
      // 浏览已暂停的面板无需往返服务器；初次连接时也不能被无活动的面板点击打断 epoch。
      if (!needsRemote && !lifecycle) return pauseRequest?.promise || Promise.resolve({ ok: true });
      freeze(reason); cancelBackground(); ensureTimer(); emit();
      if (!needsRemote) return pauseRequest?.promise || Promise.resolve({ ok: true });
      if (destroyed || !/^[a-f0-9]{64}$/.test(accountKey) || connection === 'auth_required' || connection === 'account_changed') return Promise.resolve({ ok: true });
      if (pauseRequest?.action === action && pauseRequest.sequence >= lastRunSequence) return pauseRequest.promise;
      const body = command(action, action === 'pause' ? { reason } : {}), requestedEpoch = epoch;
      const current = { action, sequence: body.args.clientSequence, promise: null };
      pauseInFlight++;
      current.promise = execute(body, { keepalive: true, epoch: requestedEpoch }).finally(() => { pauseInFlight--; if (pauseRequest === current) pauseRequest = null; });
      pauseRequest = current; return current.promise;
    }
    function pauseAndPerform(reason, action, args = {}) {
      // 先核对连接，再考虑暂停，避免尚在连接时点座位使正常 open 被当作离开取消。
      const refused = readiness(); if (refused) return Promise.resolve(refused);
      void pauseNow(reason); return perform(action, args);
    }
    function tick() {
      if (destroyed || !foreground()) { if (activeView) void pauseNow(doc?.visibilityState === 'hidden' ? 'hidden' : 'blur'); stopTimer(); return; }
      const mono = clock.mono(), wall = clock.wall(), gap = mono - lastTickMono;
      if (running() && (!Number.isFinite(gap) || gap < 0 || gap > MAX_TICK_GAP_MS || Math.abs((wall - lastTickWall) - gap) > MAX_TICK_GAP_MS)) {
        frozenElapsed = state.active.elapsedMs;
        void pauseNow('suspended'); return;
      }
      lastTickMono = mono; lastTickWall = wall;
      if (running() && mono - lastAcceptedAt > STALE_MS) {
        frozenElapsed = state.active.elapsedMs;
        connectionFailure(makeError('focus_stale', '静修同步中断，计时已暂停。请重新连接后手动继续。'));
        void pauseNow('network'); return;
      }
      if (connection === 'connected' && !heartbeatPending && pending === 0 && queuedMutations === 0 && pauseInFlight === 0 && mono - lastHeartbeatAt >= HEARTBEAT_MS) {
        heartbeatPending = true; lastHeartbeatAt = mono;
        void perform('heartbeat', mono - lastDirectoryAt >= 30000 ? { includeDirectory: true } : {}).finally(() => { heartbeatPending = false; });
      }
      // 自己暂停时，同室同修的头顶秒表仍每秒刷新一次；不重建场景或发新请求。
      const second = Math.floor(mono / 1000), peersFlowing = (state.participants || []).some(person => !person.isSelf && ['focus', 'rest'].includes(person.status));
      if (running() || (peersFlowing && second !== lastPeerDisplaySecond)) { lastPeerDisplaySecond = second; emit(); }
    }
    function listen(target, event, fn) {
      if (!target?.addEventListener) return;
      target.addEventListener(event, fn); removers.push(() => target.removeEventListener?.(event, fn));
    }
    listen(doc, 'visibilitychange', () => {
      if (doc.visibilityState === 'hidden') { if (activeView) void pauseNow('hidden'); stopTimer(); }
      else ensureTimer();
    });
    listen(host, 'blur', () => { if (activeView) void pauseNow('blur'); stopTimer(); });
    listen(host, 'focus', () => { ensureTimer(); emit(); });
    listen(host, 'offline', () => {
      if (activeView) { connectionFailure(makeError('focus_network_error', '网络已断开，计时已暂停。联网后请重新连接并手动继续。')); void pauseNow('network'); }
    });
    listen(host, 'pagehide', () => { if (activeView) { activeView = false; void pauseNow('leave', 'close'); } stopTimer(); });
    function waitForForeground() {
      freeze('restore'); connection = 'disconnected';
      connectionError = '已离开静修，连接已暂停。返回后点击“重新连接”，再手动继续。';
      stopTimer(); emit();
      return { ok: false, code: 'focus_not_foreground', message: connectionError };
    }
    async function reconnect() {
      if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭，请重新进入。' };
      if (!foreground()) return waitForForeground();
      const requestedForeground = foregroundRevision;
      freeze('restore'); cancelBackground(); connection = 'connecting'; connectionError = ''; stopTimer(); emit();
      // 旧暂停/离室失败会改变 epoch。先收束此前命令，再建立本次显式 open，
      // 避免把旧连接错误直接当成重连结果；活跃的另一页面仍由服务器拒绝接管。
      await queue;
      while (pauseRequest) await pauseRequest.promise;
      if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭，请重新进入。' };
      if (!foreground() || requestedForeground !== foregroundRevision) return waitForForeground();
      const openingEpoch = epoch; connection = 'connecting'; connectionError = ''; emit();
      const result = await perform('open', {}, { connect: true, needsForeground: true });
      // 资源懒加载、排队或网络响应期间失焦，也必须离开“连接中”，让返回后的用户能手动重连。
      if (!destroyed && (result.code === 'focus_not_foreground' || (result.ok && openingEpoch !== epoch))) return waitForForeground();
      if (!result.ok && connection === 'connecting') { connection = 'disconnected'; connectionError = result.message || '连接未完成，请点击重新连接。'; emit(); }
      if (result.ok && state.active?.status === 'running' && ownSession()) {
        const paused = await pauseNow('restore'); if (!paused.ok) return paused;
      }
      ensureTimer(); return result;
    }
    const api = {
      getSnapshot,
      subscribe(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
      async setActive(value) {
        if (destroyed) return { ok: false, code: 'focus_closed', message: '静修已关闭，请重新进入。' };
        if (!value) { const wasActive = activeView; activeView = false; stopTimer(); if (wasActive) void pauseNow('leave', 'close'); return { ok: true }; }
        if (activeView && connection === 'connected') { ensureTimer(); return { ok: true }; }
        activeView = true; return reconnect();
      },
      reconnect,
      selectScene(sceneId) { return pauseAndPerform('scene', 'selectScene', { sceneId }); },
      selectSeat(seatId) { return state.seatId !== seatId ? pauseAndPerform('seat', 'selectSeat', { seatId }) : perform('selectSeat', { seatId }); },
      start(input = {}) { const mode = input.mode || 'pomodoro'; return perform('start', { target: input.target, minutes: input.minutes ?? (mode === 'pomodoro' ? state.settings.pomodoroFocusMinutes : 25), mode }, { needsForeground: true, allowRun: true }); },
      pause(reason = 'manual') { return pauseNow(reason); },
      resume() { return perform('resume', {}, { needsForeground: true, allowRun: true }); },
      cancel() { return pauseAndPerform('manual', 'cancel'); },
      startBreak() { return perform('startBreak', {}, { needsForeground: true, allowRun: true }); },
      endBreak() { return pauseAndPerform('manual', 'endBreak'); },
      setSettings(patch) { return perform('setSettings', { patch }); },
      buy(itemId) { return pauseAndPerform('panel', 'buy', { itemId }); },
      equip(itemId) { return pauseAndPerform('panel', 'equip', { itemId }); },
      refreshRooms() { return perform('refreshRooms'); },
      // 头像只从灵田服务端资料刷新，不接收客户端对静修账户的直接覆盖。
      syncIdentity() { return perform('refreshRooms'); },
      async getProgress(input = {}) {
        // 修行录按需读取已确认数据；不把本地插值或旧本机存档送入云端账本。
        const args = {};
        if (input.month !== undefined) args.month = input.month;
        if (input.day !== undefined) args.day = input.day;
        const result = await perform('getProgress', args);
        if (!result.ok) return result;
        const progress = result.result?.progress;
        if (!progress || !Array.isArray(progress.days) || !progress.summary) {
          return { ok: false, code: 'focus_progress_unavailable', message: '修行记录暂未读取完整，请重试。' };
        }
        return { ...result, progress };
      },
      createRoom(input = {}) { return pauseAndPerform('room', 'createRoom', { title: input.title, subject: input.subject, sceneId: input.sceneId || state.sceneId, privacy: input.privacy || 'public' }); },
      joinRoom(input) { const args = typeof input === 'string' ? { roomId: input } : { ...input }; return pauseAndPerform('room', 'joinRoom', args); },
      leaveRoom() { return pauseAndPerform('room', 'leaveRoom'); },
      rotateInvite() { return perform('rotateInvite'); },
      requestFriend(input) { return perform('requestFriend', typeof input === 'string' ? { friendCode: input } : { ...input }); },
      respondFriend(friendshipId, accept) { return perform('respondFriend', typeof friendshipId === 'object' ? { ...friendshipId } : { friendshipId, accept: !!accept }); },
      removeFriend(friendshipId) { return perform('removeFriend', { friendshipId }); },
      exportData() {
        return { schema: 'yunjian-focus-online-record', version: 1, exportedAt: clock.wall(), accountKey,
          note: '云端静修记录副本，仅供回顾；不能导入或替代云端悟玉与衣装。', snapshot: clone(state),
          legacyLocal: legacyLocal ? clone(legacyLocal) : null };
      },
      exportLegacyData() { return legacyLocal ? clone(legacyLocal) : null; },
      importData() { return Promise.resolve({ ok: false, code: 'focus_online_import_disabled', message: '在线悟玉与衣装由云端保管，不能用本机存档覆盖。此前本机记录仍已保留。' }); },
      async destroy() {
        if (destroyed) return { ok: true };
        if (activeView) { activeView = false; void pauseNow('leave', 'close'); }
        stopTimer(); cancelBackground(); destroyed = true;
        for (const remove of removers) remove(); removers.length = 0; listeners.clear();
        // keepalive 请求已发出，不阻塞退出或等待失联的服务器。
        return { ok: true };
      }
    };
    return api;
  }
  global.SpiritFocusOnline = Object.freeze({ create, HEARTBEAT_MS, STALE_MS });
})(typeof globalThis !== 'undefined' ? globalThis : window);
