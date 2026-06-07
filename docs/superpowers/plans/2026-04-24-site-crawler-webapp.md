# Site Crawler Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bilingual (zh/en) web app where users paste a URL and download the complete static site as a ZIP file, with user auth and crawl history, deployed on Cloudflare Pages + Worker.

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

**中期：方案 E（GitHub Actions）**
- 公开仓库免费无限制，私有仓库 2000 分钟/月足够个人使用
- 前端检测 jsWarning 后提供"完整爬取"入口，触发 Actions workflow
- 主要缺点：等待时间 2-3 分钟，Artifacts 下载需要 token 处理
- 原因：真正免费无限制，且不需要用户安装任何东西

**长期：方案 F（本地服务）**
- 提供一键安装脚本，用户运行后本地启动 Playwright 服务
- 前端自动检测 `localhost:PORT/ping`，有本地服务时切换到完整爬取模式
- 原因：本地资源无限制，爬取速度最快，用户数据不经过第三方

**Architecture:** Frontend (TanStack Router + Vite + TailwindCSS) calls a Cloudflare Worker that crawls target URLs server-side (bypassing browser CORS), detects JS-rendered sites and warns users, packages all assets into a ZIP via fflate, and streams the binary back. Auth uses JWT signed by a Worker secret env var; crawl history persists in D1. Crawl state (URL, status) is saved in localStorage so users can recover after accidental tab close.

**Tech Stack:** TanStack Router v1, Vite 5, TailwindCSS 3, TypeScript, Cloudflare Workers + Pages, D1 (SQLite), fflate (ZIP), node-html-parser, jose (JWT)

---

## File Map

### Frontend (`app/`)

| File | Responsibility |
|------|---------------|
| `app/src/routes/__root.tsx` | Root layout: NavBar + LangContext provider |
| `app/src/routes/index.tsx` | Landing page (Hero + HowItWorks + CaseStudies) |
| `app/src/routes/crawl.tsx` | Crawl UI: URL input → progress → download |
| `app/src/routes/history.tsx` | Auth-guarded crawl history list |
| `app/src/routes/auth/login.tsx` | Login form |
| `app/src/routes/auth/register.tsx` | Register form |
| `app/src/components/Hero.tsx` | First-screen URL input + CTA |
| `app/src/components/HowItWorks.tsx` | 3-step explainer section |
| `app/src/components/CaseStudies.tsx` | Example crawl cases (hot5games, etc.) |
| `app/src/components/NavBar.tsx` | Nav links + lang switcher + auth state |
| `app/src/components/Footer.tsx` | Footer |
| `app/src/components/CrawlProgress.tsx` | Progress bar + bytes + file count + download button |
| `app/src/lib/i18n.ts` | zh/en message map + `useLang()` hook |
| `app/src/lib/api.ts` | `fetchWorker()` wrapper with JWT injection |
| `app/src/lib/auth.ts` | JWT localStorage storage + helpers |
| `app/src/lib/crawl-state.ts` | Crawl session persistence to localStorage |

### Worker (`worker/`)

| File | Responsibility |
|------|---------------|
| `worker/src/index.ts` | Entry point + URL router |
| `worker/src/auth/jwt.ts` | Sign / verify JWT using `jose` + env secret |
| `worker/src/auth/handlers.ts` | POST /api/auth/register, POST /api/auth/login |
| `worker/src/crawl/detector.ts` | Heuristic: detect if page requires JS rendering |
| `worker/src/crawl/parser.ts` | Extract asset/link URLs from HTML |
| `worker/src/crawl/engine.ts` | Recursive fetch orchestrator (depth + size limits) |
| `worker/src/crawl/zipper.ts` | Build in-memory ZIP with fflate |
| `worker/src/crawl/handler.ts` | POST /api/crawl — orchestrate + write history |
| `worker/src/db/schema.sql` | D1 schema: users + crawl_history |
| `worker/src/db/queries.ts` | Typed D1 query helpers |
| `worker/wrangler.toml` | Worker config, D1 binding, secrets |

---

## Phase 1: Project Scaffold

### Task 1: Frontend Project Setup

**Files:**
- Create: `app/package.json`
- Create: `app/vite.config.ts`
- Create: `app/tailwind.config.ts`
- Create: `app/tsconfig.json`
- Create: `app/src/main.tsx`
- Create: `app/index.html`

- [x] **Step 1: Scaffold Vite + React project**

```bash
cd /e/code/github/resume/site-crawler
npm create vite@latest app -- --template react-ts
cd app
npm install
```

- [x] **Step 2: Install dependencies**

```bash
npm install @tanstack/react-router @tanstack/router-vite-plugin
npm install tailwindcss @tailwindcss/vite
npm install -D @tanstack/router-devtools
```

- [x] **Step 3: Write `app/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    TanStackRouterVite(),
    react(),
  ],
})
```

- [x] **Step 4: Write `app/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
} satisfies Config
```

- [x] **Step 5: Write `app/src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import './index.css'

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
```

- [x] **Step 6: Write `app/src/index.css` (Tailwind entry)**

```css
@import "tailwindcss";
```

- [x] **Step 7: Verify dev server starts**

```bash
cd app && npm run dev
```
Expected: Vite server running at http://localhost:5173

- [x] **Step 8: Commit**

```bash
git init
git add app/
git commit -m "feat: scaffold Vite + TanStack Router + Tailwind frontend"
```

---

### Task 2: Worker Project Setup

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.toml`
- Create: `worker/tsconfig.json`
- Create: `worker/src/index.ts`

- [x] **Step 1: Create Worker project**

```bash
cd /e/code/github/resume/site-crawler
mkdir worker && cd worker
npm init -y
npm install wrangler --save-dev
npm install fflate node-html-parser jose
npm install -D @cloudflare/workers-types typescript
```

- [x] **Step 2: Write `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

- [x] **Step 3: Write `worker/wrangler.toml`**

```toml
name = "site-crawler-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "site-crawler-db"
database_id = "REPLACE_WITH_REAL_ID"

[vars]
FRONTEND_ORIGIN = "https://site-crawler.pages.dev"

# Secrets (set via wrangler secret put):
# JWT_SECRET
```

