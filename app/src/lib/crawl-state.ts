const KEY = 'sc_crawl_state'

export type CrawlStatus = 'idle' | 'running' | 'done' | 'failed'

export interface CrawlState {
  url: string
  status: CrawlStatus
  fileCount?: number
  totalBytes?: number
  jsWarning?: boolean
}

export function saveCrawlState(state: CrawlState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function loadCrawlState(): CrawlState | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as CrawlState } catch { return null }
}

export function clearCrawlState(): void {
  localStorage.removeItem(KEY)
}
