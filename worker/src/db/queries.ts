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
  crawl_type?: 'static' | 'js'
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
  await db.prepare(
    'INSERT INTO crawl_history (id, user_id, url, status, file_count, zip_size, created_at, completed_at, gh_run_id, crawl_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
  crawlType: 'static' | 'js',
  limit: number,
): Promise<boolean> {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  // 先 upsert 确保行存在
  await db.prepare(
    'INSERT INTO ip_usage (ip, crawl_type, date, count) VALUES (?, ?, ?, 0) ON CONFLICT(ip, crawl_type, date) DO NOTHING'
  ).bind(ip, crawlType, date).run()

  const row = await db.prepare(
    'SELECT count FROM ip_usage WHERE ip = ? AND crawl_type = ? AND date = ?'
  ).bind(ip, crawlType, date).first<{ count: number }>()

  const current = row?.count ?? 0
  if (current >= limit) return false

  await db.prepare(
    'UPDATE ip_usage SET count = count + 1 WHERE ip = ? AND crawl_type = ? AND date = ?'
  ).bind(ip, crawlType, date).run()
  return true
}
