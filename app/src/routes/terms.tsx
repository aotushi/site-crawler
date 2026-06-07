import { createFileRoute } from '@tanstack/react-router'
import { useLang } from '../lib/i18n'

function TermsPage() {
  const { lang } = useLang()
  const isZh = lang === 'zh'

  return (
    <div className="max-w-[800px] mx-auto px-6 py-16 text-slate-700">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">
        {isZh ? '服务条款' : 'Terms of Service'}
      </h1>
      <p className="text-sm text-slate-400 mb-10">
        {isZh ? '最后更新：2026 年 4 月' : 'Last updated: April 2026'}
      </p>

      {isZh ? (
        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">1. 服务说明</h2>
            <p>SiteCrawler 是一款网站静态资源爬取与打包工具，供个人和合法商业用途使用。使用本服务即表示您同意遵守本条款。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">2. 可接受使用</h2>
            <p>您同意仅将本服务用于合法目的。禁止以下行为：</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>爬取您无权访问的内容。</li>
              <li>绕过目标网站的访问控制或 robots.txt 限制。</li>
              <li>使用本服务进行大规模自动化攻击或滥用。</li>
              <li>侵犯他人版权或知识产权。</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">3. 免责声明</h2>
            <p>本服务按"现状"提供，不提供任何明示或暗示的保证。我们不对因使用本服务导致的任何损失承担责任。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">4. 服务变更</h2>
            <p>我们保留随时修改或终止服务的权利，恕不另行通知。</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">5. 联系我们</h2>
            <p>如有条款相关问题，请通过 GitHub 联系我们。</p>
          </section>
        </div>
      ) : (
        <div className="space-y-8 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">1. Service Description</h2>
            <p>SiteCrawler is a static website crawling and packaging tool for personal and lawful commercial use. By using this service, you agree to these terms.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">2. Acceptable Use</h2>
            <p>You agree to use this service only for lawful purposes. The following are prohibited:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Crawling content you are not authorized to access.</li>
              <li>Bypassing access controls or robots.txt restrictions on target sites.</li>
              <li>Using the service for large-scale automated attacks or abuse.</li>
              <li>Infringing on others' copyrights or intellectual property.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">3. Disclaimer</h2>
            <p>This service is provided "as is" without any express or implied warranties. We are not liable for any losses resulting from use of this service.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">4. Service Changes</h2>
            <p>We reserve the right to modify or discontinue the service at any time without notice.</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold text-slate-800 mb-3">5. Contact Us</h2>
            <p>For questions about these terms, please reach out via GitHub.</p>
          </section>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/terms')({ component: TermsPage })
