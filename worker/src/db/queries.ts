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
    'INSERT INTO crawl_history (id, user_id, url, status, file_count, zip_size, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(record.id, record.user_id, record.url, record.status, record.file_count, record.zip_size, record.created_at, record.completed_at).run()
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
