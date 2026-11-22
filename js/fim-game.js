/* 《金融机构与市场》期中经营模拟：银行“行长的一年”、券商“掌舵营业部”二选一，结业总评就是期中成绩。
 * 本文件用在三处：
 *   · 期中页（mid01.html）：选游戏（选定后不能换）、看自己的进度；
 *   · 游戏页（mid01-bank.html、mid01-broker.html）：游戏源文件原样拼在页面里，这里只做“接入”——
 *       ① 本机存档按“课堂＋学号”分开（两款游戏的存档键原样不动，读写时换成各人自己的键，同一台设备换人不串）；
 *       ② 进入时先向后台取存档：后台的进度不比本机少，就用后台的（换设备接着玩）；
 *       ③ 游戏每次存档，都把整份存档同步到后台；任期设置不对（不是 12 个月、标准情境、全班场景码）的不收；
 *          进度倒退、换了别的存档（重开、导入别人的文件）要老师先在工作台允许重开；
 *       ④ 12 个月全部结算以后，点“递交期中成绩”。递交以后不再同步。
 *   · 教师的“期中经营模拟成绩”页：用 window.FimGame.api 读全班的存档，用同一份引擎重算总评（不采信学生端报的分数）。
 * 游戏引擎、题库、界面的字节一个都不改（见 fim_build.game_page）。
 * 后台：云开发函数 fg_*（见 sql/金融机构与市场-期中经营模拟.sql）；本机测试（provider＝mock）时用浏览器本机存储模拟同样的规则。
 */
