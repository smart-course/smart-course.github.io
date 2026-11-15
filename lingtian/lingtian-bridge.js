/* 云间灵田 · 智慧课堂接入层（2026-11-15）
 * 1. 进入：学生在课程页面“宗门 → 云间灵田”打开本页（?room=课堂编号）。本页凭课程页同一个云开发登录，向数据库换一张凭证（lt_ticket，
 *    核对课堂码登录、点名册、设备，并要求已入宗门、老师已开放），之后游戏的每个请求都带着凭证调用云函数 lingtian；
 * 2. 道号：第一次进入时请同学起个道号（道友们看到道号，老师在工作台能对上是谁）；提醒文明取名，敏感词（含谐音）由云函数挡下，不文明的老师会销号；
 * 3. 修炼场答题：浇水、锄草、额外刷新道友名单时抽到的题在这里作答，答对才执行；作答后显示正确答案和解析（同修炼场）；
 * 4. 境界以课程网站为准：隐藏游戏原来的“修为进度、尝试突破”，说明服丹折算网站修为的规则；
 * 5. 学生版测试页的老师（王不凡，2026-11-16）：宗门是老师在测试页替他选的（记在这台设备上，随每次请求带给云函数）；只看不交换、别人看不到他，
 *    页面上标明“测试 · 只看”，第一次进入时说明一次。
 */
