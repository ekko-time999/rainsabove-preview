import * as THREE from 'three';
import { clamp } from './anim.js';

// 带阻尼的环视 + 门厅内小范围移动
export class CameraRig {
  constructor(camera, domElement, { bounds, eyeHeight = 1.64 }) {
    this.camera = camera;
    this.dom = domElement;
    this.bounds = bounds;
    this.eyeHeight = eyeHeight;

    this.position = new THREE.Vector3(0, eyeHeight, -3.0);
    this.velocity = new THREE.Vector3();
    this.forward = 0;
    this.strafe = 0;

    this.yaw = 0;
    this.pitch = 0;
    this.lookVelYaw = 0;
    this.lookVelPitch = 0;
    this.lookAccum = 0;
    this.lookEngaged = false;
    this.pitchMin = -0.24;
    this.pitchMax = 0.3;

    this.enabled = false;
    this.keys = new Set();
    this.touchMove = { forward: false, back: false, left: false, right: false };
    this.dragging = false;
    this.pointerId = null;
    this.lastX = 0;
    this.lastY = 0;
    this.bobTime = 0;
    this.lookSensitivity = 0.0185;
    this.walkSpeed = 1.95;

    this.onLookStart = null;
    this.onLookEnd = null;
    // 可走区域约束：由 main 注入 (x,z) => { x, z, y }，y 为地面标高
    this.constrain = null;
    this.eyeOffset = 1.64;

    camera.rotation.order = 'YXZ';
    this._bind();
    this._syncCamera(0);
  }

  _bind() {
    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (this.dragging) return;
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      this.dragging = true;
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.lookAccum = 0;
      this.lookEngaged = false;
      this.dom.setPointerCapture?.(e.pointerId);
      this.onLookStart?.();
    });

    this.dom.addEventListener('pointermove', (e) => {
      if (!this.dragging || e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      // 移动端先吃掉一小段抖动，再开始给角速度
      if (!this.lookEngaged) {
        const dead = e.pointerType === 'touch' ? 5.5 : 1.6;
        this.lookAccum += Math.hypot(dx, dy);
        if (this.lookAccum < dead) return;
        this.lookEngaged = true;
      }

      // 输入映射到角速度：拖动越快转得越快，松手后自然衰减停住
      this.lookVelYaw -= dx * this.lookSensitivity;
      this.lookVelPitch -= dy * this.lookSensitivity * 0.86;
      this.lookVelYaw = clamp(this.lookVelYaw, -5.2, 5.2);
      this.lookVelPitch = clamp(this.lookVelPitch, -3.2, 3.2);
    });

    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.dragging = false;
      this.pointerId = null;
      this.lookEngaged = false;
      this.lookAccum = 0;
      this.onLookEnd?.();
    };
    this.dom.addEventListener('pointerup', end);
    this.dom.addEventListener('pointercancel', end);
    this.dom.addEventListener('pointerleave', end);

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.code)) {
        this.keys.add(e.code);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.velocity.set(0, 0, 0);
      this.keys.clear();
    }
  }

  setPose(position, target) {
    this.position.copy(position);
    const dir = new THREE.Vector3().subVectors(target, position).normalize();
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = clamp(Math.asin(clamp(dir.y, -1, 1)), this.pitchMin, this.pitchMax);
    this.lookVelYaw = 0;
    this.lookVelPitch = 0;
    this.lookEngaged = false;
    this.velocity.set(0, 0, 0);
    this._syncCamera(0);
  }

  setTouchMove(dir, active) {
    if (dir in this.touchMove) this.touchMove[dir] = active;
  }

  update(dt) {
    if (!this.enabled) return;

    this.yaw += this.lookVelYaw * dt;
    this.pitch += this.lookVelPitch * dt;

    // 角速度衰减：松手后滑一小段再停住，不硬停
    const decay = Math.exp(-8.5 * dt);
    this.lookVelYaw *= decay;
    this.lookVelPitch *= decay;
    this.pitch = clamp(this.pitch, this.pitchMin, this.pitchMax);

    let f = 0;
    let s = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.touchMove.forward) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown') || this.touchMove.back) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight') || this.touchMove.right) s += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft') || this.touchMove.left) s -= 1;

    const targetVel = new THREE.Vector3();
    if (f !== 0 || s !== 0) {
      const dir = new THREE.Vector3(
        -Math.sin(this.yaw) * f + Math.cos(this.yaw) * s,
        0,
        -Math.cos(this.yaw) * f - Math.sin(this.yaw) * s
      );
      dir.normalize();
      targetVel.copy(dir).multiplyScalar(this.walkSpeed);
    }

    const moveK = 1 - Math.exp(-9 * dt);
    this.velocity.lerp(targetVel, moveK);
    this.position.addScaledVector(this.velocity, dt);

    const b = this.bounds;
    if (this.constrain) {
      const c = this.constrain(this.position.x, this.position.z);
      if (c) {
        this.position.x = c.x;
        this.position.z = c.z;
        if (typeof c.y === 'number') {
          // 眼高平滑跟随地面：门槛、踏步、短坡都不再让视线一跳
          const targetEye = c.y + this.eyeOffset;
          const eyeK = 1 - Math.exp(-9 * dt);
          this.eyeHeight += (targetEye - this.eyeHeight) * eyeK;
          if (Math.abs(targetEye - this.eyeHeight) < 0.002) this.eyeHeight = targetEye;
        }
      }
    } else {
      this.position.x = clamp(this.position.x, b.minX, b.maxX);
      this.position.z = clamp(this.position.z, b.minZ, b.maxZ);
    }

    const speed = this.velocity.length();

    // 行走时把视线慢慢拉回水平基线，避免一路抬着头或低着头
    if (speed > 0.3 && !this.dragging) {
      const settle = 1 - Math.exp(-1.35 * dt);
      this.pitch += (0 - this.pitch) * settle;
    }

    this.bobTime += dt * (5.5 + speed * 1.6);
    const bob = speed > 0.15 ? Math.sin(this.bobTime) * 0.009 * Math.min(1, speed / 2.2) : 0;

    this._syncCamera(bob);
  }

  _syncCamera(bob = 0) {
    this.camera.position.set(this.position.x, this.eyeHeight + bob, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
