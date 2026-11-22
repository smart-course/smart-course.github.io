/* 静修界面：把计时、场景与衣装组合在一个稳定的全屏页面中。 */
(function (global) {
  'use strict';

  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const integer = value => Math.max(0, Math.floor(Number(value) || 0));
  const number = value => integer(value).toLocaleString('zh-CN');
  const paths = {
    back:'<path d="m14 5-7 7 7 7M7 12h14"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    gem:'<path d="m12 2 8 6-8 14L4 8ZM4 8h16M8 3l4 5 4-5M12 8v14"/>',
    sound:'<path d="m10 4-5 5H2v6h3l5 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute:'<path d="m10 4-5 5H2v6h3l5 5Zm5 5 6 6m0-6-6 6"/>',
    book:'<path d="M12 5v16M12 6C8 3 4 3 2 4v15c3-1 6 0 10 2 4-2 7-3 10-2V4c-3-1-7-1-10 2Z"/>',
    robe:'<path d="m8 3 4 3 4-3 6 7-4 3-2-3v11H8V10l-2 3-4-3Zm0 0 4 9 4-9M8 15h8"/>',
    shop:'<path d="M4 11v10h16V11M3 3h18l1 6c-1 3-4 3-5 0-1 3-4 3-5 0-1 3-4 3-5 0-1 3-4 3-5 0ZM9 21v-7h6v7"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    pause:'<path d="M8 5v14M16 5v14"/>',
    play:'<path d="m8 4 12 8-12 8Z"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    leaf:'<path d="M20 3C7 2 2 8 6 15s16 5 14-12ZM4 21 16 8"/>',
    tea:'<path d="M3 9h14v5a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6Zm14 1h2a3 3 0 0 1 0 6h-2M2 23h17M7 2v3m6-3v3"/>',
    lotus:'<path d="M12 21C4 20 1 16 2 10c4 0 8 3 10 11ZM12 21c8-1 11-5 10-11-4 0-8 3-10 11Zm0 0C6 16 6 9 12 3c6 6 6 13 0 18Z"/>',
    gear:'<path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 2 3h4l1-3 3-1 2-3-2-2 1-3-2-3-3 1-2-3Z"/><circle cx="12" cy="12" r="3"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4"/>',
    reset:'<path d="M4 9a9 9 0 1 1 1 9M4 3v6h6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    mountain:'<path d="m2 20 7-14 6 10 3-7 4 11ZM6 12l3 2 2-3"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
    star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
    lock:'<rect x="4" y="10" width="16" height="12" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-13 4h1m6 0h1m-8 3h1"/>',
    trophy:'<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v5m-5 1h10"/>',
    chevronLeft:'<path d="m15 5-7 7 7 7"/>',
    chevronRight:'<path d="m9 5 7 7-7 7"/>',
    refresh:'<path d="M20 7A9 9 0 0 0 4 6L2 9m0-6v6h6m-4 8a9 9 0 0 0 16 1l2-3m0 6v-6h-6"/>'
  };
  const icon = (name, extra='') => '<svg class="fx-icon '+extra+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name] || paths.leaf)+'</svg>';
  const actionButton = (action, label, extra='', kind='secondary') => '<button type="button" class="fx-button fx-button-'+kind+'" data-fx-action="'+action+'" '+extra+'>'+label+'</button>';
  const clock = ms => {
    const value = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
    const pad = n => String(n).padStart(2, '0');
    return value >= 3600 ? pad(Math.floor(value / 3600))+':'+pad(Math.floor(value % 3600 / 60))+':'+pad(value % 60) : pad(Math.floor(value / 60))+':'+pad(value % 60);
  };
  function duration(ms, exact=false) {
    const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000), minutes = Math.floor(seconds / 60);
    if (exact && minutes < 60) return minutes+' 分 '+(seconds % 60)+' 秒';
    if (minutes >= 60) return Math.floor(minutes / 60)+' 小时'+(minutes % 60 ? ' '+minutes % 60+' 分' : '');
    return minutes ? minutes+' 分钟' : seconds ? '不足 1 分钟' : '0 分钟';
  }
  function dateLabel(value) {
    try { return new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); }
    catch (_) { return '静修记录'; }
  }
  const reviewValue = value => typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  function reviewDuration(value) {
    const ms=reviewValue(value);if(ms===null)return '未留存';
    if(ms>0&&ms<1000)return '不足 1 秒';
    const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
    return (hours?hours+' 小时 ':'')+(hours||minutes?minutes+' 分 ':'')+seconds%60+' 秒';
  }
  function reviewDate(value) {
    if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return '未留存';
    try { return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)); }
    catch (_) { return '未留存'; }
  }
  const beijingDay = () => new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const dayLabel = value => { const parts=String(value||'').split('-');return parts.length===3?Number(parts[1])+' 月 '+Number(parts[2])+' 日':'当日'; };
  const monthLabel = value => { const parts=String(value||'').split('-');return parts.length===2?Number(parts[0])+' 年 '+Number(parts[1])+' 月':'修行日历'; };
  const shortDuration = ms => { const minutes=Math.floor(integer(ms)/60000);return minutes>=100?Math.floor(minutes/60)+'时'+(minutes%60?String(minutes%60).padStart(2,'0'):''):minutes?minutes+'分':ms>0?'少许':'—'; };
  const clothingVariant = entry => ({pin:'basic',plain:'basic',knot:'basic',rain:'bamboo',scroll:'bamboo',crane:'cloud',jade:'cloud',celestial:'star',moon:'star',lantern:'star'}[entry?.shape] || entry?.shape || entry?.id?.split('_').pop() || 'basic');
  let instanceCount = 0, artworkSequence = 0;

  function create(options) {
    const root = options.container;
    if (!root || !global.SpiritFocus || !global.SpiritFocusCatalog) throw new Error('静修资源尚未准备完成。');
    const C = global.SpiritFocusCatalog;
    const online = !!options.online;
    if (online && !global.SpiritFocusOnline) throw new Error('同修连接尚未准备好，请重新进入静修。');
    const uid = 'fx-'+(++instanceCount)+'-';
    root.classList.add('focus-root'); root.hidden = true;
    root.innerHTML = '<div class="fx-app" role="dialog" aria-modal="true" aria-label="静修自习室" tabindex="-1">'+
      '<header class="fx-header">'+
        '<button type="button" class="fx-back" data-fx-action="close" data-focus-close aria-label="暂停静修并返回灵田">'+icon('back')+'<span>返回灵田</span></button>'+
        '<div class="fx-brand"><button type="button" class="fx-brand-seal" data-fx-ref="companion" data-fx-action="identity" aria-label="选择性别和头像" title="更换化身">静</button><div><h1>静修</h1><p>一席清欢，一寸精进</p></div></div>'+
        '<div class="fx-header-tools"><label class="fx-select"><span class="fx-sr-only">切换静修场景</span><select data-fx-ref="scene-select">'+C.SCENES.map(s=>'<option value="'+E(s.id)+'">'+E(s.name)+'</option>').join('')+'</select></label>'+
          '<div class="fx-jade" aria-label="悟玉余额">'+icon('gem')+'<strong data-fx-ref="jade">0</strong><span>悟玉</span></div>'+
          '<details class="fx-sound-menu" data-fx-ref="sound-menu"><summary class="fx-icon-button" aria-label="环境音与音量" title="环境音与音量"><span data-fx-ref="sound-icon">'+icon('mute')+'</span></summary><div class="fx-sound-popover"><strong>此间清音</strong><button type="button" class="fx-sound-toggle" data-fx-action="mute" aria-pressed="false"><span data-fx-ref="sound-label">开启环境音</span><i aria-hidden="true"></i></button><label for="'+uid+'soundscape">选择环境声</label><div class="fx-sound-choice"><select id="'+uid+'soundscape" data-fx-ref="soundscape" aria-label="选择静修环境声" aria-describedby="'+uid+'sound-description">'+(C.SOUNDS||[]).map(sound=>'<option value="'+E(sound.id)+'">'+E(sound.name)+'</option>').join('')+'</select></div><label for="'+uid+'volume">音量</label><input id="'+uid+'volume" type="range" min="0" max="100" step="1" value="30" data-fx-ref="volume" aria-label="环境音音量"><small id="'+uid+'sound-description" data-fx-ref="sound-description">随雅室配以疏弦、翻书或轻雨。</small></div></details>'+
          '<button type="button" class="fx-icon-button" data-fx-action="settings" aria-label="静修设置" title="静修设置">'+icon('gear')+'</button>'+
        '</div>'+
      '</header>'+
      '<main class="fx-main" data-fx-ref="main">'+
        '<section class="fx-world" aria-label="静修场景">'+
          '<div class="fx-world-heading"><div><span class="fx-eyebrow">云间一隅</span><h2 data-fx-ref="scene-title">藏经阁</h2><p data-fx-ref="scene-description">灯火温柔，书卷常新</p></div><div class="fx-room-heading"><button type="button" class="fx-room-tag" data-fx-ref="room-tag" data-fx-action="rooms" '+(online?'':'disabled')+'>'+icon(online?'people':'leaf')+'<span data-fx-ref="room-caption">'+(online?'选择同修雅室':'独坐修习')+'</span></button><span class="fx-connection" data-fx-ref="connection" '+(online?'':'hidden')+'></span></div></div>'+
          '<div class="fx-scene-stage" data-fx-ref="scene-stage"></div>'+
          '<div class="fx-scene-error" data-fx-ref="scene-error" hidden>'+icon('mountain')+'<p>场景暂未展开，仍可在下方选座静修。</p><button type="button" data-fx-action="retry-scene">重新展开场景</button></div>'+
          '<div class="fx-seat-line"><span class="fx-seat-label" data-fx-ref="seat-label">择一空席</span><div class="fx-seats" role="group" aria-label="选择静修座位">'+Array.from({length:8},(_,i)=>'<button type="button" data-fx-action="seat" data-seat="'+i+'" aria-label="选择第 '+(i+1)+' 席" aria-pressed="false"><span>'+String(i+1).padStart(2,'0')+'</span></button>').join('')+'</div><span class="fx-seat-hint">点击场景空席入座</span></div>'+
          '<div class="fx-inline-notice" data-fx-ref="notice" role="status" aria-live="polite" aria-atomic="true" hidden></div>'+
        '</section>'+
        '<section class="fx-console" data-fx-ref="console" data-expanded="false" aria-label="静修计时器">'+
          '<div class="fx-console-caption"><span data-fx-ref="console-label">静修计时</span><button type="button" class="fx-console-toggle" data-fx-action="toggle-console" data-fx-ref="console-toggle" aria-expanded="false" aria-label="展开静修计时面板"><span data-fx-ref="console-toggle-label">展开</span>'+icon('chevronRight')+'</button></div>'+
          '<div class="fx-session-copy"><div data-fx-ref="setup">'+
            '<div class="fx-modes" role="group" aria-label="计时模式"><button type="button" data-fx-action="mode" data-mode="pomodoro" aria-pressed="true">'+icon('lotus')+'番茄静修</button><button type="button" data-fx-action="mode" data-mode="single" aria-pressed="false">自由静修</button></div>'+
            '<label class="fx-goal-label" for="'+uid+'goal">立愿 <span>本次修习什么</span></label><input class="fx-goal-input" id="'+uid+'goal" data-fx-ref="goal" type="text" maxlength="60" autocomplete="off" placeholder="例如：复习第三章，读懂一个概念">'+
            '<div class="fx-duration-options" data-fx-ref="duration-options" role="group" aria-label="专注时长">'+[25,40,50].map(m=>'<button type="button" data-fx-action="minutes" data-minutes="'+m+'" aria-pressed="'+(m===25)+'">'+m+' 分</button>').join('')+'<button type="button" data-fx-action="minutes" data-minutes="custom" aria-pressed="false">自定</button><label class="fx-custom-minutes" data-fx-ref="custom-wrap" hidden><input type="number" min="5" max="120" step="1" value="25" data-fx-ref="custom-minutes" aria-label="自定义专注分钟">分</label></div>'+
            '<p class="fx-mode-description" data-fx-ref="mode-description"></p>'+
          '</div><div class="fx-session-summary" data-fx-ref="summary" hidden><span class="fx-eyebrow" data-fx-ref="summary-eyebrow">此番立愿</span><h3 data-fx-ref="summary-title"></h3><p data-fx-ref="summary-note"></p><div class="fx-session-benefit" data-fx-ref="session-benefit"></div></div></div>'+
          '<div class="fx-clock-area"><div class="fx-clock-ring" data-fx-ref="clock-ring"><svg viewBox="0 0 132 132" fill="none" aria-hidden="true"><circle class="fx-ring-track" cx="66" cy="66" r="58"/><circle class="fx-ring-progress" data-fx-ref="ring" cx="66" cy="66" r="58" stroke-dasharray="364.425" stroke-dashoffset="364.425"/></svg><div class="fx-clock-face"><span class="fx-clock-label" data-fx-ref="clock-label">静待入席</span><strong data-fx-ref="clock" role="timer" aria-live="off">25:00</strong><span class="fx-clock-sub" data-fx-ref="clock-sub">一段静心时光</span></div></div></div>'+
          '<div class="fx-session-actions"><div class="fx-cycle" data-fx-ref="cycle"></div><div class="fx-primary-actions" data-fx-ref="actions"></div><p class="fx-action-note" data-fx-ref="action-note"></p></div>'+
        '</section>'+
      '</main>'+
      '<footer class="fx-footer"><div class="fx-today"><span class="fx-today-icon">'+icon('book')+'</span><div><span>今日静修</span><strong data-fx-ref="today">0 分钟</strong></div><small data-fx-ref="today-rounds">尚未完成专注段</small></div><nav class="fx-utilities" aria-label="静修功能">'+(online?'<button type="button" data-fx-action="rooms">'+icon('people')+'<span>同修</span></button>':'')+'<button type="button" data-fx-action="wardrobe">'+icon('robe')+'<span>衣橱</span></button><button type="button" data-fx-action="shop">'+icon('shop')+'<span>衣装坊</span></button><button type="button" data-fx-action="history">'+icon('book')+'<span>修行录</span></button></nav><p class="fx-footer-verse">心定一处，自有回响</p></footer>'+
      '<div class="fx-panel-layer" data-fx-ref="panel-layer" hidden><button class="fx-panel-backdrop" type="button" data-fx-action="panel-close" aria-label="关闭面板"></button><section class="fx-panel" data-fx-ref="panel" role="dialog" aria-modal="true" aria-labelledby="'+uid+'panel-title" tabindex="-1"><header class="fx-panel-header"><div><span class="fx-eyebrow" data-fx-ref="panel-eyebrow">静修小记</span><h2 id="'+uid+'panel-title" data-fx-ref="panel-title"></h2></div><button type="button" class="fx-icon-button" data-fx-action="panel-close" aria-label="关闭面板">'+icon('close')+'</button></header><p class="fx-operation-status" data-fx-ref="operation-status" role="status" aria-live="polite" hidden></p><div class="fx-panel-content" data-fx-ref="panel-content"></div></section></div>'+
      '<div class="fx-toast" data-fx-ref="toast" role="status" aria-live="polite" hidden></div>'+
    '</div>';

    const $ = name => root.querySelector('[data-fx-ref="'+name+'"]');
    const refs = Object.fromEntries(Array.from(root.querySelectorAll('[data-fx-ref]'), n=>[n.dataset.fxRef,n]));
    const app = root.querySelector('.fx-app');
    // 常驻控件只定位一次，计时刷新不反复遍历整页。
    const controls = {
      seats:Array.from(root.querySelectorAll('[data-fx-action="seat"]')),
      modes:Array.from(root.querySelectorAll('[data-fx-action="mode"]')),
      minutes:Array.from(root.querySelectorAll('[data-fx-action="minutes"]')),
      mute:root.querySelector('[data-fx-action="mute"]'),
      close:root.querySelector('[data-focus-close]'),
      header:root.querySelector('.fx-header'),footer:root.querySelector('.fx-footer')
    };
    const engine = options.engine || (online ? global.SpiritFocusOnline : global.SpiritFocus).create({profileId:options.profileId,nickname:options.nickname,accountKey:options.accountKey,identity:options.identity,getIdentity:options.getIdentity});
    let snapshot = engine.getSnapshot();
    let consoleExpanded=false;
    let opened = false, destroyed = false, scene = null, audio = null, busy = false, avatarPreview = null, identityOpen = false;
    let pendingOperation=null,operationSequence=0,panelIntent=0,panelPausePending=null,interactionStatusKey='';
    const operationControls=new Map();
    let companionKey = '';
    let panelName = '', panelSlot = 'head', panelKey = '', panelReturnFocus = null, previewItem = null, historyPage = 0;
    let actionsKey = '', cycleKey = '', mediaKey = '', lastSceneKey = '', meaningfulKey = '', latestFinishedId = '';
    let layoutKey = '', clockKey = '', benefitKey = '', achievementOwnedKey = '', sceneFrame = null;
    let toastTimer = null, resizeFrame = null, downloadURL = '', pendingImport = null, wakeLock = null, wakePending = false, wakeStatus = '';
    let preparingNext = false, lastActiveId = snapshot.active?.id || '';
    let roomTab='public', roomDraft={name:'',subject:'自由修习',sceneId:'library',visibility:'private',inviteCode:'',friendCode:''}, historySource='cloud';
    let hasOfferedRooms=false;
    let progressTab='calendar',progressMonth=beijingDay().slice(0,7),progressDay=beijingDay(),progressData=null,progressReadAt=0;
    let progressStatus='idle',progressError='',progressRequest=0,progressVersion=0,progressContext='',achievementFocus='';
    let progressTimer=null;
    const progressCache=new Map();
    let openingView=false,achievementToastPrimed=false;
    const seenAchievementRewards=new Set();
    const previousFocus=snapshot.active?.kind==='focus'?snapshot.active:snapshot.history?.[0];
    const draft = {mode:snapshot.active?.mode || 'pomodoro',target:previousFocus?.target || snapshot.pomodoro?.lastTarget || '',minutes:previousFocus?.minutes || 25,custom:false};
    draft.custom=![25,40,50].includes(draft.minutes);
    refs.goal.value = draft.target;
    refs['custom-minutes'].value=String(draft.minutes);

    const setText = (node, value) => { const text=String(value ?? ''); if(node && node.textContent!==text) node.textContent=text; };
    function setConsoleExpanded(value) {
      const next=!!value;if(consoleExpanded===next)return;
      consoleExpanded=next;refs.console.dataset.expanded=String(next);
      refs['console-toggle'].setAttribute('aria-expanded',String(next));
      refs['console-toggle'].setAttribute('aria-label',(next?'收起':'展开')+'静修计时面板');
      setText(refs['console-toggle-label'],next?'收起':'展开');
      // 浮窗仅改变自身大小，画布和镜头始终保持整屏，不因按钮或网络状态重排。
      actionsKey='';renderActions();
    }
    function sceneInsets() {
      const width=global.innerWidth||refs['scene-stage'].clientWidth||1280;
      const height=global.innerHeight||refs['scene-stage'].clientHeight||800;
      if(width>720&&height<=560)return {top:70,right:16,bottom:122,left:16};
      if(width<=720)return {top:width<360?140:114,right:12,bottom:250,left:12};
      return {top:width>1060?100:98,right:width>1060?22:16,bottom:width>1060?154:160,left:width>1060?22:16};
    }
    const item = id => C.ITEM_MAP?.[id] || C.getItem?.(id) || C.ITEMS.find(entry=>entry.id===id);
    const settings = () => snapshot.settings || {};
    const currentScene = () => C.SCENES.find(entry=>entry.id===snapshot.sceneId) || C.SCENES[0];
    const chosenMinutes = () => draft.mode==='pomodoro' ? Number(settings().pomodoroFocusMinutes || 25) : Number(draft.minutes);
    const rewardFor = minutes => Math.floor(Number(minutes)*0.4);
    const displayActive = () => snapshot.active && snapshot.active.status!=='cancelled' && !preparingNext ? snapshot.active : null;
    const pausedReason = reason => ({network:'连接中断，本段已暂停。连接恢复后请手动继续。',disconnected:'同步中断，本段已暂停。准备好后请手动继续。',connection:'连接中断，本段已暂停。',reconnect:'连接已恢复，准备好后点击继续静修。',owner:'另一设备正在使用此会话，请先在那里暂停。',room:'雅室已更换，请重新入席后继续。'}[reason] || C.PAUSE_REASONS?.[reason] || '计时已暂停，原进度已保留。');

    function showToast(message, kind='info') {
      if (!message || destroyed) return;
      setText(refs.toast, message); refs.toast.dataset.kind=kind; refs.toast.hidden=false;
      clearTimeout(toastTimer); toastTimer=setTimeout(()=>{if(!destroyed)refs.toast.hidden=true;},4200);
      if(!opened)options.onToast?.(message,kind);
    }

    function noticeAchievementRewards() {
      if(online&&snapshot.connection!=='connected')return;
      const ownedKey=(snapshot.owned||[]).join('|');
      if(ownedKey===achievementOwnedKey){if(opened&&!openingView)achievementToastPrimed=true;return;}
      achievementOwnedKey=ownedKey;
      const rewards=(snapshot.owned||[]).map(id=>item(id)).filter(entry=>entry?.achievementId);
      const fresh=rewards.filter(entry=>!seenAchievementRewards.has(entry.id));
      rewards.forEach(entry=>seenAchievementRewards.add(entry.id));
      // 首次连接和旧账回补只建立基线；之后每件限定衣装仅提示一次，不打断计时。
      if(!achievementToastPrimed){if(opened&&!openingView)achievementToastPrimed=true;return;}
      if(fresh.length&&opened&&!openingView)showToast('修行有成！'+fresh.map(entry=>entry.name).join('、')+'已收入衣橱，随时可穿戴。','success');
    }

    const operationLabels={
      reconnect:'正在连接雅室…','refresh-rooms':'正在更新雅室…','join-room':'正在入室…','join-invite':'正在入室…',
      'create-room':'正在开设雅室…','leave-room':'正在离开雅室…','rotate-invite':'正在更换邀请码…',
      'friend-request':'正在递出邀帖…','friend-person':'正在递出邀帖…','friend-accept':'正在确认道友…',
      'friend-decline':'正在回应邀帖…','friend-remove':'正在更新道友…',
      start:'正在开始静修…',pause:'正在确认暂停…',resume:'正在继续静修…','cancel-confirm':'正在结束本段…',
      break:'正在开始小憩…','end-break':'正在结束小憩…',buy:'正在置办…',equip:'正在穿戴…',
      mute:'正在保存音效…','save-settings':'正在保存设置…','select-scene':'正在切换场景…',
      'import-confirm':'正在恢复存档…'
    };
    const superseded = result => result?.code==='focus_request_superseded';
    function connectionMessage() {
      return snapshot.connection==='connecting'?'正在连接雅室，请稍候再入席或开始静修。':snapshot.connection==='auth_required'?'请先返回灵田重新登录。':snapshot.connectionError||'同修连接暂未恢复，请先点击重新连接。';
    }
    function pendingMessage() {return pendingOperation?.label||'';}
    function renderInteractionStatus() {
      const warning=snapshot.connectionError||snapshot.storageError||(snapshot.lockConflict?'另一页面正在静修，请先结束或暂停那里的计时。':'');
      const pending=pendingMessage()||(panelPausePending?'专注已在本页暂停，正在同步记录…':'');
      const message=warning||pending||(online&&snapshot.connection!=='connected'?connectionMessage():'');
      const key=[message,pending,warning?'error':'pending',panelName].join('|');
      if(key===interactionStatusKey)return;interactionStatusKey=key;
      // 通知只悬浮在当前可见区域，不插入计时器网格，也不重复朗读被面板遮住的提示。
      setText(refs.notice,message);refs.notice.hidden=!message||!!panelName;refs.notice.dataset.kind=warning?'error':'pending';
      setText(refs['operation-status'],warning||pending);refs['operation-status'].hidden=!panelName||!(warning||pending);
      refs['operation-status'].dataset.kind=warning?'error':'pending';
    }
    function restoreOperationControls() {
      for(const [node,previous] of operationControls){
        if(!node.isConnected)continue;
        node.disabled=previous.disabled;
        if(previous.ariaBusy===null)node.removeAttribute('aria-busy');else node.setAttribute('aria-busy',previous.ariaBusy);
        if(!previous.pendingClass)node.classList.remove('is-pending');
        if(previous.html!==null)node.innerHTML=previous.html;
      }
      operationControls.clear();
    }
    function paintOperationControls() {
      const operation=pendingOperation;if(!operation)return;
      const candidates=[operation.button,...Array.from(root.querySelectorAll('[data-fx-action]')).filter(node=>
        node.dataset.fxAction===operation.action&&Object.entries(operation.match).every(([key,value])=>node.dataset[key]===value))];
      for(const node of candidates){
        if(!node?.isConnected||operationControls.has(node))continue;
        // 席位保留编号，含引用节点的音效开关保留结构；其余操作就地显示正在处理。
        const replace=node.tagName==='BUTTON'&&operation.action!=='seat'&&!node.querySelector('[data-fx-ref]');
        operationControls.set(node,{disabled:node.disabled,ariaBusy:node.getAttribute('aria-busy'),pendingClass:node.classList.contains('is-pending'),html:replace?node.innerHTML:null});
        node.disabled=true;node.setAttribute('aria-busy','true');node.classList.add('is-pending');
        if(replace)node.innerHTML='<span class="fx-inline-spinner" aria-hidden="true"></span><span>'+E(operation.label)+'</span>';
      }
    }
    async function perform(action, successMessage='', context={}) {
      if(destroyed)return {ok:false,code:'focus_closed'};
      if(busy){showToast(pendingMessage()||'上一项操作仍在处理中，请稍候。');return {ok:false,code:'focus_action_pending'};}
      if(online&&snapshot.connection!=='connected'&&context.action!=='reconnect'&&context.action!=='pause'){
        const message=connectionMessage();showToast(message);return {ok:false,code:'focus_not_connected',message};
      }
      const operation={id:++operationSequence,action:context.action||'',button:context.button,
        label:context.label||operationLabels[context.action]||'正在确认操作…',match:context.match||{}};
      busy=true;pendingOperation=operation;renderActions();paintOperationControls();renderInteractionStatus();
      try {
        const result=await action();
        if(result?.ok===false&&!superseded(result))showToast(result.message||'本次操作未完成，请稍后再试。','error');
        else if(result?.ok!==false&&successMessage)showToast(successMessage,'success');
        snapshot=engine.getSnapshot();render(snapshot);
        return result||{ok:true};
      }catch(error){
        showToast(error?.message||'本次操作未完成，已有记录已保留。','error');return {ok:false};
      }finally{
        if(pendingOperation===operation){
          restoreOperationControls();pendingOperation=null;busy=false;actionsKey='';layoutKey='';
          render(snapshot);
        }
      }
    }

    function scheduleScene() {
      if(scene||sceneFrame!==null||destroyed||!opened||panelName)return;
      // 先呈现页面，再建立室内模型；网络连接与场景准备不互相阻塞。
      sceneFrame=requestAnimationFrame(()=>{
        sceneFrame=requestAnimationFrame(()=>{
          sceneFrame=null;
          if(destroyed||!opened||panelName)return;
          createScene();onResize();
        });
      });
    }

    function createScene() {
      if(scene || destroyed) return;
      cancelAnimationFrame(sceneFrame);sceneFrame=null;
      try {
        if(!global.SpiritFocusScene?.create) throw new Error('场景资源未就绪');
        scene=global.SpiritFocusScene.create({container:refs['scene-stage'],sceneId:snapshot.sceneId,onSeatSelect:selectSeat,viewportInsets:sceneInsets()});
        // setActive 的订阅可能先于场景构造触发；新绘图实例必须独立激活一次。
        mediaKey='';
        refs['scene-error'].hidden=true; lastSceneKey=''; updateScene();updateSceneClocks();updateMedia();
      } catch (_) { refs['scene-error'].hidden=false; }
    }

    function getAudio() {
      if(!audio && global.SpiritFocusAudio?.create){
        audio=global.SpiritFocusAudio.create();
        audio.setScene(snapshot.sceneId);audio.setSoundscape?.(settings().soundscape||'scene');audio.setVolume(settings().volume??0.3);
      }
      return audio;
    }

    function sound(kind) {
      if(settings().muted) return;
      try { const a=getAudio(); a?.setEnabled(true); a?.setVolume(settings().volume ?? 0.3); a?.play(kind); } catch (_) {}
    }

    function sceneState() {
      const active=snapshot.active;
      return active?.status==='cancelled' ? 'ended' : active?.status==='completed' ? 'completed' : active?.kind==='break' && active.status==='running' ? 'resting' : active?.kind==='focus' && active.status==='running' ? 'focusing' : active?.status==='paused' ? 'paused' : snapshot.seatId===null ? 'idle' : 'seated';
    }

    // 只比较画面真正使用的字段，心跳时间戳不应触发人物与标签重绘。
    const participantView = p => [p.id,p.seatId,p.nickname,p.avatarId,p.target,p.status,p.pauseReason,p.timerStale,p.kind,p.equipped,p.isFriend,p.isSelf];
    const currentIdentity = () => options.getIdentity?.() || snapshot.identity || options.identity;
    const selfPortrait = () => ({id:options.profileId||snapshot.participantId||'local:self',identity:currentIdentity(),equipped:snapshot.equipped});
    const selfAvatarId = () => global.FocusCharacters?.getCharacter(selfPortrait()).id;
    const roomView = room => room ? [room.id,room.title,room.subject,room.privacy,room.sceneId,room.onlineCount,room.inviteCode,room.isOwner] : null;

    function updateScene() {
      if (!scene) return;
      const state={sceneId:snapshot.sceneId,seatId:snapshot.seatId,nickname:snapshot.nickname || options.nickname || '云间道友',avatarId:selfAvatarId(),status:sceneState(),pauseReason:snapshot.active?.pauseReason||'',equipped:snapshot.equipped,catalog:C};
      if(online){state.participants=(snapshot.participants||[]).map(p=>p.isSelf||p.id===snapshot.participantId?{...p,status:sceneState(),pauseReason:state.pauseReason,avatarId:state.avatarId}:p);state.selfId=snapshot.participantId;}
      const key=JSON.stringify([state.sceneId,state.seatId,state.nickname,state.avatarId,state.status,state.pauseReason,state.equipped,state.selfId,state.participants?.map(participantView)]);
      if(key!==lastSceneKey){lastSceneKey=key;scene.update(state);}
    }

    // 场景异步就绪时也补上当前时间；已暂停的旧会话不会依赖下一次计时通知。
    function updateSceneClocks() {
      // 手动结束后只保留已结束状态，不再用旧会话的剩余时间覆盖头顶名牌。
      const a=snapshot.active?.status==='cancelled'?null:snapshot.active;
      scene?.updateClocks?.({elapsedMs:a?.elapsedMs,durationMs:a?.minutes*60000,kind:a?.kind,status:a?.status,pauseReason:a?.pauseReason||'',participants:(snapshot.participants||[]).map(p=>p.isSelf||p.id===snapshot.participantId?{...p,elapsedMs:a?.elapsedMs,durationMs:a?.minutes*60000,kind:a?.kind,status:a?.status,pauseReason:a?.pauseReason||''}:p)});
    }

    function updateMedia() {
      const active=snapshot.active;
      const visible=opened&&!document.hidden&&!panelName&&!identityOpen;
      avatarPreview?.setActive(opened&&!document.hidden&&(panelName==='wardrobe'||panelName==='shop'));
      const key=[visible,snapshot.sceneId,settings().muted,settings().volume,settings().soundscape,active?.status].join(':');
      if(key!==mediaKey){
        mediaKey=key; scene?.setActive(visible);
        try {const a=audio||(!settings().muted&&visible?getAudio():null);a?.setScene(snapshot.sceneId);a?.setSoundscape?.(settings().soundscape||'scene');a?.setVolume(settings().volume ?? 0.3);a?.setEnabled(!settings().muted);a?.setActive(visible&&active?.status!=='paused');}catch(_){}
      }
      if(!canWake()) releaseWake();
    }

    function canWake() {
      return opened&&!panelName&&!identityOpen&&!document.hidden&&document.hasFocus()&&settings().keepAwake&&snapshot.active?.kind==='focus'&&snapshot.active.status==='running';
    }

    async function requestWake() {
      if(!canWake() || wakeLock || wakePending) return;
      if(!global.navigator?.wakeLock?.request){wakeStatus='当前浏览器暂不支持自动亮屏';updateWakeLabel();return;}
      wakePending=true;
      try {
        const value=await global.navigator.wakeLock.request('screen');
        if(!canWake()){await value.release();return;}
        wakeLock=value;wakeStatus='静修期间已保持亮屏';
        value.addEventListener('release',()=>{if(wakeLock===value){wakeLock=null;wakeStatus='系统已释放亮屏，可继续静修时重试';updateWakeLabel();}});
      } catch (_) {wakeStatus='系统未允许保持亮屏，锁屏后将暂停';}
      finally {wakePending=false;updateWakeLabel();}
    }

    function releaseWake() {
      if(wakeLock){const old=wakeLock;wakeLock=null;Promise.resolve(old.release()).catch(()=>{});}
      if(!settings().keepAwake)wakeStatus='保持亮屏已关闭';
      else if(!canWake())wakeStatus='开始静修后按设备能力保持亮屏';
      updateWakeLabel();
    }

    function updateWakeLabel() {if(panelName==='settings')setText(refs['panel-content'].querySelector('[data-fx-wake-status]'),wakeStatus || '开始静修后按设备能力保持亮屏');}

    function renderCycle() {
      const a=displayActive(), mode=a?.mode || draft.mode;
      const roundCount=integer(a?.roundsPerCycle || settings().roundsPerCycle)||4;
      const round=integer(a?.round || snapshot.pomodoro?.round)||1;
      const cycle=integer(a?.cycle || snapshot.pomodoro?.cycle)||1;
      const completed = a?.kind==='focus'&&a.status==='completed' || a?.kind==='break';
      const key=[mode,roundCount,round,cycle,completed].join(':');
      if(key===cycleKey)return;cycleKey=key;
      if(mode!=='pomodoro'){
        refs.cycle.innerHTML='<span class="fx-cycle-label">'+icon('leaf')+'自在安排，专注当下</span>';return;
      }
      refs.cycle.innerHTML='<div class="fx-rounds" aria-label="番茄静修第 '+round+' 轮，共 '+roundCount+' 轮">'+Array.from({length:roundCount},(_,i)=>'<span class="'+(i<round-1 || completed&&i===round-1 ? 'is-done' : i===round-1?'is-current':'')+'">'+(i<round-1 || completed&&i===round-1?icon('check'):(i+1))+'</span>').join('')+'</div><span class="fx-cycle-label">第 '+cycle+' 组 · 第 '+round+' / '+roundCount+' 轮</span>';
    }

    function renderActions() {
      if(destroyed)return;
      const a=displayActive(), seated=Number.isInteger(snapshot.seatId), disabled=busy?' disabled':'';
      const key=[a?.id,a?.kind,a?.status,a?.settlementPending,preparingNext,consoleExpanded,busy,seated,snapshot.lockConflict,snapshot.connection,snapshot.room?.id,snapshot.pomodoro?.nextBreakMinutes,settings().shortBreakMinutes].join(':');
      if(key===actionsKey)return; actionsKey=key;
      let html='', note='';
      if(online&&snapshot.connection!=='connected'){
        html=actionButton('reconnect',icon('refresh')+(snapshot.connection==='connecting'?'正在连接':'重新连接'),disabled+(snapshot.connection==='connecting'?' disabled':''),'primary');
        note='连接恢复后，手动开始或继续静修';
      }else if(online&&!snapshot.room){
        html=actionButton('rooms',icon('people')+'选择同修雅室',disabled,'primary');
        note='选一间雅室，与同窗各自用功';
      }else if(!a){
        html=actionButton('start',icon('play')+(consoleExpanded?'开始静修':'立愿静修'),disabled+(seated&&!snapshot.lockConflict?'':' disabled'),'primary');
        note=seated?'离开自动暂停 · 返回点击继续':'先点选一处空席，再立愿静修';
      }else if(a.status==='running'){
        html=actionButton('pause',icon('pause')+'暂歇片刻',disabled,'primary')+actionButton(a.kind==='break'?'end-break':'cancel',a.kind==='break'?'结束休息':'结束本段',disabled,'quiet');
        note=a.kind==='break'?'休息不累计专注时长与悟玉':'离开自动暂停 · 已学进度保留';
      }else if(a.status==='paused'){
        html=actionButton('resume',icon('play')+(a.kind==='break'?'继续小憩':'继续静修'),disabled+(seated&&!snapshot.lockConflict?'':' disabled'),'primary')+actionButton(a.kind==='break'?'end-break':'cancel',a.kind==='break'?'结束休息':'结束本段',disabled,'quiet');
        note=seated?'准备好了，就接着学':'先选一处座位，再继续';
      }else if(a.status==='completed'&&a.kind==='focus'&&a.settlementPending){
        html=actionButton('settling',icon('gem')+'正在结算悟玉','disabled','secondary');
        note='正在核对共修时长，请稍候片刻';
      }else if(a.status==='completed'&&a.kind==='focus'){
        const mins=Number(snapshot.pomodoro?.nextBreakMinutes || a.shortBreakMinutes || settings().shortBreakMinutes || 5);
        html=actionButton('break',icon('tea')+(snapshot.pomodoro?.nextBreakKind==='long'&&a.mode==='pomodoro'?'长歇 ':'小憩 ')+mins+' 分钟',disabled,'primary')+actionButton('next',a.mode==='pomodoro'?'准备下一轮':'再学一段',disabled,'quiet');
        note='悟玉已入囊 · 此段只结算一次';
      }else{
        html=actionButton('end-break',icon('leaf')+'准备下一轮',disabled,'primary');
        note='小憩已毕，下一段由你开始';
      }
      refs.actions.innerHTML=html;setText(refs['action-note'],note);paintOperationControls();
    }

    function render(next) {
      if(destroyed)return;
      snapshot=next || engine.getSnapshot();
      if(snapshot.active?.id!==lastActiveId){lastActiveId=snapshot.active?.id || '';preparingNext=false;}
      const a=displayActive(), st=settings(), sceneInfo=currentScene(), minutes=chosenMinutes();
      const people=online?(snapshot.participants||[]).map(participantView):null;
      // 秒表与其余界面分别刷新，四次心跳式计时不再重复改写座位、按钮和奖励内容。
      const nextLayoutKey=JSON.stringify([snapshot.sceneId,snapshot.seatId,snapshot.nickname,currentIdentity(),snapshot.jade,
        duration(snapshot.todayFocusMs),snapshot.todayCompletedCount,snapshot.lockConflict,snapshot.connection,
        snapshot.connectionError,snapshot.storageError,roomView(snapshot.room),st,snapshot.pomodoro,
        a&&[a.id,a.kind,a.status,a.target,a.minutes,a.breakKind,a.pauseReason,a.reward,a.earnedReward,
          a.friendBonus,a.bonusReward,a.settlementPending,a.round,a.cycle,a.roundsPerCycle,a.shortBreakMinutes],
        draft.mode,draft.minutes,draft.custom,preparingNext,snapshot.owned,snapshot.equipped,snapshot.participantId,people]);
      if(nextLayoutKey!==layoutKey){
        layoutKey=nextLayoutKey;
        refs.console.dataset.phase=a? a.kind+'-'+a.status:'ready';
        setText(refs['console-label'],a?.kind==='break'?'茶歇片刻':a?.target||'立愿 · 开始一段静修');
        root.dataset.scene=snapshot.sceneId;
        setText(refs.jade,number(snapshot.jade));
        const portrait=selfPortrait(),appearance=global.FocusCharacters?.appearanceKey?.(portrait)||JSON.stringify([selfAvatarId(),snapshot.equipped]);
        if(companionKey!==appearance&&global.FocusCharacters){companionKey=appearance;refs.companion.innerHTML=global.FocusCharacters.portraitMarkup(portrait);}
        setText(refs['scene-title'],sceneInfo.name);
        setText(refs['scene-description'],sceneInfo.description || (snapshot.sceneId==='rain'?'听一窗雨，读一卷书':'灯火温柔，书卷常新'));
        if(online){
          setText(refs['room-caption'],snapshot.room?(snapshot.room.title+' · '+integer(snapshot.room.onlineCount)+' / 8'):'选择同修雅室');
          const connectionText=snapshot.connection==='connected'?'已连接 · 同修状态约 10 秒同步':snapshot.connection==='connecting'?'正在连接雅室…':snapshot.connection==='auth_required'?'请返回灵田重新登录':'连接中断 · 计时已暂停';
          setText(refs.connection,connectionText);refs.connection.dataset.state=snapshot.connection||'connecting';
          refs['scene-select'].title=snapshot.room?'切换场景将离开当前雅室，专注会暂停':'选择喜欢的静修场景';
        }
        setText(refs['seat-label'],Number.isInteger(snapshot.seatId)?'已入第 '+(snapshot.seatId+1)+' 席':'择一空席');
        controls.seats.forEach(button=>{const index=Number(button.dataset.seat), selected=index===snapshot.seatId, occupant=online?(snapshot.participants||[]).find(p=>p.seatId===index):null;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('is-selected',selected);button.classList.toggle('is-occupied',!!occupant&&!selected);button.classList.toggle('is-friend',!!occupant?.isFriend);button.setAttribute('aria-label',occupant?'第 '+(index+1)+' 席，'+occupant.nickname+(selected?'，我的座位':'，已入座'):'选择第 '+(index+1)+' 席');button.title=occupant?(occupant.nickname+(occupant.isFriend?' · 道友':'')):'第 '+(index+1)+' 席空闲';button.disabled=online&&snapshot.connection!=='connected';});
        setText(refs.today,duration(snapshot.todayFocusMs));
        setText(refs['today-rounds'],snapshot.todayCompletedCount?'已完成 '+snapshot.todayCompletedCount+' 段':'从一段静心时光开始');
        refs.setup.hidden=!!a;refs.summary.hidden=!a;
        controls.modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===draft.mode)));
        refs['duration-options'].hidden=draft.mode==='pomodoro';
        refs['custom-wrap'].hidden=!draft.custom;
        controls.minutes.forEach(button=>button.setAttribute('aria-pressed',String(draft.custom?button.dataset.minutes==='custom':Number(button.dataset.minutes)===draft.minutes)));
        setText(refs['mode-description'],draft.mode==='pomodoro'?(st.pomodoroFocusMinutes||25)+' 分专注 · '+(st.shortBreakMinutes||5)+' 分小憩 · 每 '+(st.roundsPerCycle||4)+' 轮长歇 '+(st.longBreakMinutes||15)+' 分':'5—120 分钟 · 完成后获得 '+(Number.isInteger(minutes)&&minutes>=5&&minutes<=120?rewardFor(minutes):'—')+' 悟玉');
        if(a){
          setText(refs['summary-eyebrow'],a.kind==='break'?'茶烟轻起':a.status==='completed'?'此番修习已成':'此番立愿');
          setText(refs['summary-title'],a.kind==='break'?(a.breakKind==='long'?'四时有序，长歇片刻':'小憩片刻，再启书卷'):a.target);
          setText(refs['summary-note'],a.kind==='break'?'放松肩颈，看看远处。休息结束后，主动开始下一段。':a.status==='paused'?pausedReason(a.pauseReason):a.status==='completed'?'每一分专注，都已留在修行录。':'一灯一卷，只做好眼前这一件事。');
          const bonus=integer(a.friendBonus??a.bonusReward??0), cofocus=online&&a.kind==='focus'&&a.status==='running'&&(snapshot.participants||[]).some(p=>p.isFriend&&['focus','focusing','running'].includes(p.status));
          const benefit=a.kind==='break'?icon('tea')+'休息不产生悟玉':a.status==='completed'?(a.settlementPending?icon('gem')+'正在核对悟玉与共修加成…':icon('gem')+'<strong>+'+number(a.earnedReward)+'</strong> 悟玉已入囊'+(bonus?' <small>含共修 +'+number(bonus)+'</small>':'')):icon('gem')+'本段基础 <strong>'+number(a.reward)+'</strong> 悟玉'+(cofocus?'<span class="fx-cofocus">'+icon('star')+'道友共修 ×1.5</span>':'');
          if(benefitKey!==benefit){benefitKey=benefit;refs['session-benefit'].innerHTML=benefit;}
        }
        renderActions();renderCycle();
        const soundIcon=st.muted?'mute':'sound';
        if(refs['sound-icon'].dataset.icon!==soundIcon){refs['sound-icon'].dataset.icon=soundIcon;refs['sound-icon'].innerHTML=icon(soundIcon);}
        setText(refs['sound-label'],st.muted?'开启环境音':'环境音已开启');
        controls.mute.setAttribute('aria-pressed',String(!st.muted));
        const soundscape=(C.SOUNDS||[]).find(sound=>sound.id===(st.soundscape||'scene'));
        setText(refs['sound-description'],soundscape?.description||'随雅室配以疏弦、翻书或轻雨。');
        refs['soundscape'].disabled=online&&snapshot.connection!=='connected';
        refs['scene-select'].disabled=online&&snapshot.connection!=='connected';
        updateScene();paintOperationControls();
      }
      // 表单操作失败或其他设备更新后，离开控件仍需恢复服务器确认的值。
      if(document.activeElement!==refs['scene-select']&&refs['scene-select'].value!==snapshot.sceneId)refs['scene-select'].value=snapshot.sceneId;
      const volume=String(Math.round((st.volume??0.3)*100));
      if(document.activeElement!==refs.volume&&refs.volume.value!==volume)refs.volume.value=volume;
      if(document.activeElement!==refs.soundscape&&refs.soundscape.value!==(st.soundscape||'scene'))refs.soundscape.value=st.soundscape||'scene';
      renderClock(a,minutes);
      updateSceneClocks();
      renderInteractionStatus();updateMedia();renderPanel();
      if(snapshot.active?.status==='completed'&&snapshot.active.id!==latestFinishedId){
        latestFinishedId=snapshot.active.id;
        if(opened){sound('complete');if(snapshot.active.kind==='break')showToast('小憩已毕，准备好了再开始下一段。');}
      }
      noticeAchievementRewards();
      const nextMeaning=JSON.stringify([snapshot.active?.id,snapshot.active?.status,snapshot.sceneId,snapshot.seatId,snapshot.jade,currentIdentity(),snapshot.equipped]);
      if(nextMeaning!==meaningfulKey){meaningfulKey=nextMeaning;options.onStateChange?.(snapshot);}
    }

    function renderClock(a,minutes) {
      const remaining=a?a.remainingMs:Math.max(0,minutes)*60000;
      const nextClockKey=[a?.id,a?.kind,a?.status,a?.minutes,a?.elapsedMs===0,clock(remaining),Math.floor((a?.elapsedMs||0)/60000)].join(':');
      if(nextClockKey===clockKey)return;clockKey=nextClockKey;
      const progress=a?clamp(a.elapsedMs/Math.max(1,a.minutes*60000),0,1):0;
      const time=clock(remaining);
      setText(refs.clock,time);refs.clock.dataset.extended=String(time.length>5);
      refs.ring.style.strokeDashoffset=String(364.425*(1-progress));
      setText(refs['clock-label'],!a?'静待入定':a.status==='paused'?'已暂停':a.status==='completed'?(a.kind==='focus'?'修习已成':'小憩已毕'):a.kind==='break'?'小憩中':'静修中');
      setText(refs['clock-sub'],!a?'一段静心时光':a.status==='completed'?(a.kind==='focus'?'专注 '+a.minutes+' 分钟':'准备好了再出发'):a.kind==='break'?'不计入专注':'已学 '+duration(a.elapsedMs));
    }

    function clothingArt(entry, large=false) {
      const color=E(entry?.color || '#7f9c81'), accent=E(entry?.accent || '#d4b77d');
      const variant=clothingVariant(entry);
      let drawing='';
      if(entry?.slot==='head'){
        drawing='<path d="M31 67q-5-24 13-31 9-5 20 1 17 8 11 30" fill="#51463d"/><path d="M29 67q23 11 47 0l-5 7H34Z" fill="#39372f"/>';
        drawing+=variant==='basic'?'<path d="m31 43 44-7" stroke="'+accent+'" stroke-width="6" stroke-linecap="round"/><circle cx="75" cy="36" r="5" fill="'+color+'"/>':variant==='bamboo'?'<path d="m31 43 5-22 15 5 15-5 6 22Z" fill="'+color+'" stroke="'+accent+'" stroke-width="2"/><path d="M43 24v18m16-18v18" stroke="'+accent+'" stroke-width="2"/>':variant==='cloud'?'<path d="M28 43q-4-12 8-13 4-16 16-6 12-10 16 6 12 1 8 13Z" fill="'+color+'" stroke="'+accent+'" stroke-width="2"/><path d="M32 46h41" stroke="'+accent+'" stroke-width="5"/>':'<path d="m27 44 7-25 10 12 8-19 9 19 11-12 7 25Z" fill="'+color+'" stroke="'+accent+'" stroke-width="2"/><circle cx="52" cy="34" r="5" fill="'+accent+'"/>';
      }else if(entry?.slot==='robe'){
        drawing='<path d="m36 24 15 6 14-6 24 28-15 11-8-11 4 31H31l4-31-8 11-15-11Z" fill="'+color+'" stroke="'+accent+'" stroke-width="2"/><path d="m37 26 14 22 14-22M51 48v35M33 63h36" stroke="'+accent+'" stroke-width="4"/>';
        if(variant==='cloud')drawing+='<path d="M32 72q5-10 11 0m16 0q6-10 11 0" fill="none" stroke="'+accent+'" stroke-width="3"/>';
        if(variant==='star')drawing+='<path d="m75 42 3 5 5 1-4 3 1 5-5-3-4 3 1-5-4-3 5-1Z" fill="'+accent+'"/><path d="M28 54 20 43m55 15 9-12" stroke="'+accent+'" stroke-width="4"/>';
      }else if(entry?.slot==='bottom'){
        drawing='<path d="M35 23h32l10 60H55l-4-32-4 32H25Z" fill="'+color+'" stroke="'+accent+'" stroke-width="2"/><path d="M35 27h32M29 76h18m8 0h18" stroke="'+accent+'" stroke-width="4"/>';
        if(variant!=='basic')drawing+='<path d="M42 35 37 70m23-35 5 35" stroke="'+accent+'" stroke-width="2" stroke-dasharray="'+(variant==='star'?'2 5':'9 3')+'"/>';
      }else{
        drawing='<path d="M53 18v19" stroke="'+accent+'" stroke-width="3"/>';
        if(variant==='basic')drawing+='<path d="m53 33 15 16-15 16-15-16Zm0 32-8 19m8-19 8 19" fill="none" stroke="'+color+'" stroke-width="6"/>';
        else if(variant==='bamboo')drawing+='<rect x="31" y="34" width="44" height="33" rx="3" fill="#f4e8c7" stroke="'+color+'" stroke-width="3"/><path d="M34 31v40m37-40v40M43 44h20m-20 9h20" stroke="'+accent+'" stroke-width="3"/>';
        else if(variant==='cloud')drawing+='<path d="m53 33 17 12-4 23-13 10-13-10-4-23Z" fill="'+color+'" stroke="'+accent+'" stroke-width="3"/><path d="M53 78v12m-6-10v9m12-9v9" stroke="'+accent+'" stroke-width="3"/>';
        else drawing+='<path d="M34 43h38l-5 33H39ZM40 35h26l6 8H34Z" fill="'+color+'" stroke="'+accent+'" stroke-width="3"/><path d="M42 44v30m11-30v30m11-30v30M53 77v13" stroke="'+accent+'" stroke-width="2"/><circle cx="53" cy="57" r="8" fill="#fff0b5"/>';
      }
      const artId=uid+'cloth-'+(++artworkSequence);
      drawing=drawing.split('fill="'+color+'"').join('fill="url(#'+artId+')"');
      return '<svg class="fx-clothing-art '+(large?'is-large':'')+'" viewBox="0 0 104 104" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="'+artId+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+accent+'"/><stop offset=".3" stop-color="'+color+'"/><stop offset="1" stop-color="'+color+'"/></linearGradient></defs><ellipse cx="52" cy="88" rx="32" ry="6" fill="#9caba5" opacity=".13"/>'+drawing+'</svg>';
    }

    function personPortrait(person) {
      const identity=person?.isSelf?(snapshot.participantId||'local:self'):(person?.participantId||person?.id||person?.nickname||'local:self');
      return global.FocusCharacters?.portraitMarkup(person?.isSelf?selfPortrait():{id:identity,avatarId:person?.avatarId,equipped:person?.equipped})||icon('people');
    }

    function itemAppearance(entry) {
      // 商品卡只替换这一件衣装，其余三槽沿用实际穿戴；与主试穿和入座共用图片缓存。
      const person={...selfPortrait(),equipped:{...snapshot.equipped,[entry.slot]:entry.id}};
      const view=entry.slot==='head'?'portrait':'full';
      const picture=global.FocusSprites?.picture?.(person,{view});
      const character=global.FocusCharacters?.getCharacter(person);
      const status=picture?'ready':global.FocusSprites?.pictureStatus?.(person,{view})||global.FocusSprites?.status?.();
      const state=status==='unavailable'?'unavailable':picture?'ready':'loading';
      const artwork=picture?'<img class="fx-item-appearance-image" src="'+E(picture.url)+'" width="'+(view==='portrait'?256:512)+'" height="'+(view==='portrait'?256:512)+'" alt="" aria-hidden="true" decoding="async" draggable="false">':clothingArt(entry);
      return '<span class="fx-item-appearance" data-slot="'+E(entry.slot)+'" data-character="'+E(character?.id||picture?.characterId||'')+'" data-view="'+view+'" data-appearance-state="'+state+'" data-appearance-key="'+E(picture?.key||'')+'" title="'+E((character?.name||'当前化身')+'试穿'+entry.name)+'">'+artwork+'</span>';
    }

    function previewAvatar(equipped) {
      if(global.FocusCharacters?.previewMarkup)return global.FocusCharacters.previewMarkup(selfPortrait(),equipped,C);
      const robe=item(equipped?.robe), bottom=item(equipped?.bottom), head=item(equipped?.head), accessory=item(equipped?.accessory);
      const rc=E(robe?.color || '#708c76'),bc=E(bottom?.color || '#57695b'),hc=E(head?.color || '#8a7352'),ac=E(accessory?.color || '#b99a60'),trim=E(robe?.accent||'#d5bb83');
      const crown=clothingVariant(head)==='star'?'<path d="m65 48 2-25 12 10 11-22 9 22 12-10 2 25Z" fill="'+hc+'" stroke="'+E(head.accent)+'" stroke-width="2"/>':clothingVariant(head)==='cloud'?'<path d="M65 48q-5-16 8-19 7-11 17-4 11-7 18 4 12 3 7 19Z" fill="'+hc+'" stroke="'+E(head.accent)+'" stroke-width="2"/>':clothingVariant(head)==='bamboo'?'<path d="m69 46 2-25 18 6 18-6 2 25Z" fill="'+hc+'" stroke="'+E(head.accent)+'" stroke-width="2"/>':'<path d="m65 41 49-8" stroke="#b59a6b" stroke-width="5" stroke-linecap="round"/>';
      const adorn=clothingVariant(accessory)==='star'?'<path d="M116 135h22l-3 27h-16Z" fill="'+ac+'" stroke="#d8bd7a" stroke-width="2"/><path d="M120 135q6-15 14 0m-7 28v11" fill="none" stroke="#d8bd7a" stroke-width="2"/><circle cx="127" cy="147" r="5" fill="#fff0b0"/>':clothingVariant(accessory)==='bamboo'?'<rect x="111" y="137" width="22" height="17" rx="2" fill="#eddfb7" stroke="'+ac+'" stroke-width="3"/>':'<path d="m121 136 10 11-10 11-10-11Z" fill="'+ac+'" stroke="#d7c390" stroke-width="2"/><path d="M121 158v14" stroke="#d7c390" stroke-width="3"/>';
      return '<svg class="fx-avatar-preview" viewBox="0 0 180 200" role="img" aria-label="当前衣装试穿预览"><ellipse cx="90" cy="181" rx="49" ry="10" fill="#536b54" opacity=".14"/><path d="M62 145h56l8 29H91l-2-18-4 18H55Z" fill="'+bc+'"/><path d="m65 94 25 10 24-10 29 50-20 12-14-25 8 35H64l7-35-14 25-20-12Z" fill="'+rc+'" stroke="'+trim+'" stroke-width="2"/><path d="m68 98 22 31 22-31M64 144h53M90 130v36" stroke="'+trim+'" stroke-width="4" fill="none"/><circle cx="48" cy="149" r="9" fill="#e9c7a1"/><circle cx="133" cy="149" r="9" fill="#e9c7a1"/><ellipse cx="90" cy="66" rx="35" ry="40" fill="#403e36"/><ellipse cx="90" cy="73" rx="29" ry="30" fill="#edcfae"/><path d="M61 66q-2-34 31-34 32 1 29 33-13-12-19-27-14 27-41 28" fill="#484238"/><path d="M75 76q4-4 8 0m15 0q4-4 8 0" stroke="#5e4e3e" stroke-width="2.7" stroke-linecap="round" fill="none"/><path d="M85 87q5 4 10 0" stroke="#af7566" stroke-width="2" stroke-linecap="round" fill="none"/><ellipse cx="72" cy="84" rx="6" ry="3" fill="#d7937d" opacity=".35"/><ellipse cx="108" cy="84" rx="6" ry="3" fill="#d7937d" opacity=".35"/>'+crown+adorn+'</svg>';
    }

    function syncAvatarPreview() {
      if(destroyed||!opened||!['shop','wardrobe'].includes(panelName))return;
      const target=refs['panel-content'].querySelector('[data-fx-model-preview]');
      if(!target||!global.FocusModelPreview?.create)return;
      // 试穿与入座共用服饰合成，临时搭配仅传给预览，不写入账号。
      if(!avatarPreview)avatarPreview=global.FocusModelPreview.create();
      if(!avatarPreview)return;
      const selected=previewItem?item(previewItem):null,equipped={...snapshot.equipped};
      if(selected)equipped[selected.slot]=selected.id;
      const character=global.FocusCharacters?.getCharacter(selfPortrait());
      avatarPreview.mount(target);
      avatarPreview.update({characterId:character?.id||'jade',equipped,catalog:C});
      avatarPreview.setActive(!document.hidden);
    }

    function wardrobeMarkup() {
      const shopping=panelName==='shop';
      const owned=new Set(snapshot.owned || []),selected=previewItem?item(previewItem):null;
      const preview={...snapshot.equipped};if(selected)preview[selected.slot]=selected.id;
      const entries=C.ITEMS.filter(entry=>entry.slot===panelSlot&&(shopping||owned.has(entry.id)));
      return '<div class="fx-dressing"><aside class="fx-dressing-preview"><div class="fx-preview-niche"><div class="fx-model-preview" data-fx-model-preview><div class="fx-model-fallback">'+previewAvatar(preview)+'</div></div></div><strong>'+E(selected?.name || snapshot.nickname || '云间道友')+'</strong><p>'+(selected?'正在试配 · 尚未改变当前穿戴':'化身如画，衣冠随心')+'</p><span class="fx-preview-balance">'+icon('gem')+number(snapshot.jade)+' 悟玉</span>'+(selected?actionButton('clear-preview','回到当前穿戴','','quiet'):'')+'</aside><div class="fx-dressing-catalog"><div class="fx-slot-tabs" role="group" aria-label="衣装类别">'+C.SLOTS.map(slot=>'<button type="button" data-fx-action="slot" data-slot="'+E(slot.id)+'" aria-pressed="'+(slot.id===panelSlot)+'">'+E(slot.name)+'</button>').join('')+'</div><div class="fx-item-grid">'+entries.map(entry=>{
        const has=owned.has(entry.id),wearing=snapshot.equipped?.[entry.slot]===entry.id,afford=snapshot.jade>=entry.price,limited=!!entry.achievementId;
        const entryAction=has?'equip':limited?'view-achievement':'buy',entryLabel=wearing?'已穿戴':has?'穿戴':limited?'成就解锁':afford?'置办':'差 '+number(entry.price-snapshot.jade);
        return '<article class="fx-item '+(wearing?'is-equipped':'')+' '+(limited?'is-limited':'')+' '+(previewItem===entry.id?'is-previewing':'')+'"><button type="button" class="fx-item-preview" data-fx-action="preview" data-item="'+E(entry.id)+'" aria-label="试穿'+E(entry.name)+'">'+itemAppearance(entry)+'<span class="fx-item-status">'+(wearing?'已穿戴':has?'已拥有':limited?'修行限定 · 可试穿':'点击试穿')+'</span></button><h3>'+E(entry.name)+'</h3><p>'+E(entry.description || '为修行添一抹新意')+'</p><div class="fx-item-bottom"><span class="fx-item-price">'+(has?'永久拥有':limited?icon('trophy')+'修行限定':icon('gem')+number(entry.price))+'</span>'+actionButton(entryAction,entryLabel,'data-item="'+E(entry.id)+'" data-achievement="'+E(entry.achievementId||'')+'"'+(wearing||!has&&!limited&&!afford?' disabled':''),has||limited?'secondary':'primary')+'</div></article>';
      }).join('')+'</div>'+(shopping?'<p class="fx-panel-footnote">完整完成 25 分钟静修可得 10 悟玉。衣装永久拥有，随时免费换穿。</p>':'<p class="fx-panel-footnote">已拥有 '+owned.size+' 件衣装。更多心仪衣装，可在衣装坊试穿置办。</p>')+'</div></div>';
    }

    function roomsMarkup() {
      const room=snapshot.room, people=snapshot.participants||[], connected=snapshot.connection==='connected';
      const tabNames=[['public','同修雅室'],['invite','凭帖相邀'],['friends','我的道友']];
      const tabs='<nav class="fx-room-tabs" aria-label="同修功能">'+tabNames.map(([id,label])=>'<button type="button" data-fx-action="room-tab" data-tab="'+id+'" aria-pressed="'+(roomTab===id)+'">'+label+'</button>').join('')+'</nav>';
      const connection=(connected?'':'<div class="fx-room-alert"><p>'+E(snapshot.connectionError||'连接尚未恢复，静修已暂停。')+'</p>'+actionButton('reconnect',icon('refresh')+'重新连接',snapshot.connection==='connecting'?'disabled':'')+'</div>')+(snapshot.localRecoveryAvailable?'<div class="fx-legacy-note"><p>现在开始云端修习，悟玉与衣装按云端账本记录。此前的本机进度完整保留，可回顾、导出并继续用于离线版。</p>'+actionButton('legacy-history','查看本机旧录','','quiet')+'</div>':'');
      if(roomTab==='friends')return tabs+connection+friendsMarkup();
      if(roomTab==='invite')return tabs+connection+ownedRoomsMarkup()+
        '<div class="fx-invite-layout"><section class="fx-room-form"><span class="fx-eyebrow">一纸邀帖，共读一卷</span><h3>凭邀请码入室</h3><p>向同学索取雅室邀请码，输入后便可相见。</p><label for="'+uid+'invite">雅室邀请码</label><div class="fx-inline-field"><input id="'+uid+'invite" data-fx-room-field="inviteCode" value="'+E(roomDraft.inviteCode)+'" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="输入邀请码">'+actionButton('join-invite','入室',connected?'':'disabled','primary')+'</div></section>'+
        '<section class="fx-room-form"><span class="fx-eyebrow">择一处清静，候三两同窗</span><h3>开一间雅室</h3><label for="'+uid+'room-name">雅室名</label><input id="'+uid+'room-name" data-fx-room-field="name" maxlength="24" value="'+E(roomDraft.name)+'" placeholder="例如：青竹读书会" autocomplete="off"><label for="'+uid+'subject">修习科目</label><input id="'+uid+'subject" data-fx-room-field="subject" maxlength="24" value="'+E(roomDraft.subject)+'" placeholder="例如：政治经济学" autocomplete="off"><div class="fx-room-form-row"><label for="'+uid+'room-scene">场景<span class="fx-select"><select id="'+uid+'room-scene" data-fx-room-field="sceneId">'+C.SCENES.map(s=>'<option value="'+E(s.id)+'" '+(roomDraft.sceneId===s.id?'selected':'')+'>'+E(s.name)+'</option>').join('')+'</select></span></label><label for="'+uid+'privacy">入室方式<span class="fx-select"><select id="'+uid+'privacy" data-fx-room-field="visibility"><option value="private" '+(roomDraft.visibility==='private'?'selected':'')+'>凭邀请码</option><option value="public" '+(roomDraft.visibility==='public'?'selected':'')+'>公开雅室</option></select></span></label></div><p class="fx-room-form-note">每室至多 8 人。开室或换室会先暂停当前专注。</p>'+actionButton('create-room',icon('leaf')+'开室入座',connected?'':'disabled','primary')+'</section></div>';
      const current=room?'<section class="fx-current-room"><div class="fx-current-room-title"><div><span class="fx-eyebrow">此刻所在</span><h3>'+E(room.title)+'</h3><p>'+E(room.subject)+' · '+(room.privacy==='private'?'凭帖入室':'公开雅室')+' · '+integer(room.onlineCount)+' / 8 人</p></div>'+actionButton('leave-room','离开雅室','','quiet')+'</div>'+
        (room.inviteCode?'<div class="fx-invite-code"><span>雅室邀请码</span><strong>'+E(room.inviteCode)+'</strong>'+actionButton('copy-invite','复制邀请码')+(room.isOwner?actionButton('rotate-invite','更换邀请码','','quiet'):'')+'</div>':'')+
        '<div class="fx-room-people">'+people.map(p=>'<article><span class="fx-person-seal '+(p.isFriend?'is-friend':'')+'">'+personPortrait(p)+'</span><div><strong>'+E(p.nickname)+(p.isSelf?' <small>我</small>':'')+'</strong><p>'+E(p.target||'择卷待修')+'</p><small>'+participantStatus(p.status)+(Number.isInteger(p.seatId)?' · 第 '+(p.seatId+1)+' 席':' · 尚未入席')+'</small></div>'+(!p.isSelf&&!p.isFriend&&!hasFriendRequest(p.id)?actionButton('friend-person','结为道友','data-person="'+E(p.id)+'"','quiet'):p.isFriend?'<span class="fx-friend-label">'+icon('star')+'道友</span>':'')+'</article>').join('')+'</div></section>':'';
      const rooms=(snapshot.rooms||[]).filter(r=>r.privacy!=='private');
      const list=rooms.length?'<div class="fx-room-grid">'+rooms.map(r=>{const isCurrent=r.id===room?.id,full=integer(r.onlineCount)>=8, sceneName=C.SCENES.find(s=>s.id===r.sceneId)?.name||'藏经阁';return '<article class="fx-room-card '+(isCurrent?'is-current':'')+'"><div class="fx-room-card-art" data-scene="'+E(r.sceneId)+'">'+icon(r.sceneId==='rain'?'tea':'book')+'<span>'+E(sceneName)+'</span></div><div class="fx-room-card-body"><div><h3>'+E(r.title)+'</h3><p>'+E(r.subject)+'</p></div><div class="fx-room-card-bottom"><span><i aria-hidden="true"></i>'+integer(r.onlineCount)+' / 8 人</span>'+actionButton('join-room',isCurrent?'已在此间':full?'暂时满席':'进入雅室','data-room="'+E(r.id)+'"'+(isCurrent||full||!connected?' disabled':''),isCurrent?'secondary':'primary')+'</div></div></article>';}).join('')+'</div>':'<div class="fx-empty">'+icon('people')+'<h3>雅室正在展开</h3><p>稍候刷新，或开一间自己的雅室。</p></div>';
      return tabs+connection+current+'<div class="fx-room-section-title"><div><h3>择室同修</h3><p>各自专注，也能彼此陪伴。</p></div>'+actionButton('refresh-rooms',icon('refresh')+'刷新',connected?'':'disabled','quiet')+'</div>'+list+'<div class="fx-rule-note">'+icon('star')+'<p><strong>与道友同室专注，重叠时段悟玉 ×1.5。</strong>需双方确认道友关系；暂停或离线不产生加成，多位道友不叠加。完整完成本段后统一结算。</p></div>';
    }

    function participantStatus(status) {
      return ['focus','focusing','running'].includes(status)?'静修中':['rest','resting','break'].includes(status)?'小憩中':status==='paused'?'已暂停':status==='completed'?'此番修习已成':['ended','cancelled'].includes(status)?'已结束':'待入定';
    }

    function ownedRoomsMarkup() {
      const mine=(snapshot.rooms||[]).filter(r=>r.isOwner&&r.privacy==='private');
      if(!mine.length)return '';
      return '<section class="fx-owned-rooms"><h3>我开的私密雅室</h3><p>雅室与邀请码随账号保存，离开后仍可从这里返回。</p>'+mine.map(r=>'<article><div><strong>'+E(r.title)+'</strong><small>'+E(r.subject)+' · '+integer(r.onlineCount)+' / 8 人</small></div>'+actionButton('join-room',snapshot.room?.id===r.id?'已在此间':'返回雅室','data-room="'+E(r.id)+'"'+(snapshot.room?.id===r.id||snapshot.connection!=='connected'?' disabled':''),'secondary')+'</article>').join('')+'</section>';
    }

    function hasFriendRequest(personId) {
      return (snapshot.friendRequests||[]).some(r=>(r.participantId||r.id)===personId);
    }

    function friendsMarkup() {
      const friends=snapshot.friends||[], requests=snapshot.friendRequests||[];
      const requestRows=requests.map(p=>{const incoming=p.direction==='incoming',id=p.friendshipId||p.id;return '<article class="fx-friend-row"><span class="fx-person-seal">'+personPortrait(p)+'</span><div><strong>'+E(p.nickname)+'</strong><small>'+(incoming?'邀你结为道友':'等待对方回应')+'</small></div><div class="fx-friend-actions">'+(incoming?actionButton('friend-accept','应邀','data-friend="'+E(id)+'"','primary')+actionButton('friend-decline','婉拒','data-friend="'+E(id)+'"','quiet'):actionButton('friend-remove','撤回','data-friend="'+E(id)+'"','quiet'))+'</div></article>';}).join('');
      return '<div class="fx-friend-intro"><div><span class="fx-eyebrow">道不孤，必有邻</span><h3>邀一位道友，一起坚持</h3><p>交换道友码，双方确认后，即可获得同室专注加成。</p></div><div class="fx-my-friend-code"><span>我的道友码</span><strong>'+E(snapshot.friendCode||'正在读取')+'</strong>'+actionButton('copy-friend-code','复制道友码',snapshot.friendCode?'':'disabled','quiet')+'</div></div>'+
        '<section class="fx-room-form fx-add-friend"><label for="'+uid+'friend-code">添加道友</label><div class="fx-inline-field"><input id="'+uid+'friend-code" data-fx-room-field="friendCode" value="'+E(roomDraft.friendCode)+'" maxlength="32" placeholder="输入对方的道友码" autocomplete="off" autocapitalize="characters" spellcheck="false">'+actionButton('friend-request','递出邀帖',snapshot.connection==='connected'?'':'disabled','primary')+'</div></section>'+
        (requestRows?'<section class="fx-friend-list"><h3>往来邀帖</h3>'+requestRows+'</section>':'')+
        '<section class="fx-friend-list"><h3>已结识的道友 <small>'+friends.length+'</small></h3>'+(friends.length?friends.map(p=>'<article class="fx-friend-row"><span class="fx-person-seal is-friend">'+personPortrait(p)+'</span><div><strong>'+E(p.nickname)+'</strong><small>'+(p.online?'正在静修雅室':'暂未在线')+'</small></div>'+actionButton('friend-remove','解除道友','data-friend="'+E(p.friendshipId||p.id)+'"','quiet')+'</article>').join(''):'<div class="fx-empty fx-empty-small">'+icon('star')+'<p>在雅室里结识同窗，也可凭道友码相邀。</p></div>')+'</section>';
    }

    function progressSourceContext() {
      return online&&historySource!=='legacy'?'cloud:'+String(snapshot.room?.id||'')+':'+String(snapshot.connection||''):'local:'+historySource;
    }

    // 记录按需读取，快速翻页合并请求；请求序号同时隔离换月、换来源与退出后的迟到响应。
    function loadProgress({delay=0,refresh=false}={}) {
      if(panelName!=='history'||!opened||destroyed)return;
      // 暂停尚在确认时仍可翻页，但等确认后才读取最终日账。
      if(panelPausePending){progressStatus='loading';progressError='';progressVersion++;renderPanel();return;}
      if(online&&historySource!=='legacy'&&snapshot.connection!=='connected'){
        progressContext=progressSourceContext();progressStatus=snapshot.connection==='connecting'?'connecting':'disconnected';
        progressError='';progressVersion++;renderPanel();return;
      }
      clearTimeout(progressTimer);progressTimer=null;
      const request=++progressRequest,context=progressSourceContext(),query={month:progressMonth,day:progressDay};
      const cacheKey=context+':'+query.month+':'+query.day,cached=progressCache.get(cacheKey);
      if(progressContext!==context||progressData?.month!==query.month)progressData=null;
      progressContext=context;progressStatus='loading';progressError='';progressVersion++;renderPanel();
      const stillCurrent=()=>!destroyed&&opened&&panelName==='history'&&request===progressRequest&&context===progressSourceContext();
      const accept=(value,readAt)=>{
        if(!stillCurrent())return;
        progressData=value;progressReadAt=readAt;progressStatus='ready';progressError='';progressVersion++;
        snapshot=engine.getSnapshot();renderPanel();
        if(achievementFocus&&progressTab==='achievements'){
          const target=Array.from(refs['panel-content'].querySelectorAll('[data-fx-achievement]')).find(node=>node.dataset.fxAchievement===achievementFocus);
          target?.scrollIntoView({block:'nearest',behavior:'auto'});
        }
      };
      if(!refresh&&cached&&Date.now()-cached.at<30000){accept(cached.data,cached.at);return;}
      const run=async()=>{
        progressTimer=null;if(!stillCurrent())return;
        try{
          let result;
          if(online&&historySource==='legacy'){
            const legacy=engine.exportLegacyData?.();
            if(!legacy||!global.SpiritFocusCore?.progress)throw new Error('本机旧录暂时无法读取，请重试。');
            result={ok:true,progress:global.SpiritFocusCore.progress(legacy,Date.now(),query)};
          }else result=await engine.getProgress(query);
          if(!stillCurrent())return;
          if(superseded(result)){progressStatus=progressData?'ready':'interrupted';progressError='';progressVersion++;renderPanel();return;}
          if(!result?.ok||!result.progress||!Array.isArray(result.progress.days))throw new Error(result?.message||'修行记录暂未取回，请稍后再试。');
          const readAt=Date.now();progressCache.set(cacheKey,{at:readAt,data:result.progress});
          if(progressCache.size>40)progressCache.delete(progressCache.keys().next().value);
          accept(result.progress,readAt);
        }catch(error){
          if(!stillCurrent())return;
          progressStatus='error';progressError=error?.message||'修行记录暂未取回，请稍后再试。';progressVersion++;renderPanel();
        }
      };
      if(delay)progressTimer=setTimeout(run,delay);else void run();
    }

    function progressStateMarkup() {
      if(progressStatus==='connecting')return '<div class="fx-progress-state" role="status"><span class="fx-progress-loading" aria-hidden="true"></span><h3>正在连接修行录</h3><p>连通后会自动展开，你也可以先返回其他页面。</p></div>';
      if(progressStatus==='disconnected')return '<div class="fx-progress-state" role="status">'+icon('book')+'<h3>修行录等待连接</h3><p>'+E(connectionMessage())+'</p>'+actionButton('reconnect',icon('refresh')+'重新连接')+'</div>';
      if(progressStatus==='interrupted')return '<div class="fx-progress-state" role="status">'+icon('book')+'<h3>修行录稍候再续</h3><p>刚才的读取已让位给新的操作，点按即可继续读取。</p>'+actionButton('progress-retry',icon('refresh')+'继续读取')+'</div>';
      return progressStatus==='error'?'<div class="fx-progress-state is-error" role="status">'+icon('book')+'<h3>卷页暂未取回</h3><p>'+E(progressError)+'</p>'+actionButton('progress-retry',icon('refresh')+'重新读取')+'</div>':'<div class="fx-progress-state" role="status" aria-live="polite"><span class="fx-progress-loading" aria-hidden="true"></span><h3>正在展开修行录</h3><p>专注已暂停，安心翻阅。</p></div>';
    }

    function progressSummaryMarkup(data) {
      const summary=data?.summary||{};
      return '<div class="fx-record-stats fx-progress-stats"><div><span>累计有效静修</span><strong>'+E(duration(summary.totalFocusMs))+'</strong></div><div><span>当前连续打卡</span><strong>'+number(summary.currentStreak)+'<small> 天</small></strong></div><div><span>最长连续打卡</span><strong>'+number(summary.bestStreak)+'<small> 天</small></strong></div></div>';
    }

    function dateNavigationMarkup(kind) {
      const calendar=kind==='month',label=calendar?monthLabel(progressMonth):dayLabel(progressDay),base=calendar?'progress-month':'progress-day';
      return '<div class="fx-calendar-navigation"><div class="fx-calendar-switch"><button type="button" class="fx-icon-button" data-fx-action="'+base+'-prev" aria-label="'+(calendar?'上个月':'前一天')+'">'+icon('chevronLeft')+'</button><h3>'+E(label)+'</h3><button type="button" class="fx-icon-button" data-fx-action="'+base+'-next" aria-label="'+(calendar?'下个月':'后一天')+'">'+icon('chevronRight')+'</button></div>'+actionButton('progress-today','今天','','quiet')+'</div>';
    }

    function calendarMarkup(data) {
      let markup=dateNavigationMarkup('month');
      if(!data||progressStatus==='error')return markup+progressStateMarkup();
      const days=Array.isArray(data.days)?data.days:[],summary=data.summary||{};
      const first=new Date(progressMonth+'-01T00:00:00Z'),offset=(first.getUTCDay()+6)%7;
      const high=Math.max(data.checkInMs||1500000,...days.map(entry=>Number(entry.focusMs)||0));
      const cells=Array.from({length:offset},()=>'<span class="fx-calendar-blank" aria-hidden="true"></span>');
      days.forEach(entry=>{
        const selected=entry.day===progressDay,fill=clamp((Number(entry.focusMs)||0)/high*100,entry.focusMs>0?8:0,100);
        const label=entry.day+'，'+(entry.isToday?'今天，':'')+(entry.inFuture?'尚未到来':'有效静修 '+duration(entry.focusMs,true)+(entry.qualified?'，已打卡':'，未满 25 分钟'));
        cells.push('<button type="button" class="fx-calendar-day '+(entry.qualified?'is-qualified ':'')+(entry.isToday?'is-today ':'')+(entry.inFuture?'is-future ':'')+'" data-fx-action="progress-select-day" data-day="'+E(entry.day)+'" aria-pressed="'+selected+'" aria-label="'+E(label)+'" style="--fx-day-fill:'+fill+'%"><span class="fx-calendar-number">'+Number(String(entry.day).slice(-2))+'</span>'+(entry.qualified?'<span class="fx-calendar-check" aria-hidden="true">'+icon('check')+'</span>':'')+'<span class="fx-calendar-bar" aria-hidden="true"><i></i></span><small>'+E(shortDuration(entry.focusMs))+'</small></button>');
      });
      while(cells.length%7)cells.push('<span class="fx-calendar-blank" aria-hidden="true"></span>');
      const qualified=!!summary.todayQualified,remaining=Math.max(0,(data.checkInMs||1500000)-Number(summary.todayFocusMs||0));
      markup+='<div class="fx-calendar-summary"><div><span>本月静修</span><strong>'+E(duration(data.monthFocusMs))+'</strong></div><div><span>本月打卡</span><strong>'+number(data.monthQualifiedDays)+'<small> 天</small></strong></div><div class="fx-streak-badge">'+icon('leaf')+'<span>连续 <strong>'+number(summary.currentStreak)+'</strong> 天</span></div></div>'+
        '<div class="fx-calendar-weekdays" aria-hidden="true">'+['一','二','三','四','五','六','日'].map(label=>'<span>'+label+'</span>').join('')+'</div><div class="fx-calendar-grid" role="group" aria-label="'+E(monthLabel(progressMonth))+'的每日静修">'+cells.join('')+'</div>'+
        '<div class="fx-calendar-legend"><span><i></i>有效静修时长</span><span>'+icon('check')+'满 25 分钟，点亮打卡</span></div>'+
        '<p class="fx-checkin-note '+(qualified?'is-qualified':'')+'">'+icon(qualified?'check':'leaf')+(qualified?'今日已点亮，点滴积累皆有回响。':'今日再静修 '+E(duration(remaining,true))+'，即可点亮打卡。')+'</p>';
      markup+='<section class="fx-calendar-detail" aria-label="所选日期的修习记录"><header><div><span class="fx-eyebrow">这一日的修行</span><h3>'+E(dayLabel(progressDay))+'</h3></div>'+actionButton('progress-tab','查看明细','data-tab="records"','quiet')+'</header>'+(progressStatus==='loading'||data.day!==progressDay?'<p class="fx-inline-loading" role="status">正在读取这一天的记录…</p>':dayRecordsMarkup(data,true))+'</section>';
      return markup;
    }

    function recordReview(record) {
      // 旧接口也使用本次读取时刻，不让翻页、切换页签或秒表回调改变未结束段的总历时。
      const value=record.review||global.SpiritFocusCore?.sessionReview?.(record,progressReadAt)||{focusMs:record.elapsedMs,availability:'missing-time'};
      const focusMs=reviewValue(value.focusMs),totalMs=reviewValue(value.totalMs),interruptionMs=reviewValue(value.interruptionMs);
      const available=value.availability==='available'&&focusMs!==null&&totalMs!==null&&interruptionMs!==null&&focusMs<=totalMs&&Math.abs(totalMs-focusMs-interruptionMs)<1;
      return {focusMs,totalMs:available?totalMs:null,interruptionMs:available?interruptionMs:null,
        focusPercent:available&&totalMs>0?focusMs/totalMs*100:null,available,
        availability:available?'available':value.availability==='clock-inconsistent'?'clock-inconsistent':focusMs===null?'invalid-focus':'missing-time',
        ongoing:value.ongoing===true,asOfAt:reviewValue(value.asOfAt)};
    }

    function reviewShare(review) {
      return review.focusPercent===null?'无法计算':review.focusPercent.toLocaleString('zh-CN',{maximumFractionDigits:1})+'%';
    }

    function reviewMissingNote(review) {
      if(review.available)return review.totalMs===0?'尚无经过的时间，有效占比暂不计算。':'';
      return review.availability==='clock-inconsistent'?'起止时间与有效时长不一致，暂时无法计算总历时与暂停时长。':
        review.availability==='invalid-focus'?'实际进修时长未完整留存，暂时无法绘制组成。':'起止时间未完整留存，无法计算总历时与暂停时长。';
    }

    function reviewBarMarkup(record,review,scale,compact=false) {
      const target=record.target||'静心修习',label=target+'，整段进修。'+(review.available?
        '总历时 '+reviewDuration(review.totalMs)+'，实际进修 '+reviewDuration(review.focusMs)+'，暂停或未计入 '+reviewDuration(review.interruptionMs)+'，有效占比 '+reviewShare(review):
        '实际进修 '+reviewDuration(review.focusMs)+'。'+reviewMissingNote(review))+(review.ongoing?'。未完成，截至本次读取 '+reviewDate(review.asOfAt):'');
      const denominator=compact?review.totalMs:scale;
      const width=value=>denominator>0?(value/denominator*100).toFixed(4):'0';
      return '<div class="fx-review-bar '+(!review.available?'is-unknown ':review.totalMs===0?'is-zero ':'')+(compact?'is-compact':'')+'" role="img" aria-label="'+E(label)+'"'+(compact?'':' tabindex="0"')+'>'+
        (review.available?'<span class="fx-review-focus" aria-hidden="true" style="width:'+width(review.focusMs)+'%"></span><span class="fx-review-interruption" aria-hidden="true" style="width:'+width(review.interruptionMs)+'%"></span>':'<span class="fx-review-unknown" aria-hidden="true"></span>')+'</div>';
    }

    function recordRowMarkup(record,compact=false,scale=0,index=0) {
      const review=recordReview(record),finished=!!record.completed,status=finished?'已完成':review.ongoing?(record.status==='paused'?'已暂停 · 未完成':'进修中 · 未完成'):'未完成';
      const dayFocus=record.dayFocusKnown===false||reviewValue(record.dayFocusMs)===null?'当日归属未留存':'当日有效 '+reviewDuration(record.dayFocusMs);
      const title=record.target||'静心修习',mode=record.mode==='pomodoro'?'番茄静修':'自由静修',missing=reviewMissingNote(review);
      if(compact)return '<article class="fx-history-row fx-review-compact"><div><h3>'+E(title)+'</h3><p>'+status+' · '+mode+'</p><small>'+E(dayFocus)+' · 整段实际 '+E(reviewDuration(review.focusMs))+'</small>'+reviewBarMarkup(record,review,review.totalMs,true)+'<small class="fx-review-compact-summary">'+(review.available?'整段总历时 '+E(reviewDuration(review.totalMs))+' · 暂停/未计入 '+E(reviewDuration(review.interruptionMs)):E(missing))+'</small>'+(review.ongoing?'<small>截至本次读取 '+E(reviewDate(review.asOfAt))+'</small>':'')+'</div></article>';
      const time=review.available?'<span><b>开始</b>'+E(reviewDate(record.startedAt))+'</span><span><b>'+(review.ongoing?'截至本次读取':'结束')+'</b>'+E(reviewDate(review.asOfAt))+'</span>':
        '<span>起止时间'+(review.availability==='clock-inconsistent'?'待核对':'未完整留存')+'</span>'+(review.ongoing?'<span><b>截至本次读取</b>'+E(reviewDate(review.asOfAt))+'</span>':'');
      const metric=(label,value,kind='')=>'<div'+(kind?' class="'+kind+'"':'')+'><dt>'+label+'</dt><dd>'+E(value)+'</dd></div>';
      return '<article class="fx-history-row fx-review-record"><header class="fx-review-record-heading"><span class="fx-history-symbol '+(finished?'is-complete':'')+'" aria-hidden="true">'+icon(finished?'check':'book')+'</span><div><span class="fx-review-sequence">第 '+number(index+1)+' 段 · 整段进修</span><h3>'+E(title)+'</h3><p>'+mode+'</p></div><span class="fx-review-state '+(review.ongoing?'is-ongoing':'')+'">'+status+'</span></header>'+
        '<div class="fx-review-time">'+time+'</div>'+reviewBarMarkup(record,review,scale)+
        '<dl class="fx-review-metrics">'+metric('总历时',review.available?reviewDuration(review.totalMs):'无法计算')+metric('实际进修',reviewDuration(review.focusMs),'is-focus')+metric('暂停 / 未计入',review.available?reviewDuration(review.interruptionMs):'无法计算','is-interruption')+metric('有效占比',reviewShare(review))+'</dl>'+
        (missing?'<p class="fx-review-missing">'+icon('info')+'<span>'+E(missing)+'</span></p>':'')+
        '<footer class="fx-review-record-footer"><span>'+E(dayFocus)+'</span><span>'+(finished?'+'+number(record.reward)+' 悟玉':'有效时长已保留')+'</span></footer></article>';
    }

    function sessionReviewMarkup(page) {
      const reviews=page.map(recordReview),scale=Math.max(0,...reviews.map(review=>review.totalMs||0));
      const axis=scale>0?'<div class="fx-review-axis" aria-hidden="true"><span>0 秒</span><span>'+E(reviewDuration(scale))+'</span></div>':'';
      return '<section class="fx-review-chart" aria-labelledby="'+uid+'review-title"><header class="fx-review-heading"><div><span class="fx-eyebrow">看见每一次投入</span><h3 id="'+uid+'review-title">进修时长复盘</h3></div>'+actionButton('progress-retry',icon('refresh')+'刷新记录','aria-label="重新读取进修复盘记录"','quiet')+'</header>'+
        '<p class="fx-review-intro">每条展示整段进修的时间组成，本页使用统一刻度。跨日记录的整段时长不计作当天累计。</p>'+
        '<div class="fx-review-legend" aria-label="图例"><span><i class="is-focus" aria-hidden="true"></i>实际进修</span><span><i class="is-interruption" aria-hidden="true"></i>暂停 / 未计入</span></div>'+
        '<p class="fx-review-explanation">暂停 / 未计入包括切出、手动暂停及断网未确认时间；有效占比不等同于注意力评分。</p>'+
        (reviews.some(review=>review.ongoing)?'<p class="fx-review-asof">'+icon('clock')+'<span>未结束的进修按“截至本次读取”显示。点按刷新，更新总历时与暂停时长。</span></p>':'')+
        axis+'<div class="fx-history-list fx-review-list">'+page.map((record,index)=>recordRowMarkup(record,false,scale,historyPage*12+index)).join('')+'</div></section>';
    }

    function dayRecordsMarkup(data,compact=false) {
      const list=Array.isArray(data.records)?data.records:[],day=(data.days||[]).find(entry=>entry.day===progressDay);
      const pageSize=12,maxPage=Math.max(0,Math.ceil(list.length/pageSize)-1);historyPage=Math.min(historyPage,maxPage);
      const page=compact?list.slice(0,3):list.slice(historyPage*pageSize,(historyPage+1)*pageSize);
      let markup='<div class="fx-day-totals"><strong>'+E(duration(day?.focusMs))+'</strong><span>有效静修</span>'+(day?.qualified?'<span class="fx-day-qualified">'+icon('check')+'已打卡</span>':'')+'</div>';
      if(data.recordsComplete===false||Number(data.unattributedFocusMs)>0)markup+='<p class="fx-record-note fx-archive-note">'+icon('info')+'<span>早期或较久的记录仅保留每日总量，以下明细未覆盖全部时长。'+(data.unattributedFocusMs>0?'另有 '+E(duration(data.unattributedFocusMs,true))+' 未关联到具体专注段。':'')+'</span></p>';
      markup+=page.length?(compact?'<div class="fx-history-list">'+page.map(record=>recordRowMarkup(record,true)).join('')+'</div>':sessionReviewMarkup(page)):'<div class="fx-empty fx-empty-small">'+icon('book')+'<h3>'+(day?.inFuture?'这一页，留待未来落笔':day?.focusMs?'当天时长已留存':'这一日尚无静修记录')+'</h3><p>'+(day?.inFuture?'等到这一天，静心读过的每一分钟都会留下痕迹。':day?.focusMs?'较早的学习记录可能只保留了每日累计时长，暂时无法绘制每次进修图表。':'入席立愿，开始一段静修。实际进修与暂停时间会在这里留下记录。')+'</p></div>';
      if(compact&&list.length>3)markup+='<p class="fx-more-records">另有 '+number(list.length-3)+' 段记录，可在“查看明细”中翻阅。</p>';
      if(!compact&&maxPage)markup+='<div class="fx-history-pagination">'+actionButton('history-prev','上一页',historyPage?'':'disabled')+'<span>'+(historyPage+1)+' / '+(maxPage+1)+'</span>'+actionButton('history-next','下一页',historyPage<maxPage?'':'disabled')+'</div>';
      return markup;
    }

    function recordsMarkup(data) {
      return dateNavigationMarkup('day')+(progressStatus!=='ready'||!data||data.day!==progressDay?progressStateMarkup():progressSummaryMarkup(data)+'<div class="fx-record-section-heading"><h3>'+E(progressDay)+' · 修习明细</h3>'+actionButton('progress-tab',icon('calendar')+'选日期','data-tab="calendar"','quiet')+'</div>'+dayRecordsMarkup(data));
    }

    function achievementsMarkup(data) {
      if(progressStatus!=='ready'||!data)return progressStateMarkup();
      const legacy=online&&historySource==='legacy',owned=new Set(snapshot.owned||[]),achievements=Array.isArray(data.achievements)?data.achievements:[];
      let markup='<div class="fx-achievement-intro"><span class="fx-achievement-seal">'+icon('trophy')+'</span><div><span class="fx-eyebrow">修习有形，寸进成章</span><h3>已达成 '+number(data.summary?.unlockedCount)+' / '+achievements.length+' 项成就</h3><p>累计静修与连续打卡，将为你解锁专属衣装。'+(legacy?'这里展示本机旧录的成就，云端衣装按云端进度解锁。':'达成后自动收入衣橱，永久拥有。')+'</p></div></div>'+progressSummaryMarkup(data)+'<div class="fx-achievement-grid">';
      markup+=achievements.map(achievement=>{
        const reward=item(achievement.rewardItemId),unlocked=!!achievement.unlocked,unit=achievement.kind==='hours'?'小时':'天';
        const actual=Math.max(0,Number(achievement.progress)||0),threshold=Math.max(1,Number(achievement.threshold)||1),ratio=clamp(actual/threshold*100,0,100);
        const value=achievement.kind==='hours'?(unlocked?threshold:Math.floor(actual*10)/10).toLocaleString('zh-CN'):number(actual);
        const wearing=reward&&snapshot.equipped?.[reward.slot]===reward.id,canEquip=reward&&!legacy&&owned.has(reward.id);
        return '<article class="fx-achievement '+(unlocked?'is-unlocked ':'')+(achievementFocus===achievement.id?'is-highlighted':'')+'" data-fx-achievement="'+E(achievement.id)+'"><div class="fx-achievement-heading"><span class="fx-achievement-mark">'+icon(unlocked?'check':achievement.kind==='hours'?'book':'leaf')+'</span><div><h3>'+E(achievement.name)+'</h3><p>'+E(achievement.description)+'</p></div><span class="fx-achievement-state">'+(unlocked?'已达成':'修习中')+'</span></div><div class="fx-achievement-meter" role="progressbar" aria-label="'+E(achievement.name)+'" aria-valuemin="0" aria-valuemax="'+threshold+'" aria-valuenow="'+Math.min(actual,threshold)+'" aria-valuetext="'+E(value+' / '+threshold+' '+unit)+'"><i style="width:'+ratio+'%"></i></div><div class="fx-achievement-progress"><span>'+E(value)+' / '+number(threshold)+' '+unit+'</span><small>'+(unlocked?(achievement.unlockedAt?'于 '+E(dateLabel(achievement.unlockedAt))+' 达成':'已经达成'):achievement.kind==='streak'?'每日有效静修满 25 分钟':'只累计有效专注时长')+'</small></div>'+(reward?'<div class="fx-achievement-reward">'+clothingArt(reward)+'<div><span>限定衣装</span><strong>'+E(reward.name)+'</strong><small>'+E(C.SLOTS.find(slot=>slot.id===reward.slot)?.name||'衣装')+' · '+(unlocked?'已解锁':'达成后解锁')+'</small></div><div class="fx-achievement-actions">'+actionButton('achievement-preview','试穿','data-item="'+E(reward.id)+'"','quiet')+(canEquip?actionButton('equip',wearing?'已穿戴':'穿戴','data-item="'+E(reward.id)+'"'+(wearing?' disabled':''),'secondary'):'')+'</div></div>':'')+'</article>';
      }).join('');
      return markup+'</div><p class="fx-record-note">'+icon('info')+'<span>每天累计有效专注满 25 分钟记为一次打卡；今天尚未打卡时，连续天数承接昨天。成就按最长连续记录判定，已获得的衣装会一直保留。</span></p>';
    }

    function leaderboardMarkup(data) {
      if(!online||historySource==='legacy')return '<div class="fx-empty fx-leaderboard-empty">'+icon('people')+'<h3>同室共修，各自精进</h3><p>'+(historySource==='legacy'&&online?'本机旧录保留个人修行轨迹。切换到云端修行录，即可查看当前雅室的真实周榜。':'连接同修雅室后，这里会呈现真实道友的本周静修时长。本机静修仍会计入个人日历与成就。')+'</p>'+(historySource==='legacy'&&online?actionButton('history-source','查看云端周榜','data-source="cloud"'):'')+'</div>';
      if(!snapshot.room)return '<div class="fx-empty fx-leaderboard-empty">'+icon('people')+'<h3>入一间雅室，再看同修周榜</h3><p>公开雅室与受邀加入的私密雅室都可查看。榜单记录大家在同一雅室内的有效专注。</p>'+actionButton('rooms','选择雅室','','primary')+'</div>';
      if(progressStatus!=='ready'||!data)return progressStateMarkup();
      const board=data.leaderboard;
      if(!board||String(board.roomId)!==String(snapshot.room.id))return '<div class="fx-empty fx-leaderboard-empty">'+icon('people')+'<h3>当前雅室的周榜暂未展开</h3><p>请确认仍在这间雅室，稍后重新读取。</p>'+actionButton('progress-retry',icon('refresh')+'重新读取')+'</div>';
      const entries=Array.isArray(board.entries)?board.entries.slice(0,10):[],self=board.self,high=Math.max(1,...entries.map(entry=>Number(entry.focusMs)||0)),selfInList=entries.some(entry=>entry.isSelf);
      const row=(entry,extra='')=>'<article class="fx-leaderboard-row '+(entry.isSelf?'is-self ':'')+extra+'"><span class="fx-leaderboard-rank" aria-label="第 '+integer(entry.rank)+' 名">'+(entry.rank<=3?['','壹','贰','叁'][integer(entry.rank)]:number(entry.rank))+'</span><span class="fx-person-seal" aria-hidden="true">'+personPortrait(entry)+'</span><div class="fx-leaderboard-person"><h3>'+E(entry.nickname||'云间道友')+(entry.isSelf?'<small>我</small>':'')+'</h3><span class="fx-leaderboard-bar" aria-hidden="true"><i style="width:'+clamp(Number(entry.focusMs)/high*100,1,100)+'%"></i></span></div><strong>'+E(duration(entry.focusMs))+'</strong></article>';
      let markup='<div class="fx-leaderboard-intro"><div><span class="fx-eyebrow">同室周榜 · 前十席</span><h3>'+E(board.title||snapshot.room.title)+'</h3><p>'+E(board.weekStart)+' 至 '+E(board.weekEnd)+' · 北京时间</p></div>'+actionButton('progress-retry',icon('refresh')+'刷新','','quiet')+'</div>';
      markup+=entries.length?'<div class="fx-leaderboard-list">'+entries.map(entry=>row(entry)).join('')+'</div>':'<div class="fx-empty fx-empty-small">'+icon('book')+'<h3>这一周的书页，尚待落笔</h3><p>在此雅室留下有效专注时长后，便能在周榜中看到彼此的坚持。</p></div>';
      if(self&&!selfInList&&self.rank)markup+='<div class="fx-leaderboard-self"><p>我的本周位置</p>'+row({...self,nickname:snapshot.nickname,isSelf:true},'is-outside')+'</div>';
      else if(!selfInList)markup+='<p class="fx-leaderboard-my-note">'+icon('leaf')+'你本周在这间雅室还没有有效专注记录。</p>';
      markup+='<p class="fx-record-note">'+icon('info')+'<span>本周共有 '+number(board.participantCount)+' 位道友在此静修。按周一至周日的有效专注时长排序，同分按固定顺序排列；曾在本周共修、当前已离席的道友也会保留在榜中。休息、离开与浏览面板的时间不计入。</span></p>';
      return markup;
    }

    function historyMarkup() {
      const legacy=online&&historySource==='legacy';
      const tabs=[['calendar','calendar','修行日历'],['records','book','修习记录'],['achievements','trophy','修行成就'],['leaderboard','people','同室周榜']];
      const content=progressTab==='calendar'?calendarMarkup(progressData):progressTab==='records'?recordsMarkup(progressData):progressTab==='achievements'?achievementsMarkup(progressData):leaderboardMarkup(progressData);
      return (online&&snapshot.localRecoveryAvailable?'<nav class="fx-room-tabs fx-history-source" aria-label="修行录来源">'+[['cloud','云端修行录'],['legacy','本机旧录']].map(([id,label])=>'<button type="button" data-fx-action="history-source" data-source="'+id+'" aria-pressed="'+(historySource===id)+'">'+label+'</button>').join('')+'</nav>':'')+
        '<nav class="fx-progress-tabs" aria-label="修行录内容">'+tabs.map(([id,symbol,label])=>'<button type="button" data-fx-action="progress-tab" data-tab="'+id+'" aria-pressed="'+(progressTab===id)+'" aria-controls="'+uid+'progress-view">'+icon(symbol)+'<span>'+label+'</span></button>').join('')+'</nav><section class="fx-progress-view" id="'+uid+'progress-view" aria-label="'+E(tabs.find(tab=>tab[0]===progressTab)?.[2])+'" aria-busy="'+(progressStatus==='loading')+'">'+content+'</section>'+
        '<p class="fx-record-note fx-progress-source-note">'+icon('info')+'<span>'+(legacy?'本机旧录仅供回顾，原有悟玉、衣装与修习记录继续保留，不计入云端进度。':online?'云端记录随当前账号保存。日历与打卡统一按北京时间划分，完整完成专注段后结算悟玉。':'修行记录保存在当前设备，日历与打卡统一按北京时间划分。完整完成专注段后发放悟玉。')+'</span></p><div class="fx-record-footer">'+actionButton(legacy?'export-legacy':'export',icon('download')+(legacy?'导出本机旧存档':'导出静修记录'))+'<small>翻阅期间已暂停，关闭后由你主动继续。</small></div>';
    }

    function settingsMarkup() {
      const st=settings();
      return (options.onChooseIdentity?'<section class="fx-settings-section"><h3>'+icon('people')+'我的化身</h3><div class="identity-profile-row"><span class="fx-person-seal">'+global.FocusCharacters.portraitMarkup(selfPortrait())+'</span><div><p>与灵田共用头像，随心更换。</p>'+actionButton('identity','更换性别与头像')+'</div></div></section>':'')+'<section class="fx-settings-section"><h3>'+icon('lotus')+'番茄工作法</h3><p>专注与休息交替进行。下一轮始终由你主动开始。</p><div class="fx-settings-grid">'+[
        ['pomodoroFocusMinutes','每轮专注',5,120,'分钟'],['shortBreakMinutes','短休息',1,30,'分钟'],['longBreakMinutes','长休息',5,60,'分钟'],['roundsPerCycle','长休息间隔',2,8,'轮']
      ].map(([key,label,min,max,unit])=>'<label><span>'+label+'</span><div><input type="number" min="'+min+'" max="'+max+'" step="1" value="'+integer(st[key])+'" data-fx-setting="'+key+'" aria-label="'+label+'"><small>'+unit+'</small></div></label>').join('')+'</div><small>新设置用于之后开始的专注段，当前进度保留。</small></section>'+
        '<section class="fx-settings-section"><h3>'+icon('sun')+'阅读时保持亮屏</h3><label class="fx-setting-toggle"><span><strong>静修时保持亮屏</strong><small>支持的设备可减少读纸质书时自动熄屏</small></span><input type="checkbox" data-fx-setting="keepAwake" '+(st.keepAwake?'checked':'')+'><i aria-hidden="true"></i></label><p class="fx-wake-state" data-fx-wake-status>'+E(wakeStatus || '开始静修后按设备能力保持亮屏')+'</p><small>手动锁屏、切换应用或离开静修仍会暂停。系统节能设置可能限制亮屏。</small></section>'+
        (online?'<section class="fx-settings-section"><h3>'+icon('book')+'云端修行记录</h3><p>悟玉、衣装与多人静修记录随当前账号保存。导出文件可用于个人留存，在线奖励按云端记录结算。</p><div class="fx-settings-actions">'+actionButton('export',icon('download')+'导出云端记录')+(snapshot.localRecoveryAvailable?actionButton('export-legacy',icon('download')+'导出本机旧存档'):'')+'</div>'+(snapshot.localRecoveryAvailable?'<p>第一阶段的本机进度没有删除，可在修行录中切换到“本机旧录”回顾；原有余额与衣装保留在旧存档中。</p>':'')+'<p class="fx-download-ready" data-fx-download-ready hidden></p></section>':'<section class="fx-settings-section"><h3>'+icon('book')+'当前设备的修行记录</h3><p>悟玉、衣装和静修进度保存在当前设备。换设备前，可以导出并保存静修存档。</p><div class="fx-settings-actions">'+actionButton('export',icon('download')+'导出静修存档')+actionButton('choose-import',icon('upload')+'导入静修存档')+'</div><input type="file" accept="application/json,.json" data-fx-import hidden><p class="fx-download-ready" data-fx-download-ready hidden></p></section>')+
        '<div class="fx-rule-note">'+icon('leaf')+'<p><strong>离开暂停，回来继续。</strong>页面内安静阅读，无需定时点击。打开衣橱、记录或更换场景时，先保留进度再暂停。</p></div>';
    }

    function renderPanel(force=false) {
      if(!panelName)return;
      if(panelName==='history'&&progressContext&&progressContext!==progressSourceContext()){loadProgress({refresh:true});return;}
      let key=panelName;
      if(panelName==='shop'||panelName==='wardrobe')key += ':'+[selfAvatarId(),panelSlot,previewItem,snapshot.jade,(snapshot.owned||[]).join(','),JSON.stringify(snapshot.equipped)].join(':');
      else if(panelName==='history')key += ':'+[historySource,progressTab,progressMonth,progressDay,progressVersion,historyPage,achievementFocus,(snapshot.owned||[]).join(','),JSON.stringify(snapshot.equipped)].join(':');
      else if(panelName==='rooms')key += ':'+JSON.stringify([roomTab,roomView(snapshot.room),(snapshot.rooms||[]).map(roomView),
        (snapshot.participants||[]).map(participantView),(snapshot.friends||[]).map(p=>[p.id,p.friendshipId,p.nickname,p.avatarId,p.equipped,p.online]),
        (snapshot.friendRequests||[]).map(p=>[p.id,p.friendshipId,p.participantId,p.nickname,p.avatarId,p.equipped,p.direction]),snapshot.friendCode,snapshot.connection,snapshot.connectionError,snapshot.localRecoveryAvailable]);
      else if(panelName==='settings')key += ':'+JSON.stringify([currentIdentity(),snapshot.equipped]);
      else if(panelName==='cancel')key += ':'+snapshot.active?.id;
      // 网络状态更新不能打断中文输入法或重新创建正在输入的邀请码字段。
      if(!force&&(key===panelKey||panelName==='rooms'&&refs['panel-content'].contains(document.activeElement)&&document.activeElement.matches('[data-fx-room-field]')))return;panelKey=key;
      // 购买、试穿与分页会替换面板内容，保留键盘使用者正在操作的位置。
      const previous=document.activeElement;
      const focusState=refs['panel-content'].contains(previous)?{action:previous.dataset.fxAction,item:previous.dataset.item,slot:previous.dataset.slot,room:previous.dataset.room,friend:previous.dataset.friend,person:previous.dataset.person,tab:previous.dataset.tab,day:previous.dataset.day,source:previous.dataset.source,achievement:previous.dataset.achievement}:null;
      const previousScroll=refs['panel-content'].scrollTop;
      const headings={wardrobe:['衣冠随心','我的衣橱'],shop:['把专注，穿在身上','衣装坊'],history:['点滴积累，皆有回响','修行录'],rooms:['同窗共修，各自精进','同修'],settings:['此间随你','静修设置'],cancel:['此番修习','结束本段？'],import:['恢复修行记录','导入静修存档']};
      const h=headings[panelName] || headings.settings;setText(refs['panel-eyebrow'],h[0]);setText(refs['panel-title'],h[1]);refs.panel.dataset.kind=panelName;
      if(panelName==='shop'||panelName==='wardrobe')refs['panel-content'].innerHTML=wardrobeMarkup();
      else if(panelName==='history')refs['panel-content'].innerHTML=historyMarkup();
      else if(panelName==='rooms')refs['panel-content'].innerHTML=roomsMarkup();
      else if(panelName==='settings')refs['panel-content'].innerHTML=settingsMarkup();
      else if(panelName==='cancel'){
        const a=snapshot.active;
        refs['panel-content'].innerHTML='<div class="fx-confirm"><span class="fx-confirm-icon">'+icon('book')+'</span><h3>已学的 '+E(duration(a?.elapsedMs,true))+' 会留在修行录</h3><p>本段尚未完成，结束后不会获得本段悟玉。也可以保留进度，准备好后接着学习。</p><div>'+actionButton('cancel-confirm','结束并记录','','secondary')+actionButton('panel-close','保留进度','','primary')+'</div></div>';
      }else if(panelName==='import'){
        refs['panel-content'].innerHTML='<div class="fx-confirm"><span class="fx-confirm-icon">'+icon('upload')+'</span><h3>'+E(pendingImport?.name || '静修存档')+'</h3><p>导入将替换当前设备的静修记录、悟玉与衣装。建议先导出当前存档。导入的进行中会话会以暂停状态恢复。</p><div>'+actionButton('export','先导出当前存档')+actionButton('import-confirm','确认导入','','primary')+'</div></div>';
      }
      if(focusState){
        const controls=Array.from(refs['panel-content'].querySelectorAll('button:not(:disabled)'));
        const restored=controls.find(node=>node.dataset.fxAction===focusState.action&&node.dataset.item===focusState.item&&node.dataset.slot===focusState.slot&&node.dataset.room===focusState.room&&node.dataset.friend===focusState.friend&&node.dataset.person===focusState.person&&node.dataset.tab===focusState.tab&&node.dataset.day===focusState.day&&node.dataset.source===focusState.source&&node.dataset.achievement===focusState.achievement)
          ||(focusState.item&&controls.find(node=>node.dataset.fxAction==='preview'&&node.dataset.item===focusState.item))
          ||controls[0]||refs.panel;
        restored.focus({preventScroll:true});
      }
      refs['panel-content'].scrollTop=previousScroll;paintOperationControls();syncAvatarPreview();
    }

    async function openPanel(name) {
      const intent=++panelIntent;
      panelReturnFocus=document.activeElement;
      refs['sound-menu'].open=false;
      // pause 会同步冻结本地计时；展示面板不等待网络，但确认与奖励仍以服务器为准。
      let pausePromise;
      try{pausePromise=Promise.resolve(engine.pause('panel'));}
      catch(error){pausePromise=Promise.resolve({ok:false,message:error?.message||'暂停记录尚未确认，请重试。'});}
      snapshot=engine.getSnapshot();
      if(!opened||destroyed)return;
      progressRequest++;clearTimeout(progressTimer);progressTimer=null;
      panelName=name;panelKey='';previewItem=null;panelPausePending=intent;
      if(name==='history'){historyPage=0;progressData=null;progressStatus='loading';progressContext='';progressCache.clear();}
      refs['panel-layer'].hidden=false;
      refs.main.inert=true;controls.header.inert=true;controls.footer.inert=true;
      render(snapshot);refs.panel.focus({preventScroll:true});
      const finishPause=result=>{
        const current=!destroyed&&opened&&intent===panelIntent&&panelName===name;
        if(result?.ok===false&&!superseded(result)){
          showToast(result.message||'暂停记录尚未确认，请重新连接后重试。','error');
          if(current&&name==='history'){progressStatus='error';progressError=result.message||'暂停记录尚未确认，请重新连接后读取。';progressVersion++;renderPanel();}
        }
        if(!current)return;
        panelPausePending=null;renderInteractionStatus();
        if(result?.ok===false)return;
        if(name==='history')loadProgress();
        if(name==='rooms'&&online)void engine.refreshRooms().then(result=>{
          if(!opened||intent!==panelIntent||panelName!=='rooms')return;
          if(result?.ok===false&&!superseded(result))showToast(result.message||'雅室目录暂未更新，请重试。','error');
          render(engine.getSnapshot());
        }).catch(error=>{if(opened&&intent===panelIntent)showToast(error?.message||'雅室目录暂未更新，请重试。','error');});
      };
      void pausePromise.then(finishPause,error=>finishPause({ok:false,message:error?.message||'暂停记录尚未确认，请重试。'}));
    }

    function closePanel() {
      panelIntent++;panelPausePending=null;
      avatarPreview?.setActive(false);
      if(!panelName)return;
      progressRequest++;clearTimeout(progressTimer);progressTimer=null;
      panelName='';panelKey='';previewItem=null;pendingImport=null;refs['panel-layer'].hidden=true;
      refs.main.inert=false;controls.header.inert=false;controls.footer.inert=false;
      updateMedia();render(snapshot);scheduleScene();
      const returnTarget=panelReturnFocus?.isConnected&&!panelReturnFocus.disabled?panelReturnFocus:refs.actions.querySelector('button:not(:disabled)')||controls.close;
      returnTarget?.focus({preventScroll:true});
      panelReturnFocus=null;
    }

    function focusGoalOnDesktop() {
      if(displayActive())return;
      setConsoleExpanded(true);
      if(!global.matchMedia?.('(hover: none), (pointer: coarse), (max-width: 850px)').matches)refs.goal.focus({preventScroll:true});
    }

    async function selectSeat(index) {
      if(!opened||panelName)return;
      if(online&&snapshot.connection!=='connected'){showToast(connectionMessage());return;}
      if(busy){showToast(pendingMessage()||'上一项操作仍在处理中，请稍候。');return;}
      if(Number(index)===snapshot.seatId&&(!online||snapshot.room)){focusGoalOnDesktop();return;}
      const occupant=online?(snapshot.participants||[]).find(p=>p.seatId===Number(index)&&!p.isSelf&&p.id!==snapshot.participantId):null;
      if(occupant){showToast(occupant.nickname+' 已在此席修习，请另择空席。');return;}
      const result=await perform(()=>engine.selectSeat(Number(index)),'',{action:'seat',button:controls.seats[Number(index)],match:{seat:String(index)},label:'正在入第 '+(Number(index)+1)+' 席…'});
      if(result.ok&&opened&&!panelName){
        sound('seat');
        if(!snapshot.active||['completed','cancelled'].includes(snapshot.active.status))focusGoalOnDesktop();
      }
    }

    function prepareNext() {
      const a=snapshot.active;
      const learned=a?.kind==='focus'?a:snapshot.history?.[0];
      if(learned?.target)draft.target=learned.target;
      if(a?.mode)draft.mode=a.mode;
      if(learned?.minutes){draft.minutes=learned.minutes;draft.custom=![25,40,50].includes(draft.minutes);refs['custom-minutes'].value=String(draft.minutes);}
      refs.goal.value=draft.target;preparingNext=true;actionsKey='';cycleKey='';render(snapshot);focusGoalOnDesktop();
    }

    function exportSave(legacy=false) {
      try{
        const value=legacy?(engine.exportLegacyData?.()||global.SpiritFocus.exportProfile(options.profileId)):engine.exportData();
        if(!value)throw new Error('当前设备没有可导出的旧存档。');
        if(downloadURL)URL.revokeObjectURL(downloadURL);
        downloadURL=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));
        const name='云间灵田_'+(legacy?'本机静修旧存档':online?'云端静修记录':'静修存档')+'_'+new Date().toISOString().slice(0,10)+'.json';
        const link=document.createElement('a');link.href=downloadURL;link.download=name;document.body.append(link);link.click();link.remove();
        const ready=root.querySelector('[data-fx-download-ready]');if(ready){ready.hidden=false;ready.innerHTML='<a href="'+E(downloadURL)+'" download="'+E(name)+'">再次保存静修存档</a>';}
        showToast('静修存档已准备好，请保存下载的文件。','success');
      }catch(error){showToast(error?.message || '暂时无法导出静修存档。','error');}
    }

    async function importFile(file) {
      if(online){showToast('云端悟玉与衣装随账号保存，不能用本机存档覆盖。');return;}
      if(!file)return;
      if(file.size>10*1024*1024){showToast('存档文件过大，请选择有效的静修存档。','error');return;}
      try{
        const data=JSON.parse(await file.text()),check=global.SpiritFocus.validateExport(data);
        if(!check.ok){showToast(check.message || '这份静修存档无法读取，当前记录已保留。','error');return;}
        pendingImport={data,name:file.name};panelName='import';panelKey='';renderPanel();refs.panel.focus({preventScroll:true});
      }catch(_){showToast('这份文件不是有效的静修存档，当前记录已保留。','error');}
    }

    function changeProgressDate(kind,offset) {
      const value=new Date(progressDay+'T00:00:00Z');
      if(kind==='month'){
        const date=Number(progressDay.slice(-2)),month=new Date(progressMonth+'-01T00:00:00Z');
        month.setUTCMonth(month.getUTCMonth()+offset);
        const last=new Date(month.getUTCFullYear(),month.getUTCMonth()+1,0).getDate();
        month.setUTCDate(Math.min(date,last));value.setTime(month.getTime());
      }else value.setUTCDate(value.getUTCDate()+offset);
      if(!Number.isFinite(value.getTime())||value.getUTCFullYear()<1970||value.getUTCFullYear()>9999)return;
      progressDay=value.toISOString().slice(0,10);progressMonth=progressDay.slice(0,7);historyPage=0;
      loadProgress({delay:320});
    }

    async function onClick(event) {
      const button=event.target.closest('[data-fx-action]');
      if(!button || !root.contains(button) || button.disabled)return;
      const action=button.dataset.fxAction;
      const match=Object.fromEntries(['item','room','person','friend','seat'].filter(key=>button.dataset[key]!==undefined).map(key=>[key,button.dataset[key]]));
      const run=(operation,message='')=>perform(operation,message,{action,button,match});
      const intent=panelIntent,samePanel=()=>opened&&!destroyed&&panelIntent===intent;
      if(action==='close'){await close();options.onClose?.();return;}
      if(action==='toggle-console'){setConsoleExpanded(!consoleExpanded);return;}
      if(action==='panel-close'){closePanel();return;}
      if(action==='identity'){
        if(!options.onChooseIdentity){showToast('可从灵田设置中更换性别与头像。');return;}
        if(identityOpen)return;
        identityOpen=true;
        const pause=Promise.resolve(engine.pause('panel')).catch(()=>({ok:false}));
        snapshot=engine.getSnapshot();render(snapshot);updateMedia();
        try{await options.onChooseIdentity();await pause;}
        finally{identityOpen=false;layoutKey='';panelKey='';render(engine.getSnapshot());updateMedia();}
        return;
      }
      if(['shop','wardrobe','history','settings','rooms'].includes(action)){if(action!=='rooms'||online)await openPanel(action);return;}
      if(action==='reconnect'){await run(()=>engine.reconnect());return;}
      if(action==='room-tab'){roomTab=button.dataset.tab;panelKey='';renderPanel(true);refs['panel-content'].scrollTop=0;return;}
      if(action==='refresh-rooms'){await run(()=>engine.refreshRooms());return;}
      if(action==='join-room'||action==='join-invite'){
        const query=action==='join-room'?{roomId:button.dataset.room}:{inviteCode:roomDraft.inviteCode.trim().toUpperCase()};
        if(action==='join-invite'&&!query.inviteCode){showToast('请先填写雅室邀请码。');return;}
        const result=await run(()=>engine.joinRoom(query));if(result.ok){if(samePanel())closePanel();showToast('已入第 '+(integer(snapshot.seatId)+1)+' 席，立愿后即可静修。','success');}return;
      }
      if(action==='create-room'){
        if(!roomDraft.name.trim()){showToast('为雅室取一个名字吧。');root.querySelector('[data-fx-room-field="name"]')?.focus();return;}
        const result=await run(()=>engine.createRoom({title:roomDraft.name.trim(),subject:roomDraft.subject.trim()||'自由修习',sceneId:roomDraft.sceneId,privacy:roomDraft.visibility}));
        if(result.ok){if(samePanel()){roomDraft.name='';roomTab='public';panelKey='';renderPanel(true);}showToast(snapshot.room?.inviteCode?'雅室已开，可复制邀请码相邀。':'雅室已开，欢迎同窗入席。','success');}return;
      }
      if(action==='leave-room'){const result=await run(()=>engine.leaveRoom());if(result.ok)showToast('已离开雅室，专注进度已保留。');return;}
      if(action==='rotate-invite'){await run(()=>engine.rotateInvite(),'邀请码已更换，旧邀请码已失效。');return;}
      if(action==='copy-invite'||action==='copy-friend-code'){
        const code=action==='copy-invite'?snapshot.room?.inviteCode:snapshot.friendCode;
        if(!code)return;
        try{await navigator.clipboard.writeText(code);showToast('已复制，可分享给同学。','success');}catch(_){showToast('邀请码：'+code+'，可长按页面中的号码复制。');}return;
      }
      if(action==='friend-request'||action==='friend-person'){
        const value=action==='friend-person'?{participantId:button.dataset.person}:roomDraft.friendCode.trim().toUpperCase();
        if(!value){showToast('请先填写对方的道友码。');return;}
        const result=await run(()=>engine.requestFriend(value),'邀帖已递出，等待对方应邀。');if(result.ok){roomDraft.friendCode='';panelKey='';renderPanel(true);}return;
      }
      if(action==='friend-accept'||action==='friend-decline'){await run(()=>engine.respondFriend(button.dataset.friend,action==='friend-accept'),action==='friend-accept'?'已结为道友，同室专注可获得共修加成。':'已婉拒这份邀帖。');return;}
      if(action==='friend-remove'){await run(()=>engine.removeFriend(button.dataset.friend),'道友关系或待回应邀帖已解除。');return;}
      if(action==='history-source'){
        const source=button.dataset.source;
        if(!['cloud','legacy'].includes(source)||source==='legacy'&&!snapshot.localRecoveryAvailable||source===historySource)return;
        historySource=source;historyPage=0;achievementFocus='';loadProgress({delay:320});return;
      }
      if(action==='legacy-history'){historySource='legacy';await openPanel('history');return;}
      if(action==='progress-tab'){
        if(!['calendar','records','achievements','leaderboard'].includes(button.dataset.tab))return;
        progressTab=button.dataset.tab;historyPage=0;achievementFocus='';renderPanel();refs['panel-content'].scrollTop=0;return;
      }
      if(action==='progress-month-prev'||action==='progress-month-next'){changeProgressDate('month',action.endsWith('next')?1:-1);return;}
      if(action==='progress-day-prev'||action==='progress-day-next'){changeProgressDate('day',action.endsWith('next')?1:-1);return;}
      if(action==='progress-select-day'){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(button.dataset.day||''))return;
        if(progressDay===button.dataset.day&&progressStatus==='ready')return;
        progressDay=button.dataset.day;progressMonth=progressDay.slice(0,7);historyPage=0;loadProgress({delay:320});return;
      }
      if(action==='progress-today'){
        progressDay=progressData?.today||beijingDay();progressMonth=progressDay.slice(0,7);historyPage=0;loadProgress({delay:320});return;
      }
      if(action==='progress-retry'){loadProgress({refresh:true,delay:320});return;}
      if(action==='view-achievement'){
        historySource='cloud';progressTab='achievements';achievementFocus=button.dataset.achievement||item(button.dataset.item)?.achievementId||'';
        await openPanel('history');return;
      }
      if(action==='achievement-preview'){
        const entry=item(button.dataset.item);if(!entry)return;
        await openPanel('shop');if(panelName!=='shop'||!opened)return;
        panelSlot=entry.slot;previewItem=entry.id;renderPanel();refs['panel-content'].scrollTop=0;return;
      }
      if(action==='seat'){await selectSeat(button.dataset.seat);return;}
      if(action==='retry-scene'){createScene();updateMedia();return;}
      if(action==='mode'){draft.mode=button.dataset.mode;actionsKey='';cycleKey='';render(snapshot);return;}
      if(action==='minutes'){
        draft.custom=button.dataset.minutes==='custom';
        if(!draft.custom)draft.minutes=Number(button.dataset.minutes);else draft.minutes=Number(refs['custom-minutes'].value);
        render(snapshot);if(draft.custom)refs['custom-minutes'].focus();return;
      }
      if(action==='start'){
        if(!consoleExpanded){setConsoleExpanded(true);refs.goal.focus({preventScroll:true});return;}
        draft.target=refs.goal.value.trim();
        if(!draft.target){showToast('先写下本次想完成的学习目标。');refs.goal.focus();return;}
        sound('click');
        const result=await run(()=>engine.start({target:draft.target,minutes:chosenMinutes(),mode:draft.mode}));
        if(result.ok){setConsoleExpanded(false);requestWake();}return;
      }
      if(action==='pause'){await run(()=>engine.pause('manual'));return;}
      if(action==='resume'){sound('click');const result=await run(()=>engine.resume());if(result.ok)requestWake();return;}
      if(action==='cancel'){await openPanel('cancel');return;}
      if(action==='cancel-confirm'){
        const result=await run(()=>engine.cancel());if(result.ok){if(samePanel()){closePanel();prepareNext();}showToast('已学时间已记入修行录。');}return;
      }
      if(action==='break'){sound('click');await run(()=>engine.startBreak());return;}
      if(action==='end-break'){const result=await run(()=>engine.endBreak());if(result.ok)prepareNext();return;}
      if(action==='next'){prepareNext();return;}
      if(action==='mute'){
        if(online&&snapshot.connection!=='connected'){showToast(connectionMessage());return;}
        const next=!settings().muted;
        try{getAudio()?.setEnabled(!next);}catch(_){}
        await run(()=>engine.setSettings({muted:next}));return;
      }
      if(action==='slot'){panelSlot=button.dataset.slot;previewItem=null;renderPanel();return;}
      if(action==='preview'){previewItem=button.dataset.item;renderPanel();refs['panel-content'].scrollTop=0;return;}
      if(action==='clear-preview'){previewItem=null;renderPanel();return;}
      if(action==='buy'){
        const entry=item(button.dataset.item);if(entry?.achievementId){showToast('这件限定衣装会在达成修行成就后自动解锁。');return;}
        const result=await run(()=>engine.buy(button.dataset.item));
        if(result.ok){sound('purchase');showToast('已拥有'+(entry?.name || '这件衣装')+'，可随时穿戴。','success');}return;
      }
      if(action==='equip'){
        const entry=item(button.dataset.item);const result=await run(()=>engine.equip(button.dataset.item));
        if(result.ok){if(samePanel()){previewItem=null;renderPanel();}sound('click');showToast('已换上'+(entry?.name || '新衣装')+'。','success');}return;
      }
      if(action==='history-prev'||action==='history-next'){historyPage+=action==='history-next'?1:-1;renderPanel();refs['panel-content'].scrollTop=0;return;}
      if(action==='export'){exportSave();return;}
      if(action==='export-legacy'){exportSave(true);return;}
      if(action==='choose-import'){root.querySelector('[data-fx-import]')?.click();return;}
      if(action==='import-confirm'&&pendingImport){
        const data=pendingImport.data;const result=await run(()=>engine.importData(data));
        if(result.ok){if(samePanel())closePanel();draft.target=(snapshot.active?.kind==='focus'?snapshot.active.target:snapshot.history?.[0]?.target) || snapshot.pomodoro?.lastTarget || '';draft.mode=snapshot.active?.mode || 'pomodoro';refs.goal.value=draft.target;render(snapshot);showToast('静修存档已恢复，进行中的进度已暂停。','success');}return;
      }
    }

    async function onChange(event) {
      const target=event.target;
      if(target.matches('[data-fx-room-field]')){roomDraft[target.dataset.fxRoomField]=target.value;return;}
      if(target===refs['scene-select']){const result=await perform(()=>engine.selectScene(target.value),'',{action:'select-scene',button:target});if(result.ok)sound('click');return;}
      if(target===refs.soundscape){
        const selected=target.value;
        // 选择已启用的环境声时立即响应手势；保存失败再恢复已确认的偏好。
        if(!settings().muted&&(!online||snapshot.connection==='connected')){try{getAudio()?.setSoundscape?.(selected);}catch(_){}}
        const result=await perform(()=>engine.setSettings({soundscape:selected}),'',{action:'save-settings',button:target});
        if(!result.ok)target.value=settings().soundscape||'scene';
        mediaKey='';updateMedia();return;
      }
      if(target===refs.volume){await perform(()=>engine.setSettings({volume:Number(target.value)/100}),'',{action:'save-settings',button:target});return;}
      if(target.matches('[data-fx-setting]')){
        const key=target.dataset.fxSetting,value=target.type==='checkbox'?target.checked:Number(target.value);
        const result=await perform(()=>engine.setSettings({[key]:value}),'',{action:'save-settings',button:target});
        if(!result.ok){if(target.type==='checkbox')target.checked=!!settings()[key];else target.value=String(settings()[key]);}
        updateWakeLabel();return;
      }
      if(target.matches('[data-fx-import]')){await importFile(target.files?.[0]);target.value='';}
    }

    function onInput(event) {
      if(event.target.matches('[data-fx-room-field]'))roomDraft[event.target.dataset.fxRoomField]=event.target.value;
      if(event.target===refs.goal)draft.target=refs.goal.value;
      if(event.target===refs['custom-minutes']){draft.minutes=Number(event.target.value);render(snapshot);}
      if(event.target===refs.volume){try{getAudio()?.setVolume(Number(event.target.value)/100);}catch(_){}}
    }

    function onKeydown(event) {
      if(!opened||event.defaultPrevented)return;
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        if(refs['sound-menu'].open){refs['sound-menu'].open=false;return;}
        if(panelName)closePanel();else{close().then(()=>options.onClose?.());}return;
      }
      if(event.key==='Enter'&&event.target===refs.goal){event.preventDefault();root.querySelector('[data-fx-action="start"]')?.click();return;}
      if(event.key!=='Tab')return;
      const area=panelName?refs.panel:app;
      const nodes=Array.from(area.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,a[href],[tabindex="0"]')).filter(n=>!n.closest('[hidden],[inert]')&&n.getClientRects().length);
      if(!nodes.length){event.preventDefault();area.focus();return;}
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===area)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }

    function onVisibility(){updateMedia();}
    function onResize(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;if(opened){scene?.setViewportInsets?.(sceneInsets());scene?.resize();avatarPreview?.resize();}});}
    function stopPropagation(event){event.stopPropagation();}
    root.addEventListener('click',onClick);root.addEventListener('click',stopPropagation);
    root.addEventListener('change',onChange);root.addEventListener('input',onInput);root.addEventListener('keydown',onKeydown);
    document.addEventListener('visibilitychange',onVisibility);global.addEventListener('resize',onResize);
    global.addEventListener('focus-model-preview-ready',syncAvatarPreview);
    const unsubscribe=engine.subscribe(render);
    const unsubscribePortraitReady=global.FocusCharacters?.onReady?.(()=>{
      if(destroyed)return;
      layoutKey='';panelKey='';companionKey='';render(snapshot);
    });
    render(snapshot);

    async function open() {
      if(destroyed) return;
      opened=true;openingView=true;root.hidden=false;render(snapshot);scheduleScene();
      try{await engine.setActive(true);}finally{openingView=false;}
      snapshot=engine.getSnapshot();
      if(!opened||destroyed)return;
      render(snapshot);scheduleScene();onResize();
      if(!panelName)controls.close?.focus({preventScroll:true});
      if(online&&!hasOfferedRooms&&!snapshot.room&&snapshot.connection==='connected'&&!panelName){hasOfferedRooms=true;await openPanel('rooms');}
    }

    async function close() {
      if(!opened || destroyed)return;
      opened=false;panelIntent++;panelPausePending=null;cancelAnimationFrame(sceneFrame);sceneFrame=null;closePanel();refs['sound-menu'].open=false;
      await engine.setActive(false);snapshot=engine.getSnapshot();
      root.hidden=true;mediaKey='';updateMedia();releaseWake();
    }

    async function destroy() {
      if(destroyed)return;
      await close();destroyed=true;unsubscribe?.();unsubscribePortraitReady?.();
      clearTimeout(toastTimer);cancelAnimationFrame(resizeFrame);cancelAnimationFrame(sceneFrame);sceneFrame=null;releaseWake();
      document.removeEventListener('visibilitychange',onVisibility);global.removeEventListener('resize',onResize);
      global.removeEventListener('focus-model-preview-ready',syncAvatarPreview);
      root.removeEventListener('click',onClick);root.removeEventListener('click',stopPropagation);root.removeEventListener('change',onChange);root.removeEventListener('input',onInput);root.removeEventListener('keydown',onKeydown);
      scene?.destroy();avatarPreview?.destroy();audio?.destroy();await engine.destroy();
      if(downloadURL)URL.revokeObjectURL(downloadURL);root.innerHTML='';
    }

    return {open,close,destroy,isOpen:()=>opened,focus:()=>((panelName?refs.panel:null)||controls.close)?.focus({preventScroll:true}),getEngine:()=>engine,exportData:()=>engine.exportData(),importData:async data=>{const result=await engine.importData(data);snapshot=engine.getSnapshot();render(snapshot);return result;}};
  }

  global.SpiritFocusUI={create};
})(typeof window!=='undefined'?window:globalThis);
