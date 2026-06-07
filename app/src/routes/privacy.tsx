import { createFileRoute } from '@tanstack/react-router'
import { useLang } from '../lib/i18n'

function PrivacyPage() {
  const { lang } = useLang()
  const isZh = lang === 'zh'

  return (
    <div className="max-w-[800px] mx-auto px-6 py-16 text-slate-700">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        {isZh ? '隐私政策' : 'Privacy Policy'}
      </h1>
      <p className="text-sm text-slate-400 mb-10">
        {isZh ? '最后更新：2026 年 4 月' : 'Last updated: April 2026'}
      </p>

      {isZh ? (
        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">1. 我们收集的信息</h2>
            <p>当您使用 SiteCrawler 时，我们可能收集以下信息：</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>账号信息：注册时提供的邮箱地址。</li>
              <li>使用数据：您提交的爬取 URL 及爬取结果（仅用于提供服务）。</li>
              <li>日志数据：IP 地址、浏览器类型、访问时间等标准服务器日志。</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">2. 信息使用方式</h2>
            <p>我们使用收集的信息用于：提供和改进服务、防止滥用、以及在必要时与您联系。我们不会将您的个人信息出售给第三方。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">3. 数据存储</h2>
            <p>您的数据存储在 Cloudflare 基础设施上。爬取结果仅临时保存，用于生成下载文件，之后会被自动清除。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Cookie</h2>
            <p>我们仅使用必要的 Cookie 来维持登录状态。我们不使用追踪 Cookie 或第三方广告 Cookie。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">5. 联系我们</h2>
            <p>如有隐私相关问题，请通过 GitHub 联系我们。</p>
          </section>
        </div>
      ) : (
        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Information We Collect</h2>
            <p>When you use SiteCrawler, we may collect:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Account information: your email address provided at registration.</li>
              <li>Usage data: URLs you submit for crawling and crawl results (used solely to provide the service).</li>
              <li>Log data: IP address, browser type, access time, and other standard server logs.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">2. How We Use Information</h2>
            <p>We use collected information to provide and improve the service, prevent abuse, and contact you when necessary. We do not sell your personal information to third parties.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">3. Data Storage</h2>
            <p>Your data is stored on Cloudflare infrastructure. Crawl results are stored temporarily to generate download files and are automatically purged afterward.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Cookies</h2>
            <p>We only use essential cookies to maintain login sessions. We do not use tracking cookies or third-party advertising cookies.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Contact Us</h2>
            <p>For privacy-related questions, please reach out via GitHub.</p>
          </section>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/privacy')({ component: PrivacyPage })
