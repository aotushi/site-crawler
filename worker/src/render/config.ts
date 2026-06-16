// 渲染链路环境变量（wrangler vars 均为字符串）
export interface RenderEnvVars {
  RENDER_MONTHLY_BUDGET_S?: string
  RENDER_MAX_PAGES?: string
  RENDER_MAX_BYTES?: string
  RENDER_PAGE_TIMEOUT_MS?: string
  RENDER_BATCH_SIZE?: string
  RENDER_DAILY_LIMIT_ANON?: string
}

export interface RenderConfig {
  monthlyBudgetSeconds: number
  maxPages: number
  maxBytes: number
  pageTimeoutMs: number
  batchSize: number
  dailyLimitAnon: number
}

// 全任务累计暂存对象数上限：Workflows 单步 ~1000 子请求的安全余量（内部常量，不暴露为 env）
export const RENDER_MAX_OBJECTS = 850

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function renderConfig(env: RenderEnvVars): RenderConfig {
  return {
    monthlyBudgetSeconds: num(env.RENDER_MONTHLY_BUDGET_S, 32400), // 9 小时 = 月度 10 浏览器小时的 90%
    maxPages: num(env.RENDER_MAX_PAGES, 500),
    maxBytes: num(env.RENDER_MAX_BYTES, 943718400), // 900 MB
    pageTimeoutMs: num(env.RENDER_PAGE_TIMEOUT_MS, 15000),
    batchSize: num(env.RENDER_BATCH_SIZE, 10),
    dailyLimitAnon: num(env.RENDER_DAILY_LIMIT_ANON, 1),
  }
}
