-- 001_add_gh_run_id.sql
-- 为 crawl_history 表新增 GitHub Actions 追踪字段
-- 用于方案 E（GitHub Actions JS 渲染爬取）
--
-- 执行方式：
--   本地：npx wrangler d1 execute site-crawler-db --local --file src/db/migrations/001_add_gh_run_id.sql
--   远程：npx wrangler d1 execute site-crawler-db --remote --file src/db/migrations/001_add_gh_run_id.sql
-- 其它:
--   schema.sql已经建表,重复
ALTER TABLE crawl_history ADD COLUMN gh_run_id TEXT;
ALTER TABLE crawl_history ADD COLUMN crawl_type TEXT NOT NULL DEFAULT 'static';
