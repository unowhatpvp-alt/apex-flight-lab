import * as THREE from './vendor/three.module.js';
const clamp = THREE.MathUtils.clamp;
const QUALITY = {
  low: { texture: 128, terrainX: 96, terrainZ: 64, rocks: 80, wheel: 20, body: 36, profile: 12, detail: 0 },
  medium: { texture: 256, terrainX: 150, terrainZ: 104, rocks: 160, wheel: 32, body: 56, profile: 24, detail: 1 },
  high: { texture: 512, terrainX: 240, terrainZ: 160, rocks: 280, wheel: 48, body: 88, profile: 24, detail: 2 },
  ultra: { texture: 512, terrainX: 360, terrainZ: 240, rocks: 420, wheel: 64, body: 128, profile: 32, detail: 3 },
};
function seeded(seed = 3271) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function hash(x, z) { const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return v - Math.floor(v); }
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), ux), THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), ux), uz);
}
function surfaceTextures(kind, size) {
  const random = seeded(kind === 'asphalt' ? 8831 : 4538);
  const textures = ['color', 'bump', 'roughness'].map(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'); return { canvas, ctx, image: ctx.createImageData(size, size) };
  });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, grain = random(), broad = noise(x / size * 12, y / size * 12);
    const ripple = Math.sin(y / size * 180 + Math.sin(x / size * 18) * 2.8);
    let r, g, b, bump, rough;
    if (kind === 'asphalt') {
      const chip = grain > .945 ? 34 : 0, base = 68 + grain * 29 + broad * 9 + chip;
      r = base; g = base + 1; b = base + 3; bump = 70 + grain * 110 + chip; rough = 185 + grain * 55;
    } else if (kind === 'rubber') {
      const groove = Math.abs(Math.sin(x / size * Math.PI * 24 + (y / size - .5) * 4)) < .14;
      r = g = b = groove ? 24 : 90 + grain * 20; bump = groove ? 40 : 165 + grain * 25; rough = 215 + grain * 35;
    } else {
      const speckle = grain * 12 + broad * 18 + ripple * 4;
      r = 154 + speckle; g = 119 + speckle; b = 79 + speckle; bump = 105 + grain * 45 + ripple * 23; rough = 213 + grain * 35;
    }
    const color = textures[0].image.data, height = textures[1].image.data, roughness = textures[2].image.data;
    color[i] = r; color[i + 1] = g; color[i + 2] = b; color[i + 3] = 255;
    height[i] = height[i + 1] = height[i + 2] = bump; height[i + 3] = 255;
    roughness[i] = roughness[i + 1] = roughness[i + 2] = rough; roughness[i + 3] = 255;
  }
  return textures.map(({ canvas, ctx, image }, i) => {
    ctx.putImageData(image, 0, 0); const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; if (i === 0) t.colorSpace = THREE.SRGBColorSpace; return t;
  });
}
function signTexture(title, subtitle, accent) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#111b22'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 12, 256); ctx.fillStyle = '#e9efeb';
  ctx.font = 'bold 84px Arial'; ctx.textAlign = 'center'; ctx.fillText(title, 512, 119);
  ctx.fillStyle = '#a3b1b9'; ctx.font = '27px Arial'; ctx.fillText(subtitle, 512, 186);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function disposeGroup(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
  });
  materials.forEach(m => { Object.values(m).forEach(v => { if (v?.isTexture) textures.add(v); }); m.dispose(); });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); group.removeFromParent();
}
function frameQuaternion(f) { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.tangent, f.normal, f.side)); }
function framed(f, lateral, height) { return f.p.clone().addScaledVector(f.side, lateral).addScaledVector(f.normal, height); }

