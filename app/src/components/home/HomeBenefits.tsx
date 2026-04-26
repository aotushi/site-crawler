import { MaterialIcon } from './MaterialIcon'

export function HomeBenefits() {
  return (
    <section className="py-24 px-6 bg-surface">
      <div className="max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-surface-container-lowest p-8 border border-outline-variant rounded-xl hover:shadow-lg transition-all group cursor-default">
            <div className="w-12 h-12 bg-surface-container-high rounded-lg flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
              <MaterialIcon name="bolt" />
            </div>
            <h3 className="text-xl font-semibold mb-4 text-on-background">Ultra-Fast Crawling</h3>
            <p className="text-secondary">Parallel asset processing powered by Cloudflare's global edge network for instant results.</p>
          </div>
          <div className="bg-surface-container-lowest p-8 border border-outline-variant rounded-xl hover:shadow-lg transition-all group cursor-default">
            <div className="w-12 h-12 bg-surface-container-high rounded-lg flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
              <MaterialIcon name="inventory_2" />
            </div>
            <h3 className="text-xl font-semibold mb-4 text-on-background">Complete Packaging</h3>
            <p className="text-secondary">Every script, stylesheet, and media file preserved with perfect relative path mapping.</p>
          </div>
          <div className="bg-surface-container-lowest p-8 border border-outline-variant rounded-xl hover:shadow-lg transition-all group cursor-default">
            <div className="w-12 h-12 bg-surface-container-high rounded-lg flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
              <MaterialIcon name="cloud_off" />
            </div>
            <h3 className="text-xl font-semibold mb-4 text-on-background">Zero Installation</h3>
            <p className="text-secondary">Run everything in your browser. No Python scripts, no CLI, no dependencies required.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
