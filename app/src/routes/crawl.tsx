import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import { useLang } from '../lib/i18n'
import { fetchWorker } from '../lib/api'
import { saveCrawlState, clearCrawlState } from '../lib/crawl-state'
import { CrawlProgress } from '../components/CrawlProgress'
import { MaterialIcon } from '../components/home/MaterialIcon'

const searchSchema = z.object({ url: z.string().optional() })

type Status = 'idle' | 'running' | 'done' | 'failed'
type FullCrawlStatus = 'idle' | 'triggering' | 'pending' | 'done' | 'failed'

interface ProgressState {
  downloaded: number
  queued: number
  bytes: number
}

function CrawlPage() {
  const { url } = Route.useSearch()
  const { lang, t } = useLang()
  const [inputUrl, setInputUrl] = useState(url ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState<ProgressState>({ downloaded: 0, queued: 0, bytes: 0 })
  const [fileCount, setFileCount] = useState<number>()
  const [totalBytes, setTotalBytes] = useState<number>()
  const [jsWarning, setJsWarning] = useState(false)
  const zipRef = useRef<Blob | null>(null)
  const staticDownloadUrlRef = useRef<string | null>(null)
  const zipNameRef = useRef('site.zip')
  const [fullCrawlStatus, setFullCrawlStatus] = useState<FullCrawlStatus>('idle')
  const fullZipRef = useRef<Blob | null>(null)
  const fullDownloadUrlRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [fullCrawlProgress, setFullCrawlProgress] = useState<{ phase: string; downloaded: number; total: number } | null>(null)
  const copy = {
    zh: {
      eyebrow: 'CRAWL CONSOLE',
      title: '启动一次可观测的网站归档任务',
      subtitle: '输入目标 URL 后,静态链路会实时返回资源队列、下载数量和打包体积。若检测到动态渲染,可继续触发 Playwright 完整爬取。',
      inputLabel: '目标站点 URL',
      staticLane: '静态边缘链路',
      staticLaneDesc: '适合静态站、SSR 页面、资源可直接发现的网站。',
      jsLane: 'JS 完整链路',
      jsLaneDesc: '适合 SPA、懒加载页面和浏览器执行后才出现的内容。',
      deliverable: '交付物',
      deliverableDesc: '输出 ZIP,保留目录结构和可离线检查的资源。',
      queueTitle: '任务边界',
      queueItems: ['静态最大 200 文件 / 50MB', '未登录用户每日限额保护', '运行中离开页面会中断静态任务'],
      targetHint: '建议输入完整 URL,例如 https://example.com',
      statusIdle: '等待输入',
      statusRunning: '静态爬取运行中',
      statusDone: '静态归档已完成',
      statusFailed: '任务失败,请检查 URL 或稍后重试',
    },
    en: {
      eyebrow: 'CRAWL CONSOLE',
      title: 'Start an observable website archive job',
      subtitle: 'Enter a target URL and the static lane streams queue size, downloaded files, and package size. If dynamic rendering is detected, escalate to a full Playwright crawl.',
      inputLabel: 'Target site URL',
      staticLane: 'Static edge lane',
      staticLaneDesc: 'Best for static sites, SSR pages, and directly discoverable assets.',
      jsLane: 'Full JS lane',
      jsLaneDesc: 'Best for SPAs, lazy-loaded pages, and browser-rendered content.',
      deliverable: 'Deliverable',
      deliverableDesc: 'Outputs a ZIP with folder structure and offline-reviewable assets.',
      queueTitle: 'Job boundaries',
      queueItems: ['Static limit: 200 files / 50MB', 'Anonymous daily quota protects the service', 'Leaving during a static job interrupts it'],
      targetHint: 'Use a full URL, for example https://example.com',
      statusIdle: 'Waiting for input',
      statusRunning: 'Static crawl running',
      statusDone: 'Static archive complete',
      statusFailed: 'Job failed. Check the URL or retry later.',
    },
  }[lang]

  const statusText = status === 'idle'
    ? copy.statusIdle
    : status === 'running'
      ? copy.statusRunning
      : status === 'done'
        ? copy.statusDone
        : copy.statusFailed

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
    setProgress({ downloaded: 0, queued: 0, bytes: 0 })
    saveCrawlState({ url: targetUrl, status: 'running' })

    try {
      const res = await fetchWorker('/api/crawl', {
        method: 'POST',
        body: JSON.stringify({ url: targetUrl }),
      })

      if (!res.ok || !res.body) {
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed' })
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      function processEvents(chunk: string) {
        buf += chunk
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)/)
          const dataMatch = part.match(/^data: (.+)$/m)
          if (!eventMatch || !dataMatch) continue

          const event = eventMatch[1]
          let data: Record<string, unknown>
          try {
            data = JSON.parse(dataMatch[1])
          } catch {
            continue
          }

          if (event === 'progress') {
            setProgress({
              downloaded: data.downloaded as number,
              queued: data.queued as number,
              bytes: data.bytes as number,
            })
          } else if (event === 'done') {
            const count = data.fileCount as number
            const bytes = data.totalBytes as number
            const jsWarn = data.jsWarning as boolean
            const downloadUrl = data.downloadUrl as string | undefined

            zipNameRef.current = `site-${new URL(targetUrl).hostname}.zip`
            if (downloadUrl) {
              staticDownloadUrlRef.current = downloadUrl
            } else if (data.zip) {
              // 向后兼容：旧版返回 base64
              const binary = atob(data.zip as string)
              const arr = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
              zipRef.current = new Blob([arr], { type: 'application/zip' })
            }

            setFileCount(count)
            setTotalBytes(bytes)
            setJsWarning(jsWarn)
            setStatus('done')
            saveCrawlState({ url: targetUrl, status: 'done', fileCount: count, totalBytes: bytes })
          } else if (event === 'error') {
            setStatus('failed')
            saveCrawlState({ url: targetUrl, status: 'failed' })
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (value) processEvents(decoder.decode(value, { stream: !done }))
        if (done) {
          // 处理流结束时 buf 里可能残留的最后一个事件
          if (buf.trim()) processEvents('\n\n')
          break
        }
      }
    } catch {
      setStatus('failed')
      saveCrawlState({ url: targetUrl, status: 'failed' })
    }
  }

  function downloadZip() {
    if (staticDownloadUrlRef.current) {
      const a = document.createElement('a')
      a.href = staticDownloadUrlRef.current
      a.download = zipNameRef.current
      a.click()
      return
    }
    if (!zipRef.current) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(zipRef.current)
    a.download = zipNameRef.current
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function startFullCrawl() {
    setFullCrawlStatus('triggering')
    try {
      const res = await fetchWorker('/api/crawl/js/trigger', {
        method: 'POST',
        body: JSON.stringify({ url: inputUrl }),
      })
      if (!res.ok) { setFullCrawlStatus('failed'); return }
      const data = await res.json() as {
        runId?: number
        cached?: boolean
        downloadUrl?: string
        fileCount?: number
        zipSize?: number
      }

      // 缓存命中，直接可下载
      if (data.cached && data.downloadUrl) {
        fullDownloadUrlRef.current = data.downloadUrl
        setFullCrawlStatus('done')
        return
      }

      if (!data.runId) { setFullCrawlStatus('failed'); return }
      setFullCrawlStatus('pending')

      const encodedUrl = encodeURIComponent(inputUrl)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetchWorker(`/api/crawl/js/status/${data.runId}?url=${encodedUrl}`)
          if (!statusRes.ok) return
          const statusData = await statusRes.json() as {
            status: string
            downloadUrl?: string
            zip?: string
            progress?: { phase: string; downloaded: number; total: number } | null
          }

          if (statusData.progress) setFullCrawlProgress(statusData.progress)

          if (statusData.status === 'done') {
            clearInterval(pollIntervalRef.current!)
            if (statusData.downloadUrl) {
              fullDownloadUrlRef.current = statusData.downloadUrl
            } else if (statusData.zip) {
              const binary = atob(statusData.zip)
              const arr = new Uint8Array(binary.length)
              for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
              fullZipRef.current = new Blob([arr], { type: 'application/zip' })
            }
            setFullCrawlStatus('done')
          } else if (statusData.status === 'failed') {
            clearInterval(pollIntervalRef.current!)
            setFullCrawlStatus('failed')
          }
        } catch { /* keep polling */ }
      }, 5000)
    } catch {
      setFullCrawlStatus('failed')
    }
  }

  function downloadFullZip() {
    if (fullDownloadUrlRef.current) {
      const a = document.createElement('a')
      a.href = fullDownloadUrlRef.current
      a.download = `site-full-${new URL(inputUrl).hostname}.zip`
      a.click()
      return
    }
    if (!fullZipRef.current) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(fullZipRef.current)
    a.download = `site-full-${new URL(inputUrl).hostname}.zip`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [])

  useEffect(() => {
    if (url && status === 'idle') startCrawl(url)
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'running') return
    clearCrawlState()
    zipRef.current = null
    staticDownloadUrlRef.current = null
    setFileCount(undefined)
    setTotalBytes(undefined)
    setJsWarning(false)
    setProgress({ downloaded: 0, queued: 0, bytes: 0 })
    setFullCrawlStatus('idle')
    fullZipRef.current = null
    fullDownloadUrlRef.current = null
    setFullCrawlProgress(null)
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
    startCrawl(inputUrl)
  }

  return (
    <div className="min-h-screen bg-[var(--sc-bg)] pt-16 text-[var(--sc-text)]">
      <section className="relative overflow-hidden border-b border-[var(--sc-border)] px-6 py-16">
        <div className="absolute inset-0 -z-0 bg-[linear-gradient(var(--sc-bg-grid)_1px,transparent_1px),linear-gradient(90deg,var(--sc-bg-grid)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="relative z-10 mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-accent)]">{copy.eyebrow}</p>
            <h1 className="max-w-3xl text-4xl font-normal leading-tight tracking-normal text-[var(--sc-strong)] md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-[var(--sc-muted)] md:text-lg">
              {copy.subtitle}
            </p>

            <form onSubmit={handleSubmit} className="mt-10 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-2">
              <label className="mb-2 block px-2 text-xs font-semibold uppercase tracking-[2.52px] text-[var(--sc-subtle)]">
                {copy.inputLabel}
              </label>
              <div className="flex flex-col gap-2 md:flex-row">
                <div className="flex min-h-12 flex-1 items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] px-4">
                  <MaterialIcon name="link" className="text-[var(--sc-subtle)]" />
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={e => setInputUrl(e.target.value)}
                    placeholder={t('hero_placeholder')}
                    disabled={status === 'running'}
                    className="h-12 w-full border-none bg-transparent text-base text-[var(--sc-strong)] outline-none placeholder:text-[var(--sc-subtle)] disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'running' || !inputUrl}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[var(--sc-accent)] px-6 py-3 font-semibold text-[var(--sc-on-accent)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <MaterialIcon name={status === 'running' ? 'progress_activity' : 'travel_explore'} className={`text-[20px] ${status === 'running' ? 'animate-spin' : ''}`} />
                  {status === 'running' ? t('crawl_running') : t('crawl_start')}
                </button>
              </div>
              <p className="px-2 pt-3 text-sm text-[var(--sc-subtle)]">{copy.targetHint}</p>
            </form>
          </div>

          <aside className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5">
            <div className="mb-5 flex items-center justify-between border-b border-[var(--sc-border)] pb-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[2.52px] text-[var(--sc-subtle)]">current state</p>
                <p className="mt-1 font-semibold text-[var(--sc-strong)]">{statusText}</p>
              </div>
              <span className={`size-3 rounded-full ${status === 'failed' ? 'bg-red-500' : status === 'running' ? 'animate-pulse bg-[var(--sc-accent)]' : 'bg-[var(--sc-accent)]'}`} />
            </div>

            <div className="grid gap-3">
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--sc-accent)]">
                  <MaterialIcon name="bolt" className="text-[20px]" />
                  <h2 className="font-semibold text-[var(--sc-strong)]">{copy.staticLane}</h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{copy.staticLaneDesc}</p>
              </div>
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--sc-accent)]">
                  <MaterialIcon name="javascript" className="text-[20px]" />
                  <h2 className="font-semibold text-[var(--sc-strong)]">{copy.jsLane}</h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{copy.jsLaneDesc}</p>
              </div>
              <div className="rounded-md border border-[var(--sc-border)] bg-[var(--sc-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--sc-accent)]">
                  <MaterialIcon name="folder_zip" className="text-[20px]" />
                  <h2 className="font-semibold text-[var(--sc-strong)]">{copy.deliverable}</h2>
                </div>
                <p className="text-sm leading-6 text-[var(--sc-muted)]">{copy.deliverableDesc}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="mx-auto grid max-w-[1200px] gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            {status !== 'idle' ? (
              <CrawlProgress
                status={status as 'running' | 'done' | 'failed'}
                progress={status === 'running' ? progress : undefined}
                fileCount={fileCount}
                totalBytes={totalBytes}
                jsWarning={jsWarning}
                onDownload={downloadZip}
                onFullCrawl={startFullCrawl}
                fullCrawlStatus={fullCrawlStatus}
                fullCrawlProgress={fullCrawlProgress}
                onDownloadFull={fullCrawlStatus === 'done' ? downloadFullZip : undefined}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-[var(--sc-border)] bg-[var(--sc-card)] p-8">
                <MaterialIcon name="input" className="mb-5 block text-4xl text-[var(--sc-accent)]" />
                <h2 className="mb-3 text-2xl font-normal text-[var(--sc-strong)]">{copy.statusIdle}</h2>
                <p className="max-w-2xl text-sm leading-6 text-[var(--sc-muted)]">{copy.targetHint}</p>
              </div>
            )}
          </div>

          <aside className="rounded-lg border border-[var(--sc-border)] bg-[var(--sc-card)] p-5">
            <h2 className="mb-4 font-semibold text-[var(--sc-strong)]">{copy.queueTitle}</h2>
            <ul className="space-y-3">
              {copy.queueItems.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-[var(--sc-muted)]">
                  <MaterialIcon name="check_circle" className="mt-0.5 text-[18px] text-[var(--sc-accent)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </div>
  )
}

export const Route = createFileRoute('/crawl')({
  validateSearch: searchSchema,
  component: CrawlPage,
})
