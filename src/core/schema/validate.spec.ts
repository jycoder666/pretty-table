import { describe, expect, it } from 'vitest'
import { validateInstance } from './validate'
import { COMPARE_ALPHA_V1 } from '../templates'

describe('validateInstance', () => {
  it('accepts preset', () => {
    const r = validateInstance(COMPARE_ALPHA_V1)
    expect(r.ok).toBe(true)
  })
  it('rejects missing slots', () => {
    const r = validateInstance({ templateId: 'x', themeId: 'T-A', blocks: [], layout: { blockSlots: [] } })
    expect(r.ok).toBe(false)
  })
})
