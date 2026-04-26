import { MaterialIcon } from './MaterialIcon'

export function HomeFaq() {
  return (
    <section className="py-24 px-6 bg-surface-container-low">
      <div className="max-w-[800px] mx-auto">
        <h2 className="text-3xl font-bold text-on-background mb-12 text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          <details className="group bg-white rounded-xl border border-outline-variant overflow-hidden" open>
            <summary className="p-6 flex items-center justify-between cursor-pointer font-semibold text-on-background list-none">
              Is it really free?
              <MaterialIcon name="expand_more" className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-6 pb-6 text-secondary">
              Yes, SiteCrawler offers a free tier that allows up to 3 crawls per day with a 50-page limit. No credit card is required to start using the free plan.
            </div>
          </details>
          <details className="group bg-white rounded-xl border border-outline-variant overflow-hidden">
            <summary className="p-6 flex items-center justify-between cursor-pointer font-semibold text-on-background list-none">
              How fast is the crawling process?
              <MaterialIcon name="expand_more" className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-6 pb-6 text-secondary">
              Most sites are packaged in under 30 seconds. We use Cloudflare workers to run crawling tasks in parallel, meaning multiple assets are fetched simultaneously for maximum speed.
            </div>
          </details>
          <details className="group bg-white rounded-xl border border-outline-variant overflow-hidden">
            <summary className="p-6 flex items-center justify-between cursor-pointer font-semibold text-on-background list-none">
              What files are actually downloaded?
              <MaterialIcon name="expand_more" className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="px-6 pb-6 text-secondary">
              We extract HTML files, CSS stylesheets, JavaScript files, images (JPG, PNG, WEBP, SVG), and fonts. We also rewrite the links so the site works perfectly offline.
            </div>
          </details>
        </div>
      </div>
    </section>
  )
}
