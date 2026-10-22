import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, cloneInstance, type MergeRange, type TemplateInstance } from '@/core'
import {
  cellSelection,
  editableCellAt,
  extendSelection,
  gridSize,
  moveSelection,
  selectionToTsv,
  tabSelection,
  visualRowOfCell,
} from './cellNav'

/**
 * WP3 键盘导航 / 复制口径（纯函数）：
 * - 方向键折叠到相邻格，落到合并区扩成整块，越界原位不动
 * - Shift+方向键沿方向扩选，起点锚定
 * - Tab / Shift+Tab 行内绕行
 * - Ctrl+C 口径：选区 → TSV（合并区只在左上出值、图片格不出值）
 */

const sel = (r0: number, c0: number, r1: number, c1: number): MergeRange => ({
  start: [r0, c0],
  end: [r1, c1],
})

/** 矩阵模板：R0 是表头（C1–C2 合并），表体 R1 起 */
function matrix(): TemplateInstance {
  return cloneInstance(COMPARE_ALPHA_V1)
}

describe('WP3 方向键移动选区', () => {
  it('gridSize：取自 slotGrid（行/列）', () => {
    const inst = matrix()
    const g = gridSize(inst)
    expect(g.rows).toBe(inst.layout.slotGrid!.length)
    expect(g.cols).toBe(inst.layout.slotGrid![0]!.length)
  })

  it('单格右移/下移；越界保持原位', () => {
    const inst = matrix()
    const g = gridSize(inst)
    const start = sel(2, 1, 2, 1)
    expect(moveSelection(inst, start, 0, 1)).toEqual(sel(2, 2, 2, 2))
    expect(moveSelection(inst, start, 1, 0)).toEqual(sel(3, 1, 3, 1))
    // 左下角再往左/往下 → 不动
    const corner = sel(g.rows - 1, 0, g.rows - 1, 0)
    expect(moveSelection(inst, corner, 0, -1)).toEqual(corner)
    expect(moveSelection(inst, corner, 1, 0)).toEqual(corner)
  })

  it('多格选区按方向键折叠成相邻单格（Excel 语义）', () => {
    const inst = matrix()
    expect(moveSelection(inst, sel(3, 1, 4, 2), 0, 1)).toEqual(sel(3, 2, 3, 2))
  })

  it('目标落在合并区 → 整块选中（与点击选格同口径）', () => {
    const inst = matrix()
    // [0,1]-[0,2] 是既有合并区：从 [0,0] 右移落到合并区 → 扩成整块
    const landed = moveSelection(inst, sel(0, 0, 0, 0), 0, 1)
    expect(landed).toEqual(sel(0, 1, 0, 2))
    expect(cellSelection(inst, 0, 2)).toEqual(sel(0, 1, 0, 2))
  })
})

describe('WP3 Shift+方向键扩选', () => {
  it('向右扩一格；起点锚定不动', () => {
    const inst = matrix()
    expect(extendSelection(inst, sel(2, 1, 2, 1), 0, 1)).toEqual(sel(2, 1, 2, 2))
  })

  it('向上扩（反向）归一化成矩形', () => {
    const inst = matrix()
    expect(extendSelection(inst, sel(3, 1, 3, 1), -1, 0)).toEqual(sel(2, 1, 3, 1))
  })

  it('扩到边界外 → 保持原选区（不绕行）', () => {
    const inst = matrix()
    const g = gridSize(inst)
    const atEdge = sel(0, 0, 0, 0)
    expect(extendSelection(inst, atEdge, -1, 0)).toEqual(atEdge)
    const atRight = sel(1, g.cols - 1, 1, g.cols - 1)
    expect(extendSelection(inst, atRight, 0, 1)).toEqual(atRight)
  })

  it('新终点落在合并区 → 终点扩到合并区边界', () => {
    const inst = matrix()
    // 起点 [1,0]（表体首格），向上扩到合并区 [0,1]-[0,2] 覆盖的行 → 终点扩到 C2
    const extended = extendSelection(inst, sel(1, 0, 1, 1), -1, 1)
    expect(extended).toEqual(sel(0, 0, 1, 2))
  })
})

describe('WP3 Tab 跳格', () => {
  it('右移一格；行末绕到下一行行首', () => {
    const inst = matrix()
    const g = gridSize(inst)
    expect(tabSelection(inst, sel(2, 1, 2, 1))).toEqual(sel(2, 2, 2, 2))
    expect(tabSelection(inst, sel(2, g.cols - 1, 2, g.cols - 1))).toEqual(sel(3, 0, 3, 0))
  })

  it('Shift+Tab 左移；行首绕到上一行行末', () => {
    const inst = matrix()
    const g = gridSize(inst)
    expect(tabSelection(inst, sel(2, 1, 2, 1), true)).toEqual(sel(2, 0, 2, 0))
    expect(tabSelection(inst, sel(2, 0, 2, 0), true)).toEqual(sel(1, g.cols - 1, 1, g.cols - 1))
  })

  it('最后一个格再 Tab → 原位不动', () => {
    const inst = matrix()
    const g = gridSize(inst)
    const last = sel(g.rows - 1, g.cols - 1, g.rows - 1, g.cols - 1)
    expect(tabSelection(inst, last)).toEqual(last)
  })
})

