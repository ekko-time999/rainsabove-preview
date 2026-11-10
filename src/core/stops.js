// 六个停靠点：门厅 / 后台 / 舞台 / 放映厅 / 包厢 / 关于我（主理人办公室）。
// 二楼楼座与包厢后廊都可实际行走，不再依赖写死机位。
import * as THREE from 'three';
import { HOUSE, STAIR, halfWidth, walkFloorY, stageFloorY, wallFrame, wallPlace } from '../world/plan.js';

const F = [0, 1.64, -3.0];
const G_CORR = [[0, 1.64, -16.9], [0, 1.64, -23.6], [0, 3.045, -31.4]];
const G_HOUSE = [...G_CORR, [0, 2.631, -38.8], [0, 2.307, -44.6], [0, 2.61, -48.4]];
/* 后台进出的公共通道。
   戏服架 / 衣架立柱集中在 x 2.8..5.0、z -60.6..-59.4，门套红丝绒在
   (4.14,-57.64)。原来的走法从 [3.6,-60.6] / [4.6,-59.0] 横切，
   离柱面只有 0.13m，镜头会贴着（甚至穿过）红丝绒。
   改成先沿 x≈2 往北退到 z=-58.6（架子的北侧净空），再贴 z=-58.6
   横移到东侧门洞中线 x=4.85，最后穿过门洞。全程离柱面 >= 0.45m。 */
const BS_OUT = [
  [1.6, 2.59, -59.1],
  [2.0, 2.59, -58.6],
  [4.85, 2.59, -58.6],
  [4.85, 2.73, -57.9]
];
const BS_IN = [...BS_OUT].reverse();
// 大楼梯：24 级 × 0.1679m，中途 1.15m 休息平台；相机眼高随踏面逐级抬升
const U_STAIR = [
  [5.85, 1.64, -6.4],
  [5.85, 2.72, -9.0],
  [5.85, 3.66, -10.7],
  [5.85, 3.66, -11.65],
  [5.85, 4.62, -13.4],
  [5.6, 5.52, -15.3],
  [4.5, 5.67, -15.7],
  [2.0, 5.67, -16.95],
  [0, 5.67, -21.5],
  [0, 5.67, -26.2],
  [0, 5.67, -30.4]
];
const U_REAR = [[1.2, 5.67, -31.2], [2.7, 5.67, -31.9]];
const BOX_PROM = [
  [3.3, 5.67, -32.5],
  [3.95, 5.67, -32.85],
  [4.75, 5.67, -33.5],
  [5.35, 5.67, -34.5],
  [5.62, 5.67, -35.1],
  [5.9, 5.67, -36.6],
  [6.35, 5.67, -38.6],
  [6.7, 5.67, -39.9],
  [6.15, 5.67, -40.5],
  [5.85, 5.67, -40.45]
];
const SCR_IN = [[0, 5.67, -26.2], [-1.4, 5.67, -25.6], [-2.4, 5.67, -25.6], [-3.13, 5.67, -25.6]];

/* ---------- 主理人办公室：后台西侧一层 ----------
   后台（z -58.3..-65.8）→ 西墙短廊（x -6.2..-8.6）→ 尽端的磨砂玻璃门 → 房间。 */
const OFFICE_POSE = [-9.35, 2.59, -64.85];
const OFFICE_TARGET = [-11.9, 2.45, -63.35];
const OFFICE_DOOR = [[-6.0, 2.59, -64.3], [-7.4, 2.59, -64.3], [-8.25, 2.59, -64.4], [-9.0, 2.59, -64.5]];
// 后台内部：由侧台进入后绕过道具台、衣箱，走到西墙洞口
const BACKSTAGE_TO_OFFICE = [
  [2.0, 2.59, -61.3],
  [0.2, 2.59, -62.0],
  [-2.0, 2.59, -62.6],
  [-4.4, 2.59, -63.5],
  ...OFFICE_DOOR
];
const OFFICE_BACK_TO_BS = [
  [-9.0, 2.59, -64.5], [-8.25, 2.59, -64.4], [-7.4, 2.59, -64.3], [-6.0, 2.59, -64.3],
  [-4.4, 2.59, -63.5], [-2.0, 2.59, -62.6], [0.2, 2.59, -62.0], [2.0, 2.59, -61.3]
];
// 后台站位 → 办公室：直接斜穿后台去西墙洞口，不再先出门绕到台口再折回来
const BS_TO_OFFICE = [
  [0.2, 2.59, -62.0], [-2.0, 2.59, -62.6], [-4.4, 2.59, -63.5], ...OFFICE_DOOR
];
// 侧台东行 → 舞台背墙东门 → 创意工坊（北半间）
const SHOP_IN = [
  [3.0, 2.63, -50.5],
  [7.2, 2.67, -53.2],
  [9.9, 2.68, -56.2],
  [9.9, 2.63, -57.75],
  [9.9, 2.59, -58.8],
  [10.2, 2.59, -61.4]
];
// 从侧台过桥（而不是从后台）进工坊：先回到侧台高度，再转进北门
const SHOP_FROM_PASS = [
  [4.85, 2.73, -57.9], [6.2, 2.69, -56.0], [8.6, 2.68, -56.0],
  [9.9, 2.66, -56.8], [9.9, 2.63, -57.9], [9.9, 2.59, -58.9], [10.2, 2.59, -61.4]
];
// 工坊回舞台：从北门出，沿侧台回主台
const SHOP_TO_STAGE = [
  [9.9, 2.59, -59.0], [9.9, 2.62, -57.8], [9.9, 2.67, -55.6],
  [6.2, 2.68, -51.8], [0, 2.61, -48.4]
];
// 后台 ↔ 工坊：走后台东墙的门（z -63.1）
const SHOP_FROM_BACK = [
  [2.0, 2.59, -61.3], [4.1, 2.59, -62.3], [5.5, 2.59, -63.1],
  [6.6, 2.59, -63.1], [8.5, 2.59, -62.5]
];
const SHOP_TO_BACK = [
  [8.5, 2.59, -62.5], [6.6, 2.59, -63.1], [5.5, 2.59, -63.1],
  [4.1, 2.59, -62.3], [2.0, 2.59, -61.3]
];
// 一层大厅/舞台一侧回到楼梯脚
const FLOOR_TO_STAIR = [
  ...BS_OUT,
  [0, 2.61, -48.4],
  [0, 2.307, -44.6],
  [0, 3.045, -31.4],
  [0, 1.64, -19.5],
  [0, 1.64, -16.9],
  [0, 1.64, -11.0],
  [3.6, 1.64, -7.4],
  [4.7, 1.64, -7.2]
];

