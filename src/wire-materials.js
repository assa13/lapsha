import * as THREE from 'three';
import {MATERIALS} from './economy.js';

// One factory for the shop, detail view and physical wire. Shared patterns
// use the same tube UVs, and share one clock; no per-frame texture allocations.
const styles=['metal','pearl','lava','gem','silk','holo','electric','barber','opal','aurora','nebula','petrol','prism','jade','candy'];
const declarations=`
uniform float uWireTime; uniform float uWirePhase; uniform float uWireBurn;
uniform vec3 uWireA; uniform vec3 uWireB; varying vec2 vWireUv;
vec3 wireSpectrum(float p){return .55+.45*cos(6.2831853*(p+vec3(0.,.33,.67)));}
float wireHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
`;
const pattern=`
float wt=uWireTime+uWirePhase,wx=vWireUv.x,wa=vWireUv.y*6.2831853;
float wave=.5+.5*sin(wx*35.-wt*.85+wa),wireGlow=0.;
vec3 wireColor=mix(uWireA,uWireB,.18+.38*pow(wave,4.));
#if WIRE_STYLE == 1
wireColor=mix(uWireA,uWireB,.5+.5*sin(wx*12.+wa+wt*.45));
wireColor=mix(wireColor,vec3(1.),.28);
#elif WIRE_STYLE == 2
// Circumferential variation dominates: long veins, never transverse rings.
float drift=wx*5.-wt*.6;
float channel=sin(wa*3.+sin(drift)*.7+sin(drift*.63+wa)*.35);
float lava=smoothstep(.15,.7,channel),core=pow(max(0.,channel),7.);
wireColor=mix(vec3(.022,.003,.002),uWireA,lava);
wireColor=mix(wireColor,uWireB,core*.75);wireGlow=lava*.18+core*.65;
#elif WIRE_STYLE == 3
float facet=.5+.5*sin(floor(wx*45.)*.7+floor(vWireUv.y*9.)*2.+wt*.7);
wireColor=mix(uWireA*.5,uWireB,facet*.55);wireGlow=pow(facet,18.)*.12;
#elif WIRE_STYLE == 4
wireColor=mix(uWireA,uWireB,.5+.5*sin(wx*30.+sin(wa*2.-wt*.5)*2.-wt));
#elif WIRE_STYLE == 5
wireColor=mix(uWireA,wireSpectrum(wx*3.+vWireUv.y*.5+wt*.08),.8);
wireGlow=.1;
#elif WIRE_STYLE == 7
float band=fract(wx*16.+vWireUv.y-wt*.32);
float white=smoothstep(.20,.24,band)*(1.-smoothstep(.45,.49,band))+smoothstep(.70,.74,band)*(1.-smoothstep(.95,.99,band));
wireColor=mix(band<.5?uWireA:uWireB,vec3(.97),white);
#elif WIRE_STYLE == 8
float fire=sin(wa*3.+wx*9.+sin(wx*7.-wt*.4)*2.);
wireColor=mix(uWireA,uWireB,.5+.5*fire);wireColor=mix(wireColor,wireSpectrum(wa*.12+wx+wt*.04),.45);
wireGlow=pow(.5+.5*fire,10.)*.18;
#elif WIRE_STYLE == 9
float curtain=.5+.5*sin(wx*20.+sin(wa+wt*.6)*2.-wt*.45);
wireColor=mix(uWireA,uWireB,curtain);wireColor*=.65+.45*wave;wireGlow=curtain*.18;
#elif WIRE_STYLE == 10
float cloud=sin(wx*8.-wt*.18+sin(wa*2.+wx*3.)*1.5)*cos(wa+wx*4.+wt*.22);
float mist=.5+.5*cloud;
wireColor=mix(uWireA*.25,uWireB,pow(mist,2.));wireColor=mix(wireColor,vec3(.04,.8,.9),pow(1.-mist,5.));wireGlow=mist*.15;
#elif WIRE_STYLE == 11
float oil=wx*1.5+sin(wa*2.+wx*4.-wt*.3)*.3+wt*.045;
wireColor=mix(uWireA*.3,wireSpectrum(oil),.65);wireGlow=.04;
#elif WIRE_STYLE == 12
float prism=wa*2.+sin(wx*4.-wt*.5)*.8;
wireColor=wireSpectrum(prism*.12+wx*.8+wt*.06);
wireColor=mix(wireColor,vec3(.8,.96,1.),pow(.5+.5*cos(prism*2.),14.)*.65);wireGlow=.08;
#elif WIRE_STYLE == 13
float vein=pow(1.-abs(sin(wa*4.+sin(wx*8.-wt*.4)*.7)),14.);
wireColor=mix(uWireA*(.45+.35*wave),uWireB,vein);wireGlow=vein*.2;
#elif WIRE_STYLE == 14
float twist=.5+.5*sin(wa*2.+wx*18.-wt*.65);
wireColor=mix(uWireA,uWireB,smoothstep(.3,.7,twist));wireColor=mix(wireColor,vec3(1.,.88,.92),pow(1.-abs(twist-.5)*2.,10.)*.65);
#endif
wireColor=mix(wireColor,vec3(.18,.012,.002),uWireBurn*.9);
diffuseColor.rgb=wireColor;
`;

