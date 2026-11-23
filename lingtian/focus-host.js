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
 * 6. 第一次进静修的引导（2026-11-23）：还没选过化身的同学点“静修”时，先看三步——选性别和化身、选去哪间雅室、怎么静修；
 *    最后直接在选好的公共雅室入席。静修右上角的“？”随时再看“怎么静修”。见下面“第一次进静修的引导”一段。
 * 7. 静修在线（2026-11-23）：打开、关上静修时发 lingtian:focus 事件，lingtian-bridge.js 马上补报一次在线（开着静修时报 'focus'）。
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
  // 静修界面的版式调整（focus-skin.css，2026-11-23）：要排在模块自己的 focus.css 后面，所以等模块的样式加载完再加
  const SKIN = new URL('focus-skin.css', document.currentScript ? document.currentScript.src : global.location.href).href;
  function addSkin() {
    if (document.querySelector('link[data-fh-skin]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = SKIN; link.dataset.fhSkin = '';
    document.head.appendChild(link);
  }
  async function loadArt() {
    await loadAdapter();
    await global.YunjianFocusModule.load({ assetBase: ASSETS });
    addSkin();
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

  // ---------- 第一次进静修的引导（2026-11-23 用户：“学生第一次进入进修的时候做一段引导页面，比如先让他们选择性别和头像，
  //   然后选择进修的场所，然后介绍一下怎么使用”） ----------
  // 还没选过化身（灵田和静修共用，存在云端，profileChosen 为 false）的同学点“静修”时，先看三步：① 性别与化身 ② 去哪间雅室 ③ 怎么静修。
  // 第一步点“下一步”就保存化身（与静修里“更换化身”同一个接口）；最后点“进入藏经阁／听雨轩”打开静修，直接在那间公共雅室入席
  // （坐满了就照旧弹出“同修”让学生另选）。点“跳过引导”：这台设备不再自动弹出（化身以后可以在静修里点左上角的“静”字选）。
  // 选过化身的同学不再弹出；静修右上角的“？”随时再看“怎么静修”。
  const SCENE_ART = { library: 'focus/assets/room-library-v87.webp', rain: 'focus/assets/room-rain-v87.webp' };
  const HOWTO = [
    ['入席', '进了雅室会替你选好一个空座；想换座，点场景里别的空席。'],
    ['立愿', '在“立愿”里写下这一段修习什么，比如“复习第五章，读懂一个概念”。同室的同学能看到你的立愿。'],
    ['计时', '选“番茄静修”（专注 25 分钟、小憩 5 分钟，每 4 轮长休息一次，时长可在右上角的设置里改）或“自由静修”（25、40、50 分钟或自定 5—120 分钟），点“开始静修”。'],
    ['专心', '只有静修页面开着、在前台时才计时：切到别的页面、锁屏、断网都会暂停，回来点“继续静修”。中途点“结束本段”，专注过的时间照样记下，只是这一段不得悟玉。'],
    ['悟玉与衣装', '到时完成一段得悟玉（25 分钟得 10；和道友同室专注，每 5 分钟再加 1）。悟玉在底栏“衣装坊”置办衣装，“衣橱”里换穿，灵田左上角的头像也跟着换。'],
    ['修行录', '底栏“修行录”看每天静修了多久：一天满 25 分钟算打卡，累计时长和连续打卡能解锁限定衣装。'],
    ['同修与道友', '同室的同学看到的是你的道号、化身和立愿。在底栏“同修”的“我的道友”里交换道友码就能结为道友；“凭帖相邀”里可以自己建一间静室，邀同学来一起修习。'],
  ];
  const GUIDE_KEY = 'lingtian-focus-guide:';
  const guideKey = () => GUIDE_KEY + (online() && host().engine.accountKey ? String(host().engine.accountKey).slice(0, 16) : 'local');
  const guideMarked = () => { try { return !!global.localStorage.getItem(guideKey()); } catch (_) { return false; } };
  const guideMark = value => { try { global.localStorage.setItem(guideKey(), value); } catch (_) { /* 浏览器不让存时，下次还会再出 */ } };
  // 灵田的资料（头像选没选）还没读到时补读一次；读不到就不打扰，直接进静修
  async function needsGuide() {
    if (guideMarked()) return false;
    if (!online()) { state.identity = readLocalIdentity(); return !state.identity.profileChosen; }
    if (!state.profileSeen) {
      const known = global.LingtianBridge && global.LingtianBridge.profile;
      if (known) onProfile(known);
      else {
        try {
          const out = await global.LingtianBridge.request('/api/profile');
          if (out && out.status === 200 && out.body) onProfile(out.body);
        } catch (_) { /* 读不到时不打扰 */ }
      }
    }
    return state.profileSeen && !state.identity.profileChosen;
  }
  // 保存化身（引导第一步、静修里“更换化身”共用）：返回 true＝已保存
  async function saveIdentity(gender, avatarId, status) {
    if (!online()) { state.identity = { gender, avatarId, profileChosen: true }; saveLocalIdentity(); paintPortrait(); return true; }
    if (status) status.textContent = '正在保存……';
    let out;
    try { out = await global.LingtianBridge.request('/api/profile', { action: 'setIdentity', identity: { gender, avatarId } }); }
    catch (error) { out = { status: 503, body: { message: error.message } }; }
    if (out && out.status === 200 && out.body && out.body.ok) {
      state.identity = { ...EMPTY, ...out.body.identity };
      paintPortrait();
      if (status) status.textContent = '';
      return true;
    }
    if (status) status.textContent = (out && out.body && out.body.message) || '暂时没有保存上，请稍后再试。';
    return false;
  }
  const howtoMarkup = () => `<ol class="fh-howto">${HOWTO.map(([title, text]) => `<li><div><b>${esc(title)}</b>${esc(text)}</div></li>`).join('')}</ol>`
    + '<p class="fh-howto-note">静修不计入课程修为，是自己安排的学习时间；老师在工作台能看到大家的静修时长和立愿。</p>';
  // mode：'first' 三步引导，返回 { sceneId }（进入）、{ skip: true }（跳过）或 null（按 Esc 关掉）；'help' 只看“怎么静修”
  function guide(mode) {
    return new Promise(resolve => {
      const help = mode === 'help';
      const characters = (global.FocusCharacters && global.FocusCharacters.CHARACTERS) || [];
      const scenes = ((global.SpiritFocusCatalog && global.SpiritFocusCatalog.SCENES) || []).filter(s => SCENE_ART[s.id]);
      if (!help && (!characters.length || !scenes.length)) { resolve({ skip: true }); return; }
      let step = help ? 3 : 1;
      let avatarId = state.identity.profileChosen ? state.identity.avatarId : null;
      let gender = state.identity.profileChosen ? state.identity.gender : null;
      let sceneId = null;
      let saving = false;
      const alias = (host() && host().engine && host().engine.player && host().engine.player.alias) || '';
      const portrait = id => global.FocusCharacters.portraitMarkup({ gender: null, avatarId: id, profileChosen: true }, 'fh-picker-face');
      const sceneName = id => ((scenes.find(s => s.id === id) || {}).name || '雅室');
      const layer = document.createElement('dialog');
      layer.className = `fh-picker fh-guide${help ? ' is-help' : ''}`;
      layer.setAttribute('aria-labelledby', 'fh-guide-title');
      layer.innerHTML = `<div class="fh-card fh-guide-card">
        ${help ? '' : `<ol class="fh-steps" aria-label="引导进度">${['化身', '雅室', '怎么静修'].map((label, i) => `<li data-fh-dot="${i + 1}"><b>${i + 1}</b><span>${label}</span></li>`).join('')}</ol>`}
        <section data-fh-step="1" hidden>
          <p class="fh-eyebrow">初 入 静 修 · 第 一 步</p>
          <h2 data-fh-title>选择你的化身</h2>
          <p class="fh-note">静修是灵田里专心学习的地方：写下要修习什么，用番茄钟专注，完成一段得悟玉。先选一位化身——灵田和静修通用，同修看到的是你的道号${alias ? `“${esc(alias)}”` : ''}和这位化身。</p>
          <div class="fh-gender" role="radiogroup" aria-label="性别（可以不设）"><span>性别</span>${[['male', '男'], ['female', '女'], [null, '不设']].map(([value, label]) => `<button type="button" role="radio" data-fh-gender="${value || ''}" aria-checked="false">${label}</button>`).join('')}<small>可以不设，化身不代表性别</small></div>
          <div class="fh-avatars" role="group" aria-label="四位化身">${characters.map(c => `<button type="button" class="fh-avatar" data-fh-avatar="${esc(c.id)}" aria-pressed="false"><span class="fh-avatar-face">${portrait(c.id)}</span><b>${esc(c.name)}</b></button>`).join('')}</div>
        </section>
        <section data-fh-step="2" hidden>
          <p class="fh-eyebrow">第 二 步</p>
          <h2 data-fh-title>选一处静修的地方</h2>
          <p class="fh-note">两间公共雅室，各有 8 个座位，两门课的同学都能来，进去就替你选好空座。</p>
          <div class="fh-scenes" role="group" aria-label="两间公共雅室">${scenes.map(s => `<button type="button" class="fh-scene" data-fh-scene="${esc(s.id)}" aria-pressed="false"><span class="fh-scene-art" style="background-image:url('${ASSETS + SCENE_ART[s.id]}')"></span><span class="fh-scene-body"><b>${esc(s.name)}</b><span>${esc(s.description || '')}</span><small>${esc(s.ambience || '')}</small></span></button>`).join('')}</div>
          <p class="fh-note fh-small">以后随时可以换：点静修上方的雅室名称或底栏“同修”，还能自己建一间静室（公开的大家都能进，私密的凭邀请码）。</p>
        </section>
        <section data-fh-step="3" hidden>
          <p class="fh-eyebrow">${help ? '静 修 · 使 用 说 明' : '第 三 步'}</p>
          <h2 data-fh-title>怎么静修</h2>
          ${howtoMarkup()}
        </section>
        <p class="fh-status" role="status"></p>
        <div class="fh-actions">${help ? '<button type="button" class="fh-btn fh-primary" data-fh-close>知道了</button>'
          : '<button type="button" class="fh-btn fh-skip" data-fh-skip>跳过引导</button><button type="button" class="fh-btn" data-fh-back>上一步</button><button type="button" class="fh-btn fh-primary" data-fh-next>下一步</button>'}</div>
      </div>`;
      const $in = selector => layer.querySelector(selector);
      const status = $in('.fh-status');
      const paint = () => {
        layer.querySelectorAll('[data-fh-step]').forEach(section => { section.hidden = Number(section.dataset.fhStep) !== step; });
        layer.querySelectorAll('[data-fh-dot]').forEach(dot => {
          const n = Number(dot.dataset.fhDot);
          dot.classList.toggle('is-on', n === step); dot.classList.toggle('is-done', n < step);
          if (n === step) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current');
        });
        layer.querySelectorAll('[data-fh-avatar]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fhAvatar === avatarId)));
        layer.querySelectorAll('[data-fh-gender]').forEach(b => b.setAttribute('aria-checked', String((b.dataset.fhGender || null) === gender && (gender !== null || b.dataset.picked === '1'))));
        layer.querySelectorAll('[data-fh-scene]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fhScene === sceneId)));
        const back = $in('[data-fh-back]'), next = $in('[data-fh-next]'), skip = $in('[data-fh-skip]');
        if (back) back.hidden = step === 1;
        if (skip) skip.hidden = step === 3;
        if (next) {
          next.textContent = step === 3 ? `进入${sceneName(sceneId)}` : '下一步';
          next.disabled = saving || (step === 1 && !avatarId) || (step === 2 && !sceneId);
        }
        if (!saving) hint(step === 1 && !avatarId ? '先点选一位化身。' : step === 2 && !sceneId ? '点选一间雅室。' : '');
      };
      // 提示（灰色）和出错（红色）分开写
      const hint = text => { status.classList.add('is-hint'); status.textContent = text; };
      const error = text => { status.classList.remove('is-hint'); status.textContent = text; };
      const go = n => {
        step = n; paint();
        const card = $in('.fh-card');
        if (card && card.scrollTo) card.scrollTo({ top: 0 });
        const focus = $in(`[data-fh-step="${n}"] [aria-pressed="true"], [data-fh-step="${n}"] [data-fh-avatar], [data-fh-step="${n}"] [data-fh-scene]`) || $in('[data-fh-next], [data-fh-close]');
        if (focus) focus.focus({ preventScroll: true });
      };
      const close = () => { try { layer.close(); } catch (_) { /* 已关 */ } layer.remove(); };
      const finish = value => { close(); resolve(value); };
      layer.addEventListener('cancel', event => { event.preventDefault(); if (!saving) finish(null); });
      layer.addEventListener('click', async event => {
        const avatar = event.target.closest('[data-fh-avatar]'), sex = event.target.closest('[data-fh-gender]'), scene = event.target.closest('[data-fh-scene]');
        if (avatar) { avatarId = avatar.dataset.fhAvatar; paint(); return; }
        if (sex) { layer.querySelectorAll('[data-fh-gender]').forEach(b => { b.dataset.picked = b === sex ? '1' : ''; }); gender = sex.dataset.fhGender || null; paint(); return; }
        if (scene) { sceneId = scene.dataset.fhScene; paint(); return; }
        if (event.target.closest('[data-fh-close]')) { finish({ done: true }); return; }
        if (event.target.closest('[data-fh-skip]')) { finish({ skip: true }); return; }
        if (event.target.closest('[data-fh-back]')) { go(Math.max(1, step - 1)); return; }
        if (!event.target.closest('[data-fh-next]') || saving) return;
        if (step === 1) {
          if (!avatarId) return;
          const same = state.identity.profileChosen && state.identity.avatarId === avatarId && state.identity.gender === gender;
          if (!same) {
            saving = true; paint(); hint('正在保存化身……');
            const box = { textContent: '' };
            const ok = await saveIdentity(gender, avatarId, box);
            saving = false;
            if (!ok) { paint(); error(box.textContent || '暂时没有保存上，请稍后再试。'); return; }
          }
          go(2);
          return;
        }
        if (step === 2) { if (sceneId) go(3); return; }
        // 最后一步：引导先留着，写上“正在进入……”，等连上雅室、入了席再由 open() 关掉（close），中间不会露出灵田
        saving = true;
        layer.querySelectorAll('.fh-actions button').forEach(b => { b.disabled = true; });
        $in('[data-fh-next]').textContent = `正在进入${sceneName(sceneId)}……`;
        hint('正在连接雅室，替你选一个空座……');
        resolve({ sceneId, close });
      });
      document.body.appendChild(layer);
      try { layer.showModal(); } catch (_) { layer.setAttribute('open', ''); }
      go(step);
    });
  }
  // 引导结束：打开静修以前先连上、在选好的公共雅室入席，打开以后就不再弹出“同修”（坐满或没连上时照旧弹出，让学生另选）
  async function seatIn(module, sceneId) {
    try {
      const engine = module.getEngine();
      if (online()) {
        const ready = await engine.setActive(true);
        if (ready && ready.ok === false) return;
        const now = engine.getSnapshot();
        if (now.room && now.sceneId === sceneId) return;
      }
      const out = await engine.selectScene(sceneId);
      if (out && out.ok === false && out.message) toast(out.message, 'error');
    } catch (_) { /* 入席没成也照样打开静修，在“同修”里再选 */ }
  }
  // 静修右上角的“？”：随时再看“怎么静修”（看的时候计时暂停，和静修自己的面板一样，看完点“继续静修”）
  function addHelpButton(container) {
    const tools = container && container.querySelector('.fx-header-tools');
    if (!tools || tools.querySelector('.fh-help')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fx-icon-button fh-help';
    button.title = '使用说明';
    button.setAttribute('aria-label', '静修使用说明');
    button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.85.8c0 1.7-2.45 2.3-2.45 3.9"/><path d="M12 16.9h.01"/></svg>';
    button.addEventListener('click', async event => {
      event.stopPropagation();
      try { const engine = state.module && state.module.getEngine(); const snap = engine && engine.getSnapshot(); if (snap && snap.active && snap.active.status === 'running') await engine.pause('panel'); } catch (_) { /* 暂停不了也照样看说明 */ }
      await guide('help');
      button.focus({ preventScroll: true });
    });
    tools.insertBefore(button, tools.querySelector('[data-fx-action="settings"]'));
  }
  // ---------- 静修大屏（2026-11-23 用户：“点击开始进修后，进入类似于情景猜谜小游戏那样的大屏，上面有静修倒计时以及你和朋友坐在桌子上的
  //   实时状态图。如果切出大屏，就暂停静修，你朋友的页面也会同步显示你已经暂停。看你们谁最先完成静修。”） ----------
  // 一开始计时（开始静修、继续静修、开始小憩）就铺满整个页面：大圆环倒计时、立愿，旁边是同室每一位同修坐在书案前的实时状态
  // （进修中／切出暂停／小憩中／已完成，还剩多久），按谁先完成排名次。数据都来自静修自己的同步（约 10 秒一次，中间按各自的计时往前走），
  // 不另加接口。点“退出大屏”或按 Esc：计时暂停（暂停原因记“切出”，同室的同学看到“切出暂停”）；切到别的页面、锁屏照旧由静修自动暂停。
  // 名次：已完成的排前面（按这台设备看到他完成的先后），还在计时的按还剩多久从少到多；暂停的排在计时的后面。
  const STAGE_AWAY = new Set(['hidden', 'blur', 'leave', 'module', 'panel']);
  const STAGE_NET = new Set(['network', 'disconnected', 'connection']);
  const stage = { el: null, timer: 0, ids: '', finished: new Map(), confirmEnd: false, lastKey: '', busy: false };
  const SEATED_ART = 'focus/assets/companions-seated-v87.webp';
  const clockText = ms => { const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const stateLabel = p => {
    if (p.status === 'paused') return STAGE_AWAY.has(p.pauseReason) ? '切出暂停' : STAGE_NET.has(p.pauseReason) ? '连接暂停' : '已暂停';
    return { focus: '进修中', rest: '小憩中', completed: '已完成', ended: '已结束', idle: '待进修' }[p.status] || '待进修';
  };
  const engineOf = () => { try { return state.module && state.module.getEngine(); } catch (_) { return null; } };
  // 人物：静修里同一张“坐着执笔”的原画，穿着各自的衣装；还没画好时先用原画
  function figureMarkup(p) {
    const person = { id: p.id, avatarId: p.avatarId || undefined, equipped: p.equipped || {} };
    let url = '';
    try { const pic = global.FocusSprites && global.FocusSprites.picture(person, { view: 'full' }); url = pic && pic.url ? pic.url : ''; } catch (_) { url = ''; }
    if (url) return `<img src="${esc(url)}" alt="" draggable="false">`;
    const c = global.FocusCharacters && global.FocusCharacters.getCharacter ? global.FocusCharacters.getCharacter({ id: p.id, avatarId: p.avatarId }) : null;
    return `<span class="fh-desk-atlas" style="background-image:url('${ASSETS + SEATED_ART}');background-position:${esc((c && c.position) || '0% 0%')}"></span>`;
  }
  // 同室的人（含自己）按名次排好；self：自己的计时（getSnapshot 已经按本机计时往前推好了）
  function standings(snap) {
    const now = Date.now();
    const people = (Array.isArray(snap.participants) ? snap.participants : []).map(p => ({ ...p }));
    people.forEach(p => {
      const key = p.sessionId || p.id;
      if (p.kind === 'focus' && p.status === 'completed' && !stage.finished.has(key)) stage.finished.set(key, stage.el ? now : 0);
    });
    const racing = p => p.kind === 'focus' && ['focus', 'paused', 'completed'].includes(p.status) && Number(p.durationMs) > 0;
    const left = p => Math.max(0, Number(p.durationMs) - Number(p.elapsedMs || 0));
    const order = p => (p.status === 'completed' ? 0 : p.status === 'focus' ? 1 : 2);
    const inRace = people.filter(racing).sort((x, y) => order(x) - order(y)
      || (order(x) === 0 ? (stage.finished.get(x.sessionId || x.id) || 0) - (stage.finished.get(y.sessionId || y.id) || 0) : left(x) - left(y))
      || Number(x.seatId) - Number(y.seatId));
    const others = people.filter(p => !racing(p)).sort((x, y) => (x.isSelf ? -1 : 0) - (y.isSelf ? -1 : 0) || Number(x.seatId) - Number(y.seatId));
    return { list: inRace.concat(others), rank: new Map(inRace.map((p, i) => [p.id, i + 1])), left };
  }
  function stageShell(snap) {
    const room = snap.room || {};
    const scene = snap.sceneId === 'rain' ? 'rain' : 'library';
    const el = document.createElement('div');
    el.className = 'fh-stage';
    el.dataset.scene = scene;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fh-stage-title');
    el.innerHTML = `<div class="fh-stage-bg" style="background-image:url('${ASSETS + SCENE_ART[scene]}')" aria-hidden="true"></div>
      <header class="fh-stage-top">
        <div class="fh-stage-where"><b id="fh-stage-title">${esc(room.title || (scene === 'rain' ? '听雨轩' : '藏经阁'))}</b><span data-fh-stage-mode></span></div>
        <button type="button" class="fh-stage-exit" data-fh-stage-exit>退出大屏<small>（计时暂停）</small></button>
      </header>
      <main class="fh-stage-main">
        <section class="fh-stage-me" aria-label="我的计时">
          <p class="fh-stage-goal"><span>立愿</span><b data-fh-stage-goal></b></p>
          <div class="fh-stage-ring">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="fh-ring-track" cx="60" cy="60" r="54"/><circle class="fh-ring-bar" data-fh-stage-ring cx="60" cy="60" r="54"/></svg>
            <div class="fh-stage-clock"><span data-fh-stage-label>进修中</span><strong data-fh-stage-time role="timer" aria-live="off">25:00</strong><small data-fh-stage-sub></small></div>
          </div>
          <p class="fh-stage-lead" data-fh-stage-lead aria-live="polite"></p>
          <div class="fh-stage-actions" data-fh-stage-actions></div>
          <p class="fh-stage-hint">退出大屏、切到别的页面或锁屏都会暂停计时，同室的同学会看到你“切出暂停”。</p>
        </section>
        <section class="fh-stage-room" aria-label="同室同修">
          <h2>同室同修 <small data-fh-stage-count></small></h2>
          <ol class="fh-desks" data-fh-stage-desks></ol>
        </section>
      </main>`;
    el.addEventListener('click', onStageClick);
    el.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); void exitStage(); } });
    return el;
  }
  function deskMarkup(p) {
    return `<li class="fh-desk" data-fh-desk="${esc(p.id)}"><span class="fh-desk-rank" data-fh-desk-rank></span>
      <span class="fh-desk-figure">${figureMarkup(p)}</span><span class="fh-desk-table" aria-hidden="true"></span>
      <span class="fh-desk-text"><b class="fh-desk-name">${esc(p.nickname || '同修')}${p.isSelf ? '<i class="is-me">我</i>' : p.isFriend ? '<i>道友</i>' : ''}</b>
      <span class="fh-desk-goal">${esc(p.target || '')}</span>
      <span class="fh-desk-line"><em data-fh-desk-state></em><strong data-fh-desk-time></strong></span>
      <span class="fh-desk-bar"><i data-fh-desk-bar></i></span></span></li>`;
  }
  function paintStage() {
    const el = stage.el, engine = engineOf();
    if (!el || !engine) return;
    const snap = engine.getSnapshot();
    const a = snap.active;
    const $s = selector => el.querySelector(selector);
    // 自己
    const kind = a && a.kind === 'break' ? 'break' : 'focus';
    const total = a ? Math.max(1, Number(a.minutes) * 60000) : 1;
    const remaining = a ? Number(a.remainingMs != null ? a.remainingMs : total - (a.elapsedMs || 0)) : 0;
    const status = a ? a.status : 'idle';
    el.dataset.status = status; el.dataset.kind = kind;
    $s('[data-fh-stage-time]').textContent = clockText(remaining);
    $s('[data-fh-stage-ring]').style.strokeDashoffset = String(339.29 * (1 - Math.min(1, Math.max(0, a ? (a.elapsedMs || 0) / total : 0))));
    const away = status === 'paused' && STAGE_AWAY.has(a.pauseReason);
    $s('[data-fh-stage-label]').textContent = !a ? '待进修' : status === 'completed' ? (kind === 'focus' ? '修习已成' : '小憩已毕') : status === 'paused' ? (away ? '切出暂停' : '已暂停') : kind === 'break' ? '小憩中' : '进修中';
    $s('[data-fh-stage-sub]').textContent = !a ? '' : kind === 'break' ? `小憩 ${a.minutes} 分钟，不计入专注` : status === 'completed' ? `专注 ${a.minutes} 分钟` : `共 ${a.minutes} 分钟 · 已学 ${Math.floor((a.elapsedMs || 0) / 60000)} 分钟`;
    $s('[data-fh-stage-goal]').textContent = a && a.kind === 'focus' ? a.target : kind === 'break' ? '放松肩颈，看看远处' : '';
    const p = snap.pomodoro || {};
    $s('[data-fh-stage-mode]').textContent = a && a.mode === 'pomodoro' ? `番茄静修 · 第 ${a.cycle || p.cycle || 1} 组第 ${a.round || p.round || 1}/${a.roundsPerCycle || 4} 轮` : a ? '自由静修' : '';
    // 按钮：计时中可以暂歇、结束本段；暂停时继续；完成后小憩或回雅室
    const actions = $s('[data-fh-stage-actions]');
    const want = stage.confirmEnd ? 'confirm' : !a ? 'none' : status === 'running' ? `run-${kind}` : status === 'paused' ? 'paused' : status === 'completed' ? `done-${kind}` : 'none';
    if (actions.dataset.mode !== want || stage.busyChanged) {
      stage.busyChanged = false;
      actions.dataset.mode = want;
      const nextBreak = p.nextBreakMinutes || 5;
      actions.innerHTML = {
        confirm: '<p class="fh-stage-confirm">结束这一段？专注过的时间照样记下，只是这一段不得悟玉。</p><button type="button" class="fh-btn fh-danger" data-fh-stage="end-yes">结束本段</button><button type="button" class="fh-btn fh-primary" data-fh-stage="end-no">再坚持一下</button>',
        'run-focus': '<button type="button" class="fh-btn" data-fh-stage="pause">暂歇片刻</button><button type="button" class="fh-btn fh-quiet" data-fh-stage="end">结束本段</button>',
        'run-break': '<button type="button" class="fh-btn" data-fh-stage="end-break">结束小憩</button>',
        paused: '<button type="button" class="fh-btn fh-primary fh-big" data-fh-stage="resume">继续静修</button><button type="button" class="fh-btn fh-quiet" data-fh-stage="end">结束本段</button>',
        'done-focus': `<button type="button" class="fh-btn fh-primary fh-big" data-fh-stage="break">小憩 ${nextBreak} 分钟</button><button type="button" class="fh-btn" data-fh-stage="close">回到雅室</button>`,
        'done-break': '<button type="button" class="fh-btn fh-primary fh-big" data-fh-stage="close">回到雅室，开始下一段</button>',
        none: '<button type="button" class="fh-btn fh-primary fh-big" data-fh-stage="close">回到雅室</button>',
      }[want] || '';
      actions.querySelectorAll('button').forEach(b => { b.disabled = stage.busy; });
    }
    // 同室
    const { list, rank, left } = standings(snap);
    const ids = list.map(x => x.id).join('|');
    const desks = $s('[data-fh-stage-desks]');
    if (ids !== stage.ids) { stage.ids = ids; desks.innerHTML = list.map(deskMarkup).join(''); }   // 有人进出或名次变了才重排
    list.forEach(x => {
      const li = desks.querySelector(`[data-fh-desk="${CSS.escape(x.id)}"]`);
      if (!li) return;
      const r = rank.get(x.id);
      li.dataset.status = x.status; li.dataset.kind = x.kind || '';
      li.classList.toggle('is-self', !!x.isSelf); li.classList.toggle('is-friend', !!x.isFriend);
      li.querySelector('[data-fh-desk-rank]').textContent = r ? String(r) : '';
      li.querySelector('[data-fh-desk-rank]').hidden = !r;
      li.querySelector('[data-fh-desk-state]').textContent = stateLabel(x);
      const lt = x.kind === 'focus' && Number(x.durationMs) > 0 ? left(x) : 0;
      li.querySelector('[data-fh-desk-time]').textContent = x.status === 'completed' ? '' : x.kind && Number(x.durationMs) > 0 && x.status !== 'idle' && x.status !== 'ended' ? `还剩 ${clockText(x.kind === 'focus' ? lt : Math.max(0, x.durationMs - (x.elapsedMs || 0)))}` : '';
      li.querySelector('[data-fh-desk-bar]').style.width = `${Number(x.durationMs) > 0 ? Math.min(100, Math.round((Number(x.elapsedMs) || 0) * 100 / Number(x.durationMs))) : 0}%`;
    });
    $s('[data-fh-stage-count]').textContent = list.length ? `${list.length} 人 · 按谁先完成排` : '';
    // 领先或第一个完成的
    const racers = list.filter(x => rank.has(x.id));
    const first = racers[0];
    const lead = $s('[data-fh-stage-lead]');
    lead.textContent = !first ? (list.length > 1 ? '同室还没有人在计时。' : '独自静修中，同室来了同修会显示在旁边。')
      : first.status === 'completed' ? `第一个完成：${first.isSelf ? '你' : first.nickname}${racers.filter(x => x.status === 'completed').length > 1 ? `，已有 ${racers.filter(x => x.status === 'completed').length} 人完成` : ''}`
      : racers.length > 1 ? `领先：${first.isSelf ? '你' : first.nickname} · 还剩 ${clockText(left(first))}` : '同室只有你在计时，到时就是第一个完成。';
  }
  async function stageDo(action) {
    const engine = engineOf();
    if (!engine) return;
    if (action === 'end') { stage.confirmEnd = true; paintStage(); return; }
    if (action === 'end-no') { stage.confirmEnd = false; paintStage(); return; }
    if (action === 'close') { closeStage(); return; }
    stage.busy = true; stage.busyChanged = true; paintStage();
    let out = null;
    try {
      if (action === 'pause') out = await engine.pause('manual');
      else if (action === 'resume') out = await engine.resume();
      else if (action === 'end-yes') { stage.confirmEnd = false; out = await engine.cancel(); }
      else if (action === 'break') out = await engine.startBreak();
      else if (action === 'end-break') out = await engine.endBreak();
    } catch (error) { out = { ok: false, message: error && error.message }; }
    stage.busy = false; stage.busyChanged = true;
    if (out && out.ok === false && out.message) toast(out.message, 'error');
    if (action === 'end-yes' || action === 'end-break') closeStage();
    else paintStage();
  }
  function onStageClick(event) {
    if (event.target.closest('[data-fh-stage-exit]')) { void exitStage(); return; }
    const button = event.target.closest('[data-fh-stage]');
    if (button && !button.disabled) void stageDo(button.dataset.fhStage);
  }
  function openStage() {
    if (stage.el || !state.module || !state.module.isOpen()) return;
    const engine = engineOf();
    if (!engine) return;
    stage.confirmEnd = false; stage.ids = ''; stage.finished = new Map();
    stage.el = stageShell(engine.getSnapshot());
    document.body.appendChild(stage.el);
    document.documentElement.classList.add('fh-stage-open');
    paintStage();
    stage.timer = global.setInterval(paintStage, 500);
    const first = stage.el.querySelector('.fh-stage-actions button') || stage.el.querySelector('[data-fh-stage-exit]');
    if (first) first.focus({ preventScroll: true });
  }
  function closeStage() {
    if (!stage.el) return;
    global.clearInterval(stage.timer);
    stage.el.remove();
    stage.el = null; stage.ids = ''; stage.confirmEnd = false;
    document.documentElement.classList.remove('fh-stage-open');
  }
  // 退出大屏：还在计时就先暂停（记作“切出”，同室看到“切出暂停”），再回到静修的雅室界面
  async function exitStage() {
    const engine = engineOf();
    try {
      const a = engine && engine.getSnapshot().active;
      if (a && a.status === 'running') await engine.pause('hidden');
    } catch (_) { /* 暂停不了也照样退出，静修自己会在切走时暂停 */ }
    closeStage();
  }
  // 开始计时（开始静修、继续静修、开始小憩）时自动打开大屏
  function watchStage(module) {
    module.subscribe(snap => {
      const a = snap && snap.active;
      const key = a ? `${a.id}:${a.status}` : '';
      if (key === stage.lastKey) return;
      const running = !!a && a.status === 'running';
      const wasRunning = /:running$/.test(stage.lastKey);
      stage.lastKey = key;
      if (running && !wasRunning && !stage.el && module.isOpen()) openStage();
    });
  }

  // 静修在线：打开、关上静修时让 lingtian-bridge.js 马上补报一次（工作台“静修在线”不用等 30 秒）
  function focusSignal(open) {
    try { global.dispatchEvent(new CustomEvent('lingtian:focus', { detail: { open: !!open } })); } catch (_) { /* 补报不了就等下一次报到 */ }
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
          focusSignal(true);
        },
        onClose: () => {
          delete document.body.dataset.focusOpen;
          document.documentElement.classList.remove('fh-focus-open');
          try { lt.syncRendering(); } catch (_) { /* 忽略 */ }
          const entry = document.querySelector('[data-focus-open-entry]');
          if (entry) entry.setAttribute('aria-pressed', 'false');
          closeStage();
          focusSignal(false);
        },
        onAppearance: rememberAppearance,
        onToast: (message, type) => toast(message, type),
      });
      addHelpButton(container);
      watchStage(state.module);
      return state.module;
    })().finally(() => { state.creating = null; });
    return state.creating;
  }
  async function open(trigger) {
    if (state.opening) return;
    state.opening = true;
    if (trigger) { trigger.setAttribute('aria-busy', 'true'); trigger.setAttribute('aria-pressed', 'true'); }
    try {
      // 第一次进静修（还没选过化身）：先看引导；按 Esc 关掉就先不进，下次点“静修”还会出来
      let plan = null;
      if (!(state.module && state.module.isOpen()) && await needsGuide()) {
        await loadArt();
        plan = await guide('first');
        if (!plan) { if (trigger) trigger.setAttribute('aria-pressed', 'false'); return; }
        guideMark(plan.skip ? 'skip' : 'done');
      }
      try {
        const module = await ensureModule();
        if (plan && plan.sceneId) await seatIn(module, plan.sceneId);
        if (plan && plan.close) plan.close();
        await module.open();
      } finally {
        if (plan && plan.close) plan.close();   // 出错时也把引导关掉
      }
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
