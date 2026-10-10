/* 教师工作台：登录（第二道锁）后先选择课程、再选择班级（一门课可有多个班级，各班数据分开，可单独删除），再管理“我的课堂”——发布本周课堂（选定章节或案例、生成课堂码）、
 * 结束提交、重新发布；查看加入名单、弹幕，以及作答情况：
 *   章节案例课程（case-html）：投票与选择、文字作答；
 *   概念学习课程（concept-html，如《政治经济学》）：作业情况（逐题分布与正确率）、学生作答（逐人批阅）。
 * 导出 CSV；学期末清空。页面需先设置 window.CLASS_LIVE_CONFIG、window.TEACHER_DATA，并加载 live-core.js。
 */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  const DATA = window.TEACHER_DATA;
  const store = {
    get: (key) => { try { return localStorage.getItem('teacher:' + key); } catch (error) { return null; } },
    set: (key, value) => { try { localStorage.setItem('teacher:' + key, value); } catch (error) { /* 忽略 */ } },
  };
  // 课程：上次选择的课程；有多门课程而尚未选择时，登录后先显示“选择课程”
  const savedCourse = store.get('course');
  const course = DATA.courses.find((item) => item.slug === savedCourse) || DATA.courses[0];
  const mustPick = DATA.courses.length > 1 && !DATA.courses.some((item) => item.slug === savedCourse);
  const CONCEPT = course.kind === 'concept-html';
  const UNIT = course.unit_label || '章节';
  const caseMap = new Map((course.cases || []).map((item) => [item.number, item]));
  const unitMap = new Map((course.units || []).map((item) => [item.unit, item]));
  const chapterMap = new Map(course.chapters.map((item) => [item.id, item]));
  const TRASH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const ACTION_HEAD = '<th class="tw-col-action"><span class="sr-only">删除</span></th>';
  const deleteCell = (row) => `<td class="tw-col-action"><button type="button" class="tw-trash" data-student-delete="${esc(row.sid)}" title="删除该学生在本课堂的记录" aria-label="删除 ${esc(Array.from(row.names).join('、'))} 在本课堂的记录">${TRASH_ICON}</button></td>`;
  const KINDS = CONCEPT ? ['checkins', 'homework', 'danmaku'] : ['checkins', 'choices', 'answers', 'danmaku'];
  const emptyDocs = () => ({ checkins: [], choices: [], answers: [], danmaku: [], homework: [] });
  // 班级：本机记住每门课上次选的班级（投屏页据此挑选当前课堂，见 ClassLive.pickRoom）
  const CLASS_KEY = `class:${course.slug}`;
  // 数据库时间（可能带微秒）→ 毫秒
  const millis = (value) => (value ? Date.parse(String(value).replace(/(\.\d{3})\d+/, '$1')) || 0 : 0);
  const clock = (ts) => ts ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ts)) : '';
  const isoDay = (ts) => ts ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(ts)) : '';
  const pct = (value, total) => (total ? Math.round(value / total * 100) : 0);
  const joinLink = (code) => `${location.origin}/?join=${encodeURIComponent(code)}`;
  $('[data-course-title]').textContent = mustPick ? '请选择课程' : course.title;
  document.title = mustPick ? '教师工作台' : `教师工作台 · ${course.title}`;

  // 按课程类型显示标签页与文字
  $$('[data-kind-only]').forEach((tab) => { tab.hidden = tab.dataset.kindOnly !== course.kind; });
  $$('[data-unit-label]').forEach((el) => { el.textContent = UNIT; });
  $('[data-publish-unit]').textContent = `本次${UNIT}`;
  $('[data-room-empty]').textContent = `还没有发布课堂。点击右上角“发布本周课堂”，选择${UNIT}后生成课堂码，再把课堂码或加入链接展示给学生。`;
  if (CONCEPT) {
    $('[data-room-classroom]').textContent = '打开本案例讲解版（投屏，弹幕和学生作答分布在此显示）↗';
    $('[data-panel="pages"] .tw-note').textContent = '讲解版（含参考答案和教师参考）只在教师端提供，学生拿到的是练习版。上课投屏打开对应案例：弹幕开启时在页面上滚动显示；“想一想”“辨一辨”和出门测下方会显示学生的作答分布，点“显示分布”才展开。';
    $('[data-export="room"]').textContent = '导出本课堂（加入、作业汇总与明细、弹幕）';
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
      backend.rpc('ck_log_teacher_login', { p_agent: navigator.userAgent.slice(0, 200) }).catch((problem) => console.warn('[教师登录记录]', problem));
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

  async function enterApp(session) {
    $('[data-login]').hidden = true;
    $('[data-when-login]').hidden = false;
    $('[data-user]').textContent = session.name ? `教师：${session.name}` : '教师已登录';
    $('[data-switch-course]').disabled = DATA.courses.length < 2;
    $('[data-nav]').hidden = false;
    updateNav();
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
    await loadRooms(store.get(`room:${state.klass.id}`));
    realmResult = null;
    realmSaved = '';
    renderRealms();
    sec.loaded = false;
    sec.requests = [];
    sec.pins = [];
    loadSecurity(!$('[data-panel="security"]').hidden);
    autoSettle().catch((error) => console.warn('[修为境界] 自动结算没有完成：', error));
  }

  // ---------------- 选择课程 ----------------
  function showPicker() {
    $('[data-app]').hidden = true;
    $('[data-class-picker]').hidden = true;
    $('[data-course-picker]').hidden = false;
    updateNav('course');
    if (!state.started) setLive('请选择课程');
    const list = $('[data-course-list]');
    list.innerHTML = DATA.courses.map((item) => `
      <button type="button" class="tw-course${!mustPick && item.slug === course.slug ? ' is-current' : ''}" data-course="${esc(item.slug)}">
        <small>${item.kind === 'concept-html' ? '概念学习案例' : '章节案例'} · 共 ${item.chapters.length} 个${esc(item.unit_label || '章节')}${!mustPick && item.slug === course.slug ? ' · 正在使用' : ''}</small>
        <strong>${esc(item.title)}</strong>
        <span data-course-room>正在读取当前课堂……</span>
      </button>`).join('');
    DATA.courses.forEach(async (item) => {
      const label = list.querySelector(`[data-course="${item.slug}"] [data-course-room]`);
      try {
        const rooms = await backend.fetchAll('classrooms', { course: item.slug });
        const current = rooms.filter((room) => room.is_current);
        label.textContent = current.length
          ? `开放中的课堂：${current.map((room) => `${room.name}（${room.code}）`).join('、')}`
          : `暂无开放中的课堂${rooms.length ? `（历史课堂 ${rooms.length} 个）` : ''}`;
      } catch (error) {
        label.textContent = '无法读取课堂信息';
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
    $('[data-class-course]').textContent = course.title;
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
    $('[data-class-list]').innerHTML = state.classes.map((klass) => {
      const mine = rooms.filter((room) => sameClass(room, klass));
      const current = mine.find((room) => room.is_current);
      const roster = Array.isArray(klass.roster) ? klass.roster.length : 0;
      return `<div class="tw-class-item"><button type="button" class="tw-course${state.klass && String(state.klass.id) === String(klass.id) ? ' is-current' : ''}" data-class="${esc(klass.id)}">
        <small>课堂 ${mine.length} 个 · 点名册 ${roster ? `${roster} 人` : '未上传'}</small>
        <strong>${esc(klass.name)}</strong>
        <span>${current ? `当前课堂：${esc(current.name)}（${esc(current.code)}）${current.submissions_open ? '' : ' · 已结束提交'}` : '暂无开放中的课堂'}</span>
      </button><button type="button" class="tw-trash" data-class-delete="${esc(klass.id)}" title="删除班级" aria-label="删除班级 ${esc(klass.name)}">${TRASH_ICON}</button></div>`;
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
  $('[data-class-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const error = $('[data-class-error]');
    error.textContent = '';
    if (!name) { error.textContent = '请填写班级名称'; return; }
    try {
      await backend.rpc('ck_create_class', { p_course: course.slug, p_name: name });
      form.elements.name.value = '';
      await showClassPicker(`已新建班级“${name}”，点上方卡片进入。`);
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
    $('[data-class-rooms]').textContent = state.rooms.length;
    updateNav();
    const roster = rosterOf();
    $('[data-roster-info]').textContent = roster.length
      ? `本班点名册：${roster.length} 人${klass.roster_updated_at ? `（${isoDay(millis(klass.roster_updated_at))} 上传）` : ''}，重新上传会替换。下表按点名册核对本次课堂的登录情况。`
      : '请上传本班点名册（xlsx 或 csv，需含“姓名”“学号”两列）：没有点名册时学生不能登录；上传后还能核对哪些同学已登录本次课堂。';
  }

  // ---------------- 我的课堂 ----------------
  const roomStatus = (room) => {
    if (!room.is_current) return { text: '历史课堂（未开放）', cls: 'is-past' };
    return room.submissions_open ? { text: '当前课堂 · 学生可进入', cls: 'is-live' } : { text: '当前课堂 · 已结束提交', cls: 'is-closed' };
  };
  const chapterLabel = (room) => {
    const chapter = chapterMap.get(room.chapter);
    return chapter ? `${chapter.cn} ${chapter.title}` : room.chapter;
  };
  const roomCases = () => {
    const chapter = state.room && chapterMap.get(state.room.chapter);
    return chapter ? chapter.cases.map((item) => caseMap.get(item.number)).filter(Boolean) : [];
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
  function renderRoomList() {
    $('[data-room-list]').innerHTML = state.rooms.map((room) => {
      const status = roomStatus(room);
      const active = state.room && String(state.room.id) === String(room.id);
      const day = isoDay(millis(room.created_at));
      return `<div class="tw-class-item tw-room-item"><button type="button" class="tw-course${active ? ' is-current' : ''}" data-room="${esc(room.id)}" aria-pressed="${active}">
        <small class="${status.cls}">${esc(status.text)}</small>
        <strong>${esc(room.name)}</strong>
        <span>${esc(chapterLabel(room))} · ${esc(room.code)}${day ? ` · ${day}` : ''}</span>
      </button><button type="button" class="tw-trash" data-room-delete="${esc(room.id)}" title="删除本堂课" aria-label="删除课堂 ${esc(room.name)}">${TRASH_ICON}</button></div>`;
    }).join('');
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
    try { await backend.removeAll('bonus', where); } catch (error) { if (!missingTable(error)) throw error; }
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
    if (changed) { state.openStudents.clear(); state.openTexts.clear(); setupSelectors(); subscribe(); }
  }

  function renderRoom() {
    const room = state.room;
    const status = roomStatus(room);
    const badge = $('[data-room-status]');
    badge.textContent = status.text;
    badge.className = `tw-badge ${status.cls}`;
    $('[data-room-name]').textContent = room.name;
    const chapter = chapterMap.get(room.chapter);
    $('[data-room-chapter]').textContent = !chapter ? room.chapter : CONCEPT
      ? `${chapterLabel(room)}（教材：${chapter.chapter}）`
      : `${chapterLabel(room)}：${chapter.cases.map((item) => `案例${item.number} ${item.title}`).join('；')}`;
    const open = $('[data-room-classroom]');
    open.href = chapter ? `/${chapter.file}?class=${encodeURIComponent(state.klass.id)}` : '#';
    // “修为境界”里的试用特效：打开本课堂的投屏页并展开试用面板（只在本机播放）
    $('[data-realm-demo]').href = chapter ? `/${chapter.file}?class=${encodeURIComponent(state.klass.id)}&demo=1` : demoHref();
    $('[data-room-code]').textContent = room.code;
    $('[data-room-code-label]').textContent = room.is_current ? '当前课堂码' : '历史课堂码（未开放）';
    $('[data-room-link]').value = joinLink(room.code);
    $('[data-rotate-code]').hidden = !room.is_current;
    $('[data-set-current]').hidden = room.is_current;
    $('[data-toggle-open]').hidden = !room.is_current;
    $('[data-toggle-open]').textContent = room.submissions_open ? '结束提交' : '重新开放提交';
    $('[data-stop-room]').hidden = !room.is_current;
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
  $('[data-set-current]').addEventListener('click', () => {
    if (!window.confirm(`把“${state.room.name}”重新设为当前课堂？原课堂码 ${state.room.code} 将重新开放，其他课堂随即停止进入。`)) return;
    roomAction('重新发布', () => backend.rpc('ck_set_current', { p_classroom: Number(state.room.id), p_current: true }));
  });
  $('[data-toggle-open]').addEventListener('click', () => {
    const open = !state.room.submissions_open;
    if (!open && !window.confirm('结束提交后，学生不能再递交作答、发弹幕（已递交的保留）。确定结束吗？')) return;
    roomAction(open ? '重新开放提交' : '结束提交', () => backend.rpc('ck_set_open', { p_classroom: Number(state.room.id), p_open: open }));
  });
  $('[data-stop-room]').addEventListener('click', () => {
    if (!window.confirm(`停止“${state.room.name}”？课堂码 ${state.room.code} 将不能再进入，已提交的记录保留。`)) return;
    roomAction('停止课堂', () => backend.rpc('ck_set_current', { p_classroom: Number(state.room.id), p_current: false }));
  });
  $('[data-danmaku-mode]').addEventListener('change', (event) => {
    roomAction('设置弹幕', () => backend.rpc('ck_set_danmaku', { p_classroom: Number(state.room.id), p_mode: event.target.value }));
  });
  // 匿名：投屏不显示学生姓名；弹幕记录照常保存发送人
  $('[data-danmaku-anon]').addEventListener('change', (event) => {
    const on = event.target.checked;
    roomAction(on ? '开启弹幕匿名' : '关闭弹幕匿名', () => backend.rpc('ck_set_danmaku_anon', { p_classroom: Number(state.room.id), p_anon: on }));
  });
  // 课堂码外传时：换一个新码，旧码立即失效；已经进入本课堂的同学（设备已核对）不受影响
  $('[data-rotate-code]').addEventListener('click', () => {
    if (!window.confirm(`更换“${state.room.name}”的课堂码？\n\n旧码 ${state.room.code} 立即失效；已经进入本课堂的同学不受影响，还没进入的同学要用新码。`)) return;
    roomAction('更换课堂码', () => backend.rpc('ck_rotate_code', { p_classroom: Number(state.room.id) }));
  });
  $('[data-copy-link]').addEventListener('click', async () => {
    const link = joinLink(state.room.code);
    try { await navigator.clipboard.writeText(link); actionStatus('加入链接已复制'); } catch (error) {
      $('[data-room-link]').select();
      actionStatus('请按 Ctrl/⌘ + C 复制加入链接');
    }
  });

  // 发布本周课堂
  const dialog = $('[data-publish-dialog]');
  const publishForm = $('[data-publish-form]');
  function fillChapterOptions() {
    publishForm.elements.chapter.innerHTML = course.chapters.map((chapter) => CONCEPT
      ? `<option value="${chapter.id}">${esc(chapter.cn)} ${esc(chapter.title)}（教材：${esc(chapter.chapter)}）</option>`
      : `<option value="${chapter.id}">${esc(chapter.cn)} ${esc(chapter.title)}（案例 ${chapter.cases.map((item) => item.number).join('、')}）</option>`).join('');
  }
  $('[data-publish-open]').addEventListener('click', () => {
    $('[data-publish-error]').textContent = '';
    if (state.room) publishForm.elements.chapter.value = state.room.chapter;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    publishForm.elements.name.focus();
  });
  $('[data-publish-cancel]').addEventListener('click', () => dialog.close());
  publishForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = publishForm.elements.name.value.trim();
    if (!name) { $('[data-publish-error]').textContent = '请填写课堂名称'; return; }
    const button = publishForm.querySelector('[type=submit]');
    button.disabled = true;
    button.textContent = '正在发布……';
    try {
      const row = await backend.rpc('ck_publish', { p_course: course.slug, p_name: name, p_chapter: publishForm.elements.chapter.value,
        p_class: Number(state.klass.id) || state.klass.id });
      const room = Array.isArray(row) ? row[0] : row;
      dialog.close();
      publishForm.elements.name.value = '';
      await loadRooms(room && room.id);
      actionStatus(`已发布：课堂码 ${room.code}`);
    } catch (error) {
      console.error(error);
      $('[data-publish-error]').textContent = `发布失败：${error.message || error}`;
    } finally {
      button.disabled = false;
      button.textContent = '发布并生成课堂码';
    }
  });

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

  // ---------------- 匿名建议（表里没有提交者，只有日期） ----------------
  const missingTable = (error) => /42P01|PGRST205|does not exist|Could not find the table/i.test(`${(error && error.code) || ''} ${(error && error.message) || error || ''}`);
  let feedbackRows = [];
  let feedbackProblem = '';
  async function loadFeedback() {
    if (!state.klass) return;
    const rooms = $('[data-fb-scope]').value === 'class' ? state.rooms : state.room ? [state.room] : [];
    const ids = new Set(rooms.map((room) => String(room.id)));
    try {
      feedbackRows = (await backend.fetchAll('feedback', { course: course.slug })).filter((doc) => ids.has(String(doc.classroom)));
      feedbackProblem = '';
    } catch (error) {
      console.error(error);
      feedbackRows = [];
      feedbackProblem = missingTable(error) ? '建议箱的数据表还没有建好：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261010-匿名建议.sql。' : `读取建议失败：${error.message || error}`;
    }
    renderFeedback();
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
    const rows = feedbackRows.filter((doc) => !query || String(doc.text || '').includes(query)).sort((a, b) => Number(b.id) - Number(a.id));
    $('[data-fb-summary]').textContent = feedbackProblem || (feedbackRows.length ? `共 ${feedbackRows.length} 条${query ? `，符合条件 ${rows.length} 条` : ''}（新的在前）。` : '');
    $('[data-fb-rows]').innerHTML = rows.map((doc) => `<tr><td>${esc(doc.created_on || '')}</td><td>${esc(roomName.get(String(doc.classroom)) || '')}</td><td>${esc(sessionLabel(doc.case_no))}</td>
      <td class="tw-fb-text">${esc(doc.text)}</td><td class="tw-col-action"><button type="button" class="tw-trash" data-fb-delete="${esc(doc.id)}" title="删除这条建议" aria-label="删除这条建议">${TRASH_ICON}</button></td></tr>`).join('')
      || `<tr><td colspan="5" class="empty">${feedbackProblem ? '—' : query ? '没有符合条件的建议。' : '还没有收到建议。学生在每次课最后的“匿名建议箱”对这堂课提意见和建议后，会出现在这里。'}</td></tr>`;
    $('[data-tab="feedback"]').textContent = feedbackRows.length ? `匿名建议（${feedbackRows.length}）` : '匿名建议';
  }
  $('[data-fb-scope]').addEventListener('change', loadFeedback);
  $('[data-fb-search]').addEventListener('input', renderFeedback);
  $('[data-tab="feedback"]').addEventListener('click', loadFeedback);
  // 打开“匿名建议”标签时每 20 秒刷新一次
  setInterval(() => { if (state.room && !$('[data-panel="feedback"]').hidden) loadFeedback(); }, 20000);
  $('[data-fb-rows]').addEventListener('click', async (event) => {
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
      .map((doc, index) => [index + 1, doc.created_on || '', roomName.get(String(doc.classroom)) || '', sessionLabel(doc.case_no), doc.text]);
    const scope = $('[data-fb-scope]').value === 'class' ? '本班全部课堂' : safeName((state.room && state.room.name) || '本课堂');
    download(`${course.title}_${safeName(state.klass.name)}_${scope}_匿名建议_${window.ClassLive.today()}.csv`,
      csv([['序号', '日期', '课堂', '哪次课', '建议'], ...rows]));
  });

  // ---------------- 标签页 ----------------
  $$('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    $$('[data-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
    $$('[data-panel]').forEach((panel) => { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
    store.set(`tab:${course.slug}`, tab.dataset.tab);
  }));
  const savedTab = $(`[data-tab="${store.get(`tab:${course.slug}`)}"]`);
  if (savedTab && !savedTab.hidden) savedTab.click();

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
  // 章节案例课程：每人递交过的题目（投票、推演每轮、配对整体、每道文字题各算一题）
  const caseKey = (doc) => (/^match-/.test(doc.item) ? `${doc.case}:match` : `${doc.case}:${doc.item}`);
  // 实操改版案例另加客观题、辩论、圆桌（角色、秘密任务 3 题、表决）的题数（practice.count）
  const roomTotal = () => roomCases().reduce((sum, item) => sum + 2 + item.sim.rounds.length + (item.matching.clues.length ? 1 : 0) + (item.transfer ? 1 : 0) + item.items.length + ((item.practice && item.practice.count) || 0), 0);
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
  function renderStats() {
    const joined = students();
    const submitted = submissions();
    $('[data-stat-joined]').textContent = joined.length;
    $('[data-stat-submitted]').textContent = submitted.size;
    $('[data-stat-pending]').textContent = joined.filter((row) => !submitted.has(row.sid)).length;
    $('[data-stat-danmaku]').textContent = state.docs.danmaku.length;
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
  $('[data-roster-filter]').addEventListener('change', renderCheckins);
  function renderCheckins() {
    const submitted = submissions();
    const total = CONCEPT ? 0 : roomTotal();
    const progress = new Map(CONCEPT ? homeworkRows().map((doc) => [doc.sid, { done: doc.progress, total: doc.total }])
      : Array.from(caseProgress().entries()).map(([sid, row]) => [sid, { done: row.keys.size, total }]));
    const workCell = (sid) => {
      const done = submitted.get(sid);
      const work = progress.get(sid);
      return `<td class="${done ? 'ok' : 'warn'}">${done ? `全部递交 ${clock(done)}` : work ? `已递交 ${work.done}/${work.total} 题` : '还没有递交'}</td>`;
    };
    const query = $('[data-checkin-search]').value.trim();
    const hit = (values) => !query || values.some((value) => String(value || '').includes(query));
    const roster = rosterOf();
    const hasRoster = roster.length > 0;
    ['[data-roster-filter]', '[data-roster-export]', '[data-attendance-export]', '[data-roster-stats]'].forEach((selector) => { $(selector).hidden = !hasRoster; });
    const day = checkinDay();
    const joinedList = students(day);
    if (!hasRoster) {
      $('[data-checkin-head]').innerHTML = `<tr><th>#</th><th>学号</th><th>姓名</th><th>班级</th><th>小组</th><th>${day ? `登录时间（${shortDay(day)}）` : '登录记录'}</th><th>递交情况</th><th>备注</th>${ACTION_HEAD}</tr>`;
      const rows = joinedList.filter((row) => hit([row.sid, row.class_name, row.group_name, ...row.names]));
      $('[data-checkin-rows]').innerHTML = rows.map((row, index) => {
        const names = Array.from(row.names);
        const remark = names.length > 1 ? `同一学号填写了不同姓名：${names.join('、')}` : '';
        return `<tr><td>${index + 1}</td><td>${esc(row.sid)}</td><td>${esc(names[0])}</td><td>${esc(row.class_name)}</td><td>${esc(row.group_name)}</td><td>${esc(loginText(row, day))}</td>
          ${workCell(row.sid)}<td class="warn">${esc(remark)}</td>${deleteCell(row)}</tr>`;
      }).join('') || `<tr><td colspan="9" class="empty">${day ? '这一天没有登录记录。' : '还没有学生加入这个课堂。把课堂码或加入链接展示给学生。'}</td></tr>`;
      return;
    }
    // 按点名册核对：已登录 / 未登录 / 名单外
    const joined = new Map(joinedList.map((row) => [sidKey(row.sid), row]));
    const inRoster = new Set(roster.map((person) => sidKey(person.sid)));
    const extra = joinedList.filter((row) => !inRoster.has(sidKey(row.sid)));
    const present = roster.filter((person) => joined.has(sidKey(person.sid))).length;
    $('[data-roster-total]').textContent = roster.length;
    $('[data-roster-present]').textContent = present;
    $('[data-roster-absent]').textContent = roster.length - present;
    $('[data-roster-extra]').textContent = extra.length;
    const filter = $('[data-roster-filter]').value;
    $('[data-checkin-head]').innerHTML = `<tr><th>#</th><th>学号</th><th>姓名</th><th>${day ? `${shortDay(day)} 登录` : '本次课堂'}</th><th>班级 / 小组</th><th>递交情况</th><th>备注</th>${ACTION_HEAD}</tr>`;
    const rosterRows = filter === 'extra' ? [] : roster.map((person, index) => ({ person, index, row: joined.get(sidKey(person.sid)) }))
      .filter(({ row }) => filter === 'all' || (filter === 'present' ? row : !row))
      .filter(({ person, row }) => hit([person.sid, person.name, person.class, row && row.group_name, ...(row ? Array.from(row.names) : [])]));
    const extraRows = filter === 'all' || filter === 'extra' ? extra.filter((row) => hit([row.sid, row.class_name, row.group_name, ...row.names])) : [];
    $('[data-checkin-rows]').innerHTML = rosterRows.map(({ person, index, row }) => {
      const names = row ? Array.from(row.names) : [];
      const remark = (person.extra ? '班外（老师已允许） ' : '') + (row && !names.includes(person.name) ? `登录时填写的姓名：${names.join('、')}` : names.length > 1 ? `同一学号填写了不同姓名：${names.join('、')}` : '');
      return `<tr class="${row ? '' : 'tw-absent'}"><td>${index + 1}</td><td>${esc(person.sid)}</td><td>${esc(person.name)}</td>
        <td class="${row ? 'ok' : 'warn'}">${row ? `已登录 ${esc(loginText(row, day))}` : '未登录'}</td>
        <td>${esc((row && row.class_name) || person.class || '')}${row && row.group_name ? ` / ${esc(row.group_name)}` : ''}</td>
        ${row ? workCell(row.sid) : '<td></td>'}<td class="warn">${esc(remark)}</td>${row ? deleteCell(row) : '<td></td>'}</tr>`;
    }).join('') + extraRows.map((row) => `<tr class="tw-extra"><td>外</td><td>${esc(row.sid)}</td><td>${esc(Array.from(row.names).join('、'))}</td>
        <td class="warn">名单外登录 ${esc(loginText(row, day))}</td><td>${esc(row.class_name)}${row.group_name ? ` / ${esc(row.group_name)}` : ''}</td>${workCell(row.sid)}
        <td class="warn">学号不在点名册里（可能填错学号，或不是本班学生）</td>${deleteCell(row)}</tr>`).join('')
      || '<tr><td colspan="8" class="empty">没有符合条件的学生。</td></tr>';
  }
  // 删除某个学生在本课堂的记录（加入、选择、作答、作业、弹幕），其他课堂不受影响
  $('[data-checkin-rows]').addEventListener('click', async (event) => {
    const trash = event.target.closest('[data-student-delete]');
    if (!trash || !state.room) return;
    const sid = trash.dataset.studentDelete;
    const row = students().find((item) => String(item.sid) === sid);
    const name = row ? Array.from(row.names).join('、') : '';
    const room = state.room;
    if (!window.confirm(`确定删除 ${name}（学号 ${sid}）在本课堂“${room.name}”的加入记录、选择、作答、作业和弹幕吗？此操作无法恢复，其他课堂不受影响。\n\n（学生如果再次用课堂码登录，会重新出现在名单里。）`)) return;
    const status = $('[data-checkin-status]');
    trash.disabled = true;
    status.textContent = '正在删除……';
    try {
      const where = { classroom: Number(room.id), sid: row ? row.sid : sid };
      for (const kind of ['checkins', 'choices', 'answers', 'danmaku', 'homework']) await backend.removeAll(kind, where);
      try { await backend.removeAll('bonus', { classroom: where.classroom, sid: sidKey(where.sid) }); } catch (error) { if (!missingTable(error)) throw error; }
      status.textContent = `已删除 ${name}（学号 ${sid}）在本课堂的记录。`;
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
  $('[data-roster-export]').addEventListener('click', () => {
    if (!state.room) return;
    const day = $('[data-checkin-date]').value;
    const list = students(day);
    const joined = new Map(list.map((row) => [sidKey(row.sid), row]));
    const inRoster = new Set(rosterOf().map((p) => sidKey(p.sid)));
    const times = (row) => Array.from(row.days.entries()).map(([d, ts]) => `${d} ${clock(ts)}`).join('、');
    const rows = rosterOf().map((p, i) => {
      const row = joined.get(sidKey(p.sid));
      return [i + 1, p.sid, p.name, p.class, row ? '已登录' : '未登录', row ? times(row) : '', row ? Array.from(row.names).join('、') : '', row ? row.group_name : ''];
    });
    list.filter((row) => !inRoster.has(sidKey(row.sid))).forEach((row) => rows.push(['名单外', row.sid, '', row.class_name, '名单外登录', times(row), Array.from(row.names).join('、'), row.group_name]));
    download(`${course.title}_${safeName(state.klass.name)}_${safeName(state.room.name)}_考勤_${day || window.ClassLive.today()}.csv`,
      csv([['序号', '学号', '姓名（点名册）', '班级（点名册）', day ? `${day} 登录` : '本次课堂', '登录时间（每天第一次）', '登录时填写的姓名', '小组'], ...rows]));
  });
  $('[data-attendance-export]').addEventListener('click', async () => {
    const info = $('[data-roster-info]');
    info.textContent = '正在汇总本班全部课堂的考勤……';
    try {
      const rooms = state.rooms.slice().sort((a, b) => Number(a.id) - Number(b.id));
      const ids = new Set(rooms.map((room) => String(room.id)));
      const checkins = (await backend.fetchAll('checkins', { course: course.slug })).filter((doc) => ids.has(String(doc.classroom)));
      // 一列＝一个课堂的一个上课日期（同一课堂分几次课上就有几列）；没有任何登录的课堂按发布日期占一列
      const seen = new Map();   // 学号 → 出现过的“课堂|日期”
      const columns = [];
      rooms.forEach((room) => {
        const days = Array.from(new Set(checkins.filter((doc) => String(doc.classroom) === String(room.id)).map(dayOf))).filter(Boolean).sort();
        (days.length ? days : [isoDay(millis(room.created_at))]).forEach((day) => columns.push({ key: `${room.id}|${day}`, title: `${room.name}（${day}）` }));
      });
      checkins.forEach((doc) => { const key = sidKey(doc.sid); const set = seen.get(key) || new Set(); set.add(`${doc.classroom}|${dayOf(doc)}`); seen.set(key, set); });
      const header = ['学号', '姓名', ...columns.map((column) => column.title), '出勤次数'];
      const line = (sid, name) => {
        const set = seen.get(sidKey(sid)) || new Set();
        const marks = columns.map((column) => (set.has(column.key) ? '✓' : ''));
        return [sid, name, ...marks, marks.filter(Boolean).length];
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
    const match = `
      <article class="tw-card wide">
        <h2>证据—理论配对</h2>
        <ol class="tw-legend">${item.matching.legend.map((text, index) => `<li><b>K${index + 1}</b>${esc(text)}</li>`).join('')}</ol>
        <table class="tw-table compact"><thead><tr><th>事实线索</th>${[1, 2, 3, 4].map((k) => `<th>K${k}</th>`).join('')}<th>人数</th>${showRef ? '<th>对应参考</th><th>错误率</th>' : ''}</tr></thead><tbody>
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
    const transfer = item.transfer ? (() => {
      const counts = tally(docs, 'transfer-k');
      const total = sum(counts);
      const ok = (k) => k === item.transfer.answer || item.transfer.accept.includes(k);
      const right = item.transfer.options.reduce((n, _, index) => n + (ok(index + 1) ? counts.get(`K${index + 1}`) || 0 : 0), 0);
      return `
      <article class="tw-card wide">
        <h2>迁移任务 · 选一选 <small>${total} 人${showRef ? ` · 正确率 ${pct(right, total)}%（含可以成立的）` : ''}</small></h2>
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
        <h2>圆桌会议 · 按角色看协商意见、秘密任务和表决 <small>${roleOf.size} 人选了角色</small></h2>
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
        ${(() => {
          // 秘密任务：题号相同、题目随角色不同，按角色核对；3 题全对＝完成秘密任务
          const key = P.roundtable.tasks || {};
          const answerOf = new Map(docs.filter((doc) => /^rt-task-[123]$/.test(doc.item)).map((doc) => [`${doc.sid}|${doc.item}`, String(doc.choice)]));
          const taskRows = Object.keys(key).map((role) => {
            const people = Array.from(roleOf.entries()).filter(([, chosen]) => chosen === role).map(([sid]) => sid);
            const ok = (sid, i) => answerOf.get(`${sid}|rt-task-${i}`) === key[role][i - 1];
            const done = people.filter((sid) => [1, 2, 3].every((i) => ok(sid, i))).length;
            return `<tr><th>${esc(role)}</th><td>${people.length}</td>${[1, 2, 3].map((i) => `<td>${people.filter((sid) => ok(sid, i)).length}</td>`).join('')}<td class="${showRef ? 'is-answer' : ''}">${done}</td></tr>`;
          }).join('');
          const vote = P.roundtable.vote || [];
          const voteRows = P.roundtable.roles.concat(['未选角色']).map((role) => {
            const mine = docs.filter((doc) => doc.item === 'rt-vote' && (roleOf.get(doc.sid) || '未选角色') === role);
            return mine.length ? `<tr><th>${esc(role)}</th>${vote.map(([choice]) => `<td>${mine.filter((doc) => String(doc.choice) === choice).length}</td>`).join('')}<td>${mine.length}</td></tr>` : '';
          }).join('');
          return `<p class="tw-q">秘密任务完成情况 <small>3 题全部答对＝完成</small></p>
            <table class="tw-table compact"><thead><tr><th>角色</th><th>人数</th><th>题1 答对</th><th>题2 答对</th><th>题3 答对</th><th>完成秘密任务</th></tr></thead>
            <tbody>${taskRows}</tbody></table>
            <p class="tw-q">协商意见表决</p>
            <table class="tw-table compact"><thead><tr><th>角色</th>${vote.map(([, label]) => `<th>${esc(label.split('：')[0])}</th>`).join('')}<th>人数</th></tr></thead>
            <tbody>${voteRows || `<tr><td colspan="${vote.length + 2}">还没有人表决</td></tr>`}</tbody></table>`;
        })()}
      </article>`;
      return P.groups.map(quizCard).join('') + debate + roundtable;
    })() : '';
    view.innerHTML = poll + match + sim + transfer + practice;
  }

  // ---------------- 文字作答 ----------------
  function fillItems() {
    const item = caseMap.get($('[data-answer-case]').value);
    const select = $('[data-answer-item]');
    const previous = select.value;
    select.innerHTML = item ? item.items.map((entry) => `<option value="${entry.key}">${esc(entry.label)}</option>`).join('') : '';
    if (item && item.items.some((entry) => entry.key === previous)) select.value = previous;
  }
  function renderAnswers() {
    const item = caseMap.get($('[data-answer-case]').value);
    if (!item) { $('[data-answer-list]').innerHTML = ''; $('[data-answer-prompt]').textContent = ''; return; }
    const key = $('[data-answer-item]').value;
    const entry = item.items.find((candidate) => candidate.key === key);
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
    return [
      { id: 'overview', label: '总览：逐题作答与正确率' },
      ...unit.concepts.map((k, index) => ({ id: k.id, label: `概念 ${index + 1} · ${k.name}` })),
      { id: 'chain', label: '概念串联' },
      { id: 'discussion', label: '小组辨析' },
      { id: 'exit', label: '出门测' },
      ...(unit.poll ? [{ id: 'poll', label: '课堂投票' }] : []),
      ...(unit.essay ? [{ id: 'essay', label: '课后思考' }] : []),
    ];
  }

  // 一份作业快照 → 逐题记录。type：option 选项题 / value 填空与计算 / text 文字题（不判对错）/ order 串联位置
  function gradeHomework(unit, payload) {
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
    const discussion = S.discussion || {};
    option('discussion', 'discussion.stance', '小组辨析', '我的立场', unit.discussion.stances.map((x) => ({ value: x, label: x })),
      discussion.stance, null, unit.discussion.question);
    text('discussion', 'discussion.reason', '小组辨析', '我的理由', texts['discussion.reason'], '我的理由（至少用到一个概念）');
    text('discussion', 'discussion.after', '小组辨析', '讨论后的修改或补充', texts['discussion.after'], '讨论后，我修改或补充的想法');
    const exit = S.exit || {};
    unit.exit.forEach((q, i) => option('exit', `exit.${i}`, '出门测', `出门测 ${i + 1}`, lettered(q.options), (exit.answers || [])[i], q.answer, q.prompt));
    if (unit.poll) {
      option('poll', 'poll', '课堂投票', '课堂投票', unit.poll.options.map((o) => ({ value: o.value, label: o.label })), (S.poll || {}).choice, null, '课堂投票');
    }
    if (unit.essay) text('essay', 'essay', '课后思考', `申论式大题（${unit.essay.type}题）`, texts.essay, unit.essay.question);
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
      match = key.match(/^exit\.(\d+)$/);
      if (match) S.exit.answers[Number(match[1])] = value;
      else if (key === 'chain') S.chain = { order: value, submitted: true };
      else if (key === 'discussion') { S.discussion = { stance: value && value.stance }; S.texts['discussion.reason'] = value && value.reason; }
      else if (key === 'discussion.after') S.texts['discussion.after'] = value;
      else if (key === 'poll') S.poll = { choice: value };
      else if (key === 'essay') S.texts.essay = value;
    });
    return { S, at };
  }
  // 逐题记录的编号 → 递交时的题目编号（辨一辨、分一分等一组小题一起递交）
  const submitKey = (itemKey) => itemKey
    .replace(/^(k\d+\.(check|apply))\.\d+$/, '$1')
    .replace(/^chain\.\d+$/, 'chain')
    .replace(/^discussion\.(stance|reason)$/, 'discussion');
  const gradeOf = (unit, payload) => {
    const { S, at } = stateOf(unit, payload);
    const result = gradeHomework(unit, S);
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
  const GROUP_LABEL = { '辨一辨': '辨一辨（整题全对）', '用一用': '用一用（整题全对）', '概念串联': '概念串联（全部排对）' };
  function groupStats(templates, rows) {
    const groups = new Map();
    templates.filter((item) => item.ref != null && item.type !== 'text').forEach((item) => {
      const key = submitKey(item.key);   // 挑战题（变一变）单独递交、可选，不并入用一用整题
      if (!/\.(check|apply)$|^chain$/.test(key)) return;
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
    summary.textContent = `${chapterLabel(state.room)}：已有 ${rows.length} 人递交（${submitted} 人全部递交），平均递交 ${average}% 的题目；`
      + `出门测 ${exitDone.length} 人递交了全部 ${unit.exit.length} 题${showRef ? `，平均答对 ${exitAverage} 题` : ''}。每题只算第一次递交，约每 5 秒刷新。`;
    const entries = new Map();
    rows.forEach((row) => row.items.forEach((item) => {
      const list = entries.get(item.key) || [];
      list.push({ row, item });
      entries.set(item.key, list);
    }));
    const templates = gradeHomework(unit, {}).items;
    const section = $('[data-pe-section]').value || 'overview';
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
      view.innerHTML = `${showRef && weakest.length ? `<article class="tw-card wide"><h2>最值得讲评 <small>作答 3 人以上、正确率最低的 ${weakest.length} 题</small></h2>
          ${weakest.map((stat) => `<div class="tw-option single"><div class="tw-option-label"><span>${esc(names.get(stat.item.section))}</span>${esc(stat.item.label)}：${esc(short(stat.item.prompt, 40))}</div>${bar(stat.right, stat.answered)}</div>`).join('')}</article>` : ''}
        <table class="tw-table"><thead><tr><th>部分</th><th>题目</th><th>作答人数</th>${showRef ? '<th>正确率</th>' : ''}</tr></thead><tbody>
        ${stats.map((stat) => `<tr class="${stat.group ? 'tw-group-row' : ''}"><td>${esc(names.get(stat.item.section))}</td><td>${esc(stat.item.label)}<small class="tw-sub">${esc(short(stat.item.prompt, 46))}</small></td>
          <td>${stat.answered} / ${rows.length}</td>${showRef ? `<td>${bar(stat.right, stat.answered)}</td>` : ''}</tr>`).join('')}</tbody></table>`;
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
  function renderConceptStudents() {
    if (!CONCEPT) return;
    const unit = peUnit();
    const body = $('[data-pe-rows]');
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
    body.innerHTML = list.map((person) => {
      const row = rows.get(person.sid);
      const open = state.openStudents.has(person.sid);
      if (!row) {
        return `<tr><td>${esc(person.sid)}</td><td>${esc(person.name)}</td><td>${esc(person.class_name)}</td><td>${esc(person.group_name)}</td>
          <td colspan="4" class="warn">已加入，还没有递交</td></tr>`;
      }
      const doc = row.doc;
      const exit = row.exitAnswered ? `已递交 ${row.exitAnswered}/${row.exitTotal} · 答对 ${row.exitRight}` : '未递交';
      const main = `<tr class="tw-pe-row${open ? ' is-open' : ''}" data-pe-sid="${esc(person.sid)}" tabindex="0" aria-expanded="${open}">
        <td>${open ? '▾' : '▸'} ${esc(doc.sid)}</td><td>${esc(doc.name)}</td><td>${esc(doc.class_name || '')}</td><td>${esc(doc.group_name || '')}</td>
        <td>${doc.progress}/${doc.total} 题<small class="tw-sub">自动判分小题答对 ${row.autoRight}/${row.autoTotal}${wholeText(unit, row)}</small></td>
        <td class="${row.exitSubmitted ? 'ok' : 'warn'}">${exit}</td>
        <td class="${doc.submitted ? 'ok' : 'warn'}">${doc.submitted ? `是 ${clock(millis(doc.submitted_at))}` : '否'}</td><td>${clock(doc.ts)}</td></tr>`;
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
      return [doc.name, doc.sid, doc.text, info.class_name, info.group_name].some((value) => String(value || '').includes(query));
    });
    const senders = new Set(rows.map((doc) => doc.sid)).size;
    $('[data-dm-summary]').textContent = `${chosen || '全部日期'}：共 ${rows.length} 条，发送人 ${senders} 人。`;
    $('[data-danmaku-list]').innerHTML = rows.map((doc) => {
      const info = who.get(doc.sid) || {};
      const withdrawn = Boolean(doc.withdrawn_at);
      const status = withdrawn ? '学生已撤回' : mode === 'direct' && doc.status === 'new' ? '已上屏' : STATUS_TEXT[doc.status] || doc.status;
      const canShow = !withdrawn && doc.status !== 'shown' && !(mode === 'direct' && doc.status === 'new');
      const shownClass = withdrawn ? 'hidden' : mode === 'direct' && doc.status === 'new' ? 'shown' : doc.status;
      return `<tr class="tw-dm is-${esc(shownClass)}"><td>${esc(isoDay(doc.ts))}</td><td>${clock(doc.ts)}</td><td>${esc(doc.name)}</td><td>${esc(doc.sid)}</td>
        <td>${esc(info.class_name || '')}</td><td>${esc(info.group_name || '')}</td><td class="tw-dm-text">${doc.liked_at ? '<b class="tw-dm-liked" title="老师点赞">👍</b> ' : ''}${doc.gift ? `法宝 ${esc(((window.ClassLive.GIFTS || []).find((gift) => gift.id === doc.gift) || {}).icon || '')} ` : ''}${esc(doc.text)}</td><td><em>${esc(status)}</em></td>
        <td class="tw-dm-actions">${canShow ? `<button type="button" data-dm="${esc(doc.id)}" data-dm-status="shown">上屏</button>` : ''}${!withdrawn && doc.status !== 'hidden' ? `<button type="button" data-dm="${esc(doc.id)}" data-dm-status="hidden">隐藏</button>` : ''}<button type="button" class="tw-trash" data-dm-delete="${esc(doc.id)}" title="删除这条弹幕" aria-label="删除 ${esc(doc.name)} 的弹幕">${TRASH_ICON}</button></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">没有弹幕记录。</td></tr>';
  }
  $('[data-danmaku-list]').addEventListener('click', async (event) => {
    // 删除一条弹幕：从记录里彻底删除，投屏页也随即撤下（与“隐藏”不同，隐藏的弹幕仍留在记录里）
    const trash = event.target.closest('[data-dm-delete]');
    if (trash) {
      const id = trash.dataset.dmDelete;
      const doc = state.docs.danmaku.find((item) => String(item.id) === id);
      const preview = doc ? `${doc.name}：${String(doc.text).slice(0, 30)}` : '';
      if (!window.confirm(`确定删除这条弹幕吗？\n\n${preview}\n\n删除后无法恢复，弹幕记录和导出里都不再有它，投屏上也会撤下。只想不上屏可以点“隐藏”。`)) return;
      trash.disabled = true;
      try {
        await backend.removeAll('danmaku', { id: Number(id) || id });
        state.docs.danmaku = state.docs.danmaku.filter((item) => String(item.id) !== id);
        renderDanmaku();
        renderStats();
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
  function renderPages() {
    $('[data-pages]').innerHTML = course.chapters.map((chapter) => `
      <a class="tw-page" href="/${chapter.file}${state.klass ? `?class=${encodeURIComponent(state.klass.id)}` : ''}" target="_blank" rel="noopener"><small>${esc(chapter.cn)}</small><strong>${esc(chapter.title)}</strong>
      <span>${CONCEPT ? `教材：${esc(chapter.chapter)}` : chapter.cases.map((item) => `案例${item.number} ${esc(item.title)}`).join('<br>')}</span></a>`).join('')
      // 复习资料（如政经“理论知识点总结（前七章）”）：学生在每个案例页的“资料与延伸阅读”里也能打开
      + (course.notes ? `<a class="tw-page is-notes" href="/${course.notes.file}" target="_blank" rel="noopener"><small>复习资料</small><strong>${esc(course.notes.title)}</strong>
      <span>学生在每个案例页最后的“资料与延伸阅读”里都能打开，可导出 PDF。</span></a>` : '');
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
      const fetched = await Promise.all(kinds.map(async (kind) => pick(await backend.fetchAll(kind, { course: course.slug }))));
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
        ...danmaku.map((d) => [...roomCols(d), isoDay(d.ts), clock(d.ts), ...person(d), d.text, recordStatus(d)])]);
      if (only === 'danmaku') {
        download(`${prefix}_弹幕记录.csv`, danmakuCsv());
        status.textContent = `已导出${label}弹幕记录：${danmaku.length} 条（含发送人姓名、学号、班级、小组）。`;
        return;
      }
      download(`${prefix}_加入名单.csv`, csv([['课堂', '课堂码', '日期', '时间', '学号', '姓名', '班级', '小组'],
        ...checkins.map((d) => [...roomCols(d), ...when(d), d.sid, d.name, d.class_name, d.group_name])]));
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
  const REALMS = window.ClassLive.REALMS;
  const POINTS = { attend: 20, done: 35, right: 35, danmaku: 10, perDanmaku: 2, challenge: 2 };
  const LIKE = window.ClassLive.LIKE || { limit: 5, points: 5, perStudent: 2 };
  const realmUnits = () => (CONCEPT
    ? course.units.map((u) => ({ id: u.unit, label: `案例${u.number}`, meetings: 1, unit: u }))
    : course.chapters.map((ch) => ({ id: ch.id, label: ch.cn, meetings: Math.max(1, ch.cases.length),
      cases: ch.cases.map((item) => caseMap.get(item.number)).filter(Boolean) })));
  const realmMax = () => realmUnits().reduce((sum, u) => sum + 100 * u.meetings, 0);
  const meaningful = (text) => String(text == null ? '' : text).replace(/[\s\p{P}\p{S}＿_]/gu, '');
  const validText = (text, min) => {
    const raw = String(text == null ? '' : text);
    if (/[＿_]{2,}/.test(raw)) return false;   // 句式里的空格线还没填
    const m = meaningful(raw);
    return m.length >= min && new Set(m).size >= Math.min(8, Math.ceil(min * 0.6));
  };
  const firstOf = (docs) => {   // 同一题只认第一次递交
    const map = new Map();
    docs.slice().sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0) || String(a.id).localeCompare(String(b.id), 'en', { numeric: true }))
      .forEach((doc) => { if (!map.has(doc.item)) map.set(doc.item, doc); });
    return map;
  };
  const sameSet = (value, answer) => String(value).split(',').filter(Boolean).sort().join(',') === answer.slice().map(String).sort().join(',');

  // 习经：一个案例的题目。kind：obj 客观题（按对错）/ part 投票、站队（参与即可）/ text 文字题
  function xjpQuestions(c) {
    const qs = [];
    const P = c.practice || {};
    const ref = c.poll && c.poll.reference;
    qs.push({ kind: 'part', items: ['pre'] });
    qs.push(ref ? { kind: 'obj', items: ['post'], score: (m) => (String(m.post) === String(ref) ? 1 : 0) } : { kind: 'part', items: ['post'] });
    const clues = (c.matching && c.matching.clues) || [];
    if (clues.length) {
      const items = clues.map((_, i) => `match-${i + 1}`);
      qs.push({ kind: 'obj', items, score: (m) => clues.filter((clue, i) => [clue.answer, ...(clue.accept || [])].some((k) => m[items[i]] === `K${k}`)).length / clues.length });
    }
    ((c.sim && c.sim.rounds) || []).forEach((_, i) => qs.push({ kind: 'part', items: [`sim-${i + 1}`] }));
    if (c.transfer) {
      qs.push({ kind: 'obj', items: ['transfer-k'], score: (m) => ([c.transfer.answer, ...(c.transfer.accept || [])].some((k) => m['transfer-k'] === `K${k}`) ? 1 : 0) });
    }
    (c.items || []).forEach((entry) => qs.push({ kind: 'text', items: [entry.key], min: 10 }));
    (P.groups || []).forEach((group) => group.items.forEach((q) => qs.push({ kind: 'obj', items: [q.key], score: (m) => (sameSet(m[q.key], q.answer) ? 1 : 0) })));
    if (P.debate) ['debate-pre', 'debate-post', 'debate-cards'].forEach((key) => qs.push({ kind: 'part', items: [key] }));
    if (P.roundtable) {
      const tasks = P.roundtable.tasks || {};
      qs.push({ kind: 'part', items: ['rt-role'] });
      [1, 2, 3].forEach((i) => qs.push({ kind: 'obj', items: [`rt-task-${i}`],
        score: (m) => (tasks[m['rt-role']] && String(m[`rt-task-${i}`]) === String(tasks[m['rt-role']][i - 1]) ? 1 : 0) }));
      qs.push({ kind: 'part', items: ['rt-vote'] });
    }
    return qs;
  }
  // 政经：按递交单位（submitKey）把 gradeOf 的逐题记录归成题目
  const peKind = (key) => {
    if (/\.discover$/.test(key) || key === 'poll') return { kind: 'part' };
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
    for (const kind of kinds) {
      docs[kind] = (await backend.fetchAll(kind, { course: course.slug })).filter((doc) => roomUnit.has(String(doc.classroom)));
    }
    // 猜词游戏第一名的额外修为（老师在投屏页得分榜上发放；后台还没有这张表时按 0 算）
    const gameBonus = new Map();
    try {
      (await backend.fetchAll('bonus', { course: course.slug })).filter((doc) => roomUnit.has(String(doc.classroom)))
        .forEach((doc) => gameBonus.set(sidKey(doc.sid), (gameBonus.get(sidKey(doc.sid)) || 0) + (Number(doc.points) || 0)));
    } catch (error) { if (!missingTable(error)) throw error; }
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
    const textOwners = new Map();
    const noteText = (sid, text) => {
      const m = meaningful(text);
      if (m.length < 20) return;
      if (!textOwners.has(m)) textOwners.set(m, new Set());
      textOwners.get(m).add(sid);
    };
    const units = realmUnits();
    const perUnit = units.map((u) => {
      const inUnit = (doc) => roomUnit.get(String(doc.classroom)) === u.id;
      const days = new Map();
      docs.checkins.filter(inUnit).forEach((doc) => {
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
      const total = { attend: 0, done: 0, right: 0, danmaku: 0, like: 0, game: gameBonus.get(person.sid) || 0 };
      perUnit.forEach((info) => {
        const { u } = info;
        const m = u.meetings;
        // 签到
        if (info.held) {
          const mine = info.classDays.filter((day) => info.days.get(day).has(person.sid)).length;
          total.attend += POINTS.attend * m * Math.min(mine, info.held) / info.held;
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
            if (isEntry(entry) && peKind(key).kind === 'text') noteText(person.sid, typeof entry.v === 'object' && entry.v ? entry.v.reason : entry.v);
          }));
        } else {
          (u.cases || []).forEach((c) => {
            const choices = firstOf((info.choices.get(person.sid) || []).filter((doc) => doc.case === c.number));
            const answers = firstOf((info.answers.get(person.sid) || []).filter((doc) => doc.case === c.number));
            const m2 = {};
            choices.forEach((doc, item) => { m2[item] = String(doc.choice); });
            xjpQuestions(c).forEach((q) => {
              count += 1;
              if (q.kind === 'text') {
                const doc = answers.get(q.items[0]);
                if (doc && validText(doc.text, q.min)) { done += 1; noteText(person.sid, doc.text); }
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
      const points = Math.round((total.attend + total.done + total.right + total.danmaku + total.like + total.game) * 10) / 10;
      const realm = window.ClassLive.realmOf(points, max);
      const round1 = (v) => Math.round(v * 10) / 10;
      return { sid: person.sid, name: (rosterMap.get(person.sid) || {}).name || person.name || '', points, max, realm: realm.level, stage: realm.stage,
        title: realm.title, inRoster: !roster.length || rosterMap.has(person.sid), owners: person.owners.size,
        detail: { attend: round1(total.attend), done: round1(total.done), right: round1(total.right), danmaku: round1(total.danmaku), like: round1(total.like), game: round1(total.game) } };
    });
    rows.forEach((row) => {
      row.flags = [];
      if (!row.inRoster) row.flags.push('不在点名册（不结算境界）');
      if (row.owners > 1) row.flags.push(`${row.owners} 台设备登录过`);
      let same = 0;
      textOwners.forEach((sids) => { if (sids.size > 1 && sids.has(row.sid)) same += 1; });
      if (same) row.flags.push(`${same} 处文字作答与他人相同`);
    });
    rows.sort((a, b) => b.points - a.points || String(a.sid).localeCompare(String(b.sid)));
    return { rows, max, units: perUnit.filter((info) => info.held).length, total: units.length, meetings: units.reduce((s, u) => s + u.meetings, 0) };
  }

  // 没有选中课堂时，试用特效用本课程第一个投屏页
  const demoHref = () => (course.chapters[0] ? `/${course.chapters[0].file}?demo=1` : '#');
  $('[data-realm-demo]').href = demoHref();
  const realmChip = (level, title) => `<span class="tw-realm is-r${level}">${esc(title || REALMS[level].name)}</span>`;
  let realmResult = null;
  let realmSaved = '';
  function renderRealms() {
    const box = $('[data-realm-rows]');
    if (!box) return;
    const max = realmMax();
    const meetings = realmUnits().reduce((s, u) => s + u.meetings, 0);
    $('[data-realm-legend]').innerHTML = REALMS.map((realm) => `${realmChip(realm.level)}<span>${realm.min ? `≥ ${Math.ceil(realm.min * max)} 修为（${Math.round(realm.min * 100)}%）` : '起步'}</span>`).join('');
    if (!realmResult) {
      $('[data-realm-summary]').textContent = `本课程共 ${meetings} 次课，满分 ${max} 修为（每次课 100：签到 20、作答完成 35、作答正确 35、弹幕最多 10；老师点赞另加，每赞 ${LIKE.points}；猜词游戏第一名每人另加 ${(window.ClassLive.WORDGAME || {}).points || 10}）。点“重新计算”查看本班修为。`;
      box.innerHTML = '';
      return;
    }
    const query = $('[data-realm-search]').value.trim().toUpperCase();
    const rows = realmResult.rows.filter((row) => !query || row.sid.includes(query) || String(row.name).toUpperCase().includes(query));
    const counts = REALMS.map((realm) => realmResult.rows.filter((row) => row.inRoster && row.realm === realm.level).length);
    $('[data-realm-summary]').textContent = `本课程共 ${meetings} 次课，满分 ${max} 修为；已上过 ${realmResult.units}/${realmResult.total} 个${UNIT}。`
      + ` 本班境界：${REALMS.map((realm, i) => `${realm.name} ${counts[i]} 人`).join('，')}。${realmSaved}`;
    box.innerHTML = rows.map((row, i) => `<tr class="${row.inRoster ? '' : 'is-muted'}"><td>${i + 1}</td><td>${esc(row.sid)}</td><td>${esc(row.name)}</td>
      <td>${realmChip(row.realm, row.title)}</td><td><b>${row.points}</b><small> / ${row.max}（${pct(row.points, row.max)}%）</small></td>
      <td>${row.detail.attend}</td><td>${row.detail.done}</td><td>${row.detail.right}</td><td>${row.detail.danmaku}</td><td>${row.detail.like || 0}</td><td>${row.detail.game || 0}</td>
      <td class="tw-realm-flags">${row.flags.map(esc).join('<br>')}</td></tr>`).join('')
      || '<tr><td colspan="12" class="empty">本班还没有学生记录。</td></tr>';
  }
  async function refreshRealms(save, quiet) {
    if (!state.klass) return;
    const status = $('[data-realm-status]');
    if (!quiet) status.textContent = '正在读取本班全部课堂的记录并计算……';
    try {
      realmResult = await computeRealms();
      if (save) {
        const rows = realmResult.rows.filter((row) => row.inRoster)
          .map((row) => ({ sid: row.sid, name: row.name, points: row.points, max: row.max, realm: row.realm, stage: row.stage, detail: row.detail }));
        await backend.rpc('ck_save_realms', { p_course: course.slug, p_class: Number(state.klass.id) || state.klass.id, p_rows: rows });
        store.set(`realm-saved:${course.slug}:${state.klass.id}`, String(Date.now()));
        realmSaved = ` 已于 ${clock(Date.now())} 更新 ${rows.length} 位同学的称号。`;
      }
      if (!quiet || save) status.textContent = save ? `已结算并更新称号（${clock(Date.now())}）。学生刷新页面后看到新境界。` : '已重新计算（尚未保存）。点“结算修为并更新学生称号”后学生端才会更新。';
    } catch (error) {
      console.error(error);
      status.textContent = missingTable(error) || /PGRST202|42883|Could not find the function/i.test(String((error && error.message) || error))
        ? '修为境界的数据表还没有建好：请先在云开发 SQL 编辑器执行 tools/cloudbase-pg-20261010-修为境界.sql。'
        : `结算失败：${failReason(error)}`;
    }
    renderRealms();
  }
  $('[data-tab="realm"]').addEventListener('click', () => { if (!realmResult) refreshRealms(false); else renderRealms(); });
  $('[data-realm-refresh]').addEventListener('click', () => refreshRealms(false));
  $('[data-realm-save]').addEventListener('click', () => refreshRealms(true));
  $('[data-realm-search]').addEventListener('input', renderRealms);
  $('[data-realm-export]').addEventListener('click', () => {
    if (!realmResult) return;
    const rows = realmResult.rows.map((row, i) => [i + 1, row.sid, row.name, row.title, row.points, row.max, row.detail.attend, row.detail.done,
      row.detail.right, row.detail.danmaku, row.detail.like || 0, row.detail.game || 0, row.flags.join('；')]);
    download(`${course.title}_${safeName(state.klass.name)}_修为境界_${window.ClassLive.today()}.csv`,
      csv([['名次', '学号', '姓名', '境界', '修为', '满分', '签到', '作答完成', '作答正确', '弹幕', '点赞（额外）', '猜词第一（额外）', '提示'], ...rows]));
  });
  // 打开班级时：距上次结算超过 6 小时就在后台自动结算一次（老师每周发布课堂时都会打开工作台）
  async function autoSettle() {
    const last = Number(store.get(`realm-saved:${course.slug}:${state.klass && state.klass.id}`)) || 0;
    if (!state.klass || Date.now() - last < 6 * 3600 * 1000) return;
    await refreshRealms(true, true);
  }
  renderRealms();

  // ---------------- 登录安全 ----------------
  // 班外加入申请（允许后加进点名册）、口令状态（解锁、重置）、最近安全记录、教师登录记录；
  // 工作台打开时每 10 秒查一次申请和锁定，课堂卡片下方醒目提示
  const SEC_KIND = {
    bad_code: '课堂码错误', bad_name: '姓名与点名册不符', bad_pin: '口令错误', locked: '口令连续输错 10 次，锁定',
    pin_set: '设置口令', new_device: '新设备登录（口令正确）', request: '申请加入（不在点名册上）', approve: '老师允许加入',
    reject: '老师拒绝或撤销加入', pin_reset: '老师重置口令', unlock: '老师解锁', rotate: '更换课堂码', teacher_login: '教师登录',
  };
  const SEC_BAD = new Set(['bad_name', 'bad_pin', 'locked', 'request']);
  const sec = { requests: [], pins: [], log: [], teacher: [], codeFails: 0, problem: '', loaded: false };
  const stamp = (value) => (value ? `${isoDay(millis(value)).slice(5)} ${clock(millis(value))}` : '');
  const secClassId = () => Number(state.klass.id) || state.klass.id;
  async function loadSecurity(full) {
    if (!state.klass || $('[data-app]').hidden) return;
    try {
      sec.requests = (await backend.fetchAll('requests', { class_id: secClassId() })).sort((a, b) => millis(b.created_at) - millis(a.created_at));
      let pins = await backend.rpc('ck_pin_status', { p_class: secClassId() });
      sec.pins = Array.isArray(pins) ? pins : [];
      sec.codeFails = (await backend.fetchAll('seclog', { kind: 'bad_code' }, { since: ['at', new Date(Date.now() - 10 * 60000).toISOString()], limit: 300 })).length;
      if (full) {
        sec.log = await backend.fetchAll('seclog', { class_id: secClassId() }, { limit: 200 });
        sec.teacher = await backend.fetchAll('seclog', { kind: 'teacher_login' }, { limit: 10 });
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
    if (pending) lines.push(`<p>有 ${pending} 位不在点名册上的同学申请进入本班课堂，允许后才能登录。<button type="button" data-sec-go="security">去处理</button></p>`);
    const locked = sec.pins.filter((row) => row.locked_until && millis(row.locked_until) > Date.now()).length;
    const hard = sec.pins.filter((row) => row.locked_until && millis(row.locked_until) > Date.now() && row.locks >= 3).length;
    if (locked) lines.push(`<p>${locked} 个学号因口令输错次数过多被锁定${hard ? `（其中 ${hard} 个须老师解锁）` : '（到时自动解锁）'}。<button type="button" data-sec-go="security">查看</button></p>`);
    if (sec.codeFails >= 30) lines.push(`<p>最近 10 分钟全站课堂码输错 ${sec.codeFails} 次，可能有人在猜课堂码。如果课堂码已外传，可点课堂码下方的“更换课堂码”。</p>`);
    const html = lines.join('');
    if (box.innerHTML !== html) box.innerHTML = html;   // 内容没变就不重画（每 10 秒刷新时按钮不会被换掉）
    box.hidden = !lines.length;
    $('[data-tab="security"]').textContent = pending || locked ? `登录安全（${pending + locked}）` : '登录安全';
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
    const reqs = sec.requests;
    $('[data-sec-req-count]').textContent = reqs.length ? `待处理 ${reqs.filter((row) => row.status === 'pending').length} · 共 ${reqs.length}` : '';
    $('[data-sec-requests]').innerHTML = reqs.map((row) => {
      const twin = byName.get(row.name);
      const note = twin && sidKey(twin.sid) !== sidKey(row.sid) ? `<span class="tw-sec-tag">点名册上有同名同学（学号 ${esc(twin.sid)}），可能填错了学号</span>` : '';
      const label = { pending: '<b class="tw-sec-bad">待处理</b>', approved: '已允许', rejected: '已拒绝' }[row.status] || esc(row.status);
      const actions = row.status === 'pending'
        ? `<button type="button" class="tw-secondary" data-sec-allow="${esc(row.id)}">允许</button><button type="button" class="tw-secondary" data-sec-reject="${esc(row.id)}">拒绝</button>`
        : row.status === 'approved' ? `<button type="button" class="tw-secondary" data-sec-reject="${esc(row.id)}">撤销允许</button>`
        : `<button type="button" class="tw-secondary" data-sec-allow="${esc(row.id)}">改为允许</button>`;
      return `<tr><td>${esc(stamp(row.created_at))}</td><td>${esc(row.sid)}</td><td>${esc(row.name)}${note}</td><td>${esc(row.class_name || '')}</td><td>${label}</td><td>${actions}</td></tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">没有班外加入申请。</td></tr>';

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
      const cond = locked && pin.locks >= 3 ? '<b class="tw-sec-bad">锁定（多次输错，须老师解锁）</b>'
        : locked ? `<b class="tw-sec-bad">锁定到 ${esc(clock(millis(pin.locked_until)).slice(0, 5))}（第 ${pin.locks || 1} 次）</b>`
        : pin && pin.fails > 0 ? `<span class="tw-sec-bad">已连续输错 ${pin.fails} 次</span>` : '正常';
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
    $('[data-sec-summary]').textContent = `最近 24 小时本班：口令错误 ${count('bad_pin')} 次、锁定 ${count('locked')} 次、姓名不符 ${count('bad_name')} 次、班外申请 ${count('request')} 次、新设备登录 ${count('new_device')} 次；全站最近 10 分钟课堂码错误 ${sec.codeFails} 次。`;
    $('[data-sec-log]').innerHTML = sec.log.slice(0, 100).map((row) => `<tr><td>${esc(stamp(row.at))}</td>
      <td class="${SEC_BAD.has(row.kind) ? 'warn' : ''}">${esc(SEC_KIND[row.kind] || row.kind)}${row.kind === 'locked' && row.detail ? `（${esc(row.detail)}）` : ''}</td><td>${esc(row.sid || '')}</td><td>${esc(row.name || '')}</td></tr>`).join('')
      || '<tr><td colspan="4" class="empty">还没有记录。</td></tr>';
    $('[data-sec-teacher]').innerHTML = sec.teacher.map((row) => `<tr><td>${esc(stamp(row.at))}</td><td>${esc(browserOf(row.detail))}</td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">还没有记录（下次登录工作台时开始记录）。</td></tr>';
  }
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
    const unlock = event.target.closest('[data-sec-unlock]');
    const reset = event.target.closest('[data-sec-reset]');
    if (allow || reject) {
      const id = (allow || reject).dataset[allow ? 'secAllow' : 'secReject'];
      const row = sec.requests.find((item) => String(item.id) === id);
      if (!row) return;
      if (reject && row.status === 'approved'
        && !window.confirm(`撤销允许 ${row.name}（学号 ${row.sid}）？该生会从本班点名册移除，已登录的设备不能再递交，也不能再登录。`)) return;
      await secAction(allow ? `允许 ${row.name} 加入` : `拒绝 ${row.name}`, async () => {
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
      if (session && !session.anonymous) await enterApp(session);
      else showLogin();
    } catch (error) {
      console.error(error);
      showLogin('无法连接课堂后台，请检查网络后刷新。');
    }
  })();
})();
