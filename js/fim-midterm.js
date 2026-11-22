/* 《金融机构与市场》教师用的“期中经营模拟成绩”页。
 *   · 列出本班每位同学：选了哪一款、已结算几个月、目前总评、是否递交；点名册上还没选的同学排在前面；
 *   · 总评由本页用同一份游戏引擎从后台保存的存档“重算”，不采信学生端报的分数；重算结果与学生端不一致、任期设置不对、存档读不进引擎的，标出来；
 *   · 设置递交截止时间（过了以后后台不再保存、不能递交）；允许某位同学重开一次；重置某位同学的选择（清掉存档，重新选游戏）；撤回递交；
 *   · 导出成绩表（CSV，可用 Excel 打开）、导出某位同学的存档（JSON，可在游戏的“课堂与存档”里导入查看）。
 * 含学生姓名和成绩，不要投屏。需要老师已在同一个浏览器登录教师工作台。
 * 页面里已经内嵌两款游戏的引擎和题库（教师页用教师密码加密）；接口用 fim-game.js 的 window.FimGame.api。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  const host = document.querySelector('[data-midterm-console]');
  if (!config || !host || !window.FimGame) return;
  const { api, backend, SETTINGS, GAMES, doneOf, settingsOk } = window.FimGame;
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stamp = (at) => { const ms = Date.parse(at); return !at || Number.isNaN(ms) ? '' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(/\//g, '-'); };
  const sidKey = (sid) => String(sid || '').replace(/\s+/g, '').toUpperCase();
  const params = new URLSearchParams(location.search);
  const state = { klass: null, rooms: [], room: null, rows: [], log: [], checked: new Map(), problem: '正在连接课堂后台……', note: '', search: '' };
  const ENGINES = { bank: window.BankGame, broker: window.BrokerGame };

  // 用引擎重算：存档读不进引擎就标“存档无效”
  function recheck(row, wrapper) {
    const out = { ok: false, total: null, cap: null, parts: null, flags: [] };
    const Engine = ENGINES[row.game];
    const s = wrapper && wrapper.game;
    if (!s) { out.flags.push('后台没有存档'); return out; }
    try {
      const game = new Engine({}, JSON.parse(JSON.stringify(s)));
      const score = game.score();
      out.ok = true; out.total = score.total; out.cap = score.cap; out.parts = score.parts || { operating: score.operating, customer: score.customer, risk: score.risk, compliance: score.compliance, learning: score.learning };
      if (!settingsOk(s)) out.flags.push('任期设置不对');
      if (doneOf(s) !== Number(row.done)) out.flags.push('月数与后台记录不一致');
      if (row.summary && row.summary.score != null && Math.abs(Number(row.summary.score) - score.total) > 0.011) out.flags.push(`学生端报的是 ${row.summary.score} 分`);
    } catch (error) { out.flags.push(`存档无效：${String(error.message || error).slice(0, 40)}`); }
    return out;
  }

  const people = () => {
    const roster = (state.klass && Array.isArray(state.klass.roster) ? state.klass.roster : []).map((p) => ({ sid: sidKey(p.sid), name: p.name, extra: Boolean(p.extra) }));
    const bySid = new Map(roster.map((p) => [p.sid, { ...p, row: null }]));
    state.rows.forEach((row) => { const k = sidKey(row.sid); if (bySid.has(k)) bySid.get(k).row = row; else bySid.set(k, { sid: k, name: row.name, outside: true, row }); });
    return Array.from(bySid.values()).sort((a, b) => (a.row ? 1 : 0) - (b.row ? 1 : 0) || a.sid.localeCompare(b.sid));
  };

  function paint() {
    if (state.problem) { host.innerHTML = `<div class="fim-card"><p>${state.problem}</p></div>`; return; }
    const room = state.room;
    const list = people().filter((p) => !state.search || `${p.sid}${p.name}`.includes(state.search));
    const rows = state.rows;
    const count = (fn) => rows.filter(fn).length;
    const finals = rows.filter((r) => r.submitted_at).map((r) => (state.checked.get(sidKey(r.sid)) || {}).total).filter((v) => v != null);
    const avg = finals.length ? (finals.reduce((t, v) => t + v, 0) / finals.length).toFixed(1) : '—';
    const deadlineLocal = room.deadline ? new Date(Date.parse(room.deadline) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    host.innerHTML = `
      <div class="fim-card"><h3>${esc(room.name)}<small>　课堂码 ${esc(room.code)} · ${room.is_current ? (room.submissions_open ? '开放中' : '已结束提交') : '已停止'}</small></h3>
        <p>正式任期：${SETTINGS.months}个月、${SETTINGS.difficulty === 'standard' ? '标准情境' : '压力情境'}、场景码 ${esc(SETTINGS.seed)}。期中成绩＝结业总评（本页用游戏引擎从后台存档重算）。</p>
        <p class="mid-deadline"><label>递交截止时间 <input type="datetime-local" data-deadline value="${esc(deadlineLocal)}"></label>
          <button type="button" class="fim-btn is-ghost" data-deadline-save>保存</button> <button type="button" class="fim-btn is-ghost" data-deadline-clear>不设截止</button>
          <span class="fim-note">${room.deadline ? `现在的截止时间：${esc(stamp(room.deadline))}${Date.now() > Date.parse(room.deadline) ? '（已过，后台不再保存）' : ''}` : '现在没有设截止时间'}</span></p>
        ${state.note ? `<p class="fq-state is-ok">${esc(state.note)}</p>` : ''}</div>
      <div class="mid-tiles">
        <div><b>${count((r) => r.game === 'bank')}</b><span>选了“行长的一年”</span></div>
        <div><b>${count((r) => r.game === 'broker')}</b><span>选了“掌舵营业部”</span></div>
        <div><b>${people().filter((p) => !p.row).length}</b><span>点名册上还没选</span></div>
        <div><b>${count((r) => r.ended)}</b><span>任期已结束</span></div>
        <div><b>${count((r) => r.submitted_at)}</b><span>已递交</span></div>
        <div><b>${avg}</b><span>已递交的平均总评</span></div>
      </div>
      <div class="fim-card"><div class="mid-bar"><input type="search" placeholder="按学号或姓名查找" data-search value="${esc(state.search)}">
        <button type="button" class="fim-btn" data-export>导出成绩表（CSV）</button><button type="button" class="fim-btn is-ghost" data-refresh>刷新</button></div>
      <div class="mid-scroll"><table class="mid-table"><thead><tr><th>学号</th><th>姓名</th><th>游戏</th><th>已结算</th><th>总评（重算）</th><th>分项</th><th>最近保存</th><th>重开</th><th>递交</th><th>操作</th></tr></thead><tbody>
      ${list.map((p) => {
        const r = p.row;
        if (!r) return `<tr class="is-none"><td>${esc(p.sid)}</td><td>${esc(p.name)}</td><td colspan="8">还没有选游戏</td></tr>`;
        const c = state.checked.get(sidKey(r.sid));
        const parts = c && c.parts ? Object.entries({ operating: '经营', customer: '客户', risk: '风险', compliance: '合规', learning: '学习' }).map(([k, label]) => `${label}${c.parts[k] == null ? '—' : c.parts[k]}`).join(' ') : '';
        const flags = c ? c.flags.map((f) => `<em class="mid-flag">${esc(f)}</em>`).join('') : '';
        return `<tr><td>${esc(r.sid)}</td><td>${esc(r.name || p.name || '')}${p.outside ? '<em class="mid-flag">不在点名册</em>' : ''}</td><td>${esc((GAMES[r.game] || {}).name || r.game)}</td>
          <td>${r.done}/${SETTINGS.months}${r.ended ? ' 已结束' : ''}</td>
          <td>${c ? (c.total == null ? '—' : `<b>${c.total}</b>${c.cap != null && c.cap < 100 ? `<small>（封顶${c.cap}）</small>` : ''}`) : r.done ? '<small>正在重算……</small>' : '—'}${flags}</td>
          <td><small>${esc(parts)}</small></td><td>${esc(stamp(r.updated_at))}</td><td>${r.restarts}/${r.restarts_allowed}</td>
          <td>${r.submitted_at ? `<span class="mid-ok">${esc(stamp(r.submitted_at))}</span>` : r.ended ? '<span class="mid-warn">未递交</span>' : ''}</td>
          <td class="mid-acts"><button type="button" data-act="allow" data-sid="${esc(r.sid)}" title="允许这位同学重开一次（正式任期从头再来）">允许重开</button>
            <button type="button" data-act="json" data-sid="${esc(r.sid)}" title="下载这位同学的存档，可在游戏“课堂与存档”里导入查看">存档</button>
            ${r.submitted_at ? `<button type="button" data-act="reopen" data-sid="${esc(r.sid)}" title="撤回递交，这位同学可以继续经营、重新递交">撤回递交</button>` : ''}
            <button type="button" class="is-warn" data-act="reset" data-sid="${esc(r.sid)}" title="清掉这位同学的选择和存档，让他重新选游戏">重置</button></td></tr>`;
      }).join('') || '<tr><td colspan="10">本班还没有点名册，也没有同学选游戏。</td></tr>'}</tbody></table></div>
      <p class="fim-note">“重开”一栏是 已用次数/允许次数。学生端不能自己重开或换成别的存档；要重开，先点“允许重开”。</p></div>`;
  }

  async function checkAll() {
    for (const row of state.rows) {
      const k = sidKey(row.sid);
      const tag = `${row.revision}|${row.submitted_at || ''}`;
      const old = state.checked.get(k);
      if (!row.done && !row.ended) { state.checked.set(k, { tag, ok: false, total: null, cap: null, parts: null, flags: [] }); continue; }
      if (old && old.tag === tag) continue;
      try {
        const res = await api.state(state.room.id, row.sid);
        state.checked.set(k, { tag, wrapper: res.state, ...recheck(row, res.state) });
      } catch (error) { state.checked.set(k, { tag: '', ok: false, total: null, cap: null, parts: null, flags: ['没有读到存档'] }); }
    }
    paint();
  }

  async function load() {
    try {
      const session = await backend.session();
      if (!session || session.anonymous) { state.problem = '请先在同一个浏览器打开<a href="/teacher/" target="_blank" rel="noopener">教师工作台</a>登录，再刷新本页。'; paint(); return; }
      const classes = await backend.fetchAll('classes', { course: config.course });
      let wanted = params.get('class');
      if (!wanted) { try { wanted = localStorage.getItem(`teacher:class:${config.course}`); } catch (error) { wanted = null; } }
      state.klass = classes.find((c) => String(c.id) === String(wanted)) || classes[0] || null;
      if (!state.klass) { state.problem = '这门课还没有班级：先到教师工作台新建班级、导入点名册。'; paint(); return; }
      const rooms = (await backend.fetchAll('classrooms', { course: config.course })).filter((r) => String(r.class_id) === String(state.klass.id) && r.chapter === (config.midterm || {}).unit);
      state.rooms = rooms.sort((a, b) => Number(b.id) - Number(a.id));
      state.room = state.rooms.find((r) => String(r.id) === params.get('room')) || state.rooms.find((r) => r.is_current) || state.rooms[0] || null;
      if (!state.room) { state.problem = `“${esc(state.klass.name)}”还没有发布期中经营模拟：到教师工作台“发布本周课堂”，选“期中　期中经营模拟”，勾上“本班其他开放中的课堂保持开放”。`; paint(); return; }
      const board = await api.board(state.room.id);
      state.rows = board.rows || [];
      state.log = board.log || [];
      state.problem = '';
      paint();
      checkAll();
    } catch (error) {
      state.problem = /fg_|does not exist|PGRST202|42883/.test(String(error && error.message)) ? '后台还没有建好期中经营模拟的表和函数（需要先执行这门课的 SQL）。' : '读不到数据：请确认已在教师工作台登录，网络正常。';
      paint();
    }
  }

  const csv = (rows) => '﻿' + rows.map((row) => row.map((cell) => { const t = cell == null ? '' : String(cell); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(',')).join('\r\n') + '\r\n';
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };

  host.addEventListener('input', (event) => { if (event.target.matches('[data-search]')) { state.search = event.target.value.trim(); paint(); const box = $('[data-search]', host); box.focus(); box.setSelectionRange(box.value.length, box.value.length); } });
  host.addEventListener('click', async (event) => {
    const room = state.room;
    if (event.target.closest('[data-refresh]')) { state.note = ''; load(); return; }
    if (event.target.closest('[data-deadline-save]') || event.target.closest('[data-deadline-clear]')) {
      const clear = Boolean(event.target.closest('[data-deadline-clear]'));
      const value = $('[data-deadline]', host).value;
      if (!clear && !value) { window.alert('先选好截止的日期和时间。'); return; }
      try {
        await backend.rpc('ck_set_deadline', { p_classroom: Number(room.id), p_deadline: clear ? null : new Date(value).toISOString() });
        state.note = clear ? '已取消截止时间。' : `截止时间已设为 ${stamp(new Date(value).toISOString())}。`;
        load();
      } catch (error) { window.alert('没有保存成功：' + String(error.message || error).slice(0, 80)); }
      return;
    }
    if (event.target.closest('[data-export]')) {
      const head = ['学号', '姓名', '游戏', '已结算月数', '任期是否结束', '期中成绩（结业总评，重算）', '总评封顶', '经营', '客户', '风险', '合规', '学习', '是否递交', '递交时间', '最近保存', '重开次数', '需要留意'];
      const lines = people().map((p) => {
        const r = p.row;
        if (!r) return [p.sid, p.name, '还没有选', '', '', '', '', '', '', '', '', '', '否', '', '', '', ''];
        const c = state.checked.get(sidKey(r.sid)) || {};
        const parts = c.parts || {};
        return [r.sid, r.name || p.name, (GAMES[r.game] || {}).name || r.game, r.done, r.ended ? '是' : '否', r.submitted_at && c.total != null ? c.total : '', c.cap == null ? '' : c.cap,
          parts.operating, parts.customer, parts.risk, parts.compliance, parts.learning, r.submitted_at ? '是' : '否', stamp(r.submitted_at), stamp(r.updated_at), r.restarts, (c.flags || []).join('；')];
      });
      download(`期中经营模拟成绩_${state.klass.name}.csv`, csv([head].concat(lines)), 'text/csv;charset=utf-8');
      return;
    }
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const sid = button.dataset.sid;
    const row = state.rows.find((r) => sidKey(r.sid) === sidKey(sid));
    const who = `${row.name || ''}（${row.sid}）`;
    try {
      if (button.dataset.act === 'allow') {
        if (!window.confirm(`允许 ${who} 重开一次？他现在的进度会在他重开时作废。`)) return;
        await api.allowRestart(room.id, sid, 1);
        state.note = `已允许 ${who} 重开一次。`;
      } else if (button.dataset.act === 'reset') {
        if (window.prompt(`重置 ${who} 的选择：他的存档和递交记录都会删除，可以重新选游戏。\n确认请输入他的学号：`) !== String(row.sid)) return;
        await api.reset(room.id, sid);
        state.checked.delete(sidKey(sid));
        state.note = `已重置 ${who}。`;
      } else if (button.dataset.act === 'reopen') {
        if (!window.confirm(`撤回 ${who} 的递交？他可以继续经营，之后要重新递交。`)) return;
        await api.reopen(room.id, sid);
        state.note = `已撤回 ${who} 的递交。`;
      } else if (button.dataset.act === 'json') {
        const res = await api.state(room.id, sid);
        if (!res || !res.state) { window.alert('后台还没有这位同学的存档。'); return; }
        download(`${(GAMES[row.game] || {}).name || row.game}_${row.sid}_${row.name || ''}.json`, JSON.stringify(res.state, null, 2), 'application/json');
        return;
      }
      load();
    } catch (error) { window.alert('没有成功：' + String(error.message || error).slice(0, 80)); }
  });

  load();
  setInterval(() => { if (document.visibilityState === 'visible' && !state.problem && !document.activeElement.matches('input')) load(); }, 20000);
})();
