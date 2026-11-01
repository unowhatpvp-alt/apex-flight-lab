import * as THREE from './vendor/three.module.js';

// World-space, pooled condensation: one draw call, no particle object allocation
// in the frame loop. Sprites remain at their emission point as the car moves on.
function cloudTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.39996, radius = i === 0 ? 0 : 10 + (i % 4) * 7;
    const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius, size = 30 + i % 3 * 5;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(0, 'rgba(255,255,255,.35)'); gradient.addColorStop(.45, 'rgba(255,255,255,.21)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x - size, y - size, size * 2, size * 2);
  }
  return new THREE.CanvasTexture(canvas);
}

export function createEffects(scene, quality = 'high') {
  const config = { low: [64, 20], medium: [110, 35], high: [180, 55], ultra: [260, 75] }[quality] || [180, 55];
  const count = config[0], rate = config[1];
  const positions = new Float32Array(count * 3), sizes = new Float32Array(count), alphas = new Float32Array(count), angles = new Float32Array(count);
  const velocities = new Float32Array(count * 3), ages = new Float32Array(count), lives = new Float32Array(count), baseSizes = new Float32Array(count), strengths = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('particleAlpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('particleAngle', new THREE.BufferAttribute(angles, 1).setUsage(THREE.DynamicDrawUsage));
  const texture = cloudTexture();
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    uniforms: { cloudMap: { value: texture }, pixelScale: { value: Math.min(globalThis.devicePixelRatio || 1, 2) * 430 } },
    vertexShader: `attribute float particleSize; attribute float particleAlpha; attribute float particleAngle;
      varying float vAlpha; varying float vAngle;
      uniform float pixelScale;
      void main(){vAlpha=particleAlpha;vAngle=particleAngle;vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=clamp(particleSize*pixelScale/max(1.0,-mv.z),1.0,220.0);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform sampler2D cloudMap;varying float vAlpha;varying float vAngle;
      void main(){vec2 p=gl_PointCoord-.5;float c=cos(vAngle),s=sin(vAngle);p=mat2(c,-s,s,c)*p+.5;
        float a=texture2D(cloudMap,p).a*vAlpha;if(a<.006)discard;gl_FragColor=vec4(vec3(.92,.95,.98),a);}`,
  });
  const points = new THREE.Points(geometry, material); points.name = 'White jet condensation'; points.frustumCulled = false; points.renderOrder = 3; scene.add(points);
  const origin = new THREE.Vector3(), velocity = new THREE.Vector3(), normal = new THREE.Vector3(), side = new THREE.Vector3(), tangent = new THREE.Vector3(), direction = new THREE.Vector3(), offset = new THREE.Vector3();
  let cursor = 0, emission = 0, rollEmission = 0, lastGrounded = null, lastImpact = 0;
  function spawn(p, v, size, life, strength) {
    const i = cursor, j = i * 3; cursor = (cursor + 1) % count;
    positions[j] = p.x; positions[j + 1] = p.y; positions[j + 2] = p.z;
    velocities[j] = v.x; velocities[j + 1] = v.y; velocities[j + 2] = v.z;
    ages[i] = 0; lives[i] = life; baseSizes[i] = size; strengths[i] = strength; angles[i] = Math.random() * Math.PI * 2;
  }
  function puffAtSurface(p, frame, state, scale = 1) {
    const angle = Math.random() * Math.PI * 2, radial = .8 + Math.random() * 1.5;
    origin.copy(p).addScaledVector(frame.tangent, Math.cos(angle) * radial).addScaledVector(frame.side, Math.sin(angle) * radial).addScaledVector(frame.normal, .12);
    velocity.copy(frame.tangent).multiplyScalar(Math.cos(angle) * (1.6 + Math.random() * 2.5) * scale).addScaledVector(frame.side, Math.sin(angle) * (1.6 + Math.random() * 2.5) * scale).addScaledVector(frame.normal, .35 + Math.random() * .8);
    if (state.vel) velocity.addScaledVector(state.vel, .035);
    spawn(origin, velocity, .65 + Math.random() * .8, 1.3 + Math.random() * 1.3, .6);
  }
  return {
    group: points,
    reset() { lives.fill(0); alphas.fill(0); sizes.fill(0); emission = rollEmission = 0; lastGrounded = null; lastImpact = 0; geometry.attributes.particleAlpha.needsUpdate = true; },
    update(dt, state, { frame, solid = true, groundHeight } = {}) {
      dt = Math.min(Math.max(dt, 0), .05); if (!state?.pos) return;
      let surface = frame;
      if ((state.offroad || (frame && state.pos.clone().sub(frame.p).dot(frame.normal) < -1)) && Number.isFinite(groundHeight)) {
        surface = { p: new THREE.Vector3(state.pos.x, groundHeight, state.pos.z), tangent: new THREE.Vector3(1, 0, 0), normal: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(0, 0, 1), gap: false };
        solid = true;
      }
      const impact = state.landingImpact || 0;
      if (surface && solid && !surface.gap && ((lastGrounded === false && state.grounded) || impact > lastImpact + 1.5)) {
        const amount = Math.min(Math.floor(count * .28), 7 + Math.round(impact * 1.8));
        offset.copy(state.pos).sub(surface.p); const h = offset.dot(surface.normal); offset.copy(state.pos).addScaledVector(surface.normal, -h);
        for (let i = 0; i < amount; i++) puffAtSurface(offset, surface, state, Math.min(2.4, 1 + impact * .06));
      }
      lastGrounded = state.grounded; lastImpact = impact;
      if (state.jetActive && state.quaternion) {
        direction.set(0, -1, 0).applyQuaternion(state.quaternion);
        let hit = false;
        if (surface && solid && !surface.gap) {
          normal.copy(surface.normal); const denominator = direction.dot(normal), height = offset.copy(state.pos).sub(surface.p).dot(normal);
          const distance = denominator < -.15 ? -height / denominator : -1;
          if (distance >= 0 && distance < 7) { offset.copy(state.pos).addScaledVector(direction, distance); hit = true; }
        }
        emission += dt * rate * (hit ? 1 : .35);
        while (emission >= 1) {
          emission--;
          if (hit) puffAtSurface(offset, surface, state);
          else {
            origin.set((Math.random() - .5) * 2.1, -.65, (Math.random() - .5) * 1.1).applyQuaternion(state.quaternion).add(state.pos);
            velocity.copy(direction).multiplyScalar(3 + Math.random() * 2); if (state.vel) velocity.addScaledVector(state.vel, .15);
            spawn(origin, velocity, .3 + Math.random() * .3, .6 + Math.random() * .5, .25);
          }
        }
      } else emission = 0;
      if (Math.abs(state.rollInput || 0) > .05 && state.quaternion) {
        rollEmission += dt * rate * .3;
        while (rollEmission >= 1) {
          rollEmission--; const sideSign = Math.random() > .5 ? 1 : -1, sign = Math.sign(state.rollInput) * sideSign;
          origin.set(Math.random() > .5 ? .72 : -.72, sign * .28, sideSign * 1.075).applyQuaternion(state.quaternion).add(state.pos);
          direction.set(0, sign, 0).applyQuaternion(state.quaternion); velocity.copy(direction).multiplyScalar(3);
          if (state.vel) velocity.addScaledVector(state.vel, .12); spawn(origin, velocity, .25, .65, .35);
        }
      } else rollEmission = 0;
      for (let i = 0; i < count; i++) {
        if (lives[i] <= 0) continue;
        ages[i] += dt; const t = ages[i] / lives[i];
        if (t >= 1) { lives[i] = 0; alphas[i] = 0; sizes[i] = 0; continue; }
        const j = i * 3, drag = Math.exp(-dt * .7);
        positions[j] += velocities[j] * dt; positions[j + 1] += velocities[j + 1] * dt; positions[j + 2] += velocities[j + 2] * dt;
        velocities[j] *= drag; velocities[j + 1] = velocities[j + 1] * drag + dt * .18; velocities[j + 2] *= drag;
        sizes[i] = baseSizes[i] * (1 + t * 3.7); alphas[i] = strengths[i] * Math.min(1, t * 9) * (1 - t) ** 1.3; angles[i] += dt * .12;
      }
      geometry.attributes.position.needsUpdate = true; geometry.attributes.particleSize.needsUpdate = true; geometry.attributes.particleAlpha.needsUpdate = true; geometry.attributes.particleAngle.needsUpdate = true;
    },
    dispose() { points.removeFromParent(); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
