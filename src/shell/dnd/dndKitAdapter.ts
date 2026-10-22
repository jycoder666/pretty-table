/**
 * dnd-kit adapter — pointer / touch only (T12 / D-22).
 * Keyboard placement is owned by placeMode + SlotOverlay, never KeyboardSensor.
 */
import { PointerSensor, KeyboardSensor } from '@dnd-kit/vue'
import type { BlockType } from '@/core'

/** Replace default sensors so KeyboardSensor is never registered. */
export const pointerOnlySensors = [PointerSensor]

export function isKeyboardSensorRegistered(sensors: unknown[]): boolean {
  return sensors.some((s) => s === KeyboardSensor)
}

export type BlockDragData = {
  blockType: BlockType
}

export function readBlockType(data: unknown): BlockType | null {
  if (!data || typeof data !== 'object') return null
  const t = (data as { blockType?: unknown }).blockType
  if (t === 'sectionBar' || t === 'groupHeader' || t === 'emphFooter' || t === 'leftTag') return t
  return null
}

/**
 * WP4：拖拽载荷（库页拖入 vs 表内换位共用一个 DnD provider）。
 * blockId 有值 = 表内已有区块在拖动（落点走 moveBlock 而不是 addBlock）。
 */
export type BlockDragPayload = {
  type: BlockType
  blockId?: string
  fromSlotId?: string
}

export function readBlockDrag(data: unknown): BlockDragPayload | null {
  const type = readBlockType(data)
  if (!type) return null
  const d = data as { blockId?: unknown; fromSlotId?: unknown }
  return {
    type,
    blockId: typeof d.blockId === 'string' ? d.blockId : undefined,
    fromSlotId: typeof d.fromSlotId === 'string' ? d.fromSlotId : undefined,
  }
}
