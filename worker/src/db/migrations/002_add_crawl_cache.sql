-- 002_add_crawl_cache.sql
-- 新增爬取结果缓存表，用于 R2 存储后的元数据索引
-- 同一 URL 再次请求时直接返回 R2 公开下载链接，无需重新触发 Actions
--
-- 执行方式：
--   本地：npx wrangler d1 execute site-crawler-db --local --file src/db/migrations/002_add_crawl_cache.sql
--   远程：npx wrangler d1 execute site-crawler-db --remote --file src/db/migrations/002_add_crawl_cache.sql

CREATE TABLE IF NOT EXISTS crawl_cache (
  url_hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  file_count INTEGER,
  zip_size INTEGER,
  created_at INTEGER NOT NULL
);
