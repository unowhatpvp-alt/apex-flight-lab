import * as THREE from './vendor/three.module.js';

export const QUALITY = {
  low: {label:'流畅',ratio:1,shadow:0,ao:0,bloom:0,detail:0},
  medium: {label:'均衡',ratio:1.25,shadow:1024,ao:0,bloom:0,detail:1},
  high: {label:'高画质',ratio:1.65,shadow:2048,ao:12,bloom:.10,detail:2},
  ultra: {label:'极致',ratio:2,shadow:4096,ao:20,bloom:.13,detail:3},
};

export class Graphics {
  constructor(renderer,camera){
    this.renderer=renderer;this.camera=camera;this.tier='high';this.target=null;this.motionBlur=false;this.hasHistory=false;
    this.previousViewProjection=new THREE.Matrix4();this.viewProjection=new THREE.Matrix4();
    this.passScene=new THREE.Scene();this.passCamera=new THREE.Camera();
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{
      colorTex:{value:null},depthTex:{value:null},resolution:{value:new THREE.Vector2()},
      projection:{value:camera.projectionMatrix},inverseProjection:{value:camera.projectionMatrixInverse},
      samples:{value:12},bloom:{value:.1},exposure:{value:1.0},
      inverseViewProjection:{value:new THREE.Matrix4()},previousViewProjection:{value:this.previousViewProjection},blurAmount:{value:0}
    },vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
      precision highp float;
      varying vec2 vUv;uniform sampler2D colorTex,depthTex;uniform vec2 resolution;
      uniform mat4 projection,inverseProjection,inverseViewProjection,previousViewProjection;uniform int samples;uniform float bloom,exposure,blurAmount;
      vec3 viewPosition(vec2 uv,float d){vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
      vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
      float random(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        vec3 color=texture2D(colorTex,vUv).rgb;float depth=texture2D(depthTex,vUv).x;
        if(blurAmount>.001&&depth<.99995){
          vec4 world=inverseViewProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);world/=world.w;
          vec4 prior=previousViewProjection*world;vec2 priorUv=prior.xy/max(.001,prior.w)*.5+.5;
          vec2 velocity=(vUv-priorUv)*blurAmount;float speed=length(velocity);
          velocity*=min(1.,.028/max(.0001,speed));
          // Keep the followed vehicle legible while the road and scenery streak.
          float protect=smoothstep(.12,.32,length((vUv-vec2(.5,.39))*vec2(1.3,1.)));
          velocity*=protect;vec3 sum=color;float weight=1.;
          for(int k=1;k<8;k++){vec2 uv=clamp(vUv-velocity*(float(k)/7.-.3),vec2(.001),vec2(.999));float sd=texture2D(depthTex,uv).x;
            float w=abs(sd-depth)<.008?1.:.12;sum+=texture2D(colorTex,uv).rgb*w;weight+=w;}
          color=sum/weight;
        }
        if(depth<.99995&&samples>0){
          vec3 p=viewPosition(vUv,depth);vec3 n=normalize(cross(dFdx(p),dFdy(p)));if(dot(n,-p)<0.)n=-n;
          vec3 axis=abs(n.y)>.98?vec3(1,0,0):vec3(0,1,0);vec3 tangent=normalize(cross(axis,n));vec3 bitangent=cross(n,tangent);
          float ao=0.;float angle=random(floor(vUv*resolution))*6.283185;
          for(int i=0;i<20;i++){
            if(i>=samples)break;float fi=float(i)+.5;float u=fi/float(samples);float a=fi*2.399963+angle;
            vec3 dir=tangent*cos(a)*sqrt(u)+bitangent*sin(a)*sqrt(u)+n*sqrt(1.-u);
            vec3 candidate=p+dir*(.18+u*.85);vec4 projected=projection*vec4(candidate,1.);vec2 uv=projected.xy/projected.w*.5+.5;
            if(uv.x>0.&&uv.x<1.&&uv.y>0.&&uv.y<1.){
              float sd=texture2D(depthTex,uv).x;vec3 actual=viewPosition(uv,sd);
              float range=smoothstep(0.,1.,1.1/(abs(p.z-actual.z)+.01));
              ao+=(actual.z>candidate.z+.055?1.:0.)*range*(sd<.99995?1.:0.);
            }
          }
          color*=1.-.5*ao/float(samples);
        }
        vec3 glow=vec3(0.);vec2 px=1./resolution;
        for(int j=0;j<8;j++){float a=float(j)*.785398;vec2 off=vec2(cos(a),sin(a))*px*3.;glow+=max(texture2D(colorTex,vUv+off).rgb-vec3(1.15),vec3(0.));}
        color+=glow*bloom/8.;color=aces(color*exposure);
        gl_FragColor=vec4(pow(color,vec3(1./2.2)),1.);
      }`});
    this.material.toneMapped=false;this.passScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
  }
  configure(tier,width,height){
    this.tier=tier;this.width=width;this.height=height;this.hasHistory=false;const q=QUALITY[tier];this.renderer.setPixelRatio(Math.min(devicePixelRatio,q.ratio));this.renderer.setSize(width,height,false);
    this.renderer.shadowMap.enabled=!!q.shadow;
    if(this.target){this.target.depthTexture?.dispose();this.target.dispose();this.target=null;}
    const hdr=this.renderer.extensions.has('EXT_color_buffer_float');
    if((q.ao&&hdr)||this.motionBlur){
      const size=this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.target=new THREE.WebGLRenderTarget(size.x,size.y,{type:hdr?THREE.HalfFloatType:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,samples:tier==='low'?0:4});
      this.target.depthTexture=new THREE.DepthTexture(size.x,size.y,THREE.UnsignedIntType);
      this.material.uniforms.colorTex.value=this.target.texture;this.material.uniforms.depthTex.value=this.target.depthTexture;
      this.material.uniforms.resolution.value.copy(size);this.material.uniforms.samples.value=hdr?q.ao:0;this.material.uniforms.bloom.value=q.bloom;
    }
  }
  setMotionBlur(enabled){this.motionBlur=!!enabled;if(this.width)this.configure(this.tier,this.width,this.height);}
  resetHistory(){this.hasHistory=false;}
  render(scene,camera,dt=1/60,active=false){
    if(!this.target){this.renderer.render(scene,camera);return;}
    camera.updateMatrixWorld();this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.material.uniforms.inverseViewProjection.value.copy(this.viewProjection).invert();
    this.material.uniforms.blurAmount.value=this.motionBlur&&active&&this.hasHistory?Math.min(1.2,(1/90)/Math.max(dt,1/240)):0;
    this.material.uniforms.exposure.value=this.renderer.toneMappingExposure;
    this.renderer.setRenderTarget(this.target);this.renderer.render(scene,camera);
    this.renderer.setRenderTarget(null);this.renderer.render(this.passScene,this.passCamera);
    this.previousViewProjection.copy(this.viewProjection);this.hasHistory=true;
  }
}

export function createSky(){
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#577a95')},bottom:{value:new THREE.Color('#b7cad2')},sunDirection:{value:new THREE.Vector3(-.4,.32,-.65).normalize()},moon:{value:0}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
    varying vec3 vPos;uniform vec3 top,bottom,sunDirection;uniform float moon;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float f=0.,a=.5;for(int i=0;i<5;i++){f+=noise(p)*a;p=p*2.03+7.1;a*=.5;}return f;}
    void main(){vec3 dir=normalize(vPos);float h=dir.y;vec3 c=mix(bottom,top,smoothstep(-.05,.85,h));
      float sun=dot(dir,sunDirection);c+=vec3(1.,.78,.48)*pow(max(sun,0.),12.)*.32;
      c+=vec3(4.,3.4,2.4)*smoothstep(.9996,.99985,sun);
      if(h>.03){vec2 uv=dir.xz/(h+.16)*2.3;float cloud=smoothstep(.53,.77,fbm(uv));cloud*=smoothstep(.03,.20,h)*(1.-moon);c=mix(c,vec3(.9,.93,.95),cloud*.65);}
      gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1800,48,32),material);mesh.name='sky';mesh.frustumCulled=false;return mesh;
}
