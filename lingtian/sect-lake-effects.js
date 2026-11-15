/* One water renderer for WebGL and software scenes: continuous moving wave
 * normals, view-dependent sky/light, and a warped mirror of the real shore.
 * Geometry/shore data stay cached; animation touches a bounded pixel field.
 * Scenic fish use real Three meshes and never change gameplay or rewards. */
(function (global) {
  'use strict';
  const TAU=Math.PI*2, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const random=i=>{const n=Math.sin(i*91.73+17.39)*43758.5453;return n-Math.floor(n);};
  function insidePolygon(x,z,outline){
    let inside=false;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
      const a=outline[i],b=outline[j];
      if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function shoreDistance(x,z,outline){
    let distance=Infinity;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
      const a=outline[j],b=outline[i],dx=b[0]-a[0],dz=b[1]-a[1];
      const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);
      distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
    }
    return distance;
  }
  const reflectY=(y,plane)=>plane*2-y;
  const jumpTiming=Object.freeze({first:1.1,duration:1.24,height:1.14,ripples:2.85,period:20,offsets:Object.freeze([0,4.4,9.6,14.4]),intervals:Object.freeze([4.4,5.2,4.8,5.6])});
  const swimmers=Array.from({length:9},(_,i)=>{
    const rx=1.65+random(i*13+5)*.65,rz=.9+random(i*13+6)*.5;
    return {rx,rz,radius:Math.hypot(rx*1.16,rz*1.13),rate:.6+random(i*13+7)*.26,offset:random(i*13+8)*TAU,angle:random(i*13+9)*TAU,scale:.84+random(i*13+10)*.34,depth:.39+random(i*13+11)*.19};
  });
  function fishMotion(t){
    const {first,duration,height,ripples,period,offsets,intervals}=jumpTiming,time=Number.isFinite(t)?Math.max(0,t):0;
    if(time<first)return {cycle:-1,phase:0,jumping:false,progress:0,height:0,rippleAge:-1,nextJumpIn:first-time,interval:intervals[0]};
    const lap=Math.floor((time-first+1e-9)/period),local=Math.max(0,time-first-lap*period);
    let index=offsets.length-1;while(index>0&&local+1e-9<offsets[index])index--;
    const phase=Math.max(0,local-offsets[index]),jumping=phase<duration;
    return {cycle:lap*offsets.length+index,phase,jumping,progress:clamp(phase/duration,0,1),height:jumping?Math.sin(phase/duration*Math.PI)*height:0,
      rippleAge:phase>=duration&&phase<duration+ripples?phase-duration:-1,nextJumpIn:intervals[index]-phase,interval:intervals[index]};
  }
  function swimMotion(t,index,range=1){
    const profile=swimmers[index%swimmers.length],time=t/range,offset=profile.offset;
    // Independent, gently accelerating meanders. The two path axes have
    // different frequencies, so the school never turns in synchronized circles.
    const phase=time*profile.rate+offset+.23*Math.sin(time*.9+offset)+.12*Math.sin(time*.41+offset*.7);
    const rate=(profile.rate+.207*Math.cos(time*.9+offset)+.0492*Math.cos(time*.41+offset*.7))/range;
    const x=profile.rx*(Math.sin(phase)+.16*Math.sin(phase*2+.6))*range,z=profile.rz*(Math.cos(phase*.81+.55)+.13*Math.sin(phase*1.73))*range;
    const vx=profile.rx*(Math.cos(phase)+.32*Math.cos(phase*2+.6))*range*rate,vz=profile.rz*(-.81*Math.sin(phase*.81+.55)+.2249*Math.cos(phase*1.73))*range*rate;
    const c=Math.cos(profile.angle),s=Math.sin(profile.angle),dx=x*c-z*s,dz=x*s+z*c,dxdt=vx*c-vz*s,dzdt=vx*s+vz*c;
    return {x:dx,z:dz,heading:Math.atan2(dzdt,dxdt),speed:Math.hypot(dxdt,dzdt),scale:profile.scale,depth:profile.depth,
      pitch:Math.sin(phase*.7)*.045,tailPhase:t*(7.1+index*.31)+Math.sin(time*.9+offset)*.7+offset,tailStrength:clamp(.82+Math.hypot(vx,vz)*.24,.9,1.35)};
  }
  global.SpiritSectLakeMath=Object.freeze({insidePolygon,shoreDistance,reflectY,fishMotion,swimMotion,jumpTiming});
  global.createSpiritSectLakeEffects=function({THREE:T,container,camera,lake,landscapeRoot,reducedMotion=false,software=false}={}){
    if(!T||!container||!camera||!lake||!Array.isArray(lake.outline)||lake.outline.length<3||!Number.isFinite(lake.surfaceY))return null;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    const mask=document.createElement('canvas'),maskCtx=mask.getContext('2d',{willReadFrequently:true});
    const reflection=document.createElement('canvas'),mirrorCtx=reflection.getContext('2d');
    const waterColor=document.createElement('canvas'),colorCtx=waterColor.getContext('2d');
    const surface=document.createElement('canvas'),surfaceCtx=surface.getContext('2d');
    if(!ctx||!maskCtx||!mirrorCtx||!colorCtx||!surfaceCtx)return null;
    canvas.className='sect-lake-effects';canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';
    container.appendChild(canvas);
    const outline=lake.outline.map(p=>[p[0],p[1]]),waterY=lake.surfaceY+.008;
    const bounds=lake.bounds||{minX:Math.min(...outline.map(p=>p[0])),maxX:Math.max(...outline.map(p=>p[0])),minZ:Math.min(...outline.map(p=>p[1])),maxZ:Math.max(...outline.map(p=>p[1]))};
    const point=new T.Vector3(),matrix=new T.Matrix4(),world=new T.Vector3();
    let width=1,height=1,ratio=1,mobile=false,visible=true,destroyed=false,raf=0,first=true,dirty=true;
    let previousStamp=null,last=-Infinity,elapsed=0,daylight=0,phaseId='night',renderedFrames=0,cacheBuilds=0,reflectedTriangles=0,maskTriangles=0;
    let weather={weatherId:'clear',windStrength:.22,windDirection:.6,cloudAmount:.35};
    let waterBox={left:0,top:0,right:1,bottom:1},maskPixels=null;
    let waterField=null,waveBasis=null,basisDirection=NaN,meanFresnel=0,fishModels=null,fishAgents=null,jumpSpot=null,lastJumpCycle=-1,fishJumps=0;
    const fishLimit=()=>mobile||software||(width<960&&height<480)?6:9;
    const freshStats=()=>({drawCalls:0,waveStrokes:0,glints:0,surfacePixels:0,normalLayers:4,reflectionStrips:0,fishTriangles:0,swimmingFish:0,jumpingFish:0,fishSpecies:[],fishSchool:[],fishState:'idle',fishEventIndex:-1,nextFishJump:jumpTiming.first,fishJump:null,splashElements:0});
    let frameStats=freshStats();
    const project=(x,y,z)=>{point.set(x,y,z).project(camera);return{x:(point.x*.5+.5)*width,y:(.5-point.y*.5)*height,z:point.z};};
    const inView=(q,p=10)=>q.z>-1&&q.z<1&&q.x>=-p&&q.x<width+p&&q.y>=-p&&q.y<height+p;
    const worldAt=(x,z)=>project(x,waterY,z);
    const lakePoints=[];
    // Well-spaced candidate positions are used only for fish, never as a
    // substitute for the continuous water surface.
    for(let i=0;i<1800&&lakePoints.length<148;i++){
      const x=bounds.minX+random(i*3+31)*(bounds.maxX-bounds.minX),z=bounds.minZ+random(i*3+32)*(bounds.maxZ-bounds.minZ);
      if(insidePolygon(x,z,outline)&&shoreDistance(x,z,outline)>.55&&lakePoints.every(p=>Math.hypot(x-p.x,z-p.z)>.65))lakePoints.push({x,z,seed:i});
    }
    const fishSpots=lakePoints.filter(p=>p.z>(lake.center?.[2]||15)-4&&shoreDistance(p.x,p.z,outline)>3.5);
    function path(context,points){context.beginPath();points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();}
    function paint(){ctx.fill();frameStats.drawCalls++;}
    function stroke(){ctx.stroke();frameStats.drawCalls++;}
    function colorAt(material,colors,a,b,c){
      const color=material?.color;
      let r=color?.r??.6,g=color?.g??.65,bl=color?.b??.65;
      if(material?.vertexColors&&colors){r*= (colors.getX(a)+colors.getX(b)+colors.getX(c))/3;g*= (colors.getY(a)+colors.getY(b)+colors.getY(c))/3;bl*= (colors.getZ(a)+colors.getZ(b)+colors.getZ(c))/3;}
      const shade=.48+daylight*.46,toSRGB=value=>value<=.0031308?value*12.92:1.055*Math.pow(value,1/2.4)-.055;
      return `rgb(${Math.round(clamp(toSRGB(r)*shade*.86+.025,0,1)*255)},${Math.round(clamp(toSRGB(g)*shade*.94+.045,0,1)*255)},${Math.round(clamp(toSRGB(bl)*shade+.055,0,1)*255)})`;
    }
    function meshesFrom(roots){
      const result=[],seen=new Set();
      for(const root of roots||[]){
        if(!root)continue;
        (function visit(object,shown){
          if(!shown||object.visible===false||seen.has(object))return;
          seen.add(object);
          if(object.isMesh&&object.geometry?.attributes?.position&&!object.userData?.isLakeSurface&&!object.userData?.isWaterSurface)result.push(object);
          for(const child of object.children||[])visit(child,true);
        })(root,true);
      }
      return result;
    }
    // Clip a solid face at the water plane before subtracting its silhouette.
    // In an above-water orthographic view every retained point is in front of
    // the water, including after orbiting the camera to the other bank.
    function aboveWater(vertices){
      const clipped=[];
      for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
        const a=vertices[j],b=vertices[i],ai=a.y>waterY+.015,bi=b.y>waterY+.015;
        if(ai!==bi){const f=(waterY+.015-a.y)/(b.y-a.y);clipped.push({x:a.x+(b.x-a.x)*f,y:waterY+.015,z:a.z+(b.z-a.z)*f});}
        if(bi)clipped.push(b);
      }
      return clipped;
    }
    function cacheWaterColor(){
      // Invert the actual projected plane once. Cache world position, optical
      // depth, view and half-light vectors; no polygon tests run per frame.
      const origin=worldAt(0,0),xp=worldAt(1,0),zp=worldAt(0,1);
      const ax=xp.x-origin.x,ay=xp.y-origin.y,bx=zp.x-origin.x,by=zp.y-origin.y,det=ax*by-ay*bx;
      if(Math.abs(det)<.00001)return;
      const w=waterColor.width,h=waterColor.height,pixels=colorCtx.createImageData(w,h),data=pixels.data,entries=[];
      const smooth=(a,b,v)=>{const n=clamp((v-a)/(b-a),0,1);return n*n*(3-2*n);};
      const day=[[151,192,173],[71,146,153],[30,100,128]],night=[[51,82,93],[28,63,84],[17,40,62]];
      const palette=day.map((p,i)=>p.map((v,c)=>night[i][c]+(v-night[i][c])*daylight));
      const eye=new T.Vector3();camera.getWorldPosition(eye);meanFresnel=0;
      // Place the sky light relative to the lake's actual basin. The former
      // minZ - 24 placement reflected into the raised peninsula of this U-shaped
      // lake when viewed from the overview camera, leaving visible water flat.
      // These world positions stay fixed during an orbit; the cached view and
      // half-vectors still move the reflection band with the observer.
      const centerX=lake.center?.[0]??(bounds.minX+bounds.maxX)*.5,centerZ=lake.center?.[2]??(bounds.minZ+bounds.maxZ)*.5;
      const lightX=centerX-(bounds.maxX-bounds.minX)*.58-daylight*3,lightY=30+daylight*10,lightZ=centerZ-(bounds.maxZ-bounds.minZ)*.18-daylight*2;
      for(let py=Math.max(0,Math.floor(waterBox.top/height*h));py<Math.min(h,Math.ceil(waterBox.bottom/height*h));py++){
        for(let px=Math.max(0,Math.floor(waterBox.left/width*w));px<Math.min(w,Math.ceil(waterBox.right/width*w));px++){
          const sx=(px+.5)/w*width-origin.x,sy=(py+.5)/h*height-origin.y,x=(sx*by-sy*bx)/det,z=(sy*ax-sx*ay)/det;
          if(!insidePolygon(x,z,outline))continue;
          const d=shoreDistance(x,z,outline),near=smooth(0,2.8,d),deep=smooth(2.2,8.8,d),noise=Math.sin(x*.49+z*.28)*.012+Math.sin(x*7.3-z*9.1)*.003;
          const index=(py*w+px)*4;
          for(let c=0;c<3;c++){const shallow=palette[0][c]+(palette[1][c]-palette[0][c])*near;data[index+c]=clamp((shallow+(palette[2][c]-shallow)*deep)*(1+noise),0,255);}
          data[index+3]=255;
          let vx=eye.x-x,vy=eye.y-waterY,vz=eye.z-z,len=Math.hypot(vx,vy,vz);vx/=len;vy/=len;vz/=len;
          let lx=lightX-x,ly=lightY,lz=lightZ-z;len=Math.hypot(lx,ly,lz);lx/=len;ly/=len;lz/=len;
          let hx=vx+lx,hy=vy+ly,hz=vz+lz;len=Math.hypot(hx,hy,hz);hx/=len;hy/=len;hz/=len;
          entries.push(index,x,z,d,vx,vy,vz,hx,hy,hz);meanFresnel+=.025+.975*Math.pow(1-clamp(vy,0,1),5);
        }
      }
      colorCtx.putImageData(pixels,0,0);
      waterField={entries:new Float32Array(entries),base:data,image:surfaceCtx.createImageData(w,h),count:entries.length/10};
      meanFresnel/=waterField.count||1;waveBasis=null;basisDirection=NaN;
    }
    function rebuild(){
      dirty=false;cacheBuilds++;reflectedTriangles=maskTriangles=0;
      fishAgents=null;jumpSpot=null;
      landscapeRoot?.updateMatrixWorld(true);camera.updateMatrixWorld(true);matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      for(const context of[maskCtx,mirrorCtx]){context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,mask.width,mask.height);context.setTransform(ratio,0,0,ratio,0,0);context.globalAlpha=1;context.globalCompositeOperation='source-over';}
      const polygon=outline.map(p=>worldAt(...p));
      waterBox={left:Math.max(0,Math.min(...polygon.map(p=>p.x))),top:Math.max(0,Math.min(...polygon.map(p=>p.y))),right:Math.min(width,Math.max(...polygon.map(p=>p.x))),bottom:Math.min(height,Math.max(...polygon.map(p=>p.y)))};
      cacheWaterColor();
      maskCtx.fillStyle='#ffffff';path(maskCtx,polygon);maskCtx.fill();maskCtx.globalCompositeOperation='destination-out';
      const occluders=meshesFrom(lake.occluders||[landscapeRoot]);
      for(const mesh of occluders){
        const g=mesh.geometry,pos=g.attributes.position,indices=g.index,mat=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
        if(mat?.visible===false||(mat?.transparent&&mat.opacity<.5))continue;
        const vertices=new Array(pos.count);
        for(let i=0;i<pos.count;i++){world.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);vertices[i]={x:world.x,y:world.y,z:world.z};}
        maskCtx.beginPath();let paths=0;
        const count=indices?indices.count:pos.count;
        for(let i=0;i+2<count;i+=3){
          const a=vertices[indices?indices.getX(i):i],b=vertices[indices?indices.getX(i+1):i+1],c=vertices[indices?indices.getX(i+2):i+2];
          if(Math.max(a.y,b.y,c.y)<=waterY+.015)continue;
          const clipped=aboveWater([a,b,c]);if(clipped.length<3)continue;
          const pp=clipped.map(p=>project(p.x,p.y,p.z));
          if(Math.max(...pp.map(p=>p.x))<waterBox.left||Math.min(...pp.map(p=>p.x))>waterBox.right||Math.max(...pp.map(p=>p.y))<waterBox.top||Math.min(...pp.map(p=>p.y))>waterBox.bottom)continue;
          // Give every face the same winding. Front and back faces of a closed
          // rock must union into a silhouette, rather than cancel one another.
          if(pp.reduce((area,p,n)=>{const q=pp[(n+1)%pp.length];return area+p.x*q.y-q.x*p.y;},0)<0)pp.reverse();
          pp.forEach((p,n)=>n?maskCtx.lineTo(p.x,p.y):maskCtx.moveTo(p.x,p.y));maskCtx.closePath();paths++;maskTriangles++;
        }
        if(paths)maskCtx.fill();
      }
      maskCtx.globalCompositeOperation='source-over';
      // Read the cached mask once, only to keep the jumping fish off obscured banks.
      try{maskPixels=maskCtx.getImageData(0,0,mask.width,mask.height).data;}catch(_){maskPixels=null;}
      const reflected=[],reflectors=meshesFrom(lake.reflectionObjects||[landscapeRoot?.getObjectByName('sect-visit-landmarks')]);
      for(const mesh of reflectors){
        const g=mesh.geometry,pos=g.attributes.position,indices=g.index,colors=g.attributes.color,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        const vertices=new Array(pos.count);
        for(let i=0;i<pos.count;i++){world.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);vertices[i]={...project(world.x,reflectY(world.y,waterY),world.z),above:world.y>waterY};}
        const count=indices?indices.count:pos.count;
        for(let i=0;i+2<count&&reflected.length<26000;i+=3){
          const a=indices?indices.getX(i):i,b=indices?indices.getX(i+1):i+1,c=indices?indices.getX(i+2):i+2;
          const p=vertices[a],q=vertices[b],r=vertices[c];if(!p.above&&!q.above&&!r.above)continue;
          if(Math.max(p.x,q.x,r.x)<waterBox.left||Math.min(p.x,q.x,r.x)>waterBox.right||Math.max(p.y,q.y,r.y)<waterBox.top||Math.min(p.y,q.y,r.y)>waterBox.bottom)continue;
          const group=materials.length>1?g.groups.find(part=>i>=part.start&&i<part.start+part.count):null,mat=materials[group?.materialIndex||0];
          if(mat?.visible===false||mat?.transparent&&mat.opacity<.55)continue;
          reflected.push({p,q,r,depth:(p.z+q.z+r.z)/3,color:colorAt(mat,colors,a,b,c)});
        }
      }
      reflected.sort((a,b)=>b.depth-a.depth);reflectedTriangles=reflected.length;
      for(const face of reflected){mirrorCtx.fillStyle=face.color;path(mirrorCtx,[face.p,face.q,face.r]);mirrorCtx.fill();}
      if(canvas.dataset){canvas.dataset.reflectedTriangles=String(reflectedTriangles);canvas.dataset.cacheBuilds=String(cacheBuilds);}
    }
    function openWater(q){
      if(!inView(q,0))return false;
      if(!maskPixels)return true;
      const x=clamp(Math.floor(q.x*ratio),0,mask.width-1),y=clamp(Math.floor(q.y*ratio),0,mask.height-1);
      return maskPixels[(y*mask.width+x)*4+3]>220;
    }
    function prepareWaveBasis(){
      if(!waterField||(waveBasis&&basisDirection===weather.windDirection))return;
      const count=waterField.count,entries=waterField.entries,angles=[0,.47,-.63,1.17],lengths=[6.7,3.15,1.42,.72];
      const basis=new Float32Array(count*8),directions=[];
      for(let k=0;k<4;k++){
        const angle=weather.windDirection+angles[k],dx=Math.cos(angle),dz=Math.sin(angle),frequency=TAU/lengths[k];
        directions.push([dx,dz]);
        for(let i=0;i<count;i++){
          const offset=i*10,x=entries[offset+1],z=entries[offset+2];
          // Smooth, differently oriented bends prevent the small waves from
          // intersecting as a regular cross-hatch. Cache this domain warp with
          // the spatial phase; animation still uses the same four samples.
          const bend=(Math.sin(x*.173+z*.117+k*1.91)*.75+Math.sin(x*.071-z*.219+k*.73)*.45)*(.18+k*.07);
          const phase=(x*dx+z*dz+bend)*frequency+k*1.919;
          basis[i*8+k*2]=Math.cos(phase);basis[i*8+k*2+1]=Math.sin(phase);
        }
      }
      waveBasis={values:basis,directions};basisDirection=weather.windDirection;
    }
    function water(t){
      if(!waterField)return;prepareWaveBasis();
      const {entries,base,image,count}=waterField,data=image.data,basis=waveBasis.values,dirs=waveBasis.directions;
      const wind=weather.windStrength,rain=weather.weatherId==='rain',speed=.38+wind*1.65;
      const amplitudes=[.09+wind*.23,.055+wind*.16,.025+wind*.105,.020+wind*.07];
      const velocities=[1.08,1.65,2.53,3.24],cc=[],ss=[];
      for(let k=0;k<4;k++){const phase=t*velocities[k]*speed;cc[k]=Math.cos(phase);ss[k]=Math.sin(phase);}
      const sunlight=(1-weather.cloudAmount*.48)*(rain?.63:1),shine=.76+daylight*.24;
      const sky=[55+daylight*101,91+daylight*108,123+daylight*85],sun=[184+daylight*71,222+daylight*24,252-daylight*39];
      for(let i=0;i<count;i++){
        const e=i*10,j=entries[e],b=i*8;let gx=0,gz=0,crest=0;
        for(let k=0;k<4;k++){
          const c=basis[b+k*2]*cc[k]-basis[b+k*2+1]*ss[k],slope=c*amplitudes[k];
          gx+=dirs[k][0]*slope;gz+=dirs[k][1]*slope;if(k===1)crest=c;
        }
        const inverse=1/Math.sqrt(1+gx*gx+gz*gz),nx=-gx*inverse,ny=inverse,nz=-gz*inverse;
        const eyeDot=clamp(nx*entries[e+4]+ny*entries[e+5]+nz*entries[e+6],0,1),grazing=1-eyeDot;
        const fresnel=.025+.975*grazing*grazing*grazing*grazing*grazing;
        const ndh=clamp(nx*entries[e+7]+ny*entries[e+8]+nz*entries[e+9],0,1),p2=ndh*ndh,p4=p2*p2,p8=p4*p4,p16=p8*p8,p32=p16*p16,p64=p32*p32;
        // Soft specular shoulders and a fine bright core arise from normals.
        // They are contiguous water pixels, with no stars or repeated dashes.
        const specular=(p64*p32*.72+p16*.28)*sunlight*shine;
        const reflectionMix=.075+fresnel*.58,bend=.92+(nx*.25+nz*.16)*(.7+daylight*.3);
        const d=entries[e+3],foam=Math.max(0,.45-d)*(.13+wind*.22)*(.55+crest*.45);
        const caustic=Math.max(0,1-d/3.1)*Math.max(0,crest-.6)*(.025+daylight*.055);
        for(let c=0;c<3;c++){
          const diffuse=base[j+c]*bend,reflected=diffuse+(sky[c]-diffuse)*reflectionMix;
          data[j+c]=clamp(reflected+(sun[c]-reflected)*specular+(220-reflected)*(foam+caustic),0,255);
        }
        data[j+3]=Math.round(239+16*clamp(d/.7,0,1));
        if(specular>.24)frameStats.glints++;
      }
      surfaceCtx.putImageData(image,0,0);ctx.globalAlpha=1;
      ctx.drawImage(surface,0,0,surface.width,surface.height,0,0,width,height);frameStats.drawCalls++;frameStats.surfacePixels=count;
    }
    function mirror(t){
      const windy=weather.windStrength,rain=weather.weatherId==='rain';
      ctx.globalAlpha=clamp(.33+meanFresnel*.8-windy*.10,.2,.63)*(rain?.75:1);
      const top=Math.max(0,Math.floor(waterBox.top)),bottom=Math.min(height,Math.ceil(waterBox.bottom)),step=mobile||software?4:3;
      const direction=Math.cos(weather.windDirection)*.55+.75,speed=.5+windy*1.7;
      for(let y=top;y<bottom;y+=step){
        const wave=(Math.sin(y*.071+t*speed)+Math.sin(y*.191-t*speed*.76)*.43)*(.34+windy*2.8)*direction;
        const drift=Math.sin(y*.094+t*speed*.8)*(.12+windy*.38),h=Math.min(step+.5,bottom-y);
        ctx.drawImage(reflection,0,y*ratio,reflection.width,h*ratio,wave,y+drift,width,h);frameStats.drawCalls++;frameStats.reflectionStrips++;
      }
      ctx.globalAlpha=1;
    }
    function ring(x,z,r,alpha){
      ctx.beginPath();for(let j=0;j<=40;j++){const a=j/40*TAU,p=worldAt(x+Math.cos(a)*r,z+Math.sin(a)*r);j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}
      ctx.strokeStyle=daylight>.3?'#e6eee1':'#b5dce9';ctx.lineWidth=1;ctx.globalAlpha=clamp(alpha,0,1);stroke();frameStats.splashElements++;
    }
    function safeFishSpot(x,z,height=0,size=1){
      // An airborne fish is still masked against the solid bank. Requiring its
      // whole small footprint to lie over open water also prevents a clipped
      // body or a fish apparently landing on a stair after a camera orbit.
      for(const [dx,dz] of [[0,0],[-1.05,0],[1.05,0],[0,-.7],[0,.7]]){
        if(!insidePolygon(x+dx*size,z+dz*size,outline)||!openWater(project(x+dx*size,waterY+height,z+dz*size)))return false;
      }
      return true;
    }
    function prepareFishSchool(){
      if(fishAgents)return;
      fishAgents=[];
      for(let i=0;i<fishLimit();i++){
        const profile=swimmers[i];let chosen=null;
        // Cache distinct territories, including the full body clearance, when
        // the camera changes. Smaller coves shorten a route, never stack fish
        // on one anchor or make a swimmer teleport to another safe point.
        for(const range of fishLimit()>6?[.85,.65,.5]:[1,.72,.5]){
          const radius=profile.radius*range;
          let best=-Infinity;
          for(const spot of fishSpots){
            const separation=fishAgents.length?Math.min(...fishAgents.map(other=>Math.hypot(spot.x-other.x,spot.z-other.z)-other.radius)):10;
            if(separation<radius+1.25||!safeFishSpot(spot.x,spot.z,-profile.depth,profile.scale))continue;
            let safe=true;
            for(let n=0;n<8;n++){
              const angle=n/8*TAU;
              if(!safeFishSpot(spot.x+Math.cos(angle)*radius,spot.z+Math.sin(angle)*radius,-profile.depth,profile.scale)){safe=false;break;}
            }
            if(!safe)continue;
            const score=separation+random(spot.seed+i*83)*.6;
            if(score>best){best=score;chosen={x:spot.x,z:spot.z,index:i,range,radius};}
          }
          if(chosen)break;
        }
        if(chosen)fishAgents.push(chosen);
      }
    }
    function eventSpot(motion){
      if(!fishSpots.length)return null;
      if(jumpSpot?.cycle===motion.cycle)return jumpSpot;
      const previous=jumpSpot,start=Math.floor(random(motion.cycle*17+47)*fishSpots.length),distance=1.8+random(motion.cycle*17+48)*.4,size=.96+random(motion.cycle*17+49)*.18;
      for(let direction=0;direction<4;direction++)for(let n=0;n<fishSpots.length;n++){
        const p=fishSpots[(start+n)%fishSpots.length],heading=random(motion.cycle*17+50)*TAU+direction*Math.PI*.5,dx=Math.cos(heading)*distance,dz=Math.sin(heading)*distance;
        if(previous&&fishSpots.length>3&&Math.hypot(p.x-previous.x,p.z-previous.z)<3)continue;
        let safe=true;
        for(let k=0;k<=4;k++){
          const progress=k/4;
          if(!safeFishSpot(p.x+dx*progress,p.z+dz*progress,Math.sin(progress*Math.PI)*jumpTiming.height,size)){safe=false;break;}
        }
        if(safe){jumpSpot={x:p.x,z:p.z,dx,dz,heading,size,cycle:motion.cycle};return jumpSpot;}
      }
      return null;
    }
    function ensureFishModels(){
      if(fishModels)return;
      fishModels=[];
      if(typeof global.createSpiritSectFishModel!=='function')return;
      const material=(color,options={})=>{
        // Nature models also supply PBR settings for the main scene. This
        // Canvas projection needs only parameters supported by BasicMaterial.
        const values={color};
        for(const key of ['vertexColors','side','transparent','opacity','depthTest','depthWrite','colorWrite','alphaTest','blending','fog','toneMapped','visible','wireframe'])if(options[key]!==undefined)values[key]=options[key];
        return new T.MeshBasicMaterial(values);
      };
      for(const speciesId of ['redWhiteKoi','goldenKoi','silverMinnow']){
        const group=global.createSpiritSectFishModel({THREE:T,material,speciesId});
        if(!group)continue;
        const records=[];
        group.traverse(mesh=>{
          if(!mesh.isMesh||!mesh.geometry?.attributes?.position)return;
          const geometry=mesh.geometry,position=geometry.attributes.position,normal=geometry.attributes.normal,colors=geometry.attributes.color,index=geometry.index,material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
          const faces=[];for(let i=0;i<(index?.count||position.count);i+=3){
            const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
            const rgb=['r','g','b'].map((key,j)=>(material?.color?.[key]??1)*(colors?(colors.array[a*3+j]+colors.array[b*3+j]+colors.array[c*3+j])/3:1));
            faces.push({a,b,c,rgb});
          }
          records.push({mesh,position,normal,faces,matrix:new T.Matrix3(),solid:mesh.userData.naturePart==='body'});
        });
        fishModels.push({group,records,speciesId});
      }
    }
    function drawFish(model,x,y,z,heading,pitch,phase,submerged,size=1,tailStrength=1){
      if(!model)return false;
      const {group,records,speciesId}=model,scale=(speciesId==='silverMinnow'?1.13:1.05)*size;
      group.position.set(x,y,z);group.rotation.set(0,-heading,pitch,'YXZ');group.scale.setScalar(scale);
      group.userData.setSwimPhase?.(phase,submerged?tailStrength:.8);group.updateMatrixWorld(true);
      const faces=[],eye=new T.Vector3();camera.getWorldPosition(eye);
      for(const record of records){
        const {mesh,position,normal}=record,vertices=[],normals=[];record.matrix.getNormalMatrix(mesh.matrixWorld);
        for(let i=0;i<position.count;i++){
          world.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);vertices.push({...project(world.x,world.y,world.z),wx:world.x,wy:world.y,wz:world.z});
          if(normal){world.fromBufferAttribute(normal,i).applyMatrix3(record.matrix).normalize();normals.push([world.x,world.y,world.z]);}
        }
        for(const face of record.faces){
          const {a,b,c}=face,p=vertices[a],q=vertices[b],r=vertices[c];
          if(!inView(p)&&!inView(q)&&!inView(r))continue;
          let nx=0,ny=1,nz=0;
          if(normal){nx=(normals[a][0]+normals[b][0]+normals[c][0])/3;ny=(normals[a][1]+normals[b][1]+normals[c][1])/3;nz=(normals[a][2]+normals[b][2]+normals[c][2])/3;}
          const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
          const facing=nx*(eye.x-(p.wx+q.wx+r.wx)/3)+ny*(eye.y-(p.wy+q.wy+r.wy)/3)+nz*(eye.z-(p.wz+q.wz+r.wz)/3);
          if(facing<0){if(record.solid)continue;nx=-nx;ny=-ny;nz=-nz;}
          const shade=(.53+.47*Math.max(0,-nx*.39+ny*.86+nz*.33))*(.68+daylight*.32);
          const tint=submerged?.24:0,waterTint=[44,112,129];
          const rgb=face.rgb.map((value,k)=>{const linear=clamp(value*shade,0,1),srgb=255*(linear<=.0031308?linear*12.92:1.055*Math.pow(linear,1/2.4)-.055);return Math.round(srgb+(waterTint[k]-srgb)*tint);});
          faces.push({p,q,r,depth:(p.z+q.z+r.z)/3,color:`rgb(${rgb.join(',')})`});
        }
      }
      faces.sort((a,b)=>b.depth-a.depth);ctx.globalAlpha=submerged?.42+daylight*.28:.98;
      for(const face of faces){ctx.fillStyle=face.color;path(ctx,[face.p,face.q,face.r]);paint();frameStats.fishTriangles++;}
      if(faces.length&&!frameStats.fishSpecies.includes(speciesId))frameStats.fishSpecies.push(speciesId);
      ctx.globalAlpha=1;return faces.length>0;
    }
    function swimmingFish(t){
      ensureFishModels();if(!fishModels.length)return;prepareFishSchool();
      for(const agent of fishAgents){
        const movement=swimMotion(t,agent.index,agent.range),x=agent.x+movement.x,z=agent.z+movement.z,model=fishModels[agent.index%fishModels.length];
        if(!safeFishSpot(x,z,-movement.depth,movement.scale))continue;
        if(drawFish(model,x,waterY-movement.depth,z,movement.heading,movement.pitch,movement.tailPhase,true,movement.scale,movement.tailStrength)){
          frameStats.swimmingFish++;
          frameStats.fishSchool.push({id:agent.index,speciesId:model.speciesId,x,z,heading:movement.heading,scale:movement.scale,speed:movement.speed,range:agent.range});
        }
      }
    }
    function droplets(x,z,age,duration,count,seed){
      if(age<0||age>=duration)return;
      for(let i=0;i<count;i++){
        const a=i/count*TAU,d=age*(.8+random(i+seed)*.5),q=project(x+Math.cos(a)*d,waterY+Math.sin(age/duration*Math.PI)*(.26+random(i+seed+3)*.3),z+Math.sin(a)*d);
        ctx.globalAlpha=(1-age/duration)*.8;ctx.fillStyle='#d4eaf0';ctx.beginPath();ctx.ellipse(q.x,q.y,.7,1.25,0,0,TAU);paint();frameStats.splashElements++;
      }
    }
    function fish(t){
      const motion=fishMotion(t);frameStats.fishEventIndex=motion.cycle;frameStats.nextFishJump=reducedMotion?null:motion.nextJumpIn;
      if(reducedMotion||(!motion.jumping&&motion.rippleAge<0))return;
      const spot=eventSpot(motion);if(!spot)return;
      const p=motion.progress,x=spot.x+p*spot.dx,z=spot.z+p*spot.dz,model=fishModels[motion.cycle%fishModels.length];if(!model)return;
      frameStats.fishJump={event:motion.cycle,speciesId:model.speciesId,x,z,heading:spot.heading,height:motion.height,progress:p,interval:motion.interval};
      if(motion.jumping){
        frameStats.fishState='jumping';
        if(lastJumpCycle!==motion.cycle){lastJumpCycle=motion.cycle;fishJumps++;}
        // The same three-dimensional mesh used beneath the water follows a
        // small ballistic arc, with a turning body and independently moving fins.
        if(drawFish(model,x,waterY+motion.height,z,spot.heading,Math.cos(p*Math.PI)*.67,t*17,false,spot.size))frameStats.jumpingFish=1;
        if(p<.35)ring(spot.x,spot.z,.22+p*1.4,(.35-p)*1.4);
        droplets(spot.x,spot.z,motion.phase,.28,4,motion.cycle+13);
      }else{
        frameStats.fishState='ripples';const age=motion.rippleAge;
        for(let i=0;i<3;i++){const a=age-i*.22;if(a<0)continue;ring(spot.x+spot.dx,spot.z+spot.dz,.15+a*.72,Math.max(0,(1-age/jumpTiming.ripples)*(.48-i*.08)));}
        droplets(spot.x+spot.dx,spot.z+spot.dz,age,.65,6,motion.cycle+37);
      }
    }
    function draw(t){
      if(dirty)rebuild();frameStats=freshStats();
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.globalCompositeOperation='source-over';
      ctx.imageSmoothingEnabled=true;const time=reducedMotion?0:t;
      water(time);swimmingFish(time);mirror(time);fish(time);
      // All water AND fish use the same shore/solid-object mask in both main
      // rendering modes. Even the airborne body cannot paint over a bank.
      ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask,0,0,mask.width,mask.height,0,0,width,height);frameStats.drawCalls++;
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;renderedFrames++;
      if(canvas.dataset){canvas.dataset.fish=frameStats.fishState;canvas.dataset.fishCount=String(frameStats.swimmingFish+frameStats.jumpingFish);canvas.dataset.fishLimit=String(fishLimit());canvas.dataset.fishEvent=String(frameStats.fishEventIndex);canvas.dataset.nextFishJump=frameStats.nextFishJump===null?'paused':frameStats.nextFishJump.toFixed(2);canvas.dataset.wind=weather.windStrength.toFixed(2);canvas.dataset.water='moving-normal-field';canvas.dataset.species=frameStats.fishSpecies.join(',');canvas.dataset.state=reducedMotion?'静水赏景':frameStats.fishState==='jumping'?'锦鲤跃波':frameStats.fishState==='ripples'?'涟漪轻漾':'游鱼波光';}
    }
    const frameRate=()=>mobile||software?20:30;
    function schedule(){if(!destroyed&&visible&&!document.hidden&&!raf)raf=global.requestAnimationFrame(tick);}
    function tick(stamp){
      raf=0;if(destroyed||!visible||document.hidden)return;
      if(Number.isFinite(stamp)){if(previousStamp!==null)elapsed+=clamp((stamp-previousStamp)/1000,0,.12);previousStamp=stamp;}
      if(first||stamp-last>=1000/frameRate()||reducedMotion){first=false;last=stamp;draw(elapsed);}if(!reducedMotion)schedule();
    }
    function cancel(){if(raf)global.cancelAnimationFrame(raf);raf=0;previousStamp=null;}
    function invalidate(){if(destroyed)return;dirty=true;first=true;schedule();}
    function repaint(){if(destroyed)return;first=true;schedule();}
    function resize(w,h){
      if(destroyed)return;width=Math.max(1,Number(w)||1);height=Math.max(1,Number(h)||1);mobile=width<560;ratio=Math.min(global.devicePixelRatio||1,mobile?1.25:1.5);
      for(const target of[canvas,mask,reflection]){target.width=Math.round(width*ratio);target.height=Math.round(height*ratio);}maskPixels=null;invalidate();
      // Pixel work stays bounded even on a large or high-DPI window. Geometry
      // masks/reflections keep the sharper device resolution independently.
      const fieldLimit=mobile?48000:software?68000:96000,scale=Math.min(.78,Math.sqrt(fieldLimit/(width*height)));
      waterColor.width=surface.width=Math.max(1,Math.floor(width*scale));waterColor.height=surface.height=Math.max(1,Math.floor(height*scale));
    }
    function setVisible(value){if(destroyed)return;visible=!!value;if(!visible)cancel();else repaint();}
    function onVisibility(){if(document.hidden)cancel();else repaint();}
    document.addEventListener?.('visibilitychange',onVisibility);
    return {canvas,resize,invalidate,setVisible,
      setDaylight(state){if(destroyed||!Number.isFinite(state?.daylight))return false;const next=Math.round(clamp(state.daylight,0,1)*120)/120,phase=String(state.phaseId||'');if(next===daylight&&phase===phaseId)return false;daylight=next;phaseId=phase;invalidate();return true;},
      setWeather(state){
        if(destroyed||!state||!Number.isFinite(state.windStrength)||!Number.isFinite(state.windDirection))return false;
        const next={weatherId:['clear','cloudy','mist','rain','snow'].includes(state.weatherId)?state.weatherId:'clear',windStrength:Math.round(clamp(state.windStrength,0,1)*100)/100,windDirection:((state.windDirection%TAU)+TAU)%TAU,cloudAmount:clamp(Number(state.cloudAmount)||0,0,1)};
        if(Object.keys(next).every(key=>next[key]===weather[key]))return false;weather=next;repaint();return true;
      },
      getStats(){return{visible,destroyed,mobile,reducedMotion,daylight,phaseId,windStrength:weather.windStrength,weatherId:weather.weatherId,renderedFrames,cacheBuilds,reflectedTriangles,maskTriangles,pixelRatio:ratio,maxFrameRate:frameRate(),framePending:!!raf,fieldPixelLimit:mobile?48000:software?68000:96000,fishLimit:fishLimit(),fishModelCount:fishModels?.length||0,fishJumps,animationTime:elapsed,fishCount:frameStats.swimmingFish+frameStats.jumpingFish,...frameStats};},
      dispose(){
        if(destroyed)return;destroyed=true;cancel();document.removeEventListener?.('visibilitychange',onVisibility);canvas.remove();
        for(const target of[canvas,mask,reflection,waterColor,surface])target.width=target.height=1;
        const disposed=new Set();for(const model of fishModels||[])model.group.traverse(object=>{for(const asset of[object.geometry,...(Array.isArray(object.material)?object.material:[object.material])])if(asset&&!disposed.has(asset)){disposed.add(asset);asset.dispose?.();}});
        maskPixels=waterField=waveBasis=fishModels=fishAgents=jumpSpot=null;
      }
    };
  };
})(window);
