import { describe, expect, it } from 'vitest'
import { KeyboardSensor, PointerSensor } from '@dnd-kit/vue'
import {
  isKeyboardSensorRegistered,
  pointerOnlySensors,
  readBlockType,
} from './dndKitAdapter'

describe('dndKitAdapter', () => {
  it('pointerOnlySensors is PointerSensor only (no KeyboardSensor)', () => {
    expect(pointerOnlySensors).toEqual([PointerSensor])
    expect(isKeyboardSensorRegistered(pointerOnlySensors)).toBe(false)
    expect(isKeyboardSensorRegistered([PointerSensor, KeyboardSensor])).toBe(true)
  })

  it('readBlockType reads drag data', () => {
    expect(readBlockType({ blockType: 'sectionBar' })).toBe('sectionBar')
    expect(readBlockType({})).toBeNull()
    expect(readBlockType(null)).toBeNull()
  })
})
