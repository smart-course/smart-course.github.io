/* 辩论赛“聊天室看板”与“辩论台”（课堂完整版投屏页）：习经“辩论赛”卡片里的 [data-debate-board]、[data-debate-stage]。
 * 2026-10-28 用户：“设置辩论赛聊天室，正方反方都有各自的聊天室……每一方被点赞次数最多的三位同学上台辩论。辩论结束后，全班同学再进行投票，
 * 看大家支持哪一方。赢的那一方的三位同学可以获得相应的修为值。”
 * 2026-10-29 用户：“辩论赛，双方在选出得票最高的三个论点后，正方先抛出这三条，请反方的三位辩友在弹幕上进行反驳。然后正方再回答反方的观点或者问题。
 * 这里要再设置一个弹幕问答器只能由这6人来问答。同时要按照3v3辩论的标准设置相应的流程和计时器。”
 *   聊天室看板：两方人数、发言数、每方将入选的三个论点（每人一条，点赞最多的在前）、热门发言（可隐藏），“揭晓姓名”后显示昵称对应的姓名；
 *     点“选定论点与辩手”把三个论点和作者（一、二、三辩）定下来（ck_debate_control lock），之后点赞再变也不换人；
 *     辩后票数；投票结束点“正方胜”或“反方胜”给获胜方三位辩手各加修为（ck_set_debate_winners，再点另一方整份替换，“撤销”收回）。
 *   辩论台：阶段（DEBATE.stages：正方立论 → 反方质询 → 正方答辩 → 反方立论 → 正方质询 → 反方答辩 → 自由辩论 → 反方总结 → 正方总结 → 辩后投票）、
 *     倒计时（开始、暂停、继续、加 30 秒，可点阶段跳转），两方论点下按“针对①②③”挂上辩手的反驳与回应，自由辩论、总结单列；“打开辩论大屏”全屏投影。
 * 需要在本机登录教师工作台（ck_debate_board、ck_debate_control 只给教师）；看板每 5 秒、辩论台每 2 秒刷新一次（页面在前台、在屏幕上时）。
 */