(function () {
  'use strict';
  // ---------- 后台接口：云开发函数 fg_*；本机测试用浏览器本机存储，规则相同。
  // 两个造接口的函数都不碰页面，Node 里也能加载（测试/game_api_contract.js 让同一串操作分别走这两种做法，比对返回的内容）。
  function makeMockApi(storage, SETTINGS) {
    const KEY = 'fim-mock:fg';
    const load = (key, fallback) => { try { const v = JSON.parse(storage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (error) { return fallback; } };
    const all = () => load(KEY, { saves: {}, rooms: {}, log: [] });
    const put = (db) => storage.setItem(KEY, JSON.stringify(db));
    const roomOf = (id) => load('classlive-mock:classrooms', []).find((r) => String(r.id) === String(id));
    const open = (id) => { const r = roomOf(id); return Boolean(r && r.is_current && r.submissions_open && (!r.deadline || Date.now() <= Date.parse(r.deadline))); };
    const rowKey = (room, sid) => `${room}|${String(sid).toUpperCase()}`;
    const view = (row, room) => ({ status: 'ok', game: row ? row.game : null, done: row ? row.done : 0, ended: Boolean(row && row.ended), revision: row ? row.revision : 0,
      summary: row ? row.summary : {}, submitted_at: row ? row.submitted_at : null, restarts: row ? row.restarts : 0, restarts_left: row ? Math.max(0, row.restarts_allowed - row.restarts) : 0,
      updated_at: row ? row.updated_at : null, deadline: (roomOf(room) || {}).deadline || null, open: open(room) });
    return {
      async my(room, me) { const row = all().saves[rowKey(room, me.sid)]; return view(row, room); },
      async load(room, me) { const row = all().saves[rowKey(room, me.sid)]; return { ...view(row, room), state: row ? row.state : null }; },
      async choose(room, me, game) {
        const db = all(); const k = rowKey(room, me.sid);
        if (db.saves[k]) return { status: db.saves[k].game === game ? 'ok' : 'chosen', game: db.saves[k].game };
        if (!open(room)) return { status: 'closed' };
        db.saves[k] = { classroom: Number(room), sid: String(me.sid).toUpperCase(), name: me.name, game, state: null, summary: {}, done: 0, ended: false, revision: 0, restarts: 0, restarts_allowed: 0,
          chosen_at: new Date().toISOString(), updated_at: null, submitted_at: null };
        db.log.push({ classroom: Number(room), sid: db.saves[k].sid, at: new Date().toISOString(), kind: 'choose', done: 0, detail: game });
        put(db);
        return { status: 'ok', game };
      },
      async save(room, me, game, state, summary) {
        const db = all(); const row = db.saves[rowKey(room, me.sid)];
        if (!row) return { status: 'no_choice' };
        if (row.game !== game) return { status: 'other_game' };
        if (row.submitted_at) return { status: 'submitted' };
        if (!open(room)) return { status: roomOf(room) && roomOf(room).deadline && Date.now() > Date.parse(roomOf(room).deadline) ? 'deadline' : 'closed' };
        if (Number(summary.months) !== SETTINGS.months || summary.difficulty !== SETTINGS.difficulty || summary.seed !== SETTINGS.seed) return { status: 'settings' };
        if (Number(summary.done) < row.done) return { status: 'regress', done: row.done };
        if (Number(summary.done) > row.done) db.log.push({ classroom: Number(room), sid: row.sid, at: new Date().toISOString(), kind: 'month', done: Number(summary.done), score: Number(summary.score) || 0 });
        Object.assign(row, { state, summary, done: Number(summary.done) || 0, ended: Boolean(summary.ended), revision: row.revision + 1, updated_at: new Date().toISOString(), name: me.name });
        put(db);
        return { status: 'ok', revision: row.revision, done: row.done };
      },
      async restart(room, me, game) {
        const db = all(); const row = db.saves[rowKey(room, me.sid)];
        if (!row || row.game !== game) return { status: 'no_choice' };
        if (row.submitted_at) return { status: 'submitted' };
        if (row.restarts >= row.restarts_allowed) return { status: 'none', left: 0 };
        Object.assign(row, { restarts: row.restarts + 1, state: null, summary: {}, done: 0, ended: false, revision: row.revision + 1, updated_at: new Date().toISOString() });
        db.log.push({ classroom: Number(room), sid: row.sid, at: new Date().toISOString(), kind: 'restart', done: 0 });
        put(db);
        return { status: 'ok', left: row.restarts_allowed - row.restarts };
      },
      async submit(room, me) {
        const db = all(); const row = db.saves[rowKey(room, me.sid)];
        if (!row) return { status: 'no_choice' };
        if (row.submitted_at) return { status: 'ok', submitted_at: row.submitted_at };
        if (!row.ended || !row.state) return { status: 'not_ended', done: row.done };
        if (!open(room)) return { status: 'closed' };
        row.submitted_at = new Date().toISOString();
        db.log.push({ classroom: Number(room), sid: row.sid, at: row.submitted_at, kind: 'submit', done: row.done, score: Number((row.summary || {}).score) || 0 });
        put(db);
        return { status: 'ok', submitted_at: row.submitted_at };
      },
      // 以下教师用
      async board(room) { const db = all(); return { status: 'ok', rows: Object.values(db.saves).filter((r) => String(r.classroom) === String(room)).map((r) => ({ ...r, state: undefined })), log: db.log.filter((l) => String(l.classroom) === String(room)) }; },
      async state(room, sid) { const row = all().saves[rowKey(room, sid)]; return row ? { status: 'ok', state: row.state, summary: row.summary } : { status: 'none' }; },
      async allowRestart(room, sid, n) { const db = all(); const row = db.saves[rowKey(room, sid)]; if (!row) return { status: 'none' }; row.restarts_allowed = row.restarts + Math.max(0, Number(n) || 0);
        db.log.push({ classroom: Number(room), sid: row.sid, at: new Date().toISOString(), kind: 'allow', detail: '老师允许重开' }); put(db); return { status: 'ok' }; },
      async reset(room, sid) { const db = all(); delete db.saves[rowKey(room, sid)]; db.log.push({ classroom: Number(room), sid: String(sid).toUpperCase(), at: new Date().toISOString(), kind: 'reset', detail: '老师重置' }); put(db); return { status: 'ok' }; },
      async reopen(room, sid) { const db = all(); const row = db.saves[rowKey(room, sid)]; if (!row) return { status: 'none' }; row.submitted_at = null;
        db.log.push({ classroom: Number(room), sid: row.sid, at: new Date().toISOString(), kind: 'reopen', detail: '老师撤回递交' }); put(db); return { status: 'ok' }; },
    };
  }
  function makeCloudApi(call) {
    const rpc = async (name, args) => { const res = await call(name, args); return Array.isArray(res) ? res[0] : res; };
    return {
      my: (room) => rpc('fg_my', { p_classroom: Number(room) }),
      load: (room) => rpc('fg_load', { p_classroom: Number(room) }),
      choose: (room, me, game) => rpc('fg_choose', { p_classroom: Number(room), p_game: game }),
      save: (room, me, game, state, summary) => rpc('fg_save', { p_classroom: Number(room), p_game: game, p_state: state, p_summary: summary }),
      restart: (room, me, game) => rpc('fg_restart', { p_classroom: Number(room), p_game: game }),
      submit: (room) => rpc('fg_submit', { p_classroom: Number(room) }),
      board: (room) => rpc('fg_board', { p_classroom: Number(room) }),
      state: (room, sid) => rpc('fg_state', { p_classroom: Number(room), p_sid: sid }),
      allowRestart: (room, sid, n) => rpc('fg_allow_restart', { p_classroom: Number(room), p_sid: sid, p_n: Number(n) || 0 }),
      reset: (room, sid) => rpc('fg_reset', { p_classroom: Number(room), p_sid: sid }),
      reopen: (room, sid) => rpc('fg_reopen', { p_classroom: Number(room), p_sid: sid }),
    };
  }
  if (typeof module === 'object' && module.exports) { module.exports = { makeMockApi, makeCloudApi }; return; }

  const config = window.CLASS_LIVE_CONFIG;
  if (!config || config.provider === 'off' || !window.ClassLive) return;
  const G = window.FIM_GAME || null;                 // 游戏页才有
  if (G) window.FIM_GAME_BRIDGE = true;              // 告诉页面：等接入层取好存档再启动游戏
  const MID = config.midterm || {};
  const GAMES = MID.games || {};
  const SETTINGS = { months: Number(MID.months) || 12, difficulty: MID.difficulty || 'standard', seed: MID.seed || 'CLASS-01' };
  const params = new URLSearchParams(location.search);
  const previewRoom = Number(params.get('preview')) || 0;
  const PREVIEW = previewRoom > 0;
  if (!PREVIEW && /staticrypt_pwd=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  let backend;
  try { backend = window.ClassLive.create(config); } catch (error) { return; }
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (error) { return fallback; } };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stamp = (at) => { const ms = Date.parse(at); return Number.isNaN(ms) ? '' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(/\//g, '-'); };

  // ---------- 存档里读几样东西（两款引擎的字段名不同）
  const reportsOf = (state) => (state && (state.history || state.reports)) || [];
  const doneOf = (state) => reportsOf(state).length;                       // 已结算几个月
  const trailOf = (state) => reportsOf(state).map((r) => [Number(r.month) || 0, Number(r.profit) || 0]);
  const sameTrail = (a, b) => a.length <= b.length && a.every((x, i) => x[0] === b[i][0] && Math.abs(x[1] - b[i][1]) < 0.005);
  const settingsOk = (state) => Number(state.months) === SETTINGS.months && state.difficulty === SETTINGS.difficulty && String(state.seed || '') === SETTINGS.seed;

  // ---------- 后台接口（两种做法见文件开头）
  const api = config.provider === 'mock' ? makeMockApi(localStorage, SETTINGS) : makeCloudApi((name, args) => backend.rpc(name, args));
  window.FimGame = { api, backend, SETTINGS, GAMES, doneOf, trailOf, reportsOf, settingsOk };
  if (!G && !$('[data-game-pick]')) return;            // 教师页只用上面的接口

  // ---------- 课堂身份（同 fim-student.js）
  const unit = config.unit;
  const lastIdentity = PREVIEW ? {} : load('classlive-student', {});
  const unitIdentity = PREVIEW ? null : load(`classlive-student:${config.course}:${unit}`, null);
  const identity = PREVIEW ? { name: '王不凡', sid: 'WBF0001', classroom: previewRoom, course: config.course, chapter: unit, code: '' }
    : (lastIdentity.course === config.course && lastIdentity.chapter === unit) || !(unitIdentity && unitIdentity.classroom) ? lastIdentity : unitIdentity;
  const joined = Boolean(identity.classroom && identity.name && identity.sid && identity.course === config.course && identity.chapter === unit);
  const room = Number(identity.classroom) || 0;
  const me = { sid: identity.sid, name: identity.name };
  const HUB = `${unit}.html`;
  const joinUrl = '/' + (identity.code ? `?join=${encodeURIComponent(identity.code)}` : '');

  // =====================================================================================================
  // 期中页：选游戏、看进度
  // =====================================================================================================
  if (!G) {
    const mine = $('[data-game-mine]');
    const paintHub = (info) => {
      const chosen = info && info.game;
      $$('[data-game-pick]').forEach((button) => {
        const k = button.dataset.gamePick;
        button.hidden = Boolean(chosen) || !joined;
        const openLink = $(`[data-game-open="${k}"]`);
        if (openLink) openLink.hidden = chosen !== k;
        const stateLine = $(`[data-game-state="${k}"]`);
        if (stateLine) stateLine.textContent = chosen === k ? '你选的是这一款。' : chosen ? '你选了另一款，这一款不能再选。' : joined ? '' : '登录以后才能选。';
        const card = $(`[data-game-card="${k}"]`);
        if (card) card.style.opacity = chosen && chosen !== k ? '.55' : '';
      });
      if (!mine) return;
      if (!joined) { mine.hidden = false; mine.innerHTML = `<h2>先登录</h2><div class="fim-card"><p>请回<a href="/">首页</a>，用老师公布的“期中经营模拟”课堂码登录，再回到这里选游戏。</p></div>`; return; }
      if (!chosen) { mine.hidden = true; return; }
      const g = GAMES[chosen] || { name: chosen };
      const s = info.summary || {};
      const lines = [];
      lines.push(`<p><b>进度：</b>已结算 ${info.done || 0}/${SETTINGS.months} 个月${info.ended ? '，任期已结束' : ''}${info.updated_at ? `；最近一次保存 ${esc(stamp(info.updated_at))}` : '；还没有开始'}</p>`);
      if (info.done) lines.push(`<p><b>目前总评：</b>${esc(String(s.score == null ? '—' : s.score))} 分${s.cap && s.cap < 100 ? `（因职业操守问题，总评最高 ${esc(String(s.cap))} 分）` : ''}。结业时的总评才是期中成绩。</p>`);
      if (info.submitted_at) lines.push(`<p class="fq-state is-ok">已递交期中成绩（${esc(stamp(info.submitted_at))}）。</p>`);
      else if (info.ended) lines.push('<p class="fq-state is-bad">任期已经结束，还没有递交：进入游戏，点右上角的“递交期中成绩”。</p>');
      if (info.deadline) lines.push(`<p><b>截止时间：</b>${esc(stamp(info.deadline))}${Date.now() > Date.parse(info.deadline) ? '（已过）' : ''}</p>`);
      mine.hidden = false;
      mine.innerHTML = `<h2>我的经营模拟<small>${esc(me.name)} · ${esc(g.name)}</small></h2><div class="fim-card">${lines.join('')}
        <p style="margin-top:12px"><a class="fim-btn is-clay" href="${unit}-${esc(g.page)}.html">进入经营 →</a></p>
        <p class="fim-note" style="margin:10px 0 0">正式任期：${SETTINGS.months}个月、${SETTINGS.difficulty === 'standard' ? '标准情境' : '压力情境'}、场景码 ${esc(SETTINGS.seed)}。开局时不要改这三项。</p></div>`;
    };
    const refresh = async () => {
      if (!joined) { paintHub(null); return; }
      try { paintHub(await api.my(room, me)); } catch (error) { paintHub(null); }
    };
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-game-pick]');
      if (!button || !joined) return;
      const k = button.dataset.gamePick;
      const g = GAMES[k] || { name: k };
      if (!window.confirm(`选“${g.name}”作为你的期中经营模拟？选定以后不能换。`)) return;
      try {
        const res = await api.choose(room, me, k);
        if (res.status === 'closed') window.alert('这个课堂已经停止或过了截止时间，不能再选。');
        else if (res.status === 'login') window.alert('请回首页重新登录。');
      } catch (error) { window.alert('没有选上，请检查网络后再试。'); }
      refresh();
    });
    refresh();
    return;
  }

  // =====================================================================================================
  // 游戏页：存档改键、同步、递交
  // =====================================================================================================
  const KEY = G.key;
  const MY = `fimgame:${config.course}:${room || 'guest'}:${identity.sid || 'guest'}:${G.id}`;
  const SYNCED = `${MY}:synced`;               // 最近一次同步成功的那份（进度倒退时用它恢复）
  const mapKey = (k) => (k === KEY ? MY : k === `${KEY}-backup` ? `${MY}-backup` : null);
  const proto = Storage.prototype;
  const rawGet = proto.getItem; const rawSet = proto.setItem; const rawDel = proto.removeItem;
  let onSave = () => {};
  proto.getItem = function (k) { const m = this === window.localStorage ? mapKey(k) : null; return rawGet.call(this, m || k); };
  proto.setItem = function (k, v) { const m = this === window.localStorage ? mapKey(k) : null; rawSet.call(this, m || k, v); if (m === MY) onSave(v); };
  proto.removeItem = function (k) { const m = this === window.localStorage ? mapKey(k) : null; rawDel.call(this, m || k); };
  const readLocal = () => { try { return JSON.parse(rawGet.call(localStorage, MY) || 'null'); } catch (error) { return null; } };
  const writeLocal = (wrapper) => rawSet.call(localStorage, MY, JSON.stringify(wrapper));

  const style = document.createElement('style');
  style.textContent = `
  .fimg-bar { position: fixed; right: 12px; bottom: 12px; z-index: 2147483000; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px 10px; max-width: min(640px, calc(100vw - 24px));
    padding: 7px 10px 7px 14px; border-radius: 14px; background: rgba(20,45,42,.95); color: #fff; font: 14px/1.5 "PingFang SC","Microsoft YaHei",sans-serif; box-shadow: 0 10px 26px rgba(0,0,0,.3); }
  .fimg-bar b { color: #f5d698; }
  .fimg-bar span.is-bad { color: #ffc9b8; font-weight: 700; }
  .fimg-bar a, .fimg-bar button { min-height: 32px; padding: 0 12px; border: 1px solid rgba(255,255,255,.45); border-radius: 8px; background: transparent; color: #fff; font: 700 14px/30px inherit; text-decoration: none; cursor: pointer; white-space: nowrap; }
  .fimg-bar button.is-go { border-color: #f5d698; background: #f5d698; color: #2b2118; }
  .fimg-bar.is-min > :not([data-min]) { display: none; }
  .fimg-over { position: fixed; inset: 0; z-index: 2147483600; display: grid; place-items: center; padding: 24px; background: rgba(16,32,30,.86); color: #fff; font: 17px/1.8 "PingFang SC","Microsoft YaHei",sans-serif; text-align: center; }
  .fimg-over div { max-width: 520px; }
  .fimg-over h2 { margin: 0 0 10px; font-size: 24px; }
  .fimg-over a, .fimg-over button { display: inline-block; margin-top: 14px; padding: 8px 22px; border: 0; border-radius: 10px; background: #f5d698; color: #2b2118; font: 700 16px/1.6 inherit; text-decoration: none; cursor: pointer; }
  @media print { .fimg-bar { display: none !important; } }
  `;
  document.head.appendChild(style);
  function overlay(title, html) {
    const box = document.createElement('div');
    box.className = 'fimg-over';
    box.innerHTML = `<div><h2>${esc(title)}</h2>${html}</div>`;
    document.body.appendChild(box);
    return box;
  }

  const sync = { server: null, done: 0, trail: [], submitted: null, restartsLeft: 0, text: '', bad: false, offline: false, busy: false, again: false };
  const bar = document.createElement('div');
  bar.className = `fimg-bar${load('fimg-bar-min', false) ? ' is-min' : ''}`;
  function paintBar() {
    const local = readLocal();
    const state = local && local.game;
    const done = state ? doneOf(state) : 0;
    const ended = Boolean(state && state.ended);
    bar.innerHTML = `<span><b>${esc(me.name || '')}</b> · 已结算 ${done}/${SETTINGS.months} 个月</span>
      <span class="${sync.bad ? 'is-bad' : ''}" role="status">${esc(sync.text)}</span>
      ${ended && !sync.submitted && !PREVIEW ? '<button type="button" class="is-go" data-submit>递交期中成绩</button>' : ''}
      <a href="${HUB}">回期中页</a><button type="button" data-min title="收起或展开">${bar.classList.contains('is-min') ? '期中 ▸' : '▾'}</button>`;
  }
  const say = (text, bad) => { sync.text = text; sync.bad = Boolean(bad); paintBar(); };
  bar.addEventListener('click', async (event) => {
    if (event.target.closest('[data-min]')) { bar.classList.toggle('is-min'); try { localStorage.setItem('fimg-bar-min', JSON.stringify(bar.classList.contains('is-min'))); } catch (error) { /* 忽略 */ } paintBar(); return; }
    if (event.target.closest('[data-submit]')) {
      await push(true);
      if (sync.bad) return;
      const local = readLocal();
      const total = scoreOf(local.game).total;
      if (!window.confirm(`递交期中成绩？\n结业总评：${total} 分。\n递交以后不能重开，成绩不再改变。`)) return;
      try {
        const res = await api.submit(room, me);
        if (res.status === 'ok') { sync.submitted = res.submitted_at; say(`已递交期中成绩（${stamp(res.submitted_at)}）：${total} 分`); }
        else if (res.status === 'not_ended') say('后台记录里任期还没有结束，请稍等片刻再点一次', true);
        else say('没有递交成功：课堂已停止或已过截止时间，请联系老师', true);
      } catch (error) { say('没有递交成功，请检查网络后再点一次', true); }
    }
  });

  const scoreOf = (state) => { try { return new window[G.engine]({}, state).score(); } catch (error) { return { total: 0, cap: 100 }; } };

  // 把本机这份存档同步到后台。force：递交前强制同步一次
  let pushTimer = 0;
  async function push(force) {
    if (PREVIEW) { say('教师测试页：存档只在这台设备上'); return; }
    if (sync.submitted) { say(`已递交期中成绩（${stamp(sync.submitted)}），之后的操作不再计入`); return; }
    if (sync.busy) { sync.again = true; return; }
    const local = readLocal();
    const state = local && local.game;
    if (!state) return;
    if (!settingsOk(state)) {
      say(`这个任期不是正式任期（须为${SETTINGS.months}个月、标准情境、场景码 ${SETTINGS.seed}），不能保存到课程网站。请在“课堂与存档”里按这三项重新开启。`, true);
      return;
    }
    const done = doneOf(state);
    const trail = trailOf(state);
    const regress = done < sync.done || !sameTrail(sync.trail, trail);
    if (regress && sync.done > 0) {
      // 进度倒退，或者前面几个月的结果对不上：是重开了，或者导入了别的存档
      if (sync.restartsLeft > 0 && window.confirm(`后台记录你已经结算了 ${sync.done} 个月，现在这份存档对不上（重开了，或导入了别的存档）。\n用掉一次老师允许的重开机会，从这份存档重新开始？`)) {
        try {
          const res = await api.restart(room, me, G.id);
          if (res.status === 'ok') { sync.done = 0; sync.trail = []; sync.restartsLeft = res.left || 0; }
          else { restoreSynced('没有重开的机会了，已恢复到后台保存的进度。'); return; }
        } catch (error) { say('没有连上后台，暂时不能重开', true); return; }
      } else { restoreSynced(sync.restartsLeft > 0 ? '已恢复到后台保存的进度。' : '正式任期不能重开，也不能换成别的存档（要重开，请老师在工作台允许）。已恢复到后台保存的进度。'); return; }
    }
    sync.busy = true;
    say('正在保存到课程网站……');
    try {
      const score = scoreOf(state);
      const summary = { done, months: Number(state.months), month: Number(state.month), ended: Boolean(state.ended), difficulty: state.difficulty, seed: String(state.seed || ''), name: String(state.name || '').slice(0, 30),
        score: score.total, cap: score.cap, trail };
      const res = await api.save(room, me, G.id, local, summary);
      if (res.status === 'ok') {
        sync.done = done; sync.trail = trail; sync.offline = false;
        rawSet.call(localStorage, SYNCED, JSON.stringify(local));
        say(`已保存到课程网站 ${stamp(new Date().toISOString())}${state.ended ? '；任期已结束，请递交期中成绩' : ''}`, false);
      } else if (res.status === 'submitted') { sync.submitted = sync.submitted || new Date().toISOString(); say('已递交期中成绩，之后的操作不再计入'); }
      else if (res.status === 'deadline') say('已过截止时间，后台不再保存', true);
      else if (res.status === 'closed') say('课堂已停止，后台不再保存', true);
      else if (res.status === 'regress') { sync.done = res.done || sync.done; restoreSynced('后台的进度比这份存档多，已恢复到后台保存的进度。'); }
      else if (res.status === 'settings') say('任期设置不对，后台不收这份存档', true);
      else if (res.status === 'login') say('请回首页重新登录后再继续（本机存档还在）', true);
      else say('没有保存到课程网站（本机存档还在）', true);
    } catch (error) {
      sync.offline = true;
      say('没有连上课程网站：存档暂时只在这台设备上，联网后会自动补存', true);
    }
    sync.busy = false;
    if (sync.again) { sync.again = false; push(false); }
  }
  function restoreSynced(message) {
    const saved = load(SYNCED, null) || (sync.server && sync.server.state) || null;
    if (!saved) { say(message, true); return; }
    onSave = () => {};
    writeLocal(saved);
    window.alert(message);
    location.reload();
  }

  (async function boot() {
    if (!joined && !PREVIEW) {
      overlay('先登录', `<p>请回首页，用老师公布的“期中经营模拟”课堂码登录。</p><a href="/">回首页</a>`);
      return;
    }
    let server = null;
    if (!PREVIEW) {
      try { server = await api.load(room, me); } catch (error) { sync.offline = true; }
      if (server && server.status === 'login') { overlay('请重新登录', `<p>这台设备还没有核对身份（课堂码＋点名册＋个人口令）。</p><a href="${joinUrl}">回首页登录</a>`); return; }
      if (server && !server.game) { location.replace(window.FimKey ? window.FimKey.href(HUB) : HUB); return; }
      if (server && server.game !== G.id) {
        const other = GAMES[server.game] || { name: server.game, page: server.game };
        overlay('你选的是另一款', `<p>你的期中经营模拟是“${esc(other.name)}”，选定以后不能换。</p><a href="${unit}-${esc(other.page)}.html">去“${esc(other.name)}”</a>`);
        return;
      }
    }
    if (server) {
      sync.server = server;
      sync.done = Number(server.done) || 0;
      sync.trail = (server.summary && server.summary.trail) || [];
      sync.submitted = server.submitted_at || null;
      sync.restartsLeft = Number(server.restarts_left) || 0;
      const local = readLocal();
      const localDone = local && local.game ? doneOf(local.game) : -1;
      // 后台的进度不比本机少：用后台的（换设备接着玩）；本机更多（上次没同步上）：留本机的，启动后补存
      if (server.state && server.state.game && doneOf(server.state.game) >= localDone) { writeLocal(server.state); rawSet.call(localStorage, SYNCED, JSON.stringify(server.state)); }
    }
    window.FIM_GAME_BOOT();
    document.body.appendChild(bar);
    onSave = () => { clearTimeout(pushTimer); pushTimer = setTimeout(() => push(false), 1200); };
    if (PREVIEW) say('教师测试页：存档只在这台设备上');
    else if (sync.submitted) say(`已递交期中成绩（${stamp(sync.submitted)}），之后的操作不再计入`);
    else if (sync.offline) say('没有连上课程网站：存档暂时只在这台设备上', true);
    else { say(server && server.updated_at ? `已和课程网站同步（${stamp(server.updated_at)}）` : '开局以后，存档会自动保存到课程网站'); if (readLocal()) push(false); }
    window.addEventListener('online', () => push(false));
    setInterval(() => { if (sync.offline && document.visibilityState === 'visible') push(false); }, 30000);
    // 签到和在线时长照课程网站的做法记（学情分析里看得到每位同学花了多少时间经营）
    if (!PREVIEW) {
      backend.rpc('ck_checkin_today', { p_classroom: room, p_sid: identity.sid }).catch(() => { /* 忽略 */ });
      const ping = () => { if (document.visibilityState === 'visible') backend.rpc('ck_ping', { p_classroom: room }).catch(() => { /* 忽略 */ }); };
      ping();
      setInterval(ping, 45000);
    }
  })();
})();
