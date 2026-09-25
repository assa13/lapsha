import test from 'node:test';
import assert from 'node:assert/strict';
import {MATERIALS,MODIFIERS,newSave,parseSave,upgrade,modifierPrice,productionRate,rewardForRope,claimOffline,prestige,autoInterval,burnDelay} from '../src/economy.js';
import {RopeWorld,RADIUS} from '../src/physics.js';
import {createWireMaterial} from '../src/wire-materials.js';

test('retired purchases and selection migrate to their replacements exactly once',()=>{
 const s=parseSave(JSON.stringify({version:2,coins:123,earned:1e6,owned:['gold','molten','stardust','diamond'],activeMaterials:['diamond'],selected:'diamond'}));
 assert.deepEqual(s.owned,['gold','opal','nebula','petrol']);assert.deepEqual(s.activeMaterials,['petrol']);assert.equal(s.selected,'petrol');assert.equal(s.coins,123);assert.deepEqual(parseSave(JSON.stringify(s)),s);
 for(const id of ['molten','stardust','diamond','chromatic'])assert.ok(!MATERIALS.some(m=>m.id===id));
});
test('modifier purchases charge once per level, enforce prerequisites and preserve bounded levels',()=>{
 const s=newSave();assert.equal(upgrade(s,'yield'),false);s.coins=1e10;assert.equal(upgrade(s,'turbo'),false);upgrade(s,'auto');
 for(const m of MODIFIERS){for(const price of m.prices){const before=s.coins;assert.equal(modifierPrice(s,m.id),price);assert.ok(upgrade(s,m.id));assert.equal(s.coins,before-price);}const before=s.coins;assert.equal(upgrade(s,m.id),false);assert.equal(s.coins,before);assert.equal(modifierPrice(s,m.id),null);}
 assert.deepEqual(parseSave(JSON.stringify(s)),s);const invalid=parseSave(JSON.stringify({...s,yieldLevel:999,burnLevel:-1,turboLevel:'bad'}));assert.equal(invalid.yieldLevel,5);assert.equal(invalid.burnLevel,0);assert.equal(invalid.turboLevel,0);
 s.runEarned=5e6;prestige(s);assert.ok(MODIFIERS.every(m=>s[m.field]===0));
});
test('income modifier applies consistently to physical rope and offline production',()=>{
 const s=newSave(),base=productionRate(s);s.yieldLevel=5;assert.equal(productionRate(s),base*1.75);assert.equal(rewardForRope({links:[1],material:'gold'},s),14);
 s.autoLevel=1;s.lastSeen=1000;assert.equal(claimOffline(s,61000).amount,Math.floor(base*1.75*.15*60));
});
test('turbo shortens the real automation interval and catalyst makes landed pieces burn sooner',()=>{
 const s=newSave();s.autoLevel=3;s.turboLevel=3;s.burnLevel=3;assert.ok(Math.abs(autoInterval(s)-7.29)<1e-10);assert.ok(Math.abs(burnDelay(s)-1.2)<1e-10);assert.equal(RADIUS,.08712);
 let reward=0;const w=new RopeWorld({onBurn:()=>reward++,parameters:{burnDelay:burnDelay(s)}});w.setRotation([]);const r=w.feeder;r.attached=false;r.landed=true;r.restTime=1.3;w.step();assert.ok(r.fade>0);
 for(let i=0;i<100;i++)w.step();assert.equal(reward,1);
});
test('restored electric shader shares one noise texture and clock with independent burn uniforms',()=>{
 const time={value:5},a=createWireMaterial('electric',time),b=createWireMaterial('electric',time,7);
 assert.ok(a.isShaderMaterial);assert.ok(a.fragmentShader.includes('dualFbm'));assert.ok(a.fragmentShader.includes('rings(p)'));assert.equal(a.uniforms.uNoise.value,b.uniforms.uNoise.value);assert.equal(a.uniforms.uWireTime,time);assert.equal(b.uniforms.uWirePhase.value,7);
 a.uniforms.uWireBurn.value=.5;assert.equal(b.uniforms.uWireBurn.value,0);a.dispose();b.dispose();
});
