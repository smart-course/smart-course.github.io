/* Bounded, independently animated sanctuary effects. The Three architecture
 * remains cached in software mode; this canvas never changes game/weather data. */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const COLORS = {
    fengxia: { name: '枫叶流霞', bright: '#ffd28a', soft: '#ef8c38' },
    xuanyue: { name: '月华映水', bright: '#e4ffda', soft: '#78d7bd' },
    lingxi: { name: '云鹤传书', bright: '#fffbea', soft: '#8bc766' },
    xinglan: { name: '星河环流', bright: '#ffe3a2', soft: '#99d6ff' }
  };
  const frac = value => value - Math.floor(value);
  const random = i => frac(Math.sin(i * 91.73 + 17.39) * 43758.5453);
  const positive = value => (value % 1 + 1) % 1;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sum = object => Object.values(object).reduce((total, value) => total + value, 0);
  const rgba = (hex, alpha) => `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${clamp(alpha,0,1)})`;
  const MOON = [-4.48, 18, -22.08];

  global.createSpiritSectEffects = function ({ THREE: T, container, camera, sectId, positions = {}, moonPosition = null, hasLake = false, reducedMotion = false, software = false }) {
    if (!T || !container || !camera || !Object.hasOwn(COLORS, sectId)) return null;
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) return null;
    canvas.className = 'sect-visit-effects';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
    container.appendChild(canvas);
    // The sky banks belong behind the floating rock silhouette. A separate
    // transparent layer lets the same occlusion work in WebGL and Canvas.
    const skyCanvas = sectId === 'xinglan' ? document.createElement('canvas') : null;
    const skyContext = skyCanvas?.getContext('2d');
    if (skyContext) {
      skyCanvas.className = 'sect-visit-sky-clouds';
      skyCanvas.setAttribute('aria-hidden', 'true');
      skyCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
      container.appendChild(skyCanvas);
    }
    const point = new T.Vector3(), pal = COLORS[sectId], cloudTextures = new Map();
    // Share the mesh's mutable anchor so responsive layout moves light and moon
    // together. Standalone effect previews retain their default sky position.
    const lunarPosition = moonPosition?.isVector3 ? moonPosition : new T.Vector3(...MOON);
    let width = 1, height = 1, ratio = 1, mobile = false, raf = 0, destroyed = false, visible = true;
    let first = true, last = -Infinity, elapsed = 6, previousStamp = null, renderedFrames = 0;
    // Standalone callers retain their original themed tableau until the scene
    // supplies its visual clock. This clock never reads or writes game state.
    let daylight = sectId === 'xuanyue' || sectId === 'xinglan' ? 0 : 1;
    let phaseId = daylight ? 'day' : 'night';
    let weather = { weatherId: 'clear', windStrength: .22, windDirection: .6, cloudAmount: .35 };
    let completion = { gate: false, spring: false, library: false };
    let frameStats = { drawnElements: 0, drawnAmbientElements: 0, drawnAttachedElements: 0, drawCalls: 0, largestParticlePx: 0 };
    const project = (x, y, z) => {
      point.set(x, y, z).project(camera);
      return { x: (point.x * .5 + .5) * width, y: (-point.y * .5 + .5) * height, visible: point.z > -1 && point.z < 1 };
    };
    const inside = (q, padding = 25) => q.visible && q.x >= -padding && q.x <= width + padding && q.y >= -padding && q.y <= height + padding;
    const place = (stage, x, y, z) => {
      const p = positions[stage] || { x: 0, y: 0, z: 0, scale: 1 };
      return [p.x + x * p.scale, p.y + y * p.scale, p.z + z * p.scale];
    };
    // Labels are above this canvas; also soften crossing foreground particles.
    const legible = q => q.x > width * .28 && q.x < width * .72 && q.y > height * .16 && q.y < height * .58 ? .66 : 1;
    const count = (size = 0, attached = false) => {
      frameStats.drawnElements++; frameStats[attached ? 'drawnAttachedElements' : 'drawnAmbientElements']++;
      frameStats.largestParticlePx = Math.max(frameStats.largestParticlePx, size);
    };
    const fill = () => { context.fill(); frameStats.drawCalls++; };
    const stroke = () => { context.stroke(); frameStats.drawCalls++; };
    function budgets() {
      let ambient, attached;
      if (sectId === 'fengxia') {
        ambient = { leaves: mobile ? 48 : 78, windRibbons: mobile ? 4 : 6, nightStars: daylight < 1 ? (mobile ? 8 : 12) : 0 };
        attached = { lanternEmbers: completion.gate ? (mobile ? 6 : 8) : 0 };
      } else if (sectId === 'xuanyue') {
        ambient = {
          fireflies: daylight < 1 ? (mobile ? 42 : 70) : 0,
          moonBeams: daylight < 1 ? (mobile ? 3 : 5) : 0,
          moonHalo: daylight < 1 ? 1 : 0,
          lunarMotes: daylight < 1 ? (mobile ? 10 : 18) : 0,
          waterGlints: !hasLake && daylight > 0 ? (mobile ? 12 : 20) : 0,
          waterRibbons: !hasLake && daylight > 0 ? (mobile ? 2 : 3) : 0
        };
        attached = { gateOrbits: completion.gate ? 2 : 0, waterRipples: completion.spring ? 3 : 0 };
      } else if (sectId === 'lingxi') {
        ambient = { springLeaves: mobile ? 22 : 36, petals: mobile ? 20 : 32, cranes: mobile ? 3 : 5, greenRibbons: mobile ? 4 : 6, pollen: mobile ? 8 : 14, nightStars: daylight < 1 ? (mobile ? 8 : 12) : 0 };
        attached = { lectureGlints: completion.library ? (mobile ? 4 : 6) : 0 };
      } else {
        ambient = { skyStars: daylight < 1 ? (mobile ? 46 : 78) : 0, ambientOrbits: mobile ? 2 : 3, orbitStars: mobile ? 5 : 8, meteors: daylight < 1 ? (mobile ? 2 : 3) : 0 };
        attached = { observatoryOrbits: completion.library ? 3 : 0, springStars: completion.spring ? 5 : 0 };
      }
      ambient.cloudWisps = daylight > 0 && weather.cloudAmount > .04 && weather.windStrength < .7 ? (mobile ? 2 : 3) : 0;
      // Cloud sea is part of Xinglan's landscape in both visual clocks. It
      // still obeys the same real wind/cloud state as the passing sky wisps.
      const sea = sectId === 'xinglan' && weather.cloudAmount > .04 && weather.windStrength < .7;
      ambient.cloudBanks = sea ? (mobile ? 9 : 12) : 0;
      ambient.cloudVeils = sea ? (mobile ? 2 : 3) : 0;
      return { ambient, attached, ambientBudget: sum(ambient), attachedBudget: sum(attached), budgetBreakdown: { ...ambient, ...attached } };
    }
    function glow(q, radius, color, alpha) {
      const g = context.createRadialGradient(q.x, q.y, 0, q.x, q.y, radius);
      g.addColorStop(0, rgba(color, .66)); g.addColorStop(.25, rgba(color, .35)); g.addColorStop(.6, rgba(color, .12)); g.addColorStop(1, rgba(color, 0));
      context.globalAlpha = clamp(alpha, 0, 1); context.fillStyle = g;
      context.beginPath(); context.arc(q.x, q.y, radius, 0, TAU); fill();
    }
    function dot(q, radius, color, alpha) {
      context.globalAlpha = clamp(alpha, 0, 1); context.fillStyle = color;
      context.beginPath(); context.arc(q.x, q.y, radius, 0, TAU); fill();
    }
    function star(q, size, alpha, color = pal.bright, halo = true) {
      if (halo) glow(q, size * 3.6, color, alpha * .9);
      context.globalAlpha = clamp(alpha, 0, 1); context.fillStyle = color;
      context.beginPath(); context.moveTo(q.x, q.y - size);
      context.lineTo(q.x + size * .22, q.y - size * .22); context.lineTo(q.x + size, q.y);
      context.lineTo(q.x + size * .22, q.y + size * .22); context.lineTo(q.x, q.y + size);
      context.lineTo(q.x - size * .22, q.y + size * .22); context.lineTo(q.x - size, q.y);
      context.lineTo(q.x - size * .22, q.y - size * .22); context.closePath(); fill();
    }
    function projectedPath(points, color, alpha = .6, lineWidth = 1.5, luminous = false) {
      const projected = points.map(p => project(...p));
      if (!projected.some(q => inside(q, 90))) return false;
      context.beginPath(); projected.forEach((q, i) => i ? context.lineTo(q.x, q.y) : context.moveTo(q.x, q.y));
      context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = color;
      // Soft tails blend into the landscape instead of ending in bright bars.
      if (luminous) {
        const firstPoint=projected[0],lastPoint=projected[projected.length-1];
        const fade=context.createLinearGradient(firstPoint.x,firstPoint.y,lastPoint.x,lastPoint.y);
        fade.addColorStop(0,rgba(color,.02));fade.addColorStop(.22,rgba(color,.48));
        fade.addColorStop(.68,rgba(color,.93));fade.addColorStop(1,rgba(color,luminous==='ribbon'?.04:1));
        context.strokeStyle=fade;
        context.lineWidth=lineWidth*3.5;context.globalAlpha=alpha*.13;stroke();
      }
      context.lineWidth = lineWidth; context.globalAlpha = alpha; stroke(); return true;
    }
    function windRibbon(t, index, color, green) {
      const points = [];
      for (let j = 0; j <= 24; j++) {
        const x = -18 + j * 1.5, a = j * .15 + t * (.18 + weather.windStrength * .45) + index * 1.4;
        points.push([x, 2.5 + index * .7 + Math.sin(a) * .7, -9 + index * 3.4 + Math.cos(a * .7) * 1.7]);
      }
      if (projectedPath(points, color, (green ? .32 : .27) * (.48 + daylight * .52), mobile ? 1.45 : 1.8, 'ribbon')) count();
    }
    function maple(t, unit, b) {
      for (let k = 0; k < b.windRibbons; k++) windRibbon(t, k, '#f1b15a', false);
      for (let i = 0; i < b.leaves; i++) {
        const layer = i % 6 === 0 ? 2 : i % 2 ? 0 : 1, group = i % 4, progress = positive(t * (.041 + layer * .01 + random(i + 9) * .014) + random(i + 60));
        const baseX = layer === 2 ? (i % 2 ? -1 : 1) * (9 + random(i + 201) * 6) : -17 + random(i + 201) * 34;
        const x = baseX + (progress - .5) * (7 + layer * 2 + weather.windStrength * 7) + Math.sin(t * (.30 + weather.windStrength * .55) + group * .78) * (1.4 + weather.windStrength * 3);
        const z = -19 + layer * 11 + random(i + 321) * 10 + Math.cos(t * .25 + group) * .7;
        const q = project(x, 13.5 - progress * 14 + layer * .5, z); if (!inside(q, 32)) continue;
        const size = clamp(unit * (.25 + layer * .21 + random(i + 43) * .13), [4.5,7.5,12][layer], [8.5,13.5,20][layer]);
        const flutter = Math.cos(t * (1.05 + layer * .16) + i * .86);
        context.save(); context.translate(q.x, q.y); context.rotate(t * (.35 + layer * .13) + i * 1.91); context.scale(.55 + Math.abs(flutter) * .45, 1);
        context.globalAlpha = (.28 + .72 * Math.sin(progress * Math.PI)) * (.65 + layer * .14) * legible(q) * (.52 + daylight * .48);
        const pigments=[['#ed8d43','#b8442b'],['#f8ba5d','#cf632d'],['#f5d581','#cc963e'],['#d7754b','#973e31']][i%4];
        const pigment=context.createLinearGradient(-size*.6,-size,size*.5,size);
        pigment.addColorStop(0,pigments[0]);pigment.addColorStop(1,pigments[1]);context.fillStyle=pigment;
        context.strokeStyle = '#a64d32'; context.lineWidth = .45;
        const outline = [[0,-1],[.2,-.44],[.52,-.72],[.46,-.2],[.9,-.38],[.72,.08],[1,.24],[.38,.47],[.18,.92],[0,.59],[-.3,.8],[-.36,.34],[-.92,.2],[-.66,-.04],[-.82,-.5],[-.35,-.3],[-.44,-.8]];
        context.beginPath(); outline.forEach(([x,y],j) => j ? context.lineTo(x*size,y*size) : context.moveTo(x*size,y*size)); context.closePath(); fill(); stroke();
        context.globalAlpha *= .64; context.strokeStyle = '#ffe0a0'; context.lineWidth = .55;
        context.beginPath();context.moveTo(0,-size*.73);context.quadraticCurveTo(-size*.05,0,0,size*.7);
        for(const side of[-1,1])for(const branch of[.23,.51]){context.moveTo(0,size*(.3-branch*.5));context.lineTo(side*size*(.34+branch*.5),-size*branch);}
        stroke();context.strokeStyle='#98613b';context.lineWidth=.65;
        context.beginPath();context.moveTo(0,size*.55);context.quadraticCurveTo(size*.09,size*.88,size*.2,size*1.05);stroke();
        context.restore(); count(size * 2.1);
      }
      for (let i = 0; i < b.lanternEmbers; i++) {
        const phase = positive(t * .10 + i * .19), side = i % 2 ? -1 : 1;
        const q = project(...place('gate', side * 1.17 + Math.sin(i+t) * .12, 3.48 + phase * 1.2, .32));
        if (inside(q)) { const size = 2.5 + random(i+100)*2.5; star(q,size,(.35+.55*Math.sin(phase*Math.PI))*(1-daylight*.76),'#ffe0a0'); count(size*2,true); }
      }
    }
    function moonlight(t, unit, b) {
      const moon = project(lunarPosition.x,lunarPosition.y,lunarPosition.z),discRadius=clamp(height*.036,18,36),radius=discRadius*2.35;
      // A restrained glow belongs to the lit arc, not the empty centre of the
      // crescent. Apparent celestial size stays independent of island zoom.
      const light={x:moon.x-discRadius*.55,y:moon.y-discRadius*.16};
      if (b.moonHalo && inside(moon, radius)) {
        const halo = context.createRadialGradient(light.x,light.y,0,light.x,light.y,radius);
        halo.addColorStop(0,'rgba(255,239,201,.12)'); halo.addColorStop(.3,'rgba(255,227,173,.07)'); halo.addColorStop(.65,'rgba(240,205,151,.022)'); halo.addColorStop(1,'rgba(240,205,151,0)');
        context.globalAlpha = .62 * (1-daylight); context.fillStyle = halo; context.beginPath(); context.arc(light.x,light.y,radius,0,TAU); fill(); count(radius*2);
      }
      // Moonlight comes from a very distant source. These broad, nearly
      // parallel atmospheric veils enter above the frame; they never converge
      // at the moon's centre or point at separate landmarks like spotlights.
      const dx=-.31,dy=Math.sqrt(1-dx*dx),nx=dy,ny=-dx,length=height*1.13;
      for (let i=0;i<b.moonBeams;i++) {
        const spread=clamp(width*.038,19,52)*(1+(i%2)*.22),offset=(i-(b.moonBeams-1)/2)*width*.145;
        const start={x:moon.x+offset+Math.sin(t*.07+i)*width*.006,y:-height*.12-i%2*height*.035},end={x:0,y:0};
        end.x=start.x+dx*length;end.y=start.y+dy*length;
        const gradient=context.createLinearGradient(start.x,start.y,end.x,end.y);
        gradient.addColorStop(0,'rgba(255,239,205,0)'); gradient.addColorStop(.20,'rgba(255,235,194,.075)'); gradient.addColorStop(.58,'rgba(243,224,188,.045)'); gradient.addColorStop(1,'rgba(232,219,194,0)');
        context.fillStyle=gradient;
        for(const[feather,strength]of[[1.55,.14],[1.05,.22],[.62,.32]]){
          context.globalAlpha=(.48+Math.sin(t*.09+i)*.025)*strength*(1-daylight);
          context.beginPath();context.moveTo(start.x+nx*spread*feather,start.y+ny*spread*feather);
          context.lineTo(end.x+nx*spread*feather,end.y+ny*spread*feather);
          context.lineTo(end.x-nx*spread*feather,end.y-ny*spread*feather);
          context.lineTo(start.x-nx*spread*feather,start.y-ny*spread*feather);context.closePath();fill();
        }
        count(spread*3.1);
      }
    }
    function fireflyPosition(i,t) {
      const a=t*(.25+random(i+511)*.16)+i*2.399;
      return [-14+random(i+411)*28+Math.sin(a)*1.7,.7+random(i+512)*5.1+Math.sin(a*1.4)*.6,-9+random(i+613)*23+Math.cos(a*.8)*1.2];
    }
    function moon(t, unit, b) {
      moonlight(t,unit,b);
      // Daytime reflections sit on the open lake, away from the hillside halls.
      for(let i=0;i<b.waterGlints;i++) {
        const q=project(-19.6+random(i+1201)*2.3,.15,1.1+random(i+1202)*5.7);
        if(!inside(q))continue;
        const pulse=(.2+.56*Math.pow(.5+.5*Math.sin(t*.9+i*1.73),2))*daylight,size=1.3+random(i+1203)*1.5;
        context.save();context.translate(q.x,q.y);context.scale(1.7,.45);star({x:0,y:0},size,pulse,'#e7f4de',false);context.restore();count(size*3.4);
      }
      for(let k=0;k<b.waterRibbons;k++) {
        const points=[];
        for(let j=0;j<=18;j++){const x=-19.5+j*.12;points.push([x,.15,2+k*1.6+Math.sin(x*.4+t*.2+k)*.10]);}
        if(projectedPath(points,'#d0e6d9',daylight*.28,mobile?.85:1.1,'ribbon'))count();
      }
      for(let i=0;i<b.fireflies;i++) {
        const q=project(...fireflyPosition(i,t)); if(!inside(q,25))continue;
        const near=i%3===0,size=near?2.6+random(i+731)*1.6:1.5+random(i+731)*1.2, pulse=(.45+.55*Math.pow(.5+.5*Math.sin(t*(1.1+random(i+63)*.8)+i*1.94),1.4))*legible(q)*(1-daylight);
        const color=i%4===0?'#adf7f1':'#d5ff8f';
        projectedPath([fireflyPosition(i,t-.7),fireflyPosition(i,t-.4),fireflyPosition(i,t)],color,pulse*.56,near?1.5:1,true);
        glow(q,size*(near?5.2:4.5),color,pulse); dot(q,size,color,pulse); dot(q,size*.38,'#ffffff',pulse); count(size*2);
      }
      for(let i=0;i<b.lunarMotes;i++) {
        const phase=positive(t*.025+random(i+806)),q=project(-14+random(i+807)*28,1+phase*8,-18+random(i+808)*19);
        if(inside(q)){const size=1.8+random(i+809)*1.2;star(q,size,(.25+.4*Math.sin(phase*Math.PI))*(1-daylight),'#ffe6b5');count(size*2);}
      }
      for(let k=0;k<b.gateOrbits;k++) {
        const start=t*.17+k*Math.PI,points=[];
        for(let j=0;j<=28;j++){const a=start+j/28*Math.PI*.67;points.push(place('gate',Math.cos(a)*2.64,3.16+Math.sin(a)*2.64,.23));}
        if(projectedPath(points,'#e1ffef',.68*(1-daylight*.74),1.7,true)){const q=project(...points[points.length-1]);star(q,4,.9*(1-daylight*.74));count(8,true);}
      }
      for(let i=0;i<b.waterRipples;i++) {
        const phase=positive(t*.11+i/3),r=.35+phase*1.75,points=[];
        for(let j=0;j<=40;j++){const a=j/40*TAU;points.push(place('spring',-.18+Math.cos(a)*r,.704,.18+Math.sin(a)*r));}
        if(projectedPath(points,'#b5e8ff',.58*Math.sin(phase*Math.PI)*(1-daylight*.42),1.4,true))count(0,true);
      }
    }
    function springParticle(t,unit,i,petal) {
      const seed=i+(petal?500:0),phase=positive(t*(.035+random(seed+40)*.02)+random(seed+70)),near=i%3===0;
      const q=project(-17+random(seed+90)*34+Math.sin(t*(.28+weather.windStrength*.45)+i%4)*(1.5+weather.windStrength*3)+phase*(3+weather.windStrength*4),10.4-phase*10.5,-15+random(seed+110)*31);if(!inside(q,20))return;
      const size=clamp(unit*(near?.57:.32),near?7.5:4.4,near?11:7);
      context.save();context.translate(q.x,q.y);context.rotate(t*.55+seed*1.74);context.scale(.65+.35*Math.abs(Math.cos(t*1.1+seed)),1);
      context.globalAlpha=(.45+.5*Math.sin(phase*Math.PI))*legible(q)*(.48+daylight*.52);
      const tint=context.createLinearGradient(-size,0,size,size*.4);tint.addColorStop(0,petal?'#fff0df':'#c0df83');tint.addColorStop(.5,petal?'#f6c5ce':'#89be61');tint.addColorStop(1,petal?'#df9fb5':'#4f9851');
      context.fillStyle=tint;context.strokeStyle=petal?'#fff2ee':'#d5f6a6';context.lineWidth=.55;
      context.beginPath();context.moveTo(-size,0);context.quadraticCurveTo(-size*.25,-size*.85,size,0);context.quadraticCurveTo(size*.18,size*(petal?.92:.65),-size,0);fill();
      context.beginPath();context.moveTo(-size*.7,0);context.quadraticCurveTo(0,-size*.12,size*.8,0);stroke();context.restore();count(size*2);
    }
    function cranes(t,unit,b) {
      for(let k=0;k<b.greenRibbons;k++)windRibbon(t,k,'#a7d876',true);
      for(let i=0;i<b.springLeaves;i++)springParticle(t,unit,i,false);
      for(let i=0;i<b.petals;i++)springParticle(t,unit,i,true);
      for(let i=0;i<b.cranes;i++) {
        const a=t*.105+i*1.23,x=Math.cos(a)*(8.1+i*.32),z=-4+Math.sin(a)*(5+i*.35),y=8.8+i*.65+Math.sin(t*.38+i)*.35;
        const q=project(x,y,z),ahead=project(x-Math.sin(a),y,z+Math.cos(a));if(!inside(q,35))continue;
        const size=clamp(unit*.82,12,24),flap=.5+.5*Math.sin(t*1.7+i),wing=.65+.36*flap;
        context.save();context.translate(q.x,q.y);context.rotate(Math.atan2(ahead.y-q.y,ahead.x-q.x));context.globalAlpha=.94*(.55+daylight*.45);context.fillStyle='#fffdf0';context.strokeStyle='#6b9e7a';context.lineWidth=.8;
        context.beginPath();context.moveTo(size*.9,-size*.04);context.quadraticCurveTo(size*.43,-size*.19,size*.13,-size*.1);context.quadraticCurveTo(-size*.1,-size*wing,-size*.48,-size*wing);context.quadraticCurveTo(-size*.21,-size*.18,-size*.36,-size*.08);context.lineTo(-size*.96,size*.06);context.lineTo(-size*.33,size*.18);context.quadraticCurveTo(-size*.13,size*wing,size*.08,size*wing);context.quadraticCurveTo(size*.04,size*.2,size*.22,size*.09);context.quadraticCurveTo(size*.6,size*.07,size*.9,-size*.04);context.closePath();fill();stroke();
        context.fillStyle='#d7e6d8';context.globalAlpha=.85*(.55+daylight*.45);context.beginPath();context.ellipse(-size*.08,0,size*.43,size*.105,0,0,TAU);fill();
        context.strokeStyle='#e9eee0';context.lineWidth=Math.max(1,size*.10);context.beginPath();context.moveTo(size*.1,0);context.bezierCurveTo(size*.36,-size*.13,size*.41,-size*.25,size*.64,-size*.15);stroke();
        context.fillStyle='#9d6654';context.beginPath();context.moveTo(size*.63,-size*.17);context.lineTo(size*.98,-size*.11);context.lineTo(size*.66,-size*.09);context.closePath();fill();
        context.strokeStyle='#b9925e';context.lineWidth=.7;context.beginPath();context.moveTo(-size*.58,size*.06);context.lineTo(-size*1.2,size*.15);context.moveTo(-size*.58,size*.12);context.lineTo(-size*1.15,size*.23);stroke();context.restore();count(size*2.4);
      }
      for(let i=0;i<b.pollen;i++) {
        const q=project(-15+random(i+211)*30,1.5+random(i+212)*5+Math.sin(t*.4+i)*.8,-10+random(i+213)*23);if(!inside(q))continue;
        glow(q,7,'#ddf6a9',.6*(1-daylight*.52));dot(q,1.7,'#eaffbf',.8*(1-daylight*.4));count(3.4);
      }
      for(let i=0;i<b.lectureGlints;i++) {
        const a=t*.23+i*TAU/b.lectureGlints,q=project(...place('library',Math.cos(a)*2,3.4+Math.sin(a)*.7,Math.sin(a)*1.3));
        if(inside(q)){star(q,3.6,.65*(1-daylight*.74),'#fff3bc');count(7.2,true);}
      }
    }
    function seasonalNightStars(t,amount) {
      for(let i=0;i<amount;i++) {
        const q={x:(.04+random(i+1701)*.92)*width,y:(.035+random(i+1702)*.22)*height,visible:true};
        const size=1+random(i+1703)*(mobile?1.1:1.7),alpha=(.25+.45*Math.pow(.5+.5*Math.sin(t*.6+i*1.9),2))*(1-daylight);
        star(q,size,alpha,i%3?'#d8e7ef':'#fbe7b9');count(size*2);
      }
    }
    function stars(t,unit,b) {
      const night=1-daylight,arcStrength=.22+night*.78;
      const rear=positions.library||{x:1.65,y:7.1,z:-21},gate=positions.gate||{x:0,y:.31,z:3.8};
      const orbitX=(rear.x+gate.x)*.5,orbitY=rear.y+6.2,orbitZ=rear.z+5.5;
      const anchor=project(rear.x,rear.y+10,rear.z),driftX=(anchor.x-width*.5)*.13,driftY=(anchor.y-height*.2)*.09;
      for(let i=0;i<b.skyStars;i++) {
        const q={x:positive(random(i+800)+driftX/width)*width,y:(.035+random(i+900)*.53)*height+driftY,visible:true};if(!inside(q,15))continue;
        const prominent=i%8===0,size=prominent?(mobile?3.7:4.8):(.85+random(i+1000)*(mobile?1.15:1.8)),pulse=((prominent?.52:.28)+(prominent?.48:.62)*Math.pow(.5+.5*Math.sin(t*(.55+random(i+77)*.7)+i*1.94),2))*night,color=i%3===0?'#b9e8ff':i%3===1?'#fff0c4':'#d7e1f3';
        if(prominent)star(q,size,pulse,color);else{glow(q,size*3.6,color,pulse*.85);dot(q,size,color,pulse);}count(size*2);
      }
      for(let k=0;k<b.ambientOrbits;k++) {
        const angle=t*(.075+k*.02)+k*1.9,points=[];
        for(let j=0;j<=48;j++){const a=angle+j/48*TAU*.72;points.push([orbitX+Math.cos(a)*(11.4+k*1.4),orbitY+k*.65+Math.sin(a)*(.4+k*.17),orbitZ+Math.sin(a)*(6+k)]);}
        if(projectedPath(points,k%2?'#95d9ff':'#f6cf7c',.48*arcStrength,mobile?1.7:2.1,true))count();
      }
      for(let i=0;i<b.orbitStars;i++) {
        const a=t*.13+i*TAU/b.orbitStars,q=project(orbitX+Math.cos(a)*12,orbitY+.1+Math.sin(a)*.7,orbitZ+Math.sin(a)*6.5);
        if(inside(q)){const size=3.6+random(i+555)*2.9;star(q,size,.9*arcStrength,i%2?'#d0edff':'#ffe7aa');count(size*2);}
      }
      for(let i=0;i<b.meteors;i++) {
        const p=positive(t/(14+i*2.3)+.12+i*.43);if(p>.67)continue;
        const x=width*(.12+i*.23+p*.66),y=height*(.055+i*.055+p*.37),length=mobile?64:108,fade=(.35+.65*Math.sin(p/.67*Math.PI))*night;
        const gradient=context.createLinearGradient(x-length,y-length*.36,x,y);gradient.addColorStop(0,'rgba(139,203,255,0)');gradient.addColorStop(.55,'rgba(139,203,255,.35)');gradient.addColorStop(1,'rgba(255,241,192,.96)');
        context.strokeStyle=gradient;context.globalAlpha=fade;context.lineWidth=mobile?1.8:2.4;context.lineCap='round';context.beginPath();context.moveTo(x-length,y-length*.36);context.lineTo(x,y);stroke();
        for(let dust=1;dust<=3;dust++){const behind=length*(.14+dust*.13);dot({x:x-behind,y:y-behind*.36+Math.sin(i+dust+t)*1.3},1.3-dust*.2,'#c8e7ff',fade*(.29-dust*.055));}
        star({x,y},mobile?3.5:4.4,fade,'#fff0c4');count(10);
      }
      for(let k=0;k<b.observatoryOrbits;k++) {
        const angle=t*(.13+k*.026)+k*1.9,points=[];
        for(let j=0;j<=28;j++){const a=angle+j/28*Math.PI*1.2;points.push(place('library',.35+Math.cos(a)*(1.13+k*.15),8.42+Math.sin(a)*(.32+k*.18),-.35+Math.sin(a)*(1.13+k*.15)));}
        if(projectedPath(points,k===1?'#b4e9ff':'#ffe2a1',.72*arcStrength,1.6,true)){star(project(...points[points.length-1]),4.5,.95*arcStrength);count(9,true);}
      }
      for(let i=0;i<b.springStars;i++) {
        const a=t*.19+i*TAU/5,q=project(...place('spring',Math.cos(a)*1.56,3.11+Math.sin(a)*.24,Math.sin(a)*1.56));
        if(inside(q)){star(q,3.5,.84*arcStrength);count(7,true);}
      }
    }
    function cloudTexture(variant,night) {
      const key=variant+':'+(night?'night':'day');
      if(cloudTextures.has(key))return cloudTextures.get(key);
      const texture=document.createElement('canvas');texture.width=256;texture.height=112;
      const ctx=texture.getContext('2d');
      if(!ctx)return null;
      // Small, reusable density sprites have no polygon silhouette or hard
      // rim. Cool undersides and irregular bright lobes give them volume.
      function puff(x,y,r,flatten,color,alpha){
        ctx.save();ctx.translate(x,y);ctx.scale(1,flatten);
        const gradient=ctx.createRadialGradient(-r*.12,-r*.15,0,0,0,r);
        gradient.addColorStop(0,rgba(color,alpha));gradient.addColorStop(.34,rgba(color,alpha*.88));
        gradient.addColorStop(.69,rgba(color,alpha*.40));gradient.addColorStop(1,rgba(color,0));
        ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();ctx.restore();
      }
      for(let i=0;i<11;i++){
        const seed=variant*97+i*7,x=25+i*20.4,y=72-Math.sin(i/10*Math.PI)*12;
        puff(x,y,29+random(seed+2)*11,.57,night?'#52749d':'#91b2d2',night?.48:.43);
        puff(x,y-15-random(seed+3)*15,25+random(seed+4)*17,.82,night?'#a4bfdc':'#fffffc',night?.64:.82);
      }
      for(let i=0;i<18;i++){
        const seed=variant*113+i*11;
        puff(34+random(seed+1)*188,32+random(seed+2)*31,12+random(seed+3)*16,.74+random(seed+4)*.24,night?'#dae6f2':'#ffffff',night?.38:.60);
      }
      for(let i=0;i<7;i++)puff(24+i*34,79+Math.sin(i+variant)*4,35,.18,night?'#a6c2dc':'#eff7fb',.22);
      // Density lobes may cross the tiny texture boundary. Fade every edge
      // before caching so large moonlit banks cannot reveal rectangular cuts.
      ctx.globalCompositeOperation='destination-in';
      for(const horizontal of [true,false]){
        const fade=ctx.createLinearGradient(0,0,horizontal?256:0,horizontal?0:112);
        fade.addColorStop(0,'rgba(255,255,255,0)');fade.addColorStop(horizontal?.11:.16,'rgba(255,255,255,1)');
        fade.addColorStop(horizontal?.89:.78,'rgba(255,255,255,1)');fade.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=fade;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(256,0);ctx.lineTo(256,112);ctx.lineTo(0,112);ctx.closePath();ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
      cloudTextures.set(key,texture);return texture;
    }
    function cloudSea(t,unit,b) {
      if(!b.cloudBanks&&!b.cloudVeils)return;
      // Widely spaced sky banks establish a distant cloud horizon and a much
      // lower sea. They never wash over the palace, terraces or island trees.
      const banks=[
        [-27,-10,-54,38,.74],[22,-9,-58,40,.78],
        [-39,-11,-12,36,.88],[37,-9,-18,39,.84],
        [-28,-26,8,48,.92],[25,-27,12,50,.94],
        [-2,-20,-34,51,.78],[-44,-23,13,43,.85],[42,-25,8,47,.88],
        [-12,-33,7,58,.90],[48,-10,-43,31,.72],[-43,-12,-48,34,.75]
      ];
      const windX=Math.cos(weather.windDirection),windZ=Math.sin(weather.windDirection),density=.73+weather.cloudAmount*.27;
      const skyUnit = width / Math.max(1,camera.right-camera.left);
      function paint(ctx,x,y,z,size,flat,alpha,index){
        const drift=Math.sin(t*(.021+weather.windStrength*.045)+index*1.73)*(1.5+weather.windStrength*2.4);
        const q=project(x+drift*windX,y+Math.sin(t*.04+index)*.20,z+drift*windZ);
        const w=clamp(skyUnit*size,70,mobile?370:680),h=w*flat;
        if(!inside(q,w*.6))return;
        ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.sin(index*2.4)*.035);
        for(const [night,strength] of [[true,1-daylight],[false,daylight]]){
          if(strength<=0)continue;
          const texture=cloudTexture(index%3,night);if(!texture)continue;
          ctx.globalAlpha=clamp(alpha*density*strength,0,1);
          ctx.drawImage(texture,-w*.5,-h*.5,w,h);frameStats.drawCalls++;
        }
        ctx.restore();count(w);
      }
      for(let i=0;i<b.cloudBanks;i++){const p=banks[i];paint(skyContext||context,p[0],p[1],p[2],p[3],.48,p[4],i);}
      // Only narrow, translucent wisps pass in front of the low rock roots.
      // Keeping this layer below the courts preserves depth and interaction.
      const veils=[[-20,-13,10,35,.22],[22,-14,5,39,.25],[3,-23,10,43,.18]];
      for(let i=0;i<b.cloudVeils;i++){
        const p=veils[i];paint(context,p[0],p[1],p[2],p[3],.15,p[4]+weather.cloudAmount*.06,i+12);
      }
    }
    function cloudWisps(t,unit,amount) {
      const profiles=global.SpiritSectSceneryModels?.cloudProfiles;
      const fallback=[[-1,0],[-.7,.035],[-.3,.11],[.1,.06],[.45,.13],[.74,.06],[1,0],[.5,-.035],[-.2,-.04],[-.7,-.02]];
      for(let i=0;i<amount;i++){
        const drift=Math.sin(t*(.035+weather.windStrength*.06)+i*2.1)*7;
        const q=project([-13,14,-2][i]+drift,10.2+i*.95,-19-i*4);if(!inside(q,170))continue;
        const size=clamp(unit*(6.6+i*.7),mobile?70:90,mobile?112:155);
        const profile=profiles?.[i%2?'cloudWisp':'cloudRibbon'],layers=profile?.layers||[{opacity:.5,outline:fallback}];
        context.save();context.translate(q.x,q.y);context.rotate(-.035+i*.025);
        const gradient=context.createLinearGradient(-size,0,size,0);
        gradient.addColorStop(0,'rgba(255,255,250,0)');gradient.addColorStop(.20,'rgba(255,255,250,.68)');gradient.addColorStop(.53,'rgba(255,255,255,1)');gradient.addColorStop(.82,'rgba(255,255,250,.55)');gradient.addColorStop(1,'rgba(255,255,250,0)');
        context.fillStyle=gradient;
        for(const layer of layers){
          context.beginPath();layer.outline.forEach(([x,y],j)=>j?context.lineTo(x*size,-y*size*.72):context.moveTo(x*size,-y*size*.72));context.closePath();
          context.globalAlpha=clamp(layer.opacity*weather.cloudAmount*daylight*.60,0,.30);context.filter=`blur(${mobile?2:3}px)`;fill();
          context.filter='none';context.globalAlpha*=.48;fill();
        }
        context.restore();count(size*2);
      }
    }
    const drawers = { fengxia: maple, xuanyue: moon, lingxi: cranes, xinglan: stars };
    function draw(t) {
      frameStats = { drawnElements: 0, drawnAmbientElements: 0, drawnAttachedElements: 0, drawCalls: 0, largestParticlePx: 0 };
      context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);context.setTransform(ratio,0,0,ratio,0,0);context.globalCompositeOperation='source-over';
      if(skyContext){skyContext.setTransform(1,0,0,1,0,0);skyContext.clearRect(0,0,skyCanvas.width,skyCanvas.height);skyContext.setTransform(ratio,0,0,ratio,0,0);skyContext.globalCompositeOperation='source-over';}
      camera.updateMatrixWorld(true);const a=project(0,2,0),b=project(1,2,0),unit=Math.max(7,Math.hypot(a.x-b.x,a.y-b.y));
      const time=reducedMotion?6:t,budget=budgets().budgetBreakdown;
      cloudSea(time,unit,budget);
      cloudWisps(time,unit,budget.cloudWisps);
      if(budget.nightStars)seasonalNightStars(time,budget.nightStars);
      drawers[sectId](time,unit,budget);context.globalAlpha=1;renderedFrames++;
    }
    const frameRate = () => mobile || software ? 20 : 30;
    function schedule(){if(!destroyed&&visible&&!document.hidden&&!raf)raf=global.requestAnimationFrame(tick);}
    function tick(stamp){
      raf=0;if(destroyed||!visible||document.hidden)return;
      if(Number.isFinite(stamp)){if(previousStamp!==null)elapsed+=clamp((stamp-previousStamp)/1000,0,.12);previousStamp=stamp;}
      if(first||stamp-last>=1000/frameRate()||reducedMotion){first=false;last=stamp;draw(elapsed);}
      if(!reducedMotion)schedule();
    }
    function cancelFrame(){if(raf)global.cancelAnimationFrame(raf);raf=0;previousStamp=null;}
    function invalidate(){if(destroyed)return;first=true;schedule();}
    function setVisible(value){if(destroyed)return;visible=!!value;if(!visible)cancelFrame();else invalidate();}
    function resize(w,h){if(destroyed)return;width=Math.max(1,Number(w)||1);height=Math.max(1,Number(h)||1);mobile=width<560;ratio=Math.min(global.devicePixelRatio||1,mobile?1.4:1.7);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);if(skyCanvas){skyCanvas.width=canvas.width;skyCanvas.height=canvas.height;}invalidate();}
    function onVisibility(){if(document.hidden)cancelFrame();else invalidate();}
    document.addEventListener?.('visibilitychange',onVisibility);
    return {
      name:pal.name,canvas,skyCanvas:skyContext?skyCanvas:null,resize,invalidate,setVisible,
      setWeather(state){
        if(destroyed||!state||!Number.isFinite(state.windStrength)||!Number.isFinite(state.windDirection))return false;
        const next={weatherId:['clear','cloudy','mist','rain','snow'].includes(state.weatherId)?state.weatherId:'clear',windStrength:Math.round(clamp(state.windStrength,0,1)*100)/100,windDirection:((state.windDirection%TAU)+TAU)%TAU,cloudAmount:clamp(Number(state.cloudAmount)||0,0,1)};
        if(next.windStrength>=.7)next.cloudAmount=0;
        if(Object.keys(next).every(key=>next[key]===weather[key]))return false;weather=next;invalidate();return true;
      },
      setDaylight(state){
        if(destroyed||!Number.isFinite(state?.daylight))return false;
        const next=Math.round(clamp(state.daylight,0,1)*120)/120;
        const phase=['dawn','day','dusk','night'].includes(state.phaseId)?state.phaseId:(next>=.5?'day':'night');
        if(next===daylight&&phase===phaseId)return false;
        daylight=next;phaseId=phase;invalidate();return true;
      },
      setStages(status){if(destroyed)return false;const next={gate:status?.gate==='completed',spring:status?.spring==='completed',library:status?.library==='completed'};if(Object.keys(next).every(key=>next[key]===completion[key]))return false;completion=next;invalidate();return true;},
      getStats(){const b=budgets();return{sectId,phaseId,daylight,nightFactor:1-daylight,weatherId:weather.weatherId,windStrength:weather.windStrength,cloudAmount:weather.cloudAmount,hasLake,mobile,reducedMotion,visible,destroyed,particleBudget:b.ambientBudget+b.attachedBudget,ambientBudget:b.ambientBudget,attachedBudget:b.attachedBudget,budgetBreakdown:b.budgetBreakdown,particleLimit:mobile?80:128,maxFrameRate:frameRate(),pixelRatio:ratio,cloudLayerCount:skyContext?2:1,cloudTextureCount:cloudTextures.size,cloudTextureBytes:cloudTextures.size*256*112*4,renderedFrames,...frameStats,framePending:!!raf};},
      dispose(){if(destroyed)return;destroyed=true;cancelFrame();document.removeEventListener?.('visibilitychange',onVisibility);for(const texture of cloudTextures.values())texture.width=texture.height=1;cloudTextures.clear();canvas.remove();canvas.width=canvas.height=1;if(skyCanvas){skyCanvas.remove();skyCanvas.width=skyCanvas.height=1;}}
    };
  };
})(window);