- [x] **Step 4: Write skeleton `worker/src/index.ts`**

```ts
export interface Env {
  DB: D1Database
  JWT_SECRET: string
  FRONTEND_ORIGIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = env.FRONTEND_ORIGIN

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      })
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    // Placeholder routing — expanded in later tasks
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  },
}
```

- [x] **Step 5: Verify Worker typechecks**

```bash
cd worker && npx tsc --noEmit
```
Expected: No errors

- [x] **Step 6: Commit**

```bash
git add worker/
git commit -m "feat: scaffold Cloudflare Worker project"
```

---

### Task 3: i18n System

**Files:**
- Create: `app/src/lib/i18n.ts`

- [ ] **Step 1: Write `app/src/lib/i18n.ts`**

```ts
import { createContext, useContext, useState } from 'react'

export type Lang = 'zh' | 'en'

export const messages = {
  zh: {
    nav_crawl: '开始爬取',
    nav_history: '历史记录',
    nav_login: '登录',
    nav_register: '注册',
    nav_logout: '退出',
    hero_title: '静态网站一键下载工具',
    hero_subtitle: '输入任意静态网站地址，自动抓取全部资源并打包成 ZIP 文件下载。',
    hero_placeholder: '输入目标网站 URL，例如 https://example.com',
    hero_cta: '开始爬取',
    how_title: '三步完成网站备份',
    how_step1_title: '输入网址',
    how_step1_desc: '粘贴目标网站的完整 URL，支持任意静态或 SSR 渲染的网站。',
    how_step2_title: '后台爬取',
    how_step2_desc: '服务器自动抓取所有 HTML、CSS、JS、图片等资源，无需在本地安装任何软件。',
    how_step3_title: '下载 ZIP',
    how_step3_desc: '爬取完成后，浏览器自动触发下载，文件结构与原站保持一致。',
    case_title: '使用案例',
    case1_name: '游戏门户备份',
    case1_desc: '抓取 hot5games 门户页、游戏图标、JSON 数据，用于搭建镜像站点。',
    case2_name: '企业官网归档',
    case2_desc: '保存企业官网的完整快照，包含所有静态资源，方便离线查阅。',
    footer_desc: '静态网站爬取工具 · 开源 · 部署于 Cloudflare',
    crawl_title: '爬取任务',
    crawl_url_label: '目标网站 URL',
    crawl_start: '开始爬取',
    crawl_running: '爬取中...',
    crawl_done: '爬取完成',
    crawl_failed: '爬取失败',
    crawl_download: '下载 ZIP',
    crawl_files: '已抓取文件',
    crawl_size: '打包大小',
    crawl_js_warning: '检测到该网站依赖 JavaScript 动态渲染，内容可能不完整。建议改用本地 Playwright 工具进行完整抓取。',
    crawl_leave_confirm: '爬取任务正在进行中，离开页面将中断任务。确定要离开吗？',
    history_title: '爬取历史',
    history_empty: '暂无历史记录',
    history_url: '网址',
    history_status: '状态',
    history_files: '文件数',
    history_size: '大小',
    history_time: '时间',
    login_title: '登录',
    login_email: '邮箱',
    login_password: '密码',
    login_submit: '登录',
    login_no_account: '还没有账号？',
    register_title: '注册',
    register_email: '邮箱',
    register_password: '密码',
    register_submit: '注册',
    register_has_account: '已有账号？',
    error_invalid_url: '请输入有效的网站 URL（以 http:// 或 https:// 开头）',
    error_auth_required: '请先登录后再查看历史记录',
  },
  en: {
    nav_crawl: 'Crawl',
    nav_history: 'History',
    nav_login: 'Login',
    nav_register: 'Register',
    nav_logout: 'Logout',
    hero_title: 'Download Any Static Website in One Click',
    hero_subtitle: 'Enter a URL and we\'ll crawl the entire site, packaging all assets into a ZIP file ready to download.',
    hero_placeholder: 'Enter target URL, e.g. https://example.com',
    hero_cta: 'Start Crawling',
    how_title: 'Three Steps to Back Up Any Site',
    how_step1_title: 'Enter the URL',
    how_step1_desc: 'Paste the full URL of any static or SSR-rendered website.',
    how_step2_title: 'Server-Side Crawl',
    how_step2_desc: 'Our server fetches all HTML, CSS, JS, and images. No local software required.',
    how_step3_title: 'Download ZIP',
    how_step3_desc: 'Browser auto-downloads a ZIP preserving the original file structure.',
    case_title: 'Use Cases',
    case1_name: 'Game Portal Backup',
    case1_desc: 'Mirror a game portal including thumbnails, JSON data, and all assets.',
    case2_name: 'Corporate Site Archive',
    case2_desc: 'Snapshot a company website with all static resources for offline review.',
    footer_desc: 'Static Site Crawler · Open Source · Powered by Cloudflare',
    crawl_title: 'Crawl Job',
    crawl_url_label: 'Target URL',
    crawl_start: 'Start Crawling',
    crawl_running: 'Crawling...',
    crawl_done: 'Done',
    crawl_failed: 'Failed',
    crawl_download: 'Download ZIP',
    crawl_files: 'Files fetched',
    crawl_size: 'ZIP size',
    crawl_js_warning: 'This site appears to require JavaScript rendering. Content may be incomplete. Consider using Playwright locally for a full crawl.',
    crawl_leave_confirm: 'A crawl is in progress. Leaving will cancel it. Are you sure?',
    history_title: 'Crawl History',
    history_empty: 'No history yet',
    history_url: 'URL',
    history_status: 'Status',
    history_files: 'Files',
    history_size: 'Size',
    history_time: 'Time',
    login_title: 'Login',
    login_email: 'Email',
    login_password: 'Password',
    login_submit: 'Login',
    login_no_account: "Don't have an account?",
    register_title: 'Register',
    register_email: 'Email',
    register_password: 'Password',
    register_submit: 'Register',
    register_has_account: 'Already have an account?',
    error_invalid_url: 'Please enter a valid URL starting with http:// or https://',
    error_auth_required: 'Please log in to view your crawl history',
  },
} satisfies Record<Lang, Record<string, string>>

export type MessageKey = keyof typeof messages.zh

import { createContext, useContext, useState } from 'react'

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: MessageKey) => string
}

export const LangContext = createContext<LangContextValue>({
  lang: 'zh',
  setLang: () => {},
  t: (key) => messages.zh[key],
})

export function useLangProvider() {
  const [lang, setLang] = useState<Lang>('zh')
  const t = (key: MessageKey) => messages[lang][key]
  return { lang, setLang, t }
}

export function useLang() {
  return useContext(LangContext)
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd app && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/i18n.ts
git commit -m "feat: add zh/en i18n message map and useLang hook"
```

