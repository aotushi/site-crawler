import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

interface CaseItem {
  nameKey: 'home_cases_case1_name' | 'home_cases_case2_name'
  tagKey: 'home_cases_case1_tag' | 'home_cases_case2_tag'
  descKey: 'home_cases_case1_desc' | 'home_cases_case2_desc'
  linkUrl: string
  screenshot: string
  displayHost: string
}

const cases: CaseItem[] = [
  {
    nameKey: 'home_cases_case1_name',
    tagKey: 'home_cases_case1_tag',
    descKey: 'home_cases_case1_desc',
    linkUrl: 'https://dripulse.9shi.cc',
    screenshot: '/case-dripulse.webp',
    displayHost: 'www.dripulse.com',
  },
  {
    nameKey: 'home_cases_case2_name',
    tagKey: 'home_cases_case2_tag',
    descKey: 'home_cases_case2_desc',
    linkUrl: 'https://okspin.9shi.cc',
    screenshot: '/case-okspin.webp',
    displayHost: 'okspin.tech',
  },
]

function BrowserCard({ item }: { item: CaseItem }) {
  const { t } = useLang()

  return (
    <a
      href={item.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] transition-colors duration-300 hover:border-[var(--sc-accent)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--sc-border)] bg-[var(--sc-soft)] px-4 py-3">
        <div className="flex gap-1.5 shrink-0">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#ffbd2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--sc-border)] bg-[var(--sc-card)] px-3 py-1">
          <MaterialIcon name="lock" className="shrink-0 text-[14px] text-[var(--sc-subtle)]" />
          <span className="truncate font-mono text-xs text-[var(--sc-muted)]">{item.displayHost}</span>
        </div>
      </div>

      <div className="relative w-full overflow-hidden" style={{ height: '220px' }}>
        <img
          src={item.screenshot}
          alt={t(item.nameKey)}
          className="w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-[#00d992]/0 transition-colors duration-300 group-hover:bg-[#00d992]/10">
          <span className="flex items-center gap-1.5 rounded-md bg-[var(--sc-accent)] px-4 py-2 text-sm font-semibold text-[var(--sc-on-accent)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <MaterialIcon name="open_in_new" className="text-[16px]" />
            {t('home_cases_visit')}
          </span>
        </div>
      </div>

      <div className="border-t border-[var(--sc-border)] px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[var(--sc-strong)]">{t(item.nameKey)}</span>
          <span className="flex items-center gap-1 text-xs font-medium text-[var(--sc-accent)]">
            <MaterialIcon name="check_circle" className="text-[14px]" />
            {t('home_cases_archived')}
          </span>
        </div>
        <span className="mb-3 inline-block rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] px-2 py-0.5 font-mono text-[11px] text-[var(--sc-muted)]">
          {t(item.tagKey)}
        </span>
        <p className="text-xs leading-relaxed text-[var(--sc-muted)]">{t(item.descKey)}</p>
      </div>
    </a>
  )
}

export function HomeCaseStudies() {
  const { lang, t } = useLang()
  const intro = {
    zh: '真实样例比抽象功能更有说服力: 这里展示已经完成备份并可打开验证的站点。',
    en: 'Real samples are stronger than abstract feature claims: these archived sites can be opened and checked.',
  }[lang]

  return (
    <section className="border-t border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">VERIFIED OUTPUTS</p>
          <h2 className="mb-4 text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{t('home_cases_title')}</h2>
          <p className="text-base leading-7 text-[var(--sc-muted)]">{intro} {t('home_cases_subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cases.map((item) => (
            <BrowserCard key={item.linkUrl} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}
