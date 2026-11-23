/* Each garden's persistent celestial calendar, plus a purely visual preview. */
(function (global) {
  'use strict';
  const GLYPHS = {spring:'春',summer:'夏',autumn:'秋',winter:'冬'};
  const PRESETS = [
    {id:'spring-rain',name:'春雨润山',note:'新绿 · 细雨 · 白昼',seasonId:'spring',weatherId:'rain',phaseId:'day'},
    {id:'summer-night',name:'夏夜流萤',note:'月色 · 流萤 · 晚风',seasonId:'summer',weatherId:'clear',phaseId:'night'},
    {id:'autumn-dusk',name:'秋山夕照',note:'金叶 · 暮色 · 霞光',seasonId:'autumn',weatherId:'clear',phaseId:'dusk'},
    {id:'winter-snow',name:'冬雪入夜',note:'飞雪 · 月光 · 暖灯',seasonId:'winter',weatherId:'snow',phaseId:'night'}
  ];
  const PATHS = {
    breeze:'<path d="M3 8h11a3 3 0 1 0-3-3M2 12h17a2 2 0 1 1-2 2M5 17h7a2.5 2.5 0 1 1-2.5 2.5"/>',
    clear:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    night:'<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.7 8.7 0 1 0 10.6 10.6Z"/><path d="m17 3 .6 1.6L19.2 5l-1.6.6L17 7.2l-.6-1.6L14.8 5l1.6-.4Z"/>',
    cloudy:'<path d="M6.5 18h11a4.5 4.5 0 0 0 .4-9A6.2 6.2 0 0 0 6.2 8 5 5 0 0 0 6.5 18Z"/>',
    rain:'<path d="M5 13a4.4 4.4 0 0 1 1-8.6A6 6 0 0 1 17.3 7 3.8 3.8 0 0 1 1 7.5"/><path d="m8 14-2 4m7-4-3 7m8-7-2 4"/>',
    snow:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M8.8 4.5 12 7l3.2-2.5M8.8 19.5 12 17l3.2 2.5M4 10.8 7.7 9.5 7.2 5.5m9.6 13 .5-4 3.7-1.3M4 13.2l3.7 1.3-.5 4m9.6-13 .5 4 3.7 1.3"/>',
    mist:'<path d="M6 8a4 4 0 0 1 1-7.8 5.7 5.7 0 0 1 10.7 2.7A3.5 3.5 0 0 1 20 9M3 13h13m3 0h2M2 17h5m3 0h12M5 21h14" transform="translate(0 1)"/>',
    dawn:'<path d="M3 17h18M5 21h14M7 13a5 5 0 0 1 10 0M12 2v3M3 7l2 2m14 0 2-2M12 11V7m-2 2 2-2 2 2"/>',
    dusk:'<path d="M3 17h18M5 21h14M7 13a5 5 0 0 1 10 0M12 2v3M3 7l2 2m14 0 2-2M12 7v4m-2-2 2 2 2-2"/>'
  };
  function icon(weather,phase){
    const key=weather==='clear'&&phase==='night'?'night':weather==='clear'&&['dawn','dusk'].includes(phase)?phase:weather;
    return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${PATHS[key]||PATHS.clear}</svg>`;
  }
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const setText=(id,value)=>{const e=document.getElementById(id);if(e&&e.textContent!==value)e.textContent=value;};
  function remaining(ms){const m=Math.max(0,Math.ceil(ms/60000)),days=Math.floor(m/1440),hours=Math.floor(m%1440/60),minutes=m%60;return days?`${days}天${hours}小时`:hours?`${hours}小时${minutes}分`:`${minutes}分钟`;}

  global.createSpiritEnvironmentUI=function(options){
    const E=global.SpiritEnvironment,button=document.getElementById('environment-open');
    if(!E||!button)return {update(){},destroy(){}};
    let preview=null,live,shown,iconKey='',forecastKey='',disposed=false;
    let simple=false;
    try{simple=global.localStorage.getItem('yunjian-simple-weather')==='true';}catch(_){}
    options.scene?.setWeatherEffectsEnabled?.(!simple);

    const scope=()=>options.getScope?.() || 'garden';
    function update(){
      if(disposed)return;
      const now=options.now(),calendar=options.getCalendar();
      live=E.getState(now,null,calendar.startedAt);shown=preview?E.getState(now,preview,calendar.startedAt):live;
      options.scene?.setEnvironment?.(shown);
      const context=scope(),available=context==='garden',scenic=context==='sect';
      const title=scenic?'轻风':`${GLYPHS[shown.seasonId]} · ${shown.weatherName}`;
      setText('environment-chip-title',title);
      if(document.getElementById('environment-chip-clock')) {
        setText('environment-chip-clock',live.clockLabel);
        setText('environment-chip-phase',scenic?'北京时间':preview?`赏景 · ${shown.phaseName}`:shown.phaseName);
      } else setText('environment-chip-time',`${live.clockLabel} · ${preview?'赏景 · ':''}${shown.phaseName}`);
      button.dataset.available=String(available);
      button.dataset.scope=context;
      button.setAttribute('aria-disabled',String(!available));
      const details=document.getElementById('environment-summary-details'),note=document.getElementById('environment-summary-note');
      if(details)details.hidden=!(available||scenic);
      if(note) { note.hidden=available||scenic; note.textContent=`北京时间 ${live.clockLabel}`; }
      setText('environment-summary-hint',scenic?'昼夜流转':'四时天象');
      const chevron=document.getElementById('environment-summary-chevron');if(chevron)chevron.hidden=!available;
      button.title=available?'查看四时天象、天气预报与赏景预览':context==='sect'?'宗门保持轻风；白天与夜间可用山景中的天象控件切换':'回到灵田查看四时天象';
      button.dataset.season=shown.seasonId;
      button.dataset.phase=shown.phaseId;
      const pageName=document.getElementById('fullscreen-title')?.textContent || '灵田';
      button.setAttribute('aria-label',available?`${pageName}，${preview?'赏景预览，':'当前'}${shown.seasonName}，${shown.weatherName}，${shown.phaseName}，北京时间${live.clockLabel}。查看四时天象`:`${pageName}，北京时间${live.clockLabel}${context==='sect'?'，轻风。使用山景中的天象控件切换昼夜':'。回到灵田查看四时天象'}`);
      const k=scenic?'breeze':shown.weatherId+shown.phaseId;
      if(k!==iconKey){iconKey=k;document.getElementById('environment-chip-icon').innerHTML=icon(scenic?'breeze':shown.weatherId,shown.phaseId);}
      const notice=document.getElementById('environment-preview-notice');
      if(notice)notice.hidden=!preview || !available;
      document.querySelector('.garden-card')?.classList.toggle('has-environment-preview',!!preview);
      setText('environment-preview-label',`赏景 · ${shown.seasonName} · ${shown.phaseName} · ${shown.weatherName}`);
      if(options.getDialogKind()!=='environment')return;
      // Update text nodes without replacing controls or moving keyboard focus.
      setText('environment-live-clock',live.clockLabel);
      setText('environment-live-date',`${live.dateLabel} · ${live.phaseName}`);
      setText('environment-live-season',live.seasonName);
      setText('environment-live-day',`第 ${live.seasonDay} 日 / ${live.seasonLength} 日`);
      setText('environment-live-year',`云历第 ${live.year} 年`);
      setText('environment-continuity-title',`${calendar.visiting?'田主入境':'入境'}第 ${live.worldDay} 日 · 时序持续流转`);
      setText('environment-first-entry',`${calendar.visiting?calendar.ownerName+' · ':''}初入 ${live.firstEntryLabel}（北京时间）`);
      setText('environment-elapsed',`已流转 ${live.elapsedDays} 天 ${Math.floor(live.elapsedMs%86400000/3600000)} 小时 ${Math.floor(live.elapsedMs%3600000/60000)} 分钟`);
      setText('environment-live-weather',live.weatherName);
      setText('environment-season-glyph',GLYPHS[live.seasonId]);
      const liveCard=document.getElementById('environment-live-card');if(liveCard)liveCard.dataset.season=live.seasonId;
      const liveIcon=document.getElementById('environment-live-weather-icon');
      if(liveIcon&&liveIcon.dataset.weather!==live.weatherId+live.phaseId){liveIcon.innerHTML=icon(live.weatherId,live.phaseId);liveIcon.dataset.weather=live.weatherId+live.phaseId;}
      setText('environment-weather-countdown',`${remaining(live.weatherEndsAt-now)}后进入下一段天象`);
      setText('environment-season-countdown',`${remaining(live.seasonEndsAt-now)}后换季`);
      setText('environment-description',live.weatherDescription);
      document.querySelectorAll('[data-environment-season-step]').forEach(el=>{el.classList.toggle('current',el.dataset.environmentSeasonStep===live.seasonId);});
      document.querySelectorAll('[data-environment-day]').forEach(el=>{const day=Number(el.dataset.environmentDay);el.classList.toggle('passed',day<live.seasonDay);el.classList.toggle('current',day===live.seasonDay);});
      const nextKey=live.startedAt+':'+live.weatherEndsAt;
      if(nextKey!==forecastKey){
        forecastKey=nextKey;
        const box=document.getElementById('environment-forecast');
        if(box)box.innerHTML=E.getForecast(now,4,live.startedAt).map(s=>`<li><time datetime="${new Date(s.startsAt).toISOString()}">${s.dateLabel===live.dateLabel?'今日':'明日'} ${s.clockLabel}</time>${icon(s.weatherId,s.phaseId)}<strong>${escape(s.weatherName)}</strong><small>${escape(s.seasonName)} · ${escape(s.phaseName)}</small></li>`).join('');
      }
    }
    function selectOptions(list,value){return list.map(s=>`<option value="${s.id}"${s.id===value?' selected':''}>${escape(s.name)}</option>`).join('');}
    function open(){
      if(scope()!=='garden')return;
      update();forecastKey='';
      const daySteps=Array.from({length:7},(_,i)=>`<span data-environment-day="${i+1}" class="${i+1===live.seasonDay?'current':i+1<live.seasonDay?'passed':''}">${i+1}</span>`).join('');
      options.openDialog('environment','四时天象',`
        <div class="environment-now" id="environment-live-card" data-season="${live.seasonId}">
          <div class="environment-season-seal" id="environment-season-glyph" aria-hidden="true">${GLYPHS[live.seasonId]}</div>
          <div class="environment-season-copy"><span class="environment-kicker" id="environment-live-year"></span><h3 id="environment-live-season"></h3><p id="environment-live-day"></p></div>
          <div class="environment-clock"><strong id="environment-live-clock"></strong><span>北京时间 · ${options.online?'云端校时':'离线练习'}</span><small id="environment-live-date"></small></div>
        </div>
        ${global.SpiritBootVerse?`<p class="environment-verse">${escape(global.SpiritBootVerse)}</p>`:''}
        <section class="environment-continuity" aria-label="洞天连续时序"><span class="environment-continuity-mark" aria-hidden="true">晷</span><div><strong id="environment-continuity-title"></strong><p id="environment-first-entry"></p><small id="environment-elapsed"></small><p class="environment-continuity-note">${options.online?'离开、刷新或换设备':'离开页面或刷新后'}，四季与天象仍按现实时间向前。</p></div></section>
        <div class="environment-calendar"><div class="environment-calendar-heading"><span>洞天一季 · 七日流转</span><small id="environment-season-countdown"></small></div><div class="environment-days" aria-label="本季七日进度">${daySteps}</div><div class="environment-season-path">${E.SEASONS.map(s=>`<span data-environment-season-step="${s.id}"><i aria-hidden="true">${GLYPHS[s.id]}</i>${escape(s.name)}</span>`).join('')}</div></div>
        <section class="environment-forecast-section"><div class="environment-section-heading"><h3>未来四段天象</h3><span>游戏天象 · 三小时一换</span></div><div class="environment-current-weather"><i id="environment-live-weather-icon" aria-hidden="true">${icon(live.weatherId,live.phaseId)}</i><strong id="environment-live-weather"></strong><span id="environment-weather-countdown"></span></div><ul class="environment-forecast" id="environment-forecast"></ul><p class="environment-caption" id="environment-description"></p></section>
        <div class="environment-rules"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-leaf"/></svg><p>从第一次入境起，每满七个真实日换季，二十八日一轮；天气每三小时轮换。晨光 05—07 时，白昼 07—17 时，晚霞 17—19 时，月夜 19—05 时。${options.online?'云端保留最初入境时间，换设备也接续同一方洞天。':'离线练习将起点保存在此浏览器，换设备可导出并导入练习存档。'}真实雨天会在需要浇水时自动补水，按时照料的最短成熟时间为 40 分钟至 4 小时；离线经历的雨段也会结算。未成熟灵植在冬季经历自然天气切换点时，每株每个冬季最多判定一次 1% 冻害；冻枯后用锄头清理，成熟灵植不受冻害。</p></div>
        <section class="environment-preview-section"><div class="environment-section-heading"><h3>借一刻风景</h3><span>赏景预览</span></div><p class="environment-caption">先看看另一季的山色。赏景预览只改变画面，不触发自动浇水或冻害；田间仍按真实天象结算。结束赏景或刷新后回到现实此刻。</p>
        <div class="environment-presets">${PRESETS.map(p=>`<button class="environment-preset" data-environment-preset="${p.id}" data-season="${p.seasonId}"><span class="environment-preset-art" aria-hidden="true"><i class="environment-preset-mountain"></i><i class="environment-preset-orb"></i><i class="environment-preset-detail"></i></span><strong>${p.name}</strong><small>${p.note}</small></button>`).join('')}</div>
        <details class="environment-custom"><summary>自选季节、时段和天气</summary><div class="environment-selects"><label>季节<select id="environment-select-season">${selectOptions(E.SEASONS,shown.seasonId)}</select></label><label>时段<select id="environment-select-phase">${selectOptions(E.PHASES,shown.phaseId)}</select></label><label>天气<select id="environment-select-weather">${selectOptions(E.WEATHER.filter(w=>shown.seasonId==='winter'?w.id!=='rain':w.id!=='snow'),shown.weatherId)}</select></label></div><button class="button button-primary" data-environment-apply>进入这片风景</button></details>
        ${preview?'<button class="button button-secondary environment-return" data-environment-return>结束赏景，回到此刻</button>':''}</section>
        <div class="environment-motion"><div><strong>精简天气动效</strong><p>保留四季山色与晨昏，收起飘落粒子。适合较旧的手机。</p></div><button class="environment-switch" type="button" data-environment-motion aria-pressed="${simple}" aria-label="精简天气动效"><span></span><b>${simple?'已开启':'已关闭'}</b></button></div>
      `);
      update();
    }
    function applyPreview(value){preview={seasonId:value.seasonId,phaseId:value.phaseId,weatherId:value.weatherId};update();options.closeDialog();}
    function click(event){
      const target=event.target.closest('button');if(!target||target.disabled)return;
      if(target===button){open();return;}
      if(target.hasAttribute('data-environment-return')){
        preview=null;update();if(options.getDialogKind()==='environment')options.closeDialog();return;
      }
      const preset=PRESETS.find(p=>p.id===target.dataset.environmentPreset);
      if(preset){applyPreview(preset);return;}
      if(target.hasAttribute('data-environment-apply')){
        applyPreview({seasonId:document.getElementById('environment-select-season').value,phaseId:document.getElementById('environment-select-phase').value,weatherId:document.getElementById('environment-select-weather').value});return;
      }
      if(target.hasAttribute('data-environment-motion')){
        simple=!simple;try{global.localStorage.setItem('yunjian-simple-weather',String(simple));}catch(_){}
        options.scene?.setWeatherEffectsEnabled?.(!simple);
        target.setAttribute('aria-pressed',String(simple));target.querySelector('b').textContent=simple?'已开启':'已关闭';
      }
    }
    function change(event){
      if(event.target.id!=='environment-select-season')return;
      const weather=document.getElementById('environment-select-weather');if(!weather)return;
      const list=E.WEATHER.filter(w=>event.target.value==='winter'?w.id!=='rain':w.id!=='snow');
      const selected=list.some(w=>w.id===weather.value)?weather.value:'clear';weather.innerHTML=selectOptions(list,selected);
    }
    document.addEventListener('click',click);document.addEventListener('change',change);
    update();
    return {update,open,destroy(){disposed=true;document.removeEventListener('click',click);document.removeEventListener('change',change);}};
  };
})(window);
