import test from 'node:test';
import assert from 'node:assert/strict';
import {requestGraphicsContext} from '../src/graphics.js';
import {CanvasScene} from '../src/canvas-scene.js';

test('graphics uses the first available WebGL 2 profile without creating extra contexts',()=>{
  const calls=[],context={};
  const result=requestGraphicsContext({getContext(type,attributes){calls.push({type,attributes});return context;}});
  assert.equal(result.context,context);assert.equal(calls.length,1);
  assert.equal(calls[0].type,'webgl2');assert.equal(calls[0].attributes.powerPreference,'default');
});
test('graphics retries without multisampling and transparency when the preferred EGL config fails',()=>{
  const calls=[],context={};
  const result=requestGraphicsContext({getContext(type,attributes){calls.push(attributes);return attributes.antialias?null:context;}});
  assert.equal(result.context,context);assert.equal(result.antialias,false);assert.equal(calls.length,2);
  assert.equal(calls[1].alpha,false);assert.equal(calls[1].depth,true);assert.equal(calls[1].failIfMajorPerformanceCaveat,false);
});
test('missing or blocked drivers produce a bounded fallback instead of a Three renderer exception',()=>{
  for(const throws of [false,true]){
    let calls=0;
    assert.equal(requestGraphicsContext({getContext(){calls++;if(throws)throw new Error('driver unavailable');return null;}}),null);
    assert.equal(calls,3);
  }
});
test('Canvas fallback preserves input projection, material boundaries and the physical ropes',()=>{
  const s=Object.create(CanvasScene.prototype),strokes=[];
  s.canvas={getBoundingClientRect:()=>({left:25,top:15,width:390,height:844})};s.context={};s.wireTextureStyle='default';
  const p=s.screenToWorld(155,330),uv=s.worldToScreen(p);
  assert.ok(Math.abs(uv.x*390+25-155)<1e-9);assert.ok(Math.abs(uv.y*844+15-330)<1e-9);
  s.paint=id=>id;s.stroke=(nodes,start,end,paint,radius)=>strokes.push({start,end,paint,radius});
  const ropes=[{nodes:[{x:0,y:1},{x:0,y:0},{x:0,y:-1},{x:0,y:-2}],linkMaterials:['gold','gold','lava'],fade:0}];
  const original=structuredClone(ropes);s.drawRopes(ropes,.1,0);
  assert.deepEqual(strokes,[{start:0,end:2,paint:'gold',radius:.1},{start:2,end:3,paint:'lava',radius:.1}]);
  assert.deepEqual(ropes,original);
  s.setWireTexture('electric');strokes.length=0;s.drawRopes(ropes,.1,0);assert.ok(strokes.every(s=>s.paint==='electric'));
  ropes[0].fade=.4;strokes.length=0;s.drawRopes(ropes,.1,0);assert.ok(strokes.every(s=>s.radius<.1&&s.paint==='#ffa633'));
});
