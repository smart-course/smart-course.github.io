/* 辩论赛投屏页（习经课堂完整版、政经讲解版）：辩论赛卡片里的 [data-debate-board]。
 * 2026-10-28 用户：“设置辩论赛聊天室，正方反方都有各自的聊天室……”
 * 2026-11-05 用户：“两门课的辩论赛，取消3V3的环节，简化流程，现在只要1.选择立场、论据卡，2.进入聊天室发言，大家点赞，点赞最多的三位同学加5修为分，
 * 然后3.辩后投票，看大家支持哪一方，票数高的一方再加5修为分。”
 *   辩论流程图（放在卡片正文“辩论流程”的位置，投屏页上原来的静态流程隐藏）：① 选立场 · 论据卡（1 分钟）→ ② 聊天室发言点赞（3 分钟）→ ③ 辩后投票（1 分钟）
 *     → 停止递交 · 公布结果。当前一步高亮、倒计时（只在本机计时，存在本机，刷新不丢；可暂停、加 30 秒），点“下一步”或点流程图里的任一步推进。
 *   聊天室看板：全场点赞前三（“揭晓姓名”后显示姓名）、两方人数和发言数、两方热门发言（可隐藏不合适的发言）、辩后票数。
 *   辩后投票停止递交（流程图最后一步、辩后投票里的按钮，或投屏统计里的“停止递交”）后按票数判定胜负并加修为（ck_set_debate_winners）：
 *     全场点赞前三各加 5，票多一方聊天室里的同学各加 5（同一人相加）；平票由老师裁定（也可以判平局，只给点赞前三）；可改判、撤销。
 *     结果显示在“辩后投票”那一块的最后。
 * 需要在本机登录教师工作台（ck_debate_board、ck_set_debate_winners 只给教师）；看板每 4 秒刷新一次（页面在前台、在屏幕上时）。
 */
