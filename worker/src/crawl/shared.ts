// V1 静态链路与 V2 渲染链路共用的纯函数（自 engine.ts/parser.ts 抽取）

export const STATIC_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.map',
  '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.ogg', '.pdf', '.zip',
])

// sha256 hex 前 16 位，统一的缓存键/暂存键哈希
export async function sha16(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

// URL → zip 内相对路径，无扩展名页面存为 path/index.html
// 跨域资源放到 _external/<host>/ 下，避免与同源资源路径碰撞
export function urlToZipPath(url: string, startOrigin: string): string {
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
export function relPath(fromPath: string, toPath: string): string {
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

// 解码 HTML 实体（内联 style 中的 &quot; 等），供 url() 解析/重写使用
export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0*34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&amp;/g, '&')
}

// 重写阶段不限同源：只要该 URL 已被下载（在 urlToPath 中）即重写为本地相对路径
export function tryResolve(rawUrl: string, base: URL): string | null {
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

// 页面链接规范化：仅保留同源 http(s)，去 hash 去重（渲染链路 BFS 用）
export function normalizeLinks(rawLinks: string[], startOrigin: string): string[] {
  const out = new Set<string>()
  for (const raw of rawLinks) {
    try {
      const u = new URL(raw)
      if (u.origin !== startOrigin) continue
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      u.hash = ''
      out.add(u.href)
    } catch { /* 忽略无效链接 */ }
  }
  return [...out]
}

// 重写 HTML 中的绝对 URL 为相对路径
export function rewriteHtml(data: Uint8Array, pageUrl: string, urlToPath: Map<string, string>): Uint8Array {
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

// 重写 CSS 中 url() 的已下载 URL 为相对路径
export function rewriteCss(data: Uint8Array, cssUrl: string, urlToPath: Map<string, string>): Uint8Array {
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

// 带浏览器请求头抓取单个 URL；非 2xx/网络错误返回 null
export async function fetchUrl(
  url: string,
  opts?: { signal?: AbortSignal; maxBytes?: number },
): Promise<{ data: Uint8Array; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      // 使用真实浏览器请求头，避免 SiteCrawlerBot 之类自曝身份被 WAF 直接拦截
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: opts?.signal,
    })
    if (!res.ok) return null
    // 仅探测场景启用：按 Content-Length 拒绝超大响应，避免整段缓冲 OOM
    if (opts?.maxBytes !== undefined) {
      const cl = Number(res.headers.get('Content-Length') ?? 0)
      if (cl > opts.maxBytes) {
        res.body?.cancel()
        return null
      }
    }
    const buf = await res.arrayBuffer()
    const data = new Uint8Array(buf)
    const contentType = res.headers.get('Content-Type') ?? ''
    return { data, contentType }
  } catch {
    return null
  }
}

// 拉取站点 sitemap，返回同源页面 URL 列表（支持 sitemapindex 两层）
export async function collectSitemapUrls(origin: string): Promise<string[]> {
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
