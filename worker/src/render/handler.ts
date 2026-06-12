import type { Env } from '../index'
import { getRenderTask } from '../db/queries'

// GET /api/crawl/render/:taskId — 渲染任务状态轮询
export async function handleRenderStatus(
  env: Env,
  corsHeaders: Record<string, string>,
  taskId: string,
): Promise<Response> {
  const task = await getRenderTask(env.DB, taskId)
  if (!task) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const downloadable = (task.status === 'done' || task.status === 'partial') && task.r2_key
  return new Response(JSON.stringify({
    status: task.status,
    phase: task.phase,
    pagesDone: task.pages_done,
    pagesTotal: task.pages_total,
    bytes: task.bytes,
    downloadUrl: downloadable ? `${env.R2_PUBLIC_BASE}/${task.r2_key}` : undefined,
    error: task.error ?? undefined,
    // 容忍脏数据，解析失败按空数组处理
    failedPages: (() => { try { return task.failed_pages ? JSON.parse(task.failed_pages) : [] } catch { return [] } })(),
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