(function (global) {
  'use strict';
  const config = global.CLASS_LIVE_CONFIG || null;
  const params = new URLSearchParams(location.search);
  const room = Number(params.get('room')) || 0;
  const KEY = `lingtian-ticket:${room}`;
  let backend = null;
  try { backend = config && config.provider !== 'off' && global.ClassLive ? global.ClassLive.create(config) : null; } catch (error) { backend = null; }
  let ticketValue = null;
  let role = null, ticketCourse = null;   // 凭证对应的身份（student / preview）和课程

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
  const REASONS = {
    login: ['先回课堂登录', '请先回到课程页面，用本堂课的课堂码登录，再从左下角面板“宗门 → 云间灵田”进入。'],
    no_room: ['请从课程页面进入', '云间灵田要从课程页面左下角面板的“宗门 → 云间灵田”进入，这样才知道你是哪个班、哪门课的同学。'],
    closed: ['灵田尚未开放', '老师还没有开放本课程的云间灵田，开放后就能进来种灵植了。'],
    lingtian_closed: ['灵田尚未开放', '老师还没有开放本课程的云间灵田，开放后就能进来种灵植了。'],
    sect_required: ['先拜入宗门', '加入宗门后才能开辟自己的灵田：回到课程页面，在左下角面板的“宗门”里拜入一个宗门（散修不能开辟灵田）。'],
    ticket_expired: ['凭证已过期', '进入灵田的凭证已过期，请回到课程页面重新点“云间灵田”。'],
    ticket_required: ['请从课程页面进入', '云间灵田要从课程页面左下角面板的“宗门 → 云间灵田”进入。'],
    banned: ['灵田已被销号', '你的灵田已被老师销号（道号不文明），不能再进入云间灵田。有疑问请找老师。'],
    no_backend: ['暂时连不上', '课程网站的后台暂时连不上，请检查网络后重试。'],
  };

  async function fetchTicket(force) {
    if (!backend) throw fail(503, 'no_backend', REASONS.no_backend[1]);
    if (!room) throw fail(401, 'no_room', REASONS.no_room[1]);
    if (!force) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
        if (saved && saved.ticket && saved.role && saved.expiresAt > Date.now() + 60_000) { ticketValue = saved.ticket; role = saved.role; ticketCourse = saved.course || null; return ticketValue; }
      } catch (error) { /* 浏览器禁用存储时每次重新领凭证 */ }
    }
    const raw = await backend.rpc('lt_ticket', { p_classroom: room });
    const res = (Array.isArray(raw) ? raw[0] : raw) || {};
    if (res.status !== 'ok' || !res.ticket) {
      const status = res.status || 'login';
      throw fail(status === 'login' ? 401 : 403, status, (REASONS[status] || REASONS.login)[1]);
    }
    ticketValue = res.ticket; role = res.role || 'student'; ticketCourse = res.course || null;
    try { sessionStorage.setItem(KEY, JSON.stringify({ ticket: res.ticket, role, course: ticketCourse, expiresAt: Number(res.expiresAt) || Date.now() + 3_600_000 })); } catch (error) { /* 忽略 */ }
    return ticketValue;
  }

  // 学生版测试页替王不凡选的宗门（live-student.js 记在这台设备上：lingtian-preview-sect:课程）；学生的宗门以网站名单为准，不带这一项
  function previewSect() {
    try { return localStorage.getItem(`lingtian-preview-sect:${ticketCourse}`) || ''; } catch (error) { return ''; }
  }

  async function request(path, body) {
    const [pathname, search] = String(path).split('?');
    const query = Object.fromEntries(new URLSearchParams(search || ''));
    for (let attempt = 0; attempt < 2; attempt++) {
      const ticket = ticketValue || await fetchTicket(attempt > 0);
      let out;
      try {
        out = await backend.callFunction('lingtian', { ticket, path: pathname, query, body: body === undefined ? null : body,
          ...(role === 'preview' ? { previewSect: previewSect() } : {}) });
      } catch (error) {
        throw fail(503, 'network', '云端暂时没有回应，请检查网络后重试；已有灵田进度保存在服务器。');
      }
      if (out && out.body && out.body.code === 'ticket_expired' && attempt === 0) {
        ticketValue = null;
        try { sessionStorage.removeItem(KEY); } catch (error) { /* 忽略 */ }
        continue;
      }
      return out || { status: 503, body: { ok: false, code: 'no_response', message: '云端暂时没有回应，请稍后再试。' } };
    }
    return { status: 401, body: { ok: false, code: 'ticket_expired', message: REASONS.ticket_expired[1] } };
  }

  function explain(error) {
    const reason = REASONS[error && error.code];
    if (reason) return { title: reason[0], text: error.message || reason[1] };
    if (error && error.status === 401) return { title: REASONS.login[0], text: REASONS.login[1] };
    return null;
  }

  // 从课程页面“进入云间灵田”是新开的标签页（只有这一页历史，可以由脚本关闭）：关掉回到课程页面；否则后退
  function goBack() {
    if (history.length <= 1) { global.close(); setTimeout(() => { if (!global.closed) location.href = '/'; }, 300); return; }
    history.back();
  }

  // ---------- 弹窗（道号、修炼场答题） ----------
  // 用原生 <dialog> 的 showModal()：游戏自己的面板（云间道友、宗门等）也是模态 dialog，处在浏览器的顶层；
  // 普通 div 再高的 z-index 也会被盖住且点不动，后打开的模态 dialog 才能叠在它上面。Esc 不关（要用按钮作答或放弃）。
  let layer = null;
  function openLayer(html, className) {
    closeLayer();
    layer = document.createElement('dialog');
    layer.className = `lt-layer ${className || ''}`;
    layer.innerHTML = `<div class="lt-card">${html}</div>`;
    layer.addEventListener('cancel', (event) => event.preventDefault());
    document.body.appendChild(layer);
    try { layer.showModal(); } catch (error) { layer.setAttribute('open', ''); }
    return layer;
  }
  function closeLayer() { if (layer) { try { layer.close(); } catch (error) { /* 已关 */ } layer.remove(); layer = null; } }
  function toastOf(engine) { return (text, type) => { try { global.SpiritToast ? global.SpiritToast(text, type) : null; } catch (error) { /* 忽略 */ } }; }

  // 文明取名的提醒（云函数 /api/profile 也给同样的话；2026-11-15 用户：“填写道号的时候也要提醒学生文明取名，否则会被销号”）
  let aliasRule = '请文明取名：不能用真实姓名，不能用国家领导人的姓名、称谓（含谐音、拼音、缩写），不能有辱骂、低俗、色情、政治敏感等字词；道号不文明的，老师会销号。';
  async function askAlias(current, force) {
    return new Promise((resolve) => {
      const node = openLayer(`<p class="lt-eyebrow">云 间 灵 田</p><h2>给自己起个道号</h2>
        <p class="lt-note">道友们看到的是道号（2—12 个汉字、字母或数字），老师在工作台能对上是谁。</p>
        <p class="lt-rule" role="note"><b>文明取名</b>${esc(aliasRule.replace(/^请文明取名：/, ''))}</p>
        <label class="lt-field"><span>道号</span><input type="text" maxlength="12" autocomplete="off" spellcheck="false" placeholder="比如：青云客" value="${esc(force ? '' : current || '')}"></label>
        <p class="lt-status" role="status"></p>
        <div class="lt-actions"><button type="button" class="lt-btn lt-primary" data-lt-save>定下道号</button>${force ? '' : '<button type="button" class="lt-btn" data-lt-skip>以后再说</button>'}</div>`, 'lt-alias');
      const input = node.querySelector('input'), status = node.querySelector('.lt-status');
      input.focus();
      const save = async () => {
        const alias = input.value.trim();
        if (!alias) { status.textContent = '先写一个道号。'; return; }
        status.textContent = '正在登记……';
        const out = await request('/api/profile', { action: 'setAlias', alias }).catch((error) => ({ status: 503, body: { message: error.message } }));
        if (out.status === 200 && out.body && out.body.ok) { closeLayer(); resolve(out.body.alias); }
        else status.textContent = (out.body && out.body.message) || '暂时没登记上，请稍后再试。';
      };
      node.querySelector('[data-lt-save]').addEventListener('click', save);
      input.addEventListener('keydown', (event) => { if (event.key === 'Enter') save(); });
      const skip = node.querySelector('[data-lt-skip]');
      if (skip) skip.addEventListener('click', () => { closeLayer(); resolve(null); });
    });
  }

  let rules = null;
  async function afterBoot(engine) {
    let profile = null;
    try { const out = await request('/api/profile'); profile = out && out.status === 200 ? out.body : null; } catch (error) { profile = null; }
    if (profile) {
      rules = profile.rules || null;
      if (rules && rules.alias) aliasRule = rules.alias;
      applyRealmTip(profile);
      if (profile.needsAlias) {
        const alias = await askAlias(engine.player && engine.player.alias, true);
        if (alias) { try { await engine.refresh(); } catch (error) { /* 下次刷新再更新 */ } }
      }
      if (profile.observer) observerNote();
    }
    addAliasEntry(engine);
  }

  // 学生版测试身份（王不凡）：境界旁标“测试 · 只看”，修为说明里写明规则；这次打开第一次进入时弹一次说明（有题目弹窗时不打扰）
  const OBSERVER_TEXT = '测试身份（王不凡）只看不交换：自己的灵田照常种、收、炼丹、开道藏、参悟；坊市和卡牌坊市只能看，不能挂单买卖、上架购买；可以拜访道友、看他们的灵田，不能偷采；宗门可以看，不能捐献材料。道友和同门都看不到你，也不计入任何统计。';
  function observerNote() {
    document.documentElement.classList.add('lt-observer');
    const realm = document.getElementById('fullscreen-realm');
    if (realm && !document.querySelector('.lt-observer-tag')) {
      const tag = document.createElement('em');
      tag.className = 'lt-observer-tag'; tag.textContent = '测试 · 只看'; tag.title = OBSERVER_TEXT;
      realm.insertAdjacentElement('afterend', tag);
    }
    const tip = document.querySelector('.cultivation-tip');
    if (tip && !tip.textContent.includes('只看不交换')) tip.textContent += ` ${OBSERVER_TEXT}`;
    let seen = false;
    try { seen = sessionStorage.getItem('lingtian-observer-seen') === '1'; } catch (error) { seen = false; }
    if (seen || layer) return;
    try { sessionStorage.setItem('lingtian-observer-seen', '1'); } catch (error) { /* 忽略 */ }
    const node = openLayer(`<p class="lt-eyebrow">学 生 版 测 试</p><h2>王不凡 · 只看不交换</h2><p class="lt-note">${esc(OBSERVER_TEXT)}</p>
      <div class="lt-actions"><button type="button" class="lt-btn lt-primary" data-lt-close>知道了</button></div>`, 'lt-observer-intro');
    node.querySelector('[data-lt-close]').addEventListener('click', closeLayer);
  }

  // 境界以课程网站为准：游戏里原来的修为进度、突破按钮隐藏（见 lingtian-bridge.css），说明换成服丹折算网站修为的规则
  function applyRealmTip(profile) {
    const tip = document.querySelector('.cultivation-tip');
    const pill = (profile.rules && profile.rules.pill) || { divisor: 10, daily: 3, weekly: 15, termRatio: 0.10 };
    const each = (qi) => (Math.round(qi / (pill.divisor || 10) * 10) / 10).toFixed(1);   // 养元丹 3 修为 … 九转玄元丹 30 修为
    if (tip) tip.textContent = `境界以课程网站的修为境界为准（现在是${['炼气', '筑基', '结丹', '元婴', '化神'][profile.realm] || '炼气'}）。服丹可折算网站修为：丹药修为 ÷ ${pill.divisor || 10}（每颗 ${each(3)}—${each(30)}），每天最多 ${pill.daily}、每周最多 ${pill.weekly}，整学期最多为满分的 ${Math.round(pill.termRatio * 100)}%，老师结算修为时计入。`;
    document.documentElement.classList.add('lt-site-realm');
  }

  // 设置里加“改道号”
  function addAliasEntry(engine) {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-lt-rename]');
      if (!target) return;
      event.preventDefault();
      askAlias(engine.player && engine.player.alias, false).then((alias) => { if (alias) engine.refresh(); });
    });
    const observer = new MutationObserver(() => {
      const box = document.querySelector('#game-dialog .settings-actions');
      if (box && !box.querySelector('[data-lt-rename]')) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'button button-quiet'; button.setAttribute('data-lt-rename', '');
        button.textContent = '改道号';
        box.appendChild(button);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- 修炼场答题 ----------
  let quizShown = null, quizTimer = 0;
  const LETTERS = 'ABCDEF';
  function onQuiz(quiz, api) {
    if (!quiz || !quiz.id || quizShown === quiz.id) return;
    quizShown = quiz.id;
    const refresh = quiz.purpose === 'refresh';
    const node = openLayer(`<p class="lt-eyebrow">修 炼 场 · ${esc(quiz.subject || '课堂题目')}</p>
      <h2>答对才能${esc(quiz.purposeText || '继续')}</h2>
      <p class="lt-stem">${esc(quiz.stem)}</p>
      <div class="lt-options">${quiz.options.map((option, i) => `<button type="button" class="lt-option" data-lt-option="${esc(option.id)}"><b>${LETTERS[i] || i + 1}</b><span>${esc(option.text)}</span></button>`).join('')}</div>
      <p class="lt-status" role="status"></p>
      <div class="lt-actions"><span class="lt-timer" data-lt-timer></span><button type="button" class="lt-btn" data-lt-abandon>先不答了</button></div>`, 'lt-quiz');
    const status = node.querySelector('.lt-status'), timer = node.querySelector('[data-lt-timer]');
    clearInterval(quizTimer);
    const tick = () => {
      const left = Math.max(0, Math.round((quiz.expiresAt - Date.now()) / 1000));
      timer.textContent = left > 0 ? `还剩 ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '已到时';
    };
    tick(); quizTimer = setInterval(tick, 1000);
    const lock = (on) => node.querySelectorAll('button').forEach((button) => { button.disabled = on; });
    const finish = (result) => {
      clearInterval(quizTimer);
      const review = result && result.review;
      if (review) {
        node.querySelectorAll('[data-lt-option]').forEach((button) => {
          button.disabled = true;
          if (button.dataset.ltOption === review.correctOptionId) button.classList.add('is-right');
          else if (button.dataset.ltOption === review.selectedOptionId) button.classList.add('is-wrong');
        });
      }
      const passed = result && (result.quizPassed || (result.ok && result.type === 'batch'));
      status.className = `lt-status ${passed ? 'is-ok' : 'is-bad'}`;
      status.innerHTML = `${esc((result && result.message) || (passed ? '答对了！' : '这次没有答对。'))}${review && review.explanation ? `<span class="lt-explain">解析：${esc(review.explanation)}</span>` : ''}`;
      const actions = node.querySelector('.lt-actions');
      actions.innerHTML = '<button type="button" class="lt-btn lt-primary" data-lt-close>知道了</button>';
      actions.querySelector('[data-lt-close]').addEventListener('click', () => { closeLayer(); quizShown = null; });
    };
    node.querySelectorAll('[data-lt-option]').forEach((button) => button.addEventListener('click', async () => {
      lock(true); status.textContent = '正在核对……';
      const result = refresh ? await api.answerRefresh(quiz.id, button.dataset.ltOption) : await api.answerQuiz(quiz.id, button.dataset.ltOption);
      if (result && result.pending) { status.textContent = result.message || '还没确认，请稍后同步。'; lock(false); return; }
      finish(result);
    }));
    node.querySelector('[data-lt-abandon]').addEventListener('click', async () => {
      lock(true);
      const result = refresh ? await api.abandonRefresh(quiz.id) : await api.abandonQuiz(quiz.id);
      finish(result);
    });
  }

  global.LingtianBridge = { request, explain, goBack, afterBoot, onQuiz, askAlias, get rules() { return rules; }, room };
})(window);