export const STOPS = [
  {
    id: 'foyer',
    index: 1,
    numeral: '01',
    act: '第一幕',
    label: '门厅',
    en: 'FOYER',
    content: 'pages',
    ready: true,
    pose: { position: F, target: [0, 4.15, -16.0] },
    bounds: { minX: -5.5, maxX: 5.5, minZ: -13.4, maxZ: -1.2 },
    eye: 1.64
  },
  {
    id: 'backstage',
    index: 2,
    numeral: '02',
    act: '第二幕',
    label: '后台',
    en: 'BACKSTAGE',
    content: 'posts',
    ready: true,
    pose: {
      position: [0.8, 2.59, -59.6],
      target: [-1.2, 2.5, -64.6]
    },
    bounds: { minX: -5.6, maxX: 5.6, minZ: -65.0, maxZ: -59.0 },
    eye: 2.59
  },
  {
    id: 'stage',
    index: 3,
    numeral: '03',
    act: '第三幕',
    label: '首演台',
    en: 'PREMIERE',
    content: 'works',
    ready: true,
    pose: {
      position: [0, 2.61, -48.9],
      target: [0, 3.42, -56.6]
    },
    bounds: { minX: -6.4, maxX: 6.4, minZ: -55.0, maxZ: -48.8 },
    eye: 2.61
  },
  {
    id: 'workshop',
    index: 4,
    numeral: '04',
    act: '第四幕',
    label: '绘景棚',
    en: 'SCENE SHOP',
    content: 'workshop',
    ready: true,
    pose: {
      // 站在隔屏北侧，一眼看得到画布与钢琴
      position: [9.7, 2.59, -62.3],
      target: [9.5, 2.9, -65.5]
    },
    bounds: { minX: 6.4, maxX: 12.4, minZ: -65.6, maxZ: -58.5 },
    eye: 2.59
  },
  {
    id: 'screening',
    index: 5,
    numeral: '05',
    act: '第五幕',
    label: '放映厅',
    en: 'SCREENING',
    content: 'collections',
    ready: true,
    pose: {
      position: [-3.13, 5.67, -25.6],
      target: [-8.2, 5.35, -25.8]
    },
    bounds: { minX: -3.46, maxX: -2.81, minZ: -28.15, maxZ: -23.45 },
    eye: 5.67
  },
  {
    id: 'box',
    index: 6,
    numeral: '06',
    act: '第六幕',
    label: '包厢',
    en: 'PRIVATE BOX',
    content: 'guests',
    ready: true,
    pose: {
      // 真正站在包厢楼板上：座位在前景、弧栏在中景，越过栏杆看厅
      position: [5.87, 5.67, -40.15],
      target: [2.4, 4.55, -44.8]
    },
    bounds: { minX: 4.6, maxX: 6.02, minZ: -41.3, maxZ: -40.0 },
    eye: 5.67
  },
  {
    id: 'about',
    index: 7,
    numeral: '07',
    act: '第七幕',
    label: '关于我',
    en: 'ABOUT',
    content: 'about',
    ready: true,
    pose: {
      // 站在写字桌东侧，转向西墙的钢琴与旧海报
      position: OFFICE_POSE,
      target: OFFICE_TARGET
    },
    bounds: { minX: -12.2, maxX: -8.75, minZ: -66.28, maxZ: -62.2 },
    eye: 2.59
  }
];

export const STOP_BY_ID = Object.fromEntries(STOPS.map((s) => [s.id, s]));

/* ---------- 主动线上的行进目标 ---------- */
export const NAV = {
  foyer: {
    id: 'foyer',
    label: '门厅',
    en: 'FOYER',
    pose: { position: F, target: [0, 4.15, -16.0] },
    // 由远及近排列：返程时 tour 会按行进方向反转
    via: [
      [0, 1.64, -16.9],
      [0, 1.64, -23.6],
      [0, 3.045, -31.4],
      [0, 2.631, -38.8],
      [0, 2.307, -44.6]
    ]
  },
  corridor: {
    id: 'corridor',
    label: '走廊',
    en: 'CORRIDOR',
    pose: { position: [0, 1.64, -22.6], target: [0, 3.55, -31.5] },
    via: [[0, 1.64, -16.9], [0, 1.64, -23.6], [0, 3.045, -31.4]]
  },
  auditorium: {
    id: 'auditorium',
    label: '观众席',
    en: 'AUDITORIUM',
    pose: { position: [0, 2.922, -33.6], target: [0, 3.9, -47.0] },
    via: [[0, 1.64, -16.9], [0, 1.64, -23.6], [0, 3.045, -31.4]]
  },
  stage: {
    id: 'stage',
    label: '首演台',
    en: 'PREMIERE',
    pose: { position: [0, 2.61, -48.9], target: [0, 3.42, -56.6] },
    via: G_HOUSE
  },
  backstage: {
    id: 'backstage',
    label: '后台',
    en: 'BACKSTAGE',
    pose: { position: [0.8, 2.59, -59.6], target: [-1.2, 2.5, -64.6] },
    via: [...G_HOUSE, ...BS_IN]
  },
  screening: {
    id: 'screening',
    label: '放映厅',
    en: 'SCREENING',
    pose: { position: [-3.13, 5.67, -25.6], target: [-8.2, 5.35, -25.8] },
    via: [...U_STAIR, ...SCR_IN]
  },
  box: {
    id: 'box',
    label: '包厢',
    en: 'PRIVATE BOX',
    pose: { position: [5.87, 5.67, -40.15], target: [2.4, 4.55, -44.8] },
    via: [...U_STAIR, ...U_REAR, ...BOX_PROM]
  },
  gallery: {
    id: 'gallery',
    label: '楼座',
    en: 'GALLERY',
    // 站位收到尾端平台中线：[3,-32.8] 落在拱墙与包厢隔墙之间的死角，
    // 回望只剩 1m 外的墙面，右侧还被包厢隔墙切掉一条。
    pose: { position: [0, 5.67, -31.6], target: [0, 3.2, -49.5] },
    via: [...U_STAIR, [0, 5.67, -31.2]]
  },
  about: {
    id: 'about',
    label: '关于我',
    en: 'ABOUT',
    pose: {
      position: OFFICE_POSE,
      target: OFFICE_TARGET
    },
    via: [...G_HOUSE, ...BS_IN, ...BACKSTAGE_TO_OFFICE]
  },
  workshop: {
    id: 'workshop',
    label: '绘景棚',
    en: 'SCENE SHOP',
    pose: { position: [9.7, 2.59, -62.3], target: [9.5, 2.9, -65.5] },
    via: [...G_HOUSE, ...SHOP_IN]
  }
};

/* ---------- 二楼与特殊空间的显式路线：保证不穿墙、不瞬移 ---------- */
const UPPER = new Set(['box', 'screening', 'gallery']);

export function isUpperSpace(id) {
  return UPPER.has(id);
}

