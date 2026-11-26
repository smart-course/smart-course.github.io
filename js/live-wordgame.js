/* 猜词游戏大屏（2026-11-26，两门课的网站页面）
 * 用户：“习经中每章的正文都加入猜词游戏（作为额外游戏，不计入原有时间分值），放在出门测的前面，然后设置大屏模式，一开始让学生选择加入/不加入；
 *   然后加入的同学投票选择抽1人上台或抽2人上台，哪个票数多就选择抽相应的人数，如果抽1人上台的票数多的话，被抽中的那个同学，
 *   可以直接输入或者在下拉菜单中选择他的搭档。抽两人上台就直接抽就行。教师页面可以帮助重新选择搭档，或者调换顺序。风格改成跟PK赛一样的大屏模式。
 *   时间还是1-5分钟，教师可以选择。政经中把这个游戏放在课后自修前面。”
 * 页面：网站构建时（tools/wordgame_site.py）在习经每个案例的“出门测”前面、政经每课“课后自修”前面放一块“猜词游戏”（[data-wgx]）。
 *   它不是步骤：不进本课的时间安排，也不算进每次课 100 分（额外小游戏）。
 * 学生页（live-student.js 调 ClassLiveWordGame.student）：老师打开猜词大屏以后，弹出“加入／不加入”；加入的同学投票“抽 1 人上台”还是“抽 2 人上台”；
 *   抽 1 人时，被抽中的同学在自己的页面上输入名字或在下拉里选搭档（只能选这一轮加入了的同学）；轮到上台时提醒自己的角色。
 *   这一块显示进行到哪一步和今天的得分。学生页拿不到词（词只在投屏页）。旁听、请假补做、只查看以前课堂的不参加；学生版测试页（王不凡）只看不记。
 * 投屏页（课堂完整版／讲解版，页面里有猜词词组 [data-wordgame-data]）：这一块是“打开猜词大屏”的控制条；课堂工具里原来的猜词游戏在网站上也改成打开这个大屏
 *   （后台还没有这组函数时，原来的照常用）。大屏照 PK 对决的样子（深色底、金色字、红蓝两方）：加入人数和名单 → 投票条 → 抽人（名字滚动）→
 *   选搭档（老师可以代选）→ 描述人（红）对猜词人（蓝）：可调换、换人、重抽某一位，选 1—5 分钟和词组 → 3、2、1 → 猜词（猜对 +1、跳过、作废，键盘 →／↓／X）→
 *   本轮回顾（词、结果、教材原文）→ 得分榜（今天本课堂各轮，记在后台）→ 给今天第一名加修为（每人 +10，沿用 ck_set_wordgame_winners）。
 * 后台：ck_wg_live／ck_wg_join／ck_wg_vote／ck_wg_pick／ck_wg_control（tools/cloudbase-pg-20261126-猜词游戏大屏.sql）。
 */
