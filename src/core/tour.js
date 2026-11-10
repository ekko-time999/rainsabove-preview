import * as THREE from 'three';
import { tween, easeInOutCubic, easeInOutSine, updateTweens } from './anim.js';
import {
  NAV,
  STOP_BY_ID,
  PORTRAIT_POSE,
  routeBetween,
  constrainWalk,
  WALK_OBSTACLES,
  LEVEL_GROUND,
  LEVEL_UPPER
} from './stops.js';

/* ==================================================================
   转场路径的净距约束
   障碍模型直接复用 stops.js 的可行走区：区域之外就是墙体、门套、
   台座、座椅排、走桥两侧与楼梯栏板。沿候选路径等弧长采样，把越界
   的点拉回可行走区并留出侧向余量；门洞附近收敛到洞口中线；竖向
   贴着地面标高走，避免穿楼板。速度按净距做时间重映射：窄处减速，
   宽处回升，两端仍由原有的 easeInOutCubic 收住，不会急停。
   ================================================================== */
const EYE = 1.64;
const SAFE_MARGIN = 0.3;
const PATH_SAMPLES = 180;
const LEVEL_SPLIT_Y = 3.4;
const PROBE_STEP = 0.08;
const PROBE_MAX = 1.4;
/* 单体障碍的净距目标：比墙的 0.3m 更宽，镜头近平面 0.08m 之外还要留余量 */
const OBSTACLE_MARGIN = 0.42;

const smooth01 = (t) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
const levelAtY = (y) => (y > LEVEL_SPLIT_Y ? LEVEL_UPPER : LEVEL_GROUND);

/* 把角度差归一到 (-180°, 180°]，对应
     delta = ((target - current + 540) % 360) - 180
   用弧度表达，并额外处理 JS 取模对负数返回负值的情形。
   所有 yaw 插值（起步并入、相邻切线采样、末段并入）都必须走这里，
   否则 ±π 分支会被逐段解缠累积成一整圈，收尾再硬跳回站点朝向。 */
const TAU = Math.PI * 2;
function normAngleDelta(d) {
  let r = (((d + Math.PI * 3) % TAU) + TAU) % TAU - Math.PI;
  return r;
}

/* 把绝对角度收回 (-180°, 180°]：球内视点每帧直接取该值，
   相邻帧的视觉变化天然是短弧，不会像连续解缠那样累积出整圈。 */
function normAngle(a) {
  const r = normAngleDelta(a);
  return r <= -Math.PI ? r + TAU : r;
}

/* 某处路径的水平切线。ArcPath 是折线，用 u 与 u+0.004 的差分；
   末端改用向后差分，保证 u=1 时也有切线（视点收尾不丢朝向）。
   只取 XZ，绝不带 y：爬坡上楼不会把俯仰带起来。 */
const TANGENT_EPS = 0.004;
/* 球内跟随视点的固定俯角：略低头能看到脚下路线导轨与楼层结构。
   恒为常数、全程不随路径或时间变化，俯仰完全平稳不摆动。 */
const FOLLOW_PITCH = -0.28;
/* 行进方向取前方 1.6m 的弧长基线：ArcPath 是折线（180 个等弧长采样点），
   避障让位留下大量微小锯齿，瞬时 0.004 差分在拐点单帧能跳 121°，
   拿它当视点朝向会一路甩头（实测一段累计 1452°）。固定弧长窗口的
   有限差分才是物理上有意义的「该处水平切线 / 行进方向」。 */
const DIRECTION_ARC = 1.6;
function tangentAt(path, u, a, b, c, d) {
  // 局部切线（严格意义上的「该处切线」，验收基准）
  let u0 = Math.max(0, Math.min(1, u));
  let u1 = Math.min(1, u0 + TANGENT_EPS);
  if (u1 - u0 < 1e-6) {
    u1 = u0;
    u0 = Math.max(0, u1 - TANGENT_EPS);
  }
  path.getPointAt(u0, a);
  path.getPointAt(u1, b);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-5) return null;
  const localYaw = normAngle(Math.atan2(-dx, -dz));

  // 前方 1.6m 的行进方向：窗口长度恒为 du。末端改成等长的向后窗口
  // （方向仍是 d0 -> d1 的前向），绝不把窗口截成瞬时差分，否则收尾会
  // 突然退化成锯齿切线并猛甩一下头。
  const du = Math.min(0.08, Math.max(TANGENT_EPS, DIRECTION_ARC / Math.max(1, path.length)));
  const uc = Math.max(0, Math.min(1, u));
  let d0, d1;
  if (uc + du <= 1) {
    d0 = uc;
    d1 = uc + du;
  } else {
    d1 = 1;
    d0 = Math.max(0, 1 - du);
  }
  path.getPointAt(d0, c);
  path.getPointAt(d1, d);
  const ddx = d.x - c.x;
  const ddz = d.z - c.z;
  const dlen = Math.hypot(ddx, ddz);
  const dirYaw = dlen > 1e-5 ? normAngle(Math.atan2(-ddx, -ddz)) : localYaw;

  return { yaw: dirYaw, localYaw, dirYaw, dx: ddx / (dlen || 1), dz: ddz / (dlen || 1) };
}

/* 单体圆柱障碍：只在自身高度区间内、对应楼层生效。
   返回到柱面的有符号距离（负数表示已经在柱体内）与径向单位向量。 */
