import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {RopeWorld, RADIUS, PILE_STOP_Y} from '../src/physics.js';
import {GameScene} from '../src/scene.js';
import {MATERIALS} from '../src/economy.js';

const point=(x,y,z=0)=>({x,y,z,px:x,py:y,pz:z});
const body=(p,id)=>({id,nodes:[p],fade:0,attached:false,landed:false});

test('flat, deep and sparse collision grids find every neighboring contact exactly once',()=>{
  for(const parameters of [{},{depthHalfWidth:2},{radius:.01,depthHalfWidth:2,wallHalfWidth:10}]){
    const w=new RopeWorld({parameters}),size=w.params.radius*2,points=[];let seed=7;
    const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
    for(let i=0;i<180;i++)points.push(point((random()-.5)*size*8,(random()-.5)*size*8,(random()-.5)*size*5));
    // Negative coordinates, cell boundaries, and a wide arena that exercises
    // the sparse fallback without allocating a buffer proportional to its size.
    points.push(point(-size-.001,-size-.001,-size-.001),point(-size+.001,-size+.001,-size+.001),point(-9,-6,-1),point(9,6,1));
    w.ropes=points.map(body);const found=new Set(),expected=new Set();
    w.checkCollision=(a,b,_size,size2)=>{const p=a.p,q=b.p;if((p.x-q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2<size2){const key=[a.r.id,b.r.id].sort((a,b)=>a-b).join(':');assert.ok(!found.has(key),'candidate pair is visited once');found.add(key);}};
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const p=points[i],q=points[j];if((p.x-q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2<size*size)expected.add(`${i}:${j}`);}
    w.collide();assert.deepEqual(found,expected);
    assert.ok(w.collisionCells.length<=1<<20);
  }
});

test('sleeping cells skip internal collisions and still stop moving wire',()=>{
  const w=new RopeWorld(),a={...point(0,0),frozen:true},b={...point(RADIUS,0),frozen:true};w.ropes=[body(a,1),body(b,2)];
  let checks=0;const check=w.checkCollision;w.checkCollision=function(...args){checks++;return check.apply(this,args);};
  w.collide();assert.equal(checks,0);
  const moving=point(0,RADIUS);w.ropes.push(body(moving,3));w.collide();assert.ok(checks>0);assert.ok(moving.y>RADIUS);assert.equal(a.x,0);assert.equal(b.x,RADIUS);
});

test('sleeping contacts still count toward the pile stop height',()=>{
  const w=new RopeWorld(),r=w.feeder,y=PILE_STOP_Y+.1;w.setRotation([]);
  r.nodes=[point(0,w.params.top),...[-.2,0,.2].map(x=>({...point(x,y),frozen:true,contact:true}))];r.links=[1,.2,.2];r.linkMaterials=['gold','gold','gold'];
  w.step();assert.equal(w.pileHeight,y);assert.ok(r.nodes.slice(1).every(p=>p.contact));
});

test('collision pools release removed ropes while retaining reusable storage',()=>{
  const w=new RopeWorld();w.collide();const cells=w.collisionCells;w.ropes=[];w.collide();assert.equal(w.collisionActiveCount,0);assert.ok(w.collisionEntries.every(e=>e.p===null&&e.r===null));assert.equal(w.collisionCells,cells);
});

// Geometry validation needs real Three.js buffers, but no browser/GPU context.
function scene(){
  const s=Object.create(GameScene.prototype);s.meshes=new Map();s.angleCache=new Map();s.play=new THREE.Group();s.wireTextureStyle='default';s.experimentalMaterials=new Set();
  s.materials=Object.fromEntries(MATERIALS.map(m=>[m.id,new THREE.MeshStandardMaterial()]));
  s.embers=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(5400),3)));
  return s;
}
function wire(n=60){const w=new RopeWorld(),r=w.feeder;r.nodes=Array.from({length:n},(_,i)=>point(Math.sin(i*.15),3-i*.08,Math.cos(i*.2)*.1));r.links=Array(n-1).fill(.14);r.linkMaterials=r.links.map((_,i)=>i<20?'silver':'gold');return r;}
function equalFresh(s,r){
  const fresh=scene();fresh.syncRopes([r]);const a=s.meshes.get(r.id),b=fresh.meshes.get(r.id),n=a.userData.rings*a.userData.radial;
  for(const [name,components]of [['position',3],['normal',3],['uv',2]])assert.deepEqual(a.geometry.attributes[name].array.slice(0,n*components),b.geometry.attributes[name].array.slice(0,n*components),name);
  assert.deepEqual(a.geometry.groups,b.geometry.groups);assert.deepEqual(a.geometry.drawRange,b.geometry.drawRange);
}

