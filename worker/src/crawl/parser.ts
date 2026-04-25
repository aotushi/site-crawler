import { parse } from 'node-html-parser'

export interface ParsedAssets {
  links: string[]    // same-origin HTML page links to follow
  assets: string[]   // static assets to download (CSS, JS, images, etc.)
}

export function parseAssets(html: string, baseUrl: string): ParsedAssets {
  const base = new URL(baseUrl)
  const root = parse(html)
  const links: string[] = []
  const assets: string[] = []

  function resolve(rawHref: string): string | null {
    try {
      const resolved = new URL(rawHref, base)
      if (resolved.origin !== base.origin) return null
      return resolved.href
    } catch {
      return null
    }
  }

  for (const el of root.querySelectorAll('a[href]')) {
    const href = el.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:')) continue
    const url = resolve(href)
    if (url) links.push(url)
  }

  const assetSelectors: Array<[string, string]> = [
    ['link[href]', 'href'],
    ['script[src]', 'src'],
    ['img[src]', 'src'],
    ['source[src]', 'src'],
    ['video[src]', 'src'],
    ['audio[src]', 'src'],
  ]

  for (const [selector, attr] of assetSelectors) {
    for (const el of root.querySelectorAll(selector)) {
      const val = el.getAttribute(attr)
      if (!val) continue
      const url = resolve(val)
      if (url) assets.push(url)
    }
  }

  return { links: [...new Set(links)], assets: [...new Set(assets)] }
}