---

## Phase 2: Landing Page

### Task 4: Root Layout + NavBar + Footer

**Files:**
- Create: `app/src/routes/__root.tsx`
- Create: `app/src/components/NavBar.tsx`
- Create: `app/src/components/Footer.tsx`

- [x] **Step 1: Write `app/src/components/NavBar.tsx`**

```tsx
import { Link } from '@tanstack/react-router'
import { useLang, Lang } from '../lib/i18n'
import { getToken, clearToken } from '../lib/auth'

export function NavBar() {
  const { lang, setLang, t } = useLang()
  const isLoggedIn = !!getToken()

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg text-blue-600">SiteCrawler</Link>

        <div className="flex items-center gap-4 text-sm">
          <Link to="/crawl" className="text-gray-700 hover:text-blue-600">{t('nav_crawl')}</Link>
          {isLoggedIn && (
            <Link to="/history" className="text-gray-700 hover:text-blue-600">{t('nav_history')}</Link>
          )}
          {isLoggedIn ? (
            <button
              onClick={() => { clearToken(); window.location.href = '/' }}
              className="text-gray-500 hover:text-red-500"
            >
              {t('nav_logout')}
            </button>
          ) : (
            <>
              <Link to="/auth/login" className="text-gray-700 hover:text-blue-600">{t('nav_login')}</Link>
              <Link to="/auth/register" className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
                {t('nav_register')}
              </Link>
            </>
          )}
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-500 hover:border-blue-400"
          >
            {lang === 'zh' ? 'EN' : '中文'}
          </button>
        </div>
      </div>
    </nav>
  )
}
```

- [x] **Step 2: Write `app/src/components/Footer.tsx`**

```tsx
import { useLang } from '../lib/i18n'

export function Footer() {
  const { t } = useLang()
  return (
    <footer className="border-t border-gray-200 mt-20 py-8 text-center text-sm text-gray-400">
      {t('footer_desc')}
    </footer>
  )
}
```

- [x] **Step 3: Write `app/src/routes/__root.tsx`**

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { LangContext, useLangProvider } from '../lib/i18n'
import { NavBar } from '../components/NavBar'
import { Footer } from '../components/Footer'

function RootLayout() {
  const langValue = useLangProvider()
  return (
    <LangContext.Provider value={langValue}>
      <div className="min-h-screen flex flex-col bg-gray-50">
        <NavBar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
    </LangContext.Provider>
  )
}

export const Route = createRootRoute({ component: RootLayout })
```

- [x] **Step 4: Commit**

```bash
git add app/src/routes/__root.tsx app/src/components/
git commit -m "feat: add root layout, NavBar, Footer with lang switcher"
```

---

### Task 5: Hero + HowItWorks + CaseStudies + Landing Page

**Files:**
- Create: `app/src/components/Hero.tsx`
- Create: `app/src/components/HowItWorks.tsx`
- Create: `app/src/components/CaseStudies.tsx`
- Create: `app/src/routes/index.tsx`

- [x] **Step 1: Write `app/src/components/Hero.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLang } from '../lib/i18n'

export function Hero() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
      setError('')
      navigate({ to: '/crawl', search: { url } })
    } catch {
      setError(t('error_invalid_url'))
    }
  }

  return (
    <section className="bg-gradient-to-b from-blue-50 to-white py-20 px-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4 max-w-2xl mx-auto">
        {t('hero_title')}
      </h1>
      <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto">{t('hero_subtitle')}</p>

      <form onSubmit={handleSubmit} className="max-w-xl mx-auto flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('hero_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            {t('hero_cta')}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm text-left">{error}</p>}
      </form>
    </section>
  )
}
```

- [x] **Step 2: Write `app/src/components/HowItWorks.tsx`**

```tsx
import { useLang } from '../lib/i18n'

const steps = [
  { icon: '🔗', titleKey: 'how_step1_title', descKey: 'how_step1_desc' },
  { icon: '⚙️', titleKey: 'how_step2_title', descKey: 'how_step2_desc' },
  { icon: '📦', titleKey: 'how_step3_title', descKey: 'how_step3_desc' },
] as const

