/* Four explorable mountain courtyards. All architecture is actual Three geometry;
 * the shared Canvas renderer projects the same meshes when WebGL is unavailable. */
(function (global) {
  'use strict';
  const THEMES = {
    fengxia: { grass: 0xb0a568, leaf: [0xad422c, 0xd86b32, 0xefa747], wood: 0x86513e, stone: 0xc7af88, pale: 0xedd6ac, water: 0x81b2a1, roof: 0xa97441, rock: [0x926947,0xac8058,0xc89c6b,0x7e6049], grassTips: [0xa39348,0xc1ac62,0x95864c] },
    xuanyue: { grass: 0x82978a, leaf: [0x3e706e, 0x71998a, 0xabc5aa], wood: 0x636b62, stone: 0x8e9e9f, pale: 0xc5d2ca, water: 0x71afb4, roof: 0x526b8f, rock: [0x526b71,0x72918f,0xa7b8a3,0x435e66], grassTips: [0x557e78,0x8caf96,0x456b6b] },
    lingxi: { grass: 0x8ab963, leaf: [0x3d914e, 0x76b65b, 0xb1d77c], wood: 0x778554, stone: 0xb8c5a1, pale: 0xe1e4ba, water: 0x73bb9c, roof: 0x65965c, rock: [0x5f8a68,0x80a57c,0xa7bf8d,0x507b63], grassTips: [0x4e9956,0x94c86c,0x66ad57] },
    xinglan: { grass: 0xa7bab0, leaf: [0x528b8a, 0x8eb7ac, 0xc6d9c9], wood: 0x7c858b, stone: 0xc3cdd0, pale: 0xe2e8e6, water: 0x90c7d3, roof: 0x4d75a2, rock: [0x788e9b,0x9baeb5,0xc8d2d1,0x637b88], grassTips: [0x79a298,0xb5cdbd,0x668e87] }
  };
  // Original Blender pigments identify structural roles without changing a
  // single source vertex, index, roof outline or construction cut.
  const SOURCE_PIGMENTS = {
    fengxia:{stone:0xaeba9c,pale:0xe4dec0,wall:0xd8d1ae,wood:0x874e39,ink:0x684a35,roof:0xa9693e,tile:0xbf8b55,gold:0xdfbf78,water:0x88b6a2,leaf:0x7d9e61,accent:0xc88048},
    xuanyue:{stone:0xa5baad,pale:0xe8e4ce,wall:0xced9c8,wood:0x648582,ink:0x4b696b,roof:0x6e9694,tile:0x92b2a5,gold:0xd7c58f,water:0x8cc6bc,leaf:0x7c9c89,accent:0xb4d3c5},
    lingxi:{stone:0xb4bfa0,pale:0xe4ddbc,wall:0xd4d7b3,wood:0x738257,ink:0x526a49,roof:0x6d925e,tile:0x96ae74,gold:0xd4bc80,water:0x86bca4,leaf:0x6d9962,accent:0xbca46e},
    xinglan:{stone:0xa6baaf,pale:0xe4dec1,wall:0xc4d1bf,wood:0x587e85,ink:0x43616c,roof:0x517b88,tile:0x7b9e9b,gold:0xd1b36d,water:0x9dc5b7,leaf:0x78a08b,accent:0xc2aa72}
  };
  const ARCHITECTURE = {
    fengxia:{stone:0x7e8581,pale:0xd0cec1,wall:0xf2e4ca,wood:0x9d3c2c,ink:0x463a34,roof:0x304b54,tile:0x5a7a83,gold:0xd7ad58,water:0x5faaa1,leaf:0x698d5c,accent:0xc88042},
    xuanyue:{stone:0x7b8c9a,pale:0xc6d1d4,wall:0xe9eee8,wood:0x655064,ink:0x36384d,roof:0x30456e,tile:0x6681a3,gold:0xd9c58a,water:0x78bbc4,leaf:0x739d8b,accent:0xb7dad1},
    lingxi:{stone:0x86918b,pale:0xd0d3c4,wall:0xf0ecd8,wood:0x73503b,ink:0x344b42,roof:0x295d56,tile:0x5b9182,gold:0xcba85e,water:0x62b0a0,leaf:0x528e57,accent:0xb89250},
    xinglan:{stone:0x7e8d9f,pale:0xcdd5dd,wall:0xf1e5cd,wood:0x554463,ink:0x2b3550,roof:0x284f8c,tile:0x6b96c6,gold:0xe0b653,water:0x85bfd2,leaf:0x81a89c,accent:0xb9b7e1}
  };
  // Seasonal vegetation belongs to the school; sunlight comes from the shared
  // Beijing clock. This display state never writes weather or crop-growth data.
  const LIGHTING = {
    fengxia: { sky:0xffe3b5, ground:0x826c45, ambient:1.9, sun:0xffd5a0, key:2.35, fill:0xffedcf, bounce:.55, exposure:1.06, fog:0xd7b793 },
    xuanyue: { sky:0xe4eef1, ground:0x667f7b, ambient:1.85, sun:0xf4f1dd, key:2.15, fill:0xd9e7df, bounce:.62, exposure:1.04, fog:0xc0d0d1 },
    lingxi: { sky:0xe9ffdf, ground:0x668f54, ambient:2.05, sun:0xffffdf, key:2.4, fill:0xd9f2df, bounce:.65, exposure:1.08, fog:0xc3e2c9 },
    xinglan: { sky:0xdbeafa, ground:0x667d91, ambient:1.85, sun:0xfff0d2, key:2.25, fill:0xdce6f3, bounce:.62, exposure:1.05, fog:0xb6cbdf }
  };
  const SKY_COLORS = {
    fengxia:{day:[0xadc7c9,0xf1d9b0,0xffedbe],night:[0x101d30,0x354348,0x8196be]},
    xuanyue:{day:[0xb4cfd9,0xd8e3db,0xf0f4e8],night:[0x071325,0x244958,0x668faf]},
    lingxi:{day:[0xa8d7d2,0xdef0cc,0xffffed],night:[0x102630,0x365b53,0x6eafa3]},
    xinglan:{day:[0x9ecfee,0xf2f5ef,0xfff7dd],night:[0x07152f,0x61798c,0x6672bf]}
  };
  const STAGE_POSITIONS = {
    gate: { x: 0, y: .31, z: 3.8, scale: 1 },
    spring: { x: -8.35, y: 4.50, z: -14.5, scale: .92 },
    library: { x: 1.65, y: 7.10, z: -21.0, scale: 1.08 }
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEFAULT_DAYLIGHT={phaseId:'day',phaseName:'白昼',daylight:1,clockText:'',timeZone:'Asia/Shanghai'};
  const DEFAULT_WEATHER={weatherId:'clear',weatherName:'晴',windStrength:.22,windDirection:.65,cloudAmount:.28,weatherStartsAt:0,weatherEndsAt:0};
  function normalizeDaylight(state){
    const value=Number(state?.daylight),daylight=Math.round(clamp(Number.isFinite(value)?value:1,0,1)*120)/120;
    const phaseId=['dawn','day','dusk','night'].includes(state?.phaseId)?state.phaseId:daylight>.65?'day':daylight>.15?'dawn':'night';
    return {phaseId,phaseName:state?.phaseName||{dawn:'清晨',day:'白昼',dusk:'黄昏',night:'夜晚'}[phaseId],daylight,clockText:String(state?.clockText||''),timeZone:'Asia/Shanghai'};
  }
  function normalizeWeather(state){
    const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
    const windStrength=clamp(finite(state?.windStrength,.22),0,1),direction=finite(state?.windDirection,.65),tau=Math.PI*2;
    return {weatherId:['clear','cloudy','mist','rain','snow'].includes(state?.weatherId)?state.weatherId:'clear',weatherName:String(state?.weatherName||'晴'),windStrength,windDirection:((direction%tau)+tau)%tau,cloudAmount:windStrength>=.7?0:clamp(finite(state?.cloudAmount,.28),0,1),weatherStartsAt:finite(state?.weatherStartsAt,0),weatherEndsAt:finite(state?.weatherEndsAt,0)};
  }
  const copyLayout = list => (Array.isArray(list) ? list : []).map(entry => ({ slotId: entry.slotId, itemId: entry.itemId, rotation: entry.rotation }));

  global.createSpiritSectVisitLandscape = function ({ THREE: T, sectId }) {
    const theme = Object.hasOwn(THEMES, sectId) ? THEMES[sectId] : null;
    const school = global.SpiritSects?.get(sectId), catalog = global.SpiritSectGovernance;
    if (!T || !theme || !school || !catalog) return null;
    const root = new T.Group(), backdrop = new T.Group(), terrain = new T.Group(), landmarks = new T.Group(), furniture = new T.Group(), markers = new T.Group();
    root.name = 'sect-visit-' + sectId; root.add(backdrop, terrain, landmarks, furniture, markers);
    backdrop.name = 'sect-visit-layered-landscape';
    terrain.name = 'sect-visit-terrain'; landmarks.name = 'sect-visit-landmarks'; furniture.name = 'sect-visit-courtyard';
    root.userData.sectId = sectId;
    const lake=sectId==='xuanyue'?{
      id:'xuanyue-front-lake',surfaceY:-1.35,
      outline:[[-18.4,-10.8],[-17.5,-7.3],[-17.8,-2],[-17.1,3],[-15.4,7.6],[-13.5,10.7],[-11.6,12.7],[-8,13.3],[-4.2,14.2],[-.5,13.4],[3,12.6],[6.2,12.8],[9,13.2],[12.4,14.1],[15.7,15.5],[18.8,17.2],[22,18.8],[25,22.2],[24.1,27.4],[20.2,31.7],[13.2,34.1],[4.4,35.6],[-5.8,34.9],[-15.3,33],[-23.9,28.1],[-27,20.4],[-27.4,11.1],[-26.5,1.8],[-25.2,-5.2],[-22.4,-10.3]],
      shallowColor:'#a3c9b0',deepColor:'#326a7c',center:[-1,-1.35,23],surfaceMesh:null,occluders:[terrain,landmarks,furniture],reflectionObjects:[landmarks,furniture],reflectionAnchors:[]
    }:null;
    if(lake){lake.shoreLine=lake.outline.slice(0,17).map(point=>point.slice());lake.bounds={minX:Math.min(...lake.outline.map(p=>p[0])),maxX:Math.max(...lake.outline.map(p=>p[0])),minZ:Math.min(...lake.outline.map(p=>p[1])),maxZ:Math.max(...lake.outline.map(p=>p[1]))};}
    const materials = new Map(), materialRecords = new Map(), ownedMaterials = new Set(), geometry = new Set(), anchors = {}, stageObjects = {}, stageStates = {}, slotObjects = new Map();
    const stageGeometryKeys = new Map(), surfaceTriangles=[];
    const architecture=ARCHITECTURE[sectId],sourceRoles=new Map(Object.entries(SOURCE_PIGMENTS[sectId]).map(([role,color])=>[color,role]));
    const nativeRoles=new Map([['stone',theme.stone],['pale',theme.pale],['wood',theme.wood],['roof',theme.roof],['water',theme.water]].map(([role,color])=>[color,role]));
    for(const color of[0xd9c38a,0xf0d18c,0xf1d18b,0xc6b783,0xc7b680,0xd6c191,0xc7b27b,0xe3c17b])nativeRoles.set(color,'gold');
    nativeRoles.set(0x315b9a,'roof');nativeRoles.set(0x9bb8d7,'wall');nativeRoles.set(0xd5d0af,'pale');
    let stateKey = '', layoutKey = '', editing = false, selectedSlot = '', destroyed = false,materialFamily='landscape';
    let daylightState={...DEFAULT_DAYLIGHT},daylightKey='',weatherState={...DEFAULT_WEATHER},cloudsVisible=true;
    let moonHorizon=null;const moonFraming=new WeakMap();
    function tintMaterial(mat,record){
      const night=1-daylightState.daylight;
      // Pigments retain their architectural identity. Actual normal-dependent
      // shading comes from the renderer, including the Canvas fallback.
      mat.color.copy(record.color);
      if(record.family==='landscape')mat.color.lerp(new T.Color(0x71869b),night*.045).multiplyScalar(1-night*.10);
      if(record.lantern){mat.emissive.setHex(0xffc56b);mat.emissiveIntensity=.025+night*.56;}
      else if(record.emissiveIntensity!==undefined)mat.emissiveIntensity=record.emissiveIntensity;
    }
    function makeMaterial(color,extra,family,role,preview=false){
      const shade=new T.Color(color);
      if(preview)shade.lerp(new T.Color(0xd5d6ce),.16);
      const lantern=role==='lantern'||extra?.emissive!==undefined&&extra?.emissive!==0;
      const key = JSON.stringify([shade.getHex(),extra,family,role,preview]);
      if (!materials.has(key)) {
        const mat=new T.MeshStandardMaterial({color:shade,roughness:.87,flatShading:true,...extra});
        if(family==='architecture'){
          mat.roughness=role==='gold'?.42:role==='roof'||role==='tile'?.64:role==='wood'||role==='ink'?.76:.91;
          mat.metalness=role==='gold'?.18:0;
        }
        mat.userData.sectMaterialFamily=family;mat.userData.sectMaterialRole=role||'natural';mat.userData.sectBaseColor=shade.getHex();
        const record={color:shade.clone(),family,role,lantern:family==='architecture'&&lantern,emissiveIntensity:extra?.emissiveIntensity};
        materials.set(key,mat);materialRecords.set(mat,record);tintMaterial(mat,record);
      }
      return materials.get(key);
    }
    function material(color,extra){
      const value=color?.isColor?color.getHex():color,role=materialFamily==='architecture'?(value===0xf3d28c?'lantern':nativeRoles.get(value)):null;
      return makeMaterial(role&&architecture[role]!==undefined?architecture[role]:color,extra,materialFamily,role);
    }
    function architectureMaterial(color,extra,preview){
      const value=color?.isColor?color.getHex():color,role=value===0xf1d08c?'lantern':value===0xdce8d2?'pale':sourceRoles.get(value)||'accent';
      return makeMaterial(role==='lantern'?0xffd78b:sourceRoles.has(value)||value===0xdce8d2?architecture[role]:color,extra,'architecture',role,preview);
    }
    function withArchitecture(create){const previous=materialFamily;materialFamily='architecture';try{return create();}finally{materialFamily=previous;}}
    function setDaylight(state){
      if(destroyed)return false;
      const next=normalizeDaylight(state),key=next.phaseId+':'+Math.round(next.daylight*120);daylightState=next;
      if(key===daylightKey)return false;daylightKey=key;
      for(const[mat,record]of materialRecords)tintMaterial(mat,record);
      const moon=root.getObjectByName('sect-distant-moon'),halo=root.getObjectByName('sect-moon-halo'),moonlight=clamp((.68-next.daylight)/.55,0,1);
      if(moon){moon.visible=moonlight>0;moon.material.opacity=moonlight;}
      if(halo){halo.visible=moonlight>0;halo.material.opacity=.065*moonlight;}
      root.userData.dayPhase=next.phaseId;root.userData.daylight=next.daylight;
      return true;
    }
    function setWeather(state){
      if(destroyed)return false;weatherState=normalizeWeather(state);
      const visible=weatherState.windStrength<.7&&weatherState.cloudAmount>.025;
      if(visible===cloudsVisible)return false;cloudsVisible=visible;
      root.traverse(object=>{if(object.userData.isCloudGroup)object.visible=visible;});
      return true;
    }
    function horizonAbove(camera,left,right){
      // Cache welded world vertices and shared edges, not every triangle on
      // every drag event. Clipping the edges against this narrow sky strip
      // finds the true silhouette even when a large face spans the moon.
      if(!moonHorizon){
        const vertices=[],edges=[],vertexKeys=new Map(),edgeKeys=new Set(),point=new T.Vector3();
        root.updateMatrixWorld(true);
        root.traverseVisible(object=>{
          if(!object.isMesh||object.name==='sect-distant-moon'||object.name==='sect-moon-halo'||object.material.depthWrite===false||object.material.opacity<.4)return;
          const position=object.geometry.attributes.position,index=object.geometry.index?.array,local=new Uint32Array(position.count);
          for(let i=0;i<position.count;i++){
            point.fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);
            const key=Math.round(point.x*10000)+':'+Math.round(point.y*10000)+':'+Math.round(point.z*10000);
            let id=vertexKeys.get(key);if(id===undefined){id=vertices.length/3;vertices.push(point.x,point.y,point.z);vertexKeys.set(key,id);}local[i]=id;
          }
          const count=index?index.length:position.count;
          for(let i=0;i<count;i+=3)for(let j=0;j<3;j++){
            const a=local[index?index[i+j]:i+j],b=local[index?index[i+(j+1)%3]:i+(j+1)%3];
            if(a===b)continue;const key=Math.min(a,b)+':'+Math.max(a,b);
            if(!edgeKeys.has(key)){edgeKeys.add(key);edges.push(a,b);}
          }
        });
        moonHorizon={vertices:new Float32Array(vertices),edges:new Uint32Array(edges),view:new Float32Array(vertices.length/3*2)};
      }
      const {vertices,edges,view}=moonHorizon,m=camera.matrixWorldInverse.elements;let highest=-Infinity;
      for(let i=0,j=0;i<vertices.length;i+=3,j+=2){
        const x=vertices[i],y=vertices[i+1],z=vertices[i+2],vx=m[0]*x+m[4]*y+m[8]*z+m[12],vy=m[1]*x+m[5]*y+m[9]*z+m[13];
        view[j]=vx;view[j+1]=vy;if(vx>=left&&vx<=right&&vy>highest)highest=vy;
      }
      for(let i=0;i<edges.length;i+=2){
        const a=edges[i]*2,b=edges[i+1]*2,ax=view[a],bx=view[b];
        if(ax===bx||ax<left&&bx<left||ax>right&&bx>right)continue;
        const ay=view[a+1],by=view[b+1];
        if((ax-left)*(bx-left)<0){const y=ay+(by-ay)*(left-ax)/(bx-ax);if(y>highest)highest=y;}
        if((ax-right)*(bx-right)<0){const y=ay+(by-ay)*(right-ax)/(bx-ax);if(y>highest)highest=y;}
      }
      return highest;
    }
    function faceCamera(camera,width,height){
      const moon=root.getObjectByName('sect-distant-moon');
      if(!destroyed&&moon&&camera){
        // A celestial backdrop follows the viewing direction, not the island's
        // orbit. Put it near the far plane, behind every roof and ridge, while
        // retaining a stable apparent size as the orthographic camera zooms.
        // The reference sky bearing preserves the three tested HUD clearances.
        width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
        const compact=width<960&&height<480;
        const aspect=width/height,referenceSpan=Math.max(18.8,20.4/aspect)/.82;
        const bearing=(compact?2.5:-4.48)*Math.cos(.72)-(compact?-28.2:-22.08)*Math.sin(.72);
        const radiusPx=clamp(height*.036,18,36),skyY=Math.max(radiusPx+12,height*(compact?.09:.06));
        const prior=moonFraming.get(camera);
        if(prior&&camera.top===prior.top&&camera.bottom===prior.bottom){camera.top=prior.baseTop;camera.bottom=prior.baseBottom;}
        const baseTop=camera.top,baseBottom=camera.bottom,viewHeight=(baseTop-baseBottom)/camera.zoom,distance=camera.far*.78;
        camera.updateMatrixWorld(true);
        const skyX=bearing/(referenceSpan*aspect),viewWidth=(camera.right-camera.left)/camera.zoom;
        const moonX=(camera.left+camera.right)*.5+skyX*viewWidth*.5,halfWidth=(radiusPx+12)*viewWidth/width;
        const highest=horizonAbove(camera,moonX-halfWidth,moonX+halfWidth),safeY=(baseTop+baseBottom)*.5+viewHeight*(.5-(skyY+radiusPx+12)/height);
        // At a rear or steep view, keep real sky above the projected ridge.
        // Translate the framing only: no automatic zoom, no animation, and no
        // terrain-shaped masking or depth-test bypass. Repeated calls are
        // idempotent; only a deliberate camera change can move the landscape.
        const lift=Math.max(0,highest-safeY);camera.top+=lift;camera.bottom+=lift;camera.updateProjectionMatrix();
        moonFraming.set(camera,{baseTop,baseBottom,top:camera.top,bottom:camera.bottom});
        const sky=new T.Vector3(skyX,1-skyY/height*2,(2*distance-camera.near-camera.far)/(camera.far-camera.near)).unproject(camera);
        moon.position.copy(moon.parent.worldToLocal(sky));moon.scale.setScalar(radiusPx*viewHeight/(height*2.45));
        moon.quaternion.copy(camera.quaternion);
      }
    }
    function mesh(parent, geo, color, x = 0, y = 0, z = 0, extra) {
      geometry.add(geo);
      const item = new T.Mesh(geo, material(color, extra)); item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
    }
    const box = (p, w, h, d, color, x, y, z) => mesh(p, new T.BoxGeometry(w, h, d), color, x, y, z);
    const cylinder = (p, rt, rb, h, color, x, y, z, n = 10) => mesh(p, new T.CylinderGeometry(rt, rb, h, n), color, x, y, z);
    function rod(parent, from, to, radius, color) {
      const a = new T.Vector3(...from), b = new T.Vector3(...to), direction = b.clone().sub(a);
      // Fine branches and rails occupy only a few screen pixels; their tiny ends
      // meet other geometry, so only thicker trunks and posts need end caps.
      const item = mesh(parent, new T.CylinderGeometry(radius * .85, radius, direction.length(), 4, 1, radius <= .055), color);
      item.position.copy(a.add(b).multiplyScalar(.5)); item.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction.normalize()); return item;
    }
    function curve(parent, points, radius, color, count = 14) {
      return mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), count, radius, 4, false), color);
    }
    function ring(parent, radius, thickness, color, x, y, z) {
      const item = mesh(parent, new T.TorusGeometry(radius, thickness, 3, 24), color, x, y, z); item.rotation.x = -Math.PI / 2; return item;
    }
    // Batch small details while retaining complete geometry for the Canvas path.
    function mergeDetails(parent) {
      const groups = new Map();
      for (const item of [...parent.children]) {
        if (!item.isMesh || Array.isArray(item.material) || item.material.transparent || item.userData.softwareTopOffset !== undefined || item.userData.softwareLayer !== undefined) continue;
        item.updateMatrix();
        const geo = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone(); geo.applyMatrix4(item.matrix);
        const key = item.material.uuid + ':' + Number(item.castShadow) + ':' + Number(item.receiveShadow), batch = groups.get(key) || { material: item.material, castShadow: item.castShadow, receiveShadow: item.receiveShadow, position: [], normal: [], color: [], items: [] };
        for (const name of ['position', 'normal', 'color']) if (geo.attributes[name]) for (const value of geo.attributes[name].array) batch[name].push(value);
        batch.items.push(item); groups.set(key, batch); geo.dispose();
      }
      for (const batch of groups.values()) {
        if (batch.items.length < 2) continue;
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(batch.position, 3));
        if (batch.normal.length === batch.position.length) geo.setAttribute('normal', new T.Float32BufferAttribute(batch.normal, 3)); else geo.computeVertexNormals();
        if (batch.color.length === batch.position.length) geo.setAttribute('color', new T.Float32BufferAttribute(batch.color, 3));
        for (const item of batch.items) { parent.remove(item); item.geometry.dispose(); geometry.delete(item.geometry); }
        const item = new T.Mesh(geo, batch.material); item.castShadow = batch.castShadow; item.receiveShadow = batch.receiveShadow; parent.add(item); geometry.add(geo);
      }
    }
    function register(object) {
      object.traverse(item => { if (item.geometry) geometry.add(item.geometry); });
      for (const mat of object.userData.homesteadRuntime?.ownedMaterials || []) ownedMaterials.add(mat);
      return object;
    }
    function release(object) {
      object.traverse(item => { if (item.geometry) { item.geometry.dispose(); geometry.delete(item.geometry); } });
      for (const mat of object.userData.homesteadRuntime?.ownedMaterials || []) { mat.dispose(); ownedMaterials.delete(mat); }
      object.removeFromParent();
    }
    const landformProfiles = {
      fengxia:[[-35,-24,25],[-31,-31,29],[-26,-29,32],[-21,-27,28],[-16,-29,27],[-10,-27,30],[-4,-26,28],[2,-25,26],[8,-27,23],[14,-24,26],[19,-20,23],[24,-17,19],[29,-12,17],[34,-6,8]],
      lingxi:[[-37,-17,10],[-33,-24,13],[-29,-27,18],[-24,-24,22],[-19,-26,21],[-14,-25,24],[-9,-23,26],[-3,-24,24],[3,-26,23],[9,-24,26],[14,-22,23],[19,-24,18],[24,-19,16],[29,-16,9],[34,-10,7]],
      xuanyue:[[-34,-9,20],[-29,-14,24],[-24,-17,27],[-19,-21,24],[-14,-22,26],[-9,-24,29],[-4,-30,29],[1,-31,29],[6,-32,29],[11,-32,30],[16,-32,30],[21,-33,31],[26,-30,29],[31,-27,26],[36,-20,20],[39,-11,12]],
      xinglan:[[-31,-9,3],[-27,-15,12],[-23,-18,18],[-19,-17,23],[-15,-21,24],[-11,-22,22],[-7,-20,25],[-3,-23,22],[1,-21,23],[5,-20,25],[9,-22,21],[13,-20,23],[17,-19,18],[21,-17,12],[24,-14,9],[28,-8,3]]
    };
    const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a),0,1);return t*t*(3-2*t);};
    function lakeSample(x,z){
      if(!lake)return {inside:false,distance:Infinity};
      let inside=false,distance=Infinity;
      for(let i=0,j=lake.outline.length-1;i<lake.outline.length;j=i++){
        const a=lake.outline[j],b=lake.outline[i],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
        distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
        if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      return {inside,distance};
    }
    function terrainHeight(x,z) {
      // The usable court stays level, while its actual ground continues into
      // slope shoulders. There is no circular rim or separate flat island cap.
      if(Math.abs(x)<=13.4&&z>=-5.0&&z<=(lake?11.7:14.8))return .18;
      const coast=lake?lakeSample(x,z):null;
      if(coast?.inside)return lake.surfaceY-.09-smooth(0,6,coast.distance)*2.7;
      const side=smooth(12.5,25,Math.abs(x)),rear=smooth(15.5,31,-z),front=smooth(15.5,32,z);
      const weathering=Math.sin(x*.47+z*.19)*.42+Math.sin(x*.19-z*.43)*.26;
      let h;
      if(sectId==='fengxia'){
        // The court occupies a natural shelf between tall canyon walls. In
        // front, the two ravines fall eighteen metres beside a narrow rock
        // causeway; increasing only a distant mountain never creates a gorge.
        const cliff=smooth(13.8,24.5,Math.abs(x))*(1-smooth(-5,18,z)*.83);
        const ravine=smooth(14.8,22.5,z)*smooth(3.4,7.2,Math.abs(x));
        h=.18+cliff*(18.4+Math.sin(z*.24)*2.0)+rear*7.8-front*2.7-ravine*18.5+weathering*cliff;
      }
      else if(sectId==='lingxi')h=.18+side*(3.1+Math.sin(z*.24+x*.10)*1.15)+rear*(5.2+Math.sin(x*.22))-front*2.5+weathering*side;
      else if(sectId==='xuanyue'){
        const east=smooth(12.5,25,x),shore=smooth(13.2,20,-x)*(1-smooth(13,24,Math.abs(z-3)));
        h=.18+east*(3.9+Math.sin(z*.27)*.9)+rear*3.4-front*2.2-shore*.57+weathering*east;
        if(coast.distance<3.4)h=lake.surfaceY+.09+(Math.max(h,.18)-lake.surfaceY-.09)*smooth(0,3.4,coast.distance);
      }else h=.18+side*(2.4+Math.sin(z*.43)*1.0)+rear*3.7-front*1.6+weathering*side;
      const lowerToe=1.60*smooth(0,3.8,-z-1.3)*(1-smooth(13,18,Math.abs(x)))*(1-smooth(18,25,-z));
      const middleToe=3.85*smooth(0,4,-z-8.6)*(1-smooth(12.2,17,Math.abs(x)))*(1-smooth(20.5,28,-z));
      const upperToe=6.55*smooth(0,5,-z-13)*(1-smooth(5.5,10.7,Math.abs(x-1.65)))*(1-smooth(24.8,30,-z));
      const terraceToe=Math.max(lowerToe,middleToe,upperToe);
      return terraceToe>0?Math.max(h,.18+terraceToe):h;
    }
    function terrainPigment(x,z){
      // Grass is one low, continuous carpet painted into the actual terrain.
      // Broad material fields follow the paths and slopes; there are no floating
      // soil polygons or a regular scatter of individual grass triangles.
      const palettes={
        fengxia:{grass:0xa4a76c,light:0xb9b77c,earth:0xc8b18a,forest:0x8e9767},
        xuanyue:{grass:0x819e83,light:0xa6b69a,earth:0xc4b48f,forest:0x7f977f},
        lingxi:{grass:0x84a76e,light:0xa6bf83,earth:0xcbb991,forest:0x78956b},
        xinglan:{grass:0x8fad98,light:0xb4c9ae,earth:0xd8d0b8,forest:0x91aa96}
      },p=palettes[sectId];
      const drift=Math.sin(x*.12+Math.sin(z*.11)*.65)*.22+Math.cos(z*.13-x*.045)*.18;
      let tone=new T.Color(p.grass).lerp(new T.Color(p.light),clamp(.42+drift,0,1));
      const forest=smooth(13,22,Math.abs(x))*.46+smooth(17,29,-z)*.42;
      tone.lerp(new T.Color(p.forest),clamp(forest,0,.60));
      const slope=Math.abs(terrainHeight(x+.45,z)-terrainHeight(x-.45,z))+Math.abs(terrainHeight(x,z+.45)-terrainHeight(x,z-.45));
      tone.lerp(new T.Color(theme.rock[2]),smooth(.65,2.9,slope)*(sectId==='fengxia'?.78:.28));
      if(sectId==='fengxia')tone.lerp(new T.Color(0xa68b69),smooth(3,17,-terrainHeight(x,z))*.68);
      if(sectId==='xinglan'){
        // Pale stone surrounds connected, generous garden lawns on the sky ridge.
        const meadow=(cx,cz,rx,rz)=>Math.exp(-Math.pow((x-cx+Math.sin(z*.13)*.8)/rx,2)-Math.pow((z-cz)/rz,2));
        const cover=Math.max(meadow(-14,-17,9.5,12),meadow(7,-24,9,10),meadow(17,-3,9,10),meadow(-11,14,9,10));
        tone=new T.Color(0xdde4da).lerp(tone,smooth(.18,.63,cover));
      }
      // A sandy worn approach surrounds the real stepping stones. Its feathered
      // edge flows into the lawn instead of covering it with separate decals.
      const approachX=z>15?Math.sin((z-15)*.63)*.34+(sectId==='lingxi'?-(z-15)*.11:(z-15)*.03):0;
      const width=1.75+Math.sin(z*.25)*.14;
      const approach=(1-smooth(width,width+1.45,Math.abs(x-approachX)))*smooth(.6,2.7,z)*(1-smooth(lake?10.4:26,lake?13.5:32,z));
      const plaza=1-smooth(3.65,5.0,Math.hypot(x, z-9.0));
      const crossPath=(1-smooth(.54,1.45,Math.abs(z+.55)))*(1-smooth(9.9,13.5,Math.abs(x)));
      const courtFoot=(1-smooth(.4,1.65,Math.abs(z+1.8)))*(1-smooth(11.7,14,Math.abs(x)));
      const wear=Math.max(approach,plaza*.86,crossPath*.91,courtFoot*.68);
      tone.lerp(new T.Color(p.earth),wear*.92);
      if(lake){
        const coast=lakeSample(x,z);
        if(!coast.inside&&coast.distance<3.7)tone=new T.Color(0xd0c19b).lerp(tone,smooth(.25,3.7,coast.distance));
      }
      // Low-contrast variation is part of the surface colour, never dark spots.
      return tone.multiplyScalar(.986+Math.sin(x*.53+z*.37)*.009+Math.cos(z*.62-x*.29)*.005);
    }
    function smoothGround(object){
      // Smooth the actual mesh, not the analytic height field between samples.
      // Shared vertices get the same area-weighted normal, and even the steep
      // lake bank must agree with the upward-facing triangles it belongs to.
      const position=object.geometry.attributes.position,normals=new Float32Array(position.count*3),shared=new Map(),keys=[];
      for(let i=0;i<position.count;i++){
        const key=position.getX(i).toFixed(5)+':'+position.getY(i).toFixed(5)+':'+position.getZ(i).toFixed(5);keys.push(key);
        if(!shared.has(key))shared.set(key,{sum:new T.Vector3(),faces:[]});
      }
      const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),ab=new T.Vector3(),ac=new T.Vector3();
      for(let i=0;i<position.count;i+=3){
        a.fromBufferAttribute(position,i);b.fromBufferAttribute(position,i+1);c.fromBufferAttribute(position,i+2);
        const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).clone(),face=area.clone().normalize();
        for(let j=0;j<3;j++){const record=shared.get(keys[i+j]);record.sum.add(area);record.faces.push(face);}
      }
      for(const record of shared.values()){
        const n=record.sum.normalize();let towardUp=0;
        for(const face of record.faces){const dot=n.dot(face);if(dot<.0001)towardUp=Math.max(towardUp,(.0001-dot)/(face.y-dot));}
        if(towardUp>0)n.lerp(new T.Vector3(0,1,0),clamp(towardUp,0,1)).normalize();
      }
      for(let i=0;i<position.count;i++){const n=shared.get(keys[i]).sum;normals[i*3]=n.x;normals[i*3+1]=n.y;normals[i*3+2]=n.z;}
      object.geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
      object.material=material(0xffffff,{vertexColors:true,flatShading:false,roughness:1,side:T.DoubleSide});object.userData.softwareSmooth=true;
      return object;
    }
    function coloredTerrain(parent,name,positions,colors,layer) {
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
      const item=mesh(parent,geo,0xffffff,0,0,0,{vertexColors:true,side:T.DoubleSide});item.name=name;item.userData.softwareLayer=layer;return item;
    }
    function groundHeight(x,z) {
      // Decorations and stream banks rest on the triangulated slope itself,
      // rather than on the analytic curve between its sampled vertices.
      for(const [a,b,c,minX,maxX,minZ,maxZ]of surfaceTriangles){
        if(x<minX||x>maxX||z<minZ||z>maxZ)continue;
        const denominator=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
        if(Math.abs(denominator)<1e-8)continue;
        const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/denominator,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/denominator;
        if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return a[1]*u+b[1]*v+c[1]*(1-u-v);
      }
      return terrainHeight(x,z);
    }
    function naturalTerrain() {
      const profile=landformProfiles[sectId],rows=[],grid=[],columns=32,positions=[],colors=[],ground=new T.Color(theme.grass);
      for(let i=0;i<profile.length-1;i++)for(let part=0;part<3;part++)rows.push(profile[i].map((v,k)=>v+(profile[i+1][k]-v)*part/3));
      rows.push(profile[profile.length-1]);
      for(let row=0;row<rows.length;row++){
        const [z,left,right]=rows[row],line=[];
        for(let column=0;column<=columns;column++){
          const u=column/columns,cell=(right-left)/columns,x=left+(right-left)*u+Math.sin(column*1.73+row*.83)*Math.min(.18,cell*.10)*Math.sin(u*Math.PI);
          // Keep rows ordered at the narrow ridge tips. Unbounded Z jitter
          // can fold a small cell back across its neighbour after refinement.
          line.push([x,terrainHeight(x,z),z]);
        }
        grid.push(line);
      }
      function tri(a,b,c){
        positions.push(...a,...b,...c);
        surfaceTriangles.push([a,b,c,Math.min(a[0],b[0],c[0]),Math.max(a[0],b[0],c[0]),Math.min(a[2],b[2],c[2]),Math.max(a[2],b[2],c[2])]);
        for(const [x,y,z]of[a,b,c]){
          const tone=terrainPigment(x,z);
          colors.push(tone.r,tone.g,tone.b);
        }
      }
      for(let row=0;row<grid.length-1;row++)for(let column=0;column<columns;column++){
        const a=grid[row][column],b=grid[row][column+1],c=grid[row+1][column],d=grid[row+1][column+1];tri(a,c,b);tri(b,c,d);
      }
      const surface=smoothGround(coloredTerrain(terrain,'sect-natural-terrain',positions,colors,-2));surface.userData.isTerrainSurface=true;surface.userData.groundCover='continuous-turf-soil-stone';
      root.userData.terrainKind={fengxia:'continuous-canyon-floor',lingxi:'connected-green-ridge',xuanyue:'moonlit-valley-shore',xinglan:'broken-floating-ridge'}[sectId];
      const border=[...grid[0]];
      for(let row=1;row<grid.length;row++)border.push(grid[row][columns]);
      for(let column=columns-1;column>=0;column--)border.push(grid[grid.length-1][column]);
      for(let row=grid.length-2;row>0;row--)border.push(grid[row][0]);
      const strata=[],strataColors=[],rock=theme.rock.map(value=>new T.Color(value)),sky=sectId==='xinglan';
      const underside=([x,y,z])=>{
        if(sky){
          // A suspended mountain needs a visible keel, not a shallow skirt
          // underneath a flat board. Unequal rock roots narrow inward beneath
          // the unchanged gardens and construction terraces.
          const root=(cx,cz,rx,rz,depth)=>Math.max(0,1-Math.hypot((x-cx)/rx,(z-cz)/rz))*depth;
          const keel=Math.max(root(-7,-4,20,27,11.8),root(9,9,15,19,9.1),root(6,-20,13,13,7.6));
          return[1+(x-1)*.69+Math.sin(z*.21)*.70,-7.0-keel-Math.sin(x*.33+z*.17)*.65,-2+(z+2)*.73+Math.sin(x*.19)*.58];
        }
        const openMoonSky=sectId==='xuanyue'&&x<0&&z<-15;
        const base=sectId==='fengxia'?Math.min(y-5,-26.0):-10.8;
        return[x+(x<0?-1:1)*(openMoonSky?3.0:7.5+Math.sin(z*.24)),base-Math.sin(x*.33+z*.19),z+(z>12?7:z<-18?(openMoonSky?-2:-6):0)];
      };
      const rockTri=(a,b,c,tone)=>{strata.push(...a,...b,...c);for(let i=0;i<3;i++)strataColors.push(tone.r,tone.g,tone.b);};
      const edge=(p,layer,index)=>{
        const bottom=underside(p),t=layer/4;
        return [p[0]+(bottom[0]-p[0])*t+Math.sin(index*1.8+layer)*.38*Math.sin(t*Math.PI),p[1]+(bottom[1]-p[1])*t,p[2]+(bottom[2]-p[2])*t+Math.cos(index+layer)*.27*Math.sin(t*Math.PI)];
      };
      for(let i=0;i<border.length;i++)for(let layer=0;layer<4;layer++){
        const j=(i+1)%border.length,a=edge(border[i],layer,i),b=edge(border[j],layer,j),c=edge(border[i],layer+1,i),d=edge(border[j],layer+1,j),tone=rock[(layer+(i%4===0?1:0))%rock.length].clone();
        if(!sky&&layer<2)tone.lerp(ground,layer===0?.56:.23);
        rockTri(a,b,c,tone);rockTri(b,d,c,tone);
      }
      if(sky)for(let row=0;row<grid.length-1;row++)for(let column=0;column<columns;column++){
        const a=underside(grid[row][column]),b=underside(grid[row][column+1]),c=underside(grid[row+1][column]),d=underside(grid[row+1][column+1]);
        const band=(Math.floor(column/4)+Math.floor(row/11))%rock.length;
        rockTri(a,b,c,rock[band]);rockTri(b,d,c,rock[band]);
      }
      const rockBase=coloredTerrain(terrain,'sect-eroded-rock-strata',strata,strataColors,-3);
      if(sky){rockBase.userData.suspendedMountainKeel=true;root.userData.skyIslandKind='tapered-mountain-above-clouds';}
    }
    function tree(x, z, size, index, parent = terrain, y = groundHeight(x,z), options = {}) {
      if(lake&&lakeSample(x,z).inside)return null;
      const speciesId=options.speciesId||(sectId==='fengxia'?'mapleTree':sectId==='lingxi'?['verdantPine','banyanTree','verdantPine','weepingWillow','banyanTree'][index%5]:sectId==='xuanyue'?index%3===0?'weepingWillow':'verdantPine':index%3===0?'banyanTree':'verdantPine');
      const lod=options.lod||(z<-18||Math.abs(x)>18?'far':'mid');
      const shared=global.createSpiritSectTreeModel?.({THREE:T,material,mergeDetails,speciesId,seed:index+1,lod});
      if(shared){
        register(shared);shared.name='sect-branching-tree';shared.userData.treeType={verdantPine:'pine',banyanTree:'banyan',weepingWillow:'willow',mapleTree:'maple'}[speciesId];shared.userData.forestBelt=options.belt||'garden';
        // Home trees fit a small purchasable plot. Forest trees keep those same
        // branches and leaves but spread their crowns across adjacent slopes.
        const crownSpread=sectId==='lingxi'?({rear:2.25,'outer-side':2.35,'inner-side':1.95,foreground:1.55,garden:1.60}[options.belt||'garden']||1.8):sectId==='fengxia'?({rear:1.5,'inner-side':1.6,garden:1.4,'cliff-crest':1.12}[options.belt||'garden']||1.2):1.1;
        shared.position.set(x,y,z);shared.rotation.y=index*1.13;shared.scale.set(size*crownSpread*(.94+(index%3)*.035),size,size*crownSpread*(.90+(index%4)*.045));shared.userData.crownSpread=crownSpread;parent.add(shared);return shared;
      }
      const g = new T.Group(); g.position.set(x, y, z); g.scale.setScalar(size); parent.add(g);
      g.name = 'sect-branching-tree';g.userData.treeType='broadleaf';
      rod(g, [0, 0, 0], [.10, 1.14, -.04], .13, theme.wood);
      rod(g, [.10, 1.14, -.04], [-.02, 2.30, .08], .082, theme.wood);
      const clusters = [[-.64,.12,1.63,.70],[.52,-.21,1.89,.69],[-.17,.14,2.35,.73],[.38,.29,2.27,.49],[-.77,-.21,1.91,.44],[-.24,-.37,2.13,.53],[.66,.05,1.62,.43]];
      for (let i = 0; i < clusters.length; i++) {
        const [dx, dz, height, radius] = clusters[i];
        rod(g, [.08, .87 + i % 3 * .24, 0], [dx * .84, height - .12, dz], i < 3 ? .054 : .033, theme.wood);
        const crown = i < 4 ? new T.IcosahedronGeometry(radius, 0) : new T.OctahedronGeometry(radius, 0);
        const canopy = mesh(g, crown, theme.leaf[(index + i) % 3], dx, height, dz);
        canopy.scale.set(1, sectId === 'fengxia' ? .56 : .49, .78); canopy.rotation.set(i * .15, index * 1.39 + i, i % 2 * .13);
        if (i % 2 === 0) {
          const twig = [dx * 1.15, height - .16, dz + .22];
          rod(g, [dx * .6, height - .34, dz], twig, .025, theme.wood);
          const leaf = mesh(g, new T.OctahedronGeometry(.22, 0), sectId==='lingxi'?0xd0e890:theme.leaf[(index + i + 1) % 3], ...twig);
          leaf.scale.set(1.3,.20,.70); leaf.rotation.y = i;
        }
      }
      for (const side of [-1,1]) rod(g,[.03,.26,0],[side*.28,.03,.15],.055,theme.wood);
      for(const side of[-1,1]){
        const branch=[side*.57,1.42+side*.08,.35];rod(g,[side*.18,1.05,.08],branch,.026,theme.wood);
        rod(g,branch,[side*.79,1.62,.43],.017,theme.wood);
        const tip=mesh(g,new T.OctahedronGeometry(.16,0),theme.leaf[(index+2)%3],side*.80,1.65,.43);tip.scale.set(1.4,.27,.75);
      }
      mergeDetails(g); return g;
    }
    function bamboo(x, z, size) {
      const g = new T.Group(); g.position.set(x, groundHeight(x,z), z); g.scale.setScalar(size); terrain.add(g);
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * .27, dz = Math.sin(i * 2) * .2, height = 2.4 + (i % 3) * .36;
        cylinder(g, .035, .055, height, theme.wood, dx, height / 2, dz, 6);
        for (let j = 1; j < 4; j++) {
          const y = height * j / 4; cylinder(g, .061, .061, .045, theme.pale, dx, y, dz, 6);
          for (const direction of [-1, 1]) { const leaf = mesh(g, new T.OctahedronGeometry(.3, 0), theme.leaf[j % 3], dx + direction * .22, y + .10, dz); leaf.scale.set(1.3, .19, .34); leaf.rotation.z = direction * .5; }
        }
      }
      mergeDetails(g);
    }
    function bridge(x, z, width, length, y) {
      const g = new T.Group(); g.position.set(x, y, z); terrain.add(g); g.name = 'sect-visit-bridge';
      for (let i = 0; i < 9; i++) { const zz = (i / 8 - .5) * length, yy = Math.cos(zz / length * Math.PI) * .22; box(g, width, .11, length / 8 + .025, theme.pale, 0, yy, zz); }
      for (const side of [-1, 1]) {
        const x = side * (width / 2 + .07);
        curve(g, [[x, .40, -length / 2], [x, .64, 0], [x, .40, length / 2]], .055, theme.wood, 10);
        for (let i = 0; i < 5; i++) { const z = (i / 4 - .5) * length, y = Math.cos(z / length * Math.PI) * .22; rod(g, [x, y, z], [x, y + .4, z], .045, theme.wood); }
      }
      mergeDetails(g);
    }
    function layeredRock(parent,x,z,size,index,y=groundHeight(x,z)) {
      const outline=[[-.91,-.49],[-.23,-.76],[.65,-.57],[.96,.14],[.31,.68],[-.61,.64],[-1.03,.05]],positions=[],colors=[],tones=theme.rock.map(c=>new T.Color(c));
      const vertex=(level,i)=>{const [x,z]=outline[i],scale=[1,.92,.78,.51][level],h=[0,.22,.48,.85][level];return[(x*scale+Math.sin(index+level*.9)*.08)*size,(h+(level?Math.sin(i*1.71+index)*.055:0))*size,z*scale*size];};
      const tri=(a,b,c,tone)=>{positions.push(...a,...b,...c);for(let j=0;j<3;j++)colors.push(tone.r,tone.g,tone.b);};
      for(let level=0;level<3;level++)for(let i=0;i<outline.length;i++){
        const j=(i+1)%outline.length,a=vertex(level,i),b=vertex(level,j),c=vertex(level+1,i),d=vertex(level+1,j),tone=tones[(level+Math.abs(index))%tones.length];tri(a,c,b,tone);tri(b,c,d,tone);
      }
      const cap=new T.Color(index%3?theme.stone:theme.grass);
      for(let i=0;i<outline.length;i++)tri([0,.82*size,0],vertex(3,i),vertex(3,(i+1)%outline.length),cap);
      const rock=coloredTerrain(parent,'sect-layered-rock-outcrop',positions,colors,0);delete rock.userData.softwareLayer;
      rock.position.set(x,y-.08*size,z);rock.rotation.y=index*1.41;return rock;
    }
    function terrainDressing() {
      const g=new T.Group();g.name='sect-natural-ground-details';terrain.add(g);
      // Ground colour lives on sect-natural-terrain. Only solid rocks and trees
      // remain here; there is no second thin surface to intersect the slopes.
      const profile=landformProfiles[sectId];
      const bounds=z=>{for(let j=0;j<profile.length-1;j++)if(z>=profile[j][0]&&z<=profile[j+1][0]){const t=(z-profile[j][0])/(profile[j+1][0]-profile[j][0]);return[profile[j][1]+(profile[j+1][1]-profile[j][1])*t,profile[j][2]+(profile[j+1][2]-profile[j][2])*t];}return null;};
      for(let i=0;i<12;i++){
        const side=i%2?1:-1,z=-22+(i%6)*6.1,x=side*(15.7+Math.sin(i*1.47)*1.5+(i%3)*.7);
        if(lake&&lakeSample(x,z).inside)continue;
        layeredRock(g,x,z,.60+(i%4)*.28,i);
      }
      for(const[x,z,s]of[[-7.9,20.5,1.25],[7.8,19.6,.90],[-14.4,-20.8,1.55],[11.8,-19.4,1.3]])if(!lake||!lakeSample(x,z).inside)layeredRock(g,x,z,s,Math.round(z));
      if(sectId==='fengxia'||sectId==='lingxi'){
        const forest=new T.Group();forest.name=sectId==='lingxi'?'sect-enclosing-mixed-forest':'sect-dense-maple-groves';terrain.add(forest);let serial=180;
        const plant=(x,z,size,belt,lod='far',speciesId)=>{
          const limit=bounds(z);if(!limit||x<limit[0]+.9||x>limit[1]-.9)return;
          tree(x,z,size,serial++,forest,groundHeight(x,z),{lod,belt,speciesId});
        };
        if(sectId==='lingxi'){
          // Two overlapping rear rows, two unequal shoulder rows and low
          // foreground groves enclose the temple while keeping its axis open.
          for(let i=0;i<13;i++)plant(-23+i*3.5,-27.0-Math.sin(i*1.7)*1.25,2.35+(i%4)*.25,'rear');
          for(let i=0;i<11;i++)plant(-21+i*3.2,-32.1+Math.sin(i*2.1)*1.1,2.50+(i%3)*.34,'rear');
          for(const side of[-1,1])for(let i=0;i<12;i++)plant(side*(21.4+Math.sin(i*1.9+side)*1.35),-22+i*3.35,2.05+(i%4)*.29,'outer-side');
          for(const side of[-1,1])for(let i=0;i<8;i++)plant(side*(17.1+Math.sin(i*1.4)*.85),-19.5+i*4.5,1.85+(i%3)*.30,'inner-side');
          for(const side of[-1,1])for(let i=0;i<4;i++)plant(side*(13.3+i*1.25),16.0+i*2.0,1.40+(i%3)*.22,'foreground',i<2?'mid':'far',i%2?'verdantPine':'banyanTree');
          for(const[x,z,size,speciesId]of[[-14.4,-8.5,1.8,'banyanTree'],[14.8,-10,2.0,'verdantPine'],[-13.6,1.0,1.65,'weepingWillow'],[14.0,3.4,1.9,'banyanTree'],[-12.6,10.0,1.45,'weepingWillow'],[12.8,11.8,1.65,'banyanTree']])plant(x,z,size,'garden','mid',speciesId);
        }else{
          for(let i=0;i<12;i++)plant(-22.2+i*3.9,-28.2+Math.sin(i*1.8)*1.3,1.80+(i%4)*.23,'rear');
          for(let i=0;i<10;i++)plant(-20+i*4.1,-32.1+Math.sin(i*2)*.9,1.65+(i%3)*.24,'rear');
          for(const side of[-1,1])for(let i=0;i<6;i++)plant(side*(17.9+Math.sin(i*1.8)*.8),-22+i*5.8,1.90+(i%3)*.22,'inner-side');
          for(const[x,z,size]of[[-14.8,-9,1.65],[14.5,-9.5,1.85],[-13.9,-1.8,1.7],[14.1,-.4,1.65],[-12.9,7.6,1.65],[13.5,8.7,1.75],[-12,13,1.8],[12.3,14,1.7],[-16.8,9,1.85],[17.2,5.2,1.7]])plant(x,z,size,'garden','mid','mapleTree');
        }
        forest.userData.enclosingForest=true;forest.userData.treeCount=forest.children.length;
      }else{
        const groves=[[-21,-22,1.5],[19,-19,1.55],[-21,-9,1.65],[22,-4,1.5],[-20,5,1.45],[19,10,1.5],[-15,19,1.25],[12,20,1.15],[-8,25,1.0],[14,-26,1.3]];
        groves.forEach(([x,z,size],i)=>{const limit=bounds(z);if(limit&&x>limit[0]+1&&x<limit[1]-1)tree(x,z,size,i+31,g);});
      }
      if(sectId==='xinglan'){
        const fragments=new T.Group();fragments.name='sect-detached-floating-rocks';terrain.add(fragments);
        for(const[x,y,z,s,i]of[[-22,-9,9,1.25,1],[23,-10,8,1.15,2],[-13,-14,23,1.4,3],[14,-13,22,.9,4]]){
          const rock=layeredRock(fragments,x,z,s,i,y);rock.scale.y=1.65;rock.rotation.z=(i%2?1:-1)*.18;
        }
        mergeDetails(fragments);
      }
      mergeDetails(g);
    }
    function stream() {
      const water = new T.Group(); terrain.add(water); water.name = 'sect-visit-waterway';
      const points = sectId === 'lingxi' ? [[-12.6,8.7],[-8.6,12.4],[-3,12.3],[1,12.1],[6.3,12.5],[12.6,8.8]] : sectId==='xinglan'?[[-17,-13],[-15,-7],[-14.7,.5],[-13.8,4.5],[-11.8,9.2],[-16,13.6],[-19.1,16.2]]:lake?[[-15.6,-14],[-14.7,-5.5],[-14.7,.5],[-13.8,4.5],[-14.8,8.6]]:[[-15.6,-14],[-14.7,-5.5],[-14.7,.5],[-13.8,4.5],[-11.8,9.2],[-14.7,14.7]];
      const c = new T.CatmullRomCurve3(points.map(([x, z]) => new T.Vector3(x, 0, z))), positions = [],banks=[],bankColors=[];
      const sand=new T.Color(theme.stone).lerp(new T.Color(theme.rock[1]),.30),moss=new T.Color(theme.grass).multiplyScalar(.88);
      function section(t){
        const p=c.getPoint(t),v=c.getTangent(t),n=new T.Vector3(-v.z,0,v.x).normalize(),half=.43+Math.sin(t*15.1)*.085+Math.cos(t*23)*.045;
        p.y=Math.max(lake?lake.surfaceY+.012:-Infinity,groundHeight(p.x,p.z)+.058);
        const point=(side,outer)=>{const width=half+(outer?.35+Math.sin(t*29+side)*.10:0),x=p.x+n.x*side*width,z=p.z+n.z*side*width;return[x,outer?groundHeight(x,z)+.085:p.y-.012,z];};
        return{p,n,half,left:point(1,false),right:point(-1,false),outerLeft:point(1,true),outerRight:point(-1,true)};
      }
      const bankTri=(a,b,c,tones)=>{banks.push(...a,...b,...c);for(const tone of tones)bankColors.push(tone.r,tone.g,tone.b);};
      for(let i=0;i<48;i++){
        const a=section(i/48),b=section((i+1)/48);
        positions.push(...a.left,...a.right,...b.left,...a.right,...b.right,...b.left);
        for(const side of['Left','Right']){
          const inner=side==='Left'?'left':'right';bankTri(a[inner],a['outer'+side],b[inner],[sand,moss,sand]);bankTri(a['outer'+side],b['outer'+side],b[inner],[moss,moss,sand]);
        }
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.computeVertexNormals();
      const meshWater = mesh(water, geo, theme.water, 0, 0, 0, { side: T.DoubleSide, roughness: .45 }); meshWater.castShadow=false;meshWater.userData.softwareLayer = -1;meshWater.userData.isWaterSurface=true;
      coloredTerrain(water,'sect-stream-eroded-banks',banks,bankColors,-1.45).castShadow=false;
      withArchitecture(()=>{if (sectId === 'lingxi') bridge(.2,12.2,3.5,2.3,.31); else bridge(-14.3,2.6,1.8,1.95,groundHeight(-14.3,2.6)+.13);});
      for(let i=0;i<12;i++){
        const {p,n,half}=section((i+.4)/13),side=i%2?1:-1,x=p.x+n.x*side*(half+.20),z=p.z+n.z*side*(half+.20);
        layeredRock(water,x,z,.22+(i%4)*.065,i+7,groundHeight(x,z)+.025);
        if(i%3===0){const verts=[],y=groundHeight(x,z)+.055;for(let j=0;j<4;j++){const dx=(j-1.5)*.07;verts.push(x+dx-.025,y,z,x+dx+.025,y,z,x+dx+Math.sin(j+i)*.10,y+.33+(j%2)*.17,z+.045);}
          const reed=new T.BufferGeometry();reed.setAttribute('position',new T.Float32BufferAttribute(verts,3));reed.computeVertexNormals();const plant=mesh(water,reed,theme.grassTips[i%3],0,0,0,{side:T.DoubleSide});plant.castShadow=false;}
      }
      for(let i=0;i<5;i++){const {p}=section((i+1)/7),ripple=ring(water,.16+i%2*.08,.013,0xdae7c8,p.x,p.y+.015,p.z);ripple.scale.z=.47;}
      if(lake)frontLake(water);
      mergeDetails(water);
    }
    function sceneryRock(parent,x,z,size,index,y=groundHeight(x,z)){
      const model=global.createSpiritSectSceneryModel?.({THREE:T,material,modelId:index%4===0?'shoreCrag':index%3===0?'shorePebble':'shoreSlab',palette:{rock:theme.rock[2],wet:theme.rock[0],moss:theme.grassTips[0]}});
      if(!model)return layeredRock(parent,x,z,size,index,y);
      register(model);model.position.set(x,y-.06*size,z);model.scale.setScalar(size);model.rotation.y=index*1.41;parent.add(model);return model;
    }
    function frontLake(parent){
      const positions=[],colors=[],shallow=new T.Color(lake.shallowColor),deep=new T.Color(lake.deepColor),outline=lake.outline;
      const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
      function waterTriangle(a,b,c,depth){
        if(depth){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);waterTriangle(a,ab,ca,depth-1);waterTriangle(ab,b,bc,depth-1);waterTriangle(ca,bc,c,depth-1);waterTriangle(ab,bc,ca,depth-1);return;}
        if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)[b,c]=[c,b];
        for(const[x,z]of[a,b,c]){
          positions.push(x,lake.surfaceY,z);
          const depth=smooth(0,6.4,lakeSample(x,z).distance),tone=shallow.clone().lerp(deep,depth*.92).multiplyScalar(.985+Math.sin(x*.18+z*.12)*.015);
          colors.push(tone.r,tone.g,tone.b);
        }
      }
      for(const face of T.ShapeUtils.triangulateShape(outline.map(([x,z])=>new T.Vector2(x,z)),[]))waterTriangle(...face.map(i=>outline[i]),2);
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
      const surface=mesh(parent,geo,0xffffff,0,0,0,{vertexColors:true,flatShading:false,roughness:.25,metalness:.08,side:T.DoubleSide});
      surface.name='sect-moonlit-natural-shore';surface.castShadow=false;surface.receiveShadow=true;surface.userData.softwareLayer=-1;surface.userData.isLakeSurface=true;surface.userData.isWaterSurface=true;lake.surfaceMesh=surface;
      const coast=[],coastColors=[],wet=new T.Color(0x687f76),sand=new T.Color(0xc8b995),grass=new T.Color(theme.grass);
      function edgePoint(i,width){
        const p=outline[i],a=outline[(i+outline.length-1)%outline.length],b=outline[(i+1)%outline.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        let nx=-(b[1]-a[1])/length,nz=(b[0]-a[0])/length;
        if(lakeSample(p[0]+nx*.3,p[1]+nz*.3).inside){nx=-nx;nz=-nz;}
        const x=p[0]+nx*width,z=p[1]+nz*width;
        return[x,width?Math.max(lake.surfaceY+.035,groundHeight(x,z)+.04):lake.surfaceY+.025,z];
      }
      const widths=[0,.48,1.24,2.55],coastTone=band=>band===0?wet:band===1?sand:band===2?sand.clone().lerp(grass,.32):grass;
      for(let i=0;i<outline.length;i++)for(let band=0;band<3;band++){
        const j=(i+1)%outline.length,a=edgePoint(i,widths[band]),b=edgePoint(j,widths[band]),c=edgePoint(i,widths[band+1]),d=edgePoint(j,widths[band+1]);
        coast.push(...a,...c,...b,...b,...c,...d);
        for(const tone of[coastTone(band),coastTone(band+1),coastTone(band),coastTone(band),coastTone(band+1),coastTone(band+1)])coastColors.push(tone.r,tone.g,tone.b);
      }
      const shore=coloredTerrain(parent,'sect-worn-lake-shore',coast,coastColors,-.6);shore.castShadow=false;shore.material=material(0xffffff,{vertexColors:true,flatShading:false,roughness:.97,side:T.DoubleSide});
      const details=new T.Group();details.name='sect-lake-shore-stones-and-reeds';parent.add(details);lake.reflectionObjects.push(details);
      const reeds=[],reedColors=[];
      for(const i of[1,3,5,6,8,10,12,14,16,18,21,24,27,29]){
        const p=edgePoint(i,.42+(i%3)*.22),rock=sceneryRock(details,p[0],p[2],.55+(i%4)*.17,i,p[1]);rock.userData.isShoreRock=true;
        for(let blade=0;blade<7;blade++){
          const x=p[0]+Math.sin(i+blade*1.9)*.52,z=p[2]+Math.cos(i+blade*1.4)*.35,y=Math.max(lake.surfaceY+.01,groundHeight(x,z)+.04),h=.38+(blade%3)*.19;
          const tone=new T.Color(blade%3?0x6b967a:0xa5b985),bend=Math.sin(i+blade)*.17;
          reeds.push(x-.027,y,z,x+.027,y,z,x+bend,y+h,z+.07,x-.018,y,z+.02,x+.05,y,z+.02,x-bend*.6,y+h*.78,z-.12);
          for(let v=0;v<6;v++)reedColors.push(tone.r,tone.g,tone.b);
        }
      }
      coloredTerrain(details,'sect-lake-shallows-reeds',reeds,reedColors,0).castShadow=false;
      for(const[x,z,size,index]of[[-16.2,-4.9,.96,41],[-14.5,6.1,.82,43],[17.2,13.3,.95,44],[22.4,16.4,.85,46]]){
        const object=tree(x,z,size,index,details);if(object)lake.reflectionAnchors.push({position:[x,groundHeight(x,z),z],height:2.7*size,width:1.8*size,color:'#5a8278'});
      }
      mergeDetails(details);
      const path=new T.Group();path.name='sect-winding-lakeside-approach';terrain.add(path);
      const line=new T.CatmullRomCurve3([[21,0,16.7],[16,0,13.5],[10.5,0,11.5],[5.3,0,11.12],[0,0,10.9]].map(p=>new T.Vector3(...p)));
      withArchitecture(()=>{for(let i=0;i<30;i++){
        const t=i/29,p=line.getPoint(t),direction=line.getTangent(t),y=groundHeight(p.x,p.z),step=box(path,1.37+(i%3)*.07,.07,.53,theme.pale,p.x,y+.045,p.z);
        step.rotation.y=Math.atan2(direction.x,direction.z)+Math.sin(i*1.73)*.025;
        step.rotation.x=-Math.atan2(groundHeight(p.x+direction.x*.22,p.z+direction.z*.22)-groundHeight(p.x-direction.x*.22,p.z-direction.z*.22),.44);
      }});
      mergeDetails(path);
      root.userData.lakeSurfaceY=lake.surfaceY;
    }
    function balustrade(parent, x, z, length, y, axis = 'x', gap = 0) {
      const n = Math.max(3, Math.ceil(length / 1.65));
      const point = (u, h) => axis === 'x' ? [x + u, y + h, z] : [x, y + h, z + u];
      for (let i = 0; i <= n; i++) {
        const u = (i / n - .5) * length; if (gap && Math.abs(u) < gap) continue;
        const [xx, yy, zz] = point(u, .43);
        box(parent, .15, .85, .15, theme.pale, xx, yy, zz);
        const cap = mesh(parent, new T.OctahedronGeometry(.13, 0), 0xc6b783, xx, y + .94, zz); cap.scale.y = .75;
        if (i < n) {
          const v = ((i + 1) / n - .5) * length; if (gap && (Math.abs(v) < gap || Math.sign(u) !== Math.sign(v))) continue;
          for (const h of [.31, .76]) rod(parent, point(u, h), point(v, h), .042, theme.pale);
        }
      }
    }
    function stairs(parent, name, x, startZ, endZ, lowY, highY, width, count) {
      const g = new T.Group(); g.name = name; parent.add(g);
      g.userData.ascent={startZ,endZ,lowY,highY,width,steps:count};
      // A closed masonry body under the treads removes floating stair slabs.
      const body=[],left=x-width/2,right=x+width/2,base=lowY-.19;
      const a=[left,base,startZ+.20],b=[right,base,startZ+.20],c=[left,base,endZ-.20],d=[right,base,endZ-.20],e=[left,highY-.15,endZ-.20],f=[right,highY-.15,endZ-.20];
      body.push(...a,...e,...c,...a,...b,...e,...b,...f,...e,...b,...d,...f,...c,...e,...d,...d,...e,...f,...a,...c,...d,...a,...d,...b);
      const core=new T.BufferGeometry();core.setAttribute('position',new T.Float32BufferAttribute(body,3));core.computeVertexNormals();mesh(g,core,theme.stone,0,0,0,{side:T.DoubleSide});
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1), y = lowY + (highY - lowY) * t;
        box(g, width - t * .30, .16, Math.abs(endZ - startZ) / count + .15, theme.pale, x, y - .08, startZ + (endZ - startZ) * t);
        if (i % 3 === 0 || i === count - 1) for (const side of [-1, 1]) {
          const xx=x+side*(width/2+.14),zz=startZ+(endZ-startZ)*t;
          box(g,.14,.64,.14,theme.pale,xx,y+.32,zz);
          const cap=mesh(g,new T.OctahedronGeometry(.12,0),0xc7b680,xx,y+.72,zz);cap.scale.y=.7;
        }
      }
      for(const side of [-1,1])rod(g,[x+side*(width/2+.14),lowY+.66,startZ],[x+side*(width/2+.14),highY+.66,endZ],.052,theme.pale);
      mergeDetails(g);
    }
    function corridor(x, z, length, y, direction) {
      const g=new T.Group();g.position.set(x,y,z);g.rotation.y=direction||0;g.name='sect-visit-covered-gallery';terrain.add(g);
      box(g,length,.13,1.22,theme.pale,0,.065,0);
      const posts=Math.ceil(length/1.6);
      for(let i=0;i<=posts;i++)for(const side of [-1,1]){
        const xx=(i/posts-.5)*length;
        cylinder(g,.074,.095,1.95,theme.wood,xx,1.05,side*.47,6);
        box(g,.32,.11,.22,theme.pale,xx,1.98,side*.47);
      }
      const positions=[];
      for(let i=0;i<posts;i++){
        const x0=(i/posts-.5)*length-.12,x1=((i+1)/posts-.5)*length+.12;
        for(const side of [-1,1]){
          const a=[x0,2.19,0],b=[x1,2.19,0],c=[x1,1.98,side*.89],d=[x0,1.98,side*.89];
          positions.push(...a,...b,...c,...a,...c,...d);
        }
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
      mesh(g,geo,theme.roof,0,0,0,{side:T.DoubleSide});
      for(const side of [-1,1])rod(g,[-length/2-.2,2.00,side*.89],[length/2+.2,2.00,side*.89],.045,0xd6c191);
      rod(g,[-length/2-.22,2.24,0],[length/2+.22,2.24,0],.06,0xc7b27b);
      mergeDetails(g);
    }
    // These are deliberately low-poly landforms, not large opaque background
    // images. Their differing heights, silhouettes and atmospheric colours stay
    // legible while orbiting and use the same meshes in the Canvas renderer.
    function mountain(x, y, z, width, depth, height, palette, seed) {
      const g = new T.Group(); g.name = 'sect-distant-peak'; g.position.set(x,y,z); backdrop.add(g);
      const positions = [], colors = [], n = 11, ramps = [[0,1],[.22,.87],[.57,.56],[.86,.24],[1,.025]];
      const tones = palette.map(c => new T.Color(c));
      const point = (level, i) => {
        const j = ((i % n) + n) % n, a = j * Math.PI * 2 / n;
        const uneven = 1 + Math.sin(j * 1.83 + seed) * .13 + Math.cos(j * 2.43 - seed) * .07;
        const [up, radius] = ramps[level], shift = Math.sin(seed + level * .7) * level * .055;
        return [Math.cos(a)*width*radius*uneven + shift*width, height*(up + (level && level < 4 ? Math.sin(j*1.71+seed+level)*.055 : 0)), Math.sin(a)*depth*radius*uneven - level*.09*depth];
      };
      function tri(a,b,c,tone){positions.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(tone.r,tone.g,tone.b);}
      for(let level=0;level<ramps.length-1;level++)for(let i=0;i<n;i++){
        const color=tones[(i+level)%tones.length],a=point(level,i),b=point(level,i+1),c=point(level+1,i),d=point(level+1,i+1);
        tri(a,c,b,color);tri(b,c,d,tones[(i+level+1)%tones.length]);
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
      mesh(g,geo,0xffffff,0,0,0,{vertexColors:true,side:T.DoubleSide}); return g;
    }
    function cloudBank(parent, x, y, z, size, color, opacity = .70) {
      const g=new T.Group();g.name='sect-layered-cloud-bank';g.userData.isCloudGroup=true;g.position.set(x,y,z);parent.add(g);
      // Xinglan's cloud sea is a soft projected volume in sect-effects.js. The
      // weather-tagged anchor remains, without the old flattened white solids.
      if(sectId==='xinglan'){g.userData.cloudRadius=size;g.userData.projectedCloud=true;return g;}
      const sky=sectId==='xinglan',extra={transparent:true,opacity:opacity*(sky?.65:1),depthWrite:false,flatShading:false,roughness:1};
      for(const[dx,dy,dz,r]of[[-1.22,0,.05,1.03],[-.15,.18,-.14,1.48],[1.27,-.02,.13,1.05],[.36,-.13,.60,.95]]){
        const puff=mesh(g,new T.SphereGeometry(r,sky?6:8,4),sky?0xeef4f5:color,dx*size,dy*size*.35,dz*size*.65,extra);
        puff.scale.set(size*1.1,size*(sky?.12:.23),size*.73);puff.castShadow=false;puff.receiveShadow=false;puff.userData.isCloud=true;
      }
      return g;
    }
    function canyonWall(side) {
      const g=new T.Group();g.name='sect-layered-canyon-wall';backdrop.add(g);
      const positions=[],colors=[],count=20;
      const profile=[[-.12,0],[-.08,.18],[-.04,.42],[.02,.64],[.08,.83],[.12,1],[.42,1.02],[.90,.64],[1.30,.05]];
      const tones=[0x81674f,0xa58664,0xb4936e,0xc3a780,0x9f7d5d,0xc9ae83].map(c=>new T.Color(c));
      const crest=[];
      function point(i,j){
        const t=i/count,z=-34+t*51,curve=Math.sin(t*4.2+side)*1.15;
        const top=(25.8+Math.sin(i*1.13+side)*2.5+Math.cos(i*.57-side)*1.6)*(1-smooth(.43,1,t)*.88),base=-21.8+smooth(.5,1,t)*5.0;
        const [u,v]=profile[j],width=8.4+Math.sin(i*1.73)*.65;
        return [side*(21.9+curve+u*width+Math.sin(i*2.3+j)*.24),base+(top-base)*v+(j>0&&j<profile.length-1?Math.sin(i*1.9+j*.7)*.30:0),z+Math.sin(j*1.7+i*.31)*.36];
      }
      const tri=(a,b,c,color)=>{positions.push(...a,...b,...c);for(let k=0;k<3;k++)colors.push(color.r,color.g,color.b);};
      for(let i=0;i<count;i++)for(let j=0;j<profile.length-1;j++){
        const a=point(i,j),b=point(i+1,j),c=point(i,j+1),d=point(i+1,j+1),tone=tones[(j+(i%3===0?1:0))%tones.length];
        tri(a,c,b,tone);tri(b,c,d,tones[(j+1)%tones.length]);
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
      mesh(g,geo,0xffffff,0,0,0,{vertexColors:true,side:T.DoubleSide});
      g.userData.canyonDepth=46;g.userData.wallKind='steep-stratified-gorge';
      for(let i=1;i<18;i++){const p=point(i,5);crest.push(p);tree(p[0],p[2],1.30+(i%4)*.18,i+57+(side+1)*41,g,p[1],{lod:'far',speciesId:'mapleTree',belt:'cliff-crest'});}
      return crest;
    }
    function skyPavilion(parent, scale) {
      return withArchitecture(()=>{
      const g=new T.Group();g.name='sect-distant-cloud-palace';g.scale.setScalar(scale);parent.add(g);
      for(let i=0;i<3;i++)box(g,3.2-i*.22,.18,2.8-i*.20,theme.pale,0,.09+i*.17,0);
      for(const x of [-1.08,1.08])for(const z of [-.90,.90]){cylinder(g,.08,.11,2.35,theme.wood,x,1.68,z,6);cylinder(g,.17,.17,.12,0xd9c38a,x,2.78,z,6);}
      for(const [y,w,d]of[[2.91,3.65,3.18],[4.15,2.38,2.16]]){
        const verts=[],point=(x,z)=>[x*w,y+.34*(1-Math.abs(z)*2)+.22*Math.pow(Math.abs(x)*2,3),z*d];
        for(const side of[-1,1])for(let i=0;i<4;i++){
          const a=point(i/4-.5,0),b=point((i+1)/4-.5,0),c=point((i+1)/4-.5,side*.5),d0=point(i/4-.5,side*.5);
          verts.push(...a,...b,...c,...a,...c,...d0);
        }
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.computeVertexNormals();mesh(g,geo,0x315b9a,0,0,0,{side:T.DoubleSide});
        rod(g,[-w*.5,y+.57,0],[w*.5,y+.57,0],.035,0xf0d18c);
        for(const side of[-1,1])curve(g,[[-w*.5,y+.22,side*d*.5],[0,y,side*d*.5],[w*.5,y+.22,side*d*.5]],.034,0xf0d18c,8);
      }
      box(g,1.62,1.26,1.38,0x9bb8d7,0,3.58,0);cylinder(g,.03,.16,.63,0xf1d18b,0,4.87,0,6);
      mergeDetails(g); return g;
      });
    }
    function floatingSanctuary(x,y,z,size,depth,index,distance,pavilion=false) {
      const g=new T.Group();g.name='sect-distant-floating-sanctuary';g.position.set(x,y,z);backdrop.add(g);
      g.userData.floatingMountain=true;g.userData.islandIndex=index;g.userData.islandRadius=size;g.userData.islandDepth=depth;g.userData.atmosphericDistance=distance;
      // These are four different rock structures, rather than one inverted
      // cone rescaled eight times. Split roots, leaning columns, broad broken
      // ridges and ledged cliffs each have their own recognisable outline.
      const kind=['split-roots','leaning-column','leaning-column','broken-ridge','broken-ridge','ledged-cliff','broken-ridge','split-roots'][index];
      g.userData.floatingMountainKind=kind;
      const n=12,angles=[0,.38,.91,1.25,1.94,2.38,2.93,3.31,3.91,4.28,5.08,5.67],positions=[],colors=[],summitTriangles=[];
      const air=new T.Color(distance>.6?0xe3edf0:0xc6dce4);
      const rockColors=[0x567782,0x668a93,0x86a4aa,0x6e8c94].map(color=>new T.Color(color).lerp(air,distance));
      const grass=new T.Color(0x638f70).lerp(air,distance*.80),moss=new T.Color(0x4e795b).lerp(air,distance*.82);
      const tri=(a,b,c,tone,summit=false)=>{positions.push(...a,...b,...c);for(let k=0;k<3;k++)colors.push(tone.r,tone.g,tone.b);if(summit)summitTriangles.push([a,b,c]);};
      const ridge=(px,pz)=>{
        const lobe=(cx,cz,rx,rz,high)=>Math.exp(-Math.pow((px/size-cx)/rx,2)-Math.pow((pz/size-cz)/rz,2))*high;
        return .08+size*(kind==='broken-ridge'?Math.max(lobe(-.38,-.10,.45,.39,.47),lobe(.43,.18,.33,.31,.29)):lobe(-.20,.08,.58,.43,kind==='leaning-column'?.44:.28));
      };
      function pillar(profile,{offsetX=0,offsetZ=0,lean=0,wideX=1,wideZ=.73,turn=0,cap=false}={}){
        const rings=[];
        for(const[level,wide]of profile){
          const ring=[];
          for(let i=0;i<n;i++){
            const a=angles[i]+index*.31+turn+Math.sin(level*4+index)*.035;
            const groove=i===(index+3)%n||i===(index+8)%n?.79:1;
            const r=(1+Math.sin(i*2.27+index*.9)*.13+Math.cos(i*.87+index)*.07)*groove;
            const px=Math.cos(a)*size*r*wide*wideX+size*(offsetX+lean*level),pz=Math.sin(a)*size*r*wide*wideZ+size*offsetZ+Math.sin(level*2+index)*size*.08*level;
            const py=level===0?ridge(px,pz):-depth*level+Math.sin(i*1.81+index)*size*.075;
            ring.push([px,py,pz]);
          }rings.push(ring);
        }
        for(let level=0;level<rings.length-1;level++)for(let i=0;i<n;i++){
          const j=(i+1)%n,tone=rockColors[(Math.floor(i/2)+index+(level===2&&i%5===0?1:0))%rockColors.length].clone();
          tone.lerp(air,level*.015);if(cap&&level===0)tone.lerp(moss,i%3===0?.50:.17);
          tri(rings[level][i],rings[level][j],rings[level+1][i],tone);tri(rings[level][j],rings[level+1][j],rings[level+1][i],tone);
        }
        if(cap){
          const inner=rings[0].map(point=>[point[0]*.48,ridge(point[0]*.48,point[2]*.48),point[2]*.48]),center=[0,ridge(0,0),0];
          for(let i=0;i<n;i++){
            const j=(i+1)%n,tone=grass.clone().multiplyScalar(.94+(i%3)*.03);
            tri(inner[i],rings[0][j],rings[0][i],tone,true);tri(inner[i],inner[j],rings[0][j],tone,true);tri(center,inner[j],inner[i],tone,true);
          }
        }
        const last=rings[rings.length-1],bottom=last.reduce((p,v)=>p.map((value,k)=>value+v[k]/n),[0,0,0]);
        bottom[1]-=size*.12;
        for(let i=0;i<n;i++)tri(bottom,last[i],last[(i+1)%n],rockColors[0]);
        return rings;
      }
      if(kind==='split-roots'){
        pillar([[0,1],[.10,1.04],[.29,.94],[.48,.80]],{lean:-.10,wideX:1.09,cap:true});
        pillar([[.39,.60],[.58,.55],[.79,.35],[1.02,.07]],{offsetX:-.35,offsetZ:-.04,lean:-.12,wideZ:.64});
        pillar([[.37,.48],[.52,.44],[.70,.25],[.83,.06]],{offsetX:.48,offsetZ:.11,lean:.16,wideZ:.66,turn:.3});
      }else if(kind==='ledged-cliff'){
        pillar([[0,.86],[.10,1.0],[.34,.94],[.40,1.11],[.47,.90],[.72,.77],[.92,.50],[1,.29]],{lean:.25,wideX:.95,cap:true});
      }else if(kind==='broken-ridge'){
        pillar([[0,.93],[.12,1.07],[.34,.98],[.53,.87],[.71,.60],[.88,.24],[.96,.07]],{lean:index%2?.26:-.24,wideX:1.27,wideZ:.61,cap:true});
      }else{
        pillar([[0,.81],[.14,1.0],[.38,.93],[.57,.65],[.70,.72],[.86,.42],[1,.14]],{lean:-.38,wideX:.86,wideZ:.67,cap:true});
      }
      const shell=coloredTerrain(g,'sect-floating-mountain-strata',positions,colors,-4);shell.userData.isFloatingRock=true;
      const summitHeight=(px,pz)=>{
        for(const[a,b,c]of summitTriangles){
          const d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-8)continue;
          const u=((b[2]-c[2])*(px-c[0])+(c[0]-b[0])*(pz-c[2]))/d,v=((c[2]-a[2])*(px-c[0])+(a[0]-c[0])*(pz-c[2]))/d;
          if(u>=0&&v>=0&&u+v<=1)return a[1]*u+b[1]*v+c[1]*(1-u-v);
        }return ridge(px,pz);
      };
      // The skyline carries recognisable, varied home-tree silhouettes. These
      // small forested summits give the surrounding pillars a readable scale.
      const count=distance>.45?3:4;
      for(let i=0;i<count;i++){
        const a=i*2.399+index*.51,r=size*(i===0?.12:.42),tx=Math.cos(a)*r,tz=Math.sin(a)*r*.66;
        const crown=tree(tx,tz,(.64+(i%3)*.13)*size/3.1,index*7+i+410,g,summitHeight(tx,tz)+.03,{lod:'far',speciesId:i%3===1?'verdantPine':'banyanTree',belt:'floating-crest'});
        if(crown){crown.scale.x*=1.65;crown.scale.z*=1.60;}
        crown?.traverse(item=>{if(item.isMesh&&!Array.isArray(item.material)){const old=item.material;item.material=material(old.color.clone().lerp(air,distance*.85),{side:old.side,vertexColors:old.vertexColors,roughness:.95});}});
      }
      for(let i=0;i<(distance>.6?2:4);i++){
        const a=i*1.91+index*.7,r=size*(.51+(i%2)*.14),px=Math.cos(a)*r,pz=Math.sin(a)*r*.68;
        const bush=mesh(g,new T.IcosahedronGeometry(size*(.12+i%2*.035),0),grass.clone().multiplyScalar(i%2?.88:1.04),px,summitHeight(px,pz)+size*.045,pz);
        bush.scale.set(1.55,.58,1.06);bush.rotation.y=a;
      }
      if(pavilion){const px=size*.27,pz=-size*.08,palace=skyPavilion(g,size*.19);palace.position.set(px,summitHeight(px,pz)+.07,pz);}
      for(let i=0;i<(distance>.5?1:2);i++){
        const a=.32+index*.81+i*2.5,px=Math.cos(a)*size*.94,pz=Math.sin(a)*size*.68,length=depth*(.28+i*.1);
        curve(g,[[px,summitHeight(px,pz),pz],[px*1.02,-length*.30,pz],[px*.88,-length*.72,pz+.10],[px*.83,-length,pz+.20]],.026,moss,4);
      }
      cloudBank(g,0,-depth*.52,size*.35,size*1.1,0xafc4df,.73);
      return g;
    }
    function layeredLandscape() {
      root.userData.landscapeKind={fengxia:'autumn-canyon',xuanyue:'moonlit-ridges',lingxi:'green-mountain-ranges',xinglan:'palaces-above-clouds'}[sectId];
      if(sectId==='fengxia'){
        for(const[x,y,z,w,d,h,s]of[[-16,-9,-44,10,8,30,3],[20,-12,-40,10,8,29,7]])mountain(x,y,z,w,d,h,[0xb6aba0,0xd3c7ae,0xbcae96],s);
        canyonWall(-1);canyonWall(1);
        cloudBank(backdrop,-15,-6,-24,2.9,0xe8d5b6,.27);
      }else if(sectId==='lingxi'){
        for(const[x,y,z,w,d,h,s]of[[-31,-22,-17,9,8,17,1],[-21,-22,-31,11,9,19,3],[-6,-24,-40,11,9,20,6],[13,-22,-38,11,9,18,8],[29,-23,-22,10,9,16,11]])mountain(x,y,z,w,d,h,[0xadc5b6,0xb9cebd,0x9fbdad],s);
        for(const[x,y,z,w,d,h,s]of[[-24,-12,-8,7,7,15,2],[-18,-14,-22,7,7,16,4],[-2,-15,-29,8,7,15,6],[17,-12,-26,8,7,17,8],[24,-14,-6,7,8,13,10]])mountain(x,y,z,w,d,h,[0x609879,0x8cb58a,0x467c61,0x9fc596],s);
        for(const[x,y,z,w,d,h,s]of[[-19,-7,3,4,5,7,3],[19,-9,-1,5,6,9,5],[-11,-8,-22,4,4,7,9]])mountain(x,y,z,w,d,h,[0x54894f,0x7ca368,0xa6c581],s);
        for(const[x,y,z,s]of[[-19,-3,-14,2.6],[1,-6,-28,3.5],[20,-6,-19,2.8]])cloudBank(backdrop,x,y,z,s,0xe5edda,.40);
      }else if(sectId==='xuanyue'){
        for(const[x,y,z,w,d,h,s]of[[-27,-18,-18,10,9,13,2],[-11,-19,-34,11,9,15,4],[12,-21,-35,12,10,15,7],[26,-17,-15,8,9,13,10]])mountain(x,y,z,w,d,h,[0x314a6a,0x405f81,0x537393],s);
        for(const[x,y,z,w,d,h,s]of[[-21,-10,-6,6,7,10,4],[-14,-13,-25,7,7,12,7],[20,-12,-20,8,8,12,9]])mountain(x,y,z,w,d,h,[0x284b62,0x365e73,0x477284],s);
        // Two intersecting arcs form the lit crescent itself. The unlit region
        // is empty geometry, so no dark disc can cover clouds or distant peaks.
        const radius=2.45,innerRadius=2.4,offset=1,joinX=(radius*radius-innerRadius*innerRadius+offset*offset)/(2*offset);
        const outerAngle=Math.acos(joinX/radius),innerAngle=Math.acos((joinX-offset)/innerRadius),segments=64,vertices=[];
        const arc=(r,start,shift,t)=>{const a=start+(Math.PI*2-2*start)*t;return[shift+Math.cos(a)*r,Math.sin(a)*r,0];};
        // Short strips across the lit arc avoid needle-thin fan triangles that
        // can expose antialiased seams in the software Canvas projection.
        for(let i=0;i<segments;i++){
          const a=arc(radius,outerAngle,0,i/segments),b=arc(radius,outerAngle,0,(i+1)/segments),c=arc(innerRadius,innerAngle,offset,(i+1)/segments),d=arc(innerRadius,innerAngle,offset,i/segments);
          if(i<segments-1)vertices.push(...a,...b,...c);if(i>0)vertices.push(...a,...c,...d);
        }
        const moonGeometry=new T.BufferGeometry();moonGeometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));moonGeometry.computeVertexNormals();moonGeometry.rotateZ(-.28);moonGeometry.computeBoundingSphere();geometry.add(moonGeometry);
        const moonMaterial=new T.MeshBasicMaterial({color:0xffe5ac,fog:false,toneMapped:false,transparent:true,side:T.DoubleSide,depthTest:true});ownedMaterials.add(moonMaterial);
        const moon=new T.Mesh(moonGeometry,moonMaterial);moon.name='sect-distant-moon';moon.position.set(-4.48,18,-22.08);backdrop.add(moon);
        const haloMaterial=new T.MeshBasicMaterial({color:0xffd69a,fog:false,toneMapped:false,transparent:true,opacity:.065,side:T.DoubleSide,depthTest:true,depthWrite:false});ownedMaterials.add(haloMaterial);
        const halo=new T.Mesh(moonGeometry,haloMaterial);halo.name='sect-moon-halo';halo.position.z=-.04;halo.scale.setScalar(1.12);moon.add(halo);
        for(const[x,y,z,s]of[[-19,-4,-15,2.8],[4,-7,-29,3.3],[20,-6,-16,2.8]])cloudBank(backdrop,x,y,z,s,0x7397ba,.35);
      }else{
        // Every summit is a complete detached mountain. Clear sky between the
        // main island and the distant pillars establishes height even when a
        // strong wind removes all clouds. Only two tiny scenic pavilions exist;
        // they never stand in for any of the player's construction projects.
        const islands=[
          [-43,7,-15,4.2,15.5,.20,false],[-34,3,-40,3.1,11.5,.38,false],
          [-17,2,-50,2.15,8.0,.72,false],[6,2,-53,2.55,9.1,.68,true],
          [29,9,-30,3.7,14.6,.35,false],[38,1,-5,4.1,15.2,.18,true],
          [-34,-4,13,3.4,11.6,.13,false],[33,-3.1,20,2.8,9.1,.20,false]
        ];
        islands.forEach(([x,y,z,size,depth,distance,pavilion],index)=>floatingSanctuary(x,y,z,size,depth,index,distance,pavilion));
        root.userData.floatingIslandCount=islands.length;
        for(const[x,y,z,s]of[[-34,-7,-39,6],[-9,-6,-59,7],[16,-5,-51,7],[37,-10,-13,6],[-33,-13,11,5],[25,-18,21,5],[0,-22,14,9]])cloudBank(backdrop,x,y,z,s,0xc1d1e9,.84);
      }
      backdrop.traverse(item=>{if(item.isMesh){
        item.castShadow=false;item.receiveShadow=false;item.userData.isLandscapeBackdrop=true;
        // The celestial sky is behind the distant ridges in both renderers.
        // Its real depth test still lets a foreground roof occlude it naturally.
        item.userData.softwareLayer=item.name==='sect-distant-moon'||item.name==='sect-moon-halo'?-5:-4;
      }});
    }
    function groundDetails() {
      const g=new T.Group();g.name='sect-pathside-stones';terrain.add(g);
      // Small stones belong along the worn path and at the lawn edge. Low turf
      // is already continuous on the terrain, so no pointed grass scatter here.
      for(let i=0;i<10;i++){
        const a=i*4.798,x=Math.cos(a)*(13.6+Math.sin(i*2.26)*1.1),z=Math.sin(a)*(15.5+Math.cos(i*2.74)*.8)-1.2,y=groundHeight(x,z)+.02;
        if(lake&&lakeSample(x,z).inside)continue;
        const stone=mesh(g,new T.IcosahedronGeometry(.20+(i*2)%3*.03,0),i%2?theme.stone:0xb6b99c,x+.3,y+.04,z-.18);stone.scale.set(1.35,.48,.78);stone.rotation.y=i*2;
      }
      for(let i=0;i<8;i++)for(const side of[-1,1]){const stone=mesh(g,new T.OctahedronGeometry(.09+(i%3)*.025,0),i%2?theme.pale:theme.stone,side*(1.73+(i%3)*.08),.27,3.2+i*1.25);stone.scale.set(1.40,.38,.70);stone.rotation.y=i*.8;}
      mergeDetails(g);
    }
    function seasonalGroundDetails() {
      if(sectId!=='fengxia'&&sectId!=='lingxi')return;
      const g=new T.Group();g.name=sectId==='fengxia'?'sect-autumn-leaf-litter':'sect-spring-wildflowers';terrain.add(g);
      const flatMesh=(positions,color)=>{
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
        const item=mesh(g,geo,color,0,0,0,{side:T.DoubleSide});item.castShadow=false;return item;
      };
      if(sectId==='fengxia'){
        // Small lobed leaves sit on the ground and remain visible in a still
        // frame; the independent effects layer supplies the airborne leaves.
        const outline=[[0,.60],[-.14,.30],[-.39,.43],[-.29,.14],[-.55,.10],[-.27,-.09],[-.34,-.30],[-.10,-.22],[0,-.45],[.10,-.22],[.34,-.30],[.27,-.09],[.55,.10],[.29,.14],[.39,.43],[.14,.30]];
        for(let i=0;i<36;i++){
          const a=i*2.399,front=i<18,x=front?(i%2?1:-1)*(1.82+(i%3)*.24):Math.cos(a)*(11.9+(i%3)*.65),z=front?10.75+(i%9)*.45:Math.sin(a)*(13.5+(i%4)*.35)-.8;
          const rotation=i*1.71,size=.34+(i%4)*.07,positions=[];
          const point=([u,v])=>{const xx=x+(u*Math.cos(rotation)-v*Math.sin(rotation))*size,zz=z+(u*Math.sin(rotation)+v*Math.cos(rotation))*size;return[xx,groundHeight(xx,zz)+.026,zz];};
          for(let j=0;j<outline.length;j++)positions.push(x,groundHeight(x,z)+.032,z,...point(outline[j]),...point(outline[(j+1)%outline.length]));
          flatMesh(positions,theme.leaf[i%3]);
        }
      }else{
        const colors=[0xf6e7aa,0xe8b6c9,0xe9efcf];
        for(let i=0;i<10;i++){
          const a=i*2.399,front=i<6,x=front?(i%2?1:-1)*(2.15+(i%3)*.30):Math.cos(a)*(12.4+(i%3)*.35),z=front?11.8+(i%3)*.65:Math.sin(a)*14.1-1.0;
          for(let j=0;j<2;j++){
            const xx=x+(j-1)*.27,zz=z+Math.sin(j*2+i)*.23,y=groundHeight(xx,zz),h=y+.22+(i+j)%3*.09,r=.14+(j%2)*.035,positions=[];
            rod(g,[xx,y+.02,zz],[xx+.035,h,zz],.014,theme.leaf[0]);
            for(let p=0;p<5;p++){
              const angle=p*Math.PI*2/5+i*.7,tip=[xx+Math.cos(angle)*r,h+.018,zz+Math.sin(angle)*r],left=[xx+Math.cos(angle-.55)*r*.63,h+.035,zz+Math.sin(angle-.55)*r*.63],right=[xx+Math.cos(angle+.55)*r*.63,h+.035,zz+Math.sin(angle+.55)*r*.63];
              positions.push(xx,h,zz,...left,...tip,xx,h,zz,...tip,...right);
            }
            flatMesh(positions,colors[(i+j)%3]);
            const heart=mesh(g,new T.OctahedronGeometry(.054,0),0xefc75d,xx,h+.035,zz);heart.scale.y=.45;
            flatMesh([xx,y+.09,zz,xx-.22,y+.16,zz+.05,xx-.08,y+.13,zz-.05,xx,y+.12,zz,xx+.22,y+.21,zz-.04,xx+.08,y+.17,zz+.06],theme.leaf[1]);
          }
        }
      }
      mergeDetails(g);
    }
    function stoneSurfaceDetails(){
      const positions=[],colors=[],joint=new T.Color(architecture.stone).lerp(new T.Color(architecture.ink),.55),worn=new T.Color(architecture.stone).lerp(new T.Color(theme.rock[1]),.24);
      const tri=(a,b,c,tone)=>{positions.push(...a,...b,...c);for(let i=0;i<3;i++)colors.push(tone.r,tone.g,tone.b);};
      function seam(x0,z0,x1,z1,y,width=.025){
        const dx=x1-x0,dz=z1-z0,length=Math.hypot(dx,dz),nx=-dz/length*width,nz=dx/length*width,a=[x0+nx,y,z0+nz],b=[x1+nx,y,z1+nz],c=[x0-nx,y,z0-nz],d=[x1-nx,y,z1-nz];tri(a,b,c,joint);tri(b,d,c,joint);
      }
      for(const[x0,x1,z0,z1,y,rows]of[[-12.35,12.35,-11.25,-4.52,2.254,4],[-12.0,12.0,-17.25,-11.67,4.504,3],[-4.08,7.38,-25.18,-17.30,7.104,4]]){
        const rowDepth=(z1-z0)/rows;
        for(let row=0;row<rows;row++){
          const z=z0+row*rowDepth;if(row)seam(x0,z,x1,z,y,.04);
          for(let x=x0+(row%2?1.02:2.05);x<x1-.25;x+=2.05)seam(x,z+.035,x,z+rowDepth-.035,y,.035);
        }
        for(let i=0;i<12;i++){
          const x=x0+(x1-x0)*(i+.35)/12,z=i%2?z0:z1,sign=i%2?1:-1,size=.10+(i%3)*.045;
          tri([x-size,y-.012,z],[x+size*.85,y-.012,z],[x+.03,y+.003,z+sign*size],worn);
        }
      }
      const details=coloredTerrain(terrain,'sect-stone-floor-joints-and-worn-edges',positions,colors,-.25);details.castShadow=false;
      details.material=makeMaterial(0xffffff,{vertexColors:true,side:T.DoubleSide},'architecture','stone');
    }
    function environment() {
      layeredLandscape();
      naturalTerrain();
      // The broad lower court keeps all six leader furnishing sites unobstructed.
      // Three separate flights climb from the unchanged shared forecourt to
      // the rear sanctuary. Landings, retaining walls and planted toe slopes
      // give every rise physical depth instead of moving the old island back.
      withArchitecture(()=>{
      const terrace=(name,x,z,w,d,base,top)=>{
        const g=new T.Group();g.name=name;g.userData.terrace={base,top,width:w,depth:d};terrain.add(g);
        box(g,w+.48,(top-base)*.48,d+.38,theme.stone,x,base+(top-base)*.24,z);
        box(g,w+.20,(top-base)*.52-.15,d+.16,theme.stone,x,base+(top-base)*.74-.075,z);
        box(g,w,.15,d,theme.pale,x,top-.075,z);mergeDetails(g);
      };
      terrace('sect-lower-processional-terrace',0,-10.95,25.2,13.0,.18,2.25);
      terrace('sect-middle-processional-terrace',0,-14.50,24.6,5.80,2.25,4.50);
      terrace('sect-high-sanctuary-terrace',1.65,-21.25,11.7,8.1,4.50,7.10);
      stairs(terrain,'sect-grand-lower-ascent',0,.80,-4.50,.24,2.25,4.55,17);
      stairs(terrain,'sect-grand-middle-ascent',0,-6.0,-11.60,2.25,4.50,4.65,19);
      stairs(terrain,'sect-grand-upper-ascent',1.65,-12.60,-17.25,4.50,7.10,4.20,18);
      for(let i=0;i<17;i++) if(!(sectId==='lingxi'&&i>=1&&i<=4)) {
        const z=14.45-i*.80;
        if(lake&&z>11.4)continue;
        if(z<2.35)break;
        const paving=box(terrain,2.95+Math.sin(i*1.7)*.14,.055,.62+Math.cos(i*1.3)*.06,i%2?0xd5d0af:theme.pale,Math.sin(i*1.1)*.06,.233,z);paving.rotation.y=Math.sin(i*1.3)*.035;
      }
      for(let i=0;i<(lake?0:12);i++){
        const z=15.45+i*.94,x=Math.sin(i*.61)*.42+(sectId==='lingxi'?-i*.11:i*.035),y=groundHeight(x,z);
        const step=box(terrain,1.82-i*.055,.045,.55+(i%3)*.06,i%3?theme.stone:theme.pale,x,y+.027,z);step.rotation.y=Math.sin(i*.8)*.13;
        step.rotation.x=-Math.atan2(groundHeight(x,z+.25)-groundHeight(x,z-.25),.5);
      }
      // Stone inlays make the entry court legible even at a distant camera angle.
      cylinder(terrain,3.55,3.55,.065,theme.pale,0,.24,9.0,sectId==='xinglan'?8:32);
      for(const r of [2.55,3.34])ring(terrain,r,.034,sectId==='xinglan'?0xe3c17b:0xafb794,0,.28,9.0);
      if(sectId==='xinglan')for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(terrain,[Math.cos(a)*1.35,.29,9.0+Math.sin(a)*1.35],[Math.cos(a)*3.1,.29,9.0+Math.sin(a)*3.1],.02,0xe3c17b);}
      for(const side of [-1,1]) for(let i=0;i<6;i++)box(terrain,1.25,.045,.77,theme.pale,side*(2.65+i*1.28),.232,-.55);
      balustrade(terrain,0,-4.34,24.2,2.25,'x',2.7);
      for(const x of [-12.20,12.20])balustrade(terrain,x,-7.85,6.55,2.25,'z');
      balustrade(terrain,0,-11.49,23.5,4.50,'x',2.7);
      for(const x of [-11.95,11.95])balustrade(terrain,x,-14.48,5.30,4.50,'z');
      balustrade(terrain,1.65,-17.10,10.9,7.10,'x',2.5);
      balustrade(terrain,1.65,-25.28,10.9,7.10,'x');
      for(const x of [-4.05,7.35])balustrade(terrain,x,-21.22,7.60,7.10,'z');
      corridor(-8.5,-9.65,6.6,2.26,0);corridor(9.55,-14.65,4.6,4.51,Math.PI/2);
      if(sectId==='fengxia'){
        const causeway=new T.Group();causeway.name='sect-deep-gorge-causeway';terrain.add(causeway);
        for(const side of[-1,1]){
          const points=[];for(let i=0;i<6;i++){const z=15.9+i*2.0,x=side*(2.4-i*.11),y=groundHeight(x,z);box(causeway,.17,.84,.17,theme.stone,x,y+.42,z);points.push([x,y+.77,z]);}
          curve(causeway,points,.05,theme.pale,10);
        }mergeDetails(causeway);
      }
      });
      stoneSurfaceDetails();
      stream();
      const positions=[[-14.5,-7],[-12.8,-12.2],[-9.7,-15.5],[-5.5,-16.7],[8.8,-15.2],[12.8,-11.8],[14.8,-6.5],[15.2,-1.4],[14.1,4.5],[-14,0],[-12.1,8.1],[10.6,11.8],[-8.7,12.9],[5.5,15.1]];
      if(sectId!=='lingxi'&&sectId!=='fengxia')positions.forEach(([x,z],i)=>tree(x,z,1.25+i%4*.15,i));
      groundDetails();
      seasonalGroundDetails();
      terrainDressing();
      for(const[x,z,s]of[[-15,1,.60],[15.3,1.8,.65],[8.3,-16.4,.76],[-10.7,12.1,.60]]){
        if(x>0){const stone=sceneryRock(terrain,x,z,s,3,groundHeight(x,z)+.04);stone.userData.isPathsideRock=true;}
        else{const stone=mesh(terrain,new T.IcosahedronGeometry(1,0),theme.stone,x,groundHeight(x,z)+s*.35,z);stone.scale.set(s,s*.7,s*.85);}
      }
      // Only the celestial ridge is suspended. Its stream spills from the
      // irregular rock edge; the three valleys continue into solid slopes.
      if(sectId==='xinglan')for(let i=0;i<4;i++){
        const height=4.4+i*.28,top=groundHeight(-19.1,16.2)+.06;
        const fall=box(terrain,.13+i*.025,height,.045,theme.water,-19.1-i*.07,top-height/2,16.2+i*.035);
        fall.rotation.z=-.035+i*.021;fall.material=material(theme.water,{transparent:true,opacity:.63,roughness:.42});
      }
      for(const[x,z,y]of[[-3.6,13.7,.22],[3.6,13.7,.22],[-4.3,2.5,.22],[4.3,2.5,.22],[-10.8,-5.1,2.25],[10.8,-5.1,2.25]]){
        const g=new T.Group();g.position.set(x,y,lake&&z>11?11.1:z);terrain.add(g);g.add(decorModel('stoneLantern'));g.scale.setScalar(.85);
      }
      // Low clouds frame the floating ridge; ground valleys have no island halo.
      if(sectId==='xinglan')for(const[x,y,z,s]of[[-18.6,-3.6,14.8,1.7],[20.8,-3.0,9.3,1.9],[2.0,-5.2,22.0,2.0],[-20.0,-4.8,-6.1,1.4]]){
        const cloud=cloudBank(terrain,x,y,z,s,0xf1f5f2,.36);cloud.name='sect-foreground-cloud-bank';
      }
      for(const slot of catalog.slots){const marker=mesh(markers,new T.RingGeometry(1.615,1.705,24),0xb9a262,slot.x,.255,slot.z,{side:T.DoubleSide});marker.rotation.x=-Math.PI/2;marker.castShadow=false;marker.receiveShadow=false;marker.visible=false;marker.userData.slotId=slot.id;slotObjects.set(slot.id,marker);anchors[slot.id]=new T.Vector3(slot.x,.35,slot.z);}
      root.userData.processionalAxis={flightCount:3,totalRise:6.86,startZ:.8,endZ:-25.3,courtyardUnchanged:true};
      mergeDetails(terrain);
    }
    function courtyardScenery(id) {
      // These three catalogue items are displayed at courtyard scale. Their
      // bespoke meshes retain the defining details without importing house-view
      // tile channels, hidden snow caps or hundreds of subdivisions per petal.
      const definition=global.SpiritHomestead?.getScenery(id),model=new T.Group(),g=new T.Group();model.add(g);
      if(id==='jadePavilion'){
        box(g,2.74,.15,2.48,0xcbd0b4,0,.075,0);box(g,2.47,.12,2.22,0xe4dfc4,0,.21,0);
        for(const x of[-1,1])for(const z of[-.85,.85]){
          cylinder(g,.075,.10,1.66,0xdde0c8,x,1.11,z,6);box(g,.28,.10,.27,0xa7b9a2,x,.33,z);
          box(g,.32,.08,.16,0x9cb59e,x,1.98,z);box(g,.16,.08,.34,0xb7c8ac,x,2.06,z);
        }
        for(const z of[-.85,.85])box(g,2.15,.12,.13,0xa5b59b,0,1.97,z);
        for(const x of[-1,1]){
          box(g,.07,.06,1.75,0xc1cbb0,x,.86,0);box(g,.06,.045,1.75,0xaabd9f,x,.58,0);
          for(const z of[-.60,0,.60])rod(g,[x,.53,z],[x,.88,z],.025,0xd7dbc0);
        }
        box(g,2,.06,.07,0xc1cbb0,0,.86,-.85);
        for(const x of[-.65,0,.65])rod(g,[x,.53,-.85],[x,.88,-.85],.025,0xd7dbc0);
        for(const [base,extent,height]of[[1.94,1.46,1.03],[2.63,.77,.68]]){
          const positions=[],colors=[],baseColor=new T.Color(0x6e9b83),highlight=new T.Color(0xb2cbb0);
          const point=(side,t,u)=>{const r=extent*(.06+.94*t),along=u*r,y=base+height*(Math.pow(1-t,1.65)+.15*Math.pow(t,4)+.14*Math.pow(t,3)*u*u);return side===0?[along,y,r]:side===1?[r,y,-along]:side===2?[-along,y,-r]:[-r,y,along];};
          for(let side=0;side<4;side++){
            for(let row=0;row<3;row++)for(let col=0;col<3;col++){
              const t=row/3,u=col/3*2-1,a=point(side,t,u),b=point(side,t+1/3,u),c=point(side,t,u+2/3),d=point(side,t+1/3,u+2/3),tone=baseColor.clone().lerp(highlight,col%2?.11:.03);
              positions.push(...a,...b,...c,...c,...b,...d);for(let v=0;v<6;v++)colors.push(tone.r,tone.g,tone.b);
            }
            const ridge=[0,.45,.78,1].map(t=>{const p=point(side,t,-1);p[1]+=.035;return p;});
            curve(g,ridge,.029,0xd0bd7f,3);
          }
          const roof=coloredTerrain(g,'sect-courtyard-double-eave',positions,colors,0);delete roof.userData.softwareLayer;
        }
        cylinder(g,.04,.10,.24,0xc9b87e,0,3.37,0,5);mesh(g,new T.OctahedronGeometry(.10,0),0xf0dca0,0,3.53,0);
        for(const x of[-1.02,1.02]){
          rod(g,[x,1.97,.88],[x,1.64,.88],.012,0x8c8059);
          const lamp=mesh(g,new T.OctahedronGeometry(.13,0),0xf3d28c,x,1.60,.88,{emissive:0xffca6c,emissiveIntensity:.16});lamp.scale.y=1.35;
        }
        box(g,1.0,.10,.43,0xcbd0b4,0,.07,1.34);box(g,1.1,.08,.40,0xb5c2a8,0,.02,1.66);
        cylinder(g,.30,.26,.13,0xc3c8ab,0,.61,0,6);cylinder(g,.08,.12,.29,0x9eae92,0,.40,0,5);
        for(const[x,z]of[[.10,.02],[-.14,.05]])cylinder(g,.045,.04,.07,0xf0e8cb,x,.71,z,4);
      }else if(id==='lotusPond'){
        const basin=cylinder(g,1.27,1.32,.13,0xa6b8a5,0,.065,0,16);basin.scale.z=1.27;
        const rim=mesh(g,new T.TorusGeometry(1.21,.067,3,20),0xdce0c6,0,.15,0);rim.rotation.x=-Math.PI/2;rim.scale.y=1.27;
        const water=mesh(g,new T.CircleGeometry(1.16,20),0x72b2a6,0,.14,0,{roughness:.32,side:T.DoubleSide});water.rotation.x=-Math.PI/2;water.scale.y=1.27;
        for(let i=0;i<8;i++){const a=i*Math.PI/4,stone=mesh(g,new T.OctahedronGeometry(.14+(i%3)*.025,0),0xbdc8af,Math.cos(a)*1.30,.12,Math.sin(a)*1.62);stone.scale.set(1,.55,.8);}
        for(const[x,z,r]of[[-.55,-.52,.29],[.61,.25,.27],[-.25,.83,.31]]){
          const positions=[];for(let i=0;i<9;i++){const a=.24+i*(Math.PI*2-.48)/9,b=.24+(i+1)*(Math.PI*2-.48)/9;positions.push(x,.16,z,x+Math.cos(a)*r,.16,z+Math.sin(a)*r,x+Math.cos(b)*r,.16,z+Math.sin(b)*r);}
          const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();mesh(g,geo,0x619c80,0,0,0,{side:T.DoubleSide});
        }
        for(const[x,z,r]of[[-.24,-.47,.30],[.43,-.02,.24],[-.22,.58,.27]]){
          const positions=[],colors=[];
          for(let tier=0;tier<2;tier++)for(let petal=0;petal<(tier?3:5);petal++){
            const angle=petal*Math.PI*2/(tier?3:5)+tier*.48,length=r*(tier?.73:1),point=(u,t)=>[x+Math.cos(angle)*t*length-Math.sin(angle)*u*length,.18+t*t*length*.60+tier*.045,z+Math.sin(angle)*t*length+Math.cos(angle)*u*length];
            const a=point(0,0),b=point(-.32,.55),c=point(0,1),d=point(.32,.55),m=point(0,.52),tone=new T.Color(tier?0xffebd9:0xe9b5b4);
            positions.push(...a,...b,...m,...b,...c,...m,...c,...d,...m,...d,...a,...m);for(let v=0;v<12;v++)colors.push(tone.r,tone.g,tone.b);
          }
          const flower=coloredTerrain(g,'sect-courtyard-lotus',positions,colors,0);delete flower.userData.softwareLayer;mesh(g,new T.OctahedronGeometry(.06,0),0xe6cb78,x,.27,z);
        }
        for(const radius of[.50,.91]){const ripple=mesh(g,new T.RingGeometry(radius,radius+.013,18),0xc8e4d0,0,.155,0,{side:T.DoubleSide});ripple.rotation.x=-Math.PI/2;ripple.scale.y=1.25;}
      }else{
        const branchColor=0x87735f,pink=[0xeab6b1,0xf1cbbb,0xf8dccc];
        rod(g,[0,0,0],[.08,1.55,0],.13,branchColor);
        const clusters=[[-.68,1.84,.14,.58],[.71,2.06,-.10,.63],[-.10,2.35,-.34,.65],[0,2.08,.48,.59],[-.71,2.27,-.34,.47],[.50,2.47,-.35,.48]];
        for(let i=0;i<clusters.length;i++){
          const[x,y,z,r]=clusters[i];rod(g,[.06,.83+i*.13,0],[x*.80,y-.15,z*.80],.055,branchColor);rod(g,[x*.80,y-.15,z*.80],[x,y+.10,z],.024,branchColor);
          const crown=mesh(g,new T.IcosahedronGeometry(r,0),pink[i%3],x,y,z);crown.scale.set(1,.68,.85);crown.rotation.y=i*.93;
          for(let k=0;k<3;k++){const a=k*2.1+i,blossom=mesh(g,new T.OctahedronGeometry(.16,0),pink[(i+k+1)%3],x+Math.cos(a)*r*.75,y+.20+(k%2)*.12,z+Math.sin(a)*r*.61);blossom.scale.set(1,.38,1);}
        }
        for(let i=0;i<13;i++){const petal=mesh(g,new T.PlaneGeometry(.10,.07),pink[i%3],Math.sin(i*2.4)*.98,.014,Math.cos(i*1.7)*.90,{side:T.DoubleSide});petal.rotation.x=-Math.PI/2;petal.rotation.z=i;}
      }
      mergeDetails(g);g.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(g),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),footprint=definition?.footprint||{width:3,depth:3.4};
      const scale=Math.min(1,footprint.width*.985/size.x,footprint.depth*.985/size.z);g.scale.setScalar(scale);g.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      model.userData.homesteadId=id;model.userData.homesteadKind='scenery';model.userData.landmarkName=definition?.name||catalog.getItem(id)?.name||id;
      model.userData.footprint={...footprint};model.userData.modelBounds={width:size.x*scale,height:size.y*scale,depth:size.z*scale};model.userData.renderDetail='sect-courtyard';return model;
    }
    function decorModel(id) {
      return withArchitecture(()=>{
      if (['blossomTree','lotusPond','jadePavilion'].includes(id)) return courtyardScenery(id);
      const g = new T.Group();
      if (id === 'stoneLantern') {
        cylinder(g,.40,.48,.13,theme.stone,0,.065,0,8); cylinder(g,.11,.16,.82,theme.stone,0,.52,0,8);
        box(g,.53,.15,.53,theme.pale,0,.97,0);
        mesh(g,new T.BoxGeometry(.36,.43,.36),0xf3d28c,0,1.25,0,{emissive:0xffca6c,emissiveIntensity:.025});
        for (const x of [-.19,.19]) for (const z of [-.19,.19]) box(g,.045,.47,.045,theme.wood,x,1.25,z);
        cylinder(g,.12,.50,.24,theme.roof,0,1.59,0,4); cylinder(g,.045,.10,.16,theme.pale,0,1.79,0,6);
      } else if (id === 'bambooFence') {
        for (let i=0;i<7;i++) cylinder(g,.047,.06,.92+(i%2)*.14,theme.wood,(i-3)*.29,.57,0,6);
        for (const y of [.48,.85]) rod(g,[-1.03,y,.05],[1.03,y,.05],.045,theme.leaf[1]);
        for (let i=0;i<7;i++) rod(g,[(i-3)*.29-.04,.77,.09],[(i-3)*.29+.04,.91,.09],.014,theme.pale);
      } else if (id === 'sectBanner') {
        cylinder(g,.24,.34,.14,theme.stone,0,.07,0,8); cylinder(g,.04,.065,2.5,theme.wood,0,1.32,0,8);
        rod(g,[-.15,2.36,0],[1.13,2.36,0],.038,theme.pale);
        box(g,.94,1.45,.055,theme.roof,.51,1.57,0); box(g,.72,1.19,.018,theme.pale,.51,1.59,.038);
        box(g,.60,1.06,.02,theme.wood,.51,1.59,.055); const emblem=mesh(g,new T.OctahedronGeometry(.20,0),theme.pale,.51,1.7,.09); emblem.scale.set(1,1.35,.22);
        cylinder(g,.09,.09,.09,theme.pale,0,2.62,0,8);
      }
      mergeDetails(g); return g;
      });
    }
    function constructionState(data, id) {
      const stage=data?.stages?.find(item=>item.id===id);
      if(typeof global.SpiritSects.constructionState==='function')return global.SpiritSects.constructionState(stage,!!data?.authoritative);
      // Older scripts have no material ledger. A full planning illustration is
      // honest here; silently interpreting a missing ledger as 0% would not be.
      const completed=!!(data?.authoritative&&stage?.completed);
      return {phase:completed?'completed':'preview',label:completed?'已竣工':'规划预览',ratio:completed?1:0,percent:completed?100:0,donated:0,target:0};
    }
    function statusFor(state) { return state.phase==='completed'?'completed':['preview','planned'].includes(state.phase)?'planned':'building'; }
    function stageStatus(data, id) { return statusFor(constructionState(data,id)); }

    // Clip the *real triangles*, not just a WebGL material plane: Canvas users
    // see the same partial structure. Interpolated cut edges retain vertex
    // colours and keep pillars vertical rather than squashing an entire palace.
    function revealModelToHeight(model, height) {
      model.updateMatrixWorld(true);
      const inverse=new T.Matrix4().copy(model.matrixWorld).invert(),meshes=[];
      model.traverse(item=>{if(item.isMesh&&item.geometry?.attributes.position)meshes.push(item);});
      for(const item of meshes){
        const old=item.geometry,attribute=old.attributes.position,source=attribute.array,sourceColors=old.attributes.color?.array,index=old.index?.array;
        const transform=new T.Matrix4().multiplyMatrices(inverse,item.matrixWorld),worldY=new Float32Array(attribute.count),point=new T.Vector3();
        for(let i=0;i<attribute.count;i++)worldY[i]=point.fromBufferAttribute(attribute,i).applyMatrix4(transform).y;
        const positions=[],colors=[],count=index?index.length:attribute.count;
        const vertex=i=>({p:[source[i*3],source[i*3+1],source[i*3+2]],y:worldY[i],c:sourceColors?[sourceColors[i*3],sourceColors[i*3+1],sourceColors[i*3+2]]:null});
        const cross=(a,b)=>{const t=clamp((height-a.y)/(b.y-a.y),0,1);return{p:a.p.map((v,k)=>v+(b.p[k]-v)*t),y:height,c:a.c?a.c.map((v,k)=>v+(b.c[k]-v)*t):null};};
        for(let offset=0;offset<count;offset+=3){
          const input=[vertex(index?index[offset]:offset),vertex(index?index[offset+1]:offset+1),vertex(index?index[offset+2]:offset+2)],polygon=[];
          for(let i=0;i<3;i++){
            const a=input[i],b=input[(i+1)%3],insideA=a.y<=height,insideB=b.y<=height;
            if(insideA)polygon.push(a);if(insideA!==insideB)polygon.push(cross(a,b));
          }
          for(let i=1;i<polygon.length-1;i++)for(const v of[polygon[0],polygon[i],polygon[i+1]]){positions.push(...v.p);if(v.c)colors.push(...v.c);}
        }
        old.dispose();geometry.delete(old);
        if(!positions.length){item.removeFromParent();continue;}
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        if(colors.length===positions.length)geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
        geo.computeVertexNormals();geo.computeBoundingBox();geo.computeBoundingSphere();geometry.add(geo);item.geometry=geo;
      }
    }
    function constructionSite(parent, bounds, state) {
      const g=new T.Group();g.name='sect-construction-'+state.phase;g.position.set(bounds.centerX,0,bounds.centerZ);parent.add(g);
      const w=bounds.width+.42,d=bounds.depth+.34,phase=state.phase;
      if(phase==='planned')box(g,w,.025,d,0xb8b6a0,0,.016,0);
      const posts=phase==='preview'?.34:phase==='foundation'?.61:.43;
      for(const x of[-w/2,w/2])for(const z of[-d/2,d/2])cylinder(g,.045,.066,posts,theme.wood,x,posts/2,z,6);
      for(const z of[-d/2,d/2])rod(g,[-w/2,.28,z],[w/2,.28,z],.022,theme.pale);
      for(const x of[-w/2,w/2])rod(g,[x,.28,-d/2],[x,.28,d/2],.022,theme.pale);
      if(phase==='preview'||phase==='planned'){mergeDetails(g);return;}
      for(let i=0;i<(phase==='finishing'?2:5);i++){
        const stone=box(g,.48,.20,.34,i%2?theme.stone:theme.pale,-w/2+.54+(i%3)*.52,.10+Math.floor(i/3)*.2,d/2+.37);stone.rotation.y=(i%3-1)*.09;
      }
      if(phase==='foundation'){
        for(let i=0;i<3;i++)rod(g,[w/2-.8,.12,d/2-.8+i*.18],[w/2-.8,.12,-d/2+.7+i*.18],.071,theme.wood);
        mergeDetails(g);return;
      }
      const height=Math.max(1.25,bounds.height*(phase==='framing'?.70:phase==='roofing'?.94:.98));
      const levels=Math.max(2,Math.min(4,Math.ceil(height/2))),sides=phase==='finishing'?[1]:[-1,1];
      for(const side of sides){
        const x=side*(w/2+.12);
        for(const z of[-d/2-.10,d/2+.10])rod(g,[x,.07,z],[x,height,z],.058,0x9e8154);
        for(let level=1;level<=levels;level++){
          const y=height*level/levels;rod(g,[x,y,-d/2-.15],[x,y,d/2+.15],.046,0x9e8154);
          box(g,.37,.065,d+.36,0xbca172,x,y-.06,0);
        }
        rod(g,[x,.25,-d/2],[x,height*.86,d/2],.033,0xbba277);
        if(phase!=='finishing')rod(g,[x,.25,d/2],[x,height*.86,-d/2],.033,0xbba277);
      }
      if(phase==='framing'){
        // A visible beam at the top of the rising frame makes 25% recognisably
        // different from a completed model with merely a different tint.
        for(const z of[-d*.33,d*.33])rod(g,[-w*.43,height*.82,z],[w*.43,height*.82,z],.085,theme.wood);
      }else if(phase==='roofing'){
        for(let i=0;i<4;i++)box(g,.56,.055,.44,theme.roof,w/2-.65,.05+i*.065,d/2+.37);
      }else{
        cylinder(g,.16,.13,.26,theme.pale,w/2+.44,.14,d/2-.24,8);
        rod(g,[w/2+.12,height-.48,d/2],[w/2+.12,height,d/2],.025,theme.wood);
      }
      mergeDetails(g);
    }
    function setStages(data) {
      const next=school.stages.map(stage=>[stage.id,constructionState(data,stage.id)]);
      const key=JSON.stringify(next.map(([id,state])=>[id,state.phase,state.percent,state.donated,state.target]));
      for(const[id,state]of next)stageStates[id]=state;
      if(key===stateKey)return false;stateKey=key;
      for(const[id,state]of next){
        const geometryKey=state.phase;
        // Material updates within one phase change the percentage without
        // repeatedly discarding and rebuilding thousands of architectural faces.
        if(stageGeometryKeys.get(id)===geometryKey){if(stageObjects[id])stageObjects[id].userData.construction=state;continue;}
        if(stageObjects[id])release(stageObjects[id]);delete stageObjects[id];stageGeometryKeys.set(id,geometryKey);moonHorizon=null;
        const p=STAGE_POSITIONS[id],grand=typeof global.createSpiritGrandSectModel==='function';
        const model=(grand?global.createSpiritGrandSectModel:global.createSpiritSectModel)?.({THREE:T,material:(color,extra)=>architectureMaterial(color,extra,state.phase==='preview'),mergeDetails,sectId,stage:id});
        if(!model)continue;
        register(model);model.updateMatrixWorld(true);
        const localBounds=new T.Box3().setFromObject(model),size=localBounds.getSize(new T.Vector3()),center=localBounds.getCenter(new T.Vector3()),scale=grand?p.scale:p.scale*2.55;
        const object=new T.Group();object.name='sect-'+id+'-'+state.phase;object.position.set(p.x,p.y,p.z);object.userData.visitStage=id;object.userData.buildStatus=statusFor(state);object.userData.buildPhase=state.phase;object.userData.construction=state;
        // stageObjects historically exposed the landmark itself. Preserve its
        // identity on the new construction wrapper for inspectors and callers.
        object.userData.sectId=sectId;object.userData.sectStage=id;
        object.userData.landmarkName=model.userData.landmarkName||school.stages.find(stage=>stage.id===id)?.name||id;
        object.userData.blenderSource=!!model.userData.blenderSource;
        object.userData.fullModelHeight=size.y*scale;object.userData.modelBounds={width:size.x*scale,height:size.y*scale,depth:size.z*scale};
        const bounds={width:size.x*scale,depth:size.z*scale,height:size.y*scale,centerX:center.x*scale,centerZ:center.z*scale};
        if(state.phase==='planned')release(model);
        else{
          const fraction={foundation:.15,framing:.55,roofing:.87,finishing:.985}[state.phase];
          if(fraction)revealModelToHeight(model,localBounds.min.y+size.y*fraction);
          model.scale.setScalar(scale);object.add(model);
        }
        if(state.phase!=='completed')constructionSite(object,bounds,state);
        landmarks.add(object);stageObjects[id]=object;object.updateMatrixWorld(true);
        const actualBounds=new T.Box3().setFromObject(object);
        anchors[id]=new T.Vector3(p.x+center.x*scale,Math.max(p.y+1.15,actualBounds.max.y+.40),p.z+center.z*scale);
      }
      return true;
    }
    function setLayout(value) {
      const layout = copyLayout(value).filter(entry=>catalog.getSlot(entry.slotId)&&catalog.getItem(entry.itemId)), key=JSON.stringify(layout);
      if (key===layoutKey) return false; layoutKey=key;moonHorizon=null;
      for(const child of [...furniture.children])release(child);
      for(const entry of layout) {
        const site=catalog.getSlot(entry.slotId), object=decorModel(entry.itemId); object.name='sect-slot-'+entry.slotId; object.userData.slotId=entry.slotId; object.userData.itemId=entry.itemId;
        object.position.set(site.x,.22,site.z); object.rotation.y=(catalog.rotations.includes(entry.rotation)?entry.rotation:0)*Math.PI/180; furniture.add(object);
      }
      return true;
    }
    function setEditing(value,slotId) {
      slotId=slotId||'';if(editing===!!value&&selectedSlot===slotId)return false; editing=!!value;selectedSlot=slotId;moonHorizon=null;
      for(const [id,marker] of slotObjects){marker.visible=editing;marker.material=material(id===selectedSlot?0xffd27b:0xa5b487,{roughness:.75});marker.scale.setScalar(id===selectedSlot?1.04:1);}
      return true;
    }
    environment();setDaylight(DEFAULT_DAYLIGHT);
    return {
      root, lake, anchors, stageObjects, stageStatus, setStages, setLayout, setEditing, setDaylight, setWeather, faceCamera, positions:STAGE_POSITIONS,
      getDaylight(){return {...daylightState};},
      getWeather(){return {...weatherState};},
      dispose() { if(destroyed)return;destroyed=true;for(const geo of geometry)geo.dispose();for(const mat of new Set([...materials.values(),...ownedMaterials]))mat.dispose();geometry.clear();materials.clear();materialRecords.clear();ownedMaterials.clear();surfaceTriangles.length=0;moonHorizon=null;root.removeFromParent(); },
      getStatus(id){return stageObjects[id]?.userData.buildStatus||'planned';},
      getConstructionState(id){return stageStates[id]||{phase:'preview',label:'规划预览',ratio:0,percent:0,donated:0,target:0};}
    };
  };

  global.createSpiritSectVisitScene = function (options) {
    const T=global.THREE,container=options.container;
    if(!T||!container||typeof global.createSpiritSectVisitLandscape!=='function')return {supported:false,update(){},setDaylight(){return false;},setWeather(){return false;},destroy(){}};
    let renderer;
    try{renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}
    catch(_){try{renderer=global.createSpiritSceneRenderer?.(T);}catch(_){}}
    if(!renderer)return {supported:false,update(){},setDaylight(){return false;},setWeather(){return false;},destroy(){}};
    const scene=new T.Scene(),camera=new T.OrthographicCamera(-21,21,16,-16,.1,180),raycaster=new T.Raycaster();
    const canvas=renderer.domElement;canvas.className='sect-visit-canvas';canvas.dataset.renderer=renderer.isSoftware?'canvas':'webgl';canvas.setAttribute('role','img');canvas.setAttribute('aria-label','可旋转、缩放的宗门三维山景');canvas.tabIndex=0;
    container.appendChild(canvas);
    const labels=document.createElement('div');labels.className='sect-visit-labels';labels.setAttribute('aria-hidden','true');container.appendChild(labels);
    const labelNodes={};
    for(const id of ['gate','spring','library']) {const node=document.createElement('span');node.className='sect-visit-label';const title=document.createElement('b'),state=document.createElement('small');node.append(title,state);labels.appendChild(node);labelNodes[id]={node,title,state};}
    renderer.setPixelRatio(Math.min(global.devicePixelRatio||1,renderer.isSoftware?1.2:1.7));renderer.setClearColor?.(0xeee8cd,0);renderer.outputColorSpace=T.SRGBColorSpace;
    if(!renderer.isSoftware){renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;}
    const hemisphere=new T.HemisphereLight(0xffefd3,0x698063,2.1);scene.add(hemisphere);
    const sun=new T.DirectionalLight(0xffedcc,2.6);sun.position.set(-15,26,16);sun.castShadow=!renderer.isSoftware;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.normalBias=.05;scene.add(sun);
    const fill=new T.DirectionalLight(0xf4f1da,.6);fill.position.set(8,7,-5);scene.add(fill);
    let landscape=null,effects=null,lakeEffects=null,sectId='',disposed=false,raf=0,width=1,height=1,angle=.48,elevation=.70,zoom=1,focusId='overview',editing=false,lastData=null;
    let daylightState={...DEFAULT_DAYLIGHT},daylightKey='',lightingKey='',weatherState={...DEFAULT_WEATHER},weatherKey='';
    const target=new T.Vector3(0,3.8,-5.5),pointer=new Map();let drag=null,touchGesture=null,touchMultiple=false;
    const reduced=global.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let observer=null,visible=true;
    const schedule=()=>{if(!disposed&&!raf&&visible)raf=global.requestAnimationFrame(render);};
    function applyDaylight(){
      const id=sectId||'lingxi',d=daylightState.daylight,night=1-d,key=id+':'+daylightState.phaseId+':'+Math.round(d*120);
      if(key===lightingKey)return false;lightingKey=key;
      const mood=LIGHTING[id],sky=SKY_COLORS[id],mixed=(a,b)=>new T.Color(a).lerp(new T.Color(b),d);
      const skyColors=sky.night.map((color,index)=>mixed(color,sky.day[index]));
      if(daylightState.phaseId==='dawn'||daylightState.phaseId==='dusk')skyColors[2].lerp(new T.Color(daylightState.phaseId==='dawn'?0xffd6a1:0xeeb781),Math.sin(d*Math.PI)*.55);
      container.dataset.dayPhase=daylightState.phaseId;container.dataset.daylight=String(d);
      const glowAlpha=Math.round((.12+.88*d)*255).toString(16).padStart(2,'0');
      const properties={'--sect-daylight':String(d),'--sect-night-factor':String(night),'--sect-sky-top':'#'+skyColors[0].getHexString(),'--sect-sky-bottom':'#'+skyColors[1].getHexString(),'--sect-sky-glow':'#'+skyColors[2].getHexString()+glowAlpha};
      for(const[name,value]of Object.entries(properties))container.style.setProperty?.(name,value);
      hemisphere.color.copy(mixed(0xb1c2d9,mood.sky));hemisphere.groundColor.copy(mixed(0x46535c,mood.ground));hemisphere.intensity=.84+(mood.ambient-.84)*d;
      sun.color.copy(mixed(0xd9e7ff,mood.sun));sun.intensity=.75+(mood.key-.75)*d;sun.position.set(-15,26,-24+40*d);
      // A warm, low front fill keeps red wood and gold trim readable at night;
      // the stronger directional key still separates roofs, walls and eaves.
      fill.color.copy(mixed(0xffd9b3,mood.fill));fill.intensity=.65+(mood.bounce-.65)*d;fill.position.set(8,15-8*d,24-29*d);
      if(!scene.fog)scene.fog=new T.Fog(mood.fog,70,135);scene.fog.color.copy(mixed(sky.night[1],mood.fog));
      if(renderer.isSoftware)renderer.setLighting?.({direction:[-15,26,-24+40*d],ambient:.27+.12*d,diffuse:.36+.28*d,upLight:.08+.02*d});
      else renderer.toneMappingExposure=.98+(mood.exposure-.98)*d;
      renderer.invalidate?.();schedule();return true;
    }
    function setDaylight(state){
      if(disposed)return false;
      const next=normalizeDaylight(state),key=next.phaseId+':'+Math.round(next.daylight*120);daylightState=next;
      // Clock text may advance inside one lighting bucket. It does not create
      // new meshes, touch the camera, or start a second animation loop.
      if(key===daylightKey)return false;daylightKey=key;
      landscape?.setDaylight(next);effects?.setDaylight?.(next);lakeEffects?.setDaylight?.(next);applyDaylight();return true;
    }
    function setWeather(state){
      if(disposed)return false;const next=normalizeWeather(state),key=JSON.stringify(next);weatherState=next;
      if(key===weatherKey)return false;weatherKey=key;
      const changed=landscape?.setWeather(next);effects?.setWeather?.(next);lakeEffects?.setWeather?.(next);
      if(changed){renderer.invalidate?.();schedule();}return true;
    }
    // A little sky above Xuanyue's rear pavilion keeps the moon separate from
    // its roof while retaining the lake across the foreground.
    function overview(){target.set(0,sectId==='xuanyue'?10:sectId==='xinglan'?0:3.8,sectId==='xuanyue'?0:sectId==='xinglan'?-4:-5.5);zoom=sectId==='xuanyue'?.82:sectId==='fengxia'?.86:sectId==='xinglan'?.64:.92;}
    function updateCamera(){const radius=55;camera.position.set(target.x+Math.sin(angle)*Math.cos(elevation)*radius,target.y+Math.sin(elevation)*radius,target.z+Math.cos(angle)*Math.cos(elevation)*radius);camera.lookAt(target);const aspect=width/height,span=Math.max(18.8,20.4/aspect)/zoom;camera.left=-span*aspect;camera.right=span*aspect;camera.top=span+1.25;camera.bottom=-span;camera.updateProjectionMatrix();landscape?.faceCamera(camera,width,height);renderer.invalidate?.();effects?.invalidate();lakeEffects?.invalidate();schedule();}
    function resize(){if(disposed)return;const box=container.getBoundingClientRect();if(box.width<1||box.height<1)return;width=box.width;height=box.height;renderer.setSize(width,height,false);effects?.resize(width,height);lakeEffects?.resize(width,height);updateCamera();}
    function render(){
      raf=0;if(disposed||!visible)return;renderer.render(scene,camera);if(!landscape)return;
      const moon=sectId==='xuanyue'?landscape.root.getObjectByName('sect-distant-moon'):null;
      const lunar=moon?.visible?moon.getWorldPosition(new T.Vector3()).project(camera):null;
      const moonScreen=lunar&&lunar.z>=-1&&lunar.z<=1?{
        x:(lunar.x*.5+.5)*width,y:(.5-lunar.y*.5)*height,
        rx:3.15*moon.scale.x*width/(camera.right-camera.left),ry:3.15*moon.scale.y*height/(camera.top-camera.bottom)
      }:null;
      for(const id of ['gate','spring','library']){
        const p=landscape.anchors[id],node=labelNodes[id]?.node;if(!p||!node)continue;
        const projected=p.clone().project(camera),x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
        node.hidden=projected.z>1||x<10||x>width-10||y< -20||y>height-8;
        const halfWidth=(node.offsetWidth||110)/2,labelHeight=node.offsetHeight||46;
        let labelX=clamp(x,halfWidth+10,width-halfWidth-10),labelY=Math.max(labelHeight+12,y);
        // Keep the moon and its immediate halo clear when the finished rear
        // pavilion's caption rises into the same patch of night sky.
        if(id==='library'&&moonScreen&&labelX+halfWidth>moonScreen.x-moonScreen.rx-8&&labelX-halfWidth<moonScreen.x+moonScreen.rx+8&&labelY>moonScreen.y-moonScreen.ry-8&&labelY-labelHeight<moonScreen.y+moonScreen.ry+8){
          labelX=clamp(moonScreen.x-moonScreen.rx-halfWidth-12,halfWidth+10,width-halfWidth-10);
          labelY=Math.max(labelHeight+12,Math.min(labelY,moonScreen.y+moonScreen.ry*.3));
        }
        node.style.transform=`translate(${Math.round(labelX)}px,${Math.round(labelY)}px) translate(-50%,-100%)`;
      }
    }
    function focus(id){if(!landscape)return;focusId=id;const p=landscape.anchors[id];if(id==='overview'||!p){overview();}else{const base=STAGE_POSITIONS[id];if(base){target.set(base.x,base.y+(p.y-base.y)*.47,base.z);zoom=id==='gate'?2.25:2.35;}else{target.set(p.x,1.5,p.z);zoom=1.85;}}updateCamera();}
    function orbit(direction){angle+=Number(direction)*.20;updateCamera();}
    function minimumZoom(){return sectId==='xinglan'?.48:.72;}
    function zoomBy(direction){zoom=clamp(zoom*Math.exp(Number(direction)*.16),minimumZoom(),2.7);updateCamera();}
    function selectAt(x,y){if(!landscape)return;const rect=canvas.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),camera);landscape.root.updateMatrixWorld(true);const hits=raycaster.intersectObject(landscape.root,true);for(const hit of hits){let o=hit.object;while(o&&o!==landscape.root){if(editing&&o.userData.slotId){options.onSelectSlot?.(o.userData.slotId);return;}if(o.userData.visitStage){focus(o.userData.visitStage);options.onSelectStage?.(o.userData.visitStage);return;}o=o.parent;}}if(editing){const plane=new T.Plane(new T.Vector3(0,1,0),-.25),point=new T.Vector3();if(raycaster.ray.intersectPlane(plane,point)){const slot=global.SpiritSectGovernance.slots.find(s=>Math.hypot(s.x-point.x,s.z-point.z)<1.8);if(slot)options.onSelectSlot?.(slot.id);}}}
    function appTouchControls(){return !!document.body?.classList?.contains('game-app');}
    function capturePointer(e){if(e.syntheticTouch)return;try{canvas.setPointerCapture?.(e.pointerId);}catch(_){}}
    function releasePointer(id){try{if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}catch(_){}}
    function pairBaseline(){
      if(pointer.size<2)return;
      const[a,b]=Array.from(pointer.values());touchMultiple=true;drag=null;
      touchGesture={ids:[a.id,b.id],distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2,angle,elevation,zoom};
      canvas.classList.add('is-dragging');
    }
    function down(e){
      if(e.pointerType==='touch'&&appTouchControls()){
        if(!pointer.size){if(drag)cancel();touchMultiple=e.isPrimary===false;touchGesture=null;}
        const point={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};pointer.set(e.pointerId,point);capturePointer(e);
        if(pointer.size>=2)pairBaseline();
        else if(!touchMultiple){drag={...point,pointerType:'touch',angle,elevation,moved:false};canvas.classList.add('is-dragging');}
        return;
      }
      // The non-app page still reserves a single finger for native scrolling.
      if(e.pointerType==='touch')return;
      if(e.button!==0||pointer.size)return;
      drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,id:e.pointerId,moved:false};capturePointer(e);canvas.classList.add('is-dragging');
    }
    function move(e){
      if(e.pointerType==='touch'){
        const point=pointer.get(e.pointerId);if(!point)return;point.x=e.clientX;point.y=e.clientY;
        if(e.cancelable)e.preventDefault();
        if(pointer.size>=2){
          if(!touchGesture?.ids?.every(id=>pointer.has(id))){pairBaseline();return;}
          const[a,b]=touchGesture.ids.map(id=>pointer.get(id));
          zoom=clamp(touchGesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/touchGesture.distance,minimumZoom(),2.7);
          angle=touchGesture.angle-((a.x+b.x)/2-touchGesture.x)*.008;
          elevation=clamp(touchGesture.elevation+((a.y+b.y)/2-touchGesture.y)*.004,.42,1.18);updateCamera();return;
        }
        // Once a second finger joined, the remaining finger cannot become a
        // fresh drag or a building tap until the whole gesture has ended.
        if(touchMultiple||!drag||drag.id!==e.pointerId)return;
        const dx=point.x-drag.startX,dy=point.y-drag.startY;
        if(Math.hypot(dx,dy)>=6)drag.moved=true;
        if(drag.moved){angle=drag.angle-dx*.006;elevation=clamp(drag.elevation+dy*.004,.42,1.18);updateCamera();}
        return;
      }
      if(!drag||drag.id!==e.pointerId||pointer.size)return;
      if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>=6)drag.moved=true;
      angle-=(e.clientX-drag.x)*.006;elevation=clamp(elevation+(e.clientY-drag.y)*.004,.42,1.18);drag.x=e.clientX;drag.y=e.clientY;updateCamera();
    }
    function up(e){
      if(e.pointerType==='touch'){
        const point=pointer.get(e.pointerId);if(!point)return;
        const clicked=pointer.size===1&&!touchMultiple&&drag?.id===e.pointerId&&!drag.moved&&Math.hypot(e.clientX-point.startX,e.clientY-point.startY)<6;
        pointer.delete(e.pointerId);drag=null;
        if(pointer.size>=2)pairBaseline();else{touchGesture=null;canvas.classList.remove('is-dragging');if(!pointer.size)touchMultiple=false;}
        releasePointer(e.pointerId);if(clicked)selectAt(e.clientX,e.clientY);return;
      }
      if(!drag||drag.id!==e.pointerId)return;
      const clicked=!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6;drag=null;canvas.classList.remove('is-dragging');releasePointer(e.pointerId);if(clicked)selectAt(e.clientX,e.clientY);
    }
    function cancel(e){
      if(e?.pointerId!==undefined&&!pointer.has(e.pointerId)&&drag?.id!==e.pointerId)return;
      const ids=new Set(pointer.keys());if(drag)ids.add(drag.id);
      drag=null;touchGesture=null;touchMultiple=false;pointer.clear();canvas.classList.remove('is-dragging');
      for(const id of ids)releasePointer(id);
    }
    function wheel(e){e.preventDefault();zoom=clamp(zoom*Math.exp(-clamp(e.deltaY,-150,150)*.0015),minimumZoom(),2.7);updateCamera();}
    function touchPointer(t,e){return {pointerType:'touch',pointerId:t.identifier,clientX:t.clientX,clientY:t.clientY,syntheticTouch:true,cancelable:e.cancelable,preventDefault:()=>e.preventDefault()};}
    function touchStart(e){
      if(appTouchControls()){
        if(typeof global.PointerEvent!=='function')for(const t of Array.from(e.changedTouches||e.touches))down(touchPointer(t,e));
        if(e.touches.length>1){touchMultiple=true;drag=null;}
        return;
      }
      if(e.touches.length===2){const[a,b]=e.touches;touchGesture={distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2};}else touchGesture=null;
    }
    function touchMove(e){
      if(appTouchControls()){
        if(e.cancelable!==false)e.preventDefault();
        // PointerEvents own modern gestures; TouchEvents only prevent native
        // scrolling. Older touch-only engines feed the same bookkeeping once.
        if(typeof global.PointerEvent!=='function')for(const t of Array.from(e.changedTouches||e.touches))move(touchPointer(t,e));
        return;
      }
      if(e.touches.length!==2||!touchGesture)return;e.preventDefault();const[a,b]=e.touches,distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),x=(a.clientX+b.clientX)/2,y=(a.clientY+b.clientY)/2;zoom=clamp(zoom*distance/Math.max(1,touchGesture.distance),minimumZoom(),2.7);angle-=(x-touchGesture.x)*.008;elevation=clamp(elevation+(y-touchGesture.y)*.004,.42,1.18);touchGesture={distance,x,y};updateCamera();
    }
    function touchEnd(e){
      if(!appTouchControls()){touchStart(e);return;}
      if(typeof global.PointerEvent!=='function'){
        for(const t of Array.from(e.changedTouches||[]))up(touchPointer(t,e));
        if(!e.touches.length&&pointer.size)cancel();
      }
    }
    function keys(e){let handled=true;if(e.key==='ArrowLeft')orbit(-1);else if(e.key==='ArrowRight')orbit(1);else if(e.key==='+'||e.key==='=')zoomBy(1);else if(e.key==='-'||e.key==='_')zoomBy(-1);else if(e.key==='Home')focus('overview');else handled=false;if(handled)e.preventDefault();}
    const handlers=[['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel],['wheel',wheel,{passive:false}],['touchstart',touchStart,{passive:true}],['touchmove',touchMove,{passive:false}],['touchend',touchEnd,{passive:true}],['touchcancel',cancel],['keydown',keys]];
    for(const[name,fn,config]of handlers)canvas.addEventListener(name,fn,config);
    const resizeObserver=typeof global.ResizeObserver==='function'?new global.ResizeObserver(resize):null;resizeObserver?.observe(container);if(!resizeObserver)global.addEventListener?.('resize',resize);
    if(typeof global.IntersectionObserver==='function'){observer=new global.IntersectionObserver(entries=>{visible=entries.some(e=>e.isIntersecting);effects?.setVisible(visible);lakeEffects?.setVisible(visible);if(visible)schedule();else if(raf){global.cancelAnimationFrame(raf);raf=0;}},{threshold:0});observer.observe(container);}
    function update(data){
      if(disposed||!data)return;lastData=data;const school=global.SpiritSects?.get(data.sectId);if(!school)return;let changed=false;
      if(sectId!==data.sectId){
        cancel();
        effects?.dispose();effects=null;lakeEffects?.dispose();lakeEffects=null;landscape?.dispose();sectId=data.sectId;
        landscape=global.createSpiritSectVisitLandscape({THREE:T,sectId});if(!landscape)return;scene.add(landscape.root);
        landscape.setDaylight(daylightState);landscape.setWeather(weatherState);applyDaylight();
        effects=global.createSpiritSectEffects?.({THREE:T,container,camera,sectId,hasLake:!!landscape.lake,positions:STAGE_POSITIONS,moonPosition:landscape.root.getObjectByName('sect-distant-moon')?.position,reducedMotion:!!reduced,software:!!renderer.isSoftware});
        lakeEffects=global.createSpiritSectLakeEffects?.({THREE:T,container,camera,lake:landscape.lake,landscapeRoot:landscape.root,reducedMotion:!!reduced,software:!!renderer.isSoftware});
        for(const effect of[effects,lakeEffects]){effect?.setDaylight?.(daylightState);effect?.setWeather?.(weatherState);effect?.resize(width,height);effect?.setVisible(visible);}
        angle=sectId==='xuanyue'?.72:sectId==='xinglan'?.28:.48;elevation=sectId==='xuanyue'?.85:sectId==='xinglan'?.50:.70;focusId='overview';overview();changed=true;
      }
      changed=landscape.setStages(data)||changed;changed=landscape.setLayout(data.layout||global.SpiritSectGovernance.defaultLayout)||changed;
      editing=!!data.editing;changed=landscape.setEditing(editing,data.selectedSlot)||changed;
      const descriptions=[];
      for(const stage of school.stages){
        const label=labelNodes[stage.id],state=landscape.getConstructionState(stage.id);label.title.textContent=stage.name;
        const description=state.phase==='preview'?state.label:state.label+' · '+state.percent+'%';
        label.state.textContent=description;label.node.dataset.state=landscape.getStatus(stage.id);label.node.dataset.phase=state.phase;
        descriptions.push(stage.name+'，'+description);
      }
      canvas.setAttribute('aria-label',school.name+'三维山景。'+descriptions.join('；')+'。鼠标拖动旋转，滚轮缩放；'+(appTouchControls()?'手机单指拖动环看、双指缩放，轻点建筑查看。':'手机双指操作。'));
      if(changed)effects?.setStages(Object.fromEntries(['gate','spring','library'].map(id=>[id,landscape.getStatus(id)])));
      container.dataset.sectId=sectId;container.dataset.landscape=landscape.root.userData.landscapeKind;container.dataset.effect=effects?.name||'';
      container.dataset.renderer=renderer.isSoftware?'canvas-geometry':'webgl';container.dataset.lake=landscape.lake?.id||'';container.classList.toggle('is-editing',editing);
      if(changed){renderer.invalidate?.();updateCamera();}
    }
    setDaylight(DEFAULT_DAYLIGHT);setWeather(DEFAULT_WEATHER);resize();
    return {supported:true,isSoftware:!!renderer.isSoftware,update,setDaylight,setWeather,getDaylight(){return {...daylightState};},getWeather(){return {...weatherState};},focus,orbit,zoom:zoomBy,resize,reset(){angle=sectId==='xuanyue'?.72:sectId==='xinglan'?.28:.48;elevation=sectId==='xuanyue'?.85:sectId==='xinglan'?.50:.70;focus('overview');},destroy(){if(disposed)return;disposed=true;if(raf)global.cancelAnimationFrame(raf);raf=0;observer?.disconnect();resizeObserver?.disconnect();if(!resizeObserver)global.removeEventListener?.('resize',resize);for(const[name,fn,config]of handlers)canvas.removeEventListener(name,fn,config);cancel();effects?.dispose();effects=null;lakeEffects?.dispose();lakeEffects=null;landscape?.dispose();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss?.();canvas.remove();labels.remove();lastData=null;}};
  };
})(window);
