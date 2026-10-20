import type { BlockType, EditIntent } from '@/core'
import type { DropTarget } from './slotDnd'

export interface PlaceMode {
  active: boolean
  blockType: BlockType | null
  targets: DropTarget[]
  focusIndex: number
}

export function idlePlaceMode(): PlaceMode {
  return { active: false, blockType: null, targets: [], focusIndex: 0 }
}

/** Keep only slots that accept `type`; focus the first. */
export function enterPlaceMode(type: BlockType, targets: DropTarget[]): PlaceMode {
  const filtered = targets.filter((t) => t.accept.includes(type))
  return {
    active: true,
    blockType: type,
    targets: filtered,
    focusIndex: 0,
  }
}

/** Cycle focus among placeable slots only (↑↓ / Tab). */
export function moveFocus(m: PlaceMode, dir: 1 | -1): PlaceMode {
  const n = m.targets.length
  if (!m.active || n === 0) return m
  const focusIndex = (((m.focusIndex + dir) % n) + n) % n
  return { ...m, focusIndex }
}

export function confirmPlace(m: PlaceMode): EditIntent | null {
  if (!m.active || !m.blockType) return null
  const t = m.targets[m.focusIndex]
  if (!t) return null
  return {
    kind: 'addBlock',
    block: {
      id: 'pending',
      type: m.blockType,
      slotId: t.blockSlotId,
      props: {},
    },
  }
}

/** Screen-reader line for keyboard place mode (1-based index). */
export function announce(m: PlaceMode): string {
  const n = m.targets.length
  const i = n === 0 ? 0 : m.focusIndex + 1
  return `第 ${i} 个槽位，共 ${n} 个，按回车放入`
}
