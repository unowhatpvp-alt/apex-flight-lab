import * as THREE from './vendor/three.module.js';
import { TRACKS, buildTrack } from './tracks.js?v=1.2.0-release';
import { createWorld, createCar } from './world.js?v=1.2.0-release';
import { Simulator } from './physics.js?v=1.2.0-release';
import { ChaseCamera } from './camera.js?v=1.2.0-release';
import { Graphics, QUALITY, createSky } from './graphics.js?v=1.2.0-release';
import { VEHICLES, getVehicle } from './vehicles.js?v=1.2.0-release';
import { createEffects } from './effects.js?v=1.2.0-release';
import { getLanguage, setLanguage, t, applyTranslations, trackText, eventText } from './i18n.js?v=1.2.0-release';
import { STUDIO_ENV } from './assets/studio-env.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const coarse = matchMedia('(pointer:coarse)').matches;
let renderer, scene, camera, world, car, sun, hemi, fill, graphics, chase, environmentTarget, track, sim, selected = 'reveal';
let mode = 'menu', quality = coarse ? 'low' : 'high', magnet = true, cameraMode = 0, accumulator = 0, last = 0, frames = 0, frameTime = 0;
let records = {}, soundOn = false, audio, effects, vehicle = getVehicle(), motionBlur = false, lastResult = null, lastRecord = false;
const held = new Set(), touch = new Map();
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), currentLook = new THREE.Vector3();
const studioBytes=Uint8Array.from(atob(STUDIO_ENV.data),c=>c.charCodeAt(0));
const studioTexture=new THREE.DataTexture(new Uint16Array(studioBytes.buffer),STUDIO_ENV.width,STUDIO_ENV.height,THREE.RGBAFormat,THREE.HalfFloatType);
studioTexture.mapping=THREE.EquirectangularReflectionMapping;studioTexture.colorSpace=THREE.LinearSRGBColorSpace;studioTexture.flipY=false;studioTexture.needsUpdate=true;
const icons = ['M1 15H15M20 15H33M39 15H55','M1 20H12Q20 20 24 13T36 14L43 20H55','M1 21H18C40 21 40 0 26 0S11 21 34 21H55','M1 24H14C33 24 32 2 19 2H43C29 2 29 24 46 24H55','M1 23L15 11 23 23M29 23L39 7 49 23H55','M1 24 12 13 22 24C43 24 42 1 28 1S16 24 43 24H55'];
try { records = JSON.parse(localStorage.getItem('apex-flight-records-v3') || '{}'); const saved=localStorage.getItem('apex-quality');if(saved==='auto'||QUALITY[saved])quality=saved; vehicle=getVehicle(localStorage.getItem('apex-vehicle'));motionBlur=localStorage.getItem('apex-motion-blur')==='true'; } catch {}

function fatal(error) { console.error(error); $('error').hidden=false; $('error').textContent=t('fatal.start')+(error?.message||error)+'\n'+t('fatal.help'); }
window.addEventListener('error',e=>fatal(e.error||e.message));
window.addEventListener('unhandledrejection',e=>fatal(e.reason));

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
  car=createCar(effectiveQuality(),vehicle);scene.add(car.group);
  graphics.setMotionBlur(motionBlur);
  $('quality').value=quality;$('vehicle').value=vehicle.id;$('motion-blur').checked=motionBlur;$('pause-blur').checked=motionBlur;
  renderTrackCards();applyQuality();selectTrack(selected);bindUI();resize();refreshLanguage();
  $('start').disabled=false;
  requestAnimationFrame(frame);
}

function effectiveQuality(){return quality==='auto'?(coarse||innerWidth<700?'low':'high'):quality;}
function applyQuality(){const tier=effectiveQuality(),q=QUALITY[tier];graphics.configure(tier,innerWidth,innerHeight);if(q.shadow&&sun.shadow.mapSize.x!==q.shadow){sun.shadow.mapSize.set(q.shadow,q.shadow);sun.shadow.map?.dispose();sun.shadow.map=null;}$('quality-note').textContent=t('quality.note.'+tier);}

