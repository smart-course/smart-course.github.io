(function (global) {
  'use strict';
  // Standalone practice only. This adapter never runs for a cloud account and
  // never submits local cards, clocks or inventories to the online service.
  const KEY = 'yunjian-daozang-practice-v1';
  const COURSE_KEY = KEY + '-course';
  const DEFAULT_COURSE = 'political-economy';
  const storageKey = id => id === DEFAULT_COURSE ? KEY : KEY + ':' + id;
  const DAY = 86400000, OFFSET = 28800000;
  const RULES = Object.freeze({dailyPacks:3,cardsPerPack:3,guaranteeEvery:10,guaranteeMinimumRarity:'SR',
    rarityOdds:Object.freeze({C:55,R:27,SR:12,SSR:5,UR:1}),
    trading:Object.freeze({feePercent:3,minimumFee:1,minimumPrice:1,maximumPrice:1000000,maximumQuantity:99,maximumOpenListings:10,validityHours:24})});
  const levels = ['C','R','SR','SSR','UR'];
  const empty = courseId => ({version:1,courseId,inventory:{},discovered:[],dailyDay:'',dailyOpened:0,totalOpened:0});
  function validate(data, known, courseId) {
    if (!data || data.version !== 1 || data.courseId !== courseId || !Number.isSafeInteger(data.totalOpened) || data.totalOpened < 0 || data.totalOpened > 1000000 ||
        typeof data.dailyDay !== 'string' || (data.dailyDay !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(data.dailyDay)) ||
        !Number.isSafeInteger(data.dailyOpened) || data.dailyOpened < 0 || data.dailyOpened > RULES.dailyPacks || data.dailyOpened > data.totalOpened ||
        !data.inventory || typeof data.inventory !== 'object' || Array.isArray(data.inventory) || !Array.isArray(data.discovered) ||
        new Set(data.discovered).size !== data.discovered.length || data.discovered.some(id=>!known.has(id))) throw new Error('离线道藏存档无法读取，请使用完整的练习存档恢复。');
    const result = empty(courseId);
    for (const [id,count] of Object.entries(data.inventory)) {
      if (!known.has(id) || !Number.isSafeInteger(count) || count < 0 || count > 2000000 || (count && !data.discovered.includes(id))) throw new Error('离线道藏存档中的卡牌数量无效。');
      if(count)result.inventory[id]=count;
    }
    result.discovered=[...data.discovered];result.dailyDay=data.dailyDay;result.dailyOpened=data.dailyOpened;result.totalOpened=data.totalOpened;
    return result;
  }
  function attach(engine, options = {}) {
    if (!engine || engine.online !== false) return false;
    const catalogue = global.SpiritCards;
    const courses = (catalogue?.courses || []).filter(value => value.cards?.length && levels.every(level => value.cards.some(card => card.rarity === level)));
    const records = new Map();
    let busy = false, selected = DEFAULT_COURSE;
    const getCourse = id => courses.find(value => value.id === id);
    function record(id) {
      if(records.has(id))return records.get(id);
      const course = getCourse(id), known = new Map((course?.cards || []).map(card => [card.id,card]));
      const value = {course,known,saved:empty(id),error:'',memoryOnly:false,protectedSave:false};
      try {
        const raw = global.localStorage?.getItem(storageKey(id));
        if(raw)try{value.saved=validate(JSON.parse(raw),known,id);}catch(failure){value.protectedSave=true;value.error=failure.message||'离线道藏存档无法读取，原记录已保留。';}
      } catch(_){value.memoryOnly=true;}
      records.set(id,value);return value;
    }
    try { const previous=global.localStorage?.getItem(COURSE_KEY);if(getCourse(previous))selected=previous; } catch(_) {}
    let active = record(selected);
    const now = () => engine.now?.() ?? Date.now();
    const day = () => new Date(now()+OFFSET).toISOString().slice(0,10);
    const random = () => {
      if (global.crypto?.getRandomValues) return global.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      return Math.random();
    };
    function pick(guaranteed) {
      const pool = guaranteed ? levels.slice(2) : levels;
      const total = pool.reduce((sum,rarity) => sum + RULES.rarityOdds[rarity],0);
      let threshold = random()*total, rarity = pool[pool.length-1];
      for (const candidate of pool) { threshold -= RULES.rarityOdds[candidate]; if (threshold < 0) { rarity = candidate; break; } }
      const cards = active.course.cards.filter(card => card.rarity === rarity);
      return cards[Math.floor(random()*cards.length)];
    }
    function view() {
      const {course,saved,memoryOnly}=active;
      const available = !!course, opened = saved.dailyDay === day() ? saved.dailyOpened : 0;
      return {available,offline:true,memoryOnly:memoryOnly||[...records.values()].some(value=>value.memoryOnly),unavailableReason:available?null:'course_not_ready',courseId:available?course.id:null,courseName:course?.name || null,
        catalogVersion:course?.version || null,practiceCourses:courses.map(value=>({id:value.id,name:value.name,cardCount:value.cards.length})),rules:RULES,inventory:{...saved.inventory},discovered:[...saved.discovered],totalOpened:saved.totalOpened,
        nextGuaranteeIn:RULES.guaranteeEvery-saved.totalOpened%RULES.guaranteeEvery,
        daily:{day:day(),opened,remaining:available?Math.max(0,RULES.dailyPacks-opened):0,nextResetAt:(Math.floor((now()+OFFSET)/DAY)+1)*DAY-OFFSET},
        market:{listings:[],myListings:[],page:0,pageSize:50,total:0,hasMore:false,filterCardId:null}};
    }
    const change = () => options.onChange?.();
    const persist = value => {try {global.localStorage.setItem(storageKey(value.saved.courseId),JSON.stringify(value.saved));}catch(_){value.memoryOnly=true;}};
    const fail = message => {options.onMessage?.(message,'error');return {ok:false,message};};
    const refuseTrade = async () => ({ok:false,message:'离线练习不连接共享坊市。请回到在线版交易卡牌。'});
    Object.defineProperties(engine, {
      cards:{get:view}, cardsLoading:{get:()=>busy}, cardsError:{get:()=>active.error},
    });
    // This selector exists exclusively in the standalone adapter. Online course
    // ownership is determined by the trusted classroom service, never the UI.
    engine.selectCardCourse = id => {
      if(busy)return fail('请等待这包道藏收入卡册后再切换课程。');
      if(!getCourse(id))return fail('该课程的离线道藏尚未开放。');
      active=record(id);selected=id;
      try {global.localStorage.setItem(COURSE_KEY,id);}catch(_){active.memoryOnly=true;}
      change();return {ok:true,courseId:id,cards:view()};
    };
    engine.setCardsActive = () => {};
    engine.loadCards = async () => { change(); return {cards:view()}; };
    engine.openCardPack = async () => {
      if (busy) return {ok:false,message:'正在启封这包道藏，请稍候。'};
      const {course,saved}=active;
      if (active.protectedSave) return fail(active.error);
      if (!course) return {ok:false,message:'本课程道藏暂未开放。'};
      if (view().daily.remaining <= 0) return {ok:false,message:'今日三包已启封，明日北京时间零点再来。'};
      busy = true; active.error = ''; change();
      try {
        const next = JSON.parse(JSON.stringify(saved));
        if (next.dailyDay !== day()) { next.dailyDay = day(); next.dailyOpened = 0; }
        const guaranteed = (next.totalOpened+1)%RULES.guaranteeEvery === 0;
        const definitions = Array.from({length:RULES.cardsPerPack},(_,index)=>pick(guaranteed&&index===RULES.cardsPerPack-1));
        const discovered = new Set(next.discovered);
        const drawn = definitions.map(card => {
          const isNew = !discovered.has(card.id); discovered.add(card.id);
          next.inventory[card.id] = (next.inventory[card.id] || 0)+1;
          return {cardId:card.id,isNew};
        });
        next.discovered = [...discovered]; next.totalOpened++; next.dailyOpened++;
        try { global.localStorage.setItem(storageKey(course.id),JSON.stringify(next)); }
        catch (_) { active.memoryOnly = true; }
        active.saved = next;
        return {ok:true,cards:drawn,courseId:course.id,guaranteed,message:active.memoryOnly?'道藏已收入本次练习；当前浏览器未能保存，关闭后可能丢失。':'三张道藏已收入离线卡册。',cardState:view()};
      } finally { busy = false; change(); }
    };
    engine.listCard = refuseTrade; engine.buyCard = refuseTrade; engine.cancelCard = refuseTrade;
    // The version-2 archive carries each course independently. Version-1 PE
    // archives continue to import into PE without touching the other collection.
    const baseExport=engine.exportSave?.bind(engine),baseImport=engine.importSave?.bind(engine),baseReset=engine.reset?.bind(engine);
    if(baseExport)engine.exportSave=()=>{
      const collections={};
      for(const course of courses){const value=record(course.id);if(value.protectedSave)throw new Error('课程存档损坏，原记录已保留；请先恢复该课程的完整存档再导出。');collections[course.id]=value.saved;}
      return JSON.stringify({...JSON.parse(baseExport()),practiceCards:{version:2,selectedCourseId:selected,collections}},null,2);
    };
    if(baseImport)engine.importSave=json=>{
      let incoming=null,nextSelected=selected;
      try {
        if(typeof json!=='string'||json.length>256000)throw new Error('存档过大或格式无效，请选择游戏导出的 JSON 文件。');
        const data=JSON.parse(json),bundle=data.practiceCards;
        if(Object.hasOwn(data,'practiceCards')){
          incoming=new Map();
          if(bundle?.version===1){
            const course=getCourse(bundle.courseId);if(!course)throw new Error('存档对应的课程尚未开放。');
            incoming.set(course.id,validate(bundle,record(course.id).known,course.id));nextSelected=course.id;
          } else if(bundle?.version===2&&getCourse(bundle.selectedCourseId)&&bundle.collections&&typeof bundle.collections==='object'&&!Array.isArray(bundle.collections)){
            for(const [id,value] of Object.entries(bundle.collections)){
              if(!getCourse(id))throw new Error('存档包含尚未开放的课程。');
              incoming.set(id,validate(value,record(id).known,id));
            }
            if(!incoming.has(bundle.selectedCourseId))throw new Error('存档缺少当前课程的收藏。');
            nextSelected=bundle.selectedCourseId;
          } else throw new Error('离线道藏存档格式无效。');
        }
      } catch(failure){return fail(failure.message||'离线道藏存档无法读取。');}
      const result=baseImport(json);
      if(result.ok&&incoming){
        for(const [id,saved] of incoming){const value=record(id);value.saved=saved;value.error='';value.protectedSave=false;persist(value);}
        engine.selectCardCourse(nextSelected);
        if([...incoming.keys()].some(id=>record(id).memoryOnly))options.onMessage?.('部分课程卡册仅保留在本次运行，关闭后可能丢失；请立即导出完整练习存档。','info');
      }
      return result;
    };
    if(baseReset)engine.reset=()=>{
      const result=baseReset();
      if(result.ok){for(const course of courses){const value=record(course.id);value.saved=empty(course.id);value.error='';value.protectedSave=false;persist(value);}change();}
      return result;
    };
    return true;
  }
  global.SpiritCardsOffline = Object.freeze({attach});
})(typeof globalThis !== 'undefined' ? globalThis : window);
