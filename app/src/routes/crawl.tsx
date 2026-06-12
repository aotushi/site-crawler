import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import { useLang } from '../lib/i18n'
import { fetchWorker, getRenderStatus } from '../lib/api'
import type { RenderStatus } from '../lib/api'
import { saveCrawlState, loadCrawlState, clearCrawlState } from '../lib/crawl-state'
import { CrawlProgress } from '../components/CrawlProgress'
import { MaterialIcon } from '../components/home/MaterialIcon'

const searchSchema = z.object({ url: z.string().optional() })

type Status = 'idle' | 'running' | 'done' | 'failed'

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
  const [renderStatus, setRenderStatus] = useState<RenderStatus | null>(null)
  const [renderNotice, setRenderNotice] = useState<'render_quota' | 'render_budget' | null>(null)
  const renderTaskIdRef = useRef<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const copy = {
    zh: {
      eyebrow: 'CRAWL CONSOLE',
      title: '启动一次可观测的网站归档任务',
      subtitle: '输入目标 URL 后自动识别站点类型：静态站实时返回资源队列与打包体积；检测到 SPA 则转入云端浏览器异步渲染整站。',
      inputLabel: '目标站点 URL',
      staticLane: '静态边缘链路',
      staticLaneDesc: '适合静态站、SSR 页面、资源可直接发现的网站。',
      jsLane: '渲染链路',
      jsLaneDesc: '检测到 SPA 时自动启用：云端浏览器渲染 + 异步全站爬取。',
      deliverable: '交付物',
      deliverableDesc: '输出 ZIP,保留目录结构和可离线检查的资源。',
      queueTitle: '任务边界',
      queueItems: ['静态最大 900 文件 / 100MB', '渲染最大 500 页 / 900MB，匿名每日 1 次', '渲染任务异步执行，可关闭页面后回来查看'],
      targetHint: '建议输入完整 URL,例如 https://example.com',
      statusIdle: '等待输入',
      statusRunning: '任务运行中',
      statusDone: '归档已完成',
      statusFailed: '任务失败,请检查 URL 或稍后重试',
    },
    en: {
      eyebrow: 'CRAWL CONSOLE',
      title: 'Start an observable website archive job',
      subtitle: 'Enter a target URL and the site type is detected automatically: static sites stream queue and package size in real time; SPAs escalate to async cloud-browser rendering of the whole site.',
      inputLabel: 'Target site URL',
      staticLane: 'Static edge lane',
      staticLaneDesc: 'Best for static sites, SSR pages, and directly discoverable assets.',
      jsLane: 'Render lane',
      jsLaneDesc: 'Auto-enabled for SPAs: cloud-browser rendering plus an async full-site crawl.',
      deliverable: 'Deliverable',
      deliverableDesc: 'Outputs a ZIP with folder structure and offline-reviewable assets.',
      queueTitle: 'Job boundaries',
      queueItems: ['Static limit: 900 files / 100MB', 'Render limit: 500 pages / 900MB, 1 anonymous run per day', 'Render jobs run async — close the page and come back later'],
      targetHint: 'Use a full URL, for example https://example.com',
      statusIdle: 'Waiting for input',
      statusRunning: 'Job running',
      statusDone: 'Archive complete',
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
      // 渲染任务在云端异步执行，离开页面不中断；只拦静态任务
      if (status === 'running' && !renderTaskIdRef.current) {
        e.preventDefault()
        e.returnValue = t('crawl_leave_confirm')
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [status, t])

  function startRenderPolling(taskId: string, targetUrl: string) {
    renderTaskIdRef.current = taskId
    saveCrawlState({ url: targetUrl, status: 'running', mode: 'render', renderTaskId: taskId })
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    pollIntervalRef.current = setInterval(async () => {
      const s = await getRenderStatus(taskId)
      if (!s) return // 网络抖动：继续轮询
      setRenderStatus(s)
      if (s.status === 'done' || s.status === 'partial') {
        clearInterval(pollIntervalRef.current!)
        setStatus('done')
        saveCrawlState({ url: targetUrl, status: 'done', mode: 'render', renderTaskId: taskId })
      } else if (s.status === 'failed') {
        clearInterval(pollIntervalRef.current!)
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed', mode: 'render', renderTaskId: taskId })
      }
    }, 3000)
  }

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
          } else if (event === 'render_task') {
            // SPA 分流：worker 已建渲染任务，转入轮询（SSE 流随后由服务端关闭）
            startRenderPolling(data.taskId as string, targetUrl)
          } else if (event === 'notice') {
            // 渲染不可用，降级静态；显示原因横幅
            setRenderNotice(data.reason as 'render_quota' | 'render_budget')
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
      // 渲染轮询已接管时，SSE 通道的中断不算失败
      if (!renderTaskIdRef.current) {
        setStatus('failed')
        saveCrawlState({ url: targetUrl, status: 'failed' })
      }
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

  function downloadRenderZip() {
    if (!renderStatus?.downloadUrl) return
    const a = document.createElement('a')
    a.href = renderStatus.downloadUrl
    a.download = `site-render-${new URL(inputUrl).hostname}.zip`
    a.click()
  }

  useEffect(() => {
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current) }
  }, [])

  useEffect(() => {
    // 恢复进行中的渲染任务（刷新/重开页面）；否则按 ?url= 自动开跑
    const saved = loadCrawlState()
    if (saved?.mode === 'render' && saved.renderTaskId && saved.status === 'running') {
      setInputUrl(saved.url)
      setStatus('running')
      startRenderPolling(saved.renderTaskId, saved.url)
      return
    }
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
    setRenderStatus(null)
    setRenderNotice(null)
    renderTaskIdRef.current = null
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
                renderStatus={renderStatus}
                renderNotice={renderNotice}
                onDownloadRender={downloadRenderZip}
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