function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();applyQuality();}
function selectTrack(id){
  selected=id;track=buildTrack(id);world?.dispose();effects?.dispose();
  world=createWorld(scene,track,effectiveQuality());track.terrainHeightAt=world.heightAt||(()=>track.groundY??-.22);track.finishGate=world.finishGate;track.obstacles=world.obstacles||[];
  sim=new Simulator(track,vehicle);effects=createEffects(scene,effectiveQuality());
  const lunar=id==='lunar',night=id==='extreme',stage=track.environment==='stage';
  scene.fog=new THREE.FogExp2(stage?0x07121d:lunar?0x172132:night?0x56556b:0xaab5b3,stage?.00075:.0009);
  const sky=scene.getObjectByName('sky');sky.material.uniforms.top.value.set(stage?'#020817':lunar?'#071025':night?'#27334e':'#416b8d');sky.material.uniforms.bottom.value.set(stage?'#1e354d':lunar?'#252c41':night?'#a9a0a7':'#b9c8ca');sky.material.uniforms.moon.value=stage||lunar?1:0;
  sun.color.set(stage?0xdcefff:lunar?0xd9e5ff:0xffebcb);sun.intensity=stage?2.6:lunar?2.5:night?1.9:3.1;hemi.intensity=stage?.95:lunar?.65:night?.75:1.05;renderer.toneMappingExposure=stage?1.12:lunar?1.12:night?1.14:1;
  const env=new THREE.Scene();env.add(sky.clone());const floor=new THREE.Mesh(new THREE.PlaneGeometry(4000,4000),new THREE.MeshBasicMaterial({color:stage?0x192b42:lunar?0x313743:0x89785e}));floor.rotation.x=-Math.PI/2;floor.position.y=-30;env.add(floor);const pmrem=new THREE.PMREMGenerator(renderer);environmentTarget?.dispose();environmentTarget=stage?pmrem.fromEquirectangular(studioTexture):pmrem.fromScene(env,.015,1,2400);scene.environment=environmentTarget.texture;scene.environmentIntensity=stage?.8:.85;pmrem.dispose();floor.geometry.dispose();floor.material.dispose();
  updateSelection();placeMenuCar();drawMinimap();graphics.resetHistory();
}
function recordKey(){return selected+':'+vehicle.id;}
function renderTrackCards(){
  $('tracks').replaceChildren();TRACKS.forEach((track,i)=>{const label=trackText(track),b=document.createElement('button');b.className='track-card';b.dataset.track=track.id;b.setAttribute('aria-label',label.name);b.innerHTML=`<span class="track-no">0${i+1}</span><svg viewBox="0 0 56 28" aria-hidden="true"><path d="${icons[i]}"/></svg><span><b>${label.name}</b><small>${track.subtitle}</small></span><span class="difficulty">${label.difficulty}</span>`;b.onclick=()=>selectTrack(track.id);$('tracks').appendChild(b);});
}
function updateSelection(){
  const label=trackText(track);$('track-description').textContent=label.description;$('track-length').textContent=Math.round(track.length)+' M';$('best-score').textContent=records[recordKey()]?.score?.toLocaleString()||'—';$('course-name').textContent=label.name;
  $('vehicle-note').textContent=t('vehicle.note',{mass:vehicle.mass,acceleration:vehicle.acceleration,speed:Math.round(vehicle.maxSpeed*3.6)});
  document.querySelectorAll('.track-card').forEach(b=>{b.classList.toggle('selected',b.dataset.track===selected);b.setAttribute('aria-pressed',String(b.dataset.track===selected));});
}
function refreshLanguage(){
  applyTranslations();renderTrackCards();if(track)updateSelection();$('quality-note').textContent=t('quality.note.'+effectiveQuality());$('sound').textContent=t(soundOn?'sound.on':'sound.off');$('start').innerHTML='<span>'+t('start')+'</span><b>↗</b>';syncMagnet();syncCamera();if(mode==='results'&&lastResult)renderResult(lastResult,lastRecord);if(sim)hud();
}

function placeMenuCar(){const f=track.sample(27);car.group.position.copy(f.p).addScaledVector(f.normal,.60);car.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tangent,f.normal,f.side));car.update({speed:0,jet:false,rollInput:0,damage:0,time:0,steer:0,steerAngle:0,suspension:0});currentLook.copy(car.group.position);camera.position.copy(car.group.position).add(new THREE.Vector3(9,5.6,12));camera.up.set(0,1,0);camera.lookAt(currentLook);}

function start(){clearInput();sim.reset();effects.reset();magnet=true;syncMagnet();mode='playing';accumulator=0;lastResult=null;document.body.classList.add('playing');$('menu').hidden=true;$('hud').hidden=false;$('results').hidden=true;$('pause-screen').hidden=true;$('course-name').textContent=trackText(track).name;cameraMode=0;syncCamera();initAudio();chase.reset();graphics.resetHistory();}

