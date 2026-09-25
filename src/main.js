import './style.css';
import {GameScene} from './scene.js';
import {RopeWorld,PHYSICS_DEFAULTS} from './physics.js';
import {MATERIALS,MODIFIERS,modifierPrice,incomeBonus,burnDelay,autoInterval,SAVE_KEY,LEGACY_SAVE_KEY,parseSave,purchase,selectMaterial,feedPrice,wirePrice,upgrade,rewardForRope,creditIncome,feedSpeed,autoPrice,offlinePrice,AUTO_INTERVALS,OFFLINE_HOURS,OFFLINE_EFFICIENCY,PRESTIGE_THRESHOLD,SPARK_BONUS,permanentBonus,prestigeGain,prestige,claimOffline} from './economy.js';

const $=id=>document.getElementById(id),format=n=>n>=1e9?(n/1e9).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млрд':n>=1e6?(n/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млн':Math.floor(n).toLocaleString('ru-RU');
let save;try{save=parseSave(localStorage.getItem(SAVE_KEY)??localStorage.getItem(LEGACY_SAVE_KEY));}catch{save=parseSave(null);}
const launchOffline=claimOffline(save);
const PHYSICS_SAVE_KEY='lapsha-physics-v1';
const PHYSICS_CONTROLS=[
  ['feedSpeed','Скорость подачи',.05,10,.05],['wireCount','Количество проводов',1,500,1],
  ['radius','Толщина провода',.01,.3,.0002],['gravity','Гравитация',0,50,.1],['turbulence','Колебание',0,2,.005],
  ['bendStiffness','Жёсткость изгиба',0,1,.01],['floorFriction','Трение пола',0,.3,.005],['wireFriction','Трение проводов',0,.5,.005],
  ['wallHalfWidth','Ширина сцены',.2,10,.05],['depthHalfWidth','Глубина сцены',.05,2,.0025]
].map(([key,label,min,max,step])=>({key,label,min,max,step,integer:step===1}));
const WIRE_TEXTURES=[['default','Игровые материалы'],...MATERIALS.map(m=>[m.id,m.name])];
function loadPhysicsSettings(){try{const value=JSON.parse(localStorage.getItem(PHYSICS_SAVE_KEY));return value&&typeof value==='object'?value:{};}catch{return {};}}
const storedPhysics=loadPhysicsSettings();
const storedParameters={};for(const spec of PHYSICS_CONTROLS){if(spec.key==='feedSpeed'||spec.key==='wireCount')continue;let value=storedPhysics.parameters?.[spec.key];if(!Number.isFinite(value))continue;value=Math.max(spec.min,Math.min(spec.max,value));storedParameters[spec.key]=spec.integer?Math.round(value):value;}
if(storedParameters.floorFriction===.015)storedParameters.floorFriction=PHYSICS_DEFAULTS.floorFriction;
if(storedParameters.wireFriction===.03)storedParameters.wireFriction=PHYSICS_DEFAULTS.wireFriction;
if(storedParameters.radius===.066||storedParameters.radius===.0792)storedParameters.radius=PHYSICS_DEFAULTS.radius;
if(storedParameters.depthHalfWidth===.58||storedParameters.depthHalfWidth===.29)storedParameters.depthHalfWidth=PHYSICS_DEFAULTS.depthHalfWidth;
let scene,mode='game',detailIndex=-1,shopPage=0,paused=false,resetting=false,toastTimer,saveTimer,audioContext,awaySince=0,autoElapsed=0;
function persist(){if(resetting)return;if(!awaySince)save.lastSeen=Date.now();try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{notify('Браузер не разрешает сохранение. Прогресс доступен до закрытия.');}}
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);}
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function tone(frequency,duration=.1,type='sine',volume=.035){if(!save.sound)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(frequency,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.55,audioContext.currentTime+duration);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch{}}
function reward(rope){const amount=creditIncome(save,rewardForRope(rope,save));queueSave();updateHUD();if(!amount)return;
  const p=rope.nodes.reduce((a,b)=>a.y<b.y?a:b),s=scene.worldToScreen(p),el=document.createElement('span');el.className='reward';el.textContent=`+${format(amount)}`;el.style.left=`${Math.max(.13,Math.min(.87,s.x))*100}%`;el.style.top=`${s.y*100}%`;$('rewards').append(el);setTimeout(()=>el.remove(),1200);tone(900,.18);}