export function HowItWorks() {
  const { t } = useLang()
  return (
    <section className="py-16 px-4 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">{t('how_title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-4xl mb-4">{s.icon}</div>
            <h3 className="font-semibold text-gray-800 mb-2">{t(s.titleKey)}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{t(s.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [x] **Step 3: Write `app/src/components/CaseStudies.tsx`**

```tsx
import { useLang } from '../lib/i18n'

export function CaseStudies() {
  const { t } = useLang()
  const cases = [
    { titleKey: 'case1_name', descKey: 'case1_desc', tag: 'hot5games' },
    { titleKey: 'case2_name', descKey: 'case2_desc', tag: 'corporate' },
  ] as const

  return (
    <section className="bg-gray-50 py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">{t('case_title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cases.map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-mono mb-3 inline-block">
                {c.tag}
              </span>
              <h3 className="font-semibold text-gray-800 mb-2">{t(c.titleKey)}</h3>
              <p className="text-gray-500 text-sm">{t(c.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [x] **Step 4: Write `app/src/routes/index.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Hero } from '../components/Hero'
import { HowItWorks } from '../components/HowItWorks'
import { CaseStudies } from '../components/CaseStudies'

export const Route = createFileRoute('/')({
  component: () => (
    <>
      <Hero />
      <HowItWorks />
      <CaseStudies />
    </>
  ),
  head: () => ({
    meta: [
      { title: '静态网站爬取工具 | SiteCrawler' },
      { name: 'description', content: '输入任意静态网站地址，自动抓取全部资源并打包成 ZIP 文件下载。' },
    ],
  }),
})
```

- [x] **Step 5: Verify landing page renders**

```bash
cd app && npm run dev
```
Open http://localhost:5173 — should show hero + 3-step section + cases.

- [x] **Step 6: Commit**

```bash
git add app/src/components/ app/src/routes/index.tsx
git commit -m "feat: add landing page — Hero, HowItWorks, CaseStudies"
```

---

## Phase 3: Auth (Worker + Frontend)

### Task 6: D1 Schema + DB Query Helpers

**Files:**
- Create: `worker/src/db/schema.sql`
- Create: `worker/src/db/queries.ts`

- [x] **Step 1: Write `worker/src/db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  file_count INTEGER,
  zip_size INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
```

- [x] **Step 2: Create D1 database and apply schema**

```bash
cd worker
npx wrangler d1 create site-crawler-db
# Copy the database_id output and paste into wrangler.toml [[d1_databases]] database_id field

npx wrangler d1 execute site-crawler-db --local --file=src/db/schema.sql
```

- [x] **Step 3: Write `worker/src/db/queries.ts`**

```ts
import type { Env } from '../index'

export interface User {
  id: string
  email: string
  password_hash: string
  created_at: number
}

export interface CrawlRecord {
  id: string
  user_id: string
  url: string
  status: 'running' | 'done' | 'failed'
  file_count: number | null
  zip_size: number | null
  created_at: number
  completed_at: number | null
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>()
  return result ?? null
}

export async function createUser(db: D1Database, user: Omit<User, 'created_at'> & { created_at: number }): Promise<void> {
  await db.prepare(
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).bind(user.id, user.email, user.password_hash, user.created_at).run()
}

export async function createCrawlRecord(db: D1Database, record: CrawlRecord): Promise<void> {
  await db.prepare(
    'INSERT INTO crawl_history (id, user_id, url, status, file_count, zip_size, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(record.id, record.user_id, record.url, record.status, record.file_count, record.zip_size, record.created_at, record.completed_at).run()
}

export async function updateCrawlRecord(
  db: D1Database,
  id: string,
  update: { status: string; file_count?: number; zip_size?: number; completed_at?: number }
): Promise<void> {
  await db.prepare(
    'UPDATE crawl_history SET status = ?, file_count = ?, zip_size = ?, completed_at = ? WHERE id = ?'
  ).bind(update.status, update.file_count ?? null, update.zip_size ?? null, update.completed_at ?? null, id).run()
}

export async function getCrawlHistory(db: D1Database, userId: string): Promise<CrawlRecord[]> {
  const result = await db.prepare(
    'SELECT * FROM crawl_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(userId).all<CrawlRecord>()
  return result.results
}
```

- [x] **Step 4: Commit**

```bash
git add worker/src/db/
git commit -m "feat: add D1 schema and typed query helpers"
```

---

### Task 7: JWT Utils + Auth Endpoints

**Files:**
- Create: `worker/src/auth/jwt.ts`
- Create: `worker/src/auth/handlers.ts`

- [ ] **Step 1: Write `worker/src/auth/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose'

export interface JWTPayload {
  sub: string  // user id
  email: string
}

function getKey(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: JWTPayload, secret: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getKey(secret))
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret))
    return { sub: payload.sub as string, email: payload.email as string }
  } catch {
    return null
  }
}

export function extractBearer(request: Request): string | null {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}
```

- [ ] **Step 2: Write `worker/src/auth/handlers.ts`**

```ts
import type { Env } from '../index'
import { signToken } from './jwt'
import { getUserByEmail, createUser } from '../db/queries'

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN,
    'Content-Type': 'application/json',
  }
}

function json(data: unknown, status = 200, env: Env) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(env) })
}

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json<{ email: string; password: string }>()
  if (!email || !password || password.length < 8) {
    return json({ error: 'Invalid email or password (min 8 chars)' }, 400, env)
  }
  const existing = await getUserByEmail(env.DB, email)
  if (existing) return json({ error: 'Email already registered' }, 409, env)

  const id = crypto.randomUUID()
  const password_hash = await hashPassword(password)
  await createUser(env.DB, { id, email, password_hash, created_at: Date.now() })

  const token = await signToken({ sub: id, email }, env.JWT_SECRET)
  return json({ token }, 201, env)
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json<{ email: string; password: string }>()
  const user = await getUserByEmail(env.DB, email)
  if (!user) return json({ error: 'Invalid credentials' }, 401, env)

  const hash = await hashPassword(password)
  if (hash !== user.password_hash) return json({ error: 'Invalid credentials' }, 401, env)

  const token = await signToken({ sub: user.id, email: user.email }, env.JWT_SECRET)
  return json({ token }, 200, env)
}
```

- [ ] **Step 3: Set the JWT secret**

```bash
cd worker
npx wrangler secret put JWT_SECRET
# Enter a random 32+ char string when prompted
```

- [ ] **Step 4: Commit**

```bash
git add worker/src/auth/
git commit -m "feat: add JWT auth — sign/verify + register/login handlers"
```

---

### Task 8: Frontend Auth (localStorage + login/register pages)

**Files:**
- Create: `app/src/lib/auth.ts`
- Create: `app/src/lib/api.ts`
- Create: `app/src/routes/auth/login.tsx`
- Create: `app/src/routes/auth/register.tsx`

- [x] **Step 1: Write `app/src/lib/auth.ts`**

```ts
const TOKEN_KEY = 'sc_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}
```

- [x] **Step 2: Write `app/src/lib/api.ts`**

```ts
import { getToken } from './auth'

