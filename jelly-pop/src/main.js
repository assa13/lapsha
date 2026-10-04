import './style.css';

const COLORS=[
  {name:'Coral',rgb:[255,122,137]},
  {name:'Blue',rgb:[108,190,255]},
  {name:'Honey',rgb:[255,198,105]},
  {name:'Mint',rgb:[112,224,178]},
  {name:'Lilac',rgb:[184,137,255]}
];
const SAVE_KEY='jelly-pop-save-v1';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rgba=(c,a=1)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const mix=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));
const fmt=n=>n<1000?String(Math.floor(n)):n<1e6?(n/1e3).toFixed(n<1e4?1:0)+'K':(n/1e6).toFixed(1)+'M';

const fresh=()=>({v:1,coins:0,spawn:0,value:0,auto:0,rare:0,pops:0,lastSeen:Date.now()});
function load(){
  try{const s=JSON.parse(localStorage.getItem(SAVE_KEY));return s&&s.v===1?{...fresh(),...s}:fresh();}
  catch{return fresh();}
}
let save=load();
const persist=()=>{save.lastSeen=Date.now();localStorage.setItem(SAVE_KEY,JSON.stringify(save));};

document.querySelector('#app').innerHTML=`
<main id="game">
  <canvas id="scene"></canvas>
  <header id="hud">
    <div class="brand"><span class="eyebrow">JELLY LAB</span><strong>POP</strong></div>
    <div class="stats">
      <div class="pill"><span>blocks</span><b id="count">0</b></div>
      <div class="pill" id="combo-pill"><span>combo</span><b id="combo">×1.0</b></div>
    </div>
  </header>
  <div id="hint"><strong>tap jelly</strong><span>mix colors · build combo</span></div>
  <div id="toast"></div>
  <footer id="bank">
    <div class="balance"><span>gel</span><strong id="coins">0</strong></div>
    <button class="icon-btn" id="shop-button" type="button">SHOP</button>
  </footer>
  <section id="shop" hidden>
    <div class="shop-top">
      <div class="shop-title"><small>workshop</small><h2>Улучшения</h2></div>
      <button id="close-shop" type="button" aria-label="Закрыть">×</button>
    </div>
    <div class="upgrade-grid" id="upgrade-grid"></div>
    <p class="shop-note">Автолопание выбирает спокойные одиночные блоки и не ломает ручные комбинации.</p>
  </section>
</main>`;

const game=document.querySelector('#game');
const canvas=document.querySelector('#scene');
const ctx=canvas.getContext('2d',{alpha:true});
const coinsEl=document.querySelector('#coins');
const countEl=document.querySelector('#count');
const comboEl=document.querySelector('#combo');
const comboPill=document.querySelector('#combo-pill');
const hint=document.querySelector('#hint');
const shop=document.querySelector('#shop');
const shopButton=document.querySelector('#shop-button');
const closeShop=document.querySelector('#close-shop');
const upgradeGrid=document.querySelector('#upgrade-grid');
const toast=document.querySelector('#toast');

let W=0,H=0,dpr=1,last=performance.now(),spawnClock=0,autoClock=0,combo=1,comboTimer=0;
const blocks=[],drops=[],streams=[];
let id=1;

