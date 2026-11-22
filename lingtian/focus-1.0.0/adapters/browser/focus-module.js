/* 云间灵田进修模块接入层。只连接宿主边界，不重写计时、奖励或服饰规则。 */
(function (global) {
  'use strict';
  const document = global.document;
  const scriptURL = document?.currentScript?.src;
  const defaultBase = scriptURL ? new URL('../../frontend/', scriptURL).href : null;
  const files = [
    ['identity.js', 'SpiritPlayerIdentity'],
    ['focus/focus-catalog.js', 'SpiritFocusCatalog'],
    ['focus/focus-core.js', 'SpiritFocusCore'],
    ['focus/focus-offline.js', 'SpiritFocus'],
    ['focus/focus-characters.js', 'FocusCharacters'],
    ['focus/focus-sprites.js', 'FocusSprites'],
    ['focus/focus-rooms.js', 'FocusRooms'],
    ['focus/focus-scene.js', 'SpiritFocusScene'],
    ['focus/focus-audio.js', 'SpiritFocusAudio'],
    ['focus/focus-model-preview.js', 'FocusModelPreview'],
    ['focus/focus-online.js', 'SpiritFocusOnline'],
    ['focus/focus-ui.js', 'SpiritFocusUI']
  ];
  const pending = new Map(), containers = new WeakMap();
  let loadedBase = null;
  const copy = value => JSON.parse(JSON.stringify(value));
  function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
  function assetBase(value) {
    const source = value || defaultBase;
    if (!source) fail('focus_asset_base_required', '请配置 assetBase，指向进修模块 frontend 目录。');
    const url = new URL(source, document.baseURI);
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    if (!['http:', 'https:'].includes(url.protocol)) fail('focus_http_required', '请通过本地 HTTP 服务或网站打开，不能直接双击源码 HTML。');
    url.search = ''; url.hash = ''; return url.href;
  }
  function loadNode(url, symbol, style) {
    if (pending.has(url)) return pending.get(url);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(style ? 'link' : 'script');
      const timer = global.setTimeout(() => finish(new Error('进修资源加载超时，请重试。')), 20000);
      const finish = error => {
        global.clearTimeout(timer); node.onload = node.onerror = null;
        if (error) { node.remove(); pending.delete(url); reject(error); } else resolve();
      };
      if (style) { node.rel = 'stylesheet'; node.href = url; }
      else { node.src = url; node.async = false; }
      node.onload = () => finish(!style && !global[symbol] ? new Error('进修模块未完整加载：' + symbol) : null);
      node.onerror = () => finish(new Error('进修资源加载失败：' + new URL(url).pathname));
      document.head.appendChild(node);
    });
    pending.set(url, promise); return promise;
  }
  async function load(options = {}) {
    if (!document) fail('focus_browser_required', '进修界面需要浏览器 DOM。');
    const base = assetBase(options.assetBase);
    if (loadedBase && loadedBase !== base) fail('focus_duplicate_bundle', '同一页面只能加载一个进修模块资源目录。');
    loadedBase = base;
    await Promise.all([
      loadNode(new URL('focus/focus.css', base).href, null, true),
      (async () => { for (const [path, symbol] of files) await loadNode(new URL(path, base).href, symbol, false); })()
    ]);
    if (global.FocusSprites.VERSION !== 93) fail('focus_bundle_mismatch', '进修界面与人物资源版本不一致。');
    void global.FocusSprites.ready();
    return { assetBase: base, sourceVersion: 93 };
  }
  function transport(options = {}) {
    const endpoint = new URL(options.endpoint || '/api/focus', document.baseURI);
    if (endpoint.origin !== global.location.origin || endpoint.search || endpoint.hash) {
      fail('focus_endpoint_invalid', '进修接口须为同源路径，且不含查询参数或片段。');
    }
    const fetcher = options.fetch || global.fetch?.bind(global);
    if (typeof fetcher !== 'function') fail('focus_fetch_unavailable', '浏览器未提供 fetch。');
    return async (input, init = {}) => {
      const requested = new URL(String(input), global.location.origin);
      if (requested.origin !== global.location.origin || requested.pathname !== '/api/focus') fail('focus_transport_path', '进修控制器请求了非约定接口。');
      const target = new URL(endpoint.href); target.search = requested.search;
      const extra = typeof options.headers === 'function' ? await options.headers() : options.headers;
      const headers = new global.Headers(extra || {});
      new global.Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
      return fetcher(target.href, { ...init, credentials: 'same-origin', headers });
    };
  }
  async function create(options = {}) {
    const container = options.container;
    if (!container || typeof container.appendChild !== 'function') fail('focus_container_required', '请提供专用容器元素。');
    if (containers.has(container)) fail('focus_duplicate_mount', '此容器已经挂载进修模块；请复用实例或先 destroy。');
    if (!['offline', 'online'].includes(options.mode)) fail('focus_mode_required', '请明确选择 offline 或 online 模式。');
    const online = options.mode === 'online', account = options.account || {};
    if (online && !/^[a-f0-9]{64}$/.test(account.accountKey || '')) fail('focus_account_required', '在线模式需要宿主会话接口返回的 accountKey。');
    const profileId = String(account.profileId || (online ? 'cloud:' + account.accountKey : ''));
    if (!profileId || profileId.length > 300 || /[\u0000-\u001f]/.test(profileId)) fail('focus_profile_required', '请为当前账号提供稳定且独立的 profileId。');
    // 先占位，阻止同一容器在异步资源加载时被重复创建。
    containers.set(container, true);
    let engine, ui, unsubscribe, unsubscribeReady, destroyed = false, active = false;
    let lastAppearance = '', lastStatus = '', trigger = null, transition = 0, opening = null;
    let appearanceConfirmed = !online;
    const callback = (name, value) => {
      try { const result = options[name]?.(value); if (result?.catch) result.catch(error => global.console?.error('进修宿主回调失败：' + name, error)); }
      catch (error) { global.console?.error('进修宿主回调失败：' + name, error); }
    };
    function publish(snapshot, force = false) {
      if (destroyed) return;
      if (online && (snapshot.authRequired || snapshot.accountChanged)) appearanceConfirmed = false;
      else if (online && snapshot.connection === 'connected' && Number.isSafeInteger(snapshot.revision)) appearanceConfirmed = true;
      const appearance = { profileId, online, source: online ? 'server' : 'local', focusRevision: snapshot.revision, nickname: snapshot.nickname, identity: copy(snapshot.identity), equipped: copy(snapshot.equipped) };
      const key = global.FocusCharacters.appearanceKey(appearance.identity, appearance.equipped);
      const appearanceState = JSON.stringify([key, appearance.identity, appearance.nickname]);
      // 在线初始快照只含占位衣装，不能回写到宿主已保存的头像。
      if (appearanceConfirmed && (force || appearanceState !== lastAppearance)) { lastAppearance = appearanceState; callback('onAppearance', { ...appearance, appearanceKey: key }); }
      const status = { online, connection: snapshot.connection || 'offline', authRequired: !!snapshot.authRequired, accountChanged: !!snapshot.accountChanged, activeView: !!snapshot.activeView, status: snapshot.active?.status || 'idle', kind: snapshot.active?.kind || null, pauseReason: snapshot.active?.pauseReason || '', storageError: snapshot.storageError || '' };
      const statusKey = JSON.stringify(status);
      if (statusKey !== lastStatus) { lastStatus = statusKey; callback('onStatus', status); }
    }
    function finishClose() {
      if (!active) return;
      active = false; callback('onClose');
      if (trigger?.isConnected && typeof trigger.focus === 'function') trigger.focus({ preventScroll: true });
      trigger = null;
    }
    try {
      await load({ assetBase: options.assetBase });
      const identity = options.getIdentity?.() ?? account.identity;
      engine = (online ? global.SpiritFocusOnline : global.SpiritFocus).create({
        profileId, accountKey: account.accountKey, nickname: account.nickname, identity,
        getIdentity: options.getIdentity,
        ...(online ? { fetch: transport(options.api) } : {})
      });
      ui = global.SpiritFocusUI.create({
        container, online, engine, profileId, accountKey: account.accountKey,
        nickname: account.nickname, identity, getIdentity: options.getIdentity,
        onClose: finishClose, onToast: options.onToast,
        onChooseIdentity: typeof options.onChooseIdentity === 'function' ? async () => {
          // 宿主先完成保存；在线模式随后只刷新服务器资料，不把前端资料当权威值。
          const value = await options.onChooseIdentity();
          if (online) await engine.syncIdentity();
          else { const next = options.getIdentity?.() ?? value; if (next !== undefined) await engine.syncIdentity(next); }
        } : undefined
      });
      unsubscribe = engine.subscribe(snapshot => publish(snapshot));
      unsubscribeReady = global.FocusCharacters.onReady(() => publish(engine.getSnapshot(), true));
      publish(engine.getSnapshot());
      const api = Object.freeze({
        open() {
          if (destroyed) fail('focus_destroyed', '进修实例已销毁，请重新创建。');
          if (opening) return opening;
          if (active) { ui.focus(); return Promise.resolve(); }
          const token = ++transition;
          trigger = document.activeElement;
          active = true;
          opening = (async () => {
            try {
              // onOpen 可暂停宿主农场渲染、关闭其它全屏面板，必须完成后再展开。
              await options.onOpen?.();
              if (destroyed || token !== transition) { finishClose(); return; }
              await ui.open();
              if (destroyed || token !== transition) { await ui.close(); finishClose(); }
            } catch (error) { await ui.close(); finishClose(); throw error; }
          })().finally(() => { opening = null; });
          return opening;
        },
        async close() { ++transition; if (destroyed) return; await ui.close(); if (opening) await opening.catch(() => {}); finishClose(); },
        async destroy() {
          if (destroyed) return;
          ++transition; await ui.close(); if (opening) await opening.catch(() => {}); await ui.destroy(); finishClose(); destroyed = true;
          unsubscribe?.(); unsubscribeReady?.(); containers.delete(container);
        },
        isOpen: () => !destroyed && ui.isOpen(),
        getSnapshot: () => engine.getSnapshot(),
        getEngine: () => engine,
        subscribe: listener => engine.subscribe(listener),
        async syncIdentity(value) {
          if (destroyed) fail('focus_destroyed', '进修实例已销毁，请重新创建。');
          return online ? engine.syncIdentity() : engine.syncIdentity(options.getIdentity?.() ?? value);
        },
        portraitMarkup(className = '') {
          if (!appearanceConfirmed) return '';
          const snapshot = engine.getSnapshot();
          return global.FocusCharacters.portraitMarkup({ identity: snapshot.identity, equipped: snapshot.equipped }, className);
        },
        exportData: () => ui.exportData(),
        importData: data => ui.importData(data)
      });
      containers.set(container, api); return api;
    } catch (error) {
      unsubscribe?.(); unsubscribeReady?.();
      if (ui) await ui.destroy(); else await engine?.destroy?.();
      containers.delete(container); throw error;
    }
  }
  global.YunjianFocusModule = Object.freeze({ create, load, sourceVersion: 93 });
})(typeof window !== 'undefined' ? window : globalThis);
