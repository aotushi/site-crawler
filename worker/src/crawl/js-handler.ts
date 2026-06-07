// worker/src/crawl/js-handler.ts
// Handlers for JS crawl via GitHub Actions: trigger + status polling + R2 cache

import type { Env } from '../index'
import { verifyToken, extractBearer } from '../auth/jwt'
import { createCrawlRecord, getCrawlCache, setCrawlCache, checkAndIncrementIpUsage } from '../db/queries'
import { triggerDispatch, findRunId, getRunStatus, downloadArtifactZip, getRunJobId, getJobProgress } from './github'

function json(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function hashUrl(url: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

export async function handleJsTrigger(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const token = extractBearer(request)
  const user = token ? await verifyToken(token, env.JWT_SECRET) : null

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400, corsHeaders)
  }

  const { url } = body
  if (!url || !/^https?:\/\/.+/.test(url)) {
    return json({ error: 'Invalid URL' }, 400, corsHeaders)
  }

  // 先查缓存
  const urlHash = await hashUrl(url)
  const cached = await getCrawlCache(env.DB, urlHash)
  if (cached) {
    const downloadUrl = `${env.R2_PUBLIC_BASE}/${cached.r2_key}`
    return json({
      cached: true,
      downloadUrl,
      fileCount: cached.file_count,
      zipSize: cached.zip_size,
      createdAt: cached.created_at,
    }, 200, corsHeaders)
  }

  // 未登录用户：每 IP 每天限 1 次 JS 爬取
  if (!user) {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const allowed = await checkAndIncrementIpUsage(env.DB, ip, 'js', 1)
    if (!allowed) {
      return json({ error: 'Rate limit exceeded. Please try again tomorrow.' }, 429, corsHeaders)
    }
  }

  // 缓存未命中，触发 Actions
  const beforeMs = Date.now()
  await triggerDispatch(env.GITHUB_TOKEN, url)

  const runId = await findRunId(env.GITHUB_TOKEN, beforeMs)
  if (!runId) {
    return json({ error: 'Could not find GitHub Actions run' }, 502, corsHeaders)
  }

  if (user) {
    const recordId = crypto.randomUUID()
    await createCrawlRecord(env.DB, {
      id: recordId,
      user_id: user.sub,
      url,
      status: 'running',
      file_count: null,
      zip_size: null,
      created_at: Date.now(),
      completed_at: null,
      gh_run_id: String(runId),
      crawl_type: 'js',
    })
  }

  return json({ runId }, 200, corsHeaders)
}

export async function handleJsStatus(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  runIdStr: string,
): Promise<Response> {
  const runId = Number(runIdStr)
  if (!runId) return json({ error: 'Invalid runId' }, 400, corsHeaders)

  // 从 query param 获取目标 URL（前端轮询时带上，用于写缓存）
  const reqUrl = new URL(request.url)
  const targetUrl = reqUrl.searchParams.get('url')

  const { status, conclusion } = await getRunStatus(env.GITHUB_TOKEN, runId)

  if (status !== 'completed') {
    // 拉取实时进度
    const jobId = await getRunJobId(env.GITHUB_TOKEN, runId)
    let progress: { phase: string; downloaded: number; total: number } | null = null
    if (jobId) {
      progress = await getJobProgress(env.GITHUB_TOKEN, jobId)
    }
    return json({ status: 'pending', progress }, 200, corsHeaders)
  }

  if (conclusion !== 'success') {
    return json({ status: 'failed', conclusion }, 200, corsHeaders)
  }

  // 检查是否已缓存（并发轮询时可能已被另一个请求写入）
  if (targetUrl) {
    const urlHash = await hashUrl(targetUrl)
    const cached = await getCrawlCache(env.DB, urlHash)
    if (cached) {
      return json({
        status: 'done',
        downloadUrl: `${env.R2_PUBLIC_BASE}/${cached.r2_key}`,
        fileCount: cached.file_count,
        zipSize: cached.zip_size,
      }, 200, corsHeaders)
    }
  }

  // 下载 Artifact
  const zipData = await downloadArtifactZip(env.GITHUB_TOKEN, runId)
  if (!zipData) {
    return json({ status: 'failed', conclusion: 'artifact_missing' }, 200, corsHeaders)
  }

  // 上传到 R2 并写缓存
  if (targetUrl) {
    const urlHash = await hashUrl(targetUrl)
    const r2Key = `crawls/${urlHash}.zip`
    await env.CRAWL_BUCKET.put(r2Key, zipData, {
      httpMetadata: { contentType: 'application/zip' },
    })
    await setCrawlCache(env.DB, {
      url_hash: urlHash,
      url: targetUrl,
      r2_key: r2Key,
      file_count: null,
      zip_size: zipData.length,
      created_at: Date.now(),
    })
    return json({
      status: 'done',
      downloadUrl: `${env.R2_PUBLIC_BASE}/${r2Key}`,
      zipSize: zipData.length,
    }, 200, corsHeaders)
  }

  // 兜底：无 url 参数时返回 base64（向后兼容）
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < zipData.length; i += chunkSize) {
    binary += String.fromCharCode(...zipData.subarray(i, i + chunkSize))
  }
  return json({ status: 'done', zip: btoa(binary) }, 200, corsHeaders)
}
