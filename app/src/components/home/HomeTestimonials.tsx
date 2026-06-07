import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeTestimonials() {
  const { lang, t } = useLang()
  const intro = {
    zh: {
      eyebrow: 'OPERATOR NOTES',
      title: '面向真实操作人员的价值',
      subtitle: '把“能下载”扩展为“能解释、能复核、能交付”。',
    },
    en: {
      eyebrow: 'OPERATOR NOTES',
      title: 'Value for people running the archive',
      subtitle: 'Move from "it downloads" to "it explains, verifies, and delivers".',
    },
  }[lang]

  return (
    <section className="border-t border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{intro.eyebrow}</p>
          <h2 className="text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{intro.title}</h2>
          <p className="mt-4 text-base leading-7 text-[var(--sc-muted)]">{intro.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="relative rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-6">
            <MaterialIcon name="format_quote" className="absolute right-6 top-6 text-6xl text-[var(--sc-soft)]" />
            <p className="relative z-10 mb-8 text-lg leading-8 text-[var(--sc-text)]">"{t('home_testimonial1_quote')}"</p>
            <div className="flex items-center gap-4">
              <img
                src="/stitch-testimonial-1.webp"
                alt={t('home_testimonial1_name')}
                className="size-12 rounded-full border border-[var(--sc-border)] object-cover"
              />
              <div>
                <p className="font-semibold text-[var(--sc-strong)]">{t('home_testimonial1_name')}</p>
                <p className="text-xs text-[var(--sc-subtle)]">{t('home_testimonial1_role')}</p>
              </div>
            </div>
          </div>
          <div className="relative rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-6">
            <MaterialIcon name="format_quote" className="absolute right-6 top-6 text-6xl text-[var(--sc-soft)]" />
            <p className="relative z-10 mb-8 text-lg leading-8 text-[var(--sc-text)]">"{t('home_testimonial2_quote')}"</p>
            <div className="flex items-center gap-4">
              <img
                src="/stitch-testimonial-2.webp"
                alt={t('home_testimonial2_name')}
                className="size-12 rounded-full border border-[var(--sc-border)] object-cover"
              />
              <div>
                <p className="font-semibold text-[var(--sc-strong)]">{t('home_testimonial2_name')}</p>
                <p className="text-xs text-[var(--sc-subtle)]">{t('home_testimonial2_role')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
