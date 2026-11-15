/* Native courtyard portraits. All entries share the pine portrait's warm paper,
 * layered colour and softly lit, dimensional forms. No remote assets or filters. */
(function (global) {
  'use strict';
  let sequence = 0;
  const legacy = {
    bambooFence: ['青竹篱','#587c4a','#e7edd9'], stoneLantern: ['暖玉石灯','#728468','#ecebd8'],
    spiritPond: ['照影灵池','#598e7a','#e3ece0'], masterStele: ['百草精通碑','#6e8561','#e6ebd8'],
    springBanner: ['春山百草旗','#6a985a','#e7efd8'], summerBanner: ['夏夜听泉旗','#548f89','#e3ede4'],
    autumnBanner: ['秋山丰收旗','#b97943','#f0e5ce'], winterBanner: ['雪夜丹心旗','#688c9b','#e8edef'],
    sectGate: ['同心山门','#5e8265','#e7eddb'], sectSpring: ['共济灵泉','#65937c','#e4eddf'],
    sectLibrary: ['藏书小阁','#5c806b','#e5ecdc']
  };
  const ids = new Set(['lotusPond','moonArch','jadePavilion','blossomTree','verdantPine','banyanTree','weepingWillow','bambooResidence','mapleCourtyard','moonResidence','starResidence',...Object.keys(legacy)]);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const line = (d,color,width=2,extra='') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const path = (d,fill,extra='') => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const rect = (x,y,w,h,fill,r=0,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
  const ellipse = (x,y,rx,ry,fill,extra='') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const circle = (x,y,r,fill,extra='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
  const paint = (uid,key) => `url(#${uid}-${key})`;
  function gradient(id,colors,horizontal=false) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="${horizontal?'1':'.18'}" y2="${horizontal?'0':'1'}">${colors.map((c,i)=>`<stop offset="${i/(colors.length-1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  }
  function materials(uid,t={}) {
    return `<defs>${gradient(uid+'-stone',['#e9e5cb','#c8cbb1','#9fae94'])}${gradient(uid+'-stone-side',['#bcc2a7','#82937d'])}${gradient(uid+'-wood',[t.woodLight||'#c2a877',t.wood||'#94784f',t.woodDark||'#685d3d'],true)}${gradient(uid+'-wall',[t.wallLight||'#f1e7c8',t.wall||'#d7c9a3','#b6b38f'])}${gradient(uid+'-roof',[t.roofLight||'#94ad7d',t.roof||'#668b64',t.roofDark||'#365e4b'])}${gradient(uid+'-roof-side',[t.roof||'#668b64',t.roofDark||'#365e4b'])}${gradient(uid+'-water',['#d2e4bd','#94bda4','#568d7f'])}${gradient(uid+'-leaf',['#aac181','#6b945b','#3b6748'])}${gradient(uid+'-pink',['#fff0d9','#e5b6ad','#b77880'])}${gradient(uid+'-maple',['#edc783','#cf8b51','#9b5544'])}${gradient(uid+'-lamp',['#fff6ce','#ecd597','#c5a76d'])}${gradient(uid+'-cloth',[t.clothLight||'#a9be83',t.cloth||'#718e58',t.clothDark||'#44673e'],true)}</defs>`;
  }
  function ground(x=242,y=257,w=124) {
    return ellipse(x,y+4,w,12,'#718664','opacity=".12"')+path(`M${x-w-7} ${y}q18-16 45-10 31-17 60-6 40-12 64 3 36-1 53 13-62 18-222 0Z`,'#9eaf7f','opacity=".32"');
  }
  function rock(x,y,s=1,uid='') {
    return `<g transform="translate(${x} ${y}) scale(${s})">${path('M-15 4-9-9 3-14 14-6 19 5 4 10Z',uid?paint(uid,'stone-side'):'#a5ad91')}${path('M-15 4-9-9 3-14 7-3-2 5Z','#d1d2b5')}${path('M3-14 14-6 19 5 7-3Z','#b7c0a5')}${line('M-9-8-1-10','#e5dfc1',1.2)}</g>`;
  }
  function sprig(x,y,s=1,tone='#7d9d5e') {
    return `<g transform="translate(${x} ${y}) scale(${s})">${path('M0 0Q-15-4-14-20-2-17 0-4 1-23 12-29 18-17 2 0Z',tone)}${line('M0 0 8-21M0-2-10-16','#b1c487',1)}</g>`;
  }
  function tuft(x,y,s=1) { return sprig(x,y,s)+sprig(x+10*s,y+2*s,.54*s,'#a0b576'); }
  function slab(x,y,w,d=25,uid,steps=false) {
    const l=x-w/2,r=x+w/2,h=8;
    let s=path(`M${l} ${y}H${r}l${d} ${-d*.45}v${h}l${-d} ${d*.45}H${l}Z`,paint(uid,'stone-side'));
    s+=path(`M${l} ${y}l${d} ${-d*.45}H${r+d}l${-d} ${d*.45}Z`,paint(uid,'stone'));
    s+=line(`M${l+3} ${y}H${r}l${d-2} ${-d*.45}`,'#f5edd3',1.5);
    for(let n=1;n<5;n++){const xx=l+n*w/5;s+=line(`M${xx} ${y}l${d} ${-d*.45}`,'#a3b097',.8,'opacity=".52"');}
    if(steps) for(let n=0;n<3;n++) s+=slab(x+10,y+10+n*5,w*.28+n*5,9,uid);
    return s;
  }
  function post(x,y,h,uid,w=8) {
    return rect(x-w/2-3,y-5,w+6,9,paint(uid,'stone'),2)+rect(x-w/2,y-h,w,h-3,paint(uid,'wood'),1)+line(`M${x-1} ${y-h+4}V${y-9}`,'#e2ca92',1.3,'opacity=".65"')+rect(x-w/2-3,y-h-3,w+6,7,'#d1bc86',1);
  }
  function roof(x,y,w,rise,uid,depth=24) {
    const l=x-w/2,r=x+w/2,rr=x+w*.15,rl=x-w*.21;
    let s=path(`M${rr} ${y-rise}l${depth} ${-depth*.45}Q${r+depth-17} ${y-depth*.45+3} ${r+depth+5} ${y-depth*.45-9}l-5 14-${depth} ${depth*.45+7}Z`,paint(uid,'roof-side'));
    s+=path(`M${l-7} ${y-8}Q${l+17} ${y+1} ${rl} ${y-rise+2}L${rr} ${y-rise}Q${r-21} ${y+2} ${r+5} ${y-9}l-7 17Q${x} ${y+12} ${l} ${y+6}Z`,paint(uid,'roof'));
    s+=path(`M${l} ${y+6}Q${x} ${y+12} ${r-2} ${y+8}l${depth} ${-depth*.45-1}v5l${-depth} ${depth*.45}Q${x} ${y+17} ${l} ${y+11}Z`,'#395746','opacity=".83"');
    for(let n=0;n<17;n++){
      const t=n/16,a=rl+(rr-rl)*t,b=l+5+(w-10)*t;
      s+=line(`M${a} ${y-rise+3}Q${a+(b-a)*.57} ${y-rise*.22} ${b} ${y+6}`,'#c1d0a1',1.05,'opacity=".63"');
    }
    for(let n=1;n<4;n++){const q=n/4,ww=w*(.32+.68*q),yy=y-rise*(1-q);s+=line(`M${x-ww*.53} ${yy}Q${x-5} ${yy+5} ${x+ww*.48} ${yy-1}`,'#345b49',.85,'opacity=".34"');}
    s+=line(`M${l-7} ${y-8}Q${l+8} ${y+6} ${x} ${y+8}Q${r-8} ${y+13} ${r+5} ${y-9}L${r+depth+5} ${y-depth*.45-9}`,'#d4c28b',2.5);
    s+=line(`M${rl-6} ${y-rise+1}Q${rl} ${y-rise-4} ${rl+8} ${y-rise+1}L${rr} ${y-rise}l${depth} ${-depth*.45}`,'#cdb979',3.2);
    s+=line(`M${rl+4} ${y-rise-1}L${rr} ${y-rise-2}`,'#efdaa0',1.1);
    return s;
  }
  function windowPanel(x,y,w,h,uid,round=false) {
    let s=round?circle(x+w/2,y+h/2,w/2,paint(uid,'wood')):rect(x-2,y-2,w+4,h+4,paint(uid,'wood'),1);
    s+=round?circle(x+w/2,y+h/2,w/2-3,paint(uid,'lamp')):rect(x+1,y+1,w-2,h-2,paint(uid,'lamp'),1);
    const cx=x+w/2,cy=y+h/2;
    s+=line(`M${cx} ${y+3}V${y+h-3}M${x+3} ${cy}H${x+w-3}`,'#897f55',1.7);
    if(round) s+=line(`M${x+w*.2} ${y+h*.2}L${x+w*.8} ${y+h*.8}M${x+w*.2} ${y+h*.8}L${x+w*.8} ${y+h*.2}`,'#9b8f5c',1.1);
    else { s+=line(`M${x+w*.27} ${y+3}V${y+h-3}M${x+w*.73} ${y+3}V${y+h-3}`,'#a39a69',.9);s+=line(`M${x+3} ${y+h*.27}H${x+w-3}M${x+3} ${y+h*.73}H${x+w-3}`,'#a39a69',.9); }
    return s;
  }
  function lamp(x,y,uid,s=1) {
    return `<g transform="translate(${x} ${y}) scale(${s})">${ellipse(0,5,17,22,'#f5df9e','opacity=".13"')}${line('M0-15V-4','#8f8258',1.8)}${rect(-8,-4,16,22,paint(uid,'lamp'),5)}${line('M-7-2H7M-7 16H7M0 18v8','#9b8455',2)}${line('M-3-1V14M3-1V14','#e8bd73',1)}${path('m-2 25 2-3 2 3v5h-4Z','#c9a566')}</g>`;
  }
  function railing(x,y,w,uid,slant=0) {
    let s=line(`M${x} ${y-16}l${w} ${slant}M${x} ${y-3}l${w} ${slant}`,paint(uid,'wood'),3);
    const n=Math.max(2,Math.round(w/18));
    for(let i=0;i<=n;i++){const xx=x+w*i/n,yy=y+slant*i/n;s+=line(`M${xx} ${yy-22}v24`,paint(uid,'wood'),i===0||i===n?4:2);s+=circle(xx,yy-23,2,'#e1ce97');}
    return s;
  }
  function bambooClump(x,y,uid,s=1) {
    let out=`<g transform="translate(${x} ${y}) scale(${s})">`;
    for(let i=0;i<4;i++){
      const xx=(i-1.5)*9,h=80+i%3*15;
      out+=line(`M${xx} 0Q${xx-2} ${-h*.4} ${xx+(i-1.5)*5} ${-h}`,paint(uid,'leaf'),3.5);
      for(let j=1;j<5;j++){const yy=-h*j/5;out+=line(`M${xx-2} ${yy}h5`,'#c5d2a0',1);}
    }
    for(const [a,b,turn] of [[-4,-54,-32],[14,-75,20],[-19,-79,-42],[19,-43,36],[4,-98,12]]){
      out+=`<g transform="translate(${a} ${b}) rotate(${turn})">${line('M-21 5Q0-4 24-10','#72894e',1.2)}`;
      for(let i=0;i<6;i++){const xx=-17+i*7,yy=2-i*2.1,side=i%2?1:-1;out+=path(`M${xx} ${yy}q${side*8} ${-13-i%3*2} ${side*18} ${-16-i%3*2}q${-side*5} 15 ${-side*18} ${16+i%3*2}`,paint(uid,'leaf'));}
      out+='</g>';
    }
    return out+'</g>';
  }
  function crown(x,y,sx,sy,uid,key='leaf',turn=0) {
    return `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${sx} ${sy})">${path('M-38 10-32 1-35-4-23-8-18-16-7-13 1-23 10-16 23-19 25-10 37-5 33 2 42 9 29 15 17 12 4 18-7 13-22 17-28 11Z',paint(uid,key))}${line('M-27-2-17-7-9-4M-7-12 2-16 11-11M15-6l9-3 6 5',key==='pink'?'#ffedda':key==='maple'?'#f2ce8b':'#bfd38b',1.7,'opacity=".62"')}</g>`;
  }
  function smallTree(x,y,uid,s=.65,key='leaf') {
    let out=`<g transform="translate(${x} ${y}) scale(${s})">`+ellipse(0,3,40,7,'#6c815f','opacity=".10"')+path('M-6 0 0-48-5-85 3-105 9-76 5-42 12 2Z',paint(uid,'wood'));
    out+=line('M2-42-23-69M4-63 28-87M1-80-15-103',paint(uid,'wood'),5);
    for(const [a,b,xx,yy]of[[-26,-75,.65,.78],[21,-83,.73,.82],[-3,-110,.75,.78],[3,-75,.73,.73],[-31,-108,.47,.61],[31,-111,.49,.64]])out+=crown(a,b,xx,yy,uid,key,a*.2);
    return out+line('M-3-6-20 5M5-2 23 4','#8c7955',3)+'</g>';
  }
  function lotus(x,y,uid,s=1) {
    let out=`<g transform="translate(${x} ${y}) scale(${s})">`;
    out+=ellipse(0,8,25,5,'#507f69','opacity=".18"')+path('M-23 3Q-14-10 0-5L3 3 11-6Q31-3 20 9 7 15-12 10Z',paint(uid,'leaf'));
    out+=line('M0 6-16 0M0 6 15 1M0 6 7 11','#b4cd93',.9);
    for(const [a,b,turn]of[[-11,-4,-38],[11,-5,36],[-6,-10,-15],[6,-11,15],[0,-15,0]])out+=path(`M${a} ${b+15}q-10-9 0-24 11 17 0 24`,paint(uid,'pink'),`transform="rotate(${turn} ${a} ${b+11})"`);
    out+=ellipse(0,1,6,2.8,'#d9b266')+circle(-2,0,1,'#fff0b6')+circle(2,-1,1,'#fff0b6');
    return out+'</g>';
  }
  function pool(uid,lotuses=true,stone=true) {
    let s=ground(238,256,139);
    s+=ellipse(240,211,140,51,paint(uid,'stone-side'))+ellipse(240,203,140,51,paint(uid,'stone'))+ellipse(240,202,128,42,'#668b77')+ellipse(240,204,123,37,paint(uid,'water'));
    s+=path('M126 206q29-33 92-30 64-7 133 21-68-12-120-6-61 4-105 15Z','#e4eccd','opacity=".32"');
    for(const [x,y,w]of[[167,205,25],[296,211,31],[243,179,19],[220,223,22]])s+=line(`M${x-w} ${y}q${w} 7 ${w*2} 0`,'#dce8cd',1.5,'opacity=".85"');
    for(let i=0;i<14;i++){const a=i/14*Math.PI*2,xx=240+134*Math.cos(a),yy=203+47*Math.sin(a);s+=line(`M${xx} ${yy}l${Math.cos(a)*7} ${Math.sin(a)*4}`,'#96aa92',1,'opacity=".62"');}
    s+=line('M114 199q-3-26 36-36M280 248q52-7 76-25','#f5edd3',2.2);
    if(lotuses)s+=lotus(173,199,uid,.95)+lotus(246,181,uid,.82)+lotus(299,225,uid,.68);
    if(stone)s+=rock(111,222,.8,uid)+rock(364,213,.7,uid)+tuft(356,194,.55)+tuft(127,241,.45);
    return s;
  }
  function lotusPond(uid) { return pool(uid)+bambooClump(371,186,uid,.43); }
  function moonArch(uid) {
    let s=ground(245,263,130)+bambooClump(119,244,uid,.92)+bambooClump(374,239,uid,.65);
    s+=slab(239,251,232,25,uid,true);
    s+=ellipse(254,146,87,94,'none',`stroke="#8d9e88" stroke-width="17"`)+ellipse(246,143,87,94,'none',`stroke="${paint(uid,'stone')}" stroke-width="16"`);
    s+=ellipse(246,143,89,96,'none','stroke="#ece4c6" stroke-width="2.3"')+ellipse(246,143,78,86,'none','stroke="#af9c68" stroke-width="1.7"');
    s+=line('M176 90q21-37 62-40M170 177q14 34 42 47','#faf2d6',3,'opacity=".9"');
    for(const x of [166,307])s+=slab(x,239,40,12,uid)+rect(x-13,216,27,18,paint(uid,'stone'),4)+line(`M${x-9} 227q9-12 18 0`,'#8b9e86',1.2);
    s+=path('m245 43 7 7-7 9-7-9Z','#c2ab6d')+rock(126,259,.75,uid)+tuft(357,260,.65);
    return s;
  }
  function jadePavilion(uid) {
    let s=ground(238,265,131)+bambooClump(386,238,uid,.78)+slab(236,247,250,34,uid,true);
    s+=path('M150 238V132l176-11v101Z','#8ba28b','opacity=".12"');
    s+=post(168,232,107,uid,9)+post(324,218,102,uid,9)+railing(170,226,153,uid,-15);
    s+=ellipse(244,217,28,7,paint(uid,'stone-side'))+rect(239,210,10,19,paint(uid,'wood'),1)+ellipse(244,207,32,9,paint(uid,'stone'));
    s+=ellipse(239,204,8,2.5,'#f9efcf')+rect(235,199,8,6,'#e9ddb5',2)+line('M243 200q7-1 4 4','#beae7b',1.4)+circle(258,206,3,'#b8c3a3');
    s+=post(138,247,107,uid,10)+post(294,247,110,uid,10)+railing(139,240,47,uid)+railing(256,240,38,uid)+railing(297,239,31,uid,-17);
    s+=roof(226,141,257,50,uid,36)+roof(230,91,154,44,uid,24);
    s+=line('M224 45v-14','#a18d59',3)+circle(224,29,4,'#dcc88a')+lamp(156,151,uid,.72)+lamp(284,151,uid,.72)+tuft(119,256,.65)+rock(356,255,.7,uid);
    return s;
  }
  function blossomTree(uid) {
    let s=ground(242,262,112)+path('M229 259q10-38 6-75l-14-33 9-23 12 39 14-21 22-31 9 6-25 37-12 30 2 57 13 15-24-6Z',paint(uid,'wood'));
    s+=line('M239 229l2-49-30-29-24-27M244 174l36-26 31-13M238 159l-4-46','#8e7553',7)+line('M240 246l3-44M242 177l-12-26','#d3b787',2.6);
    const layers=[[178,138,.91,.89,-9],[208,108,.92,.9,3],[258,103,1.02,.98,-8],[302,130,.92,.9,6],[192,163,.9,.91,-7],[245,150,1.08,.9,5],[298,167,.83,.81,-6],[166,164,.58,.7,8],[316,145,.55,.7,-6]];
    for(const [x,y,sx,sy,a]of layers){s+=crown(x,y,sx,sy,uid,'pink',a);for(let j=0;j<5;j++){const xx=x-21+j*10,yy=y-5+(j%2)*9;s+=circle(xx,yy,1.4,'#fff1de','opacity=".85"');}}
    for(const [x,y,a]of[[169,221,24],[293,233,-29],[201,264,12],[320,257,35],[177,249,-17],[280,201,40]])s+=ellipse(x,y,4,2,'#dca8a1',`transform="rotate(${a} ${x} ${y})"`);
    s+=rock(184,264,.6,uid)+tuft(291,265,.65)+line('M236 249q-8 12-23 15M247 249l17 15','#9c8058',3);
    return s;
  }
  function house(x,y,w,h,uid,depth=26,round=false) {
    const l=x-w/2,r=x+w/2,top=y-h;
    let s=path(`M${r} ${top}l${depth} ${-depth*.45}v${h}l${-depth} ${depth*.45}Z`,'#a3b396');
    s+=rect(l,top,w,h,paint(uid,'wall'))+rect(l,top,w,11,'#6b7856',0,'opacity=".25"')+line(`M${l} ${y-5}H${r}l${depth} ${-depth*.45}`,'#92805b',5);
    for(const px of [l+5,r-5])s+=post(px,y,h,uid,6);
    if(round){
      const diameter=Math.min(50,h-18),smallWidth=Math.min(18,w*.12),smallHeight=Math.min(29,h-18),wy=top+(h-smallHeight)/2;
      s+=windowPanel(x-diameter/2,top+(h-diameter)/2,diameter,diameter,uid,true)+windowPanel(l+w*.115,wy,smallWidth,smallHeight,uid)+windowPanel(r-w*.115-smallWidth,wy,smallWidth,smallHeight,uid);
    }else {
      const doorWidth=Math.min(38,w*.22),doorHeight=Math.min(57,h-10),windowWidth=Math.min(25,w*.14),windowHeight=Math.min(31,h-20),wy=top+(h-windowHeight)*.48;
      s+=rect(x-doorWidth/2,y-doorHeight-2,doorWidth,doorHeight,paint(uid,'wood'),2)+rect(x-doorWidth/2+4,y-doorHeight+2,doorWidth-8,doorHeight-6,'#687b59',1)+line(`M${x} ${y-doorHeight+4}v${doorHeight-10}`,'#b9ac7a',1.5);
      s+=windowPanel(l+w*.11,wy,windowWidth,windowHeight,uid)+windowPanel(r-w*.11-windowWidth,wy,windowWidth,windowHeight,uid);
    }
    const sideHeight=Math.min(29,h-18);
    s+=windowPanel(r+9,top+(h-sideHeight)/2,11,sideHeight,uid);
    return s;
  }
  function bambooResidence(uid) {
    let s=ground(240,263,158)+bambooClump(96,243,uid,1.24)+bambooClump(393,234,uid,1)+slab(242,250,280,32,uid,true);
    s+=house(240,230,174,85,uid,29);
    for(let n=0;n<21;n++){const x=157+n*8;if(x>211&&x<264)continue;s+=line(`M${x} 155v68`,'#baac7b',.9,'opacity=".75"');}
    s+=roof(236,143,224,50,uid,34)+railing(132,242,66,uid)+railing(278,242,65,uid)+post(134,246,97,uid,7)+post(339,240,103,uid,7);
    s+=lamp(199,157,uid,.75)+lamp(329,150,uid,.7)+rock(112,260,.85,uid)+tuft(353,263,.7)+sprig(129,258,.4);
    return s;
  }
  function mapleCourtyard(uid) {
    let s=ground(236,267,163)+smallTree(99,230,uid,.71,'maple')+smallTree(393,221,uid,.68,'maple')+slab(237,256,316,33,uid,true);
    s+=house(239,194,162,76,uid,24)+roof(237,117,202,44,uid,28);
    s+=path('M125 212 217 188 350 214 276 250 135 244Z',paint(uid,'stone'));
    for(let n=0;n<4;n++)s+=line(`M${146+n*36} ${211-n*4}l98 27`,'#acb69a',1,'opacity=".6"');
    for(let n=0;n<4;n++)s+=line(`M${156+n*40} 242l43-29`,'#acb69a',1,'opacity=".6"');
    s+=house(143,238,76,67,uid,22)+roof(141,167,110,36,uid,22)+house(338,229,69,67,uid,23)+roof(335,159,105,36,uid,23);
    s+=railing(186,233,29,uid)+railing(281,235,30,uid)+lamp(210,135,uid,.65)+lamp(276,133,uid,.65);
    s+=tuft(102,257,.67)+rock(377,253,.75,uid);
    for(const [x,y]of[[208,239],[274,250],[310,247],[128,261]])s+=path(`m${x} ${y} 3-5 3 3 5-1-2 4 2 3-5-1-3 3-1-4-4-1Z`,'#c58b52');
    return s;
  }
  function moonResidence(uid) {
    let s=`<g transform="translate(-36 -23) scale(1.15 1.13)">${pool(uid,false,false)}</g>`+bambooClump(408,224,uid,.63)+smallTree(77,210,uid,.43);
    // A two-storey residence and low waterside wings share the same raised court.
    // Leave the pool visible around the base instead of filling it with a plinth.
    for(const [x,y]of[[110,236],[176,231],[300,233],[366,227]])s+=rect(x,y-26,8,27,paint(uid,'stone-side'),1);
    s+=slab(240,225,290,29,uid)+house(356,209,69,51,uid,18)+roof(353,159,100,29,uid,20);
    s+=house(239,208,174,65,uid,26,true)+roof(238,144,230,39,uid,29);
    s+=slab(238,130,153,22,uid)+house(239,120,127,55,uid,20,true)+railing(169,128,139,uid);
    s+=roof(238,65,181,35,uid,24)+line('M219 30q17-7 35-2','#d6be7c',3.3);
    s+=house(121,221,71,53,uid,19)+roof(118,168,102,29,uid,22);
    s+=post(170,216,48,uid,5)+post(310,215,51,uid,5)+railing(90,229,103,uid)+railing(286,229,103,uid)+railing(388,228,27,uid,-14);
    for(const [x,y,scale]of[[92,179,.49],[155,177,.49],[182,157,.51],[295,155,.51],[188,77,.48],[291,75,.48]])s+=lamp(x,y,uid,scale);
    for(let n=0;n<6;n++)s+=slab(240,229+n*6,60+n*5,9,uid);
    s+=railing(198,257,17,uid,-29)+railing(270,229,17,uid,29);
    s+=lotus(90,238,uid,.59)+lotus(350,250,uid,.70)+lotus(152,255,uid,.44)+rock(392,253,.55,uid)+tuft(101,268,.46);
    return s;
  }
  function armillary(x,y,uid,s=1) {
    return `<g transform="translate(${x} ${y}) scale(${s})">${line('M0 22v15','#9a8652',3)}${ellipse(0,0,24,20,'none','stroke="#c5aa65" stroke-width="2.5"')}${ellipse(0,0,10,22,'none','stroke="#dfc080" stroke-width="2" transform="rotate(33)"')}${ellipse(0,0,25,8,'none','stroke="#9d925d" stroke-width="1.6" transform="rotate(-21)"')}${path('M0-9 3-3 9 0 3 3 0 9-3 3-9 0-3-3Z','#ebd596')}${circle(-12,-15,2.2,'#e4ca85')}</g>`;
  }
  function starResidence(uid) {
    let s=ground(239,272,164)+slab(239,258,320,32,uid)+slab(239,248,298,29,uid)+smallTree(79,240,uid,.43);
    // Three clearly separated roofs rise above the two lower side buildings.
    s+=house(356,225,73,58,uid,19)+slab(356,169,92,23,uid)+railing(311,165,91,uid)+armillary(356,133,uid,.83);
    s+=house(118,237,75,61,uid,22)+roof(116,176,110,31,uid,23);
    s+=house(238,229,178,65,uid,27)+roof(236,164,236,35,uid,29);
    s+=slab(237,149,169,22,uid)+house(238,140,136,48,uid,22)+railing(156,147,155,uid)+roof(236,92,185,31,uid,25);
    s+=slab(237,78,117,19,uid)+house(238,72,88,34,uid,18)+railing(179,77,111,uid)+roof(236,39,137,24,uid,21);
    s+=line('M232 17v-8','#c7ae72',2.8)+path('m232 4 3 5 5 2-5 2-3 5-3-5-5-2 5-2Z','#dcc18a');
    s+=railing(92,244,94,uid)+railing(288,244,91,uid)+railing(380,242,31,uid,-15);
    for(const [x,y,scale]of[[91,186,.46],[158,183,.46],[177,175,.52],[302,174,.52],[188,104,.45],[292,103,.45]])s+=lamp(x,y,uid,scale);
    for(let n=0;n<6;n++)s+=slab(239,253+n*5,65+n*7,8,uid);
    s+=path('M64 257q13-12 27-4 13-14 30-3 15-6 26 4-34 12-83 3Z','#f4f3e5','opacity=".87"')+path('M312 270q14-12 30-5 14-15 31-4 19-8 39 2-39 17-100 7Z','#eef0e2','opacity=".92"');
    s+=rock(383,263,.52,uid)+tuft(113,269,.44)+line('M111 278q43-10 77-3m96 5q44-7 75-1','#fff8df',2.4,'opacity=".8"');
    return s;
  }
  function bambooFence(uid) {
    let s=ground(240,256,140)+bambooClump(100,246,uid,1.04)+bambooClump(380,241,uid,.7);
    for(let n=0;n<8;n++){
      const x=125+n*31,y=245-n*1.6,h=78+Math.sin(n*.57)*22;
      s+=rect(x-4,y-h,9,h,paint(uid,'leaf'),4)+ellipse(x+.5,y-h+2,4,2,'#b5c792');
      for(let j=1;j<4;j++)s+=line(`M${x-3} ${y-h+j*h/4}h7`,'#d2d3a0',1.4);
    }
    s+=line('M113 202 353 189M114 231 355 218','#496b43',7)+line('M113 199 353 186M114 228 355 215','#adc18b',4.7);
    for(let n=0;n<8;n++){const x=126+n*31,y=200-n*1.7;s+=line(`M${x-5} ${y-5}l9 10M${x-5} ${y+23}l9 10`,'#d5bf8b',2.2);}
    return s+rock(146,259,.75,uid)+tuft(331,255,.78)+sprig(186,262,.38);
  }
  function stoneLantern(uid) {
    let s=ground(239,263,100)+smallTree(332,249,uid,.55)+slab(226,251,108,23,uid)+slab(226,241,82,18,uid);
    s+=path('M211 239l6-64h23l7 64Z',paint(uid,'stone'))+path('M240 175l13-8-6 67-7 5Z',paint(uid,'stone-side'));
    s+=slab(229,177,79,16,uid)+rect(199,123,63,43,paint(uid,'stone'),3)+path('m262 123 15-7v43l-15 7Z',paint(uid,'stone-side'));
    s+=windowPanel(209,130,42,28,uid)+rect(271,126,4,26,'#e4d6a7',1)+roof(228,123,116,40,uid,18)+circle(223,80,5,'#c4b277')+line('M223 75v-8','#8b9a79',3);
    s+=rock(171,257,.8,uid)+tuft(278,262,.75)+sprig(188,261,.42);
    return s;
  }
  function spiritPond(uid) {
    let s=pool(uid,false)+smallTree(357,177,uid,.55)+rock(147,177,.8,uid);
    s+=lotus(189,205,uid,.79)+ellipse(284,207,29,8,'none','stroke="#e9f0d5" stroke-width="1.3"')+path('M273 209q13-8 22-2l-7 5 9 4-15-5-8 2Z','#c69a63','opacity=".7"');
    return s;
  }
  function masterStele(uid) {
    let s=ground(237,265,111)+smallTree(139,243,uid,.58)+slab(239,253,133,23,uid)+slab(238,242,107,19,uid);
    s+=path('M195 237V105q2-38 47-51l16 9q38 15 38 46v121l-14 7Z',paint(uid,'stone-side'));
    s+=path('M195 237V103q1-36 43-49 43 14 43 49v134Z',paint(uid,'stone'));
    s+=path('M205 228V105q1-26 33-38 32 12 32 38v123Z','#e7e1c5')+path('M211 221V106q1-20 27-31 26 11 26 31v115Z','#cbd1ae','opacity=".55"');
    s+=line('M200 223V104q0-31 34-44','#f4ebd1',2)+line('M211 215h53M211 111q27-15 53 0','#95a17f',1.2);
    s+=`<text x="239" y="145" text-anchor="middle" font-family="serif" font-size="25" fill="#57744f">百</text><text x="239" y="181" text-anchor="middle" font-family="serif" font-size="25" fill="#57744f">草</text>`;
    s+=line('M225 201q7-13 13-4 4-11 12-5M238 199v11','#8ba16d',1.7)+rock(305,257,.72,uid)+tuft(291,258,.7)+sprig(183,261,.5);
    return s;
  }
  function banner(uid,id) {
    const key=id.replace('Banner',''),data={spring:['春','#f2d7bc'],summer:['夏','#c6e0c5'],autumn:['秋','#f3d29a'],winter:['冬','#f4e5d1']}[key];
    let s=ground(239,262,105)+slab(206,255,65,18,uid)+path('M202 253 199 67h9l2 186Z',paint(uid,'wood'))+line('M201 249V71','#dcc28a',1.3);
    s+=line('M194 77h139',paint(uid,'wood'),5)+circle(202,61,6,'#cfb87c')+circle(333,77,3,'#b9a271');
    s+=path('M211 82q28-11 58 0t56 0l-10 114q-24 11-49-3t-50 8Z',paint(uid,'cloth'));
    s+=path('M267 82q30 12 58 0l-10 114q-24 11-49-3Z','#3f6546','opacity=".12"');
    s+=line('M219 91q25-8 49 0t48 0l-9 93q-20 7-41-4t-42 6Z',data[1],1.8,'opacity=".88"');
    s+=line('M214 85q2 55 4 104','#e9ddb2',1.3,'opacity=".75"')+`<text x="266" y="140" text-anchor="middle" font-family="serif" font-size="31" fill="${data[1]}">${data[0]}</text>`;
    if(key==='spring')s+=smallTree(349,249,uid,.5,'pink');
    else if(key==='autumn')s+=smallTree(347,247,uid,.51,'maple');
    else if(key==='summer')s+=bambooClump(346,246,uid,.62)+line('M129 261q28-8 51-3','#93b7a0',3);
    else s+=rock(335,253,1,uid)+path('m319 246 8-10 13 2 8 10-17-3Z','#f6f1df')+sprig(349,260,.55,'#709786');
    s+=rock(167,262,.72,uid)+tuft(285,263,.55);
    return s;
  }
  function sectGate(uid,theme) {
    if(theme==='xuanyue')return moonArch(uid)+lamp(154,171,uid,.6)+lamp(337,171,uid,.6);
    let s=ground(239,265,145)+smallTree(109,243,uid,.62,theme==='fengxia'?'maple':'leaf')+smallTree(386,239,uid,.49,theme==='fengxia'?'maple':'leaf')+slab(235,251,275,28,uid,true);
    if(theme==='xinglan'){
      s+=path('M171 241 144 210V124l30-31h133l31 31v86l-27 31','none','stroke="#769390" stroke-width="14" stroke-linejoin="round"')+path('M171 241 144 210V124l30-31h133l31 31v86l-27 31','none','stroke="#d0bb7b" stroke-width="2" stroke-linejoin="round"')+armillary(240,64,uid,1.1);
      s+=slab(242,245,164,20,uid)+ellipse(242,240,55,9,'none','stroke="#b6a365" stroke-width="1.3"');
    }else {
      s+=post(161,244,123,uid,15)+post(310,244,123,uid,15)+rect(157,133,162,14,paint(uid,'wood'),1)+rect(176,153,126,8,paint(uid,'wood'),1)+roof(235,122,244,50,uid,26);
      s+=rect(211,132,57,27,'#d2b575',3)+rect(216,136,47,19,'#eee0b3',1)+`<text x="240" y="150" text-anchor="middle" font-family="serif" font-size="12" fill="#6b754f">${theme==='fengxia'?'积跬':theme==='lingxi'?'同道':'同心'}</text>`+lamp(176,165,uid,.7)+lamp(296,163,uid,.7);
      if(theme==='fengxia')s+=roof(114,191,76,26,uid,16)+post(97,246,49,uid,5)+post(143,241,49,uid,5)+roof(354,191,74,26,uid,16)+post(335,246,49,uid,5)+post(380,240,49,uid,5);
      if(theme==='lingxi')s+=railing(184,205,102,uid,-5)+path('M183 208q52-20 105-5v9q-53-14-105 5Z','#b8b17c');
    }
    return s+rock(128,263,.8,uid)+tuft(355,265,.6);
  }
  function sectSpring(uid,theme) {
    if(theme==='xinglan'){
      let s=ground(239,263,137)+slab(239,251,255,30,uid)+ellipse(240,231,119,31,paint(uid,'stone'))+ellipse(240,229,108,26,paint(uid,'water'));
      for(const r of [26,50,78,102])s+=ellipse(240,229,r,r*.235,'none','stroke="#bba570" stroke-width="1.25"');
      for(let n=0;n<12;n++){const a=n*Math.PI/6;s+=line(`M240 229l${Math.cos(a)*105} ${Math.sin(a)*24}`,'#91a99e',.8);}
      return s+armillary(243,153,uid,1.95)+rock(110,252,.7,uid)+tuft(355,255,.62);
    }
    if(theme==='fengxia'){
      let s=ground(240,264,145)+smallTree(107,240,uid,.65,'maple');
      for(let n=0;n<3;n++){
        const x=240,y=245-n*40,w=264-n*50;
        if(n){
          s+=path(`M${x-w/2} ${y+7}H${x+w/2}v33H${x-w/2}Z`,paint(uid,'stone'))+path(`M${x+w/2} ${y+7}l32-14v33l-32 14Z`,paint(uid,'stone-side'));
          for(let row=0;row<3;row++)s+=line(`M${x-w/2+3} ${y+15+row*9}h${w-6}`,'#9da787',.8,'opacity=".45"');
        }
        s+=slab(x,y,w,32,uid);s+=path(`M${x-w/2+12} ${y-2}l25-11h${w-36}l-25 11Z`,'#7f9470');
        for(let j=0;j<6-n;j++)s+=sprig(x-w/2+35+j*32,y-10,.37+j%2*.06);
        s+=line(`M${x+w/2-13} ${y-9}v${n?39:8}`,'#b9d7b6',4.5);
      }
      return s+rock(365,252,.74,uid)+tuft(127,260,.55);
    }
    let s=pool(uid,false)+bambooClump(373,199,uid,.77);
    if(theme==='xuanyue'){
      s+=path('M270 171a56 56 0 1 1 47-78 50 50 0 0 0-47 78Z',paint(uid,'stone'))+line('M270 165q-50-37-9-78','#f4edcf',2)+ellipse(256,211,42,11,'none','stroke="#d7e6ce" stroke-width="1.2"')+ellipse(256,211,62,17,'none','stroke="#d7e6ce" stroke-width="1.1"');
    }else {
      s+=rock(289,181,2.5,uid)+rock(302,135,1.7,uid)+path('M283 141q-38 8-38 59','none','stroke="#d9e9cd" stroke-width="10" stroke-linecap="round"')+path('M281 142q-31 9-32 55','none','stroke="#9ecdb6" stroke-width="4" stroke-linecap="round"')+ellipse(248,205,22,6,'none','stroke="#e8f0d4" stroke-width="2"');
      if(theme==='lingxi')s+=path('M143 206q42-25 88 0v11q-46-20-88 0Z',paint(uid,'wood'))+railing(145,204,83,uid,0);
    }
    return s+lotus(172,221,uid,.68)+tuft(348,246,.6);
  }
  function sectLibrary(uid,theme) {
    let s=ground(238,267,135)+smallTree(104,244,uid,.58,theme==='fengxia'?'maple':'leaf')+slab(238,252,257,29,uid,true);
    s+=house(240,233,168,78,uid,27,theme==='xuanyue')+roof(235,151,220,42,uid,27)+house(241,137,120,54,uid,22,theme==='xuanyue')+railing(177,140,129,uid)+roof(236,81,167,41,uid,24);
    s+=lamp(164,165,uid,.67)+lamp(323,161,uid,.67)+rock(359,253,.8,uid)+tuft(338,265,.6);
    if(theme==='xinglan')s+=armillary(232,29,uid,.7);
    else s+=line('M225 35q8-6 15-1','#c4ad75',3);
    // A small open book gives the archive a distinct, readable shop silhouette.
    s+=path('M198 226v-20q17-6 29 2 13-8 29-2v20q-16-4-29 2-13-6-29-2Z','#e8dfbb')+line('M227 209v18M203 211l17 2m-17 4 17 2m13-6 17-2m-17 8 17-2','#a89d71',1);
    return s;
  }

  function greenTree(kind,uid) {
    const pine=kind==='verdantPine',willow=kind==='weepingWillow';
    const dark=pine?'#315c49':willow?'#6c8f43':'#3e6e40',light=pine?'#91b07b':willow?'#bbcc7c':'#a6c374';
    let s=`<defs><linearGradient id="${uid}-leaves" x2=".2" y2="1"><stop stop-color="${light}"/><stop offset=".44" stop-color="${pine?'#5e8c61':willow?'#94b85e':'#6b9a50'}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>`;
    s+=ellipse(241,260,92,14,'#8b9c70','opacity=".17"')+`<path d="M164 255q18-17 40-9 19-12 39-3 28-11 53 5l28 9q-54 15-160-2" fill="#a7b58a" opacity=".53"/>`;
    const crown=(x,y,sx,sy,turn=0)=>`<g transform="translate(${x} ${y}) rotate(${turn}) scale(${sx} ${sy})"><path d="M-38 10-32 1-35-4-23-8-18-16-7-13 1-23 10-16 23-19 25-10 37-5 33 2 42 9 29 15 17 12 4 18-7 13-22 17-28 11Z" fill="url(#${uid}-leaves)"/>${line('M-27-2-17-7-9-4M-7-12 2-16 11-11M15-6l9-3 6 5',light,1.8,'opacity=".6"')}</g>`;
    if(pine){
      s+=`<path d="m226 255 7-66-4-47 9-55 8-40 3 68-7 45 5 95 16 5-26-2-23 4Z" fill="#82714e"/>`;
      s+=line('M235 233l4-43-3-40 7-48','#b49b6a',3);
      s+=line('M238 196q-22-19-58-18m60-3q27-16 62-15m-63-21q-20-12-45-10m47-16q22-15 42-13m-43-14-20-10','#83724f',5);
      for(const [x,y,sx,sy,a]of[[183,177,1,.65,-7],[216,166,.83,.56,9],[300,157,.88,.57,5],[259,151,.77,.55,-6],[193,130,.78,.54,-5],[229,125,.68,.55,6],[280,104,.67,.48,-7],[244,99,.66,.55,4],[222,78,.51,.51,2],[244,62,.48,.62,-9]])s+=crown(x,y,sx,sy,a);
      s+=line('M220 252l-18 7m39-5 22 7m-24-9-8 10','#887853',4);
    }else if(!willow){
      s+=`<path d="M215 259q16-31 13-63l-15-41-18-22 7-7 24 25 12 25 12-31 31-26 8 3-28 35-8 42q0 35 16 58l-28-7Z" fill="#8a7b54"/>`;
      s+=line('M234 241q9-40 1-58m7 5 11-32 25-26M229 183l-13-29-13-18','#baa276',3);
      s+=line('M214 164l-30-31m70 22 48-9m-62 19 3-55','#8a7b54',4);
      for(const [x,y,sx,sy,a]of[[170,143,.75,.88,-17],[198,120,.87,.83,-12],[224,145,.92,.80,2],[281,139,.92,.85,12],[310,123,.72,.82,14],[274,111,.88,.84,8],[233,105,.89,.85,-7],[244,82,.68,.70,7],[189,146,.76,.7,5],[292,156,.68,.72,-9]])s+=crown(x,y,sx,sy,a);
      s+=line('M193 155q-6 32-2 52m96-49q5 29 1 47','#9b8c63',1.4);
      s+=line('M229 246q-10 12-27 15m49-13 22 13m-35-11-2 13','#8a7b54',5);
    }else{
      s+=`<path d="m221 257 14-36-3-47 8-40-6-41 7-5 10 43-8 47 6 43 7 37-18-6Z" fill="#8a8961"/>`;
      s+=line('M236 240l5-22-4-45 9-44','#b6ac78',3);
      s+=line('M242 161q-21-42-45-49m48 31q22-35 46-29m-46 16q-7-28-14-42','#8a8961',4);
      for(const [x,y,sx,sy,a]of[[189,115,.74,.77,-12],[222,96,.77,.70,-8],[258,105,.81,.74,8],[291,119,.71,.70,14],[243,78,.6,.65,5]])s+=crown(x,y,sx,sy,a);
      for(let n=0;n<11;n++){
        const x=168+n*14,y=117-Math.sin(n/10*Math.PI)*24,length=66+(n%3)*14,bend=n<5?-7:7;
        s+=line(`M${x} ${y}q${bend+5} ${length*.46} ${bend} ${length}`,dark,1.5);
        for(let j=0;j<6;j++){
          const yy=y+12+j*length/6,xx=x+bend*j/6,side=j%2?1:-1;
          s+=`<path d="M${xx} ${yy}q${side*10} 4 ${side*5} 15q${-side*7}-6 ${-side*5}-15Z" fill="${j%3?light:'#7ba352'}"/>`;
        }
      }
      s+=line('M232 251l-17 11m26-9 22 7','#8a8961',4);
    }
    for(const [x,y,turn]of[[186,258,-14],[274,263,12],[303,253,25]])s+=`<path d="m${x} ${y}q-11-11-9-18 7 5 9 13 2-13 9-18 2 12-9 23" fill="#7e9c5f" transform="rotate(${turn} ${x} ${y})"/>`;
    s+=`<path d="m169 257 5-10 14 2 6 10-16 4Z" fill="#b9b89b"/><path d="m287 267 5-8 11-2 10 8-16 4Z" fill="#aaaE95"/>`;
    return s;
  }
  const draw = {
    lotusPond,moonArch,jadePavilion,blossomTree,
    verdantPine:uid=>greenTree('verdantPine',uid),banyanTree:uid=>greenTree('banyanTree',uid),weepingWillow:uid=>greenTree('weepingWillow',uid),
    bambooResidence,mapleCourtyard,moonResidence,starResidence,bambooFence,stoneLantern,spiritPond,masterStele,
    springBanner:uid=>banner(uid,'springBanner'),summerBanner:uid=>banner(uid,'summerBanner'),autumnBanner:uid=>banner(uid,'autumnBanner'),winterBanner:uid=>banner(uid,'winterBanner'),
    sectGate,sectSpring,sectLibrary
  };
  const styles = {
    bambooResidence:{roofLight:'#a3b583',roof:'#6b8c5c',roofDark:'#3f6348',woodLight:'#c7bb84',wood:'#9d9565',woodDark:'#69764e'},
    mapleCourtyard:{roofLight:'#dfbb7e',roof:'#b68151',roofDark:'#83533d',woodLight:'#c69566',wood:'#9e6348',woodDark:'#705140',wallLight:'#f3e5c3',wall:'#ddc6a0'},
    moonResidence:{roofLight:'#a7c4b6',roof:'#729e94',roofDark:'#3e6b6a',woodLight:'#b9c3a0',wood:'#8ba394',woodDark:'#5d7e75',wallLight:'#f0ebd4',wall:'#d1d9be'},
    starResidence:{roofLight:'#9db5b7',roof:'#678c9e',roofDark:'#385b74',woodLight:'#bbc1ab',wood:'#8c9e9a',woodDark:'#5c7a79',wallLight:'#f1e9d1',wall:'#cdd5c7'},
    summerBanner:{clothLight:'#b8d1b7',cloth:'#6caaa1',clothDark:'#3c7778'},
    autumnBanner:{clothLight:'#edc789',cloth:'#c69354',clothDark:'#9b6341'},
    winterBanner:{clothLight:'#d3a999',cloth:'#af7a72',clothDark:'#795960'}
  };
  const schoolStyles = {
    fengxia:styles.mapleCourtyard,xuanyue:styles.moonResidence,lingxi:styles.bambooResidence,xinglan:styles.starResidence
  };
  global.spiritHomesteadArt = function (id,options={}) {
    if(typeof id!=='string')return '';
    const item=global.SpiritHomestead?.getScenery(id)||global.SpiritHomestead?.getResidence(id);
    const modelId=item?.speciesId||id;
    if(!ids.has(modelId))return '';
    const stageId={sectGate:'gate',sectSpring:'spring',sectLibrary:'library'}[modelId];
    const school=stageId&&global.SpiritSects?.get(options.themeId);
    const stage=school?.stages.find(entry=>entry.id===stageId);
    const uid=`spirit-home-${++sequence}`,name=options.label||stage?.rewardDecoration?.name||item?.name||legacy[modelId]?.[0]||'洞天小景';
    const width=Number.isFinite(options.size)&&options.size>0?Math.min(1600,options.size):'100%';
    const palette=school?.palette||item?.palette||{primary:legacy[modelId]?.[1]||'#6c8a70',soft:legacy[modelId]?.[2]||'#eeeddc'};
    const theme=school?schoolStyles[school.id]:styles[modelId];
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${esc(options.className||'spirit-homestead-art')}" viewBox="0 0 480 300" width="${width}" role="img" aria-labelledby="${uid}-title" focusable="false"><title id="${uid}-title">${esc(name)}</title><defs><linearGradient id="${uid}-sky" x2="0" y2="1"><stop stop-color="#fbf6e6"/><stop offset="1" stop-color="${palette.soft}"/></linearGradient><radialGradient id="${uid}-sun"><stop stop-color="#fff8d9" stop-opacity=".92"/><stop offset="1" stop-color="#fff2c8" stop-opacity="0"/></radialGradient></defs>${materials(uid,theme)}<rect width="480" height="300" fill="url(#${uid}-sky)"/><circle cx="324" cy="88" r="96" fill="url(#${uid}-sun)"/><circle cx="339" cy="72" r="23" fill="#f8e9ba" opacity=".53"/><path d="M0 202 53 144l44 29 53-58 70 75 54-45 79 54 58-59 69 68v92H0Z" fill="${palette.primary}" opacity=".07"/><path d="m0 239 68-46 81 29 70-21 62 23 82-38 117 51v63H0Z" fill="${palette.primary}" opacity=".06"/>${draw[modelId](uid,school?.id)}${line('M32 277q44 4 65-2m279 0q39 6 70-3','#fff9e6',2.5,'opacity=".85"')}<circle cx="55" cy="94" r="1.3" fill="#c6b88c" opacity=".55"/><circle cx="409" cy="116" r="1.5" fill="#c6b88c" opacity=".55"/></svg>`;
  };
})(typeof window!=='undefined'?window:globalThis);
