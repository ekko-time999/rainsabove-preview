import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BoxBatch, addGlowSprite, makeContactMaterial, mergeStatic } from './utils.js';
import { seatGeometry } from './auditorium.js';
import { HOUSE } from './plan.js';

/* ---------- 二楼标高与平面控制线 ----------
   楼座踏面与既有包厢挑台（y=4.03）同高，走廊、楼座与包厢由此连成一条连续的上层动线。 */
const LEVEL = 4.03;
const CEIL = HOUSE.UPPER_CEIL;   // 与 corridor.js 共用同一道平顶，避免两处各写一个数
const DECK_TOP = LEVEL - 0.012;   // 比既有包厢挑台低一线，避免共面闪烁
const SLAB = 0.14;   // 楼板厚度：板底 3.89，与一楼走廊平顶（3.88）贴合，洞口净高不再被吃掉

const STAIR_BOTTOM = -7.0;
const STAIR_TOP = -15.35;
const STEPS = 24;
const FLIGHT = 12;
const TREAD = 0.3;
const RISE = LEVEL / STEPS;          // 0.1679m，踏高落在 0.16–0.18 区间
const FLIGHT_RUN = FLIGHT * TREAD;   // 3.6m
const LAND_Y = FLIGHT * RISE;        // 2.015m，中间休息平台
const LAND_DEPTH = 1.15;
const LAND_Z0 = STAIR_BOTTOM - FLIGHT_RUN;              // -10.60
const LAND_Z1 = LAND_Z0 - LAND_DEPTH;                   // -11.75
const F2_Z0 = LAND_Z1;                                  // 第二段起步
const STAIR_X = 5.925;
const FLIGHT_LEN = Math.hypot(FLIGHT_RUN, LAND_Y);
const STAIR_SLOPE = Math.atan2(LAND_Y, FLIGHT_RUN);

const GALLERY_FRONT = -15.35;
const GALLERY_BACK = -16.36;
const CORR_BACK = -30.6;

// 与 horseshoe.js 同一套护栏标准：扶手中心 +1.12m、扶手顶 +1.15m
const GUARD = 1.12;

const DECK_BACK = -31.15;   // 观众席后墙的观众侧墙面
const DECK_FRONT = -36.2;   // 楼座挑台前缘
const BAL_HALF = 8.9;
const PROM_INNER = 6.9;
const PROM_END = -47.2;

const BOX_Z = [-34.4, -39.0, -43.6];
const ROWS = [
  { z: -33.8, y: LEVEL },
  { z: -32.75, y: LEVEL + 0.28 },
  { z: -31.72, y: LEVEL + 0.55 }
];

/* 轻量壁灯：只在批量金件上挂一枚光晕，避免像门厅壁灯那样增加十余个网格 */
function addSmallSconce(gold, glows, mats, parent, x, y, z, rotY, scale = 0.46) {
  gold.add(0.06, 0.34, 0.16, x, y, z, rotY);
  gold.add(0.16, 0.05, 0.12, x, y + 0.16, z, rotY);
  const dir = rotY === Math.PI ? -1 : 1;
  const glow = addGlowSprite(mats, parent, x + dir * 0.13, y + 0.14, z, scale, 0.5);
  glows.push(glow);
  return glow;
}

/* 二楼环廊：draw call 预算 10（静置机位实测 7）。
   这里多是独一份的材料，合并不动它。 */