function obstacleDistance(x, z, y, level) {
  let best = null;
  for (const o of WALK_OBSTACLES) {
    if (o.level && o.level !== level) continue;
    if (y < o.y0 - 0.15 || y > o.y1 + 0.15) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const r0 = Math.hypot(dx, dz) || 1e-6;
    const d = r0 - o.r;
    if (!best || d < best.d) best = { d, nx: dx / r0, nz: dz / r0, id: o.id };
  }
  return best;
}

/* 从 (x,z) 沿单位方向 (dx,dz) 发出射线，求第一次碰到某个柱面的距离 */
function obstacleRayDistance(x, z, dx, dz, y, level) {
  let best = Infinity;
  for (const o of WALK_OBSTACLES) {
    if (o.level && o.level !== level) continue;
    if (y < o.y0 - 0.15 || y > o.y1 + 0.15) continue;
    const ox = x - o.x;
    const oz = z - o.z;
    const c = ox * ox + oz * oz - o.r * o.r;
    if (c <= 0) return 0;
    const b = ox * dx + oz * dz;
    const disc = b * b - c;
    if (disc <= 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < best) best = t;
  }
  return best;
}

/* 门洞中线：axis 是要对齐的坐标，at 是中线值，gate 是洞口所在位置，
   range 是沿行进方向的生效范围，reach 是横向接近阈值，level 限定楼层。
   只有真正走到洞口附近的路径才会被收正，避免隔着一堵墙误吸。 */
const DOOR_GATES = [
  { label: '门厅拱门', axis: 'x', at: 0, gate: -16.98, range: 1.15, reach: 2.0, level: LEVEL_GROUND },
  { label: '后台过道', axis: 'x', at: 4.85, gate: -58.5, range: 1.05, reach: 1.6, level: LEVEL_GROUND },
  { label: '绘景棚门', axis: 'x', at: 9.9, gate: -58.15, range: 0.9, reach: 1.6, level: LEVEL_GROUND },
  { label: '办公室门', axis: 'z', at: -64.7, gate: -8.59, range: 0.6, reach: 1.2, level: LEVEL_GROUND },
  { label: '放映厅门', axis: 'z', at: -25.6, gate: -2.62, range: 0.55, reach: 1.2, level: LEVEL_UPPER },
  { label: '右包厢门', axis: 'z', at: -40.82, gate: 6.24, range: 0.55, reach: 1.2, level: LEVEL_UPPER },
  { label: '左包厢门', axis: 'z', at: -40.82, gate: -6.24, range: 0.55, reach: 1.2, level: LEVEL_UPPER }
];

/* 侧向净距：从采样点沿 8 个方向探到可行走区边界。
   只用路径法向会在凹角处读到 0，斜向能正确量到墙角距离，
   同时给出最宽的一侧作为避让方向。 */
function probeDir(x, z, dx, dz, level, y) {
  let d = 0;
  for (let s = PROBE_STEP; s <= PROBE_MAX + 1e-6; s += PROBE_STEP) {
    const c = constrainWalk(x + dx * s, z + dz * s, level);
    if (!c || c.d > 0.012) break;
    d = s;
  }
  // 路中间的单体不在可行走区模型里，必须和墙一起算净距
  return Math.min(d, obstacleRayDistance(x, z, dx, dz, y, level));
}

const DIAG = Math.SQRT1_2;

function clearanceAt(x, z, y, tx, tz, level, full = true) {
  const nx = -tz;
  const nz = tx;
  // 第一遍只量左右两侧，够用且快；最后一遍量 8 个方向给出验收净距
  const dirs = full
    ? [
        [nx, nz],
        [-nx, -nz],
        [tx, tz],
        [-tx, -tz],
        [(nx + tx) * DIAG, (nz + tz) * DIAG],
        [(nx - tx) * DIAG, (nz - tz) * DIAG],
        [(-nx + tx) * DIAG, (-nz + tz) * DIAG],
        [(-nx - tx) * DIAG, (-nz - tz) * DIAG]
      ]
    : [
        [nx, nz],
        [-nx, -nz]
      ];
  let min = Infinity;
  let mx = 1;
  let mz = 0;
  for (const [dx, dz] of dirs) {
    const d = probeDir(x, z, dx, dz, level, y);
    if (d < min) {
      min = d;
      mx = dx;
      mz = dz;
    }
  }
  // 沿离墙最近的那个方向的反向退让，而不是挑最空的方向，
  // 否则贴着墙角时可能沿墙平移，净距不增反降
  return { min, bx: -mx, bz: -mz };
}

/* 等弧长折线：采样点即动画采样点，位置与验收读数完全一致 */
class ArcPath {
  constructor(points) {
    this.points = points;
    this.cum = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += points[i].distanceTo(points[i - 1]);
      this.cum.push(total);
    }
    this.length = total;
  }

  locate(d) {
    const cum = this.cum;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    return { i: lo, j: hi, t: (d - cum[lo]) / span };
  }

  getPointAt(u, target = new THREE.Vector3()) {
    const d = Math.max(0, Math.min(1, u)) * this.length;
    const { i, j, t } = this.locate(d);
    return target.copy(this.points[i]).lerp(this.points[j], t);
  }
}

