/* 教师工作台“锁定”（2026-10-29 用户：“教师工作台右上角增加一个锁定按钮，点击后可以输入一个四位数临时密码进入锁定页面，再次输入这个临时密码即可解锁。
 * 可以用类似于猜词游戏的背景那种虚化效果。这样可以方便教师短暂离开教室的时候，不会被学生看到工作台的内容。”
 * 同日：“控制台锁定以后，其它页面没有同时锁定啊”——除工作台外，投屏页、学生页、复习资料页也加载本脚本，一起锁、一起解）
 *   · 工作台右上角“锁定”：输两次四位数临时密码 → 全屏虚化的锁定页（时间、数字键盘），在任何一页输入同一密码，所有页面一起解锁；
 *   · 锁定状态只存在本机浏览器（加盐散列，不存密码本身）：刷新、关掉重开、本浏览器里打开的本站其他页面都保持锁定；
 *     学生自己的设备上没有锁定状态，本脚本什么也不做；
 *   · 连错 5 次要等 30 秒，之后每再错 5 次等待翻倍（最长 10 分钟）；
 *   · 忘了临时密码：锁定页点“忘记临时密码”→ 清掉锁定和“记住密码”、退出登录，所有页面重新载入，要重新输入教师密码、登录教师账号。
 *   只防短暂离开时被人看到、点到，工作台的数据仍靠教师账号登录保护。
 * 脚本放在 <head> 里同步执行：锁着时先把页面藏起来，锁定页出来后再露出虚化的背景，刷新时不会闪出内容。
 */
