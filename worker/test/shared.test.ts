import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import {
  sha16, urlToZipPath, relPath, decodeEntities, tryResolve,
  rewriteHtml, rewriteCss, normalizeLinks, fetchUrl, fetchUrlWithTimeout,
} from '../src/crawl/shared'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (d: Uint8Array) => new TextDecoder().decode(d)

describe('sha16', () => {
  it('返回 sha256 hex 前 16 位', async () => {
    const expected = createHash('sha256').update('static:https://example.com').digest('hex').slice(0, 16)
    expect(await sha16('static:https://example.com')).toBe(expected)
  })
})

describe('urlToZipPath', () => {
  const origin = 'https://a.com'
  it('根路径与无扩展名路径落为 index.html', () => {
    expect(urlToZipPath('https://a.com/', origin)).toBe('index.html')
    expect(urlToZipPath('https://a.com/about', origin)).toBe('about/index.html')
    expect(urlToZipPath('https://a.com/blog/', origin)).toBe('blog/index.html')
  })
  it('静态扩展名保留原路径', () => {
    expect(urlToZipPath('https://a.com/css/main.css', origin)).toBe('css/main.css')
  })
  it('跨域资源置于 _external/<host>/ 下', () => {
    expect(urlToZipPath('https://cdn.b.com/img.png', origin)).toBe('_external/cdn.b.com/img.png')
  })
  it('折叠多个前导斜杠', () => {
    expect(urlToZipPath('https://a.com//foo', origin)).toBe('foo/index.html')
    expect(urlToZipPath('https://a.com///foo', origin)).toBe('foo/index.html')
  })
})

describe('relPath', () => {
  it('同级与子目录', () => {
    expect(relPath('index.html', 'css/main.css')).toBe('css/main.css')
    expect(relPath('index.html', 'index.html')).toBe('index.html')
  })
  it('需要向上回溯', () => {
    expect(relPath('blog/index.html', 'css/main.css')).toBe('../css/main.css')
    expect(relPath('a/b/c.html', 'a/d.png')).toBe('../d.png')
  })
})

describe('decodeEntities / tryResolve', () => {
  it('解码常见实体', () => {
    expect(decodeEntities('&quot;x&quot;&amp;&apos;y&apos;')).toBe('"x"&\'y\'')
  })
  it('解码数字字符引用（十进制）', () => {
    expect(decodeEntities('&#34;')).toBe('"')
    expect(decodeEntities('&#39;')).toBe("'")
  })
  it('解码数字字符引用（带前导零）', () => {
    expect(decodeEntities('&#034;')).toBe('"')
    expect(decodeEntities('&#039;')).toBe("'")
  })
  it('tryResolve 过滤非 http 与无效 URL，去 hash', () => {
    const base = new URL('https://a.com/page/')
    expect(tryResolve('../x.png#frag', base)).toBe('https://a.com/x.png')
    expect(tryResolve('data:image/png;base64,xx', base)).toBeNull()
    expect(tryResolve('javascript:void(0)', base)).toBeNull()
  })
  it('tryResolve 过滤 blob: URL', () => {
    const base = new URL('https://a.com/page/')
    expect(tryResolve('blob:https://a.com/abc-123', base)).toBeNull()
  })
})

describe('normalizeLinks', () => {
  it('仅保留同源，去 hash 去重', () => {
    expect(normalizeLinks([
      'https://a.com/about#top',
      'https://a.com/about',
      'https://b.com/x',
      'not a url',
    ], 'https://a.com')).toEqual(['https://a.com/about'])
  })
})

describe('fetchUrl maxBytes', () => {
  afterEach(() => vi.restoreAllMocks())

  it('Content-Length 超限时返回 null 且取消响应体', async () => {
    const cancelFn = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => h === 'Content-Length' ? '5000000' : null },
      body: { cancel: cancelFn },
      arrayBuffer: vi.fn(),
    }))
    const result = await fetchUrl('https://example.com', { maxBytes: 4 * 1024 * 1024 })
    expect(result).toBeNull()
    expect(cancelFn).toHaveBeenCalled()
  })

  it('Content-Length 未超限时正常返回数据', async () => {
    const buf = new ArrayBuffer(8)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => h === 'Content-Length' ? '8' : 'text/html' },
      body: { cancel: vi.fn() },
      arrayBuffer: vi.fn().mockResolvedValue(buf),
    }))
    const result = await fetchUrl('https://example.com', { maxBytes: 4 * 1024 * 1024 })
    expect(result).not.toBeNull()
    expect(result?.data).toBeInstanceOf(Uint8Array)
  })
})

describe('fetchUrlWithTimeout', () => {
  afterEach(() => vi.restoreAllMocks())

  it('超时触发 abort → 返回 null', async () => {
    // fetch 永不 resolve，只在 signal abort 时 reject（模拟挂死连接）
    vi.stubGlobal('fetch', vi.fn((_u: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })))
    const result = await fetchUrlWithTimeout('https://slow.example', 10)
    expect(result).toBeNull()
  })

  it('超时前正常响应照常返回数据', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('ok', { status: 200, headers: { 'Content-Type': 'text/html' } })))
    const result = await fetchUrlWithTimeout('https://fast.example', 1000)
    expect(result?.contentType).toContain('text/html')
  })
})

describe('rewriteHtml / rewriteCss', () => {
  const urlToPath = new Map([
    ['https://a.com/', 'index.html'],
    ['https://a.com/css/main.css', 'css/main.css'],
    ['https://a.com/img/bg.png', 'img/bg.png'],
    ['https://a.com/img/bg@2x.png', 'img/bg@2x.png'],
    ['https://a.com/about/', 'about/index.html'],
  ])
  it('重写 href 与内联 url() 为相对路径', () => {
    const html = '<link href="/css/main.css"><a href="https://a.com/about/">x</a><div style="background:url(&quot;/img/bg.png&quot;)"></div>'
    const out = dec(rewriteHtml(enc(html), 'https://a.com/', urlToPath))
    expect(out).toContain('href="css/main.css"')
    expect(out).toContain('href="about/index.html"')
    expect(out).toContain('url(&quot;img/bg.png&quot;)')
  })
  it('CSS url() 相对自身路径重写', () => {
    const css = 'body{background:url(/img/bg.png)}'
    const out = dec(rewriteCss(enc(css), 'https://a.com/css/main.css', urlToPath))
    expect(out).toContain('url(../img/bg.png)')
  })
  it('重写 srcset 中多个候选 URL（含描述符）', () => {
    const html = '<img srcset="https://a.com/img/bg.png 1x, https://a.com/img/bg@2x.png 2x">'
    const out = dec(rewriteHtml(enc(html), 'https://a.com/', urlToPath))
    expect(out).toContain('img/bg.png 1x')
    expect(out).toContain('img/bg@2x.png 2x')
    expect(out).not.toContain('https://a.com/img/bg.png')
    expect(out).not.toContain('https://a.com/img/bg@2x.png')
  })
  it('未下载的 URL 保持原样', () => {
    const html = '<img src="https://other.com/x.png">'
    const out = dec(rewriteHtml(enc(html), 'https://a.com/', urlToPath))
    expect(out).toContain('https://other.com/x.png')
  })
})