function applyDoorGates(pts, base) {
  const N = pts.length - 1;
  for (const g of DOOR_GATES) {
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      if (levelAtY(base[i].y) !== g.level) continue;
      const along = Math.abs(g.axis === 'x' ? p.z - g.gate : p.x - g.gate);
      const lateral = Math.abs(g.axis === 'x' ? p.x - g.at : p.z - g.at);
      if (along >= g.range || lateral >= g.reach) continue;
      const edge = smooth01(Math.min(i, N - i) / Math.max(1, N * 0.05));
      const w = smooth01(1 - along / g.range) * 0.94 * edge;
      if (g.axis === 'x') p.x += (g.at - p.x) * w;
      else p.z += (g.at - p.z) * w;
    }
  }
}

/* 回到可行走区、留出侧向余量，并给出每点净距 */
function enforceSafe(pts, base, margin, full = true) {
  const N = pts.length - 1;
  const clearances = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const level = levelAtY(base[i].y);
    const c = constrainWalk(p.x, p.z, level);
    if (c && c.d > 0.001) {
      p.x = c.x;
      p.z = c.z;
    }
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(N, i + 1)];
    let tx = b.x - a.x;
    let tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    tx /= len;
    tz /= len;
    let cl = clearanceAt(p.x, p.z, base[i].y, tx, tz, level, full);
    clearances[i] = cl.min;
    const edge = smooth01(Math.min(i, N - i) / Math.max(1, N * 0.04));
    if (edge <= 0) continue;
    // 凹角处一次退让不一定够（最近边界可能在斜向），最多迭代三次
    for (let k = 0; k < 3 && cl.min < margin; k++) {
      const prev = cl.min;
      const push = (margin - cl.min) * 0.95 * edge;
      const qx = p.x + cl.bx * push;
      const qz = p.z + cl.bz * push;
      const qc = constrainWalk(qx, qz, level);
      if (!qc || qc.d > 0.002) break;
      p.x = qx;
      p.z = qz;
      // 记录避让后的真实净距，验收读数才与最终路径一致
      cl = clearanceAt(p.x, p.z, base[i].y, tx, tz, level, full);
      clearances[i] = cl.min;
      if (cl.min <= prev + 0.005) break;
    }
  }
  return clearances;
}

/* 单体让位：把采样点推到柱面 margin 之外。
   径向被墙挡住时改走切线（左右各试一次，取净距变大且仍在可行走区的一侧）。
   端点不动，平滑由后面的 smoothOffsets 负责，避免把落点挪走。 */
function avoidObstacles(pts, base, margin) {
  const N = pts.length - 1;
  for (let i = 1; i < N; i++) {
    const p = pts[i];
    const level = levelAtY(base[i].y);
    const edge = smooth01(Math.min(i, N - i) / Math.max(1, N * 0.05));
    if (edge <= 0) continue;
    for (let k = 0; k < 8; k++) {
      const o = obstacleRepel(p.x, p.z, base[i].y, level);
      if (!o || o.d >= margin) break;
      const push = Math.min(0.3, (margin - o.d) * 0.95) * edge;
      const qx = p.x + o.nx * push;
      const qz = p.z + o.nz * push;
      const qc = constrainWalk(qx, qz, level);
      if (qc && qc.d <= 0.002) {
        p.x = qx;
        p.z = qz;
        continue;
      }
      // 径向出界：沿柱面切线绕行
      let moved = false;
      for (const sign of [1, -1]) {
        const ax = p.x - o.nz * sign * push;
        const az = p.z + o.nx * sign * push;
        const ac = constrainWalk(ax, az, level);
        if (!ac || ac.d > 0.002) continue;
        const ad = obstacleDistance(ax, az, base[i].y, level);
        if (!ad || ad.d > o.d + 1e-4) {
          p.x = ax;
          p.z = az;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
  }
}

/* 平滑侧向修正，端点保持不动，避免把落点挪走 */
function smoothOffsets(base, pts, radius, passes) {
  const N = pts.length - 1;
  const ox = new Float32Array(N + 1);
  const oz = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    ox[i] = pts[i].x - base[i].x;
    oz[i] = pts[i].z - base[i].z;
  }
  ox[0] = oz[0] = ox[N] = oz[N] = 0;
  for (let pass = 0; pass < passes; pass++) {
    const sx = Float32Array.from(ox);
    const sz = Float32Array.from(oz);
    for (let i = 1; i < N; i++) {
      let ax = 0;
      let az = 0;
      let wsum = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = Math.max(0, Math.min(N, i + k));
        const w = 1 - Math.abs(k) / (radius + 1);
        ax += ox[j] * w;
        az += oz[j] * w;
        wsum += w;
      }
      sx[i] = ax / wsum;
      sz[i] = az / wsum;
    }
    ox.set(sx);
    oz.set(sz);
    ox[0] = oz[0] = ox[N] = oz[N] = 0;
  }
  for (let i = 0; i <= N; i++) {
    pts[i].x = base[i].x + ox[i];
    pts[i].z = base[i].z + oz[i];
  }
}

/* 竖向贴合地面：不低于地面 + 眼高，越界的坡道落差做平滑 */
function applyFloorHeight(pts, base) {
  const N = pts.length - 1;
  const floor = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const level = levelAtY(base[i].y);
    const c = constrainWalk(pts[i].x, pts[i].z, level);
    const fy = c ? c.y : 0;
    floor[i] = fy;
    // 相机严格贴地面走：路线点本来就等于地面 + 眼高，
    // 用 max 会在下坡段把镜头吊在空中
    pts[i].y = fy + EYE;
  }
  for (let pass = 0; pass < 2; pass++) {
    const sy = pts.map((p) => p.y);
    for (let i = 1; i < N; i++) {
      pts[i].y = (sy[i - 1] + sy[i] * 2 + sy[i + 1]) / 4;
    }
    pts[0].y = sy[0];
    pts[N].y = sy[N];
  }
  for (let i = 1; i < N; i++) {
    pts[i].y = Math.max(pts[i].y, floor[i] + 1.45);
  }
  pts[0].y = base[0].y;
  pts[N].y = base[N].y;
}

