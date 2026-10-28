/* 学生登录（首页）：填写课堂码和个人信息 → 后台 ck_join 一并核对：课堂码、点名册（学号、姓名一致）、4 位个人口令 → 记录加入 → 打开本周章节。
 *   · 第一次登录设口令；同一设备登录过不用再输，换设备要输；连续输错 10 次锁定（15 分钟→1 小时→须老师解锁）；
 *     忘记口令：点“忘记口令”向老师申请（ck_pin_forgot），老师同意后由这台设备设新口令（本页每 10 秒查一次，同意了就提示设口令）；
 *   · 学号不在点名册上（2026-10-28 起）：只提示核对姓名和学号，不再自动申请；确实不在名单上的同学点“申请加入本班”（ck_join_apply），
 *     老师在工作台允许后本页自动继续；班级没有点名册时不能登录。
 * 章节页各自加密，ck_join 只在全部核对通过后返回该章节的解密值，页面凭它自动打开（并记住 30 天）。
 * 需要页面先加载 live-core.js，并设置 window.CLASS_LIVE_CONFIG。
 */
(function () {
  'use strict';
  const form = document.querySelector('[data-join-form]');
  if (!form) return;
  const config = window.CLASS_LIVE_CONFIG || { provider: 'off' };
  const field = (name) => form.elements[name];
  const errorBox = form.querySelector('[data-join-error]');
  const button = form.querySelector('[type=submit]');
  const pinBox = form.querySelector('[data-pin-box]');
  const waitBox = form.querySelector('[data-join-wait]');
  const applyBox = form.querySelector('[data-join-apply]');
  const forgotBox = form.querySelector('[data-pin-forgot-box]');
  const forgotState = form.querySelector('[data-pin-forgot-state]');
  const STORE = 'classlive-student';
  const SUBMIT_TEXT = '登录并进入课堂 →';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch (error) { return {}; } };
  const save = (value) => { try { localStorage.setItem(STORE, JSON.stringify(value)); } catch (error) { /* 无痕模式等情况下忽略 */ } };
  // 请假用：每门课最近一次登录的身份（STORE 只记最后一次，两门课都上的同学会互相覆盖）
  const IDS_STORE = 'classlive-leave-ids';
  const loadIds = () => {
    let ids = {};
    try { ids = JSON.parse(localStorage.getItem(IDS_STORE) || 'null') || {}; } catch (error) { ids = {}; }
    const last = load();
    if (last.classroom && last.sid && last.course && !ids[last.course]) ids[last.course] = last;
    return ids;
  };
  const rememberId = (identity) => {
    try {
      const ids = loadIds();
      ids[identity.course] = { course: identity.course, classroom: identity.classroom, code: identity.code, name: identity.name, sid: identity.sid,
        class_name: identity.class_name, joined_at: identity.joined_at };
      localStorage.setItem(IDS_STORE, JSON.stringify(ids));
    } catch (error) { /* 忽略 */ }
  };
  const showError = (message, focus) => { errorBox.textContent = message; if (focus) focus.focus(); };
  const hhmm = (value) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

  let backend = null;
  try { backend = window.ClassLive && window.ClassLive.create(config); } catch (error) { console.warn('[课堂后台]', error.message); }
  if (!backend) {
    showError('课堂后台尚未开通，暂时无法登录。请联系任课教师。');
    button.disabled = true;
    return;
  }
  const normalize = window.ClassLive.normalizeCode;

  // 预填：加入链接 ?join=课堂码，其余信息沿用这台设备上次填写的内容（口令从不保存）
  const saved = load();
  const params = new URLSearchParams(location.search);
  field('code').value = normalize(params.get('join') || '');
  ['name', 'sid', 'class_name', 'group_name'].forEach((key) => { if (saved[key]) field(key).value = saved[key]; });
  field('agree').checked = Boolean(saved.agreed);
  // 请假（live-leave.js）：首页也能请假，不必先进课堂。要凭这台设备登录过的课堂核对是本人，所以按课程记下每门课最近一次登录的身份：
  // 加入链接的课堂码和某门课上次登录的课堂码相同就用那门课；分不清（两门课都登录过、课堂码又是新的）时请学生先选课程
  const leaveBox = form.querySelector('[data-join-leave]');
  if (leaveBox && window.ClassLeave) {
    leaveBox.hidden = false;
    leaveBox.querySelector('[data-join-leave-open]').addEventListener('click', () => {
      const ids = Object.values(loadIds()).filter((item) => item && item.classroom && item.sid)
        .sort((a, b) => (b.joined_at || 0) - (a.joined_at || 0));
      const tip = leaveBox.querySelector('[data-join-leave-tip]');
      if (!ids.length) {
        tip.textContent = '这台设备还没有登录过课堂，没法核对是你本人。请用上课时登录过的手机或电脑打开这个链接请假；都没有的话，请直接联系老师。';
        tip.classList.add('is-warn');
        return;
      }
      const code = normalize(field('code').value);
      const same = ids.find((item) => item.code && item.code === code);
      // 加入链接带了课堂码、但这台设备只登录过另一门课：照样用那门课，并提醒学生看清课程
      const notice = !same && code && ids.length === 1
        ? '注意：这台设备只登录过下面这门课。要给别的课请假，请用上那门课时登录过的手机或电脑。' : '';
      window.ClassLeave.open(same || ids.length === 1 ? { backend, identity: same || ids[0], notice } : { backend, identities: ids });
    });
  }
  field('code').addEventListener('input', () => {
    const input = field('code');
    const position = input.selectionStart;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(position, position);
  });
  setTimeout(() => (field('code').value ? field('name') : field('code')).focus(), 50);

  // ---------- 个人口令 ----------
  // mode：'' 不需要 / 'set' 第一次设口令 / 'need' 换设备输口令
  let pinMode = '';
  const PIN_TEXT = {
    set: ['第一次登录：请设置 4 位数字个人口令', '以后在这台设备上不用再输；换手机或电脑登录时要输入。不要用 0000、1234 这类或学号后四位，也不要告诉别人。忘记了可以在登录时点“忘记口令”向老师申请重设。'],
    reset: ['老师已同意重设口令：请设置新的 4 位数字口令', '以后在这台设备上不用再输；换手机或电脑登录时输这个新口令。不要用 0000、1234 这类或学号后四位，也不要告诉别人。'],
    need: ['这个学号在别的设备上登录过：请输入你的 4 位个人口令', '输对后这台设备以后不用再输。忘记口令可以点下面的“忘记口令”向老师申请重设。'],
  };
  // text：'reset' 时用“老师已同意重设口令”的说明（仍是设口令）
  function setPinMode(mode, text) {
    pinMode = mode;
    pinBox.hidden = !mode;
    if (!mode) return;
    const words = PIN_TEXT[text || mode];
    pinBox.querySelector('[data-pin-title]').textContent = words[0];
    pinBox.querySelector('[data-pin-hint]').textContent = words[1];
    pinBox.querySelector('[data-pin-set]').hidden = mode !== 'set';
    pinBox.querySelector('[data-pin-need]').hidden = mode !== 'need';
    forgotBox.hidden = mode !== 'need';
  }
  const clearPins = () => ['pin', 'new_pin', 'new_pin2'].forEach((name) => { field(name).value = ''; });
  ['pin', 'new_pin', 'new_pin2'].forEach((name) => field(name).addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  }));
  // 改了课堂码、姓名或学号：口令要求重新判断
  ['code', 'name', 'sid'].forEach((name) => field(name).addEventListener('input', () => {
    stopWaiting();
    stopForgotWatch();
    applyBox.hidden = true;
    forgotState.textContent = '';
    if (pinMode) { setPinMode(''); clearPins(); }
  }));

  // ---------- 等老师允许（学号不在点名册上） ----------
  let waitTimer = 0;
  let waitUntil = 0;
  function stopWaiting() {
    clearTimeout(waitTimer);
    waitTimer = 0;
    waitUntil = 0;
    waitBox.hidden = true;
  }
  function startWaiting(request) {
    waitBox.hidden = false;
    if (!waitUntil) waitUntil = Date.now() + 20 * 60000;
    clearTimeout(waitTimer);
    if (Date.now() > waitUntil) {
      stopWaiting();
      showError('老师暂时还没有处理你的加入申请。请告诉老师，老师允许后再点“登录”。');
      return;
    }
    waitTimer = setTimeout(() => attempt(request, true), 5000);
  }
  waitBox.querySelector('[data-wait-cancel]').addEventListener('click', () => { stopWaiting(); showError(''); });

  // ---------- 读表单（登录、申请加入、忘记口令共用） ----------
  function readForm(withPin) {
    const code = normalize(field('code').value);
    const name = field('name').value.trim();
    const sid = field('sid').value.trim();
    const className = field('class_name').value.trim();
    const groupName = field('group_name').value.trim();
    if (!/^[A-Z0-9]{8}$/.test(code)) return showError('课堂码是 8 位字母和数字，请核对老师公布的课堂码', field('code'));
    if (name.length < 2) return showError('请填写真实姓名（与点名册一致）', field('name'));
    if (!/^[A-Za-z0-9]{4,20}$/.test(sid)) return showError('学号应为 4—20 位数字或字母', field('sid'));
    if (!className) return showError('请填写班级', field('class_name'));
    if (!field('agree').checked) return showError('请先阅读并勾选数据使用说明');
    const request = { code, name, sid, className, groupName, pin: null, newPin: null };
    if (!withPin) return request;
    if (pinMode === 'set') {
      const first = field('new_pin').value;
      if (!/^\d{4}$/.test(first)) return showError('口令是 4 位数字', field('new_pin'));
      if (first !== field('new_pin2').value) return showError('两次输入的口令不一样，请重新输入', field('new_pin2'));
      request.newPin = first;
    } else if (pinMode === 'need') {
      const typed = field('pin').value;
      if (!/^\d{4}$/.test(typed)) return showError('请输入 4 位数字口令', field('pin'));
      request.pin = typed;
    }
    return request;
  }
  const COMMON_ERRORS = {
    bad_code: ['课堂码不正确（老师换过课堂码的话，旧码就不能用了）。请核对老师公布的最新课堂码。', 'code'],
    invalid: ['请检查姓名和学号的填写。', 'name'],
    no_roster: ['老师还没有上传本班点名册，暂时不能登录。请告诉老师。'],
    bad_name: ['姓名与本班点名册上的不一致：请填写点名册上的姓名，并再核对一遍学号。', 'name'],
    too_many: ['尝试次数过多，请 10 分钟后再试。'],
  };
  const commonError = (status) => {
    const [text, focus] = COMMON_ERRORS[status] || ['没有成功，请再试一次。'];
    showError(text, focus ? field(focus) : null);
  };

  // ---------- 申请加入本班（学号确实不在点名册上） ----------
  const applyButton = applyBox.querySelector('[data-join-apply-send]');
  applyButton.addEventListener('click', async () => {
    const request = readForm(false);
    if (!request) return;
    applyButton.disabled = true;
    try {
      await backend.ensureAnonymous();
      let result = await backend.rpc('ck_join_apply', { p_code: request.code, p_name: request.name, p_sid: request.sid, p_class: request.className });
      if (Array.isArray(result)) result = result[0];
      const status = (result && result.status) || '';
      if (status === 'pending') {
        applyBox.hidden = true;
        showError('');
        startWaiting(request);
      } else if (status === 'listed') {
        applyBox.hidden = true;
        showError('这个学号在本班点名册上，不用申请：核对姓名后直接点“登录”。', field('name'));
      } else {
        commonError(status);
      }
    } catch (problem) {
      console.error(problem);
      showError('申请没有发出去，请检查网络后再试一次。');
    } finally {
      applyButton.disabled = false;
    }
  });

  // ---------- 忘记口令：向老师申请重设，同意后由这台设备设新口令 ----------
  let forgotTimer = 0;
  let forgotUntil = 0;
  function stopForgotWatch() {
    clearTimeout(forgotTimer);
    forgotTimer = 0;
    forgotUntil = 0;
  }
  // 每 10 秒查一次老师同意了没有（不带口令登录：同意前后台回答 need_pin，同意后回答 set_pin），最多等 20 分钟
  function watchForgot(request) {
    if (!forgotUntil) forgotUntil = Date.now() + 20 * 60000;
    clearTimeout(forgotTimer);
    if (Date.now() > forgotUntil) { stopForgotWatch(); return; }
    forgotTimer = setTimeout(() => attempt({ ...request, pin: null, newPin: null }, 'forgot'), 10000);
  }
  const forgotButton = forgotBox.querySelector('[data-pin-forgot]');
  forgotButton.addEventListener('click', async () => {
    const request = readForm(false);
    if (!request) return;
    forgotButton.disabled = true;
    try {
      await backend.ensureAnonymous();
      let result = await backend.rpc('ck_pin_forgot', { p_code: request.code, p_name: request.name, p_sid: request.sid });
      if (Array.isArray(result)) result = result[0];
      const status = (result && result.status) || '';
      if (status === 'pending') {
        showError('');
        forgotState.textContent = '已向老师申请重设口令。老师在工作台同意后，本页会提示你在这台设备上设新口令（请不要关闭本页；也可以告诉老师一声）。';
        watchForgot(request);
      } else if (status === 'no_pin' || status === 'no_need') {
        forgotState.textContent = '';
        showError(status === 'no_pin' ? '这个学号现在不用输旧口令：直接点“登录”，设置新口令。' : '这台设备登录过这个学号，不用口令：直接点“登录”。');
        setPinMode('');
        clearPins();
      } else if (status === 'not_listed') {
        showError('本班点名册上没有这个学号：请核对姓名和学号。', field('sid'));
      } else {
        commonError(status);
      }
    } catch (problem) {
      console.error(problem);
      showError('申请没有发出去，请检查网络后再试一次。');
    } finally {
      forgotButton.disabled = false;
    }
  });

  // ---------- 登录 ----------
  // quiet：true＝等老师允许加入时的自动重试；'forgot'＝等老师同意重设口令时的自动查询
  async function attempt(request, quiet) {
    if (!quiet) {
      button.disabled = true;
      button.textContent = '正在核对……';
    }
    let leaving = false;
    try {
      await backend.ensureAnonymous();
      let result = await backend.rpc('ck_join', {
        p_code: request.code, p_name: request.name, p_sid: request.sid, p_class: request.className, p_group: request.groupName || null,
        p_pin: request.pin, p_new_pin: request.newPin,
      });
      if (Array.isArray(result)) result = result[0];
      const status = (result && result.status) || 'bad_code';
      if (quiet === 'forgot') {
        if (status === 'need_pin' && result.forgot === 'pending') { watchForgot(request); return; }
        stopForgotWatch();
        if (status === 'set_pin') {
          forgotState.textContent = '';
          setPinMode('set', 'reset');
          showError('');
          field('new_pin').focus();
        } else if (status === 'need_pin' && result.forgot === 'rejected') {
          forgotState.textContent = '老师没有同意这次重设口令的申请。如果确实是你本人，请当面找老师。';
        }
        return;
      }
      if (status !== 'pending') stopWaiting();
      if (status !== 'not_listed') applyBox.hidden = true;
      switch (status) {
        case 'ok':
          leaving = true;
          enter(request, result);
          return;
        case 'view':
          leaving = true;
          enterView(result);
          return;
        case 'pending':
          showError('');
          startWaiting(request);
          return;
        case 'bad_code':
        case 'invalid':
        case 'no_roster':
        case 'bad_name':
          commonError(status);
          return;
        // 学号不在点名册上：多半是填错了，提示核对；确实不在名单上的同学可以点“申请加入本班”
        case 'not_listed':
          showError('本班点名册上没有这个学号：请核对姓名和学号后重新登录。', field('sid'));
          applyBox.querySelector('[data-join-apply-note]').textContent = result.rejected
            ? '老师上次没有允许这个学号加入。如果你确实不在本班名单上（如重修、跨班旁听），可以再次'
            : '如果你确实不在本班名单上（如重修、跨班旁听），可以';
          applyBox.hidden = false;
          return;
        case 'set_pin':
          setPinMode('set');
          showError('');
          field('new_pin').focus();
          return;
        case 'reset_other':
          setPinMode('need');
          clearPins();
          showError('老师已同意重设这个学号的口令，但只有提出申请的那台手机或电脑能设新口令。请用那台设备登录；那台设备不在身边的话，可以在这台设备上点“忘记口令”重新申请。');
          return;
        case 'weak_pin':
          setPinMode('set');
          clearPins();
          showError('这个口令太容易被猜到（如 0000、1234、学号后四位），请换一个。', field('new_pin'));
          return;
        case 'need_pin':
          setPinMode('need');
          showError(request.newPin ? '刚刚有人先为这个学号设置了口令：如果不是你本人，请马上告诉老师。' : '');
          if (result.forgot === 'pending') { forgotState.textContent = '你已申请重设口令，正在等老师同意（同意后本页会提示设新口令）。'; watchForgot(request); }
          field('pin').focus();
          return;
        case 'bad_pin':
          setPinMode('need');
          clearPins();
          showError(`口令不对，还可以再试 ${result.left} 次（连续输错 10 次会被锁定，而且一次比一次久）。忘记口令可以点下面的“忘记口令”向老师申请重设。`, field('pin'));
          return;
        case 'locked':
          setPinMode('need');
          clearPins();
          showError(result.teacher
            ? '这个学号多次输错口令，已被锁定：请找老师在工作台解锁。'
            : `这个学号的口令输错次数过多，已暂时锁定，${result.until ? `${hhmm(result.until)} 以后` : '稍后'}再试（再锁定会更久）；也可以请老师在工作台解锁。`);
          return;
        case 'too_many':
          commonError(status);
          return;
        default:
          showError('登录没有成功，请再试一次。');
      }
    } catch (problem) {
      console.error(problem);
      if (quiet === 'forgot') { watchForgot(request); return; }   // 等老师同意时偶尔断网：继续等
      if (quiet) { startWaiting(request); return; }   // 等待中偶尔断网：继续等
      stopWaiting();
      showError(window.ClassLive.isClosedError(problem)
        ? '这个课堂刚刚停止开放，请核对老师公布的最新课堂码。'
        : '登录没有成功，请检查网络后再试一次。');
    } finally {
      if (!leaving && !quiet) {
        button.disabled = false;
        button.textContent = SUBMIT_TEXT;
      }
    }
  }

  function enter(request, room) {
    // 当天已记过登录：章节页不再重复记（章节页每天第一次打开会自动补记，见 live-student）
    try { localStorage.setItem(`classlive-checkin:${room.classroom}`, JSON.stringify(window.ClassLive.today())); } catch (error) { /* 忽略 */ }
    // 姓名、学号按点名册上的写法保存，之后递交作答、发弹幕都用它
    const identity = {
      code: request.code, name: room.name || request.name, sid: room.sid || request.sid, class_name: request.className, group_name: request.groupName,
      agreed: true, course: room.course, chapter: room.chapter, case_no: room.case_no || null, classroom: room.classroom, classroom_name: room.room_name, joined_at: Date.now(),
    };
    save(identity);
    // 每个章节（案例）也各记一份：一个班同时开放几个课堂时，章节页用自己的那份（见 live-student.js）
    try { localStorage.setItem(`${STORE}:${room.course}:${room.chapter}`, JSON.stringify(identity)); } catch (error) { /* 忽略 */ }
    rememberId(identity);
    clearPins();
    button.disabled = true;
    button.textContent = '正在进入课堂……';
    location.href = `/${room.course}/cases/${room.chapter}.html` + (room.pwd_hash ? `#staticrypt_pwd=${room.pwd_hash}&remember_me` : '');
  }

  // 历史课堂（停止的、提前发布还没开课的，2026-10-23）：后台核对过点名册和口令，只给查看本章的钥匙，不记登录。
  // 不改本机保存的课堂身份（本周课堂照常递交），记下“用历史课堂码进来的”，章节页面板据此说明只能查看
  function enterView(room) {
    try { localStorage.setItem(`classlive-view:${room.course}:${room.chapter}`, JSON.stringify({ room: room.room_name || '', case_no: room.case_no || null, at: Date.now() })); } catch (error) { /* 忽略 */ }
    clearPins();
    button.disabled = true;
    button.textContent = '正在打开（只能查看）……';
    location.href = `/${room.course}/cases/${room.chapter}.html` + (room.pwd_hash ? `#staticrypt_pwd=${room.pwd_hash}&remember_me` : '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const request = readForm(true);
    if (!request) return;
    showError('');
    stopWaiting();
    stopForgotWatch();
    await attempt(request, false);
  });
})();
