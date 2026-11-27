/* 限时抢答与闯关（课堂完整版投屏页，习近平经济思想概论，2026-11-20）
 * 用户：“所有章节的‘材料归纳 · 多选’设置为随机抢答模式（学生端暂时先隐藏该题目）也就是设置一个按钮，老师按了以后，随机触发抢答模式（触发概率为99%），
 *   该模式触发的情况下，学生端会弹出一个倒计时（5秒），然后是类似于情景猜谜的页面（第五章给学生60秒的作答时间，第六章50，然后40，最后一直稳定在30），
 *   看哪些同学先回答正确，前10位同学获得5修为值。”
 *   “‘迁移任务 · 小资料分析’改成闯关游戏，学生端先隐藏题目，教师端也设置一个开放入口按钮，老师按了以后，学生端进入类似于情景揭秘的页面，每个小资料设置两道题目……
 *   你算下6个题目，大概给他们多少时间做合适（至少7分钟），要有倒计时。都回答正确的+5修为值。”
 * 页面上带 data-act 的两处各加一条控制条：
 *   （2026-11-21 用户：“‘材料归纳 · 多选’里面的抢答，不要出现以下内容：‘99% 的概率触发抢答——’”：页面上的说明不再写概率，做法不变。）
 *   · rush（材料归纳 · 多选）：“🎲 随机抢答”——99% 触发抢答（倒计时 5 秒，作答时长按章：第五章及以前 60 秒、第六章 50、第七章 40、第八章起 30），
 *     1% 不触发（题目照常开放给学生作答）；也可以直接点“不抢答，直接开放”。看板：已交、答对人数，按先后列出答对的前 10 名。
 *   · quest（迁移任务 · 小资料分析）：“🚩 开放闯关入口”，时长可选 7／8／10 分钟。估算：读三则小资料约 1.5 分钟，三道四选一约 3 分钟，
 *     三问理论匹配约 1.5 分钟，检查交卷留 1 分钟，合计 7 分钟上下；课时表里这一步是 7 分钟，所以默认 7 分钟，班上读得慢时选 8 或 10 分钟。
 *     看板：已交、三关全过人数、每一问答对人数。
 * 开局时把参考答案（页面上的 data-quiz-answer、data-tk-k）交给后台（ck_act_control），学生页读不到；判对错、名次、加修为都在后台（ck_act_answer）。
 * 需要在本机登录教师工作台，并且当前课堂就是本页章节。只在课程网站的投屏页有，离线版没有（离线版照常显示题目）。
 *
 * 机制图闯关看板（同日）。用户：“‘机制图 · 弹幕接龙’能否换一种方式，比如设置类似于闯关或者boss战的游戏，然后通过前面一个节点推出后面一个节点，
 *   形成一条链路或者闭环？让学生在闯关的过程中理解各节点之间的关系和联系？”
 *   闯关在学生页上进行（不计修为；2026-11-22 起老师在投屏页点“开始机制图闯关”以后学生页才显示，见 live-gates.js）。投屏页机制图下面带 data-mech-board 的一块里放看板：在闯人数、推出链条的人数、通关人数，
 *   每个箭头有多少人答错过（答错最多的先讲），最先通关的 12 位。只写箭头编号（①→②），不写节点名称——大屏上的机制图这时还遮着。
 *   看板上面有“打开闯关大屏”（同日，用户：“机制图闯关也一起改成大屏风格。”）：深色大屏上是一排节点卡片（先只亮第一步）和上面这些人数，
 *   点“揭晓下一步”（→ 或回车）一步一步亮出节点和这个箭头的参考说法；不影响页面上机制图自己的“逐步演示”。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!window.ClassLive || config.provider === 'off') return;
  const boxes = Array.from(document.querySelectorAll('[data-act]'));
  const mechs = Array.from(document.querySelectorAll('[data-mech-board]'));
  if (!boxes.length && !mechs.length) return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[抢答与闯关]', error.message); return; }
  const unit = config.unit || window.ClassLive.unitOf();
  const chapter = Number((String(unit).match(/(\d+)$/) || [])[1]) || 0;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RUSH = { chance: 0.99, delay: 5, top: 10, points: 5, secs: chapter <= 5 ? 60 : chapter === 6 ? 50 : chapter === 7 ? 40 : 30 };
  // 闯关（2026-11-26 各自计时）：老师“启动闯关”后马上开放（不再统一倒计时 5 秒），学生自己点“参与闯关”，时长从各人进场算起
  const QUEST = { delay: 0, minutes: [7, 8, 10], pick: 7, points: 5 };
  const clock = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const span = (ms) => { const sec = Math.max(1, Math.round((Number(ms) || 0) / 1000)); return sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`; };   // 用时（闯关排名用）
  // 按钮图标（线条图，不用表情符号：各家系统上的表情符号样子不一）
  const ico = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const FLAG = ico('<path d="M6 21V4"/><path d="M6 4.5h11.5l-2.6 4 2.6 4H6z" fill="currentColor"/>');
  const UNDO = ico('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>');
  const SCREEN = ico('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>');
  const rpcOne = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
  const roomFor = async (no) => {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const room = window.ClassLive.pickRoom(rooms, config.course, unit);
    if (!room || room.chapter !== unit) return null;
    if (room.case_no && Number(room.case_no) !== Number(no)) return null;
    return room;
  };

  const style = document.createElement('style');
  style.dataset.readable = 'panel';
  style.textContent = `
  .act-ctl { margin: 14px 0; padding: 14px 16px; border: 2px solid #c9a24a; border-radius: 14px; background: linear-gradient(135deg, #fffaf0, #fdf1d8); color: #3b2a07;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .act-ctl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
  /* 按钮（2026-11-26 用户：“机制图 · 闯关，按钮再美化一下”）：立体游戏按钮——上亮下暗的渐变＋底边厚度，按下去沉一下；图标用线条图 */
  .act-ctl button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 12px; color: #3b2a07;
    background: linear-gradient(180deg, #ffffff, #f6efe2); box-shadow: inset 0 0 0 1.5px rgba(70, 51, 34, .22), 0 3px 0 rgba(70, 51, 34, .22), 0 8px 16px -10px rgba(70, 51, 34, .5);
    font: inherit; font-weight: 800; line-height: 1.2; white-space: nowrap; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, filter .15s ease; }
  .act-ctl button svg { flex: 0 0 auto; width: 20px; height: 20px; }
  .act-ctl button:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.04); }
  .act-ctl button:not(:disabled):active { transform: translateY(2px); box-shadow: inset 0 0 0 1.5px rgba(70, 51, 34, .22), 0 1px 0 rgba(70, 51, 34, .22); }
  .act-ctl button:focus-visible { outline: 3px solid rgba(35, 101, 95, .45); outline-offset: 2px; }
  .act-ctl button.is-main { min-height: 52px; padding: 0 24px 0 12px; color: #fff; font-size: 18px; letter-spacing: .02em; text-shadow: 0 1px 0 rgba(0, 0, 0, .25);
    background: linear-gradient(180deg, rgba(255, 255, 255, .22), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #2f8478, #1c5a52);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 4px 0 #123e39, 0 12px 22px -10px rgba(18, 62, 57, .7); }
  .act-ctl button.is-main:not(:disabled):active { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 1px 0 #123e39; }
  .act-ctl button.is-main .gate-ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: #7a3d0c; background: linear-gradient(180deg, #ffe9a8, #f2bb4c); box-shadow: inset 0 -2px 0 rgba(122, 61, 12, .25); text-shadow: none; }
  .act-ctl button.is-main .gate-ico svg { width: 18px; height: 18px; }
  .act-ctl button.is-screen { color: #ffe3a3; background: linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #3a2c3f, #1f1824);
    box-shadow: inset 0 0 0 1px rgba(255, 217, 138, .35), 0 3px 0 #0e0b10, 0 10px 18px -10px rgba(14, 11, 16, .8); }
  .act-ctl button.is-screen:not(:disabled):active { box-shadow: inset 0 0 0 1px rgba(255, 217, 138, .35), 0 1px 0 #0e0b10; }
  .act-ctl button.is-undo, .act-ctl button.is-warn { color: #8a3a22; background: linear-gradient(180deg, #ffffff, #fbefe9); box-shadow: inset 0 0 0 1.5px rgba(164, 73, 45, .4), 0 3px 0 rgba(164, 73, 45, .25); }
  .act-ctl button.is-undo:not(:disabled):active, .act-ctl button.is-warn:not(:disabled):active { box-shadow: inset 0 0 0 1.5px rgba(164, 73, 45, .4), 0 1px 0 rgba(164, 73, 45, .25); }
  .act-ctl button:disabled { opacity: .5; cursor: default; transform: none; filter: none; }
  @media (prefers-reduced-motion: reduce) { .act-ctl button { transition: none; } }
  .act-ctl button.is-main:not(:has(.gate-ico)) { padding: 0 24px; }
  .act-ctl button[hidden], .act-ctl select[hidden] { display: none; }
  .act-ctl select { min-height: 44px; padding: 0 10px; border: 1.5px solid rgba(70, 51, 34, .28); border-radius: 12px; background: #fff; font: inherit; }
  .act-state { flex: 1 1 220px; min-width: 0; font-weight: 700; }
  .act-clock { flex: 0 0 auto; min-width: 92px; padding: 2px 14px; border-radius: 12px; background: #3b2a07; color: #ffe9b3; font: 800 30px/1.3 -apple-system, "PingFang SC", sans-serif; font-variant-numeric: tabular-nums; text-align: center; }
  .act-clock.is-low { background: #a4492d; color: #fff; }
  .act-clock[hidden] { display: none; }
  .act-note { margin: 8px 0 0; color: #6b5a40; font-size: 14.5px; }
  /* 2026-11-26 抢答／闯关条下的长说明收进“怎么玩”（用户：“有些文字是不是不需要，或者可以简洁一些（隐藏起来？），使之更美观”） */
  .act-tip { margin: 8px 0 0; }
  .act-tip > summary { display: inline-flex; align-items: center; gap: 6px; padding: 2px 12px 2px 8px; border: 1px solid rgba(122, 90, 18, .3); border-radius: 999px;
    background: rgba(255, 255, 255, .7); color: #7a5a12; font: 700 13.5px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; list-style: none; }
  .act-tip > summary::-webkit-details-marker { display: none; }
  .act-tip > summary::before { content: "?"; display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: #b5701e; color: #fff; font-size: 11.5px; font-weight: 800; }
  .act-tip > summary::after { content: "▾"; font-size: 11px; }
  .act-tip[open] > summary::after { content: "▴"; }
  .act-board { margin: 12px 0 0; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, .85); border: 1px solid #ead9bb; }
  .act-board[hidden] { display: none; }
  .act-board h5 { margin: 0 0 8px; font-size: 16px; }
  .act-board h5 b { margin: 0 4px; font-size: 22px; color: #23655f; font-variant-numeric: tabular-nums; }
  .act-rank { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 10px; margin: 0; padding: 0; list-style: none; }
  .act-rank li { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: #f3f8f4; border: 1px solid #c5ddce; font-weight: 700; }
  .act-rank li i { flex: 0 0 auto; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #23655f; color: #fff; font-style: normal; font-size: 14px; }
  .act-rank li.is-out { background: #f6f2ea; border-color: #e2d6c2; font-weight: 500; }
  .act-rank li.is-out i { background: #b8ab95; }
  .act-rank li span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act-rank li em { flex: 0 0 auto; font-style: normal; color: #7a6040; font-size: 13.5px; }
  .act-items { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 14.5px; }
  .act-items li { padding: 2px 10px; border-radius: 999px; background: #f1ebdb; }
  .act-items li.is-worst { background: #f6d9cd; color: #7a2c14; font-weight: 800; }
  /* 机制图闯关看板 */
  .mq-board { margin: 12px 0 0; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, .88); border: 1px solid #ead9bb; color: #3b2a07;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .mq-board[hidden] { display: none; }
  .mq-board h5 { margin: 0 0 8px; font-size: 16px; }
  .mq-board h5 b { margin: 0 4px; font-size: 22px; color: #23655f; font-variant-numeric: tabular-nums; }
  .mqb-bars { display: grid; gap: 6px; margin: 0 0 4px; }
  .mqb-bars > div { display: grid; grid-template-columns: 92px minmax(0, 1fr) 44px; align-items: center; gap: 10px; font-weight: 700; }
  .mqb-bars em { display: block; height: 14px; border-radius: 7px; background: #efe6d3; overflow: hidden; }
  .mqb-bars em i { display: block; height: 100%; border-radius: 7px; background: #23655f; transition: width .5s ease; }
  .mqb-bars > div.is-boss em i { background: #a4492d; }
  .mqb-bars b { font-variant-numeric: tabular-nums; text-align: right; }
  /* 开局以前大屏上也先不显示题目（学生页是收起的，大屏提前露出来就不公平了）；老师可以点“先看一眼题目” */
  .act-veil > .quiz-item, .act-veil .tk-items, .act-veil .tk-legend { display: none !important; }
  /* 抢答、闯关的大屏：配色、字号同 PK 对决的大屏 */
  .act-stage { position: fixed; z-index: 2147482000; inset: 0; display: flex; flex-direction: column; padding: 22px 34px 24px; box-sizing: border-box; color: #fff;
    background: radial-gradient(ellipse at 50% 0%, #2a2238 0%, #17131d 60%, #0e0c12 100%); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .act-stage[hidden] { display: none; }
  body.act-stage-open { overflow: hidden; }
  .act-stage-x { position: absolute; top: 18px; right: 22px; display: grid; place-items: center; width: 50px; height: 50px; padding: 0; border: 1px solid rgba(255, 255, 255, .45); border-radius: 8px;
    color: #fff; background: transparent; font-size: 30px; line-height: 1; cursor: pointer; }
  .act-stage-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; padding-right: 70px; font-weight: 800; font-size: 22px; line-height: 1.4; }
  .act-stage-kicker { color: #e7c98c; }
  .act-stage-info { color: rgba(255, 255, 255, .75); font-size: 18px; }
  .act-stage-center { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; padding: 10px 0; }
  .act-stage-center > * { margin: auto; }
  .act-stage-note { min-height: 28px; margin: 6px 0; text-align: center; color: #ffe8a8; font-weight: 700; font-size: clamp(17px, 1.6vw, 22px); line-height: 1.4; }
  .act-stage-actions { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 12px; }
  /* 大屏按钮（2026-11-26）：同控制条的立体按钮，颜色按大屏的深底配 */
  .act-stage-actions button, .act-stage-actions select { min-width: 130px; min-height: 58px; padding: 8px 22px; border: 0; border-radius: 12px; color: #fff;
    background: linear-gradient(180deg, rgba(255, 255, 255, .16), rgba(255, 255, 255, .06)); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .4), 0 4px 0 rgba(0, 0, 0, .5);
    font: inherit; font-weight: 800; font-size: 22px; line-height: 1.2; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, filter .15s ease; }
  .act-stage-actions button.is-go { color: #2b2118; background: linear-gradient(180deg, rgba(255, 255, 255, .35), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #ffe39a, #f0b445);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .4), 0 5px 0 #9a6416, 0 14px 26px -10px rgba(240, 180, 69, .55); }
  .act-stage-actions button.is-red { background: linear-gradient(180deg, rgba(255, 255, 255, .22), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #ea5a3e, #b3361f);
    box-shadow: inset 0 0 0 1px rgba(255, 200, 180, .45), 0 5px 0 #6e2213, 0 14px 30px -10px rgba(234, 90, 62, .6); }
  .act-stage-actions button:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.08); }
  .act-stage-actions button:not(:disabled):active { transform: translateY(3px); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .3), 0 1px 0 rgba(0, 0, 0, .5); }
  .act-stage-actions button:disabled { opacity: .45; cursor: default; }
  @media (prefers-reduced-motion: reduce) { .act-stage-actions button { transition: none; } }
  .act-stage-actions select option { color: #2b2118; }
  .act-stage-rules { width: min(1100px, 94vw); }
  .act-stage-rules h3 { margin: 0 0 14px; text-align: center; font-weight: 800; font-size: clamp(30px, 3.4vw, 46px); line-height: 1.3; }
  .act-stage-rules ol { display: grid; gap: 12px; margin: 0; padding-left: 1.4em; font-weight: 700; font-size: clamp(20px, 2vw, 30px); line-height: 1.55; }
  .act-stage-count { font: 900 clamp(160px, 22vw, 320px)/1 Georgia, "Times New Roman", serif; color: #ffd98a; text-shadow: 0 0 40px rgba(255, 217, 138, .7); animation: act-stage-pop .9s ease; }
  @keyframes act-stage-pop { 0% { opacity: 0; transform: scale(.6); } 30% { opacity: 1; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
  .act-stage-run { width: min(1200px, 95vw); display: grid; gap: 16px; justify-items: center; }
  .act-stage-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px 40px; }
  .act-stage-clock { font: 900 clamp(64px, 9vw, 130px)/1 Georgia, "Times New Roman", serif; color: #ffd98a; text-shadow: 0 0 28px rgba(255, 217, 138, .5); font-variant-numeric: tabular-nums; }
  .act-stage-clock.is-low { color: #ff9c85; text-shadow: 0 0 28px rgba(255, 120, 90, .6); }
  .act-stage-clock.is-done { font-size: clamp(34px, 4vw, 56px); color: #e7c98c; text-shadow: none; }
  .act-stage-stats { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; }
  .act-stage-stats div { min-width: 150px; padding: 10px 18px; border-radius: 14px; text-align: center; background: linear-gradient(90deg, rgba(47, 111, 179, .8), rgba(47, 111, 179, .32)); }
  .act-stage-stats div.is-good { background: linear-gradient(90deg, rgba(35, 101, 95, .92), rgba(35, 101, 95, .42)); }
  .act-stage-stats b { display: block; font: 900 clamp(40px, 4.6vw, 64px)/1 Georgia, "Times New Roman", serif; font-variant-numeric: tabular-nums; }
  .act-stage-stats span { font-weight: 700; font-size: 18px; line-height: 1.4; opacity: .9; }
  .act-stage-tabs { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .act-stage-tabs button { padding: 8px 18px; border: 2px solid rgba(255, 255, 255, .3); border-radius: 999px; background: rgba(255, 255, 255, .08); color: #fff; font: inherit; font-weight: 800;
    font-size: clamp(16px, 1.5vw, 21px); line-height: 1.3; cursor: pointer; }
  .act-stage-tabs button[aria-pressed="true"] { border-color: #ffd98a; background: #ffd98a; color: #2b2118; }
  .act-stage-q { width: 100%; }
  .act-stage-scene { margin: 0 0 14px; padding: 10px 16px; border-left: 5px solid #e7c98c; background: rgba(255, 255, 255, .05); font-weight: 600; font-size: clamp(17px, 1.6vw, 24px); line-height: 1.65; }
  .act-stage-scene b { display: block; margin-bottom: 4px; color: #ffd98a; font-weight: 800; }
  .act-stage-qtext { margin: 0 0 12px; font-weight: 700; font-size: clamp(21px, 2.2vw, 34px); line-height: 1.5; }
  .act-stage-qtext small { display: inline-block; margin-right: 10px; padding: 0 10px; border-radius: 6px; color: #2b2118; background: #e7c98c; font-size: .62em; font-weight: 800; vertical-align: .18em; }
  .act-stage-opts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 14px; }
  .act-stage-opts.is-one { grid-template-columns: 1fr; }
  .act-stage-opts > div { display: flex; align-items: flex-start; gap: 12px; padding: 10px 16px; border: 2px solid rgba(255, 255, 255, .3); border-radius: 12px; background: rgba(255, 255, 255, .08);
    font-weight: 700; font-size: clamp(17px, 1.7vw, 25px); line-height: 1.45; }
  .act-stage-opts > div > b { flex: 0 0 auto; display: grid; place-items: center; width: 1.6em; height: 1.6em; border-radius: 50%; color: #2b2118; background: #e7c98c; font-size: .85em; }
  .act-stage-opts > div > span { flex: 1 1 auto; min-width: 0; }
  .act-stage-opts > div.is-right { border-color: #9be0c9; background: rgba(35, 101, 95, .75); }
  .act-stage-opts > div > em { flex: 0 0 auto; font-style: normal; color: #9be0c9; white-space: nowrap; }
  .act-stage-answer { width: 100%; margin: 0 0 10px; padding: 10px 16px; border-radius: 12px; border: 2px solid #9be0c9; background: rgba(35, 101, 95, .55); font-weight: 700; font-size: clamp(17px, 1.7vw, 25px); line-height: 1.5; }
  .act-stage-answer em { margin-left: 12px; font-style: normal; color: #9be0c9; white-space: nowrap; }
  .act-stage-explain { width: 100%; box-sizing: border-box; padding: 10px 16px; border-left: 5px solid #e7c98c; background: rgba(255, 255, 255, .05); font-weight: 600; font-size: clamp(16px, 1.5vw, 22px); line-height: 1.6; }
  .act-stage-explain, .act-stage-explain * { color: rgba(255, 255, 255, .92) !important; background: transparent !important; }
  .act-stage-explain p { margin: 0 0 6px; } .act-stage-explain ul { margin: 0; padding-left: 1.2em; } .act-stage-explain b { margin-right: 8px; color: #ffd98a !important; }
  .act-stage-rank { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px 12px; width: 100%; margin: 0; padding: 0; list-style: none; }
  .act-stage-rank li { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border: 1px solid rgba(155, 224, 201, .6); border-radius: 12px; background: rgba(35, 101, 95, .6);
    font-weight: 700; font-size: clamp(17px, 1.6vw, 23px); line-height: 1.3; }
  .act-stage-rank li i { flex: 0 0 auto; display: grid; place-items: center; width: 1.7em; height: 1.7em; border-radius: 50%; background: #e7c98c; color: #2b2118; font-style: normal; font-size: .85em; }
  .act-stage-rank li span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act-stage-rank li em { flex: 0 0 auto; font-style: normal; font-size: .8em; opacity: .85; }
  .act-stage-rank li.is-out { border-color: rgba(255, 255, 255, .25); background: rgba(255, 255, 255, .08); font-weight: 500; }
  /* 机制图闯关大屏：一排节点卡片 */
  .mqs-nodes { display: flex; align-items: stretch; gap: 10px; width: 100%; }
  .mqs-node { flex: 1 1 0; min-width: 0; display: grid; align-content: center; gap: 6px; min-height: 130px; padding: 12px 16px; border: 2px dashed rgba(255, 255, 255, .25); border-radius: 14px;
    background: rgba(255, 255, 255, .04); text-align: center; }
  .mqs-node > b { color: rgba(255, 255, 255, .35); font-weight: 800; font-size: clamp(20px, 2.1vw, 30px); line-height: 1.35; }
  .mqs-node > i { color: #ffd98a; font-style: normal; font-weight: 800; font-size: 17px; line-height: 1; }
  .mqs-node > span { color: rgba(255, 255, 255, .85); font-weight: 600; font-size: clamp(15px, 1.4vw, 20px); line-height: 1.5; }
  .mqs-node.is-lit { border-style: solid; border-color: rgba(155, 224, 201, .7); background: rgba(35, 101, 95, .5); text-align: left; }
  .mqs-node.is-lit > b { color: #fff; }
  .mqs-node.is-now { border-color: #ffd98a; box-shadow: 0 0 0 3px rgba(255, 217, 138, .3), 0 0 26px rgba(255, 217, 138, .4); animation: act-stage-pop .6s ease; }
  .mqs-nodes > em { flex: 0 0 auto; align-self: center; color: #ffd98a; font-style: normal; font-weight: 800; font-size: 26px; }
  .mqs-nodes > em.is-loop { color: rgba(255, 255, 255, .28); font-size: 32px; }
  .mqs-nodes > em.is-loop.is-on { color: #ffd98a; text-shadow: 0 0 16px rgba(255, 217, 138, .7); }
  .mqs-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 10px; margin: 0; padding: 0; list-style: none; font-weight: 700; font-size: clamp(15px, 1.4vw, 20px); }
  .mqs-chips li { padding: 4px 14px; border-radius: 999px; background: rgba(255, 255, 255, .1); }
  .mqs-chips li.is-worst { background: #c8452d; }
  /* 最先通关的同学：一行还要写用时和答错次数，格子比抢答的名次宽一些，姓名才不会被挤成省略号 */
  .act-stage-rank.mqs-rank { grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }
  .act-stage-rank.mqs-rank li { gap: 8px; padding: 8px 12px; }
  .act-stage-rank.mqs-rank li em { font-size: .72em; }
  .act-stage-empty { font-weight: 700; font-size: clamp(20px, 2vw, 30px); color: rgba(255, 255, 255, .8); text-align: center; }
  /* 机制图闯关大屏上的 Boss“想当然”（2026-11-26）：全班合力，每有一位同学通关，它就掉一截血；全部通关时被打败。
     形象和血条的样式用页面里学生版同一套（.mq-bossfig、.mq-hp-*，在 build_case_html.py 的 ENHANCED_CSS 里） */
  .mqs-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px 30px; width: 100%; }
  .mqs-boss { display: grid; grid-template-columns: 118px minmax(0, 1fr); align-items: center; gap: 0 16px; width: min(560px, 100%); padding: 2px 20px 2px 8px; border: 1px solid rgba(240, 160, 140, .32); border-radius: 18px;
    background: radial-gradient(ellipse 34% 120% at 10% 60%, rgba(176, 128, 255, .28), transparent 70%), linear-gradient(90deg, rgba(200, 69, 45, .28), rgba(200, 69, 45, .06)); }
  .mqs-boss-fig { position: relative; }
  .mqs-boss-note { margin: 8px 0 0; color: #ffd9cf; font-weight: 700; font-size: clamp(15px, 1.35vw, 19px); line-height: 1.45; }
  .mqs-boss-note b { color: #fff; font-size: 1.15em; }
  @media (prefers-reduced-motion: reduce) { .act-stage-count { animation: none; } }
  @media print { .act-ctl, .mq-board, .act-stage { display: none !important; } .act-veil > .quiz-item, .act-veil .tk-items, .act-veil .tk-legend { display: revert !important; } }
  `;
  document.head.appendChild(style);

  // ---------- 机制图闯关看板 ----------
  mechs.forEach((box) => {
    const no = box.dataset.case;
    const el = box.querySelector('[data-mq-board]');
    let links = [];
    try { links = JSON.parse(box.dataset.links || '[]'); } catch (error) { links = []; }
    if (!el || !/^\d{2}$/.test(no || '')) return;
    let room = null;
    let off = false;       // 后台还没有这个功能：不再问
    let seen = true;       // 这一块在屏幕附近才刷新
    let last = '';
    let latest = null;     // 最近一次看板数据（大屏也用）
    const text = (node) => (node ? node.textContent.replace(/\s+/g, ' ').trim() : '');
    const lab = box.closest('[data-mechanism]');
    const nodes = lab ? Array.from(lab.querySelectorAll('[data-mechanism-node]')).map((n) => ({ label: text(n.querySelector('h4')), text: text(n.querySelector('p')) })) : [];
    const refs = Array.from(box.querySelectorAll('.mech-links-ref li')).map((li) => ({ head: text(li.querySelector('strong')), why: text(li.querySelector('span')) }));
    const loop = refs.length >= nodes.length && nodes.length > 1;   // 循环图：最后一个箭头回到第一步
    // ----- 大屏（2026-11-20 用户：“机制图闯关也一起改成大屏风格。”）-----
    const opener = document.createElement('div');
    opener.className = 'act-ctl';
    opener.innerHTML = `<div class="act-ctl-row"><button type="button" class="is-screen" data-ms-open>${SCREEN}打开闯关大屏</button>`
      + '<span class="act-state">学生在自己的页面上闯关（不计修为）。大屏上看在闯和通关的人数，再一步一步揭晓机制图和每个箭头的道理。</span></div>';
    ['click', 'keydown', 'keyup'].forEach((type) => opener.addEventListener(type, (event) => event.stopPropagation()));
    el.insertAdjacentElement('beforebegin', opener);
    const stage = document.createElement('div');
    stage.className = 'act-stage';
    stage.hidden = true;
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', '机制图闯关大屏');
    stage.innerHTML = `<button type="button" class="act-stage-x" data-ms-close aria-label="关闭大屏">×</button>
      <div class="act-stage-top"><span class="act-stage-kicker">机制图闯关</span><span class="act-stage-info">${esc(text(lab && lab.querySelector('.interaction-heading h3')))}</span></div>
      <div class="act-stage-center" data-ms-center></div>
      <p class="act-stage-note" data-ms-note></p>
      <div class="act-stage-actions" data-ms-actions></div>`;
    ['click', 'keyup'].forEach((type) => stage.addEventListener(type, (event) => event.stopPropagation()));
    document.body.appendChild(stage);
    // 大屏上的 Boss“想当然”：和学生版（build_case_html.py 的 bossFig）同一个形象，改那边要一起改
    let figNo = 0;
    const bossFig = (extra) => {
      const id = `mqsf${no}x${figNo += 1}`;
      return `<svg class="mq-bossfig${extra ? ` ${extra}` : ''}" viewBox="0 0 160 160" aria-hidden="true" focusable="false">`
        + `<defs><radialGradient id="${id}a" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#c59dff" stop-opacity=".5"/><stop offset="1" stop-color="#c59dff" stop-opacity="0"/></radialGradient>`
        + `<linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9670dc"/><stop offset=".55" stop-color="#5e3c9e"/><stop offset="1" stop-color="#341f63"/></linearGradient>`
        + `<linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#e2a636"/></linearGradient></defs>`
        + '<ellipse class="bf-shadow" cx="80" cy="150" rx="40" ry="6"/>'
        + '<g class="bf-body">'
        + `<circle cx="80" cy="84" r="72" fill="url(#${id}a)"/>`
        + `<path fill="url(#${id}b)" d="M80 30C113 30 134 53 134 86V114C134 121 127 125 121 120C115 115 109 116 105 122C101 128 92 129 88 123C84 117 76 117 72 123C68 129 59 128 55 122C51 116 45 115 39 120C33 125 26 121 26 114V86C26 53 47 30 80 30Z"/>`
        + '<path d="M44 60C47 47 57 38 70 35" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width="5" stroke-linecap="round"/>'
        + '<ellipse cx="80" cy="100" rx="31" ry="19" fill="#fff" fill-opacity=".09"/>'
        + `<g class="bf-crown"><path fill="url(#${id}c)" stroke="#9a6416" stroke-width="1.6" stroke-linejoin="round" d="M63 35L60 16L71 25L80 10L89 25L100 16L97 35Z"/><circle cx="80" cy="23" r="3.2" fill="#e0453a"/></g>`
        + '<ellipse cx="55" cy="81" rx="7" ry="4" fill="#ff8fb5" fill-opacity=".4"/><ellipse cx="105" cy="81" rx="7" ry="4" fill="#ff8fb5" fill-opacity=".4"/>'
        + '<g fill="none" stroke="#1d1230" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
        + '<g class="bf-face bf-idle"><ellipse cx="64" cy="67" rx="10.5" ry="8.5" fill="#fff" stroke="none"/><ellipse cx="96" cy="67" rx="10.5" ry="8.5" fill="#fff" stroke="none"/>'
        + '<circle cx="68" cy="69.5" r="4.3" fill="#1d1230" stroke="none"/><circle cx="100" cy="69.5" r="4.3" fill="#1d1230" stroke="none"/>'
        + '<path d="M53.5 67A10.5 9 0 0 1 74.5 67Z" fill="#4b2e86" stroke="none"/><path d="M85.5 67A10.5 9 0 0 1 106.5 67Z" fill="#4b2e86" stroke="none"/>'
        + '<path d="M53.5 67H74.5M85.5 67H106.5" stroke-width="2.4"/><path d="M53 53Q63 50 73 54M87 50Q97 42 107 47"/><path d="M68 93Q81 99 94 88l3-2"/></g>'
        + '<g class="bf-face bf-hurt"><path d="M57 60L69 67L57 74M103 60L91 67L103 74" stroke-width="3.6"/><path d="M54 51L70 56M106 51L90 56"/><ellipse cx="80" cy="94" rx="5.5" ry="6.5" fill="#1d1230" stroke="none"/><path d="M121 47q5 7 0 11q-5-4 0-11z" fill="#9fd8ff" stroke="none"/></g>'
        + '<g class="bf-face bf-laugh"><path d="M55 70Q64 59 73 70M87 70Q96 59 105 70" stroke-width="3.6"/><path d="M54 52Q63 47 72 51M88 51Q97 47 106 52"/><path d="M63 86Q80 110 97 86Z" fill="#1d1230"/><path d="M72 97Q80 106 88 97Q80 100 72 97Z" fill="#ff6b8a" stroke="none"/></g>'
        + '<g class="bf-face bf-down"><path d="M57 60L71 74M71 60L57 74M89 60L103 74M103 60L89 74" stroke-width="3.6"/><path d="M65 95q3.75-4 7.5 0t7.5 0t7.5 0t7.5 0"/></g>'
        + '</g>'
        + '<g transform="rotate(-10 116 108)"><rect x="96" y="99" width="40" height="19" rx="3" fill="#f7e9c4" stroke="#b08a43" stroke-width="1.5"/><rect x="92" y="96.5" width="6" height="24" rx="3" fill="#dcbc78"/><rect x="134" y="96.5" width="6" height="24" rx="3" fill="#dcbc78"/>'
        + '<text x="116" y="113" text-anchor="middle" font-size="11.5" font-weight="800" fill="#7a4a12">①②③</text></g>'
        + '<ellipse cx="95" cy="121" rx="7.5" ry="6" fill="#6f4bb3"/>'
        + '</g></svg>';
    };
    let bossShown = -1;    // 上次画的时候有几位同学通关（多了就让它挨一下）
    let bossPct = 100;     // 上次画的血量（新画的血条从这里滑到新的血量）
    const bossHtml = (b) => {
      const players = Number(b.players) || 0;
      const cleared = Math.min(players, Number(b.cleared) || 0);
      const pct = players ? Math.round(100 * (players - cleared) / players) : 100;
      const beaten = players > 0 && cleared >= players;
      const look = beaten ? 'is-beaten' : bossShown >= 0 && cleared > bossShown ? 'is-hurt' : '';
      const note = !players ? '全班合力：每有一位同学通关，“想当然”就掉一截血。'
        : beaten ? `全班 <b>${players}</b> 人都通关了：“想当然”被打败！`
          : `已有 <b>${cleared}</b> 人打败了它，还剩 <b>${players - cleared}</b> 人在闯。`;
      const html = `<div class="mqs-boss"><div class="mqs-boss-fig">${bossFig(look)}${look === 'is-hurt' ? '<span class="mq-slash" aria-hidden="true"></span>' : ''}</div><div class="mq-arena-info">
        <div class="mq-hp${pct > 0 && pct <= 20 ? ' is-low' : ''}" role="meter" aria-label="“想当然”的血量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
          <div class="mq-hp-head"><b>想当然</b><span class="mq-hp-tag">BOSS</span><span class="mq-hp-num"><b>${pct}</b>%</span></div>
          <div class="mq-hp-track" style="--n:1"><i class="mq-hp-trail" data-to="${pct}" style="width:${bossPct}%"></i><i class="mq-hp-fill" data-to="${pct}" style="width:${bossPct}%"></i></div></div>
        <p class="mqs-boss-note">${note}</p></div></div>`;
      bossShown = cleared;
      bossPct = pct;
      return html;
    };
    let shown = 1;         // 大屏上已经揭晓到第几个节点
    let closed = false;    // 循环图：最后一个箭头（回到第一步）揭晓了没有
    let stageSig = '';
    const steps = () => nodes.length - 1 + (loop ? 1 : 0);          // 一共要揭晓几个箭头
    const revealed = () => shown - 1 + (closed ? 1 : 0);            // 已经揭晓了几个箭头
    function paintStage() {
      if (stage.hidden) return;
      const b = latest || { players: 0, chain: 0, cleared: 0, miss: {}, list: [] };
      const sig = JSON.stringify([shown, closed, b.players, b.chain, b.cleared, b.miss, (b.list || []).length, Boolean(room)]);
      if (sig === stageSig) return;
      stageSig = sig;
      const miss = b.miss || {};
      const worst = links.map((tag) => ({ tag, n: Number(miss[tag]) || 0 })).sort((x, y) => y.n - x.n)[0];
      const ref = revealed() > 0 ? refs[revealed() - 1] : null;
      const cards = nodes.map((node, index) => (index < shown
        ? `<div class="mqs-node is-lit${index === shown - 1 && !closed ? ' is-now' : ''}"><i>${'①②③④⑤⑥'[index]}</i><b>${esc(node.label)}</b><span>${esc(node.text)}</span></div>`
        : '<div class="mqs-node"><b>？</b></div>')).join('<em>→</em>') + (loop ? `<em class="is-loop${closed ? ' is-on' : ''}">↺</em>` : '');
      stage.querySelector('[data-ms-center]').innerHTML = `<div class="act-stage-run">
        <div class="mqs-head">${bossHtml(b)}<div class="act-stage-stats"><div><b>${b.players}</b><span>在闯</span></div><div><b>${b.chain}</b><span>推出链条</span></div><div class="is-good"><b>${b.cleared}</b><span>通关</span></div></div></div>
        <div class="mqs-nodes">${cards}</div>
        ${ref ? `<p class="act-stage-answer">${esc(ref.head)}<br>${esc(ref.why)}</p>` : ''}
        ${b.players ? `<ul class="mqs-chips"><li>推链条：${Number(miss.next) || 0} 人选错过</li>${links.map((tag) => `<li${worst && worst.n > 0 && worst.tag === tag ? ' class="is-worst"' : ''}>${esc(tag)}：${Number(miss[tag]) || 0} 人答错过</li>`).join('')}</ul>` : ''}
        ${b.list && b.list.length ? `<ol class="act-stage-rank mqs-rank">${b.list.map((row, i) => `<li><i>${i + 1}</i><span>${esc(row.name)}</span><em>${span(row.ms)}${row.miss ? ` · 重来 ${row.miss} 次` : ' · 一次通关'}</em></li>`).join('')}</ol>` : ''}</div>`;
      // 血条从上次的位置滑到新的血量（下一帧再改宽度，过渡才看得见）
      requestAnimationFrame(() => {
        stage.querySelectorAll('.mqs-boss [data-to]').forEach((bar) => { bar.style.width = `${bar.dataset.to}%`; });
        const hurt = stage.querySelector('.mqs-boss .mq-bossfig.is-hurt');
        if (hurt) setTimeout(() => hurt.classList.remove('is-hurt'), 900);   // 挨一下就回到平时的样子
      });
      stage.querySelector('[data-ms-note]').textContent = !room ? '当前课堂不是本章（或没有登录教师工作台）：人数不会更新，仍可以一步一步揭晓。'
        : revealed() >= steps() ? '整张机制图揭晓完了：请同学把几步连起来说一遍。'
          : worst && worst.n > 0 ? `同学们在自己的页面上闯关。答错的人最多的是 ${worst.tag}：揭晓到这一步时多讲两句。`
            : '同学们在自己的页面上闯关：先推链条，再打 Boss。多数同学通关后，一步一步揭晓。';
      stage.querySelector('[data-ms-actions]').innerHTML = `<button type="button" class="is-go" data-ms-next${revealed() >= steps() ? ' disabled' : ''}>揭晓下一步 ›</button>`
        + `<button type="button" data-ms-reset${revealed() ? '' : ' disabled'}>重新遮住</button><button type="button" data-ms-close>关闭大屏</button>`;
    }
    const step = () => { if (shown < nodes.length) shown += 1; else if (loop && !closed) closed = true; paintStage(); };
    const openStage = () => { stage.hidden = false; document.body.classList.add('act-stage-open'); stageSig = ''; paintStage(); refresh(); };
    const closeStage = () => { stage.hidden = true; if (!document.querySelector('.act-stage:not([hidden])')) document.body.classList.remove('act-stage-open'); };
    opener.querySelector('[data-ms-open]').addEventListener('click', openStage);
    stage.addEventListener('click', (event) => {
      if (event.target.closest('[data-ms-close]')) closeStage();
      else if (event.target.closest('[data-ms-next]')) step();
      else if (event.target.closest('[data-ms-reset]')) { shown = 1; closed = false; paintStage(); }
    });
    document.addEventListener('keydown', (event) => {
      if (stage.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeStage(); return; }
      if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === 'PageDown') { event.preventDefault(); event.stopPropagation(); step(); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'PageUp', ' '].includes(event.key)) event.stopPropagation();
    }, true);
    const span = (ms) => { const sec = Math.max(1, Math.round((Number(ms) || 0) / 1000)); return sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`; };
    const paint = (b) => {
      latest = b;
      paintStage();
      const sig = JSON.stringify(b);
      if (sig === last) return;
      last = sig;
      el.hidden = false;
      if (!b.players) {
        el.innerHTML = '<h5>闯关看板</h5><p class="act-note">还没有同学开始闯关：请同学们在自己页面的机制图下面点“开始闯关”。</p>';
        return;
      }
      const miss = b.miss || {};
      const worst = links.map((tag) => ({ tag, n: Number(miss[tag]) || 0 })).sort((x, y) => y.n - x.n)[0];
      const width = (n) => Math.round(100 * n / b.players);
      el.innerHTML = `<h5>闯关看板 · 在闯<b>${b.players}</b>人 · 推出链条<b>${b.chain}</b>人 · 通关<b>${b.cleared}</b>人</h5>
        <div class="mqb-bars"><div><span>推出链条</span><em><i style="width:${width(b.chain)}%"></i></em><b>${b.chain}</b></div>
          <div class="is-boss"><span>打败 Boss</span><em><i style="width:${width(b.cleared)}%"></i></em><b>${b.cleared}</b></div></div>
        <ul class="act-items"><li>推链条：${Number(miss.next) || 0} 人选错过</li>${links.map((tag) => `<li${worst && worst.n > 0 && worst.tag === tag ? ' class="is-worst"' : ''}>Boss 战 ${esc(tag)}：${Number(miss[tag]) || 0} 人答错过</li>`).join('')}</ul>
        ${worst && worst.n > 0 ? `<p class="act-note">答错的人最多的是 ${esc(worst.tag)}：逐步揭晓时先把这一步讲透。</p>` : ''}
        ${b.list && b.list.length ? `<p class="act-note" style="margin:10px 0 4px">用时最短的同学（各自从第一次点“开始闯关”算起，答错从头再来不停表）：</p><ol class="act-rank">${b.list.map((row, i) => `<li><i>${i + 1}</i><span>${esc(row.name)}</span><em>${span(row.ms)}${row.miss ? ` · 重来 ${row.miss} 次` : ' · 一次通关'}</em></li>`).join('')}</ol>` : ''}`;
    };
    const refresh = async () => {
      if (!room || off) return;
      try {
        const res = await rpcOne('ck_mech_board', { p_classroom: Number(room.id) || room.id, p_case: no });
        if (res.status === 'ok') paint(res);
      } catch (error) {
        if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((error && error.message) || error))) off = true;
      }
    };
    if ('IntersectionObserver' in window) {
      seen = false;
      new IntersectionObserver((entries) => { seen = entries.some((entry) => entry.isIntersecting); if (seen) refresh(); }, { rootMargin: '400px 0px' }).observe(box);
    }
    setInterval(() => { if (!document.hidden && (seen || !stage.hidden)) refresh(); }, 3000);
    (async () => {
      try { room = await roomFor(no); } catch (error) { room = null; }
      refresh();
      if (!room) setInterval(async () => { if (room || document.hidden) return; try { room = await roomFor(no); } catch (error) { room = null; } if (room) refresh(); }, 20000);
    })();
  });

  boxes.forEach((box) => {
    const kind = box.dataset.act === 'quest' ? 'quest' : 'rush';
    const no = box.dataset.actCase;
    const answer = {};
    if (kind === 'rush') {
      const item = box.querySelector('[data-quiz-key$=":digest"]');
      if (!item) return;
      answer.digest = item.dataset.quizAnswer || '';
    } else {
      Array.from(box.querySelectorAll('.tk-item')).forEach((li) => {
        const item = li.querySelector('[data-quiz-key]');
        if (!item) return;
        const id = item.dataset.quizKey.split(':')[1];
        answer[id] = item.dataset.quizAnswer || '';
        answer[`${id}k`] = li.dataset.tkK || '';
      });
    }
    if (!Object.keys(answer).length || Object.values(answer).some((v) => !v)) return;
    const ctl = document.createElement('div');
    ctl.className = 'act-ctl';
    ctl.setAttribute('data-ix', '');
    ctl.innerHTML = `<div class="act-ctl-row">
        <button type="button" class="is-main" data-act-go>${kind === 'rush' ? '🖥 打开抢答大屏' : '🖥 打开闯关大屏'}</button>
        ${kind === 'quest' ? `<select data-act-mins aria-label="闯关时长">${QUEST.minutes.map((m) => `<option value="${m}"${m === QUEST.pick ? ' selected' : ''}>${m} 分钟</option>`).join('')}</select>` : ''}
        <button type="button" data-act-plain>${kind === 'rush' ? '不抢答，直接开放这道题' : '不闯关，直接开放题目'}</button>
        <button type="button" data-act-peek aria-pressed="false">先看一眼题目</button>
        <span class="act-clock" data-act-clock hidden></span>
        <span class="act-state" data-act-state>正在连接课堂……</span>
        <button type="button" data-act-extend hidden>${kind === 'rush' ? '+10 秒' : '+1 分钟'}</button>
        <button type="button" class="is-warn" data-act-stop hidden>${kind === 'rush' ? '结束抢答' : '结束闯关'}</button>
      </div>
      <details class="act-tip"><summary>怎么玩</summary><p class="act-note">${kind === 'rush'
        ? `学生页先不显示这道题。点“打开抢答大屏”，在大屏上点“随机抢答”：学生页弹出 ${RUSH.delay} 秒倒计时，随后限时 ${RUSH.secs} 秒作答，每人只能交一次，前 ${RUSH.top} 位答对的同学各加 ${RUSH.points} 修为。抢答结束后再点下面的“核对”讲评。`
        : `学生页先不显示这三道题。点“打开闯关大屏”，在大屏上选时长、点“启动闯关”：学生页出现“参与闯关”按钮，学生自己点进去，时长从各人进场算起（谁先进去都一样）。三则小资料一关一关作答——每关两问（先选讲对了的分析，再判断它对应哪个理论要点），每关递交后不能修改，到时间自动交卷。名单按答对的题数和用时排（又快又准确），三关全对加 ${QUEST.points} 修为。交卷后学生页显示完整的题目、答案和讲解。等大家都交完再点“结束闯关”。`}</p></details>
      <div class="act-board" data-act-board hidden></div>`;
    const head = box.querySelector('.interaction-heading') || box.querySelector('.tk-intro') || box.firstElementChild;
    head.insertAdjacentElement('afterend', ctl);
    ['click', 'keydown', 'keyup'].forEach((type) => ctl.addEventListener(type, (event) => event.stopPropagation()));
    const ui = { go: ctl.querySelector('[data-act-go]'), plain: ctl.querySelector('[data-act-plain]'), mins: ctl.querySelector('[data-act-mins]'), clock: ctl.querySelector('[data-act-clock]'),
      peek: ctl.querySelector('[data-act-peek]'), state: ctl.querySelector('[data-act-state]'), extend: ctl.querySelector('[data-act-extend]'), stop: ctl.querySelector('[data-act-stop]'), board: ctl.querySelector('[data-act-board]') };
    let room = null;
    let game = null;       // 后台这一局的状态
    let board = null;
    let offset = 0;        // 后台时钟 − 本机时钟
    let note = '';         // 没有触发抢答等一次性的说明
    let busy = false;
    let peek = false;      // 老师点了“先看一眼题目”
    let lastPhase = '';
    const now = () => Date.now() + offset;
    // 闯关没有统一的结束时刻：老师点“结束闯关”才结束（各人在自己的时限内交卷）
    const phase = () => (!game ? 'none' : game.mode === 'plain' ? 'plain' : game.closed ? 'over' : now() < game.go_at ? 'count'
      : kind === 'quest' || now() <= game.go_at + game.secs * 1000 ? 'open' : 'over');
    const control = (action, extra = {}) => rpcOne('ck_act_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_kind: kind, p_action: action,
      p_mode: extra.mode || null, p_answer: extra.answer || null, p_secs: extra.secs == null ? null : extra.secs, p_delay: extra.delay == null ? null : extra.delay });
    const adopt = (res, t0) => {
      if (res && res.game) { game = res.game; if (res.game.now && t0) offset = Number(res.game.now) - (t0 + Date.now()) / 2; }
      else if (res && res.status === 'none') game = null;
    };
    function paint() {
      const p = phase();
      const running = p === 'count' || p === 'open';
      ui.go.disabled = !room;
      ui.plain.disabled = busy || !room || running;
      ui.plain.hidden = p === 'plain';
      if (ui.mins) ui.mins.disabled = busy || running;
      ui.extend.hidden = !(p === 'open' || p === 'over');
      ui.stop.hidden = !running;
      ui.go.textContent = kind === 'rush' ? '🖥 打开抢答大屏' : '🖥 打开闯关大屏';
      ui.clock.hidden = !running || kind === 'quest';
      const veil = (p === 'none' || p === 'count') && !peek;
      box.classList.toggle('act-veil', veil);
      ui.peek.hidden = !(p === 'none' || p === 'count');
      ui.peek.textContent = peek ? '收起题目' : '先看一眼题目';
      ui.peek.setAttribute('aria-pressed', String(peek));
      if (p === 'count') { ui.clock.textContent = String(Math.max(1, Math.ceil((game.go_at - now()) / 1000))); ui.clock.classList.remove('is-low'); }
      if (p === 'open') { const left = Math.max(0, Math.ceil((game.go_at + game.secs * 1000 - now()) / 1000)); ui.clock.textContent = clock(left); ui.clock.classList.toggle('is-low', left <= 10); }
      const total = board ? board.total : 0;
      const right = board ? board.right : 0;
      ui.state.textContent = !room ? '当前课堂不是本章（或没有登录教师工作台）：先在工作台发布本章课堂，再刷新本页。'
        : note && (p === 'none' || p === 'plain') ? note
        : p === 'none' ? (kind === 'rush' ? '还没开始：学生页上这道题是收起的。' : '还没开放：学生页上这三道题是收起的。')
        : p === 'plain' ? '这道题已经照常开放给学生作答（不抢答、不闯关），下面的“学生实时结果”照常显示。'
        : p === 'count' ? (kind === 'rush' ? '抢答触发！学生页正在倒计时……' : '闯关马上开始……')
        : p === 'open' ? (kind === 'rush' ? `作答中 · 已交 ${total} 人 · 答对 ${right} 人`
          : `闯关中 · 参与 ${board ? board.entered || 0 : 0} 人 · 在闯 ${board ? board.working || 0 : 0} 人 · 已交卷 ${total} 人 · 三关全过 ${right} 人（各自计时 ${Math.round((game.secs || 0) / 60)} 分钟）`)
        : `已结束 · 共交 ${total} 人 · ${kind === 'rush' ? '答对' : '三关全过'} ${right} 人${kind === 'rush' ? '。请点下面的“核对”讲评。' : '。交了卷的同学已经在自己页面上看到完整的题目、答案和讲解。'}`;
      paintBoard(p);
      if (p === 'over' && kind === 'quest' && lastPhase !== 'over') tab = 0;   // 闯关刚结束：大屏从第一关开始揭晓
      lastPhase = p;
      paintStage(p);
    }
    function paintBoard(p) {
      if (!board || p === 'none' || p === 'plain') { ui.board.hidden = true; return; }
      ui.board.hidden = false;
      const secs = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} 秒`;
      if (kind === 'rush') {
        const winners = board.list.filter((row) => row.ok).sort((x, y) => x.place - y.place);
        ui.board.innerHTML = `<h5>已交<b>${board.total}</b>人 · 答对<b>${board.right}</b>人 · 前 ${RUSH.top} 名各加 ${RUSH.points} 修为</h5>`
          + (winners.length ? `<ol class="act-rank">${winners.slice(0, 20).map((row) => `<li class="${row.bonus > 0 ? '' : 'is-out'}"><i>${row.place}</i><span>${esc(row.name)}</span><em>${secs(row.ms)}${row.bonus > 0 ? ` · +${row.bonus}` : ''}</em></li>`).join('')}</ol>`
            : '<p class="act-note">还没有同学答对。</p>');
      } else {
        const ids = Object.keys(board.items || {}).sort();
        const label = (id) => { const m = /^tk-(\d+)(k?)$/.exec(id); return m ? `第 ${m[1]} 关${m[2] ? '第二问' : '第一问'}` : id; };
        // 名单：答对的题数从多到少，一样多的用时从短到长（后台已排好；用时从各人点“参与闯关”算起）
        ui.board.innerHTML = `<h5>参与<b>${board.entered || 0}</b>人 · 在闯<b>${board.working || 0}</b>人 · 已交卷<b>${board.total}</b>人 · 三关全过<b>${board.right}</b>人（各加 ${QUEST.points} 修为）</h5>`
          + (ids.length ? `<ul class="act-items">${ids.map((id) => `<li>${esc(label(id))}：答对 ${board.items[id]} 人</li>`).join('')}</ul>` : '')
          + (board.list.length ? `<ol class="act-rank" style="margin-top:10px">${board.list.slice(0, 30).map((row, i) => `<li class="${row.ok ? '' : 'is-out'}"><i>${i + 1}</i><span>${esc(row.name)}</span><em>${row.right}/${row.total} · ${span(row.ms)}</em></li>`).join('')}</ol>` : '');
      }
    }
    async function refresh() {
      if (!room) return;
      const t0 = Date.now();
      try {
        const res = await rpcOne('ck_act_board', { p_classroom: Number(room.id) || room.id, p_case: no, p_kind: kind });
        if (res.status === 'ok') { adopt(res, t0); board = res; } else { game = null; board = null; if (res.now) offset = Number(res.now) - (t0 + Date.now()) / 2; }
      } catch (error) {
        if (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((error && error.message) || error))) {
          note = '后台还没有抢答／闯关功能：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261120-抢答与闯关.sql。在这之前学生页照常显示题目。';
          ui.go.disabled = true; ui.plain.disabled = true;
        }
      }
      paint();
    }
    async function act(run) {
      if (busy || !room) return;
      busy = true; paint();
      try { const t0 = Date.now(); adopt(await run(), t0); } catch (error) { note = `没有成功：${(error && error.message) || error}`; }
      busy = false;
      await refresh();
    }
    // 开局：抢答 99% 触发、1% 不触发（题目照常开放）；闯关按所选时长
    const start = () => {
      note = '';
      if (kind === 'rush') {
        if (Math.random() < RUSH.chance) act(() => control('start', { mode: 'game', answer, secs: RUSH.secs, delay: RUSH.delay }));
        else { note = '这一次没有进入抢答：题目已经照常开放给学生作答。'; act(() => control('start', { mode: 'plain', secs: 0, delay: 0 })); }
      } else {
        act(() => control('start', { mode: 'game', answer, secs: Number(ui.mins.value) * 60, delay: QUEST.delay }));
      }
    };

    // 全班重新开一局（2026-11-27 用户：“机制闯关和其它闯关类游戏有个bug，就是如果有同学在老师开放后就进去做了题目，老师关闭后重新开放，之前做的那部分同学就无法再加入了。
    //   可能会导致结算也有问题。”）：上一局作废——交过的卷、名次和加的修为撤回，交卷时补记的作答删掉，换新的一局，全班都能重新参加（后台 ck_act_control restart）。
    //   原来的“再来一次／重新开放”只给没交的同学（交过的成绩不动），保留
    const restart = () => {
      if (busy || !room) return;
      if (!window.confirm(`全班重新开一局？\n\n上一局作废：已经交的卷、名次和加的修为都撤回，交过的同学也要重新${kind === 'rush' ? '抢答' : '闯关'}，排名重新算。`)) return;
      note = '';
      tab = -1;
      const secs = kind === 'rush' ? RUSH.secs : Number(ui.mins.value) * 60;
      act(async () => {
        try { return await control('restart', { mode: 'game', answer, secs, delay: kind === 'rush' ? RUSH.delay : QUEST.delay }); } catch (error) {
          const text = String((error && error.message) || error);
          window.alert(/不认识的操作/.test(text) ? '后台还没有“全班重新开一局”：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261127-闯关重开.sql。' : `没有重新开局：${text}`);
          return null;
        }
      });
    };

    // ---------- 大屏（2026-11-20 用户：“要设置成大屏播放的那种风格，跟PK对决类似”）----------
    // 铺满屏幕的深色舞台：玩法 → 开始（大字倒计时）→ 计时、已交和答对人数（抢答同时显示题目；闯关可以点某一关，把这一关的小资料和题目投到大屏）
    // → 结束后揭晓（抢答：答案和名次；闯关：一关一关看答案、每一问答对的人数和讲评，最后是过关名单）。Esc 关闭，← → 换关
    const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const LET = (i) => String.fromCharCode(65 + i);
    const itemOf = (el) => ({
      id: el.dataset.quizKey.split(':')[1], prompt: text(el.querySelector('.quiz-q')).replace(/^(单选|多选|判断)\s*/, ''),
      options: Array.from(el.querySelectorAll('[data-quiz-option]')).map((b, i) => ({ value: b.dataset.quizOption, letter: LET(i), text: text(b.querySelector('span')) })),
      answer: String(el.dataset.quizAnswer || '').split(',').filter(Boolean), explain: (el.querySelector('[data-quiz-explain]') || {}).innerHTML || '',
    });
    const levels = kind === 'rush' ? [itemOf(box.querySelector('[data-quiz-key$=":digest"]'))]
      : Array.from(box.querySelectorAll('.tk-item')).filter((li) => li.querySelector('[data-quiz-key]')).map((li) => ({
        ...itemOf(li.querySelector('[data-quiz-key]')), title: text(li.querySelector('.tk-scene b')), scene: text(li.querySelector('.tk-scene p')), k: String(li.dataset.tkK || '') }));
    const legend = Array.from(box.querySelectorAll('.tk-legend li')).map((li) => ({ k: text(li.querySelector('b')).replace(/\D/g, ''), text: text(li.querySelector('span')) }));
    const caseTitle = `案例 ${no}　${text(document.querySelector(`#case-${no}-story h2`))}`.trim();
    const stage = document.createElement('div');
    stage.className = 'act-stage';
    stage.hidden = true;
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', kind === 'rush' ? '抢答大屏' : '闯关大屏');
    stage.innerHTML = `<button type="button" class="act-stage-x" data-as-close aria-label="关闭大屏">×</button>
      <div class="act-stage-top"><span class="act-stage-kicker">${kind === 'rush' ? '随机抢答 · 材料归纳' : '限时闯关 · 小资料分析'}</span><span class="act-stage-info">${esc(caseTitle)}</span></div>
      <div class="act-stage-center" data-as-center></div>
      <p class="act-stage-note" data-as-note></p>
      <div class="act-stage-actions" data-as-actions></div>`;
    ['click', 'keyup'].forEach((type) => stage.addEventListener(type, (event) => event.stopPropagation()));
    document.body.appendChild(stage);
    const sv = { center: stage.querySelector('[data-as-center]'), note: stage.querySelector('[data-as-note]'), actions: stage.querySelector('[data-as-actions]') };
    let tab = -1;        // 闯关：大屏上现在看第几关（-1＝总览；结束后 levels.length＝过关名单）
    let stageSig = '';
    const openStage = () => { stage.hidden = false; document.body.classList.add('act-stage-open'); stageSig = ''; tab = phase() === 'over' && kind === 'quest' ? 0 : -1; paint(); refresh(); };
    const closeStage = () => { stage.hidden = true; if (!document.querySelector('.act-stage:not([hidden])')) document.body.classList.remove('act-stage-open'); };
    const optList = (item, reveal) => `<div class="act-stage-opts${item.options.some((o) => o.text.length > 26) ? ' is-one' : ''}">${item.options.map((o) =>
      `<div class="${reveal && item.answer.includes(o.value) ? 'is-right' : ''}"><b>${esc(o.letter)}</b><span>${esc(o.text)}</span>${reveal && item.answer.includes(o.value) ? '<em>✓ 正确</em>' : ''}</div>`).join('')}</div>`;
    const seconds = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} 秒`;
    const rules = () => (kind === 'rush' ? [
      '学生页上这道多选题先收着，大屏上也先不显示。',
      `点“随机抢答”：${Math.round(RUSH.chance * 100)}% 触发——${RUSH.delay} 秒倒计时后，题目同时出现在大屏和学生页，限时 ${RUSH.secs} 秒。`,
      `每人只能交一次；前 ${RUSH.top} 位答对的同学各加 ${RUSH.points} 修为。`,
      '没有触发时，题目照常开放，学生像平常一样作答。',
    ] : [
      '学生页先不显示这三则小资料。点“启动闯关”后，学生页出现“参与闯关”按钮，学生自己点进去。',
      '限时从每位同学点“参与闯关”时算起，各算各的，谁先进去都一样；到时间自动交卷。',
      '三则小资料一关一关做：每关两问（先选讲对了的分析，再判断它对应哪个理论要点），每关递交后不能修改。',
      `按答对的题数排名，一样多的比用时（又快又准确）；三关全对加 ${QUEST.points} 修为。交卷后学生页显示完整的题目、答案和错在哪里。`,
    ]);
    const levelView = (i, reveal) => {
      const L = levels[i];
      const n = board ? board.total : 0;
      const got = (id) => (board && board.items ? Number(board.items[id]) || 0 : 0);
      const kRight = legend.find((x) => x.k === L.k);
      return `<div class="act-stage-q"><p class="act-stage-scene"><b>${esc(L.title)}</b>${esc(L.scene)}</p>
        <p class="act-stage-qtext"><small>第一问</small>${esc(L.prompt)}${reveal ? `<small style="margin-left:12px;background:#9be0c9">答对 ${got(L.id)} / ${n} 人</small>` : ''}</p>${optList(L, reveal)}
        <p class="act-stage-qtext"><small>第二问</small>讲对了的那个分析，对应哪个理论要点？${reveal ? `<small style="margin-left:12px;background:#9be0c9">答对 ${got(`${L.id}k`)} / ${n} 人</small>` : ''}</p>
        ${reveal ? `<p class="act-stage-answer">${kRight ? esc(`K${kRight.k} ${kRight.text}`) : `K${esc(L.k)}`}<em>✓ 正确</em></p>${L.explain ? `<div class="act-stage-explain">${L.explain}</div>` : ''}`
          : `<div class="act-stage-opts is-one">${legend.map((x) => `<div><b>K${esc(x.k)}</b><span>${esc(x.text)}</span></div>`).join('')}</div>`}</div>`;
    };
    const rankList = (rows, top) => (rows.length ? `<ol class="act-stage-rank">${rows.map((row, i) =>
      `<li class="${top && !(row.bonus > 0) ? 'is-out' : ''}"><i>${top ? row.place : i + 1}</i><span>${esc(row.name)}</span><em>${seconds(row.ms)}${row.bonus > 0 ? ` · +${row.bonus}` : ''}</em></li>`).join('')}</ol>` : '');
    function paintStage(p) {
      if (stage.hidden) return;
      const total = board ? board.total : 0;
      const right = board ? board.right : 0;
      const left = p === 'open' ? Math.max(0, Math.ceil((game.go_at + game.secs * 1000 - now()) / 1000)) : 0;
      // 倒计时每次都刷，其余内容变了才重画（免得按钮、动画被打断）
      const sig = JSON.stringify([p, busy, tab, total, right, board && board.items, note, Boolean(room), p === 'count' ? Math.max(1, Math.ceil((game.go_at - now()) / 1000)) : 0,
        board && p === 'over' ? board.list.length : 0, ui.mins ? ui.mins.value : '']);
      if (sig !== stageSig) {
        stageSig = sig;
        const stats = `<div class="act-stage-stats"><div><b>${total}</b><span>${kind === 'rush' ? '已交' : '已交卷'}</span></div><div class="is-good"><b>${right}</b><span>${kind === 'rush' ? '答对' : '三关全过'}</span></div></div>`;
        let center = '';
        let actions = '';
        let hint = '';
        if (!room) {
          center = '<p class="act-stage-empty">当前课堂不是本章（或没有登录教师工作台）。<br>先在工作台发布本章课堂，再刷新本页。</p>';
        } else if (p === 'none' || p === 'plain') {
          center = `<div class="act-stage-rules"><h3>${kind === 'rush' ? '随机抢答 · 玩法' : '限时闯关 · 玩法'}</h3><ol>${rules().map((line) => `<li>${esc(line)}</li>`).join('')}</ol></div>`;
          hint = note || (p === 'plain' ? '题目已经照常开放给学生作答（这一次不抢答、不闯关）。' : '同学们准备好了，就开始。');
          actions = kind === 'rush'
            ? `<button type="button" class="is-go" data-as-start${busy ? ' disabled' : ''}>🎲 随机抢答</button><button type="button" data-as-plain${busy || p === 'plain' ? ' disabled' : ''}>不抢答，直接开放这道题</button>`
            : `<select data-as-mins aria-label="闯关时长">${QUEST.minutes.map((m) => `<option value="${m}"${String(m) === String(ui.mins.value) ? ' selected' : ''}>${m} 分钟</option>`).join('')}</select>`
              + `<button type="button" class="is-go" data-as-start${busy ? ' disabled' : ''}>🚩 启动闯关</button><button type="button" data-as-plain${busy || p === 'plain' ? ' disabled' : ''}>不闯关，直接开放题目</button>`;
        } else if (p === 'count') {
          center = `<div class="act-stage-count">${Math.max(1, Math.ceil((game.go_at - now()) / 1000))}</div>`;
          hint = kind === 'rush' ? '抢答触发！看清题目再交，只能交一次。' : '闯关马上开始：三关、每关两问，只能交一次。';
          actions = `<button type="button" class="is-red" data-as-stop${busy ? ' disabled' : ''}>${kind === 'rush' ? '取消抢答' : '取消闯关'}</button>`;
        } else if (p === 'open') {
          const tabs = kind === 'quest' ? `<div class="act-stage-tabs"><button type="button" data-as-tab="-1" aria-pressed="${tab < 0}">总览</button>${levels.map((L, i) =>
            `<button type="button" data-as-tab="${i}" aria-pressed="${tab === i}">第 ${i + 1} 关 ${esc(L.title.replace(/^小资料\s*\d+\s*/, ''))}</button>`).join('')}</div>` : '';
          // 闯关（各自计时）：没有统一倒计时，大屏上是参与、在闯、交卷的人数和实时排名
          const qstats = kind === 'quest' ? `<div class="act-stage-stats"><div><b>${board ? board.entered || 0 : 0}</b><span>参与</span></div><div><b>${board ? board.working || 0 : 0}</b><span>在闯</span></div>`
            + `<div><b>${total}</b><span>已交卷</span></div><div class="is-good"><b>${right}</b><span>三关全过</span></div></div>` : '';
          const live = kind === 'quest' && board && board.list.length && tab < 0 ? `<ol class="act-stage-rank">${board.list.slice(0, 12).map((row, i) =>
            `<li class="${row.ok ? '' : 'is-out'}"><i>${i + 1}</i><span>${esc(row.name)}</span><em>${row.right}/${row.total} · ${span(row.ms)}</em></li>`).join('')}</ol>` : '';
          center = `<div class="act-stage-run"><div class="act-stage-head">${kind === 'quest' ? `<div class="act-stage-clock is-done">限时 ${Math.round((game.secs || 0) / 60)} 分钟 · 各自计时</div>${qstats}` : `<div class="act-stage-clock" data-as-clock></div>${stats}`}</div>${tabs}`
            + (kind === 'rush' ? `<div class="act-stage-q"><p class="act-stage-qtext"><small>多选</small>${esc(levels[0].prompt)}</p>${optList(levels[0], false)}</div>` : tab >= 0 && levels[tab] ? levelView(tab, false) : live) + '</div>';
          hint = kind === 'rush' ? `前 ${RUSH.top} 位答对的同学各加 ${RUSH.points} 修为。` : '同学们点“参与闯关”自己进去，时间从各人进场算起；排名先看答对的题数，一样多的比用时。点上面的某一关，可以把这一关投到大屏上（不显示答案）。';
          actions = `<button type="button" data-as-extend${busy ? ' disabled' : ''}>${kind === 'rush' ? '+10 秒' : '+1 分钟'}</button><button type="button" class="is-red" data-as-stop${busy ? ' disabled' : ''}>${kind === 'rush' ? '结束抢答' : '结束闯关'}</button>`;
        } else {
          const done = `<div class="act-stage-head"><div class="act-stage-clock is-done">${kind === 'rush' ? '抢答结束' : '闯关结束'}</div>${stats}</div>`;
          if (kind === 'rush') {
            const winners = (board ? board.list : []).filter((row) => row.ok).sort((x, y) => x.place - y.place).slice(0, 20);
            center = `<div class="act-stage-run">${done}<div class="act-stage-q"><p class="act-stage-qtext"><small>多选</small>${esc(levels[0].prompt)}</p>${optList(levels[0], true)}</div>`
              + (winners.length ? rankList(winners, true) : '<p class="act-stage-empty">这一次没有同学答对。</p>') + '</div>';
            hint = `前 ${RUSH.top} 名各加 ${RUSH.points} 修为。关闭大屏后，点题目下面的“核对”逐项讲评。`;
            actions = `<button type="button" class="is-red" data-as-restart${busy ? ' disabled' : ''}>🔄 全班重新开一局</button>`
              + `<button type="button" data-as-start${busy ? ' disabled' : ''}>🎲 只给没交的同学再来一次</button><button type="button" class="is-go" data-as-close>关闭大屏，去讲评</button>`;
          } else {
            const rows = board ? board.list : [];
            const at = Math.min(Math.max(tab, 0), levels.length);
            const working = board ? Number(board.working) || 0 : 0;
            const tabs = `<div class="act-stage-tabs">${levels.map((L, i) => `<button type="button" data-as-tab="${i}" aria-pressed="${at === i}">第 ${i + 1} 关</button>`).join('')}`
              + `<button type="button" data-as-tab="${levels.length}" aria-pressed="${at === levels.length}">排名</button></div>`;
            const rank = rows.length ? `<ol class="act-stage-rank">${rows.slice(0, 40).map((row, i) => `<li class="${row.ok ? '' : 'is-out'}"><i>${i + 1}</i><span>${esc(row.name)}</span><em>${row.right}/${row.total} · ${span(row.ms)}${row.bonus > 0 ? ` · +${row.bonus}` : ''}</em></li>`).join('')}</ol>`
              : '<p class="act-stage-empty">这一次没有同学交卷。</p>';
            // 还有同学在自己的时限内闯关时，先别揭晓答案
            center = `<div class="act-stage-run">${done}${tabs}${working && at < levels.length ? `<p class="act-stage-empty">还有 ${working} 位同学在自己的时限内闯关：等他们交完卷再揭晓答案，或先看“排名”。</p>`
              : at < levels.length ? levelView(at, true) : rank}</div>`;
            hint = at < levels.length ? `第 ${at + 1} 关揭晓：看答案和每一问答对的人数；讲完点“下一关”。交了卷的同学已经在自己页面上看到完整的题目、答案和讲解。`
              : `排名先看答对的题数，一样多的比用时（各自从“参与闯关”算起）；三关全对的同学各加 ${QUEST.points} 修为。`;
            actions = `<button type="button" data-as-prev${at <= 0 ? ' disabled' : ''}>‹ 上一关</button><button type="button" class="is-go" data-as-next${at >= levels.length ? ' disabled' : ''}>${at >= levels.length - 1 ? '过关名单 ›' : '下一关 ›'}</button>`
              + `<button type="button" class="is-red" data-as-restart${busy ? ' disabled' : ''}>🔄 全班重新开一局</button>`
              + `<button type="button" data-as-start${busy ? ' disabled' : ''}>🚩 只给没交的同学再开放</button><button type="button" data-as-close>关闭大屏</button>`;
          }
        }
        sv.center.innerHTML = center;
        sv.note.textContent = hint;
        sv.actions.innerHTML = actions;
        sv.center.scrollTop = 0;
      }
      const clockEl = sv.center.querySelector('[data-as-clock]');
      if (clockEl) { clockEl.textContent = clock(left); clockEl.classList.toggle('is-low', left <= 10); }
    }
    stage.addEventListener('click', (event) => {
      const on = (name) => event.target.closest(`[data-as-${name}]`);
      if (on('close')) { closeStage(); return; }
      if (on('tab')) { tab = Number(on('tab').dataset.asTab); paint(); return; }
      if (on('prev')) { tab = Math.max(0, Math.min(tab, levels.length) - 1); paint(); return; }
      if (on('next')) { tab = Math.min(levels.length, Math.max(tab, 0) + 1); paint(); return; }
      if (on('restart')) { restart(); return; }
      if (on('start')) { tab = -1; start(); return; }
      if (on('plain')) { note = ''; act(() => control('start', { mode: 'plain', secs: 0, delay: 0 })); return; }
      if (on('extend')) { act(() => control('extend', { secs: kind === 'rush' ? 10 : 60 })); return; }
      if (on('stop')) { act(() => control('stop')); }
    });
    stage.addEventListener('change', (event) => { const sel = event.target.closest('[data-as-mins]'); if (sel && ui.mins) { ui.mins.value = sel.value; paint(); } });
    document.addEventListener('keydown', (event) => {
      if (stage.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeStage(); return; }
      if (phase() === 'over' && kind === 'quest' && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault(); event.stopPropagation();
        tab = event.key === 'ArrowRight' ? Math.min(levels.length, Math.max(tab, 0) + 1) : Math.max(0, Math.min(tab, levels.length) - 1);
        paint();
      } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', ' '].includes(event.key) && !event.target.closest('select, input, textarea')) event.stopPropagation();   // 大屏开着时方向键不翻页面
    }, true);
    ui.go.addEventListener('click', openStage);
    ui.plain.addEventListener('click', () => { note = ''; act(() => control('start', { mode: 'plain', secs: 0, delay: 0 })); });
    ui.peek.addEventListener('click', () => { peek = !peek; paint(); });
    ui.extend.addEventListener('click', () => act(() => control('extend', { secs: kind === 'rush' ? 10 : 60 })));
    ui.stop.addEventListener('click', () => act(() => control('stop')));
    setInterval(paint, 250);
    setInterval(() => { if (!document.hidden && room && game && game.mode === 'game') refresh(); }, 2000);
    (async () => {
      try { room = await roomFor(no); } catch (error) { room = null; }
      await refresh();
      // 课堂稍后才发布时：每 20 秒再找一次
      if (!room) setInterval(async () => { if (room || document.hidden) return; try { room = await roomFor(no); } catch (error) { room = null; } if (room) refresh(); }, 20000);
    })();
  });
})();
