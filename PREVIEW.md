# rainsabove-preview

这是「泫咏 Rainsabove」的**预览构建**，不是正式站点。

- 源码快照：`rainsabove` 仓库 `orb-panorama-fix` 分支，commit `d645eaa4a57b5d6d219668cdbe7e8ededd19f9d7`。
- 本轮内容：玻璃球（orb）全景修复 —— 共用外部方位相机、移除 xray 线框、转场方位角解缠与降速。
- 发布分支：`rainsabove-test`（`deploy-preview` workflow 只在此分支的 push 上触发）。
- 构建：`BASE_PATH=/rainsabove-preview/ VITE_PREVIEW=1 npm run build`，顶部带「预览版 · 非正式站点」标识。
- 正式站点：https://ekko-time999.github.io/rainsabove/ ，本仓库不影响它。