const WORKER_BASE = import.meta.env.VITE_WORKER_URL ?? 'http://localhost:8787'

export async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  return fetch(`${WORKER_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
}
```

- [x] **Step 3: Create `app/.env.local` for local dev**

```
VITE_WORKER_URL=http://localhost:8787
```

- [x] **Step 4: Write `app/src/routes/auth/login.tsx`**

```tsx
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useLang } from '../../lib/i18n'
import { fetchWorker } from '../../lib/api'
import { setToken } from '../../lib/auth'

function LoginPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetchWorker('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      const { token } = await res.json<{ token: string }>()
      setToken(token)
      navigate({ to: '/' })
    } else {
      const { error: msg } = await res.json<{ error: string }>()
      setError(msg)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t('login_title')}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder={t('login_email')}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder={t('login_password')}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit"
          className="bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700">
          {t('login_submit')}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500 text-center">
        {t('login_no_account')}{' '}
        <Link to="/auth/register" className="text-blue-600 hover:underline">{t('nav_register')}</Link>
      </p>
    </div>
  )
}

export const Route = createFileRoute('/auth/login')({ component: LoginPage })
```

- [x] **Step 5: Write `app/src/routes/auth/register.tsx`** (mirror of login with register endpoint)

```tsx
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useLang } from '../../lib/i18n'
import { fetchWorker } from '../../lib/api'
import { setToken } from '../../lib/auth'

function RegisterPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetchWorker('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (res.ok) {
      const { token } = await res.json<{ token: string }>()
      setToken(token)
      navigate({ to: '/' })
    } else {
      const { error: msg } = await res.json<{ error: string }>()
      setError(msg)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-20 bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900 mb-6">{t('register_title')}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder={t('register_email')}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder={t('register_password')}
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button type="submit"
          className="bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700">
          {t('register_submit')}
        </button>
      </form>
      <p className="mt-4 text-sm text-gray-500 text-center">
        {t('register_has_account')}{' '}
        <Link to="/auth/login" className="text-blue-600 hover:underline">{t('nav_login')}</Link>
      </p>
    </div>
  )
}

export const Route = createFileRoute('/auth/register')({ component: RegisterPage })
```

- [x] **Step 6: Commit**

```bash
git add app/src/lib/auth.ts app/src/lib/api.ts app/src/routes/auth/ app/.env.local
git commit -m "feat: add auth lib, API wrapper, login and register pages"
```

---

## Phase 4: Crawl Engine (Worker)

### Task 9: JS-Rendered Site Detector + HTML Parser

**Files:**
- Create: `worker/src/crawl/detector.ts`
- Create: `worker/src/crawl/parser.ts`

- [ ] **Step 1: Write `worker/src/crawl/detector.ts`**

The heuristic: if the body has less than 200 visible characters after stripping tags, assume JS-rendered.

```ts
export function isJsRendered(html: string): boolean {
  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  if (!bodyMatch) return true

  // Strip all tags, collapse whitespace
  const text = bodyMatch[1]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // If less than 200 chars of visible text → likely SPA shell
  return text.length < 200
}
```

- [ ] **Step 2: Write `worker/src/crawl/parser.ts`**

```ts
import { parse } from 'node-html-parser'

export interface ParsedAssets {
  links: string[]    // href links to follow (same-origin HTML pages)
  assets: string[]   // src/href assets to download (CSS, JS, images, etc.)
}

export function parseAssets(html: string, baseUrl: string): ParsedAssets {
  const base = new URL(baseUrl)
  const root = parse(html)
  const links: string[] = []
  const assets: string[] = []

  function resolve(rawHref: string): string | null {
    try {
      const resolved = new URL(rawHref, base)
      // Only same-origin
      if (resolved.origin !== base.origin) return null
      return resolved.href
    } catch {
      return null
    }
  }

  // Follow <a href> links (HTML pages)
  for (const el of root.querySelectorAll('a[href]')) {
    const href = el.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue
    const url = resolve(href)
    if (url) links.push(url)
  }

  // Collect assets
  const assetSelectors: Array<[string, string]> = [
    ['link[href]', 'href'],
    ['script[src]', 'src'],
    ['img[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src'],
    ['audio[src]', 'src'],
  ]

  for (const [selector, attr] of assetSelectors) {
    for (const el of root.querySelectorAll(selector)) {
      const val = el.getAttribute(attr)
      if (!val) continue
      const url = resolve(val)
      if (url) assets.push(url)
    }
  }

  return { links: [...new Set(links)], assets: [...new Set(assets)] }
}
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/crawl/detector.ts worker/src/crawl/parser.ts
git commit -m "feat: add JS-renderer detector and HTML asset parser"
```

---

### Task 10: ZIP Builder + Crawl Engine

**Files:**
- Create: `worker/src/crawl/zipper.ts`
- Create: `worker/src/crawl/engine.ts`

- [ ] **Step 1: Write `worker/src/crawl/zipper.ts`**

```ts
import { zip } from 'fflate'

export interface ZipEntry {
  path: string     // relative path inside ZIP, e.g. "css/style.css"
  data: Uint8Array
}

export function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const files: Record<string, Uint8Array> = {}
    for (const e of entries) {
      files[e.path] = e.data
    }
    zip(files, { level: 1 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}
```

- [ ] **Step 2: Write `worker/src/crawl/engine.ts`**

Limits: depth ≤ 2, max 200 files, max 50 MB total.

```ts
import { isJsRendered } from './detector'
import { parseAssets } from './parser'
import { buildZip, ZipEntry } from './zipper'

export interface CrawlResult {
  zip: Uint8Array
  fileCount: number
  totalBytes: number
  jsWarning: boolean
}

const MAX_FILES = 200
const MAX_BYTES = 50 * 1024 * 1024  // 50 MB
const MAX_DEPTH = 2

export async function crawlSite(startUrl: string): Promise<CrawlResult> {
  const base = new URL(startUrl)
  const visited = new Set<string>()
  const entries: ZipEntry[] = []
  let totalBytes = 0
  let jsWarning = false

  async function fetchAndAdd(url: string): Promise<void> {
    if (visited.has(url)) return
    visited.add(url)

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 SiteCrawlerBot/1.0' },
        redirect: 'follow',
      })
    } catch {
      return  // network error — skip
    }

    if (!res.ok) return

    const buf = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    totalBytes += data.byteLength

    if (totalBytes > MAX_BYTES) return  // hard stop

    // Derive relative path for ZIP
    const parsed = new URL(url)
    let zipPath = parsed.pathname.replace(/^\//, '') || 'index.html'
    if (zipPath.endsWith('/')) zipPath += 'index.html'

    entries.push({ path: zipPath, data })
  }

  async function crawl(url: string, depth: number): Promise<void> {
    if (visited.has(url) || entries.length >= MAX_FILES) return
    visited.add(url)

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 SiteCrawlerBot/1.0' },
        redirect: 'follow',
      })
    } catch {
      return
    }

    if (!res.ok) return

    const contentType = res.headers.get('Content-Type') ?? ''
    const isHtml = contentType.includes('text/html')

    const buf = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    totalBytes += data.byteLength
    if (totalBytes > MAX_BYTES) return

    const parsed = new URL(url)
    let zipPath = parsed.pathname.replace(/^\//, '') || 'index.html'
    if (zipPath.endsWith('/')) zipPath += 'index.html'
    entries.push({ path: zipPath, data })

    if (!isHtml || depth >= MAX_DEPTH) return

    const html = new TextDecoder().decode(data)

    // Check for JS rendering on the entry page
    if (depth === 0 && isJsRendered(html)) {
      jsWarning = true
    }

    const { links, assets } = parseAssets(html, url)

    // Fetch assets concurrently (no recursion)
    await Promise.allSettled(
      assets
        .filter(a => !visited.has(a) && entries.length < MAX_FILES)
        .map(a => fetchAndAdd(a))
    )

    // Follow links sequentially to respect depth
    for (const link of links) {
      if (entries.length >= MAX_FILES || totalBytes > MAX_BYTES) break
      await crawl(link, depth + 1)
    }
  }

  await crawl(startUrl, 0)

  const zip = await buildZip(entries)
  return { zip, fileCount: entries.length, totalBytes, jsWarning }
}
```

- [ ] **Step 3: Commit**

```bash
git add worker/src/crawl/
git commit -m "feat: add ZIP builder and recursive crawl engine (depth=2, max 200 files, 50MB)"
```

---

### Task 11: Crawl Handler + Worker Router

**Files:**
- Create: `worker/src/crawl/handler.ts`
- Modify: `worker/src/index.ts`

- [x] **Step 1: Write `worker/src/crawl/handler.ts`**

```ts
import type { Env } from '../index'
import { crawlSite } from './engine'
import { verifyToken, extractBearer } from '../auth/jwt'
import { createCrawlRecord, updateCrawlRecord } from '../db/queries'

function corsHeaders(env: Env) {
  return { 'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN }
}

export async function handleCrawl(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const { url } = await request.json<{ url: string }>()
  if (!url) {
    return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400,
      headers: { ...corsHeaders(env), 'Content-Type': 'application/json' },
    })
  }

  // Auth is optional for crawling — logged-in users get history saved
  let userId: string | null = null
  const token = extractBearer(request)
  if (token) {
    const payload = await verifyToken(token, env.JWT_SECRET)
    userId = payload?.sub ?? null
  }

  const jobId = crypto.randomUUID()
  const now = Date.now()

  if (userId) {
    await createCrawlRecord(env.DB, {
      id: jobId, user_id: userId, url, status: 'running',
      file_count: null, zip_size: null, created_at: now, completed_at: null,
    })
  }

  let result
  try {
    result = await crawlSite(url)
  } catch (err) {
    if (userId) {
      await updateCrawlRecord(env.DB, jobId, { status: 'failed', completed_at: Date.now() })
    }
    return new Response(JSON.stringify({ error: 'Crawl failed' }), {
      status: 500,
      headers: { ...corsHeaders(env), 'Content-Type': 'application/json' },
    })
  }

  if (userId) {
    await updateCrawlRecord(env.DB, jobId, {
      status: 'done',
      file_count: result.fileCount,
      zip_size: result.zip.byteLength,
      completed_at: Date.now(),
    })
  }

  const headers: HeadersInit = {
    ...corsHeaders(env),
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="site-${new URL(url).hostname}.zip"`,
    'X-File-Count': String(result.fileCount),
    'X-Total-Bytes': String(result.totalBytes),
    'X-JS-Warning': result.jsWarning ? '1' : '0',
  }

  return new Response(result.zip, { headers })
}
```

- [x] **Step 2: Write history handler inline in `worker/src/index.ts`**

Replace the skeleton `index.ts` with the full router:

```ts
import { handleRegister, handleLogin } from './auth/handlers'
import { handleCrawl } from './crawl/handler'
import { verifyToken, extractBearer } from './auth/jwt'
import { getCrawlHistory } from './db/queries'

