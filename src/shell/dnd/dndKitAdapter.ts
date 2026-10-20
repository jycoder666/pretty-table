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
