import { describe, it, expect } from 'vitest'
import { handleRenderStatus } from '../src/render/handler'
import type { RenderTask } from '../src/db/queries'
import type { Env } from '../src/index'

// 极简 D1 替身：SELECT first() 返回预设任务行，UPDATE run() 仅记录调用
// （纯 vitest 环境无可执行 SQL 的真实 D1，断言落在「发出了带 failed 的 UPDATE」级别）
class FakeD1 {
  updates: { sql: string; params: unknown[] }[] = []
  constructor(public task: RenderTask | null) {}

  prepare(sql: string) {
    const self = this
    return {
      bind(...params: unknown[]) {
        return {
          async first() { return self.task },
          async run() {
            self.updates.push({ sql, params })
            return { meta: { changes: 1 } }
          },
        }
      },
    }
  }
}

const MIN = 60 * 1000

function taskRow(over: Partial<RenderTask>): RenderTask {
  return {
    id: 't1',
    url: 'https://a.com/',
    status: 'running',
    phase: 'rendering',
    pages_total: 10,
    pages_done: 3,
    bytes: 1000,
    r2_key: null,
    error: null,
    failed_pages: null,
    ip: null,
    user_id: null,
    created_at: Date.now() - 60 * MIN,
    updated_at: Date.now(),
    ...over,
  }
}

async function callStatus(db: FakeD1) {
  const env = { DB: db, R2_PUBLIC_BASE: 'https://r2.example' } as unknown as Env
  const res = await handleRenderStatus(env, {}, 't1')
  return { res, body: await res.json() as Record<string, unknown> }
}

describe('handleRenderStatus 无心跳超时逃生口', () => {
  it('running 且 updated_at 超过 30 分钟 → 判死为 failed 并更新 DB', async () => {
    const db = new FakeD1(taskRow({ updated_at: Date.now() - 31 * MIN }))
    const { body } = await callStatus(db)
    expect(body.status).toBe('failed')
    expect(String(body.error)).toMatch(/stale/)
    expect(body.downloadUrl).toBeUndefined()
    // DB 被同步标记为 failed，刷新后不会再回到 running
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].sql).toMatch(/^UPDATE render_tasks SET /)
    expect(db.updates[0].params).toContain('failed')
  })

  it('queued 且超时同样判死（workflow 从未启动的死任务）', async () => {
    const db = new FakeD1(taskRow({ status: 'queued', phase: null, updated_at: Date.now() - 31 * MIN }))
    const { body } = await callStatus(db)
    expect(body.status).toBe('failed')
    expect(db.updates).toHaveLength(1)
  })

  it('running 且 29 分钟内有心跳 → 原样返回 running，不动 DB', async () => {
    const db = new FakeD1(taskRow({ updated_at: Date.now() - 29 * MIN }))
    const { body } = await callStatus(db)
    expect(body.status).toBe('running')
    expect(body.error).toBeUndefined()
    expect(db.updates).toHaveLength(0)
  })

  it('终态任务不受超时影响（done 超过 30 分钟原样返回）', async () => {
    const db = new FakeD1(taskRow({ status: 'done', phase: null, r2_key: 'crawls/x.zip', updated_at: Date.now() - 31 * MIN }))
    const { body } = await callStatus(db)
    expect(body.status).toBe('done')
    expect(body.downloadUrl).toBe('https://r2.example/crawls/x.zip')
    expect(db.updates).toHaveLength(0)
  })
})
