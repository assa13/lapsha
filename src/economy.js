export const MATERIALS = [
  {id:'gold',name:'Золото',color:0xffb92c,price:0,multiplier:1,roughness:.22,metalness:.93},
  {id:'silver',name:'Жемчуг',color:0xe4e5e9,price:120,multiplier:2,roughness:.18,metalness:.82},
  {id:'lava',name:'Лава',color:0xff3b12,price:420,multiplier:4,roughness:.19,metalness:.82},
  {id:'emerald',name:'Изумруд',color:0x5ad900,price:1200,multiplier:7,roughness:.15,metalness:.78},
  {id:'pink',name:'Фуксия',color:0xff087c,price:3200,multiplier:12,roughness:.15,metalness:.85},
  {id:'cosmic',name:'Голографик',color:0x66c9ff,price:6000,multiplier:20,roughness:.14,metalness:.8},
];
export const SAVE_KEY='lapsha-save-v1';
export function newSave(){return {version:1,coins:0,earned:0,cuts:0,owned:['gold'],selected:'gold',activeMaterials:['gold'],feedLevel:0,wireCount:1,sound:false};}
export function parseSave(raw){
  try{const x=JSON.parse(raw);if(!x||x.version!==1)return newSave();const s=newSave();
    for(const k of ['coins','earned','cuts'])s[k]=Number.isFinite(x[k])?Math.max(0,Math.min(1e12,Math.floor(x[k]))):0;
    s.owned=[...new Set(['gold',...(Array.isArray(x.owned)?x.owned:[]).filter(id=>MATERIALS.some(m=>m.id===id))])];
    s.selected=s.owned.includes(x.selected)?x.selected:'gold';s.feedLevel=Number.isFinite(x.feedLevel)?Math.max(0,Math.floor(x.feedLevel)):0;
    s.wireCount=Number.isFinite(x.wireCount)?Math.max(1,Math.floor(x.wireCount)):1;
    s.activeMaterials=Array.isArray(x.activeMaterials)?[...new Set(x.activeMaterials.filter(id=>s.owned.includes(id)))]:[s.selected];
    s.sound=x.sound===true;return s;
  }catch{return newSave();}
}
export function purchase(s,id){const m=MATERIALS.find(m=>m.id===id);if(!m)return false;if(!s.owned.includes(id)){if(s.coins<m.price)return false;s.coins-=m.price;s.owned.push(id);}s.selected=id;if(!s.activeMaterials.includes(id))s.activeMaterials.push(id);return true;}
export function toggleMaterial(s,id){if(!s.owned.includes(id))return false;const i=s.activeMaterials.indexOf(id);if(i<0)s.activeMaterials.push(id);else s.activeMaterials.splice(i,1);s.selected=s.activeMaterials[0]||s.selected;return true;}
export function feedPrice(s){const price=180*Math.pow(2.5,s.feedLevel);return Number.isFinite(price)?Math.round(price):Number.MAX_SAFE_INTEGER;}
export function wirePrice(s){return [0,300,1200,3600,9000][s.wireCount]??600*s.wireCount*s.wireCount;}
export function upgrade(s,kind){if(kind==='wire'){const cost=wirePrice(s);if(s.coins<cost)return false;s.coins-=cost;s.wireCount++;return true;}if(kind==='feed'){const cost=feedPrice(s);if(s.coins<cost)return false;s.coins-=cost;s.feedLevel++;return true;}return false;}
export function rewardFor(length,material){return Math.max(1,Math.round(length*8*MATERIALS.find(m=>m.id===material).multiplier));}
export function rewardForRope(rope){return Math.max(1,Math.round(rope.links.reduce((sum,length,i)=>sum+length*8*MATERIALS.find(m=>m.id===(rope.linkMaterials?.[i]||rope.material)).multiplier,0)));}