export interface Env {
  DB: D1Database
  JWT_SECRET: string
  FRONTEND_ORIGIN: string
}

function cors(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(env) })
    }

    const { pathname } = new URL(request.url)

    if (pathname === '/api/auth/register') return handleRegister(request, env)
    if (pathname === '/api/auth/login') return handleLogin(request, env)
    if (pathname === '/api/crawl') return handleCrawl(request, env)

    if (pathname === '/api/history') {
      const token = extractBearer(request)
      if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors(env), 'Content-Type': 'application/json' },
      })
      const payload = await verifyToken(token, env.JWT_SECRET)
      if (!payload) return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...cors(env), 'Content-Type': 'application/json' },
      })
      const history = await getCrawlHistory(env.DB, payload.sub)
      return new Response(JSON.stringify(history), {
        headers: { ...cors(env), 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not Found', { status: 404 })
  },
}
```

- [x] **Step 3: Start Worker locally and test crawl**

```bash
cd worker && npx wrangler dev
```

In another terminal:
```bash
curl -X POST http://localhost:8787/api/crawl \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}' \
  --output test.zip
```
Expected: `test.zip` created, ~1-2 files inside.

- [x] **Step 4: Commit**

```bash
git add worker/src/
git commit -m "feat: complete Worker with crawl, auth, and history endpoints"
```

---

## Phase 5: Crawl UI

### Task 12: Crawl State + CrawlProgress Component

**Files:**
- Create: `app/src/lib/crawl-state.ts`
- Create: `app/src/components/CrawlProgress.tsx`
- Create: `app/src/routes/crawl.tsx`

- [x] **Step 1: Write `app/src/lib/crawl-state.ts`**

```ts
const KEY = 'sc_crawl'

export type CrawlStatus = 'idle' | 'running' | 'done' | 'failed'

export interface CrawlState {
  url: string
  status: CrawlStatus
  startedAt: number
}

export function saveCrawlState(state: CrawlState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function loadCrawlState(): CrawlState | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as CrawlState } catch { return null }
}

