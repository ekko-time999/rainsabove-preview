import * as THREE from 'three';

let seed = 20261107;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
const rand = (min, max) => min + random() * (max - min);

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

function canvasTexture(canvas, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------- 地面大理石 ---------------- */
function drawVein(ctx, x0, y0, x1, y1, color, alpha, width) {
  const mx = (x0 + x1) / 2 + rand(-90, 90);
  const my = (y0 + y1) / 2 + rand(-90, 90);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawFloorVeins(ctx, x, y, w, h, dark, light) {
  const count = Math.round(7 + random() * 4);
  for (let i = 0; i < count; i++) {
    const vertical = random() > 0.5;
    const sx = x + rand(0, w);
    const sy = y + rand(0, h);
    const ex = vertical ? sx + rand(-w * 0.4, w * 0.4) : x + (random() > 0.5 ? w : 0);
    const ey = vertical ? y + (random() > 0.5 ? h : 0) : sy + rand(-h * 0.4, h * 0.4);
    drawVein(ctx, sx, sy, ex, ey, dark, rand(0.05, 0.16), rand(0.6, 2.2));
    if (random() > 0.55) {
      drawVein(ctx, sx + 6, sy + 4, ex + 6, ey + 4, light, rand(0.04, 0.11), rand(0.4, 1.2));
    }
  }
}

function createFloorTexture(quality) {
  const S = quality.tier === 'full' ? 2048 : 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  const m = Math.round(S * 0.065);
  const inner = S - m * 2;

  ctx.fillStyle = '#241a16';
  ctx.fillRect(0, 0, S, S);

  const bg = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.72);
  bg.addColorStop(0, '#3a2a21');
  bg.addColorStop(1, '#181110');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  const cols = 7;
  const rows = 8;
  const tw = inner / cols;
  const th = inner / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = m + c * tw;
      const y = m + r * th;
      const dark = (r + c) % 2 === 0;
      ctx.fillStyle = dark ? '#3d211e' : '#8d7c6a';
      ctx.fillRect(x, y, tw, th);

      const grad = ctx.createLinearGradient(x, y, x + tw, y + th);
      if (dark) {
        grad.addColorStop(0, 'rgba(94, 42, 39, 0.45)');
        grad.addColorStop(1, 'rgba(18, 8, 8, 0.5)');
      } else {
        grad.addColorStop(0, 'rgba(226, 212, 186, 0.26)');
        grad.addColorStop(1, 'rgba(100, 84, 66, 0.2)');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, tw, th);

      drawFloorVeins(
        ctx,
        x,
        y,
        tw,
        th,
        dark ? '#d9c7ad' : '#5e4a3b',
        dark ? '#170b0b' : '#eee1c8'
      );

      if (random() > 0.75) {
        ctx.beginPath();
        ctx.arc(x + rand(10, tw - 10), y + rand(10, th - 10), rand(1, 3.5), 0, Math.PI * 2);
        ctx.fillStyle = dark ? 'rgba(210,190,160,.08)' : 'rgba(70,50,40,.08)';
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(20, 14, 12, 0.38)';
      ctx.lineWidth = Math.max(1, S / 1600);
      ctx.strokeRect(x, y, tw, th);
    }
  }

  // 金线边框
  const border = (inset, width, alpha) => {
    ctx.strokeStyle = `rgba(203, 166, 99, ${alpha})`;
    ctx.lineWidth = width;
    ctx.strokeRect(m - inset, m - inset, inner + inset * 2, inner + inset * 2);
  };
  ctx.fillStyle = '#2f241c';
  ctx.fillRect(0, 0, m, S);
  ctx.fillRect(S - m, 0, m, S);
  ctx.fillRect(0, 0, S, m);
  ctx.fillRect(0, S - m, S, m);
  border(m * 0.62, Math.max(2, S / 900), 0.75);
  border(m * 0.40, Math.max(1, S / 1400), 0.55);
  border(4, Math.max(1, S / 1600), 0.35);

  // 边带上的菱形纹样
  ctx.save();
  ctx.strokeStyle = 'rgba(203, 166, 99, 0.34)';
  ctx.lineWidth = Math.max(1, S / 1500);
  const step = m * 0.64;
  for (let i = m * 0.8; i < S - m * 0.8; i += step) {
    for (const p of [
      [i, m * 0.5],
      [i, S - m * 0.5],
      [m * 0.5, i],
      [S - m * 0.5, i]
    ]) {
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - step * 0.16);
      ctx.lineTo(p[0] + step * 0.16, p[1]);
      ctx.lineTo(p[0], p[1] + step * 0.16);
      ctx.lineTo(p[0] - step * 0.16, p[1]);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // 中央圆章
  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.215;
  ctx.save();
  const disc = ctx.createRadialGradient(cx, cy, R * 0.08, cx, cy, R);
  disc.addColorStop(0, '#5e2626');
  disc.addColorStop(0.55, '#45201e');
  disc.addColorStop(1, '#251312');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42);
    ctx.lineTo(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93);
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(216, 180, 112, 0.75)' : 'rgba(216, 180, 112, 0.3)';
    ctx.lineWidth = i % 4 === 0 ? S / 620 : S / 1600;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.93, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(219, 185, 118, 0.78)';
  ctx.lineWidth = S / 700;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(219, 185, 118, 0.3)';
  ctx.lineWidth = S / 1600;
  ctx.stroke();

  // 八瓣花心
  ctx.translate(cx, cy);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.34, R * 0.1, R * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(188, 148, 88, 0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(224, 190, 126, 0.45)';
    ctx.lineWidth = S / 1800;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(30, 14, 12, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(228, 194, 132, 0.8)';
  ctx.lineWidth = S / 900;
  ctx.stroke();
  ctx.restore();

  // 大面积磨旧与光斑
  const patina = ctx.createRadialGradient(S * 0.28, S * 0.22, 0, S * 0.28, S * 0.22, S * 0.5);
  patina.addColorStop(0, 'rgba(255, 244, 210, 0.06)');
  patina.addColorStop(1, 'rgba(255, 244, 210, 0)');
  ctx.fillStyle = patina;
  ctx.fillRect(0, 0, S, S);
  const dusk = ctx.createRadialGradient(S * 0.8, S * 0.8, 0, S * 0.8, S * 0.8, S * 0.6);
  dusk.addColorStop(0, 'rgba(10, 5, 4, 0)');
  dusk.addColorStop(1, 'rgba(10, 5, 4, 0.32)');
  ctx.fillStyle = dusk;
  ctx.fillRect(0, 0, S, S);

  return canvasTexture(canvas, { repeat: [1, 1], aniso: quality.aniso });
}

/* ---------------- 大理石（柱 / 饰带） ---------------- */
function createMarbleTexture(quality) {
  const S = quality.tier === 'full' ? 1024 : 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#d3c5aa';
  ctx.fillRect(0, 0, S, S);
  const warm = ctx.createLinearGradient(0, 0, S, S);
  warm.addColorStop(0, 'rgba(255, 250, 233, 0.4)');
  warm.addColorStop(1, 'rgba(132, 109, 84, 0.25)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, S, S);

  for (let i = 0; i < 46; i++) {
    const x0 = rand(0, S);
    const y0 = rand(0, S);
    const x1 = x0 + rand(-S * 0.7, S * 0.7);
    const y1 = y0 + rand(-S * 0.7, S * 0.7);
    drawVein(ctx, x0, y0, x1, y1, '#7b6a58', rand(0.04, 0.15), rand(0.6, 3.4));
    if (i % 3 === 0) drawVein(ctx, x0, y0, x1, y1, '#fff7e8', rand(0.05, 0.13), rand(0.5, 1.6));
  }

  for (let i = 0; i < 120; i++) {
    ctx.beginPath();
    ctx.arc(rand(0, S), rand(0, S), rand(0.4, 1.6), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(90, 74, 60, ${rand(0.02, 0.08)})`;
    ctx.fill();
  }

  return canvasTexture(canvas, { repeat: [1, 1], aniso: quality.aniso });
}

/* ---------------- 木纹 ---------------- */
function createWoodTexture(quality) {
  const W = 512;
  const H = quality.tier === 'full' ? 1024 : 512;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#2a1811';
  ctx.fillRect(0, 0, W, H);

  const wash = ctx.createLinearGradient(0, 0, W, 0);
  wash.addColorStop(0, 'rgba(90, 55, 34, 0.26)');
  wash.addColorStop(0.3, 'rgba(20, 10, 6, 0.1)');
  wash.addColorStop(0.65, 'rgba(100, 64, 40, 0.14)');
  wash.addColorStop(1, 'rgba(20, 10, 6, 0.24)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 300; i++) {
    const x = rand(0, W);
    const len = rand(80, H * 1.1);
    const y = rand(-H * 0.2, H);
    const wobble = rand(-8, 8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + wobble, y + len * 0.35, x - wobble, y + len * 0.7, x + wobble * 0.4, y + len);
    ctx.strokeStyle = random() > 0.42 ? `rgba(12, 6, 4, ${rand(0.08, 0.28)})` : `rgba(128, 84, 52, ${rand(0.04, 0.16)})`;
    ctx.lineWidth = rand(0.5, 3);
    ctx.stroke();
  }

  for (let i = 0; i < 3; i++) {
    const cx = rand(W * 0.16, W * 0.84);
    const cy = rand(H * 0.15, H * 0.85);
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rand(3, 9), rand(14, 32), 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(10, 5, 4, ${rand(0.14, 0.3)})`;
      ctx.lineWidth = rand(0.8, 1.8);
      ctx.stroke();
    }
  }

  return canvasTexture(canvas, { repeat: [1, 1], aniso: quality.aniso });
}

/* ---------------- 墙布大马士革 ---------------- */
function drawDamaskMotif(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(118, 35, 41, 0.42)';
  ctx.strokeStyle = 'rgba(131, 43, 48, 0.5)';
  ctx.lineWidth = Math.max(1, s * 0.02);

  // 中央叶形
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.12);
  ctx.bezierCurveTo(s * 0.46, -s * 0.5, s * 0.34, s * 0.36, 0, s * 1.18);
  ctx.bezierCurveTo(-s * 0.34, s * 0.36, -s * 0.46, -s * 0.5, 0, -s * 1.12);
  ctx.fill();

  // 顶部冠叶
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(i * s * 0.21, -s * 1.14, s * 0.075, s * 0.22, i * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // 两侧卷草
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * s * 0.14, s * 0.46);
    ctx.bezierCurveTo(dir * s * 0.78, s * 0.4, dir * s * 0.92, -s * 0.16, dir * s * 0.48, -s * 0.78);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(dir * s * 0.48, -s * 0.8, s * 0.07, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(dir * s * 0.18, s * 0.92);
    ctx.bezierCurveTo(dir * s * 0.62, s * 1.12, dir * s * 0.88, s * 0.66, dir * s * 0.52, s * 0.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(dir * s * 0.56, s * 0.5, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }

  // 细茎
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.9);
  ctx.lineTo(0, s * 1.05);
  ctx.strokeStyle = 'rgba(146, 55, 58, 0.3)';
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();

  ctx.restore();
}

function createDamaskTexture(quality) {
  const S = quality.tier === 'full' ? 1024 : 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#4b151a';
  ctx.fillRect(0, 0, S, S);

  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, 'rgba(96, 26, 32, 0.55)');
  grad.addColorStop(0.5, 'rgba(49, 12, 15, 0.25)');
  grad.addColorStop(1, 'rgba(88, 23, 29, 0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  // 丝绒竖向光泽
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255, 188, 180, ${rand(0.008, 0.03)})`;
    ctx.fillRect(rand(0, S), 0, rand(1, 7), S);
  }

  const cell = S / 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      drawDamaskMotif(ctx, c * cell + cell / 2, r * cell + cell / 2, cell * 0.29);
      drawDamaskMotif(ctx, c * cell + cell / 2 + 3, r * cell + cell / 2 + 3, cell * 0.29);
    }
  }

  // 极细网格，增加织物层次
  ctx.strokeStyle = 'rgba(18, 5, 6, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i < S; i += S / 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(S, i);
    ctx.stroke();
  }

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255, 210, 190, ${rand(0.004, 0.018)})`;
    ctx.fillRect(rand(0, S), rand(0, S), 1, 1);
  }

  return canvasTexture(canvas, { repeat: [1.2, 1.6], aniso: quality.aniso });
}

/* ---------------- 素丝绒 ---------------- */
function createVelvetTexture(quality) {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#56161c';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = rand(0, S);
    const grad = ctx.createLinearGradient(x, 0, x + rand(6, 30), 0);
    grad.addColorStop(0, 'rgba(255, 160, 150, 0)');
    grad.addColorStop(0.5, `rgba(255, 168, 158, ${rand(0.01, 0.055)})`);
    grad.addColorStop(1, 'rgba(30, 4, 6, 0.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, rand(8, 34), S);
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255, 200, 190, ${rand(0.003, 0.022)})`;
    ctx.fillRect(rand(0, S), rand(0, S), 1, 1);
  }
  return canvasTexture(canvas, { repeat: [3, 3], aniso: quality.aniso });
}

/* ---------------- 外墙石材 ---------------- */
function createStoneTexture(quality) {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#2c2521';
  ctx.fillRect(0, 0, S, S);

  const rowH = 128;
  for (let r = 0; r < S / rowH; r++) {
    const offset = r % 2 === 0 ? 0 : 128;
    for (let x = -256 + offset; x < S; x += 256) {
      const shade = rand(0.04, 0.16);
      ctx.fillStyle = `rgba(${random() > 0.5 ? '255, 230, 200' : '0, 0, 0'}, ${shade})`;
      ctx.fillRect(x + 3, r * rowH + 3, 250, rowH - 6);
    }
    ctx.fillStyle = 'rgba(10, 7, 6, 0.5)';
    ctx.fillRect(0, r * rowH, S, 3);
  }
  for (let x = 0; x < S; x += 256) {
    ctx.fillStyle = 'rgba(10, 7, 6, 0.32)';
    ctx.fillRect(x, 0, 2, S);
  }

  for (let i = 0; i < 20000; i++) {
    ctx.fillStyle = `rgba(${random() > 0.5 ? '255, 236, 214' : '0, 0, 0'}, ${rand(0.006, 0.035)})`;
    ctx.fillRect(rand(0, S), rand(0, S), rand(1, 3), rand(1, 3));
  }

  return canvasTexture(canvas, { repeat: [2.4, 2.2], aniso: quality.aniso });
}

/* ---------------- 光晕 ---------------- */
function createGlowTexture() {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255, 240, 205, 1)');
  grad.addColorStop(0.18, 'rgba(255, 214, 150, 0.75)');
  grad.addColorStop(0.45, 'rgba(255, 166, 90, 0.22)');
  grad.addColorStop(1, 'rgba(255, 140, 60, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas, { repeat: [1, 1], aniso: 1 });
}

/* ---------------- 扇形气窗 ---------------- */
function createFanlightTexture() {
  const W = 1024;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const grad = ctx.createRadialGradient(W / 2, H, 20, W / 2, H, W * 0.65);
  grad.addColorStop(0, '#ffe0ae');
  grad.addColorStop(0.3, '#e8a464');
  grad.addColorStop(0.7, '#8a3d1e');
  grad.addColorStop(1, '#25100a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#1a0b07';
  ctx.lineWidth = 10;
  for (let i = 0; i <= 14; i++) {
    const x = (i / 14) * W;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.lineTo(x, -10);
    ctx.stroke();
  }
  ctx.lineWidth = 6;
  for (let r = 70; r < 260; r += 62) {
    ctx.beginPath();
    ctx.arc(W / 2, H, r, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 205, 145, 0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 14; i++) {
    const x = (i / 14) * W;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.lineTo(x, -10);
    ctx.stroke();
  }

  ctx.fillStyle = '#1a0b07';
  ctx.fillRect(0, H - 12, W, 12);
  ctx.fillStyle = 'rgba(229, 184, 116, 0.8)';
  ctx.fillRect(0, H - 16, W, 3);

  return canvasTexture(canvas, { repeat: [1, 1], aniso: 4 });
}

/* ---------------- 门额招牌 ---------------- */
function drawSpacedText(ctx, text, cx, y, spacing) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = cx - total / 2;
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x + widths[i] / 2, y);
    x += widths[i] + spacing;
  }
}

function createSignTexture() {
  const W = 1024;
  const H = 320;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#100907';
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, W * 0.55);
  glow.addColorStop(0, 'rgba(120, 66, 28, 0.35)');
  glow.addColorStop(1, 'rgba(20, 10, 6, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(205, 168, 102, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(30, 26, W - 60, H - 52);
  ctx.strokeStyle = 'rgba(205, 168, 102, 0.22)';
  ctx.strokeRect(44, 40, W - 88, H - 80);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 中文主字：先用较大模糊做夜光，再用无模糊的亮色重描一次，远处看发光、近处字口不糊
  ctx.shadowColor = 'rgba(255, 186, 112, 0.5)';
  ctx.shadowBlur = 16;

  ctx.font = '400 168px "Songti SC", "STSong", "SimSun", serif';
  ctx.fillStyle = '#e3c28b';
  drawSpacedText(ctx, '泫咏', W / 2, 118, 52);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f2d7a4';
  drawSpacedText(ctx, '泫咏', W / 2, 118, 52);

  // 拉丁副行：全大写品牌名，字距放开，单行排布
  ctx.shadowColor = 'rgba(255, 186, 112, 0.35)';
  ctx.shadowBlur = 8;
  ctx.font = '300 34px Georgia, "Times New Roman", serif';
  ctx.fillStyle = 'rgba(219, 190, 142, 0.82)';
  drawSpacedText(ctx, 'RAINSABOVE', W / 2, 252, 13);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(238, 212, 165, 0.95)';
  drawSpacedText(ctx, 'RAINSABOVE', W / 2, 252, 13);

  ctx.fillStyle = 'rgba(205, 168, 102, 0.45)';
  ctx.fillRect(W / 2 - 44, 208, 88, 1);

  return canvasTexture(canvas, { repeat: [1, 1], aniso: 4 });
}

/* ---------------- 拱顶饰章 ---------------- */
function createCrestTexture() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);

  ctx.strokeStyle = 'rgba(207, 172, 106, 0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 232, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(207, 172, 106, 0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, 210, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 190, Math.sin(a) * 190);
    ctx.lineTo(Math.cos(a) * 232, Math.sin(a) * 232);
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(224, 189, 126, 0.8)' : 'rgba(224, 189, 126, 0.28)';
    ctx.lineWidth = i % 4 === 0 ? 4 : 1.4;
    ctx.stroke();
  }

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, -116, 22, 64, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(219, 184, 120, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(18, 9, 7, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(229, 196, 134, 0.85)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = 'rgba(229, 196, 134, 0.9)';
  ctx.font = '400 82px "Songti SC", "SimSun", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('幕', 0, 6);

  return canvasTexture(canvas, { repeat: [1, 1], aniso: 4 });
}

/* ---------------- 门厅座钟 ---------------- */
function createClockTexture() {
  const S = 512;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#0d0806';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);

  const face = ctx.createRadialGradient(-20, -20, 20, 0, 0, 220);
  face.addColorStop(0, '#efe2c7');
  face.addColorStop(0.7, '#d6c3a2');
  face.addColorStop(1, '#a98c63');
  ctx.beginPath();
  ctx.arc(0, 0, 220, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = '#b68f55';
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60, 40, 24, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 200, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#33231a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '300 42px Georgia, serif';
  const nums = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(nums[i], Math.cos(a) * 160, Math.sin(a) * 160);
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const inner = i % 5 === 0 ? 182 : 192;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * 202, Math.sin(a) * 202);
    ctx.strokeStyle = 'rgba(51, 35, 26, 0.6)';
    ctx.lineWidth = i % 5 === 0 ? 3 : 1;
    ctx.stroke();
  }

  ctx.fillStyle = '#22150f';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-36, -88);
  ctx.lineTo(36, -88);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.rotate(Math.PI * 1.32);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-20, -130);
  ctx.lineTo(20, -130);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#b68f55';
  ctx.fill();

  ctx.fillStyle = 'rgba(51, 35, 26, 0.6)';
  ctx.font = '300 22px Georgia, serif';
  ctx.fillText('THÉÂTRE', 0, 132);

  return canvasTexture(canvas, { repeat: [1, 1], aniso: 4 });
}

/* ---------------- 观众席地毯 ---------------- */
function createCarpetTexture(quality) {
  const S = quality.tier === 'full' ? 512 : 256;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = '#3a1014';
  ctx.fillRect(0, 0, S, S);

  const field = ctx.createRadialGradient(S / 2, S / 2, S * 0.08, S / 2, S / 2, S * 0.78);
  field.addColorStop(0, 'rgba(126, 34, 40, 0.34)');
  field.addColorStop(0.6, 'rgba(78, 19, 24, 0.16)');
  field.addColorStop(1, 'rgba(20, 5, 7, 0.6)');
  ctx.fillStyle = field;
  ctx.fillRect(0, 0, S, S);

  // 簇绒织纹：细密的经纬线，远看是绒面，近看有织物感
  const step = Math.max(2, Math.round(S / 160));
  ctx.lineWidth = 1;
  for (let i = 0; i < S; i += step) {
    ctx.strokeStyle = 'rgba(255, 186, 174, 0.055)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, S);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(14, 3, 4, 0.11)';
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(S, i);
    ctx.stroke();
  }

  // 低对比团花，避免地毯像一整块纯色
  ctx.save();
  ctx.translate(S / 2, S / 2);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, -S * 0.16, S * 0.045, S * 0.14, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(205, 140, 110, 0.16)';
    ctx.lineWidth = Math.max(1, S / 420);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.06, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(214, 160, 120, 0.2)';
  ctx.stroke();
  ctx.restore();

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${random() > 0.5 ? '255, 205, 190' : '8, 2, 3'}, ${rand(0.008, 0.05)})`;
    ctx.fillRect(rand(0, S), rand(0, S), rand(1, 3), rand(1, 3));
  }

  const wear = ctx.createLinearGradient(0, 0, 0, S);
  wear.addColorStop(0, 'rgba(255, 226, 200, 0.04)');
  wear.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, S, S);

  return canvasTexture(canvas, { repeat: [1, 5], aniso: quality.aniso });
}

