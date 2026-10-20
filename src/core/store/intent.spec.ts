import { describe, expect, it } from 'vitest'
import { applyEditIntent } from './intent'
import { COMPARE_ALPHA_V1 } from '../templates'
import { cloneInstance } from '../schema/validate'
import type { TemplateInstance } from '../types'

function base(): TemplateInstance {
  return cloneInstance(COMPARE_ALPHA_V1)
}

describe('setRecommendCol（FR-23）', () => {
  it('setRecommendCol(2) → highlight.recommendCol=2', () => {
    const r = applyEditIntent(base(), { kind: 'setRecommendCol', col: 2 })
    expect(r.ok).toBe(true)
    expect(r.ok ? r.value.highlight?.recommendCol : undefined).toBe(2)
  })

  it('再设 3 → 替换（最多一列）', () => {
    const s1 = applyEditIntent(base(), { kind: 'setRecommendCol', col: 2 })
    expect(s1.ok).toBe(true)
    const s2 = applyEditIntent(s1.ok ? s1.value : base(), { kind: 'setRecommendCol', col: 3 })
    expect(s2.ok).toBe(true)
    expect(s2.ok ? s2.value.highlight?.recommendCol : undefined).toBe(3)
  })

  it('不在 recommendableCols → 拒绝', () => {
    const r = applyEditIntent(base(), { kind: 'setRecommendCol', col: 0 })
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('SLOT_UNKNOWN')
  })

  it('null → 取消推荐', () => {
    const s1 = applyEditIntent(base(), { kind: 'setRecommendCol', col: 1 })
    expect(s1.ok).toBe(true)
    const s2 = applyEditIntent(s1.ok ? s1.value : base(), { kind: 'setRecommendCol', col: null })
    expect(s2.ok).toBe(true)
    expect(s2.ok ? s2.value.highlight?.recommendCol : undefined).toBeNull()
  })
})

describe('setSlot 语义值（schema 1.1）', () => {
  it('mark 槽写入 {mark} 保留语义；再设 align 不丢 mark', () => {
    const s1 = applyEditIntent(base(), { kind: 'setSlot', slotId: 'row.2.val.a', value: { mark: 'no' } })
    expect(s1.ok).toBe(true)
    if (!s1.ok) return
    expect(s1.value.slots['row.2.val.a']).toEqual({ mark: 'no' })
    const s2 = applyEditIntent(s1.value, { kind: 'setAlign', slotId: 'row.2.val.a', align: 'left' })
    expect(s2.ok).toBe(true)
    if (!s2.ok) return
    expect(s2.value.slots['row.2.val.a']).toEqual({ mark: 'no', align: 'left' })
  })

  it('num 槽写入 {num}；设置强调保留 num', () => {
    const s1 = applyEditIntent(base(), { kind: 'setSlot', slotId: 'row.5.val.a', value: { num: 9800 } })
    expect(s1.ok).toBe(true)
    if (!s1.ok) return
    expect(s1.value.slots['row.5.val.a']).toEqual({ num: 9800 })
    const s2 = applyEditIntent(s1.value, {
      kind: 'setEmphasis',
      slotId: 'row.5.val.a',
      emphasize: ['bold'],
    })
    expect(s2.ok).toBe(true)
    if (!s2.ok) return
    expect(s2.value.slots['row.5.val.a']).toEqual({ num: 9800, emphasize: ['bold'] })
  })

  it('mark 槽写入普通文字 → 变成文字值（按文字显示）', () => {
    const r = applyEditIntent(base(), { kind: 'setSlot', slotId: 'row.2.val.a', value: '面议' })
    expect(r.ok).toBe(true)
    expect(r.ok ? r.value.slots['row.2.val.a'] : undefined).toEqual({ text: '面议' })
  })

  it('文字槽写入保留 align/emphasize（既有行为不回归）', () => {
    const s1 = applyEditIntent(base(), { kind: 'setAlign', slotId: 'row.3.val.a', align: 'right' })
    expect(s1.ok).toBe(true)
    const s2 = applyEditIntent(s1.ok ? s1.value : base(), {
      kind: 'setSlot',
      slotId: 'row.3.val.a',
      value: '24 小时',
    })
    expect(s2.ok).toBe(true)
    expect(s2.ok ? s2.value.slots['row.3.val.a'] : undefined).toEqual({ text: '24 小时', align: 'right' })
  })
})