function pause(){if(mode!=='playing')return;mode='paused';clearInput();$('pause-screen').hidden=false;$('resume').focus();}
function resume(){if(mode!=='paused')return;clearInput();mode='playing';$('pause-screen').hidden=true;accumulator=0;graphics.resetHistory();}

function menu(){mode='menu';clearInput();effects.reset();sim.reset();$('menu').hidden=false;$('hud').hidden=true;$('results').hidden=true;$('pause-screen').hidden=true;document.body.classList.remove('playing');updateSelection();placeMenuCar();graphics.resetHistory();}

function finish(){mode='results';clearInput();$('hud').hidden=true;$('results').hidden=false;lastResult=sim.getResult();const best=records[recordKey()]?.score||0;lastRecord=lastResult.score>best;if(lastRecord){records[recordKey()]={score:lastResult.score,time:lastResult.time};try{localStorage.setItem('apex-flight-records-v3',JSON.stringify(records));}catch{}}car.update({time:sim.state.elapsed,damage:sim.state.damage,jet:false,rollInput:0});renderResult(lastResult,lastRecord);graphics.resetHistory();}
function renderResult(r,newRecord){
  $('result-title').textContent=t(r.completed?'result.success':'result.failure');$('result-reason').textContent=eventText(r.reason);$('grade').textContent=r.grade;$('final-score').textContent=r.score.toLocaleString();$('record-label').textContent=newRecord?t('result.newRecord'):'';
  $('final-time').textContent=r.time.toFixed(1)+' '+t('unit.seconds');$('final-flips').textContent=r.flips+' '+t('unit.times');$('final-air').textContent=r.airtime.toFixed(1)+' '+t('unit.seconds');$('final-speed').textContent=Math.round(r.maxSpeed)+' km/h';$('final-health').textContent=t('result.integrity',{value:Math.round(r.health)});
  $('damage-report').replaceChildren();for(const key of ['body','suspension','battery','thrusters']){const value=clamp(r.damage[key],0,100),row=document.createElement('div');row.className='damage-row';row.innerHTML=`<span>${t('damage.'+key)}</span><div class="bar"><i style="width:${100-value}%;background:${value>60?'#f28e72':value>25?'#e9c77c':'#b9dc95'}"></i></div><b>${t('result.damage',{value:Math.round(value)})}</b>`;$('damage-report').appendChild(row);}
}

function syncMagnet(){$('magnet').innerHTML=t(magnet?'magnet.on':'magnet.off')+' <kbd>M</kbd>';$('magnet').setAttribute('aria-pressed',String(magnet));}

function syncCamera(){$('camera').innerHTML=t('camera.'+cameraMode)+' <kbd>C</kbd>';graphics?.resetHistory();}

