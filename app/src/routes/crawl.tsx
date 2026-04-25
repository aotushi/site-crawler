import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import { useLang } from '../lib/i18n'
import { fetchWorker } from '../lib/api'
import { saveCrawlState, clearCrawlState } from '../lib/crawl-state'
import { CrawlProgress } from '../components/CrawlProgress'

const searchSchema = z.object({ url: z.string().optional() })

type Status = 'idle' | 'running' | 'done' | 'failed'

function CrawlPage() {
  const { url } = Route.useSearch()
  const { t } = useLang()
  const [inputUrl, setInputUrl] = useState(url ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [fileCount, setFileCount] = useState<number>()
  const [totalBytes, setTotalBytes] = useState<number>()
  const [jsWarning, setJsWarning] = useState(false)
  const zipRef = useRef<Blob | null>(null)
  const zipNameRef = useRef('site.zip')

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (status === 'running') {
        e.preventDefault()
        e.returnValue = t('crawl_leave_confirm')
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status, t])

  async function startCrawl(targetUrl: string) {
    setStatus('running')
    saveCrawlState({ url: targetUrl, status: 'running' })
    try {
      const res = await fetchWorker('/api/crawl', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl }),
      })
      if (!res.ok) {
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed' })
        return
      }
      const count = Number(res.headers.get('X-File-Count'))
      const bytes = Number(res.headers.get('X-Total-Bytes'))
      const jsWarn = res.headers.get('X-JS-Warning') === '1'
      const blob = await res.blob()
      setFileCount(count)
      setTotalBytes(bytes)
      setJsWarning(jsWarn)
      zipRef.current = blob
      zipNameRef.current = `site-${new URL(targetUrl).hostname}.zip`
      setStatus('done')
      saveCrawlState({ url: targetUrl, status: 'done', fileCount: count, totalBytes: bytes })
    } catch {
      setStatus('failed')
      saveCrawlState({ url: targetUrl, status: 'failed' })
    }
  }

  function downloadZip() {
    if (!zipRef.current) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipRef.current)
    a.download = zipNameRef.current
    a.click()
    URL.revokeObjectURL(a.href)
  }

  useEffect(() => {
    if (url && status === 'idle') startCrawl(url)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'running') return
    clearCrawlState()
    zipRef.current = null
    setFileCount(undefined)
    setTotalBytes(undefined)
    setJsWarning(false)
    startCrawl(inputUrl)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('crawl_title')}</h1>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <input
          type="text"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          placeholder={t('hero_placeholder')}
          disabled={status === 'running'}
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={status === 'running' || !inputUrl}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === 'running' ? t('crawl_running') : t('crawl_start')}
        </button>
      </form>
      {status !== 'idle' && (
        <CrawlProgress
          status={status as 'running' | 'done' | 'failed'}
          fileCount={fileCount}
          totalBytes={totalBytes}
          jsWarning={jsWarning}
          onDownload={downloadZip}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute('/crawl')({
  validateSearch: searchSchema,
  component: CrawlPage,
})