(function () {
  'use strict';
  const KEY = 'classlive-teacher-lock';
  const RESET = 'classlive-teacher-lock-reset';
  const WAIT = { every: 5, first: 30000, max: 600000 };
  const WEEK = '日一二三四五六';
  const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V7.8a3.5 3.5 0 017 0v2.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  let memory = null;  // 浏览器不让用本地存储（无痕模式等）时，只在本页锁定
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (error) { return null; } };
  const current = () => read() || memory;
  const save = (value) => {
    // 能存就只看本地存储（其他页面解锁时本页才跟着解锁）；存不了才记在本页
    try { if (value) localStorage.setItem(KEY, JSON.stringify(value)); else localStorage.removeItem(KEY); memory = null; } catch (error) { memory = value; }
  };

  // 各页面自己的样式（按钮、标题、对话框）不能影响锁定页：锁定页里的元素都先重置再写样式
  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
  const style = document.createElement('style');
  style.dataset.readable = 'skip';   // 投屏页、学生页的字号脚本（live-readable.js）不放大锁定页
  style.textContent = `
  html.tw-locking body > :not(dialog.tw-lock) { visibility: hidden !important; }
  dialog.tw-lock { position: fixed; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 24px; box-sizing: border-box;
    border: 0; border-radius: 0; box-shadow: none; overflow: auto; color: #fff; font: 16px/1.5 ${FONT}; text-align: center; outline: none; transform: none; opacity: 1; animation: none;
    background: radial-gradient(circle at 50% 12%, rgba(232, 196, 106, .18), transparent 48%), rgba(16, 32, 30, .74);
    -webkit-backdrop-filter: blur(26px) saturate(.7); backdrop-filter: blur(26px) saturate(.7); }
  dialog.tw-lock[open] { display: flex; }
  dialog.tw-lock::backdrop { background: transparent; }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { dialog.tw-lock { background: #15302c; } }
  .tw-lock * { box-sizing: border-box; font-family: ${FONT}; letter-spacing: normal; text-transform: none; }
  .tw-lock p, .tw-lock h2 { margin: 0; padding: 0; color: inherit; background: none; border: 0; }
  .tw-lock button { all: unset; box-sizing: border-box; display: inline-grid; place-items: center; font-family: ${FONT}; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .tw-lock-card { width: min(380px, 100%); margin: auto; }
  .tw-lock-icon { width: 64px; height: 64px; margin: 0 auto 16px; display: grid; place-items: center; border-radius: 50%; color: #3b2a07;
    background: linear-gradient(180deg, #f6dc98, #dcb253); box-shadow: 0 0 0 6px rgba(246, 220, 152, .16), 0 12px 30px rgba(0, 0, 0, .28); }
  .tw-lock-icon svg { width: 30px; height: 30px; }
  .tw-lock .tw-lock-time { font-size: 64px; font-weight: 800; line-height: 1; letter-spacing: .02em; font-variant-numeric: tabular-nums; }
  .tw-lock .tw-lock-date { margin: 8px 0 20px; color: rgba(255, 255, 255, .72); font-size: 15px; }
  .tw-lock h2 { font-size: 22px; font-weight: 800; line-height: 1.4; letter-spacing: .04em; }
  .tw-lock .tw-lock-note { margin: 6px 0 20px; color: rgba(255, 255, 255, .72); font-size: 14px; text-wrap: balance; }
  .tw-lock-dots { display: flex; justify-content: center; gap: 18px; margin-bottom: 10px; }
  .tw-lock-dots i { width: 16px; height: 16px; border: 2px solid rgba(255, 255, 255, .78); border-radius: 50%; transition: background .12s ease; }
  .tw-lock-dots i.is-on { border-color: #fff; background: #fff; }
  .tw-lock-dots.is-wrong { animation: tw-lock-shake .42s ease; }
  .tw-lock-dots.is-wrong i { border-color: #ffb59d; }
  @keyframes tw-lock-shake { 0%, 100% { transform: none; } 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }
  .tw-lock .tw-lock-msg { min-height: 21px; margin: 0 0 12px; color: #ffcdbd; font-size: 14px; font-weight: 700; }
  .tw-lock-pad { display: grid; grid-template-columns: repeat(3, 72px); justify-content: center; gap: 14px 24px; }
  .tw-lock-pad button { width: 72px; height: 72px; border: 1px solid rgba(255, 255, 255, .26); border-radius: 50%; color: #fff; background: rgba(255, 255, 255, .1);
    font-size: 28px; font-weight: 600; line-height: 1; transition: background .15s ease, transform .08s ease; }
  .tw-lock-pad button:hover { background: rgba(255, 255, 255, .2); }
  .tw-lock-pad button:active { background: rgba(255, 255, 255, .32); transform: scale(.96); }
  .tw-lock-pad button.is-small { border-color: transparent; background: transparent; font-size: 16px; font-weight: 700; }
  .tw-lock-pad button.is-small:hover { background: rgba(255, 255, 255, .12); }
  .tw-lock-pad button:disabled { opacity: .35; cursor: default; transform: none; }
  .tw-lock button:focus-visible { box-shadow: 0 0 0 3px rgba(246, 220, 152, .7); }
  .tw-lock .tw-lock-forgot { margin-top: 22px; padding: 4px 8px; border-radius: 6px; color: rgba(255, 255, 255, .7); font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .tw-lock .tw-lock-forgot:hover { color: #fff; }
  .tw-lock .tw-lock-forgot[hidden], .tw-lock-out[hidden] { display: none; }
  .tw-lock-out { margin-top: 18px; padding: 14px 16px; border-radius: 14px; background: rgba(255, 255, 255, .1); font-size: 14px; line-height: 1.6; }
  .tw-lock-out p { margin-bottom: 10px; text-wrap: balance; }
  .tw-lock-out div { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .tw-lock-out button { padding: 10px 18px; border: 1.5px solid rgba(255, 255, 255, .5); border-radius: 9px; color: #fff; font-size: 15px; font-weight: 800; line-height: 1; }
  .tw-lock-out button.is-main { border-color: #e8c46a; color: #3b2a07; background: linear-gradient(180deg, #f6dc98, #dcb253); }
  .tw-lock-card.is-forgot .tw-lock-dots, .tw-lock-card.is-forgot .tw-lock-msg, .tw-lock-card.is-forgot .tw-lock-pad { display: none; }
  @media (max-height: 700px) {
    .tw-lock .tw-lock-time { font-size: 48px; } .tw-lock .tw-lock-date { margin-bottom: 12px; }
    .tw-lock-pad { gap: 10px 20px; grid-template-columns: repeat(3, 62px); } .tw-lock-pad button { width: 62px; height: 62px; font-size: 24px; }
  }
  @media print { dialog.tw-lock { display: none !important; } }`;
  document.head.appendChild(style);
  if (current()) document.documentElement.classList.add('tw-locking');

  async function digest(salt, pin) {
    const text = `${salt}:${pin}`;
    if (window.crypto && crypto.subtle) {
      const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
    }
    let hash = 0;
    for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return `x${hash}`;
  }
  const newSalt = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

  // ---------- 锁定页（要用时才建） ----------
  let lock = null;
  let setter = null;
  let typed = '';
  let checking = false;
  let tick = null;
  let resetting = false;
  const $ = (selector) => lock.querySelector(selector);

  function build() {
    lock = document.createElement('dialog');
    lock.className = 'tw-lock';
    lock.tabIndex = -1;
    lock.setAttribute('autofocus', '');
    lock.setAttribute('aria-label', '页面已锁定');
    lock.innerHTML = `<div class="tw-lock-card">
        <div class="tw-lock-icon">${LOCK_ICON}</div>
        <p class="tw-lock-time" data-lock-time></p>
        <p class="tw-lock-date" data-lock-date></p>
        <h2>${document.querySelector('[data-lock]') ? '工作台已锁定' : '页面已锁定'}</h2>
        <p class="tw-lock-note">老师暂时离开，请勿操作。输入四位临时密码解锁。</p>
        <div class="tw-lock-dots" data-lock-dots aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <p class="tw-lock-msg" data-lock-msg role="alert"></p>
        <div class="tw-lock-pad" data-lock-pad>
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-key="${n}">${n}</button>`).join('')}
          <button type="button" class="is-small" data-key="clear">清空</button><button type="button" data-key="0">0</button><button type="button" class="is-small" data-key="back" aria-label="删除一位">⌫</button>
        </div>
        <button type="button" class="tw-lock-forgot" data-lock-forgot>忘记临时密码？</button>
        <div class="tw-lock-out" data-lock-out hidden>
          <p>本机所有页面会重新载入，要重新输入教师密码、登录教师账号，锁定就解除了。</p>
          <div><button type="button" class="is-main" data-lock-logout>退出登录</button><button type="button" data-lock-back>返回</button></div>
        </div>
      </div>`;
    document.body.appendChild(lock);
    $('[data-lock-pad]').addEventListener('click', (event) => {
      const button = event.target.closest('[data-key]');
      if (button) press(button.dataset.key);
    });
    lock.addEventListener('cancel', (event) => event.preventDefault());
    // 浏览器连按 Esc 时可能强行关掉对话框：只要还锁着就重新打开
    lock.addEventListener('close', () => { if (current()) setTimeout(showLock, 0); });
    $('[data-lock-forgot]').addEventListener('click', () => forgetting(true));
    $('[data-lock-back]').addEventListener('click', () => forgetting(false));
    $('[data-lock-logout]').addEventListener('click', forgotPin);
  }

  // “忘记临时密码”：数字键盘换成退出登录的说明，屏幕矮时也不用往下翻
  function forgetting(on) {
    $('.tw-lock-card').classList.toggle('is-forgot', on);
    $('[data-lock-out]').hidden = !on;
    $('[data-lock-forgot]').hidden = on;
  }
  function forgotPin() {
    // 先通知其他页面重新载入（它们收到就刷新，不会因为锁定被清掉而露出内容），再清掉锁定和“记住密码”
    resetting = true;
    try {
      localStorage.setItem(RESET, String(Date.now()));
      localStorage.removeItem('staticrypt_passphrase');
      localStorage.removeItem('staticrypt_expiration');
    } catch (error) { /* 无痕模式等 */ }
    save(null);
    // 锁定页先不撤：工作台的“退出登录”会刷新页面；投屏页、学生页先退出教师账号再重新载入（最多等 3 秒）
    const logout = document.querySelector('[data-logout]');
    if (logout) { logout.click(); return; }
    const config = window.CLASS_LIVE_CONFIG;
    let out = Promise.resolve();
    try { if (window.ClassLive && config && config.provider !== 'off') out = window.ClassLive.create(config).signOut(); } catch (error) { /* 照样重新载入 */ }
    Promise.race([out, new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {}).then(() => location.reload());
  }

  function paintClock() {
    const now = new Date();
    $('[data-lock-time]').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    $('[data-lock-date]').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期${WEEK[now.getDay()]}`;
    const state = current();
    const wait = state && state.until > Date.now() ? Math.ceil((state.until - Date.now()) / 1000) : 0;
    lock.querySelectorAll('[data-lock-pad] button').forEach((button) => { button.disabled = wait > 0; });
    if (wait > 0) $('[data-lock-msg]').textContent = `连续输错 ${state.fails} 次，请 ${wait >= 60 ? `${Math.ceil(wait / 60)} 分钟` : `${wait} 秒`}后再试。`;
    else if (/后再试/.test($('[data-lock-msg]').textContent)) $('[data-lock-msg]').textContent = '';
  }
  function paintDots(wrong) {
    lock.querySelectorAll('[data-lock-dots] i').forEach((dot, i) => dot.classList.toggle('is-on', i < typed.length));
    const dots = $('[data-lock-dots]');
    dots.classList.remove('is-wrong');
    if (wrong) { void dots.offsetWidth; dots.classList.add('is-wrong'); }
  }

  function showLock() {
    if (!document.body) return;
    if (!lock) build();
    if (!lock.open) {
      if (setter && setter.open) setter.close();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      lock.showModal();
    }
    document.documentElement.classList.remove('tw-locking');
    typed = '';
    forgetting(false);
    paintDots(false);
    paintClock();
    clearInterval(tick);
    tick = setInterval(paintClock, 1000);
    lock.focus();
  }
  function hideLock() {
    document.documentElement.classList.remove('tw-locking');
    if (!lock) return;
    clearInterval(tick);
    $('[data-lock-msg]').textContent = '';
    if (lock.open) lock.close();
  }

  async function press(key) {
    const state = current();
    if (!state || checking || state.until > Date.now()) return;
    if (key === 'back') typed = typed.slice(0, -1);
    else if (key === 'clear') typed = '';
    else if (/^\d$/.test(key) && typed.length < 4) typed += key;
    paintDots(false);
    if (typed.length < 4) return;
    checking = true;
    const ok = (await digest(state.salt, typed)) === state.hash;
    checking = false;
    typed = '';
    if (ok) { save(null); hideLock(); return; }
    const fails = (state.fails || 0) + 1;
    const rounds = Math.floor(fails / WAIT.every);
    const until = fails % WAIT.every === 0 ? Date.now() + Math.min(WAIT.max, WAIT.first * 2 ** (rounds - 1)) : 0;
    save({ ...state, fails, until });
    paintDots(true);
    const left = WAIT.every - (fails % WAIT.every);
    $('[data-lock-msg]').textContent = until ? '' : `临时密码不对${left < WAIT.every ? `，再错 ${left} 次要等一会儿` : ''}。`;
    paintClock();
  }

  // 锁定时键盘只用来输密码：数字、退格；Esc 等其他按键不传给页面（投屏页的翻页键等）
  window.addEventListener('keydown', (event) => {
    if (!lock || !lock.open) return;
    event.stopImmediatePropagation();
    if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); press('back'); }
    else if (event.key === 'Escape') event.preventDefault();
  }, true);
  // 本浏览器里打开的本站其他页面：一处锁定，处处锁定；一处解锁，处处解锁；有人点了“忘记临时密码”，都重新载入
  window.addEventListener('storage', (event) => {
    if (event.key === RESET && event.newValue) { resetting = true; location.reload(); return; }
    if (event.key !== KEY || resetting) return;
    if (event.newValue) showLock(); else hideLock();
  });

  // ---------- 工作台：设置临时密码 ----------
  function buildSetter() {
    setter = document.createElement('dialog');
    setter.className = 'tw-dialog tw-lock-set';
    setter.setAttribute('aria-label', '锁定工作台');
    setter.innerHTML = `<form data-lock-form>
        <h2>锁定工作台</h2>
        <p class="tw-hint">短暂离开教室时用：设一个四位数临时密码，回来后输入同一密码解锁。本浏览器里打开的投屏页、学生页也一起锁定；刷新页面、重新打开也仍是锁定的。</p>
        <div class="tw-lock-pins">
          <label>临时密码<input type="text" name="pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="四位数字"></label>
          <label>再输一次<input type="text" name="again" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="四位数字"></label>
        </div>
        <p class="tw-error" data-lock-error role="alert"></p>
        <div class="tw-actions"><button type="submit" class="tw-primary">锁定</button><button type="button" class="tw-secondary" data-lock-cancel>取消</button></div>
      </form>`;
    document.body.appendChild(setter);
    const form = setter.querySelector('[data-lock-form]');
    const error = setter.querySelector('[data-lock-error]');
    form.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); }));
    setter.querySelector('[data-lock-cancel]').addEventListener('click', () => setter.close());
    setter.addEventListener('close', () => { form.reset(); error.textContent = ''; });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const pin = form.elements.pin.value;
      if (!/^\d{4}$/.test(pin)) { error.textContent = '请输入四位数字。'; form.elements.pin.focus(); return; }
      if (form.elements.again.value !== pin) { error.textContent = '两次输入的不一样，请再输一次。'; form.elements.again.value = ''; form.elements.again.focus(); return; }
      const salt = newSalt();
      save({ salt, hash: await digest(salt, pin), at: Date.now(), fails: 0, until: 0 });
      setter.close();
      showLock();
    });
    return setter;
  }
  const openSetter = () => {
    (setter || buildSetter()).showModal();
    setter.querySelector('[name=pin]').focus();
  };

  function init() {
    document.querySelectorAll('[data-lock]').forEach((button) => button.addEventListener('click', openSetter));
    if (current()) showLock();
  }
  if (document.body && document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  window.ClassLiveLock = { lock: openSetter, locked: () => Boolean(current()) };
})();
