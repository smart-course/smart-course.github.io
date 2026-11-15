/* Landmark models share the garden's light/material pipeline and work in Canvas mode. */
(function (global) {
  'use strict';
  const palettes = {
    fengxia:{ink:0x657653,wood:0x925b43,roof:0xbc9052,trim:0xe0c58b,stone:0xb7bea1,pale:0xe1ddbd,leaf:0x7e9b62,accent:0xc87b4e,water:0x8bb5a0},
    xuanyue:{ink:0x5b7881,wood:0x5b7689,roof:0x76949b,trim:0xd7c28c,stone:0xa7beb1,pale:0xe5e4ca,leaf:0x87a88b,accent:0xa5c7bd,water:0x8ab8ad},
    lingxi:{ink:0x54765d,wood:0x7b8960,roof:0x829d6d,trim:0xd6c291,stone:0xb1bea0,pale:0xe3ddbc,leaf:0x7da568,accent:0xbd9c67,water:0x82b4a3},
    xinglan:{ink:0x587780,wood:0x5e7b88,roof:0x668f9a,trim:0xcdb47a,stone:0xa6bcb0,pale:0xe1dfc3,leaf:0x88a392,accent:0xc7a968,water:0x9bbfb4}
  };
  const bounds={gate:{width:3.2,depth:1.45},spring:{width:2.5,depth:2.5},library:{width:2.45,depth:1.75}};
  global.createSpiritSectModel = function ({THREE:T,material,mergeDetails,sectId,stage}) {
    const p=typeof sectId==='string'&&Object.prototype.hasOwnProperty.call(palettes,sectId)?palettes[sectId]:null;
    const footprint=typeof stage==='string'&&Object.prototype.hasOwnProperty.call(bounds,stage)?bounds[stage]:null;
    if(!T||!p||!footprint||typeof material!=='function')return null;
    const root=new T.Group(),g=new T.Group();root.add(g);
    root.name=`spirit-sect-${sectId}-${stage}`;
    root.userData.sectId=sectId;root.userData.sectStage=stage;
    const details=global.SpiritSects?.map?.[sectId]?.stages?.find(item=>item.id===stage);
    root.userData.landmarkName=details?.name||`${sectId}-${stage}`;
    function add(geometry,color,x=0,y=0,z=0,extra){
      const m=new T.Mesh(geometry,material(color,extra));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;
    }
    const box=(w,h,d,c,x=0,y=0,z=0)=>add(new T.BoxGeometry(w,h,d),c,x,y,z);
    const cyl=(rt,rb,h,c,x=0,y=0,z=0,n=8)=>add(new T.CylinderGeometry(rt,rb,h,n),c,x,y,z);
    const ball=(r,c,x,y,z,sx=1,sy=1,sz=1)=>{const m=add(new T.SphereGeometry(r,7,5),c,x,y,z);m.scale.set(sx,sy,sz);return m;};
    function rod(a,b,r,c,rb=r,sides=6){
      const va=new T.Vector3(...a),vb=new T.Vector3(...b),v=vb.clone().sub(va);
      const m=cyl(rb,r,v.length(),c,...va.add(vb).multiplyScalar(.5).toArray(),sides);
      m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return m;
    }
    function tube(points,r,c,n=10){return add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v=>new T.Vector3(...v))),n,r,4,false),c);}
    function ring(r,t,c,x,y,z,axis='z',segments=24){
      const m=add(new T.TorusGeometry(r,t,5,segments),c,x,y,z);
      if(axis==='y')m.rotation.x=-Math.PI/2;if(axis==='x')m.rotation.y=Math.PI/2;return m;
    }
    function slab(w,d,y=.12,x=0,z=0){box(w,.12,d,p.stone,x,y-.06,z);box(w-.10,.07,d-.10,p.pale,x,y+.035,z);}
    function steps(w,d,n=3){for(let i=0;i<n;i++)slab(w-i*.22,d-i*.18,.12+i*.12,0,-i*.055);}
    function roof(x,y,z,w,d){
      const xs=[-.5,-.35,0,.35,.5],zs=[-.5,-.28,0,.28,.5],verts=[];
      const point=(ix,iz,lower=0)=>{const a=xs[ix],b=zs[iz];return [x+a*w,y+.30*(1-Math.abs(b)*2)+.12*Math.pow(Math.abs(a)*2,3)+.10*Math.pow(Math.abs(b)*2,5)-lower,z+b*d];};
      const face=(a,b,c,d)=>verts.push(...a,...b,...c,...a,...c,...d);
      for(let i=0;i<4;i++)for(let j=0;j<4;j++){face(point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1));face(point(i,j,.065),point(i,j+1,.065),point(i+1,j+1,.065),point(i+1,j,.065));}
      for(let i=0;i<4;i++){face(point(i,0),point(i,0,.065),point(i+1,0,.065),point(i+1,0));face(point(i,4),point(i+1,4),point(i+1,4,.065),point(i,4,.065));}
      for(let j=0;j<4;j++){face(point(0,j),point(0,j+1),point(0,j+1,.065),point(0,j,.065));face(point(4,j),point(4,j,.065),point(4,j+1,.065),point(4,j+1));}
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(verts,3));geometry.computeVertexNormals();
      add(geometry,p.roof,0,0,0,{side:T.DoubleSide});
      for(const side of [-1,1])tube([[-w/2+x,y+.24,z+side*d/2],[x-w*.32,y+.13,z+side*d/2],[x,y+.115,z+side*d/2],[x+w*.32,y+.13,z+side*d/2],[x+w/2,y+.24,z+side*d/2]],.022,p.trim,8);
      tube([[x-w/2,y+.43,z],[x-w*.27,y+.32,z],[x,y+.32,z],[x+w*.27,y+.32,z],[x+w/2,y+.43,z]],.027,p.trim,8);
      for(let i=-2;i<=2;i++){const dx=i*w*.15,raise=.12*Math.pow(Math.abs(dx)/(w/2),3);tube([[x+dx,y+.12+raise,z-d/2],[x+dx,y+.32+raise,z],[x+dx,y+.12+raise,z+d/2]],.012,p.pale,6);}
      box(w*.84,.105,d*.75,p.wood,x,y-.025,z);
    }
    function lantern(x,y,z,s=.7){
      cyl(.18*s,.22*s,.11*s,p.stone,x,y+.05*s,z);
      cyl(.045*s,.07*s,.48*s,p.wood,x,y+.32*s,z);
      cyl(.15*s,.11*s,.24*s,0xf1d499,x,y+.65*s,z,6);
      for(const dx of [-.11,.11])box(.024*s,.28*s,.025*s,p.wood,x+dx*s,y+.65*s,z+.08*s);
      cyl(.04*s,.21*s,.14*s,p.roof,x,y+.84*s,z,6);
      cyl(.025*s,.05*s,.10*s,p.trim,x,y+.95*s,z,6);
    }
    function hangingLamp(x,y,z){
      rod([x,y+.21,z],[x,y+.05,z],.013,p.trim);
      cyl(.10,.10,.18,0xf1d499,x,y-.02,z,6);ring(.10,.013,p.wood,x,y+.07,z,'y',12);ring(.10,.013,p.wood,x,y-.11,z,'y',12);
      rod([x,y-.13,z],[x,y-.22,z],.011,p.trim);
    }
    function maple(x,z,height=1.25){
      const y=.19;rod([x,y,z],[x+.02,y+height*.72,z],.035,p.wood,.023);
      for(const [dx,dz,hy] of [[-.20,0,.59],[.20,.05,.68],[-.08,-.10,.85]])rod([x,y+height*.38,z],[x+dx,y+height*hy,z+dz],.018,p.wood,.012);
      const leafShape=new T.Shape();[[0,-1],[.27,-.4],[.8,-.75],[.6,-.08],[1,.16],[.35,.45],[.24,.9],[0,.6],[-.4,.85],[-.38,.4],[-1,.1],[-.6,-.1],[-.78,-.7],[-.28,-.4]].forEach(([a,b],i)=>i?leafShape.lineTo(a,b):leafShape.moveTo(a,b));leafShape.closePath();
      [[-.21,0,.64],[.21,.05,.73],[-.06,-.11,.91],[.03,.13,.74],[-.15,.10,.82],[.16,-.06,.91],[.23,.04,.57],[-.2,-.07,.49]].forEach(([dx,dz,h],i)=>{
        const leaf=add(new T.ExtrudeGeometry(leafShape,{depth:.025,bevelEnabled:false}),i%3?p.accent:0xad6247,x+dx,y+height*h,z+dz);
        leaf.scale.setScalar(.21+(i%3)*.015);leaf.rotation.set(-.35+(i%3)*.30,((i*1.7)%3)-1.5,.2+(i%2)*.5);
      });
    }
    function bamboo(x,z,height=1.25){
      for(let i=0;i<3;i++){
        const dx=(i-1)*.10,h=height*(.80+i*.1);cyl(.018,.024,h,p.wood,x+dx,.18+h/2,z+(i%2)*.06,5);
        for(let j=1;j<=3;j++){
          const y=.18+h*j/4;cyl(.028,.028,.025,p.trim,x+dx,y,z+(i%2)*.06,5);
          const a=i*2.4+j*.8,leaf=add(new T.OctahedronGeometry(.16,0),p.leaf,x+dx+Math.cos(a)*.13,y+.04,z+Math.sin(a)*.13);
          leaf.scale.set(.34,.16,1);leaf.rotation.y=-a+Math.PI/2;
        }
      }
    }
    function herb(x,y,z,s=1){
      cyl(.012*s,.02*s,.27*s,p.ink,x,y+.14*s,z,5);
      for(let i=0;i<3;i++){const a=i*2.3,leaf=add(new T.OctahedronGeometry(.12*s,0),p.leaf,x+Math.cos(a)*.07*s,y+(.08+i*.05)*s,z+Math.sin(a)*.07*s);leaf.scale.set(1.1,.34,.55);leaf.rotation.y=-a;}
      const bud=add(new T.OctahedronGeometry(.045*s,0),p.trim,x,y+.31*s,z);bud.scale.set(1,1.5,1);
    }
    function books(x,y,z,w=.3){
      box(w+.06,.035,.19,p.wood,x,y-.02,z);
      for(let i=0;i<4;i++){const h=.18+(i%2)*.035;box(w/5,h,.13,[p.roof,p.trim,p.leaf,p.wood][i],x+(i-1.5)*w/4,y+h/2,z);box(w/5*.70,.012,.012,p.pale,x+(i-1.5)*w/4,y+h*.75,z+.072);}
    }
    function scroll(x,y,z){
      box(.34,.025,.24,p.pale,x,y,z);for(const dx of [-.18,.18]){const m=cyl(.025,.025,.29,p.trim,x+dx,y+.02,z);m.rotation.x=Math.PI/2;}
      for(let i=0;i<3;i++)box(.18,.009,.008,p.wood,x,y+.018,z+(i-1)*.045);
    }
    function star(x,y,z,r=.12){const m=add(new T.OctahedronGeometry(r,0),p.trim,x,y,z);m.scale.set(.65,1.3,.65);return m;}
    function bridge(x,z,w=1.05,y=.33){
      for(let i=0;i<7;i++){const dx=(i-3)*w/7,up=Math.cos(dx/w*Math.PI)*.12;box(w/7+.01,.06,.43,p.trim,x+dx,y+up,z);}
      for(const dz of [-.23,.23]){
        tube([[x-w/2,y+.23,z+dz],[x,y+.39,z+dz],[x+w/2,y+.23,z+dz]],.024,p.wood);
        for(const dx of [-.45,-.22,0,.22,.45]){const up=Math.cos(dx/w*Math.PI)*.12;rod([x+dx,y+up,z+dz],[x+dx,y+up+.24,z+dz],.018,p.wood);}
      }
    }
    function ribbon(points,width,y,color){
      const curve=new T.CatmullRomCurve3(points.map(([x,z])=>new T.Vector3(x,y,z))),vs=[];
      const edge=t=>{const c=curve.getPoint(t),v=curve.getTangent(t),n=new T.Vector3(-v.z,0,v.x).normalize().multiplyScalar(width/2);return [c.clone().add(n),c.clone().sub(n)];};
      for(let i=0;i<20;i++){const [a,b]=edge(i/20),[c,d]=edge((i+1)/20);vs.push(...a.toArray(),...b.toArray(),...c.toArray(),...b.toArray(),...d.toArray(),...c.toArray());}
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vs,3));geo.computeVertexNormals();add(geo,color,0,0,0,{side:T.DoubleSide});
    }
    function armillary(x,y,z,r=.48){
      const a=ring(r,.025,p.trim,x,y,z);a.rotation.y=.25;
      const b=ring(r*.98,.018,p.wood,x,y,z,'x');b.rotation.z=.35;
      const c=ring(r*1.07,.020,p.trim,x,y,z,'y');c.rotation.x=-1.13;c.rotation.z=.30;
      rod([x-r*.35,y-r*.9,z],[x+r*.35,y+r*.9,z],.013,p.wood);star(x,y,z,r*.18);
    }
    if(stage==='gate'){
      if(sectId==='fengxia'){
        steps(2.76,1.25,3);
        for(const x of [-.80,.80]){cyl(.095,.12,1.61,p.wood,x,1.17,-.10,8);slab(.34,.35,.42,x,-.10);box(.034,1.10,.023,p.trim,x,1.22,.015);}
        box(1.93,.15,.28,p.wood,0,1.93,-.10);roof(0,2.04,-.10,2.44,.98);
        box(.59,.27,.06,p.wood,0,1.87,.10);box(.43,.02,.02,p.trim,0,1.91,.14);box(.30,.02,.02,p.trim,0,1.84,.14);
        hangingLamp(-.53,1.55,-.08);hangingLamp(.53,1.55,-.08);maple(-1.22,.08,1.40);maple(1.20,.10,1.54);
      }else if(sectId==='xuanyue'){
        steps(2.78,1.20,2);
        ring(.88,.10,p.stone,0,1.22,-.05);ring(.88,.027,p.pale,0,1.22,.045);ring(.762,.014,p.trim,0,1.22,.055);
        for(const x of [-1.19,1.19]){slab(.39,.46,.25,x,.02);box(.25,.71,.29,p.wood,x,.66,.02);box(.31,.10,.35,p.pale,x,1.05,.02);box(.14,.39,.018,p.accent,x,.68,.175);lantern(x,1.10,.02,.47);}
        const cres=add(new T.TorusGeometry(.17,.035,5,15,Math.PI*1.36),p.trim,0,2.19,-.05);cres.rotation.z=.40;herb(-.98,.25,.37,.62);herb(1.04,.25,.36,.58);
      }else if(sectId==='lingxi'){
        steps(2.94,1.24,2);
        for(const [x,h] of [[-.91,1.39],[.91,1.60]]){
          for(const dx of [-.28,.28])for(const dz of [-.25,.25]){cyl(.035,.045,h,p.wood,x+dx,.30+h/2,dz,6);cyl(.055,.055,.025,p.trim,x+dx,.77,dz,6);}
          slab(.73,.68,.36,x,0);roof(x,h+.31,0,1.06,.92);hangingLamp(x,h+.07,0);
        }
        bridge(0,.02,1.34,.70);bamboo(-1.34,-.12,.95);bamboo(1.32,-.12,1.10);
        ribbon([[-.2,-.5],[.17,-.2],[-.08,.2],[.23,.52]],.19,.26,p.water);
      }else{
        steps(2.66,1.25,2);
        const frame=[[-.71,.36,0],[-1.11,.74,0],[-1.11,1.63,0],[-.72,2.05,0],[.72,2.05,0],[1.11,1.63,0],[1.11,.74,0],[.71,.36,0]];
        for(let i=0;i<frame.length-1;i++){rod(frame[i],frame[i+1],.067,p.wood,undefined,8);rod(frame[i].map((v,j)=>j===2?v+.065:v),frame[i+1].map((v,j)=>j===2?v+.065:v),.013,p.trim);}
        for(const x of [-.83,.83])slab(.40,.51,.26,x,0);
        const disk=cyl(.80,.85,.10,p.stone,0,.29,0,24);disk.scale.z=.58;
        for(const r of [.34,.63]){const m=ring(r,.013,p.trim,0,.35,0,'y');m.scale.y=.58;}
        rod([-.78,.35,0],[.78,.35,0],.009,p.wood);rod([0,.35,-.43],[0,.35,.43],.009,p.wood);
        armillary(0,2.30,0,.32);for(const [x,y] of [[-.68,1.66],[.68,1.23],[.35,1.84]])star(x,y,.05,.045);
      }
    }else if(stage==='spring'){
      if(sectId==='fengxia'){
        slab(2.31,2.29,.12);
        for(let i=0;i<3;i++){
          const w=2.14-i*.28,z=.67-i*.65,h=.22+i*.24;
          box(w,h,.67,p.stone,0,.15+h/2,z);box(w-.10,.05,.55,0x948d67,0,.17+h,z);
          for(const dx of [-w/2+.06,w/2-.06])box(.065,.045,.55,p.water,dx,.19+h,z);
          box(w-.12,.04,.05,p.water,0,.20+h,z+.26);
          for(let j=0;j<4;j++)herb((j-1.5)*w/4,.21+h,z+((j%2)-.5)*.14,.73);
        }
        tube([[1.03,.92,-.64],[1.03,.72,-.32],[1.03,.50,.29],[1.03,.26,.94]],.032,p.water,8);
      }else if(sectId==='xuanyue'){
        cyl(1.12,1.18,.17,p.stone,0,.09,0,28);ring(1.06,.07,p.pale,0,.20,0,'y',28);cyl(1.02,1.02,.025,p.water,0,.18,0,28);
        for(const r of [.26,.51,.80])ring(r,.008,0xd7e5cc,-.06,.201,.04,'y',28);
        const crescent=new T.Shape();
        for(let i=0;i<=20;i++){const a=.23*Math.PI+i*1.54*Math.PI/20;const x=Math.cos(a)*.66,y=Math.sin(a)*.66;i?crescent.lineTo(x,y):crescent.moveTo(x,y);}
        for(let i=20;i>=0;i--){const a=.23*Math.PI+i*1.54*Math.PI/20;crescent.lineTo(.20+Math.cos(a)*.52,Math.sin(a)*.57);}crescent.closePath();
        add(new T.ExtrudeGeometry(crescent,{depth:.10,bevelEnabled:false}),p.stone,.39,.89,-.72);
        const arc=add(new T.TorusGeometry(.66,.018,5,24,Math.PI*1.52),p.pale,.39,.89,-.60);arc.rotation.z=Math.PI*.24;
        lantern(-.80,.18,.34,.57);herb(.71,.19,.65,.74);ball(.11,p.leaf,-.62,.24,-.26,1,.17,1.4);ball(.10,p.leaf,-.46,.24,-.39,1.2,.17,1);
      }else if(sectId==='lingxi'){
        cyl(1.12,1.19,.17,p.stone,0,.09,0,24);cyl(1.10,1.10,.04,0xc1cba9,0,.19,0,24);
        const points=[[-.33,-1.04],[.15,-.64],[-.10,-.20],[.15,.23],[-.20,.65],[.20,1.03]];
        ribbon(points,.31,.219,p.pale);ribbon(points,.245,.224,p.water);bridge(0,0,1.10,.29);
        for(const [x,z] of [[-.68,.46],[.65,.48],[-.65,-.46],[.65,-.39]]){cyl(.10,.13,.23,p.stone,x,.34,z,8);cyl(.17,.16,.065,p.pale,x,.49,z,8);}
        bamboo(-.68,-.66,1.04);bamboo(.68,-.68,1.24);herb(-.60,.23,.77,.68);herb(.64,.23,.76,.62);
      }else{
        cyl(1.15,1.21,.17,p.stone,0,.09,0,24);cyl(1.11,1.14,.06,p.pale,0,.205,0,24);cyl(1.06,1.06,.025,p.water,0,.249,0,24);
        for(const r of [.31,.64,.97])ring(r,.011,p.trim,0,.270,0,'y',28);
        for(const d of [-.72,-.36,0,.36,.72]){
          const extent=Math.sqrt(1.01-d*d);rod([d,.267,-extent],[d,.267,extent],.006,p.wood);rod([-extent,.267,d],[extent,.267,d],.006,p.wood);
        }
        cyl(.15,.26,.18,p.wood,0,.36,0,8);armillary(0,1.04,0,.59);rod([0,.41,0],[0,.52,0],.055,p.wood);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;star(Math.cos(a)*.98,.29,Math.sin(a)*.98,.038);}
      }
    }else{
      if(sectId==='fengxia'){
        slab(2.30,1.64,.13);box(1.30,1.06,1.02,p.pale,-.32,.73,-.10);
        for(const x of [-.92,-.32,.28])box(.065,1.14,.07,p.wood,x,.74,.445);
        for(const x of [-.64,0]){box(.45,.71,.04,p.wood,x,.80,.45);books(x,.52,.50,.34);books(x,.83,.50,.34);}
        roof(-.32,1.32,-.10,1.66,1.33);box(.75,.43,.71,p.pale,-.32,1.95,-.10);roof(-.32,2.16,-.10,1.13,.97);
        ring(.10,.025,p.wood,-.32,1.96,.267);box(.025,.20,.02,p.trim,-.32,1.96,.294);
        for(const x of [.54,.98])for(const z of [-.42,.42])box(.045,.91,.045,p.wood,x,.62,z);
        roof(.77,1.05,0,.72,1.17);box(.50,.055,.40,p.trim,.76,.49,.12);scroll(.76,.53,.12);
        for(const z of [-.43,.43])rod([.48,.57,z],[1.04,.57,z],.023,p.wood);
      }else if(sectId==='xuanyue'){
        slab(2.29,1.59,.12);
        for(const x of [-.67,.67]){
          box(.51,1.16,.65,p.wood,x,.76,-.08);box(.40,1.04,.08,p.stone,x,.77,.265);
          for(const y of [.30,.64,.98])books(x,y,.35,.36);
          for(const z of [-.47,.46])cyl(.045,.055,1.20,p.wood,x, .78,z,8);
        }
        box(1.88,.13,.94,p.roof,0,1.38,-.05);cyl(.60,.64,.51,p.stone,0,1.70,-.07,16);
        ring(.27,.048,p.wood,0,1.72,.51);ring(.27,.012,p.trim,0,1.72,.565);
        rod([-.25,1.72,.568],[.25,1.72,.568],.013,p.trim);rod([0,1.47,.568],[0,1.97,.568],.013,p.trim);
        cyl(.18,.82,.34,p.roof,0,2.14,-.07,12);ring(.78,.027,p.pale,0,1.99,-.07,'y');cyl(.045,.10,.17,p.trim,0,2.40,-.07,6);
        hangingLamp(-.27,1.20,.13);hangingLamp(.27,1.20,.13);scroll(0,.22,.28);
      }else if(sectId==='lingxi'){
        slab(2.25,1.61,.12);
        for(const x of [-.96,-.31,.31,.96])for(const z of [-.52,.52]){cyl(.035,.05,1.14,p.wood,x,.76,z,6);cyl(.058,.058,.045,p.trim,x,1.21,z,6);}
        roof(-.58,1.36,0,1.13,1.44);roof(.58,1.36,0,1.13,1.44);
        tube([[-.42,1.55,0],[0,1.85,0],[.42,1.55,0]],.065,p.roof,10);tube([[-.43,1.62,0],[0,1.93,0],[.43,1.62,0]],.022,p.trim,10);
        box(1.58,.09,.43,p.trim,0,.67,.13);for(const x of [-.60,.60])for(const z of [-.02,.28])box(.05,.43,.05,p.wood,x,.42,z);
        for(const x of [-.65,-.23,.23,.65]){cyl(.095,.12,.27,p.wood,x,.31,.58,6);cyl(.13,.13,.055,p.trim,x,.47,.58,6);}
        box(.65,.06,.35,p.trim,0,.78,-.43);for(const x of [-.24,.24])box(.04,.56,.04,p.wood,x,.48,-.43);scroll(0,.82,-.43);scroll(-.31,.73,.13);books(.39,.72,.13,.23);
      }else{
        slab(2.25,1.58,.12);cyl(.46,.53,1.62,p.stone,.45,.97,-.10,8);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([.45+Math.cos(a)*.47,.22,-.10+Math.sin(a)*.47],[.45+Math.cos(a)*.43,1.78,-.10+Math.sin(a)*.43],.025,p.wood);}
        cyl(.64,.60,.13,p.roof,.45,1.83,-.10,8);cyl(.63,.63,.045,p.pale,.45,1.92,-.10,16);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([.45+Math.cos(a)*.58,1.96,-.1+Math.sin(a)*.58],[.45+Math.cos(a)*.58,2.18,-.1+Math.sin(a)*.58],.014,p.trim);}
        ring(.59,.016,p.trim,.45,2.18,-.1,'y',16);
        rod([.45,1.95,-.10],[.45,2.23,-.10],.045,p.wood);rod([.13,2.20,.05],[.82,2.58,-.23],.075,p.wood,.11,12);
        rod([.80,2.57,-.22],[.86,2.60,-.25],.125,p.trim,.125,12);rod([.86,2.60,-.25],[.87,2.605,-.255],.09,p.water,.09,12);
        cyl(.27,.35,.48,p.wood,-.69,.40,.12,8);cyl(.42,.40,.09,p.pale,-.69,.69,.12,16);ring(.33,.014,p.trim,-.69,.745,.12,'y',20);ring(.17,.009,p.trim,-.69,.747,.12,'y',16);
        rod([-1.08,.75,.12],[-.30,.75,.12],.007,p.wood);rod([-.69,.75,-.27],[-.69,.75,.51],.007,p.wood);star(-.69,.77,.12,.045);
        for(let i=0;i<5;i++)box(.28,.12+i*.13,.20,p.stone,-.20+i*.10,.21+i*.065,.62-i*.15);
      }
    }
    // Fit the *complete* silhouette (including roof tips and leaves) to the
    // authoritative common footprint. Positioning/rotation rules never change.
    // Measure the final batched geometry: rotating an unmerged leaf or an arc
    // otherwise makes its transformed local box larger than the visible mesh.
    if(mergeDetails)mergeDetails(g);
    g.updateMatrixWorld(true);
    let box3=new T.Box3().setFromObject(g),size=box3.getSize(new T.Vector3());
    const scale=Math.min(1,footprint.width*.985/size.x,footprint.depth*.985/size.z);
    const center=box3.getCenter(new T.Vector3());g.scale.setScalar(scale);
    g.position.set(-center.x*scale,-box3.min.y*scale,-center.z*scale);
    root.updateMatrixWorld(true);box3=new T.Box3().setFromObject(root);size=box3.getSize(new T.Vector3());
    root.userData.modelBounds={width:size.x,height:size.y,depth:size.z};
    root.userData.footprint={...footprint};
    return root;
  };
})(window);
