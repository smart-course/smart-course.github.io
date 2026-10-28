/* 辩论赛“聊天室看板”（课堂完整版投屏页，2026-10-28）：习经“辩论赛”卡片里的 [data-debate-board]。
 * 用户：“设置辩论赛聊天室，正方反方都有各自的聊天室……每一方被点赞次数最多的三位同学上台辩论。辩论结束后，全班同学再进行投票，
 * 看大家支持哪一方。赢的那一方的三位同学可以获得相应的修为值。”
 * 显示两方人数、发言数、热门发言（可隐藏不合适的）、每方点赞最多的三位（“揭晓上台辩手”后才显示姓名）、辩后票数；
 * 投票结束点“正方胜”或“反方胜”给获胜方三位辩手各加修为（ck_set_debate_winners，再点另一方整份替换，“撤销”收回）。
 * 需要在本机登录教师工作台（ck_debate_board 只给教师）；每 5 秒刷新一次（页面在前台、看板在屏幕上时）。
 */
(function () {
  'use strict';
  const boards = Array.from(document.querySelectorAll('[data-debate-board]'));
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!boards.length || !window.ClassLive || config.provider === 'off') return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[聊天室看板]', error.message); return; }
  const DB = window.ClassLive.DEBATE || { points: 10, top: 3 };
  const unit = config.unit || window.ClassLive.unitOf();
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SIDE = { pro: '正方', con: '反方' };

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
  .dbb-top { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; counter-reset: dbb; }
  .dbb-top li { counter-increment: dbb; display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 10px; background: linear-gradient(180deg, #fff6df, #f6e6bd); border: 1px solid rgba(184,134,43,.35); font-size: 18px; }
  .dbb-top li::before { content: counter(dbb); display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #b8862b; color: #fff; font-size: 13px; font-weight: 800; }
  .dbb-top li b { font-weight: 800; } .dbb-top .dbb-real { color: #6d4a2e; font-size: 16px; } .dbb-top em, .dbb-hot em { margin-left: auto; font-style: normal; color: #c0392b; font-weight: 800; white-space: nowrap; }
  .dbb-hot { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dbb-hot li { display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px; border-radius: 9px; background: #fff; border: 1px solid rgba(70,51,34,.1); font-size: 15.5px; line-height: 1.55; }
  .dbb-hot li b { flex: 0 0 auto; color: #23655f; } .dbb-side.is-con .dbb-hot li b { color: #a4492d; }
  .dbb-hot li span { flex: 1 1 auto; word-break: break-word; }
  .dbb-hot button { flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: #9a8b7a; font-size: 16px; line-height: 1; cursor: pointer; }
  .dbb-hot button:hover { background: #f3e3dc; color: #a4492d; }
  .dbb-empty { color: #8a7f74; font-size: 14px; }
  .dbb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding: 12px 18px; border-top: 1px solid rgba(70,51,34,.12); background: #f7f1e6; font-size: 15px; }
  .dbb-bar button { padding: 8px 14px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 9px; background: #fff; font: 800 14px/1.2 inherit; cursor: pointer; }
  .dbb-bar button.is-pro { border-color: #23655f; background: #23655f; color: #fff; } .dbb-bar button.is-con { border-color: #a4492d; background: #a4492d; color: #fff; }
  .dbb-bar button[disabled] { opacity: .5; cursor: default; }
  .dbb-votes { font-weight: 800; color: #3b2a14; } .dbb-status { color: #6d6259; font-size: 14px; } .dbb-status.is-ok { color: #23655f; font-weight: 800; }
  @media (max-width: 760px) { .dbb-cols { grid-template-columns: 1fr; } .dbb-side + .dbb-side { border-left: 0; border-top: 1px solid rgba(70,51,34,.12); } }
  `;
  document.head.appendChild(style);

  const roomFor = async (no) => {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const room = window.ClassLive.pickRoom(rooms, config.course, unit);
    if (!room || room.chapter !== unit) return null;
    if (room.case_no && Number(room.case_no) !== Number(no)) return null;
    return room;
  };

  boards.forEach((board) => {
    const no = board.dataset.case;
    let reveal = false;
    let room = null;
    let last = '';
    let busy = false;
    board.innerHTML = '<div class="dbb"><div class="dbb-cols"><section class="dbb-side is-pro" data-dbb-side="pro"></section><section class="dbb-side is-con" data-dbb-side="con"></section></div>'
      + `<div class="dbb-bar"><button type="button" data-dbb-reveal>揭晓上台辩手</button><span class="dbb-votes" data-dbb-votes></span>`
      + `<button type="button" class="is-pro" data-dbb-win="pro">正方胜：三位辩手各 +${DB.points} 修为</button><button type="button" class="is-con" data-dbb-win="con">反方胜：三位辩手各 +${DB.points} 修为</button>`
      + '<button type="button" data-dbb-win="">撤销加修为</button><span class="dbb-status" data-dbb-status role="status"></span></div></div>';
    const status = (text, ok) => { const el = board.querySelector('[data-dbb-status]'); el.textContent = text || ''; el.classList.toggle('is-ok', Boolean(ok)); };
    const sideHtml = (side, data) => {
      const top = (data.top || []).slice(0, DB.top);
      return `<header><b>${SIDE[side]}聊天室</b><span>${data.members} 人 · ${data.posts} 条发言</span></header>
        <h5>上台辩手（本方点赞最多的 ${DB.top} 位）</h5>${top.length ? `<ol class="dbb-top">${top.map((t) => `<li><b>${esc(t.nick)}</b>${reveal ? `<span class="dbb-real">${esc(t.name)}</span>` : ''}<em>♥ ${t.likes}</em></li>`).join('')}</ol>` : '<p class="dbb-empty">还没有人发言。</p>'}
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
        const key = JSON.stringify([data, reveal]);
        if (!force && key === last) return;
        last = key;
        const cols = board.querySelector('.dbb-cols');
        if (!cols.querySelector('[data-dbb-side]')) cols.innerHTML = '<section class="dbb-side is-pro" data-dbb-side="pro"></section><section class="dbb-side is-con" data-dbb-side="con"></section>';
        ['pro', 'con'].forEach((side) => { board.querySelector(`[data-dbb-side="${side}"]`).innerHTML = sideHtml(side, data[side] || { members: 0, posts: 0, top: [], hot: [] }); });
        board.querySelector('[data-dbb-votes]').textContent = `辩后投票：正方 ${(data.pro || {}).votes || 0} 票 · 反方 ${(data.con || {}).votes || 0} 票`;
        const awarded = data.awarded || [];
        if (awarded.length) status(`今天已给 ${awarded.map((a) => a.name).join('、')} 各加 ${awarded[0].points} 修为。`, true);
        else if (!board.querySelector('[data-dbb-status]').textContent.startsWith('请')) status('');
      } catch (error) {
        console.warn('[聊天室看板]', error);
        const text = String((error && error.message) || error);
        board.querySelector('.dbb-cols').innerHTML = `<p class="dbb-empty" style="padding:14px 18px">${/42501|只有教师|permission/.test(text) ? '请先在本机登录教师工作台，聊天室看板才能显示。'
          : /PGRST202|42883|Could not find the function|未知的后台函数/.test(text) ? '辩论聊天室还没有开通（后台尚未更新）。' : '看板暂时读不到，稍后会自动重试。'}</p>`;
        last = '';
      } finally {
        busy = false;
      }
    }
    board.addEventListener('click', async (event) => {
      const revealButton = event.target.closest('[data-dbb-reveal]');
      const win = event.target.closest('[data-dbb-win]');
      const hide = event.target.closest('[data-dbb-hide]');
      if (revealButton) {
        reveal = !reveal;
        revealButton.textContent = reveal ? '收起姓名' : '揭晓上台辩手';
        load(true);
      } else if (hide) {
        if (!window.confirm('隐藏这条发言？学生的聊天室里也看不到了，点赞也不再计入。')) return;
        try { await backend.rpc('ck_debate_hide', { p_post: Number(hide.dataset.dbbHide) || hide.dataset.dbbHide, p_hidden: true }); load(true); }
        catch (error) { status(`隐藏失败：${error.message || error}`); }
      } else if (win && room) {
        const side = win.dataset.dbbWin || null;
        const tip = side ? `${SIDE[side]}获胜：给${SIDE[side]}点赞最多的 ${DB.top} 位辩手（点名册内）各加 ${DB.points} 修为？\n再点另一方会整份替换。` : '撤销今天已经给辩手加的修为？';
        if (!window.confirm(tip)) return;
        win.disabled = true;
        try {
          let list = await backend.rpc('ck_set_debate_winners', { p_classroom: Number(room.id) || room.id, p_case: no, p_side: side, p_points: DB.points });
          list = Array.isArray(list) ? list : [];
          status(side ? (list.length ? `已给 ${list.map((a) => a.name).join('、')} 各加 ${DB.points} 修为。` : `${SIDE[side]}还没有点名册内的同学发言，没有加修为。`) : '已撤销。', true);
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
})();
