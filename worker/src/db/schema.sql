CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  status TEXT NOT NULL,
  file_count INTEGER,
  zip_size INTEGER,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  gh_run_id TEXT,
  crawl_type TEXT NOT NULL DEFAULT 'static'
);
