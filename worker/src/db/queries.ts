export interface User {
  id: string
  email: string
  password_hash: string
  created_at: number
}

export interface CrawlRecord {
  id: string
  user_id: string
  url: string
  status: 'running' | 'done' | 'failed'
  file_count: number | null
  zip_size: number | null
  created_at: number
  completed_at: number | null
  gh_run_id?: string | null
  crawl_type?: 'static' | 'js' | 'render'
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>()
  return result ?? null
}

export async function createUser(db: D1Database, user: User): Promise<void> {
  await db.prepare(
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'
  ).bind(user.id, user.email, user.password_hash, user.created_at).run()
}

export async function createCrawlRecord(db: D1Database, record: CrawlRecord): Promise<void> {
  // OR IGNORE：渲染链路 finalize step 用 taskId 作主键，重试/replay 时第二次插入静默跳过；
  // 静态车道 id 为随机 UUID 不会撞键，行为不变
  await db.prepare(
    'INSERT OR IGNORE INTO crawl_history (id, user_id, url, status, file_count, zip_size, created_at, completed_at, gh_run_id, crawl_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    record.id, record.user_id, record.url, record.status,
    record.file_count, record.zip_size, record.created_at, record.completed_at,
    record.gh_run_id ?? null, record.crawl_type ?? 'static',
  ).run()
}

export async function updateCrawlRecord(
  db: D1Database,
  id: string,
  update: { status: string; file_count?: number; zip_size?: number; completed_at?: number }
): Promise<void> {
  await db.prepare(
    'UPDATE crawl_history SET status = ?, file_count = ?, zip_size = ?, completed_at = ? WHERE id = ?'
  ).bind(update.status, update.file_count ?? null, update.zip_size ?? null, update.completed_at ?? null, id).run()
}

export async function getCrawlHistory(db: D1Database, userId: string): Promise<CrawlRecord[]> {
  const result = await db.prepare(
    'SELECT * FROM crawl_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(userId).all<CrawlRecord>()
  return result.results
}

export interface CrawlCache {
  url_hash: string
  url: string
  r2_key: string
  file_count: number | null
  zip_size: number | null
  created_at: number
}

export async function getCrawlCache(db: D1Database, urlHash: string): Promise<CrawlCache | null> {
  const result = await db.prepare(
    'SELECT * FROM crawl_cache WHERE url_hash = ?'
  ).bind(urlHash).first<CrawlCache>()
  return result ?? null
}

export async function setCrawlCache(db: D1Database, record: CrawlCache): Promise<void> {
  await db.prepare(
    'INSERT OR REPLACE INTO crawl_cache (url_hash, url, r2_key, file_count, zip_size, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(record.url_hash, record.url, record.r2_key, record.file_count, record.zip_size, record.created_at).run()
}

// IP 使用限制：返回当日已使用次数，并原子性 +1
// 若超出 limit 则返回 false，否则返回 true
export async function checkAndIncrementIpUsage(
  db: D1Database,
  ip: string,
  crawlType: 'static' | 'js' | 'render',
  limit: number,
): Promise<boolean> {
  // limit=0 直接拒绝（如 dailyLimitAnon=0 时完全禁止匿名渲染）
  if (limit <= 0) return false

  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  // 原子自增+上限校验，消除并发读改写竞态
  // ip_usage 以 (ip, crawl_type, date) 为复合主键；
  // 首次插入 count=1；已存在时仅在 count < limit 时自增，否则 changes=0 → 超限
  const result = await db.prepare(
    'INSERT INTO ip_usage (ip, crawl_type, date, count) VALUES (?, ?, ?, 1) ON CONFLICT(ip, crawl_type, date) DO UPDATE SET count = count + 1 WHERE count < ?'
  ).bind(ip, crawlType, date, limit).run()

  return result.meta.changes > 0
}

// 退还当日 IP 配额：原子递减，count > 0 守卫防越界到负数。
// 与 checkAndIncrementIpUsage 用同一 UTC 日期键，仅在确认已扣额后调用。
export async function decrementIpUsage(
  db: D1Database,
  ip: string,
  crawlType: 'static' | 'js' | 'render',
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  await db.prepare(
    'UPDATE ip_usage SET count = count - 1 WHERE ip = ? AND crawl_type = ? AND date = ? AND count > 0'
  ).bind(ip, crawlType, date).run()
}

export interface RenderTask {
  id: string
  url: string
  status: 'queued' | 'running' | 'done' | 'partial' | 'failed'
  phase: 'discovering' | 'rendering' | 'assets' | 'zipping' | null
  pages_total: number | null
  pages_done: number
  bytes: number
  r2_key: string | null
  error: string | null
  failed_pages: string | null  // JSON 数组字符串
  ip: string | null
  user_id: string | null
  created_at: number
  updated_at: number
}

export async function createRenderTask(
  db: D1Database,
  task: { id: string; url: string; ip: string | null; user_id: string | null; created_at: number },
): Promise<void> {
  await db.prepare(
    "INSERT INTO render_tasks (id, url, status, pages_done, bytes, ip, user_id, created_at, updated_at) VALUES (?, ?, 'queued', 0, 0, ?, ?, ?, ?)"
  ).bind(task.id, task.url, task.ip, task.user_id, task.created_at, task.created_at).run()
}

export async function getRenderTask(db: D1Database, id: string): Promise<RenderTask | null> {
  const row = await db.prepare('SELECT * FROM render_tasks WHERE id = ?').bind(id).first<RenderTask>()
  return row ?? null
}

// 动态 SET 限定在白名单字段内，updated_at 总是刷新
const RENDER_TASK_FIELDS = ['status', 'phase', 'pages_total', 'pages_done', 'bytes', 'r2_key', 'error', 'failed_pages'] as const
export type RenderTaskUpdate = Partial<Pick<RenderTask, (typeof RENDER_TASK_FIELDS)[number]>>

export async function updateRenderTask(db: D1Database, id: string, update: RenderTaskUpdate): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []
  for (const field of RENDER_TASK_FIELDS) {
    if (field in update) {
      sets.push(`${field} = ?`)
      values.push(update[field] ?? null)
    }
  }
  if (sets.length === 0) return
  sets.push('updated_at = ?')
  values.push(Date.now())
  await db.prepare(`UPDATE render_tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run()
}

export async function getRenderUsageSeconds(db: D1Database, month: string): Promise<number> {
  const row = await db.prepare('SELECT browser_seconds FROM render_usage WHERE month = ?')
    .bind(month).first<{ browser_seconds: number }>()
  return row?.browser_seconds ?? 0
}

export async function addRenderUsageSeconds(db: D1Database, month: string, seconds: number): Promise<void> {
  await db.prepare(
    'INSERT INTO render_usage (month, browser_seconds) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET browser_seconds = browser_seconds + excluded.browser_seconds'
  ).bind(month, seconds).run()
}
