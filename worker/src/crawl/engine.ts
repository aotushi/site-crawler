import { isJsRendered } from './detector'
import { parseAssets, parseCssUrls } from './parser'
import { buildZip, ZipEntry } from './zipper'

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

const STATIC_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.map',
  '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.ogg', '.pdf', '.zip',
])

// URL → zip 内相对路径，无扩展名页面存为 path/index.html
// 跨域资源放到 _external/<host>/ 下，避免与同源资源路径碰撞
function urlToZipPath(url: string, startOrigin: string): string {
  const parsed = new URL(url)
  let path = parsed.pathname.replace(/^\//, '') || 'index.html'
  if (path.endsWith('/')) {
    path += 'index.html'
  } else {
    const lastSeg = path.split('/').pop() ?? ''
    const dotIdx = lastSeg.lastIndexOf('.')
    const ext = dotIdx >= 0 ? lastSeg.slice(dotIdx).toLowerCase() : ''
    if (!STATIC_EXTENSIONS.has(ext)) {
      path = path.replace(/\/$/, '') + '/index.html'
    }
  }
  if (parsed.origin !== startOrigin) {
    path = `_external/${parsed.hostname}/${path}`
  }
  return path
}

// 计算从 fromPath 到 toPath 的相对路径
function relPath(fromPath: string, toPath: string): string {
  const fromParts = fromPath.split('/').slice(0, -1) // 去掉文件名，只保留目录
  const toParts = toPath.split('/')
  let common = 0
  while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
    common++
  }
  const ups = fromParts.length - common
  const rel = [...Array(ups).fill('..'), ...toParts.slice(common)].join('/')
  return rel || './' + toParts[toParts.length - 1]
}

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

  async function fetchUrl(url: string): Promise<{ data: Uint8Array; contentType: string } | null> {
    try {
      const res = await fetch(url, {
        // 使用真实浏览器请求头，避免 SiteCrawlerBot 之类自曝身份被 WAF 直接拦截
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })
      if (!res.ok) return null
      const buf = await res.arrayBuffer()
      const data = new Uint8Array(buf)
      const contentType = res.headers.get('Content-Type') ?? ''
      return { data, contentType }
    } catch {
      return null
    }
  }

  // 拉取站点 sitemap，返回同源页面 URL 列表（支持 sitemapindex 两层）。
  // 不计入 fileMap/额度，仅用于补全页面发现，根治"靠内链爬行漏页"。
  async function collectSitemapUrls(origin: string): Promise<string[]> {
    const decode = (d: Uint8Array) => new TextDecoder().decode(d)
    const sameOrigin = (raw: string): string | null => {
      try {
        const parsed = new URL(raw.replace(/&amp;/g, '&'))
        if (parsed.origin !== origin) return null
        parsed.hash = ''
        return parsed.href
      } catch {
        return null
      }
    }
    const extractLocs = (xml: string): string[] => {
      const out: string[] = []
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) out.push(m[1])
      return out
    }

    let rootXml: string | null = null
    for (const p of ['/sitemap_index.xml', '/sitemap.xml', '/wp-sitemap.xml']) {
      const r = await fetchUrl(new URL(p, origin).href)
      if (r) {
        const xml = decode(r.data)
        if (xml.includes('<loc')) { rootXml = xml; break }
      }
    }
    if (!rootXml) return []

    const pages = new Set<string>()
    if (/<sitemapindex[\s>]/i.test(rootXml)) {
      // sitemap 索引：逐个抓子 sitemap
      for (const sm of extractLocs(rootXml)) {
        const smUrl = sameOrigin(sm)
        if (!smUrl) continue
        const r = await fetchUrl(smUrl)
        if (!r) continue
        for (const loc of extractLocs(decode(r.data))) {
          const u = sameOrigin(loc)
          if (u) pages.add(u)
        }
      }
    } else {
      for (const loc of extractLocs(rootXml)) {
        const u = sameOrigin(loc)
        if (u) pages.add(u)
      }
    }
    return [...pages]
  }

  async function processTask(task: Task): Promise<void> {
    if (visited.has(task.url) || fileMap.has(task.url)) return
    if (limitReached()) return
    visited.add(task.url)

    const result = await fetchUrl(task.url)
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

  // 固定大小并发工作池（#3）：取任务前检查限额，硬截断
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

// 重写 HTML 中的绝对 URL 为相对路径
function rewriteHtml(data: Uint8Array, pageUrl: string, urlToPath: Map<string, string>): Uint8Array {
  let html = new TextDecoder().decode(data)
  const pageZipPath = urlToPath.get(pageUrl)!
  const base = new URL(pageUrl)

  // 替换 href/src/srcset/poster/data 属性中的同源 URL
  html = html.replace(
    /((?:href|src|poster|data|action)=["'])([^"']+)(["'])/g,
    (match, prefix, rawUrl, suffix) => {
      const resolved = tryResolve(rawUrl, base)
      if (!resolved) return match
      const targetPath = urlToPath.get(resolved)
      if (!targetPath) return match
      return prefix + relPath(pageZipPath, targetPath) + suffix
    }
  )

  // srcset
  html = html.replace(
    /(srcset=["'])([^"']+)(["'])/g,
    (match, prefix, srcset, suffix) => {
      const rewritten = srcset.split(',').map((part: string) => {
        const trimmed = part.trim()
        const spaceIdx = trimmed.search(/\s/)
        const rawUrl = spaceIdx >= 0 ? trimmed.slice(0, spaceIdx) : trimmed
        const descriptor = spaceIdx >= 0 ? trimmed.slice(spaceIdx) : ''
        const resolved = tryResolve(rawUrl, base)
        if (!resolved) return part
        const targetPath = urlToPath.get(resolved)
        if (!targetPath) return part
        return relPath(pageZipPath, targetPath) + descriptor
      }).join(', ')
      return prefix + rewritten + suffix
    }
  )

  // 内联 style 属性与 <style> 块中的 url(...)（含 &quot; 实体），重写为本地相对路径
  html = html.replace(
    /url\(\s*(&quot;|&#0*34;|["'])?([^)]*?)\1?\s*\)/gi,
    (match, quote, rawUrl) => {
      const cleaned = decodeEntities((rawUrl ?? '').trim())
      if (!cleaned) return match
      const resolved = tryResolve(cleaned, base)
      if (!resolved) return match
      const targetPath = urlToPath.get(resolved)
      if (!targetPath) return match
      const q = quote ?? ''
      return `url(${q}${relPath(pageZipPath, targetPath)}${q})`
    }
  )

  return new TextEncoder().encode(html)
}

// 解码 HTML 实体（内联 style 中的 &quot; 等），供 url() 重写使用
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&')
}

// 重写 CSS 中 url() 的同源 URL 为相对路径
function rewriteCss(data: Uint8Array, cssUrl: string, urlToPath: Map<string, string>): Uint8Array {
  let css = new TextDecoder().decode(data)
  const cssZipPath = urlToPath.get(cssUrl)!
  const base = new URL(cssUrl)

  css = css.replace(
    /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g,
    (match, quote, rawUrl) => {
      const resolved = tryResolve(rawUrl.trim(), base)
      if (!resolved) return match
      const targetPath = urlToPath.get(resolved)
      if (!targetPath) return match
      return `url(${quote}${relPath(cssZipPath, targetPath)}${quote})`
    }
  )

  return new TextEncoder().encode(css)
}

// 重写阶段不限同源：只要该 URL 已被下载（在 urlToPath 中）即重写为本地相对路径
function tryResolve(rawUrl: string, base: URL): string | null {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('javascript:')) return null
  try {
    const resolved = new URL(rawUrl, base)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    resolved.hash = ''
    return resolved.href
  } catch {
    return null
  }
}
