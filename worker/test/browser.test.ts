import { describe, it, expect, vi } from 'vitest'
import { FakeBucket, asBucket } from './helpers'
import { ASSET_MAX_BYTES, stagingPrefix } from '../src/render/staging'
import { renderBatch } from '../src/render/browser'
import type { Env } from '../src/index'

// 用假 puppeteer 驱动 renderBatch 的响应截获回调，验证单资源体积上限逻辑
let currentBrowser: unknown
vi.mock('@cloudflare/puppeteer', () => ({
  default: { launch: async () => currentBrowser },
}))

// 截获回调用到的响应替身：status/url/headers/buffer
interface FakeResponse {
  status: () => number
  url: () => string
  headers: () => Record<string, string>
  buffer: ReturnType<typeof vi.fn>
}

function fakeResponse(url: string, headers: Record<string, string>, body: Uint8Array): FakeResponse {
  return {
    status: () => 200,
    url: () => url,
    headers: () => headers,
    buffer: vi.fn(async () => body),
  }
}

// 假 page：goto 时把预设响应逐个推给监听器，content 返回固定 HTML
function fakePage(responses: FakeResponse[], links = [] as string[]) {
  const listeners: ((res: FakeResponse) => void)[] = []
  return {
    on: (_event: string, cb: (res: FakeResponse) => void) => { listeners.push(cb) },
    goto: async () => { for (const r of responses) for (const cb of [...listeners]) cb(r) },
    content: async () => '<html><body>hi</body></html>',
    evaluate: async () => links,
    removeAllListeners: () => { listeners.length = 0 },
    close: async () => {},
  }
}

function setupBrowser(responses: FakeResponse[], links = [] as string[]) {
  currentBrowser = {
    newPage: async () => fakePage(responses, links),
    close: async () => {},
  }
}

const fakeEnv = (bucket: FakeBucket) =>
  ({ BROWSER: {}, CRAWL_BUCKET: asBucket(bucket) }) as unknown as Env

const input = {
  urls: ['https://a.com/'],
  startOrigin: 'https://a.com',
  byteBudgetLeft: Number.MAX_SAFE_INTEGER,
  objectBudgetLeft: 1000,
}

describe('renderBatch 响应截获的单资源体积上限', () => {
  it('Content-Length 超限的资源直接跳过，不调用 buffer（防整段缓冲 OOM）', async () => {
    const huge = fakeResponse('https://a.com/huge.mp4', {
      'content-type': 'video/mp4',
      'content-length': String(ASSET_MAX_BYTES + 1),
    }, new Uint8Array([1]))
    const small = fakeResponse('https://a.com/app.js', {
      'content-type': 'text/javascript',
      'content-length': '3',
    }, new Uint8Array([1, 2, 3]))
    setupBrowser([huge, small])
    const bucket = new FakeBucket()

    const r = await renderBatch(fakeEnv(bucket), 't1', input)

    expect(huge.buffer).not.toHaveBeenCalled()
    expect(small.buffer).toHaveBeenCalled()
    // 暂存中只有小资源 + 页面 HTML 两个对象
    const staged = (await bucket.list({ prefix: stagingPrefix('t1') })).objects
    expect(staged).toHaveLength(2)
    expect(r.pages[0].ok).toBe(true)
  })

  it('超长链接被丢弃，不撑大 step 返回值', async () => {
    const longUrl = 'https://a.com/' + 'x'.repeat(3000)
    setupBrowser([], ['https://a.com/ok', longUrl])
    const r = await renderBatch(fakeEnv(new FakeBucket()), 't1', input)
    expect(r.pages[0].links).toContain('https://a.com/ok')
    expect(r.pages[0].links).not.toContain(longUrl)
  })

  it('无 Content-Length（chunked）时先缓冲，超限则丢弃不入暂存', async () => {
    const hugeChunked = fakeResponse('https://a.com/blob.bin.mp4', {
      'content-type': 'video/mp4',
    }, new Uint8Array(ASSET_MAX_BYTES + 1))
    setupBrowser([hugeChunked])
    const bucket = new FakeBucket()

    const r = await renderBatch(fakeEnv(bucket), 't1', input)

    expect(hugeChunked.buffer).toHaveBeenCalled()
    // 只有页面 HTML 入暂存，超限资源被丢弃且不计入 bytesAdded
    const staged = (await bucket.list({ prefix: stagingPrefix('t1') })).objects
    expect(staged).toHaveLength(1)
    expect(r.bytesAdded).toBeLessThan(ASSET_MAX_BYTES)
    expect(r.budgetExhausted).toBe(false)
  })
})