const feedSpeedSpec=PHYSICS_CONTROLS.find(spec=>spec.key==='feedSpeed'),wireCountSpec=PHYSICS_CONTROLS.find(spec=>spec.key==='wireCount');
let feedSpeedOverride=Number.isFinite(storedPhysics.feedSpeedOverride)?Math.max(feedSpeedSpec.min,Math.min(feedSpeedSpec.max,storedPhysics.feedSpeedOverride)):null;
let wireCountOverride=Number.isFinite(storedPhysics.wireCountOverride)?Math.round(Math.max(wireCountSpec.min,Math.min(wireCountSpec.max,storedPhysics.wireCountOverride))):null;
if(wireCountOverride!==null&&wireCountOverride<save.wireCount)wireCountOverride=null;
let wireTextureStyle=WIRE_TEXTURES.some(([id])=>id===storedPhysics.wireTextureStyle)?storedPhysics.wireTextureStyle:'default';
let world=new RopeWorld({onBurn:reward,materials:save.activeMaterials,wireCount:wireCountOverride??save.wireCount,parameters:storedParameters,initialLength:.3});
const physicsInputs=new Map();
function physicsValue(value){if(typeof value==='boolean')return value?'да':'нет';if(!Number.isFinite(value))return String(value);return Number.isInteger(value)?String(value):value.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');}
function persistPhysics(){try{localStorage.setItem(PHYSICS_SAVE_KEY,JSON.stringify({parameters:world.params,feedSpeedOverride,wireCountOverride,wireTextureStyle}));}catch{notify('Не удалось сохранить параметры физики.');}}
function parameterValue(key){if(key==='feedSpeed')return world.feedSpeed;if(key==='wireCount')return world.feeders.length;return world.params[key];}
function syncPhysicsControls(){for(const {key}of PHYSICS_CONTROLS){const input=physicsInputs.get(key);if(input&&document.activeElement!==input)input.value=physicsValue(parameterValue(key));}}
function buildPhysicsControls(){for(const spec of PHYSICS_CONTROLS){const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');name.textContent=spec.label;input.type='number';input.min=spec.min;input.max=spec.max;input.step=spec.step;input.value=physicsValue(parameterValue(spec.key));input.addEventListener('input',()=>{let value=input.valueAsNumber;if(!Number.isFinite(value))return;value=Math.max(spec.min,Math.min(spec.max,value));if(spec.integer)value=Math.round(value);if(spec.key==='feedSpeed'){feedSpeedOverride=value;world.feedSpeed=value;}else if(spec.key==='wireCount'){wireCountOverride=value;world.setWireCount(value);}else{world.params[spec.key]=value;if(spec.key==='depthHalfWidth')world.setWireCount(world.feeders.length);}persistPhysics();});label.append(name,input);$('physics-controls').append(label);physicsInputs.set(spec.key,input);}for(const [id,label]of WIRE_TEXTURES){const option=document.createElement('option');option.value=id;option.textContent=label;$('physics-texture').append(option);}$('physics-texture').value=wireTextureStyle;$('physics-texture').onchange=()=>{wireTextureStyle=$('physics-texture').value;scene?.setWireTexture(wireTextureStyle);persistPhysics();};}
function setPhysicsPanel(open){$('physics-panel').hidden=!open;$('physics-toggle').setAttribute('aria-expanded',String(open));if(open)syncPhysicsControls();}
buildPhysicsControls();
function updateHUD(){
  $('coins').textContent=format(save.coins);$('material-label').textContent=`${MATERIALS.find(m=>m.id===save.selected).name} · Проводов: ${world.feeders.length}`;
  $('sound').textContent=save.sound?'Звук вкл.':'Звук выкл.';$('sound').setAttribute('aria-pressed',String(save.sound));$('sound').setAttribute('aria-label',save.sound?'Выключить звук':'Включить звук');
  $('hint').style.opacity=save.cuts>0?'0':'1';world.feedSpeed=feedSpeedOverride??feedSpeed(save);world.params.burnDelay=burnDelay(save);syncPhysicsControls();
  updateIdleStatus();if(mode!=='game')updateShop();
}
function updatePileNote(){const noMaterials=save.activeMaterials.length===0,note=$('pile-note');note.hidden=mode!=='game'||(!noMaterials&&!world.extrusionBlocked);note.textContent=noMaterials?'Выбери хотя бы один материал в магазине':'Куча достигла верха. Разрежь провода, чтобы продолжить подачу.';}
function updateShop(){
  for(const [i,m]of MATERIALS.entries()){const button=$(`material-${m.id}`),owned=save.owned.includes(m.id),active=save.activeMaterials.includes(m.id);button.hidden=Math.floor(i/6)!==shopPage;button.classList.toggle('selected',active);button.querySelector('.tag').textContent=active?'Выбран':owned?'Выбрать':format(m.price);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',`${m.name}, доход ×${m.multiplier}, ${active?'выбран':owned?'выбрать':format(m.price)+' монет'}`);}
  $('feed-upgrade').innerHTML=`Подача ${save.feedLevel+1} ур.<b>+30% · ${format(feedPrice(save))}</b>`;$('feed-upgrade').disabled=save.coins<feedPrice(save);
  $('wire-upgrade').innerHTML=`Провода ${save.wireCount}<b>+1 · ${format(wirePrice(save))}</b>`;$('wire-upgrade').disabled=save.coins<wirePrice(save);
  $('collection-count').textContent=`${save.owned.length}/${MATERIALS.length}`;$('page-label').textContent=`${shopPage+1} / ${Math.ceil(MATERIALS.length/6)}`;$('previous-page').disabled=shopPage===0;$('next-page').disabled=shopPage===Math.ceil(MATERIALS.length/6)-1;
  if(mode==='detail')updateDetail();if(mode==='workshop')updateWorkshop();
}
function setMode(next,index=-1){
  mode=next;detailIndex=index;scene.setMode(next,index);
  $('shop').hidden=next!=='shop';$('workshop').hidden=next!=='workshop';$('shop-nav').hidden=!['shop','workshop'].includes(next);
  $('collection-tab').setAttribute('aria-pressed',String(next==='shop'));$('workshop-tab').setAttribute('aria-pressed',String(next==='workshop'));
  $('hud').hidden=next!=='game';$('detail').hidden=next!=='detail';$('hint').hidden=next!=='game';
  $('shop-button').setAttribute('aria-expanded',String(next!=='game'));$('shop-button').setAttribute('aria-label',next==='game'?'Открыть магазин':'Вернуться в игру');
  $('back').setAttribute('aria-label',next==='game'?'Открыть коллекцию':'Назад');$('back').querySelector('img').src=next==='game'?'./assets/currency.png':'./assets/back.svg';
  if(next!=='game')setPhysicsPanel(false);dragging=false;updateHUD();updatePileNote();if(next==='detail')$('close-detail').focus();
}
function changePage(delta){shopPage=Math.max(0,Math.min(Math.ceil(MATERIALS.length/6)-1,shopPage+delta));scene.setShopPage(shopPage);updateShop();}
$('previous-page').onclick=()=>changePage(-1);$('next-page').onclick=()=>changePage(1);
$('collection-tab').onclick=()=>setMode('shop');$('workshop-tab').onclick=()=>setMode('workshop');
function updateIdleStatus(){
  $('auto-control').hidden=mode!=='game'||!save.autoLevel;
  $('auto-game-toggle').setAttribute('aria-checked',String(save.autoEnabled));$('auto-game-state').textContent=save.autoEnabled?'Вкл.':'Выкл.';
}
function updateWorkshop(){
  $('spark-bonus').textContent=`×${permanentBonus(save).toLocaleString('ru-RU')} · ${save.sparks} искр`;
  $('run-earned').textContent=`За этот забег: ${format(save.runEarned)} монет`;
  const ac=autoPrice(save),oc=offlinePrice(save),gain=prestigeGain(save);
  $('auto-description').textContent=save.autoLevel?`Ур. ${save.autoLevel}/3 · Разрез каждые ${autoInterval(save).toFixed(1).replace(/\.0$/,'')} с.`:'Режет сам каждые 24 с. Открывает офлайн-доход.';
  $('auto-upgrade').disabled=ac===null||save.coins<ac;$('auto-upgrade').textContent=ac===null?'Максимум':`${save.autoLevel?'Улучшить':'Купить'} · ${format(ac)}`;
  $('auto-toggle').hidden=!save.autoLevel;$('auto-toggle').textContent=save.autoEnabled?'Включён ✓':'Включить';$('auto-toggle').setAttribute('aria-pressed',String(save.autoEnabled));
  $('offline-description').textContent=save.autoLevel?`Ур. ${save.offlineLevel}/3 · До ${OFFLINE_HOURS[save.offlineLevel]} ч, ${Math.round(OFFLINE_EFFICIENCY[save.offlineLevel]*100)}% дохода вне игры.`:'Накопление вне игры. Нужен автонарезчик.';
  $('offline-upgrade').disabled=!save.autoLevel||oc===null||save.coins<oc;$('offline-upgrade').textContent=oc===null?'Максимум':`Улучшить · ${format(oc)}`;
  $('prestige-description').textContent=`+${SPARK_BONUS*100}% дохода за искру навсегда. Сейчас: ${gain} искр за перезапуск.`;
  for(const m of MODIFIERS){const cost=modifierPrice(save,m.id),level=save[m.field],b=$(`${m.id}-upgrade`);b.disabled=cost===null||save.coins<cost||m.requiresAuto&&!save.autoLevel;b.textContent=cost===null?'Максимум':`Улучшить · ${format(cost)}`;
    $(`${m.id}-description`).textContent=`Ур. ${level}/${m.prices.length} · `+({yield:`+${Math.round((incomeBonus(save)-1)*100)}% к любому доходу. +15% за уровень.`,burn:`Сгорание через ${burnDelay(save).toFixed(1)} с. −0,6 с за уровень.`,turbo:save.autoLevel?`Интервал ножа −${Math.round((1-Math.pow(.9,level))*100)}%. −10% за уровень.`:'Сначала купи автонарезчик.'}[m.id]);
  }
  $('prestige-progress').value=Math.min(1,save.runEarned/PRESTIGE_THRESHOLD);$('prestige-button').disabled=gain<1;$('prestige-button').textContent=gain?`Перезапустить · +${gain} искр`:`Ещё ${format(PRESTIGE_THRESHOLD-save.runEarned)}`;
}
function showOffline(result){if(!result.amount)return;$('offline-amount').textContent=`+${format(result.amount)}`;$('offline-summary').textContent=`Мастерская заработала за ${Math.floor(result.seconds/3600)} ч ${Math.floor(result.seconds%3600/60)} мин. Монеты уже в банке.`;$('offline-report').hidden=false;}
$('offline-close').onclick=()=>{$('offline-report').hidden=true;};
function toggleAutomation(){if(!save.autoLevel)return;save.autoEnabled=!save.autoEnabled;autoElapsed=0;persist();updateHUD();}
$('auto-toggle').onclick=toggleAutomation;$('auto-game-toggle').onclick=toggleAutomation;
$('prestige-button').onclick=()=>{
  const gain=prestigeGain(save);if(!gain||!window.confirm(`Перезапустить мастерскую за ${gain} искр? Монеты, купленные материалы и улучшения сбросятся. Постоянный бонус станет +${(save.sparks+gain)*SPARK_BONUS*100}%.`))return;
  prestige(save);autoElapsed=0;feedSpeedOverride=null;wireCountOverride=null;wireTextureStyle='default';
  world=new RopeWorld({onBurn:reward,materials:save.activeMaterials,wireCount:save.wireCount,parameters:world.params,initialLength:.3});scene.setWireTexture('default');$('physics-texture').value='default';persistPhysics();persist();shopPage=0;scene.setShopPage(0);setMode('game');notify(`Новый виток: +${gain} искр навсегда`);
};
function updateDetail(){const m=MATERIALS[detailIndex],owned=save.owned.includes(m.id),active=save.activeMaterials.includes(m.id);$('detail-title').textContent=m.name;$('detail-description').textContent=`${m.description} Доход ×${m.multiplier}. ${active?'Выбран для всех новых проводов.':owned?'Выбрать для всех новых проводов.':'После покупки автоматически станет выбранным.'}`;const b=$('buy');b.disabled=!owned&&save.coins<m.price;b.textContent=active?'ВЫБРАН ✓':owned?'ВЫБРАТЬ':save.coins>=m.price?`КУПИТЬ · ${format(m.price)}`:`ЕЩЁ ${format(m.price-save.coins)}`;b.setAttribute('aria-pressed',String(active));const w=$('detail-wire-upgrade');w.disabled=save.coins<wirePrice(save);w.textContent=`Ещё провод · ${format(wirePrice(save))}  (сейчас ${save.wireCount})`;}
function applyMaterialSelection(){
  world.setRotation(save.activeMaterials);
  // A shop choice takes priority over the persisted physics preview override,
  // including reselecting the current material after trying a different look.
  if(wireTextureStyle!=='default'){wireTextureStyle='default';scene.setWireTexture('default');$('physics-texture').value='default';persistPhysics();}
  persist();updateHUD();
}
function changeMaterial(id){if(!selectMaterial(save,id))return;applyMaterialSelection();notify(`${MATERIALS.find(m=>m.id===id).name} выбран`);}
for(const [i,m]of MATERIALS.entries()){const b=document.createElement('button');b.id=`material-${m.id}`;b.className='material-card';b.innerHTML=`<span class="card-copy"><span class="card-name">${m.name}</span><span class="tag"></span><span class="card-mult">ДОХОД ×${m.multiplier}</span></span>`;b.addEventListener('click',()=>save.owned.includes(m.id)?changeMaterial(m.id):setMode('detail',i));$('shop-grid').append(b);}
$('shop-button').onclick=()=>setMode(mode==='game'?'shop':'game');$('back').onclick=()=>setMode(mode==='game'?'shop':mode==='detail'?'shop':'game');
$('close-detail').onclick=()=>{const i=detailIndex;setMode('shop');$(`material-${MATERIALS[i].id}`).focus();};
$('buy').onclick=()=>{const m=MATERIALS[detailIndex];if(save.owned.includes(m.id)){changeMaterial(m.id);return;}if(!purchase(save,m.id))return;applyMaterialSelection();notify(`${m.name} куплен и выбран`);tone(1200,.2);};
function buyUpgrade(kind){if(upgrade(save,kind)){if(kind==='auto'||kind==='turbo')autoElapsed=0;if(kind==='wire'){wireCountOverride=null;world.setWireCount(save.wireCount);persistPhysics();}persist();updateHUD();notify({wire:`Куплено проводов: ${save.wireCount}`,feed:'Провода подаются быстрее',auto:'Автонарезчик улучшен',offline:'Ночная смена улучшена',yield:'Доход увеличен',burn:'Провода сгорают быстрее',turbo:'Автонарезчик ускорен'}[kind]);tone(1100,.2);}}
for(const kind of ['feed','wire','auto','offline',...MODIFIERS.map(m=>m.id)])$(kind+'-upgrade').onclick=()=>buyUpgrade(kind);
$('detail-wire-upgrade').onclick=()=>buyUpgrade('wire');
$('sound').onclick=()=>{save.sound=!save.sound;persist();updateHUD();tone(660);};
$('reset').onclick=()=>{if(!window.confirm('Сбросить весь прогресс и начать заново?'))return;resetting=true;clearTimeout(saveTimer);try{localStorage.removeItem(SAVE_KEY);localStorage.removeItem(LEGACY_SAVE_KEY);}catch{}window.location.reload();};
$('physics-toggle').onclick=()=>setPhysicsPanel($('physics-panel').hidden);$('physics-close').onclick=()=>setPhysicsPanel(false);
$('physics-reset').onclick=()=>{Object.assign(world.params,PHYSICS_DEFAULTS);feedSpeedOverride=null;wireCountOverride=null;wireTextureStyle='default';world.setWireCount(save.wireCount);scene?.setWireTexture(wireTextureStyle);$('physics-texture').value=wireTextureStyle;updateHUD();syncPhysicsControls();persistPhysics();notify('Параметры физики сброшены.');};
function setPaused(value){paused=value;$('pause-overlay').hidden=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause').setAttribute('aria-label',paused?'Продолжить игру':'Приостановить игру');dragging=false;}
$('pause').onclick=()=>setPaused(!paused);$('resume').onclick=()=>setPaused(false);
let dragging=false,lastPoint,lastClient;
function slash(a,b){const rect=$('scene').getBoundingClientRect(),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1)return;const el=document.createElement('i');el.className='slash';el.style.left=`${a.x-rect.left}px`;el.style.top=`${a.y-rect.top}px`;el.style.width=`${len}px`;el.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;$('trail').append(el);setTimeout(()=>el.remove(),260);}
function performCut(a,b,automatic=false){const hits=world.cut(a,b);if(hits.length){save.cuts+=hits.length;queueSave();updateHUD();tone(420,.07,'triangle',.025);if(!automatic&&navigator.vibrate)navigator.vibrate(8);}return hits;}
$('scene').addEventListener('pointerdown',e=>{if(mode!=='game'||paused||e.button>0)return;e.preventDefault();dragging=true;lastPoint=scene.screenToWorld(e.clientX,e.clientY);lastClient={x:e.clientX,y:e.clientY};$('scene').setPointerCapture(e.pointerId);tone(90,.02,'sine',.001);});
$('scene').addEventListener('pointermove',e=>{if(!dragging||mode!=='game'||paused)return;for(const point of(e.getCoalescedEvents?.()||[e])){const client={x:point.clientX,y:point.clientY},p=scene.screenToWorld(client.x,client.y);performCut(lastPoint,p);slash(lastClient,client);lastPoint=p;lastClient=client;}});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(name,()=>{dragging=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(mode==='detail')setMode('shop');else if(mode!=='game')setMode('game');else setPaused(!paused);}if(e.key==='Tab'&&mode==='detail'){const focusable=[$('close-detail'),$('buy'),$('detail-wire-upgrade')].filter(b=>!b.disabled),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
document.addEventListener('visibilitychange',()=>{
  dragging=false;accumulator=0;lastTime=performance.now();
  if(document.hidden){save.lastSeen=Date.now();awaySince=save.lastSeen;persist();}
  else if(awaySince){const result=claimOffline(save);awaySince=0;persist();updateHUD();showOffline(result);}
});window.addEventListener('pagehide',persist);
setInterval(()=>{if(!document.hidden)persist();},15000);
function stepAutomation(dt){
  if(!save.autoLevel||!save.autoEnabled||!save.activeMaterials.length){autoElapsed=0;return;}
  autoElapsed+=dt;const interval=autoInterval(save);if(autoElapsed<interval)return;autoElapsed%=interval;
  const a={x:-world.params.wallHalfWidth-1,y:2.7},b={x:world.params.wallHalfWidth+1,y:2.7};
  const hits=performCut(a,b,true);if(hits.length&&mode==='game'){const rect=$('scene').getBoundingClientRect(),pa=scene.worldToScreen(a),pb=scene.worldToScreen(b);slash({x:rect.left+pa.x*rect.width,y:rect.top+pa.y*rect.height},{x:rect.left+pb.x*rect.width,y:rect.top+pb.y*rect.height});}
}
let lastTime=performance.now(),accumulator=0,frames=0,lastPhysicsMs=0,lastRenderMs=0,lastSteps=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(document.hidden)return;
  const physicsStart=performance.now(),step=world.params.fixedStep,maxSteps=Math.round(world.params.maxStepsPerFrame);lastSteps=0;if(!paused){accumulator+=dt;while(accumulator>=step&&lastSteps<maxSteps){world.step(step);stepAutomation(step);accumulator-=step;lastSteps++;
    // Return to drawing and input after one expensive step instead of stacking
    // four slow steps into a single visibly frozen frame. Fixed dt is preserved.
    if(performance.now()-physicsStart>=8)break;
  }if(accumulator>=step)accumulator=step;}else accumulator=0;
  lastPhysicsMs=performance.now()-physicsStart;updatePileNote();const renderStart=performance.now();scene.render(now/1000,world.ropes,world.params.radius);lastRenderMs=performance.now()-renderStart;frames++;
}
try{scene=new GameScene($('scene'));scene.setWireTexture(wireTextureStyle);updateHUD();persist();showOffline(launchOffline);requestAnimationFrame(frame);$('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();setPaused(true);notify('Графический контекст потерян. Обнови страницу; прогресс сохранён.');persist();});
  // Read-only diagnostics for repeatable browser validation. No currency/debug cheats.
  window.__lapsha={snapshot:()=>({mode,shopPage,paused,autoLevel:save.autoLevel,autoEnabled:save.autoEnabled,offlineLevel:save.offlineLevel,yieldLevel:save.yieldLevel,burnLevel:save.burnLevel,turboLevel:save.turboLevel,autoElapsed,sparks:save.sparks,runEarned:save.runEarned,prestiges:save.prestiges,coins:save.coins,cuts:save.cuts,selected:save.selected,activeMaterials:[...save.activeMaterials],owned:[...save.owned],feedLevel:save.feedLevel,wireCount:save.wireCount,frames,simulationTime:world.time,nodeCount:world.count,pileHeight:world.pileHeight,extrusionBlocked:world.extrusionBlocked,performance:{physicsMs:lastPhysicsMs,renderMs:lastRenderMs,steps:lastSteps},ropes:world.ropes.map(r=>({attached:r.attached,landed:r.landed,restTime:r.restTime,burning:r.fade>0,material:r.material,linkMaterials:[...r.linkMaterials],emitMaterial:r.emitMaterial,nodes:r.nodes.map(p=>({x:p.x,y:p.y,z:p.z})),length:r.links.reduce((a,b)=>a+b,0)}))}),project:p=>scene.worldToScreen(p)};
}catch(error){console.error(error);$('error').hidden=false;$('error').textContent='Не удалось запустить 3D. Открой игру в Chrome, Edge или Firefox с включённым аппаратным ускорением. '+error.message;}