/* 净距 → 时间重映射：窄处慢、宽处快；两端交还给 easing */
function buildWarp(clearances) {
  const N = clearances.length - 1;
  const speed = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = smooth01((clearances[i] - 0.42) / 0.55);
    let f = 0.58 + 0.42 * t;
    const edge = Math.min(i, N - i) / Math.max(1, N * 0.09);
    if (edge < 1) f = 1 - (1 - f) * smooth01(edge);
    speed[i] = f;
  }
  const cum = new Float32Array(N + 1);
  for (let i = 1; i <= N; i++) {
    cum[i] = cum[i - 1] + 1 / Math.max(0.2, (speed[i] + speed[i - 1]) / 2);
  }
  const total = cum[N] || 1;
  for (let i = 0; i <= N; i++) cum[i] /= total;
  return (v) => {
    const t = Math.max(0, Math.min(1, v));
    let lo = 0;
    let hi = N;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    return (lo + (t - cum[lo]) / span) / N;
  };
}

/* 让位方向用附近所有单体障碍的合力，而不是只看最近的一根：
   成排的戏服 / 立柱会把单点推向邻居，来回振荡出不去。 */
function obstacleRepel(x, z, y, level) {
  let fx = 0;
  let fz = 0;
  let min = Infinity;
  let id = '';
  for (const o of WALK_OBSTACLES) {
    if (o.level && o.level !== level) continue;
    if (y < o.y0 - 0.15 || y > o.y1 + 0.15) continue;
    const dx = x - o.x;
    const dz = z - o.z;
    const r0 = Math.hypot(dx, dz) || 1e-6;
    const d = r0 - o.r;
    if (d < min) { min = d; id = o.id; }
    if (d < 1.2) {
      const w = (1.2 - d) / 1.2;
      fx += (dx / r0) * w;
      fz += (dz / r0) * w;
    }
  }
  const len = Math.hypot(fx, fz);
  return { d: min, nx: len > 1e-6 ? fx / len : 1, nz: len > 1e-6 ? fz / len : 0, id };
}

/* 到所有单体柱面的最小净距（没有障碍时为 Infinity） */
function obstacleClearance(x, z, y, level) {
  let min = Infinity;
  for (const o of WALK_OBSTACLES) {
    if (o.level && o.level !== level) continue;
    if (y < o.y0 - 0.15 || y > o.y1 + 0.15) continue;
    const d = Math.hypot(x - o.x, z - o.z) - o.r;
    if (d < min) min = d;
  }
  return min;
}

/* 最后一道硬保证：让每个采样顶点到柱面都 >= margin。
   局部斥力在成排障碍之间会振荡、又被端点权重压住，靠调参永远有漏网对；
   这里改成离散方向搜索：16 方向 × 7 档步长里挑「仍在可行走区、净距达标、
   离原路线最近」的落点，逐点收敛，端点 i=0/N 不动（落点保持原样）。
   相邻顶点间距约 0.3m；设 R = r + margin，弦上任意点到柱心至少
   sqrt(R² - (L/2)²)，内缩不到 0.05m，因此顶点达标即可保证按 0.1m
   采样落在弦上的点也达标，不必再逐弦修补单体障碍。 */
const CLEAR_DIRS = Array.from({ length: 16 }, (_, k) => {
  const a = (k / 16) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});
// 单次推距刻意压到 0.3m 内：一次推太远会拉出长弦，长弦会抄近路穿过柱体
const CLEAR_STEPS = [0.05, 0.1, 0.17, 0.25, 0.32];

function projectOutObstacles(pts, base, margin) {
  const N = pts.length - 1;
  for (let pass = 0; pass < 16; pass++) {
    let moved = 0;
    for (let i = 1; i < N; i++) {
      const p = pts[i];
      const level = levelAtY(p.y);
      if (obstacleClearance(p.x, p.z, p.y, level) >= margin) continue;
      let best = null;
      for (const s of CLEAR_STEPS) {
        for (const [dx, dz] of CLEAR_DIRS) {
          const qx = p.x + dx * s;
          const qz = p.z + dz * s;
          const c = constrainWalk(qx, qz, level);
          if (!c || c.d > 0.002) continue;
          // 相邻两条弦的 1/4 / 1/2 / 3/4 处也不能因此越出可行走区
          let chordsOk = true;
          for (const j of [i - 1, i]) {
            if (j < 0 || j >= N) continue;
            const a = pts[j];
            const b = pts[j + 1];
            const ax = j === i - 1 ? a.x : qx;
            const az = j === i - 1 ? a.z : qz;
            const bx = j === i ? b.x : qx;
            const bz = j === i ? b.z : qz;
            for (let k = 1; k <= 3; k++) {
              const t = k / 4;
              const qc = constrainWalk(ax + (bx - ax) * t, az + (bz - az) * t, level);
              if (!qc || qc.d > 0.02) { chordsOk = false; break; }
            }
            if (!chordsOk) break;
          }
          if (!chordsOk) continue;
          const d = obstacleClearance(qx, qz, p.y, level);
          if (d < margin) continue;
          const ref = base && base[i];
          const dev = ref ? Math.hypot(qx - ref.x, qz - ref.z) : s;
          const score = d - dev * 0.08;
          if (!best || score > best.score) best = { x: qx, z: qz, score };
        }
        if (best) break;
      }
      if (!best) continue;
      p.x = best.x;
      p.z = best.z;
      moved++;
    }
    if (!moved) break;
  }
}

