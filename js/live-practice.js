/*
 * 修炼场（2026-10-22）：学生平时在课堂面板点“修炼场”做题攒修为。两门课各自一个修炼场（按 course 分开，题库、记录、每日上限都不串）。
 * 题目、答案都在后台：ck_practice_home（各单元开放情况、今日修为）、ck_practice_items（取题，不含答案）、
 * ck_practice_answer（作答后才返回答案和讲解，并按规则加修为）。规则常量见 live-core.js 的 ClassLive.PRACTICE。
 * 题目是另写的新题（与课堂正文不重复）。四种修炼方法（与“学习方法小锦囊”同名）：西蒙学习法（专攻一块）、
 * 间隔重复（错题回炉）、交错练习（混合乱炼）——这三种做情境辨析、易错判断；费曼学习法（讲给别人听）有自己的专用题
 * （body.method = 'feynman'：挑出又通俗又没讲错的讲法、揪出讲解里讲错的一句，后台 p_mode 'feynman' 出题），答完再用自己的话讲一遍；
 * 答题时可开“先想后看”（主动回忆：选项先遮住，心里想好再看）。
 * 用法：ClassLivePractice.open({ backend, identity, config })，由 live-student.js 的面板按钮调用。
 */
(function () {
  'use strict';
  const Live = window.ClassLive || {};
  const PRACTICE = Live.PRACTICE || { delay: 0, of: () => ({ cap: 3 }), text: () => '' };
  const COURSE = { 'xjp-economy': '习近平经济思想概论', 'political-economy': '政治经济学' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (error) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* 本机存不了时不记 */ } };
  const LET = (i) => String.fromCharCode(65 + Number(i));
  const dayText = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${Number(m[2])} 月 ${Number(m[3])} 日` : ''; };

  const CSS = `
  .lp-modal { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 14px; background: rgba(14,22,20,.6);
    -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif; }
  .lp-modal[hidden] { display: none; }
  .lp-card { position: relative; width: min(780px, 100%); max-height: calc(100vh - 28px); max-height: calc(100dvh - 28px); display: flex; flex-direction: column;
    overflow: hidden; border-radius: 18px; background: #fbf7ee; color: #1f322d; box-shadow: 0 30px 90px rgba(0,0,0,.35); }
  .lp-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; color: #fff8e6;
    background: radial-gradient(circle at 12% 0, rgba(255,214,110,.28), transparent 55%), linear-gradient(120deg, #173f39, #245e55 60%, #2f6f63); }
  .lp-head h3 { margin: 0; font: 900 25px/1.2 "Kaiti SC", STKaiti, KaiTi, serif; letter-spacing: .18em; color: #ffd36b; text-shadow: 0 0 12px rgba(255,200,90,.35); }
  .lp-head small { display: block; font-size: 12px; letter-spacing: .06em; color: rgba(255,248,230,.75); }
  .lp-today { margin-left: auto; text-align: right; font-size: 13px; line-height: 1.5; }
  .lp-today b { display: block; font-size: 17px; color: #ffe39a; white-space: nowrap; }
  .lp-today { white-space: nowrap; }
  .lp-close { flex: 0 0 auto; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,.3); border-radius: 50%; background: rgba(255,255,255,.08); color: #fff8e6; font-size: 21px; line-height: 1; cursor: pointer; }
  .lp-body { overflow: auto; padding: 16px 18px 20px; font-size: 16px; line-height: 1.75; -webkit-overflow-scrolling: touch; }
  .lp-note { margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; background: #efe8d6; color: #4e5a54; font-size: 14px; line-height: 1.7; }
  .lp-note b { color: #a4492d; }
  .lp-methods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 18px; }
  .lp-method { position: relative; text-align: left; padding: 12px 14px; border: 1px solid #d8d1bf; border-radius: 12px; background: #fffdf8; color: inherit; cursor: pointer; font: inherit; }
  .lp-method:hover:not(:disabled) { border-color: #2f6f63; box-shadow: 0 6px 16px rgba(36,94,85,.12); }
  .lp-method:disabled { opacity: .55; cursor: not-allowed; }
  .lp-method span { display: inline-block; padding: 0 8px; border-radius: 5px; background: #e3eee8; color: #245e55; font-size: 12px; font-weight: 700; letter-spacing: .06em; }
  .lp-method strong { display: block; margin: 4px 0 2px; font-size: 18px; }
  .lp-method p { margin: 0; font-size: 13.5px; line-height: 1.65; color: #5d6964; }
  .lp-method i { position: absolute; top: 10px; right: 12px; padding: 0 8px; border-radius: 999px; background: #c8452d; color: #fff; font-style: normal; font-size: 12px; font-weight: 700; line-height: 1.7; }
  .lp-h { margin: 6px 0 8px; font-size: 15px; font-weight: 700; color: #245e55; letter-spacing: .04em; }
  .lp-units { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .lp-unit { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; padding: 10px 14px; border: 1px solid #d8d1bf; border-radius: 11px;
    background: #fffdf8; color: inherit; text-align: left; font: inherit; cursor: pointer; }
  .lp-unit:hover:not(:disabled) { border-color: #2f6f63; }
  .lp-unit:disabled { cursor: default; background: #f4f0e6; color: #7d857f; }
  .lp-unit b { font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
  .lp-unit em { font-style: normal; font-size: 13px; color: #6b746f; white-space: nowrap; }
  .lp-unit .lp-bar { grid-column: 1 / -1; height: 6px; border-radius: 6px; background: #e6dfcf; overflow: hidden; }
  .lp-unit .lp-bar i { display: block; height: 100%; background: linear-gradient(90deg, #2f6f63, #d6a33a); border-radius: 6px; }
  .lp-due { margin-left: 6px; padding: 0 7px; border-radius: 999px; background: #fbe3da; color: #a4492d; font-size: 12px; }
  .lp-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin-bottom: 12px; font-size: 14px; color: #5d6964; }
  .lp-top b { color: #245e55; }
  .lp-back { border: 0; background: none; padding: 4px 0; color: #245e55; font: inherit; text-decoration: underline; text-underline-offset: 4px; cursor: pointer; }
  .lp-recall { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; cursor: pointer; }
  .lp-recall input { width: 17px; height: 17px; accent-color: #245e55; }
  .lp-q { padding: 16px 18px; border: 1px solid #d8d1bf; border-radius: 14px; background: #fffdf8; }
  .lp-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; font-size: 12.5px; }
  .lp-tags span { padding: 1px 8px; border-radius: 5px; background: #efe8d6; color: #6b5a3c; }
  .lp-tags span.is-part { background: #e3eee8; color: #245e55; font-weight: 700; }
  .lp-lead, .lp-scene { margin: 0 0 10px; padding: 10px 14px; border-radius: 10px; background: #f3efe3; font-size: 16px; }
  .lp-prompt { margin: 0 0 12px; font-size: 18px; font-weight: 600; line-height: 1.7; }
  .lp-opts { display: grid; gap: 8px; position: relative; }
  .lp-opts.is-veiled .lp-opt { filter: blur(6px); pointer-events: none; user-select: none; }
  .lp-unveil { justify-self: start; margin-bottom: 8px; padding: 6px 14px; border: 1px dashed #245e55; border-radius: 999px; background: #e3eee8; color: #245e55; font: inherit; font-size: 14px; cursor: pointer; }
  .lp-opt { display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 11px 14px; border: 1px solid #d8d1bf; border-radius: 11px; background: #fff; color: inherit;
    text-align: left; font: inherit; font-size: 16.5px; line-height: 1.65; cursor: pointer; transition: border-color .15s, background .15s; }
  .lp-opt:hover:not(:disabled) { border-color: #2f6f63; background: #f3f8f5; }
  .lp-opt:disabled { cursor: default; }
  .lp-opt b { flex: 0 0 auto; min-width: 1.4em; color: #a4492d; }
  .lp-opt.is-right { border-color: #2f7a4e; background: #e6f3ea; }
  .lp-opt.is-wrong { border-color: #c8452d; background: #fbe9e3; }
  .lp-judge { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .lp-judge .lp-opt { justify-content: center; font-size: 18px; font-weight: 700; }
  .lp-fb { margin-top: 12px; padding: 12px 14px; border-radius: 11px; background: #eef5f1; font-size: 15.5px; line-height: 1.8; animation: lp-in .3s ease; }
  .lp-fb.is-wrong { background: #fbefe9; }
  .lp-fb strong { display: block; font-size: 16.5px; color: #2f7a4e; }
  .lp-fb.is-wrong strong { color: #b23e27; }
  .lp-fb .lp-gain { display: inline-block; margin-left: 8px; padding: 0 9px; border-radius: 999px; background: linear-gradient(90deg, #ffe08a, #ffc94a); color: #5a3a00; font-size: 13px; font-weight: 800; }
  .lp-fb small { display: block; margin-top: 4px; color: #6b746f; font-size: 13px; }
  .lp-say { margin-top: 12px; }
  .lp-say p { margin: 0 0 6px; font-size: 14.5px; color: #4e5a54; }
  .lp-text { width: 100%; box-sizing: border-box; min-height: 90px; padding: 10px 12px; border: 1px solid #cdd7ca; border-radius: 10px; background: #fff; font: inherit; font-size: 16px; line-height: 1.75; resize: vertical; }
  .lp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 14px; }
  .lp-btn { padding: 9px 20px; border: 1px solid #245e55; border-radius: 10px; background: #245e55; color: #fff; font: inherit; font-size: 15.5px; cursor: pointer; }
  .lp-btn.is-soft { background: #fffdf8; color: #245e55; }
  .lp-btn:disabled { opacity: .45; cursor: not-allowed; }
  .lp-hint { font-size: 13px; color: #6b746f; }
  .lp-model { margin-top: 8px; padding: 10px 14px; border-left: 3px solid #d6a33a; background: #fffaf0; border-radius: 0 10px 10px 0; font-size: 15.5px; }
  .lp-done { text-align: center; padding: 20px 10px 8px; }
  .lp-done h4 { margin: 0 0 6px; font: 900 28px/1.3 "Kaiti SC", STKaiti, KaiTi, serif; color: #a4492d; letter-spacing: .12em; }
  .lp-done p { margin: 4px 0; }
  .lp-ref li b { color: #a4492d; }
  .lp-state { padding: 18px 4px; color: #5d6964; }
  @keyframes lp-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @media (max-width: 640px) {
    .lp-modal { padding: 0; place-items: stretch; }
    .lp-card { width: 100%; max-height: none; height: 100%; border-radius: 0; }
    .lp-methods { grid-template-columns: 1fr; }
    .lp-head h3 { font-size: 22px; letter-spacing: .12em; }
    .lp-body { padding: 14px 14px 22px; }
  }
  @media (prefers-reduced-motion: reduce) { .lp-fb { animation: none; } }`;

  let ctx = null;
  let modal = null;
  let body = null;
  let home = null;
  let lastFocus = null;

  function ensure() {
    if (modal) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    style.dataset.readable = 'panel';   // 字号按面板的温和倍数调整（live-readable.js）
    document.head.appendChild(style);
    modal = document.createElement('div');
    modal.className = 'lp-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', '修炼场');
    modal.innerHTML = `<div class="lp-card"><header class="lp-head"><div><small data-lp-course></small><h3>修炼场</h3></div>
      <div class="lp-today" data-lp-today></div><button type="button" class="lp-close" data-lp-close aria-label="关闭修炼场">×</button></header>
      <div class="lp-body" data-lp-body></div></div>`;
    document.body.appendChild(modal);
    body = modal.querySelector('[data-lp-body]');
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-lp-close]')) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal && !modal.hidden) close(); });
  }
  function close() {
    modal.hidden = true;
    document.documentElement.style.removeProperty('overflow');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  const isPE = () => ctx.config.course === 'political-economy';
  async function call(name, params) {
    const value = await ctx.backend.rpc(name, { p_classroom: Number(ctx.identity.classroom) || ctx.identity.classroom, ...params });
    return Array.isArray(value) ? value[0] : value;
  }
  const failText = (problem) => (/PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem))
    ? '修炼场还没有开通（老师后台尚未更新）。' : '读取失败：请检查网络后再试一次。');
  const statusText = { login: '请回到首页，用本周的课堂码重新登录后再来修炼。', closed: '这个单元还没有开放。', busy: '今天练得太多了，休息一下，明天再来。' };
  function paintToday() {
    const el = modal.querySelector('[data-lp-today]');
    if (!home) { el.innerHTML = ''; return; }
    el.innerHTML = `<b>今日 ${home.today}/${home.cap}</b>累计 ${home.total} 修为`;
  }
  function scrollTop() { body.scrollTop = 0; }

  // ---------------- 首页：今日修为、四种方法、各单元 ----------------
  async function showHome() {
    body.innerHTML = '<p class="lp-state">正在进入修炼场……</p>';
    try {
      const data = await call('ck_practice_home', {});
      if (!data || data.status !== 'ok') { body.innerHTML = `<p class="lp-state">${esc(statusText[data && data.status] || '暂时进不了修炼场。')}</p>`; return; }
      home = data;
    } catch (problem) {
      body.innerHTML = `<p class="lp-state">${esc(failText(problem))}</p>`;
      return;
    }
    paintToday();
    const units = home.units || [];
    const open = units.filter((u) => u.open);
    const due = open.reduce((sum, u) => sum + (Number(u.due) || 0), 0);
    const feynAll = open.reduce((sum, u) => sum + (Number(u.fn) || 0), 0);
    const feynLeft = feynAll - open.reduce((sum, u) => sum + (Number(u.fe) || 0), 0);
    const pe = isPE();
    const card = (mode, m, badge) => `<button type="button" class="lp-method" data-lp-mode="${mode}"${m.disabled ? ' disabled' : ''}>${badge ? `<i>${esc(badge)}</i>` : ''}
      <span>${esc(m.name)}</span><strong>${esc(m.title)}</strong><p>${esc(m.text)}</p></button>`;
    const rows = units.map((u) => {
      const pct = u.n ? Math.round(100 * u.earned / u.n) : 0;
      const status = u.open ? `攻克 ${u.earned} / ${u.n}${u.due ? `<span class="lp-due">回炉 ${u.due}</span>` : ''}`
        : u.opens ? `${dayText(u.opens)}开放` : '老师发布这次课后开放';
      return `<li><button type="button" class="lp-unit" data-lp-unit="${esc(u.unit)}"${u.open ? '' : ' disabled'}>
        <b>${esc(u.title)}</b><em>${status}</em><span class="lp-bar"><i style="width:${pct}%"></i></span></button></li>`;
    }).join('');
    body.innerHTML = `<p class="lp-note">这是《${esc(COURSE[home.course] || '')}》自己的修炼场。老师发布过的每一次课堂，对应的题都在这里，课上课后都能练，以前的课也能拿来复习。
      这里的题都是另写的新题，和课堂上的题不重复：专攻一块、混合乱炼做情境辨析和易错判断，讲给别人听另有专门的题。<b>每题第一次答对得修为：${esc(PRACTICE.text(ctx.config.course))}</b>（当天先答错的，隔天再答对也算）；${pe ? '案例页里的“课后自修”也计修为，和这里共用每日上限；' : ''}<b>每天最多 ${home.cap} 修为</b>，每题只算一次，刷题不加分。</p>
      <div class="lp-methods">
        ${card('simon', { name: '西蒙学习法', title: '专攻一块', text: '选下面一个单元，一口气攻下来：答错的题排到这一轮最后再来一遍，直到全部答对。', disabled: !open.length })}
        ${card('review', { name: '间隔重复', title: '错题回炉', text: '以前答错或当天没得到修为的题，隔天再做一遍；这次答对照样得修为。', disabled: !due }, due ? `${due} 道` : '')}
        ${card('mix', { name: '交错练习', title: '混合乱炼', text: '从已开放的单元里随机抽 12 题混着做，练的是“这道题该用哪个概念”。', disabled: !open.length })}
        ${card('feynman', { name: '费曼学习法', title: '讲给别人听', text: '专门的题：从几种大白话里挑出又通俗又没讲错的讲法，或揪出一段讲解里讲错的那一句；答完再用自己的话讲一遍，讲不顺的地方就是还没想透的地方。', disabled: !feynAll }, feynLeft ? `${feynLeft} 道` : '')}
      </div>
      <p class="lp-h" id="lp-units">专攻一块 · 选一个单元</p>
      ${units.length ? `<ul class="lp-units">${rows}</ul>` : '<p class="lp-state">题库还没有同步：请老师登录一次教师工作台。</p>'}
      ${open.length ? '' : '<p class="lp-hint">还没有开放的单元：老师发布课堂后，这一课的题就会出现在这里。</p>'}`;
    body.querySelectorAll('[data-lp-unit]').forEach((button) => button.addEventListener('click', () => {
      const u = units.find((x) => x.unit === button.dataset.lpUnit);
      startSession(u.unit, { method: '西蒙学习法', title: u.title, simon: true });
    }));
    body.querySelectorAll('[data-lp-mode]').forEach((button) => button.addEventListener('click', () => {
      const mode = button.dataset.lpMode;
      if (mode === 'simon') { body.querySelector('#lp-units').scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if (mode === 'review') startSession('review', { method: '间隔重复', title: '错题回炉' });
      else if (mode === 'mix') startSession('mix', { method: '交错练习', title: '混合乱炼' });
      else startSession('feynman', { method: '费曼学习法', title: '讲给别人听', feynman: true });
    }));
    scrollTop();
  }

  // ---------------- 做题：一题一题来 ----------------
  async function startSession(mode, meta) {
    body.innerHTML = '<p class="lp-state">正在取题……</p>';
    let data;
    try { data = await call('ck_practice_items', { p_mode: mode }); } catch (problem) { body.innerHTML = `<p class="lp-state">${esc(failText(problem))}</p>`; return; }
    if (!data || data.status !== 'ok') { body.innerHTML = `<p class="lp-state">${esc(statusText[data && data.status] || '取题失败。')}</p><button type="button" class="lp-back" data-lp-home>← 回修炼场</button>`; bindHome(); return; }
    let items = (data.items || []).filter((it) => it.kind !== 'essay');
    if (meta.simon) items = items.filter((it) => !it.earned).concat(items.filter((it) => it.earned));   // 没攻下的先做
    if (!items.length) {
      body.innerHTML = `<p class="lp-state">${mode === 'review' ? '没有需要回炉的错题，干得好！' : '这里暂时没有题。'}</p><button type="button" class="lp-back" data-lp-home>← 回修炼场</button>`;
      bindHome();
      return;
    }
    const session = { mode, meta, queue: items.slice(), total: items.length, done: 0, right: 0, points: 0, again: new Set(), wrongOnce: new Set() };
    showItem(session);
  }
  function bindHome() { body.querySelectorAll('[data-lp-home]').forEach((b) => b.addEventListener('click', showHome)); }
  const recallKey = 'classlive-practice-recall';

  function showItem(session) {
    const it = session.queue[0];
    if (!it) { showDone(session); return; }
    const b = it.body || {};
    const veil = load(recallKey, false);
    const tags = [`<span class="is-part">${esc(b.part || '')}</span>`, b.case || b.concept ? `<span>${esc(b.case || b.concept)}</span>` : '',
      session.mode !== it.unit && it.title !== (b.case || b.concept) ? `<span>${esc(it.title)}</span>` : '', session.again.has(key(it)) ? '<span>再来一遍</span>' : '',
      it.earned ? '<span>已得过修为</span>' : it.points ? `<span>+${Number(it.points)} 修为</span>` : ''].join('');
    let opts = '';
    if (it.kind === 'judge') {
      opts = `<div class="lp-judge" data-lp-opts><button type="button" class="lp-opt" data-lp-answer="true">说得对</button><button type="button" class="lp-opt" data-lp-answer="false">说得不对</button></div>`;
    } else {
      const order = (b.options || []).map((text, i) => ({ text, i }));
      opts = `<div class="lp-opts${veil ? ' is-veiled' : ''}" data-lp-opts>${veil ? '<button type="button" class="lp-unveil" data-lp-unveil>想好了，看选项</button>' : ''}${order.map((o) =>
        `<button type="button" class="lp-opt" data-lp-answer="${o.i}">${it.kind === 'transfer' ? '' : `<b>${LET(o.i)}</b>`}<span>${esc(o.text)}</span></button>`).join('')}</div>`;
    }
    body.innerHTML = `<div class="lp-top"><button type="button" class="lp-back" data-lp-home>← 修炼场</button>
        <span>${esc(session.meta.method)} · <b>${esc(session.meta.title)}</b></span><span>第 ${session.done + 1} 题 · 本轮剩 ${session.queue.length} 题</span>
        ${it.kind === 'judge' ? '' : `<label class="lp-recall" title="主动回忆：选项先遮住，心里想好答案再看"><input type="checkbox" data-lp-recall${veil ? ' checked' : ''}>先想后看</label>`}</div>
      <article class="lp-q"><div class="lp-tags">${tags}</div>
        ${b.lead ? `<p class="lp-lead">${esc(b.lead)}</p>` : ''}${b.scene ? `<p class="lp-scene">${esc(b.scene)}</p>` : ''}
        <p class="lp-prompt">${esc(it.kind === 'judge' ? `判断：${b.prompt}` : b.prompt)}</p>${opts}<div data-lp-fb></div></article>`;
    bindHome();
    const box = body.querySelector('[data-lp-opts]');
    const unveil = body.querySelector('[data-lp-unveil]');
    if (unveil) unveil.addEventListener('click', () => { box.classList.remove('is-veiled'); unveil.remove(); });
    const recall = body.querySelector('[data-lp-recall]');
    if (recall) recall.addEventListener('change', () => { save(recallKey, recall.checked); if (!box.querySelector('.lp-opt:disabled')) showItem(session); });
    box.querySelectorAll('[data-lp-answer]').forEach((button) => button.addEventListener('click', () => answer(session, it, button)));
    scrollTop();
  }
  const key = (it) => `${it.unit}:${it.item}`;

  async function answer(session, it, button) {
    const box = body.querySelector('[data-lp-opts]');
    const buttons = Array.from(box.querySelectorAll('[data-lp-answer]'));
    buttons.forEach((b) => { b.disabled = true; });
    const raw = button.dataset.lpAnswer;
    const value = it.kind === 'judge' ? raw === 'true' : Number(raw);
    let res;
    try {
      res = await call('ck_practice_answer', { p_unit: it.unit, p_item: it.item, p_answer: value });
    } catch (problem) {
      buttons.forEach((b) => { b.disabled = false; });
      body.querySelector('[data-lp-fb]').innerHTML = `<p class="lp-fb is-wrong">${esc(failText(problem))}</p>`;
      return;
    }
    if (!res || res.status !== 'ok') {
      body.querySelector('[data-lp-fb]').innerHTML = `<p class="lp-fb is-wrong">${esc(statusText[res && res.status] || '这道题暂时不能作答。')}</p>`;
      session.lastItem = session.queue.shift();
      appendNext(session);
      return;
    }
    const ok = (res.answer || []).map((v) => String(v));
    buttons.forEach((b) => {
      const mine = b === button;
      const right = ok.includes(b.dataset.lpAnswer);
      b.classList.toggle('is-right', right);
      b.classList.toggle('is-wrong', mine && !right);
    });
    session.done += 1;
    if (res.correct) session.right += 1;
    session.points += Number(res.points) || 0;
    if (home) { home.today = Number(res.today) || home.today; home.total += Number(res.points) || 0; paintToday(); }
    const why = { earned: '这题以前已经得过修为，每题只算一次。', today: '今天先答错过这题：隔天再答对才计修为（间隔重复）。', cap: `今天的修为已满 ${res.cap} 点，明天再来；答题照样能练。` }[res.reason] || '';
    const answerText = it.kind === 'transfer' ? ok.map((v) => String((it.body.options || [])[v] || '').split(' ')[0]).join(' 或 ') : ok.map((v) => LET(v)).join(' 或 ');
    const reveal = res.reveal || {};
    let html = `<div class="lp-fb${res.correct ? '' : ' is-wrong'}"><strong>${res.correct ? '答对了' : it.kind === 'judge' ? `答错了：这句话${ok[0] === 'true' ? '说得对' : '说得不对'}` : `答错了，答案是 ${esc(answerText)}`}${res.points ? `<span class="lp-gain">+${res.points} 修为</span>` : ''}</strong>
      ${esc(reveal.explain || '')}${why ? `<small>${esc(why)}</small>` : ''}</div>`;
    if (it.kind === 'transfer') {
      const draftKey = `classlive-practice-say:${ctx.config.course}:${key(it)}`;
      html += `<div class="lp-say"><p><b>说一说（费曼学习法）</b>按句式用自己的话补全一句，再对照参考：${esc(it.body.frame || '')}</p>
        <textarea class="lp-text" data-lp-say rows="3" placeholder="用自己的话说一句……">${esc(load(draftKey, ''))}</textarea>
        <div class="lp-actions"><button type="button" class="lp-btn is-soft" data-lp-model>对照参考说法</button></div><div class="lp-model" data-lp-modeltext hidden>${esc(reveal.model || '')}</div></div>`;
      body.querySelector('[data-lp-fb]').innerHTML = html;
      const say = body.querySelector('[data-lp-say]');
      say.addEventListener('input', () => save(draftKey, say.value));
      body.querySelector('[data-lp-model]').addEventListener('click', (event) => { body.querySelector('[data-lp-modeltext]').hidden = false; event.currentTarget.remove(); });
    } else {
      body.querySelector('[data-lp-fb]').innerHTML = html;
    }
    session.lastItem = session.queue.shift();
    // 西蒙学习法：这一轮答错的题排到最后再来一遍（只再来一次，免得卡住）
    if (!res.correct && session.meta.simon && !session.again.has(key(it))) { session.again.add(key(it)); session.queue.push(it); }
    if (!res.correct) session.wrongOnce.add(key(it));
    appendNext(session);
  }
  function appendNext(session) {
    const actions = document.createElement('div');
    actions.className = 'lp-actions';
    actions.innerHTML = `<button type="button" class="lp-btn" data-lp-next>${session.queue.length ? '下一题' : '看本轮成绩'}</button>`;
    const q = body.querySelector('.lp-q');
    // 费曼学习法“讲给别人听”：答完再用自己的话把这个概念讲一遍（写满 8 个字）才进入下一题，可以跳过；只存在本页，不交给后台
    if (session.meta.feynman) {
      const topic = ((session.lastItem || {}).body || {}).topic;
      const say = document.createElement('div');
      say.className = 'lp-say';
      say.innerHTML = `<p><b>轮到你讲</b>用自己的话（能打个比方更好）把${topic ? `「${esc(topic)}」` : '这道题的道理'}讲给朋友听，写满 8 个字再看下一题。</p><textarea class="lp-text" rows="2" placeholder="说白了就是……"></textarea>`;
      q.appendChild(say);
      const area = say.querySelector('textarea');
      const next = () => actions.querySelector('[data-lp-next]');
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'lp-back';
      skip.textContent = '跳过这一题';
      actions.appendChild(skip);
      skip.addEventListener('click', () => showItem(session));
      q.appendChild(actions);
      next().disabled = true;
      area.addEventListener('input', () => { next().disabled = area.value.replace(/\s/g, '').length < 8; });
      next().addEventListener('click', () => showItem(session));
      area.focus({ preventScroll: true });
      return;
    }
    q.appendChild(actions);
    const next = actions.querySelector('[data-lp-next]');
    next.addEventListener('click', () => showItem(session));
    next.focus({ preventScroll: true });
  }
  async function showDone(session) {
    const allRight = session.wrongOnce.size === 0;
    body.innerHTML = `<div class="lp-done"><h4>${session.meta.simon ? (allRight ? '这一块攻下了' : '这一轮练完了') : '本轮修炼完成'}</h4>
      <p>做了 ${session.done} 题，答对 ${session.right} 题，得 ${session.points} 修为。</p>
      ${session.wrongOnce.size ? `<p class="lp-hint">有 ${session.wrongOnce.size} 道题答错过：明天在“错题回炉”里再做一遍，答对还能得修为。</p>` : ''}
      <div class="lp-actions" style="justify-content:center"><button type="button" class="lp-btn" data-lp-again>再练一轮</button><button type="button" class="lp-btn is-soft" data-lp-home>回修炼场</button></div></div>`;
    bindHome();
    body.querySelector('[data-lp-again]').addEventListener('click', () => startSession(session.mode, session.meta));
    scrollTop();
  }

  window.ClassLivePractice = {
    open(context) {
      ctx = context;
      ensure();
      lastFocus = document.activeElement;
      modal.querySelector('[data-lp-course]').textContent = COURSE[ctx.config.course] || '';
      home = null;
      paintToday();
      modal.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      modal.querySelector('[data-lp-close]').focus();
      showHome();
    },
  };
})();
