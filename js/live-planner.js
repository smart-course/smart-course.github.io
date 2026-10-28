/* 教师工作台“课表”与“日程”（2026-10-28，用户：“在教师工作台，学生登录页旁边再设置一个教师课表……每年在新建班级的时候可以填写上课的课程、班级、教室、
 * 时间等。然后自动放入课表中……注意排版美观一些。”“再设置一个日程安排，可以看到日历，以及记录一些安排等”）
 *   课表：各班的上课时间和教室（ck_classes.schedule，新建班级时或在课表里填写）按学期自动排成周课表；可按周查看、导出 Word（A4 横向）、打印。
 *   日程：月历上显示每天的课（按课表和“第 1 周周一”推算）和自己记下的安排（ck_teacher_events）；点日期新建，点安排修改、完成或删除；
 *         类别选“放假停课”的安排会把当天的课划掉。
 *   设置：学期名称、第 1 周周一、周数、上午／下午／晚上各几节、每节起止时间（ck_teacher_settings 的 planner）。
 * 本文件先于 live-teacher.js 加载：live-teacher 登录后调用 ClassLivePlanner.ready(backend, courses)；新建班级表单用 ClassLivePlanner.editor()，
 * “导出与清理 → 班级”用 ClassLivePlanner.editClass()。
 */