/* 弦修补：measureSamples 会查相邻采样点之间的 1/4、1/2、3/4 处，
   让位造成的折角可能让这些中间点短暂越出可行走区。这里把折角两端
   按插值权重拉回区域内，端点固定不动，之后再验收就不会有漏网穿模。 */
function repairChords(pts) {
  const N = pts.length - 1;
  for (let pass = 0; pass < 4; pass++) {
    let fixed = 0;
    for (let i = 0; i < N; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const level = levelAtY((a.y + b.y) * 0.5);
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const c = constrainWalk(x, z, level);
        if (!c || c.d <= 0.012) continue;
        const dx = c.x - x;
        const dz = c.z - z;
        const wa = i === 0 ? 0 : t > 0.5 ? 0.9 : 0.6;
        const wb = i === N - 1 ? 0 : t > 0.5 ? 0.6 : 0.9;
        a.x += dx * wa;
        a.z += dz * wa;
        b.x += dx * wb;
        b.z += dz * wb;
        fixed++;
      }
    }
    if (!fixed) break;
  }
}

function measureSamples(pts, clearances) {
  const N = pts.length - 1;
  let clip = 0;
  let worstOut = 0;
  for (let i = 0; i <= N; i++) {
    const p = pts[i];
    const c = constrainWalk(p.x, p.z, levelAtY(p.y));
    if (!c || c.d > 0.02) {
      clip += 1;
      worstOut = Math.max(worstOut, c ? c.d : 9);
    }
  }
  // 采样点之间的弦也要查：两帧之间的穿墙同样算穿模
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const level = levelAtY(a.y);
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const c = constrainWalk(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, level);
      if (!c || c.d > 0.02) {
        clip += 1;
        worstOut = Math.max(worstOut, c ? c.d : 9);
      }
    }
  }
  let minClear = Infinity;
  // 细分后的点数会多于净距采样数，越界索引夹到最后一个有效读数
  for (let i = 2; i < N - 1; i++) {
    minClear = Math.min(minClear, clearances[Math.min(i, clearances.length - 1)]);
  }
  const doorOffsets = [];
  let doorMax = 0;
  let doorLabel = '';
  for (const g of DOOR_GATES) {
    // 找路径真正跨过门洞平面的那一点（相邻采样点插值），量它到中线的偏移。
    // 沿门洞平行走的路线（后台北侧走廊）不该被记成"偏离门中线 3m"。
    let crossing = null;
    for (let i = 1; i <= N; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (levelAtY((a.y + b.y) * 0.5) !== g.level) continue;
      const va = (g.axis === 'x' ? a.z : a.x) - g.gate;
      const vb = (g.axis === 'x' ? b.z : b.x) - g.gate;
      if (va === vb || va * vb > 0) continue;
      const t = va / (va - vb);
      const lat = (g.axis === 'x' ? a.x + (b.x - a.x) * t : a.z + (b.z - a.z) * t) - g.at;
      if (crossing === null || Math.abs(lat) < Math.abs(crossing)) crossing = lat;
    }
    if (crossing === null || Math.abs(crossing) > 1.0) continue;
    const m = +Math.abs(crossing).toFixed(2);
    doorOffsets.push({ label: g.label, offset: m });
    if (m > doorMax) {
      doorMax = m;
      doorLabel = g.label;
    }
  }
  return {
    minClearance: +minClear.toFixed(2),
    clipFrames: clip,
    frames: N + 1 + N * 3,
    worstOutside: +worstOut.toFixed(2),
    doorMax: +doorMax.toFixed(2),
    doorLabel,
    doorOffsets
  };
}

function buildSafePath(raw, fromPos, toPos) {
  const N = PATH_SAMPLES;
  const base = [];
  for (let i = 0; i <= N; i++) base.push(raw.getPointAt(i / N));
  base[0].copy(fromPos);
  base[N].copy(toPos);
  const pts = base.map((p) => p.clone());

  applyDoorGates(pts, base);
  enforceSafe(pts, base, SAFE_MARGIN, false);
  smoothOffsets(base, pts, 5, 3);
  // 先做单体让位并平滑，再交给最后一轮 enforceSafe 收口：
  // 它同时负责把点夹回可行走区（弦采样才不会穿墙），且探距已包含单体障碍
  avoidObstacles(pts, base, OBSTACLE_MARGIN);
  smoothOffsets(base, pts, 8, 3);
  const clearances = enforceSafe(pts, base, SAFE_MARGIN, true);
  applyFloorHeight(pts, base);
  repairChords(pts);
  // 弦修补 / 局部让位都可能留下个别贴柱的点，最后做确定性硬投影收口
  projectOutObstacles(pts, base, OBSTACLE_MARGIN);

  const path = new ArcPath(pts);
  return { path, warp: buildWarp(clearances), metrics: measureSamples(pts, clearances) };
}