const DOWN_STAIR = [
  [0, 5.67, -21.5],
  [2.0, 5.67, -16.95],
  [4.5, 5.67, -15.7],
  [5.6, 5.52, -15.3],
  [5.85, 4.62, -13.4],
  [5.85, 3.66, -11.65],
  [5.85, 3.66, -10.7],
  [5.85, 2.72, -9.0],
  [5.85, 1.64, -6.4]
];
const STAIR_TO_UPPER = [
  [5.85, 1.64, -6.4],
  [5.85, 2.72, -9.0],
  [5.85, 3.66, -10.7],
  [5.85, 3.66, -11.65],
  [5.85, 4.62, -13.4],
  [5.6, 5.52, -15.3],
  [4.5, 5.67, -15.7],
  [2.0, 5.67, -16.95],
  [0, 5.67, -21.5],
  [0, 5.67, -26.2],
  [0, 5.67, -30.4]
];

// 各上层空间回到尾端平台 [0,-30.4] 的出口路径
const HUB_PT = [0, 5.67, -30.4];
const SCR_OUT = [[-3.13, 5.67, -25.6], [-2.4, 5.67, -25.6], [-1.4, 5.67, -25.6]];
const TO_HUB = {
  screening: [...SCR_OUT, [0, 5.67, -26.2], [0, 5.67, -27.4], HUB_PT],
  gallery: [[0, 5.67, -31.2], HUB_PT],
  box: [...BOX_PROM.slice().reverse(), [2.7, 5.67, -31.9], [1.2, 5.67, -31.2], HUB_PT]
};

// 从尾端平台前往各上层空间（不含平台点本身）
const FROM_HUB = {
  screening: [[0, 5.67, -27.4], [0, 5.67, -26.2], [-1.4, 5.67, -25.6], [-2.4, 5.67, -25.6], [-3.13, 5.67, -25.6]],
  gallery: [[0, 5.67, -31.2]],
  box: [[1.2, 5.67, -31.2], [2.7, 5.67, -31.9], ...BOX_PROM]
};

function upperToUpper(from, to) {
  return [...TO_HUB[from], ...FROM_HUB[to].slice(1)];
}

/* ---------- 走廊：新的自由落点，进出各方向的显式路线 ---------- */
// 走廊 → 楼梯脚（沿门厅中线退回来，再横移到梯口）
const TO_STAIR_FOOT = [
  [0, 1.64, -16.9],
  [0, 1.64, -11.0],
  [3.6, 1.64, -7.4],
  [5.85, 1.64, -6.4]
];
// 舞台/后台/工坊 → 走廊：沿主动线反向回到 -31.4 再进走廊
const CORR_BACK = [
  [0, 2.61, -48.4],
  [0, 2.307, -44.6],
  [0, 2.631, -38.8],
  [0, 3.045, -31.4],
  [0, 1.64, -23.6],
  [0, 1.64, -18.5]
];
// 办公室 → 走廊：出短廊、沿背景线回到门厅中线后再往里
const CORR_FROM_FOYER_SIDE = [
  [2.2, 1.64, -14.6],
  [0, 1.64, -17.6],
  [0, 1.64, -21.5]
];

/* ---------- 一层主干节点：与 NAV 的 via 完全同源 ---------- */
const TRUNK = [
  [0, 1.64, -3.0],
  [0, 1.64, -16.9],
  [0, 1.64, -23.6],
  [0, 3.045, -31.4],
  [0, 2.922, -33.6],
  [0, 2.631, -38.8],
  [0, 2.307, -44.6],
  [0, 2.61, -48.4],
  [0, 2.61, -48.9]
];

// 每个一层空间挂在主干上的节点索引
const GROUND_JOIN = {
  foyer: 0,
  auditorium: 4,
  stage: 8,
  backstage: 8,
  workshop: 8,
  about: 8
};

// 侧向空间 ↔ 主干之间的支路：out 是离场方向，in 是入场方向
const GROUND_ARM = {
  backstage: { out: BS_OUT, in: BS_IN },
  workshop: { out: SHOP_TO_STAGE, in: SHOP_IN },
  about: {
    out: [...OFFICE_BACK_TO_BS, ...BS_OUT],
    in: [...BS_IN, ...BACKSTAGE_TO_OFFICE]
  }
};

function dedupe(pts, eps = 0.06) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < eps) continue;
    out.push(p);
  }
  return out;
}

function groundChain(joinFrom, from, to) {
  const joinTo = GROUND_JOIN[to];
  const chain = [...(GROUND_ARM[from]?.out || [])];
  if (joinFrom !== joinTo) {
    const step = joinTo > joinFrom ? 1 : -1;
    for (let i = joinFrom + step; i !== joinTo + step; i += step) chain.push(TRUNK[i]);
  }
  chain.push(...(GROUND_ARM[to]?.in || []));
  return dedupe(chain);
}

function groundRoute(from, to) {
  if (!(from in GROUND_JOIN) || !(to in GROUND_JOIN)) return null;
  return groundChain(GROUND_JOIN[from], from, to);
}

/* 旧版：按主干顺序串联的老路线，仅作为最短路失败时的兜底保留。
   正常路径一律走下面的站点图。 */
