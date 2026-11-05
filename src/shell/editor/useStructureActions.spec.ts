import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { BLANK_V1, cloneInstance } from '@/core'
import { useEditorStore } from '../stores/editor'
import { useStructureActions } from './useStructureActions'
import { confirmAction } from '../ui/confirm'

// 草稿读写 mock（与 store spec 同口径）；确认框 mock 为自动确认（用例内可改/可断言调用）
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))
vi.mock('../ui/confirm', () => ({ confirmAction: vi.fn<() => Promise<boolean>>(async () => true) }))

/**
 * T02 批量动作单测（增量设计 A4）：
 * - 批量插/删全走 applyBatch = 一步撤销、任一失败整批回滚
 * - N=1 委托既有单点路径（文案零变化，tc095 口径）
 * - 删区间预检走 previewStructuralRange：blockedReason 直接白话 toast、不弹确认
 */

async function setup() {
  const store = useEditorStore()
  store.openTemplate(cloneInstance(BLANK_V1))
  const actions = useStructureActions()
  return { store, actions }
}

function gridRows(store: ReturnType<typeof useEditorStore>): number {
  return store.current!.layout.slotGrid!.length
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(confirmAction).mockClear()
  vi.mocked(confirmAction).mockResolvedValue(true)
})

describe('useStructureActions · removeRange（区间删除）', () => {
  it('空区间即删：无确认框、降序意图批一步删除、Toast 附撤销、一步完全复原', async () => {
    const { store, actions } = await setup()
    await actions.removeRange('row', 1, 3)
    expect(confirmAction).not.toHaveBeenCalled()
    expect(gridRows(store)).toBe(2)
    expect(store.toast).toBe('已删除第 2–4 行')
    expect(store.toastAction).toEqual({ label: '撤销' })
    // 选择迁移：区间后仍有项（原第 5 行移到区间起点）→ 落在 lo=1
    expect(store.structuralSelection).toEqual({ axis: 'row', index: 1 })
    // 一步撤销完全复原
    store.undo()
    expect(gridRows(store)).toBe(5)
  })

  it('含内容区间：一次确认框、摘要为区间聚合口径；确认后一步删除 + 一步撤销', async () => {
    const { store, actions } = await setup()
    // 第 2、3 行（0 基 1、2）各填一格内容
    store.setSlotText('u5', '区间内容甲')
    store.setSlotText('u9', '区间内容乙')
    await actions.removeRange('row', 1, 3)
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(vi.mocked(confirmAction).mock.calls[0]?.[0]).toMatchObject({
      title: '删除第 2–4 行',
      confirmText: '删除',
    })
    const message = vi.mocked(confirmAction).mock.calls[0]?.[0]?.message ?? ''
    expect(message).toContain('2 格内容')
    expect(message).toContain('确定删除？')
    expect(gridRows(store)).toBe(2)
    expect(store.toast).toBe('已删除第 2–4 行')
    // 确认路径不挂撤销按钮（与既有单点口径一致）
    expect(store.toastAction).toBeNull()
    store.undo()
    expect(gridRows(store)).toBe(5)
    expect(store.current?.slots['u5']).toMatchObject({ text: '区间内容甲' })
  })

  it('确认框取消：无任何变化（store 不变、选择保留）', async () => {
    const { store, actions } = await setup()
    store.setSlotText('u5', '取消后还在')
    store.structuralSelection = { axis: 'row', index: 1, rangeEnd: 3 }
    vi.mocked(confirmAction).mockResolvedValueOnce(false)
    await actions.removeRange('row', 1, 3)
    expect(confirmAction).toHaveBeenCalledTimes(1)
    expect(gridRows(store)).toBe(5)
    expect(store.current?.slots['u5']).toMatchObject({ text: '取消后还在' })
    expect(store.structuralSelection).toEqual({ axis: 'row', index: 1, rangeEnd: 3 })
  })

  it('区间含表头行：blockedReason 白话 toast，不弹确认、store 不变', async () => {
    const { store, actions } = await setup()
    await actions.removeRange('row', 0, 2)
    expect(confirmAction).not.toHaveBeenCalled()
    expect(store.toast).toBe('所选范围含表头行，不能删除')
    expect(gridRows(store)).toBe(5)
  })

  it('低于最低结构：置灰口径同源白话 toast，store 不变', async () => {
    const { store, actions } = await setup()
    // 先删到 3 行（表头 + 2 内容），再尝试删 2 行 → 3−2=1 < STRUCTURE_MIN_ROWS
    await actions.removeRange('row', 3, 4)
    expect(gridRows(store)).toBe(3)
    await actions.removeRange('row', 1, 2)
    expect(store.toast).toBe('至少保留 1 行表头和 1 行内容，不能再删了')
    expect(gridRows(store)).toBe(3)
  })

  it('区间后仍有剩余项：选择落在区间起点', async () => {
    const { store, actions } = await setup()
    await actions.removeRange('row', 1, 1) // 单行区间也允许（N=1 的批量入口由菜单分流，此处直测函数）
    expect(gridRows(store)).toBe(4)
    expect(store.structuralSelection).toEqual({ axis: 'row', index: 1 })
  })
})

