import * as THREE from './vendor/three.module.js';
import { TRACKS, buildTrack } from './tracks.js?v=1.1.0';
import { createWorld, createCar } from './world.js?v=1.1.0';
import { Simulator } from './physics.js?v=1.1.0';
import { ChaseCamera } from './camera.js?v=1.1.0';
import { Graphics, QUALITY, createSky } from './graphics.js?v=1.1.0';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const coarse = matchMedia('(pointer:coarse)').matches;
let renderer, scene, camera, world, car, sun, hemi, fill, graphics, chase, environmentTarget, track, sim, selected = 'proving';
let mode = 'menu', quality = coarse ? 'low' : 'high', magnet = true, cameraMode = 0, accumulator = 0, last = 0, frames = 0, frameTime = 0;
let records = {}, soundOn = false, audio;
const held = new Set(), touch = new Map();
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), currentLook = new THREE.Vector3();
const icons = ['M1 20H12Q20 20 24 13T36 14L43 20H55','M1 21H18C40 21 40 0 26 0S11 21 34 21H55','M1 24H14C33 24 32 2 19 2H43C29 2 29 24 46 24H55','M1 23L15 11 23 23M29 23L39 7 49 23H55','M1 24 12 13 22 24C43 24 42 1 28 1S16 24 43 24H55'];
try { records = JSON.parse(localStorage.getItem('apex-flight-records-v2') || '{}'); const saved=localStorage.getItem('apex-quality');if(saved==='auto'||QUALITY[saved])quality=saved; } catch {}

function fatal(error) { console.error(error); $('error').hidden = false; $('error').textContent = '无法启动 3D 画面：' + (error?.message || error) + '\n请使用支持 WebGL 2 的近期 Chrome、Edge 或 Safari，并开启浏览器硬件加速。'; }
window.addEventListener('error', e => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', e => fatal(e.reason));

function init() {
  renderer = new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 2400);
  hemi = new THREE.HemisphereLight(0xbdd8ed, 0x685647, 1.05); scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffebcb, 3.1); sun.position.set(-45,60,-70); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:190});sun.shadow.bias=-.00015;sun.shadow.normalBias=.025;sun.shadow.radius=2;scene.add(sun,sun.target);
  fill = new THREE.DirectionalLight(0xc5deff, .45);fill.position.set(30,15,35);scene.add(fill);
  scene.add(createSky());
  chase=new ChaseCamera(camera);graphics=new Graphics(renderer,camera);
  car=createCar(effectiveQuality());scene.add(car.group);
  TRACKS.forEach((t,i)=>{const b=document.createElement('button');b.className='track-card';b.dataset.track=t.id;b.setAttribute('aria-label',t.name);b.innerHTML=`<span class="track-no">0${i+1}</span><svg viewBox="0 0 56 28" aria-hidden="true"><path d="${icons[i]}"/></svg><span><b>${t.name}</b><small>${t.subtitle}</small></span><span class="difficulty">${t.difficulty}</span>`;b.onclick=()=>selectTrack(t.id);$('tracks').appendChild(b);});
  $('quality').value=quality;applyQuality();selectTrack(selected);bindUI();resize();
  $('start').disabled=false;$('start').innerHTML='<span>开始驾驶</span><b>↗</b>';
  requestAnimationFrame(frame);
}