// Watertight rectangular sweeps: every disconnected road span has two end caps.
function solidSweep(samples, offset, width, bottom, top) {
  const positions = [], normals = [], uvs = [], topIndices = [], otherIndices = [];
  const corners = [[-width / 2, top], [width / 2, top], [width / 2, bottom], [-width / 2, bottom]];
  function face(points, ns, texcoords, target, reverse = false) {
    const start = positions.length / 3;
    points.forEach((p, i) => { positions.push(p.x, p.y, p.z); normals.push(ns[i].x, ns[i].y, ns[i].z); uvs.push(...texcoords[i]); });
    if (reverse) target.push(start, start + 2, start + 1, start, start + 3, start + 2);
    else target.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const valid = i => i >= 0 && i < samples.length - 1 && !samples[i].gap && !samples[i + 1].gap;
  for (let i = 0; i < samples.length - 1; i++) {
    if (!valid(i)) continue;
    const a = samples[i], b = samples[i + 1];
    for (let j = 0; j < 4; j++) {
      const k = (j + 1) % 4;
      const normal = f => j === 0 ? f.normal.clone() : j === 1 ? f.side.clone() : j === 2 ? f.normal.clone().negate() : f.side.clone().negate();
      face([framed(a, offset + corners[j][0], corners[j][1]), framed(a, offset + corners[k][0], corners[k][1]), framed(b, offset + corners[k][0], corners[k][1]), framed(b, offset + corners[j][0], corners[j][1])],
        [normal(a), normal(a), normal(b), normal(b)], [[a.s / 5, 0], [a.s / 5, width / 5], [b.s / 5, width / 5], [b.s / 5, 0]], j === 0 ? topIndices : otherIndices);
    }
    if (!valid(i - 1)) { const ps = corners.map(([l, h]) => framed(a, offset + l, h)); face(ps, ps.map(() => a.tangent.clone().negate()), [[0, 0], [1, 0], [1, 1], [0, 1]], otherIndices, true); }
    if (!valid(i + 1)) { const ps = corners.map(([l, h]) => framed(b, offset + l, h)); face(ps, ps.map(() => b.tangent.clone()), [[0, 0], [1, 0], [1, 1], [0, 1]], otherIndices); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex([...topIndices, ...otherIndices]);
  g.addGroup(0, topIndices.length, 0); g.addGroup(topIndices.length, otherIndices.length, 1); return g;
}
function lineStrip(samples, offset, width, lift, dashed = false) {
  const positions = [], normals = [], indices = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i], b = samples[i + 1]; if (a.gap || b.gap || (dashed && Math.floor(a.s / 8) % 2)) continue;
    const start = positions.length / 3;
    for (const f of [a, b]) for (const side of [-1, 1]) { const p = framed(f, offset + side * width / 2, lift); positions.push(p.x, p.y, p.z); normals.push(f.normal.x, f.normal.y, f.normal.z); }
    indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setIndex(indices); return g;
}
function instanceBoxes(group, transforms, material, shadow = true) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, transforms.length), o = new THREE.Object3D();
  transforms.forEach((t, i) => { o.position.copy(t.position); o.quaternion.copy(t.quaternion || new THREE.Quaternion()); o.scale.copy(t.scale); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
  mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function clearGate(track, frame) {
  for (let i = 0; i < track.samples.length; i += 3) {
    const p = track.samples[i]; if (Math.abs(p.s - frame.s) < 18) continue;
    const d = p.p.clone().sub(frame.p);
    if (Math.abs(d.dot(frame.tangent)) < 5 && Math.abs(d.dot(frame.side)) < track.width + 2 && d.dot(frame.normal) > 1 && d.dot(frame.normal) < 11) return false;
  } return true;
}
function addArch(group, frame, title, subtitle, color, width, occluders) {
  const arch = new THREE.Group(); arch.quaternion.copy(frameQuaternion(frame)); arch.position.copy(frame.p);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b343c, metalness: .55, roughness: .48 }), glow = new THREE.MeshBasicMaterial({ color });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.55, 7.4, .6), metal); p.position.set(0, 3.7, side * (width / 2 + .65)); p.castShadow = true; arch.add(p); occluders.push(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(.06, 5.4, .1), glow); l.position.set(-.31, 3.5, side * (width / 2 + .65)); arch.add(l);
  }
  const girder = new THREE.Mesh(new THREE.BoxGeometry(.4, 2.1, width + 1.9), metal); girder.position.y = 7; girder.castShadow = true; arch.add(girder); occluders.push(girder);
  const label = new THREE.Mesh(new THREE.PlaneGeometry(width + .9, 1.95), new THREE.MeshBasicMaterial({ map: signTexture(title, subtitle, '#' + new THREE.Color(color).getHexString()) }));
  label.rotation.y = -Math.PI / 2; label.position.set(-.21, 7, 0); arch.add(label); group.add(arch);
}
function terrainGeometry(bounds, q, lunar, canyon) {
  const spanX = bounds.maxX - bounds.minX + 1400, spanZ = bounds.maxZ - bounds.minZ + 1600, centerX = (bounds.minX + bounds.maxX) / 2, centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const g = new THREE.PlaneGeometry(spanX, spanZ, q.terrainX, q.terrainZ); g.rotateX(-Math.PI / 2);
  const vertices = g.attributes.position, colors = [], low = new THREE.Color(lunar ? 0x565b66 : 0xb28d60), high = new THREE.Color(lunar ? 0x7e838b : 0x80644e), color = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) + centerX, z = vertices.getZ(i) + centerZ, distance = Math.max(bounds.minZ - z, z - bounds.maxZ, 0);
    const dune = 6 + noise(x * .012, z * .012) * 13 + Math.sin(x * .033 + z * .015 + noise(x * .004, z * .004) * 3) * 3;
    const ridge = Math.pow(1 - Math.abs(noise(x * .006, z * .008) * 2 - 1), 2), detail = noise(x * .034, z * .027) * 8 + noise(x * .073, z * .065) * 3;
    const mountain = ridge * (canyon ? 135 : 90) + noise(x * .002, z * .002) * 37;
    const hangarPad = (1 - smooth(65, 90, Math.abs(x - bounds.minX))) * (1 - smooth(15, 30, Math.abs(z - (bounds.minZ - 85))));
    const solarPad = (1 - smooth(36, 55, Math.abs(x - (bounds.minX + 25)))) * (1 - smooth(16, 28, Math.abs(z - (bounds.maxZ + 51))));
    const y = -.26 + smooth(26, 88, distance) * (dune + smooth(105, 260, distance) * (mountain + detail)) * (1 - Math.max(hangarPad, solarPad));
    vertices.setXYZ(i, x, y, z); color.copy(low).lerp(high, clamp(y / 160 + noise(x * .028, z * .028) * .25, 0, .9)); colors.push(color.r, color.g, color.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, vertices.getX(i) / 18, vertices.getZ(i) / 18); g.computeVertexNormals(); return g;
}