export function clearCrawlState(): void {
  localStorage.removeItem(KEY)
}
```

- [x] **Step 2: Write `app/src/components/CrawlProgress.tsx`**

```tsx
import { useLang } from '../lib/i18n'

interface Props {
  status: 'running' | 'done' | 'failed'
  fileCount?: number
  totalBytes?: number
  jsWarning?: boolean
  onDownload?: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function CrawlProgress({ status, fileCount, totalBytes, jsWarning, onDownload }: Props) {
  const { t } = useLang()

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-xl mx-auto mt-8">
      {jsWarning && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm rounded-lg p-3 mb-4">
          ⚠️ {t('crawl_js_warning')}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        {status === 'running' && (
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        )}
        {status === 'done' && <span className="text-green-500 text-lg">✓</span>}
        {status === 'failed' && <span className="text-red-500 text-lg">✗</span>}
        <span className="font-medium text-gray-800">
          {status === 'running' ? t('crawl_running') : status === 'done' ? t('crawl_done') : t('crawl_failed')}
        </span>
      </div>

      {(fileCount !== undefined || totalBytes !== undefined) && (
        <div className="flex gap-6 text-sm text-gray-500 mb-4">
          {fileCount !== undefined && (
            <span>{t('crawl_files')}: <strong className="text-gray-800">{fileCount}</strong></span>
          )}
          {totalBytes !== undefined && (
            <span>{t('crawl_size')}: <strong className="text-gray-800">{formatBytes(totalBytes)}</strong></span>
          )}
        </div>
      )}

      {status === 'done' && onDownload && (
        <button
          onClick={onDownload}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          {t('crawl_download')}
        </button>
      )}
    </div>
  )
}
```

- [x] **Step 3: Write `app/src/routes/crawl.tsx`**

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useLang } from '../lib/i18n'
import { fetchWorker } from '../lib/api'
import { saveCrawlState, clearCrawlState } from '../lib/crawl-state'
import { CrawlProgress } from '../components/CrawlProgress'
import { z } from 'zod'

const searchSchema = z.object({ url: z.string().optional() })

type Status = 'idle' | 'running' | 'done' | 'failed'

function CrawlPage() {
  const { url } = Route.useSearch()
  const { t } = useLang()
  const [inputUrl, setInputUrl] = useState(url ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [fileCount, setFileCount] = useState<number>()
  const [totalBytes, setTotalBytes] = useState<number>()
  const [jsWarning, setJsWarning] = useState(false)
  const zipRef = useRef<Blob | null>(null)
  const zipNameRef = useRef('site.zip')

  // beforeunload warning when crawl is running
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (status === 'running') {
        e.preventDefault()
        e.returnValue = t('crawl_leave_confirm')
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status, t])

  async function startCrawl(targetUrl: string) {
    setStatus('running')
    saveCrawlState({ url: targetUrl, status: 'running', startedAt: Date.now() })

    try {
      const res = await fetchWorker('/api/crawl', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl }),
      })

      if (!res.ok) {
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed', startedAt: Date.now() })
        return
      }

      const count = Number(res.headers.get('X-File-Count'))
      const bytes = Number(res.headers.get('X-Total-Bytes'))
      const jsWarn = res.headers.get('X-JS-Warning') === '1'
      const blob = await res.blob()

      setFileCount(count)
      setTotalBytes(bytes)
      setJsWarning(jsWarn)
      zipRef.current = blob
      zipNameRef.current = `site-${new URL(targetUrl).hostname}.zip`
      setStatus('done')
      saveCrawlState({ url: targetUrl, status: 'done', startedAt: Date.now() })
    } catch {
      setStatus('failed')
      saveCrawlState({ url: targetUrl, status: 'failed', startedAt: Date.now() })
    }
  }

  function downloadZip() {
    if (!zipRef.current) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipRef.current)
    a.download = zipNameRef.current
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Auto-start if URL provided via query param
  useEffect(() => {
    if (url && status === 'idle') startCrawl(url)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'running') return
    clearCrawlState()
    zipRef.current = null
    setFileCount(undefined)
    setTotalBytes(undefined)
    setJsWarning(false)
    startCrawl(inputUrl)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('crawl_title')}</h1>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          type="text"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          placeholder={t('hero_placeholder')}
          disabled={status === 'running'}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={status === 'running' || !inputUrl}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === 'running' ? t('crawl_running') : t('crawl_start')}
        </button>
      </form>

      {status !== 'idle' && (
        <CrawlProgress
          status={status === 'idle' ? 'running' : status}
          fileCount={fileCount}
          totalBytes={totalBytes}
          jsWarning={jsWarning}
          onDownload={downloadZip}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute('/crawl')({
  validateSearch: searchSchema,
  component: CrawlPage,
})
```

- [x] **Step 4: Verify full flow works locally**

```bash
# Terminal 1: Worker
cd worker && npx wrangler dev

# Terminal 2: Frontend
cd app && npm run dev
```

Open http://localhost:5173, enter `https://example.com`, click Start — should show progress then download prompt.

- [x] **Step 5: Commit**

```bash
git add app/src/lib/crawl-state.ts app/src/components/CrawlProgress.tsx app/src/routes/crawl.tsx
git commit -m "feat: add crawl UI with progress, beforeunload guard, ZIP download"
```

---

### Task 13: History Page

**Files:**
- Create: `app/src/routes/history.tsx`

- [x] **Step 1: Write `app/src/routes/history.tsx`**

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useLang } from '../lib/i18n'
import { fetchWorker } from '../lib/api'
import { getToken } from '../lib/auth'
import type { CrawlRecord } from '../../worker/src/db/queries'

