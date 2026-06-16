import { describe, it, expect } from 'vitest'
import { createCrawlRecord, CrawlRecord, decrementIpUsage } from '../src/db/queries'

// 测试环境是纯 vitest（无 vitest-pool-workers），没有可执行真实 SQL 的 D1 实例，
// 故用极简替身仅模拟 SQLite 主键冲突语义：
//   - 普通 INSERT 撞主键 → 抛 UNIQUE constraint 错（真实 D1 行为）
//   - INSERT OR IGNORE 撞主键 → 静默跳过（changes=0）
// 断言因此落在「SQL 字符串用了 INSERT OR IGNORE + 重复插入不抛错且仅一行」级别。
class FakeD1 {
  rows = new Map<string, unknown[]>()
  sqls: string[] = []

  prepare(sql: string) {
    this.sqls.push(sql)
    const self = this
    return {
      bind(...params: unknown[]) {
        return {
          async run() {
            if (!/^\s*INSERT/i.test(sql)) throw new Error(`FakeD1 只支持 INSERT，收到: ${sql}`)
            const id = String(params[0]) // crawl_history 的 id 是第一个绑定参数
            if (self.rows.has(id)) {
              if (/^\s*INSERT\s+OR\s+IGNORE/i.test(sql)) return { meta: { changes: 0 } }
              throw new Error('UNIQUE constraint failed: crawl_history.id')
            }
            self.rows.set(id, params)
            return { meta: { changes: 1 } }
          },
        }
      },
    }
  }
}

const asD1 = (db: FakeD1) => db as unknown as D1Database

function record(id: string): CrawlRecord {
  return {
    id,
    user_id: 'u1',
    url: 'https://a.com/',
    status: 'done',
    file_count: 3,
    zip_size: 100,
    created_at: 1718000000000,
    completed_at: 1718000001000,
    crawl_type: 'render',
  }
}

describe('createCrawlRecord', () => {
  it('SQL 使用 INSERT OR IGNORE（幂等插入）', async () => {
    const db = new FakeD1()
    await createCrawlRecord(asD1(db), record('t1'))
    expect(db.sqls[0]).toMatch(/^INSERT OR IGNORE INTO crawl_history/i)
  })

  it('同一 id 插入两次不抛错且仅一行（finalize step 重试/replay 场景）', async () => {
    const db = new FakeD1()
    await createCrawlRecord(asD1(db), record('task-1'))
    await expect(createCrawlRecord(asD1(db), record('task-1'))).resolves.toBeUndefined()
    expect(db.rows.size).toBe(1)
  })

  it('不同 id 各自成行（静态车道随机 UUID 调用方不受影响）', async () => {
    const db = new FakeD1()
    await createCrawlRecord(asD1(db), record('a'))
    await createCrawlRecord(asD1(db), record('b'))
    expect(db.rows.size).toBe(2)
  })
})

// 仅记录最后一次 prepare 的 sql 与 bind 参数，支持 UPDATE（现有 FakeD1 只认 INSERT）
class FakeD1Recorder {
  last?: { sql: string; params: unknown[] }
  prepare(sql: string) {
    const self = this
    return {
      bind(...params: unknown[]) {
        return { async run() { self.last = { sql, params }; return { meta: { changes: 1 } } } }
      },
    }
  }
}
const asD1Rec = (db: FakeD1Recorder) => db as unknown as D1Database

describe('decrementIpUsage', () => {
  it('发出原子递减 UPDATE，带 count > 0 守卫与 (ip, render, date) 参数', async () => {
    const db = new FakeD1Recorder()
    await decrementIpUsage(asD1Rec(db), '1.2.3.4', 'render')
    expect(db.last!.sql).toMatch(/UPDATE ip_usage SET count = count - 1/)
    expect(db.last!.sql).toMatch(/count > 0/)
    expect(db.last!.params).toContain('1.2.3.4')
    expect(db.last!.params).toContain('render')
    expect(db.last!.params).toContain(new Date().toISOString().slice(0, 10)) // 与扣额同一 UTC 日期键
  })
})