export function createWorld(scene, track, quality = 'high') {
  const q = QUALITY[quality] || QUALITY.high, group = new THREE.Group(); group.name = 'Closed course / test facility'; scene.add(group);
  const occluders = [], lunar = /lunar|moon/i.test(track.id), canyon = /canyon|extreme/i.test(track.id), random = seeded(6573 + String(track.id).length * 32);
  const width = track.width || 15, color = track.color || 0x9eff85, samples = track.samples;
  const [roadMap, roadBump, roadRoughness] = surfaceTextures('asphalt', q.texture);
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x92979c, roughness: .95, metalness: .025, map: roadMap, bumpMap: roadBump, bumpScale: q.detail ? .025 : .008, roughnessMap: roadRoughness });
  const structure = new THREE.MeshStandardMaterial({ color: 0x414b52, metalness: .35, roughness: .69 });
  const road = new THREE.Mesh(solidSweep(samples, 0, width, -.65, 0), [asphalt, structure]); road.name = 'Solid road slab'; road.castShadow = true; road.receiveShadow = true; group.add(road); occluders.push(road);
  const white = new THREE.MeshStandardMaterial({ color: 0xc2c8c8, roughness: .82 }), glow = new THREE.MeshBasicMaterial({ color }), yellow = new THREE.MeshStandardMaterial({ color: 0xc7923c, roughness: .58, metalness: .16 });
  for (const side of [-1, 1]) {
    group.add(new THREE.Mesh(lineStrip(samples, side * (width / 2 - .55), .12, .025), white)); group.add(new THREE.Mesh(lineStrip(samples, side * (width / 2 - .19), .09, .03), glow));
    const rail = new THREE.Mesh(solidSweep(samples, side * (width / 2 + .13), .23, .23, .48), [yellow, structure]); rail.name = 'Closed safety rail'; rail.castShadow = true; rail.receiveShadow = true; group.add(rail); occluders.push(rail);
  }
  group.add(new THREE.Mesh(lineStrip(samples, 0, .12, .026, true), white));
  const posts = [], supports = [], beams = [], reflectors = [];
  for (let s = 4; s < track.length; s += 8) {
    const f = track.sample(s); if (f.gap) continue; const rotation = frameQuaternion(f);
    for (const side of [-1, 1]) {
      posts.push({ position: framed(f, side * (width / 2 + .13), .03), quaternion: rotation, scale: new THREE.Vector3(.17, .7, .18) });
      reflectors.push({ position: framed(f, side * (width / 2 + .13), .49), quaternion: rotation, scale: new THREE.Vector3(.4, .025, .21) });
    }
    if (s % 32 < 8 && f.p.y > 3 && f.normal.y > .88) {
      for (const sign of [-1, 1]) {
        const top = framed(f, sign * (width / 2 + 1.3), -.85), height = Math.max(.1, top.y); let clear = true;
        for (let i = 0; i < samples.length; i += 4) {
          const other = samples[i]; if (Math.abs(other.s - s) < 16) continue; const delta = top.clone().sub(other.p);
          if (Math.abs(delta.dot(other.tangent)) < 2 && Math.abs(delta.dot(other.side)) < width / 2 + 1 && other.p.y < top.y && other.p.y > 0) { clear = false; break; }
        }
        if (clear) supports.push({ position: new THREE.Vector3(top.x, height / 2, top.z), scale: new THREE.Vector3(1.05, height, 1.05) });
      }
      beams.push({ position: framed(f, 0, -.93), quaternion: rotation, scale: new THREE.Vector3(1.25, .55, width + 3.1) });
    }
  }
  occluders.push(instanceBoxes(group, posts, structure)); const concrete = new THREE.MeshStandardMaterial({ color: lunar ? 0x676b71 : 0x777269, roughness: .93 });
  occluders.push(instanceBoxes(group, supports, concrete)); occluders.push(instanceBoxes(group, beams, concrete)); instanceBoxes(group, reflectors, new THREE.MeshBasicMaterial({ color }), false);
  const gates = [[12, 'FLIGHT LAB', 'ROADSTER / EXPERIMENTAL TEST PROGRAM'], [Math.max(20, track.length - 20), 'FINISH', 'CONTROL THE IMPOSSIBLE']];
  for (const f of [.26, .52, .78]) gates.push([track.length * f, String(Math.round(f * 100)) + ' / SECTOR', 'THRUST • ROTATE • LAND']);
  for (const [s, title, subtitle] of gates) { const f = track.sample(s); if (!f.gap && f.normal.y > .97 && clearGate(track, f)) addArch(group, f, title, subtitle, color, width, occluders); }
  const launchBars = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i]; if (a.gap === b.gap) continue; const f = a.gap ? b : a;
    for (let j = 0; j < 3; j++) { const f2 = track.sample(f.s + (a.gap ? 1 : -1) * (2 + j * 1.3)); launchBars.push({ position: framed(f2, 0, .03), quaternion: frameQuaternion(f2), scale: new THREE.Vector3(.3, .025, width - 1.2) }); }
  }
  instanceBoxes(group, launchBars, yellow, false);
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const f of samples) { bounds.minX = Math.min(bounds.minX, f.p.x); bounds.maxX = Math.max(bounds.maxX, f.p.x); bounds.minZ = Math.min(bounds.minZ, f.p.z); bounds.maxZ = Math.max(bounds.maxZ, f.p.z); }
  const [sandMap, sandBump, sandRoughness] = surfaceTextures('sand', q.texture);
  const terrain = new THREE.Mesh(terrainGeometry(bounds, q, lunar, canyon), new THREE.MeshStandardMaterial({ color: lunar ? 0xabb2bc : 0xc5b79c, vertexColors: true, map: sandMap, bumpMap: sandBump, bumpScale: q.detail ? .13 : .04, roughnessMap: sandRoughness, roughness: 1 }));
  if (lunar) { terrain.material.map = null; sandMap.dispose(); }
  terrain.name = 'Continuous sculpted terrain'; terrain.receiveShadow = true; group.add(terrain);
  // The camera gets a lighter terrain collider; the visible surface keeps its
  // selected resolution. Both are perfectly flat throughout the driving corridor.
  if (q.detail >= 2) {
    const collider = new THREE.Mesh(terrainGeometry(bounds, QUALITY.low, lunar, canyon), structure);
    collider.name = 'Terrain camera collider'; collider.visible = false; group.add(collider); occluders.push(collider);
  } else occluders.push(terrain);
  const rockGeometry = new THREE.IcosahedronGeometry(1, q.detail >= 2 ? 2 : 1), rockVertices = rockGeometry.attributes.position;
  for (let i = 0; i < rockVertices.count; i++) { const x = rockVertices.getX(i), y = rockVertices.getY(i), z = rockVertices.getZ(i), factor = .85 + noise(x * 3 + 7, z * 3 + y) * .3; rockVertices.setXYZ(i, x * factor, y * factor, z * factor); }
  rockGeometry.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rockGeometry, new THREE.MeshStandardMaterial({ color: lunar ? 0x484c57 : 0x716052, roughness: 1, bumpMap: sandBump, bumpScale: .18 }), q.rocks), o = new THREE.Object3D();
  for (let i = 0; i < q.rocks; i++) {
    const side = i % 2 ? 1 : -1, size = .3 + random() * 3.8;
    o.position.set(bounds.minX - 80 + random() * (bounds.maxX - bounds.minX + 160), size * .3 - .23, (side > 0 ? bounds.maxZ : bounds.minZ) + side * (18 + random() * 16));
    o.scale.set(size * (1 + random()), size * .6, size); o.rotation.set(random(), random() * 6, random()); o.updateMatrix(); rocks.setMatrixAt(i, o.matrix);
  }
  rocks.castShadow = q.detail > 0; rocks.receiveShadow = true; group.add(rocks); occluders.push(rocks);
  const facilityMat = new THREE.MeshStandardMaterial({ color: 0x676c6c, roughness: .72, metalness: .2 }), darkMat = new THREE.MeshStandardMaterial({ color: 0x14242e, roughness: .4, metalness: .35 });
  const buildings = [], doors = [], bars = [];
  for (let i = 0; i < 3; i++) {
    const x = bounds.minX - 30 + i * 29, z = bounds.minZ - 85;
    buildings.push({ position: new THREE.Vector3(x, 3.8, z), scale: new THREE.Vector3(24, 8, 18) }); doors.push({ position: new THREE.Vector3(x, 2.9, z + 9.07), scale: new THREE.Vector3(18, 5.8, .1) }); bars.push({ position: new THREE.Vector3(x, 6.6, z + 9.15), scale: new THREE.Vector3(20, .12, .1) });
  }
  occluders.push(instanceBoxes(group, buildings, facilityMat)); instanceBoxes(group, doors, darkMat); instanceBoxes(group, bars, glow, false);
  const solar = [];
  for (let i = 0; i < 24; i++) solar.push({ position: new THREE.Vector3(bounds.minX + i % 8 * 7, 2, bounds.maxZ + 45 + Math.floor(i / 8) * 6), scale: new THREE.Vector3(5, .12, 3.5), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -.25) });
  instanceBoxes(group, solar, new THREE.MeshStandardMaterial({ color: 0x153043, roughness: .29, metalness: .5 }));
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(.28, .5, 30, 12), structure); tower.position.set(bounds.minX - 40, 15, bounds.maxZ + 28); tower.castShadow = true; group.add(tower); occluders.push(tower);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(.38, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5838 })); beacon.position.copy(tower.position); beacon.position.y = 30.1; group.add(beacon);
  return { group, occluders, quality, update(time) { beacon.visible = Math.sin(time * 2) > -.35; }, dispose() { disposeGroup(group); } };
}

