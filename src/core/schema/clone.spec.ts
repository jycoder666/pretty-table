import { describe, expect, it } from 'vitest'
import { snapshotForUndo } from './clone'
import { COMPARE_ALPHA_V1 } from '../templates'
import { cloneInstance } from './validate'

/**
 * E3 多次撤销：快照拷贝约定（见 clone.ts 头注释）。
 * - image 槽对象整体浅拷贝（{...v}），data URL 字符串按引用共享 → 栈内存不随图片体积放大
 * - 其余结构递归深拷贝，快照之间 / 快照与 current 互不串扰
 */

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='

describe('snapshotForUndo（E3 快照拷贝）', () => {
  it('含 image 键的槽对象：整体浅拷贝，data URL 与原对象同引用（共享不复制）', () => {
    const slot = { image: IMG }
    const out = snapshotForUndo({ slots: { u7: slot } }) as { slots: { u7: { image: string } } }
    // 浅拷贝：槽对象是副本，不是同一个引用
    expect(out.slots.u7).not.toBe(slot)
    // image 字符串共享（字符串不可变，按引用复用）
    expect(out.slots.u7.image).toBe(slot.image)
    // 值相等
    expect(out.slots.u7).toEqual(slot)
  })

  it('嵌套 image（slots → 槽值对象）也能命中浅拷贝分支；无图对象逐键深拷贝', () => {
    const inst = {
      slots: {
        img: { image: IMG },
        text: { text: '甲', align: 'left' as const },
        nested: { deep: { list: [1, 2, { text: '乙' }] } },
      },
    }
    const out = snapshotForUndo(inst)
    expect(out).toEqual(inst)
    // 深拷贝：嵌套结构互不共享
    expect(out).not.toBe(inst)
    const outRec = out as typeof inst
    expect(outRec.slots.text).not.toBe(inst.slots.text)
    expect(outRec.slots.nested).not.toBe(inst.slots.nested)
    expect((outRec.slots.nested.deep.list[2] as { text: string })).not.toBe(
      inst.slots.nested.deep.list[2],
    )
    // image 槽：副本对象 + 共享字符串
    expect(outRec.slots.img).not.toBe(inst.slots.img)
    expect(outRec.slots.img.image).toBe(IMG)
  })

  it('数组与原始值：数组逐项拷贝，primitive 原样返回', () => {
    const out = snapshotForUndo([1, 'a', [2, 3], { image: IMG }]) as unknown[]
    expect(out).toEqual([1, 'a', [2, 3], { image: IMG }])
    expect(out[0]).toBe(1)
    expect(out[2]).not.toBe((snapshotForUndo([1, 'a', [2, 3]]) as unknown[])[2])
    expect(out[2]).not.toBe([2, 3])
  })

  it('与 current 实例隔离：改快照不影响原实例，改原实例不影响快照', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.4.val.a'] = { text: '原始' }
    const snap = snapshotForUndo(inst)
    inst.slots['row.4.val.a'] = { text: '被改' }
    expect((snap.slots['row.4.val.a'] as { text: string }).text).toBe('原始')
    const snapRec = snap as typeof inst
    snapRec.layout.rowCount = 99
    expect(inst.layout.rowCount).not.toBe(99)
  })
})
