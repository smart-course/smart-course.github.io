/* 小游戏“老师开始”（课堂完整版投屏页，习近平经济思想概论，2026-11-22）
 * 用户：“辩论赛，机制图这类小游戏，要老师点击按钮后才可以游玩，参照pk对决的方式。防止有的学生提前把题目都做了。”
 * 机制图闯关（机制图下面的看板 [data-mech-board]）、分组讨论（[data-discuss]）、经营沙盘（[data-biz]）各加一条控制条：
 *   点“开始”（ck_game_start）以后，学生页才显示这一块（live-student.js 的 setupGameGates）；开始以前学生页只有一张“等老师开始”的卡片，
 *   角色卡、讨论题等介绍照常显示。开始以后可以“收起，重新开始”：学生页又收起，已经递交的作答、聊天室的发言都不受影响。
 *   辩论赛跟着“辩论流程”图的“开始”走（live-debate.js），不在这里。
 * 需要在本机登录教师工作台，并且当前课堂就是本页章节（同 live-acts.js 的 roomFor）。离线版没有这条控制条，学生页也不收起。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!window.ClassLive || config.provider === 'off') return;
  const targets = [];
  document.querySelectorAll('[data-mech-board]').forEach((box) => targets.push({ kind: 'mech', no: box.dataset.case, place: box, where: 'afterbegin' }));
  document.querySelectorAll('[data-discuss][data-practice], [data-biz][data-practice]').forEach((section) => {
    const first = section.querySelector('.rt-part');
    if (first) targets.push({ kind: section.matches('[data-biz]') ? 'biz' : 'disc', no: section.dataset.practice, place: first, where: 'beforebegin', section });
  });
  const list = targets.filter((t) => /^\d{2}$/.test(t.no || ''));
  if (!list.length) return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[小游戏老师开始]', error.message); return; }
  const unit = config.unit || window.ClassLive.unitOf();
  const NAME = { mech: '机制图闯关', disc: '分组讨论', biz: '经营沙盘' };
  const STUDENT = {
    mech: '学生页的机制图闯关',
    disc: '学生页的选角色、本组聊天室和全班表决',
    biz: '学生页的选角色组、本组聊天室和代表投票',
  };
  const SQL = 'tools/cloudbase-pg-20261122-小游戏老师开始.sql';
  // 按钮图标（线条图，不用表情符号：各家系统上的表情符号样子不一）
  const ico = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const FLAG = ico('<path d="M6 21V4"/><path d="M6 4.5h11.5l-2.6 4 2.6 4H6z" fill="currentColor"/>');
  const UNDO = ico('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>');
  const SCREEN = ico('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>');
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const missing = (problem) => /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem));
  const rpcOne = async (name, params) => { const value = await backend.rpc(name, params); return (Array.isArray(value) ? value[0] : value) || {}; };
  const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
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
  .gate-ctl { margin: 14px 0; padding: 14px 16px; border: 1.5px solid #e2c784; border-radius: 16px; background: linear-gradient(135deg, #fffaf0, #fdf1d8); color: #3b2a07;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; box-shadow: 0 8px 20px -14px rgba(122, 90, 18, .5); }
  .gate-ctl.is-on { border-color: #9fceb4; background: linear-gradient(135deg, #f3faf5, #e3f3ea); color: #173b29; }
  .gate-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
  /* 按钮（2026-11-26 用户：“机制图 · 闯关，按钮再美化一下”）：立体游戏按钮——上亮下暗的渐变＋底边厚度，按下去沉一下；图标用线条图 */
  .gate-ctl button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border: 0; border-radius: 12px; color: #3b2a07;
    background: linear-gradient(180deg, #ffffff, #f6efe2); box-shadow: inset 0 0 0 1.5px rgba(70, 51, 34, .22), 0 3px 0 rgba(70, 51, 34, .22), 0 8px 16px -10px rgba(70, 51, 34, .5);
    font: inherit; font-weight: 800; line-height: 1.2; white-space: nowrap; cursor: pointer; transition: transform .12s ease, box-shadow .12s ease, filter .15s ease; }
  .gate-ctl button svg { flex: 0 0 auto; width: 20px; height: 20px; }
  .gate-ctl button:not(:disabled):hover { transform: translateY(-1px); filter: brightness(1.04); }
  .gate-ctl button:not(:disabled):active { transform: translateY(2px); box-shadow: inset 0 0 0 1.5px rgba(70, 51, 34, .22), 0 1px 0 rgba(70, 51, 34, .22); }
  .gate-ctl button:focus-visible { outline: 3px solid rgba(35, 101, 95, .45); outline-offset: 2px; }
  .gate-ctl button.is-main { min-height: 52px; padding: 0 24px 0 12px; color: #fff; font-size: 18px; letter-spacing: .02em; text-shadow: 0 1px 0 rgba(0, 0, 0, .25);
    background: linear-gradient(180deg, rgba(255, 255, 255, .22), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #2f8478, #1c5a52);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 4px 0 #123e39, 0 12px 22px -10px rgba(18, 62, 57, .7); }
  .gate-ctl button.is-main:not(:disabled):active { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), 0 1px 0 #123e39; }
  .gate-ctl button.is-main .gate-ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: #7a3d0c; background: linear-gradient(180deg, #ffe9a8, #f2bb4c); box-shadow: inset 0 -2px 0 rgba(122, 61, 12, .25); text-shadow: none; }
  .gate-ctl button.is-main .gate-ico svg { width: 18px; height: 18px; }
  .gate-ctl button.is-screen { color: #ffe3a3; background: linear-gradient(180deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, 0) 50%), linear-gradient(180deg, #3a2c3f, #1f1824);
    box-shadow: inset 0 0 0 1px rgba(255, 217, 138, .35), 0 3px 0 #0e0b10, 0 10px 18px -10px rgba(14, 11, 16, .8); }
  .gate-ctl button.is-screen:not(:disabled):active { box-shadow: inset 0 0 0 1px rgba(255, 217, 138, .35), 0 1px 0 #0e0b10; }
  .gate-ctl button.is-undo, .gate-ctl button.is-warn { color: #8a3a22; background: linear-gradient(180deg, #ffffff, #fbefe9); box-shadow: inset 0 0 0 1.5px rgba(164, 73, 45, .4), 0 3px 0 rgba(164, 73, 45, .25); }
  .gate-ctl button.is-undo:not(:disabled):active, .gate-ctl button.is-warn:not(:disabled):active { box-shadow: inset 0 0 0 1.5px rgba(164, 73, 45, .4), 0 1px 0 rgba(164, 73, 45, .25); }
  .gate-ctl button:disabled { opacity: .5; cursor: default; transform: none; filter: none; }
  @media (prefers-reduced-motion: reduce) { .gate-ctl button { transition: none; } }
  .gate-ctl button[hidden] { display: none; }
  /* 状态：小圆点＋短句（没开始琥珀色，进行中绿色、一闪一闪），出问题时是一句赭红色的提醒 */
  .gate-state { flex: 1 1 260px; min-width: 0; display: inline-flex; align-items: center; gap: 9px; font-weight: 700; }
  .gate-state::before { content: ""; flex: 0 0 auto; width: 10px; height: 10px; border-radius: 50%; background: #d39b2a; box-shadow: 0 0 0 4px rgba(211, 155, 42, .18); }
  .gate-state[data-tone="on"]::before { background: #2f9e6e; box-shadow: 0 0 0 4px rgba(47, 158, 110, .2); animation: gate-live 1.8s ease-in-out infinite; }
  .gate-state[data-tone="warn"] { color: #8a3a22; }
  .gate-state[data-tone="warn"]::before { background: #a4492d; box-shadow: 0 0 0 4px rgba(164, 73, 45, .16); }
  @keyframes gate-live { 50% { box-shadow: 0 0 0 7px rgba(47, 158, 110, 0); } }
  @media (prefers-reduced-motion: reduce) { .gate-state[data-tone="on"]::before { animation: none; } }
  /* 控制条下面的说明收进“说明 ▾” */
  .gate-tip { margin: 8px 0 0; }
  .gate-tip > summary { display: inline-flex; align-items: center; gap: 6px; padding: 2px 12px 2px 8px; border: 1px solid rgba(122, 90, 18, .3); border-radius: 999px;
    background: rgba(255, 255, 255, .7); color: #7a5a12; font: 700 13.5px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; list-style: none; }
  .gate-tip > summary::-webkit-details-marker { display: none; }
  .gate-tip > summary::before { content: "i"; display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: #b5701e; color: #fff; font: italic 800 11.5px/1 Georgia, serif; }
  .gate-tip > summary::after { content: "▾"; font-size: 11px; }
  .gate-tip[open] > summary::after { content: "▴"; }
  .gate-ctl.is-on .gate-tip > summary { border-color: rgba(47, 120, 88, .3); color: #2f6b4f; }
  .gate-ctl.is-on .gate-tip > summary::before { background: #2f9e6e; }
  .gate-note { margin: 6px 0 0; color: #6d6259; font-size: 13.5px; }
  .gate-ctl.is-on .gate-note { color: #3f6b55; }
  .gate-ctl.is-merged .act-ctl-row { gap: 10px; }
  .gate-ctl.is-merged .gate-state { flex: 1 1 240px; }
  `;
  document.head.appendChild(style);

  list.forEach((t) => {
    const key = `${t.kind}:${t.no}`;
    // 机制图闯关：和下面“打开闯关大屏”那条控制条（live-acts.js）合成一条（2026-11-22 用户“都做吧”：两条控制条上下叠着、样式不一）；
    // 经营沙盘：并进卡片最上面的经营台（2026-11-26，biz_sim.js 画的 [data-bzx-launch]，用户：“截图这块是不是放在最上方比较好？跟‘开始经营沙盘’结合在一起。”）
    const opener = t.kind === 'mech' ? t.place.querySelector('.act-ctl') : t.kind === 'biz' && t.section ? t.section.querySelector('[data-bzx-launch]') : null;
    let bar;
    if (opener && opener.querySelector('[data-ms-open], [data-bzx-open]')) {
      bar = opener;
      bar.classList.add('gate-ctl', 'is-merged');
      const row = bar.querySelector('.act-ctl-row');
      const openBtn = row.querySelector('[data-ms-open], [data-bzx-open]');
      openBtn.classList.remove('is-main');
      openBtn.classList.add('is-screen');
      const told = row.querySelector('.act-state');
      if (told) told.remove();
      row.insertAdjacentHTML('afterbegin', `<button type="button" class="is-main" data-gate-go><span class="gate-ico">${FLAG}</span>开始${esc(NAME[t.kind])}</button><button type="button" class="is-undo" data-gate-undo hidden>${UNDO}收起，重新开始</button>`);
      row.insertAdjacentHTML('beforeend', '<span class="gate-state" data-gate-state role="status"></span>');
      row.insertAdjacentHTML('afterend', `<details class="gate-tip"><summary>说明</summary><p class="gate-note">点“开始”以前，${esc(STUDENT[t.kind])}收起，只显示“等老师开始”；点了以后马上显示。`
        + (t.kind === 'biz' ? '点“打开经营大屏”，在大屏上一步一步主持：选角色、组内商量、代表投票、第一轮结果、突发事件、结算复盘。</p></details>'
          : '学生在自己的页面上闯关（不计修为）；点“打开闯关大屏”，在大屏上看在闯和通关的人数，再一步一步揭晓机制图和每个箭头的道理。</p></details>'));
    } else {
      bar = document.createElement('div');
      bar.className = 'gate-ctl';
      bar.setAttribute('data-ix', '');
      bar.innerHTML = `<div class="gate-row"><button type="button" class="is-main" data-gate-go><span class="gate-ico">${FLAG}</span>开始${esc(NAME[t.kind])}</button>`
        + `<button type="button" class="is-undo" data-gate-undo hidden>${UNDO}收起，重新开始</button><span class="gate-state" data-gate-state role="status"></span></div>`
        + `<details class="gate-tip"><summary>说明</summary><p class="gate-note">点“开始”以前，${esc(STUDENT[t.kind])}都收起，只显示“等老师开始”；点了以后马上显示。</p></details>`;
      t.place.insertAdjacentElement(t.where, bar);
    }
    const go = bar.querySelector('[data-gate-go]');
    const undo = bar.querySelector('[data-gate-undo]');
    const state = bar.querySelector('[data-gate-state]');
    let room = null;
    let at = '';         // 开始的时间（没开始为空）
    let busy = false;
    let off = '';        // 后台还没有这个功能时的说明
    const paint = () => {
      const on = Boolean(at);
      bar.classList.toggle('is-on', on);
      go.hidden = on;
      undo.hidden = !on;
      go.disabled = busy || !room || Boolean(off);
      undo.disabled = busy || !room;
      state.dataset.tone = off || !room ? 'warn' : on ? 'on' : 'idle';
      state.textContent = off || (!room ? '当前课堂不是本章（或没有登录教师工作台）：先在工作台发布本章课堂，再刷新本页。'
        : on ? `进行中 · ${hhmm(at)} 开始，学生页已显示${NAME[t.kind]}` : '未开始 · 学生页只显示“等老师开始”');
    };
    const take = (res) => { const started = (res && res.started) || {}; at = started[key] || ''; };
    async function refresh() {
      if (!room) return;
      try {
        take(await rpcOne('ck_game_started', { p_classroom: Number(room.id) || room.id }));
        off = '';
      } catch (problem) {
        if (missing(problem)) off = `后台还没有“老师开始”这个功能：请先在云开发 SQL 编辑器执行 ${SQL}（执行以前学生页不收起）。`;
        else console.warn('[小游戏老师开始]', problem);
      }
      paint();
    }
    async function set(on) {
      if (busy || !room) return;
      if (!on && !window.confirm(`收起${NAME[t.kind]}？学生页会重新显示“等老师开始”，已经递交的作答和聊天室的发言都不受影响。之后可以再点“开始”。`)) return;
      busy = true;
      paint();
      try {
        take(await rpcOne('ck_game_start', { p_classroom: Number(room.id) || room.id, p_game: key, p_on: on }));
        off = '';
      } catch (problem) {
        if (missing(problem)) off = `后台还没有“老师开始”这个功能：请先在云开发 SQL 编辑器执行 ${SQL}（执行以前学生页不收起）。`;
        else window.alert(`没有${on ? '开始' : '收起'}：${problem.message || problem}`);
      }
      busy = false;
      paint();
    }
    go.addEventListener('click', () => set(true));
    undo.addEventListener('click', () => set(false));
    paint();
    (async () => {
      try { room = await roomFor(t.no); } catch (error) { room = null; }
      paint();
      if (room) refresh();
      setInterval(async () => {
        if (document.hidden) return;
        if (!room) { try { room = await roomFor(t.no); } catch (error) { room = null; } paint(); }
        if (room) refresh();
      }, 15000);
    })();
  });
})();
