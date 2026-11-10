import * as THREE from 'three';
import { BoxBatch, addGlowSprite, mergeStatic } from './utils.js';

function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x06080d) },
      uHorizon: { value: new THREE.Color(0x241813) },
      uBottom: { value: new THREE.Color(0x070504) }
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(uBottom, uHorizon, smoothstep(0.3, 0.53, h));
        c = mix(c, uTop, smoothstep(0.6, 1.0, h));
        gl_FragColor = vec4(c, 1.0);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(190, 32, 18), mat);
  mesh.position.set(0, 0, -28);
  mesh.renderOrder = -1;
  return mesh;
}

function createLantern(mats, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 4.0, z);

  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.56), mats.gold);
  bracket.position.set(0, 0.3, 0.26);
  g.add(bracket);

  const drop = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.035), mats.gold);
  drop.position.set(0, 0.0, 0.5);
  g.add(drop);

  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.07, 8), mats.gold);
  capTop.position.set(0, -0.27, 0.5);
  g.add(capTop);

  const capBot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.07, 8), mats.gold);
  capBot.position.set(0, -0.63, 0.5);
  g.add(capBot);

  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.3, 0.21), mats.warmGlass);
  glass.position.set(0, -0.45, 0.5);
  g.add(glass);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.38, 0.022), mats.gold);
      rod.position.set(sx * 0.11, -0.45, 0.5 + sz * 0.11);
      g.add(rod);
    }
  }

  const glow = addGlowSprite(mats, g, 0, -0.45, 0.5, 1.1, 0.42);
  return { group: g, glow };
}

function buildDoor(mats, sign, pivotX) {
  const pivot = new THREE.Group();
  pivot.position.set(pivotX, 0, 0.35);
  pivot.userData.noMerge = true;   // 门扇要绕轴转，不能并进静态合批

  const panel = new THREE.Group();
  pivot.add(panel);

  const xOff = -sign * 0.88;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.76, 4.2, 0.1), mats.wood);
  slab.position.set(xOff, 2.1, 0);
  slab.castShadow = true;
  slab.receiveShadow = true;
  panel.add(slab);

  const doorGold = new BoxBatch(mats.goldDeep);

  const insetMat = mats.wood;
  const faces = [0.075, -0.075];
  const rows = [
    { y: 3.5, h: 0.75 },
    { y: 2.32, h: 1.28 },
    { y: 1.03, h: 1.24 }
  ];

  for (const fz of faces) {
    for (const row of rows) {
      const inset = new THREE.Mesh(new THREE.BoxGeometry(1.28, row.h, 0.035), insetMat);
      inset.position.set(xOff, row.y, fz);
      inset.receiveShadow = true;
      panel.add(inset);

      doorGold.add(0.055, row.h + 0.14, 0.045, xOff - 0.66, row.y, fz);
      doorGold.add(0.055, row.h + 0.14, 0.045, xOff + 0.66, row.y, fz);
      doorGold.add(1.36, 0.055, 0.045, xOff, row.y + row.h / 2 + 0.06, fz);
      doorGold.add(1.36, 0.055, 0.045, xOff, row.y - row.h / 2 - 0.06, fz);
      doorGold.add(0.02, row.h + 0.04, 0.06, xOff - 0.61, row.y, fz);
      doorGold.add(0.02, row.h + 0.04, 0.06, xOff + 0.61, row.y, fz);
    }
  }

  // 黄铜推杆与门环
  for (const fz of [0.095, -0.095]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.22, 10), mats.brass);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(xOff, 1.52, fz);
    panel.add(bar);
    for (const bx of [-0.44, 0.44]) {
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8), mats.brass);
      mount.rotation.x = Math.PI / 2;
      mount.position.set(xOff + bx, 1.52, fz * 0.62);
      panel.add(mount);
    }
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.017, 6, 22), mats.brass);
  ring.position.set(xOff + sign * 0.45, 1.95, 0.12);
  panel.add(ring);

  const rosette = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 6, 20), mats.gold);
  rosette.position.set(xOff, 3.5, 0.1);
  panel.add(rosette);
  const rosetteDisc = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), mats.brass);
  rosetteDisc.position.set(xOff, 3.5, 0.102);
  panel.add(rosetteDisc);

  doorGold.build(panel);
  // 门扇自身是一整块可动件：只把扇内的静止构件合批，门轴旋转不受影响
  mergeStatic(panel);

  return { pivot, panel, slab };
}

/* 入口外观：draw call 预算 28（静置机位实测 23）。
   两扇门是可动件，只把每扇门内部的静止构件并到 5 份左右，
   门轴、把手、门牌保持独立，不做整体烘焙。 */
