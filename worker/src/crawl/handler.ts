import type { Env } from '../index'
import { verifyToken, extractBearer } from '../auth/jwt'
import { crawlSite } from './engine'
import { createCrawlRecord, updateCrawlRecord } from '../db/queries'

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

  let result
  try {
    result = await crawlSite(url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Crawl failed'
    if (user && recordId) {
      await updateCrawlRecord(env.DB, recordId, { status: 'failed', completed_at: Date.now() })
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (user && recordId) {
    await updateCrawlRecord(env.DB, recordId, {
      status: 'done',
      file_count: result.fileCount,
      zip_size: result.totalBytes,
      completed_at: Date.now(),
    })
  }

  const headers: Record<string, string> = {
    ...corsHeaders,
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="site.zip"',
    'X-File-Count': String(result.fileCount),
    'X-Total-Bytes': String(result.totalBytes),
  }
  if (result.jsWarning) headers['X-JS-Warning'] = '1'

  return new Response(result.zip.buffer as ArrayBuffer, { headers })
}
