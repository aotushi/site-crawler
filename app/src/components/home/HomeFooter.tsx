import { Link } from '@tanstack/react-router'
import { useLang } from '../../lib/i18n'

export function HomeFooter() {
  const { t } = useLang()
  return (
    <footer className="w-full border-t border-[var(--sc-border)] bg-[var(--sc-bg)] text-[var(--sc-muted)]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 py-16 text-sm md:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold text-[var(--sc-strong)]">
            <span className="flex size-8 items-center justify-center rounded-md border border-[var(--sc-accent)] text-[var(--sc-accent)]">S</span>
            SiteCrawler
          </div>
          <p className="mb-6 leading-6">{t('home_footer_desc')}</p>
        </div>
        <div>
          <h3 className="mb-4 font-semibold text-[var(--sc-strong)]">{t('home_footer_product')}</h3>
          <ul className="space-y-3">
            <li><a className="transition-colors hover:text-[var(--sc-accent)]" href="#benefits">{t('home_footer_features')}</a></li>
            <li><a className="transition-colors hover:text-[var(--sc-accent)]" href="#pricing">{t('home_footer_pricing')}</a></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-4 font-semibold text-[var(--sc-strong)]">{t('home_footer_connect')}</h3>
          <ul className="space-y-3">
            <li><a className="transition-colors hover:text-[var(--sc-accent)]" href="" target="_blank" rel="noopener noreferrer">{t('home_footer_github')}</a></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-4 font-semibold text-[var(--sc-strong)]">{t('home_footer_legal')}</h3>
          <ul className="space-y-3">
            <li><Link className="transition-colors hover:text-[var(--sc-accent)]" to="/privacy">{t('home_footer_privacy')}</Link></li>
            <li><Link className="transition-colors hover:text-[var(--sc-accent)]" to="/terms">{t('home_footer_terms')}</Link></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] border-t border-[var(--sc-border)] px-6 py-8 text-center text-xs text-[var(--sc-subtle)] md:text-left">
        {t('home_footer_copyright')}
      </div>
    </footer>
  )
}
