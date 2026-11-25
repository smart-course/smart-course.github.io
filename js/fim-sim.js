/* 《金融机构与市场》课堂模拟房间接课程网站：给“线上模拟”的学生页、教师控制台当宿主（window.SimHost）。
 *   · 一个课堂一个房间：学生从这次课的页面进来，身份就是课堂登录的身份（不用再填姓名学号）；老师从工作台“课堂网页 → 课堂模拟控制台”进来。
 *   · 游戏的流程和界面还是 线上模拟/sim_*.js 那一套，这里只提供“存储”：
 *       正式后台（云开发）：后台是一张带读写规则的同步表（sim_kv，见 sql/…-课堂模拟.sql）。本页保留一份自己读得到的内容，
 *         页面写的时候先改本机这份、再排队交给后台（sim_write）；每 2.5 秒取一次别人的改动（sim_read）。
 *         谁能读写什么由后台按键名决定——别人的卡、埋雷方向、别人的指认、没公布的判定，本页根本拿不到。
 *       本机测试（provider＝mock）：直接用浏览器的本机存储，同一个浏览器开几个标签页当老师和学生。
 *   · 页面里的模拟脚本先以文本形式放着，等这里取到第一批数据、备好 SimHost 以后再启动（FIM_SIM_BOOT）。
 * 页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 */
