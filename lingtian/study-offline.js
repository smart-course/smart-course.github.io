(function(global){
  'use strict';
  const KEY='yunjian-study-practice-v1:';
  function attach(engine,options={}){
    if(!engine||engine.online!==false||!global.SpiritStudyCore)return false;
    const core=global.SpiritStudyCore,records=new Map();let busy=false;
    const courses=()=>global.SpiritCards.courses.filter(c=>core.bank(c.id));
    const courseId=()=>engine.cards?.courseId||courses()[0]?.id||null;
    const now=()=>engine.now?.()??Date.now(),change=()=>options.onChange?.();
    function entry(id){if(records.has(id))return records.get(id);if(!core.bank(id))return null;
      const value={state:core.empty(id,now()),error:'',memoryOnly:false,protectedSave:false};
      try{const raw=global.localStorage?.getItem(KEY+id);if(raw){try{value.state=core.validate(JSON.parse(raw),id);}catch(error){value.error=error.message;value.protectedSave=true;}}}catch(_){value.memoryOnly=true;}
      records.set(id,value);return value;
    }
    function persist(value){if(value.protectedSave)return;try{global.localStorage.setItem(KEY+value.state.courseId,JSON.stringify(value.state));}catch(_){value.memoryOnly=true;}}
    function context(value){const focus=core.cards(value.state.courseId).filter(c=>(value.state.records[c.id]?.stage||0)<3).slice(0,5).map(c=>c.id);return{offline:true,memoryOnly:value.memoryOnly,focus,focusSource:'course',seed:value.state.courseId,sect:{available:false,offline:true,practice:true,personalContributed:core.weekView(value.state,now()).completedDays.length>0},teacher:{available:false,classes:[]}};}
    function view(){const id=courseId(),value=id&&entry(id);if(!value)return{available:false,offline:true,unavailableReason:'course_not_ready',courseId:id};if(value.protectedSave)return{available:false,offline:true,unavailableReason:'save_unavailable',courseId:id};
      const before=value.state.revision,result=core.view(value.state,now(),context(value));if(before!==value.state.revision)persist(value);result.teacher={available:false,classes:[]};return result;
    }
    const failure=error=>{const message=error?.message||'参悟记录暂未更新，请稍后重试。';options.onMessage?.(message,'error');return{ok:false,message,code:error?.code||'study_action_failed'};};
    async function action(name,args){if(busy)return{ok:false,message:'正在记录这次参悟，请稍候。'};const id=courseId(),value=id&&entry(id);if(!value||value.protectedSave)return failure(new Error(value?.error||'当前课程的参悟内容尚未开放。'));
      busy=true;change();try{const next=core.validate(value.state,id),timestamp=now();core.prepare(next,timestamp,context(value));let result;
        if(name==='markRead')result=core.markRead(next,args[0],timestamp,args[1]);
        else if(name==='begin')result=core.begin(next,args[0],args[1],timestamp,()=>global.crypto?.randomUUID?.()||'practice-'+timestamp+'-'+Math.random().toString(36).slice(2));
        else if(name==='hint')result=core.hint(next,args[0],timestamp);
        else if(name==='submit')result=core.submit(next,args[0],args[1],timestamp);
        else if(name==='replaceDaily')result=core.replaceDaily(next,args[0],timestamp,context(value));
        else if(name==='wishes')result=core.setList(next,'wishes',args[0]);
        else if(name==='display')result=core.setList(next,'displayCards',args[0]);
        else if(name==='reward')result=core.selectReward(next,args[0],timestamp);
        else return failure(new Error('参悟操作无效。'));
        core.touch(next,timestamp);value.state=next;persist(value);return{...result,studyState:view()};
      }catch(error){return failure(error);}finally{busy=false;change();}
    }
    Object.defineProperties(engine,{study:{get:view},studyLoading:{get:()=>busy},studyError:{get:()=>entry(courseId())?.error||''},studyClassroom:{get:()=>null}});
    engine.setStudyActive=()=>{};
    engine.loadStudy=async()=>{const study=view();change();return{study};};
    engine.markStudyRead=(id,source='card')=>action('markRead',[id,source]);
    engine.beginStudy=(id,mode='practice')=>action('begin',[id,mode]);
    engine.studyHint=id=>action('hint',[id]);
    engine.submitStudy=(id,answer)=>action('submit',[id,answer]);
    engine.replaceDailyStudy=id=>action('replaceDaily',[id]);
    engine.setStudyWishes=ids=>action('wishes',[ids]);
    engine.setStudyDisplay=ids=>action('display',[ids]);
    engine.selectStudyReward=id=>action('reward',[id]);
    engine.exportStudyReport=async()=>{const value=entry(courseId());if(!value||value.protectedSave)return failure(new Error(value?.error||'本课程参悟暂不可用。'));return{ok:true,report:core.report(value.state,now(),context(value))};};
    engine.loadStudyClassroom=async()=>({ok:false,message:'离线练习只记录本人进度，班级汇总请在授权教师的在线账户中查看。'});
    engine.setStudyFocus=async()=>({ok:false,message:'离线练习不修改班级教学安排。'});
    const baseExport=engine.exportSave?.bind(engine),baseImport=engine.importSave?.bind(engine),baseReset=engine.reset?.bind(engine);
    if(baseExport)engine.exportSave=()=>{const collections={};for(const c of courses()){const value=entry(c.id);if(value.protectedSave)throw new Error('参悟存档损坏，原记录已保留，请先恢复再导出。');collections[c.id]=value.state;}return JSON.stringify({...JSON.parse(baseExport()),practiceStudy:{version:1,collections}},null,2);};
    if(baseImport)engine.importSave=json=>{
      let input,collections=null;try{if(typeof json!=='string'||json.length>4000000)throw new Error('参悟存档过大或格式无效。');input=JSON.parse(json);
        if(Object.hasOwn(input,'practiceStudy')){const bundle=input.practiceStudy;if(!bundle||bundle.version!==1||!bundle.collections||typeof bundle.collections!=='object'||Array.isArray(bundle.collections)||Object.keys(bundle.collections).length>courses().length)throw new Error('参悟存档格式无效。');collections=new Map();for(const[id,value]of Object.entries(bundle.collections)){if(!core.bank(id))throw new Error('参悟存档包含尚未开放的课程。');collections.set(id,core.validate(value,id));}delete input.practiceStudy;}
      }catch(error){return failure(error);}
      const result=baseImport(JSON.stringify(input));if(result.ok&&collections){for(const[id,state]of collections){const value=entry(id);value.state=state;value.error='';value.protectedSave=false;persist(value);}change();}return result;
    };
    if(baseReset)engine.reset=()=>{const result=baseReset();if(result.ok){for(const c of courses()){const value=entry(c.id);value.state=core.empty(c.id,now());value.error='';value.protectedSave=false;persist(value);}change();}return result;};
    return true;
  }
  global.SpiritStudyOffline=Object.freeze({attach});
})(typeof globalThis!=='undefined'?globalThis:window);
