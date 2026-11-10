import * as THREE from 'three';
import { BoxBatch, addGlowSprite, mergeStatic } from './utils.js';
import { createSconce, instanceSconceShades } from './foyer.js';
import { PALETTE } from './materials.js';
import { HOUSE } from './plan.js';

const START = -16.5;
const END = -30.6;
const LEN = START - END;
const MID = (START + END) / 2;
// 后段 3.4m 让给马蹄形尾端的环廊，墙体与顶棚提前收住，地面仍铺到尽头
const WALL_END = -27.2;
const W_LEN = START - WALL_END;
const W_MID = (START + WALL_END) / 2;
const HALF = 2.2;
/* 二楼走廊净高：4.03→7.58 = 3.54m。
   这一层原来的平顶 6.90 只给 2.86m，拱肋梁底 6.695 更只有 2.66m，
   是「紧促感」的主因。抬顶不是随便抬——拱肋的高宽比（该点净高 / 该点净宽）
   上一轮实测 0.76 偏扁，本轮按 >=0.90 反算：
     内缘半跨 a=2.115，矢高 b 时该处净宽 = 2a·sqrt(1-(1.5/b)²)
     令 b / 净宽 = 0.90  =>  b = 3.42~3.45
   于是拱肋梁底定 7.48（净高 3.44、该处净宽 3.81、比值 0.904），
   平顶再高 0.10 压住肋顶，读作「肋嵌进筒拱」。 */
const CEIL = HOUSE.UPPER_CEIL;
const RIB_SOFFIT = 7.48;   // 拱肋梁底（椭圆拱顶下皮）
const RIB_Y_SCALE = (RIB_SOFFIT - 4.03) / (HALF - 0.085);  // ≈1.631
const LOWER_CEIL = 3.88;  // 一楼走廊天花：贴住上层楼板下皮（板厚 0.14，板底 3.89）
const WALL_TOP = 4.03;    // 二楼楼面标高，拱肋从这里起拱

