import type { Env } from '../index'
import { verifyToken, extractBearer } from '../auth/jwt'
import { crawlSite } from './engine'
import { isJsRendered } from './detector'
import { fetchUrl, sha16 } from './shared'
import { renderConfig } from '../render/config'
import { checkBudget } from '../render/quota'
import {
  createCrawlRecord, updateCrawlRecord, checkAndIncrementIpUsage, decrementIpUsage,
  getCrawlCache, setCrawlCache, createRenderTask, updateRenderTask,
} from '../db/queries'

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function handleCrawl(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = extractBearer(request)
  const user = token ? await verifyToken(token, env.JWT_SECRET) : null
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'

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

  // 未登录用户：每 IP 每天限 3 次静态爬取（渲染链路另有 render 配额，在分流处检查）
  if (!user) {
    const allowed = await checkAndIncrementIpUsage(env.DB, ip, 'static', 3)
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again tomorrow.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
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
    // 提升到 try 外：catch 里要用它标记失败（仅静态链路会赋值）
    let recordId: string | null = null
    let renderTaskId: string | null = null
    let renderQuotaCharged = false  // 匿名渲染额度是否已预扣（用于失败退还）
    let renderWorkflowStarted = false  // 工作流是否已成功创建；已启动则由其自管生命周期，不退额度
    try {
      const urlHash = await sha16('static:' + url)

      // 静态缓存命中：直接返回 R2 下载链接
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

      // ---- V2 分流：入口 HTML 探测 SPA ----
      // 探测加 10s 超时与 4MB 上限，防止挂起/超大响应拖死 SSE 流
      const probeAc = new AbortController()
      const probeTimer = setTimeout(() => probeAc.abort(), 10_000)
      const entry = await fetchUrl(url, { signal: probeAc.signal, maxBytes: 4 * 1024 * 1024 }).finally(() => clearTimeout(probeTimer))
      const entryCt = entry?.contentType ?? ''
      const entryHtml = entry && (entryCt.includes('text/html') || entryCt.includes('application/xhtml'))
        ? new TextDecoder().decode(entry.data)
        : null

      if (entryHtml && isJsRendered(entryHtml)) {
        const cfg = renderConfig(env)

        // 渲染缓存命中：直接 done
        const renderCached = await getCrawlCache(env.DB, await sha16('render:' + url))
        if (renderCached) {
          await writer.write(enc.encode(sseEvent('done', {
            fileCount: renderCached.file_count,
            totalBytes: renderCached.zip_size,
            jsWarning: false,
            downloadUrl: `${env.R2_PUBLIC_BASE}/${renderCached.r2_key}`,
          })))
          return
        }

        // 熔断检查在配额消耗之前：预算已死时不浪费匿名每日渲染额度
        const budget = await checkBudget(env.DB, cfg.monthlyBudgetSeconds)
        let renderAllowed = budget.allowed
        if (renderAllowed && !user) {
          renderQuotaCharged = await checkAndIncrementIpUsage(env.DB, ip, 'render', cfg.dailyLimitAnon)
          renderAllowed = renderQuotaCharged
        }

        if (renderAllowed) {
          const taskId = crypto.randomUUID()
          await createRenderTask(env.DB, {
            id: taskId,
            url,
            ip: user ? null : ip,
            user_id: user?.sub ?? null,
            created_at: Date.now(),
          })
          renderTaskId = taskId
          await env.RENDER_WORKFLOW.create({ id: taskId, params: { taskId, url, userId: user?.sub ?? null } })
          renderWorkflowStarted = true  // create 已 resolve，此后即便推送 SSE 失败也不退额度（渲染照常消耗预算）
          await writer.write(enc.encode(sseEvent('render_task', { taskId })))
          return
        }

        // 渲染不可用 → 推送原因，降级走静态链路
        await writer.write(enc.encode(sseEvent('notice', {
          reason: budget.allowed ? 'render_quota' : 'render_budget',
        })))
      }

      // ---- 静态链路（V1 原逻辑）。历史记录在确定走静态后才建，
      // 渲染任务的历史由 workflow finalize 自己写（crawl_type 'render'）----
      if (user) {
        recordId = crypto.randomUUID()
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

      const result = await crawlSite(url, (progress) => {
        writer.write(enc.encode(sseEvent('progress', progress)))
      })

      // 上传 ZIP 到 R2（不走 base64+SSE，规避内存峰值）
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
      // 工作流启动失败时标记任务失败，避免前端永久轮询
      if (renderTaskId) {
        await updateRenderTask(env.DB, renderTaskId, { status: 'failed', error: msg }).catch(() => {})
      }
      // 渲染未真正启动 → 退还预扣的匿名当日额度（已启动则工作流会消耗预算，不能退）
      if (renderQuotaCharged && !renderWorkflowStarted) {
        await decrementIpUsage(env.DB, ip, 'render').catch(() => {})
      }
      await writer.write(enc.encode(sseEvent('error', { error: msg })))
    } finally {
      await writer.close()
    }
  })()

  return new Response(readable, { headers: sseHeaders })
}