function resize(){
  const r=game.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.max(1,Math.round(W*dpr));canvas.height=Math.max(1,Math.round(H*dpr));
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
new ResizeObserver(resize).observe(game);resize();

class Jelly{
  constructor(x,y,colorIndex,rare=false){
    this.id=id++;this.x=x;this.y=y;this.vx=(Math.random()-.5)*14;this.vy=8+Math.random()*18;
    this.colorIndex=colorIndex;this.color=COLORS[colorIndex].rgb.slice();this.rare=rare;
    this.base=W*(rare?.145:.112+Math.random()*.018);this.mass=rare?1.35:1;
    this.angle=(Math.random()-.5)*.14;this.spin=(Math.random()-.5)*.18;
    this.sx=1;this.sy=1;this.hit=0;this.age=0;this.phase=Math.random()*Math.PI*2;
  }
  get r(){return this.base*Math.sqrt(this.mass);}
}

function spawn(initial=false){
  if(blocks.length>18)return;
  const rare=Math.random()<.02+save.rare*.012;
  const ci=rare?Math.floor(Math.random()*COLORS.length):Math.floor(Math.random()*4);
  const r=W*(rare?.145:.12);
  const x=r*1.4+Math.random()*(W-r*2.8);
  const b=new Jelly(x,-r*1.7,ci,rare);
  if(initial){b.y=H*(.32+Math.random()*.42);b.vy=0;}
  blocks.push(b);
}
for(let i=0;i<5;i++)spawn(true);

function showToast(text){
  toast.textContent=text;toast.classList.add('visible');
  clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('visible'),1200);
}
function rewardLabel(x,y,text,color){
  const el=document.createElement('div');el.className='pop-label';el.textContent=text;
  el.style.left=x+'px';el.style.top=y+'px';el.style.color=rgba(color,.98);
  game.appendChild(el);setTimeout(()=>el.remove(),900);
}
function burst(x,y,color,n=10){
  for(let i=0;i<n;i++)drops.push({x,y,vx:(Math.random()-.5)*100,vy:(Math.random()-.8)*110,life:.55+Math.random()*.25,r:2+Math.random()*4,color});
}
function colorBonus(a,b){
  if(a===b)return 1;
  const d=Math.abs(a-b);
  return 1.18+(d%3)*.08;
}
function popBlock(b,auto=false){
  const at=blocks.indexOf(b);if(at<0)return;
  const near=blocks.filter(o=>o!==b).map(o=>({o,d:Math.hypot(o.x-b.x,o.y-b.y)})).sort((a,b)=>a.d-b.d).slice(0,3);
  let local=1;
  for(const {o,d} of near){
    const reach=(b.r+o.r)*2.15;if(d>reach)continue;
    const different=o.colorIndex!==b.colorIndex;
    if(different)local=Math.max(local,colorBonus(o.colorIndex,b.colorIndex));
    const t=clamp(1-d/reach,.16,.48);
    o.mass=clamp(o.mass+b.mass*t*.18,.75,2.25);
    o.color=mix(o.color,b.color,different?.34:.14);
    streams.push({x1:b.x,y1:b.y,x2:o.x,y2:o.y,color:b.color.slice(),life:.42,max:.42,width:Math.max(5,b.r*.16)});
    const nx=(o.x-b.x)/(d||1),ny=(o.y-b.y)/(d||1);
    o.vx+=nx*34*t;o.vy+=ny*22*t;o.hit=Math.max(o.hit,.75);
    if(different&&Math.random()<.35)o.colorIndex=b.colorIndex;
  }
  combo=clamp(combo*(auto?1.02:1.06)*local,1,12);comboTimer=2.5;
  const reward=Math.max(1,Math.round((b.rare?18:6)*(1+save.value*.34)*combo));
  save.coins+=reward;save.pops++;blocks.splice(at,1);
  burst(b.x,b.y,b.color,b.rare?16:10);rewardLabel(b.x,b.y,'+'+reward,b.color);
  hint.classList.add('hidden');persist();
}

function physics(dt){
  const floor=H*.835,left=W*.04,right=W*.96,g=500;
  for(const b of blocks){
    b.age+=dt;b.vy+=g*dt;b.vx*=Math.pow(.991,dt*60);b.spin*=Math.pow(.986,dt*60);
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.spin*dt;
    const r=b.r;
    if(b.x-r<left){b.x=left+r;b.vx=Math.abs(b.vx)*.42;b.hit=.45}
    if(b.x+r>right){b.x=right-r;b.vx=-Math.abs(b.vx)*.42;b.hit=.45}
    if(b.y+r>floor){
      const impact=Math.abs(b.vy);b.y=floor-r;b.vy=-impact*.12;
      if(impact<40)b.vy=0;b.vx*=.84;b.spin*=.72;b.hit=Math.max(b.hit,clamp(impact/400,.14,.9));
    }
  }
  for(let pass=0;pass<3;pass++)for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++){
    const a=blocks[i],b=blocks[j],dx=b.x-a.x,dy=b.y-a.y;
    const d=Math.hypot(dx,dy)||.001,min=(a.r+b.r)*.72;if(d>=min)continue;
    const nx=dx/d,ny=dy/d,over=min-d,total=a.mass+b.mass;
    a.x-=nx*over*(b.mass/total)*.5;a.y-=ny*over*(b.mass/total)*.5;
    b.x+=nx*over*(a.mass/total)*.5;b.y+=ny*over*(a.mass/total)*.5;
    const rvx=b.vx-a.vx,rvy=b.vy-a.vy,sep=rvx*nx+rvy*ny;
    if(sep<0){const imp=-sep*.18;a.vx-=nx*imp*b.mass/total;a.vy-=ny*imp*b.mass/total;b.vx+=nx*imp*a.mass/total;b.vy+=ny*imp*a.mass/total;}
    const s=clamp(over/min*3.8,.06,1);
    a.hit=Math.max(a.hit,s);b.hit=Math.max(b.hit,s);
    a.sx=lerp(a.sx,1+Math.abs(nx)*s*.5,.58);a.sy=lerp(a.sy,1-Math.abs(ny)*s*.42,.58);
    b.sx=lerp(b.sx,1+Math.abs(nx)*s*.5,.58);b.sy=lerp(b.sy,1-Math.abs(ny)*s*.42,.58);
  }
  for(const b of blocks){
    b.hit=Math.max(0,b.hit-dt*2.2);
    const wobble=Math.sin(b.age*4.2+b.phase)*.025*(1+b.hit*2.8);
    b.sx=lerp(b.sx,1+wobble,clamp(dt*7,0,1));b.sy=lerp(b.sy,1-wobble,clamp(dt*7,0,1));
  }
}

