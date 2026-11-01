import * as THREE from './vendor/three.module.js';

// The chase frame follows the car's longitudinal direction, but not its barrel
// roll: Q/E remain readable against the road, while loops rotate the frame.
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.rotation = new THREE.Quaternion();
    this.targetRotation = new THREE.Quaternion();
    this.forward = new THREE.Vector3(1,0,0);
    this.up = new THREE.Vector3(0,1,0);
    this.side = new THREE.Vector3(0,0,1);
    this.desired = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.matrix = new THREE.Matrix4();
    this.inverseRoll = new THREE.Quaternion();
    this.axis = new THREE.Vector3(1,0,0);
    this.initialized = false;
  }
  reset(){this.initialized=false;}
  update(state, track, dt, mode=0, occluders=[]) {
    if(state.quaternion){
      this.inverseRoll.setFromAxisAngle(this.axis,-(state.roll||0));
      this.targetRotation.copy(state.quaternion).multiply(this.inverseRoll);
    }else{
      const f=track.sample(state.s);this.matrix.makeBasis(f.tangent,f.normal,f.side);this.targetRotation.setFromRotationMatrix(this.matrix);
    }
    if(!this.initialized)this.rotation.copy(this.targetRotation);
    this.rotation.slerp(this.targetRotation,1-Math.exp(-dt*5.5));
    this.forward.set(1,0,0).applyQuaternion(this.rotation);
    this.up.set(0,1,0).applyQuaternion(this.rotation);
    const speed=Math.min(state.speed,75);
    const portrait=this.camera.aspect<.75;
    const distance=(mode===1?17+speed*.035:mode===2?5.6:10+speed*.025)*(portrait?1.38:1);
    const height=mode===1?5.7:mode===2?1.8:3.4;
    this.anchor.copy(state.pos).addScaledVector(this.up,.6);
    this.desired.copy(state.pos).addScaledVector(this.forward,-distance).addScaledVector(this.up,height);
    // Anticipate translation so the spring does not produce a long camera lag.
    this.desired.addScaledVector(state.vel,.085);
    this.look.copy(state.pos).addScaledVector(this.forward,4+speed*.025).addScaledVector(this.up,.65);
    if(!this.initialized){this.camera.position.copy(this.desired);this.initialized=true;}
    else this.camera.position.lerp(this.desired,1-Math.exp(-dt*10));
    this.camera.up.copy(this.up);
    // Check the actual smoothed camera segment as well as the desired one.
    if(occluders.length){
      this.side.subVectors(this.camera.position,this.anchor);const len=this.side.length();
      if(len>.4){this.ray.set(this.anchor,this.side.divideScalar(len));this.ray.near=.3;this.ray.far=len+.4;
        const hit=this.ray.intersectObjects(occluders,false)[0];
        if(hit&&hit.distance<len+.4)this.camera.position.copy(this.anchor).addScaledVector(this.side,Math.max(.35,hit.distance-.5));
      }
    }
    if(track.terrainHeightAt){const floor=track.terrainHeightAt(this.camera.position.x,this.camera.position.z);if(Number.isFinite(floor))this.camera.position.y=Math.max(this.camera.position.y,floor+.8);}
    this.camera.fov=(mode===2?66:THREE.MathUtils.clamp(55+speed*.11,55,64))+(portrait?5:0);
    this.camera.lookAt(this.look);this.camera.updateProjectionMatrix();
  }
}
