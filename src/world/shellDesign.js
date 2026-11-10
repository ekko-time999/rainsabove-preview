import * as THREE from 'three';
import { SHELL, hipRoofGeometry, gableRoofGeometry } from './shell.js';
import { BoxBatch, mergeStatic, archBandGeometry } from './utils.js';

/* ============================================================
   外形备选体量（对比用）
   - A：古典端景。不对称立面，成组壁龛与雕像体块，
     灰蓝石板穹顶 + 香槟金肋，顶部采光亭带尖顶
   - B：竖向张力。米色石灰岩基座，塔楼阶梯收分，
     竖向凹槽肋，几何金色窗框与檐口，石墨黑屋面
   - 两案共用同一套内部体量轮廓（SHELL），只替换外皮、屋顶与配色
   - 屋面与金属构件一律不使用铜绿
   ============================================================ */

const PALETTE_A = {
  stone: 0x8f887b,
  stoneLight: 0xaba292,
  stoneDark: 0x453f36,
  roof: 0x42505f,
  roofDeep: 0x36424f,
  roofEmissive: 0x1c2732,
  dome: 0x45596b,
  warm: 0xffb070
};

const PALETTE_B = {
  stone: 0xbfae92,
  stoneLight: 0xd2c3a8,
  stoneDark: 0x6b6357,
  roof: 0x353b44,
  roofDeep: 0x2b3038,
  roofEmissive: 0x171c23,
  dome: 0x3c434d,
  warm: 0xffc184
};

// 定稿版 C：骨架沿用 A 的不对称三段式，石材与屋面取 B 的暖米色 + 石墨黑
const PALETTE_C = {
  stone: 0xbfae92,
  stoneLight: 0xd2c3a8,
  stoneDark: 0x5f574c,
  // 竖肋与鼓座单独压暗，避免在暖洗光下变成第二亮区
  stoneRib: 0x38332b,
  stoneWing: 0x9a8b74,
  stoneDrum: 0x534c41,
  roof: 0x373d45,
  roofDeep: 0x24282e,
  roofEmissive: 0x161a20,
  dome: 0x30363e,
  warm: 0xffc184
};

export const SHELL_SCHEMES = ['a', 'b', 'c'];