(function () {
  'use strict';
  const boards = Array.from(document.querySelectorAll('[data-debate-board]'));
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!boards.length || !window.ClassLive || config.provider === 'off') return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[辩论赛]', error.message); return; }
  const DB = window.ClassLive.DEBATE || { likes: 5, win: 5, top: 3 };
  const unit = config.unit || window.ClassLive.unitOf();
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SIDE = { pro: '正方', con: '反方' };
  const fmt = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
  const duration = (secs) => (secs >= 60 ? `${secs / 60} 分钟` : `${secs} 秒`);
  const problemText = (error) => {
    const text = String((error && error.message) || error);
    return /42501|只有教师|permission/.test(text) ? '请先在本机登录教师工作台。'
      : /PGRST202|42883|Could not find the function|未知的后台函数/.test(text) ? '辩论聊天室还没有开通（后台尚未更新）。' : '暂时读不到，稍后会自动重试。';
  };

  const style = document.createElement('style');
  style.textContent = `
  .dbb { border-radius: 14px; border: 1px solid rgba(70,51,34,.18); background: #fffdf8; box-shadow: 0 8px 22px rgba(70,51,34,.08); overflow: hidden; }
  .dbb-lead { padding: 12px 18px 14px; border-bottom: 1px solid rgba(70,51,34,.12); background: linear-gradient(180deg, #fffaf0, #fbf1da); }
  .dbb-lead h5 { margin: 0 0 8px; font-size: 14px; color: #8a5a1a; letter-spacing: .04em; }
  .dbb-lead ol { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .dbb-lead li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0 10px; padding: 8px 12px; border-radius: 12px; background: #fff; border: 1px solid rgba(184,134,43,.35); }
  .dbb-lead li > span { grid-row: span 2; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; font-weight: 800; font-size: 16px; }
  .dbb-lead li > b { font-size: 17px; line-height: 1.3; overflow-wrap: anywhere; }
  .dbb-lead li > small { grid-column: 2; color: #6d6259; font-size: 13px; } .dbb-lead li.is-pro > small i { color: #23655f; } .dbb-lead li.is-con > small i { color: #a4492d; }
  .dbb-lead li > small i { font-style: normal; font-weight: 800; }
  .dbb-lead li > em { grid-row: 1 / span 2; grid-column: 3; font-style: normal; color: #c0392b; font-weight: 800; font-size: 18px; white-space: nowrap; }
  .dbb-lead .dbb-empty { margin: 0; }
  .dbb-cols { display: grid; grid-template-columns: 1fr 1fr; }
  .dbb-side { padding: 14px 18px 16px; }
  .dbb-side + .dbb-side { border-left: 1px solid rgba(70,51,34,.12); }
  .dbb-side header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 10px; margin: -14px -18px 12px; padding: 10px 18px; color: #fff; background: #23655f; }
  .dbb-side.is-con header { background: #a4492d; }
  .dbb-side header b { font-size: 18px; letter-spacing: .08em; } .dbb-side header span { font-size: 14px; opacity: .9; }
  .dbb-side h5 { margin: 12px 0 6px; font-size: 14px; color: #8a5a1a; letter-spacing: .04em; }
  .dbb-hot { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dbb-hot li { display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px; border-radius: 9px; background: #fff; border: 1px solid rgba(70,51,34,.1); font-size: 15.5px; line-height: 1.55; }
  .dbb-hot li b { flex: 0 0 auto; color: #23655f; } .dbb-side.is-con .dbb-hot li b { color: #a4492d; } .dbb-hot li b small { margin-left: 4px; font-weight: 400; color: #8a7f74; }
  .dbb-hot li span { flex: 1 1 auto; word-break: break-word; } .dbb-hot em { font-style: normal; color: #c0392b; font-weight: 800; white-space: nowrap; }
  .dbb-hot button { flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: #9a8b7a; font-size: 16px; line-height: 1; cursor: pointer; }
  .dbb-hot button:hover { background: #f3e3dc; color: #a4492d; }
  .dbb-empty { color: #8a7f74; font-size: 14px; }
  .dbb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 18px; border-top: 1px solid rgba(70,51,34,.12); background: #f7f1e6; font-size: 15px; }
  .dbb-bar button { padding: 8px 14px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 9px; background: #fff; color: #201c18; font-weight: 800; font-size: 14px; line-height: 1.2; cursor: pointer; }
  .dbb-votes { font-weight: 800; color: #3b2a14; } .dbb-status { color: #6d6259; font-size: 14px; } .dbb-status.is-ok { color: #23655f; font-weight: 800; }
  [data-debate].has-dbf .debate-rules, [data-debate].has-dbf .cl-debate-rules { display: none; }
  .dbf { margin: 14px 0 18px; border-radius: 14px; border: 1px solid rgba(70,51,34,.18); background: #fffdf8; box-shadow: 0 8px 22px rgba(70,51,34,.08); overflow: hidden; }
  .dbf-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 18px; background: linear-gradient(180deg, #4a3a22, #3b2a14); color: #fff; }
  .dbf-tag { padding: 2px 10px; border-radius: 999px; background: #f6dc98; color: #3b2a07; font-size: 13px; font-weight: 800; letter-spacing: .1em; }
  .dbf-now { flex: 1 1 260px; display: grid; } .dbf-now b { font-size: 21px; letter-spacing: .06em; } .dbf-now small { font-size: 14px; opacity: .88; line-height: 1.5; }
  .dbf-clock { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .04em; line-height: 1; }
  .dbf-clock.is-low { color: #ffd38a; } .dbf-clock.is-up { color: #ffb59d; animation: dbf-blink 1s steps(2, start) infinite; }
  @keyframes dbf-blink { to { visibility: hidden; } }
  .dbf-nodes { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 0; padding: 16px 18px 12px; list-style: none; }
  .dbf-node { position: relative; }
  .dbf-node:not(:last-child)::after { content: "→"; position: absolute; right: -17px; top: 50%; transform: translateY(-50%); color: #b8862b; font-weight: 800; }
  .dbf-node button { display: grid; justify-items: start; gap: 2px; min-width: 128px; padding: 7px 12px 8px; border: 1.5px solid rgba(70,51,34,.18); border-radius: 12px;
    background: #f7f1e6; color: #4a3f36; font: inherit; text-align: left; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
  .dbf-node button:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(70,51,34,.12); }
  .dbf-node i { font-style: normal; font-size: 12px; font-weight: 800; color: #b8862b; }
  .dbf-node b { font-size: 15px; line-height: 1.35; } .dbf-node em { font-style: normal; font-size: 12.5px; color: #8a7f74; }
  .dbf-node.is-done button { background: #eef3ef; color: #7d8a83; } .dbf-node.is-done i { color: #23655f; }
  .dbf-node.is-next button { border-style: dashed; border-color: #b8862b; }
  .dbf-node.is-now button { border-color: #b8862b; background: linear-gradient(180deg, #fff6df, #f6e2ad); color: #3b2a07; box-shadow: 0 0 0 3px rgba(232,196,106,.55); animation: dbf-pulse 1.8s ease-in-out infinite; }
  @keyframes dbf-pulse { 50% { box-shadow: 0 0 0 6px rgba(232,196,106,.25); } }
  .dbf-bar { display: block; width: 100%; height: 5px; margin-top: 3px; border-radius: 3px; background: rgba(70,51,34,.12); overflow: hidden; }
  .dbf-bar > span { display: block; height: 100%; width: 100%; border-radius: 3px; background: #b8862b; transition: width 1s linear; }
  .dbf-ctrl { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 10px 18px 14px; border-top: 1px solid rgba(70,51,34,.1); background: #f7f1e6; }
  .dbf-ctrl button { padding: 9px 16px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 10px; background: #fff; color: #201c18; font-weight: 800; font-size: 15px; line-height: 1.2; cursor: pointer; }
  .dbf-ctrl button.is-main { border-color: #b8862b; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; font-size: 16px; }
  .dbf-tip { color: #8a7f74; font-size: 13.5px; }
  .dbr { margin-top: 12px; }
  .dbr-box { display: grid; gap: 8px; padding: 14px 18px; border-radius: 14px; border: 1.5px solid rgba(184,134,43,.45); background: linear-gradient(180deg, #fffaf0, #fbf1da); }
  .dbr-tag { justify-self: start; padding: 2px 10px; border-radius: 999px; background: #3b2a14; color: #f6dc98; font-size: 13px; font-weight: 800; letter-spacing: .1em; }
  .dbr-score { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; font-size: 18px; font-weight: 800; }
  .dbr-score .is-pro { color: #23655f; } .dbr-score .is-con { color: #a4492d; } .dbr-score b { font-size: 30px; font-variant-numeric: tabular-nums; } .dbr-score i { font-style: normal; color: #b8862b; }
  .dbr-win { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: .12em; color: #3b2a07; } .dbr-win.is-pro { color: #23655f; } .dbr-win.is-con { color: #a4492d; }
  .dbr-note { margin: 0; color: #4a3f36; font-size: 15px; line-height: 1.7; }
  .dbr-awards { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 15px; line-height: 1.6; color: #4a3f36; }
  .dbr-awards li::before { content: "✦ "; color: #b8862b; }
  .dbr details { font-size: 14px; color: #6d6259; } .dbr summary { cursor: pointer; color: #8a5a1a; font-weight: 800; } .dbr details p { margin: 6px 0 0; line-height: 1.8; }
  .dbr-acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .dbr-acts button { padding: 8px 14px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 9px; background: #fff; color: #201c18; font-weight: 800; font-size: 14px; line-height: 1.2; cursor: pointer; }
  .dbr-acts button.is-main { border-color: #b8862b; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; font-size: 15px; }
  .dbr-acts button.is-pro { border-color: #23655f; background: #23655f; color: #fff; } .dbr-acts button.is-con { border-color: #a4492d; background: #a4492d; color: #fff; }
  @media (prefers-reduced-motion: reduce) { .dbf-node.is-now button { animation: none; } }
  @media (max-width: 760px) {
    .dbf-nodes { gap: 8px 18px; padding: 12px; } .dbf-node button { min-width: 0; } .dbf-clock { font-size: 30px; }
    .dbb-lead ol { grid-template-columns: 1fr; }
    .dbb-cols { grid-template-columns: 1fr; } .dbb-side + .dbb-side { border-left: 0; border-top: 1px solid rgba(70,51,34,.12); }
  }
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

  // 辩论流程：三步都只在本机计时，最后一步停止辩后投票的递交、公布结果
  const FLOW = [
    { key: 'prep', label: '选立场 · 论据卡', secs: 60, hint: '学生投辩前票选好立场（投哪方就进哪方的聊天室），再选 2 张论据卡，都点“递交”' },
    { key: 'chat', label: '聊天室发言点赞', secs: 180, hint: `学生取昵称进本方聊天室发言、给本方的好发言点赞；全场点赞最多的 ${DB.top} 位同学各加 ${DB.likes} 修为` },
    { key: 'vote', label: '辩后投票', secs: 60, hint: '听了两方的观点，全班投辩后票：现在支持哪一方' },
    { key: 'result', label: '停止递交 · 公布结果', secs: 0, hint: `票多的一方聊天室里的同学各加 ${DB.win} 修为，点赞前三各加 ${DB.likes} 修为` },
  ];
  const flowIndex = (key) => FLOW.findIndex((step) => step.key === key);

  boards.forEach((board) => {
    const no = board.dataset.case;
    const section = board.closest('[data-debate]') || board.parentElement;
    // 辩后投票的题号：政经在作业里（debate.post，一个课堂一个案例），习经是“案例号:debate-post”
    const postKey = board.closest('.cl-debate') ? 'debate.post' : `${no}:debate-post`;
    let room = null;
    let data = null;       // ck_debate_board
    let last = '';
    let busy = false;
    let reveal = false;    // 看板和结果共用“揭晓姓名”
    let stopped = false;   // 辩后投票已停止递交
    let stopsAt = 0;
    let verdict = null;    // 判定结果 { side（pro / con / none）, pro, con, list, manual } / { tie } / { cleared } / { restored, list }

    // ---------- 流程图：插在正文“辩论流程”的位置 ----------
    const flow = document.createElement('div');
    flow.className = 'dbf';
    flow.setAttribute('data-ix', '');
    const rules = section.querySelector('.debate-rules, .cl-debate-rules');
    if (rules) rules.insertAdjacentElement('beforebegin', flow); else board.insertAdjacentElement('beforebegin', flow);
    section.classList.add('has-dbf');
    // ---------- 辩论结果：放在辩后投票那一块的最后 ----------
    const result = document.createElement('div');
    result.className = 'dbr';
    result.setAttribute('data-ix', '');
    const postBox = section.querySelector(`[data-vote-key="${no}:debate-post"], [data-debate-vote="post"]`);
    if (postBox) postBox.insertAdjacentElement('beforeend', result);

    board.innerHTML = '<div class="dbb"><div class="dbb-lead" data-dbb-lead></div><div class="dbb-cols"></div>'
      + '<div class="dbb-bar"><button type="button" data-dbb-reveal>揭晓姓名</button><span class="dbb-votes" data-dbb-votes></span>'
      + '<span class="dbb-status" data-dbb-status role="status"></span></div></div>';
    const status = (text, ok) => { const el = board.querySelector('[data-dbb-status]'); el.textContent = text || ''; el.classList.toggle('is-ok', Boolean(ok)); };
    const tally = () => ({ pro: ((data && data.pro) || {}).votes || 0, con: ((data && data.con) || {}).votes || 0 });
    const leaderName = (m) => `${esc(m.nick)}${reveal && m.name ? `（${esc(m.name)}）` : ''}`;

    // ---------- 本机计时 ----------
    const localKey = () => (room ? `classlive-debate-flow:${room.id}:${no}` : '');
    const readLocal = () => { try { const v = room ? JSON.parse(localStorage.getItem(localKey()) || 'null') : null; return v && flowIndex(v.key) >= 0 ? v : null; } catch (error) { return null; } };
    const writeLocal = (value) => { try { if (value) localStorage.setItem(localKey(), JSON.stringify(value)); else localStorage.removeItem(localKey()); } catch (error) { /* 忽略 */ } };
    const localLeft = (state) => (state.paused ? state.left : Math.max(0, Math.round((state.ends - Date.now()) / 1000)));
    function nowKey() {
      if (stopped) return 'result';
      const state = readLocal();
      return state ? state.key : '';
    }
    function nextStep() {
      const key = nowKey();
      if (!key) return FLOW[0];
      return key === 'result' ? null : FLOW[flowIndex(key) + 1] || null;
    }
    function clockOf() {
      const step = FLOW[flowIndex(nowKey())];
      if (!step || !step.secs) return null;
      const state = readLocal();
      return state ? { s: localLeft(state), paused: state.paused, total: state.total || step.secs } : null;
    }

    // ---------- 聊天室看板 ----------
    function renderBoard() {
      const lead = board.querySelector('[data-dbb-lead]');
      const cols = board.querySelector('.dbb-cols');
      if (!room) {
        lead.innerHTML = '';
        cols.innerHTML = '<p class="dbb-empty" style="padding:14px 18px">当前没有开放本案例的课堂：在教师工作台发布或打开“学生可进入”后，这里显示两方聊天室。</p>';
        board.querySelector('[data-dbb-votes]').textContent = '';
        return;
      }
      const leaders = (data && data.leaders) || [];
      lead.innerHTML = `<h5>全场点赞前三 · 各加 ${DB.likes} 修为</h5>${leaders.length
        ? `<ol>${leaders.map((m, i) => `<li class="is-${esc(m.side)}"><span>${i + 1}</span><b>${esc(m.nick)}</b><small><i>${SIDE[m.side] || ''}</i>${reveal && m.name ? ` · ${esc(m.name)}` : ''} · ${m.posts} 条发言</small><em>♥ ${m.likes}</em></li>`).join('')}</ol>`
        : '<p class="dbb-empty">还没有人被点赞。两方聊天室里的发言被点赞后，这里按点赞数排出前三（正反两方合起来算）。</p>'}`;
      cols.innerHTML = ['pro', 'con'].map((side) => {
        const d = (data && data[side]) || { members: 0, posts: 0, hot: [] };
        return `<section class="dbb-side is-${side}"><header><b>${SIDE[side]}聊天室</b><span>${d.members} 人 · ${d.posts} 条发言</span></header>
          <h5>热门发言</h5>${(d.hot || []).length ? `<ul class="dbb-hot">${d.hot.map((h) => `<li><b>${esc(h.nick)}${reveal && h.name ? `<small>${esc(h.name)}</small>` : ''}</b><span>${esc(h.text)}</span><em>♥ ${h.likes}</em><button type="button" data-dbb-hide="${esc(h.id)}" title="隐藏这条发言" aria-label="隐藏这条发言">×</button></li>`).join('')}</ul>` : '<p class="dbb-empty">还没有发言</p>'}</section>`;
      }).join('');
      board.querySelector('[data-dbb-reveal]').textContent = reveal ? '收起姓名' : '揭晓姓名';
      const t = tally();
      board.querySelector('[data-dbb-votes]').textContent = `辩后投票：正方 ${t.pro} 票 · 反方 ${t.con} 票`;
      const awarded = (data && data.awarded) || [];
      if (awarded.length) status(`今天已给 ${awarded.length} 位同学加辩论赛修为（共 ${awarded.reduce((s, a) => s + (Number(a.points) || 0), 0)}）。`, true);
      else if (!board.querySelector('[data-dbb-status]').textContent.startsWith('隐藏')) status('');
    }

    // ---------- 流程图 ----------
    function renderFlow() {
      const key = nowKey();
      const at = flowIndex(key);
      const step = FLOW[at];
      const next = nextStep();
      const clock = clockOf();
      const finished = key === 'result' && verdict && (verdict.side || verdict.restored);
      const nodes = FLOW.map((s, i) => {
        const state = at < 0 ? '' : i < at || (i === at && finished) ? 'is-done' : i === at ? 'is-now' : i === at + 1 ? 'is-next' : '';
        return `<li class="dbf-node ${state}"><button type="button" data-dbf-go="${s.key}" title="${esc(s.hint || '')}">`
          + `<i>${state === 'is-done' ? '✓' : i + 1}</i><b>${esc(s.label)}</b>${s.secs ? `<em>${duration(s.secs)}</em>` : ''}`
          + `${state === 'is-now' && s.secs ? '<span class="dbf-bar"><span data-dbf-bar></span></span>' : ''}</button></li>`;
      }).join('');
      const title = step ? step.label : '还没开始';
      const hint = !step ? `点“开始”：${FLOW[0].hint}（${duration(FLOW[0].secs)}）`
        : step.key === 'result' ? (verdict && verdict.side === 'none' ? '平局：只给点赞前三加了修为，见下面“辩后投票”里的结果'
          : verdict && verdict.side ? `${SIDE[verdict.side]}胜（${verdict.pro} : ${verdict.con}），见下面“辩后投票”里的结果`
            : verdict && verdict.tie ? '平票：请在下面“辩后投票”里裁定' : '辩后投票已停止递交，见下面“辩后投票”里的结果') : step.hint;
      flow.innerHTML = `<div class="dbf-head"><span class="dbf-tag">辩论流程</span><div class="dbf-now"><b>${esc(title)}</b><small>${esc(hint)}</small></div><span class="dbf-clock" data-dbf-clock></span></div>
        <ol class="dbf-nodes">${nodes}</ol>
        <div class="dbf-ctrl">${next ? `<button type="button" class="is-main" data-dbf-next>${key ? '下一步' : '开始'}：${esc(next.label)} ▶</button>` : ''}`
        + (clock ? `<button type="button" data-dbf-pause>${clock.paused ? '继续计时' : '暂停计时'}</button><button type="button" data-dbf-extend>+30 秒</button>` : '')
        + '<span class="dbf-tip">也可以直接点流程图里的任一步，跳到那一步重新计时。</span></div>';
      paintFlow();
    }
    function paintFlow() {
      const el = flow.querySelector('[data-dbf-clock]');
      if (!el) return;
      const clock = clockOf();
      el.textContent = !clock ? '' : clock.paused ? `${fmt(clock.s)} 暂停` : clock.s > 0 ? fmt(clock.s) : '时间到';
      el.classList.toggle('is-low', Boolean(clock && clock.s > 0 && clock.s <= 10 && !clock.paused));
      el.classList.toggle('is-up', Boolean(clock && clock.s === 0 && !clock.paused));
      const bar = flow.querySelector('[data-dbf-bar]');
      if (bar && clock) bar.style.width = `${Math.max(0, Math.min(100, Math.round(clock.s / Math.max(1, clock.total) * 100)))}%`;
    }
    async function setStop(stop) {
      const stops = window.ClassLive.stopList(await backend.rpc('ck_stop_item', { p_classroom: Number(room.id) || room.id, p_item: postKey, p_stop: stop }));
      stopped = stops.includes(postKey);
      document.dispatchEvent(new CustomEvent('classlive:stops', { detail: { source: 'debate', item: postKey, stops } }));
    }
    async function go(step, quiet) {
      if (!room) { window.alert('当前没有开放本案例的课堂：先在教师工作台发布或打开“学生可进入”。'); return; }
      if (step.key === 'result') { await finish(); return; }
      if (stopped) {
        if (!window.confirm(`辩后投票已经停止递交。回到“${step.label}”会重新开放辩后投票的递交（已加的修为先不动，再次公布结果时整份替换）。继续吗？`)) return;
        try { await setStop(false); } catch (error) { window.alert(`没有重新开放：${error.message || error}`); return; }
        verdict = null;
      } else if (!quiet && readLocal() && !window.confirm(`切到“${step.label}”并重新计时 ${duration(step.secs)}？`)) return;
      writeLocal({ key: step.key, ends: Date.now() + step.secs * 1000, paused: false, left: step.secs, total: step.secs });
      renderFlow();
      renderResult();
    }
    function pause() {
      const state = readLocal();
      if (!state || stopped) return;
      writeLocal(state.paused ? { ...state, paused: false, ends: Date.now() + state.left * 1000 } : { ...state, paused: true, left: localLeft(state) });
      renderFlow();
    }
    function extend() {
      const state = readLocal();
      if (!state || stopped) return;
      const step = FLOW[flowIndex(state.key)];
      writeLocal(state.paused ? { ...state, left: state.left + 30, total: (state.total || step.secs) + 30 }
        : { ...state, ends: Math.max(state.ends, Date.now()) + 30000, total: (state.total || step.secs) + 30 });
      renderFlow();
    }

    // ---------- 辩后投票：停止递交，按票数判定胜负并加修为 ----------
    async function decide(manual) {
      if (!room) return;
      try {
        await load(true);
        const { pro, con } = tally();
        const side = manual !== undefined ? manual : pro > con ? 'pro' : con > pro ? 'con' : null;
        if (manual === undefined && !side) {
          verdict = { tie: true, pro, con };
        } else {
          let list = await backend.rpc('ck_set_debate_winners', { p_classroom: Number(room.id) || room.id, p_case: no, p_side: side, p_points: DB.likes });
          list = Array.isArray(list) ? list : [];
          verdict = side ? { side, pro, con, list, manual: manual !== undefined } : { cleared: true, pro, con };
        }
        await load(true);
      } catch (error) {
        window.alert(`公布结果没有成功：${error.message || error}`);
      }
      renderResult();
      renderFlow();
    }
    async function finish() {
      if (!room) return;
      if (!stopped) {
        if (!window.confirm(`停止递交辩后票，按票数公布结果？\n· 全场点赞前三各加 ${DB.likes} 修为；\n· 票多的一方聊天室里的同学各加 ${DB.win} 修为（平票由你裁定）。`)) return;
        try { await setStop(true); } catch (error) { window.alert(`停止递交没有成功：${error.message || error}`); return; }
      }
      writeLocal({ key: 'result', ends: Date.now(), paused: false, left: 0, total: 0 });
      await decide();
    }
    function renderResult() {
      if (!postBox) return;
      if (!room) { result.innerHTML = ''; return; }
      const voting = nowKey() === 'vote';
      const t = verdict && verdict.pro != null ? { pro: verdict.pro, con: verdict.con } : tally();
      const score = `<div class="dbr-score"><span class="is-pro">正方 <b>${t.pro}</b> 票</span><i>:</i><span class="is-con">反方 <b>${t.con}</b> 票</span></div>`;
      const roll = (list) => (list && list.length
        ? `<details><summary>加修为名单（${list.length} 人）</summary><p>${list.map((a) => `${esc(a.name)} +${a.points}`).join('、')}</p></details>` : '');
      const awards = (v) => {
        const list = v.list || [];
        const top = list.filter((a) => a.top);
        const leaders = ((data && data.leaders) || []).filter((m) => top.some((a) => a.sid === m.sid));
        const topText = leaders.length ? leaders.map(leaderName).join('、') : top.map((a) => esc(a.name)).join('、');
        const win = list.filter((a) => a.win).length;
        const lines = [
          top.length ? `点赞前三：${topText} 各加 ${DB.likes} 修为` : '没有人被点赞（或点赞最多的不在点名册上），点赞前三没有加修为',
          v.side === 'none' ? '平局：两方都不加获胜修为' : win ? `${SIDE[v.side]}聊天室里的 ${win} 位同学各加 ${DB.win} 修为` : `${SIDE[v.side]}聊天室里没有点名册内的同学，获胜方没有加修为`,
        ];
        return `<ul class="dbr-awards">${lines.map((x) => `<li>${x}</li>`).join('')}</ul>${roll(list)}`;
      };
      const other = (side) => (side === 'pro' ? 'con' : 'pro');
      let body;
      if (verdict && verdict.side) {
        const won = verdict.side === 'none' ? '<p class="dbr-win">平局</p>' : `<p class="dbr-win is-${verdict.side}">${SIDE[verdict.side]}胜${verdict.manual ? '<small style="font-size:15px;letter-spacing:0;font-weight:400">（老师裁定）</small>' : ''}</p>`;
        body = won + awards(verdict) + '<div class="dbr-acts"><button type="button" data-dbr-undo>撤销加修为</button>'
          + (verdict.side === 'none' ? '<button type="button" class="is-pro" data-dbr-side="pro">改判正方胜</button><button type="button" class="is-con" data-dbr-side="con">改判反方胜</button>'
            : `<button type="button" data-dbr-side="${other(verdict.side)}">改判${SIDE[other(verdict.side)]}胜</button><button type="button" data-dbr-side="none">改判平局</button>`) + '</div>';
      } else if (verdict && verdict.restored) {
        body = `<p class="dbr-note">今天已给 ${verdict.list.length} 位同学加辩论赛修为。</p>${roll(verdict.list)}`
          + '<div class="dbr-acts"><button type="button" data-dbr-decide>按票数重新公布</button><button type="button" data-dbr-undo>撤销加修为</button></div>';
      } else if (verdict && verdict.tie) {
        body = '<p class="dbr-win">平票</p><p class="dbr-note">票数相同，请裁定：</p>'
          + '<div class="dbr-acts"><button type="button" class="is-pro" data-dbr-side="pro">判正方胜</button><button type="button" class="is-con" data-dbr-side="con">判反方胜</button>'
          + `<button type="button" data-dbr-side="none">平局（只给点赞前三加修为）</button></div>`;
      } else if (verdict && verdict.cleared) {
        body = '<p class="dbr-note">已撤销今天的辩论赛修为。</p><div class="dbr-acts"><button type="button" data-dbr-decide>按票数重新公布</button></div>';
      } else if (stopped) {
        body = '<p class="dbr-note">辩后投票已停止递交。</p><div class="dbr-acts"><button type="button" class="is-main" data-dbr-decide>按票数公布结果</button></div>';
      } else if (voting) {
        body = `<p class="dbr-note">学生正在投辩后票（票数每 4 秒更新）。点下面的按钮（或上面统计里的“停止递交”）停止递交后公布结果：票多的一方聊天室里的同学各加 ${DB.win} 修为，全场点赞前三各加 ${DB.likes} 修为。</p>`
          + '<div class="dbr-acts"><button type="button" class="is-main" data-dbr-finish>停止递交，公布结果</button></div>';
      } else {
        body = `<p class="dbr-note">流程走到“辩后投票”时这里显示票数；停止递交后公布结果：票多的一方聊天室里的同学各加 ${DB.win} 修为，全场点赞前三各加 ${DB.likes} 修为。</p>`;
      }
      result.innerHTML = `<div class="dbr-box"><span class="dbr-tag">辩论结果</span>${voting || stopped || verdict ? score : ''}${body}</div>`;
    }
    result.addEventListener('click', async (event) => {
      const t = event.target;
      if (t.closest('[data-dbr-finish]')) finish();
      else if (t.closest('[data-dbr-decide]')) decide();
      else if (t.closest('[data-dbr-side]')) {
        const side = t.closest('[data-dbr-side]').dataset.dbrSide;
        const text = side === 'none' ? `判平局：只给全场点赞前三各加 ${DB.likes} 修为？` : `判${SIDE[side]}获胜：${SIDE[side]}聊天室里的同学（点名册内）各加 ${DB.win} 修为，点赞前三各加 ${DB.likes} 修为？`;
        if (window.confirm(`${text}\n今天原来加的辩论赛修为会整份替换。`)) decide(side);
      } else if (t.closest('[data-dbr-undo]')) {
        if (window.confirm('撤销今天加的辩论赛修为（点赞前三和获胜方）？')) decide(null);
      }
    });
    // 投屏统计里点了辩后投票的“停止递交”：同样按票数公布结果；重新开放递交时回到“辩后投票”
    document.addEventListener('classlive:stops', (event) => {
      const detail = event.detail || {};
      if (detail.source === 'debate' || !Array.isArray(detail.stops)) return;
      const now = detail.stops.includes(postKey);
      const changed = now !== stopped && detail.item === postKey;
      stopped = now;
      if (changed && now) {
        writeLocal({ key: 'result', ends: Date.now(), paused: false, left: 0, total: 0 });
        decide();
      } else {
        if (changed && !now) { verdict = null; writeLocal({ key: 'vote', ends: Date.now() + FLOW[2].secs * 1000, paused: false, left: FLOW[2].secs, total: FLOW[2].secs }); }
        renderResult();
        renderFlow();
      }
    });

    async function load(force) {
      if (busy && !force) return;
      busy = true;
      try {
        room = await roomFor(no);
        if (room) {
          data = await rpcOne('ck_debate_board', { p_classroom: Number(room.id) || room.id, p_case: no });
          // 停止递交的状态：打开页面时、辩后投票前后各查一次（投屏统计里停止递交会另外通知）
          if (force || Date.now() - stopsAt > 15000 || ['vote', 'result'].includes(nowKey())) {
            stopsAt = Date.now();
            stopped = window.ClassLive.stopList(await backend.rpc('ck_stopped_items', { p_classroom: Number(room.id) || room.id })).includes(postKey);
          }
          // 刷新页面以后：已停止且今天已加过修为，还原结果
          if (stopped && !verdict && Array.isArray(data.awarded) && data.awarded.length) verdict = { restored: true, list: data.awarded };
        } else {
          data = null;
        }
        const key = JSON.stringify([data, reveal, Boolean(room), stopped, verdict && (verdict.side || verdict.tie || verdict.cleared || verdict.restored)]);
        if (force || key !== last) {
          last = key;
          renderBoard();
          renderFlow();
          renderResult();
        }
      } catch (error) {
        console.warn('[辩论赛]', error);
        board.querySelector('.dbb-cols').innerHTML = `<p class="dbb-empty" style="padding:14px 18px">${esc(problemText(error))}</p>`;
        last = '';
      } finally {
        busy = false;
      }
    }
    board.addEventListener('click', async (event) => {
      const revealButton = event.target.closest('[data-dbb-reveal]');
      const hide = event.target.closest('[data-dbb-hide]');
      if (revealButton) {
        reveal = !reveal;
        renderBoard();
        renderResult();
      } else if (hide) {
        if (!window.confirm('隐藏这条发言？学生的聊天室里也看不到了，它的点赞也不再计入。')) return;
        try { await backend.rpc('ck_debate_hide', { p_post: Number(hide.dataset.dbbHide) || hide.dataset.dbbHide, p_hidden: true }); load(true); }
        catch (error) { status(`隐藏失败：${error.message || error}`); }
      }
    });
    flow.addEventListener('click', (event) => {
      const t = event.target;
      if (t.closest('[data-dbf-next]')) { const n = nextStep(); if (n) go(n, true); }
      else if (t.closest('[data-dbf-pause]')) pause();
      else if (t.closest('[data-dbf-extend]')) extend();
      else if (t.closest('[data-dbf-go]')) { const step = FLOW[flowIndex(t.closest('[data-dbf-go]').dataset.dbfGo)]; if (step) go(step, false); }
    });
    renderFlow();
    renderResult();
    load(true);
    setInterval(paintFlow, 1000);
    setInterval(() => {
      if (document.hidden) return;
      const rect = section.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200 || section.closest('[hidden]')) return;
      load(false);
    }, 4000);
  });
})();
