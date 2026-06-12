import { describe, it, expect, vi, afterEach } from 'vitest'
import { unzipSync } from 'fflate'
import { FakeBucket, asBucket } from './helpers'
import { discoverPages, collectMissingAssets, fetchAssetBatch, zipStaging } from '../src/render/steps'
import { stageObject } from '../src/render/staging'

afterEach(() => { vi.unstubAllGlobals() })

// 按 URL 精确匹配的 fetch 替身，未命中返回 404
function stubFetch(routes: Record<string, { body: string | Uint8Array; ct: string }>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const hit = routes[url]
    if (!hit) return new Response('not found', { status: 404 })
    return new Response(hit.body as BodyInit, { status: 200, headers: { 'Content-Type': hit.ct } })
  }))
}

describe('discoverPages', () => {
  it('入口 + sitemap 合并去重，过滤跨域', async () => {
    const sitemap = `<?xml version="1.0"?><urlset>
      <url><loc>https://a.com/</loc></url>
      <url><loc>https://a.com/about</loc></url>
      <url><loc>https://b.com/external</loc></url>
    </urlset>`
    stubFetch({ 'https://a.com/sitemap.xml': { body: sitemap, ct: 'application/xml' } })
    const pages = await discoverPages('https://a.com/#top', 10)
    expect(pages).toContain('https://a.com/')
    expect(pages).toContain('https://a.com/about')
    expect(pages.every(p => p.startsWith('https://a.com'))).toBe(true)
    expect(pages).toHaveLength(2)
  })
  it('maxPages 截断；无 sitemap 时只有入口', async () => {
    stubFetch({})
    expect(await discoverPages('https://a.com/', 1)).toEqual(['https://a.com/'])
  })
})

describe('collectMissingAssets', () => {
  async function seed(bucket: FakeBucket) {
    const b = asBucket(bucket)
    await stageObject(b, 't1', 'https://a.com/', new TextEncoder().encode(
      '<script src="/app.js"></script><img src="/missing.png"><link rel="stylesheet" href="/s.css">',
    ), 'text/html')
    await stageObject(b, 't1', 'https://a.com/app.js', new TextEncoder().encode('1'), 'text/javascript')
    await stageObject(b, 't1', 'https://a.com/s.css', new TextEncoder().encode(
      'body{background:url(/img/bg.png)}',
    ), 'text/css')
  }
  it('找出 HTML/CSS 引用但未暂存的资源', async () => {
    const bucket = new FakeBucket()
    await seed(bucket)
    const missing = await collectMissingAssets(asBucket(bucket), 't1', 100)
    expect(missing.sort()).toEqual(['https://a.com/img/bg.png', 'https://a.com/missing.png'])
  })
  it('cap 限制数量', async () => {
    const bucket = new FakeBucket()
    await seed(bucket)
    expect(await collectMissingAssets(asBucket(bucket), 't1', 1)).toHaveLength(1)
    expect(await collectMissingAssets(asBucket(bucket), 't1', 0)).toHaveLength(0)
  })
})

describe('fetchAssetBatch', () => {
  it('补抓静态资源，按响应 Content-Type 过滤，404 跳过', async () => {
    stubFetch({
      'https://a.com/img/bg.png': { body: new Uint8Array([1, 2, 3]), ct: 'image/png' },
      'https://a.com/api/data': { body: '{}', ct: 'application/json' },
    })
    const bucket = new FakeBucket()
    const r = await fetchAssetBatch(asBucket(bucket), 't1', [
      'https://a.com/img/bg.png',
      'https://a.com/api/data',
      'https://a.com/gone.css',
    ], 1024, 10)
    expect(r.objectsAdded).toBe(1)
    expect(r.bytesAdded).toBe(3)
    expect(r.budgetExhausted).toBe(false)
    expect((await bucket.list({ prefix: 'render/t1/raw/' })).objects).toHaveLength(1)
  })
  it('字节预算耗尽时置位且不写入', async () => {
    stubFetch({ 'https://a.com/big.png': { body: new Uint8Array(100), ct: 'image/png' } })
    const r = await fetchAssetBatch(asBucket(new FakeBucket()), 't1', ['https://a.com/big.png'], 50, 10)
    expect(r.objectsAdded).toBe(0)
    expect(r.budgetExhausted).toBe(true)
  })
})

describe('zipStaging', () => {
  it('重写链接并流式打包，跨域进 _external', async () => {
    const bucket = new FakeBucket()
    const b = asBucket(bucket)
    await stageObject(b, 't1', 'https://a.com/', new TextEncoder().encode(
      '<link href="https://a.com/css/main.css"><script src="https://cdn.b.com/lib.js"></script>',
    ), 'text/html')
    await stageObject(b, 't1', 'https://a.com/css/main.css', new TextEncoder().encode(
      'body{background:url(/img/bg.png)}',
    ), 'text/css')
    await stageObject(b, 't1', 'https://a.com/img/bg.png', new Uint8Array([9]), 'image/png')
    await stageObject(b, 't1', 'https://cdn.b.com/lib.js', new TextEncoder().encode('x'), 'text/javascript')

    const r = await zipStaging(b, 't1', 'https://a.com/', 'crawls/render-abc.zip')
    expect(r.files).toBe(4)
    const zipObj = bucket.store.get('crawls/render-abc.zip')!
    expect(r.zipBytes).toBe(zipObj.data.byteLength)
    const out = unzipSync(zipObj.data)
    expect(Object.keys(out).sort()).toEqual(['_external/cdn.b.com/lib.js', 'css/main.css', 'img/bg.png', 'index.html'])
    const html = new TextDecoder().decode(out['index.html'])
    expect(html).toContain('href="css/main.css"')
    expect(html).toContain('src="_external/cdn.b.com/lib.js"')
    const css = new TextDecoder().decode(out['css/main.css'])
    expect(css).toContain('url(../img/bg.png)')
  })

  it('R2 get 返回 null 时抛出而非静默跳过', async () => {
    const bucket = new FakeBucket()
    const b = asBucket(bucket)
    await stageObject(b, 't2', 'https://a.com/', new TextEncoder().encode('<h1>hi</h1>'), 'text/html')

    // 模拟 list 可见但 get 缺失的不一致
    const broken = Object.create(bucket) as FakeBucket
    broken.get = async () => null
    const brokenB = asBucket(broken)
    await expect(zipStaging(brokenB, 't2', 'https://a.com/', 'crawls/broken.zip'))
      .rejects.toThrow(/staged object missing/)
  })
})
