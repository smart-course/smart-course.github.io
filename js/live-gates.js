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
    if (first) targets.push({ kind: section.matches('[data-biz]') ? 'biz' : 'disc', no: section.dataset.practice, place: first, where: 'beforebegin' });
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
  .gate-ctl { margin: 14px 0; padding: 14px 16px; border: 2px solid #c9a24a; border-radius: 14px; background: linear-gradient(135deg, #fffaf0, #fdf1d8); color: #3b2a07;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; text-align: left; }
  .gate-ctl.is-on { border-color: #6fb08f; background: linear-gradient(135deg, #f3faf5, #e3f3ea); color: #173b29; }
  .gate-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; }
  .gate-ctl button { padding: 9px 16px; border: 1.5px solid rgba(70, 51, 34, .28); border-radius: 10px; background: #fff; color: #3b2a07; font: inherit; font-weight: 800; line-height: 1.2; white-space: nowrap; cursor: pointer; }
  .gate-ctl button.is-main { border-color: #b5701e; background: linear-gradient(180deg, #f6c765, #dd9a2c); color: #3b2400; font-size: 18px; padding: 11px 22px; box-shadow: 0 4px 12px rgba(181, 112, 30, .28); }
  .gate-ctl button:disabled { opacity: .5; cursor: default; }
  .gate-ctl button[hidden] { display: none; }
  .gate-state { flex: 1 1 260px; min-width: 0; font-weight: 700; }
  .gate-note { margin: 6px 0 0; color: #6d6259; font-size: 13.5px; }
  .gate-ctl.is-on .gate-note { color: #3f6b55; }
  `;
  document.head.appendChild(style);

  list.forEach((t) => {
    const key = `${t.kind}:${t.no}`;
    const bar = document.createElement('div');
    bar.className = 'gate-ctl';
    bar.setAttribute('data-ix', '');
    bar.innerHTML = `<div class="gate-row"><button type="button" class="is-main" data-gate-go>🚩 开始${esc(NAME[t.kind])}</button>`
      + '<button type="button" data-gate-undo hidden>收起，重新开始</button><span class="gate-state" data-gate-state role="status"></span></div>'
      + `<p class="gate-note">点“开始”以前，${esc(STUDENT[t.kind])}都收起，只显示“等老师开始”；点了以后马上显示。</p>`;
    t.place.insertAdjacentElement(t.where, bar);
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
      state.textContent = off || (!room ? '当前课堂不是本章（或没有登录教师工作台）：先在工作台发布本章课堂，再刷新本页。'
        : on ? `已开始（${hhmm(at)}）：学生页已经显示${NAME[t.kind]}。` : `还没开始：学生页现在只显示“${NAME[t.kind]} · 等老师开始”。`);
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