describe('WP3 复制口径 selectionToTsv', () => {
  it('单格复制 → 该格文案（无换行）', () => {
    const inst = matrix()
    const sid = inst.layout.slotGrid![1]![1]!
    inst.slots[sid] = '手机'
    expect(selectionToTsv(inst, sel(1, 1, 1, 1))).toBe('手机')
  })

  it('2×2 → 两行两列、行 \\n 列 \\t，空格位输出空串', () => {
    const inst = matrix()
    const g = inst.layout.slotGrid!
    inst.slots[g[1]![1]!] = 'A'
    inst.slots[g[1]![2]!] = 'B'
    inst.slots[g[2]![1]!] = 'C'
    inst.slots[g[2]![2]!] = ''
    expect(selectionToTsv(inst, sel(1, 1, 2, 2))).toBe('A\tB\nC\t')
  })

  it('合并区只在左上出值，其余格留空', () => {
    const inst = matrix()
    // [0,1]-[0,2] 既有合并区
    const sid = inst.layout.slotGrid![0]![1]!
    inst.slots[sid] = '条目'
    expect(selectionToTsv(inst, sel(0, 1, 0, 2))).toBe('条目\t')
  })

  it('图片格不出值（data URL 不进剪贴板）', () => {
    const inst = matrix()
    const sid = inst.layout.slotGrid![1]![1]!
    inst.slots[sid] = 'data:image/png;base64,iVBORw0KGgo='
    expect(selectionToTsv(inst, sel(1, 1, 1, 1))).toBe('')
  })
})

describe('WP3 就地编辑目标 editableCellAt', () => {
  it('普通文本格 → text（带原始文案与对齐）', () => {
    const inst = matrix()
    const sid = inst.layout.slotGrid![1]![1]!
    inst.slots[sid] = { text: 'vivo X200', align: 'right' }
    const target = editableCellAt(inst, 1, 1)
    expect(target.kind).toBe('text')
    expect(target.kind === 'text' ? target.slotId : '').toBe(sid)
    expect(target.kind === 'text' ? target.text : '').toBe('vivo X200')
    expect(target.kind === 'text' ? target.align : 'left').toBe('right')
  })

  it('合并区任意格 → 落到左上格槽（内容同源）', () => {
    const inst = matrix()
    const sid = inst.layout.slotGrid![0]![1]!
    inst.slots[sid] = '条目'
    const target = editableCellAt(inst, 0, 2)
    expect(target.kind === 'text' ? target.slotId : '').toBe(sid)
  })

  it('只读格 → readonly', () => {
    const inst = matrix()
    const rc = inst.layout.readonlyCells?.[0]
    expect(rc).toBeTruthy()
    expect(editableCellAt(inst, rc![0], rc![1]).kind).toBe('readonly')
  })

  it('图片格 → image（改图走右栏）', () => {
    const inst = matrix()
    const sid = inst.layout.slotGrid![1]![1]!
    inst.slots[sid] = { image: 'data:image/png;base64,iVBORw0KGgo=' }
    expect(editableCellAt(inst, 1, 1).kind).toBe('image')
  })

  it('标记/数值槽 → typed（语义值不在文本框里改）', () => {
    const inst = matrix()
    const sid = inst.layout.slotGrid![1]![1]!
    inst.slots[sid] = { mark: 'yes' }
    expect(editableCellAt(inst, 1, 1).kind).toBe('typed')
    inst.slots[sid] = { num: 3 }
    expect(editableCellAt(inst, 1, 1).kind).toBe('typed')
  })

  it('越界 → empty', () => {
    const inst = matrix()
    const g = gridSize(inst)
    expect(editableCellAt(inst, g.rows, 0).kind).toBe('empty')
    expect(editableCellAt(inst, 0, -1).kind).toBe('empty')
  })
})

describe('WP3 编辑浮层定位', () => {
  it('visualRowOfCell：逻辑行 → 可视行（区块行占位后位移）', () => {
    const inst = matrix()
    // after-1 gap：逻辑行 3 → 可视行 4
    expect(visualRowOfCell(inst, 3)).toBe(4)
    expect(visualRowOfCell(inst, 0)).toBe(0)
    expect(visualRowOfCell(inst, 999)).toBe(null)
  })
})