(function () {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: (key) => { try { return localStorage.getItem('teacher:planner-' + key); } catch (error) { return null; } },
    set: (key, value) => { try { localStorage.setItem('teacher:planner-' + key, value); } catch (error) { /* 忽略 */ } },
  };
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
  const SECTIONS = ['上午', '下午', '晚上'];
  const BREAKS = ['午休', '晚饭'];
  const SHORT = { 'xjp-economy': '习经', 'political-economy': '政经' };
  // 各班的颜色（与工作台同一套暖色系：墨绿、赭红、靛蓝、金、紫、橄榄、砖红、石板蓝），深色作文字和左边条，浅色作底
  const PALETTE = [['#23655f', '#e4efeb'], ['#a4492d', '#f5e7df'], ['#3b5683', '#e5ebf5'], ['#8a6418', '#f6ecd6'],
    ['#7a4572', '#f2e6f0'], ['#55672b', '#ebf0dc'], ['#8e3434', '#f6e1e1'], ['#45606e', '#e3ecf0']];
  const KINDS = [
    { id: 'teal', label: '工作', c: '#23655f', s: '#e4efeb' },
    { id: 'rust', label: '重要', c: '#a4492d', s: '#f5e7df' },
    { id: 'gold', label: '会议', c: '#8a6418', s: '#f6ecd6' },
    { id: 'indigo', label: '个人', c: '#3b5683', s: '#e5ebf5' },
    { id: 'holiday', label: '放假停课', c: '#6d6259', s: '#ece6de' },
  ];
  const kindOf = (id) => KINDS.find((kind) => kind.id === id) || KINDS[0];
  // 默认作息（可在“设置”里按学校课表修改）
  const DEFAULT_TIMES = [['08:00', '08:45'], ['08:55', '09:40'], ['10:00', '10:45'], ['10:55', '11:40'], ['14:00', '14:45'], ['14:55', '15:40'],
    ['16:00', '16:45'], ['16:55', '17:40'], ['19:00', '19:45'], ['19:55', '20:40'], ['20:50', '21:35']];
  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.3" fill="currentColor"/></svg>',
    people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.2a3 3 0 010 5.6M17.5 14.3c1.8.6 3 2.2 3.5 4.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  // ---------------- 日期 ----------------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseDay = (text) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const dayDiff = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
  const weekday = (d) => (d.getDay() + 6) % 7 + 1;   // 星期一＝1 …… 星期日＝7
  const today = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const cnDate = (d) => `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${WEEKDAYS[weekday(d) - 1]}`;
  const firstMonday = (year, month) => { const d = new Date(year, month, 1); return addDays(d, (8 - weekday(d)) % 7); };
  // 按今天猜学期：8 月到次年 1 月是第一学期（9 月第一个周一开学），2—7 月是第二学期（3 月第一个周一开学）
  function guessTerm(now = today()) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    if (m >= 8 || m === 1) {
      const y0 = m === 1 ? y - 1 : y;
      return { term: `${y0}—${y0 + 1} 学年第一学期`, start: ymd(firstMonday(y0, 8)) };
    }
    return { term: `${y - 1}—${y} 学年第二学期`, start: ymd(firstMonday(y, 2)) };
  }
  const defaults = () => ({ ...guessTerm(), weeks: 18, sections: [4, 4, 3], times: DEFAULT_TIMES.map(([from, to]) => ({ from, to })) });
  // 读回的设置补齐缺项：节数与各节时间对齐
  function normalize(value) {
    const base = defaults();
    const v = value && typeof value === 'object' ? value : {};
    const sections = Array.isArray(v.sections) && v.sections.length === 3 ? v.sections.map((n) => Math.max(0, Math.min(8, Number(n) || 0))) : base.sections;
    const count = Math.max(1, sections.reduce((a, b) => a + b, 0));
    const times = Array.from({ length: count }, (_, i) => {
      const t = Array.isArray(v.times) && v.times[i] ? v.times[i] : (base.times[i] || { from: '', to: '' });
      return { from: String(t.from || ''), to: String(t.to || '') };
    });
    return {
      term: String(v.term || base.term).slice(0, 40),
      start: parseDay(v.start) ? String(v.start).slice(0, 10) : base.start,
      weeks: Math.max(1, Math.min(30, Number(v.weeks) || base.weeks)),
      sections,
      times,
    };
  }

  const state = {
    backend: null,
    courses: [],
    settings: normalize(null),
    classes: [],
    events: [],
    loaded: false,
    notice: '',          // 后台还没有课表功能等提示
    tab: 'timetable',
    term: '',            // 课表正在看的学期
    week: null,          // 课表正在看的周（0＝全部周次）
    month: null,         // 日程正在看的月份（当月 1 日）
    day: null,           // 日程选中的日期
    editing: null,       // 正在修改的安排 id
    editors: new Set(),
  };
  const periodCount = () => state.settings.times.length;
  const sectionOf = (p) => { let end = 0; for (let k = 0; k < 3; k += 1) { end += state.settings.sections[k]; if (p <= end) return k; } return 2; };
  const timeOf = (from, to) => {
    const a = state.settings.times[from - 1];
    const b = state.settings.times[(to || from) - 1];
    return a && b && a.from && b.to ? `${a.from}—${b.to}` : '';
  };
  const periodText = (from, to) => (from === to ? `第 ${from} 节` : `第 ${from}—${to} 节`);
  const weekRange = (w) => (w && w[0] && w[1] ? (w[0] === w[1] ? `第 ${w[0]} 周` : `${w[0]}—${w[1]} 周`) : '');
  const PARITY = { all: '', odd: '单周', even: '双周' };
  const courseOf = (slug) => state.courses.find((item) => item.slug === slug) || { slug, title: slug };
  const shortOf = (slug) => SHORT[slug] || String(courseOf(slug).title || slug).slice(0, 4);
  const rosterCount = (klass) => (Array.isArray(klass.roster) ? klass.roster.length : 0);
  const missingError = (error) => /42P01|42703|PGRST20[2-5]|does not exist|Could not find|schema cache|未知的后台函数/i.test(String((error && [error.code, error.message].filter(Boolean).join(' ')) || error || ''));
  const NOT_READY = '后台还没有“课表与日程”功能：请先在云开发控制台执行 tools/cloudbase-pg-20261028-课表与日程.sql。在此之前课表按默认作息显示，上课时间、安排和设置都不能保存。';

  // 一个班级的一段上课时间：本学期哪几周上（班级的周次，单双周）
  const slotWeeks = (plan, slot) => {
    const w = Array.isArray(slot.weeks) && slot.weeks[0] ? slot.weeks : (Array.isArray(plan.weeks) && plan.weeks[0] ? plan.weeks : [1, state.settings.weeks]);
    return [Number(w[0]) || 1, Number(w[1]) || state.settings.weeks];
  };
  const inWeek = (plan, slot, week) => {
    const [a, b] = slotWeeks(plan, slot);
    if (week < a || week > b) return false;
    return slot.parity === 'odd' ? week % 2 === 1 : slot.parity === 'even' ? week % 2 === 0 : true;
  };
  // 按学期排好的上课时段：每段带班级、颜色
  function sessionsOf(term) {
    const list = state.classes.filter((klass) => klass.schedule && Array.isArray(klass.schedule.slots) && (klass.schedule.term || state.settings.term) === term)
      .sort((a, b) => String(a.course).localeCompare(String(b.course)) || Number(a.id) - Number(b.id));
    const out = [];
    list.forEach((klass, index) => {
      const [c, s] = PALETTE[index % PALETTE.length];
      klass.schedule.slots.forEach((slot, i) => {
        const from = Math.max(1, Number(slot.from) || 1);
        const to = Math.max(from, Number(slot.to) || from);
        out.push({ klass, plan: klass.schedule, slot, key: `${klass.id}:${i}`, day: Number(slot.day) || 1, from, to, room: slot.room || klass.schedule.room || '', c, s });
      });
    });
    return out;
  }
  const weekOf = (date) => Math.floor(dayDiff(date, parseDay(state.settings.start)) / 7) + 1;
  const currentWeek = () => { const w = weekOf(today()); return w >= 1 && w <= state.settings.weeks ? w : null; };
  // 某一天的课（只算当前学期）
  function classesOn(date) {
    const week = weekOf(date);
    if (week < 1 || week > state.settings.weeks) return [];
    const day = weekday(date);
    return sessionsOf(state.settings.term).filter((item) => item.day === day && inWeek(item.plan, item.slot, week)).sort((a, b) => a.from - b.from);
  }
  const eventsOn = (key) => state.events.filter((item) => String(item.day).slice(0, 10) === key)
    .sort((a, b) => String(a.start_time || '99').localeCompare(String(b.start_time || '99')) || Number(a.id) - Number(b.id));
  const holidayOn = (key) => state.events.some((item) => String(item.day).slice(0, 10) === key && item.color === 'holiday');
  // 同一天时间重叠的课排成一组（课表并排显示，Word 合并成一格）
  function clusters(items) {
    const sorted = items.slice().sort((a, b) => a.from - b.from || a.to - b.to);
    const groups = [];
    sorted.forEach((item) => {
      const last = groups[groups.length - 1];
      if (last && item.from <= last.to) { last.items.push(item); last.to = Math.max(last.to, item.to); } else groups.push({ from: item.from, to: item.to, items: [item] });
    });
    groups.forEach((group) => {
      const lanes = [];
      group.items.forEach((item) => {
        let lane = lanes.findIndex((end) => end < item.from);
        if (lane < 0) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = item.to;
        item.lane = lane;
      });
      group.lanes = lanes.length;
    });
    return groups;
  }
  // 班级上课安排的简短写法：周二第 1—2 节、周四第 3—4 节 · A101 · 1—16 周
  function summary(plan) {
    if (!plan || !Array.isArray(plan.slots) || !plan.slots.length) return '';
    const slots = plan.slots.map((slot) => `周${WEEKDAYS[(Number(slot.day) || 1) - 1]}${periodText(Number(slot.from), Number(slot.to)).replace(/ /g, '')}`
      + `${PARITY[slot.parity] ? `（${PARITY[slot.parity]}）` : ''}${slot.room && slot.room !== plan.room ? `（${slot.room}）` : ''}`).join('、');
    return [slots, plan.room, weekRange(plan.weeks)].filter(Boolean).join(' · ');
  }

  // ---------------- 上课时间编辑器（新建班级表单、课表里的“修改上课时间”共用） ----------------
  function editor(host, initial) {
    let value = initial ? JSON.parse(JSON.stringify(initial)) : null;
    const blankSlot = () => ({ day: 1, from: 1, to: Math.min(2, periodCount()), parity: 'all', room: '', weeks: null });
    const periodOptions = (selected) => Array.from({ length: periodCount() }, (_, i) => {
      const t = state.settings.times[i];
      return `<option value="${i + 1}"${i + 1 === selected ? ' selected' : ''}>${i + 1}${t && t.from ? `（${t.from}）` : ''}</option>`;
    }).join('');
    function render() {
      const plan = value || { term: state.settings.term, room: '', weeks: [1, Math.min(16, state.settings.weeks)], slots: [] };
      const terms = Array.from(new Set([state.settings.term, ...state.classes.map((k) => k.schedule && k.schedule.term).filter(Boolean)]));
      host.innerHTML = `<div class="pl-ed">
        <div class="pl-ed-head">
          <label>学期<input type="text" data-ed="term" maxlength="40" list="pl-terms-${host.dataset.plEd || ''}" value="${esc(plan.term || state.settings.term)}"></label>
          <label>教室<input type="text" data-ed="room" maxlength="40" placeholder="例如：博学楼 A201" value="${esc(plan.room || '')}"></label>
          <label>周次<span class="pl-ed-weeks">第<input type="number" data-ed="w1" min="1" max="30" value="${esc((plan.weeks || [])[0] || 1)}">—<input type="number" data-ed="w2" min="1" max="30" value="${esc((plan.weeks || [])[1] || state.settings.weeks)}">周</span></label>
          <datalist id="pl-terms-${host.dataset.plEd || ''}">${terms.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>
        </div>
        <div class="pl-ed-slots">${(plan.slots.length ? plan.slots : [blankSlot()]).map((slot, i) => `
          <div class="pl-ed-slot" data-slot="${i}">
            <label>星期<select data-s="day">${WEEKDAYS.map((d, k) => `<option value="${k + 1}"${Number(slot.day) === k + 1 ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
            <label>节次<span class="pl-ed-pair"><select data-s="from">${periodOptions(Number(slot.from))}</select>—<select data-s="to">${periodOptions(Number(slot.to))}</select></span></label>
            <label>单双周<select data-s="parity">${Object.entries({ all: '每周', odd: '单周', even: '双周' }).map(([k, t]) => `<option value="${k}"${(slot.parity || 'all') === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
            <label>这段的周次<span class="pl-ed-pair"><input type="number" data-s="w1" min="1" max="30" placeholder="同上" value="${esc(slot.weeks ? slot.weeks[0] : '')}">—<input type="number" data-s="w2" min="1" max="30" placeholder="同上" value="${esc(slot.weeks ? slot.weeks[1] : '')}"></span></label>
            <label>这段的教室<input type="text" data-s="room" maxlength="40" placeholder="同上" value="${esc(slot.room || '')}"></label>
            <button type="button" class="pl-ed-x" data-ed-remove="${i}" title="删除这段上课时间" aria-label="删除这段上课时间">×</button>
          </div>`).join('')}
        </div>
        <div class="pl-ed-foot"><button type="button" class="pl-ed-add" data-ed-add>＋ 再加一段上课时间</button>
          <span class="pl-ed-time" data-ed-time></span></div>
      </div>`;
      showTimes();
    }
    // 从表单读出（不渲染）；没有填教室也没有改动过的单段默认时间，视为没有填写
    function read() {
      const num = (el) => (el && el.value !== '' ? Math.max(1, Math.min(30, Number(el.value) || 1)) : null);
      const plan = {
        term: ($('[data-ed="term"]', host).value || '').trim() || state.settings.term,
        room: ($('[data-ed="room"]', host).value || '').trim(),
        weeks: [num($('[data-ed="w1"]', host)) || 1, num($('[data-ed="w2"]', host)) || state.settings.weeks],
        slots: $$('[data-slot]', host).map((row) => {
          let from = Number($('[data-s="from"]', row).value);
          let to = Number($('[data-s="to"]', row).value);
          if (to < from) [from, to] = [to, from];
          const w1 = num($('[data-s="w1"]', row));
          const w2 = num($('[data-s="w2"]', row));
          const slot = { day: Number($('[data-s="day"]', row).value), from, to };
          const parity = $('[data-s="parity"]', row).value;
          if (parity !== 'all') slot.parity = parity;
          const room = $('[data-s="room"]', row).value.trim();
          if (room) slot.room = room;
          if (w1 || w2) slot.weeks = [w1 || plan.weeks[0], w2 || plan.weeks[1]].sort((a, b) => a - b);
          return slot;
        }),
      };
      plan.weeks.sort((a, b) => a - b);
      return plan;
    }
    function showTimes() {
      const plan = read();
      const box = $('[data-ed-time]', host);
      if (box) box.textContent = plan.slots.map((slot) => `周${WEEKDAYS[slot.day - 1]} ${timeOf(slot.from, slot.to)}`).filter((t) => /\d/.test(t)).join('；');
    }
    host.addEventListener('change', showTimes);
    host.addEventListener('click', (event) => {
      if (event.target.closest('[data-ed-add]')) {
        const plan = read();
        const last = plan.slots[plan.slots.length - 1];
        plan.slots.push(last ? { ...last, day: Math.min(7, last.day + 2) } : blankSlot());
        value = plan;
        render();
      }
      const remove = event.target.closest('[data-ed-remove]');
      if (remove) {
        const plan = read();
        plan.slots.splice(Number(remove.dataset.edRemove), 1);
        value = plan;
        render();
      }
    });
    if (!host.dataset.plEd) host.dataset.plEd = Math.random().toString(36).slice(2, 8);
    render();
    const api = {
      // touched＝填过教室或改过默认时间才算填写（新建班级时整块不填就不保存）
      get(requireTouched) {
        const plan = read();
        if (!plan.slots.length) return null;
        if (requireTouched && !plan.room && !host.dataset.plTouched) return null;
        return plan;
      },
      set(plan) { value = plan ? JSON.parse(JSON.stringify(plan)) : null; delete host.dataset.plTouched; render(); },
      reset() { api.set(null); },
      refresh() { value = host.isConnected && $('[data-slot]', host) ? read() : value; render(); },
    };
    host.addEventListener('input', () => { host.dataset.plTouched = '1'; });
    host.addEventListener('change', () => { host.dataset.plTouched = '1'; });
    state.editors.add(api);
    return api;
  }

  // ---------------- 页面骨架 ----------------
  const view = document.createElement('section');
  view.className = 'pl';
  view.dataset.planner = '';
  view.hidden = true;
  view.innerHTML = `
    <div class="pl-head">
      <div>
        <p class="tw-kicker">TEACHER PLANNER</p>
        <h1 data-pl-title>教师课表</h1>
        <p class="tw-hint" data-pl-sub></p>
      </div>
      <button type="button" class="tw-secondary pl-back" data-pl-close>← 返回工作台</button>
    </div>
    <div class="tw-tabs pl-tabs" role="tablist">
      <button type="button" role="tab" data-pl-tab="timetable">课表</button>
      <button type="button" role="tab" data-pl-tab="calendar">日程</button>
      <button type="button" role="tab" data-pl-tab="settings">作息与学期</button>
    </div>
    <p class="pl-notice" data-pl-notice hidden></p>
    <div data-pl-body></div>`;
  const main = $('.tw-main');
  if (main) main.appendChild(view);

  const dialog = document.createElement('dialog');
  dialog.className = 'tw-dialog pl-dialog';
  dialog.innerHTML = `<form method="dialog" data-pl-form>
      <h2 data-pl-dialog-title>上课时间与教室</h2>
      <p class="tw-hint" data-pl-dialog-hint></p>
      <div data-pl-dialog-editor></div>
      <p class="tw-error" data-pl-dialog-error role="alert"></p>
      <div class="tw-actions">
        <button type="submit" class="tw-primary" value="save">保存</button>
        <button type="button" class="tw-secondary" data-pl-dialog-clear>清除上课时间</button>
        <button type="button" class="tw-secondary" data-pl-dialog-cancel>取消</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const dialogEditor = editor($('[data-pl-dialog-editor]', dialog), null);
  let dialogClass = null;
  let dialogDone = null;

  function open(tab) {
    state.tab = tab || state.tab;
    document.body.classList.add('is-planner');
    view.hidden = false;
    $$('[data-planner-open]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.plannerOpen === state.tab)));
    render();
    window.scrollTo(0, 0);
    load().catch((error) => console.warn('[课表] 读取没有完成：', error));
  }
  function close() {
    document.body.classList.remove('is-planner');
    view.hidden = true;
    $$('[data-planner-open]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
  }
  async function load() {
    if (!state.backend) return;
    const [settings, classes, events] = await Promise.allSettled([
      state.backend.fetchAll('teachersettings', {}), state.backend.fetchAll('classes', {}), state.backend.fetchAll('events', {})]);
    const problems = [settings, classes, events].filter((item) => item.status === 'rejected').map((item) => item.reason);
    problems.forEach((error) => console.warn('[课表]', error));
    state.notice = problems.some(missingError) ? NOT_READY : problems.length ? `读取失败：${problems[0].message || problems[0]}（请刷新页面再试）` : '';
    if (settings.status === 'fulfilled') {
      const row = settings.value.find((item) => item.key === 'planner');
      if (row) state.settings = normalize(row.value);
    }
    if (classes.status === 'fulfilled') state.classes = classes.value;
    if (events.status === 'fulfilled') state.events = events.value;
    state.loaded = true;
    state.editors.forEach((api) => { if (api !== dialogEditor || dialog.open) api.refresh(); });
    if (!view.hidden) render();
  }

  function render() {
    $$('[data-pl-tab]', view).forEach((button) => button.setAttribute('aria-selected', String(button.dataset.plTab === state.tab)));
    $$('[data-planner-open]').forEach((button) => button.setAttribute('aria-pressed', String(!view.hidden && button.dataset.plannerOpen === state.tab)));
    const notice = $('[data-pl-notice]', view);
    notice.hidden = !state.notice;
    notice.textContent = state.notice;
    $('[data-pl-title]', view).textContent = { timetable: '教师课表', calendar: '日程安排', settings: '作息与学期' }[state.tab];
    delete $('[data-pl-title]', view).dataset.term;
    const body = $('[data-pl-body]', view);
    if (state.tab === 'timetable') renderTimetable(body);
    else if (state.tab === 'calendar') renderCalendar(body);
    else renderSettings(body);
  }

  // ---------------- 课表 ----------------
  function renderTimetable(body) {
    const terms = Array.from(new Set([state.settings.term, ...state.classes.map((k) => k.schedule && k.schedule.term).filter(Boolean)]));
    if (!terms.includes(state.term)) state.term = state.settings.term;
    const isCurrent = state.term === state.settings.term;
    const nowWeek = currentWeek();
    if (state.week === null) state.week = isCurrent && nowWeek ? nowWeek : 0;
    if (!isCurrent) state.week = 0;
    const week = state.week;
    const sessions = sessionsOf(state.term);
    const classes = Array.from(new Map(sessions.map((item) => [String(item.klass.id), item])).values());
    const pending = state.classes.filter((klass) => !(klass.schedule && Array.isArray(klass.schedule.slots) && klass.schedule.slots.length))
      .sort((a, b) => String(a.course).localeCompare(String(b.course)) || Number(b.id) - Number(a.id));
    const showWeekend = store.get('weekend') === '1' || sessions.some((item) => item.day >= 6);
    const days = showWeekend ? 7 : 5;
    const monday = week ? addDays(parseDay(state.settings.start), (week - 1) * 7) : null;
    const todayKey = ymd(today());
    const perWeek = sessions.reduce((sum, item) => sum + (item.to - item.from + 1) * (item.slot.parity && item.slot.parity !== 'all' ? 0.5 : 1), 0);
    $('[data-pl-title]', view).dataset.term = `${state.term}${week ? ` · 第 ${week} 周` : ''}`;
    $('[data-pl-sub]', view).textContent = `${state.term}${isCurrent ? ` · 第 1 周从 ${parseDay(state.settings.start).getMonth() + 1} 月 ${parseDay(state.settings.start).getDate()} 日开始，共 ${state.settings.weeks} 周` : ''}。各班的上课时间在新建班级时填写，或在下面“上课班级”里修改。`;

    // 行号：表头 1 行；每个时段的各节一行；时段之间一行“午休”“晚饭”
    const rows = [];
    const rowOf = {};
    const breakRows = [];
    let r = 2;
    let p = 1;
    state.settings.sections.forEach((n, k) => {
      if (!n) return;
      if (rows.length) { breakRows.push({ row: r, name: BREAKS[Math.min(k - 1, 1)] || '休息', after: p - 1 }); rows.push('22px'); r += 1; }
      for (let i = 0; i < n; i += 1) { rowOf[p] = r; rows.push('minmax(64px, auto)'); r += 1; p += 1; }
    });
    const dayCol = (d) => 2 + d;
    const head = Array.from({ length: days }, (_, i) => {
      const date = monday ? addDays(monday, i) : null;
      const isToday = date && ymd(date) === todayKey;
      const off = date && holidayOn(ymd(date));
      return `<div class="pl-tt-day${isToday ? ' is-today' : ''}${off ? ' is-off' : ''}" style="grid-column:${dayCol(i + 1)};grid-row:1">星期${WEEKDAYS[i]}${date ? `<small>${md(date)}${off ? ' · 停课' : ''}</small>` : ''}</div>`;
    }).join('');
    let cells = '';
    let k0 = -1;
    for (let q = 1; q <= periodCount(); q += 1) {
      const k = sectionOf(q);
      if (k !== k0) {
        const n = state.settings.sections[k];
        cells += `<div class="pl-tt-sec is-s${k}" style="grid-column:1;grid-row:${rowOf[q]} / span ${n}"><span>${SECTIONS[k]}</span></div>`;
        k0 = k;
      }
      const t = state.settings.times[q - 1];
      cells += `<div class="pl-tt-num" style="grid-column:2;grid-row:${rowOf[q]}"><b>${q}</b><small>${esc(t.from)}${t.from || t.to ? '<br>' : ''}${esc(t.to)}</small></div>`;
      for (let d = 1; d <= days; d += 1) {
        const date = monday ? ymd(addDays(monday, d - 1)) : '';
        cells += `<div class="pl-tt-cell${date === todayKey ? ' is-today' : ''}${q === state.settings.sections.slice(0, k + 1).reduce((a, b) => a + b, 0) ? ' is-end' : ''}" style="grid-column:${dayCol(d)};grid-row:${rowOf[q]}"></div>`;
      }
    }
    const breaks = breakRows.map((b) => {
      const end = state.settings.times[b.after - 1];
      const next = state.settings.times[b.after];
      return `<div class="pl-tt-break" style="grid-column:1 / -1;grid-row:${b.row}"><span>${b.name}${end && next && end.to && next.from ? ` ${end.to}—${next.from}` : ''}</span></div>`;
    }).join('');
    let blocks = '';
    for (let d = 1; d <= days; d += 1) {
      clusters(sessions.filter((item) => item.day === d && item.from <= periodCount())).forEach((group) => {
        group.items.forEach((item) => {
          const to = Math.min(item.to, periodCount());
          const active = !week || inWeek(item.plan, item.slot, week);
          const date = monday ? ymd(addDays(monday, d - 1)) : '';
          const off = active && date && holidayOn(date);
          const note = !active ? '本周不上' : off ? '放假停课' : '';
          const tags = [weekRange(slotWeeks(item.plan, item.slot)), PARITY[item.slot.parity]].filter(Boolean).join(' · ');
          blocks += `<button type="button" class="pl-tt-block${active && !off ? '' : ' is-idle'}${group.lanes > 1 ? ' is-clash' : ''}" data-pl-edit="${esc(item.klass.id)}"
            style="grid-column:${dayCol(d)};grid-row:${rowOf[item.from]} / ${(rowOf[to] || rowOf[item.from]) + 1};--c:${item.c};--s:${item.s};--lane:${item.lane};--lanes:${group.lanes}"
            title="${esc(`${courseOf(item.klass.course).title} · ${item.klass.name}\n${periodText(item.from, item.to)} ${timeOf(item.from, item.to)}\n点击修改上课时间`)}">
            <em>${esc(shortOf(item.klass.course))}</em>
            <b>${esc(courseOf(item.klass.course).title)}</b>
            <span class="pl-tt-class">${esc(item.klass.name)}${rosterCount(item.klass) ? `<i>${rosterCount(item.klass)} 人</i>` : ''}</span>
            ${item.room ? `<span class="pl-tt-room">${ICONS.pin}${esc(item.room)}</span>` : ''}
            <small>${esc(tags)}${note ? `<strong>${note}</strong>` : ''}</small>
          </button>`;
        });
      });
    }
    const clash = sessions.some((a) => sessions.some((b) => a !== b && a.day === b.day && a.from <= b.to && b.from <= a.to
      && (!week || (inWeek(a.plan, a.slot, week) && inWeek(b.plan, b.slot, week)))));
    const weekNav = isCurrent ? `<div class="pl-weeknav">
        <button type="button" class="pl-icon" data-pl-week="-1" aria-label="上一周"${week <= 1 ? ' disabled' : ''}>${ICONS.prev}</button>
        <select data-pl-week-select aria-label="选择周次"><option value="0"${!week ? ' selected' : ''}>全部周次</option>${Array.from({ length: state.settings.weeks }, (_, i) => `<option value="${i + 1}"${week === i + 1 ? ' selected' : ''}>第 ${i + 1} 周${nowWeek === i + 1 ? '（本周）' : ''}</option>`).join('')}</select>
        <button type="button" class="pl-icon" data-pl-week="1" aria-label="下一周"${week >= state.settings.weeks ? ' disabled' : ''}>${ICONS.next}</button>
        ${nowWeek ? `<button type="button" class="pl-chip" data-pl-week-now${week === nowWeek ? ' aria-pressed="true"' : ''}>本周</button>` : ''}
      </div>` : '<span class="pl-chip is-static">往届学期 · 全部周次</span>';
    body.innerHTML = `
      <div class="pl-tt-bar">
        <div class="pl-stats">
          <span><b>${classes.length}</b>个班</span>
          <span><b>${Number.isInteger(perWeek) ? perWeek : perWeek.toFixed(1)}</b>节／周</span>
          ${nowWeek && isCurrent ? `<span>本周第<b>${nowWeek}</b>周 · 共 ${state.settings.weeks} 周</span>` : `<span>不在学期内 · 共 ${state.settings.weeks} 周</span>`}
        </div>
        <div class="pl-tt-tools">
          <label class="pl-term">学期<select data-pl-term>${terms.map((t) => `<option${t === state.term ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          ${weekNav}
          <label class="pl-check"><input type="checkbox" data-pl-weekend${showWeekend ? ' checked' : ''}${sessions.some((item) => item.day >= 6) ? ' disabled' : ''}>周六日</label>
          <button type="button" class="tw-secondary pl-btn" data-pl-word>导出 Word</button>
          <button type="button" class="tw-secondary pl-btn" data-pl-print>打印</button>
        </div>
      </div>
      ${clash ? '<p class="pl-warn">有两个班的上课时间重叠（并排显示的格子），请核对。</p>' : ''}
      <div class="pl-tt-wrap"><div class="pl-tt" style="--days:${days};grid-template-rows:auto ${rows.join(' ')}">
        <div class="pl-tt-corner" style="grid-column:1 / span 2;grid-row:1">${week ? `第 ${week} 周` : '节次'}</div>
        ${head}${cells}${breaks}${blocks}
      </div></div>
      ${sessions.length ? '' : `<p class="pl-empty">${esc(state.term)}还没有排课。新建班级时填写“上课时间与教室”，或在下面给已有班级填写。</p>`}
      <h2 class="pl-h2">上课班级</h2>
      <div class="pl-classes">${classes.map((item) => `
        <article class="pl-class" style="--c:${item.c};--s:${item.s}">
          <div><em>${esc(shortOf(item.klass.course))}</em><b>${esc(item.klass.name)}</b><small>${esc(courseOf(item.klass.course).title)}${rosterCount(item.klass) ? ` · ${rosterCount(item.klass)} 人` : ''}</small></div>
          <p>${esc(summary(item.klass.schedule))}</p>
          <p class="pl-class-times">${item.klass.schedule.slots.map((slot) => `周${WEEKDAYS[slot.day - 1]} ${timeOf(Number(slot.from), Number(slot.to))}`).filter((t) => /\d/.test(t)).join('　')}</p>
          <button type="button" class="pl-link" data-pl-edit="${esc(item.klass.id)}">修改上课时间</button>
        </article>`).join('') || '<p class="pl-empty">本学期还没有填写上课时间的班级。</p>'}</div>
      ${pending.length ? `<h2 class="pl-h2">还没有填写上课时间的班级</h2>
      <div class="pl-pending">${pending.map((klass) => `<button type="button" class="pl-pend" data-pl-edit="${esc(klass.id)}"><em>${esc(shortOf(klass.course))}</em>${esc(klass.name)}<span>填写 →</span></button>`).join('')}</div>` : ''}`;
  }

  // 课表导出 Word：A4 横向，节次×星期，连上的几节合并成一格；下面附上课班级清单
  function exportWord() {
    const O = window.ClassLive && window.ClassLive.office;
    if (!O) return;
    const isCurrent = state.term === state.settings.term;
    const week = isCurrent ? state.week : 0;
    const sessions = sessionsOf(state.term).filter((item) => !week || inWeek(item.plan, item.slot, week));
    const days = store.get('weekend') === '1' || sessions.some((item) => item.day >= 6) ? 7 : 5;
    const total = 13958;
    const widths = [620, 1180];
    const each = Math.floor((total - 1800) / days);
    for (let d = 0; d < days; d += 1) widths.push(each);
    const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="8C7B6B"/>`).join('') + '</w:tblBorders>';
    const p = (text, { bold = false, size = 20, east = '宋体', color = '', jc = 'center' } = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="260" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${O.runs(text, { bold, size, east, color })}</w:p>`;
    const cell = (w, content, { fill = '', merge = '', span = 1 } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${merge ? `<w:vMerge${merge === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${content || p('')}</w:tc>`;
    const head = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="520"/></w:trPr>${cell(widths[0] + widths[1], p('节次', { bold: true, east: '黑体', size: 21 }), { fill: 'E4EFEB', span: 2 })}`
      + Array.from({ length: days }, (_, i) => {
        const date = week ? addDays(parseDay(state.settings.start), (week - 1) * 7 + i) : null;
        return cell(widths[2 + i], p(`星期${WEEKDAYS[i]}${date ? `（${date.getMonth() + 1}月${date.getDate()}日）` : ''}`, { bold: true, east: '黑体', size: 21 }), { fill: 'E4EFEB' });
      }).join('') + '</w:tr>';
    const groupsByDay = Array.from({ length: days }, (_, d) => clusters(sessions.filter((item) => item.day === d + 1)));
    let body = '';
    for (let q = 1; q <= periodCount(); q += 1) {
      const k = sectionOf(q);
      const first = state.settings.sections.slice(0, k).reduce((a, b) => a + b, 0) + 1;
      const t = state.settings.times[q - 1];
      let row = `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="620"/></w:trPr>`
        + cell(widths[0], q === first ? p(SECTIONS[k], { bold: true, east: '黑体', size: 21 }) : '', { fill: 'F4EDE3', merge: q === first ? 'restart' : 'continue' })
        + cell(widths[1], p(`第${q}节`, { bold: true, size: 20 }) + (t.from ? p(`${t.from}—${t.to}`, { size: 16, color: '6D6259' }) : ''));
      groupsByDay.forEach((groups, d) => {
        const group = groups.find((g) => q >= g.from && q <= g.to);
        if (!group) { row += cell(widths[2 + d], ''); return; }
        if (q !== group.from) { row += cell(widths[2 + d], '', { merge: 'continue', fill: group.items[0].s.slice(1).toUpperCase() }); return; }
        const content = group.items.map((item) => p(courseOf(item.klass.course).title, { bold: true, size: 20, color: item.c.slice(1).toUpperCase() })
          + p(`${item.klass.name}${rosterCount(item.klass) ? `（${rosterCount(item.klass)}人）` : ''}`, { size: 18 })
          + (item.room ? p(item.room, { size: 18 }) : '')
          + p([weekRange(slotWeeks(item.plan, item.slot)), PARITY[item.slot.parity]].filter(Boolean).join(' '), { size: 16, color: '6D6259' })).join(p(''));
        row += cell(widths[2 + d], content, { merge: group.to > group.from ? 'restart' : '', fill: group.items[0].s.slice(1).toUpperCase() });
      });
      body += row + '</w:tr>';
    }
    const grid = `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/>${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>`
      + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`;
    const classes = Array.from(new Map(sessionsOf(state.term).map((item) => [String(item.klass.id), item.klass])).values());
    const list = O.table([['课程', '班级', '人数', '上课时间', '教室', '周次']].concat(classes.map((klass) => [
      courseOf(klass.course).title, klass.name, rosterCount(klass) ? String(rosterCount(klass)) : '',
      klass.schedule.slots.map((slot) => `周${WEEKDAYS[slot.day - 1]}${periodText(Number(slot.from), Number(slot.to)).replace(/ /g, '')}${PARITY[slot.parity] ? `（${PARITY[slot.parity]}）` : ''} ${timeOf(Number(slot.from), Number(slot.to))}`).join('\n'),
      Array.from(new Set([klass.schedule.room, ...klass.schedule.slots.map((slot) => slot.room)].filter(Boolean))).join('、'),
      weekRange(klass.schedule.weeks)])), [2600, 2700, 900, 3700, 2300, 1500]);
    const title = O.para('教师课表', 'title');
    const sub = O.para(`${state.term}${week ? ` · 第 ${week} 周` : ''}`, 'subtitle');
    const blob = O.docx(title + sub + grid + O.para('', 'plain') + O.para('上课班级', 'h') + list
      + O.para(`导出时间：${ymd(new Date())}。课表按教师工作台各班填写的上课时间生成。`, 'note'), { landscape: true });
    O.save(blob, `教师课表_${state.term.replace(/\s+/g, '')}${week ? `_第${week}周` : ''}.docx`);
  }

  // ---------------- 日程 ----------------
  function renderCalendar(body) {
    const now = today();
    if (!state.month) state.month = new Date(now.getFullYear(), now.getMonth(), 1);
    if (!state.day) state.day = ymd(now);
    const month = state.month;
    const start = addDays(month, 1 - weekday(month));
    const todayKey = ymd(now);
    $('[data-pl-sub]', view).textContent = `月历上自动显示课表里的课（${state.settings.term}，第 1 周从 ${state.settings.start} 开始）和你记下的安排。点日期查看当天、新建安排；类别选“放假停课”的安排会把当天的课划掉。`;
    const cells = Array.from({ length: 42 }, (_, i) => {
      const date = addDays(start, i);
      const key = ymd(date);
      const classes = classesOn(date);
      const events = eventsOn(key);
      const off = holidayOn(key);
      const week = weekOf(date);
      const items = events.map((item) => { const kind = kindOf(item.color); return `<li class="pl-cal-ev${item.done ? ' is-done' : ''}" style="--c:${kind.c};--s:${kind.s}" title="${esc([item.start_time, item.title].filter(Boolean).join(' '))}">${item.start_time ? `<time>${esc(item.start_time)}</time>` : ''}${esc(item.title)}</li>`; })
        .concat(classes.map((item) => `<li class="pl-cal-class${off ? ' is-off' : ''}" style="--c:${item.c};--s:${item.s}" title="${esc(`${periodText(item.from, item.to)} ${timeOf(item.from, item.to)} ${courseOf(item.klass.course).title} ${item.klass.name}${item.room ? ` · ${item.room}` : ''}`)}"><time>${item.from}-${item.to}</time>${esc(item.klass.name)}</li>`));
      return `<button type="button" class="pl-cal-cell${date.getMonth() !== month.getMonth() ? ' is-out' : ''}${key === todayKey ? ' is-today' : ''}${key === state.day ? ' is-picked' : ''}${weekday(date) >= 6 ? ' is-weekend' : ''}${off ? ' is-holiday' : ''}" data-pl-day="${key}">
        <span class="pl-cal-date"><b>${date.getDate()}</b>${weekday(date) === 1 && week >= 1 && week <= state.settings.weeks ? `<small>第${week}周</small>` : ''}</span>
        <ul>${items.slice(0, 4).join('')}${items.length > 4 ? `<li class="pl-cal-more">还有 ${items.length - 4} 项</li>` : ''}</ul>
      </button>`;
    }).join('');
    body.innerHTML = `
      <div class="pl-cal-layout">
        <div class="pl-cal">
          <div class="pl-cal-bar">
            <button type="button" class="pl-icon" data-pl-month="-1" aria-label="上个月">${ICONS.prev}</button>
            <h2>${month.getFullYear()} 年 ${month.getMonth() + 1} 月</h2>
            <button type="button" class="pl-icon" data-pl-month="1" aria-label="下个月">${ICONS.next}</button>
            <button type="button" class="pl-chip" data-pl-today>今天</button>
            <span class="pl-legend">${KINDS.map((kind) => `<i style="--c:${kind.c}"></i>${kind.label}`).join('')}<i class="is-class"></i>课</span>
          </div>
          <div class="pl-cal-grid">
            ${WEEKDAYS.map((d, i) => `<div class="pl-cal-wd${i >= 5 ? ' is-weekend' : ''}">${d}</div>`).join('')}
            ${cells}
          </div>
        </div>
        <aside class="pl-side" data-pl-side></aside>
      </div>`;
    renderSide();
  }
  function renderSide() {
    const side = $('[data-pl-side]', view);
    if (!side) return;
    const date = parseDay(state.day) || today();
    const key = ymd(date);
    const classes = classesOn(date);
    const events = eventsOn(key);
    const off = holidayOn(key);
    const week = weekOf(date);
    const editing = state.editing ? state.events.find((item) => String(item.id) === String(state.editing)) : null;
    const form = editing || { day: key, start_time: '', end_time: '', title: '', note: '', color: 'teal', done: false };
    const upcoming = [];
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(today(), i);
      const k = ymd(d);
      const list = eventsOn(k).filter((item) => !item.done).map((item) => ({ time: item.start_time || '', text: item.title, kind: kindOf(item.color) }))
        .concat(holidayOn(k) ? [] : classesOn(d).map((item) => ({ time: (state.settings.times[item.from - 1] || {}).from || '', text: `${shortOf(item.klass.course)} ${item.klass.name}${item.room ? ` · ${item.room}` : ''}`, kind: { c: item.c, s: item.s }, cls: true })));
      if (list.length) upcoming.push({ d, k, list: list.sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99'))) });
    }
    side.innerHTML = `
      <section class="pl-day">
        <header><b>${cnDate(date)}</b><small>${week >= 1 && week <= state.settings.weeks ? `第 ${week} 周` : ''}${off ? ' · 放假停课' : ''}</small></header>
        ${classes.length ? `<ul class="pl-day-classes">${classes.map((item) => `<li class="${off ? 'is-off' : ''}" style="--c:${item.c};--s:${item.s}">
          <time>${periodText(item.from, item.to)}<small>${timeOf(item.from, item.to)}</small></time>
          <div><b>${esc(courseOf(item.klass.course).title)}</b><span>${esc(item.klass.name)}${item.room ? ` · ${esc(item.room)}` : ''}</span></div></li>`).join('')}</ul>` : ''}
        ${events.length ? `<ul class="pl-day-events">${events.map((item) => { const kind = kindOf(item.color); return `<li class="${item.done ? 'is-done' : ''}${String(item.id) === String(state.editing) ? ' is-editing' : ''}" style="--c:${kind.c};--s:${kind.s}">
          <label class="pl-done" title="${item.done ? '标为未完成' : '标为完成'}"><input type="checkbox" data-pl-done="${esc(item.id)}"${item.done ? ' checked' : ''}><span></span></label>
          <div><b>${esc(item.title)}</b><small>${[item.start_time && `${item.start_time}${item.end_time ? `—${item.end_time}` : ''}`, kind.label].filter(Boolean).map(esc).join(' · ')}</small>${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>
          <span class="pl-ev-actions"><button type="button" data-pl-ev-edit="${esc(item.id)}">修改</button><button type="button" data-pl-ev-del="${esc(item.id)}">删除</button></span></li>`; }).join('')}</ul>` : ''}
        ${classes.length || events.length ? '' : '<p class="pl-quiet">这天没有课，也没有安排。</p>'}
        <form class="pl-ev-form" data-pl-ev-form>
          <h3>${editing ? '修改安排' : '新建安排'}</h3>
          <label>标题<input type="text" name="title" maxlength="60" required placeholder="例如：教研室会议、交期中成绩" value="${esc(form.title)}"></label>
          <div class="pl-ev-row">
            <label>日期<input type="date" name="day" required value="${esc(String(form.day).slice(0, 10))}"></label>
            <label>开始<input type="time" name="start" value="${esc(form.start_time || '')}"></label>
            <label>结束<input type="time" name="end" value="${esc(form.end_time || '')}"></label>
          </div>
          <fieldset class="pl-kinds"><legend>类别</legend>${KINDS.map((kind) => `<label style="--c:${kind.c};--s:${kind.s}"><input type="radio" name="color" value="${kind.id}"${(form.color || 'teal') === kind.id ? ' checked' : ''}><span>${kind.label}</span></label>`).join('')}</fieldset>
          <label>备注<textarea name="note" rows="2" maxlength="500" placeholder="选填：地点、要带的材料……">${esc(form.note || '')}</textarea></label>
          <p class="tw-error" data-pl-ev-error role="alert"></p>
          <div class="tw-actions"><button type="submit" class="tw-primary">${editing ? '保存修改' : '添加安排'}</button>${editing ? '<button type="button" class="tw-secondary" data-pl-ev-cancel>取消修改</button>' : ''}</div>
        </form>
      </section>
      <section class="pl-agenda">
        <h3>今后 7 天</h3>
        ${upcoming.length ? upcoming.map((group) => `<div class="pl-agenda-day"><button type="button" data-pl-day="${group.k}">${group.k === ymd(today()) ? '今天' : `${md(group.d)} 周${WEEKDAYS[weekday(group.d) - 1]}`}</button>
          <ul>${group.list.map((item) => `<li class="${item.cls ? 'is-class' : ''}" style="--c:${item.kind.c};--s:${item.kind.s}"><time>${esc(item.time)}</time>${esc(item.text)}</li>`).join('')}</ul></div>`).join('') : '<p class="pl-quiet">今后 7 天没有课和安排。</p>'}
      </section>`;
  }
  async function saveEvent(form) {
    const error = $('[data-pl-ev-error]', view);
    error.textContent = '';
    const data = new FormData(form);
    const editing = state.editing ? state.events.find((item) => String(item.id) === String(state.editing)) : null;
    try {
      const saved = await state.backend.rpc('ck_save_event', {
        p_id: editing ? Number(editing.id) || editing.id : null,
        p_day: data.get('day'), p_start: data.get('start') || null, p_end: data.get('end') || null,
        p_title: String(data.get('title') || '').trim(), p_note: String(data.get('note') || '').trim() || null,
        p_color: data.get('color') || 'teal', p_done: editing ? Boolean(editing.done) : false,
      });
      const row = Array.isArray(saved) ? saved[0] : saved;
      state.events = state.events.filter((item) => String(item.id) !== String(row.id)).concat(row);
      state.editing = null;
      state.day = String(row.day).slice(0, 10);
      const d = parseDay(state.day);
      state.month = new Date(d.getFullYear(), d.getMonth(), 1);
      render();
    } catch (problem) {
      console.error(problem);
      error.textContent = missingError(problem) ? NOT_READY : `保存失败：${problem.message || problem}`;
    }
  }
  async function toggleDone(id, done) {
    const item = state.events.find((row) => String(row.id) === String(id));
    if (!item) return;
    try {
      const saved = await state.backend.rpc('ck_save_event', { p_id: Number(item.id) || item.id, p_day: String(item.day).slice(0, 10), p_start: item.start_time, p_end: item.end_time,
        p_title: item.title, p_note: item.note, p_color: item.color, p_done: done });
      Object.assign(item, Array.isArray(saved) ? saved[0] : saved);
    } catch (problem) {
      console.error(problem);
      window.alert(`没有保存：${problem.message || problem}`);
    }
    render();
  }
  async function removeEvent(id) {
    const item = state.events.find((row) => String(row.id) === String(id));
    if (!item || !window.confirm(`删除安排“${item.title}”？`)) return;
    try {
      await state.backend.removeAll('events', { id: item.id });
      state.events = state.events.filter((row) => row !== item);
      if (String(state.editing) === String(id)) state.editing = null;
    } catch (problem) {
      console.error(problem);
      window.alert(`删除失败：${problem.message || problem}`);
    }
    render();
  }

  // ---------------- 作息与学期 ----------------
  function renderSettings(body) {
    const s = state.settings;
    $('[data-pl-sub]', view).textContent = '课表和日程按这里的学期、第 1 周日期和作息时间排。每学期开学前改一次；各班的上课时间在新建班级时填写。';
    let q = 0;
    body.innerHTML = `<form class="pl-settings" data-pl-settings>
      <div class="tw-card wide">
        <h2>学期</h2>
        <div class="pl-set-row">
          <label>学期名称<input type="text" name="term" maxlength="40" value="${esc(s.term)}" required></label>
          <label>第 1 周的周一<input type="date" name="start" value="${esc(s.start)}" required></label>
          <label>本学期周数<input type="number" name="weeks" min="1" max="30" value="${esc(s.weeks)}" required></label>
        </div>
        <p class="tw-hint">新学期开始时改学期名称和第 1 周的日期；以前学期的班级仍保留原来的学期，课表上方可以切换查看。</p>
      </div>
      <div class="tw-card wide">
        <h2>作息时间</h2>
        <div class="pl-set-row">${SECTIONS.map((name, k) => `<label>${name}几节<input type="number" name="sec${k}" min="0" max="8" value="${s.sections[k]}" data-pl-sec></label>`).join('')}</div>
        <div class="pl-times">${SECTIONS.map((name, k) => (s.sections[k] ? `<div class="pl-times-group"><h3>${name}</h3>${Array.from({ length: s.sections[k] }, () => {
          q += 1;
          const t = s.times[q - 1] || { from: '', to: '' };
          return `<label><b>第 ${q} 节</b><input type="time" name="from${q}" value="${esc(t.from)}">—<input type="time" name="to${q}" value="${esc(t.to)}"></label>`;
        }).join('')}</div>` : '')).join('')}</div>
        <div class="tw-actions"><button type="button" class="tw-secondary" data-pl-auto>按每节 45 分钟、课间 10 分钟顺排</button><button type="button" class="tw-secondary" data-pl-default>恢复默认作息</button></div>
      </div>
      <p class="tw-error" data-pl-set-error role="alert"></p>
      <div class="tw-actions"><button type="submit" class="tw-primary">保存</button></div>
    </form>`;
  }
  function readSettings(form) {
    const data = new FormData(form);
    const sections = [0, 1, 2].map((k) => Math.max(0, Math.min(8, Number(data.get(`sec${k}`)) || 0)));
    const count = sections.reduce((a, b) => a + b, 0);
    const times = Array.from({ length: count }, (_, i) => ({ from: String(data.get(`from${i + 1}`) || (state.settings.times[i] || {}).from || ''), to: String(data.get(`to${i + 1}`) || (state.settings.times[i] || {}).to || '') }));
    return normalize({ term: String(data.get('term') || '').trim(), start: data.get('start'), weeks: data.get('weeks'), sections, times });
  }
  // 每个时段第一节的开始时间不变，其后每节 45 分钟、课间 10 分钟
  function autoTimes(plan) {
    const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const toText = (n) => `${pad(Math.floor(n / 60) % 24)}:${pad(n % 60)}`;
    let q = 0;
    plan.sections.forEach((n, k) => {
      let at = toMin((plan.times[q] || {}).from) ?? [480, 840, 1140][k];
      for (let i = 0; i < n; i += 1) { plan.times[q] = { from: toText(at), to: toText(at + 45) }; at += 55; q += 1; }
    });
    return plan;
  }

  // ---------------- 事件 ----------------
  view.addEventListener('click', (event) => {
    const t = event.target;
    if (t.closest('[data-pl-close]')) { close(); return; }
    const tab = t.closest('[data-pl-tab]');
    if (tab) { state.tab = tab.dataset.plTab; state.editing = null; render(); return; }
    const edit = t.closest('[data-pl-edit]');
    if (edit) { const klass = state.classes.find((item) => String(item.id) === edit.dataset.plEdit); if (klass) editClass(klass, () => render()); return; }
    const step = t.closest('[data-pl-week]');
    if (step) { state.week = Math.max(1, Math.min(state.settings.weeks, (state.week || currentWeek() || 1) + Number(step.dataset.plWeek))); render(); return; }
    if (t.closest('[data-pl-week-now]')) { state.week = currentWeek() || 0; render(); return; }
    if (t.closest('[data-pl-word]')) { exportWord(); return; }
    if (t.closest('[data-pl-print]')) { window.print(); return; }
    const month = t.closest('[data-pl-month]');
    if (month) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(month.dataset.plMonth), 1); render(); return; }
    if (t.closest('[data-pl-today]')) { const d = today(); state.month = new Date(d.getFullYear(), d.getMonth(), 1); state.day = ymd(d); state.editing = null; render(); return; }
    const day = t.closest('[data-pl-day]');
    if (day) {
      state.day = day.dataset.plDay;
      state.editing = null;
      const d = parseDay(state.day);
      if (d.getMonth() !== state.month.getMonth() || d.getFullYear() !== state.month.getFullYear()) { state.month = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
      else { $$('.pl-cal-cell', view).forEach((cell) => cell.classList.toggle('is-picked', cell.dataset.plDay === state.day)); renderSide(); }
      return;
    }
    const evEdit = t.closest('[data-pl-ev-edit]');
    if (evEdit) { state.editing = evEdit.dataset.plEvEdit; renderSide(); $('[data-pl-ev-form] input[name="title"]', view).focus(); return; }
    if (t.closest('[data-pl-ev-cancel]')) { state.editing = null; renderSide(); return; }
    const evDel = t.closest('[data-pl-ev-del]');
    if (evDel) { removeEvent(evDel.dataset.plEvDel); return; }
    if (t.closest('[data-pl-auto]')) { state.settings = autoTimes(readSettings($('[data-pl-settings]', view))); render(); return; }
    if (t.closest('[data-pl-default]')) {
      const form = readSettings($('[data-pl-settings]', view));
      state.settings = { ...form, sections: defaults().sections, times: defaults().times };
      render();
    }
  });
  view.addEventListener('change', (event) => {
    const t = event.target;
    if (t.matches('[data-pl-term]')) { state.term = t.value; state.week = t.value === state.settings.term ? null : 0; render(); }
    else if (t.matches('[data-pl-week-select]')) { state.week = Number(t.value); render(); }
    else if (t.matches('[data-pl-weekend]')) { store.set('weekend', t.checked ? '1' : '0'); render(); }
    else if (t.matches('[data-pl-done]')) toggleDone(t.dataset.plDone, t.checked);
    else if (t.matches('[data-pl-sec]')) { state.settings = readSettings($('[data-pl-settings]', view)); render(); }
  });
  view.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.matches('[data-pl-ev-form]')) { await saveEvent(form); return; }
    if (form.matches('[data-pl-settings]')) {
      const error = $('[data-pl-set-error]', view);
      const plan = readSettings(form);
      try {
        await state.backend.rpc('ck_save_teacher_setting', { p_key: 'planner', p_value: plan });
        state.settings = plan;
        state.term = plan.term;
        state.week = null;
        state.editors.forEach((api) => api.refresh());
        render();
        $('[data-pl-set-error]', view).textContent = '';
        const ok = document.createElement('p');
        ok.className = 'pl-saved';
        ok.textContent = '已保存。';
        $('[data-pl-settings] > .tw-actions', view).appendChild(ok);
      } catch (problem) {
        console.error(problem);
        error.textContent = missingError(problem) ? NOT_READY : `保存失败：${problem.message || problem}`;
      }
    }
  });

  // 修改某个班级的上课时间（课表里的格子、班级清单、工作台“导出与清理 → 班级”）
  function editClass(klass, done) {
    dialogClass = klass;
    dialogDone = done || null;
    $('[data-pl-dialog-title]', dialog).textContent = `上课时间与教室 · ${klass.name}`;
    $('[data-pl-dialog-hint]', dialog).textContent = `${courseOf(klass.course).title}。按学校课表填写星期、节次、单双周和教室，保存后自动排进“课表”和“日程”；同一个班每周上几次就加几段。`;
    $('[data-pl-dialog-error]', dialog).textContent = '';
    $('[data-pl-dialog-clear]', dialog).hidden = !(klass.schedule && klass.schedule.slots && klass.schedule.slots.length);
    dialogEditor.set(klass.schedule || null);
    dialog.showModal();
  }
  async function saveSchedule(plan) {
    const klass = dialogClass;
    const error = $('[data-pl-dialog-error]', dialog);
    try {
      const saved = await state.backend.rpc('ck_set_class_schedule', { p_class: Number(klass.id) || klass.id, p_schedule: plan });
      const row = Array.isArray(saved) ? saved[0] : saved;
      state.classes = state.classes.filter((item) => String(item.id) !== String(row.id)).concat(row);
      dialog.close();
      if (dialogDone) dialogDone(row);
      if (!view.hidden) render();
    } catch (problem) {
      console.error(problem);
      error.textContent = missingError(problem) ? NOT_READY : `保存失败：${problem.message || problem}`;
    }
  }
  $('[data-pl-form]', dialog).addEventListener('submit', (event) => {
    event.preventDefault();
    const plan = dialogEditor.get(false);
    if (!plan) { $('[data-pl-dialog-error]', dialog).textContent = '至少填写一段上课时间；不上课了请点“清除上课时间”。'; return; }
    saveSchedule(plan);
  });
  $('[data-pl-dialog-clear]', dialog).addEventListener('click', () => {
    if (window.confirm(`清除“${dialogClass.name}”的上课时间？这个班会从课表和日程里去掉（班级本身和学生记录不受影响）。`)) saveSchedule(null);
  });
  $('[data-pl-dialog-cancel]', dialog).addEventListener('click', () => dialog.close());

  // 顶部“课表”“日程”按钮
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-planner-open]');
    if (!button) return;
    if (!view.hidden && state.tab === button.dataset.plannerOpen) { close(); return; }
    open(button.dataset.plannerOpen);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !view.hidden && !dialog.open && !document.querySelector('dialog[open]')) close(); });

  window.ClassLivePlanner = {
    // live-teacher 登录后调用
    ready(backend, courses) {
      state.backend = backend;
      state.courses = courses || [];
      load().catch((error) => console.warn('[课表] 读取没有完成：', error));
    },
    // 新建、删除班级后刷新
    reload() { return load(); },
    editor,
    editClass(klass, done) {
      const known = state.classes.find((item) => String(item.id) === String(klass.id));
      editClass(known ? { ...known, ...klass } : klass, done);
    },
    summary,
    save: async (klassId, plan) => state.backend.rpc('ck_set_class_schedule', { p_class: Number(klassId) || klassId, p_schedule: plan }),
    missingError,
    NOT_READY,
    open,
    close,
  };
})();
