/* 分组讨论投屏页（习经课堂完整版，有圆桌会议的案例 02、03、04、05、10、11、13、14）：卡片里的 [data-disc-board] 和 [data-disc-result]。
 * 2026-11-11 用户：“你看下能否把‘机制图 · 弹幕接龙’和‘圆桌会议’改为讨论课，比如让学生进行分组讨论？比如可以按照角色的不同分成四组。
 * 讨论的题目要能激发学生的积极性。讨论的形式可以让同学们在聊天室中进行，然后点赞，参照习经的做法？”
 *   讨论看板（② 组内讨论）：四个角色组的人数、发言数、全部发言（按发布时间固定排列，可上下滑动；可隐藏不合适的发言）、每组点赞最多的发言人；
 *     “揭晓姓名”后显示姓名（③ 各组亮观点时请发言人起来说）。
 *   公布结果（⑤ 揭晓对照）：按三项议程（sim-1—3）全班表决的票数，算出哪几组的提案被采纳（提案对应的方案在那一项里票数最多，并列不算，老师可以点组名改），
 *     点“公布结果，加修为”（ck_set_disc_awards）：各组发言人加 leader，提案被采纳的组里在聊天室发过言的同学加 win；可改判、撤销。
 * 需要在本机登录教师工作台（ck_disc_board、ck_set_disc_awards 只给教师）；看板每 3 秒刷新一次（页面在前台、卡片在屏幕上时）。
 */
