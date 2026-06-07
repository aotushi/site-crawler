import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeBenefits() {
  const { lang } = useLang()
  const copy = {
    zh: {
      eyebrow: 'WHY IT MATTERS',
      title: '不只是下载页面,而是交付一个可复现的网站快照',
      subtitle: '首页内容围绕实际归档链路展开: 发现、抓取、重写、打包、审计、再次下载。',
      items: [
        ['bolt', '边缘并发抓取', 'Worker 在服务端并行拉取 HTML、CSS、JS、图片和字体,减少浏览器等待时间。'],
        ['account_tree', '链接关系保真', '解析页面内引用并重写相对路径,让 ZIP 解压后仍能本地打开和审查。'],
        ['javascript', 'JS 渲染兜底', '检测到动态渲染时,可切换 GitHub Actions + Playwright 完整抓取链路。'],
        ['database', '历史可追踪', '登录后保留每次任务状态、文件数量、体积和下载链接,方便复核。'],
        ['shield_lock', '配额与限流', '匿名和登录用户走不同配额,避免共享服务被单一来源拖垮。'],
        ['folder_zip', '交付物清晰', '最终输出 ZIP,适合迁移、备份、法务留存或离线验收。'],
      ],
    },
    en: {
      eyebrow: 'WHY IT MATTERS',
      title: 'Not a page downloader. A reproducible website snapshot.',
      subtitle: 'The homepage now explains the real archive lane: discover, crawl, rewrite, package, audit, and re-download.',
      items: [
        ['bolt', 'Edge parallel crawl', 'Workers fetch HTML, CSS, JS, images, and fonts server-side to reduce browser wait time.'],
        ['account_tree', 'Link fidelity', 'Page references are parsed and relative paths are rewritten so the ZIP opens locally.'],
        ['javascript', 'JS-render fallback', 'When dynamic rendering is detected, the job can escalate to GitHub Actions + Playwright.'],
        ['database', 'Traceable history', 'Signed-in users keep status, file counts, package size, and download links for review.'],
        ['shield_lock', 'Quota controls', 'Anonymous and signed-in users use separate limits to protect the shared service.'],
        ['folder_zip', 'Clean deliverable', 'The final ZIP fits migration, backup, legal retention, and offline acceptance workflows.'],
      ],
    },
  }[lang]

  return (
    <section id="benefits" className="border-t border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
          <h2 className="text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{copy.title}</h2>
          <p className="mt-4 text-base leading-7 text-[var(--sc-muted)]">{copy.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {copy.items.map(([icon, title, desc]) => (
            <article
              key={title}
              className="group rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-6 transition-colors hover:border-[var(--sc-accent)]"
            >
              <div className="mb-6 flex size-11 items-center justify-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] text-[var(--sc-accent)]">
                <MaterialIcon name={icon} />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-[var(--sc-strong)]">{title}</h3>
              <p className="text-sm leading-6 text-[var(--sc-muted)]">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
