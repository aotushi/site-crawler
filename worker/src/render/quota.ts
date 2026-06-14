import { getRenderUsageSeconds } from '../db/queries'

// UTC 月份键 'YYYY-MM'，与 render_usage.month 对应
export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7)
}

// 硬熔断判定：已用 >= 预算即拒绝
export function isWithinBudget(usedSeconds: number, budgetSeconds: number): boolean {
  return usedSeconds < budgetSeconds
}

// 查询当月用量并判定（薄封装，本地 E2E 覆盖，不写单测）
export async function checkBudget(
  db: D1Database,
  budgetSeconds: number,
): Promise<{ used: number; allowed: boolean }> {
  const used = await getRenderUsageSeconds(db, monthKey(new Date()))
  return { used, allowed: isWithinBudget(used, budgetSeconds) }
}