export function buildDesignShell(scene, mats, quality, schemeId = 'c') {
  const id = SHELL_SCHEMES.includes(schemeId) ? schemeId : 'c';
  const P = id === 'b' ? PALETTE_B : (id === 'c' ? PALETTE_C : PALETTE_A);
  const B = id === 'b';
  const C = id === 'c';

  const group = new THREE.Group();
  group.name = `shell-${id}`;
  scene.add(group);

  const lightRig = new THREE.Group();
  lightRig.name = `shell-light-${id}`;
  scene.add(lightRig);

  const owned = [];

  function std(color, roughness, metalness, emissive, ei = 1) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: new THREE.Color(emissive),
      emissiveIntensity: ei,
      side: THREE.DoubleSide
    });
    owned.push(m);
    return m;
  }

  const M = {
    stone: std(P.stone, 0.94, 0.02, 0x1a1410, 0.45),
    stoneLight: std(P.stoneLight, 0.88, 0.03, 0x1e1710, 0.4),
    stoneDark: std(P.stoneDark, 0.95, 0.02, 0x100c07, 0.35),
    rib: std(P.stoneRib ?? P.stoneDark, 0.98, 0.0, 0x090705, 0.16),
    wing: std(P.stoneWing ?? P.stone, 0.96, 0.02, 0x120e09, 0.26),
    drum: std(P.stoneDrum ?? P.stoneLight, 0.96, 0.02, 0x0d0a07, 0.2),
    roof: std(P.roof, 0.62, 0.12, P.roofEmissive, 0.9),
    roofDeep: std(P.roofDeep, 0.58, 0.14, P.roofEmissive, 0.9),
    dome: std(P.dome, 0.5, 0.16, P.roofEmissive, 0.9),
    gold: mats.gold,
    goldDeep: mats.goldDeep,
    brass: mats.brass
  };

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);

  // 定稿版 C：屋面按坡向做明度分档，俯视时读的是面而不是一条勾边
  const roofTone = C ? std(P.roof, 0.62, 0.12, P.roofEmissive, 0.9) : null;
  if (roofTone) roofTone.vertexColors = true;

  function toneRoofGeometry(geo) {
    const g = geo.toNonIndexed();
    const pos = g.attributes.position;
    const colors = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
      // 东坡略亮、西坡压暗、南北歇山居中：一顶四坡，俯视有明确的面差
      let v = 0.86;
      if (n.x > 0.3) v = 1;
      else if (n.x < -0.3) v = 0.62;
      else if (n.z > 0) v = 0.8;
      else v = 0.68;
      for (let k = 0; k < 3; k++) colors.push(v, v, v);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }

  const wallGlowDim = new THREE.MeshBasicMaterial({ color: 0x2c1a0e, toneMapped: false });
  const wallGlowMid = new THREE.MeshBasicMaterial({ color: 0x7a4a22, toneMapped: false });
  const wallGlowHot = new THREE.MeshBasicMaterial({ color: 0xc08247, toneMapped: false });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const glowMats = [
    { mat: wallGlowDim, base: 0x2c1a0e },
    { mat: wallGlowMid, base: 0x7a4a22 },
    { mat: wallGlowHot, base: 0xc08247 }
  ];

  const windows = [];
  const uplights = [];

  function addWindow(x, y, z, w, h, nx, lit = 0.3) {
    windows.push({ x, y, z, w, h, nx, lit });
  }

  function box(w, h, d, x, y, z, mat = M.stone, ry = 0, rz = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function roof(w, d, h, inset, x, y, z, mat = M.roof) {
    const toned = C && mat === M.roof;
    const geo = toned ? toneRoofGeometry(hipRoofGeometry(w, d, h, inset)) : hipRoofGeometry(w, d, h, inset);
    const mesh = new THREE.Mesh(geo, toned ? roofTone : mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function prism(w, h, depth, x, y, z, mat = M.stone) {
    // 山花 / 三角楣：等腰三角截面沿 z 挤出
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  function pyramid(w, h, x, y, z, mat = M.roof, seg = 4) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(w, h, seg), mat);
    mesh.rotation.y = Math.PI / 4;
    mesh.position.set(x, y + h / 2, z);
    group.add(mesh);
    return mesh;
  }

  function ring(r, tube, y, z, mat = M.brass, seg = 44) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg), mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(0, y, z);
    group.add(mesh);
    return mesh;
  }

  function finial(x, y, z, h = 0.8) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, h, 8), M.brass);
    cone.position.set(x, y + h / 2, z);
    group.add(cone);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.brass);
    ball.position.set(x, y + h + 0.06, z);
    group.add(ball);
  }

  function up(x, y, z, tx, ty, tz, intensity, angle = 0.6, distance = 30) {
    const light = new THREE.SpotLight(P.warm, intensity, distance, angle, 0.9, 2);
    light.position.set(x, y, z);
    const target = new THREE.Object3D();
    target.position.set(tx, ty, tz);
    light.target = target;
    lightRig.add(light, target);
    uplights.push({ light, base: intensity });
    return light;
  }

  function glowBar(w, h, d, x, y, z, mat, level = 0.3) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.userData.shellGlow = level;
    group.add(mesh);
    return mesh;
  }

  /* 门洞暖光：只允许门套内侧两条窄光带，绝不允许整幅衬板。
     历史上这里是一块 4.6×4.1 的整幅暖光板，从门厅往外看就是一堵墙；
     光带内缘到中线的距离在构建时断言，避免以后改尺寸又把门洞封死。
     光带用 userData 标记，验收脚本可以直接按构件查，而不是靠名字猜。 */
  function doorGlowBands({ half, band, height, y, z, mat, level }) {
    const innerEdge = half - band / 2;
    if (!(innerEdge > 0.05)) {
      throw new Error(`door glow bands seal the doorway centreline: half=${half} band=${band}`);
    }
    for (const sign of [-1, 1]) {
      const mesh = glowBar(band, height, 0.08, sign * half, y, z, mat, level);
      mesh.userData.doorGlowBand = { half, band, innerEdge: +innerEdge.toFixed(3) };
      // 不参与静态合批：保留成可查的独立构件，验收脚本能直接列包围盒
      mesh.userData.noMerge = true;
    }
  }

  const F = SHELL.FRONT;
  const L = SHELL.LINK;
  const HS = SHELL.HOUSE;
  const T = SHELL.STAGE;
  const BK = SHELL.BACK;
  const W = SHELL.WORKSHOP;
  const O = SHELL.OFFICE;
  const SC = SHELL.SCREEN;
  const D = SHELL.DOCK;
  const SD = SHELL.STAGE_DOOR;

  /* ---------- 基座：只做外圈，不铺满内部地坪 ----------
     frontGap：入口段基座在门洞范围断开，避免在门槛处形成一道横墙 */
  function plinth(z0, z1, half, h, mat = M.stoneDark, frontGap = 0, rearGap = null) {
    const d = z0 - z1 + 0.5;
    const zm = (z0 + z1) / 2;
    const zf = z0 + 0.15;
    const span = half * 2 + 0.6;
    const band = (w, x, z) => {
      if (w < 0.25) return;
      box(w, h, 0.7, x, h / 2, z, mat);
      goldDeep.add(w + 0.12, 0.08, 0.78, x, h + 0.04, z);
    };
    if (frontGap > 0) {
      const w = half + 0.3 - frontGap;
      for (const sign of [-1, 1]) band(w, sign * (frontGap + half + 0.3) / 2, zf);
    } else {
      band(span, 0, zf);
    }
    // 后侧基座带可在门洞处断开（rearGap = [x0, x1]，局部 x 坐标）
    if (rearGap) {
      const [g0, g1] = rearGap;
      const xa0 = -half - 0.3;
      const xb1 = half + 0.3;
      band(g0 - xa0, (xa0 + g0) / 2, z1 - 0.15);
      band(xb1 - g1, (g1 + xb1) / 2, z1 - 0.15);
    } else {
      band(span, 0, z1 - 0.15);
    }
    for (const sign of [-1, 1]) {
      box(0.7, h, d, sign * (half + 0.2), h / 2, zm, mat);
    }
    for (const sign of [-1, 1]) {
      goldDeep.add(0.78, 0.08, d, sign * (half + 0.2), h + 0.04, zm);
    }
  }

  function flatRoof(w, d, x, y, z, thick = 0.3, mat = M.roofDeep) {
    box(w, thick, d, x, y + thick / 2, z, mat);
    goldDeep.add(w + 0.12, 0.1, 0.14, x, y + thick + 0.05, z + d / 2);
    goldDeep.add(w + 0.12, 0.1, 0.14, x, y + thick + 0.05, z - d / 2);
    goldDeep.add(0.14, 0.1, d + 0.1, x - w / 2, y + thick + 0.05, z);
    goldDeep.add(0.14, 0.1, d + 0.1, x + w / 2, y + thick + 0.05, z);
  }

  /* ---------- 连廊、放映厅凸出体量 ---------- */
  function buildLink() {
    const lMid = (L.z0 + L.z1) / 2;
    for (const sign of [-1, 1]) {
      if (sign < 0) continue;
      box(0.55, L.eave, L.z0 - L.z1, sign * L.half, L.eave / 2, lMid);
      for (const z of [-19.6, -23.2, -26.8]) {
        addWindow(sign * (L.half + 0.28), 5.3, z, 1.2, 2.2, sign, z === -23.2 ? 0.2 : 0.05);
      }
    }
    // 放映厅：连廊西侧凸出的二层体量
    const sMidZ = (SC.z0 + SC.z1) / 2;
    box(0.5, SC.top, SC.z1 - SC.z0, SC.x0, SC.top / 2, sMidZ);
    box(SC.x1 - SC.x0 + 0.5, SC.top, 0.5, (SC.x0 + SC.x1) / 2, SC.top / 2, SC.z0);
    box(SC.x1 - SC.x0 + 0.5, SC.top, 0.5, (SC.x0 + SC.x1) / 2, SC.top / 2, SC.z1);
    for (const z of [-24.6, -26.2, -27.8]) {
      addWindow(SC.x0 - 0.26, 5.5, z, 1.05, 1.9, -1, z === -26.2 ? 0.24 : 0.05);
    }
    if (B) flatRoof(SC.x1 - SC.x0 + 0.9, SC.z1 - SC.z0 + 0.9, (SC.x0 + SC.x1) / 2, SC.top, sMidZ, 0.26);
    else roof(SC.x1 - SC.x0 + 0.9, SC.z1 - SC.z0 + 0.9, 0.9, 0.4, (SC.x0 + SC.x1) / 2, SC.top, sMidZ);
    // 连廊西墙两段
    for (const [za, zb] of [[L.z0, SC.z1], [SC.z0, L.z1]]) {
      box(0.55, L.eave, za - zb, -L.half, L.eave / 2, (za + zb) / 2);
    }
    // 与观众厅交接回墙
    for (const sign of [-1, 1]) {
      box(HS.half - L.half, L.eave, 0.55, sign * (HS.half + L.half) / 2, L.eave / 2, L.z1);
    }
    // 东侧檐口
    for (const z of [-18.4, -21.2, -24.6, -27.6, -29.6]) {
      box(0.34, 6.9, 0.4, L.half + 0.16, 4.85, z, M.stoneLight);
    }
    gold.add(L.half * 2 + 0.7, 0.14, 0.2, 0, L.eave - 0.12, L.z0 + 0.02);
    if (B) {
      flatRoof(L.half * 2 + 0.7, L.z0 - L.z1 + 0.4, 0, L.eave, lMid, 0.26);
    } else {
      roof(L.half * 2 + 0.7, L.z0 - L.z1 + 0.5, L.ridge - L.eave, L.inset, 0, L.eave, lMid);
      for (const z of [-19.8, -23.4, -27.0]) {
        glowBar(0.28, 0.5, 2.0, 0, L.ridge + 0.2, z, wallGlowDim, 0.3);
        goldDeep.add(0.34, 0.1, 2.2, 0, L.ridge + 0.02, z);
      }
    }
  }

  /* ---------- 观众厅外墙（沿用内部外弧轮廓） ----------
     只生成左右两条侧墙带：原先整环 + 内缩孔的做法在两端与外形共线，
     孔洞被三角剖分丢弃，外壳变成实心体，把走廊尽端与台口都封死。
     侧墙带各自闭合，两端敞开，走廊与观众厅、观众厅与舞台直接连通。 */
  function buildHouseWall() {
    const curveSeg = 22;
    const insetW = 0.62;
    const outerX = (z) => {
      const t = (z - HS.z0) / (HS.z1 - HS.z0);
      return HS.half + HS.bow * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
    };
    for (const sign of [-1, 1]) {
      const strip = new THREE.Shape();
      const pts = [];
      for (let i = 0; i <= curveSeg; i++) {
        const t = i / curveSeg;
        const z = HS.z0 + (HS.z1 - HS.z0) * t;
        pts.push([outerX(z), -z]);
      }
      strip.moveTo(sign * pts[0][0], pts[0][1]);
      for (let i = 1; i <= curveSeg; i++) strip.lineTo(sign * pts[i][0], pts[i][1]);
      strip.lineTo(sign * (pts[curveSeg][0] - insetW), pts[curveSeg][1]);
      for (let i = curveSeg - 1; i >= 0; i--) strip.lineTo(sign * (pts[i][0] - insetW), pts[i][1]);
      strip.closePath();
      const geo = new THREE.ExtrudeGeometry(strip, {
        depth: HS.eave,
        bevelEnabled: false,
        curveSegments: 18
      });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, M.stone);
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // 尾端与台口回墙：只做两侧翼墙，中间留给走廊和台口
    for (const sign of [-1, 1]) {
      box(HS.half - L.half + 0.3, HS.eave, 0.5, sign * (HS.half + L.half) / 2, HS.eave / 2, HS.z0);
      box(HS.half - T.towerHalf + 0.2, HS.eave, 0.5, sign * (HS.half + T.towerHalf) / 2, HS.eave / 2, HS.z1);
    }
    box(HS.half * 2, HS.eave - L.eave, 0.5, 0, (HS.eave + L.eave) / 2, HS.z0);

    // 外弧上的竖向壁柱、窗、金线
    const segments = 14;
    const sideX = (z) => HS.half + HS.bow * Math.sin(Math.PI * ((z - HS.z0) / (HS.z1 - HS.z0)));
    for (const sign of [-1, 1]) {
      for (let i = 0; i < segments; i++) {
        const za = HS.z0 + (HS.z1 - HS.z0) * (i / segments);
        const zb = HS.z0 + (HS.z1 - HS.z0) * ((i + 1) / segments);
        const xa = sign * sideX(za);
        const xb = sign * sideX(zb);
        const yaw = Math.atan2(xb - xa, zb - za);
        const len = Math.hypot(xb - xa, zb - za) + 0.05;
        goldDeep.add(0.34, 0.2, len, (xa + xb) / 2 + sign * 0.16, 4.2, (za + zb) / 2, yaw);
        goldDeep.add(0.22, 0.08, len, (xa + xb) / 2 + sign * 0.1, 6.5, (za + zb) / 2, yaw);
      }
      for (const z of [-33.4, -36.6, -39.8, -43.0, -45.2]) {
        const x = sign * (sideX(z) + 0.02);
        addWindow(x, 2.6, z, 1.3, 3.1, sign, z === -42.8 ? 0.24 : 0.04);
        addWindow(x, 8.1, z, 1.2, 2.6, sign, z === -39.8 ? 0.13 : 0.03);
      }
      for (const z of [-31.8, -34.8, -38.0, -41.2, -44.4, -46.4]) {
        const xa = sign * sideX(z - 0.4);
        const xb = sign * sideX(z + 0.4);
        const yaw = Math.atan2(xb - xa, 0.8);
        box(0.36, 11.4, 0.42, sign * (sideX(z) + 0.18), 6.3, z, M.stoneLight, yaw);
      }
      gold.add(0.6, 0.16, HS.z0 - HS.z1, sign * (HS.half + 0.1), HS.wallTop - 0.12, (HS.z0 + HS.z1) / 2);
    }
    plinth(HS.z0, HS.z1, HS.half - 0.15, 0.9);
    return outerX;
  }

  /* ---------- 观众厅屋顶：A 石板穹顶 + 金肋 + 尖顶采光亭 / B 石墨穹顶 + 金环 ---------- */
  function buildHouseRoof() {
    const zc = HS.drumZ;
    if (!B) {
      roof(HS.half * 2 + 1.0, HS.z0 - HS.z1 + 0.8, 1.7, 5.4, 0, HS.wallTop, (HS.z0 + HS.z1) / 2);
      // 定稿版 C：鼓座压暗一档，上下各加一道深石带，把暖色亮带收窄
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(HS.drumR, HS.drumR + 0.18, HS.drumTop - HS.wallTop, 40),
        C ? M.drum : M.stoneLight
      );
      drum.position.set(0, (HS.drumTop + HS.wallTop) / 2, zc);
      group.add(drum);
      if (C) {
        const drumBase = new THREE.Mesh(
          new THREE.CylinderGeometry(HS.drumR + 0.16, HS.drumR + 0.22, 0.95, 40),
          M.stoneDark
        );
        drumBase.position.set(0, HS.wallTop + 0.475, zc);
        group.add(drumBase);
        const drumCap = new THREE.Mesh(
          new THREE.CylinderGeometry(HS.drumR - 0.02, HS.drumR + 0.04, 0.42, 40),
          M.stoneDark
        );
        drumCap.position.set(0, HS.drumTop - 0.21, zc);
        group.add(drumCap);
      }
      ring(HS.drumR + 0.1, 0.09, HS.drumTop - 0.06, zc);
      ring(HS.drumR + 0.1, 0.07, HS.wallTop + 0.24, zc, M.goldDeep);
      // 鼓座窗
      const drumWin = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.5, 0.8), winMat, 16);
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const cc = new THREE.Color();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        q.setFromEuler(new THREE.Euler(0, a, 0));
        m4.compose(
          new THREE.Vector3(Math.sin(a) * (HS.drumR + 0.04), (HS.wallTop + HS.drumTop) / 2, zc + Math.cos(a) * (HS.drumR + 0.04)),
          q,
          new THREE.Vector3(1, 1, 1)
        );
        drumWin.setMatrixAt(i, m4);
        const v = i % 3 === 0 ? 0.14 : 0.07;
        cc.setRGB(v, v * 0.62, v * 0.3);
        drumWin.setColorAt(i, cc);
      }
      drumWin.instanceMatrix.needsUpdate = true;
      group.add(drumWin);

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(HS.drumR, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2),
        M.dome
      );
      dome.scale.set(1, 0.66, 1);
      dome.position.set(0, HS.drumTop, zc);
      group.add(dome);
      // 香槟金经肋 + 一道纬环
      const apexY = HS.drumTop + HS.drumR * 0.66;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const pts = [];
        for (let k = 0; k <= 10; k++) {
          const th = (k / 10) * (Math.PI / 2);
          pts.push(new THREE.Vector3(
            Math.sin(a) * HS.drumR * Math.cos(th),
            HS.drumTop + HS.drumR * 0.66 * Math.sin(th),
            zc + Math.cos(a) * HS.drumR * Math.cos(th)
          ));
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.09, 5, false), M.brass);
        group.add(tube);
      }
      const latR = HS.drumR * Math.sin(Math.PI / 4) * 0.985;
      ring(latR, 0.07, HS.drumTop + HS.drumR * 0.66 * Math.cos(Math.PI / 4), zc);
      // 采光亭：八角石鼓 + 金框暖光 + 尖顶
      box(1.9, 1.35, 1.9, 0, apexY + 0.5, zc, M.stoneLight);
      const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.5, 1.96), wallGlowHot);
      lanternGlass.position.set(0, apexY + 0.52, zc);
      lanternGlass.userData.shellGlow = 0.7;
      group.add(lanternGlass);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          goldDeep.add(0.1, 1.5, 0.1, sx * 1.0, apexY + 0.5, zc + sz * 1.0);
        }
      }
      pyramid(1.55, 0.85, 0, apexY + 1.17, zc, M.roof);
      goldDarkCap(0, apexY + 1.18, zc, 1.4);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.36, 2.5, 8), M.brass);
      spire.position.set(0, apexY + 3.0, zc);
      group.add(spire);
      finial(0, apexY + 4.25, zc, 0.55);
    } else {
      roof(HS.half * 2 + 1.0, HS.z0 - HS.z1 + 0.8, 0.95, 5.0, 0, HS.wallTop, (HS.z0 + HS.z1) / 2);
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(HS.drumR - 0.2, HS.drumR + 0.1, 2.5, 40),
        M.stoneDark
      );
      drum.position.set(0, HS.wallTop + 1.7, zc);
      group.add(drum);
      ring(HS.drumR + 0.02, 0.1, HS.wallTop + 2.95, zc);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(HS.drumR - 0.1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        M.roof
      );
      dome.scale.set(1, 0.34, 1);
      dome.position.set(0, HS.wallTop + 2.9, zc);
      group.add(dome);
      ring(HS.drumR * 0.72, 0.08, HS.wallTop + 3.22, zc, M.goldDeep);
      // 平顶采光亭：一圈金环 + 低石鼓
      const capY = HS.wallTop + 3.35;
      const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.95, 12), M.stoneLight);
      lantern.position.set(0, capY + 0.4, zc);
      group.add(lantern);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.18, 0.16, 12), M.roofDeep);
      cap.position.set(0, capY + 0.92, zc);
      group.add(cap);
      ring(1.1, 0.06, capY + 0.92, zc, M.brass);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), M.brass);
      tip.position.set(0, capY + 1.12, zc);
      group.add(tip);
    }
  }

  function goldDarkCap(x, y, z, r) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.08, 0.1, 8), M.goldDeep);
    cap.position.set(x, y, z);
    group.add(cap);
    return cap;
  }

  /* ---------- 舞台塔、侧台 ---------- */
  function buildStage() {
    const tMid = (T.z0 + T.z1) / 2;
    // 塔侧墙在舞台层开一个大洞，主台与侧台连通；洞口上方整段当过梁
    const openZ1 = -50.6;
    const openTop = 8.2;
    for (const sign of [-1, 1]) {
      box(0.65, T.towerEave - openTop, T.z0 - T.z1, sign * T.towerHalf, (T.towerEave + openTop) / 2, tMid);
      box(0.65, openTop, T.z0 - openZ1, sign * T.towerHalf, openTop / 2, (T.z0 + openZ1) / 2);
      box(0.6, T.wingEave, T.z0 - T.z1, sign * T.wingHalf, T.wingEave / 2, tMid);
      box(T.wingHalf - T.towerHalf, T.wingEave, 0.55, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave / 2, T.z0);
      // 东翼南墙：与创意工坊北门同宽同高开洞（x 9.2..10.6，净高 3.45），侧台才能进工坊
      const wMid = (T.towerHalf + T.wingHalf) / 2;
      if (sign === 1) {
        const sd0 = 9.2;
        const sd1 = 10.6;
        const sHead = 3.45;
        box(sd0 - T.towerHalf + 0.1, T.wingEave, 0.55, (T.towerHalf + sd0) / 2, T.wingEave / 2, T.z1);
        box(T.wingHalf - sd1 + 0.1, T.wingEave, 0.55, (sd1 + T.wingHalf) / 2, T.wingEave / 2, T.z1);
        box(sd1 - sd0, T.wingEave - sHead, 0.55, (sd0 + sd1) / 2, (T.wingEave + sHead) / 2, T.z1);
      } else {
        box(T.wingHalf - T.towerHalf, T.wingEave, 0.55, sign * wMid, T.wingEave / 2, T.z1);
      }
      for (const z of [-50.2, -53.0, -55.8]) {
        addWindow(sign * (T.wingHalf + 0.3), 9.2, z, 1.4, 1.7, sign, z === -53.0 ? 0.15 : 0.04);
      }
      for (const z of [-49.2, -52.2, -55.2]) {
        addWindow(sign * (T.towerHalf + 0.26), 14.0, z, 0.72, 1.4, sign, z === -52.2 ? 0.09 : 0.02);
      }
      for (const z of [-48.9, -51.6, -54.4, -57.1]) {
        box(0.34, 8.8, 0.4, sign * (T.wingHalf + 0.18), 6.2, z, M.stoneLight);
      }
      gold.add(0.58, 0.14, T.z0 - T.z1, sign * (T.wingHalf + 0.08), T.wingEave - 0.1, tMid);
      gold.add(T.towerHalf * 2 + 0.9, 0.16, T.z0 - T.z1 + 0.6, 0, T.towerEave - 0.08, tMid);
      if (B) {
        flatRoof(T.wingHalf - T.towerHalf + 0.5, T.z0 - T.z1 + 0.4, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave, tMid, 0.24);
      } else {
        roof(T.wingHalf - T.towerHalf + 0.5, T.z0 - T.z1 + 0.5, 0.8, 1.1, sign * (T.wingHalf + T.towerHalf) / 2, T.wingEave, tMid);
      }
    }
    box(T.towerHalf * 2 + 0.7, T.towerEave - BK.eave, 0.6, 0, (T.towerEave + BK.eave) / 2, T.z1);
    if (B) {
      // 阶梯收分：三圈石墨黑压顶，逐级进深
      box(T.towerHalf * 2 + 0.8, 0.95, T.z0 - T.z1 + 0.4, 0, 0.48, tMid, M.stoneDark);
      box(T.towerHalf * 2 + 0.4, 1.1, T.z0 - T.z1 - 0.2, 0, T.towerEave + 0.55, tMid, M.stoneDark);
      box(T.towerHalf * 2 - 2.0, 1.0, T.z0 - T.z1 - 3.4, 0, T.towerEave + 1.6, tMid, M.roofDeep);
      box(T.towerHalf * 2 - 4.6, 0.9, T.z0 - T.z1 - 7.2, 0, T.towerEave + 2.55, tMid, M.roofDeep);
      box(T.towerHalf * 2 - 7.0, 0.6, T.z0 - T.z1 - 10.6, 0, T.towerEave + 3.3, tMid, M.roofDeep);
      for (const [y, w, d] of [
        [T.towerEave + 1.12, T.towerHalf * 2 + 0.5, T.z0 - T.z1],
        [T.towerEave + 2.12, T.towerHalf * 2 - 1.9, T.z0 - T.z1 - 3.2],
        [T.towerEave + 3.02, T.towerHalf * 2 - 4.5, T.z0 - T.z1 - 7.0]
      ]) {
        goldDeep.add(w + 0.1, 0.09, 0.14, 0, y, tMid + d / 2);
        goldDeep.add(w + 0.1, 0.09, 0.14, 0, y, tMid - d / 2);
        goldDeep.add(0.14, 0.09, d - 1.2, -w / 2, y, tMid);
        goldDeep.add(0.14, 0.09, d - 1.2, w / 2, y, tMid);
      }
    } else {
      box(T.towerHalf * 2 + 0.8, 0.95, T.z0 - T.z1 + 0.5, 0, 0.48, tMid, M.stoneDark);
      roof(T.towerHalf * 2 + 1.0, T.z0 - T.z1 + 0.7, T.towerRidge - T.towerEave + 0.9, 3.4, 0, T.towerEave, tMid);
      goldDeep.add(0.16, 0.14, T.z0 - T.z1 - 5.4, 0, T.towerRidge + 0.02, tMid);
      // 脊上不再放石质天窗块与侧向发光条：它们在俯视图里会读成悬空石板
      finial(0, T.towerRidge + 0.1, tMid, 0.65);
    }
  }

  /* ---------- 后台、装卸台 ---------- */
  function buildBack() {
    const bMid = (BK.z0 + BK.z1) / 2;
    box(0.6, BK.eave, 0.4, BK.half, BK.eave / 2, BK.z0 - 0.2);
    // 西墙为后台→办公室短廊开洞，洞高与室内门头一致
    const oz1 = -62.6;
    const oz0 = -65.3;
    const oHead = 3.45;
    for (const [za, zb] of [[BK.z0, oz1], [oz0, BK.z1]]) {
      box(0.6, BK.eave, Math.abs(za - zb), -BK.half, BK.eave / 2, (za + zb) / 2);
    }
    box(0.6, BK.eave - oHead, oz1 - oz0, -BK.half, (BK.eave + oHead) / 2, (oz0 + oz1) / 2);
    for (const z of [-60.8, -64.2]) {
      addWindow(-BK.half - 0.33, 5.4, z, 1.1, 1.8, -1, z === -64.2 ? 0.18 : 0.04);
    }
    const dx0 = D.cx - D.doorW / 2;
    const dx1 = D.cx + D.doorW / 2;
    box(BK.half - dx1 + 0.1, BK.eave, 0.6, (BK.half + dx1) / 2, BK.eave / 2, BK.z1);
    box(BK.half + dx0 + 0.1, BK.eave, 0.6, (-BK.half + dx0) / 2, BK.eave / 2, BK.z1);
    box(D.doorW, BK.eave - 5.15, 0.6, D.cx, (BK.eave + 5.15) / 2, BK.z1);
    // 装卸门卷帘升到 2.6m 净高：帘片收到顶部，门洞下方的门板全部撤掉
    const rollBottom = D.top + 2.6;
    const rollTop = D.top + D.doorH;
    const rollMat = M.stoneDark;
    box(D.doorW - 0.1, rollTop - rollBottom, 0.12, D.cx, (rollBottom + rollTop) / 2, BK.z1 - 0.03, rollMat);
    for (let i = 0; i < 4; i++) {
      goldDeep.add(D.doorW - 0.2, 0.045, 0.16, D.cx, rollBottom + 0.16 + i * 0.32, BK.z1 - 0.08);
    }
    goldDeep.add(D.doorW + 0.34, 0.14, 0.2, D.cx, rollTop + 0.12, BK.z1 - 0.02);
    box(D.doorW + 0.9, 0.22, 1.2, D.cx, 5.55, BK.z1 - 0.66, M.stoneLight);
    goldDeep.add(D.doorW + 1.0, 0.12, 1.25, D.cx, 5.68, BK.z1 - 0.66);
    glowBar(1.6, 0.1, 0.34, D.cx, 5.44, BK.z1 - 0.62, wallGlowHot, 0.6);
    // 站台
    box(D.halfW * 2, D.top, D.depth, D.cx, D.top / 2, BK.z1 - D.depth / 2, M.stoneDark);
    goldDeep.add(D.halfW * 2 + 0.1, 0.1, 0.12, D.cx, D.top + 0.01, BK.z1 - D.depth + 0.06);
    // 门洞与站台之间的门槛收边：0.10m 一级，常规踏步
    goldDeep.add(D.doorW + 0.16, 0.10, 0.12, D.cx, D.top + 0.05, BK.z1 - 0.10);
    // 夜间户外灯：灯杆 + 冷白灯头，独立于外壳调光，保证平台不全黑
    const coldLampMat = new THREE.MeshBasicMaterial({ color: 0xd2e6f8, toneMapped: false });
    owned.push(coldLampMat);
    const lampX = D.cx - 2.2;
    const lampZ = BK.z1 - 1.3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.1, 8), M.stoneDark);
    pole.position.set(lampX, D.top + 1.55, lampZ);
    group.add(pole);
    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.34), M.stoneLight);
    lampHead.position.set(lampX, D.top + 3.16, lampZ);
    group.add(lampHead);
    const lampBulb = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.24), coldLampMat);
    lampBulb.position.set(lampX, D.top + 3.06, lampZ);
    group.add(lampBulb);
    const cold = new THREE.PointLight(0x9cc6e8, 7, 12, 2);
    cold.position.set(lampX, D.top + 2.9, lampZ);
    lightRig.add(cold);
    // 另一枚弱冷光挂在门头，避免门洞内侧全黑
    const coldDoor = new THREE.PointLight(0x9cc6e8, 2.2, 6, 2);
    coldDoor.position.set(D.cx, D.top + 2.4, BK.z1 + 0.35);
    lightRig.add(coldDoor);
    plinth(BK.z0, BK.z1, BK.half, 0.85, M.stoneDark, 0, [dx0 - 0.25, dx1 + 0.25]);
    if (B) flatRoof(BK.half * 2 + 0.9, BK.z0 - BK.z1 + 0.5, 0, BK.eave, bMid, 0.26);
    else {
      roof(BK.half * 2 + 0.9, BK.z0 - BK.z1 + 0.6, BK.ridge - BK.eave, BK.inset, 0, BK.eave, bMid);
      goldDeep.add(0.12, 0.12, BK.z0 - BK.z1 - BK.inset * 2 + 0.4, 0, BK.ridge + 0.02, bMid);
    }
  }

  /* ---------- 创意工坊 / 主理人办公室 ---------- */
  function buildWorkshopOffice() {
    const wMidX = (W.x0 + W.x1) / 2;
    const wMidZ = (W.z0 + W.z1) / 2;
    box(0.55, W.eave, W.z0 - W.z1, W.x1, W.eave / 2, wMidZ);
    box(W.x1 - W.x0 + 0.4, W.eave, 0.55, wMidX, W.eave / 2, W.z1);
    // 工坊北墙：为舞台侧台→工坊的门洞（x 9.2..10.6，净高 3.45）分成两段 + 过梁
    const sd0 = 9.2;
    const sd1 = 10.6;
    const sdHead = 3.45;
    box(sd0 - W.x0 + 0.2, W.eave, 0.55, (W.x0 + sd0) / 2, W.eave / 2, W.z0);
    box(W.x1 - sd1 + 0.2, W.eave, 0.55, (sd1 + W.x1) / 2, W.eave / 2, W.z0);
    box(sd1 - sd0, W.eave - sdHead, 0.55, (sd0 + sd1) / 2, (W.eave + sdHead) / 2, W.z0);
    for (const z of [-60.4, -63.6]) {
      addWindow(W.x1 + 0.28, 3.5, z, 2.0, 1.6, 1, z === -63.6 ? 0.45 : 0.07);
    }
    if (B) flatRoof(W.x1 - W.x0 + 0.6, W.z0 - W.z1 + 0.5, wMidX, W.eave, wMidZ, 0.24);
    else {
      roof(W.x1 - W.x0 + 0.6, W.z0 - W.z1 + 0.6, W.ridge - W.eave, 1.0, wMidX, W.eave, wMidZ);
      // 天窗落在屋面上：整块与屋面同色，只留一条暖光和两道金边
      box(5.0, 0.3, 2.2, wMidX, W.ridge + 0.02, wMidZ, M.roofDeep);
      box(4.7, 1.05, 1.9, wMidX, W.ridge + 0.4, wMidZ, M.roofDeep);
      glowBar(4.4, 0.65, 0.1, wMidX, W.ridge + 0.4, wMidZ + 0.94, wallGlowMid, 0.38);
      // 天窗压顶只用两条金边，不用整片金板，避免俯视读成漂浮的棕色矩形
      goldDeep.add(4.86, 0.08, 0.12, wMidX, W.ridge + 0.92, wMidZ + 0.94);
      goldDeep.add(4.86, 0.08, 0.12, wMidX, W.ridge + 0.92, wMidZ - 0.94);
    }
    const oMidX = (O.x0 + O.x1) / 2;
    const oMidZ = (O.z0 + O.z1) / 2;
    // 附属体量整体压到深石：俯视时不再在暗屋面旁边跳出一圈米色墙身
    box(0.5, O.eave, O.z0 - O.z1, O.x0, O.eave / 2, oMidZ, M.stoneDark);
    box(O.x1 - O.x0 + 0.3, O.eave, 0.5, oMidX, O.eave / 2, O.z1, M.stoneDark);
    box(O.x1 - O.x0 + 0.3, O.eave, 0.5, oMidX, O.eave / 2, O.z0, M.stoneDark);
    addWindow(O.x0 - 0.25, 2.5, O.z1 + 2.4, 1.1, 1.45, -1, 0.4);
    if (B) flatRoof(O.x1 - O.x0 + 0.5, O.z0 - O.z1 + 0.45, oMidX, O.eave, oMidZ, 0.22);
    else {
      roof(O.x1 - O.x0 + 0.5, O.z0 - O.z1 + 0.5, O.ridge - O.eave, 0.8, oMidX, O.eave, oMidZ);
      box(0.55, 1.2, 0.55, O.x0 + 0.9, O.ridge - 0.2, O.z0 + 1.3, M.stoneDark);
      goldDeep.add(0.66, 0.1, 0.66, O.x0 + 0.9, O.ridge + 0.42, O.z0 + 1.3);
    }
    // 连接体只留顶部压顶（短廊吊顶之上），不再用实心石块填满走廊
    const connW = Math.abs(O.x1 + BK.half);
    box(connW + 0.3, 0.26, 3.1, (O.x1 - BK.half) / 2, 3.75, -63.95, M.stoneDark);
  }

  /* ---------- 舞台侧门 ---------- */
  function buildStageDoor() {
    box(SD.depth, SD.h, SD.w, SD.x - SD.depth / 2, SD.h / 2, SD.z);
    goldDeep.add(SD.depth + 0.1, 0.14, SD.w + 0.2, SD.x - SD.depth / 2, SD.h - 0.08, SD.z);
    goldDeep.add(0.12, 2.8, 0.1, SD.x - SD.depth - 0.02, 1.55, SD.z - SD.w / 2 + 0.15);
    goldDeep.add(0.12, 2.8, 0.1, SD.x - SD.depth - 0.02, 1.55, SD.z + SD.w / 2 - 0.15);
    box(0.1, 2.35, 1.0, SD.x - SD.depth - 0.02, 1.28, SD.z, M.stoneDark);
    glowBar(0.2, 0.26, 0.2, SD.x - SD.depth - 0.16, 2.95, SD.z, wallGlowHot, 0.75);
    // 檐下踏板改深石：俯视时不再在翼墙外侧读成孤立米色小块
    box(1.45, 0.14, SD.w + 0.6, SD.x - SD.depth - 0.68, 0.07, SD.z, M.stoneDark);
  }

  /* ---------- 方案 A：古典端景 ---------- */
  function facadeA() {
    const eave = 10.4;
    const portalHalf = 2.3;
    // 主体两翼侧墙
    for (const sign of [-1, 1]) {
      box(0.65, eave, F.z0 - F.z1, sign * F.half, eave / 2, (F.z0 + F.z1) / 2);
    }
    // 东翼正立面（低）：壁龛成组 + 雕像体块
    box(F.half - portalHalf + 0.1, eave, 0.5, (F.half + portalHalf) / 2, eave / 2, 1.07);
    for (const x of [4.4, 6.6, 8.8]) {
      box(1.62, 3.4, 0.14, x, 5.6, 1.36, M.stoneDark);
      box(0.34, 3.9, 0.4, x - 0.93, 5.6, 1.4, M.stoneLight);
      box(0.34, 3.9, 0.4, x + 0.93, 5.6, 1.4, M.stoneLight);
      box(2.2, 0.32, 0.42, x, 7.6, 1.4, M.stoneLight);
      box(1.9, 0.24, 0.42, x, 3.75, 1.4, M.stoneLight);
      box(0.62, 0.28, 0.4, x, 3.95, 1.42, M.stoneLight);
      box(0.42, 2.1, 0.34, x, 5.15, 1.42, M.stoneLight);
      glowBar(1.2, 2.5, 0.06, x, 5.6, 1.29, wallGlowDim, 0.16);
    }
    gold.add(F.half - portalHalf, 0.18, 0.2, (F.half + portalHalf) / 2, eave - 0.1, 1.34);
    // 西翼凸出的端部亭：更高、更前，形成不对称
    box(0.58, 12.6, 3.4, -F.half, 6.3, 0.75);
    box(0.58, 12.6, 3.4, -portalHalf, 6.3, 0.75);
    box(F.half - portalHalf + 0.2, 12.6, 0.6, -(F.half + portalHalf) / 2, 6.3, 1.42);
    for (const x of [-8.5, -6.35, -4.2]) {
      box(1.7, 4.4, 0.14, x, 5.2, 1.74, M.stoneDark);
      box(0.36, 4.9, 0.44, x - 0.97, 5.2, 1.78, M.stoneLight);
      box(0.36, 4.9, 0.44, x + 0.97, 5.2, 1.78, M.stoneLight);
      box(2.3, 0.36, 0.46, x, 7.62, 1.78, M.stoneLight);
      box(1.95, 0.28, 0.46, x, 2.86, 1.78, M.stoneLight);
      box(0.72, 0.3, 0.44, x, 3.08, 1.8, M.stoneLight);
      box(0.48, 2.5, 0.38, x, 4.5, 1.8, M.stoneLight);
      glowBar(1.3, 3.2, 0.06, x, 5.2, 1.65, wallGlowDim, 0.18);
    }
    // 端部亭的壁柱与檐口
    for (const x of [-9.9, -7.5, -5.1, -2.75]) {
      box(0.5, 11.6, 0.5, x, 5.8, 1.66, M.stoneLight);
    }
    gold.add(F.half - portalHalf + 0.4, 0.2, 0.24, -(F.half + portalHalf) / 2, 12.5, 1.84);
    goldDeep.add(F.half - portalHalf + 0.4, 0.1, 0.3, -(F.half + portalHalf) / 2, 1.0, 1.9);
    // 门洞：半圆拱 + 上方阁楼层 + 三角楣
    const arch = new THREE.Mesh(archBandGeometry(portalHalf, 2.95, 0.62), M.stoneLight);
    arch.position.set(0, 5.2, 0.8);
    group.add(arch);
    box(5.1, 4.1, 0.55, 0, 9.45, 0.88);
    box(5.9, 0.34, 0.75, 0, 11.42, 0.86, M.stoneLight);
    prism(6.4, 1.55, 0.8, 0, 11.6, 0.86, M.stoneLight);
    prism(5.4, 1.25, 0.7, 0, 11.6, 0.88, M.stone);
    goldDeep.add(6.6, 0.1, 0.16, 0, 11.62, 1.27);
    // 门洞两侧石柱
    for (const sign of [-1, 1]) {
      box(0.55, 5.6, 0.5, sign * 2.56, 2.8, 1.0, M.stoneLight);
      goldDeep.add(0.72, 0.2, 0.6, sign * 2.56, 0.2, 1.0);
      goldDeep.add(0.72, 0.16, 0.6, sign * 2.56, 5.46, 1.0);
    }
    // 拱内暖光：只做门套两侧窄光带，门洞中线保持通透
    doorGlowBands({ half: 2.02, band: 0.2, height: 3.9, y: 4.2, z: 0.18, mat: wallGlowMid, level: 0.34 });
    // 基座：门洞范围断开，门槛处不再横一道 0.86m 石带
    // 后侧带同样在门厅拱洞（±2.2m）处让开，避免透过拱门看到整条石带
    plinth(F.z0, F.z1, F.half, 0.86, M.stoneDark, portalHalf + 0.95, [-2.2, 2.2]);
    for (const sign of [-1, 1]) {
      for (const z of [-3.8, -7.4, -11.0, -14.6]) {
        addWindow(sign * (F.half + 0.28), 7.0, z, 1.25, 2.6, sign, z === -7.4 ? 0.16 : 0.04);
        addWindow(sign * (F.half + 0.28), 2.6, z, 0.95, 1.3, sign, z === -11.0 ? 0.1 : 0.02);
      }
    }
    // 屋顶：主坡 + 端部亭坡
    roof(F.half * 2 + 0.9, F.z0 - F.z1 + 0.7, 2.0, 3.2, 0, eave, (F.z0 + F.z1) / 2);
    roof(F.half - portalHalf + 0.9, 3.9, 1.8, 1.1, -(F.half + portalHalf) / 2, 12.6, 0.6);
    goldDeep.add(0.14, 0.14, F.z0 - F.z1 - 6.4, 0, eave + 2.0, (F.z0 + F.z1) / 2);
    // 东侧转角方塔（高）+ 西侧圆塔（低）：不对称天际
    box(3.0, 0.9, 3.0, 11.4, 0.45, -16.3, M.stoneDark);
    box(2.7, 16.4, 2.7, 11.4, 8.2, -16.3);
    for (const y of [6.2, 10.6, 14.4]) {
      goldDeep.add(2.95, 0.14, 2.95, 11.4, y, -16.3);
    }
    pyramid(2.3, 2.2, 11.4, 16.4, -16.3);
    finial(11.4, 18.7, -16.3, 0.75);
    addWindow(11.4 + 1.37, 12.6, -16.3, 0.8, 2.2, 1, 0.12);
    addWindow(11.4 - 1.37, 12.6, -16.3, 0.8, 2.2, -1, 0.05);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 13.5, 20), M.stone);
    turret.position.set(-11.4, 6.75, -16.3);
    group.add(turret);
    ring(1.52, 0.07, 13.3, -16.3, M.brass, 28);
    const turretCap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 20), M.roof);
    turretCap.position.set(-11.4, 14.7, -16.3);
    group.add(turretCap);
    finial(-11.4, 15.9, -16.3, 0.6);
    for (const sign of [-1, 1]) {
      box(2.95, 0.9, 2.95, sign * 11.95, 0.45, -46.95, M.stoneDark);
      box(2.85, 14.5, 2.85, sign * 11.95, 7.25, -46.95);
      goldDeep.add(3.1, 0.14, 3.1, sign * 11.95, 14.35, -46.95);
      pyramid(2.4, 1.9, sign * 11.95, 14.5, -46.95);
      finial(sign * 11.95, 16.5, -46.95, 0.6);
    }
  }

  /* ---------- 方案 C：混合骨架（A 的体量 + B 的材质与竖肋） ---------- */
  function facadeC() {
    const eave = 10.4;
    const highEave = 12.6;
    const portalHalf = 2.65;
    const frontLow = 1.07;
    const frontHigh = 1.42;

    // 主体两翼侧墙
    for (const sign of [-1, 1]) {
      box(0.65, eave, F.z0 - F.z1, sign * F.half, eave / 2, (F.z0 + F.z1) / 2);
    }

    // 低翼（右）：密排竖向凹槽肋；肋端由檐口压平，不做锯齿轮廓
    // 低翼墙身比主石色暗一档，竖肋整体退回次层，不再抢门洞
    box(F.half - portalHalf + 0.1, eave, 0.5, (F.half + portalHalf) / 2, eave / 2, frontLow, M.wing);
    const lowFace = frontLow + 0.25;
    for (let x = portalHalf + 0.55; x <= F.half - 0.35; x += 0.58) {
      box(0.22, 8.35, 0.18, x, 5.35, lowFace + 0.02, M.rib);
    }
    goldDeep.add(F.half - portalHalf - 0.3, 0.1, 0.24, (F.half + portalHalf) / 2, 1.16, lowFace + 0.08);
    gold.add(F.half - portalHalf, 0.16, 0.2, (F.half + portalHalf) / 2, eave - 0.1, lowFace + 0.06);

    // 高翼（左）：壁龛群 + 石质雕像，两侧用竖肋把体量往上提
    box(F.half - portalHalf + 0.2, highEave, 0.6, -(F.half + portalHalf) / 2, highEave / 2, frontHigh);
    const highFace = frontHigh + 0.3;
    for (let x = -(F.half - 0.35); x <= -(portalHalf + 0.55); x += 0.58) {
      // 壁龛位置让开，肋只做在空白墙面上
      if ([-8.5, -6.35, -4.2].some((nx) => Math.abs(x - nx) < 1.2)) continue;
      box(0.22, 10.6, 0.18, x, 6.6, highFace + 0.02, M.rib);
    }
    for (const x of [-8.5, -6.35, -4.2]) {
      // 龛：深色内衬 + 纯石雕像，不衬暖光，避免被读成亮窗
      box(1.72, 3.5, 0.04, x, 5.7, highFace + 0.03, M.stoneDark);
      box(0.34, 3.85, 0.36, x - 0.97, 5.7, highFace + 0.02, M.stoneLight);
      box(0.34, 3.85, 0.36, x + 0.97, 5.7, highFace + 0.02, M.stoneLight);
      box(2.14, 0.3, 0.4, x, 7.68, highFace + 0.02, M.stoneLight);
      box(0.62, 0.46, 0.44, x, 4.45, highFace + 0.18, M.stoneLight);
      box(0.42, 1.35, 0.34, x, 5.35, highFace + 0.2, M.stoneLight);
      box(0.26, 0.3, 0.28, x, 6.2, highFace + 0.2, M.stoneLight);
    }
    // 檐线宽度与墙面齐平，端头不再越出轮廓
    gold.add(F.half - portalHalf, 0.2, 0.24, -(F.half + portalHalf) / 2, highEave - 0.1, highFace + 0.02);
    goldDeep.add(F.half - portalHalf + 0.4, 0.1, 0.3, -(F.half + portalHalf) / 2, 1.05, highFace + 0.04);

    // 门洞：第一焦点。拱更大、门柱更粗、外圈一道克制金线
    const arch = new THREE.Mesh(archBandGeometry(portalHalf, 3.35, 0.72), M.stoneLight);
    arch.position.set(0, 5.2, 0.78);
    group.add(arch);
    const archGold = new THREE.Mesh(archBandGeometry(portalHalf + 0.12, 3.26, 0.2), M.goldDeep);
    archGold.position.set(0, 5.2, 1.12);
    group.add(archGold);
    for (const sign of [-1, 1]) {
      box(0.62, 6.4, 0.62, sign * (portalHalf + 0.42), 3.2, 0.98, M.stoneLight);
      box(0.78, 0.42, 0.72, sign * (portalHalf + 0.42), 0.35, 0.98, M.stoneDark);
      goldDeep.add(0.82, 0.22, 0.8, sign * (portalHalf + 0.42), 0.16, 1.0);
      goldDeep.add(0.78, 0.16, 0.76, sign * (portalHalf + 0.42), 6.36, 1.0);
    }
    // 拱上阁楼层 + 山花：宽度收窄，不压过门洞
    box(5.0, 3.6, 0.55, 0, 9.4, 0.9);
    box(5.8, 0.3, 0.72, 0, 11.3, 0.9, M.stoneLight);
    prism(6.2, 1.4, 0.78, 0, 11.45, 0.9, M.stoneLight);
    prism(5.2, 1.1, 0.68, 0, 11.45, 0.92, M.stone);
    goldDeep.add(6.4, 0.1, 0.16, 0, 11.46, 1.28);
    // 门洞暖光衬底只保留门套两侧两条窄光带：整幅衬板会挡住门洞中线视线
    doorGlowBands({ half: 2.18, band: 0.22, height: 4.1, y: 3.3, z: 0.18, mat: wallGlowMid, level: 0.32 });

    // 基座：门洞范围断开，门槛处不再横一道 0.86m 石带
    // 后侧带同样在门厅拱洞（±2.2m）处让开，避免透过拱门看到整条石带
    plinth(F.z0, F.z1, F.half, 0.86, M.stoneDark, portalHalf + 0.95, [-2.2, 2.2]);

    // 侧立面窗：贴住退台墙面，窗框不外凸
    for (const sign of [-1, 1]) {
      for (const z of [-3.8, -7.4, -11.0, -14.6]) {
        addWindow(sign * (F.half + 0.05), 6.6, z, 1.1, 2.4, sign, z === -7.4 ? 0.16 : 0.04);
        addWindow(sign * (F.half + 0.05), 2.6, z, 0.95, 1.3, sign, z === -11.0 ? 0.1 : 0.02);
      }
    }

    // 屋顶：石墨黑主坡 + 端部亭坡
    // 屋顶外挑收窄到 0.2：低模下不再在正立面两端露出薄薄的檐口细线
    roof(F.half * 2 + 0.4, F.z0 - F.z1 + 0.4, 2.0, 3.2, 0, eave, (F.z0 + F.z1) / 2);
    roof(F.half - portalHalf + 0.4, 3.9, 1.8, 1.1, -(F.half + portalHalf) / 2, highEave, 0.6);
    // 檐口亮石压顶 + 石脊：俯视时用明度差勾出屋面边界，而不是只靠金线
    // 压顶收在屋面轮廓之内，正立面不再露出悬空的细线
    const rd = F.z0 - F.z1 + 0.7;
    const rz = (F.z0 + F.z1) / 2;
    const copingY = eave - 0.12;
    box(F.half * 2 - 0.1, 0.34, 0.36, 0, copingY, rz + rd / 2 - 0.18, M.stoneLight);
    box(F.half * 2 - 0.1, 0.34, 0.36, 0, copingY, rz - rd / 2 + 0.18, M.stoneLight);
    // 两端不再挂任何金檐线：0.1 厚的悬空细线在正立面长焦下会读成胡须
    // 石脊两侧各压一道深色窄带：俯视时脊线有明暗过渡，不是一条孤线
    box(0.3, 0.06, F.z0 - F.z1 - 6.6, 0.45, eave + 1.94, rz, M.roofDeep);
    box(0.3, 0.06, F.z0 - F.z1 - 6.6, -0.45, eave + 1.94, rz, M.roofDeep);
    box(0.22, 0.12, F.z0 - F.z1 - 6.4, 0, eave + 2.02, rz, M.stoneLight);

    // 角塔：右方塔压低一档，避免抢门洞；左圆塔保持不对称天际
    box(3.0, 0.9, 3.0, 11.4, 0.45, -16.3, M.stoneDark);
    box(2.7, 14.6, 2.7, 11.4, 7.3, -16.3);
    for (const y of [6.2, 10.4, 13.4]) {
      goldDeep.add(2.95, 0.12, 2.95, 11.4, y, -16.3);
    }
    pyramid(2.3, 2.0, 11.4, 14.6, -16.3);
    finial(11.4, 16.8, -16.3, 0.68);
    addWindow(11.4 + 1.37, 11.6, -16.3, 0.8, 2.0, 1, 0.12);
    addWindow(11.4 - 1.37, 11.6, -16.3, 0.8, 2.0, -1, 0.05);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 13.5, 20), M.stone);
    turret.position.set(-11.4, 6.75, -16.3);
    group.add(turret);
    ring(1.52, 0.07, 13.3, -16.3, M.brass, 28);
    const turretCap = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2.4, 20), M.roof);
    turretCap.position.set(-11.4, 14.7, -16.3);
    group.add(turretCap);
    finial(-11.4, 15.9, -16.3, 0.6);

    // 后部双塔：石墨阶梯帽
    for (const sign of [-1, 1]) {
      box(2.95, 0.9, 2.95, sign * 11.95, 0.45, -46.95, M.stoneDark);
      box(2.85, 14.5, 2.85, sign * 11.95, 7.25, -46.95);
      goldDeep.add(3.1, 0.12, 3.1, sign * 11.95, 14.35, -46.95);
      pyramid(2.4, 1.9, sign * 11.95, 14.5, -46.95);
      finial(sign * 11.95, 16.5, -46.95, 0.6);
    }
  }

  /* ---------- 方案 B：竖向张力 ---------- */
  function facadeB() {
    const portalHalf = 3.4;
    // 基座层：米色石灰岩，整幅横向展开
    for (const sign of [-1, 1]) {
      box(0.7, 5.2, F.z0 - F.z1, sign * F.half, 2.6, (F.z0 + F.z1) / 2, M.stone);
    }
    for (const sign of [-1, 1]) {
      box(F.half - portalHalf, 5.2, 0.55, sign * (F.half + portalHalf) / 2, 2.6, 1.5, M.stone);
    }
    // 门洞内退：金色门框 + 深色门斗（门洞本身必须敞开，不能整幅封住）
    for (const sign of [-1, 1]) {
      box(0.28, 4.9, 0.6, sign * (portalHalf - 0.1), 2.45, 1.62, M.goldDeep);
      box(0.18, 4.9, 0.7, sign * (portalHalf + 0.3), 2.45, 1.6, M.stoneLight);
    }
    box(portalHalf * 2 + 0.5, 0.24, 0.7, 0, 4.98, 1.62, M.goldDeep);
    // 暖光衬在门扇之后：只保留两侧窄光带，避免整幅挡住门洞
    doorGlowBands({ half: 2.2, band: 0.22, height: 4.2, y: 2.4, z: 0.18, mat: wallGlowMid, level: 0.3 });
    for (const sign of [-1, 1]) {
      for (const x of [5.6, 8.4]) {
        const px = sign * x;
        box(2.5, 2.5, 0.16, px, 2.9, 1.79, M.stoneDark);
        box(2.72, 0.14, 0.26, px, 4.18, 1.82, M.goldDeep);
        box(2.72, 0.14, 0.26, px, 1.64, 1.82, M.goldDeep);
        box(0.14, 2.7, 0.26, px - 1.34, 2.9, 1.82, M.goldDeep);
        box(0.14, 2.7, 0.26, px + 1.34, 2.9, 1.82, M.goldDeep);
        glowBar(2.3, 2.32, 0.06, px, 2.9, 1.72, wallGlowMid, 0.26);
      }
    }
    gold.add(F.half * 2 + 0.2, 0.18, 0.2, 0, 5.12, 1.78);
    // 中层：退台 + 竖向凹槽肋 + 金色竖窗
    const midTop = 9.6;
    for (const sign of [-1, 1]) {
      box(0.65, midTop - 5.2, F.z0 - F.z1, sign * 9.0, (midTop + 5.2) / 2, (F.z0 + F.z1) / 2, M.stone);
      box(1.4, 0.3, F.z0 - F.z1, sign * 9.7, 5.2 + 0.15, (F.z0 + F.z1) / 2, M.stoneLight);
    }
    box(18.0, midTop - 5.2, 0.55, 0, (midTop + 5.2) / 2, 1.28, M.stone);
    for (let x = -8.2; x <= 8.201; x += 0.95) {
      box(0.16, midTop - 5.2 - 0.3, 0.22, x, (midTop + 5.2) / 2, 1.44, M.stoneDark);
    }
    for (const x of [-7.22, -5.32, -3.42, 3.42, 5.32, 7.22]) {
      box(0.9, 3.1, 0.16, x, 7.5, 1.52, M.stoneDark);
      box(1.06, 0.12, 0.24, x, 9.0, 1.54, M.goldDeep);
      box(1.06, 0.12, 0.24, x, 6.0, 1.54, M.goldDeep);
      glowBar(0.72, 2.9, 0.06, x, 7.5, 1.46, wallGlowDim, 0.14);
    }
    gold.add(18.2, 0.16, 0.2, 0, midTop - 0.08, 1.6);
    // 上层：再退台
    const topTop = 13.2;
    for (const sign of [-1, 1]) {
      box(0.6, topTop - midTop, F.z0 - F.z1, sign * 7.8, (topTop + midTop) / 2, (F.z0 + F.z1) / 2, M.stone);
      box(1.3, 0.26, F.z0 - F.z1, sign * 8.45, midTop + 0.13, (F.z0 + F.z1) / 2, M.stoneLight);
    }
    box(15.6, topTop - midTop, 0.55, 0, (topTop + midTop) / 2, 1.12, M.stone);
    for (let x = -7.0; x <= 7.001; x += 0.82) {
      box(0.14, topTop - midTop - 0.2, 0.2, x, (topTop + midTop) / 2, 1.26, M.stoneDark);
    }
    for (const x of [-6.18, -4.54, -2.90, -1.26, 1.26, 2.90, 4.54, 6.18]) {
      box(0.56, 2.7, 0.16, x, 11.2, 1.36, M.stoneDark);
      box(0.7, 0.1, 0.22, x, 12.55, 1.38, M.goldDeep);
      box(0.7, 0.1, 0.22, x, 9.85, 1.38, M.goldDeep);
      glowBar(0.4, 2.5, 0.06, x, 11.2, 1.3, wallGlowDim, 0.12);
    }
    gold.add(15.8, 0.16, 0.2, 0, topTop - 0.08, 1.42);
    // 中央竖向塔：门洞上方起，三级收分
    const tw = 2.9;
    const tz0 = 1.62;
    const tz1 = -9.0;
    const tMid = (tz0 + tz1) / 2;
    box(tw * 2, 0.55, tz0 - tz1, 0, 6.55, tMid, M.stoneDark);
    box(tw * 2, 19.0 - 6.4, 0.6, 0, (19.0 + 6.4) / 2, tz0 - 0.3, M.stone);
    for (const sign of [-1, 1]) {
      box(0.6, 19.0 - 6.4, tz0 - tz1, sign * tw, (19.0 + 6.4) / 2, tMid, M.stone);
    }
    box(tw * 2, 19.0 - 6.4, 0.6, 0, (19.0 + 6.4) / 2, tz1 + 0.3, M.stone);
    for (const x of [-2.15, -0.75, 0.75, 2.15]) {
      box(0.18, 19.0 - 6.6, 0.28, x, (19.0 + 6.4) / 2, tz0 + 0.06, M.stoneDark);
    }
    for (const x of [-1.55, 1.55]) {
      box(0.62, 11.4, 0.2, x, 12.3, tz0 + 0.18, M.stoneDark);
      box(0.78, 0.12, 0.3, x, 18.0, tz0 + 0.2, M.goldDeep);
      box(0.78, 0.12, 0.3, x, 6.6, tz0 + 0.2, M.goldDeep);
      glowBar(0.46, 11.0, 0.06, x, 12.3, tz0 + 0.1, wallGlowDim, 0.13);
    }
    gold.add(2.2, 0.12, 0.22, 0, 19.0 - 0.06, tz0 + 0.02);
    box(tw * 2 + 0.2, 0.85, tz0 - tz1, 0, 19.42, tMid, M.roofDeep);
    box(tw * 2 - 1.0, 0.75, tz0 - tz1 - 1.8, 0, 20.25, tMid + 0.9, M.roofDeep);
    box(tw * 2 - 2.6, 0.7, tz0 - tz1 - 4.6, 0, 21.05, tMid + 2.3, M.roofDeep);
    for (const [y, w, d, zc] of [
      [19.84, tw * 2 + 0.3, tz0 - tz1],
      [20.62, tw * 2 - 0.9, tz0 - tz1 - 1.8],
      [21.4, tw * 2 - 2.5, tz0 - tz1 - 4.6]
    ]) {
      goldDeep.add(w + 0.1, 0.08, 0.12, 0, y, zc + d / 2);
      goldDeep.add(w + 0.1, 0.08, 0.12, 0, y, zc - d / 2);
    }
    finial(0, 21.4, tMid + 2.3, 0.5);
    // 基座、窗、侧立面竖缝（门洞范围断开）
    plinth(F.z0, F.z1, F.half, 0.82, M.stoneDark, portalHalf + 0.95);
    for (const sign of [-1, 1]) {
      for (const z of [-3.8, -7.4, -11.0, -14.6]) {
        // 侧窗贴各自退台的墙面：中层 9.0、基座 10.4，窗框不外凸
        addWindow(sign * (9.0 + 0.05), 8.2, z, 0.9, 2.8, sign, z === -7.4 ? 0.14 : 0.03);
        addWindow(sign * (F.half + 0.05), 2.8, z, 0.9, 2.2, sign, z === -11.0 ? 0.1 : 0.02);
      }
    }
    // 屋顶：平屋面 + 金边压顶；后部双塔改石墨阶梯帽
    flatRoof(15.8, F.z0 - F.z1 + 0.4, 0, topTop, (F.z0 + F.z1) / 2, 0.26);
    for (const sign of [-1, 1]) {
      box(2.7, 0.8, 2.7, sign * 11.95, 0.4, -46.95, M.stoneDark);
      box(2.55, 14.2, 2.55, sign * 11.95, 7.1, -46.95, M.stone);
      box(2.85, 0.5, 2.85, sign * 11.95, 14.55, -46.95, M.roofDeep);
      box(2.1, 0.45, 2.1, sign * 11.95, 15.25, -46.95, M.roofDeep);
      goldDeep.add(2.95, 0.08, 0.12, sign * 11.95, 14.82, -46.95 + 1.45);
      goldDeep.add(2.95, 0.08, 0.12, sign * 11.95, 14.82, -46.95 - 1.45);
      finial(sign * 11.95, 15.5, -46.95, 0.4);
    }
  }

  /* ---------- 组装 ---------- */
  buildLink();
  buildHouseWall();
  buildHouseRoof();
  buildStage();
  buildBack();
  buildWorkshopOffice();
  buildStageDoor();
  if (B) facadeB();
  else if (C) facadeC();
  else facadeA();

  // 立面石材招牌（内部门厅招牌在外形方案下让位给这里）
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.05), mats.sign);
  if (B) signMesh.position.set(0, 5.98, 1.58);
  else signMesh.position.set(0, 9.7, 1.18);
  group.add(signMesh);
  if (B) {
    goldDeep.add(3.7, 0.09, 0.12, 0, 6.58, 1.62);
    goldDeep.add(3.7, 0.07, 0.12, 0, 5.38, 1.62);
  } else {
    goldDeep.add(3.66, 0.1, 0.12, 0, 10.3, 1.22);
    goldDeep.add(3.68, 0.08, 0.12, 0, 9.1, 1.22);
  }

  /* ---------- 窗：外墙用实例化，窗框与暖光各一份 draw call ---------- */
  const n = windows.length;
  if (n) {
    const frameGeo = new THREE.BoxGeometry(1, 1, 1);
    const glowGeo = new THREE.BoxGeometry(1, 1, 1);
    const frames = new THREE.InstancedMesh(frameGeo, M.stoneLight, n);
    const glows = new THREE.InstancedMesh(glowGeo, winMat, n);
    frames.frustumCulled = false;
    glows.frustumCulled = false;
    const mat4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const w = windows[i];
      const yaw = w.nx >= 0 ? Math.PI / 2 : -Math.PI / 2;
      quat.setFromEuler(new THREE.Euler(0, yaw, 0));
      mat4.compose(
        new THREE.Vector3(w.x, w.y, w.z),
        quat,
        new THREE.Vector3(w.w + 0.26, w.h + 0.26, 0.3)
      );
      frames.setMatrixAt(i, mat4);
      const c = 0.1 + w.lit * 2.0;
      col.setRGB(c, c * 0.62, c * 0.3);
      mat4.compose(
        new THREE.Vector3(w.x + w.nx * 0.12, w.y, w.z),
        quat,
        new THREE.Vector3(w.w, w.h, 0.14)
      );
      glows.setMatrixAt(i, mat4);
      glows.setColorAt(i, col);
    }
    frames.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
    group.add(frames, glows);
  }

  gold.build(group);
  goldDeep.build(group);

  /* ---------- 夜间照明：两案共用同一套灯位与亮度，只比体量与材质 ---------- */
  up(0, 0.3, 3.4, 0, 8.0, 1.1, 64, 0.42, 26);
  up(-6.5, 0.3, 4.4, -6.5, 8.6, 1.3, 74, 0.48, 28);
  up(6.5, 0.3, 4.0, 6.5, 7.6, 1.2, 56, 0.48, 26);
  up(-12.6, 0.3, -5.0, -10.4, 7.0, -6.0, 44, 0.5, 22);
  up(12.6, 0.3, -5.0, 10.4, 7.0, -6.0, 44, 0.5, 22);
  up(0, 12.4, -23.0, 0, 19.0, -39.0, 205, 0.46, 34);
  up(0, 12.0, -44.0, 0, 17.5, -52.0, 160, 0.46, 26);
  up(-11.0, 0.3, -63.2, -9.4, 4.2, -62.6, 40, 0.5, 18);
  up(11.0, 0.3, -63.2, 9.4, 4.2, -62.6, 40, 0.5, 18);
  up(0, 0.3, 2.4, 0, 3.0, 0.9, 12, 0.3, 12);

  mergeStatic(group);

  function setLevel(v) {
    const k = Math.max(0, Math.min(1.25, v));
    for (const g of glowMats) {
      const c = new THREE.Color(g.base);
      c.multiplyScalar(0.32 + 0.68 * k);
      g.mat.color.copy(c);
    }
    winMat.color.setScalar(0.4 + 0.6 * k);
    for (const u of uplights) {
      u.light.intensity = u.base * (0.12 + 0.88 * k);
    }
  }

  function dispose() {
    scene.remove(group);
    scene.remove(lightRig);
    group.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    owned.forEach((m) => m.dispose());
    wallGlowDim.dispose();
    wallGlowMid.dispose();
    wallGlowHot.dispose();
    winMat.dispose();
  }

  return {
    group,
    lightRig,
    scheme: id,
    windowCount: n,
    setLevel,
    dispose
  };
}