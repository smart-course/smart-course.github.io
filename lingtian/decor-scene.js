/* Earned courtyard ornaments and a cached, shared-rule placement preview. */
(function (global) {
  'use strict';
  global.createSpiritDecorations = function ({THREE:T,parent,material,mergeDetails}) {
    const layer = new T.Group(); layer.name='spirit-courtyard-decorations'; parent.add(layer);
    const cache = new Map();
    const footprints = new Map(), heights = new Map();
    const editLayer = new T.Group(); editLayer.name='spirit-decoration-guides'; editLayer.visible=false; parent.add(editLayer);
    const guideMaterial=new T.MeshBasicMaterial({color:0x5a8f53,transparent:true,opacity:.56,side:T.DoubleSide,depthWrite:false});
    const borderMaterial=new T.MeshBasicMaterial({color:0xc1d2b1,transparent:true,opacity:.60,side:T.DoubleSide,depthWrite:false});
    const previewMaterials=[];
    let currentIds=[],currentLayout=[],currentThemes={},editState=null,guideMesh=null,guideSignature='',outerRing=null;
    let environment={seasonId:'spring',phaseId:'day',daylight:1};
    const sectStages={sectGate:'gate',sectSpring:'spring',sectLibrary:'library'};
    const sectIds=['fengxia','xuanyue','lingxi','xinglan'];
    const bannerColors = {springBanner:0xa0ba86,summerBanner:0x6da79b,autumnBanner:0xd0a05e,winterBanner:0xa5b9cf};
    let signature = '';
    const rules=()=>global.SpiritGame?.DECOR_LAYOUT_RULES||{};
    const groundY=()=>rules().groundY??.24;
    function defaults(ids){
      if(global.SpiritGame?.getDefaultDecorLayout)return global.SpiritGame.getDefaultDecorLayout(ids);
      const places=[[3.5,-8.25,0],[-3.5,8.25,0],[8.25,-1.75,315],[-8.25,0,90],[2,8.5,90],[8.5,-3,0]];
      return ids.map((id,i)=>{const spot=global.SpiritHomestead?.getScenery(id)?.preferredSpot||{},place=places[i%places.length];return{id,x:spot.x??place[0],z:spot.z??place[1],rotation:spot.rotation??place[2]};});
    }
    function mesh(geometry,color,g,x=0,y=0,z=0,extra) {
      const m = new T.Mesh(geometry,material(color,extra));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
    }
    const box = (g,w,h,d,color,x,y,z) => mesh(new T.BoxGeometry(w,h,d),color,g,x,y,z);
    const cyl = (g,rt,rb,h,color,x,y,z,n=8) => mesh(new T.CylinderGeometry(rt,rb,h,n),color,g,x,y,z);
    function ring(g,r,t,color,x,y,z,horizontal=false) {
      const m=mesh(new T.TorusGeometry(r,t,5,20),color,g,x,y,z);if(horizontal)m.rotation.x=-Math.PI/2;return m;
    }
    function curve(g,points,width,color) {
      return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),8,width,4,false),color,g);
    }
    function base(g,w=2.2,d=1.5) {
      box(g,w,.12,d,0xb3bca5,0,.07,0);box(g,w-.15,.09,d-.15,0xe3dfc5,0,.17,0);
    }
    function roof(g,y,w,d,color=0x648f7d) {
      const half=w/2,deep=d/2;
      // Curved eaves retain a visible silhouette from the elevated farm view.
      for(let side=-1;side<=1;side+=2) {
        const shape=new T.Shape();shape.moveTo(-half,y+.28);shape.quadraticCurveTo(-half*.7,y+.09,0,y+.50);shape.quadraticCurveTo(half*.7,y+.09,half,y+.28);shape.lineTo(half,y+.15);shape.quadraticCurveTo(half*.7,y-.04,0,y+.37);shape.quadraticCurveTo(-half*.7,y-.04,-half,y+.15);shape.closePath();
        const face=mesh(new T.ExtrudeGeometry(shape,{depth:deep,bevelEnabled:false,curveSegments:5}),color,g,0,0,side===1?0:-deep);face.rotation.y=side===1?0:0;
      }
      for(let i=0;i<7;i++){
        const x=(i-3)*w/8;
        curve(g,[[x,y+.41,-deep],[x,y+.47,0],[x,y+.41,deep]],.018,0xa8c5a9);
      }
      curve(g,[[-half-.1,y+.33,0],[-half*.6,y+.36,0],[0,y+.52,0],[half*.6,y+.36,0],[half+.1,y+.33,0]],.045,0xe5d7ab);
      cyl(g,.04,.09,.15,0xcfad69,0,y+.63,0,6);
    }
    function lantern(g,x=0,z=0,scale=1) {
      const l=new T.Group();l.position.set(x,0,z);l.scale.setScalar(scale);g.add(l);
      cyl(l,.40,.46,.11,0xc3c8b3,0,.08,0);cyl(l,.26,.33,.12,0xe8e2c8,0,.20,0);
      cyl(l,.09,.13,.64,0xaebda4,0,.57,0);cyl(l,.30,.24,.09,0xcfd9bd,0,.94,0);
      box(l,.36,.42,.36,0xf3d798,0,1.18,0);
      for(const x of [-.23,.23])for(const z of [-.23,.23])box(l,.055,.5,.055,0x789780,x,1.18,z);
      cyl(l,.08,.42,.28,0x557f6f,0,1.57,0,6);cyl(l,.045,.09,.16,0xd8bc7c,0,1.78,0,6);
      ring(l,.17,.014,0xa58d59,0,1.18,.20);
    }
    function pool(g,large) {
      const r=large?1.0:.85;
      cyl(g,r,r+.13,.16,0xa4b79f,0,.12,0,24);
      ring(g,r,.075,0xd8ddc3,0,.22,0,true);
      const water=mesh(new T.CircleGeometry(r-.07,24),0x74b9aa,g,0,.21,0,{flatShading:false,roughness:.35});water.rotation.x=-Math.PI/2;
      for(const radius of [.28,.59])ring(g,radius,.012,0xc8e8cf,0,.225,0,true);
      for(let i=0;i<3;i++){
        const a=i*2.2,l=mesh(new T.SphereGeometry(.17,6,4),0x82ae80,g,Math.cos(a)*r*.59,.25,Math.sin(a)*r*.59);l.scale.set(1,.13,1.35);
      }
      if(large){cyl(g,.20,.34,.14,0xe1ddc3,0,.34,0);cyl(g,.08,.16,.72,0xa7c8ae,0,.76,0);
        const crystal=mesh(new T.OctahedronGeometry(.22,0),0xa3d5c5,g,0,1.25,0);crystal.scale.set(.75,1.5,.75);
        ring(g,.33,.018,0xe3d5a0,0,.99,0,true);
      }else{
        for(let n=0;n<5;n++){const a=n*Math.PI*2/5,p=mesh(new T.SphereGeometry(.15,6,4),0xe5b3b1,g,.30+Math.cos(a)*.10,.31,-.1+Math.sin(a)*.10);p.scale.set(.8,.45,1.2);p.rotation.y=a;}
        mesh(new T.SphereGeometry(.055,6,4),0xe4ca80,g,.30,.36,-.1);
      }
    }
    // Keep every owned tree copy in its own Object3D, even when its builder
    // resolves to the same species. Moving a copy must never reparent a sibling.
    function modelKey(id,theme){return id+':'+(theme||'generic');}
    function build(id,theme) {
      if(global.SpiritHomestead?.getScenery(id)&&typeof global.createSpiritHomesteadModel==='function'){
        const homestead=global.createSpiritHomesteadModel({THREE:T,material,mergeDetails,id});
        if(homestead){homestead.userData.decorationId=id;return homestead;}
      }
      if(theme&&sectStages[id]&&typeof global.createSpiritSectModel==='function'){
        const themed=global.createSpiritSectModel({THREE:T,material,mergeDetails,sectId:theme,stage:sectStages[id]});
        if(themed){themed.userData.decorationId=id;themed.userData.decorationTheme=theme;return themed;}
      }
      const g=new T.Group();g.userData.decorationId=id;
      if(id==='bambooFence') {
        for(let i=0;i<7;i++){
          const x=(i-3)*.40,h=i%3===0?1.1:.92;
          cyl(g,.055,.07,h,0x889868,x,h/2,0,6);
          for(const y of [.22,.55,.84])cyl(g,.073,.073,.025,0xc6bc8b,x,y,0,6);
        }
        for(const y of [.31,.70]){const rail=cyl(g,.045,.055,2.7,0xa8aa76,0,y,.06,6);rail.rotation.z=Math.PI/2;}
        for(const x of [-1.2,0,1.2]){curve(g,[[x-.05,.65,.10],[x+.07,.74,.13],[x-.04,.79,.07]],.018,0xd6c89b);}
      } else if(id==='stoneLantern') { lantern(g,-.48,0);lantern(g,.56,.18,.76); }
      else if(id==='spiritPond') pool(g,false);
      else if(id==='sectSpring') { base(g,2.25,2.25);pool(g,true); }
      else if(id==='masterStele') {
        base(g,1.50,.98);box(g,1.06,1.42,.28,0x8aab98,0,.98,0);box(g,.82,1.15,.035,0xd9dbc0,0,1.03,.16);
        cyl(g,.54,.63,.10,0xb8c5ac,0,1.77,0,6);ring(g,.18,.025,0x9a8150,0,1.28,.19);
        for(let row=0;row<3;row++)box(g,.40-row*.055,.025,.026,0x9a8150,0,.92-row*.13,.20);
        for(const x of [-.41,.41])box(g,.026,1.15,.028,0xbcaa78,x,1.03,.19);
      } else if(bannerColors[id]) {
        base(g,1.20,.85);cyl(g,.045,.075,2.17,0x9b8457,-.38,1.20,0,8);
        const cross=cyl(g,.035,.035,1.34,0xcbb980,.19,2.13,0,6);cross.rotation.z=Math.PI/2;
        const geometry=new T.PlaneGeometry(1.03,1.24,6,6),pos=geometry.attributes.position;
        for(let i=0;i<pos.count;i++)pos.setZ(i,Math.sin(pos.getX(i)*6+pos.getY(i)*3)*.05);
        geometry.computeVertexNormals();mesh(geometry,bannerColors[id],g,.17,1.48,0,{side:T.DoubleSide,flatShading:false});
        for(const x of [-.34,.68])box(g,.035,1.22,.027,0xe5d7ac,x,1.48,.04);
        ring(g,.19,.025,0xe5dfb7,.17,1.64,.075);box(g,.30,.027,.027,0xe5dfb7,.17,1.21,.075);
        for(const x of [-.24,0,.24,.48,.63])cyl(g,.014,.022,.18,0xd9ca9a,x,.77,.03,5);
        mesh(new T.OctahedronGeometry(.09,0),0xddbf75,g,-.38,2.35,0);
      } else if(id==='sectGate') {
        base(g,2.8,1.25);
        for(const x of [-.95,.95]){cyl(g,.13,.16,1.67,0xc8d6b8,x,1.05,0,8);cyl(g,.23,.29,.12,0x94ac94,x,.30,0,8);box(g,.12,1.35,.025,0x76997d,x,1.08,.16);}
        box(g,2.18,.18,.31,0x8ba88b,0,1.85,0);roof(g,1.91,2.8,1.0);
        box(g,.72,.35,.12,0x476f60,0,1.77,.25);ring(g,.10,.018,0xe4c88a,0,1.77,.32);
      } else if(id==='sectLibrary') {
        base(g,2.65,1.85);box(g,1.88,1.35,1.16,0xc7d0af,0,1.0,0);
        for(const x of [-.85,0,.85])box(g,.08,1.42,.11,0x668e75,x,1.0,.62);
        for(const z of [-.62,.62])box(g,1.96,.09,.08,0x668e75,0,.42,z);
        for(const x of [-.43,.43]){
          box(g,.60,.90,.08,0x5f7e68,x,1.06,.63);
          for(let i=0;i<4;i++)box(g,.07,.67,.04,[0xadc2aa,0xd6c58f,0xa2b9b3,0xcbb58c][i],x+(i-1.5)*.11,1.06,.69);
        }
        roof(g,1.72,2.55,1.67);box(g,1.03,.38,.73,0xd8ddc2,0,2.30,0);roof(g,2.46,1.55,1.04);
        g.scale.setScalar(.82);
      } else return null;
      // Same merge path as the pavilion keeps geometry inexpensive on phones.
      if(mergeDetails){for(const child of g.children)if(child.isGroup)mergeDetails(child);mergeDetails(g);}
      return g;
    }
    function footprint(id){
      if(footprints.has(id))return footprints.get(id);
      const size=rules().footprints?.[id]||{width:2.5,depth:1.6};
      const group=new T.Group();
      const lineMaterial=new T.MeshBasicMaterial({color:0x789f68,transparent:true,opacity:.95,depthWrite:false});
      const fillMaterial=new T.MeshBasicMaterial({color:0x789f68,transparent:true,opacity:.14,side:T.DoubleSide,depthWrite:false});
      previewMaterials.push(lineMaterial,fillMaterial);
      const floor=new T.Mesh(new T.PlaneGeometry(size.width,size.depth),fillMaterial);floor.rotation.x=-Math.PI/2;group.add(floor);
      for(const side of [-1,1]){
        const horizontal=new T.Mesh(new T.BoxGeometry(size.width,.025,.035),lineMaterial);horizontal.position.z=side*size.depth/2;group.add(horizontal);
        const vertical=new T.Mesh(new T.BoxGeometry(.035,.025,size.depth),lineMaterial);vertical.position.x=side*size.width/2;group.add(vertical);
      }
      for(const x of [-1,1])for(const z of [-1,1]){
        const corner=new T.Mesh(new T.CylinderGeometry(.045,.045,.13,5),lineMaterial);corner.position.set(x*size.width/2,.05,z*size.depth/2);group.add(corner);
      }
      group.traverse(item=>{item.userData.softwareLayer=-.3;});
      const record={group,lineMaterial,fillMaterial};footprints.set(id,record);editLayer.add(group);return record;
    }
    function updateAreas(){
      const active=currentLayout.find(entry=>entry.id===editState?.selectedId);
      const validator=global.SpiritGame?.validateDecorLayout;
      if(!active||typeof validator!=='function'||editState?.showAreas===false){if(guideMesh)guideMesh.visible=false;return;}
      const key=JSON.stringify([active.id,active.rotation,currentLayout.filter(entry=>entry.id!==active.id)]);
      if(key===guideSignature&&guideMesh){guideMesh.visible=true;return;}
      guideSignature=key;
      const r=rules().radius||10.75,vertices=[];
      // Half-unit guide marks are one merged draw call; moving the selected
      // object reuses them because its neighbours and orientation are unchanged.
      for(let x=-Math.floor(r*2)/2;x<=r;x+=.5)for(let z=-Math.floor(r*2)/2;z<=r;z+=.5){
        const proposal=currentLayout.map(entry=>entry.id===active.id?{...entry,x,z}:entry);
        if(!validator(proposal,currentIds).ok)continue;
        const d=.065,y=groundY()+.016;
        vertices.push(x-d,y,z-d,x+d,y,z-d,x+d,y,z+d,x-d,y,z-d,x+d,y,z+d,x-d,y,z+d);
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
      if(guideMesh){guideMesh.geometry.dispose();guideMesh.geometry=geometry;guideMesh.visible=true;}
      else {guideMesh=new T.Mesh(geometry,guideMaterial);guideMesh.userData.softwareLayer=-.4;editLayer.add(guideMesh);}
    }
    function refreshEditor(){
      editLayer.visible=!!editState;
      if(!editState)return;
      if(!outerRing){
        const r=rules().radius||10.75;
        outerRing=new T.Mesh(new T.RingGeometry(r-.025,r+.025,72),borderMaterial);outerRing.rotation.x=-Math.PI/2;outerRing.position.y=groundY()+.012;outerRing.userData.softwareLayer=-.4;editLayer.add(outerRing);
      }
      for(const [id,record] of footprints)record.group.visible=currentIds.includes(id);
      for(const entry of currentLayout){
        const record=footprint(entry.id),selected=entry.id===editState.selectedId;
        const color=selected?(editState.valid===false?0xbd725f:0x5d9864):0xa7b995;
        record.group.visible=true;record.group.position.set(entry.x,groundY()+.035,entry.z);record.group.rotation.y=entry.rotation*Math.PI/180;
        record.lineMaterial.color.setHex(color);record.fillMaterial.color.setHex(color);
        record.lineMaterial.opacity=selected?.96:.46;record.fillMaterial.opacity=selected?.17:.06;
      }
      updateAreas();
    }
    return {
      set(ids,layout,themes) {
        const allowed=['bambooFence','stoneLantern','spiritPond','masterStele','sectGate','sectSpring','sectLibrary',...Object.keys(bannerColors),...(global.SpiritHomestead?.scenery||[]).map(item=>item.id)];
        const clean=[...new Set(Array.isArray(ids)?ids:[])].filter(id=>allowed.includes(id)).slice(0,global.SpiritGame?.JOURNEY_LIMITS?.equippedDecorations||6);
        const fallback=defaults(clean),provided=Array.isArray(layout)?layout:[];
        const placements=clean.map((id,i)=>{
          const candidate=provided.find(entry=>entry?.id===id);
          return candidate&&['x','z','rotation'].every(key=>Number.isFinite(candidate[key])&&Math.abs(candidate[key])<1000)
            ? {id,x:candidate.x,z:candidate.z,rotation:candidate.rotation}:fallback[i];
        });
        const selectedThemes={};
        for(const id of clean)if(sectStages[id]&&sectIds.includes(themes?.[id]))selectedThemes[id]=themes[id];
        const next=JSON.stringify([placements,selectedThemes]);if(next===signature)return false;signature=next;
        currentIds=clean;currentLayout=placements;currentThemes=selectedThemes;
        const desiredKeys=new Set(clean.map(id=>modelKey(id,selectedThemes[id])));
        for(const object of [...layer.children])if(!desiredKeys.has(object.userData.decorationCacheKey))layer.remove(object);
        placements.forEach(entry=>{
          const key=modelKey(entry.id,selectedThemes[entry.id]);let object=cache.get(key);
          if(!object){
            object=build(entry.id,selectedThemes[entry.id]);if(!object)return;
            object.userData.decorationCacheKey=key;cache.set(key,object);
            object.updateMatrixWorld(true);heights.set(key,new T.Box3().setFromObject(object).max.y);
          }
          object.userData.homesteadRuntime?.setEnvironment(environment);
          object.position.set(entry.x,groundY(),entry.z);object.rotation.y=entry.rotation*Math.PI/180;
          if(object.parent!==layer)layer.add(object);
        });
        layer.updateMatrixWorld(true);refreshEditor();return true;
      },
      setEnvironment(snapshot){environment=snapshot||environment;for(const object of layer.children)object.userData.homesteadRuntime?.setEnvironment(environment);},
      getLampAnchors(){return layer.children.flatMap(object=>object.userData.homesteadRuntime?.getLampAnchors()||[]);},
      setEditor(value){editState=value?{selectedId:value.selectedId,valid:value.valid,showAreas:value.showAreas}:null;refreshEditor();},
      pick(raycaster){
        const hits=raycaster.intersectObjects(layer.children,true);
        for(const hit of hits){let node=hit.object;while(node&&node!==layer){if(node.userData.decorationId)return node.userData.decorationId;node=node.parent;}}
        return null;
      },
      getAnchor(id){
        const key=modelKey(id,currentThemes[id]),object=cache.get(key);if(!object||object.parent!==layer)return null;
        return new T.Vector3(object.position.x,groundY()+(heights.get(key)||1.4)+.32,object.position.z);
      },
      dispose() {
        // Cache cardinality is bounded by the fixed decoration/theme catalog.
        // Detached visitor variants are retained for reuse and released here.
        const geometries=new Set(),ownedMaterials=new Set();
        for(const object of cache.values()){
          object.traverse(item=>{if(item.geometry)geometries.add(item.geometry);});
          for(const mat of object.userData.homesteadRuntime?.ownedMaterials||[])ownedMaterials.add(mat);
        }
        editLayer.traverse(item=>{if(item.geometry)geometries.add(item.geometry);});
        geometries.forEach(geometry=>geometry.dispose());
        ownedMaterials.forEach(mat=>mat.dispose());
        previewMaterials.forEach(item=>item.dispose());guideMaterial.dispose();borderMaterial.dispose();
        cache.clear();footprints.clear();heights.clear();parent.remove(layer);parent.remove(editLayer);
      }
    };
  };
})(window);