test('stationary wire skips vertex uploads; a local movement matches a full rebuild',()=>{
  const s=scene(),r=wire();s.syncRopes([r]);const mesh=s.meshes.get(r.id),pos=mesh.geometry.attributes.position,version=pos.version;
  pos.clearUpdateRanges();s.syncRopes([r]);assert.equal(pos.version,version);
  r.nodes[22].x+=.1;s.syncRopes([r]);assert.equal(pos.version,version+1);assert.ok(pos.updateRanges[0].count<r.nodes.length*3*6*3);equalFresh(s,r);
  // Thawing/moving the far end must also invalidate its cached surface.
  r.nodes.at(-1).y-=.2;s.syncRopes([r]);equalFresh(s,r);
});

test('growth reuses geometry and cuts/burning preserve material groups and shape',()=>{
  const s=scene(),r=wire();s.syncRopes([r]);const geometry=s.meshes.get(r.id).geometry;
  r.nodes.splice(1,0,point(.1,2.9));r.links.unshift(.14);r.linkMaterials.unshift('pink');s.syncRopes([r]);assert.equal(s.meshes.get(r.id).geometry,geometry);equalFresh(s,r);
  r.nodes=r.nodes.slice(0,24);r.links=r.links.slice(0,23);r.linkMaterials=r.linkMaterials.slice(0,23);s.syncRopes([r]);equalFresh(s,r);
  r.fade=.4;s.syncRopes([r]);equalFresh(s,r);
  let disposed=0;geometry.addEventListener('dispose',()=>disposed++);s.syncRopes([]);assert.equal(s.meshes.size,0);assert.equal(disposed,1);
});

test('changing physics radius also resizes cached stationary wire and burning fragments',()=>{
  const s=scene(),r=wire();s.syncRopes([r]);const mesh=s.meshes.get(r.id),geometry=mesh.geometry;
  const radiusAtRing=()=>{const pos=geometry.attributes.position,p=mesh.userData.samples[20],k=20*mesh.userData.radial;return Math.hypot(pos.getX(k)-p.x,pos.getY(k)-p.y,pos.getZ(k)-p.z);};
  assert.ok(Math.abs(radiusAtRing()-RADIUS)<1e-6);
  s.syncRopes([r],.11);assert.equal(mesh.geometry,geometry);assert.ok(Math.abs(radiusAtRing()-.11)<1e-6);
  r.fade=.4;s.syncRopes([r],.11);assert.ok(Math.abs(radiusAtRing()-.055)<1e-6);
});

test('second source uses its selected material instead of an unrelated electric override',()=>{
  const s=scene(),w=new RopeWorld({wireCount:2});s.syncRopes(w.ropes);const mesh=s.meshes.get(w.feeders[1].id);
  assert.equal(mesh.material[0].userData.materialId,'gold');
  for(let i=0;i<MATERIALS.length;i++)assert.equal(mesh.material[i].userData.materialId,MATERIALS[i].id);
});

test('geometry reallocates on LOD changes and uses valid indices beyond 65535 vertices',()=>{
  const s=scene(),small=wire();s.syncRopes([small]);const before=s.meshes.get(small.id).geometry,big=wire(17000);s.syncRopes([small,big]);
  const a=s.meshes.get(small.id),b=s.meshes.get(big.id);assert.notEqual(a.geometry,before);assert.equal(a.userData.radial,4);assert.ok(b.geometry.index.array instanceof Uint32Array);
  for(const mesh of [a,b]){const limit=mesh.userData.rings*mesh.userData.radial,indices=mesh.geometry.index.array;for(let i=0;i<mesh.geometry.drawRange.count;i++)assert.ok(indices[i]<limit);}
  s.syncRopes([small]);equalFresh(s,small);
});
