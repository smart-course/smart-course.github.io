/* 辩论赛“聊天室看板”与“辩论台”（课堂完整版投屏页）：习经“辩论赛”卡片里的 [data-debate-board]、[data-debate-stage]。
 * 2026-10-28 用户：“设置辩论赛聊天室，正方反方都有各自的聊天室……每一方被点赞次数最多的三位同学上台辩论。辩论结束后，全班同学再进行投票，
 * 看大家支持哪一方。赢的那一方的三位同学可以获得相应的修为值。”
 * 2026-10-29 用户：“辩论赛，双方在选出得票最高的三个论点后，正方先抛出这三条，请反方的三位辩友在弹幕上进行反驳。然后正方再回答反方的观点或者问题。
 * 这里要再设置一个弹幕问答器只能由这6人来问答。同时要按照3v3辩论的标准设置相应的流程和计时器。”
 *   聊天室看板：两方人数、发言数、每方将入选的三个论点（每人一条，点赞最多的在前）、热门发言（可隐藏），“揭晓姓名”后显示昵称对应的姓名；
 *     点“选定论点与辩手”把三个论点和作者（一、二、三辩）定下来（ck_debate_control lock），之后点赞再变也不换人；
 *     辩后票数。
 *   辩论流程图（2026-10-29 起，放在辩论卡片正文最前面）：辩前投票·选论据卡 → 聊天室 → 选定论点与辩手 → 3v3 各阶段 → 辩后投票 → 停止递交·公布胜负，
 *     一步一步推进、每步倒计时（暂停、加 30 秒），可点任一步跳转；辩后投票停止递交后，票多的一方三位辩手自动各加修为（ck_set_debate_winners），
 *     结果显示在“辩后投票”里（平票由老师裁定，可改判、撤销）。
 *   辩论台：两方论点下按“针对①②③”挂上辩手的反驳与回应，自由辩论、总结单列；“打开辩论大屏”全屏投影（大屏上也能推进阶段）。
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
  [data-debate].has-dbf .debate-rules, [data-debate].has-dbf .cl-debate-rules { display: none; }
  .dbf { margin: 14px 0 18px; border-radius: 14px; border: 1px solid rgba(70,51,34,.18); background: #fffdf8; box-shadow: 0 8px 22px rgba(70,51,34,.08); overflow: hidden; }
  .dbf-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 18px; background: linear-gradient(180deg, #4a3a22, #3b2a14); color: #fff; }
  .dbf-tag { padding: 2px 10px; border-radius: 999px; background: #f6dc98; color: #3b2a07; font-size: 13px; font-weight: 800; letter-spacing: .1em; }
  .dbf-now { flex: 1 1 260px; display: grid; } .dbf-now b { font-size: 21px; letter-spacing: .06em; } .dbf-now small { font-size: 14px; opacity: .88; line-height: 1.5; }
  .dbf-clock { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: .04em; line-height: 1; }
  .dbf-clock.is-low { color: #ffd38a; } .dbf-clock.is-up { color: #ffb59d; animation: dbt-blink 1s steps(2, start) infinite; }
  .dbf-nodes { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 0; padding: 16px 18px 12px; list-style: none; }
  .dbf-node { position: relative; }
  .dbf-node:not(:last-child)::after { content: "→"; position: absolute; right: -17px; top: 50%; transform: translateY(-50%); color: #b8862b; font-weight: 800; }
  .dbf-node button { display: grid; justify-items: start; gap: 2px; min-width: 104px; padding: 7px 12px 8px; border: 1.5px solid rgba(70,51,34,.18); border-radius: 12px;
    background: #f7f1e6; color: #4a3f36; font: inherit; text-align: left; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease; }
  .dbf-node button:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(70,51,34,.12); }
  .dbf-node i { font-style: normal; font-size: 12px; font-weight: 800; color: #b8862b; }
  .dbf-node b { font-size: 15px; line-height: 1.35; } .dbf-node em { font-style: normal; font-size: 12.5px; color: #8a7f74; }
  .dbf-node.is-pro button { border-color: rgba(35,101,95,.35); } .dbf-node.is-con button { border-color: rgba(164,73,45,.4); }
  .dbf-node.is-done button { background: #eef3ef; color: #7d8a83; } .dbf-node.is-done i { color: #23655f; }
  .dbf-node.is-next button { border-style: dashed; border-color: #b8862b; }
  .dbf-node.is-now button { border-color: #b8862b; background: linear-gradient(180deg, #fff6df, #f6e2ad); color: #3b2a07; box-shadow: 0 0 0 3px rgba(232,196,106,.55); }
  .dbf-node.is-now.is-pro button { background: linear-gradient(180deg, #e6f3ef, #cfe7df); border-color: #23655f; box-shadow: 0 0 0 3px rgba(35,101,95,.3); }
  .dbf-node.is-now.is-con button { background: linear-gradient(180deg, #fbece4, #f3d4c6); border-color: #a4492d; box-shadow: 0 0 0 3px rgba(164,73,45,.28); }
  .dbf-node.is-now button { animation: dbf-pulse 1.8s ease-in-out infinite; }
  @keyframes dbf-pulse { 50% { box-shadow: 0 0 0 6px rgba(232,196,106,.25); } }
  .dbf-bar { display: block; width: 100%; height: 5px; margin-top: 3px; border-radius: 3px; background: rgba(70,51,34,.12); overflow: hidden; }
  .dbf-bar > span { display: block; height: 100%; width: 100%; border-radius: 3px; background: #b8862b; transition: width 1s linear; }
  .dbf-node.is-pro .dbf-bar > span { background: #23655f; } .dbf-node.is-con .dbf-bar > span { background: #a4492d; }
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
  .dbr-acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .dbr-acts button { padding: 8px 14px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 9px; background: #fff; color: #201c18; font-weight: 800; font-size: 14px; line-height: 1.2; cursor: pointer; }
  .dbr-acts button.is-main { border-color: #b8862b; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; font-size: 15px; }
  .dbr-acts button.is-pro { border-color: #23655f; background: #23655f; color: #fff; } .dbr-acts button.is-con { border-color: #a4492d; background: #a4492d; color: #fff; }
  @media (prefers-reduced-motion: reduce) { .dbf-node.is-now button { animation: none; } }
  @media (max-width: 760px) { .dbf-nodes { gap: 8px 18px; padding: 12px; } .dbf-node button { min-width: 0; } .dbf-clock { font-size: 30px; } }
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
      + '<span class="dbb-status" data-dbb-status role="status"></span></div></div>';   // 2026-10-29 起胜负在“辩后投票”里按票数自动判定（见下面的辩论流程）
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
      const hide = event.target.closest('[data-dbb-hide]');
      if (lockButton && room) {
        if (!window.confirm(locked ? '按现在的点赞重新选定论点与辩手？辩论台上已有的发言会清空，阶段回到开始前。' : `选定两方各 ${DB.top} 个论点（每人一条、点赞最多的在前），作者担任一、二、三辩？选定后点赞再变也不换人。`)) return;
        lockButton.disabled = true;
        try { await backend.rpc('ck_debate_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_action: 'lock' }); status('已选定论点与辩手：点流程图的“下一步”开始正方立论。', true); notify(no); }
        catch (error) { status(`没有选定：${error.message || error}`); } finally { lockButton.disabled = false; }
      } else if (revealButton) {
        reveal = !reveal;
        notify(no);
      } else if (hide) {
        if (!window.confirm('隐藏这条发言？学生的聊天室里也看不到了，点赞也不再计入。')) return;
        try { await backend.rpc('ck_debate_hide', { p_post: Number(hide.dataset.dbbHide) || hide.dataset.dbbHide, p_hidden: true }); load(true); }
        catch (error) { status(`隐藏失败：${error.message || error}`); }
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

  // ---------- 辩论流程图 ＋ 辩论台（卡片里的主持面板 ＋ 全屏大屏）＋ 辩后投票结果 ----------
  // 2026-10-29 用户：“辩论赛的步骤，你要一步一步来，比如正反立论设置一个倒计时1分钟……可以直接在正文中点击，或者设置一个动态流程图来推动辩论的流程。
  // 然后把正方还是反方获胜放在辩后投票中，老师停止递交后，哪方获得的投票数多，哪方的三位辩友就自动获得修为值。”
  //   流程图放在辩论卡片正文最前面（代替投屏页上的静态“辩论流程”）：辩前投票·选论据卡（1 分钟）→ 聊天室（3 分钟）→ 选定论点与辩手 → 3v3 各阶段 → 辩后投票
  //   → 停止递交·公布胜负。当前一步高亮、倒计时，点“下一步”或点流程图里的任一步推进。前两步只在本机计时（存在本机，刷新不丢），其余由后台 ck_debate_control 计时、学生页同步。
  //   辩后投票停止递交（流程图最后一步、辩后投票里的按钮，或投屏统计里的“停止递交”）后，票多的一方三位辩手自动各加修为（ck_set_debate_winners）；平票由老师裁定，可撤销。
  const FLOW = [
    { key: 'prep', label: '辩前投票 · 选论据卡', secs: 60, local: true, hint: '学生投辩前票（投哪方就进哪方的聊天室），再选 2 张论据卡，都点“递交”' },
    { key: 'chat', label: '聊天室提论点', secs: 180, local: true, hint: '学生取昵称进本方聊天室，提出论点、给本方好论点点赞；“聊天室看板”实时显示' },
    { key: 'lock', label: '选定论点与辩手', secs: 0, hint: `每方点赞最多的 ${DB.top} 个论点入选，作者担任一、二、三辩` },
    ...STAGES,
    { key: 'result', label: '停止递交 · 公布胜负', secs: 0, hint: `辩后投票停止递交，票多的一方获胜，三位辩手自动各加 ${DB.points} 修为` },
  ];
  const flowIndex = (key) => FLOW.findIndex((step) => step.key === key);
  const duration = (secs) => (secs >= 60 ? `${secs / 60} 分钟` : `${secs} 秒`);
  stagesEls.forEach((holder) => {
    const no = holder.dataset.case;
    const section = holder.closest('[data-debate]') || holder.parentElement;
    const motion = (section.querySelector('[data-debate-motion], .interaction-heading h3') || {}).textContent || '';   // 政经辩论赛的辩题带 data-debate-motion
    // 辩后投票的题号：政经在作业里（debate.post，一个课堂一个案例），习经是“案例号:debate-post”
    const postKey = holder.closest('.cl-debate') ? 'debate.post' : `${no}:debate-post`;
    let room = null;
    let live = null;
    let fetchedAt = 0;
    let last = '';
    let busy = false;
    let seen = new Set();
    let stopped = false;   // 辩后投票已停止递交
    let tally = null;      // 辩后票数 { pro, con }
    let verdict = null;    // 判定结果 { side, pro, con, list } / { tie } / { cleared }
    let tallyAt = 0;
    const big = document.createElement('div');
    big.className = 'dbx';
    big.hidden = true;
    big.setAttribute('role', 'dialog');
    big.setAttribute('aria-label', '辩论大屏');
    document.body.appendChild(big);
    // 流程图：插在正文“辩论流程”的位置（投屏页上原来的静态流程隐藏）
    const flow = document.createElement('div');
    flow.className = 'dbf';
    flow.setAttribute('data-ix', '');
    const rules = section.querySelector('.debate-rules, .cl-debate-rules');
    if (rules) rules.insertAdjacentElement('beforebegin', flow); else holder.insertAdjacentElement('beforebegin', flow);
    section.classList.add('has-dbf');
    // 辩后投票结果：放在辩后投票那一块的最后
    const result = document.createElement('div');
    result.className = 'dbr';
    result.setAttribute('data-ix', '');
    const postBox = section.querySelector(`[data-vote-key="${no}:debate-post"], [data-debate-vote="post"]`);
    if (postBox) postBox.insertAdjacentElement('beforeend', result);

    const locked = () => Boolean(live && live.status === 'ok');
    const left = () => (locked() ? (live.paused ? live.left : Math.max(0, live.left - Math.floor((Date.now() - fetchedAt) / 1000))) : 0);
    const index = () => STAGES.findIndex((g) => g.key === (live && live.stage));
    const nextStage = () => (live.stage === 'ready' ? STAGES[0] : live.stage === 'vote' ? { key: 'done', secs: 0 } : STAGES[index() + 1] || null);
    const prevStage = () => (index() > 0 ? STAGES[index() - 1] : live.stage === 'done' ? STAGES[STAGES.length - 1] : null);
    // 前两步（辩前投票、聊天室）的本机计时
    const localKey = () => (room ? `classlive-debate-flow:${room.id}:${no}` : '');
    const readLocal = () => { try { return room ? JSON.parse(localStorage.getItem(localKey()) || 'null') : null; } catch (error) { return null; } };
    const writeLocal = (value) => { try { if (value) localStorage.setItem(localKey(), JSON.stringify(value)); else localStorage.removeItem(localKey()); } catch (error) { /* 忽略 */ } };
    const localLeft = (state) => (state.paused ? state.left : Math.max(0, Math.round((state.ends - Date.now()) / 1000)));
    // 流程图当前在哪一步：选定辩手以后看后台阶段，之前看本机计时
    function nowKey() {
      if (locked()) return live.stage === 'ready' ? 'lock' : live.stage === 'done' ? 'result' : live.stage;
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
      if (step.local) { const state = readLocal(); return state ? { s: localLeft(state), paused: state.paused, total: state.total || step.secs } : null; }
      return locked() ? { s: left(), paused: live.paused, total: Math.max(step.secs, left()) } : null;
    }
    const sayRow = (s) => `<li class="dbt-say is-${esc(s.side)}${seen.has(s.id) ? '' : ' is-new'}"><div><b>${SIDE[s.side]}${ROLE[s.role] || ''}<small>${esc(s.nick)}${reveal && s.name ? ` · ${esc(s.name)}` : ''}</small></b><span>${esc(s.text)}</span></div><button type="button" data-dbt-hide="${esc(s.id)}" title="隐藏这条发言" aria-label="隐藏这条发言">×</button></li>`;
    const argCard = (side, a) => {
      const thread = (live.says || []).filter((s) => s.target === a.n && STAGES.some((g) => g.key === s.stage && g.topic === side));
      return `<li class="dbt-arg is-${side}${live.topic === side ? ' is-topic' : ''}"><div class="dbt-arg-head"><span>${CIRCLE[a.n]}</span><b>${SIDE[side]}${ROLE[a.n]}</b><small>${esc(a.nick)}${reveal && a.name ? ` · ${esc(a.name)}` : ''}</small><em>♥ ${a.likes}</em></div>
        <p>${esc(a.text)}</p>${thread.length ? `<ul class="dbt-thread">${thread.map(sayRow).join('')}</ul>` : ''}</li>`;
    };
    const turnText = () => {
      const g = stageOf(live.stage);
      if (g && g.turn) return `${g.turn === 'both' ? '双方辩手都可以发言' : `轮到${SIDE[g.turn]}辩手发言`} · ${g.hint}`;
      return live.stage === 'vote' ? '全班根据六位辩手的发言投辩后票；停止递交后自动公布胜负'
        : live.stage === 'done' ? `辩论结束：票多的一方三位辩手各加 ${DB.points} 修为，再展开“裁判点评”` : '点流程图里的“下一步：正方立论”开始第一阶段';
    };
    // 大屏上的按钮（卡片上的推进按钮都在流程图里）
    const controls = (cls) => {
      const next = nextStage();
      const g = stageOf(live.stage);
      const timed = g && g.secs;
      if (cls !== 'big') {
        return `<button type="button" data-dbt-reveal>${reveal ? '收起姓名' : '揭晓姓名'}</button><button type="button" data-dbt-open>打开辩论大屏</button><button type="button" data-dbt-reset>清空辩论台</button>`;
      }
      return `<button type="button" data-dbt-prev${prevStage() ? '' : ' disabled'}>◀ 上一阶段</button>`
        + (next ? `<button type="button" class="is-main" data-dbt-next>${live.stage === 'ready' ? '开始' : '下一阶段'}：${esc(next.key === 'done' ? '停止递交，公布胜负' : next.label)} ▶</button>` : '')
        + (next && next.optional ? `<button type="button" data-dbt-skip>跳过${esc(next.label)}</button>` : '')
        + (timed ? `<button type="button" data-dbt-pause>${live.paused ? '继续计时' : '暂停计时'}</button><button type="button" data-dbt-extend>+30 秒</button>` : '')
        + `<button type="button" data-dbt-reveal>${reveal ? '收起姓名' : '揭晓姓名'}</button><button type="button" data-dbt-close>关闭大屏</button>`;
    };
    function paintClock() {
      const s = left();
      const g = locked() ? stageOf(live.stage) : null;
      const text = !g || !g.secs ? '' : live.paused ? `${fmt(s)} 暂停` : s > 0 ? fmt(s) : '时间到';
      [holder, big].forEach((root) => root.querySelectorAll('[data-dbt-clock]').forEach((el) => {
        el.textContent = text;
        el.classList.toggle('is-low', s > 0 && s <= 10 && !live.paused);
        el.classList.toggle('is-up', Boolean(g && g.secs) && s === 0 && !live.paused);
      }));
      paintFlow();
    }
    // ---------- 流程图 ----------
    function renderFlow() {
      const key = nowKey();
      const at = flowIndex(key);
      const step = FLOW[at];
      const next = nextStep();
      const clock = clockOf();
      const finished = key === 'result' && verdict && !verdict.tie;
      const nodes = FLOW.map((s, i) => {
        const state = at < 0 ? '' : i < at || (i === at && (s.key === 'lock' || finished)) ? 'is-done' : i === at ? 'is-now' : i === at + 1 ? 'is-next' : '';
        const side = s.turn === 'pro' ? ' is-pro' : s.turn === 'con' ? ' is-con' : s.turn === 'both' ? ' is-both' : '';
        return `<li class="dbf-node${side} ${state}${s.optional ? ' is-optional' : ''}"><button type="button" data-dbf-go="${s.key}" title="${esc(s.hint || '')}">`
          + `<i>${state === 'is-done' ? '✓' : i + 1}</i><b>${esc(s.label)}</b>${s.secs ? `<em>${duration(s.secs)}${s.optional ? ' · 可跳过' : ''}</em>` : ''}`
          + `${state === 'is-now' && s.secs ? '<span class="dbf-bar"><span data-dbf-bar></span></span>' : ''}</button></li>`;
      }).join('');
      const title = step ? step.label : '还没开始';
      const hint = !step ? '点“开始”：学生投辩前票、选论据卡（1 分钟）'
        : step.key === 'result' ? (verdict && verdict.side ? `${SIDE[verdict.side]}胜（${verdict.pro} : ${verdict.con}），见下面“辩后投票”里的结果` : verdict && verdict.tie ? '平票：请在下面“辩后投票”里裁定' : '辩后投票已停止递交')
          : step.key === 'lock' ? '已选定论点与辩手，点“下一步”开始正方立论' : step.hint;
      flow.innerHTML = `<div class="dbf-head"><span class="dbf-tag">辩论流程</span><div class="dbf-now"><b>${esc(title)}</b><small>${esc(hint)}</small></div><span class="dbf-clock" data-dbf-clock></span></div>
        <ol class="dbf-nodes">${nodes}</ol>
        <div class="dbf-ctrl">${next ? `<button type="button" class="is-main" data-dbf-next>${key ? '下一步' : '开始'}：${esc(next.label)} ▶</button>` : ''}`
        + (next && next.optional ? `<button type="button" data-dbf-skip>跳过${esc(next.label)}</button>` : '')
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
    async function go(step, quiet) {
      if (!room) { window.alert('当前没有开放本案例的课堂：先在教师工作台发布或打开“学生可进入”。'); return; }
      if (step.local) {
        if (locked()) { window.alert('已经选定了论点与辩手，辩前环节不再计时。要从头再来，先点辩论台的“清空辩论台”。'); return; }
        const state = readLocal();
        if (!quiet && state && !window.confirm(`切到“${step.label}”并重新计时 ${duration(step.secs)}？`)) return;
        writeLocal({ key: step.key, ends: Date.now() + step.secs * 1000, paused: false, left: step.secs, total: step.secs });
        renderFlow();
        return;
      }
      if (step.key === 'lock') { await lockDebaters(); return; }
      if (step.key === 'result') { await finish(); return; }
      if (!locked()) { window.alert('先完成“选定论点与辩手”，再开始辩论台的各个阶段。'); return; }
      if (!quiet && !window.confirm(`切到“${step.label}”并重新计时 ${duration(step.secs)}？`)) return;
      await control('stage', step.key, step.secs || 0);
    }
    async function lockDebaters() {
      const again = locked();
      if (!window.confirm(again ? '按现在的点赞重新选定论点与辩手？辩论台上已有的发言会清空，阶段回到开始前。'
        : `选定两方各 ${DB.top} 个论点（每人一条、点赞最多的在前），作者担任一、二、三辩？选定后点赞再变也不换人。`)) return;
      try {
        await backend.rpc('ck_debate_control', { p_classroom: Number(room.id) || room.id, p_case: no, p_action: 'lock' });
        writeLocal(null);
        await load(true);
        notify(no);
      } catch (error) {
        window.alert(`没有选定：${error.message || error}`);
      }
    }
    function pause() {
      const step = FLOW[flowIndex(nowKey())];
      if (step && step.local) {
        const state = readLocal();
        if (!state) return;
        writeLocal(state.paused ? { ...state, paused: false, ends: Date.now() + state.left * 1000 } : { ...state, paused: true, left: localLeft(state) });
        renderFlow();
        return;
      }
      if (locked()) control(live.paused ? 'resume' : 'pause');
    }
    function extend() {
      const step = FLOW[flowIndex(nowKey())];
      if (step && step.local) {
        const state = readLocal();
        if (!state) return;
        writeLocal(state.paused ? { ...state, left: state.left + 30, total: (state.total || step.secs) + 30 }
          : { ...state, ends: Math.max(state.ends, Date.now()) + 30000, total: (state.total || step.secs) + 30 });
        renderFlow();
        return;
      }
      if (locked()) control('extend', null, 30);
    }
    // ---------- 辩后投票：停止递交，按票数判定胜负并加修为 ----------
    async function loadTally(force) {
      if (!room || (!force && Date.now() - tallyAt < 4000)) return;
      tallyAt = Date.now();
      try {
        const board = await rpcOne('ck_debate_board', { p_classroom: Number(room.id) || room.id, p_case: no });
        tally = { pro: (board.pro || {}).votes || 0, con: (board.con || {}).votes || 0 };
        const stops = window.ClassLive.stopList(await backend.rpc('ck_stopped_items', { p_classroom: Number(room.id) || room.id }));
        stopped = stops.includes(postKey);
        // 刷新页面以后：已停止且今天已加过修为，按票数还原判定结果
        if (stopped && !verdict && Array.isArray(board.awarded) && board.awarded.length) {
          verdict = { side: tally.pro > tally.con ? 'pro' : tally.con > tally.pro ? 'con' : '', ...tally, list: board.awarded, restored: true };
        }
      } catch (error) {
        console.warn('[辩后投票]', error);
      }
    }
    async function decide(manual) {
      if (!room) return;
      try {
        await loadTally(true);
        const { pro, con } = tally || { pro: 0, con: 0 };
        const side = manual !== undefined ? manual : pro > con ? 'pro' : con > pro ? 'con' : null;
        if (manual === undefined && !side) {
          verdict = { tie: true, pro, con };
        } else {
          let list = await backend.rpc('ck_set_debate_winners', { p_classroom: Number(room.id) || room.id, p_case: no, p_side: side, p_points: DB.points });
          list = Array.isArray(list) ? list : [];
          verdict = side ? { side, pro, con, list, manual: manual !== undefined } : { cleared: true, pro, con };
        }
        notify(no);
      } catch (error) {
        window.alert(`公布胜负没有成功：${error.message || error}`);
      }
      renderResult();
      renderFlow();
    }
    async function finish() {
      if (!room) return;
      if (!window.confirm(`停止递交辩后票，按票数公布胜负？票多的一方三位辩手各加 ${DB.points} 修为（平票由你裁定）。`)) return;
      try {
        const stops = window.ClassLive.stopList(await backend.rpc('ck_stop_item', { p_classroom: Number(room.id) || room.id, p_item: postKey, p_stop: true }));
        stopped = stops.includes(postKey);
        document.dispatchEvent(new CustomEvent('classlive:stops', { detail: { source: 'debate', item: postKey, stops } }));
      } catch (error) {
        window.alert(`停止递交没有成功：${error.message || error}`);
        return;
      }
      await decide();
      if (locked() && live.stage !== 'done') await control('stage', 'done', 0);
    }
    function renderResult() {
      if (!postBox) return;
      if (!room) { result.innerHTML = ''; return; }
      const voting = locked() && ['vote', 'done'].includes(live.stage);
      const t = tally || { pro: 0, con: 0 };
      const score = `<div class="dbr-score"><span class="is-pro">正方 <b>${t.pro}</b> 票</span><i>:</i><span class="is-con">反方 <b>${t.con}</b> 票</span></div>`;
      const names = (list) => (list && list.length ? `已给 ${list.map((a) => esc(a.name)).join('、')} 各加 ${DB.points} 修为。` : '获胜方没有点名册内的辩手，没有加修为。');
      let body;
      if (verdict && verdict.side) {
        body = `<p class="dbr-win is-${verdict.side}">${SIDE[verdict.side]}胜</p><p class="dbr-note">${names(verdict.list)}${verdict.manual ? '（老师裁定）' : ''}</p>`
          + `<div class="dbr-acts"><button type="button" data-dbr-undo>撤销加修为</button><button type="button" data-dbr-side="${verdict.side === 'pro' ? 'con' : 'pro'}">改判${SIDE[verdict.side === 'pro' ? 'con' : 'pro']}胜</button></div>`;
      } else if (verdict && verdict.restored) {
        body = `<p class="dbr-note">${names(verdict.list)}（老师裁定）</p><div class="dbr-acts"><button type="button" data-dbr-undo>撤销加修为</button></div>`;
      } else if (verdict && verdict.tie) {
        body = '<p class="dbr-win">平票</p><p class="dbr-note">票数相同，请裁定哪一方获胜：</p>'
          + '<div class="dbr-acts"><button type="button" class="is-pro" data-dbr-side="pro">判正方胜</button><button type="button" class="is-con" data-dbr-side="con">判反方胜</button></div>';
      } else if (verdict && verdict.cleared) {
        body = '<p class="dbr-note">已撤销加修为。</p><div class="dbr-acts"><button type="button" data-dbr-decide>按票数重新公布</button></div>';
      } else if (stopped) {
        body = '<p class="dbr-note">辩后投票已停止递交。</p><div class="dbr-acts"><button type="button" class="is-main" data-dbr-decide>按票数公布胜负</button></div>';
      } else if (voting) {
        body = `<p class="dbr-note">学生正在投辩后票（票数每 5 秒更新）。点下面的按钮（或上面统计里的“停止递交”）停止递交后，票多的一方获胜，三位辩手自动各加 ${DB.points} 修为；平票由你裁定。</p>`
          + '<div class="dbr-acts"><button type="button" class="is-main" data-dbr-finish>停止递交，公布胜负</button></div>';
      } else {
        body = '<p class="dbr-note">辩论台进行到“辩后投票”时，这里显示票数；停止递交后自动公布胜负，给获胜方三位辩手加修为。</p>';
      }
      result.innerHTML = `<div class="dbr-box"><span class="dbr-tag">辩论结果</span>${voting || stopped || verdict ? score : ''}${body}</div>`;
    }
    result.addEventListener('click', async (event) => {
      const t = event.target;
      if (t.closest('[data-dbr-finish]')) finish();
      else if (t.closest('[data-dbr-decide]')) decide();
      else if (t.closest('[data-dbr-side]')) {
        const side = t.closest('[data-dbr-side]').dataset.dbrSide;
        if (window.confirm(`判${SIDE[side]}获胜：给${SIDE[side]}三位辩手（点名册内）各加 ${DB.points} 修为？原来加的会整份替换。`)) decide(side);
      } else if (t.closest('[data-dbr-undo]')) {
        if (window.confirm('撤销今天给辩手加的修为？')) decide(null);
      }
    });
    // 投屏统计里点了辩后投票的“停止递交”：同样按票数公布胜负
    document.addEventListener('classlive:stops', (event) => {
      const detail = event.detail || {};
      if (detail.source === 'debate' || !Array.isArray(detail.stops)) return;
      const now = detail.stops.includes(postKey);
      const changed = now && !stopped && detail.item === postKey;
      stopped = now;
      if (changed) decide().then(() => { if (locked() && live.stage === 'vote') control('stage', 'done', 0); });
      else { renderResult(); renderFlow(); }
    });

    function render() {
      renderFlow();
      renderResult();
      if (!room) { holder.innerHTML = '<div class="dbt"><p class="dbt-off">当前没有开放本案例的课堂：在教师工作台发布或打开“学生可进入”后，这里主持 3v3 辩论。</p></div>'; big.hidden = true; return; }
      if (!locked()) {
        holder.innerHTML = '<div class="dbt"><p class="dbt-off">按上面的流程图一步一步来：辩前投票、聊天室之后点“选定论点与辩手”，这里显示两方论点和辩手的发言，各阶段由流程图推进、计时。只有六位辩手能在辩论台发言。</p></div>';
        big.hidden = true;
        return;
      }
      const g = stageOf(live.stage);
      const cls = g && g.turn ? g.turn : 'none';
      const general = (live.says || []).filter((s) => !s.target);
      const cols = ['pro', 'con'].map((side) => `<section><h5>${SIDE[side]}论点</h5><ol class="dbt-args">${(live.args[side] || []).map((a) => argCard(side, a)).join('') || `<li class="dbt-empty">${SIDE[side]}没有入选的论点</li>`}</ol></section>`).join('');
      holder.innerHTML = `<div class="dbt is-${cls}">
        <header class="dbt-head"><div><b>${esc(stageLabel(live.stage))}</b><small>${esc(turnText())}</small></div><span class="dbt-clock" data-dbt-clock></span></header>
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
        if (room && ((locked() && ['vote', 'done'].includes(live.stage)) || stopped)) await loadTally(force);
        const key = JSON.stringify([live && { ...live, left: undefined }, reveal, Boolean(room), tally, stopped, verdict && verdict.side]);
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
        if (action === 'reset' || action === 'lock') { writeLocal(null); verdict = null; }
        if (action === 'stage' && stage === 'vote' && !stopped) verdict = null;   // 回到辩后投票重新投：清掉上一次的判定
        render();
        notify(no);
      } catch (error) {
        window.alert(`没有成功：${error.message || error}`);
      }
    }
    const onClick = (event) => {
      const t = event.target;
      if (t.closest('[data-dbt-next]')) { const n = nextStage(); if (n && n.key === 'done') finish(); else if (n) control('stage', n.key, n.secs || 0); }
      else if (t.closest('[data-dbt-skip]')) { const n = nextStage(); const after = n && STAGES[STAGES.findIndex((g) => g.key === n.key) + 1]; if (after) control('stage', after.key, after.secs || 0); }
      else if (t.closest('[data-dbt-prev]')) { const p = prevStage(); if (p) control('stage', p.key, p.secs || 0); }
      else if (t.closest('[data-dbt-pause]')) control(live.paused ? 'resume' : 'pause');
      else if (t.closest('[data-dbt-extend]')) control('extend', null, 30);
      else if (t.closest('[data-dbt-reveal]')) { reveal = !reveal; notify(no); }
      else if (t.closest('[data-dbt-open]')) { big.hidden = false; render(); }
      else if (t.closest('[data-dbt-close]')) big.hidden = true;
      else if (t.closest('[data-dbt-reset]')) { if (window.confirm('清空辩论台？入选的论点、辩手名单和辩论台上的发言都会删掉，流程图回到开始，聊天室不受影响。')) control('reset'); }
      else if (t.closest('[data-dbt-hide]')) {
        const id = t.closest('[data-dbt-hide]').dataset.dbtHide;
        if (window.confirm('隐藏这条辩论台发言？学生页和大屏都不再显示。')) backend.rpc('ck_debate_hide_say', { p_id: Number(id) || id, p_hidden: true }).then(() => load(true)).catch((error) => window.alert(`隐藏失败：${error.message || error}`));
      }
    };
    holder.addEventListener('click', onClick);
    big.addEventListener('click', onClick);
    flow.addEventListener('click', (event) => {
      const t = event.target;
      if (t.closest('[data-dbf-next]')) { const n = nextStep(); if (n) go(n, true); }
      else if (t.closest('[data-dbf-skip]')) { const n = nextStep(); const after = n && FLOW[flowIndex(n.key) + 1]; if (after) go(after, true); }
      else if (t.closest('[data-dbf-pause]')) pause();
      else if (t.closest('[data-dbf-extend]')) extend();
      else if (t.closest('[data-dbf-go]')) { const step = FLOW[flowIndex(t.closest('[data-dbf-go]').dataset.dbfGo)]; if (step) go(step, false); }
    });
    document.addEventListener('keydown', (event) => { if (!big.hidden && event.key === 'Escape') big.hidden = true; });
    listen(no, () => load(true));
    renderFlow();
    renderResult();
    load(true);
    setInterval(paintClock, 1000);
    setInterval(() => {
      if (document.hidden) return;
      const rect = section.getBoundingClientRect();
      if (big.hidden && (rect.bottom < -200 || rect.top > window.innerHeight + 200 || section.closest('[hidden]'))) return;
      load(false);
    }, 2000);
  });
})();
