import { MaterialIcon } from './MaterialIcon'

export function HomeTestimonials() {
  return (
    <section className="py-24 px-6 bg-surface">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-xl border border-outline-variant shadow-sm relative">
            <MaterialIcon name="format_quote" className="text-surface-container-high absolute top-6 right-6 text-6xl" />
            <p className="text-lg italic text-on-surface mb-8 relative z-10">
              "SiteCrawler saved us weeks of work. We needed to migrate 50+ legacy static sites and it handled the folder structures perfectly."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-200" />
              <div>
                <h4 className="font-semibold text-on-background">Alex Rivera</h4>
                <p className="text-xs text-secondary">DevOps Engineer @ TechStream</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-xl border border-outline-variant shadow-sm relative">
            <MaterialIcon name="format_quote" className="text-surface-container-high absolute top-6 right-6 text-6xl" />
            <p className="text-lg italic text-on-surface mb-8 relative z-10">
              "The best tool for archiving dynamic portfolios. It just works, every single time. ZIP format is clean and ready for deployment."
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-slate-200" />
              <div>
                <h4 className="font-semibold text-on-background">Sarah Chen</h4>
                <p className="text-xs text-secondary">Creative Director @ PixlWorks</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