export function buildEntrance(scene, mats, quality, options = {}) {
  // 外形方案对比时，门厅立面由体量模块自己生成，这里只留门、台阶、廊灯
  const withFacade = options.facade !== false;
  const group = new THREE.Group();
  scene.add(group);

  group.add(createSky());

  const groundMat = new THREE.MeshPhysicalMaterial({
    map: mats.stoneMap.clone(),
    color: 0x2a2420,
    roughness: 0.52,
    metalness: 0.08,
    envMapIntensity: 0.45
  });
  groundMat.map.wrapS = THREE.RepeatWrapping;
  groundMat.map.wrapT = THREE.RepeatWrapping;
  groundMat.map.repeat.set(9, 9);
  groundMat.map.needsUpdate = true;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -28);
  ground.receiveShadow = true;
  group.add(ground);

  const gold = new BoxBatch(mats.gold);
  const goldDeep = new BoxBatch(mats.goldDeep);

  // 两幅幕板用同一块石材，但把夜景基色抬一点，才读得出石材而不是黑块
  const plateStone = mats.stone.clone();
  plateStone.emissive = new THREE.Color(0x241a12);
  plateStone.emissiveIntensity = 0.8;

  // 外立面两翼：两组错动的石材板块，像被拉开的幕
  if (withFacade) for (const sign of [-1, 1]) {
    const wz = sign < 0 ? 1.52 : 0.98;
    const wh = sign < 0 ? 10.3 : 8.9;
    const ww = sign < 0 ? 9.1 : 8.8;
    const wx = sign < 0 ? -6.35 : 6.5;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, 0.6), plateStone);
    wing.position.set(wx, wh / 2, wz);
    wing.castShadow = true;
    wing.receiveShadow = true;
    group.add(wing);

    // 墙裙与檐口：高度各随其板，不再齐平
    goldDeep.add(ww, 0.22, 0.2, wx, 0.12, wz + 0.32);
    gold.add(ww, 0.12, 0.14, wx, 0.6, wz + 0.34);
    gold.add(ww, 0.18, 0.24, wx, wh - 0.18, wz + 0.35);
    goldDeep.add(ww - 3.4, 0.14, 0.2, wx, wh - 0.02, wz + 0.4);

    // 暗窗：外移随板块
    const wpx = sign < 0 ? -6.85 : 7.0;
    const wpy = sign < 0 ? 4.0 : 3.85;
    const wzf = wz + 0.33;
    const windowPanel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 3.2, 0.06), mats.mirrorDark);
    windowPanel.position.set(wpx, wpy, wzf);
    group.add(windowPanel);
    gold.add(0.1, 3.45, 0.12, wpx - 0.85, wpy, wzf + 0.03);
    gold.add(0.1, 3.45, 0.12, wpx + 0.85, wpy, wzf + 0.03);
    gold.add(1.8, 0.1, 0.12, wpx, wpy + 1.68, wzf + 0.03);
    gold.add(1.8, 0.1, 0.12, wpx, wpy - 1.68, wzf + 0.03);
    gold.add(0.08, 3.3, 0.09, wpx, wpy, wzf + 0.04);
    gold.add(1.6, 0.06, 0.09, wpx, wpy + 0.05, wzf + 0.04);
  }

  // 裂缝两侧的幕边：铜边略向外倾，缝内一条暖光
  if (withFacade) for (const sign of [-1, 1]) {
    const x = sign < 0 ? -1.86 : 2.08;
    const h = sign < 0 ? 10.0 : 8.6;
    const z = sign < 0 ? 1.84 : 1.3;
    const hem = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.16), mats.brass);
    hem.position.set(x, h / 2 + 0.2, z);
    hem.rotation.z = -sign * 0.025;
    group.add(hem);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.9, 0.06), mats.warmGlass);
    slit.position.set(x - sign * 0.08, h / 2 + 0.2, z + 0.02);
    group.add(slit);
  }

  // 台阶
  const stepGeo = [
    { w: 6.6, h: 0.06, d: 0.4, z: 2.28 },
    { w: 7.2, h: 0.11, d: 0.44, z: 1.96 },
    { w: 7.8, h: 0.17, d: 0.44, z: 1.64 }
  ];
  for (const s of stepGeo) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), mats.stone);
    step.position.set(0, s.h / 2 - 0.01, s.z);
    step.receiveShadow = true;
    group.add(step);
    goldDeep.add(s.w + 0.1, 0.02, 0.04, 0, s.h, s.z - s.d / 2 + 0.02);
  }

  // 门侧壁柱
  for (const sign of [-1, 1]) {
    const pilaster = new THREE.Mesh(new THREE.BoxGeometry(0.48, 5.3, 0.42), mats.marble);
    pilaster.position.set(sign * 2.62, 2.66, 1.64);
    pilaster.castShadow = true;
    pilaster.receiveShadow = true;
    group.add(pilaster);

    gold.add(0.62, 0.28, 0.55, sign * 2.62, 0.16, 1.64);
    goldDeep.add(0.54, 0.09, 0.46, sign * 2.62, 0.35, 1.64);
    gold.add(0.6, 0.22, 0.52, sign * 2.62, 5.18, 1.64);
    goldDeep.add(0.52, 0.1, 0.46, sign * 2.62, 5.04, 1.64);
  }

  // 门套与门楣
  gold.add(0.16, 5.1, 0.22, -1.9, 2.55, 1.7);
  gold.add(0.16, 5.1, 0.22, 1.9, 2.55, 1.7);
  gold.add(3.95, 0.18, 0.24, 0, 5.08, 1.7);

  const marquee = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.44, 0.35), mats.stone);
  marquee.position.set(0, 5.38, 1.6);
  marquee.receiveShadow = true;
  group.add(marquee);
  gold.add(4.9, 0.1, 0.15, 0, 5.62, 1.75);
  goldDeep.add(4.95, 0.16, 0.3, 0, 5.19, 1.62);

  const marqueeLight = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.04, 0.1), mats.warmGlass);
  marqueeLight.position.set(0, 5.26, 1.79);
  group.add(marqueeLight);

  // 招牌：挂在右幅幕板上，裂缝完整露出，不被牌子压住
  if (withFacade) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.05), mats.sign);
    sign.position.set(6.4, 6.9, 1.34);
    group.add(sign);
    gold.add(3.66, 0.1, 0.16, 6.4, 7.5, 1.35);
    gold.add(0.1, 1.3, 0.16, 4.62, 6.9, 1.35);
    gold.add(0.1, 1.3, 0.16, 8.18, 6.9, 1.35);
    goldDeep.add(3.7, 0.07, 0.14, 6.4, 6.3, 1.36);
  }

  // 廊灯
  const lanternGlows = [];
  for (const sign of [-1, 1]) {
    const lantern = createLantern(mats, sign * 3.6, 1.55);
    group.add(lantern.group);
    lanternGlows.push(lantern.glow);
  }

  // 门扇
  const leftDoor = buildDoor(mats, -1, -1.78);
  const rightDoor = buildDoor(mats, 1, 1.78);
  group.add(leftDoor.pivot, rightDoor.pivot);

  // 气窗与门框
  for (const rotY of [0, Math.PI]) {
    const fan = new THREE.Mesh(new THREE.PlaneGeometry(3.56, 0.78), mats.fanlight);
    fan.position.set(0, 4.6, rotY === 0 ? 0.405 : 0.295);
    fan.rotation.y = rotY;
    group.add(fan);
  }
  gold.add(0.1, 0.82, 0.2, -1.82, 4.6, 0.36);
  gold.add(0.1, 0.82, 0.2, 1.82, 4.6, 0.36);
  gold.add(3.78, 0.1, 0.2, 0, 5.02, 0.36);
  gold.add(3.78, 0.09, 0.2, 0, 4.2, 0.36);

  // 门缝暖光
  const seamMat = new THREE.MeshBasicMaterial({
    color: 0xffb474,
    transparent: true,
    opacity: 0.5,
    toneMapped: true
  });
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 4.15), seamMat);
  seam.position.set(0, 2.12, 0.445);
  group.add(seam);

  gold.build(group);
  goldDeep.build(group);

  const doorMeshes = [leftDoor.slab, rightDoor.slab];
  let open = 0;

  function setOpen(v) {
    open = Math.max(0, Math.min(1, v));
    leftDoor.pivot.rotation.y = open * 1.88;
    rightDoor.pivot.rotation.y = -open * 1.88;
    seamMat.opacity = 0.5 * (1 - open);
    seam.visible = open < 0.95;
  }

  function setExterior(v) {
    lanternGlows.forEach((g) => {
      g.material.opacity = (g.userData.baseOpacity || 0.42) * (0.3 + 0.7 * v);
    });
    mats.warmGlass.emissiveIntensity = 2.2 * (0.55 + 0.45 * v);
  }

  mergeStatic(group);

  return { group, doorMeshes, setOpen, setExterior, lanternGlows };
}
