import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeUseCases() {
  const { lang } = useLang()
  const copy = {
    zh: {
      eyebrow: 'USE CASES',
      title: '从临时抢救到长期归档,覆盖网站快照的主要场景',
      subtitle: '每个场景都需要不同的抓取策略,首页直接说明适用边界和交付结果。',
      cases: [
        {
          icon: 'deployed_code',
          title: '站点迁移前备份',
          desc: '改版、换 CMS、换域名前先冻结线上版本,后续可逐页比对内容缺口。',
          meta: '迁移 / 回滚',
        },
        {
          icon: 'policy',
          title: '营销与合规留存',
          desc: '保存落地页、活动页、季度信息披露页面,保留当时可访问的静态证据。',
          meta: '审计 / 法务',
        },
        {
          icon: 'sports_esports',
          title: '游戏门户镜像',
          desc: '抓取图标、JSON、资源目录和入口页,用于离线测试或历史版本归档。',
          meta: '资源密集',
        },
      ],
    },
    en: {
      eyebrow: 'USE CASES',
      title: 'From emergency capture to long-term archive, cover the main snapshot jobs',
      subtitle: 'Each scenario needs a different crawl strategy, so the page now states boundaries and deliverables clearly.',
      cases: [
        {
          icon: 'deployed_code',
          title: 'Pre-migration backup',
          desc: 'Freeze the production version before a redesign, CMS move, or domain change, then compare gaps page by page.',
          meta: 'Migration / rollback',
        },
        {
          icon: 'policy',
          title: 'Marketing and compliance retention',
          desc: 'Preserve landing pages, campaign pages, and disclosure pages as static evidence from that point in time.',
          meta: 'Audit / legal',
        },
        {
          icon: 'sports_esports',
          title: 'Game portal mirroring',
          desc: 'Capture icons, JSON, asset directories, and entry pages for offline testing or version history.',
          meta: 'Asset-heavy',
        },
      ],
    },
  }[lang]

  return (
    <section className="border-t border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
            <h2 className="text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{copy.title}</h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-[var(--sc-muted)] lg:justify-self-end">{copy.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="group relative min-h-[420px] overflow-hidden rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] lg:col-span-7">
            <img
              src="/stitch-usecase-game.webp"
              alt="Game Portal"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover opacity-45 transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,16,16,0.1),rgba(16,16,16,0.94))]" />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
              <span className="mb-4 inline-flex rounded-full border border-[var(--sc-accent)] px-3 py-1 text-xs font-semibold text-[var(--sc-accent)]">
                {copy.cases[2].meta}
              </span>
              <h3 className="mb-3 text-2xl font-semibold text-white">{copy.cases[2].title}</h3>
                <p className="max-w-xl text-sm leading-6 text-[#d7ddd3]">{copy.cases[2].desc}</p>
            </div>
          </div>
          <div className="grid gap-4 lg:col-span-5">
            {copy.cases.slice(0, 2).map((item) => (
              <article key={item.title} className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex size-11 items-center justify-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] text-[var(--sc-accent)]">
                    <MaterialIcon name={item.icon} />
                  </div>
                  <span className="rounded-full border border-[var(--sc-border)] px-3 py-1 text-xs text-[var(--sc-subtle)]">{item.meta}</span>
                </div>
                <h3 className="mb-3 text-xl font-semibold text-[var(--sc-strong)]">{item.title}</h3>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