describe('useStructureActions · insertRowsAt（区间插入）', () => {
  it('后插 3 行：一次插入 3 行、区间整体选中新对象组、Toast 写明数量与位置、一步撤销全消失', async () => {
    const { store, actions } = await setup()
    await actions.insertRowsAt(2, false, 3)
    expect(gridRows(store)).toBe(8)
    // 新行落在第 3 行起（0 基 2 之后），选择 = [3, 5]（0 基）
    expect(store.structuralSelection).toEqual({ axis: 'row', index: 3, rangeEnd: 5 })
    expect(store.toast).toBe('已在第 4 行下方插入 3 行')
    store.undo()
    expect(gridRows(store)).toBe(5)
  })

  it('前插 2 行：新行落在锚点行之前、Toast 口径一致', async () => {
    const { store, actions } = await setup()
    await actions.insertRowsAt(2, true, 2)
    expect(gridRows(store)).toBe(7)
    expect(store.structuralSelection).toEqual({ axis: 'row', index: 2, rangeEnd: 3 })
    expect(store.toast).toBe('已在第 3 行上方插入 2 行')
    store.undo()
    expect(gridRows(store)).toBe(5)
  })

  it('N=1 委托既有单点路径：Toast 文案与现状完全一致（tc095 口径）', async () => {
    const { store, actions } = await setup()
    await actions.insertRowsAt(2, false, 1)
    expect(gridRows(store)).toBe(6)
    expect(store.toast).toBe('已在第 4 行后插入一行')
    // 单点路径落单元格选择（非区间）
    expect(store.selectionRange).not.toBeNull()
    expect(store.structuralSelection).toBeNull()
  })
})

describe('useStructureActions · moveBlockBy（整块移动）', () => {
  it('合法：单条块移动意图、选区跟块走、一步撤销', async () => {
    const { store, actions } = await setup()
    await actions.moveBlockBy('row', 2, 2, 1) // 块 [2,3] 下移一格 → 落在 [3,4]
    expect(store.toast).toBe('已下移')
    expect(store.structuralSelection).toEqual({ axis: 'row', index: 3, rangeEnd: 4 })
    const grid = store.current!.layout.slotGrid!
    // 原第 2、3 行整体搬到第 4、5 行位置
    expect(grid[3]!.join()).toBe('u9,u10,u11,u12')
    expect(grid[4]!.join()).toBe('u13,u14,u15,u16')
    store.undo()
    expect(store.current!.layout.slotGrid![2]!.join()).toBe('u9,u10,u11,u12')
  })

  it('非法（越界）：moveBlockGate 白话 toast，store 不变', async () => {
    const { store, actions } = await setup()
    await actions.moveBlockBy('row', 3, 2, 1) // to=4，to+count−1=5 越界
    expect(store.toast).toBe('这一段行不存在')
    expect(gridRows(store)).toBe(5)
  })

  it('非法（合并区交错）：块内合并不拦、跨块合并区拦截', async () => {
    const { store, actions } = await setup()
    // 块内合并区（行 2–3 整块内）随块走：合法
    store.apply({ kind: 'merge', range: { start: [2, 0], end: [3, 3] } })
    await actions.moveBlockBy('row', 2, 2, 1)
    expect(store.toast).toBe('已下移')
    store.undo()
    store.undo() // 撤移动、撤合并
    // 跨块合并区（行 1–2 横跨块边界）→ 拦截
    store.apply({ kind: 'merge', range: { start: [1, 0], end: [2, 3] } })
    await actions.moveBlockBy('row', 2, 2, 1)
    expect(store.toast).toContain('合并区交错')
    expect(store.current!.layout.slotGrid!.length).toBe(5)
  })
})

describe('useStructureActions · pastePending 防线', () => {
  it('粘贴预览期区间删除/批量插入全部拦截', async () => {
    const { store, actions } = await setup()
    store.selectedSlotId = 'u5'
    expect(store.pasteStart({ text: '甲\t乙' })).toBe(true)
    expect(store.pastePending).toBe(true)
    await actions.removeRange('row', 1, 3)
    await actions.insertRowsAt(2, false, 3)
    await actions.moveBlockBy('row', 2, 2, 1)
    expect(gridRows(store)).toBe(5)
    expect(store.toast).toBe('请先确认或取消粘贴')
    store.cancelPaste()
  })
})
