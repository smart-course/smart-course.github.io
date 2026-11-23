/* 云间灵田 · 静修陪修（2026-11-24）
 * 用户：“静修的每个房间，如果只有一个人的话，随机设置一个假人陪你一起静修，点开始静修后，这个假人还是一样陪你直到静修结束。”
 *       随后：“不要显示陪修的字样”；再后：“登录静修的雅室，如果里面一个人都没有的话，默认出现1个假人，如果真人数量大于等于3人，假人就自动消失”，
 *       “自己建的静修室不出现假人”。
 * 做法：画面上多坐一位同修（下面叫“陪修”，只是代码里的叫法，画面上只写道号）：
 *  · 只在两间公共雅室（藏经阁、听雨轩；后台编号 public-library、public-rain，王不凡测试用 preview-*）出现，同学自己建的雅室没有；
 *  · 雅室里的真人有 1—2 位时出现（你进来时没别人，它就在；又来一位同学它还在），真人到 3 位就不显示，少于 3 位又回来；
 *  · 雅室里两位同学都看得到它，所以它必须在每台设备上都一样：道号、化身、座位、立愿、在学还是在歇、还剩多久，
 *    都由“雅室编号＋北京日期”算出来（不用随机数），同一间雅室同一天谁打开都是同一位、坐同一个位子、计时一样；第二天换一位；
 *  · 它照自己的一天日程学：专注 25／40／50 分钟 → “已完成”1 分钟 → 小憩 5 分钟（每 4 段长歇 15 分钟）……一直在雅室里，
 *    你开始静修以后也一直陪着，直到你这一段结束（除非雅室里真人到了 3 位）；
 *  · 座位：按它自己的一个固定顺序挑第一个没有真人的位子（真人坐了它的位子，它就挪到下一个，各台设备挪得一样）；
 *  · 画面上的雅室人数（右上角“2 / 8”、雅室列表）跟着算上它：有 1—2 位真人的雅室都加 1，和进去看到的人数一致；
 *  · 不经过云端：不进修行录、静修在线和工作台统计，后台的雅室人数不变，也不能结为道友（同修名单里没有这个按钮）。
 * 接法：focus-host.js 创建静修以前调用 install()，把在线静修引擎（SpiritFocusOnline.create）包一层，
 *   getSnapshot / subscribe 拿到的快照里补上陪修；静修界面、场景、同修名单、静修大屏读的都是这份快照，所以处处一致。
 */
