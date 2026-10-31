import assert from 'node:assert/strict';
import { Simulator } from './physics.js';
import { TRACKS, buildTrack } from './tracks.js';

const simulate = (sim, seconds, input, dt = 1 / 120) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt, typeof input === 'function' ? input(sim.state) : input);
};
const finiteState = state => {
  for (const key of ['speed', 's', 'angle', 'angularVelocity', 'health', 'fuel', 'elapsed', 'score']) assert.ok(Number.isFinite(state[key]), `${key} must be finite`);
  assert.ok(state.pos.toArray().every(Number.isFinite));
  assert.ok(state.vel.toArray().every(Number.isFinite));
  assert.ok(state.fuel >= 0 && state.fuel <= 100);
  assert.ok(state.health >= 0 && state.health <= 100);
};

// All five routes have a reachable finish, including complete loops and ceilings.
for (const descriptor of TRACKS) {
  const sim = new Simulator(buildTrack(descriptor.id));
  simulate(sim, 90, { throttle: 1, magnet: true });
  const result = sim.getResult();
  finiteState(sim.state);
  assert.equal(result.completed, true, `${descriptor.id}: ${result.reason}`);
  assert.ok(result.score > 2000);
  assert.equal(sim.state.checkpoint, sim.track.checkpoints.length);
  assert.ok(result.time > 8 && result.time < 90);
  console.log(`PASS reachable course: ${descriptor.id} (${result.time.toFixed(2)}s, health ${result.health.toFixed(0)}%)`);
}

const sim = new Simulator(buildTrack('proving'));
simulate(sim, 2, {});
assert.equal(sim.state.s, 3, 'No acceleration means the car stays still on flat ground');
simulate(sim, 2, { throttle: 0.5 });
const takeoffHeight = sim.state.pos.y;
simulate(sim, 1, { jet: true });
assert.equal(sim.state.grounded, false);
assert.ok(sim.state.pos.y > takeoffHeight + 5);
assert.ok(Math.abs(sim.state.fuel - 75) < 0.01, 'Fuel consumption must be time-based');
simulate(sim, 2.1, { flip: 1 });
simulate(sim, 0.5, {});
assert.ok(sim.state.flips >= 1, 'A complete airborne rotation earns a flip');
finiteState(sim.state);
console.log('PASS launch, fuel, flight torque and flip scoring');

// A hard upright landing damages the suspension; a roof-first landing fails.
for (const upsideDown of [false, true]) {
  const landing = new Simulator(buildTrack('proving'));
  landing.state.grounded = false;
  landing.state.pos.set(50, 7, 0);
  landing.state.vel.set(8, -16, 0);
  landing.state.angle = upsideDown ? Math.PI : 0;
  landing.state.s = landing._hintS = 50;
  simulate(landing, 0.3, {});
  assert.ok(landing.state.damage.suspension > 5);
  assert.equal(landing.state.failed, upsideDown);
  if (!upsideDown) assert.equal(landing.state.grounded, true);
}
console.log('PASS impact damage and roof-first failure');

// Inverted adhesion must depend on the assist toggle, particularly at low speed.
const invertedTrack = buildTrack('inverted');
const ceiling = invertedTrack.samples.find(frame => frame.normal.y < -0.999 && frame.s > 320);
for (const magnet of [true, false]) {
  const inverted = new Simulator(invertedTrack);
  Object.assign(inverted.state, { s: ceiling.s, speed: 0, angle: Math.PI });
  inverted.state.pos.copy(ceiling.p).addScaledVector(ceiling.normal, 0.85);
  inverted.step(1 / 60, { magnet });
  assert.equal(inverted.state.grounded, magnet);
}
console.log('PASS inverted ceiling adhesion toggle');

const fastFrames = new Simulator(buildTrack('loop'));
const slowFrames = new Simulator(buildTrack('loop'));
simulate(fastFrames, 8, { throttle: 1 }, 1 / 120);
simulate(slowFrames, 8, { throttle: 1 }, 1 / 30);
assert.ok(fastFrames.state.pos.distanceTo(slowFrames.state.pos) < 0.001, 'Render framerate must not change vehicle trajectory');
assert.ok(Math.abs(fastFrames.state.score - slowFrames.state.score) <= 1);
console.log('PASS 30/120 fps integration equivalence');

const crash = new Simulator(buildTrack('proving'));
simulate(crash, 6, { throttle: 1, steer: 1 });
assert.ok(crash.state.damage.body > 0, 'Guardrail collisions damage bodywork');
assert.ok(Math.abs(crash.state.lane) < crash.track.width / 2);
crash.reset();
assert.equal(crash.state.health, 100);
assert.equal(crash.state.score, 0);
assert.equal(crash.state.flips, 0);
assert.equal(crash.state.finished, false);
console.log('PASS guardrail collision and clean reset');

const timeout = new Simulator(buildTrack('proving'));
simulate(timeout, 181, {});
assert.equal(timeout.state.finished, true);
assert.equal(timeout.state.failed, true);
const frozenTime = timeout.state.elapsed;
timeout.step(1 / 60, { throttle: 1 });
assert.equal(timeout.state.elapsed, frozenTime, 'Finished simulation is immutable until reset');
assert.equal(timeout.getResult().completed, false);
console.log('PASS time limit and terminal state');
console.log('All physics checks passed.');