function formatBytes(b: number) {
  if (!b) return '-'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function HistoryPage() {
  const { t } = useLang()
  const [records, setRecords] = useState<CrawlRecord[]>([])

  useEffect(() => {
    fetchWorker('/api/history')
      .then(r => r.json<CrawlRecord[]>())
      .then(setRecords)
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('history_title')}</h1>
      {records.length === 0 ? (
        <p className="text-gray-400">{t('history_empty')}</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-4">{t('history_url')}</th>
              <th className="py-2 pr-4">{t('history_status')}</th>
              <th className="py-2 pr-4">{t('history_files')}</th>
              <th className="py-2 pr-4">{t('history_size')}</th>
              <th className="py-2">{t('history_time')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4 max-w-xs truncate text-blue-600">{r.url}</td>
                <td className="py-2 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.status === 'done' ? 'bg-green-100 text-green-700' :
                    r.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{r.status}</span>
                </td>
                <td className="py-2 pr-4 text-gray-600">{r.file_count ?? '-'}</td>
                <td className="py-2 pr-4 text-gray-600">{formatBytes(r.zip_size ?? 0)}</td>
                <td className="py-2 text-gray-400">
                  {new Date(r.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export const Route = createFileRoute('/history')({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: '/auth/login' })
  },
  component: HistoryPage,
})
```

- [x] **Step 2: Commit**

```bash
git add app/src/routes/history.tsx
git commit -m "feat: add auth-guarded crawl history page"
```

---

## Phase 6: Deployment

### Task 14: Cloudflare Pages + Worker Deployment

**Files:**
- Create: `app/public/_redirects`
- Modify: `worker/wrangler.toml`
- Create: `package.json` (root monorepo scripts)

- [ ] **Step 1: Write `app/public/_redirects` for SPA routing**

```
/* /index.html 200
```

- [ ] **Step 2: Update root `package.json` with deploy scripts**

```json
{
  "scripts": {
    "dev:app": "cd app && npm run dev",
    "dev:worker": "cd worker && npx wrangler dev",
    "build:app": "cd app && npm run build",
    "deploy:worker": "cd worker && npx wrangler deploy",
    "deploy:pages": "cd app && npm run build && npx wrangler pages deploy dist --project-name=site-crawler"
  }
}
```

- [ ] **Step 3: Create Cloudflare Pages project**

```bash
cd app && npm run build
npx wrangler pages project create site-crawler
npx wrangler pages deploy dist --project-name=site-crawler
```

Copy the Pages URL (e.g. `https://site-crawler.pages.dev`)

- [ ] **Step 4: Update Worker CORS to use real Pages URL**

In `worker/wrangler.toml`:
```toml
[vars]
FRONTEND_ORIGIN = "https://site-crawler.pages.dev"
```

- [ ] **Step 5: Deploy Worker**

```bash
cd worker && npx wrangler deploy
```
Copy the Worker URL (e.g. `https://site-crawler-worker.workers.dev`)

- [ ] **Step 6: Update frontend env for production**

Create `app/.env.production`:
```
VITE_WORKER_URL=https://site-crawler-worker.workers.dev
```

Rebuild and redeploy Pages:
```bash
npm run build:app
npx wrangler pages deploy app/dist --project-name=site-crawler
```

- [ ] **Step 7: Apply D1 schema to production**

```bash
cd worker
npx wrangler d1 execute site-crawler-db --remote --file=src/db/schema.sql
```

- [ ] **Step 8: Set production JWT secret**

```bash
npx wrangler secret put JWT_SECRET
```

- [ ] **Step 9: Smoke test production**

Open the Pages URL → enter `https://example.com` → verify crawl completes + ZIP downloads.

- [ ] **Step 10: Commit**

```bash
git add app/public/_redirects app/.env.production package.json worker/wrangler.toml
git commit -m "feat: add deployment config for CF Pages + Worker"
```

---

## Self-Review

### Spec Coverage Check

| Requirement | Covered in |
|-------------|-----------|
| URL input box on first screen | Task 5 — Hero component |
| Usage guide + cases section | Task 5 — HowItWorks, CaseStudies |
| SEO standards | Task 5 — route `head()` meta |
| Chinese/English bilingual, zh default | Task 3 — i18n system |
| TanStack + Vite + TailwindCSS | Task 1 |
| Deploy to Cloudflare | Task 14 |
| Browser-based crawl → Worker fallback | Task 11 — Worker always handles crawl |
| ZIP download output | Task 12 — fetchWorker + blob download |
| Crawl progress display | Task 12 — CrawlProgress component |
| beforeunload confirmation | Task 12 — useEffect listener |
| localStorage state persistence | Task 12 — crawl-state.ts |
| User login / registration | Tasks 7–8 |
| Crawl history saved to D1 | Tasks 6, 11 |
| JS-rendered site detection + warning | Tasks 9, 11 — X-JS-Warning header |
| Crawl limits (files, size) | Task 10 — MAX_FILES=200, MAX_BYTES=50MB |

### Placeholder Scan

No TBDs or incomplete steps found.

### Type Consistency

- `CrawlRecord` defined in `worker/src/db/queries.ts`, imported in `history.tsx`
- `Env` defined in `worker/src/index.ts`, imported across all worker modules
- `MessageKey` derived from `messages.zh` keys, used in all `t()` calls
- `CrawlStatus` from `crawl-state.ts` matches Worker response status values
