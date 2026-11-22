(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = n => Math.floor(n).toLocaleString('zh-CN');
  const crops = window.SpiritGame.CROPS;
  const realms = window.SpiritGame.REALMS;
  const plotCount = window.SpiritGame.PLOT_COUNT;
  const cropMap = Object.fromEntries(crops.map(c => [c.id, c]));
  const art = (id, ready = false) => window.spiritPlantArt ? window.spiritPlantArt(id, 120, ready ? 'mature' : undefined) : icon('leaf');
  const ripeTraits = {
    huangjing: { color: '#d69936', text: '芝盖凝金，药香正浓' },
    zihou: { color: '#ac66cd', text: '紫霞满枝，花蕊含露' },
    tianling: { color: '#e99b43', text: '灵果盈枝，蜜光流转' },
    yueyang: { color: '#66bba6', text: '玉叶生辉，魂珠已凝' },
    jiuqu: { color: '#dbad52', text: '金参舒展，朱果盈盈' }
  };
  const mature = p => window.SpiritGame.isMature(p, engine?.now?.() ?? Date.now());
  const growth = p => window.SpiritGame.getGrowthInfo(p, engine?.now?.() ?? Date.now());
  const recentFarmActions = new Map();
  let selectedTool = 'auto';
  let engine, scene, economy, farmUI, environmentUI, journeyUI, decorEditor, fullscreenUI, cardsUI, mode = 'home', activePage = 'garden', neighborId = 'qingyao', selectedPlot = null, selectedCrop = 'huangjing';
  let dialogKind = '', lastDialogTrigger = null, audioContext, soundEnabled = false, settingsWarning = false, renderQueued = false;
  let dialogHistory = [], dialogOrigin = null, dialogNavigationRevision = 0;
  let journeyReturnWindow = null, journeyReturnPanel = null, decorReturnWindow = null;
  let fallbackSignature = '', plotSignature = '', seedSignature = '', careSignature = '', pendingImport = null, sceneError = false;
  let visitViewRequest = 0;
  let fullscreenPanel = '', activityTab = 'quests', fullscreenResizeFrame = 0;
  let activeJourneyTab = 'commissions', gameWindow = '', journeyReturnTrigger = null;
  let cardsReturnWindow = null, cardsReturnTrigger = null;
  // 智慧课堂（2026-11-18）：手机转不过来时可以“先竖着玩”，记在本机，以后不再弹横屏提示（横过手机仍会自动展开）
  const PORTRAIT_PLAY_KEY = 'lingtian-portrait-play';
  let portraitPlay = (() => { try { return localStorage.getItem(PORTRAIT_PLAY_KEY) === '1'; } catch (_) { return false; } })();
  let journeyReturnView = { page: 'garden', mode: 'home', neighborId: 'qingyao' };
  const gameWindowInert = new Map();
  const mobileLayout = () => window.matchMedia('(max-width: 760px), (max-width: 960px) and (max-height: 520px)').matches;
  let lastUnlockedPlot = null, lastUnlockedAt = 0;
  try { soundEnabled = localStorage.getItem('yunjian-sound') === 'true'; } catch (_) {}

  function timeLeft(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}小时${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}分`;
    return seconds >= 60 ? `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒` : `${seconds}秒`;
  }
  function durationLabel(ms) {
    const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const hours = Math.floor(total / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
    return `${hours ? hours + '小时' : ''}${minutes ? minutes + '分钟' : ''}${seconds ? seconds + '秒' : ''}` || '0秒';
  }
  function clockTime(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    const part = n => String(n).padStart(2,'0');
    return seconds >= 3600 ? `${part(Math.floor(seconds / 3600))}:${part(Math.floor(seconds % 3600 / 60))}:${part(seconds % 60)}` : `${part(Math.floor(seconds / 60))}:${part(seconds % 60)}`;
  }
  function actualGardenWeather() {
    const owner = mode === 'neighbors' && engine?.online ? getNeighbor() : null;
    const origin = owner?.environmentStartedAt ?? engine?.state.createdAt;
    if (!Number.isSafeInteger(origin) || !window.SpiritEnvironment) return null;
    return window.SpiritEnvironment.getState(engine?.now?.() ?? Date.now(), null, origin);
  }
  function isRaining() { return actualGardenWeather()?.weatherId === 'rain'; }
  function toolTargets(index) {
    return mode === 'home' && selectedTool !== 'auto' ? engine.getToolTargets(selectedTool, index) : [];
  }
  function selectTool(kind) {
    if (!['auto','hoe','wateringCan'].includes(kind)) return;
    selectedTool = kind;
    if (mode !== 'home') setView('home');
    setFullscreenPanel('');
    renderSeeds(); renderFarmTools(); renderGarden();
  }
  function renderFarmTools() {
    const hoe = engine.getToolInfo('hoe'), can = engine.getToolInfo('wateringCan');
    $('farm-tools').hidden = mode !== 'home';
    $('hoe-level').textContent = `Lv.${hoe.level}`; $('water-level').textContent = `Lv.${can.level}`;
    $('hoe-coverage').textContent = `清理 ${hoe.capacity} 田 / 次`; $('water-coverage').textContent = `浇灌 ${can.capacity} 田 / 次`;
    document.querySelectorAll('[data-farm-tool]').forEach(b => {
      const active = b.dataset.farmTool === selectedTool;
      b.classList.toggle('selected',active); b.setAttribute('aria-pressed',String(active));
    });
    const activity = farmActionState(farmOperation?.indices[0]);
    $('farm-tool-hint').textContent = activity ? `${activity.label} · ${activity.note}` : isRaining() ? '细雨润田 · 到浇水节点会自动补水，安心赏雨即可；生长间隔照常。' : selectedTool === 'hoe'
      ? `已执锄头 · 点击枯草，清理附近最多 ${hoe.capacity} 块枯田；活植会保留。`
      : selectedTool === 'wateringCan'
        ? `已执水壶 · 点击待浇灵植，浇灌附近最多 ${can.capacity} 田；灵泉免费，未到时不重复浇。`
        : mobileLayout() ? '轻点常驻栏切换灵种和农具，再照料田块；也可打开「田块照料」使用列表。' : '点空田播种，点枯草用锄头清理，点水滴浇灌；每次补水都让灵植变一次形态，下雨时会自动补水。';
  }
  // The feedback transaction only owns presentation. Authoritative plots and
  // balances stay in the engine; a short snapshot prevents a new action label
  // appearing beneath a tool that has not finished its stroke yet.
  let farmOperation = null;
  function farmActionsBlocked() {
    return !!farmOperation || !!(engine.online && (engine.busy || engine.pending || engine.authRequired || engine.accountChanged));
  }
  function farmActionState(index) {
    if (mode !== 'home' || !farmOperation?.indices.includes(index)) return null;
    const action = farmOperation.action, phase = farmOperation.phase;
    const glyph = {plant:'seed',water:'watering',clear:'hoe',harvest:'harvest'}[action];
    const label = phase === 'unconfirmed' ? '待同步' : phase === 'confirming' ? '确认中' : {plant:'播种中',water:'浇灌中',clear:'锄草中',harvest:'采收中'}[action];
    const note = phase === 'unconfirmed' ? '结果未确认，请同步云端' : phase === 'confirming' ? '稍候，无需重复点击' : farmOperation.indices.length > 1 ? `正在照料 ${farmOperation.indices.length} 田` : '动作完成后继续照料';
    return {action,phase,label,note,glyph};
  }
  function farmActionSignature() {
    return [farmOperation?.action,farmOperation?.indices.join(','),farmOperation?.phase,!!engine.busy,!!engine.pending].join(':');
  }
  function farmDisplayPlots() {
    const plots = engine.state.plots;
    return farmOperation ? plots.map((plot,index) => farmOperation.before.get(index) || plot) : plots;
  }
  function reconcileFarmOperation() {
    // Manual synchronization may settle an uncertain request. It must never
    // replay its animation, select a plot, or reopen the page we left.
    if (farmOperation?.phase === 'unconfirmed' && !engine.busy && !engine.pending && !engine.authRequired && !engine.accountChanged) {
      farmOperation = null; plotSignature = ''; fallbackSignature = ''; careSignature = '';
    }
  }
  function farmFeedbackDuration(action) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 260;
    return {plant:520,water:820,clear:720,harvest:420}[action] || 520;
  }
  async function performFarmAction(action, index, bulk = false) {
    if (decorEditor?.isOpen()) return;
    if (mode !== 'home' || !Number.isInteger(index) || index < 0 || index >= plotCount) return;
    if (!['plant','clear','water','harvest'].includes(action) || farmActionsBlocked()) return;
    const current = Date.now();
    if (!bulk && (current - (recentFarmActions.get(`${index}:${action}`) || 0) < 450 || (index === lastUnlockedPlot && current - lastUnlockedAt < 450))) return;
    if (!bulk) selectedPlot = index;
    if (action === 'water' && isRaining()) {
      if (!engine.online) engine.tick();
      toast('雨水正在照料灵田，到时会自动补水，无需手动浇灌。','info');
      plotSignature = ''; fallbackSignature = ''; render(true); return;
    }
    const cropId = selectedCrop, tool = action === 'clear' ? 'hoe' : action === 'water' ? 'wateringCan' : null;
    if (tool) selectedTool = tool; else if (action === 'plant') selectedTool = 'auto';
    const targets = bulk ? engine.state.plots.flatMap((plot,i) => mature(plot) ? [i] : []) : tool ? engine.getToolTargets(tool,index) : [index];
    const indices = [...new Set(bulk ? targets : [index,...targets])].filter(i => Number.isInteger(i) && i >= 0 && i < plotCount);
    if (!indices.length) return;
    const operation = {action,indices,phase:'acting',navigation:dialogNavigationRevision,
      before:new Map(indices.map(i => [i,{...engine.state.plots[i]}]))};
    farmOperation = operation;
    if (!bulk) scene?.focusPlot?.(index);
    plotSignature = ''; fallbackSignature = ''; careSignature = ''; render(true);
    const duration = farmFeedbackDuration(action);
    // Start a decorative attempt immediately, never a success acknowledgement.
    scene?.beginFarmAction?.(action,indices,{duration});
    let finishAnimation;
    const animation = new Promise(resolve => { finishAnimation = resolve; });
    const animationTimer = setTimeout(() => {
      if (farmOperation === operation && operation.phase === 'acting') {
        operation.phase = 'confirming'; plotSignature = ''; fallbackSignature = ''; careSignature = ''; render(true);
      }
      finishAnimation();
    },duration);
    let result;
    try {
      result = await (bulk ? engine.harvestAll() : action === 'plant' ? engine.plant(index,cropId) : engine[action](index));
    } catch (_) {
      result = {ok:false,pending:!!engine.pending};
      toast(result.pending ? '这次照料结果尚未确认，请同步云端后继续。' : '本次照料未完成，请稍后再试。','error');
    }
    // An explicit refusal has no next state to reveal; stop the attempt now.
    if (!result?.ok && !result?.pending && !engine.pending) { clearTimeout(animationTimer); finishAnimation(); }
    // Both conditions must finish; slow requests do not add a second delay.
    await animation;
    if (farmOperation !== operation) return result;
    scene?.endFarmAction?.();
    if (result?.pending || (!result?.ok && engine.pending)) operation.phase = 'unconfirmed';
    else farmOperation = null;
    plotSignature = ''; fallbackSignature = ''; careSignature = ''; render(true);
    if (!result?.ok) return result;
    const items = result.items || [{index,cropId:result.cropId || engine.state.plots[index]?.cropId}];
    items.forEach(item => recentFarmActions.set(`${item.index}:${action}`,current));
    if (action === 'harvest' && activePage === 'garden' && mode === 'home' && dialogNavigationRevision === operation.navigation) {
      if (bulk) items.forEach((item,n) => harvestBurst(item.index,item.cropId,item.qty,n*65));
      else harvestBurst(index,result.cropId,result.qty);
    }
    return result;
  }

  function playSound(kind) {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioContext ||= new AudioContext();
      if (audioContext.state === 'suspended') audioContext.resume();
      const notes = kind === 'breakthrough' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'error' ? [220, 196] : [659.25, 880];
      notes.forEach((frequency, i) => {
        const t = audioContext.currentTime + i * .12;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.045, t + .012); gain.gain.exponentialRampToValueAtTime(.0001, t + .62);
        oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(t); oscillator.stop(t + .65);
      });
    } catch (_) {}
  }
  function liftToastLayer() {
    const stack = $('toast-stack'), dialog = $('game-dialog'), rotate = $('fullscreen-orientation');
    if (!stack) return;
    // A modal makes its outside siblings inert, including live regions. Keep
    // announcements inside the active dialog, then lift their manual popover
    // after that dialog so existing notices also remain above its backdrop.
    const host = rotate?.open ? rotate : dialog?.open ? dialog : document.body;
    const supportsPopover = typeof stack.showPopover === 'function' && typeof stack.hidePopover === 'function';
    if (supportsPopover) {
      try {
        if (stack.matches(':popover-open')) stack.hidePopover();
        if (stack.parentElement !== host) host.appendChild(stack);
        if (stack.childElementCount) stack.showPopover();
        document.documentElement.classList.remove('toast-dialog-fallback');
        return;
      } catch (_) { /* Older or partial implementations use the modal's layer. */ }
    }
    stack.removeAttribute('popover');
    if (stack.parentElement !== host) host.appendChild(stack);
    document.documentElement.classList.toggle('toast-dialog-fallback', !!dialog?.open && !!stack.childElementCount);
  }
  function toast(message, type = 'success') {
    const stack = $('toast-stack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    let title = type === 'error' ? '暂时无法操作' : type === 'info' ? '灵田小记' : '仙途有获';
    let symbol = type === 'error' ? 'help' : type === 'info' ? 'leaf' : 'check';
    if (type === 'success') {
      if (message.startsWith('浇灌')) { title = '灵泉已润'; symbol = 'drop'; }
      else if (message.startsWith('种下')) { title = '灵种入土'; symbol = 'seed'; }
      else if (message.startsWith('锄头清理')) { title = '灵田已净'; symbol = 'hoe'; }
      else if (message.startsWith('收获')) { title = '灵植入囊'; symbol = 'harvest'; }
      else if (message.includes('升至')) { title = '农具焕新'; symbol = 'workshop'; }
    }
    node.innerHTML = `<span class="toast-emblem">${icon(symbol)}</span><span class="toast-copy"><strong>${title}</strong><span>${esc(message)}</span></span>`;
    stack.appendChild(node);
    while (stack.children.length > 3) stack.firstElementChild.remove();
    liftToastLayer();
    playSound(type);
    if (message.includes('无法自动保存')) settingsWarning = true;
    setTimeout(() => { node.classList.add('leave'); setTimeout(() => { node.remove(); if (!stack.childElementCount) liftToastLayer(); }, 260); }, type === 'error' ? 4300 : 3500);
  }
  function queueRender() {
    if (renderQueued || !engine) return;
    renderQueued = true;
    queueMicrotask(() => { renderQueued = false; render(true); });
  }
  const standalonePractice = location.protocol === 'file:' || document.documentElement.dataset.offline === 'true';
  if (standalonePractice) {
    engine = window.SpiritGame.create({onChange:queueRender,onMessage:toast});
    engine.online = false;
    engine.now = () => Date.now();
    window.SpiritCardsOffline?.attach(engine, {onChange:queueRender,onMessage:toast});
    window.SpiritStudyOffline?.attach(engine, {onChange:queueRender,onMessage:toast});
    window.SpiritClock = {now:engine.now};
  } else {
    try { engine = await window.SpiritOnline.create({onChange:queueRender,onMessage:toast}); }
    catch (error) {
      window.SpiritGameBoot?.abort();
      // 智慧课堂：凭课堂登录进入；没登录、没入宗门、老师没开放时说明原因，回课程页面处理
      const reason = window.LingtianBridge?.explain?.(error) || { title: '洞天暂未连接', text: '云端暂时未能返回进度。请检查网络后重试；已有灵田进度仍保存在服务器。' };
      document.querySelector('.app-layout').hidden = true;
      $('game-boot-splash').hidden = true;
      const gate = document.createElement('main');
      gate.className = 'cloud-entry';
      gate.innerHTML = `<div class="cloud-entry-card"><span class="cloud-entry-seal">${icon('leaf')}</span><p class="eyebrow">云 间 灵 田 · 智 慧 课 堂</p><h1>${esc(reason.title)}</h1><p>${esc(reason.text)}</p><div class="cloud-entry-actions"><button type="button" class="button button-primary" data-lingtian-back>${icon('arrow')}返回课程页面</button><button type="button" class="button button-secondary" data-lingtian-retry>${icon('reset')}重新连接</button></div></div>`;
      gate.querySelector('[data-lingtian-back]').addEventListener('click', () => window.LingtianBridge?.goBack ? window.LingtianBridge.goBack() : history.back());
      gate.querySelector('[data-lingtian-retry]').addEventListener('click', () => location.reload());
      document.body.appendChild(gate);
      return;
    }
  }
  window.SpiritGameBoot?.prepareCards(engine);
  if (engine.online) window.LingtianBridge?.afterBoot?.(engine);
  economy = window.SpiritEconomyUI.create({engine,openDialog,toast,icon,esc,fmt,durationLabel,clockTime,renderGame:()=>render(true),onInspectCard:id=>openCards('collection',id)});
  const neighbors = () => engine.online ? engine.getNeighbors() : engine.state.neighbors;
  const getNeighbor = () => engine.online ? engine.getFarm(neighborId) : engine.state.neighbors.find(n => n.id === neighborId) || engine.state.neighbors[0];
  const emptyVisitingPlots = Array.from({length:plotCount},()=>({unlocked:false,cropId:null,stage:0,withered:false,nextWaterAt:0}));
  const currentPlots = () => mode === 'home' ? farmDisplayPlots() : getNeighbor()?.plots || emptyVisitingPlots;
  const canSteal = p => engine.online ? p.canSteal === true : mature(p) && !p.stolen;
  const remainingYield = p => Math.max(0,(cropMap[p.cropId]?.yield || 0)-(p.stolenUnits || 0));
  const stealPenalty = p => engine.farmRules?.penalties?.[p.cropId] || 0;
  const batchStealMinimum = () => (engine.online ? engine.farmRules?.batchStealMinRealm : window.SpiritGame.BATCH_STEAL_MIN_REALM) ?? 3;
  const visitState = p => p.attemptStatus === 'pending' ? '阵法待解' : p.attemptStatus === 'success' ? '本茬已采' : p.attemptStatus ? '本茬已探访' : p.stolenUnits ? '已达保留线' : p.withered ? (p.witheredReason === 'frost' ? '冬寒冻枯' : '已收割') : !p.cropId ? '净土待播' : mature(p) ? '已成熟' : '生长中';
  farmUI = window.SpiritFarmUI.create({engine,openDialog,closeDialog,dismissDialog,getNavigationRevision:()=>dialogNavigationRevision,toast,icon,esc,clockTime,visitFarm:id=>setView('neighbors',id),renderGame:()=>render(true),onHarvest:result=>{if(mode==='neighbors' && result.farmerId===neighborId)harvestBurst(result.index,result.cropId,result.qty,result.delay || 0);}});
  function harvestBurst(index, cropId, qty, delay = 0) {
    const garden = document.querySelector('.garden-card'), container = $('scene'), crop = cropMap[cropId];
    if (!garden || !crop || !qty) return;
    scene?.playAction?.('harvest', index, cropId);
    const point = scene?.getScreenPosition?.(index);
    const fallback = container.querySelector(`[data-plot="${index}"]`);
    const rect = fallback?.getBoundingClientRect(), bounds = container.getBoundingClientRect();
    const x = point?.x ?? (rect ? rect.left - bounds.left + rect.width / 2 : bounds.width / 2);
    const y = point?.y ?? (rect ? rect.top - bounds.top + rect.height / 2 : bounds.height / 2);
    const burst = document.createElement('div');
    burst.className = 'harvest-burst'; burst.setAttribute('aria-hidden', 'true');
    burst.style.cssText = `left:${x}px;top:${y - 24}px;--harvest-color:${ripeTraits[cropId].color};--burst-delay:${delay}ms`;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    burst.innerHTML = `${reduced ? '' : '<i class="harvest-ring"></i>' + Array.from({length:8}, (_, n) => {
      const a = n * Math.PI / 4;
      return `<i class="harvest-spark" style="--dx:${Math.cos(a) * (31 + n % 3 * 9)}px;--dy:${Math.sin(a) * 30 - 32}px;--spin:${n * 47}deg"></i>`;
    }).join('')}<span class="harvest-reward">${esc(crop.name)} <b>+${qty}</b></span>`;
    container.appendChild(burst);
    setTimeout(() => burst.remove(), 1500 + delay);
  }
  async function collectAll() {
    if (decorEditor?.isOpen()) return;
    const atHome = mode === 'home';
    if (atHome && farmActionsBlocked()) return;
    if (atHome) {
      const index = engine.state.plots.findIndex(mature);
      return index < 0 ? undefined : performFarmAction('harvest',index,true);
    }
    const navigation = dialogNavigationRevision;
    if(!atHome && engine.online && engine.pendingChallenge) return farmUI.openChallenge();
    if(!atHome && engine.state.realm<batchStealMinimum()) return toast('晋入元婴后解锁一键偷采；当前仍可逐田偷采。','info');
    if (!atHome && engine.online) {
      return farmUI.attemptAll(neighborId);
    }
    const result = await engine.stealAll(neighborId);
    if (!result.ok || navigation !== dialogNavigationRevision || activePage !== 'garden') return;
    result.items.forEach((item, n) => {
      if (atHome || item.success) harvestBurst(item.index, item.cropId, item.qty, n * 65);
    });
  }
  function openJourneyPage(html, nextTab = 'commissions') {
    if (decorEditor?.isOpen()) return false;
    // A pending farm visit must not replace the page the player just opened.
    ++visitViewRequest;
    if (nextTab !== 'sect' && (activePage === 'garden' || activeJourneyTab === 'sect')) {
      journeyReturnView = { page: activePage === 'journey' ? 'sect' : 'garden', mode, neighborId };
      journeyReturnTrigger = document.activeElement;
      journeyReturnWindow = $('game-dialog').open ? {entry:captureDialog(),history:dialogHistory.slice(),origin:dialogOrigin,trigger:lastDialogTrigger} : null;
      journeyReturnPanel = !$('game-dialog').open ? capturePanelOrigin() : null;
    }
    ++dialogNavigationRevision;
    setFullscreenPanel('');
    activePage = 'journey';
    activeJourneyTab = nextTab;
    lastDialogTrigger = null;
    dismissDialog();
    $('garden-page').hidden = nextTab === 'sect';
    $('journey-page').hidden = false;
    $('journey-page').innerHTML = html;
    $('journey-page').scrollTop = 0;
    scene?.setModalPaused?.(true);
    renderTop();
    window.scrollTo({top:0,behavior:'instant'});
    focusMainPage();
    return true;
  }
  function closeJourneyWindow() {
    if (activePage !== 'journey') return;
    noteNavigation();
    const returnWindow = journeyReturnWindow, returnPanel = journeyReturnPanel;
    journeyReturnWindow = null; journeyReturnPanel = null;
    if (journeyReturnView.page === 'sect') {
      journeyUI?.open('sect');
      focusMainPage();
    } else {
    activePage = 'garden';
    journeyUI?.deactivate?.();
    syncGameWindow('');
    $('journey-page').hidden = true;
    $('garden-page').hidden = false;
    mode = journeyReturnView.mode;
    neighborId = journeyReturnView.neighborId;
    scene?.setMode?.(mode === 'home' ? 'home' : 'neighbor');
    syncGardenRendering();
    render(true);
    requestAnimationFrame(() => scene?.resize?.());
    const trigger = journeyReturnTrigger;
    journeyReturnTrigger = null;
    if (trigger?.isConnected && !trigger.closest('[inert]') && trigger.getClientRects().length) trigger.focus({preventScroll:true});
    else focusMainPage();
    }
    if (returnWindow) {
      dialogHistory = returnWindow.history; dialogOrigin = returnWindow.origin; lastDialogTrigger = returnWindow.trigger;
      restoreDialog(returnWindow.entry);
    } else if (returnPanel) {
      setFullscreenPanel(returnPanel.name);
      const panel = panelNode(returnPanel.name);
      if (panel) panel.scrollTop = returnPanel.scrollTop;
      requestAnimationFrame(() => restoreFocus(returnPanel.focus, panel || document));
    }
  }
  async function setView(nextMode, id) {
    if (decorEditor?.isOpen()) return false;
    ++dialogNavigationRevision;
    setFullscreenPanel('');
    const request=++visitViewRequest;
    if (nextMode==='neighbors' && engine.online) {
      if(!id) {farmUI.openDirectory();return false;}
      const data=await engine.loadFarm(id);
      if(request!==visitViewRequest || !data || !engine.getFarm(id)) return false;
      neighborId=id;
    }
    const leavingJourney = activePage === 'journey';
    activePage = 'garden';
    if (leavingJourney) journeyUI?.deactivate?.();
    $('journey-page').hidden = true;
    $('garden-page').hidden = false;
    syncGardenRendering();
    engine.tick();
    mode = nextMode === 'neighbors' ? 'neighbors' : 'home';
    if (!engine.online && id && engine.state.neighbors.some(n => n.id === id)) neighborId = id;
    selectedPlot = null; plotSignature = ''; fallbackSignature = '';
    scene?.setMode?.(mode === 'home' ? 'home' : 'neighbor');
    render(true);
    if (leavingJourney) {
      window.scrollTo({top:0,behavior:'instant'});
      focusMainPage();
      requestAnimationFrame(() => scene?.resize?.());
    }
    return true;
  }
  function handlePlot(index) {
    if (decorEditor?.isOpen()) return;
    if (!Number.isInteger(index) || index < 0 || index >= plotCount) return;
    selectedPlot = index;
    const p = currentPlots()[index];
    if (mobileLayout() && selectedTool === 'auto') {
      scene?.focusPlot?.(index); plotSignature = ''; render(false);
      if (!fullscreenUI?.isActive()) requestAnimationFrame(() => {
        const detail = $('plot-detail');
        if (detail.getBoundingClientRect().bottom > window.innerHeight - 80) detail.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      });
      return;
    }
    if (mode === 'home') {
      if (!p.unlocked) return handleUnlockPlot(index);
      if (selectedTool === 'hoe') return performFarmAction('clear',index);
      if (selectedTool === 'wateringCan') return performFarmAction('water',index);
      if (p.withered) return performFarmAction('clear',index);
      if (!p.cropId) return performFarmAction('plant',index);
      if (growth(p).canWater) return performFarmAction('water',index);
    }
    scene?.focusPlot?.(index); plotSignature = ''; render(false);
  }

  function performFarmActionFromLabel(index,action) { return performFarmAction(action,index); }
  function getPlotUnlockInfo(index) {
    if (mode !== 'home' || !Number.isInteger(index) || index < 0 || index >= plotCount || engine.state.plots[index].unlocked) return null;
    const info = engine.getUnlockInfo(index);
    return {...info, realmName:realms[info.requiredRealm].name, realmReady:engine.state.realm >= info.requiredRealm, affordable:engine.state.stones >= info.cost};
  }
  async function handleUnlockPlot(index) {
    if (decorEditor?.isOpen()) return;
    if (farmActionsBlocked()) return;
    if (!getPlotUnlockInfo(index)) return;
    selectedPlot = index;
    const result = await engine.unlock(index);
    if (result.ok) { lastUnlockedPlot = index; lastUnlockedAt = Date.now(); }
    scene?.focusPlot?.(index);
    plotSignature = ''; fallbackSignature = '';
    render(true);
    if (result.ok) scene?.playAction?.('unlock', index);
  }
  function sessionDetail() {
    return engine.online ? (engine.authRequired ? (engine.blockedReason || (engine.pending ? '登录已过期，待确认操作已保留' : '登录已过期，请重新进入')) :engine.accountChanged ? '登录身份已变化，请刷新身份后继续' : engine.busy ? '正在确认操作…' : engine.pending ? '有操作待确认，请同步云端' : engine.connected ? '云端保存 · 灵草与丹药可进入共市' : '连接中断 · 恢复网络后可同步') : '离线独立存档 · 道友为模拟 NPC · 不参与云端交易';
  }
  function renderTop() {
    const mainPage = activePage === 'journey' ? 'journey' : mode;
    const pageTitles = {home:['我的灵田','今日也宜种草，静候一场丰收。'],neighbors:['拜访道友','御风串个门，顺手采一缕仙缘。'],journey:['仙途长卷','展卷寻山门，记下一草一丹的仙途。']};
    const [pageTitle,pageSubtitle] = pageTitles[mainPage];
    $('page-title').textContent = pageTitle;
    $('page-subtitle').textContent = pageSubtitle;
    const state = engine.state, stats = engine.getStats(), realm = realms[state.realm], max = state.realm === realms.length - 1;
    $('bag-count').textContent = stats.bagCount;
    $('bag-count').hidden = !stats.bagCount;
    $('realm-name').textContent = realm.name;
    $('realm-next').textContent = max ? '已至化神 · 万物通灵' : `下一境 · ${realms[state.realm + 1].name}`;
    const glyph = ['气','基','丹','婴','神'][state.realm];
    $('realm-glyph').textContent = glyph;
    $('hud-realm-glyph').textContent = glyph;
    $('qi-value').textContent = fmt(state.qi); $('qi-needed').textContent = max ? ' · 圆满' : ` / ${fmt(realm.qiNeeded)}`;
    $('hud-qi').textContent = max ? '五境圆满' : `${fmt(state.qi)} / ${fmt(realm.qiNeeded)}`;
    const progress = max ? 100 : Math.min(100, state.qi / realm.qiNeeded * 100);
    $('qi-progress').style.width = `${progress}%`; $('qi-ring').style.strokeDashoffset = 220 * (1 - progress / 100);
    $('hud-qi-progress').style.width = `${progress}%`;
    $('breakthrough-cost').textContent = max ? '' : ` · ${realm.qiNeeded} 修为`;
    $('breakthrough').disabled = max || !!engine.busy;
    $('breakthrough').querySelector('span').textContent = max ? '化神已成' : '尝试突破';
    $('breakthrough').classList.toggle('can-breakthrough', !max && state.qi >= realm.qiNeeded);
    $('player-name').textContent = engine.online ? engine.player.alias : '离线练习';
    $('session-title').textContent = engine.online ? `云端洞天 · ${engine.player.alias}` : '离线练习 · 独立进度';
    $('session-detail').textContent = sessionDetail();
    $('session-banner').hidden = !engine.online || !(engine.pending || engine.authRequired || engine.accountChanged || !engine.connected);
    $('session-banner').classList.toggle('is-local',!engine.online);
    $('session-banner').classList.toggle('is-pending',!!engine.pending || (engine.online && !engine.connected));
    $('sync-cloud').hidden = !engine.online || !!engine.authRequired;
    $('session-signin').hidden = !engine.authRequired;
    $('sync-cloud').disabled = !!engine.busy;
    $('sync-cloud').textContent = engine.accountChanged ? '刷新身份' : '同步云端';
    document.querySelectorAll('[data-settings-status]').forEach(node => { node.textContent = sessionDetail(); });
    const ladderSignature = String(state.realm);
    if ($('realm-ladder').dataset.realm !== ladderSignature) {
      $('realm-ladder').dataset.realm = ladderSignature;
      $('realm-ladder').innerHTML = realms.map((r, i) => `<li class="${i === state.realm ? 'current' : i < state.realm ? 'attained' : ''}" ${i === state.realm ? 'aria-current="step"' : ''} title="${r.name} · ${crops[i].name}${i===batchStealMinimum()?' · 解锁一键偷采':''}"><span>${i < state.realm ? '✓' : i + 1}</span><strong>${r.name}</strong></li>`).join('');
    }
    $('realm-unlock-hint').textContent = (max ? '五种灵植尽数解锁 · 可开垦全部 25 块灵田' : `晋入${realms[state.realm + 1].name}：解锁${crops[state.realm + 1].name}与下一排灵田`) + (state.realm>=batchStealMinimum()?' · 一键偷采已开启':state.realm+1===batchStealMinimum()?'，并开启一键偷采':' · 元婴解锁一键偷采');
    renderFullscreenControls();
  }
  function renderSeeds() {
    const realm = engine.state.realm;
    const signature = [realm,selectedCrop,selectedTool,mode].join('|');
    const focusedSeed = document.activeElement?.dataset?.seed;
    if (signature !== seedSignature) {
    seedSignature = signature;
    $('seed-tray').innerHTML = crops.map(c => {
      const locked = c.minRealm > realm;
      const selected = selectedTool === 'auto' && selectedCrop === c.id;
      return `<button class="seed-card ${selected ? 'selected' : ''} ${locked ? 'locked' : ''}" data-seed="${c.id}" aria-pressed="${selected}" aria-disabled="${locked}" title="${esc(c.name)} · ${locked ? esc(realms[c.minRealm].name) + '解锁' : c.price + '灵石 / 田'}" aria-label="${esc(c.name)}，${locked ? esc(realms[c.minRealm].name) + '解锁' : c.price + '灵石，' + durationLabel(c.growTime)}"><span class="seed-grade">${realms[c.minRealm].name} · ${locked ? '待解锁' : '已解锁'}</span><div class="seed-art">${art(c.id, true)}</div><h3>${c.name}</h3><p class="seed-yield">每田丰收 ${c.yield} 份</p><div class="seed-meta"><span class="seed-price">${icon(locked ? 'lock' : 'gem')}${locked ? realms[c.minRealm].name : c.price}</span><span class="seed-time" title="四次补水（雨天自动），按时照料的最短成熟时间">${icon('clock')}${durationLabel(c.growTime)}</span></div></button>`;
    }).join('');
    if (focusedSeed) $('seed-tray').querySelector(`[data-seed="${focusedSeed}"]`)?.focus({preventScroll:true});
    }
    $('seed-help').innerHTML = mode === 'home'
      ? `${icon('leaf')}已选「${cropMap[selectedCrop].name}」· ${cropMap[selectedCrop].price} 灵石 / 田 · 补水 4 次（雨天自动），每次间隔 ${durationLabel(cropMap[selectedCrop].waterIntervals[0])}，按时照料 ${durationLabel(cropMap[selectedCrop].growTime)} 成熟。`
      : engine.online ? `${icon('formation')}拜访同学的真实灵田 · 成熟可采，每田每茬共享 1 株额度；触发守田阵法须答题，失败按灵草等级赔付。` : `${icon('wind')}离线练习道友为 NPC，每 3 分钟重种；合计每天最多尝试 10 次，失败也计次。`;
  }
  function renderQuests() {
    const quests = engine.getQuests();
    $('quest-total').textContent = `${quests.filter(q => q.claimed).length} / ${quests.length}`;
    const icons = {plant:'leaf',harvest:'harvest',steal:'hand',breakthrough:'spark'};
    $('quest-list').innerHTML = quests.map(q => `<div class="quest-item ${q.claimed ? 'claimed' : ''}"><div class="quest-icon">${icon(icons[q.id])}</div><div class="quest-text"><strong>${q.name}</strong><small title="${esc(q.desc)}">${q.desc} · ${q.reward.stones}灵石</small></div>${q.claimed ? `<span class="quest-count">${icon('check')}</span>` : q.progress >= q.target ? `<button class="quest-claim" data-quest="${q.id}" aria-label="领取${q.name}奖励">领取</button>` : `<span class="quest-count">${q.progress}/${q.target}</span>`}</div>`).join('');
  }
  function renderJourneyEntry() {
    const summary = journeyUI?.getSummary?.();
    if (!summary) return;
    const quests = engine.getQuests(), starterReady = quests.filter(q => !q.claimed && q.progress >= q.target).length;
    const claimable = summary.claimable + starterReady, next = quests.find(q => !q.claimed);
    $('journey-entry-status').textContent = `${summary.dailyClaimed} / ${summary.dailyLimit} 已领`;
    $('journey-entry-note').textContent = summary.claimable ? `有 ${summary.claimable} 项成果可领取，入册看看。` : '照料灵草、开炉炼丹，慢慢积成一段仙途。';
    $('journey-entry-badge').textContent = summary.claimable || '';
    $('journey-entry-badge').hidden = !summary.claimable;
    $('hud-quest-title').textContent = claimable ? '仙途有获 · 待领取' : next?.name || '山中有期';
    $('hud-quest-note').textContent = claimable ? `${claimable} 项奖励等你收下` : next ? `${Math.min(next.progress,next.target)} / ${next.target} · 查看修行小记` : `今日委托 ${summary.dailyClaimed} / ${summary.dailyLimit}`;
    $('hud-quest-badge').textContent = claimable || '';
    $('hud-quest-badge').hidden = !claimable;
    const stats = engine.getStats(), brew = engine.getAlchemyInfo().brew;
    $('arrival-entry-note').textContent = [stats.matureCount ? `${stats.matureCount}田可收` : '',stats.needsWaterCount ? `${stats.needsWaterCount}田待浇` : '',brew?.ready ? '丹药已成' : ''].filter(Boolean).join(' · ') || '查看丹炉、田块与最近往来';
  }
  function openArrival() {
    const stats = engine.getStats(), alchemy = engine.getAlchemyInfo(), now = engine.now();
    const waiting = engine.state.plots.map(p=>growth(p)).filter(p=>p.remainingMs>0).sort((a,b)=>a.remainingMs-b.remainingMs)[0];
    const recent = (engine.state.events || []).slice(0,8);
    const date = time => new Date(time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    openDialog('arrival','洞天近况',`<p class="dialog-intro">${esc(date(now))} · 北京时间。看看田间的长势，也看看最近的收获与往来。</p><div class="arrival-grid"><button data-arrival-care><span>${icon('harvest')}成熟待采</span><strong>${stats.matureCount}<small>块田</small></strong></button><button data-arrival-care><span>${icon('drop')}待浇灵植</span><strong>${stats.needsWaterCount}<small>块田</small></strong></button><button data-open="alchemy"><span>${icon('fire')}丹炉近况</span><strong class="arrival-word">${alchemy.brew ? alchemy.brew.ready ? '可以收丹' : '炉火温养中' : '可以开炉'}</strong></button><button data-journey-open="commissions"><span>${icon('book')}宗门委托</span><strong class="arrival-word">${journeyUI?.getSummary?.().claimable ? '有成果待领' : '继续积累'}</strong></button></div>${waiting ? `<p class="guide-note">下一次灵植养足还需 ${timeLeft(waiting.remainingMs)}；雨中会自动补水，晴天可继续用灵泉浇灌。冬季未成熟灵植偶有冻害。</p>` : ''}<section class="settings-section"><h3>最近的灵田小记</h3><ul class="history-list">${recent.map(event=>`<li><span>${esc(event.text)}</span><time>${esc(date(event.time))}</time></li>`).join('') || '<li>草木正生长，第一段小记等你写下。</li>'}</ul></section>`);
  }
  function renderNeighbors() {
    const list = neighbors();
    const total=list.reduce((sum,n)=>sum+(engine.online?n.stealableCount:n.plots.filter(p=>mature(p)&&!p.stolen).length),0);
    $('stealable-count').textContent = total;
    $('stealable-count').hidden = !total;
    $('neighbor-strip').innerHTML = list.map(n => `<button class="neighbor-tab ${neighborId === n.id ? 'active' : ''}" data-visit="${esc(n.id)}" aria-pressed="${neighborId === n.id}"><span class="avatar" style="background:${esc(n.color)}23;color:${esc(n.color)}">${esc(n.avatar)}</span>${esc(n.name)}<small>${engine.online?'守田阵法':n.guard+'% 护园 · 练习'}</small></button>`).join('')+(engine.online?'<button class="neighbor-tab" data-farm-ui="directory">'+icon('users')+'全部道友</button>':'');
    const tip=document.querySelector('.neighbor-tip');
    if(tip)tip.textContent=engine.online?'同学入境后即可互访，田地与收成实时共享。':'本机模拟道友 · 练习资产独立保存。';
  }
  function renderGarden() {
    if (activePage !== 'garden' || isGardenCovered()) return;
    if(mode==='neighbors' && !getNeighbor())mode='home';
    const atHome = mode === 'home', stats = engine.getStats(), n = getNeighbor();
    $('location-name').textContent = atHome ? '青云峰 · 自家洞天' : `${n.title.split(' · ')[0]} · ${n.name}`;
    $('land-count').textContent = atHome ? `灵田 ${stats.unlockedCount} / ${plotCount}` : `道友灵田 ${n.plots.filter(p => p.unlocked).length} / ${plotCount}`;
    $('neighbor-strip').hidden = atHome;
    const pendingAnswer=!atHome && engine.online && !!engine.pendingChallenge;
    const batchLocked=!atHome && !pendingAnswer && engine.state.realm<batchStealMinimum();
    $('harvest-all').innerHTML = icon(atHome ? 'harvest' : pendingAnswer ? 'formation' : batchLocked ? 'lock' : 'hand') + `<span>${atHome ? '一键收获' : pendingAnswer ? '继续答题' : '一键偷采'}${batchLocked?'<small class="bulk-unlock-hint">元婴解锁</small>':''}</span>`;
    $('harvest-all').title=atHome?'收获自家所有成熟灵草':pendingAnswer?'继续当前守田阵法，答题完成后不会自动续偷':batchLocked?'元婴境界解锁一键偷采；当前仍可点击田块逐田偷采':engine.online?'依次偷采当前道友的成熟灵草，遇守田阵法立即暂停':'偷采当前模拟道友的成熟灵草';
    $('harvest-all').setAttribute('aria-label',atHome?'一键收获':pendingAnswer?'继续答题':batchLocked?'一键偷采，元婴境界解锁':'一键偷采');
    if (atHome) {
      const summary = [stats.matureCount ? `<b>${stats.matureCount} 田可收</b>` : '',stats.witheredCount ? `${stats.witheredCount} 田枯草待清` : '',stats.needsWaterCount ? `${stats.needsWaterCount} 田${isRaining() ? '雨水照料中' : '待浇水'}` : '',stats.growingCount > stats.needsWaterCount ? `${stats.growingCount - stats.needsWaterCount} 田静养中` : '',stats.emptyCount ? `${stats.emptyCount} 田可播种` : ''].filter(Boolean);
      if (isRaining()) summary.push('细雨自动补水');
      $('garden-summary').innerHTML = summary.join(' · ') || '四时耕作，静候丰收';
      $('scene-note-text').textContent = `${plotCount - stats.unlockedCount} 块待开垦 · 五境渐开一方洞天`;
      $('harvest-all').disabled = !stats.matureCount || farmActionsBlocked();
    } else {
      const count = n.plots.filter(canSteal).length;
      $('garden-summary').innerHTML = `<b>${count} 块田可探访</b> · 今日剩 ${engine.getAlchemyInfo().stealAttemptsLeft} 次 · ${engine.online?'阵法触发':'被发现概率'} ${n.guard}%`;
      $('scene-note-text').textContent = engine.online ? '每田共享 1 株可采额度 · 主人至少保留 75% · 答错须赔付' : `离线练习 · 被发现最多赔 ${n.penalty} 灵石 · ${timeLeft(n.nextRefresh - engine.now())}后重种`;
      $('harvest-all').disabled = engine.online ? !!engine.busy || (!pendingAnswer && (batchLocked || !n.plots.some(p=>canSteal(p) && engine.state.stones>=stealPenalty(p)) || !engine.getAlchemyInfo().stealAttemptsLeft)) : batchLocked || !count || !engine.getAlchemyInfo().stealAttemptsLeft;
    }
    $('scene-bottom-hint').innerHTML = mobileLayout() ? (fullscreenUI?.isActive() ? '单指环看 · 双指缩放 · 轻点照料' : '上下滑动浏览 · 双指缩放 · 轻点田块') : atHome ? '锄草 · 播种 · 分段浇水<span>·</span>滚轮缩放' : visitStudyDecor()?.displayCards.length ? '点击成熟灵草偷采<span>·</span>点书案卡框可赏鉴' : '点击成熟灵草偷采<span>·</span>每田每轮一次';
    if (scene?.supported) scene.update(engine.state, {kind:atHome ? 'home' : 'neighbor', plots:currentPlots(), neighborId:atHome ? undefined : neighborId, selectedPlot, farmBusy:atHome && farmActionsBlocked(), farmActivity:atHome && farmOperation ? {...farmActionState(farmOperation.indices[0]),indices:farmOperation.indices} : null, decorations:atHome ? engine.getDecorInfo?.().equipped || [] : n?.decorations || [], decorationLayout:atHome ? engine.getDecorInfo?.().layout || [] : n?.decorationLayout || [], decorationThemes:atHome ? engine.getDecorInfo?.().themes || {} : n?.decorationThemes || {}, residenceId:atHome ? engine.getResidenceInfo?.().equipped || null : n?.residenceId || null});
    else renderFallback();
    renderPlotDetail();
  }
  function renderPlotDetail() {
    const el = $('plot-detail');
    document.querySelector('.garden-column')?.classList.toggle('has-plot-detail',selectedPlot !== null);
    if (selectedPlot === null) { el.hidden = true; plotSignature = ''; return; }
    const p = currentPlots()[selectedPlot], c = cropMap[p.cropId], s = engine.state, g = growth(p), ready = mature(p);
    const targetSignature = mode === 'home' ? [engine.getToolTargets('hoe',selectedPlot),engine.getToolTargets('wateringCan',selectedPlot)] : [];
    const signature = JSON.stringify([mode,neighborId,selectedPlot,p,ready,g.canWater,isRaining(),s.realm,s.stones,s.tools,selectedCrop,targetSignature,engine.pendingChallenge?.id,engine.busy,engine.getAlchemyInfo().stealAttemptsLeft,farmActionSignature()]);
    el.hidden = false;
    if (signature === plotSignature) {
      const timer = el.querySelector('[data-countdown]');
      if (timer) { timer.textContent = clockTime(g.remainingMs); timer.setAttribute('aria-label',timeLeft(g.remainingMs)); }
      return;
    }
    plotSignature = signature;
    const ripe = !!c && ready && !p.stolen;
    el.classList.toggle('ripe-detail',ripe); el.classList.toggle('withered-detail',!!p.withered);
    el.style.setProperty('--ripe-color',c ? ripeTraits[c.id].color : '#d69936');
    let title = c ? c.name : '空闲灵田', detail = '', action = '', actionNote = '', stages = '';
    let tone = 'rest', stateName = '', stateIcon = 'leaf', statusLabel = '', statusValue = '', statusFoot = '', countdown = false;
    const image = p.withered ? `<span class="plot-detail-art withered-art">${icon('hoe')}</span>` : c ? `<span class="plot-detail-art">${art(c.id,ripe)}</span>` : `<span class="plot-detail-art empty-art">${icon(p.unlocked ? 'seed' : 'mountain')}</span>`;
    if (!p.unlocked && mode === 'neighbors') {
      title = '道友尚未开垦'; detail = '这块田仍在休养，先看看园中成熟的灵植。'; stateName = '未开垦'; stateIcon = 'lock';
    } else if (!p.unlocked) {
      const info = engine.getUnlockInfo(selectedPlot); title = '尚待开垦';
      detail = '辟一方新土，再种满园灵香。'; stateName = '未开垦'; stateIcon = 'lock';
      statusLabel = '开垦所需'; statusValue = `${info.cost} <em>灵石</em>`; statusFoot = `${realms[info.requiredRealm].name}境界可开垦`;
      action = `<button class="button button-primary" data-action="unlock" ${s.realm < info.requiredRealm || s.stones < info.cost ? 'disabled' : ''}>${icon('leaf')}开垦灵田</button>`;
    } else if (mode === 'neighbors') {
      const n = getNeighbor();
      if(engine.online) {
        const penalty=stealPenalty(p), pending=engine.pendingChallenge, canAfford=s.stones>=penalty;
        stateName=visitState(p); stateIcon=p.attemptStatus==='pending'?'formation':ready?'harvest':'leaf';tone=ready?'gold':'rest';
        detail=p.attemptStatus==='pending'?'阵法正在等待你的答案；收起窗口不会重置本次问道。':p.attemptStatus==='success'?'本茬已采得 1 株，留些仙缘给道友。':p.attemptStatus?'本田本茬已经探访，待田主重新种植后再来。':p.stolenUnits?'这一茬的共享可采额度已用完，余下收成由田主收获。':p.withered?(p.witheredReason==='frost'?'这株灵植受到冬寒影响，已经冻枯，等待田主清理。':'田主已经收割，留下残茬等待清理。'):!c?'道友尚未播种，稍后来看看。':ready?`${n.guard}% 概率触发阵法；答错、超时或放弃，赔 ${penalty} 灵石给田主。`:'灵植由田主或真实雨水继续照料，成熟后才能探访。';
        if(c && ready) {statusLabel='田中剩余收成';statusValue=`${p.remainingYield ?? remainingYield(p)} <em>株灵草</em>`;statusFoot=`本茬最多被偷 1 株 · 已被采 ${p.stolenUnits || 0} 株`;}
        else if(c && !p.withered) {statusLabel=g.canWater?(isRaining()?'雨水正在滋润':'等待田主照料'):'下一次补水';statusValue=g.canWater?(isRaining()?'自动照料中':'待浇水'):clockTime(g.remainingMs);statusFoot=`已补水 ${g.waterings} / 4 次${p.rainWaterings?' · 雨水 '+p.rainWaterings+' 次':''}`;countdown=!g.canWater;}
        if(pending)action=`<button class="button button-primary" data-farm-ui="resume">${icon('formation')}继续阵法答题</button>`;
        else action=`<button class="button button-primary" data-action="steal" ${!canSteal(p)||!canAfford||engine.busy||!engine.getAlchemyInfo().stealAttemptsLeft?'disabled':''}>${icon('hand')}${!canAfford&&canSteal(p)?'灵石不足':canSteal(p)?'悄悄采一株':stateName}</button>`;
        actionNote=canSteal(p)?`须备 ${penalty} 灵石；触阵时冻结，答对退回`:'同人同田，每茬只能尝试一次';
      } else {
        stateName = p.stolen ? '本轮已探访' : ready ? '已成熟' : '生长中'; stateIcon = ready ? 'harvest' : 'leaf'; tone = ready ? 'gold' : 'rest';
        detail = p.stolen ? (p.stolenSuccess ? '本轮已采得一份，留些仙缘给道友。' : '本轮已被发现，待重新种植再来。') : ready ? `练习成功率 ${100 - n.guard}% · 被发现最多赔 ${n.penalty} 灵石` : '练习灵植正在生长，成熟后可以采得一份仙缘。';
        if (!p.stolen && !ready) { statusLabel = '成熟倒计时'; statusValue = clockTime(g.remainingMs); statusFoot = '模拟道友灵植自行生长'; countdown = true; }
        action = `<button class="button button-primary" data-action="steal" ${p.stolen || !ready ? 'disabled' : ''}>${icon('hand')}${p.stolen ? '本轮已探访' : '悄悄采一株'}</button>`;
      }
    } else if (p.withered) {
      const targets = engine.getToolTargets('hoe',selectedPlot);
      detail = p.witheredReason === 'frost' ? '这株灵植受到冬寒影响，已经冻枯。用锄头清理后，就能重新播种。' : '采收后的残茬留在田中，锄净后即可再种。'; tone = 'earth'; stateName = p.witheredReason === 'frost' ? '冬寒冻枯' : '枯草待清'; stateIcon = 'hoe';
      statusLabel = '下一道工序'; statusValue = '清理枯草'; statusFoot = '清理后可重新播种';
      action = `<button class="button button-primary" data-action="clear">${icon('hoe')}铲除枯草</button>`;
      actionNote = `锄头 Lv.${s.tools.hoe} · 本次清理 ${targets.length} 田`;
    } else if (!c) {
      title = '一方净土'; detail = `已选${cropMap[selectedCrop].name}，播下灵种开启新一季。`; stateName = '可播种'; stateIcon = 'seed';
      statusLabel = '灵种价格'; statusValue = `${cropMap[selectedCrop].price} <em>灵石</em>`; statusFoot = isRaining() ? '播种后雨水自动滋润' : '播种后需浇第一遍水';
      action = `<button class="button button-primary" data-action="plant">${icon('seed')}播种</button>`;
    } else if (ready) {
      detail = `${ripeTraits[c.id].text}，可以采收入囊了。`; tone = 'gold'; stateName = '灵韵已满'; stateIcon = 'spark';
      statusLabel = '本田收成'; statusValue = `${remainingYield(p)} <em>份灵植</em>`; statusFoot = p.stolenUnits ? `本茬已被采 ${p.stolenUnits} 株 · 余下均归你` : `全售可得 ${remainingYield(p)*c.sellPrice} 灵石`;
      action = `<button class="button button-primary" data-action="harvest">${icon('harvest')}采收</button>`;
      actionNote = engine.online ? `每茬最多被偷 1 株 · 采收后清理残茬` : '采收后，用锄头清理残茬';
    } else {
      const targets = engine.getToolTargets('wateringCan',selectedPlot), next = Math.min(4,g.stage + 1);
      tone = g.canWater ? 'water' : 'rest'; stateName = g.canWater ? '待浇水' : `${g.stageName} · 静养`; stateIcon = g.canWater ? 'drop' : 'leaf';
      detail = g.canWater ? (g.stage === 0 ? '灵种已入土，浇下第一遍水后萌芽。' : '灵植已养足，浇水后进入下一形态。') : '正在吸收灵泉，待倒计时结束后继续照料。';
      statusLabel = g.canWater ? '灵泉已备' : '下次浇水'; statusValue = g.canWater ? '现在可浇' : clockTime(g.remainingMs); statusFoot = `已浇 ${g.waterings} / 4 次`; countdown = !g.canWater;
      action = `<button class="button ${g.canWater ? 'button-primary' : 'button-secondary'}" data-action="water" ${g.canWater ? '' : 'disabled'}>${icon(g.canWater ? 'watering' : 'clock')}${g.canWater ? '浇水' : '静养中'}</button>`;
      actionNote = g.canWater ? `第 ${next} 次 · 本次 ${targets.length} 田 · 免费` : `下一次为第 ${next} 次浇水 · 免费`;
      if (isRaining()) {
        tone = 'water'; stateName = '雨水照料'; stateIcon = 'drop';
        detail = '细雨会在每次需要浇水时自动滋润灵植，四段成长仍按原来的间隔推进。';
        statusLabel = g.canWater ? '雨水正在滋润' : '下一次补水'; statusValue = g.canWater ? '自动照料中' : clockTime(g.remainingMs);
        action = `<button class="button button-secondary" disabled>${icon('drop')}雨水照料中</button>`;
        actionNote = '雨停后，尚未补足的阶段可继续用灵泉浇灌';
      }
      statusFoot = `已补水 ${g.waterings} / 4 次${p.rainWaterings ? ' · 雨水 '+p.rainWaterings+' 次' : ''}`;

    }
    if (c && !p.withered && mode === 'home') stages = `<ol class="growth-steps" aria-label="已补水 ${g.waterings} 次，共需 4 次">${['灵种','萌芽','舒叶','蕴灵','成熟'].map((name,i)=>`<li class="${i < g.stage ? 'done' : i === g.stage ? 'current' : ''}" ${i === g.stage ? 'aria-current="step"' : ''}><i>${i < g.stage ? '✓' : i === 0 ? '·' : i}</i><span>${name}</span></li>`).join('')}</ol>`;
    const activity = farmActionState(selectedPlot);
    if (activity) {
      stateName = activity.label; stateIcon = activity.glyph; countdown = false;
      statusLabel = '本次照料'; statusValue = activity.label; statusFoot = activity.note;
      action = `<button class="button button-secondary farm-action-pending" data-phase="${activity.phase}" disabled aria-busy="${activity.phase !== 'unconfirmed'}">${icon(activity.glyph)}${activity.label}</button>`;
      if (activity.phase === 'unconfirmed') action += `<button class="button button-primary" data-sync-cloud>${icon('cloud')}同步云端</button>`;
      actionNote = activity.note;
    } else if (mode === 'home' && farmActionsBlocked()) action = action.replace(/data-action="(unlock|clear|water|plant|harvest)"/g,'disabled data-action="$1"');
    if (c && ready && scene?.inspectPlot) action = `<button class="button button-secondary" data-inspect-plot>${icon('expand')}细看灵植</button>` + action;
    el.dataset.tone = tone;
    const status = statusLabel ? `<div class="plot-status-panel"><span class="plot-status-caption">${icon(countdown ? 'clock' : tone === 'earth' ? 'hoe' : tone === 'gold' ? 'spark' : tone === 'water' ? 'drop' : 'leaf')}${statusLabel}</span><strong class="plot-status-value ${countdown ? 'is-countdown' : ''}">${countdown ? `<time data-countdown aria-label="${timeLeft(g.remainingMs)}">${statusValue}</time>` : statusValue}</strong><small>${statusFoot}</small></div>` : '';
    el.innerHTML = `<div class="plot-detail-main">${image}<div class="plot-detail-info"><span class="plot-detail-kicker">灵田 · ${String(selectedPlot+1).padStart(2,'0')}</span><h3>${title}<span class="plot-state-badge">${icon(stateIcon)}${stateName}</span></h3><p>${detail}</p>${stages}</div></div>${status}<div class="plot-detail-actions"><div class="plot-action-buttons">${action}</div>${actionNote ? `<small class="plot-action-note">${actionNote}</small>` : ''}</div><button class="icon-button" data-close-plot aria-label="收起田块信息">${icon('close')}</button>`;
  }

  function renderFallback() {
    const plots = currentPlots();
    const sig = JSON.stringify([mode,neighborId,selectedPlot,selectedTool,engine.state.realm,engine.state.stones,farmActionSignature(),plots.map(p => [p.cropId,p.unlocked,p.withered,p.stage,growth(p).canWater,mature(p),p.stolen,p.stolenUnits,p.attemptStatus])]);
    if (sig === fallbackSignature) {
      $('scene').querySelectorAll('[data-fallback-countdown]').forEach(el => el.textContent = clockTime(growth(plots[Number(el.dataset.fallbackCountdown)]).remainingMs));
      return;
    }
    fallbackSignature = sig;
    $('scene').innerHTML = `<div class="fallback-grid">${plots.map((p,i) => {
      const info = !p.unlocked ? getPlotUnlockInfo(i) : null, g = growth(p), activity = farmActionState(i);
      const requirement = info ? !info.realmReady ? `${info.realmName}可开垦` : !info.affordable ? '灵石不足' : '灵石' : '';
      const action = mode !== 'home' ? '' : p.withered ? 'clear' : g.canWater ? 'water' : !p.cropId && p.unlocked ? 'plant' : mature(p) ? 'harvest' : '';
      const text = mode==='neighbors' && engine.online ? !p.unlocked?'道友未开垦':visitState(p) : info ? `开垦 · ${info.cost}` : !p.unlocked ? '道友未开垦' : p.stolen ? '本轮已探访' : p.withered ? '铲枯草' : !p.cropId ? '点击播种' : mature(p) ? `${cropMap[p.cropId].name} · ${p.stolenUnits?'剩 '+remainingYield(p)+' 株':'成熟'}` : g.canWater ? `浇水 · 第${g.stage+1}次` : mode === 'home' ? '下次浇水' : '成熟倒计时';
      const description = info ? `开垦需要 ${info.cost} 灵石，${realms[info.requiredRealm].name}` : `${p.cropId ? cropMap[p.cropId].name+'，' : ''}${text}`;
      const picture = p.withered ? icon('hoe') : p.cropId && g.stage === 0 ? icon('seed') : p.cropId && g.stage === 1 ? icon('leaf') : p.cropId ? art(p.cropId,mature(p)&&!p.stolen) : icon(info ? 'leaf' : p.unlocked ? 'leaf' : 'lock');
      return `<button class="fallback-plot ${activity ? 'farm-action-pending' : ''} ${!p.unlocked ? 'locked' : p.withered ? 'withered' : !p.cropId ? 'empty' : mature(p)&&!p.stolen ? 'mature' : ''} ${selectedPlot === i ? 'selected' : ''}" ${info ? 'data-unlock-plot' : 'data-plot'}="${i}" ${action ? `data-farm-action="${action}"` : ''} ${mode === 'home' && farmActionsBlocked() ? 'disabled' : ''} ${activity ? `data-phase="${activity.phase}" aria-busy="${activity.phase !== 'unconfirmed'}"` : ''} aria-label="第${i+1}块灵田，${esc(activity ? activity.label+'，'+activity.note : description)}" title="${esc(activity ? activity.note : description)}">${activity ? icon(activity.glyph) : picture}<span>${esc(activity ? activity.label : text)}</span>${activity ? `<small>${esc(activity.note)}</small>` : info ? `<small>${esc(requirement)}</small>` : p.cropId && !p.withered && !mature(p) && !g.canWater ? `<small data-fallback-countdown="${i}">${clockTime(g.remainingMs)}</small>` : ''}</button>`;
    }).join('')}</div><span class="fallback-note">轻量灵田模式</span>`;
  }

  function render(full) {
    reconcileFarmOperation();
    renderTop(); renderFarmTools(); renderGarden(); journeyUI?.update(); renderJourneyEntry();
    if (full) { renderSeeds(); renderQuests(); renderNeighbors(); if (dialogKind === 'bag') renderInventory(dialogKind); else if (dialogKind === 'tools') renderWorkshop(); }
    if (dialogKind === 'plots') renderPlotCare();
    economy?.refresh(dialogKind);
    farmUI?.refresh(dialogKind);
    decorEditor?.update();
    cardsUI?.render();
    engine.setStudyActive?.(!!cardsUI?.isOpen()||activePage==='journey');
    renderStudyDecor();
    engine.setCardsActive?.(!!cardsUI?.isOpen()||!!economy?.isCardsMarketVisible?.());
    window.SpiritGameBoot?.tryDaily();
  }
  function noteNavigation() { ++dialogNavigationRevision; ++visitViewRequest; }
  function isGardenCovered() {
    // 智慧课堂 2026-11-22：静修（进修模块，focus-host.js）打开时也算盖住，3D 场景暂停
    return document.body.classList.contains('game-booting') || !!cardsUI?.isOpen() || document.body.dataset.focusOpen === '1';
  }
  let exhibitHintShown = false;
  function renderStudyDecor() {
    if (isGardenCovered()) return;
    const visit = mode === 'home' ? null : visitStudyDecor();
    scene?.setStudyDecor?.(mode==='home'?engine.study:visit);
    // 第一次看到道友的藏真书案时提示一次：卡框可以点开赏鉴
    if (visit?.displayCards.length && !exhibitHintShown && activePage === 'garden' && scene?.supported) {
      exhibitHintShown = true;
      const top = visit.displayCards.map(id => window.SpiritCards?.getCard(id)).filter(card => card && ['UR','SSR'].includes(card.rarity)).sort((a,b) => (b.rarity === 'UR') - (a.rarity === 'UR'))[0];
      toast(`${getNeighbor()?.name || '道友'}的藏真书案上陈列着${top ? (top.rarity === 'UR' ? '天品' : '地品') + '卡' : ' ' + visit.displayCards.length + ' 张卡'}，点书案上的卡框可以赏鉴。`,'info');
    }
  }
  // 智慧课堂 2026-11-19：拜访道友时也摆出田主的藏真书案（陈列的卡牌、参悟阶段和纪念物，来自云端 farm.study）
  function studyRewardItem(courseId, id) {
    const core = window.SpiritStudyCore;
    if (!core || typeof id !== 'string') return null;
    const items = [core.WEEKLY_REWARD, ...((core.bank?.(courseId)?.topics) || []).map(topic => topic?.reward)];
    return items.find(item => item && item.id === id) || null;
  }
  function visitStudyDisplay() {
    if (mode !== 'neighbors' || !engine.online) return null;
    const study = getNeighbor()?.study;
    if (!study || typeof study !== 'object' || typeof study.courseId !== 'string') return null;
    const cards = (Array.isArray(study.cards) ? study.cards : []).filter(card => typeof card?.id === 'string' && window.SpiritCards?.getCard(card.id)?.courseId === study.courseId).slice(0, 3);
    return {courseId:study.courseId, cards, reward:studyRewardItem(study.courseId, study.rewardId)};
  }
  function visitStudyDecor() {
    const display = visitStudyDisplay();
    if (!display || (!display.cards.length && !display.reward)) return null;
    const stages = Object.fromEntries(display.cards.map(card => [card.id, {stage:Math.max(0, Math.min(4, Math.floor(Number(card.stage)) || 0))}]));
    return {available:true, visitor:true, courseId:display.courseId, displayCards:display.cards.map(card => card.id), cards:stages,
      rewards:display.reward ? {selectedId:display.reward.id, unlockedIds:[display.reward.id], items:[display.reward]} : {}, sect:{available:false}};
  }
  // 点藏真书案上的卡框：在自己灵田里打开自己的这张卡；拜访道友时以“道友陈列”只读方式赏鉴
  function handleStudyCard(id) {
    if (activePage !== 'garden' || decorEditor?.isOpen() || cardsUI?.isOpen() || typeof id !== 'string') return;
    if (mode === 'home') {
      if (!(engine.study?.displayCards || []).includes(id)) return;
      openCards('collection', id, {returnTo:'灵田'});
      return;
    }
    const display = visitStudyDisplay(), entry = display?.cards.find(card => card.id === id);
    if (!entry) return;
    openCards('collection', id, {exhibit:{owner:getNeighbor()?.name || '道友', stage:entry.stage, courseId:display.courseId}, returnTo:'灵田'});
  }
  function syncGardenRendering() {
    scene?.setModalPaused?.(isGardenCovered() || activePage !== 'garden' || $('game-dialog').open || $('fullscreen-orientation').open);
  }
  function captureFocus(node = document.activeElement) {
    return node ? {node,id:node.id || '',tag:node.tagName,dataset:{...(node.dataset || {})}} : null;
  }
  function restoreFocus(saved, host = document) {
    if (!saved) return false;
    const usable = node => node?.isConnected && !node.disabled && !node.closest?.('[inert]') && node.getClientRects().length;
    let node = saved.node;
    if (!usable(node) && saved.id) node = $(saved.id);
    if (!usable(node) && Object.keys(saved.dataset).length) {
      node = [...host.querySelectorAll('button,a,input,select,textarea,summary,[tabindex]')].find(candidate =>
        candidate.tagName === saved.tag && Object.entries(saved.dataset).every(([key,value]) => candidate.dataset[key] === value) && usable(candidate));
    }
    if (!usable(node)) return false;
    node.focus({preventScroll:true}); return true;
  }
  function panelNode(name) {
    return {camera:document.querySelector('.camera-controls'),cultivation:$('cultivation-panel'),quests:$('quests-panel')}[name];
  }
  function capturePanelOrigin() {
    const panel = panelNode(fullscreenPanel);
    if (!panel) return null;
    return {type:'sheet',name:fullscreenPanel,title:{camera:'镜头视角',cultivation:'五境修行',quests:'今日修行'}[fullscreenPanel],scrollTop:panel.scrollTop,focus:captureFocus()};
  }
  function captureDialog() {
    const content = $('dialog-content');
    return {kind:dialogKind,title:$('dialog-title').textContent,overline:$('dialog-overline').textContent,emblem:$('dialog-emblem').innerHTML,
      nodes:[...content.childNodes],scrollTop:content.scrollTop,scrollLeft:content.scrollLeft,focus:captureFocus()};
  }
  function openCards(tab = 'draw', cardId = null, {fullscreenDraw = false, exhibit = null, returnTo = ''} = {}) {
    if(tab==='market'){openCardsMarket(cardId);return;}
    if (decorEditor?.isOpen()) return;
    if (!cardsUI) return toast('道藏正在准备，请稍后重试。','info');
    if (cardsUI.isOpen()) { if(cardId)cardsUI.inspectCard(cardId,{exhibit,returnTo});else cardsUI.open(tab,{fullscreenDraw}); return; }
    cardsReturnTrigger = captureFocus();
    cardsReturnWindow = $('game-dialog').open ? {entry:captureDialog(),history:[...dialogHistory],origin:dialogOrigin,trigger:lastDialogTrigger} : null;
    noteNavigation();
    if ($('game-dialog').open) dismissDialog();
    setFullscreenPanel('');
    engine.setCardsActive?.(true);
    cardsUI.open(tab,{preserveMarket:!!cardId,fullscreenDraw});
    if(cardId)cardsUI.inspectCard(cardId,{exhibit,returnTo});
    syncCardOrientationPrompt();
    syncGameWindow('cards');
    scene?.setModalPaused?.(true);
    journeyUI?.update();
    renderFullscreenControls();
    requestAnimationFrame(() => { if (cardsUI.isOpen() && !$('fullscreen-orientation').open) focusMainPage(); });
  }
  function canOpenDailyCards() {
    return activePage==='garden'&&mode==='home'&&!fullscreenPanel&&!farmOperation&&!$('game-dialog').open&&!cardsUI?.isOpen()&&!decorEditor?.isOpen()&&!engine.pendingChallenge;
  }
  function openDailyCards() {
    openCards('draw',null,{fullscreenDraw:true});
    return !!cardsUI?.isOpen();
  }
  function openCardsMarket(cardId) {
    if(cardsUI?.isOpen()){cardsReturnWindow=null;cardsReturnTrigger=null;cardsUI.close();}
    economy.openMarket(cardId?'card:'+cardId:'cards');
    engine.setCardsActive?.(!!economy.isCardsMarketVisible?.());
  }
  function returnFromCards() {
    const saved = cardsReturnWindow, trigger = cardsReturnTrigger;
    cardsReturnWindow = null; cardsReturnTrigger = null;
    engine.setCardsActive?.(false);
    noteNavigation();
    renderFullscreenControls();
    // Card reading keeps the authoritative clock and cloud state running. Apply
    // its latest garden and study display before allowing the next scene frame.
    renderGarden();
    renderStudyDecor();
    if (saved) {
      dialogHistory = saved.history; dialogOrigin = saved.origin; lastDialogTrigger = saved.trigger;
      restoreDialog(saved.entry);
      syncCardOrientationPrompt();
      engine.setCardsActive?.(!!economy.isCardsMarketVisible?.());
      return;
    }
    syncCardOrientationPrompt();
    syncGardenRendering();
    journeyUI?.update();
    if (!$('fullscreen-orientation').open && !restoreFocus(trigger)) focusMainPage();
  }
  function renderDialogNavigation() {
    const parent = dialogHistory[dialogHistory.length - 1] || dialogOrigin;
    const button = $('dialog-back');
    if (!button) return;
    button.hidden = !parent;
    const title = parent?.title?.replace(/ · .*/, '') || '';
    $('dialog-back-label').textContent = title ? '返回' + title : '返回';
    button.setAttribute('aria-label',title ? '返回' + title : '返回上一层');
    button.title = title ? '返回' + title : '返回上一层';
    $('dialog-close').title = title ? '关闭当前窗口，返回' + title : '关闭窗口';
  }
  function restoreDialog(entry) {
    dialogKind = entry.kind;
    $('game-dialog').dataset.kind = entry.kind;
    $('dialog-title').textContent = entry.title;
    $('dialog-overline').textContent = entry.overline;
    $('dialog-emblem').innerHTML = entry.emblem;
    // Keep the original nodes: market form listeners, drafts and expanded
    // sections belong to this window and must survive a child window.
    $('dialog-content').replaceChildren(...entry.nodes);
    if (!$('game-dialog').open) $('game-dialog').showModal();
    if (entry.kind === 'plots') renderPlotCare();
    else if (entry.kind === 'bag') renderInventory();
    else if (entry.kind === 'tools') renderWorkshop();
    else if (entry.kind === 'arrival') openArrival();
    economy?.refresh(entry.kind); farmUI?.refresh(entry.kind); environmentUI?.update();
    $('dialog-content').scrollTop = entry.scrollTop;
    $('dialog-content').scrollLeft = entry.scrollLeft;
    renderDialogNavigation(); renderFullscreenControls();
    scene?.setModalPaused?.(true); journeyUI?.update(); liftToastLayer();
    if (!restoreFocus(entry.focus, $('dialog-content'))) ($('dialog-back').hidden ? $('dialog-close') : $('dialog-back')).focus({preventScroll:true});
  }
  function openDialog(kind, title, content) {
    if (decorEditor?.isOpen()) return;
    const wasOpen = $('game-dialog').open, sameWindow = wasOpen && dialogKind === kind;
    const previous = sameWindow ? captureDialog() : null;
    if (wasOpen && !sameWindow) {
      const ancestor = dialogHistory.findIndex(entry => entry.kind === kind);
      if (ancestor >= 0) dialogHistory.splice(ancestor);
      else dialogHistory.push(captureDialog());
    } else if (!wasOpen) {
      dialogHistory = [];
      lastDialogTrigger = captureFocus();
      dialogOrigin = capturePanelOrigin() || (gameWindow ? {type:'window',name:gameWindow,title:gameWindow === 'sect-info' ? '宗门事务' : gameWindow === 'decor' ? '洞天布置' : '仙途长卷',focus:captureFocus()} : null);
    }
    if (!sameWindow) noteNavigation();
    setFullscreenPanel('');
    dialogKind = kind;
    const symbols = {journey:'book',arrival:'leaf',bag:'bag',alchemy:'fire',market:'gem',tools:'workshop',codex:'book',guide:'leaf',settings:'gear',about:'mountain',reset:'reset',import:'upload',plots:'grid',guard:'formation',environment:'sun','farm-directory':'users','farm-history':'book'};
    const overlines = {bag:'收获入囊 · 灵石有余',alchemy:'八方灵药 · 一炉仙缘',market:'灵植丹药 · 道藏互通',tools:'精工良器 · 耕有所得',codex:'草木有灵 · 五境药谱',guide:'一方灵田 · 四时有序',settings:'洞天小记 · 仙途常在',plots:'掌中一圃 · 轻点照料',guard:'以学问道 · 破阵采灵',environment:'晨昏往复 · 草木知时','farm-directory':'仙山有邻 · 草木有缘','farm-history':'一来一往 · 仙缘有记'};
    $('game-dialog').dataset.kind = kind;
    $('dialog-emblem').innerHTML = icon(symbols[kind] || 'leaf');
    $('dialog-overline').textContent = kind === 'journey' ? '日有所获 · 山中有伴' : kind === 'arrival' ? '重返云间 · 仙途有记' : overlines[kind] || '云 间 灵 田';
    $('dialog-title').textContent = title;
    $('dialog-content').innerHTML = content || '';
    $('dialog-content').scrollTop = previous?.scrollTop || 0;
    $('dialog-content').scrollLeft = previous?.scrollLeft || 0;
    renderDialogNavigation();
    if (!$('game-dialog').open) $('game-dialog').showModal();
    const rotate = $('fullscreen-orientation');
    // A cloud reply may arrive after the phone rotates. Keep the orientation
    // prompt above the newly opened game dialog without discarding that reply.
    if (rotate.open) { rotate.close(); rotate.showModal(); }
    liftToastLayer();
    scene?.setModalPaused?.(true);
    journeyUI?.update();
    renderFullscreenControls();
    if (rotate.open) rotate.querySelector('button')?.focus({preventScroll:true});
    else if (!previous || !restoreFocus(previous.focus, $('dialog-content'))) ($('dialog-back').hidden ? $('dialog-close') : $('dialog-back')).focus({preventScroll:true});
  }
  function closeDialog() {
    if (!$('game-dialog').open) return;
    noteNavigation();
    if (dialogKind === 'import') pendingImport = null;
    if (dialogHistory.length) { restoreDialog(dialogHistory.pop()); return; }
    $('game-dialog').close();
  }
  function dismissDialog() {
    dialogHistory = []; dialogOrigin = null; lastDialogTrigger = null;
    pendingImport = null;
    if ($('game-dialog').open || dialogKind) noteNavigation();
    dialogKind = '';
    renderDialogNavigation();
    if ($('game-dialog').open) $('game-dialog').close();
  }
  $('game-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  $('game-dialog').addEventListener('close', () => {
    if ($('game-dialog').open) return;
    const origin = dialogOrigin, trigger = lastDialogTrigger;
    dialogHistory = []; dialogOrigin = null; lastDialogTrigger = null;
    liftToastLayer();
    syncGardenRendering();
    dialogKind = ''; pendingImport = null;
    engine.setCardsActive?.(!!cardsUI?.isOpen());
    journeyUI?.update();
    renderFullscreenControls();
    renderDialogNavigation();
    if (origin?.type === 'sheet') {
      setFullscreenPanel(origin.name);
      const panel = panelNode(origin.name);
      if (panel) panel.scrollTop = origin.scrollTop;
      requestAnimationFrame(() => { if (!$('game-dialog').open && fullscreenPanel === origin.name) restoreFocus(origin.focus, panel || document); });
    } else if (!restoreFocus(origin?.focus || trigger) && fullscreenUI?.isActive() && !$('fullscreen-orientation').open) focusMainPage();
  });
  function openPlotCare() {
    careSignature = '';
    openDialog('plots',mode === 'home' ? '田块照料' : '道友灵田','');
    renderPlotCare();
  }
  function renderPlotCare() {
    const plots = currentPlots(), atHome = mode === 'home', s = engine.state;
    const signature = JSON.stringify([mode,neighborId,selectedCrop,s.realm,s.stones,s.tools,engine.busy,engine.pendingChallenge?.id,engine.getAlchemyInfo().stealAttemptsLeft,farmActionSignature(),plots.map(p=>[p.cropId,p.unlocked,p.stage,p.nextWaterAt,p.withered,p.stolen,p.stolenSuccess,p.stolenUnits,p.attemptStatus,mature(p),growth(p).canWater])]);
    if (signature === careSignature) {
      $('dialog-content').querySelectorAll('[data-care-countdown]').forEach(node => {
        const ms = growth(plots[Number(node.dataset.careCountdown)]).remainingMs;
        node.textContent = clockTime(ms); node.setAttribute('aria-label',timeLeft(ms));
      });
      return;
    }
    careSignature = signature;
    const focusIndex = document.activeElement?.dataset?.careIndex;
    const scrollTop = $('dialog-content').scrollTop;
    const lockedOpen = $('dialog-content').querySelector('[data-care-locked]')?.open;
    const card = (p,i) => {
      const c = cropMap[p.cropId], g = growth(p), ripe = mature(p);
      let tone = 'rest', state = '', description = '', label = '', action = '', glyph = 'leaf', disabled = false;
      if (!p.unlocked) {
        tone = 'locked'; state = '尚未开垦'; glyph = 'lock';
        if (atHome) {
          const info = engine.getUnlockInfo(i);
          description = `${realms[info.requiredRealm].name}可开垦 · ${info.cost} 灵石`;
          label = '开垦'; action = 'unlock'; disabled = s.realm < info.requiredRealm || s.stones < info.cost;
        } else { description = '道友还未开垦此田'; label = '未开垦'; disabled = true; }
      } else if (!atHome && p.withered) {
        state=p.witheredReason==='frost'?'冬寒冻枯':'已收割';description=p.witheredReason==='frost'?'灵植已冻枯，等待田主清理':'田主正在等待清理残茬';label='枯草';disabled=true;glyph='hoe';tone='earth';
      } else if (!atHome && p.stolen) {
        state = engine.online?visitState(p):'本轮已探访'; description = engine.online && p.stolenUnits ? `已被采 ${p.stolenUnits} 株 · 田主还可收 ${remainingYield(p)} 株` : p.attemptStatus==='pending'?'请从守田阵法提示中继续本次答题':'等道友重新种植后再来'; label = state; disabled = true;
      } else if (p.withered && atHome) {
        tone = 'earth'; state = p.witheredReason==='frost'?'冬寒冻枯':'枯草待清'; glyph = 'hoe'; label = '铲枯草'; action = 'clear';
        description = `锄头 Lv.${s.tools.hoe} · 本次可清理 ${engine.getToolTargets('hoe',i).length} 田`;
      } else if (!c) {
        state = '净土待播'; glyph = 'seed'; label = '播种'; action = 'plant';
        description = `${cropMap[selectedCrop].name} · ${cropMap[selectedCrop].price} 灵石`; disabled = !atHome || s.stones < cropMap[selectedCrop].price;
      } else if (ripe) {
        tone = 'gold'; state = '已成熟'; glyph = atHome ? 'harvest' : 'hand'; label = atHome ? '采收' : '偷采'; action = atHome ? 'harvest' : 'steal';
        description = atHome ? `可收获 ${remainingYield(p)} 份${p.stolenUnits?' · 本茬已被采 '+p.stolenUnits+' 株':' · 全售 '+remainingYield(p)*c.sellPrice+' 灵石'}` : engine.online ? `触阵 ${getNeighbor().guard}% · 失败赔 ${stealPenalty(p)} 灵石` : `练习成功率 ${100-getNeighbor().guard}% · 每轮可采一次`;
        if(!atHome && engine.online){disabled=!canSteal(p)||engine.busy||!!engine.pendingChallenge||s.stones<stealPenalty(p)||!engine.getAlchemyInfo().stealAttemptsLeft;if(s.stones<stealPenalty(p))label='灵石不足';else if(engine.pendingChallenge)label='先完成答题';}
      } else if (atHome && isRaining()) {
        tone='water'; state='雨水照料'; glyph='drop'; label='自动补水'; disabled=true;
        description=g.canWater?'细雨正在滋润灵田，无需手动浇灌':`雨中到时自动补水 · <time data-care-countdown="${i}" aria-label="${timeLeft(g.remainingMs)}">${clockTime(g.remainingMs)}</time>`;
      } else if (atHome && g.canWater) {
        tone = 'water'; state = '待浇水'; glyph = 'watering'; label = '浇水'; action = 'water';
        description = `第 ${g.stage+1}/4 次 · 本次 ${engine.getToolTargets('wateringCan',i).length} 田 · 免费`;
      } else {
        state = atHome ? `${g.stageName} · 静养中` : '生长中'; glyph = 'clock'; label = atHome ? '静养中' : '未成熟'; disabled = true;
        description = !atHome && engine.online && g.canWater ? '等待灵泉或真实雨水滋润' : `${atHome || engine.online ? '下次浇水' : '成熟还需'} <time data-care-countdown="${i}" aria-label="${timeLeft(g.remainingMs)}">${clockTime(g.remainingMs)}</time>`;
      }
      const activity = farmActionState(i);
      if (atHome && farmActionsBlocked()) disabled = true;
      if (activity) { state = label = activity.label; description = activity.note; glyph = activity.glyph; }
      return `<article class="care-plot-card ${activity ? 'is-farm-pending' : ''}" data-tone="${tone}"><div class="care-plot-art">${c && !p.withered ? art(c.id,ripe) : icon(glyph)}</div><div class="care-plot-info"><span class="care-plot-number">第 ${String(i+1).padStart(2,'0')} 田 <span>${state}</span></span><h3>${c ? c.name : p.unlocked ? '空闲灵田' : '待辟新土'}</h3><p>${description}</p></div><button class="button ${disabled ? 'button-secondary' : 'button-primary'} ${activity ? 'farm-action-pending' : ''}" ${activity ? `data-phase="${activity.phase}" aria-busy="${activity.phase !== 'unconfirmed'}"` : ''} data-care-index="${i}" data-care-action="${action}" aria-label="${label}，第${i+1}块灵田" ${disabled ? 'disabled' : ''}>${icon(glyph)}${label}</button></article>`;
    };
    const open = plots.map((p,i)=>p.unlocked ? card(p,i) : '').join('');
    const locked = plots.map((p,i)=>!p.unlocked ? card(p,i) : '').join('');
    $('dialog-content').innerHTML = `${atHome ? `<div class="care-seed-picker"><label for="care-seed">准备播种</label><select id="care-seed">${crops.map(c=>`<option value="${c.id}" ${c.id===selectedCrop?'selected':''} ${c.minRealm>s.realm?'disabled':''}>${c.name} · ${c.price} 灵石${c.minRealm>s.realm?' · '+realms[c.minRealm].name+'解锁':''}</option>`).join('')}</select><span>${icon('gem')}${fmt(s.stones)} 灵石</span></div><div class="care-shop-links"><button class="button button-quiet" data-open="bag">${icon('gem')}出售灵植</button><button class="button button-secondary" data-open="tools">${icon('workshop')}农具工坊</button></div>` : `<p class="dialog-intro">${esc(getNeighbor().name)}的灵田，轻点成熟灵植即可探访。</p>`}<p class="care-list-hint">${atHome ? '大按钮直接照料；升级农具后，自动处理附近符合条件的田。' : engine.online ? '每田每茬最多被采 1 株；触阵先冻结赔付金，答对退回，答错、超时或放弃赔给田主。' : '本机模拟练习 · 每田每轮一次，被发现时会损失少量灵石。'}</p><div class="care-plot-list">${open}</div>${locked ? `<details class="care-locked-list" data-care-locked ${lockedOpen ? 'open' : ''}><summary>待开垦田地 <span>${plots.filter(p=>!p.unlocked).length} 块</span></summary><div class="care-plot-list">${locked}</div></details>` : ''}`;
    $('dialog-content').scrollTop = scrollTop;
    if (focusIndex !== undefined) $('dialog-content').querySelector(`[data-care-index="${focusIndex}"]:not(:disabled)`)?.focus({preventScroll:true});
  }
  // 药铺回收可以选数量（2026-11-20 用户：“卖菜的时候可不可以加上买菜的数量，不想一次性全卖、一个一个点又太麻烦了。”）：
  // 每种灵草一个数量框（− ＋、一半，也可以直接输入），记住上次选的数量；云端的 sell 本来就收数量，不用改
  const sellCounts = {};
  const sellCountOf = id => { const owned = engine.state.bag[id] || 0; return Math.max(1, Math.min(owned, Math.floor(Number(sellCounts[id]) || 1))); };
  function setSellCount(id, value) {
    const owned = engine.state.bag[id] || 0, crop = cropMap[id];
    const n = Math.max(1, Math.min(owned, Math.floor(Number(value) || 1)));
    sellCounts[id] = n;
    const card = $('dialog-content').querySelector(`[data-sell-card="${id}"]`);
    if (!card || !crop) return;
    const input = card.querySelector('[data-sell-count]');
    if (input && document.activeElement !== input) input.value = n;
    card.querySelector('[data-sell-n]').textContent = n;
    card.querySelector('[data-sell-sum]').textContent = fmt(n * crop.sellPrice);
  }
  function inventoryMarkup() {
    const items = crops.filter(c => engine.state.bag[c.id] > 0), stats = engine.getStats();
    return `<p class="dialog-intro">采收与偷采所得，皆藏于此。灵草可按丹方炼丹，也可挂到坊市卖给同学。下方是药铺的固定回收价，即时售出所得灵石可用于开田、买种与升级农具。</p>${items.length ? `<div class="dialog-grid">${items.map(c => `<article class="inventory-card" data-sell-card="${c.id}"><span class="quantity">可用 ${engine.state.bag[c.id]} 份</span><div class="seed-art">${art(c.id,true)}</div><h3>${c.name}</h3><p>药铺回收 · 每份 ${c.sellPrice} 灵石</p><div class="sell-count" role="group" aria-label="${c.name}售出数量"><button type="button" class="sell-step" data-sell-step="-1" data-sell-for="${c.id}" aria-label="少一份">−</button><input type="number" inputmode="numeric" min="1" max="${engine.state.bag[c.id]}" step="1" value="${sellCountOf(c.id)}" data-sell-count="${c.id}" aria-label="售出份数"><button type="button" class="sell-step" data-sell-step="1" data-sell-for="${c.id}" aria-label="多一份">＋</button><button type="button" class="sell-step sell-half" data-sell-step="half" data-sell-for="${c.id}">一半</button></div><button class="button button-primary" data-sell="${c.id}" data-qty="count">${icon('gem')}<span class="sell-label">售给药铺 <span data-sell-n>${sellCountOf(c.id)}</span> 份 · +<span data-sell-sum>${fmt(c.sellPrice*sellCountOf(c.id))}</span></span></button><button class="button button-secondary" data-sell="${c.id}" data-qty="all">全部售给药铺 · +${fmt(c.sellPrice*engine.state.bag[c.id])}</button></article>`).join('')}</div>` : `<div class="empty-bag">${icon('bag')}<h3>一只轻盈的乾坤袋</h3><p>收获成熟灵草、拜访道友，或到坊市买入炼丹原料。<br>已挂卖单的灵草暂时冻结，不计入可用库存。</p><button class="button button-primary" style="margin-top:20px" data-return-home>回灵田看看</button></div>`}<div class="dialog-footer"><span>可用 ${stats.bagCount} 份灵草 · 药铺回收合计 ${fmt(stats.bagValue)} 灵石</span>${items.length ? `<button class="button button-secondary" data-sell-all>${icon('gem')}全部售给药铺</button>` : ''}</div><div class="guide-note">药铺回收价是固定的游戏价格，坊市价格来自学生之间的真实成交。卖出材料前，可先看看丹方需求与市场行情。</div>`;
  }
  function renderInventory() { $('dialog-content').innerHTML = inventoryMarkup(); }
  function openInventory() { openDialog('bag','乾坤袋 · 灵草',inventoryMarkup()); }
  function workshopMarkup() {
    const capacities = window.SpiritGame.TOOL_CAPACITIES;
    return `<p class="dialog-intro">把一季收成换成趁手农具。锄头清除收割后的枯草，浇水壶照料已经到时的灵植；农具最高三级，需积攒灵石逐级升级；以所点田块为中心，优先处理附近符合条件的田。</p><div class="workshop-wallet">${icon('gem')}现有灵石 <strong>${fmt(engine.state.stones)}</strong><button class="text-button" data-open="bag">出售灵植 ${icon('arrow')}</button></div><div class="workshop-grid">${['hoe','wateringCan'].map(kind => {
      const t = engine.getToolInfo(kind), name = kind === 'hoe' ? '锄头' : '浇水壶', task = kind === 'hoe' ? '铲除枯草' : '分段浇水';
      const affordable = !t.maxed && engine.state.stones >= t.nextCost;
      const portrait = window.SpiritToolPortraits?.[kind]?.[t.level], portraitAlt = kind === 'hoe' ? '青竹灵锄模型，木柄与玉钢锄刃' : '灵泉铜壶模型，青瓷壶身与铜质喷头';
      const picture = portrait ? `<img src="${portrait}" alt="${portraitAlt}" width="512" height="384" decoding="async" draggable="false">` : icon(kind === 'hoe' ? 'hoe' : 'watering');
      return `<article class="tool-upgrade-card"><span class="workshop-tool-art ${kind}">${picture}</span><div class="tool-upgrade-heading"><h3>${name}</h3><span>Lv.${t.level} / ${t.maxLevel}</span></div><p>${task} · 当前一次最多 <strong>${t.capacity} 田</strong></p><ol class="tool-level-track" aria-label="${capacities.length}级农具的作用田数">${capacities.map((n,i)=>`<li class="${i+1 < t.level ? 'done' : i+1 === t.level ? 'current' : ''}"><b>${n}</b><small>Lv.${i+1}</small></li>`).join('')}</ol>${t.maxed ? `<div class="tool-upgrade-next">已经圆满 · 一次最多照料 ${t.capacity} 块灵田</div>` : `<div class="tool-upgrade-next">下一级 <b>Lv.${t.level+1}</b> · 一次最多 <b>${t.nextCapacity} 田</b></div>`}<button class="button ${affordable ? 'button-primary' : 'button-secondary'}" data-upgrade-tool="${kind}" ${t.maxed || !affordable ? 'disabled' : ''}>${icon(t.maxed ? 'check' : 'spark')}${t.maxed ? '已达最高等级' : `升级${name} · ${fmt(t.nextCost)} 灵石`}</button>${!t.maxed && !affordable ? `<small class="upgrade-shortfall">还差 ${fmt(t.nextCost-engine.state.stones)} 灵石，可出售灵植积攒。</small>` : ''}</article>`;
    }).join('')}</div><div class="guide-note">灵泉浇水免费，无需购买水或等待补水。升级提升单次照料数量；每株的四次补水与等待间隔仍需完成，下雨时会自动补水。不会清理活植，也不会给尚未到时的田重复浇水。</div>`;
  }
  function renderWorkshop() {
    const focusKind = document.activeElement?.dataset?.upgradeTool;
    $('dialog-content').innerHTML = workshopMarkup();
    if (focusKind) $('dialog-content').querySelector(`[data-upgrade-tool="${focusKind}"]:not(:disabled)`)?.focus({preventScroll:true});
  }
  async function openDecorEditor(id) {
    if (decorEditor?.isOpen()) return;
    if (!engine.getDecorInfo?.().equipped.length) return toast('先在「洞天」收藏并布置一件装饰，再选择喜欢的位置。','info');
    if (!scene?.supported || !decorEditor) return toast('当前设备未能开启立体布置，请在支持立体场景的浏览器中调整位置。','info');
    decorReturnWindow = activePage === 'journey' && activeJourneyTab === 'decor' ? {
      scrollTop:$('journey-page').querySelector('.game-window-body')?.scrollTop || 0,
      view:{...journeyReturnView},trigger:journeyReturnTrigger,window:journeyReturnWindow,panel:journeyReturnPanel,focus:captureFocus()
    } : null;
    dismissDialog();
    await setView('home');
    if (decorEditor.open(id) === false) returnFromDecorEditor();
  }
  function returnFromDecorEditor() {
    const saved = decorReturnWindow;
    decorReturnWindow = null;
    render(true);
    if (!saved) return;
    journeyUI?.open('decor');
    journeyReturnView = saved.view; journeyReturnTrigger = saved.trigger;
    journeyReturnWindow = saved.window; journeyReturnPanel = saved.panel;
    const body = $('journey-page').querySelector('.game-window-body');
    if (body) body.scrollTop = saved.scrollTop;
    restoreFocus(saved.focus, $('journey-page'));
  }
  function openCodex() {
    if (journeyUI) return journeyUI.openCodex();
    openDialog('codex','百草图鉴',`<p class="dialog-intro">每株需补水 4 次：第一水可立即补，其后每养足一段再补一次；下雨时自动补水，第 4 次后成熟。冬季未成熟灵植经历自然天气切换点时，每株每季最多判定一次 1% 冻害；成熟灵植不受冻害。下列为按时照料的最短成熟时间。</p><div class="dialog-grid">${crops.map(c => `<article class="codex-card"><span class="seed-grade">${c.rarity} · ${realms[c.minRealm].name}</span><div class="seed-art">${art(c.id,true)}</div><h3>${c.name}</h3><p>${c.description}</p><div class="codex-stats"><span>种植 <b>${c.price}</b> 灵石</span><span>最快 <b>${durationLabel(c.growTime)}</b></span><span>每隔 <b>${durationLabel(c.waterIntervals[0])}</b> 浇水</span><span>共需 <b>4 次</b> 浇水</span><span>产量 <b>${c.yield}</b> 份</span><span>药铺单价 <b>${c.sellPrice}</b></span><span>全田售出 <b>${c.yield*c.sellPrice}</b></span><span>用途 <b>炼丹 / 交易</b></span></div></article>`).join('')}</div><div class="guide-note">每次补水进入下一形态；真实雨天会自动补水，离线雨段也会结算，四次补水和等待间隔保持不变。黄精芝、紫猴花、天灵果、养魂木与九曲灵参的名称参考《凡人修仙传》，形象与数值为游戏设定。</div>`);
  }
  function openGuide() {
    openDialog('guide','仙途指引',`<p class="dialog-intro">先收一场丰收，再学着照料一季灵草。洞天共有 25 块灵田，开局开放 5 块，前三田可直接采收。</p><div class="guide-steps"><div class="guide-step"><span class="step-number">一</span><div><h3>收割留枯草，锄净再播种</h3><p>成熟后点击田间标记或「一键收获」，灵植收入乾坤袋，田中留下枯草与残茬。选择锄头并点击枯田，或直接点「铲枯草」，清理后才可以播种。种匣选灵植，再点空田，支付该灵种的费用。</p></div></div><div class="guide-step"><span class="step-number">二</span><div><h3>四次补水，四次变化</h3><p>播种后需补水才能成长。第 1 次补水立即出芽，随后每养足一段，再补水进入舒叶、蕴灵和成熟；真实雨天会自动完成当次补水，无需手动浇灌。${crops.map(c => `${c.name}每隔 ${durationLabel(c.waterIntervals[0])}`).join('，')}可再浇一次；从炼气到化神，按时照料分别需 ${crops.map(c => durationLabel(c.growTime)).join('、')}成熟。等待结束后，雨天自动补水，晴天显示「待浇水」。等待浇水本身不会导致枯死；后续间隔从实际补水时算起。</p></div></div><div class="guide-step"><span class="step-number">三</span><div><h3>卖灵植，换更趁手的农具</h3><p>在「出售灵植」或乾坤袋出售收获，即可获得灵石。在「农具工坊」分别升级锄头和浇水壶，最高三级，分别可一次处理最多 ${window.SpiritGame.TOOL_CAPACITIES.join('、')} 块田。锄头升二级需 ${fmt(window.SpiritGame.TOOL_DEFS.hoe.costs[0])}、升三级需 ${fmt(window.SpiritGame.TOOL_DEFS.hoe.costs[1])} 灵石；浇水壶分别需 ${fmt(window.SpiritGame.TOOL_DEFS.wateringCan.costs[0])} 和 ${fmt(window.SpiritGame.TOOL_DEFS.wateringCan.costs[1])} 灵石。选择工具后，指向田块可查看本次覆盖，点击会优先处理附近符合条件的田。普通浇水免费；活植不会被锄掉，尚未到时也不会被重复浇水。</p></div></div><div class="guide-step"><span class="step-number">四</span><div><h3>修炼开田，拜访仙友</h3><p>灵草按八种丹方炼成丹药，服丹后提升修为；每天最多服 3 颗，服丹增加的修为合计最多 30，购买来的丹药也计入。修为足够后尝试突破，炼气、筑基、结丹、元婴、化神各解锁一种灵植及下一排 5 块田。达到境界后，直接点荒田上的「开垦」并支付灵石。元婴解锁「一键偷采」，化神继续可用；炼气、筑基、结丹仍可点击田块逐田偷采。${engine.online ? '拜访同学的真实灵田，同人同田每茬最多尝试一次，每天合计最多 10 次，失败也计次；每田共享可采额度为 1 株，主人至少保留 75% 收成。每次探访独立判定，40% 概率触发守田阵法，需在 2 分钟内答对一道单选题才能采得灵草。按灵草等级须备 5、10、15、20、30 灵石；触阵先冻结，答对退回，答错、超时或放弃则赔给田主。答题期间田主可正常收获，若答对时灵草已被收取或额度用完，赔付金退回。收起或刷新保留原题，倒计时继续。一键偷采会依次处理当前道友符合条件的田块，遇到第一道守田阵法立即暂停；答题结束后需要再次点击一键偷采，不能自动跳过题目。每日次数、赔付金或容量不足时也会停止。' : '离线练习使用模拟 NPC 道友，每 3 分钟重种。每田每轮一次，每天合计最多尝试 10 次，失败也计次；练习不影响同学的真实田地。'}修行小记的奖励可各领一次。</p></div></div><div class="guide-step"><span class="step-number">五</span><div><h3>留下进度，也留下喜欢的镜头</h3><p>离线期间，真实雨水仍会在浇水节点自动补水；没有雨的时段，回来后可继续用灵泉浇灌。未成熟灵植在冬季经历自然天气切换点时，每株每个冬季最多判定一次 1% 冻害；成熟灵植免疫，冻枯后可用锄头清理。打开游戏即进入完整洞天。左上角查看修为，底部上方常驻灵种与农具，点一下即可切换，右下角照料田块与一键收获；底部八个入口依次为「灵田」「偷菜」「宗门」「洞天」「炼丹」「坊市」「乾坤袋」和「长卷」，可直接切换或打开对应功能。电脑拖动田园旋转、滚轮缩放；手机横屏游玩，单指环看、双指缩放，轻点田块查看详情，也可打开「田块照料」使用简洁列表。窗口左上角可返回上一层；关闭按钮或 Esc 也会先返回父窗口，保留滚动位置。右上角「镜头视角」可缩放、保存和复位，保存后刷新仍会恢复。左侧「今日修行」可在任务与守田往来之间切换；顶部中央显示当前北京时间、季节与天气，点击展开四时天象。右上角「全屏」可进一步隐藏浏览器边框；退出系统全屏后，游戏仍保留同一套界面。${engine.online ? '云端进度随同一登录身份跨设备读取。' : '离线进度保存在当前浏览器。移动 HTML 文件、更换浏览器或清理数据前，可在设置中导出练习存档，在另一份离线文件中导入；旧版练习进度会自动升级。'}</p></div></div></div><div class="guide-note">${engine.online ? '洞天由服务器统一保存和计时；云间坊市分为灵植、丹药和道藏三类；灵植与丹药支持限价买卖，道藏按课程挂牌交易，成交后才交换对应资产。' : '这份离线文件可独立种植、炼丹与拜访模拟道友；不能参与云端共享市场，练习进度不会转换成云端资产。'}开田、种子、工具与炼丹费用都会消耗灵石。</div>`);
  }
  function openSettings() {
    const events = engine.state.events || [], online = engine.online;
    const syncLabel = engine.authRequired ? '重新登录' : engine.accountChanged ? '刷新身份' : '同步云端';
    openDialog('settings','洞天设置',`<section class="settings-section"><h3>声音与游玩</h3><div class="settings-actions"><button class="button button-secondary" data-fullscreen-command="sound" aria-pressed="${soundEnabled}">${icon('sound')}${soundEnabled ? '关闭音效' : '开启音效'}</button><button class="button button-quiet" data-fullscreen-command="guide">操作指引</button><button class="button button-quiet" data-fullscreen-command="about">关于此境</button></div><p>手机横屏游玩，iPad 可横竖屏；右上角可开启系统全屏，退出后仍保留这套洞天界面。</p></section><section class="settings-section"><h3>${online ? '云端仙途 · '+esc(engine.player.alias) : '离线练习存档'}</h3><p data-settings-status role="status">${esc(sessionDetail())}</p><p>${online ? '进度由服务器保存，登录同一身份即可继续。可导出一份只读记录留作纪念；云端不导入浏览器资产，也不能重新领取开局物资。' : '这是一份无需联网的独立 HTML。进度保存在当前浏览器；移动文件、更换浏览器或清理数据前，请先导出存档，在另一份离线练习文件中导入即可继续。道友均为模拟 NPC，练习资产不能进入云端市场。'}</p><div class="settings-actions"><button class="button button-primary" data-export>${icon('download')}${online ? '导出只读记录' : '导出练习存档'}</button>${online ? `<button class="button button-secondary" data-sync-cloud ${engine.busy ? 'disabled' : ''}>${icon('reset')}${syncLabel}</button>` : `<button class="button button-secondary" data-import>${icon('upload')}导入练习存档</button>`}</div>${!online && !engine.storageAvailable ? '<div class="settings-warning">当前浏览器未能保存练习进度，请在离开前导出存档。</div>' : ''}</section><section class="settings-section"><h3>灵田小记</h3><ul class="history-list">${events.slice(0,12).map(e => `<li><span>${esc(e.text)}</span><time>${new Date(e.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time></li>`).join('') || '<li>入境之后的收获与往来，会记在这里。</li>'}</ul></section>${online ? '' : `<section class="settings-section"><h3>重新练习</h3><p>重新开始仅清空当前离线练习。可先导出留存。</p><button class="button button-danger" data-reset-request>${icon('reset')}重新开始练习</button></section>`}`);
  }
  function openAbout() {
    openDialog('about','一方灵草，半日清闲',`<div class="about-prose"><p>「云间灵田」是一款在云海仙山中种植灵草、炼制丹药与交换收获的修仙游戏。${engine.online ? '云端洞天通过登录身份保存进度，学生在云间坊市交易灵植、丹药与道藏，并可互访真实灵田。每田设守田阵法，触阵后以答题决定偷采是否成功。' : '你正在使用独立的离线练习版，无需登录和联网。所有道友均为模拟 NPC，灵田和收获只保存在本地，不参与同学的真实田地和共享市场。'}</p><p>五境各藏一种灵植，二十五块药圃逐步开启。从炼气一路修至化神，闲时去道友家串门，按时为灵植浇水，收割后锄草再种。</p><p>部分灵植名称参考《凡人修仙传》，可见作品附录${engine.online ? '<a href="https://fanrenxiuxianzhuan.bookresource.qq.com/chapter/107580/27199974/" target="_blank" rel="noopener noreferrer">《凡人必备手册》</a>' : '《凡人必备手册》'}。视觉、NPC、故事短句、玩法、成长时间与数值为本作原创设置。</p><p>立体仙山以 Three.js 实时绘制，配合原创灵植模型与药谱插画。远山、云海、玉檐亭阁、灵泉与聚灵阵共同组成一方洞天；进入游戏即展开完整视野，所有种田、拜访偷菜与宗门功能都整合在画面内。手机横屏游玩，iPad可横竖屏使用。浏览器不支持 WebGL 时，自动切换到兼容的立体绘制方式；更旧的设备还可使用轻量灵田，保留全部玩法。</p></div><div class="guide-note">丰盈灵圃 · 丹炉与共市 · Three.js 0.160.1（MIT License）<br>${engine.online ? '电脑与手机均可游玩；进度、交易与资产结算由服务器保存。' : '离线练习版 · 电脑与手机均可游玩 · 可在设置中导出与导入练习存档。'}</div>`);
  }
  function openNamed(kind) {
    if (kind === 'bag') openInventory();
    else if (kind === 'alchemy') economy.openAlchemy();
    else if (kind === 'market') economy.openMarket();
    else if (kind === 'codex') openCodex();
    else if (kind === 'journey') journeyUI?.open('commissions');
    else if (kind === 'arrival') openArrival();
    else if (kind === 'tools') openDialog('tools','农具工坊',workshopMarkup());
    else if (kind === 'home' || kind === 'neighbors') { dismissDialog(); journeyReturnWindow = null; journeyReturnPanel = null; setView(kind); }
  }
  function exportFile() {
    let exported;
    try { exported = engine.exportSave(); } catch (error) { toast(error?.message || '存档暂时无法导出，请检查保存状态。','error'); return; }
    const blob = new Blob([exported],{type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `云间灵田_存档_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
    toast(engine.online ? '只读仙途记录已导出，云端进度仍由服务器保存。' : '练习存档已导出，愿仙途常在。');
  }
  document.addEventListener('click', async event => {
    if (economy.handleClick(event)) return;
    if (farmUI.handleClick(event)) return;
    const b = event.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.fullscreenAction === 'portrait') return choosePortraitPlay();
    if (b.dataset.fullscreenAction === 'enter') return b.closest('#fullscreen-orientation') ? tryAutoLandscape() : fullscreenUI?.enter();
    if (b.dataset.fullscreenAction === 'exit') return fullscreenUI?.exit();
    if (b.dataset.fullscreenAction === 'toggle') return fullscreenUI?.toggle();
    if (b.hasAttribute('data-fullscreen-closepanel')) return setFullscreenPanel('',true);
    if (b.dataset.activityTab && fullscreenPanel === 'quests') return setActivityTab(b.dataset.activityTab,true);
    if (b.dataset.fullscreenPanel && !decorEditor?.isOpen()) return setFullscreenPanel(fullscreenPanel === b.dataset.fullscreenPanel ? '' : b.dataset.fullscreenPanel,true);
    if (b.dataset.fullscreenNav) {
      setFullscreenPanel('');
      if (b.dataset.fullscreenNav === 'sect') {
        if (journeyUI?.open('sect') !== false) requestAnimationFrame(() => {
          $('journey-page').querySelector('.game-sect-selector [aria-pressed="true"]')?.focus({preventScroll:true});
        });
        return;
      }
      return openNamed(b.dataset.fullscreenNav);
    }
    if (b.dataset.fullscreenCommand) {
      if (b.closest('#game-dock')) { dismissDialog(); setFullscreenPanel(''); journeyReturnWindow = null; journeyReturnPanel = null; }
      return runFullscreenCommand(b.dataset.fullscreenCommand);
    }
    if (b.dataset.journeyOpen) return journeyUI?.open(b.dataset.journeyOpen);
    if (b.hasAttribute('data-arrival-care')) { await setView('home'); return openPlotCare(); }
    if (b.dataset.careAction) {
      if (event.detail > 1) return;
      const index = Number(b.dataset.careIndex), action = b.dataset.careAction;
      if (!Number.isInteger(index) || !currentPlots()[index]) return;
      if (action === 'unlock') return handleUnlockPlot(index);
      if (action === 'steal') {
        selectedPlot = index;
        if(engine.online)return farmUI.attempt(neighborId,index);
        const result = await engine.steal(neighborId,index);
        if (result.ok) harvestBurst(index,result.cropId,result.qty);
        plotSignature = ''; render(true); return;
      }
      return performFarmAction(action,index);
    }
    if (b.dataset.nav) return openNamed(b.dataset.nav);
    if (b.dataset.seed) {
      const c = cropMap[b.dataset.seed]; if (!c) return;
      if (c.minRealm > engine.state.realm) { toast(`${realms[c.minRealm].name}可种植${c.name}，先修炼提升境界。`,'info'); return; }
      selectedCrop = c.id; selectedTool = 'auto';
      if (mode !== 'home') setView('home');
      setFullscreenPanel('');
      renderSeeds(); renderFarmTools(); plotSignature = ''; renderGarden(); playSound('success'); return;
    }
    if (b.dataset.farmTool) return selectTool(b.dataset.farmTool);
    if (b.dataset.upgradeTool) return engine.upgradeTool(b.dataset.upgradeTool);
    if (b.dataset.farmAction) { if (event.detail > 1) return; return performFarmAction(b.dataset.farmAction,Number(b.dataset.plot)); }
    if (b.dataset.visit) return setView('neighbors',b.dataset.visit);
    if (b.dataset.unlockPlot !== undefined) { if (event.detail > 1) return; return handleUnlockPlot(Number(b.dataset.unlockPlot)); }
    if (b.dataset.plot !== undefined) return handlePlot(Number(b.dataset.plot));
    if (b.hasAttribute('data-inspect-plot')) {
      if(selectedPlot===null)return;
      const index=selectedPlot;
      requestAnimationFrame(()=>{scene?.resize?.();scene?.inspectPlot?.(index);});return;
    }
    if (b.hasAttribute('data-close-plot')) { selectedPlot = null; scene?.focusPlot?.(null); renderGarden(); return; }
    if (b.dataset.action) {
      const i = selectedPlot; if (i === null) return;
      const action = b.dataset.action;
      if (action === 'unlock') return handleUnlockPlot(i);
      if (action !== 'steal') return performFarmAction(action,i);
      if(engine.online)return farmUI.attempt(neighborId,i);
      const result = await engine.steal(neighborId,i);
      if (result.ok) harvestBurst(i,result.cropId,result.qty);
      plotSignature = ''; render(true); return;
    }

    if (b.dataset.quest) return engine.claimQuest(b.dataset.quest);
    if (b.dataset.sellStep) {
      const id = b.dataset.sellFor, owned = engine.state.bag[id] || 0, input = $('dialog-content').querySelector(`[data-sell-count="${id}"]`);
      const now = Math.floor(Number(input?.value) || sellCountOf(id));
      setSellCount(id, b.dataset.sellStep === 'half' ? Math.ceil(owned / 2) : now + Number(b.dataset.sellStep));
      if (input) input.value = sellCountOf(id);
      return;
    }
    if (b.dataset.sell) return engine.sell(b.dataset.sell,b.dataset.qty === 'all' ? 'all' : sellCountOf(b.dataset.sell));
    if (b.hasAttribute('data-sell-all')) return engine.sellAll();
    if (b.dataset.open) return openNamed(b.dataset.open);
    if (b.hasAttribute('data-return-home')) { dismissDialog(); setView('home'); return; }
    if (b.hasAttribute('data-export')) return exportFile();
    if (b.hasAttribute('data-sync-cloud')) { setFullscreenPanel(''); if(engine.online && engine.authRequired) $('session-signin').click(); else if(engine.online && engine.accountChanged) location.reload(); else if(engine.online) await engine.refresh(); return; }
    if (engine.online && ['data-import','data-reset-request','data-reset-confirm','data-import-confirm'].some(attr=>b.hasAttribute(attr))) return toast('云端资产由服务器保存，不支持导入或重置。','info');
    if (b.hasAttribute('data-import')) { $('save-file-input').value = ''; $('save-file-input').click(); return; }
    if (b.hasAttribute('data-reset-request')) return openDialog('reset','重新入山？',`<p class="dialog-intro">当前灵田、灵石、修为和所有收获将被清空。若希望日后回来，请先导出存档。</p><div class="settings-actions"><button class="button button-secondary" data-export>${icon('download')}先导出存档</button><button class="button button-danger" data-reset-confirm>确认重新开始</button><button class="button button-quiet" data-settings-back>保留当前进度</button></div>`);
    if (b.hasAttribute('data-reset-confirm')) { engine.reset(); selectedCrop = 'huangjing'; selectedTool = 'auto'; recentFarmActions.clear(); selectedPlot = null; dismissDialog(); setView('home'); return; }
    if (b.hasAttribute('data-settings-back')) return closeDialog();
    if (b.hasAttribute('data-import-confirm')) { const json = pendingImport; pendingImport = null; const result = engine.importSave(json); if (result.ok) { dismissDialog(); selectedPlot = null; selectedCrop = 'huangjing'; selectedTool = 'auto'; recentFarmActions.clear(); setView('home'); } return; }
  });
  $('save-file-input').addEventListener('change', async event => {
    if (engine.online) return;
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 256000) return toast('存档文件过大，请选择游戏导出的 JSON 文件。','error');
    try {
      const json = await file.text();
      const parsed = JSON.parse(json);
      if (parsed.schema !== 'yunjian-lingtian' || !window.SpiritGame.SUPPORTED_VERSIONS.includes(parsed.version)) throw new Error('请使用云间灵田导出的 JSON 存档。');
      pendingImport = json;
      openDialog('import','恢复这份存档？',`<p class="dialog-intro">导入「${esc(file.name)}」将替换当前进度。现有进度可先导出保留。</p><div class="settings-actions"><button class="button button-primary" data-import-confirm>确认导入</button><button class="button button-secondary" data-export>先导出当前存档</button><button class="button button-quiet" data-settings-back>取消</button></div>`);
    } catch (error) { toast(error instanceof SyntaxError ? '这不是有效的 JSON 存档，请重新选择。' : error.message,'error'); }
  });
  $('harvest-all').addEventListener('click', collectAll);
  $('plot-list').addEventListener('click',openPlotCare);
  // 乾坤袋的售出数量：边输入边更新按钮上的份数和金额；离开输入框时把超出范围的数字改回来
  $('dialog-content').addEventListener('input', event => { const id = event.target?.dataset?.sellCount; if (id) setSellCount(id, event.target.value); });
  $('dialog-content').addEventListener('change', event => {
    if (event.target?.dataset?.sellCount) { const id = event.target.dataset.sellCount; setSellCount(id, event.target.value); event.target.value = sellCountOf(id); return; }
    if (economy.handleChange(event)) return;
    if (farmUI.handleChange(event)) return;
    if (event.target.id !== 'care-seed') return;
    const c = cropMap[event.target.value];
    if (!c || c.minRealm > engine.state.realm) return;
    selectedCrop = c.id; selectedTool = 'auto'; careSignature = '';
    renderSeeds(); renderFarmTools(); renderPlotCare();
    $('care-seed')?.focus({preventScroll:true});
  });
  $('breakthrough').addEventListener('click', async () => { const result = await engine.breakthrough(); if (result.ok) playSound('breakthrough'); });
  $('scene-help').addEventListener('click',openGuide);
  $('open-codex').addEventListener('click',openCodex);
  $('dialog-close').addEventListener('click',closeDialog);
  $('dialog-back').addEventListener('click',closeDialog);
  $('game-dialog').addEventListener('click',event => { if (event.target === $('game-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
  $('reset-camera').addEventListener('click',() => { scene?.resetCamera?.(); if (!scene?.supported) toast('当前为轻量灵田模式，田块可直接点击。','info'); });
  $('save-camera')?.addEventListener('click',() => {
    if (!scene?.saveDefaultCamera) { toast('当前为轻量灵田模式，无需设置镜头。','info'); return; }
    const result = scene.saveDefaultCamera();
    const message = result.message || (result.ok ? result.persisted ? '已保存当前角度、远近和位置为默认视角。' : '已将当前视角设为默认，本次会话有效；浏览器未允许保存。' : '当前视角暂时无法保存。');
    toast(message,result.ok ? result.persisted ? 'success' : 'info' : 'error');
  });
  $('zoom-in').addEventListener('click',() => scene?.zoomBy?.(.18));
  $('zoom-out').addEventListener('click',() => scene?.zoomBy?.(-.18));
  function focusMainPage() {
    let target = gameWindow === 'cards' ? document.querySelector('#cards-host [data-study-overlay]') : null;
    target ||= gameWindow ? document.querySelector(gameWindow === 'cards' ? '#cards-host [data-cards-close], #cards-host .daozang-close' : gameWindow === 'sect-info' ? '.game-sect-info .fullscreen-panel-close' : '.game-window-close') : null;
    target ||= $('fullscreen-title');
    if (!target.getClientRects().length) target = document.querySelector('[data-fullscreen-nav][aria-current="page"]:not(:disabled)') || $('fullscreen-bar');
    target.focus({preventScroll:true});
  }
  function syncGameWindow(kind = '') {
    const next = cardsUI?.isOpen() ? 'cards' : activePage === 'journey' && ['journey','decor','sect-info'].includes(kind) ? kind : '';
    if (next && fullscreenPanel) setFullscreenPanel('');
    gameWindow = next;
    if (next) document.body.dataset.gameWindow = next;
    else delete document.body.dataset.gameWindow;
    const backgrounds = next ? ['fullscreen-bar','game-dock','game-quest-peek','game-guard-resume','garden-page'].map(id => $(id)).filter(Boolean) : [];
    if (next === 'cards') backgrounds.push($('journey-page'));
    if (next === 'sect-info') {
      for (const selector of ['.game-sect-backdrop','.game-sect-selector','.game-sect-info-toggle']) {
        const node = document.querySelector(selector); if (node) backgrounds.push(node);
      }
    }
    for (const [node, previous] of gameWindowInert) {
      if (!backgrounds.includes(node)) { node.inert = previous; gameWindowInert.delete(node); }
    }
    for (const node of backgrounds) {
      if (!gameWindowInert.has(node)) gameWindowInert.set(node, node.inert);
      node.inert = true;
    }
  }
  function containGameWindowFocus(event) {
    if (event.key !== 'Tab' || !gameWindow) return;
    const panel = gameWindow === 'cards' ? document.querySelector('#cards-host [data-study-overlay]') || document.querySelector('#cards-host .daozang-window') : document.querySelector(gameWindow === 'sect-info' ? '.game-sect-info' : '.game-journey-window');
    if (!panel) return;
    const controls = [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')]
      .filter(node => node.getClientRects().length && node.getAttribute('tabindex') !== '-1' && !node.closest('[inert]'));
    if (!controls.length) { event.preventDefault(); panel.focus({preventScroll:true}); return; }
    const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
    if (!panel.contains(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault(); (event.shiftKey ? last : first).focus({preventScroll:true});
    }
  }
  function setActivityTab(next = 'quests', focus = false) {
    if (!['quests','guard'].includes(next)) return;
    const changed = activityTab !== next;
    activityTab = next;
    const sheet = $('quests-panel');
    if (sheet) sheet.dataset.activityTab = next;
    for (const name of ['quests','guard']) {
      const pane = $('activity-' + name), tab = $('activity-tab-' + name);
      if (pane) pane.hidden = name !== next;
      if (tab) { tab.setAttribute('aria-selected',String(name === next)); tab.tabIndex = name === next ? 0 : -1; }
    }
    if (changed) { noteNavigation(); if (sheet) sheet.scrollTop = 0; }
    if (next === 'guard' && fullscreenPanel === 'quests') {
      farmUI?.refreshActivityHistory?.();
      if (changed) void farmUI?.loadActivityHistory?.();
    }
    if (focus) $('activity-tab-' + next)?.focus({preventScroll:true});
  }
  function setFullscreenPanel(next = '', restoreFocus = false) {
    if (next && gameWindow) {
      if (gameWindow !== 'sect-info') return;
      journeyUI?.dismissWindow?.();
    }
    const previous = fullscreenPanel;
    fullscreenPanel = ['seeds','tools','camera','cultivation','quests'].includes(next) ? next : '';
    if (activePage !== 'garden' && !['cultivation','quests'].includes(fullscreenPanel)) fullscreenPanel = '';
    document.body.dataset.fullscreenPanel = fullscreenPanel;
    if (previous !== fullscreenPanel) noteNavigation();
    const panels = {seeds:$('seed-section'),tools:$('farm-tools'),camera:document.querySelector('.camera-controls'),cultivation:$('cultivation-panel'),quests:$('quests-panel')};
    for (const name of ['cultivation','quests']) if (panels[name]) panels[name].hidden = fullscreenPanel !== name;
    document.querySelectorAll('button[data-fullscreen-panel]').forEach(button => button.setAttribute('aria-expanded',String(button.dataset.fullscreenPanel === fullscreenPanel)));
    if (fullscreenPanel === 'quests') {
      setActivityTab(activityTab);
      if (activityTab === 'guard' && previous !== 'quests') void farmUI?.loadActivityHistory?.();
    }
    if (fullscreenPanel) {
      const panel = panels[fullscreenPanel];
      requestAnimationFrame(() => {
        if (panel && fullscreenPanel === next) panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
      });
    } else if (restoreFocus && previous) {
      document.querySelector(`button[data-fullscreen-panel="${previous}"]`)?.focus({preventScroll:true});
    }
  }
  function renderFullscreenControls() {
    const state = engine.state, realm = realms[state.realm];
    const sectOpen = activePage === 'journey' && activeJourneyTab === 'sect';
    const decorOpen = activePage === 'journey' && activeJourneyTab === 'decor';
    document.body.dataset.fullscreenPage = activePage;
    document.body.dataset.gameView = sectOpen ? 'sect' : decorOpen ? 'decor' : activePage === 'journey' ? 'journey' : mode;
    if (activePage === 'journey') $('garden-page').hidden = sectOpen;
    $('fullscreen-bar').hidden = false;
    $('fullscreen-title').textContent = sectOpen ? '宗门山景' : decorOpen ? '洞天布置' : activePage === 'journey' ? '仙途长卷' : mode === 'home' ? '我的灵田' : '拜访道友';
    $('fullscreen-stones').textContent = fmt(state.stones);
    $('fullscreen-realm').textContent = realm.name;
    $('fullscreen-seed-name').textContent = cropMap[selectedCrop].name;
    $('fullscreen-tool-name').textContent = selectedTool === 'hoe' ? '锄净枯草' : selectedTool === 'wateringCan' ? '灵泉浇灌' : '随田照料';
    const inEconomy = !!cardsUI?.isOpen() || ['alchemy','market','bag'].includes(dialogKind);
    document.querySelectorAll('[data-fullscreen-nav]').forEach(button => {
      const current = !inEconomy && (button.dataset.fullscreenNav === 'sect' ? sectOpen : activePage === 'garden' && button.dataset.fullscreenNav === mode);
      button.classList.toggle('active',current);
      if (current) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
      button.disabled = !!decorEditor?.isOpen();
    });
    document.querySelectorAll('#game-dock [data-fullscreen-command]').forEach(button => {
      const command = button.dataset.fullscreenCommand;
      const current = command === 'cards' ? !!cardsUI?.isOpen() : command === 'journey' ? !inEconomy && activePage === 'journey' && !sectOpen && !decorOpen : command === 'decor' ? !inEconomy && decorOpen : dialogKind === command;
      button.classList.toggle('active',current);
      if (current) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
      button.disabled = !!decorEditor?.isOpen();
    });
    document.querySelectorAll('button[data-fullscreen-panel]').forEach(button => {
      const field = ['seeds','tools'].includes(button.dataset.fullscreenPanel);
      button.disabled = !!decorEditor?.isOpen() || (field && (mode !== 'home' || activePage !== 'garden'));
    });
    const cameraToggle = $('game-camera-toggle');
    if (cameraToggle) { cameraToggle.hidden = activePage !== 'garden'; cameraToggle.disabled = !!decorEditor?.isOpen(); }
    const native = !!fullscreenUI?.isNative();
    $('native-fullscreen-toggle').setAttribute('aria-pressed',String(native));
    $('native-fullscreen-toggle').setAttribute('aria-label',native ? '退出系统全屏' : '开启系统全屏');
    $('native-fullscreen-toggle').querySelector('span').textContent = native ? '退出全屏' : '全屏';
    $('game-guard-resume').hidden = !engine.online || !engine.pendingChallenge;
    $('game-guard-resume').disabled = !!decorEditor?.isOpen();
    if (engine.pendingChallenge) $('hud-guard-time').textContent = engine.pendingChallenge.expiresAt > engine.now() ? `余 ${timeLeft(engine.pendingChallenge.expiresAt-engine.now())}` : '查看结算';
    syncGameWindow(activePage !== 'journey' ? '' : sectOpen ? journeyUI?.getWindow?.() === 'sect-info' ? 'sect-info' : '' : decorOpen ? 'decor' : 'journey');
    environmentUI?.update();
  }
  function resizeFullscreenScenes() {
    if (fullscreenResizeFrame) return;
    fullscreenResizeFrame = requestAnimationFrame(() => {
      fullscreenResizeFrame = 0;
      if (activePage === 'garden') scene?.resize?.();
      journeyUI?.update();
    });
  }
  function syncCardOrientationPrompt() {
    const rotate = $('fullscreen-orientation');
    // Card reading supports either orientation. Restore the scene's existing
    // landscape prompt only after its card overlay has fully closed.
    // 智慧课堂（2026-11-18）：微信等 App 里的网页、锁了方向的手机转不过来，学生会一直卡在这里；点过“先竖着玩”的手机不再弹出
    const required = document.body.dataset.phonePortrait === 'true' && !portraitPlay && !cardsUI?.isOpen();
    if (required && !rotate.open) { $('fullscreen-orientation-status').hidden = true; rotate.showModal(); rotate.querySelector('button')?.focus({preventScroll:true}); }
    else if (!required && rotate.open) rotate.close();
  }
  // 横屏提示：按手机和打开方式说清楚为什么转不过来、怎么打开
  function orientationTip() {
    const ua = navigator.userAgent || '';
    const apple = /iPhone|iPod/i.test(ua);
    if (/MicroMessenger/i.test(ua)) return '在微信里打开的网页，默认不跟着手机转：请在微信“我 → 设置 → 通用”里打开“横屏模式”，再把手机横过来。';
    if (/\bQQ\/|DingTalk|Weibo|AlipayClient|Lark|Feishu|wxwork/i.test(ua)) return '在 App 里打开的网页可能不跟着手机转：可以点右上角菜单，改用手机浏览器打开（要重新登录一次）。';
    if (apple) return '苹果手机：从屏幕右上角向下轻扫打开控制中心，关掉“竖排方向锁定”（锁形图标），再把手机横过来。';
    return '安卓手机：下拉通知栏，打开“自动旋转”（有的手机叫“屏幕旋转”），再把手机横过来。';
  }
  function choosePortraitPlay() {
    portraitPlay = true;
    try { localStorage.setItem(PORTRAIT_PLAY_KEY,'1'); } catch (_) {}
    syncCardOrientationPrompt();
    syncGardenRendering(); resizeFullscreenScenes();
    focusMainPage();
    toast('已改为竖屏游玩。想看完整山景时，把手机横过来就会自动展开。','info');
  }
  async function tryAutoLandscape() {
    const status = $('fullscreen-orientation-status');
    status.hidden = true;
    try { await fullscreenUI?.enter(); } catch (_) {}
    // 自动横屏要浏览器支持（苹果手机、微信里的网页都不支持）；转不过来时说明原因，不让学生干等
    await new Promise(resolve => setTimeout(resolve,900));
    if ($('fullscreen-orientation').open && document.body.dataset.phonePortrait === 'true') {
      status.textContent = '这个浏览器没能自动横屏。可以按上面的方法打开旋转后横过手机，或者点“先竖着玩”。';
      status.hidden = false;
    }
  }
  function onFullscreenChange(state) {
    const wasNative = document.body.dataset.fullscreenNative === 'true';
    document.body.classList.add('game-fullscreen','game-app');
    document.body.dataset.fullscreenNative = String(state.native);
    document.body.dataset.phonePortrait = String(!!state.phonePortrait);
    document.body.dataset.fullscreenPage = activePage;
    scene?.setTouchMode?.(true);
    const rotate = $('fullscreen-orientation');
    const wasRotating = rotate.open;
    // Refresh the top layer after native fullscreen activates so the rotation
    // prompt remains above the same game surface on all browser variants.
    if (rotate.open && state.native && !wasNative) rotate.close();
    syncCardOrientationPrompt();
    syncGardenRendering();
    renderTop(); renderGarden(); journeyUI?.update(); resizeFullscreenScenes();
    liftToastLayer();
    if (wasRotating && !rotate.open) {
      if ($('game-dialog').open) $('dialog-close').focus({preventScroll:true});
      else focusMainPage();
    }
    window.SpiritGameBoot?.tryDaily();
  }
  async function runFullscreenCommand(command) {
    if (decorEditor?.isOpen()) return;
    if (command === 'cards') return openCards();
    if (command === 'camera') return setFullscreenPanel('camera');
    if (command === 'environment') return environmentUI?.open();
    if (command === 'decor') return journeyUI?.open('decor');
    if (command === 'settings') return openSettings();
    if (command === 'guide') return openGuide();
    if (command === 'about') return openAbout();
    if (command === 'guard') return engine.online ? engine.pendingChallenge ? farmUI.openChallenge() : farmUI.openHistory() : openArrival();
    if (command === 'sound') {
      soundEnabled = !soundEnabled;
      try { localStorage.setItem('yunjian-sound',String(soundEnabled)); } catch (_) {}
      renderTop();
      if (dialogKind === 'settings') openSettings();
      if (soundEnabled) playSound('success'); return;
    }
    if (command === 'breakthrough') {
      const result = await engine.breakthrough();
      if (result.ok) playSound('breakthrough');
      render(true); return;
    }
    return openNamed(command);
  }
  $('fullscreen-orientation-tip').textContent = orientationTip();
  $('fullscreen-orientation').addEventListener('cancel',event => { event.preventDefault(); });
  document.addEventListener('keydown',event => {
    if (event.defaultPrevented || $('game-dialog').open || $('fullscreen-orientation').open) return;
    if (gameWindow) { containGameWindowFocus(event); return; }
    const activityControl = event.target?.closest?.('[data-activity-tab]');
    if (fullscreenPanel === 'quests' && activityControl && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      return setActivityTab(event.key === 'Home' ? 'quests' : event.key === 'End' ? 'guard' : activityTab === 'quests' ? 'guard' : 'quests',true);
    }
    if (event.key === 'Escape' && fullscreenPanel) { event.preventDefault(); setFullscreenPanel('',true); }
  });
  document.addEventListener('pointerdown',event => {
    if (fullscreenPanel && event.target.closest('.scene-container')) setFullscreenPanel('');
  });
  try { scene = window.createSpiritScene?.({container:$('scene'),initiallyPaused:isGardenCovered(),onPlotClick:handlePlot,onStudyCardClick:handleStudyCard,getUnlockInfo:getPlotUnlockInfo,onPlotUnlock:handleUnlockPlot,onPlotAction:performFarmActionFromLabel,getToolTargets:toolTargets,isRaining}); }
  catch (_) { sceneError = true; scene = {supported:false}; }
  if (scene?.supported) $('scene').querySelector('.scene-loading')?.remove();
  environmentUI = window.createSpiritEnvironmentUI?.({scene,now:()=>engine.now(),online:engine.online,
    getScope:()=>activePage === 'garden' ? 'garden' : activeJourneyTab === 'sect' ? 'sect' : 'window',
    getCalendar:()=>{
      const owner=mode==='neighbors'&&engine.online?getNeighbor():null;
      return {startedAt:owner?.environmentStartedAt??engine.state.createdAt,ownerName:owner?.name||'',visiting:!!owner};
    },openDialog,closeDialog,getDialogKind:()=>dialogKind});
  decorEditor = window.createSpiritDecorEditor?.({scene,engine,container:document.querySelector('.garden-card'),toast,onClose:returnFromDecorEditor,onSaved:()=>render(true)});
  cardsUI = window.createSpiritCardsUI?.({host:$('cards-host'),engine,esc,icon,toast,onClose:returnFromCards,onOpenMarket:openCardsMarket,onChange:()=>render(true)});
  journeyUI = window.createSpiritJourneyUI?.({engine,openPage:openJourneyPage,isPageVisible:()=>activePage==='journey'&&!cardsUI?.isOpen()&&!$('game-dialog').open&&!$('fullscreen-orientation').open,getContent:()=>$('journey-page'),onTabChange:tab=>{activeJourneyTab=tab;renderFullscreenControls();},onWindowChange:syncGameWindow,onCloseWindow:closeJourneyWindow,openDialog,closeDialog,getDialogKind:()=>dialogKind,toast,art,icon,esc,fmt,onEditDecor:openDecorEditor,onDecorChange:()=>renderGarden(),openMarket:itemKey=>economy.openMarket(itemKey),onReturnHome:()=>{dismissDialog();setView('home');},onAlchemy:pillId=>economy.openAlchemy(pillId)});
  fullscreenUI = window.createSpiritFullscreenUI?.({target:document.documentElement,persistent:true,onChange:onFullscreenChange,onResize:resizeFullscreenScenes,isPhone:()=>Math.min(window.innerWidth,window.innerHeight)<=600&&Math.max(window.innerWidth,window.innerHeight)<=1100});
  render(true);
  const revealGarden = () => {
    document.body.classList.remove('game-booting');
    $('game-boot-splash').hidden = true;
    render(true);
    // render() may open today's full-screen card invitation. Resume only after
    // that decision, so the farm never draws underneath the opening pack.
    syncGardenRendering();
  };
  if (window.SpiritGameBoot) {
    void window.SpiritGameBoot.finish({engine,reveal:revealGarden,
      canPrompt:canOpenDailyCards,
      openDaily:openDailyCards
    }).catch(error=>{console.warn('入境过渡未能完成',error);revealGarden();});
  } else revealGarden();
  farmUI.initialize();
  void engine.loadStudy?.();
  // 智慧课堂 2026-11-22：进修（静修）模块的宿主接口（focus-host.js）——账号与道号（engine）、提示条、打开/关闭静修时暂停/恢复灵田渲染
  window.LingtianHost = Object.freeze({
    get engine(){return engine;},
    toast,
    syncRendering(){syncGardenRendering();if(document.body.dataset.focusOpen!=='1'&&!document.hidden){engine.tick();render(true);}},
  });
  let neighborTick = 0;
  const timer = setInterval(() => { if (document.hidden || document.body.dataset.focusOpen === '1') return; engine.tick(); render(false); if (++neighborTick % 4 === 0) renderNeighbors(); },1000);
  function resumeGarden(){
    if(document.hidden || document.body.dataset.focusOpen === '1')return;
    // Wake a suspended phone tab from a fresh server snapshot; season progress
    // is still derived from the original saved origin, never from this event.
    if(engine.online)void engine.refresh({settlePending:false});
    engine.tick();render(true);
    window.SpiritGameBoot?.tryDaily();
  }
  document.addEventListener('visibilitychange',resumeGarden);
  window.addEventListener('pageshow',event=>{if(event.persisted)resumeGarden();});
  window.addEventListener('pagehide', () => { try { engine.exportSave(); } catch (_) {} });
  setTimeout(() => {
    const count = engine.getStats().matureCount;
    if (!engine.state.stats.harvestCount && count) toast(`${count} 块灵田已成熟，点击「一键收获」开启仙途。`,'info');
    if (sceneError) toast('已启用轻量灵田模式，种植与偷采均可正常使用。','info');
  },900);
})().catch(error=>{
  window.SpiritGameBoot?.abort();
  console.error('灵田初始化失败',error);
  document.body.classList.add('game-booting');
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  const splash = document.getElementById('game-boot-splash');
  if (splash) {
    splash.hidden = false;
    splash.innerHTML = '<span class="game-avatar">灵</span><h1>洞天正在等你</h1><p>灵田未能完整加载，请刷新后继续。</p><button type="button" class="button button-primary">重新入境</button>';
    splash.querySelector('button').addEventListener('click',() => location.reload());
  }
});
