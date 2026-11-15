/* Personal study corner. Its footprint stays on the outer garden verge,
 * outside the existing movable decoration area and all crop beds. */
(function(global){
  'use strict';
  global.createSpiritStudyScene=function({THREE:T,parent,onChange}){
    if(!T||!parent)return null;
    const root=new T.Group();root.name='spirit-study-corner';root.position.set(-6.45,.24,-10.1);root.rotation.y=Math.PI*.18;root.visible=false;parent.add(root);
    let signature='',generation=0,disposed=false;
    const geometries=new Set(),materials=new Set(),textures=new Set();
    const tones={jade:0x789f87,dark:0x476956,paper:0xe9dfbc,gold:0xbda066,wood:0x8d8665};
    function mat(color,extra={}){const m=new T.MeshStandardMaterial({color,roughness:.8,flatShading:false,...extra});materials.add(m);return m;}
    function mesh(geometry,material,group,x=0,y=0,z=0){geometries.add(geometry);const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(material.map)m.userData.softwareTexture=true;group.add(m);return m;}
    function box(w,h,d,color,group,x=0,y=0,z=0){return mesh(new T.BoxGeometry(w,h,d),mat(color),group,x,y,z);}
    function cyl(rt,rb,h,color,group,x=0,y=0,z=0,n=10){return mesh(new T.CylinderGeometry(rt,rb,h,n),mat(color),group,x,y,z);}
    function clear(){generation++;while(root.children.length)root.remove(root.children[0]);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometries.clear();materials.clear();textures.clear();}
    function canvasTexture(width,height,draw){const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return null;draw(ctx,canvas);const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;textures.add(texture);return{texture,ctx,canvas};}
    function fitText(ctx,text,x,y,max,size,min=20){ctx.font='500 '+size+'px "Songti SC", "Noto Serif CJK SC", serif';while(ctx.measureText(text).width>max&&size>min){size--;ctx.font='500 '+size+'px "Songti SC", "Noto Serif CJK SC", serif';}ctx.fillText(text,x,y,max);}
    function plaque(text,group,x,y,z,w=1.0,h=.23){const result=canvasTexture(768,160,ctx=>{ctx.fillStyle='#e8dfbd';ctx.fillRect(0,0,768,160);ctx.strokeStyle='#b79c66';ctx.lineWidth=7;ctx.strokeRect(9,9,750,142);ctx.fillStyle='#536c4f';ctx.textAlign='center';ctx.textBaseline='middle';fitText(ctx,text,384,80,690,62,28);});if(!result)return;const label=mesh(new T.PlaneGeometry(w,h),mat(0xffffff,{map:result.texture,side:T.DoubleSide}),group,x,y,z);label.rotation.y=Math.PI*.18-root.rotation.y;}
    function cardPanel(id,stage,x){
      const c=global.SpiritCards?.getCard(id);if(!c)return;
      const frame=new T.Group();frame.position.set(x,.62,0);frame.rotation.y=Math.PI*.18-root.rotation.y;root.add(frame);
      const backing=box(1.08,1.48,.10,tones.wood,frame,0,.74,0);
      // The printed card is the front of this shallow case. A second solid
      // wooden face only .008 behind it can interleave its two triangles in
      // Canvas's depth sort, covering half the art. Keep the actual back and
      // sides, and let the card close the front instead of forcing an overlay.
      const front=backing.geometry.groups.find(group=>group.materialIndex===4);
      backing.geometry.setIndex(Array.from(backing.geometry.index.array).filter((_,i)=>i<front.start||i>=front.start+front.count));
      backing.geometry.clearGroups();
      box(1.16,.09,.15,tones.gold,frame,0,.02,0);box(1.16,.065,.15,tones.gold,frame,0,1.48,0);
      for(const side of[-1,1])box(.045,1.45,.15,tones.gold,frame,side*.535,.74,0);
      const draw=(ctx,img)=>{ctx.fillStyle='#f4edd3';ctx.fillRect(0,0,512,680);ctx.strokeStyle='#b9a56d';ctx.lineWidth=5;ctx.strokeRect(15,15,482,650);ctx.fillStyle='#567957';ctx.textAlign='center';ctx.textBaseline='middle';fitText(ctx,c.title,256,61,450,36,19);if(img)ctx.drawImage(img,35,107,442,417);else{ctx.fillStyle='#dce6cc';ctx.fillRect(35,107,442,417);ctx.fillStyle='#9bae8c';fitText(ctx,'藏真',256,312,370,80);}ctx.fillStyle='#587653';fitText(ctx,['未研读','初识','明辨','会用','巩固'][stage]||'初识',256,575,420,30);ctx.fillStyle='#a48e58';fitText(ctx,'万 象 道 藏',256,627,420,22);};
      const result=canvasTexture(512,680,ctx=>draw(ctx));if(!result)return;
      mesh(new T.PlaneGeometry(1.08,1.48),mat(0xffffff,{map:result.texture,side:T.FrontSide,roughness:1}),frame,0,.74,.058);
      // The source comes from the same trusted card-art registry used by the
      // album. Standalone exports already replace that registry with data URLs.
      const holder=document.createElement('div');holder.innerHTML=global.spiritCardArt?.(c)||'';const src=holder.querySelector('img')?.getAttribute('src');
      if(src){const img=new Image(),token=generation;img.onload=()=>{if(disposed||token!==generation)return;draw(result.ctx,img);result.texture.needsUpdate=true;onChange?.();};img.src=src;}
      cyl(.07,.10,.62,tones.wood,frame,0,-.29,0);box(.60,.08,.42,tones.jade,frame,0,-.58,0);
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
    return{set,getRoot:()=>root,dispose(){if(disposed)return;disposed=true;clear();parent.remove(root);}};
  };
})(typeof window==='undefined'?globalThis:window);