function effectiveQuality(){return quality==='auto'?(coarse||innerWidth<700?'low':'high'):quality;}
function applyQuality(){const tier=effectiveQuality(),q=QUALITY[tier];graphics.configure(tier,innerWidth,innerHeight);if(q.shadow&&sun.shadow.mapSize.x!==q.shadow){sun.shadow.mapSize.set(q.shadow,q.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}if($('quality-note'))$('quality-note').textContent={low:'轻量场景 · 适合手机',medium:'动态阴影 · 平衡性能',high:'精细材质 · 环境遮蔽 · 柔和光晕',ultra:'最高细节 · 4K 阴影 · 高精度环境遮蔽'}[tier];}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();}
function selectTrack(id){selected=id;track=buildTrack(id);world?.dispose();world=createWorld(scene,track,effectiveQuality());sim=new Simulator(track);
  $('track-description').textContent=track.description;$('track-length').textContent=Math.round(track.length)+' M';$('best-score').textContent=records[id]?.score?.toLocaleString()||'—';
  document.querySelectorAll('.track-card').forEach(b=>{b.classList.toggle('selected',b.dataset.track===id);b.setAttribute('aria-pressed',String(b.dataset.track===id));});
  const lunar=id==='lunar', night=id==='extreme';scene.fog=new THREE.FogExp2(lunar?0x172132:night?0x56556b:0xaab5b3,.0009);
  const sky=scene.getObjectByName('sky');sky.material.uniforms.top.value.set(lunar?'#071025':night?'#27334e':'#416b8d');sky.material.uniforms.bottom.value.set(lunar?'#252c41':night?'#a9a0a7':'#b9c8ca');sky.material.uniforms.moon.value=lunar?1:0;
  sun.color.set(lunar?0xd9e5ff:0xffebcb);sun.intensity=lunar?2.5:night?1.9:3.1;hemi.intensity=lunar?.65:night?.75:1.05;renderer.toneMappingExposure=lunar?1.12:night?1.14:1.0;
  const env=new THREE.Scene();env.add(sky.clone());const envFloor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshBasicMaterial({color:lunar?0x313743:0x89785e}));envFloor.rotation.x=-Math.PI/2;envFloor.position.y=-30;env.add(envFloor);const pmrem=new THREE.PMREMGenerator(renderer);environmentTarget?.dispose();environmentTarget=pmrem.fromScene(env,.015,1,2400);scene.environment=environmentTarget.texture;scene.environmentIntensity=.85;pmrem.dispose();envFloor.geometry.dispose();envFloor.material.dispose();
  placeMenuCar();drawMinimap();
}
function placeMenuCar(){const s=track.sample(27);car.group.position.copy(s.p).addScaledVector(s.normal,.60);car.group.rotation.set(0,0,0);car.update({speed:0,jet:false,damage:0,time:0,steer:0});currentLook.copy(car.group.position);camera.position.copy(car.group.position).add(new THREE.Vector3(9,5.6,12));camera.lookAt(currentLook);}
function start(){clearInput();sim.reset();magnet=true;syncMagnet();mode='playing';accumulator=0;document.body.classList.add('playing');$('menu').hidden=true;$('hud').hidden=false;$('results').hidden=true;$('pause-screen').hidden=true;$('course-name').textContent=track.name;cameraMode=0;syncCamera();initAudio();chase.reset();}
function pause(){if(mode!=='playing')return;mode='paused';clearInput();$('pause-screen').hidden=false;$('resume').focus();}
function resume(){if(mode!=='paused')return;clearInput();mode='playing';$('pause-screen').hidden=true;accumulator=0;}
function menu(){mode='menu';clearInput();$('menu').hidden=false;$('hud').hidden=true;$('results').hidden=true;$('pause-screen').hidden=true;document.body.classList.remove('playing');$('best-score').textContent=records[selected]?.score?.toLocaleString()||'—';placeMenuCar();}
function finish(){mode='results';clearInput();$('hud').hidden=true;$('results').hidden=false;const r=sim.getResult();const best=records[selected]?.score||0;const newRecord=r.score>best;
  if(newRecord){records[selected]={score:r.score,time:r.time};try{localStorage.setItem('apex-flight-records-v2',JSON.stringify(records));}catch{}}
  $('result-title').textContent=r.completed?'试验完成。':'下次，飞得更好。';$('result-reason').textContent=r.reason;$('grade').textContent=r.grade;$('final-score').textContent=r.score.toLocaleString();$('record-label').textContent=newRecord?'↗ 本机新纪录':'';
  $('final-time').textContent=r.time.toFixed(1)+' 秒';$('final-flips').textContent=r.flips+' 次';$('final-air').textContent=r.airtime.toFixed(1)+' 秒';$('final-speed').textContent=Math.round(r.maxSpeed)+' km/h';$('final-health').textContent='完整度 '+Math.round(r.health)+'%';
  $('damage-report').replaceChildren();for(const [key,name] of [['body','车身'],['suspension','悬挂'],['battery','电池'],['thrusters','推进器']]){const value=clamp(r.damage[key],0,100);const row=document.createElement('div');row.className='damage-row';row.innerHTML=`<span>${name}</span><div class="bar"><i style="width:${100-value}%;background:${value>60?'#f28e72':value>25?'#e9c77c':'#b9dc95'}"></i></div><b>${Math.round(value)}% 损伤</b>`;$('damage-report').appendChild(row);}
}
function syncMagnet(){$('magnet').innerHTML=`吸附 ${magnet?'开':'关'} <kbd>M</kbd>`;$('magnet').setAttribute('aria-pressed',String(magnet));}
function syncCamera(){$('camera').innerHTML=`${['车后跟随','远距跟随','贴近跟随'][cameraMode]} <kbd>C</kbd>`;}
function controls(){const down=c=>held.has(c)||[...touch.values()].includes(c);return{throttle:down('throttle')?1:0,brake:down('brake')?1:0,steer:(down('right')?1:0)-(down('left')?1:0),flip:(down('flipRight')?1:0)-(down('flipLeft')?1:0),jet:down('jet'),magnet};}
function clearInput(){held.clear();touch.clear();document.querySelectorAll('.active[data-control]').forEach(b=>b.classList.remove('active'));}
const keys={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',ArrowLeft:'left',KeyQ:'left',ArrowRight:'right',KeyE:'right',KeyA:'flipLeft',KeyD:'flipRight',Space:'jet'};
function bindUI(){
  $('start').onclick=start;$('pause').onclick=pause;$('resume').onclick=resume;$('restart').onclick=start;$('retry').onclick=start;$('exit').onclick=menu;$('choose').onclick=menu;
  $('magnet').onclick=()=>{magnet=!magnet;syncMagnet();};$('camera').onclick=()=>{cameraMode=(cameraMode+1)%3;syncCamera();};
  $('quality').onchange=e=>{quality=e.target.value;try{localStorage.setItem('apex-quality',quality);}catch{}applyQuality();car.dispose();car=createCar(effectiveQuality());scene.add(car.group);selectTrack(selected);};
  $('help').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('#help-dialog .close,#help-dialog .close-help').forEach(b=>b.onclick=()=>$('help-dialog').close());
  $('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent='声音 '+(soundOn?'开':'关');initAudio();};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else{$('fullscreen').textContent='横屏体验更佳';}}catch{$('fullscreen').textContent='请手动横屏';}};
  document.querySelector('.brand').onclick=e=>{e.preventDefault();if(mode==='playing')pause();else if(mode!=='menu')menu();};
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||$('help-dialog').open)return;if(keys[e.code]&&mode==='playing'){e.preventDefault();held.add(keys[e.code]);}if(e.repeat)return;if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(mode==='playing')pause();else if(mode==='paused')resume();}if(mode==='playing'){if(e.code==='KeyM')$('magnet').click();if(e.code==='KeyC')$('camera').click();if(e.code==='KeyR')start();}});
  window.addEventListener('keyup',e=>{if(keys[e.code]){held.delete(keys[e.code]);if(mode==='playing')e.preventDefault();}});
  document.querySelectorAll('[data-control]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;b.setPointerCapture(e.pointerId);touch.set(e.pointerId,b.dataset.control);b.classList.add('active');});for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,e=>{touch.delete(e.pointerId);b.classList.remove('active');});b.addEventListener('contextmenu',e=>e.preventDefault());});
  window.addEventListener('blur',()=>{clearInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});window.addEventListener('resize',resize);
  $('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();fatal(new Error('图形上下文已断开，请刷新页面重试。'));});
}
function formatTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+(n%60).toFixed(1).padStart(4,'0');}
function attitude(){const s=sim.state;if(!s.grounded){const r=Math.atan2(Math.sin(s.roll||0),Math.cos(s.roll||0))*180/Math.PI;$('mode-label').textContent=(s.jetActive?'喷气中':'空中')+' · 侧滚 '+Math.round(r)+'°';}}
function hud(){const s=sim.state;$('speed').textContent=Math.round(s.speed*3.6);$('timer').textContent=formatTime(s.elapsed);$('score').textContent=String(Math.round(s.score)).padStart(5,'0');$('distance').textContent=Math.floor(s.s)+' / '+Math.round(track.length)+' M';$('fuel').style.width=s.fuel+'%';$('fuel-value').textContent=Math.round(s.fuel)+'%';$('health').style.width=s.health+'%';$('health').style.background=s.health<35?'#ff9279':'var(--acid)';$('health-value').textContent=Math.round(s.health)+'%';$('progress').style.width=(s.s/track.length*100)+'%';$('event').textContent=s.lastEvent;$('event').style.opacity=s.eventTimer>0?'1':'0';$('mode-label').textContent=s.jetActive?'推进器工作中':!s.grounded?'自由飞行':Math.cos(s.angle)<-.3?(magnet?'倒挂驾驶 · 吸附中':'倒挂驾驶'):'地面驾驶';drawMinimap();}
function drawMinimap(){const c=$('minimap'),ctx=c.getContext('2d'),points=track.samples;const minX=Math.min(...points.map(p=>p.p.x)),maxX=Math.max(...points.map(p=>p.p.x)),maxY=Math.max(...points.map(p=>p.p.y)),minY=Math.min(...points.map(p=>p.p.y));const scale=Math.min(190/(maxX-minX||1),55/(maxY-minY||1));const xy=p=>[10+(p.x-minX)*scale,65-(p.y-minY)*scale];ctx.clearRect(0,0,210,82);ctx.lineWidth=1.5;ctx.strokeStyle='#aabda77a';ctx.beginPath();for(let i=0;i<points.length;i++){const p=points[i];const a=xy(p.p);if(!i||p.gap)ctx.moveTo(...a);else ctx.lineTo(...a);}ctx.stroke();const pt=xy(mode==='menu'?track.sample(3).p:sim.state.pos);ctx.fillStyle='#d1f891';ctx.beginPath();ctx.arc(...pt,3,0,Math.PI*2);ctx.fill();ctx.font='8px sans-serif';ctx.fillStyle='#9eaf9e';ctx.fillText('ROUTE TELEMETRY',10,80);}
function frame(t){requestAnimationFrame(frame);const dt=Math.min((t-last)/1000||0,.05);last=t;const time=t/1000;
  if(mode==='playing'){const input=controls();accumulator+=dt;while(accumulator>=1/120){sim.step(1/120,input);accumulator-=1/120;}const s=sim.state;car.group.position.copy(s.pos);if(s.quaternion)car.group.quaternion.copy(s.quaternion);else car.group.rotation.set(0,0,s.angle);car.update({speed:s.speed,jet:s.jetActive,damage:s.damage,time,steer:input.steer});hud();if(s.finished)finish();}
  if(mode==='menu'){const p=car.group.position;const mobile=innerWidth<821&&innerHeight>550;camTarget.copy(p).add(new THREE.Vector3(7+Math.sin(time*.13)*.8,mobile?6:3.4,mobile?14:9));lookTarget.copy(p).add(new THREE.Vector3(mobile?0:1,mobile?2:1,0));camera.fov=mobile?48:44;camera.up.set(0,1,0);camera.position.lerp(camTarget,1-Math.exp(-dt*3));currentLook.lerp(lookTarget,1-Math.exp(-dt*4));camera.lookAt(currentLook);camera.updateProjectionMatrix();}
  else chase.update(sim.state,track,dt,cameraMode,world.occluders||[]);
  if(mode==='playing')attitude();sun.position.copy(car.group.position).add(new THREE.Vector3(-45,60,-70));sun.target.position.copy(car.group.position);world.update(time,car.group.position);updateAudio();graphics.render(scene,camera);
  frames++;frameTime+=dt;if(frameTime>=1){$('render-status').innerHTML='<i></i> '+Math.round(frames/frameTime)+' FPS / '+effectiveQuality().toUpperCase();frames=0;frameTime=0;}
}
function initAudio(){if(!soundOn)return;try{if(!audio){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),gain=ctx.createGain(),osc=ctx.createOscillator(),jetGain=ctx.createGain();gain.gain.value=0;osc.type='sawtooth';osc.frequency.value=45;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=250;osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start();const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const nf=ctx.createBiquadFilter();nf.type='lowpass';nf.frequency.value=1300;noise.connect(nf);nf.connect(jetGain);jetGain.connect(ctx.destination);jetGain.gain.value=0;noise.start();audio={ctx,gain,osc,jetGain};}audio.ctx.resume();}catch{soundOn=false;}}
function updateAudio(){if(!audio)return;const on=soundOn&&mode==='playing',s=sim.state,now=audio.ctx.currentTime;audio.gain.gain.setTargetAtTime(on?.018+s.speed*.00035:0,now,.1);audio.osc.frequency.setTargetAtTime(35+s.speed*3,now,.12);audio.jetGain.gain.setTargetAtTime(on&&s.jetActive?.13:0,now,.06);}
try{init();}catch(error){fatal(error);}