(function () {
  'use strict';
  const SQL = 'tools/cloudbase-pg-20261126-猜词游戏大屏.sql';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const one = (value) => (Array.isArray(value) ? value[0] : value) || {};
  const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
  const pad2 = (n) => String(n).padStart(2, '0');
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; };
  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const ROLE = { describer: '描述人', guesser: '猜词人' };
  const FACE = { describer: '面对大屏，用自己的话描述，不能说出词里的任何一个字', guesser: '背对大屏，听搭档描述，说出这个词' };
  const PHASE = { join: '等大家加入', vote: '投票：抽几人上台', pick: '抽中的同学选搭档', ready: '准备上台', play: '猜词进行中', done: '本轮结束' };

  // ---------- 样式：学生页卡片和弹窗（随字号档位温和放大）、投屏大屏（用 vw，不改） ----------
  const CARD_CSS = `
  .wgx-live { margin-top: 14px; color: #201c18; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .wgx-panel { margin: 0 0 8px; padding: 20px 22px; border: 1px solid rgba(70,51,34,.16); border-radius: 14px; background: #fffdf8; box-shadow: 0 9px 24px rgba(53,38,24,.08); }
  .wgx-panel .wgx-rules { display: grid; gap: 6px; margin: 0 0 6px; padding-left: 22px; font-size: 16px; line-height: 1.65; }
  .wgx-panel .wgx-extra { display: inline-block; margin: 0 0 10px; padding: 2px 10px; border-radius: 999px; color: #7a4b00; background: #f6e3b4; font-size: 13px; font-weight: 800; }
  .wgx-s-quiet { margin: 0; color: #6d6259; }
  .wgx-s-wait { display: flex; align-items: center; gap: 10px; margin: 0; padding: 12px 14px; border: 1px dashed rgba(70,51,34,.3); border-radius: 12px; background: #fffaf0; color: #5b4a33; font-weight: 700; }
  .wgx-dot { flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; background: #e0a33a; animation: wgxBlink 1.4s ease-in-out infinite; }
  @keyframes wgxBlink { 50% { opacity: .25; } }
  .wgx-s-round { padding: 14px 16px 16px; border-radius: 14px; color: #fff; background: radial-gradient(ellipse at 50% 0%, #2a2238 0%, #17131d 70%, #0e0c12 100%); box-shadow: 0 10px 26px rgba(23,19,29,.25); }
  .wgx-s-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 10px; }
  .wgx-s-head b { color: #ffd98a; font-size: 17px; }
  .wgx-s-phase { padding: 1px 10px; border: 1px solid rgba(255,217,138,.6); border-radius: 999px; color: #ffe8a8; font-size: 13px; font-weight: 800; }
  .wgx-s-count { margin-left: auto; color: rgba(255,255,255,.72); font-size: 13.5px; }
  .wgx-s-round p { margin: 0 0 10px; }
  .wgx-s-hot { color: #ffe8a8; font-weight: 800; font-size: 16.5px; }
  .wgx-s-ok { color: #9be0c9; font-weight: 800; }
  .wgx-s-btns { display: flex; flex-wrap: wrap; gap: 10px; margin: 0 0 10px; }
  .wgx-live button, .wgx-pop button { font-family: inherit; }
  .wgx-s-btns button, .wgx-s-pick button, .wgx-s-votes button { min-height: 46px; padding: 8px 18px; border: 1px solid rgba(255,255,255,.45); border-radius: 10px; color: #fff; background: rgba(255,255,255,.1); font-size: 16px; font-weight: 800; line-height: 1.25; cursor: pointer; }
  .wgx-live .is-main, .wgx-pop .is-main { border-color: #ffd98a; color: #2b2118; background: #ffd98a; }
  .wgx-s-btns button:disabled, .wgx-s-votes button:disabled, .wgx-s-pick button:disabled { opacity: .5; cursor: default; }
  .wgx-s-link { padding: 2px 4px; border: 0; border-bottom: 1px dashed rgba(255,255,255,.55); color: rgba(255,255,255,.85); background: none; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  .wgx-s-votes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 10px; }
  .wgx-s-votes button { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 68px; }
  .wgx-s-votes button small { font-size: 12.5px; font-weight: 600; opacity: .85; }
  .wgx-s-votes button.is-red { border-color: rgba(240,160,140,.8); }
  .wgx-s-votes button.is-blue { border-color: rgba(143,184,230,.8); }
  .wgx-s-votes button.is-red[aria-pressed="true"] { background: #c8452d; border-color: #f0a08c; }
  .wgx-s-votes button.is-blue[aria-pressed="true"] { background: #2f6fb3; border-color: #8fb8e6; }
  .wgx-s-tally { color: rgba(255,255,255,.78); font-size: 13.5px; }
  .wgx-s-pick { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; align-items: end; margin: 0 0 10px; }
  .wgx-s-pick label { display: grid; gap: 4px; color: rgba(255,255,255,.8); font-size: 13px; font-weight: 700; }
  .wgx-s-pick input, .wgx-s-pick select { box-sizing: border-box; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid rgba(255,255,255,.5); border-radius: 9px; color: #201c18; background: #fffdf8; font: inherit; font-size: 16px; }
  .wgx-s-duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0 0 10px; }
  .wgx-s-duo span { padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 700; }
  .wgx-s-duo span b { display: block; font-size: 19px; line-height: 1.35; }
  .wgx-s-duo .is-red { background: linear-gradient(90deg, rgba(200,69,45,.85), rgba(200,69,45,.35)); }
  .wgx-s-duo .is-blue { background: linear-gradient(270deg, rgba(47,111,179,.85), rgba(47,111,179,.35)); text-align: right; }
  .wgx-s-duo .is-me { box-shadow: 0 0 0 2px #ffd98a, 0 0 18px rgba(255,217,138,.45); }
  .wgx-s-clock b { color: #ffd98a; font: 900 26px/1 Georgia, "Times New Roman", serif; }
  .wgx-s-me { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.14); color: rgba(255,255,255,.75); font-size: 13.5px; }
  .wgx-s-note { margin: 8px 0 0 !important; padding: 7px 10px; border-radius: 8px; color: #2b2118; background: #ffe8a8; font-size: 14px; font-weight: 700; }
  .wgx-s-board { margin-top: 12px; padding: 10px 14px; border: 1px solid rgba(70,51,34,.16); border-radius: 12px; background: #fffaf0; }
  .wgx-s-board summary { color: #5b4a33; font-weight: 800; cursor: pointer; }
  .wgx-s-board ol { margin: 8px 0 0; padding-left: 22px; }
  .wgx-s-board li.is-top { color: #8a5a00; font-weight: 800; }
  .wgx-pop { position: fixed; left: 50%; bottom: 24px; z-index: 2147482000; box-sizing: border-box; width: min(560px, calc(100vw - 28px)); max-height: calc(100vh - 40px); overflow-y: auto; transform: translateX(-50%);
    padding: 18px 20px 16px; border: 1px solid rgba(255,217,138,.55); border-radius: 18px; color: #fff; background: radial-gradient(ellipse at 50% 0%, #2a2238 0%, #17131d 70%, #0e0c12 100%);
    box-shadow: 0 24px 60px rgba(14,12,18,.45), 0 0 0 4px rgba(255,217,138,.25); font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; animation: wgxPopIn .35s ease; }
  .wgx-pop[hidden] { display: none; }
  @keyframes wgxPopIn { from { opacity: 0; transform: translate(-50%, 24px); } to { opacity: 1; transform: translate(-50%, 0); } }
  .wgx-pop-x { position: absolute; top: 10px; right: 10px; width: 34px; height: 34px; border: 1px solid rgba(255,255,255,.4); border-radius: 50%; color: #fff; background: transparent; font-size: 20px; line-height: 1; cursor: pointer; }
  .wgx-pop-kicker { margin: 0 44px 2px 0; color: #e7c98c; font-size: 13.5px; font-weight: 800; letter-spacing: .06em; }
  .wgx-pop h3 { margin: 0 44px 12px 0; color: #fff; font-size: 20px; line-height: 1.4; }
  .wgx-pop .wgx-s-round { padding: 0; background: none; box-shadow: none; }
  .wgx-pop .wgx-s-head { display: none; }
  .wgx-t-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 14px; border: 2px solid #c9a24a; border-radius: 14px; background: linear-gradient(135deg, #2a2238, #17131d); color: #fff; }
  .wgx-t-open { padding: 11px 22px; border: 1px solid #ffd98a; border-radius: 10px; color: #2b2118; background: #ffd98a; font: inherit; font-size: 18px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 14px rgba(255,217,138,.3); }
  .wgx-t-open:disabled { opacity: .5; cursor: default; }
  .wgx-t-state { flex: 1 1 260px; min-width: 0; color: #ffe8a8; font-weight: 700; }
  .wgx-t-note { margin: 8px 0 0; color: #6d6259; font-size: 13.5px; }
  .wgx-tb { display: grid; gap: 8px; margin-top: 8px; }
  .wgx-tb p { margin: 0; color: #6d6259; font-size: 13.5px; line-height: 1.55; }
  .wgx-tb button { justify-self: start; padding: 9px 16px; border: 1px solid #b5701e; border-radius: 10px; color: #2b2118; background: linear-gradient(180deg, #f6c765, #dd9a2c); font: inherit; font-weight: 800; cursor: pointer; }
  @media (max-width: 640px) {
    .wgx-panel { padding: 16px 14px; }
    .wgx-s-pick { grid-template-columns: minmax(0, 1fr); }
    .wgx-s-votes { grid-template-columns: minmax(0, 1fr); }
    .wgx-pop { bottom: 8px; padding: 14px 14px 12px; }
  }
  @media print { .wgx-live, .wgx-pop { display: none !important; } }
  `;
  const STAGE_CSS = `
  .wgx-stage { --wgx-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; --wgx-serif: "Songti SC", "STSong", "SimSun", serif;
    position: fixed; z-index: 600; inset: 0; display: flex; flex-direction: column; padding: 22px 34px 24px; color: #fff;
    background: radial-gradient(ellipse at 50% 0%, #2a2238 0%, #17131d 60%, #0e0c12 100%); font-family: var(--wgx-sans); text-align: left; }
  .wgx-stage[hidden] { display: none; }
  body.wgx-stage-open { overflow: hidden; }
  .wgx-stage button { font-family: var(--wgx-sans); }
  .wgx-close { position: absolute; top: 18px; right: 22px; display: grid; place-items: center; width: 50px; height: 50px; padding: 0; border: 1px solid rgba(255,255,255,.45); border-radius: 8px; color: #fff; background: transparent; font-size: 30px; line-height: 1; cursor: pointer; }
  .wgx-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 24px; padding-right: 70px; font: 800 22px/1.4 var(--wgx-sans); }
  .wgx-kicker { color: #e7c98c; }
  .wgx-info { color: rgba(255,255,255,.75); font-size: 18px; }
  .wgx-center { position: relative; flex: 1; min-height: 0; display: grid; place-items: center; overflow: auto; padding: 6px 0; }
  .wgx-note { min-height: 28px; margin: 6px 0; text-align: center; color: #ffe8a8; font: 700 clamp(17px, 1.6vw, 22px)/1.4 var(--wgx-sans); }
  .wgx-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
  .wgx-actions button { min-width: 130px; min-height: 58px; padding: 8px 20px; border: 1px solid rgba(255,255,255,.5); border-radius: 8px; color: #fff; background: rgba(255,255,255,.12); font: 800 22px/1.2 var(--wgx-sans); cursor: pointer; }
  .wgx-actions button small { display: block; margin-top: 2px; font-size: 13px; font-weight: 600; opacity: .75; }
  .wgx-stage .is-go { border-color: #ffd98a !important; color: #2b2118 !important; background: #ffd98a !important; }
  .wgx-stage .is-good { border-color: #6fb3a8 !important; background: #23655f !important; }
  .wgx-stage .is-red { border-color: #f0a08c !important; background: #c8452d !important; }
  .wgx-stage .is-blue { border-color: #8fb8e6 !important; background: #2f6fb3 !important; }
  .wgx-actions button:disabled { opacity: .45; cursor: default; }
  .wgx-box { width: min(1180px, 95vw); }
  .wgx-h { margin: 0 0 8px; text-align: center; font: 900 clamp(34px, 4vw, 60px)/1.2 var(--wgx-sans); }
  .wgx-sub { margin: 0 0 14px; text-align: center; color: rgba(255,255,255,.8); font: 700 clamp(18px, 1.7vw, 26px)/1.5 var(--wgx-sans); }
  .wgx-big { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 6px 16px; margin: 6px 0 14px; }
  .wgx-big strong { color: #ffd98a; font: 900 clamp(80px, 10vw, 150px)/1 Georgia, "Times New Roman", serif; text-shadow: 0 0 34px rgba(255,217,138,.55); }
  .wgx-big span { font: 800 clamp(24px, 2.4vw, 36px)/1.2 var(--wgx-sans); }
  .wgx-big em { flex-basis: 100%; text-align: center; color: rgba(255,255,255,.7); font: 600 clamp(15px, 1.4vw, 20px)/1.5 var(--wgx-sans); font-style: normal; }
  .wgx-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-height: 34vh; overflow: auto; }
  .wgx-chips span { padding: 3px 14px; border: 1px solid rgba(255,217,138,.45); border-radius: 999px; background: rgba(255,217,138,.14); font: 800 clamp(16px, 1.5vw, 22px)/1.5 var(--wgx-sans); white-space: nowrap; animation: wgxIn .4s ease; }
  @keyframes wgxIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
  .wgx-bars { display: grid; gap: 16px; margin: 10px auto 0; width: min(980px, 92vw); }
  .wgx-bar { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 96px; padding: 10px 24px; overflow: hidden; border: 2px solid rgba(255,255,255,.18); border-radius: 16px; background: rgba(255,255,255,.06); }
  .wgx-bar i { position: absolute; inset: 0 auto 0 0; z-index: 0; transition: width .6s ease; }
  .wgx-bar.is-red i { background: linear-gradient(90deg, rgba(200,69,45,.9), rgba(200,69,45,.45)); }
  .wgx-bar.is-blue i { background: linear-gradient(90deg, rgba(47,111,179,.9), rgba(47,111,179,.45)); }
  .wgx-bar > span, .wgx-bar > strong { position: relative; z-index: 1; }
  .wgx-bar > span { font: 900 clamp(26px, 2.8vw, 42px)/1.2 var(--wgx-sans); }
  .wgx-bar > span small { display: block; margin-top: 2px; font: 700 clamp(15px, 1.3vw, 19px)/1.4 var(--wgx-sans); opacity: .85; }
  .wgx-bar > strong { font: 900 clamp(52px, 6vw, 88px)/1 Georgia, "Times New Roman", serif; }
  .wgx-bar.is-lead { border-color: #ffd98a; box-shadow: 0 0 0 3px rgba(255,217,138,.3), 0 0 26px rgba(255,217,138,.35); }
  .wgx-roll { display: flex; flex-wrap: wrap; justify-content: center; gap: 20px 40px; }
  .wgx-roll div { min-width: min(420px, 40vw); padding: 18px 26px; border-radius: 16px; text-align: center; }
  .wgx-roll div.is-red { background: linear-gradient(90deg, rgba(200,69,45,.85), rgba(200,69,45,.35)); }
  .wgx-roll div.is-blue { background: linear-gradient(270deg, rgba(47,111,179,.85), rgba(47,111,179,.35)); }
  .wgx-roll div.is-gold { background: rgba(255,217,138,.16); border: 2px solid #ffd98a; }
  .wgx-roll span { display: block; font: 800 clamp(18px, 1.7vw, 24px)/1.4 var(--wgx-sans); opacity: .85; }
  .wgx-roll b { display: block; font: 900 clamp(48px, 6vw, 92px)/1.2 var(--wgx-sans); }
  .wgx-drawn { display: flex; justify-content: center; margin: 6px 0 12px; }
  .wgx-drawn div { padding: 16px 40px; border: 2px solid #ffd98a; border-radius: 18px; background: rgba(255,217,138,.12); text-align: center; box-shadow: 0 0 30px rgba(255,217,138,.3); animation: wgxIn .5s ease; }
  .wgx-drawn b { display: block; font: 900 clamp(56px, 7vw, 104px)/1.15 var(--wgx-sans); }
  .wgx-drawn small { display: block; color: #ffe8a8; font: 700 clamp(16px, 1.5vw, 22px)/1.4 var(--wgx-sans); }
  .wgx-wait::after { content: "…"; display: inline-block; width: 1.2em; animation: wgxBlink 1.2s steps(3) infinite; }
  @keyframes wgxBlink { 50% { opacity: .2; } }
  .wgx-help, .wgx-setup { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px 14px; margin: 12px 0 0; font: 700 clamp(16px, 1.4vw, 20px)/1.4 var(--wgx-sans); }
  .wgx-stage select { max-width: 100%; min-height: 44px; padding: 6px 10px; border: 1px solid rgba(255,255,255,.5); border-radius: 8px; color: #201c18; background: #fffdf8; font: 700 clamp(15px, 1.3vw, 19px)/1.3 var(--wgx-sans); }
  .wgx-help button, .wgx-side-tools button { min-height: 44px; padding: 6px 16px; border: 1px solid rgba(255,255,255,.55); border-radius: 8px; color: #fff; background: rgba(255,255,255,.14); font: 800 clamp(15px, 1.3vw, 19px)/1.2 var(--wgx-sans); cursor: pointer; }
  .wgx-duel { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 16px; }
  .wgx-side { display: grid; align-content: start; gap: 4px; min-width: 0; padding: 16px 20px; border-radius: 16px; }
  .wgx-side.is-red { background: linear-gradient(90deg, rgba(200,69,45,.85), rgba(200,69,45,.35)); }
  .wgx-side.is-blue { background: linear-gradient(270deg, rgba(47,111,179,.85), rgba(47,111,179,.35)); text-align: right; }
  .wgx-tag { font: 800 clamp(16px, 1.5vw, 22px)/1.3 var(--wgx-sans); opacity: .9; }
  .wgx-side b { font: 900 clamp(46px, 5.6vw, 86px)/1.15 var(--wgx-sans); overflow-wrap: anywhere; }
  .wgx-side small { color: rgba(255,255,255,.8); font: 700 clamp(14px, 1.2vw, 18px)/1.4 var(--wgx-sans); }
  .wgx-side-tools { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .wgx-side.is-blue .wgx-side-tools { justify-content: flex-end; }
  .wgx-swap { align-self: center; width: 76px; height: 76px; border: 2px solid #ffd98a; border-radius: 50%; color: #ffd98a; background: rgba(255,217,138,.08); font: 900 34px/1 Georgia, serif; cursor: pointer; text-shadow: 0 0 14px rgba(255,217,138,.6); }
  .wgx-swap:disabled { opacity: .4; cursor: default; }
  .wgx-mins { display: inline-flex; flex-wrap: wrap; gap: 6px; }
  .wgx-mins button { min-width: 82px; min-height: 44px; padding: 4px 12px; border: 1px solid #ffd98a; border-radius: 8px; color: #ffd98a; background: transparent; font: 800 clamp(15px, 1.3vw, 19px)/1.2 var(--wgx-sans); cursor: pointer; }
  .wgx-mins button[aria-pressed="true"] { color: #2b2118; background: #ffd98a; }
  .wgx-play { display: grid; gap: 10px; width: min(1240px, 96vw); }
  .wgx-play-top { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 16px; }
  .wgx-play-top span { padding: 8px 16px; border-radius: 12px; font: 800 clamp(18px, 1.7vw, 26px)/1.3 var(--wgx-sans); }
  .wgx-play-top span b { margin-left: 8px; font-size: 1.2em; }
  .wgx-play-top .is-red { background: linear-gradient(90deg, rgba(200,69,45,.85), rgba(200,69,45,.3)); }
  .wgx-play-top .is-blue { background: linear-gradient(270deg, rgba(47,111,179,.85), rgba(47,111,179,.3)); text-align: right; }
  .wgx-timer { color: #ffd98a; font: 900 clamp(56px, 6.5vw, 104px)/1 Georgia, "Times New Roman", serif; text-shadow: 0 0 30px rgba(255,217,138,.55); }
  .wgx-timer.is-low { color: #ff8f78; animation: wgxBlink 1s ease-in-out infinite; }
  .wgx-word { display: grid; place-items: center; min-height: 34vh; padding: 10px 20px; border: 2px solid rgba(255,217,138,.35); border-radius: 22px; background: rgba(255,255,255,.04);
    font: 900 clamp(72px, 12vw, 200px)/1.1 var(--wgx-serif); text-align: center; text-shadow: 0 0 40px rgba(255,217,138,.35); overflow-wrap: anywhere; animation: wgxIn .25s ease; }
  .wgx-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 28px; color: rgba(255,255,255,.85); font: 800 clamp(18px, 1.7vw, 26px)/1.3 var(--wgx-sans); }
  .wgx-meta b { color: #ffd98a; font-family: Georgia, "Times New Roman", serif; font-size: 1.25em; }
  .wgx-count { position: absolute; inset: 0; display: grid; place-items: center; color: #ffd98a; font: 900 clamp(140px, 18vw, 260px)/1 Georgia, serif; text-shadow: 0 0 40px rgba(255,217,138,.7); pointer-events: none; }
  .wgx-count.is-tick { animation: wgxPop .9s ease; }
  @keyframes wgxPop { 0% { opacity: 0; transform: scale(.6); } 30% { opacity: 1; transform: scale(1.1); } 100% { opacity: .9; transform: scale(1); } }
  .wgx-review, .wgx-board { width: min(1180px, 95vw); }
  .wgx-review table, .wgx-board table { width: 100%; border-collapse: collapse; font: 700 clamp(16px, 1.45vw, 21px)/1.5 var(--wgx-sans); }
  .wgx-review th, .wgx-review td, .wgx-board th, .wgx-board td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,.14); text-align: left; vertical-align: top; }
  .wgx-review th, .wgx-board th { color: #e7c98c; font-size: .85em; }
  .wgx-review td:first-child { font-family: var(--wgx-serif); font-size: 1.2em; white-space: nowrap; }
  .wgx-review td small { display: block; color: rgba(255,255,255,.6); font-size: .8em; }
  .wgx-review td.ok { color: #9be0c9; white-space: nowrap; }
  .wgx-review td.skip, .wgx-review td.left { color: rgba(255,255,255,.6); white-space: nowrap; }
  .wgx-review td.foul { color: #ffb199; white-space: nowrap; }
  .wgx-board tr.is-top td { color: #ffd98a; }
  .wgx-board td:last-child { font: 900 1.3em/1 Georgia, serif; }
  .wgx-rules { width: min(1100px, 94vw); }
  .wgx-rules ol { display: grid; gap: 12px; margin: 0; padding-left: 1.4em; font: 700 clamp(20px, 2vw, 30px)/1.55 var(--wgx-sans); }
  @media (max-width: 900px) {
    .wgx-stage { padding: 16px 14px 16px; }
    .wgx-duel, .wgx-play-top { grid-template-columns: minmax(0, 1fr); }
    .wgx-side.is-blue, .wgx-play-top .is-blue { text-align: left; }
    .wgx-swap { justify-self: center; }
  }
  @media print { .wgx-stage { display: none !important; } }
  `;
  let cardStyled = false;
  let stageStyled = false;
  function addStyle(stage) {
    if (!cardStyled) {
      const style = document.createElement('style');
      style.dataset.readable = 'panel';
      style.textContent = CARD_CSS;
      document.head.appendChild(style);
      cardStyled = true;
    }
    if (stage && !stageStyled) {
      const style = document.createElement('style');
      style.dataset.readable = 'skip';   // 大屏的字号按屏幕宽度（vw）定，字号档位不再改
      style.textContent = STAGE_CSS;
      document.head.appendChild(style);
      stageStyled = true;
    }
  }

  // ---------- 学生页 ----------
  function student(ctx) {
    const backend = ctx && ctx.backend;
    const identity = (ctx && ctx.identity) || {};
    const cards = Array.from(document.querySelectorAll('[data-wgx]'));
    if (!backend || !cards.length || cards[0].dataset.wgxReady) return;
    cards.forEach((card) => { card.dataset.wgxReady = '1'; });
    addStyle(false);
    const shield = typeof ctx.shield === 'function' ? ctx.shield : () => {};
    const boxes = cards.map((card) => {
      let box = card.querySelector('[data-wgx-live]');
      if (!box) {
        box = document.createElement('div');
        box.setAttribute('data-wgx-live', '');
        card.appendChild(box);
      }
      box.classList.add('wgx-live');
      shield(box);
      return box;
    });
    // 输入框、下拉框重画时保留同学已经输入、选好的内容和光标
    const keepInputs = (root, fn) => {
      const saved = Array.from(root.querySelectorAll('[data-wgx-name], [data-wgx-sel]')).map((el) => ({
        name: el.hasAttribute('data-wgx-name'), value: el.value, focus: document.activeElement === el,
        start: el.hasAttribute('data-wgx-name') ? el.selectionStart : null, end: el.hasAttribute('data-wgx-name') ? el.selectionEnd : null,
      }));
      const board = root.querySelector('details.wgx-s-board');
      const boardOpen = Boolean(board && board.open);
      fn();
      if (boardOpen) { const again = root.querySelector('details.wgx-s-board'); if (again) again.open = true; }
      saved.forEach((s) => {
        const el = root.querySelector(s.name ? '[data-wgx-name]' : '[data-wgx-sel]');
        if (!el) return;
        if (!s.name && !Array.from(el.options).some((o) => o.value === s.value)) return;
        el.value = s.value;
        if (s.focus) {
          el.focus();
          if (s.start != null) { try { el.setSelectionRange(s.start, s.end); } catch (error) { /* 忽略 */ } }
        }
      });
    };
    const sigs = new WeakMap();   // 内容没变就不重画（输入框、展开的得分不会被打断）
    const put = (root, html) => {
      if (sigs.get(root) === html) return;
      keepInputs(root, () => { root.innerHTML = html; });
      sigs.set(root, html);
    };
    const why = ctx.audit ? '旁听同学不参加课堂小游戏，可以看大屏一起猜。'
      : ctx.makeup ? '猜词游戏只在上课时进行，请假补做时不能参加。'
        : ctx.viewing ? '查看以前的课堂时不能参加猜词游戏。'
          : !ctx.joined ? '用课堂码登录本课堂以后，老师开始猜词游戏时可以在这里加入。' : '';
    if (why) { boxes.forEach((box) => put(box, `<p class="wgx-s-quiet">${esc(why)}</p>`)); return; }
    const preview = Boolean(ctx.preview);
    const roomId = Number(identity.classroom) || identity.classroom;
    let res = null;
    let off = false;
    let fails = 0;
    let busy = false;
    let note = '';
    let noteRound = null;
    let offset = 0;
    let lastPoll = 0;
    const dismissed = new Set();
    const serverNow = () => Date.now() + offset;
    const RESULT = {
      closed: '老师还没打开猜词游戏，或者已经收起了。',
      phase: '这一步已经过去了，看看上面最新的进度。',
      onstage: '你正在台上，这一轮不能退出。',
      notjoined: '先点“加入”才能投票。',
      self: '不能选自己当搭档。',
      many: '有同名的同学：请在下拉名单里选（名字后面带点名册编号）。',
      nobody: '没找到这位同学：检查一下名字，或者在下拉名单里选。',
      teacher: '测试页：只能看，不能加入、投票或选搭档（同学在自己的页面上操作）。',
    };
    const say = (text) => { note = text || ''; noteRound = res && res.round ? res.round.id : null; };

    const pop = document.createElement('div');
    pop.className = 'wgx-pop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', '猜词游戏');
    document.body.appendChild(pop);
    shield(pop);

    function boardHtml(list) {
      if (!Array.isArray(list) || !list.length) return '';
      const top = Math.max(...list.map((b) => Number(b.score) || 0));
      return `<details class="wgx-s-board"><summary>今天的得分（${list.length} 轮）</summary><ol>${list.map((b) => `<li class="${top > 0 && Number(b.score) === top ? 'is-top' : ''}">第 ${esc(b.no)} 轮　${esc((b.names || []).join('／'))}　<b>${esc(b.score)}</b> 分${top > 0 && Number(b.score) === top ? '（目前第一）' : ''}</li>`).join('')}</ol></details>`;
    }
    const duo = (r) => {
      const players = r.players || [];
      return `<div class="wgx-s-duo">${['describer', 'guesser'].map((role) => {
        const p = players.find((x) => x.role === role);
        return `<span class="${role === 'describer' ? 'is-red' : 'is-blue'}${p && p.me ? ' is-me' : ''}">${ROLE[role]}${role === 'describer' ? '（面对大屏）' : '（背对大屏）'}<b>${p ? esc(p.name) + (p.me ? '（你）' : '') : '……'}</b></span>`;
      }).join('')}</div>`;
    };
    const meLine = (r) => {
      const m = r.mine || {};
      if (m.role) return '';
      return `<div class="wgx-s-me">${m.joined ? '你：已加入（下一轮也算）' : m.joined === false ? '你：没有加入' : '你：还没选'}`
        + `<button type="button" class="wgx-s-link" data-wgx-join="${m.joined ? 0 : 1}"${busy ? ' disabled' : ''}>${m.joined ? '不参加了' : '加入'}</button></div>`;
    };
    // 这一轮现在这一步的内容（卡片和弹窗共用；id 用来区分输入框联想名单）
    function body(r, id) {
      const m = r.mine || {};
      const pop = id === 'p';   // 弹窗：标题已经说了的话，正文不再重复
      const dis = busy ? ' disabled' : '';
      if (r.phase === 'join' || r.phase === 'vote') {
        if (m.joined == null) {
          return `<p>${r.phase === 'vote' ? '大家正在投票。' : ''}${pop ? '' : '要参加这一轮猜词游戏吗？'}加入的同学可能被抽上台（一人描述、一人猜）；不想上台就点“不加入”，看大屏一起猜。</p>`
            + `<div class="wgx-s-btns"><button type="button" class="is-main" data-wgx-join="1"${dis}>加入</button><button type="button" data-wgx-join="0"${dis}>不加入</button></div>`;
        }
        if (!m.joined) {
          return '<p>你选择了不加入，可以看大屏一起猜。</p>'
            + `<div class="wgx-s-btns"><button type="button" data-wgx-join="1"${dis}>改为加入</button></div>`;
        }
        if (r.phase === 'join') {
          return '<p class="wgx-s-ok">✓ 你已加入，等老师开始投票。</p>'
            + `<button type="button" class="wgx-s-link" data-wgx-join="0"${dis}>不参加了</button>`;
        }
        const votes = r.votes || {};
        return `<p class="wgx-s-ok">✓ 你已加入。${pop ? '' : '投票：这一轮抽几人上台？'}票多的一边算数。</p>`
          + `<div class="wgx-s-votes"><button type="button" class="is-red" data-wgx-vote="1" aria-pressed="${m.vote === 1}"${dis}>抽 1 人上台<small>抽中的同学自己选搭档</small></button>`
          + `<button type="button" class="is-blue" data-wgx-vote="2" aria-pressed="${m.vote === 2}"${dis}>抽 2 人上台<small>直接抽两位同学</small></button></div>`
          + (m.vote ? `<p class="wgx-s-tally">你投了“抽 ${m.vote} 人上台”。目前：抽 1 人 ${Number(votes['1']) || 0} 票 · 抽 2 人 ${Number(votes['2']) || 0} 票（老师抽人以前可以改）</p>` : '<p class="wgx-s-tally">点一个投票，老师抽人以前可以改。</p>')
          + `<button type="button" class="wgx-s-link" data-wgx-join="0"${dis}>不参加了</button>`;
      }
      if (r.phase === 'pick') {
        const drawn = (r.players || [])[0];
        if (!m.drawn) return `<p>抽中了 <b>${esc(drawn ? drawn.name : '')}</b>，正在选搭档……</p>${meLine(r)}`;
        const list = r.pick || [];
        return `<p class="wgx-s-hot">${pop ? '' : '你被抽中了！请选一位搭档。'}只能选这一轮加入了的同学。选好以后你是描述人、搭档是猜词人，老师可以调换。</p>`
          + `<div class="wgx-s-pick"><label>输入名字<input type="text" data-wgx-name list="wgx-dl-${id}" maxlength="20" autocomplete="off" placeholder="搭档的名字"></label>`
          + `<datalist id="wgx-dl-${id}">${list.map((c) => `<option value="${esc(c.label)}"></option>`).join('')}</datalist>`
          + `<label>或在名单里选<select data-wgx-sel><option value="">请选择……</option>${list.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')}</select></label>`
          + `<button type="button" class="is-main" data-wgx-pick${dis}>确定搭档</button></div>`
          + (list.length ? '' : '<p class="wgx-s-tally">这一轮还没有别的同学加入：请你想选的同学先点“加入”，或者请老师帮你选。</p>');
      }
      if (r.phase === 'ready') {
        return duo(r) + (m.role ? `<p class="wgx-s-hot">${pop ? '' : '轮到你上台了！'}你是${ROLE[m.role]}：${FACE[m.role]}。</p>` : '<p>等老师点“开始”……</p>') + meLine(r);
      }
      if (r.phase === 'play') {
        return duo(r) + `<p class="wgx-s-clock">剩余 <b data-wgx-clock>--:--</b></p>`
          + (m.role ? `<p class="wgx-s-hot">你是${ROLE[m.role]}：${FACE[m.role]}。</p>` : '<p>看大屏，一起猜（不要提示哦）。</p>') + meLine(r);
      }
      // done
      return `<p>本轮结束：${esc((r.players || []).map((p) => p.name).join('、'))} 得 <b>${esc(r.score == null ? 0 : r.score)}</b> 分。等老师开下一轮……</p>${meLine(r)}`;
    }
    function cardHtml() {
      if (off) return '<p class="wgx-s-quiet">老师开始猜词游戏时，请看大屏。</p>';
      if (!res) return '<p class="wgx-s-quiet">正在连接……</p>';
      if (res.status === 'login') return '<p class="wgx-s-quiet">请回首页用课堂码重新登录本课堂，再参加猜词游戏。</p>';
      const r = res.round;
      const board = boardHtml(res.board);
      if (!r || r.closed) {
        return `<p class="wgx-s-wait"><i class="wgx-dot" aria-hidden="true"></i>${r && r.closed ? '老师已收起猜词大屏。' : '等老师在大屏上打开猜词游戏。'}打开以后这里（和页面下方的弹窗）可以选择加入。</p>${board}`;
      }
      const showNote = note && noteRound === r.id;
      return `<div class="wgx-s-round"><div class="wgx-s-head"><b>第 ${esc(r.no)} 轮</b><span class="wgx-s-phase">${esc(PHASE[r.phase] || '')}</span><span class="wgx-s-count">已加入 ${esc(r.joined)} 人</span></div>`
        + body(r, 'c') + (showNote ? `<p class="wgx-s-note" role="status">${esc(note)}</p>` : '') + `</div>${board}`;
    }
    function popKey() {
      const r = res && res.status === 'ok' ? res.round : null;
      if (!r || r.closed) return '';
      const m = r.mine || {};
      if ((r.phase === 'join' || r.phase === 'vote') && m.joined == null) return `join:${r.id}`;
      if (r.phase === 'vote' && m.joined && m.vote == null) return `vote:${r.id}`;
      if (r.phase === 'pick' && m.drawn) return `pick:${r.id}`;
      if (r.phase === 'ready' && m.role) return `stage:${r.id}:${m.role}`;
      return '';
    }
    const TITLE = { join: '老师开始猜词游戏了，要加入吗？', vote: '投票：这一轮抽几人上台？', pick: '你被抽中了！请选一位搭档', stage: '轮到你上台了！' };
    function paint() {
      boxes.forEach((box) => put(box, cardHtml()));
      const key = popKey();
      if (!key || dismissed.has(key)) {
        pop.hidden = true;
      } else {
        const r = res.round;
        const showNote = note && noteRound === r.id;
        put(pop, `<button type="button" class="wgx-pop-x" data-wgx-x aria-label="收起">×</button><p class="wgx-pop-kicker">猜词游戏 · 第 ${esc(r.no)} 轮${preview ? ' · 测试页' : ''}</p>`
          + `<h3>${TITLE[key.split(':')[0]]}</h3><div class="wgx-s-round">${body(r, 'p')}</div>${showNote ? `<p class="wgx-s-note" role="status">${esc(note)}</p>` : ''}`);
        pop.dataset.key = key;
        pop.hidden = false;
      }
      tick();
    }
    function tick() {
      const r = res && res.round;
      const nodes = [...boxes, pop].flatMap((root) => Array.from(root.querySelectorAll('[data-wgx-clock]')));
      if (!nodes.length || !r || r.phase !== 'play' || !r.go_at) return;
      const now = serverNow();
      const text = now < r.go_at ? `马上开始（${Math.ceil((r.go_at - now) / 1000)}）` : mmss(r.go_at + (Number(r.minutes) || 2) * 60000 - now);
      nodes.forEach((node) => { if (node.textContent !== text) node.textContent = text; });
    }
    function take(value, t0) {
      if (value && value.now) {
        const fresh = Number(value.now) - (t0 + Date.now()) / 2;
        if (!offset || Math.abs(fresh - offset) > 400) offset = fresh;
      }
      res = value;
    }
    async function poll() {
      if (off || document.hidden) return;
      lastPoll = Date.now();
      const t0 = Date.now();
      try {
        take(one(await backend.rpc('ck_wg_live', { p_classroom: roomId })), t0);
        fails = 0;
      } catch (problem) {
        if (missing(problem)) off = true;
        else { fails += 1; if (fails === 1) console.warn('[猜词游戏]', problem); }
      }
      paint();
    }
    async function act(name, params) {
      if (busy) return;
      if (preview) { say(RESULT.teacher); paint(); return; }
      busy = true;
      paint();
      const t0 = Date.now();
      try {
        const value = one(await backend.rpc(name, { p_classroom: roomId, ...params }));
        if (value.status === 'login') say('没有记上：请回首页用课堂码重新登录本课堂。');
        else {
          take(value, t0);
          say(value.result === 'ok' ? '' : value.result === 'notjoined' && value.who
            ? `${value.who} 还没有加入猜词游戏：请他先在自己的页面上点“加入”，再选他；也可以换一位同学。`
            : RESULT[value.result] || '');
        }
      } catch (problem) {
        say(`没有记上：${(problem && problem.message) || problem}`);
      }
      busy = false;
      paint();
    }
    function pickFrom(root) {
      const r = res && res.round;
      if (!r) return;
      const input = root.querySelector('[data-wgx-name]');
      const select = root.querySelector('[data-wgx-sel]');
      const typed = String((input && input.value) || '').trim();
      const list = r.pick || [];
      const hit = list.find((c) => c.label === typed) || (!typed && select && list.find((c) => c.key === select.value));
      if (!hit && !typed) { say('先输入搭档的名字，或者在名单里选一位。'); paint(); return; }
      act('ck_wg_pick', hit ? { p_key: hit.key, p_name: null } : { p_key: null, p_name: typed });
    }
    const onClick = (root) => (event) => {
      const t = event.target;
      if (t.closest('[data-wgx-x]')) { dismissed.add(pop.dataset.key || ''); pop.hidden = true; return; }
      const join = t.closest('[data-wgx-join]');
      if (join) { act('ck_wg_join', { p_join: join.dataset.wgxJoin === '1' }); return; }
      const vote = t.closest('[data-wgx-vote]');
      if (vote) { act('ck_wg_vote', { p_mode: Number(vote.dataset.wgxVote) }); return; }
      if (t.closest('[data-wgx-pick]')) pickFrom(root);
    };
    const onChange = (root) => (event) => {
      const select = event.target.closest('[data-wgx-sel]');
      if (!select) return;
      const input = root.querySelector('[data-wgx-name]');
      const hit = ((res && res.round && res.round.pick) || []).find((c) => c.key === select.value);
      if (input) input.value = hit ? hit.label : '';
    };
    const onKey = (root) => (event) => {
      if (event.key === 'Enter' && event.target.matches('[data-wgx-name]')) { event.preventDefault(); pickFrom(root); }
    };
    [...boxes, pop].forEach((root) => {
      root.addEventListener('click', onClick(root));
      root.addEventListener('change', onChange(root));
      root.addEventListener('keydown', onKey(root));
    });
    paint();
    Promise.resolve(ctx.checkedIn).catch(() => null).then(poll);
    setInterval(() => {
      tick();
      if (off || document.hidden) return;
      const r = res && res.round;
      const gap = !r || r.closed ? 10000 : ['join', 'vote', 'pick'].includes(r.phase) ? 2500 : 5000;
      if (Date.now() - lastPoll >= gap - 100) poll();
    }, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  }

  // ---------- 投屏页：控制条和大屏 ----------
  function teacher() {
    const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
    if (!window.ClassLive || config.provider === 'off') return;
    const groups = [];
    document.querySelectorAll('[data-wordgame-data]').forEach((el) => {
      try {
        (JSON.parse(el.textContent).groups || []).forEach((g) => {
          if (g && g.name && Array.isArray(g.words) && g.words.length && !groups.some((x) => x.name === g.name)) groups.push(g);
        });
      } catch (error) { /* 词组读不出来就不用 */ }
    });
    if (!groups.length) return;
    let backend = null;
    try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[猜词大屏]', error.message); return; }
    const unit = config.unit || window.ClassLive.unitOf();
    const POINTS = (window.ClassLive.WORDGAME || {}).points || 10;
    addStyle(true);
    let room = null;
    let res = null;
    let off = '';
    let offset = 0;
    let lastPoll = 0;
    let busy = false;
    let view = 'live';      // live 跟着后台的进度；review 本轮回顾；board 得分榜
    let play = null;        // 正在猜的这一轮（词的顺序、结果、得分只在这台电脑上）
    let review = null;
    let msg = '';
    let roll = null;        // 抽人时名字滚动
    let tie = false;
    let groupPick = '';
    let lastSig = '';
    let countShown = -1;
    const serverNow = () => Date.now() + offset;
    const roomFor = async () => {
      const rooms = await backend.fetchAll('classrooms', { course: config.course });
      const r = window.ClassLive.pickRoom(rooms, config.course, unit);
      return r && r.chapter === unit ? r : null;
    };
    const TRES = {
      closed: '猜词大屏已收起：点“打开猜词大屏”重新开始。',
      phase: '这一步现在不能做（进度已经变了），看看最新的画面。',
      tie: '票数一样：请老师选抽 1 人还是抽 2 人。',
      few: '加入的同学不到 2 人：先请同学在自己的页面上点“加入”。',
      same: '这位同学已经在台上了。',
      nobody: '点名册上没有这位同学。',
      playing: '这一轮还在进行：先结束本轮。',
    };

    // 页面里的控制条（习经每个出门测前面、政经“课后自修”前面）
    const bars = Array.from(document.querySelectorAll('[data-wgx]')).map((card) => {
      let box = card.querySelector('[data-wgx-live]');
      if (!box) {
        box = document.createElement('div');
        box.setAttribute('data-wgx-live', '');
        card.appendChild(box);
      }
      box.classList.add('wgx-live');
      box.innerHTML = '<div class="wgx-t-bar"><button type="button" class="wgx-t-open" data-wgx-open>🎮 打开猜词大屏</button><span class="wgx-t-state" data-wgx-tstate role="status">正在连接……</span></div>'
        + '<p class="wgx-t-note">打开以后，学生页弹出“加入／不加入”；加入的同学投票抽 1 人还是抽 2 人上台，按票多的一边抽（一样多时老师选）。抽 1 人时，抽中的同学在自己的页面上选搭档，老师也可以代选。'
        + `上台前可以调换描述人和猜词人、换人、选 1—5 分钟和词组。额外小游戏，不计入本课时间和每次课的分值；今天得分第一的一组每人加 ${POINTS} 修为（在大屏得分榜上发）。</p>`;
      box.querySelector('[data-wgx-open]').addEventListener('click', (event) => { event.stopPropagation(); openStage(); });
      return box;
    });
    function paintBars() {
      const r = res && res.round;
      const text = off || (!room ? '当前课堂不是本页（或没有登录教师工作台）：先在工作台发布本课堂，再刷新本页。'
        : !r ? '今天还没开始：点左边的按钮打开大屏。'
          : r.closed ? `今天已玩 ${(res.board || []).length} 轮，大屏已收起。`
            : `第 ${r.no} 轮 · ${PHASE[r.phase] || ''} · 已加入 ${r.joined} 人`);
      bars.forEach((box) => {
        const s = box.querySelector('[data-wgx-tstate]');
        if (s && s.textContent !== text) s.textContent = text;
      });
    }
    // 课堂工具里原来的猜词游戏：网站上改为打开大屏（后台有这组函数以后才换，没有时原来的照常用）
    function takeToolbox() {
      const tool = document.querySelector('[data-wg-tool]');
      if (!tool || tool.dataset.wgxTaken) return;
      tool.dataset.wgxTaken = '1';
      Array.from(tool.children).forEach((child) => { if (!child.matches('.toolbox-label')) child.hidden = true; });
      const label = tool.querySelector('.toolbox-label span');
      if (label) label.textContent = '学生加入、投票抽人，PK 大屏';
      const box = document.createElement('div');
      box.className = 'wgx-tb';
      box.innerHTML = '<p>网站上的猜词游戏改用大屏：学生在自己的页面上选择加入，投票抽 1 人还是抽 2 人上台；抽 1 人时抽中的同学自己选搭档。</p>'
        + '<button type="button">打开猜词大屏</button>';
      box.querySelector('button').addEventListener('click', () => {
        const toggle = document.querySelector('[data-toolbox-toggle]');
        const panel = document.querySelector('[data-classroom-toolbox]');
        if (toggle && panel && panel.classList.contains('open')) toggle.click();
        openStage();
      });
      tool.appendChild(box);
    }

    // 大屏
    const stage = document.createElement('div');
    stage.className = 'wgx-stage';
    stage.hidden = true;
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', '猜词游戏大屏');
    stage.setAttribute('data-ix', '');
    stage.innerHTML = '<button type="button" class="wgx-close" data-wgx-close title="收起大屏（Esc）" aria-label="收起猜词大屏">×</button>'
      + '<div class="wgx-top"><span class="wgx-kicker" data-wgx-kicker>猜词游戏</span><span class="wgx-info" data-wgx-info></span></div>'
      + '<div class="wgx-center" data-wgx-center></div><p class="wgx-note" data-wgx-note role="status"></p><div class="wgx-actions" data-wgx-actions></div>';
    document.body.appendChild(stage);
    ['click', 'keydown', 'keyup', 'input', 'change'].forEach((type) => stage.addEventListener(type, (event) => event.stopPropagation()));
    const $s = (sel) => stage.querySelector(sel);
    const center = $s('[data-wgx-center]');
    const actions = $s('[data-wgx-actions]');
    const kicker = $s('[data-wgx-kicker]');
    const info = $s('[data-wgx-info]');
    const noteEl = $s('[data-wgx-note]');
    let handlers = {};
    const button = (id, label, kind, keys, disabled) => `<button type="button" data-wgx-act="${id}"${kind ? ` class="${kind}"` : ''}${disabled ? ' disabled' : ''}>${esc(label)}${keys ? `<small>${esc(keys)}</small>` : ''}</button>`;
    const setActions = (list) => {
      handlers = {};
      actions.innerHTML = list.filter(Boolean).map((a) => { handlers[a.id] = a.run; return button(a.id, a.label, a.kind, a.keys, a.disabled || busy); }).join('');
    };
    actions.addEventListener('click', (event) => {
      const b = event.target.closest('[data-wgx-act]');
      if (b && !b.disabled && handlers[b.dataset.wgxAct]) handlers[b.dataset.wgxAct]();
    });

    const numberOf = (sid) => {
      const hit = ((res && res.present) || []).find((p) => p.sid === sid) || (((res && res.round && res.round.members) || []).find((p) => p.sid === sid));
      return hit && hit.no ? hit.no : null;
    };
    const labelOf = (p) => `${numberOf(p.sid) ? `${numberOf(p.sid)}号 ` : ''}${p.name}`;
    // 老师代选、换人的名单：今天登录本课堂的同学，加入了的排前面；不含台上的人
    function peopleOptions(exclude) {
      const present = (res && res.present) || [];
      const list = present.filter((p) => !exclude.includes(p.sid));
      const joined = list.filter((p) => p.joined);
      const rest = list.filter((p) => !p.joined);
      const opt = (p) => `<option value="${esc(p.sid)}">${esc(`${p.no ? `${p.no}号 ` : ''}${p.name}`)}${p.joined ? '' : '（没加入）'}</option>`;
      return (joined.length ? `<optgroup label="加入了的同学">${joined.map(opt).join('')}</optgroup>` : '')
        + (rest.length ? `<optgroup label="今天登录、没加入的同学">${rest.map(opt).join('')}</optgroup>` : '');
    }
    const defaultGroup = () => {
      const used = new Set(((res && res.board) || []).map((b) => b.group));
      const free = groups.find((g) => !used.has(g.name));
      return (free || groups[0]).name;
    };

    async function control(action, value) {
      if (!room) throw new Error('当前课堂不是本页（或没有登录教师工作台）');
      const t0 = Date.now();
      const out = one(await backend.rpc('ck_wg_control', { p_classroom: Number(room.id) || room.id, p_action: action, p_value: value || {} }));
      take(out, t0);
      return out;
    }
    function take(value, t0) {
      if (!value || value.status !== 'ok') return;
      if (value.now) {
        const fresh = Number(value.now) - (t0 + Date.now()) / 2;
        if (!offset || Math.abs(fresh - offset) > 300) offset = fresh;
      }
      res = value;
      // 后台这一轮已经不在“进行中”（退回准备、在别的电脑上结束或开了新的一轮）：这台电脑上正在猜的作废
      const r = res.round;
      if (play && !play.done && (!r || r.id !== play.roundId || r.phase !== 'play')) play = null;
    }
    async function run(action, value, okMsg) {
      if (busy) return null;
      busy = true;
      paint(true);
      let out = null;
      try {
        out = await control(action, value);
        msg = out.result === 'ok' ? (okMsg || '') : (TRES[out.result] || '');
      } catch (problem) {
        msg = missing(problem) ? `后台还没有猜词大屏：请先执行 ${SQL}。` : `没有成功：${(problem && problem.message) || problem}`;
      }
      busy = false;
      paint(true);
      return out;
    }
    async function refresh() {
      lastPoll = Date.now();
      if (!room) {
        try { room = await roomFor(); } catch (error) { room = null; }
        if (!room) { paintBars(); if (!stage.hidden) paint(); return; }
      }
      const t0 = Date.now();
      try {
        take(one(await backend.rpc('ck_wg_live', { p_classroom: Number(room.id) || room.id })), t0);
        off = '';
        takeToolbox();
      } catch (problem) {
        if (missing(problem)) off = `后台还没有猜词大屏：请先在云开发 SQL 编辑器执行 ${SQL}。执行以前，课堂工具里原来的猜词游戏照常能用。`;
        else console.warn('[猜词大屏]', problem);
      }
      paintBars();
      if (!stage.hidden) paint();
    }

    async function openStage() {
      if (!room) { try { room = await roomFor(); } catch (error) { room = null; } }
      if (off || !room) { paintBars(); window.alert(off || '当前课堂不是本页（或没有登录教师工作台）：先在工作台发布本课堂，再刷新本页。'); return; }
      stage.hidden = false;
      document.body.classList.add('wgx-stage-open');
      view = 'live';
      msg = '';
      tie = false;
      lastSig = '';
      const out = await run('open', {});
      if (out && out.round && out.round.phase === 'play' && (!play || play.roundId !== out.round.id)) play = null;
      paint(true);
      stage.querySelector('[data-wgx-close]').focus();
    }
    async function closeStage() {
      const r = res && res.round;
      if (r && r.phase === 'play' && play && !play.done) {
        if (!window.confirm('这一轮还在进行：结束本轮、记下现在的得分，再收起大屏？')) return;
        await finishRound('ended');
      }
      stage.hidden = true;
      document.body.classList.remove('wgx-stage-open');
      roll = null;
      if (res && res.round && !res.round.closed && room) {
        try { await control('close', {}); } catch (error) { /* 收起失败：学生页过一会儿按后台的样子显示 */ }
      }
      paintBars();
    }

    // 抽人：名字滚动 1.3 秒以上，再停在后台抽中的人
    async function draw(value) {
      if (busy) return;
      const r = res && res.round;
      const pool = ((r && r.members) || []).filter((m) => m.joined).map((m) => m.name);
      const slots = value && value.slot != null ? [value.slot] : null;
      const votes = (r && r.votes) || {};
      const guess = (value && value.mode) || (r && r.mode) || ((Number(votes['1']) || 0) > (Number(votes['2']) || 0) ? 1 : 2);
      roll = { names: pool.length ? pool : ['……'], slots, mode: guess, until: Date.now() + 1300, show: [] };
      const spin = setInterval(() => { if (roll) { roll.show = [0, 1].map(() => roll.names[Math.floor(Math.random() * roll.names.length)]); paint(true); } }, 70);
      tie = false;
      const out = await run('draw', value || {});
      const wait = roll ? roll.until - Date.now() : 0;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      clearInterval(spin);
      roll = null;
      if (out && out.result === 'tie') { tie = true; msg = TRES.tie; }
      paint(true);
    }

    // 猜词（在这台电脑上进行；开始、结束经后台）
    function beginPlay(r) {
      const group = groups.find((g) => g.name === r.group) || groups.find((g) => g.name === groupPick) || groups[0];
      play = { roundId: r.id, group, queue: shuffle(group.words.map((_, i) => i)), current: null, results: {}, score: 0, done: false,
               endAt: Number(r.go_at) + (Number(r.minutes) || 2) * 60000, goAt: Number(r.go_at), players: r.players || [] };
    }
    function nextWord() {
      if (!play) return;
      if (!play.queue.length) { finishRound('done'); return; }
      play.current = play.queue.shift();
      paint(true);
    }
    function mark(result) {
      if (!play || play.done || play.current == null || serverNow() < play.goAt) return;
      play.results[play.current] = result;
      if (result === 'ok') play.score += 1;
      if (result === 'skip') play.queue.push(play.current);   // 跳过的词放到最后，时间够时再出现
      nextWord();
    }
    async function finishRound(reason) {
      if (!play || play.done) return;
      play.done = true;
      if (play.current != null && !play.results[play.current]) play.results[play.current] = 'skip';   // 正显示、还没判定的词算“没猜出”
      review = { reason, score: play.score, group: play.group, results: { ...play.results }, players: play.players };
      const out = await run('finish', { score: play.score, group: play.group.name });
      if (!out || out.result !== 'ok') msg = msg || '这一轮的得分没能记到后台。';
      play = null;
      view = 'review';
      paint(true);
    }

    async function award(clear) {
      const list = (res && res.board) || [];
      const top = list.length ? Math.max(...list.map((b) => Number(b.score) || 0)) : 0;
      const people = [];
      if (!clear) list.filter((b) => top > 0 && Number(b.score) === top).forEach((b) => (b.people || []).forEach((p) => { if (!people.some((x) => x.sid === p.sid)) people.push(p); }));
      if (!clear && !people.length) { msg = '今天还没有得分的轮次（0 分不算）。'; paint(true); return; }
      if (!window.confirm(clear ? '撤销今天给猜词第一名加的修为？'
        : `给今天得分第一（${top} 分）的 ${people.map((p) => p.name).join('、')} 每人加 ${POINTS} 修为？\n\n已经发过的话会改成这份名单；老师结算修为后学生才看得到。`)) return;
      busy = true;
      msg = '正在保存……';
      paint(true);
      try {
        await backend.rpc('ck_set_wordgame_winners', { p_classroom: Number(room.id) || room.id, p_people: people.map((p) => ({ sid: p.sid, name: p.name })), p_points: POINTS });
        msg = clear ? '已撤销今天的猜词加修为。' : `已给 ${people.map((p) => p.name).join('、')} 每人加 ${POINTS} 修为（老师结算修为时计入）。`;
      } catch (problem) {
        msg = `${clear ? '撤销' : '加修为'}失败：${(problem && problem.message) || problem}`;
      }
      busy = false;
      paint(true);
    }

    // 画面
    const RESULT = { ok: ['猜对', 'ok'], skip: ['没猜出', 'skip'], foul: ['作废', 'foul'] };
    function stageView() {
      const r = res && res.round;
      if (view === 'review' && review) {
        const rows = review.group.words.map((word, i) => {
          const [text, cls] = RESULT[review.results[i]] || ['没轮到', 'left'];
          const quote = String(word.quote || '').replace(/“/g, '‘').replace(/”/g, '’');
          return `<tr><td>${esc(word.word)}</td><td class="${cls}">${text}</td><td>${quote ? `“${esc(quote)}”` : ''}<small>${esc(word.source || '')}</small></td></tr>`;
        }).join('');
        return {
          sig: `review:${review.score}:${msg}`,
          kicker: `猜词游戏 · ${review.group.name}`,
          info: review.players.map((p) => `${ROLE[p.role] || ''} ${p.name}`).join('　'),
          html: `<div class="wgx-review"><h2 class="wgx-h">${review.reason === 'time' ? '时间到！' : ''}本轮得分 ${review.score}</h2><table><thead><tr><th>词</th><th>结果</th><th>教材里怎么说</th></tr></thead><tbody>${rows}</tbody></table></div>`,
          acts: [
            { id: 'board', label: '看得分榜', run: () => { view = 'board'; msg = ''; paint(true); } },
            { id: 'next', label: '下一轮 ▶', kind: 'is-go', run: nextRound },
            { id: 'close', label: '收起', run: closeStage },
          ],
        };
      }
      if (view === 'board') {
        const list = ((res && res.board) || []).slice().sort((a, b) => b.score - a.score || a.no - b.no);
        const top = list.length ? Number(list[0].score) || 0 : 0;
        return {
          sig: `board:${JSON.stringify(list)}:${msg}:${busy}`,
          kicker: '猜词游戏 · 得分榜（本课堂今天）',
          info: `每轮得分记在后台；今天得分第一的一组每人可加 ${POINTS} 修为`,
          html: list.length ? `<div class="wgx-board"><table><thead><tr><th>名次</th><th>第几轮</th><th>描述人／猜词人</th><th>词组</th><th>得分</th></tr></thead><tbody>${
            list.map((b, i) => `<tr class="${top > 0 && Number(b.score) === top ? 'is-top' : ''}"><td>${i + 1}</td><td>第 ${esc(b.no)} 轮</td><td>${esc((b.names || []).join('／'))}</td><td>${esc(b.group || '')}</td><td>${esc(b.score)}</td></tr>`).join('')}</tbody></table></div>`
            : '<p class="wgx-sub">今天还没有结束的轮次。</p>',
          acts: [
            list.length ? { id: 'award', label: `给今天第一名加修为（每人 +${POINTS}）`, kind: 'is-good', run: () => award(false) } : null,
            list.length ? { id: 'unaward', label: '撤销加修为', run: () => award(true) } : null,
            { id: 'next', label: '下一轮 ▶', kind: 'is-go', run: nextRound },
            { id: 'clear', label: '清空今天的记录', kind: 'is-red', run: clearToday },
            { id: 'close', label: '收起', run: closeStage },
          ],
        };
      }
      if (off || !room) {
        return { sig: `off:${off}:${Boolean(room)}`, kicker: '猜词游戏', info: '', html: `<p class="wgx-sub">${esc(off || '当前课堂不是本页（或没有登录教师工作台）。')}</p>`,
          acts: [{ id: 'close', label: '收起', run: closeStage }] };
      }
      if (!r || r.closed) {
        return {
          sig: `idle:${r ? r.id : 0}:${msg}:${busy}`,
          kicker: '猜词游戏',
          info: '',
          html: '<div class="wgx-rules"><h2 class="wgx-h">猜词游戏</h2><ol><li>学生在自己的页面上选择加入或不加入。</li><li>加入的同学投票：抽 1 人上台（抽中的同学自己选搭档）还是抽 2 人上台。</li>'
            + '<li>一人面对大屏描述、一人背对大屏猜，描述时不能说出词里的任何一个字；猜对一个得 1 分。</li><li>今天得分第一的一组每人加修为（额外小游戏，不计入本课分值）。</li></ol></div>',
          acts: [
            { id: 'open', label: '开始：请同学加入 ▶', kind: 'is-go', run: async () => { await run('open', {}); view = 'live'; paint(true); } },
            { id: 'board', label: '看得分榜', run: () => { view = 'board'; msg = ''; paint(true); } },
            { id: 'close', label: '收起', run: closeStage },
          ],
        };
      }
      const members = r.members || [];
      const joined = members.filter((m) => m.joined);
      const present = res.present || [];
      const decided = new Set(members.map((m) => m.sid));
      const undecided = present.filter((p) => !decided.has(p.sid)).length;
      const notIn = members.filter((m) => !m.joined).length;
      const base = { kicker: `猜词游戏 · 第 ${r.no} 轮`, info: `已加入 ${joined.length} 人` };
      if (roll) {
        const two = roll.slots ? false : roll.mode === 2;
        const names = roll.show.length ? roll.show : roll.names.slice(0, 2);
        return { ...base, sig: `roll:${names.join(',')}:${two}`,
          html: `<div class="wgx-box"><h2 class="wgx-h">抽人中……</h2><div class="wgx-roll">${two
            ? `<div class="is-red"><span>描述人</span><b>${esc(names[0])}</b></div><div class="is-blue"><span>猜词人</span><b>${esc(names[1] || names[0])}</b></div>`
            : `<div class="is-gold"><span>抽中</span><b>${esc(names[0])}</b></div>`}</div></div>`,
          acts: [] };
      }
      if (r.phase === 'join') {
        return { ...base, sig: `join:${r.id}:${joined.map((m) => m.sid).join(',')}:${present.length}:${notIn}:${msg}:${busy}`,
          html: `<div class="wgx-box"><h2 class="wgx-h">谁来挑战猜词？</h2><p class="wgx-sub">请在自己的页面上点“加入”或“不加入”（页面下方会弹出）</p>`
            + `<div class="wgx-big"><strong>${joined.length}</strong><span>人已加入</span><em>今天登录本课堂 ${present.length} 人 · 不加入 ${notIn} 人 · 还没选 ${undecided} 人</em></div>`
            + `<div class="wgx-chips">${joined.map((m) => `<span>${esc(m.name)}</span>`).join('')}</div></div>`,
          acts: [
            { id: 'vote', label: '开始投票 ▶', kind: 'is-go', run: () => run('phase', { phase: 'vote' }) },
            { id: 'close', label: '收起', run: closeStage },
          ] };
      }
      if (r.phase === 'vote') {
        const a = Number((r.votes || {})['1']) || 0;
        const b = Number((r.votes || {})['2']) || 0;
        const total = a + b;
        const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
        return { ...base, sig: `vote:${r.id}:${a}:${b}:${joined.length}:${tie}:${msg}:${busy}`,
          html: `<div class="wgx-box"><h2 class="wgx-h">这一轮抽几人上台？</h2><p class="wgx-sub">加入的同学在自己的页面上投票 · 已投 ${total} / ${joined.length} 人${undecided ? ` · 还有 ${undecided} 人没选加不加入` : ''}</p>`
            + `<div class="wgx-bars"><div class="wgx-bar is-red${a > b ? ' is-lead' : ''}"><i style="width:${pct(a)}%"></i><span>抽 1 人上台<small>抽中的同学自己选搭档</small></span><strong>${a}</strong></div>`
            + `<div class="wgx-bar is-blue${b > a ? ' is-lead' : ''}"><i style="width:${pct(b)}%"></i><span>抽 2 人上台<small>直接抽两位同学</small></span><strong>${b}</strong></div></div></div>`,
          acts: tie ? [
            { id: 'one', label: '抽 1 人上台', kind: 'is-red', run: () => draw({ mode: 1 }) },
            { id: 'two', label: '抽 2 人上台', kind: 'is-blue', run: () => draw({ mode: 2 }) },
            { id: 'wait', label: '再等等', run: () => { tie = false; msg = ''; paint(true); } },
          ] : [
            { id: 'draw', label: '按票数抽人 ▶', kind: 'is-go', run: () => draw({}) },
            { id: 'join', label: '回到加入', run: () => run('phase', { phase: 'join' }) },
            { id: 'close', label: '收起', run: closeStage },
          ] };
      }
      const players = r.players || [];
      const onStage = players.map((p) => p.sid);
      if (r.phase === 'pick') {
        const p = players[0] || { name: '' };
        return { ...base, sig: `pick:${r.id}:${JSON.stringify(players)}:${present.map((x) => x.sid + x.joined).join(',')}:${msg}:${busy}`,
          html: `<div class="wgx-box"><p class="wgx-sub">抽 1 人上台 · 抽中</p><div class="wgx-drawn"><div><b>${esc(p.name)}</b><small>${numberOf(p.sid) ? `${numberOf(p.sid)}号 · ` : ''}自己选搭档</small></div></div>`
            + `<p class="wgx-sub wgx-wait">请 ${esc(p.name)} 在自己的页面上选一位搭档（输入名字或在名单里选）</p>`
            + `<div class="wgx-help"><label>老师代选搭档 <select data-wgx-partner><option value="">请选择……</option>${peopleOptions(onStage)}</select></label><button type="button" data-wgx-partner-go>确定</button></div></div>`,
          acts: [
            { id: 'redraw', label: '重抽', run: () => draw({ mode: 1 }) },
            { id: 'vote', label: '回到投票', run: () => run('phase', { phase: 'vote' }) },
            { id: 'close', label: '收起', run: closeStage },
          ] };
      }
      if (r.phase === 'ready') {
        const minutes = Number(r.minutes) || 2;
        if (!groupPick || !groups.some((g) => g.name === groupPick)) groupPick = r.group && groups.some((g) => g.name === r.group) ? r.group : defaultGroup();
        const side = (role, i) => {
          const p = players.find((x) => x.role === role) || {};
          const slot = players.indexOf(p);
          return `<div class="wgx-side ${role === 'describer' ? 'is-red' : 'is-blue'}"><span class="wgx-tag">${ROLE[role]} · ${role === 'describer' ? '面对大屏' : '背对大屏'}</span><b>${esc(p.name || '……')}</b>`
            + `<small>${numberOf(p.sid) ? `${numberOf(p.sid)}号` : ''}${p.drawn ? '　抽中' : p.sid ? '　搭档' : ''}</small>`
            + `<div class="wgx-side-tools"><select data-wgx-replace="${slot < 0 ? i : slot}" aria-label="把${ROLE[role]}换成"><option value="">换成……</option>${peopleOptions(onStage)}</select>`
            + `<button type="button" data-wgx-redraw="${slot < 0 ? i : slot}">重抽这位</button></div></div>`;
        };
        return { ...base, sig: `ready:${r.id}:${JSON.stringify(players)}:${minutes}:${groupPick}:${present.map((x) => x.sid + x.joined).join(',')}:${msg}:${busy}`,
          html: `<div class="wgx-box"><div class="wgx-duel">${side('describer', 0)}<button type="button" class="wgx-swap" data-wgx-swap title="调换描述人和猜词人" aria-label="调换描述人和猜词人">⇄</button>${side('guesser', 1)}</div>`
            + `<div class="wgx-setup"><span>时长</span><span class="wgx-mins">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-wgx-min="${n}" aria-pressed="${n === minutes}">${n} 分钟</button>`).join('')}</span>`
            + `<label>词组 <select data-wgx-group>${groups.map((g) => `<option value="${esc(g.name)}"${g.name === groupPick ? ' selected' : ''}>${esc(g.name)}（${g.words.length} 个词）</option>`).join('')}</select></label></div>`
            + '<p class="wgx-sub" style="margin-top:14px">猜词人请背对大屏；描述人不能说出词里的任何一个字。准备好了点“开始”（空格）。</p></div>',
          acts: [
            { id: 'start', label: '开始 ▶', kind: 'is-go', keys: '空格', run: () => startRound(minutes) },
            { id: 'redraw', label: '重新抽人', run: () => draw({}) },
            { id: 'vote', label: '回到投票', run: () => run('phase', { phase: 'vote' }) },
            { id: 'close', label: '收起', run: closeStage },
          ] };
      }
      if (r.phase === 'play') {
        if (!play || play.roundId !== r.id) {
          const left = Number(r.go_at) + (Number(r.minutes) || 2) * 60000 - serverNow();
          return { ...base, sig: `lost:${r.id}:${msg}:${busy}`,
            html: '<div class="wgx-box"><h2 class="wgx-h">这一轮正在进行</h2><p class="wgx-sub">这个页面刷新过（或在别的电脑上开始的），这台电脑上没有本轮的词。可以接着猜（词重新抽），或者退回准备重新开始。</p></div>',
            acts: [
              left > 1000 ? { id: 'resume', label: `接着猜（剩 ${mmss(left)}）`, kind: 'is-go', run: () => { beginPlay(r); nextWord(); } } : null,
              { id: 'back', label: '退回准备', run: () => run('back', {}) },
              { id: 'close', label: '收起', run: closeStage },
            ] };
        }
        const word = play.current != null ? play.group.words[play.current].word : '';
        const passed = Object.values(play.results).filter((x) => x === 'ok' || x === 'foul').length;
        const p1 = players.find((x) => x.role === 'describer') || {};
        const p2 = players.find((x) => x.role === 'guesser') || {};
        const before = serverNow() < play.goAt;
        return { ...base, kicker: `猜词游戏 · 第 ${r.no} 轮 · ${play.group.name}`, sig: `play:${r.id}:${play.current}:${play.score}:${passed}:${before}:${msg}:${busy}`,
          html: `<div class="wgx-play"><div class="wgx-play-top"><span class="is-red">描述人<b>${esc(p1.name || '')}</b></span><strong class="wgx-timer" data-wgx-timer>--:--</strong><span class="is-blue">猜词人<b>${esc(p2.name || '')}</b></span></div>`
            + `<div class="wgx-word" data-wgx-word>${before ? '准备' : esc(word)}</div>`
            + `<div class="wgx-meta"><span>得分 <b>${play.score}</b></span><span>已过 <b>${passed}</b> / ${play.group.words.length}</span></div></div>`
            + (before ? '<div class="wgx-count" data-wgx-count></div>' : ''),
          acts: [
            { id: 'ok', label: '猜对 +1', kind: 'is-good', keys: '→ 或 回车', run: () => mark('ok'), disabled: before },
            { id: 'skip', label: '跳过', keys: '↓', run: () => mark('skip'), disabled: before },
            { id: 'foul', label: '作废', kind: 'is-red', keys: 'X（说出了词里的字）', run: () => mark('foul'), disabled: before },
            { id: 'end', label: '结束本轮', run: () => { if (window.confirm('结束本轮，记下现在的得分？')) finishRound('ended'); } },
          ] };
      }
      // done（本轮已结束，在别的电脑上或刷新以后）
      return { ...base, sig: `done:${r.id}:${r.score}:${msg}:${busy}`,
        html: `<div class="wgx-box"><h2 class="wgx-h">第 ${esc(r.no)} 轮结束</h2><p class="wgx-sub">${esc(players.map((p) => p.name).join('、'))} 得 ${esc(r.score == null ? 0 : r.score)} 分</p></div>`,
        acts: [
          { id: 'board', label: '看得分榜', run: () => { view = 'board'; msg = ''; paint(true); } },
          { id: 'next', label: '下一轮 ▶', kind: 'is-go', run: nextRound },
          { id: 'close', label: '收起', run: closeStage },
        ] };
    }
    function paint(force) {
      paintBars();
      if (stage.hidden) return;
      const v = stageView();
      kicker.textContent = v.kicker;
      info.textContent = v.info || '';
      noteEl.textContent = msg;
      const sig = `${v.sig}|${busy}`;
      const active = document.activeElement;
      // 老师正在下拉里选人：等选完再换画面（后台每隔一两秒问一次，不要把下拉框关掉）
      if (!force && active && active.tagName === 'SELECT' && stage.contains(active)) return;
      if (!force && sig === lastSig) { tick(); return; }
      lastSig = sig;
      center.innerHTML = v.html;
      setActions(v.acts || []);
      tick();
    }
    function tick() {
      if (stage.hidden) return;
      const r = res && res.round;
      if (play && r && r.phase === 'play' && play.roundId === r.id && !play.done) {
        const now = serverNow();
        const timer = center.querySelector('[data-wgx-timer]');
        const left = play.endAt - now;
        if (timer) {
          const text = now < play.goAt ? mmss((Number(r.minutes) || 2) * 60000) : mmss(left);
          if (timer.textContent !== text) timer.textContent = text;
          timer.classList.toggle('is-low', now >= play.goAt && left <= 10000);
        }
        const count = center.querySelector('[data-wgx-count]');
        if (now < play.goAt) {
          const n = Math.ceil((play.goAt - now) / 1000);
          if (count && n !== countShown) {
            countShown = n;
            count.textContent = String(n);
            count.classList.remove('is-tick');
            void count.offsetWidth;
            count.classList.add('is-tick');
          }
        } else if (play.current == null) {
          countShown = -1;
          nextWord();
        } else if (count) {
          paint(true);
        }
        if (now >= play.goAt && left <= 0) finishRound('time');
      }
    }
    // 开始：后台记下开始时刻（3 秒倒计时）和台上两人，这台电脑按这一刻出词、计时
    async function startRound(minutes) {
      const out = await run('start', { minutes, group: groupPick });
      if (out && out.result === 'ok' && out.round && out.round.phase === 'play') {
        countShown = -1;
        beginPlay(out.round);
        paint(true);
      }
    }
    async function nextRound() {
      view = 'live';
      review = null;
      tie = false;
      await run('next', {});
      paint(true);
    }
    async function clearToday() {
      if (!window.confirm('清空本课堂今天的猜词记录（各轮的加入、投票、得分）？已经加的修为不受影响，要撤销请先点“撤销加修为”。')) return;
      await run('clear', {});
      view = 'live';
      review = null;
      play = null;
      paint(true);
    }

    // 大屏上的点击：调换、换人、重抽这一位、时长、词组、老师代选搭档
    center.addEventListener('click', (event) => {
      const t = event.target;
      if (busy) return;
      if (t.closest('[data-wgx-swap]')) { run('swap', {}); return; }
      const redraw = t.closest('[data-wgx-redraw]');
      if (redraw) { draw({ slot: Number(redraw.dataset.wgxRedraw) }); return; }
      const min = t.closest('[data-wgx-min]');
      if (min) { run('minutes', { minutes: Number(min.dataset.wgxMin) }); return; }
      if (t.closest('[data-wgx-partner-go]')) {
        const sel = center.querySelector('[data-wgx-partner]');
        if (!sel || !sel.value) { msg = '先在名单里选一位同学。'; paint(true); return; }
        run('partner', { sid: sel.value, slot: 1 });
      }
    });
    center.addEventListener('change', (event) => {
      const t = event.target;
      if (t.matches('[data-wgx-group]')) { groupPick = t.value; lastSig = ''; t.blur(); paint(true); return; }
      if (t.matches('[data-wgx-replace]') && t.value) {
        const sid = t.value;
        const slot = Number(t.dataset.wgxReplace);
        t.blur();
        run('partner', { sid, slot });
      }
    });
    stage.querySelector('[data-wgx-close]').addEventListener('click', closeStage);
    document.addEventListener('keydown', (event) => {
      if (stage.hidden) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const r = res && res.round;
      const inForm = /^(SELECT|INPUT|TEXTAREA|BUTTON)$/.test((event.target && event.target.tagName) || '');
      let handled = true;
      if (key === 'Escape') closeStage();
      else if (play && r && r.phase === 'play' && (key === 'ArrowRight' || key === 'Enter')) mark('ok');
      else if (play && r && r.phase === 'play' && (key === 'ArrowDown' || key === 's')) mark('skip');
      else if (play && r && r.phase === 'play' && key === 'x') mark('foul');
      else if (r && r.phase === 'ready' && view === 'live' && !roll && key === ' ' && !inForm && handlers.start) handlers.start();
      else handled = !inForm && [' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(key);
      if (handled) { event.preventDefault(); event.stopPropagation(); }
    }, true);

    // 后台进度：大屏开着时，加入、投票、选搭档每 1.5 秒问一次，其余 4 秒；收起时 15 秒（控制条上的进度）
    setInterval(() => {
      if (document.hidden) return;
      const r = res && res.round;
      const gap = !stage.hidden ? (r && ['join', 'vote', 'pick'].includes(r.phase) ? 1500 : 4000) : 15000;
      if (Date.now() - lastPoll >= gap - 50 && !busy) refresh();
    }, 500);
    setInterval(tick, 200);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    refresh();
  }

  window.ClassLiveWordGame = Object.freeze({ student });
  if (document.querySelector('[data-wordgame-data]')) teacher();   // 投屏页（课堂完整版、讲解版）才有词组
})();
