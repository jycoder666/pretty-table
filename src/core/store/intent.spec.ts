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

describe('setThemeToken / resetThemeTokens（FR-C1，schema 1.2）', () => {
  it('写 token 覆盖；非法 hex 拒绝不写入', () => {
    const r1 = applyEditIntent(base(), { kind: 'setThemeToken', token: 'primary', value: '#336699' })
    expect(r1.ok).toBe(true)
    expect(r1.ok && r1.value.themeTokens?.primary).toBe('#336699')
    const r2 = applyEditIntent(base(), { kind: 'setThemeToken', token: 'primary', value: 'zzz' })
    expect(r2.ok).toBe(false)
  })

  it('#RGB 扩展为 6 位；null 清除该键；清空后 themeTokens 移除', () => {
    const s1 = applyEditIntent(base(), { kind: 'setThemeToken', token: 'emphasis', value: '#f00' })
    expect(s1.ok && s1.value.themeTokens?.emphasis).toBe('#ff0000')
    const s2 = applyEditIntent(
      s1.ok ? s1.value : base(),
      { kind: 'setThemeToken', token: 'emphasis', value: null },
    )
    expect(s2.ok && s2.value.themeTokens).toBeUndefined()
  })

  it('无 primary 覆盖时设其他角色 → 只存该角色差异，不冗余回落键', () => {
    const r = applyEditIntent(base(), { kind: 'setThemeToken', token: 'border', value: '#aabbcc' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.themeTokens).toEqual({ border: '#aabbcc' })
  })

  it('resetThemeTokens 一键清空全部覆盖', () => {
    const s1 = applyEditIntent(base(), { kind: 'setThemeToken', token: 'primary', value: '#336699' })
    const s2 = applyEditIntent(s1.ok ? s1.value : base(), { kind: 'setThemeToken', token: 'zebra', value: '#eef2f7' })
    const s3 = applyEditIntent(s2.ok ? s2.value : base(), { kind: 'resetThemeTokens' })
    expect(s3.ok && s3.value.themeTokens).toBeUndefined()
  })
})

describe('setColWidth / 档位意图（FR-C2）', () => {
  it('列宽超界收口到 [64,360]；null 恢复默认宽', () => {
    const r1 = applyEditIntent(base(), { kind: 'setColWidth', col: 1, width: 9999 })
    expect(r1.ok && r1.value.layout.style?.colWidths?.[1]).toBe(360)
    const r2 = applyEditIntent(base(), { kind: 'setColWidth', col: 1, width: 1 })
    expect(r2.ok && r2.value.layout.style?.colWidths?.[1]).toBe(64)
    const r3 = applyEditIntent(
      r1.ok ? r1.value : base(),
      { kind: 'setColWidth', col: 1, width: null },
    )
    expect(r3.ok && r3.value.layout.style?.colWidths?.[1]).toBeNull()
  })

  it('列号越界 → SLOT_UNKNOWN', () => {
    const r = applyEditIntent(base(), { kind: 'setColWidth', col: 99, width: 100 })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('SLOT_UNKNOWN')
  })

  it('三档位意图落 layout.style', () => {
    const s1 = applyEditIntent(base(), { kind: 'setRowHeightTier', tier: 3 })
    const s2 = applyEditIntent(s1.ok ? s1.value : base(), { kind: 'setFontSizeTier', tier: 1 })
    const s3 = applyEditIntent(s2.ok ? s2.value : base(), { kind: 'setPaddingTier', tier: 2 })
    expect(s3.ok && s3.value.layout.style).toEqual({ rowHeightTier: 3, fontSizeTier: 1, paddingTier: 2 })
  })

  it('结构意图转发 applyStructuralIntent', () => {
    const r = applyEditIntent(base(), { kind: 'addRow' })
    expect(r.ok).toBe(true)
    expect(r.ok && r.value.layout.rowCount).toBe(11)
    const bad = applyEditIntent(base(), { kind: 'removeRow', row: 0 })
    expect(bad.ok).toBe(false)
  })
})
