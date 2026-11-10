import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 将大量静态金色/木质线条合并成少量 draw call
export class BoxBatch {
  constructor(material, { castShadow = false, receiveShadow = true } = {}) {
    this.material = material;
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
    this.geometries = [];
  }

  add(w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      q,
      new THREE.Vector3(1, 1, 1)
    );
    geo.applyMatrix4(m);
    this.geometries.push(geo);
    return this;
  }

  build(parent) {
    if (!this.geometries.length) return null;
    const merged = mergeGeometries(this.geometries, false);
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    const mesh = new THREE.Mesh(merged, this.material);
    mesh.castShadow = this.castShadow;
    mesh.receiveShadow = this.receiveShadow;
    parent.add(mesh);
    return mesh;
  }
}

/* 静态合批：把同一空间里同材质、同阴影、同渲染次序的静止网格合成一份几何。
   只处理不透明、普通 Mesh；InstancedMesh、精灵、透明件、着色器件，
   以及挂了 noMerge / dynamic 标记的节点（门扇、火焰等可动件）一律跳过。
   顶点、法线、UV 原样带过去，造型不做任何简化。 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.userData.noMerge || o.userData.dynamic || o.userData.isFlame) return;
    let p = o.parent;
    while (p && p !== root) {
      if (p.userData.noMerge || p.userData.dynamic) return;
      p = p.parent;
    }
    const mat = o.material;
    if (!mat || Array.isArray(mat)) return;
    if (mat.transparent || mat.isShaderMaterial || mat.depthWrite === false) return;
    const geo = o.geometry;
    if (!geo || geo.morphAttributes && Object.keys(geo.morphAttributes).length) return;
    const attrs = Object.keys(geo.attributes).sort().join(',');
    const key = [
      mat.uuid,
      o.castShadow ? 1 : 0,
      o.receiveShadow ? 1 : 0,
      o.renderOrder,
      geo.index ? 'i' : 'n',
      attrs
    ].join('|');
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mat, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(o);
  });

  let merged = 0;
  const matrix = new THREE.Matrix4();
  for (const bucket of buckets.values()) {
    if (bucket.items.length < 2) continue;
    const geos = bucket.items.map((o) => {
      const g = o.geometry.clone();
      matrix.multiplyMatrices(toRoot, o.matrixWorld);
      g.applyMatrix4(matrix);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.recv;
    mesh.renderOrder = bucket.order;
    mesh.name = 'static-batch';
    root.add(mesh);
    bucket.items.forEach((o) => o.parent.remove(o));
    merged++;
  }
  return merged;
}

// 柔软帘幕：带起伏褶皱的平面
// 顶部收褶、向下逐渐放松，底部折更深并带一点裙边下垂
export function curtainGeometry(width, height, folds = 7, amplitude = 0.13) {
  const geo = new THREE.PlaneGeometry(width, height, 60, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const u = (x / width) + 0.5;
    const v = (y / height) + 0.5;

    // 上端被挂杆收住，下端受重力略微展开
    const spread = 1 + 0.04 * (1 - v);
    const gather = 1 - 0.055 * Math.exp(-Math.pow((v - 0.94) / 0.13, 2));
    pos.setX(i, x * spread * gather);

    const phase = u * Math.PI * 2 * folds;
    const fold = Math.sin(phase) * amplitude;
    const ripple = Math.sin(phase * 1.5 + 0.7) * amplitude * 0.3;
    const depth = 0.52 + 0.48 * (1 - v);
    pos.setZ(i, (fold + ripple) * depth);

    // 底部裙边轻微下垂，避免下缘像刀切一样直
    if (v < 0.1) {
      const sag = (1 - v / 0.1) * 0.028 * (0.6 + 0.4 * Math.sin(u * Math.PI * folds));
      pos.setY(i, y - sag);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function addGlowSprite(mats, parent, x, y, z, scale = 0.5, opacity = 0.66) {
  const material = mats.glow.clone();
  material.opacity = opacity;
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y, z);
  sprite.scale.set(scale, scale, 1);
  sprite.userData.baseOpacity = opacity;
  parent.add(sprite);
  return sprite;
}

/* 接触阴影：用同一个径向渐变贴图做柔和的暗部贴花，合并或实例化后只有一次 draw call */
export function makeContactMaterial(mats, opacity = 0.4) {
  return new THREE.MeshBasicMaterial({
    map: mats.glowMap,
    color: 0x000000,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false
  });
}

export function contactPatch(x, y, z, w, d, flat = true, rotY = 0) {
  const geo = new THREE.PlaneGeometry(w, d);
  if (flat) geo.rotateX(-Math.PI / 2);
  if (rotY) geo.rotateY(rotY);
  geo.translate(x, y, z);
  return geo;
}

/* 一组落地家具的接触阴影：所有贴花并成一张，只增加一次 draw call */
export function contactBatch(parent, mats, patches, opacity = 0.36) {
  if (!patches.length) return null;
  const geos = patches.map(([x, y, z, w, d]) => contactPatch(x, y, z, w, d));
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), makeContactMaterial(mats, opacity));
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

// 带拱形洞口的整面墙
export function archedWallGeometry(width, height, halfW, springY, rise, depth, seg = 36) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  shape.lineTo(-width / 2, height);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-halfW, 0);
  hole.lineTo(-halfW, springY);
  hole.absellipse(0, springY, halfW, rise, Math.PI, 0, true);
  hole.lineTo(halfW, 0);
  hole.closePath();
  shape.holes.push(hole);

  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: seg });
}

// 沿椭圆拱曲线铺一圈楔石（用合并盒体，零额外材质）
export function addArchRing(batch, halfW, springY, rise, thickness, depth, z, count = 26) {
  for (let i = 0; i < count; i++) {
    const t0 = Math.PI - (i / count) * Math.PI;
    const t1 = Math.PI - ((i + 1) / count) * Math.PI;
    const t = (t0 + t1) / 2;
    const x = halfW * Math.cos(t);
    const y = springY + rise * Math.sin(t);
    const p0 = new THREE.Vector2(halfW * Math.cos(t0), springY + rise * Math.sin(t0));
    const p1 = new THREE.Vector2(halfW * Math.cos(t1), springY + rise * Math.sin(t1));
    const len = p0.distanceTo(p1) * 1.12;
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    batch.add(len, thickness, depth, x, y, z, 0, 0, ang);
  }
}

// 半圆环拱形饰带
export function archBandGeometry(innerR, outerR, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-outerR, 0);
  shape.absarc(0, 0, outerR, Math.PI, 0, true);
  shape.lineTo(innerR, 0);
  shape.absarc(0, 0, innerR, 0, Math.PI, false);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 32
  });
}
