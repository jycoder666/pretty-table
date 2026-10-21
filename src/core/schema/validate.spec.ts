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

describe('validateInstance · schema 1.2 新可选字段（自定义格式）', () => {
  function baseWith(style: unknown, themeTokens?: unknown) {
    return {
      schemaVersion: '1.2',
      templateId: 'x',
      themeId: 'T-A',
      slots: {},
      blocks: [],
      themeTokens,
      layout: { rowCount: 2, colCount: 2, blockSlots: [], style },
    }
  }

  it('layout.style 档位越界钳制到 1~3；列宽钳到 [64,360]', () => {
    const r = validateInstance(
      baseWith({ rowHeightTier: 9, fontSizeTier: 0, paddingTier: 2, colWidths: [9999, 1, 120, null] }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.style).toEqual({
      rowHeightTier: 3,
      fontSizeTier: 1,
      paddingTier: 2,
      colWidths: [360, 64, 120, null],
    })
  })

  it('colWidths 非法元素 → null；非对象 style → 移除', () => {
    const r1 = validateInstance(baseWith({ colWidths: ['x' as unknown as number, 100] }))
    expect(r1.ok && r1.value.layout.style?.colWidths).toEqual([null, 100])
    const r2 = validateInstance(baseWith('oops'))
    expect(r2.ok && r2.value.layout.style).toBeUndefined()
  })

  it('themeTokens 非法 hex → 清除该键 + warn TOKEN_INVALID', () => {
    const r = validateInstance(baseWith(undefined, { primary: '#2f5b9a', emphasis: 'zzz' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.themeTokens).toEqual({ primary: '#2f5b9a' })
    expect(r.warnings?.some((w) => w.code === 'TOKEN_INVALID')).toBe(true)
  })

  it('themeTokens 合法 #RGB → 扩展为 6 位', () => {
    const r = validateInstance(baseWith(undefined, { primary: '#abc' }))
    expect(r.ok && r.value.themeTokens).toEqual({ primary: '#aabbcc' })
  })
})

// ── R-3 图片槽值形态校验（宽容未知，畸形清洗）─────────────────

describe('validateInstance · 图片槽值清洗（交互升级 T01）', () => {
  function baseWithSlots(slots: Record<string, unknown>) {
    return {
      schemaVersion: '1.2',
      templateId: 'x',
      themeId: 'T-A',
      slots,
      blocks: [],
      layout: { rowCount: 1, colCount: 2, blockSlots: [], slotGrid: [['a', 'b']] },
    }
  }

  it('{image} 畸形值 → 删除该槽值 + warn IMAGE_INVALID；其余槽不动', () => {
    const r = validateInstance(baseWithSlots({ a: { image: '<script>' }, b: '文字' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.slots['a']).toBeUndefined()
    expect(r.value.slots['b']).toBe('文字')
    expect(r.warnings?.some((w) => w.code === 'IMAGE_INVALID')).toBe(true)
  })

  it('{image} 合法白名单 data URL → 原样保留，无 warn', () => {
    const url = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
    const r = validateInstance(baseWithSlots({ a: { image: url } }))
    expect(r.ok && r.value.slots['a']).toEqual({ image: url })
    expect(r.ok && r.warnings?.some((w) => w.code === 'IMAGE_INVALID')).toBeFalsy()
  })
})
