import { MaterialIcon } from './MaterialIcon'

export function HomePricing() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-[1200px] mx-auto text-center mb-16">
        <h2 className="text-3xl font-bold text-on-background mb-4">Transparent Pricing</h2>
        <p className="text-secondary">Scale your archiving needs as you grow.</p>
      </div>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="bg-white border border-outline-variant p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 hover:border-primary transition-colors">
          <div className="text-left">
            <h3 className="text-xl font-semibold mb-2">Free</h3>
            <p className="text-secondary max-w-xs">For occasional snapshots and personal experiments.</p>
          </div>
          <ul className="space-y-2 text-left md:w-1/3">
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-green-500 text-[18px]" /> 3 Crawls / Day</li>
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-green-500 text-[18px]" /> Max 50 Pages/Site</li>
          </ul>
          <div className="text-center md:text-right">
            <div className="text-5xl font-extrabold mb-4">$0</div>
            <button className="bg-surface-container text-primary px-8 py-3 rounded-lg font-semibold w-full md:w-auto">Current Plan</button>
          </div>
        </div>
        <div className="bg-primary text-on-primary p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-white/20 px-3 py-1 rounded-full text-xs font-semibold">MOST POPULAR</div>
          <div className="text-left">
            <h3 className="text-xl font-semibold mb-2">Pro</h3>
            <p className="opacity-90 max-w-xs">Perfect for professional developers and archivists.</p>
          </div>
          <ul className="space-y-2 text-left md:w-1/3">
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-on-primary-container text-[18px]" /> Unlimited Crawls</li>
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-on-primary-container text-[18px]" /> 5000 Pages/Site</li>
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-on-primary-container text-[18px]" /> Priority Edge Workers</li>
          </ul>
          <div className="text-center md:text-right">
            <div className="text-5xl font-extrabold mb-4">$9<span className="text-lg opacity-70">/mo</span></div>
            <button className="bg-white text-primary px-8 py-3 rounded-lg font-semibold w-full md:w-auto hover:bg-surface-bright">Upgrade Now</button>
          </div>
        </div>
        <div className="bg-white border border-outline-variant p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 hover:border-primary transition-colors">
          <div className="text-left">
            <h3 className="text-xl font-semibold mb-2">Business</h3>
            <p className="text-secondary max-w-xs">High-capacity solutions for legal and compliance archiving.</p>
          </div>
          <ul className="space-y-2 text-left md:w-1/3">
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-green-500 text-[18px]" /> Bulk Domain Crawling</li>
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-green-500 text-[18px]" /> Custom API Access</li>
            <li className="flex items-center gap-2"><MaterialIcon name="check" className="text-green-500 text-[18px]" /> Dedicated Support</li>
          </ul>
          <div className="text-center md:text-right">
            <div className="text-5xl font-extrabold mb-4">$49<span className="text-lg opacity-70">/mo</span></div>
            <button className="bg-surface-container text-primary px-8 py-3 rounded-lg font-semibold w-full md:w-auto">Contact Sales</button>
          </div>
        </div>
      </div>
    </section>
  )
}
