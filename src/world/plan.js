/* ---------- 马蹄形观众厅的平面控制线 ----------
   台口侧半宽 8.0m，向前收至 4.6m（z=-35.1），再接半径 4.6m 的半圆，
   尾端半圆后缘落在 z=-30.5，正对现有走廊尽端。三条拱门开在这段弧墙上。 */
export const HOUSE = {
  FRONT: -47.6,
  TAIL: -35.1,
  APSE_R: 4.6,
  FRONT_HALF: 8.0,
  TAIL_HALF: 4.6,
  REAR: -30.5,
  LEVEL: 4.03,
  // 三层包厢楼面：下层、与二楼同高的主层、顶层敞开楼座
  // 层间净高 = 4.03-0.09-1.72 = 2.22m；7.10-0.09-4.03 = 2.98m
  // 顶层本轮由 6.75 抬到 7.10：二楼包厢后廊净高 2.63→2.98、放映机房底板下
  // 2.60→2.95（均由实测反算，Z8/Z11 >=2.95 是约束最紧的一条）。
  // 顶层楼面 7.10 距观众厅吊顶 12m 仍有 4.90m，不与任何上部构件打架。
  TIER_Y: [1.72, 4.03, 7.10],
  // 二楼走廊（环廊通道）平顶标高：不是顶层楼板底，是一道独立吊顶，
  // 比 7.10 的板底还高 0.48m。拱肋按高宽比 0.90 反算后定 7.58。
  UPPER_CEIL: 7.58,
  // 8 间包厢沿直段侧墙由台口侧向尾端排布：z 从 -46.7 递增到 -36.2
  BOX_Z0: -46.7,
  BOX_STEP: 1.50,
  BOX_COUNT: 8
};

/* ---------- 池座坡度 ----------
   前区（台口到第一排之前）保持平台 y=0；第一排前抬 0.60m，
   之后以约 5.6% 的缓坡抬到后墙 y=1.45。有效坡长约 15.2m，
   总抬升 1.45m，与“6%、约1.4m”对齐。 */
export const RAKE = {
  FLAT_Z: -45.8,
  STEP: 0.6,
  REAR_Z: -30.6,
  REAR_Y: 1.45,
  // 前沿 0.6m 抬升拆成两级 0.3m 踏步：上踏步 -45.94..-45.8，
  // 下踏步 -46.30..-45.94，前端直接接前区平台
  STEP_LOW_Z: -46.30,
  STEP_HIGH_Z: -45.94
};

/* ---------- 乐池 ----------
   第一排之前的半地下坑，坑底比前区地面低 1.8m；中央留一道 1.7m 的技术走桥，
   巡游路径从桥上通过。 */
export const PIT = {
  Z0: -47.5,
  Z1: -46.35,
  HALF: 5.4,
  DEPTH: 1.8,
  BRIDGE_HALF: 0.85
};

export function houseFloorY(z) {
  if (z >= RAKE.REAR_Z) return RAKE.REAR_Y;
  if (z <= RAKE.FLAT_Z) return 0;
  return RAKE.STEP + (RAKE.REAR_Y - RAKE.STEP) * (z - RAKE.FLAT_Z) / (RAKE.REAR_Z - RAKE.FLAT_Z);
}

