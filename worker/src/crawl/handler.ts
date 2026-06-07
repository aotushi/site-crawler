import type { Env } from '../index'
import { verifyToken, extractBearer } from '../auth/jwt'
import { crawlSite } from './engine'
import { createCrawlRecord, updateCrawlRecord, checkAndIncrementIpUsage, getCrawlCache, setCrawlCache } from '../db/queries'

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// 静态链路缓存键：用 static: 前缀与 JS 链路区分
async function hashStaticUrl(url: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('static:' + url))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export async function handleCrawl(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = extractBearer(request)
  const user = token ? await verifyToken(token, env.JWT_SECRET) : null

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { url } = body
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 未登录用户：每 IP 每天限 3 次静态爬取
  if (!user) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const allowed = await checkAndIncrementIpUsage(env.DB, ip, 'static', 3)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again tomorrow.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const recordId = user ? crypto.randomUUID() : null
  if (user && recordId) {
    await createCrawlRecord(env.DB, {
      id: recordId,
      user_id: user.sub,
      url,
      status: 'running',
      file_count: null,
      zip_size: null,
      created_at: Date.now(),
      completed_at: null,
    })
  }

  const sseHeaders = {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const enc = new TextEncoder()

  // 在后台执行爬取，通过流推送进度
  ;(async () => {
    try {
      const urlHash = await hashStaticUrl(url)

      // 缓存命中：直接返回 R2 下载链接
      const cached = await getCrawlCache(env.DB, urlHash)
      if (cached) {
        await writer.write(enc.encode(sseEvent('done', {
          fileCount: cached.file_count,
          totalBytes: cached.zip_size,
          jsWarning: false,
          downloadUrl: `${env.R2_PUBLIC_BASE}/${cached.r2_key}`,
        })))
        return
      }

      const result = await crawlSite(url, (progress) => {
        writer.write(enc.encode(sseEvent('progress', progress)))
      })

      // 上传 ZIP 到 R2（#5：不再走 base64+SSE，规避内存峰值）
      const r2Key = `crawls/static-${urlHash}.zip`
      await env.CRAWL_BUCKET.put(r2Key, result.zip, {
        httpMetadata: { contentType: 'application/zip' },
      })
      await setCrawlCache(env.DB, {
        url_hash: urlHash,
        url,
        r2_key: r2Key,
        file_count: result.fileCount,
        zip_size: result.totalBytes,
        created_at: Date.now(),
      })

      if (user && recordId) {
        await updateCrawlRecord(env.DB, recordId, {
          status: 'done',
          file_count: result.fileCount,
          zip_size: result.totalBytes,
          completed_at: Date.now(),
        })
      }

      await writer.write(enc.encode(sseEvent('done', {
        fileCount: result.fileCount,
        totalBytes: result.totalBytes,
        jsWarning: result.jsWarning,
        downloadUrl: `${env.R2_PUBLIC_BASE}/${r2Key}`,
      })))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Crawl failed'
      if (user && recordId) {
        await updateCrawlRecord(env.DB, recordId, { status: 'failed', completed_at: Date.now() })
      }
      await writer.write(enc.encode(sseEvent('error', { error: msg })))
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: sseHeaders })
}
