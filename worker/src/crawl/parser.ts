import { parse } from 'node-html-parser'
import { decodeEntities } from './shared'

export interface ParsedAssets {
  links: string[]   // same-origin HTML page links to follow
  assets: string[]  // static assets to download (CSS, JS, images, etc.)
}

// 从任意字符串（如 data-settings JSON）里兜底抽取直链媒体/资源 URL
const MEDIA_URL_RE = /https?:\/\/[^\s"'()\\]+?\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|mp4|webm|ogv|ogg|mov|m4v|woff2?|ttf|otf|eot|css|js)(?:\?[^\s"'()\\]*)?/gi

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

  // 内联 style 属性里的 background-image / url(...)（命中 Elementor 幻灯片背景等）
  for (const el of root.querySelectorAll('[style]')) {
    const style = el.getAttribute('style')
    if (!style || !style.includes('url(')) continue
    for (const u of parseCssUrls(decodeEntities(style), baseUrl)) assets.push(u)
  }

  // <style> 标签内嵌 CSS 的 url(...)
  for (const el of root.querySelectorAll('style')) {
    const css = el.text
    if (!css || !css.includes('url(')) continue
    for (const u of parseCssUrls(decodeEntities(css), baseUrl)) assets.push(u)
  }

  // 兜底：扫描所有元素的 data-* 属性（如 Elementor data-settings JSON、data-bg 等）
  for (const el of root.querySelectorAll('*')) {
    const attrs = el.attributes
    for (const name in attrs) {
      if (!name.startsWith('data-')) continue
      const val = attrs[name]
      if (!val) continue
      const decoded = decodeEntities(val)
      if (decoded.includes('url(')) {
        for (const u of parseCssUrls(decoded, baseUrl)) assets.push(u)
      }
      const matches = decoded.match(MEDIA_URL_RE)
      if (matches) {
        for (const m of matches) {
          const url = resolveAsset(m)
          if (url) assets.push(url)
        }
      }
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