(function () {
  'use strict';
  const boards = Array.from(document.querySelectorAll('[data-disc-board]'));
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  if (!boards.length || !window.ClassLive || config.provider === 'off') return;
  let backend = null;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[分组讨论]', error.message); return; }
  const DS = window.ClassLive.DISCUSS || { leader: 5, win: 5, roles: ['r1', 'r2', 'r3', 'r4'] };
  const ROLES = DS.roles || ['r1', 'r2', 'r3', 'r4'];
  const unit = config.unit || window.ClassLive.unitOf();
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const problemText = (error) => {
    const text = String((error && error.message) || error);
    return /42501|只有教师|permission/.test(text) ? '请先在本机登录教师工作台。'
      : /PGRST202|42883|Could not find the function|未知的后台函数/.test(text) ? '分组讨论的看板还没有开通（后台尚未更新）。' : '暂时读不到，稍后会自动重试。';
  };

  const style = document.createElement('style');
  style.textContent = `
  .dsb { border-radius: 14px; border: 1px solid rgba(70,51,34,.18); background: #fffdf8; box-shadow: 0 8px 22px rgba(70,51,34,.08); overflow: hidden; }
  .dsb-cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .dsb-col { min-width: 0; padding: 0 0 12px; }
  .dsb-col + .dsb-col { border-left: 1px solid rgba(70,51,34,.12); }
  .dsb-col header { display: grid; gap: 2px; padding: 9px 14px; color: #fff; background: #23655f; }
  .dsb-col.is-r2 header { background: #a4492d; } .dsb-col.is-r3 header { background: #3d5a99; } .dsb-col.is-r4 header { background: #8a5a1a; }
  .dsb-col header b { font-size: 17px; letter-spacing: .06em; } .dsb-col header span { font-size: 13px; opacity: .92; }
  .dsb-lead { margin: 10px 12px 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(184,134,43,.4); background: #fff7e3; font-size: 14.5px; line-height: 1.5; }
  .dsb-lead b { color: #8a5a1a; } .dsb-lead em { font-style: normal; font-weight: 800; color: #c0392b; } .dsb-lead small { color: #6d6259; }
  .dsb-lead.is-none { border-style: dashed; background: #fbf8f2; color: #8a7f74; }
  .dsb-feed { margin: 0; padding: 0 10px 0 12px; list-style: none; display: grid; gap: 6px; grid-auto-rows: max-content; max-height: 420px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
  .dsb-feed[hidden], .dsb-none[hidden] { display: none; }
  .dsb-feed li { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 4px 8px; padding: 7px 9px; border-radius: 9px; background: #fff; border: 1px solid rgba(70,51,34,.1); font-size: 15px; line-height: 1.55; }
  .dsb-feed li b { flex: 0 0 auto; color: #23655f; } .dsb-col.is-r2 .dsb-feed li b { color: #a4492d; } .dsb-col.is-r3 .dsb-feed li b { color: #3d5a99; } .dsb-col.is-r4 .dsb-feed li b { color: #8a5a1a; }
  .dsb-feed li b small { margin-left: 4px; font-weight: 400; color: #8a7f74; }
  .dsb-feed li span { flex: 1 1 100%; word-break: break-word; } .dsb-feed li time { color: #8a7f74; font-size: 12.5px; font-variant-numeric: tabular-nums; }
  .dsb-feed em { font-style: normal; color: #c0392b; font-weight: 800; white-space: nowrap; }
  .dsb-feed button { margin-left: auto; width: 22px; height: 22px; border: 0; border-radius: 50%; background: transparent; color: #9a8b7a; font-size: 15px; line-height: 1; cursor: pointer; }
  .dsb-feed button:hover { background: rgba(192,57,43,.1); color: #c0392b; }
  .dsb-none { margin: 4px 12px 0; color: #8a7f74; font-size: 14px; }
  .dsb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 10px 16px; border-top: 1px solid rgba(70,51,34,.12); background: #fbf6ec; }
  .dsb-bar button, .dsr-acts button { padding: 7px 14px; border: 1.5px solid rgba(70,51,34,.25); border-radius: 9px; background: #fff; color: #201c18; font-weight: 800; font-size: 14px; line-height: 1.2; cursor: pointer; }
  .dsb-status, .dsr-status { color: #6d6259; font-size: 14px; } .dsb-status.is-ok, .dsr-status.is-ok { color: #1f7a4d; font-weight: 700; }
  .dsr { display: grid; gap: 12px; padding: 14px 18px 16px; border-radius: 14px; border: 1.5px solid rgba(184,134,43,.45); background: linear-gradient(180deg, #fffaf0, #fbf1da); }
  .dsr h5 { margin: 0; font-size: 15px; color: #8a5a1a; letter-spacing: .04em; }
  .dsr-votes { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
  .dsr-votes li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: baseline; padding: 8px 12px; border-radius: 10px; background: #fff; border: 1px solid rgba(70,51,34,.1); font-size: 15px; }
  .dsr-votes li > span { color: #4a3f36; } .dsr-votes li > b { white-space: nowrap; font-variant-numeric: tabular-nums; } .dsr-votes li > b i { font-style: normal; color: #b8862b; margin: 0 4px; }
  .dsr-votes li > b u { text-decoration: none; color: #c0392b; }
  .dsr-groups { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .dsr-group { display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px; border: 2px solid rgba(70,51,34,.15); background: #fff; text-align: left; font: inherit; color: #201c18; cursor: pointer; }
  .dsr-group b { font-size: 16px; } .dsr-group small { color: #6d6259; font-size: 13px; line-height: 1.5; }
  .dsr-group > span { justify-self: start; padding: 1px 10px; border-radius: 999px; background: #eee6d8; color: #6d6259; font-size: 13px; font-weight: 800; }
  .dsr-group[aria-pressed="true"] { border-color: #1f7a4d; background: #eef8f2; } .dsr-group[aria-pressed="true"] > span { background: #1f7a4d; color: #fff; }
  .dsr-group.is-locked { cursor: default; }
  .dsr-note { margin: 0; color: #4a3f36; font-size: 14.5px; line-height: 1.7; }
  .dsr-awards { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 15px; line-height: 1.6; color: #4a3f36; }
  .dsr-awards li::before { content: "✦ "; color: #b8862b; }
  .dsr-acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .dsr-acts button.is-main { border-color: #b8862b; background: linear-gradient(180deg, #f6dc98, #dcb253); color: #3b2a07; font-size: 15px; }
  .dsr-acts button[disabled] { opacity: .5; cursor: default; }
  @media (max-width: 900px) { .dsb-cols, .dsr-groups { grid-template-columns: 1fr 1fr; } .dsb-col:nth-child(3) { border-left: 0; } .dsb-col:nth-child(n+3) { border-top: 1px solid rgba(70,51,34,.12); } }
  @media (max-width: 560px) { .dsb-cols, .dsr-groups { grid-template-columns: 1fr; } .dsb-col + .dsb-col { border-left: 0; border-top: 1px solid rgba(70,51,34,.12); } }
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

  boards.forEach((board) => {
    const no = board.dataset.case;
    const section = board.closest('[data-discuss]') || board.parentElement;
    const resultBox = section.querySelector(`[data-disc-result][data-case="${no}"]`);
    let roles = [];
    let tasks = [];
    try { roles = JSON.parse(board.dataset.roles || '[]'); tasks = JSON.parse(board.dataset.discTasks || '[]'); } catch (error) { /* 页面数据不全 */ }
    const nameOf = (key) => roles[Number(String(key).slice(1)) - 1] || key;
    let room = null;
    let data = null;
    let last = '';
    let busy = false;
    let reveal = false;
    let picks = null;       // 老师手动改过的“采纳”组；null＝按票数自动算
    let published = null;   // 刚公布的结果 { list }

    board.innerHTML = '<div class="dsb"><div class="dsb-cols"></div><div class="dsb-bar"><button type="button" data-dsb-reveal>揭晓姓名</button>'
      + '<span class="dsb-status" data-dsb-status role="status"></span></div></div>';
    const status = (text, ok) => { const el = board.querySelector('[data-dsb-status]'); el.textContent = text || ''; el.classList.toggle('is-ok', Boolean(ok)); };
    if (resultBox) resultBox.innerHTML = '<div class="dsr"></div>';

    // 三项议程的票数：sim-1—3 每项哪个方案最多（并列不算）
    function majority() {
      const votes = (data && data.votes) || {};
      const out = {};
      [1, 2, 3].forEach((n) => {
        const counts = votes[`sim-${n}`] || {};
        const max = Math.max(0, ...Object.values(counts).map(Number));
        const tops = Object.keys(counts).filter((k) => Number(counts[k]) === max && max > 0);
        out[n] = { counts, max, top: tops.length === 1 ? tops[0] : null, tie: tops.length > 1 };
      });
      return out;
    }
    function autoWon() {
      const m = majority();
      return tasks.filter((t) => { const r = m[Number(t.task[0])]; return r && r.top === t.task[1]; }).map((t) => t.key);
    }
    // 采纳的组：老师手动改过的 > 已公布的 > 按票数自动算
    const wonNow = () => picks || (data && data.result && Array.isArray(data.result.won) ? data.result.won.slice() : autoWon());

    function renderBoard() {
      const cols = board.querySelector('.dsb-cols');
      if (!room) {
        cols.innerHTML = '<p class="dsb-none" style="padding:14px 18px">当前没有开放本案例的课堂：在教师工作台发布或打开“学生可进入”后，这里显示四个组的聊天室。</p>';
        return;
      }
      if (!cols.querySelector('[data-dsb-feed]')) {
        cols.innerHTML = ROLES.map((key) => `<section class="dsb-col is-${key}"><header><b>${esc(nameOf(key))}组</b><span data-dsb-count></span></header>
          <div class="dsb-lead" data-dsb-lead></div><ul class="dsb-feed" data-dsb-feed="${key}"></ul><p class="dsb-none" data-dsb-none>还没有发言</p></section>`).join('');
      }
      const leaders = (data && data.leaders) || [];
      ROLES.forEach((key) => {
        const d = (data && data[key]) || { members: 0, posts: 0, all: [], top: [] };
        const col = cols.querySelector(`.dsb-col.is-${key}`);
        col.querySelector('[data-dsb-count]').textContent = `${d.members} 人 · ${d.posts} 条发言`;
        const lead = leaders.find((l) => l.side === key) || ((d.top || [])[0] && d.top[0].likes > 0 ? d.top[0] : null);
        const leadBox = col.querySelector('[data-dsb-lead]');
        leadBox.className = `dsb-lead${lead ? '' : ' is-none'}`;
        leadBox.innerHTML = lead ? `<b>发言人</b> ${esc(lead.nick)}${reveal && lead.name ? `（${esc(lead.name)}）` : ''} <em>♥ ${lead.likes}</em> <small>· ${lead.posts} 条</small>`
          : '还没有人被点赞：点赞最多的就是本组发言人';
        const box = col.querySelector(`[data-dsb-feed="${key}"]`);
        const rows = d.all || [];
        col.querySelector('[data-dsb-none]').hidden = rows.length > 0;
        box.hidden = !rows.length;
        window.ClassLive.syncFeed(box, rows, (h) => `<b>${esc(h.nick)}${reveal && h.name ? `<small>${esc(h.name)}</small>` : ''}</b>`
          + `<time>${esc(window.ClassLive.feedClock(h.at))}</time>${h.likes ? `<em>♥ ${h.likes}</em>` : ''}<button type="button" data-dsb-hide="${esc(h.id)}" title="隐藏这条发言" aria-label="隐藏这条发言">×</button><span>${esc(h.text)}</span>`);
      });
      board.querySelector('[data-dsb-reveal]').textContent = reveal ? '收起姓名' : '揭晓姓名';
    }

    function renderResult() {
      if (!resultBox) return;
      const box = resultBox.querySelector('.dsr');
      if (!room) { box.innerHTML = '<p class="dsr-note">当前没有开放本案例的课堂，公布不了结果。</p>'; return; }
      const m = majority();
      const won = wonNow();
      const saved = data && data.result;
      const rounds = [1, 2, 3].map((n) => {
        const r = m[n];
        const total = Object.values(r.counts).reduce((s, v) => s + Number(v), 0);
        const parts = ['A', 'B', 'C'].map((c) => `${c} ${Number(r.counts[c] || 0)}`).join('<i>·</i>');
        return `<li><span>第 ${n} 项议程（${total} 人表决）${r.tie ? '：最多的方案票数相同，不算采纳' : r.top ? `：方案 ${r.top} 最多` : '：还没有人表决'}</span><b>${parts}</b></li>`;
      }).join('');
      const groups = tasks.map((t) => {
        const on = won.includes(t.key);
        return `<button type="button" class="dsr-group" data-dsr-pick="${esc(t.key)}" aria-pressed="${on}"><b>${esc(t.name)}组</b>`
          + `<small>提案：${esc(t.proposal)}</small><small>对应 ${esc(t.label)}</small><span>${on ? '✓ 被采纳' : '未采纳'}</span></button>`;
      }).join('');
      const list = (published && published.list) || null;
      const awards = list ? (list.length ? `<ul class="dsr-awards">${list.map((a) => `<li>${reveal ? esc(a.name) : `${esc(nameOf(a.side))}组的一位同学`} +${a.points}${a.leader ? '（本组发言人）' : ''}${a.win ? '（提案被采纳）' : ''}</li>`).join('')}</ul>`
        : '<p class="dsr-note">这次没有同学加分（各组还没有人被点赞，被采纳的组里也没有人发过言，或不在点名册里）。</p>') : '';
      const awardedNow = ((data && data.awarded) || []).length;
      box.innerHTML = `<h5>全班表决结果</h5><ol class="dsr-votes">${rounds}</ol>
        <h5>哪几组的提案写进了协商结果（按票数自动算，点组名可以改）</h5><div class="dsr-groups">${groups}</div>
        <p class="dsr-note">公布后：各组点赞最多的发言人各加 ${DS.leader} 修为，被采纳的组里在聊天室发过言的同学各加 ${DS.win} 修为（同一人相加，只给点名册内的同学）。${saved ? '本案例已公布过，再点一次会按现在的选择改判。' : ''}</p>
        <div class="dsr-acts"><button type="button" class="is-main" data-dsr-publish>${saved ? '按现在的选择改判' : '公布结果，加修为'}</button>
          ${saved ? '<button type="button" data-dsr-clear>撤销本案例的结果</button>' : ''}${picks ? '<button type="button" data-dsr-auto>按票数重新算</button>' : ''}
          <span class="dsr-status" data-dsr-status role="status">${awardedNow ? `本课堂已给 ${awardedNow} 位同学加分组讨论修为。` : ''}</span></div>${awards}`;
    }

    async function load(force) {
      if (busy && !force) return;
      busy = true;
      try {
        room = await roomFor(no);
        data = room ? await rpcOne('ck_disc_board', { p_classroom: Number(room.id) || room.id, p_case: no }) : null;
        const key = JSON.stringify([data, reveal, Boolean(room), picks, published]);
        if (force || key !== last) {
          last = key;
          renderBoard();
          renderResult();
        }
      } catch (error) {
        console.warn('[分组讨论]', error);
        board.querySelector('.dsb-cols').innerHTML = `<p class="dsb-none" style="padding:14px 18px">${esc(problemText(error))}</p>`;
        if (resultBox) resultBox.querySelector('.dsr').innerHTML = `<p class="dsr-note">${esc(problemText(error))}</p>`;
        last = '';
      } finally {
        busy = false;
      }
    }
    board.addEventListener('click', async (event) => {
      const revealButton = event.target.closest('[data-dsb-reveal]');
      const hide = event.target.closest('[data-dsb-hide]');
      if (revealButton) {
        reveal = !reveal;
        renderBoard();
        renderResult();
      } else if (hide) {
        if (!window.confirm('隐藏这条发言？学生的聊天室里也看不到了，它的点赞也不再计入。')) return;
        try { await backend.rpc('ck_debate_hide', { p_post: Number(hide.dataset.dsbHide) || hide.dataset.dsbHide, p_hidden: true }); status('已隐藏这条发言。', true); load(true); }
        catch (error) { status(`隐藏失败：${error.message || error}`); }
      }
    });
    if (resultBox) {
      resultBox.addEventListener('click', async (event) => {
        const pick = event.target.closest('[data-dsr-pick]');
        const say = (text, ok) => { const el = resultBox.querySelector('[data-dsr-status]'); if (el) { el.textContent = text; el.classList.toggle('is-ok', Boolean(ok)); } };
        if (pick) {
          const now = wonNow();
          const key = pick.dataset.dsrPick;
          picks = now.includes(key) ? now.filter((k) => k !== key) : now.concat([key]);
          published = null;
          renderResult();
          return;
        }
        if (event.target.closest('[data-dsr-auto]')) { picks = null; renderResult(); return; }
        const publish = event.target.closest('[data-dsr-publish]');
        const clear = event.target.closest('[data-dsr-clear]');
        if (!publish && !clear || !room) return;
        if (clear && !window.confirm('撤销本案例分组讨论的结果？已加的修为会收回。')) return;
        const button = publish || clear;
        button.disabled = true;
        try {
          const res = await rpcOne('ck_set_disc_awards', { p_classroom: Number(room.id) || room.id, p_case: no, p_won: clear ? null : wonNow(), p_leader: DS.leader, p_win: DS.win });
          published = clear ? null : { list: Array.isArray(res.list) ? res.list : [] };
          picks = null;
          await load(true);
          say(clear ? '已撤销本案例的结果，修为已收回。' : `已公布：${published.list.length} 位同学加了修为。`, true);
        } catch (error) {
          console.warn('[分组讨论]', error);
          say(`没有成功：${problemText(error)}`);
          button.disabled = false;
        }
      });
    }
    load(true);
    setInterval(() => {
      if (document.hidden) return;
      const rect = section.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200 || section.closest('[hidden]')) return;
      load(false);
    }, Number(DS.poll) || 3000);
  });
})();