function legacyRouteBetween(from, to) {
  if (from === to) return [];
  // 任意空间 → 走廊
  if (to === 'corridor') {
    if (from === 'foyer' || from === 'auditorium') return null; // 默认 via 过滤即可
    if (from === 'about') return [...OFFICE_BACK_TO_BS, ...FLOOR_TO_STAIR, ...CORR_FROM_FOYER_SIDE];
    if (from === 'workshop') return [...SHOP_TO_STAGE, ...CORR_BACK.slice(1)];
    if (from === 'backstage') return [...BS_OUT, ...CORR_BACK.slice(1)];
    if (isUpperSpace(from)) {
      const head = from === 'box' ? TO_HUB.box : from === 'screening' ? SCR_OUT : TO_HUB.gallery;
      return [
        ...head,
        [0, 5.67, -26.2],
        ...DOWN_STAIR,
        [3.6, 1.64, -8.6],
        [0, 1.64, -13.5],
        [0, 1.64, -18.5]
      ];
    }
    return null;
  }
  // 走廊 → 楼上：先走回梯口再上楼
  if (from === 'corridor' && isUpperSpace(to)) {
    return [...TO_STAIR_FOOT, ...STAIR_TO_UPPER.slice(1), ...FROM_HUB[to].slice(1)];
  }
  // 楼上任一处前往一层办公室：下楼梯后沿大厅、舞台、侧台进后台
  if (isUpperSpace(from) && to === 'about') {
    const head = from === 'box' ? TO_HUB.box : from === 'screening' ? SCR_OUT : TO_HUB.gallery;
    return [...head, [0, 5.67, -26.2], ...DOWN_STAIR, ...[...FLOOR_TO_STAIR].reverse(), ...BACKSTAGE_TO_OFFICE];
  }
  // 从办公室上楼：先穿过短廊回到后台，再沿舞台、长廊到楼梯
  if (from === 'about' && isUpperSpace(to)) {
    return [...OFFICE_BACK_TO_BS, ...FLOOR_TO_STAIR, ...STAIR_TO_UPPER, ...FROM_HUB[to].slice(1)];
  }
  // 工坊与后台、办公室、楼上之间的显式路线：一律走门，不从墙体穿过
  if (from === 'workshop') {
    if (to === 'backstage') return SHOP_TO_BACK;
    if (to === 'about') return [...SHOP_TO_BACK, ...BACKSTAGE_TO_OFFICE.slice(1)];
    if (isUpperSpace(to)) {
      return [
        ...SHOP_TO_STAGE,
        ...FLOOR_TO_STAIR.slice(5),
        ...STAIR_TO_UPPER,
        ...FROM_HUB[to].slice(1)
      ];
    }
  }
  if (to === 'workshop') {
    if (from === 'backstage') return SHOP_FROM_BACK;
    if (from === 'about') return [...OFFICE_BACK_TO_BS, ...SHOP_FROM_BACK.slice(1)];
    if (isUpperSpace(from)) {
      const head = from === 'box' ? TO_HUB.box : from === 'screening' ? SCR_OUT : TO_HUB.gallery;
      return [
        ...head,
        [0, 5.67, -26.2],
        ...DOWN_STAIR,
        ...[...FLOOR_TO_STAIR].reverse(),
        ...SHOP_FROM_PASS
      ];
    }
  }
  /* ---------- 一层主干：门厅 → 长廊 → 观众席 → 舞台 ----------
     后台/工坊/办公室这些侧向空间先各自接回台口，再沿主干走。
     所有点都落在 GROUND_WALK 的可行走区内，避免两点间直连时穿墙。 */
  const ground = groundRoute(from, to);
  if (ground) return ground;

  if (isUpperSpace(from) && isUpperSpace(to)) return upperToUpper(from, to);
  if (isUpperSpace(from)) {
    const head = from === 'box' ? TO_HUB.box : from === 'screening' ? SCR_OUT : TO_HUB.gallery;
    const descend = [...head, [0, 5.67, -26.2], ...DOWN_STAIR];
    // 下到梯脚后还要沿门厅回到主干，否则最后一段会从梯口直穿到目旳地
    if (to === 'foyer') return descend;
    return [
      ...descend,
      [3.6, 1.64, -7.4],
      [0, 1.64, -11.0],
      [0, 1.64, -16.9],
      ...groundChain(1, 'foyer', to)
    ];
  }
  if (isUpperSpace(to)) {
    if (from === 'auditorium') {
      return [...TO_STAIR_FOOT, ...STAIR_TO_UPPER.slice(1), ...FROM_HUB[to].slice(1)];
    }
    if (from === 'stage') {
      return [
        ...CORR_BACK,
        ...TO_STAIR_FOOT.slice(1),
        ...STAIR_TO_UPPER.slice(1),
        ...FROM_HUB[to].slice(1)
      ];
    }
    if (from === 'backstage') {
      return [
        ...BS_OUT,
        ...CORR_BACK.slice(1),
        ...TO_STAIR_FOOT.slice(1),
        ...STAIR_TO_UPPER.slice(1),
        ...FROM_HUB[to].slice(1)
      ];
    }
    return [...STAIR_TO_UPPER, ...FROM_HUB[to].slice(1)];
  }
  return null;
}

/* ==================================================================
   站点连通图 + 最短路
   旧版 routeBetween 把侧向空间一律挂到主干节点 8（台口），于是
   后台→办公室要先出门到首演台、再折回后台、最后钻进办公室。
   这里按建筑里的真实连通关系建图：每条边就是一段原有的显式路线，
   边权取该段 CatmullRom 候选路径的实际弧长（与 buildTravel 同源，
   arcLengthDivisions=320），10 个站点上跑 Dijkstra。站与站之间
   仍复用原有分段路径与 tour.js 的避障，不新增任何几何。
   ================================================================== */
/* 二层走廊 / 大楼梯口：上层三站共用的换乘节点，不是节目单上的站点。
   没有它，放映厅下楼就得先绕到楼座尾端平台再折回，白走约 9m。 */
const HALL_POSE = [0, 5.67, -26.2];
const GRAPH_POSES = { hall: HALL_POSE };
const poseOf = (id) => GRAPH_POSES[id] || (NAV[id] || STOP_BY_ID[id]).pose.position;

/* 去掉与起终点重合的途经点：有些老路线把落点自己也列进来了，
   直接拼进 CatmullRom 会出现零长段和尖角 */
function trimRoute(via, fromId, toId) {
  const a = poseOf(fromId);
  const b = poseOf(toId);
  const pts = via.map((p) => p.slice());
  // 只去掉与取景机位严格重合的首尾点。包厢门口的第一个转弯点离机位
  // 约 0.3m，裁掉会让 CatmullRom 切过包厢侧墙，所以阈值必须收紧
  while (pts.length && Math.hypot(pts[0][0] - a[0], pts[0][2] - a[2]) < 0.15) pts.shift();
  while (pts.length && Math.hypot(pts[pts.length - 1][0] - b[0], pts[pts.length - 1][2] - b[2]) < 0.15) pts.pop();
  return dedupe(pts, 0.08);
}

/* 与 buildTravel 相同的候选曲线，取它的实际弧长作为边权 */
function segmentArcLength(fromId, toId, via) {
  const pts = [new THREE.Vector3(...poseOf(fromId)),
    ...via.map((p) => new THREE.Vector3(...p)),
    new THREE.Vector3(...poseOf(toId))];
  if (pts.length < 3) return new THREE.LineCurve3(pts[0], pts[1]).getLength();
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  curve.arcLengthDivisions = 320;
  return curve.getLength();
}

const MAIN_FC = [[0, 1.64, -16.9]];
const MAIN_CA = [[0, 1.64, -23.6], [0, 3.045, -31.4]];
const MAIN_AS = [[0, 2.631, -38.8], [0, 2.307, -44.6], [0, 2.61, -48.4]];

// [起点, 终点, 去程途经点, 回程途经点]
const STATION_SEGMENTS = [
  ['foyer', 'corridor', MAIN_FC, [...MAIN_FC].reverse()],
  ['corridor', 'auditorium', MAIN_CA, [...MAIN_CA].reverse()],
  ['auditorium', 'stage', MAIN_AS, [...MAIN_AS].reverse()],
  ['stage', 'backstage', BS_IN, BS_OUT],
  ['backstage', 'about', BS_TO_OFFICE, [...BS_TO_OFFICE].reverse()],
  ['backstage', 'workshop', SHOP_FROM_BACK, SHOP_TO_BACK],
  ['stage', 'workshop', SHOP_IN, SHOP_TO_STAGE],
  // 一层 ↔ 二层走廊：大楼梯两个方向各用自己的踏步序列
  ['hall', 'foyer', DOWN_STAIR, STAIR_TO_UPPER.slice(0, -1)],
  ['hall', 'corridor',
    [...DOWN_STAIR, [3.6, 1.64, -8.6], [0, 1.64, -13.5], [0, 1.64, -18.5]],
    [...TO_STAIR_FOOT, ...STAIR_TO_UPPER.slice(1, -1)]],
  // 二层走廊 ↔ 放映厅 / 楼座 / 包厢：都从 HUB_PT 或走廊直接发散，
  // 不再强制先到楼座取景机位再折返
  ['hall', 'screening', FROM_HUB.screening.slice(2), SCR_OUT],
  ['hall', 'gallery', [[0, 5.67, -27.4], HUB_PT, [0, 5.67, -31.2]],
    [...TO_HUB.gallery, [0, 5.67, -27.4]]],
  ['hall', 'box', [[0, 5.67, -27.4], HUB_PT, ...FROM_HUB.box],
    [...TO_HUB.box, [0, 5.67, -27.4]]],
  // 楼座与包厢同在尾端平台上，直连比「上到楼梯口再折回平台」省约 5.6m
  ['gallery', 'box', upperToUpper('gallery', 'box').slice(1), upperToUpper('box', 'gallery')]
];

