import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { MaterialIcon } from '../components/home/MaterialIcon'
import { useLang, type Lang } from '../lib/i18n'

type Feature = {
  icon: string
  title: string
  description: string
  badge: string
}

type LandingCopy = {
  eyebrow: string
  title: string
  subtitle: string
  primaryCta: string
  secondaryCta: string
  stats: Array<{ label: string; value: string }>
  architectureTitle: string
  architectureDesc: string
  flow: Array<{ label: string; detail: string }>
  capabilityTitle: string
  capabilities: Feature[]
  seoTitle: string
  seoDesc: string
  seoItems: Feature[]
  stackTitle: string
  stackItems: Feature[]
  deployTitle: string
  deployItems: Array<{ name: string; desc: string; state: string }>
  finalTitle: string
  finalDesc: string
}

const copy: Record<Lang, LandingCopy> = {
  zh: {
    eyebrow: 'Technical Showcase · SEO Engineering',
    title: 'SiteCrawler 技术架构展示',
    subtitle: '一个基于 Cloudflare Pages、Workers、D1、R2 与 GitHub Actions 的网站归档系统，覆盖静态资源抓取、JS 渲染完整爬取、SSE 进度反馈、登录历史与 SEO 工程配置。',
    primaryCta: '开始爬取',
    secondaryCta: '查看首页',
    stats: [
      { label: '前端', value: 'React + Vite' },
      { label: '边缘 API', value: 'Hono + Workers' },
      { label: '存储', value: 'D1 + R2' },
      { label: '重任务', value: 'GitHub Actions' },
    ],
    architectureTitle: 'Architecture Overview',
    architectureDesc: '轻任务在 Worker 边缘节点完成，重型 JS 渲染任务交给 GitHub Actions，最终通过 R2 和 D1 沉淀可下载结果与用户历史。',
    flow: [
      { label: 'User URL', detail: '用户输入目标站点' },
      { label: 'Worker API', detail: '校验、限流、SSE 推送' },
      { label: 'Crawler Core', detail: '静态抓取与链接重写' },
      { label: 'GitHub Actions', detail: 'Playwright 完整渲染' },
      { label: 'R2 + D1', detail: 'ZIP 存储与历史索引' },
      { label: 'Download', detail: '浏览器下载归档包' },
    ],
    capabilityTitle: '核心工程能力',
    capabilities: [
      { icon: 'travel_explore', title: '静态网站爬取', description: '解析 HTML、CSS、图片、字体和脚本资源，保留目录结构并重写相对路径。', badge: 'Crawler' },
      { icon: 'terminal', title: 'JS 完整爬取', description: '复杂 SPA 和动态站点交由 GitHub Actions + Playwright 处理，避免 Worker 执行时间限制。', badge: 'Playwright' },
      { icon: 'sync_alt', title: 'SSE 进度反馈', description: '爬取过程中流式返回文件数量、队列状态和资源大小，用户无需等待黑盒任务结束。', badge: 'SSE' },
      { icon: 'history', title: '登录历史记录', description: 'JWT 登录后将任务结果写入 D1，R2 保存完整 ZIP，支持后续重新下载。', badge: 'D1' },
    ],
    seoTitle: 'SEO 配置与展示能力',
    seoDesc: '落地页本身用于简历展示，也说明项目已具备产品化站点需要的基础 SEO 配置。',
    seoItems: [
      { icon: 'description', title: 'Meta 信息', description: '按页面维护 title、description、OG 标题和社交分享摘要。', badge: 'Meta' },
      { icon: 'account_tree', title: '结构化数据', description: '适合补充 SoftwareApplication、WebApplication、FAQ 等 JSON-LD。', badge: 'JSON-LD' },
      { icon: 'language', title: '双语与 hreflang', description: '现有中英语言切换可继续扩展为独立 URL 和 hreflang 映射。', badge: 'i18n' },
      { icon: 'speed', title: 'Lighthouse 指标', description: '首页已有性能、可访问性、最佳实践和 SEO 评分优化目标。', badge: 'CWV' },
    ],
    stackTitle: 'Cloudflare Stack',
    stackItems: [
      { icon: 'public', title: 'Cloudflare Pages', description: '承载 React 前端，静态资源由全球 CDN 分发。', badge: 'Frontend' },
      { icon: 'cloud', title: 'Workers API', description: 'Hono API 处理爬取请求、鉴权、限流与 SSE 响应。', badge: 'Edge' },
      { icon: 'database', title: 'D1 Database', description: '保存用户、任务、历史记录和结果索引。', badge: 'SQLite' },
      { icon: 'deployed_code', title: 'R2 Object Storage', description: '持久化 ZIP 结果，避免大文件压入数据库。', badge: 'Object' },
    ],
    deployTitle: '部署拓扑',
    deployItems: [
      { name: 'crawler.9shi.cc', desc: '前端应用，Cloudflare Pages 托管', state: 'Live' },
      { name: 'api.9shi.cc/crawler/*', desc: 'Worker API，负责爬取与任务状态', state: 'Live' },
      { name: 'GitHub Actions', desc: 'JS 渲染完整爬取的异步执行环境', state: 'Async' },
    ],
    finalTitle: '从产品功能到工程展示',
    finalDesc: '这个页面用于把 SiteCrawler 从单一工具升级为可讲清楚架构、部署、SEO 和边缘计算取舍的求职项目资产。',
  },
  en: {
    eyebrow: 'Technical Showcase · SEO Engineering',
    title: 'SiteCrawler Architecture Showcase',
    subtitle: 'A web archiving system built on Cloudflare Pages, Workers, D1, R2, and GitHub Actions, covering static asset crawling, JavaScript-rendered full crawls, SSE progress, authenticated history, and SEO engineering.',
    primaryCta: 'Start Crawling',
    secondaryCta: 'View Home',
    stats: [
      { label: 'Frontend', value: 'React + Vite' },
      { label: 'Edge API', value: 'Hono + Workers' },
      { label: 'Storage', value: 'D1 + R2' },
      { label: 'Heavy Jobs', value: 'GitHub Actions' },
    ],
    architectureTitle: 'Architecture Overview',
    architectureDesc: 'Lightweight work runs on the Worker edge runtime. Heavy JavaScript rendering is offloaded to GitHub Actions, while R2 and D1 store downloadable results and user history.',
    flow: [
      { label: 'User URL', detail: 'Target site input' },
      { label: 'Worker API', detail: 'Validation, limits, SSE' },
      { label: 'Crawler Core', detail: 'Static crawl and rewrite' },
      { label: 'GitHub Actions', detail: 'Playwright rendering' },
      { label: 'R2 + D1', detail: 'ZIP storage and index' },
      { label: 'Download', detail: 'Browser ZIP delivery' },
    ],
    capabilityTitle: 'Core Engineering Capabilities',
    capabilities: [
      { icon: 'travel_explore', title: 'Static Site Crawling', description: 'Parses HTML, CSS, images, fonts, and scripts while preserving folder structure and rewriting relative paths.', badge: 'Crawler' },
      { icon: 'terminal', title: 'Full JS Crawl', description: 'Complex SPAs are handled by GitHub Actions and Playwright to avoid Worker runtime limits.', badge: 'Playwright' },
      { icon: 'sync_alt', title: 'SSE Progress', description: 'Streams file counts, queue state, and asset size so the user can follow a running crawl.', badge: 'SSE' },
      { icon: 'history', title: 'Authenticated History', description: 'JWT users get D1-backed task history and R2-backed ZIP downloads for later access.', badge: 'D1' },
    ],
    seoTitle: 'SEO Configuration',
    seoDesc: 'The page is a portfolio-facing showcase and documents the product-grade SEO surface around the application.',
    seoItems: [
      { icon: 'description', title: 'Meta Information', description: 'Page-level title, description, Open Graph title, and social summaries.', badge: 'Meta' },
      { icon: 'account_tree', title: 'Structured Data', description: 'Ready for SoftwareApplication, WebApplication, and FAQ JSON-LD.', badge: 'JSON-LD' },
      { icon: 'language', title: 'Bilingual Surface', description: 'The existing language switch can evolve into dedicated URLs and hreflang mappings.', badge: 'i18n' },
      { icon: 'speed', title: 'Lighthouse Targets', description: 'The homepage already has a performance, accessibility, best-practices, and SEO optimization target.', badge: 'CWV' },
    ],
    stackTitle: 'Cloudflare Stack',
    stackItems: [
      { icon: 'public', title: 'Cloudflare Pages', description: 'Hosts the React frontend with global CDN delivery.', badge: 'Frontend' },
      { icon: 'cloud', title: 'Workers API', description: 'Hono API handles crawl requests, auth, rate limits, and SSE responses.', badge: 'Edge' },
      { icon: 'database', title: 'D1 Database', description: 'Stores users, jobs, history records, and result indexes.', badge: 'SQLite' },
      { icon: 'deployed_code', title: 'R2 Object Storage', description: 'Persists ZIP files without pushing large binaries into the database.', badge: 'Object' },
    ],
    deployTitle: 'Deployment Topology',
    deployItems: [
      { name: 'crawler.9shi.cc', desc: 'Frontend app hosted on Cloudflare Pages', state: 'Live' },
      { name: 'api.9shi.cc/crawler/*', desc: 'Worker API for crawl and task state', state: 'Live' },
      { name: 'GitHub Actions', desc: 'Async runtime for full JavaScript rendering', state: 'Async' },
    ],
    finalTitle: 'From Product Feature to Engineering Story',
    finalDesc: 'This page turns SiteCrawler from a utility into a job-search asset that explains architecture, deployment, SEO, and edge-computing tradeoffs.',
  },
}

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <article className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid size-10 place-items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] text-[var(--sc-accent)]">
          <MaterialIcon name={feature.icon} />
        </div>
        <span className="rounded-full border border-[var(--sc-border)] px-2.5 py-1 text-xs font-semibold text-[var(--sc-subtle)]">
          {feature.badge}
        </span>
      </div>
      <h3 className="mb-2 text-base font-semibold text-[var(--sc-strong)]">{feature.title}</h3>
      <p className="text-sm leading-6 text-[var(--sc-muted)]">{feature.description}</p>
    </article>
  )
}

