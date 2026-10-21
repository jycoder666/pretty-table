import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '@/core'
import { cloneInstance } from '@/core'
import { computeDropTargets, estimateCellRects, resolveDrop } from './slotDnd'

describe('slotDnd', () => {
  it('computeDropTargets emits blockSlots top-to-bottom with between-row gaps first', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const cells = estimateCellRects(inst)
    const targets = computeDropTargets(inst, cells)
    const ids = targets.map((t) => t.blockSlotId)
    expect(ids[0]).toBe('gap-g1')
    expect(ids[1]).toBe('gap-g2')
    expect(ids).toContain('footer-1')
    expect(ids).toContain('left-r2')
    expect(targets.length).toBe(inst.layout.blockSlots.length)
  })

  it('resolveDrop null → SLOT_DROP_BLOCKED; wrong type → BLOCK_TYPE_REJECT', () => {
    expect(resolveDrop(null, 'sectionBar')).toEqual({ reject: 'SLOT_DROP_BLOCKED' })
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const targets = computeDropTargets(inst, estimateCellRects(inst))
    const footer = targets.find((t) => t.blockSlotId === 'footer-1')!
    expect(resolveDrop(footer, 'sectionBar')).toEqual({ reject: 'BLOCK_TYPE_REJECT' })
    const gap = targets.find((t) => t.blockSlotId === 'gap-g2')!
    const ok = resolveDrop(gap, 'groupHeader')
    expect('reject' in ok).toBe(false)
    const droppedSlotId = !('reject' in ok) && ok.kind === 'addBlock' ? ok.block.slotId : ''
    expect(droppedSlotId).toBe('gap-g2')
  })

  it('PX-04：单元格矩形与停放区宽度随生效列宽变化（与渲染同源）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { colWidths: [64, 360] }
    const cells = estimateCellRects(inst)
    // 首列 64、次列 360，第 3 列回默认 140
    expect(cells[0]![0]!.width).toBe(64)
    expect(cells[0]![1]!.width).toBe(360)
    expect(cells[0]![1]!.left).toBe(64)
    expect(cells[0]![2]!.width).toBe(140)
    expect(cells[0]![2]!.left).toBe(424)
    // 尾部停放区（footer 等不占行区块）宽度 = 生效列宽合计
    const targets = computeDropTargets(inst, cells)
    const footer = targets.find((t) => t.blockSlotId === 'footer-1')!
    const totalW = cells[0]!.reduce((acc, r) => acc + r.width, 0)
    expect(footer.rect.width).toBe(totalW)
    expect(footer.rect.width).toBe(64 + 360 + 140 * (inst.layout.colCount - 2))
  })
})