// Restored from the original project electric shader (Shadertoy ldlXRS).
// One deterministic noise texture is shared by every preview and wire instance.
let electricNoise;
function createElectricMaterial(time,phase){
  if(!electricNoise){const size=128,data=new Uint8Array(size*size*4);let seed=17041;
    for(let i=0;i<size*size;i++){seed=seed*1664525+1013904223>>>0;const value=seed>>>24,k=i*4;data[k]=data[k+1]=data[k+2]=value;data[k+3]=255;}
    electricNoise=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);electricNoise.wrapS=electricNoise.wrapT=THREE.RepeatWrapping;electricNoise.minFilter=electricNoise.magFilter=THREE.LinearFilter;electricNoise.needsUpdate=true;
  }
  const uniforms={uWireTime:time,uWirePhase:{value:phase},uWireBurn:{value:0},uNoise:{value:electricNoise},uBaseColor:{value:new THREE.Color(.35,.12,.85)}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:`varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`precision highp float;uniform float uWireTime;uniform float uWirePhase;
#define uTime (uWireTime+uWirePhase)
uniform float uWireBurn;uniform sampler2D uNoise;uniform vec3 uBaseColor;varying vec2 vUv;varying vec3 vNormal;const float TAU=6.2831853;mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}float noise2(vec2 p){return texture2D(uNoise,fract(p*.01)).r;}float fbm(vec2 p){float z=2.,r=0.;for(int i=0;i<5;i++){r+=abs((noise2(p)-.5)*2.)/z;z*=2.;p*=2.;}return r;}float dualFbm(vec2 p){vec2 q=p*.7;vec2 basis=vec2(fbm(q-uTime*1.6),fbm(q+uTime*1.7));p+=(basis-.5)*.2;return fbm(p*rot(uTime*.2));}float rings(vec2 p){float r=.5*log(max(length(p),.0001));return abs(mod(r*4.,TAU)-3.14)*3.+.2;}void main(){vec2 p=vec2((vUv.x-.5)*18.,(vUv.y-.5)*4.);float rz=dualFbm(p);rz*=pow(abs(.1-rings(p)),.9);vec3 col=uBaseColor/max(rz,.025);col=pow(abs(col),vec3(.99));col=col/(.55+col);float rim=.72+.28*abs(vNormal.z);float travel=fract(uTime*.22),d=abs(vUv.x-travel);d=min(d,1.-d);float pulse=exp(-d*d*180.);col*=rim*(.55+1.8*pulse);col=mix(col,vec3(1.,.13,.01),uWireBurn*.75);gl_FragColor=vec4(col,1.);}`,toneMapped:false});
  material.userData.materialId='electric';material.userData.wireUniforms=uniforms;material.customProgramCacheKey=()=> 'lapsha-electric-original-1';return material;
}

export function createWireMaterial(id,time={value:0},phase=0){
  if(id==='electric')return createElectricMaterial(time,phase);
  const spec=MATERIALS.find(m=>m.id===id)||MATERIALS[0],kind=styles.indexOf(spec.style);
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:spec.style==='barber'?.12:spec.style==='prism'?.55:.78,roughness:spec.style==='barber'?.28:['opal','petrol','prism'].includes(spec.style)?.07:.16,clearcoat:spec.style==='barber'?.45:.85,clearcoatRoughness:.1,envMapIntensity:spec.style==='barber'?.65:1.35,iridescence:spec.style==='barber'?0:['holo','pearl','opal','petrol','prism'].includes(spec.style)?.8:.24,iridescenceIOR:1.4,iridescenceThicknessRange:[180,480]});
  const uniforms={uWireTime:time,uWirePhase:{value:phase},uWireBurn:{value:0},uWireA:{value:new THREE.Color(spec.color)},uWireB:{value:new THREE.Color(spec.accent)}};
  material.userData.materialId=spec.id;material.userData.wireUniforms=uniforms;
  material.customProgramCacheKey=()=>`lapsha-wire-${spec.style}-1`;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWireUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWireUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n#define WIRE_STYLE ${kind}\n${declarations}`).replace('#include <color_fragment>',`#include <color_fragment>\n${pattern}`).replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=wireColor*(.025+wireGlow*.7)+vec3(1.,.12,.01)*sin(uWireBurn*3.14159)*1.5;');
  };
  return material;
}