(function (global) {
  'use strict';
  const PREFIX = 'companion:';
  const MIN = 60000;
  const DAY = 86400000;
  const BEIJING = 8 * 3600000;
  const SEATS = 8;
  const MAX_REAL = 2;   // 真人 1—2 位时有陪修，3 位起不显示
  const BUILT_IN = /^(public|preview)-[a-z0-9]+$/;   // 公共雅室；同学自己建的雅室编号是随机的 UUID，不出现陪修
  const NAMES = ['青竹', '松风', '听雨', '南枝', '远山', '清和', '寒砚', '墨池', '知秋', '疏影', '晚晴', '临溪', '拾光', '云起', '白露', '小满'];
  const GOALS = ['复习本周课堂笔记', '整理错题本', '读完一篇文献', '预习下一讲', '背二十个单词', '写完课程作业', '读懂一个概念',
    '做修炼场题目', '梳理一章知识点', '练一套习题', '读两节教材', '写读书笔记'];
  const LENGTHS = [25, 25, 40, 50];
  const isMate = person => !!person && String(person.id || '').startsWith(PREFIX);

  // 固定的“随机”：同一个种子在每台设备上得到同一串数
  function hash(text) {
    let h = 2166136261 >>> 0;
    for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function sequence(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const choose = (next, list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];

  // 这一间雅室这一天的陪修：道号、化身、座位顺序、一天的日程
  const profiles = new Map();
  function profileOf(room, day) {
    const key = room + '|' + day;
    if (profiles.has(key)) return profiles.get(key);
    const next = sequence(hash(key));
    const characters = ((global.FocusCharacters && global.FocusCharacters.CHARACTERS) || []).map(c => c && c.id).filter(Boolean);
    const name = choose(next, NAMES);
    const avatarId = characters.length ? choose(next, characters) : null;
    const order = Array.from({ length: SEATS }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const dayStart = day * DAY - BEIJING;   // 北京时间 0 点
    const plan = [];
    let at = dayStart - Math.floor(next() * 40) * MIN;   // 前一天晚上就已经坐下了，0 点不会整齐换段
    for (let round = 1; at < dayStart + DAY + 3 * 60 * MIN && round < 200; round++) {
      const focus = choose(next, LENGTHS) * MIN, goal = choose(next, GOALS), rest = (round % 4 === 0 ? 15 : 5) * MIN;
      plan.push({ kind: 'focus', start: at, end: at + focus, goal, id: 's' + round, focusMs: focus });
      plan.push({ kind: 'done', start: at + focus, end: at + focus + MIN, goal, id: 's' + round, focusMs: focus });
      plan.push({ kind: 'break', start: at + focus + MIN, end: at + focus + MIN + rest, goal, id: 'b' + round });
      at += focus + MIN + rest;
    }
    const value = { id: PREFIX + hash(key).toString(36), name, avatarId, order, plan };
    profiles.set(key, value);
    if (profiles.size > 8) profiles.delete(profiles.keys().next().value);
    return value;
  }
  function phaseOf(profile, now) {
    const plan = profile.plan;
    let low = 0, high = plan.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (plan[mid].start <= now) low = mid; else high = mid - 1; }
    const p = plan[low];
    const sessionId = profile.id + ':' + p.id;
    if (p.kind === 'done') return { status: 'completed', kind: 'focus', elapsedMs: p.focusMs, durationMs: p.focusMs, target: p.goal, sessionId };
    const elapsedMs = Math.max(0, Math.min(p.end - p.start, now - p.start));
    if (p.kind === 'break') return { status: 'rest', kind: 'break', elapsedMs, durationMs: p.end - p.start, target: p.goal, sessionId };
    return { status: 'focus', kind: 'focus', elapsedMs, durationMs: p.end - p.start, target: p.goal, sessionId };
  }
  // 有 1—2 位真人的公共雅室，人数加上陪修（右上角和雅室列表一致）
  const withMate = room => {
    const count = Number(room && room.onlineCount) || 0;
    return room && BUILT_IN.test(String(room.id || '')) && count >= 1 && count <= MAX_REAL ? Object.assign({}, room, { onlineCount: count + 1 }) : room;
  };
  // 快照里补上陪修：只在“在线、在雅室里、真人 1—2 位（含自己）”时
  function decorate(snapshot) {
    try {
      if (!snapshot || !snapshot.online || !snapshot.room || !Array.isArray(snapshot.participants) || snapshot.authRequired || snapshot.accountChanged) return snapshot;
      const real = snapshot.participants.filter(person => person && !isMate(person));
      const self = real.find(person => person.isSelf || (snapshot.participantId && person.id === snapshot.participantId));
      const room = String(snapshot.room.id || '');
      if (!BUILT_IN.test(room) || !self || real.length < 1 || real.length > MAX_REAL) return snapshot;   // 自己建的雅室、真人 3 位起：陪修不显示
      const now = Date.now();
      const profile = profileOf(room, Math.floor((now + BEIJING) / DAY));
      const taken = new Set(real.map(person => person.seatId).filter(Number.isInteger));
      const seatId = profile.order.find(seat => !taken.has(seat));
      if (seatId === undefined) return snapshot;
      const view = Object.assign({ id: profile.id, seatId, nickname: profile.name, avatarId: profile.avatarId, equipped: {},
        isFriend: false, isSelf: false, companion: true, pauseReason: '', timerStale: false }, phaseOf(profile, now));
      const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms.map(item => (item ? withMate(item) : item)) : snapshot.rooms;
      return Object.assign({}, snapshot, { participants: snapshot.participants.concat(view), room: withMate(snapshot.room), rooms, companionId: profile.id });
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
