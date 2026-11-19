/* Personal study corner. Its footprint stays on the outer garden verge,
 * outside the existing movable decoration area and all crop beds. */
(function(global){
  'use strict';
  global.createSpiritStudyScene=function({THREE:T,parent,onChange,reducedMotion=false,software=false}){
    if(!T||!parent)return null;
    const root=new T.Group();root.name='spirit-study-corner';root.position.set(-6.45,.24,-10.1);root.rotation.y=Math.PI*.18;root.visible=false;parent.add(root);
    let signature='',generation=0,disposed=false,hovered=null;
    // 智慧课堂 2026-11-19：卡框可点（看不见的点击框，手机上也好点中）；地品 SSR、天品 UR 的卡框加光晕、底座光环和升腾的灵光
    const pickTargets=[],effects=[],frames=new Map();
    const GRADES={
      SSR:{name:'地品',trim:0xe2b65a,glow:0x8a5a14,glowIntensity:.7,ink:'#8a6420',paper:['#fbf3d6','#efdcaa'],border:['#a57a2c','#f3d27e','#fff6d2','#c99a3e','#f0cd78'],
        core:'rgba(255,236,176,.95)',mid:'rgba(255,198,96,.42)',rays:['rgba(255,226,150,'],rings:[0xffcf6e],sparks:[0xffe7a3,0xffcd66],count:7,halo:.8},
      UR:{name:'天品',trim:0xf3d993,glow:0x5f3c96,glowIntensity:.6,ink:'#6a4b8e',paper:['#f8f1de','#efe3f6','#e1f2ec'],border:['#d4a75a','#fff3c6','#9fe3d6','#d8a6f4','#f5d48a'],
        core:'rgba(255,246,214,.95)',mid:'rgba(208,166,255,.40)',rays:['rgba(255,226,150,','rgba(150,236,220,','rgba(222,176,255,'],rings:[0xffe0a0,0xc79dff],sparks:[0xffeaa8,0xa8f0e2,0xe6bdff],count:11,halo:.9}
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
    function haloTexture(grade){
      return glowTexture(256,ctx=>{
        const core=ctx.createRadialGradient(128,128,0,128,128,128);core.addColorStop(0,grade.core);core.addColorStop(.38,grade.mid);core.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=core;ctx.fillRect(0,0,256,256);ctx.globalCompositeOperation='lighter';
        const rays=grade.rays.length>1?18:12;
        for(let i=0;i<rays;i++){
          ctx.save();ctx.translate(128,128);ctx.rotate(i/rays*Math.PI*2);
          const ray=ctx.createLinearGradient(0,0,0,-128),tone=grade.rays[i%grade.rays.length];ray.addColorStop(0,tone+'.55)');ray.addColorStop(1,tone+'0)');
          ctx.fillStyle=ray;ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(0,-126);ctx.lineTo(7,0);ctx.closePath();ctx.fill();ctx.restore();
        }
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
        const geometry=new T.PlaneGeometry(2.45,2.9);geometries.add(geometry);
        const plane=new T.Mesh(geometry,glowMaterial({map:halo,opacity:grade.halo}));plane.position.set(0,.76,-.13);plane.renderOrder=-1;plane.castShadow=plane.receiveShadow=false;frame.add(plane);
        effects.push({kind:'halo',object:plane,base:grade.halo,phase:Math.random()*6,spin:grade.rays.length>1?.11:.07});
      }
      grade.rings.forEach((color,i)=>{
        const geometry=new T.RingGeometry(.19+i*.035,.29+i*.035,48);geometries.add(geometry);
        const ring=new T.Mesh(geometry,glowMaterial({color,opacity:.85}));ring.rotation.x=-Math.PI/2;ring.position.set(0,-.352+i*.004,0);ring.castShadow=ring.receiveShadow=false;frame.add(ring);
        effects.push({kind:'ring',object:ring,base:.85,phase:i*1.7,spin:i%2?-.7:.55});
      });
      if(reducedMotion)return;
      const spark=sparkTexture();if(!spark)return;
      for(let i=0;i<grade.count;i++){
        const material=new T.SpriteMaterial({map:spark,color:grade.sparks[i%grade.sparks.length],transparent:true,depthWrite:false,opacity:0,toneMapped:false});materials.add(material);
        const sprite=new T.Sprite(material),side=i%2?1:-1;sprite.scale.setScalar(.12);frame.add(sprite);
        effects.push({kind:'spark',object:sprite,x:side*(.36+Math.random()*.3),z:.06+Math.random()*.22,phase:i/grade.count+Math.random()*.08,speed:.16+Math.random()*.1,size:.13+Math.random()*.1});
      }
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
        if(e.kind==='halo'){e.object.material.opacity=e.base*(.78+.22*Math.sin(t*1.3+e.phase));e.object.rotation.z=t*e.spin;}
        else if(e.kind==='ring'){e.object.rotation.z=t*e.spin;e.object.material.opacity=e.base*(.7+.3*Math.sin(t*2.1+e.phase));}
        else{const u=(t*e.speed+e.phase)%1,rise=Math.sin(u*Math.PI);e.object.position.set(e.x+Math.sin(t*.9+e.phase*6.3)*.07,-.25+u*2.05,e.z);e.object.material.opacity=rise*.95;e.object.scale.setScalar(e.size*(.55+.45*rise));}
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