function interpolateSection(sections, x) {
  let i = 0; while (i < sections.length - 2 && sections[i + 1][0] < x) i++;
  const a = sections[i], b = sections[i + 1], t = smooth(a[0], b[0], x); return a.slice(1).map((v, j) => THREE.MathUtils.lerp(v, b[j + 1], t));
}
// Watertight loft, outward end caps, wheel clearances, and a complete underside.
function bodyGeometry(sections, longitudinal, radial, wheelWells = false) {
  const positions = [], indices = [], uvs = [], startX = sections[0][0], endX = sections[sections.length - 1][0];
  for (let i = 0; i <= longitudinal; i++) {
    const x = THREE.MathUtils.lerp(startX, endX, i / longitudinal), [low, high, width] = interpolateSection(sections, x);
    const chamfer = Math.min(.055, (high - low) * .22); let sideFloor = low + Math.min(.045, (high - low) * .2);
    if (wheelWells) for (const axle of [-1.48, 1.45]) { const distance = Math.abs(x - axle); if (distance < .435) sideFloor = Math.max(sideFloor, -.23 + Math.sqrt(.435 ** 2 - distance ** 2)); }
    sideFloor = Math.min(high - chamfer * 1.2, sideFloor);
    const shape = [new THREE.Vector3(0, low, -width * .72), new THREE.Vector3(0, sideFloor, -width * .98), new THREE.Vector3(0, high - chamfer, -width), new THREE.Vector3(0, high, -width * .73), new THREE.Vector3(0, high + .012, 0), new THREE.Vector3(0, high, width * .73), new THREE.Vector3(0, high - chamfer, width), new THREE.Vector3(0, sideFloor, width * .98), new THREE.Vector3(0, low, width * .72), new THREE.Vector3(0, low - .015, 0)];
    const curve = new THREE.CatmullRomCurve3(shape, true, 'centripetal');
    for (let j = 0; j < radial; j++) { const p = curve.getPoint(j / radial); positions.push(x, p.y, p.z); uvs.push(i / longitudinal, j / radial); }
  }
  for (let i = 0; i < longitudinal; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial; indices.push(a, b, c, b, d, c);
  }
  for (const end of [0, longitudinal]) {
    const base = end * radial, capStart = positions.length / 3, center = new THREE.Vector3();
    for (let j = 0; j < radial; j++) { const p = new THREE.Vector3(...positions.slice((base + j) * 3, (base + j) * 3 + 3)); center.add(p); positions.push(p.x, p.y, p.z); uvs.push(end / longitudinal, j / radial); } center.multiplyScalar(1 / radial);
    const index = positions.length / 3; positions.push(center.x, center.y, center.z); uvs.push(end / longitudinal, .5);
    for (let j = 0; j < radial; j++) { if (end === 0) indices.push(index, capStart + (j + 1) % radial, capStart + j); else indices.push(index, capStart + j, capStart + (j + 1) % radial); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
function archGeometry(radius, thickness, depth, segments) {
  const shape = new THREE.Shape(); shape.absarc(0, 0, radius + thickness, 0, Math.PI, false); shape.lineTo(-radius, 0); shape.absarc(0, 0, radius, Math.PI, 0, true); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: segments }); g.translate(0, 0, -depth / 2); return g;
}

export function createCar(quality = 'high') {
  const q = QUALITY[quality] || QUALITY.high, group = new THREE.Group(); group.name = 'R-01 / complete vehicle';
  const red = new THREE.MeshPhysicalMaterial({ color: 0xbb1221, metalness: .3, roughness: .29, clearcoat: .8, clearcoatRoughness: .23, envMapIntensity: .65 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x101419, metalness: .15, roughness: .59, envMapIntensity: .4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x07131a, metalness: .15, roughness: .16, clearcoat: .7, clearcoatRoughness: .18, envMapIntensity: .55 });
  const [rubberMap, rubberBump, rubberRough] = surfaceTextures('rubber', q.detail ? 256 : 128);
  const rubber = new THREE.MeshStandardMaterial({ color: 0x313237, map: rubberMap, bumpMap: rubberBump, bumpScale: q.detail ? .012 : .004, roughnessMap: rubberRough, roughness: .94 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0x58626c, metalness: .8, roughness: .36, envMapIntensity: .65 }), darkAlloy = new THREE.MeshStandardMaterial({ color: 0x1d252d, metalness: .65, roughness: .4 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x626469, metalness: .72, roughness: .68 }), lightMat = new THREE.MeshBasicMaterial({ color: 0xbde9ff }), tailMat = new THREE.MeshBasicMaterial({ color: 0xed1d33 });
  const panels = [], wheels = [], steering = [], jets = [];
  const mesh = (geometry, material, parent = group) => { const o = new THREE.Mesh(geometry, material); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const body = mesh(bodyGeometry([[-2.28, -.29, .18, .89], [-1.9, -.25, .32, 1.02], [-1.48, -.23, .32, 1.06], [-.8, -.25, .26, .98], [.55, -.25, .24, .94], [1.45, -.25, .29, 1.06], [1.9, -.29, .17, .99], [2.32, -.32, .015, .82]], q.body, q.profile, true), red);
  body.name = 'Closed sculpted bodywork'; panels.push(body);
  const belly = mesh(bodyGeometry([[-2.28, -.39, -.26, .78], [-1.8, -.37, -.25, .8], [1.55, -.36, -.24, .8], [2.3, -.4, -.3, .76]], Math.round(q.body / 2), q.profile), carbon); belly.name = 'Closed underbody';
  const canopy = mesh(bodyGeometry([[-1.23, .19, .24, .7], [-.92, .23, .47, .68], [-.56, .24, .665, .63], [.12, .24, .66, .62], [.48, .23, .51, .67], [1.02, .21, .245, .75]], Math.round(q.body * .65), Math.max(24, q.profile)), glass); canopy.name = 'Closed panoramic glass canopy';
  const roof = mesh(new THREE.BoxGeometry(.77, .018, .12), carbon); roof.position.set(-.2, .685, 0);
  for (const sign of [-1, 1]) {
    const sill = mesh(new THREE.BoxGeometry(2.1, .13, .13), carbon); sill.position.set(-.02, -.26, sign * .99);
    const mirror = mesh(new THREE.SphereGeometry(1, 12, 8), red); mirror.scale.set(.19, .07, .12); mirror.position.set(.51, .33, sign * 1.04); panels.push(mirror);
    const frontLamp = mesh(new THREE.BoxGeometry(.032, .043, .56), lightMat); frontLamp.position.set(2.29, -.005, sign * .47); frontLamp.rotation.y = sign * -.14;
    const intake = mesh(new THREE.BoxGeometry(.045, .13, .48), carbon); intake.position.set(2.28, -.18, sign * .45);
    const doorLine = mesh(new THREE.BoxGeometry(1.18, .012, .013), carbon); doorLine.position.set(-.05, .065, sign * .98);
    const handle = mesh(new THREE.BoxGeometry(.19, .026, .015), darkAlloy); handle.position.set(-.58, .19, sign * .985);
    if (q.detail > 0) { const vent = mesh(new THREE.BoxGeometry(.56, .016, .23), carbon); vent.position.set(-1.94, .285, sign * .62); vent.rotation.z = .12; }
  }
  const rearLight = mesh(new THREE.BoxGeometry(.035, .037, 1.63), tailMat); rearLight.position.set(-2.3, .105, 0);
  const diffuser = mesh(new THREE.BoxGeometry(.34, .12, 1.55), carbon); diffuser.position.set(-2.15, -.32, 0);
  const spoiler = mesh(new THREE.BoxGeometry(.31, .04, 1.94), carbon); spoiler.position.set(-2.04, .39, 0);
  for (const z of [-.65, .65]) { const p = mesh(new THREE.BoxGeometry(.08, .18, .06), darkAlloy); p.position.set(-2.04, .3, z); }
  if (q.detail > 0) {
    const fins = []; for (let i = 0; i < 5; i++) fins.push({ position: new THREE.Vector3(-2.16, -.4, -.64 + i * .32), scale: new THREE.Vector3(.45, .14, .025) }); instanceBoxes(group, fins, carbon);
    const battery = mesh(new THREE.BoxGeometry(1.65, .07, 1.33), darkAlloy); battery.position.set(0, -.41, 0);
    const braces = []; for (const x of [-.65, .65]) braces.push({ position: new THREE.Vector3(x, -.45, 0), scale: new THREE.Vector3(.055, .045, 1.45) }); instanceBoxes(group, braces, alloy);
  }
  const fenderGeometry = archGeometry(.405, .044, .09, Math.round(q.wheel / 2));
  for (const x of [-1.48, 1.45]) for (const sign of [-1, 1]) {
    const z = sign * 1.04, fender = mesh(fenderGeometry, red); fender.position.set(x, -.23, z);
    const steerGroup = new THREE.Group(); steerGroup.position.set(x, -.23, z); group.add(steerGroup); steering.push({ group: steerGroup, front: x > 0 });
    const wheel = new THREE.Group(); steerGroup.add(wheel); wheels.push(wheel);
    const tire = mesh(new THREE.TorusGeometry(.3, .07, q.detail >= 2 ? 16 : 10, q.wheel), rubber, wheel); tire.scale.z = 1.93;
    const rimProfile = [[.244, -.13], [.244, .13], [.212, .13], [.212, -.13], [.244, -.13]].map(([r, y]) => new THREE.Vector2(r, y));
    const rim = mesh(new THREE.LatheGeometry(rimProfile, q.wheel), darkAlloy, wheel); rim.rotation.x = Math.PI / 2;
    const outward = sign * .148, hub = mesh(new THREE.CylinderGeometry(.065, .065, .025, q.wheel / 2), alloy, wheel); hub.rotation.x = Math.PI / 2; hub.position.z = outward + sign * .008;
    const lip = mesh(new THREE.TorusGeometry(.242, .012, 8, q.wheel), alloy, wheel); lip.position.z = outward;
    const spokes = [];
    for (let j = 0; j < 5; j++) { const angle = j * Math.PI * 2 / 5; spokes.push({ position: new THREE.Vector3(Math.cos(angle) * .135, Math.sin(angle) * .135, outward), scale: new THREE.Vector3(.21, .032, .024), quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle + .15) }); } instanceBoxes(wheel, spokes, alloy);
    if (q.detail > 0) {
      const disc = mesh(new THREE.CylinderGeometry(.199, .199, .014, q.wheel), brakeMat, steerGroup); disc.rotation.x = Math.PI / 2; disc.position.z = outward - sign * .035;
      const caliper = mesh(new THREE.BoxGeometry(.08, .17, .055), red, steerGroup); caliper.position.set(.13, .035, outward - sign * .018);
      if (q.detail >= 2) { const bolts = []; for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5; bolts.push({ position: new THREE.Vector3(Math.cos(a) * .043, Math.sin(a) * .043, outward + sign * .028), scale: new THREE.Vector3(.014, .014, .012) }); } instanceBoxes(wheel, bolts, darkAlloy); }
    }
  }
  const jetBlue = new THREE.MeshBasicMaterial({ color: 0x42b5e7, transparent: true, opacity: .54, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const jetCore = new THREE.MeshBasicMaterial({ color: 0xb9f2ff, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const x of [-1.05, 1.05]) for (const z of [-.59, .59]) {
    const nozzle = mesh(new THREE.CylinderGeometry(.095, .165, .16, q.wheel / 2, 1, false), alloy); nozzle.position.set(x, -.42, z);
    const inner = mesh(new THREE.CylinderGeometry(.125, .125, .014, q.wheel / 2, 1, false), carbon); inner.position.set(x, -.507, z);
    const lip = mesh(new THREE.TorusGeometry(.146, .017, 8, q.wheel / 2), darkAlloy); lip.rotation.x = Math.PI / 2; lip.position.set(x, -.502, z);
    const jet = new THREE.Group(); jet.position.set(x, -.52, z); group.add(jet); jets.push(jet);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(.18, 1.45, 12, 1, false), jetBlue); plume.rotation.z = Math.PI; plume.position.y = -.72; jet.add(plume);
    const core = new THREE.Mesh(new THREE.ConeGeometry(.075, 1.0, 10, 1, false), jetCore); core.rotation.z = Math.PI; core.position.y = -.48; jet.add(core); jet.visible = false;
  }
  const smoke = new THREE.Group(); group.add(smoke);
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x3d4147, transparent: true, opacity: .25, depthWrite: false }), smokePuffs = [];
  for (let i = 0; i < (q.detail > 0 ? 9 : 5); i++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(.22, 1), smokeMaterial); smoke.add(p); smokePuffs.push(p); }
  const paintStart = new THREE.Color(0xbb1221), paintDamaged = new THREE.Color(0x472c2c); let previousTime = 0;
  return {
    group, quality,
    update({ speed = 0, jet = false, damage = 0, time = 0, steer = 0 } = {}) {
      const dt = clamp(time - previousTime, 0, .1); previousTime = time;
      wheels.forEach(w => { w.rotation.z -= speed * dt / .37; }); steering.forEach(w => { if (w.front) w.group.rotation.y = clamp(steer, -1, 1) * -.18; });
      jets.forEach((j, i) => { j.visible = !!jet; j.scale.y = .86 + Math.sin(time * 47 + i * 2) * .14; j.scale.x = j.scale.z = .93 + Math.cos(time * 31 + i) * .07; });
      let d = typeof damage === 'number' ? damage : (damage.total ?? damage.body ?? damage.chassis ?? 0); if (d > 1) d /= 100; d = clamp(d, 0, 1);
      red.color.copy(paintStart).lerp(paintDamaged, d * .72); body.scale.y = 1 - d * .1;
      panels.slice(1).forEach((p, i) => { p.rotation.x = d * (i % 2 ? -.2 : .16); }); spoiler.rotation.z = d * .11;
      smoke.visible = d > .35; smokeMaterial.opacity = Math.max(0, d - .3) * .36;
      smokePuffs.forEach((p, i) => { const phase = (time * .65 + i / smokePuffs.length) % 1; p.position.set(-1.25 - phase * .5, .4 + phase * 2.6, Math.sin(time + i * 2.3) * phase * .4); p.scale.setScalar(.25 + phase * 2.5); p.rotation.y = time + i; });
    },
    dispose() { disposeGroup(group); },
  };
}

