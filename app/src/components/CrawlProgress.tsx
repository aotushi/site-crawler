import { useLang } from '../lib/i18n'

interface Props {
  status: 'running' | 'done' | 'failed'
  fileCount?: number
  totalBytes?: number
  jsWarning?: boolean
  onDownload?: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export function CrawlProgress({ status, fileCount, totalBytes, jsWarning, onDownload }: Props) {
  const { t } = useLang()
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-xl mx-auto mt-8">
      {jsWarning && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm rounded-lg p-3 mb-4">
          ⚠️ {t('crawl_js_warning')}
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        {status === 'running' && (
          <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        )}
        {status === 'done' && <span className="text-green-500 text-lg">✓</span>}
        {status === 'failed' && <span className="text-red-500 text-lg">✗</span>}
        <span className="font-medium text-gray-800">
          {status === 'running' ? t('crawl_running') : status === 'done' ? t('crawl_done') : t('crawl_failed')}
        </span>
      </div>
      {(fileCount !== undefined || totalBytes !== undefined) && (
        <div className="flex gap-6 text-sm text-gray-500 mb-4">
          {fileCount !== undefined && (
            <span>{t('crawl_files')}: <strong className="text-gray-800">{fileCount}</strong></span>
          )}
          {totalBytes !== undefined && (
            <span>{t('crawl_size')}: <strong className="text-gray-800">{formatBytes(totalBytes)}</strong></span>
          )}
        </div>
      )}
      {status === 'done' && onDownload && (
        <button
          onClick={onDownload}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          {t('crawl_download')}
        </button>
      )}
    </div>
  )
}
