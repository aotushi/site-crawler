import { isJsRendered } from './detector'
import { parseAssets, parseCssUrls } from './parser'
import { buildZip, ZipEntry } from './zipper'
import { urlToZipPath, rewriteHtml, rewriteCss, fetchUrl, fetchUrlWithTimeout, collectSitemapUrls } from './shared'

export interface CrawlResult {
  zip: Uint8Array
  fileCount: number
  totalBytes: number
  jsWarning: boolean
}

export interface CrawlProgress {
  downloaded: number  // 已下载文件数
  queued: number      // 已发现待下载数（含已下载）
  bytes: number       // 已下载字节数
}

export type ProgressCallback = (p: CrawlProgress) => void

// 上限贴近 Cloudflare Workers 物理天花板：子请求 1000/请求、内存 128MB、CPU 时间
// 文件数留余量给页面抓取；字节与内存权衡；深度提一级以发现更多页面内资源
const MAX_FILES = 900
const MAX_BYTES = 100 * 1024 * 1024  // 100 MB
const MAX_DEPTH = 5
const POOL_CONCURRENCY = 6  // 并发工作池大小，控制子请求突发与内存峰值
const FETCH_TIMEOUT_MS = 20_000  // 单请求超时：挂死连接到点 abort，避免拖死并发池

export async function crawlSite(startUrl: string, onProgress?: ProgressCallback): Promise<CrawlResult> {
  const startOrigin = new URL(startUrl).origin
  const fileMap = new Map<string, { zipPath: string; data: Uint8Array; contentType: string }>()
  const visited = new Set<string>()
  let totalBytes = 0
  let jsWarning = false

  type Task = { url: string; kind: 'page'; depth: number } | { url: string; kind: 'asset' }
  const enqueued = new Set<string>()
  const pageQueue: Task[] = []   // 页面优先：先抓完所有页面，资源用剩余额度
  const assetQueue: Task[] = []

  function reportProgress() {
    onProgress?.({ downloaded: fileMap.size, queued: enqueued.size, bytes: totalBytes })
  }

  function limitReached(): boolean {
    return fileMap.size >= MAX_FILES || totalBytes >= MAX_BYTES
  }

  function enqueue(task: Task) {
    if (enqueued.has(task.url) || visited.has(task.url)) return
    enqueued.add(task.url)
    if (task.kind === 'page') pageQueue.push(task)
    else assetQueue.push(task)
  }

  function queueSize(): number {
    return pageQueue.length + assetQueue.length
  }

  async function processTask(task: Task): Promise<void> {
    if (visited.has(task.url) || fileMap.has(task.url)) return
    if (limitReached()) return
    visited.add(task.url)

    const result = await fetchUrlWithTimeout(task.url, FETCH_TIMEOUT_MS)
    if (!result) return

    // 字节硬限额：超限则丢弃该文件，不计入
    if (totalBytes + result.data.byteLength > MAX_BYTES) return
    totalBytes += result.data.byteLength

    const zipPath = urlToZipPath(task.url, startOrigin)
    fileMap.set(task.url, { zipPath, data: result.data, contentType: result.contentType })
    reportProgress()

    if (limitReached()) return

    if (task.kind === 'asset') {
      // CSS 内部 url() 引用的资源动态扩队
      if (result.contentType.includes('text/css')) {
        const css = new TextDecoder().decode(result.data)
        for (const u of parseCssUrls(css, task.url)) enqueue({ url: u, kind: 'asset' })
      }
      return
    }

    // page（兼容 application/xhtml+xml）
    if (!result.contentType.includes('text/html') && !result.contentType.includes('application/xhtml')) return
    const html = new TextDecoder().decode(result.data)
    if (task.depth === 0 && isJsRendered(html)) jsWarning = true
    if (task.depth >= MAX_DEPTH) return

    const { links, assets } = parseAssets(html, task.url)
    for (const a of assets) enqueue({ url: a, kind: 'asset' })
    for (const l of links) enqueue({ url: l, kind: 'page', depth: task.depth + 1 })
  }

  // 固定大小并发工作池：取任务前检查限额，硬截断
  function runPool(concurrency: number): Promise<void> {
    let active = 0
    return new Promise<void>((resolve) => {
      const pump = () => {
        if (limitReached()) { pageQueue.length = 0; assetQueue.length = 0 }
        while (active < concurrency && queueSize() > 0 && !limitReached()) {
          // 页面优先：pageQueue 排空后才处理资源，避免资源把页面挤出额度
          const task = (pageQueue.length > 0 ? pageQueue.shift() : assetQueue.shift())!
          active++
          processTask(task).catch(() => {}).finally(() => {
            active--
            pump()
          })
        }
        if (active === 0 && (queueSize() === 0 || limitReached())) resolve()
      }
      pump()
    })
  }

  enqueue({ url: startUrl, kind: 'page', depth: 0 })
  // 接入 sitemap：把站点声明的全部页面 URL 直接入队，根治"靠内链爬行发现不全"
  for (const pageUrl of await collectSitemapUrls(startOrigin)) {
    enqueue({ url: pageUrl, kind: 'page', depth: 0 })
  }
  reportProgress()
  await runPool(POOL_CONCURRENCY)

  // 构建 url → zipPath 映射，用于链接重写
  const urlToPath = new Map<string, string>()
  for (const [url, entry] of fileMap) {
    urlToPath.set(url, entry.zipPath)
  }

  // 重写 HTML/CSS 中的链接
  const entries: ZipEntry[] = []
  for (const [url, entry] of fileMap) {
    let data = entry.data

    if (entry.contentType.includes('text/html')) {
      data = rewriteHtml(data, url, urlToPath)
    } else if (entry.contentType.includes('text/css')) {
      data = rewriteCss(data, url, urlToPath)
    }

    entries.push({ path: entry.zipPath, data })
  }

  const zip = await buildZip(entries)
  return { zip, fileCount: entries.length, totalBytes, jsWarning }
}