/* 有向邻接表：每个方向用自己的路线与实际弧长，上下楼的代价并不对称 */
const STATION_GRAPH = (() => {
  const adj = new Map();
  const add = (from, to, via) => {
    const clean = trimRoute(via, from, to);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, via: clean, weight: segmentArcLength(from, to, clean) });
  };
  for (const [a, b, ab, ba] of STATION_SEGMENTS) {
    add(a, b, ab);
    add(b, a, ba);
  }
  return adj;
})();

export function shortestStationPath(from, to) {
  if (from === to) return { sequence: [from], distance: 0, hops: [] };
  if (!STATION_GRAPH.has(from)) return null;
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const done = new Set();
  for (;;) {
    let u = null;
    let best = Infinity;
    for (const [k, v] of dist) {
      if (!done.has(k) && v < best) { best = v; u = k; }
    }
    if (u === null || u === to) break;
    done.add(u);
    for (const e of STATION_GRAPH.get(u) || []) {
      const nd = best + e.weight;
      if (nd < (dist.has(e.to) ? dist.get(e.to) : Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: u, edge: e });
      }
    }
  }
  if (!prev.has(to)) return null;
  const hops = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) return null;
    hops.unshift({ from: p.from, to: cur, via: p.edge.via, weight: p.edge.weight });
    cur = p.from;
  }
  return { sequence: [from, ...hops.map((h) => h.to)], distance: dist.get(to), hops };
}

export function routeBetween(from, to) {
  if (from === to) return [];
  const sp = shortestStationPath(from, to);
  if (!sp) return legacyRouteBetween(from, to);
  // 分段在边界直接接续：图上的中间站点是"经过它的空间"，不是必须绕到
  // 它的取景机位再折回来。途经序列仍由这些 hop 给出，空间上也会穿过该站。
  const pts = [];
  for (const h of sp.hops) pts.push(...h.via);
  return dedupe(pts, 0.08);
}