export function buildUpper(scene, mats, quality) {
  const group = new THREE.Group();
  scene.add(group);

  const full = quality.tier === 'full';

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);
  const wood = new BoxBatch(mats.wood, { castShadow: full });
  const marble = new BoxBatch(mats.marble);
  const velvet = new BoxBatch(mats.velvetWall);
  const soffit = new BoxBatch(mats.plasterDark);
  const glows = [];
  const lights = [];

  /* ---------- 门厅大楼梯：两侧对称，中途休息平台后升到二楼 ---------- */
  for (const sign of [-1, 1]) {
    const cx = sign * STAIR_X;

    // 第一段：12 级，踏高 0.1679、踏宽 0.30
    for (let i = 1; i <= FLIGHT; i++) {
      const h = i * RISE;
      const z = STAIR_BOTTOM - (i - 0.5) * TREAD;
      wood.add(1.65, h, TREAD + 0.018, cx, h / 2, z);
      gold.add(1.69, 0.026, 0.042, cx, h + 0.008, STAIR_BOTTOM - (i - 1) * TREAD - 0.015);
      goldDeep.add(1.67, 0.018, 0.026, cx, h - 0.03, STAIR_BOTTOM - (i - 1) * TREAD - 0.02);
    }

    // 中间休息平台：1.15m 进深，标高 2.015m
    wood.add(1.65, LAND_Y, LAND_DEPTH, cx, LAND_Y / 2, (LAND_Z0 + LAND_Z1) / 2);
    gold.add(1.69, 0.026, LAND_DEPTH, cx, LAND_Y + 0.008, (LAND_Z0 + LAND_Z1) / 2);
    goldDeep.add(1.67, 0.018, LAND_DEPTH, cx, LAND_Y - 0.03, LAND_Z0 - 0.02);

    // 第二段：12 级，从平台升到二楼 4.03m
    for (let i = 1; i <= FLIGHT; i++) {
      const h = LAND_Y + i * RISE;
      const z = F2_Z0 - (i - 0.5) * TREAD;
      wood.add(1.65, h, TREAD + 0.018, cx, h / 2, z);
      gold.add(1.69, 0.026, 0.042, cx, h + 0.008, F2_Z0 - (i - 1) * TREAD - 0.015);
      goldDeep.add(1.67, 0.018, 0.026, cx, h - 0.03, F2_Z0 - (i - 1) * TREAD - 0.02);
    }

    // 斜梁与扶手：两段同坡，平台上另做一段水平扶手（统一抬到 GUARD）
    for (const [zc, yc] of [[(STAIR_BOTTOM + LAND_Z0) / 2, LAND_Y / 2], [(F2_Z0 + STAIR_TOP) / 2, (LAND_Y + LEVEL) / 2]]) {
      wood.add(0.13, 0.34, FLIGHT_LEN, sign * 5.07, yc + 0.1, zc, 0, STAIR_SLOPE);
      gold.add(0.07, 0.07, FLIGHT_LEN, sign * 5.07, yc + GUARD, zc, 0, STAIR_SLOPE);
      goldDeep.add(0.09, 0.03, FLIGHT_LEN, sign * 5.07, yc + GUARD - 0.07, zc, 0, STAIR_SLOPE);
    }
    gold.add(0.07, 0.07, LAND_DEPTH, sign * 5.07, LAND_Y + GUARD, (LAND_Z0 + LAND_Z1) / 2);

    for (const [z0, n, y0] of [[STAIR_BOTTOM, FLIGHT, 0], [F2_Z0, FLIGHT, LAND_Y]]) {
      for (let i = 2; i <= n; i += 2) {
        const y = y0 + i * RISE;
        const z = z0 - (i - 0.5) * TREAD;
        gold.add(0.032, GUARD, 0.032, sign * 5.07, y + GUARD / 2, z);
      }
    }
    // 平台上的两根栏杆立柱
    for (const z of [LAND_Z0 - 0.08, LAND_Z1 + 0.08]) {
      gold.add(0.032, GUARD, 0.032, sign * 5.07, LAND_Y + GUARD / 2, z);
    }

    // 起步柱头
    goldDeep.add(0.14, GUARD, 0.14, sign * 5.07, GUARD / 2, STAIR_BOTTOM + 0.08);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), mats.gold);
    cap.position.set(sign * 5.07, GUARD + 0.03, STAIR_BOTTOM + 0.08);
    group.add(cap);

    // 楼梯上方的壁灯，照亮墙面与扶手
    addSmallSconce(gold, glows, mats, group, sign * 6.82, 5.72, -11.6, sign === 1 ? Math.PI : 0, 0.44);

    // 二楼入口引导：梯口一盏落地暖光，踏面上再排一串小灯
    const foot = new THREE.PointLight(0xffae66, 16, 10, 2);
    foot.position.set(sign * 5.9, 2.2, STAIR_BOTTOM + 0.9);
    group.add(foot);
    lights.push({ light: foot, base: 16 });
    glows.push(addGlowSprite(mats, group, sign * 5.92, 1.12, STAIR_BOTTOM + 0.55, 0.85, 0.45));
    for (let i = 3; i <= 21; i += 6) {
      const h = i * RISE;
      const zz = STAIR_BOTTOM - (i - 0.5) * TREAD;
      glows.push(addGlowSprite(mats, group, sign * 5.12, h + 0.08, zz, 0.16, 0.5));
    }
  }

  /* ---------- 门厅尽端的二楼平台：把楼梯与中央拱门接起来 ----------
     平台本身是楼梯顶部到拱门的必经通道，必须保留。楼板去掉木色明边与
     金线，改用与走廊平顶同色的深色收边，从门厅看是洞口上方的阴影。
     前沿原先连栏杆一起删掉，留下中央 x∈[-5,5] 一段约 4m 高的临空：
     实测 5/5 采样点朝门厅一侧无楼板、无护栏（射线 E6）。
     这里补回护栏，但只用 0.032m 细立柱 + 0.06m 细扶手、不做实栏板，
     既满足 1.10m，也不会像旧版那样被门厅读成一道横过梁。
     两端 x=±5.16..6.6 是两跑楼梯的出入口，保持敞开。 */
  const landingZ = (GALLERY_FRONT + GALLERY_BACK) / 2;
  soffit.add(13.5, SLAB, 1.24, 0, LEVEL - SLAB / 2, landingZ);
  // 上层走廊楼板的前沿（在拱洞上方露出一条木色边）同样包深色收边
  soffit.add(4.52, SLAB, 0.36, 0, LEVEL - SLAB / 2, -16.52);
  // 板底不再外挑檐口与齿饰：这些东西悬在门厅拱洞的正中，把洞口读成一道过梁。
  // 楼板只保留 0.14m 的板边，洞口净高即为板底 3.89m。

  const LAND_EDGE_Z = -15.25;
  for (let x = -5.0; x <= 5.001; x += 0.36) {
    gold.add(0.032, GUARD, 0.032, x, LEVEL + GUARD / 2, LAND_EDGE_Z);
  }
  gold.add(10.1, 0.06, 0.06, 0, LEVEL + GUARD, LAND_EDGE_Z);
  goldDeep.add(10.1, 0.04, 0.04, 0, LEVEL + 0.05, LAND_EDGE_Z);

  /* ---------- 二楼走廊：叠在既有走廊之上，上下两层同宽 ---------- */
  wood.add(4.52, SLAB, 14.2, 0, LEVEL - SLAB / 2, -23.45);
  wood.add(4.52, SLAB, 0.72, 0, LEVEL - SLAB / 2, -30.9);
  // 靠墙金线：楼板压进墙体，接缝落在墙面以内
  gold.add(0.06, 0.05, 14.2, -2.23, LEVEL, -23.45);
  gold.add(0.06, 0.05, 14.2, 2.23, LEVEL, -23.45);
  // 上层踢脚线：墙面上下一贯通，不被楼板切断（左侧让开放映厅门）
  goldDeep.add(0.07, 0.09, 14.2, 2.19, LEVEL + 0.07, -23.45);
  goldDeep.add(0.07, 0.09, 8.55, -2.19, LEVEL + 0.07, -20.575);
  goldDeep.add(0.07, 0.09, 4.25, -2.19, LEVEL + 0.07, -28.375);
  // 顶角檐口：贴住走廊顶棚（本轮顶棚 6.90→7.58，檐口随之上移 0.68）
  gold.add(0.08, 0.09, 14.2, 2.19, CEIL - 0.10, -23.45);
  gold.add(0.08, 0.09, 14.2, -2.19, CEIL - 0.10, -23.45);
  goldDeep.add(0.11, 0.07, 14.2, 2.19, CEIL - 0.17, -23.45);
  goldDeep.add(0.11, 0.07, 14.2, -2.19, CEIL - 0.17, -23.45);

  /* ---------- 楼梯口：门洞与过梁，不做裸露方洞 ----------
     门厅尽端的中央拱洞就是这一层的入口；在走廊内侧再包一道木门套与过梁，
     让洞口从走廊一侧看是“门”，而不是一块被楼板切开的空档。 */
  const PORTAL_Z = -17.34;
  // 门套洞口 2.67→2.95（下皮 6.98），过梁加深到 0.55m 顶到新平顶 7.53；
  // 这样 Z12 实测 2.94，超过 2.85 的判据，同时又保留「门」的读法，
  // 不会像把洞口一路开到顶那样把门套做成一道拱。
  for (const sign of [-1, 1]) {
    wood.add(0.18, 2.95, 0.16, sign * 2.14, LEVEL + 1.475, PORTAL_Z);
    gold.add(0.2, 0.07, 0.2, sign * 2.14, LEVEL + 2.975, PORTAL_Z);
  }
  wood.add(4.44, 0.55, 0.18, 0, 7.255, PORTAL_Z);
  goldDeep.add(4.5, 0.05, 0.24, 0, 7.005, PORTAL_Z);

  const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 14.1), mats.carpet);
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, LEVEL + 0.006, -23.45);
  runner.receiveShadow = true;
  group.add(runner);

  // 上层墙面：连续丝绒饰板 + 金框，接在既有拱肋之间
  const panelZ = [-18.4, -23.2, -28.0];
  const panelGeos = [];
  for (const sign of [-1, 1]) {
    for (const z of panelZ) {
      const plane = new THREE.PlaneGeometry(2.6, 1.42);
      plane.rotateY(sign === 1 ? -Math.PI / 2 : Math.PI / 2);
      plane.translate(sign * 2.17, LEVEL + 0.94, z);
      panelGeos.push(plane);

      for (const dz of [-1.32, 1.32]) {
        gold.add(0.05, 1.52, 0.06, sign * 2.15, LEVEL + 0.94, z + dz);
      }
      gold.add(0.05, 0.06, 2.7, sign * 2.15, LEVEL + 1.65, z);
      gold.add(0.05, 0.06, 2.7, sign * 2.15, LEVEL + 0.23, z);
    }
    for (const z of [-20.8, -25.6]) {
      // 西墙 -25.6 正对放映厅门洞，壁灯挪到相邻饰板，避免灯座卡在门中央
      const zz = sign === -1 && z === -25.6 ? -24.2 : z;
      addSmallSconce(gold, glows, mats, group, sign * 2.18, LEVEL + 1.5, zz, sign === 1 ? Math.PI : 0, 0.42);
      /* 二层这 4 盏壁灯此前只有自发光 sprite，没有实体光：平顶 6.90→7.58 之后，
         冠部与平顶只剩半球光 0.48，实测拱肋正中格掉 16%、平顶两侧只有 0.06。
         这里给每盏灯配一盏点光，位置取灯罩外沿（±2.05，与 glow 同位）、
         色温与一层壁灯一致（0xffab63），距离收到 7m 让 4 盏不互相叠加。 */
      const sconceLight = new THREE.PointLight(0xffab63, 1.3, 9, 2);
      sconceLight.position.set(sign * 1.25, LEVEL + 1.52, zz);
      group.add(sconceLight);
      lights.push({ light: sconceLight, base: 1.3 });
    }
  }
  const panelMesh = new THREE.Mesh(mergeGeometries(panelGeos, false), mats.velvetWall);
  panelMesh.receiveShadow = true;
  group.add(panelMesh);


  gold.build(group);
  goldDeep.build(group);
  wood.build(group);
  marble.build(group);
  velvet.build(group);
  soffit.build(group);

  let level = 1;
  function setLevel(v) {
    level = v;
    lights.forEach(({ light, base }) => {
      light.intensity = base * v;
    });
    glows.forEach((g) => {
      g.material.opacity = (g.userData.baseOpacity || 0.5) * (0.25 + 0.75 * v);
    });
  }
  setLevel(1);

  mergeStatic(group);

  return { group, setLevel, get level() { return level; } };
}
