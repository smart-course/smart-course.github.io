/* Server-authoritative transport. Browser saves never enter the shared economy. */
(function (global) {
  'use strict';
  const PENDING_KEY = 'yunjian-cloud-pending-action-v1';
  const READ_METHODS = ['getUnlockInfo','getToolInfo','getToolTargets','getGrowthInfo','getQuests','getStats','getAlchemyInfo','isMature','getJourneyInfo','getCodexInfo','getDecorInfo','getResidenceInfo','getStoryInfo'];
  const WRITE_METHODS = ['plant','water','clear','harvest','harvestAll','sell','sellAll','breakthrough','unlock','claimQuest','upgradeTool','startBrew','claimBrew','consumePill','claimCommission','claimAchievement','buyDecoration','equipDecoration','buyResidence','equipResidence','saveDecorLayout','readStory'];
  async function create(options = {}) {
    let view, account = null, accountKey = null, accountChanged = false, authRequired = false, revision = -1, connected = true, busy = false, polling = null;
    let serverAnchor = 0, monotonicAnchor = performance.now(), lastPoll = 0, pending = null;
    let farms = [], nextFarmCursor = null, activeFarmerId = null, pendingChallenge = null, farmHistory = [];
    let farmBatch = null, pendingQuiz = null, api = null;   // 智慧课堂：今天刷到的这一批道友；浇水锄草刷新时抽到、还没答的修炼场题
    const quizBridge = quiz => { pendingQuiz = quiz || null; if (quiz && api) global.LingtianBridge?.onQuiz?.(quiz, api); };
    let farmsLoaded = false, farmLoading = 0, farmError = '', questionBank = null;
    let sect = null, sectLoaded = false, sectLoading = false, sectError = '', sectActive = false;
    let sectVisitId = null, sectPage = 0, sectReadPath = '/api/sect';
    const sectReads = new Map();
    let cards = null, cardsLoading = false, cardsError = '', cardsActive = false;
    let cardsQuery = {}, cardsReadPath = '/api/cards';
    const cardReads = new Map();
    let study = null, studyLoading = false, studyError = '', studyActive = false, studyClassroom = null, studyClassId = null;
    const studyReads = new Map();
    let farmRules = {guardChance:40,maxStolenPerPlot:1,dailyAttempts:10,challengeSeconds:120,batchStealMinRealm:3,penalties:{huangjing:5,zihou:10,tianling:15,yueyang:20,jiuqu:30}};
    const farmCache = new Map(), farmReads = new Map();
    const memory = new Map();
    const clock = { now: () => serverAnchor + Math.max(0,performance.now()-monotonicAnchor) };
    const SG = global.createSpiritGameRuntime({Date:clock,Math:global.Math,disableWeather:true,localStorage:{getItem:k=>memory.get(k) || null,setItem:(k,v)=>memory.set(k,v)}});
    const message = (text,type='info') => options.onMessage?.(text,type);
    const changed = () => options.onChange?.();
    function rememberPending(value) {
      pending = value;
      try { if(value) global.localStorage.setItem(PENDING_KEY+':'+value.body.accountKey,JSON.stringify(value)); else if(accountKey) global.localStorage.removeItem(PENDING_KEY+':'+accountKey); } catch (_) {}
    }
    function hydrate(payload) {
      if (!payload || !payload.state || !/^[a-f0-9]{64}$/.test(payload.accountKey || '') || !Number.isFinite(payload.serverTime) || !Number.isInteger(payload.revision)) throw new Error('云端返回的进度不完整，请重新连接。');
      if(accountKey && payload.accountKey !== accountKey) { accountChanged=true; connected=false; const error=new Error('登录身份已变化，请刷新页面后继续。'); error.status=409; error.code='account_mismatch'; throw error; }
      accountKey=payload.accountKey;
      if (payload.revision < revision || (payload.revision === revision && payload.serverTime < serverAnchor)) return false;
      serverAnchor = payload.serverTime; monotonicAnchor = performance.now();
      revision = payload.revision; account = payload.player;
      if (Object.prototype.hasOwnProperty.call(payload,'pendingQuiz')) quizBridge(payload.pendingQuiz);
      memory.set(SG.STORAGE_KEY,JSON.stringify(payload.state));
      view = SG.create(); connected = true;
      global.SpiritGame = SG; global.SpiritClock = clock;
      changed();
      return true;
    }
    function hydrateFarms(payload, replaceDirectory = false) {
      // The same revision check protects inventory, visited plots and challenges.
      // A slow directory response must not resurrect a resolved challenge.
      if (payload.revision < revision || (!Array.isArray(payload.farms) && !Object.prototype.hasOwnProperty.call(payload,'pendingChallenge'))) return;
      if (payload.batch) { farmBatch = payload.batch; replaceDirectory = true; }
      if (Array.isArray(payload.farms)) {
        const merged = new Map((replaceDirectory ? [] : farms).map(farm => [farm.id,farm]));
        payload.farms.forEach(farm => merged.set(farm.id,farm));
        farms = Array.from(merged.values());
        if (replaceDirectory || !farmsLoaded) nextFarmCursor = payload.nextCursor || null;
        farmsLoaded = true;
      }
      if (payload.farm && typeof payload.farm.id === 'string') farmCache.set(payload.farm.id,payload.farm);
      if (Object.prototype.hasOwnProperty.call(payload,'pendingChallenge')) pendingChallenge = payload.pendingChallenge || null;
      if (Array.isArray(payload.history)) farmHistory = payload.history;
      if (payload.rules) farmRules = payload.rules;
      if (payload.questionBank) questionBank = payload.questionBank;
      farmError = '';
      changed();
    }
    function hydrateSect(payload, expectedPath) {
      if (payload.revision < revision || !payload.sect || typeof payload.sect !== 'object') return;
      if (expectedPath && expectedPath !== sectReadPath) return;
      const target = sectVisitId || payload.sect.group?.sectId || null;
      const incoming = payload.sect.publicVisit;
      const visit = incoming?.sectId === target ? incoming : sect?.publicVisit?.sectId === target ? sect.publicVisit : null;
      sect = {...payload.sect,publicVisit:visit}; sectLoaded = true; sectError = ''; changed();
    }
    function hydrateCards(payload, expectedPath) {
      if (payload.revision < revision || !payload.cards || typeof payload.cards.available !== 'boolean') return;
      if (expectedPath && expectedPath !== cardsReadPath) return;
      cards = payload.cards; cardsError = '';
      if(study&&study.courseId!==cards.courseId){study=null;studyClassroom=null;}
      changed();
    }
    function hydrateStudy(payload) {
      if(payload.revision<revision||!payload.study||typeof payload.study.available!=='boolean')return;
      study=payload.study;studyError='';
      if(payload.classroom&&payload.classroom.classId===studyClassId)studyClassroom=payload.classroom;
      changed();
    }
    async function request(path,body) {
      if (global.LingtianBridge) {
        const out = await global.LingtianBridge.request(path, body);
        const data = out && out.body;
        if (!data || typeof data !== 'object') throw new Error('云端暂时未返回有效结果，请稍后同步。');
        if ((out.status || 200) >= 400 || data.ok === false) {
          const error = new Error(data.message || (out.status===401?'请回到课程页面重新进入云间灵田。':'本次操作未能完成。'));
          error.status = out.status; error.code = data.code; throw error;
        }
        return data;
      }
      const controller = new AbortController();
      const timeout = setTimeout(()=>controller.abort(),12000);
      try {
        const response = await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{Accept:'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal});
        let data;
        try { data = await response.json(); } catch (_) { throw new Error('云端暂时未返回有效结果，请稍后同步。'); }
        if (!response.ok || data.ok === false) {
          const error = new Error(data.message || (response.status===401?'请先登录云端洞天。':'本次操作未能完成。'));
          error.status = response.status; error.code = data.code; throw error;
        }
        return data;
      } finally { clearTimeout(timeout); }
    }
    const initial = await request('/api/game');
    hydrate(initial);
    try {
      const stored = JSON.parse(global.localStorage.getItem(PENDING_KEY+':'+accountKey) || 'null');
      if (stored && stored.body?.accountKey === accountKey && ['/api/game','/api/orders','/api/farms','/api/sect','/api/cards','/api/study'].includes(stored.path) && typeof stored.body?.requestId==='string' && JSON.stringify(stored).length<8000) pending = stored;
    } catch (_) {}
    async function settle(action) {
      let lastError;
      // A transport retry keeps the original request id; the server settles it once.
      for (let attempt=0;attempt<2;attempt++) {
        try {
          const data = await request(action.path,action.body);
          if (hydrate(data)) { hydrateFarms(data); hydrateSect(data); hydrateCards(data); hydrateStudy(data); }
          rememberPending(null);
          if (action.path === '/api/sect' && sectActive && sectVisitId && data.sect?.publicVisit?.sectId !== sectVisitId) void readSect();
          const result = {...data.result,market:data.market,sect:data.sect,cardState:data.cards,studyState:data.study};
          if(action.path==='/api/study'&&action.body.action==='setFocus')await readStudy({classId:action.body.args[0]});
          if (result.message) message(result.message,result.type==='challenge'||result.type==='quiz'?'info':result.ok?'success':'error');
          return result;
        } catch (error) {
          lastError = error;
          if(error.code==='account_mismatch') { accountChanged=true; connected=false; changed(); message('登录身份已变化，旧操作仍绑定原账户。请刷新页面后继续。','error'); return {ok:false,code:error.code,message:error.message}; }
          if(error.code==='study_teacher_required'){rememberPending(null);studyError=error.message;changed();message(error.message,'error');return {ok:false,message:error.message,code:error.code};}
          if(error.status===401 || error.status===403) { authRequired=true; connected=false; changed(); message('登录状态需要更新，待确认操作已保留。请重新登录后同步。','error'); return {ok:false,pending:true,message:error.message,code:error.code}; }
          if(error.status===429) { connected=false; changed(); message('操作较频繁，待确认请求已保留。请稍后同步云端。','info'); return {ok:false,pending:true,message:error.message,code:error.code}; }
          if (error.status && error.status<500) {
            rememberPending(null); message(error.message,'error');
            if (action.path === '/api/sect' && ['sect_layout_conflict','sect_leader_required','sect_membership_required'].includes(error.code)) await readSect();
            if (action.path === '/api/cards') await readCards(cardsQuery);
            if (action.path === '/api/study') await readStudy();
            return {ok:false,message:error.message,code:error.code};
          }
        }
      }
      connected = false; changed();
      const text = '这次操作的结果尚未确认。请点“同步云端”重试；同一请求只会结算一次。';
      message(text,'error'); return {ok:false,pending:true,message:text,cause:lastError?.message};
    }
    async function write(path,body) {
      if(authRequired) { const text='请重新登录后同步，待确认操作已保留。'; message(text,'error'); return {ok:false,pending:!!pending,message:text}; }
      if(accountChanged) { const text='登录身份已变化，请刷新页面后继续。'; message(text,'error'); return {ok:false,message:text}; }
      if (busy) return {ok:false,message:'上一项操作正在确认，请稍候。'};
      if (pending) { const text='还有一项操作待确认，请先点“同步云端”。'; message(text,'info'); return {ok:false,pending:true,message:text}; }
      busy=true; changed();
      const action={path,body:{...body,requestId:crypto.randomUUID(),accountKey},alias:account?.alias};
      rememberPending(action);
      try { return await settle(action); } finally { busy=false; changed(); }
    }
    async function refresh({settlePending=true} = {}) {
      if (busy || accountChanged || authRequired) return false;
      // Background reads must not silently replay an uncertain mutation. The
      // visible sync command may recover it with its original idempotency key.
      if (pending && !settlePending) return false;
      if (polling) return polling;
      polling=(async()=>{
        if (pending) {
          busy=true; changed();
          try { await settle(pending); } finally { busy=false; changed(); }
          if (pending) return false;
        }
        try {
          hydrate(await request('/api/game'));
          if (farmsLoaded || activeFarmerId || pendingChallenge) {
            const data = await request('/api/farms'+(activeFarmerId?'?farmer='+encodeURIComponent(activeFarmerId):''));
            if (hydrate(data)) hydrateFarms(data);
          }
          if (sectActive) await readSect();
          if (cardsActive) await readCards(cardsQuery);
          if (studyActive) await readStudy();
          lastPoll=performance.now(); return true;
        }
        catch (error) { const wasConnected=connected; connected=false; if(error.status===401 || error.status===403){authRequired=true;message('登录已过期，请重新登录后继续。','error');}else if(error.code==='account_mismatch'){accountChanged=true;message('登录身份已变化，请刷新页面后继续。','error');}else if(wasConnected)message('云端连接暂时中断，进度仍保存在服务器。恢复网络后可同步。','info'); changed(); return false; }
      })().finally(()=>{polling=null;});
      return polling;
    }
    async function readFarms({cursor,farmer,replaceDirectory=false} = {}) {
      if (accountChanged || authRequired) return null;
      const parameters = new URLSearchParams();
      if (cursor) parameters.set('cursor',cursor);
      if (farmer) parameters.set('farmer',farmer);
      const path = '/api/farms'+(parameters.size?'?'+parameters.toString():'');
      if (farmReads.has(path)) return farmReads.get(path);
      farmLoading++; farmError=''; changed();
      const operation=(async()=>{
        try {
          const data=await request(path);
          if (hydrate(data)) {
            hydrateFarms(data,replaceDirectory);
            if (cursor) nextFarmCursor=data.nextCursor || null;
          }
          return data;
        } catch (error) {
          farmError=error.message || '道友名册暂未加载，请稍后重试。';
          if(error.status===401 || error.status===403) { authRequired=true; connected=false; }
          if(error.code==='account_mismatch') { accountChanged=true; connected=false; }
          message(farmError,'info'); return null;
        } finally { farmLoading--; farmReads.delete(path); changed(); }
      })();
      farmReads.set(path,operation);
      return operation;
    }
    async function readSect(membersPage = sectPage, visitSectId = sectVisitId) {
      if (accountChanged || authRequired) return null;
      const page = Number.isSafeInteger(membersPage) && membersPage >= 0 ? membersPage : 0;
      const selected = typeof visitSectId === 'string' && ['fengxia','xuanyue','lingxi','xinglan'].includes(visitSectId) ? visitSectId : null;
      const parameters = new URLSearchParams();
      if (page) parameters.set('membersPage',String(page));
      if (selected) parameters.set('visitSectId',selected);
      const path = '/api/sect'+(parameters.size?'?'+parameters.toString():'');
      sectVisitId = selected; sectPage = page; sectReadPath = path;
      if (sect?.publicVisit && selected && sect.publicVisit.sectId !== selected) sect = {...sect,publicVisit:null};
      if (sectReads.has(path)) { sectLoading = true; changed(); return sectReads.get(path); }
      sectLoading = true; sectError = ''; changed();
      const operation = (async () => {
        try {
          const data = await request(path);
          if (!hydrate(data)) return null;
          hydrateSect(data,path);
          return data;
        } catch (error) {
          if (path === sectReadPath) sectError = error.message || '宗门账簿暂未连接，请稍后重试。';
          if (error.status === 401 || error.status === 403) { authRequired = true; connected = false; }
          if (error.code === 'account_mismatch') { accountChanged = true; connected = false; }
          return null;
        } finally { sectReads.delete(path); sectLoading = sectReads.has(sectReadPath); changed(); }
      })();
      sectReads.set(path,operation);
      return operation;
    }
    async function readCards(query = {}) {
      if (accountChanged || authRequired) return null;
      const parameters = new URLSearchParams();
      const nextQuery = {};
      if (typeof query.cardId === 'string' && query.cardId) { parameters.set('cardId',query.cardId); nextQuery.cardId = query.cardId; }
      if (Number.isSafeInteger(query.page) && query.page > 0) { parameters.set('page',String(query.page)); nextQuery.page = query.page; }
      if (['15m','1h','1d'].includes(query.interval)) { parameters.set('interval',query.interval); nextQuery.interval = query.interval; }
      const path = '/api/cards'+(parameters.size?'?'+parameters.toString():'');
      cardsQuery = nextQuery; cardsReadPath = path;
      if (cardReads.has(path)) { cardsLoading = true; changed(); return cardReads.get(path); }
      cardsLoading = true; cardsError = ''; changed();
      const operation = (async () => {
        try {
          const data = await request(path);
          if (!hydrate(data)) return null;
          hydrateCards(data,path); return data;
        } catch (error) {
          if (path === cardsReadPath) cardsError = error.message || '道藏暂未连通，请稍后重试。';
          if (error.status === 401 || error.status === 403) { authRequired = true; connected = false; }
          if (error.code === 'account_mismatch') { accountChanged = true; connected = false; }
          return null;
        } finally { cardReads.delete(path); cardsLoading = cardReads.has(cardsReadPath); changed(); }
      })();
      cardReads.set(path,operation); return operation;
    }
    async function readStudy(query={}) {
      if(accountChanged||authRequired)return null;
      const parameters=new URLSearchParams();
      if(typeof query.classId==='string'&&query.classId){parameters.set('classId',query.classId);if(studyClassId!==query.classId)studyClassroom=null;studyClassId=query.classId;}
      if(query.report===true)parameters.set('report','1');
      const path='/api/study'+(parameters.size?'?'+parameters.toString():'');
      if(studyReads.has(path))return studyReads.get(path);
      studyLoading=true;studyError='';changed();
      const operation=(async()=>{
        try{const data=await request(path);if(!hydrate(data))return null;hydrateStudy(data);return data;}
        catch(error){studyError=error.message||'参悟记录暂未连通，请稍后重试。';if(error.status===401||(error.status===403&&error.code!=='study_teacher_required')){authRequired=true;connected=false;}if(error.code==='account_mismatch'){accountChanged=true;connected=false;}return null;}
        finally{studyReads.delete(path);studyLoading=studyReads.size>0;changed();}
      })();studyReads.set(path,operation);return operation;
    }
    api={
      online:true,
      get state(){return view.state;},
      get player(){return account;},
      get accountKey(){return accountKey;},
      get accountChanged(){return accountChanged;},
      get authRequired(){return authRequired;},
      get revision(){return revision;},
      get connected(){return connected;},
      get busy(){return busy;},
      get pending(){return !!pending;},
      get cards(){return cards;},
      get cardsLoading(){return cardsLoading;},
      get cardsError(){return cardsError;},
      setCardsActive(value){cardsActive=!!value;},
      loadCards(query){return readCards(query);},
      openCardPack(){return write('/api/cards',{action:'openPack',args:[]});},
      listCard(cardId,price,quantity){return write('/api/cards',{action:'listCard',args:[cardId,price,quantity]});},
      buyCard(listingId,quantity){return write('/api/cards',{action:'buyCard',args:[listingId,quantity]});},
      cancelCard(listingId){return write('/api/cards',{action:'cancelCard',args:[listingId]});},
      get study(){return study;},
      get studyLoading(){return studyLoading;},
      get studyError(){return studyError;},
      get studyClassroom(){return studyClassroom;},
      setStudyActive(value){studyActive=!!value;},
      loadStudy(){return readStudy();},
      markStudyRead(cardId,source='card'){return write('/api/study',{action:'markRead',args:[cardId,source]});},
      beginStudy(cardId,mode='practice'){return write('/api/study',{action:'begin',args:[cardId,mode]});},
      studyHint(challengeId){return write('/api/study',{action:'hint',args:[challengeId]});},
      submitStudy(challengeId,answerIndex){return write('/api/study',{action:'submit',args:[challengeId,answerIndex]});},
      replaceDailyStudy(cardId){return write('/api/study',{action:'replaceDaily',args:[cardId]});},
      setStudyWishes(ids){return write('/api/study',{action:'wishes',args:[ids]});},
      setStudyDisplay(ids){return write('/api/study',{action:'display',args:[ids]});},
      selectStudyReward(rewardId){return write('/api/study',{action:'reward',args:[rewardId]});},
      async exportStudyReport(){const data=await readStudy({report:true});return data?{ok:true,report:data.report}:{ok:false,message:studyError};},
      loadStudyClassroom(classId){return readStudy({classId});},
      setStudyFocus(classId,cardIds,expectedRevision){return write('/api/study',{action:'setFocus',args:[classId,cardIds,expectedRevision]});},
      get storageAvailable(){return connected;},
      now:clock.now,
      refresh,
      tick(){if(!document.hidden&&!busy&&!pending&&!accountChanged&&!authRequired&&performance.now()-lastPoll>30000){lastPoll=performance.now();void refresh({settlePending:false});}return false;},
      getNeighbors(){return farms;},
      getFarm(id){return farmCache.get(id) || null;},
      get visitedFarm(){return farmCache.get(activeFarmerId) || null;},
      get nextFarmCursor(){return nextFarmCursor;},
      get farmsLoaded(){return farmsLoaded;},
      get farmLoading(){return farmLoading>0;},
      get farmError(){return farmError;},
      get pendingChallenge(){return pendingChallenge;},
      get farmRules(){return farmRules;},
      get questionBank(){return questionBank;},
      get farmHistory(){return farmHistory;},
      get sect(){return sect;},
      get sectVisit(){return sect?.publicVisit || null;},
      get sectLoaded(){return sectLoaded;},
      get sectLoading(){return sectLoading;},
      get sectError(){return sectError;},
      setSectActive(value){sectActive=!!value;},
      refreshSect:readSect,
      visitSect(sectId){return readSect(sectPage,sectId);},
      contributeSect(cropId,qty){return write('/api/sect',{action:'contributeSect',args:[cropId,qty]});},
      claimSectReward(stageId){return write('/api/sect',{action:'claimSectReward',args:[stageId]});},
      saveSectCourtyard(layout,expectedRevision){return write('/api/sect',{action:'saveSectCourtyard',args:[layout,expectedRevision]});},
      setSectInitiative(id){return write('/api/sect',{action:'setSectInitiative',args:[id]});},
      setSectGreeting(id){return write('/api/sect',{action:'setSectGreeting',args:[id]});},
      loadNeighbors(cursor){return readFarms({cursor,replaceDirectory:!cursor});},
      loadFarm(id){activeFarmerId=id;return readFarms({farmer:id});},
      beginSteal(farmerId,plotIndex){return write('/api/farms',{action:'steal',farmerId,plotIndex});},
      answerChallenge(challengeId,optionId){return write('/api/farms',{action:'answer',challengeId,optionId});},
      abandonChallenge(challengeId){return write('/api/farms',{action:'abandon',challengeId});},
      steal(farmerId,plotIndex){return api.beginSteal(farmerId,plotIndex);},
      stealAll(farmerId){
        // Keep an already-issued question accessible at every realm. Starting a
        // new batch still requires the authoritative server realm check.
        if(pendingChallenge) return {ok:true,type:'challenge',batch:true,items:[],qty:0,attempted:0,stopReason:'pending_challenge',farmerId,challenge:pendingChallenge,message:'请先完成正在等待的守田阵法。'};
        const minimum=farmRules.batchStealMinRealm ?? SG.BATCH_STEAL_MIN_REALM ?? 3;
        if(view.state.realm<minimum) {const text='晋入元婴后解锁一键偷采；当前仍可逐田偷采。';message(text,'info');return {ok:false,code:'realm_locked',message:text};}
        return write('/api/farms',{action:'stealAll',farmerId});
      },
      exportSave(){return JSON.stringify({schema:'yunjian-cloud-backup',version:1,alias:account?.alias,serverTime:clock.now(),state:view.state},null,2);},
      importSave(){return {ok:false,message:'云端洞天不接收本地存档资产。'};},
      reset(){return {ok:false,message:'云端洞天不能通过重开领取重复资产。'};},
      refine(){return {ok:false,message:'请先按丹方炼丹，再服用丹药提升修为。'};},
      async getMarket(itemKey,options={}){
        const parameters=new URLSearchParams({item:itemKey});
        if (['15m','1h','1d'].includes(options.interval)) parameters.set('interval',options.interval);
        return request('/api/market?'+parameters.toString());
      },
      // 智慧课堂：修炼场答题（浇水、锄草、刷新道友名单）
      answerQuiz(quizId,optionId){return write('/api/game',{action:'answerQuiz',args:[quizId,optionId]});},
      abandonQuiz(quizId){return write('/api/game',{action:'abandonQuiz',args:[quizId]});},
      refreshFarms(){return write('/api/farms',{action:'refresh'});},
      answerRefresh(quizId,optionId){return write('/api/farms',{action:'answerRefresh',quizId,optionId});},
      abandonRefresh(quizId){return write('/api/farms',{action:'abandonRefresh',quizId});},
      get farmBatch(){return farmBatch;},
      get pendingQuiz(){return pendingQuiz;},
      placeOrder(order){return write('/api/orders',{action:'place',...order});},
      cancelOrder(orderId){return write('/api/orders',{action:'cancel',orderId});}
    };
    READ_METHODS.forEach(name=>{api[name]=(...args)=>view[name](...args);});
    WRITE_METHODS.forEach(name=>{api[name]=(...args)=>write('/api/game',{action:name,args});});
    lastPoll=performance.now();
    if(pending)message('发现一项尚未确认的操作，请点“同步云端”安全恢复。','info');
    if (pendingQuiz) global.LingtianBridge?.onQuiz?.(pendingQuiz, api);
    return api;
  }
  global.SpiritOnline={create};
})(window);
