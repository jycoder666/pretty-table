import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  COL_WIDTH_RANGE,
  ROW_HEIGHT_TIERS,
  FONT_SIZE_TIERS,
  PADDING_TIERS,
  clampColWidth,
  clampTier,
  visibleRowCount,
} from './layoutScales'
import type { TemplateInstance } from '../types'

function inst(partial: Partial<TemplateInstance>): TemplateInstance {
  return {
    schemaVersion: '1.2',
    templateId: 't',
    themeId: 'T-A',
    slots: {},
    blocks: [],
    layout: { rowCount: 5, colCount: 4, blockSlots: [] },
    ...partial,
  } as TemplateInstance
}

describe('layoutScales · LIMITS（GC-21 单点）', () => {
  it('上限为 20 行 × 12 列', () => {
    expect(LIMITS.maxRows).toBe(20)
    expect(LIMITS.maxCols).toBe(12)
  })

  it('档位常量齐全且为三档', () => {
    expect(COL_WIDTH_RANGE).toEqual([64, 360])
    expect(ROW_HEIGHT_TIERS).toEqual([32, 40, 48])
    expect(FONT_SIZE_TIERS).toEqual([12, 13, 15])
    expect(PADDING_TIERS).toEqual([6, 10, 14])
  })
})

describe('layoutScales · clampColWidth / clampTier', () => {
  it('列宽边界钳制：超上界收 360、超下界收 64、界内四舍五入', () => {
    expect(clampColWidth(9999)).toBe(360)
    expect(clampColWidth(1)).toBe(64)
    expect(clampColWidth(140.4)).toBe(140)
    expect(clampColWidth(200)).toBe(200)
  })

  it('非有限输入收下界，不抛错', () => {
    expect(clampColWidth(Number.NaN)).toBe(64)
  })

  it('档位钳制到 1~3', () => {
    expect(clampTier(0)).toBe(1)
    expect(clampTier(3)).toBe(3)
    expect(clampTier(9)).toBe(3)
    expect(clampTier(2.4)).toBe(2)
    expect(clampTier(Number.NaN)).toBe(2)
  })
})

describe('layoutScales · visibleRowCount', () => {
  it('逻辑行 + 已占用区块行（锚点去重）', () => {
    const i = inst({
      blocks: [
        { id: 'b1', type: 'groupHeader', slotId: 'gap-1' },
        { id: 'b2', type: 'sectionBar', slotId: 'gap-2' },
      ],
      layout: {
        rowCount: 5,
        colCount: 4,
        blockSlots: [
          { id: 'gap-1', accept: ['groupHeader'], rowHint: 'after-1' },
          { id: 'gap-2', accept: ['sectionBar'], rowHint: 'after-3' },
        ],
      },
    })
    expect(visibleRowCount(i)).toBe(7) // 5 逻辑行 + after-1 + after-3
  })

  it('同锚点只算一行；footer/left-tag 等无 rowHint 不计', () => {
    const i = inst({
      blocks: [
        { id: 'b1', type: 'groupHeader', slotId: 'gap-1' },
        { id: 'b2', type: 'sectionBar', slotId: 'gap-1' },
        { id: 'b3', type: 'emphFooter', slotId: 'footer-1' },
      ],
      layout: {
        rowCount: 5,
        colCount: 4,
        blockSlots: [
          { id: 'gap-1', accept: ['groupHeader', 'sectionBar'], rowHint: 'after-2' },
          { id: 'footer-1', accept: ['emphFooter'], region: 'footer' },
        ],
      },
    })
    expect(visibleRowCount(i)).toBe(6)
  })

  it('无区块行 = 逻辑行数', () => {
    expect(visibleRowCount(inst({}))).toBe(5)
  })
})
