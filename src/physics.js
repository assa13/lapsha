// Fixed-step, position-based rope solver. Distances are owned by links so a
// swipe can split a link at the actual hit point without creating more rope.
export const STEP=1/120, SEGMENT=.14, RADIUS=.08712, FLOOR=-3.88, TOP=6.75;
export const BURN_DELAY=3, BURN_DURATION=.8;
export const PILE_STOP_Y=TOP-1, PILE_RESUME_Y=TOP-1.6, PILE_STOP_DELAY=.35, PILE_RESUME_DELAY=.6;
export const PHYSICS_DEFAULTS=Object.freeze({fixedStep:STEP,maxStepsPerFrame:4,segmentLength:SEGMENT,radius:RADIUS,floor:FLOOR,top:TOP,gravity:14,horizontalDamping:.998,depthDamping:.993,turbulence:.04,anchorFrequency:.65,anchorSway:.08,anchorFollow:5,bendRatio:.94,bendStiffness:.16,floorFriction:.025,wireFriction:.12,pileMassBoost:5,pileVelocityDamping:.1,pilePressureDamping:.78,tailBakeStartNodes:80,tailBakeMinNodes:8,tailBakeDelay:.75,tailBakeSpeed:.006,tailBakeHeight:2.4,wallHalfWidth:2.84,depthHalfWidth:.2175,solverPasses:10,denseSolverPasses:6,denseThreshold:800,pileStopY:PILE_STOP_Y,pileResumeY:PILE_RESUME_Y,pileStopDelay:PILE_STOP_DELAY,pileResumeDelay:PILE_RESUME_DELAY,burnDelay:BURN_DELAY,burnDuration:BURN_DURATION});
export const PHYSICS_PARAMETERS=PHYSICS_DEFAULTS;
const node=(x,y,z=0)=>({x,y,z,px:x,py:y,pz:z});
const clone=p=>({...p});
// Process every neighboring cell pair once. Contacts inside the same cell are
// handled separately, so only one ordered half of the 3×3×3 neighborhood is
// needed instead of 27 hash lookups for every node.
const FORWARD_NEIGHBORS=[];for(let z=-1;z<=1;z++)for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(z>0||(z===0&&y>0)||(z===0&&y===0&&x>0))FORWARD_NEIGHBORS.push([x,y,z]);
const FLAT_NEIGHBORS=[[1,0,0],[-1,1,0],[0,1,0],[1,1,0]];
// The normal playfield fits in a small, reusable dense grid. Extreme radius or
// wall settings fall back to a sparse grid instead of allocating huge buffers.
const MAX_GRID_CELLS=1<<20;
class CollisionEntry{
  constructor(){
    this.p=null;this.r=null;this.i=0;this.spine=undefined;this.invMass=0;
    this.gx=0;this.gy=0;this.gz=0;
  }
}
let nextId=1;
export function intersection(a,b,c,d){
  const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y;
  const den=rx*sy-ry*sx;if(Math.abs(den)<1e-8)return null;
  const qx=c.x-a.x,qy=c.y-a.y;
  const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  return t>=0&&t<=1&&u>=0&&u<=1?{t,u}:null;
}
export class RopeWorld{
  constructor({onBurn=()=>{},materials=['gold'],wireCount=1,parameters={},initialLength=6.5}={}){
    this.params={...PHYSICS_DEFAULTS};this.setParameters(parameters);
    this.ropes=[];this.time=0;this.onBurn=onBurn;this.feedSpeed=1.15;this.material='gold';this.rotation=[...materials];this.rotationIndex=0;
    this.extrusionBlocked=false;this.pileHeight=this.params.floor;this.pileStopTime=0;this.pileResumeTime=0;
    this.collisionGrid=new Map();this.collisionBuckets=[];this.collisionKeys=[];this.collisionEntries=[];this.collisionActiveCount=0;
    this.collisionCells=new Int32Array(0);this.collisionOffsets=new Int32Array(13);
    this.setWireCount(wireCount,materials.length?initialLength:.3,true);
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
    for(const r of this.ropes){r.supported=false;r.age+=dt;for(const p of r.nodes){if(!p.frozen)p.contact=false;p.contactCount=0;}if(r.landed){r.restTime+=dt;r.fade=Math.max(0,r.restTime-this.params.burnDelay);}if(r.fade>0)continue;
      for(let i=0;i<r.nodes.length;i++){
        const p=r.nodes[i];if(r.attached&&i===0){const target=r.anchorX+Math.sin(this.time*this.params.anchorFrequency+r.anchorX)*this.params.anchorSway;p.x+=(target-p.x)*Math.min(1,dt*this.params.anchorFollow);p.y=top;p.z+=(r.anchorZ-p.z)*Math.min(1,dt*this.params.anchorFollow);p.px=p.x;p.py=p.y;p.pz=p.z;continue;}
        if(p.frozen){p.px=p.x;p.py=p.y;p.pz=p.z;continue;}
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
          if(a.frozen&&b.frozen)continue;
          const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;
          if(dx*dx+dy*dy+dz*dz<minimum*minimum)this.constrain(a,b,minimum,r.attached&&i===0,this.params.bendStiffness);
        }
      }
      if(pass===passes-1||pass%2===0)this.collide();
      for(const r of this.ropes){if(r.fade>0)continue;for(let i=0;i<r.nodes.length;i++){
        const p=r.nodes[i];if(r.attached&&i===0)continue;
        if(p.y<floor+radius){const retain=1-this.params.floorFriction;p.y=floor+radius;p.py=Math.min(p.py,p.y+.016);p.px=p.x-(p.x-p.px)*retain;p.pz=p.z-(p.z-p.pz)*retain;p.contact=true;p.contactCount++;}
        p.x=Math.max(-this.params.wallHalfWidth+radius,Math.min(this.params.wallHalfWidth-radius,p.x));
        p.z=Math.max(-this.params.depthHalfWidth,Math.min(this.params.depthHalfWidth,p.z));
      }}
    }
    this.stabilizePileVelocities();
    this.updateFrozenTails(dt);
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
    const aPinned=pinned||a.frozen===true,bPinned=b.frozen===true;if(aPinned&&bPinned)return;
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const len=Math.sqrt(dx*dx+dy*dy+dz*dz)||.0001;
    const f=(len-rest)/len*stiffness,wa=aPinned?0:bPinned?1:.5,wb=bPinned?0:aPinned?1:.5;
    a.x+=dx*f*wa;a.y+=dy*f*wa;a.z+=dz*f*wa;
    b.x-=dx*f*wb;b.y-=dy*f*wb;b.z-=dz*f*wb;
  }
  isFeederSpine(r,i){
    if(!r.attached||i===0)return r.attached&&i===0;
    const p=r.nodes[i];if(p.y<this.params.pileStopY)return false;
    const a=r.nodes[Math.max(0,i-1)],b=r.nodes[Math.min(r.nodes.length-1,i+1)];
    return Math.hypot(b.x-a.x,b.z-a.z)<Math.abs(b.y-a.y)*.45;
  }
  collisionInverseMass(r,i,p){
    if(p.frozen||r.attached&&i===0)return 0;
    const zone=Math.min(2.4,Math.max(.1,this.params.pileStopY-this.params.floor));
    const depth=Math.max(0,Math.min(1,(this.params.floor+zone-p.y)/zone));
    const tail=r.attached?i/Math.max(1,r.nodes.length-1):1;
    return 1/(1+this.params.pileMassBoost*depth*tail);
  }
  stabilizePileVelocities(){
    const zone=Math.min(2.4,Math.max(.1,this.params.pileStopY-this.params.floor));
    for(const r of this.ropes){if(r.fade>0)continue;const last=Math.max(1,r.nodes.length-1);
      for(let i=0;i<r.nodes.length;i++){const p=r.nodes[i],contacts=p.contactCount||0;if(p.frozen||!contacts)continue;
        const depth=Math.max(0,Math.min(1,(this.params.floor+zone-p.y)/zone));if(depth<=0)continue;
        const tail=r.attached?i/last:1,pressure=1-Math.exp(-contacts*.18);
        const damping=Math.min(.96,(this.params.pileVelocityDamping+pressure*this.params.pilePressureDamping)*depth*(.25+.75*tail));
        const horizontalRetain=1-damping,verticalRetain=1-Math.min(.985,damping*1.15);
        p.px=p.x-(p.x-p.px)*horizontalRetain;p.py=p.y-(p.y-p.py)*verticalRetain;p.pz=p.z-(p.z-p.pz)*horizontalRetain;
      }
    }
  }
  updateFrozenTails(dt){
    const {floor,tailBakeStartNodes,tailBakeMinNodes,tailBakeDelay,tailBakeSpeed,tailBakeHeight}=this.params,speed2=tailBakeSpeed*tailBakeSpeed,maxY=floor+tailBakeHeight;
    for(const r of this.ropes){if(!r.attached||r.nodes.length<tailBakeStartNodes||r.fade>0)continue;
      for(let i=1;i<r.nodes.length;i++){const p=r.nodes[i];if(p.frozen)continue;
        const vx=p.x-p.px,vy=p.y-p.py,vz=p.z-p.pz;
        p.settleTime=p.contact&&p.y<=maxY&&vx*vx+vy*vy+vz*vz<=speed2?(p.settleTime||0)+dt:0;
      }
      let start=r.nodes.length;for(let i=r.nodes.length-1;i>=2;i--){const p=r.nodes[i];if(p.frozen||p.settleTime>=tailBakeDelay)start=i;else break;}
      if(r.nodes.length-start<tailBakeMinNodes)continue;
      for(let i=start+1;i<r.nodes.length;i++){const p=r.nodes[i];p.frozen=true;p.px=p.x;p.py=p.y;p.pz=p.z;}
    }
  }
  thawRope(r){
    for(const p of r.nodes){if(p.frozen){p.frozen=false;p.px=p.x;p.py=p.y;p.pz=p.z;}p.settleTime=0;}
  }
  collide(){
    // The friction coefficient is constant throughout a collision pass.
    this.contactFriction=1-Math.pow(1-Math.max(0,Math.min(.99,this.params.wireFriction)),1/(this.collisionPassesThisStep||1));
    const size=this.params.radius*2,size2=size*size,grid=this.collisionGrid,entries=this.collisionEntries,buckets=this.collisionBuckets;
    // The playfield is shallow. Project its broad phase onto XY; the narrow
    // phase still checks true 3D distances. Deep custom arenas use the 3D grid.
    const shallow=this.params.depthHalfWidth<=size*3;
    let bucketCount=0,entryCount=0,minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(const r of this.ropes){if(r.fade>0)continue;
      for(let i=0;i<r.nodes.length;i++){
        const p=r.nodes[i],gx=Math.floor(p.x/size),gy=Math.floor(p.y/size),gz=shallow?0:Math.floor(p.z/size);
        minX=Math.min(minX,gx);minY=Math.min(minY,gy);minZ=Math.min(minZ,gz);maxX=Math.max(maxX,gx);maxY=Math.max(maxY,gy);maxZ=Math.max(maxZ,gz);
        const entry=entries[entryCount]??new CollisionEntry();entries[entryCount++]=entry;entry.p=p;entry.r=r;entry.i=i;entry.spine=undefined;entry.invMass=this.collisionInverseMass(r,i,p);entry.gx=gx;entry.gy=gy;entry.gz=gz;
      }
    }
    // Keep pool capacity, but release ropes removed by burning or source edits.
    for(let n=entryCount;n<this.collisionActiveCount;n++){entries[n].p=null;entries[n].r=null;}
    this.collisionActiveCount=entryCount;if(!entryCount)return;
    // A one-cell border allows neighbor reads without bounds branches.
    const width=maxX-minX+3,height=maxY-minY+3,plane=width*height,cellCount=plane*(maxZ-minZ+3),dense=cellCount<=MAX_GRID_CELLS;
    const neighbors=shallow?FLAT_NEIGHBORS:FORWARD_NEIGHBORS;
    if(dense){
      if(this.collisionCells.length<cellCount)this.collisionCells=new Int32Array(Math.min(MAX_GRID_CELLS,2**Math.ceil(Math.log2(cellCount))));
      this.collisionCells.fill(0,0,cellCount);
      for(let n=0;n<neighbors.length;n++){const [x,y,z]=neighbors[n];this.collisionOffsets[n]=x+y*width+z*plane;}
    }else grid.clear();
    const cells=this.collisionCells,offsets=this.collisionOffsets;
    for(let n=0;n<entryCount;n++){
      const entry=entries[n],key=dense?(entry.gx-minX+1)+(entry.gy-minY+1)*width+(entry.gz-minZ+1)*plane:`${entry.gx},${entry.gy},${entry.gz}`;
      let index=dense?cells[key]:grid.get(key);
      if(!index){
        index=++bucketCount;const bucket=buckets[index-1]??={entries:[],count:0};bucket.count=0;bucket.active=false;bucket.gx=entry.gx;bucket.gy=entry.gy;bucket.gz=entry.gz;this.collisionKeys[index-1]=key;
        if(dense)cells[key]=index;else grid.set(key,index);
      }
      const bucket=buckets[index-1];bucket.entries[bucket.count++]=entry;if(entry.invMass>0)bucket.active=true;
    }
    for(let b=0;b<bucketCount;b++){
      const bucket=buckets[b],list=bucket.entries,count=bucket.count;
      if(bucket.active)for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)this.checkCollision(list[i],list[j],size,size2);
      const key=this.collisionKeys[b];
      for(let n=0;n<neighbors.length;n++){
        const delta=neighbors[n],index=dense?cells[key+offsets[n]]:grid.get(`${bucket.gx+delta[0]},${bucket.gy+delta[1]},${bucket.gz+delta[2]}`);if(!index)continue;
        const neighbor=buckets[index-1];if(!bucket.active&&!neighbor.active)continue;
        for(let i=0;i<count;i++)for(let j=0;j<neighbor.count;j++)this.checkCollision(list[i],neighbor.entries[j],size,size2);
      }
    }
  }
  // Keep the overwhelmingly common rejection path small enough to inline.
  checkCollision(entry,other,size,size2){
    if(entry.invMass+other.invMass<=0)return;
    const p=entry.p,q=other.p,r=entry.r,s=other.r,i=entry.i,j=other.i;
    if(r===s&&Math.abs(i-j)<3)return;
    const dx=p.x-q.x,dy=p.y-q.y,dz=p.z-q.z,d2=dx*dx+dy*dy+dz*dz;
    if(d2<size2)this.resolveCollision(entry,other,size,dx,dy,dz,d2);
  }
  resolveCollision(entry,other,size,dx,dy,dz,d2){
    const p=entry.p,q=other.p,r=entry.r,s=other.r,i=entry.i,j=other.i;
    let d=Math.sqrt(d2);if(d<.00001){dx=.0001;dz=.0001;d=Math.sqrt(dx*dx+dz*dz);}
    entry.spine??=this.isFeederSpine(r,i);other.spine??=this.isFeederSpine(s,j);if(entry.spine&&other.spine)return;
    p.contact=true;q.contact=true;p.contactCount=(p.contactCount||0)+1;q.contactCount=(q.contactCount||0)+1;
    if(s!==r){
      if((s.landed||q.y<=this.params.floor+this.params.radius+.025)&&p.y>=q.y-this.params.radius)r.supported=true;
      if((r.landed||p.y<=this.params.floor+this.params.radius+.025)&&q.y>=p.y-this.params.radius)s.supported=true;
    }
    const pPin=r.attached&&i===0,qPin=s.attached&&j===0;if(pPin&&qPin)return;
    if(entry.invMass+other.invMass<=0)return;
    let pvx=p.x-p.px,pvy=p.y-p.py,pvz=p.z-p.pz,qvx=q.x-q.px,qvy=q.y-q.py,qvz=q.z-q.pz;
    const inverseMass=entry.invMass+other.invMass,f=(size-d)/d,wp=entry.invMass/inverseMass,wq=other.invMass/inverseMass;
    const px=dx*f*wp,py=dy*f*wp,pz=dz*f*wp,qx=dx*f*wq,qy=dy*f*wq,qz=dz*f*wq;
    p.x+=px;p.y+=py;p.z+=pz;q.x-=qx;q.y-=qy;q.z-=qz;
    const nx=dx/d,ny=dy/d,nz=dz/d,relativeNormal=(pvx-qvx)*nx+(pvy-qvy)*ny+(pvz-qvz)*nz;
    if(relativeNormal<0){const impulse=-relativeNormal/(wp+wq);pvx+=nx*impulse*wp;pvy+=ny*impulse*wp;pvz+=nz*impulse*wp;qvx-=nx*impulse*wq;qvy-=ny*impulse*wq;qvz-=nz*impulse*wq;}
    const rvx=pvx-qvx,rvy=pvy-qvy,rvz=pvz-qvz,normalAfter=rvx*nx+rvy*ny+rvz*nz;
    const tx=rvx-normalAfter*nx,ty=rvy-normalAfter*ny,tz=rvz-normalAfter*nz;
    const frictionScale=this.contactFriction/(wp+wq);
    pvx-=tx*frictionScale*wp;pvy-=ty*frictionScale*wp;pvz-=tz*frictionScale*wp;
    qvx+=tx*frictionScale*wq;qvy+=ty*frictionScale*wq;qvz+=tz*frictionScale*wq;
    if(pPin){p.px=p.x;p.py=p.y;p.pz=p.z;}else{p.px=p.x-pvx;p.py=p.y-pvy;p.pz=p.z-pvz;}
    if(qPin){q.px=q.x;q.py=q.y;q.pz=q.z;}else{q.px=q.x-qvx;q.py=q.y-qvy;q.pz=q.z-qvz;}
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
        this.thawRope(tail);this.thawRope(r);
        this.ropes.push(tail);hits.push({x:c.x,y:c.y,z:c.z});
      }
      if(found.length&&r.attached)r.emitMaterial=this.nextMaterial();
    }
    return hits;
  }
}