// 门厅尽头延伸出的正式通道：拱肋、壁龛、壁灯、地毯，尽头透出观众席的光
/* 走廊：draw call 预算 18（静置机位实测 15）。 */
export function buildCorridor(scene, mats) {
  const group = new THREE.Group();
  scene.add(group);

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const wood = new BoxBatch(mats.wood);
  const glassMat = mats.warmGlass.clone();
  const glows = [];

  /* ---------- 地面 ---------- */
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, LEN), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, MID);
  floor.receiveShadow = true;
  group.add(floor);

  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.15, LEN), mats.carpet);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, 0.034, MID);
  carpet.receiveShadow = true;
  group.add(carpet);
  gold.add(0.05, 0.018, LEN, -1.11, 0.046, MID);
  gold.add(0.05, 0.018, LEN, 1.11, 0.046, MID);

  /* ---------- 墙体与顶棚 ---------- */
  // 左侧二楼墙在 z=-25.6 开一道门，接放映厅；门洞以上再收头
  const SCR_DOOR_Z = -25.6;
  const SCR_DOOR_HALF = 0.7;
  for (const sign of [-1, 1]) {
    if (sign === -1) {
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.3, WALL_TOP, W_LEN), mats.plaster);
      lower.position.set(sign * (HALF + 0.15), WALL_TOP / 2, W_MID);
      lower.receiveShadow = true;
      group.add(lower);

      const zA0 = START;
      const zA1 = SCR_DOOR_Z + SCR_DOOR_HALF;
      const zB0 = SCR_DOOR_Z - SCR_DOOR_HALF;
      const zB1 = WALL_END;
      const hUp = CEIL - WALL_TOP;
      for (const [za, zb] of [[zA0, zA1], [zB0, zB1]]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.3, hUp, za - zb), mats.plaster);
        seg.position.set(sign * (HALF + 0.15), WALL_TOP + hUp / 2, (za + zb) / 2);
        seg.receiveShadow = true;
        group.add(seg);
      }
      // 门洞两侧的墙照旧到顶；洞顶不再加梁——洞口直接顶到机房底板下皮
      // SCR_HEAD=6.995（与 spaces.js 同一标高），底板本身把洞口封住。

      wood.add(0.16, 2.95, 0.14, sign * HALF, 5.505, SCR_DOOR_Z - SCR_DOOR_HALF - 0.05);
      wood.add(0.16, 2.95, 0.14, sign * HALF, 5.505, SCR_DOOR_Z + SCR_DOOR_HALF + 0.05);
      wood.add(0.16, 0.18, 1.56, sign * HALF, 6.90, SCR_DOOR_Z);
      goldDeep.add(0.06, 2.85, 0.06, sign * (HALF - 0.06), 5.46, SCR_DOOR_Z - SCR_DOOR_HALF);
      goldDeep.add(0.06, 2.85, 0.06, sign * (HALF - 0.06), 5.46, SCR_DOOR_Z + SCR_DOOR_HALF);
    } else {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, CEIL, W_LEN), mats.plaster);
      wall.position.set(sign * (HALF + 0.15), CEIL / 2, W_MID);
      wall.receiveShadow = true;
      group.add(wall);
    }

    // 护墙板
    wood.add(0.1, 1.5, W_LEN, sign * HALF, 0.78, W_MID);
    gold.add(0.12, 0.06, W_LEN, sign * HALF, 1.55, W_MID);
    goldDeep.add(0.13, 0.09, W_LEN, sign * HALF, 0.1, W_MID);
  }

  /* ---------- 一楼天花：由檐口线脚收边，连续到墙顶 ---------- */
  const lowerCeilGeo = new THREE.PlaneGeometry(HALF * 2, W_LEN);
  lowerCeilGeo.rotateX(Math.PI / 2);
  lowerCeilGeo.translate(0, LOWER_CEIL, W_MID);
  const lowerCeil = new THREE.Mesh(lowerCeilGeo, mats.plasterDark);
  group.add(lowerCeil);
  // 檐口：沿两侧墙脚一圈，压住天花与墙面的接缝
  for (const sign of [-1, 1]) {
    goldDeep.add(0.26, 0.14, W_LEN, sign * (HALF - 0.05), LOWER_CEIL - 0.07, W_MID);
    gold.add(0.30, 0.045, W_LEN, sign * (HALF - 0.04), LOWER_CEIL - 0.15, W_MID);
  }
  // 横向次梁：与上层拱肋同一节奏，让平顶不至于空成一块板。
  // 第一道梁原在 z=-17.2，正落在门厅拱洞的墙体厚度里、悬在洞口正中，已删除。
  for (const z of [-19.6, -22.0, -24.4, -26.8]) {
    gold.add(HALF * 2, 0.14, 0.2, 0, LOWER_CEIL - 0.07, z);
    goldDeep.add(HALF * 2, 0.05, 0.26, 0, LOWER_CEIL - 0.15, z);
  }
  // 走廊尽端：封檐板，把天花与上层楼板一起收住
  goldDeep.add(HALF * 2 + 0.1, 0.34, 0.18, 0, LOWER_CEIL + 0.05, WALL_END - 0.02);
  gold.add(HALF * 2 + 0.14, 0.06, 0.24, 0, LOWER_CEIL + 0.23, WALL_END - 0.02);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, W_LEN), mats.plasterDark);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL, W_MID);
  group.add(ceiling);

  // 半圆拱肋：把通道读成筒形拱。竖向拉高到 RIB_Y_SCALE（原 1.26），
  // 拱顶下皮落到 7.48m。肋顶会嵌进平顶 0.10m 以上（不可见），
  // 从下面看是肋从筒拱里长出来，而不是一根挂在半空的梁。
  const ribGeo = new THREE.TorusGeometry(HALF, 0.085, 6, 30, Math.PI);
  const ribZ = [-17.2, -19.6, -22.0, -24.4, -26.8];
  for (const z of ribZ) {
    const rib = new THREE.Mesh(ribGeo, mats.goldDeep);
    rib.position.set(0, WALL_TOP, z);
    rib.scale.set(1, RIB_Y_SCALE, 1);
    group.add(rib);
    gold.add(0.12, 0.1, 0.16, 0, RIB_SOFFIT + 0.05, z);
  }

  /* ---------- 两侧拱形壁龛 ---------- */
  const nicheZ = [-18.4, -20.8, -23.2, -25.6];
  for (const sign of [-1, 1]) {
    for (const z of nicheZ) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.055, 5, 24, Math.PI), mats.gold);
      arch.rotation.y = sign === 1 ? -Math.PI / 2 : Math.PI / 2;
      arch.position.set(sign * (HALF - 0.02), 2.55, z);
      group.add(arch);
      wood.add(0.2, 1.95, 0.12, sign * HALF, 2.55, z - 0.86);
      wood.add(0.2, 1.95, 0.12, sign * HALF, 2.55, z + 0.86);

      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 2.3), mats.velvetWall);
      panel.rotation.y = sign === 1 ? -Math.PI / 2 : Math.PI / 2;
      panel.position.set(sign * (HALF - 0.03), 1.55, z);
      group.add(panel);
      gold.add(0.1, 0.07, 1.6, sign * (HALF - 0.07), 0.62, z);
    }

    // 每两个壁龛一盏壁灯
    for (const z of [-18.4, -23.2]) {
      const sconce = createSconce(mats, glassMat);
      sconce.group.position.set(sign * (HALF - 0.16), 3.26, z);
      sconce.group.rotation.y = sign === 1 ? Math.PI : 0;
      group.add(sconce.group);
      glows.push(sconce.glow);
    }
  }

  /* ---------- 尽头：观众席的光 ---------- */
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.0, 6.2),
    new THREE.MeshBasicMaterial({
      map: mats.glowMap,
      color: 0xffbe83,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true
    })
  );
  glow.position.set(0, 3.0, WALL_END - 0.1);
  group.add(glow);

  gold.build(group);
  goldDeep.build(group);
  wood.build(group);

  const lamp = new THREE.PointLight(0xffa463, 13, 16, 2);
  lamp.position.set(0, 3.2, -23.6);
  group.add(lamp);
  const lampEnd = new THREE.PointLight(PALETTE.warm, 10, 12, 2);
  lampEnd.position.set(0, 3.0, -28.9);
  group.add(lampEnd);

  let level = 1;
  function setLevel(v) {
    level = v;
    lamp.intensity = 13 * v;
    lampEnd.intensity = 10 * v;
    glow.material.opacity = 0.55 * (0.2 + 0.8 * v);
    glows.forEach((g) => {
      g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * v);
    });
    glassMat.emissiveIntensity = 2.2 * (0.35 + 0.65 * v);
  }

  instanceSconceShades(group, glassMat);
  mergeStatic(group);

  return { group, floor, glow, setLevel, get level() { return level; } };
}
