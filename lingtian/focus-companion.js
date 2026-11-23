/* 云间灵田 · 静修陪修（2026-11-24）
 * 用户：“静修的每个房间，如果只有一个人的话，随机设置一个假人陪你一起静修，点开始静修后，这个假人还是一样陪你直到静修结束。
 *       如果房间里面有2个或以上的真人，这个假人就自动消失。”随后又说：“不要显示陪修的字样”——画面上不写“陪修”，和同修一样显示道号。
 * 做法：只在这台设备的画面上多坐一位同修（下面叫“陪修”，只是代码里的叫法）：
 *  · 雅室里的真人只有你一个时出现：随机一位化身、道号和立愿，坐在你旁边的空席上（旁边没有空席就随便一处）；
 *  · 你开始静修，陪修也跟着起一段，总比你多剩一点时间，所以一直陪到你这一段结束；你小憩，陪修也小憩；
 *    你还没开始、或这一段已经结束时，陪修照自己的节奏学（学完显示“已完成”一分钟、小憩五分钟、再起一段）；
 *  · 雅室里来了第二位真人，陪修马上不显示；又只剩你一人时，还是原来那一位（换了雅室才换人）；刷新页面也不换（本页 sessionStorage）；
 *  · 画面上的雅室人数（“2 / 8”）跟着算上陪修，和看到的人数一致；
 *  · 全在这台设备上算：不经过云端，别的同学看不到，不进修行录、静修在线和工作台统计，也不能结为道友（同修名单里没有这个按钮）。
 * 接法：focus-host.js 创建静修以前调用 install()，把在线静修引擎（SpiritFocusOnline.create）包一层，
 *   getSnapshot / subscribe 拿到的快照里补上陪修；静修界面、场景、同修名单、静修大屏读的都是这份快照，所以处处一致。
 */
