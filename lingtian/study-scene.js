/* Personal study corner. Its footprint stays on the outer garden verge,
 * outside the existing movable decoration area and all crop beds. */
(function(global){
  'use strict';
  global.createSpiritStudyScene=function({THREE:T,parent,onChange,reducedMotion=false,software=false}){
    if(!T||!parent)return null;
    const root=new T.Group();root.name='spirit-study-corner';root.position.set(-6.45,.24,-10.1);root.rotation.y=Math.PI*.18;root.visible=false;parent.add(root);
    let signature='',generation=0,disposed=false,hovered=null;
    // 智慧课堂 2026-11-19：卡框可点（看不见的点击框，手机上也好点中）；地品 SSR、天品 UR 的卡框加光晕、底座光环和灵光
    // 2026-11-20 用户：“展示牌上也是一样，不要像太阳的这种，而是要以边框为基准，随机向外散发光芒”——去掉卡框背后那张带放射光线、会转的光晕，
    //   换成贴着卡框一圈的柔光（不转，只呼吸）；灵光不再从下往上升，改成在卡框边上随机一处生出、沿外法线带一点随机偏角向外飘散淡出，飘完换一处
    const pickTargets=[],effects=[],frames=new Map();
    const GRADES={
      SSR:{name:'地品',trim:0xe2b65a,glow:0x8a5a14,glowIntensity:.7,ink:'#8a6420',paper:['#fbf3d6','#efdcaa'],border:['#a57a2c','#f3d27e','#fff6d2','#c99a3e','#f0cd78'],
        core:'rgba(255,236,176,.95)',mid:'rgba(255,198,96,.42)',rays:['rgba(255,226,150,'],rings:[0xffcf6e],sparks:[0xffe7a3,0xffcd66],count:16,halo:.8},
      UR:{name:'天品',trim:0xf3d993,glow:0x5f3c96,glowIntensity:.6,ink:'#6a4b8e',paper:['#f8f1de','#efe3f6','#e1f2ec'],border:['#d4a75a','#fff3c6','#9fe3d6','#d8a6f4','#f5d48a'],
        core:'rgba(255,246,214,.95)',mid:'rgba(208,166,255,.40)',rays:['rgba(255,226,150,','rgba(150,236,220,','rgba(222,176,255,'],rings:[0xffe0a0,0xc79dff],sparks:[0xffeaa8,0xa8f0e2,0xe6bdff],count:24,halo:.9}
    };
    const geometries=new Set(),materials=new Set(),textures=new Set();
    const tones={jade:0x789f87,dark:0x476956,paper:0xe9dfbc,gold:0xbda066,wood:0x8d8665};
    function mat(color,extra={}){const m=new T.MeshStandardMaterial({color,roughness:.8,flatShading:false,...extra});materials.add(m);return m;}
    function mesh(geometry,material,group,x=0,y=0,z=0){geometries.add(geometry);const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(material.map)m.userData.softwareTexture=true;group.add(m);return m;}
    function box(w,h,d,color,group,x=0,y=0,z=0){return mesh(new T.BoxGeometry(w,h,d),mat(color),group,x,y,z);}
    function cyl(rt,rb,h,color,group,x=0,y=0,z=0,n=10){return mesh(new T.CylinderGeometry(rt,rb,h,n),mat(color),group,x,y,z);}
    function clear(){generation++;while(root.children.length)root.remove(root.children[0]);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometries.clear();materials.clear();textures.clear();pickTargets.length=0;effects.length=0;frames.clear();hovered=null;}
    function canvasTexture(width,height,draw){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return null;draw(ctx,canvas);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;textures.add(texture);return{texture,ctx,canvas};}
    function fitText(ctx,text,x,y,max,size,min=20){ctx.font='500 '+size+'px "Songti SC", "Noto Serif CJK SC", serif';while(ctx.measureText(text).width>max&&size>min){size--;ctx.font='500 '+size+'px "Songti SC", "Noto Serif CJK SC", serif';}ctx.fillText(text,x,y,max);}
    function plaque(text,group,x,y,z,w=1.0,h=.23){const result=canvasTexture(768,160,ctx=>{ctx.fillStyle='#e8dfbd';ctx.fillRect(0,0,768,160);ctx.strokeStyle='#b79c66';ctx.lineWidth=7;ctx.strokeRect(9,9,750,142);ctx.fillStyle='#536c4f';ctx.textAlign='center';ctx.textBaseline='middle';fitText(ctx,text,384,80,690,62,28);});if(!result)return;const label=mesh(new T.PlaneGeometry(w,h),mat(0xffffff,{map:result.texture,side:T.DoubleSide}),group,x,y,z);label.rotation.y=Math.PI*.18-root.rotation.y;}
    function cardPanel(id,stage,x){
      const c=global.SpiritCards?.getCard(id);if(!c)return;const grade=GRADES[c.rarity]||null;
      const frame=new T.Group();frame.name='study-card-'+id;frame.position.set(x,.62,0);frame.rotation.y=Math.PI*.18-root.rotation.y;root.add(frame);frames.set(id,frame);
      const backing=box(1.08,1.48,.10,tones.wood,frame,0,.74,0);
      // The printed card is the front of this shallow case. A second solid
      // wooden face only .008 behind it can interleave its two triangles in
      // Canvas's depth sort, covering half the art. Keep the actual back and
      // sides, and let the card close the front instead of forcing an overlay.
      const front=backing.geometry.groups.find(group=>group.materialIndex===4);
      backing.geometry.setIndex(Array.from(backing.geometry.index.array).filter((_,i)=>i<front.start||i>=front.start+front.count));
      backing.geometry.clearGroups();
      const trim=grade?mat(grade.trim,{emissive:grade.glow,emissiveIntensity:grade.glowIntensity,roughness:.42,metalness:.3}):null;
      if(trim)effects.push({kind:'trim',object:trim,base:grade.glowIntensity,phase:Math.random()*6});
      const bar=(w,h,d,bx,by,bz)=>trim?mesh(new T.BoxGeometry(w,h,d),trim,frame,bx,by,bz):box(w,h,d,tones.gold,frame,bx,by,bz);
      bar(1.16,.09,.15,0,.02,0);bar(1.16,.065,.15,0,1.48,0);
      for(const side of[-1,1])bar(.045,1.45,.15,side*.535,.74,0);
      const draw=(ctx,img)=>{if(grade)paintGradeCard(ctx,grade);else{ctx.fillStyle='#f4edd3';ctx.fillRect(0,0,512,680);ctx.strokeStyle='#b9a56d';ctx.lineWidth=5;ctx.strokeRect(15,15,482,650);}ctx.fillStyle=grade?grade.ink:'#567957';ctx.textAlign='center';ctx.textBaseline='middle';fitText(ctx,c.title,256,61,450,36,19);if(img)ctx.drawImage(img,35,107,442,417);else{ctx.fillStyle='#dce6cc';ctx.fillRect(35,107,442,417);ctx.fillStyle='#9bae8c';fitText(ctx,'藏真',256,312,370,80);}if(grade){ctx.save();ctx.strokeStyle=grade.ink;ctx.globalAlpha=.55;ctx.lineWidth=3;ctx.strokeRect(33.5,105.5,445,420);ctx.restore();}ctx.fillStyle='#587653';fitText(ctx,['未研读','初识','明辨','会用','巩固'][stage]||'初识',256,575,420,30);ctx.fillStyle=grade?grade.ink:'#a48e58';fitText(ctx,grade?'✦ '+grade.name+' · '+c.rarity+' ✦':'万 象 道 藏',256,627,420,grade?25:22);};
      const result=canvasTexture(512,680,ctx=>draw(ctx));if(!result)return;
      mesh(new T.PlaneGeometry(1.08,1.48),mat(0xffffff,{map:result.texture,side:T.FrontSide,roughness:1}),frame,0,.74,.058);
      // The source comes from the same trusted card-art registry used by the
      // album. Standalone exports already replace that registry with data URLs.
      const holder=document.createElement('div');holder.innerHTML=global.spiritCardArt?.(c)||'';const src=holder.querySelector('img')?.getAttribute('src');
      if(src){const img=new Image(),token=generation;img.onload=()=>{if(disposed||token!==generation)return;draw(result.ctx,img);result.texture.needsUpdate=true;onChange?.();};img.src=src;}
      cyl(.07,.10,.62,tones.wood,frame,0,-.29,0);box(.60,.08,.42,tones.jade,frame,0,-.58,0);
      // 点击框：从书案面到卡框顶，比卡框略宽，看不见但射线能点中
      const hitGeometry=new T.BoxGeometry(1.18,2.06,.56),hitMaterial=new T.MeshBasicMaterial({color:0xffffff});geometries.add(hitGeometry);materials.add(hitMaterial);
      const hit=new T.Mesh(hitGeometry,hitMaterial);hit.position.set(0,.67,0);hit.visible=false;hit.userData.studyCardId=id;frame.add(hit);pickTargets.push(hit);
      if(grade&&!software)gradeEffects(frame,grade);
    }
    function paintGradeCard(ctx,grade){
      const paper=ctx.createRadialGradient(256,300,40,256,340,430);grade.paper.forEach((color,i,list)=>paper.addColorStop(i/(list.length-1),color));
      ctx.fillStyle=paper;ctx.fillRect(0,0,512,680);
      const edge=ctx.createLinearGradient(0,0,512,680);grade.border.forEach((color,i,list)=>edge.addColorStop(i/(list.length-1),color));
      ctx.strokeStyle=edge;ctx.lineWidth=14;ctx.strokeRect(9,9,494,662);
      ctx.strokeStyle=grade.ink;ctx.globalAlpha=.7;ctx.lineWidth=2.5;ctx.strokeRect(24,24,464,632);ctx.globalAlpha=1;
      ctx.fillStyle=edge;for(const [cx,cy] of [[24,24],[488,24],[24,656],[488,656]]){ctx.beginPath();ctx.moveTo(cx,cy-13);ctx.lineTo(cx+13,cy);ctx.lineTo(cx,cy+13);ctx.lineTo(cx-13,cy);ctx.closePath();ctx.fill();}
    }
    function glowTexture(size,paint){const result=canvasTexture(size,size,paint);return result?.texture||null;}
    // 贴着卡框一圈的柔光：贴图比卡框四周各大出 GLOW_PAD，中间画一个和卡框一样大的发光边框（多描几遍、由宽到窄），没有放射光线
    const GLOW_PAD=.34,CARD_W=1.16,CARD_H=1.54;
    function haloTexture(grade){
      const W=256,H=Math.round(256*(CARD_H+GLOW_PAD*2)/(CARD_W+GLOW_PAD*2));
      const result=canvasTexture(W,H,ctx=>{
        const px=W*GLOW_PAD/(CARD_W+GLOW_PAD*2),py=H*GLOW_PAD/(CARD_H+GLOW_PAD*2);
        const tones=grade.rays.map(tone=>tone+'1)');
        const stroke=ctx.createLinearGradient(0,0,W,H);tones.concat(tones[0]).forEach((color,i,list)=>stroke.addColorStop(i/(list.length-1),color));
        ctx.lineJoin='round';ctx.strokeStyle=stroke;ctx.shadowColor=grade.mid;
        for(const [width,blur,alpha] of [[26,34,.22],[14,22,.38],[6,12,.7]]){ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.shadowBlur=blur;ctx.strokeRect(px,py,W-px*2,H-py*2);}
        ctx.globalAlpha=1;
      });
      return result?.texture||null;
    }
    function dotTexture(){
      return glowTexture(64,ctx=>{
        const glow=ctx.createRadialGradient(32,32,0,32,32,32);glow.addColorStop(0,'rgba(255,255,255,1)');glow.addColorStop(.3,'rgba(255,255,255,.7)');glow.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);
      });
    }
    function sparkTexture(){
      return glowTexture(64,ctx=>{
        const glow=ctx.createRadialGradient(32,32,0,32,32,32);glow.addColorStop(0,'rgba(255,255,255,1)');glow.addColorStop(.25,'rgba(255,255,255,.55)');glow.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);ctx.fillStyle='rgba(255,255,255,.9)';
        ctx.beginPath();ctx.moveTo(32,2);ctx.lineTo(35,29);ctx.lineTo(62,32);ctx.lineTo(35,35);ctx.lineTo(32,62);ctx.lineTo(29,35);ctx.lineTo(2,32);ctx.lineTo(29,29);ctx.closePath();ctx.fill();
      });
    }
    // 普通混合：白天的天空和书案都偏亮，叠加混合会发白看不出颜色；金色、紫色的光要看得出来
    function glowMaterial(options){const m=new T.MeshBasicMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false,...options});materials.add(m);return m;}
    function gradeEffects(frame,grade){
      const halo=haloTexture(grade);
      if(halo){
        const geometry=new T.PlaneGeometry(CARD_W+GLOW_PAD*2,CARD_H+GLOW_PAD*2);geometries.add(geometry);
        const plane=new T.Mesh(geometry,glowMaterial({map:halo,opacity:grade.halo}));plane.position.set(0,.74,-.09);plane.renderOrder=-1;plane.castShadow=plane.receiveShadow=false;frame.add(plane);
        effects.push({kind:'halo',object:plane,base:grade.halo,phase:Math.random()*6});
      }
      grade.rings.forEach((color,i)=>{
        const geometry=new T.RingGeometry(.19+i*.035,.29+i*.035,48);geometries.add(geometry);
        const ring=new T.Mesh(geometry,glowMaterial({color,opacity:.85}));ring.rotation.x=-Math.PI/2;ring.position.set(0,-.352+i*.004,0);ring.castShadow=ring.receiveShadow=false;frame.add(ring);
        effects.push({kind:'ring',object:ring,base:.85,phase:i*1.7,spin:i%2?-.7:.55});
      });
      if(reducedMotion)return;
      const spark=sparkTexture(),dot=dotTexture();if(!spark||!dot)return;
      for(let i=0;i<grade.count;i++){
        const material=new T.SpriteMaterial({map:i%3===1?spark:dot,color:grade.sparks[i%grade.sparks.length],transparent:true,depthWrite:false,opacity:0,toneMapped:false});materials.add(material);
        const sprite=new T.Sprite(material);sprite.scale.setScalar(.1);frame.add(sprite);
        effects.push({kind:'edge',object:sprite,star:i%3===1,start:null});
      }
    }
    // 卡框边上随机一处（按周长均匀取点）和这一处的外法线，再偏一个随机角度；远近、大小、快慢随机
    function edgeSpawn(e,t,first){
      const hw=CARD_W/2,y0=-.03,r=Math.random()*(CARD_W*2+CARD_H*2);let x,y,nx,ny;
      if(r<CARD_W){x=-hw+r;y=y0+CARD_H;nx=0;ny=1;}else if(r<CARD_W+CARD_H){x=hw;y=y0+CARD_H-(r-CARD_W);nx=1;ny=0;}
      else if(r<CARD_W*2+CARD_H){x=hw-(r-CARD_W-CARD_H);y=y0;nx=0;ny=-1;}else{x=-hw;y=y0+(r-CARD_W*2-CARD_H);nx=-1;ny=0;}
      const a=(Math.random()-.5)*1.4,c=Math.cos(a),k=Math.sin(a);
      e.x=x;e.y=y;e.dx=nx*c-ny*k;e.dy=nx*k+ny*c;e.far=.2+Math.random()*.3;e.size=(e.star?.19:.11)*(.6+Math.random()*.8);e.life=1.5+Math.random()*1.6;
      e.z=.085+Math.random()*.05;e.start=first?t-Math.random()*e.life:t;
    }
    function lamp(group,x,y,z,lit=true,scale=1){const g=new T.Group();g.position.set(x,y,z);g.scale.setScalar(scale);group.add(g);cyl(.18,.23,.08,tones.dark,g,0,0,0);cyl(.07,.09,.72,tones.wood,g,0,.38,0);cyl(.22,.27,.08,tones.gold,g,0,.77,0);mesh(new T.CylinderGeometry(.18,.18,.35,8),mat(lit?0xf0d98c:0xa4b29a,{emissive:lit?0xd6b569:0x000000,emissiveIntensity:lit?.34:0}),g,0,.99,0);cyl(.28,.22,.14,tones.jade,g,0,1.24,0);cyl(.04,.10,.15,tones.gold,g,0,1.38,0);}
    function rewardObject(reward){
      const g=new T.Group();g.name='study-reward-'+reward.id;g.position.set(-2.48,.12,0);root.add(g);
      cyl(.45,.51,.14,tones.jade,g);cyl(.37,.42,.16,tones.paper,g,0,.14,0);const name=reward.name||'参悟纪念';
      if(/灯|烛/.test(name))lamp(g,0,.25,0,true,.77);
      else if(/衡|秤/.test(name)){cyl(.04,.07,.87,tones.gold,g,0,.68,0);box(.95,.06,.06,tones.gold,g,0,1.1,0);for(const x of[-.38,.38]){box(.015,.32,.015,tones.wood,g,x,.92,0);cyl(.21,.12,.11,tones.jade,g,x,.7,0,12);}cyl(.13,.18,.08,tones.gold,g,0,.27,0);}
      else if(/璧|环|轮|镜/.test(name)){cyl(.07,.11,.48,tones.gold,g,0,.49,0);mesh(new T.TorusGeometry(.30,.055,8,24),mat(tones.jade),g,0,.95,0);mesh(new T.OctahedronGeometry(.11,0),mat(tones.gold),g,0,.95,0);}
      else if(/漏|钟/.test(name)){for(const y of[.35,1.06])cyl(.28,.28,.08,tones.gold,g,0,y,0);for(const x of[-.23,.23])box(.035,.65,.035,tones.jade,g,x,.7,0);mesh(new T.ConeGeometry(.19,.34,12),mat(tones.paper),g,0,.87,0).rotation.z=Math.PI;mesh(new T.ConeGeometry(.19,.34,12),mat(tones.gold),g,0,.52,0);}
      else if(/匣|柜|箱/.test(name)){box(.65,.42,.43,tones.jade,g,0,.49,0);box(.7,.09,.47,tones.gold,g,0,.73,0);box(.07,.12,.04,tones.paper,g,0,.61,.24);}
      else if(/门|桥/.test(name)){for(const x of[-.30,.30])box(.08,.72,.12,tones.jade,g,x,.64,0);box(.76,.10,.22,tones.paper,g,0,1.03,0);box(.88,.06,.27,tones.gold,g,0,1.10,0);}
      else if(/木|林|叶|花|穗|枝/.test(name)){cyl(.24,.16,.30,tones.paper,g,0,.4,0);cyl(.04,.06,.50,tones.wood,g,0,.78,0);for(const [x,y]of[[-.16,.83],[.16,1.02],[0,1.15]]){const leaf=mesh(new T.SphereGeometry(.21,8,5),mat(tones.jade),g,x,y,0);leaf.scale.set(1,.55,.55);}}
      else {box(.57,.65,.09,tones.jade,g,0,.69,0);for(const x of[-.31,.31])cyl(.055,.055,.80,tones.gold,g,x,.69,0);box(.41,.51,.02,tones.paper,g,0,.69,.06);for(const y of[.55,.66,.77,.88])box(.28,.014,.01,tones.wood,g,0,y,.076);}
      plaque(name,g,0,.08,.54,1.0,.22);
    }
    function set(value){
      if(disposed)return false;
      const ids=value?.available?Array.from(new Set(value.displayCards||[])).filter(id=>global.SpiritCards?.getCard(id)?.courseId===value.courseId).slice(0,3):[];
      const selected=value?.rewards?.selectedId,reward=value?.rewards?.unlockedIds?.includes(selected)?value.rewards.items?.find(r=>r.id===selected):null;
      const sect=value?.sect?.available?Math.max(0,Math.min(3,Number(value.sect.stage)||0)):0;
      const next=JSON.stringify([value?.available,value?.courseId,ids.map(id=>[id,value.cards?.[id]?.stage||0]),reward?.id,sect]);if(next===signature)return false;signature=next;clear();
      root.visible=!!value?.available&&(ids.length>0||!!reward||sect>0);if(!root.visible)return true;
      root.userData.cardIds=ids;root.userData.rewardId=reward?.id||null;root.userData.sectStage=sect;
      if(ids.length){box(3.6,.11,.57,tones.jade,root,0,.15,0);box(3.35,.06,.52,tones.paper,root,0,.23,0);ids.forEach((id,i)=>cardPanel(id,value.cards?.[id]?.stage||0,(i-(ids.length-1)/2)*1.21));plaque('藏 真 书 案',root,0,.25,.33,1.28,.23);}
      if(reward)rewardObject(reward);
      if(sect){const lamps=new T.Group();lamps.position.set(2.48,.1,0);root.add(lamps);for(let i=0;i<3;i++)lamp(lamps,(i-1)*.23,.12,0,i<sect,.5);plaque('同 门 研 习',lamps,0,.07,.35,.92,.20);}
      return true;
    }
    function update(t){
      if(disposed||!root.visible||!effects.length)return false;
      for(const e of effects){
        if(e.kind==='trim'){e.object.emissiveIntensity=e.base*(.7+.6*(.5+.5*Math.sin(t*1.8+e.phase)));continue;}
        if(e.kind==='halo'){e.object.material.opacity=e.base*(.72+.28*Math.sin(t*1.3+e.phase));}
        else if(e.kind==='ring'){e.object.rotation.z=t*e.spin;e.object.material.opacity=e.base*(.7+.3*Math.sin(t*2.1+e.phase));}
        else{
          // 沿卡框边随机向外的灵光：先快后慢地飘出去，开头很快亮起、随后渐隐、越飘越小；飘完一轮换一处
          if(e.start===null)edgeSpawn(e,t,true);
          let age=t-e.start;
          if(age>=e.life||age<0){const over=age>0?age-e.life:0;edgeSpawn(e,t,false);e.start=t-over%e.life;age=t-e.start;}   // 隔了很久才画下一帧（页面切到后台再回来）也各飘各的，不会一起从头开始
          const u=age/e.life;
          const out=1-(1-u)*(1-u),d=e.far*out,fade=u<.14?u/.14:1-(u-.14)/.86;
          e.object.position.set(e.x+e.dx*d,e.y+e.dy*d,e.z+out*.05);e.object.material.opacity=Math.max(0,fade)*.95;e.object.scale.setScalar(e.size*(1.05-.55*u));
        }
      }
      return true;
    }
    function setHover(id){
      const next=id&&frames.has(id)?id:null;if(next===hovered)return false;
      if(hovered)frames.get(hovered)?.scale.setScalar(1);hovered=next;if(next)frames.get(next).scale.setScalar(1.06);
      return true;
    }
    function getPickTargets(){if(disposed||!root.visible||!pickTargets.length)return [];root.updateMatrixWorld(true);return pickTargets;}
    return{set,update,setHover,getPickTargets,getRoot:()=>root,dispose(){if(disposed)return;disposed=true;clear();parent.remove(root);}};
  };
})(typeof window==='undefined'?globalThis:window);
