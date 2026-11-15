/* Shared OHLCV view for settled herb, pill and course-card trades. No synthetic prices. */
(function (global) {
  'use strict';
  const INTERVALS = [['15m', '15分钟'], ['1h', '1小时'], ['1d', '日线']];
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('zh-CN', {maximumFractionDigits:2}) : '—';
  const time = (value, day = false) => new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',...(day ? {} : {hour:'2-digit',minute:'2-digit',hour12:false})}).format(new Date(value));
  function normalize(history) {
    if (!history || !INTERVALS.some(([id]) => id === history.interval) || !Array.isArray(history.candles)) return [];
    return history.candles.filter(c => c && ['time','endTime','open','high','low','close','volume','turnover','tradeCount'].every(k => Number.isFinite(c[k])) && Math.abs(c.time) <= 8640000000000000 && Math.abs(c.endTime) <= 8640000000000000 && c.time < c.endTime && c.open > 0 && c.close > 0 && c.low > 0 && c.high >= Math.max(c.open,c.close) && c.low <= Math.min(c.open,c.close) && c.high >= c.low && c.volume > 0 && c.turnover > 0 && c.tradeCount > 0).sort((a,b) => a.time-b.time).slice(-96);
  }
  function candleText(c, unit = '份') {
    return c ? `${time(c.time)}—${time(c.endTime)}；开 ${fmt(c.open)}，高 ${fmt(c.high)}，低 ${fmt(c.low)}，收 ${fmt(c.close)} 灵石；成交量 ${fmt(c.volume)} ${unit}，成交额 ${fmt(c.turnover)} 灵石，${fmt(c.tradeCount)} 笔${c.complete ? '' : '；本周期未结束'}` : '尚无成交记录';
  }
  function readout(c, unit) {
    if (!c) return '<span class="mc-readout-placeholder">成交后显示开、高、低、收及成交量</span>';
    const up = c.close >= c.open;
    return `<div class="mc-readout-time"><strong>${E(time(c.time))}</strong><span>${c.complete?'已结束':'形成中'}</span></div><div class="mc-ohlc ${up?'mc-up':'mc-down'}">${[['开',c.open],['高',c.high],['低',c.low],['收',c.close]].map(([label,value])=>`<span>${label}<b>${fmt(value)}</b></span>`).join('')}</div><div class="mc-volume-info"><span>量 <b>${fmt(c.volume)}</b> ${E(unit)}</span><span>额 <b>${fmt(c.turnover)}</b> 灵石</span><span>${fmt(c.tradeCount)} 笔</span></div>`;
  }
  function geometry(history, candles) {
    const width=760,left=56,right=736,top=22,bottom=201,volumeTop=231,volumeBottom=271;
    const step={'15m':900000,'1h':3600000,'1d':86400000}[history?.interval]||3600000;
    const first=candles[0]?.time ?? 0,last=candles.at(-1)?.time ?? first;
    // Real temporal spacing is kept, including empty intervals. There are no filled-price candles.
    const from=Math.max(Number.isFinite(history?.from)?history.from:first-step,first-step),to=Math.max(last+step*2,from+step*4);
    let low=Math.min(...candles.map(c=>c.low)),high=Math.max(...candles.map(c=>c.high));
    const pad=Math.max((high-low)*.13,high*.025,1);low=Math.max(0,low-pad);high+=pad;
    const x=t=>left+(t-from)/(to-from)*(right-left),y=p=>bottom-(p-low)/(high-low)*(bottom-top);
    const maxVolume=Math.max(...candles.map(c=>c.volume),1),bar=Math.max(2,Math.min(24,(right-left)*step/(to-from)*.58));
    return {width,left,right,top,bottom,volumeTop,volumeBottom,from,to,step,low,high,x,y,maxVolume,bar};
  }
  function markup(history, options={}) {
    const interval=options.interval||history?.interval||'1h',unit=options.unit||'份',candles=normalize(history);
    let selected=candles.findIndex(c=>c.time===options.selectedTime);if(selected<0)selected=candles.length-1;
    const c=candles[selected];
    let plot='';
    if(candles.length){
      const g=geometry(history,candles);
      const grid=Array.from({length:4},(_,i)=>{const value=g.low+(g.high-g.low)*(3-i)/3,y=g.y(value);return `<g class="mc-grid"><line x1="${g.left}" y1="${y}" x2="${g.right}" y2="${y}"/><text x="${g.left-9}" y="${y+4}" text-anchor="end">${fmt(value)}</text></g>`;}).join('');
      const bodies=candles.map((item,index)=>{const x=g.x(item.time+g.step/2),open=g.y(item.open),close=g.y(item.close),height=Math.max(1.8,Math.abs(open-close)),up=item.close>=item.open;return `<g class="mc-candle ${up?'mc-up':'mc-down'}${item.complete?'':' is-forming'}" data-mc-index="${index}"><line class="mc-wick" x1="${x}" y1="${g.y(item.high)}" x2="${x}" y2="${g.y(item.low)}"/><rect class="mc-body" x="${x-g.bar/2}" y="${Math.min(open,close)-(height===1.8?.9:0)}" width="${g.bar}" height="${height}" rx=".7"/><rect class="mc-volume" x="${x-g.bar/2}" y="${g.volumeBottom-(item.volume/g.maxVolume)*(g.volumeBottom-g.volumeTop)}" width="${g.bar}" height="${Math.max(1,(item.volume/g.maxVolume)*(g.volumeBottom-g.volumeTop))}" rx=".5"/><title>${E(candleText(item,unit))}</title></g>`;}).join('');
      const ticks=[0,.5,1].map(ratio=>{const t=g.from+(g.to-g.from)*ratio;return `<text class="mc-time-label" x="${g.left+(g.right-g.left)*ratio}" y="293" text-anchor="${ratio===0?'start':ratio===1?'end':'middle'}">${E(time(t,interval==='1d'))}</text>`;}).join('');
      const x=g.x(c.time+g.step/2);
      plot=`<div class="mc-plot"><svg data-mc-chart viewBox="0 0 760 304" role="img" tabindex="0" aria-label="${E(options.title||'成交K线')}。左右方向键逐根查看，Home查看首根，End查看最新。"><rect class="mc-plot-paper" x="${g.left}" y="${g.top}" width="${g.right-g.left}" height="${g.bottom-g.top}" rx="2"/>${grid}<text class="mc-axis-label" x="${g.left}" y="12">价格 · 灵石</text><text class="mc-axis-label" x="${g.left}" y="222">成交量 · ${E(unit)}</text><line class="mc-volume-base" x1="${g.left}" y1="${g.volumeBottom}" x2="${g.right}" y2="${g.volumeBottom}"/>${bodies}<line data-mc-cursor class="mc-cursor" x1="${x}" y1="${g.top}" x2="${x}" y2="${g.volumeBottom}"/><circle data-mc-dot class="mc-dot" cx="${x}" cy="${g.y(c.close)}" r="4"/>${ticks}</svg></div>`;
    }else{
      plot=`<div class="mc-empty"><span aria-hidden="true">⌁</span><strong>${options.loading?'正在读取成交走势':E(options.emptyTitle||'尚未形成成交K线')}</strong><p>${E(options.emptyMessage||'买卖双方成交后，这里会出现真实价格走势。挂单和撤单不会生成K线。')}</p></div>`;
    }
    return `<section class="market-chart" aria-label="${E(options.title||'成交K线')}"><header class="mc-header"><div><span class="mc-eyebrow">坊市行情 · 北京时间</span><h4>${E(options.title||'成交走势')} <small>K线</small></h4></div><div class="mc-intervals" role="group" aria-label="K线周期">${INTERVALS.map(([id,label])=>`<button type="button" data-mc-interval="${id}" aria-pressed="${id===interval}" ${options.disabled?'disabled':''}>${label}</button>`).join('')}</div></header><div class="mc-readout" data-mc-readout>${readout(c,unit)}</div>${plot}<footer class="mc-footer"><span class="mc-legend"><i class="mc-up"></i>收 ≥ 开 <i class="mc-down"></i>收 &lt; 开</span><span>${candles.length?'点按或移动查看 · 方向键逐根阅读':'仅统计真实成交'}${options.loading?' · 更新中…':''}</span></footer><details class="mc-explainer"><summary>怎么看 K 线？</summary><p>每根蜡烛表示一个周期：实体两端是开盘价与收盘价，上下影线是最高价与最低价，下方柱形是成交数量。日线按北京时间 00:00 划分；“形成中”表示本周期尚未结束。无成交的时段留空，不延用旧价造出蜡烛。最多显示最近 96 个周期内的成交。</p></details><span data-mc-live class="mc-sr-only" aria-live="polite"></span></section>`;
  }
  function bind(host,history,options={}) {
    if(!host)return ()=>{};
    const candles=normalize(history),svg=host.querySelector('[data-mc-chart]'),g=candles.length?geometry(history,candles):null;
    let selected=candles.findIndex(c=>c.time===options.selectedTime);if(selected<0)selected=candles.length-1;
    function select(index,announce=false){
      if(!g||index<0||index>=candles.length||index===selected&&!announce)return;
      selected=index;const c=candles[index],x=g.x(c.time+g.step/2),read=host.querySelector('[data-mc-readout]'),cursor=host.querySelector('[data-mc-cursor]'),dot=host.querySelector('[data-mc-dot]');
      if(read)read.innerHTML=readout(c,options.unit||'份');
      if(cursor){cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}if(dot){dot.setAttribute('cx',x);dot.setAttribute('cy',g.y(c.close));}
      if(announce){const live=host.querySelector('[data-mc-live]');if(live)live.textContent=candleText(c,options.unit||'份');}
      options.onSelect?.(c.time);
    }
    function pointer(event){
      if(!g||!svg||event.type==='pointermove'&&event.pointerType==='touch')return;
      const box=svg.getBoundingClientRect();if(!box.width)return;const x=(event.clientX-box.left)/box.width*760;
      if(x<g.left||x>g.right)return;
      let nearest=0,distance=Infinity;candles.forEach((c,i)=>{const next=Math.abs(g.x(c.time+g.step/2)-x);if(next<distance){distance=next;nearest=i;}});select(nearest,event.type==='pointerdown');
    }
    function key(event){if(!g)return;const map={ArrowLeft:Math.max(0,selected-1),ArrowRight:Math.min(candles.length-1,selected+1),Home:0,End:candles.length-1};if(!Object.hasOwn(map,event.key))return;event.preventDefault();event.stopPropagation();select(map[event.key],true);}
    function click(event){const button=event.target.closest?.('[data-mc-interval]');if(button&&host.contains(button)&&!button.disabled&&INTERVALS.some(([id])=>id===button.dataset.mcInterval))options.onInterval?.(button.dataset.mcInterval);}
    host.addEventListener('click',click);svg?.addEventListener('pointermove',pointer);svg?.addEventListener('pointerdown',pointer);svg?.addEventListener('keydown',key);
    return ()=>{host.removeEventListener('click',click);svg?.removeEventListener('pointermove',pointer);svg?.removeEventListener('pointerdown',pointer);svg?.removeEventListener('keydown',key);};
  }
  global.SpiritMarketChart=Object.freeze({markup,bind,normalize,candleText});
})(typeof window==='undefined'?globalThis:window);