/* ---------- 空间与 HUD 文案 ---------- */
export const ZONES = [
  {
    id: 'foyer',
    from: -1.2,
    to: -16.4,
    act: 'ACT Ⅰ',
    no: '01',
    label: '门厅',
    en: 'FOYER',
    next: 'auditorium',
    caption: '光在这里落座'
  },
  {
    id: 'corridor',
    from: -16.4,
    to: -27.2,
    act: 'ACT Ⅱ',
    no: '—',
    label: '走廊',
    en: 'CORRIDOR',
    next: 'auditorium',
    caption: '沿着光往里走'
  },
  {
    id: 'auditorium',
    from: -30.6,
    to: -47.6,
    act: 'ACT Ⅱ',
    no: '—',
    label: '观众席',
    en: 'AUDITORIUM',
    next: 'stage',
    caption: '座位正一排排亮起'
  },
  {
    id: 'stage',
    from: -47.6,
    to: -58.0,
    act: 'ACT Ⅲ',
    no: '03',
    label: '首演台',
    en: 'STAGE',
    next: 'backstage',
    caption: '台上只有一件，其余留给黑'
  },
  {
    id: 'backstage',
    from: -58.0,
    to: -66.0,
    act: 'ACT Ⅲ',
    no: '02',
    label: '后台',
    en: 'BACKSTAGE',
    next: 'stage',
    nextKicker: '返回',
    caption: '灯还没全亮，戏服先挂好了'
  },
  {
    id: 'screening',
    from: -23.0,
    to: -28.6,
    act: 'ACT Ⅳ',
    no: '04',
    label: '放映厅',
    en: 'SCREENING',
    next: 'box',
    caption: '一小块银幕，留给私藏'
  },
  {
    id: 'gallery',
    from: -31.0,
    to: -36.2,
    act: 'ACT Ⅴ',
    no: '—',
    label: '楼座',
    en: 'GALLERY',
    next: 'stage',
    nextKicker: '返回',
    caption: '从高处看舞台'
  },
  {
    id: 'box',
    from: -39.3,
    to: -41.1,
    act: 'ACT Ⅴ',
    no: '05',
    label: '包厢',
    en: 'PRIVATE BOX',
    next: 'stage',
    nextKicker: '返回',
    caption: '帘子后面，只留三把椅子'
  },
  {
    id: 'about',
    from: -66.4,
    to: -62.0,
    act: 'ACT Ⅵ',
    no: '06',
    label: '关于我',
    en: 'ABOUT',
    next: 'backstage',
    nextKicker: '返回',
    caption: '主理人的写字桌，窗下是后台的进进出出'
  },
  {
    id: 'workshop',
    from: -66.4,
    to: -57.5,
    act: 'ACT Ⅲ',
    no: '—',
    label: '绘景棚',
    en: 'SCENE SHOP',
    next: 'backstage',
    caption: '一半在画景，一半在排练'
  }
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export function zoneAt(z) {
  if (z < -58.0) return ZONE_BY_ID.backstage;
  if (z < -47.6) return ZONE_BY_ID.stage;
  if (z < -30.6) return ZONE_BY_ID.auditorium;
  if (z < -16.4) return ZONE_BY_ID.corridor;
  return ZONE_BY_ID.foyer;
}

/* ---------- 主动线可走范围：门厅宽，走廊收窄，尾巴让给环廊，观众席只走中央走道 ---------- */
const HALF_KEYS = [
  [-1.0, 5.3],
  [-13.4, 5.3],
  [-16.2, 1.95],
  [-26.6, 1.95],
  [-28.4, 5.7],
  [-30.2, 5.7],
  [-30.7, 1.05],
  [-33.4, 1.05],
  [-44.4, 0.95],
  [-46.2, 0.95],
  [-47.4, 6.0]
];

export function halfWidthAt(z) {
  if (z >= HALF_KEYS[0][0]) return HALF_KEYS[0][1];
  for (let i = 0; i < HALF_KEYS.length - 1; i++) {
    const [z0, w0] = HALF_KEYS[i];
    const [z1, w1] = HALF_KEYS[i + 1];
    if (z <= z0 && z >= z1) {
      const t = (z0 - z) / (z0 - z1);
      return w0 + (w1 - w0) * t;
    }
  }
  return HALF_KEYS[HALF_KEYS.length - 1][1];
}

/* ---------- 主动线的纵向边界与视高 ---------- */
export const MAIN_LINE = {
  minZ: -46.3,
  maxZ: -1.2,
  stageEye: 1.64 + 0.95
};

export function eyeHeightAt(zoneId) {
  const stop = STOP_BY_ID[zoneId];
  return stop && stop.eye ? stop.eye : 1.64;
}

/* ==================================================================
   可行走区域：门厅 → 大楼梯 → 二楼平台 → 后廊 → 包厢后门 → 包厢，
   以及放映厅、主理人办公室。相机只做水平移动，标高由区域给出，
   邻接区域互相重叠，因此边界连续、无瞬移。
   ================================================================== */
export const LEVEL_GROUND = 'ground';
export const LEVEL_UPPER = 'upper';

/* ==================================================================
   离散单体障碍：可行走区模型之外的"路中间的东西"。
   墙、门套、栏杆由下面的 GROUND_WALK / UPPER_WALK 区域边界表达，
   但立在通道里的柱子、垂落的丝绒、戏服架属于单体，constrainWalk
   完全看不见它们。转场避障必须额外把它们当圆柱碰撞体探测，
   否则 8 方向探距只会读到墙，镜头会贴着（甚至穿过）这些构件。
   半径取构件水平截面的外接圆，y0/y1 是它实际占据的高度区间。
   ================================================================== */
export const WALK_OBSTACLES = [
  // 后台门套前垂下的一角红丝绒：0.52×2.4×0.24，立在 x=4.14 的门洞左缘
  {
    id: 'backstage-portiere', label: '后台门套红丝绒柱', level: LEVEL_GROUND,
    x: 4.14, z: -57.64, r: 0.30, y0: 0.95, y1: 3.35
  },
  // 后台衣架上的五件红丝绒戏服（0.55×1.0×0.16），沿斜线排开
  ...[0, 1, 2, 3, 4].map((i) => ({
    id: `backstage-costume-${i}`, label: '后台戏服架', level: LEVEL_GROUND,
    x: 3.18 + i * 0.36, z: -60.35 + i * 0.22, r: 0.34, y0: 2.2, y1: 3.3
  })),
  // 衣架两端的铜立柱
  { id: 'rack-post-l', label: '衣架立柱', level: LEVEL_GROUND, x: 2.8, z: -60.6, r: 0.10, y0: 1.7, y1: 3.4 },
  { id: 'rack-post-r', label: '衣架立柱', level: LEVEL_GROUND, x: 5.0, z: -60.6, r: 0.10, y0: 1.7, y1: 3.4 }
];

export function stairFloorY(z) {
  if (z >= STAIR.Z_BOTTOM) return 0;
  if (z > STAIR.LAND_Z0) {
    return STAIR.LAND_Y * (STAIR.Z_BOTTOM - z) / (STAIR.Z_BOTTOM - STAIR.LAND_Z0);
  }
  if (z >= STAIR.LAND_Z1) return STAIR.LAND_Y;
  if (z > STAIR.Z_TOP) {
    return STAIR.LAND_Y + (STAIR.TOP_Y - STAIR.LAND_Y) * (STAIR.LAND_Z1 - z) / (STAIR.LAND_Z1 - STAIR.Z_TOP);
  }
  return STAIR.TOP_Y;
}

const BOX_F = wallFrame(1, -40.7);
const BOX_C = wallPlace(BOX_F, 0.78, 0);
const BOX_F_L = wallFrame(-1, -40.7);
const BOX_C_L = wallPlace(BOX_F_L, 0.78, 0);

const stairY = (x, z) => stairFloorY(z);
const STAIR_L = { type: 'rect', id: 'stair-l', x0: -6.6, x1: -5.16, z0: -15.45, z1: -6.98, y: stairY, space: null };
const STAIR_R = { type: 'rect', id: 'stair-r', x0: 5.16, x1: 6.6, z0: -15.45, z1: -6.98, y: stairY, space: null };

const GROUND_WALK = [
  { type: 'rect', id: 'foyer-front', x0: -5.3, x1: 5.3, z0: -7.0, z1: 0.35, y: 0, space: 'foyer' },
  // 楼梯段两侧被梯体占据，门厅后半区收窄到梯梁内侧
  { type: 'rect', id: 'foyer', x0: -5.05, x1: 5.05, z0: -16.5, z1: -6.98, y: 0, space: 'foyer' },
  // 梯口两侧的过厅：从这里横移到梯上；与梯段多叠 0.12m，脚下接缝不再闪缝
  { type: 'rect', id: 'app-r', x0: 4.6, x1: 6.6, z0: -7.10, z1: -2.5, y: 0, space: null },
  { type: 'rect', id: 'app-l', x0: -6.6, x1: -4.6, z0: -7.10, z1: -2.5, y: 0, space: null },
  STAIR_L,
  STAIR_R,
  { type: 'taper', id: 'main', z0: -46.4, z1: -17.55, y: (x, z) => walkFloorY(z), space: null },
  // 门厅拱门下的丝绒帘中央净空 2.59m；行走区在帘前收窄到 2.3m，
  // 与帘缝对齐，不再从帘身穿过
  { type: 'rect', id: 'arch-pass', x0: -1.15, x1: 1.15, z0: -17.55, z1: -16.42, y: 0, space: null },
  {
    // 走桥 → 舞台的五级踏步：与 auditorium.js 的踏面几何逐级一致
    type: 'rect', id: 'bridge', x0: -0.85, x1: 0.85, z0: -47.95, z1: -46.32,
    y: (x, z) => 0.19 * Math.max(0, Math.min(5, Math.ceil((-46.4 - z) / 0.24))), space: 'auditorium'
  },
  { type: 'rect', id: 'stage', x0: -6.3, x1: 6.45, z0: -57.9, z1: -47.85, y: (x, z) => stageFloorY(z), space: 'stage' },
  // 东侧台：与主台同高，一直铺到工坊门口
  { type: 'rect', id: 'stage-east', x0: 6.15, x1: 11.9, z0: -57.85, z1: -50.5, y: (x, z) => stageFloorY(z), space: 'stage' },
  // 舞台背墙东门 → 创意工坊：台面与工坊地面齐平
  {
    type: 'rect', id: 'shop-door', x0: 9.25, x1: 10.55, z0: -58.6, z1: -57.7,
    y: 0.95, space: 'workshop'
  },
  { type: 'rect', id: 'pass', x0: 3.95, x1: 5.25, z0: -59.4, z1: -57.6, y: 0.95, space: 'stage' },
  { type: 'rect', id: 'backstage', x0: -5.5, x1: 5.5, z0: -65.72, z1: -58.1, y: 0.95, space: 'backstage' },
  // 装卸门：卷帘升到 2.6m 净高后，室内门槛 → 门洞 → 室外装卸平台连续可走
  { type: 'rect', id: 'dock-door', x0: 1.12, x1: 4.08, z0: -66.35, z1: -65.55, y: 1.05, space: 'backstage' },
  { type: 'rect', id: 'dock-platform', x0: -0.15, x1: 5.35, z0: -68.55, z1: -66.2, y: 1.05, space: 'backstage' },
  // 后台西墙的洞口 → 短廊 → 磨砂玻璃门 → 办公室
  { type: 'rect', id: 'bs-door', x0: -6.3, x1: -5.35, z0: -65.22, z1: -62.68, y: 0.95, space: 'backstage' },
  { type: 'rect', id: 'office-corr', x0: -8.5, x1: -6.15, z0: -65.22, z1: -62.68, y: 0.95, space: 'about' },
  { type: 'rect', id: 'office-door', x0: -8.74, x1: -8.44, z0: -65.12, z1: -64.28, y: 0.95, space: 'about' },
  { type: 'rect', id: 'office', x0: -12.3, x1: -8.68, z0: -66.3, z1: -62.1, y: 0.95, space: 'about' },
  // 创意工坊：后台东墙的门 → 大开间
  { type: 'rect', id: 'shop-backdoor', x0: 5.4, x1: 6.45, z0: -63.85, z1: -62.35, y: 0.95, space: 'workshop' },
  { type: 'rect', id: 'workshop', x0: 6.32, x1: 12.45, z0: -65.65, z1: -58.4, y: 0.95, space: 'workshop' }
];

const UPPER_WALK = [
  STAIR_L,
  STAIR_R,
  { type: 'rect', id: 'landing', x0: -6.55, x1: 6.55, z0: -16.5, z1: -15.3, y: 4.03, space: 'gallery' },
  { type: 'rect', id: 'corridor', x0: -2.1, x1: 2.1, z0: -30.65, z1: -16.4, y: 4.03, space: 'gallery' },
  // 尾端平台原来是一块 x±3.55 的矩形，其中两侧各约 0.8m 落在弧墙背后
  // （z≈-31.4 处墙面只到 x±2.73），人会穿墙站进空腔。
  // 改成"弧内条带"：z 区间内按弧墙内径收口，再单给一条门洞喉道接走廊。
  { type: 'apse', id: 'rear-platform', cx: 0, cz: HOUSE.TAIL, r: 4.45, z0: -32.35, z1: -31.15, y: 4.03, space: 'gallery' },
  { type: 'rect', id: 'rear-door', x0: -1.95, x1: 1.95, z0: -31.2, z1: -30.45, y: 4.03, space: 'gallery' },
  { type: 'ring', id: 'inner-r', cx: 0, cz: HOUSE.TAIL, r0: 2.95, r1: 4.5, a0: 0.12, a1: 1.06, y: 4.03, space: 'gallery' },
  { type: 'ring', id: 'inner-l', cx: 0, cz: HOUSE.TAIL, r0: 2.95, r1: 4.5, a0: -1.06, a1: -0.12, y: 4.03, space: 'gallery' },
  { type: 'ring', id: 'arch-r', cx: 0, cz: HOUSE.TAIL, r0: 4.4, r1: 5.1, a0: 0.98, a1: 1.1, y: 4.03, space: 'gallery' },
  { type: 'ring', id: 'arch-l', cx: 0, cz: HOUSE.TAIL, r0: 4.4, r1: 5.1, a0: -1.1, a1: -0.98, y: 4.03, space: 'gallery' },
  { type: 'ring', id: 'outer-r', cx: 0, cz: HOUSE.TAIL, r0: 5.0, r1: 6.55, a0: 0.94, a1: 1.58, y: 4.03, space: 'gallery' },
  { type: 'ring', id: 'outer-l', cx: 0, cz: HOUSE.TAIL, r0: 5.0, r1: 6.55, a0: -1.58, a1: -0.94, y: 4.03, space: 'gallery' },
  /* 转角与后廊的接缝：上一轮 84 格「模型可走、几何无板」里，77 格就出自
     backcorr 起点 (5.365,-34.648) 的 0.78m 圆头——那个圆头把可行走区画到
     r=4.60，整段落在 r 4.60..5.02 的弧墙实体里。这里不补板（补板就是造假地面），
     而是把圆头退到 z=-36.2 的 (5.788,-36.2)：该点 r=5.894，减去 0.78 仍余
     r=5.114 > 5.02 的墙外皮，圆头不再进墙；中间那段由 corner 矩形接住。 */
  { type: 'rect', id: 'corner-r', x0: 5.06, x1: 6.36, z0: -36.2, z1: -34.35, y: 4.03, space: 'gallery' },
  { type: 'rect', id: 'corner-l', x0: -6.36, x1: -5.06, z0: -36.2, z1: -34.35, y: 4.03, space: 'gallery' },
  { type: 'seg', id: 'backcorr-r', ax: 5.788, az: -36.2, bx: 8.731, bz: -46.999, half: 0.78, y: 4.03, space: 'gallery' },
  { type: 'seg', id: 'backcorr-l', ax: -5.788, az: -36.2, bx: -8.731, bz: -46.999, half: 0.78, y: 4.03, space: 'gallery' },
  { type: 'seg', id: 'boxdoor-r', ax: 7.02, az: -40.7, bx: 5.45, bz: -40.95, half: 0.42, y: 4.03, space: 'gallery' },
  { type: 'rect', id: 'box-r', cx: BOX_C[0], cz: BOX_C[1], hx: 0.76, hz: 0.72, yaw: BOX_F.yaw, y: 4.03, space: 'box' },
  // 左侧包厢与右侧对称：端点必须取右侧的镜像，原来两端都落在包厢内，
  // 门洞点只是一枚 9cm 的孤立线段，左包厢因此永远走不进去。
  { type: 'seg', id: 'boxdoor-l', ax: -7.02, az: -40.7, bx: -5.45, bz: -40.95, half: 0.42, y: 4.03, space: 'gallery' },
  { type: 'rect', id: 'box-l', cx: BOX_C_L[0], cz: BOX_C_L[1], hx: 0.76, hz: 0.72, yaw: BOX_F_L.yaw, y: 4.03, space: 'box' },
  { type: 'rect', id: 'screen-pass', x0: -2.62, x1: -1.95, z0: -26.3, z1: -24.9, y: 4.03, space: 'screening' },
  { type: 'seg', id: 'screen-door', ax: -2.30, az: -25.6, bx: -2.95, bz: -25.6, half: 0.34, y: 4.03, space: 'screening' },
  // 放映厅只留东侧 0.60m 过道；三排座椅在行走区之外，不能横穿
  { type: 'rect', id: 'screen', x0: -3.44, x1: -2.82, z0: -28.2, z1: -23.4, y: 4.03, space: 'screening' }
];

const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

function regionY(p, x, z) {
  return typeof p.y === 'function' ? p.y(x, z) : p.y;
}

function clampRegion(p, x, z) {
  // 带 yaw 的矩形：随侧墙一起转，用于包厢与主理人办公室
  if (p.type === 'rect' && p.yaw) {
    const ca = Math.cos(p.yaw);
    const sa = Math.sin(p.yaw);
    const dx = x - p.cx;
    const dz = z - p.cz;
    const lx = ca * dx - sa * dz;
    const lz = sa * dx + ca * dz;
    const clx = clampN(lx, -p.hx, p.hx);
    const clz = clampN(lz, -p.hz, p.hz);
    const wx = p.cx + ca * clx + sa * clz;
    const wz = p.cz - sa * clx + ca * clz;
    return { x: wx, z: wz, d: Math.hypot(x - wx, z - wz), y: regionY(p, wx, wz), space: p.space, id: p.id };
  }
  if (p.type === 'rect') {
    const cx = clampN(x, p.x0, p.x1);
    const cz = clampN(z, p.z0, p.z1);
    return { x: cx, z: cz, d: Math.hypot(x - cx, z - cz), y: regionY(p, cx, cz), space: p.space, id: p.id };
  }
  if (p.type === 'apse') {
    // 弧内条带：z 收进区间后，按该 z 处圆弧内径收口 x
    const cz = clampN(z, p.z0, p.z1);
    const dz = cz - p.cz;
    const w = Math.sqrt(Math.max(0, p.r * p.r - dz * dz));
    const cx = clampN(x, -w, w);
    return { x: cx, z: cz, d: Math.hypot(x - cx, z - cz), y: regionY(p, cx, cz), space: p.space, id: p.id };
  }
  if (p.type === 'taper') {
    const cz = clampN(z, p.z0, p.z1);
    const w = Math.abs(halfWidthAt(cz));
    const cx = clampN(x, -w, w);
    return { x: cx, z: cz, d: Math.hypot(x - cx, z - cz), y: regionY(p, cx, cz), space: p.space, id: p.id };
  }
  if (p.type === 'seg') {
    const dx = p.bx - p.ax;
    const dz = p.bz - p.az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clampN(((x - p.ax) * dx + (z - p.az) * dz) / l2, 0, 1) : 0;
    const px = p.ax + dx * t;
    const pz = p.az + dz * t;
    let ox = x - px;
    let oz = z - pz;
    const d = Math.hypot(ox, oz);
    if (d > p.half && d > 1e-6) {
      const s = p.half / d;
      return { x: px + ox * s, z: pz + oz * s, d: d - p.half, y: regionY(p, x, z), space: p.space, id: p.id };
    }
    return { x, z, d: 0, y: regionY(p, x, z), space: p.space, id: p.id };
  }
  // ring band
  let dx = x - p.cx;
  let dz = z - p.cz;
  let r = Math.hypot(dx, dz);
  let a = Math.atan2(dx, dz);
  const cr = clampN(r, p.r0, p.r1);
  const ca = clampN(a, p.a0, p.a1);
  const px = p.cx + cr * Math.sin(ca);
  const pz = p.cz + cr * Math.cos(ca);
  return { x: px, z: pz, d: Math.hypot(x - px, z - pz), y: regionY(p, px, pz), space: p.space, id: p.id };
}

export function constrainWalk(x, z, level) {
  const list = level === LEVEL_UPPER ? UPPER_WALK : GROUND_WALK;
  let best = null;
  for (const p of list) {
    const c = clampRegion(p, x, z);
    if (!best || c.d < best.d - 1e-4) best = c;
  }
  return best;
}

export function walkFloorAt(x, z, level) {
  const c = constrainWalk(x, z, level);
  return c ? c.y : 0;
}

export function spaceAt(x, z, level) {
  const list = level === LEVEL_UPPER ? UPPER_WALK : GROUND_WALK;
  let space = null;
  for (const p of list) {
    const c = clampRegion(p, x, z);
    if (c.d < 0.004 && p.space) space = p.space;
  }
  return space;
}

// 楼梯上下的层级切换：只在两段楼梯附近发生，避免在平台上误判
export function resolveWalkLevel(x, z, level) {
  const nearStair = Math.abs(x) > STAIR.X - 1.1 && Math.abs(x) < STAIR.X + 1.1;
  if (!nearStair || z > -6.85 || z < -15.6) return level;
  if (level === LEVEL_GROUND && z <= -15.1) return LEVEL_UPPER;
  if (level === LEVEL_UPPER && z >= -7.2) return LEVEL_GROUND;
  return level;
}

/* ==================================================================
   全部可达空间：节目单目录按楼层分组，随时可以点任意一站。
   floor 用于分组，section 是建筑上的方位说明。
   ================================================================== */
export const SPACES = [
  { id: 'foyer', nav: 'foyer', label: '门厅', en: 'FOYER', floor: 1, section: '前厅 · 入口', no: '01' },
  { id: 'corridor', nav: 'corridor', label: '走廊', en: 'CORRIDOR', floor: 1, section: '前厅 · 东西向', no: '02' },
  { id: 'auditorium', nav: 'auditorium', label: '观众席', en: 'AUDITORIUM', floor: 1, section: '观众厅 · 池座', no: '03' },
  { id: 'stage', nav: 'stage', label: '首演台', en: 'PREMIERE', floor: 1, section: '舞台 · 台口', no: '04' },
  { id: 'workshop', nav: 'workshop', label: '绘景棚', en: 'SCENE SHOP', floor: 1, section: '东翼 · 侧台外', no: '05' },
  { id: 'backstage', nav: 'backstage', label: '后台', en: 'BACKSTAGE', floor: 1, section: '后区 · 舞台背面', no: '06' },
  { id: 'about', nav: 'about', label: '办公室', en: 'ABOUT', floor: 1, section: '后区 · 西侧短廊', no: '07' },
  { id: 'gallery', nav: 'gallery', label: '二楼楼座', en: 'GALLERY', floor: 2, section: '环廊 · 尾端平台', no: '08' },
  { id: 'box', nav: 'box', label: '包厢', en: 'PRIVATE BOX', floor: 2, section: '环廊 · 侧后方', no: '09' },
  { id: 'screening', nav: 'screening', label: '放映厅', en: 'SCREENING', floor: 2, section: '西廊 · 上层', no: '10' }
];

export const SPACE_BY_ID = Object.fromEntries(SPACES.map((s) => [s.id, s]));

/* 竖屏专用落点：手机竖幅视野窄，门厅的挑高会占掉大半画面，
   把人往前送几步、视线压平，让台口成为主体。 */
export const PORTRAIT_POSE = {
  // 竖屏门厅落点：走到长廊尽头面向拱门，让门套、帷幔与铜饰填满窄画幅
  foyer: { position: [0, 1.64, -14.0], target: [0, 1.9, -17.2] }
};

export function spaceLabel(id) {
  return SPACE_BY_ID[id]?.label || ZONE_BY_ID[id]?.label || '';
}