function LandingPage() {
  const { lang } = useLang()
  const text = copy[lang]

  useEffect(() => {
    document.title = `${text.title} - SiteCrawler`
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (description) {
      description.content = text.subtitle
    } else {
      const meta = document.createElement('meta')
      meta.name = 'description'
      meta.content = text.subtitle
      document.head.appendChild(meta)
    }
  }, [text.subtitle, text.title])

  return (
    <main className="bg-[var(--sc-bg)] pt-16 text-[var(--sc-text)]">
      <section className="relative overflow-hidden border-b border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20">
        <div className="absolute inset-0 -z-0 bg-[linear-gradient(var(--sc-bg-grid)_1px,transparent_1px),linear-gradient(90deg,var(--sc-bg-grid)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="relative z-10">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{text.eyebrow}</p>
            <h1 className="mb-5 max-w-3xl text-4xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-6xl">
              {text.title}
            </h1>
            <p className="mb-8 max-w-2xl text-lg leading-8 text-[var(--sc-muted)]">{text.subtitle}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/crawl"
                className="rounded-md bg-[var(--sc-accent)] px-5 py-3 text-sm font-semibold text-[var(--sc-on-accent)] hover:opacity-90"
              >
                {text.primaryCta}
              </Link>
              <Link
                to="/"
                className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-card)] px-5 py-3 text-sm font-semibold text-[var(--sc-text)] hover:border-[var(--sc-accent)]"
              >
                {text.secondaryCta}
              </Link>
            </div>
          </div>

          <div className="relative z-10 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-console)] p-5 text-[#f2f2f2]">
            <div className="mb-5 flex items-center justify-between border-b border-[#3d3a39] pb-4">
              <div>
                <p className="text-sm font-semibold text-white">Runtime Map</p>
                <p className="text-xs text-slate-400">Pages → Workers → Actions → R2/D1</p>
              </div>
              <MaterialIcon name="hub" className="text-[#00d992]" />
            </div>
            <div className="grid gap-3">
              {text.flow.map((step, index) => (
                <div key={step.label} className="flex items-center gap-3 rounded-md border border-[#3d3a39] bg-[#1a1a1a] p-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#00d992] text-xs font-bold text-[#101010]">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{step.label}</p>
                    <p className="text-xs text-slate-400">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-8">
        <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-4">
          {text.stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-subtle)]">{stat.label}</p>
              <p className="mt-2 text-lg font-semibold text-[var(--sc-strong)]">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-dashed border-[var(--sc-border)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">SYSTEM FLOW</p>
            <h2 className="mb-3 text-3xl font-normal text-[var(--sc-strong)]">{text.architectureTitle}</h2>
            <p className="leading-7 text-[var(--sc-muted)]">{text.architectureDesc}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {text.flow.map((step) => (
              <div key={step.label} className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-4">
                <p className="text-sm font-semibold text-[var(--sc-strong)]">{step.label}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--sc-muted)]">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-3xl font-normal text-[var(--sc-strong)]">{text.capabilityTitle}</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {text.capabilities.map((feature) => <FeatureCard key={feature.title} feature={feature} />)}
          </div>
        </div>
      </section>

      <section className="border-b border-dashed border-[var(--sc-border)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 max-w-3xl">
            <h2 className="mb-3 text-3xl font-normal text-[var(--sc-strong)]">{text.seoTitle}</h2>
            <p className="leading-7 text-[var(--sc-muted)]">{text.seoDesc}</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {text.seoItems.map((feature) => <FeatureCard key={feature.title} feature={feature} />)}
          </div>
        </div>
      </section>

      <section className="border-b border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-3xl font-normal text-[var(--sc-strong)]">{text.stackTitle}</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {text.stackItems.map((feature) => <FeatureCard key={feature.title} feature={feature} />)}
          </div>
        </div>
      </section>

      <section className="border-b border-dashed border-[var(--sc-border)] px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center text-3xl font-normal text-[var(--sc-strong)]">{text.deployTitle}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {text.deployItems.map((item) => (
              <article key={item.name} className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5 text-center">
                <p className="mb-2 text-sm font-semibold text-[var(--sc-strong)]">{item.name}</p>
                <p className="mb-4 text-sm leading-6 text-[var(--sc-muted)]">{item.desc}</p>
                <span className="rounded-full border border-[var(--sc-accent)] px-3 py-1 text-xs font-semibold text-[var(--sc-accent)]">{item.state}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--sc-console)] px-6 py-16 text-[#f2f2f2]">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-normal text-white">{text.finalTitle}</h2>
          <p className="mb-8 leading-7 text-slate-300">{text.finalDesc}</p>
          <Link
            to="/crawl"
            className="inline-flex rounded-md bg-[#00d992] px-5 py-3 text-sm font-semibold text-[#101010] hover:opacity-90"
          >
            {text.primaryCta}
          </Link>
        </div>
      </section>
    </main>
  )
}

export const Route = createFileRoute('/landing')({ component: LandingPage })
