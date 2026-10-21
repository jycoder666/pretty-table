import { describe, expect, it } from 'vitest'
import { BLANK_V1, COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { locateVisual } from './previewHit'

/**
 * PX-04：点选命中与 toOption 渲染同源——
 * 设了 colWidths / 行高档位 / 区块行后，命中边界随之变化，不再硬编码 120/140/36。
 */

describe('locateVisual — 预览点选命中（PX-04）', () => {
  it('默认几何：首列 120、其余 140、行高 36（与既有渲染一致）', () => {
    const inst = cloneInstance(BLANK_V1)
    expect(locateVisual(inst, 10, 10)).toEqual({ row: 0, col: 0 })
    expect(locateVisual(inst, 130, 10)).toEqual({ row: 0, col: 1 })
    expect(locateVisual(inst, 270, 10)).toEqual({ row: 0, col: 2 })
    expect(locateVisual(inst, 130, 40)).toEqual({ row: 1, col: 1 })
  })

  it('设 colWidths 后命中随生效列宽变化', () => {
    const inst = cloneInstance(BLANK_V1)
    inst.layout.style = { colWidths: [200, 80, 80, 80] }
    // x=130：默认几何属第 2 列，现在仍在首列（200 宽）
    expect(locateVisual(inst, 130, 10)).toEqual({ row: 0, col: 0 })
    // x=210：首列结束 → 第 2 列
    expect(locateVisual(inst, 210, 10)).toEqual({ row: 0, col: 1 })
  })

  it('null 列宽回默认宽（与渲染口径一致）', () => {
    const inst = cloneInstance(BLANK_V1)
    inst.layout.style = { colWidths: [null, 64] }
    // 首列 null → 默认 120
    expect(locateVisual(inst, 119, 10)).toEqual({ row: 0, col: 0 })
    expect(locateVisual(inst, 130, 10)).toEqual({ row: 0, col: 1 })
    // 第 2 列 64 宽：120+64=184 之后是第 3 列（默认 140）
    expect(locateVisual(inst, 190, 10)).toEqual({ row: 0, col: 2 })
  })

  it('行高档位联动：紧凑 32px 时 y=34 已属第 2 行', () => {
    const inst = cloneInstance(BLANK_V1)
    inst.layout.style = { rowHeightTier: 1 }
    expect(locateVisual(inst, 10, 34)).toEqual({ row: 1, col: 0 })
    expect(locateVisual(inst, 10, 30)).toEqual({ row: 0, col: 0 })
  })

  it('区块行（32px）参与行定位', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.blocks.push({
      id: 'b-test',
      type: 'groupHeader',
      slotId: 'gap-g1',
      props: { text: '分组' },
    })
    // gap-g1 锚在 after-1 → 可视行高序列 [36, 36, 32, 36, ...]
    expect(locateVisual(inst, 10, 34)).toEqual({ row: 0, col: 0 })
    expect(locateVisual(inst, 10, 37)).toEqual({ row: 1, col: 0 }) // 逻辑行 1
    expect(locateVisual(inst, 10, 73)).toEqual({ row: 2, col: 0 }) // 区块行
    expect(locateVisual(inst, 10, 105)).toEqual({ row: 3, col: 0 }) // 逻辑行 2
  })

  it('越界返回 null（表外/行尾点击不误命中）', () => {
    const inst = cloneInstance(BLANK_V1)
    expect(locateVisual(inst, 10, 999)).toBeNull()
    expect(locateVisual(inst, 999, 10)).toBeNull()
  })
})
