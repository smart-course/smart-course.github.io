/* 静修纯规则：有效时间、番茄轮次、悟玉与衣装。此文件不启动计时器。 */
(function (global) {
  'use strict';
  const C = global.SpiritFocusCatalog;
  const VERSION = 1, MINUTE = 60000, DAY = 86400000, HISTORY_LIMIT = 1200, DAY_LIMIT = 3660, CHECK_IN_MS = 25 * MINUTE;
  const viewCache = new WeakMap(), progressCache = new WeakMap();
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function normalizeIdentity(value) {
    if (global.SpiritPlayerIdentity) return global.SpiritPlayerIdentity.normalize(value);
    if (value !== undefined) fail('identity_unavailable', '头像资料尚未加载，原静修记录已保留。');
    return undefined;
  }
  function setIdentity(state, value, now) {
    const next = normalizeIdentity(value);
    if (JSON.stringify(state.identity) === JSON.stringify(next)) return { ok: true, changed: false, identity: next };
    state.identity = next; touch(state, now); return { ok: true, changed: true, identity: next };
  }
  function validProfile(value) { return typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\u0000-\u001f]/.test(value); }
  function day(at) { return new Date(at + 8 * 3600000).toISOString().slice(0, 10); }
  function validDay(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key) || Number(key.slice(0, 4)) < 1970) return false;
    const at = Date.parse(key + 'T00:00:00.000Z');
    return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === key;
  }
  function previousDay(key) { return new Date(Date.parse(key + 'T00:00:00.000Z') - DAY).toISOString().slice(0, 10); }
  function qualified(state, key) { return (state.days[key]?.focusMs || 0) >= CHECK_IN_MS; }
  function currentStreak(state, today) {
    let key = qualified(state, today) ? today : previousDay(today), count = 0;
    while (qualified(state, key)) { count++; key = previousDay(key); }
    return count;
  }
  function validProgressMeta(meta, state, today) {
    return record(meta) && meta.version === 1 && meta.day === today && meta.totalFocusMs === state.totalFocusMs && meta.todayQualified === qualified(state, today)
      && integer(meta.dayCount, 0, DAY_LIMIT) && integer(meta.qualifiedDays, 0, meta.dayCount) && integer(meta.currentStreak, 0, meta.qualifiedDays) && integer(meta.observedBestStreak, meta.currentStreak, meta.qualifiedDays);
  }
  // 已规范化的云端账本携带轻量摘要；每个心跳无需重新扫描十年日历。
  function progressMeta(state, now) {
    const today = day(now), saved = state.progressMeta;
    if (validProgressMeta(saved, state, today)) return saved;
    const cached = progressCache.get(state);
    if (cached && cached.days === state.days && validProgressMeta(cached.meta, state, today)) return cached.meta;
    const keys = Object.keys(state.days), checked = keys.filter(key => key <= today && validDay(key) && qualified(state, key)).sort();
    let best = 0, run = 0, previous = '';
    for (const key of checked) { run = previous === previousDay(key) ? run + 1 : 1; best = Math.max(best, run); previous = key; }
    const meta = { version: 1, day: today, totalFocusMs: state.totalFocusMs, dayCount: keys.length, qualifiedDays: checked.length, currentStreak: currentStreak(state, today), observedBestStreak: best, todayQualified: qualified(state, today) };
    progressCache.set(state, { days: state.days, meta }); return meta;
  }
  function progressSummary(state, now) {
    const meta = progressMeta(state, now), todayFocusMs = state.days[meta.day]?.focusMs || 0;
    return { totalFocusMs: state.totalFocusMs, completedCount: state.completedCount, todayFocusMs, todayQualified: todayFocusMs >= CHECK_IN_MS,
      currentStreak: meta.currentStreak, bestStreak: provenBestStreak(state, meta), qualifiedDays: meta.qualifiedDays,
      unlockedCount: C.ACHIEVEMENTS.reduce((n, entry) => n + (own(state.achievements || {}, entry.id) ? 1 : 0), 0) };
  }
  function provenBestStreak(state, meta) {
    return C.ACHIEVEMENTS.reduce((best, entry) => entry.kind === 'streak' && own(state.achievements || {}, entry.id) ? Math.max(best, entry.threshold) : best,
      Math.max(integer(state.bestStreak) ? state.bestStreak : 0, meta.observedBestStreak));
  }
  function ensureProgress(state, now = Date.now()) {
    let changed = false; const newUnlocks = [], meta = progressMeta(state, now);
    if (state.progressMeta !== meta) { state.progressMeta = { ...meta }; changed = true; }
    if (!record(state.achievements)) { state.achievements = {}; changed = true; }
    const best = provenBestStreak(state, meta);
    if (state.bestStreak !== best) { state.bestStreak = best; changed = true; }
    for (const achievement of C.ACHIEVEMENTS) {
      const amount = achievement.kind === 'hours' ? state.totalFocusMs / (60 * MINUTE) : best;
      if (!own(state.achievements, achievement.id) && amount >= achievement.threshold) {
        state.achievements[achievement.id] = { unlockedAt: Math.floor(now) }; newUnlocks.push(achievement.id); changed = true;
      }
      if (own(state.achievements, achievement.id) && !state.owned.includes(achievement.rewardItemId)) { state.owned.push(achievement.rewardItemId); changed = true; }
    }
    if (changed) touch(state, now);
    return { changed, newUnlocks };
  }
  function checkFocusByDay(row) {
    if (row.focusByDay === undefined) return true;
    if (!record(row.focusByDay) || Object.keys(row.focusByDay).length > DAY_LIMIT) return false;
    if (!Number.isFinite(new Date(row.startedAt).getTime()) || !Number.isFinite(new Date(row.finishedAt).getTime())) return false;
    let sum = 0;
    for (const [key, amount] of Object.entries(row.focusByDay)) {
      if (!validDay(key) || !integer(amount, 1, Math.min(DAY, row.elapsedMs)) || key < day(row.startedAt) || (row.finishedAt > 0 && key > day(row.finishedAt))) return false;
      sum += amount;
    }
    return sum <= row.elapsedMs;
  }
  const reviewTimestamp = value => integer(value) && Number.isFinite(new Date(value).getTime());
  // 复盘只读取已有账本和真实起止时间；差额包含暂停、离页及未确认时间，不能还原次数或注意力。
  function sessionReview(value, now = Date.now()) {
    const row = record(value) ? value : {}, focusMs = integer(row.elapsedMs) ? row.elapsedMs : null;
    const hasFinish = reviewTimestamp(row.finishedAt) && row.finishedAt > 0;
    const unfinished = row.finishedAt === undefined || row.finishedAt === null || row.finishedAt === 0;
    const ongoing = ['running', 'paused'].includes(row.status) && row.completed !== true && unfinished;
    const asOfAt = hasFinish ? row.finishedAt : ongoing && reviewTimestamp(now) ? now : null;
    const result = { scope: 'session', availability: 'available', focusMs, totalMs: null, interruptionMs: null, focusPercent: null, ongoing, asOfAt };
    if (focusMs === null) return { ...result, availability: 'invalid-focus' };
    if (!reviewTimestamp(row.startedAt) || asOfAt === null) return { ...result, availability: 'missing-time' };
    const totalMs = asOfAt - row.startedAt;
    if (totalMs < 0 || focusMs > totalMs) return { ...result, availability: 'clock-inconsistent' };
    return { ...result, totalMs, interruptionMs: totalMs - focusMs, focusPercent: totalMs > 0 ? focusMs / totalMs * 100 : null };
  }
  function progressQuery(now, input = {}) {
    const bad = () => fail('invalid_progress_query', '请选择有效的月份与日期，日期须属于当前查看月份。');
    if (!record(input) || Object.keys(input).some(key => !['month', 'day'].includes(key))) return bad();
    const today = day(now);
    if (input.month !== undefined && (typeof input.month !== 'string' || !/^\d{4}-\d{2}$/.test(input.month) || !validDay(input.month + '-01'))) return bad();
    if (input.day !== undefined && !validDay(input.day)) return bad();
    const month = input.month || input.day?.slice(0, 7) || today.slice(0, 7);
    const selectedDay = input.day || (month === today.slice(0, 7) ? today : month + '-01');
    if (selectedDay.slice(0, 7) !== month) return bad();
    return { today, month, day: selectedDay };
  }
  function progressRecords(state, selectedDay, now) {
    const entries = [...state.history], ids = new Set(entries.map(row => row.id)), active = state.active;
    if (active?.kind === 'focus' && !ids.has(active.id)) entries.unshift({ ...active, completed: active.status === 'completed', reward: active.status === 'completed' ? active.earnedReward : 0 });
    const records = [];
    for (const row of entries) {
      let dayFocusMs = 0, dayFocusKnown = row.elapsedMs === 0;
      const status = row.status || (row.completed ? 'completed' : 'cancelled'), review = sessionReview({ ...row, status }, now);
      const startedDay = reviewTimestamp(row.startedAt) ? day(row.startedAt) : null;
      const finishedDay = reviewTimestamp(row.finishedAt) && row.finishedAt > 0 ? day(row.finishedAt) : null;
      if (record(row.focusByDay)) {
        dayFocusMs = row.focusByDay[selectedDay] || 0;
        dayFocusKnown ||= dayFocusMs > 0 || Object.values(row.focusByDay).reduce((sum, amount) => sum + amount, 0) === row.elapsedMs;
      }
      else {
        // 旧档只在起止确实同日时归属；跨日暂停的空白不能按平均时间补造。
        const end = review.asOfAt;
        if (reviewTimestamp(end) && row.startedAt <= end && startedDay === selectedDay && day(end) === selectedDay) { dayFocusMs = row.elapsedMs; dayFocusKnown = true; }
      }
      const boundaryDay = selectedDay === startedDay || selectedDay === finishedDay;
      const activeToday = review.ongoing && reviewTimestamp(now) && selectedDay === day(now);
      // 起止日与当前会话今天都能复盘；未知日归属仍为零，不冲减未归属总量。
      if (dayFocusMs <= 0 && !boundaryDay && !activeToday) continue;
      records.push({ id: row.id, target: row.target, mode: row.mode, minutes: row.minutes, elapsedMs: row.elapsedMs, dayFocusMs, completed: row.completed,
        reward: row.reward, startedAt: row.startedAt, finishedAt: row.finishedAt, status, dayFocusKnown, review });
    }
    records.sort((a, b) => (b.finishedAt || now) - (a.finishedAt || now) || b.startedAt - a.startedAt);
    const covered = records.reduce((sum, row) => sum + row.dayFocusMs, 0), unattributedFocusMs = Math.max(0, (state.days[selectedDay]?.focusMs || 0) - covered);
    return { records, unattributedFocusMs, recordsComplete: unattributedFocusMs === 0 };
  }
  function progress(state, now = Date.now(), input = {}) {
    const query = progressQuery(now, input), count = new Date(Date.UTC(Number(query.month.slice(0, 4)), Number(query.month.slice(5, 7)), 0)).getUTCDate();
    const days = Array.from({ length: count }, (_, index) => {
      const key = query.month + '-' + String(index + 1).padStart(2, '0'), row = state.days[key];
      return { day: key, focusMs: row?.focusMs || 0, completed: row?.completed || 0, qualified: (row?.focusMs || 0) >= CHECK_IN_MS, isToday: key === query.today, inFuture: key > query.today };
    });
    const summary = progressSummary(state, now);
    const achievements = C.ACHIEVEMENTS.map(entry => ({ ...entry,
      progress: Math.min(entry.threshold, entry.kind === 'hours' ? state.totalFocusMs / (60 * MINUTE) : summary.bestStreak),
      unlocked: own(state.achievements || {}, entry.id), unlockedAt: state.achievements?.[entry.id]?.unlockedAt ?? null }));
    return { timezone: 'Asia/Shanghai', ...query, checkInMs: CHECK_IN_MS, days,
      monthFocusMs: days.reduce((sum, row) => sum + row.focusMs, 0), monthQualifiedDays: days.filter(row => row.qualified && !row.inFuture).length,
      summary, achievements, ...progressRecords(state, query.day, now) };
  }
  function reward(minutes) { return Math.floor(minutes * 10 / 25); }
  function touch(state, now) { state.updatedAt = Math.max(state.updatedAt, Math.floor(now)); state.revision++; }
  function normalizeSettings(input) {
    if (!record(input)) fail('invalid_settings', '静修设置格式无效。');
    const settings = { ...C.DEFAULT_SETTINGS, ...input };
    if (typeof settings.soundscape !== 'string' || !C.SOUNDS.some(sound => sound.id === settings.soundscape)) fail('invalid_settings', '请选择列表中的环境声。');
    if (typeof settings.muted !== 'boolean' || typeof settings.keepAwake !== 'boolean' || typeof settings.volume !== 'number' || !Number.isFinite(settings.volume) || settings.volume < 0 || settings.volume > 1 || !integer(settings.pomodoroFocusMinutes, 5, 120) || !integer(settings.shortBreakMinutes, 1, 30) || !integer(settings.longBreakMinutes, 5, 60) || !integer(settings.roundsPerCycle, 2, 8) || settings.longBreakMinutes < settings.shortBreakMinutes) fail('invalid_settings', '请检查专注时长、休息时长与番茄轮数。');
    return Object.fromEntries(Object.keys(C.DEFAULT_SETTINGS).map(key => [key, settings[key]]));
  }
  function empty(profileId, nickname, now = Date.now()) {
    if (!validProfile(profileId)) fail('invalid_profile', '静修账户标识无效。');
    return {
      schema: 'yunjian-focus-state', version: VERSION, profileId, identity: normalizeIdentity(undefined),
      nickname: String(nickname || '修习者').trim().slice(0, 40) || '修习者',
      createdAt: Math.floor(now), updatedAt: Math.floor(now), revision: 0,
      sceneId: 'library', seatId: null, jade: 0,
      owned: Object.values(C.DEFAULT_EQUIPPED), equipped: { ...C.DEFAULT_EQUIPPED },
      settings: { ...C.DEFAULT_SETTINGS }, active: null,
      pomodoroCompleted: 0, pomodoroLastTarget: '', history: [],
      totalFocusMs: 0, completedCount: 0, days: {}, receipts: {}, purchases: {}, achievements: {}, bestStreak: 0,
      progressMeta: { version: 1, day: day(now), totalFocusMs: 0, dayCount: 0, qualifiedDays: 0, currentStreak: 0, observedBestStreak: 0, todayQualified: false }
    };
  }
  function checkActivity(a) {
    if (!record(a) || typeof a.id !== 'string' || a.id.length < 1 || a.id.length > 180 || !['focus', 'break'].includes(a.kind) || !['single', 'pomodoro'].includes(a.mode) || !['running', 'paused', 'completed', 'cancelled'].includes(a.status) || typeof a.target !== 'string' || a.target.length > 60 || !integer(a.minutes, a.kind === 'focus' ? 5 : 1, 120) || !integer(a.elapsedMs, 0, a.minutes * MINUTE) || !integer(a.reward, 0, 48) || !integer(a.earnedReward, 0, 48) || !integer(a.round, 1, 8) || !integer(a.cycle, 1) || !integer(a.startedAt) || !integer(a.finishedAt) || typeof a.pauseReason !== 'string' || a.pauseReason.length > 80 || ![null, 'short', 'long'].includes(a.breakKind) || !integer(a.roundsPerCycle, 2, 8) || !integer(a.shortBreakMinutes, 1, 30) || !integer(a.longBreakMinutes, 5, 60) || a.longBreakMinutes < a.shortBreakMinutes) return false;
    if (a.kind === 'focus' && (a.target.trim().length < 1 || a.reward !== reward(a.minutes) || a.breakKind !== null)) return false;
    if (a.kind === 'break' && (a.reward !== 0 || a.earnedReward !== 0 || a.breakKind === null)) return false;
    if (a.status === 'completed' && a.elapsedMs !== a.minutes * MINUTE) return false;
    if (a.status !== 'completed' && a.earnedReward !== 0) return false;
    if (a.kind === 'focus' && a.status === 'completed' && a.earnedReward !== a.reward) return false;
    return checkFocusByDay(a) && (a.kind === 'focus' || !a.focusByDay || Object.keys(a.focusByDay).length === 0);
  }
  function validate(value, profileId) {
    const bad = () => fail('focus_save_invalid', '静修存档无法读取，原记录已保留。请导入完整备份后继续。');
    if (!record(value) || value.schema !== 'yunjian-focus-state' || value.version !== VERSION || !validProfile(value.profileId) || (profileId && value.profileId !== profileId) || typeof value.nickname !== 'string' || value.nickname.length > 40 || !integer(value.createdAt) || !integer(value.updatedAt) || !integer(value.revision) || !C.SCENES.some(s => s.id === value.sceneId) || !(value.seatId === null || integer(value.seatId, 0, 7)) || !integer(value.jade) || !Array.isArray(value.owned) || value.owned.length > C.ITEMS.length || value.owned.some(id => !C.ITEM_MAP[id]) || new Set(value.owned).size !== value.owned.length || !record(value.equipped) || !integer(value.pomodoroCompleted) || typeof value.pomodoroLastTarget !== 'string' || value.pomodoroLastTarget.length > 60 || !Array.isArray(value.history) || value.history.length > HISTORY_LIMIT || !integer(value.totalFocusMs) || !integer(value.completedCount) || !record(value.days) || Object.keys(value.days).length > DAY_LIMIT || !record(value.receipts) || Object.keys(value.receipts).length > 20000 || !record(value.purchases) || Object.keys(value.purchases).length > C.ITEMS.length) return bad();
    if ((value.bestStreak !== undefined && !integer(value.bestStreak)) || (value.achievements !== undefined && !record(value.achievements))) return bad();
    const achievements = value.achievements || {};
    for (const [id, earned] of Object.entries(achievements)) if (!C.ACHIEVEMENTS.some(entry => entry.id === id) || !record(earned) || !integer(earned.unlockedAt)) return bad();
    if (value.owned.some(id => C.ITEM_MAP[id].achievementId && !own(achievements, C.ITEM_MAP[id].achievementId))) return bad();
    for (const slot of C.SLOTS) if (!value.owned.includes(value.equipped[slot.id]) || C.ITEM_MAP[value.equipped[slot.id]]?.slot !== slot.id || !value.owned.includes(C.DEFAULT_EQUIPPED[slot.id])) return bad();
    let totalDays = 0, totalCompletions = 0;
    for (const [key, row] of Object.entries(value.days)) {
      if (!validDay(key) || !record(row) || !integer(row.focusMs, 0, DAY) || !integer(row.completed, 0, 500)) return bad();
      totalDays += row.focusMs; totalCompletions += row.completed;
    }
    if (totalDays > value.totalFocusMs || totalCompletions > value.completedCount || value.pomodoroCompleted > value.completedCount) return bad();
    for (const [id, receipt] of Object.entries(value.receipts)) if (id.length > 180 || !record(receipt) || !integer(receipt.reward, 0, 48) || !integer(receipt.at)) return bad();
    for (const [id, purchase] of Object.entries(value.purchases)) if (!C.ITEM_MAP[id] || C.ITEM_MAP[id].achievementId || !value.owned.includes(id) || !record(purchase) || purchase.price !== C.ITEM_MAP[id].price || !integer(purchase.at)) return bad();
    const ids = new Set();
    for (const h of value.history) {
      if (!record(h) || typeof h.id !== 'string' || h.id.length > 180 || ids.has(h.id) || typeof h.target !== 'string' || h.target.length > 60 || !['single', 'pomodoro'].includes(h.mode) || !integer(h.minutes, 5, 120) || !integer(h.elapsedMs, 0, h.minutes * MINUTE) || typeof h.completed !== 'boolean' || !integer(h.reward, 0, 48) || !integer(h.round, 1, 8) || !integer(h.cycle, 1) || !integer(h.startedAt) || !integer(h.finishedAt)) return bad();
      if (h.completed && (h.elapsedMs !== h.minutes * MINUTE || h.reward !== reward(h.minutes) || !own(value.receipts, h.id) || value.receipts[h.id].reward !== h.reward)) return bad();
      if ((!h.completed && h.reward !== 0) || !checkFocusByDay(h)) return bad();
      ids.add(h.id);
    }
    if (value.active !== null) {
      if (!checkActivity(value.active)) return bad();
      const a = value.active;
      if (a.kind === 'focus' && a.status === 'completed' && (!own(value.receipts, a.id) || value.receipts[a.id].reward !== a.reward)) return bad();
      if (a.kind === 'focus' && ['running', 'paused'].includes(a.status) && own(value.receipts, a.id)) return bad();
    }
    let settings;
    try { settings = normalizeSettings(value.settings); } catch (_) { return bad(); }
    let identity; try { identity = normalizeIdentity(value.identity); } catch (_) { return bad(); }
    const next = clone(value); next.identity = identity; next.settings = settings; next.achievements = clone(achievements); next.bestStreak = value.bestStreak || 0;
    // 本机导入只相信原始日账，不沿用来源不明的派生缓存；首次打开时再持久化回补。
    delete next.progressMeta;
    return next;
  }
  function requireSeat(state) { if (!integer(state.seatId, 0, 7)) fail('seat_required', '请先选择一处座位。'); }
  function isLive(state) { return !!state.active && ['running', 'paused'].includes(state.active.status); }
  function pause(state, reason, now) {
    if (state.active?.status === 'running') { state.active.status = 'paused'; state.active.pauseReason = String(reason || 'manual').slice(0, 80); touch(state, now); }
    return { ok: true };
  }
  function resume(state, now) {
    requireSeat(state);
    if (state.active?.status !== 'paused') fail('nothing_to_resume', '当前没有需要继续的计时。');
    state.active.status = 'running'; state.active.pauseReason = ''; touch(state, now);
    return { ok: true };
  }
  function start(state, input, now, id) {
    requireSeat(state);
    if (isLive(state)) fail('unfinished_session', '请先继续或结束当前这一段。');
    const mode = input?.mode || 'pomodoro', minutes = input?.minutes ?? (mode === 'pomodoro' ? state.settings.pomodoroFocusMinutes : 25);
    const target = String(input?.target || '').trim();
    if (!['single', 'pomodoro'].includes(mode) || !integer(minutes, 5, 120) || target.length < 1 || target.length > 60) fail('invalid_focus_plan', '请填写 1—60 字学习目标，并选择 5—120 分钟的整数时长。');
    if (typeof id !== 'string' || own(state.receipts, id)) fail('invalid_session_id', '本次静修编号无效，请重新开始。');
    const n = state.settings.roundsPerCycle;
    state.active = {
      id, kind: 'focus', mode, status: 'running', target, minutes, elapsedMs: 0,
      reward: reward(minutes), earnedReward: 0, round: mode === 'pomodoro' ? state.pomodoroCompleted % n + 1 : 1,
      cycle: mode === 'pomodoro' ? Math.floor(state.pomodoroCompleted / n) + 1 : 1,
      breakKind: null, pauseReason: '', startedAt: Math.floor(now), finishedAt: 0, focusByDay: {},
      roundsPerCycle: n, shortBreakMinutes: state.settings.shortBreakMinutes, longBreakMinutes: state.settings.longBreakMinutes
    };
    if (mode === 'pomodoro') state.pomodoroLastTarget = target;
    touch(state, now); return { ok: true, sessionId: id };
  }
  function trimDays(state) {
    const meta = state.progressMeta;
    if (meta.dayCount <= DAY_LIMIT) return false;
    const keys = Object.keys(state.days).sort();
    while (keys.length > DAY_LIMIT) { const key = keys.shift(); if (qualified(state, key) && key <= meta.day) meta.qualifiedDays--; delete state.days[key]; }
    meta.dayCount = keys.length; return true;
  }
  function creditDays(state, amount, wallEnd) {
    let remaining = amount, cursor = Math.floor(wallEnd) - amount;
    const a = state.active, meta = state.progressMeta; let checkStreak = false;
    if (!record(a.focusByDay)) {
      a.focusByDay = {};
      const previousMs = a.elapsedMs - amount;
      if (previousMs > 0 && a.startedAt <= cursor && day(a.startedAt) === day(cursor)) a.focusByDay[day(cursor)] = previousMs;
    }
    while (remaining > 0) {
      const key = day(cursor), boundary = Math.floor((cursor + 8 * 3600000) / DAY + 1) * DAY - 8 * 3600000;
      const part = Math.min(remaining, Math.max(1, boundary - cursor));
      let row = state.days[key];
      if (!row) { row = state.days[key] = { focusMs: 0, completed: 0 }; meta.dayCount++; }
      const wasQualified = row.focusMs >= CHECK_IN_MS;
      row.focusMs = Math.min(DAY, row.focusMs + part); a.focusByDay[key] = (a.focusByDay[key] || 0) + part;
      if (!wasQualified && row.focusMs >= CHECK_IN_MS && key <= meta.day) { meta.qualifiedDays++; checkStreak = true; }
      cursor += part; remaining -= part;
    }
    // 只在新增日期触及上限时整理历史，秒表更新不再反复排序全部日期。
    if (trimDays(state)) checkStreak = true;
    if (checkStreak) {
      meta.currentStreak = currentStreak(state, meta.day);
      meta.observedBestStreak = Math.max(meta.observedBestStreak, meta.currentStreak);
    }
    meta.totalFocusMs = state.totalFocusMs; meta.todayQualified = qualified(state, meta.day);
  }
  function history(state, a, completed, now) {
    if (state.history.some(h => h.id === a.id)) return;
    state.history.unshift({ id: a.id, target: a.target, mode: a.mode, minutes: a.minutes, elapsedMs: a.elapsedMs, completed, reward: completed ? a.reward : 0, round: a.round, cycle: a.cycle, startedAt: a.startedAt, finishedAt: Math.floor(now), ...(a.focusByDay ? { focusByDay: { ...a.focusByDay } } : {}) });
    if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
  }
  function complete(state, now) {
    const a = state.active;
    if (!a || a.status !== 'running' || a.elapsedMs < a.minutes * MINUTE) return false;
    a.status = 'completed'; a.finishedAt = Math.floor(now); a.pauseReason = '';
    if (a.kind === 'focus' && !own(state.receipts, a.id)) {
      state.receipts[a.id] = { reward: a.reward, at: Math.floor(now) };
      state.jade += a.reward; a.earnedReward = a.reward; state.completedCount++;
      const key = day(now); let row = state.days[key];
      if (!row) { row = state.days[key] = { focusMs: 0, completed: 0 }; state.progressMeta.dayCount++; trimDays(state); }
      row.completed++;
      if (a.mode === 'pomodoro') state.pomodoroCompleted++;
      history(state, a, true, now);
    }
    return true;
  }
  function advance(state, deltaMs, wallEnd) {
    const a = state.active;
    if (!a || a.status !== 'running' || !Number.isFinite(deltaMs) || deltaMs <= 0) return { ok: true, creditedMs: 0, completed: false };
    const initial = ensureProgress(state, wallEnd);
    const amount = Math.min(a.minutes * MINUTE - a.elapsedMs, Math.floor(deltaMs));
    const creditedEnd = Math.floor(wallEnd) - Math.floor(deltaMs) + amount;
    a.elapsedMs += amount;
    if (a.kind === 'focus' && amount > 0) { state.totalFocusMs += amount; creditDays(state, amount, creditedEnd); }
    const ended = complete(state, creditedEnd), updated = ensureProgress(state, wallEnd); touch(state, wallEnd);
    return { ok: true, creditedMs: a.kind === 'focus' ? amount : 0, completed: ended, newUnlocks: [...initial.newUnlocks, ...updated.newUnlocks] };
  }
  function cancel(state, now) {
    const a = state.active;
    if (!a || !isLive(state)) return { ok: true };
    a.status = 'cancelled'; a.finishedAt = Math.floor(now); a.pauseReason = '';
    if (a.kind === 'focus') history(state, a, false, now);
    touch(state, now); return { ok: true };
  }
  function breakPlan(a) {
    const long = a?.mode === 'pomodoro' && a.round === a.roundsPerCycle;
    return { minutes: long ? a.longBreakMinutes : a?.shortBreakMinutes || 5, kind: long ? 'long' : 'short' };
  }
  function startBreak(state, now, id) {
    const previous = state.active;
    if (previous?.kind !== 'focus' || previous.status !== 'completed') fail('break_unavailable', '完成一段静修后即可休息。');
    const plan = breakPlan(previous);
    state.active = { ...previous, id, kind: 'break', status: 'running', target: plan.kind === 'long' ? '长休息 · 舒展身心' : '小憩片刻', minutes: plan.minutes, elapsedMs: 0, reward: 0, earnedReward: 0, breakKind: plan.kind, pauseReason: '', startedAt: Math.floor(now), finishedAt: 0 };
    delete state.active.focusByDay;
    touch(state, now); return { ok: true };
  }
  function endBreak(state, now) {
    if (state.active?.kind !== 'break') fail('break_unavailable', '当前没有休息计时。');
    if (isLive(state)) { state.active.status = 'cancelled'; state.active.finishedAt = Math.floor(now); touch(state, now); }
    return { ok: true };
  }
  function setSettings(state, patch, now) { state.settings = normalizeSettings({ ...state.settings, ...patch }); touch(state, now); return { ok: true }; }
  function buy(state, id, now) {
    const item = C.ITEM_MAP[id]; if (!item) fail('item_unknown', '这件衣装暂不可用。');
    if (state.owned.includes(id)) return { ok: true, alreadyOwned: true, itemId: id };
    if (item.achievementId) fail('achievement_locked', '这件限定衣装需达成对应静修成就，解锁后会自动入藏。');
    if (state.jade < item.price) fail('jade_insufficient', '悟玉不足，还差 ' + (item.price - state.jade) + ' 悟玉。');
    state.jade -= item.price; state.owned.push(id); state.purchases[id] = { price: item.price, at: Math.floor(now) };
    touch(state, now); return { ok: true, itemId: id, price: item.price };
  }
  function equip(state, id, now) {
    const item = C.ITEM_MAP[id]; if (!item || !state.owned.includes(id)) fail('item_not_owned', '请先置办这件衣装。');
    state.equipped[item.slot] = id; touch(state, now); return { ok: true, itemId: id };
  }
  function snapshot(state, now = Date.now()) {
    const n = state.settings.roundsPerCycle, nextBreak = state.active?.kind === 'focus' && state.active.status === 'completed' ? breakPlan(state.active) : { minutes: state.settings.shortBreakMinutes, kind: 'short' };
    // 秒表刷新只复制小字段；历史仅在增删记录时生成只读快照，避免重扫完整账本。
    let cached = viewCache.get(state);
    if (!cached || cached.head !== state.history[0] || cached.length !== state.history.length) {
      cached = { head: state.history[0], length: state.history.length, history: Object.freeze(state.history.map(row => Object.freeze({ ...row, ...(row.focusByDay ? { focusByDay: Object.freeze({ ...row.focusByDay }) } : {}) }))) };
      viewCache.set(state, cached);
    }
    const result = {
      version: state.version, profileId: state.profileId, nickname: state.nickname,
      identity: normalizeIdentity(state.identity) || { gender: null, avatarId: null, profileChosen: false },
      createdAt: state.createdAt, updatedAt: state.updatedAt, revision: state.revision,
      sceneId: state.sceneId, seatId: state.seatId, jade: state.jade,
      owned: [...state.owned], equipped: { ...state.equipped }, settings: { ...state.settings },
      pomodoroCompleted: state.pomodoroCompleted, pomodoroLastTarget: state.pomodoroLastTarget,
      history: cached.history, totalFocusMs: state.totalFocusMs, completedCount: state.completedCount
    };
    const { focusByDay, ...activity } = state.active || {};
    result.active = state.active ? { ...clone(activity), remainingMs: Math.max(0, state.active.minutes * MINUTE - state.active.elapsedMs) } : null;
    result.pomodoro = { completedRounds: state.pomodoroCompleted, round: state.pomodoroCompleted % n + 1, cycle: Math.floor(state.pomodoroCompleted / n) + 1, nextBreakMinutes: nextBreak.minutes, nextBreakKind: nextBreak.kind, lastTarget: state.pomodoroLastTarget };
    result.todayFocusMs = state.days[day(now)]?.focusMs || 0; result.todayCompletedCount = state.days[day(now)]?.completed || 0;
    result.progressSummary = progressSummary(state, now);
    return result;
  }
  global.SpiritFocusCore = Object.freeze({ VERSION, MINUTE, DAY, HISTORY_LIMIT, CHECK_IN_MS, empty, validate, normalizeSettings, normalizeIdentity, setIdentity, day, reward, touch, isLive, start, pause, resume, advance, cancel, startBreak, endBreak, setSettings, buy, equip, snapshot, ensureProgress, progress, sessionReview, clone, fail, validProfile });
})(typeof globalThis !== 'undefined' ? globalThis : window);
