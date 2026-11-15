/* Four schools, twelve small landscape paintings. Native SVG, no remote assets. */
(function (global) {
  'use strict';
  const palettes = {
    fengxia: { ink:'#5d7154', leaf:'#789a62', deep:'#8e5341', roof:'#c69a5e', light:'#f4e8ca', accent:'#cb7950', mist:'#e7e6ce' },
    xuanyue: { ink:'#526f77', leaf:'#829d8a', deep:'#506c83', roof:'#708d9a', light:'#f2eddb', accent:'#d0b675', mist:'#e1e9e2' },
    lingxi: { ink:'#507461', leaf:'#83a76e', deep:'#76885c', roof:'#7f9c6b', light:'#f5eace', accent:'#c3a26b', mist:'#e4ebd8' },
    xinglan: { ink:'#536e79', leaf:'#7f9b90', deep:'#536f84', roof:'#638b9a', light:'#f3e9ce', accent:'#c6aa68', mist:'#e1e8e4' }
  };
  const names = {
    fengxia:['积跬山门','勤耕梯圃','千里修业阁'],
    xuanyue:['问思月门','澄心鉴池','明辨藏经阁'],
    lingxi:['同道连桥门','论道曲水庭','会友讲学堂'],
    xinglan:['星仪天门','星河经纬台','精微观星阁']
  };
  let serial = 0;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const path = (d,fill,stroke='',width=1,extra='') => `<path d="${d}" fill="${fill}"${stroke?` stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`:''} ${extra}/>`;
  const ellipse=(x,y,rx,ry,fill,extra='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
  function roof(x,y,w,p,small=false) {
    const h=small?19:29;
    return path(`M${x-w/2-8} ${y+7} Q${x-w*.29} ${y+12} ${x} ${y-h} Q${x+w*.29} ${y+12} ${x+w/2+8} ${y+7} L${x+w/2-4} ${y+19} Q${x} ${y+11} ${x-w/2+4} ${y+19}Z`,p.roof,p.ink,1.3)
      +path(`M${x-w/2-8} ${y+7} Q${x-w*.29} ${y+12} ${x} ${y-h} Q${x+w*.29} ${y+12} ${x+w/2+8} ${y+7}`,'none',p.light,3)
      +[-.32,-.16,0,.16,.32].map(t=>path(`M${x+t*w} ${y+12} Q${x+t*w*.75} ${y-1} ${x+t*w*.5} ${y-h+7}`,'none',p.light,1,'opacity=".48"')).join('')
      +path(`M${x-6} ${y-h} Q${x} ${y-h-8} ${x+6} ${y-h}`,'none',p.accent,3);
  }
  function lamp(x,y,p,scale=1) {
    return `<g transform="translate(${x} ${y}) scale(${scale})">`+path('M0 -21V-9','none',p.ink,2)+rect(-8,-8,16,21,'#f5d995',5)+path('M-7 -5H7M-7 10H7M0 13V20','none',p.accent,1.5)+ellipse(0,1,4,8,'#fff0c2','opacity=".8"')+'</g>';
  }
  function maple(x,y,scale,p) {
    const leaf=(dx,dy,s,color)=>`<path transform="translate(${dx} ${dy}) scale(${s})" d="M0 -10 3 -4 8 -7 6 -1 11 1 4 5 3 9 0 6-4 9-4 5-11 1-6-1-8-7-3-4Z" fill="${color}"/>`;
    return `<g transform="translate(${x} ${y}) scale(${scale})">`+ellipse(0,3,28,7,'#587455','opacity=".09"')+path('M-1 0 1-62M0-29-19-45M1-42 21-58M1-51-9-68','none','#8a7652',4)+[[-22,-51,1.5],[-11,-68,1.6],[9,-76,1.7],[24,-58,1.65],[3,-52,1.9],[-9,-41,1.3],[18,-38,1.3]].map(([a,b,s],i)=>leaf(a,b,s,i%2?'#cc825a':p.accent)).join('')+'</g>';
  }
  function bamboo(x,y,scale,p) {
    return `<g transform="translate(${x} ${y}) scale(${scale})">`+[-8,0,10].map((a,i)=>path(`M${a} 0 ${a-3+i*3} ${-67-i*9}`,'none',p.deep,3)+[-18,-36,-54].map(v=>path(`M${a-3} ${v}h6`,'none','#c6c89a',1.5)).join('')).join('')+[[0,-61,-1],[0,-35,1],[9,-73,1],[-8,-48,-1]].map(([a,b,side])=>path(`M${a} ${b}q${side*11} -17 ${side*27} -19q${-side*11} 20 ${-side*27} 19M${a} ${b+1}q${side*7} -2 ${side*21} 8q${-side*17} 3 ${-side*21} -8`,p.leaf)).join('')+'</g>';
  }
  function herb(x,y,s,p) {
    return `<g transform="translate(${x} ${y}) scale(${s})">`+path('M0 0V-16','none',p.ink,1.5)+path('M0-4Q-16-4-14-16Q-2-19 0-4M0-7Q4-23 17-21Q16-8 0-7',p.leaf)+ellipse(0,-19,4,6,p.accent)+'</g>';
  }
  function stairs(p,y=205,w=216,x=240) {
    return [2,1,0].map(i=>path(`M${x-w/2-i*13} ${y+i*10}h${w+i*26}l12 9h${-w-i*26-24}Z`,i===2?'#b9bc9e':p.light,p.ink,.8,'stroke-opacity=".25"')+path(`M${x-w/2-i*13-12} ${y+i*10+9}h${w+i*26+24}v5h${-w-i*26-24}Z`,i===2?'#a3ac91':'#c3c5a9')).join('');
  }
  const star=(x,y,r,p)=>path(`M${x} ${y-r}Q${x+1} ${y-1} ${x+r} ${y}Q${x+1} ${y+1} ${x} ${y+r}Q${x-1} ${y+1} ${x-r} ${y}Q${x-1} ${y-1} ${x} ${y-r}Z`,p.accent);
  function books(x,y,p) {
    return `<g transform="translate(${x} ${y})">`+[-13,-6,1,8].map((a,i)=>rect(a,-23,5,23,[p.roof,p.accent,p.leaf,p.deep][i],1)+path(`M${a+1} -18h3M${a+1}-5h3`,'none',p.light,1)).join('')+path('M-18 2H20','none',p.deep,3)+'</g>';
  }
  function gate(id,p) {
    if(id==='fengxia')return maple(113,214,.85,p)+maple(368,216,.96,p)+stairs(p,200,214)
      +[157,322].map(x=>rect(x-9,100,18,106,p.deep,2)+rect(x-15,193,30,11,'#b5bba0',2)+rect(x-5,113,3,61,'#d6a276',1)+rect(x-14,96,28,13,p.roof,2)).join('')
      +rect(150,99,179,12,p.deep,2)+roof(240,87,214,p)+rect(211,108,58,25,p.deep,3)+path('M222 117h36M227 124h26','none',p.light,2)
      +lamp(182,135,p,.78)+lamp(298,135,p,.78)+path('M180 199 211 151H268L300 199','none','#d9d6b9',2)
      +path('M96 229q10-8 22-2M354 234q12-8 25-2','none',p.leaf,3);
    if(id==='xuanyue')return stairs(p,207,236)+ellipse(240,218,124,12,'#87a39a','opacity=".15"')
      +path('M240 47a83 83 0 1 1 0 166a83 83 0 1 1 0-166M240 63a67 67 0 1 0 0 134a67 67 0 1 0 0-134Z','#8ca8a3',p.ink,1.5,'fill-rule="evenodd"')
      +path('M187 69a74 74 0 0 1 110 18M177 167a74 74 0 0 0 124 1','none','#eee6c8',5)
      +ellipse(240,130,69,69,'none',`stroke="${p.accent}" stroke-width="1.1"`)
      +[124,356].map(x=>rect(x-16,151,32,59,p.deep,4)+rect(x-21,148,42,9,'#d9dfc8',3)+rect(x-21,205,42,12,'#aab8a4',2)+rect(x-9,161,18,35,'#b4c5b4',2)+lamp(x,139,p,.62)).join('')
      +path('M232 43Q249 17 263 42Q244 32 240 49',p.light,p.accent,1)+path('M208 203q31-15 65 0','none','#eeead4',2)
      +bamboo(93,218,.46,p)+bamboo(389,218,.42,p);
    if(id==='lingxi')return stairs(p,212,273)+bamboo(93,212,.83,p)+bamboo(389,214,.95,p)
      +[ [154,107,113],[328,95,126] ].map(([x,y,w])=>rect(x-35,y+9,7,98,p.deep,1)+rect(x+28,y+9,7,98,p.deep,1)+rect(x-41,y+85,82,10,p.accent,2)+roof(x,y,w,p,true)+lamp(x,y+32,p,.8)).join('')
      +path('M184 172Q240 148 298 172L298 186Q240 163 184 186Z','#bdad7e',p.ink,1.1)
      +path('M184 156Q240 132 298 156M184 172Q240 148 298 172','none',p.deep,4)
      +[191,211,232,253,274,291].map((x,i)=>path(`M${x} ${[155,149,145,145,149,155][i]}v16`,'none',p.deep,2)).join('')
      +path('M204 205q36-26 72 0','none','#8eb1a0',5)+path('M203 214q36-24 73 0','none','#d8e6cc',2);
    return stairs(p,217,226)+path('M170 201 143 170V107L172 78H308L337 107V170L310 201','none',p.deep,12)
      +path('M170 201 143 170V107L172 78H308L337 107V170L310 201','none',p.accent,2)
      +path('M183 200 157 169V113L178 92H302L323 113V169L297 200','none','#9bb2af',3)
      +ellipse(240,210,88,18,'#a1b7ad')+ellipse(240,207,75,15,'#dce0c6')
      +ellipse(240,207,48,10,'none',`stroke="${p.accent}" stroke-width="2"`)+path('M165 207H315M240 192V223M185 196 296 219M185 219 296 196','none',p.deep,.7,'opacity=".55"')
      +`<g transform="translate(240 63)">`+ellipse(0,0,35,29,'none',`stroke="${p.accent}" stroke-width="3"`)+ellipse(0,0,14,30,'none',`stroke="${p.accent}" stroke-width="2" transform="rotate(28)"`)+ellipse(0,0,36,12,'none',`stroke="${p.deep}" stroke-width="2" transform="rotate(-23)"`)+star(0,0,10,p)+path('M0 30v15','none',p.accent,3)+'</g>'
      +[[-89,-4],[-45,28],[43,5],[89,36]].map(([x,y])=>star(240+x,135+y,4,p)).join('')+herb(108,217,.55,p)+herb(370,220,.65,p);
  }
  function spring(id,p) {
    if(id==='fengxia')return maple(353,171,.78,p)+[0,1,2].map(i=>{const y=135+i*35,w=150+i*52;return path(`M${240-w/2} ${y-18}h${w}l18 32h${-w-36}Z`,'#d0c79e',p.ink,.8)+path(`M${222-w/2} ${y+14}h${w+36}v21h${-w-36}Z`,'#aca98a')+path(`M${245-w/2} ${y-12}h${w-9}l12 20h${-w-33}Z`,'#899769')+path(`M${238+w/2} ${y-12}l12 20h${-w-31}`,'none','#9ec5ac',4)+[-.35,-.16,.04,.24,.42].map((v,j)=>herb(240+v*w,y+(j%2)*4,.65,p)).join('');}).join('')
      +path('M360 132v24q-9 12-8 23v29q7 10 12 23','none','#72aa99',6)+path('M360 135v20m-8 26v24','none','#d1ead0',2)+herb(95,228,.7,p);
    if(id==='xuanyue')return path('M289 69C354 81 367 162 310 187C336 156 326 102 289 69Z','#b8cab8',p.ink,1)
      +path('M306 84C332 113 339 153 313 179','none',p.light,4)+ellipse(240,202,144,38,'#a1b29c')+ellipse(240,193,144,38,'#dbe0c5')+ellipse(240,191,128,31,'#80aea3')
      +ellipse(240,188,107,23,'#9dc1b3')+[24,53,89].map(r=>ellipse(230,188,r,r*.23,'none','stroke="#d9e9d3" stroke-width="1.8"')).join('')
      +path('M265 177q13-17 29-2q-22 1-16 14q-19-3-13-12Z','#e7e8c9','none',0,'opacity=".8"')
      +[118,362].map(x=>rect(x-11,165,22,30,p.deep,4)+rect(x-16,160,32,10,p.light,3)+lamp(x,154,p,.60)).join('')+bamboo(109,202,.68,p)+herb(346,225,.8,p);
    if(id==='lingxi')return bamboo(116,181,.92,p)+bamboo(352,183,.96,p)+ellipse(240,202,142,38,'#c4cfaa')
      +path('M161 169C205 150 276 170 245 190C207 213 255 233 328 213','none','#80afa1',20)
      +path('M161 164C208 147 280 169 247 191C215 212 262 224 327 210','none','#dce8c9',3)
      +path('M203 183Q231 166 263 182L261 196Q229 181 205 197Z','#beae7d',p.ink,1)
      +path('M203 177Q231 158 263 177','none',p.deep,3)+[207,220,233,247,260].map((x,i)=>path(`M${x} ${[175,170,169,170,175][i]}v12`,'none',p.deep,2)).join('')
      +[[170,198],[201,226],[302,179],[323,210]].map(([x,y])=>rect(x-11,y,22,13,'#9eae91',4)+ellipse(x,y,15,5,'#e3dfc1')).join('')
      +ellipse(303,200,19,7,'#d3ceb0')+rect(299,204,8,9,'#a8b499',2)+herb(133,216,.65,p)+herb(361,226,.65,p);
    return ellipse(240,211,140,33,'#a1b7ad')+ellipse(240,203,140,33,'#dddcc0')+ellipse(240,200,125,28,'#a2c3b7')
      +[35,69,104].map(r=>ellipse(240,200,r,r*.22,'none',`stroke="${p.accent}" stroke-width="1.3"`)).join('')
      +[-80,-40,0,40,80].map(x=>path(`M${240+x} ${200-Math.sqrt(125*125-x*x)*.22}V${200+Math.sqrt(125*125-x*x)*.22}`,'none',p.deep,.7,'opacity=".5"')).join('')
      +path('M119 193H361M119 206H361','none',p.deep,.7,'opacity=".5"')
      +`<g transform="translate(240 132)">`+ellipse(0,0,70,60,'none',`stroke="${p.accent}" stroke-width="4"`)+ellipse(0,0,30,60,'none',`stroke="${p.deep}" stroke-width="2.5" transform="rotate(28)"`)+ellipse(0,0,70,21,'none',`stroke="${p.accent}" stroke-width="3" transform="rotate(-23)"`)+path('M0 60v12M-26 74h52','none',p.deep,6)+star(0,0,13,p)+'</g>'
      +[[171,204],[213,181],[285,199],[321,208]].map(([x,y])=>star(x,y,4,p)).join('')+bamboo(386,220,.40,p);
  }
  function library(id,p) {
    if(id==='fengxia')return stairs(p,212,259)+maple(369,206,.8,p)
      +rect(139,121,148,89,'#ded9b6',2)+rect(157,77,112,61,'#eae2bf',3)
      +[145,206,279].map(x=>rect(x,122,7,87,p.deep,1)).join('')+[176,237].map(x=>books(x,191,p)+rect(x-22,157,44,41,'none',1,`stroke="${p.deep}" stroke-width="2"`)).join('')
      +roof(212,127,184,p)+roof(212,77,145,p,true)+rect(201,82,23,25,p.deep,3)+path('M206 89h13m-13 7h13','none',p.light,1)
      +rect(293,162,7,47,p.deep,1)+rect(337,162,7,47,p.deep,1)+roof(316,157,82,p,true)
      +path('M292 187h50M292 202h50','none',p.deep,3)+rect(301,184,32,15,p.light,3)+path('M307 188h20m-20 4h15','none',p.accent,1)+lamp(132,161,p,.67);
    if(id==='xuanyue')return stairs(p,213,239)+rect(145,140,190,70,'#d1d7bc',3)
      +[170,310].map(x=>rect(x-25,149,50,60,p.deep,3)+[172,200].map(y=>books(x,y,p)).join('')).join('')
      +ellipse(240,122,66,59,'#becfc1')+ellipse(240,118,53,48,p.deep)+ellipse(240,118,43,39,'#e8e5ca')
      +path('M227 86q30 29 0 64q47-11 25-55Z','#9db7af')+path('M201 119H280M240 80V157','none',p.accent,1.3)
      +roof(240,78,142,p,true)+path('M142 145Q240 123 338 145L329 157H151Z',p.roof,p.ink,1)
      +[141,332].map(x=>rect(x,158,7,53,p.deep,1)).join('')+lamp(198,182,p,.55)+lamp(282,182,p,.55)+bamboo(104,220,.59,p);
    if(id==='lingxi')return stairs(p,213,280)+bamboo(98,216,.82,p)+bamboo(384,215,.91,p)
      +[135,193,282,340].map(x=>rect(x-4,113,8,98,p.deep,1)+rect(x-8,205,16,9,'#bfc4a4',2)).join('')
      +roof(176,113,129,p)+roof(304,113,129,p)+path('M188 102Q240 77 292 102L290 117H190Z',p.roof,p.ink,1)+path('M187 102Q240 77 293 102','none',p.light,3)
      +rect(162,181,156,13,p.accent,3)+[174,303].map(x=>rect(x,194,6,16,p.deep,1)).join('')
      +rect(211,155,58,17,'#c8b582',3)+rect(218,172,7,16,p.deep,1)+rect(255,172,7,16,p.deep,1)
      +path('M232 154q-10-6-18-3v12q9-3 18 2q9-5 18-2v-12q-8-3-18 3Z',p.light,p.ink,.9)
      +[181,214,266,297].map(x=>ellipse(x,202,10,4,p.deep)+rect(x-7,202,14,8,p.deep,2)).join('')
      +lamp(160,145,p,.65)+lamp(322,145,p,.65);
    return stairs(p,217,246)+rect(247,103,75,111,'#c9d2bb',3)+path('M247 103 259 91H312L322 103Z',p.light,p.ink,1)
      +[258,307].map(x=>rect(x,113,5,90,p.deep,1)).join('')+rect(273,132,21,32,p.deep,10)+ellipse(283,145,8,11,'#dce8d0')
      +ellipse(284,94,51,13,p.roof)+ellipse(284,89,52,13,'#dce0c7')+path('M232 89V74M336 89V74M248 96V83M320 96V83M232 74Q284 94 336 74','none',p.accent,2)
      +path('M278 89 290 57M277 66 316 47','none',p.deep,9)+ellipse(317,46,8,12,p.accent,'transform="rotate(-29 317 46)"')+ellipse(318,46,5,8,'#8baead','transform="rotate(-29 318 46)"')
      +rect(142,185,82,24,p.deep,3)+ellipse(183,184,50,13,'#b7ccb9')+ellipse(183,181,42,10,'none',`stroke="${p.accent}" stroke-width="1.5"`)
      +path('M142 181H225M183 171V192M155 174 210 189M155 189 210 174','none',p.accent,1)+star(182,181,6,p)
      +path('M237 212v-55h-10v-13h-10v-13','none','#b3bc9e',12)+bamboo(365,220,.55,p)+star(230,57,5,p);
  }
  global.spiritSectArt = function (sectId, options) {
    const p=typeof sectId==='string'&&Object.prototype.hasOwnProperty.call(palettes,sectId)?palettes[sectId]:null;if(!p)return '';
    const opts=options&&typeof options==='object'?options:{};
    const stage=['gate','spring','library'].includes(opts.stage)?opts.stage:'gate';
    const id=`sect-landscape-${++serial}`,title=opts.label||`${global.SpiritSects?.map?.[sectId]?.name||''} · ${names[sectId][['gate','spring','library'].indexOf(stage)]}`;
    const size=Number.isFinite(opts.size)&&opts.size>0?Math.min(2400,Math.max(32,opts.size)):null;
    const art=(stage==='gate'?gate:stage==='spring'?spring:library)(sectId,p);
    return `<svg xmlns="http://www.w3.org/2000/svg" class="spirit-sect-art${opts.className?' '+esc(opts.className):''}" viewBox="0 0 480 280" ${size?`width="${size}" height="${size*7/12}"`:'width="100%"'} role="img" aria-labelledby="${id}-title" data-sect="${sectId}" data-stage="${stage}"><title id="${id}-title">${esc(title)}</title><defs><linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="#f9f4e6"/><stop offset="1" stop-color="${p.mist}"/></linearGradient><radialGradient id="${id}-ground"><stop stop-color="#c5cfad" stop-opacity=".65"/><stop offset="1" stop-color="#c5cfad" stop-opacity="0"/></radialGradient></defs>`
      +rect(0,0,480,280,`url(#${id}-sky)`,18)+ellipse(246,79,108,73,'#fff8de','opacity=".58"')
      +path('M0 157 41 130 67 145 112 93 160 141 207 111 257 150 306 112 337 133 383 92 436 138 480 117V230H0Z',p.mist)
      +path('M0 182Q64 148 117 167T230 169T347 157T480 174V253H0Z',p.leaf,'',0,'opacity=".09"')
      +ellipse(240,224,207,45,`url(#${id}-ground)`)+path('M71 236Q130 247 184 241M302 244Q367 250 416 228','none',p.light,3)
      +art+path('M24 216q31-5 57 0M393 241q37 5 62-5','none','#fff9e9',3,'opacity=".75"')
      +[[56,83],[414,68],[403,126]].map(([x,y],i)=>ellipse(x,y,1.8-i*.3,1.8-i*.3,p.accent,'opacity=".5"')).join('')+'</svg>';
  };
})(window);
