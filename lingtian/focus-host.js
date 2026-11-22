/* 云间灵田 · 进修（静修）入口（2026-11-22，接入“云间灵田进修模块 1.0.0（功能基线 v93）”，模块文件在 focus-1.0.0/）。
 * 用户：“请把附件中的进修模块接入我现有的灵田游戏，不要改动现有灵田游戏的其它部分内容……接好进修入口、在线接口、头像联动与数据库迁移。”
 * 1. 入口：底栏“静修”。打开时暂停灵田的 3D 场景和每 30 秒一次的云端刷新（app.js 看 body[data-focus-open]），返回灵田后恢复；
 *    静修自己的计时只在前台走，返回灵田即暂停、不会自动继续（模块规则）。
 * 2. 账号：用灵田连上云端后拿到的账号摘要（accountKey，学号账号的 SHA-256 摘要，只用来核对“还是不是同一个人”，不是凭证）；
 *    静修的每个请求经 LingtianBridge 走云函数 lingtian 的 /api/focus，凭证照旧是课堂登录换来的，浏览器自报的学号、班级一律不认。
 *    模块要求不改写全局 fetch：这里只把模块自己的 fetch 换成走云函数（api.fetch）。
 * 3. 头像联动：性别与四位化身（玉衣书生、桃衣剑修、云岚丹师、墨衣游侠）存在灵田（/api/profile 的 setIdentity），静修跟着用；
 *    在静修里置办、穿上的衣装显示在灵田左上角的头像上（模块 onAppearance，只做显示，不写余额）。还没选头像时左上角照旧是境界字。
 * 4. 模块文件只在需要时加载（点“静修”，或已选过头像时等灵田进入以后在空闲时加载，用来画左上角头像）。
 * 5. 离线练习版（file:// 打开的灵田）用模块的离线模式，记录只存在这台电脑的浏览器里。
 */
