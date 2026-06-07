import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomePricing() {
  const { lang, t } = useLang()
  const copy = {
    zh: {
      eyebrow: 'LIMITS',
      title: '免费可用,限制讲清楚',
      subtitle: '首页直接交代当前 V1 的使用边界,减少用户开始任务后的预期落差。',
      quota: '未登录: 静态 3 次/天, JS 完整爬取 1 次/天',
      featured: 'V1 当前能力',
      extra: ['SSE 实时进度', '自动 ZIP 下载', '登录后历史记录', 'Cloudflare R2 结果存储'],
    },
    en: {
      eyebrow: 'LIMITS',
      title: 'Free to use, with clear boundaries',
      subtitle: 'The page now states V1 limits up front, reducing surprise after users start a job.',
      quota: 'Anonymous: 3 static crawls/day, 1 full JS crawl/day',
      featured: 'Current V1 capability',
      extra: ['SSE progress stream', 'Automatic ZIP download', 'History after login', 'Cloudflare R2 result storage'],
    },
  }[lang]

  return (
    <section id="pricing" className="border-t border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto mb-12 max-w-[1200px]">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
        <h2 className="text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{copy.title}</h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--sc-muted)]">{copy.subtitle}</p>
      </div>
      <div className="mx-auto max-w-[1200px]">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-[var(--sc-accent)] bg-[var(--sc-card)] p-6">
            <span className="mb-6 inline-flex rounded-full border border-[var(--sc-accent)] px-3 py-1 text-xs font-semibold text-[var(--sc-accent)]">
              {copy.featured}
            </span>
            <h3 className="mb-3 text-2xl font-semibold text-[var(--sc-strong)]">{t('home_pricing_plan_name')}</h3>
            <p className="mb-8 text-sm leading-6 text-[var(--sc-muted)]">{t('home_pricing_plan_desc')}</p>
            <div className="mb-8 font-mono text-6xl text-[var(--sc-strong)]">$0</div>
            <a href="#hero" className="inline-flex min-h-12 items-center justify-center rounded-md bg-[var(--sc-accent)] px-6 py-3 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90">
              {t('home_pricing_cta')}
            </a>
          </div>

          <div className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)]">
            <div className="border-b border-[var(--sc-border)] px-6 py-5">
              <p className="font-mono text-sm text-[var(--sc-accent)]">{copy.quota}</p>
            </div>
            <ul className="grid gap-px bg-[var(--sc-border)] sm:grid-cols-2">
              {[t('home_pricing_feat1'), t('home_pricing_feat2'), t('home_pricing_feat3'), ...copy.extra].map((item) => (
                <li key={item} className="flex items-center gap-3 bg-[var(--sc-card)] px-6 py-5 text-sm text-[var(--sc-muted)]">
                  <MaterialIcon name="check" className="text-[18px] text-[var(--sc-accent)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
