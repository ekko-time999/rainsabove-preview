import * as THREE from 'three';
import { buildFoyer } from './foyer.js';
import { buildCorridor } from './corridor.js';
import { buildAuditorium } from './auditorium.js';
import { buildChandelier } from './chandelier.js';
import { buildEntrance } from './entrance.js';
import { buildShell } from './shell.js';
import { buildDesignShell } from './shellDesign.js';
import { buildAtmosphere } from './atmosphere.js';
import { buildUpper } from './upper.js';
import { buildExtraSpaces } from './spaces.js';
import { buildOffice } from './office.js';
import { buildWorkshop } from './workshop.js';
import { PALETTE } from './materials.js';

export function buildWorld(scene, mats, quality, renderer, options = {}) {
  const foyer = buildFoyer(scene, mats, quality);

  // 观众席单独一份地面材质，反射采样点更贴近所在空间
  mats.floorHouse = mats.floor.clone();
  mats.floorHouse.envMapIntensity = 0.95;

  const corridor = buildCorridor(scene, mats);
  const auditorium = buildAuditorium(scene, mats, quality);
  const upper = buildUpper(scene, mats, quality);
  const extra = buildExtraSpaces(scene, mats, quality);
  const office = buildOffice(scene, mats, quality);
  const workshop = buildWorkshop(scene, mats, quality);

  const chandelier = buildChandelier(scene, mats, quality);
  const houseChandelier = buildChandelier(scene, mats, quality, {
    position: [0, 5.5, -41.5],
    scale: 0.92,
    baseIntensity: quality.tier === 'full' ? 22 : 0,
    chainLinks: 22
  });

  // 定稿外形 C（默认），A / B 保留用于回看，legacy 保留原外壳
  const shellSchemes = ['a', 'b', 'c'];
  let shellScheme = options.shellScheme === 'legacy'
    ? 'legacy'
    : (shellSchemes.includes(options.shellScheme) ? options.shellScheme : 'c');
  const entrance = buildEntrance(scene, mats, quality, { facade: shellScheme === 'legacy' });
  // 外壳只包在内部体量之外；不动室内构件、停机位与既有光位
  function makeShell(id) {
    return id === 'legacy'
      ? buildShell(scene, mats, quality)
      : buildDesignShell(scene, mats, quality, id);
  }
  let shell = makeShell(shellScheme);
  const atmosphere = buildAtmosphere(scene, mats, quality);

  /* ---------- 灯光 ---------- */
  // 半球光的地面色改成暖色，模拟地面反上来的低强度反弹，避免朝下的面死黑
  const hemi = new THREE.HemisphereLight(0x4a3428, 0x22120b, 0.48);
  scene.add(hemi);

  // 一次反弹：从地面向上打的暖光，只作用于朝下的面，座椅底部、挑台底面不再发黑
  const floorBounce = new THREE.DirectionalLight(0xff7f4a, 0.34);
  floorBounce.position.set(0, -10, -30);
  floorBounce.target.position.set(0, 10, -30);
  scene.add(floorBounce);
  scene.add(floorBounce.target);

  const interiorSpot = new THREE.SpotLight(0xffb87c, 170, 38, 0.95, 0.85, 2);
  interiorSpot.position.set(0, 10.35, -8.3);
  interiorSpot.target.position.set(0, 0, -8.3);
  interiorSpot.castShadow = quality.shadows;
  interiorSpot.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
  interiorSpot.shadow.bias = -0.00035;
  interiorSpot.shadow.normalBias = 0.03;
  interiorSpot.shadow.camera.near = 0.6;
  interiorSpot.shadow.camera.far = 24;
  scene.add(interiorSpot);
  scene.add(interiorSpot.target);

  // 入口侧暖色补光：把墙裙与地面从纯黑里拉回来
  const entryFill = new THREE.PointLight(0xffb478, 26, 22, 2);
  entryFill.position.set(0, 2.9, -1.2);
  scene.add(entryFill);

  // 壁灯实体光：让两侧墙面有可读的明暗层次
  const sconceLights = [];
  for (const z of [-5.6, -13.0]) {
    for (const sign of [-1, 1]) {
      const lamp = new THREE.PointLight(0xffab63, 14, 9, 2);
      lamp.position.set(sign * 6.15, 4.15, z);
      scene.add(lamp);
      sconceLights.push(lamp);
    }
  }

  // 外立面整体暖洗，让石材与门套在夜景里仍有形体
  const facadeWash = new THREE.PointLight(PALETTE.warm, 34, 30, 2);
  facadeWash.position.set(0, 4.4, 5.2);
  scene.add(facadeWash);

  const exteriorSpots = [];
  for (const sign of [-1, 1]) {
    const spot = new THREE.SpotLight(0xffae68, 125, 26, 0.62, 0.9, 2);
    spot.position.set(sign * 3.9, 6.4, 3.4);
    spot.target.position.set(sign * 1.2, 1.4, 1.2);
    scene.add(spot);
    scene.add(spot.target);
    exteriorSpots.push(spot);
  }

  const coolFill = new THREE.DirectionalLight(0x6b86a8, 0.45);
  coolFill.position.set(2, 9, 16);
  coolFill.target.position.set(0, 2, 0);
  scene.add(coolFill);
  scene.add(coolFill.target);

  /* ---------- 明暗控制 ---------- */
  let interiorLevel = 0.32;
  let exteriorLevel = 1;

  // 分区淡入：巡游抵达前后单独拉某一区的亮度，其余区域保持各自状态
  const areaFade = {
    foyer: 1,
    corridor: 1,
    auditorium: 1,
    upper: 1,
    backstage: 1,
    screening: 1,
    box: 1,
    office: 1,
    workshop: 1
  };

  function applyAreas() {
    const base = interiorLevel;
    const f = areaFade;
    interiorSpot.intensity = 170 * base * f.foyer;
    entryFill.intensity = 26 * base * f.foyer;
    sconceLights.forEach((l) => { l.intensity = 14 * base * f.foyer; });
    chandelier.setLevel(base * f.foyer);
    foyer.setAmbientDetail(base * f.foyer);
    corridor.setLevel(base * f.corridor);
    auditorium.setLevel(base * f.auditorium);
    houseChandelier.setLevel(base * f.auditorium);
    upper.setLevel(base * f.upper);
    extra.setLevel(base);
    extra.setRoomLevel('backstage', f.backstage);
    extra.setRoomLevel('screening', f.screening);
    extra.setRoomLevel('box', f.box);
    office.setLevel(base * f.office);
    workshop.setLevel(base * f.workshop);
    atmosphere.setLevel(base);
  }

  function setInterior(v) {
    interiorLevel = Math.max(0, Math.min(1, v));
    applyAreas();
  }

  function setAreaFade(area, v) {
    if (!(area in areaFade)) return;
    areaFade[area] = Math.max(0, Math.min(1, v));
    applyAreas();
  }

  function setExterior(v) {
    exteriorLevel = Math.max(0, Math.min(1, v));
    exteriorSpots.forEach((s) => {
      s.intensity = 125 * exteriorLevel;
    });
    facadeWash.intensity = 34 * exteriorLevel;
    coolFill.intensity = 0.45 * exteriorLevel;
    entrance.setExterior(exteriorLevel);
    shell.setLevel(exteriorLevel);
  }

  setInterior(interiorLevel);
  setExterior(exteriorLevel);

  /* ---------- 地面反射：以最终亮度做一次静态立方体采样 ---------- */
  const pmrem = renderer ? new THREE.PMREMGenerator(renderer) : null;

  function captureEnv(position, material, hidden) {
    if (!renderer || !material) return;
    const size = quality.tier === 'full' ? 256 : 128;
    const rt = new THREE.WebGLCubeRenderTarget(size);
    const cubeCam = new THREE.CubeCamera(0.2, 80, rt);
    cubeCam.position.set(position[0], position[1], position[2]);

    hidden.forEach((m) => { if (m) m.visible = false; });
    scene.add(cubeCam);
    cubeCam.update(renderer, scene);
    scene.remove(cubeCam);
    hidden.forEach((m) => { if (m) m.visible = true; });

    const env = pmrem.fromCubemap(rt.texture);
    rt.dispose();

    material.envMap = env.texture;
    material.needsUpdate = true;
  }

  setInterior(1);
  captureEnv([0, 1.1, -8.3], mats.floor, [foyer.floorMesh]);
  captureEnv([0, 2.4, -38.6], mats.floorHouse, [auditorium.floor]);
  if (pmrem) pmrem.dispose();
  setInterior(interiorLevel);

  function setShellScheme(id) {
    if (!shellSchemes.includes(id)) return false;
    if (id === shellScheme || shellScheme === 'legacy') return false;
    if (shell.dispose) shell.dispose();
    shellScheme = id;
    shell = makeShell(id);
    shell.setLevel(exteriorLevel);
    return true;
  }

  function update(dt, time) {
    chandelier.update(time);
    // 观众厅吊灯算主光的一部分：演出态里跟着 houseLevel 一起收
    houseChandelier.setLevel(interiorLevel * areaFade.auditorium * (0.14 + 0.86 * auditorium.houseLevel));
    houseChandelier.update(time);
    auditorium.update(dt);
    atmosphere.update(dt);
  }

  return {
    foyer,
    corridor,
    auditorium,
    upper,
    extra,
    office,
    workshop,
    entrance,
    shell,
    setShellScheme,
    getShellScheme: () => shellScheme,
    chandelier,
    houseChandelier,
    atmosphere,
    setInterior,
    setExterior,
    setAreaFade,
    update,
    lights: { interiorSpot, entryFill, sconceLights, exteriorSpots, facadeWash, hemi, coolFill },
    getInteriorLevel: () => interiorLevel,
    getExteriorLevel: () => exteriorLevel,
    getAreaFade: (area) => areaFade[area]
  };
}
