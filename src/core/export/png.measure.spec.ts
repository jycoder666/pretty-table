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

// ── 自定义格式 T03：colWidths / 行高档位反映到 PNG 尺寸预估 ──

describe('PNG measure · 排版档位与列宽（T03）', () => {
  it('colWidths 求和改变 contentWidth；行高档位改变 contentHeight', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1) // 4 列 10 行 2 级表头
    const base = measureContentSize(inst)
    inst.layout.style = { rowHeightTier: 3, colWidths: [200, 200, 200, 200] }
    const scaled = measureContentSize(inst)
    // 宽：4 × 200 + 2
    expect(scaled.width).toBe(4 * 200 + 2)
    // 高：行高 48（10 逻辑行）+ 两个区块槽行各 32（after-1 已占用、after-5 占位）+ 2
    expect(scaled.height).toBe(10 * 48 + 2 * 32 + 2)
    // PNG 倍率预估跟随
    const m = measurePng(inst, 2)
    expect(m.outWidth).toBe((scaled.width + 32) * 2)
    expect(m.outHeight).toBe((scaled.height + 32) * 2)
    expect(base.width).toBeGreaterThan(0)
  })
})
