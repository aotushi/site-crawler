import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeFaq() {
  const { lang, t } = useLang()
  const extra = {
    zh: [
      ['什么时候需要 JS 完整爬取?', '当首屏内容由浏览器执行 JavaScript 后才出现,或静态链路提示内容可能不完整时,应使用云端浏览器 (Browser Run) 完整爬取。'],
      ['ZIP 可以直接部署吗?', '大多数静态站点可以直接检查和部署,但如果原站依赖服务端接口、登录态或反爬策略,仍需要人工复核。'],
    ],
    en: [
      ['When should I use the full JS crawl?', 'Use the Browser Run full crawl when key content appears only after browser-side JavaScript runs, or when the static lane warns that output may be incomplete.'],
      ['Can the ZIP be deployed directly?', 'Most static sites can be reviewed and deployed directly, but sites depending on server APIs, auth state, or anti-bot behavior still need manual review.'],
    ],
  }[lang]
  const faqs = [
    [t('home_faq_q1'), t('home_faq_a1')],
    [t('home_faq_q2'), t('home_faq_a2')],
    [t('home_faq_q3'), t('home_faq_a3')],
    ...extra,
  ]

  return (
    <section className="border-t border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto max-w-[900px]">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">FAQ</p>
        <h2 className="mb-12 text-center text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{t('home_faq_title')}</h2>
        <div className="space-y-3">
          {faqs.map(([question, answer], index) => (
            <details key={question} className="group overflow-hidden rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)]" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold text-[var(--sc-strong)]">
                {question}
                <MaterialIcon name="expand_more" className="shrink-0 text-[var(--sc-accent)] transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-5 pb-5 text-sm leading-6 text-[var(--sc-muted)]">{answer}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
