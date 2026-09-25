import test from 'node:test';
import assert from 'node:assert/strict';
import {MATERIALS,newSave,parseSave,purchase,upgrade,autoPrice,offlinePrice,feedPrice,wirePrice,claimOffline,productionRate,creditIncome,rewardForRope,prestige,prestigeGain,permanentBonus,PRESTIGE_THRESHOLD,OFFLINE_HOURS,OFFLINE_EFFICIENCY} from '../src/economy.js';
import {balanceReport} from '../scripts/balance.mjs';
import {createWireMaterial} from '../src/wire-materials.js';

test('all previously paid content costs more and the catalogue has 15 distinct animated styles',()=>{
  const old=[0,120,420,1200,3200,6000];for(let i=1;i<old.length;i++)assert.ok(MATERIALS[i].price>old[i]);
  assert.equal(MATERIALS.length,15);assert.equal(new Set(MATERIALS.map(m=>m.style)).size,15);assert.ok(!MATERIALS.some(m=>m.id==='chromatic'));
  for(let n=1;n<12;n++){const s=newSave();s.wireCount=n;s.feedLevel=n;assert.ok(wirePrice(s)>([0,300,1200,3600,9000][n]??600*n*n));assert.ok(feedPrice(s)>180*2.5**n);}
});

test('legacy progress is preserved while new mechanics initialize safely',()=>{
  const s=parseSave(JSON.stringify({version:1,coins:32000,earned:120000,cuts:40,owned:['gold','pink'],activeMaterials:['pink'],feedLevel:4,wireCount:3,sound:true,auto:true}));
  assert.equal(s.version,2);assert.equal(s.coins,32000);assert.equal(s.runEarned,120000);assert.deepEqual(s.owned,['gold','pink']);assert.deepEqual(s.activeMaterials,['pink']);assert.equal(s.wireCount,3);assert.equal(s.feedLevel,4);assert.equal(s.autoLevel,0);assert.equal(s.lastSeen,0);
  assert.deepEqual(parseSave(JSON.stringify(s)),s);
});

test('automation and offline upgrades enforce affordability, prerequisites and maximum levels',()=>{
  const s=newSave();assert.equal(upgrade(s,'auto'),false);s.coins=1e8;assert.equal(upgrade(s,'offline'),false);
  for(let i=0;i<3;i++){const before=s.coins,cost=autoPrice(s);assert.equal(upgrade(s,'auto'),true);assert.equal(s.coins,before-cost);}
  const before=s.coins;assert.equal(autoPrice(s),null);assert.equal(upgrade(s,'auto'),false);assert.equal(s.coins,before);
  for(let i=0;i<3;i++)assert.ok(upgrade(s,'offline'));assert.equal(offlinePrice(s),null);assert.equal(upgrade(s,'offline'),false);assert.equal(upgrade(s,'toString'),false);
  s.autoEnabled=false;assert.equal(parseSave(JSON.stringify(s)).autoEnabled,false);
});

test('offline reward is capped, uses selected materials and permanent bonus, and pays once',()=>{
  const s=newSave();s.autoLevel=3;s.offlineLevel=2;s.wireCount=3;s.feedLevel=2;s.sparks=4;s.owned.push('silver');s.selected='silver';s.activeMaterials=['silver'];s.lastSeen=100000;
  const now=s.lastSeen+10*3600*1000,expected=Math.floor(productionRate(s)*OFFLINE_EFFICIENCY[2]*OFFLINE_HOURS[2]*3600),r=claimOffline(s,now);
  assert.equal(r.amount,expected);assert.equal(r.seconds,4*3600);assert.equal(s.coins,expected);assert.equal(s.runEarned,expected);assert.equal(claimOffline(s,now).amount,0);assert.equal(s.coins,expected);
  assert.equal(parseSave(JSON.stringify(s)).lastSeen,now);
});

test('offline reward requires an active machine, nonempty rotation and a valid elapsed interval',()=>{
  for(const change of [s=>s.autoLevel=0,s=>s.autoEnabled=false,s=>s.activeMaterials=[],s=>s.lastSeen=0,s=>s.lastSeen=999999999]){
    const s=newSave();s.autoLevel=1;s.lastSeen=100000;change(s);assert.equal(claimOffline(s,200000).amount,0);
  }
  const s=newSave();s.autoLevel=1;s.lastSeen=100000;assert.equal(claimOffline(s,110000).amount,0);
});

test('splitting the same wire into tiny fragments cannot inflate payout',()=>{
  const whole=newSave(),split=newSave();creditIncome(whole,rewardForRope({links:[1],material:'gold'},whole));
  for(let i=0;i<1000;i++)creditIncome(split,rewardForRope({links:[.001],material:'gold'},split));
  assert.equal(split.coins,whole.coins);assert.equal(split.earned,8);assert.ok(split.incomeRemainder<1e-8);
  const saved=newSave();creditIncome(saved,.4);const restored=parseSave(JSON.stringify(saved));creditIncome(restored,.6);assert.equal(restored.coins,1);
});

test('prestige resets run purchases once and retains lifetime progress and permanent sparks',()=>{
  const s=newSave();s.coins=1e7;s.earned=1e7;s.runEarned=PRESTIGE_THRESHOLD*4;s.cuts=700;s.sound=true;purchase(s,'silver');s.autoLevel=3;s.offlineLevel=2;s.feedLevel=7;s.wireCount=6;
  assert.equal(prestigeGain(s),2);assert.equal(prestige(s,10000),2);assert.equal(s.sparks,2);assert.equal(permanentBonus(s),1.5);assert.equal(s.prestiges,1);assert.equal(s.earned,1e7);assert.equal(s.cuts,700);assert.equal(s.sound,true);
  assert.deepEqual(s.owned,['gold']);assert.deepEqual(s.activeMaterials,['gold']);assert.equal(s.coins,0);assert.equal(s.runEarned,0);assert.equal(s.autoLevel,0);assert.equal(s.offlineLevel,0);assert.equal(s.feedLevel,0);assert.equal(s.wireCount,1);assert.equal(s.lastSeen,10000);assert.equal(prestige(s),0);assert.equal(s.sparks,2);
  assert.equal(rewardForRope({links:[1],material:'gold'},s),12);
});

test('shop and wire material instances share appearance programs, clock and independent burn state',()=>{
  const time={value:0};
  for(const m of MATERIALS){const preview=createWireMaterial(m.id,time),wire=createWireMaterial(m.id,time,4);
    assert.equal(preview.userData.materialId,m.id);assert.equal(wire.customProgramCacheKey(),preview.customProgramCacheKey());assert.equal(wire.userData.wireUniforms.uWireTime,time);
    wire.userData.wireUniforms.uWireBurn.value=.5;assert.equal(preview.userData.wireUniforms.uWireBurn.value,0);preview.dispose();wire.dispose();
  }
});

test('first-run balance model reaches all finite content in the agreed 6–8 active hours',()=>{
  const report=balanceReport();for(const r of report.slice(0,2)){assert.ok(r.hours>=6&&r.hours<=8,`${r.name}: ${r.hours} h`);assert.equal(Object.keys(r.milestones).filter(k=>MATERIALS.some(m=>m.id===k)).length,MATERIALS.length-1);assert.ok(r.sparks>=1);assert.ok(r.milestones.automation<=10*60);}
  assert.ok(report[2].hours>report[1].hours);
});
