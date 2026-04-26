import { useLang, type MessageKey } from '../lib/i18n'

const features: { icon: string; titleKey: MessageKey; descKey: MessageKey }[] = [
  { icon: '⚡', titleKey: 'feat1_title', descKey: 'feat1_desc' },
  { icon: '📁', titleKey: 'feat2_title', descKey: 'feat2_desc' },
  { icon: '☁️', titleKey: 'feat3_title', descKey: 'feat3_desc' },
]

export function Features() {
  const { t } = useLang()
  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {features.map((f, i) => (
          <div key={i} className="text-center p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-4">{f.icon}</div>
            <h3 className="font-semibold text-gray-800 mb-2">{t(f.titleKey)}</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{t(f.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
