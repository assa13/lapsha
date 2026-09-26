import {MATERIALS} from './economy.js';
import {RADIUS,BURN_DURATION} from './physics.js';

const WIDTH=6,HEIGHT=6*2868/1320;
const byId=Object.fromEntries(MATERIALS.map(m=>[m.id,m]));
const hex=value=>'#'+value.toString(16).padStart(6,'0');

// Keep the existing 3D simulation and orthographic input coordinates. Only
// drawing changes when the browser cannot provide a WebGL 2 context at all.
export class CanvasScene{
  constructor(canvas){
    this.canvas=canvas;this.context=canvas.getContext('2d');
    if(!this.context)throw new Error('Браузер не предоставил Canvas 2D.');
    this.kind='canvas2d';this.mode='game';this.shopPage=0;this.selected=-1;this.wireTextureStyle='default';
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }
  resize(){
    const r=this.canvas.getBoundingClientRect(),ratio=Math.min(globalThis.devicePixelRatio||1,1.5);
    if(r.width&&r.height){this.canvas.width=Math.round(r.width*ratio);this.canvas.height=Math.round(r.height*ratio);}
  }
  setMode(mode,selected=-1){this.mode=mode;this.selected=selected;}
  setShopPage(page){this.shopPage=page;}
  setWireTexture(style='default'){this.wireTextureStyle=byId[style]?style:'default';}
  screenToWorld(x,y){const r=this.canvas.getBoundingClientRect();return {x:((x-r.left)/r.width-.5)*WIDTH,y:(.5-(y-r.top)/r.height)*HEIGHT,z:0};}
  worldToScreen(p){return {x:p.x/WIDTH+.5,y:.5-p.y/HEIGHT};}
  paint(id,time){
    const m=byId[id]||MATERIALS[0],c=this.context;
    const gradient=c.createLinearGradient(-.3,-6,.3,6),shift=(Math.sin(time*.7)+1)*.15;
    gradient.addColorStop(0,hex(m.color));gradient.addColorStop(.35+shift,hex(m.accent));gradient.addColorStop(1,hex(m.color));
    return gradient;
  }
  stroke(nodes,start,end,paint,radius){
    if(end<=start)return;const c=this.context;c.beginPath();c.moveTo(nodes[start].x,nodes[start].y);
    for(let i=start+1;i<=end;i++)c.lineTo(nodes[i].x,nodes[i].y);
    c.lineWidth=radius*2;c.strokeStyle=paint;c.stroke();
    c.lineWidth=radius*.4;c.strokeStyle='#ffffff55';c.stroke();
  }
  drawRopes(ropes,radius,time){
    const c=this.context,paints=new Map();
    for(const rope of ropes){
      const burn=Math.min(1,rope.fade/BURN_DURATION),r=radius*Math.max(.001,1-burn);
      c.globalAlpha=1-burn*.8;let start=0;
      for(let i=1;i<rope.nodes.length;i++){
        const id=this.wireTextureStyle==='default'?(rope.linkMaterials[start]||rope.material):this.wireTextureStyle;
        if(i===rope.nodes.length-1||rope.linkMaterials[i]!==rope.linkMaterials[start]){
          if(!paints.has(id))paints.set(id,this.paint(id,time));
          this.stroke(rope.nodes,start,i,burn?'#ffa633':paints.get(id),r);start=i;
        }
      }
    }
    c.globalAlpha=1;
  }
  drawVial(index,time){
    const c=this.context,detail=this.mode==='detail',scale=detail?1.7:.88;
    c.save();c.translate(detail?.12:(index%3-1)*1.77,detail?1:index%6<3?2.65:-.74);c.rotate(detail?-.15:-.12);c.scale(scale,scale);
    const nodes=[];for(let k=0;k<=48;k++){const t=k/48;nodes.push({x:Math.sin(t*Math.PI*3.5+Math.sin(time*.7+index)*.2)*.115,y:-.99+t*1.87});}
    this.stroke(nodes,0,nodes.length-1,this.paint(MATERIALS[index].id,time),.108);
    c.beginPath();c.moveTo(-.265,1.05);c.lineTo(-.265,-.96);c.quadraticCurveTo(-.265,-1.18,0,-1.18);c.quadraticCurveTo(.265,-1.18,.265,-.96);c.lineTo(.265,1.05);c.closePath();
    c.fillStyle='#cde7ff1f';c.fill();c.lineWidth=.015;c.strokeStyle='#e4f1ff88';c.stroke();
    c.beginPath();c.moveTo(-.225,-.87);c.lineTo(-.225,.93);c.stroke();
    c.fillStyle='#c89148';c.fillRect(-.25,1.025,.5,.27);c.fillStyle='#f6cc86';c.fillRect(-.25,1.265,.5,.035);
    c.restore();
  }
  render(time,ropes,radius=RADIUS){
    const c=this.context,w=this.canvas.width,h=this.canvas.height;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,w,h);c.setTransform(w/WIDTH,0,0,-h/HEIGHT,w/2,h/2);c.lineCap='round';c.lineJoin='round';
    if(this.mode==='game')this.drawRopes(ropes,radius,time);
    else if(this.mode==='detail'){
      c.fillStyle='#1c51bdd4';c.fillRect(-WIDTH/2,-HEIGHT/2,WIDTH,HEIGHT);
      if(MATERIALS[this.selected])this.drawVial(this.selected,time);
    }else if(this.mode==='shop')for(let i=this.shopPage*6;i<Math.min(MATERIALS.length,(this.shopPage+1)*6);i++)this.drawVial(i,time);
  }
}
