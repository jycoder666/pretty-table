import { describe, expect, it } from 'vitest'
import type { TemplateInstance } from '../types'
import { buildVisualRows, toOption } from './toOption'
import { PALETTES } from '../theme/palettes'
import { COMPARE_ALPHA_V1 } from '../templates'
import { cloneInstance } from '../schema/validate'

function withSlots(patch: (inst: TemplateInstance) => void): TemplateInstance {
  const inst = cloneInstance(COMPARE_ALPHA_V1)
  patch(inst)
  return inst
}

function cellStyle(opt: Record<string, unknown>, row: number, col: number): Record<string, unknown> {
  const cols = opt.columns as { style: (a: { row: number; col: number }) => Record<string, unknown> }[]
  return cols[col]!.style({ row, col })
}

describe('toOption · 语义单元格（FR-21/22）', () => {
  it('{mark:"yes"} 显示 ✓ 居中、色随主题（TC-PT-073）', () => {
    const inst = withSlots((i) => {
      i.slots['row.2.val.a'] = { mark: 'yes' }
    })
    const { metas } = buildVisualRows(inst)
    const cell = metas[3]![1]!
    expect(cell.text).toBe('✓')
    expect(cell.align).toBe('center')

    const opt = toOption(inst, { mode: 'preview' })
    const style = cellStyle(opt, 3, 1)
    expect(style.color).toBe(PALETTES['T-A'].primary)
  })

  it('切 T-B 颜色跟变（TC-PT-074）', () => {
    const inst = withSlots((i) => {
      i.themeId = 'T-B'
      i.slots['row.2.val.a'] = { mark: 'no' }
    })
    const opt = toOption(inst, { mode: 'preview' })
    expect(cellStyle(opt, 3, 1).color).toBe(PALETTES['T-B'].emphasis)
    const inst2 = withSlots((i) => {
      i.themeId = 'T-B'
      i.slots['row.2.val.a'] = { mark: 'yes' }
    })
    expect(cellStyle(toOption(inst2, { mode: 'preview' }), 3, 1).color).toBe(PALETTES['T-B'].primary)
  })

  it('mark 槽存普通文字「面议」→ 按文字显示不套格式', () => {
    const inst = withSlots((i) => {
      i.slots['row.2.val.a'] = '面议'
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[3]![1]!.text).toBe('面议')
    expect(metas[3]![1]!.mark).toBeUndefined()
    const opt = toOption(inst, { mode: 'preview' })
    expect((opt.records as Record<string, string>[])[3]!.c1).toBe('面议')
    expect(cellStyle(opt, 3, 1).color).not.toBe(PALETTES['T-A'].primary)
  })

  it('{num} + percent → 25%；currency → ¥1,200.00（TC-PT-076～079）', () => {
    const inst = withSlots((i) => {
      i.slotDefs = {
        ...i.slotDefs,
        'row.2.val.a': { kind: 'number', format: 'percent' },
      }
      i.slots['row.2.val.a'] = { num: 0.25 }
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[3]![1]!.text).toBe('25%')
    expect(metas[3]![1]!.align).toBe('right')

    const inst2 = withSlots((i) => {
      i.slotDefs = {
        ...i.slotDefs,
        'row.2.val.a': { kind: 'number', format: 'currency', currency: 'CNY' },
      }
      i.slots['row.2.val.a'] = { num: 1200 }
    })
    const metas2 = buildVisualRows(inst2).metas
    expect(metas2[3]![1]!.text).toBe('¥1,200.00')
  })

  it('num 槽存普通文字「100万」→ 按文字显示不套格式', () => {
    const inst = withSlots((i) => {
      i.slots['row.5.val.a'] = '100万'
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[6]![1]!.text).toBe('100万')
  })
})

describe('toOption · 推荐列（FR-23）', () => {
  it('推荐列表头加角标文字', () => {
    const inst = withSlots((i) => {
      i.highlight = { recommendCol: 2 }
    })
    const { metas } = buildVisualRows(inst)
    expect(metas[1]![2]!.badge).toBe('推荐')
    expect(metas[1]![1]!.badge).toBeUndefined()
  })

  it('推荐列浅底优先于斑马纹', () => {
    const inst = withSlots((i) => {
      i.highlight = { recommendCol: 1 }
    })
    const opt = toOption(inst, { mode: 'preview' })
    // 第 3 行（visual row 3，奇数）在开启斑马纹时：推荐列 1 用 emphasisSoft，列 2 用斑马色
    expect(cellStyle(opt, 3, 1).bgColor).toBe(PALETTES['T-A'].emphasisSoft)
    expect(cellStyle(opt, 3, 2).bgColor).toBe(PALETTES['T-A'].zebra)
    expect(cellStyle(opt, 3, 1).bgColor).not.toBe(cellStyle(opt, 3, 2).bgColor)
  })

  it('无推荐列时保持斑马纹', () => {
    const opt = toOption(COMPARE_ALPHA_V1, { mode: 'preview' })
    expect(cellStyle(opt, 3, 1).bgColor).toBe(PALETTES['T-A'].zebra)
  })
})
