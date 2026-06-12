-- 004: V2 渲染链路 — 渲染任务表与月度浏览器用量表
CREATE TABLE IF NOT EXISTS render_tasks (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | partial | failed
  phase TEXT,                              -- discovering | rendering | assets | zipping
  pages_total INTEGER,
  pages_done INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  error TEXT,
  failed_pages TEXT,                       -- JSON 数组字符串
  ip TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS render_usage (
  month TEXT PRIMARY KEY,                  -- 'YYYY-MM'（UTC）
  browser_seconds REAL NOT NULL DEFAULT 0
);
