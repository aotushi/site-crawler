import { useLang } from '../lib/i18n'
import type { MessageKey } from '../lib/i18n'
import type { RenderStatus } from '../lib/api'
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
  renderStatus?: RenderStatus | null
  renderNotice?: 'render_quota' | 'render_budget' | null
  onDownloadRender?: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function CrawlProgress({ status, progress, fileCount, totalBytes, jsWarning, onDownload, renderStatus, renderNotice, onDownloadRender }: Props) {
  const { lang, t } = useLang()

  const pct = progress && progress.queued > 0
    ? Math.min(99, Math.round((progress.downloaded / progress.queued) * 100))
    : null
  const renderPct = renderStatus && renderStatus.pagesTotal
    ? Math.min(99, Math.round((renderStatus.pagesDone / renderStatus.pagesTotal) * 100))
    : null
  const copy = {
    zh: {
      panel: 'crawl telemetry',
      staticLane: '静态链路',
      renderLane: '渲染链路',
      failedHint: '任务没有完成。可以检查 URL、目标站点可访问性或稍后重试。',
      packageSummary: '打包结果',
      liveQueue: '实时队列',
      downloaded: '已下载',
      queued: '队列总数',
      bytes: '当前体积',
      renderDesc: '检测到 SPA，已转入云端浏览器异步渲染。任务在后台运行，可关闭页面稍后回来查看。',
    },
    en: {
      panel: 'crawl telemetry',
      staticLane: 'Static lane',
      renderLane: 'Render lane',
      failedHint: 'The job did not finish. Check the URL, target availability, or retry later.',
      packageSummary: 'Package summary',
      liveQueue: 'Live queue',
      downloaded: 'Downloaded',
      queued: 'Queued',
      bytes: 'Current size',
      renderDesc: 'SPA detected — escalated to async cloud-browser rendering. The job runs in the background; you can close this page and come back.',
    },
  }[lang]

  const renderActive = renderStatus != null
  const renderRunning = renderActive && (renderStatus.status === 'queued' || renderStatus.status === 'running')
  const renderDownloadable = renderActive
    && (renderStatus.status === 'done' || renderStatus.status === 'partial')
    && !!renderStatus.downloadUrl

  const headerText = renderActive
    ? renderStatus.status === 'queued' ? t('crawl_render_queued')
      : renderStatus.status === 'running' ? t('crawl_render_running')
      : renderStatus.status === 'partial' ? t('crawl_render_partial')
      : renderStatus.status === 'failed' ? t('crawl_render_failed')
      : t('crawl_render_done')
    : status === 'running' ? t('crawl_running') : status === 'done' ? t('crawl_done') : t('crawl_failed')

  const headerOk = renderActive
    ? renderStatus.status === 'done' || renderStatus.status === 'partial'
    : status === 'done'
  const headerFailed = renderActive ? renderStatus.status === 'failed' : status === 'failed'

  return (
    <div className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--sc-border)] px-5 py-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[2.52px] text-[var(--sc-subtle)]">{copy.panel}</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--sc-strong)]">
            {renderActive ? copy.renderLane : copy.staticLane}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {(renderActive ? renderRunning : status === 'running') && (
            <div className="size-4 rounded-full border-2 border-[var(--sc-accent)] border-t-transparent animate-spin" />
          )}
          {headerOk && <MaterialIcon name="check_circle" className="text-[var(--sc-accent)]" />}
          {headerFailed && <MaterialIcon name="error" className="text-red-500" />}
          <span className="font-medium text-[var(--sc-text)]">{headerText}</span>
          {renderActive && renderRunning && renderPct !== null && (
            <span className="font-mono text-sm text-[var(--sc-accent)]">{renderPct}%</span>
          )}
          {!renderActive && status === 'running' && pct !== null && (
            <span className="font-mono text-sm text-[var(--sc-accent)]">{pct}%</span>
          )}
        </div>
      </div>

      <div className="p-5">
      {renderNotice && (
        <div className="mb-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <MaterialIcon name="info" className="shrink-0 text-amber-600" />
          <span>{renderNotice === 'render_quota' ? t('crawl_render_notice_quota') : t('crawl_render_notice_budget')}</span>
        </div>
      )}

      {renderActive ? (
        <>
          <p className="mb-5 text-sm leading-6 text-[var(--sc-muted)]">{copy.renderDesc}</p>

          {renderRunning && (
            <div className="mb-5">
              <div className="mb-2 flex justify-between text-sm text-[var(--sc-muted)]">
                <span>
                  {renderStatus.phase
                    ? t(`crawl_render_phase_${renderStatus.phase}` as MessageKey)
                    : t('crawl_render_queued')}
                </span>
                <span className="font-mono">{renderStatus.pagesDone} / {renderStatus.pagesTotal ?? '?'}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--sc-soft)]">
                <div
                  className="h-2 rounded-full bg-[var(--sc-accent)] transition-all duration-300"
                  style={{ width: `${renderPct ?? 5}%` }}
                />
              </div>
            </div>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_render_pages')}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">
                {renderStatus.pagesDone}{renderStatus.pagesTotal != null ? ` / ${renderStatus.pagesTotal}` : ''}
              </p>
            </div>
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_render_bytes')}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{formatBytes(renderStatus.bytes)}</p>
            </div>
            <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
              <p className="text-xs text-[var(--sc-subtle)]">{t('crawl_render_failed_pages')}</p>
              <p className="mt-1 font-mono text-lg text-[var(--sc-strong)]">{renderStatus.failedPages.length}</p>
            </div>
          </div>

          {renderStatus.status === 'failed' && (
            <p className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
              {renderStatus.error ?? copy.failedHint}
            </p>
          )}

          {renderDownloadable && onDownloadRender && (
            <button
              onClick={onDownloadRender}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-5 py-2 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90"
            >
              <MaterialIcon name="download" className="text-[20px]" />
              {t('crawl_render_download')}
            </button>
          )}
        </>
      ) : (
        <>
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

          {status === 'done' && onDownload && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={onDownload}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-5 py-2 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90"
              >
                <MaterialIcon name="download" className="text-[20px]" />
                {t('crawl_download')}
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}