export class Tour {
  constructor({ camera, rig, world, onPhase, onEntered, onArrived }) {
    this.camera = camera;
    this.rig = rig;
    this.world = world;
    this.onPhase = onPhase;
    this.onEntered = onEntered;
    this.onArrived = onArrived;
    this.playing = false;
    this.started = false;
    this.progress = 0;
    this.travelTween = null;
    // 竖屏单独取景：转场与落点都把视线压平，避免一抬头就只剩吊灯
    this.portrait = false;

    /* 玻璃球 / 鸟瞰台的「跟着走」数据源：每帧由 travelTo 写入，
       与相机同源， orb.js 只做严格同步，不做二次插值。
       point  = path.getPointAt(u)，即 travelTo 实际路径采样点；
       yaw    = 该处水平切线，已归一到 (-180°,180°]；
       path/u = 留给验收脚本独立复算，避免自证。 */
    this.follow = {
      enabled: false,      // 第一次转场后恒为 true：球内保持当前站点视角
      traveling: false,
      from: null,
      to: null,
      u: 0,
      point: new THREE.Vector3(),
      tangent: new THREE.Vector2(0, -1),
      yaw: 0,              // 前方 1.6m 弧长窗口的行进朝向，已短弧归一
      localYaw: 0,         // 瞬时局部切线，仅作锯齿诊断对照
      pitch: FOLLOW_PITCH, // 恒定俯角：俯仰不摆动
      path: null
    };
  }

  /* 竖屏落点：保持机位与朝向，把注视点压到接近水平，
     让地面、主体与顶部同时进画面；横屏原样返回 */
  restLook(pos, look) {
    if (!this.portrait) return look.clone();
    const dx = look.x - pos.x;
    const dz = look.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return look.clone();
    const pitch = 0.045;
    return new THREE.Vector3(pos.x + dx, pos.y + Math.tan(pitch) * dist, pos.z + dz);
  }

  // 由注视点求水平朝向（俯仰归零）
  static yawOf(pos, look) {
    const dx = look.x - pos.x;
    const dz = look.z - pos.z;
    if (Math.hypot(dx, dz) < 1e-5) return 0;
    return Math.atan2(-dx, -dz);
  }

  // 落点俯仰：横屏用原注视点，竖屏用压平后的注视点
  static pitchOf(pos, look) {
    const d = new THREE.Vector3().subVectors(look, pos);
    const len = d.length();
    if (len < 1e-5) return 0;
    return Math.max(-0.24, Math.min(0.3, Math.asin(d.y / len)));
  }

  // 推门 → 穿过门洞 → 落入门厅
  start() {
    if (this.started) return;
    this.started = true;
    this.playing = true;
    this.onPhase?.('cinematic');

    const startPos = this.camera.position.clone();
    // 竖屏：入场一路走到长廊中段，让拱门帷幔成为落点主体
    const portrait = this.portrait;
    const endPos = portrait ? PORTRAIT_POSE.foyer.position : [0, 1.64, -3.0];
    const endLookRaw = portrait ? PORTRAIT_POSE.foyer.target : [0, 4.15, -16.0];
    const path = new THREE.CatmullRomCurve3(
      [
        startPos,
        new THREE.Vector3(0, 1.62, 5.2),
        new THREE.Vector3(0, 1.63, 2.3),
        new THREE.Vector3(0, 1.635, 0.35),
        new THREE.Vector3(0, 1.64, -1.9),
        new THREE.Vector3(0, 1.64, portrait ? -4.6 : -2.6),
        ...(portrait ? [new THREE.Vector3(0, 1.64, -7.8), new THREE.Vector3(0, 1.64, -11.2)] : []),
        new THREE.Vector3(...endPos)
      ],
      false,
      'centripetal'
    );

    const lookPath = new THREE.CatmullRomCurve3(
      this.portrait
        ? [
            new THREE.Vector3(0, 2.2, 0.3),
            new THREE.Vector3(0, 2.1, -2.4),
            new THREE.Vector3(0, 2.0, -7.0),
            new THREE.Vector3(0, 2.0, -12.0),
            new THREE.Vector3(...endLookRaw)
          ]
        : [
            new THREE.Vector3(0, 2.7, 0.3),
            new THREE.Vector3(0, 2.95, -2.4),
            new THREE.Vector3(0, 3.55, -6.8),
            new THREE.Vector3(0, 4.02, -12.0),
            new THREE.Vector3(0, 4.15, -16.0)
          ],
      false,
      'centripetal'
    );

    const look = new THREE.Vector3();

    tween({
      duration: 1.75,
      delay: 0.08,
      ease: easeInOutCubic,
      onUpdate: (v) => this.world.entrance.setOpen(v)
    });

    tween({
      duration: 2.5,
      delay: 0.45,
      ease: easeInOutSine,
      onUpdate: (v) => this.world.setInterior(0.32 + 0.68 * v)
    });

    tween({
      duration: 2.2,
      delay: 0.35,
      ease: easeInOutSine,
      onUpdate: (v) => this.world.setExterior(1 - 0.72 * v)
    });

    tween({
      duration: portrait ? 4.9 : 3.55,
      delay: 0.55,
      ease: easeInOutCubic,
      onUpdate: (v) => {
        this.progress = v;
        const p = path.getPoint(v);
        this.camera.position.copy(p);
        look.copy(lookPath.getPoint(v));
        this.camera.lookAt(look);
      },
      onComplete: () => {
        this.playing = false;
        this.progress = 1;
        const finalPos = new THREE.Vector3(...endPos);
        const finalLook = this.restLook(finalPos, new THREE.Vector3(...endLookRaw));
        this.camera.position.copy(finalPos);
        this.camera.lookAt(finalLook);
        this.rig.setPose(finalPos, finalLook);
        this.rig.setEnabled(true);
        this.onPhase?.('explore');
        this.onArrived?.('foyer');
        this.onEntered?.();
      }
    });
  }

