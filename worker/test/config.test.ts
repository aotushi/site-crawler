import { describe, it, expect } from 'vitest'
import { renderConfig, RENDER_MAX_OBJECTS } from '../src/render/config'

describe('renderConfig', () => {
  it('解析环境变量字符串为数字', () => {
    const cfg = renderConfig({
      RENDER_MONTHLY_BUDGET_S: '32400',
      RENDER_MAX_PAGES: '500',
      RENDER_MAX_BYTES: '943718400',
      RENDER_PAGE_TIMEOUT_MS: '15000',
      RENDER_BATCH_SIZE: '10',
      RENDER_DAILY_LIMIT_ANON: '1',
    })
    expect(cfg).toEqual({
      monthlyBudgetSeconds: 32400,
      maxPages: 500,
      maxBytes: 943718400,
      pageTimeoutMs: 15000,
      batchSize: 10,
      dailyLimitAnon: 1,
    })
  })
  it('缺失或非法值回退默认', () => {
    const cfg = renderConfig({ RENDER_MAX_PAGES: 'abc', RENDER_MAX_BYTES: '-1' })
    expect(cfg.maxPages).toBe(500)
    expect(cfg.maxBytes).toBe(943718400)
    expect(cfg.monthlyBudgetSeconds).toBe(32400)
    expect(cfg.pageTimeoutMs).toBe(15000)
    expect(cfg.batchSize).toBe(10)
    expect(cfg.dailyLimitAnon).toBe(1)
  })
  it('RENDER_MAX_OBJECTS 是内部常量 850', () => {
    expect(RENDER_MAX_OBJECTS).toBe(850)
  })
})
