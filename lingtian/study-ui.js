/* Daozang study: small daily sessions, visible understanding, and shared goals. */
(function(global){
  'use strict';
  const STAGES=['未研读','初识','明辨','会用','巩固'];
  const TYPES={meaning:'理解其意',distinguish:'辨清易错',apply:'试着用一下'};
  const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const count=n=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
  const list=value=>Array.isArray(value)?value:[];
  const icon=(name)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'+({
    book:'<path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1ZM12 6v14"/>',
    star:'<path d="m12 3 2.6 5.3 5.9.8-4.2 4.2 1 5.9-5.3-2.8-5.3 2.8 1-5.9L3.5 9.1l5.9-.8Z"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    lamp:'<path d="M7 6h10l2 10H5Zm5-4v4m-4-2h8M8 20h8m-4-4v4"/>',
    leaf:'<path d="M20 4C6 2 2 9 7 16S22 16 20 4ZM6 20 16 9"/>'
  }[name]||'')+'</svg>';
  const button=(action,label,attrs='',kind='secondary',disabled=false)=>'<button type="button" class="sy-button sy-button-'+kind+'" data-study-action="'+action+'" '+attrs+(disabled?' disabled':'')+'>'+label+'</button>';
  const attr=(key,value)=>'data-'+key+'="'+E(value)+'"';
  const card=id=>global.SpiritCards?.getCard?.(id);
  const bank=id=>global.SpiritStudyCourseBanks?.[id];
  const date=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}).format(new Date(value)):'稍后安排';
  function create(options){
    const engine=options.engine;
    let panel='today',challenge=null,feedback=null,choice=null,hinted=false,earnedEvidence=null,working=false,error='',notice='',dailyMode=false,epoch=0,lastCourse=null,filter='all',search='',source='study';
    let seen=new Set(),teacherClassId='',teacherCards=null,teacherMessage='',teacherBusy=false,sessionOrigin=null,lastExport=null;
    let overlayNode=null,overlayMarkup='',overlayChallenge=null;
    let signatureSnapshot,signatureClassroom,signatureCourse,signatureData='',signatureLocal='',signatureVersion=0;
    const state=()=>{const value=engine.study;return value?.courseId===engine.cards?.courseId?value:null;};
    const teacherAccess=()=>engine.study?.teacher;
    const course=()=>global.SpiritCards?.getCourse?.(engine.cards?.courseId);
    const content=()=>bank(course()?.id);
    const progress=id=>state()?.cards?.[id]||{};
    const enabled=id=>{const ids=engine.cards?.curriculum?.cardIds||state()?.enabledCardIds;return !Array.isArray(ids)||ids.includes(id);};
    const stage=id=>Math.min(4,count(progress(id).stage));
    const blocked=()=>working||engine.busy||engine.pending||engine.authRequired||engine.accountChanged;
    const change=()=>options.onChange?.();
    const owns=id=>count(engine.cards?.inventory?.[id])>0||list(engine.cards?.discovered).includes(id);
    function resetForCourse(){
      const next=engine.cards?.courseId;
      if(next!==lastCourse){lastCourse=next;epoch++;challenge=null;feedback=null;choice=null;hinted=false;earnedEvidence=null;working=false;error='';notice='';search='';filter='all';teacherCards=null;teacherClassId='';teacherMessage='';if(lastExport)URL.revokeObjectURL(lastExport.url);lastExport=null;}
      if(challenge&&!enabled(challenge.cardId)){epoch++;challenge=null;feedback=null;choice=null;hinted=false;earnedEvidence=null;working=false;notice='授课范围已更新；已有参悟记录保留，请选择本期卡牌继续。';}
    }
    function signature(force=false){
      resetForCourse();const snapshot=engine.study,courseId=engine.cards?.courseId,s=snapshot?.courseId===courseId?snapshot:null,classroom=engine.studyClassroom;
      // Online hydration replaces snapshots. Compare their contents once, then
      // keep idle ticks from serializing every card record twice. Offline views
      // remain content-checked because their getters also advance daily state.
      if(force||!engine.online||snapshot!==signatureSnapshot||classroom!==signatureClassroom||courseId!==signatureCourse){
        const data=JSON.stringify([s?.available,s?.updatedAt,s?.revision,s?.courseId,s?.daily,s?.week,s?.cards,s?.wishes,s?.displayCards,s?.topics,s?.rewards,s?.focus,s?.sect,s?.metrics,s?.activeChallenge,s?.curriculum,s?.enabledCardIds,snapshot?.teacher,classroom]);
        if(data!==signatureData){signatureData=data;signatureVersion++;}
        signatureSnapshot=snapshot;signatureClassroom=classroom;signatureCourse=courseId;
      }
      const local=JSON.stringify([!s?.available&&!!engine.studyLoading,engine.studyError,panel,challenge,feedback,choice,hinted,earnedEvidence,working,error,notice,filter,search,teacherClassId,teacherCards,teacherMessage,teacherBusy,lastExport]);
      if(local!==signatureLocal){signatureLocal=local;signatureVersion++;}
      return signatureVersion;
    }
    function stageMarkup(id,small=false){
      const value=stage(id);
      return '<span class="sy-stage '+(small?'is-small ':'')+'sy-stage-'+value+'" aria-label="个人参悟：'+STAGES[value]+'"><i aria-hidden="true">'+(value===4?'悟':value?'习':'·')+'</i>'+STAGES[value]+'</span>';
    }
    function stamp(id){
      const value=stage(id);if(!value)return '';
      return '<span class="sy-card-stamp sy-stamp-'+value+'" aria-label="个人参悟 '+STAGES[value]+'">'+STAGES[value]+'</span>';
    }
    function cardImage(id){
      const c=card(id);return c?global.spiritCardArt?.(c)||icon('book'):icon('book');
    }
    function title(id){return card(id)?.title||'课程道藏';}
    function mini(id,{action='read',meta='',tail=''}={}){
      const c=card(id);if(!c)return '';
      return '<article class="sy-mini"><button class="sy-mini-read" data-study-action="'+action+'" '+attr('card-id',id)+' aria-label="研读'+E(c.title)+'"><span class="sy-mini-art">'+cardImage(id)+'</span><span><small>'+E(c.subtitle||'藏真一面')+'</small><strong>'+E(c.title)+'</strong><em>'+E(meta||STAGES[stage(id)])+'</em></span></button>'+tail+'</article>';
    }
    function getReason(id,index){
      const reasons=state()?.daily?.reasons;
      const r=Array.isArray(reasons)?reasons[index]:reasons?.[id];
      return typeof r==='string'?({new:'读懂一个新概念',mistake:'辨清一个易错点',due:'温习一张旧卡',focus:'本周核心概念',review:'再见一张熟悉的卡',choice:'换一张，读点新意'}[r]||r):r?.label||['读懂一个新概念','辨清一个易错点','温习一张旧卡'][index%3];
    }
    function noticeMarkup(showExport=false){
      let text=error||engine.studyError;
      if(engine.pending)text='这次研习结果正在确认，请先同步进度。';
      if(engine.accountChanged||engine.authRequired)text=(!engine.accountChanged&&engine.blockedReason)||'登录状态已变化，请返回灵田重新连接。';
      const memory=state()?.memoryOnly?'<p class="sy-muted sy-memory">当前记录仅保留在本次运行，建议导出完整练习存档。</p>':'';
      return (text?'<div class="sy-notice" role="alert"><p>'+E(text)+'</p>'+button(engine.pending?'sync':'reload',engine.pending?'同步进度':'重新读取')+'</div>':notice?'<p class="sy-notice sy-success" role="status">'+E(notice)+'</p>':'')+(showExport&&lastExport?'<p class="sy-export-ready"><a class="sy-button sy-button-secondary" data-study-download href="'+E(lastExport.url)+'" download="'+E(lastExport.name)+'">保存'+E(lastExport.title)+'</a><small>下载后可直接阅读，也可打印为 PDF。</small></p>':'')+memory;
    }
    function entry(){
      if(!content()||!engine.loadStudy)return '';
      const d=state()?.daily,n=list(d?.completedIds).length,total=d?list(d.cardIds).length:3,paused=d?.paused;
      return '<section class="sy-entry"><span class="sy-entry-mark">'+icon(d?.complete?'check':'book')+'</span><div><strong>'+(paused?'本期参悟暂未启用':d?.complete?'今日参悟已完成':'今日参悟 · '+(total===3?'三':total)+'张藏真')+'</strong><p>'+(paused?'已有卡牌与参悟记录保留，仍可翻阅。':d?.complete?'把今天读懂的关系，留在心里。':total===3?'一张新意，一处辨析，一次温习。':'按本期授课范围，慢慢读懂这'+total+'张卡。')+'</p></div>'+button('open',''+(paused||d?.complete?'看看成长':'开始参悟')+' <small>'+n+' / '+total+'</small>','','primary')+'</section>';
    }
    function readingLead(id){
      const item=content()?.cards?.[id];if(!item||!engine.loadStudy)return '';
      const s=state(),p=progress(id),w=list(s?.wishes).includes(id),show=list(s?.displayCards).includes(id);
      return '<section class="sy-reading-lead" data-study-reading><div class="sy-reading-top">'+stageMarkup(id)+'<small>收藏品级与个人参悟分别记录</small></div><h4>这一张，先弄懂</h4><p>'+E(item.hook)+'</p><div class="sy-reading-actions">'+button('practice',enabled(id)?'试着用一下 '+icon('arrow'):'本期未启用',attr('card-id',id),'primary',!enabled(id))+button('wish',icon('star')+(w?'已记心愿':'记为心愿'),attr('card-id',id)+' aria-pressed="'+w+'"','quiet')+button('display',show?'已陈列':'放入陈列架',attr('card-id',id)+' aria-pressed="'+show+'"','quiet')+'</div>'+(p.nextReviewAt?'<small class="sy-muted">下次温习建议：'+E(date(p.nextReviewAt))+' · 随时可以主动研习</small>':'')+(error||notice||engine.studyError||engine.pending?noticeMarkup():'')+'</section>';
    }
    function related(id){
      const ids=list(content()?.cards?.[id]?.related).filter(v=>card(v)?.courseId===course()?.id&&enabled(v)).slice(0,3);
      if(!ids.length)return '';
      return '<section class="sy-related"><h4>再看一层联系</h4><p>把相邻的概念放在一起理解。</p><div>'+ids.map(v=>button('read',E(title(v))+icon('arrow'),attr('card-id',v),'quiet')).join('')+'</div></section>';
    }
    function today(){
      const s=state(),d=s.daily||{},ids=list(d.cardIds),done=list(d.completedIds),w=s.week||{},days=list(w.completedDays);
      if(d.paused)return '<section class="sy-today"><div class="sy-hero"><div><span class="sy-eyebrow">授课安排</span><h3>本期卡牌暂未启用</h3><p>老师启用章节后，会为你安排每日参悟。已有收藏、学习记录和庭院纪念都已保留。</p><div class="sy-hero-actions">'+button('browse','翻阅已有卡册','','primary')+button('return-garden','回到灵田','','quiet')+'</div></div></div></section>';
      const total=ids.length;
      const resume=s.activeChallenge&&!s.activeChallenge.resolved?s.activeChallenge:null;
      return '<section class="sy-today"><div class="sy-hero"><div><span class="sy-eyebrow">今日参悟 · 留三分钟给自己</span><h3>'+(d.complete?(total===3?'今日三签，已入心田':'今日参悟，已入心田'):'读一张卡，懂一件小事')+'</h3><p>'+(d.complete?'今天的温习已经完成。你可以回到灵田，也可以自由翻看喜欢的卡。':'不必一次读完所有道藏。今天与这'+total+'张卡，再见一面。')+'</p><div class="sy-hero-actions">'+button(d.complete?'show-topics':'start-daily',d.complete?'看看专题长卷':'开始今日参悟 '+icon('arrow'),'','primary',blocked())+button('return-garden','回到灵田','','quiet')+'</div></div><div class="sy-daily-ring" aria-label="今日完成'+done.length+'张，共'+total+'张"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50"/><circle cx="60" cy="60" r="50" pathLength="100" style="stroke-dasharray:'+Math.min(100,done.length/Math.max(1,total)*100)+' 100"/></svg><span><b>'+done.length+'</b><small>/ '+total+' 张</small></span><i>'+(d.complete?'今日已成':'循序渐进')+'</i></div></div>'+
      (resume?'<div class="sy-resume"><p>上一次的参悟还留在这里：'+E(title(resume.cardId))+'</p>'+button('resume','继续这张',attr('card-id',resume.cardId),'quiet',blocked())+'</div>':'')+
      '<div class="sy-agenda">'+ids.map((id,i)=>'<article class="sy-agenda-card '+(done.includes(id)?'is-complete':'')+'"><div class="sy-agenda-order"><span>0'+(i+1)+'</span><small>'+E(done.includes(id)?'今日已完成':getReason(id,i))+'</small>'+(done.includes(id)?icon('check'):button('replace','换一张',attr('card-id',id),'quiet',blocked()))+'</div><button class="sy-agenda-art" data-study-action="read" '+attr('card-id',id)+' aria-label="研读'+E(title(id))+'">'+cardImage(id)+'</button><h4>'+E(title(id))+'</h4><p>'+E(content()?.cards?.[id]?.hook||'再读一遍，发现新的理解。')+'</p><div class="sy-agenda-bottom">'+stageMarkup(id)+button('daily',!enabled(id)?'本期未启用':done.includes(id)?'自由温习':'参悟此卡',attr('card-id',id),'primary',blocked()||!enabled(id))+'</div></article>').join('')+'</div>'+
      '<section class="sy-week"><div><span class="sy-eyebrow">一周任选三天</span><h4>'+(w.complete?'本周研习已达成':'为自己留一点温习的时间')+'</h4><p>错过一天也没关系，已经积累的参悟不会清零。</p></div><div class="sy-week-days" aria-label="本周已有'+days.length+'天完成温习">'+[0,1,2].map(i=>'<span class="'+(i<days.length?'is-done':'')+'">'+(i<days.length?icon('check'):'<i>第'+(i+1)+'天</i>')+'</span>').join('')+'</div></section>'+sectSection()+'</section>';
    }
    function topicCards(){
      const s=state(),topics=list(s.topics);
      return '<section class="sy-topics"><div class="sy-section-heading"><span class="sy-eyebrow">专题长卷 · 由一点读到一面</span><h3>让相关的概念，慢慢连起来</h3><p>收藏记录你遇见的卡，研习记录你读懂的关系。所有专题都可以直接学习。</p></div><div class="sy-topic-grid">'+topics.map((t,i)=>{
        const ids=list(t.cardIds),owned=ids.filter(owns).length,learned=ids.filter(id=>stage(id)>0).length,mastered=count(t.appliedCount),unlocked=list(s.rewards?.unlockedIds).includes(t.reward?.id),selected=s.rewards?.selectedId===t.reward?.id;
        return '<article class="sy-topic '+(t.complete?'is-complete':'')+'"><div class="sy-topic-top"><span>长卷 '+String(i+1).padStart(2,'0')+'</span><b>'+E(t.complete?'融会一卷':'静待点亮')+'</b></div><h4>'+E(t.title)+'</h4><p>'+E(t.description)+'</p><div class="sy-topic-progress"><label>收藏 <strong>'+owned+' / '+ids.length+'</strong><progress value="'+owned+'" max="'+Math.max(1,ids.length)+'"></progress></label><label>会用 <strong>'+mastered+' / '+ids.length+'</strong><progress value="'+mastered+'" max="'+Math.max(1,ids.length)+'"></progress></label></div><small class="sy-muted">已研读 '+learned+' 张 · '+(t.partial?'本期选用 '+ids.length+' / 专题 '+count(t.fullTotal)+' 张；完整专题达到会用后点亮纪念':'会用进度以独立作答记录为准')+'</small><div class="sy-topic-links">'+ids.map(id=>button('read',E(title(id)),attr('card-id',id),'quiet')).join('')+'</div><footer><span>'+icon('leaf')+E(t.reward?.name||'专题纪念')+'</span>'+button(unlocked?'reward':'topic-start',unlocked?(selected?'已布置':'布置纪念'):'从一张开始',unlocked?attr('reward-id',t.reward?.id):attr('card-id',ids.find(id=>stage(id)<3)||ids[0]),unlocked?'primary':'secondary',blocked()||selected)+'</footer></article>';
      }).join('')+'</div></section>';
    }
    function showcase(){
      const s=state(),display=list(s.displayCards),wishes=list(s.wishes),selected=s.rewards?.selectedId;
      const rewards=list(s.rewards?.items).filter(reward=>list(s.rewards?.unlockedIds).includes(reward.id)).map(reward=>({reward}));
      return '<section class="sy-showcase"><div class="sy-section-heading"><span class="sy-eyebrow">我的珍藏 · 自有一方天地</span><h3>把心爱的卡，摆在眼前</h3><p>在任意卡背选择“记为心愿”或“放入陈列架”，各可选择三张。参悟记录始终属于自己。</p></div><div class="sy-display-shelf">'+[0,1,2].map(i=>display[i]?'<article class="sy-display-card"><button data-study-action="read" '+attr('card-id',display[i])+' aria-label="研读'+E(title(display[i]))+'"><div>'+cardImage(display[i])+'</div><h4>'+E(title(display[i]))+'</h4>'+stageMarkup(display[i])+'</button>'+button('display','收起',attr('card-id',display[i]),'quiet')+'</article>':'<div class="sy-display-empty">'+icon('book')+'<p>留给下一张心爱之藏</p>'+button('browse','去卡册挑选','','quiet')+'</div>').join('')+'</div><div class="sy-section-heading is-small"><h4>心愿笺 <small>'+wishes.length+' / 3</small></h4><p>记下想珍藏的概念，随时可以研读。</p></div><div class="sy-mini-grid">'+(wishes.length?wishes.map(id=>mini(id,{meta:owns(id)?'已遇见这张卡':'尚未收藏 · 可直接研读',tail:button('wish','移出心愿',attr('card-id',id),'quiet')})).join(''):'<div class="sy-empty-inline">心愿笺还是空的。翻到喜欢的卡背，轻点星形标记。</div>')+'</div><div class="sy-section-heading is-small"><h4>庭院纪念</h4><p>完成专题研习后，可选择一件纪念布置在灵田的读书角。</p></div><div class="sy-reward-list">'+(rewards.length?rewards.map(t=>'<article>'+icon('leaf')+'<div><h5>'+E(t.reward.name)+'</h5><p>'+E(t.reward.description)+'</p></div>'+button('reward',selected===t.reward.id?'已布置':'布置',attr('reward-id',t.reward.id),'primary',blocked()||selected===t.reward.id)+'</article>').join(''):'<div class="sy-empty-inline">从一个专题开始，把理解积累成自己的纪念。</div>')+'</div>'+(selected?button('reward','收起庭院纪念',attr('reward-id',''),'quiet',blocked()):'')+'</section>';
    }
    function sectSection(){
      const t=state()?.sect||{};
      if(!t.available)return '<section class="sy-sect sy-sect-unjoined"><div class="sy-sect-art" aria-hidden="true">'+lampArt(0)+'</div><div><span class="sy-eyebrow">宗门研习 · 一人一盏灯</span><h4>'+(!engine.online?'离线研习，留下一盏灯':'与同门一起，点亮藏书阁')+'</h4><p>'+(!engine.online?'本地记录用于个人练习；真实同门的共同进度在在线版展示。':'加入课堂关联的宗门后，完成每日参悟就能为本周藏书阁贡献一盏灯。')+'</p></div></section>';
      const n=count(t.contributors),target=Math.max(1,count(t.target)),ratio=Math.min(1,Number(t.ratio)||n/target);
      return '<section class="sy-sect"><div class="sy-sect-art" aria-hidden="true">'+lampArt(Math.ceil(ratio*3))+'</div><div><span class="sy-eyebrow">宗门研习 · 一人一盏灯</span><h4>'+E(t.title||'同门灯火，照见藏真')+'</h4><p>本周已有 <strong>'+n+'</strong> 位同门参与，共同目标 <strong>'+target+'</strong> 位。</p><progress value="'+Math.min(n,target)+'" max="'+target+'" aria-label="宗门共同研习进度"></progress><small>'+(t.personalContributed?'你已经点亮本周的一盏灯。':'完成今日参悟，可为本周贡献一盏灯。')+' 每位同门每周计一次，按宗门人数设定目标。</small></div></section>';
    }
    function lampArt(level){
      return '<svg viewBox="0 0 240 170" fill="none"><path d="M22 146h196M38 136h164M51 57h138l13 13H38Z" stroke="#b9a268" stroke-width="3"/><path d="m43 57 77-33 77 33M58 73v62m124-62v62" stroke="#557c68" stroke-width="5"/><path d="M81 86h78M81 105h78M81 124h78" stroke="#c9bd98" stroke-width="3"/>'+[0,1,2].map((i)=>'<g opacity="'+(i<level?'1':'.22')+'"><circle cx="'+(85+i*35)+'" cy="91" r="18" fill="#ead993" opacity=".35"/><path d="M'+(78+i*35)+' 81h14l3 21h-20Z" fill="'+(i<level?'#d8ab51':'#b7c0aa')+'"/><path d="M'+(85+i*35)+' 76v5m0 21v6" stroke="#806d42" stroke-width="2"/></g>').join('')+'<path d="m28 147 8-15m174 15-8-15" stroke="#a1ae8d" stroke-width="2"/></svg>';
    }
    function classroom(){
      const s=state(),focus=list(s.focus?.cardIds).filter(enabled),all=(course()?.cards||[]).filter(c=>enabled(c.id)),now=engine.now?.()||Date.now();
      const candidates=all.filter(c=>{
        const p=progress(c.id);
        return (!search||[c.title,c.definition].join(' ').includes(search))&&(filter==='all'||filter==='due'&&p.nextReviewAt&&p.nextReviewAt<=now||filter==='mistakes'&&count(p.mistakes)>0||filter==='learning'&&stage(c.id)>0&&stage(c.id)<4||filter==='mastered'&&stage(c.id)===4);
      });
      const m=s.metrics||{};
      return '<section class="sy-classroom"><div class="sy-section-heading"><span class="sy-eyebrow">课堂回响 · 带着理解再见面</span><h3>本周，先把这几张读透</h3><p>'+E(s.focus?.source==='teacher'?'老师为本周选定了这些核心卡，可以提前读，也可以课后温习。':'根据本课程章节安排选出的本周核心卡。每张都能直接研读。')+'</p></div><div class="sy-mini-grid">'+focus.map(id=>mini(id,{tail:button('practice','试着用一下',attr('card-id',id),'quiet',blocked())})).join('')+'</div><section class="sy-personal-summary"><div><b>'+Object.keys(s.cards||{}).filter(id=>stage(id)>0).length+'</b><span>已研读概念</span></div><div><b>'+Object.keys(s.cards||{}).filter(id=>stage(id)>=3).length+'</b><span>已有应用记录</span></div><div><b>'+Object.keys(s.cards||{}).filter(id=>stage(id)===4).length+'</b><span>已完成延迟巩固</span></div></section><div class="sy-section-heading is-small sy-inline-heading"><div><h4>我的复习册</h4><p>按自己的需要，挑一张继续读。</p></div>'+button('report','导出我的复习册','','quiet',blocked())+'</div><div class="sy-filters"><label><span>挑选概念</span><select data-study-filter aria-label="复习册筛选"><option value="all"'+(filter==='all'?' selected':'')+'>全部概念</option><option value="due"'+(filter==='due'?' selected':'')+'>适合再温习</option><option value="mistakes"'+(filter==='mistakes'?' selected':'')+'>曾经辨析有误</option><option value="learning"'+(filter==='learning'?' selected':'')+'>正在参悟</option><option value="mastered"'+(filter==='mastered'?' selected':'')+'>已完成巩固</option></select></label><label><span>寻找卡牌</span><input type="search" data-study-search value="'+E(search)+'" placeholder="输入概念名称" aria-label="搜索复习概念"></label></div><div class="sy-review-list">'+(candidates.length?candidates.map(c=>'<article><button data-study-action="read" '+attr('card-id',c.id)+'><strong>'+E(c.title)+'</strong>'+stageMarkup(c.id,true)+'</button>'+button('practice','温习',attr('card-id',c.id),'quiet',blocked())+'</article>').join(''):'<p class="sy-empty-inline">这里暂时没有符合条件的卡牌，换一个筛选看看。</p>')+'</div>'+teacherPanel()+'</section>';
    }
    function teacherPanel(){
      const t=teacherAccess(),classes=list(t?.classes);if(!t?.available||!classes.length)return '';
      const current=classes.find(c=>c.classId===teacherClassId)||classes[0],id=current.classId;
      const report=engine.studyClassroom?.classId===id?engine.studyClassroom:null;
      const selected=teacherCards===null?list(report?.focus?.cardIds):teacherCards;
      const catalogue=global.SpiritCards?.getCourse(current.courseId);
      const m=report?.metrics||{},percent=n=>typeof n==='number'?Math.round(n*100)+'%':'样本尚未形成';
      return '<section class="sy-teacher"><div class="sy-section-heading is-small"><span class="sy-eyebrow">教师课堂工作台</span><h4>把本周重点，交给学生慢慢读</h4><p>从本期范围选择三至五张核心卡；不足三张时可全选。研习汇总只展示当前授权班级。</p></div><label class="sy-teacher-class">任课班级<select data-study-teacher-class aria-label="选择任课班级">'+classes.map(c=>'<option value="'+E(c.classId)+'"'+(c.classId===id?' selected':'')+'>'+E(c.classId+' · '+c.courseName)+'</option>').join('')+'</select></label>'+(teacherMessage?'<p class="sy-notice" role="status">'+E(teacherMessage)+'</p>':'')+(report?'<div class="sy-teacher-metrics"><div><b>'+count(report.learners)+' / '+count(report.members)+'</b><span>已开始研习 / 班级成员</span></div><div><b>'+E(percent(m.returnRate))+'</b><span>七日内再来研习</span><small>已观察满七天的 '+count(m.returnEligible)+' 人</small></div><div><b>'+E(percent(m.delayedAccuracy))+'</b><span>延迟独立首答正确率</span><small>'+count(m.delayedAttempts)+' 次有效首答</small></div><div><b>'+count(m.voluntaryOldCardReads)+'</b><span>主动回看旧卡</span><small>近 '+count(m.windowDays)+' 天</small></div></div><details class="sy-teacher-focus" open><summary>设置本周核心卡 <small>已选 '+selected.length+' / 5</small></summary><div class="sy-teacher-select">'+list(catalogue?.cards).filter(c=>!report?.curriculum||report.curriculum.cardIds.includes(c.id)).map(c=>'<label><input type="checkbox" data-study-teacher-card value="'+E(c.id)+'"'+(selected.includes(c.id)?' checked':'')+'>'+E(c.title)+'</label>').join('')+'</div>'+button('teacher-save','保存本周核心卡','','primary',teacherBusy||blocked())+'</details><div class="sy-teacher-table"><table><caption>各概念的研习概况</caption><thead><tr><th>概念</th><th>初识</th><th>会用</th><th>巩固</th><th>待辨析</th></tr></thead><tbody>'+list(report.cards).filter(c=>c.started||selected.includes(c.cardId)).map(c=>'<tr><th scope="row">'+E(c.title)+'</th><td>'+count(c.started)+'</td><td>'+count(c.applied)+'</td><td>'+count(c.consolidated)+'</td><td>'+count(c.mistakes)+'</td></tr>').join('')+'</tbody></table></div><p class="sy-muted">'+E(report.note)+'</p>':'<p class="sy-empty-inline">读取这个班级后，可设置核心卡并查看共同研习进度。</p>')+'<div class="sy-toolbar">'+button('teacher-load',report?'刷新班级概况':'读取班级概况','','secondary',teacherBusy||blocked())+(report?button('teacher-report','导出班级概况','','quiet',teacherBusy||blocked()):'')+'</div></section>';
    }
    function selectedTeacherClass(){const classes=list(teacherAccess()?.classes);return classes.find(c=>c.classId===teacherClassId)||classes[0]||null;}
    async function readTeacher(){const selected=selectedTeacherClass();if(!selected||blocked())return;teacherClassId=selected.classId;teacherBusy=true;teacherMessage='';const r=await perform(()=>engine.loadStudyClassroom(selected.classId));teacherBusy=false;if(!r||r.ok===false)teacherMessage=r?.message||'班级概况暂未读取，请稍后重试。';change();}
    function screen(){
      resetForCourse();
      if(teacherAccess()?.available&&!state()?.available)return '<div class="sy-root">'+noticeMarkup()+teacherPanel()+'</div>';
      if(!engine.loadStudy||!content())return '<section class="sy-loading"><h3>本课程研习暂未开放</h3><p>卡册中的知识仍可直接阅读。</p></section>';
      const s=state();
      if(!s?.available)return '<section class="sy-loading">'+icon('book')+'<h3>'+(engine.studyLoading?'正在展开参悟长卷':'准备今日研习')+'</h3><p>'+E(engine.studyError||s?.message||'读取本课程的个人研习记录。')+'</p>'+button('reload','读取研习进度','','primary',engine.studyLoading)+noticeMarkup()+'</section>';
      return '<div class="sy-root">'+noticeMarkup(panel==='classroom')+'<nav class="sy-nav" aria-label="参悟内容">'+[['today',list(state()?.daily?.cardIds).length===3?'今日三签':'今日参悟'],['topics','专题长卷'],['showcase','我的珍藏'],['classroom','课堂回响']].map(([id,label])=>'<button data-study-action="panel" '+attr('panel',id)+(panel===id?' aria-current="page"':'')+'>'+label+'</button>').join('')+'</nav>'+(panel==='topics'?topicCards():panel==='showcase'?showcase():panel==='classroom'?classroom():today())+'</div>';
    }
    function sceneArt(kind,complete){
      const colour=complete?'#d2aa52':'#8ba992';
      if(kind==='market')return '<svg viewBox="0 0 300 130" aria-hidden="true"><path d="M28 108h244" stroke="#bdc9af" stroke-width="2"/>'+[0,1,2].map((i)=>'<g transform="translate('+(48+i*80)+' 0)"><path d="m-8 59 30-22 30 22Z" fill="'+colour+'"/><path d="M0 60h44v44H0Z" fill="#e5e7d1" stroke="#7d9975" stroke-width="2"/><path d="M9 75h26M9 88h20" stroke="#bcaa76" stroke-width="3"/><circle cx="22" cy="28" r="8" fill="#d8b971" opacity="'+(complete?'1':'.3')+'"/></g>').join('')+'</svg>';
      if(kind==='sect')return '<svg viewBox="0 0 300 130" aria-hidden="true"><path d="m24 109 43-72 44 72m80 0 42-88 43 88" fill="#bacbb0"/><path d="M52 100V66h29v34m134 0V56h34v44" fill="'+colour+'"/><path d="M86 98Q150 '+(complete?'12':'65')+' 218 98" fill="none" stroke="#c5a55f" stroke-width="'+(complete?'6':'3')+'" stroke-dasharray="'+(complete?'0':'5 5')+'"/><circle cx="150" cy="65" r="12" fill="#f4e9c4"/></svg>';
      if(kind==='garden')return '<svg viewBox="0 0 300 130" aria-hidden="true"><path d="M30 106q120 18 240 0" fill="none" stroke="#c2ae7a" stroke-width="5"/>'+[0,1,2].map(i=>'<g transform="translate('+(75+i*75)+' 0)"><path d="M0 105V54" stroke="#5c886a" stroke-width="4"/><path d="M0 80q-37-7-23-30 25 4 23 30m0-14q30-3 24-28-24 1-24 28" fill="'+colour+'"/><circle cy="'+(complete?'36':'48')+'" r="'+(complete?'12':'6')+'" fill="#d5b168"/></g>').join('')+'</svg>';
      return '<svg viewBox="0 0 300 130" aria-hidden="true"><path d="M72 27h155v82H72Z" fill="#efe3bc" stroke="#c0a56d" stroke-width="2"/><path d="M94 49h111M94 67h92M94 85h107" stroke="'+colour+'" stroke-width="4"/><circle cx="217" cy="97" r="17" fill="'+(complete?'#577e65':'#c8b176')+'"/><path d="m209 97 5 5 10-12" fill="none" stroke="#fff7df" stroke-width="3"/></svg>';
    }
    function overlay(){
      if(!challenge)return '';
      const c=card(challenge.cardId),item=content()?.cards?.[challenge.cardId];
      const result=feedback,correct=!!result?.correct,loading=working||engine.busy,remaining=list(state()?.daily?.cardIds).filter(id=>!list(state()?.daily?.completedIds).includes(id));
      return '<section class="sy-overlay" role="region" aria-label="道藏参悟" data-study-overlay tabindex="-1"><div class="sy-session-top"><div><span class="sy-eyebrow">'+(dailyMode?(list(state()?.daily?.cardIds).length===3?'今日三签':'今日参悟'):'随心研习')+' · '+E(TYPES[challenge.kind]||'读懂一张卡')+'</span><h3>'+E(c?.title||'藏真一问')+'</h3></div><button type="button" class="sy-session-close" data-study-action="close-session" aria-label="收起参悟，返回卡牌">'+icon('close')+'</button></div><div class="sy-session-content"><aside class="sy-session-aside"><div class="sy-session-card">'+cardImage(challenge.cardId)+'</div>'+stageMarkup(challenge.cardId)+'<p>'+E(challenge.hook||item?.hook||'带着一个问题，再读一遍。')+'</p><small>一道小题，一次新的理解。</small></aside><main class="sy-question"><div class="sy-event-art '+(correct?'is-complete':'')+'">'+sceneArt(challenge.scene,correct)+'</div><span class="sy-eyebrow">'+E({market:'坊市见闻',garden:'灵田小事',sect:'宗门议事',letter:'山外来信'}[challenge.scene]||'藏真小事')+'</span><h4 id="study-question-title">'+E(challenge.prompt)+'</h4><div class="sy-options" role="group" aria-labelledby="study-question-title">'+list(challenge.options).map((v,i)=>'<button type="button" class="sy-option '+(choice===i?'is-selected ':'')+(result&&result.answer===i?'is-answer ':'')+(result&&!correct&&choice===i?'is-wrong':'')+'" data-study-action="choose" '+attr('choice',i)+' aria-pressed="'+(choice===i)+'"'+(loading||result?' disabled':'')+'><b>'+String.fromCharCode(65+i)+'</b><span>'+E(v)+'</span>'+(result&&result.answer===i?icon('check'):'')+'</button>').join('')+'</div>'+(!result?'<div class="sy-question-actions">'+button('submit',loading?'正在记录…':'确认我的判断','','primary',choice===null||loading||!!engine.pending)+'<small class="sy-question-note">确认以后，对错和卡背依据一起显示</small></div>':'')+(earnedEvidence&&!result?'<aside class="sy-hint"><strong>卡背依据</strong><p>'+E(earnedEvidence)+'</p><small>上一次作答后给出的依据；这次记为带提示练习，之后还有独立温习的机会。</small></aside>':'')+(result?'<section class="sy-feedback '+(correct?'is-correct':'is-retry')+'" role="status"><span class="sy-feedback-seal">'+(correct?'悟':'思')+'</span><div><h5>'+(correct?(result.independent?'这一次，你自己想明白了':'循着提示，也读懂了一层'):'差一点，再看关键的关系')+'</h5><p>'+E(result.explanation)+'</p>'+(result.evidence?'<blockquote><b>卡背依据</b>'+E(result.evidence)+'</blockquote>':'')+'<small>'+(correct?(result.stageAfter>result.stageBefore?'个人参悟：'+STAGES[result.stageBefore||0]+' → '+STAGES[result.stageAfter||0]:result.independent?'已记下这次独立练习。隔一段时间再试一题，理解会更稳。':'本次已完成练习，后续温习将再检验独立理解。'):'可以查看依据后重新判断，不扣灵石和修为。')+'</small></div></section><div class="sy-result-actions">'+(correct?button(dailyMode&&remaining.length?'next-daily':'finish-session',dailyMode&&remaining.length?'下一张 · 继续参悟':dailyMode?'今日参悟完成':'完成这次研习','','primary',loading):button('retry','再想一次','','primary',loading))+button('read-evidence','回卡背读一读','','quiet',loading)+'</div>':'')+noticeMarkup()+'</main></div><footer class="sy-session-footer"><span>'+E(course()?.name||'')+'</span><span>'+(dailyMode?'今日 '+list(state()?.daily?.completedIds).length+' / '+list(state()?.daily?.cardIds).length+' 张':'随时可结束 · 已完成记录会保留')+'</span></footer></section>';
    }
    // Keep the full-screen study surface mounted while its answer state changes.
    // Replacing it on every engine notification restarts entry animations and
    // image decoding, including during otherwise invisible background polling.
    function overlayElementKey(node){
      if(node.nodeType!==1)return '';
      const action=node.getAttribute('data-study-action');
      return node.id|| (action?'action:'+action+':'+(node.getAttribute('data-choice')||node.getAttribute('data-card-id')||''):
        (node.getAttribute('class')||'').split(/\s+/).find(name=>name&&!name.startsWith('is-'))||'');
    }
    function sameOverlayNode(current,next){
      return current.nodeType===next.nodeType&&(current.nodeType!==1||current.nodeName===next.nodeName&&overlayElementKey(current)===overlayElementKey(next));
    }
    function patchOverlayNode(current,next){
      if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
      for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
      for(const attr of [...next.attributes])if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
      let cursor=current.firstChild;
      for(const child of [...next.childNodes]){
        let match=cursor;
        while(match&&!sameOverlayNode(match,child))match=match.nextSibling;
        if(!match)match=current.insertBefore(child.cloneNode(true),cursor);
        else if(match!==cursor)current.insertBefore(match,cursor);
        patchOverlayNode(match,child);cursor=match.nextSibling;
      }
      while(cursor){const nextSibling=cursor.nextSibling;current.removeChild(cursor);cursor=nextSibling;}
    }
    function updateOverlay(root){
      if(!root||!challenge)return;
      const markup=overlay(),questionId=challenge.id,reduced=!!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if(overlayNode!==root){
        overlayNode=root;overlayMarkup=markup;overlayChallenge=questionId;
        if(!reduced)root.animate?.([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:250,easing:'ease-out'});
        return;
      }
      if(markup===overlayMarkup)return;
      const pane=root.querySelector('.sy-session-content'),scroll=pane?.scrollTop||0,active=document.activeElement,hadFocus=root.contains(active),newQuestion=overlayChallenge!==questionId;
      const next=document.createElement('div');next.innerHTML=markup;
      patchOverlayNode(root,next.firstChild);
      overlayMarkup=markup;overlayChallenge=questionId;
      if(pane)pane.scrollTop=newQuestion?0:scroll;
      if(newQuestion){
        if(!reduced)root.querySelector('.sy-question')?.animate?.([{opacity:.55,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
        root.focus({preventScroll:true});
      }else if(hadFocus&&(!root.contains(active)||active.disabled)){root.focus({preventScroll:true});}
    }
    async function perform(fn){
      if(blocked())return null;working=true;error='';notice='';const token=epoch,courseId=course()?.id;change();
      let r;try{r=await fn();}catch(e){if(token===epoch)error=e?.message||'研习暂未完成，请稍后重试。';}
      if(token!==epoch||course()?.id!==courseId)return null;
      working=false;if(r?.ok===false)error=r.message||'这次研习尚未完成。';if(r?.pending)error='结果尚待确认，请同步后继续。';change();return r;
    }
    async function load(){
      resetForCourse();try{await engine.loadStudy?.();}catch(e){error=e?.message||'暂时无法读取参悟记录。';}change();
    }
    async function begin(id,mode='practice'){
      if(!card(id)||card(id).courseId!==course()?.id||!enabled(id))return;
      const r=await perform(()=>engine.beginStudy(id,mode));
      if(r?.ok&&r.challenge){if(r.courseId&&r.courseId!==engine.study?.courseId||card(r.challenge.cardId)?.courseId!==course()?.id){await load();return;}challenge=r.challenge;feedback=r.feedback||r.challenge.feedback||null;choice=null;hinted=!!r.challenge.hinted;earnedEvidence=null;dailyMode=mode==='daily';source=mode;change();global.requestAnimationFrame?.(()=>options.host?.querySelector('[data-study-overlay]')?.focus({preventScroll:true}));}
    }
    async function recordRead(id,from='card'){
      const day=state()?.daily?.day||new Date((engine.now?.()||Date.now())+28800000).toISOString().slice(0,10),key=course()?.id+':'+id+':'+day;
      const active=state()?.activeChallenge,needsHint=active&&!active.resolved&&!active.hinted&&active.cardId===id;
      if(!engine.markStudyRead||seen.has(key)&&!needsHint||blocked()||!card(id))return;
      seen.add(key);try{const r=await engine.markStudyRead(id,from);if(!r?.ok)seen.delete(key);}catch{seen.delete(key);}change();
    }
    function closeSession(){challenge=null;feedback=null;choice=null;hinted=false;earnedEvidence=null;error='';change();global.requestAnimationFrame?.(()=>{const host=options.host,original=sessionOrigin?[...host.querySelectorAll('[data-study-action]')].find(el=>el.dataset.studyAction===sessionOrigin.action&&(!sessionOrigin.cardId||el.dataset.cardId===sessionOrigin.cardId)&&!el.disabled):null;const target=original||host?.querySelector('[data-study-action="practice"]')||host?.querySelector('[data-study-action="start-daily"]')||host?.querySelector('[data-cards-close]');target?.focus({preventScroll:true});});}
    function download(report,teacher=false){
      const heading=teacher?'班级研习概况':'我的道藏复习册',m=report.metrics||{};
      const items=list(report.cards),percentage=value=>typeof value==='number'?Math.round(value*100)+'%':'尚无有效样本';
      const body=teacher?'<p>班级：'+E(report.classId)+' · '+count(report.learners)+' 人开始研习 / '+count(report.members)+' 位成员</p><p>七日内再来研习：'+E(percentage(m.returnRate))+'（观察满七天 '+count(m.returnEligible)+' 人）；延迟独立首答正确率：'+E(percentage(m.delayedAccuracy))+'（'+count(m.delayedAttempts)+' 次首答）；近 '+count(m.windowDays)+' 天主动回看旧卡 '+count(m.voluntaryOldCardReads)+' 次。</p><table><thead><tr><th>概念</th><th>初识</th><th>会用</th><th>巩固</th><th>待辨析</th></tr></thead><tbody>'+items.map(c=>'<tr><th>'+E(c.title)+'</th><td>'+count(c.started)+'</td><td>'+count(c.applied)+'</td><td>'+count(c.consolidated)+'</td><td>'+count(c.mistakes)+'</td></tr>').join('')+'</tbody></table>':(items.length?items.map(p=>{const c=card(p.cardId);return !c?'':'<article><h2>'+E(c.title)+'</h2><p class="meta">个人参悟：'+E(STAGES[p.stage]||p.stageName)+' · '+(p.nextReviewAt?'建议 '+E(date(p.nextReviewAt))+' 再温习':'可随时继续研读')+'</p><h3>带着这个问题读</h3><p>'+E(bank(report.courseId)?.cards?.[p.cardId]?.hook||'')+'</p><h3>概念定义</h3><p>'+E(c.definition)+'</p><h3>掌握要点</h3><ol>'+list(c.keyPoints).map(point=>'<li>'+E(point)+'</li>').join('')+'</ol>'+(c.example?'<h3>这样理解</h3><p>'+E(c.example)+'</p>':'')+(c.misconception?'<h3>辨析提醒</h3><p>'+E(c.misconception)+'</p>':'')+'<div class="notes">我的理解与例子：</div></article>';}).join(''):'<p>还没有个人研习记录。读一张卡、试一道题后，复习册会保存你的学习轨迹。</p>');
      const payload='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+E(heading)+'</title><style>body{max-width:860px;margin:40px auto;padding:0 24px;color:#304a3a;background:#fffdf5;font:16px/1.85 system-ui,sans-serif}h1,h2,h3{font-weight:500}h1{border-bottom:2px solid #b7a36c;padding-bottom:20px}h2{font-size:24px}h3{font-size:17px;color:#607252}article{margin:40px 0;padding:24px;border:1px solid #d3dbc0;border-radius:12px;break-inside:avoid}.meta,footer{font-size:13px;color:#6d7e65}.notes{border-top:1px solid #d3dbc0;margin-top:26px;padding-top:16px;min-height:90px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #d3dbc0;padding:10px}th{font-weight:500}footer{margin:32px 0}@media print{body{margin:0;background:white;font-size:12pt}article{border:0;padding:0;break-inside:auto}h2,h3{break-after:avoid}.notes{min-height:60px}}@media(max-width:500px){body{padding:0 16px}article{padding:14px}th,td{padding:7px;font-size:12px}}</style></head><body><header><p>云间灵田 · '+E(report.courseName||course()?.name||'')+'</p><h1>'+E(heading)+'</h1><p class="meta">导出日期：'+E(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai'}).format(new Date(engine.now?.()||Date.now())))+' · 可使用浏览器打印为 PDF</p></header>'+body+'<footer>'+E(report.note||'研习记录用于自主复习。')+'</footer></body></html>';
      const blob=new Blob([payload],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='云间灵田_'+heading+'_'+(state()?.daily?.day||'当前')+'.html';if(lastExport)URL.revokeObjectURL(lastExport.url);lastExport={url,name:a.download,title:heading};notice=heading+'已生成。';document.body?.appendChild(a);a.click();a.remove?.();change();
    }
    async function handleClick(event){
      const target=event.target?.closest?.('[data-study-action]');if(!target||!options.host?.contains(target)||target.disabled)return false;
      event.preventDefault?.();event.stopPropagation?.();const action=target.dataset.studyAction,id=target.dataset.cardId;
      if(['start-daily','daily','practice','topic-start','resume'].includes(action))sessionOrigin={action,cardId:id||null};
      if(action==='close-session'||action==='finish-session'){closeSession();if(action==='finish-session'&&dailyMode){panel='today';options.onOpen?.();}return true;}
      if(action==='choose'){choice=Number(target.dataset.choice);change();return true;}
      if(action==='retry'){earnedEvidence=feedback?.evidence||earnedEvidence;feedback=null;choice=null;hinted=true;change();return true;}
      if(action==='open'){panel='today';options.onOpen?.();void load();return true;}
      if(action==='panel'){panel=target.dataset.panel;notice='';error='';change();if(panel==='classroom'&&state()?.teacher?.available&&!engine.studyClassroom)void readTeacher();return true;}
      if(action==='show-topics'){panel='topics';change();return true;}
      if(action==='browse'){options.onBrowse?.();return true;}
      if(action==='return-garden'){options.onClose?.();return true;}
      if(action==='reload'){await load();return true;}
      if(action==='sync'){await engine.refresh?.();await load();return true;}
      if(action==='read'){notice='';error='';await recordRead(id,'related');options.onRead?.(id);return true;}
      if(action==='read-evidence'){const cid=challenge?.cardId;closeSession();if(cid){await recordRead(cid,'event');options.onRead?.(cid);}return true;}
      if(action==='start-daily'||action==='next-daily'){const cid=list(state()?.daily?.cardIds).find(v=>!list(state()?.daily?.completedIds).includes(v));if(cid)await begin(cid,'daily');else{closeSession();panel='today';options.onOpen?.();}return true;}
      if(action==='resume'){await begin(id,list(state()?.daily?.cardIds).includes(id)?'daily':'practice');return true;}
      if(action==='practice'||action==='topic-start'||action==='daily'){if(!enabled(id)){notice='这张卡本期未启用，仍可自由阅读。';change();return true;}await begin(id,action==='daily'&&!list(state()?.daily?.completedIds).includes(id)?'daily':'practice');return true;}
      if(action==='replace'){await perform(()=>engine.replaceDailyStudy(id));return true;}
      
      if(action==='submit'&&challenge&&choice!==null){const r=await perform(()=>engine.submitStudy(challenge.id,choice));if(r?.ok&&r.feedback){feedback=r.feedback;hinted=hinted||!r.feedback.independent;change();global.requestAnimationFrame?.(()=>options.host?.querySelector('.sy-feedback')?.scrollIntoView?.({block:'nearest',behavior:global.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));}return true;}
      if(action==='wish'||action==='display'){
        const field=action==='wish'?'wishes':'displayCards',ids=list(state()?.[field]),next=ids.includes(id)?ids.filter(v=>v!==id):ids.concat(id);
        if(next.length>3){notice='最多选择三张，先收起一张再换入。';change();return true;}
        const r=await perform(()=>action==='wish'?engine.setStudyWishes(next):engine.setStudyDisplay(next));if(r?.ok){notice=action==='wish'?'心愿笺已更新。':'陈列架已更新，回灵田即可看见。';change();}return true;
      }
      if(action==='reward'){const r=await perform(()=>engine.selectStudyReward(target.dataset.rewardId||null));if(r?.ok){notice=target.dataset.rewardId?'庭院纪念已布置。':'庭院纪念已收起。';change();}return true;}
      if(action==='report'){const r=await perform(()=>engine.exportStudyReport());if(r?.ok!==false&&r)download(r.report||r.data||r);return true;}
      if(action==='teacher-save'){
        const selected=selectedTeacherClass(),report=engine.studyClassroom;if(!selected||report?.classId!==selected.classId)return true;
        const ids=teacherCards===null?list(report.focus?.cardIds):teacherCards;
        const scopeIds=report.curriculum?.cardIds,minimum=Array.isArray(scopeIds)?Math.min(3,scopeIds.length):3;if(!minimum||ids.length<minimum||ids.length>5||Array.isArray(scopeIds)&&ids.some(id=>!scopeIds.includes(id))){teacherMessage=minimum?'请从本期范围选择 '+minimum+' 至 5 张核心卡。':'本期尚未启用卡牌，请先在教学控制台配置。';change();return true;}
        if(typeof engine.setStudyFocus!=='function'){teacherMessage='本课堂尚未连接教师配置入口。';change();return true;}
        const r=await perform(()=>engine.setStudyFocus(selected.classId,ids,report.focus?.revision||0));if(r?.ok)teacherCards=null;teacherMessage=r?.ok?'本周核心卡已保存。':r?.message||'保存尚未完成。';change();return true;
      }
      if(action==='teacher-load'){await readTeacher();return true;}
      if(action==='teacher-report'){
        if(engine.studyClassroom?.classId===selectedTeacherClass()?.classId){download(engine.studyClassroom,true);teacherMessage='本班研习概况已导出。';change();}return true;
      }
      return true;
    }
    function handleInput(event){
      const el=event.target;if(el?.hasAttribute?.('data-study-filter')){filter=el.value;change();return true;}
      if(el?.hasAttribute?.('data-study-search')){search=el.value;change();return true;}
      if(el?.hasAttribute?.('data-study-teacher-card')){const ids=teacherCards===null?list(engine.studyClassroom?.focus?.cardIds).slice():teacherCards.slice();teacherCards=el.checked?[...new Set(ids.concat(el.value))]:ids.filter(id=>id!==el.value);change();return true;}
      if(el?.hasAttribute?.('data-study-teacher-class')){teacherClassId=el.value;teacherCards=null;teacherMessage='';change();void readTeacher();return true;}return false;
    }
    function handleKey(event){
      if(!challenge)return false;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSession();return true;}
      if(event.key==='Tab'){const elements=[...options.host.querySelectorAll('[data-study-overlay] button:not(:disabled),[data-study-overlay] [tabindex="0"]')].filter(n=>n.getClientRects().length);if(elements.length){const first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&(document.activeElement===first||!elements.includes(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!elements.includes(document.activeElement))){event.preventDefault();first.focus();}}return true;}
      return false;
    }
    return {screen,entry,readingLead,related,stamp,signature,overlay,updateOverlay,handleClick,handleInput,handleKey,recordRead,load,isActive:()=>!!challenge,hasTeacherAccess:()=>!!teacherAccess()?.available,closeSession,clear:()=>{epoch++;challenge=null;feedback=null;choice=null;working=false;error='';overlayNode=null;overlayMarkup='';overlayChallenge=null;},stageMarkup};
  }
  global.createSpiritStudyUI=create;
})(typeof window==='undefined'?globalThis:window);
