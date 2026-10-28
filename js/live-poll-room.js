/* 课堂工具“投票器”（课堂完整版投屏页，2026-10-29 用户：“课堂工具可以再增加一个投票器的功能，可以发起临时投票，比如是/否、对/错、
 * 赞同/反对、一/二。点击投票器后学生端会弹出投票选项可以让学生选择。”）
 *   右下角“课堂工具”里加一节“投票器”（在“讨论计时”下面）：选一组选项（是/否、对/错、赞同/反对、一/二、A/B/C/D，或自己写），题目可填可不填，点“发起投票”；
 *   大屏显示题目、已投人数／今天在场人数，各项人数先不显示（免得跟风），点“显示结果”或“结束投票”才展开；
 *   学生页每几秒问一次（live-student.js setupPoll），有投票就弹出选项，投票结束前可以改；结束时可以把结果公布到学生页。
 * 需要在本机登录教师工作台（ck_poll_open／ck_poll_close 只给教师，票数从 ck_poll_votes 读）。只在课程网站的投屏页有，离线版没有。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!window.ClassLive || config.provider === 'off') return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[投票器]', error.message); return; }
  const POLL = window.ClassLive.POLL || { presets: [['是', '否'], ['对', '错'], ['赞同', '反对'], ['一', '二'], ['A', 'B', 'C', 'D']], refresh: 2000 };
  const unit = config.unit || window.ClassLive.unitOf();
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#23655f', '#a4492d', '#3b5683', '#8a6418', '#7a4572', '#55672b'];

  const style = document.createElement('style');
  style.textContent = `
  .pv-tool .pv-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 8px 0 6px; }
  .pv-tool .pv-presets button { padding: 8px 4px; border: 1.5px solid rgba(35,101,95,.35); border-radius: 9px; background: #fff; color: #23655f; font: 700 14px/1.2 -apple-system, "PingFang SC", sans-serif; cursor: pointer; }
  .pv-tool .pv-presets button[aria-pressed="true"] { color: #fff; background: #23655f; border-color: #23655f; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
  .pv-tool input { display: block; width: 100%; box-sizing: border-box; margin-top: 6px; padding: 8px 10px; border: 1.5px solid rgba(70,51,34,.2); border-radius: 9px; background: #fff; font: 15px/1.3 -apple-system, "PingFang SC", sans-serif; }
  .pv-tool input:focus { outline: none; border-color: #23655f; box-shadow: 0 0 0 3px rgba(35,101,95,.18); }
  .pv-tool .pv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .pv-tool .pv-row button { padding: 10px 6px; border: 1.5px solid #23655f; border-radius: 9px; background: #fff; color: #23655f; font: 800 15px/1.2 -apple-system, "PingFang SC", sans-serif; cursor: pointer; }
  .pv-tool .pv-row button.is-main { color: #fff; background: linear-gradient(180deg, #2f7a72, #23655f 60%, #1d5650); }
  .pv-tool .pv-row button:disabled { opacity: .55; cursor: default; }
  .pv-tool .pv-hint { margin: 8px 0 0; color: #6d6259; font-size: 13px; line-height: 1.6; }
  .pv-stage { position: fixed; inset: 0; z-index: 2147483000; display: flex; flex-direction: column; padding: 4vh 5vw; box-sizing: border-box; color: #fff;
    background: radial-gradient(circle at 20% 0%, rgba(232,196,106,.18), transparent 40%), linear-gradient(160deg, #173f3b, #0f2b28); font-family: -apple-system, "PingFang SC", sans-serif; }
  .pv-stage[hidden] { display: none; }
  .pv-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: clamp(16px, 2vw, 24px); color: rgba(255,255,255,.85); }
  .pv-top b { color: #f6dc98; }
  .pv-state { padding: 4px 14px; border-radius: 999px; background: rgba(255,255,255,.12); font-weight: 800; }
  .pv-state.is-open { background: #e8c46a; color: #3b2a07; }
  .pv-x { width: 46px; height: 46px; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; background: rgba(255,255,255,.08); color: #fff; font-size: 26px; line-height: 1; cursor: pointer; }
  .pv-q { margin: 3vh 0 4vh; font-size: clamp(28px, 4.4vw, 60px); font-weight: 800; line-height: 1.3; letter-spacing: .02em; }
  .pv-bars { display: grid; gap: 2.4vh; flex: 1; align-content: center; }
  .pv-bar { display: grid; grid-template-columns: minmax(120px, 18%) 1fr minmax(120px, 14%); align-items: center; gap: 2vw; }
  .pv-bar b { font-size: clamp(26px, 3.6vw, 52px); text-align: right; }
  .pv-track { position: relative; height: clamp(34px, 6vh, 64px); border-radius: 14px; background: rgba(255,255,255,.1); overflow: hidden; }
  .pv-fill { position: absolute; inset: 0 auto 0 0; width: 0; border-radius: 14px; background: var(--c); box-shadow: inset 0 1px 0 rgba(255,255,255,.25); transition: width .6s ease; }
  .pv-num { font-size: clamp(22px, 3vw, 42px); font-weight: 800; font-variant-numeric: tabular-nums; }
  .pv-num small { margin-left: 8px; font-size: .55em; color: rgba(255,255,255,.7); }
  .pv-stage.is-hidden-result .pv-fill { width: 0 !important; }
  .pv-stage.is-hidden-result .pv-num { visibility: hidden; }
  .pv-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 4vh; }
  .pv-actions button { padding: 12px 22px; border: 1.5px solid rgba(255,255,255,.4); border-radius: 12px; background: rgba(255,255,255,.1); color: #fff; font: 800 clamp(15px, 1.4vw, 20px)/1.2 -apple-system, "PingFang SC", sans-serif; cursor: pointer; }
  .pv-actions button.is-main { border-color: #e8c46a; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; }
  .pv-note { margin-top: 1.6vh; text-align: center; color: rgba(255,255,255,.7); font-size: clamp(13px, 1.2vw, 16px); }
  `;
  document.head.appendChild(style);

  // ---------- 课堂工具里的“投票器” ----------
  const box = document.querySelector('[data-classroom-toolbox]');
  if (!box) return;
  const near = box.querySelector('[data-pz-tool]') || box.querySelector('[data-wg-tool]');
  const tool = document.createElement('section');
  tool.className = `${near ? near.className : ''} pv-tool`.trim();
  tool.dataset.pvTool = '';
  const label = near && near.querySelector('.ctb-label, .toolbox-label');
  tool.innerHTML = `<div class="${label ? label.className : 'ctb-label'}"><strong>投票器</strong><span>学生页弹出选项，当场统计</span></div>
    <div class="pv-presets">${POLL.presets.map((list, i) => `<button type="button" data-pv-preset="${i}" aria-pressed="${i === 0}">${esc(list.join('／'))}</button>`).join('')}<button type="button" data-pv-preset="custom" aria-pressed="false">自己写</button></div>
    <input type="text" data-pv-custom maxlength="80" placeholder="选项用空格或逗号隔开，2—6 个，如：甲 乙 丙" hidden>
    <input type="text" data-pv-question maxlength="80" placeholder="题目（选填，会显示在学生页）">
    <div class="pv-row"><button type="button" class="is-main" data-pv-go>发起投票</button><button type="button" data-pv-last>看上次结果</button></div>
    <p class="pv-hint" data-pv-hint>发起后，学生页会弹出选项；投票结束前可以改。</p>`;
  // 2026-10-29 用户：“把投票器放到讨论计时的下方”
  const timerShow = box.querySelector('[data-timer-display]');
  const after = (timerShow && timerShow.closest('section')) || near;
  if (after) after.parentNode.insertBefore(tool, after.nextSibling);
  else (box.querySelector('.ctb-body, .toolbox-body') || box).appendChild(tool);
  const $ = (selector, root = tool) => root.querySelector(selector);
  const hint = (text) => { $('[data-pv-hint]').textContent = text; };
  let preset = 0;
  tool.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pv-preset]');
    if (!button) return;
    preset = button.dataset.pvPreset === 'custom' ? 'custom' : Number(button.dataset.pvPreset);
    tool.querySelectorAll('[data-pv-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    $('[data-pv-custom]').hidden = preset !== 'custom';
    if (preset === 'custom') $('[data-pv-custom]').focus();
  });
  const optionsNow = () => (preset === 'custom'
    ? $('[data-pv-custom]').value.split(/[\s,，、;；/／]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6)
    : POLL.presets[preset].slice());

  // 本页对应的当前课堂（同一个班同时开放几个课堂时，取地址里 room 指定的那个）
  async function roomHere() {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const current = window.ClassLive.pickRoom(rooms, config.course, unit);
    return current && current.chapter === unit && current.is_current ? current : null;
  }

  // ---------- 大屏 ----------
  const stage = document.createElement('div');
  stage.className = 'pv-stage is-hidden-result';
  stage.hidden = true;
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-label', '投票器');
  stage.innerHTML = `<div class="pv-top"><span class="pv-state" data-pv-state></span><span data-pv-count></span><button type="button" class="pv-x" data-pv-close aria-label="关闭">×</button></div>
    <div class="pv-q" data-pv-q></div><div class="pv-bars" data-pv-bars></div><div class="pv-actions" data-pv-actions></div><p class="pv-note" data-pv-note></p>`;
  document.body.appendChild(stage);
  let poll = null;
  let votes = [];
  let present = 0;
  let timer = 0;
  let presentTimer = 0;
  const S = (selector) => stage.querySelector(selector);
  function draw() {
    if (!poll) return;
    const counts = poll.options.map((_, i) => votes.filter((v) => Number(v.choice) === i).length);
    const total = counts.reduce((a, b) => a + b, 0);
    const open = poll.status === 'open';
    S('[data-pv-state]').textContent = open ? '投票进行中' : '投票已结束';
    S('[data-pv-state]').classList.toggle('is-open', open);
    S('[data-pv-count]').innerHTML = `已投 <b>${total}</b> 人${present ? ` ／ 今天在场 ${present} 人` : ''}`;
    S('[data-pv-q]').textContent = poll.question || '请在自己的页面上选择';
    S('[data-pv-bars]').innerHTML = poll.options.map((option, i) => {
      const pct = total ? Math.round((counts[i] / total) * 100) : 0;
      return `<div class="pv-bar" style="--c:${COLORS[i % COLORS.length]}"><b>${esc(option)}</b><div class="pv-track"><i class="pv-fill" style="width:${pct}%"></i></div><span class="pv-num">${counts[i]}<small>${pct}%</small></span></div>`;
    }).join('');
    const shown = !stage.classList.contains('is-hidden-result');
    const actions = open
      ? [[shown ? '隐藏结果' : '显示结果', 'toggle'], ['结束投票并公布结果', 'end', 'is-main'], ['结束（不公布）', 'end-quiet'], ['关闭大屏', 'hide']]
      : [['再投一次', 'again', 'is-main'], [shown ? '隐藏结果' : '显示结果', 'toggle'], ['关闭', 'hide']];
    S('[data-pv-actions]').innerHTML = actions.map(([text, act, cls]) => `<button type="button" data-pv-act="${act}" class="${cls || ''}">${text}</button>`).join('');
    S('[data-pv-note]').textContent = open ? '学生在自己页面上点选项，结束前可以改；各项人数先不显示，免得跟风。' : (poll.reveal ? '结果已公布到学生页（显示 3 分钟）。' : '结果没有公布到学生页。');
  }
  async function refresh() {
    if (!poll) return;
    try {
      votes = await backend.fetchAll('pollvotes', { poll: Number(poll.id) || poll.id });
      draw();
    } catch (error) { S('[data-pv-note]').textContent = `读取票数失败：${error.message || error}`; }
  }
  async function countPresent() {
    if (typeof window.ClassLiveStudents !== 'function') return;
    try { const live = await window.ClassLiveStudents(); present = live && live.today ? live.students.length : 0; draw(); } catch (error) { /* 读不到就不显示在场人数 */ }
  }
  function show() {
    stage.hidden = false;
    clearInterval(timer);
    clearInterval(presentTimer);
    timer = setInterval(() => { if (!document.hidden && !stage.hidden) refresh(); }, POLL.refresh || 2000);
    presentTimer = setInterval(() => { if (!document.hidden && !stage.hidden) countPresent(); }, 20000);
    refresh();
    countPresent();
  }
  function hide() {
    stage.hidden = true;
    clearInterval(timer);
    clearInterval(presentTimer);
  }
  const failText = (error) => {
    const text = String((error && error.message) || error || '');
    return /PGRST202|42883|Could not find the function|未知的后台函数/.test(text) ? '后台还没有“投票器”（数据库语句尚未执行）。'
      : /permission|42501|只有教师/.test(text) ? '请先在这个浏览器登录教师工作台，再刷新本页。' : text;
  };
  async function start(options, question) {
    if (options.length < 2) { hint('至少要有 2 个选项。'); return; }
    if (options.some((o) => o.length > 12)) { hint('每个选项最多 12 个字。'); return; }
    const button = $('[data-pv-go]');
    button.disabled = true;
    try {
      const room = await roomHere();
      if (!room) { hint('本页不是开放中的课堂：请从教师工作台的课堂卡片打开“课堂完整版”。'); return; }
      const row = await backend.rpc('ck_poll_open', { p_classroom: Number(room.id) || room.id, p_question: question || null, p_options: options });
      poll = Array.isArray(row) ? row[0] : row;
      votes = [];
      stage.classList.add('is-hidden-result');
      hint(`投票进行中：${options.join('／')}。`);
      show();
    } catch (error) {
      console.error(error);
      hint(`发起失败：${failText(error)}`);
    } finally {
      button.disabled = false;
    }
  }
  $('[data-pv-go]').addEventListener('click', () => start(optionsNow(), $('[data-pv-question]').value.trim()));
  $('[data-pv-last]').addEventListener('click', async () => {
    try {
      const room = await roomHere();
      if (!room) { hint('本页不是开放中的课堂。'); return; }
      const list = await backend.fetchAll('polls', { classroom: Number(room.id) || room.id });
      const last = list.sort((a, b) => Number(b.id) - Number(a.id))[0];
      if (!last) { hint('本课堂还没有投过票。'); return; }
      poll = last;
      stage.classList.toggle('is-hidden-result', last.status === 'open');
      show();
    } catch (error) { hint(`读取失败：${failText(error)}`); }
  });
  stage.addEventListener('click', async (event) => {
    if (event.target.closest('[data-pv-close]')) { hide(); return; }
    const act = event.target.closest('[data-pv-act]');
    if (!act || !poll) return;
    const what = act.dataset.pvAct;
    if (what === 'toggle') { stage.classList.toggle('is-hidden-result'); draw(); return; }
    if (what === 'hide') { hide(); return; }
    if (what === 'again') { start(poll.options.slice(), poll.question || ''); return; }
    if (what === 'end' || what === 'end-quiet') {
      try {
        const row = await backend.rpc('ck_poll_close', { p_poll: Number(poll.id) || poll.id, p_reveal: what === 'end' });
        poll = Array.isArray(row) ? row[0] : row;
        stage.classList.remove('is-hidden-result');
        await refresh();
        hint('投票已结束。');
      } catch (error) { S('[data-pv-note]').textContent = `结束失败：${failText(error)}`; }
    }
  });
  document.addEventListener('keydown', (event) => { if (!stage.hidden && event.key === 'Escape') hide(); });
})();
