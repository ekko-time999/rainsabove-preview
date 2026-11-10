# Rainsabove / 泫咏

浏览器里的程序化剧场：门厅、走廊、观众厅、舞台、后台、放映间、包厢、办公室、工坊与关于页，
十个站点串成一条可自由行走的参观路线。

## 本地调试

需要 Node 18+。

```bash
npm install
npm run dev            # http://localhost:5180/
```

开发服务器固定 `base = '/'`，改完源码直接刷新即可。

### 构建后预览：必须带 `--base`

`vite preview` 默认从 `vite.config.js` 里读 `preview` 段，而构建产物的 `base` 是
`/rainsabove/`（见 `vite.config.js`：`command === 'build'` 时固定该前缀）。
直接执行 `vite preview` 会用 `'/'` 去解析资源，而 `dist/index.html` 里的脚本地址是
`/rainsabove/assets/...`，于是**每个脚本请求都落到 SPA 的 history fallback 上，返回首页 HTML**：

```
GET /rainsabove/assets/index-xxxx.js  →  200  text/html  7831 B   ← 应该是 text/javascript
```

浏览器把 HTML 当脚本执行，第一行就语法错误，控制台报
`Uncaught SyntaxError: Unexpected token '<'`，页面停在黑屏（只剩背景色，场景不出现）。

正确命令（本地，端口 4173）：

```bash
npm run build
npx vite preview --host 0.0.0.0 --port 4173 --strictPort --base /rainsabove/
# 打开 http://localhost:4173/rainsabove/
```

同一台机器给手机看（同一 Wi-Fi，脚本已内置）：

```bash
npm run preview:lan   # 即上面那条命令，监听 0.0.0.0:4173
# 手机打开 http://<本机局域网 IPv4>:4173/rainsabove/
```

校验是否起对：`curl -sI http://127.0.0.1:4173/rainsabove/assets/<hash>.js`
应返回 `200` + `content-type: text/javascript`，而不是 `text/html`。

> 备注：`npm run preview` 仍是 `vite preview --host`（端口 5181、base `/`），
> 只适合确认构建能起服务；要看真实画面请用上面的 `--base` 版本。

## 构建

```bash
npm run build          # 产物在 dist/，默认部署前缀 /rainsabove/
BASE_PATH=/ npm run build   # 绑自有域名时改为根路径
```

## 目录

```
src/
  core/      渲染器、质量档位、站点/导航数据、巡游、相机、音频
  world/     各空间与构件的程序化建模
  ui/        HUD、浮层、玻璃球
  content/   文案与条目
scripts/     构建期工具（内容索引、单文件预览）
docs/        设计与决策归档
```
