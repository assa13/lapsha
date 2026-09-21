import './style.css';
import {GameScene} from './scene.js';
import {RopeWorld,PHYSICS_DEFAULTS} from './physics.js';
import {MATERIALS,SAVE_KEY,parseSave,purchase,toggleMaterial,feedPrice,wirePrice,upgrade,rewardForRope} from './economy.js';

const $=id=>document.getElementById(id),format=n=>Math.floor(n).toLocaleString('ru-RU');
let save;try{save=parseSave(localStorage.getItem(SAVE_KEY));}catch{save=parseSave(null);}
const PHYSICS_SAVE_KEY='lapsha-physics-v1';
const PHYSICS_CONTROLS=[
  ['feedSpeed','Скорость подачи',.05,10,.05],['wireCount','Количество проводов',1,500,1],['fixedStep','Шаг физики',.002,.033,.0001],['maxStepsPerFrame','Макс. шагов/кадр',1,12,1],
  ['segmentLength','Длина сегмента',.03,.5,.005],['radius','Радиус провода',.01,.3,.002],['floor','Высота пола',-10,5,.05],['top','Высота сопла',-5,15,.05],
  ['gravity','Гравитация',0,50,.1],['horizontalDamping','Затухание XY',.8,1,.001],['depthDamping','Затухание Z',.8,1,.001],['turbulence','Колебание',0,2,.005],
  ['anchorFrequency','Частота сопла',0,5,.05],['anchorSway','Амплитуда сопла',0,1,.01],['anchorFollow','Скорость сопла',.1,30,.1],
  ['bendRatio','Предел изгиба',.5,1.2,.01],['bendStiffness','Жёсткость изгиба',0,1,.01],['floorFriction','Трение пола',0,.3,.005],
  ['wallHalfWidth','Полуширина камеры',.2,10,.05],['depthHalfWidth','Полуглубина',.05,5,.01],['solverPasses','Проходов решателя',1,30,1],
  ['denseSolverPasses','Проходов при нагрузке',1,30,1],['denseThreshold','Порог нагрузки',10,10000,10],['pileStopY','Стоп кучи Y',-10,15,.05],
  ['pileResumeY','Возобновление Y',-10,15,.05],['pileStopDelay','Задержка стопа',0,10,.05],['pileResumeDelay','Задержка запуска',0,10,.05],
  ['burnDelay','Задержка горения',0,30,.1],['burnDuration','Время горения',.05,10,.05]
].map(([key,label,min,max,step])=>({key,label,min,max,step,integer:step===1||step===10}));
function loadPhysicsSettings(){try{const value=JSON.parse(localStorage.getItem(PHYSICS_SAVE_KEY));return value&&typeof value==='object'?value:{};}catch{return {};}}
const storedPhysics=loadPhysicsSettings();
const storedParameters={};for(const spec of PHYSICS_CONTROLS){if(spec.key==='feedSpeed'||spec.key==='wireCount')continue;let value=storedPhysics.parameters?.[spec.key];if(!Number.isFinite(value))continue;value=Math.max(spec.min,Math.min(spec.max,value));storedParameters[spec.key]=spec.integer?Math.round(value):value;}
let scene,mode='game',detailIndex=-1,paused=false,resetting=false,toastTimer,saveTimer,audioContext;
function persist(){if(resetting)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));}catch{notify('Браузер не разрешает сохранение. Прогресс доступен до закрытия.');}}
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(persist,250);}
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);}
function tone(frequency,duration=.1,type='sine',volume=.035){if(!save.sound)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(frequency,audioContext.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.55,audioContext.currentTime+duration);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+duration);}catch{}}
function reward(rope){const amount=rewardForRope(rope);save.coins+=amount;save.earned+=amount;queueSave();updateHUD();
  const p=rope.nodes.reduce((a,b)=>a.y<b.y?a:b),s=scene.worldToScreen(p),el=document.createElement('span');el.className='reward';el.textContent=`+${format(amount)}`;el.style.left=`${Math.max(.13,Math.min(.87,s.x))*100}%`;el.style.top=`${s.y*100}%`;$('rewards').append(el);setTimeout(()=>el.remove(),1200);tone(900,.18);}
