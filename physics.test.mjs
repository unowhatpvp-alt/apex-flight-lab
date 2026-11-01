import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { Simulator } from './physics.js';
import { TRACKS, buildTrack } from './tracks.js';

const simulate = (sim, seconds, input, dt = 1 / 120) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt, typeof input === 'function' ? input(sim.state) : input);
};
const finiteState = st => {
  for (const key of ['speed', 's', 'angle', 'angularVelocity', 'roll', 'rollVelocity', 'health', 'fuel', 'elapsed', 'score']) assert.ok(Number.isFinite(st[key]), `${key} must be finite`);
  for (const vector of [st.pos, st.vel, st.forward, st.up, st.side]) assert.ok(vector.toArray().every(Number.isFinite));
  assert.ok(Math.abs(st.quaternion.length() - 1) < 1e-8);
  assert.ok(Math.abs(st.forward.dot(st.up)) < 1e-8);
  assert.ok(st.fuel >= 0 && st.fuel <= 100 && st.health >= 0 && st.health <= 100);
};
const pose = (sim, { x = 50, y = 30, z = 0, pitch = 0, roll = 0, vx = 20, vy = 0, vz = 0 } = {}) => {
  Object.assign(sim.state, { grounded: false, angle: pitch, roll, s: x, angularVelocity: 0, rollVelocity: 0 });
  sim.state.pos.set(x, y, z); sim.state.vel.set(vx, vy, vz); sim._hintS = x;
  sim._baseQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch); sim._updateOrientation();
};
const hullMinimumHeight = (sim, frame) => {
  let minimum = Infinity;
  for (const x of [-2.28, 2.28]) for (const y of [-0.60, 0.70]) for (const z of [-1.15, 1.15]) {
    const corner = new THREE.Vector3(x, y, z).applyQuaternion(sim.state.quaternion).add(sim.state.pos);
    minimum = Math.min(minimum, corner.sub(frame.p).dot(frame.normal));
  }
  return minimum;
};

for (const descriptor of TRACKS) {
  const sim = new Simulator(buildTrack(descriptor.id));
  simulate(sim, 90, st => {
    const approachingJump = sim.track.gaps.some(gap => gap.start > st.s && gap.start - st.s < 95);
    const targetSpeed = approachingJump ? 31 : 54;
    return { throttle: st.speed < targetSpeed ? 1 : 0, brake: st.speed > targetSpeed + 1 ? 1 : 0, magnet: true };
  });
  const result = sim.getResult(); finiteState(sim.state);
  assert.equal(result.completed, true, `${descriptor.id}: ${result.reason}`);
  assert.ok(result.score > 2000 && result.time > 8 && result.time < 90);
  assert.equal(sim.state.checkpoint, sim.track.checkpoints.length);
  console.log(`PASS controllable course: ${descriptor.id} (${result.time.toFixed(2)}s, health ${result.health.toFixed(0)}%)`);
}

const neutral = new Simulator(buildTrack('proving')), rolling = new Simulator(buildTrack('proving'));
pose(neutral); pose(rolling);
simulate(neutral, 0.6, {}); simulate(rolling, 0.6, { flip: 1 });
assert.ok(rolling.state.roll > 0.8);
assert.ok(Math.abs(rolling.state.angle - neutral.state.angle) < 1e-8, 'A/D must not directly change pitch');
assert.ok(rolling.state.forward.distanceTo(neutral.state.forward) < 1e-8, 'Roll preserves the longitudinal forward axis');
const left = new Simulator(buildTrack('proving')); pose(left); simulate(left, 0.6, { flip: -1 });
assert.ok(left.state.roll < -0.8);
console.log('PASS A/D changes roll, not pitch; left/right signs are opposite');

const ramp = new Simulator(buildTrack('proving'));
let pitchOnDeparture = 0, rateOnDeparture = 0;
for (let i = 0; i < 3000; i++) {
  ramp.step(1 / 120, { throttle: 1 });
  if (!ramp.state.grounded) { pitchOnDeparture = ramp.state.angle; rateOnDeparture = ramp.state.angularVelocity; break; }
}
assert.ok(Math.abs(pitchOnDeparture) > 0.15 && Math.abs(rateOnDeparture) > 0.1);
assert.equal(ramp.state.roll, 0);
console.log('PASS automatic ramp pitch and inherited pitch momentum');

const lateralJet = new Simulator(buildTrack('proving'));
pose(lateralJet, { roll: Math.PI / 2, vx: 0 });
simulate(lateralJet, 0.1, { jet: true });
assert.ok(lateralJet.state.vel.z > 2.6, 'Rolled local-up thrust must act sideways');
assert.ok(lateralJet.state.vel.y < 0, 'A 90-degree rolled thruster cannot provide vertical lift');
assert.ok(Math.abs(lateralJet.state.fuel - 97.5) < 0.001);
console.log('PASS local-up jet force follows roll orientation');

