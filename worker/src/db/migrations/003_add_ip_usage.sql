CREATE TABLE IF NOT EXISTS ip_usage (
  ip TEXT NOT NULL,
  crawl_type TEXT NOT NULL,  -- 'static' | 'js'
  date TEXT NOT NULL,        -- YYYY-MM-DD UTC
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, crawl_type, date)
);
