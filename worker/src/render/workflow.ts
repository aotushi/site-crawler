import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers'
import type { Env } from '../index'
import { renderConfig, RENDER_MAX_OBJECTS } from './config'
import { checkBudget, monthKey } from './quota'
import { renderBatch } from './browser'
import { discoverPages, collectMissingAssets, fetchAssetBatch, zipStaging } from './steps'
import { deleteStaging } from './staging'
import { updateRenderTask, addRenderUsageSeconds, createCrawlRecord, setCrawlCache } from '../db/queries'
import { sha16 } from '../crawl/shared'

export interface RenderParams {
  taskId: string
  url: string
  userId: string | null
}

export class RenderCrawlWorkflow extends WorkflowEntrypoint<Env, RenderParams> {
  async run(event: WorkflowEvent<RenderParams>, step: WorkflowStep) {
    const { taskId, url, userId } = event.payload
    const cfg = renderConfig(this.env)
    const startOrigin = new URL(url).origin

    try {
      // ---- 步骤 1：页面发现 ----
      const discovered = await step.do('discover', async () => {
        await updateRenderTask(this.env.DB, taskId, { status: 'running', phase: 'discovering' })
        const pages = await discoverPages(url, cfg.maxPages)
        await updateRenderTask(this.env.DB, taskId, { pages_total: pages.length })
        return pages
      })

      // ---- 步骤 2：BFS 批渲染 ----
      const seen = new Set<string>(discovered)
      let queue = [...discovered]
      let pagesDone = 0
      let bytes = 0
      let objects = 0
      let budgetBreached = false // 月度浏览器时长熔断
      let capHit = false         // 字节/对象上限触顶
      const failedPages: string[] = []
      let batchIndex = 0

      while (queue.length > 0 && pagesDone < cfg.maxPages && !budgetBreached && !capHit) {
        const batch = queue.slice(0, Math.min(cfg.batchSize, cfg.maxPages - pagesDone))
        queue = queue.slice(batch.length)
        // 闭包捕获本轮快照值（replay 时闭包不执行，直接用缓存返回值，外层状态照常重建）
        const knownTotal = Math.min(seen.size, cfg.maxPages)
        const doneBefore = pagesDone
        const bytesBefore = bytes
        const objectsBefore = objects

        const result = await step.do(
          `render-batch-${batchIndex++}`,
          { retries: { limit: 2, delay: '10 seconds', backoff: 'constant' } },
          async () => {
            // 每批前查熔断：跑批过程中预算耗尽则后续批被拒
            const budget = await checkBudget(this.env.DB, cfg.monthlyBudgetSeconds)
            if (!budget.allowed) {
              return { skipped: true as const, pages: [], bytesAdded: 0, objectsAdded: 0, budgetExhausted: false }
            }
            const r = await renderBatch(this.env, taskId, {
              urls: batch,
              startOrigin,
              byteBudgetLeft: cfg.maxBytes - bytesBefore,
              objectBudgetLeft: RENDER_MAX_OBJECTS - objectsBefore,
            })
            await addRenderUsageSeconds(this.env.DB, monthKey(new Date()), r.secondsUsed)
            await updateRenderTask(this.env.DB, taskId, {
              phase: 'rendering',
              pages_total: knownTotal,
              pages_done: doneBefore + r.pages.length,
              bytes: bytesBefore + r.bytesAdded,
            })
            return {
              skipped: false as const,
              pages: r.pages,
              bytesAdded: r.bytesAdded,
              objectsAdded: r.objectsAdded,
              budgetExhausted: r.budgetExhausted,
            }
          },
        )

        if (result.skipped) { budgetBreached = true; break }
        pagesDone += result.pages.length
        bytes += result.bytesAdded
        objects += result.objectsAdded
        if (result.budgetExhausted) capHit = true
        for (const p of result.pages) {
          if (!p.ok) failedPages.push(p.url)
          for (const link of p.links) {
            if (!seen.has(link) && seen.size < cfg.maxPages) {
              seen.add(link)
              queue.push(link)
            }
          }
        }
      }

      // ---- 一页未成 → 标记失败并清理 ----
      if (pagesDone === 0) {
        await step.do('mark-failed-empty', async () => {
          await updateRenderTask(this.env.DB, taskId, {
            status: 'failed',
            phase: null,
            error: budgetBreached ? 'monthly render budget exhausted' : 'no pages rendered',
            failed_pages: JSON.stringify(failedPages),
          })
          await deleteStaging(this.env.CRAWL_BUCKET, taskId)
        })
        return
      }

      // ---- 步骤 3：补抓缺失资源（额度已尽时跳过）----
      if (!budgetBreached && !capHit) {
        const missing = await step.do('collect-missing-assets', async () => {
          await updateRenderTask(this.env.DB, taskId, { phase: 'assets' })
          return collectMissingAssets(this.env.CRAWL_BUCKET, taskId, RENDER_MAX_OBJECTS - objects)
        })
        let assetIndex = 0
        for (let i = 0; i < missing.length && !capHit; i += 100) {
          const slice = missing.slice(i, i + 100)
          const bytesBefore = bytes
          const objectsBefore = objects
          const r = await step.do(`fetch-assets-${assetIndex++}`, async () => {
            const out = await fetchAssetBatch(
              this.env.CRAWL_BUCKET, taskId, slice,
              cfg.maxBytes - bytesBefore,
              RENDER_MAX_OBJECTS - objectsBefore,
            )
            // 每批补抓后刷新 updated_at 心跳，避免长资源阶段被 30 分钟逃生口误判死
            await updateRenderTask(this.env.DB, taskId, { phase: 'assets', bytes: bytesBefore + out.bytesAdded })
            return out
          })
          bytes += r.bytesAdded
          objects += r.objectsAdded
          if (r.budgetExhausted) capHit = true
        }
      }

      // ---- 步骤 4：打包上传 ----
      const zipped = await step.do('zip', async () => {
        await updateRenderTask(this.env.DB, taskId, { phase: 'zipping' })
        const zipKey = `crawls/render-${await sha16('render:' + url)}.zip`
        const r = await zipStaging(this.env.CRAWL_BUCKET, taskId, url, zipKey)
        return { ...r, zipKey }
      })

      // ---- 步骤 5：收尾（缓存、历史、状态、清暂存）----
      await step.do('finalize', async () => {
        const status = budgetBreached || capHit || failedPages.length > 0 ? 'partial' : 'done'
        await setCrawlCache(this.env.DB, {
          url_hash: await sha16('render:' + url),
          url,
          r2_key: zipped.zipKey,
          file_count: zipped.files,
          zip_size: zipped.zipBytes,
          created_at: Date.now(),
        })
        if (userId) {
          // 用 taskId 作历史记录 id，step 重试时幂等，避免重复插入
          await createCrawlRecord(this.env.DB, {
            id: taskId,
            user_id: userId,
            url,
            status: 'done',
            file_count: zipped.files,
            zip_size: zipped.zipBytes,
            created_at: Date.now(),
            completed_at: Date.now(),
            crawl_type: 'render',
          })
        }
        await updateRenderTask(this.env.DB, taskId, {
          status,
          phase: null,
          r2_key: zipped.zipKey,
          bytes: zipped.zipBytes,
          failed_pages: JSON.stringify(failedPages),
          error: budgetBreached ? 'monthly render budget exhausted' : null,
        })
        await deleteStaging(this.env.CRAWL_BUCKET, taskId)
      })
    } catch (e) {
      // 步骤重试耗尽后落到这里：标记失败并清理暂存
      await step.do('mark-failed', async () => {
        await updateRenderTask(this.env.DB, taskId, {
          status: 'failed',
          phase: null,
          error: e instanceof Error ? e.message : 'render workflow failed',
        })
        await deleteStaging(this.env.CRAWL_BUCKET, taskId)
      })
      throw e
    }
  }
}