(function (global) {
  'use strict';
  const document = global.document;
  const BASE = new URL('focus-1.0.0/', document.currentScript ? document.currentScript.src : global.location.href).href;
  const ADAPTER = BASE + 'adapters/browser/focus-module.js';
  const ASSETS = BASE + 'frontend/';
  const EMPTY = { gender: null, avatarId: null, profileChosen: false };
  const state = { module: null, creating: null, identity: { ...EMPTY }, equipped: null, profileSeen: false, opening: false };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const host = () => global.LingtianHost || null;
  const toast = (message, type) => { try { host() && host().toast(message, type === 'error' ? 'error' : 'info'); } catch (_) { /* 提示失败不影响静修 */ } };
  const online = () => !!(host() && host().engine && host().engine.online);

  // ---------- 资源 ----------
  let adapterLoading = null;
  function loadAdapter() {
    if (global.YunjianFocusModule) return Promise.resolve();
    if (adapterLoading) return adapterLoading;
    adapterLoading = new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.src = ADAPTER; node.async = false;
      node.onload = () => (global.YunjianFocusModule ? resolve() : reject(new Error('静修模块未完整加载，请刷新后重试。')));
      node.onerror = () => { adapterLoading = null; node.remove(); reject(new Error('静修资源加载失败，请检查网络后重试。')); };
      document.head.appendChild(node);
    });
    return adapterLoading;
  }
  async function loadArt() {
    await loadAdapter();
    await global.YunjianFocusModule.load({ assetBase: ASSETS });
    if (!loadArt.listening && global.FocusCharacters) { loadArt.listening = true; global.FocusCharacters.onReady(paintPortrait); }
  }

  // ---------- 静修请求走云函数（LingtianBridge） ----------
  async function bridgeFetch(url, init = {}) {
    const bridge = global.LingtianBridge;
    if (!bridge || typeof bridge.request !== 'function') throw new Error('灵田还没有连上云端，请刷新后重试。');
    const target = new URL(String(url), global.location.href);
    if (target.pathname !== '/api/focus') throw new Error('静修请求了不认识的接口。');
    let body;
    if (init.body !== undefined && init.body !== null) {
      try { body = JSON.parse(String(init.body)); } catch (_) { throw new Error('静修请求格式无效。'); }
    }
    const out = await bridge.request('/api/focus' + target.search, body);
    const status = Number.isInteger(out && out.status) && out.status >= 200 && out.status <= 599 ? out.status : 503;
    return new global.Response(JSON.stringify((out && out.body) || { ok: false, code: 'no_response', message: '云端暂时没有回应，请稍后再试。' }), {
      status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  // ---------- 灵田左上角头像（静修衣装镜像） ----------
  function paintPortrait() {
    const box = document.querySelector('#fullscreen-bar .game-profile .game-avatar');
    if (!box) return;
    const chosen = state.identity && state.identity.profileChosen && global.FocusCharacters;
    let holder = box.querySelector('.fh-hud-portrait');
    if (!chosen) {
      if (holder) holder.remove();
      box.classList.remove('has-fh-portrait');
      return;
    }
    if (!holder) {
      holder = document.createElement('span');
      holder.className = 'fh-hud-portrait'; holder.setAttribute('aria-hidden', 'true');
      box.appendChild(holder);
    }
    const html = global.FocusCharacters.portraitMarkup({ ...state.identity, equipped: state.equipped || undefined }, 'fh-hud-face');
    if (holder.dataset.html !== html) { holder.innerHTML = html; holder.dataset.html = html; }
    box.classList.add('has-fh-portrait');
  }
  function rememberAppearance(appearance) {
    if (!appearance || typeof appearance !== 'object') return;
    if (appearance.identity && typeof appearance.identity === 'object') state.identity = { ...EMPTY, ...appearance.identity };
    if (appearance.equipped && typeof appearance.equipped === 'object') state.equipped = { ...appearance.equipped };
    paintPortrait();
  }

  // ---------- 选择性别与头像（存在灵田，静修跟着用） ----------
  function choose() {
    return new Promise(resolve => {
      const characters = (global.FocusCharacters && global.FocusCharacters.CHARACTERS) || [];
      if (!characters.length) { toast('头像资源还在加载，请稍后再试。', 'error'); resolve(undefined); return; }
      let avatarId = state.identity.profileChosen ? state.identity.avatarId : characters[0].id;
      let gender = state.identity.profileChosen ? state.identity.gender : null;
      const layer = document.createElement('dialog');
      layer.className = 'fh-picker';
      layer.setAttribute('aria-labelledby', 'fh-picker-title');
      const portrait = id => global.FocusCharacters.portraitMarkup({ gender: null, avatarId: id, profileChosen: true, equipped: state.equipped || undefined }, 'fh-picker-face');
      layer.innerHTML = `<div class="fh-card">
        <p class="fh-eyebrow">灵 田 · 静 修 共 用</p>
        <h2 id="fh-picker-title">选择你的化身</h2>
        <p class="fh-note">头像在灵田和静修里通用，同修看到的是你的道号和这位化身；性别可以不设，头像不代表性别。</p>
        <div class="fh-avatars" role="group" aria-label="四位化身">${characters.map(c => `<button type="button" class="fh-avatar" data-fh-avatar="${esc(c.id)}" aria-pressed="${c.id === avatarId}"><span class="fh-avatar-face">${portrait(c.id)}</span><b>${esc(c.name)}</b></button>`).join('')}</div>
        <div class="fh-gender" role="radiogroup" aria-label="性别（可以不设）"><span>性别</span>${[[null, '不设'], ['male', '男'], ['female', '女']].map(([value, label]) => `<button type="button" role="radio" data-fh-gender="${value || ''}" aria-checked="${value === gender}">${label}</button>`).join('')}</div>
        <p class="fh-status" role="status"></p>
        <div class="fh-actions"><button type="button" class="fh-btn fh-primary" data-fh-save>保存化身</button><button type="button" class="fh-btn" data-fh-cancel>取消</button></div>
      </div>`;
      const status = layer.querySelector('.fh-status');
      const paint = () => {
        layer.querySelectorAll('[data-fh-avatar]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.fhAvatar === avatarId)));
        layer.querySelectorAll('[data-fh-gender]').forEach(button => button.setAttribute('aria-checked', String((button.dataset.fhGender || null) === gender)));
      };
      const finish = value => { try { layer.close(); } catch (_) { /* 已关 */ } layer.remove(); resolve(value); };
      layer.addEventListener('cancel', event => { event.preventDefault(); finish(undefined); });
      layer.addEventListener('click', async event => {
        const avatar = event.target.closest('[data-fh-avatar]'), sex = event.target.closest('[data-fh-gender]');
        if (avatar) { avatarId = avatar.dataset.fhAvatar; paint(); return; }
        if (sex) { gender = sex.dataset.fhGender || null; paint(); return; }
        if (event.target.closest('[data-fh-cancel]')) { finish(undefined); return; }
        const save = event.target.closest('[data-fh-save]');
        if (!save) return;
        if (!online()) { state.identity = { gender, avatarId, profileChosen: true }; saveLocalIdentity(); paintPortrait(); finish(state.identity); return; }
        save.disabled = true; status.textContent = '正在保存……';
        let out;
        try { out = await global.LingtianBridge.request('/api/profile', { action: 'setIdentity', identity: { gender, avatarId } }); }
        catch (error) { out = { status: 503, body: { message: error.message } }; }
        if (out && out.status === 200 && out.body && out.body.ok) {
          state.identity = { ...EMPTY, ...out.body.identity };
          paintPortrait();
          toast(out.body.message || '化身已保存。', 'info');
          finish(state.identity);
        } else {
          save.disabled = false;
          status.textContent = (out && out.body && out.body.message) || '暂时没有保存上，请稍后再试。';
        }
      });
      document.body.appendChild(layer);
      try { layer.showModal(); } catch (_) { layer.setAttribute('open', ''); }
      const pressed = layer.querySelector('[data-fh-avatar][aria-pressed="true"]');
      if (pressed) pressed.focus();
    });
  }
  const LOCAL_KEY = 'lingtian-focus-identity';
  function saveLocalIdentity() { try { global.localStorage.setItem(LOCAL_KEY, JSON.stringify(state.identity)); } catch (_) { /* 浏览器不让存时只在这一页有效 */ } }
  function readLocalIdentity() {
    try {
      const value = JSON.parse(global.localStorage.getItem(LOCAL_KEY) || 'null');
      return value && global.SpiritPlayerIdentity ? global.SpiritPlayerIdentity.normalize(value) : { ...EMPTY };
    } catch (_) { return { ...EMPTY }; }
  }

  // ---------- 创建与打开 ----------
  async function ensureModule() {
    if (state.module) return state.module;
    if (state.creating) return state.creating;
    state.creating = (async () => {
      const lt = host();
      if (!lt || !lt.engine) throw new Error('灵田还在入境，请稍候再进静修。');
      const engine = lt.engine;
      await loadArt();
      let container = document.getElementById('focus-host');
      if (!container) { container = document.createElement('div'); container.id = 'focus-host'; document.body.appendChild(container); }
      const isOnline = !!engine.online;
      if (isOnline && !/^[a-f0-9]{64}$/.test(engine.accountKey || '')) throw new Error('灵田还没有连上云端账号，请稍后再试或刷新页面。');
      if (!isOnline) state.identity = readLocalIdentity();
      const alias = (engine.player && engine.player.alias) || '';
      state.module = await global.YunjianFocusModule.create({
        container,
        mode: isOnline ? 'online' : 'offline',
        assetBase: ASSETS,
        account: isOnline
          ? { accountKey: engine.accountKey, profileId: 'cloud:' + engine.accountKey, nickname: alias || '云间道友', identity: state.identity }
          : { profileId: 'lingtian-practice', nickname: alias || '云间道友', identity: state.identity },
        api: { endpoint: '/api/focus', fetch: bridgeFetch },
        getIdentity: () => state.identity,
        onChooseIdentity: choose,
        onOpen: async () => {
          document.body.dataset.focusOpen = '1';
          document.documentElement.classList.add('fh-focus-open');
          try { lt.syncRendering(); } catch (_) { /* 渲染暂停失败不影响静修 */ }
        },
        onClose: () => {
          delete document.body.dataset.focusOpen;
          document.documentElement.classList.remove('fh-focus-open');
          try { lt.syncRendering(); } catch (_) { /* 忽略 */ }
          const entry = document.querySelector('[data-focus-open-entry]');
          if (entry) entry.setAttribute('aria-pressed', 'false');
        },
        onAppearance: rememberAppearance,
        onToast: (message, type) => toast(message, type),
      });
      return state.module;
    })().finally(() => { state.creating = null; });
    return state.creating;
  }
  async function open(trigger) {
    if (state.opening) return;
    state.opening = true;
    if (trigger) { trigger.setAttribute('aria-busy', 'true'); trigger.setAttribute('aria-pressed', 'true'); }
    try {
      const module = await ensureModule();
      await module.open();
    } catch (error) {
      if (trigger) trigger.setAttribute('aria-pressed', 'false');
      toast((error && error.message) || '静修暂时打不开，请稍后再试。', 'error');
    } finally {
      state.opening = false;
      if (trigger) trigger.removeAttribute('aria-busy');
    }
  }

  // ---------- 接线 ----------
  document.addEventListener('click', event => {
    const entry = event.target.closest('[data-focus-open-entry]');
    if (!entry) return;
    event.preventDefault();
    void open(entry);
  });
  // 灵田进入以后读到的资料（LingtianBridge.afterBoot 读 /api/profile）：已选过头像的，空闲时加载头像资源画左上角
  function onProfile(profile) {
    if (!profile || state.profileSeen) return;
    state.profileSeen = true;
    if (profile.identity && typeof profile.identity === 'object') state.identity = { ...EMPTY, ...profile.identity };
    if (profile.focusAppearance && profile.focusAppearance.equipped) state.equipped = { ...profile.focusAppearance.equipped };
    if (!state.identity.profileChosen) return;
    const later = global.requestIdleCallback || (fn => setTimeout(fn, 1500));
    later(() => { loadArt().then(paintPortrait).catch(() => { /* 头像画不出来时照旧显示境界字 */ }); });
  }
  global.addEventListener('lingtian:profile', event => onProfile(event.detail));
  if (global.LingtianBridge && global.LingtianBridge.profile) onProfile(global.LingtianBridge.profile);
  // 灵田刷新界面时会重画左上角，头像跟着补上
  const watch = () => {
    const avatar = document.querySelector('#fullscreen-bar .game-profile .game-avatar');
    if (!avatar) return;
    new MutationObserver(() => { if (state.identity.profileChosen && global.FocusCharacters && !avatar.querySelector('.fh-hud-portrait')) paintPortrait(); })
      .observe(avatar, { childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

  global.LingtianFocus = Object.freeze({ open: () => open(document.querySelector('[data-focus-open-entry]')), choose, get module() { return state.module; } });
})(window);
