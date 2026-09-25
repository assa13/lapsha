export const MATERIALS = [
  {id:'gold',name:'Золото',color:0xffb92c,accent:0xffef9a,price:0,multiplier:1,style:'metal',description:'Тёплое золото с бегущим зеркальным бликом.'},
  {id:'silver',name:'Жемчуг',color:0xc8d6ed,accent:0xffc6ec,price:1000,multiplier:2,style:'pearl',description:'Перламутровый перелив от ледяного голубого до розового.'},
  {id:'lava',name:'Лава',color:0xfd4718,accent:0xffd24b,price:9000,multiplier:4,style:'lava',description:'Огненные потоки под блестящей тёмной коркой.'},
  {id:'emerald',name:'Изумруд',color:0x13c886,accent:0xb6ff86,price:50000,multiplier:7,style:'gem',description:'Глубокий зелёный кристалл с золотистыми гранями.'},
  {id:'pink',name:'Фуксия',color:0xed168b,accent:0xb9a0ff,price:280000,multiplier:12,style:'silk',description:'Розовый металлик с волнами фиолетового шёлка.'},
  {id:'cosmic',name:'Голографик',color:0x79cfff,accent:0xffa9ee,price:1400000,multiplier:20,style:'holo',description:'Зеркальная фольга с движущимся радужным спектром.'},
  {id:'electric',name:'Электрический',color:0x7157ff,accent:0x92faff,price:5000000,multiplier:28,style:'electric',description:'Живые голубые разряды на фиолетовом металле.'},
  {id:'barber',name:'Барбершоп',color:0xff3153,accent:0x4287ff,price:13500000,multiplier:38,style:'barber',description:'Красно-бело-синие полосы вращаются, как вывеска барбершопа.'},
  {id:'opal',name:'Огненный опал',color:0xff647d,accent:0x65ffdf,price:34000000,multiplier:52,style:'opal',description:'Цветные прожилки опала переливаются под гладким стеклом.'},
  {id:'aurora',name:'Северное сияние',color:0x40f7be,accent:0xb381ff,price:80000000,multiplier:70,style:'aurora',description:'Бирюзовые и сиреневые ленты света текут вдоль провода.'},
  {id:'nebula',name:'Туманность',color:0x311a85,accent:0xff67d3,price:120000000,multiplier:95,style:'nebula',description:'Глубокие фиолетовые облака с бирюзовыми струями света.'},
  {id:'petrol',name:'Бензиновая радуга',color:0x174568,accent:0xfec267,price:180000000,multiplier:130,style:'petrol',description:'Тонкая радужная плёнка течёт по тёмному глянцу.'},
  {id:'prism',name:'Призма',color:0x8cedff,accent:0xff83e0,price:260000000,multiplier:170,style:'prism',description:'Кристальные ленты разлагают свет в движущийся спектр.'},
  {id:'jade',name:'Нефритовый шёлк',color:0x067c76,accent:0xffdf8c,price:360000000,multiplier:220,style:'jade',description:'Золотые жилы текут вдоль глубокого бирюзового камня.'},
  {id:'candy',name:'Карамельный вихрь',color:0xff4593,accent:0x79efff,price:500000000,multiplier:280,style:'candy',description:'Глянцевые розовые и мятные ленты медленно закручиваются.'},
].map(m=>({...m,roughness:.12,metalness:.85}));
export const SAVE_KEY='lapsha-save-v2',LEGACY_SAVE_KEY='lapsha-save-v1';
export const AUTO_PRICES=[5000,68000,900000],AUTO_INTERVALS=[0,24,16,10];
export const OFFLINE_PRICES=[3500,50000,500000],OFFLINE_HOURS=[1,2,4,8],OFFLINE_EFFICIENCY=[.15,.25,.4,.55];
export const MODIFIERS=[
  {id:'yield',field:'yieldLevel',name:'Усилитель дохода',prices:[12000,180000,2500000,35000000,400000000]},
  {id:'burn',field:'burnLevel',name:'Катализатор',prices:[7500,110000,1600000]},
  {id:'turbo',field:'turboLevel',name:'Турбонож',prices:[18000,260000,3800000],requiresAuto:true},
];
export const modifierPrice=(s,id)=>{const m=MODIFIERS.find(m=>m.id===id);return m?.prices[s[m.field]??0]??null;};
export const incomeBonus=s=>1+.15*(s.yieldLevel||0);
export const burnDelay=s=>3-.6*(s.burnLevel||0);
export const autoInterval=s=>AUTO_INTERVALS[s.autoLevel]*Math.pow(.9,s.turboLevel||0);
const RETIRED_MATERIALS={molten:'opal',stardust:'nebula',diamond:'petrol'};
export const PRESTIGE_THRESHOLD=5000000,SPARK_BONUS=.25;
const MAX_MONEY=Number.MAX_SAFE_INTEGER;
const bounded=(v,fallback=0,max=MAX_MONEY)=>Number.isFinite(v)?Math.max(0,Math.min(max,Math.floor(v))):fallback;
export function newSave(){return {version:2,coins:0,earned:0,runEarned:0,incomeRemainder:0,cuts:0,owned:['gold'],selected:'gold',activeMaterials:['gold'],feedLevel:0,wireCount:1,autoLevel:0,autoEnabled:true,offlineLevel:0,yieldLevel:0,burnLevel:0,turboLevel:0,sparks:0,prestiges:0,lastSeen:0,sound:false};}
export function parseSave(raw){
  try{const x=JSON.parse(raw);if(!x||![1,2].includes(x.version))return newSave();const s=newSave();
    const mapId=id=>RETIRED_MATERIALS[id]||id;x.owned=Array.isArray(x.owned)?x.owned.map(mapId):x.owned;x.selected=mapId(x.selected);if(Array.isArray(x.activeMaterials))x.activeMaterials=x.activeMaterials.map(mapId);
    for(const k of ['coins','earned','cuts','feedLevel','sparks','prestiges','lastSeen'])s[k]=bounded(x[k]);
    s.runEarned=bounded(x.runEarned,s.earned);
    s.incomeRemainder=Number.isFinite(x.incomeRemainder)?Math.max(0,Math.min(.999999999,x.incomeRemainder)):0;
    s.owned=[...new Set(['gold',...(Array.isArray(x.owned)?x.owned:[]).filter(id=>MATERIALS.some(m=>m.id===id))])];
    const active=Array.isArray(x.activeMaterials)?x.activeMaterials.filter(id=>s.owned.includes(id)):[];
    s.selected=s.owned.includes(x.selected)&&(!active.length||active.includes(x.selected))?x.selected:active[0]||'gold';
    s.activeMaterials=[s.selected];s.wireCount=Math.max(1,bounded(x.wireCount,1));
    s.autoLevel=bounded(x.autoLevel,0,AUTO_PRICES.length);s.offlineLevel=bounded(x.offlineLevel,0,OFFLINE_PRICES.length);s.autoEnabled=x.autoEnabled!==false;
    for(const m of MODIFIERS)s[m.field]=bounded(x[m.field],0,m.prices.length);
    s.sound=x.sound===true;return s;
  }catch{return newSave();}
}
export function purchase(s,id){const m=MATERIALS.find(m=>m.id===id);if(!m)return false;if(!s.owned.includes(id)){if(s.coins<m.price)return false;s.coins-=m.price;s.owned.push(id);}return selectMaterial(s,id);}
export function selectMaterial(s,id){if(!s.owned.includes(id))return false;s.selected=id;s.activeMaterials=[id];return true;}
const price=value=>Number.isFinite(value)?Math.min(MAX_MONEY,Math.round(value)):MAX_MONEY;
export function feedPrice(s){return price(500*Math.pow(2.5,s.feedLevel));}
export function wirePrice(s){return price(1000*Math.pow(1.85,s.wireCount-1)*s.wireCount);}
export const autoPrice=s=>AUTO_PRICES[s.autoLevel]??null;
export const offlinePrice=s=>OFFLINE_PRICES[s.offlineLevel]??null;
export const feedSpeed=s=>1.15*(1+s.feedLevel*.3);
export const permanentBonus=s=>1+s.sparks*SPARK_BONUS;
export function upgrade(s,kind){
  const modifier=MODIFIERS.find(m=>m.id===kind);
  if(modifier){const cost=modifierPrice(s,kind);if(cost===null||s.coins<cost||modifier.requiresAuto&&!s.autoLevel)return false;s.coins-=cost;s[modifier.field]=(s[modifier.field]||0)+1;return true;}
  const entry={wire:['wireCount',wirePrice],feed:['feedLevel',feedPrice],auto:['autoLevel',autoPrice],offline:['offlineLevel',offlinePrice]}[kind];
  if(!Array.isArray(entry)||kind==='offline'&&!s.autoLevel)return false;const cost=entry[1](s);if(cost===null||s.coins<cost)return false;s.coins-=cost;s[entry[0]]++;return true;
}
export function rewardFor(length,material){return Math.max(1,Math.round(length*8*(MATERIALS.find(m=>m.id===material)?.multiplier??1)));}
export function rewardForRope(rope,s=null){const base=rope.links.reduce((sum,length,i)=>sum+length*8*(MATERIALS.find(m=>m.id===(rope.linkMaterials?.[i]||rope.material))?.multiplier??1),0);return Math.max(0,base*(s?permanentBonus(s)*incomeBonus(s):1));}
export function creditIncome(s,amount){
  // Preserve fractional value across fragments: many tiny cuts must not mint
  // one extra coin each. The same total length pays the same total amount.
  const total=(Number.isFinite(amount)?Math.max(0,amount):0)+s.incomeRemainder,value=Math.floor(total+1e-9);s.incomeRemainder=Math.max(0,total-value);
  s.coins=Math.min(MAX_MONEY,s.coins+value);s.earned=Math.min(MAX_MONEY,s.earned+value);s.runEarned=Math.min(MAX_MONEY,s.runEarned+value);return value;
}
export function productionRate(s){
  const active=s.activeMaterials.map(id=>MATERIALS.find(m=>m.id===id)).filter(Boolean);if(!active.length)return 0;
  return feedSpeed(s)*s.wireCount*8*active.reduce((sum,m)=>sum+m.multiplier,0)/active.length*permanentBonus(s)*incomeBonus(s);
}
export function claimOffline(s,now=Date.now()){
  const elapsed=s.lastSeen>0?Math.max(0,(now-s.lastSeen)/1000):0,seconds=Math.min(elapsed,OFFLINE_HOURS[s.offlineLevel]*3600);
  const amount=s.autoLevel&&s.autoEnabled&&elapsed>=60?Math.floor(productionRate(s)*OFFLINE_EFFICIENCY[s.offlineLevel]*seconds):0;
  s.lastSeen=now;creditIncome(s,amount);return {amount,seconds};
}
export const prestigeGain=s=>Math.floor(Math.sqrt(s.runEarned/PRESTIGE_THRESHOLD));
export function prestige(s,now=Date.now()){
  const gain=prestigeGain(s);if(!gain)return 0;
  const keep={earned:s.earned,cuts:s.cuts,sound:s.sound,sparks:s.sparks+gain,prestiges:s.prestiges+1,lastSeen:now};Object.assign(s,newSave(),keep);return gain;
}
