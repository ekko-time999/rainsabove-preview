import * as THREE from 'three';

/* 一组缓慢漂浮的尘点：位置用正弦扰动，不写死随机行走，避免累积漂移 */
function createDust(mats, count, size, opacity, spawn, color) {
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const speed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const [x, y, z] = spawn();
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    base[i * 3] = x;
    base[i * 3 + 1] = y;
    base[i * 3 + 2] = z;
    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = 0.02 + Math.random() * 0.05;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    map: mats.glowMap,
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  return { geo, mat, count, base, phase, speed, opacity };
}

export function buildAtmosphere(scene, mats, quality, bounds) {
  const group = new THREE.Group();
  scene.add(group);

  // 门厅 / 走廊原有飘尘
  const foyerDust = createDust(
    mats,
    quality.dustCount,
    0.032,
    0.5,
    () => [
      (Math.random() - 0.5) * 12.4,
      0.2 + Math.random() * 9.4,
      -Math.random() * 15.6
    ],
    0xffd2a0
  );
  const foyerPoints = new THREE.Points(foyerDust.geo, foyerDust.mat);
  foyerPoints.frustumCulled = false;
  group.add(foyerPoints);

  // 观众席与舞台的悬浮尘：光柱里能看见的微粒，让光像浮在空气里
  const full = quality.tier === 'full';
  const hallDust = createDust(
    mats,
    full ? 240 : 80,
    0.034,
    0.4,
    () => [
      (Math.random() - 0.5) * 16.4,
      0.4 + Math.random() * 9.8,
      -31.8 - Math.random() * 25.4
    ],
    0xffc79a
  );
  const hallPoints = new THREE.Points(hallDust.geo, hallDust.mat);
  hallPoints.frustumCulled = false;
  group.add(hallPoints);

  // 极淡的空气雾：少量大尺寸柔和光斑，只把黑位托起一点点，不改变画面明暗结构
  const hazeGeo = new THREE.BufferGeometry();
  hazeGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [0, 6.4, -44.6, -4.6, 4.3, -51.0, 4.6, 4.1, -50.8, 0, 2.7, -55.4],
      3
    )
  );
  const hazeMat = new THREE.PointsMaterial({
    map: mats.glowMap,
    color: 0xffb37a,
    size: 6.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.028,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const haze = new THREE.Points(hazeGeo, hazeMat);
  haze.frustumCulled = false;
  haze.renderOrder = 2;
  group.add(haze);

  const dustSets = [foyerDust, hallDust];
  let time = 0;
  let level = 1;

  function advanceDust(set) {
    const arr = set.geo.attributes.position.array;
    const { count, base, phase, speed } = set;
    for (let i = 0; i < count; i++) {
      const p = phase[i];
      arr[i * 3] = base[i * 3] + Math.sin(time * 0.32 + p) * 0.28;
      arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(time * 0.22 + p * 1.7) * 0.35;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(time * 0.26 + p) * 0.18 * speed[i] * 10;
    }
    set.geo.attributes.position.needsUpdate = true;
    set.mat.opacity = set.opacity * (0.3 + 0.7 * level);
  }

  function update(dt) {
    time += dt;
    for (const set of dustSets) advanceDust(set);
    hazeMat.opacity = 0.028 * (0.35 + 0.65 * level);
    const pos = hazeGeo.attributes.position;
    pos.setY(0, 6.4 + Math.sin(time * 0.11) * 0.3);
    pos.setY(1, 4.3 + Math.sin(time * 0.09 + 1.2) * 0.28);
    pos.setY(2, 4.1 + Math.cos(time * 0.1 + 0.4) * 0.28);
    pos.needsUpdate = true;
  }

  function setLevel(v) {
    level = v;
  }

  return { group, update, setLevel };
}
