import * as THREE from 'three';
import { addGlowSprite, mergeStatic } from './utils.js';

function createArm(mats, candleMat, reach, rise, scale = 1) {
  const g = new THREE.Group();

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(0.38 * scale, -0.32 * scale, 0),
    new THREE.Vector3(0.78 * scale, -0.3 * scale, 0),
    new THREE.Vector3(reach, rise, 0),
    new THREE.Vector3(reach + 0.06, rise + 0.1, 0)
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.032 * scale, 6, false), mats.gold);
  tube.castShadow = true;
  g.add(tube);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * scale, 0.05 * scale, 0.1 * scale, 10), mats.gold);
  cup.position.set(reach + 0.06, rise + 0.14 * scale, 0);
  g.add(cup);

  const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * scale, 0.045 * scale, 0.26 * scale, 8), candleMat);
  candle.position.set(reach + 0.06, rise + 0.31 * scale, 0);
  g.add(candle);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.03 * scale, 0.11 * scale, 6),
    new THREE.MeshBasicMaterial({ color: 0xffdcab, toneMapped: true })
  );
  flame.position.set(reach + 0.06, rise + 0.51 * scale, 0);
  flame.userData.isFlame = true;
  g.add(flame);

  const glow = addGlowSprite(mats, g, reach + 0.06, rise + 0.5 * scale, 0, 0.42 * scale, 0.45);
  glow.userData.isFlameGlow = true;

  return g;
}

/* 吊灯：draw call 预算 38（实测 34：静止构件并成 4 份，
   火苗 14 支逐帧各自缩放，保持独立；水晶本就是实例化）。 */
export function buildChandelier(scene, mats, quality, options = {}) {
  const {
    position = [0, 4.55, -8.3],
    scale = 1,
    baseIntensity = 55,
    chainLinks = 22
  } = options;

  const group = new THREE.Group();
  group.position.set(position[0], position[1], position[2]);
  group.scale.setScalar(scale);
  scene.add(group);

  const candleMat = new THREE.MeshStandardMaterial({
    color: 0xf2ddbe,
    roughness: 0.6,
    emissive: new THREE.Color(0x3a2312),
    emissiveIntensity: 0.4
  });

  // 吊链
  const chainGeo = new THREE.TorusGeometry(0.055, 0.013, 5, 14);
  for (let i = 0; i < chainLinks; i++) {
    const link = new THREE.Mesh(chainGeo, mats.gold);
    link.position.y = 0.7 + i * 0.255;
    link.rotation.set(i % 2 === 0 ? Math.PI / 2 : 0, i * 0.45, Math.PI / 2);
    group.add(link);
  }

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 1.1, 12), mats.gold);
  stem.position.y = 0.4;
  group.add(stem);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), mats.gold);
  body.scale.set(1, 1.25, 1);
  body.position.y = -0.1;
  group.add(body);

  const upperRing = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.038, 6, 52), mats.gold);
  upperRing.rotation.x = Math.PI / 2;
  upperRing.position.y = 0.06;
  upperRing.castShadow = true;
  group.add(upperRing);

  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.03, 6, 40), mats.gold);
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.y = -0.5;
  group.add(lowerRing);

  const upperArms = 8;
  const lowerArms = 6;
  const angleStep = (Math.PI * 2) / upperArms;

  const armTemplate = createArm(mats, candleMat, 1.05, 0.42, 1);
  for (let i = 0; i < upperArms; i++) {
    const arm = armTemplate.clone(true);
    arm.rotation.y = i * angleStep;
    group.add(arm);
  }

  const lowerTemplate = createArm(mats, candleMat, 0.66, 0.05, 0.72);
  for (let i = 0; i < lowerArms; i++) {
    const arm = lowerTemplate.clone(true);
    arm.rotation.y = i * (Math.PI * 2 / lowerArms) + angleStep / 2;
    arm.position.y = -0.52;
    group.add(arm);
  }

  // 水晶垂饰
  const crystalGeo = new THREE.OctahedronGeometry(0.028, 0);
  const crystalCount = quality.crystalCount;
  const crystals = new THREE.InstancedMesh(crystalGeo, mats.crystal, crystalCount);
  crystals.frustumCulled = false;
  const dummy = new THREE.Object3D();

  let idx = 0;
  for (let arm = 0; arm < upperArms && idx < crystalCount; arm++) {
    const a = arm * angleStep;
    for (let j = 0; j < 9 && idx < crystalCount; j++) {
      const r = 1.02 - j * 0.018;
      dummy.position.set(Math.cos(a) * r, -0.06 - j * 0.13, Math.sin(a) * r);
      const s = 0.6 + Math.random() * 0.7;
      dummy.scale.set(s, s * (1.4 + Math.random() * 0.6), s);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      crystals.setMatrixAt(idx++, dummy.matrix);
    }
  }
  for (let arm = 0; arm < 8 && idx < crystalCount; arm++) {
    const a = arm * angleStep + angleStep / 2;
    for (let j = 0; j < 3 && idx < crystalCount; j++) {
      const r = 0.55 - j * 0.04;
      dummy.position.set(Math.cos(a) * r, -0.62 - j * 0.12, Math.sin(a) * r);
      const s = 0.55 + Math.random() * 0.5;
      dummy.scale.set(s, s * 1.5, s);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      crystals.setMatrixAt(idx++, dummy.matrix);
    }
  }
  crystals.instanceMatrix.needsUpdate = true;
  group.add(crystals);

  // 中央吊坠
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mats.crystal);
  drop.position.y = -1.28;
  group.add(drop);

  // 灯具只留本体与极轻微光晕，不靠透明片做出可见体积
  const halo = addGlowSprite(mats, group, 0, 0.15, 0, 1.35, 0.1);

  const light = new THREE.PointLight(0xffc28a, baseIntensity, 34, 2);
  light.position.set(0, 0.15, 0);
  group.add(light);

  // 吊链、曲臂、烛台、水晶底座都是静止件，合成几份；火苗逐帧缩放，单独留着
  mergeStatic(group);

  const flames = [];
  const flameGlows = [];
  group.traverse((o) => {
    if (o.userData.isFlame) flames.push(o);
    if (o.userData.isFlameGlow) flameGlows.push(o);
  });

  let level = 1;
  const base = baseIntensity;

  function update(time) {
    group.rotation.z = Math.sin(time * 0.33) * 0.006;
    group.rotation.x = Math.cos(time * 0.27) * 0.004;
    const flicker = 1 + Math.sin(time * 7.3) * 0.05 + Math.sin(time * 13.1) * 0.025 + Math.sin(time * 2.1) * 0.02;
    light.intensity = base * level * flicker;
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      const local = 1 + Math.sin(time * 8 + i * 1.7) * 0.12;
      f.scale.set(local, local, local);
      f.material.opacity = 1;
    }
    for (let i = 0; i < flameGlows.length; i++) {
      const g = flameGlows[i];
      const s = (0.42 * (i < upperArms ? 1 : 0.72)) * (0.92 + Math.sin(time * 7 + i * 1.3) * 0.08);
      g.scale.set(s, s, 1);
      g.material.opacity = 0.45 * Math.min(1, level);
    }
    halo.material.opacity = 0.1 * level;
  }

  function setLevel(v) {
    level = v;
  }

  return { group, light, update, setLevel, baseIntensity: base };
}