function jellyPath(size,corner,b){
  const pts=12,rx=size*.5,ry=size*.5;
  ctx.beginPath();
  for(let i=0;i<pts;i++){
    const a=i/pts*Math.PI*2;
    const ca=Math.cos(a),sa=Math.sin(a);
    const square=1/Math.pow(Math.pow(Math.abs(ca),5)+Math.pow(Math.abs(sa),5),1/5);
    const pulse=1+Math.sin(b.age*3.4+b.phase+i*.9)*.018+b.hit*Math.sin(i*1.7+b.phase)*.045;
    const x=ca*rx*square*pulse,y=sa*ry*square*pulse;
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.closePath();
}
function drawJelly(b){
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);
  ctx.scale(clamp(b.sx*(1+b.hit*.08),.72,1.4),clamp(b.sy*(1-b.hit*.08),.62,1.34));
  const s=b.r*1.72;
  const grad=ctx.createLinearGradient(-s*.42,-s*.58,s*.42,s*.55);
  grad.addColorStop(0,rgba(mix(b.color,[255,255,255],.28),.66));
  grad.addColorStop(.48,rgba(b.color,.46));
  grad.addColorStop(1,rgba(mix(b.color,[25,60,120],.2),.58));
  ctx.shadowColor='rgba(3,20,65,.26)';ctx.shadowBlur=b.r*.34;ctx.shadowOffsetY=b.r*.15;
  jellyPath(s,s*.28,b);ctx.fillStyle=grad;ctx.fill();
  ctx.shadowColor='transparent';ctx.lineWidth=Math.max(1.2,b.r*.018);ctx.strokeStyle='rgba(246,252,255,.32)';ctx.stroke();
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=.58;
  const hi=ctx.createRadialGradient(-s*.18,-s*.21,0,-s*.18,-s*.21,s*.38);
  hi.addColorStop(0,'rgba(255,255,255,.52)');hi.addColorStop(.38,'rgba(255,255,255,.12)');hi.addColorStop(1,'rgba(255,255,255,0)');
  ctx.beginPath();ctx.ellipse(-s*.14,-s*.17,s*.22,s*.13,-.45,0,Math.PI*2);ctx.fillStyle=hi;ctx.fill();ctx.restore();
  ctx.save();ctx.globalAlpha=.24;ctx.fillStyle='white';
  for(let i=0;i<3;i++){const q=b.r*(.026+i*.006);ctx.beginPath();ctx.arc((-0.18+i*.16)*s,.12*s+Math.sin(i+b.phase)*.05*s,q,0,Math.PI*2);ctx.fill();}
  ctx.restore();
  ctx.restore();
}
function render(){
  ctx.clearRect(0,0,W,H);
  const floor=H*.835;
  const ground=ctx.createLinearGradient(0,floor-H*.04,0,H);
  ground.addColorStop(0,'rgba(210,230,255,.04)');
  ground.addColorStop(.12,'rgba(20,58,145,.28)');
  ground.addColorStop(1,'rgba(9,35,98,.72)');
  ctx.fillStyle=ground;ctx.fillRect(0,floor-H*.025,W,H-floor+H*.025);
  ctx.strokeStyle='rgba(225,240,255,.22)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(0,floor);ctx.lineTo(W,floor);ctx.stroke();
  for(const b of blocks){
    const d=clamp((floor-b.y)/(H*.5),0,1);
    const a=.22*(1-d);if(a<=.002)continue;
    ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(4,22,72,.9)';
    ctx.beginPath();ctx.ellipse(b.x,floor,b.r*1.2,b.r*.24,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  for(let i=streams.length-1;i>=0;i--){
    const st=streams[i];st.life-=1/60;if(st.life<=0){streams.splice(i,1);continue;}
    const t=1-st.life/st.max,alpha=Math.sin(Math.PI*clamp(t,0,1))*.28;
    const mx=(st.x1+st.x2)/2,my=(st.y1+st.y2)/2-18*Math.sin(t*Math.PI);
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=rgba(st.color,.9);ctx.lineWidth=st.width*(1-t*.45);ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(st.x1,st.y1);ctx.quadraticCurveTo(mx,my,st.x2,st.y2);ctx.stroke();ctx.restore();
  }
  for(const b of [...blocks].sort((a,b)=>a.y-b.y))drawJelly(b);
  for(let i=drops.length-1;i>=0;i--){
    const p=drops[i];p.life-=1/60;if(p.life<=0){drops.splice(i,1);continue;}
    p.x+=p.vx/60;p.y+=p.vy/60;p.vy+=160/60;p.vx*=.986;
    ctx.globalAlpha=clamp(p.life/.8,0,1)*.72;ctx.fillStyle=rgba(p.color,.85);ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
}
function hitFromPointer(e){
  const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  let hit=null,dist=Infinity;
  for(const b of blocks){const d=Math.hypot(x-b.x,y-b.y);if(d<b.r*.95&&d<dist){hit=b;dist=d;}}
  return hit;
}
canvas.addEventListener('pointerdown',e=>{if(!shop.hidden)return;const b=hitFromPointer(e);if(b)popBlock(b,false);});

const upgrades=[
  {id:'spawn',name:'Мягкий поток',desc:'Новые желе падают чаще.',base:70,scale:2.05,max:8},
  {id:'value',name:'Плотный сироп',desc:'Каждый лопнутый блок приносит больше GEL.',base:110,scale:2.15,max:8},
  {id:'auto',name:'Автопоп',desc:'Иногда лопает спокойный одиночный блок.',base:450,scale:2.5,max:5},
  {id:'rare',name:'Редкие оттенки',desc:'Повышает шанс крупного редкого желе.',base:800,scale:2.6,max:5}
];
const price=u=>save[u.id]>=u.max?null:Math.round(u.base*Math.pow(u.scale,save[u.id]||0));
function renderShop(){
  upgradeGrid.innerHTML='';
  for(const u of upgrades){
    const p=price(u),lvl=save[u.id]||0,b=document.createElement('button');b.type='button';b.className='upgrade';b.disabled=p===null||save.coins<p;
    b.innerHTML=`<span><span class="name">${u.name}</span><span class="desc">${u.desc}</span><span class="level">уровень ${lvl}/${u.max}</span></span><span class="price">${p===null?'MAX':fmt(p)+' GEL'}</span>`;
    b.addEventListener('click',()=>{const cost=price(u);if(cost===null||save.coins<cost)return;save.coins-=cost;save[u.id]++;persist();renderShop();updateHud();showToast(u.name+' улучшен');});
    upgradeGrid.appendChild(b);
  }
}
shopButton.addEventListener('click',()=>{shop.hidden=false;renderShop();});
closeShop.addEventListener('click',()=>{shop.hidden=true;});
function updateHud(){
  coinsEl.textContent=fmt(save.coins);countEl.textContent=String(blocks.length);
  comboEl.textContent='×'+combo.toFixed(combo<2?1:0);comboPill.dataset.hot=combo>1.3?'true':'false';
}
function frame(now){
  const dt=Math.min(.033,(now-last)/1000||.016);last=now;
  if(shop.hidden){
    spawnClock+=dt;const interval=Math.max(.68,1.8-save.spawn*.12);
    while(spawnClock>interval){spawnClock-=interval;spawn();}
    if(save.auto>0){
      autoClock+=dt;const gap=Math.max(2.8,9-save.auto*1.15);
      if(autoClock>gap&&blocks.length>5){autoClock=0;const pool=blocks.filter(b=>b.y>H*.28&&b.y<H*.82);if(pool.length)popBlock(pool[Math.floor(Math.random()*pool.length)],true);}
    }
    if(comboTimer>0)comboTimer-=dt;else combo=lerp(combo,1,clamp(dt*1.25,0,1));
    physics(dt);
  }
  render();updateHud();requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(persist,5000);
window.addEventListener('pagehide',persist);