(function (global) {
  'use strict';
  const PREFIX = 'companion:';
  const STORE = 'lingtian-focus-companion-v1';
  const MIN = 60000;
  const SEATS = 8;
  const NAMES = ['青竹', '松风', '听雨', '南枝', '远山', '清和', '寒砚', '墨池', '知秋', '疏影', '晚晴', '临溪', '拾光', '云起', '白露', '小满'];
  const GOALS = ['复习本周课堂笔记', '整理错题本', '读完一篇文献', '预习下一讲', '背二十个单词', '写完课程作业', '读懂一个概念',
    '做修炼场题目', '梳理一章知识点', '练一套习题', '读两节教材', '写读书笔记'];
  const LENGTHS = [25, 25, 40, 50];
  const between = (low, high) => low + Math.random() * (high - low);
  const pick = (list, avoid) => { const pool = list.filter(item => item !== avoid); const from = pool.length ? pool : list; return from[Math.floor(Math.random() * from.length)]; };
  const token = () => Math.random().toString(36).slice(2, 10);
  const isMate = person => !!person && String(person.id || '').startsWith(PREFIX);
  let mate = null;   // { room, id, name, avatarId, target, seatId, plan: { id, kind: focus|done|break, startAt, durationMs, focusMs?, follow } }

  function save() { try { global.sessionStorage.setItem(STORE, JSON.stringify(mate)); } catch (_) { /* 存不了就只在这一页记住 */ } }
  function restore(room) {
    try {
      const value = JSON.parse(global.sessionStorage.getItem(STORE) || 'null');
      if (value && value.room === room && isMate(value) && value.plan && Number.isFinite(value.plan.startAt) && Number.isFinite(value.plan.durationMs)) return value;
    } catch (_) { /* 读不出就重新请一位 */ }
    return null;
  }
  function newFocus(startAt) {
    mate.target = pick(GOALS, mate.target);
    return { id: 's-' + token(), kind: 'focus', startAt, durationMs: pick(LENGTHS) * MIN, follow: '' };
  }
  function invite(room, self, now) {
    const characters = ((global.FocusCharacters && global.FocusCharacters.CHARACTERS) || []).map(c => c && c.id).filter(Boolean);
    mate = { room, id: PREFIX + token(), name: pick(NAMES), avatarId: characters.length ? pick(characters, self.avatarId) : '', target: '', seatId: null, plan: null };
    mate.plan = newFocus(now - between(3, 12) * MIN);   // 你进来的时候，陪修已经学了几分钟
    return mate;
  }
  // 照自己的节奏往下走；返回这一步有没有换段（换了要存）
  function ownPace(now) {
    let changed = false;
    if (mate.plan.follow) {
      // 刚陪你学完（或你结束、暂停很久后结束了这一段）：从刚才画面上显示的进度接着走，不跳过“已完成”和小憩
      const plan = mate.plan;
      if (Number.isFinite(plan.shownMs) && Number.isFinite(plan.shownAt)) plan.startAt = plan.shownAt - plan.shownMs;
      plan.follow = ''; delete plan.shownMs; delete plan.shownAt;
      changed = true;
    }
    for (let step = 0; step < 24; step++) {
      const plan = mate.plan, end = plan.startAt + plan.durationMs;
      if (now < end) return changed;
      changed = true;
      if (plan.kind === 'focus') mate.plan = { id: plan.id, kind: 'done', startAt: end, durationMs: MIN, focusMs: plan.durationMs, follow: '' };
      else if (plan.kind === 'done') mate.plan = { id: 'b-' + token(), kind: 'break', startAt: end, durationMs: 5 * MIN, follow: '' };
      else mate.plan = newFocus(end);
    }
    mate.plan = newFocus(now - between(2, 10) * MIN);   // 离开太久（设备睡着了）：从新的一段接着学
    return true;
  }
  function ownView(now) {
    const changed = ownPace(now), plan = mate.plan;
    if (plan.kind === 'done') return { changed, view: { status: 'completed', kind: 'focus', sessionId: plan.id, elapsedMs: plan.focusMs, durationMs: plan.focusMs } };
    if (plan.kind === 'break') return { changed, view: { status: 'rest', kind: 'break', sessionId: plan.id, elapsedMs: Math.max(0, now - plan.startAt), durationMs: plan.durationMs } };
    return { changed, view: { status: 'focus', kind: 'focus', sessionId: plan.id, elapsedMs: Math.max(0, now - plan.startAt), durationMs: plan.durationMs } };
  }
  // 你这一段在计时（或暂停）：陪修陪着你。你一开始它也起一段（比你早一会儿坐下、总长多一两分钟）；你小憩它也小憩
  function accompany(active, now) {
    const total = Math.max(1, Number(active.minutes) || 25) * MIN;
    const done = Math.min(total, Math.max(0, Number(active.elapsedMs) || 0));
    const key = String(active.id || '');
    let plan = mate.plan, changed = false;
    if (plan.follow !== key) {
      changed = true;
      if (active.kind === 'break') plan = { id: 'b-' + token(), kind: 'break', startAt: now - done - between(5, 20) * 1000, durationMs: total + between(30, 90) * 1000, follow: key };
      else {
        const lead = between(5, 45) * 1000;
        plan = { id: 's-' + token(), kind: 'focus', startAt: now - done - lead, durationMs: total + lead + between(60, 150) * 1000, follow: key };
        mate.target = pick(GOALS, mate.target);
      }
      mate.plan = plan;
    }
    // 总比你多剩 20 秒以上：你暂停时它多学一会儿就停在那里等你；你这一段结束以前，它不会先学完、也不会离开
    const elapsed = Math.max(0, Math.min(now - plan.startAt, plan.durationMs - (total - done) - 20000));
    plan.shownMs = elapsed; plan.shownAt = now;   // 你这一段结束以后，陪修从这里接着走（见 ownPace）
    return { changed, view: plan.kind === 'break'
      ? { status: 'rest', kind: 'break', sessionId: plan.id, elapsedMs: elapsed, durationMs: plan.durationMs }
      : { status: 'focus', kind: 'focus', sessionId: plan.id, elapsedMs: elapsed, durationMs: plan.durationMs } };
  }
  function seatFor(taken, mine) {
    if (Number.isInteger(mate.seatId) && mate.seatId >= 0 && mate.seatId < SEATS && !taken.has(mate.seatId)) return mate.seatId;
    const free = [];
    for (let i = 0; i < SEATS; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) return null;
    const near = Number.isInteger(mine) ? free.filter(i => Math.abs(i - mine) === 1) : [];
    const pool = near.length ? near : free;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  // 快照里补上陪修：只在“在线、在雅室里、真人只有自己”时
  function decorate(snapshot) {
    try {
      if (!snapshot || !snapshot.online || !snapshot.room || !Array.isArray(snapshot.participants) || snapshot.authRequired || snapshot.accountChanged) return snapshot;
      const real = snapshot.participants.filter(person => person && !isMate(person));
      const self = real.find(person => person.isSelf || (snapshot.participantId && person.id === snapshot.participantId));
      if (real.length !== 1 || !self) return snapshot;   // 两位以上真人（或自己还不在雅室名单里）：陪修不显示
      const room = String(snapshot.room.id || '');
      if (!room) return snapshot;
      const now = Date.now();
      let changed = false;
      if (!mate || mate.room !== room) { mate = restore(room) || invite(room, self, now); changed = true; }
      const seat = seatFor(new Set(real.map(person => person.seatId).filter(Number.isInteger)), self.seatId);
      if (seat === null) return snapshot;
      if (seat !== mate.seatId) { mate.seatId = seat; changed = true; }
      const active = snapshot.active;
      const following = active && (active.status === 'running' || active.status === 'paused') && (active.kind === 'focus' || active.kind === 'break');
      const timing = following ? accompany(active, now) : ownView(now);
      if (changed || timing.changed) save();
      const view = Object.assign({ id: mate.id, seatId: mate.seatId, nickname: mate.name, avatarId: mate.avatarId || null, target: mate.target,
        equipped: {}, isFriend: false, isSelf: false, companion: true, pauseReason: '', timerStale: false }, timing.view);
      // 雅室人数跟着加上陪修（自己这台设备上看到几个人就写几人；雅室列表里同一间也一样）
      const plusOne = room => Object.assign({}, room, { onlineCount: Math.min(SEATS, Math.max(1, Number(room.onlineCount) || 1) + 1) });
      const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms.map(item => (item && String(item.id) === room ? plusOne(item) : item)) : snapshot.rooms;
      return Object.assign({}, snapshot, { participants: snapshot.participants.concat(view), room: plusOne(snapshot.room), rooms, companionId: mate.id });
    } catch (_) {
      return snapshot;   // 陪修出了问题也不影响静修本身
    }
  }
  function wrap(engine) {
    if (!engine || typeof engine.getSnapshot !== 'function' || typeof engine.subscribe !== 'function') return engine;
    const getSnapshot = () => decorate(engine.getSnapshot());
    const subscribe = listener => engine.subscribe(snapshot => listener(decorate(snapshot)));
    const requestFriend = input => (input && typeof input === 'object' && String(input.participantId || '').startsWith(PREFIX)
      ? Promise.resolve({ ok: false, code: 'focus_companion', message: '对方暂时不能结为道友。' })
      : engine.requestFriend(input));
    return new Proxy(engine, {
      get(target, key) {
        if (key === 'getSnapshot') return getSnapshot;
        if (key === 'subscribe') return subscribe;
        if (key === 'requestFriend') return requestFriend;
        return target[key];
      },
    });
  }
  // 静修模块加载以后、创建以前调用：以后创建的在线静修都带陪修（离线练习版没有雅室，不加）
  function install() {
    const online = global.SpiritFocusOnline;
    if (!online || typeof online.create !== 'function') return false;
    if (online.withCompanion) return true;
    const create = online.create;
    global.SpiritFocusOnline = Object.freeze(Object.assign({}, online, { withCompanion: true, create: options => wrap(create(options)) }));
    return true;
  }
  global.LingtianFocusCompanion = Object.freeze({ install, decorate, wrap, isMate, PREFIX });
})(typeof window === 'undefined' ? globalThis : window);