(function () {
  'use strict';
  const boards = Array.from(document.querySelectorAll('[data-debate-board]'));
  const stagesEls = Array.from(document.querySelectorAll('[data-debate-stage]'));
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if ((!boards.length && !stagesEls.length) || !window.ClassLive || config.provider === 'off') return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[辩论赛]', error.message); return; }
  const DB = window.ClassLive.DEBATE || { points: 10, top: 3, stages: [] };
  const STAGES = DB.stages || [];
  const unit = config.unit || window.ClassLive.unitOf();
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SIDE = { pro: '正方', con: '反方' };
  const ROLE = { 1: '一辩', 2: '二辩', 3: '三辩' };
  const CIRCLE = ['', '①', '②', '③'];
  const fmt = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const stageOf = (key) => STAGES.find((g) => g.key === key) || null;
  const stageLabel = (key) => (key === 'ready' ? '已选定辩手' : key === 'done' ? '辩论结束' : (stageOf(key) || {}).label || '');
  const problemText = (error) => {
    const text = String((error && error.message) || error);
    return /42501|只有教师|permission/.test(text) ? '请先在本机登录教师工作台。'
      : /PGRST202|42883|Could not find the function|未知的后台函数/.test(text) ? '辩论台还没有开通（后台尚未更新）。' : '暂时读不到，稍后会自动重试。';
  };
  let reveal = false;   // 看板、辩论台、大屏共用“揭晓姓名”

  const style = document.createElement('style');
  style.textContent = `
  .dbb { border-radius: 14px; border: 1px solid rgba(70,51,34,.18); background: #fffdf8; box-shadow: 0 8px 22px rgba(70,51,34,.08); overflow: hidden; }
  .dbb-cols { display: grid; grid-template-columns: 1fr 1fr; }
  .dbb-side { padding: 14px 18px 16px; }
  .dbb-side + .dbb-side { border-left: 1px solid rgba(70,51,34,.12); }
  .dbb-side header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; margin: -14px -18px 12px; padding: 10px 18px; color: #fff; background: #23655f; }
  .dbb-side.is-con header { background: #a4492d; }
  .dbb-side header b { font-size: 18px; letter-spacing: .08em; } .dbb-side header span { font-size: 14px; opacity: .9; }
  .dbb-side h5 { margin: 12px 0 6px; font-size: 14px; color: #8a5a1a; letter-spacing: .04em; }
  .dbb-args { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dbb-args li { display: grid; gap: 2px; padding: 8px 12px; border-radius: 10px; background: linear-gradient(180deg, #fff6df, #f6e6bd); border: 1px solid rgba(184,134,43,.35); }
  .dbb-args li div { display: flex; align-items: baseline; gap: 8px; font-size: 14px; }
  .dbb-args li div span { font-size: 17px; font-weight: 800; color: #b8862b; } .dbb-args li div b { font-weight: 800; }
  .dbb-args li div small { color: #6d4a2e; } .dbb-args li div em { margin-left: auto; font-style: normal; color: #c0392b; font-weight: 800; white-space: nowrap; }
  .dbb-args li p { margin: 0; font-size: 16px; line-height: 1.55; }
  .dbb-hot { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dbb-hot li { display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px; border-radius: 9px; background: #fff; border: 1px solid rgba(70,51,34,.1); font-size: 15.5px; line-height: 1.55; }
  .dbb-hot li b { flex: 0 0 auto; color: #23655f; } .dbb-side.is-con .dbb-hot li b { color: #a4492d; }
  .dbb-hot li span { flex: 1 1 auto; word-break: break-word; } .dbb-hot em { font-style: normal; color: #c0392b; font-weight: 800; white-space: nowrap; }
  .dbb-hot button, .dbt-say button { flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: #9a8b7a; font-size: 16px; line-height: 1; cursor: pointer; }
  .dbb-hot button:hover, .dbt-say button:hover { background: #f3e3dc; color: #a4492d; }
  .dbb-empty { color: #8a7f74; font-size: 14px; }
  .dbb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 18px; border-top: 1px solid rgba(70,51,34,.12); background: #f7f1e6; font-size: 15px; }
  .dbb-bar button, .dbt-ctrl button { padding: 8px 14px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 9px; background: #fff; color: #201c18; font-weight: 800; font-size: 14px; line-height: 1.2; cursor: pointer; }
  .dbb-bar button.is-pro { border-color: #23655f; background: #23655f; color: #fff; } .dbb-bar button.is-con { border-color: #a4492d; background: #a4492d; color: #fff; }
  .dbb-bar button.is-main, .dbt-ctrl button.is-main { border-color: #b8862b; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; }
  .dbb-bar button[disabled], .dbt-ctrl button[disabled] { opacity: .5; cursor: default; }
  .dbb-votes { font-weight: 800; color: #3b2a14; } .dbb-status { color: #6d6259; font-size: 14px; } .dbb-status.is-ok { color: #23655f; font-weight: 800; }
  .dbt { border-radius: 14px; border: 1px solid rgba(70,51,34,.18); background: #fffdf8; box-shadow: 0 8px 22px rgba(70,51,34,.08); overflow: hidden; }
  .dbt-off { padding: 14px 18px; color: #6d6259; font-size: 15px; }
  .dbt-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 12px 18px; background: #3b3530; color: #fff; }
  .dbt.is-pro .dbt-head { background: linear-gradient(180deg, #2b7169, #23655f); } .dbt.is-con .dbt-head { background: linear-gradient(180deg, #b55536, #a4492d); }
  .dbt.is-both .dbt-head { background: linear-gradient(90deg, #23655f, #6b4b2a 50%, #a4492d); }
  .dbt-head > div { display: grid; } .dbt-head b { font-size: 20px; letter-spacing: .06em; } .dbt-head small { font-size: 14px; opacity: .9; }
  .dbt-clock { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .04em; line-height: 1; }
  .dbt-clock.is-low { color: #ffd38a; } .dbt-clock.is-up { color: #ffb59d; animation: dbt-blink 1s steps(2, start) infinite; }
  @keyframes dbt-blink { to { visibility: hidden; } }
  .dbt-flow { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 10px 18px; list-style: none; border-bottom: 1px solid rgba(70,51,34,.1); counter-reset: dbt; }
  .dbt-flow button { counter-increment: dbt; padding: 4px 10px; border: 1px solid rgba(70,51,34,.18); border-radius: 999px; background: #f2ece2; color: #6d6259; font-size: 13px; cursor: pointer; }
  .dbt-flow button::before { content: counter(dbt) " "; font-weight: 800; color: #b8862b; }
  .dbt-flow button.is-now { background: #3b2a07; border-color: #3b2a07; color: #f6dc98; font-weight: 800; } .dbt-flow button.is-done { opacity: .55; }
  .dbt-ctrl { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 18px; border-bottom: 1px solid rgba(70,51,34,.1); background: #f7f1e6; }
  .dbt-ctrl .dbt-hint { color: #6d6259; font-size: 14px; }
  .dbt-cols { display: grid; grid-template-columns: 1fr 1fr; }
  .dbt-cols > section { padding: 12px 18px 14px; } .dbt-cols > section + section { border-left: 1px solid rgba(70,51,34,.1); }
  .dbt h5 { margin: 0 0 8px; font-size: 14px; color: #8a5a1a; letter-spacing: .04em; }
  .dbt-args { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  .dbt-arg { padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(70,51,34,.12); background: #fff; }
  .dbt-arg.is-topic { box-shadow: 0 0 0 3px rgba(232,196,106,.75); }
  .dbt-arg-head { display: flex; align-items: baseline; gap: 8px; font-size: 14px; } .dbt-arg-head span { font-size: 20px; font-weight: 800; color: #23655f; }
  .dbt-arg.is-con .dbt-arg-head span { color: #a4492d; } .dbt-arg-head small { color: #8a7f74; } .dbt-arg-head em { margin-left: auto; font-style: normal; color: #c0392b; font-weight: 800; }
  .dbt-arg > p { margin: 4px 0 0; font-size: 17px; line-height: 1.6; }
  .dbt-thread { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dbt-say { display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px; border-radius: 9px; border-left: 4px solid #23655f; background: #eef6f3; font-size: 16px; line-height: 1.55; }
  .dbt-say.is-con { border-left-color: #a4492d; background: #fbeee6; }
  .dbt-say > div { flex: 1 1 auto; display: grid; } .dbt-say b { font-size: 13px; color: #23655f; } .dbt-say.is-con b { color: #a4492d; }
  .dbt-say b small { margin-left: 5px; font-weight: 400; color: #8a7f74; } .dbt-say.is-new { animation: dbt-in .6s ease; }
  @keyframes dbt-in { from { opacity: 0; transform: translateY(6px); } }
  .dbt-general { padding: 12px 18px; border-top: 1px solid rgba(70,51,34,.1); }
  .dbt-empty { color: #8a7f74; font-size: 14px; }
  .dbx { position: fixed; inset: 0; z-index: 2147482900; display: flex; flex-direction: column; overflow: hidden; color: #fff; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: radial-gradient(circle at 15% 0%, rgba(35,101,95,.55), transparent 45%), radial-gradient(circle at 85% 0%, rgba(164,73,45,.5), transparent 45%), #191612; }
  .dbx[hidden] { display: none; }
  .dbx-top { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 2.2vh 3vw 1.4vh; }
  .dbx-motion { font-size: clamp(16px, 1.6vw, 24px); color: rgba(255,255,255,.82); line-height: 1.4; }
  .dbx-stage { text-align: center; } .dbx-stage b { display: block; font-size: clamp(26px, 3vw, 46px); letter-spacing: .1em; } .dbx-stage small { font-size: clamp(14px, 1.3vw, 20px); color: rgba(255,255,255,.75); }
  .dbx-clock { justify-self: end; font-size: clamp(44px, 6vw, 96px); font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1; }
  .dbx-clock.is-low { color: #ffd38a; } .dbx-clock.is-up { color: #ffb59d; animation: dbt-blink 1s steps(2, start) infinite; }
  .dbx-flow { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin: 0 3vw; padding: 0; list-style: none; }
  .dbx-flow li { padding: 3px 12px; border-radius: 999px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.6); font-size: clamp(12px, 1vw, 15px); }
  .dbx-flow li.is-now { background: #f6dc98; color: #3b2a07; font-weight: 800; } .dbx-flow li.is-done { opacity: .5; }
  .dbx-cols { flex: 1 1 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 2vw; min-height: 0; padding: 2vh 3vw; }
  .dbx-col { display: flex; flex-direction: column; min-height: 0; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); }
  .dbx-col.is-turn { border-color: #f6dc98; box-shadow: 0 0 0 2px rgba(246,220,152,.5), 0 0 40px rgba(246,220,152,.15); }
  .dbx-col h3 { margin: 0; padding: 1.2vh 1.4vw; border-radius: 18px 18px 0 0; font-size: clamp(18px, 1.8vw, 28px); letter-spacing: .12em; background: #23655f; }
  .dbx-col.is-con h3 { background: #a4492d; }
  .dbx-scroll { flex: 1 1 auto; overflow-y: auto; padding: 1.4vh 1.2vw; display: grid; align-content: start; gap: 1.4vh; }
  .dbx .dbt-arg { background: rgba(255,255,255,.96); color: #201c18; } .dbx .dbt-arg > p { font-size: clamp(16px, 1.45vw, 23px); }
  .dbx .dbt-arg.is-topic { box-shadow: 0 0 0 3px #f6dc98; } .dbx .dbt-say { color: #201c18; font-size: clamp(15px, 1.3vw, 21px); }
  .dbx-general { margin: 0 3vw; max-height: 22vh; overflow-y: auto; }
  .dbx-general:empty { display: none; }
  .dbx-ctrl { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 1.4vh 3vw 2.2vh; }
  .dbx-ctrl button { padding: 10px 18px; border: 1.5px solid rgba(255,255,255,.4); border-radius: 12px; background: rgba(255,255,255,.1); color: #fff; font-weight: 800; font-size: clamp(14px, 1.2vw, 18px); line-height: 1.2; cursor: pointer; }
  .dbx-ctrl button.is-main { border-color: #e8c46a; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; }
  .dbx-ctrl button[disabled] { opacity: .45; cursor: default; }
  @media (max-width: 760px) { .dbb-cols, .dbt-cols { grid-template-columns: 1fr; } .dbb-side + .dbb-side, .dbt-cols > section + section { border-left: 0; border-top: 1px solid rgba(70,51,34,.12); } }
  `;
  document.head.appendChild(style);

  const roomFor = async (no) => {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const room = window.ClassLive.pickRoom(rooms, config.course, unit);
    if (!room || room.chapter !== unit) return null;
    if (room.case_no && Number(room.case_no) !== Number(no)) return null;
    return room;
  };
  const rpcOne = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
  // 同一案例的看板和辩论台互相通知（选定辩手、切换阶段后马上刷新另一个）
  const listeners = new Map();
  const notify = (no) => (listeners.get(no) || []).forEach((fn) => fn());
  const listen = (no, fn) => listeners.set(no, (listeners.get(no) || []).concat(fn));

  // ---------- 聊天室看板 ----------
  boards.forEach((board) => {
    const no = board.dataset.case;
    let room = null;
    let last = '';
    let busy = false;
    let locked = false;
    board.innerHTML = '<div class="dbb"><div class="dbb-cols"><section class="dbb-side is-pro" data-dbb-side="pro"></section><section class="dbb-side is-con" data-dbb-side="con"></section></div>'
      + '<div class="dbb-bar"><button type="button" class="is-main" data-dbb-lock>选定论点与辩手</button><button type="button" data-dbb-reveal>揭晓姓名</button><span class="dbb-votes" data-dbb-votes></span>'
      + `<button type="button" class="is-pro" data-dbb-win="pro">正方胜：三位辩手各 +${DB.points} 修为</button><button type="button" class="is-con" data-dbb-win="con">反方胜：三位辩手各 +${DB.points} 修为</button>`
      + '<button type="button" data-dbb-win="">撤销加修为</button><span class="dbb-status" data-dbb-status role="status"></span></div></div>';
    const status = (text, ok) => { const el = board.querySelector('[data-dbb-status]'); el.textContent = text || ''; el.classList.toggle('is-ok', Boolean(ok)); };
    const sideHtml = (side, data) => {
      const args = data.args || [];
      return `<header><b>${SIDE[side]}聊天室</b><span>${data.members} 人 · ${data.posts} 条发言</span></header>
        <h5>${locked ? '入选论点（点“重新选定”会按现在的点赞重选）' : `将入选的论点（每人一条，点赞最多的 ${DB.top} 个）`}</h5>
        ${args.length ? `<ol class="dbb-args">${args.map((a) => `<li><div><span>${CIRCLE[a.n]}</span><b>${ROLE[a.n]} · ${esc(a.nick)}</b>${reveal ? `<small>${esc(a.name)}</small>` : ''}<em>♥ ${a.likes}</em></div><p>${esc(a.text)}</p></li>`).join('')}</ol>` : '<p class="dbb-empty">还没有人发言。</p>'}
        <h5>热门发言</h5>${(data.hot || []).length ? `<ul class="dbb-hot">${data.hot.map((h) => `<li><b>${esc(h.nick)}</b><span>${esc(h.text)}</span><em>♥ ${h.likes}</em><button type="button" data-dbb-hide="${esc(h.id)}" title="隐藏这条发言（${esc(h.name || '')}）" aria-label="隐藏这条发言">×</button></li>`).join('')}</ul>` : '<p class="dbb-empty">—</p>'}`;
    };
    async function load(force) {
      if (busy) return;
      busy = true;
      try {
        room = await roomFor(no);
        if (!room) { board.querySelector('.dbb-cols').innerHTML = '<p class="dbb-empty" style="padding:14px 18px">当前没有开放本案例的课堂：在教师工作台发布或打开“学生可进入”后，这里显示两方聊天室。</p>'; last = ''; return; }
        let data = await backend.rpc('ck_debate_board', { p_classroom: Number(room.id) || room.id, p_case: no });
        data = (Array.isArray(data) ? data[0] : data) || {};
        const live = await rpcOne('ck_debate_live', { p_classroom: Number(room.id) || room.id, p_case: no });
        locked = live.status === 'ok';
        if (locked) ['pro', 'con'].forEach((side) => { if (data[side]) data[side].args = live.args[side] || []; });
        const key = JSON.stringify([data, reveal, locked]);
        if (!force && key === last) return;
        last = key;
        const cols = board.querySelector('.dbb-cols');
        if (!cols.querySelector('[data-dbb-side]')) cols.innerHTML = '<section class="dbb-side is-pro" data-dbb-side="pro"></section><section class="dbb-side is-con" data-dbb-side="con"></section>';
        ['pro', 'con'].forEach((side) => { board.querySelector(`[data-dbb-side="${side}"]`).innerHTML = sideHtml(side, data[side] || { members: 0, posts: 0, args: [], hot: [] }); });
        board.querySelector('[data-dbb-lock]').textContent = locked ? '重新选定论点与辩手' : '选定论点与辩手';
        board.querySelector('[data-dbb-reveal]').textContent = reveal ? '收起姓名' : '揭晓姓名';
        board.querySelector('[data-dbb-votes]').textContent = `辩后投票：正方 ${(data.pro || {}).votes || 0} 票 · 反方 ${(data.con || {}).votes || 0} 票`;
        const awarded = data.awarded || [];
        if (awarded.length) status(`今天已给 ${awarded.map((a) => a.name).join('、')} 各加 ${awarded[0].points} 修为。`, true);
        else if (!board.querySelector('[data-dbb-status]').textContent.startsWith('请')) status('');
      } catch (error) {
        console.warn('[聊天室看板]', error);
        board.querySelector('.dbb-cols').innerHTML = `<p class="dbb-empty" style="padding:14px 18px">${esc(problemText(error))}</p>`;
        last = '';
      } finally {
        busy = false;
      }
    }
    listen(no, () => load(true));
    board.addEventListener('click', async (event) => {
      const lockButton = event.target.closest('[data-dbb-lock]');
      const revealButton = event.target.closest('[data-dbb-reveal]');
      const win = event.target.closest('[data-dbb-win]');
      const hide = event.target.closest('[data-dbb-hide]');
      if (lockButton && room) {
        if (!window.confirm(locked ? '按现在的点赞重新选定论点与辩手？辩论台上已有的发言会清空，阶段回到开始前。' : `选定两方各 ${DB.top} 个论点（每人一条、点赞最多的在前），作者担任一、二、三辩？选定后点赞再变也不换人。`)) return;
        lockButton.disabled = true;
        try { await backend.rpc('ck_debate_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_action: 'lock' }); status('已选定论点与辩手：在下面的“辩论台”开始第一阶段。', true); notify(no); }
        catch (error) { status(`没有选定：${error.message || error}`); } finally { lockButton.disabled = false; }
      } else if (revealButton) {
        reveal = !reveal;
        notify(no);
      } else if (hide) {
        if (!window.confirm('隐藏这条发言？学生的聊天室里也看不到了，点赞也不再计入。')) return;
        try { await backend.rpc('ck_debate_hide', { p_post: Number(hide.dataset.dbbHide) || hide.dataset.dbbHide, p_hidden: true }); load(true); }
        catch (error) { status(`隐藏失败：${error.message || error}`); }
      } else if (win && room) {
        const side = win.dataset.dbbWin || null;
        const tip = side ? `${SIDE[side]}获胜：给${SIDE[side]}${locked ? '三位辩手' : `点赞最多的 ${DB.top} 位`}（点名册内）各加 ${DB.points} 修为？\n再点另一方会整份替换。` : '撤销今天已经给辩手加的修为？';
        if (!window.confirm(tip)) return;
        win.disabled = true;
        try {
          let list = await backend.rpc('ck_set_debate_winners', { p_classroom: Number(room.id) || room.id, p_case: no, p_side: side, p_points: DB.points });
          list = Array.isArray(list) ? list : [];
          status(side ? (list.length ? `已给 ${list.map((a) => a.name).join('、')} 各加 ${DB.points} 修为。` : `${SIDE[side]}没有点名册内的辩手，没有加修为。`) : '已撤销。', true);
          load(true);
        } catch (error) {
          status(`加修为失败：${error.message || error}`);
        } finally {
          win.disabled = false;
        }
      }
    });
    load(true);
    setInterval(() => {
      if (document.hidden) return;
      const rect = board.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200 || board.closest('[hidden]')) return;
      load(false);
    }, 5000);
  });

  // ---------- 辩论台（卡片里的主持面板 + 全屏大屏） ----------
  stagesEls.forEach((holder) => {
    const no = holder.dataset.case;
    const motion = ((holder.closest('[data-debate]') || document).querySelector('.interaction-heading h3') || {}).textContent || '';
    let room = null;
    let live = null;
    let fetchedAt = 0;
    let last = '';
    let busy = false;
    let seen = new Set();
    const big = document.createElement('div');
    big.className = 'dbx';
    big.hidden = true;
    big.setAttribute('role', 'dialog');
    big.setAttribute('aria-label', '辩论大屏');
    document.body.appendChild(big);
    const left = () => (live && live.status === 'ok' ? (live.paused ? live.left : Math.max(0, live.left - Math.floor((Date.now() - fetchedAt) / 1000))) : 0);
    const index = () => STAGES.findIndex((g) => g.key === (live && live.stage));
    const nextStage = () => (live.stage === 'ready' ? STAGES[0] : live.stage === 'vote' ? { key: 'done', secs: 0 } : STAGES[index() + 1] || null);
    const prevStage = () => (index() > 0 ? STAGES[index() - 1] : live.stage === 'done' ? STAGES[STAGES.length - 1] : null);
    const sayRow = (s) => `<li class="dbt-say is-${esc(s.side)}${seen.has(s.id) ? '' : ' is-new'}"><div><b>${SIDE[s.side]}${ROLE[s.role] || ''}<small>${esc(s.nick)}${reveal && s.name ? ` · ${esc(s.name)}` : ''}</small></b><span>${esc(s.text)}</span></div><button type="button" data-dbt-hide="${esc(s.id)}" title="隐藏这条发言" aria-label="隐藏这条发言">×</button></li>`;
    const argCard = (side, a) => {
      const thread = (live.says || []).filter((s) => s.target === a.n && STAGES.some((g) => g.key === s.stage && g.topic === side));
      return `<li class="dbt-arg is-${side}${live.topic === side ? ' is-topic' : ''}"><div class="dbt-arg-head"><span>${CIRCLE[a.n]}</span><b>${SIDE[side]}${ROLE[a.n]}</b><small>${esc(a.nick)}${reveal && a.name ? ` · ${esc(a.name)}` : ''}</small><em>♥ ${a.likes}</em></div>
        <p>${esc(a.text)}</p>${thread.length ? `<ul class="dbt-thread">${thread.map(sayRow).join('')}</ul>` : ''}</li>`;
    };
    const turnText = () => {
      const g = stageOf(live.stage);
      if (g && g.turn) return `${g.turn === 'both' ? '双方辩手都可以发言' : `轮到${SIDE[g.turn]}辩手发言`} · ${g.hint}`;
      return live.stage === 'vote' ? '全班根据六位辩手的发言投辩后票' : live.stage === 'done' ? '在上面的看板给获胜方三位辩手加修为，再展开“裁判点评”' : '点“开始：正方立论”开始第一阶段';
    };
    const controls = (cls) => {
      const next = nextStage();
      const g = stageOf(live.stage);
      const timed = g && g.secs;
      return `<button type="button" data-dbt-prev${prevStage() ? '' : ' disabled'}>◀ 上一阶段</button>`
        + (next ? `<button type="button" class="is-main" data-dbt-next>${live.stage === 'ready' ? '开始' : '下一阶段'}：${esc(next.key === 'done' ? '结束辩论' : next.label)} ▶</button>` : '')
        + (next && next.optional ? `<button type="button" data-dbt-skip>跳过${esc(next.label)}</button>` : '')
        + (timed ? `<button type="button" data-dbt-pause>${live.paused ? '继续计时' : '暂停计时'}</button><button type="button" data-dbt-extend>+30 秒</button>` : '')
        + `<button type="button" data-dbt-reveal>${reveal ? '收起姓名' : '揭晓姓名'}</button>`
        + (cls === 'big' ? '<button type="button" data-dbt-close>关闭大屏</button>' : '<button type="button" data-dbt-open>打开辩论大屏</button><button type="button" data-dbt-reset>清空辩论台</button>');
    };
    function paintClock() {
      const s = left();
      const g = live && live.status === 'ok' ? stageOf(live.stage) : null;
      const text = !g || !g.secs ? '' : live.paused ? `${fmt(s)} 暂停` : s > 0 ? fmt(s) : '时间到';
      holder.querySelectorAll('[data-dbt-clock]').forEach((el) => { el.textContent = text; el.classList.toggle('is-low', s > 0 && s <= 10 && !live.paused); el.classList.toggle('is-up', Boolean(g && g.secs) && s === 0 && !live.paused); });
      big.querySelectorAll('[data-dbt-clock]').forEach((el) => { el.textContent = text; el.classList.toggle('is-low', s > 0 && s <= 10 && !live.paused); el.classList.toggle('is-up', Boolean(g && g.secs) && s === 0 && !live.paused); });
    }
    function render() {
      if (!room) { holder.innerHTML = '<div class="dbt"><p class="dbt-off">当前没有开放本案例的课堂：在教师工作台发布或打开“学生可进入”后，这里主持 3v3 辩论。</p></div>'; big.hidden = true; return; }
      if (!live || live.status !== 'ok') {
        holder.innerHTML = `<div class="dbt"><p class="dbt-off">在上面的聊天室看板点“选定论点与辩手”后，这里主持 3v3 辩论：${STAGES.map((g) => `${esc(g.label)} ${g.secs >= 60 ? `${g.secs / 60} 分钟` : `${g.secs} 秒`}`).join(' → ')}。只有六位辩手能在辩论台发言。</p></div>`;
        big.hidden = true;
        return;
      }
      const g = stageOf(live.stage);
      const cls = g && g.turn ? g.turn : 'none';
      const flowButtons = STAGES.map((x, i) => `<button type="button" data-dbt-go="${x.key}" class="${x.key === live.stage ? 'is-now' : index() > i || live.stage === 'done' ? 'is-done' : ''}" title="切到这一阶段（重新计时）">${esc(x.label)}</button>`).join('');
      const general = (live.says || []).filter((s) => !s.target);
      const cols = ['pro', 'con'].map((side) => `<section><h5>${SIDE[side]}论点</h5><ol class="dbt-args">${(live.args[side] || []).map((a) => argCard(side, a)).join('') || `<li class="dbt-empty">${SIDE[side]}没有入选的论点</li>`}</ol></section>`).join('');
      holder.innerHTML = `<div class="dbt is-${cls}">
        <header class="dbt-head"><div><b>${esc(stageLabel(live.stage))}</b><small>${esc(turnText())}</small></div><span class="dbt-clock" data-dbt-clock></span></header>
        <div class="dbt-flow">${flowButtons}</div>
        <div class="dbt-ctrl">${controls('card')}</div>
        <div class="dbt-cols">${cols}</div>
        ${general.length ? `<div class="dbt-general"><h5>自由辩论与总结陈词</h5><ul class="dbt-thread">${general.map(sayRow).join('')}</ul></div>` : ''}</div>`;
      big.innerHTML = `<div class="dbx-top"><div class="dbx-motion">${esc(motion)}</div><div class="dbx-stage"><b>${esc(stageLabel(live.stage))}</b><small>${esc(turnText())}</small></div><div class="dbx-clock" data-dbt-clock></div></div>
        <ol class="dbx-flow">${STAGES.map((x, i) => `<li class="${x.key === live.stage ? 'is-now' : index() > i || live.stage === 'done' ? 'is-done' : ''}">${esc(x.label)}</li>`).join('')}</ol>
        <div class="dbx-cols">${['pro', 'con'].map((side) => `<div class="dbx-col is-${side}${g && (g.turn === side || g.turn === 'both') ? ' is-turn' : ''}"><h3>${SIDE[side]}</h3><div class="dbx-scroll"><ol class="dbt-args">${(live.args[side] || []).map((a) => argCard(side, a)).join('')}</ol></div></div>`).join('')}</div>
        <div class="dbx-general">${general.length ? `<ul class="dbt-thread">${general.slice(-6).map(sayRow).join('')}</ul>` : ''}</div>
        <div class="dbx-ctrl">${controls('big')}</div>`;
      (live.says || []).forEach((s) => seen.add(s.id));
      paintClock();
    }
    async function load(force) {
      if (busy) return;
      busy = true;
      try {
        room = await roomFor(no);
        live = room ? await rpcOne('ck_debate_live', { p_classroom: Number(room.id) || room.id, p_case: no }) : null;
        fetchedAt = Date.now();
        const key = JSON.stringify([live && { ...live, left: undefined }, reveal, Boolean(room)]);
        if (force || key !== last) { last = key; render(); }
      } catch (error) {
        console.warn('[辩论台]', error);
        holder.innerHTML = `<div class="dbt"><p class="dbt-off">${esc(problemText(error))}</p></div>`;
        last = '';
      } finally {
        busy = false;
      }
    }
    async function control(action, stage, secs) {
      if (!room) return;
      try {
        live = await rpcOne('ck_debate_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_action: action, p_stage: stage || null, p_secs: secs == null ? null : secs });
        fetchedAt = Date.now();
        last = '';
        render();
        notify(no);
      } catch (error) {
        window.alert(`没有成功：${error.message || error}`);
      }
    }
    const onClick = (event) => {
      const t = event.target;
      if (t.closest('[data-dbt-next]')) { const n = nextStage(); if (n) control('stage', n.key, n.secs || 0); }
      else if (t.closest('[data-dbt-skip]')) { const n = nextStage(); const after = n && STAGES[STAGES.findIndex((g) => g.key === n.key) + 1]; if (after) control('stage', after.key, after.secs || 0); }
      else if (t.closest('[data-dbt-prev]')) { const p = prevStage(); if (p) control('stage', p.key, p.secs || 0); }
      else if (t.closest('[data-dbt-go]')) { const g = stageOf(t.closest('[data-dbt-go]').dataset.dbtGo); if (g && window.confirm(`切到“${g.label}”并重新计时 ${fmt(g.secs)}？`)) control('stage', g.key, g.secs); }
      else if (t.closest('[data-dbt-pause]')) control(live.paused ? 'resume' : 'pause');
      else if (t.closest('[data-dbt-extend]')) control('extend', null, 30);
      else if (t.closest('[data-dbt-reveal]')) { reveal = !reveal; notify(no); }
      else if (t.closest('[data-dbt-open]')) { big.hidden = false; render(); }
      else if (t.closest('[data-dbt-close]')) big.hidden = true;
      else if (t.closest('[data-dbt-reset]')) { if (window.confirm('清空辩论台？入选的论点、辩手名单和辩论台上的发言都会删掉，聊天室不受影响。')) control('reset'); }
      else if (t.closest('[data-dbt-hide]')) {
        const id = t.closest('[data-dbt-hide]').dataset.dbtHide;
        if (window.confirm('隐藏这条辩论台发言？学生页和大屏都不再显示。')) backend.rpc('ck_debate_hide_say', { p_id: Number(id) || id, p_hidden: true }).then(() => load(true)).catch((error) => window.alert(`隐藏失败：${error.message || error}`));
      }
    };
    holder.addEventListener('click', onClick);
    big.addEventListener('click', onClick);
    document.addEventListener('keydown', (event) => { if (!big.hidden && event.key === 'Escape') big.hidden = true; });
    listen(no, () => load(true));
    load(true);
    setInterval(paintClock, 1000);
    setInterval(() => {
      if (document.hidden) return;
      const rect = holder.getBoundingClientRect();
      if (big.hidden && (rect.bottom < -200 || rect.top > window.innerHeight + 200 || holder.closest('[hidden]'))) return;
      load(false);
    }, 2000);
  });
})();
