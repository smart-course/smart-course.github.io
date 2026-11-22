/* 《金融机构与市场》学生页（课次页、案例阅读页、讲义页共用）。
 * 做法照习经、政经的经验，但只留课堂学习要用的：
 *   · 从首页用课堂码登录进来（课堂码＋点名册＋个人口令），本页核对身份、记当天签到、报在线；
 *   · 每道题下面有“递交”：选好或写好后点一下，再点一次确认，交给老师；每题只收第一次，递交后不能修改（后台同样只收第一次）；
 *     老师停止递交的题、课堂结束提交以后，不能再递交；
 *   · 左下角小面板：已递交几题、跳到下一道没递交的题；课次页最后有“本堂作业递交情况”“这堂课感觉怎么样”“匿名建议和提问箱”。
 * 没有修为、境界、法宝、宗门、云间灵田（用户 2026-11-20：“不要云间灵田和境界等级了”）。
 *   · 答题计时：老师在投屏页的一道题（或一组题）上点“开始答题”，这里那道题上出现倒计时，页面上方有一条“剩余时间 · 去作答”（fim-timer.js）。
 * 后台用的都是课程网站已有的函数（ck_checkin_today、ck_ping、ck_submit_answer、ck_my_submissions、ck_stopped_items、
 * ck_submit_feedback、ck_set_mood、ck_my_mood）；只有答题计时用本课程自己的 qt_list（后台还没有这个函数时，计时不显示，别的照常）。
 * 页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG（kind＝session-html、unit、questions、total、session）。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  if (!config || config.provider === 'off' || !window.ClassLive) return;
  const params = new URLSearchParams(location.search);
  const previewRoom = Number(params.get('preview')) || 0;
  const PREVIEW = previewRoom > 0;        // 教师工作台“打开学生版测试页”
  if (!PREVIEW && /staticrypt_pwd=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  let backend;
  try { backend = window.ClassLive.create(config); } catch (error) { console.warn('[课堂后台] 未启用：', error.message); return; }
  const Live = window.ClassLive;

  const STORE = 'classlive-student';
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (error) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* 忽略 */ } };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const unit = config.unit;
  const QUESTIONS = config.questions || [];
  const TOTAL = Number(config.total) || QUESTIONS.length;
  const HERE = location.pathname.split('/').pop() || `${unit}.html`;
  const HUB = `${unit}.html`;
  const keyed = (url) => (window.FimKey ? window.FimKey.href(url) : url);   // 同一单元的页面地址带上本单元的钥匙（fim-key.js）

  // ---------- 课堂身份（首页登录时记在本机；同 live-student.js 的规则）
  const lastIdentity = PREVIEW ? {} : load(STORE, {});
  const unitIdentity = PREVIEW ? null : load(`${STORE}:${config.course}:${unit}`, null);
  const identity = PREVIEW ? { name: '王不凡', sid: 'WBF0001', class_name: '教师测试', group_name: '', classroom: previewRoom, course: config.course, chapter: unit, code: '' }
    : (lastIdentity.course === config.course && lastIdentity.chapter === unit) || !(unitIdentity && unitIdentity.classroom) ? lastIdentity : unitIdentity;
  const viewFlag = PREVIEW ? null : load(`classlive-view:${config.course}:${unit}`, null);
  const viewing = Boolean(viewFlag && (!identity.joined_at || Number(viewFlag.at) > Number(identity.joined_at)));
  const joined = !viewing && Boolean(identity.classroom && identity.name && identity.sid && identity.course === config.course && identity.chapter === unit);
  const AUDIT = joined && !PREVIEW && Boolean(identity.audit);
  const LOCAL_ONLY = PREVIEW || AUDIT;    // 递交只在本机锁定：教师测试页、旁听
  const joinUrl = () => '/' + (identity.code ? `?join=${encodeURIComponent(identity.code)}` : '');
  const room = Number(identity.classroom) || 0;
  const who = joined ? `${config.course}:${room}:${identity.sid}` : `${config.course}:guest`;
  const LOCKED_KEY = `fim-locked:${who}`;   // 已递交的题 {题号: {v, at, far}}
  const DRAFT_KEY = `fim-draft:${who}`;     // 没递交的草稿 {题号: 值}
  const locked = load(LOCKED_KEY, {});
  const drafts = load(DRAFT_KEY, {});
  let stops = [];
  let closed = false;        // 课堂结束提交或已停止
  let relogin = false;       // 要回首页重新登录

  const stampOf = (at) => {
    const ms = Date.parse(at);
    return Number.isNaN(ms) ? '' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)).replace(/\//g, '-');
  };

  // ---------- 面板样式
  const style = document.createElement('style');
  style.textContent = `
  .fimp { position: fixed; left: 14px; bottom: 14px; z-index: 2147482000; width: 268px; border: 1px solid #d9ccb6; border-radius: 14px; background: rgba(255,253,248,.98); color: #26302d;
    box-shadow: 0 10px 28px rgba(34,56,50,.2); font: 15px/1.5 "PingFang SC","Microsoft YaHei",sans-serif; }
  .fimp * { box-sizing: border-box; }
  .fimp-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; }
  .fimp-head b { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fimp-head i { flex: 0 0 auto; padding: 0 9px; border-radius: 999px; background: #e3efec; color: #1d5d58; font-style: normal; font-size: 13px; font-weight: 700; white-space: nowrap; }
  .fimp-head i.is-all { background: #1f7a4c; color: #fff; }
  .fimp-head button { flex: 0 0 auto; width: 26px; height: 26px; border: 0; border-radius: 50%; background: #efe7d8; color: #5d6a65; font-size: 15px; line-height: 1; cursor: pointer; }
  .fimp-body { padding: 0 12px 12px; }
  .fimp.is-folded .fimp-body { display: none; }
  .fimp.is-folded { width: auto; max-width: 268px; }
  .fimp-id { margin: 0 0 8px; color: #5d6a65; font-size: 13px; }
  .fimp-bar { height: 8px; margin: 0 0 8px; border-radius: 999px; background: #eee6d8; overflow: hidden; }
  .fimp-bar span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, #1d5d58, #3a8a78); transition: width .3s ease; }
  .fimp-btn { display: block; width: 100%; min-height: 38px; margin-top: 6px; border: 0; border-radius: 9px; background: #1d5d58; color: #fff; font: 700 15px/1 inherit; cursor: pointer; }
  .fimp-btn.is-ghost { border: 1.5px solid #d9ccb6; background: #fff; color: #26302d; font-weight: 600; }
  .fimp-btn[hidden], .fimp-bar[hidden] { display: none; }
  .fimp-note { margin: 8px 0 0; padding: 7px 10px; border-radius: 8px; background: #f7e6da; color: #8a3f22; font-size: 13.5px; }
  .fimp-note a { color: #8a3f22; font-weight: 700; }
  .fimp-links { display: flex; justify-content: space-between; margin-top: 8px; font-size: 13px; }
  .fimp-links button { border: 0; background: none; color: #8a8478; font: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
  .fim-banner { position: sticky; top: 0; z-index: 2147481000; padding: 9px 16px; background: #b65b34; color: #fff; font: 700 15px/1.5 "PingFang SC","Microsoft YaHei",sans-serif; text-align: center; }
  .fim-banner a { color: #ffe9c4; }
  .fim-subm { padding: 18px 20px; border: 1px solid #e2d6c3; border-radius: 14px; background: #fffdf8; }
  .fim-subm h3 { margin: 0 0 6px; font-size: 19px; }
  .fim-subm ul { margin: 8px 0 0; padding: 0; list-style: none; }
  .fim-subm li { display: flex; gap: 10px; padding: 6px 0; border-top: 1px dashed #e2d6c3; font-size: 15px; }
  .fim-subm li a { flex: 1 1 auto; min-width: 0; color: #1d5d58; }
  .fim-subm li small { flex: 0 0 auto; color: #8a8478; white-space: nowrap; }
  .fim-mood { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .fim-mood button { display: inline-flex; align-items: center; gap: 6px; min-height: 42px; padding: 0 16px; border: 1.5px solid #e2d6c3; border-radius: 999px; background: #fff; color: #26302d; font: 600 15.5px/1 inherit; cursor: pointer; }
  .fim-mood button.is-on { border-color: #1d5d58; background: #e3efec; color: #1d5d58; }
  ${window.FimTimer ? window.FimTimer.CSS : ''}
  .fim-fb textarea { display: block; width: 100%; min-height: 96px; margin: 8px 0; padding: 10px 12px; border: 1.5px solid #e2d6c3; border-radius: 10px; background: #fff; font: inherit; resize: vertical; }
  @media (max-width: 760px) { .fimp { left: 8px; bottom: 8px; width: 232px; } .fimp.is-folded .fimp-head b { display: none; } }
  @media print { .fimp, .fim-banner { display: none !important; } }
  `;
  document.head.appendChild(style);

  // ---------- 顶部提示：没登录、只查看、教师测试、旁听
  function banner(html) {
    let bar = $('.fim-banner');
    if (!html) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'fim-banner'; document.body.insertBefore(bar, document.body.firstChild); }
    bar.innerHTML = html;
  }
  function paintBanner() {
    if (PREVIEW) banner('教师测试页：身份是“王不凡”，作答只保存在这台设备上，不交到后台。');
    else if (relogin) banner(`请回首页重新登录：本课堂要核对身份（课堂码＋点名册＋个人口令）。<a href="${joinUrl()}">回首页</a>`);
    else if (viewing) banner('你是用以前的课堂码进来的：可以查看，不能递交。');
    else if (!joined) banner(`还没有进入课堂：请回<a href="/">首页</a>用老师公布的课堂码登录，才能递交。`);
    else if (AUDIT) banner('你是旁听：可以看内容、做题，“递交”只在这台设备上锁定答案，不交给老师。');
    else if (closed) banner('本课堂已结束提交：可以查看，不能再递交。');
    else banner('');
  }

  // ---------- 题目
  const boxes = new Map();      // 题号 → {el, type, min}
  const readValue = (box) => {
    const el = box.el;
    if (box.type === 'single' || box.type === 'judge') { const on = $('input:checked', el); return on ? Number(on.value) : null; }
    if (box.type === 'multi') { const on = $$('input:checked', el).map((i) => Number(i.value)).sort((a, b) => a - b); return on.length ? on : null; }
    if (box.type === 'num') {
      // 全角数字、各种写法的负号、百分号、千分位逗号整理成规范写法（如 －９００ → -900），老师那边按数值判断
      const raw = $('.fq-num', el).value.trim();
      const tidy = raw.replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/[－−–—]/g, '-').replace(/[％%\s,，]/g, '');
      return raw ? (Number.isFinite(Number(tidy)) && tidy !== '' ? tidy : raw) : null;
    }
    const text = $('.fq-text', el).value.trim();
    return text || null;
  };
  const writeValue = (box, value) => {
    const el = box.el;
    if (value == null) return;
    if (box.type === 'single' || box.type === 'judge') $$('input', el).forEach((i) => { i.checked = Number(i.value) === Number(value); });
    else if (box.type === 'multi') $$('input', el).forEach((i) => { i.checked = Array.isArray(value) && value.map(Number).includes(Number(i.value)); });
    else if (box.type === 'num') $('.fq-num', el).value = String(value);
    else $('.fq-text', el).value = String(value);
  };
  const paintOptions = (box) => $$('.fq-opt', box.el).forEach((label) => label.classList.toggle('is-on', $('input', label).checked));
  // 能不能交：返回提示文字（空＝可以）
  const problemOf = (box, value) => {
    if (value == null) return box.type === 'text' ? '先写下你的回答' : box.type === 'num' ? '先填上数' : '先选好答案';
    if (box.type === 'num') {
      if (!Number.isFinite(Number(value))) return '请填数字（亏损填负数，如 -900）';
    }
    if (box.type === 'text' && String(value).length < box.min) return `至少写${box.min}个字（现在${String(value).length}个字）`;
    return '';
  };

  function paintBox(key) {
    const box = boxes.get(key);
    if (!box) return;
    const el = box.el;
    const foot = $('[data-fq-foot]', el);
    const done = locked[key];
    const stopped = !done && Live.isStopped(stops, key);
    el.classList.toggle('is-locked', Boolean(done));
    $$('input, textarea', el).forEach((input) => { input.disabled = Boolean(done) || !joined || viewing; });
    paintOptions(box);
    if (done) {
      foot.innerHTML = `<span class="fq-state is-ok">已递交${done.at ? ` ${esc(stampOf(done.at))}` : ''}${done.far ? '（在别的设备上递交的，这里不显示内容）' : ''}${LOCAL_ONLY ? '（只在本机）' : ''}</span>`;
      return;
    }
    if (!joined || viewing) { foot.innerHTML = '<span class="fq-state">登录本课堂以后才能作答和递交</span>'; return; }
    if (stopped) { foot.innerHTML = '<span class="fq-state is-bad">老师已停止递交这道题</span>'; return; }
    if (closed && !LOCAL_ONLY) { foot.innerHTML = '<span class="fq-state is-bad">本课堂已结束提交</span>'; return; }
    if (!$('.fq-send', foot)) {
      foot.innerHTML = `<button type="button" class="fq-send">递交</button><span class="fq-state" data-fq-state>递交后不能修改</span>${box.type === 'text' ? '<span class="fq-count" data-fq-count></span>' : ''}`;
    }
    const count = $('[data-fq-count]', foot);
    if (count) count.textContent = `${$('.fq-text', el).value.trim().length}字`;
  }

  let confirming = null;      // {key, timer}
  function resetConfirm() {
    if (!confirming) return;
    clearTimeout(confirming.timer);
    const box = boxes.get(confirming.key);
    const button = box && $('.fq-send', box.el);
    if (button) { button.classList.remove('is-confirm'); button.textContent = '递交'; }
    confirming = null;
  }
  const setState = (box, text, bad) => { const s = $('[data-fq-state]', box.el); if (s) { s.textContent = text; s.className = `fq-state${bad ? ' is-bad' : ''}`; } };

  function lock(key, value, at, far) {
    locked[key] = { v: value, at: at || new Date().toISOString(), ...(far ? { far: true } : {}) };
    save(LOCKED_KEY, locked);
    if (drafts[key] !== undefined) { delete drafts[key]; save(DRAFT_KEY, drafts); }
    paintBox(key);
    paintAll();
    document.dispatchEvent(new CustomEvent('fim:submitted', { detail: { key } }));
  }

  async function submit(key) {
    const box = boxes.get(key);
    const value = readValue(box);
    const problem = problemOf(box, value);
    if (problem) { resetConfirm(); setState(box, problem, true); return; }
    const button = $('.fq-send', box.el);
    if (!confirming || confirming.key !== key) {
      resetConfirm();
      button.classList.add('is-confirm');
      button.textContent = '确认递交？';
      setState(box, '再点一次确认；递交后不能修改', false);
      confirming = { key, timer: setTimeout(resetConfirm, 4000) };
      return;
    }
    resetConfirm();
    if (LOCAL_ONLY) { lock(key, value); return; }
    button.disabled = true;
    button.textContent = '正在递交……';
    try {
      const res = await backend.rpc('ck_submit_answer', { p_classroom: room, p_unit: unit, p_name: identity.name, p_sid: identity.sid,
        p_class: identity.class_name || '', p_group: identity.group_name || '', p_key: key, p_value: value, p_total: TOTAL });
      const row = Array.isArray(res) ? res[0] : res;
      if (row && row.accepted === false) lock(key, null, '', true);     // 别的设备已经交过这道题（每题只收第一次）
      else lock(key, value);
      if (row && Array.isArray(row.keys)) syncKeys(row.keys.map((k) => ({ key: k })));
    } catch (error) {
      button.disabled = false;
      button.textContent = '递交';
      const text = String((error && error.message) || error || '');
      if (/重新登录/.test(text)) { relogin = true; paintBanner(); setState(box, '请回首页重新登录后再递交（已写的内容留在本机）', true); }
      else if (/停止递交/.test(text)) { await loadStops(); }
      else if (/截止/.test(text)) setState(box, '已过递交截止时间', true);
      else if (Live.isClosedError(error)) { closed = true; paintBanner(); paintAll(); }
      else setState(box, '没有递交成功，请检查网络后再点一次', true);
    }
  }

  function setupBoxes() {
    $$('.fq[data-fq]').forEach((el) => {
      const key = el.dataset.fq;
      const box = { el, type: el.dataset.type, min: Number(el.dataset.min) || 0 };
      boxes.set(key, box);
      if (locked[key] && locked[key].v != null) writeValue(box, locked[key].v);
      else if (drafts[key] !== undefined) writeValue(box, drafts[key]);
      let timer = 0;
      const remember = () => {
        if (locked[key]) return;
        clearTimeout(timer);
        timer = setTimeout(() => { const v = readValue(box); if (v == null) delete drafts[key]; else drafts[key] = v; save(DRAFT_KEY, drafts); }, 300);
        paintOptions(box);
        if (confirming && confirming.key === key) resetConfirm();
        const count = $('[data-fq-count]', el);
        if (count) count.textContent = `${$('.fq-text', el).value.trim().length}字`;
        const s = $('[data-fq-state]', el);
        if (s && s.classList.contains('is-bad')) setState(box, '递交后不能修改', false);
      };
      el.addEventListener('input', remember);
      el.addEventListener('change', remember);
      el.addEventListener('click', (event) => { if (event.target.closest('.fq-send')) submit(key); });
      // 这些页面自己有键盘翻页、点击放大：在作答框里打字、点选不要触发
      ['keydown', 'keyup', 'keypress'].forEach((type) => el.addEventListener(type, (event) => event.stopPropagation()));
      paintBox(key);
    });
  }

  // ---------- 面板、课次页上的小标记和递交情况
  const doneCount = () => QUESTIONS.filter((q) => locked[q.key]).length;
  const nextOpen = () => QUESTIONS.find((q) => !locked[q.key] && !Live.isStopped(stops, q.key));
  const anchorOf = (q) => `q-${q.key.replace(/\./g, '-')}`;
  function goTo(q) {
    if (q.page !== HERE) { location.href = keyed(`${q.page}#${anchorOf(q)}`); return; }
    const el = document.getElementById(anchorOf(q));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  }

  let panel = null;
  function setupPanel() {
    if (!joined && !PREVIEW) return;
    panel = document.createElement('div');
    // 课次页默认展开，案例阅读页、讲义页默认收起（免得挡住正文）；手机上（窄屏）都默认收起；各记各的
    const FOLD_KEY = HERE === HUB ? 'fim-panel-folded' : 'fim-panel-folded-sub';
    panel.className = `fimp${load(FOLD_KEY, HERE !== HUB || window.innerWidth < 700) ? ' is-folded' : ''}`;
    panel.innerHTML = `<div class="fimp-head" data-fold><b>${esc(identity.name)}</b><i data-count></i><button type="button" aria-label="收起或展开">−</button></div>
      <div class="fimp-body"><p class="fimp-id">${esc(identity.sid)}${identity.classroom_name ? ` · ${esc(identity.classroom_name)}` : ''}</p>
      <div class="fimp-bar"><span data-bar></span></div>
      <button type="button" class="fimp-btn" data-next></button>
      ${HERE === HUB ? '' : `<button type="button" class="fimp-btn is-ghost" data-hub>回到本次课页面</button>`}
      <div data-note></div>
      <div class="fimp-links"><span>每题点“递交”，递交后不能修改</span>${PREVIEW ? '' : '<button type="button" data-leave>不是我</button>'}</div></div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', async (event) => {
      if (event.target.closest('[data-next]')) { const q = nextOpen(); if (q) goTo(q); return; }
      if (event.target.closest('[data-hub]')) { location.href = keyed(HUB); return; }
      if (event.target.closest('[data-leave]')) {
        if (!window.confirm('退出这台设备上的课堂身份？下次进入要重新输入课堂码和个人口令。')) return;
        try { localStorage.removeItem(STORE); localStorage.removeItem(`${STORE}:${config.course}:${unit}`); } catch (error) { /* 忽略 */ }
        try { if (backend.signOutStudent) await backend.signOutStudent(); } catch (error) { /* 忽略 */ }
        location.href = '/';
        return;
      }
      if (event.target.closest('[data-fold]')) { panel.classList.toggle('is-folded'); save(HERE === HUB ? 'fim-panel-folded' : 'fim-panel-folded-sub', panel.classList.contains('is-folded')); }
    });
    ['keydown', 'keyup', 'keypress', 'click'].forEach((type) => panel.addEventListener(type, (event) => event.stopPropagation()));
  }

  function paintAll() {
    const done = doneCount();
    if (panel) {
      const count = $('[data-count]', panel);
      count.textContent = TOTAL ? `已递交 ${done}/${TOTAL}` : '已登录';
      count.classList.toggle('is-all', TOTAL > 0 && done >= TOTAL);
      $('[data-bar]', panel).style.width = `${TOTAL ? Math.round(done / TOTAL * 100) : 0}%`;
      $('.fimp-bar', panel).hidden = !TOTAL;
      $('.fimp-links span', panel).textContent = TOTAL ? '每题点“递交”，递交后不能修改' : '';
      const next = nextOpen();
      const button = $('[data-next]', panel);
      button.hidden = !TOTAL;
      button.disabled = !next;
      button.textContent = next ? '下一道未递交 ↓' : '全部递交了';
      $('[data-note]', panel).innerHTML = closed && !LOCAL_ONLY ? '<p class="fimp-note">本课堂已结束提交。</p>' : relogin ? `<p class="fimp-note">请<a href="${joinUrl()}">回首页重新登录</a>。</p>` : '';
    }
    $$('[data-fq-chip]').forEach((chip) => {
      const on = Boolean(locked[chip.dataset.fqChip]);
      chip.textContent = on ? '已递交' : '未递交';
      chip.classList.toggle('is-done', on);
    });
    paintStatus();
  }

  function paintStatus() {
    const host = $('[data-fim-status]');
    if (!host || (!joined && !PREVIEW) || !TOTAL) return;
    const done = doneCount();
    const rest = QUESTIONS.filter((q) => !locked[q.key]);
    host.hidden = false;
    host.innerHTML = `<h2>本堂作业递交情况</h2><div class="fim-subm"><h3>已递交 ${done}/${TOTAL}${done >= TOTAL ? '　全部递交了' : ''}</h3>
      ${rest.length ? `<p class="fim-note" style="margin:0">还没递交的题（点一下跳过去）：</p><ul>${rest.map((q) => `<li><a href="${esc(q.page)}#${anchorOf(q)}" data-go="${esc(q.key)}">${esc(q.section)} · ${esc(q.label)}</a>${Live.isStopped(stops, q.key) ? '<small>老师已停止递交</small>' : ''}</li>`).join('')}</ul>` : ''}</div>`;
  }
  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-go]');
    if (!link) return;
    const q = QUESTIONS.find((item) => item.key === link.dataset.go);
    if (q && q.page === HERE) { event.preventDefault(); goTo(q); }
  });

  // 别的设备（或本机清过记录）递交过的题：后台有、本机没有的，标成已递交
  function syncKeys(items) {
    let changed = false;
    items.forEach((item) => {
      if (!locked[item.key] && QUESTIONS.some((q) => q.key === item.key)) {
        locked[item.key] = { v: null, at: item.ts ? new Date(Number(item.ts)).toISOString() : '', far: true };
        changed = true;
      }
    });
    if (changed) { save(LOCKED_KEY, locked); boxes.forEach((box, key) => paintBox(key)); paintAll(); }
  }
  async function loadSubmissions() {
    if (!joined || LOCAL_ONLY) return;
    try {
      const res = await backend.rpc('ck_my_submissions', { p_classroom: room });
      if (res && res.status === 'ok' && Array.isArray(res.items)) syncKeys(res.items);
    } catch (error) { /* 读不到就按本机记录显示 */ }
  }
  async function loadStops() {
    if (!joined || LOCAL_ONLY) return;
    try {
      stops = Live.stopList(await backend.rpc('ck_stopped_items', { p_classroom: room }));
      boxes.forEach((box, key) => paintBox(key));
      paintAll();
    } catch (error) { /* 后台没有这项功能时不管 */ }
  }

  // ---------- 答题计时：老师在投屏页点“开始答题”，这里那道题上出现倒计时
  const Timer = window.FimTimer || null;
  const board = Timer ? Timer.makeBoard(() => performance.now()) : null;
  const timerApi = !Timer || !room || (!joined && !PREVIEW) ? null
    : config.provider === 'mock' ? Timer.makeMockApi(Timer.browserStore()) : Timer.makeCloudApi((name, args) => backend.rpc(name, args));
  let timerOff = !timerApi;
  let clockBar = null;
  let clockTarget = null;      // 上方那一条“去作答”要去的题
  const clockSeen = {};        // 计时编号 → 上一次看到的是 run 还是 over（用来发现“刚刚到点”）
  const shortSection = (q) => String(q.section || '').split('\u3000')[0];
  const timerName = (row, covered) => (covered.length > 1 ? `${shortSection(covered[0])}（${covered.length}题）`
    : String(covered[0].label).startsWith(shortSection(covered[0])) ? covered[0].label : `${shortSection(covered[0])} · ${covered[0].label}`);

  function onTimeUp(row, covered) {
    covered.forEach((q) => {
      const box = boxes.get(q.key);
      if (box && !locked[q.key] && joined && !viewing) setState(box, row.hard ? '时间到，这道题马上停止递交' : '时间到了，请马上递交', true);
    });
    if (row.hard) { setTimeout(loadStops, 4500); setTimeout(loadStops, 9000); }
  }

  function paintClocks() {
    if (!board || timerOff) return;
    let running = null;
    let over = null;
    board.rows().forEach((row) => {
      const covered = QUESTIONS.filter((q) => board.of(q.key) === row);
      if (!covered.length) return;
      const left = board.left(row);
      const now = left > 0 ? 'run' : 'over';
      if (clockSeen[row.item] === 'run' && now === 'over') onTimeUp(row, covered);
      clockSeen[row.item] = now;
      const todo = covered.some((q) => !locked[q.key]);       // 先显示自己还有题没递交的那个计时
      if (left > 0) { if (!running || (todo && !running.todo) || (todo === running.todo && left < running.left)) running = { row, covered, left, todo }; }
      else if (left > -15 && (!over || left > over.left)) over = { row, covered, left };
    });
    boxes.forEach((box, key) => {
      const row = board.of(key);
      let el = $('.fq-clock', box.el);
      if (!row || locked[key]) { if (el) el.hidden = true; return; }
      if (!el) { el = document.createElement('span'); el.className = 'fq-clock'; $('.fq-top', box.el).appendChild(el); }
      const left = board.left(row);
      const text = left > 0 ? `剩余 ${Timer.clock(left)}` : '时间到';
      if (el.textContent !== text) el.textContent = text;
      el.hidden = false;
      el.classList.toggle('is-hot', left > 0 && left <= 10);
      el.classList.toggle('is-over', left <= 0);
    });
    // 页面上方的一条：还在计时的里面最先到点的；没有，就是刚到点（15秒内）的
    const main = running || over;
    if (!main) { if (clockBar) clockBar.hidden = true; return; }
    if (!clockBar) {
      clockBar = document.createElement('div');
      clockBar.className = 'fim-clockbar';
      clockBar.innerHTML = '<span data-n></span><b data-t></b><small data-s></small><button type="button" data-go>去作答</button>';
      document.body.appendChild(clockBar);
      Timer.place(clockBar);
      clockBar.addEventListener('click', (event) => { if (event.target.closest('[data-go]') && clockTarget) goTo(clockTarget); });
      ['keydown', 'keyup', 'keypress', 'click'].forEach((type) => clockBar.addEventListener(type, (event) => event.stopPropagation()));
    }
    const open = main.covered.filter((q) => !locked[q.key] && !Live.isStopped(stops, q.key));
    clockTarget = main.left > 0 ? (open[0] || null) : null;
    const set = (selector, text) => { const el = $(selector, clockBar); if (el.textContent !== text) el.textContent = text; };
    set('[data-n]', timerName(main.row, main.covered));
    set('[data-t]', main.left > 0 ? Timer.clock(main.left) : '时间到');
    set('[data-s]', main.left <= 0 ? (main.row.hard ? '已停止递交' : '') : open.length ? (main.covered.length > 1 ? `还有${open.length}题没递交` : '') : '已递交');
    $('[data-go]', clockBar).hidden = !clockTarget;
    clockBar.classList.toggle('is-hot', main.left > 0 && main.left <= 10);
    clockBar.classList.toggle('is-over', main.left <= 0);
    clockBar.hidden = false;
  }

  async function loadTimers() {
    if (timerOff || document.visibilityState !== 'visible') return;
    try { board.load(await timerApi.list(room)); paintClocks(); }
    catch (error) { if (Timer.missing(error)) timerOff = true; }      // 后台还没有答题计时：不显示，别的照常
  }
  function setupTimers() {
    if (timerOff) return;
    loadTimers();
    setInterval(loadTimers, 4000);
    setInterval(paintClocks, 250);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadTimers(); });
    window.addEventListener('storage', (event) => { if (event.key === 'classlive-mock:qt_timers') loadTimers(); });   // 本机预览：老师那一页一点，这里马上跟上
  }

  // ---------- 签到、在线
  async function checkin() {
    if (!joined || PREVIEW) return;
    try {
      const res = await backend.rpc('ck_checkin_today', { p_classroom: room, p_sid: identity.sid });
      const status = Array.isArray(res) ? res[0] : res;
      if (status === 'login') { relogin = true; }
      else if (status === 'past') { closed = true; }
      paintBanner();
      boxes.forEach((box, key) => paintBox(key));
      paintAll();
    } catch (error) { /* 网络不通时照常显示，递交时再提示 */ }
  }
  let pingOff = false;
  async function ping() {
    if (!joined || PREVIEW || AUDIT || pingOff || document.visibilityState !== 'visible') return;
    try { await backend.rpc('ck_ping', { p_classroom: room }); } catch (error) { if (/未知的后台函数|does not exist|PGRST202/.test(String(error && error.message))) pingOff = true; }
  }

  // ---------- 这堂课感觉怎么样、匿名建议和提问箱（只在课次页）
  function setupFeedback() {
    const host = $('[data-fim-feedback]');
    if (!host || !joined || LOCAL_ONLY) return;
    host.hidden = false;
    host.innerHTML = `<h2>课后说两句</h2>
      <div class="fim-card"><h3>这堂课感觉怎么样</h3><div class="fim-mood" data-mood><button type="button" data-mood-v="1">😊 有收获</button><button type="button" data-mood-v="-1">😕 没跟上</button><span class="fq-state" data-mood-state>每天可以选一次，能改。</span></div></div>
      <div class="fim-card fim-fb"><h3>匿名建议和提问箱</h3><p class="fim-note" style="margin:0">哪里没听懂、想问老师什么、对课堂和网页有什么建议，写下来。完全匿名：后台不记姓名和学号，老师只看到内容和日期。</p>
      <textarea maxlength="500" placeholder="写在这里（2到500字）" data-fb-text></textarea><button type="button" class="fim-btn" data-fb-send>匿名提交</button> <span class="fq-state" data-fb-state></span></div>`;
    ['keydown', 'keyup', 'keypress'].forEach((type) => host.addEventListener(type, (event) => event.stopPropagation()));
    const moodState = $('[data-mood-state]', host);
    const paintMood = (mood) => $$('[data-mood-v]', host).forEach((b) => b.classList.toggle('is-on', Number(b.dataset.moodV) === Number(mood)));
    backend.rpc('ck_my_mood', { p_classroom: room }).then((mood) => paintMood(Number(mood) || 0)).catch(() => { /* 没有这项功能时不显示选中 */ });
    host.addEventListener('click', async (event) => {
      const moodButton = event.target.closest('[data-mood-v]');
      if (moodButton) {
        const want = moodButton.classList.contains('is-on') ? 0 : Number(moodButton.dataset.moodV);
        try {
          const res = await backend.rpc('ck_set_mood', { p_classroom: room, p_mood: want });
          const status = res && res.status;
          if (status === 'closed') moodState.textContent = '课堂已停止，不能再选了。';
          else if (status === 'login') moodState.textContent = '请回首页重新登录。';
          else { paintMood(want); moodState.textContent = want ? '已记下，谢谢。' : '已撤回。'; }
        } catch (error) { moodState.textContent = '没有记上，请稍后再试。'; }
        return;
      }
      if (event.target.closest('[data-fb-send]')) {
        const area = $('[data-fb-text]', host);
        const state = $('[data-fb-state]', host);
        const text = area.value.trim();
        if (text.length < 2) { state.textContent = '至少写2个字。'; state.className = 'fq-state is-bad'; return; }
        try {
          await backend.rpc('ck_submit_feedback', { p_classroom: room, p_case: String(config.session || '01').padStart(2, '0'), p_text: text });
          area.value = '';
          state.textContent = '已匿名提交，谢谢。可以再写一条。';
          state.className = 'fq-state is-ok';
        } catch (error) {
          state.textContent = /重新登录|进入课堂/.test(String(error && error.message)) ? '请回首页重新登录后再提交。' : '没有提交成功，请稍后再试。';
          state.className = 'fq-state is-bad';
        }
      }
    });
  }

  // ---------- 启动
  function start() {
    setupBoxes();
    setupPanel();
    paintBanner();
    paintAll();
    setupFeedback();
    checkin().then(() => { loadSubmissions(); loadStops(); });
    setupTimers();
    if (joined && !PREVIEW) {
      ping();
      setInterval(ping, 45000);
      setInterval(loadStops, 30000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ping(); loadStops(); loadSubmissions(); } });
    }
    // 从别的页面带着 #q-题号 过来：滚到那道题
    if (location.hash.startsWith('#q-')) {
      const q = QUESTIONS.find((item) => `#${anchorOf(item)}` === location.hash);
      if (q) setTimeout(() => goTo(q), 400);
    }
  }
  window.FimStudent = { identity: () => ({ joined, viewing, preview: PREVIEW, audit: AUDIT, name: identity.name, sid: identity.sid, classroom: room }), backend, locked: () => ({ ...locked }) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
