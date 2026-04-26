export function HomeFooter() {
  return (
    <footer className="w-full border-t bg-slate-50 border-slate-200">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 py-16 px-6 text-sm text-slate-500">
        <div>
          <div className="text-lg font-bold text-slate-900 mb-4">SiteCrawler</div>
          <p className="mb-6 opacity-80">The premier tool for professional web archiving and site preservation.</p>
        </div>
        <div>
          <h4 className="font-semibold text-on-background mb-4">Product</h4>
          <ul className="space-y-3">
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">Features</a></li>
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">Pricing</a></li>
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">Sitemap</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-on-background mb-4">Connect</h4>
          <ul className="space-y-3">
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">Twitter</a></li>
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">GitHub</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-on-background mb-4">Legal</h4>
          <ul className="space-y-3">
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">Privacy</a></li>
            <li><a className="hover:text-primary hover:underline underline-offset-4 transition-all" href="#">Terms</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto px-6 py-8 border-t border-slate-200 text-center md:text-left text-slate-500 text-xs">
        © 2024 SiteCrawler. All rights reserved. Powered by Cloudflare.
      </div>
    </footer>
  )
}
