# 内容写作指南

这份说明写给「只写内容、不改代码」的人。看完应当能独立完成：新建一篇 → 填好字段 → 放图 → 存草稿 → 发布上线，包括在手机上发。

- 线上站点：https://ekko-time999.github.io/rainsabove/
- 代码仓库：https://github.com/ekko-time999/rainsabove

内容全部是 Markdown 文件，一个文件就是一篇。目录与站点位置一一对应，不需要在任何代码里登记。

---

## 1. 目录与停靠点

| 目录 | 内容类型 | 站点里的位置 |
| --- | --- | --- |
| `content/posts/` | 随笔 | 后台 |
| `content/works/` | 作品 | 首演台 |
| `content/workshop/` | 绘景 / 工序 | 绘景棚 |
| `content/collections/` | 片单 | 放映厅 |
| `content/guests/` | 友链 | 包厢 |
| `content/about/` | 关于我 | 关于我 |
| `content/pages/` | 页面文案 | 门厅 |

文件名格式：`日期-标题.md`，例如 `2026-11-09-灯亮之前.md`。

- 文件名（去掉 `.md`）就是这篇的唯一标识，**同一目录内不能重名**。
- 文件名不影响排序，排序看 front matter 里的 `date`。
- 文件名里不要出现 `\ / : * ? " < > |`，中文和空格都可以（空格会被脚本转成连字符）。

---

## 2. front matter 规范

每篇开头两行 `---` 之间是 front matter。字段如下，解析逻辑在 `scripts/content-index.mjs`，文档与它保持一致。

### 通用字段

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `title` | 是 | 文本 | 标题，显示在列表、节目单和正文顶部 |
| `date` | 是 | `YYYY-MM-DD` | 排序用（新的在前）。**不是定时发布**，未来日期也会立刻可见 |
| `summary` | 是 | 文本 | 一句话摘要，显示在列表里 |
| `tags` | 否 | `[标签甲, 标签乙]` | 标签，英文或中文逗号都行 |
| `cover` | 否 | `./images/xxx.jpg` | 封面图，文件放在 `public/images/`，详见第 5 节 |
| `draft` | 否 | `true` / `false` | `true` 时本地和线上都不显示，等价于存草稿 |
| `placeholder` | 否 | `true` / `false` | `true` 时正文顶部显示"占位文案"角标 |

### 各类型必填

| 目录 | 必填字段 | 特有可选字段 |
| --- | --- | --- |
| `posts` | `title` `date` `summary` | — |
| `works` | `title` `date` `summary` | — |
| `workshop` | `title` `date` `summary` | — |
| `collections` | `title` `date` `summary` | — |
| `guests` | `title` `date` `summary` `link` | `linkLabel` |
| `about` | `title` `date` `summary` | — |
| `pages` | `title` `date` `summary` | — |

- `link` 只能填 `https://` 开头的完整地址。
- `linkLabel` 是友链按钮文字，不填默认「前往站点」。

### 示例

```md
---
title: 灯亮之前，先擦一遍地板
date: 2026-11-09
summary: 开场前二十分钟，舞台上的最后一遍检查。
tags: [手记, 后台]
draft: false
placeholder: false
---

正文从这里开始，空行分段。

## 小标题

段落。
```

约束：

- 值不要跨行。除 `tags` 外都按整行读取。
- `date` 必须是 `2026-11-09` 这种格式，`2026/11/09`、`2026-11-9` 都会让构建失败。
- 布尔值只认 `true` / `false`，写 `yes`、`是` 会报错。
- 字段名是固定的，拼错（例如 `tittle`）构建时会告警，不会被悄悄忽略。

---

## 3. 新建一篇的三种方式

### 方式 A：命令行（本机）

```bash
npm run new -- post "灯亮之前，先擦一遍地板"
```

