import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, cloneInstance, type MergeRange } from '@/core'
import { estimateCellRects } from '../dnd/slotDnd'
import { expandRectSelection, selectionCellRects } from './selection'

/**
 * R-2 Shift 矩形选区（交互升级 T04）：
 * - 点起点 + Shift 点终点 → 两点围成矩形（逐轴 min/max 归一化）
 * - 选区可视化：逻辑选区映射到可视格矩形（壳叠加层；PX-04 v2 几何由渲染核提供，
 *   无核回退 estimateCellRects —— 本测试走回退口径）
 */
describe('R-2 Shift 矩形选区', () => {
  it('expandRectSelection：终点在起点各方向 → 归一化矩形', () => {
    const a = expandRectSelection(
      { start: [3, 1], end: [3, 1] } as MergeRange,
      5,
      0,
    )
    expect(a).toEqual({ start: [3, 0], end: [5, 1] })
    const b = expandRectSelection(
      { start: [5, 2], end: [5, 2] } as MergeRange,
      1,
      1,
    )
    expect(b).toEqual({ start: [1, 1], end: [5, 2] })
    // 终点 = 起点保持单格
    const c = expandRectSelection(
      { start: [2, 1], end: [2, 1] } as MergeRange,
      2,
      1,
    )
    expect(c).toEqual({ start: [2, 1], end: [2, 1] })
  })

  // WP2 框选：锚点格 = 单格选区，指针拖到任意方向都归一化成同一矩形（四方向等价）
  it('expandRectSelection：框选反向拖（右下 → 左上）与正向拖得到同一矩形', () => {
    const toTopLeft = expandRectSelection({ start: [4, 3], end: [4, 3] } as MergeRange, 2, 1)
    const toBottomRight = expandRectSelection({ start: [2, 1], end: [2, 1] } as MergeRange, 4, 3)
    expect(toTopLeft).toEqual({ start: [2, 1], end: [4, 3] })
    expect(toBottomRight).toEqual(toTopLeft)
  })

  it('selectionCellRects：单格选区 → 1 块可视格矩形（gap 行偏移正确）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    // 逻辑行 3 → 可视行 4（after-1 gap 占 1 行）
    const rects = selectionCellRects(
      inst,
      { start: [3, 1], end: [3, 1] } as MergeRange,
      estimateCellRects(inst),
    )
    expect(rects).toHaveLength(1)
    expect(rects[0]!.width).toBe(140) // col 1 默认列宽（LABEL 120 / 其他 140）
  })

  it('selectionCellRects：2×2 矩形选区 → 4 块', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const rects = selectionCellRects(
      inst,
      { start: [3, 1], end: [4, 2] } as MergeRange,
      estimateCellRects(inst),
    )
    expect(rects).toHaveLength(4)
  })

  it('selectionCellRects：合并区选区收成一块（WP1 同合并区并成外接矩形）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    // [0,1]-[0,2] 是既有合并区（逻辑坐标）→ 描边一块，不画内部假分隔线
    const rects = selectionCellRects(
      inst,
      { start: [0, 1], end: [0, 2] } as MergeRange,
      estimateCellRects(inst),
    )
    expect(rects).toHaveLength(1)
    expect(rects[0]!.width).toBe(140 * 2)
  })

  it('selectionCellRects：部分覆盖合并区 → 只圈选中的格（外接矩形，不扩到整个合并区）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    // 合并区 [0,1]-[0,2] 只选中 C1 一列
    const rects = selectionCellRects(
      inst,
      { start: [0, 1], end: [0, 1] } as MergeRange,
      estimateCellRects(inst),
    )
    expect(rects).toHaveLength(1)
    expect(rects[0]!.width).toBe(140)
  })
})
