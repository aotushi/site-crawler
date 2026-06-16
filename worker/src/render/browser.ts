import puppeteer, { BrowserWorker } from '@cloudflare/puppeteer'
import type { Env } from '../index'
import { renderConfig } from './config'
import { stageObject, isStaticAssetResponse, ASSET_MAX_BYTES } from './staging'
import { normalizeLinks } from '../crawl/shared'

// 步骤返回值上限 1MiB：10 页/批 × 200 链接 × ~200 字节 URL ≈ 400KB；另设单条 URL 长度上限兜底超长 URL
const MAX_LINKS_PER_PAGE = 200
const MAX_URL_LEN = 2048 // 单条 URL 长度上限，超长链接对 BFS 无意义且会撑大 step 返回值

export interface RenderBatchInput {
  urls: string[]
  startOrigin: string
  byteBudgetLeft: number    // 本批可新增字节数（全任务剩余）
  objectBudgetLeft: number  // 本批可新增暂存对象数（全任务剩余）
}

export interface PageRenderResult {
  url: string
  ok: boolean
  links: string[]  // 渲染后 DOM 中的同源链接（已规范化）
}

export interface RenderBatchResult {
  pages: PageRenderResult[]
  bytesAdded: number
  objectsAdded: number
  secondsUsed: number       // 浏览器墙钟秒数，计入月度预算
  budgetExhausted: boolean  // 字节/对象额度耗尽，外层应停止扩张
}

// 渲染一批页面：每页 goto → 截获响应暂存 → 取渲染后 DOM 与链接 → 暂存 DOM
export async function renderBatch(env: Env, taskId: string, input: RenderBatchInput): Promise<RenderBatchResult> {
  const cfg = renderConfig(env)
  const browser = await puppeteer.launch(env.BROWSER as unknown as BrowserWorker)
  const t0 = Date.now()
  const pages: PageRenderResult[] = []
  let bytesAdded = 0
  let objectsAdded = 0
  let budgetExhausted = false
  const stagedUrls = new Set<string>() // 批内去重；跨批靠 sha16 同键覆盖天然幂等

  try {
    for (const url of input.urls) {
      const page = await browser.newPage()
      const capturePromises: Promise<void>[] = []

      page.on('response', (res) => {
        capturePromises.push((async () => {
          try {
            const status = res.status()
            if (status < 200 || status >= 300) return
            const resUrl = res.url()
            const ct = ((res.headers()['content-type'] ?? '').split(';')[0] ?? '').trim()
            if (!isStaticAssetResponse(resUrl, ct)) return
            if (stagedUrls.has(resUrl)) return
            // 在 await 前占位，防止同一 URL 的并发响应重复入库
            stagedUrls.add(resUrl)
            // 单资源体积预检：Content-Length 超限直接跳过，不缓冲（防大媒体在 128MB isolate 内 OOM）
            const contentLength = Number(res.headers()['content-length'])
            if (Number.isFinite(contentLength) && contentLength > ASSET_MAX_BYTES) return
            const body = await res.buffer()
            // Content-Length 缺失（chunked）时只能先缓冲，超限则丢弃不入暂存
            if (body.byteLength > ASSET_MAX_BYTES) return
            // check 与累加之间无 await，单线程下原子，不会超额
            if (bytesAdded + body.byteLength > input.byteBudgetLeft || objectsAdded + 1 > input.objectBudgetLeft) {
              budgetExhausted = true
              return
            }
            bytesAdded += body.byteLength
            objectsAdded += 1
            await stageObject(env.CRAWL_BUCKET, taskId, resUrl, new Uint8Array(body), ct)
          } catch { /* 单个资源截获失败不影响页面 */ }
        })())
      })

      let ok = true
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: cfg.pageTimeoutMs })
      } catch {
        ok = false // 超时等：仍尝试打捞已渲染的部分 DOM
      }

      let links: string[] = []
      let html = ''
      try {
        html = await page.content()
        // 字符串形式 evaluate，绕过 worker tsconfig 无 DOM lib 的类型限制
        const rawLinks = (await page.evaluate(
          `Array.from(document.querySelectorAll('a[href]')).map(a => a.href)`,
        )) as string[]
        // 截断到 MAX_LINKS_PER_PAGE：超出部分对 BFS 无意义，且控制 Workflow step 返回值体积（≤1MiB）
        links = normalizeLinks(rawLinks, input.startOrigin)
          .filter(u => u.length <= MAX_URL_LEN)
          .slice(0, MAX_LINKS_PER_PAGE)
        if (!ok && html.length > 0) ok = true // 超时但已有内容 → 降级收录
      } catch {
        ok = false
      }

      if (html.length > 0) {
        const htmlBytes = new TextEncoder().encode(html)
        if (bytesAdded + htmlBytes.byteLength > input.byteBudgetLeft || objectsAdded + 1 > input.objectBudgetLeft) {
          budgetExhausted = true
        } else {
          bytesAdded += htmlBytes.byteLength
          objectsAdded += 1
          await stageObject(env.CRAWL_BUCKET, taskId, url, htmlBytes, 'text/html')
        }
      } else {
        ok = false
      }

      // 超时路径下响应事件可能在 allSettled 之后继续到达，先摘除监听器再等待
      page.removeAllListeners('response')
      await Promise.allSettled(capturePromises)
      await page.close()
      pages.push({ url, ok, links })
      if (budgetExhausted) break
    }
  } finally {
    // close 自身的异常不应掩盖原始错误
    await browser.close().catch(() => {})
  }

  return { pages, bytesAdded, objectsAdded, secondsUsed: (Date.now() - t0) / 1000, budgetExhausted }
}
