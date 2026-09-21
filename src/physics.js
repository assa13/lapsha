// Fixed-step, position-based rope solver. Distances are owned by links so a
// swipe can split a link at the actual hit point without creating more rope.
export const STEP=1/120, SEGMENT=.14, RADIUS=.066, FLOOR=-3.88, TOP=6.75;
export const BURN_DELAY=3, BURN_DURATION=.8;
export const PILE_STOP_Y=TOP-1, PILE_RESUME_Y=TOP-1.6, PILE_STOP_DELAY=.35, PILE_RESUME_DELAY=.6;
export const PHYSICS_DEFAULTS=Object.freeze({fixedStep:STEP,maxStepsPerFrame:4,segmentLength:SEGMENT,radius:RADIUS,floor:FLOOR,top:TOP,gravity:14,horizontalDamping:.998,depthDamping:.993,turbulence:.04,anchorFrequency:.65,anchorSway:.08,anchorFollow:5,bendRatio:.94,bendStiffness:.16,floorFriction:.025,wireFriction:.12,wallHalfWidth:2.84,depthHalfWidth:.29,solverPasses:10,denseSolverPasses:6,denseThreshold:800,pileStopY:PILE_STOP_Y,pileResumeY:PILE_RESUME_Y,pileStopDelay:PILE_STOP_DELAY,pileResumeDelay:PILE_RESUME_DELAY,burnDelay:BURN_DELAY,burnDuration:BURN_DURATION});
export const PHYSICS_PARAMETERS=PHYSICS_DEFAULTS;
const node=(x,y,z=0)=>({x,y,z,px:x,py:y,pz:z});
const clone=p=>({...p});
const NEIGHBORS=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)NEIGHBORS.push(x+y*128+z*16384);
let nextId=1;
export function intersection(a,b,c,d){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y;
  const den=rx*sy-ry*sx;if(Math.abs(den)<1e-8)return null;
  const qx=c.x-a.x,qy=c.y-a.y;
  const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  return t>=0&&t<=1&&u>=0&&u<=1?{t,u}:null;
}
export class RopeWorld{
  constructor({onBurn=()=>{},materials=['gold'],wireCount=1,parameters={}}={}){
    this.params={...PHYSICS_DEFAULTS};this.setParameters(parameters);
    this.ropes=[];this.time=0;this.onBurn=onBurn;this.feedSpeed=1.15;this.material='gold';this.rotation=[...materials];this.rotationIndex=0;
    this.extrusionBlocked=false;this.pileHeight=this.params.floor;this.pileStopTime=0;this.pileResumeTime=0;
    this.collisionGrid=new Map();this.collisionBuckets=[];this.collisionEntries=[];
    this.setWireCount(wireCount,materials.length?6.5:.3,true);
  }
  setParameters(values={}){for(const key of Object.keys(PHYSICS_DEFAULTS))if(Number.isFinite(values[key]))this.params[key]=values[key];}
  addFeeder(material,length=6.5,anchorX=0,anchorZ=0){
    const {segmentLength,top}=this.params,n=Math.max(3,Math.floor(length/segmentLength));const nodes=[];
    for(let i=0;i<n;i++)nodes.push(node(anchorX+Math.sin(i*.08)*.06,top-i*segmentLength,anchorZ+Math.sin(i*.11)*.02));
    const rope={id:nextId++,nodes,links:Array(n-1).fill(segmentLength),linkMaterials:Array(n-1).fill(material),attached:true,anchorX,anchorZ,material,emitMaterial:material,landed:false,restTime:0,fade:0,age:0};
    this.ropes.push(rope);return rope;
  }
  get feeder(){return this.ropes.find(r=>r.attached);}
  get feeders(){return this.ropes.filter(r=>r.attached);}
  setWireCount(count,length=1.3,initialize=false){
    const n=Math.max(1,Math.floor(count)),columns=Math.min(n,15),rows=Math.ceil(n/columns),span=Math.min(4.2,(columns-1)*1.5);
    const position=i=>({x:columns===1?0:((i%columns)/(columns-1)-.5)*span,z:rows===1?0:(Math.floor(i/columns)/(rows-1)-.5)*this.params.depthHalfWidth*1.72});
    while(this.feeders.length>n){const feeder=this.feeders.at(-1);this.ropes.splice(this.ropes.indexOf(feeder),1);}
    while(this.feeders.length<n){const i=this.feeders.length,p=position(i);this.addFeeder(this.nextMaterial()||'gold',this.rotation.length?length:.3,p.x,p.z);}
    this.feeders.forEach((r,i)=>{const p=position(i);r.sourceIndex=i;r.experimentalShader=i===1;if(initialize){const dx=p.x-r.anchorX,dz=p.z-r.anchorZ;for(const v of r.nodes){v.x+=dx;v.px+=dx;v.z+=dz;v.pz+=dz;}}r.anchorX=p.x;r.anchorZ=p.z;});
  }
  nextMaterial(){if(!this.rotation.length)return null;return this.rotation[this.rotationIndex++%this.rotation.length];}
  setRotation(ids){this.rotation=[...new Set(ids)];this.rotationIndex=0;for(const r of this.feeders)r.emitMaterial=this.nextMaterial();}
  get count(){return this.ropes.reduce((n,r)=>n+r.nodes.length,0);}
  step(dt=this.params.fixedStep){
    this.time+=dt;const total=this.count,feeders=this.feeders,{segmentLength,radius,floor,top}=this.params;
    for(const feeder of feeders){if(!this.rotation.length||this.extrusionBlocked)break;
      feeder.links[0]+=this.feedSpeed*dt;
      while(feeder.links[0]>segmentLength*2){const a=feeder.nodes[0],b=feeder.nodes[1],t=segmentLength/feeder.links[0];
        const p=node(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t);
        p.py=p.y+this.feedSpeed*dt;feeder.nodes.splice(1,0,p);
        feeder.links[0]-=segmentLength;feeder.links.unshift(segmentLength);
        feeder.linkMaterials.unshift(feeder.emitMaterial||this.rotation[0]);
      }
    }
    for(const r of this.ropes){r.supported=false;r.age+=dt;for(const p of r.nodes)p.contact=false;if(r.landed){r.restTime+=dt;r.fade=Math.max(0,r.restTime-this.params.burnDelay);}if(r.fade>0)continue;
      for(let i=0;i<r.nodes.length;i++){
        const p=r.nodes[i];if(r.attached&&i===0){const target=r.anchorX+Math.sin(this.time*this.params.anchorFrequency+r.anchorX)*this.params.anchorSway;p.x+=(target-p.x)*Math.min(1,dt*this.params.anchorFollow);p.y=top;p.z+=(r.anchorZ-p.z)*Math.min(1,dt*this.params.anchorFollow);p.px=p.x;p.py=p.y;p.pz=p.z;continue;}
        const vx=(p.x-p.px)*this.params.horizontalDamping,vy=(p.y-p.py)*this.params.horizontalDamping,vz=(p.z-p.pz)*this.params.depthDamping;
        p.px=p.x;p.py=p.y;p.pz=p.z;
        p.x+=vx+Math.sin(this.time*1.1+p.y*1.4)*this.params.turbulence*dt*dt;
        p.y+=vy-this.params.gravity*dt*dt;p.z+=vz;
      }
    }
    const passes=total>this.params.denseThreshold?Math.round(this.params.denseSolverPasses):Math.round(this.params.solverPasses);
    this.collisionPassesThisStep=Math.ceil(passes/2)+(passes%2===0?1:0);
    for(let pass=0;pass<passes;pass++){
      for(const r of this.ropes){if(r.fade>0)continue;
        for(let i=0;i<r.links.length;i++)this.constrain(r.nodes[i],r.nodes[i+1],r.links[i],r.attached&&i===0,1);
        // A weak bending constraint prevents sharp, hinge-like kinks, while
        // allowing the wire to coil naturally on contact with the floor.
        for(let i=0;i<r.nodes.length-2;i++){
          const a=r.nodes[i],b=r.nodes[i+2],minimum=(r.links[i]+r.links[i+1])*this.params.bendRatio;
          if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<minimum)this.constrain(a,b,minimum,r.attached&&i===0,this.params.bendStiffness);
        }
      }
      if(pass===passes-1||pass%2===0)this.collide();
      for(const r of this.ropes){if(r.fade>0)continue;for(let i=0;i<r.nodes.length;i++){
        const p=r.nodes[i];if(r.attached&&i===0)continue;
        if(p.y<floor+radius){const retain=1-this.params.floorFriction;p.y=floor+radius;p.py=Math.min(p.py,p.y+.016);p.px=p.x-(p.x-p.px)*retain;p.pz=p.z-(p.z-p.pz)*retain;p.contact=true;}
        p.x=Math.max(-this.params.wallHalfWidth+radius,Math.min(this.params.wallHalfWidth-radius,p.x));
        p.z=Math.max(-this.params.depthHalfWidth,Math.min(this.params.depthHalfWidth,p.z));
      }}
    }
    for(const r of this.ropes){
      if(!r.attached&&!r.landed&&r.age>.13&&(r.supported||r.nodes.some(p=>p.y<=floor+radius+.025))){
        r.landed=true;r.restTime=0;
      }
      if(r.fade>=this.params.burnDuration&&!r.burned){r.burned=true;this.onBurn(r);}
    }
    this.updatePileState(dt);
    this.ropes=this.ropes.filter(r=>!r.burned);
  }
  constrain(a,b,rest,pinned,stiffness){
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const len=Math.hypot(dx,dy,dz)||.0001;
    const f=(len-rest)/len*stiffness;const k=pinned?0:.5;
    a.x+=dx*f*k;a.y+=dy*f*k;a.z+=dz*f*k;
    b.x-=dx*f*(1-k);b.y-=dy*f*(1-k);b.z-=dz*f*(1-k);
  }
  isFeederSpine(r,i){
    if(!r.attached||i===0)return r.attached&&i===0;
    const p=r.nodes[i];if(p.y<this.params.pileStopY)return false;
    const a=r.nodes[Math.max(0,i-1)],b=r.nodes[Math.min(r.nodes.length-1,i+1)];
    return Math.hypot(b.x-a.x,b.z-a.z)<Math.abs(b.y-a.y)*.45;
  }
  collide(){
    const size=this.params.radius*2,grid=this.collisionGrid;grid.clear();let bucketCount=0,entryCount=0;
    for(const r of this.ropes){if(r.fade>0)continue;
      for(let i=0;i<r.nodes.length;i++){
        const p=r.nodes[i],gx=Math.floor(p.x/size),gy=Math.floor(p.y/size),gz=Math.floor(p.z/size),key=(gx+64)+(gy+64)*128+(gz+16)*16384;
        for(const offset of NEIGHBORS){
          const bucket=grid.get(key+offset);if(!bucket)continue;
          for(const entry of bucket){if(entry.r===r&&Math.abs(entry.i-i)<3)continue;
            const q=entry.p;let dx=p.x-q.x,dy=p.y-q.y,dz=p.z-q.z,d2=dx*dx+dy*dy+dz*dz;
            if(d2>=size*size)continue;let d=Math.sqrt(d2);if(d<.00001){dx=.0001;dz=.0001;d=Math.sqrt(dx*dx+dz*dz);}
            if(this.isFeederSpine(r,i)&&this.isFeederSpine(entry.r,entry.i))continue;
            p.contact=true;q.contact=true;
            if(entry.r!==r){
              if((entry.r.landed||q.y<=this.params.floor+this.params.radius+.025)&&p.y>=q.y-this.params.radius)r.supported=true;
              if((r.landed||p.y<=this.params.floor+this.params.radius+.025)&&q.y>=p.y-this.params.radius)entry.r.supported=true;
            }
            const pPin=r.attached&&i===0,qPin=entry.r.attached&&entry.i===0;if(pPin&&qPin)continue;
            let pvx=p.x-p.px,pvy=p.y-p.py,pvz=p.z-p.pz,qvx=q.x-q.px,qvy=q.y-q.py,qvz=q.z-q.pz;
            const f=(size-d)/d,wp=pPin?0:qPin?1:.5,wq=qPin?0:pPin?1:.5;
            const px=dx*f*wp,py=dy*f*wp,pz=dz*f*wp,qx=dx*f*wq,qy=dy*f*wq,qz=dz*f*wq;
            p.x+=px;p.y+=py;p.z+=pz;q.x-=qx;q.y-=qy;q.z-=qz;
            const nx=dx/d,ny=dy/d,nz=dz/d,relativeNormal=(pvx-qvx)*nx+(pvy-qvy)*ny+(pvz-qvz)*nz;
            if(relativeNormal<0){const impulse=-relativeNormal/(wp+wq);pvx+=nx*impulse*wp;pvy+=ny*impulse*wp;pvz+=nz*impulse*wp;qvx-=nx*impulse*wq;qvy-=ny*impulse*wq;qvz-=nz*impulse*wq;}
            const rvx=pvx-qvx,rvy=pvy-qvy,rvz=pvz-qvz,normalAfter=rvx*nx+rvy*ny+rvz*nz;
            const tx=rvx-normalAfter*nx,ty=rvy-normalAfter*ny,tz=rvz-normalAfter*nz;
            const wireFriction=Math.max(0,Math.min(.99,this.params.wireFriction)),friction=1-Math.pow(1-wireFriction,1/(this.collisionPassesThisStep||1)),frictionScale=friction/(wp+wq);
            pvx-=tx*frictionScale*wp;pvy-=ty*frictionScale*wp;pvz-=tz*frictionScale*wp;
            qvx+=tx*frictionScale*wq;qvy+=ty*frictionScale*wq;qvz+=tz*frictionScale*wq;
            if(pPin){p.px=p.x;p.py=p.y;p.pz=p.z;}else{p.px=p.x-pvx;p.py=p.y-pvy;p.pz=p.z-pvz;}
            if(qPin){q.px=q.x;q.py=q.y;q.pz=q.z;}else{q.px=q.x-qvx;q.py=q.y-qvy;q.pz=q.z-qvz;}
          }
        }
        let bucket=grid.get(key);if(!bucket){bucket=this.collisionBuckets[bucketCount]??[];this.collisionBuckets[bucketCount++]=bucket;bucket.length=0;grid.set(key,bucket);}
        const entry=this.collisionEntries[entryCount]??{};this.collisionEntries[entryCount++]=entry;entry.p=p;entry.r=r;entry.i=i;bucket.push(entry);
      }
    }
  }
  measurePileHeight(){
    let peak=this.params.floor;
    for(const r of this.ropes){if(r.fade>0||r.nodes.length<2)continue;
      for(let i=0;i<r.nodes.length;i++){const p=r.nodes[i];if(!p.contact||(r.attached&&i===0))continue;
        const a=r.nodes[Math.max(0,i-1)],b=r.nodes[Math.min(r.nodes.length-1,i+1)];
        const horizontal=Math.hypot(b.x-a.x,b.z-a.z),vertical=Math.abs(b.y-a.y);
        if(horizontal<vertical*.45)continue;
        peak=Math.max(peak,p.y);
      }
    }
    return peak;
  }
  updatePileState(dt=this.params.fixedStep){
    this.pileHeight=this.measurePileHeight();
    if(this.extrusionBlocked){
      this.pileStopTime=0;
      this.pileResumeTime=this.pileHeight<=this.params.pileResumeY?this.pileResumeTime+dt:0;
      if(this.pileResumeTime>=this.params.pileResumeDelay){this.extrusionBlocked=false;this.pileResumeTime=0;}
    }else{
      this.pileResumeTime=0;
      this.pileStopTime=this.pileHeight>=this.params.pileStopY?this.pileStopTime+dt:0;
      if(this.pileStopTime>=this.params.pileStopDelay){this.extrusionBlocked=true;this.pileStopTime=0;}
    }
  }
  physicsSnapshot(){
    const nodes=this.count,feeders=this.feeders;
    return {...this.params,stepsPerSecond:1/this.params.fixedStep,collisionDistance:this.params.radius*2,feedSpeed:this.feedSpeed,feeders:feeders.length,ropes:this.ropes.length,fragments:this.ropes.length-feeders.length,nodes,links:this.ropes.reduce((sum,r)=>sum+r.links.length,0),activeSolverPasses:nodes>this.params.denseThreshold?this.params.denseSolverPasses:this.params.solverPasses,pileHeight:this.pileHeight,extrusionBlocked:this.extrusionBlocked,simulationTime:this.time};
  }
  cut(a,b){
    const hits=[];
    // Snapshot: new fragments cannot be cut twice by this swipe segment.
    for(const r of [...this.ropes]){if(r.fade>0)continue;
      const found=[];
      for(let i=0;i<r.links.length;i++){const hit=intersection(a,b,r.nodes[i],r.nodes[i+1]);
        if(hit&&hit.u>.001&&hit.u<.999)found.push({i,u:hit.u});}
      // Split from tail to head to preserve the remaining link indices.
      for(const hit of found.reverse()){
        const i=hit.i,p=r.nodes[i],q=r.nodes[i+1],u=hit.u,link=r.links[i];
        const c={};for(const k of ['x','y','z','px','py','pz'])c[k]=p[k]+(q[k]-p[k])*u;
        const tail={id:nextId++,sourceIndex:r.sourceIndex,experimentalShader:r.experimentalShader,nodes:[clone(c),...r.nodes.slice(i+1)],links:[link*(1-u),...r.links.slice(i+1)],linkMaterials:r.linkMaterials.slice(i),attached:false,material:r.linkMaterials[i],landed:r.landed,restTime:r.restTime,fade:0,age:0};
        r.nodes=[...r.nodes.slice(0,i+1),clone(c)];r.links=[...r.links.slice(0,i),link*u];r.linkMaterials=r.linkMaterials.slice(0,i+1);
        // Small visible separation; income is granted only when the fragment burns.
        tail.nodes[0].py+=.012;r.nodes.at(-1).py-=.009;
        this.ropes.push(tail);hits.push({x:c.x,y:c.y,z:c.z});
      }
      if(found.length&&r.attached)r.emitMaterial=this.nextMaterial();
    }
    return hits;
  }
}
