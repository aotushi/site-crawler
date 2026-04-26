import { useLang, type MessageKey } from '../lib/i18n'

const cases: { titleKey: MessageKey; descKey: MessageKey; tag: string }[] = [
  { titleKey: 'case1_name', descKey: 'case1_desc', tag: 'hot5games' },
  { titleKey: 'case2_name', descKey: 'case2_desc', tag: 'corporate' },
]

export function CaseStudies() {
  const { t } = useLang()
  return (
    <section className="bg-gray-50 py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">{t('case_title')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cases.map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5 font-mono mb-3 inline-block">{c.tag}</span>
              <h3 className="font-semibold text-gray-800 mb-2">{t(c.titleKey)}</h3>
              <p className="text-gray-500 text-sm">{t(c.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
