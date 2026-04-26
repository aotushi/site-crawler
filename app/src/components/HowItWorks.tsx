import { useLang, type MessageKey } from '../lib/i18n'

const steps: { icon: string; titleKey: MessageKey; descKey: MessageKey }[] = [
  { icon: '🔗', titleKey: 'how_step1_title', descKey: 'how_step1_desc' },
  { icon: '⚙️', titleKey: 'how_step2_title', descKey: 'how_step2_desc' },
  { icon: '📦', titleKey: 'how_step3_title', descKey: 'how_step3_desc' },
]

export function HowItWorks() {
  const { t } = useLang()
  return (
    <section className="py-16 px-4 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-center text-gray-900 mb-12">{t('how_title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {steps.map((s, i) => (
          <div key={i} className="text-center">
            <div className="text-4xl mb-4">{s.icon}</div>
            <h3 className="font-semibold text-gray-800 mb-2">{t(s.titleKey)}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{t(s.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
