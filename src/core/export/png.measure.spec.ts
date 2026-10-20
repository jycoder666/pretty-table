import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { measureContentSize } from '../adapter/toOption'
import { measurePng } from './png'
import { cloneInstance } from '../schema/validate'

describe('PNG measure (MVP 2x formula)', () => {
  it('content size includes frame + padding yields expected out size', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const content = measureContentSize(inst)
    expect(content.width).toBeGreaterThan(100)
    expect(content.height).toBeGreaterThan(100)
    const m = measurePng(inst, 2)
    expect(m.outWidth).toBe((content.width + 32) * 2)
    expect(m.outHeight).toBe((content.height + 32) * 2)
  })
})
