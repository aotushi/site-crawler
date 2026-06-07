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
│  ├── /api/crawl             静态爬取（SSE 流式）     │
│  ├── /api/crawl/js/trigger  触发 JS 完整爬取         │
│  ├── /api/crawl/js/status   轮询爬取状态             │
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
└──────────────┘
        │（JS 渲染网站）
        ▼
┌──────────────────────────────────────────────────────┐
│  GitHub Actions（aotushi/site-crawler-actions）       │
│  Playwright 完整爬取 → Artifact ZIP → Worker 下载     │
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
│       ├── crawl/        # 爬取引擎（engine, parser, zipper, detector, github）
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
| 后端运行时 | Cloudflare Workers（Hono） |
| 数据库 | Cloudflare D1（SQLite） |
| 文件存储 | Cloudflare R2 |
| JS 爬取 | GitHub Actions + Playwright |
| 认证 | JWT（email / password） |
| 多语言 | 自实现 i18n（zh / en） |

## 核心功能

| 功能 | 说明 |
|------|------|
| 静态爬取 | SSE 流式进度，最大 200 文件 / 50MB，深度 2 层 |
| JS 完整爬取 | 触发 GitHub Actions Playwright，轮询状态，自动下载 Artifact |
| IP 限流 | 未登录：静态 3次/天，JS爬取 1次/天 |
| 用户系统 | 登录/注册（V1 注册入口占位，弹窗提示"即将上线"） |
| 爬取历史 | 登录后可查历史记录及下载链接 |

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

# 部署前端
cd app
npm run build
npx wrangler pages deploy dist --project-name=site-crawler
```

## 当前状态（V1 完成）

- ✅ 静态爬取完整可用
- ✅ JS 渲染完整爬取（GitHub Actions）可用
- ✅ IP 限流保护
- ✅ 用户登录 / 历史记录
- ✅ 中英双语 Landing Page（含真实案例展示模块）
- ✅ Lighthouse 评分：Performance 98 / Accessibility 100 / Best Practices 100 / SEO 100
- ✅ 字体全部自托管，无 Google Fonts 依赖（大陆可正常访问）
- ⏳ V2：注册功能、更高配额（计划中）

## 性能说明

- 前端部署：Cloudflare Pages（静态）
- TTFB ~620ms：Cloudflare Pages 免费版在大陆无 PoP 节点，为国际链路正常延迟，前端层无法优化
- 如需大陆极致速度：需备案 + 国内 CDN 回源

## 待处理

- Worker Secrets 需通过 `wrangler secret put` 设置：`JWT_SECRET`、`GITHUB_TOKEN`
