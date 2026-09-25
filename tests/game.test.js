import test from 'node:test';
import assert from 'node:assert/strict';
import {RopeWorld,STEP,SEGMENT,FLOOR,RADIUS,PILE_STOP_Y,PILE_RESUME_Y,PILE_STOP_DELAY,PILE_RESUME_DELAY,BURN_DELAY,BURN_DURATION,PHYSICS_PARAMETERS,intersection} from '../src/physics.js';
import {newSave,parseSave,purchase,selectMaterial,upgrade,feedPrice,wirePrice,rewardFor,rewardForRope,MATERIALS} from '../src/economy.js';
const length=w=>w.ropes.reduce((a,r)=>a+r.links.reduce((b,l)=>b+l,0),0);
test('swipe intersects at the precise crossing and conserves wire length',()=>{
  const w=new RopeWorld(),before=length(w),y=3.123;const hits=w.cut({x:-3,y},{x:3,y});
  assert.equal(hits.length,1);assert.ok(Math.abs(hits[0].y-y)<1e-10);assert.ok(Math.abs(length(w)-before)<1e-10);
  assert.equal(w.ropes.filter(r=>r.attached).length,1);assert.equal(w.ropes.length,2);
});
test('uncut rope accumulates, has contacts and generates no currency',()=>{
  let rewards=0;const w=new RopeWorld({onBurn:()=>rewards++});const before=length(w);
  for(let i=0;i<1800;i++)w.step();
  assert.equal(rewards,0);assert.equal(w.ropes.length,1);assert.ok(length(w)>before+15);
  const nodes=w.feeder.nodes;assert.ok(nodes.some(p=>p.y<FLOOR+.2));
  assert.ok(nodes.every(p=>p.y>=FLOOR+RADIUS-1e-8));
  assert.ok(Math.max(...nodes.map(p=>Math.abs(p.x)))>.3,'rope folds sideways');
  for(const p of nodes)assert.ok(Number.isFinite(p.x+p.y+p.z));
});
test('cut fragment waits after landing, burns, earns once and disappears',()=>{
  const landed=[];const w=new RopeWorld({onBurn:r=>landed.push(r.id)});
  w.cut({x:-3,y:3.123},{x:3,y:3.123});const id=w.ropes.find(r=>!r.attached).id;
  assert.equal(landed.length,0);
  for(let i=0;i<600&&!w.ropes.find(r=>r.id===id)?.landed;i++)w.step();
  const piece=w.ropes.find(r=>r.id===id);assert.ok(piece?.landed);assert.equal(landed.length,0);
  for(let i=0;i<Math.floor((BURN_DELAY-.2)/STEP);i++)w.step();
  assert.ok(w.ropes.some(r=>r.id===id));assert.equal(piece.fade,0);assert.equal(landed.length,0);
  for(let i=0;i<Math.ceil((BURN_DURATION+.3)/STEP);i++)w.step();
  assert.deepEqual(landed,[id]);assert.ok(!w.ropes.some(r=>r.id===id));
});
test('a multi-crossing swipe splits coiled wire and preserves length',()=>{
  const w=new RopeWorld();const r=w.feeder;
  r.nodes=[{x:-1,y:4,z:0},{x:1,y:3,z:0},{x:-1,y:2,z:0},{x:1,y:1,z:0}].map(p=>({...p,px:p.x,py:p.y,pz:0}));r.links=[Math.sqrt(5),Math.sqrt(5),Math.sqrt(5)];r.linkMaterials=['gold','gold','gold'];
  const before=length(w),hits=w.cut({x:0,y:5},{x:0,y:0});assert.equal(hits.length,3);assert.equal(w.ropes.length,4);assert.ok(Math.abs(length(w)-before)<1e-9);
});
test('changing rotation only changes newly emitted wire, preserving existing material',()=>{const w=new RopeWorld();const old=w.feeder.linkMaterials.length;w.setRotation(['pink']);assert.equal(w.feeder.emitMaterial,'pink');assert.ok(w.feeder.linkMaterials.every(id=>id==='gold'));for(let i=0;i<120;i++)w.step();assert.ok(w.feeder.linkMaterials.includes('pink'));assert.deepEqual(w.feeder.linkMaterials.slice(-old),Array(old).fill('gold'));});
test('purchased sources all grow and cut independently',()=>{const w=new RopeWorld();w.setWireCount(3,6.5,true);assert.equal(w.feeders.length,3);assert.equal(w.feeders[1].experimentalShader,true);const before=w.feeders.map(r=>r.links.reduce((a,b)=>a+b,0));for(let i=0;i<120;i++)w.step();for(let i=0;i<3;i++)assert.ok(w.feeders[i].links.reduce((a,b)=>a+b,0)>before[i]+1);const hits=w.cut({x:-3,y:3.123},{x:3,y:3.123});assert.equal(hits.length,3);assert.equal(w.feeders.length,3);assert.equal(w.ropes.filter(r=>!r.attached).length,3);assert.ok(w.ropes.some(r=>!r.attached&&r.sourceIndex===1&&r.experimentalShader));w.setRotation(['silver']);assert.equal(w.feeders.length,3);assert.ok(w.feeders.every(r=>r.emitMaterial==='silver'));});
test('additional wire upgrades grow in price, have no fixed cap and persist',()=>{const s=newSave();assert.equal(wirePrice(s),1000);assert.equal(upgrade(s,'wire'),false);s.coins=Number.MAX_SAFE_INTEGER;s.wireCount=100;const cost=wirePrice(s),before=s.coins;assert.equal(cost,Number.MAX_SAFE_INTEGER);assert.equal(upgrade(s,'wire'),true);assert.equal(s.wireCount,101);assert.equal(s.coins,before-cost);assert.equal(parseSave(JSON.stringify(s)).wireCount,101);assert.equal(parseSave('{"version":1}').wireCount,1);});
test('purchase is atomic, cannot overspend and never charges twice',()=>{const s=newSave();assert.equal(purchase(s,'silver'),false);assert.equal(s.coins,0);s.coins=1200;assert.equal(purchase(s,'silver'),true);assert.equal(s.coins,200);assert.equal(purchase(s,'silver'),true);assert.equal(s.coins,200);assert.equal(s.selected,'silver');assert.equal(purchase(s,'invalid'),false);});
test('feed upgrades have higher prices and no fixed level cap',()=>{const s=newSave();assert.equal(feedPrice(s),500);s.coins=1e12;for(let i=0;i<10;i++)assert.ok(upgrade(s,'feed'));assert.equal(s.feedLevel,10);assert.equal(upgrade(s,'invalid'),false);});
test('save restores purchases and rejects corrupt or impossible values',()=>{const s=newSave();s.coins=1500;assert.ok(purchase(s,'silver'));s.cuts=12;assert.deepEqual(parseSave(JSON.stringify(s)),s);assert.deepEqual(parseSave('{'),newSave());const bad=parseSave(JSON.stringify({version:1,coins:-30,owned:['fake'],selected:'fake',feedLevel:999}));assert.equal(bad.coins,0);assert.equal(bad.selected,'gold');assert.equal(bad.feedLevel,999);});
test('each paid material increases income for the same length',()=>{let prev=0;for(const m of MATERIALS){const reward=rewardFor(4,m.id);assert.ok(reward>prev);prev=reward;}});
test('parallel / missed swipes do not cut',()=>{assert.equal(intersection({x:0,y:0},{x:1,y:1},{x:0,y:2},{x:1,y:3}),null);const w=new RopeWorld();assert.equal(w.cut({x:2,y:5},{x:2,y:0}).length,0);});
test('dense collision correction does not inject artificial velocity',()=>{const point=x=>({x,y:0,z:0,px:x,py:0,pz:0}),w=new RopeWorld();w.ropes=[{nodes:[point(0)],fade:0,attached:false,landed:true},{nodes:[point(RADIUS)],fade:0,attached:false,landed:true}];w.collide();for(const r of w.ropes)for(const p of r.nodes){assert.ok(Math.abs(p.x-p.px)<1e-12);assert.ok(Math.abs(p.y-p.py)<1e-12);assert.ok(Math.abs(p.z-p.pz)<1e-12);}});
test('dense contacts remove closing speed and damp tangential sliding',()=>{const point=(x,px,vy)=>({x,y:0,z:0,px,py:-vy,pz:0}),w=new RopeWorld(),a=point(0,-.02,.03),b=point(RADIUS,RADIUS+.02,-.01),before=.04;w.ropes=[{nodes:[a],fade:0,attached:false,landed:true},{nodes:[b],fade:0,attached:false,landed:true}];w.collide();assert.ok(Math.abs((a.x-a.px)-(b.x-b.px))<1e-12);const after=Math.abs((a.y-a.py)-(b.y-b.py));assert.ok(after>0&&after<before);});
test('collision broad phase resolves contacts across neighboring cells',()=>{const size=RADIUS*2,point=x=>({x,y:0,z:0,px:x,py:0,pz:0}),w=new RopeWorld(),a=point(size-.001),b=point(size+.001);w.ropes=[{nodes:[a],fade:0,attached:false,landed:true},{nodes:[b],fade:0,attached:false,landed:true}];w.collide();assert.equal(a.contact,true);assert.equal(b.contact,true);assert.ok(Math.abs(a.x-b.x)>=size-1e-12);});
test('pile pressure progressively adds mass and damps the rope tail',()=>{const w=new RopeWorld(),point=contactCount=>({x:0,y:FLOOR+RADIUS,z:0,px:-.1,py:FLOOR+RADIUS-.1,pz:-.1,contactCount}),nodes=[point(8),point(8),point(8),point(8)],free=point(0),rope={nodes,fade:0,attached:true},freeRope={nodes:[free],fade:0,attached:false};w.ropes=[rope,freeRope];const speed=p=>Math.hypot(p.x-p.px,p.y-p.py,p.z-p.pz),freeBefore=speed(free),middleMass=w.collisionInverseMass(rope,1,nodes[1]),tailMass=w.collisionInverseMass(rope,3,nodes[3]);w.stabilizePileVelocities();assert.ok(speed(nodes[3])<speed(nodes[1]));assert.equal(speed(free),freeBefore);assert.ok(tailMass<middleMass);});
test('long uncut settled tails progressively bake out of the active solver',()=>{const w=new RopeWorld({parameters:{tailBakeStartNodes:10,tailBakeMinNodes:4,tailBakeDelay:.1,tailBakeSpeed:.1}}),nodes=Array.from({length:12},(_,i)=>({x:i*.01,y:FLOOR+RADIUS,z:0,px:i*.01,py:FLOOR+RADIUS,pz:0,contact:true,settleTime:.2})),rope={nodes,attached:true,fade:0};w.ropes=[rope];w.updateFrozenTails(STEP);assert.notEqual(nodes[2].frozen,true);assert.ok(nodes.slice(3).every(p=>p.frozen));assert.equal(w.collisionInverseMass(rope,11,nodes[11]),0);});
test('baked tails remain solid collision shells and thaw when cut',()=>{const w=new RopeWorld(),fixed={x:0,y:0,z:0,px:0,py:0,pz:0,frozen:true},moving={x:RADIUS,y:0,z:0,px:RADIUS,py:0,pz:0};w.ropes=[{nodes:[fixed],fade:0,attached:false,landed:true},{nodes:[moving],fade:0,attached:false,landed:true}];w.collide();assert.equal(fixed.x,0);assert.ok(moving.x>RADIUS);const cutWorld=new RopeWorld(),rope=cutWorld.feeder;rope.nodes.slice(2).forEach(p=>p.frozen=true);cutWorld.cut({x:-3,y:3.123},{x:3,y:3.123});assert.ok(cutWorld.ropes.every(r=>r.nodes.every(p=>p.frozen!==true)));});
test('pile friction, thicker wires and reduced scene depth use stable defaults',()=>{assert.equal(PHYSICS_PARAMETERS.floorFriction,.025);assert.equal(PHYSICS_PARAMETERS.wireFriction,.12);assert.equal(PHYSICS_PARAMETERS.radius,.08712);assert.equal(PHYSICS_PARAMETERS.depthHalfWidth,.2175);const state=new RopeWorld().physicsSnapshot();assert.equal(state.floorFriction,PHYSICS_PARAMETERS.floorFriction);assert.equal(state.wireFriction,PHYSICS_PARAMETERS.wireFriction);assert.equal(state.radius,.08712);assert.equal(state.depthHalfWidth,.2175);assert.equal(state.stepsPerSecond,120);});
test('dense solver keeps multiple collision passes',()=>{const w=new RopeWorld({parameters:{denseThreshold:0,denseSolverPasses:6}});let calls=0;w.collide=()=>calls++;w.step();assert.equal(calls,4);});
test('runtime physics parameters and feeder count are mutable',()=>{const world=new RopeWorld({wireCount:3,parameters:{gravity:3,floorFriction:.08,fixedStep:.01}});assert.equal(world.params.gravity,3);assert.equal(world.physicsSnapshot().floorFriction,.08);assert.equal(world.physicsSnapshot().stepsPerSecond,100);world.setParameters({gravity:7});world.setWireCount(1);assert.equal(world.params.gravity,7);assert.equal(world.feeders.length,1);});
test('overlapping feeder spines leave the outlet without colliding',()=>{const w=new RopeWorld();w.ropes=[];const a=w.addFeeder('gold',.5,0,0),b=w.addFeeder('silver',.5,0,0);b.nodes=a.nodes.map(p=>({...p}));const before=b.nodes.map(p=>({...p}));w.collide();assert.deepEqual(b.nodes,before);assert.ok([...a.nodes,...b.nodes].every(p=>p.contact!==true));});
test('fragment landing on another piece also starts its burn timer',()=>{
  const w=new RopeWorld();w.ropes=[];
  const bottom=w.addFeeder('gold',.5);bottom.attached=false;bottom.landed=true;bottom.age=1;
  const top=w.addFeeder('gold',.5);top.attached=false;top.age=1;
  for(const [r,height]of [[bottom,FLOOR+RADIUS],[top,FLOOR+RADIUS*2.8]]){
    r.nodes.forEach((p,i)=>{p.x=p.px=i*.14;p.y=p.py=height;p.z=p.pz=0;});
  }
  w.step();assert.equal(top.landed,true);assert.equal(top.restTime,0);
});
test('buying and selecting a material replaces the previous selection without extra charge',()=>{
  const s=newSave();s.coins=1000000;purchase(s,'pink');purchase(s,'silver');assert.deepEqual(s.activeMaterials,['silver']);assert.equal(s.selected,'silver');
  const coins=s.coins;assert.ok(selectMaterial(s,'pink'));assert.deepEqual(s.activeMaterials,['pink']);assert.equal(s.selected,'pink');
  assert.ok(selectMaterial(s,'pink'));assert.deepEqual(s.activeMaterials,['pink'],'reselecting never leaves zero materials');assert.equal(s.coins,coins);
  assert.equal(selectMaterial(s,'lava'),false);assert.deepEqual(s.activeMaterials,['pink']);assert.equal(s.selected,'pink');assert.deepEqual(parseSave(JSON.stringify(s)),s);
});
test('empty rotation pauses extrusion and can resume without deleting wire',()=>{const w=new RopeWorld();w.setRotation([]);const before=length(w);for(let i=0;i<30;i++)w.step();assert.equal(length(w),before);assert.equal(w.ropes.length,1);w.setRotation(['silver']);for(let i=0;i<30;i++)w.step();assert.ok(length(w)>before);});
test('extrusion continues above the former physical node budget',()=>{const w=new RopeWorld(),feeder=w.feeder;w.ropes.push({nodes:Array.from({length:1000},(_,i)=>({x:i,y:0,z:0,px:i,py:0,pz:0})),links:[],linkMaterials:[],attached:false,landed:false,restTime:0,fade:.1,age:0});feeder.links[0]=SEGMENT*2;const before=feeder.nodes.length;w.step();assert.ok(feeder.nodes.length>before);});
test('vertical feeder strands do not count as a full pile',()=>{const w=new RopeWorld(),r=w.feeder;r.nodes.slice(0,5).forEach(p=>p.contact=true);assert.equal(w.measurePileHeight(),FLOOR);w.updatePileState(PILE_STOP_DELAY+STEP);assert.equal(w.extrusionBlocked,false);});
test('a stable high pile stops every feeder and resumes below hysteresis',()=>{const w=new RopeWorld({wireCount:3}),points=[-.2,0,.2].map(x=>({x,y:PILE_STOP_Y+.05,z:0,px:x,py:PILE_STOP_Y+.05,pz:0,contact:true}));w.ropes.push({nodes:points,links:[.2,.2],linkMaterials:['gold','gold'],attached:false,landed:true,restTime:0,fade:0,age:1});w.updatePileState(PILE_STOP_DELAY+STEP);assert.equal(w.extrusionBlocked,true);assert.ok(w.pileHeight>=PILE_STOP_Y);const before=w.feeders.map(r=>r.links[0]);w.step();assert.deepEqual(w.feeders.map(r=>r.links[0]),before);for(const p of points){p.y=p.py=PILE_RESUME_Y-.05;p.contact=true;}w.updatePileState(PILE_RESUME_DELAY+STEP);assert.equal(w.extrusionBlocked,false);});
test('pile hysteresis does not chatter between stop and resume levels',()=>{const w=new RopeWorld(),y=(PILE_STOP_Y+PILE_RESUME_Y)/2,points=[-.2,0,.2].map(x=>({x,y,z:0,px:x,py:y,pz:0,contact:true}));w.ropes.push({nodes:points,links:[.2,.2],linkMaterials:['gold','gold'],attached:false,landed:true,restTime:0,fade:0,age:1});w.extrusionBlocked=true;w.updatePileState(PILE_RESUME_DELAY*2);assert.equal(w.extrusionBlocked,true);});
test('source generation and cut cycles use all selected materials in order',()=>{const w=new RopeWorld({materials:['gold','pink','silver'],wireCount:3});assert.deepEqual(w.feeders.map(r=>r.material),['gold','pink','silver']);assert.deepEqual([w.nextMaterial(),w.nextMaterial(),w.nextMaterial(),w.nextMaterial()],['gold','pink','silver','gold']);w.setRotation(['pink','silver']);assert.deepEqual(w.feeders.map(r=>r.emitMaterial),['pink','silver','pink']);assert.ok(w.rotation.every(id=>id!=='gold'));});
test('mixed fragments retain material-specific value across cuts',()=>{const w=new RopeWorld();const r=w.feeder;r.linkMaterials=r.links.map((_,i)=>i%2?'silver':'gold');const before=r.links.reduce((s,l,i)=>s+l*(r.linkMaterials[i]==='silver'?2:1),0);w.cut({x:-3,y:3.123},{x:3,y:3.123});const after=w.ropes.reduce((s,r)=>s+r.links.reduce((sum,l,i)=>sum+l*(r.linkMaterials[i]==='silver'?2:1),0),0);assert.ok(Math.abs(before-after)<1e-9);assert.equal(rewardForRope({links:[1,2],linkMaterials:['gold','pink']}),200);});
test('legacy saves collapse multiple or empty selections to one owned material',()=>{
  for(const version of [1,2]){
    const old={version,coins:500,owned:['gold','pink','silver'],selected:'silver',activeMaterials:['gold','pink','silver'],auto:true};
    const s=parseSave(JSON.stringify(old));assert.deepEqual(s.activeMaterials,['silver']);assert.equal(s.selected,'silver');assert.equal(s.coins,500);assert.deepEqual(s.owned,old.owned);assert.equal('auto' in s,false);
    old.selected='invalid';assert.deepEqual(parseSave(JSON.stringify(old)).activeMaterials,['gold']);
    old.selected='silver';old.activeMaterials=['pink'];assert.deepEqual(parseSave(JSON.stringify(old)).activeMaterials,['pink']);
    old.activeMaterials=[];assert.deepEqual(parseSave(JSON.stringify(old)).activeMaterials,['silver']);
    old.owned=['gold'];assert.deepEqual(parseSave(JSON.stringify(old)).activeMaterials,['gold']);
  }
});
test('more than 100 sources fit the reduced depth and keep finite physics',()=>{const w=new RopeWorld({wireCount:101,materials:['gold','silver','pink']});assert.equal(w.feeders.length,101);assert.equal(new Set(w.feeders.map(r=>`${r.anchorX},${r.anchorZ}`)).size,101);assert.ok(w.feeders.every(r=>Math.abs(r.anchorZ)<=w.params.depthHalfWidth));for(let i=0;i<5;i++)w.step(1/60);for(const r of w.ropes)for(const p of r.nodes)assert.ok(Number.isFinite(p.x+p.y+p.z));});