/* ---------------- 排号铜牌 ---------------- */
function createRowPlateTexture(quality) {
  const W = quality.tier === 'full' ? 1024 : 512;
  const H = quality.tier === 'full' ? 160 : 96;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#120a07';
  ctx.fillRect(0, 0, W, H);

  const cells = 9;
  const cw = W / cells;
  for (let i = 0; i < cells; i++) {
    const x = i * cw;
    const pad = cw * 0.1;
    ctx.fillStyle = '#1d110b';
    ctx.fillRect(x + pad, H * 0.12, cw - pad * 2, H * 0.76);
    ctx.strokeStyle = 'rgba(197, 159, 96, 0.7)';
    ctx.lineWidth = Math.max(1, H / 80);
    ctx.strokeRect(x + pad, H * 0.12, cw - pad * 2, H * 0.76);
    ctx.strokeStyle = 'rgba(197, 159, 96, 0.26)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad + 3, H * 0.12 + 3, cw - pad * 2 - 6, H * 0.76 - 6);

    ctx.fillStyle = '#e0ba7f';
    ctx.font = `400 ${Math.round(H * 0.5)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), x + cw / 2, H * 0.52);
  }

  const tex = canvasTexture(canvas, { repeat: [1, 1], aniso: 4 });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* ---------------- 基础色板 ----------------
   只收四种材质的色与粗糙度（金、丝绒、木、大理石），外加两种光色温。
   其余参数（金属度、清漆、绒面、贴图等）仍留在各自材质里，不在这里动。 */
export const PALETTE = {
  gold: { color: 0xb78a4d, roughness: 0.31 },
  goldDeep: { color: 0x8c6536, roughness: 0.45 },
  brass: { color: 0xd8a95f, roughness: 0.19 },
  velvet: { color: 0xffffff, roughness: 0.88 },
  wood: { color: 0xffffff, roughness: 0.44 },
  marble: { color: 0xffffff, roughness: 0.28 },
  // 两种光色：暖光用于台灯、壁灯、工作灯；冷光用于窗光与镜面补光
  warm: 0xffb070,
  cool: 0x9fb0bf
};

/* ---------------- 材质集合 ---------------- */
export function createMaterials(quality) {
  const floorMap = createFloorTexture(quality);
  const marbleMap = createMarbleTexture(quality);
  const woodMap = createWoodTexture(quality);
  const damaskMap = createDamaskTexture(quality);
  const velvetMap = createVelvetTexture(quality);
  const stoneMap = createStoneTexture(quality);
  const glowMap = createGlowTexture();
  const fanlightMap = createFanlightTexture();
  const signMap = createSignTexture();
  const crestMap = createCrestTexture();
  const clockMap = createClockTexture();
  const carpetMap = createCarpetTexture(quality);
  const rowPlateMap = createRowPlateTexture(quality);

  const gold = new THREE.MeshStandardMaterial({
    color: PALETTE.gold.color,
    metalness: 0.95,
    roughness: PALETTE.gold.roughness,
    envMapIntensity: 1.25
  });

  const goldDeep = new THREE.MeshStandardMaterial({
    color: PALETTE.goldDeep.color,
    metalness: 0.9,
    roughness: PALETTE.goldDeep.roughness,
    envMapIntensity: 1.0
  });

  const brass = new THREE.MeshStandardMaterial({
    color: PALETTE.brass.color,
    metalness: 0.98,
    roughness: PALETTE.brass.roughness,
    envMapIntensity: 1.5
  });

  const wood = new THREE.MeshPhysicalMaterial({
    map: woodMap,
    color: PALETTE.wood.color,
    roughness: PALETTE.wood.roughness,
    metalness: 0.04,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.55
  });

  const marble = new THREE.MeshPhysicalMaterial({
    map: marbleMap,
    color: PALETTE.marble.color,
    roughness: PALETTE.marble.roughness,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.8
  });

  const plaster = new THREE.MeshStandardMaterial({
    color: 0x2a1914,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: 0.25
  });

  const plasterDark = new THREE.MeshStandardMaterial({
    color: 0x1b100c,
    roughness: 0.94
  });

  const ceiling = new THREE.MeshStandardMaterial({
    color: 0x1e120d,
    roughness: 0.9,
    envMapIntensity: 0.2
  });

  const velvetWall = new THREE.MeshPhysicalMaterial({
    map: damaskMap,
    bumpMap: damaskMap,
    bumpScale: 0.012,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0xd9a0a0),
    sheenRoughness: 0.55,
    envMapIntensity: 0.35
  });

  const velvet = new THREE.MeshPhysicalMaterial({
    map: velvetMap,
    color: PALETTE.velvet.color,
    roughness: PALETTE.velvet.roughness,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color(0xff95a0),
    sheenRoughness: 0.42,
    envMapIntensity: 0.3,
    side: THREE.DoubleSide
  });

  const stone = new THREE.MeshStandardMaterial({
    map: stoneMap,
    color: 0x9a8a7a,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.25
  });

  // 观众席地毯：高粗糙、低反射，与金饰 / 木作 / 大理石拉开质感
  const carpet = new THREE.MeshPhysicalMaterial({
    map: carpetMap,
    bumpMap: carpetMap,
    bumpScale: 0.022,
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
    sheen: 0.7,
    sheenColor: new THREE.Color(0x9c4a44),
    sheenRoughness: 0.82,
    envMapIntensity: 0.12
  });

  // 反射由一次静态立方体采样写入 envMap（见 world.js），无需逐帧镜面
  const floor = new THREE.MeshPhysicalMaterial({
    map: floorMap,
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.25
  });

  const floorDark = new THREE.MeshPhysicalMaterial({
    map: floorMap,
    color: 0x4e443c,
    roughness: 0.62,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.5
  });

  const crystal = new THREE.MeshPhysicalMaterial({
    color: 0xfff2dc,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.5,
    envMapIntensity: 2.3,
    emissive: new THREE.Color(0x2a1a0e),
    emissiveIntensity: 0.6,
    depthWrite: false
  });

  const warmGlass = new THREE.MeshStandardMaterial({
    color: 0x2d150a,
    emissive: new THREE.Color(0xff9f55),
    emissiveIntensity: 2.2,
    roughness: 0.35,
    metalness: 0,
    transparent: true,
    opacity: 0.92
  });

  const fanlight = new THREE.MeshBasicMaterial({
    map: fanlightMap,
    toneMapped: true
  });

  const sign = new THREE.MeshBasicMaterial({
    map: signMap,
    toneMapped: true
  });

  const crest = new THREE.MeshBasicMaterial({
    map: crestMap,
    transparent: true,
    depthWrite: false,
    toneMapped: true
  });

  const clock = new THREE.MeshBasicMaterial({
    map: clockMap,
    toneMapped: true
  });

  const mirrorDark = new THREE.MeshStandardMaterial({
    color: 0x241f1b,
    metalness: 0.95,
    roughness: 0.16,
    envMapIntensity: 1.5
  });

  const glow = new THREE.SpriteMaterial({
    map: glowMap,
    color: 0xffbb80,
    transparent: true,
    opacity: 0.66,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  return {
    floorMap,
    marbleMap,
    woodMap,
    damaskMap,
    velvetMap,
    stoneMap,
    glowMap,
    gold,
    goldDeep,
    brass,
    wood,
    marble,
    plaster,
    plasterDark,
    ceiling,
    velvetWall,
    velvet,
    stone,
    floor,
    floorDark,
    crystal,
    warmGlass,
    fanlight,
    sign,
    crest,
    clock,
    mirrorDark,
    glow,
    carpet,
    carpetMap,
    rowPlateMap
  };
}
