/* 教师工作台：登录（第二道锁）后先选择课程、再选择班级（一门课可有多个班级，各班数据分开，可单独删除），再管理“我的课堂”——发布本周课堂（选定章节或案例、生成课堂码）、
 * 结束提交、重新发布；查看加入名单、弹幕，以及作答情况：
 *   章节案例课程（case-html）：投票与选择、文字作答；
 *   概念学习课程（concept-html，如《政治经济学》）：作业情况（逐题分布与正确率）、学生作答（逐人批阅）。
 * 导出 CSV（数据一直保留，学期结束也不清空）。页面需先设置 window.CLASS_LIVE_CONFIG、window.TEACHER_DATA，并加载 live-core.js。
 */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  const DATA = window.TEACHER_DATA;
  // 表格里的短内容（日期、时间、姓名、学号、班级、状态、按钮等）不折行（2026-10-29 用户截图：“2026-10-27”“李星羽”被拆成两行）：
  // 每次表格重画后，把文字不超过 SHORT_CELL 个字的格子标成 tw-nowrap；弹幕、建议、评语等长文字照常换行。窗口窄时表格在外框里左右滑动
  const SHORT_CELL = 20;
  let shortPending = 0;
  const keepShortCells = () => {
    shortPending = 0;
    $$('.tw-table td:not(.tw-nowrap)').forEach((cell) => { if (cell.textContent.trim().length <= SHORT_CELL) cell.classList.add('tw-nowrap'); });
  };
  new MutationObserver(() => { if (!shortPending) shortPending = setTimeout(keepShortCells, 30); })   // 不用 requestAnimationFrame：工作台在后台标签页时它不跑
    .observe(document.body, { childList: true, subtree: true });
  const store = {
    get: (key) => { try { return localStorage.getItem('teacher:' + key); } catch (error) { return null; } },
    set: (key, value) => { try { localStorage.setItem('teacher:' + key, value); } catch (error) { /* 忽略 */ } },
  };
  // 课程：上次选择的课程；有多门课程而尚未选择时，登录后先显示“选择课程”
  const savedCourse = store.get('course');
  const course = DATA.courses.find((item) => item.slug === savedCourse) || DATA.courses[0];
  const mustPick = DATA.courses.length > 1 && !DATA.courses.some((item) => item.slug === savedCourse);
  const CONCEPT = course.kind === 'concept-html';
  // 《金融机构与市场》（2026-11-20）：按次上课的课程。作业通道同政经（CONCEPT），题目是通用的 extra 列表；
  // 没有修为境界、宗门、云间灵田、修炼场（用户：“不要云间灵田和境界等级了”）
  const PLAIN = Boolean(course.plain);
  const UNIT = course.unit_label || '章节';
  // 班级上课范围：本课程全部单元（政经按案例、习经按章节）、按章节号的快捷选择、范围的简短写法
  const scopeUnits = () => (course.units && course.kind === 'concept-html' && !course.plain
    ? course.units.filter((u) => !u.exam).map((u) => ({ id: u.unit, short: `案例${u.number}`, label: `案例${u.number} · ${u.chapter}`, chapter: u.chapter }))
    : (course.chapters || []).map((ch) => ({ id: ch.id, short: ch.cn, label: `${ch.cn} ${ch.title}`, chapter: ch.cn })));
  const CN_DIGITS = '零一二三四五六七八九';
  const chapterNo = (text) => {
    if (/导论/.test(text)) return 0;
    const m = String(text).match(/第([一二三四五六七八九十]+)章/);
    if (!m) return null;
    const [a, b, c] = m[1];
    if (m[1] === '十') return 10;
    if (a === '十') return 10 + CN_DIGITS.indexOf(b);
    if (b === '十') return CN_DIGITS.indexOf(a) * 10 + (c ? CN_DIGITS.indexOf(c) : 0);
    return CN_DIGITS.indexOf(a);
  };
  const scopeIds = (klass) => (klass && Array.isArray(klass.units) && klass.units.length ? klass.units : null);
  function scopeText(klass) {
    const all = scopeUnits();
    const ids = scopeIds(klass);
    if (!ids) return `全部 ${all.length} 个${UNIT}`;
    const groups = [];
    all.forEach((u, i) => {
      if (!ids.includes(u.id)) return;
      const last = groups[groups.length - 1];
      if (last && last.end === i - 1) last.end = i; else groups.push({ start: i, end: i });
    });
    const text = groups.map(({ start, end }) => (start === end ? all[start].short
      : `${all[start].short}—${all[end].short.replace(/^案例/, '')}`)).join('、');
    return `${groups.reduce((n, g) => n + g.end - g.start + 1, 0)} 个${UNIT}（${text}）`;
  }
  // 范围编辑器：快捷按钮＋每个单元一个勾选框；get() 返回所选单元（全选＝空数组，表示全部）
  function scopeEditor(host, selected) {
    const all = scopeUnits();
    const nums = all.map((u) => chapterNo(u.chapter));
    const presets = [{ label: `全部（${all.length} 个）`, ids: all.map((u) => u.id) }];
    const intro7 = all.filter((u, i) => nums[i] !== null && nums[i] <= 7).map((u) => u.id);
    const only7 = all.filter((u, i) => nums[i] !== null && nums[i] >= 1 && nums[i] <= 7).map((u) => u.id);
    if (intro7.length > only7.length && intro7.length < all.length) presets.push({ label: `导论＋第一至七章（${intro7.length} 个）`, ids: intro7 });
    if (only7.length && only7.length < all.length) presets.push({ label: `第一至七章（${only7.length} 个）`, ids: only7 });
    const chosen = new Set(selected && selected.length ? selected : all.map((u) => u.id));
    host.innerHTML = `<div class="tw-scope-presets">${presets.map((p, i) => `<button type="button" class="tw-secondary" data-scope-preset="${i}">${esc(p.label)}</button>`).join('')}</div>
      <div class="tw-scope-grid">${all.map((u) => `<label><input type="checkbox" value="${esc(u.id)}"${chosen.has(u.id) ? ' checked' : ''}> ${esc(u.label)}</label>`).join('')}</div>
      <p class="tw-hint" data-scope-count></p>`;
    const boxes = Array.from(host.querySelectorAll('input[type="checkbox"]'));
    const count = () => {
      const n = boxes.filter((box) => box.checked).length;
      const meetings = CONCEPT ? n : boxes.filter((box) => box.checked).reduce((sum, box) => {
        const ch = (course.chapters || []).find((item) => item.id === box.value);
        return sum + Math.max(1, ch ? ch.cases.length : 1);
      }, 0);
      host.querySelector('[data-scope-count]').textContent = PLAIN ? `已选 ${n} 个单元。` : `已选 ${n} 个${UNIT}，共 ${meetings} 次课，修为满分 ${meetings * 100}。`;
    };
    host.querySelectorAll('[data-scope-preset]').forEach((button) => button.addEventListener('click', () => {
      const ids = presets[Number(button.dataset.scopePreset)].ids;
      boxes.forEach((box) => { box.checked = ids.includes(box.value); });
      count();
    }));
    boxes.forEach((box) => box.addEventListener('change', count));
    count();
    return {
      get() { const ids = boxes.filter((box) => box.checked).map((box) => box.value); return ids.length === all.length ? [] : ids; },
      reset() { boxes.forEach((box) => { box.checked = true; }); count(); },
    };
  }
  const caseMap = new Map((course.cases || []).map((item) => [item.number, item]));
  const unitMap = new Map((course.units || []).map((item) => [item.unit, item]));
  // 政经的期中考查作业（examNN，2026-10-28）也当作单元：发布、课堂卡片、打开页面都和案例一样，但不进上课范围和修为结算
  const EXAMS = course.exams || [];
  const chapterMap = new Map(course.chapters.concat(EXAMS).map((item) => [item.id, item]));
  const isExam = (id) => /^exam\d{2}$/.test(String(id || ''));
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const ACTION_HEAD = '<th class="tw-col-action"><span class="sr-only">删除</span></th>';
  // 表格里的状态小标签和细进度条（2026-11-22 用户：“第一档先做吧”）：ok 绿、bad 红、warn 黄、mute 灰；时间等补充写成后面的灰色小字
  const statusTag = (text, tone = 'mute', title = '') => `<span class="tw-tag is-${tone}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  const whenSmall = (text) => (text ? `<small class="tw-when">${esc(text)}</small>` : '');
  const progLine = (label, done, total) => {
    const p = total ? Math.max(0, Math.min(100, Math.round((done * 100) / total))) : 0;
    return `<span class="tw-prog"><span class="tw-prog-txt">${esc(label)}</span><span class="tw-prog-bar${p >= 100 ? ' is-full' : ''}" aria-hidden="true"><i style="width:${p}%"></i></span></span>`;
  };
  // 班外同学（老师在“登录安全”允许后加进点名册的，标 extra）：删除时一并撤销允许、从本班点名册移除，名单里就不再显示
  const deleteCell = (row, extra) => `<td class="tw-col-action"><button type="button" class="tw-trash" data-student-delete="${esc(row.sid)}"${extra ? ' data-student-extra="1"' : ''} title="${extra ? '把这位班外同学从本班移除' : '删除该学生在本课堂的记录'}" aria-label="${extra ? `把 ${esc(Array.from(row.names).join('、'))} 从本班移除` : `删除 ${esc(Array.from(row.names).join('、'))} 在本课堂的记录`}">${TRASH_ICON}</button></td>`;
  const KINDS = CONCEPT ? ['checkins', 'homework', 'danmaku'] : ['checkins', 'choices', 'answers', 'danmaku'];
  const emptyDocs = () => ({ checkins: [], choices: [], answers: [], danmaku: [], homework: [] });
  // 班级：本机记住每门课上次选的班级（投屏页据此挑选当前课堂，见 ClassLive.pickRoom）
  const CLASS_KEY = `class:${course.slug}`;
  // 数据库时间（可能带微秒）→ 毫秒
  const millis = (value) => (value ? Date.parse(String(value).replace(/(\.\d{3})\d+/, '$1')) || 0 : 0);
  const clock = (ts) => ts ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ts)) : '';
  const isoDay = (ts) => ts ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(ts)) : '';
  // 匿名建议的提交时间（2026-11-24 用户：“学生递交的匿名建议也要显示具体时间”）：之后的建议记到几点几分（created_at），以前的只有日期
  const fbTime = (doc) => (doc && doc.created_at ? `${isoDay(millis(doc.created_at))} ${clock(millis(doc.created_at)).slice(0, 5)}` : String((doc && doc.created_on) || ''));
  const pct = (value, total) => (total ? Math.round(value / total * 100) : 0);
  const joinLink = (code) => `${location.origin}/?join=${encodeURIComponent(code)}`;
  $('[data-course-title]').textContent = mustPick ? '请选择课程' : course.title;
  document.title = mustPick ? '教师工作台' : `教师工作台 · ${course.title}`;

  // 按课程类型显示标签页与文字
  $$('[data-kind-only]').forEach((tab) => { tab.hidden = tab.dataset.kindOnly !== course.kind; });
  if (!(course.exams || []).length) $('[data-tab="exam"]').hidden = true;   // 只有政经有期中考查作业
  if (PLAIN) $$('[data-tab="realm"], [data-tab="lingtian"], [data-tab="focus"], [data-tab="exam"]').forEach((tab) => { tab.hidden = true; });
  $$('[data-unit-label]').forEach((el) => { el.textContent = UNIT; });
  $('[data-publish-unit]').textContent = `本次${UNIT}`;
  $('[data-publish-case-hint]').hidden = CONCEPT;   // 只有习经有“一章两个案例”
  $('[data-room-empty]').textContent = `还没有发布课堂。点击右上角“发布本周课堂”，选择${UNIT}后生成课堂码，再把课堂码或加入链接展示给学生。`;
  if (CONCEPT) {
    $('[data-room-classroom]').title = '上课投屏用（讲解版）：含参考答案，弹幕和学生作答分布在这里显示';
    $('[data-panel="pages"] .tw-note').textContent = '讲解版（含参考答案和教师参考）只在教师端提供，学生拿到的是练习版。上课投屏打开对应案例：弹幕开启时在页面上滚动显示；“想一想”“辨一辨”和出门测下方会显示学生的作答分布，点“显示分布”才展开。';
    $('[data-export="room"]').textContent = '导出本课堂（加入、作业汇总与明细、弹幕）';
  }
  if (PLAIN) {
    // 这门课的学生页不发弹幕；界面上提到修为的几句话换成中性的说法
    $$('[data-tab="danmaku"]').forEach((tab) => { tab.hidden = true; });
    $$('[data-stat-lingtian], [data-stat-focus]').forEach((el) => { const box = el.closest('.tw-stat'); if (box) box.hidden = true; });   // 这门课没有云间灵田（也就没有静修）
    $$('[data-scope-note]').forEach((el) => { el.textContent = '默认全部；只上部分单元的，在这里选'; });   // 2026-11-22：原来改的是整个折叠标题，连“上课时间与教室”也被改成了“上课范围”
    $$('[data-leave-status]').forEach((el) => { el.textContent = '学生在首页点“请假”提交，不需要审批。'; });
    $$('.tw-enter').forEach((el) => { el.title = '打开：学生可以用这个课堂码进入、递交作答；关掉：成为历史课堂，学生用课堂码只能进来查看。'; });
    $('[data-room-classroom]').title = '上课投屏用（教师投屏页）：含参考答案与依据，学生的递交人数和分布在这里显示';
    $('[data-panel="pages"] .tw-note').textContent = '教师投屏页（含参考答案与依据）只在教师端提供，学生拿到的页面不含答案。上课投屏打开对应的次课：每道题下面显示递交人数，点“显示分布”才展开。';
  }

  let backend = null;
  let backendError = '';
  try { backend = window.ClassLive.create(config); } catch (error) { backendError = error.message; }

  const state = {
    rooms: [],
    room: null,
    docs: emptyDocs(),
    stops: [],
    started: false,
    classes: [],               // 本课程的班级
    klass: null,               // 当前班级（含点名册 roster）
    openStudents: new Set(),   // 学生作答：已展开的学号
    openTexts: new Set(),      // 作业情况：已展开的文字题
    leaves: [],                // 本班请假记录（ck_leaves）
    presence: { room: '', map: new Map() },   // 本课堂学生最近一次报到在线的时间（ck_presence，学号→毫秒）
  };

  // ---------------- 登录 ----------------
  const showLogin = (message) => {
    $('[data-login]').hidden = false;
    $('[data-app]').hidden = true;
    $('[data-course-picker]').hidden = true;
    $('[data-when-login]').hidden = true;
    const hint = $('[data-provider-hint]');
    if (!backend) {
      hint.textContent = backendError || '课堂后台尚未配置：请在网站的 live.config.json 中填写云开发环境后重新发布。';
      $('[data-login-form] button').disabled = true;
    } else if (backend.name === 'mock') {
      hint.textContent = '本机测试模式：数据只存在这台电脑的浏览器里，任意账号密码均可登录。';
    }
    if (message) $('[data-login-error]').textContent = message;
  };

  // 本机连续登录失败 5 次后要等待（30 秒起，每多错一次加倍，最长 15 分钟）。这只是网页上的减速，
  // 真正的防线是云开发账号自身的登录保护和足够长的密码（见“登录安全”说明）
  const LOGIN_FAILS = 'login-fails';
  const loginFails = () => { try { return JSON.parse(store.get(LOGIN_FAILS) || '[]').filter((ts) => Date.now() - ts < 30 * 60000); } catch (error) { return []; } };
  const loginWait = () => {
    const fails = loginFails();
    if (fails.length < 5) return 0;
    return Math.max(0, fails[fails.length - 1] + Math.min(15 * 60, 30 * 2 ** (fails.length - 5)) * 1000 - Date.now());
  };
  $('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = $('[data-login-error]');
    const button = form.querySelector('button');
    const wait = loginWait();
    if (wait) { error.textContent = `登录失败次数过多，请 ${Math.ceil(wait / 1000)} 秒后再试。`; return; }
    error.textContent = '';
    button.disabled = true;
    button.textContent = '正在登录……';
    try {
      const session = await backend.signInTeacher(form.username.value.trim(), form.password.value);
      if (!session || session.anonymous) throw new Error('not-teacher');
      form.password.value = '';
      store.set(LOGIN_FAILS, '[]');
      logTeacherEntry('密码登录', true);
      enterApp(session);
    } catch (problem) {
      console.error(problem);
      store.set(LOGIN_FAILS, JSON.stringify(loginFails().concat(Date.now()).slice(-20)));
      const left = 5 - loginFails().length;
      error.textContent = '登录失败：账号或密码不正确，或该账号尚未在云开发后台创建。' + (left > 0 && left < 3 ? `再错 ${left} 次要等待一段时间才能重试。` : '');
    } finally {
      button.disabled = false;
      button.textContent = '登录';
    }
  });

  $('[data-logout]').addEventListener('click', async () => {
    state.stops.forEach((stop) => stop());
    try { await backend.signOut(); } catch (error) { /* 忽略 */ }
    location.reload();
  });

  // 教师登录记录（2026-11-04 用户：“登陆安全里面的教师登陆记录总是无法及时更新”）：原来只在输入密码登录时记一笔，
  // 保存了登录状态直接打开工作台（最常见的情况）不记，所以记录总停在很久以前。现在：输密码登录每次都记；
  // 保存了登录状态打开工作台或投屏页（live-room.js）时也记，同一台设备 10 分钟内只记一次（刷新页面不重复记）
  function logTeacherEntry(how, always) {
    const key = 'teacher-entry-log';
    if (!always && Date.now() - (Number(store.get(key)) || 0) < 10 * 60000) return Promise.resolve(false);
    store.set(key, String(Date.now()));
    return backend.rpc('ck_log_teacher_login', { p_agent: `[${how}] ${navigator.userAgent}`.slice(0, 200) })
      .then(() => { if (sec.loaded && !$('[data-panel="security"]').hidden) loadSecurity(true); return true; })
      .catch((problem) => { console.warn('[教师登录记录]', problem); return false; });
  }

  async function enterApp(session) {
    $('[data-login]').hidden = true;
    $('[data-when-login]').hidden = false;
    $('[data-user]').textContent = session.name ? `教师：${session.name}` : '教师已登录';
    $('[data-switch-course]').disabled = DATA.courses.length < 2;
    $('[data-nav]').hidden = false;
    updateNav();
    if (window.ClassLivePlanner) window.ClassLivePlanner.ready(backend, DATA.courses);
    if (mustPick) { showPicker(); return; }
    await enterClass();
  }

  async function openApp() {
    $('[data-course-picker]').hidden = true;
    $('[data-class-picker]').hidden = true;
    $('[data-app]').hidden = false;
    showClassInfo();
    if (!state.started) {
      state.started = true;
      fillChapterOptions();
    }
    renderPages();
    stopWatching();
    state.room = null;
    // 2026-11-07 用户：“在切换班级后，‘学情分析’等内容都要自动刷新一遍”：先清掉上一个班的内容，当前打开的标签马上按新班级重新读取；
    // 其他标签点开时读取（点名、作答、弹幕等跟着课堂走，下面 loadRooms 选中课堂时就重新读了）
    clearInsights();
    state.classOpening = true;
    await loadRooms(store.get(`room:${state.klass.id}`));
    state.classOpening = false;
    await loadLeaves();
    await loadPresence();
    renderStats();
    renderCheckins();
    realmResult = null;
    realmSaved = '';
    renderRealms();
    if (!$('[data-panel="insight"]').hidden) renderInsights(true);
    if (!$('[data-panel="updates"]').hidden) renderUpdates();
    if (!$('[data-panel="lingtian"]').hidden) ltLoad();   // 2026-11-23：正开着“云间灵田”时按新班级重新读取（数据统计、种田行为分析）
    if (!$('[data-panel="focus"]').hidden) ltFocusLoad();   // 正开着“静修数据”时同样重读
    sec.loaded = false;
    sec.requests = [];
    sec.pins = [];
    loadSecurity(!$('[data-panel="security"]').hidden);
    if (CONCEPT && !$('[data-panel="exam"]').hidden) loadExam();
    syncPractice(false).catch((error) => console.warn('[修炼场] 题库同步没有完成：', error));
    // 自动结算（2026-11-26 起晚 10 秒再开始：打开班级时先把课堂、名单这些马上要看的读完，不和它们抢网络）；正开着“修为境界”时马上算
    clearTimeout(settleTimer);
    const klassNow = state.klass;
    settleTimer = setTimeout(() => {
      if (state.klass !== klassNow) return;
      autoSettle().catch((error) => console.warn('[修为境界] 自动结算没有完成：', error))
        .then(() => { if ((!realmResult || realmResult.saved) && !$('[data-panel="realm"]').hidden) refreshRealms(false); });   // 正开着“修为境界”时按新班级重新计算
    }, $('[data-panel="realm"]').hidden ? 10000 : 0);
  }

  // ---------------- 选择课程 ----------------
  // 2026-11-22 改版（用户：“把截图这个界面做得更美观一些吧，不一定要显示开放中的课堂”）：按 courses.config.json 的 picker.group 分组
  // （本科课程、研究生课程），每门课一张卡片：图标、类型、课程名、几项规模；底部只写开放中的课堂有几个，不再列出课堂名和课堂码。
  const PICK_ICONS = {
    book: '<path d="M12 6.6C10.2 5.3 7.6 4.7 4 4.9v13.3c3.6-.2 6.2.4 8 1.8 1.8-1.4 4.4-2 8-1.8V4.9c-3.6-.2-6.2.4-8 1.7z"/><path d="M12 6.6V20"/>',
    bulb: '<path d="M9.2 17.5h5.6M10.2 20.5h3.6"/><path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.2 1 2v1.5h4.8V16c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5z"/>',
    bank: '<path d="M3.5 9 12 4l8.5 5"/><path d="M5 9.5h14"/><path d="M6.8 9.5v7.5M10.3 9.5v7.5M13.7 9.5v7.5M17.2 9.5v7.5"/><path d="M4.5 17.5h15M3.5 20.5h17"/>',
    scale: '<path d="M12 3.5v17M8 20.5h8M4.5 7h15"/><path d="M4.5 7 2 13a2.5 2.5 0 0 0 5 0z"/><path d="M19.5 7 17 13a2.5 2.5 0 0 0 5 0z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    users: '<path d="M15.5 19v-1.4a3.6 3.6 0 0 0-3.6-3.6H7.1a3.6 3.6 0 0 0-3.6 3.6V19"/><circle cx="9.5" cy="7.8" r="3.3"/><path d="M20.5 19v-1.4a3.6 3.6 0 0 0-2.6-3.45"/><path d="M15.4 4.65a3.3 3.3 0 0 1 0 6.3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  const pickOf = (item) => item.picker || {};
  const pickSvg = (name, size = 26, stroke = 1.7) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PICK_ICONS[name] || PICK_ICONS.book}</svg>`;
  const pickIcon = (item, size) => pickSvg(pickOf(item).icon || (item.flavor === 'session' ? 'calendar' : item.kind === 'concept-html' ? 'bulb' : 'book'), size);
  // 规模：副标题去掉第一段（课程类别）；按章节、按案例的课再加上单元数（与副标题重复的不加），按次上课的课副标题里已经有“几次课”
  const pickFacts = (item) => {
    const facts = String(pickOf(item).subtitle || '').split('·').map((part) => part.trim()).filter(Boolean).slice(1);
    const units = `${item.chapters.length} 个${item.unit_label || '章节'}`;
    if (item.flavor !== 'session' && !facts.includes(units)) facts.unshift(units);
    return facts;
  };
  const pickCard = (item) => {
    const current = !mustPick && item.slug === course.slug;
    const tone = pickOf(item).tone;
    return `
      <button type="button" class="tw-pick${current ? ' is-current' : ''}" data-course="${esc(item.slug)}"${tone ? ` data-tone="${esc(tone)}"` : ''}>
        <span class="tw-pick-top"><span class="tw-pick-icon" aria-hidden="true">${pickIcon(item)}</span>${current ? '<span class="tw-pick-now">当前课程</span>' : ''}</span>
        <span class="tw-pick-kind">${esc(item.kind_label || (item.kind === 'concept-html' ? '概念学习案例' : '章节案例'))}</span>
        <strong class="tw-pick-title">${esc(item.title)}</strong>
        <span class="tw-pick-facts">${pickFacts(item).map((fact) => `<span>${esc(fact)}</span>`).join('')}</span>
        <span class="tw-pick-foot"><span class="tw-pick-live" data-course-room>正在读取课堂……</span><span class="tw-pick-go">进入<b aria-hidden="true">→</b></span></span>
      </button>`;
  };
  function showPicker() {
    $('[data-app]').hidden = true;
    $('[data-class-picker]').hidden = true;
    $('[data-course-picker]').hidden = false;
    updateNav('course');
    if (!state.started) setLive('请选择课程');
    const list = $('[data-course-list]');
    const groups = [];
    DATA.courses.forEach((item) => {
      const name = pickOf(item).group || '';
      let group = groups.find((entry) => entry.name === name);
      if (!group) groups.push(group = { name, items: [] });
      group.items.push(item);
    });
    list.innerHTML = groups.map((group) => `
      <section class="tw-pick-group">
        ${group.name ? `<h2 class="tw-pick-group-title">${esc(group.name)}<small>${group.items.length} 门</small></h2>` : ''}
        <div class="tw-pick-grid">${group.items.map(pickCard).join('')}</div>
      </section>`).join('');
    DATA.courses.forEach(async (item) => {
      const label = list.querySelector(`[data-course="${item.slug}"] [data-course-room]`);
      try {
        const open = (await backend.fetchAll('classrooms', { course: item.slug })).filter((room) => room.is_current).length;
        label.textContent = open ? `${open} 个课堂开放中` : '暂无开放中的课堂';
        label.classList.toggle('is-on', open > 0);
      } catch (error) {
        label.textContent = '课堂情况暂时读不到';
      }
    });
  }
  $('[data-course-list]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-course]');
    if (!button) return;
    stopWatching();
    if (!mustPick && button.dataset.course === course.slug) { showClassPicker(); return; }
    store.set('course', button.dataset.course);
    try { sessionStorage.setItem('teacher:pick-class', '1'); } catch (error) { /* 忽略 */ }
    location.reload();
  });
  $('[data-switch-course]').addEventListener('click', () => { stopWatching(); showPicker(); });

  // 读取失败的原因：登录过期（后台把请求当成未登录）、网络中断，或其他错误
  const failReason = (error) => {
    const text = String((error && [error.code, error.message].filter(Boolean).join(' ')) || error || '');
    if (/permission denied|PGRST30|jwt|token|unauthori[sz]ed|\b401\b/i.test(text)) return '登录已过期，请刷新页面；仍不行就点“退出登录”后重新登录。';
    if (/fetch|network|timeout|abort/i.test(text)) return '网络连接中断，请检查网络后刷新页面。';
    return `请刷新页面再试（${text.slice(0, 80)}）。`;
  };

  // ---------------- 选择班级 ----------------
  async function loadClasses() {
    state.classes = (await backend.fetchAll('classes', { course: course.slug })).sort((a, b) => Number(a.id) - Number(b.id));
    if (state.klass) state.klass = state.classes.find((item) => String(item.id) === String(state.klass.id)) || null;
    return state.classes;
  }
  async function enterClass() {
    try {
      await loadClasses();
    } catch (error) {
      console.error(error);
      setLive(`读取班级失败：${failReason(error)}`, true);
      state.classes = [];
    }
    const saved = state.classes.find((item) => String(item.id) === String(store.get(CLASS_KEY)));
    // 从“选择课程”点进来时一律先到“选择班级”；直接打开或刷新工作台时，仍回到上次的班级
    let picked = false;
    try { picked = sessionStorage.getItem('teacher:pick-class') === '1'; sessionStorage.removeItem('teacher:pick-class'); } catch (error) { /* 忽略 */ }
    if (saved) state.klass = saved;
    if (saved && !picked) await openApp(); else await showClassPicker();
  }
  const sameClass = (room, klass) => String(room.class_id || '') === String((klass && klass.id) || '');
  async function showClassPicker(notice) {
    $('[data-app]').hidden = true;
    $('[data-course-picker]').hidden = true;
    $('[data-class-picker]').hidden = false;
    updateNav('class');
    const tone = pickOf(course).tone;   // 班级卡片的配色跟着课程走（2026-11-22 改版）
    $('[data-class-course]').innerHTML = `<span class="tw-course-chip"${tone ? ` data-tone="${esc(tone)}"` : ''}>${pickIcon(course, 18)}${esc(course.title)}</span>`;
    $('[data-course-title]').textContent = course.title;
    if (!state.started) setLive('请选择班级');
    let rooms = [];
    try {
      await loadClasses();
      rooms = await backend.fetchAll('classrooms', { course: course.slug });
    } catch (error) {
      console.error(error);
      $('[data-class-list]').innerHTML = `<p class="tw-empty">读取班级失败：${esc(failReason(error))}</p>`;
      return;
    }
    // 上课时间较长时只在“ · ”处换行，不把“教学班 1209”“明理楼北306”拆开
    const timeParts = (text) => text.split(' · ').map((part) => esc(part).replace(/ /g, '&nbsp;')).join('&nbsp;· ');   // 圆点留在上一行末尾
    // 班级卡片（2026-11-22 改版，同“选择课程”）：图标、班级名、上课时间，课堂数和点名册（没上传的标出来：没有点名册学生登录不了），
    // 底部只写开放中的课堂有几个，不再列出课堂名和课堂码
    $('[data-class-list]').innerHTML = state.classes.map((klass) => {
      const mine = rooms.filter((room) => sameClass(room, klass));
      const open = mine.filter((room) => room.is_current).length;
      const roster = Array.isArray(klass.roster) ? klass.roster.length : 0;
      const current = state.klass && String(state.klass.id) === String(klass.id);
      const when = klass.schedule && window.ClassLivePlanner ? window.ClassLivePlanner.summary(klass.schedule) : '';
      return `<div class="tw-class-item">
        <button type="button" class="tw-pick tw-class-card${current ? ' is-current' : ''}" data-class="${esc(klass.id)}"${tone ? ` data-tone="${esc(tone)}"` : ''}>
          <span class="tw-pick-top"><span class="tw-pick-icon" aria-hidden="true">${pickSvg('users')}</span>${current ? '<span class="tw-pick-now">当前班级</span>' : ''}</span>
          <strong class="tw-pick-title">${esc(klass.name)}</strong>
          ${when ? `<span class="tw-class-when">${pickSvg('clock', 15, 2)}<span>${timeParts(when)}</span></span>` : ''}
          <span class="tw-pick-facts"><span>课堂 ${mine.length} 个</span>${roster ? `<span>点名册 ${roster} 人</span>` : '<span class="is-warn">点名册未上传</span>'}</span>
          <span class="tw-pick-foot"><span class="tw-pick-live${open ? ' is-on' : ''}">${open ? `${open} 个课堂开放中` : '暂无开放中的课堂'}</span><span class="tw-pick-go">进入<b aria-hidden="true">→</b></span></span>
        </button>
        <button type="button" class="tw-trash" data-class-delete="${esc(klass.id)}" title="删除班级" aria-label="删除班级 ${esc(klass.name)}">${TRASH_ICON}</button>
      </div>`;
    }).join('') || '<p class="tw-empty">本课程还没有班级。先在下面新建一个班级，例如“2026秋 经济学一班”。</p>';
    // 班级功能上线前发布的课堂：归入某个班级后才在该班级里显示（记录不会丢失）
    const legacy = rooms.filter((room) => !room.class_id);
    $('[data-legacy]').hidden = !legacy.length;
    if (legacy.length) {
      $('[data-legacy-text]').textContent = `本课程有 ${legacy.length} 个课堂是在“班级”功能上线前发布的（${legacy.slice(0, 6).map((room) => `${room.name}·${room.code}`).join('、')}${legacy.length > 6 ? '……' : ''}），还没有归入班级。归入后会出现在所选班级里，记录不会丢失。`;
      $('[data-legacy-class]').innerHTML = state.classes.map((klass) => `<option value="${esc(klass.id)}">${esc(klass.name)}</option>`).join('');
      $('[data-legacy-move]').disabled = !state.classes.length;
      if (!state.classes.length) $('[data-legacy-status]').textContent = '请先新建班级。';
    }
    $('[data-class-notice]').textContent = notice || '';
  }
  // 删除班级：输入班级名称确认，连同该班级的全部课堂与学生记录一起删除（ck_delete_class）
  async function deleteClass(klass) {
    const typed = window.prompt(`删除班级“${klass.name}”会同时删除它的全部课堂、加入记录、选择、作答、作业、弹幕和点名册，无法恢复；其他班级不受影响。建议先进入该班级，在“导出与清理”里导出存档。\n\n确认删除，请输入班级名称：`);
    if (typed === null) return;
    if (typed.trim() !== klass.name) { await showClassPicker('班级名称不一致，没有删除。'); return; }
    try {
      await backend.rpc('ck_delete_class', { p_class: Number(klass.id) || klass.id });
      if (state.klass && String(state.klass.id) === String(klass.id)) {
        stopWatching();
        state.klass = null;
        state.room = null;
        state.rooms = [];
      }
      if (String(store.get(CLASS_KEY)) === String(klass.id)) store.set(CLASS_KEY, '');
      await showClassPicker(`已删除班级“${klass.name}”及其全部记录。`);
    } catch (error) {
      console.error(error);
      await showClassPicker(`删除失败：${error.message || error}`);
    }
  }
  $('[data-class-list]').addEventListener('click', async (event) => {
    const trash = event.target.closest('[data-class-delete]');
    if (trash) {
      const klass = state.classes.find((item) => String(item.id) === trash.dataset.classDelete);
      if (klass) await deleteClass(klass);
      return;
    }
    const button = event.target.closest('[data-class]');
    if (!button) return;
    state.klass = state.classes.find((item) => String(item.id) === button.dataset.class);
    store.set(CLASS_KEY, state.klass.id);
    await openApp();
  });
  const newScope = scopeEditor($('[data-new-scope]'), null);
  // 上课时间与教室（2026-10-28 工作台“课表”）：不填就不保存
  const newSchedule = window.ClassLivePlanner ? window.ClassLivePlanner.editor($('[data-new-schedule]'), null) : null;
  $('[data-class-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const error = $('[data-class-error]');
    error.textContent = '';
    if (!name) { error.textContent = '请填写班级名称'; return; }
    try {
      const created = await backend.rpc('ck_create_class', { p_course: course.slug, p_name: name });
      const row = Array.isArray(created) ? created[0] : created;
      const units = newScope.get();
      if (units.length && row && row.id != null) await backend.rpc('ck_set_class_units', { p_class: Number(row.id) || row.id, p_units: units });
      const plan = newSchedule && newSchedule.get(true);
      let planNote = '';
      if (plan && row && row.id != null) {
        try {
          await window.ClassLivePlanner.save(row.id, plan);
          planNote = `上课时间：${window.ClassLivePlanner.summary(plan)}，已排进“课表”。`;
        } catch (problem) {
          console.error(problem);
          planNote = window.ClassLivePlanner.missingError(problem) ? `上课时间没有保存：${window.ClassLivePlanner.NOT_READY}` : `上课时间没有保存（${problem.message || problem}），可以在“课表”里补填。`;
        }
      }
      form.elements.name.value = '';
      newScope.reset();
      if (newSchedule) newSchedule.reset();
      if (window.ClassLivePlanner) window.ClassLivePlanner.reload().catch(() => {});
      await showClassPicker(`已新建班级“${name}”（上课范围：${units.length ? `${units.length} 个${UNIT}` : '全部'}），点上方卡片进入。${planNote}`);
    } catch (problem) {
      console.error(problem);
      error.textContent = window.ClassLive.isDuplicateError(problem) ? '已有同名班级' : `新建失败：${problem.message || problem}`;
    }
  });
  $('[data-legacy-move]').addEventListener('click', async () => {
    const target = state.classes.find((item) => String(item.id) === $('[data-legacy-class]').value);
    if (!target) return;
    const rooms = (await backend.fetchAll('classrooms', { course: course.slug })).filter((room) => !room.class_id);
    if (!window.confirm(`把 ${rooms.length} 个未分班级的课堂全部归入“${target.name}”？`)) return;
    const failed = [];
    for (const room of rooms) {
      try { await backend.rpc('ck_move_classroom', { p_classroom: Number(room.id) || room.id, p_class: Number(target.id) || target.id }); } catch (problem) { failed.push(`${room.name}：${problem.message || problem}`); }
    }
    await showClassPicker(failed.length ? `部分课堂没有归入：${failed.join('；')}` : `已归入“${target.name}”。`);
  });
  $('[data-switch-class]').addEventListener('click', () => { stopWatching(); showClassPicker(); });
  // ---------------- 顶部导航栏：课程 › 班级 › 课堂，右侧跳到各栏目 ----------------
  // level：'course' 正在选课程，'class' 正在选班级，省略 = 已进入某个班级
  function updateNav(level) {
    const inApp = !level && !$('[data-app]').hidden && state.klass;
    $('[data-nav-course]').textContent = mustPick || level === 'course' ? '选择课程' : course.title;
    $('[data-nav-class-item]').hidden = mustPick || level === 'course';
    $('[data-nav-class]').textContent = state.klass && level !== 'class' ? state.klass.name : '选择班级';
    $('[data-nav-room-item]').hidden = !(inApp && state.room);
    $('[data-nav-room]').textContent = state.room ? `${state.room.name}（${state.room.code}）` : '';
    // 右侧：切换班级（已进入某个班级时）、切换课程（不止一门课时）
    const links = $('[data-nav-links]');
    const classButton = links.querySelector('[data-nav-switch="class"]');
    const courseButton = links.querySelector('[data-nav-switch="course"]');
    classButton.hidden = !inApp;
    courseButton.hidden = level === 'course' || DATA.courses.length < 2;
    links.hidden = classButton.hidden && courseButton.hidden;
  }
  $('[data-nav-room-jump]').addEventListener('click', () => $('[data-room-list]').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('[data-nav-links]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-nav-switch]');
    if (!button) return;
    stopWatching();
    if (button.dataset.navSwitch === 'class') showClassPicker();
    else showPicker();
  });

  // 页面上与班级有关的文字
  function showClassInfo() {
    const klass = state.klass;
    $('[data-course-title]').textContent = `${course.title} · ${klass.name}`;
    document.title = `教师工作台 · ${course.title} · ${klass.name}`;
    $('[data-class-name]').textContent = klass.name;
    // “我的课堂”标题旁的课程、班级标签（2026-11-22 改版，同“选择班级”；配色跟着课程走）
    const tone = pickOf(course).tone;
    const toneAttr = tone ? ` data-tone="${esc(tone)}"` : '';
    $('[data-app-context]').innerHTML = `<span class="tw-course-chip"${toneAttr}>${pickIcon(course, 18)}${esc(course.title)}</span>`
      + `<span class="tw-course-chip is-class"${toneAttr}>${pickSvg('users', 18)}${esc(klass.name)}</span>`;
    $('[data-class-rooms]').textContent = state.rooms.length;
    $('[data-class-scope]').textContent = scopeText(klass);
    $('[data-class-schedule]').textContent = (window.ClassLivePlanner && window.ClassLivePlanner.summary(klass.schedule)) || '未填写';
    updateNav();
    const roster = rosterOf();
    $('[data-roster-info]').textContent = roster.length
      ? `本班点名册：${roster.length} 人${klass.roster_updated_at ? `（${isoDay(millis(klass.roster_updated_at))} 上传）` : ''}，重新上传会替换。下表按点名册核对本次课堂的登录情况。`
      : '请上传本班点名册（xlsx 或 csv，需含“姓名”“学号”两列）：没有点名册时学生不能登录；上传后还能核对哪些同学已登录本次课堂。';
  }

  // ---------------- 我的课堂 ----------------
  const roomStatus = (room) => {
    if (!room.is_current) return { text: '历史课堂（未开放）', cls: 'is-past' };
    return room.submissions_open ? { text: '开放中 · 学生可进入', cls: 'is-live' } : { text: '开放中 · 已结束提交', cls: 'is-closed' };
  };
  // 一章两个案例分开上（2026-10-23，习经）：课堂的 case_no 是只上的那个案例，空＝整章
  const chapterLabel = (room) => {
    const chapter = chapterMap.get(room.chapter);
    if (chapter && isExam(room.chapter)) return `期中考查作业 · ${chapter.title}（${chapter.case}）`;
    return (chapter ? `${chapter.cn} ${chapter.title}` : room.chapter) + (room.case_no ? ` · 案例 ${String(room.case_no).padStart(2, '0')}` : '');
  };
  const roomCases = () => {
    const chapter = state.room && chapterMap.get(state.room.chapter);
    const only = state.room && Number(state.room.case_no);
    return chapter ? chapter.cases.map((item) => caseMap.get(item.number)).filter((item) => item && (!only || Number(item.number) === only)) : [];
  };

  async function loadRooms(preferId) {
    const rows = (await backend.fetchAll('classrooms', { course: course.slug })).filter((room) => sameClass(room, state.klass));
    state.rooms = rows.sort((a, b) => Number(b.id) - Number(a.id));
    $('[data-class-rooms]').textContent = state.rooms.length;
    $('[data-room-empty]').hidden = state.rooms.length > 0;
    $('[data-room-area]').hidden = state.rooms.length === 0;
    if (!state.rooms.length) { renderRoomList(); selectRoom(null); setLive('尚未发布课堂'); return; }
    const current = state.rooms.find((room) => room.is_current);
    const wanted = state.rooms.find((room) => String(room.id) === String(preferId)) || current || state.rooms[0];
    selectRoom(wanted);
  }
  // 课堂小卡片（2026-11-22 改版，同“选择课程”“选择班级”）：状态点（开放中／已结束提交／历史课堂）、课堂名、章节，底部是课堂码和发布日期；
  // 选中的一张加边框，配色跟着课程走；完整的状态写在 title 里
  const ROOM_STATE = { 'is-live': '开放中', 'is-closed': '已结束提交', 'is-past': '历史课堂' };
  function renderRoomList() {
    const tone = pickOf(course).tone;
    $('[data-room-list]').innerHTML = state.rooms.map((room) => {
      const status = roomStatus(room);
      const active = state.room && String(state.room.id) === String(room.id);
      const day = isoDay(millis(room.created_at));
      const label = chapterLabel(room);
      const sub = label.startsWith(`${room.name} `) ? label.slice(room.name.length + 1) : label;   // 课堂名就是“第四章”时，章节名不再重复“第四章”
      return `<div class="tw-class-item tw-room-item">
        <button type="button" class="tw-room-card ${status.cls}${active ? ' is-current' : ''}" data-room="${esc(room.id)}" aria-pressed="${active}"${tone ? ` data-tone="${esc(tone)}"` : ''} title="${esc(status.text)}">
          <span class="tw-room-card-state"><i aria-hidden="true"></i>${esc(ROOM_STATE[status.cls] || status.text)}</span>
          <strong>${esc(room.name)}</strong>
          <span class="tw-room-card-sub">${esc(sub)}</span>
          <span class="tw-room-card-meta"><code>${esc(room.code)}</code>${day ? `<span>${esc(day)}</span>` : ''}</span>
        </button><button type="button" class="tw-trash" data-room-delete="${esc(room.id)}" title="删除本堂课" aria-label="删除课堂 ${esc(room.name)}">${TRASH_ICON}</button></div>`;
    }).join('');
    renderPages();   // “课堂网页”卡片上的“上过／开放中／当前课堂”跟着课堂列表走
  }
  const roomNotice = (text) => { $('[data-room-notice]').textContent = text || ''; };
  // 删除一堂课：该课堂及其加入记录、选择、作答、作业、弹幕；本班其他课堂和点名册不受影响
  async function deleteRoom(room, confirmed) {
    const live = room.is_current ? '\n\n这是当前课堂：删除后学生不能再用这个课堂码进入，需要重新发布课堂。' : '';
    if (!confirmed) {
      const typed = window.prompt(`删除课堂“${room.name}”（${room.code}）会同时删除它的加入记录、选择、作答、作业、弹幕和匿名建议，无法恢复；本班其他课堂和点名册不受影响。建议先在“导出与清理”里导出本课堂。${live}\n\n确认删除，请输入课堂码：`);
      if (typed === null) return false;
      if (window.ClassLive.normalizeCode(typed) !== window.ClassLive.normalizeCode(room.code)) { roomNotice('课堂码不一致，没有删除。'); return false; }
    }
    const where = { classroom: Number(room.id) };
    for (const kind of ['checkins', 'choices', 'answers', 'danmaku', 'homework']) await backend.removeAll(kind, where);
    try { await backend.removeAll('feedback', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('examscores', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('debateposts', where); await backend.removeAll('debatemembers', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('debatesays', where); await backend.removeAll('debatematches', where); } catch (error) { if (!missingTable(error)) throw error; }   // 辩论台（2026-10-29）
    try { await backend.removeAll('bizvotes', where); await backend.removeAll('bizgames', where); } catch (error) { if (!missingTable(error)) throw error; }   // 经营沙盘（2026-11-03）
    try { await backend.removeAll('tlanswers', where); await backend.removeAll('tlgames', where); } catch (error) { if (!missingTable(error)) throw error; }   // 时间轴排排站·全班分队（2026-11-11）
    try { await backend.removeAll('pollvotes', where); await backend.removeAll('polls', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('bonus', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('stops', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('presence', where); } catch (error) { if (!missingTable(error)) throw error; }
    try { await backend.removeAll('puzzleguesses', where); await backend.removeAll('puzzles', where); } catch (error) { if (!missingTable(error)) throw error; }
    await backend.removeAll('classrooms', { id: Number(room.id) });
    const wasSelected = state.room && String(state.room.id) === String(room.id);
    if (wasSelected) {
      stopWatching();
      state.room = null;
      store.set(`room:${state.klass.id}`, '');
    }
    await loadRooms(wasSelected ? undefined : state.room && state.room.id);
    roomNotice(`已删除课堂“${room.name}”（${room.code}）。`);
    return true;
  }
  $('[data-room-list]').addEventListener('click', async (event) => {
    const trash = event.target.closest('[data-room-delete]');
    if (trash) {
      const room = state.rooms.find((item) => String(item.id) === trash.dataset.roomDelete);
      if (!room) return;
      trash.disabled = true;
      try { await deleteRoom(room); } catch (error) { console.error(error); roomNotice(`删除失败：${error.message || error}`); }
      trash.disabled = false;
      return;
    }
    const card = event.target.closest('[data-room]');
    if (!card) return;
    roomNotice('');
    selectRoom(state.rooms.find((item) => String(item.id) === card.dataset.room));
  });

  function selectRoom(room) {
    const changed = !state.room || !room || String(state.room.id) !== String(room.id);
    state.room = room;
    $('[data-room-delete-name]').textContent = room ? `${room.name}（${room.code}）` : '—';
    $('[data-room-confirm-code]').textContent = room ? room.code : '—';
    $('[data-clear-confirm]').value = '';
    $('[data-clear]').disabled = true;
    renderRoomList();
    updateNav();
    if (!room) { stopWatching(); return; }
    store.set(`room:${state.klass.id}`, room.id);
    renderRoom();
    renderSecAlert();
    if (changed) {
      state.openStudents.clear(); state.openTexts.clear(); setupSelectors(); subscribe(); loadPresence().then(() => { renderStats(); renderCheckins(); });
      // 学情分析选的是“当前课堂”时，换课堂也要跟着换（切换班级时 openApp 统一刷新）
      if (!state.classOpening && !$('[data-panel="insight"]').hidden && $('[data-ins-scope]').value === 'room') renderInsights(false);
    }
  }

  function renderRoom() {
    const room = state.room;
    const status = roomStatus(room);
    const badge = $('[data-room-status]');
    badge.textContent = status.text;
    badge.className = `tw-badge ${status.cls}`;
    $('[data-room-name]').textContent = room.name;
    const chapter = chapterMap.get(room.chapter);
    $('[data-room-chapter]').textContent = !chapter ? room.chapter : isExam(room.chapter)
      ? `${chapterLabel(room)}；${chapter.type}题，总分 100 分，${chapter.words} 字左右`
      : PLAIN ? `${chapterLabel(room)}（${chapter.chapter}）`
      : CONCEPT ? `${chapterLabel(room)}（教材：${chapter.chapter}）`
      : `${chapterLabel(room)}：${chapter.cases.map((item) => `案例${item.number} ${item.title}`).join('；')}`;
    const open = $('[data-room-classroom]');
    // 带上课堂编号：同一个班同时开放几个课堂时，投屏页打开的就是这一个（ClassLive.pickRoom）
    open.href = chapter ? `/${chapter.file}?class=${encodeURIComponent(state.klass.id)}&room=${encodeURIComponent(room.id)}` : '#';
    // 期中考查作业（2026-10-28 用户：“期中考查作业不需要课堂完整版，可以导出word版本的题目”）：不显示课堂完整版，换成截止时间和导出题目
    const examRoom = isExam(room.chapter);
    open.hidden = examRoom;
    $('[data-exam-tools]').hidden = !examRoom;
    if (examRoom) {
      const over = room.deadline && Date.now() > millis(room.deadline);
      $('[data-exam-deadline]').textContent = room.deadline ? `递交截止：${deadlineText(room.deadline)}${over ? '（已截止）' : ''}` : '递交截止：不限';
      $('[data-exam-deadline]').classList.toggle('is-over', Boolean(over));
    }
    // 学生版测试页：打开真实的学生页（与学生看到的完全相同），带上本课堂编号和本章解密值；
    //   页面认出教师账号后以“王不凡（化神）”身份运行，弹幕照常上投屏，作答只在本机、不计入后台（见 live-student.js）
    const preview = $('[data-room-preview]');
    const previewKey = ((window.CLASS_PREVIEW_KEYS || {})[course.slug] || {})[room.chapter];
    preview.href = `/${course.slug}/cases/${room.chapter}.html?preview=${encodeURIComponent(room.id)}${room.case_no ? `&case=${encodeURIComponent(room.case_no)}` : ''}${previewKey ? `&staticrypt_pwd=${previewKey}` : ''}`;
    // “修为境界”里的试用特效：打开本课堂的投屏页并展开试用面板（只在本机播放）
    $('[data-realm-demo]').href = chapter ? `/${chapter.file}?class=${encodeURIComponent(state.klass.id)}&demo=1` : demoHref();
    $('[data-room-code]').textContent = room.code;
    $('[data-room-code-label]').textContent = room.is_current ? '课堂码（开放中）' : '历史课堂码（未开放：学生用它只能查看，不能递交、不计修为）';
    // 课堂码右上角“学生可进入”（2026-10-28）：打开＝开放（可以同时开放几个课堂），关掉＝历史课堂
    const enter = $('[data-room-enter]');
    enter.checked = Boolean(room.is_current);
    enter.disabled = false;
    enter.closest('.tw-enter').classList.toggle('is-on', Boolean(room.is_current));
    $('[data-room-enter-text]').textContent = room.is_current ? '学生可进入' : '学生不可进入';
    $('[data-room-link]').value = joinLink(room.code);
    $('[data-rotate-code]').hidden = false;   // 历史课堂也能换码：换了以后学生就不能再用旧码进来查看
    $('[data-toggle-open]').hidden = !room.is_current;
    $('[data-toggle-open]').textContent = room.submissions_open ? '结束提交' : '重新开放提交';
    loadRevealInfo();
    const mode = $('[data-danmaku-mode]');
    mode.value = room.danmaku || 'off';
    mode.disabled = !room.is_current;
    const anon = $('[data-danmaku-anon]');
    anon.checked = Boolean(room.danmaku_anon);
    anon.disabled = !room.is_current;
    renderDanmaku();
  }

  const actionStatus = (text) => { $('[data-room-action-status]').textContent = text || ''; };
  // 投屏页也能切换弹幕、结束提交、停止课堂：回到工作台窗口时重新读取本课堂状态，避免显示旧的设置
  window.addEventListener('focus', async () => {
    if (!state.klass || !state.room || $('[data-app]').hidden) return;
    try {
      const rows = (await backend.fetchAll('classrooms', { course: course.slug })).filter((room) => sameClass(room, state.klass));
      const fresh = rows.find((room) => String(room.id) === String(state.room.id));
      if (!fresh || !['danmaku', 'danmaku_anon', 'submissions_open', 'is_current'].some((key) => fresh[key] !== state.room[key])) return;
      state.rooms = state.rooms.map((room) => (String(room.id) === String(fresh.id) ? fresh : room));
      state.room = fresh;
      renderRoom();
      renderRoomList();
    } catch (error) { console.warn(error); }
  });
  async function roomAction(label, call) {
    actionStatus(`${label}……`);
    try {
      const row = await call();
      const updated = Array.isArray(row) ? row[0] : row;
      await loadRooms(updated && updated.id ? updated.id : state.room && state.room.id);
      actionStatus(`${label}：已完成（${clock(Date.now())}）`);
    } catch (error) {
      console.error(error);
      actionStatus(`${label}失败：${error.message || error}`);
    }
  }
  $('[data-room-enter]').addEventListener('change', (event) => {
    const box = event.target;
    const on = box.checked;
    const others = state.rooms.filter((room) => room.is_current && String(room.id) !== String(state.room.id));
    const tip = on
      ? `打开“${state.room.name}”的“学生可进入”？\n\n学生可以用课堂码 ${state.room.code} 进入、递交作答、获得修为（提交也会重新开放）。${others.length ? `\n本班其他开放中的课堂（${others.map((room) => room.name).join('、')}）保持开放。` : ''}`
      : `关掉“${state.room.name}”的“学生可进入”？\n\n课堂码 ${state.room.code} 成为历史课堂：学生用它只能进来查看，不能递交、发弹幕，也不计修为；已递交的记录保留。`;
    if (!window.confirm(tip)) { box.checked = !on; return; }
    box.disabled = true;
    roomAction(on ? '打开学生可进入' : '关掉学生可进入', () => backend.rpc('ck_set_current', { p_classroom: Number(state.room.id), p_current: on }));
  });
  // ---------- 发布答案（2026-11-26）、收回答案（2026-11-27） ----------
  // 用户：“概念解答等，得等老师核对以后才在学生端显示，学生自己提前做完题不显示。然后教师端再设置一个一键发布答案的按钮，确保上完这堂课后，
  //   所有学生都能看到答案（之前设置的境界要求不变）”。课上在投屏页点题目上的“核对”逐题放开；这里一次把本课堂的解答全部放开。
  //   后台 ck_revealed_items / ck_reveal_items（题号 "*" ＝全部）。期中考查作业、不用解答题库的课程不显示；后台还没更新时也不显示。
  // 2026-11-27 用户：“教师控制台收回答案后好像不能真的收回答案。然后点复原也要能够统一收回答案。”原来“收回答案”只删掉“已发布”，课上核对放开的题照旧能看，
  //   本班上了后面的课时按钮是灰的。现在“发布答案”“收回答案”是两个按钮：收回调 ck_reveal_clear(…, true)，本课堂放开的全部收回（课上核对过的也一起），
  //   本班上了后面的课也不再自动放开（后台记 held），直到再点“发布答案”；收回以后课上再核对某道题，照常只放开那一道。
  let revealInfo = null;   // 当前课堂 {all, published, passed, held, items}；null＝还没读到，或后台没有这项功能
  let revealFor = '';
  const revealWhen = (value) => `${isoDay(millis(value)).slice(5)} ${clock(millis(value)).slice(0, 5)}`;
  function renderRevealInfo() {
    const publish = $('[data-publish-answers]');
    const retract = $('[data-retract-answers]');
    const line = $('[data-reveal-status]');
    const info = revealInfo;
    publish.hidden = !info;
    retract.hidden = !info;
    line.hidden = !info;
    if (!info) return;
    const published = Boolean(info.published);
    const held = Boolean(info.held);
    const auto = !published && Boolean(info.passed) && !held;   // 本班已经上了后面的课：自动放开
    const all = Boolean(info.all);
    const count = Array.isArray(info.items) ? info.items.length : 0;
    publish.hidden = all;
    retract.hidden = !(all || count > 0);
    publish.classList.add('is-gold');
    publish.title = '把本课堂每道题的解答一次放开给学生（照旧要先递交这道题；普通解答要到「筑基」）。下课后点一下，学生就都能看到答案';
    retract.title = '本课堂放开的解答全部收回（课上核对过的也一起收回）；本班上了后面的课也不再自动放开，要放开时再点“发布答案”';
    line.classList.toggle('is-on', all || count > 0);
    line.textContent = published ? `答案已发布（${revealWhen(info.published)}）：学生递交过的题都能看解答，境界要求不变。`
      : auto ? '本班已经上了后面的课：这次课的解答已自动放开。要收回就点“收回答案”。'
        : held ? `答案已收回（${revealWhen(info.held)}）：学生看不到解答，本班上了后面的课也不会自动放开${count ? `；之后课上又核对了 ${count} 项，这些题学生能看` : ''}。要放开时点“发布答案”。`
          : count ? `课上已核对 ${count} 项，这些题学生能看解答；其余的要等核对，或点“发布答案”。`
            : '答案还没发布：学生递交后，要等老师在投屏页核对这道题，或点“发布答案”，才能看解答。';
  }
  async function loadRevealInfo() {
    const room = state.room;
    const id = room ? String(room.id) : '';
    if (id !== revealFor) { revealInfo = null; revealFor = id; renderRevealInfo(); }
    if (!room || PLAIN || isExam(room.chapter)) return;
    try {
      const value = await backend.rpc('ck_revealed_items', { p_classroom: Number(room.id) });
      if (revealFor !== id) return;
      const res = (Array.isArray(value) ? value[0] : value) || null;
      revealInfo = res && res.status === 'ok' ? res : null;
    } catch (error) {
      if (revealFor !== id) return;
      revealInfo = null;   // 后台还没有执行“解答等老师核对”的 SQL
    }
    renderRevealInfo();
  }
  async function sendRevealAll(on) {
    if (!state.room || !revealInfo) return;
    const room = state.room;
    const label = on ? '发布答案' : '收回答案';
    const tip = on
      ? `发布“${room.name}”的全部答案？\n\n发布后，本课堂每道题的解答对学生放开：照旧要先递交这道题；普通解答要到「筑基」，四步解析不看境界。做错的题也会进入“回温”。\n发布以后可以再点“收回答案”。`
      : `收回“${room.name}”的全部答案？\n\n收回后，本课堂所有题的解答学生都看不到了：课上在投屏页核对过的也一起收回，本班上了后面的课也不再自动放开。学生已经打开的解答，页面会在一分钟内收起。\n要放开时再点“发布答案”，或课上在投屏页核对这道题。`;
    if (!window.confirm(tip)) return;
    actionStatus(`${label}……`);
    try {
      const value = on ? await backend.rpc('ck_reveal_items', { p_classroom: Number(room.id), p_items: ['*'], p_on: true })
        : await backend.rpc('ck_reveal_clear', { p_classroom: Number(room.id), p_hold: true });
      if (state.room && String(state.room.id) === String(room.id)) {
        const res = (Array.isArray(value) ? value[0] : value) || null;
        revealInfo = res && res.status === 'ok' ? res : revealInfo;
        renderRevealInfo();
      }
      actionStatus(`${label}：已完成（${clock(Date.now())}）`);
    } catch (error) {
      console.error(error);
      actionStatus(!on && missingFunction(error) ? '收回答案：后台还没更新，请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261127-收回答案.sql'
        : `${label}失败：${error.message || error}`);
    }
  }
  $('[data-publish-answers]').addEventListener('click', () => sendRevealAll(true));
  $('[data-retract-answers]').addEventListener('click', () => sendRevealAll(false));
  $('[data-toggle-open]').addEventListener('click', () => {
    const open = !state.room.submissions_open;
    if (!open && !window.confirm('结束提交后，学生不能再递交作答、发弹幕（已递交的保留）。确定结束吗？')) return;
    roomAction(open ? '重新开放提交' : '结束提交', () => backend.rpc('ck_set_open', { p_classroom: Number(state.room.id), p_open: open }));
  });
  $('[data-danmaku-mode]').addEventListener('change', (event) => {
    roomAction('设置弹幕', () => backend.rpc('ck_set_danmaku', { p_classroom: Number(state.room.id), p_mode: event.target.value }));
  });
  // 匿名：投屏不显示学生姓名；弹幕记录照常保存发送人
  $('[data-danmaku-anon]').addEventListener('change', (event) => {
    const on = event.target.checked;
    roomAction(on ? '开启弹幕匿名' : '关闭弹幕匿名', () => backend.rpc('ck_set_danmaku_anon', { p_classroom: Number(state.room.id), p_anon: on }));
  });
  // 课堂码外传时：换一个新码，旧码立即失效；已经进入本课堂的同学（设备已核对）不受影响。
  // 历史课堂（2026-10-23 起学生用历史课堂码可以进来查看）：不想让学生再查看这一课时也换码
  $('[data-rotate-code]').addEventListener('click', () => {
    const tip = state.room.is_current ? '已经进入本课堂的同学不受影响，还没进入的同学要用新码。'
      : '这是历史课堂：换码后学生不能再用旧码进来查看（新码也只能查看，不能递交、不计修为）。';
    if (!window.confirm(`更换“${state.room.name}”的课堂码？\n\n旧码 ${state.room.code} 立即失效；${tip}`)) return;
    roomAction('更换课堂码', () => backend.rpc('ck_rotate_code', { p_classroom: Number(state.room.id) }));
  });
  $('[data-copy-link]').addEventListener('click', async () => {
    const link = joinLink(state.room.code);
    try { await navigator.clipboard.writeText(link); actionStatus('加入链接已复制'); } catch (error) {
      $('[data-room-link]').select();
      actionStatus('请按 Ctrl/⌘ + C 复制加入链接');
    }
  });

  // 扫码登录：把加入链接做成二维码（vendor/qrcode-generator，本机生成，不经第三方），可全屏投屏或存成图片
  const qrDialog = $('[data-qr-dialog]');
  const qrTitle = () => [course.title, (chapterMap.get(state.room.chapter) && chapterLabel(state.room)) || state.room.name].filter(Boolean).join(' · ');
  const qrSvg = (link) => {
    const qr = window.qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 16, scalable: true, title: '扫码进入课堂' });
  };
  $('[data-show-qr]').addEventListener('click', () => {
    if (!state.room) return;
    if (!window.qrcode) { actionStatus('二维码组件没有加载成功，请刷新页面后再试'); return; }
    const link = joinLink(state.room.code);
    $('[data-qr-code]', qrDialog).innerHTML = qrSvg(link);
    $('[data-qr-room]', qrDialog).textContent = qrTitle();
    $('[data-qr-room-code]', qrDialog).textContent = state.room.code;
    $('[data-qr-link]', qrDialog).textContent = link;
    const warn = $('[data-qr-warn]', qrDialog);
    warn.hidden = Boolean(state.room.is_current);
    warn.textContent = state.room.is_current ? '' : '注意：这是历史课堂，学生用这个课堂码只能进来查看。要让学生进来上课，请先在课堂码右上角打开“学生可进入”。';
    if (typeof qrDialog.showModal === 'function') qrDialog.showModal(); else qrDialog.setAttribute('open', '');
  });
  const setMax = (on) => {
    qrDialog.classList.toggle('is-max', on);
    $('[data-qr-full]', qrDialog).textContent = on ? '退出全屏' : '全屏投屏';
  };
  const closeQr = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setMax(false);
    if (typeof qrDialog.close === 'function') qrDialog.close(); else qrDialog.removeAttribute('open');
  };
  qrDialog.addEventListener('close', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); setMax(false); });
  $('[data-qr-close]', qrDialog).addEventListener('click', closeQr);
  qrDialog.addEventListener('click', (event) => { if (event.target === qrDialog) closeQr(); });
  // 全屏投屏：先请浏览器全屏；不允许（如嵌在别的页面里）就铺满浏览器窗口，需要时再按 F11
  $('[data-qr-full]', qrDialog).addEventListener('click', () => {
    const box = $('[data-qr-box]', qrDialog);
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (qrDialog.classList.contains('is-max')) { setMax(false); return; }
    if (box.requestFullscreen) box.requestFullscreen().then(() => setMax(false)).catch(() => setMax(true));
    else setMax(true);
  });
  document.addEventListener('fullscreenchange', () => {
    const on = document.fullscreenElement === $('[data-qr-box]', qrDialog);
    $('[data-qr-full]', qrDialog).textContent = on || qrDialog.classList.contains('is-max') ? '退出全屏' : '全屏投屏';
  });
  $('[data-qr-copy]', qrDialog).addEventListener('click', async (event) => {
    const button = event.currentTarget;
    try { await navigator.clipboard.writeText(joinLink(state.room.code)); button.textContent = '已复制'; } catch (error) { button.textContent = '复制失败，请手动复制下方链接'; }
    setTimeout(() => { button.textContent = '复制加入链接'; }, 2000);
  });
  // 保存成 PNG：二维码上方写课程和课堂、下方写课堂码，方便发到班级群或放进课件
  $('[data-qr-png]', qrDialog).addEventListener('click', () => {
    const link = joinLink(state.room.code);
    const img = new Image();
    img.onload = () => {
      const W = 720, Q = 560, canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = 860;
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, canvas.height);
      g.fillStyle = '#201c18'; g.textAlign = 'center';
      g.font = '700 30px "PingFang SC", "Microsoft YaHei", sans-serif';
      g.fillText('扫码进入课堂', W / 2, 56);
      // 标题太长时缩小字号，还放不下就截短
      let size = 22, title = qrTitle();
      const fontOf = (px) => `${px}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      g.font = fontOf(size);
      while (size > 15 && g.measureText(title).width > W - 40) { size -= 1; g.font = fontOf(size); }
      while (title.length > 4 && g.measureText(title).width > W - 40) title = title.slice(0, -2) + '…';
      g.fillText(title, W / 2, 96);
      g.drawImage(img, (W - Q) / 2, 120, Q, Q);
      g.font = '700 34px "PingFang SC", "Microsoft YaHei", sans-serif';
      g.fillText(`课堂码 ${state.room.code}`, W / 2, 730);
      g.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
      g.fillStyle = '#6d6259';
      g.fillText(link, W / 2, 776);
      g.fillText('用手机相机或微信扫一扫，填写姓名、学号登录', W / 2, 812);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `课堂二维码_${state.room.code}.png`;
      a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(link));
  });

  // 发布本周课堂
  const dialog = $('[data-publish-dialog]');
  const publishForm = $('[data-publish-form]');
  // 习经一章有两个案例的：每个案例单独一项（2026-10-23 用户：“把这两个案例分开，在发布本周课堂的时候可以单独选择”），
  // 另留“两个案例一起”一项；选项值“章|案例号”
  const pad2 = (n) => String(n).padStart(2, '0');
  function fillChapterOptions() {
    publishForm.elements.chapter.innerHTML = course.chapters.map((chapter) => {
      if (PLAIN) return `<option value="${chapter.id}">${esc(chapter.cn)}　${esc(chapter.title)}</option>`;
      if (CONCEPT) return `<option value="${chapter.id}">${esc(chapter.cn)} ${esc(chapter.title)}（教材：${esc(chapter.chapter)}）</option>`;
      if (chapter.cases.length < 2) return `<option value="${chapter.id}">${esc(chapter.cn)} ${esc(chapter.title)}（案例 ${chapter.cases.map((item) => pad2(item.number)).join('、')}）</option>`;
      return `<optgroup label="${esc(chapter.cn)} ${esc(chapter.title)}">`
        + chapter.cases.map((item) => `<option value="${chapter.id}|${Number(item.number)}">${esc(chapter.cn)} · 案例 ${pad2(item.number)}　${esc(item.title || '')}</option>`).join('')
        + `<option value="${chapter.id}">${esc(chapter.cn)} · 两个案例一起（案例 ${chapter.cases.map((item) => pad2(item.number)).join('、')}）</option></optgroup>`;
    }).join('');
  }
  // 发布期中考查作业（2026-10-28 用户：“增加一个发布期中考查作业的选项，把‘课后自修’中的申论式大题作为可发布的选项”）：
  // 同一个对话框换成期中考查的题目列表；默认保留本班其他开放中的课堂（照常上课），名称预填“期中考查作业”
  let publishExam = false;
  function openPublish(exam) {
    publishExam = exam;
    $('[data-publish-error]').textContent = '';
    $('[data-publish-title]').textContent = exam ? '发布期中考查作业' : '发布本周课堂';
    $('[data-publish-unit]').textContent = exam ? '考查题目' : `本次${UNIT}`;
    $('[data-publish-exam-hint]').hidden = !exam;
    $('[data-publish-hint]').hidden = exam;
    $('[data-publish-case-hint]').hidden = exam || CONCEPT;
    $('[data-publish-deadline]').hidden = !exam;
    if (exam && !publishForm.elements.deadline.value) {
      const due = new Date();
      due.setDate(due.getDate() + 7);
      due.setHours(23, 59, 0, 0);
      publishForm.elements.deadline.value = localInput(due);
    }
    if (exam) {
      publishForm.elements.chapter.innerHTML = EXAMS.map((item) => `<option value="${item.id}">${esc(item.case)} · ${esc(item.type)}题：${esc(item.title)}</option>`).join('');
      if (state.room && isExam(state.room.chapter)) publishForm.elements.chapter.value = state.room.chapter;
      publishForm.elements.keep.checked = true;
      if (!publishForm.elements.name.value.trim()) publishForm.elements.name.value = '期中考查作业';
    } else {
      fillChapterOptions();
      if (state.room && !isExam(state.room.chapter)) publishForm.elements.chapter.value = state.room.case_no ? `${state.room.chapter}|${state.room.case_no}` : state.room.chapter;
      publishForm.elements.keep.checked = false;
      if (publishForm.elements.name.value.trim() === '期中考查作业') publishForm.elements.name.value = '';
    }
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    publishForm.elements.name.focus();
  }
  $('[data-publish-open]').addEventListener('click', () => openPublish(false));
  const examButton = $('[data-publish-exam]');
  if (examButton) {
    examButton.hidden = !EXAMS.length;
    examButton.addEventListener('click', () => openPublish(true));
  }
  $('[data-publish-cancel]').addEventListener('click', () => dialog.close());
  publishForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = publishForm.elements.name.value.trim();
    if (!name) { $('[data-publish-error]').textContent = '请填写课堂名称'; return; }
    const button = publishForm.querySelector('[type=submit]');
    button.disabled = true;
    button.textContent = '正在发布……';
    try {
      const [chapterId, caseNo] = publishForm.elements.chapter.value.split('|');
      const keep = publishForm.elements.keep.checked;
      const due = publishExam ? fromInput(publishForm.elements.deadline.value) : null;
      const row = await backend.rpc('ck_publish', { p_course: course.slug, p_name: name, p_chapter: chapterId,
        p_class: Number(state.klass.id) || state.klass.id, ...(caseNo ? { p_case: Number(caseNo) } : {}), ...(keep ? { p_keep: true } : {}) });
      const room = Array.isArray(row) ? row[0] : row;
      let dueNote = '';
      if (due && room && room.id != null) {
        try {
          await backend.rpc('ck_set_deadline', { p_classroom: Number(room.id) || room.id, p_deadline: due });
          dueNote = `，递交截止 ${deadlineText(due)}`;
        } catch (problem) {
          console.error(problem);
          dueNote = `；递交截止时间没有设置上（${missingFunction(problem) ? '后台还没有这个功能，数据库语句尚未执行' : problem.message || problem}）`;
        }
      }
      dialog.close();
      publishForm.elements.name.value = '';
      publishForm.elements.keep.checked = false;
      publishForm.elements.deadline.value = '';
      await loadRooms(room && room.id);
      actionStatus(publishExam ? `已发布期中考查作业：课堂码 ${room.code}（学生在首页用它登录进入）${dueNote}` : `已发布：课堂码 ${room.code}`);
    } catch (error) {
      console.error(error);
      $('[data-publish-error]').textContent = `发布失败：${error.message || error}`;
    } finally {
      button.disabled = false;
      button.textContent = '发布并生成课堂码';
    }
  });

  // ---------------- 期中考查作业：递交截止时间、导出题目 Word（2026-10-28 用户：“发布期中考查作业的时候可以设置递交截止日期，
  // 然后期中考查作业不需要课堂完整版，可以导出word版本的题目，导出的题目中要包含案例资料和题目，学生信息等内容参照截图”）----------------
  function localInput(value) {
    const d = value instanceof Date ? value : new Date(millis(value));
    return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function fromInput(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
  }
  function deadlineText(value) {
    const d = new Date(millis(value));
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日（周${'日一二三四五六'[d.getDay()]}）${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const deadlineDialog = $('[data-deadline-dialog]');
  const deadlineForm = $('[data-deadline-form]');
  $('[data-exam-deadline-edit]').addEventListener('click', () => {
    const room = state.room;
    if (!room) return;
    $('[data-deadline-room]').textContent = `${room.name}（${room.code}）：过了截止时间，学生就不能再递交；改晚一些可以让没交的同学补交。`;
    deadlineForm.elements.deadline.value = room.deadline ? localInput(room.deadline) : '';
    $('[data-deadline-error]').textContent = '';
    deadlineDialog.showModal();
  });
  async function saveDeadline(value) {
    const room = state.room;
    try {
      await backend.rpc('ck_set_deadline', { p_classroom: Number(room.id) || room.id, p_deadline: value });
      deadlineDialog.close();
      await loadRooms(room.id);
      actionStatus(value ? `递交截止时间已改为 ${deadlineText(value)}` : '已取消递交截止时间（不限）');
    } catch (problem) {
      console.error(problem);
      $('[data-deadline-error]').textContent = missingFunction(problem) ? '保存失败：后台还没有“递交截止时间”功能（数据库语句尚未执行）。' : `保存失败：${problem.message || problem}`;
    }
  }
  deadlineForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = fromInput(deadlineForm.elements.deadline.value);
    if (!value) { $('[data-deadline-error]').textContent = '请选好日期和时间；不想限制就点“不限截止时间”。'; return; }
    saveDeadline(value);
  });
  $('[data-deadline-clear]').addEventListener('click', () => saveDeadline(null));
  $('[data-deadline-cancel]').addEventListener('click', () => deadlineDialog.close());

  // 导出题目（Word）：标题、学生信息栏（班级、学号、姓名，下面一道金色横线）、“作答说明”框（左侧金色竖条、米色底），
  // 再是给定资料（导语和各则资料原文）、作答题目和要求，最后可附空白作答区；按课程的中文文档规范排版
  const paperDialog = $('[data-paper-dialog]');
  const paperForm = $('[data-paper-form]');
  let paperExam = null;
  $('[data-exam-paper]').addEventListener('click', () => {
    const room = state.room;
    const unit = room ? unitMap.get(room.chapter) : null;
    paperExam = unit && unit.exam;
    if (!paperExam || !Array.isArray(paperExam.materials)) { actionStatus('找不到这道题的资料，请刷新工作台后再试。'); return; }
    $('[data-paper-what]').textContent = `${paperExam.case} · ${paperExam.type}题：${paperExam.title}。导出的 Word 含学生信息栏、作答说明、给定资料（${paperExam.materials.length} 则）和作答题目。`;
    // 2026-10-29 起作答要求也写进“作答说明”框（用户：“作答要求可以放到图中‘作答说明’的位置”）
    paperForm.elements.notes.value = window.ClassLive.office.examNotes({ ...paperExam, deadline: room.deadline ? deadlineText(room.deadline) : '' }).join('\n');
    paperDialog.showModal();
  });
  $('[data-paper-cancel]').addEventListener('click', () => paperDialog.close());
  paperForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const O = window.ClassLive.office;
    const notes = paperForm.elements.notes.value.split(/\n+/).map((line) => line.trim().replace(/^\d+[.、．]\s*/, '')).filter(Boolean);
    O.save(O.docx(examQuestionDoc(paperExam, notes, paperForm.elements.space.checked)), `期中考查作业_${paperExam.case.replace(/\s+/g, '_')}_题目.docx`);
    paperDialog.close();
  });
  function examQuestionDoc(info, notes, space) {
    const O = window.ClassLive.office;
    const paras = (text) => String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => O.para(line, 'body')).join('');
    const label = (text) => `<w:p><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40" w:line="360" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>${O.runs(text, { bold: true, east: '黑体' })}</w:p>`;
    return O.para(`${course.title} · 期中考查作业`, 'title')
      + O.para(`${info.title}（${info.type}题 · 总分 100 分）`, 'subtitle')
      + O.examHead({}, notes)
      + O.para(`一、给定资料（题目出自${info.case}）`, 'h') + (info.lead ? O.para([{ text: info.lead, east: '楷体' }], 'body') : '')
      + info.materials.map((m, i) => label(`资料 ${i + 1}${m.title ? `　${m.title}` : ''}`) + paras(m.text)).join('')
      + O.para('二、作答题目', 'h') + O.para([{ text: info.question, bold: true }], 'body')
      + (space ? O.para('三、作答', 'h', { pageBreak: true }) + O.para('（在下方作答，篇幅不够可另附页。）', 'note')
        + Array.from({ length: 16 }, () => O.para('', 'plain')).join('') : '');
  }

  // ---------------- 数据同步 ----------------
  const setLive = (text, bad) => {
    const badge = $('[data-live-state]');
    badge.textContent = text;
    badge.classList.toggle('is-bad', Boolean(bad));
  };
  function stopWatching() {
    state.stops.forEach((stop) => stop());
    state.stops = [];
  }
  function subscribe() {
    stopWatching();
    state.docs = emptyDocs();
    state.auditors = [];
    renderAll();
    setLive('连接中……');
    // 实时推送不可用时后台自动改为每 5 秒刷新，这里只提示方式
    const modes = {};
    const mode = () => {
      const values = Object.values(modes);
      if (values.includes('polling')) return '每 5 秒自动刷新';
      return values.length === KINDS.length ? '实时同步中' : '已连接';
    };
    loadFeedback();
    const where = { course: course.slug, classroom: Number(state.room.id) };
    KINDS.forEach((kind) => {
      state.stops.push(backend.watch(kind, where, (docs) => {
        // 旁听（2026-11-05）：点名册外、老师允许旁听的同学的加入记录另放，不进加入名单统计、作答统计和修为
        if (kind === 'checkins') {
          state.auditors = docs.filter((doc) => doc.auditor);
          docs = docs.filter((doc) => !doc.auditor);
        }
        if (kind === 'checkins' && docs.length !== state.docs.checkins.length) presenceAfterJoin();
        state.docs[kind] = docs;
        setLive(`${mode()} · ${clock(Date.now())}`);
        renderAll();
      }, (error) => {
        console.error(error);
        setLive('读取数据失败，请刷新页面或重新登录', true);
      }, (status) => { modes[kind] = status; setLive(`${mode()} · ${clock(Date.now())}`); },
      // 作业快照较大：只取有变化的行
      kind === 'homework' ? { incremental: true } : undefined));
    });
  }

  // ---------------- 匿名建议（表里没有提交者，只有提交日期，2026-11-24 起另记几点几分；2026-11-05 起提交者另记在后台，老师读不到，只用于点赞采纳后给作者加修为） ----------------
  // 表还没建（还没执行相应的 SQL）：安静地按空表处理。“列不存在”（42703）不算，要报出来（2026-10-28 在线状态就是这样被悄悄吞掉的）
  const missingTable = (error) => /42P01|PGRST205|relation "?[\w.]+"? does not exist|Could not find the table/i.test(`${(error && error.code) || ''} ${(error && error.message) || error || ''}`);
  let feedbackRows = [];
  let feedbackProblem = '';
  let adoptNote = '';   // 刚点赞（或取消）、改标签（2026-11-26）的结果，跟在条数后面，直到下一次点赞或改标签
  // 建议的标签（2026-11-23 用户：“把现有的匿名建议箱分成两个标签，一个是课程共建，另外一个是课程疑问，学生在递交的时候要求选择其中一个标签”）：
  // build 课程共建、ask 课程疑问、''＝11 月 23 日以前提交的（未分类）。三类右边都是“赞”（5／10／20，同一位同学 7 天内靠点赞最多得 20）：
  // 11-23 上午课程共建曾是“采纳 +20”、不受 7 天上限，下午用户：“这个还是改为原来的点赞模式吧，分三档，然后‘同一人 7 天内靠点赞最多 20’”
  // 2026-11-26 加第三个标签 chat 纯唠嗑（同样可以点赞、回复）
  const FB_KINDS = { build: '课程共建', ask: '课程疑问', chat: '纯唠嗑', '': '未分类' };
  // 表情（2026-11-23 用户：“匿名建议和老师回复都可以使用修仙小道士的表情包”）：建议、往来回复里的记号〖符号〗画成图，导出表格写成“[表情·悟了]”
  const fbHtml = (text) => (window.ClassLive.stickers ? window.ClassLive.stickers.html(text, null, 'stk-inline') : esc(text));
  const fbPlain = (text) => (window.ClassLive.stickers ? window.ClassLive.stickers.plain(text) : String(text == null ? '' : text));
  const fbKindOf = (doc) => (doc && (doc.kind === 'build' || doc.kind === 'ask' || doc.kind === 'chat') ? doc.kind : '');
  let fbKind = 'all';   // 上面的标签筛选：all／build／ask／chat／none
  // 改标签的小菜单（2026-11-26，见下面 kindBadge）：开着的是哪一条、正在等后台回话、出错的说明
  const kindMenu = { id: '', busy: false, error: '' };
  // 现在显示的几条：按内容查找＋标签筛选，新的在前（列表、放大看、上一条下一条都用这一份）
  const fbShown = () => {
    const query = $('[data-fb-search]').value.trim();
    return feedbackRows.filter((doc) => (!query || String(doc.text || '').includes(query))
      && (fbKind === 'all' || fbKindOf(doc) === (fbKind === 'none' ? '' : fbKind))).sort((a, b) => Number(b.id) - Number(a.id));
  };
  async function loadFeedback() {
    if (!state.klass) return;
    // 2026-11-23 用户：“匿名建议，默认显示本班全部课堂”（teacher.html 里“本班全部课堂”默认选中）
    const rooms = ($('[data-fb-scope]').value === 'class' ? state.rooms : state.room ? [state.room] : []) || [];
    const ids = new Set(rooms.map((room) => String(room.id)));
    try {
      feedbackRows = (await backend.fetchAll('feedback', { course: course.slug })).filter((doc) => ids.has(String(doc.classroom)));
      feedbackProblem = '';
      await loadReplies();
    } catch (error) {
      console.error(error);
      feedbackRows = [];
      feedbackProblem = missingTable(error) ? '建议箱的数据表还没有建好：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261010-匿名建议.sql。' : `读取建议失败：${error.message || error}`;
    }
    renderFeedback();
    loadMoods(rooms);
  }
  // 这堂课感觉怎么样（2026-10-28）：只有各课堂每天笑脸、不高兴的人数（ck_mood_stats），看不到是谁选的
  async function loadMoods(rooms) {
    const box = $('[data-mood-box]');
    let rows = [];
    try {
      rows = await backend.rpc('ck_mood_stats', { p_classrooms: rooms.map((room) => Number(room.id) || room.id) });
    } catch (error) {
      if (!missingFunction(error)) console.warn('[这堂课感觉怎么样]', error);
      box.hidden = true;
      return;
    }
    rows = Array.isArray(rows) ? rows : [];
    const roomName = new Map(state.rooms.map((room) => [String(room.id), room.name]));
    // 2026-11-19 用户：“把每堂课的笑脸数量汇总即可，不用出现具体日期”——按课堂把各天加起来（每人每天一票，所以记“人次”）
    const total = new Map();
    rows.forEach((row) => {
      const key = String(row.classroom);
      const t = total.get(key) || { up: 0, down: 0 };
      t.up += Number(row.up) || 0;
      t.down += Number(row.down) || 0;
      total.set(key, t);
    });
    const order = rooms.map((room) => String(room.id)).filter((id) => total.has(id)).concat(Array.from(total.keys()).filter((id) => !rooms.some((room) => String(room.id) === id)));
    box.hidden = false;
    // 2026-11-22 第二档美化：每个课堂一条比例条（绿色笑脸、灰色不高兴），后面写人次和笑脸占比
    box.innerHTML = '<b>这堂课感觉怎么样</b>' + (order.map((id) => {
      const { up, down } = total.get(id);
      const n = up + down;
      const share = n ? Math.round((up * 100) / n) : 0;
      return `<div class="tw-mood-row"><span class="tw-mood-room">${esc(roomName.get(id) || '这堂课')}</span>`
        + `<span class="tw-mood-bar" role="img" aria-label="笑脸 ${up} 人次，不高兴 ${down} 人次"><i class="is-up" style="width:${share}%"></i><i class="is-down" style="width:${n ? 100 - share : 0}%"></i></span>`
        + `<span class="tw-mood-num">😊 ${up} 人次 · ☹️ ${down} 人次${n ? `<small>笑脸 ${share}%</small>` : ''}</span></div>`;
    }).join('') || '<small>还没有同学选。学生在建议箱上方点笑脸或不高兴的脸，每人每天一票、可以改。</small>');
  }
  // 建议是针对一堂课的：习经一个案例（两课时）就是一次课，政经一个案例一次课，用案例标明是哪次课
  const sessionLabel = (caseNo) => {
    const key = String(caseNo || '');
    const info = caseMap.get(key) || unitMap.get(`case${key}`);
    return info ? `案例${key} ${info.title} 那次课` : key && key !== '00' ? `案例${key} 那次课` : '本堂课';
  };
  function renderFeedback() {
    const query = $('[data-fb-search]').value.trim();
    const roomName = new Map(state.rooms.map((room) => [String(room.id), room.name]));
    const count = (key) => feedbackRows.filter((doc) => fbKindOf(doc) === key).length;
    const nBuild = count('build'), nAsk = count('ask'), nChat = count('chat'), nOld = count('');
    if (fbKind === 'none' && !nOld) fbKind = 'all';
    const rows = fbShown();
    const liked = feedbackRows.filter((doc) => Number(doc.adopted) > 0).length;
    const waiting = feedbackRows.filter((doc) => awaitingReply(doc.id)).length;
    // 标签筛选（2026-11-23）：全部／课程共建／课程疑问（／未分类），带条数
    const chips = [['all', '全部', feedbackRows.length], ['build', '课程共建', nBuild], ['ask', '课程疑问', nAsk], ['chat', '纯唠嗑', nChat]].concat(nOld ? [['none', '未分类', nOld]] : []);
    $('[data-fb-kinds]').innerHTML = feedbackRows.length ? chips.map(([key, label, n]) => `<button type="button" class="tw-fb-kindbtn is-${key}" data-fb-kind="${key}" aria-pressed="${fbKind === key}">${label}<b>${n}</b></button>`).join('') : '';
    const kinds = [`课程共建 ${nBuild} 条`, `课程疑问 ${nAsk} 条`, `纯唠嗑 ${nChat} 条`].concat(nOld ? [`未分类 ${nOld} 条（11 月 23 日以前提交的）`] : []);
    $('[data-fb-summary]').textContent = feedbackProblem || (feedbackRows.length ? `共 ${feedbackRows.length} 条：${kinds.join('、')}${liked ? `；已点赞 ${liked} 条` : ''}${query || fbKind !== 'all' ? `；符合条件 ${rows.length} 条` : ''}（新的在前）。${waiting ? `有 ${waiting} 条建议的作者回复了你（“回复”按钮标红）。` : ''}${adoptNote}` : '');
    // 改标签的菜单：那一条不在这次显示的列表里了（删了、按内容查找时被筛掉）就收起；焦点在标签或菜单上时，重画后放回同一处（20 秒一次的自动刷新也会重画）
    if (kindMenu.id && !rows.some((doc) => String(doc.id) === kindMenu.id)) Object.assign(kindMenu, { id: '', busy: false, error: '' });
    const focusWrap = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.tw-fb-kindwrap') : null;
    const keepFocus = focusWrap ? { id: focusWrap.querySelector('[data-fb-kindset]').dataset.fbKindset, pick: document.activeElement.dataset.fbKindpick || '' } : null;
    // 2026-11-22 第二档美化：一条建议一张卡片——左边日期、课堂、哪次课，中间建议（点击放大），往来回复缩进排在下面，右边回复、点赞、删除
    $('[data-fb-rows]').innerHTML = rows.map((doc) => {
      const room = roomName.get(String(doc.classroom)) || '';
      const kind = fbKindOf(doc);
      return `<article class="tw-fb-card is-k-${kind || 'none'}${Number(doc.adopted) > 0 ? ' is-liked' : ''}${awaitingReply(doc.id) ? ' is-waiting' : ''}">
        <div class="tw-fb-meta">${kindBadge(doc)}<time>${esc(fbTime(doc))}</time>${room ? `<span>${esc(room)}</span>` : ''}<small>${esc(sessionLabel(doc.case_no))}</small></div>
        <div class="tw-fb-main"><p class="tw-fb-text" data-fb-zoom="${esc(doc.id)}" tabindex="0" title="点击放大（投屏时学生看得清楚）">${fbHtml(doc.text)}</p>${threadHtml(doc.id)}</div>
        <div class="tw-fb-actions">${replyButton(doc)}${likeButton(doc)}<button type="button" class="tw-trash" data-fb-delete="${esc(doc.id)}" title="删除这条建议" aria-label="删除这条建议">${TRASH_ICON}</button></div></article>`;
    }).join('')
      || `<p class="empty">${feedbackProblem ? '—' : query ? '没有符合条件的建议。' : fbKind !== 'all' && feedbackRows.length ? '这个标签下还没有建议。'
        : '还没有收到建议。学生在每次课页面最后的“匿名建议箱”（或自己页面面板上的“建议箱”按钮）里选好标签——课程共建、课程疑问或纯唠嗑——提交后，会出现在这里。'}</p>`;
    $('[data-tab="feedback"]').textContent = feedbackRows.length ? `匿名建议（${feedbackRows.length}）` : '匿名建议';
    const badge = keepFocus && kindButtonOf(keepFocus.id);
    if (badge) (($$('[data-fb-kindpick]', badge.parentElement).find((item) => item.dataset.fbKindpick === keepFocus.pick)) || badge).focus();
  }
  // 放大看一条建议（2026-11-05 用户：“‘匿名建议’，点击每一条建议也可以放大显示，让学生能看得清楚”）：
  // 全屏大字显示，字号按字数自动调；← → 键或两边的箭头看上一条、下一条（按表格现在的顺序和搜索条件），Esc 或点空白处关闭。不显示点赞情况
  function zoomFeedback(id) {
    const I = window.ClassLiveInsights;
    if (!I || !I.lightbox) return;
    const list = fbShown();
    let at = Math.max(0, list.findIndex((doc) => String(doc.id) === String(id)));
    if (!list.length) return;
    const panel = document.createElement('div');
    panel.className = 'tw-fb-zoom';
    const roomName = new Map(state.rooms.map((room) => [String(room.id), room.name]));
    const size = (text) => { const n = Array.from(String(text || '')).length; return n <= 24 ? 64 : n <= 60 ? 52 : n <= 120 ? 44 : n <= 220 ? 36 : n <= 400 ? 30 : 26; };
    const paint = () => {
      const doc = list[at];
      panel.innerHTML = `<div class="tw-fb-zoom-meta"><span>${fbKindOf(doc) ? FB_KINDS[fbKindOf(doc)] : '匿名建议'}</span>${esc(fbTime(doc))}${roomName.get(String(doc.classroom)) ? ` · ${esc(roomName.get(String(doc.classroom)))}` : ''} · ${esc(sessionLabel(doc.case_no))}<b>${at + 1} / ${list.length}</b></div>
        <p class="tw-fb-zoom-text" style="--fz:${size(doc.text)}px">${fbHtml(doc.text)}</p>
        <div class="tw-fb-zoom-nav"><button type="button" data-fbz="-1"${at === 0 ? ' disabled' : ''} aria-label="上一条">‹ 上一条</button><button type="button" data-fbz="1"${at === list.length - 1 ? ' disabled' : ''} aria-label="下一条">下一条 ›</button></div>`;
    };
    const step = (d) => { const next = at + d; if (next < 0 || next >= list.length) return; at = next; paint(); };
    panel.addEventListener('click', (event) => { const b = event.target.closest('[data-fbz]'); if (b && !b.disabled) step(Number(b.dataset.fbz)); });
    paint();
    I.lightbox(panel, { label: '放大看匿名建议', hint: '← → 看上一条、下一条 · 点空白处或按 Esc 关闭',
      onKey: (event) => { if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); } else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); } } });
  }
  $('[data-fb-rows]').addEventListener('click', (event) => {
    const cell = event.target.closest('[data-fb-zoom]');
    if (cell && !(window.getSelection && String(window.getSelection()))) zoomFeedback(cell.dataset.fbZoom);
  });
  $('[data-fb-rows]').addEventListener('keydown', (event) => {
    const cell = event.target.closest('[data-fb-zoom]');
    if (cell && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); zoomFeedback(cell.dataset.fbZoom); }
  });
  // 点赞采纳（2026-11-05 用户：“对于匿名建议，教师工作台老师也可以进行点赞(在删除按钮左边增加一个点赞按钮)，然后有一个弹出框可以选择加不同修为分（5、10、20），
  // 学生下次登陆的时候弹出一条信息”）：后台 ck_adopt_feedback 按另记的提交者给作者加修为（ck_bonus kind adopt，计入“额外加分”），
  // 老师仍看不到是谁写的；作者下次打开章节页时弹出“建议已被采纳”。可以改分或取消点赞；11-05 之前提交的建议没有记作者，不能加
  // 回复匿名建议（2026-11-19 用户：“对学生的建议，除点赞外，再增加一个回复的功能，回复后在学生下次登陆的时候弹出回复的对话框，学生点击关闭才关闭显示。
  // 同时学生也可以在该对话框中回复我的回复，同时也同步到教师控制台中。”）：后台 ck_reply_feedback／ck_feedback_replies_for／ck_delete_feedback_reply，
  // 往来回复显示在建议下面；作者点“关闭”以后显示“作者已看到”；作者回复了你（最后一条是作者的）时“回复”按钮标红。11-05 之前的建议没有记作者，不能回复
  let feedbackReplies = new Map();
  let repliesMissing = false;
  async function loadReplies() {
    const ids = feedbackRows.map((doc) => Number(doc.id) || doc.id);
    if (!ids.length) { feedbackReplies = new Map(); return; }
    try {
      const rows = await backend.rpc('ck_feedback_replies_for', { p_ids: ids });
      const map = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => { const key = String(row.feedback_id); if (!map.has(key)) map.set(key, []); map.get(key).push(row); });
      feedbackReplies = map;
      repliesMissing = false;
    } catch (error) {
      if (missingFunction(error)) repliesMissing = true; else console.warn('[建议回复]', error);
    }
  }
  const replyTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const repliesOf = (id) => feedbackReplies.get(String(id)) || [];
  const awaitingReply = (id) => { const list = repliesOf(id); return list.length > 0 && !list[list.length - 1].by_teacher; };
  // 作者看没看到（2026-11-23 晚 用户：“匿名建议中的作者未看到和作者已看到最好能做下区分，让老师一眼就知道学生看到回复没有”）：
  // 已看到＝绿色标签带双勾（悬停显示看到的时间），还没看到＝橙色标签带圆点
  const seenTag = (r) => (r.seen_at
    ? `<em class="tw-fb-seen is-seen" title="作者 ${esc(replyTime(r.seen_at))} 看到了这条回复"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2.5 12.5 4.2 4.2 8.6-9.4"/><path d="m11.2 15.9.8.8 9.5-10"/></svg>作者已看到</em>`
    : '<em class="tw-fb-seen is-unseen" title="作者还没看到：作者下次打开课程页面时会弹出这条回复"><i aria-hidden="true"></i>作者还没看到</em>');
  function threadLine(r, removable) {
    return `<p class="${r.by_teacher ? 'is-teacher' : 'is-student'}"><b>${r.by_teacher ? '我' : '作者'}</b><span>${fbHtml(r.text)}</span>`
      + `<small>${esc(replyTime(r.created_at))}</small>${r.by_teacher ? seenTag(r) : ''}`
      + (removable && r.by_teacher ? `<button type="button" class="tw-link" data-reply-remove="${esc(r.id)}">撤回</button>` : '') + '</p>';
  }
  function threadHtml(id) {
    const list = repliesOf(id);
    return list.length ? `<div class="tw-fb-thread">${list.map((r) => threadLine(r, false)).join('')}</div>` : '';
  }
  function replyButton(doc) {
    const list = repliesOf(doc.id);
    const waiting = awaitingReply(doc.id);
    return `<button type="button" class="tw-fb-reply${waiting ? ' is-new' : ''}" data-fb-reply="${esc(doc.id)}"
      title="${waiting ? '作者回复了你，点开看看' : '回复这条建议：作者下次打开课程页面时会弹出你的回复'}">回复${list.length ? `<i>${list.length}</i>` : ''}</button>`;
  }
  const replyDialog = $('[data-reply-dialog]');
  let replyId = '';
  // 回复框下面的“表情”按钮（live-stickers.js 的 attach）
  const replyTools = replyDialog.querySelector('[data-reply-tools]');
  const replyStk = window.ClassLive.stickers && window.ClassLive.stickers.attach && replyTools
    ? window.ClassLive.stickers.attach(replyDialog.querySelector('[data-reply-input]'), { host: replyTools, after: replyTools }) : null;
  const replySay = (text) => { replyDialog.querySelector('[data-reply-error]').textContent = text || ''; };
  function paintReplyThread() {
    const list = repliesOf(replyId);
    replyDialog.querySelector('[data-reply-thread]').innerHTML = list.length ? list.map((r) => threadLine(r, true)).join('') : '<p class="tw-hint">还没有往来回复。</p>';
  }
  function openReply(id) {
    const doc = feedbackRows.find((item) => String(item.id) === String(id));
    if (!doc) return;
    replyId = String(id);
    replyDialog.querySelector('[data-reply-text]').innerHTML = fbHtml(doc.text || '');
    replyDialog.querySelector('[data-reply-input]').value = '';
    if (replyStk) { replyStk.refresh(); replyStk.close(); }
    paintReplyThread();
    replySay(repliesMissing ? '后台还没有回复功能：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261119-建议回复.sql。' : '');
    if (typeof replyDialog.showModal === 'function') replyDialog.showModal(); else replyDialog.setAttribute('open', '');
    replyDialog.querySelector('[data-reply-input]').focus();
  }
  async function sendReply() {
    const input = replyDialog.querySelector('[data-reply-input]');
    const text = input.value.trim();
    if (!text) { replySay('先写好回复。'); return; }
    const button = replyDialog.querySelector('[data-reply-send]');
    button.disabled = true;
    replySay('');
    try {
      const result = await backend.rpc('ck_reply_feedback', { p_id: Number(replyId) || replyId, p_text: text });
      const row = Array.isArray(result) ? result[0] : result;
      if (row && row.status === 'no_author') { replySay('这条是 11 月 5 日之前提交的建议，后台没有记作者，回复送不到写建议的同学那里。'); return; }
      input.value = '';
      if (replyStk) { replyStk.refresh(); replyStk.close(); }
      await loadReplies();
      paintReplyThread();
      renderFeedback();
    } catch (error) {
      console.error(error);
      replySay(missingFunction(error) ? '后台还没有回复功能：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261119-建议回复.sql。' : `没有发出去：${error.message || error}`);
    } finally {
      button.disabled = false;
    }
  }
  replyDialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-reply-close]')) { replyDialog.close(); return; }
    if (event.target.closest('[data-reply-send]')) { sendReply(); return; }
    const remove = event.target.closest('[data-reply-remove]');
    if (remove && window.confirm('撤回这条回复？作者还没看到的就不会再弹出；已经看到的，作者那里也不再显示。')) {
      remove.disabled = true;
      try {
        await backend.rpc('ck_delete_feedback_reply', { p_id: Number(remove.dataset.replyRemove) || remove.dataset.replyRemove });
        await loadReplies();
        paintReplyThread();
        renderFeedback();
      } catch (error) {
        console.error(error);
        replySay(`撤回失败：${error.message || error}`);
      }
    }
  });
  replyDialog.querySelector('[data-reply-input]').addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); sendReply(); } });
  const LIKE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z"/><path d="M7 10l4-7a2.5 2.5 0 0 1 3 3l-1 4h5.5a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.2 21H7"/></svg>';
  function likeButton(doc) {
    const points = Number(doc.adopted) || 0;
    return `<button type="button" class="tw-fb-like${points ? ' is-on' : ''}" data-fb-like="${esc(doc.id)}" aria-pressed="${points ? 'true' : 'false'}"
      title="${points ? `已点赞采纳，选的是 +${points} 修为（同一位同学 7 天内靠点赞最多得 20；点一下可改分或取消）` : '点赞采纳：给写这条建议的同学加修为'}">${LIKE_ICON}<span>${points ? `+${points}` : '赞'}</span></button>`;
  }
  const adoptDialog = $('[data-adopt-dialog]');
  let adoptId = '';
  const adoptSay = (text) => { adoptDialog.querySelector('[data-adopt-error]').textContent = text || ''; };
  function openAdopt(id) {
    const doc = feedbackRows.find((item) => String(item.id) === String(id));
    if (!doc) return;
    adoptId = String(id);
    const points = Number(doc.adopted) || 0;
    adoptDialog.querySelector('[data-adopt-text]').textContent = String(doc.text || '').slice(0, 140) + (String(doc.text || '').length > 140 ? '…' : '');
    adoptDialog.querySelector('[data-adopt-title]').textContent = fbKindOf(doc) ? `点赞这条“${FB_KINDS[fbKindOf(doc)]}”` : '点赞采纳这条建议';
    adoptDialog.querySelectorAll('[data-adopt-points]').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.adoptPoints) === points));
      button.disabled = false;
    });
    adoptDialog.querySelector('[data-adopt-unlike]').hidden = !points;
    adoptSay('');
    if (typeof adoptDialog.showModal === 'function') adoptDialog.showModal(); else adoptDialog.setAttribute('open', '');
  }
  async function adopt(points) {
    const buttons = Array.from(adoptDialog.querySelectorAll('button'));
    buttons.forEach((button) => { button.disabled = true; });
    adoptSay('');
    try {
      let result = await backend.rpc('ck_adopt_feedback', { p_id: Number(adoptId) || adoptId, p_points: points });
      if (Array.isArray(result)) result = result[0];
      if (result && result.status === 'no_author') {
        adoptSay('这条建议是 11 月 5 日之前提交的，后台没有记下作者，不能给作者加修为。');
        return;
      }
      const doc = feedbackRows.find((item) => String(item.id) === adoptId);
      if (doc) doc.adopted = points;
      // 2026-11-20 起同一位同学 7 天内靠点赞最多得 20 修为：后台只告诉这里“已记下”，不说实际加了多少（否则能看出几条建议出自同一个人）
      adoptNote = points
        ? `刚才的点赞已记下：按 +${points} 修为加给写这条建议的同学（“修为境界”重新结算后计入），作者下次打开页面时会看到提示。同一位同学 7 天内靠点赞最多得 20 修为，超出的部分后台自动不计。`
        : '刚才已取消点赞，作者的这份修为已撤回。';
      adoptDialog.close();
      renderFeedback();
    } catch (error) {
      console.error(error);
      adoptSay(missingFunction(error) ? '后台还没有点赞功能：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261105-建议采纳.sql。'
        : /课程共建只能采纳/.test(String(error && error.message)) ? '后台还是上午“课程共建只能采纳 +20”的规则：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261123-建议点赞复原.sql。' : `没有成功：${error.message || error}`);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  }
  adoptDialog.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-adopt-points]');
    if (pick) { adopt(Number(pick.dataset.adoptPoints)); return; }
    if (event.target.closest('[data-adopt-unlike]')) { adopt(0); return; }
    if (event.target.closest('[data-adopt-close]')) adoptDialog.close();
  });
  // 改标签（2026-11-26 用户：“教师工作台中，教师可以调整学生发的匿名建议的标签，以防有些学生不知道或者选错了标签”）：
  // 卡片左上角的标签是个按钮，点一下（或按 ↓）弹出小菜单——课程共建／课程疑问／纯唠嗑，选了就经后台 ck_set_feedback_kind 改
  // （建议和另记的提交者那一行一起改，学生自己“我提过的建议”里随之显示新标签）。“未分类”的也可以补上标签，不能改回未分类。
  // 点赞加的修为不看标签，改了不影响。菜单里 ↑ ↓ 选、回车确定、Esc 收起；点菜单外面也收起
  const KIND_PICKS = ['build', 'ask', 'chat'];
  const KIND_TIP = '点一下改标签（学生选错时可以改）';
  function kindBadge(doc) {
    const kind = fbKindOf(doc);
    const id = String(doc.id);
    const open = kindMenu.id === id;
    const menu = open ? `<div class="tw-fb-kindpop"><div class="tw-fb-kindmenu" role="menu" aria-label="把标签改成"${kindMenu.busy ? ' aria-busy="true"' : ''}>${KIND_PICKS.map((key) => `<button type="button" role="menuitemradio" class="is-${key}" data-fb-kindpick="${key}" aria-checked="${key === kind}"${kindMenu.busy ? ' aria-disabled="true"' : ''}>${FB_KINDS[key]}</button>`).join('')}</div>${kindMenu.error ? `<p class="tw-fb-kinderr" role="alert">${esc(kindMenu.error)}</p>` : ''}</div>` : '';
    return `<div class="tw-fb-kindwrap"><button type="button" class="tw-fb-kind is-${kind || 'none'}" data-fb-kindset="${esc(id)}" aria-haspopup="menu" aria-expanded="${open}" title="${KIND_TIP}" aria-label="标签：${FB_KINDS[kind]}。${KIND_TIP}">${FB_KINDS[kind]}<i aria-hidden="true"></i></button>${menu}</div>`;
  }
  const kindButtonOf = (id) => $$('[data-fb-rows] [data-fb-kindset]').find((button) => button.dataset.fbKindset === String(id));
  // 只重画这一条的标签和菜单，别的卡片不动。focus：'badge' 放回标签；'menu' 放到菜单里打勾的一项（没有就第一项）；也可以是某个标签的键名
  function paintKind(id, focus) {
    const button = kindButtonOf(id);
    const doc = feedbackRows.find((item) => String(item.id) === String(id));
    if (!button || !doc) return;
    button.parentElement.outerHTML = kindBadge(doc);
    const badge = kindButtonOf(id);
    if (!badge || !focus) return;
    const items = $$('[data-fb-kindpick]', badge.parentElement);
    const item = focus === 'menu' ? items.find((one) => one.getAttribute('aria-checked') === 'true') || items[0] : items.find((one) => one.dataset.fbKindpick === focus);
    (focus === 'badge' ? badge : item || badge).focus();
  }
  function openKindMenu(id) {
    const before = kindMenu.id;
    Object.assign(kindMenu, { id: String(id), busy: false, error: '' });
    if (before && before !== String(id)) paintKind(before);
    paintKind(id, 'menu');
  }
  function closeKindMenu(focusBadge) {
    const id = kindMenu.id;
    if (!id) return;
    Object.assign(kindMenu, { id: '', busy: false, error: '' });
    paintKind(id, focusBadge ? 'badge' : '');
  }
  async function setKind(id, kind) {
    const doc = feedbackRows.find((item) => String(item.id) === String(id));
    if (!doc || !KIND_PICKS.includes(kind)) return;
    const from = fbKindOf(doc);
    if (from === kind) { closeKindMenu(true); return; }
    Object.assign(kindMenu, { busy: true, error: '' });
    paintKind(id, kind);   // 菜单先变灰（焦点留在选的那一项），等后台回话
    try {
      let result = await backend.rpc('ck_set_feedback_kind', { p_id: Number(id) || id, p_kind: kind });
      if (Array.isArray(result)) result = result[0];
      if (kindMenu.id === String(id)) Object.assign(kindMenu, { id: '', busy: false, error: '' });
      if (result && result.status === 'missing') {
        adoptNote = '刚才要改标签的那条建议已经删除了，列表已刷新。';
        await loadFeedback();
        return;
      }
      const now = (result && result.kind) || kind;
      // 等回话的时候列表可能刚自动刷新过：按编号找现在这一份来改
      const row = feedbackRows.find((item) => String(item.id) === String(id));
      if (row) row.kind = now;
      adoptNote = `刚才已把一条建议的标签由“${FB_KINDS[from]}”改为“${FB_KINDS[now]}”，学生自己“我提过的建议”里也显示新标签。`;
      renderFeedback();
      let badge = kindButtonOf(id);
      if (!badge && fbKind !== 'all') {   // 按标签筛选着：这条不在当前标签下了，说一声去哪了
        adoptNote += `这条现在在“${FB_KINDS[now]}”标签下。`;
        renderFeedback();
        badge = kindButtonOf(id);
      }
      // 焦点放回这条的标签（这条筛掉了就放到它现在所在的标签筛选按钮上）；老师已经点到别处去了（包括又打开了别的卡片的菜单）就不动
      const active = document.activeElement;
      const target = badge || $(`[data-fb-kinds] [data-fb-kind="${now}"]`);
      if (target && (!active || active === document.body || (badge && active.closest('.tw-fb-kindwrap') === badge.parentElement))) target.focus();
    } catch (error) {
      console.error(error);
      const say = missingFunction(error) ? '后台还没有改标签的功能：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261126-建议标签调整.sql。' : `改标签没有成功：${error.message || error}`;
      if (kindMenu.id === String(id)) {   // 菜单还开着：说明写在菜单里，可以再选一次
        Object.assign(kindMenu, { busy: false, error: say });
        paintKind(id, kind);
      } else {   // 菜单已经收起了：写在条数那一行（同删除失败）
        $('[data-fb-summary]').textContent = say;
      }
    }
  }
  $('[data-fb-rows]').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-fb-kindpick]');
    if (pick) { if (!kindMenu.busy && kindMenu.id) setKind(kindMenu.id, pick.dataset.fbKindpick); return; }
    const badge = event.target.closest('[data-fb-kindset]');
    if (!badge) return;
    if (kindMenu.id === badge.dataset.fbKindset) closeKindMenu(true); else openKindMenu(badge.dataset.fbKindset);
  });
  $('[data-fb-rows]').addEventListener('keydown', (event) => {
    const badge = event.target.closest('[data-fb-kindset]');
    if (badge) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openKindMenu(badge.dataset.fbKindset); }
      else if (event.key === 'Escape' && kindMenu.id === badge.dataset.fbKindset) { event.preventDefault(); closeKindMenu(true); }
      return;
    }
    const menu = event.target.closest('.tw-fb-kindmenu');
    if (!menu) return;
    const items = $$('[data-fb-kindpick]', menu);
    const at = items.indexOf(event.target);
    if (event.key === 'Escape' || (event.key === 'Tab' && event.shiftKey)) { event.preventDefault(); closeKindMenu(true); }   // 收起，焦点回到标签上
    else if (event.key === 'Tab') closeKindMenu(true);   // 焦点先回到标签上，再照常移到下一个
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && items.length) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
  document.addEventListener('click', (event) => { if (kindMenu.id && !event.target.closest('.tw-fb-kindwrap')) closeKindMenu(false); });
  $('[data-fb-scope]').addEventListener('change', loadFeedback);
  $('[data-fb-search]').addEventListener('input', renderFeedback);
  $('[data-fb-kinds]').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-fb-kind]');
    if (!chip) return;
    fbKind = chip.dataset.fbKind;
    renderFeedback();
  });
  $('[data-tab="feedback"]').addEventListener('click', loadFeedback);
  // 打开“匿名建议”标签时每 20 秒刷新一次
  setInterval(() => { if (state.room && !$('[data-panel="feedback"]').hidden) loadFeedback(); }, 20000);
  $('[data-fb-rows]').addEventListener('click', async (event) => {
    const replyBtn = event.target.closest('[data-fb-reply]');
    if (replyBtn) { openReply(replyBtn.dataset.fbReply); return; }
    const like = event.target.closest('[data-fb-like]');
    if (like) { openAdopt(like.dataset.fbLike); return; }
    const trash = event.target.closest('[data-fb-delete]');
    if (!trash) return;
    const id = trash.dataset.fbDelete;
    const doc = feedbackRows.find((item) => String(item.id) === id);
    if (!window.confirm(`确定删除这条建议吗？删除后无法恢复。\n\n${doc ? String(doc.text).slice(0, 60) : ''}`)) return;
    trash.disabled = true;
    try {
      await backend.removeAll('feedback', { id: Number(id) || id });
      await loadFeedback();
    } catch (error) {
      console.error(error);
      trash.disabled = false;
      $('[data-fb-summary]').textContent = `删除失败：${error.message || error}`;
    }
  });
  $('[data-fb-export]').addEventListener('click', () => {
    const roomName = new Map(state.rooms.map((room) => [String(room.id), room.name]));
    const rows = feedbackRows.slice().sort((a, b) => Number(a.id) - Number(b.id))
      .map((doc, index) => [index + 1, fbTime(doc), roomName.get(String(doc.classroom)) || '', sessionLabel(doc.case_no), FB_KINDS[fbKindOf(doc)], fbPlain(doc.text), Number(doc.adopted) || '',
        repliesOf(doc.id).map((r) => `${r.by_teacher ? '老师' : '作者'}（${replyTime(r.created_at)}）：${fbPlain(r.text)}`).join('\n')]);
    const scope = $('[data-fb-scope]').value === 'class' ? '本班全部课堂' : safeName((state.room && state.room.name) || '本课堂');
    download(`${course.title}_${safeName(state.klass.name)}_${scope}_匿名建议_${window.ClassLive.today()}.csv`,
      csv([['序号', '提交时间', '课堂', '哪次课', '标签', '建议', '点赞加修为', '往来回复'], ...rows]));
  });

  // ---------------- 期中考查：批阅与导出（2026-10-28 用户：“期中考查作业要可以一键导出为word文档，导出的文档中包含学生的学号、姓名等信息。
  // 教师工作台中也设置一个期中考查的板块，可以直接点开学生的作业，然后进行打分，然后可以以excel表格的形式导出分数，姓名排序等按照点名册”） ----------------
  // 作业：期中作业课堂（examNN）里每个学号最早递交的那份（ck_homework 的 exam）；分数：ck_exam_scores（只经 ck_save_exam_score 写）
  const exam = { room: null, subs: new Map(), marks: new Map(), problem: '', current: -1, order: [] };
  const examRooms = () => (state.rooms || []).filter((room) => isExam(room.chapter));
  const examInfo = () => (exam.room ? chapterMap.get(exam.room.chapter) || {} : {});
  const examUnit = () => (exam.room ? unitMap.get(exam.room.chapter) : null);
  const examWords = (text) => String(text || '').replace(/\s/g, '').length;
  const examAt = (value) => { const ms = millis(value); return ms ? `${isoDay(ms)} ${clock(ms).slice(0, 5)}` : ''; };
  const examScore = (mark) => (mark && mark.score != null && mark.score !== '' ? Number(mark.score) : null);
  function fillExamRooms() {
    const select = $('[data-exam-room]');
    const rooms = examRooms();
    const keep = select.value;
    select.innerHTML = rooms.map((room) => {
      const info = chapterMap.get(room.chapter) || {};
      return `<option value="${esc(room.id)}">${esc(room.name)} · ${esc(info.case || room.chapter)} · ${esc(room.code)}${room.is_current ? '' : '（未开放）'}</option>`;
    }).join('') || '<option value="">还没有发布期中考查作业</option>';
    const wanted = rooms.find((room) => String(room.id) === keep)
      || rooms.find((room) => state.room && String(room.id) === String(state.room.id)) || rooms[0];
    if (wanted) select.value = String(wanted.id);
  }
  async function loadExam() {
    if (!CONCEPT || !state.klass) return;
    fillExamRooms();
    exam.room = examRooms().find((room) => String(room.id) === $('[data-exam-room]').value) || null;
    exam.subs = new Map();
    exam.marks = new Map();
    exam.problem = '';
    if (exam.room) {
      try {
        const where = { classroom: Number(exam.room.id) || exam.room.id };
        const docs = await backend.fetchAll('homework', { course: course.slug, ...where });
        docs.forEach((doc) => {
          const entry = (doc.payload || {}).exam;
          if (!isEntry(entry) || !filled(entry.v)) return;
          const key = sidKey(doc.sid);
          const old = exam.subs.get(key);
          if (!old || millis(entry.at) < millis(old.at)) exam.subs.set(key, { sid: doc.sid, name: doc.name, class_name: doc.class_name || '', text: String(entry.v), at: entry.at });
        });
        try {
          (await backend.fetchAll('examscores', where)).forEach((row) => exam.marks.set(sidKey(row.sid), row));
        } catch (error) {
          if (!missingTable(error)) throw error;
          exam.problem = '后台还没有打分用的数据表：请先执行 tools/cloudbase-pg-20261028-登录与课堂开放.sql。现在可以查看和导出作业，暂时不能保存分数。';
        }
      } catch (error) {
        console.error(error);
        exam.problem = `读取期中考查作业失败：${failReason(error)}`;
      }
    }
    renderExam();
  }
  // 按点名册顺序（点名册外递交了的排在最后）；没有点名册时按学号
  function examList() {
    const roster = rosterOf();
    const list = roster.map((person, index) => ({ no: index + 1, sid: person.sid, name: person.name, class_name: person.class || person.class_name || '' }));
    const known = new Set(list.map((person) => sidKey(person.sid)));
    Array.from(exam.subs.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, sub]) => {
      if (!known.has(key)) list.push({ no: null, sid: sub.sid, name: sub.name, class_name: sub.class_name, outside: true });
    });
    return list.map((person) => {
      const sub = exam.subs.get(sidKey(person.sid)) || null;
      return { ...person, class_name: person.class_name || (sub && sub.class_name) || '', sub, mark: exam.marks.get(sidKey(person.sid)) || null };
    });
  }
  // 点名册人数、点名册里未递交的人数、点名册外递交的人数（未递交不算点名册外的人）
  function examTally(list) {
    const inRoster = list.filter((person) => !person.outside);
    return { roster: inRoster.length, missing: inRoster.filter((person) => !person.sub).length, outside: list.filter((person) => person.outside && person.sub).length };
  }
  function renderExam() {
    if (!CONCEPT) return;
    const body = $('[data-exam-rows]');
    const summary = $('[data-exam-summary]');
    const buttons = ['[data-exam-xlsx]', '[data-exam-docx]'].map((selector) => $(selector));
    buttons.forEach((button) => { button.disabled = !exam.room; });
    if (!exam.room) {
      summary.textContent = exam.problem || '本班还没有发布期中考查作业：在“我的课堂”右上角点“发布期中考查作业”。';
      body.innerHTML = '<tr><td colspan="9" class="empty">还没有期中考查作业。</td></tr>';
      return;
    }
    const list = examList();
    exam.order = list;
    const done = list.filter((person) => person.sub);
    const scored = list.filter((person) => examScore(person.mark) != null);
    const avg = scored.length ? (scored.reduce((sum, person) => sum + examScore(person.mark), 0) / scored.length).toFixed(1) : '—';
    const info = examInfo();
    const tally = examTally(list);
    const over = exam.room.deadline && Date.now() > millis(exam.room.deadline);
    summary.textContent = (exam.problem ? `${exam.problem} ` : '')
      + `${info.case || ''} · ${info.title || ''}：${tally.roster ? `点名册 ${tally.roster} 人，` : ''}已递交 ${done.length} 人${tally.roster ? `，未递交 ${tally.missing} 人` : ''}，已打分 ${scored.length} 人，平均分 ${avg}。`
      + (exam.room.deadline ? `递交截止 ${deadlineText(exam.room.deadline)}${over ? '（已截止）' : ''}。` : '');
    // 2026-11-11 用户：“期中考查”里面要统计未递交的人数——统计卡片（未递交只算点名册里的同学，点一下只看未递交的），筛选菜单也带人数
    // 2026-11-22 第一档美化：统计卡片排成一条、各带图标（同“我的课堂”）；有人未递交时图标和数字变红，都交了显示绿色的勾；还有待批阅的图标是黄色
    const EXAM_ICONS = {
      all: '<path d="M9 4.5H7.2A2.2 2.2 0 0 0 5 6.7v12.1A2.2 2.2 0 0 0 7.2 21h9.6a2.2 2.2 0 0 0 2.2-2.2V6.7a2.2 2.2 0 0 0-2.2-2.2H15"/><rect x="9" y="3" width="6" height="3.2" rx="1"/><path d="M8.6 11h6.8M8.6 14.5h6.8M8.6 18h4"/>',
      check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.3 2.5 2.5 5-5.2"/>',
      alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6v5.2M12 16.3h.01"/>',
      pen: '<path d="M4 20h4.2L19 9.2a2.1 2.1 0 0 0 0-3L17.8 5a2.1 2.1 0 0 0-3 0L4 15.8V20z"/><path d="m13.5 6.5 4 4"/>',
      star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
    };
    const stat = (value, label, key, cls, icon) => `<button type="button" class="tw-stat tw-exam-stat ${cls}" data-exam-stat="${key}" aria-pressed="${$('[data-exam-filter]').value === key}"><i class="tw-stat-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${EXAM_ICONS[icon]}</svg></i><b>${value}</b><span>${label}</span></button>`;
    const todoCount = done.length - scored.filter((person) => person.sub).length;
    $('[data-exam-stats]').innerHTML = (tally.roster ? stat(tally.roster, '点名册人数', 'all', '', 'all') : '')
      + stat(done.length, tally.outside ? `已递交（含点名册外 ${tally.outside}）` : '已递交', 'submitted', 'is-good', 'check')
      + (tally.roster ? stat(tally.missing, over ? '未递交（已截止）' : '未递交', 'none', tally.missing ? 'is-missing is-alert' : 'is-clear is-good', tally.missing ? 'alert' : 'check') : '')
      + stat(todoCount, '待批阅', 'todo', todoCount ? 'is-wait' : 'is-quiet', 'pen')
      + stat(scored.length, `已打分 · 平均 ${avg}`, 'done', '', 'star');
    const filterBox = $('[data-exam-filter]');
    const counts = { all: list.length, submitted: done.length, todo: done.length - scored.filter((person) => person.sub).length, done: scored.length, none: list.filter((person) => !person.sub).length };
    Array.from(filterBox.options).forEach((option) => {
      option.textContent = `${option.dataset.label || (option.dataset.label = option.textContent)}（${counts[option.value] != null ? counts[option.value] : 0}）`;
    });
    const query = $('[data-exam-search]').value.trim();
    const filter = $('[data-exam-filter]').value;
    const shown = list.map((person, index) => ({ person, index })).filter(({ person }) => (!query || [person.sid, person.name].some((v) => String(v || '').includes(query)))
      && (filter === 'all' || (filter === 'todo' ? person.sub && examScore(person.mark) == null : filter === 'done' ? examScore(person.mark) != null
        : filter === 'submitted' ? Boolean(person.sub) : !person.sub)));
    body.innerHTML = shown.map(({ person, index }) => {
      const score = examScore(person.mark);
      return `<tr class="${person.sub ? '' : 'tw-absent'}"><td>${person.no || '外'}</td><td>${esc(person.sid)}</td><td class="tw-nowrap">${esc(person.name)}</td><td>${esc(person.class_name)}</td>
        <td class="tw-nowrap">${person.sub ? statusTag('已递交', 'ok') + whenSmall(examAt(person.sub.at)) : statusTag('未递交', over ? 'bad' : 'mute')}</td><td>${person.sub ? examWords(person.sub.text) : ''}</td>
        <td class="score">${score == null ? '' : score}</td><td class="tw-exam-comment">${esc(short((person.mark && person.mark.comment) || '', 30))}</td>
        <td class="tw-col-action">${person.sub ? `<button type="button" class="tw-secondary" data-exam-open="${index}">${score == null ? '批阅' : '改分'}</button>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">没有符合条件的学生。</td></tr>';
  }
  const examDialog = $('[data-exam-dialog]');
  const examForm = $('[data-exam-form]');
  function showExam(index) {
    const person = exam.order[index];
    if (!person || !person.sub) return;
    exam.current = index;
    const graded = exam.order.filter((item) => item.sub);
    $('[data-exam-pos]').textContent = `期中考查作业 · 已递交的第 ${graded.indexOf(person) + 1} / ${graded.length} 位${person.no ? ` · 点名册第 ${person.no} 号` : ' · 点名册外'}`;
    $('[data-exam-who]').textContent = `${person.name}　${person.sid}`;
    $('[data-exam-meta]').textContent = [person.class_name, `递交 ${examAt(person.sub.at)}`, `${examWords(person.sub.text)} 字（要求 ${examInfo().words || ''} 字左右）`].filter(Boolean).join(' · ');
    $('[data-exam-question]').textContent = (examUnit() && examUnit().exam && examUnit().exam.question) || examInfo().title || '';
    const paras = person.sub.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    $('[data-exam-text]').innerHTML = paras.map((line) => `<p>${esc(line)}</p>`).join('') || '<p class="empty">（空）</p>';
    $('[data-exam-text]').scrollTop = 0;
    const score = examScore(person.mark);
    examForm.elements.score.value = score == null ? '' : score;
    examForm.elements.comment.value = (person.mark && person.mark.comment) || '';
    $('[data-exam-error]').textContent = exam.problem && /打分/.test(exam.problem) ? exam.problem : '';
    $('[data-exam-prev]').disabled = !exam.order.slice(0, index).some((item) => item.sub);
    $('[data-exam-next]').disabled = !exam.order.slice(index + 1).some((item) => item.sub);
    if (!examDialog.open) { if (typeof examDialog.showModal === 'function') examDialog.showModal(); else examDialog.setAttribute('open', ''); }
    examForm.elements.score.focus();
  }
  const stepExam = (delta) => {
    for (let i = exam.current + delta; i >= 0 && i < exam.order.length; i += delta) if (exam.order[i].sub) { showExam(i); return true; }
    return false;
  };
  async function saveExam() {
    const person = exam.order[exam.current];
    if (!person) return false;
    const raw = String(examForm.elements.score.value).trim();
    const score = raw === '' ? null : Number(raw);
    if (score != null && !(score >= 0 && score <= 100 && Number.isInteger(score * 2))) { $('[data-exam-error]').textContent = '得分应为 0—100（可到 0.5 分）。'; return false; }
    const comment = examForm.elements.comment.value.trim();
    $('[data-exam-error]').textContent = '正在保存……';
    try {
      const row = await backend.rpc('ck_save_exam_score', { p_classroom: Number(exam.room.id) || exam.room.id, p_sid: person.sid, p_name: person.name, p_score: score, p_comment: comment });
      const saved = Array.isArray(row) ? row[0] : row;
      if (saved && saved.sid) exam.marks.set(sidKey(person.sid), saved); else exam.marks.delete(sidKey(person.sid));
      person.mark = exam.marks.get(sidKey(person.sid)) || null;
      $('[data-exam-error]').textContent = `已保存（${clock(Date.now()).slice(0, 5)}）`;
      renderExam();
      return true;
    } catch (error) {
      console.error(error);
      $('[data-exam-error]').textContent = `保存失败：${error.message || error}`;
      return false;
    }
  }
  examForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!(await saveExam())) return;
    if (!stepExam(1)) $('[data-exam-error]').textContent = '已保存。这是最后一位已递交的同学。';
  });
  $('[data-exam-save]').addEventListener('click', saveExam);
  $('[data-exam-prev]').addEventListener('click', () => stepExam(-1));
  $('[data-exam-next]').addEventListener('click', () => stepExam(1));
  $('[data-exam-close]').addEventListener('click', () => examDialog.close());
  $('[data-exam-rows]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-exam-open]');
    if (button) showExam(Number(button.dataset.examOpen));
  });
  $('[data-exam-room]').addEventListener('change', loadExam);
  $('[data-exam-refresh]').addEventListener('click', loadExam);
  $('[data-exam-search]').addEventListener('input', renderExam);
  $('[data-exam-filter]').addEventListener('change', renderExam);
  $('[data-exam-stats]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-exam-stat]');
    if (!button) return;
    const box = $('[data-exam-filter]');
    box.value = box.value === button.dataset.examStat ? 'all' : button.dataset.examStat;
    renderExam();
  });
  $('[data-tab="exam"]').addEventListener('click', loadExam);

  // 导出：Excel 成绩单（按点名册顺序）与 Word 作业（每位同学一页，可打印归档）
  const examFileStem = () => `${course.title}_${safeName(state.klass.name)}_期中考查_${safeName((examInfo().case || '').replace(/[“”"]/g, ''))}_${window.ClassLive.today()}`;
  $('[data-exam-xlsx]').addEventListener('click', () => {
    if (!exam.room) return;
    const O = window.ClassLive.office;
    const rows = [['序号（点名册）', '学号', '姓名', '班级', '递交状态', '递交时间', '字数', '得分（满分 100）', '评语']]
      .concat(exam.order.map((person) => [person.no || '点名册外', String(person.sid), person.name, person.class_name, person.sub ? '已递交' : '未递交',
        person.sub ? examAt(person.sub.at) : '', person.sub ? examWords(person.sub.text) : '', examScore(person.mark) == null ? '' : examScore(person.mark), (person.mark && person.mark.comment) || '']));
    O.save(O.xlsx('期中考查成绩', rows, [12, 16, 10, 16, 10, 18, 8, 16, 40]), `${examFileStem()}_成绩.xlsx`);
  });
  // 每位同学一份（2026-10-29 按用户截图改版）：学生信息栏（已填班级、学号、姓名）、“作答说明”框（含作答要求）、作答题目、作答，最后是批阅
  function examPaper(person, pageBreak) {
    const O = window.ClassLive.office;
    const info = examInfo();
    const unit = examUnit();
    const ex = (unit && unit.exam) || {};
    const score = examScore(person.mark);
    const notes = O.examNotes({ ...ex, deadline: exam.room && exam.room.deadline ? deadlineText(exam.room.deadline) : '' });
    const label = (text) => ({ text, bold: true, east: '黑体' });
    return O.para(`${course.title} · 期中考查作业`, 'title', { pageBreak })
      + O.para(`${ex.title || info.title || ''}（${ex.type || info.type || ''}题 · 总分 100 分）`, 'subtitle')
      + O.examHead({ klass: person.class_name, sid: person.sid, name: person.name }, notes)
      + O.para('一、作答题目', 'h') + O.para([{ text: ex.question || info.title || '', bold: true }], 'body')
      + O.para('二、作答', 'h') + O.para(`递交时间：${examAt(person.sub.at)}　　字数：${examWords(person.sub.text)} 字`, 'note')
      + person.sub.text.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => O.para(line, 'body')).join('')
      + O.para('三、批阅', 'h')
      + O.para([label('得分（满分 100）：'), score == null ? '__________' : String(score)], 'plain')
      + O.para([label('评语：'), (person.mark && person.mark.comment) || ''], 'plain')
      + O.para('批阅教师：____________　　批阅日期：____________', 'plain');
  }
  $('[data-exam-docx]').addEventListener('click', () => {
    if (!exam.room) return;
    const O = window.ClassLive.office;
    const info = examInfo();
    const done = exam.order.filter((person) => person.sub);
    const scored = done.filter((person) => examScore(person.mark) != null);
    let body = O.para(`${course.title} · 期中考查作业`, 'title')
      + O.para(`${state.klass.name} · ${exam.room.name}（课堂码 ${exam.room.code}）`, 'subtitle')
      + O.table([['题目', `${info.title || ''}（${info.case || ''}）`], ['题型 / 总分', `${info.type || ''}题 / 100 分`], ['统计', `${rosterOf().length ? `点名册 ${rosterOf().length} 人，` : ''}已递交 ${done.length} 人${rosterOf().length ? `，未递交 ${examTally(exam.order).missing} 人` : ''}，已打分 ${scored.length} 人`],
        ['导出时间', `${window.ClassLive.today()} ${clock(Date.now()).slice(0, 5)}`]], [1800, 7226], { head: false })
      + O.para('成绩一览（按点名册顺序）', 'h')
      + O.table([['序号', '学号', '姓名', '班级', '递交', '得分']].concat(exam.order.map((person) => [String(person.no || '外'), String(person.sid), person.name, person.class_name,
        person.sub ? '已递交' : '未递交', examScore(person.mark) == null ? '' : String(examScore(person.mark))])), [900, 1900, 1500, 2300, 1300, 1126]);
    body += done.map((person) => examPaper(person, true)).join('');
    O.save(O.docx(body), `${examFileStem()}_全部作业.docx`);
  });
  $('[data-exam-one]').addEventListener('click', () => {
    const person = exam.order[exam.current];
    if (!person || !person.sub) return;
    const O = window.ClassLive.office;
    O.save(O.docx(examPaper(person, false)), `${examFileStem()}_${safeName(person.sid)}_${safeName(person.name)}.docx`);
  });

  // ---------------- 标签页 ----------------
  // 吸顶的顶栏有多高（2026-11-23）：iPad 竖屏时顶栏有两三行；点学情分析、云间灵田、静修数据的跳转小标签时，分组标题停在顶栏下面（teacher.css 的 --tw-top-h）。
  // 手机上顶栏不吸顶（max-width: 760px 时 position: static），记 0
  (() => {
    const top = $('.tw-top');
    if (!top) return;
    const set = () => {
      const pos = getComputedStyle(top).position;
      const h = pos === 'sticky' || pos === 'fixed' ? Math.ceil(top.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty('--tw-top-h', `${h}px`);
    };
    set();
    if (window.ResizeObserver) new ResizeObserver(set).observe(top);
    window.addEventListener('resize', set);
  })();
  $$('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    $$('[data-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
    store.set(`tab:${course.slug}`, tab.dataset.tab);
  }));
  const savedTab = $(`[data-tab="${store.get(`tab:${course.slug}`)}"]`);
  if (savedTab && !savedTab.hidden) savedTab.click();

  // ---------------- 云间灵田（2026-11-15） ----------------
  // 开放与抽题概率（lt_admin / lt_admin_set）；万象道藏学年卡池（经云函数 lingtian 的教师接口，凭 lt_teacher_ticket 凭证）；
  // “谁是谁”：道号与学生的对照、服丹折算的网站修为、偷菜次数；被敏感词挡下的道号，以及销号／恢复（lt_admin_ban）；
  // “数据统计”：灵石、开垦、收获、偷菜、灵田答题、丹炉、道藏卡牌、坊市、活跃天数（lt_stats），全班汇总＋可排序明细＋导出 Excel；
  // “种田行为分析”（2026-11-22）：灵石的来路和去向、累计获得、什么时候来、种什么卖什么（lt_behavior），经营得好的同学和个人种田分析卡
  // “静修数据统计”（2026-11-23）：每天静修多久、什么时候静修、完成率与专注占比、立愿、雅室、悟玉与衣装（lt_focus_stats），个人静修卡＋导出 Excel；同一天改成单独一个标签“静修数据”
  const LT_REALMS = ['炼气', '筑基', '结丹', '元婴', '化神'];
  // 图表的分组和顺序（2026-11-23 用户：“你把云间灵田、学情分析和静修数据里面的数据和图表在重新排版一下，按照逻辑顺序等，使之更美观”）：
  //   [卡片标题, 宽]：宽 true 占满一行、false 占半行；每组里半宽的两两成对。画图的代码照旧一张张建卡片，建好就放进这里排好的位置（live-insights.js 的 arranger）
  const LT_STATS_PLAN = [   // 数据统计：谁来了 → 做什么、收获多少（两张横条图并排，柱状图和环形图并排，高矮相近）
    { title: '谁来了', note: '来得勤不勤、各宗门有多少人', cards: [['来灵田的天数', false], ['各宗门开辟灵田的人数', false]] },
    { title: '做什么、收获多少', note: '全班累计；灵石、开垦和灵田里的修炼场题', cards: [['大家在灵田里做什么', false], ['灵石最多的同学', false], ['开垦了几块灵田', false], ['灵田答题', false]] },
  ];
  const LT_BEH_PLAN = [   // 种田行为分析：灵石账本 → 经营方式 → 学生
    { title: '灵石账本', note: '从哪里来、花到哪里去，谁挣得最多', cards: [['灵石从哪里来', false], ['灵石花到哪里去', false], ['累计获得灵石最多的同学', true]] },
    { title: '经营方式', note: '来得多不等于挣得多', cards: [['操作次数和累计获得', true], ['经营得好的同学，好在哪里', true]] },
    { title: '学生', note: '点姓名看个人种田分析卡', cards: [['个人种田分析卡', true], ['每位同学', true]] },
  ];
  const LT_FOCUS_PLAN = [   // 静修数据：什么时候、在哪里 → 学什么 → 每一段 → 谁专注得最多 → 学生（并排的两张图高矮相近：分段条配环形图、横条配横条、柱状图配环形图）
    { title: '什么时候、在哪里', note: '北京时间；一天专注满 25 分钟算一次打卡', cards: [['每天静修了多少分钟', true], ['一周里什么时候静修', true], ['打卡了几天', false], ['在哪间雅室静修', false]] },
    { title: '学什么', note: '开始静修前写下的“本次修习什么”', cards: [['大家立的愿', true]] },
    { title: '每一段', note: '定多长、到时完成还是中途结束', cards: [['每段定多长', false], ['每一段结束得怎么样', false], ['最近的静修', true]] },
    { title: '谁专注得最多', note: '累计专注时长，以及完成以后得的悟玉、置办的衣装', cards: [['专注时长最多的同学', false], ['悟玉与衣装', false]] },
    { title: '学生', note: '点姓名看个人静修卡', cards: [['个人静修卡', true], ['每位同学', true]] },
  ];
  const ltArrange = (I, grid, plan) => (I.arranger ? I.arranger(grid, plan) : { card: I.card, finish() {} });   // 图表脚本是旧版（缓存）时照旧按画图的顺序
  const lt = { loaded: false, players: [], catalog: null, plans: null, ticket: null, ticketAt: 0, stats: null, statsAt: 0, statsError: '', sort: { key: 'stones', dir: -1 } };
  const ltSectName = (key) => (((window.ClassLive && window.ClassLive.SECTS) || []).find((item) => item.key === key) || {}).name || (key || '—');
  const ltYearNow = () => { const d = new Date(Date.now() + 8 * 3600000); const y = d.getUTCFullYear(); return d.getUTCMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`; };
  function ltYears() {
    const select = $('[data-lt-year]');
    if (!select || select.options.length) return;
    const now = Number(ltYearNow().slice(0, 4));
    select.innerHTML = [now - 1, now, now + 1].map((y) => `<option value="${y}-${y + 1}"${y === now ? ' selected' : ''}>${y}—${y + 1} 学年</option>`).join('');
  }
  // 开放与抽题（2026-11-19 用户：“云间灵田的开放与抽题，能不能做得美观一些？比如改成开关按钮，设置概率用下拉框？”）：
  // 开放用开关，旁边写清现在的状态；三个概率用下拉框（0%—100%，每档 5%），保存时照旧读 value
  function ltPct(selector, value) {
    const select = $(selector);
    if (!select) return;
    if (!select.options.length) {
      select.innerHTML = Array.from({ length: 21 }, (_, i) => i * 5).map((v) => `<option value="${v}">${v === 0 ? '不抽题（0%）' : `${v}%`}</option>`).join('');
    }
    const v = String(Math.max(0, Math.min(100, Math.round(Number(value) || 0))));
    if (!Array.from(select.options).some((o) => o.value === v)) select.insertAdjacentHTML('beforeend', `<option value="${v}">${v}%</option>`);
    select.value = v;
  }
  function ltSwitchNote() {
    const note = $('[data-lt-enabled-note]');
    if (note) note.textContent = $('[data-lt-enabled]').checked ? '已开放：拜入宗门的学生在面板“宗门”里能看到“进入云间灵田”' : '未开放：学生面板“宗门”里看不到入口';
  }
  // 跳转栏右边的小标签：后台现在开没开（读到设置、保存成功以后才改，拨了开关还没存好时不变）
  function ltOpenState(enabled) {
    const chip = $('[data-lt-open-state]');
    if (!chip) return;
    chip.textContent = enabled ? '已对学生开放' : '未对学生开放';
    chip.classList.toggle('is-on', !!enabled);
    chip.classList.toggle('is-off', !enabled);
  }
  async function ltLoad() {
    if (!backend || lt.loading) return;   // 正在读的那一次还没完：不重复读
    lt.loading = true;
    ltYears();
    if (lt.loaded) $('[data-lt-status]').textContent = '正在刷新……';
    try {
      const data = await backend.rpc('lt_admin', { p_course: course.slug });
      const row = (Array.isArray(data) ? data[0] : data) || {};
      const set = row.settings || {};
      if (!lt.dirty) {   // 开放与抽题概率改了还没保存：刷新时不覆盖
        $('[data-lt-enabled]').checked = !!set.enabled;
        ltPct('[data-lt-water]', set.water_quiz_pct ?? 30);
        ltPct('[data-lt-clear]', set.clear_quiz_pct ?? 30);
        ltPct('[data-lt-steal]', set.steal_quiz_pct ?? 40);
        ltSwitchNote();
      }
      lt.players = Array.isArray(row.players) ? row.players : [];
      lt.loaded = true;
      $('[data-lt-enabled]').disabled = false;   // 读到了后台的设置才能拨开关、点保存（见下面“刷新页面时”）
      $('[data-lt-save]').disabled = false;
      $('[data-lt-status]').textContent = `${set.enabled ? '本课程已开放云间灵田。' : '本课程尚未开放：学生面板“宗门”里不显示入口。'}${lt.dirty ? '（上面的设置改了还没保存）' : ''}（${clock(Date.now())} 刷新）`;
      ltOpenState(!!set.enabled);
      ltRender();
      ltStatsLoad();
    } catch (error) {
      const missing = /PGRST202|42883|Could not find the function|lt_admin/.test(String((error && error.message) || error));
      $('[data-lt-status]').textContent = missing ? '云间灵田的后台还没有建好：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261115-云间灵田.sql。' : `读取失败：${(error && error.message) || error}`;
    } finally {
      lt.loading = false;
    }
  }
  function ltRender() {
    const box = $('[data-lt-rows]');
    if (!box) return;
    const word = ($('[data-lt-search]').value || '').trim();
    const rows = lt.players.filter((p) => (!state.klass || String(p.class_id) === String(state.klass.id)) && (!word || [p.sid, p.name, p.alias].some((v) => String(v || '').includes(word))));
    // 道号：被销号的显示原来的道号（划掉）；“（还没起道号）”＝游戏给的默认道号或恢复后还没重新起
    const aliasOf = (p) => (p.banned ? `<s>${esc(p.banned_alias || '')}</s> <b class="tw-sec-bad">已销号</b>`
      : !p.alias || /^(道友|已销号)·[0-9A-F]{6,8}$/.test(p.alias) ? '（还没起道号）' : esc(p.alias));
    const rejects = (p) => (Number(p.rejects) ? `${Number(p.rejects)} 次 · 最近：${esc(p.last_reject || '')}` : '');
    box.innerHTML = rows.map((p) => `<tr><td>${esc(p.sid)}</td><td>${esc(p.name)}</td><td>${aliasOf(p)}</td><td>${esc(ltSectName(p.sect))}</td><td>${esc(LT_REALMS[Number(p.realm) || 0])}</td><td>${rejects(p)}</td><td>${p.banned
      ? `<button type="button" class="tw-secondary" data-lt-unban="${esc(p.actor_id)}">恢复</button>`
      : `<button type="button" class="tw-secondary" data-lt-ban="${esc(p.actor_id)}">销号</button>`}</td></tr>`).join('')
      || `<tr><td colspan="7" class="empty">${state.klass ? '本班还没有同学进入过云间灵田。' : '还没有同学进入过云间灵田。'}</td></tr>`;
    ltStatsRender();
    const banned = rows.filter((p) => p.banned).length;
    // 2026-11-19 用户：“‘谁是谁’中的有些内容不要跟前面数据分析的内容重复”：服丹折算修为、偷菜次数、最近进入都在上面的数据统计里，这里只管道号对照和销号
    $('[data-lt-summary]').textContent = `${state.klass ? `本班（${state.klass.name}）` : '本课程'}已有 ${rows.length} 位同学开辟灵田${banned ? `（其中 ${banned} 位已销号）` : ''}。灵石、偷菜、服丹折算修为、最近进入等见上面的“数据统计”。`;
  }
  // ---------- 数据统计（2026-11-15 用户：“教师工作台中的云间灵田还要能看到学生灵石数量等数据统计”） ----------
  // 数字直接读游戏存档（学生每做一步都会存），不是估算；全班汇总只算当前班级里进过灵田的同学
  const LT_STAT_COLS = [
    { key: 'sid', label: '学号', text: true },
    { key: 'name', label: '姓名', text: true },
    { key: 'alias', label: '道号', text: true },
    { key: 'stones', label: '灵石', tip: '现在有多少灵石' },
    { key: 'plots', label: '开垦', tip: '已开垦的灵田（共 25 块）' },
    { key: 'harvest', label: '收获', tip: '亲手收获成熟灵田的次数' },
    { key: 'stealOk', label: '偷菜成/败', tip: '偷菜成功的次数／失败的次数（守田阵法答错、超时、放弃等）' },
    { key: 'stolen', label: '被偷', tip: '自己的灵田被别人偷走的次数' },
    { key: 'quizRate', label: '答题', tip: '灵田里抽到的修炼场题（浇水、锄草、换道友名单、守田阵法）：答对／答了（正确率）' },
    { key: 'brew', label: '炼丹', tip: '从丹炉领取的丹药颗数' },
    { key: 'pillsTaken', label: '服丹', tip: '服用的丹药颗数' },
    { key: 'qi', label: '折算修为', tip: '服丹折算的网站修为（被销号的不计）' },
    { key: 'cards', label: '卡牌', tip: '万象道藏收集到的卡牌种数（开过的卡包数）' },
    { key: 'trades', label: '坊市', tip: '在坊市成交的笔数（买和卖都算）' },
    { key: 'days', label: '活跃天数', tip: '在灵田里操作过的天数（操作次数）' },
    { key: 'last', label: '最近进入' },
  ];
  const ltNum = (value) => Number(value) || 0;
  const ltFmt = (value, digits = 0) => ltNum(value).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const ltDefaultAlias = (alias) => !alias || /^(道友|已销号)·[0-9A-F]{6,8}$/.test(alias);
  function ltStatRow(p) {
    const st = p.stats || {};
    const quizRight = ltNum(p.quiz_right) + ltNum(p.guard_right), quizTotal = ltNum(p.quiz_total) + ltNum(p.guard_total);
    return {
      ...p, aliasText: ltDefaultAlias(p.alias) ? '（未起道号）' : String(p.alias),
      stones: ltNum(p.stones), plots: ltNum(p.plots), growing: ltNum(p.growing), bag: ltNum(p.bag), pillStock: ltNum(p.pill_stock),
      plant: ltNum(st.plantCount), water: ltNum(st.waterCount), clear: ltNum(st.clearCount), harvest: ltNum(st.harvestCount), harvestUnits: ltNum(st.harvestUnits),
      brew: ltNum(st.brewClaims), pillsTaken: ltNum(st.pillsTaken), sell: ltNum(st.sellCount), sellEarnings: ltNum(st.sellEarnings), unlock: ltNum(st.unlockCount),
      stealOk: ltNum(p.steal_ok), stealFail: ltNum(p.steal_fail), stolen: ltNum(p.stolen),
      quizRight, quizTotal, quizRate: quizTotal ? quizRight / quizTotal : -1, guardRight: ltNum(p.guard_right), guardTotal: ltNum(p.guard_total),
      qi: p.banned ? 0 : ltNum(p.qi_points), cards: ltNum(p.card_kinds), cardTotal: ltNum(p.card_total), packs: ltNum(p.packs),
      trades: ltNum(p.trades), sectUnits: ltNum(p.sect_units), days: ltNum(p.active_days), actions: ltNum(p.actions),
      last: p.last_seen ? millis(p.last_seen) : 0, first: p.first_seen ? millis(p.first_seen) : 0,
    };
  }
  async function ltStatsLoad() {
    if (!backend) return;
    const status = $('[data-lt-stats-status]');
    if (status) status.textContent = '正在读取……';
    try {
      const data = await backend.rpc('lt_stats', { p_course: course.slug });
      const row = (Array.isArray(data) ? data[0] : data) || {};
      lt.stats = (Array.isArray(row.players) ? row.players : []).map(ltStatRow);
      lt.statsAt = Number(row.at) || Date.now();
      lt.statsError = '';
    } catch (error) {
      const missing = /PGRST202|42883|Could not find the function|lt_stats/.test(String((error && error.message) || error));
      lt.statsError = missing ? '数据统计要用最新的 tools/cloudbase-pg-20261115-云间灵田.sql：在云开发 SQL 编辑器再执行一次（可重复执行，不删数据）。' : `读取失败：${(error && error.message) || error}`;
    }
    ltStatsRender();
    ltBehLoad();   // 种田行为分析要用到这里的现有灵石：统计读完接着读
  }
  // 当前班级的行（没选班级时是本课程全部）
  const ltStatRows = () => (lt.stats || []).filter((p) => !state.klass || String(p.class_id) === String(state.klass.id));
  function ltStatsSummary(rows) {
    const live = rows.filter((p) => !p.banned);
    const sum = (key, list = rows) => list.reduce((total, p) => total + ltNum(p[key]), 0);
    const day = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
    const today = day(Date.now());
    const week = rows.filter((p) => p.last && Date.now() - p.last < 7 * 86400000).length;
    const todayCount = rows.filter((p) => p.last && day(p.last) === today).length;
    const richest = live.slice().sort((a, b) => b.stones - a.stones)[0];
    const quizTotal = sum('quizTotal'), quizRight = sum('quizRight');
    const roster = rosterOf().length;
    const avg = (value) => (rows.length ? value / rows.length : 0);
    return [
      { label: '开辟灵田', value: `${rows.length} 人`, note: `${roster ? `本班 ${roster} 人中的 ${Math.round(rows.length / roster * 100)}%` : '进过灵田的同学'}${rows.length - live.length ? `；已销号 ${rows.length - live.length} 人` : ''}` },
      { label: '近 7 天来过', value: `${week} 人`, note: `今天来过 ${todayCount} 人` },
      { label: '灵石（人均）', value: ltFmt(avg(sum('stones'))), note: `合计 ${ltFmt(sum('stones'))}${richest ? `；最多 ${richest.name} ${ltFmt(richest.stones)}` : ''}` },
      { label: '开垦灵田（人均）', value: `${avg(sum('plots')).toFixed(1)} 块`, note: `合计 ${ltFmt(sum('plots'))} 块（每人最多 25 块）` },
      { label: '收获', value: `${ltFmt(sum('harvest'))} 次`, note: `收获灵植 ${ltFmt(sum('harvestUnits'))} 份；种植 ${ltFmt(sum('plant'))} 次` },
      { label: '偷菜', value: `成功 ${ltFmt(sum('stealOk'))} 次`, note: `失败 ${ltFmt(sum('stealFail'))} 次；被偷 ${ltFmt(sum('stolen'))} 次` },
      { label: '灵田答题正确率', value: quizTotal ? `${Math.round(quizRight / quizTotal * 100)}%` : '—', note: `答了 ${ltFmt(quizTotal)} 道修炼场题，其中守田阵法 ${ltFmt(sum('guardTotal'))} 道` },
      { label: '丹炉', value: `炼成 ${ltFmt(sum('brew'))} 颗`, note: `服丹 ${ltFmt(sum('pillsTaken'))} 颗；折算网站修为合计 ${sum('qi', live).toFixed(1)}` },
      { label: '万象道藏', value: `开包 ${ltFmt(sum('packs'))} 个`, note: `人均收集 ${avg(sum('cards')).toFixed(1)} 种卡牌` },
    ];
  }
  // 数据统计的图（2026-11-19 用户：“数据统计改成类似于学情分析的图表形式”）：用学情分析的同一套图（live-insights.js），每张图下面可切换成表格
  function ltStatsCharts(rows) {
    const box = $('[data-lt-stats-charts]');
    const I = window.ClassLiveInsights;
    if (!box) return;
    box.textContent = '';
    if (!I) { box.textContent = '图表脚本没有加载，请刷新页面再试。'; return; }
    I.addStyle();
    if (!rows.length) { I.empty(box, state.klass ? '本班还没有同学进入过云间灵田。' : '还没有同学进入过云间灵田。'); return; }
    const T = I.tones;
    const sum = (key, list = rows) => list.reduce((total, p) => total + ltNum(p[key]), 0);
    const tiles = ltStatsSummary(rows);
    const pick = (label) => tiles.find((t) => t.label === label);
    I.tiles(box, ['开辟灵田', '近 7 天来过', '灵田答题正确率', '灵石（人均）'].map(pick).filter(Boolean));
    const grid = document.createElement('div');
    grid.className = 'ins-grid';
    box.appendChild(grid);
    const A = ltArrange(I, grid, LT_STATS_PLAN);   // 按分组摆（见上面的 LT_STATS_PLAN）
    const add = (title, sub, wide) => { const c = A.card(grid, title, sub, wide); const host = document.createElement('div'); c.appendChild(host); return [c, host]; };
    // 1 大家在灵田里做什么
    const ACTS = [['种植', 'plant'], ['浇水', 'water'], ['锄草', 'clear'], ['收获', 'harvest'], ['偷菜成功', 'stealOk'], ['偷菜失败', 'stealFail'], ['被偷', 'stolen'],
      ['炼成丹药', 'brew'], ['服丹', 'pillsTaken'], ['坊市成交', 'trades'], ['开卡包', 'packs']];
    const acts = ACTS.map(([label, key]) => ({ label, value: sum(key), people: rows.filter((p) => ltNum(p[key]) > 0).length }));
    const [c1, h1] = add('大家在灵田里做什么', '全班累计次数；悬停看有几位同学做过。', true);
    I.bars(h1, c1, acts.map((d) => ({ label: d.label, value: d.value, lines: [d.label, `${d.people} 人做过`] })), { unit: ' 次', aria: '灵田里各项操作的次数横条图' });
    I.tableView(c1, ['项目', '次数', '做过的人数'], acts.map((d) => [d.label, d.value, d.people]));
    // 2 灵石最多的同学
    const rich = rows.filter((p) => !p.banned).sort((a, b) => b.stones - a.stones || String(a.sid).localeCompare(String(b.sid))).slice(0, 10);
    const [c2, h2] = add('灵石最多的同学', `前 ${rich.length} 位（已销号的不计）；悬停看道号、开垦和收获。`);
    I.bars(h2, c2, rich.map((p) => ({ label: p.name, value: p.stones, lines: [`${p.name}（${p.aliasText}）`, `开垦 ${p.plots} 块 · 收获 ${p.harvest} 次`] })), { unit: ' 灵石', labelMax: 120, aria: '灵石最多的同学横条图' });
    I.tableView(c2, ['姓名', '道号', '灵石', '开垦', '收获'], rich.map((p) => [p.name, p.aliasText, p.stones, p.plots, p.harvest]));
    // 3 灵田答题
    const right = sum('quizRight'), asked = sum('quizTotal');
    const [c3, h3] = add('灵田答题', `浇水、锄草、换道友名单和守田阵法抽到的修炼场题，共 ${ltFmt(asked)} 道。`);
    I.donut(h3, c3, [{ label: '答对', value: right, color: T.green }, { label: '答错', value: Math.max(0, asked - right), color: T.red }],
      { unit: ' 道', center: asked ? `${Math.round(right * 100 / asked)}%` : '—', centerSub: '正确率', empty: '还没有同学在灵田里答过题。', aria: '灵田答题正确率环形图' });
    // 4 开垦了几块灵田
    const plotBins = [['0 块', 0, 0], ['1—5 块', 1, 5], ['6—10 块', 6, 10], ['11—15 块', 11, 15], ['16—20 块', 16, 20], ['21—25 块', 21, 25]]
      .map(([label, lo, hi]) => ({ key: label, label, value: rows.filter((p) => p.plots >= lo && p.plots <= hi).length }));
    const [c4, h4] = add('开垦了几块灵田', '每人最多 25 块；柱子是人数。');
    I.columns(h4, c4, plotBins.map((d) => ({ ...d, lines: [d.label, `${d.value} 人`] })), { unit: ' 人', color: T.green, aria: '开垦块数分布柱状图' });
    I.tableView(c4, ['开垦', '人数'], plotBins.map((d) => [d.label, d.value]));
    // 5 来灵田的天数
    const dayBins = [['1 天', 1, 1], ['2—3 天', 2, 3], ['4—7 天', 4, 7], ['8—14 天', 8, 14], ['15 天以上', 15, Infinity]]
      .map(([label, lo, hi]) => ({ label, value: rows.filter((p) => p.days >= lo && p.days <= hi).length }));
    const [c5, h5] = add('来灵田的天数', '在灵田里操作过的天数，颜色越深来得越多。');
    I.segmented(h5, c5, dayBins.map((d, i) => ({ ...d, color: (I.ramps.online || [])[i] || T.blue, lines: [d.label, `${d.value} 人`] })), { unit: ' 人', aria: '来灵田的天数分段条' });
    I.tableView(c5, ['天数', '人数'], dayBins.map((d) => [d.label, d.value]));
    // 6 各宗门
    const players = lt.players.filter((p) => !state.klass || String(p.class_id) === String(state.klass.id));
    const SECT_TONE = { fengxia: T.red, xuanyue: T.purple, lingxi: T.green, xinglan: T.blue };
    const sects = (((window.ClassLive && window.ClassLive.SECTS) || [])).map((sect) => ({ label: sect.name, value: players.filter((p) => p.sect === sect.key).length, color: SECT_TONE[sect.key] || sect.color }));
    const [c6, h6] = add('各宗门开辟灵田的人数', '拜入宗门才能开辟灵田；按“谁是谁”里的宗门统计。');
    I.donut(h6, c6, sects, { unit: ' 人', center: String(players.length), centerSub: '人', aria: '各宗门开辟灵田人数环形图' });
    I.tableView(c6, ['宗门', '人数'], sects.map((d) => [d.label, d.value]));
    A.finish();
  }
  function ltStatsRender() {
    const head = $('[data-lt-stats-head]'), body = $('[data-lt-stats-rows]'), status = $('[data-lt-stats-status]');
    if (!head || !body) return;
    if (lt.statsError) { status.textContent = lt.statsError; $('[data-lt-stats-charts]').textContent = ''; body.innerHTML = ''; return; }
    if (!lt.stats) return;
    const rows = ltStatRows();
    const { key, dir } = lt.sort;
    const col = LT_STAT_COLS.find((item) => item.key === key) || LT_STAT_COLS[3];
    const value = (p) => (key === 'alias' ? p.aliasText : p[key]);
    rows.sort((a, b) => {
      const x = value(a), y = value(b);
      const order = col.text ? String(x || '').localeCompare(String(y || ''), 'zh-CN') : ltNum(x) - ltNum(y);
      return order * dir || String(a.sid).localeCompare(String(b.sid));
    });
    status.textContent = `${state.klass ? `本班（${state.klass.name}）` : '本课程'}：统计到 ${clock(lt.statsAt)}，数字直接读游戏存档。悬停在图上看详细数字；每人一行的明细在最下面“学生明细”里。`;
    ltStatsCharts(rows);
    head.innerHTML = `<tr>${LT_STAT_COLS.map((item) => `<th${item.tip ? ` title="${esc(item.tip)}"` : ''}><button type="button" class="tw-lt-sort${item.key === key ? ' is-on' : ''}" data-lt-sort="${item.key}">${esc(item.label)}<i aria-hidden="true">${item.key === key ? (dir < 0 ? '▼' : '▲') : ''}</i></button></th>`).join('')}</tr>`;
    const when = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '');
    body.innerHTML = rows.map((p) => `<tr${p.banned ? ' class="is-banned"' : ''}><td class="tw-nowrap">${esc(p.sid)}</td><td class="tw-nowrap">${esc(p.name)}</td>`
      + `<td class="tw-nowrap">${p.banned ? `<s>${esc(p.aliasText)}</s> <b class="tw-sec-bad">已销号</b>` : esc(p.aliasText)}</td>`
      + `<td class="tw-nowrap num">${ltFmt(p.stones)}</td><td class="tw-nowrap num">${p.plots}</td><td class="tw-nowrap num">${p.harvest}</td><td class="tw-nowrap num">${p.stealOk} / ${p.stealFail}</td><td class="tw-nowrap num">${p.stolen}</td>`
      + `<td class="tw-nowrap num">${p.quizTotal ? `${p.quizRight}/${p.quizTotal}（${Math.round(p.quizRate * 100)}%）` : '—'}</td>`
      + `<td class="tw-nowrap num">${p.brew}</td><td class="tw-nowrap num">${p.pillsTaken}</td><td class="tw-nowrap num">${p.banned ? `<s>${ltNum(p.qi_points).toFixed(1)}</s>` : p.qi.toFixed(1)}</td>`
      + `<td class="tw-nowrap num">${p.cards}（${p.packs} 包）</td><td class="tw-nowrap num">${p.trades}</td><td class="tw-nowrap num">${p.days}（${p.actions} 次）</td><td class="tw-nowrap">${esc(when(p.last))}</td></tr>`).join('')
      || `<tr><td colspan="${LT_STAT_COLS.length}" class="empty">${state.klass ? '本班还没有同学进入过云间灵田。' : '还没有同学进入过云间灵田。'}</td></tr>`;
    if (ltBeh.rows) ltBehRender();   // 换了班级：种田行为分析跟着重画
  }
  function ltStatsExport() {
    if (!lt.stats) return;
    const O = window.ClassLive.office;
    const rows = ltStatRows().sort((a, b) => String(a.sid).localeCompare(String(b.sid)));
    const when = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '');
    const summary = [['项目', '数值', '说明']].concat(ltStatsSummary(rows).map((tile) => [tile.label, tile.value, tile.note]));
    const detail = [['学号', '姓名', '道号', '已销号', '灵石', '开垦灵田', '正在长', '乾坤袋灵植', '丹药存量', '种植次数', '浇水次数', '锄草次数', '收获次数', '收获灵植份数',
      '偷菜成功', '偷菜失败', '被偷', '灵田答题答对', '灵田答题答了', '正确率', '守田阵法答对', '守田阵法答了', '炼成丹药', '服丹颗数', '服丹折算修为',
      '道藏卡牌种数', '道藏卡牌张数', '开卡包', '坊市成交', '宗门贡献', '活跃天数', '操作次数', '第一次进入', '最近进入']]
      .concat(rows.map((p) => [String(p.sid), p.name, p.aliasText, p.banned ? '是' : '', p.stones, p.plots, p.growing, p.bag, p.pillStock, p.plant, p.water, p.clear, p.harvest, p.harvestUnits,
        p.stealOk, p.stealFail, p.stolen, p.quizRight, p.quizTotal, p.quizTotal ? `${Math.round(p.quizRate * 100)}%` : '', p.guardRight, p.guardTotal, p.brew, p.pillsTaken, p.qi,
        p.cards, p.cardTotal, p.packs, p.trades, p.sectUnits, p.days, p.actions, when(p.first), when(p.last)]));
    const scope = state.klass ? safeName(state.klass.name) : '全部班级';
    const sheets = [{ name: '汇总', rows: summary, widths: [18, 18, 60] }, { name: '学生明细', rows: detail, widths: [14, 10, 16, 8].concat(Array(30).fill(10)) }];
    if (ltBeh.rows) {   // 种田行为分析（2026-11-22）：累计获得、灵石的来路和去向、来的次数
      const beh = ltBehRows().sort((a, b) => b.earned - a.earned || a.sid.localeCompare(b.sid));
      sheets.push({ name: '种田行为分析', widths: [14, 10, 16].concat(Array(31).fill(11)), rows: [['学号', '姓名', '道号', '累计获得', '现有灵石', '已经花掉', '置办家当', '经营花费', '冻结中', '对不上的差额', '开局赠送']
        .concat(LT_INCOME.map((item) => `收入·${item[1]}`), LT_SPEND.map((item) => `支出·${item[1]}`), ['操作次数', '来的天数', '来的次数', '操作时长（分钟）', '每次操作带来', '主要种', '主要种占卖灵植收入', '第一次操作', '最近一次操作'])]
        .concat(beh.map((p) => [p.sid, p.name, p.aliasText, p.earned, p.stones, p.spendTotal, p.assets, p.running, p.frozen, p.gap, p.start]
          .concat(LT_INCOME.map((item) => ltNum(p.income[item[0]])), LT_SPEND.map((item) => ltNum(p.spend[item[0]])),
            [p.ops, p.days, p.visits, p.minutes, Number(p.perOp.toFixed(1)), p.top ? p.top.name : '', p.top ? `${Math.round(p.topShare * 100)}%` : '', when(p.first), when(p.last)]))) });
    }
    O.save(O.xlsxBook(sheets), `${course.title}_${scope}_云间灵田数据_${window.ClassLive.today()}.xlsx`);
  }
  // ---------- 种田行为分析（2026-11-22 用户：“做一个类似于个人学情分析卡的种田行为分析……可以看看每个人是怎么运作自己的灵田的，可以重点分析一下
  //   几个运营的比较好的同学……除了现在拥有的灵石以外，你还要统计一项已获得的总灵石（包括已经买了宅邸等道具支付掉的，出售灵植、以及通过坊市交易等
  //   收获的灵石等等，相当于会计中的总资产的概念。）”） ----------
  // 数据：lt_behavior（按游戏里每一步操作留下的记录逐条加出来的灵石来路、去向，和什么时候来、种什么）＋上面“数据统计”的 lt_stats（现有灵石、开垦、偷菜、答题）。
  // “累计获得”＝开局送的 520 ＋ 全部收入；它等于 现有灵石 ＋ 置办家当 ＋ 经营花费 ＋ 冻结中（对不上的差额单独标出来）。
  const LT_CROPS = { huangjing: '黄精芝', zihou: '紫猴花', tianling: '天灵果', yueyang: '养魂木', jiuqu: '九曲灵参' };
  // 一块田种一茬：种子多少钱、收几份、每份药铺收多少、要多久、什么境界能种（与游戏 game.js 的 CROPS 一致，只用来写分析里的说明）
  const LT_CROP_INFO = { huangjing: { seed: 18, sell: 12, units: 5, minutes: 40, realm: 0 }, zihou: { seed: 36, sell: 28, units: 4, minutes: 80, realm: 1 },
    tianling: { seed: 64, sell: 52, units: 4, minutes: 120, realm: 2 }, yueyang: { seed: 100, sell: 90, units: 5, minutes: 160, realm: 3 }, jiuqu: { seed: 240, sell: 210, units: 6, minutes: 240, realm: 4 } };
  const LT_INCOME = [['shop', '卖灵植给药铺'], ['commission', '宗门委托奖励'], ['quest', '修行任务奖励'], ['market', '坊市卖出'], ['cards', '卡牌坊市卖出'], ['guard', '守田赔付']];
  const LT_SPEND = [['seed', '买种子'], ['unlock', '开垦灵田'], ['tool', '升级农具'], ['decor', '置办小景'], ['residence', '置办宅邸'], ['brew', '炼丹炉费'], ['market', '坊市买入'], ['cards', '买卡牌'], ['penalty', '偷菜赔付']];
  const LT_ASSETS = ['unlock', 'tool', 'decor', 'residence'];   // 花出去换成家当的（其余是经营花费：种子、炉费、买入、赔付）
  const LT_ASSET_NAME = { unlock: '开垦灵田', tool: '升级农具', decor: '置办小景', residence: '置办宅邸', hoe: '锄头', wateringCan: '浇水壶' };
  const ltBeh = { rows: null, at: 0, error: '', person: '' };
  const ltSum = (object, keys) => (keys || Object.keys(object || {})).reduce((total, key) => total + ltNum((object || {})[key]), 0);
  const ltMedian = (list) => { const s = list.slice().sort((a, b) => a - b); const k = Math.floor(s.length / 2); return !s.length ? 0 : s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  const ltDayText = (day) => `${Number(String(day).slice(5, 7))} 月 ${Number(String(day).slice(8, 10))} 日`;
  // 一位同学的行为和收支（b：lt_behavior 的一行；st：数据统计里同一位同学的一行，可能没有）
  function ltBehRow(b, st) {
    const income = b.income || {}, spend = b.spend || {};
    const incomeTotal = ltSum(income), spendTotal = ltSum(spend), assets = ltSum(spend, LT_ASSETS);
    const stones = st ? st.stones : 0, frozen = ltNum(b.frozen), start = ltNum(b.start);
    const earned = start + incomeTotal;
    const crops = (Array.isArray(b.crops) ? b.crops : []).map((c) => ({ crop: c.crop || '', name: LT_CROPS[c.crop] || '几种一起卖', planted: ltNum(c.planted), seed: ltNum(c.seed), sold: ltNum(c.sold), earned: ltNum(c.earned) }));
    const top = crops.filter((c) => c.crop).slice().sort((x, y) => y.earned - x.earned || y.seed - x.seed)[0] || null;
    return {
      actor: b.actor_id, sid: String(b.sid || ''), classId: b.class_id, name: st ? st.name : String(b.sid || ''), aliasText: st ? st.aliasText : '', banned: !!(st && st.banned), st: st || null,
      start, income, spend, incomeTotal, spendTotal, assets, running: spendTotal - assets, frozen, stones, earned,
      gap: st ? earned - spendTotal - frozen - stones : 0,   // 对不上的差额（应为 0）
      ops: ltNum(b.ops), days: ltNum(b.days), visits: ltNum(b.visits), minutes: ltNum(b.minutes), sellOps: ltNum(b.sell_ops),
      perOp: ltNum(b.ops) ? incomeTotal / ltNum(b.ops) : 0, perDay: ltNum(b.days) ? incomeTotal / ltNum(b.days) : 0,
      crops, top, topShare: top && ltNum(income.shop) ? top.earned / ltNum(income.shop) : 0,
      assetsLog: Array.isArray(b.assets) ? b.assets : [], daily: Array.isArray(b.daily) ? b.daily : [], hours: b.hours || {},
      first: ltNum(b.first_at), last: ltNum(b.last_at), marketSold: ltNum(b.market_sold), marketBought: ltNum(b.market_bought),
      plots: st ? st.plots : 0, stealOk: st ? st.stealOk : 0, stealFail: st ? st.stealFail : 0, quizRate: st && st.quizTotal ? st.quizRate : 0, quizTotal: st ? st.quizTotal : 0,
      tools: (st && st.tools) || {},
    };
  }
  async function ltBehLoad() {
    if (!backend) return;
    const status = $('[data-lt-beh-status]');
    if (status) status.textContent = '正在分析……';
    try {
      const data = await backend.rpc('lt_behavior', { p_course: course.slug });
      const row = (Array.isArray(data) ? data[0] : data) || {};
      ltBeh.rows = Array.isArray(row.players) ? row.players : [];
      ltBeh.at = Number(row.at) || Date.now();
      ltBeh.error = '';
    } catch (error) {
      const missing = /PGRST202|42883|Could not find the function|lt_behavior|未知的后台函数/.test(String((error && error.message) || error));
      ltBeh.error = missing ? '种田行为分析要先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261122-宗主任期与种田分析.sql（可重复执行，不删数据）。' : `读取失败：${(error && error.message) || error}`;
    }
    ltBehRender();
  }
  // 当前班级的行（没选班级时是本课程全部），已和数据统计合并；已销号的不参加排名和全班合计
  function ltBehRows() {
    const stats = new Map((lt.stats || []).map((p) => [p.actor_id, p]));
    return (ltBeh.rows || []).filter((b) => !state.klass || String(b.class_id) === String(state.klass.id)).map((b) => ltBehRow(b, stats.get(b.actor_id)));
  }
  // 经营特点（给老师看的几句话）：都从这位同学自己的数字和全班的对比里来，不下“好坏”的评语
  function ltBehInsight(p, ctx) {
    const lines = [];
    const rank = (key) => 1 + ctx.live.filter((q) => q[key] > p[key]).length;
    lines.push(`累计获得 ${ltFmt(p.earned)} 灵石（本班第 ${rank('earned')}），现在手里有 ${ltFmt(p.stones)}（第 ${rank('stones')}）；已经花掉 ${ltFmt(p.spendTotal)}${p.frozen ? `，另有 ${ltFmt(p.frozen)} 冻结在坊市委托或守田阵法里` : ''}。`);
    if (p.ops) {
      const times = ctx.medPerOp > 0 ? p.perOp / ctx.medPerOp : 0;
      lines.push(`来了 ${p.days} 天、${p.visits} 次，一共操作 ${ltFmt(p.ops)} 次（全班中位数 ${ltFmt(ctx.medOps)} 次），在灵田里操作约 ${ltFmt(p.minutes)} 分钟；平均每次操作带来 ${p.perOp.toFixed(1)} 灵石${times >= 1.5 ? `，是全班中位数（${ctx.medPerOp.toFixed(1)}）的 ${times.toFixed(1)} 倍` : times > 0 && times <= 0.67 ? `，低于全班中位数（${ctx.medPerOp.toFixed(1)}）` : `，全班中位数是 ${ctx.medPerOp.toFixed(1)}`}。`);
    }
    if (p.top && p.top.earned > 0) {
      const info = LT_CROP_INFO[p.top.crop];
      const net = info ? info.sell * info.units - info.seed : 0;
      const base = LT_CROP_INFO.huangjing.sell * LT_CROP_INFO.huangjing.units - LT_CROP_INFO.huangjing.seed;
      lines.push(`卖灵植的收入主要来自${p.top.name}：种了 ${ltFmt(p.top.planted)} 次、卖出 ${ltFmt(p.top.sold)} 份，得 ${ltFmt(p.top.earned)} 灵石，占卖灵植收入的 ${Math.round(p.topShare * 100)}%。`
        + (info && p.top.crop !== 'huangjing' ? `${p.top.name}要${LT_REALMS[info.realm]}才能种，一块田一茬（约 ${info.minutes >= 60 ? `${(info.minutes / 60).toFixed(info.minutes % 60 ? 1 : 0)} 小时` : `${info.minutes} 分钟`}）净挣 ${net} 灵石，黄精芝是 ${base}。` : ''));
    } else if (!ltNum(p.income.shop)) {
      lines.push('还没有卖过灵植，收入来自委托、任务奖励和开局送的灵石。');
    }
    if (p.sellOps >= 3 && p.top && p.top.sold > 0) {
      const each = p.crops.reduce((sum, c) => sum + c.sold, 0) / p.sellOps;
      if (each >= 10) lines.push(`攒够了一起卖：${p.sellOps} 次卖出平均每次 ${each.toFixed(0)} 份。`);
    }
    const bought = [];
    if (ltNum(p.spend.unlock)) bought.push(`开垦 ${ltFmt(p.spend.unlock)}（现有 ${p.plots} 块田）`);
    if (ltNum(p.spend.tool)) bought.push(`农具 ${ltFmt(p.spend.tool)}（锄头 ${ltNum(p.tools.hoe) || 1} 级、浇水壶 ${ltNum(p.tools.wateringCan) || 1} 级）`);
    if (ltNum(p.spend.decor)) bought.push(`小景 ${ltFmt(p.spend.decor)}`);
    if (ltNum(p.spend.residence)) bought.push(`宅邸 ${ltFmt(p.spend.residence)}`);
    const keep = p.earned ? Math.round(p.stones * 100 / p.earned) : 0;
    lines.push(`花出去的 ${ltFmt(p.spendTotal)} 里，种子 ${ltFmt(p.spend.seed)}${ltNum(p.spend.brew) ? `、炼丹炉费 ${ltFmt(p.spend.brew)}` : ''}；置办家当 ${ltFmt(p.assets)}${bought.length ? `：${bought.join('、')}` : ''}${!ltNum(p.spend.decor) && !ltNum(p.spend.residence) ? '，没有买小景和宅邸' : ''}。累计获得的灵石有 ${keep}% 还留在手里。`);
    const busy = Object.entries(p.hours).map(([hour, n]) => [Number(hour), ltNum(n)]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter((item) => item[1] > 0).map((item) => item[0]).sort((a, b) => a - b);
    if (busy.length) lines.push(`常在 ${busy.map((hour) => `${hour} 点`).join('、')}前后来。${p.stealOk + p.stealFail ? `偷菜成功 ${p.stealOk} 次、失败 ${p.stealFail} 次。` : ''}${p.marketSold + p.marketBought ? `坊市卖出成交 ${p.marketSold} 笔、买入 ${p.marketBought} 笔。` : ''}`);
    if (p.gap) lines.push(`账上有 ${ltFmt(Math.abs(p.gap))} 灵石对不上（${p.gap > 0 ? '记录比存档多' : '存档比记录多'}）：个别操作在记录里成功了、存档里没有生效，是云函数 11 月 22 日以前的一个并发问题留下的，不影响这位同学现有的灵石。`);
    return lines;
  }
  function ltBehRender() {
    const box = $('[data-lt-beh-charts]'), status = $('[data-lt-beh-status]');
    const I = window.ClassLiveInsights;
    if (!box) return;
    if (ltBeh.error) { box.textContent = ''; if (status) status.textContent = ltBeh.error; return; }
    if (!ltBeh.rows || !lt.stats) return;
    box.textContent = '';
    if (!I) { box.textContent = '图表脚本没有加载，请刷新页面再试。'; return; }
    I.addStyle();
    const rows = ltBehRows();
    const scope = state.klass ? `本班（${state.klass.name}）` : '本课程';
    if (status) status.textContent = `${scope}：分析到 ${clock(ltBeh.at)}。灵石的来路和去向按游戏里每一步操作的记录逐条相加；点表里的姓名看个人种田分析卡。`;
    if (!rows.length) { I.empty(box, state.klass ? '本班还没有同学进入过云间灵田。' : '还没有同学进入过云间灵田。'); return; }
    const T = I.tones, CAT = I.cat;
    const live = rows.filter((p) => !p.banned);
    const ctx = { live, medOps: ltMedian(live.filter((p) => p.ops > 0).map((p) => p.ops)), medPerOp: ltMedian(live.filter((p) => p.ops > 0).map((p) => p.perOp)) };
    const total = (key) => live.reduce((sum, p) => sum + ltNum(p[key]), 0);
    const avg = (key) => (live.length ? total(key) / live.length : 0);
    const richest = live.slice().sort((a, b) => b.earned - a.earned)[0];
    I.tiles(box, [
      { label: '累计获得（人均）', value: ltFmt(avg('earned')), note: `含开局送的 ${ltFmt(live[0] ? live[0].start : 520)}；最多 ${richest ? `${richest.name} ${ltFmt(richest.earned)}` : '—'}` },
      { label: '现有灵石（人均）', value: ltFmt(avg('stones')), note: `全班累计获得的灵石有 ${total('earned') ? Math.round(total('stones') * 100 / total('earned')) : 0}% 还留在手里` },
      { label: '已经花掉（合计）', value: ltFmt(total('spendTotal')), note: `置办家当 ${ltFmt(total('assets'))}；种子、炉费等经营花费 ${ltFmt(total('running'))}` },
      { label: '每次操作带来的灵石', value: ctx.medPerOp.toFixed(1), note: `全班中位数；操作次数的中位数是 ${ltFmt(ctx.medOps)} 次` },
    ]);
    const grid = document.createElement('div');
    grid.className = 'ins-grid';
    box.appendChild(grid);
    const A = ltArrange(I, grid, LT_BEH_PLAN);   // 按分组摆（见上面的 LT_BEH_PLAN）
    const add = (title, sub, wide) => { const c = A.card(grid, title, sub, wide); const host = document.createElement('div'); c.appendChild(host); return [c, host]; };
    // 1 累计获得最多的同学：现有灵石＋置办家当＋经营花费
    const SERIES = [{ name: '现有灵石', color: CAT[0] }, { name: '置办家当（开垦、农具、小景、宅邸）', color: CAT[1] }, { name: '经营花费（种子、炉费、买入、赔付）', color: CAT[2] }, { name: '冻结中', color: T.neutral }];
    const topRows = live.slice().sort((a, b) => b.earned - a.earned || a.sid.localeCompare(b.sid)).slice(0, 12);
    const [c1, h1] = add('累计获得灵石最多的同学', `前 ${topRows.length} 位（已销号的不计）。一整条是累计获得的灵石，分成还在手里的、置办成家当的和经营花掉的；悬停看具体数字。`, true);
    I.keys(h1, SERIES.filter((s, k) => k < 3 || topRows.some((p) => p.frozen > 0)));
    I.splitBars(h1, c1, topRows.map((p) => ({ label: p.name, values: [p.stones, p.assets, p.running, p.frozen],
      lines: [`${p.name}（${p.aliasText || '未起道号'}）`, `累计获得 ${ltFmt(p.earned)}`, `操作 ${ltFmt(p.ops)} 次 · 来了 ${p.days} 天`] })), SERIES, { unit: '', aria: '累计获得灵石最多的同学分段横条图' });
    I.tableView(c1, ['姓名', '道号', '累计获得', '现有灵石', '置办家当', '经营花费', '冻结中', '操作次数', '来的天数'], topRows.map((p) => [p.name, p.aliasText, p.earned, p.stones, p.assets, p.running, p.frozen, p.ops, p.days]));
    // 2 灵石从哪里来、花到哪里去（全班）
    const incomeParts = [{ label: '开局赠送', value: total('start'), color: T.neutral }].concat(LT_INCOME.map(([key, label], k) => ({ label, value: live.reduce((sum, p) => sum + ltNum(p.income[key]), 0), color: CAT[k % CAT.length] })));
    const [c2, h2] = add('灵石从哪里来', `${scope}累计获得 ${ltFmt(total('earned'))} 灵石。`);
    I.donut(h2, c2, incomeParts, { unit: '', center: ltFmt(total('earned')), centerSub: '累计获得', aria: '灵石来源环形图' });
    I.tableView(c2, ['来源', '灵石'], incomeParts.map((d) => [d.label, d.value]));
    const spendParts = LT_SPEND.map(([key, label], k) => ({ label, value: live.reduce((sum, p) => sum + ltNum(p.spend[key]), 0), color: (I.catExt || CAT)[k % (I.catExt || CAT).length] }));
    const [c3, h3] = add('灵石花到哪里去', `${scope}一共花掉 ${ltFmt(total('spendTotal'))} 灵石。`);
    I.donut(h3, c3, spendParts, { unit: '', center: ltFmt(total('spendTotal')), centerSub: '已经花掉', empty: '还没有同学花过灵石。', aria: '灵石去向环形图' });
    I.tableView(c3, ['去向', '灵石'], spendParts.map((d) => [d.label, d.value]));
    // 3 来得多不等于挣得多：操作次数和累计获得，颜色是主要种的灵植
    const CROP_TONE = { huangjing: CAT[6], zihou: CAT[5], tianling: CAT[1], yueyang: CAT[2], jiuqu: CAT[3], '': T.other };
    const pts = live.filter((p) => p.ops > 0).map((p) => ({ x: p.ops, y: p.earned, color: CROP_TONE[p.top ? p.top.crop : ''] || T.other, label: `${p.name}（${p.sid}）`,
      lines: [`操作 ${ltFmt(p.ops)} 次 · 来了 ${p.days} 天`, `累计获得 ${ltFmt(p.earned)} · 现有 ${ltFmt(p.stones)}`, `主要种${p.top ? p.top.name : '（还没卖过灵植）'}`, `每次操作带来 ${p.perOp.toFixed(1)} 灵石`] }));
    const [c4, h4] = add('操作次数和累计获得', '每个点是一位同学，颜色是 TA 卖得最多的灵植：横轴是在灵田里的操作次数，纵轴是累计获得的灵石；细线是两者的中位数。越靠左上，操作越少、挣得越多；刚进来、玩得不多的同学都挤在左下角。', true);
    if (pts.length) I.keys(h4, Object.keys(LT_CROPS).filter((key) => live.some((p) => p.top && p.top.crop === key)).map((key) => ({ name: `主要种${LT_CROPS[key]}`, color: CROP_TONE[key], dot: true }))
      .concat(live.some((p) => p.ops > 0 && !p.top) ? [{ name: '还没卖过灵植', color: T.other, dot: true }] : []));
    I.scatter(h4, c4, pts, { xName: '操作次数', yName: '累计获得（灵石）', aria: '操作次数与累计获得散点图', empty: '还没有同学在灵田里操作过。',
      quadrants: [[1, 1, '操作多 · 挣得多'], [0, 1, '操作少 · 挣得多'], [1, 0, '操作多 · 挣得少']] });   // 左下角点最密，不再压一行字
    I.tableView(c4, ['学号', '姓名', '操作次数', '累计获得', '每次操作带来'], live.filter((p) => p.ops > 0).sort((a, b) => b.earned - a.earned).map((p) => [p.sid, p.name, p.ops, p.earned, Number(p.perOp.toFixed(1))]));
    // 4 经营得好的同学，好在哪里（累计获得前五位）
    const best = live.slice().sort((a, b) => b.earned - a.earned || a.sid.localeCompare(b.sid)).filter((p) => p.ops > 0).slice(0, 5);
    const c5 = A.card(grid, '经营得好的同学，好在哪里', `累计获得灵石最多的 ${best.length} 位：每人几句话，都是从 TA 自己的操作记录和全班的对比里算出来的。`, true);
    const list = document.createElement('div');
    list.className = 'tw-lt-beh-best';
    list.innerHTML = best.map((p, k) => `<article><h5><i>${k + 1}</i><button type="button" class="ins-name" data-lt-beh-person="${esc(p.actor)}" title="看个人种田分析卡">${esc(p.name)}</button><small>${esc(p.sid)}${p.aliasText ? ` · ${esc(p.aliasText)}` : ''}</small></h5><ul>${ltBehInsight(p, ctx).map((line) => `<li>${esc(line)}</li>`).join('')}</ul></article>`).join('')
      || '<p class="ins-empty">还没有同学在灵田里操作过。</p>';
    c5.appendChild(list);
    // 5 个人种田分析卡
    const cK = A.card(grid, '个人种田分析卡', '点上面或下表里的姓名，看这位同学怎么经营自己的灵田：和全班平均的对比、灵石的来路和去向、种什么卖什么、哪天置办了什么、什么时候来。', true);
    cK.dataset.ltBehCard = '';
    const hostK = document.createElement('div'); cK.appendChild(hostK);
    const metric = (fn) => ({ avg: live.length ? Math.round(live.reduce((t, q) => t + fn(q), 0) / live.length * 10) / 10 : 0, max: Math.max(0, ...live.map(fn)) });
    const METRICS = [['累计获得', (q) => q.earned, null, '', '累计获得'], ['现有灵石', (q) => q.stones, null, '', '现有灵石'], ['操作次数', (q) => q.ops, null, ' 次', '操作'],
      ['来的天数', (q) => q.days, null, ' 天', '天数'], ['每次操作带来', (q) => Math.round(q.perOp * 10) / 10, null, '', '每次操作'], ['开垦灵田', (q) => q.plots, 25, ' 块', '开垦'],
      ['偷菜成功', (q) => q.stealOk, null, ' 次', '偷菜'], ['灵田答题正确率', (q) => Math.round(q.quizRate * 100), 100, '%', '答题']];
    const showPerson = (actor, scroll) => {
      const p = rows.find((q) => q.actor === actor);
      if (!p) return;
      ltBeh.person = actor;
      hostK.textContent = '';
      const head = document.createElement('div');
      head.className = 'ins-person';
      const strong = document.createElement('strong'); strong.textContent = p.name;
      const meta = document.createElement('span');
      const who = lt.players.find((q) => q.actor_id === actor) || {};
      const when = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
      meta.textContent = `${p.sid} · 道号 ${p.aliasText || '（未起道号）'} · ${ltSectName(who.sect)} · ${LT_REALMS[Number(who.realm) || 0]}${p.banned ? ' · 已销号' : ''} · 第一次操作 ${when(p.first)} · 最近一次 ${when(p.last)}`;
      head.append(strong, meta);
      hostK.appendChild(head);
      const notes = document.createElement('ul');
      notes.className = 'tw-lt-beh-notes';
      notes.innerHTML = ltBehInsight(p, ctx).map((line) => `<li>${esc(line)}</li>`).join('');
      hostK.appendChild(notes);
      const personRows = METRICS.map(([label, fn, max, unit, short]) => { const m = metric(fn); return { label, short, me: fn(p), avg: m.avg, max: max == null ? m.max : max, unit, note: max == null ? `全班最高 ${ltFmt(m.max, m.max % 1 ? 1 : 0)}${unit}` : '' }; });
      I.keys(hostK, [{ name: '本人', color: T.pink }, { name: '全班平均', color: T.blue }]);
      const pair = document.createElement('div');
      pair.className = 'ins-person-grid';
      const hostRadar = document.createElement('div'), hostBars = document.createElement('div');
      pair.append(hostRadar, hostBars);
      hostK.appendChild(pair);
      I.radar(hostRadar, cK, personRows, { noKeys: true, aria: `${p.name} 和全班平均的雷达图` });
      I.compare(hostBars, cK, personRows, { noKeys: true, aria: `${p.name} 的种田分析卡` });
      const block = (title, note) => { const wrap = document.createElement('section'); wrap.className = 'tw-lt-beh-part'; const h = document.createElement('h5'); h.textContent = title; wrap.appendChild(h);
        if (note) { const small = document.createElement('p'); small.className = 'tw-hint'; small.textContent = note; wrap.appendChild(small); } const host = document.createElement('div'); wrap.appendChild(host); return [wrap, host]; };
      const two = document.createElement('div');
      two.className = 'tw-lt-beh-two';
      hostK.appendChild(two);
      const [wIn, hIn] = block('灵石从哪里来', `累计获得 ${ltFmt(p.earned)}（含开局送的 ${ltFmt(p.start)}）`);
      two.appendChild(wIn);
      I.bars(hIn, cK, [{ label: '开局赠送', value: p.start, lines: ['开局赠送'] }].concat(LT_INCOME.map(([key, label]) => ({ label, value: ltNum(p.income[key]), lines: [label] }))).filter((d) => d.value > 0),
        { unit: '', labelMax: 130, aria: `${p.name} 的灵石来源横条图`, empty: '还没有收入。' });
      const [wOut, hOut] = block('灵石花到哪里去', `已经花掉 ${ltFmt(p.spendTotal)}；现有 ${ltFmt(p.stones)}${p.frozen ? `，冻结中 ${ltFmt(p.frozen)}` : ''}`);
      two.appendChild(wOut);
      I.bars(hOut, cK, LT_SPEND.map(([key, label]) => ({ label, value: ltNum(p.spend[key]), lines: [label] })).filter((d) => d.value > 0), { unit: '', labelMax: 130, aria: `${p.name} 的灵石去向横条图`, empty: '还没有花过灵石。' });
      const two2 = document.createElement('div');
      two2.className = 'tw-lt-beh-two';
      hostK.appendChild(two2);
      const [wCrop, hCrop] = block('种什么、卖什么', '按卖给药铺的收入从多到少；“一块田一茬净挣”是这种灵植的种子钱和药铺收购价算出来的。');
      two2.appendChild(wCrop);
      hCrop.innerHTML = p.crops.length ? `<div class="tw-scroll"><table class="tw-table compact tw-lt-beh-table"><thead><tr><th>灵植</th><th>种了</th><th>种子钱</th><th>卖出</th><th>卖得</th><th>一块田一茬净挣</th></tr></thead><tbody>${p.crops.map((c) => {
        const info = LT_CROP_INFO[c.crop];
        return `<tr><td>${esc(c.name)}</td><td class="num">${c.planted ? `${ltFmt(c.planted)} 次` : '—'}</td><td class="num">${c.seed ? ltFmt(c.seed) : '—'}</td><td class="num">${c.sold ? `${ltFmt(c.sold)} 份` : '—'}</td><td class="num">${c.earned ? ltFmt(c.earned) : '—'}</td><td class="num">${info ? info.sell * info.units - info.seed : '—'}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="ins-empty">还没有种过、卖过灵植。</p>';
      const [wAsset, hAsset] = block('哪天置办了什么', `开垦、农具、小景和宅邸，共 ${ltFmt(p.assets)} 灵石`);
      two2.appendChild(wAsset);
      const decorName = (id) => { const tree = { verdantPine: '苍翠松', banyanTree: '青冠榕', weepingWillow: '垂丝柳' }; const base = String(id || '').replace(/\d+$/, '');
        return ({ bambooFence: '青竹篱', stoneLantern: '暖玉石灯', spiritPond: '照影灵池', lotusPond: '听荷莲池', moonArch: '照月景门', jadePavilion: '栖云亭', blossomTree: '绯桃花树',
          bambooResidence: '听雨竹舍', mapleCourtyard: '枫庭雅院', moonResidence: '望月水榭', starResidence: '星河云邸', hoe: '锄头', wateringCan: '浇水壶' })[id] || tree[base] || String(id || ''); };
      hAsset.innerHTML = p.assetsLog.length ? `<ul class="tw-lt-beh-log">${p.assetsLog.map((a) => `<li><time>${esc(ltDayText(a.day))}</time><span>${esc(a.kind === 'unlock' ? `开垦 ${ltNum(a.n)} 块灵田` : `${LT_ASSET_NAME[a.kind] || a.kind}：${decorName(a.what)}${ltNum(a.n) > 1 ? ` ×${ltNum(a.n)}` : ''}`)}</span><b>${ltFmt(a.amount)}</b></li>`).join('')}</ul>`
        : '<p class="ins-empty">还没有置办过家当。</p>';
      // 每天：操作次数、挣到的灵石（两张图，单位不同不混在一个轴上）
      const days = p.daily.map((d) => ({ key: d.day, label: `${Number(String(d.day).slice(5, 7))}/${Number(String(d.day).slice(8, 10))}`, ops: ltNum(d.ops), earned: ltNum(d.earned), spent: ltNum(d.spent) }));
      const two3 = document.createElement('div');
      two3.className = 'tw-lt-beh-two';
      hostK.appendChild(two3);
      const [wOps, hOps] = block('每天操作多少次', `来了 ${p.days} 天、${p.visits} 次（相隔半小时以上算另一次）`);
      two3.appendChild(wOps);
      I.columns(hOps, cK, days.map((d) => ({ key: d.key, label: d.label, value: d.ops, lines: [ltDayText(d.key), `花掉 ${ltFmt(d.spent)} 灵石`] })), { unit: ' 次', height: 190, aria: `${p.name} 每天的操作次数柱状图`, empty: '还没有操作记录。' });
      const [wEarn, hEarn] = block('每天挣到多少灵石', '卖灵植、委托和任务奖励（坊市成交、守田赔付不按天分）');
      two3.appendChild(wEarn);
      I.columns(hEarn, cK, days.map((d) => ({ key: d.key, label: d.label, value: d.earned, lines: [ltDayText(d.key), `操作 ${ltFmt(d.ops)} 次`] })), { unit: '', height: 190, color: T.green, aria: `${p.name} 每天挣到的灵石柱状图`, empty: '还没有挣到灵石。' });
      const [wHour, hHour] = block('一天里什么时候来', '北京时间，各个钟点的操作次数（所有天加在一起）');
      hostK.appendChild(wHour);
      I.columns(hHour, cK, Array.from({ length: 24 }, (_, hour) => ({ key: String(hour), label: `${hour}`, value: ltNum(p.hours[hour]), lines: [`${hour} 点到 ${hour + 1} 点`] })), { unit: ' 次', height: 170, color: T.purple, aria: `${p.name} 各钟点的操作次数柱状图`, empty: '还没有操作记录。' });
      if (scroll) cK.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    ltBeh.show = showPerson;
    const firstPerson = rows.find((q) => q.actor === ltBeh.person) || best[0] || rows[0];
    if (firstPerson) showPerson(firstPerson.actor, false);
    // 6 每位同学一行
    const all = rows.slice().sort((a, b) => b.earned - a.earned || a.sid.localeCompare(b.sid));
    const c6 = A.card(grid, '每位同学', `按累计获得的灵石从多到少，共 ${all.length} 位；点姓名看个人种田分析卡。`, true);
    const wrap = document.createElement('div');
    wrap.className = 'tw-scroll';
    wrap.innerHTML = `<table class="tw-table compact ins-people tw-lt-beh-table"><thead><tr><th>学号</th><th>姓名</th><th>道号</th><th title="开局送的 520 ＋ 全部收入">累计获得</th><th>现有灵石</th><th title="开垦、农具、小景、宅邸">置办家当</th><th title="种子、炉费、坊市买入、买卡牌、偷菜赔付">经营花费</th><th>操作</th><th>来的天数</th><th title="相隔半小时以上算另一次">来的次数</th><th title="全部收入 ÷ 操作次数">每次操作带来</th><th>主要种</th></tr></thead><tbody>${all.map((p) => `<tr${p.banned ? ' class="is-banned"' : ''}><td>${esc(p.sid)}</td>`
      + `<td><button type="button" class="ins-name" data-lt-beh-person="${esc(p.actor)}" title="看个人种田分析卡">${esc(p.name)}</button></td><td>${p.banned ? `<s>${esc(p.aliasText)}</s>` : esc(p.aliasText)}</td>`
      + `<td class="num"><b>${ltFmt(p.earned)}</b>${p.gap ? `<i class="tw-lt-beh-gap" title="账上有 ${ltFmt(Math.abs(p.gap))} 灵石对不上（${p.gap > 0 ? '记录比存档多' : '存档比记录多'}）：个别操作记录里成功了、存档里没有生效">*</i>` : ''}</td><td class="num">${ltFmt(p.stones)}</td><td class="num">${ltFmt(p.assets)}</td><td class="num">${ltFmt(p.running)}</td>`
      + `<td class="num">${ltFmt(p.ops)}</td><td class="num">${p.days}</td><td class="num">${p.visits}</td><td class="num">${p.perOp.toFixed(1)}</td><td>${p.top ? esc(p.top.name) : '—'}</td></tr>`).join('')}</tbody></table>`;
    c6.appendChild(wrap);
    if (all.some((p) => p.gap)) { const foot = document.createElement('p'); foot.className = 'tw-hint'; foot.textContent = '带 * 的：账上有少量灵石对不上——个别操作在记录里成功了、存档里没有生效（云函数 11 月 22 日以前的一个并发问题，已修）。不影响这些同学现有的灵石。'; c6.appendChild(foot); }
    A.finish();
  }
  // ---------- 静修数据统计（2026-11-23 用户：“在工作台里加一个静修数据统计”） ----------
  // 学生在云间灵田底栏“静修”里用番茄钟专注学习（2026-11-22 接入）。数据：lt_focus_stats，只读静修自己的账本——
  //   每天专注了多久（北京时间；一天满 25 分钟算“打卡”，与静修修行录相同）、已经结束的每一段（到时完成的、中途结束的、立愿写了什么）、
  //   悟玉进账（完成一段的悟玉、和道友同室专注的加成）、衣装坊置办的衣装、成就、道友、在哪间雅室、一周里各时段专注了多久。
  // 时长只算服务器确认过的专注：暂停、切出页面、断线的时间都不算。静修不计入课程修为，这里只看学习习惯。
  const LT_FOCUS_AVATAR = { jade: '玉衣书生', peach: '桃衣剑修', cloud: '云岚丹师', ink: '墨衣游侠' };
  // 衣装（名字、悟玉价格）和成就，与静修模块的 focus-catalog.js 一致；价格为 0 的是成就送的限定衣装
  const LT_FOCUS_ITEMS = { head_bamboo: ['青竹冠', 50], head_cloud: ['流云冠', 150], head_star: ['星河冠', 500], robe_bamboo: ['听雨衫', 80], robe_cloud: ['鹤纹袍', 200], robe_star: ['太清羽衣', 500],
    bottom_bamboo: ['竹影下裳', 50], bottom_cloud: ['云纹下裳', 150], bottom_star: ['月华下裳', 300], accessory_bamboo: ['书卷佩', 50], accessory_cloud: ['青玉佩', 150], accessory_star: ['流萤灵灯', 300],
    accessory_inkjade: ['凝墨玉佩', 0], robe_cloudink: ['云笺鹤袍', 0], head_stargaze: ['观星玉冠', 0], robe_eternal: ['太初玄衣', 0], head_dew: ['晨露竹冠', 0], bottom_dawn: ['望舒流霞裳', 0], accessory_everlight: ['长明琉璃灯', 0] };
  const LT_FOCUS_ACH = { hours_10: ['初窥门径', '累计专注 10 小时'], hours_50: ['云笺有成', '累计专注 50 小时'], hours_100: ['百时观星', '累计专注 100 小时'], hours_500: ['太初问道', '累计专注 500 小时'],
    streak_7: ['七日持心', '连续 7 天打卡'], streak_30: ['月满不辍', '连续 30 天打卡'], streak_100: ['百日长明', '连续 100 天打卡'] };
  const LT_FOCUS_CHECKIN = 25 * 60000;   // 一天专注满 25 分钟算打卡
  const ltFocus = { rows: null, rooms: [], at: 0, error: '', person: '', loading: false };
  const ltMin = (ms) => Math.round(ltNum(ms) / 60000);
  const ltDur = (ms) => {
    const v = ltNum(ms);
    if (v > 0 && v < 60000) return '不到 1 分钟';
    const m = Math.round(v / 60000);
    return m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ` ${m % 60} 分钟` : ''}` : `${m} 分钟`;
  };
  const ltBjDay = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
  const ltPrevDay = (key) => new Date(Date.parse(`${key}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const ltWhen = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
  const ltRate = (value) => (value >= 0 ? `${Math.round(value * 100)}%` : '—');
  const ltItemName = (id) => (LT_FOCUS_ITEMS[id] || [id])[0];
  // 一位同学（p：lt_focus_stats 的一行；at：统计时刻）
  function ltFocusRow(p, at) {
    const days = Object.entries(p.days && typeof p.days === 'object' ? p.days : {})
      .map(([day, d]) => ({ day, ms: ltNum(d && d.focusMs), done: ltNum(d && d.completed) }))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day)).sort((a, b) => a.day.localeCompare(b.day));
    const today = ltBjDay(at);
    const byDay = new Map(days.map((d) => [d.day, d]));
    const checked = (key) => ((byDay.get(key) || {}).ms || 0) >= LT_FOCUS_CHECKIN;
    let streak = 0;   // 现在连续打卡几天（今天还没满 25 分钟时从昨天往前数，与静修相同）
    for (let key = checked(today) ? today : ltPrevDay(today); checked(key); key = ltPrevDay(key)) streak += 1;
    let best = 0, run = 0, prev = '';
    days.filter((d) => d.ms >= LT_FOCUS_CHECKIN).forEach((d) => { run = prev && ltPrevDay(d.day) === prev ? run + 1 : 1; best = Math.max(best, run); prev = d.day; });
    const weekFrom = ltBjDay(at - 6 * 86400000);
    const ended = ltNum(p.done) + ltNum(p.cancelled);
    const purchases = Object.entries(p.purchases && typeof p.purchases === 'object' ? p.purchases : {})
      .map(([id, v]) => ({ id, name: ltItemName(id), price: ltNum(v && v.price), at: ltNum(v && v.at) })).sort((a, b) => a.at - b.at);
    const achievements = Object.entries(p.achievements && typeof p.achievements === 'object' ? p.achievements : {})
      .map(([id, v]) => ({ id, name: (LT_FOCUS_ACH[id] || [id])[0], rule: (LT_FOCUS_ACH[id] || ['', ''])[1], at: ltNum(v && v.unlockedAt) })).sort((a, b) => a.at - b.at);
    const a = p.active && typeof p.active === 'object' ? p.active : null;
    const now = !p.seated ? '' : a && a.status === 'running' ? (a.kind === 'break' ? '小憩中' : '专注中') : a && a.status === 'paused' ? '暂停中' : '在雅室里';
    const targets = Object.entries(p.targets && typeof p.targets === 'object' ? p.targets : {})
      .map(([text, n]) => ({ text, n: ltNum(n) })).sort((x, y) => y.n - x.n || x.text.localeCompare(y.text, 'zh-CN'));
    const alias = !ltDefaultAlias(p.alias) ? String(p.alias) : p.nickname && !ltDefaultAlias(p.nickname) ? String(p.nickname) : '（未起道号）';
    return {
      actor: p.actor_id, sid: String(p.sid || ''), name: String(p.name || p.sid || ''), classId: p.class_id, banned: !!p.banned, aliasText: alias,
      avatar: LT_FOCUS_AVATAR[p.avatar] || '', created: ltNum(p.created_at), last: Math.max(ltNum(p.last_focus_at), ltNum(p.last_session_at)),
      totalMs: ltNum(p.total_ms), days, activeDays: days.filter((d) => d.ms > 0).length, checkDays: days.filter((d) => d.ms >= LT_FOCUS_CHECKIN).length,
      streak, best: Math.max(best, ltNum(p.best_streak)), weekMs: days.filter((d) => d.day >= weekFrom && d.day <= today).reduce((t, d) => t + d.ms, 0), todayMs: (byDay.get(today) || {}).ms || 0,
      sessions: ltNum(p.sessions), done: ltNum(p.done), cancelled: ltNum(p.cancelled), ended, doneRate: ended ? ltNum(p.done) / ended : -1,
      pomodoroSessions: ltNum(p.pomodoro_sessions), doneMs: ltNum(p.done_ms), cancelMs: ltNum(p.cancel_ms),
      share: ltNum(p.wall_total_ms) > 0 ? Math.min(1, ltNum(p.wall_focus_ms) / ltNum(p.wall_total_ms)) : -1,   // 完成的段里，专注占从开始到结束的比例
      avgMs: ltNum(p.sessions) ? (ltNum(p.done_ms) + ltNum(p.cancel_ms)) / ltNum(p.sessions) : 0,
      jade: ltNum(p.jade), earned: ltNum(p.reward_base) + ltNum(p.reward_bonus), bonus: ltNum(p.reward_bonus), friendMs: ltNum(p.friend_ms),
      spent: purchases.reduce((t, x) => t + x.price, 0), purchases, achievements,
      friends: ltNum(p.friends), friendRequests: ltNum(p.friend_requests), roomsOwned: ltNum(p.rooms_owned),
      now, active: a, roomTitle: p.room_title || '', plans: p.plans && typeof p.plans === 'object' ? p.plans : {}, targets, recent: Array.isArray(p.recent) ? p.recent : [],
      roomMs: p.room_ms && typeof p.room_ms === 'object' ? p.room_ms : {}, heat: p.heat && typeof p.heat === 'object' ? p.heat : {},
    };
  }
  async function ltFocusLoad() {
    if (!backend || ltFocus.loading) return;
    ltFocus.loading = true;
    const status = $('[data-lt-focus-status]');
    if (status) status.textContent = '正在读取……';
    try {
      const data = await backend.rpc('lt_focus_stats', { p_course: course.slug });
      const row = (Array.isArray(data) ? data[0] : data) || {};
      ltFocus.at = Number(row.at) || Date.now();
      ltFocus.rows = (Array.isArray(row.players) ? row.players : []).map((p) => ltFocusRow(p, ltFocus.at));
      ltFocus.rooms = Array.isArray(row.rooms) ? row.rooms : [];
      ltFocus.error = '';
    } catch (error) {
      const missing = /PGRST202|42883|Could not find the function|lt_focus_stats|未知的后台函数/.test(String((error && error.message) || error));
      ltFocus.error = missing ? '静修数据统计要先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261123-静修数据统计与在线.sql（可重复执行，不删不改任何数据）。' : `读取失败：${(error && error.message) || error}`;
    } finally {
      ltFocus.loading = false;
    }
    ltFocusRender();
  }
  // 当前班级的行（没选班级时是本课程全部）
  const ltFocusRows = () => (ltFocus.rows || []).filter((p) => !state.klass || String(p.classId) === String(state.klass.id));
  // 每天（全班加起来）：从最早有静修的那天到今天，一天不落
  function ltFocusDays(live) {
    const map = new Map();
    live.forEach((p) => p.days.forEach((d) => {
      if (!(d.ms > 0) && !d.done) return;
      const x = map.get(d.day) || { ms: 0, people: 0, done: 0 };
      x.ms += d.ms; if (d.ms > 0) x.people += 1; x.done += d.done;
      map.set(d.day, x);
    }));
    const keys = Array.from(map.keys()).sort();
    const today = ltBjDay(ltFocus.at || Date.now());
    const list = [];
    if (keys.length && keys[0] <= today) for (let key = today; key >= keys[0]; key = ltPrevDay(key)) list.unshift(key);
    else list.push(...keys);
    return list.map((day) => ({ day, ...(map.get(day) || { ms: 0, people: 0, done: 0 }) }));
  }
  const LT_WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const ltWeekOf = (key) => LT_WEEK[new Date(`${key}T12:00:00Z`).getUTCDay()];
  function ltFocusTiles(rows) {
    const live = rows.filter((p) => !p.banned);
    const total = (key) => live.reduce((t, p) => t + ltNum(p[key]), 0);
    const roster = rosterOf().length;
    const focused = live.filter((p) => p.totalMs > 0).length;
    const top = live.slice().sort((a, b) => b.totalMs - a.totalMs)[0];
    const done = total('done'), cancelled = total('cancelled');
    const seated = live.filter((p) => p.now);
    const count = (word) => seated.filter((p) => p.now === word).length;
    return [
      { label: '用过静修', value: `${rows.length} 人`, note: `${roster ? `本班 ${roster} 人中的 ${Math.round(rows.length * 100 / roster)}%；` : ''}其中 ${focused} 人专注过${rows.length - live.length ? `；已销号 ${rows.length - live.length} 人` : ''}` },
      { label: '累计专注', value: `${ltFmt(total('totalMs') / 3600000, 1)} 小时`, note: `人均 ${ltDur(live.length ? total('totalMs') / live.length : 0)}${top && top.totalMs ? `；最多 ${top.name} ${ltDur(top.totalMs)}` : ''}` },
      { label: '近 7 天在静修', value: `${live.filter((p) => p.weekMs > 0).length} 人`, note: `共 ${ltDur(total('weekMs'))}；今天 ${live.filter((p) => p.todayMs > 0).length} 人` },
      { label: '完成率', value: done + cancelled ? `${Math.round(done * 100 / (done + cancelled))}%` : '—', note: `到时完成 ${ltFmt(done)} 段、中途结束 ${ltFmt(cancelled)} 段` },
      { label: '此刻在雅室', value: `${seated.length} 人`, note: seated.length ? [['专注中', count('专注中')], ['暂停中', count('暂停中')], ['小憩中', count('小憩中')], ['在雅室里', count('在雅室里')]].filter((x) => x[1]).map((x) => `${x[0]} ${x[1]}`).join('、') : `统计时刻 ${clock(ltFocus.at)}` },
    ];
  }
  // 个人静修卡上的几句话：都从这位同学自己的记录和全班的对比里来，不下“好坏”的评语
  function ltFocusInsight(p, ctx) {
    const lines = [];
    const rank = (key) => 1 + ctx.live.filter((q) => q[key] > p[key]).length;
    lines.push(`累计专注 ${ltDur(p.totalMs)}（本班第 ${rank('totalMs')}），近 7 天 ${ltDur(p.weekMs)}；来了 ${p.activeDays} 天，其中 ${p.checkDays} 天满 25 分钟（打卡）${p.best ? `，最长连续打卡 ${p.best} 天` : ''}${p.streak ? `，现在已连续 ${p.streak} 天` : ''}。`);
    if (p.ended) {
      lines.push(`结束的 ${p.ended} 段里到时完成 ${p.done} 段，完成率 ${ltRate(p.doneRate)}（全班中位数 ${ltRate(ctx.medDone)}）${p.cancelled ? `；中途结束的 ${p.cancelled} 段里专注了 ${ltDur(p.cancelMs)}，也都记进了累计` : ''}。`);
    }
    if (p.share >= 0) lines.push(`到时完成的段里，专注时间占从开始到结束的 ${ltRate(p.share)}（全班中位数 ${ltRate(ctx.medShare)}），其余是暂停、切出页面或断线的时间。`);
    if (p.sessions) {
      const plan = Object.entries(p.plans).map(([m, n]) => [Number(m), ltNum(n)]).sort((x, y) => y[1] - x[1] || x[0] - y[0])[0];
      lines.push(`${p.pomodoroSessions * 2 >= p.sessions ? `多用番茄静修（${p.pomodoroSessions}/${p.sessions} 段）` : `多用自由静修（${p.sessions - p.pomodoroSessions}/${p.sessions} 段）`}${plan ? `，最常定 ${plan[0]} 分钟一段` : ''}，平均每段专注 ${ltDur(p.avgMs)}。`);
    }
    if (p.targets.length) lines.push(`最常写的立愿：${p.targets.slice(0, 3).map((t) => `“${t.text}”${t.n > 1 ? `（${t.n} 次）` : ''}`).join('、')}。`);
    const hours = Array(24).fill(0);
    Object.entries(p.heat).forEach(([k, ms]) => { const n = Number(k); if (n >= 0 && n < 168) hours[n % 24] += ltNum(ms); });
    const busy = hours.map((ms, h) => [h, ms]).filter((x) => x[1] > 0).sort((x, y) => y[1] - x[1]).slice(0, 3).map((x) => x[0]).sort((x, y) => x - y);
    if (busy.length) lines.push(`常在 ${busy.map((h) => `${h} 点`).join('、')}前后静修。`);
    lines.push(`得悟玉 ${ltFmt(p.earned)}${p.bonus ? `（其中道友同室加成 ${ltFmt(p.bonus)}）` : ''}${p.purchases.length ? `，在衣装坊置办 ${p.purchases.length} 件、花 ${ltFmt(p.spent)}` : '，还没有置办过衣装'}，现有 ${ltFmt(p.jade)}；${p.achievements.length ? `达成成就：${p.achievements.map((x) => `${x.name}（${x.rule}）`).join('、')}` : '还没有达成成就'}。`);
    lines.push(`${p.friends ? `有 ${p.friends} 位道友${p.friendMs ? `，和道友同室专注 ${ltDur(p.friendMs)}` : ''}` : '还没有结为道友'}${p.friendRequests ? `，${p.friendRequests} 个道友邀请待回应` : ''}${p.roomsOwned ? `；自己建了 ${p.roomsOwned} 间静室` : ''}。`);
    return lines;
  }
  function ltFocusRender() {
    const box = $('[data-lt-focus-charts]'), status = $('[data-lt-focus-status]');
    const I = window.ClassLiveInsights;
    if (!box) return;
    if (ltFocus.error) { box.textContent = ''; if (status) status.textContent = ltFocus.error; return; }
    if (!ltFocus.rows) return;
    box.textContent = '';
    if (!I) { box.textContent = '图表脚本没有加载，请刷新页面再试。'; return; }
    I.addStyle();
    const rows = ltFocusRows();
    const scope = state.klass ? `本班（${state.klass.name}）` : '本课程';
    if (status) status.textContent = `${scope}：统计到 ${clock(ltFocus.at)}。时长只算服务器确认过的专注（暂停、切出页面、断线的时间不算）；悬停在图上看详细数字，点姓名看个人静修卡。`;
    if (!rows.length) { I.empty(box, state.klass ? '本班还没有同学打开过静修。' : '还没有同学打开过静修。'); return; }
    const T = I.tones, CAT = I.cat;
    const live = rows.filter((p) => !p.banned);
    const total = (key) => live.reduce((t, p) => t + ltNum(p[key]), 0);
    const ctx = { live, medDone: ltMedian(live.filter((p) => p.doneRate >= 0).map((p) => p.doneRate)), medShare: ltMedian(live.filter((p) => p.share >= 0).map((p) => p.share)) };
    if (!live.some((p) => p.doneRate >= 0)) ctx.medDone = -1;
    if (!live.some((p) => p.share >= 0)) ctx.medShare = -1;
    I.tiles(box, ltFocusTiles(rows));
    const grid = document.createElement('div');
    grid.className = 'ins-grid';
    box.appendChild(grid);
    const A = ltArrange(I, grid, LT_FOCUS_PLAN);   // 按分组摆（见上面的 LT_FOCUS_PLAN）
    const add = (title, sub, wide) => { const c = A.card(grid, title, sub, wide); const host = document.createElement('div'); c.appendChild(host); return [c, host]; };
    // 1 每天静修了多少分钟（太长时左右滑着看）
    const WIN = 31;
    const dayData = ltFocusDays(live);
    const dayRows = dayData.map((d) => ({ key: d.day, label: d.day.slice(5), value: ltMin(d.ms), lines: [`${ltDayText(d.day)} ${ltWeekOf(d.day)}`, `${d.people} 位同学在静修`, `到时完成 ${d.done} 段`] }));
    const dayMax = dayRows.reduce((m, d) => Math.max(m, d.value), 0);
    const [c1, h1] = add('每天静修了多少分钟', `全班每天专注的分钟数（北京时间）；悬停看当天几位同学在静修、完成了几段${dayRows.length > WIN ? '；拖动图下的滑块（或在图上左右滑）看更早的' : ''}。`, true);
    I.windowed(h1, c1, dayRows, WIN, (b, slice, cardEl) => {
      if (slice.length < 3) I.columns(b, cardEl, slice, { unit: ' 分钟', color: T.purple, aria: '每天静修分钟数柱状图', yMax: dayMax, empty: '还没有同学专注过。' });
      else I.lines(b, cardEl, slice.map((d) => ({ label: d.label, values: [d.value], lines: d.lines })), [{ name: '静修分钟数', color: T.purple }], { unit: ' 分钟', area: true, dots: false, noLow: true, aria: '每天静修分钟数面积折线图', yMax: dayMax, empty: '还没有同学专注过。' });
    }, { labelOf: (d) => d.key.slice(5), unitName: '天', aria: '左右拖动，看更早或更近的日子' });
    I.tableView(c1, ['日期', '星期', '静修（分钟）', '在静修的同学', '到时完成的段'], dayData.map((d) => [d.day, ltWeekOf(d.day), ltMin(d.ms), d.people, d.done]));
    // 2 一周里什么时候静修（星期 × 钟点）
    const WEEKS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const heat = WEEKS.map(() => Array(24).fill(0));
    live.forEach((p) => Object.entries(p.heat).forEach(([k, ms]) => { const n = Number(k); if (n >= 0 && n < 168) heat[Math.floor(n / 24)][n % 24] += ltNum(ms) / 60000; }));
    const heatMin = heat.map((row) => row.map((v) => Math.round(v)));
    const [c2, h2] = add('一周里什么时候静修', '每格＝这一时段大家专注的分钟数（北京时间，各周加在一起；从浅橙到红越来越多，最浅的米白是 0）。', true);
    I.heatmap(h2, c2, WEEKS, Array.from({ length: 24 }, (_, i) => i), heatMin, { unit: ' 分钟', ramp: I.ramps.heat, aria: '静修时段热力图', empty: '还没有同学专注过。' });
    I.tableView(c2, ['星期', ...Array.from({ length: 24 }, (_, i) => `${i}时`)], heatMin.map((row, i) => [WEEKS[i], ...row]));
    // 3 专注时长最多的同学
    const topRows = live.filter((p) => p.totalMs > 0).sort((a, b) => b.totalMs - a.totalMs || a.sid.localeCompare(b.sid)).slice(0, 10);
    const [c3, h3] = add('专注时长最多的同学', `前 ${topRows.length} 位（已销号的不计）；悬停看来的天数、打卡天数、完成的段和专注占比。`);
    I.bars(h3, c3, topRows.map((p) => ({ label: p.name, value: ltMin(p.totalMs), text: ltDur(p.totalMs),
      lines: [`${p.name}（${p.aliasText}）`, `来了 ${p.activeDays} 天 · 打卡 ${p.checkDays} 天`, `到时完成 ${p.done} 段${p.share >= 0 ? ` · 专注占比 ${ltRate(p.share)}` : ''}`] })),
    { unit: ' 分钟', labelMax: 120, color: T.purple, aria: '专注时长最多的同学横条图', empty: '还没有同学专注过。' });
    I.tableView(c3, ['姓名', '道号', '累计专注（分钟）', '来的天数', '打卡天数', '到时完成的段'], topRows.map((p) => [p.name, p.aliasText, ltMin(p.totalMs), p.activeDays, p.checkDays, p.done]));
    // 4 每一段结束得怎么样
    const done = total('done'), cancelled = total('cancelled'), pomo = total('pomodoroSessions'), sessions = total('sessions');
    const [c4, h4] = add('每一段结束得怎么样', `已经结束的 ${ltFmt(done + cancelled)} 段：到时完成的得悟玉；中途点“结束本段”的不得悟玉，专注过的时间照样记进累计。番茄静修 ${ltFmt(pomo)} 段、自由静修 ${ltFmt(sessions - pomo)} 段。`);
    I.donut(h4, c4, [{ label: '到时完成', value: done, color: T.green }, { label: '中途结束', value: cancelled, color: T.orange }],
      { unit: ' 段', center: done + cancelled ? `${Math.round(done * 100 / (done + cancelled))}%` : '—', centerSub: '完成率', empty: '还没有结束的段。', aria: '静修完成率环形图' });
    // 5 每段定多长
    const planMap = new Map();
    live.forEach((p) => Object.entries(p.plans).forEach(([m, n]) => planMap.set(Number(m), (planMap.get(Number(m)) || 0) + ltNum(n))));
    let plans = Array.from(planMap.entries()).sort((a, b) => a[0] - b[0]).map(([m, n]) => ({ key: String(m), label: `${m} 分`, value: n, lines: [`定 ${m} 分钟`, `${n} 段`] }));
    if (plans.length > 9) {   // 自定的时长五花八门：只留最多的 8 种，其余并成“其他”
      const keep = new Set(plans.slice().sort((a, b) => b.value - a.value).slice(0, 8).map((d) => d.key));
      const other = plans.filter((d) => !keep.has(d.key)).reduce((t, d) => t + d.value, 0);
      plans = plans.filter((d) => keep.has(d.key)).concat([{ key: 'other', label: '其他', value: other, lines: ['其他时长', `${other} 段`] }]);
    }
    const [c5, h5] = add('每段定多长', '开始前选的专注时长（番茄静修默认 25 分钟；也可以选 40、50 分钟或自定 5—120 分钟）；柱子是段数。');
    I.columns(h5, c5, plans, { unit: ' 段', color: T.blue, aria: '每段定的专注时长柱状图', empty: '还没有静修记录。' });
    I.tableView(c5, ['定的时长', '段数'], plans.map((d) => [d.key === 'other' ? '其他' : `${d.key} 分钟`, d.value]));
    // 6 打卡了几天
    const bins = [['还没打卡', 0, 0], ['1—2 天', 1, 2], ['3—6 天', 3, 6], ['7—13 天', 7, 13], ['14 天以上', 14, Infinity]]
      .map(([label, lo, hi], i) => ({ label, value: live.filter((p) => p.checkDays >= lo && p.checkDays <= hi).length, color: i === 0 ? T.neutral : (I.ramps.online || [])[i] || T.blue }));
    const longest = live.slice().sort((a, b) => b.best - a.best || b.checkDays - a.checkDays)[0];
    const [c6, h6] = add('打卡了几天', `一天专注满 25 分钟算一次打卡（与静修修行录相同），颜色越深打卡越多${longest && longest.best ? `；最长连续打卡是 ${longest.name} 的 ${longest.best} 天` : ''}。`);
    I.segmented(h6, c6, bins.map((d) => ({ ...d, lines: [d.label, `${d.value} 人`] })), { unit: ' 人', aria: '打卡天数分段条' });
    I.tableView(c6, ['打卡天数', '人数'], bins.map((d) => [d.label, d.value]));
    // 7 在哪间雅室静修
    const roomInfo = new Map((ltFocus.rooms || []).map((r) => [r.id, r]));
    const roomTotals = new Map();
    live.forEach((p) => Object.entries(p.roomMs).forEach(([id, ms]) => roomTotals.set(id, (roomTotals.get(id) || 0) + ltNum(ms))));
    const own = Array.from(roomTotals.entries()).filter(([id]) => !/^public-/.test(id)).sort((a, b) => b[1] - a[1]);
    const roomParts = [['public-library', '藏经阁'], ['public-rain', '听雨轩']].map(([id, label], k) => ({ label, value: ltMin(roomTotals.get(id) || 0), color: CAT[k] }))
      .concat(own.length <= 3
        ? own.map(([id, ms], k) => { const r = roomInfo.get(id) || {}; return { label: `${r.title || '自建静室'}${r.owner_name ? ` · ${r.owner_name}` : ''}`, value: ltMin(ms), color: CAT[2 + k] }; })
        : [{ label: `自建静室（${own.length} 间）`, value: ltMin(own.reduce((t, x) => t + x[1], 0)), color: CAT[2] }]);
    const sids = new Set(live.map((p) => p.sid));
    const built = (ltFocus.rooms || []).filter((r) => r.owner_sid && sids.has(String(r.owner_sid)));
    const [c7, h7] = add('在哪间雅室静修', `按专注的分钟数。藏经阁、听雨轩是两门课所有同学共用的公共雅室（各 8 个座位）；${built.length ? `本班同学自己建了 ${built.length} 间静室（公开 ${built.filter((r) => r.privacy === 'public').length} 间、凭邀请码进的私密 ${built.filter((r) => r.privacy !== 'public').length} 间）` : '本班同学还没有自己建静室'}。`);
    I.donut(h7, c7, roomParts, { unit: ' 分钟', center: ltFmt(ltMin(Array.from(roomTotals.values()).reduce((t, v) => t + v, 0))), centerSub: '分钟', empty: '还没有同学在雅室里专注过。', aria: '各雅室静修分钟数环形图' });
    I.tableView(c7, ['雅室', '分钟'], roomParts.map((d) => [d.label, d.value]).concat(own.length > 3 ? own.map(([id, ms]) => { const r = roomInfo.get(id) || {}; return [`· ${r.title || id}${r.owner_name ? `（${r.owner_name}建）` : ''}`, ltMin(ms)]; }) : []));
    // 8 大家立的愿（开始前写的“本次修习什么”）
    const tMap = new Map();
    live.forEach((p) => p.targets.forEach((t) => { const x = tMap.get(t.text) || { n: 0, people: 0 }; x.n += t.n; x.people += 1; tMap.set(t.text, x); }));
    const tAll = Array.from(tMap.entries()).sort((a, b) => b[1].n - a[1].n || b[1].people - a[1].people || a[0].localeCompare(b[0], 'zh-CN'));
    const tTop = tAll.slice(0, 10);
    const [c8, h8] = add('大家立的愿', `开始静修前写的“本次修习什么”，按写过的次数，前 ${tTop.length} 条（每人最多算 30 种）；悬停看有几位同学写过，全部在“查看数据表”里。`, true);
    I.bars(h8, c8, tTop.map(([text, x]) => ({ label: text, value: x.n, lines: [text, `${x.people} 位同学写过`] })), { unit: ' 次', stacked: true, color: T.cyan, aria: '立愿出现次数横条图', empty: '还没有同学写过立愿。' });
    I.tableView(c8, ['立愿', '次数', '写过的同学'], tAll.map(([text, x]) => [text, x.n, x.people]));
    // 9 悟玉与衣装
    const itemMap = new Map();
    live.forEach((p) => p.purchases.forEach((x) => itemMap.set(x.id, (itemMap.get(x.id) || 0) + 1)));
    const items = Array.from(itemMap.entries()).sort((a, b) => b[1] - a[1] || ltItemName(a[0]).localeCompare(ltItemName(b[0]), 'zh-CN'))
      .map(([id, n]) => ({ id, label: ltItemName(id), value: n, price: (LT_FOCUS_ITEMS[id] || [id, 0])[1], lines: [`${ltItemName(id)}（${(LT_FOCUS_ITEMS[id] || [id, 0])[1]} 悟玉）`, `${n} 位同学置办了`] }));
    const ach = new Map();
    live.forEach((p) => p.achievements.forEach((x) => ach.set(x.id, (ach.get(x.id) || 0) + 1)));
    const withFriends = live.filter((p) => p.friends > 0).length;
    const [c9, h9] = add('悟玉与衣装', `到时完成一段得悟玉（25 分钟得 10，和道友同室专注每 5 分钟再加 1）：大家一共得了 ${ltFmt(total('earned'))} 悟玉（道友加成 ${ltFmt(total('bonus'))}），在衣装坊花了 ${ltFmt(total('spent'))}，现有 ${ltFmt(total('jade'))}。`
      + `${withFriends ? `有道友的同学 ${withFriends} 位，和道友同室专注共 ${ltDur(total('friendMs'))}。` : '还没有同学结为道友。'}${ach.size ? `成就：${Array.from(ach.entries()).map(([id, n]) => `${(LT_FOCUS_ACH[id] || [id])[0]} ${n} 人`).join('、')}。` : ''}下面是置办得最多的衣装。`);
    I.bars(h9, c9, items.slice(0, 10), { unit: ' 人', labelMax: 120, color: T.pink, aria: '衣装置办人数横条图', empty: '还没有同学在衣装坊置办过衣装。' });
    I.tableView(c9, ['衣装', '价格（悟玉）', '置办的同学'], items.map((d) => [d.label, d.price, d.value]));
    // 10 最近的静修
    const feed = [];
    live.forEach((p) => p.recent.forEach((s) => feed.push({ p, s })));
    feed.sort((a, b) => ltNum(b.s.finished) - ltNum(a.s.finished));
    const c10 = A.card(grid, '最近的静修', `最近结束的 ${Math.min(12, feed.length)} 段；点姓名看个人静修卡（每人最近 40 段都在“导出 Excel”的“静修记录”里）。`, true);
    const wrapF = document.createElement('div');
    wrapF.className = 'tw-scroll';
    wrapF.innerHTML = feed.length ? `<table class="tw-table compact tw-lt-beh-table"><thead><tr><th>结束时间</th><th>姓名</th><th>立愿</th><th>方式</th><th>定的时长</th><th>专注了</th><th>结果</th><th>悟玉</th></tr></thead><tbody>${feed.slice(0, 12).map(({ p, s }) => `<tr><td>${esc(ltWhen(ltNum(s.finished)))}</td>`
      + `<td><button type="button" class="ins-name" data-lt-focus-person="${esc(p.actor)}" title="看个人静修卡">${esc(p.name)}</button></td><td class="tw-lt-focus-target">${esc(s.target || '')}</td>`
      + `<td>${s.mode === 'pomodoro' ? '番茄' : '自由'}</td><td class="num">${ltNum(s.minutes)} 分钟</td><td class="num">${esc(ltDur(s.ms))}</td><td>${s.done ? '到时完成' : '中途结束'}</td><td class="num">${s.done ? ltFmt(s.reward) : '—'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="ins-empty">还没有结束的静修。</p>';
    c10.appendChild(wrapF);
    // 11 个人静修卡
    const cK = A.card(grid, '个人静修卡', '点上面或下表里的姓名，看这位同学的静修：和全班平均的对比、每天静修多久、一天里什么时候静修、最近每一段的立愿和结果、置办的衣装和成就。', true);
    const hostK = document.createElement('div');
    cK.appendChild(hostK);
    const metric = (fn, has) => { const list = live.filter((q) => !has || has(q)); return { avg: list.length ? Math.round(list.reduce((t, q) => t + fn(q), 0) / list.length * 10) / 10 : 0, max: Math.max(0, ...live.map(fn)) }; };
    const METRICS = [['累计专注', (q) => ltMin(q.totalMs), null, ' 分钟', '累计'], ['近 7 天', (q) => ltMin(q.weekMs), null, ' 分钟', '近 7 天'], ['来的天数', (q) => q.activeDays, null, ' 天', '天数'],
      ['打卡天数', (q) => q.checkDays, null, ' 天', '打卡'], ['最长连续打卡', (q) => q.best, null, ' 天', '连续'], ['到时完成的段', (q) => q.done, null, ' 段', '完成'],
      ['完成率', (q) => (q.doneRate >= 0 ? Math.round(q.doneRate * 100) : 0), 100, '%', '完成率', (q) => q.doneRate >= 0],
      ['专注占比', (q) => (q.share >= 0 ? Math.round(q.share * 100) : 0), 100, '%', '专注占比', (q) => q.share >= 0]];
    const showPerson = (actor, scroll) => {
      const p = rows.find((q) => q.actor === actor);
      if (!p) return;
      ltFocus.person = actor;
      hostK.textContent = '';
      const head = document.createElement('div');
      head.className = 'ins-person';
      const strong = document.createElement('strong');
      strong.textContent = p.name;
      const meta = document.createElement('span');
      const doing = p.now ? ` · 此刻${p.roomTitle ? `在“${p.roomTitle}”` : ''}${p.now}${p.active && p.active.target && p.now !== '小憩中' ? `（立愿：${p.active.target}）` : ''}` : '';
      meta.textContent = `${p.sid} · 道号 ${p.aliasText}${p.avatar ? ` · 化身 ${p.avatar}` : ''}${p.banned ? ' · 已销号' : ''} · 第一次打开静修 ${ltWhen(p.created)} · 最近专注 ${ltWhen(p.last)}${doing}`;
      head.append(strong, meta);
      hostK.appendChild(head);
      const notes = document.createElement('ul');
      notes.className = 'tw-lt-beh-notes';
      notes.innerHTML = ltFocusInsight(p, ctx).map((line) => `<li>${esc(line)}</li>`).join('');
      hostK.appendChild(notes);
      const personRows = METRICS.map(([label, fn, max, unit, short, has]) => {
        const m = metric(fn, has);
        return { label, short, me: fn(p), avg: m.avg, max: max == null ? m.max : max, unit, note: max == null ? `全班最高 ${ltFmt(m.max)}${unit}` : has && has(p) ? '' : '还没有可算的段' };
      });
      I.keys(hostK, [{ name: '本人', color: T.pink }, { name: '全班平均', color: T.blue }]);
      const pair = document.createElement('div');
      pair.className = 'ins-person-grid';
      const hostRadar = document.createElement('div'), hostBars = document.createElement('div');
      pair.append(hostRadar, hostBars);
      hostK.appendChild(pair);
      I.radar(hostRadar, cK, personRows, { noKeys: true, aria: `${p.name} 和全班平均的雷达图` });
      I.compare(hostBars, cK, personRows, { noKeys: true, aria: `${p.name} 的静修和全班平均` });
      const block = (title, note) => {
        const wrap = document.createElement('section'); wrap.className = 'tw-lt-beh-part';
        const h = document.createElement('h5'); h.textContent = title; wrap.appendChild(h);
        if (note) { const small = document.createElement('p'); small.className = 'tw-hint'; small.textContent = note; wrap.appendChild(small); }
        const host = document.createElement('div'); wrap.appendChild(host);
        return [wrap, host];
      };
      const two = document.createElement('div');
      two.className = 'tw-lt-beh-two';
      hostK.appendChild(two);
      const own = ltFocusDays([p]).map((d) => ({ key: d.day, label: `${Number(d.day.slice(5, 7))}/${Number(d.day.slice(8, 10))}`, value: ltMin(d.ms), lines: [`${ltDayText(d.day)} ${ltWeekOf(d.day)}`, d.ms >= LT_FOCUS_CHECKIN ? '满 25 分钟（打卡）' : '不满 25 分钟', `到时完成 ${d.done} 段`] }));
      const [wDay, hDay] = block('每天静修多少分钟', `来了 ${p.activeDays} 天、打卡 ${p.checkDays} 天${own.length > WIN ? '；拖动图下的滑块看更早的' : ''}`);
      two.appendChild(wDay);
      const ownMax = own.reduce((m, d) => Math.max(m, d.value), 0);
      I.windowed(hDay, cK, own, WIN, (b, slice, cardEl) => I.columns(b, cardEl, slice, { unit: ' 分钟', height: 190, color: T.purple, yMax: ownMax, aria: `${p.name} 每天的静修分钟数柱状图`, empty: '还没有专注过。' }),
        { labelOf: (d) => d.key.slice(5), unitName: '天', aria: '左右拖动，看更早或更近的日子' });
      const hours = Array(24).fill(0);
      Object.entries(p.heat).forEach(([k, ms]) => { const n = Number(k); if (n >= 0 && n < 168) hours[n % 24] += ltNum(ms); });
      const [wHour, hHour] = block('一天里什么时候静修', '北京时间，各个钟点专注的分钟数（所有天加在一起）');
      two.appendChild(wHour);
      I.columns(hHour, cK, hours.map((ms, hour) => ({ key: String(hour), label: `${hour}`, value: ltMin(ms), lines: [`${hour} 点到 ${hour + 1} 点`] })), { unit: ' 分钟', height: 190, color: T.blue, aria: `${p.name} 各钟点的静修分钟数柱状图`, empty: '还没有专注过。' });
      const [wRec, hRec] = block('最近的每一段', `最近 ${Math.min(15, p.recent.length)} 段（共结束 ${p.ended} 段）`);
      hostK.appendChild(wRec);
      hRec.innerHTML = p.recent.length ? `<div class="tw-scroll"><table class="tw-table compact tw-lt-beh-table"><thead><tr><th>结束时间</th><th>立愿</th><th>定的时长</th><th>专注了</th><th>结果</th></tr></thead><tbody>${p.recent.slice(0, 15).map((s) => `<tr><td>${esc(ltWhen(ltNum(s.finished)))}</td><td class="tw-lt-focus-target">${esc(s.target || '')}</td>`
        + `<td class="num">${ltNum(s.minutes)} 分钟</td><td class="num">${esc(ltDur(s.ms))}</td><td>${s.done ? `到时完成 · ${ltFmt(s.reward)} 悟玉` : '中途结束'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="ins-empty">还没有结束的静修。</p>';
      const [wGear, hGear] = block('衣装与成就', `得悟玉 ${ltFmt(p.earned)}，现有 ${ltFmt(p.jade)}`);
      hostK.appendChild(wGear);
      const gear = p.purchases.map((x) => `<li><time>${esc(ltDayText(ltBjDay(x.at)))}</time><span>置办 ${esc(x.name)}</span><b>${ltFmt(x.price)}</b></li>`)
        .concat(p.achievements.map((x) => `<li><time>${esc(ltDayText(ltBjDay(x.at)))}</time><span>达成成就 ${esc(x.name)}（${esc(x.rule)}）</span><b>成就</b></li>`));
      hGear.innerHTML = gear.length ? `<ul class="tw-lt-beh-log">${gear.join('')}</ul>` : '<p class="ins-empty">还没有置办过衣装，也还没有达成成就。</p>';
      if (scroll) cK.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
    ltFocus.show = showPerson;
    const firstPerson = rows.find((q) => q.actor === ltFocus.person) || topRows[0] || rows[0];
    if (firstPerson) showPerson(firstPerson.actor, false);
    // 12 每位同学一行
    const all = rows.slice().sort((a, b) => b.totalMs - a.totalMs || a.sid.localeCompare(b.sid));
    const c12 = A.card(grid, '每位同学', `按累计专注从多到少，共 ${all.length} 位；点姓名看个人静修卡。`, true);
    const wrap = document.createElement('div');
    wrap.className = 'tw-scroll';
    wrap.innerHTML = `<table class="tw-table compact ins-people tw-lt-beh-table"><thead><tr><th>学号</th><th>姓名</th><th>道号</th><th>累计专注</th><th>近 7 天</th><th title="专注过的天数">来的天数</th><th title="一天专注满 25 分钟">打卡天数</th><th>最长连续打卡</th>`
      + `<th title="到时完成的段／中途结束的段">完成／中途结束</th><th title="到时完成的段 ÷ 已经结束的段">完成率</th><th title="到时完成的段里，专注时间占从开始到结束的比例；其余是暂停、切出页面或断线">专注占比</th>`
      + `<th title="现有悟玉／累计得到的悟玉">悟玉</th><th>衣装</th><th>道友</th><th>此刻</th><th>最近专注</th></tr></thead><tbody>${all.map((p) => `<tr${p.banned ? ' class="is-banned"' : ''}><td>${esc(p.sid)}</td>`
      + `<td><button type="button" class="ins-name" data-lt-focus-person="${esc(p.actor)}" title="看个人静修卡">${esc(p.name)}</button></td><td>${p.banned ? `<s>${esc(p.aliasText)}</s>` : esc(p.aliasText)}</td>`
      + `<td class="num"><b>${esc(ltDur(p.totalMs))}</b></td><td class="num">${esc(ltDur(p.weekMs))}</td><td class="num">${p.activeDays}</td><td class="num">${p.checkDays}</td><td class="num">${p.best}</td>`
      + `<td class="num">${p.done} / ${p.cancelled}</td><td class="num">${ltRate(p.doneRate)}</td><td class="num">${ltRate(p.share)}</td><td class="num">${ltFmt(p.jade)} / ${ltFmt(p.earned)}</td>`
      + `<td class="num">${p.purchases.length}</td><td class="num">${p.friends}</td><td>${esc(p.now || '—')}</td><td>${esc(ltWhen(p.last))}</td></tr>`).join('')}</tbody></table>`;
    c12.appendChild(wrap);
    A.finish();
    if (I.nav) I.nav(grid);   // 分组目录：点一下跳到那一组
  }
  function ltFocusExport() {
    if (!ltFocus.rows) return;
    const O = window.ClassLive.office;
    const rows = ltFocusRows().sort((a, b) => a.sid.localeCompare(b.sid));
    const full = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '');
    const summary = [['项目', '数值', '说明']].concat(ltFocusTiles(rows).map((tile) => [tile.label, tile.value, tile.note]));
    const detail = [['学号', '姓名', '道号', '已销号', '化身', '累计专注（分钟）', '近 7 天（分钟）', '今天（分钟）', '来的天数', '打卡天数', '最长连续打卡', '现在连续打卡',
      '结束的段', '到时完成', '中途结束', '完成率', '番茄静修的段', '中途结束的段里专注（分钟）', '专注占比', '平均每段专注（分钟）',
      '现有悟玉', '累计得到悟玉', '其中道友加成', '衣装坊花掉', '置办的衣装', '成就', '道友', '待回应的道友邀请', '和道友同室专注（分钟）', '自建静室',
      '此刻', '常写的立愿', '第一次打开静修', '最近专注']]
      .concat(rows.map((p) => [p.sid, p.name, p.aliasText, p.banned ? '是' : '', p.avatar, ltMin(p.totalMs), ltMin(p.weekMs), ltMin(p.todayMs), p.activeDays, p.checkDays, p.best, p.streak,
        p.ended, p.done, p.cancelled, ltRate(p.doneRate), p.pomodoroSessions, ltMin(p.cancelMs), ltRate(p.share), Math.round(p.avgMs / 6000) / 10,
        p.jade, p.earned, p.bonus, p.spent, p.purchases.map((x) => x.name).join('、'), p.achievements.map((x) => x.name).join('、'), p.friends, p.friendRequests, ltMin(p.friendMs), p.roomsOwned,
        p.now ? `${p.roomTitle ? `${p.roomTitle} · ` : ''}${p.now}` : '', p.targets.slice(0, 5).map((t) => `${t.text}（${t.n}）`).join('；'), full(p.created), full(p.last)]));
    const live = rows.filter((p) => !p.banned);
    const daily = [['日期', '星期', '静修（分钟）', '在静修的同学', '到时完成的段']].concat(ltFocusDays(live).map((d) => [d.day, ltWeekOf(d.day), ltMin(d.ms), d.people, d.done]));
    const records = [['学号', '姓名', '道号', '开始', '结束', '立愿', '方式', '定的时长（分钟）', '专注（分钟）', '结果', '悟玉', '其中道友加成', '和道友同室专注（分钟）']];
    rows.forEach((p) => p.recent.slice().sort((a, b) => ltNum(a.finished) - ltNum(b.finished)).forEach((s) => records.push([p.sid, p.name, p.aliasText, full(ltNum(s.started)), full(ltNum(s.finished)), s.target || '',
      s.mode === 'pomodoro' ? '番茄静修' : '自由静修', ltNum(s.minutes), Math.round(ltNum(s.ms) / 6000) / 10, s.done ? '到时完成' : '中途结束', s.done ? ltNum(s.reward) : 0, s.done ? ltNum(s.bonus) : 0, Math.round(ltNum(s.friend_ms) / 6000) / 10])));
    const scope = state.klass ? safeName(state.klass.name) : '全部班级';
    O.save(O.xlsxBook([
      { name: '汇总', rows: summary, widths: [16, 16, 60] },
      { name: '学生明细', rows: detail, widths: [14, 10, 16, 8, 10].concat(Array(26).fill(11), [30, 18, 18]) },
      { name: '每天', rows: daily, widths: [12, 8, 14, 14, 14] },
      { name: '静修记录', rows: records, widths: [14, 10, 16, 20, 20, 30, 10, 14, 12, 10, 8, 12, 18] },
    ]), `${course.title}_${scope}_静修数据_${window.ClassLive.today()}.xlsx`);
  }
  // 销号／恢复（2026-11-15 用户：“填写道号的时候也要提醒学生文明取名，否则会被销号”）
  async function ltBan(actor, on) {
    const p = lt.players.find((row) => row.actor_id === actor);
    if (!p) return;
    const who = `${p.name}（${p.sid}）`;
    const tip = on
      ? `给 ${who} 销号吗？道号“${p.alias || ''}”\n\n销号后：该生不能再进入云间灵田，道号换成“已销号”，灵田不再出现在别人的道友名单里，服丹折算的网站修为也不再计入结算。之后可以点“恢复”撤销。`
      : `恢复 ${who} 的灵田吗？\n\n恢复后该生可以重新进入云间灵田（要先重新起一个道号），服丹折算的网站修为重新计入结算。`;
    if (!window.confirm(tip)) return;
    $('[data-lt-summary]').textContent = on ? '正在销号……' : '正在恢复……';
    try {
      await backend.rpc('lt_admin_ban', { p_course: course.slug, p_actor: actor, p_ban: !!on });
      await ltLoad();
      $('[data-lt-status]').textContent = `${who} ${on ? '已销号' : '已恢复'}（${clock(Date.now())}）。`;
    } catch (error) { $('[data-lt-summary]').textContent = `${on ? '销号' : '恢复'}失败：${(error && error.message) || error}`; }
  }
  async function ltSave() {
    const num = (sel) => Math.max(0, Math.min(100, Math.round(Number($(sel).value) || 0)));
    $('[data-lt-status]').textContent = '正在保存……';
    try {
      await backend.rpc('lt_admin_set', { p_course: course.slug, p_enabled: $('[data-lt-enabled]').checked, p_water: num('[data-lt-water]'), p_clear: num('[data-lt-clear]'), p_steal: num('[data-lt-steal]') });
      lt.dirty = false;
      ltOpenState($('[data-lt-enabled]').checked);
      $('[data-lt-status]').textContent = `已保存（${clock(Date.now())}）：${$('[data-lt-enabled]').checked ? '本课程已开放云间灵田' : '本课程不开放云间灵田'}。学生约 20 秒内生效。`;
    } catch (error) { $('[data-lt-status]').textContent = `保存失败：${(error && error.message) || error}`; }
  }
  async function ltTeacherCall(path, body, query) {
    if (!lt.ticket || Date.now() - lt.ticketAt > 90 * 60000) {
      const value = await backend.rpc('lt_teacher_ticket', { p_course: course.slug });
      const row = (Array.isArray(value) ? value[0] : value) || {};
      if (row.status !== 'ok') throw new Error('领取教师凭证失败');
      lt.ticket = row.ticket; lt.ticketAt = Date.now();
    }
    if (typeof backend.callFunction !== 'function') throw new Error('课堂后台不支持云函数');
    const out = await backend.callFunction('lingtian', { ticket: lt.ticket, path, query: query || {}, body: body || null });
    if (!out) throw new Error('云函数 lingtian 没有回应（还没有部署？）');
    if (out.status >= 400 || (out.body && out.body.ok === false)) throw new Error((out.body && out.body.message) || `云函数返回 ${out.status}`);
    return out.body;
  }
  async function ltPoolLoad() {
    const status = $('[data-lt-pool-status]');
    if (!state.klass) { status.textContent = '请先在上方选好班级。'; return; }
    status.textContent = '正在读取……';
    try {
      lt.catalog = lt.catalog || await ltTeacherCall('/api/teaching/catalog');
      lt.plans = await ltTeacherCall('/api/teaching/curriculum', null, { classId: `class-${state.klass.id}` });
      ltPoolRender();
      const active = lt.plans.active || {};
      status.textContent = active.academicYear ? `本班现在启用的是 ${active.academicYear} 学年卡池。` : '本班还没有设置过卡池（按游戏默认卡池）。';
    } catch (error) { status.textContent = `读取失败：${(error && error.message) || error}`; }
  }
  function ltPoolRender() {
    const box = $('[data-lt-chapters]');
    const courseInfo = lt.catalog && lt.catalog.courses && lt.catalog.courses[0];
    if (!courseInfo) { box.innerHTML = ''; return; }
    const year = $('[data-lt-year]').value;
    const plan = ((lt.plans && lt.plans.plans) || []).find((item) => item.academicYear === year);
    const active = lt.plans && lt.plans.active;
    const chosen = new Set((plan && plan.selection && plan.selection.chapterIds) || (active && active.academicYear === year && active.selection && active.selection.chapterIds) || []);
    // 第 0 章是导论：标题本身就是“导论”时不再重复
    const label = (ch) => (Number(ch.number) === 0 ? (/导论/.test(ch.title) ? `<b>${esc(ch.title)}</b>` : `<b>导论</b> ${esc(ch.title)}`) : `<b>第${ch.number}章</b> ${esc(ch.title)}`);
    box.innerHTML = `<p class="tw-hint">${esc(courseInfo.name)} · 共 ${courseInfo.chapters.length} 章 ${courseInfo.totalCards} 张卡${plan ? ` · ${esc(year)} 学年已保存第 ${plan.planRevision} 版（${plan.selectedCardCount} 张）` : ''}</p>`
      + `<div class="tw-lt-chapter-grid">${courseInfo.chapters.map((ch) => `<label class="tw-lt-chapter"><input type="checkbox" value="${esc(ch.id)}"${chosen.has(ch.id) ? ' checked' : ''}><span>${label(ch)}<small>${ch.cardCount} 张</small></span></label>`).join('')}</div>`;
    $('[data-lt-pool-save]').disabled = false;
  }
  async function ltPoolSave() {
    const status = $('[data-lt-pool-status]');
    const chapterIds = $$('[data-lt-chapters] input:checked').map((input) => input.value);
    if (!chapterIds.length) { status.textContent = '至少勾选一章。'; return; }
    const year = $('[data-lt-year]').value;
    const plan = ((lt.plans && lt.plans.plans) || []).find((item) => item.academicYear === year);
    status.textContent = '正在保存……';
    try {
      const result = await ltTeacherCall('/api/teaching/curriculum', {
        requestId: `pool${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, action: 'save', classId: `class-${state.klass.id}`,
        courseId: lt.catalog.courses[0].id, academicYear: year, expectedPlanRevision: plan ? plan.planRevision : 0,
        expectedActiveRevision: lt.plans && lt.plans.active ? lt.plans.active.activeRevision || 0 : 0,
        selection: { chapterIds, includeCardIds: [], excludeCardIds: [] }, activate: true });
      lt.plans = result;
      ltPoolRender();
      status.textContent = `已保存并启用 ${year} 学年卡池：${result.result ? result.result.selectedCardCount : ''} 张卡（${clock(Date.now())}）。`;
    } catch (error) { status.textContent = `保存失败：${(error && error.message) || error}`; }
  }
  const ltTab = $('[data-tab="lingtian"]');
  if (ltTab) {
    // 2026-11-18 用户：“教师工作台点击‘云间灵田’后自动刷新内容”：每次点开都重读开放设置、谁是谁和数据统计（开放设置改了没保存的不覆盖）
    ltTab.addEventListener('click', () => { ltLoad(); });
    ['[data-lt-enabled]', '[data-lt-water]', '[data-lt-clear]', '[data-lt-steal]'].forEach((sel) => { const input = $(sel); if (input) ['input', 'change'].forEach((type) => input.addEventListener(type, () => { lt.dirty = true; })); });
    // 开关一拨就保存（2026-11-22 用户：“我开了以后刷新一下又关了”——原来拨了开关还要点“保存设置”才算数）；关掉会让学生进不了灵田，先确认
    $('[data-lt-enabled]').addEventListener('change', () => {
      const box = $('[data-lt-enabled]');
      if (!box.checked && !window.confirm('关闭云间灵田？关闭后学生面板“宗门”里看不到入口，正在灵田里的同学约 20 秒后也进不去；灵田里的数据都保留，之后可以再打开。')) {
        box.checked = true;
        return;
      }
      ltSwitchNote();
      ltSave();
    });
    ltPct('[data-lt-water]', 30); ltPct('[data-lt-clear]', 30); ltPct('[data-lt-steal]', 40);
    $('[data-lt-save]').addEventListener('click', ltSave);
    // 刷新页面时工作台会自动回到上次的标签（上面“标签页”一段替你点一下），那一下在这段代码之前，这里收不到，“云间灵田”就没读开放设置，
    // 开关停在默认的“关”（2026-11-22 用户：“为什么现在云间灵田开放的按钮是默认关闭的？”“我开了以后刷新一下又关了”；后台其实一直开着）。
    // 现在：读到后台的设置以前，开关和“保存设置”都不能点，免得把没读到的“关”存进去；停在这个标签上时自己读一次
    $('[data-lt-enabled]').disabled = true;
    $('[data-lt-save]').disabled = true;
    if (ltTab.getAttribute('aria-selected') === 'true') ltLoad();
    $('[data-lt-reload]').addEventListener('click', ltLoad);
    $('[data-lt-search]').addEventListener('input', ltRender);
    $('[data-lt-stats-reload]').addEventListener('click', ltStatsLoad);
    $('[data-lt-stats-xlsx]').addEventListener('click', ltStatsExport);
    if ($('[data-lt-beh-reload]')) $('[data-lt-beh-reload]').addEventListener('click', ltStatsLoad);   // 行为分析要用统计里的现有灵石：两样一起重读
    if ($('[data-lt-beh-charts]')) $('[data-lt-beh-charts]').addEventListener('click', (event) => {
      const who = event.target.closest('[data-lt-beh-person]');
      if (who && ltBeh.show) ltBeh.show(who.dataset.ltBehPerson, true);
    });
    // 跳转栏（2026-11-23）：点一下滚到那一块；跳转栏用学情分析的小标签样式，先装上，免得图表还没画时没有样式
    $$('[data-lt-jump]').forEach((button) => button.addEventListener('click', () => {
      const target = $(`[data-lt-sec="${button.dataset.ltJump}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    if (window.ClassLiveInsights) window.ClassLiveInsights.addStyle();
    $('[data-lt-stats-head]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-lt-sort]');
      if (!button) return;
      const key = button.dataset.ltSort, col = LT_STAT_COLS.find((item) => item.key === key) || {};
      lt.sort = { key, dir: lt.sort.key === key ? -lt.sort.dir : (col.text ? 1 : -1) };
      ltStatsRender();
    });
    $('[data-lt-rows]').addEventListener('click', (event) => {
      const ban = event.target.closest('[data-lt-ban]'), unban = event.target.closest('[data-lt-unban]');
      if (ban) ltBan(ban.dataset.ltBan, true);
      else if (unban) ltBan(unban.dataset.ltUnban, false);
    });
    $('[data-lt-pool-load]').addEventListener('click', ltPoolLoad);
    $('[data-lt-pool-save]').addEventListener('click', ltPoolSave);
    $('[data-lt-year]').addEventListener('change', ltPoolRender);
    $('[data-lt-pool-all]').addEventListener('click', () => $$('[data-lt-chapters] input').forEach((input) => { input.checked = true; }));
    $('[data-lt-pool-none]').addEventListener('click', () => $$('[data-lt-chapters] input').forEach((input) => { input.checked = false; }));
  }
  // 静修数据（2026-11-23 用户：“你在这里再设置一张卡片，放静修数据统计”）：从“云间灵田”拆出来单独一个标签，每次点开都重读
  const focusTab = $('[data-tab="focus"]');
  if (focusTab) {
    focusTab.addEventListener('click', () => { ltFocusLoad(); });
    $('[data-lt-focus-reload]').addEventListener('click', ltFocusLoad);
    $('[data-lt-focus-xlsx]').addEventListener('click', ltFocusExport);
    $('[data-lt-focus-charts]').addEventListener('click', (event) => {
      const who = event.target.closest('[data-lt-focus-person]');
      if (who && ltFocus.show) ltFocus.show(who.dataset.ltFocusPerson, true);
    });
    if (window.ClassLiveInsights) window.ClassLiveInsights.addStyle();
    if (focusTab.getAttribute('aria-selected') === 'true') ltFocusLoad();   // 刷新页面时停在这个标签上（同云间灵田）
  }

  function renderAll() {
    renderStats();
    renderCheckins();
    if (CONCEPT) {
      renderConceptStats();
      renderConceptStudents();
    } else {
      renderChoices();
      renderAnswers();
    }
    renderDanmaku();
  }

  // ---------------- 加入名单与统计 ----------------
  // 同一课堂可能分几次课上：每次登录（首页登录或当天第一次打开章节页）各记一行，按日期（session）区分
  const dayOf = (doc) => doc.session || isoDay(doc.ts);
  const shortDay = (day) => String(day || '').slice(5);
  const students = (day) => {
    const map = new Map();
    state.docs.checkins.filter((doc) => !day || dayOf(doc) === day).sort((a, b) => (a.ts || 0) - (b.ts || 0)).forEach((doc) => {
      const row = map.get(doc.sid) || { sid: doc.sid, names: new Set(), first: doc.ts, days: new Map() };
      row.names.add(doc.name);
      if (doc.makeup) (row.makeup || (row.makeup = new Set())).add(dayOf(doc));   // 请假补做的登录（2026-11-19）
      if (!row.days.has(dayOf(doc))) row.days.set(dayOf(doc), doc.ts);
      row.class_name = doc.class_name || row.class_name || '';
      row.group_name = doc.group_name || row.group_name || '';
      map.set(doc.sid, row);
    });
    return Array.from(map.values());
  };
  // 概念学习课程：每人一份作业（逐题递交，每题只算第一次）。同一学号偶有多行（两台设备同时第一次递交）时合并，各题取最早递交的
  const isEntry = (entry) => entry && typeof entry === 'object' && 'v' in entry && 'at' in entry;
  const homeworkRows = () => {
    const groups = new Map();
    state.docs.homework.forEach((doc) => { const list = groups.get(doc.sid) || []; list.push(doc); groups.set(doc.sid, list); });
    return Array.from(groups.values()).map((list) => {
      list.sort((a, b) => Number(a.id) - Number(b.id));
      if (list.length === 1) return list[0];
      const payload = {};
      list.forEach((doc) => Object.entries(doc.payload || {}).forEach(([key, entry]) => {
        if (!payload[key] || (isEntry(entry) && isEntry(payload[key]) && millis(entry.at) < millis(payload[key].at))) payload[key] = entry;
      }));
      const progress = Object.keys(payload).length;
      const total = Math.max(...list.map((doc) => doc.total || 0));
      return { ...list[0], id: list.map((doc) => doc.id).join('+'), payload, progress, total, submitted: total > 0 && progress >= total,
        submitted_at: list.map((doc) => doc.submitted_at).filter(Boolean).sort()[0] || null,
        ts: Math.max(...list.map((doc) => doc.ts || 0)), updated_at: list.map((doc) => doc.updated_at).sort().pop() };
    });
  };
  // 习经 2026-11-12 前的迁移任务（小案例）题号：match-1—4、transfer-k、说一说（transfer）。用小案例上过的课仍按它们计题、计分
  const OLD_TK = /^(match-\d+|transfer-k|transfer)$/;
  const TK_SINCE = '2026-11-13';   // 迁移任务改为小资料分析后的第一次课（北京时间）；这天之前上过、又没有新题记录的案例按小案例算
  // 纠错诊断（2026-11-20 起每条误区一道多选 mythN-diag；以前是判断＋单选 mythN-judge、mythN-why）：用旧题上过的课仍按旧题计题、计分
  const OLD_MYTH = /^myth\d+-(judge|why)$/;
  const NEW_MYTH = /^myth\d+-diag$/;
  // 出门测（2026-11-20 起照政经“课后自修”）：不计入“作答完成／作答正确”，答对每题另加 SELF_EXIT 修为（记在“修炼”一栏）。
  // NEW_SINCE＝这两处改动发布的时刻：一个案例在本班的第一条作答记录早于它（没有记录时看本单元最后一次课早于 NEW_DAY），就仍按原来的办法算
  const SELF_EXIT = 2;
  const NEW_SINCE = Date.parse('2026-11-20T17:28:00+08:00');   // 发布时刻（北京时间）
  const NEW_DAY = '2026-11-20';
  const oldMythIn = (caseNo) => state.docs.choices.some((doc) => doc.case === caseNo && OLD_MYTH.test(doc.item));
  const mythExtra = (item) => {
    const group = ((item.practice || {}).groups || []).find((g) => g.legacy);
    return group && oldMythIn(item.number) ? group.legacy.length - group.items.length : 0;
  };
  // 章节案例课程：每人递交过的题目（投票、推演每轮、配对整体、每道文字题各算一题）
  const caseKey = (doc) => (/^match-/.test(doc.item) ? `${doc.case}:match` : `${doc.case}:${doc.item}`);
  // 实操改版案例另加客观题、辩论、圆桌（认领角色）的题数（practice.count）
  // 迁移任务（2026-11-12 起小资料分析三题）：这一课堂已经用小案例递交过的，仍按小案例（配对整体＋选一选＋说一说）计题数
  const oldTkIn = (caseNo) => [...state.docs.choices, ...state.docs.answers].some((doc) => doc.case === caseNo && OLD_TK.test(doc.item));
  const roomTotal = () => roomCases().reduce((sum, item) => {
    const P = item.practice || {};
    const oldTk = !P.transfer || oldTkIn(item.number);
    return sum + 2 + item.sim.rounds.length + (oldTk ? (item.matching.clues.length ? 1 : 0) + (item.transfer ? 1 : 0) : P.transfer.items.length)
      + item.items.filter((entry) => oldTk || entry.key !== 'transfer').length + (P.count || 0) + mythExtra(item);
  }, 0);
  const caseProgress = () => {
    const cases = new Set(roomCases().map((item) => item.number));
    const map = new Map();
    [...state.docs.choices, ...state.docs.answers].filter((doc) => cases.has(doc.case)).forEach((doc) => {
      const row = map.get(doc.sid) || { keys: new Set(), ts: 0 };
      row.keys.add(caseKey(doc));
      row.ts = Math.max(row.ts, doc.ts || 0);
      map.set(doc.sid, row);
    });
    return map;
  };
  // 已全部递交：学号 → 最后一次递交的时间
  const submissions = () => {
    const map = new Map();
    if (CONCEPT) {
      homeworkRows().forEach((doc) => { if (doc.submitted) map.set(doc.sid, millis(doc.submitted_at) || doc.ts || 0); });
      return map;
    }
    const total = roomTotal();
    caseProgress().forEach((row, sid) => { if (total && row.keys.size >= total) map.set(sid, row.ts); });
    return map;
  };
  // “我的课堂”的四项统计（2026-11-22 用户：“这几个卡片换成‘已加入’‘现在在线’（加入名单中的‘现在在线’换成‘已全部递交’），
  // ‘灵田在线’‘今天在线’，不需要‘尚未全部递交’”）：现在在线＝课程页面或云间灵田 2 分钟内报到过；灵田在线＝2 分钟内从云间灵田报到过
  // （ck_presence.lt_seen，后台还没有这一列时显示“—”）；今天在线＝今天（北京时间零点起）报到过或登录过
  // 2026-11-23 用户：“这里再增加一个静修在线的显示卡片”：静修在线＝2 分钟内从静修报到过（灵田页开着静修时报到带 p_place = 'focus'，
  // 记在 ck_presence.focus_seen；回到灵田的田里时清空）；静修在灵田里，所以“灵田在线”也算上在静修的同学
  function renderStats() {
    const joined = students();
    const today = window.ClassLive.today();
    const dayStart = Date.parse(`${today}T00:00:00+08:00`);
    const put = (selector, value) => {
      const el = $(selector);
      if (!el) return;
      el.textContent = value;
      const box = el.closest('.tw-stat');
      if (box) box.classList.toggle('is-quiet', !Number(value));
    };
    put('[data-stat-joined]', joined.length);
    put('[data-stat-online]', joined.filter((row) => isOnline(row.sid)).length);
    if (state.presence.ltKnown) put('[data-stat-lingtian]', joined.filter((row) => inLingtian(row.sid)).length);
    else put('[data-stat-lingtian]', '—');
    if (state.presence.focusKnown) put('[data-stat-focus]', joined.filter((row) => inFocus(row.sid)).length);
    else put('[data-stat-focus]', '—');
    // 今天在线：本班全部课堂（与学情分析“今天在学”同一口径，见 loadToday）；还没读到时照旧按本课堂算
    const todaySet = todayVisits.sids && state.klass && todayVisits.key === `${course.slug}:${state.klass.id}:${today}` ? todayVisits.sids : null;
    put('[data-stat-today]', todaySet ? todaySet.size : joined.filter((row) => row.days.has(today) || seenAt(row.sid) >= dayStart).length);
  }
  // ---------------- 点名册（班级）与考勤核对 ----------------
  const sidKey = (sid) => String(sid == null ? '' : sid).replace(/\s+/g, '').toUpperCase();
  const rosterOf = () => (state.klass && Array.isArray(state.klass.roster) ? state.klass.roster : []);
  $('[data-checkin-search]').addEventListener('input', renderCheckins);
  $('[data-checkin-date]').addEventListener('change', renderCheckins);
  // 日期选项：本课堂有登录记录的每一天，附当天登录人数；返回当前选择（空＝全部日期）
  function checkinDay() {
    const select = $('[data-checkin-date]');
    const counts = new Map();
    state.docs.checkins.forEach((doc) => { const set = counts.get(dayOf(doc)) || new Set(); set.add(doc.sid); counts.set(dayOf(doc), set); });
    const days = Array.from(counts.keys()).filter(Boolean).sort();
    const chosen = days.includes(select.value) ? select.value : '';
    select.innerHTML = `<option value="">全部日期${days.length > 1 ? `（${days.length} 天）` : ''}</option>`
      + days.map((day) => `<option value="${day}">${day}（${counts.get(day).size} 人）</option>`).join('');
    select.value = chosen;
    select.hidden = days.length < 2 && !chosen;
    return chosen;
  }
  // 登录记录：选了日期只显示当天时间；全部日期时列出每一天第一次登录的时间
  const loginText = (row, day) => (day ? clock(row.days.get(day))
    : Array.from(row.days.entries()).map(([d, ts]) => `${shortDay(d)} ${clock(ts).slice(0, 5)}`).join('、'));
  // 加入名单“本次课堂”一列（2026-11-22）：选了日期只写当天的时间；全部日期时写最早那天，另外几天收进“+N 天”（鼠标停上去看），一行放得下
  const loginWhen = (row, day) => {
    if (day) return whenSmall(clock(row.days.get(day)));
    const list = Array.from(row.days.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([d, ts]) => `${shortDay(d)} ${clock(ts).slice(0, 5)}`);
    if (!list.length) return '';
    return whenSmall(list[0]) + (list.length > 1 ? `<small class="tw-when-more" title="${esc(`也登录过：${list.slice(1).join('、')}`)}">+${list.length - 1} 天</small>` : '');
  };
  // ---------------- 请假 ----------------
  // 学生在章节页面板或首页提交（ck_request_leave），不需要审批；本班全部记录在“加入名单”下方，老师可以撤销不实的请假
  async function loadLeaves() {
    if (!state.klass) { state.leaves = []; return; }
    try {
      state.leaves = await backend.fetchAll('leaves', { class_id: Number(state.klass.id) || state.klass.id });
    } catch (error) {
      if (!missingTable(error)) console.warn('[请假] 记录没有读到：', error);
      state.leaves = [];
    }
    renderLeaves();
  }
  const leavesOf = (sid, days) => state.leaves.filter((row) => sidKey(row.sid) === sidKey(sid) && days.some((day) => row.start_day <= day && day <= row.end_day));
  const leaveRange = (row) => (row.start_day === row.end_day ? shortDay(row.start_day) : `${shortDay(row.start_day)}—${shortDay(row.end_day)}`);
  // 本课堂的上课日：有登录记录的日期，当前课堂再加上今天
  const roomDays = () => {
    const days = new Set(state.docs.checkins.map(dayOf).filter(Boolean));
    if (state.room && state.room.is_current) days.add(window.ClassLive.today());
    return Array.from(days);
  };
  function renderLeaves() {
    const box = $('[data-leave-box]');
    if (!box) return;
    const rows = state.leaves.slice().sort((a, b) => String(b.start_day).localeCompare(String(a.start_day)) || Number(b.id) - Number(a.id));
    box.hidden = !state.klass;
    $('[data-leave-count]').textContent = rows.length ? `（${rows.length} 条）` : '（暂无）';
    $('[data-leave-rows]').innerHTML = rows.map((row) => `<tr><td class="tw-nowrap">${esc(leaveRange(row))}</td><td>${esc(row.sid)}</td><td>${esc(row.name)}</td>
      <td>${esc(row.reason)}</td><td class="tw-nowrap">${esc(isoDay(millis(row.created_at)))} ${esc(clock(millis(row.created_at)).slice(0, 5))}</td>
      <td class="tw-col-action"><button type="button" class="tw-trash" data-leave-delete="${esc(row.id)}" title="撤销这条请假" aria-label="撤销 ${esc(row.name)} 的请假">${TRASH_ICON}</button></td></tr>`).join('')
      || '<tr><td colspan="6" class="empty">本班还没有同学请假。</td></tr>';
  }
  $('[data-leave-rows]').addEventListener('click', async (event) => {
    const trash = event.target.closest('[data-leave-delete]');
    if (!trash) return;
    const row = state.leaves.find((item) => String(item.id) === trash.dataset.leaveDelete);
    if (!row || !window.confirm(`撤销 ${row.name}（${row.sid}）${leaveRange(row)} 的请假吗？撤销后那几天按未登录处理（结算修为时也不再计请假）。`)) return;
    const status = $('[data-leave-status]');
    try {
      await backend.removeAll('leaves', { id: Number(row.id) || row.id });
      status.textContent = `已撤销 ${row.name} ${leaveRange(row)} 的请假。`;
    } catch (error) {
      console.error(error);
      status.textContent = `撤销失败：${error.message || error}`;
    }
    await loadLeaves();
    renderCheckins();
  });
  // 回到工作台窗口、或每隔 1 分钟：重新读取请假记录（学生随时可能提交）
  const refreshLeaves = async () => {
    if (!state.klass || $('[data-app]').hidden || document.hidden) return;
    await loadLeaves();
    renderCheckins();
  };
  window.addEventListener('focus', refreshLeaves);
  setInterval(refreshLeaves, 60000);
  $('[data-roster-filter]').addEventListener('change', renderCheckins);
  // 在线状态：学生页（2026-11-20 起还有云间灵田页）在前台时每 30 秒报到一次（ck_ping）；2 分钟内报到过＝在线（小绿灯），报到过但超过 2 分钟＝灰点
  const ONLINE_MS = 2 * 60 * 1000;
  async function loadPresence() {
    const room = state.room;
    if (!room) return;
    try {
      const rows = await backend.fetchAll('presence', { classroom: Number(room.id) || room.id });
      // lt：从云间灵田报到的时间（2026-11-22，ck_presence.lt_seen）；ltKnown：后台已经有这一列（还没执行 SQL 时没有，“灵田在线”显示“—”）
      state.presence = { room: String(room.id), map: new Map(rows.map((row) => [sidKey(row.sid), millis(row.last_seen)])),
        lt: new Map(rows.filter((row) => row.lt_seen).map((row) => [sidKey(row.sid), millis(row.lt_seen)])),
        ltKnown: !rows.length || rows.some((row) => 'lt_seen' in row),
        // focus：从静修报到的时间（2026-11-23，ck_presence.focus_seen）；focusKnown：后台已经有这一列
        focus: new Map(rows.filter((row) => row.focus_seen).map((row) => [sidKey(row.sid), millis(row.focus_seen)])),
        focusKnown: !rows.length || rows.some((row) => 'focus_seen' in row) };
    } catch (error) {
      if (!missingTable(error)) console.warn('[在线状态]', error);
      state.presence = { room: String(room.id), map: new Map(), lt: new Map(), ltKnown: false, focus: new Map(), focusKnown: false };
    }
    await loadToday();
  }
  // 今天在线（2026-11-23 用户：“‘今天在线’和‘今天在学’的人数照理说应该一样的啊，为什么这里会差1人？”）：原来只看现在选的这个课堂——
  //   本班几个课堂同时开着时，今天只在别的课堂页面上（比如在第四章复习）的同学不算，学情分析的“今天在学”却算（本班全部课堂）。
  //   现在和“今天在学”同一口径：本班点名册上的同学（不含旁听；没上传点名册时按有记录的同学），今天（北京时间零点起）在本班任一课堂
  //   登录、打开或回到页面、查看历史课堂、在云间灵田里（ck_visits 今天有活动）。一分钟最多读一次；后台没有这张表时照旧按本课堂算
  const todayVisits = { key: '', at: 0, sids: null };
  async function loadToday(force) {
    if (!state.klass) return;
    const day = window.ClassLive.today();
    const key = `${course.slug}:${state.klass.id}:${day}`;
    if (!force && todayVisits.key === key && Date.now() - todayVisits.at < 60000) return;
    try {
      const dayStart = Date.parse(`${day}T00:00:00+08:00`);
      const rows = await backend.fetchAll('visits', { class_id: Number(state.klass.id) || state.klass.id }, { since: ['last_at', new Date(dayStart).toISOString()] });
      // 与学情分析一字不差（2026-11-23 发布后线上 2648 班又差 1 人：有一段在线是前一天夜里开始、过了零点才结束的）：
      //   一段在线按开始的时间算在哪一天；点名册上标“班外”（老师允许加入）的同学不算
      const roster = new Set(rosterOf().filter((person) => !person.extra).map((person) => sidKey(person.sid)));
      todayVisits.sids = new Set(rows.filter((row) => !row.auditor && millis(row.started_at) >= dayStart && (!roster.size || roster.has(sidKey(row.sid)))).map((row) => sidKey(row.sid)));
    } catch (error) {
      if (!missingTable(error)) console.warn('[今天在线]', error);
      todayVisits.sids = null;
    }
    todayVisits.key = key;
    todayVisits.at = Date.now();
  }
  const seenAt = (sid) => (state.room && state.presence.room === String(state.room.id) ? state.presence.map.get(sidKey(sid)) || 0 : 0);
  const isOnline = (sid) => { const at = seenAt(sid); return Boolean(at) && Date.now() - at < ONLINE_MS; };
  const inLingtian = (sid) => {
    const at = state.room && state.presence.room === String(state.room.id) && state.presence.lt ? state.presence.lt.get(sidKey(sid)) || 0 : 0;
    return Boolean(at) && Date.now() - at < ONLINE_MS;
  };
  const inFocus = (sid) => {
    const at = state.room && state.presence.room === String(state.room.id) && state.presence.focus ? state.presence.focus.get(sidKey(sid)) || 0 : 0;
    return Boolean(at) && Date.now() - at < ONLINE_MS;
  };
  const onlineDot = (sid) => {
    const at = seenAt(sid);
    if (!at) return '';
    const on = Date.now() - at < ONLINE_MS;
    return `<i class="tw-dot${on ? ' is-on' : ''}" title="${on ? '在线' : '不在线'}（最近一次在线 ${clock(at).slice(0, 5)}）" aria-label="${on ? '在线' : '不在线'}"></i>`;
  };
  // 每 20 秒（加入名单页开着、工作台在前台时）、回到工作台窗口时：重新读取在线状态
  const refreshPresence = async () => {
    if (!state.room || $('[data-app]').hidden || document.hidden) return;
    await loadPresence();
    renderStats();   // “我的课堂”的在线人数在每个标签上面都看得到（2026-11-22）
    if (!$('[data-panel="checkins"]').hidden) renderCheckins();
  };
  setInterval(refreshPresence, 20000);
  window.addEventListener('focus', refreshPresence);
  // 有新的登录记录时（学生刚进来）几秒后补读一次在线状态，小绿灯不必等下一个 20 秒
  let presenceSoon = 0;
  const presenceAfterJoin = () => {
    clearTimeout(presenceSoon);
    presenceSoon = setTimeout(refreshPresence, 4000);
  };
  // 旁听名单（2026-11-05）：只列出，不计入上面的统计
  function renderAuditors() {
    const box = $('[data-audit-list]');
    if (!box) return;
    const day = checkinDay();
    const people = new Map();
    (state.auditors || []).filter((doc) => !day || dayOf(doc) === day).forEach((doc) => { if (!people.has(sidKey(doc.sid))) people.set(sidKey(doc.sid), doc); });
    box.hidden = !people.size;
    box.textContent = people.size ? `旁听 ${people.size} 人（点名册外、老师允许旁听，只能看内容和做题，答案只在本人设备上，不计入上面的统计和修为）：`
      + Array.from(people.values()).map((doc) => `${doc.name}（${doc.sid}）`).join('、') : '';
  }
  function renderCheckins() {
    renderAuditors();
    const submitted = submissions();
    const total = CONCEPT ? 0 : roomTotal();
    const progress = new Map(CONCEPT ? homeworkRows().map((doc) => [doc.sid, { done: doc.progress, total: doc.total }])
      : Array.from(caseProgress().entries()).map(([sid, row]) => [sid, { done: row.keys.size, total }]));
    // 2026-11-22：全部递交是绿色小标签＋时间；做了一部分的写题数、下面一条细进度条；还没有递交是灰色小标签（原来一律红字）
    const workCell = (sid) => {
      const done = submitted.get(sid);
      const work = progress.get(sid);
      return `<td class="tw-nowrap">${done ? statusTag('全部递交', 'ok') + whenSmall(clock(done)) : work ? progLine(`已递交 ${work.done}/${work.total} 题`, work.done, work.total) : statusTag('还没有递交')}</td>`;
    };
    const query = $('[data-checkin-search]').value.trim();
    const hit = (values) => !query || values.some((value) => String(value || '').includes(query));
    const roster = rosterOf();
    const hasRoster = roster.length > 0;
    ['[data-roster-filter]', '[data-roster-export]', '[data-attendance-export]', '[data-roster-stats]', '[data-attend-menu]'].forEach((selector) => { $(selector).hidden = !hasRoster; });
    const day = checkinDay();
    const joinedList = students(day);
    // 现在在线：本课堂所有登录过的学号里，2 分钟内报到过的人数（与按日期查看无关）
    const onlineCount = students().filter((row) => isOnline(row.sid)).length;
    $('[data-online-count]').textContent = onlineCount;
    // 2026-11-22：统计条里的“现在在线”换成“已全部递交”（“现在在线”放到上面“我的课堂”的四项统计里）
    $('[data-roster-done]').textContent = submitted.size;
    $('[data-roster-done]').closest('.tw-stat').classList.toggle('is-quiet', !submitted.size);
    if (!hasRoster) {
      $('[data-checkin-head]').innerHTML = `<tr><th>#</th><th>学号</th><th>姓名</th><th>班级</th><th>小组</th><th>${day ? `登录时间（${shortDay(day)}）` : '登录记录'}</th><th>递交情况</th><th>备注</th>${ACTION_HEAD}</tr>`;
      const rows = joinedList.filter((row) => hit([row.sid, row.class_name, row.group_name, ...row.names]));
      $('[data-checkin-rows]').innerHTML = rows.map((row, index) => {
        const names = Array.from(row.names);
        const remark = names.length > 1 ? `同一学号填写了不同姓名：${names.join('、')}` : '';
        return `<tr><td>${index + 1}</td><td>${esc(row.sid)}</td><td class="tw-nowrap">${onlineDot(row.sid)}${esc(names[0])}</td><td>${esc(row.class_name)}</td><td>${esc(row.group_name)}</td><td>${esc(loginText(row, day))}</td>
          ${workCell(row.sid)}<td class="warn">${esc(remark)}</td>${deleteCell(row)}</tr>`;
      }).join('') || `<tr><td colspan="9" class="empty">${day ? '这一天没有登录记录。' : '还没有学生加入这个课堂。把课堂码或加入链接展示给学生。'}</td></tr>`;
      return;
    }
    // 按点名册核对：已登录 / 请假 / 未登录 / 名单外（请假看选中的那一天；全部日期时看本课堂各上课日）
    const joined = new Map(joinedList.map((row) => [sidKey(row.sid), row]));
    const inRoster = new Set(roster.map((person) => sidKey(person.sid)));
    const extra = joinedList.filter((row) => !inRoster.has(sidKey(row.sid)));
    const present = roster.filter((person) => joined.has(sidKey(person.sid))).length;
    const scope = day ? [day] : roomDays();
    const leaveOf = new Map(roster.map((person) => [sidKey(person.sid), leavesOf(person.sid, scope)]));
    const onLeave = roster.filter((person) => !joined.has(sidKey(person.sid)) && leaveOf.get(sidKey(person.sid)).length).length;
    $('[data-roster-total]').textContent = roster.length;
    $('[data-roster-present]').textContent = present;
    $('[data-roster-leave]').textContent = onLeave;
    $('[data-roster-absent]').textContent = roster.length - present - onLeave;
    $('[data-roster-extra]').textContent = extra.length;
    // 统计条的图标：有人请假、名单外登录时黄色，有人未登录时红色，是 0 时灰色
    const tone = (selector, n, on) => { const box = $(selector).closest('.tw-stat'); box.classList.toggle(on, n > 0); box.classList.toggle('is-quiet', !n); };
    tone('[data-roster-leave]', onLeave, 'is-wait');
    tone('[data-roster-absent]', roster.length - present - onLeave, 'is-alert');
    tone('[data-roster-extra]', extra.length, 'is-wait');
    const filter = $('[data-roster-filter]').value;
    $('[data-checkin-head]').innerHTML = `<tr><th>#</th><th>学号</th><th>姓名</th><th>${day ? `${shortDay(day)} 登录` : '本次课堂'}</th><th>班级 / 小组</th><th>递交情况</th><th>备注</th>${ACTION_HEAD}</tr>`;
    const rosterRows = filter === 'extra' ? [] : roster.map((person, index) => ({ person, index, row: joined.get(sidKey(person.sid)) }))
      .filter(({ person, row }) => filter === 'all' || (filter === 'present' ? row : filter === 'leave' ? !row && leaveOf.get(sidKey(person.sid)).length : !row && !leaveOf.get(sidKey(person.sid)).length))
      .filter(({ person, row }) => hit([person.sid, person.name, person.class, row && row.group_name, ...(row ? Array.from(row.names) : [])]));
    const extraRows = filter === 'all' || filter === 'extra' ? extra.filter((row) => hit([row.sid, row.class_name, row.group_name, ...row.names])) : [];
    $('[data-checkin-rows]').innerHTML = rosterRows.map(({ person, index, row }) => {
      const names = row ? Array.from(row.names) : [];
      const leave = leaveOf.get(sidKey(person.sid));
      const leaveText = leave.length ? `请假（${leave.map((item) => `${leaveRange(item)}：${item.reason}`).join('；')}） ` : '';
      const makeupText = row && row.makeup ? `请假补做（${Array.from(row.makeup).sort().map(shortDay).join('、')} 登录补交） ` : '';
      const remark = leaveText + makeupText + (person.extra ? '班外（老师已允许） ' : '') + (row && !names.includes(person.name) ? `登录时填写的姓名：${names.join('、')}` : names.length > 1 ? `同一学号填写了不同姓名：${names.join('、')}` : '');
      return `<tr class="${row ? '' : leave.length ? 'tw-leave' : 'tw-absent'}"><td>${index + 1}</td><td>${esc(person.sid)}</td><td class="tw-nowrap">${onlineDot(person.sid)}${esc(person.name)}</td>
        <td class="tw-nowrap">${row ? statusTag('已登录', 'ok') + loginWhen(row, day) : leave.length ? statusTag('请假', 'warn') : statusTag('未登录', 'bad')}</td>
        <td>${esc((row && row.class_name) || person.class || '')}${row && row.group_name ? ` / ${esc(row.group_name)}` : ''}</td>
        ${row ? workCell(row.sid) : '<td></td>'}<td class="warn">${esc(remark)}</td>${person.extra ? deleteCell(row || { sid: person.sid, names: new Set([person.name]) }, true) : row ? deleteCell(row) : '<td></td>'}</tr>`;
    }).join('') + extraRows.map((row) => `<tr class="tw-extra"><td>外</td><td>${esc(row.sid)}</td><td class="tw-nowrap">${onlineDot(row.sid)}${esc(Array.from(row.names).join('、'))}</td>
        <td class="tw-nowrap">${statusTag('名单外登录', 'warn')}${loginWhen(row, day)}</td><td>${esc(row.class_name)}${row.group_name ? ` / ${esc(row.group_name)}` : ''}</td>${workCell(row.sid)}
        <td class="warn">学号不在点名册里（可能填错学号，或不是本班学生）</td>${deleteCell(row)}</tr>`).join('')
      || '<tr><td colspan="8" class="empty">没有符合条件的学生。</td></tr>';
  }
  // 删除某个学生在本课堂的记录（加入、选择、作答、作业、弹幕），其他课堂不受影响
  $('[data-checkin-rows]').addEventListener('click', async (event) => {
    const trash = event.target.closest('[data-student-delete]');
    if (!trash || !state.room) return;
    const sid = trash.dataset.studentDelete;
    const row = students().find((item) => String(item.sid) === sid);
    const extra = trash.dataset.studentExtra ? rosterOf().find((person) => person.extra && sidKey(person.sid) === sidKey(sid)) : null;
    const name = row ? Array.from(row.names).join('、') : extra ? extra.name : '';
    const room = state.room;
    const klass = state.klass;
    if (!window.confirm(extra
      ? `确定把班外同学 ${name}（学号 ${sid}）从本班移除吗？\n\n会删除该生在本课堂“${room.name}”的加入记录、选择、作答、作业和弹幕，并撤销允许：从本班点名册移除，已登录的设备不能再递交，也不能再登录。此操作无法恢复，其他课堂的记录不受影响。\n\n（以后要加回，可在“登录安全”的班外加入申请里改为允许。）`
      : `确定删除 ${name}（学号 ${sid}）在本课堂“${room.name}”的加入记录、选择、作答、作业和弹幕吗？此操作无法恢复，其他课堂不受影响。\n\n（学生如果再次用课堂码登录，会重新出现在名单里。）`)) return;
    const status = $('[data-checkin-status]');
    trash.disabled = true;
    status.textContent = '正在删除……';
    try {
      const where = { classroom: Number(room.id), sid: row ? row.sid : sid };
      for (const kind of ['checkins', 'choices', 'answers', 'danmaku', 'homework']) await backend.removeAll(kind, where);
      try { await backend.removeAll('bonus', { classroom: where.classroom, sid: sidKey(where.sid) }); } catch (error) { if (!missingTable(error)) throw error; }
      try { await backend.removeAll('presence', { classroom: where.classroom, sid: sidKey(where.sid) }); } catch (error) { if (!missingTable(error)) throw error; }
      try { await backend.removeAll('puzzleguesses', { classroom: where.classroom, sid: sidKey(where.sid) }); } catch (error) { if (!missingTable(error)) throw error; }
      let done = `已删除 ${name}（学号 ${sid}）在本课堂的记录。`;
      if (extra && klass) {
        // 撤销允许（同“登录安全”里的“撤销允许”）：从本班点名册移除、解除已登录的设备
        const request = (await backend.fetchAll('requests', { class_id: Number(klass.id) || klass.id }))
          .find((item) => sidKey(item.sid) === sidKey(sid) && item.status === 'approved');
        if (request) {
          await backend.rpc('ck_decide_request', { p_id: Number(request.id) || request.id, p_allow: false });
          await loadClasses();
          showClassInfo();
          done = `已把 ${name}（学号 ${sid}）从本班移除，并删除了该生在本课堂的记录。`;
        } else {
          done += '没有找到该生的加入申请，请到“登录安全”里撤销允许。';
        }
      }
      status.textContent = done;
      renderCheckins();
      if (state.room && String(state.room.id) === String(room.id)) subscribe();
    } catch (error) {
      console.error(error);
      trash.disabled = false;
      status.textContent = `删除失败：${error.message || error}`;
    }
  });

  // 读取 .xlsx（Office Open XML，本质是 zip）：只取第一个工作表，在浏览器里解压，不上传文件
  const columnIndex = (ref) => {
    const letters = String(ref).replace(/\d+$/, '');
    let index = 0;
    for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
    return index - 1;
  };
  async function readXlsx(buffer) {
    if (typeof DecompressionStream === 'undefined') throw new Error('浏览器版本较旧，无法读取 xlsx，请改用最新版 Chrome / Edge，或把点名册另存为 csv');
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('不是有效的 xlsx 文件');
    const files = new Map();
    const utf8 = new TextDecoder();
    let offset = view.getUint32(end + 16, true);
    for (let n = view.getUint16(end + 10, true); n > 0; n -= 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const nameLength = view.getUint16(offset + 28, true);
      files.set(utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)), {
        method: view.getUint16(offset + 10, true), size: view.getUint32(offset + 20, true), local: view.getUint32(offset + 42, true) });
      offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
    const read = async (name) => {
      const entry = files.get(name);
      if (!entry) return null;
      const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true);
      const data = bytes.subarray(start, start + entry.size);
      if (entry.method === 0) return utf8.decode(data);
      if (entry.method !== 8) throw new Error('xlsx 使用了不支持的压缩方式');
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const parse = (text) => new DOMParser().parseFromString(text, 'application/xml');
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const workbook = await read('xl/workbook.xml');
    const relations = await read('xl/_rels/workbook.xml.rels');
    if (workbook && relations) {
      const first = parse(workbook).getElementsByTagName('sheet')[0];
      const id = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const relation = Array.from(parse(relations).getElementsByTagName('Relationship')).find((item) => item.getAttribute('Id') === id);
      if (relation) {
        const target = relation.getAttribute('Target');
        sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      }
    }
    const shared = [];
    const sharedXml = await read('xl/sharedStrings.xml');
    if (sharedXml) Array.from(parse(sharedXml).getElementsByTagName('si')).forEach((si) => shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join('')));
    const sheet = await read(sheetPath);
    if (!sheet) throw new Error('xlsx 里没有找到工作表');
    return Array.from(parse(sheet).getElementsByTagName('row')).map((row) => {
      const cells = [];
      Array.from(row.getElementsByTagName('c')).forEach((cell) => {
        const type = cell.getAttribute('t');
        const v = cell.getElementsByTagName('v')[0];
        let value = type === 's' ? shared[Number(v && v.textContent)] || ''
          : type === 'inlineStr' ? Array.from(cell.getElementsByTagName('t')).map((t) => t.textContent).join('') : (v ? v.textContent : '');
        // 学号存成数字时：去掉 .0、科学计数法还原
        if (type !== 's' && type !== 'inlineStr') {
          if (/^\d+\.0+$/.test(value)) value = value.replace(/\.0+$/, '');
          else if (/^\d(\.\d+)?E\+?\d+$/i.test(value)) value = Number(value).toFixed(0);
        }
        const index = columnIndex(cell.getAttribute('r') || '');
        cells[index >= 0 ? index : cells.length] = value;
      });
      return Array.from(cells, (value) => String(value == null ? '' : value).trim());
    });
  }
  // 读取 .csv：先按 UTF-8，失败再按 GBK（Excel 在中文 Windows 上另存的 csv）
  async function readCsv(file) {
    const buffer = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (error) { text = new TextDecoder('gbk').decode(buffer); }
    text = text.replace(/^﻿/, '');
    const rows = [];
    let row = [''];
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { row[row.length - 1] += '"'; i += 1; } else if (ch === '"') quoted = false; else row[row.length - 1] += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') row.push('');
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; rows.push(row.map((value) => value.trim())); row = ['']; }
      else row[row.length - 1] += ch;
    }
    if (row.length > 1 || row[0]) rows.push(row.map((value) => value.trim()));
    return rows;
  }
  // 识别“姓名”“学号”（可选“班级”）列：先找表头，找不到再按内容猜
  function rosterFrom(rows) {
    const plain = (value) => String(value == null ? '' : value).replace(/\s+/g, '');
    let header = -1;
    let nameCol = -1;
    let sidCol = -1;
    let classCol = -1;
    for (let r = 0; r < Math.min(rows.length, 15) && header < 0; r += 1) {
      const cells = (rows[r] || []).map(plain);
      const n = cells.findIndex((c) => /^(学生)?姓名$|^名字$|^name$/i.test(c));
      const id = cells.findIndex((c) => /学号|学籍号|学生编号|^(student)?id$|^studentno$/i.test(c));
      if (n >= 0 && id >= 0) { header = r; nameCol = n; sidCol = id; classCol = cells.findIndex((c) => /班级|行政班|教学班|^class$/i.test(c)); }
    }
    if (header < 0) {
      const width = Math.max(0, ...rows.map((row) => row.length));
      const score = (test) => Array.from({ length: width }, (_, c) => rows.filter((row) => test(plain(row[c]))).length);
      const sidScore = score((v) => /^[A-Za-z0-9]{6,20}$/.test(v) && /\d{4}/.test(v));
      const nameScore = score((v) => /^[一-龥·]{2,8}$/.test(v));
      sidCol = sidScore.indexOf(Math.max(...sidScore));
      nameCol = nameScore.indexOf(Math.max(...nameScore));
      if (sidCol < 0 || nameCol < 0 || sidCol === nameCol || !sidScore[sidCol] || !nameScore[nameCol]) throw new Error('没有找到“姓名”和“学号”两列，请检查表头');
    }
    const list = [];
    const skipped = [];
    const seen = new Set();
    rows.slice(header + 1).forEach((row, i) => {
      const sid = sidKey(row[sidCol]);
      const name = plain(row[nameCol]);
      if (!sid && !name) return;
      const line = header + i + 2;
      if (!/^[A-Z0-9]{4,20}$/.test(sid) || !name) { skipped.push(`第 ${line} 行（${name || '无姓名'} ${sid || '无学号'}）`); return; }
      if (seen.has(sid)) { skipped.push(`第 ${line} 行（学号 ${sid} 重复）`); return; }
      seen.add(sid);
      list.push({ sid, name: name.slice(0, 20), class: classCol >= 0 ? plain(row[classCol]).slice(0, 40) : '' });
    });
    if (!list.length) throw new Error('没有识别到学生，请检查文件内容');
    const headers = header >= 0 ? rows[header] : [];
    return { list, skipped, nameLabel: headers[nameCol] || `第 ${nameCol + 1} 列`, sidLabel: headers[sidCol] || `第 ${sidCol + 1} 列` };
  }
  let pendingRoster = null;
  $('[data-roster-file]').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || !state.klass) return;
    const info = $('[data-roster-info]');
    info.textContent = `正在识别 ${file.name}……`;
    try {
      const rows = /\.csv$/i.test(file.name) ? await readCsv(file) : await readXlsx(await file.arrayBuffer());
      pendingRoster = rosterFrom(rows);
      const old = rosterOf().length;
      const preview = $('[data-roster-preview]');
      preview.hidden = false;
      preview.innerHTML = `<h2>点名册预览 <small>${esc(file.name)}</small></h2>
        <p>识别到 <b>${pendingRoster.list.length}</b> 名学生（姓名列：${esc(pendingRoster.nameLabel)}；学号列：${esc(pendingRoster.sidLabel)}）${pendingRoster.skipped.length ? `；跳过 ${pendingRoster.skipped.length} 行：${esc(pendingRoster.skipped.slice(0, 5).join('、'))}${pendingRoster.skipped.length > 5 ? '……' : ''}` : ''}。</p>
        <table class="tw-table compact"><thead><tr><th>#</th><th>学号</th><th>姓名</th><th>班级</th></tr></thead><tbody>
        ${pendingRoster.list.slice(0, 8).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.sid)}</td><td>${esc(p.name)}</td><td>${esc(p.class)}</td></tr>`).join('')}
        ${pendingRoster.list.length > 8 ? `<tr><td colspan="4" class="empty">……共 ${pendingRoster.list.length} 人</td></tr>` : ''}</tbody></table>
        <div class="tw-actions"><button type="button" class="tw-primary" data-roster-save>保存为“${esc(state.klass.name)}”的点名册</button><button type="button" class="tw-secondary" data-roster-cancel>取消</button></div>
        ${old ? `<p class="tw-hint">将替换原有点名册（${old} 人）。</p>` : ''}`;
      info.textContent = '核对预览无误后点“保存”。';
    } catch (error) {
      console.error(error);
      info.textContent = `识别失败：${error.message || error}（请上传 .xlsx 或 .csv；旧版 .xls 请先在 Excel 里另存为 .xlsx）`;
    }
  });
  $('[data-roster-preview]').addEventListener('click', async (event) => {
    if (event.target.closest('[data-roster-cancel]')) { pendingRoster = null; $('[data-roster-preview]').hidden = true; showClassInfo(); return; }
    if (!event.target.closest('[data-roster-save]') || !pendingRoster) return;
    const button = event.target.closest('[data-roster-save]');
    button.disabled = true;
    try {
      let saved = await backend.rpc('ck_save_roster', { p_class: Number(state.klass.id) || state.klass.id, p_roster: pendingRoster.list });
      if (Array.isArray(saved)) saved = saved[0];
      state.klass = { ...state.klass, ...saved, roster: saved && Array.isArray(saved.roster) ? saved.roster : pendingRoster.list };
      pendingRoster = null;
      $('[data-roster-preview]').hidden = true;
      showClassInfo();
      renderCheckins();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      $('[data-roster-info]').textContent = `保存失败：${error.message || error}`;
    }
  });
  // 导出考勤：本次课堂 / 本班全部课堂（点名册 × 课堂）
  // “导出考勤”菜单（2026-11-22 第三档美化，原来是两个按钮）：点了其中一项、点菜单外面或按 Esc 就收起
  const attendMenu = $('[data-attend-menu]');
  attendMenu.addEventListener('click', (event) => { if (event.target.closest('.tw-menu-list button')) attendMenu.open = false; });
  document.addEventListener('click', (event) => { if (attendMenu.open && !attendMenu.contains(event.target)) attendMenu.open = false; });
  attendMenu.addEventListener('keydown', (event) => { if (event.key === 'Escape' && attendMenu.open) { attendMenu.open = false; attendMenu.querySelector('summary').focus(); } });
  $('[data-roster-export]').addEventListener('click', () => {
    if (!state.room) return;
    const day = $('[data-checkin-date]').value;
    const list = students(day);
    const joined = new Map(list.map((row) => [sidKey(row.sid), row]));
    const inRoster = new Set(rosterOf().map((p) => sidKey(p.sid)));
    const times = (row) => Array.from(row.days.entries()).map(([d, ts]) => `${d} ${clock(ts)}`).join('、');
    const scope = day ? [day] : roomDays();
    const rows = rosterOf().map((p, i) => {
      const row = joined.get(sidKey(p.sid));
      const leave = leavesOf(p.sid, scope);
      return [i + 1, p.sid, p.name, p.class, row ? '已登录' : leave.length ? '请假' : '未登录', row ? times(row) : '', row ? Array.from(row.names).join('、') : '', row ? row.group_name : '',
        leave.map((item) => `${leaveRange(item)} ${item.reason}`).join('；')];
    });
    list.filter((row) => !inRoster.has(sidKey(row.sid))).forEach((row) => rows.push(['名单外', row.sid, '', row.class_name, '名单外登录', times(row), Array.from(row.names).join('、'), row.group_name, '']));
    download(`${course.title}_${safeName(state.klass.name)}_${safeName(state.room.name)}_考勤_${day || window.ClassLive.today()}.csv`,
      csv([['序号', '学号', '姓名（点名册）', '班级（点名册）', day ? `${day} 登录` : '本次课堂', '登录时间（每天第一次）', '登录时填写的姓名', '小组', '请假（日期 原因）'], ...rows]));
  });
  $('[data-attendance-export]').addEventListener('click', async () => {
    const info = $('[data-roster-info]');
    info.textContent = '正在汇总本班全部课堂的考勤……';
    try {
      const rooms = state.rooms.slice().sort((a, b) => Number(a.id) - Number(b.id));
      const ids = new Set(rooms.map((room) => String(room.id)));
      const all = (await classData.get('checkins', rooms)).filter((doc) => ids.has(String(doc.classroom)) && !doc.auditor);   // 旁听不计；2026-11-26 起只读本班的（classData）
      // 请假补做的登录（2026-11-19）不单占一列、不算出勤：请假那一格写“假·补”
      const checkins = all.filter((doc) => !doc.makeup);
      const madeUp = new Set(all.filter((doc) => doc.makeup).map((doc) => `${sidKey(doc.sid)}|${doc.classroom}`));
      // 一列＝一个课堂的一个上课日期（同一课堂分几次课上就有几列）；没有任何登录的课堂按发布日期占一列
      const seen = new Map();   // 学号 → 出现过的“课堂|日期”
      const columns = [];
      rooms.forEach((room) => {
        const days = Array.from(new Set(checkins.filter((doc) => String(doc.classroom) === String(room.id)).map(dayOf))).filter(Boolean).sort();
        (days.length ? days : [isoDay(millis(room.created_at))]).forEach((day) => columns.push({ key: `${room.id}|${day}`, title: `${room.name}（${day}）` }));
      });
      checkins.forEach((doc) => { const key = sidKey(doc.sid); const set = seen.get(key) || new Set(); set.add(`${doc.classroom}|${dayOf(doc)}`); seen.set(key, set); });
      const header = ['学号', '姓名', ...columns.map((column) => column.title), '出勤次数', '请假次数'];
      const line = (sid, name) => {
        const set = seen.get(sidKey(sid)) || new Set();
        const marks = columns.map((column) => (set.has(column.key) ? '✓' : leavesOf(sid, [column.key.split('|')[1]]).length
          ? (madeUp.has(`${sidKey(sid)}|${column.key.split('|')[0]}`) ? '假·补' : '假') : ''));
        return [sid, name, ...marks, marks.filter((mark) => mark === '✓').length, marks.filter((mark) => mark.startsWith('假')).length];
      };
      const rows = rosterOf().map((p) => line(p.sid, p.name));
      const inRoster = new Set(rosterOf().map((p) => sidKey(p.sid)));
      seen.forEach((_, sid) => { if (!inRoster.has(sid)) rows.push(line(sid, '（名单外）')); });
      download(`${course.title}_${safeName(state.klass.name)}_全部课堂考勤_${window.ClassLive.today()}.csv`, csv([header, ...rows]));
      showClassInfo();
    } catch (error) {
      console.error(error);
      info.textContent = `导出失败：${error.message || error}`;
    }
  });

  // ---------------- 投票与选择 ----------------
  function setupSelectors() {
    if (CONCEPT) { setupConcept(); return; }
    const cases = roomCases();
    const options = cases.map((item) => `<option value="${item.number}">案例${item.number} ${esc(item.title)}</option>`).join('');
    $('[data-case-select]').innerHTML = options;
    $('[data-answer-case]').innerHTML = options;
    fillItems();
  }
  $('[data-case-select]').addEventListener('change', renderChoices);
  $('[data-show-reference]').addEventListener('change', renderChoices);
  $('[data-answer-case]').addEventListener('change', () => { fillItems(); renderAnswers(); });
  $('[data-answer-item]').addEventListener('change', renderAnswers);
  $('[data-answer-search]').addEventListener('input', renderAnswers);

  const latestChoices = (caseNo) => window.ClassLive.latest(
    state.docs.choices.filter((doc) => doc.case === caseNo),
    (doc) => `${doc.sid}|${doc.item}`,
  );
  const tally = (docs, item) => {
    const counts = new Map();
    docs.filter((doc) => doc.item === item).forEach((doc) => counts.set(String(doc.choice), (counts.get(String(doc.choice)) || 0) + 1));
    return counts;
  };
  const bar = (count, total, cls) => `<span class="tw-meter ${cls || ''}"><i style="width:${pct(count, total)}%"></i></span><em>${count} 人 · ${pct(count, total)}%</em>`;
  const sum = (counts) => Array.from(counts.values()).reduce((a, b) => a + b, 0);

  function renderChoices() {
    const item = caseMap.get($('[data-case-select]').value);
    const view = $('[data-choice-view]');
    if (!item) { view.innerHTML = ''; return; }
    const showRef = $('[data-show-reference]').checked;
    const docs = latestChoices(item.number);
    const star = (flag) => (showRef && flag ? '<b class="ref" title="参考答案">★</b>' : '');
    const pre = tally(docs, 'pre');
    const post = tally(docs, 'post');
    const preTotal = sum(pre);
    const postTotal = sum(post);
    const poll = `
      <article class="tw-card wide">
        <h2>前测与后测投票 <small>前测 ${preTotal} 人 · 后测 ${postTotal} 人${showRef ? ` · 选中参考答案：前测 ${pct(pre.get(String(item.poll.reference)) || 0, preTotal)}%，后测 ${pct(post.get(String(item.poll.reference)) || 0, postTotal)}%` : ''}</small></h2>
        <p class="tw-q">${esc(item.poll.question)}</p>
        ${item.poll.options.map((option, index) => {
          const key = String(index + 1);
          return `<div class="tw-option"><div class="tw-option-label">${star(item.poll.reference === index + 1)}<span>${String(index + 1).padStart(2, '0')}</span>${esc(option)}</div>
            <div class="tw-pair"><label>前测</label>${bar(pre.get(key) || 0, preTotal, 'pre')}</div>
            <div class="tw-pair"><label>后测</label>${bar(post.get(key) || 0, postTotal, 'post')}</div></div>`;
        }).join('')}
      </article>`;
    const oldTkHere = !(item.practice && item.practice.transfer) || docs.some((doc) => OLD_TK.test(doc.item));   // 2026-11-12 起新课用小资料分析
    const match = !oldTkHere ? '' : `
      <article class="tw-card wide">
        <h2>迁移任务 · 小案例 1—4 <small>（原证据—理论配对，题号和参考答案不变；小案例 5 见下方“迁移·选一选”）</small></h2>
        <ol class="tw-legend">${item.matching.legend.map((text, index) => `<li><b>K${index + 1}</b>${esc(text)}</li>`).join('')}</ol>
        <table class="tw-table compact"><thead><tr><th>小案例</th>${[1, 2, 3, 4].map((k) => `<th>K${k}</th>`).join('')}<th>人数</th>${showRef ? '<th>对应参考</th><th>错误率</th>' : ''}</tr></thead><tbody>
        ${item.matching.clues.map((clue, index) => {
          const counts = tally(docs, `match-${index + 1}`);
          const total = sum(counts);
          return `<tr><th>${esc(clue.label)}</th>${[1, 2, 3, 4].map((k) => {
            const mark = showRef ? (clue.answer === k ? ' is-answer' : clue.accept.includes(k) ? ' is-accept' : '') : '';
            const count = counts.get('K' + k) || 0;
            return `<td class="tw-cell${mark}">${count}<small>${pct(count, total)}%</small></td>`;
          }).join('')}<td>${total}</td>${showRef ? (() => {
            const right = counts.get('K' + clue.answer) || 0;
            const alt = clue.accept.reduce((sum, k) => sum + (counts.get('K' + k) || 0), 0);
            const wrong = Math.max(0, total - right - alt);
            return `<td>${pct(right, total)}%<small>可成立 ${pct(alt, total)}%</small></td>`
              + `<td class="${total && pct(wrong, total) >= 40 ? 'warn' : ''}">${pct(wrong, total)}%<small>${wrong} 人</small></td>`;
          })() : ''}</tr>`;
        }).join('')}</tbody></table>
        ${showRef ? '<p class="tw-hint">深色格为参考对应，浅色格为可以成立的答案；错误率＝选了其他理论要点的人数比例，40% 及以上标红。</p>' : ''}
      </article>`;
    // 没有推演或圆桌议程的章节（如用猜词游戏代替圆桌会议的第二章）不显示这张卡
    const sim = !item.sim.rounds.length ? '' : `
      <article class="tw-card wide">
        <h2>${item.practice ? '圆桌协商 · 三项议程的协商意见（全班）' : `方案推演：${esc(item.sim.title)}`}</h2>
        ${item.sim.rounds.map((round, index) => {
          const counts = tally(docs, `sim-${index + 1}`);
          const total = sum(counts);
          const best = round.options.find((option) => option.reference);
          return `<div class="tw-round"><h3>${esc(round.title)} <small>${total} 人${showRef && best ? ` · 选中参考方案 ${pct(counts.get(best.letter) || 0, total)}%` : ''}</small></h3><p class="tw-q">${esc(round.question)}</p>
            ${round.options.map((option) => `<div class="tw-option single"><div class="tw-option-label">${star(option.reference)}<span>${option.letter}</span>${esc(option.text)}</div>${bar(counts.get(option.letter) || 0, total)}</div>`).join('')}</div>`;
        }).join('')}
      </article>`;
    // 迁移任务“选一选”：参考 K 与可以成立的 K 都算对
    const transfer = item.transfer && oldTkHere ? (() => {
      const counts = tally(docs, 'transfer-k');
      const total = sum(counts);
      const ok = (k) => k === item.transfer.answer || item.transfer.accept.includes(k);
      const right = item.transfer.options.reduce((n, _, index) => n + (ok(index + 1) ? counts.get(`K${index + 1}`) || 0 : 0), 0);
      return `
      <article class="tw-card wide">
        <h2>迁移任务 · 小案例 5（新情境） <small>${total} 人${showRef ? ` · 正确率 ${pct(right, total)}%（含可以成立的）` : ''}</small></h2>
        <p class="tw-q">${esc(item.transfer.scene)}</p>
        ${item.transfer.options.map((text, index) => `<div class="tw-option single"><div class="tw-option-label">${star(index + 1 === item.transfer.answer)}<span>K${index + 1}</span>${esc(text)}${showRef && item.transfer.accept.includes(index + 1) ? '（可以成立）' : ''}</div>${bar(counts.get(`K${index + 1}`) || 0, total)}</div>`).join('')}
      </article>`;
    })() : '';
    // 实操改版：客观题（单选、判断、多选）、辩论赛、圆桌会议
    const practice = item.practice ? (() => {
      const P = item.practice;
      const L = (i) => String.fromCharCode(65 + i);
      const quizCard = (group) => `
      <article class="tw-card wide">
        <h2>${esc(group.title)}</h2>
        ${group.items.map((q) => {
          const counts = tally(docs, q.key);
          const total = sum(counts);
          const per = new Map();
          counts.forEach((n, choice) => String(choice).split(',').filter(Boolean).forEach((k) => per.set(k, (per.get(k) || 0) + n)));
          const key = q.answer.slice().sort().join(',');
          const right = Array.from(counts.entries()).filter(([choice]) => String(choice).split(',').filter(Boolean).sort().join(',') === key).reduce((n, [, c]) => n + c, 0);
          return `<div class="tw-quiz"><p class="tw-q">${esc(q.prompt)} <small>${total} 人${showRef && key ? ` · 正确率 ${pct(right, total)}%${q.type === 'multi' ? '（全对）' : ''}` : ''}</small></p>
            ${q.options.map((text, i) => `<div class="tw-option single"><div class="tw-option-label">${star(q.answer.includes(q.keys[i]))}<span>${q.type === 'judge' ? '' : L(i)}</span>${esc(text)}</div>${bar(per.get(q.keys[i]) || 0, total)}</div>`).join('')}</div>`;
        }).join('')}
      </article>`;
      const votes = (key) => tally(docs, key);
      const pre = votes('debate-pre');
      const post = votes('debate-post');
      const cards = votes('debate-cards');
      const cardCount = new Map();
      cards.forEach((n, choice) => String(choice).split(',').forEach((k) => cardCount.set(k, (cardCount.get(k) || 0) + n)));
      const debate = `
      <article class="tw-card wide">
        <h2>辩论赛 <small>${esc(P.debate.motion)}</small></h2>
        ${P.debate.sides.map(([key, text]) => `<div class="tw-option"><div class="tw-option-label"><span>${key === 'pro' ? '正' : '反'}</span>${esc(text)}　<small>本方 ${pre.get(key) || 0} 人（按辩前投票）</small></div>
          <div class="tw-pair"><label>辩前</label>${bar(pre.get(key) || 0, sum(pre), 'pre')}</div>
          <div class="tw-pair"><label>辩后</label>${bar(post.get(key) || 0, sum(post), 'post')}</div></div>`).join('')}
        <p class="tw-q">论据卡被选的次数</p>
        ${P.debate.cards.map((c) => `<div class="tw-option single"><div class="tw-option-label">${esc(c.text)}</div>${bar(cardCount.get(c.key) || 0, sum(cards))}</div>`).join('')}
      </article>`;
      const roleOf = new Map(docs.filter((doc) => doc.item === 'rt-role').map((doc) => [doc.sid, String(doc.choice)]));
      // 用猜词游戏代替圆桌会议的章节（如第二章）没有圆桌数据，猜词不在网上递交，这里不显示
      const roundtable = !P.roundtable ? '' : `
      <article class="tw-card wide">
        <h2>圆桌会议 · 按角色看三项议程的投票 <small>${roleOf.size} 人选了角色</small></h2>
        <table class="tw-table compact"><thead><tr><th>议程</th><th>角色</th><th>A</th><th>B</th><th>C</th><th>人数</th></tr></thead><tbody>
        ${P.roundtable.rounds.map((round) => {
          const rows = P.roundtable.roles.concat(['未选角色'])
            .map((role) => ({ role, mine: docs.filter((doc) => doc.item === round.item && (roleOf.get(doc.sid) || '未选角色') === role) }))
            .filter((row) => row.mine.length);
          if (!rows.length) return `<tr><th>${esc(round.title)}</th><td colspan="5">还没有人递交</td></tr>`;
          // 协商意见：全班选得最多的方案；共识度＝它占的比例
          const votesAll = docs.filter((doc) => doc.item === round.item);
          const top = round.letters.map((letter) => [letter, votesAll.filter((doc) => String(doc.choice) === letter).length]).sort((a, b) => b[1] - a[1])[0];
          const title = `${round.title}<small>协商意见 ${top[0]} · 共识度 ${pct(top[1], votesAll.length)}%</small>`;
          return rows.map(({ role, mine }, ri) => `<tr>${ri === 0 ? `<th rowspan="${rows.length}">${title}</th>` : ''}<td>${esc(role)}</td>${round.letters.map((letter) => {
            const n = mine.filter((doc) => String(doc.choice) === letter).length;
            return `<td class="${showRef && letter === round.reference ? 'is-answer' : ''}">${n}</td>`;
          }).join('')}<td>${mine.length}</td></tr>`).join('');
        }).join('')}
        </tbody></table>
      </article>`;
      // 经营沙盘（2026-11-03）：各角色组选了多少人（代表、投票和结算在投屏页的经营台）
      const bizVotes = votes('biz-role');
      const biz = !P.biz ? '' : `
      <article class="tw-card wide">
        <h2>经营沙盘 · 各角色组人数 <small>${sum(bizVotes)} 人选了角色组；代表、投票和结算在投屏页的经营台</small></h2>
        ${P.biz.roles.map((name, i) => `<div class="tw-option single"><div class="tw-option-label"><span>${L(i)}</span>${esc(name)}</div>${bar(bizVotes.get(`r${i + 1}`) || 0, sum(bizVotes))}</div>`).join('')}
      </article>`;
      // 纠错诊断：这一课堂是用旧题（判断＋单选）上的，就按旧题列出
      const oldMythHere = docs.some((doc) => OLD_MYTH.test(doc.item));
      return P.groups.map((group) => quizCard(group.legacy && oldMythHere ? { ...group, title: `${group.title}（旧题：判断＋单选）`, items: group.legacy } : group)).join('')
        + (P.transfer ? quizCard(P.transfer) : '') + debate + roundtable + biz;
    })() : '';
    view.innerHTML = poll + match + sim + transfer + practice;
  }

  // ---------------- 文字作答 ----------------
  // 文字作答的下拉框：写作题之外加一项“后测 · 是什么改变了判断”（2026-11-26，后测改了选项的同学写的，不计分，不在 c.items 里、不进结算）
  const answerItems = (item) => (item ? item.items.concat(item.poll ? [{ key: 'post-why', label: '后测 · 是什么改变了判断（不计分）',
    prompt: '后测改了选项的同学写的一句话：是哪条事实线索或哪个理论抓手改变了判断。' }] : []) : []);
  function fillItems() {
    const item = caseMap.get($('[data-answer-case]').value);
    const select = $('[data-answer-item]');
    const previous = select.value;
    select.innerHTML = answerItems(item).map((entry) => `<option value="${entry.key}">${esc(entry.label)}</option>`).join('');
    if (answerItems(item).some((entry) => entry.key === previous)) select.value = previous;
  }
  function renderAnswers() {
    const item = caseMap.get($('[data-answer-case]').value);
    if (!item) { $('[data-answer-list]').innerHTML = ''; $('[data-answer-prompt]').textContent = ''; return; }
    const key = $('[data-answer-item]').value;
    const entry = answerItems(item).find((candidate) => candidate.key === key);
    $('[data-answer-prompt]').innerHTML = entry ? esc(entry.prompt)
      + (entry.reference && entry.reference.length ? `<details class="tw-reference"><summary>${esc(entry.reference_label || '参考要点')}</summary><ol${entry.reference_label ? ' class="is-steps"' : ''}>${entry.reference.map((line) => `<li>${esc(line)}</li>`).join('')}</ol></details>` : '') : '';
    const query = $('[data-answer-search]').value.trim();
    const docs = window.ClassLive.latest(
      state.docs.answers.filter((doc) => doc.case === item.number && doc.item === key),
      (doc) => doc.sid,
    ).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const answered = new Set(docs.map((doc) => doc.sid));
    const missing = students().filter((row) => !answered.has(row.sid));
    $('[data-answer-count]').textContent = docs.length;
    $('[data-answer-missing]').textContent = missing.length;
    const missBox = $('[data-answer-missing]').closest('.tw-stat');
    missBox.classList.toggle('is-wait', missing.length > 0);
    missBox.classList.toggle('is-quiet', !missing.length);
    $('[data-missing-names]').textContent = missing.map((row) => `${Array.from(row.names)[0]}（${row.sid}）`).join('、') || '无';
    const shown = docs.filter((doc) => !query || doc.sid.includes(query) || doc.name.includes(query));
    $('[data-answer-list]').innerHTML = shown.map((doc) => `
      <article class="tw-answer"><header><strong>${esc(doc.name)}</strong><span>${esc(doc.sid)}</span><time>${clock(doc.ts)}</time></header><p>${esc(doc.text)}</p></article>`).join('')
      || '<p class="empty">还没有学生提交这道题。</p>';
  }

  // ---------------- 概念学习课程：作业批阅 ----------------
  const LET = (index) => String.fromCharCode(65 + Number(index));
  const toNumber = (value) => {
    const text = String(value == null ? '' : value).trim();
    if (!text) return NaN;
    return Number(text.replace(/[％%\s]/g, '').replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)));
  };
  const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
  const filled = (value) => value != null && String(value).trim() !== '';
  const JUDGE = [{ value: 1, label: '✓ 说得对' }, { value: 0, label: '✗ 说得不对' }];
  const lettered = (texts) => texts.map((text, index) => ({ value: index, label: `${LET(index)}. ${text}` }));
  const short = (text, size) => (String(text).length > size ? `${String(text).slice(0, size)}…` : String(text));

  function unitSections(unit) {
    if (unit.exam) return [{ id: 'exam', label: '期中考查作业：全部作答' }];
    if (unit.plain) return [{ id: 'overview', label: '总览：逐题作答与正确率' }, ...(unit.sections || [])];   // 《金融机构与市场》：按页面上的各部分
    return [
      { id: 'overview', label: '总览：逐题作答与正确率' },
      ...unit.concepts.map((k, index) => ({ id: k.id, label: `概念 ${index + 1} · ${k.name}` })),
      { id: 'chain', label: '概念串联' },
      ...(unit.transfer ? [{ id: 'transfer', label: '迁移任务' }] : []),
      { id: 'discussion', label: unit.debate ? '辩论赛' : '小组辨析' },
      { id: 'exit', label: '出门测' },
      ...(unit.poll ? [{ id: 'poll', label: '课堂投票' }] : []),
      ...(unit.essay && !unit.essay.legacy ? [{ id: 'essay', label: '课后思考' }] : []),
    ];
  }

  // 一份作业快照 → 逐题记录。type：option 选项题 / value 填空与计算 / text 文字题（不判对错）/ order 串联位置
  // legacy：这份作业来自小组辨析时期（2026-10-29 改为辩论赛之前的课堂），仍按原来的立场、理由显示和计分，以前课堂的修为不变
  // noTransfer：这份作业来自迁移任务上线之前（2026-10-30 起才有），不列迁移任务，以前课堂的修为不变
  function gradeHomework(unit, payload, legacy, noTransfer) {
    const S = payload && typeof payload === 'object' ? payload : {};
    const texts = S.texts || {};
    const items = [];
    const option = (section, key, step, label, options, value, ref, prompt) => {
      const find = (v) => options.find((o) => String(o.value) === String(v));
      const answered = value != null && value !== '' && Boolean(find(value));
      items.push({ section, key, step, label, prompt, type: 'option', options, value: answered ? value : null,
        shown: answered ? find(value).label : '', ref, refShown: ref == null ? '' : (find(ref) || {}).label || '',
        correct: !answered || ref == null ? null : String(value) === String(ref) });
    };
    const field = (section, key, step, label, value, ref, judge, prompt) => {
      const answered = filled(value);
      items.push({ section, key, step, label, prompt, type: 'value', value: answered ? String(value).trim() : null,
        shown: answered ? String(value).trim() : '', ref, refShown: String(ref), correct: answered ? judge(value) : null });
    };
    const text = (section, key, step, label, value, prompt) => {
      const answered = filled(value);
      items.push({ section, key, step, label, prompt, type: 'text', value: answered ? String(value) : null,
        shown: answered ? String(value) : '', ref: null, refShown: '', correct: null });
    };
    // 期中考查作业：只有一篇短文（不判对错，老师批阅，满分 100）
    if (unit.exam) {
      text('exam', 'exam', '期中考查作业', `${unit.exam.type}题（总分 ${unit.exam.score} 分）`, texts.exam, unit.exam.question);
      return { items, exitSubmitted: false, exitRight: 0, exitAnswered: 0, exitTotal: 0, autoRight: 0, autoAnswered: 0, autoTotal: 0 };
    }
    // 《金融机构与市场》（2026-11-20）的通用题目：单选、判断按选项统计；多选、填数按填写的内容统计；文字题不判对错
    if (unit.plain) {
      const X = S.x || {};
      (unit.extra || []).forEach((q) => {
        const v = X[q.key];
        if (q.type === 'single') option(q.section, q.key, q.step, q.label, lettered(q.options), v, q.answer, q.prompt);
        else if (q.type === 'judge') option(q.section, q.key, q.step, q.label, JUDGE, v, q.answer, q.prompt);
        else if (q.type === 'multi') {
          const letters = (list) => (Array.isArray(list) ? list.map(Number).sort((a, b) => a - b).map((i) => LET(i)).join('、') : '');
          field(q.section, q.key, q.step, q.label, letters(v), letters(q.answer), (shown) => shown === letters(q.answer),
            `${q.prompt}（多选：${q.options.map((text, i) => `${LET(i)}. ${text}`).join('；')}）`);
        } else if (q.type === 'num') {
          field(q.section, q.key, q.step, q.label, v, `${q.answer}${q.unit || ''}`, (shown) => Math.abs(toNumber(String(shown).replace(/[−–—－]/g, '-')) - q.answer) <= (q.tol || 1e-6),
            `${q.prompt}${q.unit ? `（单位：${q.unit}）` : ''}`);
        } else text(q.section, q.key, q.step, q.label, v, q.prompt);
      });
      const graded = items.filter((item) => item.ref != null);
      return { items, exitSubmitted: false, exitRight: 0, exitAnswered: 0, exitTotal: 0,
        autoRight: graded.filter((item) => item.correct).length, autoAnswered: graded.filter((item) => item.value != null).length, autoTotal: graded.length };
    }
    unit.concepts.forEach((k) => {
      const box = S[k.id] && typeof S[k.id] === 'object' ? S[k.id] : {};
      const discover = box.discover || {};
      option(k.id, `${k.id}.discover`, '想一想', '想一想', lettered(k.discover.options), discover.choice, k.discover.answer, k.discover.prompt);
      const check = box.check || {};
      if (k.check.type === 'judge') {
        k.check.texts.forEach((t, i) => option(k.id, `${k.id}.check.${i}`, '辨一辨', `辨一辨 ${i + 1}`, JUDGE, (check.sel || [])[i], k.check.answers[i], t));
      } else {
        option(k.id, `${k.id}.check`, '辨一辨', '辨一辨', lettered(k.check.options), check.choice, k.check.answer, k.check.prompt);
      }
      const apply = box.apply || {};
      const spec = k.apply;
      if (spec.type === 'sort') {
        const bins = spec.bins.map((bin, j) => ({ value: j, label: bin }));
        spec.texts.forEach((t, i) => option(k.id, `${k.id}.apply.${i}`, '用一用', `分一分 ${i + 1}`, bins, (apply.sel || [])[i], spec.answers[i], t));
      } else if (spec.type === 'fill') {
        spec.answers.forEach((answer, i) => field(k.id, `${k.id}.apply.${i}`, '用一用', `填空 第 ${i + 1} 空`, (apply.vals || [])[i], answer,
          (v) => String(v).trim() === answer, `第 ${i + 1} 空`));
      } else {
        spec.fields.forEach((f, i) => field(k.id, `${k.id}.apply.${i}`, '用一用', `计算 ${i + 1}`, (apply.vals || [])[i], f.answer,
          (v) => near(toNumber(v), f.answer), `${f.label}${f.unit ? `（单位：${f.unit}）` : ''}`));
        if (spec.challenge) {
          field(k.id, `${k.id}.challenge`, '用一用', '挑战题', (box.challenge || {}).val, spec.challenge.answer,
            (v) => near(toNumber(v), spec.challenge.answer), `${spec.challenge.prompt}${spec.challenge.unit ? `（单位：${spec.challenge.unit}）` : ''}`);
        }
      }
      text(k.id, `${k.id}.explain`, '说一说', '说一说', texts[`${k.id}.explain`], k.explain.frame);
    });
    // 概念串联：学生页句子按内部顺序存放，第 i 句是正确顺序中的第 perm[i] 句；没动过初始顺序视为未作答
    const chain = unit.chain;
    const order = S.chain && Array.isArray(S.chain.order) ? S.chain.order.map(Number) : null;
    const valid = order && order.length === chain.perm.length && order.slice().sort((a, b) => a - b).every((v, i) => v === i);
    const touched = valid && (S.chain.submitted || order.some((v, i) => v !== chain.shuffle[i]));
    chain.texts.forEach((t, pos) => {
      const placed = touched ? chain.perm[order[pos]] : null;
      items.push({ section: 'chain', key: `chain.${pos}`, step: '概念串联', label: `第 ${pos + 1} 位`, prompt: t, type: 'order', value: placed,
        shown: placed == null ? '' : `放了“${short(chain.texts[placed], 24)}”`, ref: pos, refShown: short(t, 24),
        correct: placed == null ? null : placed === pos });
    });
    // 迁移任务（2026-10-30 起代替“把案例和概念对上号”）：每个小案例选一个概念，逐条判对错
    if (unit.transfer && !noTransfer) {
      const bins = unit.transfer.names.map((name, j) => ({ value: j, label: `概念 ${j + 1} ${name}` }));
      unit.transfer.labels.forEach((t, i) => option('transfer', `transfer.${i}`, '迁移任务', `小案例 ${i + 1}`, bins, ((S.transfer || {}).sel || [])[i], unit.transfer.answers[i], t));
    }
    if (!unit.debate || legacy) {
      const discussion = S.discussion || {};
      option('discussion', 'discussion.stance', '小组辨析', '我的立场', unit.discussion.stances.map((x) => ({ value: x, label: x })),
        discussion.stance, null, unit.discussion.question);
      text('discussion', 'discussion.reason', '小组辨析', '我的理由', texts['discussion.reason'], '我的理由（至少用到一个概念）');
      text('discussion', 'discussion.after', '小组辨析', '讨论后的修改或补充', texts['discussion.after'], '讨论后，我修改或补充的想法');
    } else {
      // 辩论赛（2026-10-29 起）：辩前票、论据卡、辩后票，只计参与（不判对错）
      const db = S.debate || {};
      const sides = [{ value: 'pro', label: `正方：${unit.debate.pro}` }, { value: 'con', label: `反方：${unit.debate.con}` }];
      option('discussion', 'debate.pre', '辩论赛', '辩前投票', sides, db.pre, null, unit.debate.motion);
      const picked = String(db.cards || '').split(',').filter((v) => unit.debate.cards[Number(v) - 1]);
      items.push({ section: 'discussion', key: 'debate.cards', step: '辩论赛', label: '论据卡', prompt: '选 2 张最能支持本方的论据卡', type: 'option',
        value: picked.length ? picked.join(',') : null, shown: picked.map((v) => `${LET(Number(v) - 1)}. ${short(unit.debate.cards[Number(v) - 1], 30)}`).join('；'),
        ref: null, refShown: '', correct: null });
      option('discussion', 'debate.post', '辩论赛', '辩后投票', sides, db.post, null, unit.debate.motion);
    }
    const exit = S.exit || {};
    unit.exit.forEach((q, i) => option('exit', `exit.${i}`, '出门测', `出门测 ${i + 1}`, lettered(q.options), (exit.answers || [])[i], q.answer, q.prompt));
    if (unit.poll) {
      option('poll', 'poll', '课堂投票', '课堂投票', unit.poll.options.map((o) => ({ value: o.value, label: o.label })), (S.poll || {}).choice, null, '课堂投票');
    }
    // 课后思考 2026-10-28 起不在案例页（改为期中考查作业）：只显示以前已经递交的
    if (unit.essay && (!unit.essay.legacy || filled(texts.essay))) text('essay', 'essay', '课后思考', `申论式大题（${unit.essay.type}题）`, texts.essay, unit.essay.question);
    const exitItems = items.filter((item) => item.section === 'exit');
    const auto = items.filter((item) => item.ref != null);
    return {
      items,
      exitSubmitted: exitItems.length > 0 && exitItems.every((item) => item.value != null),
      exitRight: exitItems.filter((item) => item.correct).length,
      exitAnswered: exitItems.filter((item) => item.value != null).length,
      exitTotal: exitItems.length,
      autoRight: auto.filter((item) => item.correct).length,
      autoAnswered: auto.filter((item) => item.value != null).length,
      autoTotal: auto.length,
    };
  }

  // 递交记录 {题目编号: {v, at}} → 与页面作答记录相同的结构，交给 gradeHomework；旧格式（整页快照）原样使用
  function stateOf(unit, payload) {
    const P = payload && typeof payload === 'object' ? payload : {};
    const entries = Object.entries(P).filter(([, entry]) => isEntry(entry));
    if (!entries.length) return { S: P, at: {} };
    if (unit.plain) {   // 《金融机构与市场》：题号就是作答项的编号，原样带过去
      const x = {};
      const when = {};
      entries.forEach(([key, entry]) => { x[key] = entry.v; when[key] = entry.at; });
      return { S: { x }, at: when };
    }
    const S = { texts: {}, exit: { answers: [] } };
    const at = {};
    entries.forEach(([key, entry]) => {
      const value = entry.v;
      at[key] = entry.at;
      let match = key.match(/^(k\d+)\.(discover|check|apply|challenge|explain)$/);
      if (match) {
        const box = S[match[1]] || (S[match[1]] = {});
        const concept = unit.concepts.find((k) => k.id === match[1]);
        if (match[2] === 'discover') box.discover = { choice: value };
        else if (match[2] === 'check') box.check = Array.isArray(value) ? { sel: value } : { choice: value };
        else if (match[2] === 'apply') box.apply = concept && concept.apply.type === 'sort' ? { sel: value } : { vals: value };
        else if (match[2] === 'challenge') box.challenge = { val: value };
        else S.texts[key] = value;
        return;
      }
      if (key === 'transfer') { S.transfer = { sel: Array.isArray(value) ? value : [] }; return; }
      match = key.match(/^debate\.(pre|cards|post)$/);
      if (match) { (S.debate || (S.debate = {}))[match[1]] = value; return; }
      match = key.match(/^exit\.(\d+)$/);
      if (match) S.exit.answers[Number(match[1])] = value;
      else if (key === 'chain') S.chain = { order: value, submitted: true };
      else if (key === 'discussion') { S.discussion = { stance: value && value.stance }; S.texts['discussion.reason'] = value && value.reason; }
      else if (key === 'discussion.after') S.texts['discussion.after'] = value;
      else if (key === 'poll') S.poll = { choice: value };
      else if (key === 'essay') S.texts.essay = value;
      else if (key === 'exam') S.texts.exam = value;
    });
    return { S, at };
  }
  // 逐题记录的编号 → 递交时的题目编号（辨一辨、分一分等一组小题一起递交）
  const submitKey = (itemKey) => itemKey
    .replace(/^(k\d+\.(check|apply))\.\d+$/, '$1')
    .replace(/^chain\.\d+$/, 'chain')
    .replace(/^transfer\.\d+$/, 'transfer')
    .replace(/^discussion\.(stance|reason)$/, 'discussion');
  // 政经辩论赛上线之前的作业按小组辨析算：递交过小组辨析，或者没有辩论赛题、且最早的递交在 10 月 30 日之前
  const DEBATE_SINCE = Date.parse('2026-10-30T00:00:00+08:00');
  const legacyDiscussion = (S, at) => {
    const keys = Object.keys(at);
    return Boolean(S.discussion) || keys.some((key) => /^discussion/.test(key))
      || (!keys.some((key) => /^debate\./.test(key)) && keys.some((key) => millis(at[key]) && millis(at[key]) < DEBATE_SINCE));
  };
  // 迁移任务上线（2026-10-30）之前的作业：没有递交迁移任务、而且最早的递交在 10 月 31 日之前，就不列迁移任务（以前课堂的完成率和修为不变）
  const TRANSFER_SINCE = Date.parse('2026-10-31T00:00:00+08:00');
  const oldTransfer = (at) => {
    const keys = Object.keys(at);
    return !keys.includes('transfer') && keys.some((key) => millis(at[key]) && millis(at[key]) < TRANSFER_SINCE);
  };
  const gradeOf = (unit, payload) => {
    const { S, at } = stateOf(unit, payload);
    const result = gradeHomework(unit, S, legacyDiscussion(S, at), oldTransfer(at));
    result.items.forEach((item) => { item.at = at[submitKey(item.key)] || ''; });
    return result;
  };
  const gradeCache = new Map();
  const peUnit = () => (state.room ? unitMap.get(state.room.chapter) : null);
  function gradedRows() {
    const unit = peUnit();
    if (!unit) return [];
    return homeworkRows().map((doc) => {
      const key = `${unit.unit}|${doc.id}|${doc.sid}|${doc.updated_at || doc.ts}`;
      if (!gradeCache.has(key)) gradeCache.set(key, gradeOf(unit, doc.payload));
      return { doc, ...gradeCache.get(key) };
    });
  }

  function setupConcept() {
    const unit = peUnit();
    const select = $('[data-pe-section]');
    const wanted = select.value || store.get('pe-section');
    const sections = unit ? unitSections(unit) : [];
    select.innerHTML = sections.map((section) => `<option value="${section.id}">${esc(section.label)}</option>`).join('');
    if (sections.some((section) => section.id === wanted)) select.value = wanted;
  }
  $('[data-pe-section]').addEventListener('change', (event) => { store.set('pe-section', event.target.value); renderConceptStats(); });
  $('[data-pe-reference]').addEventListener('change', () => { renderConceptStats(); renderConceptStudents(); });
  $('[data-pe-search]').addEventListener('input', renderConceptStudents);
  // 定时刷新会重绘页面：记住展开的文字题
  $('[data-pe-view]').addEventListener('toggle', (event) => {
    const box = event.target.closest('[data-pe-text]');
    if (!box) return;
    if (box.open) state.openTexts.add(box.dataset.peText); else state.openTexts.delete(box.dataset.peText);
  }, true);

  const rateText = (right, answered) => (answered ? `正确率 ${pct(right, answered)}%` : '正确率 —');
  // 整题统计：由几道小题组成、一起递交的题（辨一辨判断、用一用、概念串联）。全部小题都作答才算“作答”，全部做对才算“整题全对”
  const GROUP_LABEL = { '辨一辨': '辨一辨（整题全对）', '用一用': '用一用（整题全对）', '概念串联': '概念串联（全部排对）', '迁移任务': '迁移任务（全部选对）' };
  function groupStats(templates, rows) {
    const groups = new Map();
    templates.filter((item) => item.ref != null && item.type !== 'text').forEach((item) => {
      const key = submitKey(item.key);   // 挑战题（变一变）单独递交、可选，不并入用一用整题
      if (!/\.(check|apply)$|^(chain|transfer)$/.test(key)) return;
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });
    return Array.from(groups.entries()).filter(([, list]) => list.length > 1).map(([key, list]) => {
      const keys = new Set(list.map((item) => item.key));
      let answered = 0;
      let right = 0;
      rows.forEach((row) => {
        const mine = row.items.filter((item) => keys.has(item.key));
        if (mine.length !== keys.size || mine.some((item) => item.value == null)) return;
        answered += 1;
        if (mine.every((item) => item.correct)) right += 1;
      });
      const first = list[0];
      return { key, section: first.section, step: first.step, firstKey: first.key, lastKey: list[list.length - 1].key,
        label: GROUP_LABEL[first.step] || `${first.step}（整题）`, parts: list.length, answered, right };
    });
  }
  const groupLine = (group, rowsCount) => `<p class="tw-hint tw-group-rate"><b>${esc(group.label)}</b>：${group.parts} 个小题全部作答 ${group.answered} 人${rowsCount != null ? ` / 已递交 ${rowsCount} 人` : ''}，全对 ${group.right} 人 · ${rateText(group.right, group.answered)}</p>`;
  function itemCard(template, entries, showRef) {
    const answered = entries.filter((entry) => entry.item.value != null);
    const right = answered.filter((entry) => entry.item.correct).length;
    const graded = template.ref != null && template.type !== 'text';
    const head = `<h3>${esc(template.label)} <small>作答 ${answered.length} 人${showRef && graded ? ` · ${rateText(right, answered.length)}` : ''}</small></h3>
      ${template.prompt ? `<p class="tw-q">${esc(template.prompt)}</p>` : ''}`;
    if (template.type === 'option') {
      return `<div class="tw-round">${head}${template.options.map((option) => {
        const count = answered.filter((entry) => String(entry.item.value) === String(option.value)).length;
        const star = showRef && template.ref != null && String(template.ref) === String(option.value) ? '<b class="ref" title="参考答案">★</b>' : '';
        return `<div class="tw-option single"><div class="tw-option-label">${star}${esc(option.label)}</div>${bar(count, answered.length)}</div>`;
      }).join('')}</div>`;
    }
    if (template.type === 'value') {
      const counts = new Map();
      answered.forEach((entry) => counts.set(entry.item.value, (counts.get(entry.item.value) || 0) + 1));
      const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return `<div class="tw-round">${head}
        ${showRef ? `<p class="tw-hint">参考答案：<b>${esc(template.refShown)}</b></p>` : ''}
        <div class="tw-values">${top.map(([value, count]) => {
          const ok = answered.find((entry) => entry.item.value === value).item.correct;
          return `<span class="${showRef ? (ok ? 'is-ok' : 'is-bad') : ''}">${esc(value)}<em>${count} 人</em></span>`;
        }).join('') || '<span class="empty">还没有人作答</span>'}</div></div>`;
    }
    if (template.type === 'order') {
      return `<div class="tw-option single"><div class="tw-option-label"><span>${esc(template.label)}</span>${showRef ? esc(template.prompt) : ''}</div>
        ${showRef ? bar(right, answered.length) : `<em>已排序 ${answered.length} 人</em>`}</div>`;
    }
    // 文字题：列出每位学生的作答
    const open = state.openTexts.has(template.key) ? ' open' : '';
    return `<div class="tw-round">${head}<details class="tw-texts" data-pe-text="${esc(template.key)}"${open}><summary>查看 ${answered.length} 人的作答</summary>
      ${answered.sort((a, b) => String(a.row.doc.sid).localeCompare(String(b.row.doc.sid))).map((entry) => `
        <article class="tw-answer"><header><strong>${esc(entry.row.doc.name)}</strong><span>${esc(entry.row.doc.sid)}</span><time>${clock(entry.row.doc.ts)}</time></header><p>${esc(entry.item.value)}</p></article>`).join('')
        || '<p class="empty">还没有学生写这道题。</p>'}</details></div>`;
  }

  function renderConceptStats() {
    if (!CONCEPT) return;
    const unit = peUnit();
    const view = $('[data-pe-view]');
    const summary = $('[data-pe-summary]');
    if (!unit) { view.innerHTML = '<p class="empty">请先选择课堂。</p>'; summary.textContent = ''; return; }
    const showRef = $('[data-pe-reference]').checked;
    const rows = gradedRows();
    const submitted = rows.filter((row) => row.doc.submitted).length;
    const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + (row.doc.total ? row.doc.progress / row.doc.total : 0), 0) / rows.length * 100) : 0;
    const exitDone = rows.filter((row) => row.exitSubmitted);
    const exitAverage = exitDone.length ? (exitDone.reduce((sum, row) => sum + row.exitRight, 0) / exitDone.length).toFixed(1) : '—';
    summary.textContent = unit.exam
      ? `${chapterLabel(state.room)}：已有 ${rows.length} 人递交。只算第一次递交，约每 5 秒刷新；在“学生作答”里可以导出全部作答批阅（满分 100）。`
      : unit.plain && !(unit.extra || []).length ? `${chapterLabel(state.room)}没有要递交的题目：同学们选了哪一款、经营到第几个月、总评多少，在“课堂网页 → 期中经营模拟成绩”里看。`
      : unit.plain ? `${chapterLabel(state.room)}：已有 ${rows.length} 人递交（${submitted} 人全部递交），平均递交 ${average}% 的题目。每题只算第一次递交，约每 5 秒刷新。`
      : `${chapterLabel(state.room)}：已有 ${rows.length} 人递交（${submitted} 人全部递交），平均递交 ${average}% 的题目；`
      + `出门测 ${exitDone.length} 人递交了全部 ${unit.exit.length} 题${showRef ? `，平均答对 ${exitAverage} 题` : ''}。每题只算第一次递交，约每 5 秒刷新。`;
    const entries = new Map();
    rows.forEach((row) => row.items.forEach((item) => {
      const list = entries.get(item.key) || [];
      list.push({ row, item });
      entries.set(item.key, list);
    }));
    const templates = gradeHomework(unit, {}).items;
    const section = $('[data-pe-section]').value || (unit.exam ? 'exam' : 'overview');
    if (section === 'overview') {
      const graded = templates.filter((item) => item.ref != null);
      const groups = groupStats(templates, rows);
      const stats = [];
      graded.forEach((item) => {
        const answered = (entries.get(item.key) || []).filter((entry) => entry.item.value != null);
        stats.push({ item, answered: answered.length, right: answered.filter((entry) => entry.item.correct).length });
        groups.filter((group) => group.lastKey === item.key).forEach((group) => stats.push({
          item: { section: group.section, label: group.label, prompt: `${group.parts} 个小题全部做对`, key: group.key }, answered: group.answered, right: group.right, group: true }));
      });
      const names = new Map(unitSections(unit).map((s) => [s.id, s.label]));
      const weakest = stats.filter((stat) => !stat.group && stat.answered >= 3).sort((a, b) => a.right / a.answered - b.right / b.answered).slice(0, 5);
      // 2026-11-22 第三档美化：题目表按部分分组——每部分前一行组名（和题数），不再每行重复“概念 1 · 绝对剩余价值”
      const partCount = new Map();
      stats.forEach((stat) => { if (!stat.group) partCount.set(stat.item.section, (partCount.get(stat.item.section) || 0) + 1); });
      let lastPart = null;
      const tableRows = stats.map((stat) => {
        const head = stat.item.section !== lastPart
          ? `<tr class="tw-part-row"><th colspan="${showRef ? 3 : 2}" scope="colgroup">${esc(names.get(stat.item.section))}<small>${partCount.get(stat.item.section) || 0} 题</small></th></tr>` : '';
        lastPart = stat.item.section;
        return `${head}<tr class="${stat.group ? 'tw-group-row' : ''}"><td>${esc(stat.item.label)}<small class="tw-sub">${esc(short(stat.item.prompt, 46))}</small></td>
          <td>${stat.answered} / ${rows.length}</td>${showRef ? `<td>${bar(stat.right, stat.answered)}</td>` : ''}</tr>`;
      }).join('');
      view.innerHTML = `${showRef && weakest.length ? `<article class="tw-card wide"><h2>最值得讲评 <small>作答 3 人以上、正确率最低的 ${weakest.length} 题</small></h2>
          ${weakest.map((stat) => `<div class="tw-option single"><div class="tw-option-label"><span>${esc(names.get(stat.item.section))}</span>${esc(stat.item.label)}：${esc(short(stat.item.prompt, 40))}</div>${bar(stat.right, stat.answered)}</div>`).join('')}</article>` : ''}
        <table class="tw-table tw-pe-overview"><thead><tr><th>题目</th><th>作答人数</th>${showRef ? '<th>正确率</th>' : ''}</tr></thead><tbody>${tableRows}</tbody></table>`;
      return;
    }
    const chosen = templates.filter((item) => item.section === section);
    const sectionGroups = showRef ? groupStats(templates, rows).filter((group) => group.section === section) : [];
    let extra = '';
    if (section === 'chain') {
      const done = rows.filter((row) => row.items.some((item) => item.section === 'chain' && item.value != null));
      const perfect = done.filter((row) => row.items.filter((item) => item.section === 'chain').every((item) => item.correct)).length;
      extra = `<p class="tw-hint">已递交 ${done.length} 人${showRef ? `；全部排对 ${perfect} 人 · ${rateText(perfect, done.length)}。下面按正确顺序列出每个位置，条形为该位置放对的人数和比例` : ''}。</p>`;
    }
    if (section === 'transfer') {
      const done = rows.filter((row) => row.items.some((item) => item.section === 'transfer' && item.value != null));
      const perfect = done.filter((row) => row.items.filter((item) => item.section === 'transfer').every((item) => item.correct)).length;
      extra = `<p class="tw-hint">已递交 ${done.length} 人${showRef ? `；全部选对 ${perfect} 人 · ${rateText(perfect, done.length)}。下面逐个小案例列出各概念的人数，★ 是参考答案` : ''}。</p>`;
    }
    if (section === 'exit') {
      extra = `<p class="tw-hint">${rows.filter((row) => row.exitSubmitted).length} 人递交了全部 ${unit.exit.length} 题；各题按已递交的人数统计。</p>`;
    }
    const label = (unitSections(unit).find((s) => s.id === section) || {}).label || '';
    let html = '';
    let lastStep = '';
    chosen.forEach((item) => {
      // 只有概念部分分“想一想、辨一辨、用一用、说一说”小标题
      if (item.step !== lastStep && unit.concepts.some((k) => k.id === section)) {
        html += `<h2 class="tw-step">${esc(item.step)}</h2>`;
        sectionGroups.filter((group) => group.step === item.step).forEach((group) => { html += groupLine(group, rows.length); });
        lastStep = item.step;
      }
      html += itemCard(item, entries.get(item.key) || [], showRef);
    });
    view.innerHTML = `<article class="tw-card wide"><h2>${esc(label)} <small>${rows.length} 人已递交</small></h2>${extra}${html}</article>`;
  }

  // 学生作答：本人有几道“整题”全部做对（辨一辨判断、用一用、概念串联）
  function wholeText(unit, row) {
    const groups = groupStats(gradeHomework(unit, {}).items, [row]);
    const done = groups.filter((group) => group.answered);
    return done.length ? `；整题全对 ${groups.filter((group) => group.right).length}/${done.length}` : '';
  }
  const wordsOf = (value) => String(value || '').replace(/\s/g, '').length;
  function renderConceptStudents() {
    if (!CONCEPT) return;
    const unit = peUnit();
    const body = $('[data-pe-rows]');
    $('[data-exam-export]').hidden = !(unit && unit.exam);
    $('[data-pe-exit-head]').textContent = unit && unit.exam ? '字数' : unit && unit.plain ? '客观题' : '出门测';
    $('[data-pe-done-head]').textContent = unit && unit.exam ? '期中作业' : '已递交';
    if (!unit) { body.innerHTML = ''; return; }
    const rows = new Map(gradedRows().map((row) => [row.doc.sid, row]));
    const people = new Map();
    students().forEach((person) => people.set(person.sid, { sid: person.sid, name: Array.from(person.names)[0], class_name: person.class_name, group_name: person.group_name }));
    rows.forEach((row, sid) => people.set(sid, { sid, name: row.doc.name, class_name: row.doc.class_name || '', group_name: row.doc.group_name || '' }));
    const query = $('[data-pe-search]').value.trim();
    const list = Array.from(people.values())
      .filter((person) => !query || [person.sid, person.name, person.class_name, person.group_name].some((value) => String(value || '').includes(query)))
      .sort((a, b) => String(a.sid).localeCompare(String(b.sid)));
    const names = new Map(unitSections(unit).map((s) => [s.id, s.label]));
    // 2026-11-22 第三档美化：整列都空着的“班级”“小组”自动隐藏（有人填了就显示）
    const table = body.closest('table');
    table.classList.toggle('tw-hide-class', list.length > 0 && list.every((person) => !person.class_name));
    table.classList.toggle('tw-hide-group', list.length > 0 && list.every((person) => !person.group_name));
    body.innerHTML = list.map((person) => {
      const row = rows.get(person.sid);
      const open = state.openStudents.has(person.sid);
      if (!row) {
        return `<tr><td>${esc(person.sid)}</td><td>${esc(person.name)}</td><td class="tw-c-class">${esc(person.class_name)}</td><td class="tw-c-group">${esc(person.group_name)}</td>
          <td colspan="4">${statusTag('已加入，还没有递交')}</td></tr>`;
      }
      const doc = row.doc;
      // 2026-11-22：出门测、全部递交改成小标签——递交了是绿色，只做了一部分是黄色，还没做的是灰色（原来一屏红字“未递交”“否”，像出了错）
      const exit = unit.plain ? (row.autoAnswered ? `答对 ${row.autoRight}/${row.autoAnswered}` : statusTag('还没做'))
        : row.exitAnswered ? statusTag(`已递交 ${row.exitAnswered}/${row.exitTotal}`, row.exitSubmitted ? 'ok' : 'warn') + whenSmall(`答对 ${row.exitRight}`) : statusTag('未递交');
      const essay = unit.exam ? (row.items.find((item) => item.key === 'exam') || {}).value : null;
      const main = `<tr class="tw-pe-row${open ? ' is-open' : ''}" data-pe-sid="${esc(person.sid)}" tabindex="0" aria-expanded="${open}">
        <td>${open ? '▾' : '▸'} ${esc(doc.sid)}</td><td>${esc(doc.name)}</td><td class="tw-c-class">${esc(doc.class_name || '')}</td><td class="tw-c-group">${esc(doc.group_name || '')}</td>
        ${unit.exam ? `<td>${essay ? statusTag('已递交', 'ok') : statusTag('未递交')}</td><td>${essay ? `${wordsOf(essay)} 字` : ''}</td>`
          : `<td>${progLine(`${doc.progress}/${doc.total} 题`, doc.progress, doc.total)}<small class="tw-sub">自动判分小题答对 ${row.autoRight}/${row.autoTotal}${wholeText(unit, row)}</small></td>
        <td class="tw-nowrap">${exit}</td>`}
        <td class="tw-nowrap">${doc.submitted ? statusTag('是', 'ok') + whenSmall(clock(millis(doc.submitted_at))) : statusTag('否')}</td><td>${clock(doc.ts)}</td></tr>`;
      if (!open) return main;
      let detail = '';
      let lastSection = '';
      row.items.forEach((item) => {
        if (item.section !== lastSection) { detail += `${lastSection ? '</ul>' : ''}<h4>${esc(names.get(item.section))}</h4><ul class="tw-marks">`; lastSection = item.section; }
        const cls = item.value == null ? 'is-none' : item.correct === true ? 'is-ok' : item.correct === false ? 'is-bad' : '';
        const mark = item.value == null ? '—' : item.correct === true ? '✓' : item.correct === false ? '✗' : '';
        const answer = item.value == null ? '未递交' : item.type === 'text' ? `<span class="tw-text">${esc(item.shown)}</span>` : esc(item.shown);
        const ref = item.correct === false ? `<small>参考：${esc(item.refShown)}</small>` : '';
        // 一组小题一起递交的，只在第一小题后注明递交时间
        const firstOfGroup = item.key === submitKey(item.key) || /\.0$/.test(item.key) || item.key === 'discussion.stance';
        const when = item.at && firstOfGroup ? `<small class="tw-at">${clock(millis(item.at))} 递交</small>` : '';
        detail += `<li class="${cls}${item.type === 'text' ? ' is-text' : ''}"><b>${mark}</b><span class="tw-mark-label" title="${esc(item.prompt || '')}">${esc(item.label)}</span><span>${answer}${ref}${when}</span></li>`;
      });
      detail += '</ul>';
      return `${main}<tr class="tw-pe-detail"><td colspan="8">${detail}</td></tr>`;
    }).join('') || '<tr><td colspan="8" class="empty">还没有学生加入这个课堂。</td></tr>';
  }
  const toggleStudent = (event) => {
    const row = event.target.closest('tr[data-pe-sid]');
    if (!row || (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ')) return;
    if (event.type === 'keydown') event.preventDefault();
    const sid = row.dataset.peSid;
    if (state.openStudents.has(sid)) state.openStudents.delete(sid); else state.openStudents.add(sid);
    renderConceptStudents();
  };
  $('[data-pe-rows]').addEventListener('click', toggleStudent);
  // 期中考查作业：导出全部作答批阅（CSV，Excel 可打开；得分、评语两列留空给老师填，满分 100）
  $('[data-exam-export]').addEventListener('click', () => {
    const unit = peUnit();
    if (!unit || !unit.exam) return;
    const rows = gradedRows().map((row) => ({ row, value: (row.items.find((item) => item.key === 'exam') || {}).value }))
      .filter((entry) => entry.value).sort((a, b) => String(a.row.doc.sid).localeCompare(String(b.row.doc.sid)));
    const at = (row) => { const when = millis(((row.doc.payload || {}).exam || {}).at) || row.doc.ts; return when ? `${isoDay(when)} ${clock(when)}` : ''; };
    download(`${course.title}_${safeName(state.klass.name)}_期中考查作业_${safeName(unit.exam.case)}_${window.ClassLive.today()}.csv`,
      csv([['序号', '学号', '姓名', '班级', '递交时间', '字数', `题目：${unit.exam.title}`, '得分（满分 100）', '评语'],
        ...rows.map((entry, i) => [i + 1, entry.row.doc.sid, entry.row.doc.name, entry.row.doc.class_name || '', at(entry.row), wordsOf(entry.value), entry.value, '', ''])]));
  });
  $('[data-pe-rows]').addEventListener('keydown', toggleStudent);

  // ---------------- 弹幕 ----------------
  const DANMAKU_HINT = {
    off: '弹幕已关闭：学生暂时不能发送。在上方“弹幕”处选择“直接上屏”或“审核后上屏”即可开启。',
    direct: '直接上屏：学生发送后立即在投屏的课堂页面滚动显示（“姓名：内容”，勾选“匿名”后只显示内容）；可随时点“隐藏”撤下。',
    review: '审核后上屏：学生发送后先出现在这里，点“上屏”才会在投屏页面显示（“姓名：内容”，勾选“匿名”后只显示内容）。',
  };
  const STATUS_TEXT = { new: '待上屏', shown: '已上屏', hidden: '已隐藏' };
  // 导出记录用审核状态表述（直接上屏模式下未审核的弹幕也会上屏）
  const RECORD_STATUS = { new: '未审核', shown: '已通过审核', hidden: '已隐藏' };
  // 学生在学生版撤回的弹幕：投屏不再显示，记录保留
  const recordStatus = (d) => (d.withdrawn_at ? '学生已撤回' : RECORD_STATUS[d.status] || d.status);
  // 发送人的班级、小组取自本课堂的加入记录
  const whoMap = () => {
    const map = new Map();
    state.docs.checkins.forEach((doc) => map.set(doc.sid, doc));
    return map;
  };
  // 表情包（2026-11-21，live-stickers.js）：弹幕记录里把表情记号画成小图；查找、删除确认、导出表格里写成“[表情·悟了]”
  const dmHtml = (text) => (window.ClassLive.stickers ? window.ClassLive.stickers.html(text, 34, 'tw-stk') : esc(text));
  const dmPlain = (text) => (window.ClassLive.stickers ? window.ClassLive.stickers.plain(text) : String(text == null ? '' : text));
  $('[data-dm-date]').addEventListener('change', renderDanmaku);
  $('[data-dm-search]').addEventListener('input', renderDanmaku);
  function renderDanmaku() {
    const room = state.room;
    if (!room) return;
    const mode = room.danmaku || 'off';
    $('[data-danmaku-hint]').textContent = room.is_current
      ? DANMAKU_HINT[mode] + (room.danmaku_anon ? '　已开启匿名：投屏只显示内容、不显示姓名；下表和导出记录里仍能看到是谁发的。' : '')
      : '历史课堂：弹幕记录只供查看和导出。';
    const all = state.docs.danmaku.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0) || Number(b.id) - Number(a.id));
    // 日期选项：本课堂出现过的每一天（每节课）
    const dateSelect = $('[data-dm-date]');
    const dates = Array.from(new Set(all.map((doc) => isoDay(doc.ts)))).filter(Boolean).sort().reverse();
    const chosen = dates.includes(dateSelect.value) ? dateSelect.value : '';
    dateSelect.innerHTML = '<option value="">全部日期</option>' + dates.map((date) =>
      `<option value="${date}">${date}（${all.filter((doc) => isoDay(doc.ts) === date).length} 条）</option>`).join('');
    dateSelect.value = chosen;
    const who = whoMap();
    const query = $('[data-dm-search]').value.trim();
    const rows = all.filter((doc) => !chosen || isoDay(doc.ts) === chosen).filter((doc) => {
      if (!query) return true;
      const info = who.get(doc.sid) || {};
      return [doc.name, doc.sid, doc.text, dmPlain(doc.text), info.class_name, info.group_name].some((value) => String(value || '').includes(query));
    });
    const senders = new Set(rows.map((doc) => doc.sid)).size;
    $('[data-dm-summary]').textContent = `${chosen || '全部日期'}：共 ${rows.length} 条，发送人 ${senders} 人。`;
    // 2026-11-22 第三档美化：整列都空着的“班级”“小组”自动隐藏
    const dmTable = $('[data-danmaku-list]').closest('table');
    dmTable.classList.toggle('tw-hide-class', rows.length > 0 && rows.every((doc) => !(who.get(doc.sid) || {}).class_name));
    dmTable.classList.toggle('tw-hide-group', rows.length > 0 && rows.every((doc) => !(who.get(doc.sid) || {}).group_name));
    $('[data-danmaku-list]').innerHTML = rows.map((doc) => {
      const info = who.get(doc.sid) || {};
      const withdrawn = Boolean(doc.withdrawn_at);
      const status = withdrawn ? '学生已撤回' : mode === 'direct' && doc.status === 'new' ? '已上屏' : STATUS_TEXT[doc.status] || doc.status;
      const canShow = !withdrawn && doc.status !== 'shown' && !(mode === 'direct' && doc.status === 'new');
      const shownClass = withdrawn ? 'hidden' : mode === 'direct' && doc.status === 'new' ? 'shown' : doc.status;
      return `<tr class="tw-dm is-${esc(shownClass)}"><td>${esc(isoDay(doc.ts))}</td><td>${clock(doc.ts)}</td><td>${esc(doc.name)}</td><td>${esc(doc.sid)}</td>
        <td class="tw-c-class">${esc(info.class_name || '')}</td><td class="tw-c-group">${esc(info.group_name || '')}</td><td class="tw-dm-text">${doc.liked_at ? '<b class="tw-dm-liked" title="老师点赞">👍</b> ' : ''}${doc.gift ? `法宝 ${esc(((window.ClassLive.GIFTS || []).find((gift) => gift.id === doc.gift) || {}).icon || '')} ` : ''}${dmHtml(doc.text)}</td><td><em>${esc(status)}</em></td>
        <td class="tw-dm-actions">${canShow ? `<button type="button" data-dm="${esc(doc.id)}" data-dm-status="shown">上屏</button>` : ''}${!withdrawn && doc.status !== 'hidden' ? `<button type="button" data-dm="${esc(doc.id)}" data-dm-status="hidden">隐藏</button>` : ''}<button type="button" class="tw-trash" data-dm-delete="${esc(doc.id)}" title="删除这条弹幕" aria-label="删除 ${esc(doc.name)} 的弹幕">${TRASH_ICON}</button></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">没有弹幕记录。</td></tr>';
  }
  $('[data-danmaku-list]').addEventListener('click', async (event) => {
    // 删除一条弹幕：从记录里彻底删除，投屏页也随即撤下（与“隐藏”不同，隐藏的弹幕仍留在记录里）
    const trash = event.target.closest('[data-dm-delete]');
    if (trash) {
      const id = trash.dataset.dmDelete;
      const doc = state.docs.danmaku.find((item) => String(item.id) === id);
      const preview = doc ? `${doc.name}：${dmPlain(doc.text).slice(0, 30)}` : '';
      if (!window.confirm(`确定删除这条弹幕吗？\n\n${preview}\n\n删除后无法恢复，弹幕记录和导出里都不再有它，投屏上也会撤下。这条弹幕已经结算过修为的，会撤回相应修为；学生页面会弹窗提醒。\n\n只想不上屏可以点“隐藏”（不提醒，下次结算时不算）。`)) return;
      trash.disabled = true;
      const note = $('[data-dm-note]');
      note.textContent = '';
      try {
        // 2026-11-06 用户：“学生发的一些无效弹幕，教师删除后撤回该学生相应的修为值，并在其客户端做相应的提醒。”后台 ck_delete_danmaku 算出撤回多少并记下提醒
        const unit = realmUnits().find((item) => state.room && item.id === state.room.chapter);
        let result = null;
        try {
          result = await backend.rpc('ck_delete_danmaku', { p_id: Number(id) || id, p_meetings: (unit && unit.meetings) || 1 });
        } catch (error) {
          if (!missingFunction(error)) throw error;
          await backend.removeAll('danmaku', { id: Number(id) || id });   // 后台还没有执行 20261106 的 SQL：只删除
        }
        state.docs.danmaku = state.docs.danmaku.filter((item) => String(item.id) !== id);
        renderDanmaku();
        renderStats();
        const who = (doc && doc.name) || '这位同学';
        const points = Number(result && result.points) || 0;
        if (points > 0) realmResult = null;   // “修为境界”标签下次打开时重新计算
        note.textContent = !result ? '已删除。后台还没有更新，没有撤回修为、也不会提醒学生：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261106-删弹幕撤修为.sql。'
          : result.status === 'gone' ? '这条弹幕已经不在了。'
          : !result.notified ? '已删除。'
          : points > 0 ? `已删除${who}的这条弹幕，撤回 ${points} 修为（境界、修为榜、宗门分同步更新），学生页面会弹窗提醒。`
          : `已删除${who}的这条弹幕。它没有计入修为（不足 4 个有效字、重复的句子、超过每次课上限或结算后才发），不用撤回；学生页面会弹窗提醒。`;
      } catch (error) {
        console.error(error);
        trash.disabled = false;
        actionStatus(`删除弹幕失败：${error.message || error}`);
      }
      return;
    }
    const button = event.target.closest('[data-dm]');
    if (!button) return;
    button.disabled = true;
    try {
      await backend.rpc('ck_danmaku_status', { p_id: Number(button.dataset.dm) || button.dataset.dm, p_status: button.dataset.dmStatus });
      const doc = state.docs.danmaku.find((item) => String(item.id) === button.dataset.dm);
      if (doc) doc.status = button.dataset.dmStatus;
      renderDanmaku();
    } catch (error) {
      console.error(error);
      button.disabled = false;
      actionStatus(`弹幕操作失败：${error.message || error}`);
    }
  });

  // ---------------- 课堂网页 ----------------
  // 2026-11-22 第二档美化：左边编号徽章（配色跟着课程走）；本班发布过课堂的标“上过”和最近一次的日期，有开放中的标绿点，
  // 现在选中的课堂那一张加边框、标“当前课堂”；教师工具、复习资料用图标徽章
  function renderPages() {
    const tone = pickOf(course).tone;
    const toneAttr = tone ? ` data-tone="${esc(tone)}"` : '';
    const classQuery = state.klass ? `?class=${encodeURIComponent(state.klass.id)}` : '';
    const numberOf = (chapter) => {
      const digits = String(chapter.cn || '').match(/\d+/);
      const n = digits ? Number(digits[0]) : chapterNo(chapter.cn || '');
      return n == null || Number.isNaN(n) ? '' : String(n).padStart(2, '0');
    };
    const stateOf = (chapter) => {
      const rooms = (state.rooms || []).filter((room) => room.chapter === chapter.id);
      if (!rooms.length) return null;
      if (state.room && rooms.some((room) => String(room.id) === String(state.room.id))) return { cls: 'is-current', text: '当前课堂' };
      if (rooms.some((room) => room.is_current)) return { cls: 'is-live', text: '开放中' };
      const last = rooms.map((room) => isoDay(millis(room.created_at))).filter(Boolean).sort().pop();
      return { cls: 'is-done', text: `上过${last ? ` · ${last.slice(5)}` : ''}` };
    };
    const card = ({ href, cls = '', badge, label, status, title, sub }) => `<a class="tw-page${cls}"${toneAttr} href="${href}" target="_blank" rel="noopener">
      <span class="tw-page-no" aria-hidden="true">${badge}</span>
      <span class="tw-page-body"><small>${esc(label)}${status ? `<em class="tw-page-state"><i aria-hidden="true"></i>${esc(status.text)}</em>` : ''}</small><strong>${esc(title)}</strong><span>${sub}</span></span></a>`;
    $('[data-pages]').innerHTML = course.chapters.map((chapter) => {
      const status = stateOf(chapter);
      return card({ href: `/${chapter.file}${classQuery}`, cls: status ? ` ${status.cls}` : '', badge: esc(numberOf(chapter)), label: chapter.cn, status, title: chapter.title,
        sub: PLAIN ? esc(chapter.chapter) : CONCEPT ? `教材：${esc(chapter.chapter)}` : chapter.cases.map((item) => `案例${item.number} ${esc(item.title)}`).join('<br>') });
    }).join('')
      // 教师工具页（《金融机构与市场》：课堂模拟控制台、期中经营模拟成绩）
      + (course.tools || []).map((tool) => card({ href: `/${tool.file}${classQuery}`, cls: ' is-notes', badge: pickSvg('users', 20), label: '教师工具', title: tool.title, sub: esc(tool.note) })).join('')
      // 复习资料（政经“理论知识点总结（前七章）”、习经“理论知识点总结”）：学生在每个案例页／章节页的“资料与延伸阅读”里也能打开
      + (course.notes ? card({ href: `/${course.notes.file}`, cls: ' is-notes', badge: pickSvg('book', 20), label: '复习资料', title: course.notes.title,
        sub: `学生在每个${CONCEPT ? '案例' : '章节'}页最后的“资料与延伸阅读”里都能打开，可导出 PDF。` }) : '');
  }

  // ---------------- 导出 ----------------
  const itemLabel = (caseNo, key) => {
    const item = caseMap.get(caseNo);
    return (item && item.labels[key]) || key;
  };
  const csv = (rows) => '﻿' + rows.map((row) => row.map((cell) => {
    const text = String(cell == null ? '' : cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(',')).join('\r\n');
  const download = (name, content) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const safeName = (text) => String(text).replace(/[\\/:*?"<>|\s]+/g, '_');

  async function exportRooms(rooms, label, only, statusEl) {
    const status = statusEl || $('[data-export-status]');
    status.textContent = `正在导出${label}……`;
    try {
      const roomMap = new Map(rooms.map((room) => [String(room.id), room]));
      const pick = (docs) => docs.filter((doc) => roomMap.has(String(doc.classroom))).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const kinds = CONCEPT ? ['checkins', 'homework', 'danmaku'] : ['checkins', 'choices', 'answers', 'danmaku'];
      // 2026-11-26 起在后台就只取这几个课堂的（以前读全课程再挑），几页同时读
      const roomIds = rooms.map((room) => Number(room.id) || room.id);
      const readKind = (kind) => (typeof backend.fetchRows === 'function' ? backend.fetchRows(kind, { where: { course: course.slug }, in: ['classroom', roomIds] })
        : backend.fetchAll(kind, { course: course.slug }));
      const fetched = await Promise.all(kinds.map(async (kind) => pick((await readKind(kind)).filter((doc) => !doc.auditor))));   // 旁听不导出
      const docs = Object.fromEntries(kinds.map((kind, index) => [kind, fetched[index]]));
      const { checkins, danmaku } = docs;
      const choices = docs.choices || [];
      const answers = docs.answers || [];
      const who = new Map();
      checkins.forEach((doc) => who.set(`${doc.classroom}|${doc.sid}`, doc));
      const roomCols = (doc) => { const room = roomMap.get(String(doc.classroom)) || {}; return [room.name, room.code]; };
      const person = (doc) => { const info = who.get(`${doc.classroom}|${doc.sid}`) || {}; return [doc.sid, doc.name, info.class_name, info.group_name]; };
      const when = (doc) => [isoDay(doc.ts), clock(doc.ts)];
      const stamp = window.ClassLive.today();
      const prefix = `${course.title}_${state.klass ? safeName(state.klass.name) + '_' : ''}${label}_${stamp}`;
      const danmakuCsv = () => csv([['课堂', '课堂码', '日期', '时间', '学号', '姓名', '班级', '小组', '弹幕', '状态'],
        ...danmaku.map((d) => [...roomCols(d), isoDay(d.ts), clock(d.ts), ...person(d), dmPlain(d.text), recordStatus(d)])]);
      if (only === 'danmaku') {
        download(`${prefix}_弹幕记录.csv`, danmakuCsv());
        status.textContent = `已导出${label}弹幕记录：${danmaku.length} 条（含发送人姓名、学号、班级、小组）。`;
        return;
      }
      download(`${prefix}_加入名单.csv`, csv([['课堂', '课堂码', '日期', '时间', '学号', '姓名', '班级', '小组', '请假补做'],
        ...checkins.map((d) => [...roomCols(d), ...when(d), d.sid, d.name, d.class_name, d.group_name, d.makeup ? '是' : ''])]));
      if (CONCEPT) {
        // 每个课堂每个学号取最新一份作业
        const homework = window.ClassLive.latest(docs.homework, (d) => `${d.classroom}|${d.sid}`)
          .sort((a, b) => String(a.classroom).localeCompare(String(b.classroom)) || String(a.sid).localeCompare(String(b.sid)));
        const graded = homework.map((d) => ({ d, unit: unitMap.get(d.unit) })).filter((entry) => entry.unit)
          .map((entry) => ({ ...entry, result: gradeOf(entry.unit, entry.d.payload) }));
        const unitName = (unit) => `案例${unit.number} ${unit.title}`;
        const who4 = (d) => [d.sid, d.name, d.class_name, d.group_name];
        download(`${prefix}_作业汇总.csv`, csv([['课堂', '课堂码', '学号', '姓名', '班级', '小组', '案例', '已递交题数', '题目总数',
          '自动判分小题答对', '自动判分小题已答', '自动判分小题总数', '出门测答对', '出门测已递交', '全部递交', '全部递交时间', '最后递交'],
          ...graded.map(({ d, unit, result }) => [...roomCols(d), ...who4(d), unitName(unit), d.progress, d.total,
            result.autoRight, result.autoAnswered, result.autoTotal, `${result.exitRight}/${result.exitTotal}`, `${result.exitAnswered}/${result.exitTotal}`,
            d.submitted ? '是' : '否', d.submitted_at ? `${isoDay(millis(d.submitted_at))} ${clock(millis(d.submitted_at))}` : '',
            `${isoDay(d.ts)} ${clock(d.ts)}`])]));
        const sectionName = (unit, id) => (unitSections(unit).find((section) => section.id === id) || {}).label || id;
        const verdict = (item) => (item.value == null ? '未递交' : item.correct === true ? '正确' : item.correct === false ? '错误' : '不判分');
        const when = (at) => (at ? `${isoDay(millis(at))} ${clock(millis(at))}` : '');
        download(`${prefix}_作业明细.csv`, csv([['课堂', '课堂码', '学号', '姓名', '班级', '小组', '案例', '部分', '题目', '题干', '作答', '参考答案', '判定', '递交时间'],
          ...graded.flatMap(({ d, unit, result }) => result.items.map((item) => [...roomCols(d), ...who4(d), unitName(unit),
            sectionName(unit, item.section), item.label, item.prompt, item.shown, item.refShown, verdict(item), when(item.at)]))]));
        download(`${prefix}_弹幕记录.csv`, danmakuCsv());
        status.textContent = `已导出${label}：加入 ${checkins.length} 条、作业 ${graded.length} 份、弹幕 ${danmaku.length} 条（作业明细为每人每题一行）。`;
        return;
      }
      download(`${prefix}_投票与选择.csv`, csv([['课堂', '课堂码', '日期', '时间', '学号', '姓名', '班级', '小组', '案例', '项目', '选择', '选项内容'],
        ...choices.map((d) => [...roomCols(d), ...when(d), ...person(d), d.case, itemLabel(d.case, d.item), d.choice, d.label])]));
      download(`${prefix}_作业.csv`, csv([['课堂', '课堂码', '日期', '时间', '学号', '姓名', '班级', '小组', '案例', '题目', '作答'],
        ...answers.map((d) => [...roomCols(d), ...when(d), ...person(d), d.case, itemLabel(d.case, d.item), d.text])]));
      download(`${prefix}_弹幕记录.csv`, danmakuCsv());
      status.textContent = `已导出${label}：加入 ${checkins.length} 条、选择 ${choices.length} 条、作答 ${answers.length} 条、弹幕 ${danmaku.length} 条。`;
    } catch (error) {
      console.error(error);
      status.textContent = `导出失败：${error.message || error}`;
    }
  }
  $$('[data-dm-export]').forEach((button) => button.addEventListener('click', () => {
    const status = $('[data-dm-summary]');
    if (button.dataset.dmExport === 'room') {
      if (state.room) exportRooms([state.room], safeName(state.room.name), 'danmaku', status);
    } else {
      exportRooms(state.rooms, '本班全部课堂', 'danmaku', status);
    }
  }));
  $$('[data-export]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.export === 'room') {
      if (state.room) exportRooms([state.room], safeName(state.room.name));
    } else {
      exportRooms(state.rooms, '本班全部课堂');
    }
  }));

  // ---------------- 班级：上课范围（2026-10-21：政经这学期只上前七章，满分不再是全部单元）----------------
  const scopeBox = $('[data-class-scope-box]');
  let classScope = null;
  $('[data-class-scope-edit]').addEventListener('click', () => {
    classScope = scopeEditor($('[data-class-scope-editor]'), scopeIds(state.klass));
    scopeBox.hidden = false;
  });
  $('[data-class-scope-cancel]').addEventListener('click', () => { scopeBox.hidden = true; });
  $('[data-class-scope-save]').addEventListener('click', async () => {
    const status = $('[data-class-status]');
    const units = classScope ? classScope.get() : [];
    try {
      const saved = await backend.rpc('ck_set_class_units', { p_class: Number(state.klass.id) || state.klass.id, p_units: units });
      state.klass = { ...state.klass, ...(Array.isArray(saved) ? saved[0] : saved) };
      await loadClasses();
      showClassInfo();
      scopeBox.hidden = true;
      realmResult = null;
      renderRealms();
      status.textContent = `已保存上课范围：${scopeText(state.klass)}。满分改为 ${realmMax()} 修为；请到“修为境界”点“结算修为并更新学生称号”，学生的境界就按新的满分更新。`;
    } catch (problem) {
      console.error(problem);
      status.textContent = /PGRST202|42883|Could not find the function|未知的后台函数/.test(String((problem && problem.message) || problem))
        ? '保存失败：后台还没有“上课范围”功能（数据库语句尚未执行）。' : `保存失败：${problem.message || problem}`;
    }
  });

  // ---------------- 班级：上课时间与教室（2026-10-28 工作台“课表”“日程”）----------------
  $('[data-class-schedule-edit]').addEventListener('click', () => {
    if (!window.ClassLivePlanner) return;
    window.ClassLivePlanner.editClass(state.klass, async (row) => {
      state.klass = { ...state.klass, ...row };
      await loadClasses();
      showClassInfo();
      $('[data-class-status]').textContent = row.schedule ? `已保存上课时间：${window.ClassLivePlanner.summary(row.schedule)}。` : '已清除上课时间。';
    });
  });

  // ---------------- 班级：重命名、删除 ----------------
  $('[data-class-rename]').addEventListener('click', async () => {
    const name = (window.prompt('新的班级名称', state.klass.name) || '').trim();
    if (!name || name === state.klass.name) return;
    const status = $('[data-class-status]');
    try {
      state.klass = await backend.rpc('ck_rename_class', { p_class: Number(state.klass.id) || state.klass.id, p_name: name });
      if (Array.isArray(state.klass)) state.klass = state.klass[0];
      await loadClasses();
      showClassInfo();
      status.textContent = `已改名为“${name}”。`;
    } catch (problem) {
      console.error(problem);
      status.textContent = window.ClassLive.isDuplicateError(problem) ? '已有同名班级' : `改名失败：${problem.message || problem}`;
    }
  });
  const confirmInput = $('[data-clear-confirm]');
  const clearButton = $('[data-clear]');
  confirmInput.addEventListener('input', () => {
    clearButton.disabled = !state.room || window.ClassLive.normalizeCode(confirmInput.value) !== window.ClassLive.normalizeCode(state.room.code);
  });
  clearButton.addEventListener('click', async () => {
    const room = state.room;
    if (!room) return;
    const live = room.is_current ? '\n\n这是当前课堂：删除后学生不能再用这个课堂码进入，需要重新发布课堂。' : '';
    if (!window.confirm(`确定删除课堂“${room.name}”（${room.code}）及其加入记录、选择、作答、作业、弹幕和匿名建议吗？此操作无法恢复；本班其他课堂和点名册不受影响。${live}`)) return;
    const status = $('[data-clear-status]');
    clearButton.disabled = true;
    status.textContent = '正在删除……';
    try {
      await deleteRoom(room, true);
      status.textContent = `已删除课堂“${room.name}”（${room.code}）。`;
    } catch (error) {
      console.error(error);
      clearButton.disabled = false;
      status.textContent = `删除失败：${error.message || error}`;
    }
  });

  // ---------------- 本班记录（2026-11-26 提速） ----------------
  // 用户：“教师工作台，载入修为境界等数据的时候有点卡，有点慢，你能想办法优化一下嘛？”
  // 以前修为境界、学情分析、导出考勤各自把全课程（各个班）的加入、选择、作答、作业、弹幕记录一页 500 条地一页页读完，再在浏览器里挑出本班的，
  // 几张表也是读完一张再读下一张。现在：按本班的课堂编号在后台就筛好、只取要用的列、几张表同时读、每张表几页同时读（backend.fetchRows）；
  // 读过的留在这个页面里（不存到硬盘：投屏电脑常是公用的），20 秒内再用直接拿，超过 20 秒只补读新的：
  //   · 选择、作答只增不改（只在删课堂时连带删除，课堂一变就整张重读），按写入时间往前多读 2 分钟、按 id 合并（同时写入时后写完的不会漏）；
  //   · 政经的作业（课后作业快照）会更新，按更新时间往前多读 2 分钟；
  //   · 加入记录（旁听转正）、弹幕（隐藏、撤回、点赞、删除）和其他小表会改，每次整张重读（本班的不多）。
  // 后台网页还是旧的、没有 fetchRows 时（只在发布过渡的一两分钟里）退回原来的读法。
  const classData = (() => {
    const FRESH_MS = 20000;
    const BACK_MS = 120000;
    const SPEC = {
      checkins: { mode: 'full', course: true, columns: 'id,owner,course,session,name,sid,ts,created_at,classroom,class_name,group_name,verified,auditor,makeup' },
      choices: { mode: 'append', course: true, columns: 'id,owner,course,session,name,sid,case_no,item,choice,ts,created_at,classroom' },
      answers: { mode: 'append', course: true, columns: 'id,owner,course,session,name,sid,case_no,item,text,ts,created_at,classroom' },
      homework: { mode: 'updated', course: true },
      danmaku: { mode: 'full', course: true },
      bonus: { mode: 'full', course: true },
      puzzleguesses: { mode: 'append', course: false },
      debateposts: { mode: 'full', course: false },
    };
    const cache = new Map();   // 表 → { key, rows: Map(id → 行), at, cursor, pending }
    const read = (kind, opts) => (typeof backend.fetchRows === 'function' ? backend.fetchRows(kind, opts)
      : backend.fetchAll(kind, opts.where || {}).then((rows) => {
        const ids = opts.in ? new Set(opts.in[1].map(String)) : null;
        return rows.filter((row) => (!ids || ids.has(String(row[opts.in[0]]))) && (!opts.since || String(row[opts.since[0]] || '') > String(opts.since[1])));
      }));
    async function load(kind, rooms, entry) {
      const spec = SPEC[kind] || { mode: 'full', course: true };
      const ids = rooms.map((room) => Number(room.id) || room.id);
      const base = { where: spec.course ? { course: course.slug } : {}, in: ['classroom', ids], columns: spec.columns };
      const field = spec.mode === 'updated' ? 'updated_at' : 'created_at';
      const more = Boolean(entry.rows && spec.mode !== 'full' && entry.cursor);
      const list = await read(kind, more ? { ...base, since: [field, entry.cursor] } : base);
      const rows = more ? entry.rows : new Map();
      list.forEach((row) => rows.set(String(row.id), row));
      let latest = 0;
      let dated = spec.mode !== 'full';
      rows.forEach((row) => { const at = millis(row[field]); if (at) latest = Math.max(latest, at); else dated = false; });
      entry.rows = rows;
      entry.cursor = dated && latest ? new Date(latest - BACK_MS).toISOString() : null;   // 有的行没有时间（本机测试数据）：下次整张重读
      entry.at = Date.now();
    }
    // 本班（rooms 这几个课堂）某张表的记录，按 id 排；force：不用 20 秒内的，选择、作答照样只补读新的
    async function get(kind, rooms, force) {
      const key = `${course.slug}|${rooms.map((room) => String(room.id)).sort().join(',')}`;
      let entry = cache.get(kind);
      if (!entry || entry.key !== key) {
        entry = { key, rows: null, at: 0, cursor: null, pending: null };
        cache.set(kind, entry);
      }
      if (!entry.pending && !(entry.rows && !force && Date.now() - entry.at < FRESH_MS)) {
        entry.pending = load(kind, rooms, entry).finally(() => { entry.pending = null; });
      }
      if (entry.pending) await entry.pending;
      return Array.from(entry.rows.values()).sort((a, b) => Number(a.id) - Number(b.id));
    }
    return { get, clear: () => cache.clear() };
  })();

  // ---------------- 修为境界：按后台记录结算，贯穿整个学期 ----------------
  // 每次课满分 100 修为：签到 20、作答完成 35、作答正确 35、弹幕最多 10（每条有效弹幕 2 修为）。
  // 习经按案例算课次（一章两个案例＝两次课），政经每个案例一次课；满分＝100 × 全部课次。境界见 ClassLive.REALMS。
  // 防刷分：
  //   · 只认本课程题库里有的题，同一题只认第一次递交（跨课堂、跨设备都一样），且只认该单元自己课堂里的记录；
  //   · 文字题要写满 10 个有效字（申论大题 60 个）、不能留着句式里的空格线；
  //   · 弹幕要有 4 个有效字，同一句只算一次，老师隐藏、学生撤回的和法宝都不算（审核模式只算已通过的），每次课最多 10 修为；
  //   · 签到只认“上课日”（当天本单元有足够多同学登录），课后自己打开页面不算；
  //   · 境界只由教师账号写入（ck_save_realms），点名册里没有的学号不结算。
  // 教师点赞（投屏上点，ck_like_danmaku 每堂课有上限）：被赞弹幕的发送人每赞额外加 LIKE.points 修为，每人每次课最多算 LIKE.perStudent 个；额外奖励，不计入满分。
  const REALMS = window.ClassLive.realmsFor ? window.ClassLive.realmsFor(course.slug) : window.ClassLive.REALMS;   // 门槛按课程（化神：习经 150%（11-26 起）、政经 155%，2026-11-15）
  // 请假：请假的那次课（上课日）计 leave 修为（相当于签到）；某个单元的上课日既没登录也没请假，这个单元不得任何修为（作答、弹幕、点赞都不算）
  const POINTS = { attend: 20, done: 35, right: 35, danmaku: 10, perDanmaku: 2, challenge: 2, leave: (window.ClassLive.LEAVE || {}).points || 20 };
  const LIKE = window.ClassLive.LIKE || { limit: 20, points: 5, perStudent: 2 };
  // 只算本班上课范围内的单元（班级设置里选；没选＝全部）：满分＝范围内的课次 × 100，范围外单元的记录不计
  const realmUnits = () => {
    const ids = scopeIds(state.klass);
    const all = CONCEPT
      ? course.units.filter((u) => !u.exam).map((u) => ({ id: u.unit, label: `案例${u.number}`, meetings: 1, unit: u }))   // 期中考查作业不计修为
      : course.chapters.map((ch) => ({ id: ch.id, label: ch.cn, meetings: Math.max(1, ch.cases.length),
        cases: ch.cases.map((item) => caseMap.get(item.number)).filter(Boolean) }));
    return ids ? all.filter((u) => ids.includes(u.id)) : all;
  };
  const realmMax = () => realmUnits().reduce((sum, u) => sum + 100 * u.meetings, 0);
  const meaningful = (text) => String(text == null ? '' : text).replace(/[\s\p{P}\p{S}＿_]/gu, '');
  const validText = (text, min) => {
    const raw = String(text == null ? '' : text);
    if (/[＿_]{2,}/.test(raw)) return false;   // 句式里的空格线还没填
    const m = meaningful(raw);
    return m.length >= min && new Set(m).size >= Math.min(8, Math.ceil(min * 0.6));
  };
  // 同一题只认第一次递交。先后按后台写入时间（created_at）排，网页传来的 ts 可以被改（2026-10-28 检查“换设备刷修为”时改）
  const serverAt = (doc) => millis(doc.created_at) || Number(doc.ts) || 0;
  const firstOf = (docs) => {
    const map = new Map();
    docs.slice().sort((a, b) => serverAt(a) - serverAt(b) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }))
      .forEach((doc) => { if (!map.has(doc.item)) map.set(doc.item, doc); });
    return map;
  };
  const sameSet = (value, answer) => String(value).split(',').filter(Boolean).sort().join(',') === answer.slice().map(String).sort().join(',');

  // 习经：一个案例的题目。kind：obj 客观题（按对错）/ part 投票、站队（参与即可）/ text 文字题；m＝这位学生在本案例的选择（题号 → 选项），可不传
  // opts.legacyTransfer：这一课以前用“小案例”上过（2026-11-12 前的迁移任务：match-1—4、transfer-k、说一说），仍按原来的题算，以前的修为不变（OLD_TK 见上）
  function xjpQuestions(c, m, opts) {
    const qs = [];
    const P = c.practice || {};
    // 迁移任务（2026-11-12 起“小资料分析”，三道单选 tk-1—3）：没有新题，或这一课已经用小案例上过的，仍按小案例算
    const oldTk = !P.transfer || Boolean(opts && opts.legacyTransfer);
    const ref = c.poll && c.poll.reference;
    qs.push({ kind: 'part', items: ['pre'] });
    qs.push(ref ? { kind: 'obj', items: ['post'], score: (m) => (String(m.post) === String(ref) ? 1 : 0) } : { kind: 'part', items: ['post'] });
    const clues = oldTk ? (c.matching && c.matching.clues) || [] : [];
    if (clues.length) {
      const items = clues.map((_, i) => `match-${i + 1}`);
      qs.push({ kind: 'obj', items, score: (m) => clues.filter((clue, i) => [clue.answer, ...(clue.accept || [])].some((k) => m[items[i]] === `K${k}`)).length / clues.length });
    }
    ((c.sim && c.sim.rounds) || []).forEach((_, i) => qs.push({ kind: 'part', items: [`sim-${i + 1}`] }));
    if (c.transfer && oldTk) {
      qs.push({ kind: 'obj', items: ['transfer-k'], score: (m) => ([c.transfer.answer, ...(c.transfer.accept || [])].some((k) => m['transfer-k'] === `K${k}`) ? 1 : 0) });
    }
    (c.items || []).forEach((entry) => { if (oldTk || entry.key !== 'transfer') qs.push({ kind: 'text', items: [entry.key], min: 10 }); });
    if (!oldTk) P.transfer.items.forEach((q) => qs.push({ kind: 'obj', items: [q.key], score: (m) => (sameSet(m[q.key], q.answer) ? 1 : 0) }));
    // 纠错诊断：用旧题上过的课（opts.legacyMyth）按旧题算。出门测（group.self）：改动发布以后的课不计入作答完成／正确，
    // 记成 kind 'self'（结算时答对每题另加 SELF_EXIT 修为）；发布以前的课（opts.legacyExit）照旧按客观题算
    (P.groups || []).forEach((group) => {
      const list = group.legacy && opts && opts.legacyMyth ? group.legacy : group.items;
      const kind = group.self && !(opts && opts.legacyExit) ? 'self' : 'obj';
      list.forEach((q) => qs.push({ kind, items: [q.key], score: (m) => (sameSet(m[q.key], q.answer) ? 1 : 0) }));
    });
    if (P.debate) ['debate-pre', 'debate-post', 'debate-cards'].forEach((key) => qs.push({ kind: 'part', items: [key] }));
    // 圆桌会议（2026-10-16 简化）：只计认领角色；三项议程的投票在上面 sim-1—3 里（参与即可）
    if (P.roundtable) qs.push({ kind: 'part', items: ['rt-role'] });
    // 经营沙盘（2026-11-03／04，代替案例 06、08、09、19 的圆桌会议）：只计选角色；代表投票、聊天室发言不算题，修为另由结算发放。
    // 以前上过这几个案例的圆桌会议（递交过认领角色或议程投票）的学生，仍按圆桌会议的题算（认领角色＋三项议程），以前的修为不变
    if (P.biz) {
      const legacy = P.biz.legacy && m && (m['rt-role'] != null || Object.keys(m).some((key) => /^sim-\d+$/.test(key)));
      if (legacy) {
        qs.push({ kind: 'part', items: ['rt-role'] });
        for (let i = 1; i <= P.biz.legacy.sims; i += 1) qs.push({ kind: 'part', items: [`sim-${i}`] });
      } else qs.push({ kind: 'part', items: ['biz-role'] });
    }
    return qs;
  }
  // 政经：按递交单位（submitKey）把 gradeOf 的逐题记录归成题目
  // 2026-10-23 起出门测、课后思考并入“课后自修”：学生递交后由修炼场后台另计修为（出门测答对 +2、课后思考写满 100 字 +5，在“修炼”一列），
  // 这里不再算进课堂的“作答完成／作答正确”，免得重复计分（递交记录照旧，工作台和投屏统计不受影响）
  // 核查提示明细里文字题的名称（2026-11-22）：政经“概念 1 · 绝对剩余价值 · 说一说”，习经取案例文字题的标题（与“学生作答”下拉框一致）
  const peTextLabel = (unit, key) => {
    const m = /^([^.]+)\.explain$/.exec(key);
    if (m) {
      const i = ((unit && unit.concepts) || []).findIndex((k) => k.id === m[1]);
      return i >= 0 ? `概念 ${i + 1} · ${unit.concepts[i].name} · 说一说` : '说一说';
    }
    if (key === 'discussion') return '小组辨析 · 我的理由';
    if (key === 'discussion.after') return '小组辨析 · 讨论后的补充';
    return key;
  };
  const xjpTextLabel = (c, key) => ((c.items || []).find((entry) => entry.key === key) || {}).label || key;
  const peKind = (key) => {
    if (/^exit\.\d+$/.test(key) || key === 'essay') return { kind: 'self' };
    if (/\.discover$/.test(key) || key === 'poll' || /^debate\.(pre|cards|post)$/.test(key)) return { kind: 'part' };
    if (/\.challenge$/.test(key)) return { kind: 'bonus' };
    if (/\.explain$/.test(key) || key === 'discussion' || key === 'discussion.after') return { kind: 'text', min: 10 };
    if (key === 'essay') return { kind: 'text', min: 60 };
    return { kind: 'obj' };
  };
  function peScore(unit, payload) {
    const result = gradeOf(unit, payload || {});
    const groups = new Map();
    result.items.forEach((item) => {
      const key = submitKey(item.key);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const out = { total: 0, done: 0, obj: 0, right: 0, bonus: 0 };
    groups.forEach((items, key) => {
      const { kind, min } = peKind(key);
      if (kind === 'self') return;
      if (kind === 'bonus') { if (items.every((item) => item.correct)) out.bonus += 1; return; }
      out.total += 1;
      if (kind === 'text') {
        const text = (items.find((item) => item.type === 'text') || {}).value;
        if (validText(text, min)) out.done += 1;
        return;
      }
      const answered = items.every((item) => item.value != null);
      if (answered) out.done += 1;
      if (kind === 'obj') {
        const graded = items.filter((item) => item.ref != null);
        out.obj += 1;
        if (answered && graded.length) out.right += graded.filter((item) => item.correct).length / graded.length;
      }
    });
    return out;
  }
  // 政经：同一学号在本单元各课堂、各设备的递交合并，每题取最早一次
  const mergePayload = (docs) => {
    const payload = {};
    docs.forEach((doc) => Object.entries(doc.payload || {}).forEach(([key, entry]) => {
      if (!isEntry(entry)) return;
      if (!payload[key] || millis(entry.at) < millis(payload[key].at)) payload[key] = entry;
    }));
    return payload;
  };

  async function computeRealms() {
    const rooms = (await backend.fetchAll('classrooms', { course: course.slug })).filter((room) => sameClass(room, state.klass));
    const roomUnit = new Map(rooms.map((room) => [String(room.id), room.chapter]));
    const reviewRoom = new Set(rooms.filter((room) => room.danmaku === 'review').map((room) => String(room.id)));   // 审核模式：只算已通过的
    const kinds = CONCEPT ? ['checkins', 'homework', 'danmaku'] : ['checkins', 'choices', 'answers', 'danmaku'];
    const docs = {};
    // 2026-11-26 起这些都同时读，记录只读本班的（classData）
    const classId = Number(state.klass.id) || state.klass.id;
    const orNone = (fallback, also) => (error) => { if (missingTable(error) || (also && missingFunction(error))) return fallback; throw error; };
    const [lists, bonusRows, practiceList, ltMap, leaves] = await Promise.all([
      Promise.all(kinds.map((kind) => classData.get(kind, rooms))),
      // 额外修为：ck_bonus 各类（猜词第一 wordgame、猜谜抢答 puzzle、PK、辩论 debate、经营沙盘 biz、匿名建议 feedback、
      // 2026-11-05 起：建议被点赞采纳 adopt、点笑脸 mood、一周登录满 3 天 week）；后台还没有这张表时按 0 算
      classData.get('bonus', rooms).catch(orNone([])),
      // 修炼场（2026-10-22）：本班每人在本课程修炼场累计得到的修为（后台已按每天上限、每题一次核对；还没建表时按 0 算）
      backend.rpc('ck_practice_totals', { p_course: course.slug, p_class: classId }).catch(orNone([], true)),
      // 云间灵田（2026-11-15）：服丹折算的网站修为（后台已按每天 1、每周 5、学期为满分 3% 的上限记好；还没建好时按 0 算）
      backend.rpc('lt_points', { p_course: course.slug, p_class: classId }).catch(orNone({}, true)),
      backend.fetchAll('leaves', { class_id: classId }).catch(orNone([])),
    ]);
    kinds.forEach((kind, i) => { docs[kind] = lists[i].filter((doc) => roomUnit.has(String(doc.classroom)) && !doc.auditor); });   // 旁听不计修为
    const gameBonus = new Map();
    bonusRows.filter((doc) => roomUnit.has(String(doc.classroom)))
      .forEach((doc) => gameBonus.set(sidKey(doc.sid), (gameBonus.get(sidKey(doc.sid)) || 0) + (Number(doc.points) || 0)));
    const practicePoints = new Map();
    (Array.isArray(practiceList) ? practiceList : []).forEach((row) => practicePoints.set(sidKey(row.sid), Number(row.points) || 0));
    const lingtianPoints = new Map();
    Object.entries((Array.isArray(ltMap) ? ltMap[0] : ltMap) || {}).forEach(([sid, pts]) => lingtianPoints.set(sidKey(sid), Number(pts) || 0));
    const leaveDay = (sid, day) => leaves.some((row) => sidKey(row.sid) === sid && row.start_day <= day && day <= row.end_day);
    const roster = rosterOf();
    const rosterMap = new Map(roster.map((person) => [sidKey(person.sid), person]));
    const people = new Map();   // 学号 → { sid, name, owners }
    const touch = (doc) => {
      const key = sidKey(doc.sid);
      if (!key) return null;
      const row = people.get(key) || { sid: key, name: doc.name, owners: new Set() };
      if (doc.name) row.name = doc.name;
      if (doc.owner) row.owners.add(doc.owner);
      people.set(key, row);
      return row;
    };
    docs.checkins.forEach(touch);
    roster.forEach((person) => { const key = sidKey(person.sid); if (!people.has(key)) people.set(key, { sid: key, name: person.name, owners: new Set() }); });
    const base = roster.length || new Set(docs.checkins.map((doc) => sidKey(doc.sid))).size;
    const need = base >= 10 ? Math.max(3, Math.ceil(base * 0.3)) : 1;   // “上课日”：当天本单元登录的人数
    // 文字作答雷同：同一段话（20 个有效字以上）出现在不同学号下
    // 2026-11-22 起记下每处的出处和原文（用户：“最好能够显示或者链接到相同的地方。比如点击一下就能展开到相同的地方，显示跟谁相同等”），
    // 修为表“核查提示”点开就能看到是哪一题、原文、和谁相同
    const textOwners = new Map();   // 有效文字 → Map(学号 → [出处])
    const textSample = new Map();   // 有效文字 → 第一次见到的原文（显示用）
    const noteText = (sid, text, where) => {
      const m = meaningful(text);
      if (m.length < 20) return;
      if (!textOwners.has(m)) { textOwners.set(m, new Map()); textSample.set(m, String(text).trim()); }
      const bySid = textOwners.get(m);
      const list = bySid.get(sid) || [];
      if (where && !list.includes(where)) list.push(where);
      bySid.set(sid, list);
    };
    // 每台设备（登录记录的 owner）在本班课堂里：每个学号登录了几次、第一次和最近一次、上过哪几次课（核查提示“N 台设备登录过”的明细）
    const deviceUse = new Map();   // owner → Map(学号 → { n, first, last, units })
    docs.checkins.forEach((doc) => {
      const key = sidKey(doc.sid);
      if (!doc.owner || !key) return;
      if (!deviceUse.has(doc.owner)) deviceUse.set(doc.owner, new Map());
      const bySid = deviceUse.get(doc.owner);
      const use = bySid.get(key) || { n: 0, first: 0, last: 0, units: new Set() };
      const at = serverAt(doc);
      use.n += 1;
      if (at && (!use.first || at < use.first)) use.first = at;
      if (at > use.last) use.last = at;
      const unitId = roomUnit.get(String(doc.classroom));
      if (unitId) use.units.add(unitId);
      bySid.set(key, use);
    });
    const units = realmUnits();
    // 课堂所属单元的名称（核查提示明细里“上过的课”用；本班上课范围以外的单元也要有名字）
    const realmUnitNames = new Map(CONCEPT
      ? course.units.map((x) => [x.unit, x.exam ? '期中考查作业' : `案例${x.number}`])
      : course.chapters.map((ch) => [ch.id, ch.cn]));
    const perUnit = units.map((u) => {
      const inUnit = (doc) => roomUnit.get(String(doc.classroom)) === u.id;
      const days = new Map();
      // 请假补做的登录（2026-11-19）不算上课日：补做的那天只有一两个人登录，不能把它当成一次课，也不算出勤（请假那次课照常计请假）
      docs.checkins.filter((doc) => inUnit(doc) && !doc.makeup).forEach((doc) => {
        const day = doc.session || isoDay(doc.ts);
        if (!days.has(day)) days.set(day, new Set());
        days.get(day).add(sidKey(doc.sid));
      });
      const classDays = Array.from(days.entries()).filter(([, sids]) => sids.size >= need).map(([day]) => day);
      const bySid = (kind) => {
        const map = new Map();
        (docs[kind] || []).filter(inUnit).forEach((doc) => {
          const key = sidKey(doc.sid);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(doc);
        });
        return map;
      };
      return { u, days, classDays, held: Math.min(classDays.length, u.meetings), choices: bySid('choices'), answers: bySid('answers'),
        homework: bySid('homework'), danmaku: bySid('danmaku') };
    });
    const max = realmMax();
    const rows = Array.from(people.values()).map((person) => {
      const total = { attend: 0, leave: 0, done: 0, right: 0, danmaku: 0, like: 0, game: gameBonus.get(person.sid) || 0, practice: practicePoints.get(person.sid) || 0, lingtian: lingtianPoints.get(person.sid) || 0 };
      let excusedTimes = 0;
      perUnit.forEach((info) => {
        const { u } = info;
        const m = u.meetings;
        // 签到、请假：上课日既没登录也没请假的单元不得修为
        if (info.held) {
          const mine = info.classDays.filter((day) => info.days.get(day).has(person.sid)).length;
          const excused = info.classDays.filter((day) => !info.days.get(day).has(person.sid) && leaveDay(person.sid, day)).length;
          if (!mine && !excused) return;
          const attended = Math.min(mine, info.held);
          total.attend += POINTS.attend * m * attended / info.held;
          total.leave += POINTS.leave * m * Math.min(excused, info.held - attended) / info.held;
          excusedTimes += Math.min(excused, info.held - attended);
        }
        // 作答
        let done = 0;
        let count = 0;
        let right = 0;
        let obj = 0;
        let bonus = 0;
        if (CONCEPT) {
          const list = info.homework.get(person.sid) || [];
          const score = peScore(u.unit, mergePayload(list));
          ({ done } = score);
          count = score.total;
          ({ right, obj, bonus } = score);
          list.forEach((doc) => Object.entries(doc.payload || {}).forEach(([key, entry]) => {
            if (isEntry(entry) && peKind(key).kind === 'text') noteText(person.sid, typeof entry.v === 'object' && entry.v ? entry.v.reason : entry.v, `${u.label} · ${peTextLabel(u.unit, key)}`);
          }));
        } else {
          // 迁移任务按哪种题算（按全班，不按个人，以前的修为不变）：有人递交过小案例（match、transfer-k、说一说）的，或者没有人做过新题（tk）
          // 而这个案例在 TK_SINCE 之前就上过（有记录早于它；没有任何记录时看本单元最后一次课）的，按小案例算；其余按小资料分析算
          // 纠错诊断（2026-11-20 起多选）、出门测（同日起照课后自修）同样按全班看：有人递交过旧的纠错题，或这个案例在改动发布以前就上过，按原来的办法算
          if (!info.tkLegacy) info.tkLegacy = new Map();
          const legacyOf = (c) => {
            const key = String(c.number);
            if (!info.tkLegacy.has(key)) {
              let old = false;
              let fresh = false;
              let oldMyth = false;
              let freshMyth = false;
              let first = '';
              let firstMs = 0;
              [info.choices, info.answers].forEach((map) => map.forEach((list) => list.forEach((doc) => {
                if (String(doc.case) !== key) return;
                if (OLD_TK.test(doc.item)) old = true;
                if (/^tk-\d+$/.test(doc.item)) fresh = true;
                if (OLD_MYTH.test(doc.item)) oldMyth = true;
                if (NEW_MYTH.test(doc.item)) freshMyth = true;
                const at = serverAt(doc);
                const day = isoDay(at);
                if (day && (!first || day < first)) first = day;
                if (at && (!firstMs || at < firstMs)) firstMs = at;
              })));
              const last = info.classDays.slice().sort().pop() || '';
              const before = firstMs ? firstMs < NEW_SINCE : Boolean(last) && last < NEW_DAY;   // 这个案例在改动发布以前就上过
              info.tkLegacy.set(key, { legacyTransfer: old || (!fresh && (first ? first < TK_SINCE : Boolean(last) && last < TK_SINCE)),
                legacyMyth: oldMyth || (!freshMyth && before), legacyExit: before });
            }
            return info.tkLegacy.get(key);
          };
          (u.cases || []).forEach((c) => {
            const choices = firstOf((info.choices.get(person.sid) || []).filter((doc) => doc.case === c.number));
            const answers = firstOf((info.answers.get(person.sid) || []).filter((doc) => doc.case === c.number));
            const m2 = {};
            choices.forEach((doc, item) => { m2[item] = String(doc.choice); });
            xjpQuestions(c, m2, legacyOf(c)).forEach((q) => {
              // 出门测（照课后自修）：不算题数，答对每题另加修为，记在“修炼”
              if (q.kind === 'self') { total.practice += SELF_EXIT * q.score(m2); return; }
              count += 1;
              if (q.kind === 'text') {
                const doc = answers.get(q.items[0]);
                if (doc && validText(doc.text, q.min)) { done += 1; noteText(person.sid, doc.text, `${u.label} · 案例${String(c.number).padStart(2, '0')} · ${xjpTextLabel(c, q.items[0])}`); }
                return;
              }
              const answered = q.items.every((item) => m2[item] != null);
              if (answered) done += 1;
              if (q.kind === 'obj') { obj += 1; if (answered) right += q.score(m2); }
            });
          });
        }
        const answerPoints = (count ? POINTS.done * m * done / count : 0) + (obj ? POINTS.right * m * right / obj : 0);
        const capped = Math.min((POINTS.done + POINTS.right) * m, answerPoints + POINTS.challenge * bonus);
        total.done += count ? POINTS.done * m * done / count : 0;
        total.right += capped - (count ? POINTS.done * m * done / count : 0);
        // 弹幕
        const said = new Set();
        let likes = 0;
        (info.danmaku.get(person.sid) || []).forEach((doc) => {
          if (doc.gift || doc.withdrawn_at || doc.status === 'hidden') return;
          if (doc.liked_at) likes += 1;   // 老师点赞的（点赞即认可，审核模式下也算）
          if (reviewRoom.has(String(doc.classroom)) && doc.status !== 'shown') return;
          const text = meaningful(String(doc.text || '').replace(/^(【[^】]{1,12}】\s*)+/, ''));
          if (text.length >= 4) said.add(text);
        });
        total.danmaku += Math.min(POINTS.danmaku * m, POINTS.perDanmaku * said.size);
        total.like += LIKE.points * Math.min(likes, LIKE.perStudent * m);
      });
      const points = Math.round((total.attend + total.leave + total.done + total.right + total.danmaku + total.like + total.game + total.practice + total.lingtian) * 10) / 10;
      const realm = window.ClassLive.realmOf(points, max, course.slug);
      const round1 = (v) => Math.round(v * 10) / 10;
      return { sid: person.sid, name: (rosterMap.get(person.sid) || {}).name || person.name || '', points, max, realm: realm.level, stage: realm.stage,
        title: realm.title, inRoster: !roster.length || rosterMap.has(person.sid), owners: person.owners.size,
        excused: excusedTimes,
        detail: { attend: round1(total.attend), leave: round1(total.leave), done: round1(total.done), right: round1(total.right), danmaku: round1(total.danmaku), like: round1(total.like), game: round1(total.game), practice: round1(total.practice), lingtian: round1(total.lingtian) } };
    });
    rows.forEach((row) => {
      row.flags = [];
      if (!row.inRoster) row.flags.push('不在点名册（不结算境界）');
      if (row.excused) row.flags.push(`请假 ${row.excused} 次`);
      if (row.owners > 1) row.flags.push(`${row.owners} 台设备登录过`);
      let same = 0;
      textOwners.forEach((sids) => { if (sids.size > 1 && sids.has(row.sid)) same += 1; });
      if (same) row.flags.push(`${same} 处文字作答与他人相同`);
      // 明细（点“核查提示”展开）：设备按第一次登录排；同一台设备上还登录过别的学号的一并列出
      const nameOf = (sid) => ((rosterMap.get(sid) || people.get(sid) || {}).name || '');
      const unitName = (id) => (realmUnitNames.get(id) || id);
      row.more = {};
      if (row.owners > 1) {
        row.more.devices = Array.from(deviceUse.values()).filter((bySid) => bySid.has(row.sid)).map((bySid) => {
          const use = bySid.get(row.sid);
          return { n: use.n, first: use.first, last: use.last, units: Array.from(use.units).map(unitName),
            others: Array.from(bySid.keys()).filter((other) => other !== row.sid).map((other) => ({ sid: other, name: nameOf(other) })) };
        }).sort((a, b) => (a.first || Infinity) - (b.first || Infinity));
      }
      if (same) {
        row.more.same = Array.from(textOwners.entries()).filter(([, bySid]) => bySid.size > 1 && bySid.has(row.sid)).map(([m, bySid]) => ({
          text: textSample.get(m), mine: bySid.get(row.sid) || [],
          others: Array.from(bySid.entries()).filter(([other]) => other !== row.sid).map(([other, wheres]) => ({ sid: other, name: nameOf(other), wheres })),
        }));
      }
    });
    rows.sort((a, b) => b.points - a.points || String(a.sid).localeCompare(String(b.sid)));
    return { rows, max, units: perUnit.filter((info) => info.held).length, total: units.length, meetings: units.reduce((s, u) => s + u.meetings, 0) };
  }

  // 没有选中课堂时，试用特效用本课程第一个投屏页
  const demoHref = () => (course.chapters[0] ? `/${course.chapters[0].file}?demo=1` : '#');
  $('[data-realm-demo]').href = demoHref();
  const realmChip = (level, title) => `<span class="tw-realm is-r${level}">${esc(title || REALMS[level].name)}</span>`;
  // 宗门（2026-11-05）：本课程历届弟子（ck_sect_members；学生经 ck_sect_join 自己选，教师可读、可删＝解除选择），宗门分＝历届弟子修为之和
  const SECTS = window.ClassLive.SECTS || [];
  let sectRows = [];
  let sectProblem = '';
  // 宗主任期（2026-11-22）：本周各宗门的宗主和最近十二周的记录（ck_sect_leader_list；后台还没更新时为 null，卡片上不显示宗主）
  let sectTerms = null;
  const sectChip = (key) => {
    const sect = SECTS.find((item) => item.key === key);
    return sect ? `<span class="tw-sect" style="--sc:${sect.color}"><i>${esc(sect.mark)}</i>${esc(sect.name)}</span>` : key === 'sanxiu' ? '<span class="tw-sect is-sanxiu">散修</span>' : '';
  };
  const sectName = (key) => { const sect = SECTS.find((item) => item.key === key); return sect ? sect.name : key === 'sanxiu' ? '散修' : ''; };
  async function loadSects() {
    try {
      sectRows = await backend.fetchAll('sectmembers', { course: course.slug });
      sectProblem = '';
    } catch (error) {
      sectRows = [];
      sectProblem = missingTable(error) ? '宗门的数据表还没有建好：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261105-宗门.sql。' : `读取宗门失败：${error.message || error}`;
    }
    try {
      const value = await backend.rpc('ck_sect_leader_list', { p_course: course.slug });
      const data = (Array.isArray(value) ? value[0] : value) || null;
      sectTerms = data && Array.isArray(data.leaders) ? data : null;
    } catch (error) {
      sectTerms = null;   // 后台还没有宗主任期（未执行 2026-11-22 的 SQL）或网络问题：宗门榜照常显示，只是不带宗主
    }
  }
  function renderSects() {
    const box = $('[data-sect-box]');
    if (!box || !SECTS.length) return;
    box.hidden = false;
    if (sectProblem) { box.innerHTML = `<p>${esc(sectProblem)}</p>`; return; }
    const classId = String(state.klass ? state.klass.id : '');
    const sum = (rows) => Math.round(rows.reduce((total, row) => total + (Number(row.points) || 0), 0) * 10) / 10;
    const list = SECTS.map((sect) => {
      const rows = sectRows.filter((row) => row.sect === sect.key);
      const mine = rows.filter((row) => String(row.class_id) === classId);
      return { ...sect, points: sum(rows), members: rows.length, classMembers: mine.length, classPoints: sum(mine) };
    }).sort((a, b) => b.points - a.points);
    list.forEach((row) => { row.rank = 1 + list.filter((other) => other.points > row.points).length; });
    const sanxiu = sectRows.filter((row) => row.sect === 'sanxiu');
    const years = new Set(sectRows.filter((row) => row.sect !== 'sanxiu').map((row) => String(row.class_id))).size;
    // 本周宗主（2026-11-22 用户：“宗门能显示宗主的境界和分值。然后宗主最多连续做两个礼拜……换成第二名的同学来做以此类推”）
    const Live = window.ClassLive;
    const titleOf = (realm, stage) => (Live.stageTitle ? Live.stageTitle(Number(realm) || 0, Number(stage) || 0) : (REALMS[Number(realm) || 0] || {}).name || '');
    const leaderOf = (key) => ((sectTerms && sectTerms.leaders) || []).find((item) => item.sect === key) || null;
    const lordLine = (key) => {
      if (!sectTerms) return '';
      const lord = leaderOf(key);
      if (!lord) return '<span class="tw-sect-lord is-empty">宗主暂缺：还没有元婴以上的在读弟子</span>';
      const here = String(lord.class_id) === classId;
      return `<span class="tw-sect-lord">宗主 <b>${esc(lord.name || lord.sid)}</b>${here ? '' : `（${esc(lord.class_name || '别的班')}）`} · ${esc(titleOf(lord.realm, lord.stage))} · 修为 <b>${Number(lord.points) || 0}</b> · ${Number(lord.weeks) > 1 ? `连任第 ${Number(lord.weeks)} 周` : '本周新任'}</span>`;
    };
    const weekText = (day) => `${Number(String(day).slice(5, 7))} 月 ${Number(String(day).slice(8, 10))} 日`;
    const history = (sectTerms && sectTerms.history) || [];
    const weeks = Array.from(new Set(history.map((item) => item.week))).sort().reverse();
    const termTable = !sectTerms ? '' : `<details class="tw-sect-terms"><summary>宗主任期：每周一推选，连任最多两周（点开看规则和最近的任期）</summary>
      <p>每周一（北京时间）推选一次，一任一周：本宗元婴以上、班级在读的弟子里修为最高的担任；连任最多两周，做满两周的这一轮不再当，换下一名；本宗够格的弟子都轮过一遍以后，再从头轮起。一周之内不换人，除非本周的宗主改投他宗、被解除或境界掉到元婴以下（当场补选）。从这条规则上线的那一周算第一周。学生页的宗门榜和云间灵田的宗门页会显示宗主的境界、修为和连任第几周（学生页不显示姓名，灵田里显示道号）。</p>
      ${weeks.length ? `<div class="tw-scroll"><table class="tw-table compact"><thead><tr><th>哪一周（周一）</th>${SECTS.map((sect) => `<th>${esc(sect.name)}</th>`).join('')}</tr></thead><tbody>${weeks.map((week) => `<tr><td class="tw-nowrap">${esc(weekText(week))}${week === sectTerms.week ? '（本周）' : ''}</td>${SECTS.map((sect) => {
        const item = history.find((row) => row.week === week && row.sect === sect.key);
        return `<td class="tw-nowrap">${item ? `${esc(item.name || item.sid)}${String(item.class_id) === classId ? '' : `<small>（${esc(item.class_name || '别的班')}）</small>`} · 第 ${Number(item.weeks) || 1} 周` : '—'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>还没有任期记录。</p>'}</details>`;
    box.innerHTML = `<p>宗门榜（本课程历届，已有 ${years} 个班的弟子；散修 ${sanxiu.length} 人，本班 ${sanxiu.filter((row) => String(row.class_id) === classId).length} 人）：宗门分＝历届弟子修为之和，每次结算时同步。</p>`
      + list.map((row) => `<div class="tw-sect-card" style="--sc:${row.color}"><b>${esc(row.mark)}</b><strong><em>${row.rank}</em>${esc(row.name)}</strong>
        <span>宗门分 <b>${row.points}</b> · 历届 ${row.members} 人 · 本班 ${row.classMembers} 人（${row.classPoints}）</span>${lordLine(row.key)}</div>`).join('') + termTable;
  }
  const sectCell = (sid) => {
    const row = sectRows.find((item) => String(item.class_id) === String(state.klass.id) && sidKey(item.sid) === sid);
    return row ? `${sectChip(row.sect)}${Number(row.changes) >= 1 ? '<small title="已用掉唯一一次改投机会">已改投</small>' : ''}<button type="button" data-sect-reset="${esc(row.id)}" title="解除这位同学的宗门选择，让其重新选择（宗门分随之减去其修为，改投机会也恢复）">解除</button>` : '';
  };
  let realmResult = null;   // 计算结果；saved 为真时是先显示的“上次结算”（见 showSavedRealms），还在重新计算
  let realmSaved = '';
  let settleTimer = 0;
  let realmBusy = 0;   // 正在重新计算的次数
  const savedNote = () => {
    const at = realmResult && typeof realmResult.saved === 'number' ? realmResult.saved : 0;
    return `先显示上次结算${at ? `（${isoDay(at).slice(5)} ${clock(at).slice(0, 5)}）` : ''}的结果；正在按最新记录重新计算，算好了自动换成最新的……`;
  };
  // 先显示上次结算的结果（2026-11-26 提速）：后台 ck_realms 里本班每人一行（每次结算时写入），一下就读到。点开“修为境界”时先按它画出修为表，
  // 同时按最新记录重新计算，算好了换成最新的。上次结算的表里没有核查提示（要重新计算才有），也不能导出
  async function showSavedRealms() {
    if (realmResult || !state.klass || PLAIN) return;
    const klass = state.klass;
    try {
      const saved = await backend.fetchAll('realms', { course: course.slug, class_id: Number(klass.id) || klass.id });
      if (realmResult || state.klass !== klass || !saved.length) return;
      const roster = new Set(rosterOf().map((person) => sidKey(person.sid)));
      const Live = window.ClassLive;
      const titleOf = (realm, stage) => (Live.stageTitle ? Live.stageTitle(realm, stage) : (REALMS[realm] || {}).name || '');
      const rows = saved.map((row) => {
        const realm = Number(row.realm) || 0;
        const stage = Number(row.stage) || 0;
        return { sid: sidKey(row.sid), name: row.name || '', points: Number(row.points) || 0, max: Number(row.max_points) || realmMax(), realm, stage,
          title: titleOf(realm, stage), inRoster: !roster.size || roster.has(sidKey(row.sid)), owners: 0, excused: 0, detail: row.detail || {}, flags: [], more: {} };
      }).sort((a, b) => b.points - a.points);
      realmResult = { saved: Math.max(0, ...saved.map((row) => millis(row.updated_at))) || true, rows };
      if (realmBusy) $('[data-realm-status]').textContent = savedNote();
      if (!$('[data-panel="realm"]').hidden) renderRealms();
    } catch (error) {
      console.warn('[修为境界] 上次结算的结果没有读到：', error);
    }
  }
  // 2026-11-11 重排：顶部境界阶梯（人数、门槛、占全班比例）、表格名次奖牌、修为进度条、提示标签
  // 核查提示（2026-11-22 起“N 台设备登录过”“N 处文字作答与他人相同”可以点开看明细：用户“最好能够显示或者链接到相同的地方。
  // 比如点击一下就能展开到相同的地方，显示跟谁相同等”）。展开的明细排在这位同学那一行下面，搜索、重新计算后仍保持展开
  const realmOpen = new Map();   // 学号 → 'devices' | 'same'
  const realmFlagKind = (flag) => (/台设备登录过$/.test(flag) ? 'devices' : /文字作答与他人相同$/.test(flag) ? 'same' : '');
  const realmFlagHtml = (flag, row) => {
    const kind = realmFlagKind(flag);
    if (kind && row && row.more && row.more[kind] && row.more[kind].length) {
      const open = realmOpen.get(row.sid) === kind;
      return `<button type="button" class="tw-rm-flag is-more${open ? ' is-open' : ''}" data-rm-more="${kind}" data-sid="${esc(row.sid)}" aria-expanded="${open}" title="${open ? '收起明细' : '点一下看明细'}">${esc(flag)}<i aria-hidden="true">${open ? '▴' : '▾'}</i></button>`;
    }
    return `<span class="tw-rm-flag${/^不在点名册|^请假/.test(flag) ? ' is-info' : ''}">${esc(flag)}</span>`;
  };
  const realmWhen = (ms) => (ms ? `${isoDay(ms).slice(5)} ${clock(ms).slice(0, 5)}` : '—');
  const LETTER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // 和本人写了同样一段话的同学，按他们写在哪一题分组（和本人同一题的排在前面）
  const realmSameGroups = (s) => {
    const groups = new Map();
    s.others.forEach((o) => {
      const key = o.wheres.join('；') || '（出处不详）';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    });
    const mine = s.mine.join('；');
    return Array.from(groups.entries()).sort(([a], [b]) => (b === mine) - (a === mine))
      .map(([key, people]) => `<div class="tw-rm-same-group"><i>${key === mine ? '和本人同一题' : esc(key)}</i><div>${people.map((o) => `<span class="tw-rm-person"><b>${esc(o.name || o.sid)}</b><small>${esc(o.sid)}</small></span>`).join('')}</div></div>`).join('');
  };
  function realmMoreRow(row) {
    const kind = realmOpen.get(row.sid);
    const list = kind && row.more && row.more[kind];
    if (!list || !list.length) return '';
    const who = esc(row.name || row.sid);
    let body;
    if (kind === 'devices') {
      const shared = list.filter((d) => d.others.length).length;
      body = `<h4>${who} 用 ${list.length} 台设备登录过本班课堂${shared ? `<em>其中 ${shared} 台还登录过别的同学</em>` : ''}</h4>
        <p class="tw-rm-more-note">每台新设备第一次登录都要输入本人的 4 位口令；同一台设备上还登录过别的同学的，标成红色——可能是借同学的手机，也可能是替人登录。</p>
        <div class="tw-rm-dev-wrap"><table class="tw-rm-dev"><thead><tr><th>设备</th><th>第一次登录</th><th>最近一次</th><th>登录次数</th><th>上过的课</th><th>这台设备上还登录过</th></tr></thead><tbody>
        ${list.map((d, i) => `<tr${d.others.length ? ' class="is-shared"' : ''}><td><b>设备 ${LETTER[i] || i + 1}</b></td><td>${realmWhen(d.first)}</td><td>${realmWhen(d.last)}</td><td class="is-num">${d.n}</td>`
          + `<td>${esc(d.units.join('、') || '—')}</td><td>${d.others.length ? d.others.map((o) => `<span class="tw-rm-person"><b>${esc(o.name || o.sid)}</b><small>${esc(o.sid)}</small></span>`).join('') : '<span class="tw-rm-none">没有</span>'}</td></tr>`).join('')}
        </tbody></table></div>`;
    } else {
      body = `<h4>${who} 有 ${list.length} 处文字作答和别人的一样</h4>
        <p class="tw-rm-more-note">去掉空格和标点以后，20 个字以上一字不差才算相同。下面是本人写的原文、出自哪一题，以及还有谁写了同样的话。</p>
        ${list.map((s, i) => `<div class="tw-rm-same"><div class="tw-rm-same-head"><span class="tw-rm-same-no">${i + 1}</span><span class="tw-rm-same-where">${(s.mine.length ? s.mine : ['（出处不详）']).map((w) => `<b>${esc(w)}</b>`).join('')}</span></div>
          <blockquote>${esc(s.text)}</blockquote>
          <div class="tw-rm-same-who"><span class="tw-rm-same-label">相同的还有 ${s.others.length} 人（按写在哪一题分组）</span>${realmSameGroups(s)}</div></div>`).join('')}`;
    }
    return `<tr class="tw-rm-more-row"><td colspan="14"><div class="tw-rm-more is-${kind}">${body}<div class="tw-rm-more-foot"><button type="button" class="tw-rm-more-close" data-rm-more="${kind}" data-sid="${esc(row.sid)}">收起明细</button></div></div></td></tr>`;
  }
  const numCell = (value) => `<td class="is-num${Number(value) ? '' : ' is-zero'}">${esc(String(value == null ? 0 : value))}</td>`;
  // 2026-11-22 第二档美化：签到与请假、作答完成与作答正确各并成一列，上下两行各带小字标签（修为表少两列，宽屏上不用再左右拖；导出的修为表照旧分列）
  const pairCell = (...pairs) => `<td class="is-num is-pair">${pairs.map(([label, value]) => `<span class="tw-rm-kv${Number(value) ? '' : ' is-zero'}"><i>${label}</i>${esc(String(value == null ? 0 : value))}</span>`).join('')}</td>`;
  function renderRealms() {
    const box = $('[data-realm-rows]');
    if (!box) return;
    const max = realmMax();
    const meetings = realmUnits().reduce((s, u) => s + u.meetings, 0);
    const counts = realmResult ? REALMS.map((realm) => realmResult.rows.filter((row) => row.inRoster && row.realm === realm.level).length) : null;
    const rosterN = realmResult ? realmResult.rows.filter((row) => row.inRoster).length : 0;
    $('[data-realm-legend]').innerHTML = REALMS.map((realm, i) => {
      const n = counts ? counts[i] : null;
      const share = counts && rosterN ? Math.round((n / rosterN) * 100) : 0;
      return `<div class="tw-rm-step is-r${realm.level}" style="--h:${realm.level}">${realmChip(realm.level)}
        <b>${n == null ? '—' : n}<small>人</small></b>
        <span>${realm.min ? `≥ ${Math.ceil(realm.min * max)} 修为 · ${Math.round(realm.min * 100)}%` : '起步'}</span>
        <span>${esc(realm.look || '')}${counts ? ` · 占 ${share}%` : ''}</span>
        <span class="tw-rm-share" title="占本班点名册 ${share}%"><i style="width:${share}%"></i></span></div>`;
    }).join('');
    const last = Number(store.get(`realm-saved:${course.slug}:${state.klass && state.klass.id}`)) || 0;
    const lastText = last ? `上次结算 <b>${esc(`${isoDay(last).slice(5)} ${clock(last).slice(0, 5)}`)}</b>` : '还没有在这台电脑上结算过';
    $('[data-realm-summary]').innerHTML = `本班上课范围：<b>${esc(scopeText(state.klass))}</b>（在“导出与清理 → 班级”里设置） · 共 <b>${meetings}</b> 次课 · 满分 <b>${max}</b> 修为`
      + `${realmResult && !realmResult.saved ? ` · 已上过 <b>${realmResult.units}/${realmResult.total}</b> 个${UNIT}` : ''} · ${lastText}。`
      + `<br>每次课 100：签到 20、作答完成 35、作答正确 35、弹幕最多 10；请假的课计 ${POINTS.leave}（请假的同学之后用那次课的课堂码登录可以补交题目，作答照常计修为），没登录也没请假的课不得修为；老师点赞、猜词、猜谜、PK、辩论、经营沙盘、匿名建议、修炼场是额外奖励（见下方规则）。${esc(realmSaved)}`;
    const countBox = $('[data-realm-count]');
    if (!realmResult) {
      if (countBox) countBox.textContent = '点“重新计算”查看本班修为。';
      box.innerHTML = '';
      return;
    }
    const query = $('[data-realm-search]').value.trim().toUpperCase();
    const rows = realmResult.rows.filter((row) => !query || row.sid.includes(query) || String(row.name).toUpperCase().includes(query));
    if (countBox) countBox.textContent = `点名册 ${rosterN} 人${realmResult.rows.length > rosterN ? `，另有 ${realmResult.rows.length - rosterN} 人不在点名册（灰色，不结算）` : ''}${query ? ` · 找到 ${rows.length} 人` : ''}`;
    // 名次：按修为并列（与修为榜一致），只给点名册上的同学
    const ranked = realmResult.rows.filter((row) => row.inRoster);
    const rankOf = (row) => (row.inRoster ? 1 + ranked.filter((other) => other.points > row.points).length : null);
    box.innerHTML = rows.map((row) => {
      const rank = rankOf(row);
      const ratio = Math.max(0, Math.min(100, pct(row.points, row.max)));
      return `<tr class="${row.inRoster ? '' : 'is-muted'}"><td><span class="tw-rm-no${rank && rank <= 3 && row.points > 0 ? ` is-${rank}` : ''}">${rank || '—'}</span></td><td>${esc(row.sid)}</td><td>${esc(row.name)}</td>
      <td>${realmChip(row.realm, row.title)}</td><td class="tw-sect-cell">${sectCell(row.sid)}</td>
      <td><div class="tw-rm-pts"><span><b>${row.points}</b><small> / ${row.max}（${pct(row.points, row.max)}%）</small></span><span class="tw-rm-pbar"><i class="is-r${row.realm}" style="width:${ratio}%"></i></span></div></td>
      ${pairCell(['签到', row.detail.attend], ['请假', row.detail.leave || 0])}${pairCell(['完成', row.detail.done], ['正确', row.detail.right])}${numCell(row.detail.danmaku)}${numCell(row.detail.like || 0)}${numCell(row.detail.game || 0)}${numCell(row.detail.practice || 0)}${numCell(row.detail.lingtian || 0)}
      <td class="tw-realm-flags">${row.flags.map((flag) => realmFlagHtml(flag, row)).join('')}</td></tr>${realmMoreRow(row)}`;
    }).join('')
      || '<tr><td colspan="14" class="empty">本班还没有学生记录。</td></tr>';
    renderSects();
  }
  async function refreshRealms(save, quiet) {
    if (!state.klass) return;
    const status = $('[data-realm-status]');
    if (!quiet) status.textContent = realmResult && realmResult.saved ? savedNote() : '正在读取本班各次课的记录并计算……';
    realmBusy += 1;
    try {
      realmResult = await computeRealms();
      await loadSects();
      if (save) {
        const rows = realmResult.rows.filter((row) => row.inRoster)
          .map((row) => ({ sid: row.sid, name: row.name, points: row.points, max: row.max, realm: row.realm, stage: row.stage, detail: row.detail }));
        await backend.rpc('ck_save_realms', { p_course: course.slug, p_class: Number(state.klass.id) || state.klass.id, p_rows: rows });
        store.set(`realm-saved:${course.slug}:${state.klass.id}`, String(Date.now()));
        realmSaved = ` 已于 ${clock(Date.now())} 更新 ${rows.length} 位同学的称号。`;
        await loadSects();   // 结算时后台已同步宗门弟子的修为
      }
      if (!quiet || save) status.textContent = save ? `已结算并更新称号（${clock(Date.now())}）。学生刷新页面后看到新境界。` : '已重新计算（尚未保存）。点“结算修为并更新学生称号”后学生端才会更新。';
    } catch (error) {
      console.error(error);
      status.textContent = missingTable(error) || /PGRST202|42883|Could not find the function/i.test(String((error && error.message) || error))
        ? '修为境界的数据表还没有建好：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261010-修为境界.sql。'
        : `结算失败：${failReason(error)}${realmResult && realmResult.saved ? '（下面是上次结算的结果）' : ''}`;
    } finally {
      realmBusy -= 1;
    }
    renderRealms();
  }
  $('[data-tab="realm"]').addEventListener('click', () => {
    if (realmResult && !realmResult.saved) { renderRealms(); return; }
    showSavedRealms();
    refreshRealms(false);
  });
  $('[data-realm-refresh]').addEventListener('click', () => refreshRealms(false));
  $('[data-realm-save]').addEventListener('click', () => refreshRealms(true));
  $('[data-realm-search]').addEventListener('input', renderRealms);
  $('[data-realm-rows]').addEventListener('click', (event) => {
    const more = event.target.closest('[data-rm-more]');
    if (!more) return;
    const { sid } = more.dataset;
    const kind = more.dataset.rmMore;
    if (realmOpen.get(sid) === kind) realmOpen.delete(sid); else realmOpen.set(sid, kind);
    renderRealms();
    const again = $(`[data-realm-rows] .tw-rm-flag[data-rm-more="${kind}"][data-sid="${CSS.escape(sid)}"]`);
    if (again) again.focus({ preventScroll: true });
  });
  $('[data-realm-rows]').addEventListener('click', async (event) => {
    const reset = event.target.closest('[data-sect-reset]');
    if (!reset) return;
    const row = sectRows.find((item) => String(item.id) === reset.dataset.sectReset);
    if (!row || !window.confirm(`解除 ${row.name || row.sid} 的选择（${sectName(row.sect)}）？解除后这位同学可以重新拜入宗门或做散修（改投机会也恢复），${sectName(row.sect)}的宗门分减去其修为。`)) return;
    reset.disabled = true;
    try {
      await backend.removeAll('sectmembers', { id: Number(row.id) || row.id });
      await loadSects();
    } catch (error) {
      console.error(error);
      window.alert(`没有解除成功：${error.message || error}`);
    }
    renderRealms();
  });
  $('[data-realm-export]').addEventListener('click', () => {
    if (!realmResult || realmResult.saved) return;   // 先显示的“上次结算”不导出，等重新计算好
    const sectOfSid = (sid) => { const row = sectRows.find((item) => String(item.class_id) === String(state.klass.id) && sidKey(item.sid) === sid); return row ? sectName(row.sect) : ''; };
    const rows = realmResult.rows.map((row, i) => [i + 1, row.sid, row.name, row.title, sectOfSid(row.sid), row.points, row.max, row.detail.attend, row.detail.leave || 0, row.detail.done,
      row.detail.right, row.detail.danmaku, row.detail.like || 0, row.detail.game || 0, row.detail.practice || 0, row.detail.lingtian || 0, row.flags.join('；')]);
    download(`${course.title}_${safeName(state.klass.name)}_修为境界_${window.ClassLive.today()}.csv`,
      csv([['名次', '学号', '姓名', '境界', '宗门', '修为', '满分', '签到', '请假', '作答完成', '作答正确', '弹幕', '点赞（额外）', '猜词第一、猜谜抢答、PK 胜者、辩论获胜、经营沙盘、匿名建议（含点赞采纳）、点笑脸、每周登录（额外）', '修炼场（额外）', '云间灵田服丹（额外）', '提示'], ...rows]));
  });
  // ---------------- 修炼场题库（2026-10-22）：工作台里带着本课程题库（gzip＋base64），按单元版本号同步到后台 ----------------
  const PRACTICE = window.ClassLive.PRACTICE || { delay: 3, essayMin: 200, of: () => ({ cap: 3, item: 1 }) };
  const missingFunction = (error) => /PGRST202|42883|Could not find the function/i.test(`${(error && error.code) || ''} ${(error && error.message) || error || ''}`);
  const practiceSynced = new Set();
  async function unpackPractice(gz) {
    const bytes = Uint8Array.from(atob(gz), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
  // 三份题库都带在工作台里：修炼场题库（ck_practice_*）、题目解答（ck_explain_*，学生递交后、筑基以上可展开）、回温题库（ck_review_*，2026-11-18）
  const BANKS = [
    { field: 'practice', name: '修炼场题库', versions: 'ck_practice_versions', sql: 'cloudbase-pg-20261022-修炼场.sql',
      load: (u) => ['ck_practice_load', { p_course: course.slug, p_unit: u.unit, p_title: u.title, p_order: u.order, p_version: u.version, p_items: u.items }],
      clear: (unit) => ['ck_practice_load', { p_course: course.slug, p_unit: unit, p_title: unit, p_order: 0, p_version: 'gone', p_items: [] }] },
    { field: 'explain', name: '题目解答', versions: 'ck_explain_versions', sql: 'cloudbase-pg-20261022-题目解答.sql',
      load: (u) => ['ck_explain_load', { p_course: course.slug, p_unit: u.unit, p_version: u.version, p_items: u.items }],
      clear: (unit) => ['ck_explain_load', { p_course: course.slug, p_unit: unit, p_version: 'gone', p_items: [] }] },
    // 回温题库（2026-11-18）：课堂选择类题目的题干、选项和参考答案，学生在案例页出门测后面的“回温”里重做自己做错的题（见 tools/review_bank.py）
    { field: 'review', name: '回温题库', versions: 'ck_review_versions', sql: 'cloudbase-pg-20261118-回温.sql',
      load: (u) => ['ck_review_load', { p_course: course.slug, p_unit: u.unit, p_version: u.version, p_items: u.items }],
      clear: (unit) => ['ck_review_load', { p_course: course.slug, p_unit: unit, p_version: 'gone', p_items: [] }] },
  ];
  async function syncBank(bank, force) {
    const pack = course[bank.field];
    if (!pack) return '';
    const size = `${Object.keys(pack.versions).length} 个${UNIT}、${pack.items} 题`;
    try {
      const current = (await backend.rpc(bank.versions, { p_course: course.slug })) || {};
      const changed = Object.keys(pack.versions).filter((unit) => force || current[unit] !== pack.versions[unit]);
      const gone = Object.keys(current).filter((unit) => !(unit in pack.versions));
      if (!changed.length && !gone.length) return `${bank.name}：已是最新（${size}）`;
      const data = await unpackPractice(pack.gz);
      for (const u of data.units.filter((x) => changed.includes(x.unit))) {
        const [name, params] = bank.load(u);
        await backend.rpc(name, params);
      }
      for (const unit of gone) {
        const [name, params] = bank.clear(unit);
        await backend.rpc(name, params);
      }
      return `${bank.name}：已同步（${size}，本次更新 ${changed.length} 个${UNIT}）`;
    } catch (error) {
      practiceSynced.delete(course.slug);
      return missingTable(error) || missingFunction(error)
        ? `${bank.name}：后台还没有建好，请先在云开发 SQL 编辑器执行 tools/${bank.sql}`
        : `${bank.name}同步失败：${failReason(error)}`;
    }
  }
  async function syncPractice(force) {
    if (PLAIN) return;   // 《金融机构与市场》没有修炼场、题目解答、回温题库
    const status = $('[data-practice-status]');
    if (!backend || (!force && practiceSynced.has(course.slug))) return;
    practiceSynced.add(course.slug);
    if (status) status.textContent = '正在核对修炼场题库、题目解答和回温题库……';
    const lines = [];
    for (const bank of BANKS) lines.push(await syncBank(bank, force));
    if (status) status.textContent = `${lines.filter(Boolean).join('；')}（${clock(Date.now())}）。`;
  }
  const practiceButton = $('[data-practice-sync]');
  if (practiceButton) practiceButton.addEventListener('click', () => syncPractice(true));

  // 打开班级时：距上次结算超过 6 小时就在后台自动结算一次（老师每周发布课堂时都会打开工作台）
  async function autoSettle() {
    if (PLAIN) return;   // 《金融机构与市场》没有修为境界
    const last = Number(store.get(`realm-saved:${course.slug}:${state.klass && state.klass.id}`)) || 0;
    if (!state.klass || Date.now() - last < 6 * 3600 * 1000) return;
    await refreshRealms(true, true);
  }
  renderRealms();

  // ---------------- 登录安全 ----------------
  // 班外加入申请（允许后加进点名册）、口令状态（解锁、重置）、最近安全记录、教师登录记录；
  // 工作台打开时每 10 秒查一次申请和锁定，课堂卡片下方醒目提示
  const SEC_KIND = {
    bad_code: '课堂码错误', bad_sid: '学号不在点名册上（已提示核对姓名和学号）', bad_name: '姓名与点名册不符', bad_pin: '口令错误', locked: '口令连续输错 10 次，锁定',
    pin_set: '设置口令', new_device: '新设备登录（口令正确）', request: '申请加入（不在点名册上）', approve: '老师允许加入',
    reject: '老师拒绝或撤销加入', audit: '老师允许旁听', pin_reset: '老师重置口令', unlock: '老师解锁', rotate: '更换课堂码', teacher_login: '教师登录',
    view_past: '用历史课堂码进来查看', pin_forgot: '忘记口令，申请重设', pin_allow: '老师同意重设口令', pin_deny: '老师没有同意重设口令',
  };
  const SEC_BAD = new Set(['bad_sid', 'bad_name', 'bad_pin', 'locked', 'request', 'pin_forgot']);
  const sec = { requests: [], pinreqs: [], pins: [], log: [], teacher: [], visits: [], visitProblem: '', codeFails: 0, problem: '', loaded: false };
  // 忘记口令申请：待处理的，和 3 天内同意过的（等学生用申请的那台设备设新口令）；拒绝的不再显示（学生再次申请会重新出现）
  const pinreqShown = () => sec.pinreqs.filter((row) => row.status === 'pending' || (row.status === 'approved' && Date.now() - millis(row.decided_at) < 3 * 86400000));
  const stamp = (value) => (value ? `${isoDay(millis(value)).slice(5)} ${clock(millis(value))}` : '');
  const secClassId = () => Number(state.klass.id) || state.klass.id;
  async function loadSecurity(full) {
    if (!state.klass || $('[data-app]').hidden) return;
    try {
      sec.requests = (await backend.fetchAll('requests', { class_id: secClassId() })).sort((a, b) => millis(b.created_at) - millis(a.created_at));
      try {
        sec.pinreqs = (await backend.fetchAll('pinreqs', { class_id: secClassId() })).sort((a, b) => millis(b.created_at) - millis(a.created_at));
      } catch (error) { if (!missingTable(error)) throw error; sec.pinreqs = []; }   // 还没执行 2026-10-28 的 SQL 时没有这张表
      let pins = await backend.rpc('ck_pin_status', { p_class: secClassId() });
      sec.pins = Array.isArray(pins) ? pins : [];
      sec.codeFails = (await backend.fetchAll('seclog', { kind: 'bad_code' }, { since: ['at', new Date(Date.now() - 10 * 60000).toISOString()], limit: 300 })).length;
      if (full) {
        sec.log = await backend.fetchAll('seclog', { class_id: secClassId() }, { limit: 200 });
        sec.teacher = await backend.fetchAll('seclog', { kind: 'teacher_login' }, { limit: 20 });
        // 登录与在线记录（2026-11-05）：本班最近 300 段；后台还没有这张表时提示执行 SQL
        try {
          sec.visits = await backend.fetchAll('visits', { class_id: secClassId() }, { limit: 300 });
          sec.visitProblem = '';
        } catch (error) {
          if (!missingTable(error)) throw error;
          sec.visits = [];
          sec.visitProblem = '登录与在线记录还没有开通：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261105-学习记录.sql。';
        }
      }
      sec.problem = '';
      sec.loaded = true;
    } catch (error) {
      console.warn('[登录安全]', error);
      sec.problem = missingTable(error) || /ck_pin_status|function/i.test(String((error && error.message) || error))
        ? '后台还没有升级“登录安全”：请先执行 tools/cloudbase-pg-20261010-登录安全.sql。'
        : `读取登录安全信息失败：${failReason(error)}`;
    }
    renderSecurity();
  }
  function renderSecAlert() {
    const box = $('[data-sec-alert]');
    const lines = [];
    const room = state.room;
    if (room && room.is_current && !rosterOf().length) lines.push('<p>本班还没有上传点名册：学生现在不能登录。请在“加入名单”里上传点名册。<button type="button" data-sec-go="checkins">去上传</button></p>');
    const pending = sec.requests.filter((row) => row.status === 'pending').length;
    if (pending) lines.push(`<p>有 ${pending} 位不在点名册上的同学申请旁听本班课堂，允许后才能登录。<button type="button" data-sec-go="security">去处理</button></p>`);
    const forgot = sec.pinreqs.filter((row) => row.status === 'pending').length;
    if (forgot) lines.push(`<p>有 ${forgot} 位同学换了设备又忘记口令，申请重设口令。<button type="button" data-sec-go="security">去处理</button></p>`);
    const locked = sec.pins.filter((row) => row.locked_until && millis(row.locked_until) > Date.now()).length;
    const hard = sec.pins.filter((row) => row.locked_until && millis(row.locked_until) > Date.now() && row.locks >= 3).length;
    if (locked) lines.push(`<p>${locked} 个学号因口令输错次数过多被锁定${hard ? `（其中 ${hard} 个须老师解锁）` : '（到时自动解锁）'}。<button type="button" data-sec-go="security">查看</button></p>`);
    if (sec.codeFails >= 30) lines.push(`<p>最近 10 分钟全站课堂码输错 ${sec.codeFails} 次，可能有人在猜课堂码。如果课堂码已外传，可点课堂码下方的“更换课堂码”。</p>`);
    const html = lines.join('');
    if (box.innerHTML !== html) box.innerHTML = html;   // 内容没变就不重画（每 10 秒刷新时按钮不会被换掉）
    box.hidden = !lines.length;
    $('[data-tab="security"]').textContent = pending || forgot || locked ? `登录安全（${pending + forgot + locked}）` : '登录安全';
  }
  $('[data-sec-alert]').addEventListener('click', (event) => {
    const go = event.target.closest('[data-sec-go]');
    if (!go) return;
    const tab = $(`[data-tab="${go.dataset.secGo}"]`);
    if (tab) { tab.click(); tab.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  function renderSecurity() {
    renderSecAlert();
    const status = $('[data-sec-status]');
    if (sec.problem) {
      status.textContent = sec.problem;
      return;
    }
    const roster = rosterOf();
    const byName = new Map(roster.map((person) => [person.name, person]));
    // 班外加入申请：拒绝过的不再显示，学生再次申请才重新出现（2026-10-28 用户要求）
    const reqs = sec.requests.filter((row) => row.status !== 'rejected');
    const waiting = reqs.filter((row) => row.status === 'pending').length;
    const auditing = reqs.filter((row) => row.status === 'audit').length;
    $('[data-sec-req-count]').textContent = reqs.length ? `待处理 ${waiting}${auditing ? ` · 旁听 ${auditing}` : ''}${reqs.length > waiting + auditing ? ` · 加进点名册 ${reqs.length - waiting - auditing}` : ''}` : '';
    $('[data-sec-requests]').innerHTML = reqs.map((row) => {
      const twin = byName.get(row.name);
      const note = twin && sidKey(twin.sid) !== sidKey(row.sid) ? `<span class="tw-sec-tag">点名册上有同名同学（学号 ${esc(twin.sid)}），可能填错了学号</span>` : '';
      // 2026-11-05：允许分两种——“允许旁听”（默认：只能看内容、做题，不进点名册、不计统计和修为）和“加进点名册”（重修等，计入统计）
      const label = { pending: statusTag('待处理', 'warn'), approved: statusTag('已加进点名册', 'ok'), audit: statusTag('旁听中', 'info'), rejected: statusTag('已拒绝') }[row.status] || esc(row.status);
      const actions = row.status === 'pending'
        ? `<button type="button" class="tw-secondary" data-sec-audit="${esc(row.id)}">允许旁听</button><button type="button" class="tw-secondary" data-sec-allow="${esc(row.id)}">加进点名册</button><button type="button" class="tw-secondary" data-sec-reject="${esc(row.id)}">拒绝</button>`
        : row.status === 'audit'
          ? `<button type="button" class="tw-secondary" data-sec-allow="${esc(row.id)}">改为加进点名册</button><button type="button" class="tw-secondary" data-sec-reject="${esc(row.id)}">撤销旁听</button>`
          : `<button type="button" class="tw-secondary" data-sec-audit="${esc(row.id)}">改为旁听</button><button type="button" class="tw-secondary" data-sec-reject="${esc(row.id)}">撤销允许</button>`;
      return `<tr><td>${esc(stamp(row.created_at))}</td><td>${esc(row.sid)}</td><td>${esc(row.name)}${note}</td><td>${esc(row.class_name || '')}</td><td>${label}</td><td>${actions}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">没有班外旁听申请。学号不在点名册上的同学，登录页只提示核对姓名和学号；确实不在名单上（跨班旁听、自学等）才会点“申请旁听”。</td></tr>';

    const asks = pinreqShown();
    const asking = asks.filter((row) => row.status === 'pending').length;
    $('[data-sec-pinreq-count]').textContent = asks.length ? `待处理 ${asking}` : '';
    $('[data-sec-pinreqs]').innerHTML = asks.map((row) => {
      const label = row.status === 'pending' ? statusTag('待处理', 'warn') : `${statusTag('已同意', 'ok')}<small class="tw-sub">${esc(stamp(row.decided_at))}，等该生在申请的那台设备上设新口令</small>`;
      const actions = row.status === 'pending'
        ? `<button type="button" class="tw-secondary" data-sec-pin-allow="${esc(row.id)}">同意重设</button><button type="button" class="tw-secondary" data-sec-pin-deny="${esc(row.id)}">拒绝</button>`
        : '';
      return `<tr><td>${esc(stamp(row.created_at))}</td><td>${esc(row.sid)}</td><td>${esc(row.name)}</td><td>${label}</td><td>${actions}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="empty">没有忘记口令的申请。学生换了设备又忘记口令时，可以在登录页点“忘记口令”申请重设。</td></tr>';

    const pins = new Map(sec.pins.map((row) => [sidKey(row.sid), row]));
    const query = $('[data-sec-search]').value.trim();
    const filter = $('[data-sec-filter]').value;
    const now = Date.now();
    const rows = roster.map((person, index) => ({ person, index, pin: pins.get(sidKey(person.sid)) }))
      .filter(({ person }) => !query || [person.sid, person.name].some((value) => String(value || '').includes(query)))
      .filter(({ pin }) => {
        const locked = pin && pin.locked_until && millis(pin.locked_until) > now;
        if (filter === 'alert') return Boolean(locked || (pin && pin.fails > 0));
        if (filter === 'nopin') return !pin || !pin.has_pin;
        if (filter === 'multi') return Boolean(pin && pin.devices >= 3);
        return true;
      });
    $('[data-sec-pins]').innerHTML = rows.map(({ person, index, pin }) => {
      const locked = pin && pin.locked_until && millis(pin.locked_until) > now;
      const cond = locked && pin.locks >= 3 ? statusTag('锁定（多次输错，须老师解锁）', 'bad')
        : locked ? statusTag(`锁定到 ${clock(millis(pin.locked_until)).slice(0, 5)}（第 ${pin.locks || 1} 次）`, 'bad')
        : pin && pin.fails > 0 ? statusTag(`已连续输错 ${pin.fails} 次`, 'warn') : statusTag('正常', 'ok');
      const actions = [
        locked || (pin && pin.fails > 0) ? `<button type="button" class="tw-secondary" data-sec-unlock="${esc(person.sid)}">解锁</button>` : '',
        pin ? `<button type="button" class="tw-secondary" data-sec-reset="${esc(person.sid)}" data-sec-name="${esc(person.name)}">重置口令</button>` : '',
      ].join('');
      return `<tr><td>${index + 1}</td><td>${esc(person.sid)}</td><td>${esc(person.name)}${person.extra ? '<span class="tw-sec-tag">班外</span>' : ''}</td>
        <td>${pin && pin.has_pin ? `已设置${pin.set_at ? `（${esc(isoDay(millis(pin.set_at)).slice(5))}）` : ''}` : '还没设'}</td>
        <td>${pin ? `${pin.devices} 台` : ''}</td><td>${esc(stamp(pin && pin.last_at))}</td><td>${cond}</td><td>${actions}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="empty">${roster.length ? '没有符合条件的学生。' : '本班还没有点名册。'}</td></tr>`;
    const lockedCount = sec.pins.filter((row) => row.locked_until && millis(row.locked_until) > now).length;
    status.textContent = roster.length
      ? `点名册 ${roster.length} 人：已设口令 ${sec.pins.filter((row) => row.has_pin).length} 人${lockedCount ? `，锁定中 ${lockedCount} 人` : ''}。“重置口令”会同时让该生所有设备退出，下次登录重新设口令。`
      : '';

    const day = Date.now() - 24 * 3600 * 1000;
    const recent = sec.log.filter((row) => millis(row.at) > day);
    const count = (kind) => recent.filter((row) => row.kind === kind).length;
    $('[data-sec-summary]').textContent = `最近 24 小时本班：口令错误 ${count('bad_pin')} 次、锁定 ${count('locked')} 次、学号不在点名册 ${count('bad_sid')} 次、姓名不符 ${count('bad_name')} 次、班外申请 ${count('request')} 次、忘记口令申请 ${count('pin_forgot')} 次、新设备登录 ${count('new_device')} 次；全站最近 10 分钟课堂码错误 ${sec.codeFails} 次。`
      + '（这里只记安全相关的事件：口令错误、锁定、新设备、设置口令、申请等；平常的登录和打开页面不记，见上面的“登录与在线记录”。）';
    renderVisits();
    $('[data-sec-log]').innerHTML = sec.log.slice(0, 100).map((row) => `<tr><td>${esc(stamp(row.at))}</td>
      <td class="${SEC_BAD.has(row.kind) ? 'warn' : ''}">${esc(SEC_KIND[row.kind] || row.kind)}${row.kind === 'locked' && row.detail ? `（${esc(row.detail)}）` : ''}</td><td>${esc(row.sid || '')}</td><td>${esc(row.name || '')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="empty">还没有记录。</td></tr>';
    // detail 开头的“[方式]”是 2026-11-04 起记的（密码登录 / 打开工作台 / 打开投屏页），以前的记录都是输密码登录
    $('[data-sec-teacher]').innerHTML = sec.teacher.map((row) => {
      const how = (String(row.detail || '').match(/^\[([^\]]+)\]/) || [])[1] || '密码登录';
      return `<tr><td>${esc(stamp(row.at))}</td><td>${esc(how)}</td><td>${esc(browserOf(String(row.detail || '').replace(/^\[[^\]]+\]\s*/, '')))}</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="empty">还没有记录（下次打开工作台时开始记录）。</td></tr>';
  }
  // ---------------- 登录与在线记录（2026-11-05 用户：“‘最近登录’和‘最近安全记录’的数据为什么不同步啊？……我想掌握学生的登录和学习状态数据，
  // 后续可以生成一些分析图片之类的。”）：ck_visits 每一段在线一行；“导出学习数据”生成多表 Excel 供分析 ----------------
  const VISIT_KIND = { login: '口令登录', open: '直接打开', back: '回到页面', view: '查看历史课堂' };
  const minutesOf = (seconds) => Math.round((Number(seconds) || 0) / 6) / 10;   // 保留一位小数
  // 0 秒不再显示“—”（2026-11-20 用户：“有的同学总是显示‘-’”）：这一段还没来得及报到就离开了，写“不到 1 分钟”；
  // 用历史课堂码查看的（view）后台不累计时长，写“不计时”
  // 2026-11-21 起“查看历史课堂”也计时：这以前的查看记录没有时长，写“未计时”
  const VIEW_TIMED = Date.parse('2026-11-21T00:00:00+08:00');
  const durText = (seconds, kind, started) => { const s = Number(seconds) || 0; return s < 60 ? (s ? `${s} 秒` : (kind === 'view' && millis(started) < VIEW_TIMED ? '未计时' : '不到 1 分钟')) : `${Math.round(s / 60)} 分钟`; };
  function renderVisits() {
    const box = $('[data-visit-rows]');
    if (!box) return;
    const query = ($('[data-visit-search]').value || '').trim().toUpperCase();
    const roomName = new Map(state.rooms.map((room) => [String(room.id), room.name]));
    const rows = sec.visits.slice().sort((a, b) => millis(b.started_at) - millis(a.started_at))
      .filter((row) => !query || String(row.sid).toUpperCase().includes(query) || String(row.name || '').toUpperCase().includes(query));
    const day = Date.now() - 24 * 3600 * 1000;
    const recent = sec.visits.filter((row) => millis(row.last_at) > day && !row.auditor);
    $('[data-visit-count]').textContent = sec.visitProblem ? '' : `（最近 24 小时 ${new Set(recent.map((row) => sidKey(row.sid))).size} 人、${recent.length} 段，在线合计约 ${Math.round(recent.reduce((t, row) => t + (Number(row.seconds) || 0), 0) / 60)} 分钟）`;
    box.innerHTML = sec.visitProblem ? `<tr><td colspan="7" class="empty">${esc(sec.visitProblem)}</td></tr>`
      : rows.slice(0, 80).map((row) => `<tr><td>${esc(stamp(row.started_at))}</td><td>${esc(clock(millis(row.last_at)))}</td><td>${esc(durText(row.seconds, row.kind, row.started_at))}</td>
        <td>${esc(row.sid)}</td><td>${esc(row.name || '')}${row.auditor ? ' <small>旁听</small>' : ''}</td><td>${esc(roomName.get(String(row.classroom)) || row.unit || '')}</td><td>${esc(VISIT_KIND[row.kind] || row.kind)}</td></tr>`).join('')
        || `<tr><td colspan="7" class="empty">${query ? '没有符合条件的记录。' : '还没有记录：学生下次登录或打开章节页时开始记录。'}</td></tr>`;
  }
  $('[data-visit-search]').addEventListener('input', renderVisits);

  // 导出学习数据：本班全部课堂（不含旁听），五张表
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const timeParts = (ms) => {
    const d = new Date(ms);
    const day = isoDay(ms);
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(d)) % 24;
    const week = `周${WEEK[new Date(`${day}T12:00:00+08:00`).getUTCDay()]}`;
    return { day, hour, week, text: `${day} ${clock(ms)}` };
  };
  // 读取本班全部课堂的学习记录（导出学习数据、学情分析共用；60 秒内重复使用）：只含点名册上的同学，不含旁听
  let learnCache = null;
  async function loadLearning(force) {
    const key = `${course.slug}:${state.klass.id}`;
    if (!force && learnCache && learnCache.key === key && Date.now() - learnCache.at < 60000) return learnCache.data;
    const rooms = state.rooms;
    const roomOf = new Map(rooms.map((room) => [String(room.id), room]));
    const inClass = (doc) => roomOf.has(String(doc.classroom));
    const roster = rosterOf();
    const rosterName = new Map(roster.map((person) => [sidKey(person.sid), person.name]));
    const keep = (sid) => !roster.length || rosterName.has(sidKey(sid));   // 只算点名册上的同学
    const nameOf = (sid, fallback) => rosterName.get(sidKey(sid)) || fallback || '';
    const tsOf = (doc) => (doc.ts ? Number(doc.ts) : 0) || millis(doc.created_at) || millis(doc.at) || 0;
    const classId = Number(state.klass.id) || state.klass.id;
    const none = (error) => { if (missingTable(error)) return []; throw error; };
    // 2026-11-26 起几张表同时读：本班课堂的记录经 classData（只读本班的，读过的留在本页、再用时只补读新的），按班级的表在后台按班级筛
    const fetchKind = (kind, where) => (typeof backend.fetchRows === 'function' ? backend.fetchRows(kind, { where }) : backend.fetchAll(kind, where)).catch(none);
    const pick = async (kind) => (await classData.get(kind, rooms).catch(none)).filter((doc) => inClass(doc) && !doc.auditor && keep(doc.sid));
    const [visitRows, checkins, choices, answers, homework, danmakuRows, practiceRows, guesses, posts, realmRows, leaves, sects, moods] = await Promise.all([
      fetchKind('visits', { class_id: classId }),
      pick('checkins'),
      CONCEPT ? [] : pick('choices'),
      CONCEPT ? [] : pick('answers'),
      CONCEPT ? pick('homework') : [],
      pick('danmaku'),
      // 修炼场按班级在后台筛（以前读全课程再按点名册挑）；下面照旧只留点名册上的同学
      fetchKind('practice', { course: course.slug, class_id: classId }),
      pick('puzzleguesses'),
      pick('debateposts'),
      fetchKind('realms', { course: course.slug, class_id: classId }),
      fetchKind('leaves', { class_id: classId }),
      fetchKind('sectmembers', { course: course.slug }),
      backend.rpc('ck_mood_stats', { p_classrooms: rooms.map((room) => Number(room.id) || room.id) }).then((value) => (Array.isArray(value) ? value : []))
        .catch((error) => { if (!missingFunction(error) && !missingTable(error)) throw error; return []; }),
    ]);
    const visits = visitRows.filter((row) => !row.auditor && keep(row.sid));
    const danmaku = danmakuRows.filter((doc) => !doc.withdrawn_at);
    const practice = practiceRows.filter((doc) => roster.length ? rosterName.has(sidKey(doc.sid)) : false);
    const realms = realmRows.filter((row) => String(row.class_id) === String(state.klass.id) && keep(row.sid));
    // 学习行为明细：每个动作一行（ms 时间、学号、课堂、单元、行为、分组、题目）
    const roomName = (id) => (roomOf.get(String(id)) || {}).name || '';
    const roomUnit = (id) => (roomOf.get(String(id)) || {}).chapter || '';
    const acts = [];
    const add = (ms, sid, name, roomId, unit, kind, group, item) => {
      if (ms) acts.push({ ms, sid: sidKey(sid), name: nameOf(sid, name), roomId: roomId == null ? '' : String(roomId), room: roomId == null ? '修炼场' : roomName(roomId), unit, kind, group, item: item || '' });
    };
    visits.forEach((v) => add(millis(v.started_at), v.sid, v.name, v.classroom, v.unit || roomUnit(v.classroom), VISIT_KIND[v.kind] || v.kind, '登录与打开页面', ''));
    checkins.forEach((c) => add(tsOf(c), c.sid, c.name, c.classroom, roomUnit(c.classroom), '签到（当天第一次进入课堂）', '签到', ''));
    choices.forEach((c) => add(tsOf(c), c.sid, c.name, c.classroom, roomUnit(c.classroom), '选择递交', '选择递交', `案例${c.case_no || c.case || ''} ${c.item}`));
    answers.forEach((a) => add(tsOf(a), a.sid, a.name, a.classroom, roomUnit(a.classroom), '文字作答', '文字作答', `案例${a.case_no || a.case || ''} ${a.item}`));
    homework.forEach((h) => add(tsOf(h), h.sid, h.name, h.classroom, h.unit || roomUnit(h.classroom), '作业递交', '作业递交', h.item || h.key || ''));
    danmaku.forEach((d) => add(tsOf(d), d.sid, d.name, d.classroom, roomUnit(d.classroom), d.gift ? '祭出法宝' : '发弹幕', d.gift ? '祭出法宝' : '发弹幕', ''));
    practice.forEach((r) => add(tsOf(r), r.sid, r.name, null, r.unit, r.correct ? '修炼场答题（对）' : '修炼场答题', '修炼场答题', r.item));
    guesses.forEach((g) => add(tsOf(g), g.sid, g.name, g.classroom, roomUnit(g.classroom), '情境猜谜抢答', '情境猜谜抢答', ''));
    posts.forEach((d) => add(tsOf(d), d.sid, d.name, d.classroom, roomUnit(d.classroom), '聊天室发言', '聊天室发言', `案例${d.case_no || ''}`));
    acts.sort((x, y) => x.ms - y.ms);
    const data = { rooms, roomOf, roster, rosterName, nameOf, tsOf, roomName, visits, checkins, choices, answers, homework, danmaku, practice, guesses, posts, realms, leaves, sects, moods, acts };
    learnCache = { key, at: Date.now(), data };
    return data;
  }
  async function exportLearning(button) {
    if (!state.klass) return;
    const status = (text) => $$('[data-learn-status]').forEach((el) => { el.textContent = text; });
    const buttons = $$('[data-learn-export]');
    buttons.forEach((b) => { b.disabled = true; });
    status('正在读取本班全部课堂的记录……');
    try {
      const L = await loadLearning(true);
      const { rooms, roster, nameOf, tsOf, roomName, visits, checkins, choices, answers, homework, danmaku, practice, guesses, posts, acts } = L;
      const unitTitle = (unit) => { const info = chapterMap.get(unit); return info ? (info.title || unit) : unit || ''; };
      status('正在整理……');
      const head = (cols) => cols;
      const actRows = [head(['时间', '日期', '星期', '小时', '学号', '姓名', '课堂', '单元', '行为', '题目或位置'])]
        .concat(acts.map((a) => { const t = timeParts(a.ms); return [t.text, t.day, t.week, t.hour, a.sid, a.name, a.room, unitTitle(a.unit), a.kind, a.item]; }));
      // 登录与在线（每一段一行）
      const visitRows = [head(['日期', '星期', '开始', '最后活动', '在线（分钟）', '学号', '姓名', '课堂', '单元', '方式'])]
        .concat(visits.slice().sort((a, b) => millis(a.started_at) - millis(b.started_at)).map((v) => {
          const t = timeParts(millis(v.started_at));
          return [t.day, t.week, t.text, timeParts(millis(v.last_at)).text, minutesOf(v.seconds), sidKey(v.sid), nameOf(v.sid, v.name), roomName(v.classroom), unitTitle(v.unit), VISIT_KIND[v.kind] || v.kind];
        }));
      // 每日概况（每人每天）
      const daily = new Map();
      const slot = (sid, day, name) => {
        const key = `${sid}|${day}`;
        if (!daily.has(key)) daily.set(key, { sid, day, name, sessions: 0, seconds: 0, checkin: 0, choice: 0, answer: 0, homework: 0, danmaku: 0, practice: 0, practicePts: 0, guess: 0, post: 0, first: Infinity, last: 0 });
        return daily.get(key);
      };
      const touch = (row, ms) => { row.first = Math.min(row.first, ms); row.last = Math.max(row.last, ms); };
      visits.forEach((v) => { const ms = millis(v.started_at); const r = slot(sidKey(v.sid), isoDay(ms), nameOf(v.sid, v.name)); r.sessions += 1; r.seconds += Number(v.seconds) || 0; touch(r, ms); touch(r, millis(v.last_at)); });
      const bump = (list, field, extra) => list.forEach((doc) => { const ms = tsOf(doc); if (!ms) return; const r = slot(sidKey(doc.sid), isoDay(ms), nameOf(doc.sid, doc.name)); r[field] += 1; if (extra) extra(r, doc); touch(r, ms); });
      bump(checkins, 'checkin'); bump(choices, 'choice'); bump(answers, 'answer'); bump(homework, 'homework'); bump(danmaku, 'danmaku');
      bump(practice, 'practice', (r, doc) => { r.practicePts += Number(doc.points) || 0; }); bump(guesses, 'guess'); bump(posts, 'post');
      const days = Array.from(daily.values()).sort((a, b) => a.day.localeCompare(b.day) || a.sid.localeCompare(b.sid));
      const dailyRows = [head(['日期', '星期', '学号', '姓名', '在线段数', '在线（分钟）', '签到', '选择递交', '文字作答', '作业递交', '弹幕与法宝', '修炼场答题', '修炼场修为', '猜谜抢答', '聊天室发言', '最早活动', '最晚活动'])]
        .concat(days.map((r) => [r.day, timeParts(Date.parse(`${r.day}T12:00:00+08:00`)).week, r.sid, r.name, r.sessions, minutesOf(r.seconds), r.checkin ? 1 : 0, r.choice, r.answer, r.homework, r.danmaku,
          r.practice, r.practicePts, r.guess, r.post, Number.isFinite(r.first) ? clock(r.first) : '', r.last ? clock(r.last) : '']));
      // 学生汇总（每人；点名册上没有活动的也列出）
      const people = new Map(roster.map((person) => [sidKey(person.sid), { sid: sidKey(person.sid), name: person.name }]));
      days.forEach((r) => { if (!people.has(r.sid)) people.set(r.sid, { sid: r.sid, name: r.name }); });
      const sumRows = [head(['学号', '姓名', '活跃天数', '在线段数', '在线合计（分钟）', '签到天数', '选择递交', '文字作答', '作业递交', '弹幕与法宝', '修炼场答题', '修炼场修为', '猜谜抢答', '聊天室发言', '最近活动'])]
        .concat(Array.from(people.values()).sort((a, b) => a.sid.localeCompare(b.sid)).map((p) => {
          const mine = days.filter((r) => r.sid === p.sid);
          const total = (field) => mine.reduce((t, r) => t + r[field], 0);
          const last = mine.reduce((t, r) => Math.max(t, r.last), 0);
          return [p.sid, p.name, mine.length, total('sessions'), minutesOf(total('seconds')), total('checkin') ? mine.filter((r) => r.checkin).length : 0, total('choice'), total('answer'), total('homework'),
            total('danmaku'), total('practice'), total('practicePts'), total('guess'), total('post'), last ? timeParts(last).text : ''];
        }));
      const notes = [['项目', '说明'],
        ['范围', `${course.title} · ${state.klass.name}：本班全部 ${rooms.length} 个课堂；只含点名册上的同学，不含旁听；导出时间 ${timeParts(Date.now()).text}`],
        ['登录与在线', '每一段在线一行（2026-11-05 起记录）：口令登录、直接打开（已登录的设备打开章节页）、回到页面（离开 3 分钟以上又回来）、查看历史课堂。课程页面和云间灵田开着且在前台时每 30 秒报一次在线、切走时再报一次（2026-11-20 起；之前每 45 秒一次、灵田里的时间不算），“在线（分钟）”是这一段的大致时长（两次报到之间最多算 90 秒）；3 分钟内接着打开别的页面算同一段。'],
        ['学习行为明细', '每个动作一行：登录方式、签到（每个课堂每天第一次进入）、选择递交、文字作答、作业递交（政治经济学）、发弹幕或祭出法宝（撤回的不算）、修炼场答题（含课后自修）、情境猜谜抢答、聊天室发言。时间都是北京时间；“小时”可用来看一天里什么时候在学。'],
        ['每日概况', '每人每天一行，把上面的明细按天汇总；“签到”1＝当天进过课堂。'],
        ['学生汇总', '每人一行；点名册上一直没有活动的同学也列出（全是 0）。'],
        ['做图建议', '工作台“学情分析”已经画好常用的图；也可以用 Excel“插入 → 数据透视表”自己做：按日期统计在线分钟和人数看学习趋势；按星期和小时看学习时段分布；按学号看个人投入；按行为类型看各种活动的比例。']];
      const O = window.ClassLive.office;
      O.save(O.xlsxBook([
        { name: '登录与在线', rows: visitRows, widths: [12, 7, 20, 20, 12, 14, 10, 22, 26, 12] },
        { name: '学习行为明细', rows: actRows, widths: [20, 12, 7, 6, 14, 10, 22, 26, 22, 22] },
        { name: '每日概况', rows: dailyRows, widths: [12, 7, 14, 10, 10, 12, 6, 10, 10, 10, 10, 12, 12, 10, 12, 10, 10] },
        { name: '学生汇总', rows: sumRows, widths: [14, 10, 10, 10, 16, 10, 10, 10, 10, 12, 12, 12, 10, 12, 20] },
        { name: '说明', rows: notes, widths: [14, 110] },
      ]), `${course.title}_${safeName(state.klass.name)}_学习数据_${window.ClassLive.today()}.xlsx`);
      status(`已导出：在线 ${visits.length} 段、学习行为 ${acts.length} 条、${days.length} 个“人·天”、${people.size} 位同学。`);
    } catch (error) {
      console.error(error);
      status(`导出失败：${failReason(error)}`);
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  // ---------------- 学情分析（2026-11-05 用户：“或者你能直接在教师控制台中增加一个板块，直接输出一些图表分析学生的行为吗？”）----------------
  // 同一份学习记录（loadLearning），按上方“范围”“时间”筛选后画：统计卡片、每天在学人数、一周学习时段热力图、在做什么、境界分布、
  // 需要关注的同学（每人一行的明细表）。图表在 live-insights.js；只含点名册上的同学，不含旁听
  const INS_GROUPS = ['登录与打开页面', '签到', '选择递交', '文字作答', '作业递交', '发弹幕', '祭出法宝', '修炼场答题', '情境猜谜抢答', '聊天室发言'];
  const insState = { problem: '' };
  const dayStart = (day) => Date.parse(`${day}T00:00:00+08:00`);
  // 换班级时清掉上一个班的图表和缓存（避免新班级还没读完时看到旧数据）；还在读取的那一次也作废
  function clearInsights() {
    learnCache = null;
    insState.run = (insState.run || 0) + 1;
    insState.showPerson = null;
    $('[data-ins-root]').textContent = '';
    $('[data-ins-root]').style.opacity = '';
    $('[data-ins-status]').textContent = '';
    $$('[data-learn-status]').forEach((el) => { el.textContent = ''; });
  }
  // 学情分析隐藏姓名（2026-11-19 用户：“学情分析里面可以设置一个按钮，可以一键打开/隐藏图表中学生姓名等个人信息，这样方便我向第三方展示学情”）：
  //   打开后，图表、悬停提示、表格、放大图里的姓名换成“学生01、学生02……”（按学号顺序编号，每次一样），学号换成“••••”。
  //   先在数据上换（图表的标签和提示都从 people 这张表取名字），再在页面上兜底替换（学号、可能漏网的姓名，包括之后悬停出现的提示和放大图）；
  //   状态记在本机，刷新后保持。“导出学习数据（Excel）”是给老师自己用的，不受影响
  const insPrivacy = { on: (() => { try { return localStorage.getItem('teacher:ins-privacy') === '1'; } catch (error) { return false; } })(), swap: new Map(), re: null };
  function privacyMap(people, roster) {
    insPrivacy.swap = new Map();
    insPrivacy.re = null;
    if (!insPrivacy.on) return;
    const sids = Array.from(people.keys()).sort((a, b) => String(a).localeCompare(String(b), 'zh-CN', { numeric: true }));
    sids.forEach((sid, i) => {
      const alias = `学生${String(i + 1).padStart(sids.length >= 100 ? 3 : 2, '0')}`;
      const real = String(people.get(sid) || '').trim();
      if (real.length >= 2) insPrivacy.swap.set(real, alias);
      people.set(sid, alias);
    });
    (roster || []).forEach((person) => { const real = String(person.name || '').trim(); if (real.length >= 2 && !insPrivacy.swap.has(real)) insPrivacy.swap.set(real, '某同学'); });
    (roster || []).map((person) => String(person.sid || '').trim()).concat(sids).forEach((sid) => { if (sid.length >= 3) insPrivacy.swap.set(sid, '••••'); });
    const keys = Array.from(insPrivacy.swap.keys()).sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    insPrivacy.re = keys.length ? new RegExp(keys.join('|'), 'g') : null;
  }
  const maskText = (text) => (insPrivacy.re && text ? text.replace(insPrivacy.re, (m) => insPrivacy.swap.get(m) || m) : text);
  function maskNode(node) {
    if (!insPrivacy.on || !insPrivacy.re || !node) return;
    if (node.nodeType === 3) { const t = maskText(node.nodeValue); if (t !== node.nodeValue) node.nodeValue = t; return; }
    if (node.nodeType !== 1) return;
    ['title', 'aria-label', 'data-tip'].forEach((name) => { const v = node.getAttribute(name); if (v) { const t = maskText(v); if (t !== v) node.setAttribute(name, t); } });
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === 3) { const t = maskText(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
      else ['title', 'aria-label', 'data-tip'].forEach((name) => { const v = n.getAttribute(name); if (v) { const t = maskText(v); if (t !== v) n.setAttribute(name, t); } });
    }
  }
  // 之后才出现的内容（悬停提示、放大图）也替换：学情分析区域和放大图（挂在 body 上的 .ins-zoom）
  const inInsights = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return Boolean(el && el.closest('[data-ins-root], [data-rf-root], .ins-zoom')); };
  const privacyWatch = new MutationObserver((list) => {
    if (!insPrivacy.on) return;
    list.forEach((m) => {
      if (m.type === 'childList') m.addedNodes.forEach((n) => { if (inInsights(n)) maskNode(n); });
      else if (inInsights(m.target)) maskNode(m.target);
    });
  });
  const watchPrivacy = () => {
    privacyWatch.disconnect();
    if (insPrivacy.on) privacyWatch.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'data-tip'] });
  };
  function paintPrivacyButton() {
    // 学情分析、学习心得（2026-11-26）两个标签的“隐藏姓名”是同一个开关
    $$('[data-ins-privacy], [data-rf-privacy]').forEach((button) => {
      button.setAttribute('aria-pressed', String(insPrivacy.on));
      button.textContent = insPrivacy.on ? '显示姓名' : '隐藏姓名';
    });
    document.body.classList.toggle('is-ins-private', insPrivacy.on);
  }
  // 学情分析的分组和顺序（2026-11-23 用户：“你把云间灵田、学情分析和静修数据里面的数据和图表在重新排版一下，按照逻辑顺序等，使之更美观”）：
  //   先看学习节奏（每天、一周、课堂停留、在线、做什么），再看课堂（到课、感受、互动），然后作答与理解、课后修炼、修为与宗门，最后是每位同学。
  //   [卡片标题, 宽]：宽 true 占满一行、false 占半行；每组里半宽的两两成对，不留单个空位。没有的卡片（如没有期中考查）自动跳过
  const INS_PLAN = [
    { title: '学习节奏', note: '按上面选的范围和时间', cards: [['每天有多少同学在学', true], ['一周里什么时候在学', true], ['每天的课堂停留时间', true], ['每人在线时长', false], ['都在做什么', false]] },
    { title: '课堂', note: '每次课（课堂）一个点，按上课先后排列', cards: [['每次课到课', false], ['课堂感受', false], ['课堂互动', true]] },
    { title: '作答与理解', note: '客观题每位同学每题只认第一次递交；正确率 40 以下红、40—55 橙、55—70 黄、70—85 绿、85 以上青', cards: [['各次课平均正确率', false], ['错得最多的 10 道题', false], ['前测 → 后测：讲完以后理解变好了吗', true], ['什么时候递交', true], ['期中考查作业：离截止多久交', true]] },
    { title: '课后修炼', note: '平时做题攒修为（含课后自修）', cards: [['每天有多少同学在练', false], ['修炼场各单元正确率', false]] },
    { title: '修为与宗门', note: '境界按最近一次结算；宗门分是本课程历届弟子修为之和', cards: [['境界分布', false], ['修为榜第一的修为构成', false], ['学习投入和修为', true], ['本班弟子', false], ['宗门分（历届）', false]] },
    { title: '学生', note: '找出需要关注和值得表扬的同学', cards: [['个人学情卡', true], ['每位同学', true]] },
  ];
  async function renderInsights(force) {
    const root = $('[data-ins-root]');
    const I = window.ClassLiveInsights;
    if (!root || !state.klass) return;
    if (!I) { root.textContent = '图表脚本没有加载，请刷新页面再试。'; return; }
    I.addStyle();
    insState.run = (insState.run || 0) + 1;
    const run = insState.run;
    const status = $('[data-ins-status]');
    status.textContent = '正在读取本班的学习记录……';
    root.style.opacity = root.childElementCount ? '.45' : '';
    let L;
    try { L = await loadLearning(force); } catch (error) { if (run !== insState.run) return; console.error(error); status.textContent = `读取失败：${failReason(error)}`; root.style.opacity = ''; return; }
    if (run !== insState.run) return;   // 读取期间又切换了班级、范围或时间：只画最新的一次
    const scope = $('[data-ins-scope]').value;
    const range = $('[data-ins-range]').value;
    const room = scope === 'room' ? state.room : null;
    const today = window.ClassLive.today();
    const span = range === 'all' ? null : Number(range);
    const fromMs = span ? dayStart(isoDay(Date.now() - (span - 1) * 86400000)) : 0;
    const inScope = (a) => !room || a.roomId === String(room.id) || (a.roomId === '' && a.unit === room.chapter);
    // 2026-11-05 用户：“不在点名册中的学生不进入学情分析”——班外申请、老师允许加入的（点名册里标“班外”的 extra）也不算；没有点名册时按有记录的同学
    const core = L.roster.filter((person) => !person.extra);
    const coreSids = new Set(core.map((person) => sidKey(person.sid)));
    const inRoster = (sid) => !core.length || coreSids.has(sidKey(sid));
    const acts = L.acts.filter((a) => a.ms >= fromMs && inScope(a) && inRoster(a.sid));
    const visits = L.visits.filter((v) => millis(v.started_at) >= fromMs && (!room || String(v.classroom) === String(room.id)) && inRoster(v.sid));
    const realmRows = L.realms.filter((r) => inRoster(r.sid));
    const people = new Map(core.map((person) => [sidKey(person.sid), person.name]));
    if (!core.length) acts.forEach((a) => { if (!people.has(a.sid)) people.set(a.sid, a.name); });
    privacyMap(people, L.roster);   // 打开“隐藏姓名”时，图表从这张表取到的都是“学生01……”
    const total = people.size || 1;
    const keepY = window.scrollY;
    root.style.minHeight = `${root.offsetHeight}px`;   // 先撑住原来的高度，重画时页面不变短、不跳
    root.textContent = '';
    root.style.opacity = '';
    requestAnimationFrame(() => { root.style.minHeight = ''; if (Math.abs(window.scrollY - keepY) > 2) window.scrollTo(0, keepY); });
    const scopeText = room ? `课堂“${room.name}”` : `${state.klass.name}全部课堂`;
    const extraCount = L.roster.length - core.length;
    status.textContent = `${scopeText} · ${span ? `最近 ${span} 天` : '全部时间'} · 点名册 ${core.length} 人${core.length ? '' : '（还没上传点名册，按有记录的同学统计）'}${extraCount ? `（班外允许加入的 ${extraCount} 人不计入）` : ''}。数据读于 ${clock(Date.now())}。${insPrivacy.on ? ' · 已隐藏姓名和学号（学生按学号顺序编为“学生01、学生02……”）' : ''}`;
    if (!acts.length) { I.empty(root, '这段时间还没有学习记录。'); return; }
    // 按天
    const firstDay = isoDay(span ? fromMs : acts[0].ms);
    const dayList = [];
    for (let ms = dayStart(firstDay); ms <= dayStart(today); ms += 86400000) dayList.push(isoDay(ms + 3600000));
    const byDay = new Map(dayList.map((day) => [day, { active: new Set(), acts: 0, seconds: 0 }]));
    acts.forEach((a) => { const d = byDay.get(isoDay(a.ms)); if (d) { d.active.add(a.sid); d.acts += 1; } });
    visits.forEach((v) => { const d = byDay.get(isoDay(millis(v.started_at))); if (d) d.seconds += Number(v.seconds) || 0; });
    // 按天的图可以往前翻（2026-11-18 用户：“每天有多少同学在学，增加一个左右滑动的滑轮，可以查看之前所有天数的情况，其它类似的图表也一样”）：
    //   选“最近 7 天／30 天”时先显示这一段，图下的滑块往左拖一直看到最早有记录的那天（按天的图都算全部日子）；“全部时间”一次显示全部
    const allActs = span ? L.acts.filter((a) => inScope(a) && inRoster(a.sid)) : acts;
    const allVisits = span ? L.visits.filter((v) => (!room || String(v.classroom) === String(room.id)) && inRoster(v.sid)) : visits;
    const firstMs = allActs.reduce((min, a) => Math.min(min, a.ms), dayStart(firstDay));
    const longList = [];
    for (let ms = dayStart(isoDay(firstMs)); ms <= dayStart(today); ms += 86400000) longList.push(isoDay(ms + 3600000));
    const longDay = new Map(longList.map((day) => [day, { active: new Set(), acts: 0, seconds: 0 }]));
    allActs.forEach((a) => { const d = longDay.get(isoDay(a.ms)); if (d) { d.active.add(a.sid); d.acts += 1; } });
    allVisits.forEach((v) => { const d = longDay.get(isoDay(millis(v.started_at))); if (d) d.seconds += Number(v.seconds) || 0; });
    const winDays = span ? dayList.length : longList.length;   // 一次显示多少天
    const slideNote = (n, size) => (n > size ? '；拖动图下的滑块（或在图上左右滑）看更早的' : '');
    // 每人
    const per = new Map(Array.from(people.keys()).map((sid) => [sid, { sid, name: people.get(sid), days: new Set(), acts: 0, submit: 0, danmaku: 0, practice: 0, seconds: 0, last: 0 }]));
    acts.forEach((a) => {
      const p = per.get(a.sid);
      if (!p) return;
      p.days.add(isoDay(a.ms)); p.acts += 1; p.last = Math.max(p.last, a.ms);
      if (['选择递交', '文字作答', '作业递交'].includes(a.group)) p.submit += 1;
      if (a.group === '发弹幕') p.danmaku += 1;
      if (a.group === '修炼场答题') p.practice += 1;
    });
    visits.forEach((v) => { const p = per.get(sidKey(v.sid)); if (p) p.seconds += Number(v.seconds) || 0; });
    // 有效在线（2026-11-27 阶段 343，和学生面板“灵根·定力”同一规则）：每段连续在线最多算 2 小时、每天（这一段开始的日子）最多算 3 小时
    const validDay = new Map();
    visits.forEach((v) => { const key = `${sidKey(v.sid)}|${isoDay(millis(v.started_at))}`; validDay.set(key, (validDay.get(key) || 0) + Math.min(7200, Number(v.seconds) || 0)); });
    validDay.forEach((s, key) => { const p = per.get(key.split('|')[0]); if (p) p.valid = (p.valid || 0) + Math.min(10800, s); });
    const activeCount = Array.from(per.values()).filter((p) => p.acts > 0).length;
    const todayActive = (byDay.get(today) || { active: new Set() }).active.size;
    const minutesAll = visits.reduce((t, v) => t + (Number(v.seconds) || 0), 0) / 60;
    I.tiles(root, [
      { label: '有学习行为的同学', value: `${activeCount} / ${total}`, note: `占 ${Math.round(activeCount * 100 / total)}%（这段时间里至少有一次${PLAIN ? '登录、签到或递交' : '登录、签到、递交、弹幕或修炼'}）` },
      { label: '人均学习行为', value: (acts.length / total).toFixed(1), note: `共 ${acts.length} 次：${PLAIN ? '登录与打开页面、签到、递交' : '登录与打开页面、签到、递交、弹幕、修炼场、抢答、聊天室'}` },
      { label: '人均在线（分钟）', value: (minutesAll / total).toFixed(1), note: '页面开着且在前台的大致时长；2026-11-05 起记录' },
      { label: '今天在学', value: `${todayActive} 人`, note: `${today} 有学习行为的同学` },
    ]);
    const grid = document.createElement('div');
    grid.className = 'ins-grid';
    root.appendChild(grid);
    // 按 INS_PLAN 的分组和顺序摆卡片（2026-11-23）；《金融机构与市场》等（PLAIN）照旧按原来的顺序，下面还要删、插几张
    const arranged = PLAIN || !I.arranger ? null : I.arranger(grid, INS_PLAN);
    const card = arranged ? arranged.card : I.card;
    const section = arranged ? () => null : I.section;
    const weekOf = (day) => timeParts(Date.parse(`${day}T12:00:00+08:00`)).week;
    const T = I.tones;
    section(grid, '总览', '按上面选的范围和时间');
    // 1 每天在学人数
    const c1 = card(grid, '每天有多少同学在学', `当天至少有一次学习行为的同学人数；悬停或用 Tab 键看当天的行为次数和在线分钟${slideNote(longList.length, winDays)}。`, true);
    const host1 = document.createElement('div'); c1.appendChild(host1);
    const dayRows = longList.map((day) => { const d = longDay.get(day); return { key: day, label: day.slice(5), value: d.active.size, lines: [`${day.slice(5)} ${weekOf(day)}`, `学习行为 ${d.acts} 次`, `在线约 ${Math.round(d.seconds / 60)} 分钟`] }; });
    const dayMax = dayRows.reduce((max, d) => Math.max(max, d.value), 0);
    // 2026-11-07 用户：“学情分析是否可以丰富一下图表类型，不要总是柱状图”：随时间的走势用面积折线；只有一两天时柱状图更清楚
    I.windowed(host1, c1, dayRows, winDays, (box, slice, card) => {
      if (slice.length < 3) I.columns(box, card, slice, { unit: ' 人', color: T.blue, aria: '每天在学人数柱状图', yMax: dayMax });
      else I.lines(box, card, slice.map((d) => ({ label: d.label, values: [d.value], lines: d.lines })), [{ name: '在学人数', color: T.blue }], { unit: ' 人', area: true, dots: false, noLow: true, aria: '每天在学人数面积折线图', yMax: dayMax });
    }, { labelOf: (d) => d.key.slice(5), unitName: '天', aria: '左右拖动，看更早或更近的日子' });
    I.tableView(c1, ['日期', '星期', '在学人数', '学习行为（次）', '在线（分钟）'], longList.map((day) => { const d = longDay.get(day); return [day, weekOf(day), d.active.size, d.acts, Math.round(d.seconds / 60)]; }));
    // 2 学习时段
    const WEEKS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const heat = WEEKS.map(() => Array(24).fill(0));
    acts.forEach((a) => { const t = timeParts(a.ms); const row = WEEKS.indexOf(t.week); if (row >= 0) heat[row][t.hour] += 1; });
    const c2 = card(grid, '一周里什么时候在学', '每格＝这一时段的学习行为次数（从浅橙到红越来越多，最浅的米白是 0）；看得出课上、课后和晚上的学习习惯。', true);
    const host2 = document.createElement('div'); c2.appendChild(host2);
    I.heatmap(host2, c2, WEEKS, Array.from({ length: 24 }, (_, i) => i), heat, { unit: ' 次', ramp: I.ramps.heat, aria: '学习时段热力图' });
    I.tableView(c2, ['星期', ...Array.from({ length: 24 }, (_, i) => `${i}时`)], heat.map((row, i) => [WEEKS[i], ...row]));
    // 3 在做什么
    const mix = INS_GROUPS.map((group) => ({ label: group, value: acts.filter((a) => a.group === group).length })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const c3 = card(grid, '都在做什么', '方块越大，这类学习行为的次数越多（同一位同学做几次算几次），每类行为一种颜色；小方块悬停看名称，也可以展开数据表。');
    const host3 = document.createElement('div'); c3.appendChild(host3);
    const GROUP_TONE = { 登录与打开页面: T.blue, 选择递交: T.orange, 作业递交: T.orange, 文字作答: T.cyan, 签到: T.pink, 发弹幕: T.green, 修炼场答题: T.purple, 情境猜谜抢答: T.yellow, 聊天室发言: T.red, 祭出法宝: I.catExt[9] };
    I.treemap(host3, c3, mix.map((d) => ({ ...d, color: GROUP_TONE[d.label], lines: [d.label, `占全部 ${Math.round(d.value * 100 / acts.length)}%`] })), { unit: ' 次', aria: '学习行为构成矩形树图' });
    I.tableView(c3, ['行为', '次数', '占比'], mix.map((d) => [d.label, d.value, `${Math.round(d.value * 100 / acts.length)}%`]));
    // 4 境界分布（最近一次结算）
    const realmCount = REALMS.map((realm) => ({ label: realm.name, value: realmRows.filter((r) => Number(r.realm) === realm.level).length }));
    const c4 = card(grid, '境界分布', `每一格是一位同学，每个境界一种颜色；按最近一次结算，${realmRows.length ? `已结算 ${realmRows.length} 人` : '还没有结算'}，不受上面的时间范围影响。`);
    const host4 = document.createElement('div'); c4.appendChild(host4);
    // 境界的颜色跟称号的材质走：铜色、青玉、金丹、紫霄，化神是流光渐变
    const REALM_TONE = [T.blue, T.cyan, T.yellow, T.purple, T.pink];
    const GOD_LIGHT = [T.yellow, T.orange, T.pink, T.purple, T.cyan];   // 化神：七彩神光
    I.waffle(host4, c4, realmCount.map((d, i) => ({ ...d, color: REALM_TONE[i], gradient: i === 4 ? GOD_LIGHT : null, swatch: i === 4 ? `linear-gradient(135deg, ${GOD_LIGHT.join(', ')})` : null, lines: [d.label, `占已结算的 ${realmRows.length ? Math.round(d.value * 100 / realmRows.length) : 0}%`] })), { unit: ' 人', aria: '境界分布方格图', empty: '还没有结算修为：到“修为境界”点一次结算。' });
    I.tableView(c4, ['境界', '人数'], realmCount.map((d) => [d.label, d.value]));
    // 5 在线时长分布（每人）
    const buckets = [['没有在线记录', 0, 0], ['1—10 分钟', 1, 600], ['10—30 分钟', 601, 1800], ['30—60 分钟', 1801, 3600], ['1—2 小时', 3601, 7200], ['2 小时以上', 7201, Infinity]];
    const onl = buckets.map(([label, lo, hi]) => ({ label, value: Array.from(per.values()).filter((p) => (lo === 0 && hi === 0 ? p.seconds === 0 : p.seconds >= lo && p.seconds <= hi)).length }));
    const c5 = card(grid, '每人在线时长', '全班同学按这段时间的在线合计分成几档，颜色越深在线越久（2026-11-05 起记录，之前的都算 0）。');
    const host5 = document.createElement('div'); c5.appendChild(host5);
    I.segmented(host5, c5, onl.map((d, i) => ({ ...d, color: i ? I.ramps.online[i - 1] : T.neutral, lines: [d.label, `占 ${Math.round(d.value * 100 / total)}%`] })), { unit: ' 人', aria: '在线时长分段条' });
    I.tableView(c5, ['在线合计', '人数'], onl.map((d) => [d.label, d.value]));
    // 5b 修为榜第一的修为构成（2026-11-05 用户：“可以在第二张截图右边空白的地方放个饼状图，看看修为榜排名第一的同学，修为值的构成”）：
    //   按最近一次结算的 detail；颜色按组成项固定（同一项在任何同学的图里同一个颜色）；超过 6 项时最小的几项并成“其他”
    const PARTS = [['attend', '签到'], ['done', '作答完成'], ['right', '作答正确'], ['danmaku', '弹幕'], ['practice', '修炼场'], ['game', '额外加分'], ['like', '老师点赞'], ['leave', '请假']];
    const PALETTE = I.cat;
    const ranked = realmRows.slice().sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0) || String(a.sid).localeCompare(String(b.sid)));
    const top = ranked[0];
    const ties = top ? ranked.filter((r) => Number(r.points) === Number(top.points)).length : 0;
    // 2026-11-05 用户：“学情分析里面，修为榜第一，不要显示名字”（投屏时也不暴露是谁）
    const c7 = card(grid, '修为榜第一的修为构成',
      top ? `按最近一次结算（${stamp(top.updated_at)}），共 ${Number(top.points) || 0} 修为，境界「${REALMS[Number(top.realm) || 0].name}」${ties > 1 ? `；并列第一 ${ties} 人，这里是学号最小的一位` : ''}。点赞、额外加分、修炼场是额外奖励。` : '');
    const host7 = document.createElement('div'); c7.appendChild(host7);
    if (top) {
      const detail = top.detail || {};
      let parts = PARTS.map(([key, label], i) => ({ label, value: Math.round((Number(detail[key]) || 0) * 10) / 10, color: PALETTE[i] })).filter((d) => d.value > 0);
      if (parts.length > 6) {
        const keepParts = parts.slice().sort((a, b) => b.value - a.value).slice(0, 5);
        const rest = parts.filter((d) => !keepParts.includes(d));
        parts = parts.filter((d) => keepParts.includes(d)).concat([{ label: `其他（${rest.map((d) => d.label).join('、')}）`, value: Math.round(rest.reduce((t, d) => t + d.value, 0) * 10) / 10, color: T.other }]);
      }
      I.donut(host7, c7, parts, { unit: ' 修为', center: String(Number(top.points) || 0), centerSub: '修为', aria: '修为榜第一的修为构成环形图' });
      const sum = parts.reduce((t, d) => t + d.value, 0) || 1;
      I.tableView(c7, ['组成', '修为', '占比'], parts.map((d) => [d.label, d.value, `${Math.round(d.value * 1000 / sum) / 10}%`]));
    } else {
      I.empty(host7, '还没有结算修为：到“修为境界”点一次结算。');
    }
    // ================= 2026-11-05 用户：“1-8都做吧”：课堂、题目、修炼场、宗门、学生 =================
    const pctOf = (a, b) => (b ? Math.round((a * 1000) / b) / 10 : 0);
    const unitTitle = (unit) => { const info = chapterMap.get(unit) || unitMap.get(unit); return info ? `${info.cn || (info.number ? `案例${info.number}` : '')} ${info.title || ''}`.trim() || unit : unit || ''; };
    const inRoomScope = (classroom) => !room || String(classroom) === String(room.id);
    const isExamRoom = (r) => /^exam/.test(String(r.chapter || ''));
    // 每个课堂的上课日：本班同学签到最多的那一天（没有签到就用发布日期）
    const checkByRoom = new Map();
    L.checkins.filter((c) => inRoster(c.sid) && !c.makeup).forEach((c) => {   // 请假补做的登录不算到课（2026-11-19）
      const key = String(c.classroom);
      if (!checkByRoom.has(key)) checkByRoom.set(key, { sids: new Set(), days: new Map() });
      const box = checkByRoom.get(key);
      box.sids.add(sidKey(c.sid));
      const day = c.session || isoDay(L.tsOf(c));
      box.days.set(day, (box.days.get(day) || 0) + 1);
    });
    const lessonDayOf = (r) => {
      const box = checkByRoom.get(String(r.id));
      if (box && box.days.size) return Array.from(box.days.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return isoDay(millis(r.created_at) || Date.now());
    };
    const lessons = (room ? [room] : L.rooms.filter((r) => !isExamRoom(r))).slice().sort((a, b) => Number(a.id) - Number(b.id))
      .map((r) => ({ room: r, day: lessonDayOf(r), sids: (checkByRoom.get(String(r.id)) || { sids: new Set() }).sids }))
      .filter((l) => l.sids.size > 0);
    const lessonsAll = lessons.slice();
    lessons.splice(0, lessons.length, ...lessonsAll.filter((l) => !span || dayStart(l.day) >= fromMs));
    // 按课的走势图也能往前翻（2026-11-18）：先显示所选时间里的这几次课（至少 3 次），图下的滑块往左拖看更早的课；“全部时间”一次显示全部
    const lessonWin = span ? Math.max(3, lessons.length) : lessonsAll.length;
    const lessonLabel = (l) => `${l.day.slice(5)} ${l.room.name}`;

    section(grid, '课堂', '每次课（课堂）一个点，按上课先后排列');
    // 1 到课
    const cA = card(grid, '每次课到课', `每次课到课率的走势（进过课堂的同学占点名册 ${core.length || '—'} 人的比例）；悬停看人数和请假情况${slideNote(lessonsAll.length, lessonWin)}。`);
    const hostA = document.createElement('div'); cA.appendChild(hostA);
    const leaveOn = (sid, day) => L.leaves.some((row) => sidKey(row.sid) === sid && row.start_day <= day && day <= row.end_day);
    const attendRows = lessonsAll.map((l) => {
      const n = Array.from(l.sids).filter((sid) => people.has(sid)).length;
      const leave = Array.from(people.keys()).filter((sid) => !l.sids.has(sid) && leaveOn(sid, l.day)).length;
      return { l, n, leave, rate: pctOf(n, total) };
    });
    if (attendRows.length === 1) {
      const only = attendRows[0];
      I.meter(hostA, cA, { value: only.n, max: total, color: T.purple, big: `${only.n} / ${total} 人`, note: `到课率 ${only.rate}%`, lines: [lessonLabel(only.l), `请假 ${only.leave} 人，没来也没请假 ${Math.max(0, total - only.n - only.leave)} 人`] }, { aria: '这次课的到课率' });
    } else {
      I.windowed(hostA, cA, attendRows, lessonWin, (box, slice, card) => I.lines(box, card, slice.map((r) => ({ label: lessonLabel(r.l), tick: [r.l.day.slice(5), r.l.room.name], values: [r.rate], short: `${Math.round(r.rate)}%`,
        lines: [lessonLabel(r.l), `到课 ${r.n} 人`, `请假 ${r.leave} 人，没来也没请假 ${Math.max(0, total - r.n - r.leave)} 人`] })), [{ name: '到课率', color: T.purple }],
      { unit: '%', area: true, ticks: [0, 25, 50, 75, 100], tickUnit: '%', aria: '每次课到课率折线图', empty: '这段时间还没有上过课。' }),
      { labelOf: (r) => r.l.day.slice(5), unitName: '次课', aria: '左右拖动，看更早或更近的课' });
    }
    I.tableView(cA, ['日期', '课堂', '到课', '到课率', '请假', '没来也没请假'], attendRows.map((r) => [r.l.day, r.l.room.name, r.n, `${r.rate}%`, r.leave, Math.max(0, total - r.n - r.leave)]));
    // 1b 课堂感受（笑脸）
    const cB = card(grid, '课堂感受', '建议箱上方“上完这堂课感觉怎么样”：右边是开心、左边是不开心的人数（匿名，只有人数）。');
    const hostB = document.createElement('div'); cB.appendChild(hostB);
    const moodRows = lessons.map((l) => {
      const rows = L.moods.filter((m) => String(m.classroom) === String(l.room.id));
      const up = rows.reduce((t, m) => t + (Number(m.up) || 0), 0); const down = rows.reduce((t, m) => t + (Number(m.down) || 0), 0);
      return { l, up, down };
    });
    I.diverging(hostB, cB, moodRows.map((r) => ({ label: lessonLabel(r.l), right: r.up, left: r.down, lines: [lessonLabel(r.l), `开心占 ${pctOf(r.up, r.up + r.down)}%`] })),
      { rightName: '开心', leftName: '不开心', rightColor: T.blue, leftColor: T.pink, aria: '每次课的课堂感受', empty: '还没有同学点过笑脸或不高兴的脸。' });
    I.tableView(cB, ['日期', '课堂', '开心', '不开心', '开心占比'], moodRows.map((r) => [r.l.day, r.l.room.name, r.up, r.down, `${pctOf(r.up, r.up + r.down)}%`]));
    // 7 课堂互动
    const cG = card(grid, '课堂互动', `每次课参与各种互动的人数：发弹幕、情境猜谜抢答、聊天室发言（辩论赛、经营沙盘）；悬停看条数和老师点赞${slideNote(lessonsAll.length, lessonWin)}。`, true);
    const hostG = document.createElement('div'); cG.appendChild(hostG);
    const dms = L.danmaku.filter((d) => inRoster(d.sid) && !d.gift);
    const interRows = lessonsAll.map((l) => {
      const id = String(l.room.id);
      const dm = dms.filter((d) => String(d.classroom) === id);
      const gs = L.guesses.filter((g) => String(g.classroom) === id && inRoster(g.sid));
      const ps = L.posts.filter((d) => String(d.classroom) === id && inRoster(d.sid));
      const uniq = (list) => new Set(list.map((d) => sidKey(d.sid))).size;
      return { l, dmPeople: uniq(dm), dm: dm.length, liked: dm.filter((d) => d.liked_at).length, gPeople: uniq(gs), g: gs.length, pPeople: uniq(ps), p: ps.length };
    });
    const interSeries = [{ name: '发弹幕', color: T.pink }, { name: '猜谜抢答', color: T.orange }, { name: '聊天室发言', color: T.cyan }];
    const interData = interRows.map((r) => ({ label: lessonLabel(r.l), tick: [r.l.day.slice(5), r.l.room.name], values: [r.dmPeople, r.gPeople, r.pPeople],
      lines: [`弹幕 ${r.dm} 条，老师点赞 ${r.liked} 次`, `抢答 ${r.g} 次`, `聊天室发言 ${r.p} 条`] }));
    const interMax = interData.reduce((max, d) => Math.max(max, ...d.values), 0);
    const interOpts = { unit: ' 人', aria: '每次课互动参与人数', empty: '这段时间还没有课堂互动记录。', yMax: interMax };
    I.windowed(hostG, cG, interData, lessonWin, (box, slice, card) => {
      if (slice.length > 1) I.lines(box, card, slice, interSeries, interOpts);
      else I.grouped(box, card, slice.map((d) => ({ ...d, lines: [d.label, ...d.lines] })), interSeries, interOpts);
    }, { labelOf: (d) => d.tick[0], unitName: '次课', aria: '左右拖动，看更早或更近的课' });
    I.tableView(cG, ['日期', '课堂', '发弹幕人数', '弹幕条数', '老师点赞', '抢答人数', '抢答次数', '聊天室发言人数', '发言条数'],
      interRows.map((r) => [r.l.day, r.l.room.name, r.dmPeople, r.dm, r.liked, r.gPeople, r.g, r.pPeople, r.p]));
    // 每天的课堂停留时间（2026-11-11 用户：“学情分析可以再增加一张图表，可以看到每天学习过的同学在每堂课的停留时间”）：
    //   按在线记录（ck_visits，页面在前台的时长，2026-11-05 起）算，每段在线记在开始那一天、所在的课堂。
    //   上面一天一根柱子：全班当天在各课堂停留的合计分钟（按课堂分颜色）；点一根柱子，下面列出这一天学习过的每位同学在各课堂停留了多久
    const stay = new Map();          // 日期 → Map(课堂 → Map(学号 → 秒))
    const roomSeconds = new Map();   // 课堂 → 这段时间的合计秒数
    allVisits.forEach((v) => {
      const sec = Number(v.seconds) || 0;
      const day = isoDay(millis(v.started_at));
      const sid = sidKey(v.sid);
      if (sec <= 0 || !longDay.has(day) || !people.has(sid)) return;
      const rid = String(v.classroom);
      if (!stay.has(day)) stay.set(day, new Map());
      const rooms = stay.get(day);
      if (!rooms.has(rid)) rooms.set(rid, new Map());
      rooms.get(rid).set(sid, (rooms.get(rid).get(sid) || 0) + sec);
      roomSeconds.set(rid, (roomSeconds.get(rid) || 0) + sec);
    });
    // 颜色：停留最多的 12 个课堂各一种（主色 8 种＋扩展色 4 种；超过 12 个时前 11 个，其余并成“其他课堂”），按上课先后排
    const STAY_TONES = I.catExt;
    const rankedRooms = Array.from(roomSeconds.keys()).sort((a, b) => roomSeconds.get(b) - roomSeconds.get(a));
    const stayRooms = rankedRooms.slice(0, rankedRooms.length > 12 ? 11 : 12).sort((a, b) => Number(a) - Number(b));
    const roomTitle = (rid) => { const r = L.roomOf.get(rid); return r ? r.name : '已删除的课堂'; };
    const titleCount = new Map();
    stayRooms.forEach((rid) => titleCount.set(roomTitle(rid), (titleCount.get(roomTitle(rid)) || 0) + 1));
    const staySeries = stayRooms.map((rid, i) => ({ name: titleCount.get(roomTitle(rid)) > 1 ? `${roomTitle(rid)}（${(L.roomOf.get(rid) || {}).code || rid}）` : roomTitle(rid), color: STAY_TONES[i] }))
      .concat(rankedRooms.length > stayRooms.length ? [{ name: '其他课堂', color: T.other }] : []);
    const seriesOf = (rid) => { const k = stayRooms.indexOf(rid); return k >= 0 ? k : staySeries.length - 1; };
    const toMin = (sec) => Math.round(sec / 6) / 10;
    const stayRows = longList.map((day) => {
      const values = staySeries.map(() => 0);
      const sids = new Set();
      (stay.get(day) || new Map()).forEach((bySid, rid) => bySid.forEach((sec, sid) => { values[seriesOf(rid)] += sec; sids.add(sid); }));
      return { key: day, label: day.slice(5), values: values.map((sec) => sec / 60), lines: [`${day.slice(5)} ${weekOf(day)}`, `学习过的同学 ${sids.size} 人`] };   // 分钟不先取整，合计和下面的明细对得上
    });
    const stayMax = stayRows.reduce((max, r) => Math.max(max, r.values.reduce((s, v) => s + v, 0)), 0);
    const cStay = card(grid, '每天的课堂停留时间', '上面一天一根柱子：全班同学当天在各课堂停留的合计分钟，按课堂分颜色；点一根柱子，下面列出这一天学习过的每位同学在各课堂分别停留了多久。按页面开着且在前台的时长算，2026-11-05 起有记录。', true);
    if (staySeries.length > 1) I.keys(cStay, staySeries);
    const hostStay = document.createElement('div');
    const stayHead = document.createElement('div');
    stayHead.className = 'ins-person';
    const stayBox = document.createElement('div');
    stayBox.className = 'ins-scrollbox';
    const hostStayRows = document.createElement('div');
    stayBox.appendChild(hostStayRows);
    cStay.append(hostStay, stayHead, stayBox);
    const lastStay = stayRows.slice().reverse().find((r) => r.values.some((v) => v > 0));
    let stayDay = lastStay ? lastStay.key : '';
    let stayCtl = null;
    const drawStay = () => {
      stayHead.textContent = '';
      hostStayRows.textContent = '';
      if (!stayDay) return;
      const perSid = new Map();
      (stay.get(stayDay) || new Map()).forEach((bySid, rid) => bySid.forEach((sec, sid) => {
        const vals = perSid.get(sid) || staySeries.map(() => 0);
        vals[seriesOf(rid)] += sec;
        perSid.set(sid, vals);
      }));
      const list = Array.from(perSid.entries()).map(([sid, vals]) => ({ sid, vals, total: vals.reduce((t, v) => t + v, 0) }))
        .sort((a, b) => b.total - a.total || a.sid.localeCompare(b.sid));
      const sum = list.reduce((t, r) => t + r.total, 0);
      const strong = document.createElement('strong');
      strong.textContent = `${stayDay.slice(5)} ${weekOf(stayDay)}`;
      const meta = document.createElement('span');
      meta.textContent = list.length ? `学习过的同学 ${list.length} 人 · 合计 ${toMin(sum)} 分钟 · 人均 ${toMin(sum / list.length)} 分钟（从多到少排）` : '这一天没有在线记录';
      stayHead.append(strong, meta);
      I.splitBars(hostStayRows, cStay, list.map((r) => ({ label: people.get(r.sid) || r.sid, values: r.vals.map((sec) => sec / 60), lines: [`${people.get(r.sid) || ''}（${r.sid}）`] })), staySeries,
        { unit: ' 分钟', aria: `${stayDay} 每位同学在各课堂的停留时间`, empty: '这一天没有在线记录。' });
    };
    stayCtl = I.windowed(hostStay, cStay, stayRows, winDays, (box, slice, card) => I.stackedColumns(box, card, slice, staySeries, { unit: ' 分钟', picked: stayDay,
      onPick: (day) => { stayDay = day; drawStay(); if (stayCtl) stayCtl.redraw(); }, aria: '每天各课堂停留分钟堆叠柱状图', empty: '这段时间还没有在线记录（2026-11-05 起记录）。', yMax: stayMax }),
    { labelOf: (r) => r.key.slice(5), unitName: '天', aria: '左右拖动，看更早或更近的日子' });
    drawStay();
    const stayTable = [];
    longList.forEach((day) => (stay.get(day) || new Map()).forEach((bySid, rid) => bySid.forEach((sec, sid) => stayTable.push([day, sid, people.get(sid) || '', roomTitle(rid), toMin(sec)]))));
    I.tableView(cStay, ['日期', '学号', '姓名', '课堂', '停留（分钟）'], stayTable.sort((a, b) => b[0].localeCompare(a[0]) || b[4] - a[4]));

    // 2 题目正确率（每位同学每题只认第一次递交）
    const qStats = new Map();   // 题 → { label, unit, answered, score }
    const meRight = new Map();  // 学号 → { answered, score }
    const addAnswer = (id, label, unitKey, sid, score) => {
      const q = qStats.get(id) || { label, unit: unitKey, answered: 0, score: 0 };
      q.answered += 1; q.score += score; qStats.set(id, q);
      const me = meRight.get(sid) || { answered: 0, score: 0 };
      me.answered += 1; me.score += score; meRight.set(sid, me);
    };
    const prePost = new Map();   // 习经案例 → { pre: [n, right], post: [n, right] }
    if (!CONCEPT) {
      const groups = new Map();
      const oldTkCases = new Set(L.choices.filter((c) => OLD_TK.test(c.item)).map((c) => String(c.case || c.case_no)));   // 用小案例上过的案例
      L.choices.filter((c) => inRoster(c.sid) && L.tsOf(c) >= fromMs && inRoomScope(c.classroom)).forEach((c) => {
        const key = `${sidKey(c.sid)}|${c.case || c.case_no}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      });
      groups.forEach((docs, key) => {
        const [sid, caseNo] = key.split('|');
        const item = caseMap.get(caseNo);
        if (!item) return;
        const m = {};
        firstOf(docs).forEach((doc, k) => { m[k] = doc.choice; });
        // 学情分析的正确率：出门测照常统计（legacyExit: true，只是不计入修为的两项）；纠错诊断按这位同学实际做的是旧题还是新题
        xjpQuestions(item, m, { legacyTransfer: oldTkCases.has(String(caseNo)), legacyMyth: Object.keys(m).some((k) => OLD_MYTH.test(k)), legacyExit: true })
          .filter((q) => q.kind === 'obj').forEach((q) => {
          if (!q.items.every((k) => m[k] != null)) return;
          const label = q.items.length > 1 ? `案例${caseNo} 证据—理论配对` : `案例${caseNo} ${itemLabel(caseNo, q.items[0])}`;
          addAnswer(`${caseNo}|${q.items.join('+')}`, label, caseNo, sid, q.score(m));
        });
        const ref = item.poll && item.poll.reference;
        if (ref != null) {
          const pp = prePost.get(caseNo) || { pre: [0, 0], post: [0, 0] };
          if (m.pre != null) { pp.pre[0] += 1; if (String(m.pre) === String(ref)) pp.pre[1] += 1; }
          if (m.post != null) { pp.post[0] += 1; if (String(m.post) === String(ref)) pp.post[1] += 1; }
          prePost.set(caseNo, pp);
        }
      });
    } else {
      const groups = new Map();
      L.homework.filter((h) => inRoster(h.sid) && L.tsOf(h) >= fromMs && inRoomScope(h.classroom)).forEach((h) => {
        const key = `${sidKey(h.sid)}|${h.unit}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(h);
      });
      groups.forEach((docs, key) => {
        const [sid, unitKey] = key.split('|');
        const unit = unitMap.get(unitKey);
        if (!unit || unit.exam) return;
        let result;
        try { result = gradeOf(unit, mergePayload(docs)); } catch (error) { return; }
        result.items.filter((it) => it.ref != null && it.type !== 'text' && it.value != null).forEach((it) => {
          addAnswer(`${unitKey}|${it.key}`, unit.plain ? `第${Number(unit.number)}次课 ${it.label || it.key}` : `案例${unit.number} ${it.step || ''}·${it.label || it.key}`, unitKey, sid, it.correct ? 1 : 0);
        });
      });
    }
    section(grid, '题目', '客观题，每位同学每题只认第一次递交；正确率 40 以下红、40—55 橙、55—70 黄、70—85 绿、85 以上青');
    const minAnswered = Math.max(2, Math.ceil(total * 0.15));
    const qList = Array.from(qStats.values()).filter((q) => q.answered >= minAnswered).map((q) => ({ ...q, rate: pctOf(q.score, q.answered) }));
    const cQ = card(grid, '错得最多的 10 道题', `正确率最低的题（至少 ${minAnswered} 人作答才列入）；值得下次课讲一讲。`);
    const hostQ = document.createElement('div'); cQ.appendChild(hostQ);
    const hardest = qList.slice().sort((a, b) => a.rate - b.rate || b.answered - a.answered).slice(0, 10);
    I.bars(hostQ, cQ, hardest.map((q) => ({ label: q.label, value: q.rate, text: `${q.rate}%`, color: I.rateColor(q.rate), lines: [q.label, `作答 ${q.answered} 人`] })), { unit: '%', stacked: true, dot: true, max: 100, aria: '正确率最低的题', empty: '这段时间还没有足够的作答。' });
    I.tableView(cQ, ['题目', '作答人数', '正确率'], qList.slice().sort((a, b) => a.rate - b.rate).map((q) => [q.label, q.answered, `${q.rate}%`]));
    const byUnit = new Map();
    qStats.forEach((q) => { const u = byUnit.get(q.unit) || { answered: 0, score: 0, n: 0 }; u.answered += q.answered; u.score += q.score; u.n += 1; byUnit.set(q.unit, u); });
    const unitOrder = CONCEPT ? (course.units || []).map((u) => u.unit) : Array.from(caseMap.keys());
    const unitRows = unitOrder.filter((k) => byUnit.has(k)).map((k) => {
      const u = byUnit.get(k);
      const info = CONCEPT ? unitMap.get(k) : caseMap.get(k);
      if (PLAIN) return { label: `第${Number(info.number)}次课 ${info.title || ''}`, tick: `第${Number(info.number)}次`, rate: pctOf(u.score, u.answered), answered: u.answered, n: u.n };
      return { label: CONCEPT ? `案例${info.number} ${info.title || ''}` : `案例${k} ${(info && info.title) || ''}`, tick: CONCEPT ? `案例${info.number}` : `案例${k}`, rate: pctOf(u.score, u.answered), answered: u.answered, n: u.n };
    });
    const cU = card(grid, '各次课平均正确率', '按课程顺序，每次课全部客观题的平均正确率；悬停看课名和作答人次。');
    const hostU = document.createElement('div'); cU.appendChild(hostU);
    if (unitRows.length < 3) I.bars(hostU, cU, unitRows.map((u) => ({ label: u.label, value: u.rate, text: `${u.rate}%`, color: I.rateColor(u.rate), lines: [u.label, `${u.n} 道题，共 ${u.answered} 人次作答`] })), { unit: '%', stacked: true, dot: true, max: 100, aria: '各次课平均正确率', empty: '这段时间还没有作答。' });
    else I.lines(hostU, cU, unitRows.map((u) => ({ label: u.label, tick: u.tick, values: [u.rate], lines: [u.label, `${u.n} 道题，共 ${u.answered} 人次作答`] })), [{ name: '平均正确率', color: T.blue }], { unit: '%', valueColor: I.rateColor, ticks: [0, 25, 50, 75, 100], tickUnit: '%', aria: '各次课平均正确率折线图' });
    I.tableView(cU, ['课', '题数', '作答人次', '平均正确率'], unitRows.map((u) => [u.label, u.n, u.answered, `${u.rate}%`]));
    if (!CONCEPT) {
      const ppRows = Array.from(caseMap.keys()).filter((k) => prePost.has(k)).map((k) => {
        const pp = prePost.get(k); const info = caseMap.get(k);
        return { label: `案例${k} ${(info && info.title) || ''}`, a: pp.pre[0] ? pctOf(pp.pre[1], pp.pre[0]) : null, b: pp.post[0] ? pctOf(pp.post[1], pp.post[0]) : null, pp };
      }).filter((r) => r.a != null || r.b != null);
      const cP = card(grid, '前测 → 后测：讲完以后理解变好了吗', '同一道题课前（前测）和课后（后测）选中参考答案的比例；蓝点在橙点右边说明讲完以后更多同学理解了。', true);
      const hostP = document.createElement('div'); cP.appendChild(hostP);
      I.dumbbell(hostP, cP, ppRows.map((r) => ({ label: r.label, a: r.a, b: r.b, lines: [r.label, `前测 ${r.pp.pre[0]} 人作答，后测 ${r.pp.post[0]} 人作答`] })),
        { aName: '前测', bName: '后测', aColor: T.orange, bColor: T.blue, unit: '%', aria: '前测与后测正确率', empty: '这段时间还没有前测和后测的作答。' });
      I.tableView(cP, ['案例', '前测作答', '前测正确率', '后测作答', '后测正确率', '提升'], ppRows.map((r) => [r.label, r.pp.pre[0], r.a == null ? '—' : `${r.a}%`, r.pp.post[0], r.b == null ? '—' : `${r.b}%`, r.a != null && r.b != null ? `${Math.round((r.b - r.a) * 10) / 10}` : '—']));
    }

    // 6 修炼场
    section(grid, '修炼场', '平时做题攒修为（含课后自修）');
    const prac = L.practice.filter((r) => inRoster(r.sid) && L.tsOf(r) >= fromMs && (!room || r.unit === room.chapter));
    const pracAll = span ? L.practice.filter((r) => inRoster(r.sid) && (!room || r.unit === room.chapter)) : prac;
    const pFirst = pracAll.reduce((min, r) => Math.min(min, dayStart(isoDay(L.tsOf(r)))), dayStart(longList[0]));
    const pList = [];
    for (let ms = pFirst; ms <= dayStart(today); ms += 86400000) pList.push(isoDay(ms + 3600000));
    const pDay = new Map(pList.map((day) => [day, { sids: new Set(), n: 0, right: 0 }]));
    pracAll.forEach((r) => { const d = pDay.get(isoDay(L.tsOf(r))); if (d) { d.sids.add(sidKey(r.sid)); d.n += 1; if (r.correct) d.right += 1; } });
    const pWin = span ? Math.max(winDays, 7) : pList.length;
    const cR = card(grid, '每天有多少同学在练', `一列是一周，一格是一天，颜色越深（浅橙到红）当天在修炼场答题的同学越多（最浅的米白是没有人练）；悬停看答题数和正确率${slideNote(pList.length, pWin)}。`);
    const hostR = document.createElement('div'); cR.appendChild(hostR);
    const pRowsDay = pList.map((day) => { const d = pDay.get(day); return { day, value: d.sids.size, lines: [`${day.slice(5)} ${weekOf(day)}`, `答题 ${d.n} 道`, `正确率 ${pctOf(d.right, d.n)}%`] }; });
    const pMax = pRowsDay.reduce((max, d) => Math.max(max, d.value), 0);
    I.windowed(hostR, cR, pRowsDay, pWin, (box, slice, card) => I.calendar(box, card, slice, { unit: ' 人', ramp: I.ramps.fresh, aria: '每天修炼人数日历热力图', yMax: pMax, empty: '这段时间还没有人在修炼场答题。' }),
      { labelOf: (d) => d.day.slice(5), unitName: '天', aria: '左右拖动，看更早或更近的日子' });
    I.tableView(cR, ['日期', '练习人数', '答题数', '正确率'], pList.map((day) => { const d = pDay.get(day); return [day, d.sids.size, d.n, `${pctOf(d.right, d.n)}%`]; }));
    const pUnit = new Map();
    prac.forEach((r) => { const u = pUnit.get(r.unit) || { n: 0, right: 0, sids: new Set() }; u.n += 1; if (r.correct) u.right += 1; u.sids.add(sidKey(r.sid)); pUnit.set(r.unit, u); });
    const order = CONCEPT ? (course.units || []).map((u) => u.unit) : course.chapters.map((ch) => ch.id);
    const pRows = order.filter((k) => pUnit.has(k)).concat(Array.from(pUnit.keys()).filter((k) => !order.includes(k))).map((k) => ({ k, label: unitTitle(k), ...pUnit.get(k) }));
    const cS = card(grid, '修炼场各单元正确率', '哪个单元的题最难；悬停看答题数和人数。');
    const hostS = document.createElement('div'); cS.appendChild(hostS);
    I.bars(hostS, cS, pRows.map((u) => ({ label: u.label, value: pctOf(u.right, u.n), text: `${pctOf(u.right, u.n)}%`, color: I.rateColor(pctOf(u.right, u.n)), lines: [u.label, `答题 ${u.n} 道（${u.sids.size} 人）`] })), { unit: '%', stacked: true, dot: true, max: 100, aria: '修炼场各单元正确率', empty: '这段时间还没有人在修炼场答题。' });
    I.tableView(cS, ['单元', '答题数', '人数', '正确率'], pRows.map((u) => [u.label, u.n, u.sids.size, `${pctOf(u.right, u.n)}%`]));

    // 8 宗门
    const SECTS = window.ClassLive.SECTS || [];
    if (SECTS.length) {
      section(grid, '宗门', '本班弟子人数与历届宗门分');
      const mine = L.sects.filter((m) => String(m.class_id) === String(state.klass.id) && inRoster(m.sid));
      const cT = card(grid, '本班弟子', '本班点名册上的同学拜入了哪个宗门（散修不属于任何宗门）。');
      const hostT = document.createElement('div'); cT.appendChild(hostT);
      // 宗门在学情分析里也用这套色号（2026-11-11）：枫霞谷大红、玄月宗紫、灵犀山绿、星澜宫蓝，散修橙
      const SECT_TONE = { fengxia: T.red, xuanyue: T.purple, lingxi: T.green, xinglan: T.blue };
      const sectRows = SECTS.map((sect) => ({ label: sect.name, value: mine.filter((m) => m.sect === sect.key).length, color: SECT_TONE[sect.key] || sect.color }))
        .concat([{ label: '散修', value: mine.filter((m) => m.sect === 'sanxiu').length, color: T.orange }, { label: '还没选', value: Math.max(0, total - mine.length), color: T.neutral }]);
      I.donut(hostT, cT, sectRows, { unit: ' 人', center: `${mine.length}/${total}`, centerSub: '已选择', aria: '本班宗门人数环形图', empty: '还没有同学拜入宗门。' });
      I.tableView(cT, ['宗门', '本班人数'], sectRows.map((d) => [d.label, d.value]));
      const cV = card(grid, '宗门分（历届）', '本课程历届弟子修为之和，宗门之间比的就是这个。');
      const hostV = document.createElement('div'); cV.appendChild(hostV);
      const scoreRows = SECTS.map((sect) => {
        const list = L.sects.filter((m) => m.sect === sect.key);
        return { label: sect.name, value: Math.round(list.reduce((t, m) => t + (Number(m.points) || 0), 0) * 10) / 10, color: SECT_TONE[sect.key] || sect.color, n: list.length };
      }).sort((a, b) => b.value - a.value);
      I.bars(hostV, cV, scoreRows.map((d) => ({ ...d, lines: [d.label, `历届弟子 ${d.n} 人`] })), { aria: '宗门分', empty: '还没有同学拜入宗门。' });
      I.tableView(cV, ['宗门', '宗门分', '历届弟子'], scoreRows.map((d) => [d.label, d.value, d.n]));
    }

    // 3 投入与修为、5 递交时间、4 个人学情卡
    section(grid, '学生', '找出需要关注和值得表扬的同学');
    const cX = card(grid, '学习投入和修为', '每个点是一位同学，颜色是 TA 的境界：横轴是这段时间的学习行为次数，纵轴是全学期修为（最近一次结算）；细线是两者的中位数。右下角是投入多、修为却偏低的同学，可能学得吃力。', true);
    const hostX = document.createElement('div'); cX.appendChild(hostX);
    const realmBySid = new Map(realmRows.map((r) => [sidKey(r.sid), r]));
    const pts = Array.from(per.values()).filter((p) => realmBySid.has(p.sid)).map((p) => {
      const r = realmBySid.get(p.sid);
      return { x: p.acts, y: Number(r.points) || 0, color: REALM_TONE[Number(r.realm) || 0], label: `${p.name}（${p.sid}）`, lines: [`学习行为 ${p.acts} 次`, `修为 ${Number(r.points) || 0}（${REALMS[Number(r.realm) || 0].name}）`, `学习天数 ${p.days.size}`] };
    });
    if (pts.length) I.keys(hostX, REALMS.map((realm, i) => ({ name: realm.name, color: REALM_TONE[i], dot: true })));
    I.scatter(hostX, cX, pts, { xName: '学习行为（次）', yName: '修为', aria: '学习投入与修为散点图', empty: '还没有结算修为：到“修为境界”点一次结算。',
      quadrants: [[1, 1, '投入多 · 修为高'], [0, 1, '投入少 · 修为高'], [1, 0, '投入多 · 修为偏低'], [0, 0, '投入少 · 修为低']] });
    I.tableView(cX, ['学号', '姓名', '学习行为', '修为'], pts.map((pt) => [pt.label.replace(/^.*（(.*)）$/, '$1'), pt.label.replace(/（.*$/, ''), pt.x, pt.y]));
    // 递交时间：离上课日几天（每位同学每题第一次递交）
    const lessonDayById = new Map(L.rooms.map((r) => [String(r.id), lessonDayOf(r)]));
    const subs = [];   // { ms, day（上课日）}
    if (!CONCEPT) {
      const first = new Map();
      [...L.choices, ...L.answers].filter((d) => inRoster(d.sid) && inRoomScope(d.classroom)).forEach((d) => {
        const key = `${sidKey(d.sid)}|${d.case || d.case_no}|${d.item}`;
        const ms = serverAt(d);
        const prev = first.get(key);
        if (!prev || ms < prev.ms) first.set(key, { ms, room: String(d.classroom) });
      });
      first.forEach((v) => subs.push(v));
    } else {
      const groups = new Map();
      L.homework.filter((h) => inRoster(h.sid) && inRoomScope(h.classroom) && !isExamRoom(L.roomOf.get(String(h.classroom)) || {})).forEach((h) => {
        const key = `${sidKey(h.sid)}|${h.unit}`;
        if (!groups.has(key)) groups.set(key, { docs: [], room: String(h.classroom) });
        groups.get(key).docs.push(h);
      });
      groups.forEach((g) => Object.values(mergePayload(g.docs)).forEach((entry) => { const ms = millis(entry.at); if (ms) subs.push({ ms, room: g.room }); }));
    }
    const SUB_BUCKETS = ['上课之前', '上课当天', '1—3 天后', '4—7 天后', '一周以后'];
    const subCount = SUB_BUCKETS.map(() => 0);
    subs.filter((v) => v.ms >= fromMs && lessonDayById.has(v.room)).forEach((v) => {
      const delta = Math.round((dayStart(isoDay(v.ms)) - dayStart(lessonDayById.get(v.room))) / 86400000);
      const k = delta < 0 ? 0 : delta === 0 ? 1 : delta <= 3 ? 2 : delta <= 7 ? 3 : 4;
      subCount[k] += 1;
    });
    const subTotal = subCount.reduce((t, n) => t + n, 0);
    const cW = card(grid, '什么时候递交', '每位同学每题第一次递交，离这次课的上课日几天：上课当天是课上或当天课后，之后的是补交；颜色越深交得越晚。', !(CONCEPT && L.rooms.some((r) => isExamRoom(r) && r.deadline && (!room || String(r.id) === String(room.id)))));
    const hostW = document.createElement('div'); cW.appendChild(hostW);
    I.segmented(hostW, cW, SUB_BUCKETS.map((label, k) => ({ label, value: subCount[k], color: I.ramps.timing[k], lines: [label] })), { unit: ' 题', aria: '递交时间分段条', empty: '这段时间还没有递交。' });
    I.tableView(cW, ['离上课日', '递交题数', '占比'], SUB_BUCKETS.map((label, k) => [label, subCount[k], `${pctOf(subCount[k], subTotal)}%`]));
    // 政经期中考查：离截止多久交
    const examRooms = CONCEPT ? L.rooms.filter((r) => isExamRoom(r) && r.deadline && (!room || String(r.id) === String(room.id))) : [];
    if (examRooms.length) {
      const EX = ['提前 3 天以上', '提前 1—3 天', '最后 24 小时', '截止以后', '还没交'];
      const exCount = EX.map(() => 0);
      examRooms.forEach((r) => {
        const due = millis(r.deadline);
        const firstAt = new Map();
        L.homework.filter((h) => String(h.classroom) === String(r.id) && inRoster(h.sid)).forEach((h) => {
          const ms = L.tsOf(h); const sid = sidKey(h.sid);
          if (ms && (!firstAt.has(sid) || ms < firstAt.get(sid))) firstAt.set(sid, ms);
        });
        firstAt.forEach((ms) => { const h = (due - ms) / 3600000; exCount[h >= 72 ? 0 : h >= 24 ? 1 : h >= 0 ? 2 : 3] += 1; });
        exCount[4] += Math.max(0, total - firstAt.size);
      });
      const cE = card(grid, '期中考查作业：离截止多久交', `${examRooms.map((r) => r.name).join('、')}；按每位同学第一次递交的时间。`);
      const hostE = document.createElement('div'); cE.appendChild(hostE);
      const exColors = I.ramps.timing.slice(1);
      I.segmented(hostE, cE, EX.map((label, k) => ({ label, value: exCount[k], color: k < EX.length - 1 ? exColors[k] : T.neutral, lines: [label] })), { unit: ' 人', aria: '期中考查递交时间分段条' });
      I.tableView(cE, ['离截止', '人数'], EX.map((label, k) => [label, exCount[k]]));
    }
    // 4 个人学情卡：点下表里的姓名
    const cK = card(grid, '个人学情卡', '点下表里的姓名，看这位同学和全班平均的对比：左边是整体轮廓（每个方向各自的刻度，外圈是这一项的满分或全班最高；有效在线的外圈是全班前 10%），右边是具体数值。', true);
    cK.dataset.insPersonCard = '';
    const hostK = document.createElement('div'); cK.appendChild(hostK);
    const avg = (fn) => { const list = Array.from(per.values()); return list.length ? Math.round((list.reduce((t, p) => t + fn(p), 0) / list.length) * 10) / 10 : 0; };
    const maxOf = (fn) => Math.max(0, ...Array.from(per.values()).map(fn));
    const attendOf = (p) => lessons.filter((l) => l.sids.has(p.sid)).length;
    const rightOf = (p) => { const r = meRight.get(p.sid); return r && r.answered ? pctOf(r.score, r.answered) : 0; };
    const pointsOf = (p) => Number((realmBySid.get(p.sid) || {}).points) || 0;
    const validOf = (p) => Math.round((p.valid || 0) / 60);
    // 有效在线的外圈：全班第 90 百分位（同学生面板），最少 60 分钟；超过的画满格
    const validRef = (() => { const v = Array.from(per.values()).map(validOf).sort((a, b) => a - b); if (!v.length) return 60; const pos = 0.9 * (v.length - 1); const lo = Math.floor(pos);
      return Math.max(60, Math.round(v[lo] + ((v[Math.ceil(pos)] - v[lo]) * (pos - lo)))); })();
    const METRICS = [
      ['到课次数', attendOf, lessons.length, ' 次', '到课'], ['学习天数', (p) => p.days.size, dayList.length, ' 天', '学习天数'], ['学习行为', (p) => p.acts, null, ' 次', '学习行为'],
      ['题目正确率', rightOf, 100, '%', '正确率'], ['弹幕', (p) => p.danmaku, null, ' 条', '弹幕'], ['修炼场答题', (p) => p.practice, null, ' 道', '修炼场'],
      ['有效在线', validOf, validRef, ' 分钟', '有效在线', `满格＝全班前 10%（${validRef} 分钟）；每段连续在线最多算 2 小时、每天最多算 3 小时，和学生面板“灵根·定力”同一算法`],
      ['修为（全学期）', pointsOf, null, '', '修为'],
    ].filter(([label]) => !PLAIN || !/修炼场|修为|弹幕/.test(label));   // 按次上课的课程（PLAIN）没有这几项
    insState.showPerson = (sid, scroll) => {
      const p = per.get(sid);
      if (!p) return;
      hostK.textContent = '';
      const head = document.createElement('div');
      head.className = 'ins-person';
      const strong = document.createElement('strong'); strong.textContent = p.name || sid;
      const r = realmBySid.get(sid);
      const meta = document.createElement('span');
      meta.textContent = PLAIN ? `${sid} · 最近一次 ${p.last ? timeParts(p.last).text.slice(5, 16) : '—'}`
        : `${sid} · ${r ? REALMS[Number(r.realm) || 0].name : '未结算'} · 最近一次 ${p.last ? timeParts(p.last).text.slice(5, 16) : '—'}`;
      head.append(strong, meta);
      hostK.appendChild(head);
      const personRows = METRICS.map(([label, fn, max, unit, short, note]) => ({ label, short, me: fn(p), avg: avg(fn), max: max == null ? maxOf(fn) : max, unit,
        fixed: Boolean(note), note: note || (max == null ? `全班最高 ${maxOf(fn)}${unit}` : '') }));
      I.keys(hostK, [{ name: '本人', color: T.pink }, { name: '全班平均', color: T.blue }]);
      const pair = document.createElement('div');
      pair.className = 'ins-person-grid';
      const hostRadar = document.createElement('div');
      const hostBars = document.createElement('div');
      pair.append(hostRadar, hostBars);
      hostK.appendChild(pair);
      I.radar(hostRadar, cK, personRows, { noKeys: true, aria: `${p.name} 和全班平均的雷达图` });
      I.compare(hostBars, cK, personRows, { noKeys: true, aria: `${p.name} 的学情卡` });
      if (scroll) cK.scrollIntoView({ block: 'nearest', behavior: 'smooth' });   // 只有点了姓名才滚过去；打开、刷新时不跳（2026-11-05 用户：“学情分析刷新后不要自动跳到下面”）
    };
    const firstPerson = Array.from(per.values()).sort((a, b) => b.acts - a.acts)[0];
    if (firstPerson) insState.showPerson(firstPerson.sid, false);

    // 6 需要关注的同学（每人一行，先列没有学习行为、学习天数少的）
    const range7 = !span || span >= 7;
    const rows = Array.from(per.values()).map((p) => ({ ...p, status: p.acts === 0 ? 'none' : range7 && p.days.size <= 1 ? 'low' : '' }))
      .sort((a, b) => (a.status === 'none' ? 0 : a.status === 'low' ? 1 : 2) - (b.status === 'none' ? 0 : b.status === 'low' ? 1 : 2) || a.acts - b.acts || a.sid.localeCompare(b.sid));
    const c6 = card(grid, '每位同学', `先列这段时间没有任何学习行为的（${rows.filter((r) => r.status === 'none').length} 人）和只学了一天的（${rows.filter((r) => r.status === 'low').length} 人），再按学习行为从少到多。`, true);
    const realmOfSid = new Map(realmRows.map((r) => [sidKey(r.sid), r]));
    const wrap = document.createElement('div');
    wrap.className = 'tw-scroll';
    wrap.innerHTML = `<table class="tw-table compact ins-people"><thead><tr><th>学号</th><th>姓名</th><th>境界</th><th>状态</th><th>学习天数</th><th>学习行为</th><th>递交</th><th>弹幕</th><th>修炼场</th><th>在线（分钟）</th><th>最近一次</th></tr></thead><tbody>${rows.map((p) => {
      const r = realmOfSid.get(p.sid);
      const flag = p.status === 'none' ? '<span class="ins-flag is-none"><i aria-hidden="true">●</i>没有学习行为</span>' : p.status === 'low' ? '<span class="ins-flag is-low"><i aria-hidden="true">▲</i>只学了一天</span>' : '';
      return `<tr><td>${esc(p.sid)}</td><td><button type="button" class="ins-name" data-ins-person="${esc(p.sid)}" title="看个人学情卡">${esc(p.name || p.sid)}</button></td><td>${r ? realmChip(Number(r.realm) || 0, `${REALMS[Number(r.realm) || 0].name}`) : ''}</td><td>${flag}</td><td>${p.days.size}</td><td>${p.acts}</td><td>${p.submit}</td><td>${p.danmaku}</td><td>${p.practice}</td><td>${Math.round(p.seconds / 60)}</td><td>${p.last ? esc(timeParts(p.last).text.slice(5, 16)) : '—'}</td></tr>`;
    }).join('')}</tbody></table>`;
    c6.appendChild(wrap);
    // 《金融机构与市场》（PLAIN，2026-11-20）：去掉境界、修为、修炼场、宗门、弹幕互动的图表和表格列，换上“学习投入和作答正确率”
    if (PLAIN) {
      const DROP = ['境界分布', '修为榜第一的修为构成', '课堂互动', '每天有多少同学在练', '修炼场各单元正确率', '本班弟子', '宗门分（历届）', '学习投入和修为'];
      Array.from(grid.querySelectorAll('.ins-card')).forEach((card) => { const h = card.querySelector('h3'); if (h && DROP.includes(h.firstChild && h.firstChild.textContent.trim())) card.remove(); });
      Array.from(grid.querySelectorAll('h3.ins-sec')).forEach((h) => { if (/^(修炼场|宗门)/.test(h.textContent.trim())) h.remove(); });
      const heads = Array.from(wrap.querySelectorAll('thead th')).map((th) => th.textContent);
      ['修炼场', '弹幕', '境界'].map((name) => heads.indexOf(name)).filter((i) => i >= 0).sort((a, b) => b - a)
        .forEach((i) => wrap.querySelectorAll('tr').forEach((tr) => { if (tr.children[i]) tr.children[i].remove(); }));
      const cY = card(grid, '学习投入和作答正确率', '每个点是一位同学：横轴是这段时间的学习行为次数，纵轴是客观题的正确率（每题只认第一次递交）；细线是两者的中位数。右下角是投入多、正确率偏低的同学，值得问一问卡在哪里。');
      const hostY = document.createElement('div'); cY.appendChild(hostY);
      const ptsY = Array.from(per.values()).filter((p) => (meRight.get(p.sid) || {}).answered).map((p) => ({ x: p.acts, y: rightOf(p), color: T.blue, label: `${p.name}（${p.sid}）`,
        lines: [`学习行为 ${p.acts} 次`, `客观题正确率 ${rightOf(p)}%（作答 ${meRight.get(p.sid).answered} 题）`, `学习天数 ${p.days.size}`] }));
      I.scatter(hostY, cY, ptsY, { xName: '学习行为（次）', yName: '正确率（%）', aria: '学习投入与作答正确率散点图', empty: '这段时间还没有客观题的作答。',
        quadrants: [[1, 1, '投入多 · 正确率高'], [0, 1, '投入少 · 正确率高'], [1, 0, '投入多 · 正确率偏低'], [0, 0, '投入少 · 正确率低']] });
      I.tableView(cY, ['学号', '姓名', '学习行为', '正确率'], ptsY.map((pt) => [pt.label.replace(/^.*（(.*)）$/, '$1'), pt.label.replace(/（.*$/, ''), pt.x, `${pt.y}%`]));
      grid.insertBefore(cY, cW);
    }
    if (arranged) arranged.finish();
    if (I.nav) I.nav(grid);   // 分组目录：点一下跳到那一组
  }
  if (PLAIN) {   // 这门课没有弹幕、修为、修炼场、灵田：工作台里几句通用的说明换成对得上的；匿名建议不设“点赞加修为”和回复
    // 2026-11-22：两页开头的说明改成“一句话＋展开说明”（.tw-intro），这里换成对得上这门课的一句话和几条
    const setIntro = (panel, lead, items) => {
      const box = $(`[data-panel="${panel}"] .tw-intro`);
      if (!box) return;
      box.querySelector('.tw-intro-lead').textContent = lead;
      box.querySelector('ul').innerHTML = items.map(([label, text]) => `<li><b>${esc(label)}：</b>${esc(text)}</li>`).join('');
    };
    setIntro('insight', '按本班的学习记录自动画出学习情况；只统计点名册上的同学，不含旁听。', [
      ['依据', '登录与在线、签到、递交、课堂感受等记录。'],
      ['图表', '每天在学人数、一周学习时段、各类行为、在线时长、每次课的到课和作答正确率，以及每位同学的明细。'],
      ['数据表与导出', '每张图下面可以“查看数据表”，全部明细可以导出 Excel。'],
    ]);
    setIntro('feedback', '学生在每次课页面最后的“匿名建议箱”里写的建议和疑问；这里只有内容和提交时间，看不到是谁写的。', [
      ['写些什么', '学生递交前要选一个标签：课程共建（对课堂节奏、课程内容的建议，或自己设计的上课内容、题目）、课程疑问（没听懂的地方、平台操作问题，可在下一次课统一解答）或纯唠嗑（生活、学习里的趣事，或者迷茫、困惑，随便聊聊）。上面可以按标签筛选；11 月 23 日以前提交的显示“未分类”。'],
      ['改标签', '学生没选对标签的，点这条建议左上角的标签，在弹出的小菜单里选课程共建、课程疑问或纯唠嗑就改好了（“未分类”的也可以补上）；学生自己“我提过的建议”里也跟着显示新标签。'],
      ['匿名', '这里和导出文件里只有内容和提交时间（2026-11-24 以前的建议只记了日期），看不到是谁写的。'],
      ['这堂课感觉怎么样', '建议箱上方还有“这堂课感觉怎么样”：学生点笑脸或不高兴的脸，每人每天一票、可以改，这里只显示人数，看不到是谁选的。'],
    ]);
    const plainCss = document.createElement('style');
    plainCss.textContent = '.tw-fb-like, .tw-fb-reply { display: none !important; }';
    document.head.appendChild(plainCss);
    const SWAP = [
      [/、修为和修为榜/g, ''],
      [/，不能发弹幕、提匿名建议，课堂小游戏（[^）]*）不会抽到/g, '，不能提匿名建议，课堂模拟分组时也不会分到'],
      [/课程页面和云间灵田开着且在前台时/g, '课程页面开着且在前台时'],
      [/（2026-11-20 起；在灵田里的时间也算）/g, ''],
      [/（加入、作业汇总与明细、弹幕）/g, '（加入、作业汇总与明细）'],
      [/递交、弹幕、修炼场答题、抢答、聊天室发言各一行/g, '递交各一行'],
      [/。修为满分只按范围内的课次计算（[^）]*）。/g, '。'],
      [/、作业、弹幕和匿名建议/g, '、作业和匿名建议'],
      [/不能递交、发弹幕，也不计修为/g, '不能递交'],
    ];
    const fixText = (node) => {
      const s = node.nodeValue;
      if (!s || !/修为|弹幕|灵田|修炼场/.test(s)) return;
      let out = s;
      SWAP.forEach(([from, to]) => { out = out.replace(from, to); });
      if (out !== s) node.nodeValue = out;
    };
    const fixTree = (root) => {
      if (root.nodeType === 3) { fixText(root); return; }
      if (root.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(root.tagName)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) fixText(node);
    };
    fixTree(document.body);
    new MutationObserver((list) => list.forEach((m) => { if (m.type === 'characterData') fixText(m.target); else m.addedNodes.forEach(fixTree); }))
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  $('[data-tab="insight"]').addEventListener('click', () => renderInsights(false));
  // ---------------- 学习心得（2026-11-26） ----------------
  // 用户：“……然后把统计结果放到教师控制台中，在学情分析右边再设一个‘学习心得’板块，可以看看每位同学对这堂课哪部分概念印象最深，哪些内容掌握得更好，
  //   不好的地方我也可以改进。”学生在每次课“课后心得”里交的（ck_reflections，按本班课堂读）：pick 印象最深的条目（政经概念 k1…，习经研讨题 q1…），
  //   marks {条目: 2 掌握了 / 1 基本懂 / 0 还没懂}，body 心得。只统计点名册上的同学（班外允许加入的不算，同学情分析）；“隐藏姓名”与学情分析共用
  const rfState = { run: 0, key: '', rows: null, at: 0, missing: false, export: null };
  const reflectCases = (room) => {
    if (!room || isExam(room.chapter)) return [];
    if (CONCEPT) {
      const unit = unitMap.get(room.chapter);
      return unit ? [{ no: String(unit.number).padStart(2, '0'), title: unit.title, items: (unit.concepts || []).map((k, i) => ({ id: k.id, label: `概念 ${i + 1} · ${k.name}` })) }] : [];
    }
    const chapter = chapterMap.get(room.chapter);
    const only = Number(room.case_no) || 0;
    return chapter ? chapter.cases.map((item) => caseMap.get(item.number)).filter((c) => c && (!only || Number(c.number) === only))
      .map((c) => ({ no: c.number, title: c.title, items: c.reflect || [] })) : [];
  };
  function paintReflectRooms() {
    const select = $('[data-rf-room]');
    const rooms = state.rooms.filter((room) => !isExam(room.chapter));
    const keep = select.value;
    select.innerHTML = `<option value="all">本班全部课堂（概览）</option>${rooms.map((room) => `<option value="${esc(room.id)}">${esc(room.name)} · ${esc(chapterLabel(room))}</option>`).join('')}`;
    const want = keep && (keep === 'all' || rooms.some((room) => String(room.id) === keep)) ? keep
      : state.room && rooms.some((room) => String(room.id) === String(state.room.id)) ? String(state.room.id) : 'all';
    select.value = want;
  }
  async function loadReflections(force) {
    const rooms = state.rooms.filter((room) => !isExam(room.chapter));
    const key = `${course.slug}:${state.klass.id}:${rooms.map((room) => room.id).join(',')}`;
    if (!force && rfState.rows && rfState.key === key && Date.now() - rfState.at < 30000) return rfState.rows;
    const ids = rooms.map((room) => Number(room.id) || room.id);
    let rows = [];
    try {
      rows = !ids.length ? [] : typeof backend.fetchRows === 'function' ? await backend.fetchRows('reflections', { in: ['classroom', ids] })
        : (await Promise.all(ids.map((id) => backend.fetchAll('reflections', { classroom: id })))).flat();
      rfState.missing = false;
    } catch (error) {
      if (!missingTable(error)) throw error;
      rfState.missing = true;
    }
    Object.assign(rfState, { key, rows, at: Date.now() });
    return rows;
  }
  const rfWhen = (iso) => { const ms = millis(iso); return ms ? `${isoDay(ms).slice(5).replace('-', '/')} ${clock(ms).slice(0, 5)}` : ''; };
  async function renderReflect(force) {
    const root = $('[data-rf-root]');
    const status = $('[data-rf-status]');
    const I = window.ClassLiveInsights;
    if (!root || !state.klass) return;
    if (!I) { root.textContent = '图表脚本没有加载，请刷新页面再试。'; return; }
    I.addStyle();
    addReflectStyle();
    paintReflectRooms();
    const run = ++rfState.run;
    status.textContent = '正在读取本班的课后心得……';
    let rows;
    try { rows = await loadReflections(force); } catch (error) { if (run !== rfState.run) return; console.error(error); status.textContent = `读取失败：${failReason(error)}`; return; }
    if (run !== rfState.run) return;
    root.textContent = '';
    rfState.export = null;
    if (rfState.missing) { status.textContent = '后台还没有“课后心得”这张表：执行 tools/cloudbase-pg-20261126-学习心得.sql 以后，学生交的心得就会显示在这里。'; return; }
    const roster = rosterOf();
    const core = roster.filter((person) => !person.extra);
    const coreSids = new Set(core.map((person) => sidKey(person.sid)));
    const inRoster = (sid) => !core.length || coreSids.has(sidKey(sid));
    const mine = rows.filter((row) => inRoster(row.sid));
    const people = new Map(core.map((person) => [sidKey(person.sid), person.name]));
    mine.forEach((row) => { if (!people.has(sidKey(row.sid))) people.set(sidKey(row.sid), row.name); });
    privacyMap(people, roster);
    const nameOf = (sid) => people.get(sidKey(sid)) || '';
    const rooms = state.rooms.filter((room) => !isExam(room.chapter));
    const pick = $('[data-rf-room]').value;
    const total = core.length;
    const read = `数据读于 ${clock(Date.now())}。${insPrivacy.on ? ' · 已隐藏姓名和学号' : ''}`;
    const T = I.tones;
    const LV = [{ v: 2, name: '掌握了', color: T.green }, { v: 1, name: '基本懂', color: T.yellow }, { v: 0, name: '还没懂', color: T.red }];
    const query = $('[data-rf-search]').value.trim();
    const grid = document.createElement('div');
    grid.className = 'ins-grid';
    root.appendChild(grid);
    // 每个课堂、每个案例的统计（概览和单个课堂共用）
    const statsOf = (list, items) => {
      const picks = new Map(items.map((it) => [it.id, 0]));
      const marks = new Map(items.map((it) => [it.id, [0, 0, 0]]));   // 掌握了、基本懂、还没懂
      list.forEach((row) => {
        if (picks.has(row.pick)) picks.set(row.pick, picks.get(row.pick) + 1);
        Object.entries(row.marks || {}).forEach(([id, v]) => { const m = marks.get(id); if (m && [0, 1, 2].includes(Number(v))) m[2 - Number(v)] += 1; });
      });
      const weak = items.map((it) => ({ it, m: marks.get(it.id) })).filter(({ m }) => m[2] > 0)
        .sort((a, b) => b.m[2] / (b.m[0] + b.m[1] + b.m[2]) - a.m[2] / (a.m[0] + a.m[1] + a.m[2]) || b.m[2] - a.m[2]);
      return { picks, marks, weak };
    };
    if (pick === 'all') {
      status.textContent = `${state.klass.name}全部课堂 · 点名册 ${total} 人 · 共 ${mine.length} 份心得。${read}`;
      const card = I.card(grid, '各次课的课后心得', '每次课（课堂）一行，最近的在上面；点一行看这次课的详细统计和每位同学的心得。', true);
      const lines = [];
      const html = rooms.map((room) => reflectCases(room).map((c) => {
        const list = mine.filter((row) => String(row.classroom) === String(room.id) && row.case_no === c.no);
        const st = statsOf(list, c.items);
        const top = c.items.slice().sort((a, b) => st.picks.get(b.id) - st.picks.get(a.id))[0];
        const topText = top && st.picks.get(top.id) ? `${top.label}（${st.picks.get(top.id)} 人）` : '—';
        const weakText = st.weak.length ? `${st.weak[0].it.label}（还没懂 ${st.weak[0].m[2]} 人）` : '—';
        lines.push([room.name, `案例 ${c.no} ${c.title}`, list.length, total ? Math.round(list.length / total * 100) : '', topText, weakText]);
        return `<tr data-rf-go="${esc(room.id)}" tabindex="0"><td>${esc(room.name)}</td><td>案例 ${esc(c.no)} · ${esc(c.title)}</td><td class="num">${list.length}${total ? ` <small>（${Math.round(list.length / total * 100)}%）</small>` : ''}</td>`
          + `<td>${esc(topText)}</td><td>${esc(weakText)}</td></tr>`;
      }).join('')).join('');
      card.insertAdjacentHTML('beforeend', `<div class="tw-scroll"><table class="tw-table rf-overview"><thead><tr><th>课堂</th><th>案例</th><th>写了心得</th><th>印象最深最多的</th><th>还没懂最多的</th></tr></thead>`
        + `<tbody>${html || '<tr><td colspan="5" class="empty">本班还没有课堂。</td></tr>'}</tbody></table></div>`);
      rfState.export = { name: '全部课堂', sheets: [{ name: '各次课', rows: [['课堂', '案例', '写了心得（人）', '占点名册（%）', '印象最深最多的', '还没懂最多的']].concat(lines), widths: [26, 30, 14, 12, 36, 36] }] };
      return;
    }
    const room = rooms.find((item) => String(item.id) === pick);
    if (!room) { status.textContent = '没有找到这个课堂。'; return; }
    const cases = reflectCases(room);
    const inRoom = mine.filter((row) => String(row.classroom) === String(room.id));
    status.textContent = `课堂“${room.name}”· 点名册 ${total} 人 · 写了心得 ${new Set(inRoom.map((row) => sidKey(row.sid))).size} 人。${read}`;
    const sheets = [];
    cases.forEach((c) => {
      const list = inRoom.filter((row) => row.case_no === c.no).sort((a, b) => millis(b.updated_at) - millis(a.updated_at));
      const label = new Map(c.items.map((it) => [it.id, it.label]));
      const st = statsOf(list, c.items);
      if (cases.length > 1) I.section(grid, `案例 ${c.no} · ${c.title}`, `${list.length} 份心得`);
      const texts = list.filter((row) => String(row.body || '').trim());
      I.tiles(grid, [
        { label: '写了心得', value: `${list.length} 人`, note: total ? `占点名册 ${Math.round(list.length / total * 100)}%` : '' },
        { label: '选了印象最深', value: `${list.filter((row) => label.has(row.pick)).length} 人` },
        { label: '写了几句心得', value: `${texts.length} 人`, note: texts.length ? `平均 ${Math.round(texts.reduce((t, row) => t + Array.from(String(row.body).trim()).length, 0) / texts.length)} 字` : '' },
        { label: '还没懂最多', value: st.weak.length ? st.weak[0].it.label.replace(/^概念 \d+ · |^Q\d+ · /, '') : '—', note: st.weak.length ? `还没懂 ${st.weak[0].m[2]} 人` : '' },
      ]).classList.add('is-wide');
      const add = (title, sub, wide) => { const box = I.card(grid, title, sub, wide); const host = document.createElement('div'); box.appendChild(host); return [box, host]; };
      const [c1, h1] = add('印象最深的概念', '每个概念被选为“印象最深”的人数（每人选一个）。');
      I.bars(h1, c1, c.items.map((it, i) => ({ label: it.label, value: st.picks.get(it.id), text: `${st.picks.get(it.id)} 人`, color: I.cat[i % I.cat.length] })),
        { labelMax: 220, aria: '印象最深的概念横条图', empty: '还没有同学选印象最深的概念。' });
      I.tableView(c1, ['概念', '选为印象最深（人）'], c.items.map((it) => [it.label, st.picks.get(it.id)]));
      const [c2, h2] = add('每个概念掌握得怎么样', '学生自己打的分：掌握了、基本懂、还没懂各几人；悬停看具体人数。');
      I.keys(h2, LV);
      I.splitBars(h2, c2, c.items.map((it) => ({ label: it.label, values: st.marks.get(it.id), lines: [it.label] })), LV, { unit: ' 人', aria: '每个概念掌握情况分段横条图', empty: '还没有同学给掌握情况打分。' });
      I.tableView(c2, ['概念', '掌握了', '基本懂', '还没懂'], c.items.map((it) => [it.label, ...st.marks.get(it.id)]));
      const [c3] = add('需要再讲讲', '“还没懂”占的比例从高到低；下次课可以先补一补，或者换个例子讲。', true);
      c3.insertAdjacentHTML('beforeend', st.weak.length
        ? `<ol class="rf-weak">${st.weak.map(({ it, m }) => `<li><b>${esc(it.label)}</b><span>还没懂 ${m[2]} 人、基本懂 ${m[1]} 人、掌握了 ${m[0]} 人（${m[0] + m[1] + m[2]} 人打了分）</span></li>`).join('')}</ol>`
        : '<p class="ins-empty">没有同学选“还没懂”。</p>');
      // 每位同学的心得（可查找）
      const shown = list.filter((row) => !query || `${nameOf(row.sid)} ${row.body || ''}`.includes(query));
      const [c4] = add('每位同学的心得', `最近保存的在上面${query ? `；查找“${query}”：${shown.length} 份` : ''}。学生可以改了再保存，这里是最新的一份。`, true);
      const chip = (v) => { const lv = LV.find((x) => x.v === Number(v)); return lv ? `<i class="rf-chip is-${lv.v}">${lv.name}</i>` : '<i class="rf-chip">未选</i>'; };
      c4.insertAdjacentHTML('beforeend', `<div class="tw-scroll"><table class="tw-table rf-people"><thead><tr><th>姓名</th><th>印象最深</th><th>掌握情况</th><th>心得</th><th>保存时间</th></tr></thead><tbody>`
        + (shown.map((row) => `<tr><td class="tw-nowrap">${esc(nameOf(row.sid))}</td><td>${esc(label.get(row.pick) || '—')}</td>`
          + `<td class="rf-marks">${c.items.map((it) => `<span><em>${esc(it.label.replace(/ · .*/, ''))}</em>${chip((row.marks || {})[it.id])}</span>`).join('')}</td>`
          + `<td class="rf-text">${esc(String(row.body || '').trim()) || '<span class="tw-sub">（没写）</span>'}</td><td class="tw-nowrap">${esc(rfWhen(row.updated_at))}</td></tr>`).join('')
          || `<tr><td colspan="5" class="empty">${query ? '没有找到。' : '还没有同学交心得。'}</td></tr>`) + '</tbody></table></div>');
      sheets.push({ name: `案例${c.no}`, rows: [['姓名', '学号', '印象最深', ...c.items.map((it) => it.label), '心得', '字数', '保存时间']]
        .concat(list.map((row) => [nameOf(row.sid), insPrivacy.on ? '••••' : String(row.sid), label.get(row.pick) || '', ...c.items.map((it) => { const lv = LV.find((x) => x.v === Number((row.marks || {})[it.id])); return lv ? lv.name : ''; }),
          String(row.body || '').trim(), Array.from(String(row.body || '').trim()).length, rfWhen(row.updated_at)])), widths: [12, 16, 26, ...c.items.map(() => 14), 60, 8, 14] });
    });
    if (!cases.length) I.empty(grid, '这个课堂没有课后心得（期中考查作业的课堂不设）。');
    rfState.export = { name: room.name, sheets };
  }
  function addReflectStyle() {
    if (document.getElementById('tw-rf-style')) return;
    const style = document.createElement('style');
    style.id = 'tw-rf-style';
    style.textContent = `
    [data-panel="reflect"] .tw-bar input[type=search] { min-width: 200px; }
    .rf-overview tbody tr { cursor: pointer; } .rf-overview tbody tr:hover, .rf-overview tbody tr:focus-visible { background: #f3eee5; outline: none; }
    .rf-overview small { color: #6d6259; font-weight: 400; }
    .rf-weak { margin: 4px 0 0; padding-left: 22px; } .rf-weak li { margin: 6px 0; line-height: 1.7; } .rf-weak b { margin-right: 10px; } .rf-weak span { color: #5f554c; }
    .rf-people td { vertical-align: top; } .rf-people .rf-text { min-width: 260px; max-width: 520px; white-space: pre-wrap; line-height: 1.75; }
    .rf-marks { min-width: 180px; } .rf-marks span { display: inline-flex; align-items: center; gap: 4px; margin: 0 10px 4px 0; white-space: nowrap; } .rf-marks em { font-style: normal; color: #6d6259; font-size: 12.5px; }
    .rf-chip { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #eee7da; color: #5f554c; font-style: normal; font-size: 12.5px; font-weight: 700; }
    .rf-chip.is-2 { background: #e2f3d3; color: #2f6b12; } .rf-chip.is-1 { background: #fff3c4; color: #7a5a00; } .rf-chip.is-0 { background: #ffe1dc; color: #a62a1c; }
    `;
    document.head.appendChild(style);
  }
  $('[data-tab="reflect"]').addEventListener('click', () => renderReflect(false));
  $('[data-rf-room]').addEventListener('change', () => renderReflect(false));
  $('[data-rf-refresh]').addEventListener('click', () => renderReflect(true));
  let rfSearchTimer = 0;
  $('[data-rf-search]').addEventListener('input', () => { clearTimeout(rfSearchTimer); rfSearchTimer = setTimeout(() => renderReflect(false), 250); });
  $('[data-rf-root]').addEventListener('click', (event) => {
    const go = event.target.closest('[data-rf-go]');
    if (go) { $('[data-rf-room]').value = go.dataset.rfGo; renderReflect(false); }
  });
  $('[data-rf-root]').addEventListener('keydown', (event) => {
    const go = event.target.closest('[data-rf-go]');
    if (go && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); $('[data-rf-room]').value = go.dataset.rfGo; renderReflect(false); }
  });
  $('[data-rf-privacy]').addEventListener('click', () => {
    insPrivacy.on = !insPrivacy.on;
    try { localStorage.setItem('teacher:ins-privacy', insPrivacy.on ? '1' : '0'); } catch (error) { /* 忽略 */ }
    paintPrivacyButton();
    watchPrivacy();
    renderReflect(false);
  });
  $('[data-rf-export]').addEventListener('click', () => {
    if (!rfState.export || !rfState.export.sheets.length) { $('[data-rf-status]').textContent = '还没有可以导出的心得：先选一个课堂。'; return; }
    const O = window.ClassLive.office;
    O.save(O.xlsxBook(rfState.export.sheets), `${course.title}_${safeName(state.klass.name)}_学习心得_${safeName(rfState.export.name)}_${window.ClassLive.today()}.xlsx`);
  });
  // ---------------- 更新说明（2026-11-06 用户：“超过20天以上的更新状态不在学生端的‘更新说明’中显示。但是在教师控制台专门设置一个新的‘更新说明’板块记录所有更新情况。”） ----------------
  //   上半部分：本课程学生页“更新说明”的全部条目（live-core 的 newsList），标出哪些已超过 20 天、学生页不再显示；
  //   下半部分：全部更新记录（构建时从对话记录整理，TEACHER_DATA.updates：编号、日期、内容、上线提交），可搜索
  function renderUpdates() {
    const Live = window.ClassLive;
    const days = Live.NEWS_DAYS || 20;
    const cutoff = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(Date.now() - days * 86400000));
    // 2026-11-21 用户：“更新说明，不同日期的单独列出来，按照天为单位……按照最近日期更新放最上面。不要一段时间的更新都放一起。”
    //   newsList 现在一天一组（最近的一天在最上面）；一天里的条目要么都还在学生页显示、要么都已不显示，标在日期后面
    const sections = Live.newsList ? Live.newsList(course.slug, 0) : [];
    const shown = sections.reduce((n, section) => n + (section.day >= cutoff ? section.items.length : 0), 0);
    const total = sections.reduce((n, section) => n + section.items.length, 0);
    $('[data-up-news-note]').textContent = `${course.title}：共 ${total} 条，学生页现在显示最近 ${days} 天的 ${shown} 条；一天一组，最近的在最上面`;
    // 2026-11-22 第二档美化：时间线——最近 3 天展开、更早的收起；每条先显示标题和一行预览，点开看全文（上面有“全部展开／全部收起”）
    $('[data-up-news]').innerHTML = sections.map((section, index) => {
      const off = section.day < cutoff;
      return `<details class="tw-up-sec${off ? ' is-off' : ''}"${index < 3 ? ' open' : ''}><summary><span>${esc(section.title)}</span><small>${section.items.length} 条</small><em>${off ? '学生页已不显示' : '学生页显示中'}</em></summary>`
        + `<ul>${section.items.map(([label, text, , topic]) => `<li><details class="tw-up-item"><summary><b>${esc(topic ? `${topic} · ${label}` : label)}</b><span class="tw-up-peek">${esc(text)}</span></summary><p>${esc(text)}</p></details></li>`).join('')}</ul></details>`;
    }).join('') || '<p class="tw-hint">（没有读到学生页的更新说明）</p>';
    paintUpdateRows();
  }
  // 全部更新记录：同样一天一组，每天前面一行日期（和这一天有几次更新），最近的一天在最上面
  const updateDay = (date) => `${String(date).slice(0, 4) === String(new Date().getFullYear()) ? '' : `${Number(String(date).slice(0, 4))} 年 `}${Number(String(date).slice(5, 7))} 月 ${Number(String(date).slice(8, 10))} 日`;
  // 2026-11-22 第二档美化：默认只列最近 5 天，下面“显示更早的……”再全部列出；查找时列出全部符合的
  const UP_RECENT_DAYS = 5;
  let upShowAll = false;
  function paintUpdateRows() {
    const rows = (DATA.updates || []).slice().reverse();
    const query = $('[data-up-search]').value.trim();
    const matched = rows.filter((row) => !query || `${row.date} ${updateDay(row.date)} ${updateDay(row.date).replace(/\s/g, '')} ${row.no} ${row.title} ${row.commit}`.includes(query));
    const matchedDays = Array.from(new Set(matched.map((row) => row.date)));
    const keepDays = new Set(query || upShowAll ? matchedDays : matchedDays.slice(0, UP_RECENT_DAYS));
    const list = matched.filter((row) => keepDays.has(row.date));
    const moreDays = matchedDays.length - keepDays.size;
    $('[data-up-more-box]').hidden = !moreDays;
    $('[data-up-more]').textContent = moreDays ? `显示更早的 ${moreDays} 天（${matched.length - list.length} 次更新）` : '';
    const dayCount = new Set(rows.map((row) => row.date)).size;
    $('[data-up-summary]').textContent = rows.length
      ? `共 ${rows.length} 次更新，分在 ${dayCount} 天（${updateDay(rows[rows.length - 1].date)}—${updateDay(rows[0].date)}）${query ? `，符合条件 ${matched.length} 次` : ''}。“上线”是网站发布的提交号；空着的是和后面某次一起上线，或只改了本机文件（讲义、Word 等）。`
      : '还没有整理出更新记录（网站构建时从对话记录整理）。';
    const perDay = list.reduce((map, row) => map.set(row.date, (map.get(row.date) || 0) + 1), new Map());
    let day = '';
    $('[data-up-rows]').innerHTML = list.map((row) => {
      const first = row.date !== day;
      day = row.date;
      return `${first ? `<tr class="tw-up-day"><th colspan="3" scope="colgroup"><span>${esc(updateDay(row.date))}</span><small>${perDay.get(row.date)} 次更新</small></th></tr>` : ''}`
        + `<tr><td>${esc(row.no)}</td><td class="tw-up-title">${esc(row.title)}</td><td>${row.commit ? `<code>${esc(row.commit)}</code>` : ''}</td></tr>`;
    }).join('') || '<tr><td colspan="3" class="empty">没有符合条件的更新。</td></tr>';
  }
  $('[data-tab="updates"]').addEventListener('click', renderUpdates);
  $('[data-up-search]').addEventListener('input', paintUpdateRows);
  $('[data-panel="updates"]').addEventListener('click', (event) => {
    const all = event.target.closest('[data-up-open]');
    if (all) { const open = all.dataset.upOpen === '1'; $$('[data-up-news] details').forEach((box) => { box.open = open; }); return; }
    if (event.target.closest('[data-up-more]')) { upShowAll = true; paintUpdateRows(); }
  });
  $('[data-ins-root]').addEventListener('click', (event) => {
    const who = event.target.closest('[data-ins-person]');
    if (who && insState.showPerson) insState.showPerson(who.dataset.insPerson, true);
  });
  $('[data-ins-scope]').addEventListener('change', () => renderInsights(false));
  $('[data-ins-range]').addEventListener('change', () => renderInsights(false));
  $('[data-ins-refresh]').addEventListener('click', () => renderInsights(true));
  $('[data-ins-privacy]').addEventListener('click', () => {
    insPrivacy.on = !insPrivacy.on;
    try { localStorage.setItem('teacher:ins-privacy', insPrivacy.on ? '1' : '0'); } catch (error) { /* 忽略 */ }
    paintPrivacyButton();
    watchPrivacy();
    renderInsights(false);
  });
  paintPrivacyButton();
  watchPrivacy();
  let insResize = 0;
  window.addEventListener('resize', () => { clearTimeout(insResize); insResize = setTimeout(() => { if (!$('[data-panel="insight"]').hidden) renderInsights(false); }, 300); });
  $$('[data-learn-export]').forEach((button) => button.addEventListener('click', () => exportLearning(button)));
  // 浏览器信息只显示大概：系统＋浏览器
  const browserOf = (agent) => {
    const text = String(agent || '');
    const os = /iPhone|iPad/.test(text) ? 'iOS' : /Android/.test(text) ? 'Android' : /Mac OS X/.test(text) ? 'macOS' : /Windows/.test(text) ? 'Windows' : /Linux/.test(text) ? 'Linux' : '';
    const browser = /Edg\//.test(text) ? 'Edge' : /Chrome\//.test(text) ? 'Chrome' : /Firefox\//.test(text) ? 'Firefox' : /Safari\//.test(text) ? 'Safari' : '';
    return [os, browser].filter(Boolean).join(' · ') || text.slice(0, 60);
  };
  async function secAction(label, call) {
    $('[data-sec-status]').textContent = `${label}……`;
    let message = `${label}：已完成（${clock(Date.now())}）`;
    try {
      await call();
    } catch (error) {
      console.error(error);
      message = `${label}失败：${error.message || error}`;
    }
    await loadSecurity(true);
    $('[data-sec-status]').textContent = message;
  }
  $('[data-panel="security"]').addEventListener('click', async (event) => {
    const allow = event.target.closest('[data-sec-allow]');
    const reject = event.target.closest('[data-sec-reject]');
    const audit = event.target.closest('[data-sec-audit]');
    const unlock = event.target.closest('[data-sec-unlock]');
    const reset = event.target.closest('[data-sec-reset]');
    const pinAllow = event.target.closest('[data-sec-pin-allow]');
    const pinDeny = event.target.closest('[data-sec-pin-deny]');
    if (pinAllow || pinDeny) {
      const id = (pinAllow || pinDeny).dataset[pinAllow ? 'secPinAllow' : 'secPinDeny'];
      const row = sec.pinreqs.find((item) => String(item.id) === id);
      if (!row) return;
      if (pinAllow && !window.confirm(`同意重设 ${row.name}（学号 ${row.sid}）的口令？\n\n同意后旧口令作废，只有提出申请的那台设备能设新口令；该生已经登录过的其他设备照常使用。\n请先确认是本人申请的（例如课上当面问一下）。`)) return;
      await secAction(pinAllow ? `同意重设 ${row.name} 的口令` : `拒绝 ${row.name} 的口令申请`,
        () => backend.rpc('ck_decide_pin_request', { p_id: Number(row.id) || row.id, p_allow: Boolean(pinAllow) }));
      return;
    }
    if (audit) {
      const row = sec.requests.find((item) => String(item.id) === audit.dataset.secAudit);
      if (!row) return;
      await secAction(`允许 ${row.name} 旁听`, async () => {
        await backend.rpc('ck_audit_request', { p_id: Number(row.id) || row.id });
        await loadClasses();
        showClassInfo();
        renderCheckins();
      });
      return;
    }
    if (allow || reject) {
      const id = (allow || reject).dataset[allow ? 'secAllow' : 'secReject'];
      const row = sec.requests.find((item) => String(item.id) === id);
      if (!row) return;
      if (allow && !window.confirm(`把 ${row.name}（学号 ${row.sid}）加进本班点名册？\n\n加进点名册后和本班同学一样：作答、弹幕计入统计，参与修为和修为榜。只想让他看内容、做题的话，请点“允许旁听”。`)) return;
      if (reject && (row.status === 'approved' || row.status === 'audit')
        && !window.confirm(`撤销${row.status === 'audit' ? '旁听' : '允许'} ${row.name}（学号 ${row.sid}）？${row.status === 'audit' ? '该生' : '该生会从本班点名册移除，'}已登录的设备不能再进入，也不能再登录。`)) return;
      await secAction(allow ? `把 ${row.name} 加进点名册` : `拒绝 ${row.name}`, async () => {
        await backend.rpc('ck_decide_request', { p_id: Number(row.id) || row.id, p_allow: Boolean(allow) });
        await loadClasses();
        showClassInfo();
        renderCheckins();
      });
    } else if (unlock) {
      await secAction(`解锁学号 ${unlock.dataset.secUnlock}`, () => backend.rpc('ck_unlock_pin', { p_class: secClassId(), p_sid: unlock.dataset.secUnlock }));
    } else if (reset) {
      const sid = reset.dataset.secReset;
      if (!window.confirm(`重置 ${reset.dataset.secName}（学号 ${sid}）的口令？\n\n该生所有已登录的设备都要回首页重新登录，并重新设置口令。\n如果是有人冒用了这个学号，重置后请让本人马上重新登录、设置新口令。`)) return;
      await secAction(`重置学号 ${sid} 的口令`, () => backend.rpc('ck_reset_pin', { p_class: secClassId(), p_sid: sid }));
    }
  });
  $('[data-tab="security"]').addEventListener('click', () => loadSecurity(true));
  $('[data-sec-refresh]').addEventListener('click', () => loadSecurity(true));
  $('[data-sec-search]').addEventListener('input', renderSecurity);
  $('[data-sec-filter]').addEventListener('change', renderSecurity);
  setInterval(() => { if (state.klass && !document.hidden) loadSecurity(!$('[data-panel="security"]').hidden); }, 10000);

  // ---------------- 启动 ----------------
  (async () => {
    if (!backend) { showLogin(); return; }
    try {
      const session = await backend.session();
      if (session && !session.anonymous) {
        logTeacherEntry('打开工作台', false);
        await enterApp(session);
      } else showLogin();
    } catch (error) {
      console.error(error);
      showLogin('无法连接课堂后台，请检查网络后刷新。');
    }
  })();
})();
