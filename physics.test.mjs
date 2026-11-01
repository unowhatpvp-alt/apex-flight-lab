import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.js';
import { Simulator } from './physics.js';
import { TRACKS, buildTrack } from './tracks.js';
import { VEHICLES, getVehicle } from './vehicles.js';

const simulate = (sim, seconds, input, dt = 1 / 120) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt, typeof input === 'function' ? input(sim.state) : input);
};
const finiteState = st => {
  for (const key of ['speed', 's', 'angle', 'angularVelocity', 'roll', 'rollVelocity', 'health', 'fuel', 'elapsed', 'score', 'steerAngle', 'headingError', 'slip', 'suspension', 'landingImpact']) assert.ok(Number.isFinite(st[key]), `${key} must be finite`);
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
assert.ok(Math.abs(rolling.state.angle - neutral.state.angle) < 1e-8, 'Q/E must not directly change pitch');
assert.ok(rolling.state.forward.distanceTo(neutral.state.forward) < 1e-8, 'Roll preserves the longitudinal forward axis');
const left = new Simulator(buildTrack('proving')); pose(left); simulate(left, 0.6, { flip: -1 });
assert.ok(left.state.roll < -0.8);
console.log('PASS Q/E changes roll, not pitch; left/right signs are opposite');

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
assert.ok(!terrain.state.finished && terrain.state.offroad && terrain.state.grounded);
assert.ok(terrain.state.pos.y - terrain._support(new THREE.Vector3(0, 1, 0)) >= -0.221);
console.log('PASS off-track terrain landing continues exploration without underground travel');

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

// A gate is a finite physical opening, not a nearest-path distance threshold.
const gateTrack = buildTrack('proving');
gateTrack.finishGate = { s: gateTrack.length - 20, width: gateTrack.width, height: 5.9 };
const gateFrame = gateTrack.sample(gateTrack.finishGate.s);
for (const [name, offset, height, direction, completed] of [['inside', 0, 0.65, 1, true], ['outside', gateTrack.width, 0.65, 1, false], ['above', 0, 15, 1, false], ['reverse', 0, 0.65, -1, false]]) {
  const crossing = new Simulator(gateTrack);
  pose(crossing, { x: gateFrame.p.x - direction * 2, y: gateFrame.p.y + height, z: offset, vx: direction * 30 });
  crossing._hintS = crossing.state.s = gateFrame.s - direction * 2;
  simulate(crossing, 0.2, {});
  assert.equal(crossing.getResult().completed, completed, `finish crossing: ${name}`);
  if (completed) {
    const elapsed = crossing.state.elapsed;
    crossing.step(1 / 60, { throttle: 1 }); assert.equal(crossing.state.elapsed, elapsed);
  }
}
console.log('PASS swept finish gate, lateral/height bypass and reverse rejection');

const explore = new Simulator(buildTrack('proving'));
pose(explore, { x: 4000, y: 0.4, z: 400, vx: 0, vy: 0 });
simulate(explore, 0.2, {});
assert.ok(explore.state.offroad && !explore.state.finished);
simulate(explore, 181, {});
assert.ok(explore.state.elapsed > 180 && !explore.state.finished);
const oldPosition = explore.state.pos.clone();
simulate(explore, 2, { throttle: 1, steer: 0.4 });
assert.ok(explore.state.pos.distanceTo(oldPosition) > 10 && !explore.state.finished);
explore._damage({ body: 10 }); explore.state.fuel = 57;
const oldTime = explore.state.elapsed, oldHealth = explore.state.health;
assert.equal(explore.recoverToTrack(), true);
assert.ok(explore.state.grounded && !explore.state.offroad && explore.isSolid(explore.state.s));
assert.equal(explore.state.elapsed, oldTime); assert.equal(explore.state.health, oldHealth); assert.equal(explore.state.fuel, 57);
console.log('PASS unlimited off-track exploration, terrain driving and non-destructive recovery');

const platform = new Simulator(buildTrack('reveal'));
const zone = platform.track.vanishZones[0], mid = (zone.start + zone.end) / 2, midFrame = platform.track.sample(mid);
platform.state.s = platform._hintS = mid; platform.state.pos.copy(midFrame.p).addScaledVector(midFrame.normal, 0.60);
simulate(platform, 0.6, {});
assert.ok(platform.isSolid(mid) && platform.state.platforms[0].remaining > 0);
simulate(platform, 1.4, {});
assert.ok(!platform.isSolid(mid) && platform.state.platforms[0].vanished && !platform.state.grounded);
assert.ok(platform.state.pos.y < midFrame.p.y - 1, 'The invisible platform must not retain a collision surface');
platform.reset(); assert.ok(platform.isSolid(mid) && !platform.state.platforms[0].vanished);
console.log('PASS triggered disappearing platforms, collision removal and reset');

const stoppedSteer = new Simulator(buildTrack('proving'));
const stoppedPosition = stoppedSteer.state.pos.clone();
simulate(stoppedSteer, 1, { steer: 1 });
assert.ok(Math.abs(stoppedSteer.state.pos.x - stoppedPosition.x) < 0.001 && Math.abs(stoppedSteer.state.pos.z - stoppedPosition.z) < 0.001);
assert.ok(stoppedSteer.state.steerAngle > 0.3);
const turn = new Simulator(buildTrack('proving')); simulate(turn, 2, { throttle: 1 });
simulate(turn, 0.6, { throttle: 1, steer: 0.6 });
assert.ok(turn.state.headingError > 0.03 && turn.state.forward.z > 0.03 && turn.state.lane > 0.01);
assert.ok(turn.state.slip > 0 && turn.state.suspension > 0);
const slowSteering = new Simulator(buildTrack('proving')), fastSteering = new Simulator(buildTrack('proving'));
slowSteering.state.speed = 8; fastSteering.state.speed = 50;
simulate(slowSteering, 0.15, { steer: 0.4 }); simulate(fastSteering, 0.15, { steer: 0.4 });
assert.ok(Math.abs(slowSteering.state.steerAngle) > Math.abs(fastSteering.state.steerAngle));
console.log('PASS speed-sensitive steering, tyre slip, chassis yaw and no stationary sliding');

const speedByVehicle = {};
for (const vehicle of VEHICLES) {
  const acceleration = new Simulator(buildTrack('proving'), vehicle);
  simulate(acceleration, 3, { throttle: 1 }); speedByVehicle[vehicle.id] = acceleration.state.speed;
  for (const descriptor of TRACKS) {
    const run = new Simulator(buildTrack(descriptor.id), getVehicle(vehicle.id));
    simulate(run, 100, st => {
      const target = run.track.gaps.some(g => g.start > st.s && g.start - st.s < 95) ? 31 : 54;
      return { throttle: st.speed < target ? 1 : 0, brake: st.speed > target + 1 ? 1 : 0 };
    });
    assert.equal(run.getResult().completed, true, `${vehicle.id}/${descriptor.id}`); finiteState(run.state);
  }
}
assert.ok(speedByVehicle.prototype > speedByVehicle.roadster && speedByVehicle.roadster > speedByVehicle.coupe && speedByVehicle.coupe > speedByVehicle.rally);
const robust = new Simulator(buildTrack('proving'), getVehicle('rally')), fragile = new Simulator(buildTrack('proving'), getVehicle('prototype'));
robust._damage({ body: 20, suspension: 20 }); fragile._damage({ body: 20, suspension: 20 });
assert.ok(robust.state.health > fragile.state.health);
console.log('PASS distinct vehicle tuning and all 4 vehicles × 6 courses');

const sceneryTrack = buildTrack('proving');
sceneryTrack.terrainHeightAt = () => 0;
sceneryTrack.obstacles = [{ type: 'box', min: new THREE.Vector3(18, 0, 25), max: new THREE.Vector3(20, 12, 80) }];
const placeOffroad = (sim, x = 0, z = 40, heading = 0, speed = 0) => {
  Object.assign(sim.state, { grounded: true, offroad: true, headingError: heading, speed, s: 3 });
  sim.state.pos.set(x, .612, z); sim.state.vel.set(Math.cos(heading) * speed, 0, Math.sin(heading) * speed);
  sim._baseQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -heading); sim._updateOrientation();
};
const wallDrive = new Simulator(sceneryTrack); placeOffroad(wallDrive);
simulate(wallDrive, 4, { throttle: 1 });
assert.ok(wallDrive.state.pos.x + wallDrive._support(new THREE.Vector3(1, 0, 0)) <= 18.02, 'Holding throttle cannot push the hull through a building');
assert.ok(wallDrive.state.speed < .5 && wallDrive.state.damage.body > 0 && !wallDrive.state.finished);
finiteState(wallDrive.state);
const glancing = new Simulator(sceneryTrack); placeOffroad(glancing, 14, 40, .55, 16);
simulate(glancing, 1, {});
assert.ok(glancing.state.pos.x + glancing._support(new THREE.Vector3(1, 0, 0)) <= 18.03);
assert.ok(glancing.state.pos.z > 43, 'Wall contact should retain tangential motion');
finiteState(glancing.state);
console.log('PASS scenery wall blocking, sustained throttle, sliding and impact damage');

