import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MATERIALS} from './economy.js';
import {RADIUS,FLOOR,BURN_DURATION} from './physics.js';

const WIDTH=6,HEIGHT=6*2868/1320;
const BURN_COLOR=new THREE.Color(0x5a1605),MATERIAL_INDEX=Object.fromEntries(MATERIALS.map((m,i)=>[m.id,i]));
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
    this.materials=Object.fromEntries(MATERIALS.map(m=>[m.id,new THREE.MeshPhysicalMaterial({color:m.color,metalness:m.metalness,roughness:m.roughness,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.3,iridescence:m.id==='cosmic'?1:.18,iridescenceIOR:1.35,iridescenceThicknessRange:[120,420]})]));
    this.electricNoise=this.createElectricNoise();this.experimentalMaterials=new Set();this.wireTextureStyle='default';
    this.play=new THREE.Group();this.shop=new THREE.Group();this.scene.add(this.play,this.shop);this.shop.visible=false;
    this.meshes=new Map();this.angleCache=new Map();this.vials=[];this.mode='game';this.selected=-1;
    this.createShadow();this.createVials();this.createEmbers();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
    this.plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);this.raycaster=new THREE.Raycaster();
  }
  createElectricNoise(){
    const size=128,data=new Uint8Array(size*size*4);let seed=17041;
    for(let i=0;i<size*size;i++){seed=seed*1664525+1013904223>>>0;const value=seed>>>24,k=i*4;data[k]=data[k+1]=data[k+2]=value;data[k+3]=255;}
    const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
  }
  createElectricMaterial(){
    // Tube-space adaptation of https://www.shadertoy.com/view/ldlXRS.
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uBurn:{value:0},uNoise:{value:this.electricNoise},uBaseColor:{value:new THREE.Color(.35,.12,.85)}},
      vertexShader:`varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp float;uniform float uTime;uniform float uBurn;uniform sampler2D uNoise;uniform vec3 uBaseColor;varying vec2 vUv;varying vec3 vNormal;const float TAU=6.2831853;mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}float noise2(vec2 p){return texture2D(uNoise,fract(p*.01)).r;}float fbm(vec2 p){float z=2.,r=0.;for(int i=0;i<5;i++){r+=abs((noise2(p)-.5)*2.)/z;z*=2.;p*=2.;}return r;}float dualFbm(vec2 p){vec2 q=p*.7;vec2 basis=vec2(fbm(q-uTime*1.6),fbm(q+uTime*1.7));p+=(basis-.5)*.2;return fbm(p*rot(uTime*.2));}float rings(vec2 p){float r=.5*log(max(length(p),.0001));return abs(mod(r*4.,TAU)-3.14)*3.+.2;}void main(){vec2 p=vec2((vUv.x-.5)*18.,(vUv.y-.5)*4.);float rz=dualFbm(p);rz*=pow(abs(.1-rings(p)),.9);vec3 col=uBaseColor/max(rz,.025);col=pow(abs(col),vec3(.99));col=col/(.55+col);float rim=.72+.28*abs(vNormal.z);float travel=fract(uTime*.22),d=abs(vUv.x-travel);d=min(d,1.-d);float pulse=exp(-d*d*180.);col*=rim*(.55+1.8*pulse);col=mix(col,vec3(1.,.13,.01),uBurn*.75);gl_FragColor=vec4(col,1.);}`,
      toneMapped:false
    });
    this.experimentalMaterials.add(material);return material;
  }
  createMoltenMaterial(){
    // Seamless tube-space adaptation of "Molten II" by misol101:
    // https://www.shadertoy.com/view/DdyGDD
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uBurn:{value:0}},
      vertexShader:`varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp float;uniform float uTime;uniform float uBurn;varying vec2 vUv;varying vec3 vNormal;const float TAU=6.2831853;void main(){float a=vUv.y*TAU;vec2 p=vec2(vUv.x*11.+cos(a)*.45,sin(a)*1.7+cos((uTime+5.)*.1)*4.);vec2 r=vec2(0.);float f=1.;for(int i=0;i<24;i++){r+=sin(p*f+uTime*.85)/f;f*=1.17;}float l=length(r);vec3 col=vec3(l*.29,l*l*.024,l*l*l*.0016);col*=.7+.3*abs(vNormal.z);col=mix(col,vec3(1.,.08,.01),uBurn*.78);gl_FragColor=vec4(col,1.);}`,
      toneMapped:false
    });
    this.experimentalMaterials.add(material);return material;
  }
  createChromaticMaterial(){
    // Created by randy read (rcread), 2015; mod of
    // https://www.shadertoy.com/view/MtjXzc
    // CC BY-NC-SA 3.0: https://creativecommons.org/licenses/by-nc-sa/3.0/
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:{value:0},uBurn:{value:0}},
      vertexShader:`varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp float;uniform float uTime;uniform float uBurn;varying vec2 vUv;varying vec3 vNormal;const float TAU=6.2831853;void main(){float a=vUv.y*TAU;vec2 uv=vec2((vUv.x-.5)*.5+cos(a)*.04-uTime*.1,sin(a)*.175);vec3 c=cos(vec3(uTime*.06,uTime*.045,uTime*.015))*2.+2.;for(int i=0;i<27;i++){vec3 p=vec3(uv*float(i),float(i));c+=abs(vec3(cos(c.y+sin(p.x)),cos(c.z+sin(p.z)),-cos(c.x+sin(p.y))));}vec3 col=(c*.04-.66)*3.;col*=.78+.22*abs(vNormal.z);col=mix(col,vec3(1.,.1,.02),uBurn*.75);gl_FragColor=vec4(col,1.);}`,
      toneMapped:false
    });
    this.experimentalMaterials.add(material);return material;
  }
  setWireTexture(style='default'){
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
    const glass=new THREE.MeshPhysicalMaterial({color:0xe4eeff,metalness:0,roughness:.07,transmission:.98,thickness:.12,ior:1.45,clearcoat:1,transparent:true,opacity:1,envMapIntensity:1.1,depthWrite:false});
    const lipMaterial=new THREE.MeshPhysicalMaterial({color:0xc8d9f0,metalness:.45,roughness:.13,transparent:true,opacity:.65,depthWrite:false});
    const profile=[new THREE.Vector2(0,-1.18),new THREE.Vector2(.12,-1.17),new THREE.Vector2(.23,-1.09),new THREE.Vector2(.265,-.98),new THREE.Vector2(.265,.94),new THREE.Vector2(.295,.97),new THREE.Vector2(.295,1.05),new THREE.Vector2(.25,1.07)];
    const bottleGeometry=new THREE.LatheGeometry(profile,32);
    const corkGeometry=new THREE.CylinderGeometry(.25,.235,.27,24);
    const corkMaterial=new THREE.MeshStandardMaterial({map:corkMap,roughness:.83});
    const ringGeometry=new THREE.TorusGeometry(.268,.027,8,32);
    for(let index=0;index<MATERIALS.length;index++){
      const m=MATERIALS[index],group=new THREE.Group();
      const points=[];for(let k=0;k<=40;k++){const t=k/40;points.push(new THREE.Vector3(Math.sin(t*Math.PI*3.5)*.115,-.99+t*1.87,Math.cos(t*Math.PI*3.5)*.085));}
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,.084,12,false),this.materials[m.id]));
      const bottle=new THREE.Mesh(bottleGeometry,glass);bottle.renderOrder=2;group.add(bottle);
      const cork=new THREE.Mesh(corkGeometry,corkMaterial);cork.position.y=1.155;group.add(cork);
      const lip=new THREE.Mesh(ringGeometry,lipMaterial);lip.rotation.x=Math.PI/2;lip.position.y=1.025;group.add(lip);
      for(let j=0;j<5;j++){const b=new THREE.Mesh(new THREE.SphereGeometry(.03+j%2*.011,10,8),this.materials[m.id]);b.position.set(Math.sin(j*3)*.16,-.72+j*.34,.09);group.add(b);}
      // Visible glass edge highlights: real geometry, not a flat bottle image.
      const edgeMat=new THREE.MeshBasicMaterial({color:0xe4f1ff,transparent:true,opacity:.45});
      const edge=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,1.82,6),edgeMat);edge.position.set(-.225,-.03,.13);group.add(edge);
      group.position.set((index%3-1)*1.77,index<3?2.65:-.74,0);group.rotation.z=-.12;
      group.userData={index,home:group.position.clone()};this.shop.add(group);this.vials.push(group);
    }
    this.dim=new THREE.Mesh(new THREE.PlaneGeometry(20,30),new THREE.MeshBasicMaterial({color:0x1c51bd,transparent:true,opacity:.83,depthWrite:false}));this.dim.position.z=2;this.dim.visible=false;this.scene.add(this.dim);
  }
  resize(){const r=this.canvas.getBoundingClientRect();if(r.width&&r.height){this.renderer.setSize(r.width,r.height,false);}}
  setMode(mode,selected=-1){
    this.mode=mode;this.selected=selected;this.play.visible=mode==='game';this.shop.visible=mode!=='game';this.dim.visible=mode==='detail';
    for(let i=0;i<this.vials.length;i++){const v=this.vials[i];v.position.copy(v.userData.home);v.scale.setScalar(1);v.rotation.z=-.12;
      if(mode==='detail'&&i===selected){v.position.set(.12,1.0,4);v.scale.setScalar(1.7);v.rotation.z=-.15;}
    }
  }
  screenToWorld(x,y){const r=this.canvas.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),this.camera);const p=new THREE.Vector3();this.raycaster.ray.intersectPlane(this.plane,p);return p;}
  worldToScreen(p){const v=new THREE.Vector3(p.x,p.y,p.z||0).project(this.camera);return {x:(v.x+1)*.5,y:(1-v.y)*.5};}
  syncRopes(ropes){
    let emberCount=0;const emberPositions=this.embers.geometry.attributes.position;
    const ids=new Set(ropes.map(r=>r.id));for(const [id,mesh]of this.meshes){if(!ids.has(id)){this.play.remove(mesh);mesh.geometry.dispose();for(const mat of mesh.material){this.experimentalMaterials.delete(mat);mat.dispose();}this.meshes.delete(id);}}
    const nodeCount=ropes.reduce((n,r)=>n+r.nodes.length,0);
    const samplesPerLink=nodeCount>4000?1:nodeCount>1800?2:3,radial=nodeCount>4000?4:nodeCount>1800?5:6;
    let angles=this.angleCache.get(radial);if(!angles){angles=new Float32Array(radial*2);for(let j=0;j<radial;j++){angles[j*2]=Math.cos(j/radial*Math.PI*2);angles[j*2+1]=Math.sin(j/radial*Math.PI*2);}this.angleCache.set(radial,angles);}
    for(const r of ropes){
      let mesh=this.meshes.get(r.id);const rings=(r.nodes.length-1)*samplesPerLink+1;
      if(!mesh){const style=this.wireTextureStyle,shaderStyle=['electric','molten','chromatic'].includes(style)?style:style==='default'&&(r.experimentalShader===true||r.sourceIndex===1)?'electric':null;const materials=shaderStyle?MATERIALS.map(()=>shaderStyle==='molten'?this.createMoltenMaterial():shaderStyle==='chromatic'?this.createChromaticMaterial():this.createElectricMaterial()):style==='default'?MATERIALS.map(m=>this.materials[m.id].clone()):MATERIALS.map(()=>this.materials[style].clone());mesh=new THREE.Mesh(new THREE.BufferGeometry(),materials);mesh.frustumCulled=false;mesh.userData.experimental=shaderStyle!==null;mesh.userData.shaderStyle=shaderStyle;mesh.userData.textureStyle=style;mesh.userData.timeOffset=((r.id*.61803398875)%1)*30;if(shaderStyle)for(const material of materials)material.userData.timeOffset=mesh.userData.timeOffset;this.meshes.set(r.id,mesh);this.play.add(mesh);}
      if(mesh.userData.rings!==rings||mesh.userData.radial!==radial){
        mesh.geometry.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rings*radial*3),3));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(rings*radial*3),3));const uv=new Float32Array(rings*radial*2);for(let i=0;i<rings;i++)for(let j=0;j<radial;j++){const k=(i*radial+j)*2;uv[k]=i/(rings-1);uv[k+1]=j/radial;}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
        const indices=[];for(let i=0;i<rings-1;i++)for(let j=0;j<radial;j++){const a=i*radial+j,b=i*radial+(j+1)%radial,c=a+radial,d=b+radial;indices.push(a,b,c,b,d,c);}g.setIndex(indices);mesh.geometry=g;mesh.userData.rings=rings;mesh.userData.radial=radial;
        mesh.geometry.clearGroups();let runStart=0;for(let i=1;i<=r.links.length;i++){if(i===r.links.length||r.linkMaterials[i]!==r.linkMaterials[runStart]){const unit=samplesPerLink*radial*6;mesh.geometry.addGroup(runStart*unit,(i-runStart)*unit,MATERIAL_INDEX[r.linkMaterials[runStart]]);runStart=i;}}
      }
      const points=mesh.userData.points??=[];while(points.length<r.nodes.length)points.push(new THREE.Vector3());points.length=r.nodes.length;for(let i=0;i<r.nodes.length;i++)points[i].set(r.nodes[i].x,r.nodes[i].y,r.nodes[i].z);mesh.userData.points=points;
      const curve=mesh.userData.curve??new THREE.CatmullRomCurve3(points,false,'catmullrom',.42);curve.points=points;mesh.userData.curve=curve;
      const samples=mesh.userData.samples??=[];while(samples.length<rings)samples.push(new THREE.Vector3());samples.length=rings;for(let i=0;i<rings;i++)curve.getPoint(i/(rings-1),samples[i]);mesh.userData.samples=samples;
      const pos=mesh.geometry.attributes.position,norm=mesh.geometry.attributes.normal;
      const burn=Math.min(1,r.fade/BURN_DURATION);
      if(mesh.userData.experimental){for(const mat of mesh.material)mat.uniforms.uBurn.value=burn;}else if(burn>0||mesh.userData.lastBurn>0)for(let i=0;i<mesh.material.length;i++){const mat=mesh.material[i],materialId=mesh.userData.textureStyle==='default'?MATERIALS[i].id:mesh.userData.textureStyle;mat.emissive.setHex(0xff4a05);mat.emissiveIntensity=burn>0?Math.sin(burn*Math.PI)*3:0;mat.color.copy(this.materials[materialId].color).lerp(BURN_COLOR,burn*.8);}mesh.userData.lastBurn=burn;
      if(burn>0){for(let i=0;i<r.nodes.length&&emberCount<1800;i+=2){const p=r.nodes[i],phase=(burn+(i*.173)%1)%1;emberPositions.setXYZ(emberCount++,p.x+Math.sin(i*2.4+burn*6)*phase*.25,p.y+phase*.85,p.z+.08);}}
      const tangent=mesh.userData.tangent??new THREE.Vector3(),side=mesh.userData.side??new THREE.Vector3(),normal=mesh.userData.normal??new THREE.Vector3();mesh.userData.tangent=tangent;mesh.userData.side=side;mesh.userData.normal=normal;
      for(let i=0;i<rings;i++){
        tangent.subVectors(samples[Math.min(rings-1,i+1)],samples[Math.max(0,i-1)]).normalize();
        side.set(-tangent.y,tangent.x,0).normalize();if(side.lengthSq()<.001)side.set(1,0,0);
        normal.crossVectors(tangent,side).normalize();
        for(let j=0;j<radial;j++){const c=angles[j*2],s=angles[j*2+1],nx=side.x*c+normal.x*s,ny=side.y*c+normal.y*s,nz=side.z*c+normal.z*s,k=i*radial+j;
          const radius=RADIUS*Math.max(.001,1-burn);pos.setXYZ(k,samples[i].x+nx*radius,samples[i].y+ny*radius,samples[i].z+nz*radius);norm.setXYZ(k,nx,ny,nz);
        }
      }
      pos.needsUpdate=true;norm.needsUpdate=true;
    }
    emberPositions.needsUpdate=true;this.embers.geometry.setDrawRange(0,emberCount);
  }
  render(time,ropes){
    this.rim.position.x=3+Math.sin(time*.65)*2;
    for(const material of this.experimentalMaterials)material.uniforms.uTime.value=time+(material.userData.timeOffset||0);
    if(this.mode==='game')this.syncRopes(ropes);
    else for(let i=0;i<this.vials.length;i++){const v=this.vials[i];v.rotation.y=Math.sin(time*.7+i)*.2;if(this.mode==='detail'&&i===this.selected)v.rotation.y=time*.22;}
    const cosmic=this.materials.cosmic;cosmic.iridescenceThicknessRange=[150+Math.sin(time)*50,420+Math.sin(time*.5)*70];
    this.renderer.render(this.scene,this.camera);
  }
}
