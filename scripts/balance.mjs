import {MATERIALS,MODIFIERS,modifierPrice,newSave,purchase,upgrade,feedPrice,wirePrice,autoPrice,offlinePrice,productionRate,creditIncome,prestigeGain} from '../src/economy.js';
import {pathToFileURL} from 'node:url';

// Economic model, not hours of real-time WebGL gameplay.
// Finite target: all materials + all automation/offline levels + prestige unlock.
// Invest by shortest payback; buy idle features when <= 2 minutes of production.
export function simulate({efficiency=.85,buyEvery=10,maxHours=168}={}){
  const s=newSave(),events=[],milestones={};let remainder=0;
  const rate=()=>productionRate(s)*efficiency;
  for(let t=1;t<=maxHours*3600;t++){
    const earned=rate()+remainder;creditIncome(s,Math.floor(earned));remainder=earned%1;
    if(t%buyEvery)continue;
    for(let attempt=0;attempt<20;attempt++){
      const next=MATERIALS.find(m=>!s.owned.includes(m.id)),current=rate(),candidates=[];
      for(const kind of ['wire','feed']){const cost=(kind==='wire'?wirePrice:feedPrice)(s),copy={...s};copy[kind==='wire'?'wireCount':'feedLevel']++;const gain=productionRate(copy)*efficiency-current;candidates.push({kind,cost,payback:cost/Math.max(.001,gain)});}
      if(next){const copy={...s,selected:next.id,activeMaterials:[next.id]};const gain=productionRate(copy)*efficiency-current;candidates.push({kind:'material',id:next.id,cost:next.price,payback:next.price/Math.max(.001,gain)});}
      for(const m of MODIFIERS){const cost=modifierPrice(s,m.id);if(cost===null||m.requiresAuto&&!s.autoLevel)continue;
        if(m.id==='yield'){const copy={...s,yieldLevel:s.yieldLevel+1},gain=productionRate(copy)*efficiency-current;candidates.push({kind:m.id,cost,payback:cost/Math.max(.001,gain)});}
        else if(!next||cost<=current*120)candidates.push({kind:m.id,cost,payback:0});
      }
      for(const kind of ['auto','offline']){const cost=(kind==='auto'?autoPrice:offlinePrice)(s);if(cost!==null&&(kind==='auto'||s.autoLevel)&&(!next||cost<=current*120))candidates.push({kind,cost,payback:0});}
      const target=candidates.sort((a,b)=>a.payback-b.payback)[0];if(!target||s.coins<target.cost)break;
      const ok=target.kind==='material'?purchase(s,target.id):upgrade(s,target.kind);if(!ok)break;
      events.push({seconds:t,purchase:target.id??target.kind,cost:target.cost,rate:Math.round(rate()),sources:s.wireCount,feedLevel:s.feedLevel});
      if(target.kind==='material')milestones[target.id]=t;
      if(s.autoLevel&&!milestones.automation)milestones.automation=t;
    }
    if(prestigeGain(s)&&!milestones.prestige)milestones.prestige=t;
    if(s.owned.length===MATERIALS.length&&s.autoLevel===3&&s.offlineLevel===3&&MODIFIERS.every(m=>s[m.field]===m.prices.length)&&prestigeGain(s))return {hours:t/3600,seconds:t,milestones,events,wireCount:s.wireCount,feedLevel:s.feedLevel,rate:rate(),sparks:prestigeGain(s)};
  }
  return {hours:null,milestones,events};
}
export function balanceReport(){return [
  {name:'Быстрый игрок',assumptions:'Лучший материал; 95% реализации подачи; покупки каждые 5 с',...simulate({efficiency:.95,buyEvery:5})},
  {name:'Обычная активная игра',assumptions:'Лучший материал; 85% реализации подачи; покупки каждые 30 с',...simulate({efficiency:.85,buyEvery:30})},
  {name:'Редкие покупки и разрезы',assumptions:'Новый материал выбирается при покупке; 70% реализации подачи; покупки раз в 2 минуты',...simulate({efficiency:.7,buyEvery:120})},
];}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  for(const r of balanceReport())console.log(r.name,JSON.stringify({hours:r.hours,wireCount:r.wireCount,feedLevel:r.feedLevel,milestones:r.milestones}));
}