const jet = new Simulator(buildTrack('proving'));
simulate(jet, 2, {}); assert.equal(jet.state.s, 3);
simulate(jet, 2, { throttle: 0.5 });
const startY = jet.state.pos.y; simulate(jet, 1, { jet: true });
assert.ok(!jet.state.grounded && jet.state.pos.y > startY + 5);
assert.ok(Math.abs(jet.state.fuel - 75) < 0.01);
simulate(jet, 2.1, { flip: 1 }); simulate(jet, 0.5, {});
assert.ok(jet.state.flips >= 1); finiteState(jet.state);
console.log('PASS launch, fuel and complete longitudinal flip scoring');

for (const [label, pitch, roll, failed] of [['upright', 0, 0, false], ['nose', 0.55, 0, false], ['side', 0, Math.PI / 2, true], ['roof', 0, Math.PI, true]]) {
  const landing = new Simulator(buildTrack('proving'));
  pose(landing, { pitch, roll, vx: 8, vy: -16, y: 5 + 2.28 * Math.abs(Math.sin(pitch)) + 1.15 * Math.abs(Math.sin(roll)) + 1 });
  for (let i = 0; i < 100 && !landing.state.finished; i++) {
    landing.step(1 / 120, {});
    const frame = landing.track.sample(landing.state.s);
    assert.ok(hullMinimumHeight(landing, frame) >= -0.025, `${label} hull must not pass through road`);
    if (landing.state.grounded) break;
  }
  assert.ok(landing.state.damage.suspension > 1);
  assert.equal(landing.state.failed, failed, label);
  if (!failed) assert.equal(landing.state.grounded, true);
}
console.log('PASS whole-hull nose/side/roof collision without road penetration');

const underside = new Simulator(buildTrack('proving'));
pose(underside, { y: 3.3, vx: 0, vy: 15 });
simulate(underside, 0.12, {});
assert.ok(underside.state.pos.y + 0.7 < 4.37);
assert.ok(underside.state.vel.y < 0 && underside.state.damage.body > 0 && !underside.state.grounded);
console.log('PASS solid deck underside collision');

const gapHit = new Simulator(buildTrack('proving'));
const end = gapHit.track.sample(gapHit.track.gaps[0].end);
pose(gapHit, { x: end.p.x, y: end.p.y });
gapHit._baseQuaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(end.tangent, end.normal, end.side));
gapHit._updateOrientation();
gapHit.state.pos.copy(end.p).addScaledVector(end.tangent, -3).addScaledVector(end.normal, -0.1);
gapHit.state.vel.copy(end.tangent).multiplyScalar(30); gapHit.state.s = gapHit._hintS = end.s - 3;
simulate(gapHit, 0.15, {});
assert.ok(gapHit.state.damage.body > 0, 'Below-deck arrival hits the gap edge');
assert.ok(gapHit.state.vel.dot(end.tangent) < 0 || gapHit.state.failed);
console.log('PASS solid gap end-face collision');

const terrain = new Simulator(buildTrack('proving'));
pose(terrain, { x: 50, y: 1, z: 25, vy: -15, roll: 0.6 });
simulate(terrain, 0.15, {});
assert.ok(terrain.state.failed && terrain.state.reason.includes('地面'));
assert.ok(terrain.state.pos.y - terrain._support(new THREE.Vector3(0, 1, 0)) >= -0.221);
console.log('PASS off-track terrain collision without underground travel');

const invertedTrack = buildTrack('inverted');
const ceiling = invertedTrack.samples.find(frame => frame.normal.y < -0.999 && frame.s > 320);
for (const magnet of [true, false]) {
  const sim = new Simulator(invertedTrack);
  Object.assign(sim.state, { s: ceiling.s, speed: 0, angle: Math.PI });
  sim._baseQuaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ceiling.tangent, ceiling.normal, ceiling.side)); sim._updateOrientation();
  sim.state.pos.copy(ceiling.p).addScaledVector(ceiling.normal, 0.60);
  sim.step(1 / 60, { magnet }); assert.equal(sim.state.grounded, magnet);
}
console.log('PASS inverted ceiling adhesion toggle');

const fast = new Simulator(buildTrack('loop')), slow = new Simulator(buildTrack('loop'));
simulate(fast, 8, { throttle: 1 }, 1 / 120); simulate(slow, 8, { throttle: 1 }, 1 / 30);
assert.ok(fast.state.pos.distanceTo(slow.state.pos) < 0.001);
assert.ok(fast.state.quaternion.angleTo(slow.state.quaternion) < 0.0001);
assert.ok(Math.abs(fast.state.score - slow.state.score) <= 1);
console.log('PASS 30/120 fps translation and orientation equivalence');

const crash = new Simulator(buildTrack('proving'));
simulate(crash, 6, { throttle: 1, steer: 1 });
assert.ok(crash.state.damage.body > 0 && Math.abs(crash.state.lane) < crash.track.width / 2);
crash.reset(); assert.equal(crash.state.health, 100); assert.equal(crash.state.score, 0); assert.equal(crash.state.roll, 0); finiteState(crash.state);
console.log('PASS rail collision and clean orientation reset');

const timeout = new Simulator(buildTrack('proving')); simulate(timeout, 181, {});
assert.ok(timeout.state.finished && timeout.state.failed);
const frozen = timeout.state.elapsed; timeout.step(1 / 60, { throttle: 1 }); assert.equal(timeout.state.elapsed, frozen);
console.log('PASS timeout and terminal-state freeze');
console.log('All physics checks passed.');
