/* 《金融机构与市场》教师投屏页（课次页、案例页的教师版）：每道题下面显示学生的实时作答。
 *   · 默认只显示“已递交 N 人”，点“显示分布”才展开（免得影响还在作答的同学）；
 *   · 选项题按选项列人数；多选列每个选项被选了几次；填数题列填得最多的几个数；文字题点“看作答”逐条列出（默认不显示姓名）；
 *   · 参考答案只在老师点开本题的“参考答案与依据”以后才在分布里标出来（★）；
 *   · “停止递交／恢复递交”：停止后学生不能再递交这道题；
 *   · “开始答题”：选好给多长时间，点一下，学生页那道题上开始倒计时（fim-timer.js）；可以加时间、提前结束、取消；
 *     随堂检测、一个案例的几个问题这样成组的题，上面另有“这一组题一起计时”；勾上“到点自动停止递交”，时间到了后台就不再收这道题。
 * 需要老师已在同一个浏览器登录教师工作台（读学生作答要教师账号）。右下角的“课堂”控件（结束提交、停止课堂）用网站原有的 live-room.js。
 * 页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG（kind＝session-html、unit、questions 含参考答案）。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  if (!config || config.provider === 'off' || !window.ClassLive) return;
  let backend;
  try { backend = window.ClassLive.create(config); } catch (error) { return; }
  const Live = window.ClassLive;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LET = (i) => 'ABCDEFGH'[i];
  const unit = config.unit;
  const Q = new Map((config.questions || []).map((q) => [q.key, q]));
  const POLL_MS = 5000;
  const state = { room: null, rows: [], joined: 0, stops: [], open: new Set(), texts: new Set(), names: false, problem: '正在连接课堂后台……' };

  // ---------- 答题计时
  const Timer = window.FimTimer || null;
  const board = Timer ? Timer.makeBoard(() => performance.now()) : null;
  const timerApi = !Timer ? null : config.provider === 'mock' ? Timer.makeMockApi(Timer.browserStore()) : Timer.makeCloudApi((name, args) => backend.rpc(name, args));
  let timerOff = !timerApi;          // 后台还没有答题计时的函数时，不显示这组按钮
  const HARD_KEY = 'fim-timer-hard';
  let hard = false;
  try { hard = localStorage.getItem(HARD_KEY) === '1'; } catch (error) { /* 忽略 */ }
  const picked = {};                 // 计时编号 → 老师选的时长（秒）
  const GROUPS = config.groups || [];
  const groupOf = (key) => GROUPS.find((g) => g.keys.includes(key)) || null;
  const itemName = (item) => {
    const group = GROUPS.find((g) => g.item === item);
    if (group) return `${group.title}（${group.keys.length}题）`;
    const q = Q.get(item);
    const section = q ? String(q.section_title || '').split('\u3000')[0] : '';
    return q ? (String(q.label).startsWith(section) ? q.label : `${section} · ${q.label}`) : item;
  };
  /* 一道题（或一组题）的计时按钮。def＝默认给多久；follow＝这道题所在的组正在计时（只显示组的钟，不另开） */
  function timerHtml(item, def, follow) {
    if (timerOff) return '';
    const row = board.own(item);
    const left = row ? board.left(row) : 0;
    if (row && left > 0) {
      return `<span class="fqt is-run"><b class="fqt-clock" data-fqt-clock="${esc(item)}">${Timer.clock(left)}</b>
        <button type="button" data-fqt-add="${esc(item)}" data-s="30">＋30秒</button><button type="button" data-fqt-add="${esc(item)}" data-s="60">＋1分钟</button>
        <button type="button" class="is-warn" data-fqt-end="${esc(item)}">结束</button><button type="button" class="is-plain" data-fqt-clear="${esc(item)}">取消</button>
        ${row.hard ? '<small>到点自动停止递交</small>' : ''}</span>`;
    }
    if (follow && board.left(follow) > 0) return `<span class="fqt is-run is-follow"><b class="fqt-clock" data-fqt-clock="${esc(follow.item)}">${Timer.clock(board.left(follow))}</b><small>本组计时中</small></span>`;
    const pick = picked[item] || def || 60;
    const choices = Timer.CHOICES.includes(pick) ? Timer.CHOICES : Timer.CHOICES.concat(pick).sort((a, b) => a - b);
    return `<span class="fqt">${row ? '<b class="fqt-over">时间到</b>' : ''}
      <button type="button" class="is-go" data-fqt-start="${esc(item)}">${row ? '再开始一次' : '开始答题'}</button>
      <select data-fqt-secs="${esc(item)}" aria-label="给多长时间">${choices.map((s) => `<option value="${s}"${s === pick ? ' selected' : ''}>${Timer.label(s)}</option>`).join('')}</select>
      <label class="fqt-hard"><input type="checkbox" data-fqt-hard${hard ? ' checked' : ''}>到点自动停止递交</label>
      ${row ? `<button type="button" class="is-plain" data-fqt-clear="${esc(item)}">清除“时间到”</button>` : ''}</span>`;
  }

  const style = document.createElement('style');
  style.textContent = `
  .fq-live { display: block; }
  .fql-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .fql-line b { color: #1d5d58; font-size: 16px; }
  .fql-line button { min-height: 32px; padding: 0 12px; border: 1.5px solid #1d5d58; border-radius: 8px; background: #fff; color: #1d5d58; font: 700 14.5px/1 inherit; cursor: pointer; }
  .fql-line button.is-warn { border-color: #b3402b; color: #b3402b; }
  .fql-line small { color: #5d6a65; }
  .fql-bars { margin-top: 10px; display: grid; gap: 6px; }
  .fql-bar { display: grid; grid-template-columns: minmax(0, 1fr) 150px 64px; gap: 10px; align-items: center; font-size: 15px; }
  .fql-bar span { min-width: 0; }
  .fql-bar i { display: block; height: 12px; border-radius: 999px; background: #dfe9e6; overflow: hidden; }
  .fql-bar i u { display: block; height: 100%; border-radius: 999px; background: #1d5d58; }
  .fql-bar.is-ref span::before { content: '★ '; color: #b98a2f; }
  .fql-bar.is-ref i u { background: #b98a2f; }
  .fql-bar em { font-style: normal; color: #5d6a65; text-align: right; white-space: nowrap; }
  .fql-vals { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .fql-vals span { padding: 2px 12px; border-radius: 999px; background: #fff; border: 1px solid #cfdcd8; font-size: 15px; }
  .fql-vals span.is-ok { border-color: #1f7a4c; color: #1f7a4c; font-weight: 700; }
  .fql-vals span.is-bad { border-color: #d9a79b; color: #8a3f22; }
  .fql-vals em { margin-left: 6px; font-style: normal; color: #8a8478; font-size: 13.5px; }
  .fql-texts { margin-top: 10px; display: grid; gap: 8px; max-height: 420px; overflow: auto; }
  .fql-texts article { padding: 10px 12px; border-radius: 10px; background: #fff; border: 1px solid #dfe9e6; font-size: 15.5px; line-height: 1.7; white-space: pre-wrap; }
  .fql-texts article header { margin-bottom: 2px; color: #8a8478; font-size: 13.5px; }
  .fq-group .fql-line b { color: #26302d; }
  .fqt { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding-right: 12px; margin-right: 2px; border-right: 1.5px solid #cfdcd8; }
  .fq-group .fqt { border-right: 0; }
  .fqt button.is-go { background: #1d5d58; color: #fff; }
  .fqt button.is-plain { border-color: #cfdcd8; color: #5d6a65; font-weight: 600; }
  .fqt select { min-height: 32px; padding: 0 6px; border: 1.5px solid #cfdcd8; border-radius: 8px; background: #fff; color: #26302d; font: 600 14.5px/1 inherit; }
  .fqt-hard { display: inline-flex; align-items: center; gap: 4px; color: #5d6a65; font-size: 14px; white-space: nowrap; cursor: pointer; }
  .fqt-clock { min-width: 84px; padding: 0 12px; border-radius: 9px; background: #1d5d58; color: #fff !important; font-size: 26px !important; line-height: 1.5; text-align: center; font-variant-numeric: tabular-nums; }
  .fqt-clock.is-hot { background: #b3402b; }
  .fqt.is-follow .fqt-clock { background: #5f8f88; font-size: 20px !important; min-width: 70px; }
  .fqt-over { padding: 0 10px; border-radius: 8px; background: #f7e6da; color: #8a3f22 !important; }
  ${Timer ? Timer.CSS : ''}
  .fim-live-bar { position: fixed; left: 14px; bottom: 14px; z-index: 300; max-width: min(520px, calc(100vw - 28px)); padding: 7px 14px; border-radius: 999px; background: rgba(29,93,88,.94); color: #fff;
    font: 700 14.5px/1.5 "PingFang SC","Microsoft YaHei",sans-serif; box-shadow: 0 8px 22px rgba(20,40,36,.25); }
  .fim-live-bar.is-bad { background: rgba(138,63,34,.95); }
  .fim-live-bar a { color: #ffe9c4; }
  @media print { .fim-live-bar, .fq-live { display: none !important; } }
  `;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'fim-live-bar';
  document.body.appendChild(bar);

  const valueOf = (row, key) => { const entry = (row.payload || {})[key]; return entry && typeof entry === 'object' && 'v' in entry ? entry.v : undefined; };
  const sameSet = (a, b) => Array.isArray(a) && a.length === b.length && a.map(Number).sort().join() === b.map(Number).sort().join();
  const numRight = (q, v) => Math.abs(Number(String(v).replace(/[−–—－]/g, '-').replace(/[％%\s,，]/g, '')) - q.answer) <= (q.tol || 1e-6);
  const isRight = (q, v) => (q.type === 'single' ? Number(v) === q.answer : q.type === 'judge' ? Number(v) === (q.answer ? 1 : 0)
    : q.type === 'multi' ? sameSet(v, q.answer) : q.type === 'num' ? numRight(q, v) : null);

  // 正在用下拉框选时长的那一块，这一轮先不重画（不然选到一半会被收起来）
  const busy = (host) => Boolean(document.activeElement && document.activeElement.tagName === 'SELECT' && host.contains(document.activeElement));

  function paint() {
    bar.classList.toggle('is-bad', Boolean(state.problem));
    bar.innerHTML = state.problem ? state.problem
      : `${esc(state.room.name)}（课堂码 ${esc(state.room.code)}）· 已加入 ${state.joined} 人 · 已有 ${state.rows.length} 人递交`;
    $$('[data-fq-group]').forEach((host) => {
      if (state.problem || timerOff) { host.innerHTML = ''; return; }
      if (busy(host)) return;
      const item = host.dataset.fqGroup;
      const stopped = state.stops.includes(item);
      host.innerHTML = `<div class="fql-line"><b>这一组 ${esc(host.dataset.n)} 道题一起计时</b>${timerHtml(item, Number(host.dataset.secs))}
        <button type="button" class="${stopped ? '' : 'is-warn'}" data-fql-stop="${esc(item)}">${stopped ? '这一组恢复递交' : '这一组停止递交'}</button>
        ${stopped ? '<small>已停止：学生不能再递交这一组的题</small>' : ''}</div>`;
    });
    $$('[data-fq-live]').forEach((host) => {
      const key = host.dataset.fqLive;
      const q = Q.get(key);
      if (!q) { host.hidden = true; return; }
      if (state.problem) { host.innerHTML = `<span class="fql-line"><small>${state.problem}</small></span>`; return; }
      if (busy(host)) return;
      const answers = state.rows.map((row) => ({ row, v: valueOf(row, key) })).filter((x) => x.v !== undefined && x.v !== null);
      const box = host.closest('.fq');
      const refOpen = Boolean(box && $('.fq-ref', box) && $('.fq-ref', box).open);
      const stopped = Live.isStopped(state.stops, key);
      const open = state.open.has(key);
      const right = q.type === 'text' ? 0 : answers.filter((x) => isRight(q, x.v)).length;
      const group = groupOf(key);
      let html = `<div class="fql-line">${timerHtml(key, q.secs || (Timer && Timer.DEFAULT[q.type]), group && board ? board.own(group.item) : null)}<b>已递交 ${answers.length} 人</b>
        <button type="button" data-fql-toggle="${esc(key)}">${open ? '收起' : q.type === 'text' ? '看作答' : '显示分布'}</button>
        ${group && state.stops.includes(group.item) ? '<small>这一组已停止递交（要重新收，点上面的“这一组恢复递交”）</small>'
    : `<button type="button" class="${stopped ? '' : 'is-warn'}" data-fql-stop="${esc(key)}">${stopped ? '恢复递交' : '停止递交'}</button>
        ${stopped ? '<small>已停止：学生不能再递交这道题</small>' : ''}`}
        ${open && refOpen && q.type !== 'text' && answers.length ? `<small>答对 ${right} 人 · 正确率 ${Math.round(right * 100 / answers.length)}%</small>` : ''}
        ${open && q.type === 'text' ? `<button type="button" data-fql-names>${state.names ? '隐藏姓名' : '显示姓名'}</button>` : ''}</div>`;
      if (open) {
        if (q.type === 'single' || q.type === 'judge' || q.type === 'multi') {
          const options = q.type === 'judge' ? [['1', '说得对'], ['0', '说得不对']] : q.options.map((text, i) => [String(i), `${LET(i)}. ${text}`]);
          const refs = q.type === 'judge' ? [q.answer ? '1' : '0'] : q.type === 'single' ? [String(q.answer)] : q.answer.map(String);
          html += `<div class="fql-bars">${options.map(([value, label]) => {
            const n = answers.filter((x) => (q.type === 'multi' ? Array.isArray(x.v) && x.v.map(String).includes(value) : String(x.v) === value)).length;
            return `<div class="fql-bar${refOpen && refs.includes(value) ? ' is-ref' : ''}"><span>${esc(label)}</span><i><u style="width:${answers.length ? Math.round(n * 100 / answers.length) : 0}%"></u></i><em>${n} 人</em></div>`;
          }).join('')}</div>`;
        } else if (q.type === 'num') {
          const counts = new Map();
          answers.forEach((x) => counts.set(String(x.v), (counts.get(String(x.v)) || 0) + 1));
          html += `<div class="fql-vals">${Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, n]) =>
            `<span class="${refOpen ? (numRight(q, value) ? 'is-ok' : 'is-bad') : ''}">${esc(value)}${esc(q.unit || '')}<em>${n} 人</em></span>`).join('') || '<small>还没有人递交</small>'}</div>`;
        } else {
          html += `<div class="fql-texts">${answers.map((x, i) => `<article><header>${state.names ? `${esc(x.row.name)}（${esc(x.row.sid)}）` : `第 ${i + 1} 份`}</header>${esc(x.v)}</article>`).join('') || '<small>还没有人递交</small>'}</div>`;
        }
      }
      host.innerHTML = html;
    });
  }

  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-fql-toggle]');
    if (toggle) { const key = toggle.dataset.fqlToggle; if (state.open.has(key)) state.open.delete(key); else state.open.add(key); paint(); return; }
    if (event.target.closest('[data-fql-names]')) { state.names = !state.names; paint(); return; }
    // 答题计时
    const act = event.target.closest('[data-fqt-start], [data-fqt-add], [data-fqt-end], [data-fqt-clear]');
    if (act && state.room && timerApi) {
      const room = Number(state.room.id);
      try {
        let res;
        if (act.dataset.fqtStart) {
          const wrap = act.closest('.fqt');
          res = await timerApi.start(room, act.dataset.fqtStart, Number($('select', wrap).value), $('[data-fqt-hard]', wrap).checked);
        } else if (act.dataset.fqtAdd) res = await timerApi.adjust(room, act.dataset.fqtAdd, Number(act.dataset.s));
        else if (act.dataset.fqtEnd) res = await timerApi.end(room, act.dataset.fqtEnd, false);
        else res = await timerApi.end(room, act.dataset.fqtClear, true);
        board.load(res);
        state.stops = Live.stopList(await backend.rpc('ck_stopped_items', { p_classroom: room }).catch(() => state.stops));
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        paint();
      } catch (error) {
        if (Timer.missing(error)) { timerOff = true; paint(); window.alert('答题计时还没有开通：后台还没有执行“答题计时”那一份语句。'); }
        else window.alert(`没有成功：${/教师账号|42501/.test(String(error && error.message)) ? '请确认已在教师工作台登录。' : String((error && error.message) || error)}`);
      }
      return;
    }
    const stop = event.target.closest('[data-fql-stop]');
    if (stop && state.room) {
      const key = stop.dataset.fqlStop;
      try {
        state.stops = Live.stopList(await backend.rpc('ck_stop_item', { p_classroom: Number(state.room.id), p_item: key, p_stop: !Live.isStopped(state.stops, key) }));
        paint();
      } catch (error) { window.alert('没有成功：请确认已在教师工作台登录。'); }
    }
  });
  // 老师点开或收起“参考答案与依据”时，重画这道题的分布（★ 跟着出现或消失）
  document.addEventListener('toggle', (event) => { if (event.target.classList && event.target.classList.contains('fq-ref')) paint(); }, true);
  // 投屏页上的题目只作演示：点选项只是高亮，不递交
  document.addEventListener('change', (event) => {
    const secs = event.target.closest('[data-fqt-secs]');
    if (secs) { picked[secs.dataset.fqtSecs] = Number(secs.value); secs.blur(); return; }
    const hardBox = event.target.closest('[data-fqt-hard]');
    if (hardBox) { hard = hardBox.checked; try { localStorage.setItem(HARD_KEY, hard ? '1' : '0'); } catch (error) { /* 忽略 */ } paint(); return; }
    const box = event.target.closest('.fq');
    if (box) $$('.fq-opt', box).forEach((label) => label.classList.toggle('is-on', $('input', label).checked));
  });

  async function load() {
    try {
      const session = await backend.session();
      if (!session || session.anonymous) {
        state.problem = '这里显示学生的实时作答：请先在同一个浏览器打开<a href="/teacher/" target="_blank" rel="noopener">教师工作台</a>登录，再刷新本页。';
        paint();
        return;
      }
      const rooms = await backend.fetchAll('classrooms', { course: config.course });
      const room = Live.pickRoom(rooms, config.course, unit);
      if (!room || room.chapter !== unit) {
        state.room = null;
        state.problem = room ? `现在开放的课堂是“${esc(room.name)}”，不是这一次课；到教师工作台发布这次课以后，这里显示学生的作答。` : '还没有开放中的课堂：到教师工作台发布这次课以后，这里显示学生的作答。';
        paint();
        return;
      }
      state.room = room;
      const [rows, checkins, stops, timers] = await Promise.all([
        backend.fetchAll('homework', { classroom: room.id }),
        backend.fetchAll('checkins', { classroom: room.id }),
        backend.rpc('ck_stopped_items', { p_classroom: Number(room.id) }).catch(() => []),
        timerOff ? null : timerApi.list(Number(room.id)).catch((error) => { if (Timer.missing(error)) timerOff = true; return null; }),
      ]);
      if (timers) board.load(timers);
      state.rows = rows;
      state.joined = new Set(checkins.filter((c) => !c.auditor).map((c) => String(c.sid))).size;
      state.stops = Live.stopList(stops);
      state.problem = '';
    } catch (error) {
      state.problem = '读不到学生作答：请确认已在教师工作台登录，网络正常。';
    }
    paint();
  }
  // 页面上方的大钟：还在计时的里面最先到点的；刚到点（20秒内）显示“时间到”。点一下跳到那道题。
  let bigClock = null;
  let bigItem = '';
  const seen = {};
  function tick() {
    if (!board || timerOff || !state.room) { if (bigClock) bigClock.hidden = true; return; }
    let running = null;
    let over = null;
    let changed = false;
    board.rows().forEach((row) => {
      const left = board.left(row);
      const now = left > 0 ? 'run' : 'over';
      if (seen[row.item] && seen[row.item] !== now) changed = true;
      seen[row.item] = now;
      if (left > 0) { if (!running || left < running.left) running = { row, left }; }
      else if (left > -20 && (!over || left > over.left)) over = { row, left };
    });
    if (changed) { paint(); if (board.rows().some((r) => r.hard)) setTimeout(load, 4500); }      // 刚到点：按钮换成“再开始一次”；自动停止递交的，过几秒读一次
    $$('[data-fqt-clock]').forEach((el) => {
      const row = board.own(el.dataset.fqtClock);
      if (!row) return;
      const left = board.left(row);
      const text = Timer.clock(left);
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('is-hot', left <= 10);
    });
    const main = running || over;
    if (!main) { if (bigClock) bigClock.hidden = true; return; }
    if (!bigClock) {
      bigClock = document.createElement('div');
      bigClock.className = 'fim-clockbar is-big';
      bigClock.title = '点一下跳到这道题';
      bigClock.innerHTML = '<span data-n></span><b data-t></b><small data-s></small>';
      document.body.appendChild(bigClock);
      Timer.place(bigClock);
      bigClock.addEventListener('click', () => {
        const host = $(`[data-fq-group="${bigItem}"]`) || $(`[data-fq-live="${bigItem}"]`);
        if (host) host.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    bigItem = main.row.item;
    const others = board.rows().filter((r) => board.left(r) > 0).length - (running ? 1 : 0);
    const set = (selector, text) => { const el = $(selector, bigClock); if (el.textContent !== text) el.textContent = text; };
    set('[data-n]', itemName(main.row.item));
    set('[data-t]', main.left > 0 ? Timer.clock(main.left) : '时间到');
    set('[data-s]', main.left > 0 ? (others > 0 ? `另有${others}个计时` : '') : (main.row.hard ? '已自动停止递交' : ''));
    bigClock.classList.toggle('is-hot', main.left > 0 && main.left <= 10);
    bigClock.classList.toggle('is-over', main.left <= 0);
    bigClock.hidden = false;
  }
  load();
  setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
  setInterval(tick, 250);
  window.addEventListener('storage', (event) => { if (event.key === 'classlive-mock:qt_timers') load(); });
})();
