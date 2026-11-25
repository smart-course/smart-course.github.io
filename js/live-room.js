/* 投屏页右下角的“课堂”悬浮控件：与教师工作台的“结束提交 / 重新开放提交”“停止课堂”功能相同，上课时不必切回工作台。
 * 平时半透明，鼠标移上去才完全显示；可收起成一个小按钮。只有当前课堂就是本页章节（案例）时才显示操作按钮。
 * 需要教师已在同一浏览器登录教师工作台（操作需教师账号）。页面需先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 * “复原”（2026-10-22 用户：“只是把所有题目复原为未核对的状态，不改变已发弹幕等内容”）：章节页的题目脚本各自登记了复原函数
 *   （window.ClassPageResets），点一下就地把题目恢复到未作答、未核对，不刷新页面——弹幕、弹幕墙、计时、积分、猜词／猜谜／PK、
 *   页面位置都保持原样；学生递交的数据在云端，不受影响（不需要登录）。页面没有登记复原函数时，才按原来的办法清本机记录后重新打开。
 */
(function () {
  'use strict';
  const config = window.CLASS_LIVE_CONFIG;
  if (!config || config.provider === 'off' || !window.ClassLive) return;
  let backend;
  try { backend = window.ClassLive.create(config); } catch (error) { return; }

  const unit = config.unit || (location.pathname.match(/([a-z]{2,6}\d{2})\.html$/) || [])[1];
  const HERE = config.kind === 'concept-html' ? '本案例' : '本章';
  const ROOM_MS = 15000;
  const MIN_KEY = 'classlive-room-bar-min';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const style = document.createElement('style');
  style.dataset.readable = 'panel';   // 控件条宽度有限：字号按温和倍数调整（live-readable.js）
  style.textContent = `
  /* 2026-11-22（用户“都做吧”：投屏页两块控制条不再压住正文）：课堂条和弹幕条（live-danmaku.js）一个样子，都放在左下角页码右边，
     弹幕条在下、课堂条在上；鼠标离开几秒后都收成只剩状态的小条（html.cl-dock-idle），鼠标移到左下角或停在条上再展开 */
  .rm-bar { position: fixed; z-index: 301; left: var(--dock-left, 84px); bottom: 69px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
    max-width: min(640px, calc(100vw - var(--dock-left, 84px) - 24px)); padding: 6px 10px; border: 1px solid rgba(255,255,255,.12); border-radius: 12px;
    background: rgba(30, 26, 22, .9); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); box-shadow: 0 10px 26px rgba(0,0,0,.24);
    color: #fff; font: 700 13px/1.3 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; transition: opacity .2s ease, padding .2s ease; }
  .rm-bar button { padding: 4px 11px; border: 1px solid rgba(255,255,255,.26); border-radius: 999px; color: #fff; background: rgba(255,255,255,.06); font: inherit; cursor: pointer;
    transition: background .15s ease, border-color .15s ease; }
  .rm-bar button:hover { border-color: rgba(255,255,255,.5); background: rgba(255,255,255,.16); }
  .rm-bar button[aria-pressed="false"] { color: rgba(255,255,255,.7); }
  .rm-bar button.is-warn { border-color: #f0b49e; color: #ffd2c2; }
  .rm-bar button[disabled] { opacity: .5; cursor: default; }
  /* “登录教师工作台”等链接（2026-11-23 晚）：不画下划线，做成金色小胶囊 */
  .rm-bar a { display: inline-block; padding: 1px 10px; border: 1px solid rgba(255,217,138,.45); border-radius: 999px; background: rgba(255,217,138,.12); color: #ffd98a; text-decoration: none; }
  .rm-bar a:hover { background: rgba(255,217,138,.24); border-color: rgba(255,217,138,.75); }
  .rm-bar b { color: #ffd98a; letter-spacing: .06em; }
  .rm-bar .rm-open::before { content: ""; display: inline-block; width: 8px; height: 8px; margin: 0 5px 1px 0; border-radius: 50%; background: #f0b49e; vertical-align: middle; }
  .rm-bar .rm-open.is-on::before { background: #7fd3a3; box-shadow: 0 0 0 3px rgba(127,211,163,.22); }
  .rm-bar [data-rm-min], .dm-bar [data-dm-toggle] { display: none; }   /* 不用再单独收起：鼠标离开几秒后自动收成小条 */
  /* 收起时（2026-11-22 晚 用户：“这两个还是按照之前的，缩小后就两个字的大小。然后放到左边的页码上面。”）：只剩“课堂”“弹幕”两个字，
     叠在左下角页码的上面；鼠标移过去再展开成完整的控件条 */
  html.cl-dock-idle .rm-bar > :not([data-rm-state]), html.cl-dock-idle .rm-bar .rm-rest { display: none; }
  html.cl-dock-idle .dm-bar > :not(label), html.cl-dock-idle .dm-bar label select { display: none; }
  html.cl-dock-idle .rm-bar, html.cl-dock-idle .dm-bar { padding: 5px 10px; border-radius: 9px; font-size: 14px; line-height: 1.3; opacity: .88; box-shadow: 0 4px 12px rgba(0,0,0,.18); cursor: pointer; }
  html.cl-has-dock body { padding-bottom: 72px; }
  /* “操作提示：关”（html.cl-hide-ops，本机记住）：投屏页上只写给老师看的操作说明先藏起来——步骤条的说明、课时步骤表下的提示、
     活动的组织提示、“开始”控制条下的说明、辩论流程的提示 */
  html.cl-hide-ops .ix-step-howto, html.cl-hide-ops .ix-step-more, html.cl-hide-ops .plan-hint, html.cl-hide-ops .interaction-note,
  html.cl-hide-ops .mech-quest.is-teacher > .mech-dm-head, html.cl-hide-ops .mechanism-lab > .mechanism-task,
  html.cl-hide-ops .gate-note, html.cl-hide-ops .dbf-tip, html.cl-hide-ops .dbf-now small { display: none !important; }
  /* 步骤条（习经）：每条说明先只显示一行，点“展开”看全文 */
  .ix-step-howto li { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden; }
  .ix-step.is-howto-open .ix-step-howto li { display: block; -webkit-line-clamp: unset; overflow: visible; }
  .ix-step-more { margin: 6px 0 0; padding: 2px 12px; border: 1px solid rgba(35,101,95,.3); border-radius: 999px; background: #fffdf8; color: #23655f;
    font: 700 13px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
  .ix-step-more:hover { background: #eef5f2; }
  .ix-step-more[hidden] { display: none; }
  /* 右侧目录：投屏时字大一些，当前一节加底色 */
  .section-rail .rail-link { font-size: 13px; }
  .section-rail .rail-link.active { padding: 1px 4px 1px 8px; border-radius: 6px; background: rgba(164,73,45,.1); color: #8d3a20; font-weight: 800; }
  body > .rail a { font-size: 13px; }
  body > .rail a.active { border-radius: 6px; background: rgba(164,73,45,.1); }
  @media (min-width: 1600px) {
    .section-rail { width: 150px; }
    .section-rail .rail-link { font-size: 14.5px; }
    body > .rail a { font-size: 14.5px; }
  }
  .rm-font { position: absolute; right: 0; bottom: calc(100% + 8px); display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 8px;
    background: rgba(32, 28, 24, .92); box-shadow: 0 8px 24px rgba(0,0,0,.3); white-space: nowrap; }
  .rm-font[hidden] { display: none; }
  .rm-bar .rm-font button { min-width: 48px; padding: 5px 10px; }
  .rm-bar .rm-font button.is-on { border-color: #ffd98a; color: #2b2118; background: #ffd98a; }
  @media print { .rm-bar { display: none !important; } }
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 'rm-bar';
  bar.setAttribute('data-ix', '');
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', '课堂控制');
  bar.innerHTML = '<span data-rm-state><span class="rm-k">课堂</span><span class="rm-rest">：连接中……</span></span>'
    + '<button type="button" data-rm-open hidden>结束提交</button>'
    + '<button type="button" class="is-warn" data-rm-stop hidden>停止课堂</button>'
    + '<button type="button" data-rm-reset title="把本页题目恢复到未作答、未核对的状态（弹幕、计时、积分等不变）">复原</button>'
    + (window.ClassReadable ? '<button type="button" data-rm-font aria-haspopup="true" aria-expanded="false" title="调整投屏字号（标准、大、特大），本机记住">字号</button>'
      + `<div class="rm-font" data-rm-font-pop role="group" aria-label="投屏字号" hidden><span>投屏字号</span>${window.ClassReadable.LEVELS.map((name, i) => `<button type="button" data-font="${i}">${esc(name)}</button>`).join('')}</div>` : '')
    + '<button type="button" data-rm-ops aria-pressed="true" title="投屏页上只写给老师看的操作说明（步骤条的说明、活动的组织提示等）：开＝显示，关＝先藏起来；这台电脑记住">操作提示：开</button>'
    + '<button type="button" data-rm-min title="收起 / 展开课堂控件">课堂</button>';
  ['click', 'keydown', 'keyup'].forEach((type) => bar.addEventListener(type, (event) => event.stopPropagation()));
  document.body.appendChild(bar);
  const stateEl = bar.querySelector('[data-rm-state]');
  const openButton = bar.querySelector('[data-rm-open]');
  const stopButton = bar.querySelector('[data-rm-stop]');
  const minButton = bar.querySelector('[data-rm-min]');
  const resetButton = bar.querySelector('[data-rm-reset]');
  // 投屏字号：三档（live-readable.js 改写页面字号），选择存在这台电脑上，与学生页分开
  const fontButton = bar.querySelector('[data-rm-font]');
  const fontPop = bar.querySelector('[data-rm-font-pop]');
  if (fontButton && fontPop) {
    const R = window.ClassReadable;
    const paintFont = () => fontPop.querySelectorAll('[data-font]').forEach((button) => {
      const on = Number(button.dataset.font) === R.level();
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', String(on));
    });
    const showFont = (open) => { fontPop.hidden = !open; fontButton.setAttribute('aria-expanded', String(open)); };
    paintFont();
    R.onChange(paintFont);
    fontButton.addEventListener('click', () => showFont(fontPop.hidden));
    fontPop.addEventListener('click', (event) => {
      const button = event.target.closest('[data-font]');
      if (!button) return;
      R.set(Number(button.dataset.font));
      paintFont();
    });
    document.addEventListener('click', (event) => { if (!fontPop.hidden && !bar.contains(event.target)) showFont(false); });
  }
  const setMin = (value) => {
    bar.classList.toggle('is-min', value);
    minButton.textContent = value ? '课堂' : '收起';
    try { localStorage.setItem(MIN_KEY, value ? '1' : ''); } catch (error) { /* 忽略 */ }
  };
  minButton.addEventListener('click', () => setMin(!bar.classList.contains('is-min')));
  setMin(false);   // 2026-11-22 起不再单独收起：鼠标离开几秒后两条控件自动收成小条（见下面的 dock）

  // 2026-11-22：两条控件放在左下角——从页码（左下角的小部件）右边起，弹幕条在下、课堂条在上；
  // 右下角的面板（课堂工具）不用再给控件条让位（--rm-clear 设为 0）；试用特效面板放在两条控件上方（--dock-top）
  const html = document.documentElement;
  html.classList.add('cl-has-dock');
  const dmBar = () => document.querySelector('.dm-bar');
  // 左下角的小部件（页码）：两条控件叠在它上面、和它左对齐（2026-11-22 晚 用户：“放到左边的页码上面”）；没有页码（如全屏看题时）贴左下角
  const dockAnchor = () => {
    let found = null;
    Array.from(document.body.children).forEach((el) => {
      if (el === bar || el.classList.contains('dm-bar') || el.classList.contains('dm-demo')) return;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.width > 160 || rect.left > 140 || rect.top < innerHeight - 160) return;
      if (!found || rect.top < found.top) found = rect;
    });
    return found ? { left: Math.max(8, Math.round(found.left)), bottom: Math.ceil(innerHeight - found.top) + 8 } : { left: 18, bottom: 22 };
  };
  const dodge = () => {
    const at = dockAnchor();
    html.style.setProperty('--dock-left', `${at.left}px`);
    const dm = dmBar();
    if (dm) {
      dm.style.bottom = `${at.bottom}px`;
      dm.style.left = '';        // live-danmaku.js 先运行时把弹幕条放在了页码右边：清掉，跟着 --dock-left
      dm.style.maxWidth = '';
    }
    const dmH = dm && dm.getClientRects().length ? Math.ceil(dm.getBoundingClientRect().height) : 0;
    bar.style.bottom = `${at.bottom + (dmH ? dmH + 8 : 0)}px`;
    const top = bar.getClientRects().length ? Math.ceil(innerHeight - bar.getBoundingClientRect().top) : 22 + dmH;
    html.style.setProperty('--dock-top', `${top + 10}px`);
    html.style.setProperty('--rm-clear', '0px');
  };
  // 投屏字号变了、窗口大小变了、两条控件的大小变了：重新排
  if (window.ClassReadable && window.ClassReadable.onChange) window.ClassReadable.onChange(() => setTimeout(dodge, 60));
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => dodge());
    ro.observe(bar);
    if (dmBar()) ro.observe(dmBar());
  }
  addEventListener('resize', () => setTimeout(dodge, 60));
  // 鼠标离开几秒后两条都收成只剩状态的小条；鼠标移到左下角、停在条上、用键盘移到条上时展开。正在调字号、开着试用特效时不收
  const IDLE_MS = 2600;
  let idleTimer = 0;
  const busy = () => [bar, dmBar()].some((el) => el && el.matches(':hover, :focus-within'))
    || Boolean(fontPop && !fontPop.hidden) || Boolean(document.querySelector('.dm-demo:not([hidden])'));
  const sleep = () => {
    if (busy()) { idleTimer = setTimeout(sleep, 1200); return; }
    html.classList.add('cl-dock-idle');
    dodge();
  };
  const wake = () => {
    clearTimeout(idleTimer);
    if (html.classList.contains('cl-dock-idle')) { html.classList.remove('cl-dock-idle'); dodge(); }
    idleTimer = setTimeout(sleep, IDLE_MS);
  };
  document.addEventListener('pointermove', (event) => {
    const rects = [bar, dmBar()].filter(Boolean).map((el) => el.getBoundingClientRect()).filter((r) => r.width);
    if (!rects.length) return;
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    if (event.clientY >= top - 60 && event.clientX <= right + 60) wake();
  }, { passive: true });
  ['pointerover', 'pointerdown', 'focusin'].forEach((type) => document.addEventListener(type, (event) => {
    if (event.target && event.target.closest && event.target.closest('.rm-bar, .dm-bar, .dm-demo')) wake();
  }, { passive: true }));
  wake();   // 打开页面时先展开几秒，让老师看到控件在哪

  // “操作提示”开关（2026-11-22）：关掉时投屏页上只写给老师看的操作说明先藏起来（样式见上），这台电脑记住
  const OPS_KEY = 'classlive-hide-ops';
  const opsButton = bar.querySelector('[data-rm-ops]');
  const setOps = (show) => {
    html.classList.toggle('cl-hide-ops', !show);
    opsButton.setAttribute('aria-pressed', String(show));
    opsButton.textContent = show ? '操作提示：开' : '操作提示：关';
    try { localStorage.setItem(OPS_KEY, show ? '' : '1'); } catch (error) { /* 忽略 */ }
  };
  let opsHidden = false;
  try { opsHidden = Boolean(localStorage.getItem(OPS_KEY)); } catch (error) { /* 忽略 */ }
  setOps(!opsHidden);
  opsButton.addEventListener('click', () => setOps(html.classList.contains('cl-hide-ops')));

  // 步骤条（习经）：每条说明先只显示一行（样式见上）；有说明被截断的步骤，在说明下面加一个“展开说明”
  let stepTimer = 0;
  const stepMore = () => document.querySelectorAll('.ix-step').forEach((step) => {
    const list = step.querySelector('.ix-step-howto');
    if (!list) return;
    const open = step.classList.contains('is-howto-open');
    const cut = open || Array.from(list.children).some((li) => li.scrollHeight > li.clientHeight + 2);
    let more = step.querySelector('.ix-step-more');
    if (!more && cut) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'ix-step-more';
      more.setAttribute('data-ix', '');
      list.insertAdjacentElement('afterend', more);
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        step.classList.toggle('is-howto-open');
        stepMore();
      });
    }
    if (!more) return;
    more.hidden = !cut;
    more.textContent = open ? '收起说明 ▴' : '展开说明 ▾';
    more.setAttribute('aria-expanded', String(open));
  });
  const stepLater = (ms) => { clearTimeout(stepTimer); stepTimer = setTimeout(stepMore, ms); };
  stepLater(300);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => stepLater(100));
  addEventListener('resize', () => stepLater(200));
  if (window.ClassReadable && window.ClassReadable.onChange) window.ClassReadable.onChange(() => stepLater(150));

  // 本页（讲解版）保存答题状态的键：政治经济学按案例编号和版本，习近平经济思想按页面路径；不碰登录、弹幕设置和导入的学生文件
  const pageKeys = () => {
    const page = document.body.dataset;
    const prefixes = [`case-selfcheck:${location.pathname}:`];
    if (page.sourceId) {
      prefixes.push(`political-economy-concept-${page.sourceId}-${page.mode || 'lecture'}-`,
        `political-economy-case-${page.sourceId}-`, `political-economy-activities-${page.sourceId}-`);
    }
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
      }
    } catch (error) { /* 浏览器禁止存储时没有可清的记录 */ }
    return keys;
  };
  resetButton.addEventListener('click', () => {
    const resets = window.ClassPageResets || [];
    if (resets.length) {
      if (!window.confirm('把本页所有题目恢复到未作答、未核对的状态？\n弹幕、计时、积分和学生递交的数据都不受影响。')) return;
      resets.forEach((fn) => { try { fn(); } catch (error) { console.warn('[复原]', error); } });
      resetButton.textContent = '已复原';
      setTimeout(() => { resetButton.textContent = '复原'; }, 2000);
      return;
    }
    if (!window.confirm('把本页恢复到初始状态？本页的选择、填写和核对结果都会清空（只清这台电脑上的记录，学生递交的数据不受影响）。')) return;
    pageKeys().forEach((key) => { try { localStorage.removeItem(key); } catch (error) { /* 忽略 */ } });
    try { history.scrollRestoration = 'manual'; } catch (error) { /* 忽略 */ }
    location.replace(location.pathname + location.search);
  });

  let room = null;
  // rest：“课堂”两个字后面的说明（收起时只显示“课堂”）
  const show = (rest, current) => {
    stateEl.innerHTML = `<span class="rm-k">课堂</span><span class="rm-rest">${rest}</span>`;
    openButton.hidden = !current;
    stopButton.hidden = !current;
    if (current) openButton.textContent = room.submissions_open ? '结束提交' : '重新开放提交';
  };
  let shownCase = 0;   // 投屏页正在只显示的案例（0＝全部）
  async function load() {
    try {
      const rooms = await backend.fetchAll('classrooms', { course: config.course });
      room = window.ClassLive.pickRoom(rooms, config.course, unit);
      if (!room) show('：当前没有开放的课堂（在工作台发布）', false);
      else if (room.chapter !== unit) show(`：当前课堂“${esc(room.name)}”不是${HERE}`, false);
      else show(`：${esc(room.name)} <b>${esc(room.code)}</b>${room.case_no ? ` · 案例 ${String(room.case_no).padStart(2, '0')}` : ''}`
        + ` · <span class="rm-open${room.submissions_open ? ' is-on' : ''}">${room.submissions_open ? '学生可递交' : '已结束提交'}</span>`, true);
      // 一章两个案例分开上（2026-10-23，习经）：当前课堂只上其中一个时，投屏页也只显示这个案例；没有当前课堂或整章上时全部显示
      // 课堂工具（猜词游戏得分榜）按“班级＋课堂”分开记（2026-10-28 用户：“猜词游戏的排行榜只限于本班级本堂课”）
      window.ClassLiveScope = room && room.chapter === unit ? { room: String(room.id), klass: String(room.class_id || 0) } : null;
      const only = room && room.chapter === unit ? Number(room.case_no) || 0 : 0;
      if (window.ChapterCases && only !== shownCase) { shownCase = only; window.ChapterCases.show(only); stepLater(120); }
    } catch (error) {
      room = null;
      show('：请先<a href="/teacher/" target="_blank" rel="noopener">登录教师工作台</a>', false);
    }
    dodge();
  }
  // 给页面上的课堂工具（如习经第二章“猜词游戏”）抽人用：本页当前课堂里今天已登录的学生，带点名册编号（点名册第几行）。
  // 同一课堂分几次课上时只抽今天到课的；今天还没有人登录时，退回本课堂全部登录过的学生。需要教师已登录（读加入记录和点名册）。
  const sidKey = (sid) => String(sid == null ? '' : sid).replace(/\s+/g, '').toUpperCase();
  window.ClassLiveStudents = async () => {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const current = window.ClassLive.pickRoom(rooms, config.course, unit);
    if (!current || current.chapter !== unit) return { students: [], today: false };
    let [checkins, classes] = await Promise.all([
      backend.fetchAll('checkins', { course: config.course, classroom: Number(current.id) }),
      backend.fetchAll('classes', { course: config.course }).catch(() => []),
    ]);
    const klass = classes.find((item) => String(item.id) === String(current.class_id));
    const numberOf = new Map(((klass && klass.roster) || []).map((person, index) => [sidKey(person.sid), index + 1]));
    const day = window.ClassLive.today();
    checkins = checkins.filter((doc) => !doc.auditor);   // 旁听同学（2026-11-05）不参加课堂小游戏，抽人时不算
    const todays = checkins.filter((doc) => (doc.session || '') === day);
    const people = new Map();
    (todays.length ? todays : checkins).forEach((doc) => people.set(sidKey(doc.sid), { sid: doc.sid, name: doc.name, no: numberOf.get(sidKey(doc.sid)) || null }));
    return { students: Array.from(people.values()).sort((a, b) => (a.no || 9999) - (b.no || 9999)), today: Boolean(todays.length) };
  };

  // 猜词游戏抽人记录（投屏页“课堂工具”抽人时调用）：本班以前各次课被抽过的同学按班级记在后台，换章节、换电脑都在；
  // 只有教师能读写。后台还没有 ck_draws（未执行 SQL）时由调用方退回只记在本机
  window.ClassLiveDraws = {
    async history() {
      const current = await roomHere();
      if (!current.class_id) return [];
      return (await backend.fetchAll('draws', { class_id: Number(current.class_id) || current.class_id })).filter((row) => (row.kind || 'wordgame') === 'wordgame');
    },
    async record(people) {
      const current = await roomHere();
      return backend.rpc('ck_record_draws', { p_classroom: Number(current.id), p_people: people.map((person) => ({ sid: person.sid, name: person.name })) });
    },
    async clear() {
      const current = await roomHere();
      if (current.class_id) await backend.removeAll('draws', { class_id: Number(current.class_id) || current.class_id });
    },
  };

  // 猜词游戏加修为（投屏页“课堂工具”的得分榜调用）：本课堂今天得分第一的同学每人加 WORDGAME.points 修为，
  // 再次发放整份替换（改给新的第一名），空名单＝撤销；老师在工作台结算修为时计入
  const roomHere = async () => {
    const rooms = await backend.fetchAll('classrooms', { course: config.course });
    const current = window.ClassLive.pickRoom(rooms, config.course, unit);
    if (!current || current.chapter !== unit) throw new Error(`${HERE}不是当前课堂，不能加修为`);
    return current;
  };
  window.ClassLiveAward = {
    points: (window.ClassLive.WORDGAME || {}).points || 10,
    async current() {
      const current = await roomHere();
      const day = window.ClassLive.today();
      return (await backend.fetchAll('bonus', { classroom: Number(current.id), kind: 'wordgame' })).filter((row) => String(row.day).slice(0, 10) === day);
    },
    async setWinners(people) {
      const current = await roomHere();
      return backend.rpc('ck_set_wordgame_winners', { p_classroom: Number(current.id), p_people: people.map((person) => ({ sid: person.sid, name: person.name })), p_points: this.points });
    },
  };

  // PK 对决（替换部分案例的圆桌会议，见 #政治经济学/PK游戏/pk_games.js）：结束后给今天各局的胜者每人加修为，再点一次按最新名单整份替换
  window.ClassLivePK = {
    points: (window.ClassLive.PK || {}).points || 5,
    async setWinners(people) {
      const current = await roomHere();
      return backend.rpc('ck_set_pk_winners', { p_classroom: Number(current.id), p_people: people.map((person) => ({ sid: person.sid, name: person.name })), p_points: this.points });
    },
  };

  // 时间轴排排站·全班分队（2026-11-11，见 #政治经济学/PK游戏/pk_games.js 的 teamTimeline）：分组、出题、揭晓、结束、报到都经本页当前课堂（ck_tl_*）
  window.ClassLiveTimeline = {
    async call(name, params) {
      const current = await roomHere();
      return backend.rpc(name, { p_classroom: Number(current.id) || current.id, ...params });   // 后台都返回 JSON 对象，原样交回
    },
  };

  // 经营沙盘（习经案例 08，见 #政治经济学/经营沙盘/biz_sim.js）：投屏页经营台读角色组看板、推进经营会、结算发修为，都经本页当前课堂
  window.ClassLiveBiz = {
    points: window.ClassLive.BIZ || { rep: 10, top: 5 },
    async call(name, params) {
      const current = await roomHere();
      return backend.rpc(name, { p_classroom: Number(current.id) || current.id, ...params });   // 后台都返回 JSON 对象或数组，原样交回
    },
    hide(id) { return backend.rpc('ck_debate_hide', { p_post: Number(id) || id, p_hidden: true }); },
    // 2026-11-21 角色组聊天室显示加入的人（用户：“教师版聊天室的样子跟学生版的一样吧，也能显示加入的人。”）：
    // 成员名单读 ck_debate_members（聊天室的房间号＝案例号＋b）、在线状态读 ck_presence，隔几秒读一次；count＝看板上四个组的人数之和，对不上就马上重读
    trackers: {},
    async people(caseNo, count) {
      const current = await roomHere();
      const key = String(caseNo);
      const tracker = this.trackers[key] || (this.trackers[key] = window.ClassLive.chatRoom.tracker(backend));
      return tracker.refresh(current.id, `${key}b`, count);
    },
  };

  // 情境猜谜抢答（投屏页“课堂工具 → 情境猜谜”调用，见 #政治经济学/情境猜谜/situation_puzzle.js）：出题时开一轮（谜底只交给后台），
  // 学生在自己页面的面板里抢答，后台核对，第一个猜中的自动加修为；投屏页每隔几秒读这一轮，有人猜中就显示恭喜；揭晓或关闭大屏时结束
  const winnerOf = (row) => (row && row.winner_sid ? { sid: row.winner_sid, name: row.winner_name, at: row.won_at } : null);
  window.ClassLivePuzzle = {
    points: (window.ClassLive.PUZZLE || {}).points || 5,
    tries: (window.ClassLive.PUZZLE || {}).tries || 3,
    delay: (window.ClassLive.PUZZLE || {}).delay || 10,
    // 出题：后台开一轮，并把游戏状态改为 ask、从后台现在起倒计时 delay 秒（goAt、now 都是后台时钟的毫秒，投屏页据此显示倒计时）
    async open({ key, label, surface, answer, accept }) {
      const current = await roomHere();
      const t0 = Date.now();
      const result = await backend.rpc('ck_puzzle_open', { p_classroom: Number(current.id), p_key: String(key).slice(0, 60), p_label: label || '',
        p_surface: surface || '', p_answer: answer, p_accept: accept || [], p_points: this.points });
      const row = Array.isArray(result) ? result[0] : result;
      return { id: row.id, points: row.points, winner: winnerOf(row), goAt: Number(row.go_at) || null, now: Number(row.now) || null, sent: t0, got: Date.now() };
    },
    // 大屏的游戏状态（2026-11-05）：rules 讲玩法、reveal 揭晓、end 关闭、beat 大屏打开期间报到；学生端据此显示或关掉抢答对话框
    async stage(action) {
      const current = await roomHere();
      const result = await backend.rpc('ck_puzzle_game', { p_classroom: Number(current.id), p_action: action });
      const row = Array.isArray(result) ? result[0] : result;
      return row || {};
    },
    async status(id) {
      const row = (await backend.fetchAll('puzzles', { id: Number(id) || id }))[0];
      if (!row) return null;
      const guesses = await backend.fetchAll('puzzleguesses', { round_id: Number(id) || id });
      return { open: Boolean(row.is_open), points: row.points, winner: winnerOf(row), guesses: guesses.length, people: new Set(guesses.map((g) => g.sid)).size };
    },
    async close() {
      const current = await roomHere();
      return backend.rpc('ck_puzzle_close', { p_classroom: Number(current.id) });
    },
  };

  // 匿名建议箱（2026-11-05 用户：“教师版的匿名建议箱要跟学生版的一样，只是无法递交。”）：投屏页在学生页同样的位置放同样的建议箱
  //   （卡片、文字、样式都与学生页共用 ClassLive.feedbackBox；笑脸、输入框、“匿名提交”都不能用），最下面一行显示这堂课（今天）收到几条；
  //   建议内容不上投屏，只在老师的工作台里看。习经：章节页“资料与延伸阅读”末尾（原来的提示卡 data-fb-projector 换成建议箱）；
  //   政经：案例页“资料与延伸阅读”里、页面最后的“回到案例起点 ↑”之前（2026-11-19 起网站版不再有“上一案例／下一案例”）
  // 回温（2026-11-20 用户：“然后教师端也要显示‘回温’板块”）：学生页出门测（政经是课后自修）后面有“回温”——每位同学重做自己做错的题。
  // 投屏页在同一个位置放一张同样的卡片，只作展示（清单因人而异，老师的页面没有自己的错题）；一章两个案例、课堂只上一个时放在看得见的那个案例后面
  (() => {
    const worksheet = config.kind === 'concept-html';
    const anchor = worksheet ? document.querySelector('#practice [data-xl]')
      : Array.from(document.querySelectorAll('section.quiz-set.is-exit')).filter((el) => !el.closest('[hidden]')).pop();
    if (!anchor || document.querySelector('[data-review-projector]')) return;
    const css = document.createElement('style');
    css.textContent = `
  .rm-hw { margin: 22px 0 10px; padding: 1.1em 1.1em 1em; border: 1px solid #e5d3b3; border-left: 5px solid #c4862c; border-radius: 14px;
    background: linear-gradient(135deg, #fffaf0, #fdf3e2); color: #3b3020; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; text-align: left; }
  .rm-hw-head { display: flex; gap: 12px; align-items: flex-start; }
  .rm-hw-mark { flex: 0 0 auto; display: grid; place-items: center; width: 2.5em; height: 2.5em; border-radius: 12px; background: linear-gradient(160deg, #e8a948, #b5701e);
    color: #fffaf0; font: 800 1.2em/1 "Kaiti SC", STKaiti, KaiTi, serif; box-shadow: 0 4px 12px rgba(181,112,30,.3); }
  .rm-hw-kicker { display: inline-block; padding: 0 .6em; border-radius: 999px; background: #f3dfbd; color: #8a5414; font-size: .8em; font-weight: 700; letter-spacing: .12em; }
  .rm-hw-head h3 { margin: .2em 0 .25em; font-size: 1.2em; line-height: 1.4; color: #5a3a10; }
  .rm-hw-head p { margin: 0; font-size: .9em; color: #6b5a40; }
  .rm-hw-src { margin: .7em 0 0; font-size: .92em; color: #5a4a30; }
  .rm-hw-note { margin: .8em 0 0; padding: .55em .8em; border-radius: 10px; background: rgba(255,255,255,.75); border: 1px dashed #e0c79d; font-size: .9em; color: #6b5a40; }
  @media print { .rm-hw { display: none !important; } }`;
    document.head.appendChild(css);
    const card = document.createElement('section');
    card.className = 'rm-hw';
    card.setAttribute('data-ix', '');
    card.setAttribute('data-review-projector', '');
    // 这张卡片是脚本后加的，页面自己的“增强组件里点击不翻页”没有管到它：点卡片不要触发“点左右两侧翻节”
    // （2026-11-20 用户：“我点回温的‘课堂’等按钮直接给我链接到最顶端了”——原来这里有几枚像按钮的来源标签，已改成一句话）
    ['click', 'keydown', 'keyup'].forEach((type) => card.addEventListener(type, (event) => event.stopPropagation()));
    card.innerHTML = `<header class="rm-hw-head"><span class="rm-hw-mark" aria-hidden="true">温</span><div><span class="rm-hw-kicker">回温</span>
      <h3>把做错的题再做一遍</h3>
      <p>学生页的这个位置是“回温”：汇集每位同学自己在课堂、修炼场和云间灵田里做错的题${worksheet ? '（课后自修的出门测、温故，等下一次课讲评以后才进来）' : ''}。重做答对了，就从清单里移走；答错了，看看答案和讲解，过一会儿再来做。回温的题不算本堂作业，不计入递交情况，也不加修为，是帮同学把易错点补牢。</p></div></header>
      <p class="rm-hw-src">错题来自：课堂${worksheet ? '、课后自修' : ''}、修炼场、云间灵田。</p>
      <p class="rm-hw-note">老师的页面只作展示：每位同学看到的是自己的错题清单，内容各不相同。想看学生端的样子，可以从工作台打开“学生测试版”。</p>`;
    anchor.insertAdjacentElement('afterend', card);
  })();

  const fbCard = (() => {
    const box = window.ClassLive.feedbackBox;
    if (!box) return null;
    const worksheet = config.kind === 'concept-html';
    const old = document.querySelector('[data-fb-projector]');
    const page = document.getElementById(worksheet ? 'sources' : 'chapter-sources');
    if (!old && !page) return null;
    const FB = box.texts(worksheet);
    const css = document.createElement('style');
    css.textContent = box.css;
    document.head.appendChild(css);
    const card = document.createElement('section');
    card.className = 'clp-fb';
    card.innerHTML = box.html(FB, true);
    card.querySelector('form').addEventListener('submit', (event) => event.preventDefault());
    const pager = worksheet && page ? page.querySelector('.case-sequence') || page.querySelector('.closing') : null;
    if (old) old.replaceWith(card);
    else if (pager) pager.insertAdjacentElement('beforebegin', card);
    else (page.querySelector('.section-inner') || page.querySelector('.inner') || page).appendChild(card);
    card.dataset.what = FB.what;
    return card;
  })();
  if (fbCard) {
    const stateEl = fbCard.querySelector('.clp-fb-state');
    const what = fbCard.dataset.what;
    const note = '老师的页面只展示、不能提交：请在你自己页面最后的建议箱，或左下角面板的“建议箱”按钮里写（先选标签：课程共建、课程疑问或纯唠嗑）。';
    stateEl.textContent = note;
    const refreshFeedback = async () => {
      try {
        const current = await roomHere();
        const today = window.ClassLive.today();
        const rows = (await backend.fetchAll('feedback', { classroom: Number(current.id) })).filter((row) => String(row.created_on || '').slice(0, 10) === today);
        const n = rows.length;
        const nBuild = rows.filter((row) => row.kind === 'build').length, nAsk = rows.filter((row) => row.kind === 'ask').length;   // 2026-11-23 两个标签
        const nChat = rows.filter((row) => row.kind === 'chat').length;   // 2026-11-26 第三个标签：纯唠嗑
        stateEl.textContent = `${note}${n ? `这堂课已经收到 ${n} 条（课程共建 ${nBuild} 条、课程疑问 ${nAsk} 条${nChat ? `、纯唠嗑 ${nChat} 条` : ''}），谢谢大家！（内容只在老师的工作台里看）` : `这堂课还没有收到${what}：下课前花一分钟写一写吧。`}`;
      } catch (error) {
        stateEl.textContent = note;   // 不是当前课堂、未登录教师工作台或后台还没有建议箱时只显示说明
      }
    };
    refreshFeedback();
    setInterval(refreshFeedback, 30000);
  }

  async function act(label, call) {
    openButton.disabled = true;
    stopButton.disabled = true;
    stateEl.textContent = `课堂：正在${label}……`;
    try {
      await call();
    } catch (error) {
      console.error(error);
      window.alert(`${label}失败：${error.message || error}`);
    } finally {
      openButton.disabled = false;
      stopButton.disabled = false;
      await load();
    }
  }
  openButton.addEventListener('click', () => {
    if (!room) return;
    const open = !room.submissions_open;
    if (!open && !window.confirm('结束提交后，学生不能再递交作答、发弹幕（已递交的保留）。确定结束吗？')) return;
    act(open ? '重新开放提交' : '结束提交', () => backend.rpc('ck_set_open', { p_classroom: Number(room.id), p_open: open }));
  });
  stopButton.addEventListener('click', () => {
    if (!room) return;
    if (!window.confirm(`停止“${room.name}”？课堂码 ${room.code} 将不能再进入，已提交的记录保留。`)) return;
    act('停止课堂', () => backend.rpc('ck_set_current', { p_classroom: Number(room.id), p_current: false }));
  });

  (async () => {
    const session = await backend.session().catch(() => null);
    if (!session || session.anonymous) {
      show('：请先<a href="/teacher/" target="_blank" rel="noopener">登录教师工作台</a>，再刷新本页', false);
      dodge();
      return;
    }
    // 教师登录记录（2026-11-04）：保存了登录状态直接打开投屏页也记一笔，与工作台共用“同一台设备 10 分钟内只记一次”
    try {
      const key = 'teacher:teacher-entry-log';   // 与工作台 store.get('teacher-entry-log') 同一个键
      if (Date.now() - (Number(localStorage.getItem(key)) || 0) >= 10 * 60000) {
        localStorage.setItem(key, String(Date.now()));
        backend.rpc('ck_log_teacher_login', { p_agent: `[打开投屏页] ${navigator.userAgent}`.slice(0, 200) }).catch((problem) => console.warn('[教师登录记录]', problem));
      }
    } catch (error) { /* 无痕模式等读不了本机存储时不记 */ }
    await load();
    setInterval(load, ROOM_MS);
    window.addEventListener('resize', dodge);
  })();
})();