// 走动人机用的地面标高：前区台阶在 0.8m 内平滑过渡，避免镜头瞬跳
export function walkFloorY(z) {
  if (z >= -27.2) return 0;
  if (z > -30.56) {
    const t = (-27.2 - z) / 3.36;
    return RAKE.REAR_Y * Math.max(0, Math.min(1, t));
  }
  if (z <= RAKE.STEP_LOW_Z) return 0;
  if (z <= RAKE.STEP_HIGH_Z) return 0.3;
  // 上踏步踏面 -45.94..-45.80：落在台唇立面上，标高恒为 0.6；
  // 直接调 houseFloorY 会在 FLAT_Z 处读到 0，造成一级 0.6m 的假落差
  if (z <= RAKE.FLAT_Z) return RAKE.STEP;
  return houseFloorY(z);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 平面半宽：直段线性收分，尾端是半圆
export function halfWidth(z) {
  if (z <= HOUSE.TAIL) {
    const t = clamp01((z - HOUSE.FRONT) / (HOUSE.TAIL - HOUSE.FRONT));
    return HOUSE.FRONT_HALF + (HOUSE.TAIL_HALF - HOUSE.FRONT_HALF) * t;
  }
  const dz = z - HOUSE.TAIL;
  if (dz >= HOUSE.APSE_R) return 0;
  return Math.sqrt(HOUSE.APSE_R * HOUSE.APSE_R - dz * dz);
}

// 墙面切向角（绕 y）：直段约 15°，弧形按点法向求得
export function wallYaw(sign, z) {
  if (z <= HOUSE.TAIL) {
    return Math.atan2(-sign * (HOUSE.FRONT_HALF - HOUSE.TAIL_HALF), HOUSE.TAIL - HOUSE.FRONT);
  }
  // 弧上一点：从圆心指向该点的外法向角
  return Math.asin(Math.max(-1, Math.min(1, (z - HOUSE.TAIL) / HOUSE.APSE_R)));
}

// 弧墙参数化：t ∈ [-1,1]，t=0 为尾端正中
export function apsePoint(t) {
  const a = t * Math.PI * 0.5;
  return {
    x: HOUSE.APSE_R * Math.sin(a),
    z: HOUSE.TAIL + HOUSE.APSE_R * Math.cos(a),
    yaw: a
  };
}

export function boxCenters() {
  const list = [];
  for (let i = 0; i < HOUSE.BOX_COUNT; i++) {
    list.push(HOUSE.BOX_Z0 + i * HOUSE.BOX_STEP);
  }
  return list;
}

/* ---------- 大楼梯 ----------
   24 级、中段 1.15m 休息平台；下部走道与二楼平台都据此取值。 */
export const STAIR = {
  X: 5.925,
  HALF: 0.825,
  Z_BOTTOM: -7.0,
  Z_TOP: -15.35,
  LAND_Z0: -10.60,
  LAND_Z1: -11.75,
  LAND_Y: 2.015,
  TOP_Y: 4.03,
  TREAD: 0.3
};

/* ---------- 主理人办公室 ----------
   后台西侧一层附属间：后台西墙开一条短廊，尽端是磨砂玻璃门；
   办公室朝短廊开一扇内窗，可看到演员进出与化妆区。 */
export const OFFICE = {
  X0: -8.6,          // 东墙（短廊尽端、门与内窗所在）
  X1: -12.4,         // 西墙（旧海报与手写履历）
  Z0: -66.4,         // 南墙
  Z1: -62.0,         // 北墙
  MIDZ: -64.2,
  CORR_X0: -6.2,     // 后台西墙
  CORR_Z0: -65.3,
  CORR_Z1: -62.6,
  CORR_CEIL: 3.45,
  DOOR_Z: -64.7,
  DOOR_HALF: 0.45,
  WIN_Z: -63.2,
  WIN_HALF: 0.45,
  FLOOR: 0.95,
  CEIL: 3.95
};

/* ---------- 创意工坊 ----------
   后台东侧的大开间：北端由侧台经舞台背墙的门进入，
   西墙另开一道门通后台。绘景一半靠南，排练一半靠北，中间半高隔屏。 */
export const WORKSHOP = {
  X0: 6.2,           // 西墙（与后台共用）
  X1: 12.6,          // 东墙
  Z0: -58.3,         // 北墙（与舞台背墙相接）
  Z1: -65.8,         // 南墙
  FLOOR: 0.95,
  CEIL: 5.15,
  STAGE_DOOR_X0: 9.2,
  STAGE_DOOR_X1: 10.6,
  BACK_DOOR_Z0: -63.8,
  BACK_DOOR_Z1: -62.4,
  WALL: 0.16,
  DOOR_TOP: 3.45
};

// 舞台地面：1.5% 微斜，台口一侧高
export function stageFloorY(z) {
  return 0.95 + 0.015 * (-47.6 - z);
}

/* ---------- 侧墙局部坐标：lx 向厅内为正，lz 沿墙 ---------- */
export function wallFrame(sign, z) {
  const yaw = wallYaw(sign, z);
  return {
    x: sign * halfWidth(z),
    z,
    yaw,
    nx: -sign * Math.cos(yaw),
    nz: sign * Math.sin(yaw),
    tx: Math.sin(yaw),
    tz: Math.cos(yaw)
  };
}

export function wallPlace(f, lx, lz) {
  return [f.x + f.nx * lx + f.tx * lz, f.z + f.nz * lx + f.tz * lz];
}
