import { parse } from 'node-html-parser'

export interface ParsedAssets {
  links: string[]   // same-origin HTML page links to follow
  assets: string[]  // static assets to download (CSS, JS, images, etc.)
}

export function parseAssets(html: string, baseUrl: string): ParsedAssets {
  const base = new URL(baseUrl)
  const root = parse(html)
  const links: string[] = []
  const assets: string[] = []

  // 页面链接：仅限同源（避免无限扩散到外站）
  function resolveLink(rawHref: string): string | null {
    if (!rawHref || rawHref.startsWith('data:') || rawHref.startsWith('blob:')) return null
    try {
      const resolved = new URL(rawHref, base)
      if (resolved.origin !== base.origin) return null
      resolved.hash = ''
      return resolved.href
    } catch {
      return null
    }
  }

  // 静态资源：允许跨域（CDN 子域、第三方图片/JS/字体），仅限 http(s)
  function resolveAsset(rawHref: string): string | null {
    if (!rawHref || rawHref.startsWith('data:') || rawHref.startsWith('blob:')) return null
    try {
      const resolved = new URL(rawHref, base)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
      resolved.hash = ''
      return resolved.href
    } catch {
      return null
    }
  }

  // <a href> — 页面链接
  for (const el of root.querySelectorAll('a[href]')) {
    const href = el.getAttribute('href')
    if (!href || href.startsWith('mailto:') || href.startsWith('javascript:')) continue
    const url = resolveLink(href)
    if (url) links.push(url)
  }

  // 静态资源：常规 src/href 属性
  const attrSelectors: Array<[string, string]> = [
    ['link[href]', 'href'],
    ['script[src]', 'src'],
    ['img[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src'],
    ['video[poster]', 'poster'],
    ['audio[src]', 'src'],
    ['input[src]', 'src'],
    ['embed[src]', 'src'],
    ['object[data]', 'data'],
    ['link[rel=preload][href]', 'href'],
  ]

  for (const [selector, attr] of attrSelectors) {
    for (const el of root.querySelectorAll(selector)) {
      const val = el.getAttribute(attr)
      if (!val) continue
      const url = resolveAsset(val)
      if (url) assets.push(url)
    }
  }

  // srcset 属性（img, source）
  for (const el of root.querySelectorAll('img[srcset], source[srcset]')) {
    const srcset = el.getAttribute('srcset')
    if (!srcset) continue
    for (const part of srcset.split(',')) {
      const candidate = part.trim().split(/\s+/)[0]
      if (!candidate) continue
      const url = resolveAsset(candidate)
      if (url) assets.push(url)
    }
  }

  // 懒加载属性
  const lazyAttrs = ['data-src', 'data-lazy', 'data-original', 'data-url', 'data-image']
  for (const el of root.querySelectorAll('img, source')) {
    for (const attr of lazyAttrs) {
      const val = el.getAttribute(attr)
      if (!val) continue
      const url = resolveAsset(val)
      if (url) assets.push(url)
    }
  }

  return { links: [...new Set(links)], assets: [...new Set(assets)] }
}

// 从 CSS 文本中提取 url(...) 引用的资源
export function parseCssUrls(css: string, baseUrl: string): string[] {
  const base = new URL(baseUrl)
  const urls: string[] = []
  const re = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    const raw = m[2].trim()
    if (!raw || raw.startsWith('data:')) continue
    try {
      const resolved = new URL(raw, base)
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue
      resolved.hash = ''
      urls.push(resolved.href)
    } catch {
      // ignore
    }
  }
  return [...new Set(urls)]
}
