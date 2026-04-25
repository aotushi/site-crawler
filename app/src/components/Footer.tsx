import { useLang } from '../lib/i18n'

export function Footer() {
  const { t } = useLang()
  return (
    <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-500">
      {t('footer_desc')}
    </footer>
  )
}
