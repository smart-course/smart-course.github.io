/* 学生登录（首页）：填写课堂码和个人信息 → 后台 ck_join 一并核对：课堂码、点名册（学号、姓名一致）、4 位个人口令 → 记录加入 → 打开本周章节。
 *   · 第一次登录设口令；同一设备登录过不用再输，换设备要输；连续输错 10 次锁定（15 分钟→1 小时→须老师解锁），忘记由老师重置；
 *   · 学号不在点名册上：自动向老师申请，老师在工作台允许后本页自动继续；班级没有点名册时不能登录。
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
  const STORE = 'classlive-student';
  const SUBMIT_TEXT = '登录并进入课堂 →';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch (error) { return {}; } };
  const save = (value) => { try { localStorage.setItem(STORE, JSON.stringify(value)); } catch (error) { /* 无痕模式等情况下忽略 */ } };
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
    set: ['第一次登录：请设置 4 位数字个人口令', '以后在这台设备上不用再输；换手机或电脑登录时要输入。不要用 0000、1234 这类或学号后四位，也不要告诉别人。忘记了请找老师重置。'],
    need: ['这个学号在别的设备上登录过：请输入你的 4 位个人口令', '输对后这台设备以后不用再输。忘记口令请找老师在工作台重置。'],
  };
  function setPinMode(mode) {
    pinMode = mode;
    pinBox.hidden = !mode;
    if (!mode) return;
    pinBox.querySelector('[data-pin-title]').textContent = PIN_TEXT[mode][0];
    pinBox.querySelector('[data-pin-hint]').textContent = PIN_TEXT[mode][1];
    pinBox.querySelector('[data-pin-set]').hidden = mode !== 'set';
    pinBox.querySelector('[data-pin-need]').hidden = mode !== 'need';
  }
  const clearPins = () => ['pin', 'new_pin', 'new_pin2'].forEach((name) => { field(name).value = ''; });
  ['pin', 'new_pin', 'new_pin2'].forEach((name) => field(name).addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  }));
  // 改了课堂码、姓名或学号：口令要求重新判断
  ['code', 'name', 'sid'].forEach((name) => field(name).addEventListener('input', () => {
    stopWaiting();
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

  // ---------- 登录 ----------
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
      if (status !== 'pending') stopWaiting();
      switch (status) {
        case 'ok':
          leaving = true;
          enter(request, result);
          return;
        case 'pending':
          showError('');
          startWaiting(request);
          return;
        case 'bad_code':
          showError('课堂码不正确，或这个课堂已经停止开放。请核对老师公布的最新课堂码。', field('code'));
          return;
        case 'invalid':
          showError('请检查姓名和学号的填写。', field('name'));
          return;
        case 'no_roster':
          showError('老师还没有上传本班点名册，暂时不能登录。请告诉老师。');
          return;
        case 'bad_name':
          showError('姓名与本班点名册上的不一致：请填写点名册上的姓名，并再核对一遍学号。', field('name'));
          return;
        case 'rejected':
          showError('老师没有允许这个学号进入本班课堂。如果学号填错了，请改正后重新登录。', field('sid'));
          return;
        case 'set_pin':
          setPinMode('set');
          showError('');
          field('new_pin').focus();
          return;
        case 'weak_pin':
          setPinMode('set');
          clearPins();
          showError('这个口令太容易被猜到（如 0000、1234、学号后四位），请换一个。', field('new_pin'));
          return;
        case 'need_pin':
          setPinMode('need');
          showError(request.newPin ? '刚刚有人先为这个学号设置了口令：如果不是你本人，请马上告诉老师。' : '');
          field('pin').focus();
          return;
        case 'bad_pin':
          setPinMode('need');
          clearPins();
          showError(`口令不对，还可以再试 ${result.left} 次（连续输错 10 次会被锁定，而且一次比一次久）。忘记口令请找老师重置。`, field('pin'));
          return;
        case 'locked':
          setPinMode('need');
          clearPins();
          showError(result.teacher
            ? '这个学号多次输错口令，已被锁定：请找老师在工作台解锁。'
            : `这个学号的口令输错次数过多，已暂时锁定，${result.until ? `${hhmm(result.until)} 以后` : '稍后'}再试（再锁定会更久）；也可以请老师在工作台解锁。`);
          return;
        case 'too_many':
          showError('尝试次数过多，请 10 分钟后再试。');
          return;
        default:
          showError('登录没有成功，请再试一次。');
      }
    } catch (problem) {
      console.error(problem);
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
    save({
      code: request.code, name: room.name || request.name, sid: room.sid || request.sid, class_name: request.className, group_name: request.groupName,
      agreed: true, course: room.course, chapter: room.chapter, classroom: room.classroom, classroom_name: room.room_name, joined_at: Date.now(),
    });
    clearPins();
    button.disabled = true;
    button.textContent = '正在进入课堂……';
    location.href = `/${room.course}/cases/${room.chapter}.html` + (room.pwd_hash ? `#staticrypt_pwd=${room.pwd_hash}&remember_me` : '');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
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
    showError('');
    stopWaiting();
    await attempt(request, false);
  });
})();
