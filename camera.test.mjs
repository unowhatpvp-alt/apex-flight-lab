import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { ChaseCamera } from './camera.js';
import { buildTrack } from './tracks.js';

const camera=new THREE.PerspectiveCamera(55,16/9,.1,2400),chase=new ChaseCamera(camera);
const track=buildTrack('loop');
const state={pos:new THREE.Vector3(0,10,0),vel:new THREE.Vector3(),speed:0,s:0,roll:0,quaternion:new THREE.Quaternion()};
chase.update(state,track,1/60);
assert.ok(camera.position.x<state.pos.x-9,'default camera follows behind the car');
assert.ok(Math.abs(camera.position.z-state.pos.z)<.001,'no fixed side offset');
const uprightPosition=camera.position.clone();
state.roll=Math.PI/2;state.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),state.roll);
chase.reset();chase.update(state,track,1/60);
assert.ok(camera.position.distanceTo(uprightPosition)<.001,'barrel roll remains visible while chase horizon is stable');
state.roll=0;state.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2);
chase.reset();chase.update(state,track,1/60);
assert.ok(camera.position.z>9&&Math.abs(camera.position.x)<.001,'camera rotates with the car heading');

state.quaternion.identity();const wall=new THREE.Mesh(new THREE.BoxGeometry(.5,20,20),new THREE.MeshBasicMaterial());wall.position.set(-5,10,0);wall.updateMatrixWorld(true);
chase.reset();chase.update(state,track,1/60,0,[wall]);
assert.ok(camera.position.x>-4.75,'camera moves in front of occluding wall');

for(const p of track.samples.filter((_,i)=>i%20===0)){
  state.pos.copy(p.p).addScaledVector(p.normal,.6);state.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(p.tangent,p.normal,p.side));state.s=p.s;
  chase.reset();chase.update(state,track,1/60);
  assert.ok(camera.position.clone().sub(state.pos).dot(p.tangent)<-9.9,'chase follows behind throughout helix');
  assert.ok(camera.up.dot(p.normal)>.999,'camera remains aligned with loop surface, not fixed world side');
}
console.log('PASS chase heading, independent roll horizon, obstacle shortening and full helical loop');
