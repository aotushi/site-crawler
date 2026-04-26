import { MaterialIcon } from './MaterialIcon'

export function HomeHeader() {
  return (
    <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm font-inter antialiased text-slate-900">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-2">
          <MaterialIcon name="cloud_download" className="text-primary" />
          <span className="text-xl font-bold tracking-tight text-slate-900">SiteCrawler</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a className="text-primary font-semibold border-b-2 border-primary pb-1" href="#">Home</a>
          <a className="text-slate-600 hover:text-primary transition-colors" href="#">Features</a>
          <a className="text-slate-600 hover:text-primary transition-colors" href="#">Pricing</a>
        </div>
        <button className="bg-primary text-on-primary px-5 py-2 rounded-lg font-semibold text-sm transition-all duration-200 ease-in-out active:scale-[0.98] hover:opacity-90">
          Start Free
        </button>
      </div>
    </header>
  )
}
