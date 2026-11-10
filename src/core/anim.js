// 极简补间系统，避免额外依赖
const running = new Set();

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint = (t) =>
  t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

export function tween({ duration = 1, delay = 0, ease = easeInOutCubic, onUpdate, onComplete }) {
  const item = {
    time: -delay,
    duration: Math.max(0.0001, duration),
    ease,
    onUpdate,
    onComplete
  };
  running.add(item);
  return item;
}

export function cancelTween(item) {
  running.delete(item);
}

export function updateTweens(dt) {
  for (const item of running) {
    item.time += dt;
    if (item.time < 0) continue;
    const raw = Math.min(1, item.time / item.duration);
    item.onUpdate?.(item.ease(raw), raw);
    if (raw >= 1) {
      running.delete(item);
      item.onComplete?.();
    }
  }
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const damp = (current, target, lambda, dt) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt));
