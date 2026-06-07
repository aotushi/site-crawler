import { type FormEvent, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeHero() {
  const navigate = useNavigate()
  const { lang, t } = useLang()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  const copy = {
    zh: {
      eyebrow: 'EDGE ARCHIVE PIPELINE',
      title: '把任何网站打包成可交付的离线资产',
      subtitle:
        'SiteCrawler 将静态资源、链接重写、JS 渲染兜底和 ZIP 交付串成一条可观测流水线，适合迁移、审计、归档和竞品页面留存。',
      command: 'crawler run --mode hybrid --zip',
      staticLimit: '静态链路',
      staticValue: '200 文件 / 50MB',
      jsFallback: 'JS 兜底',
      jsValue: 'Playwright Actions',
      delivery: '交付',
      deliveryValue: 'ZIP + 历史记录',
      inputLabel: '目标 URL',
      consoleTitle: 'live crawl trace',
      consoleLines: [
        '[edge] resolving target origin...',
        '[html] discovered 38 internal links',
        '[assets] downloading css, js, images, fonts',
        '[rewrite] normalizing relative paths',
        '[zip] package ready for offline review',
      ],
      stat1: '平均 30 秒内完成常规站点',
      stat2: 'Cloudflare Worker 边缘执行',
      stat3: '可升级到 Playwright 完整渲染',
    },
    en: {
      eyebrow: 'EDGE ARCHIVE PIPELINE',
      title: 'Package any website into deliverable offline assets',
      subtitle:
        'SiteCrawler turns asset discovery, link rewriting, JS-render fallback, and ZIP delivery into an observable pipeline for migrations, audits, archiving, and competitive research.',
      command: 'crawler run --mode hybrid --zip',
      staticLimit: 'Static lane',
      staticValue: '200 files / 50MB',
      jsFallback: 'JS fallback',
      jsValue: 'Playwright Actions',
      delivery: 'Delivery',
      deliveryValue: 'ZIP + history',
      inputLabel: 'Target URL',
      consoleTitle: 'live crawl trace',
      consoleLines: [
        '[edge] resolving target origin...',
        '[html] discovered 38 internal links',
        '[assets] downloading css, js, images, fonts',
        '[rewrite] normalizing relative paths',
        '[zip] package ready for offline review',
      ],
      stat1: 'Most standard sites finish under 30s',
      stat2: 'Runs on Cloudflare Worker edge',
      stat3: 'Escalates to full Playwright rendering',
    },
  }[lang]

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid')
      setError('')
      navigate({ to: '/crawl', search: { url } })
    } catch {
      setError(t('error_invalid_url'))
    }
  }

  return (
    <section id="hero" className="relative overflow-hidden bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)] md:py-24">
      <div className="absolute inset-0 -z-0 bg-[linear-gradient(var(--sc-bg-grid)_1px,transparent_1px),linear-gradient(90deg,var(--sc-bg-grid)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="relative z-10 mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[var(--sc-border)] px-3 py-1 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">
              {copy.eyebrow}
            </span>
            <span className="rounded-md bg-[var(--sc-soft)] px-3 py-1 font-mono text-xs text-[var(--sc-text)]">
              {copy.command}
            </span>
          </div>
          <h1 className="max-w-3xl text-4xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-6xl">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-[var(--sc-muted)] md:text-lg">
            {copy.subtitle}
          </p>

          <form onSubmit={onSubmit} className="mt-10 max-w-2xl rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-2">
            <label className="mb-2 block px-2 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-subtle)]">
              {copy.inputLabel}
            </label>
            <div className="flex flex-col gap-2 md:flex-row">
              <div className="flex min-h-12 flex-grow items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] px-4">
                <MaterialIcon name="link" className="text-[var(--sc-subtle)]" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
                  className="h-12 w-full border-none bg-transparent text-base text-[var(--sc-strong)] outline-none placeholder:text-[var(--sc-subtle)] focus:ring-0"
              placeholder="https://example.com"
              type="text"
            />
              </div>
              <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-6 py-3 font-semibold text-[var(--sc-on-accent)] transition-all hover:opacity-90 active:scale-[0.98]">
            {t('home_hero_cta')}
            <MaterialIcon name="rocket_launch" />
          </button>
            </div>
        </form>

          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

          <div className="mt-8 grid gap-3 text-sm text-[#bdbdbd] sm:grid-cols-3">
            {[copy.stat1, copy.stat2, copy.stat3].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <MaterialIcon name="check_circle" className="mt-0.5 text-[18px] text-[var(--sc-accent)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-console)] p-4 text-[#f2f2f2]">
          <div className="mb-4 flex items-center justify-between border-b border-[#3d3a39] pb-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#ffbd2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </div>
            <span className="font-mono text-xs text-[#8b949e]">{copy.consoleTitle}</span>
          </div>
          <div className="space-y-3 font-mono text-sm leading-6">
            {copy.consoleLines.map((line, index) => (
              <div key={line} className="flex gap-3">
                <span className="text-[#8b949e]">{String(index + 1).padStart(2, '0')}</span>
                <span className={index === copy.consoleLines.length - 1 ? 'text-[#00d992]' : 'text-[#f5f6f7]'}>
                  {line}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[#3d3a39] p-3">
              <p className="text-xs uppercase tracking-[2.52px] text-[#8b949e]">{copy.staticLimit}</p>
              <p className="mt-2 font-mono text-sm text-white">{copy.staticValue}</p>
            </div>
            <div className="rounded-md border border-[#3d3a39] p-3">
              <p className="text-xs uppercase tracking-[2.52px] text-[#8b949e]">{copy.jsFallback}</p>
              <p className="mt-2 font-mono text-sm text-white">{copy.jsValue}</p>
            </div>
            <div className="rounded-md border border-[#00d992] p-3">
              <p className="text-xs uppercase tracking-[2.52px] text-[#8b949e]">{copy.delivery}</p>
              <p className="mt-2 font-mono text-sm text-[#00d992]">{copy.deliveryValue}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