function controls(){const down=c=>held.has(c)||[...touch.values()].includes(c);return{throttle:down('throttle')?1:0,brake:down('brake')?1:0,steer:(down('right')?1:0)-(down('left')?1:0),flip:(down('flipRight')?1:0)-(down('flipLeft')?1:0),jet:down('jet'),magnet};}
function clearInput(){held.clear();touch.clear();document.querySelectorAll('.active[data-control]').forEach(b=>b.classList.remove('active'));}
const keys={KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',KeyQ:'flipLeft',KeyE:'flipRight',Space:'jet'};
function bindUI(){
  $('start').onclick=start;$('pause').onclick=pause;$('resume').onclick=resume;$('restart').onclick=start;$('retry').onclick=start;$('exit').onclick=menu;$('choose').onclick=menu;
  $('magnet').onclick=()=>{magnet=!magnet;syncMagnet();};$('camera').onclick=()=>{cameraMode=(cameraMode+1)%3;syncCamera();};
  $('language').onclick=()=>{setLanguage(getLanguage()==='zh'?'en':'zh');refreshLanguage();};
  $('vehicle').onchange=e=>{vehicle=getVehicle(e.target.value);try{localStorage.setItem('apex-vehicle',vehicle.id);}catch{}car.dispose();car=createCar(effectiveQuality(),vehicle);scene.add(car.group);selectTrack(selected);};
  for(const id of ['motion-blur','pause-blur'])$(id).onchange=e=>{motionBlur=e.target.checked;$('motion-blur').checked=motionBlur;$('pause-blur').checked=motionBlur;graphics.setMotionBlur(motionBlur);try{localStorage.setItem('apex-motion-blur',String(motionBlur));}catch{}};
  $('recover').onclick=()=>{if(mode!=='playing')return;clearInput();sim.recoverToTrack();effects.reset();chase.reset();graphics.resetHistory();};
  $('quality').onchange=e=>{quality=e.target.value;try{localStorage.setItem('apex-quality',quality);}catch{}applyQuality();car.dispose();car=createCar(effectiveQuality(),vehicle);scene.add(car.group);selectTrack(selected);};
  $('help').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('#help-dialog .close,#help-dialog .close-help').forEach(b=>b.onclick=()=>$('help-dialog').close());
  $('sound').onclick=()=>{soundOn=!soundOn;$('sound').textContent=t(soundOn?'sound.on':'sound.off');initAudio();};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else{$('fullscreen').textContent=t('fullscreen.hint');}}catch{$('fullscreen').textContent=t('fullscreen.hint');}};
  document.querySelector('.brand').onclick=e=>{e.preventDefault();if(mode==='playing')pause();else if(mode!=='menu')menu();};
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||$('help-dialog').open)return;if(keys[e.code]&&mode==='playing'){e.preventDefault();held.add(keys[e.code]);}if(e.repeat)return;if(e.code==='Escape'||e.code==='KeyP'){e.preventDefault();if(mode==='playing')pause();else if(mode==='paused')resume();}if(mode==='playing'){if(e.code==='KeyM')$('magnet').click();if(e.code==='KeyC')$('camera').click();if(e.code==='KeyR')start();if(e.code==='KeyT')$('recover').click();}});
  window.addEventListener('keyup',e=>{if(keys[e.code]){held.delete(keys[e.code]);if(mode==='playing')e.preventDefault();}});
  document.querySelectorAll('[data-control]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(mode!=='playing')return;b.setPointerCapture(e.pointerId);touch.set(e.pointerId,b.dataset.control);b.classList.add('active');});for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,e=>{touch.delete(e.pointerId);b.classList.toggle('active',[...touch.values()].includes(b.dataset.control));});b.addEventListener('contextmenu',e=>e.preventDefault());});
  window.addEventListener('blur',()=>{clearInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});window.addEventListener('resize',resize);
  document.addEventListener('contextmenu',e=>{if(!e.target.closest('select,input'))e.preventDefault();});
  $('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();pause();fatal(new Error('图形上下文已断开，请刷新页面重试。'));});
}
function formatTime(n){return String(Math.floor(n/60)).padStart(2,'0')+':'+(n%60).toFixed(1).padStart(4,'0');}
function attitude(){const s=sim.state;if(!s.grounded){const r=Math.atan2(Math.sin(s.roll||0),Math.cos(s.roll||0))*180/Math.PI;$('mode-label').textContent=t(s.jetActive?'mode.jet':'mode.air')+' · '+t('mode.roll',{value:Math.round(r)});}}

function hud(){
  const s=sim.state;$('speed').textContent=Math.round(s.speed*3.6);$('timer').textContent=formatTime(s.elapsed);$('score').textContent=String(Math.round(s.score)).padStart(5,'0');$('distance').textContent=Math.floor(s.s)+' / '+Math.round(track.length)+' M';$('fuel').style.width=s.fuel+'%';$('fuel-value').textContent=Math.round(s.fuel)+'%';$('health').style.width=s.health+'%';$('health').style.background=s.health<35?'#ff9279':'var(--acid)';$('health-value').textContent=Math.round(s.health)+'%';$('progress').style.width=clamp(s.s/track.length*100,0,100)+'%';$('event').textContent=eventText(s.lastEvent);$('event').style.opacity=s.eventTimer>0?'1':'0';
  $('mode-label').textContent=s.offroad?t('mode.explore'):s.jetActive?t('mode.jet'):!s.grounded?t('mode.air'):Math.cos(s.angle)<-.3?t('mode.inverted')+(magnet?' · '+t('mode.adhesion'):''):t('mode.ground');
  $('gear').textContent=s.speed>.5?t('gear.drive'):t('gear.neutral');$('grip').textContent=s.grounded?Math.round((1-(s.slip||0))*100)+'%':'—';
  const warning=(s.platforms||[]).find(p=>p.triggeredAt!=null&&!p.vanished&&p.remaining>0);$('platform-warning').textContent=warning?t('platform.warning',{seconds:warning.remaining.toFixed(1)}):'';$('platform-warning').hidden=!warning;
  drawMinimap();
}

function drawMinimap(){const c=$('minimap'),ctx=c.getContext('2d'),points=track.samples;const minX=Math.min(...points.map(p=>p.p.x)),maxX=Math.max(...points.map(p=>p.p.x)),maxY=Math.max(...points.map(p=>p.p.y)),minY=Math.min(...points.map(p=>p.p.y));const scale=Math.min(190/(maxX-minX||1),55/(maxY-minY||1));const xy=p=>[10+(p.x-minX)*scale,65-(p.y-minY)*scale];ctx.clearRect(0,0,210,82);ctx.lineWidth=1.5;ctx.strokeStyle='#aabda77a';ctx.beginPath();for(let i=0;i<points.length;i++){const p=points[i];const a=xy(p.p);if(!i||p.gap)ctx.moveTo(...a);else ctx.lineTo(...a);}ctx.stroke();const pt=xy(mode==='menu'?track.sample(3).p:sim.state.pos);ctx.fillStyle='#d1f891';ctx.beginPath();ctx.arc(...pt,3,0,Math.PI*2);ctx.fill();ctx.font='8px sans-serif';ctx.fillStyle='#9eaf9e';ctx.fillText(t('hud.route'),10,80);}
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min((now-last)/1000||0,.05);last=now;const time=now/1000;
  if(mode==='playing'){
    const input=controls();accumulator+=dt;while(accumulator>=1/120){sim.step(1/120,input);accumulator-=1/120;}
    const s=sim.state;car.group.position.copy(s.pos);car.group.quaternion.copy(s.quaternion);car.update({...s,jet:s.jetActive,time:s.elapsed,steer:input.steer});
    let f=track.nearest(s.pos,s.s),solid=!!f&&!f.gap&&sim.isSolid(f.s)&&Math.abs(f.lateral)<f.width/2+2;
    if(!solid||s.offroad){const y=track.terrainHeightAt(s.pos.x,s.pos.z);const floorDistance=s.pos.y-y;if(!f||floorDistance<Math.abs(f.height)||s.offroad){f={p:new THREE.Vector3(s.pos.x,y,s.pos.z),normal:new THREE.Vector3(0,1,0),tangent:new THREE.Vector3(1,0,0),side:new THREE.Vector3(0,0,1),height:floorDistance};solid=true;}}
    effects.update(dt,s,{frame:f,solid,groundHeight:world.heightAt?.(s.pos.x,s.pos.z)??track.groundY??-.22});hud();attitude();if(s.finished)finish();
  }
  world.update(time,car.group.position,sim.state);
  if(mode==='menu'){
    const p=car.group.position,mobile=innerWidth<821&&innerHeight>550;camTarget.copy(p).add(new THREE.Vector3(7+Math.sin(time*.13)*.8,mobile?6:3.4,mobile?14:9));lookTarget.copy(p).add(new THREE.Vector3(mobile?0:1,mobile?2:1,0));camera.fov=mobile?48:44;camera.up.set(0,1,0);camera.position.lerp(camTarget,1-Math.exp(-dt*3));currentLook.lerp(lookTarget,1-Math.exp(-dt*4));camera.lookAt(currentLook);camera.updateProjectionMatrix();
  }else chase.update(sim.state,track,dt,cameraMode,world.occluders||[]);
  sun.position.copy(car.group.position).add(new THREE.Vector3(-45,60,-70));sun.target.position.copy(car.group.position);updateAudio();graphics.render(scene,camera,dt,mode==='playing');
  frames++;frameTime+=dt;if(frameTime>=1){$('render-status').innerHTML='<i></i> '+Math.round(frames/frameTime)+' FPS / '+effectiveQuality().toUpperCase();frames=0;frameTime=0;}
}

function initAudio(){if(!soundOn)return;try{if(!audio){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),gain=ctx.createGain(),osc=ctx.createOscillator(),jetGain=ctx.createGain();gain.gain.value=0;osc.type='sawtooth';osc.frequency.value=45;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=250;osc.connect(filter);filter.connect(gain);gain.connect(ctx.destination);osc.start();const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.4;const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const nf=ctx.createBiquadFilter();nf.type='lowpass';nf.frequency.value=1300;noise.connect(nf);nf.connect(jetGain);jetGain.connect(ctx.destination);jetGain.gain.value=0;noise.start();audio={ctx,gain,osc,jetGain};}audio.ctx.resume();}catch{soundOn=false;}}
function updateAudio(){if(!audio)return;const on=soundOn&&mode==='playing',s=sim.state,now=audio.ctx.currentTime;audio.gain.gain.setTargetAtTime(on?.018+s.speed*.00035:0,now,.1);audio.osc.frequency.setTargetAtTime(35+s.speed*3,now,.12);audio.jetGain.gain.setTargetAtTime(on&&s.jetActive?.13:0,now,.06);}
try{init();}catch(error){fatal(error);}