- 类型：`post`（随笔）、`work`（作品）、`collection`（片单）、`guest`（友链）、`about`（关于）、`page`（页面）、`workshop`（绘景）；也能用中文别名，如 `npm run new -- 随笔 "标题"`。
- 自动生成 `content/posts/2026-11-09-灯亮之前-先擦一遍地板.md`，front matter 已填好，`draft: true`。
- 可选参数：`--date 2026-11-09` 指定日期，`--slug my-slug` 指定文件名后半段。
- 写完正文，把 `draft: true` 改成 `false`，提交推送即可。

### 方式 B：GitHub 网页一键新建（推荐，手机也能用）

下面每个链接会直接打开 GitHub 的新建文件页面，文件名、front matter 骨架、正文占位都已填好，你只需要改标题、写正文、提交。

- [新建一篇随笔](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fposts%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E6%A0%87%E9%A2%98%E5%86%99%E5%9C%A8%E8%BF%99%E9%87%8C%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E7%AF%87%E8%AE%B2%E4%BB%80%E4%B9%88%EF%BC%8C%E4%BC%9A%E6%98%BE%E7%A4%BA%E5%9C%A8%E5%88%97%E8%A1%A8%E4%B8%8E%E8%8A%82%E7%9B%AE%E5%8D%95%E9%87%8C%E3%80%82%0Atags%3A%20%5B%E6%89%8B%E8%AE%B0%5D%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E6%AD%A3%E6%96%87%E4%BB%8E%E8%BF%99%E9%87%8C%E5%BC%80%E5%A7%8B%EF%BC%8C%E7%A9%BA%E8%A1%8C%E5%88%86%E6%AE%B5%E3%80%82%0A%0A%23%23%20%E5%B0%8F%E6%A0%87%E9%A2%98%0A%0A%E7%AC%AC%E4%B8%80%E6%AE%B5%E6%AD%A3%E6%96%87%E3%80%82%0A)
- [新建一件作品](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fworks%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E6%A0%87%E9%A2%98%E5%86%99%E5%9C%A8%E8%BF%99%E9%87%8C%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E4%BB%B6%E4%BD%9C%E5%93%81%E5%81%9A%E4%BA%86%E4%BB%80%E4%B9%88%E3%80%82%0Atags%3A%20%5B%E4%BD%9C%E5%93%81%5D%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E6%AD%A3%E6%96%87%E4%BB%8E%E8%BF%99%E9%87%8C%E5%BC%80%E5%A7%8B%EF%BC%8C%E7%A9%BA%E8%A1%8C%E5%88%86%E6%AE%B5%E3%80%82%0A%0A%23%23%20%E5%81%9A%E6%B3%95%0A%0A%E7%AC%AC%E4%B8%80%E6%AE%B5%E6%AD%A3%E6%96%87%E3%80%82%0A)
- [新建一份片单](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fcollections%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E6%A0%87%E9%A2%98%E5%86%99%E5%9C%A8%E8%BF%99%E9%87%8C%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E4%BB%BD%E7%89%87%E5%8D%95%E7%9A%84%E4%B8%BB%E9%A2%98%E3%80%82%0Atags%3A%20%5B%E7%89%87%E5%8D%95%5D%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E6%AD%A3%E6%96%87%E4%BB%8E%E8%BF%99%E9%87%8C%E5%BC%80%E5%A7%8B%EF%BC%8C%E7%A9%BA%E8%A1%8C%E5%88%86%E6%AE%B5%E3%80%82%0A%0A%23%23%20%E7%89%87%E5%8D%95%0A%0A-%20%E7%89%87%E5%AD%90%E4%B8%80%0A-%20%E7%89%87%E5%AD%90%E4%BA%8C%0A)
- [新建一条友链](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fguests%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E5%8F%8B%E9%93%BE%20%C2%B7%20%E7%AB%99%E7%82%B9%E5%90%8D%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E4%B8%AA%E7%AB%99%E7%82%B9%E6%98%AF%E4%BB%80%E4%B9%88%E3%80%82%0Atags%3A%20%5B%E5%8F%8B%E9%93%BE%5D%0Alink%3A%20https%3A%2F%2Fexample.com%0AlinkLabel%3A%20%E5%89%8D%E5%BE%80%E7%AB%99%E7%82%B9%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E5%86%99%E4%B8%80%E5%8F%A5%E6%8E%A8%E8%8D%90%E7%90%86%E7%94%B1%EF%BC%8C%E6%88%96%E7%9B%B4%E6%8E%A5%E7%95%99%E7%A9%BA%E3%80%82%0A)
- [新建一节关于我](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fabout%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E6%A0%87%E9%A2%98%E5%86%99%E5%9C%A8%E8%BF%99%E9%87%8C%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E4%B8%80%E8%8A%82%E8%AE%B2%E4%BB%80%E4%B9%88%E3%80%82%0Atags%3A%20%5B%E5%85%B3%E4%BA%8E%E6%88%91%5D%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E6%AD%A3%E6%96%87%E4%BB%8E%E8%BF%99%E9%87%8C%E5%BC%80%E5%A7%8B%EF%BC%8C%E7%A9%BA%E8%A1%8C%E5%88%86%E6%AE%B5%E3%80%82%0A)
- [新建一个页面文案](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fpages%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E6%A0%87%E9%A2%98%E5%86%99%E5%9C%A8%E8%BF%99%E9%87%8C%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E4%B8%AA%E9%A1%B5%E9%9D%A2%E8%AE%B2%E4%BB%80%E4%B9%88%E3%80%82%0Atags%3A%20%5B%E5%AF%BC%E8%A7%88%5D%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E6%AD%A3%E6%96%87%E4%BB%8E%E8%BF%99%E9%87%8C%E5%BC%80%E5%A7%8B%EF%BC%8C%E7%A9%BA%E8%A1%8C%E5%88%86%E6%AE%B5%E3%80%82%0A)
- [新建一道绘景工序](https://github.com/ekko-time999/rainsabove/new/main?filename=content%2Fworkshop%2F2026-11-09-%E6%A0%87%E9%A2%98.md&value=---%0Atitle%3A%20%E6%A0%87%E9%A2%98%E5%86%99%E5%9C%A8%E8%BF%99%E9%87%8C%0Adate%3A%202026-11-09%0Asummary%3A%20%E4%B8%80%E5%8F%A5%E8%AF%9D%E8%AF%B4%E6%B8%85%E8%BF%99%E9%81%93%E5%B7%A5%E5%BA%8F%E5%81%9A%E4%BA%86%E4%BB%80%E4%B9%88%E3%80%82%0Atags%3A%20%5B%E7%BB%98%E6%99%AF%5D%0Adraft%3A%20true%0Aplaceholder%3A%20false%0A---%0A%0A%E6%AD%A3%E6%96%87%E4%BB%8E%E8%BF%99%E9%87%8C%E5%BC%80%E5%A7%8B%EF%BC%8C%E7%A9%BA%E8%A1%8C%E5%88%86%E6%AE%B5%E3%80%82%0A%0A%23%23%20%E5%B7%A5%E5%BA%8F%0A%0A%E7%AC%AC%E4%B8%80%E6%AE%B5%E6%AD%A3%E6%96%87%E3%80%82%0A)

注意两点：

1. 链接里的文件名是 `2026-11-09-标题.md`，**打开后先把文件名改成真实标题**（页面顶部的文件名输入框可编辑），再把 front matter 里的标题、摘要写实。
2. 链接里的日期是生成当天的日期，过几天再用记得改 `date` 和文件名里的日期。

模板的唯一来源是 `content/_templates/` 下的 7 个文件。改了模板后运行 `npm run links` 重新生成链接，把新链接粘回本节。如果某天 GitHub 调整了参数、打开后正文是空的，退路是直接复制对应模板文件的内容。

### 方式 C：手写

复制 `content/_templates/post.md` 之类到目标目录，改名、改字段。字段含义见第 2 节。

---

## 4. 手机上怎么发一篇

1. 用手机浏览器打开本文件（GitHub 仓库里 `content/README.md`），点第 3 节「方式 B」里对应的链接。
   - 需要已登录 GitHub。没登录会先跳到登录页，登录后回到新建页。
2. 页面顶部是文件名，改成 `2026-11-09-你的标题.md`（保留 `content/posts/` 前缀，日期可以不改）。
3. 下方是正文编辑框，已带 front matter 骨架。改 `title`、`summary`、`tags`，正文写在第二个 `---` 之后。
4. 把 `draft: true` 改成 `draft: false`。想先存着就先不改，提交后线上不会出现。
5. 点页面下方的 **Commit changes**，提交说明随便写（如 `content: 灯亮之前`），分支保持 `main`，确认提交。
6. 等约 30 秒，GitHub Actions 会自动构建并发布。刷新 https://ekko-time999.github.io/rainsabove/ ，进对应停靠点即可看到。
7. 想看这次部署是否成功：仓库顶部 **Actions** 页，最新一条 `Deploy to GitHub Pages` 是绿色勾即成功；红色叉点进去能看到构建日志里的报错。

手机端限制：

- GitHub 网页编辑器对超长文不太友好，建议长文在电脑写，手机上发短记。
- 图片上传在手机浏览器的 GitHub 页面里可用（`Add file` → `Upload files`），但多图建议电脑操作。

---

## 5. 图片放在哪、怎么引用

- 图片统一放 `public/images/`，构建时会原样复制到站点根目录。
- 正文里写相对路径：

```md
![绘景棚北墙的记号](./images/wall-mark.jpg)
```

- front matter 的封面同样写 `./images/xxx.jpg`。
- **不要写 `/images/xxx.jpg`**。站点部署在 `https://ekko-time999.github.io/rainsabove/` 这个子路径下，以 `/` 开头的地址会指向域名根目录，图片会 404。相对路径 `./images/...` 在当前部署方式下正确，以后换成自有域名（部署在根路径）也仍然正确，不用改内容。
- 还没有真图时，可以用占位语法，会渲染成一个 16:9 的图位框：

```md
![绘景棚北墙的记号](placeholder:wall-mark)
```

- `cover` 指向的文件不存在时，构建会直接失败并报出具体路径，不会静默漏图。

---

## 6. 草稿与发布

- `draft: true`：这篇不进入列表和节目单，本地 `npm run dev` 和线上都看不到。
- 发布 = 把 `draft: true` 改成 `false`，提交并推送。
- 没有定时发布。日期只影响排序，写未来日期也会立刻上线。
- 想临时下线：把 `draft` 改回 `true` 再提交，或删除文件。
- `placeholder: true` 只是给正文加一个"占位文案"角标，不影响是否上线；内容写实后改成 `false`。

---

## 7. 从本地预览到自动上线

```
写 md  →  npm run dev 本地看  →  git add / commit / push  →  GitHub Actions 构建  →  线上更新
```

- 本地预览：`npm install`（首次）→ `npm run dev`，打开 http://localhost:5180/ 。内容改动会热更新。
- 提交推送：

```bash
git add content/posts/2026-11-09-你的标题.md
git commit -m "content: 你的标题"
git push
```

- 推送后，仓库的 Actions 会自动执行：`npm ci` → `npm run build` → 发布 `dist` 到 GitHub Pages。构建约 20 秒、发布约 10 秒，一般 30 秒内在线上可见。
- 只有 `main` 分支会触发发布；在别的分支上提交不会上线。
- 构建失败不会更新线上，旧版本继续在线。失败原因看 Actions 日志，多半是第 9 节的字段错误。

### base 路径对内容的影响

- 站点是 GitHub Pages 的「项目页」，地址带 `/rainsabove/` 前缀，构建时通过 `base` 注入。
- 受影响的只有**以 `/` 开头的手写地址**（图片、封面、正文链接）。
- 文章之间不需要手写站内链接——它们通过面板和导览打开，由程序生成。
- 因此记住一条：内容里的图片和文件引用一律用 `./` 相对路径；外部链接用完整 `https://`。
- 以后绑定自有域名，把构建时的 `BASE_PATH` 改成 `/` 即可，内容不用动。

---

## 8. 模板与链接的可靠性

| 方案 | 一次填好 front matter | 需要联网 | 说明 |
| --- | --- | --- | --- |
| `npm run new` | 是 | 否 | 本机最稳，文件名、日期、字段都自动生成 |
| GitHub `?filename=&value=` 链接 | 是 | 是 | 手机首选；依赖 GitHub 保留该参数 |
| 复制 `content/_templates/*.md` | 是（模板自带骨架） | 否 | 前两者失效时的兜底 |

`value` 参数是 GitHub 网页编辑器长期支持的用法，但不是公开承诺的 API。若发现打开后正文为空，用模板文件兜底即可，不影响内容格式。

---

## 9. 构建会报什么错

构建（`npm run build` 或 Actions）时校验 `content/`，错误会中断构建并列出文件与原因，例如：

```
内容校验未通过（修改 content/ 后重试，规范见 content/README.md）：
  ✗ content/posts/2026-11-09-demo.md 缺少必填字段 "summary"
  ✗ content/posts/2026-11-09-demo.md 的 date 必须是 YYYY-MM-DD，当前是 "2026/11/09"
  ✗ content/posts/2026-11-09-demo.md 的 cover 找不到文件："./images/none.jpg"
```

会中断的情况：缺 `title` / `date` / `summary`（友链另需 `link`）、日期格式不对、`draft` 或 `placeholder` 不是布尔值、`cover` 文件不存在、同目录文件名重复。

只告警不中断：字段名拼错（如 `tittle`）、`tags` 没写成数组。告警会以 `[content] 警告：…` 打印在构建日志里。

---

## 10. 更省事的发文方式（评估，未实施）

### Sveltia CMS 挂在 `/admin`

结论：**技术上可行，成本中等，现在不建议上。**

- 做法：仓库里放 `admin/index.html` + `admin/config.yml`（纯静态文件，随 Pages 一起发布），用 Sveltia CMS 的 GitHub 后端读写 `content/`。
- 卡点：纯静态站点没有后端，GitHub OAuth 不能直接在前端完成，必须额外部署一个 OAuth 代理（官方提供 `sveltia-cms-auth`，可一键部署到 Cloudflare Workers），并注册一个 GitHub OAuth App，回调地址填代理的 `/callback`。
- 需要你配合：一个 Cloudflare 账号（免费额度够用）、授权创建 GitHub OAuth App、确定回调域名。建议等绑了自有域名再做，回调地址更稳定。
- 接入成本：首次约 1–2 小时（建 OAuth App、部署 Worker、写配置、试登录），之后基本零维护；费用为 0。
- 收益：表单式发文、图片上传、草稿开关，手机端体验明显好于 GitHub 网页编辑器。
- 风险：Sveltia 迭代较快，配置字段可能随版本调整；OAuth Worker 是额外依赖。

### 飞书文档自动同步

结论：**现在不做。**

- 需要飞书自建应用（拿 app id/secret、开文档读取权限）、一个定时任务（GitHub Actions 定时拉取并转 Markdown 提交）、图片下载与鉴权、增量判断。
- 成本：首次约半天到一天，之后每次接口或权限调整都要维护；一旦同步逻辑出错，会污染仓库内容。
- 若确实要写长文，先用飞书/备忘录写，再粘到 GitHub 网页编辑器，成本几乎为零。

---

## 11. 速查

```bash
npm run dev            # 本地预览 http://localhost:5180/
npm run new -- post "标题"   # 新建一篇随笔
npm run links          # 打印 GitHub 一键新建链接
npm run build          # 构建并校验内容，产物在 dist/
npm run preview:file   # 生成可双击打开的单文件 剧场预览.html
```

发布只需：`git add` → `git commit` → `git push`，其余交给 Actions。
