import { describe, expect, it } from 'vitest'
import { announce, confirmPlace, enterPlaceMode, idlePlaceMode, moveFocus } from './placeMode'
import type { DropTarget } from './slotDnd'

function t(id: string, accept: DropTarget['accept'] = ['sectionBar', 'groupHeader']): DropTarget {
  return { blockSlotId: id, rect: new DOMRect(0, 0, 100, 32), accept }
}

describe('placeMode', () => {
  it('enterPlaceMode keeps only accepting slots and focuses first', () => {
    const m = enterPlaceMode('sectionBar', [
      t('gap-g1'),
      t('footer-1', ['emphFooter']),
      t('gap-g2'),
    ])
    expect(m.active).toBe(true)
    expect(m.blockType).toBe('sectionBar')
    expect(m.targets.map((x) => x.blockSlotId)).toEqual(['gap-g1', 'gap-g2'])
    expect(m.focusIndex).toBe(0)
  })

  it('moveFocus cycles with ↓/↑ without visiting table cells', () => {
    const m0 = enterPlaceMode('groupHeader', [t('a'), t('b'), t('c')])
    const m1 = moveFocus(m0, 1)
    expect(m1.focusIndex).toBe(1)
    const m2 = moveFocus(m1, 1)
    expect(m2.focusIndex).toBe(2)
    const m3 = moveFocus(m2, 1)
    expect(m3.focusIndex).toBe(0)
    const m4 = moveFocus(m3, -1)
    expect(m4.focusIndex).toBe(2)
  })

  it('confirmPlace yields addBlock intent; idle has none', () => {
    const m = enterPlaceMode('sectionBar', [t('gap-g1'), t('gap-g2')])
    const focused = moveFocus(m, 1)
    const intent = confirmPlace(focused)
    expect(intent).toEqual({
      kind: 'addBlock',
      block: {
        id: 'pending',
        type: 'sectionBar',
        slotId: 'gap-g2',
        props: {},
      },
    })
    expect(confirmPlace(idlePlaceMode())).toBeNull()
  })

  it('announce uses 1-based index', () => {
    const m = moveFocus(enterPlaceMode('sectionBar', [t('a'), t('b'), t('c')]), 1)
    expect(announce(m)).toBe('第 2 个槽位，共 3 个，按回车放入')
  })
})
