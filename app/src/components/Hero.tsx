import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLang } from '../lib/i18n'

export function Hero() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
      setError('')
      navigate({ to: '/crawl', search: { url } })
    } catch {
      setError(t('error_invalid_url'))
    }
  }

  return (
    <section className="bg-gradient-to-b from-blue-50 to-white py-20 px-4 text-center">
      <h1 className="text-4xl font-bold text-gray-900 mb-4 max-w-2xl mx-auto">{t('hero_title')}</h1>
      <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto">{t('hero_subtitle')}</p>
      <form onSubmit={handleSubmit} className="max-w-xl mx-auto flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('hero_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button type="submit" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
            {t('hero_cta')}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm text-left">{error}</p>}
      </form>
    </section>
  )
}
