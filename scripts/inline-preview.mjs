// 把 vite 产物内联成单文件 HTML，便于直接双击从 file:// 打开
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const OUT = path.join(root, '剧场预览.html');

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

function readAsset(href) {
  const clean = href.split('?')[0];
  // 兼容 base='./' 与 base='/rainsabove/' 两种构建产物
  const at = clean.indexOf('/assets/');
  const rel = at >= 0 ? clean.slice(at + 1) : clean.replace(/^\.?\//, '');
  return fs.readFileSync(path.join(dist, rel), 'utf8');
}

// 去掉 modulepreload（单文件内联后不再需要）
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');

// 内联样式表
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_m, href) => {
  return `<style>\n${readAsset(href)}\n</style>`;
});

// 内联入口脚本
html = html.replace(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_m, src) => {
  return `<script type="module">\n${readAsset(src)}\n</script>`;
});

fs.writeFileSync(OUT, html, 'utf8');
console.log(`[preview] ${path.relative(root, OUT)}  ${(html.length / 1024).toFixed(0)} kB`);
