import { useNavigate } from '@tanstack/react-router'
import { useLang } from '../lib/i18n'

export function CTABanner() {
  const { t } = useLang()
  const navigate = useNavigate()
  return (
    <section className="bg-blue-600 py-16 px-4 text-center">
      <h2 className="text-2xl font-bold text-white mb-4">{t('cta_title')}</h2>
      <p className="text-blue-100 mb-8 max-w-md mx-auto">{t('cta_desc')}</p>
      <button
        onClick={() => navigate({ to: '/crawl' })}
        className="bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition-colors"
      >
        {t('hero_cta')}
      </button>
    </section>
  )
}
