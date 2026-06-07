import { MaterialIcon } from './MaterialIcon'
import { useLang } from '../../lib/i18n'

export function HomeIntegrations() {
  const { lang } = useLang()
  const copy = {
    zh: {
      eyebrow: 'SUPPORTED SURFACES',
      title: '支持的资源类型与运行环境',
      subtitle: '把技术支持范围直接展示出来,用户能更快判断是否适合自己的站点。',
      items: [
        ['html', 'HTML 文档', '页面结构、内部链接、入口文件'],
        ['css', 'CSS 样式', '样式表、背景图、字体引用'],
        ['javascript', 'JavaScript', '脚本资源与 SPA 渲染兜底'],
        ['image', '媒体资源', 'JPG、PNG、WEBP、SVG 等'],
        ['cloud', 'Cloudflare', 'Pages、Workers、D1、R2'],
        ['terminal', 'GitHub Actions', 'Playwright 完整抓取任务'],
      ],
    },
    en: {
      eyebrow: 'SUPPORTED SURFACES',
      title: 'Supported asset types and runtime surfaces',
      subtitle: 'By showing support boundaries directly, users can judge fit before starting a crawl.',
      items: [
        ['html', 'HTML documents', 'Page structure, internal links, entry files'],
        ['css', 'CSS styles', 'Stylesheets, background images, font references'],
        ['javascript', 'JavaScript', 'Script assets and SPA render fallback'],
        ['image', 'Media assets', 'JPG, PNG, WEBP, SVG, and more'],
        ['cloud', 'Cloudflare', 'Pages, Workers, D1, and R2'],
        ['terminal', 'GitHub Actions', 'Full Playwright crawl jobs'],
      ],
    },
  }[lang]

  return (
    <section className="border-t border-dashed border-[var(--sc-border)] bg-[var(--sc-bg)] px-6 py-20 text-[var(--sc-text)]">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-12 max-w-3xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
          <h2 className="text-3xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-4xl">{copy.title}</h2>
          <p className="mt-4 text-base leading-7 text-[var(--sc-muted)]">{copy.subtitle}</p>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[var(--sc-border)] bg-[var(--sc-border)] sm:grid-cols-2 lg:grid-cols-3">
          {copy.items.map(([icon, title, desc]) => (
            <article key={title} className="bg-[var(--sc-card)] p-6">
              <MaterialIcon name={icon} className="mb-5 block text-3xl text-[var(--sc-accent)]" />
              <h3 className="mb-2 font-semibold text-[var(--sc-strong)]">{title}</h3>
              <p className="text-sm leading-6 text-[var(--sc-muted)]">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
