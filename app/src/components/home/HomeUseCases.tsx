import { MaterialIcon } from './MaterialIcon'

export function HomeUseCases() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-on-background mb-4">Common Use Cases</h2>
          <p className="text-secondary max-w-2xl mx-auto">From developers to archivists, SiteCrawler is the standard for web preservation.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-auto md:h-[400px]">
          <div className="md:col-span-8 bg-inverse-surface rounded-2xl overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-8">
              <h3 className="text-white text-xl font-semibold mb-2">Game Portal Backups</h3>
              <p className="text-slate-300 max-w-md">Snapshot entire browser-based game portals for offline testing and historical preservation.</p>
            </div>
          </div>
          <div className="md:col-span-4 bg-primary rounded-2xl p-8 flex flex-col justify-between">
            <div className="text-on-primary-container">
              <MaterialIcon name="corporate_fare" className="text-4xl mb-6 block" />
              <h3 className="text-xl font-semibold mb-2">Corporate Archiving</h3>
              <p className="opacity-90">Maintain legal compliance by archiving quarterly reports and landing pages.</p>
            </div>
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full border-2 border-primary bg-slate-200" />
              <div className="w-8 h-8 rounded-full border-2 border-primary bg-slate-300" />
              <div className="w-8 h-8 rounded-full border-2 border-primary bg-white flex items-center justify-center text-[10px] font-bold text-primary">+12</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