const lowWallTrack = buildTrack('proving'); lowWallTrack.terrainHeightAt = () => 0;
lowWallTrack.obstacles = [{ type: 'box', min: new THREE.Vector3(18, 0, 25), max: new THREE.Vector3(18.05, 2, 80) }];
const overWall = new Simulator(lowWallTrack); pose(overWall, { x: 0, y: 8, z: 40, vx: 35 });
simulate(overWall, .7, {});
assert.ok(overWall.state.pos.x > 22 && overWall.state.damage.body === 0, 'Flying above an obstacle must remain possible');
const sweptWall = new Simulator(lowWallTrack); pose(sweptWall, { x: 0, y: .8, z: 40, vx: 900 });
simulate(sweptWall, .05, {});
assert.ok(sweptWall.state.pos.x + sweptWall._support(new THREE.Vector3(1, 0, 0)) <= 18.03, 'Swept hull must not tunnel through a thin wall');
assert.ok(sweptWall.state.damage.body > 0);
console.log('PASS obstacle vertical clearance and high-speed swept contact');

const rockTrack = buildTrack('proving'); rockTrack.terrainHeightAt = () => 0;
rockTrack.obstacles = [{ type: 'sphere', center: new THREE.Vector3(18, 1.5, 40), radius: 2, minY: 0, maxY: 3 }];
const rockDrive = new Simulator(rockTrack); placeOffroad(rockDrive);
simulate(rockDrive, 4, { throttle: 1 });
const rockNormal = rockDrive.state.pos.clone().sub(new THREE.Vector3(18, rockDrive.state.pos.y, 40)).normalize();
assert.ok(Math.hypot(rockDrive.state.pos.x - 18, rockDrive.state.pos.z - 40) >= 2 + rockDrive._support(rockNormal) - .025);
assert.ok(rockDrive.state.damage.body > 0 && !rockDrive.state.finished); finiteState(rockDrive.state);
console.log('PASS bounded rock collision proxy prevents off-road ghosting');

