/* 教师工作台“锁定”（2026-10-29 用户：“教师工作台右上角增加一个锁定按钮，点击后可以输入一个四位数临时密码进入锁定页面，再次输入这个临时密码即可解锁。
 * 可以用类似于猜词游戏的背景那种虚化效果。这样可以方便教师短暂离开教室的时候，不会被学生看到工作台的内容。”）
 *   · 右上角“锁定”：输两次四位数临时密码 → 全屏虚化的锁定页（时间、数字键盘），输入同一密码解锁；
 *   · 锁定状态只存在本机浏览器（加盐散列，不存密码本身）：刷新、关掉重开、本浏览器里其他工作台标签页都保持锁定；
 *   · 连错 5 次要等 30 秒，之后每再错 5 次等待翻倍（最长 10 分钟）；
 *   · 忘了临时密码：锁定页点“忘记临时密码”→ 退出登录，再用教师账号和密码登录即可（锁定随之解除）。
 *   只防短暂离开时被人看到、点到，工作台的数据仍靠教师账号登录保护。
 */
(function () {
  'use strict';
  const KEY = 'classlive-teacher-lock';
  const WAIT = { every: 5, first: 30000, max: 600000 };
  const WEEK = '日一二三四五六';
  const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.5 10.5V7.8a3.5 3.5 0 017 0v2.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
  let memory = null;  // 浏览器不让用本地存储（无痕模式等）时，只在本页锁定
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (error) { return null; } };
  const current = () => read() || memory;
  const save = (value) => {
    memory = value;
    try { if (value) localStorage.setItem(KEY, JSON.stringify(value)); else localStorage.removeItem(KEY); } catch (error) { /* 见 memory */ }
  };

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

  // ---------- 设置临时密码 ----------
  const setter = document.createElement('dialog');
  setter.className = 'tw-dialog tw-lock-set';
  setter.setAttribute('aria-label', '锁定工作台');
  setter.innerHTML = `<form data-lock-form>
      <h2>锁定工作台</h2>
      <p class="tw-hint">短暂离开教室时用：设一个四位数临时密码，回来后输入同一密码解锁。锁定后刷新页面、重新打开也仍是锁定的。</p>
      <div class="tw-lock-pins">
        <label>临时密码<input type="text" name="pin" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="四位数字"></label>
        <label>再输一次<input type="text" name="again" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="四位数字"></label>
      </div>
      <p class="tw-error" data-lock-error role="alert"></p>
      <div class="tw-actions"><button type="submit" class="tw-primary">锁定</button><button type="button" class="tw-secondary" data-lock-cancel>取消</button></div>
    </form>`;
  document.body.appendChild(setter);
  const form = setter.querySelector('[data-lock-form]');
  form.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); }));
  setter.querySelector('[data-lock-cancel]').addEventListener('click', () => setter.close());
  setter.addEventListener('close', () => { form.reset(); setter.querySelector('[data-lock-error]').textContent = ''; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = form.elements.pin.value;
    const error = setter.querySelector('[data-lock-error]');
    if (!/^\d{4}$/.test(pin)) { error.textContent = '请输入四位数字。'; form.elements.pin.focus(); return; }
    if (form.elements.again.value !== pin) { error.textContent = '两次输入的不一样，请再输一次。'; form.elements.again.value = ''; form.elements.again.focus(); return; }
    const salt = newSalt();
    save({ salt, hash: await digest(salt, pin), at: Date.now(), fails: 0, until: 0 });
    setter.close();
    showLock();
  });
  document.querySelectorAll('[data-lock]').forEach((button) => button.addEventListener('click', () => {
    setter.showModal();
    form.elements.pin.focus();
  }));

  // ---------- 锁定页 ----------
  const lock = document.createElement('dialog');
  lock.className = 'tw-lock';
  lock.setAttribute('aria-label', '工作台已锁定');
  lock.tabIndex = -1;
  lock.setAttribute('autofocus', '');
  lock.innerHTML = `<div class="tw-lock-card">
      <div class="tw-lock-icon">${LOCK_ICON}</div>
      <p class="tw-lock-time" data-lock-time></p>
      <p class="tw-lock-date" data-lock-date></p>
      <h2>工作台已锁定</h2>
      <p class="tw-lock-note">老师暂时离开，请勿操作。输入四位临时密码解锁。</p>
      <div class="tw-lock-dots" data-lock-dots aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <p class="tw-lock-msg" data-lock-msg role="alert"></p>
      <div class="tw-lock-pad" data-lock-pad>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-key="${n}">${n}</button>`).join('')}
        <button type="button" class="is-small" data-key="clear">清空</button><button type="button" data-key="0">0</button><button type="button" class="is-small" data-key="back" aria-label="删除一位">⌫</button>
      </div>
      <button type="button" class="tw-lock-forgot" data-lock-forgot>忘记临时密码？</button>
      <div class="tw-lock-out" data-lock-out hidden>
        <p>退出登录后，用教师账号和密码重新登录，锁定就解除了。</p>
        <div class="tw-actions"><button type="button" class="tw-primary" data-lock-logout>退出登录</button><button type="button" class="tw-secondary" data-lock-back>返回</button></div>
      </div>
    </div>`;
  document.body.appendChild(lock);
  const $ = (selector) => lock.querySelector(selector);
  let typed = '';
  let checking = false;
  let tick = null;

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
    if (!lock.open) {
      if (setter.open) setter.close();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      lock.showModal();
    }
    typed = '';
    forgetting(false);
    paintDots(false);
    paintClock();
    clearInterval(tick);
    tick = setInterval(paintClock, 1000);
    lock.focus();
  }
  function hideLock() {
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

  $('[data-lock-pad]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-key]');
    if (button) press(button.dataset.key);
  });
  // 锁定时键盘只用来输密码：数字、退格；Esc 等其他按键不传给工作台
  window.addEventListener('keydown', (event) => {
    if (!lock.open) return;
    event.stopImmediatePropagation();
    if (/^\d$/.test(event.key)) { event.preventDefault(); press(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); press('back'); }
    else if (event.key === 'Escape') event.preventDefault();
  }, true);
  lock.addEventListener('cancel', (event) => event.preventDefault());
  // 浏览器连按 Esc 时可能强行关掉对话框：只要还锁着就重新打开
  lock.addEventListener('close', () => { if (current()) setTimeout(showLock, 0); });
  // “忘记临时密码”：数字键盘换成退出登录的说明，屏幕矮时也不用往下翻
  const forgetting = (on) => {
    $('.tw-lock-card').classList.toggle('is-forgot', on);
    $('[data-lock-out]').hidden = !on;
    $('[data-lock-forgot]').hidden = on;
  };
  $('[data-lock-forgot]').addEventListener('click', () => forgetting(true));
  $('[data-lock-back]').addEventListener('click', () => forgetting(false));
  $('[data-lock-logout]').addEventListener('click', () => {
    // 锁定页先不撤：退出登录会刷新页面，刷新后要重新登录才能看到工作台
    save(null);
    const logout = document.querySelector('[data-logout]');
    if (logout) logout.click(); else location.reload();
  });
  // 同一浏览器的其他工作台标签页：一处锁定，处处锁定；一处解锁，处处解锁
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    if (event.newValue) showLock(); else hideLock();
  });

  if (current()) showLock();
  window.ClassLiveLock = { lock: () => setter.showModal(), locked: () => Boolean(current()) };
})();
