import { useLang } from '../lib/i18n'
import { MaterialIcon } from './home/MaterialIcon'

interface ProgressState {
  downloaded: number
  queued: number
  bytes: number
}

interface Props {
  status: 'running' | 'done' | 'failed'
  progress?: ProgressState
  fileCount?: number
  totalBytes?: number
  jsWarning?: boolean
  onDownload?: () => void
  onFullCrawl?: () => void
  fullCrawlStatus?: 'idle' | 'triggering' | 'pending' | 'done' | 'failed'
  fullCrawlProgress?: { phase: string; downloaded: number; total: number } | null
  onDownloadFull?: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function CrawlProgress({ status, progress, fileCount, totalBytes, jsWarning, onDownload, onFullCrawl, fullCrawlStatus, fullCrawlProgress, onDownloadFull }: Props) {
  const { lang, t } = useLang()

  const pct = progress && progress.queued > 0
    ? Math.min(99, Math.round((progress.downloaded / progress.queued) * 100))
    : null
  const fullPct = fullCrawlProgress && fullCrawlProgress.total > 0
    ? Math.min(99, Math.round((fullCrawlProgress.downloaded / fullCrawlProgress.total) * 100))
    : null
  const copy = {
    zh: {
      panel: 'crawl telemetry',
      staticLane: '静态链路',
      archiveReady: '归档包已就绪',
      failedHint: '任务没有完成。可以检查 URL、目标站点可访问性或稍后重试。',
      packageSummary: '打包结果',
      liveQueue: '实时队列',
      downloaded: '已下载',
      queued: '队列总数',
      bytes: '当前体积',
      jsTitle: 'JS 完整爬取',
      jsDesc: '使用 GitHub Actions + Playwright 渲染页面,适合动态内容或 SPA。',
      jsPending: '异步任务运行中',
      jsReady: '完整包已就绪',
      jsIdle: '需要更完整的浏览器渲染结果时再触发。',
    },
    en: {
      panel: 'crawl telemetry',
      staticLane: 'Static lane',
      archiveReady: 'Archive package ready',
      failedHint: 'The job did not finish. Check the URL, target availability, or retry later.',
      packageSummary: 'Package summary',
      liveQueue: 'Live queue',
      downloaded: 'Downloaded',
      queued: 'Queued',
      bytes: 'Current size',
      jsTitle: 'Full JS crawl',
      jsDesc: 'Renders pages through GitHub Actions + Playwright for dynamic content and SPAs.',
      jsPending: 'Async job running',
      jsReady: 'Full package ready',
      jsIdle: 'Trigger this only when browser-rendered output is needed.',
    },
  }[lang]

  return (
    <div className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--sc-border)] px-5 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[2.52px] text-[var(--sc-subtle)]">{copy.panel}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--sc-strong)]">{copy.staticLane}</h2>
        </div>
        <div className="flex items-center gap-3">
          {status === 'running' && (
            <div className="size-4 rounded-full border-2 border-[var(--sc-accent)] border-t-transparent animate-spin" />
          )}
          {status === 'done' && <MaterialIcon name="check_circle" className="text-[var(--sc-accent)]" />}
          {status === 'failed' && <MaterialIcon name="error" className="text-red-500" />}
          <span className="font-medium text-[var(--sc-text)]">
            {status === 'running' ? t('crawl_running') : status === 'done' ? t('crawl_done') : t('crawl_failed')}
          </span>
          {status === 'running' && pct !== null && (
            <span className="font-mono text-sm text-[var(--sc-accent)]">{pct}%</span>
          )}
        </div>
      </div>

      <div className="p-5">
      {jsWarning && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <MaterialIcon name="warning" className="shrink-0 text-amber-600" />
          <span>{t('crawl_js_warning')}</span>
        </div>
      )}

      {status === 'running' && progress && (
        <>
          <p className="mb-3 text-sm font-semibold text-[var(--sc-strong)]">{copy.liveQueue}</p>
          <div className="mb-4 h-2 w-full rounded-full bg-[var(--sc-soft)]">
            <div
              className="h-2 rounded-full bg-[var(--sc-accent)] transition-all duration-300"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{copy.downloaded}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{progress.downloaded}</p>
            </div>
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{copy.queued}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{progress.queued}</p>
            </div>
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{copy.bytes}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{formatBytes(progress.bytes)}</p>
            </div>
          </div>
        </>
      )}

      {status === 'done' && (fileCount !== undefined || totalBytes !== undefined) && (
        <div className="mb-5">
          <p className="mb-3 text-sm font-semibold text-[var(--sc-strong)]">{copy.packageSummary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
          {fileCount !== undefined && (
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_files')}</p>
                <p className="mt-1 font-mono text-xl text-[var(--sc-strong)]">{fileCount}</p>
              </div>
          )}
          {totalBytes !== undefined && (
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_size')}</p>
                <p className="mt-1 font-mono text-xl text-[var(--sc-strong)]">{formatBytes(totalBytes)}</p>
              </div>
          )}
          </div>
        </div>
      )}

      {status === 'failed' && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">{copy.failedHint}</p>
      )}

      {status === 'done' && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {onDownload && (
            <button
              onClick={onDownload}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-5 py-2 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90"
            >
              <MaterialIcon name="download" className="text-[20px]" />
              {t('crawl_download')}
            </button>
          )}
        </div>
      )}

      {status === 'done' && onFullCrawl && (
        <div className="mt-5 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-[var(--sc-strong)]">{copy.jsTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--sc-muted)]">
                {fullCrawlStatus === 'pending' || fullCrawlStatus === 'triggering'
                  ? copy.jsPending
                  : fullCrawlStatus === 'done'
                    ? copy.jsReady
                    : copy.jsIdle}
              </p>
            </div>
            <MaterialIcon name="terminal" className="text-[var(--sc-accent)]" />
          </div>
          <p className="mb-4 text-sm leading-6 text-[var(--sc-muted)]">{copy.jsDesc}</p>

          {fullCrawlStatus === 'pending' && fullCrawlProgress && (
            <div className="mb-4">
              <div className="mb-2 flex justify-between text-sm text-[var(--sc-muted)]">
                <span>{fullCrawlProgress.phase === 'crawl' ? t('crawl_js_phase_crawl') : t('crawl_js_phase_assets')}</span>
                <span className="font-mono">{fullCrawlProgress.downloaded} / {fullCrawlProgress.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--sc-card)]">
                <div
                  className="h-2 rounded-full bg-[var(--sc-accent)] transition-all duration-300"
                  style={{ width: `${fullPct ?? 5}%` }}
                />
              </div>
            </div>
          )}

          {fullCrawlStatus === 'done' && onDownloadFull ? (
            <button
              onClick={onDownloadFull}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-5 py-2 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90"
            >
              <MaterialIcon name="download" className="text-[20px]" />
              {t('crawl_js_download')}
            </button>
          ) : (
            <button
              onClick={onFullCrawl}
              disabled={fullCrawlStatus === 'triggering' || fullCrawlStatus === 'pending'}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--sc-border)] bg-[var(--sc-card)] px-5 py-2 font-semibold text-[var(--sc-text)] transition-colors hover:border-[var(--sc-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MaterialIcon name="play_arrow" className="text-[20px] text-[var(--sc-accent)]" />
              {fullCrawlStatus === 'triggering' || fullCrawlStatus === 'pending'
                ? t('crawl_js_running')
                : t('crawl_js_full')}
            </button>
          )}

          {fullCrawlStatus === 'failed' && (
            <p className="mt-3 text-sm text-red-600">{t('crawl_js_failed')}</p>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
