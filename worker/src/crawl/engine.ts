import { isJsRendered } from './detector'
import { parseAssets } from './parser'
import { buildZip, ZipEntry } from './zipper'

export interface CrawlResult {
  zip: Uint8Array
  fileCount: number
  totalBytes: number
  jsWarning: boolean
}

const MAX_FILES = 200
const MAX_BYTES = 50 * 1024 * 1024  // 50 MB
const MAX_DEPTH = 2

export async function crawlSite(startUrl: string): Promise<CrawlResult> {
  const visited = new Set<string>()
  const entries: ZipEntry[] = []
  let totalBytes = 0
  let jsWarning = false

  async function fetchAndAdd(url: string): Promise<void> {
    if (visited.has(url)) return
    visited.add(url)

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 SiteCrawlerBot/1.0' },
        redirect: 'follow',
      })
    } catch {
      return
    }

    if (!res.ok) return

    const buf = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    totalBytes += data.byteLength

    if (totalBytes > MAX_BYTES) return

    const parsed = new URL(url)
    let zipPath = parsed.pathname.replace(/^\//, '') || 'index.html'
    if (zipPath.endsWith('/')) zipPath += 'index.html'

    entries.push({ path: zipPath, data })
  }

  async function crawl(url: string, depth: number): Promise<void> {
    if (visited.has(url) || entries.length >= MAX_FILES) return
    visited.add(url)

    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 SiteCrawlerBot/1.0' },
        redirect: 'follow',
      })
    } catch {
      return
    }

    if (!res.ok) return

    const contentType = res.headers.get('Content-Type') ?? ''
    const isHtml = contentType.includes('text/html')

    const buf = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    totalBytes += data.byteLength
    if (totalBytes > MAX_BYTES) return

    const parsed = new URL(url)
    let zipPath = parsed.pathname.replace(/^\//, '') || 'index.html'
    if (zipPath.endsWith('/')) zipPath += 'index.html'
    entries.push({ path: zipPath, data })

    if (!isHtml || depth >= MAX_DEPTH) return

    const html = new TextDecoder().decode(data)

    if (depth === 0 && isJsRendered(html)) {
      jsWarning = true
    }

    const { links, assets } = parseAssets(html, url)

    await Promise.allSettled(
      assets
        .filter(a => !visited.has(a) && entries.length < MAX_FILES)
        .map(a => fetchAndAdd(a))
    )

    for (const link of links) {
      if (entries.length >= MAX_FILES || totalBytes > MAX_BYTES) break
      await crawl(link, depth + 1)
    }
  }

  await crawl(startUrl, 0)

  const zip = await buildZip(entries)
  return { zip, fileCount: entries.length, totalBytes, jsWarning }
}
