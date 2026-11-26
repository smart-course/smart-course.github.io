/* 辩论赛投屏页（习经课堂完整版、政经讲解版）：辩论赛卡片里的 [data-debate-board]。
 * 2026-10-28 用户：“设置辩论赛聊天室，正方反方都有各自的聊天室……”
 * 2026-11-05 用户：“两门课的辩论赛，取消3V3的环节，简化流程，现在只要1.选择立场、论据卡，2.进入聊天室发言，大家点赞，点赞最多的三位同学加5修为分，
 * 然后3.辩后投票，看大家支持哪一方，票数高的一方再加5修为分。”
 *   辩论流程图（放在卡片正文“辩论流程”的位置，投屏页上原来的静态流程隐藏）：① 选立场 · 论据卡（1 分钟）→ ② 聊天室发言点赞（3 分钟）→ ③ 辩后投票（1 分钟）
 *     → 停止递交 · 公布结果。当前一步高亮、倒计时（只在本机计时，存在本机，刷新不丢；可暂停、加 30 秒），点“下一步”或点流程图里的任一步推进。
 *   聊天室看板：全场点赞前三（“揭晓姓名”后显示姓名）、正反两方各一间聊天室、辩后票数。
 *     2026-11-21 用户：“教师版聊天室的样子跟学生版的一样吧，也能显示加入的人。”——两间聊天室的样子照学生页（ClassLive.chatRoom，live-core.js）：
 *     左边成员名单（谁进来了、在线的小绿点、被点赞数和发言数），右边消息气泡（按发布时间固定排列，旧的在上、新的接在下面，在列表里上下滑动）；
 *     每条发言后面的“×”可以隐藏不合适的发言。成员名单读 ck_debate_members、在线状态读 ck_presence（教师可读），没有新的后台函数。
 *   辩后投票停止递交（流程图最后一步、辩后投票里的按钮，或投屏统计里的“停止递交”）后按票数公布哪一方获胜（平票就是平票），
 *     给全场点赞前三各加 5 修为（ck_set_debate_winners）；可撤销、按票数重新公布。
 *     2026-11-21 用户：“辩论赛，只有全场点赞最多的三位同学加分，胜利方不加分。这样可以避免有的同学看哪方人数最多而选择那一方，从而获胜。”
 *     ——获胜方不再加修为，也就不用老师裁定平票、改判。
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
  const DB = window.ClassLive.DEBATE || { likes: 5, win: 0, top: 3 };
  const CR = window.ClassLive.chatRoom;   // 聊天室的样子和成员名单（live-core.js，三种聊天室共用）
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
  .dbb-cols > .dbb-empty { grid-column: 1 / -1; margin: 0; padding: 2px 6px; }
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
  /* 2026-11-26 五步加“公布结果”共六个节点：宽屏上排成一行（原来第六个换到下一行） */
  @media (min-width: 900px) { .dbf-nodes { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px 20px; } .dbf-node button { width: 100%; min-width: 0; height: 100%; } }
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
  .dbf-sync { flex: 1 1 100%; color: #a4492d; font-size: 13.5px; font-weight: 800; } .dbf-sync[hidden] { display: none; }
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

  // 辩论流程：前几步计时（同步到学生页），最后一步停止辩后投票的递交、公布结果
  // 2026-11-20 用户：“在聊天室发言点赞前面，增加一个讨论环节，给5分钟时间让学生们讨论辩题，然后形成自己的观点。”
  // 2026-11-26 五步（用户：“学生选择立场和论据卡的时间1分钟太短了，学生根本看不完论据卡，把这两部分分开，选择立场1分钟。选择论据卡跟后面的讨论结合起来，
  //   让学生也可以跟同桌讨论哪些论据卡适用于其立场，然后选择论据卡+自由讨论给10分钟的时间。其它环节还是一样。这里还可以再设一个小巧思：
  //   等学生聊天室发言点赞结束后，可以让他们看自己选择的论据卡是否跟自己的立场一致。然后再进行辩后投票。”）
  const FLOW = [
    { key: 'prep', label: '选立场', secs: 60, hint: '学生投辩前票选好立场（投哪方就进哪方的聊天室），点“递交”；学生页同步倒计时，时间到就不能再递交' },
    { key: 'talk', label: '选论据卡 · 自由讨论', secs: 600, hint: '学生和同桌（或同一立场的同学）一起看论据卡，商量哪几张适用于自己的立场，选 2 张递交；再想好本方最有力的理由、对方会怎么反驳、要在聊天室里说的一句话。这一步聊天室还不能发言' },
    { key: 'chat', label: '聊天室发言点赞', secs: 180, hint: `学生以实名进本方聊天室发言、给本方的好发言点赞；全场点赞最多的 ${DB.top} 位同学各加 ${DB.likes} 修为` },
    { key: 'check', label: '论据卡对一对', secs: 60, hint: '进入这一步时自动放开论据卡的解答：学生页显示自己选的每张论据卡偏向哪一方、和自己的辩前票是否一致。论据卡没有对错之分，可以请选了偏向对方的卡的同学说说是怎样用的' },
    { key: 'vote', label: '辩后投票', secs: 60, hint: '听了两方的观点，全班投辩后票：现在支持哪一方' },
    { key: 'result', label: '停止递交 · 公布结果', secs: 0, hint: `按票数公布哪一方获胜；全场点赞前三各加 ${DB.likes} 修为，获胜方不加修为` },
  ];
  const flowIndex = (key) => FLOW.findIndex((step) => step.key === key);
  // 2026-11-20 每一步的计时同步到学生页（用户：“辩论赛中的倒计时，在学生端中也设置倒计时，倒计时结束的话无法递交。但是如果老师点了+30秒，就又可以递交。”）：
  // 沿用 3v3 辩论台留下的 ck_debate_control / ck_debate_live，阶段名对照见 live-core.js 的 DEBATE_STAGE；学生页 live-student.js 的 setupDebateClock 读它
  const STAGE = window.ClassLive.DEBATE_STAGE || { prep: 'pro_open', talk: 'con_open', chat: 'free', check: 'con_sum', vote: 'vote', result: 'done' };
  const KEY_OF = Object.fromEntries(Object.entries(STAGE).map(([key, stage]) => [stage, key]));

  boards.forEach((board) => {
    const no = board.dataset.case;
    const section = board.closest('[data-debate]') || board.parentElement;
    // 辩后投票的题号：政经在作业里（debate.post，一个课堂一个案例），习经是“案例号:debate-post”
    const postKey = board.closest('.cl-debate') ? 'debate.post' : `${no}:debate-post`;
    // 论据卡的题号（“论据卡对一对”一步放开它的解答：每张卡偏向哪一方，见 tools/explain_bank.py）
    const cardsKey = board.closest('.cl-debate') ? 'debate.cards' : `${no}:debate-cards`;
    let room = null;
    let data = null;       // ck_debate_board
    let last = '';
    let busy = false;
    let reveal = false;    // 看板和结果共用“揭晓姓名”
    let stopped = false;   // 辩后投票已停止递交
    let stopsAt = 0;
    let verdict = null;    // 公布的结果 { side（pro / con / tie）, pro, con, list } / { cleared } / { restored, list }
    const people = CR.tracker(backend);   // 两间聊天室的成员名单和在线状态（隔几秒读一次）

    // ---------- 流程图：插在正文“辩论流程”的位置 ----------
    const flow = document.createElement('div');
    flow.className = 'dbf';
    flow.setAttribute('data-ix', '');
    const rules = section.querySelector('.debate-rules, .cl-debate-rules');
    // 2026-11-26 起习经的辩论流程也收进 details（同政经）：流程图放在整个 details 前面
    if (rules) (rules.closest('details') || rules).insertAdjacentElement('beforebegin', flow); else board.insertAdjacentElement('beforebegin', flow);
    section.classList.add('has-dbf');
    // ---------- 辩论结果：放在辩后投票那一块的最后 ----------
    const result = document.createElement('div');
    result.className = 'dbr';
    result.setAttribute('data-ix', '');
    const postBox = section.querySelector(`[data-vote-key="${no}:debate-post"], [data-debate-vote="post"]`);
    if (postBox) postBox.insertAdjacentElement('beforeend', result);

    board.innerHTML = '<div class="dbb"><div class="dbb-lead" data-dbb-lead></div><div class="dbb-cols tcr-rooms is-2"></div>'
      + '<div class="dbb-bar"><button type="button" data-dbb-reveal>揭晓姓名</button><span class="dbb-votes" data-dbb-votes></span>'
      + '<span class="dbb-status" data-dbb-status role="status"></span></div></div>';
    const status = (text, ok) => { const el = board.querySelector('[data-dbb-status]'); el.textContent = text || ''; el.classList.toggle('is-ok', Boolean(ok)); };
    const tally = () => ({ pro: ((data && data.pro) || {}).votes || 0, con: ((data && data.con) || {}).votes || 0 });
    // 2026-11-18 起辩论赛实名：显示名就是姓名（同名加学号末两位），“揭晓姓名”只给以前用昵称进入的补上姓名
    const realOf = (m) => (reveal && m.name && !String(m.nick || '').startsWith(String(m.name).replace(/\s+/g, '').slice(0, 7)) ? m.name : '');
    const leaderName = (m) => `${esc(m.nick)}${realOf(m) ? `（${esc(realOf(m))}）` : ''}`;

    // ---------- 本机计时 ----------
    const localKey = () => (room ? `classlive-debate-flow:${room.id}:${no}` : '');
    const readLocal = () => { try { const v = room ? JSON.parse(localStorage.getItem(localKey()) || 'null') : null; return v && flowIndex(v.key) >= 0 ? v : null; } catch (error) { return null; } };
    const writeLocal = (value) => { try { if (value) localStorage.setItem(localKey(), JSON.stringify(value)); else localStorage.removeItem(localKey()); } catch (error) { /* 忽略 */ } };
    const localLeft = (state) => (state.paused ? state.left : Math.max(0, Math.round((state.ends - Date.now()) / 1000)));
    // ---------- 计时同步到后台：学生页显示同一个倒计时，时间到这一步不能再递交，“+30 秒”后又可以 ----------
    let syncNote = '';                    // 没同步成功时显示在流程图下面
    let syncChain = Promise.resolve();    // 一条一条按顺序发，免得“切换”“加时”先后颠倒
    let synced = false;                   // 打开页面后是否已经和后台对过一次
    const control = (action, stage, secs) => rpcOne('ck_debate_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_action: action, p_stage: stage || null, p_secs: secs == null ? null : secs });
    function paintSync() { const el = flow.querySelector('[data-dbf-sync]'); if (el) { el.textContent = syncNote; el.hidden = !syncNote; } }
    function adopt(state) {   // 以后台时钟为准校正本机的倒计时
      const local = readLocal();
      if (!local || local.key === 'result' || !state || state.status !== 'ok' || KEY_OF[state.stage] !== local.key) return;
      const left = Math.max(0, Number(state.left) || 0);
      writeLocal({ ...local, paused: Boolean(state.paused), left, ends: Date.now() + left * 1000, total: Math.max(local.total || 0, Number(state.secs) || 0) });
    }
    function sync(action, key, secs) {
      if (!room) return syncChain;
      syncChain = syncChain.then(async () => {
        try {
          let state;
          if (action === 'stage') {
            try { state = await control('stage', STAGE[key], secs); }
            catch (first) { await control('lock'); state = await control('stage', STAGE[key], secs); }   // 这场辩论第一次计时：先建记录
          } else state = await control(action, null, secs);
          adopt(state);
          syncNote = '';
        } catch (error) {
          console.warn('[辩论赛计时]', error);
          syncNote = /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((error && error.message) || error))
            ? '后台还没有计时同步功能：学生页暂时不显示倒计时。' : `倒计时没有同步到学生页（${error.message || error}），本机计时照常。`;
        }
        paintSync();
        paintFlow();
      });
      return syncChain;
    }
    async function reconcile() {   // 打开或刷新投屏页：本机已经在某一步，而后台没有记录或不是同一步时，补发一次
      const local = readLocal();
      if (!local) return;
      try {
        const state = await rpcOne('ck_debate_live', { p_classroom: Number(room.id) || room.id, p_case: no });
        if (state.status === 'ok' && KEY_OF[state.stage] === local.key) { adopt(state); renderFlow(); return; }
      } catch (error) { /* 后台没有这组函数时，下面的 sync 会给出提示 */ }
      if (local.key === 'result') { sync('stage', 'result', 0); return; }
      await sync('stage', local.key, localLeft(local));
      if (local.paused) sync('pause');
    }
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
        ? `<ol>${leaders.map((m, i) => `<li class="is-${esc(m.side)}"><span>${i + 1}</span><b>${esc(m.nick)}</b><small><i>${SIDE[m.side] || ''}</i>${realOf(m) ? ` · ${esc(realOf(m))}` : ''} · ${m.posts} 条发言</small><em>♥ ${m.likes}</em></li>`).join('')}</ol>`
        : '<p class="dbb-empty">还没有人被点赞。两方聊天室里的发言被点赞后，这里按点赞数排出前三（正反两方合起来算）。</p>'}`;
      // 两间聊天室只建一次，刷新时只更新变化的地方（ClassLive.chatRoom.paint；发言列表用 syncFeed，滑动位置不会被 4 秒一次的刷新打断）。
      // 2026-11-07 用户：“聊天室内容的显示要按照发布的时间顺序固定显示，然后要能够显示所有内容，可以通过上下滑动的方式”
      if (!cols.querySelector('[data-tcr]')) cols.innerHTML = ['pro', 'con'].map((side) => CR.shell(side, side)).join('');
      const joined = people.list();
      ['pro', 'con'].forEach((side) => {
        const d = (data && data[side]) || { members: 0, posts: 0 };
        const rows = d.all || (d.hot || []).slice().sort((a, b) => Number(a.id) - Number(b.id));   // 后台还没更新时只有 hot
        const mine = joined ? CR.roster(joined.filter((m) => m.side === side), rows) : null;
        CR.paint(cols.querySelector(`[data-tcr="${side}"]`), {
          title: `${SIDE[side]}聊天室`,
          meta: `${d.members} 人${mine ? `（在线 ${mine.filter((m) => m.online).length}）` : ''} · ${d.posts} 条发言`,
          people: mine && mine.map((m) => ({ ...m, real: realOf(m) })),
          count: d.members,
          posts: rows.map((h) => ({ ...h, real: realOf(h) })),
          empty: `还没有发言。学生递交辩前票、进入${SIDE[side]}聊天室以后，发言按发布时间显示在这里。`,
          hide: true,
        });
      });
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
      // 2026-11-22 起点“开始”以前，学生页的辩论赛各步都收起（只显示“等老师开始”），开始以后每一步到了才开放（live-student.js setupDebateClock）
      const hint = !step ? `点“开始”以前，学生页的辩论赛各步都收起（只显示“等老师开始”），每一步到了才开放。开始：${FLOW[0].hint}（${duration(FLOW[0].secs)}）`
        : step.key === 'result' ? (verdict && verdict.side === 'none' ? '平局：只给点赞前三加了修为，见下面“辩后投票”里的结果'
          : verdict && verdict.side ? `${SIDE[verdict.side]}胜（${verdict.pro} : ${verdict.con}），见下面“辩后投票”里的结果`
            : verdict && verdict.tie ? '平票：请在下面“辩后投票”里裁定' : '辩后投票已停止递交，见下面“辩后投票”里的结果') : step.hint;
      flow.innerHTML = `<div class="dbf-head"><span class="dbf-tag">辩论流程</span><div class="dbf-now"><b>${esc(title)}</b><small>${esc(hint)}</small></div><span class="dbf-clock" data-dbf-clock></span></div>
        <ol class="dbf-nodes">${nodes}</ol>
        <div class="dbf-ctrl">${next ? `<button type="button" class="is-main" data-dbf-next>${key ? '下一步' : '开始'}：${esc(next.label)} ▶</button>` : ''}`
        + (clock ? `<button type="button" data-dbf-pause>${clock.paused ? '继续计时' : '暂停计时'}</button><button type="button" data-dbf-extend>+30 秒</button>` : '')
        + '<span class="dbf-tip">也可以直接点流程图里的任一步，跳到那一步重新计时。学生页同步显示倒计时：时间到，这一步就不能再递交；点“+30 秒”可以继续递交。</span>'
        + '<span class="dbf-sync" data-dbf-sync hidden></span></div>';
      paintFlow();
      paintSync();
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
      sync('stage', step.key, step.secs);
      // 论据卡对一对（2026-11-26）：把论据卡的解答放开给本课堂的学生（同“学生实时结果”里的“给学生看解答”；后台没有这项功能时忽略）
      if (step.key === 'check') {
        backend.rpc('ck_reveal_items', { p_classroom: Number(room.id) || room.id, p_items: [cardsKey], p_on: true })
          .then(() => document.dispatchEvent(new CustomEvent('classlive:reveals-changed')))
          .catch((error) => console.warn('[论据卡对一对] 没有放开论据卡的解答', error));
      }
    }
    function pause() {
      const state = readLocal();
      if (!state || stopped) return;
      writeLocal(state.paused ? { ...state, paused: false, ends: Date.now() + state.left * 1000 } : { ...state, paused: true, left: localLeft(state) });
      renderFlow();
      sync(state.paused ? 'resume' : 'pause');
    }
    function extend() {
      const state = readLocal();
      if (!state || stopped) return;
      const step = FLOW[flowIndex(state.key)];
      writeLocal(state.paused ? { ...state, left: state.left + 30, total: (state.total || step.secs) + 30 }
        : { ...state, ends: Math.max(state.ends, Date.now()) + 30000, total: (state.total || step.secs) + 30 });
      renderFlow();
      sync('extend', null, 30);
    }

    // ---------- 辩后投票：停止递交，按票数公布胜负，给全场点赞前三加修为 ----------
    // 2026-11-21 起获胜方不加修为：胜负只按票数公布（平票就是平票，不用裁定、改判）；后台一律按 'none' 调用（只给点赞前三），
    // 这样后台还没更新时也是只给前三。manual === null＝撤销今天加的辩论赛修为
    async function decide(manual) {
      if (!room) return;
      try {
        await load(true);
        const { pro, con } = tally();
        const side = pro > con ? 'pro' : con > pro ? 'con' : 'tie';
        let list = await backend.rpc('ck_set_debate_winners', { p_classroom: Number(room.id) || room.id, p_case: no, p_side: manual === null ? null : 'none', p_points: DB.likes });
        list = Array.isArray(list) ? list : [];
        verdict = manual === null ? { cleared: true, pro, con } : { side, pro, con, list };
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
        if (!window.confirm(`停止递交辩后票，按票数公布结果？\n· 票多的一方获胜（获胜方不加修为）；\n· 全场点赞前三各加 ${DB.likes} 修为。`)) return;
        try { await setStop(true); } catch (error) { window.alert(`停止递交没有成功：${error.message || error}`); return; }
      }
      writeLocal({ key: 'result', ends: Date.now(), paused: false, left: 0, total: 0 });
      sync('stage', 'result', 0);
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
        const lines = [
          top.length ? `点赞前三：${topText} 各加 ${DB.likes} 修为` : '没有人被点赞（或点赞最多的不在点名册上），点赞前三没有加修为',
          '获胜方不加修为：辩后投票只看大家现在支持哪一方',
        ];
        return `<ul class="dbr-awards">${lines.map((x) => `<li>${x}</li>`).join('')}</ul>${roll(list)}`;
      };
      // 胜负只看票数：公布以后刷新页面（restored）也照票数写出哪一方获胜
      const wonHtml = (side) => (side === 'tie' ? '<p class="dbr-win">平票</p>' : `<p class="dbr-win is-${side}">${SIDE[side]}胜</p>`);
      let body;
      if (verdict && verdict.side) {
        body = wonHtml(verdict.side) + awards(verdict) + '<div class="dbr-acts"><button type="button" data-dbr-decide>按票数重新公布</button><button type="button" data-dbr-undo>撤销加修为</button></div>';
      } else if (verdict && verdict.restored) {
        body = wonHtml(t.pro > t.con ? 'pro' : t.con > t.pro ? 'con' : 'tie')
          + `<p class="dbr-note">今天已给 ${verdict.list.length} 位同学加辩论赛修为（全场点赞前三；获胜方不加修为）。</p>${roll(verdict.list)}`
          + '<div class="dbr-acts"><button type="button" data-dbr-decide>按票数重新公布</button><button type="button" data-dbr-undo>撤销加修为</button></div>';
      } else if (verdict && verdict.cleared) {
        body = '<p class="dbr-note">已撤销今天的辩论赛修为。</p><div class="dbr-acts"><button type="button" data-dbr-decide>按票数重新公布</button></div>';
      } else if (stopped) {
        body = '<p class="dbr-note">辩后投票已停止递交。</p><div class="dbr-acts"><button type="button" class="is-main" data-dbr-decide>按票数公布结果</button></div>';
      } else if (voting) {
        body = `<p class="dbr-note">学生正在投辩后票（票数每 4 秒更新）。点下面的按钮（或上面统计里的“停止递交”）停止递交后公布结果：票多的一方获胜（不加修为），全场点赞前三各加 ${DB.likes} 修为。</p>`
          + '<div class="dbr-acts"><button type="button" class="is-main" data-dbr-finish>停止递交，公布结果</button></div>';
      } else {
        body = `<p class="dbr-note">流程走到“辩后投票”时这里显示票数；停止递交后公布结果：票多的一方获胜（不加修为），全场点赞前三各加 ${DB.likes} 修为。</p>`;
      }
      result.innerHTML = `<div class="dbr-box"><span class="dbr-tag">辩论结果</span>${voting || stopped || verdict ? score : ''}${body}</div>`;
    }
    result.addEventListener('click', async (event) => {
      const t = event.target;
      if (t.closest('[data-dbr-finish]')) finish();
      else if (t.closest('[data-dbr-decide]')) decide();
      else if (t.closest('[data-dbr-undo]')) {
        if (window.confirm('撤销今天加的辩论赛修为（全场点赞前三）？')) decide(null);
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
        if (changed && !now) { verdict = null; const voteStep = FLOW[flowIndex('vote')]; writeLocal({ key: 'vote', ends: Date.now() + voteStep.secs * 1000, paused: false, left: voteStep.secs, total: voteStep.secs }); }
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
          await people.refresh(room.id, no, (Number((data.pro || {}).members) || 0) + (Number((data.con || {}).members) || 0));
          // 停止递交的状态：打开页面时、辩后投票前后各查一次（投屏统计里停止递交会另外通知）
          if (force || Date.now() - stopsAt > 15000 || ['vote', 'result'].includes(nowKey())) {
            stopsAt = Date.now();
            stopped = window.ClassLive.stopList(await backend.rpc('ck_stopped_items', { p_classroom: Number(room.id) || room.id })).includes(postKey);
          }
          // 刷新页面以后：已停止且今天已加过修为，还原结果
          if (stopped && !verdict && Array.isArray(data.awarded) && data.awarded.length) verdict = { restored: true, list: data.awarded };
          if (!synced) { synced = true; reconcile(); }
        } else {
          data = null;
        }
        const key = JSON.stringify([data, reveal, Boolean(room), stopped, verdict && (verdict.side || verdict.tie || verdict.cleared || verdict.restored), room ? people.list() : null]);
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
      const hide = event.target.closest('[data-tcr-hide]');
      if (revealButton) {
        reveal = !reveal;
        renderBoard();
        renderResult();
      } else if (hide) {
        if (!window.confirm('隐藏这条发言？学生的聊天室里也看不到了，它的点赞也不再计入。')) return;
        try { await backend.rpc('ck_debate_hide', { p_post: Number(hide.dataset.tcrHide) || hide.dataset.tcrHide, p_hidden: true }); status('隐藏了一条发言。', true); load(true); }
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
