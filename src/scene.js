import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MATERIALS} from './economy.js';
import {createWireMaterial} from './wire-materials.js';
import {RADIUS,FLOOR,BURN_DURATION} from './physics.js';

const WIDTH=6,HEIGHT=6*2868/1320;
const MATERIAL_INDEX=Object.fromEntries(MATERIALS.map((m,i)=>[m.id,i]));
export class GameScene{
  constructor(canvas){
    this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0,0);this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-3,3,HEIGHT/2,-HEIGHT/2,.1,80);this.camera.position.set(0,0,30);
    const pmrem=new THREE.PMREMGenerator(this.renderer),room=new RoomEnvironment();
    this.env=pmrem.fromScene(room,.04);this.scene.environment=this.env.texture;room.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x143080,1));
    const key=new THREE.DirectionalLight(0xffeed6,2.5);key.position.set(-3,6,5);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x84c1ff,1.4);rim.position.set(3,-1,4);this.scene.add(rim);this.rim=rim;
    const backgroundMap=new THREE.TextureLoader().load('./assets/background.svg');backgroundMap.colorSpace=THREE.SRGBColorSpace;
    const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT),new THREE.MeshBasicMaterial({map:backgroundMap,toneMapped:false}));backdrop.position.z=-4;this.scene.add(backdrop);
    this.wireTime={value:0};this.experimentalMaterials=new Set();this.wireTextureStyle='default';this.shopPage=0;
    this.materials=Object.fromEntries(MATERIALS.map(m=>[m.id,this.makeWireMaterial(m.id)]));
    this.play=new THREE.Group();this.shop=new THREE.Group();this.scene.add(this.play,this.shop);this.shop.visible=false;
    this.meshes=new Map();this.angleCache=new Map();this.vials=[];this.mode='game';this.selected=-1;
    this.createShadow();this.createVials();this.createEmbers();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
    this.plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);this.raycaster=new THREE.Raycaster();
  }
  makeWireMaterial(id,phase=0){
    this.wireTime??={value:0};const material=createWireMaterial(id,this.wireTime,phase);this.experimentalMaterials.add(material);return material;
  }
  setShopPage(page){this.shopPage=page;this.setMode(this.mode,this.selected);}
  setWireTexture(style='default'){
    if(style!=='default'&&!MATERIALS.some(m=>m.id===style))style='default';
    if(this.wireTextureStyle===style)return;this.wireTextureStyle=style;
    for(const mesh of this.meshes.values()){this.play.remove(mesh);mesh.geometry.dispose();for(const material of mesh.material){this.experimentalMaterials.delete(material);material.dispose();}}
    this.meshes.clear();
  }
  createShadow(){
    const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');
    ctx.scale(1,.25);const grad=ctx.createRadialGradient(128,128,0,128,128,120);grad.addColorStop(0,'rgba(7,23,70,.45)');grad.addColorStop(1,'rgba(7,23,70,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,256,256);
    const texture=new THREE.CanvasTexture(c);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(5.5,.55),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
    shadow.position.set(0,FLOOR-.045,-.9);this.play.add(shadow);
  }
  createEmbers(){
    const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'white');g.addColorStop(.25,'#ffcf49');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(1800*3),3));geometry.setDrawRange(0,0);
    this.embers=new THREE.Points(geometry,new THREE.PointsMaterial({map:new THREE.CanvasTexture(c),color:0xff9e38,size:5,sizeAttenuation:false,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));this.embers.frustumCulled=false;this.play.add(this.embers);
  }
  createVials(){
    const corkCanvas=document.createElement('canvas');corkCanvas.width=corkCanvas.height=128;const ctx=corkCanvas.getContext('2d');ctx.fillStyle='#b87530';ctx.fillRect(0,0,128,128);
    // Deterministic cork grain, generated once.
    let seed=42;for(let i=0;i<1200;i++){seed=(seed*16807)%2147483647;const x=seed%128;seed=(seed*16807)%2147483647;const y=seed%128;ctx.fillStyle=i%3?'#774716':'#d79449';ctx.fillRect(x,y,1+(i%3),1+(i%2));}
    const corkMap=new THREE.CanvasTexture(corkCanvas);corkMap.colorSpace=THREE.SRGBColorSpace;
    const glass=new THREE.MeshPhysicalMaterial({color:0xe4eeff,metalness:0,roughness:.02,transmission:.98,thickness:.045,ior:1.15,clearcoat:1,transparent:true,opacity:1,envMapIntensity:1.1,depthWrite:false});
    const lipMaterial=new THREE.MeshPhysicalMaterial({color:0xc8d9f0,metalness:.45,roughness:.13,transparent:true,opacity:.65,depthWrite:false});
    const profile=[new THREE.Vector2(0,-1.18),new THREE.Vector2(.12,-1.17),new THREE.Vector2(.23,-1.09),new THREE.Vector2(.265,-.98),new THREE.Vector2(.265,.94),new THREE.Vector2(.295,.97),new THREE.Vector2(.295,1.05),new THREE.Vector2(.25,1.07)];
    const bottleGeometry=new THREE.LatheGeometry(profile,32);
    const corkGeometry=new THREE.CylinderGeometry(.25,.235,.27,24);
    const corkMaterial=new THREE.MeshStandardMaterial({map:corkMap,roughness:.83});
    const ringGeometry=new THREE.TorusGeometry(.268,.027,8,32);
    for(let index=0;index<MATERIALS.length;index++){
      const m=MATERIALS[index],group=new THREE.Group();
      const points=[];for(let k=0;k<=40;k++){const t=k/40;points.push(new THREE.Vector3(Math.sin(t*Math.PI*3.5)*.115,-.99+t*1.87,Math.cos(t*Math.PI*3.5)*.085));}
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),128,.108,12,false),this.materials[m.id]));
      const bottle=new THREE.Mesh(bottleGeometry,glass);bottle.renderOrder=2;group.add(bottle);
      const cork=new THREE.Mesh(corkGeometry,corkMaterial);cork.position.y=1.155;group.add(cork);
      const lip=new THREE.Mesh(ringGeometry,lipMaterial);lip.rotation.x=Math.PI/2;lip.position.y=1.025;group.add(lip);
      for(let j=0;j<5;j++){const b=new THREE.Mesh(new THREE.SphereGeometry(.03+j%2*.011,10,8),this.materials[m.id]);b.position.set(Math.sin(j*3)*.16,-.72+j*.34,.09);group.add(b);}
      // Visible glass edge highlights: real geometry, not a flat bottle image.
      const edgeMat=new THREE.MeshBasicMaterial({color:0xe4f1ff,transparent:true,opacity:.45});
      const edge=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,1.82,6),edgeMat);edge.position.set(-.225,-.03,.13);group.add(edge);
      group.position.set((index%3-1)*1.77,index%6<3?2.65:-.74,0);group.rotation.z=-.12;
      group.userData={index,home:group.position.clone()};this.shop.add(group);this.vials.push(group);
    }
    this.dim=new THREE.Mesh(new THREE.PlaneGeometry(20,30),new THREE.MeshBasicMaterial({color:0x1c51bd,transparent:true,opacity:.83,depthWrite:false}));this.dim.position.z=2;this.dim.visible=false;this.scene.add(this.dim);
  }
  resize(){const r=this.canvas.getBoundingClientRect();if(r.width&&r.height){this.renderer.setSize(r.width,r.height,false);}}
  setMode(mode,selected=-1){
    this.mode=mode;this.selected=selected;this.play.visible=mode==='game';this.shop.visible=mode==='shop'||mode==='detail';this.dim.visible=mode==='detail';
    for(let i=0;i<this.vials.length;i++){const v=this.vials[i];v.visible=mode==='detail'?i===selected:Math.floor(i/6)===this.shopPage;v.position.copy(v.userData.home);v.scale.setScalar(.88);v.rotation.z=-.12;
      if(mode==='detail'&&i===selected){v.position.set(.12,1.0,4);v.scale.setScalar(1.7);v.rotation.z=-.15;}
    }
  }
  screenToWorld(x,y){const r=this.canvas.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),this.camera);const p=new THREE.Vector3();this.raycaster.ray.intersectPlane(this.plane,p);return p;}
  worldToScreen(p){const v=new THREE.Vector3(p.x,p.y,p.z||0).project(this.camera);return {x:(v.x+1)*.5,y:(1-v.y)*.5};}
  syncRopes(ropes,wireRadius=RADIUS){
    let emberCount=0;const emberPositions=this.embers.geometry.attributes.position;
    const ids=new Set(ropes.map(r=>r.id));for(const [id,mesh]of this.meshes){if(!ids.has(id)){this.play.remove(mesh);mesh.geometry.dispose();for(const mat of mesh.material){this.experimentalMaterials.delete(mat);mat.dispose();}this.meshes.delete(id);}}
    const nodeCount=ropes.reduce((n,r)=>n+r.nodes.length,0);
    const samplesPerLink=nodeCount>4000?1:nodeCount>1800?2:3,radial=nodeCount>4000?4:nodeCount>1800?5:6;
    let angles=this.angleCache.get(radial);if(!angles){angles=new Float32Array(radial*2);for(let j=0;j<radial;j++){angles[j*2]=Math.cos(j/radial*Math.PI*2);angles[j*2+1]=Math.sin(j/radial*Math.PI*2);}this.angleCache.set(radial,angles);}
    for(const r of ropes){
      let mesh=this.meshes.get(r.id);const rings=(r.nodes.length-1)*samplesPerLink+1;
      if(!mesh){const style=this.wireTextureStyle,phase=((r.id*.61803398875)%1)*30,materials=MATERIALS.map(m=>this.makeWireMaterial(style==='default'?m.id:style,phase));mesh=new THREE.Mesh(new THREE.BufferGeometry(),materials);mesh.frustumCulled=false;mesh.userData.textureStyle=style;mesh.userData.timeOffset=phase;this.meshes.set(r.id,mesh);this.play.add(mesh);}
      const resized=mesh.userData.rings!==rings||mesh.userData.radial!==radial;
      if(!mesh.userData.capacity||rings>mesh.userData.capacity||mesh.userData.radial!==radial){
        // Reserve room for growth so extrusion does not create and destroy GPU
        // buffers for every new node. Only the live part is drawn.
        const capacity=2**Math.ceil(Math.log2(Math.max(16,rings)));
        mesh.geometry.dispose();const g=new THREE.BufferGeometry();for(const name of ['position','normal'])g.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*radial*3),3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(capacity*radial*2),2).setUsage(THREE.DynamicDrawUsage));
        const indices=new (capacity*radial>65535?Uint32Array:Uint16Array)((capacity-1)*radial*6);let k=0;for(let i=0;i<capacity-1;i++)for(let j=0;j<radial;j++){const a=i*radial+j,b=i*radial+(j+1)%radial,c=a+radial,d=b+radial;indices[k++]=a;indices[k++]=b;indices[k++]=c;indices[k++]=b;indices[k++]=d;indices[k++]=c;}g.setIndex(new THREE.BufferAttribute(indices,1));mesh.geometry=g;mesh.userData.capacity=capacity;
      }
      if(resized){
        const uv=mesh.geometry.attributes.uv;for(let i=0;i<rings;i++)for(let j=0;j<radial;j++)uv.setXY(i*radial+j,i/(rings-1),j/radial);uv.addUpdateRange(0,rings*radial*2);uv.needsUpdate=true;
        mesh.geometry.setDrawRange(0,(rings-1)*radial*6);mesh.userData.rings=rings;mesh.userData.radial=radial;
      }
      if(resized||mesh.userData.linkMaterials!==r.linkMaterials){
        mesh.geometry.clearGroups();let runStart=0;for(let i=1;i<=r.links.length;i++){if(i===r.links.length||r.linkMaterials[i]!==r.linkMaterials[runStart]){const unit=samplesPerLink*radial*6;mesh.geometry.addGroup(runStart*unit,(i-runStart)*unit,MATERIAL_INDEX[r.linkMaterials[runStart]]);runStart=i;}}
        mesh.userData.linkMaterials=r.linkMaterials;
      }
      let firstChanged=resized?0:Infinity,lastChanged=resized?r.nodes.length-1:-1;
      const points=mesh.userData.points??=[];while(points.length<r.nodes.length)points.push(new THREE.Vector3());points.length=r.nodes.length;for(let i=0;i<r.nodes.length;i++){const p=r.nodes[i],v=points[i];if(v.x!==p.x||v.y!==p.y||v.z!==p.z){firstChanged=Math.min(firstChanged,i);lastChanged=Math.max(lastChanged,i);v.set(p.x,p.y,p.z);}}mesh.userData.points=points;
      const curve=mesh.userData.curve??new THREE.CatmullRomCurve3(points,false,'catmullrom',.42);curve.points=points;mesh.userData.curve=curve;
      const samples=mesh.userData.samples??=[];while(samples.length<rings)samples.push(new THREE.Vector3());samples.length=rings;mesh.userData.samples=samples;
      const pos=mesh.geometry.attributes.position,norm=mesh.geometry.attributes.normal;
      const burn=Math.min(1,r.fade/BURN_DURATION);
      if(burn!==mesh.userData.lastBurn||wireRadius!==mesh.userData.wireRadius){firstChanged=0;lastChanged=r.nodes.length-1;}
      mesh.userData.wireRadius=wireRadius;
      for(const mat of mesh.material)mat.userData.wireUniforms.uWireBurn.value=burn;mesh.userData.lastBurn=burn;
      if(burn>0){for(let i=0;i<r.nodes.length&&emberCount<1800;i+=2){const p=r.nodes[i],phase=(burn+(i*.173)%1)%1;emberPositions.setXYZ(emberCount++,p.x+Math.sin(i*2.4+burn*6)*phase*.25,p.y+phase*.85,p.z+.08);}}
      if(lastChanged<0)continue;
      // Catmull-Rom uses four control points; normals also need one neighboring
      // sample. Include that halo when uploading only a moving section.
      const firstRing=Math.max(0,(firstChanged-2)*samplesPerLink-1),lastRing=Math.min(rings-1,(lastChanged+2)*samplesPerLink+1);
      for(let i=Math.max(0,firstRing-1);i<=Math.min(rings-1,lastRing+1);i++)curve.getPoint(i/(rings-1),samples[i]);
      const tangent=mesh.userData.tangent??new THREE.Vector3(),side=mesh.userData.side??new THREE.Vector3(),normal=mesh.userData.normal??new THREE.Vector3();mesh.userData.tangent=tangent;mesh.userData.side=side;mesh.userData.normal=normal;
      for(let i=firstRing;i<=lastRing;i++){
        tangent.subVectors(samples[Math.min(rings-1,i+1)],samples[Math.max(0,i-1)]).normalize();
        side.set(-tangent.y,tangent.x,0).normalize();if(side.lengthSq()<.001)side.set(1,0,0);
        normal.crossVectors(tangent,side).normalize();
        for(let j=0;j<radial;j++){const c=angles[j*2],s=angles[j*2+1],nx=side.x*c+normal.x*s,ny=side.y*c+normal.y*s,nz=side.z*c+normal.z*s,k=i*radial+j;
          const radius=wireRadius*Math.max(.001,1-burn);pos.setXYZ(k,samples[i].x+nx*radius,samples[i].y+ny*radius,samples[i].z+nz*radius);norm.setXYZ(k,nx,ny,nz);
        }
      }
      for(const attribute of [pos,norm]){attribute.addUpdateRange(firstRing*radial*3,(lastRing-firstRing+1)*radial*3);attribute.needsUpdate=true;}
    }
    emberPositions.needsUpdate=true;this.embers.geometry.setDrawRange(0,emberCount);
  }
  render(time,ropes,wireRadius=RADIUS){
    this.rim.position.x=3+Math.sin(time*.65)*2;
    this.wireTime.value=time;
    if(this.mode==='game')this.syncRopes(ropes,wireRadius);
    else for(let i=0;i<this.vials.length;i++){const v=this.vials[i];v.rotation.y=Math.sin(time*.7+i)*.2;if(this.mode==='detail'&&i===this.selected)v.rotation.y=time*.22;}
    this.renderer.render(this.scene,this.camera);
  }
}
