import { useLang } from '../lib/i18n'

export function Footer() {
  const { t } = useLang()
  return (
    <footer className="border-t border-[var(--sc-border)] bg-[var(--sc-bg)] py-6 text-center text-sm text-[var(--sc-muted)]">
      {t('footer_desc')}
    </footer>
  )
}
