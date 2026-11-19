/* 万象道藏: collectible cards, readable theory, and authoritative card trading. */
(function (global) {
  'use strict';
  const TABS=[['draw','启封'],['collection','卡册'],['study','参悟'],['market','坊市'],['guide','玩法']];
  const SEALS={commodity:'万物',scales:'衡值',loom:'经纬',coin:'金衡',market:'通商',gate:'山门',furnace:'炼化',cycle:'周行',wheel:'流转',distribution:'分流',land:'厚土',book:'观照',crystal:'凝华',bridge:'通达'};
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const asCount=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  const money=value=>asCount(value).toLocaleString('zh-CN');
  const compact=string=>String(string||'').replace(/\s+/g,' ').trim();
  const serial=id=>String(id||'').replace(/^([a-z]+)_/,(_match,prefix)=>prefix.toUpperCase()+' · ');
  const chapterLabel=chapter=>chapter?.number===0?'导论':`第${chapter?.number}章 · ${chapter?.title||''}`;
  function create(options={}) {
    const host=options.host,engine=options.engine,E=options.esc||escapeHTML,embeddedMarket=!!options.embeddedMarket;
    if(!host||!engine)throw new Error('万象道藏需要游戏窗口与进度连接。');
    let opened=false,destroyed=false,tab='draw',detailId=null,lastFocus=null,signature='',session=0,lastCourseId=engine.cards?.courseId;
    let filter={search:'',chapter:'all',rarity:'all',owned:'all',page:0},scrollPositions={},detailReturn=null;
    let detailSide='front',detailTurning=false,detailTimer=null,detailPhase='ready',detailPhaseTimer=null,detailOrigin=null,detailPointer=null,detailSuppressClick=false,detailReadScroll=0,detailSourcesOpen=false;
    let busyAction='',packResult=null,revealed=0,revealing=false,packPhase='idle',packIndex=0,packSummary=false,pageTurning=false,pageDirection=1,animateIndex=-1,animationEpoch=0,animationTimers=[],pendingNotice='',localError='',localLoading=false,swipeStart=null,suppressCardClick=false;
    // 挑一张放进陈列架（2026-11-19 用户：“点击‘去卡册挑选’后，点击相应的卡牌，直接弹出是否放入陈列架的选项，而不是进入查看卡牌”）：
    // pickDisplay＝从参悟页陈列架空位进来的挑选模式；pickPrompt＝点了哪张卡、正在问要不要放入
    let pickDisplay=false,pickPrompt=null,pickBusy=false,pickError='';
    let listingDraft={cardId:'',price:'',quantity:'1'},confirmation=null,marketCard='',marketPage=0,marketInterval='1h',marketSelectedTime=null,chartDispose=null;
    let titleFitFrame=0,packEntrance=null,pageTurnPhase='idle',inspectionOnly=false,exhibit=null,inspectReturn='',initialMarketCard=options.initialCardId||'',renderedDetailKey='',fullscreenDraw=false;
    let cardSnapshot,cardSnapshotMarket,cardSnapshotKey='',cardSnapshotVersion=0,detailMarkup='';
    let scopeSnapshot,scopeIds=null,collectionScopeInitialized=false;
    const catalogue=()=>global.SpiritCards;
    const current=()=>engine.cards;
    const course=()=>catalogue()?.getCourse?.(current()?.courseId);
    // 智慧课堂 2026-11-19：拜访道友时点藏真书案上的卡框——“道友陈列”只读赏鉴（可以是另一门课的卡，不看自己有没有）
    const showingExhibit=()=>!!exhibit&&detailId===exhibit.id;
    const courseOfCard=card=>catalogue()?.getCourse?.(card?.courseId)||course();
    const STUDY_STAGES=['未读','初识','明辨','会用','巩固'];
    function exhibitStamp(){const value=exhibit?.stage||0;return value?'<span class="sy-card-stamp sy-stamp-'+value+'" aria-label="道友参悟 '+STUDY_STAGES[value]+'">'+STUDY_STAGES[value]+'</span>':'';}
    const getCard=id=>catalogue()?.getCard?.(id);
    const rarity=id=>catalogue()?.getRarity?.(id)||{id,name:id,color:'#b69a61',rank:0};
    const own=id=>asCount(current()?.inventory?.[id]);
    const known=id=>own(id)>0||(current()?.discovered||[]).includes(id);
    const all=()=>course()?.cards||[];
    const curriculum=()=>current()?.curriculum;
    const enabled=id=>{const source=curriculum()?.cardIds;if(source!==scopeSnapshot){scopeSnapshot=source;scopeIds=Array.isArray(source)?new Set(source):null;}return !scopeIds||scopeIds.has(id);};
    const teachingCards=()=>all().filter(card=>enabled(card.id));
    const drawEnabled=()=>rules().drawEnabled!==false;
    const available=()=>!!(current()?.available&&course());
    const busy=()=>!!(busyAction||engine.busy||engine.pending||engine.authRequired||engine.accountChanged);
    const rules=()=>current()?.rules||{};
    const trading=()=>rules().trading||{};
    const reduced=()=>!!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const button=(action,label,extra='',disabled=false,kind='secondary',className='')=>`<button type="button" class="dz-button dz-button-${kind}${className?' '+E(className):''}" data-cards-action="${action}" ${extra}${disabled?' disabled':''}>${label}</button>`;
    const icon=(name)=>({close:'<path d="m6 6 12 12M18 6 6 18"/>',back:'<path d="m14 5-7 7 7 7M7 12h14"/>',book:'<path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1ZM12 6v14"/>',spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',gem:'<path d="m12 2 9 7-3 11H6L3 9ZM3 9h18M12 2 8 9l4 11 4-11Z"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',chevron:'<path d="m9 5 7 7-7 7"/>'}[name]||'');
    const glyph=name=>`<svg class="dz-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon(name)}</svg>`;
    const attr=(name,value)=>`data-${name}="${E(value)}"`;
    const gradeBadge=id=>{const grade=rarity(id);return `<span class="dz-grade-badge" data-rarity="${E(id)}" aria-label="${E(grade.name)} ${E(id)}"><b class="dz-grade-code">${E(id)}</b><em>${E(grade.name)}</em></span>`;};
    const studyUI=!embeddedMarket&&global.createSpiritStudyUI?global.createSpiritStudyUI({engine,host,
      onChange:()=>render(),onOpen:()=>moveTab('study'),onBrowse:()=>{if(!drawEnabled())filter={search:'',chapter:'all',rarity:'all',owned:'all',page:0};moveTab('collection');},onClose:()=>close(),
      onPickDisplay:()=>{filter={search:'',chapter:'all',rarity:'all',owned:'owned',page:0};pickDisplay=true;pickPrompt=null;pickError='';moveTab('collection');},
      onRead:id=>{openDetail(id);if(detailId===id){detailSide='back';render(true);}}
    }):null;
    // 智慧课堂 2026-11-19 用户：“把这个特效也加入到卡牌显示中，就是卡牌周围带一圈闪光”——地品 SSR、天品 UR（已收录、不是小图）四周一圈光晕和闪烁的星芒
    // 卡面外包一层 dz-card-glint（卡面本身 overflow:hidden 装不下外圈光），光圈只围住卡面、不围下面“可用 ×1”；其余卡牌的结构不变
    const sparkles=(card,known,mini)=>!mini&&known&&(card.rarity==='SSR'||card.rarity==='UR');
    const sparkleRing=()=>'<span class="dz-card-sparkle" aria-hidden="true">'+'<i></i>'.repeat(10)+'</span>';
    function cardFace(card,{mini=false,count=true,revealIndex=null,action='detail'}={}) {
      if(!card)return '';
      const shown=exhibit?.id===card.id&&showingExhibit(),grade=rarity(card.rarity),owned=shown?1:own(card.id),known=shown||owned>0||(current()?.discovered||[]).includes(card.id),chapter=courseOfCard(card)?.chapters?.find(ch=>ch.id===card.chapterId);
      const unseen=revealIndex!==null&&revealIndex>=revealed, fresh=packResult?.cards?.[revealIndex]?.isNew;
      if(unseen)return `<div class="dz-reveal-slot is-sealed" aria-label="尚待揭晓的卡牌"><span>${global.spiritCardBackArt?.()||''}</span><small>道藏凝形</small></div>`;
      const glint=sparkles(card,known,mini);
      return `<button type="button" class="dz-card ${mini?'is-mini ':''}${revealIndex!==null&&revealIndex===animateIndex?'is-revealed ':''}${owned?'is-owned':'is-unowned'} ${known?'is-discovered':'is-undiscovered'}" ${attr('cards-action',action)} ${attr('card-id',card.id)} ${attr('rarity',card.rarity)} aria-label="${E(card.title)}，${E(grade.name)} ${E(card.rarity)}，${shown?'道友陈列':owned?'可用'+owned+'张':known?'已收录，暂无可用卡牌':'尚未收藏'}，${action==='detail-flip'?'翻到背面研读理论':'查看理论知识点'}">
        ${glint?'<span class="dz-card-glint">':''}<span class="dz-card-inner"><span class="dz-card-corner dz-corner-one" aria-hidden="true"></span><span class="dz-card-corner dz-corner-two" aria-hidden="true"></span><span class="dz-card-top"><span>${chapter?.number===0?'导论':'卷'+E(chapter?.number??String(card.chapterId||'').replace('ch',''))}<small>${E(card.subtitle||'万象道藏')}</small></span>${gradeBadge(card.rarity)}</span>
        <span class="dz-card-picture" title="${E(global.spiritCardArtIdea?.(card)||card.art?.symbol||'道藏意象')}">${global.spiritCardArt?.(card)||glyph('book')}<i class="dz-card-seal">${SEALS[card.art?.motif]||'藏真'}</i></span>
        <span class="dz-card-title" data-fit-card-title><span class="dz-title-text">${E(card.title)}</span></span><span class="dz-card-definition">${E(compact(card.definition))}</span>
        <span class="dz-card-foot"><span>${E(serial(card.id))}</span><b><i>${['✦','✦✦','✦✦✦','✦✦✦✦','✦✦✦✦✦'][Math.min(4,grade.rank||0)]}</i><span>典藏</span></b></span></span>${glint?sparkleRing()+'</span>':''}
        ${shown?exhibitStamp():studyUI?.stamp(card.id)||''}${count?`<span class="dz-card-count ${owned?'':'is-missing'}">${fresh?'新得 · ':''}${owned?'可用 ×'+owned:known?'已录 · 暂无可用':'未藏 · 可研读'}</span>`:''}</button>`;
    }
    function stats() {
      const cards=all(),collected=cards.filter(card=>known(card.id)).length;
      return {collected,total:cards.length,held:cards.reduce((sum,card)=>sum+own(card.id),0),percent:cards.length?Math.round(collected/cards.length*100):0};
    }
    function banner() {
      const info=stats(),label=course()?.name||current()?.courseName||'课程道藏';
      return `<header class="dz-header"><div class="dz-brand"><span class="dz-brand-mark" aria-hidden="true">藏</span><div><small>云间灵田 · ${E(label)}</small><h2 id="daozang-title">万象道藏</h2></div></div><div class="dz-header-progress"><span>珍藏进度</span><strong>${info.collected}<small> / ${info.total||'—'}</small></strong></div><button type="button" class="daozang-close" data-cards-close data-cards-action="close" aria-label="关闭万象道藏，返回游戏">${glyph('close')}</button></header>`;
    }
    function tabs() {return `<nav class="dz-tabs" aria-label="万象道藏功能">${TABS.filter(([id])=>id!=='market'&&(id!=='study'||!!studyUI)).map(([id,label])=>`<button type="button" data-cards-action="tab" data-tab="${id}" ${tab===id?'aria-current="page"':''}>${label}${id==='collection'?`<small>${stats().collected}</small>`:''}</button>`).join('')}<span class="dz-wallet">${glyph('gem')}${money(engine.state?.stones)}<small>灵石</small></span></nav>`;}
    function unavailable() {
      const loading=!current()&&(engine.cardsLoading||localLoading);
      if(loading)return `<section class="dz-empty dz-loading" role="status"><div class="dz-seal-orbit">${glyph('book')}</div><h3>正在展开道藏</h3><p>稍候，读取课程与收藏进度…</p></section>`;
      if(engine.cardsError&&!current())return `<section class="dz-empty"><div class="dz-seal-orbit">${glyph('book')}</div><h3>道藏暂未连接</h3><p>${E(engine.cardsError)}</p>${button('reload','重新连接')}</section>`;
      return `<section class="dz-empty dz-unavailable"><div class="dz-closed-scroll">${global.spiritCardBackArt?.()||glyph('lock')}<span>${glyph('lock')}</span></div><div><span class="dz-eyebrow">静候开卷</span><h3>此课道藏暂未开放</h3><p>${current()?.unavailableReason==='course_not_ready'?'这门课程的专属卡牌还在整理中。':'当前账号尚未关联已开放道藏的课程。'}</p><p class="dz-muted">课程配置完成后，卡牌入口会在这里开放。</p><div class="dz-actions">${button('close','返回灵田','','', 'primary')}${button('reload','刷新课程')}</div></div></section>`;
    }
    function statusNotices() {
      const errors=[localError,engine.cardsError].filter(Boolean);
      let s=errors.length?`<div class="dz-notice dz-notice-error" role="alert">${E(errors[0])}${button('reload','重试')}</div>`:'';
      if(engine.pending)s+=`<div class="dz-notice" role="status">这次操作的结果正在等待确认。同步会确认原操作，不会重新抽取。${button('sync','同步进度')}</div>`;
      else if(pendingNotice)s+=`<div class="dz-notice" role="status">${E(pendingNotice)}</div>`;
      if(!engine.online&&available()){
        const choices=current()?.practiceCourses||[],edition=document.querySelector?.('meta[name="game-offline-edition"]')?.content||'离线练习';
        s+=`<div class="dz-practice-bar"><div><strong>${E(edition)}</strong><small>${current()?.memoryOnly?'当前浏览器未保存，关闭后可能丢失 · 请导出存档':'各课程卡册与每日次数独立保存 · 不连接在线课堂'}</small></div>${choices.length>1&&typeof engine.selectCardCourse==='function'?`<label><span>预览课程</span><select data-cards-practice-course aria-label="离线预览课程"${busy()||revealing||pageTurning?' disabled':''}>${choices.map(item=>`<option value="${E(item.id)}"${item.id===current()?.courseId?' selected':''}>${E(item.name)} · ${item.cardCount}张</option>`).join('')}</select></label>`:''}</div>`;
      }
      // 2026-11-19 用户：“这些内容在学生端不显示，教师控制端知道就行”——不再显示“当前教学班 · class-N · 课程由课堂名单关联”
      // 和“某学年 · 本期启用 N / M 张 · K 个章节”（老师在工作台“云间灵田 → 学年卡池”里看）；本期没有启用卡牌时，仍告诉学生拆封与参悟为什么暂停
      if(curriculum()?.source==='configured'&&!drawEnabled())s+=`<div class="dz-notice dz-curriculum-note"><small>本期暂未启用卡牌，拆封与每日参悟已暂停；已有收藏和记录保留。</small></div>`;
      return s;
    }
    function sealedPackage() {
      const art=()=>global.spiritCardPackArt?.()||global.spiritCardBackArt?.()||glyph('book');
      return `<div class="dz-sealed-shell" aria-hidden="true"><div class="dz-pack-aura"></div><div class="dz-escaping-cards">${Array.from({length:3},(_,i)=>`<i style="--card-order:${i}">${global.spiritCardBackArt?.()||''}</i>`).join('')}</div><div class="dz-wrapper-body">${art()}</div><div class="dz-wrapper-top">${art()}</div><div class="dz-pack-band"><span>封 · 藏</span></div><div class="dz-pack-label"><b>万象道藏</b><small>${E(course()?.name||'典藏密封包')}</small></div><div class="dz-pack-rift"></div><i class="dz-pack-mote m1"></i><i class="dz-pack-mote m2"></i><i class="dz-pack-mote m3"></i><i class="dz-pack-mote m4"></i></div>`;
    }
    function packImmersive(){return !embeddedMarket&&available()&&tab==='draw'&&!detailId&&!packSummary&&(fullscreenDraw&&!packResult||busyAction==='open'||packPhase==='charging'||revealing);}
    function isPackDetail(){return !!(detailId&&detailReturn?.pack&&tab==='draw'&&packResult&&!packSummary);}
    function packCinemaHeader(){return `<header class="dz-cinema-header"><div><span class="dz-eyebrow">${fullscreenDraw?'今日道藏 · 静候启封':'万象道藏 · 开卷藏真'}</span><h2 id="daozang-cinema-title">${E(course()?.name||'启封道藏')}</h2></div><button type="button" class="dz-cinema-close" data-cards-close data-cards-action="close" aria-label="收起启封浮层，返回游戏">${glyph('close')}</button></header>`;}
    function packCinemaScreen(){
      const phase=busyAction==='open'?'charging':packPhase,ready=phase==='idle';
      const remaining=asCount(current().daily?.remaining),quota=asCount(rules().dailyPacks),perPack=asCount(rules().cardsPerPack);
      const caption=ready?'今日藏真，待你亲启':phase==='ascending'?'藏卡出匣 · 万象将现':phase==='unsealing'?'金箔轻启 · 封印渐解':engine.online?'灵光汇聚 · 正在确认启封':'灵光汇聚 · 道藏凝形';
      const notice=ready?(engine.pending?'启封结果尚待确认，请同步进度。':engine.authRequired||engine.accountChanged?'登录状态已变更，请返回灵田重新连接。':localError||engine.cardsError||pendingNotice):'';
      const recovery=ready&&engine.pending?button('sync','同步进度','',!!busyAction||engine.busy,'secondary'):ready&&engine.cardsError?button('reload','重新连接','',localLoading,'secondary'):'';
      const action=ready?button('open-pack',!drawEnabled()?'本期暂未启用':remaining?'拆封道藏':'今日道藏已领完','',!drawEnabled()||!remaining||busy(),'primary'):revealing?button('skip','跳过过渡 · 揭晓首张','','','quiet'):button('open-pack','灵光凝聚中…','',true,'quiet');
      return `<section class="dz-cinema-opening" aria-label="全屏启封道藏" data-pack-notice="${!!notice}"><div class="dz-pack-stage dz-cinema-stage ${phase==='charging'?'is-opening':''}" data-pack-phase="${E(phase)}" aria-busy="${!ready}"><div class="dz-orbit dz-orbit-one"></div><div class="dz-orbit dz-orbit-two"></div><div class="dz-pack-lift">${sealedPackage()}</div><div class="dz-pack-caption"><span>一卷藏万象</span><strong>${ready&&!drawEnabled()?'本期卡牌暂未启用':caption}</strong></div><div class="dz-cinema-actions">${action}${ready&&!drawEnabled()?button('collection','翻阅全卷','','','quiet'):''}${ready?`<small class="dz-cinema-quota">今日剩余 ${remaining} / ${quota} 包 · 每包 ${perPack} 张</small>`:''}${notice?`<div class="dz-cinema-notice" role="${engine.pending?'status':'alert'}"><p>${E(notice)}</p>${recovery}</div>`:''}</div></div></section>`;
    }
    function applyPackEntrance(){
      if(!packImmersive())return;
      const window=host.querySelector('.daozang-window'),lift=host.querySelector('.dz-pack-lift');
      const elapsed=packEntrance?Math.max(0,Date.now()-packEntrance.started):1000;
      window?.style.setProperty('--pack-enter-delay',`-${elapsed}ms`);
      if(!lift||!packEntrance?.rect)return;
      const box=lift.getBoundingClientRect?.(),from=packEntrance.rect;
      if(!box?.width||!box?.height)return;
      lift.style.setProperty('--pack-from-x',`${from.left+from.width/2-box.left-box.width/2}px`);
      lift.style.setProperty('--pack-from-y',`${from.top+from.height/2-box.top-box.height/2}px`);
      lift.style.setProperty('--pack-from-scale',String(Math.max(.15,Math.min(1.2,Math.min(from.width/box.width,from.height/box.height)))));
    }
    function packPresentation() {
      const d=current(),entries=packResult.cards,total=entries.length,remaining=asCount(d.daily?.remaining),quota=asCount(rules().dailyPacks);
      if(packSummary&&revealed>=total)return `<section class="dz-pack-result is-summary" data-reveal-grade=""><div class="dz-result-title"><span class="dz-eyebrow">第 ${money(packResult.packNumber||d.totalOpened)} 卷 · 全卷已览</span><h3>三千意象，收入长卷</h3><p>本卷道藏已逐张揭晓，点按卡牌可翻面研读。</p></div><div class="dz-result-grid">${entries.map((entry,index)=>cardFace(getCard(entry.cardId),{revealIndex:index})).join('')}</div><div class="dz-result-actions">${button('pack-stack','重新逐张赏鉴')}${button('open-pack',!drawEnabled()?'本期暂未启用':remaining?'再启一卷':'今日已领完','',!drawEnabled()||!remaining||busy(),'primary')}${button('collection','查看我的卡册')}${button('draw-home','回到启封台')}</div><small class="dz-muted">今日剩余 ${remaining} / ${quota} 卷</small></section>`;
      return `<section class="dz-pack-result dz-pack-resume"><span class="dz-eyebrow">第 ${money(packResult.packNumber||d.totalOpened)} 卷 · 已揭晓 ${revealed} / ${total} 张</span><h3>这一卷，留在此处</h3><p>继续从第 ${packIndex+1} 张翻阅，卡牌已收入你的卡册。</p><div class="dz-result-actions">${button('pack-resume','继续翻阅本卷','','','primary')}${button('collection','查看我的卡册')}</div></section>`;
    }
    function drawScreen() {
      const d=current(),r=rules(),info=stats(),remaining=asCount(d.daily?.remaining),quota=asCount(r.dailyPacks),perPack=asCount(r.cardsPerPack);
      const canDraw=drawEnabled()&&remaining>0&&!busy()&&!revealing;
      if(packResult&&packResult.courseId===d.courseId&&!['unsealing','ascending'].includes(packPhase))return packPresentation();
      const phase=busyAction==='open'?'charging':packPhase;
      const status=phase==='charging'?'封印共鸣 · '+(engine.online?'正在确认本次启封':'正在凝聚道藏'):phase==='unsealing'?'封条已解 · 灵光初现':phase==='ascending'?'藏卡出匣 · 即将揭晓':'密封典藏 · 每包 '+perPack+' 张';
      return `<section class="dz-draw-layout"><div class="dz-draw-copy"><span class="dz-eyebrow">${E(course().name)} · ${course().chapters.length} 卷藏真</span><h3>破一重封印<br><em>藏一卷万象</em></h3><p>金箔封口，玉纹藏真。拆开今日密封卡包，让教材里的概念化作一张张珍藏。</p><div class="dz-collection-progress"><span>已发现 <strong>${info.collected}</strong> / ${info.total} 张</span><span>${info.percent}%</span><progress value="${info.collected}" max="${Math.max(1,info.total)}" aria-label="道藏发现进度"></progress></div>${button('collection','翻阅理论卡册 '+glyph('chevron'),'','', 'quiet')}<small class="dz-study-note">尚未抽到的知识点，也可直接研读。</small></div>
      <div class="dz-pack-stage ${busyAction==='open'?'is-opening':''}" data-pack-phase="${E(phase)}" aria-busy="${busyAction==='open'||revealing}"><div class="dz-orbit dz-orbit-one"></div><div class="dz-orbit dz-orbit-two"></div>${sealedPackage()}<div class="dz-pack-caption">${status}</div>${revealing?button('skip','跳过过渡 · 揭晓首张','','','primary'):button('open-pack',busyAction==='open'?'灵光凝聚中…':!drawEnabled()?'本期暂未启用':remaining?'拆封道藏':'今日道藏已领完','',!canDraw,'primary')}<small>今日 ${remaining} / ${quota} 包 · 北京时间 00:00 恢复</small></div>
      <aside class="dz-draw-summary">${['charging','unsealing','ascending'].includes(phase)?'<div class="dz-sealed-promise"><span>封中藏万象</span><strong>静候<br>开卷</strong><p>珍藏尚未揭晓<br>惊喜留在下一页</p></div>':`<div class="dz-guarantee"><span>长卷赐珍</span><strong>${money(d.nextGuaranteeIn)}<small>卷后</small></strong><p>${drawEnabled()?`至少获得一张${E(rarity(r.guaranteeMinimumRarity||'SR').name)} ${E(r.guaranteeMinimumRarity||'SR')} 以上卡牌`:'本期卡池暂停，启封次数保留'}</p></div><div class="dz-grade-list">${(catalogue().rarities||[]).map(g=>{const count=all().filter(c=>c.rarity===g.id&&known(c.id)).length,total=all().filter(c=>c.rarity===g.id).length;return `<div data-rarity="${E(g.id)}"><span class="dz-grade-list-code">${E(g.id)}</span><span>${E(g.name)}</span><b>${count}<small> / ${total}</small></b></div>`;}).join('')}</div><small class="dz-muted">每日免费启封<br>收藏与游戏修为相互独立</small>`}</aside></section>`;
    }
    function filteredCards() {return all().filter(card=>(filter.owned==='all'||filter.owned==='teaching'&&enabled(card.id)||filter.owned==='owned'&&known(card.id))&&(filter.chapter==='all'||card.chapterId===filter.chapter)&&(filter.rarity==='all'||card.rarity===filter.rarity)&&(!filter.search||[card.title,card.subtitle,card.definition].join(' ').toLowerCase().includes(filter.search.toLowerCase()))).sort((a,b)=>rarity(b.rarity).rank-rarity(a.rarity).rank||a.id.localeCompare(b.id));}
    function collectionScreen() {
      const matches=filteredCards(),size=24,pages=Math.max(1,Math.ceil(matches.length/size));filter.page=Math.min(filter.page,pages-1);
      const cards=matches.slice(filter.page*size,(filter.page+1)*size);
      const pausedScope=!drawEnabled()&&filter.owned!=='all';
      const emptyTitle=pausedScope?'本期卡牌暂未启用':filter.owned==='owned'?'这里还没有珍藏':'暂未找到这张道藏';
      const emptyMessage=pausedScope?'老师启用章节后，这里会显示本期卡牌。现在仍可翻阅全卷，旧藏和学习记录都已保留。':filter.owned==='owned'?'先启封今日道藏，或切换“全卷”自由研读。':'试试更短的关键词，或调整章节和品阶。';
      const emptyAction=pausedScope?'reset-filter':filter.owned==='owned'?'draw-home':'reset-filter';
      const emptyLabel=pausedScope?'翻阅全卷':filter.owned==='owned'?'前往启封':'清空筛选';
      return `<section class="dz-collection">${pickBanner()}<div class="dz-section-title"><div><span class="dz-eyebrow">一册尽览 · 方寸藏真</span><h3>我的万象长卷</h3></div><div class="dz-segments" role="group" aria-label="卡册范围">${(curriculum()?.source==='configured'?[['teaching','本期'],['all','全卷'],['owned','已藏']]:[['all','全卷'],['owned','已藏']]).map(([id,title])=>`<button type="button" data-cards-action="owned-filter" data-value="${id}" aria-pressed="${filter.owned===id}">${title}</button>`).join('')}</div></div><div class="dz-filters"><label class="dz-search">${glyph('search')}<input type="search" data-cards-filter="search" value="${E(filter.search)}" placeholder="搜索概念或定义" aria-label="搜索卡牌概念或定义" maxlength="60"></label><label><span class="dz-sr-only">按章节筛选</span><select data-cards-filter="chapter" aria-label="按章节筛选"><option value="all">全部章节</option>${course().chapters.filter(ch=>filter.owned!=='teaching'||curriculum()?.enabledChapterIds?.includes(ch.id)).map(ch=>`<option value="${E(ch.id)}"${filter.chapter===ch.id?' selected':''}>${E(chapterLabel(ch))}</option>`).join('')}</select></label><label><span class="dz-sr-only">按品阶筛选</span><select data-cards-filter="rarity" aria-label="按品阶筛选"><option value="all">全部品阶</option>${catalogue().rarities.map(g=>`<option value="${E(g.id)}"${filter.rarity===g.id?' selected':''}>${E(g.name)} · ${E(g.id)}</option>`).join('')}</select></label></div><div class="dz-list-caption"><span>${matches.length} 张理论卡 · 品阶从高到低</span><small>灰白为未藏 · 均可翻面研读</small></div>${cards.length?`<div class="dz-card-grid">${cards.map(card=>cardFace(card)).join('')}</div>`:`<div class="dz-empty dz-empty-small"><div class="dz-seal-orbit">${glyph('book')}</div><h3>${emptyTitle}</h3><p>${emptyMessage}</p>${button(emptyAction,emptyLabel)}</div>`}${pages>1?`<nav class="dz-pagination" aria-label="卡册分页">${button('collection-prev','上一页','',filter.page===0)}<span>${filter.page+1} / ${pages}</span>${button('collection-next','下一页','',filter.page>=pages-1)}</nav>`:''}${pickPromptMarkup()}</section>`;
    }
    function pickBanner(){
      if(!pickDisplay)return '';
      return `<div class="dz-pick-banner" role="status"><span>${glyph('book')}挑一张放进陈列架：点卡牌就会问你要不要放入。</span>${button('pick-cancel','不挑了','',false,'quiet')}</div>`;
    }
    function pickPromptMarkup(){
      if(!pickPrompt)return '';
      const card=getCard(pickPrompt.id);if(!card)return '';
      const st=studyUI?.displayStatus?.(card.id)||{owned:true},name=E(card.title);
      let text,actions;
      if(st.displayed){text=`《${name}》已经在陈列架上了。`;actions=button('pick-no','好','',false,'primary');}
      else if(!st.owned){text=`还没有收藏《${name}》，收藏以后才能放进陈列架。`;actions=button('pick-view','先看看这张卡')+button('pick-no','取消','',false,'quiet');}
      else if(st.full){text='陈列架已经摆满三张，先回参悟页收起一张再换入。';actions=button('pick-no','好','',false,'primary');}
      else{text=`把《${name}》放入陈列架？`;actions=button('pick-yes',pickBusy?'正在放入…':'放入陈列架','',pickBusy,'primary')+button('pick-view','先看看这张卡','',pickBusy)+button('pick-no','取消','',pickBusy,'quiet');}
      return `<div class="dz-pick-layer" data-cards-action="pick-no" aria-hidden="true"></div><section class="dz-pick-dialog" role="dialog" aria-modal="true" aria-labelledby="dz-pick-title"><span class="dz-eyebrow">放入陈列架</span><h4 id="dz-pick-title">${name}</h4><p>${text}</p>${pickError?`<p class="dz-pick-error" role="alert">${E(pickError)}</p>`:''}<div class="dz-pick-actions">${actions}</div></section>`;
    }
    function listingName(listing) {return getCard(listing.cardId)?.title||'未知道藏';}
    function timeLabel(value) {try{return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return '—';}}
    function inlineConfirmation() {
      if(!confirmation)return '';
      const {type}=confirmation;
      if(type==='list') {
        const card=getCard(confirmation.cardId);if(!card)return '';
        const q=confirmation.quantity,price=confirmation.price,fee=Math.max(trading().minimumFee||1,Math.ceil(q*price*(trading().feePercent||3)/100));
        return `<section class="dz-confirm" role="region" aria-label="确认挂牌"><h4>确认挂牌 · ${E(card.title)}</h4><p>${q} 张，每张 <strong>${money(price)}</strong> 灵石。挂牌后卡牌暂时冻结，未成交可撤回。</p><small>若本次数量一次成交：总额 ${money(q*price)}，卖家手续费约 ${money(fee)} 灵石；分次成交分别计费。</small><div class="dz-actions">${button('confirm-list','确认挂牌','',busy(),'primary')}${button('dismiss-confirm','返回修改','',busy())}</div></section>`;
      }
      const listing=[...(current()?.market?.listings||[]),...(current()?.market?.myListings||[])].find(x=>x.id===confirmation.id);
      if(!listing)return '';
      if(type==='cancel')return `<section class="dz-confirm" role="region" aria-label="确认撤回"><h4>撤回 ${E(listingName(listing))}</h4><p>未成交的 ${listing.remaining} 张卡牌将回到卡册。</p><div class="dz-actions">${button('confirm-cancel','确认撤回','',busy(),'primary')}${button('dismiss-confirm','保留挂牌','',busy())}</div></section>`;
      return `<section class="dz-confirm" role="region" aria-label="确认购入"><h4>购入 ${E(listingName(listing))}</h4><p>来自 ${E(listing.sellerAlias||'道友')} · 每张 ${money(listing.price)} 灵石</p><label class="dz-buy-quantity">购入数量 <input type="number" min="1" max="${listing.remaining}" step="1" inputmode="numeric" data-cards-draft="buyQuantity" value="${E(confirmation.quantity)}" aria-label="购入数量"></label><p class="dz-confirm-total">合计 <strong data-cards-buy-total>${money(listing.price*Number(confirmation.quantity))}</strong> 灵石</p><div class="dz-actions">${button('confirm-buy','确认购入','',busy(),'primary')}${button('dismiss-confirm','再看看','',busy())}</div></section>`;
    }
    function marketHistory() {
      const h=current()?.market?.history;
      return engine.online&&marketCard&&h?.cardId===marketCard&&h?.courseId===current()?.courseId&&h?.interval===marketInterval?h:null;
    }
    function marketChartOptions() {return {title:marketCard?(getCard(marketCard)?.title||'当前道藏')+' · 成交走势':'道藏成交走势',interval:marketInterval,unit:'张',selectedTime:marketSelectedTime,loading:!!marketCard&&!!(engine.cardsLoading||localLoading),disabled:!marketCard||!engine.online,
      emptyTitle:!engine.online?'离线练习不连接行情':!marketCard?'先选择一张道藏':'尚未形成成交K线',
      emptyMessage:!engine.online?'在线课程坊市成交后，才会形成这张卡牌的价格走势。':!marketCard?'每张卡牌单独记录价格。请在上方选择卡牌，查看它的真实成交走势。':'这张卡牌成交后会生成K线；挂牌和撤回不改变成交走势。'};}
    function marketChartMarkup() {return global.SpiritMarketChart?`<div data-cards-chart>${global.SpiritMarketChart.markup(marketHistory(),marketChartOptions())}</div>`:'';}
    function bindMarketChart() {const node=host.querySelector('[data-cards-chart]');if(!node||!global.SpiritMarketChart)return;chartDispose=global.SpiritMarketChart.bind(node,marketHistory(),{...marketChartOptions(),onSelect:value=>{marketSelectedTime=value;},onInterval:value=>{if(value===marketInterval)return;marketInterval=value;marketSelectedTime=null;void load({cardId:marketCard||undefined,page:marketPage});}});}
    function marketScreen() {
      const d=current(),m=d.market||{},ownCards=teachingCards().filter(c=>own(c.id)>0),tr=trading();
      const mine=(m.myListings||[]).filter(l=>l.status==='open');
      const row=listing=>{const card=getCard(listing.cardId);return `<article class="dz-market-item"><button type="button" class="dz-market-portrait" data-cards-action="detail" data-card-id="${E(listing.cardId)}" aria-label="研读${E(card?.title||'卡牌')}">${global.spiritCardArt?.(card)||glyph('book')}</button><div class="dz-market-name"><span class="dz-rarity-chip" data-rarity="${E(card?.rarity||'C')}"><b>${E(card?.rarity||'C')}</b> ${E(rarity(card?.rarity||'C').name)}</span><h4>${E(card?.title||'道藏')}</h4><small>${E(listing.sellerAlias||'道友')} · 余 ${listing.remaining} 张</small></div><div class="dz-market-price"><strong>${money(listing.price)}</strong><small>灵石 / 张</small></div>${listing.mine?`<span class="dz-own-label">我的挂牌</span>`:button('prepare-buy','购入',attr('listing-id',listing.id),busy()||!engine.online||listing.remaining<1)}</article>`;};
      return `<section class="dz-market"><div class="dz-section-title"><div><span class="dz-eyebrow">道友结缘 · 珍藏流转</span><h3>${embeddedMarket?'道藏':'道藏坊市'}</h3></div>${button('refresh-market','刷新挂牌','',!!engine.cardsLoading)}</div>${!engine.online?'<div class="dz-notice">离线练习不连接道友。联网并关联课程后，可用灵石交易卡牌。</div>':''}<div class="dz-market-layout"><div class="dz-market-main"><div class="dz-market-toolbar"><label>寻找道藏 <select data-cards-market-filter aria-label="按卡牌筛选坊市"><option value="">全部卡牌</option>${teachingCards().map(c=>`<option value="${E(c.id)}"${marketCard===c.id?' selected':''}>${E(c.title)}</option>`).join('')}</select></label><span>${asCount(m.total)} 笔挂牌</span></div>${marketChartMarkup()}${confirmation?.type!=='list'?inlineConfirmation():''}<div class="dz-market-list">${(m.listings||[]).length?m.listings.map(row).join(''):`<div class="dz-empty dz-empty-small"><div class="dz-seal-orbit">${glyph('gem')}</div><h3>静候道友挂出珍藏</h3><p>暂时没有${marketCard?'这张卡牌的':'可购入的'}挂牌。你也可以把手中的重复卡放到坊市。</p></div>`}</div>${marketPage||m.hasMore?`<nav class="dz-pagination" aria-label="坊市分页">${button('market-prev','上一页','',marketPage===0||!!engine.cardsLoading)}<span>第 ${marketPage+1} 页</span>${button('market-next','下一页','',!m.hasMore||!!engine.cardsLoading)}</nav>`:''}</div><aside class="dz-market-side"><section class="dz-listing-form"><h4>挂出我的道藏</h4><label>选择卡牌<select data-cards-draft="cardId" aria-label="选择要挂牌的卡牌"${!ownCards.length?' disabled':''}>${ownCards.length?ownCards.map(c=>`<option value="${E(c.id)}"${listingDraft.cardId===c.id?' selected':''}>${E(c.title)} · 可用 ${own(c.id)} 张</option>`).join(''):'<option>还没有可挂牌的卡牌</option>'}</select></label><div class="dz-form-row"><label>单价<input type="number" min="${tr.minimumPrice||1}" max="${tr.maximumPrice||1000000}" step="1" inputmode="numeric" data-cards-draft="price" value="${E(listingDraft.price)}" placeholder="灵石 / 张" aria-label="挂牌单价"></label><label>数量<input type="number" min="1" max="${Math.min(own(listingDraft.cardId),tr.maximumQuantity||99)}" step="1" inputmode="numeric" data-cards-draft="quantity" value="${E(listingDraft.quantity)}" aria-label="挂牌数量"></label></div><small>可用 ${own(listingDraft.cardId)} 张 · 当前 ${mine.length} / ${tr.maximumOpenListings||10} 笔挂牌</small>${button('prepare-list','确认价格并挂牌','',busy()||!engine.online||!ownCards.length,'primary')}${confirmation?.type==='list'?inlineConfirmation():''}<p class="dz-market-rules">有效期 ${tr.validityHours||24} 小时 · 卖家手续费 ${tr.feePercent||3}%（每笔至少 ${tr.minimumFee||1} 灵石）</p></section><section class="dz-my-listings"><h4>我的在售 <span>${mine.length}</span></h4>${mine.length?mine.map(l=>`<article><div><strong>${E(listingName(l))}</strong><span>${money(l.price)} 灵石 · 余 ${l.remaining} 张</span><small>${E(timeLabel(l.expiresAt))} 到期</small></div>${button('prepare-cancel','撤回',attr('listing-id',l.id),busy()||!engine.online)}</article>`).join(''):'<p class="dz-muted">尚无在售道藏</p>'}</section></aside></div></section>`;
    }
    function guideScreen() {
      const r=rules(),grades=catalogue().rarities||[],odds=r.rarityOdds||{};
      return `<section class="dz-guide"><div class="dz-section-title"><div><span class="dz-eyebrow">开卷有益 · 收藏有序</span><h3>道藏修习手册</h3></div></div><div class="dz-guide-grid"><article><b>一</b><h4>每日启封</h4><p>每天可免费启封 ${asCount(r.dailyPacks)} 卷，每卷 ${asCount(r.cardsPerPack)} 张卡。额度在北京时间 00:00 恢复，不消耗灵石。</p></article><article><b>二</b><h4>翻牌研读</h4><p>点按卡牌可读定义、要点、例子与教材出处。卡册中的所有理论均开放阅读，尚未收藏也可学习。</p></article><article><b>三</b><h4>珍藏流转</h4><p>卡牌可在同一课程的坊市挂牌，以灵石向道友购入。未成交卡牌可撤回，卡牌交易不增加游戏修为。</p></article></div><section class="dz-odds"><h4>五阶道藏 · 公开概率</h4><div>${grades.map(g=>`<article data-rarity="${E(g.id)}"><i>✦</i><strong>${E(g.name)}</strong><span>${E(g.id)}</span><b>${Number.isFinite(odds[g.id])?odds[g.id]+'%':'—'}</b></article>`).join('')}</div><p>${drawEnabled()?`${r.selectionAdjusted?'本期只按已启用品阶重新计算概率；':'普通卡位按以上概率抽取；'}每第 ${asCount(r.guaranteeEvery)} 卷至少一张${E(rarity(r.guaranteeMinimumRarity||'SR').name)}以上卡牌。保底卡位在符合品阶的本期卡池中抽取。${r.selectionAdjusted?'若本期未选玄品及以上卡牌，保底为当前已启用的最高品阶。':''}`:'当前卡池为空，拆封暂停且不消耗次数；启用卡牌后将按本期品阶公布概率和保底。'}</p></section><section class="dz-guide-principle"><h4>品阶如何设定？</h4><p>依据教材中的理论地位、章节贯通程度与复习重点，为卡牌设置收藏品阶。这是游戏的教学编辑评级，不代表考试分值，也不表示基础概念不重要。</p><p>卡牌正文以本课程教材与“理论知识点总结”为依据。修仙名称与插图用于收藏展示，不替代原有概念。</p></section>${studyUI?'<section class="dz-guide-principle"><h4>参悟如何成长？</h4><p>在“参悟”中每天最多完成三张藏真小问，本期卡池不足三张时按实际数量安排；也可以从本期卡背自由练习。读过是初识；独立作答形成明辨；在不同日期理解并应用后进入会用；经过至少七天的再次独立温习，才会留下巩固记录。</p><p>每张卡每天至多记一次独立进步。看过提示或依据后的重试用于练习，不直接提升独立掌握。收藏品级、交易库存与个人参悟分别记录。</p><h4>长卷与庭院纪念</h4><p>一个专题全部达到会用，会点亮对应纪念；一周任选三天完成当日参悟，可获得温习明灯。到“我的珍藏”选择纪念或三张陈列卡，回到灵田即可看见。错过一天不会清空已有记录。</p><h4>与课堂相连</h4><p>课堂回响集中展示本周核心卡与个人复习册。在线宗门每人每周贡献一盏灯；授权教师可设置任课班级的核心卡并查看汇总。</p></section>':''}</section>`;
    }
    function detailScreen() {
      const card=getCard(detailId),shown=showingExhibit();if(!card||card.courseId!==current()?.courseId&&!shown){detailId=null;return collectionScreen();}
      const chapter=courseOfCard(card)?.chapters?.find(ch=>ch.id===card.chapterId),back=detailSide==='back',packReading=isPackDetail(),locked=detailTurning||detailPhase!=='ready'||pageTurning;
      return `<article class="dz-detail dz-inspection" data-pack-reader="${packReading}" data-pack-index="${packIndex}" data-pack-count="${packResult?.cards.length||0}" data-page-turning="${pageTurning}" data-page-turn-phase="${pageTurnPhase}" data-page-direction="${pageDirection}" data-detail-side="${detailSide}" data-detail-phase="${detailPhase}" data-detail-turning="${detailTurning}" aria-label="${E(card.title)} · 放大赏鉴"><div class="dz-detail-top"><div class="dz-inspect-heading"><span class="dz-eyebrow">${shown?'道友陈列':'万象道藏'} · ${back?'藏真一面':'万象一面'}</span><span>${E(shown?exhibit.owner+' 的藏真书案':chapter?.title||'')}</span></div><button type="button" class="dz-inspect-close" data-cards-action="detail-back" aria-label="收起卡牌，返回${inspectionOnly&&inspectReturn?inspectReturn:inspectionOnly||detailReturn?.tab==='market'?'坊市':detailReturn?.tab==='draw'?'启封':'卡册'}">${glyph('close')}</button></div><div class="dz-inspect-stage"${packReading?' data-cards-swipe aria-label="左右滑动逐张翻阅本卷道藏"':''}><div class="dz-inspect-halo" aria-hidden="true"><i></i><i></i><span>✦</span></div><div class="dz-inspect-zoom"><div class="dz-inspect-float"><div class="dz-inspect-rotor ${detailTurning?'is-turning':''}" data-detail-side="${detailSide}"><div class="dz-inspect-face dz-inspect-front" aria-hidden="${back}"${back?' inert':''}>${cardFace(card,{count:false,action:'detail-flip'})}</div><div class="dz-inspect-face dz-inspect-back" aria-hidden="${!back}"${!back?' inert':''}><div class="dz-theory-back" data-cards-action="detail-exit" data-rarity="${E(card.rarity)}"><header class="dz-back-heading"><div><span class="dz-eyebrow">藏真玉简 · ${E(card.subtitle||'万象道藏')}</span><h3 data-fit-card-title><span class="dz-title-text">${E(card.title)}</span></h3></div>${gradeBadge(card.rarity)}</header><div class="dz-back-scroll dz-theory" tabindex="0" role="region" aria-label="${E(card.title)}的理论知识点">${shown?'':studyUI?.readingLead(card.id)||''}<section class="dz-definition"><h4>概念定义</h4><p>${E(card.definition)}</p></section><section><h4>掌握要点</h4><ol>${(card.keyPoints||[]).map(point=>`<li>${E(point)}</li>`).join('')}</ol></section>${card.example?`<section class="dz-theory-example"><h4>这样理解</h4><p>${E(card.example)}</p></section>`:''}${card.misconception?`<section class="dz-theory-contrast"><h4>辨析提醒</h4><p>${E(card.misconception)}</p></section>`:''}${shown?'':studyUI?.related(card.id)||''}<details class="dz-sources"><summary>教材出处与定位 ${glyph('chevron')}</summary>${(card.sources||[]).map(source=>`<div><strong>${E(source.document)}</strong><p>${E(source.chapter)}${source.section?' · '+E(source.section):''}</p>${source.paragraphs?.length?`<small>原文段落 ${source.paragraphs.map(p=>E(p)).join('、')}（提取定位，非页码）</small>`:''}${source.lines?.length?`<small>教材文本第 ${source.lines.map(line=>E(line)).join('—')} 行（原始阅读版定位，非页码）</small>`:''}${source.excerpt?`<blockquote>${E(source.excerpt)}</blockquote>`:''}</div>`).join('')}</details></div><footer class="dz-back-footer"><span>${E(serial(card.id))}</span><span>一面万象 · 一面藏真</span></footer></div></div></div></div></div></div>${detailControls(card,back,locked,packReading)}</article>`;
    }
    function detailNotice(){
      if(engine.accountChanged)return '登录身份已变化，请收起卡牌重新连接。';
      if(engine.authRequired)return '登录已过期，请收起卡牌重新登录。';
      if(engine.pending)return '结果待确认，收起卡牌后同步进度。';
      return localError||engine.cardsError||pendingNotice||'';
    }
    function detailControls(card,back,locked,packReading){
      const flip=button(back?(packReading?'detail-front':'detail-back'):'detail-flip',back?(packReading?'翻回卡面':'点按卡背 · 收起'):'翻阅知识','',locked,'primary','dz-inspect-flip');
      const message=detailNotice();
      if(packReading){
        const total=packResult.cards.length,last=packIndex===total-1;
        return `<div class="dz-inspect-controls"><div class="dz-pack-detail-progress" aria-live="polite"><span class="dz-eyebrow">第 ${money(packResult.packNumber||current().totalOpened)} 卷</span><div class="dz-pack-page-count"><strong>${String(packIndex+1).padStart(2,'0')}</strong><span> / ${String(total).padStart(2,'0')} 张</span></div><div class="dz-pack-dots" aria-label="已揭晓 ${revealed} 张，共 ${total} 张">${packResult.cards.map((_entry,i)=>`<i class="${i===packIndex?'is-current':i<revealed?'is-read':''}" aria-hidden="true"></i>`).join('')}</div></div>${flip}<nav class="dz-pack-detail-navigation" aria-label="本卷卡牌翻页">${button('pack-prev',glyph('back')+' 上一张','',packIndex===0||locked)}${last?button('pack-summary','本卷汇总','',locked,'primary'):button('pack-next','下一张 '+glyph('chevron'),'',locked,'primary')}</nav><p class="dz-inspect-caption"${message?' role="status"':''}>${E(message||(back?'上下滑动阅读 · 翻完可继续下一张':'点按卡面翻读 · 左右滑动切换卡牌'))}</p></div>`;
      }
      if(showingExhibit()){
        const stageName=STUDY_STAGES[exhibit.stage]||STUDY_STAGES[0],sameCourse=card.courseId===current()?.courseId,mine=sameCourse?own(card.id):0;
        const note=!sameCourse?'《'+(courseOfCard(card)?.name||'另一门课程')+'》的卡牌':mine?'你的卡册里也有 '+mine+' 张':'卡册里的理论都开放研读';
        return `<div class="dz-inspect-controls"><span class="dz-inspect-ownership">${E(exhibit.owner)} 陈列 · 参悟${E(stageName)}</span>${flip}<span class="dz-inspect-counter">${back?'02 / 02':'01 / 02'}</span><small class="dz-inspect-market-note">${E(note)}</small><p class="dz-inspect-caption">${back?'上下滑动可阅读全文':'轻触翻面 · 研读藏真'}</p></div>`;
      }
      const canSell=engine.online&&enabled(card.id)&&own(card.id)>0&&!busy(),note=message||(!engine.online?'离线练习不支持交易':!enabled(card.id)?'本期未启用 · 可继续阅读旧藏':!own(card.id)?'持有可用卡牌后可上架':'');
      return `<div class="dz-inspect-controls"><span class="dz-inspect-ownership">${own(card.id)?'珍藏 · 可用 '+own(card.id)+' 张':known(card.id)?'已收录 · 当前暂无可用':'尚未收藏 · 知识已开放'}</span>${flip}${inspectionOnly?'<span class="dz-inspect-counter">'+(back?'02 / 02':'01 / 02')+'</span>':button('sell-card','上架坊市',attr('card-id',card.id),locked||!canSell,'secondary','dz-inspect-sell')}${(!inspectionOnly||message)&&note?`<small class="dz-inspect-market-note"${message?' role="status"':''}>${E(note)}</small>`:''}<p class="dz-inspect-caption">${back?'上下滑动可阅读全文':'轻触翻面 · 研读藏真'}</p></div>`;
    }
    function fitCardTitles() {
      titleFitFrame=0;
      if(!opened||destroyed||typeof global.getComputedStyle!=='function')return;
      const titles=Array.from(host.querySelectorAll('[data-fit-card-title]'));
      // Re-read the current breakpoint's normal font before fitting. Layout
      // widths stay reliable while card zoom/flip transforms are in flight.
      titles.forEach(title=>title.style.removeProperty('font-size'));
      const fits=titles.map(title=>({title,text:title.querySelector('.dz-title-text'),width:title.clientWidth-2,font:parseFloat(global.getComputedStyle(title).fontSize)}))
        .filter(item=>item.text&&item.width>0&&Number.isFinite(item.font));
      for(const item of fits){
        const width=item.text.scrollWidth;
        if(width>item.width)item.title.style.setProperty('font-size',(Math.floor(item.font*item.width/width*10)/10)+'px');
      }
      // One bounded correction absorbs subpixel rounding and font overhang.
      for(const item of fits){
        const width=item.text.scrollWidth;
        if(width>item.width){const font=parseFloat(global.getComputedStyle(item.title).fontSize);item.title.style.setProperty('font-size',(Math.floor(font*item.width/width*10)/10)+'px');}
      }
    }
    function scheduleTitleFit(){if(!opened||destroyed||titleFitFrame||typeof global.requestAnimationFrame!=='function')return;titleFitFrame=global.requestAnimationFrame(fitCardTitles);}
    function cancelTitleFit(){if(titleFitFrame)global.cancelAnimationFrame?.(titleFitFrame);titleFitFrame=0;}
    function rememberScroll(){const body=host.querySelector('.dz-body');if(body&&!detailId)scrollPositions[tab]=body.scrollTop;}
    function cardsSignature(value,force){
      const market=tab==='market';
      if(force||!engine.online||value!==cardSnapshot||market!==cardSnapshotMarket){
        // Market quotes do not change collection pages or an open card reader.
        const visible=value&&!market?{...value,market:undefined}:value,key=JSON.stringify(visible);
        if(key!==cardSnapshotKey){cardSnapshotKey=key;cardSnapshotVersion++;}
        cardSnapshot=value;cardSnapshotMarket=market;
      }
      return cardSnapshotVersion;
    }
    function detailNodeKey(node){
      if(node.nodeType!==1)return '';
      const action=node.getAttribute('data-cards-action')||node.getAttribute('data-study-action');
      return node.id||(action?'action:'+action+':'+(node.getAttribute('data-card-id')||''):(node.getAttribute('class')||'').split(/\s+/).find(name=>name&&!name.startsWith('is-'))||'');
    }
    function sameDetailNode(current,next){return current.nodeType===next.nodeType&&(current.nodeType!==1||current.nodeName===next.nodeName&&detailNodeKey(current)===detailNodeKey(next));}
    function patchDetailNode(current,next){
      if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
      for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name)){
        if(attr.name==='style'&&(current.hasAttribute('data-fit-card-title')||current.classList.contains('dz-inspect-zoom')))continue;
        current.removeAttribute(attr.name);
      }
      for(const attr of [...next.attributes])if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
      let cursor=current.firstChild;
      for(const child of [...next.childNodes]){
        let match=cursor;while(match&&!sameDetailNode(match,child))match=match.nextSibling;
        if(!match)match=current.insertBefore(child.cloneNode(true),cursor);else if(match!==cursor)current.insertBefore(match,cursor);
        patchDetailNode(match,child);cursor=match.nextSibling;
      }
      while(cursor){const nextSibling=cursor.nextSibling;current.removeChild(cursor);cursor=nextSibling;}
    }
    function render(force=false) {
      if(!opened||destroyed)return;
      const d=current();
      if(d?.courseId!==lastCourseId){
        const initialDaily=lastCourseId===undefined&&fullscreenDraw;
        lastCourseId=d?.courseId;clearAnimations();clearDetailTurn();if(!showingExhibit())detailId=null;packResult=null;packIndex=0;packSummary=false;revealed=0;packPhase='idle';confirmation=null;fullscreenDraw=initialDaily;packEntrance=initialDaily?{rect:null,started:Date.now()}:null;
        filter={search:'',chapter:'all',rarity:'all',owned:'all',page:0};scrollPositions={};listingDraft={cardId:'',price:'',quantity:'1'};marketCard='';marketPage=0;marketSelectedTime=null;
        collectionScopeInitialized=false;
      }
      if(!collectionScopeInitialized&&d){if(curriculum()?.source==='configured')filter.owned='teaching';collectionScopeInitialized=true;}
      if(filter.owned==='teaching'&&filter.chapter!=='all'&&!curriculum()?.enabledChapterIds?.includes(filter.chapter))filter.chapter='all';
      if(initialMarketCard&&available()){const card=getCard(initialMarketCard);if(card?.courseId===d.courseId){marketCard=card.id;listingDraft.cardId=card.id;marketPage=0;}initialMarketCard='';}
      if(detailId&&getCard(detailId)?.courseId!==d?.courseId&&!showingExhibit())detailId=null;
      if(packResult&&packResult.courseId!==d?.courseId){packResult=null;clearAnimations();packPhase='idle';}
      if(tab==='market'&&available())reconcileListingDraft();
      const key=JSON.stringify([tab,detailId,detailSide,detailTurning,detailPhase,filter,cardsSignature(d,force),(tab==='market'||!d)&&!!engine.cardsLoading,!d&&localLoading,engine.cardsError,engine.pending,engine.busy,engine.authRequired,engine.accountChanged,engine.state?.stones,busyAction,packResult,revealed,revealing,packPhase,packIndex,packSummary,pageTurning,pageTurnPhase,pageDirection,animateIndex,confirmation,listingDraft,marketCard,marketPage,marketInterval,localError,pendingNotice,fullscreenDraw,studyUI?.signature(force)]);
      if(!force&&signature===key)return;signature=key;
      const activeStudyOverlay=host.querySelector('[data-study-overlay]');
      if(activeStudyOverlay&&studyUI?.isActive()){
        studyUI.updateOverlay(activeStudyOverlay);
        return;
      }
      const active=document.activeElement,focusAttribute=host.contains(active)?['data-cards-filter','data-cards-draft','data-cards-market-filter'].find(name=>active?.hasAttribute?.(name)):null;
      const studySearchFocused=host.contains(active)&&active?.hasAttribute?.('data-study-search'),studySearchSelection=studySearchFocused?[active.selectionStart,active.selectionEnd]:null;
      const studyField=host.contains(active)?['data-study-teacher-card','data-study-teacher-class','data-study-filter'].find(name=>active?.hasAttribute?.(name)):null,studyFieldValue=active?.value;
      const focusKey=focusAttribute?active.getAttribute(focusAttribute):null,selection=focusAttribute&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd]:null;
      const studyFocusAction=host.contains(active)?active?.getAttribute?.('data-study-action'):null,studyFocusChoice=active?.getAttribute?.('data-choice'),studyFocusCard=active?.getAttribute?.('data-card-id');
      const studyScroll=host.querySelector('.sy-session-content')?.scrollTop||0;
      const focusAction=host.contains(active)?active?.getAttribute?.('data-cards-action'):null;
      const chartFocused=host.contains(active)&&active?.hasAttribute?.('data-mc-chart'),chartExplained=!!host.querySelector('.mc-explainer[open]');
      const backScroll=host.querySelector('.dz-back-scroll'),detailKey=detailId?detailId+'|'+(isPackDetail()?packIndex:'single'):'';
      const existingDetail=detailKey&&renderedDetailKey===detailKey?host.querySelector('.dz-detail'):null;
      if(detailId&&backScroll&&renderedDetailKey===detailKey){detailReadScroll=backScroll.scrollTop||0;detailSourcesOpen=!!host.querySelector('.dz-sources[open]');}
      renderedDetailKey=detailKey;
      const body=host.querySelector('.dz-body'),scroll=body?.scrollTop||0;
      const immersive=packImmersive();
      let content=showingExhibit()?detailScreen():available()?detailId?detailScreen():tab==='draw'?(immersive?packCinemaScreen():drawScreen()):tab==='collection'?collectionScreen():tab==='market'?marketScreen():tab==='study'?(studyUI?.screen()||guideScreen()):guideScreen():unavailable();
      if(existingDetail&&(available()||showingExhibit())&&detailId&&typeof existingDetail.cloneNode==='function'&&!activeStudyOverlay&&!studyUI?.isActive()){
        // Keep the live reader, artwork, text selection and scroll container
        // connected while recording a read or refreshing ownership/permissions.
        const hadDetailFocus=existingDetail.contains(active);
        if(content!==detailMarkup){const next=document.createElement('div');next.innerHTML=content;patchDetailNode(existingDetail,next.firstChild);detailMarkup=content;}
        const chrome=document.createElement('div');chrome.innerHTML=banner()+tabs();
        for(const selector of ['.dz-header','.dz-tabs']){const current=host.querySelector(selector),next=chrome.querySelector(selector);if(current&&next)patchDetailNode(current,next);}
        host.removeAttribute('aria-labelledby');host.setAttribute('aria-label',getCard(detailId)?.title+' · 道藏赏鉴');
        applyDetailOrigin();scheduleTitleFit();
        if(backScroll)backScroll.scrollTop=detailReadScroll;
        if(detailSourcesOpen)host.querySelector('.dz-sources')?.setAttribute('open','');
        if(hadDetailFocus){if(existingDetail.contains(active)&&!active.disabled&&!active.closest?.('[inert]')){if(document.activeElement!==active)active.focus?.({preventScroll:true});}else host.querySelector('.dz-inspect-close')?.focus({preventScroll:true});}
        return;
      }
      detailMarkup=detailId?content:'';
      if(!detailId&&!immersive&&available()&&tab!=='study'&&tab!=='market'&&tab!=='guide')content+=studyUI?.entry()||'';
      if(!available()&&!showingExhibit()&&studyUI?.hasTeacherAccess())content=studyUI.screen();
      chartDispose?.();chartDispose=null;
      if(embeddedMarket){host.removeAttribute('aria-labelledby');host.setAttribute('aria-label','云间坊市 · 道藏');}
      else if(detailId){host.removeAttribute('aria-labelledby');host.setAttribute('aria-label',getCard(detailId)?.title+' · 道藏赏鉴');}
      else {host.removeAttribute('aria-label');host.setAttribute('aria-labelledby',immersive?'daozang-cinema-title':'daozang-title');}
      host.innerHTML=embeddedMarket?`<div class="dz-body" tabindex="-1">${statusNotices()}${content}</div>`:`<div class="dz-backdrop" data-cards-action="close"></div><div class="daozang-window" data-cards-view="${showingExhibit()?'detail':available()?(detailId?'detail':tab):'closed'}" data-pack-immersive="${immersive}" data-pack-reading="${isPackDetail()}">${banner()}${available()?tabs():''}${immersive?packCinemaHeader():''}<div class="dz-body" tabindex="-1">${detailId||immersive?'':statusNotices()}${content}</div><div class="dz-live dz-sr-only" role="status" aria-live="polite">${busyAction==='open'?'正在启封，等待确认':revealing?'封印缓缓解开，首张即将揭晓':''}</div></div>`;
      if(studyUI?.isActive()){
        host.querySelector('.daozang-window')?.setAttribute('inert','');
        host.querySelector('.daozang-window')?.setAttribute('aria-hidden','true');
        host.insertAdjacentHTML('beforeend',studyUI.overlay());
        studyUI.updateOverlay(host.querySelector('[data-study-overlay]'));
      }
      applyDetailOrigin();
      applyPackEntrance();
      scheduleTitleFit();
      bindMarketChart();
      if(chartExplained)host.querySelector('.mc-explainer')?.setAttribute('open','');
      if(chartFocused)host.querySelector('[data-mc-chart]')?.focus({preventScroll:true});
      const next=host.querySelector('.dz-body');if(next)next.scrollTop=scroll;
      if(detailId){const reader=host.querySelector('.dz-back-scroll');if(reader)reader.scrollTop=detailReadScroll;if(detailSourcesOpen)host.querySelector('.dz-sources')?.setAttribute('open','');}
      if(detailId&&!focusAttribute){const control=focusAction?host.querySelector(`[data-cards-action="${focusAction}"]:not(:disabled)`):null;if(control&&!control.closest?.('[inert]'))control.focus({preventScroll:true});}
      if(immersive&&!focusAttribute){const control=focusAction==='close'?host.querySelector('.dz-cinema-close'):focusAction?host.querySelector(`[data-cards-action="${focusAction}"]:not(:disabled)`):null;(control||host.querySelector('.dz-cinema-close'))?.focus({preventScroll:true});}
      if(studyUI?.isActive()){
        const pane=host.querySelector('.sy-session-content');if(pane)pane.scrollTop=studyScroll;
        const controls=[...host.querySelectorAll('[data-study-overlay] [data-study-action]')];
        const focus=controls.find(el=>el.dataset.studyAction===studyFocusAction&&!el.disabled&&(!studyFocusChoice||el.dataset.choice===studyFocusChoice)&&(!studyFocusCard||el.dataset.cardId===studyFocusCard));
        (focus||host.querySelector('[data-study-overlay]'))?.focus?.({preventScroll:true});
      }else if(studySearchFocused){const input=host.querySelector('[data-study-search]');input?.focus?.({preventScroll:true});if(studySearchSelection&&typeof input?.setSelectionRange==='function')try{input.setSelectionRange(...studySearchSelection);}catch{}}
      else if(studyField){const fields=[...host.querySelectorAll('['+studyField+']')],input=fields.find(el=>el.value===studyFieldValue)||fields[0];input?.focus?.({preventScroll:true});}
      else if(studyFocusAction){const control=[...host.querySelectorAll('[data-study-action]')].find(el=>el.dataset.studyAction===studyFocusAction&&(!studyFocusCard||el.dataset.cardId===studyFocusCard)&&!el.disabled&&!el.closest('[inert]'));control?.focus?.({preventScroll:true});}
      if(focusAttribute){const input=host.querySelector(`[${focusAttribute}="${focusKey}"]`);input?.focus({preventScroll:true});if(selection&&typeof input?.setSelectionRange==='function')try{input.setSelectionRange(...selection);}catch{}}
    }
    function restoreScroll(value=0){const body=host.querySelector('.dz-body');if(body)body.scrollTop=value;}
    function moveTab(value,{owned}={}) {if(value!=='collection'){pickDisplay=false;pickPrompt=null;pickError='';}if(value==='market'&&!embeddedMarket&&typeof options.onOpenMarket==='function'){options.onOpenMarket();return;}if(!TABS.some(x=>x[0]===value))return;rememberScroll();if(value!=='draw'&&(revealing||pageTurning))finishReveal();clearDetailTurn();detailId=null;confirmation=null;fullscreenDraw=false;tab=value;if(owned)filter.owned=owned;render(true);restoreScroll(scrollPositions[tab]||0);if(tab==='market')void load({cardId:marketCard||undefined,page:marketPage});if(tab==='study')void studyUI?.load();}
    async function load(parameters={}) {
      if(destroyed)return;
      localError='';localLoading=true;const request=++session;render();
      try{await engine.loadCards({...parameters,interval:marketInterval});}catch(error){if(request===session)localError=error?.message||'道藏暂未连接，请重试。';}
      if(!destroyed&&request===session){localLoading=false;render();}
    }
    function clearAnimations(){animationEpoch++;animationTimers.forEach(global.clearTimeout);animationTimers=[];revealing=false;pageTurning=false;pageTurnPhase='idle';animateIndex=-1;}
    function finishReveal(){clearAnimations();if(packResult){revealed=Math.max(1,revealed);packIndex=Math.min(packIndex,revealed-1);packPhase=packSummary?'complete':'presenting';}else{revealed=0;packPhase='idle';}}
    function warmPackArtwork(result) {
      // The server/offline engine has already confirmed these cards. Use the
      // sealed transition to fetch at most three actual pictures, without
      // attaching future faces to the UI or delaying any reveal on the network.
      if(typeof global.document?.createElement!=='function'||typeof global.spiritCardArt!=='function')return;
      try{
        const selected=[],seen=new Set(),courseId=current()?.courseId;
        if(result.courseId!==courseId)return;
        for(const entry of result.cards){
          const card=getCard(entry.cardId);
          if(!card||card.courseId!==courseId||seen.has(card.id))continue;
          seen.add(card.id);selected.push(card);
          if(selected.length===3)break;
        }
        if(!selected.length)return;
        const tray=global.document.createElement('div');
        tray.innerHTML=selected.map(card=>global.spiritCardArt(card)).join('');
        Array.from(tray.querySelectorAll('img')).slice(0,3).forEach(image=>{
          image.loading='eager';
          try{if(typeof image.decode==='function')void Promise.resolve(image.decode()).catch(()=>{});}catch(_){}
        });
      }catch(_){}
    }
    function showPack(result) {
      clearAnimations();packResult={...result,cards:result.cards.map((entry,index)=>({...entry,originalIndex:index})).sort((a,b)=>rarity(getCard(a.cardId)?.rarity).rank-rarity(getCard(b.cardId)?.rarity).rank||a.originalIndex-b.originalIndex)};
      warmPackArtwork(packResult);
      packIndex=0;packSummary=false;revealed=reduced()||!opened?1:0;revealing=revealed===0;packPhase=revealing?'unsealing':'presenting';
      if(revealing){
        const epoch=animationEpoch,presentation=packResult;
        const later=(delay,action)=>animationTimers.push(global.setTimeout(()=>{if(destroyed||!opened||epoch!==animationEpoch||packResult!==presentation||presentation.courseId!==current()?.courseId)return;action();render();},delay));
        later(1700,()=>{packPhase='ascending';});
        later(3400,()=>{revealed=1;revealing=false;packPhase='presenting';openPackDetail();});
      }
      if(!revealing&&opened)openPackDetail();else {render(true);restoreScroll();}
    }
    function turnPack(direction) {
      if(!packResult||packSummary||revealing||pageTurning||detailId&&!isPackDetail()||detailId&&(detailTurning||detailPhase!=='ready'))return;
      const next=packIndex+direction;if(next<0||next>=packResult.cards.length||next>revealed)return;
      clearAnimations();packPhase='presenting';pageDirection=direction;
      const arrive=()=>{packIndex=next;revealed=Math.max(revealed,next+1);animateIndex=next;preparePackDetail();};
      if(reduced()){arrive();animateIndex=-1;render(true);restoreScroll();focusDetail();return;}
      pageTurning=true;pageTurnPhase='out';render(true);restoreScroll();
      const epoch=animationEpoch,presentation=packResult;
      const later=(delay,action,after)=>animationTimers.push(global.setTimeout(()=>{if(destroyed||!opened||epoch!==animationEpoch||packResult!==presentation)return;action();render();after?.();},delay));
      later(210,()=>{arrive();pageTurnPhase='in';});
      later(650,()=>{pageTurning=false;pageTurnPhase='idle';animateIndex=-1;},()=>host.querySelector('[data-cards-action="'+(packIndex===packResult.cards.length-1?'pack-summary':'pack-next')+'"]')?.focus({preventScroll:true}));
    }
    function resetDetailCard(id,source){
      const box=source?.getBoundingClientRect?.();detailOrigin=box&&box.width&&box.height?{x:box.left,y:box.top,width:box.width,height:box.height}:null;
      clearDetailTurn();detailId=id;detailSide='front';detailReadScroll=0;detailSourcesOpen=false;detailPointer=null;detailSuppressClick=false;renderedDetailKey='';
    }
    function preparePackDetail(){
      const card=getCard(packResult?.cards[packIndex]?.cardId);
      if(!card||card.courseId!==current()?.courseId)return false;
      inspectionOnly=false;detailReturn={tab:'draw',scroll:0,cardId:card.id,pack:true};resetDetailCard(card.id);return true;
    }
    function openPackDetail(){
      if(!opened||tab!=='draw'||!packResult||packSummary||revealing||pageTurning)return;
      if(!preparePackDetail())return;
      showDetailEntrance();
    }
    function showDetailEntrance(){
      const id=detailId;detailPhase=reduced()?'ready':'opening';render(true);restoreScroll();
      host.querySelector('[data-cards-action="detail-back"]')?.focus({preventScroll:true});
      if(detailPhase==='opening')detailPhaseTimer=global.setTimeout(()=>{detailPhaseTimer=null;if(destroyed||!opened||detailId!==id)return;detailPhase='ready';render();focusDetail();},480);else focusDetail();
    }
    function clearDetailTurn(){
      if(detailTimer!==null)global.clearTimeout(detailTimer);
      if(detailPhaseTimer!==null)global.clearTimeout(detailPhaseTimer);
      detailTimer=null;detailPhaseTimer=null;detailTurning=false;detailPhase='ready';
    }
    function applyDetailOrigin(){
      if(!detailId||!detailOrigin)return;
      const stage=host.querySelector('.dz-inspect-stage'),zoom=host.querySelector('.dz-inspect-zoom'),box=stage?.getBoundingClientRect?.();
      if(!box||!zoom?.style?.setProperty||!box.width||!box.height)return;
      const width=zoom.offsetWidth||box.width*.65,height=zoom.offsetHeight||box.height;
      zoom.style.setProperty('--inspect-origin-x',(detailOrigin.x+detailOrigin.width/2-box.left-box.width/2)+'px');
      zoom.style.setProperty('--inspect-origin-y',(detailOrigin.y+detailOrigin.height/2-box.top-box.height/2)+'px');
      zoom.style.setProperty('--inspect-origin-scale',String(Math.max(.15,Math.min(.8,Math.min(detailOrigin.width/width,detailOrigin.height/height)))));
    }
    function focusDetail(){host.querySelector(detailSide==='back'?'.dz-back-scroll':'.dz-inspect-front .dz-card')?.focus({preventScroll:true});}
    function flipDetail(to='back'){
      if(!detailId||detailTurning||pageTurning||detailPhase!=='ready'||detailSide===to||to==='front'&&!isPackDetail())return;
      if(to==='back'&&(!showingExhibit()||getCard(detailId)?.courseId===current()?.courseId))void studyUI?.recordRead(detailId,'card');
      detailSide=to;detailTurning=!reduced();detailPointer=null;detailSuppressClick=false;render(true);
      if(detailTurning){const id=detailId;detailTimer=global.setTimeout(()=>{detailTimer=null;if(destroyed||!opened||detailId!==id)return;detailTurning=false;render();focusDetail();},800);}else focusDetail();
    }
    async function run(action,operation,{allowPending=false}={}) {
      if(destroyed||busyAction||engine.busy||engine.authRequired||engine.accountChanged||engine.pending&&!allowPending)return null;busyAction=action;localError='';pendingNotice='';render();
      let result;try{result=await operation();}catch(error){localError=error?.message||'这次操作未完成，请稍后重试。';}
      busyAction='';if(destroyed)return result;
      if(result?.pending)pendingNotice='结果尚未确认，恢复连接后请同步进度。卡册以服务器保存的结果为准。';
      else if(result&&result.ok===false)localError=result.message||'操作未能完成，请重新检查。';
      render();return result;
    }
    function validateListing(draft=listingDraft) {
      const quantity=Number(draft.quantity),price=Number(draft.price),tr=trading(),card=getCard(draft.cardId);
      if(!engine.online||!available())return '课程或连接状态已变更，请重新确认挂牌。';
      if(!card||card.courseId!==current()?.courseId||own(draft.cardId)<1)return '请先选择一张自己持有的卡牌。';
      if(!enabled(draft.cardId))return '这张卡本期未启用，请重新选择可挂牌的卡牌并确认价格与数量。';
      if(!Number.isSafeInteger(price)||price<(tr.minimumPrice||1)||price>(tr.maximumPrice||1000000))return `单价应为 ${tr.minimumPrice||1} 至 ${(tr.maximumPrice||1000000).toLocaleString('zh-CN')} 的整数灵石。`;
      if(!Number.isSafeInteger(quantity)||quantity<1||quantity>Math.min(own(draft.cardId),tr.maximumQuantity||99))return '挂牌数量应为正整数，且不能超过可用卡牌数量。';
      return '';
    }
    function listingReviewContext(cardId) {return JSON.stringify([current()?.courseId,own(cardId),curriculum()||null,trading()]);}
    function validateListingConfirmation(snapshot) {
      if(confirmation!==snapshot||snapshot.cardId!==listingDraft.cardId||snapshot.price!==Number(listingDraft.price)||snapshot.quantity!==Number(listingDraft.quantity))return '挂牌内容已变更，请重新确认卡牌、价格与数量。';
      const message=validateListing(snapshot);if(message)return message;
      return snapshot.context!==listingReviewContext(snapshot.cardId)?'卡池、库存或交易规则已更新，请重新确认挂牌。':'';
    }
    function reconcileListingDraft() {
      const ownCards=teachingCards().filter(card=>own(card.id)>0);
      if(!ownCards.some(card=>card.id===listingDraft.cardId)){
        const invalidated=!!listingDraft.cardId;
        if(confirmation?.type==='list')confirmation=null;
        listingDraft={cardId:ownCards[0]?.id||'',price:'',quantity:'1'};
        if(invalidated)localError='可挂牌卡牌已更新，请重新选择卡牌、填写价格与数量并确认挂牌。';
        return;
      }
      if(confirmation?.type!=='list')return;
      const message=validateListingConfirmation(confirmation);if(!message)return;
      confirmation=null;localError=message;
      const tr=trading(),price=Number(listingDraft.price),quantity=Number(listingDraft.quantity);
      if(!Number.isSafeInteger(price)||price<(tr.minimumPrice||1)||price>(tr.maximumPrice||1000000))listingDraft.price='';
      if(!Number.isSafeInteger(quantity)||quantity<1||quantity>Math.min(own(listingDraft.cardId),tr.maximumQuantity||99))listingDraft.quantity='1';
    }
    function openDetail(id,source) {
      if(pageTurning)return;
      const card=getCard(id);if(!card||card.courseId!==current()?.courseId&&exhibit?.id!==id)return;
      if(revealing||pageTurning)finishReveal();rememberScroll();
      if(!detailId)detailReturn={tab,scroll:host.querySelector('.dz-body')?.scrollTop||0,cardId:id};
      resetDetailCard(id,source);showDetailEntrance();
    }
    function finishDetail(){
      if(inspectionOnly){inspectionOnly=false;close();return;}
      const origin=detailReturn;clearDetailTurn();detailId=null;detailOrigin=null;detailPointer=null;detailSuppressClick=false;
      if(origin?.pack){finishReveal();tab='draw';render(true);restoreScroll();host.querySelector('[data-cards-action="pack-resume"]')?.focus({preventScroll:true});return;}
      if(origin)tab=origin.tab;render(true);restoreScroll(origin?.scroll||0);
      if(origin?.cardId)host.querySelector('[data-cards-action="detail"][data-card-id="'+origin.cardId+'"]')?.focus({preventScroll:true});
    }
    function backDetail(){
      if(!detailId||detailPhase==='closing')return;
      if(isPackDetail())finishReveal();clearDetailTurn();if(reduced()){finishDetail();return;}
      detailPhase='closing';render(true);const id=detailId;
      detailPhaseTimer=global.setTimeout(()=>{detailPhaseTimer=null;if(destroyed||!opened||detailId!==id)return;finishDetail();},280);
    }
    function exitDetailFromTap(event){
      if(!detailId||detailSide!=='back'||detailTurning||pageTurning||detailPhase!=='ready')return;
      const target=event.target;
      if(target?.closest?.('a,button,input,select,textarea,summary,details'))return;
      const selection=global.getSelection?.()||document.getSelection?.();
      if(String(selection||'').trim())return;
      if(detailSuppressClick){detailSuppressClick=false;event.preventDefault?.();return;}
      if(isPackDetail())flipDetail('front');else backDetail();
    }
    async function onClick(event) {
      if(event.target?.closest?.('[data-study-action]')){await studyUI?.handleClick(event);return;}
      const target=event.target?.closest?.('[data-cards-action]');if(!target||!host.contains(target)||target.disabled)return;
      if(suppressCardClick&&target.closest?.('[data-cards-swipe]')){suppressCardClick=false;event.preventDefault?.();return;}
      const action=target.dataset.cardsAction;
      if(action==='close'){close();return;}
      if(action==='detail-back'){backDetail();return;}
      if(action==='tab'){moveTab(target.dataset.tab);return;}
      if(action==='reload'){await load();return;}
      if(action==='sync'){await run('sync',()=>engine.refresh?.(),{allowPending:true});await load({cardId:marketCard||undefined,page:marketPage});return;}
      if(!available()&&!showingExhibit())return;
      if(action==='detail'&&pickDisplay&&tab==='collection'&&!detailId&&!embeddedMarket){pickPrompt={id:target.dataset.cardId};pickError='';render(true);host.querySelector('.dz-pick-dialog .dz-button-primary, .dz-pick-dialog button')?.focus({preventScroll:true});return;}
      if(action==='pick-no'){if(pickBusy)return;const id=pickPrompt?.id;pickPrompt=null;pickError='';render(true);if(id)host.querySelector(`[data-cards-action="detail"][data-card-id="${id}"]`)?.focus({preventScroll:true});return;}
      if(action==='pick-cancel'){pickDisplay=false;pickPrompt=null;pickError='';render(true);return;}
      if(action==='pick-view'){const id=pickPrompt?.id;pickPrompt=null;pickError='';if(id)openDetail(id,target);return;}
      if(action==='pick-yes'){
        const id=pickPrompt?.id;if(!id||pickBusy)return;
        pickBusy=true;pickError='';render(true);
        let r=null;try{r=await studyUI?.addDisplay?.(id);}catch(e){r={ok:false,message:e?.message};}
        pickBusy=false;
        if(r?.ok){pickDisplay=false;pickPrompt=null;moveTab('study');return;}
        pickError=r?.message||'没能放进陈列架，请稍后再试。';render(true);return;
      }
      if(action==='detail'){if(embeddedMarket&&typeof options.onInspectCard==='function')options.onInspectCard(target.dataset.cardId);else openDetail(target.dataset.cardId,target);return;}
      if(action==='detail-flip'){if(!detailSuppressClick)flipDetail();detailSuppressClick=false;return;}
      if(action==='detail-front'){flipDetail('front');return;}
      if(action==='detail-exit'){exitDetailFromTap(event);return;}
      if(action==='pack-next'){turnPack(1);return;}
      if(action==='pack-prev'){turnPack(-1);return;}
      if(action==='pack-summary'){if(packResult&&!pageTurning&&!revealing&&!detailTurning&&detailPhase==='ready'&&revealed>=packResult.cards.length){clearAnimations();clearDetailTurn();detailId=null;detailReturn=null;packSummary=true;packPhase='complete';render(true);restoreScroll();host.querySelector('[data-cards-action="pack-stack"]')?.focus({preventScroll:true});}return;}
      if(action==='pack-stack'){if(packResult&&revealed>=packResult.cards.length){clearAnimations();packSummary=false;packIndex=0;packPhase='presenting';openPackDetail();}return;}
      if(action==='pack-resume'){openPackDetail();return;}
      if(action==='collection'){if(!drawEnabled())filter={search:'',chapter:'all',rarity:'all',owned:'all',page:0};moveTab('collection');return;}
      if(action==='draw-home'){rememberScroll();clearAnimations();clearDetailTurn();packResult=null;packIndex=0;packSummary=false;revealed=0;packPhase='idle';tab='draw';detailId=null;fullscreenDraw=false;render(true);restoreScroll();return;}
      if(action==='skip'){if(packResult){finishReveal();openPackDetail();}return;}
      if(action==='open-pack'){
        if(!drawEnabled()||asCount(current().daily?.remaining)<1||revealing||pageTurning||busy()||packResult&&!packSummary)return;
        const origin=host.querySelector('.dz-sealed-shell')?.getBoundingClientRect?.()||target.getBoundingClientRect?.();
        if(!packImmersive())packEntrance={rect:origin,started:Date.now()};packResult=null;packSummary=false;packPhase='charging';
        const courseId=current().courseId,result=await run('open',()=>engine.openCardPack());
        if(result?.ok&&result.courseId===courseId&&current()?.courseId===courseId&&Array.isArray(result.cards)&&result.cards.length&&result.cards.every(entry=>getCard(entry.cardId)?.courseId===courseId))showPack(result);
        else {packPhase='idle';if(!fullscreenDraw)packEntrance=null;render();}
        return;
      }
      if(action==='owned-filter'){filter.owned=target.dataset.value;filter.page=0;render(true);restoreScroll();return;}
      if(action==='reset-filter'){filter={search:'',chapter:'all',rarity:'all',owned:'all',page:0};render(true);return;}
      if(action==='collection-prev'||action==='collection-next'){filter.page=Math.max(0,filter.page+(action.endsWith('prev')?-1:1));render(true);restoreScroll();return;}
      if(action==='sell-card'){if(!engine.online||!enabled(target.dataset.cardId)||busy()||!own(target.dataset.cardId)||detailTurning||detailPhase!=='ready'||inspectionOnly||isPackDetail())return;if(!embeddedMarket&&typeof options.onOpenMarket==='function'){options.onOpenMarket(target.dataset.cardId);return;}listingDraft.cardId=target.dataset.cardId;listingDraft.quantity='1';moveTab('market');return;}
      if(action==='refresh-market'){await load({cardId:marketCard||undefined,page:marketPage});return;}
      if(action==='market-prev'||action==='market-next'){marketPage=Math.max(0,marketPage+(action.endsWith('prev')?-1:1));await load({cardId:marketCard||undefined,page:marketPage});restoreScroll();return;}
      if(action==='dismiss-confirm'){confirmation=null;localError='';render(true);return;}
      if(!engine.online||busy())return;
      if(action==='prepare-list'){confirmation=null;localError=validateListing();if(!localError)confirmation=Object.freeze({type:'list',cardId:listingDraft.cardId,price:Number(listingDraft.price),quantity:Number(listingDraft.quantity),context:listingReviewContext(listingDraft.cardId)});render(true);host.querySelector('.dz-confirm')?.scrollIntoView?.({block:'nearest',behavior:reduced()?'auto':'smooth'});return;}
      if(action==='prepare-buy'){const l=current().market?.listings?.find(l=>l.id===target.dataset.listingId);if(l&&!l.mine&&l.remaining>0){confirmation={type:'buy',id:l.id,quantity:'1'};render(true);host.querySelector('.dz-confirm')?.scrollIntoView?.({block:'nearest',behavior:reduced()?'auto':'smooth'});}return;}
      if(action==='prepare-cancel'){confirmation={type:'cancel',id:target.dataset.listingId};render(true);host.querySelector('.dz-confirm')?.scrollIntoView?.({block:'nearest',behavior:reduced()?'auto':'smooth'});return;}
      if(action==='confirm-list'&&confirmation?.type==='list'){
        const snapshot=confirmation,{cardId,price,quantity}=snapshot;
        localError=validateListingConfirmation(snapshot);
        if(localError){reconcileListingDraft();confirmation=null;render(true);return;}
        const result=await run('list',()=>{
          // run() renders its busy state before this callback. Refreshes may
          // revoke the review, but cannot replace or submit the reviewed offer.
          const message=validateListingConfirmation(snapshot);
          return message?{ok:false,message}:engine.listCard(cardId,price,quantity);
        });
        if(result?.ok){confirmation=null;localError='';await load({cardId:marketCard||undefined,page:marketPage});render(true);}return;
      }
      if(action==='confirm-buy'&&confirmation?.type==='buy'){
        const l=current().market?.listings?.find(l=>l.id===confirmation.id),quantity=Number(confirmation.quantity);
        if(!l||!Number.isSafeInteger(quantity)||quantity<1||quantity>l.remaining){localError='购入数量应为正整数，且不能超过剩余挂牌数量。';render();return;}
        if(quantity*l.price>asCount(engine.state?.stones)){localError='可用灵石不足，请调整购入数量。';render();return;}
        const result=await run('buy',()=>engine.buyCard(l.id,quantity));if(result?.ok){confirmation=null;await load({cardId:marketCard||undefined,page:marketPage});render(true);}return;
      }
      if(action==='confirm-cancel'&&confirmation?.type==='cancel'){
        const result=await run('cancel',()=>engine.cancelCard(confirmation.id));if(result?.ok){confirmation=null;await load({cardId:marketCard||undefined,page:marketPage});render(true);}return;
      }
    }
    function onInput(event) {
      if(studyUI?.handleInput(event))return;
      const target=event.target;if(!host.contains(target))return;
      if(target.tagName==='SELECT'?event.type==='input':event.type==='change')return;
      if(target.hasAttribute?.('data-cards-practice-course')){
        if(engine.online||typeof engine.selectCardCourse!=='function'||busy()||revealing||pageTurning)return;
        const result=engine.selectCardCourse(target.value);
        if(!result?.ok){localError=result?.message||'课程未能切换，请重试。';render(true);return;}
        clearAnimations();clearDetailTurn();packResult=null;packIndex=0;packSummary=false;revealed=0;packPhase='idle';detailId=null;confirmation=null;fullscreenDraw=false;packEntrance=null;
        filter={search:'',chapter:'all',rarity:'all',owned:'all',page:0};scrollPositions={};listingDraft={cardId:'',price:'',quantity:'1'};marketCard='';marketPage=0;marketSelectedTime=null;localError='';pendingNotice='';
        if(tab==='market')tab='draw';render(true);restoreScroll();host.querySelector('[data-cards-practice-course]')?.focus({preventScroll:true});return;
      }
      const name=target.dataset?.cardsFilter;
      if(name){filter[name]=target.value;filter.page=0;render(true);return;}
      const draft=target.dataset?.cardsDraft;
      if(draft){if(draft==='buyQuantity'&&confirmation?.type==='buy'){confirmation.quantity=target.value;const l=current()?.market?.listings?.find(l=>l.id===confirmation.id),node=host.querySelector('[data-cards-buy-total]');if(node)node.textContent=money((l?.price||0)*Number(target.value));}else if(Object.hasOwn(listingDraft,draft)){const reviewed=confirmation?.type==='list';if(draft==='cardId'&&target.value!==listingDraft.cardId)listingDraft={cardId:target.value,price:'',quantity:'1'};else listingDraft[draft]=target.value;if(reviewed)confirmation=null;if(draft==='cardId'||reviewed)render(true);}signature='';return;}
      if(target.hasAttribute?.('data-cards-market-filter')){marketCard=target.value;marketPage=0;marketSelectedTime=null;void load({cardId:marketCard||undefined,page:0});}
    }
    function onKey(event) {if(studyUI?.handleKey(event))return;if(!opened||event.defaultPrevented||document.querySelector?.('#fullscreen-orientation[open],#game-dialog[open]'))return;if(pickPrompt&&event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!pickBusy){pickPrompt=null;pickError='';render(true);}return;}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(detailId)backDetail();else if(confirmation){confirmation=null;render(true);}else close();return;}if((!detailId||isPackDetail())&&tab==='draw'&&packResult&&!packSummary&&!/^(INPUT|SELECT|TEXTAREA)$/.test(event.target?.tagName||'')&&!event.target?.closest?.('.dz-back-scroll')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();turnPack(event.key==='ArrowRight'?1:-1);}}
    function onPointerDown(event){
      if(detailId){
        if(event.button>0)return;
        detailSuppressClick=false;detailPointer={id:event.pointerId,x:event.clientX,y:event.clientY,at:Date.now(),scroll:host.querySelector('.dz-back-scroll')?.scrollTop||0,moved:false,swipe:!!(isPackDetail()&&event.target?.closest?.('[data-cards-swipe]')&&!event.target?.closest?.('a,input,select,textarea,summary,details'))};return;
      }
      const zone=event.target?.closest?.('[data-cards-swipe]');if(!zone||!host.contains(zone)||event.button>0||revealing||pageTurning)return;swipeStart={id:event.pointerId,x:event.clientX,y:event.clientY};
    }
    function onPointerMove(event){if(detailPointer&&detailPointer.id===event.pointerId&&(Math.abs(event.clientX-detailPointer.x)>8||Math.abs(event.clientY-detailPointer.y)>8))detailPointer.moved=true;}
    function onPointerUp(event){
      if(detailId){
        const start=detailPointer;detailPointer=null;if(!start||start.id!==event.pointerId)return;
        const dx=event.clientX-start.x,dy=event.clientY-start.y,scrolled=Math.abs((host.querySelector('.dz-back-scroll')?.scrollTop||0)-start.scroll)>2;
        detailSuppressClick=start.moved||Math.abs(dx)>8||Math.abs(dy)>8||Date.now()-start.at>450||scrolled;
        const selected=String(global.getSelection?.()||document.getSelection?.()||'').trim();
        if(start.swipe&&!scrolled&&!selected&&Date.now()-start.at<650&&Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.35){event.preventDefault?.();suppressCardClick=true;global.setTimeout(()=>{suppressCardClick=false;},350);turnPack(dx<0?1:-1);}return;
      }
      const start=swipeStart;swipeStart=null;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.35)return;event.preventDefault?.();suppressCardClick=true;global.setTimeout(()=>{suppressCardClick=false;},350);turnPack(dx<0?1:-1);
    }
    function onPointerCancel(){swipeStart=null;suppressCardClick=false;detailPointer=null;detailSuppressClick=!!detailId;}
    function open(nextTab='draw',{preserveMarket=false,fullscreenDraw:dailyFullscreen=false}={}) {
      if(destroyed)return;
      if(!opened)lastFocus=document.activeElement;
      inspectionOnly=false;exhibit=null;inspectReturn='';opened=true;host.hidden=false;host.classList.add('cards-host');
      if(embeddedMarket){tab='market';host.classList.add('is-market-embedded');host.setAttribute('role','region');host.removeAttribute('aria-modal');host.setAttribute('aria-label','云间坊市 · 道藏');}
      else {host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-labelledby','daozang-title');}
      if(!embeddedMarket&&TABS.some(t=>t[0]===nextTab))tab=nextTab;clearDetailTurn();detailId=null;confirmation=null;signature='';
      fullscreenDraw=!!dailyFullscreen&&!embeddedMarket&&tab==='draw';
      if(fullscreenDraw&&!packResult)packEntrance={rect:null,started:Date.now()};
      if(tab==='draw'&&packResult&&!packSummary&&!revealing&&packResult.courseId===current()?.courseId)openPackDetail();else {render();restoreScroll(scrollPositions[tab]||0);}
      if(!embeddedMarket)void studyUI?.load();
      if(!detailId)host.querySelector(packImmersive()?'.dz-cinema-close':'[data-cards-close]')?.focus({preventScroll:true});if(!preserveMarket)void load(tab==='market'?{cardId:marketCard||undefined,page:marketPage}:{});
    }
    function close({silent=false}={}) {if(!opened)return;exhibit=null;inspectReturn='';pickDisplay=false;pickPrompt=null;pickError='';studyUI?.clear();rememberScroll();opened=false;fullscreenDraw=false;packEntrance=null;cancelTitleFit();host.hidden=true;session++;finishReveal();clearDetailTurn();onPointerCancel();chartDispose?.();chartDispose=null;if(silent)return;if(typeof options.onClose==='function')options.onClose();else if(lastFocus?.isConnected!==false)lastFocus?.focus?.({preventScroll:true});}
    function dispose(){if(destroyed)return;close({silent:true});destroyed=true;session++;cancelTitleFit();titleResizeObserver?.disconnect();global.removeEventListener?.('resize',scheduleTitleFit);clearAnimations();clearDetailTurn();host.removeEventListener('click',onClick);host.removeEventListener('input',onInput);host.removeEventListener('change',onInput);host.removeEventListener('keydown',onKey);host.removeEventListener('pointerdown',onPointerDown);host.removeEventListener('pointerup',onPointerUp);host.removeEventListener('pointermove',onPointerMove);host.removeEventListener('pointercancel',onPointerCancel);host.innerHTML='';}
    host.classList.add('cards-host');host.hidden=true;host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('change',onInput);host.addEventListener('keydown',onKey);host.addEventListener('pointerdown',onPointerDown);host.addEventListener('pointerup',onPointerUp);host.addEventListener('pointermove',onPointerMove);host.addEventListener('pointercancel',onPointerCancel);
    const titleResizeObserver=typeof global.ResizeObserver==='function'?new global.ResizeObserver(scheduleTitleFit):null;
    titleResizeObserver?.observe(host);global.addEventListener?.('resize',scheduleTitleFit);document.fonts?.ready?.then(scheduleTitleFit);
    function inspectCard(id,{exhibit:info=null,returnTo=''}={}){
      if(!opened)open('collection',{preserveMarket:true});
      const card=getCard(id);
      exhibit=info&&card?{id,owner:String(info.owner||'道友').slice(0,40),stage:Math.max(0,Math.min(4,Math.floor(Number(info.stage))||0))}:null;
      inspectReturn=String(returnTo||'').slice(0,8);inspectionOnly=true;
      if(exhibit&&detailId!==id)detailId=null;
      openDetail(id);
      if(detailId!==id&&exhibit){exhibit=null;inspectReturn='';inspectionOnly=false;close();}
    }
    function selectMarketCard(id){if(busy())return false;const card=getCard(id);if(!card||card.courseId!==current()?.courseId)return false;marketCard=id;marketPage=0;marketSelectedTime=null;listingDraft.cardId=id;listingDraft.quantity='1';confirmation=null;render(true);if(opened)void load({cardId:id,page:0});return true;}
    return {open,close,isOpen:()=>opened,isBusy:busy,render,dispose,inspectCard,selectMarketCard};
  }
  global.createSpiritCardsUI=create;
})(typeof window==='undefined'?globalThis:window);