  /* 由当前机位生成一次转场的全部数据：候选曲线 + 避让后的采样路径。
     不改变 playing 状态，供 travelTo 与验收测量共用。 */
  buildTravel(id, route = null) {
    const nav = NAV[id];
    const stop = STOP_BY_ID[id];
    const target = nav || (stop && stop.ready ? { pose: stop.pose, via: [], bounds: stop.bounds } : null);
    if (!target || !target.pose) return null;

    const fromPos = this.camera.position.clone();
    const fromDir = this.camera.getWorldDirection(new THREE.Vector3());
    const fromYaw = Math.atan2(-fromDir.x, -fromDir.z);
    const fromPitch = this.camera.rotation.x;
    const toPos = new THREE.Vector3(...((this.portrait && PORTRAIT_POSE[id]?.position) || target.pose.position));
    const toLook = this.restLook(
      toPos,
      new THREE.Vector3(...((this.portrait && PORTRAIT_POSE[id]?.target) || target.pose.target))
    );
    const toYaw = Tour.yawOf(toPos, toLook);
    const destPitch = Tour.pitchOf(toPos, toLook);

    const explicit = Array.isArray(route) && route.length > 0;
    const forward = toPos.z < fromPos.z;
    // 地面层之间移动时不绕上二楼；只有上楼或从楼座下来才走楼梯段
    const highPath = fromPos.y > 3.4 || toPos.y > 3.4;
    const via = explicit
      ? route.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
      : (target.via || [])
        .filter((p) => highPath || p[1] < 3.4)
        .filter(([, , z]) => (forward ? z < fromPos.z - 0.4 && z > toPos.z + 0.4 : z > fromPos.z + 0.4 && z < toPos.z - 0.4))
        .map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (!explicit && !forward) via.reverse();

    const points = [fromPos, ...via, toPos];
    let raw = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    raw.arcLengthDivisions = 320;
    // 下层通道进深较浅，去重后可能只剩很少点；退化时用直线段兜底
    if (points.length < 3) raw = new THREE.LineCurve3(fromPos, toPos);

    const safe = buildSafePath(raw, fromPos, toPos);
    return {
      id,
      fromPos,
      toPos,
      toLook,
      fromYaw,
      fromPitch,
      toYaw,
      destPitch,
      path: safe.path,
      warp: safe.warp,
      metrics: safe.metrics
    };
  }

  /* 验收用：从某个站点出发，返回该段转场的净距与穿模读数 */
  debugRoute(fromId, toId) {
    const from = NAV[fromId] || STOP_BY_ID[fromId];
    if (!from || !from.pose) return null;
    const savedPos = this.camera.position.clone();
    const savedRot = this.camera.rotation.clone();
    const savedPortrait = this.portrait;
    this.portrait = false;
    this.camera.position.set(...from.pose.position);
    const look = new THREE.Vector3(...(from.pose.target || from.pose.position));
    this.camera.lookAt(look);
    const plan = this.buildTravel(toId, routeBetween(fromId, toId));
    this.camera.position.copy(savedPos);
    this.camera.rotation.copy(savedRot);
    this.portrait = savedPortrait;
    if (!plan) return null;
    return {
      from: fromId,
      to: toId,
      length: +plan.path.length.toFixed(2),
      duration: +Math.min(7.2, Math.max(2.4, plan.path.length / 3.0)).toFixed(2),
      ...plan.metrics
    };
  }

