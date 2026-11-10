import { defineConfig } from 'vite';
import { contentIndexPlugin } from './scripts/content-index.mjs';

// 部署 base：
// - 本地 dev 固定 '/'，保证 http://localhost:5180/ 可用
// - 构建默认项目页前缀 '/rainsabove/'
// - 以后绑自有域名时：BASE_PATH=/ npm run build
const BASE_PATH = process.env.BASE_PATH || '';

export default defineConfig(({ command }) => ({
  base: BASE_PATH || (command === 'build' ? '/rainsabove/' : '/'),
  plugins: [contentIndexPlugin()],
  server: { port: 5180, strictPort: false },
  preview: { port: 5181 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0
  }
}));
