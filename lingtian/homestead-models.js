/* Purchasable courtyard miniatures and individually owned hill residences.
 * Real mesh geometry, no external textures; models retain the original four
 * garden landmarks but are created only after the equipped view requests them. */
(function(global){
  'use strict';
  global.createSpiritHomesteadModel=function({THREE:T,material,mergeDetails,id,sceneryLOD,scenerySeed}){
    const definition=global.SpiritHomestead?.getScenery(id)||global.SpiritHomestead?.getResidence(id);
    if(!T||!definition||typeof material!=='function')return null;
    const residential=!!global.SpiritHomestead.getResidence(id);
    const modelId=definition.speciesId||id;
    const footprint=residential?global.SpiritHomestead.residenceFootprint:definition.footprint;
    const root=new T.Group(),g=new T.Group();root.add(g);
    root.name='spirit-homestead-'+id;root.userData.homesteadId=id;root.userData.landmarkName=definition.name;
    root.userData.homesteadKind=residential?'residence':'scenery';
    if(definition.repeatable){root.userData.speciesId=modelId;root.userData.copyIndex=definition.copyIndex;}
    const snowGroups=[],foliage=[],glows=[],lamps=[],ownedMaterials=[];
    const snowMaterial=material(0xf0f3e9,{roughness:.94,flatShading:false});
    const snowCapGeometry=new T.SphereGeometry(1,10,5);
    const scenery=['near','mid','far'].includes(sceneryLOD),simplified=scenery&&sceneryLOD!=='near',distant=sceneryLOD==='far';
    let seed=scenery&&Number.isFinite(scenerySeed)?scenerySeed>>>0:Array.from(id).reduce((sum,c)=>sum*31+c.charCodeAt(0),17)>>>0;
    const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    const rand=(a,b)=>a+random()*(b-a);
    function mesh(geometry,mat,parent,x=0,y=0,z=0){
      const item=new T.Mesh(geometry,mat);item.position.set(x,y,z);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item;
    }
    function box(w,h,d,color,parent,x=0,y=0,z=0){return mesh(new T.BoxGeometry(w,h,d),material(color),parent,x,y,z);}
    function cylinder(rt,rb,h,color,parent,x=0,y=0,z=0,seg=8){return mesh(new T.CylinderGeometry(rt,rb,h,seg),material(color),parent,x,y,z);}
    function stone(parent,x,y,z,sx,sy,sz,color){const o=mesh(new T.IcosahedronGeometry(1,0),material(color||0xc5c8b2),parent,x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rand(-.2,.2),rand(0,6),rand(-.2,.2));return o;}
    function branch(parent,from,to,radius,color){const a=new T.Vector3(...from),b=new T.Vector3(...to),dir=b.clone().sub(a);const o=cylinder(radius*.72,radius,dir.length(),color||0x6a7860,parent);o.position.copy(a.add(b).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());return o;}
    function detailCurve(parent,points,radius,color,segments=6,sides=4){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments,radius,sides,false),material(color,{flatShading:false,roughness:.72}),parent);}
    function roundRectShape(w,h,r){const s=new T.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}
    function roundedSlab(w,d,h,color,parent,x=0,y=0,z=0,r=.1){const geo=new T.ExtrudeGeometry(roundRectShape(w,d,r),{depth:h,bevelEnabled:false,curveSegments:3});geo.rotateX(-Math.PI/2);return mesh(geo,material(color),parent,x,y,z);}
    function weatherSnow(parent){const group=new T.Group();group.userData.homesteadSnow=true;group.visible=false;parent.add(group);snowGroups.push(group);return group;}
    function foliageMaterial(color,options={},seasonStyle='blossom'){const mat=material(color,{flatShading:false,...options}).clone();ownedMaterials.push(mat);foliage.push({material:mat,base:new T.Color(color),seasonStyle});return mat;}
    function registerGlow(item,parent,point){const mat=item.material.clone();ownedMaterials.push(mat);item.material=mat;glows.push(mat);lamps.push({parent,point});return item;}
    function roof(parent, y, extent, height, color) {
      const positions=[],indices=[],colors=[],base=new T.Color(color),pale=new T.Color(0x91b4a1),dark=new T.Color(0x527b6b),tint=new T.Color();
      const rows=5,cols=6;
      function point(side,t,u,lift=0) {
        const r=extent*(.08+.92*t),along=u*r;
        const high=y+height*(Math.pow(1-t,1.8)+.17*Math.pow(t,5)+.13*Math.pow(t,4)*u*u)+lift;
        return side===0?[along,high,r]:side===1?[r,high,-along]:side===2?[-along,high,-r]:[-r,high,along];
      }
      for(let side=0;side<4;side++) {
        const start=positions.length/3;
        for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++) {
          const t=row/rows,u=col/cols*2-1;positions.push(...point(side,t,u));
          tint.copy(base).lerp(col%2?pale:dark,.14).multiplyScalar(.90+.13*t);colors.push(tint.r,tint.g,tint.b);
        }
        for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
          const a=start+row*(cols+1)+col,b=a+cols+1;indices.push(a,b,a+1,a+1,b,b+1);
        }
        // Raised tile channels follow the curved surface from crown to eave.
        for(let col=1;col<cols;col++) {
          const u=col/cols*2-1,points=[];
          for(let row=0;row<=rows;row++)points.push(point(side,row/rows,u,.018));
          detailCurve(parent,points,.018*extent,0x97b7a3,5,3);
        }
        // Scalloped drip-edge and broad corner ridges make both storeys legible.
        const edge=[];for(let col=0;col<=cols;col++)edge.push(point(side,1,col/cols*2-1,-.012));
        detailCurve(parent,edge,.040,0x456e60,6,4);
        const ridge=[];for(let row=0;row<=rows;row++)ridge.push(point(side,row/rows,-1,.035));
        detailCurve(parent,ridge,.040,0xc9b77d,6,4);
        const end=point(side,1,-1,.035),lifted=[end[0]*1.055,end[1]+.17*height,end[2]*1.055];
        detailCurve(parent,[point(side,.80,-1,.035),end,lifted],.035,0xc9b77d,3,4);
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
      return mesh(geo,material(0xffffff,{vertexColors:true,flatShading:false,side:T.DoubleSide,roughness:.62}),parent);
    }

    function pavilionModel(pavilion){
    roundedSlab(3.0, 2.75, 0.18, 0xd0cfb5, pavilion, 0, 0, 0, 0.16);
    roundedSlab(2.7, 2.45, 0.13, 0xebe2c7, pavilion, 0, 0.18, 0, 0.10);
    for(const x of [-1.05,1.05])for(const z of [-.9,.9]) {
      cylinder(.095,.12,1.82,0xe5e3cd,pavilion,x,1.25,z,12);
      cylinder(.16,.19,.10,0xabbba5,pavilion,x,.40,z,12);
      cylinder(.135,.16,.075,0xe9e6cf,pavilion,x,.49,z,12);
      cylinder(.14,.11,.13,0xd2d7bb,pavilion,x,2.12,z,12);
      box(.34,.08,.20,0xb0c2a9,pavilion,x,2.19,z);
      box(.20,.08,.42,0xb0c2a9,pavilion,x,2.27,z);
      for(const side of [-1,1]){
        const bracket=box(.20,.075,.10,0x8fa994,pavilion,x+side*.16,2.23,z);bracket.rotation.z=side*.26;
      }
    }
    for (const z of [-0.96, 0.96]) box(2.35, 0.14, 0.14, 0xaeb897, pavilion, 0, 2.16, z);
    for (const x of [-1.1, 1.1]) box(0.14, 0.14, 2.08, 0xaeb897, pavilion, x, 2.16, 0);
    for(const side of [-1,1]) {
      box(.07,.065,1.80,0xc1cbb0,pavilion,side*1.03,.99,0);
      box(.07,.045,1.80,0xb0bea1,pavilion,side*1.03,.66,0);
      for(const z of [-.6,-.2,.2,.6])box(.055,.40,.055,0xd9dcc5,pavilion,side*1.03,.79,z);
    }
    box(2.08,.075,.09,0xc1cbb0,pavilion,0,.99,-.88);
    box(2.08,.05,.07,0xb0bea1,pavilion,0,.66,-.88);
    for(const x of [-.75,-.25,.25,.75])box(.055,.40,.055,0xd9dcc5,pavilion,x,.79,-.88);
    const pavilionRoofs=[roof(pavilion,2.12,1.66,1.23,0x6c9480),roof(pavilion,2.77,.82,.74,0x7ca18b)];
    const roofSnow=weatherSnow(pavilion);
    for(const roofMesh of pavilionRoofs){const cap=mesh(roofMesh.geometry.clone(),snowMaterial,roofSnow,0,.035,0);cap.castShadow=false;}
    cylinder(.065,.13,.22,0xc4bb84,pavilion,0,3.65,0,12);
    mesh(new T.SphereGeometry(.09,10,6),material(0xead599,{flatShading:false,roughness:.4}),pavilion,0,3.80,0);
    for(const x of [-1.15,1.15]) {
      branch(pavilion,[x,2.15,0.95],[x,1.82,0.95],0.012,0x857d60);
      const l=mesh(new T.SphereGeometry(0.13,10,6),material(0xf5cf87,{flatShading:false,emissive:0xd58f33,emissiveIntensity:0.12}),pavilion,x,1.72,0.95);
      l.scale.y=1.2; registerGlow(l,pavilion,new T.Vector3(x,1.72,.95));
      cylinder(.065,.095,.045,0x9a9069,pavilion,x,1.89,.95,8);
      cylinder(.095,.065,.045,0x9a9069,pavilion,x,1.55,.95,8);
      detailCurve(pavilion,[[x,1.53,.95],[x-.015,1.44,.95],[x+.025,1.35,.95]],.016,0xd1ad6e,3,4);
    }
    roundedSlab(1.0,0.43,0.1,0xd1cfb8,pavilion,0,-0.02,1.6,0.08);
    roundedSlab(1.1,0.43,0.08,0xc6c9b2,pavilion,0,-0.08,1.98,0.08);
    cylinder(0.32,0.27,0.16,0xc5c7ac,pavilion,0,0.67,0,8);
    cylinder(0.09,0.13,0.33,0xa9b49c,pavilion,0,0.44,0,7);
    cylinder(.075,.065,.10,0xe7e3c8,pavilion,.09,.79,.02,10);
    cylinder(.045,.04,.055,0xe7e3c8,pavilion,-.15,.76,.07,10);
    }
    function blossomModel(blossom){
    branch(blossom,[0,0,0],[0.1,1.6,0],0.14,0x8c8272);
    branch(blossom,[0.06,0.9,0],[-0.85,2.05,0.1],0.09,0x8c8272);
    branch(blossom,[0.08,1.2,0],[0.98,2.22,-0.15],0.09,0x8c8272);
    branch(blossom,[0.1,1.5,0],[-0.2,2.4,-0.55],0.07,0x8c8272);
    const blossomColors=[0xf1d0b8,0xebb3b0,0xf8ddbc,0xe9b5a8];
    const blossomSnow=weatherSnow(blossom);
    for(const p of [[-.85,2.15,.15,.82],[.9,2.3,-.1,.82],[-.1,2.6,-.4,.94],[0,2.27,.5,.8],[-.9,2.6,-.4,.62],[.65,2.75,-.45,.65]]) {
      const c=mesh(new T.IcosahedronGeometry(p[3],2),foliageMaterial(blossomColors[Math.floor(random()*4)]),blossom,p[0],p[1],p[2]); c.scale.y=.72;
      const cap=mesh(snowCapGeometry,snowMaterial,blossomSnow,p[0],p[1]+p[3]*.60,p[2]);cap.scale.set(p[3]*.8,.11,p[3]*.78);cap.castShadow=false;
    }
    for(let i=0;i<15;i++) {
      const petal=mesh(new T.PlaneGeometry(.09,.07),material(0xe9b5a8,{side:T.DoubleSide}),blossom,rand(-1.16,1.16),.014,rand(-1.12,1.12));
      petal.rotation.x=-Math.PI/2;petal.rotation.z=rand(0,6);
    }

    }
    // Small garden trees use real forked trunks and separate, irregular leaf
    // sprays. Shared leaf geometry is baked into one foliage batch per tree;
    // each owned copy still has its own root, transforms and seasonal material.
    function greenTreeModel(kind){
      const pine=kind==='verdantPine',willow=kind==='weepingWillow';
      const bark=pine?0x77694d:willow?0x7c8060:0x8a7b58;
      const leaf=foliageMaterial(pine?0x416f51:willow?0x81a94c:0x578544,{vertexColors:true},pine?'evergreen':'green');
      const snow=weatherSnow(g),treeDetails={branches:0,leafSprays:0,pendants:0};
      root.userData.treeDetails=treeDetails;
      function limb(from,to,radius,end=.58,color=bark,sides=5){
        const a=new T.Vector3(...from),b=new T.Vector3(...to),delta=b.clone().sub(a);
        const item=scenery?mesh(new T.CylinderGeometry(radius*end,radius,delta.length(),simplified?3:sides,1,true),material(color),g):cylinder(radius*end,radius,delta.length(),color,g,0,0,0,sides);
        item.position.copy(a.add(b).multiplyScalar(.5));item.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());treeDetails.branches++;
      }
      const positions=[],colors=[],indices=[],segments=7;
      if(simplified){
        // A flattened spray retains the same crown placements as the owned tree.
        // Only the hidden interior rings are removed for a distant forest.
        const sides=distant?4:6;
        for(let n=0;n<sides;n++){
          const a=n*Math.PI*2/sides,r=1+.08*Math.sin(n*2.4);
          positions.push(Math.cos(a)*r,.02+.05*Math.sin(n*1.7),Math.sin(a)*r);colors.push(.96,.99,.91);
        }
        positions.push(0,-.79,0,.025,.88,-.03);colors.push(.83,.87,.80,1.06,1.10,1.00);
        for(let n=0;n<sides;n++){const next=(n+1)%sides;indices.push(sides,n,next,sides+1,next,n);}
      }else{
      for(let ring=0;ring<3;ring++)for(let n=0;n<segments;n++){
        const angle=n*Math.PI*2/segments,irregular=1+.11*Math.sin(n*2.4+ring*.7),r=[.60,1,.57][ring]*irregular;
        positions.push(Math.cos(angle)*r,[-.54,.02,.56][ring]+.06*Math.sin(n*1.7),Math.sin(angle)*r);
        const light=[.65,.91,1.17][ring]+.055*Math.cos(angle);
        colors.push(light*.98,light,light*.90);
      }
      positions.push(0,-.79,0,.025,.88,-.03);colors.push(.57,.60,.53,1.2,1.24,1.09);
      for(let ring=0;ring<2;ring++)for(let n=0;n<segments;n++){
        const a=ring*segments+n,b=ring*segments+(n+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d);
      }
      for(let n=0;n<segments;n++){const next=(n+1)%segments;if(scenery)indices.push(21,n,next,22,14+next,14+n);else indices.push(21,next,n,22,14+n,14+next);}
      }
      const sprayGeometry=new T.BufferGeometry();sprayGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));sprayGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));sprayGeometry.setIndex(indices);sprayGeometry.computeVertexNormals();
      function spray(x,y,z,sx,sy,sz,cap=false){
        if(scenery){sy*=pine?1.30:willow?1.25:1.55;y-=pine?.045:willow?.06:.17;}
        const item=mesh(sprayGeometry,leaf,g,x,y,z);item.scale.set(sx,sy,sz);item.rotation.y=rand(-.5,.5);item.rotation.z=rand(-.12,.12);treeDetails.leafSprays++;
        if(cap&&!scenery){const cover=mesh(sprayGeometry,snowMaterial,snow,x,y+sy*.64,z);cover.scale.set(sx*.72,.055,sz*.72);cover.rotation.y=item.rotation.y;cover.castShadow=false;}
      }
      // Buttress roots end in grass and a few small stones, without a pot or a
      // hard circular base. Every piece stays inside the catalogue footprint.
      if(!scenery){
      for(let n=0;n<5;n++){
        const a=n*Math.PI*2/5+.3,r=rand(.24,.36);
        limb([0,.19,0],[Math.cos(a)*r,.025,Math.sin(a)*r],pine?.05:.068,.26,bark,5);
      }
      for(const [x,z,s]of[[-.32,.25,.12],[.30,.13,.10],[-.16,-.31,.085]])stone(g,x,.025,z,s,.07,s*.75,0xb0b395);
      const grassPositions=[],grassColors=[];
      for(let n=0;n<6;n++){
        const angle=n*2.4,r=.30+(n%2)*.09,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
        for(let blade=0;blade<3;blade++){
          const a=angle+blade*2.1,w=.025,h=.12+blade*.035,dx=Math.cos(a),dz=Math.sin(a);
          grassPositions.push(x-dz*w,.01,z+dx*w,x+dz*w,.01,z-dx*w,x+dx*.075,h,z+dz*.075);
          grassColors.push(.66,.77,.52,.66,.77,.52,1,1,.79);
        }
      }
      const grassGeometry=new T.BufferGeometry();grassGeometry.setAttribute('position',new T.Float32BufferAttribute(grassPositions,3));grassGeometry.setAttribute('color',new T.Float32BufferAttribute(grassColors,3));grassGeometry.computeVertexNormals();
      mesh(grassGeometry,material(0x7e9859,{vertexColors:true,side:T.DoubleSide}),g);
      }
      if(pine){
        const spine=[[0,0,0],[.035,.72,.015],[-.045,1.42,0],[.035,2.10,-.025],[-.02,2.70,.015],[.025,3.10,0]];
        if(distant){for(const [a,b]of[[0,2],[2,4],[4,5]])limb(spine[a],spine[b],.11-a*.015,.56,bark,3);}
        else for(let n=1;n<spine.length;n++)limb(spine[n-1],spine[n],.112-n*.015,.74,bark,6);
        for(let tier=0;tier<4;tier++)for(let n=0;n<(distant?2:3);n++){
          const a=n*Math.PI*2/(distant?2:3)+tier*.83,r=.42-tier*.075,y=1.21+tier*.47;
          const x=Math.cos(a)*r,z=Math.sin(a)*r;
          if(distant)limb([spine[tier+1][0],y-.16,0],[x,y+.08,z],.044-tier*.006,.3);
          else{limb([spine[tier+1][0],y-.16,0],[x*.62,y-.06,z*.62],.044-tier*.006);limb([x*.62,y-.06,z*.62],[x,y+.08,z],.025-tier*.004);}
          const fullness=distant?1.28:1;
          spray(x,y+.13,z,(.29-tier*.029)*fullness,.16-tier*.009,(.235-tier*.018)*fullness,(tier+n)%2===0);
          if(tier<2&&!distant)spray(x*.61,y+.25,z*.61,.18,.11,.17);
        }
        spray(.025,3.06,0,.19,.23,.18,true);
        if(!scenery)limb([.055,.13,.025],[.06,.63,.02],.018,.36,0xaa916a,4);
      }else if(!willow){
        limb([0,0,0],[-.035,.76,.035],.145,.80,bark,7);
        limb([-.035,.65,.035],[-.18,1.46,.04],.104,.68,bark,6);
        limb([-.015,.74,.025],[.18,1.57,-.055],.096,.60,bark,6);
        limb([-.18,1.38,.04],[-.09,2.16,-.12],.068,.46);
        limb([.18,1.48,-.055],[.25,2.22,.11],.057,.42);
        for(let n=0;n<(distant?5:7);n++){
          const a=n*Math.PI*2/(distant?5:7)+.24,r=.43+(n%2)*.035,x=Math.cos(a)*r,z=Math.sin(a)*r,y=1.95+(n%3)*.16;
          if(distant)limb([n%2?.16:-.13,1.31+(n%2)*.15,0],[x,y+.18,z],.047,.28);
          else{limb([n%2?.16:-.13,1.31+(n%2)*.15,0],[x*.72,y-.12,z*.72],.047,.51);limb([x*.72,y-.12,z*.72],[x,y+.18,z],.025,.36);}
          spray(x,y+.20,z,distant?.39:.31,distant?.31:.27,distant?.35:.27,n%2===0);
          if(!distant)spray(x*.56,y+.43,z*.56,.29,.24,.27,n%3===0);
        }
        spray(-.08,2.63,.035,.34,.30,.32,true);spray(.23,2.48,-.12,.27,.25,.26);
        if(!distant)for(const [x,z]of[[-.27,.08],[.24,.14]])limb([x,1.82,z],[x*.88,.67,z*.94],.012,.35,0x9a8964,4);
      }else{
        const spine=[[0,0,0],[-.055,.65,.02],[.015,1.30,.015],[.11,1.91,-.02],[.035,2.48,0]];
        for(let n=1;n<spine.length;n++)limb(spine[n-1],spine[n],.11-n*.016,.7,bark,6);
        for(let n=0;n<(distant?5:7);n++){
          const a=n*Math.PI*2/(distant?5:7),r=.36+(n%2)*.055,x=Math.cos(a)*r,z=Math.sin(a)*r,y=2.40+(n%3)*.11;
          if(distant)limb([.05,1.72+(n%2)*.22,0],[x,y,z],.036,.25);
          else{limb([.05,1.72+(n%2)*.22,0],[x*.72,y-.14,z*.72],.036,.50);limb([x*.72,y-.14,z*.72],[x,y,z],.018,.37);}
          spray(x,y,z,distant?.30:.25,.22,distant?.28:.235,n%2===0);
        }
        spray(.035,2.81,0,.28,.24,.25,true);
        const leaves=[],leafColors=[];
        const pendantCount=distant?5:simplified?8:14,leafCount=distant?3:simplified?4:8;
        for(let n=0;n<pendantCount;n++){
          const a=n*Math.PI*2/pendantCount+.12,r=.42+(n%3)*.045,y=2.47+(n%3)*.10;
          const curve=new T.CatmullRomCurve3([new T.Vector3(Math.cos(a)*r*.72,y,Math.sin(a)*r*.72),new T.Vector3(Math.cos(a)*(r+.07),y-.27,Math.sin(a)*(r+.07)),new T.Vector3(Math.cos(a)*(r+.055),y-.66,Math.sin(a)*(r+.055)),new T.Vector3(Math.cos(a)*(r-.015),y-1.03-(n%2)*.16,Math.sin(a)*(r-.015))]);
          mesh(new T.TubeGeometry(curve,distant?1:simplified?2:4,.008,3,false),material(0x7d8b54),g);treeDetails.pendants++;
          for(let j=1;j<=leafCount;j++){
            const p=curve.getPoint(j/(leafCount+1)),side=j%2?1:-1,w=distant?.055:simplified?.043:.036,dx=Math.cos(a+.75),dz=Math.sin(a+.75),lean=.046*side;
            const top=[p.x,p.y+.045,p.z],left=[p.x-dx*w+dx*lean,p.y-.025,p.z-dz*w+dz*lean],tip=[p.x+dx*lean,p.y-.16,p.z+dz*lean],right=[p.x+dx*w+dx*lean,p.y-.025,p.z+dz*w+dz*lean];
            leaves.push(...top,...left,...tip,...top,...tip,...right);
            for(const light of [.85,1.05,1.21,.85,1.21,1.05])leafColors.push(light*.98,light,light*.88);
          }
        }
        const pendantGeometry=new T.BufferGeometry();pendantGeometry.setAttribute('position',new T.Float32BufferAttribute(leaves,3));pendantGeometry.setAttribute('color',new T.Float32BufferAttribute(leafColors,3));pendantGeometry.computeVertexNormals();leaf.side=T.DoubleSide;mesh(pendantGeometry,leaf,g);
      }
    }
    function pondModel(pond){
    const basin=mesh(new T.CylinderGeometry(1.30,1.36,.13,32),material(0xa5b4a0,{flatShading:false}),pond,0,0,0);basin.scale.z=1.35;
    const basinLip=mesh(new T.TorusGeometry(1.24,.085,6,32),material(0xdbdec7,{flatShading:false,roughness:.65}),pond,0,.09,0);basinLip.rotation.x=-Math.PI/2;basinLip.scale.y=1.35;
    const basinInset=mesh(new T.TorusGeometry(1.16,.023,4,36),material(0x8ba997,{flatShading:false}),pond,0,.095,0);basinInset.rotation.x=-Math.PI/2;basinInset.scale.y=1.35;
    const waterMat=material(0x70b4a7,{flatShading:false,roughness:.24,metalness:.05,transparent:true,opacity:.86});
    const water=mesh(new T.CircleGeometry(1.16,40),waterMat,pond,0,.075,0);water.rotation.x=-Math.PI/2;water.scale.y=1.35;
    for(let i=0;i<10;i++){const a=i*Math.PI*2/10;stone(pond,Math.cos(a)*1.38,.025,Math.sin(a)*1.78,rand(.13,.23),rand(.07,.12),rand(.12,.21),i%3?0xb5c0a7:0xcbd1b8);}
    function lotusPad(x,z,r,turn) {
      const g=new T.Group();g.position.set(x,.104,z);g.rotation.y=turn;pond.add(g);
      const shape=new T.Shape();shape.moveTo(0,0);shape.lineTo(Math.cos(.22)*r,Math.sin(.22)*r);shape.absarc(0,0,r,.22,Math.PI*2-.22,false);shape.lineTo(0,0);
      const pad=mesh(new T.ShapeGeometry(shape,18),material(0x5b9981,{flatShading:false,side:T.DoubleSide}),g);pad.rotation.x=-Math.PI/2;
      for(let n=0;n<6;n++) {
        const a=.55+n*.98;detailCurve(g,[[0,.009,0],[Math.cos(a)*r*.42,.013,-Math.sin(a)*r*.42],[Math.cos(a)*r*.9,.010,-Math.sin(a)*r*.9]],.005,0x9bbca0,2,3);
      }
    }
    lotusPad(-.55,-.52,.31,.50);lotusPad(.64,.30,.29,2.1);lotusPad(-.29,.91,.34,-.7);
    // Cup-shaped petals have real bend, pointed tips and soft exported normals.
    for(const [lx,lz,lr] of [[-.26,-.46,.31],[.43,-.02,.25],[-.25,.59,.28]]) {
      const lotus=new T.Group();lotus.position.set(lx,.12,lz);pond.add(lotus);
      for(let layer=0;layer<3;layer++)for(let n=0;n<7-layer*2;n++) {
        const count=7-layer*2,length=lr*(1-layer*.21),positions=[],indices=[],colors=[],pale=new T.Color(0xfff0de),pink=new T.Color(0xe8b5b1),color=new T.Color();
        for(let row=0;row<=3;row++)for(let col=0;col<=4;col++) {
          const t=row/3,u=col/4*2-1,w=Math.sin(Math.PI*t)*length*.44;
          positions.push(u*w,length*(.06+.52*t*t+u*u*.16)+layer*.035,t*length);
          color.copy(pale).lerp(pink,Math.pow(t,1.7)*.7+Math.abs(u)*.13);colors.push(color.r,color.g,color.b);
        }
        for(let row=0;row<3;row++)for(let col=0;col<4;col++){const a=row*5+col,b=a+5;indices.push(a,a+1,b,a+1,b+1,b);}
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
        const p=mesh(geo,material(0xffffff,{flatShading:false,vertexColors:true,side:T.DoubleSide,roughness:.65}),lotus);p.rotation.y=n*Math.PI*2/count+layer*.35;
      }
      const center=mesh(new T.SphereGeometry(lr*.18,8,5),material(0xebcf83,{flatShading:false}),lotus,0,.13,0);center.scale.y=.5;
    }
    const rippleMaterial=material(0xe5f4df,{transparent:true,opacity:.56,side:T.DoubleSide,depthWrite:false});
    for(const radius of [.52,.92]){const ripple=mesh(new T.RingGeometry(radius,radius+.016,36),rippleMaterial,pond,0,.095,0);ripple.rotation.x=-Math.PI/2;ripple.scale.y=1.25;ripple.castShadow=false;}

    }
    function moonArchModel(moonGate){
    roundedSlab(3.45,1.05,.13,0xd7dcc7,moonGate,0,0,0,.13);
    roundedSlab(3.10,.85,.13,0xf1edda,moonGate,0,.13,0,.10);
    const arch=mesh(new T.TorusGeometry(1.20,.16,8,36),material(0xe9ead3,{flatShading:false,roughness:.62}),moonGate,0,1.38,0);
    const archInlay=mesh(new T.TorusGeometry(1.20,.018,3,48),material(0xc4af74,{flatShading:false}),moonGate,0,1.38,.158);
    mesh(new T.TorusGeometry(1.09,.027,4,40),material(0xd1dbc3,{flatShading:false,roughness:.6}),moonGate,0,1.38,.09);
    for(let i=0;i<10;i++) {
      const a=Math.PI*.08+i*Math.PI*.084,x=Math.cos(a)*1.20,y=1.38+Math.sin(a)*1.20;
      const mark=box(.018,.078,.014,0xb0c2a6,moonGate,x,y,.165);mark.rotation.z=a-Math.PI/2;
    }
    for(const x of [-1.12,1.12]){
      roundedSlab(.61,.72,.12,0xb7c7af,moonGate,x,.23,0,.08);
      roundedSlab(.49,.59,.18,0xd9dfc7,moonGate,x,.35,0,.07);
      cylinder(.17,.21,.10,0xeeead4,moonGate,x,.57,0,12);
      detailCurve(moonGate,[[x-.18,.38,.31],[x-.10,.46,.31],[x,.40,.31],[x+.09,.46,.31],[x+.18,.38,.31]],.014,0x9eb59d,6,3);
    }
    // An open circular crown keeps the moon gate legible from this elevated view.
    cylinder(.075,.10,.19,0xc5b77d,moonGate,0,2.75,0,6);
    const gateSeal=mesh(new T.OctahedronGeometry(.16,0),material(0xdbbd70,{emissive:0xcab566,emissiveIntensity:.15}),moonGate,0,2.50,.18);gateSeal.scale.set(1,.78,.35);
    }

    // A tiled saddle roof, with a shallow concave pitch and lifted end tiles.
    // Unlike the pavilion's four-sided tiers this keeps homes long and domestic.
    function saddleRoof(parent,{x=0,y=1.6,z=0,width=3,depth=1.9,height=.56,turn=0,tile=0x6d927c,edge=0x4f735f,trim=0xd3c28d}){
      const group=new T.Group();group.position.set(x,0,z);group.rotation.y=turn;parent.add(group);
      const positions=[],colors=[],indices=[],rows=5,cols=10,base=new T.Color(tile),shade=new T.Color(edge),tint=new T.Color();
      function point(side,t,u,lift=0){return[u*width/2,y+height*Math.pow(1-t,1.7)+height*.16*Math.pow(t,5)+.08*u*u*t+lift,side*t*depth/2];}
      for(const side of [-1,1]){
        const start=positions.length/3;
        for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
          const t=row/rows,u=col/cols*2-1;positions.push(...point(side,t,u));
          tint.copy(base).lerp(shade,col%2?.10:.25).multiplyScalar(.96+.05*t);colors.push(tint.r,tint.g,tint.b);
        }
        for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const a=start+row*(cols+1)+col,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);}
        for(let col=0;col<=cols;col++){
          const p=[];for(let row=0;row<=rows;row++)p.push(point(side,row/rows,col/cols*2-1,.012));
          detailCurve(group,p,.014,col===0||col===cols?trim:tile,5,3);
        }
        detailCurve(group,[point(side,1,-1),point(side,1,-.5),point(side,1,0),point(side,1,.5),point(side,1,1)],.035,edge,6,4);
        for(const u of [-1,1])detailCurve(group,[point(side,.72,u,.02),point(side,1,u,.03),[u*(width/2+.06),y+height*.16+.22,side*(depth/2+.07)]],.029,trim,4,4);
      }
      detailCurve(group,[[-width/2-.08,y+height+.10,0],[-width/2,y+height+.03,0],[0,y+height+.02,0],[width/2,y+height+.03,0],[width/2+.08,y+height+.10,0]],.045,trim,8,4);
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      mesh(geometry,material(0xffffff,{vertexColors:true,flatShading:false,side:T.DoubleSide,roughness:.66}),group);
      const snow=weatherSnow(group);const cap=mesh(geometry.clone(),snowMaterial,snow,0,.026,0);cap.castShadow=false;
      return group;
    }
    function lattice(parent,x,y,z,width,height,wood=0x6d8466,glass=0xdfcd9c,round=false){
      if(round){
        const pane=mesh(new T.CircleGeometry(width/2-.035,24),material(glass,{roughness:.56,side:T.DoubleSide}),parent,x,y,z);pane.castShadow=false;
        mesh(new T.TorusGeometry(width/2,.04,5,28),material(wood),parent,x,y,z+.012);
        for(const direction of [-1,1])detailCurve(parent,[[x-direction*width*.32,y+width*.32,z+.02],[x,y,z+.035],[x+direction*width*.32,y-width*.32,z+.02]],.017,wood,2,4);
        box(.026,width*.85,.025,wood,parent,x,y,z+.028);
      }else{
        box(width,height,.045,glass,parent,x,y,z);
        for(const sx of [-1,1])box(.042,height+.09,.055,wood,parent,x+sx*width/2,y,z+.035);
        for(const sy of [-1,1])box(width+.09,.042,.055,wood,parent,x,y+sy*height/2,z+.035);
        for(let i=1;i<4;i++)box(.022,height,.028,wood,parent,x-width/2+i*width/4,y,z+.04);
        for(const yy of [-.21,.21])box(width,.024,.029,wood,parent,x,y+height*yy,z+.041);
      }
    }
    function houseRoom(parent,{x=0,z=0,width=2.4,depth=1.3,base=.28,height=1.15,wall=0xe0d5ad,wood=0x798767,door=true}){
      const group=new T.Group();group.position.set(x,0,z);parent.add(group);
      box(width,height,depth,wall,group,0,base+height/2,0);
      for(const xx of [-width/2,width/2])for(const zz of [-depth/2,depth/2])box(.085,height+.09,.085,wood,group,xx,base+height/2,zz);
      for(const zz of [-depth/2,depth/2])for(const yy of [base+.08,base+height-.04])box(width+.12,.075,.07,wood,group,0,yy,zz+.012);
      if(door){
        box(.46,height*.78,.055,wood,group,0,base+height*.39,depth/2+.035);
        box(.37,height*.7,.027,0x4e6658,group,0,base+height*.39,depth/2+.07);
        for(const xx of [-.15,.15])box(.024,height*.67,.018,0xc6b784,group,xx,base+height*.39,depth/2+.09);
        mesh(new T.SphereGeometry(.027,6,4),material(0xdcc17f),group,.11,base+.46,depth/2+.10);
        for(const xx of [-width*.32,width*.32])lattice(group,xx,base+height*.6,depth/2+.039,width*.22,height*.53,wood);
      }
      return group;
    }
    function rail(parent,from,to,y,color=0xb7c4a7,height=.37){
      const [x1,z1]=from,[x2,z2]=to,d=Math.hypot(x2-x1,z2-z1),count=Math.max(2,Math.ceil(d/.36));
      for(const yy of [y+.08,y+height])branch(parent,[x1,yy,z1],[x2,yy,z2],.025,color);
      for(let i=0;i<=count;i++){const t=i/count;cylinder(.026,.035,height+.06,color,parent,x1+(x2-x1)*t,y+height/2,z1+(z2-z1)*t,6);}
    }
    function hangingLantern(parent,x,y,z,size=.11){
      branch(parent,[x,y+.26,z],[x,y+.12,z],.009,0x968362);
      const grand=modelId==='moonResidence'||modelId==='starResidence';
      const item=mesh(new T.SphereGeometry(size,grand?8:10,grand?5:6),material(0xf5d292,{roughness:.75,emissive:0xd99443,emissiveIntensity:.12}),parent,x,y,z);item.scale.set(.85,1.18,.85);
      registerGlow(item,parent,new T.Vector3(x,y,z));
      for(const yy of [y-size*1.15,y+size*1.15])cylinder(size*.6,size*.6,.025,0x9b875f,parent,x,yy,z,8);
      detailCurve(parent,[[x,y-size*1.2,z],[x-.008,y-size*1.55,z],[x+.018,y-size*1.9,z]],.009,0xc8a261,3,3);
    }
    function bambooCluster(parent,x,z,scale=.8){
      const plant=new T.Group();plant.position.set(x,0,z);plant.scale.setScalar(scale);parent.add(plant);
      cylinder(.18,.14,.22,0xa7ab86,plant,0,.15,0,10);
      for(let i=0;i<3;i++){
        const xx=(i-1)*.09,hh=.83+i*.11;cylinder(.022,.03,hh,0x8d9f66,plant,xx,.25+hh/2,0,6);
        for(const y of [.48,.72,.95])cylinder(.032,.032,.023,0xc5be86,plant,xx,y,0,6);
        for(let leaf=0;leaf<3;leaf++){
          const side=leaf%2?1:-1,tip=[xx+side*(.17+leaf*.025),.64+leaf*.15,(i-1)*.08];
          branch(plant,[xx,tip[1]-.06,0],tip,.009,0x82955e);
          const blade=mesh(new T.SphereGeometry(1,6,4),material(leaf%2?0x849b64:0xa1b078),plant,tip[0],tip[1],tip[2]);blade.scale.set(.15,.035,.048);blade.rotation.z=side*.44;
        }
      }
    }
    function bambooResidence(){
      roundedSlab(3.65,2.86,.14,0xc8c5a3,g,0,0,0,.14);
      roundedSlab(3.38,2.57,.14,0xdcd5af,g,0,.14,0,.10);
      houseRoom(g,{z:-.43,width:2.65,depth:1.27,base:.28,height:1.08,wall:0xd9c99d,wood:0x8b8e62});
      for(let i=0;i<14;i++)box(.11,.055,.70,0xb6a579,g,-1.42+i*.22,.325,.90);
      for(const x of [-1.43,-.65,.65,1.43]){
        cylinder(.045,.055,1.22,0x8e9866,g,x,.91,.98,7);
        for(const y of [.55,.92,1.30])cylinder(.058,.058,.022,0xd5c48a,g,x,y,.98,7);
      }
      branch(g,[-1.47,1.49,.98],[1.47,1.49,.98],.048,0xc2b783);
      saddleRoof(g,{z:-.15,y:1.37,width:3.28,depth:2.32,height:.53,tile:0x7d956b,edge:0x607652,trim:0xd2c38a});
      for(const x of [-1.43,1.43])rail(g,[x,.35],[x,1.17],.31,0x9aa774,.35);
      roundedSlab(1.03,.34,.10,0xc9c2a0,g,0,.17,1.36,.05);
      roundedSlab(1.18,.27,.09,0xb9bc99,g,0,.07,1.58,.04);
      bambooCluster(g,-1.46,-.91,.84);bambooCluster(g,1.47,-.87,.68);
      hangingLantern(g,-1.06,1.10,.87,.105);hangingLantern(g,1.06,1.10,.87,.105);
      cylinder(.23,.18,.08,0xc1b48b,g,-.94,.57,.76,10);cylinder(.035,.06,.22,0x8c8e68,g,-.94,.43,.76,7);
      cylinder(.05,.044,.06,0xede2bf,g,-.97,.64,.77,8);
    }
    function mapleCourtyard(){
      roundedSlab(3.80,3.36,.15,0xc9bca4,g,0,0,0,.13);roundedSlab(3.55,3.10,.10,0xe1d1b1,g,0,.15,0,.10);
      const red=0x995f47,wall=0xe3d1ae;
      houseRoom(g,{z:-.95,width:2.65,depth:1.01,base:.25,height:1.13,wall,wood:red});
      saddleRoof(g,{z:-.95,y:1.41,width:3.15,depth:1.47,height:.50,tile:0xb48260,edge:0x8f624d,trim:0xd7b57a});
      for(const side of [-1,1]){
        const wing=new T.Group();wing.position.set(side*1.29,0,.36);wing.rotation.y=-side*Math.PI/2;g.add(wing);
        houseRoom(wing,{width:1.84,depth:.79,base:.25,height:.99,wall:0xdbc49f,wood:red});
        saddleRoof(wing,{y:1.29,width:2.10,depth:1.12,height:.40,tile:0xa97b59,edge:0x8d5c47,trim:0xd8b57a});
        for(let step=0;step<4;step++)box(.13,.07,.41,0xcba983,g,side*.76,.28,-.36+step*.43);
      }
      for(const x of [-1.25,1.25]){box(.81,.36,.13,0xd8c5a4,g,x,.43,1.46);box(.88,.065,.20,0x9f7052,g,x,.64,1.46);}
      for(let i=0;i<4;i++)roundedSlab(.49,.38,.025,0xb8ba9c,g,0,.26,1.29-i*.46,.07);
      roundedSlab(.90,.35,.10,0xc8b89b,g,0,.08,1.65,.04);
      cylinder(.25,.19,.28,0xb69675,g,-.48,.40,.36,10);branch(g,[-.48,.53,.36],[-.46,1.08,.36],.034,0x7e7051);
      for(const [x,y,z,r]of[[-.59,1.04,.34,.24],[-.28,1.10,.30,.27],[-.46,1.23,.39,.26]]){
        const crown=mesh(new T.IcosahedronGeometry(r,1),material(0xc88b59),g,x,y,z);crown.scale.y=.64;
      }
      hangingLantern(g,-.62,1.05,-.32,.095);hangingLantern(g,.62,1.05,-.32,.095);
      box(.42,.18,.045,0x785741,g,0,1.23,-.40);for(const x of [-.10,0,.10])box(.027,.08,.012,0xe8d49a,g,x,1.23,-.37);
    }
    // The two grand residences have their own hip roofs, so their taller rooms
    // retain real pitch and deep eaves without altering the smaller homes.
    function grandRoof(parent,{x=0,z=0,y,width,depth,height,tile,edge,gold}){
      const group=new T.Group();group.position.set(x,0,z);parent.add(group);
      const positions=[],colors=[],indices=[],base=new T.Color(tile),shade=new T.Color(edge),tone=new T.Color(),rows=3;
      function point(side,t,u,lift=0){
        const xx=width*(.24+.26*t),zz=depth*.5*t,yy=y+height*Math.pow(1-t,1.7)+height*.15*Math.pow(t,5)+.075*u*u*t+lift;
        return side===0?[u*xx,yy,zz]:side===1?[-u*xx,yy,-zz]:side===2?[xx,yy,-u*zz]:[-xx,yy,u*zz];
      }
      for(let side=0;side<4;side++){
        const cols=side<2?6:4,start=positions.length/3;
        for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
          const t=row/rows,u=col/cols*2-1;positions.push(...point(side,t,u));
          tone.copy(base).lerp(shade,col%2?.13:.25).multiplyScalar(.94+.10*t);colors.push(tone.r,tone.g,tone.b);
        }
        for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
          const a=start+row*(cols+1)+col,b=a+cols+1;
          indices.push(a,b,b+1);if(side<2||row>0)indices.push(a,b+1,a+1);
        }
        for(const u of side<2?[-.66,0,.66]:[-.5,.5]){
          const channel=[];for(let row=0;row<=rows;row++)channel.push(point(side,row/rows,u,.018));
          detailCurve(group,channel,.014,tile,3,3);
        }
        const rim=[];for(let i=0;i<=4;i++)rim.push(point(side,1,i/2-1,.006));
        detailCurve(group,rim,.028,gold,4,3);
        const ridge=[];for(let row=0;row<=rows;row++)ridge.push(point(side,row/rows,-1,.027));
        detailCurve(group,ridge,.026,gold,3,3);
        const end=point(side,1,-1,.027);detailCurve(group,[point(side,.82,-1,.027),end,[end[0]*1.025,end[1]+.11,end[2]*1.025]],.023,gold,3,3);
      }
      detailCurve(group,[[-width*.25,y+height+.04,0],[0,y+height+.045,0],[width*.25,y+height+.04,0]],.036,gold,4,4);
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      mesh(geometry,material(0xffffff,{vertexColors:true,flatShading:false,side:T.DoubleSide,roughness:.66}),group);
      const snow=weatherSnow(group);const cap=mesh(geometry.clone(),snowMaterial,snow,0,.026,0);cap.castShadow=false;
      return group;
    }
    function ovalFoundation(parent,width,depth,y,height,color){
      const slab=cylinder(1,1,height,color,parent,0,y+height/2,0,32);slab.scale.set(width/2,1,depth/2);return slab;
    }
    function grandSlab(w,d,h,color,parent,x=0,y=0,z=0,r=.1){
      const shape=roundRectShape(w,d,r),source=new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:3});source.rotateX(-Math.PI/2);
      const positions=[],p=source.attributes.position,n=source.attributes.normal;
      // Keep the original sides, replacing both cap fans with short cells so
      // an upper balcony's underside cannot sort across the lower tiled roof.
      for(let i=0;i<p.count;i+=3)if(Math.abs(n.getY(i))<.9||Math.abs(n.getY(i+1))<.9||Math.abs(n.getY(i+2))<.9)for(let j=0;j<3;j++)positions.push(p.getX(i+j),p.getY(i+j),p.getZ(i+j));
      const outline=shape.getPoints(3).map(point=>[point.x,point.y]);
      const last=outline[outline.length-1];if(Math.hypot(outline[0][0]-last[0],outline[0][1]-last[1])<1e-8)outline.pop();
      const area=outline.reduce((sum,a,i)=>{const b=outline[(i+1)%outline.length];return sum+a[0]*b[1]-a[1]*b[0];},0);if(area<0)outline.reverse();
      function clip(points,a,b){
        const result=[],distance=p=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
        for(let i=0;i<points.length;i++){
          const start=points[i],end=points[(i+1)%points.length],ds=distance(start),de=distance(end),inside=ds>=-1e-8,next=de>=-1e-8;
          if(inside)result.push(start);if(inside!==next){const t=ds/(ds-de);result.push([start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t]);}
        }
        return result;
      }
      const columns=Math.ceil(w/.40),rows=Math.ceil(d/.40);
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const x0=-w/2+w*col/columns,x1=-w/2+w*(col+1)/columns,z0=-d/2+d*row/rows,z1=-d/2+d*(row+1)/rows;
        let polygon=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
        for(let edge=0;edge<outline.length&&polygon.length;edge++)polygon=clip(polygon,outline[edge],outline[(edge+1)%outline.length]);
        for(let i=1;i<polygon.length-1;i++){const a=polygon[0],b=polygon[i+1],c=polygon[i];positions.push(a[0],h,a[1],b[0],h,b[1],c[0],h,c[1],a[0],0,a[1],c[0],0,c[1],b[0],0,b[1]);}
      }
      source.dispose();const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
      return mesh(geometry,material(color),parent,x,y,z);
    }
    function jadeColumn(parent,x,z,base,height,jade,gold){
      cylinder(.056,.074,height,jade,parent,x,base+height/2,z,8);
      cylinder(.09,.10,.09,jade,parent,x,base+.045,z,8);
      box(.18,.07,.16,gold,parent,x,base+height-.025,z);
      box(.26,.055,.12,jade,parent,x,base+height+.035,z);
    }
    function lotusAccent(parent,x,z){
      const pad=mesh(new T.CircleGeometry(.17,12),material(0x6d9c83,{side:T.DoubleSide}),parent,x,.255,z);pad.rotation.x=-Math.PI/2;
      for(let i=0;i<5;i++){
        const a=i*Math.PI*2/5,petal=mesh(new T.OctahedronGeometry(.065,0),material(0xedd5c4),parent,x+Math.cos(a)*.035,.285,z+Math.sin(a)*.035);
        petal.scale.set(.75,.48,1.35);petal.rotation.y=a;
      }
      const ripple=mesh(new T.RingGeometry(.24,.252,24),material(0xc5dfcc,{side:T.DoubleSide}),parent,x,.253,z);ripple.rotation.x=-Math.PI/2;
    }
    function grandRoom(parent,{x=0,z=0,width,depth,base,height,wall,wood,front='door',windowWidth=.55,windowHeight=.41,glass=0xe6d8ac,side='both'}){
      const group=new T.Group();group.position.set(x,0,z);parent.add(group);
      function face(w,turn,xx,zz,openings){
        const shape=new T.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(w/2,height);shape.lineTo(-w/2,height);shape.closePath();
        for(const opening of openings){
          const hole=new T.Path(),cx=opening.x||0,cy=opening.y;
          if(opening.round)hole.absarc(cx,cy,opening.width/2,0,Math.PI*2,true);
          else {const hw=opening.width/2,hh=opening.height/2;hole.moveTo(cx-hw,cy-hh);hole.lineTo(cx-hw,cy+hh);hole.lineTo(cx+hw,cy+hh);hole.lineTo(cx+hw,cy-hh);hole.closePath();}
          shape.holes.push(hole);
        }
        const facade=new T.Group();facade.position.set(xx,base,zz);facade.rotation.y=turn;group.add(facade);
        mesh(new T.ShapeGeometry(shape,12),material(wall,{side:T.DoubleSide}),facade);
        return facade;
      }
      const doorHeight=height*.78;
      const frontOpenings=front==='door'?[{x:0,y:doorHeight/2+.009,width:.46,height:doorHeight-.018},...[-1,1].map(sign=>({x:sign*width*.32,y:height*.60,width:width*.22,height:height*.53}))]:[{x:0,y:height*.52,width:windowWidth,height:windowHeight,round:front==='moon'}];
      const facade=face(width,0,0,depth/2+.002,frontOpenings);
      if(front==='door'){
        box(.46,doorHeight,.048,wood,facade,0,doorHeight/2,.012);box(.37,doorHeight-.055,.025,0x4e6658,facade,0,doorHeight/2,.045);
        for(const xx of [-.15,.15])box(.024,doorHeight-.075,.018,0xc6b784,facade,xx,doorHeight/2,.061);
        mesh(new T.SphereGeometry(.027,6,4),material(0xdcc17f),facade,.11,doorHeight*.52,.078);
        for(const opening of frontOpenings.slice(1))lattice(facade,opening.x,opening.y,.015,opening.width,opening.height,wood,glass);
      }else lattice(facade,0,height*.52,.015,windowWidth,windowHeight,front==='moon'?0xd2bd83:wood,glass,front==='moon');
      for(const sign of [-1,1]){
        const opening={x:0,y:height*.55,width:Math.min(.43,depth*.42),height:Math.min(.53,height*.52)},hasWindow=side==='both'||side===(sign<0?'left':'right');
        const sideFace=face(depth,sign*Math.PI/2,sign*width/2,0,hasWindow?[opening]:[]);
        if(hasWindow)lattice(sideFace,0,opening.y,.015,opening.width,opening.height,wood,glass);
      }
      face(width,Math.PI,0,-depth/2,[]);
      // The stone balcony supplies the floor and the hip roof closes the room;
      // redundant flat lids would intersect the visible roof in Canvas sorting.
      for(const xx of [-width/2,width/2])for(const zz of [-depth/2,depth/2])box(.075,height+.04,.075,wood,group,xx,base+height/2,zz);
      for(const zz of [-depth/2,depth/2])for(const yy of [base+.065,base+height-.04])box(width+.10,.065,.065,wood,group,0,yy,zz+.012);
      return group;
    }
    function moonResidence(){
      const jade=0xdce5d4,stoneColor=0xa8c0b4,wood=0x577f78,gold=0xd2bd83,tile=0x5e958e,edge=0x315f60;
      root.userData.residenceDetails={storeys:2,wingPavilions:2,waterGarden:true,observatory:false,lanterns:6};
      // An open basin and annular rim leave no white solid disc under the pool.
      // This also keeps the actual Canvas triangles continuously jade-green.
      const basin=mesh(new T.CylinderGeometry(1,1,.17,32,1,true),material(stoneColor),g,0,.085,0);basin.scale.set(2.14,1,1.94);
      const poolBottom=mesh(new T.CircleGeometry(1,32),material(0x78b9b0,{side:T.DoubleSide}),g,0,.165,0);poolBottom.rotation.x=-Math.PI/2;poolBottom.scale.set(2.12,1.92,1);
      for(const radius of [1,.95]){const wall=mesh(new T.CylinderGeometry(radius,radius,.07,32,1,true),material(jade,{side:T.DoubleSide}),g,0,.205,0);wall.scale.set(2.075,1,1.875);}
      const rim=mesh(new T.RingGeometry(.95,1,32),material(jade,{side:T.DoubleSide}),g,0,.24,0);rim.rotation.x=-Math.PI/2;rim.scale.set(2.075,1.875,1);
      const water=mesh(new T.CircleGeometry(1,32),material(0x78b9b0,{roughness:.22,metalness:.06,transparent:true,opacity:.92,side:T.DoubleSide}),g,0,.245,0);water.rotation.x=-Math.PI/2;water.scale.set(1.985,1.785,1);water.castShadow=false;
      for(const x of [-.95,.95])for(const z of [-1.17,.31])cylinder(.075,.11,.39,stoneColor,g,x,.44,z,8);
      roundedSlab(2.40,1.96,.13,stoneColor,g,0,.51,-.46,.15);grandSlab(2.28,1.84,.06,jade,g,0,.64,-.46,.12);
      grandRoom(g,{z:-.65,width:1.95,depth:1.38,base:.70,height:1.11,wall:0xe7e7d2,wood});
      grandRoof(g,{z:-.65,y:1.77,width:2.60,depth:1.95,height:.37,tile,edge,gold});
      grandSlab(1.89,1.56,.085,jade,g,0,2.17,-.60,.10);
      grandRoom(g,{z:-.65,width:1.42,depth:1.12,base:2.255,height:.80,wall:0xe7e7d2,wood,front:'moon',windowWidth:.68,windowHeight:.68,glass:0x61978d});
      grandRoof(g,{z:-.65,y:3.015,width:2.04,depth:1.68,height:.70,tile:0x74a69a,edge,gold});
      cylinder(.052,.09,.16,gold,g,0,3.82,-.65,8);mesh(new T.OctahedronGeometry(.105,0),material(gold),g,0,3.96,-.65);
      for(const side of [-1,1]){
        rail(g,[side*.90,-.85],[side*.90,.14],2.255,jade,.28);rail(g,[side*.23,.15],[side*.90,.15],2.255,jade,.28);
        const x=side*1.53;
        for(const zz of [-.18,.78])cylinder(.065,.10,.35,stoneColor,g,x,.43,zz,8);
        roundedSlab(.91,1.36,.13,stoneColor,g,x,.55,.30,.13);roundedSlab(.85,1.29,.055,jade,g,x,.68,.30,.10);
        for(const xx of [x-.31,x+.31])for(const zz of [-.17,.77])jadeColumn(g,xx,zz,.735,.86,jade,gold);
        box(.75,.075,.08,wood,g,x,1.58,.77);box(.75,.075,.08,wood,g,x,1.58,-.17);
        grandRoof(g,{x,z:.30,y:1.59,width:1.07,depth:1.46,height:.47,tile,edge,gold});
        rail(g,[x+side*.34,-.14],[x+side*.34,.76],.74,jade,.29);rail(g,[x-.31,.78],[x+.31,.78],.74,jade,.29);
        roundedSlab(.48,.48,.08,jade,g,side*1.22,.65,.26,.06);
        rail(g,[side*1.02,-.03],[side*1.65,-.03],.735,jade,.25);
        rail(g,[side*.44,.45],[side*1.03,.45],.705,jade,.28);
        hangingLantern(g,x,1.29,.73,.09);
      }
      // A gently descending bridge exposes the water between its small piers.
      const bridgeTop=t=>.70-.34*t+.045*Math.sin(t*Math.PI);
      for(let i=0;i<9;i++){const t=i/8;box(.82,.055,.16,jade,g,0,bridgeTop(t),.53+1.12*t);}
      for(const side of [-1,1]){
        const upper=[],lower=[];
        for(let i=0;i<6;i++){
          const t=i/5,z=.55+t*1.08,y=bridgeTop(t);cylinder(.022,.03,.28,jade,g,side*.42,y+.14,z,6);
          upper.push([side*.42,y+.29,z]);lower.push([side*.42,y+.09,z]);
        }
        detailCurve(g,upper,.022,jade,5,3);detailCurve(g,lower,.017,jade,5,3);
      }
      roundedSlab(1.03,.29,.10,stoneColor,g,0,.24,1.70,.06);
      for(const[x,z]of[[-1.22,1.21],[1.22,1.24],[1.36,-1.10]])lotusAccent(g,x,z);
      for(const side of [-1,1]){hangingLantern(g,side*.80,1.48,.29,.105);hangingLantern(g,side*.58,2.71,.03,.085);}
    }
    function starResidence(){
      const blue=0x456d9b,deep=0x293f67,wood=0x51647c,gold=0xd6b56f,jade=0xe5e6d7,stoneColor=0xa8b9bc;
      root.userData.residenceDetails={storeys:3,wingPavilions:1,waterGarden:false,observatory:true,lanterns:6};
      ovalFoundation(g,4.28,3.88,0,.20,stoneColor);ovalFoundation(g,4.03,3.61,.20,.15,jade);
      roundedSlab(3.80,2.86,.17,stoneColor,g,0,.35,-.20,.78);grandSlab(3.67,2.75,.05,jade,g,0,.52,-.20,.74);
      grandRoom(g,{z:-.52,width:1.82,depth:1.40,base:.57,height:1.02,wall:0xeee9d7,wood,glass:0xe9d59d});
      for(const side of [-1,1])jadeColumn(g,side*.96,.39,.57,.98,jade,gold);
      grandRoof(g,{z:-.52,y:1.55,width:2.25,depth:1.96,height:.37,tile:blue,edge:deep,gold});
      grandSlab(1.91,1.65,.085,jade,g,0,1.94,-.48,.11);
      grandRoom(g,{z:-.52,width:1.48,depth:1.16,base:2.025,height:.66,wall:0xeee9d7,wood,glass:0xe9d59d});
      for(const side of [-1,1])rail(g,[side*.89,-.85],[side*.89,.30],2.03,jade,.27);
      rail(g,[-.88,.30],[.88,.30],2.03,jade,.27);
      grandRoof(g,{z:-.52,y:2.645,width:1.99,depth:1.72,height:.36,tile:blue,edge:deep,gold});
      grandSlab(1.50,1.35,.07,jade,g,0,3.03,-.52,.09);
      grandRoom(g,{z:-.52,width:1.12,depth:.88,base:3.10,height:.58,wall:0xeee9d7,wood,front:'window',windowWidth:.55,windowHeight:.41,glass:0x90aaa7});
      grandRoof(g,{z:-.52,y:3.635,width:1.72,depth:1.49,height:.58,tile:0x547eab,edge:deep,gold});
      cylinder(.038,.076,.18,gold,g,0,4.30,-.52,8);
      const crown=mesh(new T.OctahedronGeometry(.11,0),material(gold),g,0,4.43,-.52);crown.scale.set(.85,1.25,.85);
      // A lower side hall balances the tall central pavilion without hiding it.
      roundedSlab(.97,1.36,.07,jade,g,-1.48,.57,.22,.14);
      grandRoom(g,{x:-1.48,z:.22,width:.80,depth:1.16,base:.64,height:.99,wall:0xeee9d7,wood,front:'window',windowWidth:.40,windowHeight:.53,glass:0xe9d59d,side:'left'});
      grandRoof(g,{x:-1.48,z:.22,y:1.60,width:1.10,depth:1.49,height:.46,tile:blue,edge:deep,gold});
      // The other wing carries a real open observation terrace and armillary.
      grandRoom(g,{x:1.48,z:.22,width:.86,depth:1.19,base:.57,height:1.02,wall:0xeee9d7,wood,front:'window',windowWidth:.44,windowHeight:.51,glass:0xe9d59d,side:'right'});
      const deck=cylinder(1,1,.13,jade,g,1.48,1.655,.22,12);deck.scale.set(.61,1,.71);
      const rim=[];
      for(let i=0;i<=12;i++){
        const a=i*Math.PI/6,x=1.48+Math.cos(a)*.55,z=.22+Math.sin(a)*.65;rim.push([x,2.04,z]);
        if(i<12&&i%2===0){cylinder(.025,.034,.32,jade,g,x,1.88,z,6);mesh(new T.OctahedronGeometry(.041,0),material(gold),g,x,2.065,z);}
      }
      detailCurve(g,rim,.026,jade,12,3);
      cylinder(.19,.24,.10,stoneColor,g,1.48,1.77,.22,12);cylinder(.035,.075,.27,gold,g,1.48,1.95,.22,8);
      const instrument=new T.Group();instrument.position.set(1.48,2.28,.22);g.add(instrument);
      for(let i=0;i<3;i++){
        const ring=mesh(new T.TorusGeometry(.34-i*.021,.015,4,28),material(gold,{roughness:.42}),instrument);ring.rotation.set(i===1?Math.PI/2:.47,i===2?Math.PI/2:0,i*.41);
      }
      mesh(new T.OctahedronGeometry(.075,0),material(0xbad2d0,{emissive:0x8aafa8,emissiveIntensity:.15}),instrument);
      for(let i=0;i<5;i++)roundedSlab(1.32+i*.11,.24,.085,i%2?jade:stoneColor,g,0,.46-i*.075,.88+i*.18,.04);
      const seal=new T.Shape();
      for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?.12:.27,x=Math.cos(a)*r,z=Math.sin(a)*r;i?seal.lineTo(x,z):seal.moveTo(x,z);}seal.closePath();
      const emblem=mesh(new T.ShapeGeometry(seal),material(gold,{side:T.DoubleSide}),g,0,.575,.50);emblem.rotation.x=-Math.PI/2;emblem.castShadow=false;
      for(const side of [-1,1]){hangingLantern(g,side*.74,1.29,.38,.105);hangingLantern(g,side*.55,2.36,.22,.085);hangingLantern(g,side*1.48,1.34,.79,.09);}
    }

    const builders={lotusPond:()=>pondModel(g),moonArch:()=>moonArchModel(g),jadePavilion:()=>pavilionModel(g),blossomTree:()=>blossomModel(g),verdantPine:()=>greenTreeModel('verdantPine'),banyanTree:()=>greenTreeModel('banyanTree'),weepingWillow:()=>greenTreeModel('weepingWillow'),bambooResidence,mapleCourtyard,moonResidence,starResidence};
    if(!Object.hasOwn(builders,modelId))return null;
    builders[modelId]();

    // Bake local transforms before batching. Snow remains an independent layer;
    // its hidden caps, lamp anchors and petal geometry always belong to the item.
    g.updateMatrixWorld(true);
    const inverse=new T.Matrix4().copy(g.matrixWorld).invert(),copies=[],oldGeometry=new Set();
    for(const lamp of lamps){lamp.point.applyMatrix4(lamp.parent.matrixWorld).applyMatrix4(inverse);lamp.parent=g;}
    g.traverse(item=>{
      if(!item.isMesh)return;
      let inSnow=false;for(let p=item.parent;p&&p!==g;p=p.parent)if(p.userData.homesteadSnow){inSnow=true;break;}
      const matrix=new T.Matrix4().multiplyMatrices(inverse,item.matrixWorld),geometry=item.geometry.clone().applyMatrix4(matrix);
      const copy=new T.Mesh(geometry,item.material);copy.castShadow=item.castShadow;copy.receiveShadow=item.receiveShadow;
      copies.push({copy,inSnow});oldGeometry.add(item.geometry);
    });
    g.clear();oldGeometry.forEach(geometry=>geometry.dispose());snowCapGeometry.dispose();snowGroups.length=0;
    const winterLayer=new T.Group();winterLayer.name='owned-homestead-snow';winterLayer.userData.homesteadSnow=true;winterLayer.visible=false;g.add(winterLayer);snowGroups.push(winterLayer);
    for(const {copy,inSnow}of copies)(inSnow?winterLayer:g).add(copy);
    if(mergeDetails){mergeDetails(winterLayer);mergeDetails(g);}
    const bounds=new T.Box3().setFromObject(g),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const grandFit=modelId==='moonResidence'?{width:4.30,depth:3.90,height:4.20}:modelId==='starResidence'?{width:4.30,depth:3.90,height:4.62}:null;
    const targetWidth=residential?Math.min(footprint.width,3.82):footprint.width,targetDepth=residential?Math.min(footprint.depth,3.44):footprint.depth;
    const scale=grandFit?Math.min(1,Math.min(footprint.width,grandFit.width)/size.x,Math.min(footprint.depth,grandFit.depth)/size.z,grandFit.height/size.y):Math.min(1,targetWidth*.985/size.x,targetDepth*.985/size.z,residential?2.92/size.y:Infinity)*(residential?.90:1);
    g.scale.setScalar(scale);g.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
    root.updateMatrixWorld(true);
    const fitted=new T.Box3().setFromObject(root),fittedSize=fitted.getSize(new T.Vector3());
    root.userData.modelBounds={width:fittedSize.x,depth:fittedSize.z,height:fittedSize.y};
    root.userData.footprint={width:footprint.width,depth:footprint.depth};
    let environmentKey='';
    root.userData.homesteadRuntime={
      ownedMaterials,
      getLampAnchors(){return lamps;},
      setEnvironment(snapshot){
        const season=['spring','summer','autumn','winter'].includes(snapshot?.seasonId)?snapshot.seasonId:'spring';
        const daylight=Math.max(0,Math.min(1,Number.isFinite(snapshot?.daylight)?snapshot.daylight:snapshot?.phaseId==='night'?0:1));
        const key=season+':'+daylight;if(key===environmentKey)return false;environmentKey=key;
        winterLayer.visible=season==='winter';
        const color=new T.Color({spring:0xe8bbb0,summer:0x82a774,autumn:0xdba35b,winter:0xa3b6ae}[season]);
        for(const leaf of foliage){
          if(leaf.seasonStyle==='blossom')leaf.material.color.copy(leaf.base).lerp(color,season==='spring'?0:.85);
          else{
            const tint=new T.Color({spring:0x93b96b,summer:0x366a48,autumn:0xb2ac58,winter:0x93aaa1}[season]);
            const strength=leaf.seasonStyle==='evergreen'?{spring:.10,summer:.18,autumn:.16,winter:.34}[season]:{spring:.08,summer:.25,autumn:.56,winter:.60}[season];
            leaf.material.color.copy(leaf.base).lerp(tint,strength);
          }
        }
        for(const glow of glows)glow.emissiveIntensity=.12+(1-daylight)*1.5;
        return true;
      }
    };
    return root;
  };

  // A single equipped house on the floating residential court. Caches are bounded by
  // four catalogue IDs; no inventory, scenery editor or player state lives here.
  global.createSpiritResidenceScene=function({THREE:T,parent,material,mergeDetails,site}){
    const layer=new T.Group();layer.name='spirit-residence';parent.add(layer);
    const position=site||{x:-1.8,y:7.40,z:-12.8,scale:1.45};layer.position.set(position.x,position.y,position.z);
    // Keep shop models and placeable scenery at their original catalogue size;
    // this enlarged residence layer transforms geometry and lamp anchors alike.
    layer.scale.setScalar(Number.isFinite(position.scale)?Math.max(1,Math.min(1.8,position.scale)):1.45);
    const cache=new Map();let selected=null,environment={seasonId:'spring',phaseId:'day',daylight:1};
    function release(object,geometries,materials){
      object.traverse(item=>{if(item.geometry)geometries.add(item.geometry);});
      for(const mat of object.userData.homesteadRuntime?.ownedMaterials||[])materials.add(mat);
    }
    return {
      set(id){
        const next=global.SpiritHomestead?.getResidence(id)?id:null;
        if(next===selected)return false;selected=next;layer.clear();
        if(next){
          let object=cache.get(next);if(!object){object=global.createSpiritHomesteadModel({THREE:T,material,mergeDetails,id:next});if(!object){selected=null;return true;}object.userData.residenceId=next;cache.set(next,object);}
          object.userData.homesteadRuntime?.setEnvironment(environment);layer.add(object);layer.updateMatrixWorld(true);
        }
        return true;
      },
      setEnvironment(snapshot){environment=snapshot||environment;for(const object of layer.children)object.userData.homesteadRuntime?.setEnvironment(environment);},
      getFramingModel(){return layer.children[0]||null;},
      getLampAnchors(){return layer.children.flatMap(object=>object.userData.homesteadRuntime?.getLampAnchors()||[]);},
      dispose(){const geometries=new Set(),materials=new Set();for(const object of cache.values())release(object,geometries,materials);geometries.forEach(geometry=>geometry.dispose());materials.forEach(mat=>mat.dispose());cache.clear();layer.clear();parent.remove(layer);}
    };
  };
})(window);
