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
  // 默认作息：按用户的课表《我的课表.docx》（2026-10-28）——每节 40 分钟，上午 8:30、下午 13:30、晚上 18:00 开始，各 4 节；可在“作息与学期”里修改
  const DEFAULT_TIMES = [['08:30', '09:10'], ['09:15', '09:55'], ['10:10', '10:50'], ['10:55', '11:35'], ['13:30', '14:10'], ['14:15', '14:55'],
    ['15:10', '15:50'], ['15:55', '16:35'], ['18:00', '18:40'], ['18:45', '19:25'], ['19:40', '20:20'], ['20:25', '21:05']];
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
  const defaults = () => ({ ...guessTerm(), weeks: 18, sections: [4, 4, 4], times: DEFAULT_TIMES.map(([from, to]) => ({ from, to })),
    dept: '', teacher: '', staff: '', extras: [] });
  const clip = (value, n) => String(value == null ? '' : value).trim().slice(0, n);
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
    // 其他课程：不在本网站上课的（如研究生课），只为排进课表，和班级的上课安排同样写法，另加课程名称、班级
    const extras = (Array.isArray(v.extras) ? v.extras : []).filter((e) => e && Array.isArray(e.slots) && e.slots.length).slice(0, 12).map((e, i) => ({
      id: clip(e.id, 20) || `x${i + 1}`, title: clip(e.title, 40) || '其他课程', klass: clip(e.klass, 40), code: clip(e.code, 40),
      term: clip(e.term, 40) || base.term, room: clip(e.room, 40), weeks: Array.isArray(e.weeks) ? e.weeks.slice(0, 2) : null, slots: e.slots.slice(0, 14) }));
    return {
      term: String(v.term || base.term).slice(0, 40),
      start: parseDay(v.start) ? String(v.start).slice(0, 10) : base.start,
      weeks: Math.max(1, Math.min(30, Number(v.weeks) || base.weeks)),
      sections,
      times,
      dept: clip(v.dept, 40),         // 课表抬头（导出 Word）：教师所属部门、教师、教师工号
      teacher: clip(v.teacher, 20),
      staff: clip(v.staff, 20),
      extras,
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
    flash: '',           // 上传课表的结果
    calendar: { years: {}, current: '' },   // 校历（各学年）
    schoolTerm: null,    // 校历正在看的学期
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
  // 其他课程当作一个“班级”排进课表（id 以 x: 开头，课程名称取它自己的）
  const extraClasses = () => state.settings.extras.map((e) => ({ id: `x:${e.id}`, extra: e, course: '', name: e.klass || e.title, schedule: e, roster: [] }));
  const titleOf = (klass) => (klass.extra ? klass.extra.title : courseOf(klass.course).title);
  const tagOf = (klass) => (klass.extra ? klass.extra.title.slice(0, 2) : shortOf(klass.course));
  const findClass = (id) => state.classes.concat(extraClasses()).find((item) => String(item.id) === String(id));
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
    const list = state.classes.concat(extraClasses()).filter((klass) => klass.schedule && Array.isArray(klass.schedule.slots) && (klass.schedule.term || state.settings.term) === term)
      .sort((a, b) => (a.extra ? 1 : 0) - (b.extra ? 1 : 0) || String(a.course).localeCompare(String(b.course)) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
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
  // 调休上班（校历）：这天上“周几”的课，周次按被占用的那一天算（如 9/20 周日补国庆假期里 10/6 周二的课）
  function classesOn(date) {
    const work = schoolDay(ymd(date)).work;
    const source = work ? makeupSource(work) : null;
    const week = weekOf(source ? source.date : date);
    if (week < 1 || week > state.settings.weeks) return [];
    const day = work ? Number(work.as) : weekday(date);
    return sessionsOf(state.settings.term).filter((item) => item.day === day && inWeek(item.plan, item.slot, week))
      .map((item) => (work ? { ...item, makeup: work, makeupFrom: source ? ymd(source.date) : '' } : item)).sort((a, b) => a.from - b.from);
  }
  const eventsOn = (key) => state.events.filter((item) => String(item.day).slice(0, 10) === key)
    .sort((a, b) => String(a.start_time || '99').localeCompare(String(b.start_time || '99')) || Number(a.id) - Number(b.id));
  // 放假停课：日程里类别为“放假停课”的安排，或校历上的放假、寒暑假
  const holidayOn = (key) => state.events.some((item) => String(item.day).slice(0, 10) === key && item.color === 'holiday') || Boolean(schoolOff(key));
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
  // 卡片上的上课时间只在“ · ”处换行，“明理楼北203”“1—16 周”“教学班 1364”不拆开（2026-10-29，同工作台班级卡片）
  const summaryHtml = (plan) => summary(plan).split(' · ').map((part) => esc(part).replace(/ /g, '&nbsp;')).join('&nbsp;· ');   // 圆点留在上一行末尾
  function summary(plan) {
    if (!plan || !Array.isArray(plan.slots) || !plan.slots.length) return '';
    const slots = plan.slots.map((slot) => `周${WEEKDAYS[(Number(slot.day) || 1) - 1]}${periodText(Number(slot.from), Number(slot.to)).replace(/ /g, '')}`
      + `${PARITY[slot.parity] ? `（${PARITY[slot.parity]}）` : ''}${slot.room && slot.room !== plan.room ? `（${slot.room}）` : ''}`).join('、');
    return [slots, plan.room, weekRange(plan.weeks), plan.code ? `教学班 ${plan.code}` : ''].filter(Boolean).join(' · ');
  }

  // ---------------- 上课时间编辑器（新建班级表单、课表里的“修改上课时间”共用；extra＝其他课程，多填课程名称和班级） ----------------
  function editor(host, initial) {
    let value = initial ? JSON.parse(JSON.stringify(initial)) : null;
    let extra = false;
    const blankSlot = () => ({ day: 1, from: 1, to: Math.min(2, periodCount()), parity: 'all', room: '', weeks: null });
    const periodOptions = (selected) => Array.from({ length: periodCount() }, (_, i) => {
      const t = state.settings.times[i];
      return `<option value="${i + 1}"${i + 1 === selected ? ' selected' : ''}>${i + 1}${t && t.from ? `（${t.from}）` : ''}</option>`;
    }).join('');
    function render() {
      const plan = value || { term: state.settings.term, room: '', weeks: [1, Math.min(16, state.settings.weeks)], slots: [] };
      const terms = Array.from(new Set([state.settings.term, ...state.classes.map((k) => k.schedule && k.schedule.term).filter(Boolean)]));
      host.innerHTML = `<div class="pl-ed">
        <div class="pl-ed-head${extra ? ' is-extra' : ''}">
          ${extra ? `<label>课程名称<input type="text" data-ed="title" maxlength="40" placeholder="例如：金融伦理与项目实操" value="${esc(plan.title || '')}"></label>
          <label>班级<input type="text" data-ed="klass" maxlength="40" placeholder="例如：研究生 01 班" value="${esc(plan.klass || '')}"></label>` : ''}
          <label>学期<input type="text" data-ed="term" maxlength="40" list="pl-terms-${host.dataset.plEd || ''}" value="${esc(plan.term || state.settings.term)}"></label>
          <label>教室<input type="text" data-ed="room" maxlength="40" placeholder="例如：博学楼 A201" value="${esc(plan.room || '')}"></label>
          <label>周次<span class="pl-ed-weeks">第<input type="number" data-ed="w1" min="1" max="30" value="${esc((plan.weeks || [])[0] || 1)}">—<input type="number" data-ed="w2" min="1" max="30" value="${esc((plan.weeks || [])[1] || state.settings.weeks)}">周</span></label>
          <label>教学班号（选填）<input type="text" data-ed="code" maxlength="40" placeholder="如 1364" value="${esc(plan.code || '')}"></label>
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
      const code = ($('[data-ed="code"]', host).value || '').trim();
      if (code) plan.code = code;
      if (extra) {
        plan.title = ($('[data-ed="title"]', host).value || '').trim();
        plan.klass = ($('[data-ed="klass"]', host).value || '').trim();
      }
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
      set(plan, opts = {}) { value = plan ? JSON.parse(JSON.stringify(plan)) : null; extra = Boolean(opts.extra); delete host.dataset.plTouched; render(); },
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
      <button type="button" role="tab" data-pl-tab="school">校历</button>
      <button type="button" role="tab" data-pl-tab="settings">作息与学期</button>
    </div>
    <p class="pl-notice" data-pl-notice hidden></p>
    <input type="file" accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-pl-upload-input hidden>
    <input type="file" accept="image/*" multiple data-sc-input hidden>
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
  let dialogExtra = null;     // 正在编辑的其他课程（新建时 id 为空）
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
      const cal = settings.value.find((item) => item.key === 'calendar');
      if (cal) state.calendar = normalizeCalendar(cal.value);
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
    notice.textContent = [state.notice, ['timetable', 'school'].includes(state.tab) ? state.flash : ''].filter(Boolean).join(' ');
    notice.hidden = !notice.textContent;
    $('[data-pl-title]', view).textContent = { timetable: '教师课表', calendar: '日程安排', school: '校历', settings: '作息与学期' }[state.tab];
    delete $('[data-pl-title]', view).dataset.term;
    const body = $('[data-pl-body]', view);
    if (state.tab === 'timetable') renderTimetable(body);
    else if (state.tab === 'calendar') renderCalendar(body);
    else if (state.tab === 'school') renderSchool(body);
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
            title="${esc(`${titleOf(item.klass)} · ${item.klass.name}\n${periodText(item.from, item.to)} ${timeOf(item.from, item.to)}\n点击修改上课时间`)}">
            <em>${esc(tagOf(item.klass))}</em>
            <b>${esc(titleOf(item.klass))}</b>
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
          <button type="button" class="tw-secondary pl-btn" data-pl-upload title="读取教务系统导出的 Word 课表，自动识别上课时间、教室等">上传课表</button>
          <button type="button" class="tw-secondary pl-btn" data-pl-word>导出 Word</button>
          <button type="button" class="tw-secondary pl-btn" data-pl-print>打印</button>
        </div>
      </div>
      ${clash ? '<p class="pl-warn">有两个班的上课时间重叠（并排显示的格子），请核对。</p>' : ''}
      <div class="pl-tt-wrap"><div class="pl-tt" style="--days:${days};grid-template-rows:auto ${rows.join(' ')}">
        <div class="pl-tt-corner" style="grid-column:1 / span 2;grid-row:1">${week ? `第 ${week} 周` : '节次'}</div>
        ${head}${cells}${breaks}${blocks}
      </div></div>
      ${sessions.length ? '' : `<p class="pl-empty">${esc(state.term)}还没有排课。可以点上方“上传课表”导入教务系统导出的 Word 课表；也可以新建班级时填写“上课时间与教室”，或在下面给已有班级填写。</p>`}
      <h2 class="pl-h2">上课班级</h2>
      <div class="pl-classes">${classes.map((item) => `
        <article class="pl-class" style="--c:${item.c};--s:${item.s}">
          <div><em>${esc(tagOf(item.klass))}</em><b>${esc(item.klass.name)}</b><small>${esc(titleOf(item.klass))}${rosterCount(item.klass) ? ` · ${rosterCount(item.klass)} 人` : ''}${item.klass.extra ? ' · 不在本网站上课' : ''}</small></div>
          <p>${summaryHtml(item.klass.schedule)}</p>
          <p class="pl-class-times">${item.klass.schedule.slots.map((slot) => `周${WEEKDAYS[slot.day - 1]} ${timeOf(Number(slot.from), Number(slot.to))}`).filter((t) => /\d/.test(t)).join('　')}</p>
          <button type="button" class="pl-link" data-pl-edit="${esc(item.klass.id)}">${item.klass.extra ? '修改这门课' : '修改上课时间'}</button>
        </article>`).join('')}
        <button type="button" class="pl-class-add" data-pl-extra-add><b>＋ 添加其他课程</b><span>不在本网站上课的课（如研究生课），也可以排进课表和日程</span></button></div>
      ${pending.length ? `<h2 class="pl-h2">还没有填写上课时间的班级</h2>
      <div class="pl-pending">${pending.map((klass) => `<button type="button" class="pl-pend" data-pl-edit="${esc(klass.id)}"><em>${esc(shortOf(klass.course))}</em>${esc(klass.name)}<span>填写 →</span></button>`).join('')}</div>` : ''}`;
  }

  // 课表导出 Word：版式参照用户的《我的课表.docx》——A4 横向；抬头为学期和“教师所属部门、教师、教师工号”；表格为
  // 时段｜节次｜时间｜星期一至星期日，连上的几节合并成一格（课程名（教学班号）／（周次）（节次）／教室／班级）；下面附上课班级清单
  function exportWord() {
    const O = window.ClassLive && window.ClassLive.office;
    if (!O) return;
    const isCurrent = state.term === state.settings.term;
    const week = isCurrent ? state.week : 0;
    const sessions = sessionsOf(state.term).filter((item) => !week || inWeek(item.plan, item.slot, week));
    const days = 7;
    const widths = [600, 520, 1260];
    const each = Math.floor((13958 - 2380) / days);
    for (let d = 0; d < days; d += 1) widths.push(each);
    const fixed = widths.length - days;
    const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((edge) => `<w:${edge} w:val="single" w:sz="4" w:space="0" w:color="8C7B6B"/>`).join('') + '</w:tblBorders>';
    const p = (text, { bold = false, size = 18, east = '宋体', color = '', jc = 'center' } = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="252" w:lineRule="auto"/><w:jc w:val="${jc}"/></w:pPr>${O.runs(text, { bold, size, east, color })}</w:p>`;
    const cell = (w, content, { fill = '', merge = '', span = 1 } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${merge ? `<w:vMerge${merge === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${content || p('')}</w:tc>`;
    const HEAD = { bold: true, east: '黑体', size: 20 };
    const head = `<w:tr><w:trPr><w:tblHeader/><w:trHeight w:val="480"/></w:trPr>${cell(widths[0] + widths[1], p('节次', HEAD), { fill: 'E4EFEB', span: 2 })}${cell(widths[2], p('时间', HEAD), { fill: 'E4EFEB' })}`
      + Array.from({ length: days }, (_, i) => {
        const date = week ? addDays(parseDay(state.settings.start), (week - 1) * 7 + i) : null;
        return cell(widths[fixed + i], p(`星期${WEEKDAYS[i]}`, HEAD) + (date ? p(`${date.getMonth() + 1}月${date.getDate()}日`, { size: 16 }) : ''), { fill: 'E4EFEB' });
      }).join('') + '</w:tr>';
    const groupsByDay = Array.from({ length: days }, (_, d) => clusters(sessions.filter((item) => item.day === d + 1)));
    let body = '';
    for (let q = 1; q <= periodCount(); q += 1) {
      const k = sectionOf(q);
      const first = state.settings.sections.slice(0, k).reduce((a, b) => a + b, 0) + 1;
      const t = state.settings.times[q - 1];
      let row = `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="540"/></w:trPr>`
        + cell(widths[0], q === first ? p(SECTIONS[k], HEAD) : '', { fill: 'F4EDE3', merge: q === first ? 'restart' : 'continue' })
        + cell(widths[1], p(String(q), { bold: true, size: 20 }))
        + cell(widths[2], t.from ? p(`${t.from}—${t.to}`, { size: 18 }) : '');
      groupsByDay.forEach((groups, d) => {
        const group = groups.find((g) => q >= g.from && q <= g.to);
        const w = widths[fixed + d];
        if (!group) { row += cell(w, ''); return; }
        const fill = group.items[0].s.slice(1).toUpperCase();
        if (q !== group.from) { row += cell(w, '', { merge: 'continue', fill }); return; }
        const content = group.items.map((item) => {
          const code = item.plan.code ? `（${item.plan.code}）` : '';
          return p(`${titleOf(item.klass)}${code}`, { bold: true, size: 18, color: item.c.slice(1).toUpperCase() })
            + p(`（${weekRange(slotWeeks(item.plan, item.slot)).replace(/ /g, '')}${PARITY[item.slot.parity] ? `·${PARITY[item.slot.parity]}` : ''}）（${item.from}-${item.to}节）`, { size: 16 })
            + (item.room ? p(item.room, { size: 16 }) : '')
            + p(`${item.klass.name}${rosterCount(item.klass) ? `（${rosterCount(item.klass)}人）` : ''}`, { size: 16, color: '6D6259' });
        }).join(p(''));
        row += cell(w, content, { merge: group.to > group.from ? 'restart' : '', fill });
      });
      body += row + '</w:tr>';
    }
    const grid = `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/>${border}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="50" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tblCellMar></w:tblPr>`
      + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`;
    const classes = Array.from(new Map(sessionsOf(state.term).map((item) => [String(item.klass.id), item.klass])).values());
    const list = O.table([['课程', '教学班号', '班级', '人数', '上课时间', '教室', '周次']].concat(classes.map((klass) => [
      titleOf(klass), klass.schedule.code || '', klass.name, rosterCount(klass) ? String(rosterCount(klass)) : '',
      klass.schedule.slots.map((slot) => `周${WEEKDAYS[slot.day - 1]}${periodText(Number(slot.from), Number(slot.to)).replace(/ /g, '')}${PARITY[slot.parity] ? `（${PARITY[slot.parity]}）` : ''} ${timeOf(Number(slot.from), Number(slot.to))}`).join('\n'),
      Array.from(new Set([klass.schedule.room, ...klass.schedule.slots.map((slot) => slot.room)].filter(Boolean))).join('、'),
      weekRange(klass.schedule.weeks)])), [2500, 1300, 2300, 800, 3400, 2300, 1300]);
    const s = state.settings;
    const now = new Date();
    const title = O.para(`教师课表（${state.term}${week ? ` · 第 ${week} 周` : ''}）`, 'title');
    const info = s.dept || s.teacher || s.staff ? O.para(`教师所属部门：${s.dept}　　教师：${s.teacher}　　教师工号：${s.staff}`, 'subtitle') : '';
    const note = O.para(`本课表按教师工作台填写的上课时间生成，仅供参考，准确信息以学校教务系统为准。打印日期：${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`, 'note');
    const blob = O.docx(title + info + note + grid + O.para('上课班级', 'h', { pageBreak: true }) + list, { landscape: true });
    O.save(blob, `教师课表_${state.term.replace(/\s+/g, '')}${week ? `_第${week}周` : ''}.docx`);
  }

  // ---------------- 上传课表（2026-10-28 用户：“课表里面再增加一个上传课表的功能，上传后自动识别上课时间地点等”）----------------
  // 读教务系统导出的 Word 课表（.docx，如用户的《我的课表.docx》，本页导出的 Word 也能读回）：在浏览器里解压、读表格，
  // 认出学期、各节时间、课表抬头和每门课（课程名、教学班号、星期、节次、周次、单双周、教室、班级），预览后再导入。
  const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  // docx 是 zip：从中央目录找到 word/document.xml，存储或 deflate 两种都能读
  async function unzipText(buffer, name) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) { if (view.getUint32(i, true) === 0x06054b50) { end = i; break; } }
    if (end < 0) throw new Error('not-zip');
    const decoder = new TextDecoder();
    let at = view.getUint32(end + 16, true);
    for (let k = view.getUint16(end + 10, true); k > 0; k -= 1) {
      if (view.getUint32(at, true) !== 0x02014b50) break;
      const method = view.getUint16(at + 10, true);
      const size = view.getUint32(at + 20, true);
      const nameLen = view.getUint16(at + 28, true);
      const local = view.getUint32(at + 42, true);
      if (decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen)) === name) {
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        const data = bytes.subarray(start, start + size);
        if (method === 0) return decoder.decode(data);
        if (method === 8) return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
        throw new Error('zip-method');
      }
      at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return null;
  }
  const wKids = (el, name) => (el ? Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.localName === name) : []);
  const wKid = (el, name) => wKids(el, name)[0] || null;
  const wVal = (el) => (el ? el.getAttributeNS(WNS, 'val') || el.getAttribute('w:val') : null);
  function wText(node) {
    let out = '';
    node.childNodes.forEach((n) => {
      if (n.nodeType !== 1 || n.localName === 'tbl') return;
      if (n.localName === 't') out += n.textContent;
      else if (n.localName === 'tab') out += '  ';
      else if (n.localName === 'br' || n.localName === 'cr') out += '\n';
      else out += wText(n);
    });
    return out;
  }
  const wLines = (tc) => wKids(tc, 'p').flatMap((p) => wText(p).split('\n')).map((line) => line.replace(/ /g, ' ').trim()).filter(Boolean);
  // 表格还原成网格：横向合并按列数占位，纵向合并从“restart”往下数“continue”的行数
  function wGrid(tbl) {
    const rows = wKids(tbl, 'tr').map((tr) => {
      let col = Number(wVal(wKid(wKid(tr, 'trPr'), 'gridBefore'))) || 0;
      return wKids(tr, 'tc').map((tc) => {
        const pr = wKid(tc, 'tcPr');
        const span = Number(wVal(wKid(pr, 'gridSpan'))) || 1;
        const vm = wKid(pr, 'vMerge');
        const cell = { col, span, merge: vm ? (wVal(vm) === 'restart' ? 'restart' : 'continue') : '', lines: wLines(tc), rows: 1 };
        col += span;
        return cell;
      });
    });
    rows.forEach((row, r) => row.forEach((cell) => {
      if (cell.merge === 'continue') return;
      for (let k = r + 1; k < rows.length; k += 1) {
        const below = rows[k].find((c) => c.col === cell.col);
        if (below && below.merge === 'continue') cell.rows += 1; else break;
      }
    }));
    return rows;
  }
  const DAY_RE = /(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/;
  const TIME_RE = /(\d{1,2})[:：](\d{2})\s*[-~～—–至]+\s*(\d{1,2})[:：](\d{2})/;
  const PERIOD_RE = /^第?\s*(\d{1,2})\s*(?:[-~～—–、,，至]\s*(\d{1,2}))?\s*节?$/;
  const LEVEL_RE = /^(本|本科|专|专科|高职|研|研究生|硕士|博士|成教|继教)$/;
  const INFO_RE = /[（(][^（）()]*\d[^（）()]*周[^（）()]*[)）]/;
  const ROOM_RE = /校区|楼|室|馆|厅|中心|实验|机房|[A-Za-z]\d{2,}/;
  const hm = (h, m) => `${pad(Number(h))}:${m}`;
  const dayNo = (ch) => ('一二三四五六日'.indexOf(ch) + 1) || ('1234567'.indexOf(ch) + 1) || 7;
  // 一个格子里的一门课：层次行（本／研究生）、课程名（教学班号）、信息行（周次）（节次）教室 班级，信息行后面可能还有教室、班级
  function parseBlock(lines, day, from, to) {
    const i = lines.findIndex((line) => INFO_RE.test(line));
    if (i < 0) return null;
    const info = lines[i];
    const weeksText = INFO_RE.exec(info)[0];
    const infoAt = info.indexOf(weeksText);
    const level = lines.slice(0, i).find((line) => LEVEL_RE.test(line)) || '';
    let head = lines.slice(0, i).filter((line) => !LEVEL_RE.test(line)).join(' ').trim();
    const sameLine = info.slice(0, infoAt).trim();
    if (!head) head = sameLine;
    const cm = /^(.*?)\s*[（(]\s*([^（）()]{1,60}?)\s*[)）]\s*$/.exec(head);
    const title = (cm && cm[1].trim() ? cm[1] : head).replace(/^[\s·•/]+|[\s·•/]+$/g, '').trim();
    if (!title) return null;
    const code = cm && cm[1].trim() ? cm[2].trim() : '';
    const ranges = Array.from(weeksText.matchAll(/(\d{1,2})\s*(?:[-~～—–至]\s*(\d{1,2}))?/g)).map((m) => [Number(m[1]), Number(m[2] || m[1])]).filter(([a, b]) => a >= 1 && b >= a && b <= 30);
    const parity = /单/.test(weeksText) ? 'odd' : /双/.test(weeksText) ? 'even' : '';
    const pm = /[（(]?\s*第?\s*(\d{1,2})\s*(?:[-~～—–至,、，]\s*(\d{1,2}))?\s*节\s*[)）]?/.exec(info.replace(weeksText, ''));
    if (pm) { from = Number(pm[1]); to = Number(pm[2] || pm[1]); }
    let rest = info.replace(sameLine, '').replace(weeksText, '');
    if (pm) rest = rest.replace(pm[0], '');
    const parts = rest.split(/\s{2,}|　+/).map((part) => part.trim()).filter(Boolean);
    const after = lines.slice(i + 1);
    const strip = (text) => String(text || '').replace(/[（(]\s*\d+\s*人\s*[)）]\s*$/, '').trim();
    let room = parts[0] || '';
    let klass = '';
    if (!room && after.length && ROOM_RE.test(after[0]) && !/^\d+$/.test(strip(after[0]))) room = after.shift();
    if (after.length) klass = after[after.length - 1];
    else if (parts.length > 1) klass = parts[parts.length - 1];
    else if (parts.length === 1) {
      const tokens = parts[0].split(/\s+/);
      if (tokens.length > 1 && /^\d{3,}[A-Za-z]?班?$/.test(tokens[tokens.length - 1])) { klass = tokens.pop(); room = tokens.join(' '); }
    }
    return { level, title: title.slice(0, 40), code: code.slice(0, 40), klass: strip(klass).slice(0, 40), room: room.slice(0, 40),
      ranges: ranges.length ? ranges : [[1, state.settings.weeks]], parity, day, from, to };
  }
  // 一个格子可能有几门课（不同周次轮换）：第二个起的信息行，从它前面的课程名（及层次行）开始新的一块
  function parseCell(lines, day, from, to) {
    const infos = lines.map((line, i) => (INFO_RE.test(line) ? i : -1)).filter((i) => i >= 0);
    const starts = [0];
    infos.slice(1).forEach((i) => {
      let s = i - 1;
      if (s > 0 && LEVEL_RE.test(lines[s - 1])) s -= 1;
      if (s > starts[starts.length - 1]) starts.push(s);
    });
    return starts.map((s, k) => parseBlock(lines.slice(s, starts[k + 1] === undefined ? lines.length : starts[k + 1]), day, from, to)).filter(Boolean);
  }
  async function readTimetable(file) {
    const xml = await unzipText(await file.arrayBuffer(), 'word/document.xml');
    if (!xml) throw new Error('not-docx');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagNameNS(WNS, 'body')[0];
    const paras = wKids(body, 'p').map((p) => wText(p).trim()).filter(Boolean).join('\n');
    let grid = null;
    let header = -1;
    let dayCols = {};
    for (const tbl of Array.from(doc.getElementsByTagNameNS(WNS, 'tbl'))) {
      const rows = wGrid(tbl);
      for (let r = 0; r < Math.min(rows.length, 4) && !grid; r += 1) {
        const days = {};
        rows[r].forEach((cell) => { const m = DAY_RE.exec(cell.lines.join('')); if (m) days[cell.col] = dayNo(m[1]); });
        if (Object.keys(days).length >= 5) { grid = rows; header = r; dayCols = days; }
      }
      if (grid) break;
    }
    if (!grid) return null;
    const firstDay = Math.min(...Object.keys(dayCols).map(Number));
    // 每一行是第几节、几点到几点、属于上午／下午／晚上（左边几列，纵向合并的时段名只写在第一行）
    const rowInfo = [];
    const sectionRows = {};
    let last = 0;
    for (let r = header + 1; r < grid.length; r += 1) {
      const info = { from: 0, to: 0, time: null, section: sectionRows[r] || '' };
      grid[r].filter((cell) => cell.col < firstDay && cell.merge !== 'continue').forEach((cell) => {
        cell.lines.forEach((line) => {
          const sec = /上午|中午|下午|晚上|夜间|晚间/.exec(line);
          if (sec) { for (let k = 0; k < cell.rows; k += 1) sectionRows[r + k] = sec[0]; info.section = sec[0]; }
          const t = TIME_RE.exec(line);
          if (t) info.time = { from: hm(t[1], t[2]), to: hm(t[3], t[4]) };
          const p = PERIOD_RE.exec(line.replace(TIME_RE, '').trim());
          if (p && !info.from) { info.from = Number(p[1]); info.to = Number(p[2] || p[1]); }
        });
      });
      if (!info.from && (info.time || grid[r].some((cell) => cell.col >= firstDay))) { info.from = last + 1; info.to = last + 1; }
      if (info.from) last = info.to;
      rowInfo[r] = info;
    }
    const records = [];
    for (let r = header + 1; r < grid.length; r += 1) {
      grid[r].forEach((cell) => {
        if (!(cell.col in dayCols) || cell.merge === 'continue' || !cell.lines.length) return;
        const top = rowInfo[r] || {};
        const bottom = rowInfo[Math.min(grid.length - 1, r + cell.rows - 1)] || top;
        records.push(...parseCell(cell.lines, dayCols[cell.col], top.from || 1, bottom.to || top.to || 1));
      });
    }
    // 作息：每行一节且有时间时，按时段数节数
    const periods = rowInfo.filter((info) => info && info.from && info.from === info.to);
    const times = [];
    periods.forEach((info) => { if (info.time) times[info.from - 1] = info.time; });
    const complete = times.length > 0 && times.length === periods.length && Array.from({ length: times.length }, (_, i) => times[i]).every(Boolean);
    const bucket = (info) => (/下午|中午/.test(info.section) ? 1 : /晚/.test(info.section) ? 2 : /上午/.test(info.section) ? 0
      : (info.time && info.time.from < '12:00' ? 0 : info.time && info.time.from < '17:30' ? 1 : 2));
    const sections = [0, 0, 0];
    periods.forEach((info) => { sections[bucket(info)] += 1; });
    const termMatch = /(\d{4})\s*[-—–]\s*(\d{4})\s*学年\s*第?\s*([一二12])\s*学期/.exec(paras) || /(\d{4})\s*[-—–]\s*(\d{4})\s*[-—–]\s*([12])/.exec(paras);
    // 抬头各项可能空着（如“教师：    教师工号”），取到的是下一项的名称时当作没填
    const field = (re) => { const m = re.exec(paras); return m && !/教师|工号|部门|职称|姓名/.test(m[1]) ? m[1].trim() : ''; };
    return {
      term: termMatch ? `${termMatch[1]}—${termMatch[2]} 学年第${/[1一]/.test(termMatch[3]) ? '一' : '二'}学期` : '',
      dept: field(/所属部门[：:][ \t　]*([^\s：:]+)/), teacher: field(/(?:^|\s)教师[：:][ \t　]*([^\s：:]+)/), staff: field(/工号[：:][ \t　]*([^\s：:]+)/),
      times: complete ? times.map((t) => ({ ...t })) : null,
      sections: complete ? sections : null,
      courses: groupCourses(records),
    };
  }
  // 同一门课同一个班的几段合成一份上课安排（连着的几节并成一段，教室、周次取最常见的，不同的写在这一段上）
  function groupCourses(records) {
    const map = new Map();
    records.forEach((rec) => {
      const key = [rec.title, rec.code, rec.klass].join('|');
      if (!map.has(key)) map.set(key, { title: rec.title, code: rec.code, klass: rec.klass, level: rec.level, items: [] });
      rec.ranges.forEach((weeks) => map.get(key).items.push({ day: rec.day, from: rec.from, to: rec.to, parity: rec.parity, room: rec.room, weeks }));
    });
    const most = (list) => { const count = new Map(); list.filter(Boolean).forEach((x) => count.set(x, (count.get(x) || 0) + 1)); return Array.from(count).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; };
    return Array.from(map.values()).map((g) => {
      const items = g.items.sort((a, b) => a.day - b.day || a.from - b.from);
      const merged = [];
      items.forEach((item) => {
        const prev = merged[merged.length - 1];
        const same = prev && prev.day === item.day && prev.parity === item.parity && prev.room === item.room && prev.weeks.join() === item.weeks.join();
        if (same && item.from <= prev.to + 1) prev.to = Math.max(prev.to, item.to); else merged.push({ ...item });
      });
      const room = most(merged.map((item) => item.room));
      const weeks = [Math.min(...merged.map((item) => item.weeks[0])), Math.max(...merged.map((item) => item.weeks[1]))];
      const slots = merged.slice(0, 14).map((item) => {
        const slot = { day: item.day, from: Math.max(1, Math.min(16, item.from)), to: Math.max(1, Math.min(16, item.to)) };
        if (slot.to < slot.from) slot.to = slot.from;
        if (item.parity) slot.parity = item.parity;
        if (item.room && item.room !== room) slot.room = item.room;
        if (item.weeks[0] !== weeks[0] || item.weeks[1] !== weeks[1]) slot.weeks = item.weeks;
        return slot;
      });
      return { ...g, plan: { room, weeks, slots, ...(g.code ? { code: g.code } : {}) } };
    });
  }
  // 课程对应到本网站的课程和班级：课程名相同（或互相包含）；班级先按教学班号，再按班级名
  const normName = (text) => String(text || '').replace(/[\s《》“”"'（）()·・\-—]/g, '').toLowerCase();
  function matchCourse(g) {
    const t = normName(g.title);
    const course = state.courses.find((c) => normName(c.title) === t)
      || state.courses.find((c) => t.length >= 4 && (normName(c.title).includes(t) || t.includes(normName(c.title))));
    if (!course) return { course: null, target: 'extra' };
    const classes = state.classes.filter((c) => c.course === course.slug);
    const k = normName(g.klass);
    const hit = (g.code && classes.find((c) => c.schedule && c.schedule.code === g.code))
      || (k && classes.find((c) => normName(c.name) === k))
      || (k.length >= 3 && classes.find((c) => { const n = normName(c.name); return n.length >= 3 && (n.includes(k) || k.includes(n)); }));
    return { course, target: hit ? `class:${hit.id}` : 'new' };
  }

  const importer = document.createElement('dialog');
  importer.className = 'tw-dialog pl-dialog pl-import';
  document.body.appendChild(importer);
  let imported = null;
  function showImport(result, fileName) {
    imported = result;
    result.courses.forEach((g) => Object.assign(g, matchCourse(g)));
    const s = state.settings;
    const sameTimes = result.times && result.times.length === s.times.length && result.times.every((t, i) => t.from === s.times[i].from && t.to === s.times[i].to);
    const header = [result.dept && `部门 ${result.dept}`, result.teacher && `教师 ${result.teacher}`, result.staff && `工号 ${result.staff}`].filter(Boolean).join('，');
    const slotText = (plan) => plan.slots.map((slot) => `周${WEEKDAYS[slot.day - 1]} ${slot.from}-${slot.to} 节${slot.parity ? `（${PARITY[slot.parity]}）` : ''}${slot.weeks ? `（${weekRange(slot.weeks)}）` : ''}`).join('、');
    const options = (g) => {
      const list = [];
      if (g.course) {
        state.classes.filter((c) => c.course === g.course.slug).forEach((c) => list.push([`class:${c.id}`, `导入到班级“${c.name}”${c.schedule ? '（替换原有）' : ''}`]));
        list.push(['new', `新建班级“${g.klass || g.title}”并导入`]);
      }
      list.push(['extra', '作为其他课程（不在本网站上课）'], ['skip', '不导入']);
      return list.map(([value, label]) => `<option value="${esc(value)}"${value === g.target ? ' selected' : ''}>${esc(label)}</option>`).join('');
    };
    importer.innerHTML = `<form method="dialog" data-pl-import-form>
      <h2>上传课表 · 识别结果</h2>
      <p class="tw-hint">${esc(fileName)}：识别到 ${result.courses.length} 门课。请核对后点“导入”；每门课可以选导入到哪个班级。</p>
      <div class="pl-import-opts">
        ${result.term ? `<label class="tw-check"><input type="checkbox" name="term"${result.term !== s.term ? ' checked' : ' disabled'}><span>学期：${esc(result.term)}${result.term === s.term ? '（与现在相同）' : `（现在是“${esc(s.term)}”，勾选则改为它）`}</span></label>` : ''}
        ${result.times ? `<label class="tw-check"><input type="checkbox" name="times"${sameTimes ? ' disabled' : ' checked'}><span>作息时间：${result.times.length} 节（上午 ${result.sections[0]}、下午 ${result.sections[1]}、晚上 ${result.sections[2]}；第 1 节 ${esc(result.times[0].from)}—${esc(result.times[0].to)}）${sameTimes ? '，与现在相同' : '，勾选则按课表更新'}</span></label>` : '<p class="tw-hint">没有认出各节时间，作息保持不变。</p>'}
        ${header ? `<label class="tw-check"><input type="checkbox" name="header" checked><span>课表抬头：${esc(header)}</span></label>` : ''}
      </div>
      <div class="pl-import-list">${result.courses.map((g, i) => `
        <div class="pl-import-row">
          <div><b>${esc(g.title)}</b>${g.code ? `<small class="is-code">教学班号 ${esc(g.code)}</small>` : ''}${g.level ? `<small>${esc(g.level)}</small>` : ''}
            <p>${esc([g.klass && `班级 ${g.klass}`, slotText(g.plan), g.plan.room, weekRange(g.plan.weeks)].filter(Boolean).join(' · '))}</p></div>
          <select data-import-target="${i}" aria-label="导入到">${options(g)}</select>
        </div>`).join('') || '<p class="pl-empty">没有认出任何课程。请确认上传的是教务系统导出的课表（表格里有“星期一……星期日”，格子里写着周次和节次）。</p>'}</div>
      <p class="tw-error" data-import-error role="alert"></p>
      <div class="tw-actions">
        <button type="submit" class="tw-primary"${result.courses.length || result.times ? '' : ' disabled'}>导入</button>
        <button type="button" class="tw-secondary" data-import-cancel>取消</button>
      </div>
    </form>`;
    importer.showModal();
  }
  async function runImport(form) {
    const result = imported;
    const error = $('[data-import-error]', importer);
    const flag = (name) => Boolean(form.elements[name] && form.elements[name].checked && !form.elements[name].disabled);
    const next = { ...state.settings, extras: state.settings.extras.slice() };
    if (flag('term')) next.term = result.term;
    if (flag('times')) { next.sections = result.sections; next.times = result.times; }
    if (flag('header')) ['dept', 'teacher', 'staff'].forEach((key) => { if (result[key]) next[key] = result[key]; });
    const term = result.term || next.term;
    const done = [];
    const failed = [];
    $('button[type="submit"]', importer).disabled = true;
    for (const [i, g] of result.courses.entries()) {
      const target = $(`[data-import-target="${i}"]`, importer).value;
      const plan = { term, ...g.plan };
      try {
        if (target.startsWith('class:')) {
          await state.backend.rpc('ck_set_class_schedule', { p_class: Number(target.slice(6)) || target.slice(6), p_schedule: plan });
          done.push(`${g.title}（${findClass(target.slice(6)).name}）`);
        } else if (target === 'new') {
          const name = (g.klass || g.title).slice(0, 40);
          let row = null;
          try {
            const created = await state.backend.rpc('ck_create_class', { p_course: g.course.slug, p_name: name });
            row = Array.isArray(created) ? created[0] : created;
          } catch (problem) {
            if (!window.ClassLive.isDuplicateError(problem)) throw problem;
            row = (await state.backend.fetchAll('classes', { course: g.course.slug })).find((c) => c.name === name);
          }
          await state.backend.rpc('ck_set_class_schedule', { p_class: Number(row.id) || row.id, p_schedule: plan });
          done.push(`${g.title}（新建班级“${name}”）`);
        } else if (target === 'extra') {
          const klass = [g.level && !/^本/.test(g.level) ? g.level : '', g.klass].filter(Boolean).join(' · ');
          const old = next.extras.find((e) => e.title === g.title && (e.klass === klass || e.klass === g.klass));
          next.extras = next.extras.filter((e) => e !== old).concat({ ...plan, id: old ? old.id : `x${Date.now().toString(36)}${i}`, title: g.title, klass });
          done.push(`${g.title}（其他课程）`);
        }
      } catch (problem) {
        console.error(problem);
        failed.push(`${g.title}：${missingError(problem) ? '后台还没有课表功能' : problem.message || problem}`);
      }
    }
    try {
      const settings = normalize(next);
      if (JSON.stringify(settings) !== JSON.stringify(state.settings)) {
        await state.backend.rpc('ck_save_teacher_setting', { p_key: 'planner', p_value: settings });
        state.settings = settings;
        state.term = settings.term;
        state.week = null;
      }
    } catch (problem) {
      console.error(problem);
      failed.push(`课表设置：${missingError(problem) ? '后台还没有课表功能' : problem.message || problem}`);
    }
    if (!done.length && failed.length) {
      error.textContent = `没有导入：${failed.join('；')}`;
      $('button[type="submit"]', importer).disabled = false;
      return;
    }
    importer.close();
    state.flash = `已导入 ${done.length} 门课：${done.join('、')}。${failed.length ? `没有导入：${failed.join('；')}。` : ''}请在下面核对，有出入的点“修改上课时间”。`;
    await load();
    render();
  }
  async function handleUpload(file) {
    state.flash = '';
    if (!file) return;
    if (!/\.docx$/i.test(file.name)) {
      state.flash = /\.doc$/i.test(file.name) ? '这是旧版 Word（.doc）：请用 Word 打开后“另存为”.docx 再上传。' : '目前只认 Word（.docx）格式的课表：可以在教务系统里导出 Word，或把课表复制到 Word 里另存为 .docx。';
      render();
      return;
    }
    try {
      const result = await readTimetable(file);
      if (!result) { state.flash = `“${file.name}”里没有找到课表表格（表头要有“星期一……星期日”）。`; render(); return; }
      showImport(result, file.name);
    } catch (problem) {
      console.error(problem);
      state.flash = `读取“${file.name}”失败：文件可能已损坏，或不是 Word 文档。`;
      render();
    }
  }
  importer.addEventListener('submit', (event) => { event.preventDefault(); runImport(event.target); });
  importer.addEventListener('click', (event) => { if (event.target.closest('[data-import-cancel]')) importer.close(); });

  // ---------------- 校历（2026-10-28 用户：“在教师控制台再增加一个查看校历的功能，可以上传每年的校历，在网站中生成，并且自动识别周次和节假日，
  // 用不同颜色标注不同课程上课的周次，并识别哪周因为节假日是不需要上课的”）----------------
  // 每学年一份：学期（名称、表上第一行的周一、第一行是第零周还是第一周、行数）、节假日（off 放假停课、break 寒暑假、event 活动不停课）、
  // 调休上班（这天上“周几”的课）、说明。存在工作台设置 calendar 里；还没保存过时用下面按用户提供的校历图片录入的 2026—2027 学年。
  const PRESET_CALENDARS = {
    '2026-2027': {
      year: '2026-2027', school: '华东政法大学', preset: true,
      terms: [
        { name: '秋季学期', start: '2026-08-31', first: 0, weeks: 21 },
        { name: '春季学期', start: '2027-02-22', first: 1, weeks: 18 },
        { name: '夏季学期', start: '2027-06-28', first: 1, weeks: 4 },
      ],
      holidays: [
        { name: '中秋节', from: '2026-09-25', to: '2026-09-27', type: 'off' },
        { name: '国庆节', from: '2026-10-01', to: '2026-10-07', type: 'off' },
        { name: '校运动会', from: '2026-11-06', to: '2026-11-07', type: 'event' },
        { name: '元旦', from: '2027-01-01', to: '2027-01-01', type: 'off' },
        { name: '寒假', from: '2027-01-11', to: '2027-02-19', type: 'break' },
        { name: '清明节', from: '2027-04-05', to: '2027-04-05', type: 'off' },
        { name: '劳动节', from: '2027-05-01', to: '2027-05-01', type: 'off' },
        { name: '端午节', from: '2027-06-09', to: '2027-06-09', type: 'off' },
      ],
      workdays: [{ date: '2026-09-20', as: 2 }, { date: '2026-10-10', as: 3 }],
      notes: [
        '本科生（2023 级、2025 级及 2024 级法学〔含知识产权〕以外专业）：2026 年 9 月 6 日（周日）注册，9 月 7 日（周一）上课；2024 级法学（含知识产权）专业 8 月 31 日（周一）上课；2026 级新生 9 月 5 日（周六）报到，9 月 21 日（周一）上课。',
        '研究生：2024、2025 级 9 月 6 日（周日）注册，9 月 7 日（周一）上课；2026 级新生 9 月 16 日（周三）报到。',
        '中秋节：9 月 25 日（周五）至 27 日（周日）放假，不调休。国庆节：10 月 1 日（周四）至 7 日（周三）放假调休；9 月 20 日（周日）上班，补周二课程；10 月 10 日（周六）上班，补周三课程。',
        '第零至十八周（2026 年 8 月 31 日至 2027 年 1 月 10 日）上课和考试；第十九、二十周开展各项教学实践活动。',
        '中华传统体育大会暨松江校区田径运动会：11 月 6 日（周五）、7 日（周六）。',
        '寒假：2027 年 1 月 11 日至 2 月 19 日（2 月 6 日农历春节）。',
        '春季学期：2027 年 2 月 21 日（周日）注册，2 月 22 日（周一）上课，至 6 月 27 日止（含考试）。夏季学期：原则上 6 月 28 日至 7 月 25 日。',
      ],
    },
  };
  const HOLIDAY_TYPES = { off: '放假（停课）', break: '寒暑假', event: '活动（不停课）' };
  const CN_NUM = '零一二三四五六七八九十';
  const cnNum = (n) => (n <= 10 ? CN_NUM[n] : n < 20 ? `十${n % 10 ? CN_NUM[n % 10] : ''}` : `${CN_NUM[Math.floor(n / 10)]}十${n % 10 ? CN_NUM[n % 10] : ''}`);
  const calYears = () => Object.values(state.calendar.years || {});
  const rankType = { off: 3, break: 2, event: 1 };
  // 某一天在校历上是什么日子：节假日（同一天有几项时取停课的那项）、调休上班（这天上“周几”的课）
  function schoolDay(key) {
    let holiday = null;
    let work = null;
    calYears().forEach((y) => {
      (y.holidays || []).forEach((h) => { if (key >= h.from && key <= h.to && (!holiday || rankType[h.type] > rankType[holiday.type])) holiday = h; });
      (y.workdays || []).forEach((w) => { if (w.date === key) work = w; });
    });
    return { holiday, work };
  }
  const schoolOff = (key) => { const h = schoolDay(key).holiday; return h && h.type !== 'event' ? h : null; };
  // 调休上班那天补的是哪一天的课：同一次放假里星期相同的那一天（如 9/20 补周二＝国庆假期里的 10/6）
  function makeupSource(work) {
    const at = parseDay(work.date);
    let best = null;
    calYears().forEach((y) => (y.holidays || []).filter((h) => h.type === 'off').forEach((h) => {
      for (let d = parseDay(h.from); d && d <= parseDay(h.to); d = addDays(d, 1)) {
        const gap = Math.abs(dayDiff(d, at));
        if (weekday(d) === Number(work.as) && gap <= 31 && (!best || gap < best.gap)) best = { date: d, gap, holiday: h };
      }
    }));
    return best;
  }
  // 放假那天的课调到了哪一天（没有调就是停课）
  function movedTo(key) {
    let hit = null;
    calYears().forEach((y) => (y.workdays || []).forEach((w) => { const src = makeupSource(w); if (src && ymd(src.date) === key) hit = w; }));
    return hit;
  }
  function normalizeCalendar(value) {
    const v = value && typeof value === 'object' ? value : {};
    const years = {};
    Object.values(v.years || {}).forEach((y) => { if (y && /^\d{4}-\d{4}$/.test(String(y.year))) years[y.year] = y; });
    Object.entries(PRESET_CALENDARS).forEach(([key, y]) => { if (!years[key]) years[key] = JSON.parse(JSON.stringify(y)); });
    const current = years[v.current] ? v.current : Object.keys(years).sort().reverse().find((key) => {
      const y = years[key];
      return (y.terms || []).some((t) => parseDay(t.start) <= today() && addDays(parseDay(t.start), t.weeks * 7) > today());
    }) || Object.keys(years).sort().pop();
    return { years, current };
  }
  // 学期的日期范围、表上每一行
  const termRange = (t) => [parseDay(t.start), addDays(parseDay(t.start), t.weeks * 7 - 1)];
  // 课表的学期（作息与学期里设的第 1 周）落在校历的哪个学期
  const plannerTermOf = (y) => (y.terms || []).findIndex((t) => { const [a, b] = termRange(t); const s = parseDay(state.settings.start); return s >= a && s <= b; });
  // 校历学期 → 课表学期名称、第 1 周周一、周数
  function plannerFromTerm(y, t) {
    const [y1, y2] = String(y.year).split('-');
    const term = /秋/.test(t.name) ? `${y1}—${y2} 学年第一学期` : /春/.test(t.name) ? `${y1}—${y2} 学年第二学期` : `${y1}—${y2} 学年${t.name}`;
    return { term, start: ymd(addDays(parseDay(t.start), (1 - Number(t.first || 0)) * 7)), weeks: Math.max(1, t.weeks - (Number(t.first) === 0 ? 1 : 0)) };
  }

  function renderSchool(body) {
    const cal = state.calendar;
    const years = Object.keys(cal.years).sort();
    const y = cal.years[cal.current] || cal.years[years[years.length - 1]];
    if (!y) { body.innerHTML = '<p class="pl-empty">还没有校历。点“上传校历”读入学校的校历图片。</p>'; return; }
    const terms = y.terms || [];
    if (state.schoolTerm === null || !terms[state.schoolTerm]) {
      const now = today();
      const hit = terms.findIndex((t) => { const [a, b] = termRange(t); return now >= a && now <= b; });
      state.schoolTerm = hit >= 0 ? hit : Math.max(0, plannerTermOf(y));
    }
    const t = terms[state.schoolTerm];
    const linked = state.schoolTerm === plannerTermOf(y);   // 这一学期就是课表里的学期：标出各班上课
    const todayKey = ymd(today());
    const nowWeek = (() => { if (!t) return null; const d = dayDiff(today(), parseDay(t.start)); return d >= 0 && d < t.weeks * 7 ? Math.floor(d / 7) + Number(t.first || 0) : null; })();
    $('[data-pl-sub]', view).textContent = `${y.school ? `${y.school} · ` : ''}${y.year} 学年${t ? ` · ${t.name}` : ''}${nowWeek !== null ? ` · 本周是第${cnNum(nowWeek)}周` : ''}。`
      + `${y.preset ? '按 10 月 28 日提供的校历图片录入，核对后可在“修改校历”里改。' : ''}校历上的放假和调休会自动用到“课表”和“日程”。`;
    // 各班这一学期每次课：上课、停课（放假）、调课（放假那天的课调到调休上班日）
    const classes = linked ? Array.from(new Map(sessionsOf(state.settings.term).map((item) => [String(item.klass.id), item])).values()) : [];
    const record = new Map(classes.map((item) => [String(item.klass.id), { item, on: [], off: [], moved: [], extra: [] }]));
    const cells = [];
    if (t) {
      for (let w = 0; w < t.weeks; w += 1) {
        const monday = addDays(parseDay(t.start), w * 7);
        const label = w + Number(t.first || 0);
        let row = `<div class="sc-week${label === nowWeek ? ' is-now' : ''}"><b>第${cnNum(label)}周</b><small>${md(monday)}—${md(addDays(monday, 6))}</small></div>`;
        for (let d = 0; d < 7; d += 1) {
          const date = addDays(monday, d);
          const key = ymd(date);
          const { holiday, work } = schoolDay(key);
          const off = holiday && holiday.type !== 'event';
          const moved = off ? movedTo(key) : null;
          const list = linked ? classesOn(date) : [];
          const chips = list.map((item) => {
            const rec = record.get(String(item.klass.id));
            const entry = { date: key, week: weekOf(item.makeupFrom ? parseDay(item.makeupFrom) : date), item };
            let cls = '';
            let note = '';
            if (off && !item.makeup) { if (moved) { cls = 'is-moved'; note = `调到 ${md(parseDay(moved.date))}`; } else { cls = 'is-off'; note = `${holiday.name}停课`; rec && rec.off.push({ ...entry, why: holiday.name }); } }
            else if (item.makeup) { cls = 'is-makeup'; note = `补 ${md(parseDay(item.makeupFrom || key))} 的课`; rec && rec.on.push(entry); rec && rec.extra.push(entry); }
            else rec && rec.on.push(entry);
            return `<span class="sc-cls ${cls}" style="--c:${item.c};--s:${item.s}" title="${esc(`${titleOf(item.klass)} ${item.klass.name} ${periodText(item.from, item.to)}${note ? `（${note}）` : ''}`)}">${esc(tagOf(item.klass))}${item.from}-${item.to}${cls === 'is-makeup' ? '<i>补</i>' : ''}</span>`;
          }).join('');
          const first = d === 0 && w === 0;
          const dateText = date.getDate() === 1 || first ? `${date.getMonth() + 1}/${date.getDate()}` : String(date.getDate());
          const showName = holiday && (holiday.type !== 'break' || key === holiday.from || d === 0);
          row += `<div class="sc-day${d >= 5 ? ' is-weekend' : ''}${off ? (holiday.type === 'break' ? ' is-break' : ' is-off') : ''}${holiday && holiday.type === 'event' ? ' is-event' : ''}${work ? ' is-work' : ''}${key === todayKey ? ' is-today' : ''}${key < todayKey ? ' is-past' : ''}" title="${esc(cnDate(date))}">
            <span class="sc-date">${dateText}</span>
            ${showName ? `<em class="sc-tag is-${holiday.type}">${esc(holiday.name)}</em>` : ''}
            ${work ? `<em class="sc-tag is-work">上班 · 补周${WEEKDAYS[Number(work.as) - 1]}</em>` : ''}
            ${chips ? `<span class="sc-chips">${chips}</span>` : ''}
          </div>`;
        }
        cells.push(row);
      }
    }
    // 右侧：各班上课的周次（色条：上课＝本班颜色，停课＝划斜线，补课＝金边）、停课原因
    const weeksMax = state.settings.weeks;
    const summary = classes.map((item) => {
      const rec = record.get(String(item.klass.id));
      const status = Array.from({ length: weeksMax }, (_, i) => {
        const wk = i + 1;
        const on = rec.on.some((e) => e.week === wk);
        const off = rec.off.some((e) => e.week === wk);
        const mk = rec.extra.some((e) => e.week === wk);
        return on ? (mk ? 'makeup' : 'on') : off ? 'off' : '';
      });
      const offText = rec.off.map((e) => `第 ${e.week} 周 ${md(parseDay(e.date))} ${e.why}`).join('；');
      const moveText = rec.extra.map((e) => `第 ${e.week} 周的课调到 ${md(parseDay(e.date))}`).join('；');
      return `<article class="sc-course" style="--c:${item.c};--s:${item.s}">
        <header><em>${esc(tagOf(item.klass))}</em><b>${esc(item.klass.name)}</b><small>${esc(titleOf(item.klass))}</small></header>
        <div class="sc-strip" aria-label="各周上课情况">${status.map((s, i) => `<i class="${s ? `is-${s}` : ''}" title="第 ${i + 1} 周：${{ on: '上课', makeup: '上课（调休补课）', off: '放假停课', '': '不上课' }[s]}"><span>${i + 1}</span></i>`).join('')}</div>
        <p>上课 <b>${rec.on.length}</b> 次${rec.off.length ? `，停课 <b class="is-off">${rec.off.length}</b> 次` : ''}${rec.extra.length ? `，调课 ${rec.extra.length} 次` : ''}。</p>
        ${offText ? `<p class="sc-why">停课：${esc(offText)}</p>` : ''}
        ${moveText ? `<p class="sc-why is-move">调课：${esc(moveText)}</p>` : ''}
      </article>`;
    }).join('');
    const termHolidays = t ? (y.holidays || []).filter((h) => { const [a, b] = termRange(t); return parseDay(h.to) >= a && parseDay(h.from) <= b; }) : [];
    body.innerHTML = `
      <div class="sc-bar">
        <label class="pl-term">学年<select data-sc-year>${years.map((key) => `<option${key === cal.current ? ' selected' : ''}>${esc(key)}</option>`).join('')}</select></label>
        <div class="sc-terms" role="tablist">${terms.map((term, i) => `<button type="button" class="pl-chip" data-sc-term="${i}" aria-pressed="${i === state.schoolTerm}">${esc(term.name)}</button>`).join('')}</div>
        <div class="sc-tools">
          <button type="button" class="tw-secondary pl-btn" data-sc-upload title="读入学校的校历图片（可以一次选几张），自动识别周次、节假日和调休">上传校历</button>
          <button type="button" class="tw-secondary pl-btn" data-sc-edit>修改校历</button>
          ${t && !linked ? `<button type="button" class="tw-secondary pl-btn" data-sc-link title="课表的“第几周”按这个学期算">设为课表的学期</button>` : ''}
        </div>
      </div>
      <div class="sc-progress" data-sc-progress hidden><span><i data-sc-bar></i></span><small data-sc-status></small></div>
      <div class="sc-legend">
        <span><i class="is-off"></i>放假停课</span><span><i class="is-break"></i>寒暑假</span><span><i class="is-work"></i>调休上班</span><span><i class="is-event"></i>活动（不停课）</span>
        ${classes.map((item) => `<span><i style="background:${item.c}"></i>${esc(tagOf(item.klass))} ${esc(item.klass.name)}</span>`).join('')}
      </div>
      ${t && !linked ? `<p class="pl-warn">课表里排的是“${esc(state.settings.term)}”（第 1 周 ${esc(state.settings.start)}），不是这个学期，所以这里不标各班的课。需要的话点“设为课表的学期”。</p>` : ''}
      <div class="sc-layout">
        <div class="sc-wrap"><div class="sc-grid">
          <div class="sc-head">周次</div>${WEEKDAYS.map((d, i) => `<div class="sc-head${i >= 5 ? ' is-weekend' : ''}">星期${d}</div>`).join('')}
          ${cells.join('')}
        </div></div>
        <aside class="sc-side">
          ${linked ? `<section class="sc-card"><h3>各班上课的周次</h3>${summary || '<p class="pl-quiet">课表里还没有排课。</p>'}
            <p class="sc-key"><i class="is-on"></i>上课 <i class="is-off"></i>放假停课 <i class="is-makeup"></i>调休补课</p></section>` : ''}
          <section class="sc-card"><h3>本学期的节假日</h3>${termHolidays.length ? `<ul class="sc-hols">${termHolidays.map((h) => `<li class="is-${h.type}"><b>${esc(h.name)}</b><span>${md(parseDay(h.from))}${h.to !== h.from ? `—${md(parseDay(h.to))}` : ''} · ${HOLIDAY_TYPES[h.type] || ''}</span></li>`).join('')}</ul>` : '<p class="pl-quiet">没有。</p>'}
            ${(y.workdays || []).filter((w) => t && parseDay(w.date) >= termRange(t)[0] && parseDay(w.date) <= termRange(t)[1]).map((w) => `<p class="sc-workline">${md(parseDay(w.date))}（周${WEEKDAYS[weekday(parseDay(w.date)) - 1]}）上班，补周${WEEKDAYS[Number(w.as) - 1]}课程</p>`).join('')}</section>
          ${(y.notes || []).length ? `<section class="sc-card"><h3>校历说明</h3><ul class="sc-notes">${y.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>` : ''}
        </aside>
      </div>`;
  }

  // ---------- 上传校历：在浏览器里识别（识别程序放在本站 /js/vendor/tesseract/，只在这时加载） ----------
  const SELF_VERSION = ((document.currentScript && document.currentScript.src) || '').split('?v=')[1] || '';
  const VENDOR = '/js/vendor/tesseract';
  const loadScript = (src) => new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error(`加载失败：${src}`));
    document.head.appendChild(tag);
  });
  function scProgress(ratio, text) {
    const box = $('[data-sc-progress]', view);
    if (!box) return;
    box.hidden = ratio === null;
    if (ratio !== null) { $('[data-sc-bar]', box).style.width = `${Math.round(Math.max(0.02, ratio) * 100)}%`; $('[data-sc-status]', box).textContent = text; }
  }
  async function readImage(file) {
    const bitmap = await createImageBitmap(file);
    const k = bitmap.width > 1800 ? 1800 / bitmap.width : 1;
    const width = Math.round(bitmap.width * k);
    const height = Math.round(bitmap.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    const px = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i += 1) gray[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    // 截取一块放大（clean：黑白二值化、四周留白），给识别程序用；用灰度，最近邻放大
    const crop = (x, y, w, h, scale, clean) => {
      x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
      w = Math.max(1, Math.min(width - x, Math.round(w))); h = Math.max(1, Math.min(height - y, Math.round(h)));
      const P = clean ? 12 : 0;
      const out = document.createElement('canvas');
      out.width = w * scale + 2 * P;
      out.height = h * scale + 2 * P;
      const c = out.getContext('2d', { willReadFrequently: true });
      const img = c.createImageData(out.width, out.height);
      img.data.fill(255);
      for (let yy = 0; yy < h * scale; yy += 1) {
        for (let xx = 0; xx < w * scale; xx += 1) {
          let v = gray[(y + Math.floor(yy / scale)) * width + (x + Math.floor(xx / scale))];
          if (clean) v = v < 150 ? 0 : 255;
          const o = ((yy + P) * out.width + xx + P) * 4;
          img.data[o] = v; img.data[o + 1] = v; img.data[o + 2] = v;
        }
      }
      c.putImageData(img, 0, 0);
      return out;
    };
    return { gray, width, height, crop };
  }
  async function uploadCalendar(files) {
    const images = Array.from(files || []).filter((file) => /^image\//.test(file.type) || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name));
    if (!images.length) { state.flash = '请上传校历的图片（jpg、png 等）。PDF 可以先截图再上传。'; render(); return; }
    let worker = null;
    try {
      scProgress(0.02, '加载识别程序（第一次约 6 MB，之后会快一些）……');
      if (!window.ClassLiveCalendarOCR) await loadScript(`/js/live-calendar-ocr.js${SELF_VERSION ? `?v=${SELF_VERSION}` : ''}`);
      if (!window.Tesseract) await loadScript(`${VENDOR}/tesseract.min.js`);
      const simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
      const abs = (path) => new URL(path, location.href).href;
      worker = await window.Tesseract.createWorker('chi_sim', 1, {
        workerPath: abs(`${VENDOR}/worker.min.js`), corePath: abs(`${VENDOR}/${simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`),
        langPath: abs(`${VENDOR}/lang`), gzip: true, workerBlobURL: false,
        logger: (m) => { if (/load|initializ/i.test(m.status || '')) scProgress(0.02 + 0.08 * (m.progress || 0), '加载识别程序和中文字库……'); },
      });
      const OCR = window.ClassLiveCalendarOCR;
      let mode = '';
      const ocr = async (image, m) => {
        if (m !== mode) { await worker.setParameters(OCR.OCR_MODES[m]); mode = m; }
        return (await worker.recognize(image)).data.text || '';
      };
      const results = [];
      for (const [i, file] of images.entries()) {
        const img = await readImage(file);
        results.push(await OCR.recognize({ ...img, ocr,
          progress: (r, text) => scProgress(0.1 + 0.9 * ((i + r) / images.length), `第 ${i + 1}/${images.length} 张：${text}`) }));
      }
      scProgress(null);
      editCalendar(mergeRecognized(results), images);
    } catch (problem) {
      console.error(problem);
      scProgress(null);
      state.flash = `识别没有完成（${problem.message || problem}）。可以点“修改校历”手动填写。`;
      render();
    } finally {
      if (worker) worker.terminate().catch(() => {});
    }
  }
  // 几张图（如秋季一张、春夏季一张）的识别结果合成一学年
  function mergeRecognized(list) {
    const out = { year: '', school: '', terms: [], holidays: [], workdays: [], notes: [], warnings: [] };
    list.forEach((r) => {
      out.year = out.year || r.year;
      out.school = out.school || r.school;
      r.terms.forEach((t) => { if (!out.terms.some((x) => x.start === t.start)) out.terms.push(t); });
      r.holidays.forEach((h) => { if (!out.holidays.some((x) => x.name === h.name && x.from === h.from)) out.holidays.push(h); });
      r.workdays.forEach((w) => { if (!out.workdays.some((x) => x.date === w.date)) out.workdays.push(w); });
      out.notes.push(...(r.notes || []));
      if (r.warning) out.warnings.push(r.warning);
    });
    out.terms.sort((a, b) => a.start.localeCompare(b.start));
    out.holidays.sort((a, b) => a.from.localeCompare(b.from));
    return out;
  }

  // ---------- 修改校历（上传识别后的预览也用它） ----------
  const calDialog = document.createElement('dialog');
  calDialog.className = 'tw-dialog pl-dialog sc-dialog';
  document.body.appendChild(calDialog);
  let calUrls = [];
  function editCalendar(data, images) {
    const y = data || state.calendar.years[state.calendar.current] || { year: '', school: '', terms: [], holidays: [], workdays: [], notes: [] };
    calUrls.forEach((url) => URL.revokeObjectURL(url));
    calUrls = (images || []).map((file) => URL.createObjectURL(file));
    const termRow = (t = {}) => `<div class="sc-row" data-sc-row="term">
        <label>名称<input type="text" data-k="name" maxlength="12" value="${esc(t.name || '')}" placeholder="秋季学期"></label>
        <label>表上第一行<select data-k="first"><option value="0"${Number(t.first) === 0 ? ' selected' : ''}>第零周</option><option value="1"${Number(t.first) !== 0 ? ' selected' : ''}>第一周</option></select></label>
        <label>第一行的周一<input type="date" data-k="start" value="${esc(t.start || '')}"></label>
        <label>行数（周）<input type="number" data-k="weeks" min="1" max="30" value="${esc(t.weeks || 18)}"></label>
        <button type="button" class="pl-ed-x" data-sc-del aria-label="删除">×</button></div>`;
    const holRow = (h = {}) => `<div class="sc-row" data-sc-row="holiday">
        <label>名称<input type="text" data-k="name" maxlength="12" value="${esc(h.name || '')}" placeholder="国庆节"></label>
        <label>从<input type="date" data-k="from" value="${esc(h.from || '')}"></label>
        <label>到<input type="date" data-k="to" value="${esc(h.to || '')}"></label>
        <label>类型<select data-k="type">${Object.entries(HOLIDAY_TYPES).map(([k, label]) => `<option value="${k}"${(h.type || 'off') === k ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
        <button type="button" class="pl-ed-x" data-sc-del aria-label="删除">×</button></div>`;
    const workRow = (w = {}) => `<div class="sc-row" data-sc-row="work">
        <label>上班日期<input type="date" data-k="date" value="${esc(w.date || '')}"></label>
        <label>这天上<select data-k="as">${WEEKDAYS.map((d, i) => `<option value="${i + 1}"${Number(w.as) === i + 1 ? ' selected' : ''}>周${d}的课</option>`).join('')}</select></label>
        <button type="button" class="pl-ed-x" data-sc-del aria-label="删除">×</button></div>`;
    const recognized = Boolean(images && images.length);
    calDialog.innerHTML = `<form data-sc-form>
      <h2>${recognized ? '上传校历 · 识别结果' : '修改校历'}</h2>
      <p class="tw-hint">${recognized ? '下面是从图片里认出的内容，请对照原图核对（日期、节假日、调休最要紧），改好后点“保存”。' : '学期、节假日和调休都可以改；保存后课表和日程按它标出放假、停课和补课。'}</p>
      ${(data && data.warnings || []).map((w) => `<p class="pl-warn">${esc(w)}</p>`).join('')}
      <div class="sc-edit${calUrls.length ? ' has-images' : ''}">
        <div class="sc-edit-form">
          <div class="pl-set-row"><label>学年<input type="text" name="year" placeholder="2026-2027" value="${esc(y.year || '')}" required pattern="\\d{4}-\\d{4}"></label>
            <label>学校<input type="text" name="school" maxlength="30" value="${esc(y.school || '')}"></label></div>
          <h3>学期</h3><div data-sc-list="term">${(y.terms || []).map(termRow).join('')}</div><button type="button" class="pl-ed-add" data-sc-add="term">＋ 加一个学期</button>
          <h3>节假日</h3><div data-sc-list="holiday">${(y.holidays || []).map(holRow).join('')}</div><button type="button" class="pl-ed-add" data-sc-add="holiday">＋ 加一项</button>
          <h3>调休上班</h3><div data-sc-list="work">${(y.workdays || []).map(workRow).join('')}</div><button type="button" class="pl-ed-add" data-sc-add="work">＋ 加一天</button>
          <h3>说明</h3><textarea name="notes" rows="5" placeholder="每行一条">${esc((y.notes || []).join('\n'))}</textarea>
        </div>
        ${calUrls.length ? `<div class="sc-edit-images">${calUrls.map((url) => `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="上传的校历"></a>`).join('')}<small>点图片看大图</small></div>` : ''}
      </div>
      <label class="tw-check"><input type="checkbox" name="link" checked><span>保存后把课表的学期设为校历里含今天（或课表原来那周）的学期，第几周按校历算</span></label>
      <p class="tw-error" data-sc-error role="alert"></p>
      <div class="tw-actions"><button type="submit" class="tw-primary">保存</button>${!recognized && state.calendar.years[y.year] ? '<button type="button" class="tw-secondary" data-sc-remove>删除这一学年</button>' : ''}<button type="button" class="tw-secondary" data-sc-cancel>取消</button></div>
    </form>`;
    calDialog._rows = { term: termRow, holiday: holRow, work: workRow };
    calDialog.showModal();
  }
  calDialog.addEventListener('click', (event) => {
    const add = event.target.closest('[data-sc-add]');
    if (add) $(`[data-sc-list="${add.dataset.scAdd}"]`, calDialog).insertAdjacentHTML('beforeend', calDialog._rows[add.dataset.scAdd]());
    const del = event.target.closest('[data-sc-del]');
    if (del) del.closest('.sc-row').remove();
    if (event.target.closest('[data-sc-cancel]')) calDialog.close();
    if (event.target.closest('[data-sc-remove]')) {
      const key = calDialog.querySelector('[name=year]').value.trim();
      if (!window.confirm(`删除 ${key} 学年的校历？`)) return;
      const next = { ...state.calendar, years: { ...state.calendar.years } };
      delete next.years[key];
      saveCalendar(next, false);
    }
  });
  calDialog.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target;
    const error = $('[data-sc-error]', calDialog);
    const rows = (kind) => $$(`[data-sc-row="${kind}"]`, calDialog).map((row) => Object.fromEntries($$('[data-k]', row).map((el) => [el.dataset.k, el.value.trim()])));
    const year = form.elements.year.value.trim();
    if (!/^\d{4}-\d{4}$/.test(year)) { error.textContent = '学年写成 2026-2027 这样。'; return; }
    const terms = rows('term').map((t) => ({ name: t.name || '学期', start: t.start, first: Number(t.first), weeks: Math.max(1, Math.min(30, Number(t.weeks) || 1)) }));
    if (terms.some((t) => !parseDay(t.start))) { error.textContent = '每个学期都要填“第一行的周一”。'; return; }
    terms.forEach((t) => { t.start = ymd(addDays(parseDay(t.start), 1 - weekday(parseDay(t.start)))); });
    const holidays = rows('holiday').filter((h) => h.name && h.from).map((h) => ({ name: h.name, from: h.from, to: h.to && h.to >= h.from ? h.to : h.from, type: h.type }));
    const workdays = rows('work').filter((w) => w.date).map((w) => ({ date: w.date, as: Number(w.as) }));
    const notes = form.elements.notes.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30);
    const entry = { year, school: form.elements.school.value.trim(), terms: terms.sort((a, b) => a.start.localeCompare(b.start)),
      holidays: holidays.sort((a, b) => a.from.localeCompare(b.from)), workdays: workdays.sort((a, b) => a.date.localeCompare(b.date)), notes };
    saveCalendar({ ...state.calendar, years: { ...state.calendar.years, [year]: entry }, current: year }, form.elements.link.checked);
  });
  async function saveCalendar(next, link) {
    const error = $('[data-sc-error]', calDialog);
    const value = { current: next.current, years: Object.fromEntries(Object.entries(next.years).map(([key, y]) => { const { preset, ...rest } = y; return [key, rest]; })) };
    try {
      await state.backend.rpc('ck_save_teacher_setting', { p_key: 'calendar', p_value: value });
      state.calendar = normalizeCalendar(value);
      state.schoolTerm = null;
      if (link) {
        const y = state.calendar.years[state.calendar.current];
        const now = today();
        const idx = (y.terms || []).findIndex((t) => { const [a, b] = termRange(t); return now >= a && now <= b; });
        const t = y.terms[idx >= 0 ? idx : Math.max(0, plannerTermOf(y))];
        if (t) await linkPlanner(y, t);
      }
      calDialog.close();
      render();
    } catch (problem) {
      console.error(problem);
      error.textContent = missingError(problem) || /设置不正确/.test(String(problem.message)) ? '保存失败：后台还没有“校历”功能（数据库语句 tools/cloudbase-pg-20261028-校历.sql 尚未执行）。' : `保存失败：${problem.message || problem}`;
    }
  }
  // 课表的学期名称、第 1 周、周数按校历的这一学期设
  async function linkPlanner(y, t) {
    const p = plannerFromTerm(y, t);
    const next = normalize({ ...state.settings, term: p.term, start: p.start, weeks: p.weeks });
    await state.backend.rpc('ck_save_teacher_setting', { p_key: 'planner', p_value: next });
    state.settings = next;
    state.term = next.term;
    state.week = null;
  }

  state.calendar = normalizeCalendar(null);

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
      const { holiday: sh, work: sw } = schoolDay(key);
      const school = [sh && (sh.type !== 'break' || key === sh.from || weekday(date) === 1) ? `<li class="pl-cal-ev is-school is-${sh.type}" title="${esc(`校历：${sh.name}`)}">${esc(sh.name)}</li>` : '',
        sw ? `<li class="pl-cal-ev is-school is-work" title="校历：调休上班">上班·补周${WEEKDAYS[Number(sw.as) - 1]}</li>` : ''].filter(Boolean);
      const items = school.concat(events.map((item) => { const kind = kindOf(item.color); return `<li class="pl-cal-ev${item.done ? ' is-done' : ''}" style="--c:${kind.c};--s:${kind.s}" title="${esc([item.start_time, item.title].filter(Boolean).join(' '))}">${item.start_time ? `<time>${esc(item.start_time)}</time>` : ''}${esc(item.title)}</li>`; })
        .concat(classes.map((item) => `<li class="pl-cal-class${off && !item.makeup ? ' is-off' : ''}" style="--c:${item.c};--s:${item.s}" title="${esc(`${periodText(item.from, item.to)} ${timeOf(item.from, item.to)} ${titleOf(item.klass)} ${item.klass.name}${item.room ? ` · ${item.room}` : ''}${item.makeup ? '（调休补课）' : ''}`)}"><time>${item.from}-${item.to}</time>${esc(item.klass.name)}${item.makeup ? '·补' : ''}</li>`)));
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
        .concat(holidayOn(k) ? [] : classesOn(d).map((item) => ({ time: (state.settings.times[item.from - 1] || {}).from || '', text: `${tagOf(item.klass)} ${item.klass.name}${item.room ? ` · ${item.room}` : ''}`, kind: { c: item.c, s: item.s }, cls: true })));
      if (list.length) upcoming.push({ d, k, list: list.sort((a, b) => String(a.time || '99').localeCompare(String(b.time || '99'))) });
    }
    side.innerHTML = `
      <section class="pl-day">
        <header><b>${cnDate(date)}</b><small>${week >= 1 && week <= state.settings.weeks ? `第 ${week} 周` : ''}${off ? ' · 放假停课' : ''}</small></header>
        ${classes.length ? `<ul class="pl-day-classes">${classes.map((item) => `<li class="${off ? 'is-off' : ''}" style="--c:${item.c};--s:${item.s}">
          <time>${periodText(item.from, item.to)}<small>${timeOf(item.from, item.to)}</small></time>
          <div><b>${esc(titleOf(item.klass))}</b><span>${esc(item.klass.name)}${item.room ? ` · ${esc(item.room)}` : ''}</span></div></li>`).join('')}</ul>` : ''}
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
        <h2>课表抬头 <small>导出 Word 时写在标题下面，选填</small></h2>
        <div class="pl-set-row">
          <label>教师所属部门<input type="text" name="dept" maxlength="40" placeholder="如：商学院" value="${esc(s.dept)}"></label>
          <label>教师<input type="text" name="teacher" maxlength="20" value="${esc(s.teacher)}"></label>
          <label>教师工号<input type="text" name="staff" maxlength="20" value="${esc(s.staff)}"></label>
        </div>
      </div>
      <div class="tw-card wide">
        <h2>作息时间</h2>
        <div class="pl-set-row">${SECTIONS.map((name, k) => `<label>${name}几节<input type="number" name="sec${k}" min="0" max="8" value="${s.sections[k]}" data-pl-sec></label>`).join('')}</div>
        <div class="pl-times">${SECTIONS.map((name, k) => (s.sections[k] ? `<div class="pl-times-group"><h3>${name}</h3>${Array.from({ length: s.sections[k] }, () => {
          q += 1;
          const t = s.times[q - 1] || { from: '', to: '' };
          return `<label><b>第 ${q} 节</b><input type="time" name="from${q}" value="${esc(t.from)}">—<input type="time" name="to${q}" value="${esc(t.to)}"></label>`;
        }).join('')}</div>` : '')).join('')}</div>
        <div class="tw-actions"><button type="button" class="tw-secondary" data-pl-auto>按每节 40 分钟、两节之间 5 分钟、两大节之间 15 分钟顺排</button><button type="button" class="tw-secondary" data-pl-default>恢复默认作息</button></div>
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
    return normalize({ term: String(data.get('term') || '').trim(), start: data.get('start'), weeks: data.get('weeks'), sections, times,
      dept: data.get('dept'), teacher: data.get('teacher'), staff: data.get('staff'), extras: state.settings.extras });
  }
  // 每个时段第一节的开始时间不变，其后按用户学校的作息：每节 40 分钟，两节连上中间 5 分钟，两大节之间 15 分钟
  function autoTimes(plan) {
    const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const toText = (n) => `${pad(Math.floor(n / 60) % 24)}:${pad(n % 60)}`;
    let q = 0;
    plan.sections.forEach((n, k) => {
      let at = toMin((plan.times[q] || {}).from) ?? [510, 810, 1080][k];
      for (let i = 0; i < n; i += 1) { plan.times[q] = { from: toText(at), to: toText(at + 40) }; at += i % 2 ? 55 : 45; q += 1; }
    });
    return plan;
  }

  // ---------------- 事件 ----------------
  view.addEventListener('click', (event) => {
    const t = event.target;
    if (t.closest('[data-pl-close]')) { close(); return; }
    const tab = t.closest('[data-pl-tab]');
    if (tab) { state.tab = tab.dataset.plTab; state.editing = null; state.flash = ''; render(); return; }
    const edit = t.closest('[data-pl-edit]');
    if (edit) {
      const klass = findClass(edit.dataset.plEdit);
      if (klass && klass.extra) editExtra(klass.extra);
      else if (klass) editClass(klass, () => render());
      return;
    }
    if (t.closest('[data-pl-extra-add]')) { editExtra(null); return; }
    const step = t.closest('[data-pl-week]');
    if (step) { state.week = Math.max(1, Math.min(state.settings.weeks, (state.week || currentWeek() || 1) + Number(step.dataset.plWeek))); render(); return; }
    if (t.closest('[data-pl-week-now]')) { state.week = currentWeek() || 0; render(); return; }
    if (t.closest('[data-pl-word]')) { exportWord(); return; }
    const scTerm = t.closest('[data-sc-term]');
    if (scTerm) { state.schoolTerm = Number(scTerm.dataset.scTerm); render(); return; }
    if (t.closest('[data-sc-upload]')) { const input = $('[data-sc-input]', view); input.value = ''; input.click(); return; }
    if (t.closest('[data-sc-edit]')) { editCalendar(null, null); return; }
    if (t.closest('[data-sc-link]')) {
      const y = state.calendar.years[state.calendar.current];
      const term = y && y.terms[state.schoolTerm];
      if (term && window.confirm(`把课表的学期设为“${plannerFromTerm(y, term).term}”，第 1 周从 ${plannerFromTerm(y, term).start} 开始？`)) {
        linkPlanner(y, term).then(render).catch((problem) => { state.flash = `没有设好：${problem.message || problem}`; render(); });
      }
      return;
    }
    if (t.closest('[data-pl-upload]')) { const input = $('[data-pl-upload-input]', view); input.value = ''; input.click(); return; }
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
    else if (t.matches('[data-pl-upload-input]')) handleUpload(t.files && t.files[0]);
    else if (t.matches('[data-sc-input]')) uploadCalendar(t.files);
    else if (t.matches('[data-sc-year]')) { state.calendar.current = t.value; state.schoolTerm = null; render(); }
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
    dialogExtra = null;
    dialogDone = done || null;
    $('[data-pl-dialog-title]', dialog).textContent = `上课时间与教室 · ${klass.name}`;
    $('[data-pl-dialog-hint]', dialog).textContent = `${courseOf(klass.course).title}。按学校课表填写星期、节次、单双周和教室，保存后自动排进“课表”和“日程”；同一个班每周上几次就加几段。`;
    $('[data-pl-dialog-error]', dialog).textContent = '';
    $('[data-pl-dialog-clear]', dialog).textContent = '清除上课时间';
    $('[data-pl-dialog-clear]', dialog).hidden = !(klass.schedule && klass.schedule.slots && klass.schedule.slots.length);
    dialogEditor.set(klass.schedule || null);
    dialog.showModal();
  }
  // 其他课程（不在本网站上课的，如研究生课）：存在课表设置里（ck_teacher_settings 的 planner.extras），extra 为空＝新建
  function editExtra(extra) {
    dialogClass = null;
    dialogExtra = extra || { id: '' };
    dialogDone = null;
    $('[data-pl-dialog-title]', dialog).textContent = extra ? `其他课程 · ${extra.title}` : '添加其他课程';
    $('[data-pl-dialog-hint]', dialog).textContent = '不在本网站上课的课（如研究生课、讲座）：填写课程名称、班级和上课时间，保存后排进“课表”和“日程”，导出 Word 时一并列出。';
    $('[data-pl-dialog-error]', dialog).textContent = '';
    $('[data-pl-dialog-clear]', dialog).textContent = '删除这门课';
    $('[data-pl-dialog-clear]', dialog).hidden = !extra;
    dialogEditor.set(extra || { term: state.settings.term, room: '', weeks: [1, Math.min(16, state.settings.weeks)], slots: [] }, { extra: true });
    dialog.showModal();
  }
  async function saveExtra(plan) {
    const error = $('[data-pl-dialog-error]', dialog);
    const id = dialogExtra.id || `x${Date.now().toString(36)}`;
    const extras = state.settings.extras.filter((item) => item.id !== id);
    if (plan) extras.push({ ...plan, id });
    const next = normalize({ ...state.settings, extras });
    try {
      await state.backend.rpc('ck_save_teacher_setting', { p_key: 'planner', p_value: next });
      state.settings = next;
      dialog.close();
      if (!view.hidden) render();
    } catch (problem) {
      console.error(problem);
      error.textContent = missingError(problem) ? NOT_READY : `保存失败：${problem.message || problem}`;
    }
  }
  async function saveSchedule(plan) {
    if (dialogExtra) { await saveExtra(plan); return; }
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
    if (dialogExtra && !plan.title) { $('[data-pl-dialog-error]', dialog).textContent = '请填写课程名称。'; return; }
    saveSchedule(plan);
  });
  $('[data-pl-dialog-clear]', dialog).addEventListener('click', () => {
    if (dialogExtra) { if (window.confirm(`删除其他课程“${dialogExtra.title}”？它会从课表和日程里去掉。`)) saveExtra(null); return; }
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
    importFile: handleUpload,   // 测试用：直接传入文件
    importCalendar: uploadCalendar,
    save: async (klassId, plan) => state.backend.rpc('ck_set_class_schedule', { p_class: Number(klassId) || klassId, p_schedule: plan }),
    missingError,
    NOT_READY,
    open,
    close,
  };
})();
