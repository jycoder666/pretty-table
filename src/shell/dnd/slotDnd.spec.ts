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
    expect(ok.kind === 'addBlock' ? ok.block.slotId : '').toBe('gap-g2')
  })
})
