# SiteCrawler — 前端

静态网站一键下载工具的前端应用，部署于 Cloudflare Pages。

**最后更新**: 2026-05-04

---

## 技术栈

- TanStack Router v1 + Vite 5 + React
- TailwindCSS 3
- TypeScript
- 中英双语（i18n 自实现）

## 本地开发

```bash
npm install
npm run dev
```

前端默认连接本地 Worker（`http://127.0.0.1:8787`），需同时启动 Worker：

```bash
cd ../worker
npx wrangler dev --env dev
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_WORKER_URL` | Worker 地址，本地为 `http://127.0.0.1:8787`，生产为 `https://api.9shi.cc/crawler` |

## 构建 & 部署

```bash
npm run build
npx wrangler pages deploy dist --project-name=site-crawler
```

---

## JS 渲染网站支持方案

### 背景

Cloudflare Worker 是纯静态分析爬虫，无法执行 JS。对于依赖客户端渲染注入资源的网站（如部分 Nuxt/Next 组件），静态爬虫无法采集完整资源。浏览器沙箱（含 WASM）受同源策略限制，也无法跨域爬取。

### 方案列表

| 方案 | 原理 | 费用 | 复杂度 | 可行性 |
|------|------|------|--------|--------|
| **A. 浏览器内 JS/WASM 爬取** | 在浏览器沙箱内直接爬取 | 免费 | 低 | ❌ 不可行：浏览器同源策略阻止跨域 fetch，无论 JS 还是 WASM 都无法绕过 |
| **B. 第三方渲染 API**（Firecrawl/ScrapingBee/Scrapfly） | Worker 调用外部 API 获取渲染后 HTML | 免费额度有限（Firecrawl 500次/月），超出付费 | 低 | ⚠️ 有额度上限，适合低频场景 |
| **C. 自托管 Playwright 服务**（Render/Railway 免费层） | 免费云平台部署无头浏览器服务，Worker 调用 | 免费层内存 512MB，不够 | 中 | ❌ 不可行：Playwright + Chromium 至少需要 1GB 内存，免费层跑不起来 |
| **D. Cloudflare Browser Rendering** | Worker 原生调用 CF 托管 Chromium，无需额外服务 | 需要 Workers Paid 计划 | 低 | ⚠️ 技术最优，但付费 |
| **E. GitHub Actions + Playwright** | 前端触发 repository_dispatch，CI 跑爬虫，结果存 Artifacts，前端轮询下载 | 公开仓库完全免费无限制；私有仓库 2000 分钟/月（约 600-2000 次爬取） | 高 | ✅ 真正免费，但等待 2-3 分钟，Artifacts 下载需处理 token |
| **F. 本地一键安装服务** | 提供安装脚本，用户本地启动 Playwright HTTP 服务，前端检测 localhost 后切换模式 | 完全免费，无限制 | 中（需用户手动运行一次） | ✅ 最彻底的方案，参考 Figma 字体服务、Docker Desktop 模式 |
| **G. 浏览器扩展** | 扩展在浏览器内运行，可访问完整渲染后的 DOM，绕过同源限制 | 免费 | 高（需发布到应用商店） | ✅ 可行，但需要用户安装扩展，且扩展审核周期长 |
| **H. 扫描 JS bundle 提取资源路径** | 从已下载的 `_nuxt/*.js` 等 bundle 文件中用正则提取图片/资源路径 | 免费，Worker 内即可实现 | 低 | ⚠️ 覆盖部分场景（Nuxt/Next 构建产物），不通用 |

### 选择方案

**近期：维持现状 + jsWarning 提示**
- Worker 静态爬虫覆盖纯静态/SSR 网站（主路径）
- 检测到 JS 渲染时显示 `jsWarning`，引导用户使用本地 Python 脚本
- 原因：其他方案要么有额度限制，要么复杂度过高，当前阶段不值得投入

**中期：方案 E（GitHub Actions）✅ 已实现**
- 公开仓库免费无限制，私有仓库 2000 分钟/月足够个人使用
- 前端检测 jsWarning 后提供"完整爬取"入口，触发 Actions workflow
- 主要缺点：等待时间 2-3 分钟，Artifacts 下载需要 token 处理
- 原因：真正免费无限制，且不需要用户安装任何东西

### 方案 E 实现架构

```
前端 jsWarning → 点"完整爬取"
  → POST /api/crawl/js/trigger { url }
  → Worker 触发 repository_dispatch (aotushi/site-crawler-actions)
  → 轮询找 run_id → 返回 { runId }
  → 前端每 5s 轮询 GET /api/crawl/js/status/:runId
  → Worker 查 GitHub API 状态
  → 完成后 Worker 下载 Artifact ZIP → 返回 { status: 'done', zip: base64 }
  → 前端解码 → 触发下载
```

**涉及文件**：
- `worker/src/crawl/github.ts` — GitHub API 封装（trigger/findRunId/status/download）
- `worker/src/crawl/js-handler.ts` — `/api/crawl/js/trigger` 和 `/api/crawl/js/status/:runId` 路由
- `worker/src/db/migrations/001_add_gh_run_id.sql` — DB 迁移
- `app/src/routes/crawl.tsx` — 完整爬取状态机 + 轮询逻辑
- `app/src/components/CrawlProgress.tsx` — 完整爬取按钮 UI
- GitHub 仓库 `aotushi/site-crawler-actions` — Playwright 爬取 workflow

**长期：方案 F（本地服务）**
- 提供一键安装脚本，用户运行后本地启动 Playwright 服务
- 前端自动检测 `localhost:PORT/ping`，有本地服务时切换到完整爬取模式
- 原因：本地资源无限制，爬取速度最快，用户数据不经过第三方

---

## 版本路线图

### V1（当前）— 开放访问 + IP 限制

**目标**：无需注册即可使用，通过 IP 限制防止滥用。

**功能**：
- 静态爬取：未登录用户每 IP 限 **3 次/天**
- JS 完整爬取（GitHub Actions）：未登录用户每 IP 限 **1 次/天**
- 登录/注册按钮：点击后弹窗提示"注册功能即将上线，敬请期待"

**实现**：
- Worker 通过 `CF-Connecting-IP` header 获取真实 IP
- D1 `ip_usage` 表记录每个 IP 的每日使用次数
- 超出限制返回 `429 Too Many Requests`，前端展示友好提示

### V2（计划中）— 注册 & 用户管理

**目标**：完善用户体系，提供更高配额和历史记录。

**功能**：
- 邮箱注册 / 登录
- 登录用户不受 IP 限制（或更高配额）
- 个人爬取历史记录
- 账号管理页面