  // 后续阶段：沿主动线走向下一个停靠点；显式 route 时按给定点走，不做朝向过滤
  travelTo(id, route = null) {
    if (this.playing) return false;
    const plan = this.buildTravel(id, route);
    if (!plan) return false;

    this.playing = true;
    this.onPhase?.('cinematic');

    const { path, warp, fromYaw, fromPitch, toYaw, destPitch, toPos, toLook } = plan;
    const duration = Math.min(7.2, Math.max(2.4, path.length / 3.0));

    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pT0 = new THREE.Vector3();
    const pT1 = new THREE.Vector3();
    const pT2 = new THREE.Vector3();
    const pT3 = new THREE.Vector3();

    /* 球内视点数据源：起点就用路径 u=0 的采样点与切线，
       之后每个补间帧同步写一次，转场结束锁到 u=1。 */
    const follow = this.follow;
    follow.enabled = true;
    follow.traveling = true;
    follow.from = null;
    follow.to = id;
    follow.u = 0;
    follow.path = path;
    follow.pitch = FOLLOW_PITCH;
    path.getPointAt(0, pA);
    follow.point.copy(pA);
    const tStart = tangentAt(path, 0, pT0, pT1, pT2, pT3);
    if (tStart) {
      follow.yaw = tStart.yaw;
      follow.localYaw = tStart.localYaw;
      follow.tangent.set(tStart.dx, tStart.dz);
    }

    /* 水平朝向：主旋转恒为「起点朝向 → 站点朝向」的短圈，累计转角
       恒等于 |normAngleDelta(toYaw - fromYaw)| <= 180°。
       旧版把路径切线做连续解缠，yaw 会累积到 400°+，收尾再硬跳回站点
       朝向，观感就是先原地转一整圈再前进（corridor→foyer 净转角 0°
       却转了 360°）。现在每一段拼接都逐段归一，切线只作为两端归零的
       有限前瞻，不再主导朝向；每帧的 yaw 也收回 (-180°,180°]。 */
    const SAMPLES = 48;
    const netDelta = normAngleDelta(toYaw - fromYaw);
    const tangentYaw = new Array(SAMPLES + 1);
    tangentYaw[0] = fromYaw;
    for (let i = 1; i <= SAMPLES; i++) {
      const u = i / SAMPLES;
      path.getPointAt(Math.min(1, u), pA);
      path.getPointAt(Math.min(1, u + 0.004), pB);
      const dx = pB.x - pA.x;
      const dz = pB.z - pA.z;
      // 只取 XZ 切线，绝不带 y 分量，爬坡上楼不会把镜头抬起来
      const target = Math.hypot(dx, dz) > 1e-4 ? Math.atan2(-dx, -dz) : tangentYaw[i - 1];
      tangentYaw[i] = normAngleDelta(tangentYaw[i - 1] + normAngleDelta(target - tangentYaw[i - 1]));
    }
    // 前瞻幅度上限：切线再怎么绕，也不会把镜头带出短圈预算
    const LEAD_MAX = 0.42;
    const LEAD_W = 0.45;
    const endYaw = toYaw;

    this.rig.setEnabled(false);
    const levelStart = performance.now();

    tween({
      duration,
      ease: easeInOutCubic,
      onUpdate: (v) => {
        // 净距重映射：窄处减速通过，宽处回升；两端仍由 easing 收住
        const u = warp(v);
        path.getPointAt(u, pA);
        this.camera.position.copy(pA);

        // 球内视点严格取同一个采样点，朝向取该处水平切线（短弧归一）
        follow.u = u;
        follow.point.copy(pA);
        const tan = tangentAt(path, u, pT0, pT1, pT2, pT3);
        if (tan) {
          follow.yaw = tan.yaw;
          follow.localYaw = tan.localYaw;
          follow.tangent.set(tan.dx, tan.dz);
        }

        const f = Math.min(1, Math.max(0, u)) * SAMPLES;
        const i0 = Math.floor(f);
        const i1 = Math.min(SAMPLES, i0 + 1);
        // 相邻切线采样之间同样用短圈差值插值，多段拼接不绕远路
        const seg = normAngleDelta(tangentYaw[i1] - tangentYaw[i0]);
        const pathYaw = tangentYaw[i0] + seg * (f - i0);

        const base = fromYaw + netDelta * smooth01(u);
        const lead = Math.max(-LEAD_MAX, Math.min(LEAD_MAX, normAngleDelta(pathYaw - base)))
          * LEAD_W * Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
        const yaw = normAngleDelta(base + lead);

        // 前 0.32 秒把残余俯仰抹平，之后整段行进严格水平（与缓动进度无关）
        const level = (performance.now() - levelStart) / 1000;
        const pitch = fromPitch * (1 - smooth01(level / 0.32));
        this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
      },
      onComplete: () => {
        this.camera.position.copy(toPos);
        this.camera.rotation.set(0, endYaw, 0, 'YXZ');
        // 球内视点精确落到目标站点：u=1 的路径采样点，朝向仍是末端切线，
        // 不用阻尼追赶，也不回弹到展示机位，杜绝落点漂移。
        follow.traveling = false;
        follow.u = 1;
        path.getPointAt(1, pA);
        follow.point.copy(pA);
        const tanEnd = tangentAt(path, 1, pT0, pT1, pT2, pT3);
        if (tanEnd) {
          follow.yaw = tanEnd.yaw;
          follow.localYaw = tanEnd.localYaw;
          follow.tangent.set(tanEnd.dx, tanEnd.dz);
        }
        // 到达后用极短的过渡把水平视线升/压到该站的正式注视点
        tween({
          duration: 0.28,
          ease: (t) => 1 - Math.pow(1 - t, 3),
          onUpdate: (t) => this.camera.rotation.set(destPitch * t, endYaw, 0, 'YXZ'),
          onComplete: () => {
            this.playing = false;
            this.rig.eyeHeight = toPos.y;
            this.rig.setPose(toPos, toLook);
            this.rig.setEnabled(true);
            this.onArrived?.(id);
            this.onPhase?.('explore');
          }
        });
      }
    });

    return true;
  }
}

export { updateTweens };
