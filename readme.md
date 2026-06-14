# SiteCrawler

静态网站一键下载工具。输入任意网站地址，后台自动抓取全部资源并打包成 ZIP 文件下载。

**生产地址**：[crawler.9shi.cc](https://crawler.9shi.cc)

---

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│  用户浏览器                                          │
│  crawler.9shi.cc（Cloudflare Pages）                 │
│  TanStack Router + React + Vite + TailwindCSS        │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS（SSE / JSON）
                        ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker                                   │
│  api.9shi.cc/crawler/*                               │
│  ├── /api/crawl             爬取入口（SSE，自动分流）│
│  ├── /api/crawl/render/:taskId  渲染任务状态轮询     │
│  ├── /api/auth/register     注册                     │
│  ├── /api/auth/login        登录                     │
│  └── /api/history           爬取历史（需登录）       │
└───────┬───────────────────────┬─────────────────────┘
        │                       │
        ▼                       ▼
┌──────────────┐     ┌──────────────────────────────┐
│ Cloudflare D1│     │ Cloudflare R2                 │
│ users        │     │ 爬取结果 ZIP 文件存储          │
│ crawl_history│     └──────────────────────────────┘
│ ip_usage     │
│ render_tasks │
└──────────────┘
        │（检测到 SPA / JS 渲染网站时）
        ▼
┌──────────────────────────────────────────────────────┐
│  Cloudflare Browser Run（浏览器渲染）                 │
│        ↓                                              │
│  Cloudflare Workflows（异步全站编排）                 │
│        ↓                                              │
│  R2（暂存 render/ → 产物 crawls/*.zip）               │
└──────────────────────────────────────────────────────┘
```

## 目录结构

```
site-crawler/
├── app/          # 前端（TanStack Router + React + Vite）
│   └── src/
│       ├── routes/       # 页面（index, crawl, history, privacy, terms）
│       ├── components/   # UI 组件（Landing Page 各区块 + CrawlProgress）
│       └── lib/          # i18n、API client、工具函数
├── worker/       # 后端（Cloudflare Worker）
│   └── src/
│       ├── crawl/        # 静态爬取引擎（engine, parser, zipper, detector）
│       ├── render/       # V2 渲染管线（browser, workflow, steps, quota, staging）
│       ├── auth/         # JWT 认证
│       └── db/           # D1 查询、schema、migrations
└── docs/         # 方案文档（plans, specs）
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | TanStack Router v1 + React 19 + Vite 5 |
| 样式 | TailwindCSS v4 + Material Design color tokens |
| 字体 | 系统字体栈（Inter 移除）+ @material-symbols/font-400（自托管） |
| 后端运行时 | Cloudflare Workers |
| 数据库 | Cloudflare D1（SQLite） |
| 文件存储 | Cloudflare R2 |
| JS 渲染 | Cloudflare Browser Run + Workflows |
| 认证 | JWT（email / password） |
| 多语言 | 自实现 i18n（zh / en） |

> V1 曾采用 GitHub Actions + Playwright 做 JS 渲染，V2 已由 Cloudflare Browser Run 替代，仓库 aotushi/site-crawler-actions 将随 V2 上线归档。

## 核心功能

| 功能 | 说明 |
|------|------|
| 静态爬取 | SSE 流式进度，最大 900 文件 / 100MB，深度 5 层 |
| JS 渲染爬取 | 单入口自动分流：先按静态抓取入口页，检测到 SPA（JS 渲染壳）时自动创建渲染任务，由 Workflows 在云端浏览器中逐批渲染全站、截获静态资源、打包 ZIP 存 R2；前端通过 SSE 收到任务号后轮询状态 |
| IP 限流 | 未登录：静态 3次/天，渲染 1次/天 |
| 用户系统 | 登录/注册（V1 注册入口占位，弹窗提示"即将上线"） |
| 爬取历史 | 登录后可查历史记录及下载链接 |

## 爬取方式全景对比

下表汇总主流网站抓取/镜像方案，分两类：**① 本项目采用的方案**；**② 互联网上各语言（Python / Go / Rust / Node / Java）的开源最佳实践**。核心分水岭是 **是否执行 JS**（能否拿动态内容）与 **能否绕 WAF**（能否访问受保护站点）。按「本项目方案 → 通用镜像工具 → 多语言爬虫框架 → 高保真存档」分组排列。

| 方式 | 语言 / 栈 | 执行 JS | 绕 WAF | 产物形态 | 成本 | 适用场景 | 主要局限 |
|------|---------|:------:|:------:|---------|------|---------|---------|
| **Worker fetch 静态爬取**（本项目静态通道） | TS / Workers | ❌ | ✅ CF 出口 IP | ZIP | 免费 / $5 底费 | 静态站、快速打包 | 不执行 JS；128MB/subrequest 平台上限 |
| **GitHub Actions + Playwright**（本项目 V1 曾用，已退役） | TS / Playwright | ✅ | ❌ 数据中心 IP 被拦 | Artifact ZIP | GH 免费额度 | 需 JS 渲染的站 | IP 被 WAF 拦；冷启动慢 |
| **CF Browser Run**（本项目 V2 现用 ⭐） | TS / Workers + 无头浏览器 | ✅ | ✅ CF 网络 + 真浏览器（可过 JS challenge） | 渲染后 HTML / 截图 / PDF | 额度内 ≈ $0 + $5 底费 | 在 CF 内补浏览器能力、抓动态 | 单会话适合单页；长爬由 Workflows 分批编排（已实现） |
| **wget2 / wget --mirror** | C | ❌ | ⚠️ 需配代理 + UA | HTML 镜像目录 | 免费 | 经典静态镜像、递归彻底 | 不解析 srcset/og:image；wget1 无并发 |
| **HTTrack** | C / C++ | ❌ | ⚠️ 需配代理 + UA | HTML 镜像目录 | 免费 | GUI 开箱即用静态镜像 | 2017 后基本停更；HTML5 支持弱 |
| **monolith** | Rust | ❌（可配 Chromium 预渲染） | ⚠️ | 单个自包含 HTML 文件 | 免费 | 存单页为一个文件、离线分享 | 仅单页，非整站递归 |
| **Scrapy** | Python | ⚠️ 需插件 scrapy-playwright | ⚠️ 中间件 | 自定义（数据 / 文件） | 免费 | 大规模静态抓取、成熟稳定 | JS 非原生；Twisted 与 asyncio 摩擦 |
| **Crawlee** | Node.js / Python | ✅ Playwright/Puppeteer | ✅ 内置指纹 + 代理轮换 | 自定义（HTML/PDF/图） | 免费 | 现代 SPA + 反屏蔽生产级 | 自托管自运维；浏览器模式吃内存 |
| **Colly** | Go | ❌（需 chromedp） | ⚠️ | 自定义 | 免费 | 极致 HTTP 吞吐（静态，万级/分） | 不渲染 JS |
| **Katana** | Go | 可选 headless | ⚠️ | URL 清单 | 免费 | URL 发现 / 安全侦察 | 只发现 URL、不抽取内容 |
| **Crawl4AI** | Python | ✅ Playwright | ⚠️ | LLM 友好 Markdown / 结构化 | 免费 | 喂 LLM / RAG | 偏内容提取，非完整镜像 |
| **Browsertrix Crawler** | Node / 浏览器 | ✅ | ✅ 真浏览器 + 可配代理 | WARC / WACZ（标准存档） | 自托管免费，需 ≥2G 内存主机 | 高保真存档、复杂 SPA（YouTube/X 级） | 重；产物需 ReplayWeb.page 回放；吃内存 |
| **ArchiveBox** | Python / Django | ⚠️ 部分提取器 | 取决于后端 | 多格式（HTML/PDF/PNG/WARC） | 自托管免费 | 带 UI 的多格式存档中枢 | 单页保真不如 Browsertrix；递归默认 depth=1 |
| **其他**（Heritrix / Scoop / Brozzler / SOSSE） | Java / Python 等 | 视方案 | 视配置 | WARC 为主 | 自托管免费 | 机构级 / 证据级 / 带搜索 | 各有侧重，部署偏重 |

> 底座库说明：**Playwright / Puppeteer**（Node / Python）是上述多数浏览器方案的统一底座（CF Browser Run、Crawlee、Browsertrix、Crawl4AI 均基于其一）。单独使用时缺队列/重试/限流，生产环境通常由 Crawlee 等框架包装。

**结论**：
- **静态站** → Worker fetch / wget2 / monolith（单页）即可，**0 成本**。
- **大规模数据抽取** → Python 选 Scrapy、Go 选 Colly、现代 SPA + 反屏蔽选 Crawlee。
- **动态站高保真镜像** → 需浏览器渲染。三条路：CF Browser Run（最轻、留在 CF）、Browsertrix（最高保真、最重）、VPS 自建（受机器规格限制）。
- 经成本与运维评估，本项目 **V2 已采用 CF Browser Run**（详见下节）。

## V2 架构：CF Browser Run 方案

**核心思路**：静态通道沿用现有 Worker `fetch()` 引擎不动；入口探测到 SPA 时自动分流到独立的 **Browser Run 渲染管线**（Workflows 编排），在云端真浏览器中执行 JS 完成"含动态内容"的全站采集，且**全程不离开 Cloudflare**，无需外部 VPS。

```
┌─────────────────────────────────────────────────────┐
│  用户浏览器 — crawler.9shi.cc（Cloudflare Pages）    │
└───────────────────────┬─────────────────────────────┘
                        │ HTTPS（SSE / JSON）
                        ▼
┌─────────────────────────────────────────────────────┐
│  Cloudflare Worker（调度 + 解析 + 重写）             │
│  ├── sitemap 发现 + 内链 BFS + 去重                  │
│  ├── 静态页  → fetch()           （快、省额度）      │
│  └── 动态页  → Browser Run 渲染   （执行 JS）        │
└───────┬───────────────┬───────────────┬─────────────┘
        ▼               ▼               ▼
┌────────────┐  ┌───────────────┐  ┌──────────────────┐
│ Browser Run│  │ Cloudflare R2 │  │ Cloudflare D1    │
│ 无头浏览器  │  │ 产物 ZIP/资源 │  │ 元数据 / 任务状态 │
│ 渲染+截获   │  └───────────────┘  └──────────────────┘
└────────────┘
   长爬任务由 Workflows 整站分批顺序渲染
```

**各组件职责**：

| 组件 | 角色 | CF 能力 |
|------|------|---------|
| 前端 UI / 下载页 | 交互 + 进度展示 | Pages |
| 调度 + 解析 + 重写 | 沿用现有 engine 逻辑 | Worker |
| **动态页渲染** | 执行 JS、截获动态资源 | **Browser Run** |
| 静态页抓取 | 快速直取（省渲染额度） | Worker `fetch` |
| 产物 / 资源存储 | ZIP / WARC / 媒体 | R2 |
| 元数据 / 任务状态 | 历史、进度、去重表 | D1 |
| 长爬任务编排 | 整站分批顺序渲染 | Workflows |

**成本**（按抓一个中型站 ~789 页估算）：

| 项 | 用量 | 费用 |
|----|------|------|
| Browser Run 渲染 | ~0.9 浏览器小时/次（Paid 含 10 小时/月） | **$0**（额度内） |
| Workers Paid 底费 | 固定 | $5/月（项目已在付） |
| R2 / D1 | 小规模 | 免费额度内 |

**为什么不用 VPS（路线 C）**：
- Browsertrix 每浏览器 worker 需 **0.5–1G 内存**；手头 2C/1G（实际剩 ~400M）VPS **跑不动，会 OOM**。
- VPS 需持续付租金且要运维；Browser Run 在本项目用量下**趋近免费**，且免运维、自动绕 WAF。

**实现方式**：静态引擎未改动。`/api/crawl` 入口先按静态抓取入口页，`isJsRendered` 检测为 SPA 时创建渲染任务，走独立的 Workflows 渲染管线：云端浏览器逐批渲染全站、截获静态资源、打包 ZIP 存 R2 `crawls/` 前缀（中间产物存 `render/` 前缀，7 天生命周期自动过期）；前端经 SSE 拿到 taskId 后轮询 `GET /api/crawl/render/:taskId`。

## 本地开发

```bash
# 启动 Worker
cd worker
npx wrangler dev --env dev

# 启动前端（另开终端）
cd app
npm install
npm run dev
```

前端默认连接 `http://127.0.0.1:8787`。

## 部署

```bash
# 部署 Worker
cd worker
npx wrangler deploy

# V2 一次性初始化：D1 渲染任务表迁移 + R2 暂存前缀生命周期（render/ 7 天自动过期）
npx wrangler d1 execute site-crawler-db --remote --file=src/db/migrations/004_add_render_tasks.sql
npx wrangler r2 bucket lifecycle add site-crawler-results --prefix render/ --expire-days 7

# 部署前端
cd app
npm run build
npx wrangler pages deploy dist --project-name=site-crawler
```

## 当前状态

- ✅ 静态爬取完整可用
- ✅ JS 渲染全站爬取（Cloudflare Browser Run + Workflows）已实现，本地端到端验证通过
- ✅ IP 限流保护
- ✅ 用户登录 / 历史记录
- ✅ 中英双语 Landing Page（含真实案例展示模块）
- ✅ Lighthouse 评分：Performance 98 / Accessibility 100 / Best Practices 100 / SEO 100
- ✅ 字体全部自托管，无 Google Fonts 依赖（大陆可正常访问）
- ⏳ 注册功能、更高配额（计划中）
- ⏳ V2 生产部署与 GHA 仓库归档（待执行）

## 性能说明

- 前端部署：Cloudflare Pages（静态）
- TTFB ~620ms：Cloudflare Pages 免费版在大陆无 PoP 节点，为国际链路正常延迟，前端层无法优化
- 如需大陆极致速度：需备案 + 国内 CDN 回源

## 环境变量

- Worker Secrets 需通过 `wrangler secret put` 设置：`JWT_SECRET`
- 渲染相关 vars（`worker/wrangler.toml` 中已配置默认值）：

| 变量 | 默认 | 含义 |
|------|------|------|
| RENDER_MONTHLY_BUDGET_S | 32400 | 月度浏览器时长预算（秒），超出后熔断降级静态 |
| RENDER_MAX_PAGES | 500 | 单任务页面上限 |
| RENDER_MAX_BYTES | 943718400 | 单任务字节上限（900MB） |
| RENDER_PAGE_TIMEOUT_MS | 15000 | 单页渲染超时 |
| RENDER_BATCH_SIZE | 10 | 每个 Workflow step 渲染页数 |
| RENDER_DAILY_LIMIT_ANON | 1 | 匿名每日渲染次数 |
