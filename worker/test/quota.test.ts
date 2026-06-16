import { describe, it, expect } from 'vitest'
import { monthKey, isWithinBudget } from '../src/render/quota'

describe('monthKey', () => {
  it('返回 UTC YYYY-MM', () => {
    expect(monthKey(new Date('2026-06-11T23:59:59Z'))).toBe('2026-06')
    expect(monthKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})

describe('isWithinBudget', () => {
  it('已用小于预算才放行（硬熔断）', () => {
    expect(isWithinBudget(0, 32400)).toBe(true)
    expect(isWithinBudget(32399.5, 32400)).toBe(true)
    expect(isWithinBudget(32400, 32400)).toBe(false)
    expect(isWithinBudget(40000, 32400)).toBe(false)
  })
})