(function () {
  'use strict';
  // ---------- 正式后台：一份本机副本＋排队写入＋定时读取
  // 单独写成一个函数、不碰页面：Node 里也能加载（测试/sim_cloud_e2e.js 用它对着本机数据库把四场模拟整场跑一遍）。
  // rpc(函数名, 参数) 调后台；hooks.note(文字) 在页面顶上提示网络状况；hooks.visible() 页面是否在前台。
  function makeCloudStore(rpc, classroom, roomName, hooks) {
    const note = (hooks && hooks.note) || (() => {});
    const visible = (hooks && hooks.visible) || (() => true);
    const PREFIX = `simroom/${roomName}/`;
    const mirror = new Map();        // 键 → 值（JSON 文本）
    const pending = new Map();       // 还没得到后台确认的本机改动：键 → 值（JSON 文本）或 null（删除）
    let queue = [];                  // 按先后排队的写入 [{k, t}]
    let keys = null;                 // 键的列表（有改动时作废）
    let rev = 0;
    let localRev = 0;
    let offset = 0;                  // 后台时间 − 本机时间
    let busy = false;
    let again = false;
    let needFull = true;
    let lastFull = 0;
    let lastTouch = Date.now();      // 最近一次有改动（本机写的或别人写的）的时间：久没动静就读得慢一些
    let sig = '';                    // 房间阶段、发卡时间、本人的卡——有变化就整份重取（读写规则跟着它们变）
    let fails = 0;
    let sticky = '';                 // 写不进去的原因（课堂已停止、要重新登录）：一直提示到下一次写成功
    let mySid = '';
    let timer = null;
    const rejected = [];             // 后台没收的写入（最近 50 条），排查用
    const listeners = new Set();
    const changed = () => { keys = null; localRev += 1; lastTouch = Date.now(); };
    const fire = () => listeners.forEach((fn) => { try { fn(); } catch (error) { /* 页面自己的错不影响同步 */ } });
    const sigNow = () => { const meta = mirror.get('meta') || ''; let m = {}; try { m = JSON.parse(meta || '{}') || {}; } catch (error) { m = {}; }
      return `${m.phase}|${(m.dealt || {}).at || ''}|${m.game || ''}|${mySid ? mirror.get('card/' + mySid) || '' : ''}`; };
    const storage = {
      get length() { return mirror.size + 1; },
      key(i) { if (!keys) keys = Array.from(mirror.keys()); return i < keys.length ? PREFIX + keys[i] : i === keys.length ? `${PREFIX}_rev` : null; },
      getItem(full) {
        if (!String(full).startsWith(PREFIX)) return null;
        const k = full.slice(PREFIX.length);
        if (k === '_rev') return String(localRev);
        return mirror.has(k) ? mirror.get(k) : null;
      },
      setItem(full, value) {
        if (!String(full).startsWith(PREFIX)) return;
        const k = full.slice(PREFIX.length);
        if (k === '_rev') return;
        const text = String(value);
        if (mirror.get(k) === text) return;
        mirror.set(k, text); changed();
        enqueue(k, text);
      },
      removeItem(full) {
        if (!String(full).startsWith(PREFIX)) return;
        const k = full.slice(PREFIX.length);
        if (k === '_rev' || !mirror.has(k)) return;
        mirror.delete(k); changed();
        enqueue(k, null);
      },
    };
    function enqueue(k, text) {
      pending.set(k, text);
      const last = queue[queue.length - 1];
      if (last && last.k === k) last.t = text; else queue.push({ k, t: text });
      clearTimeout(timer);
      timer = setTimeout(tick, 60);
    }
    async function flush() {
      while (queue.length) {
        const batch = queue.slice(0, 200);
        const sent = batch.map((op) => op.t);        // 交出去时的样子：等后台答复的这一会儿，页面可能又改了同一格
        const res = await rpc('sim_write', { p_classroom: classroom, p_ops: batch.map((op) => ({ k: op.k, v: op.t == null ? null : JSON.parse(op.t) })) });
        const out = Array.isArray(res) ? res[0] : res;
        if (!out || out.status !== 'ok') {
          queue = []; pending.clear(); needFull = true;
          sticky = out && out.status === 'login' ? '请回首页重新登录' : out && out.status === 'closed' ? '课堂已停止，不能再改' : '没有存上，请稍后再试';
          note(sticky);
          return;
        }
        sticky = '';
        const kept = [];
        batch.forEach((op, i) => { if (op.t !== sent[i]) kept.push(op); });   // 等答复时又改过的：留在队里再交一次
        queue = kept.concat(queue.slice(batch.length));
        batch.forEach((op, i) => { if (pending.get(op.k) === sent[i] && !queue.some((q) => q.k === op.k)) pending.delete(op.k); });
        if ((out.rejected || []).length) {   // 后台没收的：整份重取，以后台为准
          out.rejected.forEach((r) => { if (!queue.some((q) => q.k === r.k)) pending.delete(r.k); rejected.push(r); });
          while (rejected.length > 50) rejected.shift();
          needFull = true;
        }
      }
    }
    async function read() {
      const full = needFull || Date.now() - lastFull > 60000;
      const res = await rpc('sim_read', { p_classroom: classroom, p_since: full ? 0 : rev });
      const out = Array.isArray(res) ? res[0] : res;
      if (!out || out.status !== 'ok') { note(out && out.status === 'login' ? '请回首页重新登录' : '读不到房间的数据'); return; }
      offset = Number(out.now) - Date.now();
      let touched = false;
      if (full) {
        const fresh = new Map((out.rows || []).filter((r) => r.v !== null).map((r) => [r.k, JSON.stringify(r.v)]));
        pending.forEach((text, k) => { if (text == null) fresh.delete(k); else fresh.set(k, text); });   // 还没确认的本机改动留着
        if (fresh.size !== mirror.size || Array.from(fresh.entries()).some(([k, v]) => mirror.get(k) !== v)) touched = true;
        mirror.clear(); fresh.forEach((v, k) => mirror.set(k, v));
        needFull = false; lastFull = Date.now();
      } else {
        (out.rows || []).forEach((r) => {
          if (pending.has(r.k)) return;
          const text = r.v === null ? null : JSON.stringify(r.v);
          if (text == null) { if (mirror.delete(r.k)) touched = true; } else if (mirror.get(r.k) !== text) { mirror.set(r.k, text); touched = true; }
        });
      }
      rev = Number(out.rev) || rev;
      const now = sigNow();
      if (now !== sig) { if (sig) needFull = true; sig = now; }
      if (touched) { changed(); fire(); }
      note(sticky);
    }
    async function tick() {
      if (busy) { again = true; return; }
      busy = true;
      try { await flush(); await read(); if (needFull) await read(); fails = 0; } catch (error) { fails += 1; if (fails >= 2) note('网络不通，正在重试……'); }
      busy = false;
      if (again || queue.length) { again = false; clearTimeout(timer); timer = setTimeout(tick, 80); }
    }
    /* 等到本机的改动都交给了后台、别人的改动也取回来了（测试里每一步之后用；页面离开前也可以等一下）。 */
    async function settle() {
      for (let i = 0; i < 600; i += 1) {
        if (busy) { await new Promise((resolve) => setTimeout(resolve, 5)); continue; }
        clearTimeout(timer); again = false;
        await tick();
        if (!busy && !queue.length && !needFull) { clearTimeout(timer); again = false; return true; }
      }
      return false;
    }
    return { storage, clock: () => Date.now() + offset, onChange: (fn) => listeners.add(fn), tick, settle,
      /* 开始定时同步：有动静的时候每 2.5 秒读一次，半分钟没有任何改动就放慢到 6 秒一次；页面不在前台时不读。 */
      start(sid) {
        mySid = sid || '';
        let last = 0;
        setInterval(() => { if (!visible()) return; const gap = Date.now() - lastTouch > 30000 ? 6000 : 2500; if (Date.now() - last >= gap - 100) { last = Date.now(); tick(); } }, 500);
        return tick();
      },
      setSid(sid) { mySid = sid || ''; },
      pendingCount: () => queue.length, rejected: () => rejected.slice(), keys: () => Array.from(mirror.keys()), dump: () => new Map(mirror) };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { makeCloudStore }; return; }

  const config = window.CLASS_LIVE_CONFIG;
  if (!config || config.provider === 'off' || !window.ClassLive) return;
  window.FIM_SIM_BRIDGE = true;
  const TEACHER = Boolean(document.querySelector('[data-sim-console]'));
  if (/staticrypt_pwd=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  let backend;
  try { backend = window.ClassLive.create(config); } catch (error) { return; }
  const params = new URLSearchParams(location.search);
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (error) { return fallback; } };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MOCK = config.provider === 'mock';

  const style = document.createElement('style');
  style.textContent = `
  .fims-over { position: fixed; inset: 0; z-index: 2147483600; display: grid; place-items: center; padding: 24px; background: #f6efe4; color: #26302d; font: 17px/1.8 "PingFang SC","Microsoft YaHei",sans-serif; text-align: center; }
  .fims-over div { max-width: 560px; }
  .fims-over h2 { margin: 0 0 10px; font-size: 24px; color: #1d5d58; }
  .fims-over a, .fims-over button { display: inline-block; margin: 8px 6px 0; padding: 8px 22px; border: 0; border-radius: 10px; background: #1d5d58; color: #fff; font: 700 16px/1.6 inherit; text-decoration: none; cursor: pointer; }
  .fims-net { position: fixed; left: 50%; top: 8px; z-index: 2147483500; transform: translateX(-50%); padding: 4px 14px; border-radius: 999px; background: #b3402b; color: #fff; font: 700 14px/1.6 "PingFang SC","Microsoft YaHei",sans-serif; }
  .fims-net[hidden] { display: none; }
  `;
  document.head.appendChild(style);
  function overlay(title, html) {
    let box = document.querySelector('.fims-over');
    if (!box) { box = document.createElement('div'); box.className = 'fims-over'; document.body.appendChild(box); }
    box.innerHTML = `<div><h2>${esc(title)}</h2>${html}</div>`;
    return box;
  }
  const net = document.createElement('div');
  net.className = 'fims-net';
  net.hidden = true;
  document.body.appendChild(net);
  const netNote = (text) => { net.textContent = text || ''; net.hidden = !text; };

  const cloudStore = (classroom, roomName) => {
    const store = makeCloudStore((name, args) => backend.rpc(name, args), classroom, roomName, { note: netNote, visible: () => document.visibilityState === 'visible' });
    // 切到别的页面、锁屏、关页面之前，把还没交给后台的改动交出去
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') store.tick(); });
    return store;
  };

  // ---------- 本机测试：直接用浏览器的本机存储（同一个浏览器的几个标签页共用）
  function localStore(roomName) {
    const listeners = new Set();
    window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith(`simroom/${roomName}/`) && !e.key.includes('/seen/')) listeners.forEach((fn) => fn()); });
    return { storage: window.localStorage, clock: () => Date.now(), onChange: (fn) => listeners.add(fn), tick: async () => {}, start: async () => {}, pendingCount: () => 0 };
  }

  function boot(host) {
    window.SimHost = host;
    const box = document.querySelector('.fims-over');
    if (box) box.remove();
    window.FIM_SIM_BOOT();
  }

  // =====================================================================================================
  // 学生页
  // =====================================================================================================
  async function student() {
    const unit = config.unit;
    const last = load('classlive-student', {});
    const mine = load(`classlive-student:${config.course}:${unit}`, null);
    const identity = (last.course === config.course && last.chapter === unit) || !(mine && mine.classroom) ? last : mine;
    const joined = Boolean(identity.classroom && identity.name && identity.sid && identity.course === config.course && identity.chapter === unit);
    const back = `${unit}.html`;
    // 2026-11-25：老师从工作台打开的“学生版测试页”（?preview=课堂编号）用的是测试身份“王不凡”，不在点名册里，进不了要分组发卡的模拟房间。
    // 原来只提示“先登录”，老师看不出是怎么回事。
    const preview = params.get('preview');
    if (preview) {
      overlay('这是老师的学生版测试页', `<p>模拟房间要分组发卡，得用点名册里的学生身份登录才能进。测试页用的是“王不凡”，不在任何一组里，所以进不来。</p>
        <p>老师开房间、分组发卡、推进阶段，用“课堂模拟控制台”。里面有各组的隐藏身份，请在自己的屏幕上打开，不要投屏。</p>
        <p>想看学生看到的样子：另开一个浏览器（或者无痕窗口），用点名册里的一位同学登录这次课，再点“进入模拟房间”。</p>
        <a href="/teacher/${esc(config.course)}/sim.html?room=${encodeURIComponent(preview)}" target="_blank" rel="noopener">打开课堂模拟控制台</a><a href="${back}">回到本次课页面</a>`);
      return;
    }
    if (!joined) { overlay('先登录', `<p>请回首页，用老师公布的这次课的课堂码登录，再从这次课的页面进入模拟房间。</p><a href="/">回首页</a>`); return; }
    if (identity.audit) { overlay('旁听不能进入模拟房间', `<p>课堂模拟要分组发卡，旁听的同学不参加。</p><a href="${back}">回到本次课页面</a>`); return; }
    const classroom = Number(identity.classroom);
    const roomName = `c${classroom}`;
    overlay('正在进入模拟房间……', '');
    const store = MOCK ? localStore(roomName) : cloudStore(classroom, roomName);
    try { await store.start(String(identity.sid).replace(/\s+/g, '').toUpperCase()); } catch (error) { /* 读不到时页面上会显示“还没有开” */ }
    // 签到和在线时长照课程网站的做法记
    backend.rpc('ck_checkin_today', { p_classroom: classroom, p_sid: identity.sid }).catch(() => { /* 忽略 */ });
    const ping = () => { if (document.visibilityState === 'visible') backend.rpc('ck_ping', { p_classroom: classroom }).catch(() => { /* 忽略 */ }); };
    ping();
    setInterval(ping, 45000);
    boot({ room: roomName, student: { sid: String(identity.sid).replace(/\s+/g, '').toUpperCase(), name: identity.name }, storage: store.storage, clock: store.clock,
      beat: MOCK ? undefined : { every: 20000, alive: 50000 }, onChange: store.onChange, back, title: identity.classroom_name || '' });
  }

  // =====================================================================================================
  // 教师控制台
  // =====================================================================================================
  async function teacher() {
    overlay('正在连接……', '');
    let session = null;
    try { session = await backend.session(); } catch (error) { session = null; }
    if (!session || session.anonymous) { overlay('先登录教师工作台', `<p>请先在同一个浏览器打开教师工作台登录，再刷新本页。</p><a href="/teacher/" target="_blank" rel="noopener">打开教师工作台</a>`); return; }
    const units = new Map((config.units || []).filter((u) => (u.sims || []).length).map((u) => [u.unit, u]));
    let classes = [];
    let rooms = [];
    try {
      classes = await backend.fetchAll('classes', { course: config.course });
      rooms = await backend.fetchAll('classrooms', { course: config.course });
    } catch (error) { overlay('读不到课堂', '<p>请确认已在教师工作台登录，网络正常。</p>'); return; }
    let wanted = params.get('class');
    if (!wanted) { try { wanted = localStorage.getItem(`teacher:class:${config.course}`); } catch (error) { wanted = null; } }
    const klass = classes.find((c) => String(c.id) === String(wanted)) || classes[0];
    const list = rooms.filter((r) => klass && String(r.class_id) === String(klass.id) && units.has(r.chapter)).sort((a, b) => Number(b.id) - Number(a.id));
    const open = (room) => {
      const roomName = `c${room.id}`;
      const u = units.get(room.chapter);
      overlay('正在打开控制台……', '');
      const store = MOCK ? localStore(roomName) : cloudStore(Number(room.id), roomName);
      Promise.resolve(store.start('')).catch(() => { /* 忽略 */ }).then(() => boot({ room: roomName, storage: store.storage, clock: store.clock, beat: MOCK ? undefined : { every: 20000, alive: 50000 },
        onChange: store.onChange, games: u.sims, demo: MOCK, title: `${klass.name} · ${room.name}（课堂码 ${room.code}）${String(room.name).includes(`第${u.no}次课`) ? '' : ` · 第${u.no}次课`}` }));
    };
    const gameNames = (u) => (u.sims || []).map((g) => ((window.SIM_PUBLIC || {})[g] || {}).title || g).join('、');   // 这次课做哪一场模拟
    const exact = list.find((r) => String(r.id) === params.get('room'));
    const current = list.filter((r) => r.is_current);
    if (exact) { open(exact); return; }
    if (current.length === 1) { open(current[0]); return; }
    if (!list.length) {
      overlay('还没有可以开模拟的课堂', `<p>课堂模拟在第${Array.from(units.values()).map((u) => u.no).join('、')}次课。先到教师工作台给“${esc(klass ? klass.name : '本班')}”发布其中一次课，再回到这里。</p><a href="/teacher/">回教师工作台</a>`);
      return;
    }
    const box = overlay('选一个课堂', `<p>${esc(klass.name)}：给哪一次课开模拟房间？</p>${(current.length ? current : list).map((r) => `<button type="button" data-room="${esc(r.id)}">${esc(r.name)}（${esc(gameNames(units.get(r.chapter)))}${r.is_current ? '' : ' · 已停止'}）</button>`).join('')}`);
    box.addEventListener('click', (event) => { const b = event.target.closest('[data-room]'); if (b) open(list.find((r) => String(r.id) === b.dataset.room)); });
  }

  (TEACHER ? teacher() : student()).catch((error) => { overlay('没有打开', `<p>${esc(String((error && error.message) || error).slice(0, 120))}</p>`); });
})();
