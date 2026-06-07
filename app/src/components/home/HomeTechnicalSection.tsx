import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeTechnicalSection() {
  const { lang } = useLang()
  const copy = {
    zh: {
      eyebrow: 'ARCHITECTURE',
      title: '两条抓取链路,一个统一交付口',
      subtitle: '普通站点走 Worker SSE 流式反馈; 复杂 SPA 触发 Playwright Actions,完成后由 Worker 取回 Artifact 并交付。',
      pipeline: [
        ['01', 'URL Intake', '校验协议、规范化目标 URL、生成任务上下文。'],
        ['02', 'Edge Crawl', 'Worker 拉取页面和资源,实时向浏览器推送进度。'],
        ['03', 'Render Escalation', '检测 JS 依赖时切换 Playwright 完整渲染任务。'],
        ['04', 'Package', '重写路径、压缩 ZIP、写入历史与下载入口。'],
      ],
      matrixTitle: '能力边界',
      matrix: [
        ['HTML/CSS/JS', '直接抓取'],
        ['图片/字体/SVG', '资源保留'],
        ['SPA 动态内容', 'Playwright 兜底'],
        ['历史下载', '登录后可用'],
      ],
    },
    en: {
      eyebrow: 'ARCHITECTURE',
      title: 'Two crawl lanes, one delivery surface',
      subtitle: 'Standard sites use Worker SSE streaming. Complex SPAs trigger Playwright Actions, then Worker retrieves the artifact and delivers it.',
      pipeline: [
        ['01', 'URL Intake', 'Validate protocol, normalize target URL, and create job context.'],
        ['02', 'Edge Crawl', 'Worker fetches pages and assets while streaming progress to the browser.'],
        ['03', 'Render Escalation', 'Detected JS dependencies move the job to a full Playwright render.'],
        ['04', 'Package', 'Rewrite paths, zip output, record history, and expose download.'],
      ],
      matrixTitle: 'Capability boundary',
      matrix: [
        ['HTML/CSS/JS', 'Direct crawl'],
        ['Images/fonts/SVG', 'Asset retention'],
        ['SPA dynamic content', 'Playwright fallback'],
        ['Download history', 'Signed-in users'],
      ],
    },
  }[lang]

  return (
    <section className="border-t border-[var(--sc-border-strong)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
          <h2 className="text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{copy.title}</h2>
          <p className="mt-4 text-base leading-7 text-[var(--sc-muted)]">{copy.subtitle}</p>

          <div className="mt-8 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)]">
            <div className="border-b border-[var(--sc-border)] px-5 py-4 font-mono text-xs uppercase tracking-[2.52px] text-[var(--sc-subtle)]">
              {copy.matrixTitle}
            </div>
            <div className="divide-y divide-[var(--sc-border)]">
              {copy.matrix.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 text-sm">
                  <span className="text-[var(--sc-muted)]">{label}</span>
                  <span className="font-mono text-[var(--sc-accent)]">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          {copy.pipeline.map(([step, title, desc]) => (
            <article key={step} className="grid gap-4 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5 sm:grid-cols-[72px_1fr]">
              <div className="flex h-12 w-16 items-center justify-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] font-mono text-sm text-[var(--sc-accent)]">
                {step}
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <MaterialIcon name="chevron_right" className="text-[var(--sc-accent)]" />
                  <h3 className="font-semibold text-[var(--sc-strong)]">{title}</h3>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
