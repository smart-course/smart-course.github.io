(function () {
  'use strict';

  const NAMES = { huangjing: '黄精芝', zihou: '紫猴花', tianling: '天灵果', yueyang: '养魂木', jiuqu: '九曲灵参' };
  const PALETTE = { huangjing: 0xf3bf53, zihou: 0xc48be0, tianling: 0xf1b354, yueyang: 0x8ec4a2, jiuqu: 0xe1a94d };

  // Pointer controls are independent of the plant clock and the rendering loop.
  // One finger scrolls the ordinary page; the focused garden owns one-finger orbit.
  function createScenePointerControls(options) {
    const {container,canvas}=options;
    const touches=new Map(),captures=new Map();
    const originalTouchAction=container.style.touchAction;
    let focused=false,editingDecor=false,mouse=null,gesture=null,nativeMultiple=false,blockedUntil=0;
    const labelFor=e=>e.target?.closest?.('.spirit-plot-label');
    const isInspection=e=>!!e.target?.closest?.('.spirit-inspection');
    function blockClick(){blockedUntil=Date.now()+450;}
    function release(id){
      const target=captures.get(id);captures.delete(id);
      try {if(target?.hasPointerCapture?.(id))target.releasePointerCapture(id);}catch(_){}
    }
    function capture(e,target){
      try {target.setPointerCapture(e.pointerId);captures.set(e.pointerId,target);}catch(_){}
    }
    function cancel(){
      if(mouse||gesture||touches.size)blockClick();
      if(mouse?.decorId)options.onDecorationDrag?.('cancel',null,mouse.decorId);
      if(gesture?.decorId)options.onDecorationDrag?.('cancel',null,gesture.decorId);
      mouse=null;gesture=null;touches.clear();nativeMultiple=false;
      for(const id of Array.from(captures.keys()))release(id);
      canvas.style.cursor=editingDecor?'crosshair':'grab';options.onHover(null);
    }
    function applyTouchMode(){
      // Both the child and its scrolling ancestor must allow native page panning.
      canvas.style.touchAction=container.style.touchAction=focused||editingDecor?'none':'pan-y';
      container.dataset.touchMode=editingDecor?'decorate':focused?'orbit':'scroll';
      canvas.setAttribute('aria-label',editingDecor
        ? '洞天布置预览，点击装饰选择，点击空地摆放，拖动装饰移动，双指或滚轮调整视角'
        : options.isMobile()
        ? focused?'三维灵田，单指拖动旋转，双指缩放，点击田块查看或照料':'三维灵田，单指上下滑动页面，双指缩放或转动，点击田块查看或照料'
        : '三维灵田，拖动旋转，滚轮缩放，点击田块可播种、浇水、清理枯草或采收');
    }
    function setTouchMode(value){
      const next=!!value;
      if(next!==focused){cancel();focused=next;}
      applyTouchMode();
    }
    function setDecorationMode(value){
      const next=!!value;
      if(next!==editingDecor){cancel();editingDecor=next;}
      applyTouchMode();
    }
    function pairBaseline(){
      if(!gesture||touches.size<2)return;
      if(gesture.decorId){options.onDecorationDrag?.('cancel',null,gesture.decorId);gesture.decorId=null;}
      const [a,b]=Array.from(touches.values());
      gesture.multiple=true;gesture.moved=true;
      gesture.pair={ids:[a.id,b.id],distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),x:(a.x+b.x)/2,y:(a.y+b.y)/2,...options.getCamera()};
      options.onHover(null);
    }
    function pointerDown(e){
      if(e.button!==undefined&&e.button!==0||isInspection(e))return;
      if(e.pointerType==='touch'){
        if(!touches.size){
          gesture={moved:false,multiple:e.isPrimary===false,focused,pose:options.getCamera(),pair:null};
          mouse=null;options.onHover(null);
          if(editingDecor){
            gesture.decorId=options.pickDecoration?.(e)||null;
            if(gesture.decorId){options.onDecorationSelect?.(gesture.decorId);options.onDecorationDrag?.('start',e,gesture.decorId);}
          }
        }
        const label=labelFor(e),point={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,label:!!label};
        touches.set(e.pointerId,point);
        // Capturing a label to itself preserves its normal, direct click action.
        capture(e,label||canvas);
        if(touches.size>=2)pairBaseline();
        return;
      }
      if(touches.size||labelFor(e))return;
      mouse={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,...options.getCamera(),decorId:editingDecor?options.pickDecoration?.(e)||null:null};
      if(mouse.decorId){options.onDecorationSelect?.(mouse.decorId);options.onDecorationDrag?.('start',e,mouse.decorId);}
      capture(e,canvas);
    }
    function pointerMove(e){
      if(e.pointerType==='touch'){
        const point=touches.get(e.pointerId);if(!point||!gesture)return;
        point.x=e.clientX;point.y=e.clientY;
        if(touches.size>=2){
          const pair=gesture.pair;
          if(!pair||!pair.ids.every(id=>touches.has(id))){pairBaseline();return;}
          const [a,b]=pair.ids.map(id=>touches.get(id));
          const distance=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));
          options.applyCamera({angle:pair.angle-((a.x+b.x)/2-pair.x)*.004,elevation:pair.elevation+((a.y+b.y)/2-pair.y)*.002,zoom:pair.zoom*distance/pair.distance});
          canvas.style.cursor='grabbing';
          if(e.cancelable)e.preventDefault();
          return;
        }
        // The remaining finger after a pinch must never turn into a tap or a new drag.
        if(gesture.multiple)return;
        const dx=point.x-point.startX,dy=point.y-point.startY;
        if(Math.hypot(dx,dy)>10)gesture.moved=true;
        if(editingDecor){
          if(gesture.decorId&&gesture.moved)options.onDecorationDrag?.('move',e,gesture.decorId);
          if(e.cancelable)e.preventDefault();
          return;
        }
        if(gesture.focused&&gesture.moved){
          options.applyCamera({angle:gesture.pose.angle-dx*.004,elevation:gesture.pose.elevation+dy*.002,zoom:gesture.pose.zoom});
          canvas.style.cursor='grabbing';
          if(e.cancelable)e.preventDefault();
        }
        return;
      }
      if(mouse&&mouse.id===e.pointerId){
        const dx=e.clientX-mouse.x,dy=e.clientY-mouse.y;
        if(Math.abs(dx)+Math.abs(dy)>7)mouse.moved=true;
        if(mouse.moved){
          if(editingDecor&&mouse.decorId)options.onDecorationDrag?.('move',e,mouse.decorId);
          else options.applyCamera({angle:mouse.angle-dx*.004,elevation:mouse.elevation+dy*.002,zoom:mouse.zoom});
          canvas.style.cursor='grabbing';options.onHover(null);
        }
        return;
      }
      if(editingDecor&&!mouse&&!touches.size){canvas.style.cursor=options.pickDecoration?.(e)?'move':'crosshair';return;}
      if(!mouse&&!touches.size&&!labelFor(e)&&!isInspection(e))options.onHover(options.pick(e));
    }
    function pointerUp(e){
      if(e.pointerType==='touch'){
        const point=touches.get(e.pointerId),was=gesture;
        if(!point||!was)return;
        if(Math.hypot(e.clientX-point.startX,e.clientY-point.startY)>10)was.moved=true;
        const tap=touches.size===1&&!was.multiple&&!was.moved&&!nativeMultiple&&Date.now()>=blockedUntil;
        touches.delete(e.pointerId);
        if(!touches.size)gesture=null;
        else if(touches.size>=2)pairBaseline();
        release(e.pointerId);
        if(editingDecor&&was.decorId&&!was.multiple){
          if(was.moved)options.onDecorationDrag?.('move',e,was.decorId);
          options.onDecorationDrag?.('end',e,was.decorId);
        }
        if(!tap){blockClick();}
        else if(editingDecor){if(!was.decorId)options.onDecorationPlace?.(e);}
        else if(!point.label){const index=options.pick(e);if(index!==null)options.onPlotClick?.(index,{pointerType:'touch'});}
        canvas.style.cursor=editingDecor?'crosshair':'grab';
        return;
      }
      if(!mouse||mouse.id!==e.pointerId)return;
      const was=mouse;mouse=null;release(e.pointerId);
      if(Math.abs(e.clientX-was.x)+Math.abs(e.clientY-was.y)>7)was.moved=true;
      if(editingDecor&&was.decorId){
        if(was.moved)options.onDecorationDrag?.('move',e,was.decorId);
        options.onDecorationDrag?.('end',e,was.decorId);
      }else if(!was.moved){
        if(editingDecor)options.onDecorationPlace?.(e);
        else {const index=options.pick(e);if(index!==null)options.onPlotClick?.(index,{pointerType:e.pointerType||'mouse'});}
      }
      canvas.style.cursor=editingDecor?'crosshair':'grab';
    }
    function pointerCancel(e){if(touches.has(e.pointerId)||mouse?.id===e.pointerId)cancel();}
    function pointerLeave(){if(!mouse&&!touches.size)options.onHover(null);}
    function clickGuard(e){
      if(editingDecor&&labelFor(e)){e.preventDefault();e.stopImmediatePropagation();return;}
      // Keyboard activation (detail=0) remains available even after a touch gesture.
      if(e.detail!==0&&labelFor(e)&&(Date.now()<blockedUntil||gesture?.moved||gesture?.multiple)){
        e.preventDefault();e.stopImmediatePropagation();
      }
    }
    function touchStartGuard(e){
      // Prevent the browser from taking a two-finger gesture as page panning.
      if(e.touches.length>1&&!isInspection(e)){nativeMultiple=true;if(gesture)gesture.multiple=true;if(e.cancelable)e.preventDefault();}
    }
    function touchMoveGuard(e){if(!isInspection(e)&&(focused||editingDecor||nativeMultiple||e.touches.length>1)&&e.cancelable)e.preventDefault();}
    function touchEndGuard(e){if(!e.touches.length){if(nativeMultiple)blockClick();nativeMultiple=false;}}
    const handlers={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerUp,pointercancel:pointerCancel,lostpointercapture:pointerCancel,pointerleave:pointerLeave};
    for(const [name,handler] of Object.entries(handlers))container.addEventListener(name,handler);
    container.addEventListener('click',clickGuard,true);
    container.addEventListener('touchstart',touchStartGuard,{passive:false});
    container.addEventListener('touchmove',touchMoveGuard,{passive:false});
    container.addEventListener('touchend',touchEndGuard,{passive:true});
    container.addEventListener('touchcancel',touchEndGuard,{passive:true});
    applyTouchMode();
    return {
      setTouchMode,setDecorationMode,refreshMode:applyTouchMode,cancel,
      destroy(){
        cancel();
        for(const [name,handler] of Object.entries(handlers))container.removeEventListener(name,handler);
        container.removeEventListener('click',clickGuard,true);
        container.removeEventListener('touchstart',touchStartGuard);container.removeEventListener('touchmove',touchMoveGuard);
        container.removeEventListener('touchend',touchEndGuard);container.removeEventListener('touchcancel',touchEndGuard);
        container.style.touchAction=originalTouchAction;delete container.dataset.touchMode;
      }
    };
  }

  // Keep the miniature landscape available on browsers without a WebGL context.
  // This renderer uses the same Three.js scene graph, camera, models and picking.
  function createCanvasRenderer(T) {
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d',{alpha:true});
    if(!context)throw new Error('Canvas is unavailable');
    let pixelRatio=1,width=1,height=1,dirty=true,viewChanged=true,viewRevision=0;
    const clipMatrix=new T.Matrix4(),normalMatrix=new T.Matrix3();
    const lastViewProjection=new T.Matrix4();
    let projectedObjects=new WeakMap();
    const colorCache=new Map();
    const light=new T.Vector3(-8,18,10).normalize();
    // Optional lighting for other miniature scenes. The garden keeps its exact
    // original defaults unless its caller explicitly supplies a new profile.
    let lightAmbient=.48,lightDiffuse=.52,lightUp=.12,lightRevision=0;
    function setLighting(profile){
      if(!profile||typeof profile!=='object'||Array.isArray(profile))return false;
      const ambient=profile.ambient===undefined?lightAmbient:profile.ambient;
      const diffuse=profile.diffuse===undefined?lightDiffuse:profile.diffuse;
      const upLight=profile.upLight===undefined?lightUp:profile.upLight;
      if(![ambient,diffuse,upLight].every(value=>Number.isFinite(value)&&value>=0&&value<=2))return false;
      let x=light.x,y=light.y,z=light.z;
      if(profile.direction!==undefined){
        const direction=profile.direction;
        if(!Array.isArray(direction)||direction.length!==3||!direction.every(Number.isFinite))return false;
        const length=Math.hypot(...direction);if(!Number.isFinite(length)||length<=1e-12)return false;
        x=direction[0]/length;y=direction[1]/length;z=direction[2]/length;
      }
      if(ambient===lightAmbient&&diffuse===lightDiffuse&&upLight===lightUp&&Math.abs(x-light.x)<1e-12&&Math.abs(y-light.y)<1e-12&&Math.abs(z-light.z)<1e-12)return false;
      light.set(x,y,z);lightAmbient=ambient;lightDiffuse=diffuse;lightUp=upLight;
      // invalidate() alone redraws cached triangles. A lighting revision also
      // refreshes their shading, including when the camera never moved.
      lightRevision++;dirty=true;return true;
    }
    const toSRGB=v=>Math.round(255*Math.max(0,Math.min(1,v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055)));
    function faceColor(material,shade,vertexColors,a,b,c) {
      let red=material.color?material.color.r:1,green=material.color?material.color.g:1,blue=material.color?material.color.b:1;
      if(material.vertexColors&&vertexColors){red*=(vertexColors[a*3]+vertexColors[b*3]+vertexColors[c*3])/3;green*=(vertexColors[a*3+1]+vertexColors[b*3+1]+vertexColors[c*3+1])/3;blue*=(vertexColors[a*3+2]+vertexColors[b*3+2]+vertexColors[c*3+2])/3;}
      shade=Math.round(shade*64)/64;
      const cropFill=material.isMeshBasicMaterial?0:(material.userData.spiritCropNightFill?.value||0);
      const emission=material.emissiveIntensity||0;
      const er=material.emissive?material.emissive.r*emission*.28:0,eg=material.emissive?material.emissive.g*emission*.28:0,eb=material.emissive?material.emissive.b*emission*.28:0;
      const key=[Math.round(red*255),Math.round(green*255),Math.round(blue*255),shade,cropFill,er,eg,eb,material.isMeshBasicMaterial?1:0].join(',');
      let color=colorCache.get(key);
      if(!color){const sunlight=material.isMeshBasicMaterial?0:Math.max(0,shade-.80);color=`rgb(${toSRGB(red*(shade*(1+sunlight*.02)+cropFill)+er)},${toSRGB(green*(shade+cropFill)+eg)},${toSRGB(blue*(shade*(1-sunlight*.025)+cropFill)+eb)})`;if(colorCache.size>48000)colorCache.clear();colorCache.set(key,color);}
      return color;
    }
    // Close views interpolate the dominant colour gradient across a triangle.
    // This retains Blender's smooth lighting and pigment bands in Canvas too,
    // while the small overview models keep the cheaper constant-face fill.
    function smoothFill(points,colors,indices,fallback){
      const samples=indices.map(i=>[colors[i*3],colors[i*3+1],colors[i*3+2]]);
      let first=0,last=1,longest=0;
      for(const [a,b] of [[0,1],[1,2],[2,0]]){const d=samples[a].reduce((s,v,k)=>s+(v-samples[b][k])**2,0);if(d>longest){longest=d;first=a;last=b;}}
      if(longest<9)return fallback;
      const low=samples[first],high=samples[last],delta=high.map((v,k)=>v-low[k]);
      const t=samples.map(c=>c.reduce((s,v,k)=>s+(v-low[k])*delta[k],0)/longest);
      const [ax,ay,bx,by,cx,cy]=points,area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      const gx=((t[1]-t[0])*(cy-ay)-(t[2]-t[0])*(by-ay))/area;
      const gy=((bx-ax)*(t[2]-t[0])-(cx-ax)*(t[1]-t[0]))/area,n=gx*gx+gy*gy;
      if(n<1e-12)return fallback;
      const x=ax-gx*t[0]/n,y=ay-gy*t[0]/n,gradient=context.createLinearGradient(x,y,x+gx/n,y+gy/n);
      gradient.addColorStop(0,`rgb(${low.join(',')})`);gradient.addColorStop(1,`rgb(${high.join(',')})`);return gradient;
    }
    function projectionSignature(object,geometry,material){
      const p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color,i=geometry.index;
      const color=material.color,emission=material.emissive;
      // BufferAttribute versions follow Three's normal needsUpdate contract.
      // Identities also catch replaced geometry/arrays; material values catch
      // tool fades and highlights, which do not increment material.version.
      return [geometry,p,p.array,p.version,p.count,p.itemSize,i,i?.array,i?.version,
        n,n?.array,n?.version,c,c?.array,c?.version,material,material.version,
        material.opacity,material.transparent,material.side,material.flatShading,
        material.vertexColors,material.isMeshBasicMaterial,color?.r,color?.g,color?.b,
        emission?.r,emission?.g,emission?.b,material.emissiveIntensity,
        material.userData.spiritCropNightFill?.value,
        object.userData.softwareSmooth,object.userData.isTerrainSurface,object.userData.softwareTopOffset,object.userData.softwareTopLayer,object.userData.softwareLayer,object.userData.softwareTexture,material.map,material.map?.version,material.map?.image,lightRevision,
        ...object.matrixWorld.elements];
    }
    return {
      domElement:canvas,
      isSoftware:true,
      shadowMap:{enabled:false,type:null,autoUpdate:false,needsUpdate:false},
      setPixelRatio(value){pixelRatio=Math.min(value||1,1.35);viewChanged=true;dirty=true;},
      setClearColor(){},
      setSize(w,h){width=w;height=h;canvas.width=Math.max(1,Math.round(w*pixelRatio));canvas.height=Math.max(1,Math.round(h*pixelRatio));viewChanged=true;dirty=true;},
      invalidate(){dirty=true;},
      setLighting,
      render(scene,camera){
        if(!dirty)return;dirty=false;
        context.setTransform(pixelRatio,0,0,pixelRatio,0,0);
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const viewProjection=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        if(viewChanged||!viewProjection.equals(lastViewProjection)){
          viewRevision++;lastViewProjection.copy(viewProjection);viewChanged=false;
        }
        const triangles=[];
        scene.traverseVisible(object=>{
          if(!object.isMesh||!object.geometry||!object.material)return;
          const material=Array.isArray(object.material)?object.material[0]:object.material;
          if(material.visible===false||material.opacity<=0)return;
          // The GPU's radial shadow texture is optional; transparent cloud meshes remain.
          if(material.map&&!object.userData.softwareTexture)return;
          const geometry=object.geometry,attribute=geometry.attributes.position;
          if(!attribute)return;
          const signature=projectionSignature(object,geometry,material),cached=projectedObjects.get(object);
          if(cached&&cached.viewRevision===viewRevision&&signature.every((value,i)=>value===cached.signature[i])){
            for(const triangle of cached.triangles)triangles.push(triangle);
            return;
          }
          const objectTriangles=[];
          const positions=attribute.array,index=geometry.index&&geometry.index.array;
          const vertexColors=geometry.attributes.color&&geometry.attributes.color.array;
          const textureImage=object.userData.softwareTexture&&material.map?.image,uv=textureImage&&geometry.attributes.uv?.array;
          const normals=material.flatShading===false&&geometry.attributes.normal&&geometry.attributes.normal.array;
          const nm=normals?normalMatrix.getNormalMatrix(object.matrixWorld).elements:null;
          const count=attribute.count;
          const smoothColors=object.userData.softwareSmooth&&normals?new Float32Array(count*3):null;
          // Double-sided geometry is lit from the visible side in WebGL. Keep
          // both vertex palettes: a back-facing triangle must not reuse its
          // front-facing gradient and conceal reversed ground-face normals.
          const smoothBackColors=smoothColors&&material.side!==T.FrontSide?new Float32Array(count*3):null;
          function smoothColor(target,j,shade){
            const color=material.color,em=material.emissive,intensity=(material.emissiveIntensity||0)*.28;
            const sunlight=material.isMeshBasicMaterial?0:Math.max(0,shade-.80),pigment=material.vertexColors&&vertexColors;
            const cropFill=material.isMeshBasicMaterial?0:(material.userData.spiritCropNightFill?.value||0);
            target[j]=toSRGB((color?color.r:1)*(pigment?pigment[j]:1)*(shade*(1+sunlight*.02)+cropFill)+(em?em.r*intensity:0));
            target[j+1]=toSRGB((color?color.g:1)*(pigment?pigment[j+1]:1)*(shade+cropFill)+(em?em.g*intensity:0));
            target[j+2]=toSRGB((color?color.b:1)*(pigment?pigment[j+2]:1)*(shade*(1-sunlight*.025)+cropFill)+(em?em.b*intensity:0));
          }
          const projected=new Float32Array(count*3),world=new Float32Array(count*3);
          clipMatrix.multiplyMatrices(viewProjection,object.matrixWorld);
          const m=object.matrixWorld.elements,cp=clipMatrix.elements;
          for(let i=0;i<count;i++){
            const j=i*3,x=positions[j],y=positions[j+1],z=positions[j+2];
            world[j]=m[0]*x+m[4]*y+m[8]*z+m[12];world[j+1]=m[1]*x+m[5]*y+m[9]*z+m[13];world[j+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
            const invW=1/(cp[3]*x+cp[7]*y+cp[11]*z+cp[15]);
            projected[j]=((cp[0]*x+cp[4]*y+cp[8]*z+cp[12])*invW*.5+.5)*width;
            projected[j+1]=(-((cp[1]*x+cp[5]*y+cp[9]*z+cp[13])*invW)*.5+.5)*height;
            projected[j+2]=(cp[2]*x+cp[6]*y+cp[10]*z+cp[14])*invW;
            if(smoothColors){
              const nx=nm[0]*normals[j]+nm[3]*normals[j+1]+nm[6]*normals[j+2],ny=nm[1]*normals[j]+nm[4]*normals[j+1]+nm[7]*normals[j+2],nz=nm[2]*normals[j]+nm[5]*normals[j+1]+nm[8]*normals[j+2];
              const length=Math.hypot(nx,ny,nz)||1,up=ny/length,direct=(nx*light.x+ny*light.y+nz*light.z)/length;
              smoothColor(smoothColors,j,material.isMeshBasicMaterial?1:lightAmbient+lightUp*Math.max(0,up)+lightDiffuse*Math.max(0,direct));
              if(smoothBackColors)smoothColor(smoothBackColors,j,material.isMeshBasicMaterial?1:lightAmbient+lightUp*Math.max(0,-up)+lightDiffuse*Math.max(0,-direct));
            }
          }
          const n=index?index.length:count;
          for(let offset=0;offset<n;offset+=3){
            const a=index?index[offset]:offset,b=index?index[offset+1]:offset+1,c=index?index[offset+2]:offset+2;
            const ai=a*3,bi=b*3,ci=c*3;
            const ax=projected[ai],ay=projected[ai+1],bx=projected[bi],by=projected[bi+1],cx=projected[ci],cy=projected[ci+1];
            if(Math.max(ax,bx,cx)<-2||Math.min(ax,bx,cx)>width+2||Math.max(ay,by,cy)<-2||Math.min(ay,by,cy)>height+2)continue;
            const area=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
            if(Math.abs(area)<.045)continue;
            if(material.side===T.FrontSide&&area>=0)continue;
            if(material.side===T.BackSide&&area<0)continue;
            const depth=(projected[ai+2]+projected[bi+2]+projected[ci+2])/3;
            if(depth<-1||depth>1)continue;
            let shade=1;
            if(!material.isMeshBasicMaterial){
              let nx,ny,nz;
              if(normals){
                const x=normals[ai]+normals[bi]+normals[ci],y=normals[ai+1]+normals[bi+1]+normals[ci+1],z=normals[ai+2]+normals[bi+2]+normals[ci+2];
                nx=nm[0]*x+nm[3]*y+nm[6]*z;ny=nm[1]*x+nm[4]*y+nm[7]*z;nz=nm[2]*x+nm[5]*y+nm[8]*z;
              }else{
                const ux=world[bi]-world[ai],uy=world[bi+1]-world[ai+1],uz=world[bi+2]-world[ai+2];
                const vx=world[ci]-world[ai],vy=world[ci+1]-world[ai+1],vz=world[ci+2]-world[ai+2];
                nx=uy*vz-uz*vy;ny=uz*vx-ux*vz;nz=ux*vy-uy*vx;
              }
              const length=Math.hypot(nx,ny,nz)||1,direction=area>0?-1:1;
              nx=nx/length*direction;ny=ny/length*direction;nz=nz/length*direction;
              shade=lightAmbient+lightUp*Math.max(0,ny)+lightDiffuse*Math.max(0,nx*light.x+ny*light.y+nz*light.z);
            }
            // Broad, coplanar ground faces cannot be sorted reliably by their centers.
            // Their known vertical order is stable at every supported above-ground angle:
            // meadow first, raised beds second, then the depth-sorted 3D objects.
            const groundFace=object.userData.softwareTopOffset!==undefined&&offset>=object.userData.softwareTopOffset;
            const layer=groundFace?(object.userData.softwareTopLayer??-2):(object.userData.softwareLayer||0);
            let fill=faceColor(material,shade,vertexColors,a,b,c);
            if(smoothColors)fill=smoothFill([ax,ay,bx,by,cx,cy],area>0&&smoothBackColors?smoothBackColors:smoothColors,[a,b,c],fill);
            const texture=uv&&textureImage?.width&&textureImage?.height?{image:textureImage,uv:[uv[a*2]*textureImage.width,(1-uv[a*2+1])*textureImage.height,uv[b*2]*textureImage.width,(1-uv[b*2+1])*textureImage.height,uv[c*2]*textureImage.width,(1-uv[c*2+1])*textureImage.height]}:null;
            objectTriangles.push([depth,ax,ay,bx,by,cx,cy,fill,material.transparent?material.opacity:1,layer,!!object.userData.isTerrainSurface,texture]);
          }
          // Wind changes only the mature plant matrices. Static scenery keeps
          // its projected faces and lighting instead of rebuilding every tick.
          projectedObjects.set(object,{viewRevision,signature,triangles:objectTriangles});
          for(const triangle of objectTriangles)triangles.push(triangle);
        });
        triangles.sort((a,b)=>a[9]-b[9]||b[0]-a[0]);
        context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);
        context.setTransform(pixelRatio,0,0,pixelRatio,0,0);context.lineJoin='round';context.lineWidth=.38;
        let strokeWidth=.38;
        for(const triangle of triangles){
          if(triangle[11]){
            const {image,uv}=triangle[11],[u0,v0,u1,v1,u2,v2]=uv,[,x0,y0,x1,y1,x2,y2]=triangle;
            const denominator=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);
            if(Math.abs(denominator)>1e-9){
              const a=((x1-x0)*(v2-v0)-(x2-x0)*(v1-v0))/denominator,b=((y1-y0)*(v2-v0)-(y2-y0)*(v1-v0))/denominator;
              const c=((x2-x0)*(u1-u0)-(x1-x0)*(u2-u0))/denominator,d=((y2-y0)*(u1-u0)-(y1-y0)*(u2-u0))/denominator;
              context.save();context.globalAlpha=triangle[8];context.beginPath();context.moveTo(x0,y0);context.lineTo(x1,y1);context.lineTo(x2,y2);context.closePath();context.clip();
              context.transform(a,b,c,d,x0-a*u0-c*v0,y0-b*u0-d*v0);context.drawImage(image,0,0);context.restore();
            }
            continue;
          }
          context.globalAlpha=triangle[8];context.fillStyle=triangle[7];
          context.beginPath();context.moveTo(triangle[1],triangle[2]);context.lineTo(triangle[3],triangle[4]);context.lineTo(triangle[5],triangle[6]);context.closePath();context.fill();
          if(triangle[8]>.96){
            // A continuous ground mesh must not reveal its triangulation through
            // translucent antialiased seams. Cover under one device pixel on
            // either side of its edges; leave every 3D detail's outline alone.
            const nextWidth=triangle[10]?1.75/pixelRatio:.38;
            if(nextWidth!==strokeWidth)context.lineWidth=strokeWidth=nextWidth;
            context.strokeStyle=triangle[7];context.stroke();
          }
        }
        context.globalAlpha=1;
      },
      dispose(){colorCache.clear();projectedObjects=new WeakMap();canvas.width=1;canvas.height=1;}
    };
  }

  // Other miniature 3D scenes reuse the same geometry-aware Canvas fallback.
  // Callers may try WebGL first; no garden, camera or animation loop is created.
  window.createSpiritSceneRenderer = createCanvasRenderer;

  window.createSpiritScene = function createSpiritScene(options) {
    const container = options.container;
    const T = window.THREE;
    if (!T || !container) return { supported: false, update() {}, destroy() {} };
    const PLOT_COUNT=Math.max(1,Math.min(64,Math.floor(Number(options.plotCount||(window.SpiritGame&&window.SpiritGame.PLOT_COUNT))||25)));
    const GRID_SIZE=Math.ceil(Math.sqrt(PLOT_COUNT));
    const PLOT_STEP=2.56;
    const ISLAND_RADIUS=Math.max(Number(window.SpiritGame?.DECOR_LAYOUT_RULES?.terrainRadius)||13.2,(GRID_SIZE-1)*PLOT_STEP*.5+6.65);
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'default' });
    } catch (_) {
      try { renderer=createCanvasRenderer(T); }
      catch (error) { return { supported: false, renderingMode:'unavailable', update() {}, destroy() {} }; }
    }

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarsePointer=window.matchMedia?.('(pointer: coarse)');
    const mobileScreen=()=>!!coarsePointer?.matches||Math.min(window.innerWidth||container.clientWidth||Infinity,window.innerHeight||container.clientHeight||Infinity)<=650;
    let mobileRendering=mobileScreen();
    let disposed = false;
    let frame = 0;
    let inViewport = true;
    let renderingPaused = false;
    let modalPaused = !!options.initiallyPaused;
    let pointerControls;
    let fullscreenView = false;
    let sceneMode = 'home';
    let selected = null;
    let inspectedPlot = null;
    let hover = null;
    let currentPlots = [];
    let currentState = {};
    let currentView = {};
    let decorationEdit = null, decorationEditCamera = null, decorationDrag = null;
    let width = 1;
    let height = 1;
    let lastLabelTime = 0;
    let lastPlantTime = 0;
    let lastRender = 0;
    // Shared opening/reset pose matches the approved garden overview.
    const DEFAULT_CAMERA = Object.freeze({angle:Math.PI*.18,elevation:.78,zoom:1,x:0,y:1.55,z:.15});
    const CAMERA_STORAGE_KEY = 'yunjian-lingtian-default-camera-v1';
    let defaultCamera = {...DEFAULT_CAMERA};
    function validCameraPose(p){
      return p&&['angle','elevation','zoom','x','y','z'].every(k=>Number.isFinite(p[k]))&&
        Math.abs(p.angle)<=Math.PI*2&&p.elevation>=.55&&p.elevation<=1.15&&p.zoom>=.7&&p.zoom<=2.5&&
        Math.abs(p.x)<=15&&p.y>=-3&&p.y<=8&&Math.abs(p.z)<=15;
    }
    try {
      const saved=JSON.parse(window.localStorage.getItem(CAMERA_STORAGE_KEY));
      if(saved?.version===1&&validCameraPose(saved.pose))defaultCamera={...saved.pose};
    } catch (_) {}
    // Embedded previews can frame a specific bed without changing the player's
    // saved opening camera. The main game does not supply this optional pose.
    if(validCameraPose(options.initialCamera))defaultCamera={...options.initialCamera};
    let angle = defaultCamera.angle;
    let elevation = defaultCamera.elevation;
    let zoom = defaultCamera.zoom;
    let rngState = 21897;
    const random = () => { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; };
    const rand = (a, b) => a + random() * (b - a);

    let renderPixelRatio=Math.min(window.devicePixelRatio || 1,mobileRendering?1.25:1.6);
    renderer.setPixelRatio(renderPixelRatio);
    renderer.setClearColor(0xf1f4e8, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.className = 'spirit-scene-canvas';
    renderer.domElement.style.cssText = 'position:relative;z-index:1;display:block;width:100%;height:100%;touch-action:pan-y;outline:none;';
    renderer.domElement.setAttribute('aria-label', '三维灵田，拖动旋转，滚轮缩放，点击田块可播种、浇水、清理枯草或采收');
    renderer.domElement.setAttribute('role', 'img');
    // Painted distance is deliberately independent of WebGL, so the quiet peaks
    // and cloud sea remain available in the software compatibility renderer.
    const distance = document.createElement('div');
    distance.className = 'spirit-distant-landscape';
    distance.setAttribute('aria-hidden', 'true');
    distance.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;background:#edf0df;';
    distance.innerHTML = `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="spirit-sky" x2="0" y2="1"><stop stop-color="#f4e3c1"/><stop offset=".48" stop-color="#e3ead7"/><stop offset="1" stop-color="#bad0bd"/></linearGradient>
<radialGradient id="spirit-daylight"><stop stop-color="#fff3cb" stop-opacity=".9"/><stop offset=".45" stop-color="#f8dca8" stop-opacity=".3"/><stop offset="1" stop-color="#f8dca8" stop-opacity="0"/></radialGradient>
<linearGradient id="spirit-jade-distance" x2=".3" y2="1"><stop stop-color="#88aa97"/><stop offset="1" stop-color="#b2c9b5" stop-opacity=".15"/></linearGradient>
<linearGradient id="spirit-forest-distance" x2=".3" y2="1"><stop stop-color="#547f70"/><stop offset="1" stop-color="#8fac96" stop-opacity=".25"/></linearGradient>
<linearGradient id="spirit-cloud" x2="0" y2="1"><stop stop-color="#edf2df" stop-opacity="0"/><stop offset="1" stop-color="#e9efdc" stop-opacity=".7"/></linearGradient>
</defs>
<path fill="url(#spirit-sky)" d="M0 0h1600v1000H0z"/>
<ellipse data-sky-halo cx="1210" cy="130" rx="510" ry="340" fill="url(#spirit-daylight)"/>
<circle data-sky-sun cx="1210" cy="130" r="43" fill="#fff7da" opacity=".66"/>
<g data-distant-haze opacity=".34" fill="#b4c7ad"><path d="M-80 730C-20 671 9 498 39 477c23-17 18-109 49-119 24-8 35 61 43 101 17 78 50 64 67 95 24-57 28-166 55-182 24-14 34 30 47 57 20 43 18 143 49 161 40 23 44 132 91 136v274H-80Z"/><path d="M1117 758c42-57 49-137 80-154 23-13 37 40 57 9 16-26 27-137 45-170 13-24 29-15 41 8 10 21 5 61 25 84 21-49 39-200 65-214 24-13 37 50 44 83 6 31 26 25 40 55 27 57 21 151 49 182 19-83 31-91 52-77 39 24 25 144 65 168v268h-563Z"/></g>
<g fill="url(#spirit-jade-distance)" opacity=".65"><path d="M-52 826C-26 747-6 653 11 614c15-34 34-17 47-49 14-35 12-130 38-151 23-19 35 29 42 73 7 42 22 39 34 63 17 34 15 98 39 131 11-9 18-50 30-64 17-21 34 24 39 57 21-75 29-119 51-112 29 10 22 129 53 172 21 30 43 51 55 92v174H-52Z"/><path d="M1212 851c22-35 31-150 52-182 17-27 36 15 48-7 13-24 13-167 35-195 19-24 29 10 39 55 10 47 20 27 30 46 17 30 13 101 39 134 15-48 27-146 47-153 28-10 37 92 52 129 16-9 24-45 40-40 24 6 33 135 66 186v176h-448Z"/></g>
<g fill="url(#spirit-forest-distance)" opacity=".54"><path d="M-37 1000V857c21-45 30-121 47-150 16-27 21-8 34-32 10-20 11-78 32-86 28-11 33 94 45 118 14 29 20 30 32 56 19-37 24-92 43-84 29 13 23 118 44 152 17-5 28-36 44-16 22 27 26 94 46 120v65Z"/><path d="M1399 1000v-99c26-44 33-95 53-106 19-11 20 13 35 1 14-12 15-68 34-93 20-26 23 32 36 39 22-39 27-91 44-88 18 2 29 90 44 110v236Z"/></g>
<g fill="none" stroke="#d8e3cd" stroke-width="3" opacity=".45"><path d="M94 438c-3 87 17 94 21 165m23-63c10 35 7 76 23 99M1350 485c-5 78 9 112 11 146m49-34c-4 50 8 76 11 96"/><path d="M69 618c-1 43 12 66 13 100M1519 731l-4 68"/></g>
<g data-cloud-bands fill="none" stroke="#f3f3e2" stroke-linecap="round"><path d="M-70 624c174-30 208 36 381 4s264 5 343-4" stroke-width="23" opacity=".6"/><path d="M1027 562c112-8 187 21 293 1s251 11 346-2" stroke-width="17" opacity=".55"/><path d="M-90 778c186-39 293 19 473-4s264-3 344 0" stroke-width="42" opacity=".55"/><path d="M1041 791c161-35 225 21 365-4s194 7 277-1" stroke-width="35" opacity=".51"/><path d="M-80 922c174-19 259 19 426-2s264 1 426 1 194-16 357-2 279 3 501-3" stroke-width="66" opacity=".6"/></g>
<g data-sky-birds stroke="#648073" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".74"><path d="m241 195 13-6 12 7 15-10m-15 10 4 4"/><path d="m287 219 11-5 9 6 13-8m-13 8 3 3"/><path d="m1373 245 14-6 12 7 14-11m-14 11 4 4"/></g>
<path d="M0 807h1600v193H0z" fill="url(#spirit-cloud)"/>
</svg>`;
    container.appendChild(distance);
    container.appendChild(renderer.domElement);
    const nearMist = document.createElement('div');
    nearMist.className = 'spirit-cloud-veil';
    nearMist.setAttribute('aria-hidden','true');
    nearMist.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:18%;z-index:2;pointer-events:none;background:linear-gradient(0deg,rgba(232,239,222,.32),rgba(233,239,224,.06) 65%,transparent);';
    container.appendChild(nearMist);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const scene = new T.Scene();
    const camera = new T.OrthographicCamera(-12, 12, 10, -10, 0.1, 150);
    const target = new T.Vector3(defaultCamera.x, defaultCamera.y, defaultCamera.z);
    const main = new T.Group();
    scene.add(main);
    const ambient = new T.HemisphereLight(0xfff4de, 0x294e3b, 1.35);
    scene.add(ambient);
    const sun = new T.DirectionalLight(0xfff1d7, 3.0);
    sun.position.set(-8, 18, 10);
    sun.castShadow = true;
    const shadowResolution=mobileRendering?1024:1536;
    sun.shadow.mapSize.set(shadowResolution,shadowResolution);
    Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 65 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    scene.add(sun);
    const fill = new T.DirectionalLight(0xd4e3ed, 0.35);
    fill.position.set(10, 5, -10);
    scene.add(fill);

    const mats = {};
    // Scenery owns separate materials: a seasonal tree or snowy roof must not
    // recolor a crop that happens to use the same original pigment.
    const sceneryMaterials = new Map(), seasonalGrounds = [], snowGroups = [];
    const snowMaterial = new T.MeshStandardMaterial({color:0xf0f3e9,roughness:.94,flatShading:false});
    const snowCapGeometry = new T.SphereGeometry(1,10,5);
    function sceneryMaterial(kind,color){
      const key=kind+':'+color;
      if(!sceneryMaterials.has(key))sceneryMaterials.set(key,{kind,base:new T.Color(color),material:new T.MeshStandardMaterial({color,roughness:.9,flatShading:false})});
      return sceneryMaterials.get(key).material;
    }
    const sharedHarvestGeometries=new Map();
    function material(color, extra) {
      const key = String(color) + JSON.stringify(extra || {});
      return mats[key] || (mats[key] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, flatShading: true }, extra || {})));
    }
    // Living crops keep their own luminous pigment in moonlight. The local
    // fill follows authored vertex colors and retains directional shading;
    // soil, scenery and the existing particle light stay independent.
    const cropNightMaterials=new Map(),cropNightFill={value:0};
    const cropNightFillStrength=Number.isFinite(options.cropNightFillStrength)?Math.max(0,Math.min(.5,options.cropNightFillStrength)):.35;
    function cropMaterial(original){
      if(!cropNightFillStrength||!original||!(original.isMeshStandardMaterial||original.isMeshPhysicalMaterial))return original;
      let copy=cropNightMaterials.get(original);if(copy)return copy;
      copy=original.clone();
      const originalHook=original.onBeforeCompile,originalKey=original.customProgramCacheKey();
      copy.name=(original.name||original.type)+' · night pigment';
      copy.userData.spiritCropNightFill=cropNightFill;
      copy.customProgramCacheKey=()=>originalKey+'|spirit-crop-night-pigment-v1';
      copy.onBeforeCompile=function(shader,renderer){
        originalHook.call(this,shader,renderer);
        // Mature wind clones the material and chains this hook. Both shaders
        // keep this live uniform instead of a copied day/night snapshot.
        this.userData.spiritCropNightFill=cropNightFill;
        shader.uniforms.uSpiritCropNightFill=cropNightFill;
        shader.fragmentShader=shader.fragmentShader
          .replace('#include <common>','#include <common>\nuniform float uSpiritCropNightFill;')
          .replace('#include <opaque_fragment>','outgoingLight += diffuseColor.rgb * uSpiritCropNightFill;\n#include <opaque_fragment>');
      };
      cropNightMaterials.set(original,copy);return copy;
    }
    function applyCropNightFill(parent){
      parent.traverse(object=>{
        if(!object.isMesh||!object.material||object.userData.sparkle)return;
        object.material=Array.isArray(object.material)?object.material.map(cropMaterial):cropMaterial(object.material);
      });
    }
    function mesh(geometry, mat, parent, x, y, z) {
      const item = new T.Mesh(geometry, mat);
      item.position.set(x || 0, y || 0, z || 0);
      item.castShadow = true;
      item.receiveShadow = true;
      if (parent) parent.add(item);
      return item;
    }
    function box(w, h, d, color, parent, x, y, z) {
      return mesh(new T.BoxGeometry(w, h, d), material(color), parent, x, y, z);
    }
    function cylinder(rt, rb, h, color, parent, x, y, z, seg) {
      return mesh(new T.CylinderGeometry(rt, rb, h, seg || 7), material(color), parent, x, y, z);
    }
    function stone(parent, x, y, z, sx, sy, sz, color) {
      const o = mesh(new T.IcosahedronGeometry(1, 0), material(color || 0xc5c8b2), parent, x, y, z);
      o.scale.set(sx, sy, sz);
      o.rotation.set(rand(-0.2, 0.2), rand(0, 6), rand(-0.2, 0.2));
      return o;
    }
    function branch(parent, from, to, radius, color) {
      const a = new T.Vector3(...from), b = new T.Vector3(...to), dir = b.clone().sub(a);
      const o = cylinder(radius * 0.72, radius, dir.length(), color || 0x6a7860, parent, 0, 0, 0, 6);
      o.position.copy(a.add(b).multiplyScalar(0.5));
      o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
      return o;
    }
    function leaf(parent, x, y, z, size, color, angleY, tilt) {
      const l = mesh(new T.SphereGeometry(1, 5, 4), material(color), parent, x, y, z);
      l.scale.set(size * 0.32, size * 0.10, size);
      l.rotation.set(tilt || 0.3, angleY || 0, 0);
      return l;
    }
    function roundRectShape(w, h, r) {
      const s = new T.Shape();
      const x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      return s;
    }
    function roundedSlab(w, d, h, color, parent, x, y, z, r) {
      const g = new T.ExtrudeGeometry(roundRectShape(w, d, r || 0.1), { depth: h, bevelEnabled: false, curveSegments: 3 });
      g.rotateX(-Math.PI / 2);
      return mesh(g, material(color), parent, x, y, z);
    }

    function island(parent, radius, drop, green) {
      const n = 29;
      const rim = [];
      for (let i = 0; i < n; i++) rim.push(radius * rand(parent===main?.98:.92, 1.05));
      const heights = [0.18, -0.35, -drop * 0.4, -drop * 0.78, -drop];
      const scales = [1, 0.98, 0.88, 0.56, 0.14];
      const vertices = [];
      const colors = [];
      const faceted = [0x7f9187, 0x92a397, 0xa6b3a3, 0xc2cab8, 0x6f817a, 0x8b9b8e].map(x => new T.Color(x));
      const ringPoint = (level, i) => {
        const a = i * Math.PI * 2 / n;
        return [Math.cos(a) * rim[i] * scales[level], heights[level] + (level > 1 ? Math.sin(i * 4.5) * 0.25 : 0), Math.sin(a) * rim[i] * scales[level]];
      };
      const addTri = (a, b, c, col) => {
        vertices.push(...a, ...b, ...c);
        for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
      };
      for (let l = 0; l < heights.length - 1; l++) {
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const col = faceted[Math.floor(random() * faceted.length)];
          addTri(ringPoint(l, i), ringPoint(l, j), ringPoint(l + 1, i), col);
          addTri(ringPoint(l, j), ringPoint(l + 1, j), ringPoint(l + 1, i), col.clone().multiplyScalar(0.97));
        }
      }
      const groundColor = new T.Color(green || 0x6c8b58);
      const topVertexOffset=vertices.length/3;
      for (let i = 0; i < n; i++) addTri([0, 0.18, 0], ringPoint(0, (i + 1) % n), ringPoint(0, i), groundColor.clone().multiplyScalar(rand(0.98, 1.03)));
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const body = mesh(geo, material(0xffffff, { vertexColors: true }), parent);
      body.userData.softwareTopOffset=topVertexOffset;
      body.userData.rimRadii=rim.slice();
      seasonalGrounds.push({body,start:topVertexOffset,base:geo.attributes.color.array.slice(),main:parent===main});
      return body;
    }
    const meadowIsland=island(main, ISLAND_RADIUS, 8.5);

    // Subtle painted-looking shadow beneath the suspended mountain.
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext('2d');
    const shadowGrad = shadowContext.createRadialGradient(64, 64, 3, 64, 64, 64);
    shadowGrad.addColorStop(0, 'rgba(119,88,47,.22)');
    shadowGrad.addColorStop(0.5, 'rgba(119,88,47,.11)');
    shadowGrad.addColorStop(1, 'rgba(119,88,47,0)');
    shadowContext.fillStyle = shadowGrad; shadowContext.fillRect(0, 0, 128, 128);
    const shadowTexture = new T.CanvasTexture(shadowCanvas);
    const cloudShadow = mesh(new T.PlaneGeometry(30, 23), new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }), scene, 0, -11.8, 0);
    cloudShadow.rotation.x = -Math.PI / 2; cloudShadow.castShadow = false; cloudShadow.receiveShadow = false;

    // Small architectural pieces are batched by material after modelling. This
    // keeps the carved/curved silhouette without hundreds of extra draw calls.
    function mergeEnvironmentDetails(parent) {
      const batches=new Map();
      for(const item of [...parent.children]) {
        if(!item.isMesh||Array.isArray(item.material)||item.material.transparent)continue;
        item.updateMatrix();
        const geo=item.geometry.index?item.geometry.toNonIndexed():item.geometry.clone();
        geo.applyMatrix4(item.matrix);
        const key=item.material.uuid, entry=batches.get(key)||{material:item.material,position:[],normal:[],color:[],items:[]};
        entry.position.push(...geo.attributes.position.array);
        if(geo.attributes.normal)entry.normal.push(...geo.attributes.normal.array);
        if(geo.attributes.color)entry.color.push(...geo.attributes.color.array);
        entry.items.push(item);batches.set(key,entry);geo.dispose();
      }
      for(const entry of batches.values()) {
        if(entry.items.length<2)continue;
        const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(entry.position,3));
        if(entry.normal.length===entry.position.length)geo.setAttribute('normal',new T.Float32BufferAttribute(entry.normal,3));else geo.computeVertexNormals();
        if(entry.color.length===entry.position.length)geo.setAttribute('color',new T.Float32BufferAttribute(entry.color,3));
        for(const item of entry.items){parent.remove(item);item.geometry.dispose();}
        mesh(geo,entry.material,parent);
      }
    }
    function detailCurve(parent,points,radius,color,segments,sides) {
      const path=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
      return mesh(new T.TubeGeometry(path,segments||6,radius,sides||4,false),material(color,{flatShading:false,roughness:.72}),parent);
    }
    function pine(parent, x, z, size, tone) {
      const g=new T.Group();g.position.set(x,.18,z);g.scale.setScalar(size);parent.add(g);
      const snow=new T.Group();g.add(snow);snow.visible=false;snowGroups.push(snow);
      const distant=parent!==main;
      const foliage=new T.Group();foliage.name='pine-fine-foliage';g.add(foliage);
      detailCurve(g,[[0,0,0],[-.08,.65,.03],[.06,1.26,0],[.16,2.30,-.08]],.10,0x8a795b,distant?4:6,distant?4:6);
      const colors=tone||[0x4f785d,0x6b9167,0x8ca87a];
      // Horizontal, irregular boughs give the mountain pines a layered crown.
      for(let tier=0;tier<3;tier++) {
        const y=.92+tier*.54,spread=.74-tier*.18;
        for(let side=-1;side<=1;side++) {
          if((distant||tier===2)&&side)continue;
          const x=side*spread,z=Math.sin(tier*1.7+side)*.27;
          if(side)detailCurve(g,[[.02,y-.30,0],[x*.56,y-.14,z*.55],[x,y-.02,z]],.040,0x8a795b,3,4);
          const span=(.57-tier*.065)*(side?1:.84),depth=.48-tier*.06;
          if(distant){
            const crown=mesh(new T.SphereGeometry(1,8,4),sceneryMaterial('pine',colors[tier]),foliage,x,y+.12,z);
            crown.scale.set(span,.30-tier*.035,depth);crown.rotation.y=tier*.8+side*.4;
          }else{
            // Small uneven sprays let the fine branch forks show through the
            // crown instead of covering the whole tree with three large balls.
            for(let tip=0;tip<5;tip++){
              const a=tip*2.399+tier*.77+side*.38,r=tip===0?0:.62;
              const tx=x+Math.cos(a)*span*r,tz=z+Math.sin(a)*depth*r,ty=y+.12+(tip%3-1)*.055;
              if(tip>0)branch(g,[x,y-.04,z],[tx,ty-.02,tz],.014,0x8a795b);
              const spray=mesh(new T.OctahedronGeometry(1,0),sceneryMaterial('pine',colors[(tier+tip)%3]),foliage,tx,ty,tz);
              spray.scale.set(span*(tip===0?.61:.51),.09-tier*.012,depth*.55);spray.rotation.set(.08*Math.sin(a),a,.07*Math.cos(a));
            }
          }
          const cap=mesh(snowCapGeometry,snowMaterial,snow,x,y+(distant?.33:.22),z);
          cap.scale.set(span*.84,.052,depth*.76);cap.rotation.y=tier*.8+side*.4;cap.castShadow=false;
        }
      }
      mergeEnvironmentDetails(foliage);
      mergeEnvironmentDetails(g);return g;
    }
    const landscapeObstacles=window.SpiritGame?.DECOR_LAYOUT_RULES?.obstacles||[];
    for(const item of landscapeObstacles)if(item.kind==='pine'){
      const tree=pine(main,item.x,item.z,item.scale);
      tree.name='courtyard-fixed-pine';tree.userData.landscapeObstacle=item;
    }

    // The lotus pond, moon gate, pavilion and blossom tree are owned scenery.
    // Their geometry, snow, petals and lamps live only in the equipped cache.
    const formation=new T.Group();formation.position.y=.23;main.add(formation);
    const sigilGold=new T.MeshBasicMaterial({color:0xe3ce96,transparent:true,opacity:.23,side:T.DoubleSide,depthWrite:false});
    const sigilJade=new T.MeshBasicMaterial({color:0xcce5bd,transparent:true,opacity:.20,side:T.DoubleSide,depthWrite:false});
    for(const [r,mat] of [[9.88,sigilJade],[10.22,sigilGold]]){const ring=mesh(new T.RingGeometry(r,r+.037,96),mat,formation);ring.rotation.x=-Math.PI/2;ring.castShadow=false;ring.receiveShadow=false;}
    for(let n=0;n<8;n++){
      const a=n*Math.PI/4+.12,glyph=new T.Group();glyph.position.set(Math.sin(a)*10.05,.015,Math.cos(a)*10.05);glyph.rotation.y=a;formation.add(glyph);
      for(let bar=0;bar<3;bar++){
        const broken=(n>>bar)&1;
        if(broken)for(const side of [-1,1])mesh(new T.BoxGeometry(.15,.018,.05),sigilGold,glyph,side*.13,0,(bar-1)*.095);
        else mesh(new T.BoxGeometry(.42,.018,.05),sigilGold,glyph,0,0,(bar-1)*.095);
      }
    }
    const spiritStones=[];
    for(const item of landscapeObstacles.filter(item=>item.kind==='crystal')){
      const {x,z,height:y}=item;
      const base=stone(main,x,.3,z,.44,.23,.39,0xc3cbb1);base.rotation.y=.4;
      const crystal=mesh(new T.OctahedronGeometry(.39,0),material(0xa2c9b0,{emissive:0x8abda0,emissiveIntensity:.20,roughness:.45}),main,x,y,z);crystal.scale.set(.72,2.08,.72);crystal.rotation.y=.4;
      const seal=mesh(new T.OctahedronGeometry(.095,0),material(0xffe5a2,{emissive:0xf3dc8d,emissiveIntensity:.2}),main,x-.08,y+.03,z+.17);seal.scale.set(.45,1.6,.35);seal.castShadow=false;
      const ring=mesh(new T.RingGeometry(.46,.477,24),sigilJade,main,x,.52,z);ring.rotation.x=-Math.PI/2;ring.castShadow=false;
      spiritStones.push({crystal,seal,y});
    }
    // Irregular stepping stones and tufts link the miniature landscape.
    const pathPoints=[[-6.78,-5.4],[-6.78,-3.2],[-6.78,-1],[-6.78,1.2],[-6.78,3.4],[-6.78,5.6],[-5.4,6.78],[-3.2,6.78],[-1,6.78],[1.2,6.78],[3.4,6.78],[5.6,6.78]];
    if(!window.createSpiritGardenArt)for(const [x,z] of pathPoints){const p=cylinder(.15,.16,.025,0xc5c1a6,main,x,.205,z,6);p.scale.z=.8;p.rotation.y=rand(0,6);}
    function grass(parent,x,z,s,color){
      const g=new T.Group();g.position.set(x,.2,z);parent.add(g);
      for(let k=0;k<4;k++){const blade=mesh(new T.ConeGeometry(.035*s,rand(.25,.45)*s,3),material(color||0x6e945b),g,(k-1.5)*.07*s,.16*s,Math.sin(k)*.05);blade.rotation.z=(k-1.5)*.18;}
      return g;
    }
    for(const [x,z] of [[-10.8,6.1],[11.8,-4.2],[-4.8,11.5]]){
      grass(main,x,z,rand(.65,.85));stone(main,x+.26,.23,z-.12,.15,.10,.18,0xb7b7a2);
    }
    for(let i=0;i<8;i++) {
      const a=rand(0,Math.PI*2),r=rand(ISLAND_RADIUS*.945,ISLAND_RADIUS*.96),x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(z<-3&&x<-2)continue;
      const f=mesh(new T.IcosahedronGeometry(.07,0),material(i%3?0xe7e5c4:0xf5dda5),main,x,.4,z);
      cylinder(.015,.018,.19,0x6e9874,main,x,.28,z,4);
    }

    // All raised details stay outside the legal decoration radius. The soft
    // worn patches beside the original stepping stones are nearly flush, so
    // they do not introduce hidden blockers or move an existing arrangement.
    const vergeDetails=new T.Group();vergeDetails.name='courtyard-natural-verge';main.add(vergeDetails);
    const rim=meadowIsland.userData.rimRadii,edgePositions=[],edgeColors=[];
    const earthColors=[0xa8a88b,0x9c9b80,0xbab89a].map(color=>new T.Color(color));
    const addEdge=(a,b,c,color)=>{edgePositions.push(...a,...b,...c);for(let k=0;k<3;k++)edgeColors.push(color.r,color.g,color.b);};
    for(let i=0;i<rim.length;i++){
      const next=(i+1)%rim.length,a=i*Math.PI*2/rim.length,b=next*Math.PI*2/rim.length;
      const outerA=[Math.cos(a)*rim[i],.183,Math.sin(a)*rim[i]],outerB=[Math.cos(b)*rim[next],.183,Math.sin(b)*rim[next]];
      const insetA=.18+.15*(.5+.5*Math.sin(i*2.17)),insetB=.18+.15*(.5+.5*Math.sin(next*2.17));
      const innerA=[Math.cos(a)*(rim[i]-insetA),.187,Math.sin(a)*(rim[i]-insetA)],innerB=[Math.cos(b)*(rim[next]-insetB),.187,Math.sin(b)*(rim[next]-insetB)];
      addEdge(outerA,innerA,innerB,earthColors[i%3]);addEdge(outerA,innerB,outerB,earthColors[(i+1)%3]);
      if(i%2===0){
        const r=rim[i]-.36,x=Math.cos(a)*r,z=Math.sin(a)*r;
        const pebble=stone(vergeDetails,x,.205,z,.18+(i%3)*.035,.065,.12+(i%2)*.025,i%3?0xbcbfa9:0xa4ad98);pebble.castShadow=false;
        if(i%4===0){
          const tuft=new T.Group();tuft.position.set(x-Math.cos(a)*.28,.20,z-Math.sin(a)*.28);vergeDetails.add(tuft);
          for(let blade=0;blade<3;blade++){
            const leaf=mesh(new T.ConeGeometry(.025,.20+(blade%2)*.06,3),sceneryMaterial('grass',blade%2?0x8b9e6d:0x6c8f60),tuft,(blade-1)*.055,.10,Math.sin(blade)*.035);
            leaf.rotation.z=(blade-1)*.24;leaf.castShadow=false;
          }
          mergeEnvironmentDetails(tuft);
        }
      }
    }
    const edgeGeo=new T.BufferGeometry();edgeGeo.setAttribute('position',new T.Float32BufferAttribute(edgePositions,3));edgeGeo.setAttribute('color',new T.Float32BufferAttribute(edgeColors,3));edgeGeo.computeVertexNormals();
    const erodedEdge=mesh(edgeGeo,material(0xffffff,{vertexColors:true}),vergeDetails);erodedEdge.name='courtyard-eroded-edge';erodedEdge.castShadow=false;erodedEdge.userData.softwareLayer=-1;
    for(let i=0;i<pathPoints.length;i+=2){
      const [x,z]=pathPoints[i];
      const patch=cylinder(.29,.30,.012,i%4?0xb8b99b:0xaeb28e,vergeDetails,x,.193,z,7);patch.scale.set(1.15,1,.66);patch.rotation.y=i*.63;patch.castShadow=false;
      const grit=stone(vergeDetails,x+.20,.204,z+.08,.075,.017,.05,0xc8c6aa);grit.castShadow=false;
    }
    mergeEnvironmentDetails(vergeDetails);

    const courtyardDecor = window.createSpiritDecorations?.({THREE:T,parent:main,material,mergeDetails:mergeEnvironmentDetails});

    // A larger residence floats above the rear garden, with a real air gap.
    // Its rocky underside stays above even the full-sized pavilion; only the
    // suspended stair ribbon approaches the ground, outside every saved layout.
    const residenceSite=Object.freeze({x:-1.8,y:7.40,z:-12.8,scale:1.45});
    const residenceTerrace=new T.Group();residenceTerrace.name='spirit-residence-terrace';residenceTerrace.visible=false;residenceTerrace.position.set(residenceSite.x,residenceSite.y-.33,residenceSite.z);residenceTerrace.scale.z=.80;main.add(residenceTerrace);
    const residenceRock=island(residenceTerrace,4.15,2.75,0x879a70);
    // Elevated faces must participate in depth sorting. Only the main meadow
    // belongs below the beds in the compatibility renderer's fixed floor layer.
    residenceRock.userData.softwareTopLayer=0;
    const residenceCourt=new T.Group();residenceCourt.name='spirit-residence-court';residenceCourt.visible=false;residenceCourt.position.set(residenceSite.x,residenceSite.y,residenceSite.z);main.add(residenceCourt);
    const courtBase=cylinder(3.68,3.77,.10,0xc6cbb4,residenceCourt,0,-.10,0,40);courtBase.scale.z=.80;
    const courtPaving=cylinder(3.59,3.65,.05,0xe0ddc2,residenceCourt,0,-.025,0,40);courtPaving.scale.z=.80;
    const courtBorder=mesh(new T.RingGeometry(3.41,3.48,48),material(0xaebda3,{side:T.DoubleSide}),residenceCourt,0,.006,0);courtBorder.rotation.x=-Math.PI/2;courtBorder.scale.y=.80;
    for(const side of [-1,1])for(let i=0;i<4;i++){
      const slab=roundedSlab(.52,.37,.013,i%2?0xc0c6ad:0xcbd0b7,residenceCourt,side*(.44+i*.66),.006,2.44,.06);slab.rotation.y=side*.035;
    }
    // Delicate jade balustrades leave an opening beside the arriving cloud stair.
    const railPoints=[];
    for(let i=0;i<=20;i++){
      const a=.30+(Math.PI*2-.60)*i/20,x=Math.cos(a)*3.63,z=Math.sin(a)*2.90;
      railPoints.push([x,.47,z]);
      if(i%2===0){
        cylinder(.055,.077,.49,0xb9c6ad,residenceCourt,x,.245,z,6);
        cylinder(.12,.14,.06,0xc7ceb5,residenceCourt,x,.03,z,8);
        cylinder(.09,.07,.055,0xe4e1c6,residenceCourt,x,.52,z,8);
        const cap=mesh(new T.OctahedronGeometry(.065,0),material(0xd1bf87),residenceCourt,x,.585,z);cap.scale.y=.7;
      }else cylinder(.025,.035,.35,0xc5cfb8,residenceCourt,x,.23,z,5);
    }
    detailCurve(residenceCourt,railPoints,.034,0xc5cfb5,36,4);
    detailCurve(residenceCourt,railPoints.map(([x,y,z])=>[x,y-.27,z]),.023,0xb0bea1,36,4);
    mergeEnvironmentDetails(residenceCourt);
    // A few trailing plants accent the rock's underside rather than covering
    // the house or occupying the player's editable lawn beneath it.
    const residenceVines=new T.Group();residenceVines.name='spirit-residence-vines';residenceTerrace.add(residenceVines);
    for(let i=0;i<4;i++){
      const a=.40+i*.63,x=Math.cos(a)*3.86,z=Math.sin(a)*3.86,drop=1.30+(i%3)*.13;
      const points=[[x,.13,z],[x*.99,-.22,z*.99],[x*.94,-drop*.65,z*.95],[x*.88+.12,-drop,z*.91]];
      detailCurve(residenceVines,points,.024,0x71875b,7,4);
      for(let leafIndex=0;leafIndex<3;leafIndex++){
        const t=(leafIndex+1)/4,blade=mesh(new T.SphereGeometry(1,6,4),material(leafIndex%2?0x89a16d:0xa3b77c),residenceVines,x*(1-t*.10)+(leafIndex%2?.08:-.08),-.08-drop*t,z*(1-t*.08));
        blade.scale.set(.15,.055,.095);blade.rotation.set(.25,1.1*i,leafIndex%2?.52:-.45);
      }
    }
    mergeEnvironmentDetails(residenceVines);
    const residenceBridge=new T.Group();residenceBridge.name='spirit-residence-bridge';residenceBridge.visible=false;main.add(residenceBridge);
    const stairRails=[[],[]];
    for(let i=0;i<31;i++){
      const t=i/30,a=-.74-.668*t,r=12.8+.2*t,x=Math.cos(a)*r,z=Math.sin(a)*r,top=.29+(residenceSite.y-.29)*t;
      const step=roundedSlab(.38,.94,.12,i%2?0xc9cfb7:0xe0dec4,residenceBridge,x,top-.12,z,.055);step.rotation.y=Math.PI/2-a;step.name='residence-stair-step-'+i;
      for(const side of [-1,1]){
        const px=x+Math.cos(a)*.43*side,pz=z+Math.sin(a)*.43*side;stairRails[side<0?0:1].push([px,top+.53,pz]);
        if(i%4===0||i===30){
          cylinder(.035,.048,.49,0xb2c0a6,residenceBridge,px,top+.245,pz,6);
          cylinder(.075,.055,.05,0xe0dcc0,residenceBridge,px,top+.515,pz,8);
        }
      }
    }
    for(const points of stairRails)detailCurve(residenceBridge,points,.023,0xb8b58b,32,4);
    const stairLanding=roundedSlab(1.12,1.08,.12,0xdedcc1,residenceBridge,1.78,residenceSite.y-.12,-12.8,.09);stairLanding.name='residence-stair-landing';
    mergeEnvironmentDetails(residenceBridge);
    const residenceDecor=window.createSpiritResidenceScene?.({THREE:T,parent:main,material,mergeDetails:mergeEnvironmentDetails,site:residenceSite});
    const studyDecor=window.createSpiritStudyScene?.({THREE:T,parent:main,onChange(){renderer.invalidate?.();scheduleFrame();}});
    const homesteadLanterns=[];
    function refreshHomesteadLamps(){
      // Weather holds this array by reference. Removing a house or pavilion
      // removes its glow immediately, including when visiting another player.
      homesteadLanterns.splice(0,homesteadLanterns.length,...(courtyardDecor?.getLampAnchors?.()||[]),...(residenceDecor?.getLampAnchors?.()||[]));
    }

    // Plot geometry remains stable while only plant groups change at growth stages.
    const plotGroups=[];
    const plantGroups=[];
    const plotMeshes=[];
    const plotHighlights=[];
    const plotPositions=[];
    const plotSignatures=[];
    const plotSlots=[];
    const plotAxis=slot=>(slot-(GRID_SIZE-1)/2)*PLOT_STEP+(slot>=Math.ceil(GRID_SIZE/2)?.9:0)-.45;
    const middle=Math.floor(GRID_SIZE/2);
    const nearColumns=Array.from({length:GRID_SIZE},(_,col)=>col).sort((a,b)=>Math.abs(a-middle)-Math.abs(b-middle)||b-a);
    for(const column of nearColumns)plotSlots.push({row:GRID_SIZE-1,column});
    for(let row=GRID_SIZE-2;row>=0;row--)for(let column=0;column<GRID_SIZE;column++)plotSlots.push({row,column});
    for(let i=0;i<PLOT_COUNT;i++) {
      const slot=plotSlots[i],x=plotAxis(slot.column),z=plotAxis(slot.row);
      const g=new T.Group();g.position.set(x,.21,z);main.add(g);plotGroups.push(g);plotPositions.push(new T.Vector3(x,.5,z));
      const border=roundedSlab(2.22,2.22,.15,0x827157,g,0,0,0,.18);border.userData.plotIndex=i;border.userData.softwareLayer=-1;
      const soil=roundedSlab(2.10,2.10,.025,0x664932,g,0,.155,0,.16);soil.userData.plotIndex=i;soil.userData.softwareLayer=-1;plotMeshes.push(soil,border);
      for(let j=0;j<5;j++){const line=box(1.78,.012,.045,0x805b3e,g,0,.184,(j-2)*.34);line.castShadow=false;line.userData.softwareLayer=-1;}
      const shape=roundRectShape(2.36,2.36,.21), hole=roundRectShape(2.22,2.22,.18);
      shape.holes.push(new T.Path(hole.getPoints()));
      const outline=mesh(new T.ShapeGeometry(shape),new T.MeshBasicMaterial({color:0xf3f0cb,transparent:true,opacity:.98,side:T.DoubleSide,depthWrite:false}),g,0,.225,0);outline.rotation.x=-Math.PI/2;outline.visible=false;outline.castShadow=false;outline.userData.softwareLayer=-.5;plotHighlights.push(outline);
      const plants=new T.Group();plants.position.y=.19;g.add(plants);plantGroups.push(plants);
    }

    const toolAnimator=window.createSpiritFarmToolAnimator?.({
      THREE:T,parent:main,plotPositions,lowDetail:mobileRendering||!!renderer.isSoftware,reducedMotion:!!reduced,
      onImpact(kind,index){playActionNotice(kind,index,!!farmPreview);},
      onComplete(){delete container.dataset.toolAction;}
    });
    const matureEffects=window.createSpiritMatureEffects?.({
      THREE:T,container,camera,reducedMotion:!!reduced,software:!!renderer.isSoftware,
      getViewport:()=>({width,height}),getPixelRatio:()=>renderPixelRatio,isMobile:()=>mobileRendering,
      deformPoint:(index,local,out)=>matureWind?.deformPoint?.(index,local,out)||null
    });
    const matureWind=window.createSpiritMatureWind?.({
      THREE:T,reducedMotion:!!reduced,software:!!renderer.isSoftware,
      getViewportHeight:()=>height,getPixelRatio:()=>renderPixelRatio
    });
    const weatherEffects=window.createSpiritWeatherEffects?.({
      THREE:T,container,camera,distance,nearMist,reducedMotion:!!reduced,
      getViewport:()=>({width,height}),getPixelRatio:()=>renderPixelRatio,isMobile:()=>mobileRendering,
      lanterns:homesteadLanterns
    });
    if(window.createSpiritGardenArt)window.createSpiritGardenArt({THREE:T,parent:main,plotPositions,software:!!renderer.isSoftware});

    // Small untextured contact shadows survive the Canvas compatibility path.
    // Separate rings avoid a hard opaque decal and keep all harvests grounded.
    function contactShadow(parent,size) {
      for(const [inner,outer,opacity] of [[0,.38,.18],[.38,.72,.10],[.72,1,.035]]){
        const geo=inner?new T.RingGeometry(inner*size,outer*size,24):new T.CircleGeometry(outer*size,24);
        const matKey='contact:'+opacity;
        const mat=mats[matKey]||(mats[matKey]=new T.MeshBasicMaterial({color:0x172b1e,transparent:true,opacity,side:T.DoubleSide,depthWrite:false}));
        const shadow=mesh(geo,mat,parent,.09,.008,.10);
        shadow.rotation.x=-Math.PI/2;shadow.scale.set(1,.76,1);shadow.castShadow=false;shadow.receiveShadow=false;shadow.userData.softwareLayer=-.75;
      }
    }

    function removePlants(index) {
      matureEffects?.detach(index);
      matureWind?.detach(index);
      const p=plantGroups[index];
      while(p.children.length){const child=p.children[0];child.traverse(o=>{if(o.geometry&&!o.geometry.userData.sharedHarvestGeometry)o.geometry.dispose();if(o.material&&o.userData.disposeMaterial)o.material.dispose();});p.remove(child);}
    }
    function addHarvestAsset(parent,cropId,closeView) {
      const asset=window.SPIRIT_HARVEST_MODELS&&window.SPIRIT_HARVEST_MODELS[cropId];
      const useLow=(renderer.isSoftware||mobileRendering)&&!closeView&&asset&&asset.low;
      const source=useLow?asset.low:asset,key=cropId+(useLow?':garden':':detail');
      if(!source||!source.positions||!source.colors||source.positions.length<9||source.positions.length%3||source.positions.length!==source.colors.length)return false;
      if(source.indices?source.indices.length%3:source.positions.length%9)return false;
      let geometry=sharedHarvestGeometries.get(key);
      if(!geometry){
        geometry=new T.BufferGeometry();
        geometry.setAttribute('position',new T.Float32BufferAttribute(source.positions,3));
        geometry.setAttribute('color',new T.Float32BufferAttribute(source.colors,3));
        if(source.indices)geometry.setIndex(source.indices);
        if(source.normals&&source.normals.length===source.positions.length)geometry.setAttribute('normal',new T.Float32BufferAttribute(source.normals,3));
        else geometry.computeVertexNormals();
        geometry.computeBoundingBox();geometry.userData.sharedHarvestGeometry=true;sharedHarvestGeometries.set(key,geometry);
      }
      const crop=mesh(geometry,material(0xffffff,{vertexColors:true,roughness:cropId==='tianling'?.36:cropId==='huangjing'?.44:.65,flatShading:false}),parent);
      const size=new T.Vector3();geometry.boundingBox.getSize(size);crop.scale.setScalar(Math.min(1,2.24/Math.max(size.x,size.z)));
      crop.userData.blenderHarvest=true;
      crop.userData.softwareSmooth=!!closeView;
      // Asset annotations use the same Y-up coordinates as their own LOD.
      // Convert once into the plant subgroup; keep shared asset data immutable.
      const anchors=source.fxAnchors||asset.fxAnchors;
      if(anchors){
        crop.updateMatrix();
        const normalMatrix=new T.Matrix3().getNormalMatrix(crop.matrix),scale=crop.scale.x;
        // Resolve the flower tips from the matching LOD once. A bud's exported
        // center shares x/z with its tapered top vertex; use the actual mesh
        // height so fountain jets begin at the tip rather than inside the bud.
        if(Array.isArray(anchors.buds)&&!geometry.userData.spiritBudTips){
          const tips=new Map(),positions=geometry.attributes.position;
          for(const a of anchors.buds){
            if(!Array.isArray(a.position)||a.position.length!==3||!a.position.every(Number.isFinite))continue;
            const [x,y,z]=a.position,radius=Math.max(.003,Number(a.radius)||.09),limit=y+radius*2;
            let top=y;
            for(let v=0;v<positions.count;v++){
              const vy=positions.getY(v);
              if(vy<=top||vy>limit||Math.abs(positions.getX(v)-x)>.00008||Math.abs(positions.getZ(v)-z)>.00008)continue;
              top=vy;
            }
            tips.set(a,[x,top>y?top:y+radius*1.35,z]);
          }
          geometry.userData.spiritBudTips=tips;
        }
        parent.userData.spiritMatureAnchors={};
        for(const kind of ['dew','buds','drips'])if(Array.isArray(anchors[kind])){
          parent.userData.spiritMatureAnchors[kind]=anchors[kind].filter(a=>Array.isArray(a.position)&&a.position.length===3&&a.position.every(Number.isFinite)).map(a=>({
            position:new T.Vector3().fromArray(a.position).applyMatrix4(crop.matrix).toArray(),
            normal:new T.Vector3().fromArray(Array.isArray(a.normal)?a.normal:[0,1,0]).applyMatrix3(normalMatrix).normalize().toArray(),
            radius:Math.max(.003,Number(a.radius)||.018)*scale,
            ...(kind==='buds'?{tip:new T.Vector3().fromArray(geometry.userData.spiritBudTips.get(a)).applyMatrix4(crop.matrix).toArray()}:{})
          }));
        }
      }
      return true;
    }
    function bloom(parent,x,y,z,size,color,petals) {
      for(let j=0;j<(petals||5);j++){
        const a=j*Math.PI*2/(petals||5);const o=mesh(new T.SphereGeometry(size,5,4),material(color),parent,x+Math.cos(a)*size*.85,y,z+Math.sin(a)*size*.85);o.scale.set(.8,.45,1.1);o.rotation.y=-a;
      }
      const center=mesh(new T.SphereGeometry(size*.42,6,4),material(0xf4d988),parent,x,y+size*.23,z);return center;
    }
    function seedling(parent,scale,color) {
      for(const [x,z] of [[-.42,-.36],[.36,-.28],[-.06,.35]]){
        cylinder(.025,.035,.30*scale,0x7d9f67,parent,x,.15*scale,z,5);
        leaf(parent,x-.1*scale,.25*scale,z,.25*scale,color||0x95bb7a,-.8,-.38);
        leaf(parent,x+.1*scale,.25*scale,z,.25*scale,0x6c9f71,.9,-.3);
      }
    }
    function growthInfo(plot,now=(window.SpiritClock?.now?.() || Date.now())) {
      if(window.SpiritGame?.getGrowthInfo)return window.SpiritGame.getGrowthInfo(plot,now);
      const planted=!!(plot?.unlocked&&plot.cropId),withered=planted&&plot.withered===true;
      const elapsed=planted?Math.max(0,Math.min(1,(now-plot.plantedAt)/Math.max(1,plot.duration))):0;
      const staged=Number.isInteger(plot?.stage);
      const stage=planted?staged?Math.max(0,Math.min(4,plot.stage)):Math.min(4,Math.floor(elapsed*4)):0;
      const mature=planted&&!withered&&(staged?stage===4:elapsed>=1);
      const remainingMs=planted&&!mature&&!withered?Math.max(0,(staged?plot.nextWaterAt:plot.plantedAt+plot.duration)-now):0;
      return {stage,stageName:withered?'枯草':['灵种','萌芽','舒叶','蕴灵','成熟'][stage],withered,mature,ready:mature,canWater:planted&&staged&&!withered&&!mature&&remainingMs===0,remainingMs,waterings:stage,wateringsNeeded:4,progress:withered?0:staged?stage/4:elapsed};
    }
    function seedBed(parent,cropId) {
      // Low soil mounds and visible seeds make sowing distinct from the first watering.
      const seedColor={huangjing:0xd6bd86,zihou:0x997e9b,tianling:0xc59c67,yueyang:0x9b9c7b,jiuqu:0xd5b97e}[cropId]||0xc8ab77;
      for(const [k,x,z] of [[0,-.48,-.38],[1,.43,-.38],[2,-.48,.39],[3,.43,.39]]){
        const mound=mesh(new T.SphereGeometry(.24,8,5),material(0x805a3c),parent,x,.012,z);mound.scale.set(1.1,.28,.78);
        for(let n=0;n<2;n++){
          const seed=mesh(new T.SphereGeometry(.065,7,5),cropMaterial(material(seedColor,{roughness:.7})),parent,x+(n-.5)*.12,.075,z+(n-.5)*.055);
          seed.scale.set(.8,.55,1.3);seed.rotation.y=.4+k*.6+n;
        }
      }
    }
    function firstShoots(parent,cropId) {
      if(cropId==='huangjing'){
        for(const [k,x,z] of [[0,-.44,-.3],[1,.35,-.33],[2,-.27,.38],[3,.44,.32]]){
          const h=.18+k%2*.08;
          cylinder(.035,.055,h,0xd9c5a2,parent,x,h/2,z,7);
          const bud=mesh(new T.SphereGeometry(.11,8,6),material(0xd8bc7f),parent,x,h,z);bud.scale.set(.85,1.1,.85);
        }
        return;
      }
      seedling(parent,1.12,cropId==='zihou'?0x96b77e:cropId==='yueyang'?0x80b29a:0x9bbb76);
    }
    function witheredPlant(parent,cropId) {
      const dry=0x968268,pale=0xb39d7b,stem=0x7e705b;
      for(let k=0;k<8;k++){
        const a=k*2.399,x=Math.cos(a)*(.31+k%3*.21),z=Math.sin(a)*(.29+k%2*.27);
        const fallen=leaf(parent,x,.035,z,.18+k%3*.035,k%2?pale:dry,a,.12);
        fallen.scale.y*=.55;fallen.rotation.z=(k%3-1)*.15;
      }
      if(cropId==='huangjing'){
        for(const [x,z,h,r] of [[-.4,-.3,.23,.26],[.33,-.24,.31,.3],[-.08,.36,.16,.24]]){
          branch(parent,[x,0,z],[x+.1,h,z-.04],.06,stem);
          const cap=mesh(new T.SphereGeometry(r,8,4),material(dry),parent,x+.12,h,z-.04);
          cap.scale.set(1,.13,.72);cap.rotation.z=-.28;cap.rotation.x=.16;
          const edge=mesh(new T.TorusGeometry(r*.73,.013,3,12),material(pale),parent,x+.12,h+.025,z-.04);edge.rotation.set(Math.PI/2,.1,.28);edge.scale.y=.72;
        }
      }else{
        const woody=cropId==='yueyang'||cropId==='tianling';
        if(woody){
          cylinder(.09,.13,.28,stem,parent,0,.14,0,8);
          cylinder(.083,.083,.018,pale,parent,0,.286,0,8);
        }
        for(let k=0;k<5;k++){
          const a=k*1.256+.35,x=Math.cos(a)*.42,z=Math.sin(a)*.42,h=.34+k%3*.105;
          const tip=[x+Math.cos(a)*.14,h*.54,z+Math.sin(a)*.14];
          branch(parent,[woody?0:x*.7,woody?.16:0,woody?0:z*.7],[x,h,z],woody?.036:.025,stem);
          branch(parent,[x,h,z],tip,.018,dry);
          leaf(parent,tip[0],tip[1]-.03,tip[2],.15+k%2*.04,pale,-a,.92);
        }
      }
    }
    function jewel(parent,x,y,z,r,lowerColor,upperColor,stretch) {
      const geometry=new T.SphereGeometry(r,9,6),positions=geometry.attributes.position;
      const colors=[],lower=new T.Color(lowerColor),upper=new T.Color(upperColor),mixed=new T.Color();
      for(let i=0;i<positions.count;i++){
        mixed.copy(lower).lerp(upper,Math.max(0,Math.min(1,positions.getY(i)/(r*2)+.5)));
        colors.push(mixed.r,mixed.g,mixed.b);
      }
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      const fruit=mesh(geometry,material(0xffffff,{vertexColors:true,roughness:.4}),parent,x,y,z);
      fruit.scale.y=stretch||1;
      // A real cream-colored highlight patch remains visible in the Canvas renderer.
      const normal=new T.Vector3(-.24,.54,.81).normalize();
      const patch=mesh(new T.SphereGeometry(1,6,4),material(0xfff4ce,{roughness:.35}),parent,x+normal.x*r*.985,y+normal.y*r*(stretch||1),z+normal.z*r*.985);
      patch.scale.set(r*.17,r*.27,r*.045);patch.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);patch.castShadow=false;
      const glint=mesh(new T.OctahedronGeometry(r*.047,0),material(0xfffbed,{emissive:0xfff2cb,emissiveIntensity:.12}),parent,x+normal.x*r*.93,y+normal.y*r*(stretch||1)+r*.20,z+normal.z*r*1.015);glint.castShadow=false;
      return fruit;
    }
    function petal(parent,length,wide,innerColor,tipColor,turn,lift) {
      const points=[[0,0,0],[-.48*wide,.02*length,.27*length],[-.59*wide,.07*length,.63*length],[-.35*wide,.09*length,.90*length],[0,.07*length,length],[.35*wide,.09*length,.90*length],[.59*wide,.07*length,.63*length],[.48*wide,.02*length,.27*length],[0,.22*length,.59*length]];
      const vertices=[],colors=[],inner=new T.Color(innerColor),tip=new T.Color(tipColor),tint=new T.Color();
      for(let j=0;j<8;j++)for(const index of [8,j,(j+1)%8]){
        const p=points[index];vertices.push(...p);tint.copy(inner).lerp(tip,Math.min(1,p[2]/length));colors.push(tint.r,tint.g,tint.b);
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
      const p=mesh(geometry,material(0xffffff,{vertexColors:true,side:T.DoubleSide}),parent);
      p.rotation.y=turn||0;p.position.y=lift||0;return p;
    }
    function richFlower(parent,x,y,z,r) {
      const flower=new T.Group();flower.position.set(x,y,z);parent.add(flower);
      for(let k=0;k<7;k++)petal(flower,r,r*.75,0x8354b3,0xd2a2ed,k*Math.PI*2/7,0);
      for(let k=0;k<5;k++)petal(flower,r*.68,r*.56,0xc27cce,0xf2bedf,k*Math.PI*2/5+.3,.055);
      const heart=mesh(new T.IcosahedronGeometry(r*.19,0),material(0xf1bd4f),flower,0,.12,0);heart.scale.y=.65;
      for(let k=0;k<3;k++){const a=k*Math.PI*2/3;mesh(new T.OctahedronGeometry(r*.055,0),material(0xffe8a0),flower,Math.cos(a)*r*.11,.17,Math.sin(a)*r*.11);}
    }
    function richMaturePlant(parent,cropId) {
      if(cropId==='huangjing') {
        for(const [x,z,h,r,tilt]of[[-.43,-.26,.55,.55,-.10],[.38,-.15,.80,.60,.07],[-.02,.43,.40,.49,-.04]]){
          const mushroom=new T.Group();mushroom.position.set(x,0,z);mushroom.rotation.z=tilt;parent.add(mushroom);
          cylinder(.095,.15,h,0xe2bd7b,mushroom,0,h*.5,0,7);
          const cream=[new T.Vector2(0,-.065),new T.Vector2(r*.75,-.065),new T.Vector2(r*.98,-.015),new T.Vector2(r,.07),new T.Vector2(r*.83,.13),new T.Vector2(0,.13)];
          mesh(new T.LatheGeometry(cream,12),material(0xffe3a4),mushroom,0,h,0);
          const amber=[new T.Vector2(0,.075),new T.Vector2(r,.075),new T.Vector2(r*.97,.16),new T.Vector2(r*.78,.28),new T.Vector2(r*.39,.34),new T.Vector2(0,.35)];
          mesh(new T.LatheGeometry(amber,12),material(0xeaaa37,{roughness:.45}),mushroom,0,h,0);
          const crown=mesh(new T.SphereGeometry(r*.43,8,4),material(0xd9902b),mushroom,0,h+.31,0);crown.scale.y=.15;
          const ring=mesh(new T.TorusGeometry(r*.71,.026,3,12),material(0xfbd783),mushroom,0,h+.235,0);ring.rotation.x=-Math.PI/2;
          const gleam=mesh(new T.TorusGeometry(r*.60,.031,3,9,1.8),material(0xffedba),mushroom,-.035,h+.285,.015);gleam.geometry.rotateX(-Math.PI/2);gleam.rotation.y=.6;
        }
        for(let k=0;k<5;k++){const a=k*Math.PI*2/5;leaf(parent,Math.sin(a)*.46,.12,Math.cos(a)*.46,.36,0xa5af6e,a,-.22);}
      }else if(cropId==='zihou'){
        for(const [x,z,h,r]of[[-.43,-.31,.95,.43],[.34,-.35,1.12,.44],[-.46,.35,.73,.40],[.41,.30,.83,.43],[.00,.03,1.24,.44]]){
          branch(parent,[x*.45,0,z*.45],[x,h,z],.034,0x72956c);
          leaf(parent,x*.72,h*.36,z*.72,.37,0x91b379,-.7+x,-.35);
          leaf(parent,x*.95,h*.63,z*.95,.31,0x77a271,1+x,.22);
          richFlower(parent,x,h,z,r);
        }
      }else if(cropId==='tianling'){
        const dew=[],drips=[];parent.userData.spiritMatureAnchors={dew,drips};
        branch(parent,[0,0,0],[-.06,1.28,-.13],.075,0xa58450);
        // Darker leaves sit behind the fruit, making the plump golden clusters readable.
        for(let k=0;k<6;k++){const a=k*Math.PI*2/6;leaf(parent,Math.sin(a)*.41,1.05+(k%2)*.23,-.32+Math.cos(a)*.21,.39,k%2?0x84a56b:0x648e60,a,-.22);}
        for(const [x,y,z,r]of[[-.52,.91,.12,.31],[.43,.91,.22,.34],[-.06,.60,.49,.34],[-.23,1.27,-.17,.31],[.39,1.33,-.19,.28],[-.57,.58,-.24,.27],[.66,.62,-.20,.26]]){
          branch(parent,[-.04,.69,-.1],[x,y+.12,z],.028,0x8a8c54);
          jewel(parent,x,y,z,r,0xe99a3e,0xffd97c,1.08);
          drips.push({position:[x,y-r*1.08,z],normal:[0,-1,0],radius:r*.09});
          for(const direction of [[.36,.52,.77],[-.62,.45,.64]]){
            const n=new T.Vector3(...direction).normalize();
            dew.push({position:[x+n.x*r,y+n.y*r*1.08,z+n.z*r],normal:[n.x,n.y/1.08,n.z],radius:r*.09});
          }
          const calyx=mesh(new T.ConeGeometry(r*.21,.10,5),material(0x738c54),parent,x,y+r*1.08+.025,z);calyx.rotation.z=.15;
        }
      }else if(cropId==='yueyang'){
        branch(parent,[0,0,0],[-.09,.86,.02],.11,0x827a54);
        branch(parent,[-.09,.86,.02],[.09,1.48,-.08],.062,0x827a54);
        for(let k=0;k<5;k++){
          const a=k*Math.PI*2/5+.25,x=Math.sin(a)*.52,z=Math.cos(a)*.46,y=.91+(k%3)*.18;
          branch(parent,[-.06,.49+k*.10,0],[x,y,z],.045,0x8b9663);
          for(let j=0;j<4;j++){const b=a+j*1.6;leaf(parent,x+Math.sin(b)*.13,y+.04+(j%2)*.14,z+Math.cos(b)*.12,.39,j%2?0x99c59f:0x6fa583,b,-.28);}
        }
        leaf(parent,.04,1.48,-.04,.40,0xb2d8a8,.3,-.3);
        for(const [x,y,z,r]of[[-.44,.86,.44,.15],[.36,1.02,.39,.17],[.02,1.71,-.04,.14]])jewel(parent,x,y,z,r,0x81bea5,0xe1f3ce,1.04);
      }else if(cropId==='ningcui'){
        for(let k=0;k<9;k++){
          const a=k*Math.PI*2/9;
          const l=mesh(new T.OctahedronGeometry(1,0),material(k%2?0x78bc8f:0x9ed8a5),parent,Math.sin(a)*.33,.22,Math.cos(a)*.33);
          l.scale.set(.235,.105,.63);l.rotation.set(-.22,a,0);
          const vein=mesh(new T.OctahedronGeometry(1,0),material(0xd0ecc0),parent,Math.sin(a)*.42,.30,Math.cos(a)*.42);vein.scale.set(.025,.025,.42);vein.rotation.set(-.22,a,0);vein.castShadow=false;
        }
        for(let k=0;k<6;k++){
          const a=k*Math.PI/3+.3,l=mesh(new T.OctahedronGeometry(1,0),material(k%2?0xbce8ae:0x8dce9b),parent,Math.sin(a)*.20,.43,Math.cos(a)*.20);l.scale.set(.18,.13,.46);l.rotation.set(-.70,a,0);
        }
        const gem=mesh(new T.OctahedronGeometry(.31,0),material(0xc4f1b4,{emissive:0xaadf9b,emissiveIntensity:.13}),parent,0,.84,0);gem.scale.y=1.6;gem.rotation.y=.3;
        const facet=mesh(new T.OctahedronGeometry(.10,0),material(0xf5ffdf),parent,-.045,.98,.16);facet.scale.set(.48,1.65,.30);facet.castShadow=false;
        for(let k=0;k<3;k++){const a=k*2.094;jewel(parent,Math.sin(a)*.54,.36,Math.cos(a)*.54,.075,0xbbdb9f,0xf7f2ba,1);}
      }else{
        const torso=mesh(new T.SphereGeometry(.32,8,5),material(0xe7bd75),parent,-.04,.47,.12);torso.scale.set(1.08,1.60,.94);torso.rotation.z=-.13;
        const lobe=mesh(new T.SphereGeometry(.24,7,4),material(0xf1cf91),parent,.20,.29,.14);lobe.scale.set(.82,1.3,.9);lobe.rotation.z=.37;
        for(let k=0;k<6;k++){const a=k*Math.PI/3;branch(parent,[Math.sin(a)*.12,.31,.12+Math.cos(a)*.1],[Math.sin(a)*.63,.08,.12+Math.cos(a)*.53],.075,0xdab06c);branch(parent,[Math.sin(a)*.63,.08,.12+Math.cos(a)*.53],[Math.sin(a+.12)*.78,.035,.12+Math.cos(a+.12)*.66],.026,0xe6c28a);}
        for(let k=0;k<3;k++){const wrinkle=mesh(new T.TorusGeometry(.265-k*.025,.010,3,8,2.5),material(0xbe8f49),parent,-.04,.31+k*.17,.12);wrinkle.geometry.rotateX(-Math.PI/2);wrinkle.rotation.y=-.5;}
        branch(parent,[0,.65,0],[.03,1.92,0],.046,0x527c45);
        for(let k=0;k<6;k++){const a=k*Math.PI/3;leaf(parent,Math.sin(a)*.31,1.05+(k%2)*.12,Math.cos(a)*.31,.46,k%2?0x86ac69:0x639264,a,-.26);}
        const buds=[];parent.userData.spiritMatureAnchors={buds};
        for(let k=0;k<8;k++){
          const a=k*Math.PI*.75,x=Math.sin(a)*.235,z=Math.cos(a)*.21,y=1.98+(k%3)*.075;
          branch(parent,[.03,1.88,0],[x,y-.10,z],.012,0x557b43);
          jewel(parent,x,y,z,.125,0xb82542,0xed6a7c,1.28);
          for(let j=0;j<3;j++){const b=a+j*Math.PI*2/3;leaf(parent,x,y-.12,z,.13,0x4a743c,b,-.9);}
          buds.push({position:[x,y,z],tip:[x,y+.125*1.28,z],normal:[0,1,0],radius:.125});
        }
      }
    }
    function buildPlant(i,plot) {
      const growth=growthInfo(plot),stage=growth.stage;
      const bucket=growth.mature?3:stage>=3?2:stage===2?1:0;
      const wet=!!plot.cropId&&!growth.withered&&!growth.mature&&(Number.isInteger(plot.stage)?stage>0&&!growth.canWater:plot.watered);
      const assetReady=!!(window.SPIRIT_HARVEST_MODELS&&window.SPIRIT_HARVEST_MODELS[plot.cropId]);
      const signature=[plot.cropId||'',plot.unlocked===false?'locked':'open',stage,growth.withered?'withered':'alive',wet?'watered':'dry',plot.stolen||plot.attempted?'visited':'',bucket===3&&assetReady?'blender':'procedural',inspectedPlot===i?'detail':mobileRendering?'mobile-garden':'garden'].join(':');
      if(plotSignatures[i]===signature)return;
      plotSignatures[i]=signature;removePlants(i);
      renderer.shadowMap.needsUpdate=true;
      if(renderer.invalidate)renderer.invalidate();
      const g=plantGroups[i];
      const soil=plotGroups[i].children[1];
      const locked=plot.unlocked===false,border=plotGroups[i].children[0];
      border.material=material(locked?0x6c8252:0x827157);
      border.scale.y=locked?.18:1;
      soil.position.y=locked?.028:.155;
      soil.scale.y=locked?.35:1;
      g.position.y=locked?.045:.19;
      soil.material=material(locked?0x748956:wet?0x493b2d:growth.withered?0x6f5740:0x664932);
      for(let furrow=2;furrow<7;furrow++)plotGroups[i].children[furrow].visible=plot.unlocked!==false;
      if(plot.unlocked===false){
        for(let k=0;k<3;k++){const x=(k-1)*.52,z=k%2?.32:-.25;stone(g,x,.10,z,.19,.13,.21,0xa7ae96);for(let j=0;j<2;j++){const o=mesh(new T.ConeGeometry(.035,.30+j*.09,3),material(0x789762),g,x+(j-.5)*.11,.22,z+.13);o.rotation.z=(j-.5)*.3;}}
        return;
      }
      if(!plot.cropId)return;
      if(growth.withered){contactShadow(g,.73);witheredPlant(g,plot.cropId);return;}
      contactShadow(g,bucket===3?1.07:bucket===2?.82:.49);
      if(stage===0){seedBed(g,plot.cropId);return;}
      if(stage===1){firstShoots(g,plot.cropId);applyCropNightFill(g);return;}
      const s=bucket===1?.56:bucket===2?.82:1;
      const plants=new T.Group();g.add(plants);plants.scale.setScalar(s);
      plants.rotation.y=((i*7)%9-4)*.085;
      const color=PALETTE[plot.cropId]||0x91c285;
      if(bucket===3){
        if(!addHarvestAsset(plants,plot.cropId,inspectedPlot===i))richMaturePlant(plants,plot.cropId);
        applyCropNightFill(plants);
        matureWind?.attach(i,plants,{cropId:plot.cropId,plotX:plotPositions[i].x,plotZ:plotPositions[i].z,mobile:mobileRendering,ornaments:!matureEffects?.enabled&&!plot.stolen&&!plot.attempted});
        // Measure crown positions after wind setup. The ornament layer keeps
        // the plant materials and their original pigments untouched.
        if(!plot.stolen&&!plot.attempted)matureEffects?.attach(i,plants,{cropId:plot.cropId,mobile:mobileRendering});
      }else if(plot.cropId==='huangjing') {
        const cluster=bucket===1?[[-.38,-.24,.48,.32],[.36,-.13,.62,.35],[.05,.42,.36,.27]]:[[-.48,-.3,.65,.43],[.37,-.34,.83,.5],[-.16,.35,.48,.39],[.49,.41,.37,.28],[-.52,.5,.26,.25]];
        for(const [x,z,h,r]of cluster) {
          cylinder(.06,.095,h,0xd0aa65,plants,x,h/2,z,7);
          const cap=mesh(new T.SphereGeometry(r,10,5),material(bucket===1?0xdac58c:0xe1b653),plants,x,h,z);cap.scale.y=bucket===1?.62:.3;
          if(bucket>1){
            const rim=mesh(new T.TorusGeometry(r*.72,.022,4,14),material(0xf8dda0),plants,x,h+.065,z);rim.rotation.x=-Math.PI/2;
            const dot=mesh(new T.SphereGeometry(r*.44,7,4),material(0xd59b3b),plants,x,h+.03,z);dot.scale.y=.16;
          }
        }
        for(let k=0;k<4;k++)leaf(plants,Math.cos(k*1.57)*.45,.12,Math.sin(k*1.57)*.45,.34,0x94aa69,k*1.57,.2);
      } else if(plot.cropId==='zihou') {
        for(const [x,z,h]of[[-.43,-.3,.72],[.25,-.28,.94],[.46,.3,.65],[-.22,.36,.84],[0,0,1.05]]) {
          branch(plants,[x,0,z],[x+.06,h,z],.026,0x719d74);
          leaf(plants,x-.09,h*.38,z,.27,0x83b584,-.6,.35);leaf(plants,x+.1,h*.60,z,.24,0x6da579,1.1,-.3);
          if(bucket>1){
            const bud=mesh(new T.SphereGeometry(.14,8,6),material(0xb391c4),plants,x+.06,h,z);bud.scale.set(.75,1.2,.75);
            for(let k=0;k<3;k++)leaf(plants,x+.06,h-.09,z,.12,0x82ac76,k*2.094,.65);
            if(h>.95)bloom(plants,x+.06,h+.06,z,.17,0xc2a1d6,5);
          }else leaf(plants,x+.06,h-.05,z,.22,0x9cbe83,.4,-.6);
        }
      } else if(plot.cropId==='tianling') {
        branch(plants,[0,0,0],[0,1.02,0],.06,0x9b9065);
        for(let k=0;k<5;k++) {
          const a=k*Math.PI*2/5,x=Math.cos(a)*.48,z=Math.sin(a)*.48,y=.68+(k%2)*.23;
          branch(plants,[0,.45,0],[x,y,z],.033,0x8b9769);
          leaf(plants,x,y+.12,z,.42,0x71ae88,a,.15);
          leaf(plants,x*.7,y+.28,z*.7,.35,0x8cb88a,a+1,-.22);
          if(bucket>1){const fruit=mesh(new T.SphereGeometry(.18,8,6),material(0xadc27b),plants,x,y-.12,z);fruit.scale.y=1.1;}
        }
        leaf(plants,0,1.08,0,.38,0x90c398,0,-.4);
      } else if(plot.cropId==='yueyang') {
        // An old jade-leaved soulwood sapling: dark forked wood and quiet spirit light.
        branch(plants,[0,0,0],[-.05,.64,.02],.075,0x6c796b);
        branch(plants,[-.05,.64,.02],[.09,1.3,-.04],.045,0x6c796b);
        for(let k=0;k<5;k++) {
          const a=k*Math.PI*2/5+.25,x=Math.cos(a)*.49,z=Math.sin(a)*.49,y=.75+(k%3)*.16;
          branch(plants,[0,.4+k*.09,0],[x,y,z],.032,0x778b78);
          for(let l=0;l<3;l++) {
            const lx=x+Math.cos(a+l*1.8)*.12,lz=z+Math.sin(a+l*1.8)*.12;
            leaf(plants,lx,y+.04+l*.055,lz,.34,l%2?0x91b8a4:0x74a68f,-a+l*.7,.42);
          }
          if(bucket>1) {
            branch(plants,[x,y,z],[x*.98,y-.24,z],.012,0x95bfad);
            leaf(plants,x*.98,y-.22,z,.17,0xa7cebb,-a,.75);
          }
        }
        leaf(plants,.08,1.32,-.03,.29,0x9bbfa9,.35,-.45);
        if(bucket>1){const spirit=mesh(new T.OctahedronGeometry(.075,0),material(0xd5f1e3,{emissive:0xa6d9c4,emissiveIntensity:.3}),plants,0,1.55,0);spirit.scale.y=1.4;}
      } else if(plot.cropId==='ningcui') {
        for(let k=0;k<9;k++){const a=k*Math.PI*2/9;leaf(plants,Math.cos(a)*.28,.23,Math.sin(a)*.28,.57,k%2?0x74b58c:0x94cf9a,-a+.7,-.32);}
        cylinder(.04,.07,.62,0x70ab7a,plants,0,.31,0,6);
        bloom(plants,0,.65,0,.28,0xade0ac,6);
        const gem=mesh(new T.OctahedronGeometry(.16,0),material(0xb5f2b6,{emissive:0x93d19d,emissiveIntensity:.24}),plants,0,.82,0);gem.scale.y=1.35;
      } else {
        const root=mesh(new T.SphereGeometry(.24,6,5),material(0xe2bc8b),plants,0,.2,0);root.scale.set(.75,1.35,.85);
        for(let k=0;k<5;k++){const a=k*1.256;branch(plants,[0,.2,0],[Math.cos(a)*.34,.04,Math.sin(a)*.34],.04,0xcfaf83);}
        branch(plants,[0,.3,0],[0,.96,0],.035,0x7ba17a);
        for(let k=0;k<5;k++){const a=k*1.256;leaf(plants,Math.cos(a)*.23,.73,Math.sin(a)*.23,.43,0x7fba87,-a+.4,-.18);}
        if(bucket>1)for(let k=0;k<7;k++){const a=k*2.4;mesh(new T.SphereGeometry(.085,6,5),material(0xb2c68a),plants,Math.cos(a)*.16,1.0+(k%2)*.08,Math.sin(a)*.16);}
      }
      if(bucket!==3)applyCropNightFill(plants);
      if(bucket===3&&!plot.stolen&&!plot.attempted) {
        const glow=new T.MeshBasicMaterial({color,transparent:true,opacity:.08,side:T.DoubleSide,depthWrite:false});
        const halo=mesh(new T.RingGeometry(.93,.945,32),glow,g,0,.03,0);halo.rotation.x=-Math.PI/2;halo.castShadow=false;halo.userData.disposeMaterial=true;
        // The species layer replaces generic glints in both rendering modes.
        // Retain the old glints when that optional layer is unavailable.
        if(!matureEffects?.enabled&&!matureWind?.gpuEnabled)for(let k=0;k<3;k++){const a=k*Math.PI*2/3+.4;const sp=mesh(new T.OctahedronGeometry(.037,0),material(0xffe8a4,{emissive:0xffdf91,emissiveIntensity:.20}),g,Math.cos(a)*.88,.62+k*.28,Math.sin(a)*.88);sp.castShadow=false;sp.userData.sparkle=true;sp.userData.phase=k*1.4+i;}
      }
    }

    // Distant peaks share the same miniature material language.
    const satellites=[];
    function satellite(x,y,z,scale,rot) {
      const g=new T.Group();g.position.set(x,y,z);g.scale.setScalar(scale);g.rotation.y=rot||0;scene.add(g);island(g,2.8,4.6,0x9bbba0);pine(g,-.4,-.3,1.1,[0x648f7d,0x87ac8b,0xa6c4a0]);pine(g,1,.3,.65,[0x80a38b,0x9db99a,0xb9cbb0]);satellites.push({g,y,phase:rand(0,6)});return g;
    }
    satellite(-17,-1.8,-3,.53,.3);
    satellite(14,-1,-7,.57,-.6);
    satellite(14,-3.8,10,.28,.2);

    // A few broad wisps preserve the quiet, airy composition.
    const clouds=[];
    function cloud(x,y,z,s,options={}) {
      const g=new T.Group();g.position.set(x,y,z);g.scale.setScalar(s);scene.add(g);
      const baseOpacity=options.opacity??.53,cm=new T.MeshBasicMaterial({color:0xf4f7ed,transparent:true,opacity:baseOpacity,depthWrite:false});
      if(options.residence){g.name='spirit-residence-cloud';g.visible=false;}
      for(const [cx,cy,cz,r]of[[-1,0,0,.72],[0,.08,0,1.02],[1,0,.08,.7],[.4,.04,.3,.7]]){const c=mesh(new T.SphereGeometry(r,options.residence?8:10,options.residence?4:7),cm,g,cx,cy,cz);c.scale.set(1.2,options.residence?.09:.18,options.residence?.45:.63);c.castShadow=false;c.receiveShadow=false;c.userData.softwareLayer=options.residence?0:-3;}
      clouds.push({g,x,phase:rand(0,6),material:cm,baseOpacity,residence:!!options.residence});
    }
    cloud(-11,-3.6,3,2.0);cloud(10.5,-3.8,2,1.9);cloud(-7,-2.5,-10,1.65);cloud(5,-5,10,1.8);
    cloud(residenceSite.x+2.25,residenceSite.y-1.80,residenceSite.z+.95,1.04,{opacity:.22,residence:true});
    cloud(residenceSite.x-2.30,residenceSite.y-1.65,residenceSite.z+.48,.88,{opacity:.18,residence:true});
    const particles=[];
    const moteGeo=new T.OctahedronGeometry(.025,0),moteMat=material(0xfff0bd,{emissive:0xffe9ab,emissiveIntensity:.5});
    for(let i=0;i<24;i++){const p=mesh(moteGeo,moteMat,main,rand(-6,6),rand(.5,3.3),rand(-5,5));p.castShadow=false;particles.push({p,base:p.position.clone(),phase:rand(0,6),speed:rand(.18,.43)});}

    let environmentSignature='',appliedSeason='';
    const seasonGround={spring:0x769260,summer:0x5e8059,autumn:0x969263,winter:0xd9e1d1};
    const seasonCrown={spring:0xe8bbb0,summer:0x82a774,autumn:0xdba35b,winter:0xa3b6ae};
    const environmentColor=new T.Color();
    function setEnvironment(snapshot){
      if(disposed||!snapshot)return;
      const season=Object.hasOwn(seasonGround,snapshot.seasonId)?snapshot.seasonId:'spring';
      const phase=['dawn','day','dusk','night'].includes(snapshot.phaseId)?snapshot.phaseId:'day';
      const weather=['clear','cloudy','rain','snow','mist'].includes(snapshot.weatherId)?snapshot.weatherId:'clear';
      const daylight=Math.max(0,Math.min(1,Number.isFinite(snapshot.daylight)?snapshot.daylight:phase==='night'?0:1));
      // Five-minute-sized light changes suffice for a two-hour twilight, and
      // keep repeated server refreshes from invalidating the software scenery.
      const lightStep=Math.round(daylight*24)/24,key=[season,phase,weather,lightStep].join(':');
      if(key===environmentSignature)return;environmentSignature=key;
      container.dataset.season=season;container.dataset.dayPhase=phase;container.dataset.weather=weather;
      const night=1-lightStep,overcast=weather==='rain'?.23:weather==='cloudy'?.15:weather==='snow'?.13:weather==='mist'?.10:0;
      cropNightFill.value=cropNightFillStrength*night*night*(3-2*night);
      ambient.color.setHex(0xc4d9e4).lerp(environmentColor.setHex(0xfff4de),lightStep);
      ambient.groundColor.setHex(0x354c53).lerp(environmentColor.setHex(0x294e3b),lightStep);
      ambient.intensity=1.05+lightStep*.30;
      sun.color.setHex(0xb8d2e5).lerp(environmentColor.setHex(phase==='dusk'?0xffd6a0:phase==='dawn'?0xffe2c2:0xfff1d7),lightStep);
      sun.intensity=(.65+lightStep*2.35)*(1-overcast);
      fill.color.setHex(0xa5c2d5).lerp(environmentColor.setHex(0xd4e3ed),lightStep);
      fill.intensity=.35+night*.16;
      renderer.toneMappingExposure=1.02+night*.08;
      if(renderer.isSoftware)renderer.domElement.style.filter=`brightness(${(.77+lightStep*.23)*(1-overcast*.3)}) saturate(${.96+lightStep*.04})`;
      const ownedEnvironment={seasonId:season,phaseId:phase,weatherId:weather,daylight:lightStep};
      courtyardDecor?.setEnvironment?.(ownedEnvironment);residenceDecor?.setEnvironment(ownedEnvironment);
      for(const cloud of clouds){cloud.material.color.setHex(0x8c9fa3).lerp(environmentColor.setHex(0xf4f7ed),lightStep);cloud.material.opacity=cloud.baseOpacity*(weather==='mist'?1.28:1)-night*Math.min(.07,cloud.baseOpacity*.2);}
      if(appliedSeason!==season){
        appliedSeason=season;
        const winter=season==='winter';snowGroups.forEach(group=>{group.visible=winter;});
        for(const entry of sceneryMaterials.values()){
          if(entry.kind==='blossom')entry.material.color.copy(entry.base).lerp(environmentColor.setHex(seasonCrown[season]),season==='spring'?0:.85);
          else entry.material.color.copy(entry.base).lerp(environmentColor.setHex(season==='autumn'?0x8d8e57:season==='winter'?0x526f62:season==='summer'?0x497956:0x638b5d),.26);
        }
        for(const ground of seasonalGrounds){
          const attribute=ground.body.geometry.attributes.color,values=attribute.array;
          environmentColor.setHex(seasonGround[season]);
          const mix=winter?.9:ground.main?.58:.36;
          for(let i=ground.start*3;i<values.length;i+=3){
            // Preserve the original small tonal variation on each meadow face.
            const variation=.97+(ground.base[i]+ground.base[i+1]+ground.base[i+2])*.025;
            values[i]=ground.base[i]*(1-mix)+environmentColor.r*mix*variation;
            values[i+1]=ground.base[i+1]*(1-mix)+environmentColor.g*mix*variation;
            values[i+2]=ground.base[i+2]*(1-mix)+environmentColor.b*mix*variation;
          }
          attribute.needsUpdate=true;
        }
        renderer.shadowMap.needsUpdate=true;
      }
      weatherEffects?.setEnvironment({seasonId:season,phaseId:phase,weatherId:weather,daylight:lightStep});
      renderer.invalidate?.();scheduleFrame();
    }
    function setWeatherEffectsEnabled(value){weatherEffects?.setEnabled(!!value);scheduleFrame();}
    setEnvironment(options.environment||{seasonId:'spring',phaseId:'day',weatherId:'clear',daylight:1});

    const actionNodes=new Map(), actionTimers=new Set();
    let farmPreview=null;
    function clearActions(){for(const node of actionNodes.keys())node.remove();actionNodes.clear();for(const timer of actionTimers)clearTimeout(timer);actionTimers.clear();toolAnimator?.clear();farmPreview=null;delete container.dataset.toolAction;renderer.invalidate?.();}
    const labels=document.createElement('div');
    labels.className='spirit-plot-labels';
    labels.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:3;';
    container.appendChild(labels);
    const decorationLabels=document.createElement('div'),decorationLabelNodes=new Map();
    decorationLabels.className='spirit-decor-labels';decorationLabels.hidden=true;container.appendChild(decorationLabels);
    const decorationFootprint=document.createElementNS('http://www.w3.org/2000/svg','svg');
    decorationFootprint.setAttribute('class','spirit-decor-footprint');decorationFootprint.setAttribute('aria-hidden','true');
    const decorationPolygon=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    decorationPolygon.setAttribute('vector-effect','non-scaling-stroke');decorationFootprint.appendChild(decorationPolygon);decorationLabels.appendChild(decorationFootprint);
    const inspection=document.createElement('div');inspection.className='spirit-inspection';inspection.hidden=true;
    inspection.setAttribute('role','group');inspection.setAttribute('aria-label','灵植近观');
    inspection.style.cssText='position:absolute;bottom:54px;left:50%;transform:translateX(-50%);z-index:5;align-items:center;gap:12px;max-width:calc(100% - 24px);padding:9px 13px;border:1px solid #b5c4a3;border-radius:9px;background:rgba(250,249,232,.97);box-shadow:0 4px 16px #34544215;white-space:nowrap;font-size:12px;color:#446552;';
    const inspectionName=document.createElement('span'),inspectionBack=document.createElement('button');
    inspectionBack.type='button';inspectionBack.textContent='返回全景';inspectionBack.className='button button-secondary';
    inspectionBack.style.cssText=`padding:6px 10px;min-height:${mobileRendering?44:30}px;font-size:12px;`;inspectionBack.addEventListener('click',()=>resetCamera());
    inspection.appendChild(inspectionName);inspection.appendChild(inspectionBack);container.appendChild(inspection);
    const labelNodes=[],labelParts=[];
    function fieldIcon(name){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      const use=document.createElementNS('http://www.w3.org/2000/svg','use');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      use.setAttribute('href',`#i-${name}`);svg.appendChild(use);return {svg,use};
    }
    for(let i=0;i<PLOT_COUNT;i++) {
      const b=document.createElement('button');b.type='button';b.className='spirit-plot-label';
      b.style.cssText='position:absolute;left:0;top:0;transform:translate(-50%,-50%);';
      const row=document.createElement('span'),glyph=document.createElement('span'),caption=document.createElement('span'),note=document.createElement('small');
      row.className='plot-label-main';glyph.className='plot-label-glyph';caption.className='plot-label-caption';note.className='plot-label-note';
      glyph.setAttribute('aria-hidden','true');
      const symbol=fieldIcon('leaf');glyph.appendChild(symbol.svg);row.appendChild(glyph);row.appendChild(caption);b.appendChild(row);b.appendChild(note);
      b.addEventListener('click',e=>{
        e.stopPropagation();if(e.detail>1)return;
        if(decorationEdit)return;
        if(sceneMode==='home'&&currentView.farmBusy)return;
        if(sceneMode==='home'&&currentPlots[i]?.unlocked===false&&options.onPlotUnlock){options.onPlotUnlock(i);return;}
        if(sceneMode==='home'&&currentPlots[i]?.unlocked&&options.onPlotAction){
          const p=currentPlots[i],growth=growthInfo(p);
          const action=growth.withered?'clear':!p.cropId?'plant':growth.canWater?'water':growth.mature?'harvest':null;
          if(action){options.onPlotAction(i,action);return;}
        }
        if(options.onPlotClick)options.onPlotClick(i);
      });
      b.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')setHover(i);});b.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')setHover(null);});
      labels.appendChild(b);labelNodes.push(b);labelParts.push({glyph,caption,note,use:symbol.use,sizeKey:'',needsMeasure:true,width:0,height:0});
    }
    function durationText(ms){
      const s=Math.max(0,Math.ceil(ms/1000));
      const h=Math.floor(s/3600),m=Math.floor(s%3600/60),seconds=String(s%60).padStart(2,'0');
      return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${seconds}`:`${String(m).padStart(2,'0')}:${seconds}`;
    }
    function labelContent(index,classes,caption,note,iconName,compact,active){
      const b=labelNodes[index],parts=labelParts[index];
      const className=`spirit-plot-label ${classes}${compact?' is-compact':''}${active?' is-active':''}`;
      if(b.className!==className)b.className=className;
      // Keep the button and its children stable while only the clock text changes.
      if(parts.caption.textContent!==caption)parts.caption.textContent=caption;
      if(parts.note.textContent!==note)parts.note.textContent=note;
      parts.note.hidden=!note;parts.glyph.hidden=!iconName;
      if(iconName&&parts.use.getAttribute('href')!==`#i-${iconName}`)parts.use.setAttribute('href',`#i-${iconName}`);
      const sizeKey=[className,caption.length,note.length,iconName].join(':');
      if(parts.sizeKey!==sizeKey){parts.sizeKey=sizeKey;parts.needsMeasure=true;}
      b.style.transform=`translate(-50%,-50%) scale(${compact?Math.min(1,zoom):1})`;
    }
    function refreshLabels(force) {
      const now=window.SpiritClock?.now?.() || Date.now();if(!force&&now-lastLabelTime<650)return;lastLabelTime=now;
      const raining=options.isRaining?.()===true;
      for(let i=0;i<PLOT_COUNT;i++) {
        const p=currentPlots[i]||{unlocked:false},b=labelNodes[i],growth=growthInfo(p,now);
        const visited=sceneMode==='neighbor'&&(p.stolen||p.attempted);
        const ripe=p.cropId&&growth.mature&&!visited;
        const compact=width<450;
        const locked=p.unlocked===false;
        const active=selected===i||hover===i;
        const ripeMark=ripe&&!active;
        const unlockInfo=locked&&sceneMode==='home'?options.getUnlockInfo?.(i):null;
        const activity=sceneMode==='home'&&currentView.farmActivity?.indices.includes(i)?currentView.farmActivity:null;
        b.disabled=sceneMode==='home'&&!!currentView.farmBusy;
        b.setAttribute('aria-busy',String(!!activity&&activity.phase!=='unconfirmed'));
        if(activity){
          labelContent(i,'is-growth is-farm-pending',activity.label,activity.note,activity.glyph,compact,active);
          b.dataset.phase=activity.phase;
          b.setAttribute('aria-disabled','true');b.setAttribute('aria-label',`第${i+1}块灵田，${activity.label}，${activity.note}`);
          b.title=activity.note;continue;
        }
        delete b.dataset.phase;
        b.setAttribute('aria-disabled',String(b.disabled));
        if(unlockInfo){
          const canUnlock=unlockInfo.realmReady&&unlockInfo.affordable;
          const cost=String(Number(unlockInfo.cost)||0);
          const sub=unlockInfo.realmReady?`${cost}灵石`:compact?unlockInfo.realmName:`${unlockInfo.realmName} · ${cost}`;
          labelContent(i,'is-locked is-reclaim'+(canUnlock?' is-available':''),'开垦',sub,'',compact,active);
          const condition=!unlockInfo.realmReady?`需达到${unlockInfo.realmName}`:!unlockInfo.affordable?'灵石不足':'点击直接开垦';
          b.setAttribute('aria-label',`第${i+1}块灵田，开垦，${cost}灵石，${condition}`);
          b.setAttribute('aria-disabled',String(b.disabled||!canUnlock));b.setAttribute('aria-pressed',String(selected===i));
          b.title=`第${i+1}块灵田 · 开垦需要${cost}灵石 · ${condition}`;
          continue;
        }
        if(sceneMode==='home'&&!locked&&p.cropId&&!growth.mature){
          const wilted=growth.withered,thirsty=!wilted&&growth.canWater;
          const waterNumber=Math.min(4,growth.waterings+1);
          const caption=wilted?(compact?'锄草':'铲枯草'):thirsty?(raining?'雨水照料':'浇水'):durationText(growth.remainingMs);
          const note=wilted?(p.witheredReason==='frost'?'冬寒冻枯':compact?'清理再种':'清理后播种'):raining?'雨中自动补水':thirsty?`第 ${waterNumber}/4 次`:'后可浇水';
          const classes='is-growth'+(wilted?' is-withered':thirsty?' is-thirsty':' is-waiting'+(caption.length>5?' has-long-time':''));
          labelContent(i,classes,caption,note,wilted?'hoe':thirsty?'drop':'clock',compact,active);
          const detail=wilted?(p.witheredReason==='frost'?'冬寒冻枯，点击用锄头铲除':'枯草，点击用锄头铲除'):thirsty?`${growth.stageName}，第${waterNumber}次补水，共4次，${raining?'雨水自动照料':'点击浇水'}`:`${growth.stageName}，已补水${growth.waterings}/4次，${durationText(growth.remainingMs)}后需补水${raining?'，雨中自动照料':''}`;
          b.setAttribute('aria-label',`第${i+1}块灵田，${NAMES[p.cropId]||'灵草'}，${detail}`);
          b.setAttribute('aria-pressed',String(selected===i));b.title=`第${i+1}块灵田 · ${NAMES[p.cropId]||'灵草'} · ${detail}`;
          continue;
        }
        if(sceneMode==='neighbor'&&!locked&&typeof p.canSteal==='boolean'){
          let caption='',note='',classes='',iconName='';
          if(!p.cropId){caption='空田';note='待田主播种';classes='is-empty';iconName='seed';}
          else if(growth.withered){caption=p.witheredReason==='frost'?'冬寒冻枯':'已收割';note='待田主锄草';classes='is-growth is-withered';iconName='hoe';}
          else if(p.attemptStatus==='pending'){caption='待破阵';note='继续本次答题';classes='is-visited';iconName='formation';}
          else if(p.stolenUnits){caption=compact?'已保护':'收成保护';note='余下归田主';classes='is-visited';iconName='lock';}
          else if(p.attemptStatus){caption=compact?'已访':'本茬已访';note='等下一茬';classes='is-visited';iconName='check';}
          else if(p.canSteal){caption=ripeMark?'':'偷采';classes='is-ripe'+(ripeMark?' is-ripe-mark':'');iconName=ripeMark?'spark':'hand';}
          else if(growth.canWater){caption=raining?'雨水照料':'待浇水';note=raining?'自动补水':'等待田主照料';classes='is-growth is-thirsty';iconName='drop';}
          else{caption=durationText(growth.remainingMs);note=raining?'雨中自动补水':'后待田主浇水';classes='is-waiting is-neighbor-wait'+(caption.length>5?' has-long-time':'');iconName='clock';}
          labelContent(i,classes,caption,note,iconName,compact,active);
          const description=`第${i+1}块道友灵田，${NAMES[p.cropId]||'空田'}，${p.canSteal?'可偷采，可能触发守田阵法':caption+'，'+note}`;
          b.setAttribute('aria-label',description);b.setAttribute('aria-pressed',String(selected===i));b.title=description;
          continue;
        }
        const text=locked?'待开垦':!p.cropId?(sceneMode==='neighbor'?(compact?'空':'空灵田'):(compact?'+':'+ 播种')):visited?(compact?'已访':'已探访'):ripe?(sceneMode==='neighbor'?'可偷':'可采'):durationText(growth.remainingMs);
        let classes='',caption=text,note='',iconName='';
        if(locked){classes='is-locked is-sealed';caption='';iconName='lock';}
        else if(!p.cropId){classes='is-empty';caption=sceneMode==='neighbor'?'空田':'播种';iconName=sceneMode==='home'?'seed':'';}
        else if(visited){classes='is-visited';iconName='check';}
        else if(ripe){classes='is-ripe'+(ripeMark?' is-ripe-mark':'');caption=ripeMark?'':sceneMode==='neighbor'?'偷采':'收获';iconName=ripeMark?'spark':sceneMode==='neighbor'?'hand':'harvest';}
        else{classes='is-waiting is-neighbor-wait'+(caption.length>5?' has-long-time':'');note='后可收获';iconName='clock';}
        labelContent(i,classes,caption,note,iconName,compact,active);
        const emptyLabel=!locked&&!p.cropId?`第${i+1}块灵田，空田，点击播种`:'';
        const description=!locked&&p.cropId&&!visited&&!ripe?`${text}后可收获`:text;
        b.setAttribute('aria-label',emptyLabel||`第${i+1}块灵田，${p.cropId?(NAMES[p.cropId]||'灵草')+'，':''}${description}${locked?'，点击查看境界要求':''}`);
        b.setAttribute('aria-pressed',String(selected===i));
        b.title=emptyLabel||`第${i+1}块灵田${p.cropId?' · '+(NAMES[p.cropId]||'灵草'):''} · ${description}${locked?' · 点击查看境界要求':''}`;
      }
      positionLabels();
    }
    const projected=new T.Vector3();
    function getScreenPosition(index) {
      if(!plotPositions[index])return null;
      const locked=currentPlots[index]&&currentPlots[index].unlocked===false;
      projected.copy(plotPositions[index]);projected.y=locked?.46:.32;
      if(!locked){projected.x+=Math.sin(angle)*1.10;projected.z+=Math.cos(angle)*1.10;}
      main.localToWorld(projected);projected.project(camera);
      return {x:(projected.x*.5+.5)*width,y:(-.5*projected.y+.5)*height};
    }
    function positionLabels(){
      if(decorationEdit){positionDecorationLabels();return;}
      // Measure only after a label's layout changes, then place all labels together.
      // The padding keeps wider clocks and their small pointer inside the garden.
      for(let i=0;i<PLOT_COUNT;i++)if(labelParts[i].needsMeasure){
        const part=labelParts[i];part.width=labelNodes[i].offsetWidth||56;part.height=labelNodes[i].offsetHeight||36;part.needsMeasure=false;
      }
      const scale=width<450?Math.min(1,zoom):1,bottomInset=fullscreenFieldOverview()?fullscreenFieldInsets().labelBottom:width<450||height<420?52:7;
      for(let i=0;i<PLOT_COUNT;i++){
        const p=getScreenPosition(i),b=labelNodes[i],part=labelParts[i];
        const halfWidth=part.width*scale/2+5,halfHeight=part.height*scale/2;
        b.style.left=Math.max(halfWidth,Math.min(width-halfWidth,p.x))+'px';b.style.top=Math.max(halfHeight+7,Math.min(height-halfHeight-bottomInset,p.y))+'px';
        b.style.visibility=p.x<0||p.x>width||p.y<0||p.y>height||(inspectedPlot!==null&&i!==inspectedPlot)?'hidden':'visible';
      }
      for(const [node,index] of actionNodes){const p=getScreenPosition(index);node.style.left=p.x+'px';node.style.top=(p.y-19)+'px';}
    }
    function playActionNotice(kind,index,preview=false){
      if(!Number.isInteger(index)||!plotPositions[index]||disposed)return;
      const point=getScreenPosition(index),tone=kind==='water'?'#8ccbb5':kind==='clear'?'#bca27c':kind==='unlock'?'#bfcc93':'#e6cb86';
      const word=preview?'':{plant:'灵种入土',water:'灵泉浇灌',clear:'枯草已清',unlock:'灵田初辟',harvest:''}[kind];
      if(word===undefined)return;
      const ring=document.createElement('div');ring.className='spirit-action-ripple';ring.dataset.action=kind;ring.setAttribute('aria-hidden','true');
      ring.style.cssText=`position:absolute;left:${point.x}px;top:${point.y-19}px;--action-tone:${tone};`;
      if(word){const label=document.createElement('span'),text=document.createElement('span');label.className='spirit-action-note';text.textContent=word;label.appendChild(fieldIcon(kind==='water'?'drop':kind==='clear'?'hoe':kind==='plant'?'seed':'leaf').svg);label.appendChild(text);ring.appendChild(label);}
      if(kind==='clear'&&!reduced&&!toolAnimator?.active)for(let k=0;k<6;k++){
        const fleck=document.createElement('i'),a=k*Math.PI/3;
        fleck.style.cssText=`position:absolute;left:50%;top:50%;width:${k%2?4:6}px;height:3px;border-radius:2px;background:${k%2?'#a48d65':'#78634c'};`;
        ring.appendChild(fleck);
        if(fleck.animate)fleck.animate([{transform:'translate(-50%,-50%)',opacity:1},{transform:`translate(${Math.cos(a)*(20+k*2)}px,${Math.sin(a)*15-18}px) rotate(${k*71}deg)`,opacity:0}],{duration:700,easing:'ease-out',fill:'forwards'});
      }
      if(kind==='plant'&&preview&&!reduced)for(let k=0;k<5;k++){
        const seed=document.createElement('i');seed.className='spirit-seed-fleck';ring.appendChild(seed);
        if(seed.animate)seed.animate([{transform:`translate(${(k-2)*5}px,${-24-k%3*7}px) rotate(${k*37}deg)`,opacity:0},{opacity:1,offset:.2},{transform:`translate(${(k-2)*7}px,6px) rotate(${k*61}deg)`,opacity:0}],{duration:440,delay:k*12,easing:'ease-in',fill:'forwards'});
      }
      container.appendChild(ring);actionNodes.set(ring,index);
      if(!reduced&&ring.animate)ring.animate([{transform:'translate(-50%,-50%) scale(.55)',opacity:0},{transform:'translate(-50%,-60%) scale(1)',opacity:1,offset:.22},{transform:'translate(-50%,-78%) scale(1.6)',opacity:0}],{duration:preview?500:1050,easing:'ease-out',fill:'forwards'});
      const timer=setTimeout(()=>{ring.remove();actionNodes.delete(ring);actionTimers.delete(timer);},preview?550:reduced?700:1100);actionTimers.add(timer);
    }
    function beginFarmAction(kind,indices,timing={}){
      if(disposed||sceneMode!=='home')return;
      clearActions();farmPreview={kind};
      if((kind==='water'||kind==='clear')&&toolAnimator){
        const level=currentState.tools?.[kind==='water'?'wateringCan':'hoe']||1;
        if(toolAnimator.playBatch(kind,indices,level,{duration:timing.duration})){
          container.dataset.toolAction=kind;toolAnimator.update(performance.now());renderer.invalidate?.();scheduleFrame();return;
        }
      }
      indices.forEach(index=>playActionNotice(kind,index,true));
    }
    function playActionBatch(kind,items){
      if(disposed)return;
      const indices=[...new Set((items||[]).map(item=>typeof item==='number'?item:item?.index))].filter(index=>Number.isInteger(index)&&plotPositions[index]);
      if(!indices.length)return;
      if((kind==='water'||kind==='clear')&&toolAnimator){
        const level=currentState.tools?.[kind==='water'?'wateringCan':'hoe']||1;
        if(toolAnimator.playBatch(kind,indices,level)){
          container.dataset.toolAction=kind;renderer.invalidate?.();scheduleFrame();
        }else indices.forEach(index=>playActionNotice(kind,index));
      }else indices.forEach(index=>playActionNotice(kind,index));
    }
    function playAction(kind,index){playActionBatch(kind,[index]);}
    let lastHighlightSignature='';
    function refreshHighlight(){
      if(decorationEdit){for(const item of plotHighlights)item.visible=false;lastHighlightSignature='decoration';return;}
      const anchor=hover!==null?hover:selected;
      const candidates=sceneMode==='home'&&anchor!==null?options.getToolTargets?.(anchor):null;
      const targets=new Set(Array.isArray(candidates)?candidates.filter(i=>Number.isInteger(i)&&i>=0&&i<PLOT_COUNT):[]);
      const signature=[selected,hover,sceneMode,Array.from(targets).join(',')].join(':');if(signature===lastHighlightSignature)return;lastHighlightSignature=signature;
      for(let i=0;i<PLOT_COUNT;i++){
        const primary=i===selected||i===hover,nearby=targets.has(i)&&!primary;
        plotHighlights[i].visible=primary||nearby;
        plotHighlights[i].material.color.setHex(i===selected?0xffdc8d:i===hover?0xffefd1:0xa8d9b9);
        plotHighlights[i].material.opacity=nearby?.72:.98;
        labelNodes[i].dataset.highlight=i===selected?'selected':i===hover?'hover':nearby?'nearby':'';
      }
      if(renderer.invalidate)renderer.invalidate();
    }
    function setHover(index){if(decorationEdit)index=null;if(hover===index)return;hover=index;refreshHighlight();refreshLabels(true);renderer.domElement.style.cursor=decorationEdit?'crosshair':hover===null?'grab':'pointer';if(options.onHover)options.onHover(index);}
    function fullscreenFieldOverview(){return fullscreenView&&inspectedPlot===null&&!decorationEdit&&(window.document?.body?.classList?.contains('game-app')||(height<=520&&width/height>1.4));}
    function fullscreenFieldInsets(){
      // The app canvas extends behind the HUD. Its safe frame is intentionally
      // asymmetric so the right rail and bottom actions never cover the beds.
      if(!window.document?.body?.classList?.contains('game-app'))return {left:20,right:20,top:14,bottom:20,labelBottom:10};
      return height<=520&&width>height
        ? {left:12,right:75,top:76,bottom:82,labelBottom:82}
        : {left:18,right:90,top:100,bottom:110,labelBottom:110};
    }
    const residenceFrameCache=new WeakMap();
    function grandResidenceFrame(){
      if(inspectedPlot!==null||decorationEdit||typeof residenceDecor==='undefined')return null;
      const house=residenceDecor?.getFramingModel?.();
      if(!house||!['moonResidence','starResidence'].includes(house.userData.homesteadId))return null;
      house.updateWorldMatrix(true,true);
      let cached=residenceFrameCache.get(house);
      if(!cached||cached.matrix.some((value,i)=>value!==house.matrixWorld.elements[i])){
        // The real roof silhouette is much smaller than the empty upper corners
        // of a tall bounding box. Cache its vertices once, including winter caps,
        // so fitting the grand houses preserves as much useful field size as possible.
        const points=[],point=new T.Vector3();
        house.traverse(item=>{
          const positions=item.isMesh&&item.geometry?.attributes.position;if(!positions)return;
          for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(item.matrixWorld);points.push(point.x,point.y,point.z);}
        });
        cached={points:new Float32Array(points),matrix:house.matrixWorld.elements.slice()};residenceFrameCache.set(house,cached);
      }
      const ca=Math.cos(angle),sa=Math.sin(angle),ce=Math.cos(elevation),se=Math.sin(elevation),points=cached.points;
      let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
      for(let i=0;i<points.length;i+=3){
        const x=points[i]-DEFAULT_CAMERA.x,y=points[i+1]-DEFAULT_CAMERA.y,z=points[i+2]-DEFAULT_CAMERA.z;
        const u=x*ca-z*sa,v=y*ce-(x*sa+z*ca)*se;
        minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);
      }
      return Number.isFinite(minU)?{minU,maxU,minV,maxV}:null;
    }
    function updateCamera(){
      const aspect=width/height,grandFrame=grandResidenceFrame();
      if(fullscreenFieldOverview()){
        // Full-frame app views (and the older short fullscreen canvas) fit the
        // actual beds and tallest crop envelope below their overlaid controls.
        // Frame against the fixed opening origin: using the current target
        // here would cancel a player's pan without changing the stored pose.
        const ca=Math.cos(angle),sa=Math.sin(angle),ce=Math.cos(elevation),se=Math.sin(elevation),appHUD=!!window.document?.body?.classList?.contains('game-app');
        let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
        for(const point of plotPositions)for(const dx of [-1.11,1.11])for(const dz of [-1.11,1.11])for(const y of [appHUD ? .21 : .39,3.7]){
          const x=point.x+dx-DEFAULT_CAMERA.x,z=point.z+dz-DEFAULT_CAMERA.z;
          const u=x*ca-z*sa,v=(y-DEFAULT_CAMERA.y)*ce-(x*sa+z*ca)*se;
          minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v);
        }
        const inset=fullscreenFieldInsets();
        // Larger canvases keep the ordinary overview's scale as a lower bound:
        // recenter the playable field without suddenly magnifying its scenery.
        let contextUnit=0;
        if(appHUD&&!(height<=520&&width>height)){
          const span=aspect<1.05?9.8/aspect:Math.max(8.2,Math.min(9.3,14.8/aspect));
          const headroom=Math.max(aspect<1.05?.8:3.3,17.3-span),halfWidth=(span+headroom*.5)*aspect;
          const sidePadding=width<=760&&aspect<1.05?Math.max(0,11.9-halfWidth):0;
          contextUnit=(span*2+headroom+sidePadding*2/aspect)/height;
        }
        let unit=Math.max(contextUnit,(maxU-minU)/Math.max(1,width-inset.left-inset.right),(maxV-minV)/Math.max(1,height-inset.top-inset.bottom));
        let centerU=(minU+maxU)*.5+(inset.right-inset.left)*.5*unit,centerV=(minV+maxV)*.5+(inset.top-inset.bottom)*.5*unit;
        if(grandFrame){
          // Keep the farming HUD's existing safe area. Architecture may use the
          // sky above that area on a short phone, while larger screens leave its
          // complete roof below the title card. Both constraints share one
          // undistorted projection and never rewrite the player's saved pose.
          const shortPhone=height<=520&&width>height;
          const frames=[{minU,maxU,minV,maxV,inset},{...grandFrame,inset:{left:12,right:18,top:shortPhone?12:86,bottom:20}}];
          for(const a of frames)for(const b of frames){
            unit=Math.max(unit,(a.maxU-b.minU)/Math.max(1,width-a.inset.right-b.inset.left),(a.maxV-b.minV)/Math.max(1,height-a.inset.top-b.inset.bottom));
          }
          const lowU=Math.max(...frames.map(frame=>frame.maxU-(width*.5-frame.inset.right)*unit)),highU=Math.min(...frames.map(frame=>frame.minU+(width*.5-frame.inset.left)*unit));
          const lowV=Math.max(...frames.map(frame=>frame.maxV-(height*.5-frame.inset.top)*unit)),highV=Math.min(...frames.map(frame=>frame.minV+(height*.5-frame.inset.bottom)*unit));
          centerU=Math.max(lowU,Math.min(highU,(minU+maxU)*.5+(inset.right-inset.left)*.5*unit));
          centerV=Math.max(lowV,Math.min(highV,(minV+maxV)*.5+(inset.top-inset.bottom)*.5*unit));
          if(shortPhone){
            // The low sky can sit beside the centered weather card. Use the
            // spare horizontal room first, keeping every bed within its original
            // safe bounds instead of hiding the new upper storeys behind the HUD.
            const titleHalfWidth=width<=760?110:132;
            centerU=Math.max(lowU,Math.min(centerU,grandFrame.minU-(titleHalfWidth+12)*unit));
          }
        }
        camera.left=(centerU-width*unit*.5)/zoom;camera.right=(centerU+width*unit*.5)/zoom;
        camera.top=(centerV+height*unit*.5)/zoom;camera.bottom=(centerV-height*unit*.5)/zoom;
      }else{
        const fittedSpan=aspect<1.05?(inspectedPlot===null?9.8:9.2)/aspect:Math.min(9.3,14.8/aspect);
        // A wider, shorter garden still needs vertical room for the front row and its labels.
        const span=inspectedPlot===null&&aspect>=1.05?Math.max(8.2,fittedSpan):fittedSpan;
        // Add sky above the overview for the floating residence. Preserve all six
        // saved camera values, including angle/target/zoom; close crop inspection
        // keeps its previous framing. Very tall phone canvases need a little
        // extra width for the entire floating court and its curved stair. Shift
        // the framing toward the residence, rather than changing the saved pose.
        const headroom=inspectedPlot===null?Math.max(aspect<1.05?.8:3.3,17.3-span,grandFrame?grandFrame.maxV+1.1-span:0):0;
        const halfWidth=(span+headroom*.5)*aspect,portraitOverview=inspectedPlot===null&&width<=760&&aspect<1.05;
        const sidePadding=portraitOverview?Math.max(0,11.9-halfWidth):0,verticalPadding=sidePadding/aspect;
        const residenceSide=(residenceSite.x-target.x)*Math.cos(angle)-(residenceSite.z-target.z)*Math.sin(angle);
        const sideShift=portraitOverview?Math.max(-1.7,Math.min(1.7,residenceSide*.32)):0;
        camera.left=(-halfWidth-sidePadding+sideShift)/zoom;camera.right=(halfWidth+sidePadding+sideShift)/zoom;
        camera.top=(span+headroom+verticalPadding)/zoom;camera.bottom=(-span-verticalPadding)/zoom;
      }
      const r=38*Math.cos(elevation);camera.position.set(Math.sin(angle)*r+target.x,38*Math.sin(elevation)+target.y,Math.cos(angle)*r+target.z);camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();positionLabels();
      if(renderer.invalidate)renderer.invalidate();
      scheduleFrame();
    }
    function resize(){
      const wasMobile=mobileRendering;mobileRendering=mobileScreen();
      width=Math.max(1,container.clientWidth);height=Math.max(1,container.clientHeight);
      const nextPixelRatio=Math.min(window.devicePixelRatio||1,mobileRendering?1.25:1.6);
      if(nextPixelRatio!==renderPixelRatio){renderPixelRatio=nextPixelRatio;renderer.setPixelRatio(renderPixelRatio);}
      if(wasMobile!==mobileRendering)for(let i=0;i<PLOT_COUNT;i++)buildPlant(i,currentPlots[i]||{unlocked:false});
      inspectionBack.style.minHeight=mobileRendering?'44px':'30px';
      pointerControls?.refreshMode();
      for(const part of labelParts)part.needsMeasure=true;
      renderer.setSize(width,height,false);matureEffects?.resize();weatherEffects?.resize();updateCamera();refreshLabels(true);
      // Canvas resizing clears its pixels. Paint a visible scene immediately;
      // a covered scene keeps its new geometry and paints on its first resumed
      // frame. Neither path advances cultivation time.
      if(canRender()&&container.clientWidth>0&&container.clientHeight>0){
        renderer.render(scene,camera);matureEffects?.render();weatherEffects?.render();
      }
    }
    let resizeObserver;
    if(window.ResizeObserver){resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);}else window.addEventListener('resize',resize);
    const raycaster=new T.Raycaster(),pointer=new T.Vector2();
    function pick(event){const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-((event.clientY-r.top)/r.height)*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(plotMeshes,false);return hits.length?hits[0].object.userData.plotIndex:null;}
    function decorationRay(event){
      if(!event||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return false;
      const r=renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return false;
      pointer.set((event.clientX-r.left)/r.width*2-1,-((event.clientY-r.top)/r.height)*2+1);
      raycaster.setFromCamera(pointer,camera);main.updateMatrixWorld(true);return true;
    }
    const decorationGround=new T.Plane(new T.Vector3(0,1,0),-(window.SpiritGame?.DECOR_LAYOUT_RULES?.groundY??.24));
    function decorationGroundPoint(event){
      if(!decorationRay(event))return null;
      const point=raycaster.ray.intersectPlane(decorationGround,new T.Vector3());
      if(!point)return null;main.worldToLocal(point);
      return Math.abs(point.x)<=24&&Math.abs(point.z)<=24?point:null;
    }
    function pickDecoration(event){
      if(!decorationEdit)return null;
      const labelId=event.target?.closest?.('.spirit-decor-marker')?.dataset.decorationId;
      if(labelId&&decorationEdit.layout.some(entry=>entry.id===labelId))return labelId;
      if(!decorationRay(event))return null;
      const hit=courtyardDecor?.pick?.(raycaster);if(hit)return hit;
      const point=decorationGroundPoint(event);if(!point)return null;
      // The footprint also selects an open gate or thin fence on a small screen.
      for(const entry of [...decorationEdit.layout].reverse()){
        const size=window.SpiritGame?.DECOR_LAYOUT_RULES?.footprints?.[entry.id];if(!size)continue;
        const a=entry.rotation*Math.PI/180,dx=point.x-entry.x,dz=point.z-entry.z;
        if(Math.abs(dx*Math.cos(a)-dz*Math.sin(a))<=size.width/2+.10&&Math.abs(dx*Math.sin(a)+dz*Math.cos(a))<=size.depth/2+.10)return entry.id;
      }
      return null;
    }
    function chooseDecoration(id){if(decorationEdit&&id)decorationEdit.onSelect?.(id);}
    const snapDecoration=value=>Math.round(value/(window.SpiritGame?.DECOR_LAYOUT_RULES?.grid||.25))*(window.SpiritGame?.DECOR_LAYOUT_RULES?.grid||.25);
    function placeDecoration(event){
      if(!decorationEdit)return;
      const point=decorationGroundPoint(event),entry=decorationEdit.layout.find(item=>item.id===decorationEdit.selectedId);
      if(!point||!entry)return;
      decorationEdit.onGestureStart?.();
      decorationEdit.onMove?.({...entry,x:snapDecoration(point.x),z:snapDecoration(point.z)});
      decorationEdit?.onGestureEnd?.({cancelled:false});
    }
    function dragDecoration(phase,event,id){
      if(!decorationEdit)return;
      if(phase==='start'){
        const point=decorationGroundPoint(event),entry=decorationEdit.layout.find(item=>item.id===id);
        if(!point||!entry)return;
        decorationDrag={id,start:{x:point.x,z:point.z},origin:{x:entry.x,z:entry.z}};
        decorationEdit.onGestureStart?.();return;
      }
      if(!decorationDrag||decorationDrag.id!==id)return;
      if(phase==='move'){
        const point=decorationGroundPoint(event),entry=decorationEdit.layout.find(item=>item.id===id);
        if(point&&entry)decorationEdit.onMove?.({...entry,x:snapDecoration(decorationDrag.origin.x+point.x-decorationDrag.start.x),z:snapDecoration(decorationDrag.origin.z+point.z-decorationDrag.start.z)});
      }else if(phase==='cancel'||phase==='end'){
        decorationDrag=null;decorationEdit.onGestureEnd?.({cancelled:phase==='cancel'});
      }
    }
    function positionDecorationLabels(){
      if(!decorationEdit)return;
      const active=decorationEdit.layout.find(entry=>entry.id===decorationEdit.selectedId),size=window.SpiritGame?.DECOR_LAYOUT_RULES?.footprints?.[active?.id];
      decorationFootprint.setAttribute('viewBox',`0 0 ${width} ${height}`);
      decorationFootprint.classList.toggle('is-invalid',decorationEdit.valid===false);
      decorationFootprint.style.display=active&&size?'block':'none';
      if(active&&size){
        const a=active.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),y=(window.SpiritGame.DECOR_LAYOUT_RULES.groundY||.24)+.04;
        const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>{
          const dx=x*size.width/2,dz=z*size.depth/2,point=new T.Vector3(active.x+dx*c+dz*s,y,active.z-dx*s+dz*c);
          main.localToWorld(point);point.project(camera);return `${(point.x*.5+.5)*width},${(-point.y*.5+.5)*height}`;
        });
        decorationPolygon.setAttribute('points',corners.join(' '));
      }
      for(const entry of decorationEdit.layout){
        let button=decorationLabelNodes.get(entry.id);
        if(!button){
          button=document.createElement('button');button.type='button';button.className='spirit-decor-marker';button.dataset.decorationId=entry.id;
          button.addEventListener('click',event=>{event.stopPropagation();chooseDecoration(entry.id);});
          decorationLabels.appendChild(button);decorationLabelNodes.set(entry.id,button);
        }
        const stageId={sectGate:'gate',sectSpring:'spring',sectLibrary:'library'}[entry.id];
        const theme=currentView.decorationThemes?.[entry.id];
        const themedName=window.SpiritSects?.map?.[theme]?.stages?.find(stage=>stage.id===stageId)?.name;
        const definition=window.SpiritGame?.DECORATIONS?.find(item=>item.id===entry.id);
        const name=themedName||(definition?.repeatable?`${definition.name} · 第 ${definition.copyIndex} 棵`:definition?.name)||'庭院装饰';
        button.textContent=definition?.repeatable?`${definition.name}\n第 ${definition.copyIndex} 棵`:name;button.setAttribute('aria-label',`选择${name}并调整位置`);button.setAttribute('aria-pressed',String(entry.id===decorationEdit.selectedId));
        button.classList.toggle('is-tree',!!definition?.repeatable);
        button.classList.toggle('is-invalid',entry.id===decorationEdit.selectedId&&decorationEdit.valid===false);
        const point=courtyardDecor?.getAnchor?.(entry.id);if(!point){button.hidden=true;continue;}
        main.localToWorld(point);point.project(camera);
        const x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;
        button.style.left=Math.max(46,Math.min(width-46,x))+'px';button.style.top=Math.max(60,Math.min(height-64,y))+'px';
        button.hidden=point.z<-1||point.z>1||x<-80||x>width+80||y<-80||y>height+80;
      }
      for(const [id,button] of decorationLabelNodes)if(!decorationEdit.layout.some(entry=>entry.id===id)){button.remove();decorationLabelNodes.delete(id);}
    }
    function frameDecorations(){
      if(!decorationEdit)return;
      target.set(0,1.1,.1);elevation=Math.max(.80,Math.min(.94,defaultCamera.elevation));zoom=.80;updateCamera();
    }
    function setDecorationEdit(value){
      if(disposed||!courtyardDecor)return false;
      if(value){
        if(!Array.isArray(value.layout))return false;
        const entering=!decorationEdit;
        if(entering){
          decorationEditCamera={angle,elevation,zoom,x:target.x,y:target.y,z:target.z,inspectedPlot};
          const previous=inspectedPlot;inspectedPlot=null;inspection.hidden=true;inspection.style.display='none';
          if(previous!==null)buildPlant(previous,currentPlots[previous]||{unlocked:false});
          clearActions();hover=null;
        }
        decorationEdit={...value,layout:value.layout.map(entry=>({...entry}))};
        courtyardDecor.set(decorationEdit.layout.map(entry=>entry.id),decorationEdit.layout,currentView.decorationThemes||{});courtyardDecor.setEditor(decorationEdit);refreshHomesteadLamps();
        labels.hidden=true;decorationLabels.hidden=false;container.classList.add('is-decorating');
        pointerControls?.setDecorationMode(true);refreshHighlight();
        if(entering)frameDecorations();else positionDecorationLabels();
      }else if(decorationEdit){
        pointerControls?.cancel();decorationEdit=null;decorationDrag=null;
        pointerControls?.setDecorationMode(false);labels.hidden=false;decorationLabels.hidden=true;container.classList.remove('is-decorating');
        courtyardDecor.setEditor(null);courtyardDecor.set(currentView.decorations||[],currentView.decorationLayout||[],currentView.decorationThemes||{});refreshHomesteadLamps();
        const saved=decorationEditCamera;decorationEditCamera=null;
        if(saved){
          angle=saved.angle;elevation=saved.elevation;zoom=saved.zoom;target.set(saved.x,saved.y,saved.z);
          if(saved.inspectedPlot!==null&&currentPlots[saved.inspectedPlot]?.cropId&&growthInfo(currentPlots[saved.inspectedPlot]).mature){
            inspectedPlot=saved.inspectedPlot;buildPlant(inspectedPlot,currentPlots[inspectedPlot]);inspection.hidden=false;inspection.style.display='flex';
          }else if(saved.inspectedPlot!==null){target.set(defaultCamera.x,defaultCamera.y,defaultCamera.z);zoom=defaultCamera.zoom;}
        }
        updateCamera();refreshLabels(true);refreshHighlight();
      }
      renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;scheduleFrame();return true;
    }
    function resetCamera(){
      const previous=inspectedPlot;inspectedPlot=null;target.set(defaultCamera.x,defaultCamera.y,defaultCamera.z);angle=defaultCamera.angle;elevation=defaultCamera.elevation;zoom=defaultCamera.zoom;
      inspection.hidden=true;inspection.style.display='none';
      if(previous!==null)buildPlant(previous,currentPlots[previous]||{unlocked:false});
      updateCamera();
    }
    function saveDefaultCamera(){
      if(decorationEdit)return {ok:false,persisted:false,message:'先完成洞天布置，再保存默认视角。'};
      if(inspectedPlot!==null)return {ok:false,persisted:false,message:'先返回全景，再保存默认视角。'};
      const wrappedAngle=((angle+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
      defaultCamera={angle:wrappedAngle,elevation,zoom,x:target.x,y:target.y,z:target.z};
      let persisted=false;
      try {window.localStorage.setItem(CAMERA_STORAGE_KEY,JSON.stringify({version:1,pose:defaultCamera}));persisted=true;}catch(_){}
      return {ok:true,persisted,message:persisted?'已保存当前角度、远近和位置为默认视角。':'已设为本次会话的默认视角；浏览器未允许保存，刷新后将恢复初始视角。'};
    }
    function inspectPlot(index){
      if(decorationEdit)return false;
      if(!Number.isInteger(index)||!currentPlots[index]?.cropId||!growthInfo(currentPlots[index]).mature)return false;
      const previous=inspectedPlot;inspectedPlot=index;selected=index;
      if(previous!==null&&previous!==index)buildPlant(previous,currentPlots[previous]||{unlocked:false});
      buildPlant(index,currentPlots[index]);target.copy(plotPositions[index]);target.y=1.14;elevation=.68;zoom=width/height>1.4?4.1:5.2;
      inspectionName.textContent=(NAMES[currentPlots[index].cropId]||'灵植')+' · 拖动环看';inspection.hidden=false;inspection.style.display='flex';
      updateCamera();refreshHighlight();return true;
    }
    function setZoom(value){if(Number.isFinite(value)){zoom=Math.max(.7,Math.min(inspectedPlot!==null?6:2.5,value));updateCamera();}return zoom;}
    function wheel(e){
      if(!Number.isFinite(e.deltaY)||e.deltaY===0)return;
      e.preventDefault();
      const unit=e.deltaMode===1?16:e.deltaMode===2?height:1;
      const delta=Math.max(-200,Math.min(200,e.deltaY*unit));
      setZoom(zoom*Math.exp(-delta*.0015));
    }
    const canvas=renderer.domElement;
    pointerControls=createScenePointerControls({
      container,canvas,pick,onPlotClick:options.onPlotClick,onHover:setHover,isMobile:()=>mobileRendering,
      pickDecoration,onDecorationSelect:chooseDecoration,onDecorationDrag:dragDecoration,onDecorationPlace:placeDecoration,
      getCamera:()=>({angle,elevation,zoom}),
      applyCamera(pose){angle=pose.angle;elevation=Math.min(1.15,Math.max(.55,pose.elevation));zoom=Math.max(.7,Math.min(inspectedPlot!==null?6:2.5,pose.zoom));updateCamera();}
    });
    container.addEventListener('wheel',wheel,{passive:false});
    function update(state,view){
      const previousView=currentView,previousPlot=inspectedPlot!==null?currentPlots[inspectedPlot]:null;
      currentState=state||{};currentView=view||{};const nextPlots=currentView.plots||currentState.plots||[];
      const changedDecor=courtyardDecor?.set(decorationEdit?decorationEdit.layout.map(entry=>entry.id):currentView.decorations||[],decorationEdit?decorationEdit.layout:currentView.decorationLayout||[],currentView.decorationThemes||{});
      const changedResidence=residenceDecor?.set(currentView.residenceId||null);
      const showResidence=!!residenceDecor&&!!window.SpiritHomestead?.getResidence(currentView.residenceId);
      const changedResidenceGround=residenceTerrace.visible!==showResidence;
      residenceTerrace.visible=showResidence;residenceCourt.visible=showResidence;residenceBridge.visible=showResidence;
      for(const cloud of clouds)if(cloud.residence)cloud.g.visible=showResidence;
      if(changedDecor||changedResidence||changedResidenceGround){refreshHomesteadLamps();renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;}
      if(changedResidence&&residenceDecor?.getFramingModel)updateCamera();
      // A cloud sync replaces the array during a multi-field animation. Only an
      // actual garden change cancels the tool; fresh saved state keeps it alive.
      if(currentView.kind!==previousView.kind||currentView.neighborId!==previousView.neighborId)clearActions();
      if(nextPlots!==currentPlots)hover=null;currentPlots=nextPlots;sceneMode=currentView.kind||sceneMode;selected=Number.isInteger(currentView.selectedPlot)?currentView.selectedPlot:null;
      if(inspectedPlot!==null){const next=currentPlots[inspectedPlot];if(selected!==inspectedPlot||currentView.kind!==previousView.kind||currentView.neighborId!==previousView.neighborId||!next?.cropId||next.cropId!==previousPlot?.cropId||!growthInfo(next).mature)resetCamera();}
      for(let i=0;i<PLOT_COUNT;i++)buildPlant(i,currentPlots[i]||{unlocked:false});refreshLabels(true);refreshHighlight();positionLabels();
      scheduleFrame();
    }
    function canRender(){return !disposed&&!document.hidden&&!renderingPaused&&!modalPaused&&inViewport;}
    function scheduleFrame(){if(canRender()&&!frame)frame=requestAnimationFrame(animate);}
    function refreshRenderingState(){
      matureWind?.resetTime?.();
      matureEffects?.resetTime?.();
      weatherEffects?.resetTime?.();
      if(!canRender()){
        if(frame)cancelAnimationFrame(frame);frame=0;pointerControls?.cancel();return;
      }
      lastRender=-Infinity;lastPlantTime=0;
      if(renderer.invalidate)renderer.invalidate();
      refreshLabels(true);scheduleFrame();
    }
    function onVisibilityChange(){refreshRenderingState();}
    function onPageHide(){renderingPaused=true;refreshRenderingState();}
    function onPageShow(){renderingPaused=false;refreshRenderingState();}
    function onWindowBlur(){pointerControls?.cancel();}
    let visibilityObserver;
    if(window.IntersectionObserver){
      visibilityObserver=new IntersectionObserver(entries=>{
        const entry=entries.find(item=>item.target===container);if(!entry)return;
        const visible=entry.isIntersecting&&entry.intersectionRatio>0;
        if(visible!==inViewport){inViewport=visible;refreshRenderingState();}
      },{threshold:0});
      visibilityObserver.observe(container);
    }
    document.addEventListener('visibilitychange',onVisibilityChange);
    window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',onPageShow);window.addEventListener('blur',onWindowBlur);
    function animate(time){
      frame=0;if(!canRender())return;scheduleFrame();
      // Mobile uses at most 30 fps; background/off-screen scenes have no queued frame.
      // Cultivation timestamps and game actions are independent of this visual loop.
      if(time-lastRender<(renderer.isSoftware?150:reduced?100:mobileRendering?1000/30:25))return;lastRender=time;
      if(toolAnimator?.update(time))renderer.invalidate?.();
      const t=time*.001;
      matureEffects?.update(t);
      weatherEffects?.update(t);
      if(!reduced&&matureWind?.update(t)&&renderer.isSoftware)renderer.invalidate();
      if(!reduced&&!renderer.isSoftware){
        particles.forEach(({p,base,phase,speed})=>{p.position.y=base.y+Math.sin(t*speed+phase)*.22;p.position.x=base.x+Math.sin(t*.17+phase)*.12;p.rotation.y=t*.5+phase;});
        clouds.forEach(({g,x,phase})=>{g.position.x=x+Math.sin(t*.12+phase)*.22;});
        satellites.forEach(({g,y,phase})=>{g.position.y=y+Math.sin(t*.3+phase)*.1;});
        spiritStones.forEach(({crystal,seal,y},i)=>{const rise=Math.sin(t*.65+i*1.4)*.08;crystal.position.y=y+rise;seal.position.y=y+.03+rise;});
        for(const g of plantGroups)for(const o of g.children)if(o.userData.sparkle){o.rotation.y=t*.8;o.scale.setScalar(.7+Math.sin(t*2+o.userData.phase)*.3);}
      }
      if(time-lastPlantTime>900){lastPlantTime=time;for(let i=0;i<PLOT_COUNT;i++)buildPlant(i,currentPlots[i]||{unlocked:false});refreshLabels();refreshHighlight();}
      renderer.render(scene,camera);
      matureEffects?.render();
      weatherEffects?.render();
    }
    resize();update({},{});scheduleFrame();
    return {
      supported:true,
      renderingMode:renderer.isSoftware?'canvas':'webgl',
      plotCount:PLOT_COUNT,
      update,
      setEnvironment,
      setWeatherEffectsEnabled,
      setStudyDecor(value){if(studyDecor?.set(value)){renderer.invalidate?.();renderer.shadowMap.needsUpdate=true;scheduleFrame();}},
      setDecorationEdit,
      frameDecorations,
      getDecorationStepVector(direction){
        const a=Math.round(angle/(Math.PI/4))*Math.PI/4,c=Math.round(Math.cos(a)),s=Math.round(Math.sin(a)),step=window.SpiritGame?.DECOR_LAYOUT_RULES?.grid||.25;
        const vector=direction==='up'?{x:-s,z:-c}:direction==='down'?{x:s,z:c}:direction==='left'?{x:-c,z:s}:{x:c,z:-s};
        return {x:vector.x*step,z:vector.z*step};
      },
      setMode(mode){if(sceneMode!==mode){hover=null;clearActions();}sceneMode=mode;refreshLabels(true);refreshHighlight();},
      focusPlot(index){selected=Number.isInteger(index)?index:null;if(inspectedPlot!==null&&selected!==inspectedPlot)resetCamera();refreshHighlight();refreshLabels(true);},
      inspectPlot,
      resetCamera,
      saveDefaultCamera,
      setZoom,
      zoomBy(delta){return setZoom(zoom+(Number.isFinite(delta)?delta:0));},
      getZoom(){return zoom;},
      setTouchMode(expanded){
        pointerControls.setTouchMode(expanded);
        const next=!!expanded;if(fullscreenView===next)return;
        fullscreenView=next;for(const part of labelParts)part.needsMeasure=true;updateCamera();
      },
      setModalPaused(paused){modalPaused=!!paused;refreshRenderingState();},
      resize,
      getScreenPosition,
      playAction,
      playActionBatch,
      beginFarmAction,
      endFarmAction(){if(farmPreview)clearActions();},
      destroy(){
        if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;clearActions();
        toolAnimator?.dispose();matureEffects?.dispose();matureWind?.dispose();weatherEffects?.dispose();courtyardDecor?.dispose();residenceDecor?.dispose();studyDecor?.dispose();homesteadLanterns.length=0;
        if(resizeObserver)resizeObserver.disconnect();else window.removeEventListener('resize',resize);
        visibilityObserver?.disconnect();pointerControls.destroy();container.removeEventListener('wheel',wheel);
        document.removeEventListener('visibilitychange',onVisibilityChange);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',onPageShow);window.removeEventListener('blur',onWindowBlur);
        const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});sharedHarvestGeometries.forEach(g=>geometries.add(g));sharedHarvestGeometries.clear();Object.values(mats).forEach(m=>materials.add(m));cropNightMaterials.forEach(m=>materials.add(m));cropNightMaterials.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());shadowTexture.dispose();renderer.dispose();canvas.remove();labels.remove();decorationLabels.remove();inspection.remove();distance.remove();nearMist.remove();
      }
    };
  };
})();
