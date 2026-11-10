# rainsabove-preview

这是「泫咏 Rainsabove」的**预览构建**，不是正式站点。

- 源码快照来自 `rainsabove` 仓库的 `rainsabove-test` 分支（提交 c24df74）。
- 构建时 `BASE_PATH=/rainsabove-preview/`、`VITE_PREVIEW=1`，页面顶部带「预览版 · 非正式站点」标识。
- 由 `.github/workflows/deploy.yml` 在 `rainsabove-test` 分支推送时自动构建并发布 `dist`。
- 正式站点：https://ekko-time999.github.io/rainsabove/ ，本仓库不影响它。
