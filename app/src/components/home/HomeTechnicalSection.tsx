import { MaterialIcon } from './MaterialIcon'

export function HomeTechnicalSection() {
  return (
    <section className="py-24 px-6 bg-surface-container-low">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <h2 className="text-3xl font-bold text-on-background">Engineered for Technical Precision</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <MaterialIcon name="hub" className="text-primary shrink-0" />
              <div>
                <h4 className="font-semibold text-on-background mb-1">Cloudflare Edge Computing</h4>
                <p className="text-secondary">Low-latency crawling triggered from the nearest edge node to the target server.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <MaterialIcon name="folder_zip" className="text-primary shrink-0" />
              <div>
                <h4 className="font-semibold text-on-background mb-1">Retains Folder Structure</h4>
                <p className="text-secondary">Intelligent path rewriting ensures the site works immediately when opened from your local disk.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <MaterialIcon name="javascript" className="text-primary shrink-0" />
              <div>
                <h4 className="font-semibold text-on-background mb-1">Browser-Based Rendering</h4>
                <p className="text-secondary">Fully renders SPAs and dynamic JavaScript content before extraction for maximum fidelity.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-xl border border-outline-variant">
          <div className="bg-slate-900 rounded-lg p-6 font-mono text-sm text-green-400 overflow-hidden">
            <div className="flex gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <p className="mb-2"><span className="text-blue-400">$</span> crawler start --url https://target.com</p>
            <p className="text-slate-400 mb-1">[INFO] Initializing edge worker...</p>
            <p className="text-slate-400 mb-1">[INFO] Crawling 142 assets...</p>
            <div className="w-full bg-slate-800 h-1 mt-4 mb-4">
              <div className="bg-primary h-full w-[65%]" />
            </div>
            <p className="text-slate-400 mb-1">[65%] Downloading: /assets/hero-v2.jpg</p>
            <p className="text-slate-400 mb-1">[65%] Downloading: /js/main.min.js</p>
          </div>
        </div>
      </div>
    </section>
  )
}
