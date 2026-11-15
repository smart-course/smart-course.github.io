(function (global) {
  'use strict';
  // Shared, deterministic learning rules. No browser identity, currency, or
  // collection ownership is used to infer a student's understanding.
  const DAY=86400000,OFFSET=28800000,VERSION=1,MAX_DAYS=100,MAX_EVENTS=600;
  const STAGES=['未读','初识','明辨','会用','巩固'];
  const KINDS=['meaning','distinguish','apply'];
  const WEEKLY_REWARD={id:'study-weekly-lantern',name:'温习明灯',description:'在一周内任选三天完成今日参悟，留下持续学习的灯火。'};
  const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function fail(code,message){const error=new Error(message);error.code=code;throw error;}
  function time(now){if(!integer(now))fail('study_clock_unavailable','参悟时辰暂不可用，请稍后再试。');return now;}
  function day(now){return new Date(time(now)+OFFSET).toISOString().slice(0,10);}
  function week(now){const date=new Date(time(now)+OFFSET);const shift=(date.getUTCDay()+6)%7;return day(now-shift*DAY);}
  function validDay(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const parsed=Date.parse(value+'T00:00:00Z');return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value;}
  function hash(text){let n=2166136261;for(let i=0;i<text.length;i++){n^=text.charCodeAt(i);n=Math.imul(n,16777619);}return n>>>0;}
  function bank(courseId){const value=global.SpiritStudyCourseBanks?.[courseId],course=global.SpiritCards?.getCourse(courseId);
    return value&&value.courseId===courseId&&integer(value.version,1)&&record(value.cards)&&Array.isArray(value.topics)&&course?value:null;}
  function cards(courseId){const value=bank(courseId);return value?global.SpiritCards.getCourse(courseId).cards.filter(card=>own(value.cards,card.id)&&Array.isArray(value.cards[card.id].questions)&&value.cards[card.id].questions.length>=3):[];}
  function requireCard(courseId,id){const card=typeof id==='string'?global.SpiritCards?.getCard(id):null;if(!card||card.courseId!==courseId||!bank(courseId)?.cards[id])fail('invalid_study_card','请选择本课程中的参悟卡牌。');return card;}
  function empty(courseId,now){if(!bank(courseId))fail('study_course_unavailable','当前课程的参悟内容尚未开放。');return{schema:'yunjian-study-state',version:VERSION,courseId,createdAt:time(now),updatedAt:now,revision:0,records:{},days:{},activity:{},wishes:[],displayCards:[],unlockedRewards:[],selectedReward:null,active:null,events:[],firstLearningAt:0,returnedWithin7Days:false};}
  function touch(state,now){state.updatedAt=time(now);state.revision=Math.min(Number.MAX_SAFE_INTEGER,state.revision+1);}
  function blankCard(){return{stage:0,readCount:0,correctCount:0,firstReadAt:0,lastReadAt:0,firstIndependentAt:0,lastIndependentAt:0,lastCorrectAt:0,lastAssistedAt:0,nextReviewAt:0,mistakes:0,independentDays:[],kindWins:[],lastQuestionId:null,questions:{}};}
  function cardRecord(state,id){return state.records[id]||(state.records[id]=blankCard());}
  function listOfIds(value,known,max=3){return Array.isArray(value)&&value.length<=max&&new Set(value).size===value.length&&value.every(id=>typeof id==='string'&&known.has(id));}
  function validate(value,courseId){const available=cards(courseId),known=new Set(available.map(card=>card.id));
    const bad=()=>fail('study_save_unavailable','参悟记录无法读取，原记录已保留，请恢复完整存档或联系教师。');
    if(!record(value)||value.schema!=='yunjian-study-state'||value.version!==VERSION||value.courseId!==courseId||!integer(value.createdAt)||!integer(value.updatedAt)||!integer(value.revision)||!record(value.records)||Object.keys(value.records).length>known.size||!record(value.days)||Object.keys(value.days).length>MAX_DAYS||!listOfIds(value.wishes,known)||!listOfIds(value.displayCards,known)||!Array.isArray(value.unlockedRewards)||value.unlockedRewards.length>100||value.unlockedRewards.some(id=>typeof id!=='string'||id.length>120)||new Set(value.unlockedRewards).size!==value.unlockedRewards.length||(value.selectedReward!==null&&typeof value.selectedReward!=='string')||!Array.isArray(value.events)||value.events.length>MAX_EVENTS||!integer(value.firstLearningAt)||typeof value.returnedWithin7Days!=='boolean')return bad();
    for(const [id,r]of Object.entries(value.records)){
      if(!known.has(id)||!record(r)||!integer(r.stage,0,4)||!integer(r.readCount,0,1000000)||!integer(r.correctCount,0,1000000)||!integer(r.mistakes,0,1000000)||['firstReadAt','lastReadAt','firstIndependentAt','lastIndependentAt','lastCorrectAt','nextReviewAt'].some(key=>!integer(r[key]))||!Array.isArray(r.independentDays)||r.independentDays.length>100||!r.independentDays.every(validDay)||new Set(r.independentDays).size!==r.independentDays.length||!Array.isArray(r.kindWins)||!r.kindWins.every(kind=>KINDS.includes(kind))||new Set(r.kindWins).size!==r.kindWins.length||(r.lastQuestionId!==null&&typeof r.lastQuestionId!=='string')||!record(r.questions)||Object.keys(r.questions).length>50)return bad();
      if(r.lastAssistedAt!==undefined&&!integer(r.lastAssistedAt))return bad();
      for(const [qid,q]of Object.entries(r.questions)){if(qid.length>160||!record(q)||!integer(q.lastAttemptAt)||!integer(q.lastCorrectAt)||!integer(q.attempts,0,1000000)||!integer(q.correct,0,1000000))return bad();}
    }
    for(const [date,d]of Object.entries(value.days)){if(!validDay(date)||!record(d)||!listOfIds(d.cardIds,known)||!listOfIds(d.completedIds,known)||!d.completedIds.every(id=>d.cardIds.includes(id))||!listOfIds(d.replacedIds,known,12)||!integer(d.swaps,0,3)||!record(d.reasons)||typeof d.complete!=='boolean'||!integer(d.completedAt))return bad();}
    for(const e of value.events){if(!record(e)||!['read','answer','daily'].includes(e.type)||!integer(e.at)||!validDay(e.day)||(e.cardId!==null&&!known.has(e.cardId))||typeof e.independent!=='boolean'||typeof e.correct!=='boolean'||typeof e.delayed!=='boolean'||typeof e.firstAttempt!=='boolean'||!['card','daily','practice','related','event'].includes(e.source))return bad();}
    if(value.active!==null){const a=value.active;if(!record(a)||typeof a.id!=='string'||a.id.length>160||!known.has(a.cardId)||typeof a.questionId!=='string'||!integer(a.createdAt)||!integer(a.attempts,0,100)||typeof a.hinted!=='boolean'||typeof a.resolved!=='boolean'||!['daily','practice'].includes(a.mode))return bad();}
    if(value.activity!==undefined){if(!record(value.activity)||Object.keys(value.activity).length>MAX_DAYS)return bad();for(const[date,a]of Object.entries(value.activity))if(!validDay(date)||!record(a)||['attempts','independentCorrect','delayedAttempts','delayedCorrect','voluntaryOldCardReads','viewCount'].some(key=>!integer(a[key],0,1000000)))return bad();}
    const result=clone(value);if(!result.activity){result.activity={};for(const event of result.events)trackActivity(result,event);}return result;
  }
  function trackActivity(state,event){const ledger=state.activity||(state.activity={}),row=ledger[event.day]||(ledger[event.day]={attempts:0,independentCorrect:0,delayedAttempts:0,delayedCorrect:0,voluntaryOldCardReads:0,viewCount:0});
    const bump=key=>row[key]=Math.min(1000000,row[key]+1);if(event.type==='answer'){bump('attempts');if(event.independent)bump('independentCorrect');if(event.delayed&&event.firstAttempt&&!event.hinted){bump('delayedAttempts');if(event.correct)bump('delayedCorrect');}}else if(event.type==='read'){bump('viewCount');if(event.returning&&['card','related'].includes(event.source))bump('voluntaryOldCardReads');}
    const dates=Object.keys(ledger).sort();while(dates.length>MAX_DAYS)delete ledger[dates.shift()];
  }
  function append(state,event){trackActivity(state,event);state.events.push(event);if(state.events.length>MAX_EVENTS)state.events.splice(0,state.events.length-MAX_EVENTS);}
  function trackLearning(state,now){if(!state.firstLearningAt)state.firstLearningAt=now;else if(now-state.firstLearningAt>=DAY&&now-state.firstLearningAt<=7*DAY)state.returnedWithin7Days=true;}
  function questionById(courseId,cardId,qid){return bank(courseId)?.cards[cardId]?.questions.find(q=>q.id===qid);}
  function eligible(courseId,options={}){const allowed=Array.isArray(options.allowedCardIds)?new Set(options.allowedCardIds):null;return cards(courseId).filter(card=>!allowed||allowed.has(card.id)).map(card=>card.id);}
  function pickDaily(state,now,options={}){
    const ids=eligible(state.courseId,options),seed=String(options.seed||state.courseId)+day(now),focus=(options.focus||[]).filter(id=>ids.includes(id));
    const order=[...ids].sort((a,b)=>hash(seed+a)-hash(seed+b));
    const focused=[...focus,...order.filter(id=>!focus.includes(id))],selection=[],reasons={};
    const add=(pool,reason)=>{const id=pool.find(id=>!selection.includes(id));if(id){selection.push(id);reasons[id]=reason;}};
    add(focused.filter(id=>!state.records[id]?.stage),'new');
    add(focused.filter(id=>(state.records[id]?.mistakes||0)>0).sort((a,b)=>(state.records[b]?.mistakes||0)-(state.records[a]?.mistakes||0)),'mistake');
    add(focused.filter(id=>state.records[id]?.nextReviewAt&&state.records[id].nextReviewAt<=now).sort((a,b)=>state.records[a].nextReviewAt-state.records[b].nextReviewAt),'due');
    for(const id of focused){if(selection.length>=3)break;if(!selection.includes(id)){selection.push(id);reasons[id]=focus.includes(id)?'focus':state.records[id]?.stage?'review':'new';}}
    return{cardIds:selection,completedIds:[],replacedIds:[],swaps:0,reasons,complete:false,completedAt:0};
  }
  function prepare(state,now,options={}){
    const today=day(now),scoped=Array.isArray(options.allowedCardIds),key=String(options.curriculumKey||'');
    if(!own(state.days,today)){state.days[today]=pickDaily(state,now,options);if(scoped)state.days[today].curriculumKey=key;touch(state,now);}
    const d=state.days[today];
    if(scoped){
      const ids=eligible(state.courseId,options),allowed=new Set(ids);
      if(d.curriculumKey!==key){
        // A finished day remains an earned historical record. An unfinished
        // agenda follows the new teaching plan without deleting card progress.
        if(!d.complete){
          const next=pickDaily(state,now,options),kept=d.cardIds.filter(id=>allowed.has(id));
          const selected=[...kept.filter(id=>d.completedIds.includes(id)),...kept.filter(id=>!d.completedIds.includes(id)),...next.cardIds.filter(id=>!kept.includes(id))].slice(0,Math.min(3,ids.length));
          d.cardIds=selected;d.completedIds=d.completedIds.filter(id=>selected.includes(id));
          d.reasons=Object.fromEntries(selected.map(id=>[id,d.reasons[id]||next.reasons[id]||'focus']));
          if(selected.length>0&&d.completedIds.length===selected.length){d.complete=true;d.completedAt=now;append(state,{type:'daily',at:now,day:today,cardId:null,source:'daily',independent:false,correct:true,delayed:false,firstAttempt:false});}
        }
        d.curriculumKey=key;touch(state,now);
      }
      if(state.active&&!allowed.has(state.active.cardId)){state.active=null;touch(state,now);}
    }
    const dates=Object.keys(state.days).sort();while(dates.length>MAX_DAYS)delete state.days[dates.shift()];
    if(state.active&&(day(state.active.createdAt)!==today||now-state.active.createdAt>60*60*1000)){state.active=null;touch(state,now);}
    rewards(state,now);return state;
  }
  function markRead(state,id,now,source='card'){
    requireCard(state.courseId,id);if(!['card','daily','practice','related','event'].includes(source))fail('invalid_study_source','参悟阅读来源无效。');
    const r=cardRecord(state,id),today=day(now),previous=r.lastReadAt;
    if(!r.firstReadAt)r.firstReadAt=now;r.stage=Math.max(1,r.stage);
    if(!previous||day(previous)!==today){r.readCount=Math.min(1000000,r.readCount+1);append(state,{type:'read',at:now,day:today,cardId:id,source,independent:false,correct:false,delayed:false,firstAttempt:false,returning:!!previous});}
    r.lastReadAt=now;
    if(state.active&&!state.active.resolved&&state.active.cardId===id){state.active.hinted=true;r.lastAssistedAt=now;}
    return{ok:true};
  }
  function chooseQuestion(state,id,now){const entry=bank(state.courseId).cards[id],r=cardRecord(state,id);
    const desired=r.stage<2?'meaning':!r.kindWins.includes('distinguish')?'distinguish':!r.kindWins.includes('apply')?'apply':null;
    const questions=[...entry.questions];
    questions.sort((a,b)=>{const ah=r.questions[a.id],bh=r.questions[b.id];return Number(b.kind===desired)-Number(a.kind===desired)||Number(a.id===r.lastQuestionId)-Number(b.id===r.lastQuestionId)||(ah?.lastAttemptAt||0)-(bh?.lastAttemptAt||0)||hash(day(now)+a.id)-hash(day(now)+b.id);});return questions[0];
  }
  function publicChallenge(state){const a=state.active;if(!a)return null;const q=questionById(state.courseId,a.cardId,a.questionId);if(!q)return null;
    return{id:a.id,cardId:a.cardId,questionId:a.questionId,kind:q.kind,prompt:q.prompt,options:[...q.options],scene:q.scene||'letter',hook:bank(state.courseId).cards[a.cardId].hook,mode:a.mode,hinted:a.hinted,resolved:a.resolved,attempts:a.attempts,feedback:a.feedback?clone(a.feedback):null};}
  function begin(state,id,mode,now,makeId,options={}){requireCard(state.courseId,id);if(!eligible(state.courseId,options).includes(id))fail('study_card_not_enabled','这张卡本学年未启用，原有内容与参悟记录仍可查看。');if(!['daily','practice'].includes(mode))fail('invalid_study_mode','请选择有效的参悟方式。');prepare(state,now,options);
    if(mode==='daily'&&!state.days[day(now)].cardIds.includes(id))fail('invalid_daily_study','这张卡不在今日参悟中。');
    if(state.active&&!state.active.resolved&&state.active.cardId===id&&state.active.mode===mode)return{ok:true,challenge:publicChallenge(state)};
    const r=cardRecord(state,id);r.stage=Math.max(1,r.stage);const q=chooseQuestion(state,id,now);if(!q)fail('study_content_unavailable','这张卡的参悟内容暂不可用。');
    const challengeId=makeId();if(typeof challengeId!=='string'||challengeId.length<8||challengeId.length>160)fail('study_id_unavailable','本次参悟未能开始，请重试。');
    state.active={id:challengeId,cardId:id,questionId:q.id,createdAt:now,attempts:0,hinted:!!r.lastAssistedAt&&day(r.lastAssistedAt)===day(now),resolved:false,mode};return{ok:true,challenge:publicChallenge(state)};
  }
  function requireChallenge(state,id,now){const a=state.active;if(!a||a.id!==id||a.resolved||day(a.createdAt)!==day(now)||now-a.createdAt>60*60*1000)fail('study_challenge_expired','这次参悟已结束，请重新打开题目。');const q=questionById(state.courseId,a.cardId,a.questionId);if(!q)fail('study_content_changed','题目已更新，请重新开始。');return{a,q};}
  function hint(state,id,now){const{a,q}=requireChallenge(state,id,now);a.hinted=true;cardRecord(state,a.cardId).lastAssistedAt=now;return{ok:true,hint:{evidence:q.evidence,cardId:a.cardId,related:bank(state.courseId).cards[a.cardId].related||[]},challenge:publicChallenge(state)};}
  function submit(state,id,answer,now){if(!integer(answer,0,2))fail('invalid_study_answer','请选择一个有效选项。');const{a,q}=requireChallenge(state,id,now),r=cardRecord(state,a.cardId),today=day(now),before=r.stage;
    const history=r.questions[q.id]||(r.questions[q.id]={lastAttemptAt:0,lastCorrectAt:0,attempts:0,correct:0});
    const freshQuestionToday=!history.lastAttemptAt||day(history.lastAttemptAt)!==today,firstAttempt=a.attempts===0,correct=answer===q.answer;
    const independent=correct&&firstAttempt&&!a.hinted&&freshQuestionToday&&(!r.lastIndependentAt||day(r.lastIndependentAt)!==today)&&(!r.lastAssistedAt||day(r.lastAssistedAt)!==today);
    const delayed=!!r.firstIndependentAt&&now-r.firstIndependentAt>=7*DAY;
    a.attempts=Math.min(100,a.attempts+1);history.attempts=Math.min(1000000,history.attempts+1);history.lastAttemptAt=now;trackLearning(state,now);
    append(state,{type:'answer',at:now,day:today,cardId:a.cardId,source:a.mode,questionId:q.id,kind:q.kind,independent,correct,delayed,firstAttempt:firstAttempt&&freshQuestionToday,hinted:a.hinted});
    if(correct){a.resolved=true;r.correctCount=Math.min(1000000,r.correctCount+1);r.lastCorrectAt=now;history.correct=Math.min(1000000,history.correct+1);history.lastCorrectAt=now;
      if(independent){const previousQuestion=r.lastQuestionId;if(!r.firstIndependentAt)r.firstIndependentAt=now;r.lastIndependentAt=now;r.independentDays.push(today);r.independentDays=r.independentDays.slice(-100);if(!r.kindWins.includes(q.kind))r.kindWins.push(q.kind);r.stage=Math.max(2,r.stage);
        if(r.independentDays.length>=2&&r.kindWins.length>=2&&r.kindWins.includes('apply'))r.stage=Math.max(3,r.stage);
        if(r.stage>=3&&r.independentDays.length>=3&&delayed&&previousQuestion!==q.id)r.stage=4;
        r.mistakes=Math.max(0,r.mistakes-1);r.nextReviewAt=now+(r.independentDays.length===1?1:r.independentDays.length===2?3:7)*DAY;r.lastQuestionId=q.id;
      }else if(!r.nextReviewAt||r.nextReviewAt>now+DAY)r.nextReviewAt=now+DAY;
      const d=state.days[today];if(d&&d.cardIds.includes(a.cardId)&&!d.completedIds.includes(a.cardId))d.completedIds.push(a.cardId);
      if(d&&!d.complete&&d.cardIds.length>0&&d.completedIds.length===d.cardIds.length){d.complete=true;d.completedAt=now;append(state,{type:'daily',at:now,day:today,cardId:null,source:'daily',independent:false,correct:true,delayed:false,firstAttempt:false});}
    }else{a.hinted=true;r.lastAssistedAt=now;r.mistakes=Math.min(1000000,r.mistakes+1);r.nextReviewAt=now+DAY;}
    rewards(state,now);
    a.feedback={correct,answer:q.answer,explanation:q.explanation,evidence:q.evidence,independent,stageBefore:before,stageAfter:r.stage,nextReviewAt:r.nextReviewAt,retryAllowed:!correct,scene:q.scene||'letter',cardId:a.cardId,questionId:q.id,kind:q.kind,message:correct?(independent?'本次独立判断已记入参悟。':'本次练习已完成，隔日再试一次可巩固理解。'):'先看看解释，再试一次；本次不会扣除灵石。'};
    return{ok:true,feedback:clone(a.feedback),challenge:publicChallenge(state)};
  }
  function replaceDaily(state,id,now,options={}){prepare(state,now,options);const d=state.days[day(now)];if(!d.cardIds.includes(id)||d.completedIds.includes(id)||d.complete)fail('daily_study_locked','只能更换今日尚未完成的卡牌。');if(d.swaps>=3)fail('daily_study_swap_limit','今日已更换三次，仍可自由进入卡册练习。');
    const alternatives=eligible(state.courseId,options).filter(value=>!d.cardIds.includes(value)&&!d.replacedIds.includes(value));alternatives.sort((a,b)=>hash(day(now)+d.swaps+a)-hash(day(now)+d.swaps+b));const next=alternatives[0];if(!next)fail('daily_study_no_alternative','当前教学范围内没有其他可更换的卡牌。');
    d.cardIds[d.cardIds.indexOf(id)]=next;d.replacedIds.push(id);d.swaps++;delete d.reasons[id];d.reasons[next]='choice';if(state.active?.cardId===id)state.active=null;return{ok:true,cardId:next};}
  function setList(state,key,ids){const known=new Set(eligible(state.courseId));if(!['wishes','displayCards'].includes(key)||!listOfIds(ids,known))fail('invalid_study_selection','请选择本课程中最多三张不同的卡牌。');state[key]=[...ids];return{ok:true};}
  function topics(state,options={}){const allowed=Array.isArray(options.allowedCardIds)?new Set(options.allowedCardIds):null;return(bank(state.courseId)?.topics||[]).map(topic=>{const full=topic.cardIds.filter(id=>bank(state.courseId).cards[id]),ids=full.filter(id=>!allowed||allowed.has(id));const learnedCount=ids.filter(id=>(state.records[id]?.stage||0)>=2).length,appliedCount=ids.filter(id=>(state.records[id]?.stage||0)>=3).length,masteredCount=ids.filter(id=>state.records[id]?.stage===4).length;
    return{...clone(topic),cardIds:ids,total:ids.length,fullTotal:full.length,partial:ids.length!==full.length,learnedCount,appliedCount,masteredCount,complete:full.length>0&&full.every(id=>(state.records[id]?.stage||0)>=3)};}).filter(topic=>topic.total>0);}
  function weekView(state,now){const start=week(now),completedDays=Object.entries(state.days).filter(([date,d])=>date>=start&&date<=day(now)&&d.complete).map(([date])=>date).sort();return{start,completedDays,targetDays:3,complete:completedDays.length>=3};}
  function rewards(state,now){const unlocked=new Set(state.unlockedRewards);for(const topic of topics(state))if(topic.complete)unlocked.add(topic.reward.id);if(weekView(state,now).complete)unlocked.add(WEEKLY_REWARD.id);state.unlockedRewards=[...unlocked].slice(0,100);}
  function selectReward(state,id,now){rewards(state,now);if(id!==null&&(typeof id!=='string'||!state.unlockedRewards.includes(id)))fail('study_reward_locked','请先完成对应研习，再陈列这件纪念物。');state.selectedReward=id;return{ok:true};}
  function metrics(state,now){const since=day(now-27*DAY),today=day(now),rows=Object.entries(state.activity||{}).filter(([date])=>date>=since&&date<=today).map(([,row])=>row),sum=key=>rows.reduce((total,row)=>total+row[key],0);return{windowDays:28,windowStart:since,firstLearningAt:state.firstLearningAt,eligibleFor7DayReturn:!!state.firstLearningAt&&now-state.firstLearningAt>=7*DAY,returnedWithin7Days:state.returnedWithin7Days,learningDays:rows.filter(row=>row.attempts>0).length,completedDailyDays:Object.entries(state.days).filter(([date,d])=>d.complete&&date>=since&&date<=today).length,independentCorrect:sum('independentCorrect'),attempts:sum('attempts'),delayedAttempts:sum('delayedAttempts'),delayedCorrect:sum('delayedCorrect'),voluntaryOldCardReads:sum('voluntaryOldCardReads'),viewCount:sum('viewCount')};}
  function view(state,now,options={}){prepare(state,now,options);const definition=global.SpiritCards.getCourse(state.courseId),d=state.days[day(now)],progress={};for(const id of eligible(state.courseId)){const r=state.records[id]||blankCard();progress[id]={...clone(r),stageName:STAGES[r.stage],due:!!r.nextReviewAt&&r.nextReviewAt<=now};}
    return{available:true,version:VERSION,updatedAt:state.updatedAt,revision:options.revision??state.revision,courseId:state.courseId,courseName:definition.name,classId:options.classId||null,offline:!!options.offline,memoryOnly:!!options.memoryOnly,cards:progress,enabledCardIds:eligible(state.courseId,options),daily:{...clone(d),day:day(now),remaining:Math.max(0,d.cardIds.length-d.completedIds.length),paused:eligible(state.courseId,options).length===0},week:weekView(state,now),wishes:[...state.wishes],displayCards:[...state.displayCards],topics:topics(state,options),rewards:{unlockedIds:[...state.unlockedRewards],selectedId:state.selectedReward,items:[WEEKLY_REWARD,...(bank(state.courseId).topics||[]).map(topic=>topic.reward)]},focus:{cardIds:[...(options.focus||[])],source:options.focusSource||'course',revision:options.focusRevision||0},sect:options.sect||{available:false,offline:!!options.offline},metrics:metrics(state,now),activeChallenge:publicChallenge(state)};
  }
  function report(state,now,options={}){const v=view(state,now,options);return{schema:'yunjian-study-report',version:VERSION,exportedAt:now,courseId:v.courseId,courseName:v.courseName,classId:v.classId,offline:v.offline,metrics:v.metrics,cards:Object.entries(v.cards).filter(([,r])=>r.stage>0).map(([id,r])=>({cardId:id,title:global.SpiritCards.getCard(id).title,stage:r.stage,stageName:r.stageName,nextReviewAt:r.nextReviewAt,lastCorrectAt:r.lastCorrectAt,independentDays:r.independentDays.length,kinds:r.kindWins})),topics:v.topics.map(t=>({id:t.id,title:t.title,total:t.total,learnedCount:t.learnedCount,appliedCount:t.appliedCount,masteredCount:t.masteredCount})),note:'参悟记录用于自主复习；收藏稀有度、在线时长和点击次数不等同于学业成绩。'};}
  global.SpiritStudyCore=Object.freeze({VERSION,DAY,STAGES,KINDS,WEEKLY_REWARD,day,week,bank,cards,empty,validate,touch,prepare,markRead,begin,hint,submit,replaceDaily,setList,selectReward,view,report,metrics,topics,weekView});
})(typeof globalThis!=='undefined'?globalThis:window);