const openTrack = buildTrack('reveal'); openTrack.openEdges = true; openTrack.terrainHeightAt = () => 0;
const openEdge = new Simulator(openTrack), openFrame = openTrack.sample(50);
Object.assign(openEdge.state, { s: 50, speed: 20, lane: openTrack.width / 2 - .45, headingError: .5 });
openEdge.state.pos.copy(openFrame.p).addScaledVector(openFrame.normal, .612).addScaledVector(openFrame.side, openEdge.state.lane);
openEdge._baseQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -.5); openEdge._updateOrientation();
simulate(openEdge, .8, { throttle: .4, steer: .2 });
assert.ok(!openEdge.state.grounded && openEdge.state.pos.z > openTrack.width / 2 + 1, 'Open stage edges allow driving off into exploration');
assert.equal(openEdge.state.damage.body, 0, 'There is no invisible high guardrail on the reveal deck');
const stageUnderside = new Simulator(openTrack); pose(stageUnderside, { x: 50, y: 40.3, vx: 0, vy: 15 });
simulate(stageUnderside, .12, {});
assert.ok(stageUnderside.state.pos.y + .7 <= 41.37 && stageUnderside.state.vel.y < 0);
console.log('PASS open reveal edges and matching 0.65 m solid deck thickness');
console.log('All physics checks passed.');