const feedSpeedSpec=PHYSICS_CONTROLS.find(spec=>spec.key==='feedSpeed'),wireCountSpec=PHYSICS_CONTROLS.find(spec=>spec.key==='wireCount');
let feedSpeedOverride=Number.isFinite(storedPhysics.feedSpeedOverride)?Math.max(feedSpeedSpec.min,Math.min(feedSpeedSpec.max,storedPhysics.feedSpeedOverride)):null;
let wireCountOverride=Number.isFinite(storedPhysics.wireCountOverride)?Math.round(Math.max(wireCountSpec.min,Math.min(wireCountSpec.max,storedPhysics.wireCountOverride))):null;
if(wireCountOverride!==null&&wireCountOverride<save.wireCount)wireCountOverride=null;
const world=new RopeWorld({onBurn:reward,materials:save.activeMaterials,wireCount:wireCountOverride??save.wireCount,parameters:storedParameters});
const physicsInputs=new Map();
function physicsValue(value){if(typeof value==='boolean')return value?'да':'нет';if(!Number.isFinite(value))return String(value);return Number.isInteger(value)?String(value):value.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');}
function persistPhysics(){try{localStorage.setItem(PHYSICS_SAVE_KEY,JSON.stringify({parameters:world.params,feedSpeedOverride,wireCountOverride}));}catch{notify('Не удалось сохранить параметры физики.');}}
function parameterValue(key){if(key==='feedSpeed')return world.feedSpeed;if(key==='wireCount')return world.feeders.length;return world.params[key];}
function syncPhysicsControls(){for(const {key}of PHYSICS_CONTROLS){const input=physicsInputs.get(key);if(input&&document.activeElement!==input)input.value=physicsValue(parameterValue(key));}}
function buildPhysicsControls(){for(const spec of PHYSICS_CONTROLS){const label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');name.textContent=spec.label;input.type='number';input.min=spec.min;input.max=spec.max;input.step=spec.step;input.value=physicsValue(parameterValue(spec.key));input.addEventListener('input',()=>{let value=input.valueAsNumber;if(!Number.isFinite(value))return;value=Math.max(spec.min,Math.min(spec.max,value));if(spec.integer)value=Math.round(value);if(spec.key==='feedSpeed'){feedSpeedOverride=value;world.feedSpeed=value;}else if(spec.key==='wireCount'){wireCountOverride=value;world.setWireCount(value);}else world.params[spec.key]=value;persistPhysics();});label.append(name,input);$('physics-controls').append(label);physicsInputs.set(spec.key,input);}}
function setPhysicsPanel(open){$('physics-panel').hidden=!open;$('physics-toggle').setAttribute('aria-expanded',String(open));if(open)syncPhysicsControls();}
buildPhysicsControls();
function updateHUD(){
  $('coins').textContent=format(save.coins);$('material-label').textContent=`В ротации: ${save.activeMaterials.length} · Проводов: ${world.feeders.length}`;
  $('sound').textContent=save.sound?'Звук вкл.':'Звук выкл.';$('sound').setAttribute('aria-pressed',String(save.sound));$('sound').setAttribute('aria-label',save.sound?'Выключить звук':'Включить звук');
  $('hint').style.opacity=save.cuts>0?'0':'1';world.feedSpeed=feedSpeedOverride??1.15*(1+save.feedLevel*.3);syncPhysicsControls();
  if(mode!=='game')updateShop();
}
function updatePileNote(){const noMaterials=save.activeMaterials.length===0,note=$('pile-note');note.hidden=mode!=='game'||(!noMaterials&&!world.extrusionBlocked);note.textContent=noMaterials?'Выбери хотя бы один материал в магазине':'Куча достигла верха. Разрежь провода, чтобы продолжить подачу.';}
function updateShop(){
  for(const [i,m]of MATERIALS.entries()){const button=$(`material-${m.id}`),owned=save.owned.includes(m.id),active=save.activeMaterials.includes(m.id);button.classList.toggle('selected',active);button.querySelector('.tag').textContent=active?'Выбран':owned?'Выбрать':format(m.price);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',`${m.name}, доход ×${m.multiplier}, ${active?'выбран, убрать из ротации':owned?'выбрать':format(m.price)+' монет'}`);}
  $('feed-upgrade').innerHTML=`Подача ${save.feedLevel+1} ур.<b>+30% · ${format(feedPrice(save))}</b>`;$('feed-upgrade').disabled=save.coins<feedPrice(save);
  $('wire-upgrade').innerHTML=`Провода ${save.wireCount}<b>+1 · ${format(wirePrice(save))}</b>`;$('wire-upgrade').disabled=save.coins<wirePrice(save);
  if(mode==='detail')updateDetail();
}
function setMode(next,index=-1){mode=next;detailIndex=index;scene.setMode(next,index);$('shop').hidden=next==='game';$('hud').hidden=next!=='game';$('detail').hidden=next!=='detail';$('hint').hidden=next!=='game';$('shop-button').setAttribute('aria-expanded',String(next!=='game'));$('shop-button').setAttribute('aria-label',next==='game'?'Открыть магазин':'Вернуться в игру');$('back').setAttribute('aria-label',next==='game'?'Открыть коллекцию':'Назад');$('back').querySelector('img').src=next==='game'?'./assets/currency.png':'./assets/back.svg';$('shop').style.visibility=next==='detail'?'hidden':'visible';$('shop').inert=next==='detail';if(next!=='game')setPhysicsPanel(false);dragging=false;updateHUD();updatePileNote();if(next==='detail')$('close-detail').focus();}
function updateDetail(){const m=MATERIALS[detailIndex],owned=save.owned.includes(m.id),active=save.activeMaterials.includes(m.id);$('detail-title').textContent=m.name;$('detail-description').textContent=`Доход ×${m.multiplier}. ${active?'В ротации новых проводов. Нажми, чтобы убрать.':owned?'Добавь в ротацию новых проводов.':'После покупки добавится в ротацию.'}`;const b=$('buy');b.disabled=!owned&&save.coins<m.price;b.textContent=active?'ВЫБРАН ✓':owned?'ВЫБРАТЬ':save.coins>=m.price?`КУПИТЬ · ${format(m.price)}`:`ЕЩЁ ${format(m.price-save.coins)}`;b.setAttribute('aria-pressed',String(active));const w=$('detail-wire-upgrade');w.disabled=save.coins<wirePrice(save);w.textContent=`Ещё провод · ${format(wirePrice(save))}  (сейчас ${save.wireCount})`;}
function changeRotation(id){if(!toggleMaterial(save,id))return;world.setRotation(save.activeMaterials);persist();updateHUD();notify(save.activeMaterials.length?`${MATERIALS.find(m=>m.id===id).name}: ${save.activeMaterials.includes(id)?'добавлен в ротацию':'убран из ротации'}`:'Выбери материал, чтобы продолжить подачу');}
for(const [i,m]of MATERIALS.entries()){const b=document.createElement('button');b.id=`material-${m.id}`;b.className='material-card';b.innerHTML=`<span class="card-copy"><span class="card-name">${m.name}</span><span class="tag"></span><span class="card-mult">ДОХОД ×${m.multiplier}</span></span>`;b.addEventListener('click',()=>save.owned.includes(m.id)?changeRotation(m.id):setMode('detail',i));$('shop-grid').append(b);}
$('shop-button').onclick=()=>setMode(mode==='game'?'shop':'game');$('back').onclick=()=>setMode(mode==='game'?'shop':mode==='detail'?'shop':'game');
$('close-detail').onclick=()=>{const i=detailIndex;setMode('shop');$(`material-${MATERIALS[i].id}`).focus();};
$('buy').onclick=()=>{const m=MATERIALS[detailIndex];if(save.owned.includes(m.id)){changeRotation(m.id);return;}if(!purchase(save,m.id))return;world.setRotation(save.activeMaterials);persist();updateHUD();notify(`${m.name} куплен и добавлен в ротацию`);tone(1200,.2);};
function buyUpgrade(kind){if(upgrade(save,kind)){if(kind==='wire'){wireCountOverride=null;world.setWireCount(save.wireCount);persistPhysics();}persist();updateHUD();notify(kind==='wire'?`Куплено проводов: ${save.wireCount}`:'Провода подаются быстрее');tone(1100,.2);}}
for(const kind of ['feed','wire'])$(kind+'-upgrade').onclick=()=>buyUpgrade(kind);
$('detail-wire-upgrade').onclick=()=>buyUpgrade('wire');
$('sound').onclick=()=>{save.sound=!save.sound;persist();updateHUD();tone(660);};
$('reset').onclick=()=>{if(!window.confirm('Сбросить весь прогресс и начать заново?'))return;resetting=true;clearTimeout(saveTimer);try{localStorage.removeItem(SAVE_KEY);}catch{}window.location.reload();};
$('physics-toggle').onclick=()=>setPhysicsPanel($('physics-panel').hidden);$('physics-close').onclick=()=>setPhysicsPanel(false);
$('physics-reset').onclick=()=>{Object.assign(world.params,PHYSICS_DEFAULTS);feedSpeedOverride=null;wireCountOverride=null;world.setWireCount(save.wireCount);updateHUD();syncPhysicsControls();persistPhysics();notify('Параметры физики сброшены.');};
function setPaused(value){paused=value;$('pause-overlay').hidden=!paused;$('pause').setAttribute('aria-pressed',String(paused));$('pause').setAttribute('aria-label',paused?'Продолжить игру':'Приостановить игру');dragging=false;}
$('pause').onclick=()=>setPaused(!paused);$('resume').onclick=()=>setPaused(false);
let dragging=false,lastPoint,lastClient;
function slash(a,b){const rect=$('scene').getBoundingClientRect(),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1)return;const el=document.createElement('i');el.className='slash';el.style.left=`${a.x-rect.left}px`;el.style.top=`${a.y-rect.top}px`;el.style.width=`${len}px`;el.style.transform=`rotate(${Math.atan2(dy,dx)}rad)`;$('trail').append(el);setTimeout(()=>el.remove(),260);}
function performCut(a,b){const hits=world.cut(a,b);if(hits.length){save.cuts+=hits.length;queueSave();updateHUD();tone(420,.07,'triangle',.025);if(navigator.vibrate)navigator.vibrate(8);}return hits;}
$('scene').addEventListener('pointerdown',e=>{if(mode!=='game'||paused||e.button>0)return;e.preventDefault();dragging=true;lastPoint=scene.screenToWorld(e.clientX,e.clientY);lastClient={x:e.clientX,y:e.clientY};$('scene').setPointerCapture(e.pointerId);tone(90,.02,'sine',.001);});
$('scene').addEventListener('pointermove',e=>{if(!dragging||mode!=='game'||paused)return;for(const point of(e.getCoalescedEvents?.()||[e])){const client={x:point.clientX,y:point.clientY},p=scene.screenToWorld(client.x,client.y);performCut(lastPoint,p);slash(lastClient,client);lastPoint=p;lastClient=client;}});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('scene').addEventListener(name,()=>{dragging=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(mode==='detail')setMode('shop');else if(mode==='shop')setMode('game');else setPaused(!paused);}if(e.key==='Tab'&&mode==='detail'){const focusable=[$('close-detail'),$('buy'),$('detail-wire-upgrade')].filter(b=>!b.disabled),first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
document.addEventListener('visibilitychange',()=>{dragging=false;accumulator=0;lastTime=performance.now();if(document.hidden)persist();});window.addEventListener('pagehide',persist);
let lastTime=performance.now(),accumulator=0,frames=0,lastPhysicsMs=0,lastRenderMs=0,lastSteps=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;if(document.hidden)return;
  const physicsStart=performance.now(),step=world.params.fixedStep,maxSteps=Math.round(world.params.maxStepsPerFrame);lastSteps=0;if(!paused){accumulator+=dt;while(accumulator>=step&&lastSteps<maxSteps){world.step(step);accumulator-=step;lastSteps++;}if(accumulator>=step)accumulator=step;}else accumulator=0;
  lastPhysicsMs=performance.now()-physicsStart;updatePileNote();const renderStart=performance.now();scene.render(now/1000,world.ropes);lastRenderMs=performance.now()-renderStart;frames++;
}
try{scene=new GameScene($('scene'));updateHUD();requestAnimationFrame(frame);$('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();setPaused(true);notify('Графический контекст потерян. Обнови страницу; прогресс сохранён.');persist();});
  // Read-only diagnostics for repeatable browser validation. No currency/debug cheats.
  window.__lapsha={snapshot:()=>({mode,paused,coins:save.coins,cuts:save.cuts,selected:save.selected,activeMaterials:[...save.activeMaterials],owned:[...save.owned],feedLevel:save.feedLevel,wireCount:save.wireCount,frames,simulationTime:world.time,nodeCount:world.count,pileHeight:world.pileHeight,extrusionBlocked:world.extrusionBlocked,performance:{physicsMs:lastPhysicsMs,renderMs:lastRenderMs,steps:lastSteps},ropes:world.ropes.map(r=>({attached:r.attached,landed:r.landed,restTime:r.restTime,burning:r.fade>0,material:r.material,linkMaterials:[...r.linkMaterials],emitMaterial:r.emitMaterial,nodes:r.nodes.map(p=>({x:p.x,y:p.y,z:p.z})),length:r.links.reduce((a,b)=>a+b,0)}))}),project:p=>scene.worldToScreen(p)};
}catch(error){console.error(error);$('error').hidden=false;$('error').textContent='Не удалось запустить 3D. Открой игру в Chrome, Edge или Firefox с включённым аппаратным ускорением. '+error.message;}
