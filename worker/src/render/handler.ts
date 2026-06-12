import type { Env } from '../index'
import { getRenderTask, updateRenderTask } from '../db/queries'

// 无心跳超时阈值：远大于单 step 间隔（一批 10 页渲染 + 重试退避也只在分钟级），
// updated_at（毫秒时间戳，updateRenderTask 每次写入 Date.now()）超过该时长未刷新即视为 workflow 已死
const RENDER_STALE_MS = 30 * 60 * 1000

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
  // 逃生口：workflow 实例死亡且没机会跑 mark-failed 时，任务会永远停在 running/queued，
  // 前端据此禁止重新提交 → 用户被永久锁死。轮询侧兜底判死，按 failed 返回
  if ((task.status === 'running' || task.status === 'queued') && Date.now() - task.updated_at > RENDER_STALE_MS) {
    const staleError = 'stale: no workflow heartbeat for over 30 minutes'
    await updateRenderTask(env.DB, taskId, { status: 'failed', phase: null, error: staleError })
    task.status = 'failed'
    task.phase = null
    task.error = staleError
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
