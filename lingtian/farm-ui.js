/* Real visitors and the server-issued field formation challenge. */
(function (global) {
  'use strict';
  function create(options) {
    const engine=options.engine, E=options.esc, I=options.icon, clock=options.clockTime;
    const crops=Object.fromEntries(global.SpiritGame.CROPS.map(c=>[c.id,c]));
    const formatTime=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    let questionId='', selectedOption='', actionBusy=false, outcome=null, abandonConfirm=false, lastBatch=null;
    let guardSignature='', directorySignature='', historySignature='', panelSignature='', activityHistorySignature='';
    let activityHistoryRequest=null, activityHistoryError='';
    const host=()=>document.getElementById('dialog-content');
    const visible=kind=>{const dialog=document.getElementById('game-dialog');return !!(dialog?.open && dialog.dataset.kind===kind);};
    const disabled=()=>actionBusy || engine.busy || engine.pending || !engine.connected;
    const button=(action,text,secondary=false,isDisabled=false,extra='')=>`<button type="button" class="button ${secondary?'button-secondary':'button-primary'}" data-farm-ui="${action}" ${extra}${isDisabled?' disabled':''}>${text}</button>`;
    const color=value=>/^#[a-f\d]{6}$/i.test(value||'')?value:'#8a9d71';
    const cropName=id=>crops[id]?.name || '灵草';
    const remaining=c=>Math.max(0,c.expiresAt-engine.now());
    function batchSummaryMarkup(inGuard=false) {
      if(!lastBatch || (inGuard && lastBatch.challengeId!==engine.pendingChallenge?.id)) return '';
      const paused=!!engine.pendingChallenge && lastBatch.challengeId===engine.pendingChallenge.id;
      return `<div class="farm-batch-summary" role="status"><strong>${I('hand')}最近一键偷采 · 已采 ${E(lastBatch.qty)} 株</strong><p>${E(lastBatch.message)}</p><small>${paused?'本轮遇阵暂停。先完成当前答题；余下田地需再次点击“一键偷采”。':'本轮批量已结束。如需继续，请再次点击“一键偷采”。'}</small></div>`;
    }

    function panel() {
      const node=document.getElementById('farm-guard-panel');
      if (!node) return;
      node.hidden=!engine.online;
      if (!engine.online) return;
      const c=engine.pendingChallenge, rules=engine.farmRules,embedded=!!node.closest?.('#activity-guard');
      const signature=JSON.stringify([c?.id,c?.expiresAt,c?.frozenStones,rules,disabled(),lastBatch,embedded]);
      if (signature!==panelSignature) {
        panelSignature=signature;
        node.innerHTML=`<div class="farm-protection-heading"><span class="farm-seal" aria-hidden="true">${I('formation')}</span><div><strong>守田阵法</strong><span>每田独立判定 · ${E(rules.guardChance)}% 概率触发</span></div>${embedded?'':button('history',I('book')+'来访记录',true,false)}</div><p class="farm-protection-note">每田每茬最多被摘 ${E(rules.maxStolenPerPlot)} 株，主人至少保留 75% 收成。阵起须答题，答对方可采。</p>${batchSummaryMarkup()}${c?`<div class="farm-pending"><span>${I('formation')}</span><div><strong>有一道阵法待解 · 已冻结 ${E(c.frozenStones ?? c.penalty)} 灵石</strong><small>${E(c.farmerName)} · 第 ${E(c.plotIndex+1)} 田 · <time data-guard-pending-time>${clock(remaining(c))}</time></small></div>${button('resume','继续答题',false,disabled())}</div>`:''}`;
      }
      const timer=node.querySelector('[data-guard-pending-time]');
      if (timer && c) timer.textContent=remaining(c)>0?'还剩 '+clock(remaining(c)):'已到时，等待结算';
    }

    function emptyDirectory() {
      const loading=engine.farmLoading, error=engine.farmError;
      return `<div class="farm-empty"><span class="farm-empty-emblem">${I(error?'wind':'users')}</span><h3>${loading?'正在寻访云间道友':error?'名册暂未连接':'还没有其他道友入境'}</h3><p>${loading?'稍候片刻，仙山名册即将展开。':error?E(error):'其他学生进入云端洞天后，会出现在这里。先照料自己的灵草，静候同学相逢。'}</p>${loading?'':newBatchButton()}</div>${batchBar()}`;
    }
    // 智慧课堂：今天刷到的这一批（每批 5 位；前 5 批免费，之后每批先答对一道修炼场的题，最多再 5 批）
    function batchBar() {
      const b=engine.farmBatch;
      if(!b) return '';
      return `<div class="farm-batch-bar"><span>${I('users')}今天第 <b>${E(b.no)}</b> 批道友</span><span>免费换批还剩 <b>${E(b.freeLeft)}</b> / ${E(b.freeTotal)}</span><span>答题换批还剩 <b>${E(b.quizLeft)}</b> / ${E(b.quizTotal)}</span></div>`;
    }
    function newBatchButton() {
      const b=engine.farmBatch, done=b && b.freeLeft<1 && b.quizLeft<1;
      const label=done?'今天的刷新已用完':b && b.freeLeft<1?'答一道题，换一批道友':'换一批道友';
      return button('new-batch',I('reset')+label,false,engine.farmLoading || engine.busy || !!done);
    }
    function directoryMarkup() {
      const farms=engine.getNeighbors();
      return `<div class="farm-shell"><div class="farm-directory-intro"><span class="farm-mode">${I('users')}同学的真实洞天</span><span>今日还可探访 <b>${E(engine.getAlchemyInfo().stealAttemptsLeft)}</b> / ${E(engine.farmRules.dailyAttempts)} 田</span></div><p class="farm-intro">道友名单每批随机 5 位（全校各课、各届都可能刷到，优先刷到有成熟灵草的）。成熟才可采，同人同田每茬一次；每块田的共享偷采额度仅 1 株。每次偷采有 ${E(engine.farmRules.guardChance)}% 概率触发守田阵法，题目来自本课程的修炼场：答对才采得到，答错、超时或放弃按灵草等级赔 5～30 灵石给田主。一键偷采在元婴解锁。</p>${batchBar()}${farms.length?`<div class="farm-directory-grid">${farms.map(f=>`<article class="farm-directory-card"><div class="farm-person"><span class="avatar" style="--farm-avatar:${color(f.color)}">${E(f.avatar || '友')}</span><div><h3>${E(f.name)}</h3><p>${E(f.title)}</p></div></div><div class="farm-directory-facts"><span>${I('grid')}${E(f.openCount)} 块灵田</span><span class="${f.stealableCount?'is-ripe':''}">${I('leaf')}${f.stealableCount?E(f.stealableCount)+' 田可探访':'静候下一场丰收'}</span></div>${button('visit',I('wind')+'拜访洞天',false,engine.farmLoading,`data-farmer="${E(f.id)}"`)}</article>`).join('')}</div><div class="farm-directory-footer"><small>道友们看到的是昵称，不展示账户与行囊。</small><div>${newBatchButton()}</div></div>`:emptyDirectory()}</div>`;
    }
    function renderDirectory(force=false) {
      if (!visible('farm-directory')) return;
      const signature=JSON.stringify([engine.getNeighbors(),engine.farmLoading,engine.farmError,engine.nextFarmCursor,engine.getAlchemyInfo().stealAttemptsLeft,engine.farmBatch,engine.busy]);
      if (!force && signature===directorySignature) return;
      directorySignature=signature;
      const scroll=host().scrollTop;
      host().innerHTML=directoryMarkup();
      host().scrollTop=scroll;
    }
    async function openDirectory() {
      if (!engine.online) return;
      directorySignature='';
      options.openDialog('farm-directory','云间道友',directoryMarkup());
      await engine.loadNeighbors(); renderDirectory(true);
    }

    function guardMarkup() {
      const c=engine.pendingChallenge;
      if (!c) {
        const success=outcome?.ok===true && outcome?.type==='success';
        return `<div class="farm-shell"><div class="farm-result ${success?'is-success':''}" role="status"><span class="farm-result-emblem">${I(success?'leaf':'formation')}</span><span class="farm-mode">守田阵法 · 本次已结算</span><h3>${success?'阵法已解，仙草入囊':outcome?.type==='failed'?'本次探访止步于此':'这道阵法已经结束'}</h3><p>${E(outcome?.message || '请查看来访记录，或继续照料自己的灵田。')}</p>${outcome?.penalty?`<p class="farm-result-payment">已赔给田主 ${E(outcome.penalty)} 灵石</p>`:''}${outcome?.refunded?`<p class="farm-result-refund">已退回 ${E(outcome.refunded)} 灵石赔付金</p>`:''}${success&&outcome?.cropId?`<strong class="farm-result-reward">${E(cropName(outcome.cropId))} +${E(outcome.qty || 1)}</strong>`:''}<div class="farm-result-actions">${button('close','返回灵田')}${button('history','查看来访记录',true)}</div></div></div>`;
      }
      if (questionId!==c.id) {questionId=c.id;selectedOption='';outcome=null;abandonConfirm=false;}
      const expired=remaining(c)<=0, question=c.question;
      const blocked=disabled() || expired;
      return `<div class="farm-shell">${batchSummaryMarkup(true)}<section class="guard-banner"><span class="guard-banner-seal" aria-hidden="true">${I('formation')}</span><div><span class="farm-mode">阵纹流转 · 答题破阵</span><h3>守田阵法已触发</h3><p>${E(c.farmerName)} · 第 ${E(c.plotIndex+1)} 田 · ${E(cropName(c.cropId))}</p></div><div class="guard-clock"><time data-guard-clock>${clock(remaining(c))}</time><small>${expired?'本次已到时':'剩余答题时间'}</small></div></section><div class="guard-escrow"><span>${I('lock')}已冻结赔付金</span><strong>${E(c.frozenStones ?? c.penalty)} <small>灵石</small></strong><p>答对退回；答错、超时或放弃，赔给田主。</p></div><div class="guard-topic"><span>${E(question.subject || '守田问道')}</span>${engine.questionBank?.mode==='demo'?'<span class="guard-demo">游戏规则示例题</span>':''}<span>单选 · 一次提交</span></div><fieldset class="guard-question" ${blocked?'disabled':''}><legend>${E(question.stem)}</legend><div class="guard-options">${question.options.map((choice,index)=>`<label class="guard-option${selectedOption===choice.id?' is-selected':''}"><input type="radio" name="guard-option" value="${E(choice.id)}" ${selectedOption===choice.id?'checked':''}><span class="guard-option-letter">${E(String.fromCharCode(65+index))}</span><span class="guard-option-text">${E(choice.text)}</span><span class="guard-option-check" aria-hidden="true">${I('check')}</span></label>`).join('')}</div></fieldset>${engine.pending?'<p class="guard-notice" role="status">操作尚待确认，请先同步云端。同一次提交会沿用原操作编号。</p>'+button('sync',I('reset')+'同步本次操作',true,actionBusy || engine.busy)+'':expired?'<p class="guard-notice" role="status">答题时间已结束。点击下方同步结果，本次机会不会重新开始。</p>':''}<div class="guard-actions">${expired?button('sync',I('reset')+'同步结算结果',false,actionBusy || engine.busy):button('answer',actionBusy?'正在判定…':I('formation')+'提交答案，尝试破阵',false,blocked || !selectedOption)}${button('close','暂时收起',true,actionBusy)}${button('request-abandon','放弃本次',true,blocked)}</div>${abandonConfirm?`<div class="guard-abandon-confirm" role="group" aria-label="确认放弃本次阵法"><strong>放弃本次，将赔付 ${E(c.penalty)} 灵石</strong><p>赔付金交给田主，本田本茬不能再试。</p><div>${button('abandon','确认放弃并赔付 '+E(c.penalty)+' 灵石',false,blocked)}${button('cancel-abandon','继续答题',true,actionBusy)}</div></div>`:''}<div class="guard-rules"><p>${I('lock')}答错、超时或放弃，本田本茬不能再试，并赔 ${E(c.penalty)} 灵石给田主。</p><p>收起或刷新会保留同一道题，倒计时继续。答题期间田主仍可收割，提交时灵草与可采额度仍在，答对才可获得 1 株。若答对时灵草已收走或额度已用完，赔付金也会退回。</p></div></div>`;
    }
    function renderGuard(force=false) {
      if (!visible('guard')) return;
      const c=engine.pendingChallenge;
      const signature=JSON.stringify([c,selectedOption,disabled(),!!c&&remaining(c)<=0,outcome,abandonConfirm,lastBatch,engine.questionBank?.mode]);
      if (force || signature!==guardSignature) {
        guardSignature=signature;
        const scroll=host().scrollTop, focused=document.activeElement;
        const focusedValue=focused?.name==='guard-option'?focused.value:null;
        const focusedAction=focused?.dataset?.farmUi;
        host().innerHTML=guardMarkup(); host().scrollTop=scroll;
        if(focusedValue) Array.from(host().querySelectorAll('input[name="guard-option"]')).find(input=>input.value===focusedValue)?.focus({preventScroll:true});
        else if(focusedAction) host().querySelector(`[data-farm-ui="${focusedAction}"]:not(:disabled)`)?.focus({preventScroll:true});
      }
      const timer=host().querySelector('[data-guard-clock]');
      if(timer && c) timer.textContent=clock(remaining(c));
    }
    function openChallenge() {
      if (!engine.online || !engine.pendingChallenge) return;
      guardSignature=''; outcome=null;abandonConfirm=false;
      options.openDialog('guard','守田问道',guardMarkup());
      renderGuard(true);
    }
    function showResult(result, originRevision) {
      outcome=result;
      if(result?.batch) {
        lastBatch={qty:result.qty || 0,attempted:result.attempted || 0,message:result.message || '本轮批量探访已结束。',challengeId:engine.pendingChallenge?.id || null};
        (result.items || []).filter(item=>item.qty>0).forEach((item,index)=>options.onHarvest?.({...item,farmerId:item.farmerId || result.farmerId,delay:index*65}));
      } else if(result?.ok && result.type==='success') options.onHarvest?.(result);
      // A late reply keeps its server-issued challenge available in the HUD,
      // but must not replace a window the player opened while waiting.
      const originStillActive=typeof options.getNavigationRevision!=='function' || originRevision===options.getNavigationRevision();
      if (engine.pendingChallenge && result?.type==='challenge' && (originStillActive || visible('guard'))) openChallenge();
      else if(visible('guard')) renderGuard(true);
      options.renderGame?.();
    }
    async function attempt(farmerId,plotIndex) {
      if(!engine.online || actionBusy || engine.busy) return;
      if(engine.pendingChallenge) {openChallenge();return;}
      const originRevision=options.getNavigationRevision?.();
      actionBusy=true;
      try {showResult(await engine.beginSteal(farmerId,plotIndex),originRevision);}
      finally {actionBusy=false;renderGuard(true);panel();}
    }
    async function attemptAll(farmerId) {
      if(!engine.online || actionBusy || engine.busy) return;
      if(engine.pendingChallenge) {openChallenge();return;}
      const originRevision=options.getNavigationRevision?.();
      actionBusy=true;
      try {showResult(await engine.stealAll(farmerId),originRevision);}
      finally {actionBusy=false;renderGuard(true);panel();}
    }
    async function answer() {
      const c=engine.pendingChallenge;
      if(!c || !selectedOption || disabled() || remaining(c)<=0) return;
      const choice=selectedOption;
      actionBusy=true; renderGuard(true);
      try {showResult(await engine.answerChallenge(c.id,choice));}
      finally {actionBusy=false;renderGuard(true);panel();}
    }
    async function abandon() {
      const c=engine.pendingChallenge;
      if(!c || disabled()) return;
      actionBusy=true;renderGuard(true);
      try {showResult(await engine.abandonChallenge(c.id));}
      finally {actionBusy=false;renderGuard(true);panel();}
    }

    const statusText={pending:'阵法待解',success:'偷采成功',wrong:'答错止步',incorrect:'答错止步',expired:'超时止步',abandoned:'主动放弃',unavailable:'灵草已被收取',failed:'未能采得'};
    function historyMarkup() {
      const history=engine.farmHistory || [],error=activityHistoryError || engine.farmError,loading=engine.farmLoading || !!activityHistoryRequest;
      return `<div class="farm-shell"><div class="farm-directory-intro"><span class="farm-mode">${I('book')}守田往来</span>${button('refresh-history',I('reset')+'刷新',true,loading)}</div><p class="farm-intro">记录你与道友最近的探访。成功偷采会转移 1 株灵草，答题失败、超时或放弃，会将冻结的赔付金交给田主；失败不会减少田主的灵草。</p>${error?`<p class="guard-notice" role="status">${E(error)}${history.length?' · 下方为已读取的记录。':' · 可点击刷新重试。'}</p>`:''}${history.length?`<div class="farm-history-list">${history.map(entry=>`<article class="farm-history-row"><span class="farm-history-icon ${entry.status==='success'?'is-success':''}">${I(entry.status==='success'?'leaf':'formation')}</span><div><div class="farm-history-title"><strong>${entry.direction==='incoming'?E(entry.alias)+'来访':'拜访'+E(entry.alias)}</strong><span>${E(statusText[entry.status] || '已结束')}</span></div><p>第 ${E(entry.plotIndex+1)} 田 · ${E(cropName(entry.cropId))} · ${entry.triggered?'触发守田阵法':'未触发阵法'}${entry.qty?' · '+(entry.direction==='incoming'?'被摘走':'获得')+' '+E(entry.qty)+' 株':''}${entry.penalty?' · '+(entry.direction==='incoming'?'获得赔付':'赔付')+' '+E(entry.penalty)+' 灵石':''}</p><time>${E(Number.isFinite(entry.time)?formatTime.format(new Date(entry.time)):'—')}（北京时间）</time></div></article>`).join('')}</div>`:`<div class="farm-empty"><span class="farm-empty-emblem">${I('book')}</span><h3>仙山往来，尚待落笔</h3><p>${loading?'正在读取来访小记。':'同学来访或你开始探访后，这里会留下记录。'}</p></div>`}</div>`;
    }
    function renderHistory(force=false) {
      if(!visible('farm-history')) return;
      const signature=JSON.stringify([engine.farmHistory,engine.farmLoading,!!activityHistoryRequest,engine.farmError,activityHistoryError]);
      if(!force && signature===historySignature) return;
      historySignature=signature;
      const scroll=host().scrollTop;host().innerHTML=historyMarkup();host().scrollTop=scroll;
    }
    function refreshActivityHistory(force=false) {
      const node=document.getElementById('activity-history'),pane=document.getElementById('activity-guard'),sheet=document.getElementById('quests-panel');
      if(!node || !pane || pane.hidden || !sheet || sheet.hidden)return;
      panel();
      const signature=JSON.stringify([engine.online,engine.farmHistory,engine.farmLoading,!!activityHistoryRequest,engine.farmError,activityHistoryError]);
      if(!force && signature===activityHistorySignature)return;
      activityHistorySignature=signature;
      const scroll=sheet.scrollTop,focused=document.activeElement;
      const action=focused?.closest?.('#activity-history')===node?focused.dataset?.farmUi:null;
      node.innerHTML=engine.online?historyMarkup():`<div class="farm-empty"><span class="farm-empty-emblem">${I('formation')}</span><h3>守田往来 · 云端相逢</h3><p>登录云端洞天后，这里会记录同学来访、自己的探访和守田阵法结果。本机练习使用模拟道友，不产生同学来访记录。</p></div>`;
      sheet.scrollTop=scroll;
      if(action)node.querySelector(`[data-farm-ui="${action}"]:not(:disabled)`)?.focus({preventScroll:true});
    }
    async function loadActivityHistory() {
      if(!engine.online) {refreshActivityHistory();return;}
      if(activityHistoryRequest)return activityHistoryRequest;
      if(engine.farmLoading) {refreshActivityHistory();return;}
      activityHistoryError='';
      // Refresh only the still-visible history host. A late response may update
      // the cache, but cannot reopen a sheet or replace another game window.
      activityHistoryRequest=Promise.resolve().then(()=>engine.loadNeighbors())
        .catch(error=>{activityHistoryError=error?.message || '来访小记暂未读取成功';})
        .finally(()=>{activityHistoryRequest=null;refreshActivityHistory(true);renderHistory(true);});
      refreshActivityHistory(true);renderHistory(true);
      return activityHistoryRequest;
    }
    async function openHistory() {
      if(!engine.online) return;
      historySignature='';options.openDialog('farm-history','来访小记',historyMarkup());
      await loadActivityHistory();renderHistory(true);
    }
    async function dispatch(action,buttonNode) {
      if(action==='directory') return openDirectory();
      if(action==='resume') return openChallenge();
      if(action==='answer') return answer();
      if(action==='request-abandon'){abandonConfirm=true;renderGuard(true);return;}
      if(action==='cancel-abandon'){abandonConfirm=false;renderGuard(true);return;}
      if(action==='abandon') return abandon();
      if(action==='close') return typeof options.closeDialog==='function' ? options.closeDialog() : document.getElementById('game-dialog').close();
      if(action==='history') return openHistory();
      if(action==='visit') {
        const ok=await options.visitFarm(buttonNode.dataset.farmer);
        if(ok && visible('farm-directory')) {
          if(typeof options.dismissDialog==='function') options.dismissDialog();
          else document.getElementById('game-dialog').close();
        }
        return;
      }
      if(action==='sync') {await engine.refresh();renderGuard(true);return;}
      if(action==='new-batch') {
        await engine.refreshFarms();   // 结果提示由 online-client 的 settle 统一弹出，这里不再重复
        renderDirectory(true);return;
      }
      if(action==='refresh-directory' || action==='more-directory') {
        await engine.loadNeighbors(action==='more-directory'?engine.nextFarmCursor:undefined);renderDirectory(true);return;
      }
      if(action==='refresh-history') {await loadActivityHistory();renderHistory(true);}
    }
    return {
      attempt,attemptAll,openDirectory,openChallenge,openHistory,refreshActivityHistory,loadActivityHistory,
      initialize(){if(engine.online) void engine.loadNeighbors();},
      refresh(kind){panel();refreshActivityHistory();if(kind==='guard')renderGuard();if(kind==='farm-directory')renderDirectory();if(kind==='farm-history')renderHistory();},
      handleClick(event){const buttonNode=event.target.closest('[data-farm-ui]');if(!buttonNode)return false;if(!buttonNode.disabled) void dispatch(buttonNode.dataset.farmUi,buttonNode).catch(error=>options.toast(error.message || '这次操作暂未完成，请稍后重试。','error'));return true;},
      handleChange(event){if(event.target.name!=='guard-option')return false;selectedOption=event.target.value;renderGuard(true);return true;}
    };
  }
  global.SpiritFarmUI={create};
})(window);
