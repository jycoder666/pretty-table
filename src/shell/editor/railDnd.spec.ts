import { describe, expect, it, beforeEach } from 'vitest'
import {
  RAIL_DRAG_THRESHOLD,
  boundaryIsHome,
  boundaryToTarget,
  pickBoundary,
  railDrag,
  resetRailDrag,
} from './railDnd'
import type { RailItem } from './railGeometry'

/**
 * T03 落点映射与边界判定纯函数单测（增量设计 A5）：
 * moveRow 语义 = 先 splice(from,1) 再 splice(to,0)，boundaryToTarget 必须与之严格同式——
 * 用例矩阵取设计指定 5 行表：拖 1→4、4→1、1→2、3→3 原位。
 */

/** 与核内 doMoveRow 完全同式的数组置换（用于验证边界→目标映射的最终落点） */
function applySplice(list: number[], from: number, to: number): number[] {
  const next = [...list]
  const [moved] = next.splice(from, 1)
  if (moved !== undefined) next.splice(to, 0, moved)
  return next
}

/** 5 行表的轨道项序列（每行 36px 高，连续无 gap；host 内容坐标） */
function rowItems(n: number, height = 36): RailItem[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    label: String(i + 1),
    top: i * height,
    left: 0,
    width: 0,
    height,
    header: false,
  }))
}

/** 3 列表的轨道项序列（每列 60px 宽） */
function colItems(n: number, width = 60): RailItem[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    label: String.fromCharCode(65 + i),
    top: 0,
    left: i * width,
    width,
    height: 0,
    header: false,
  }))
}

describe('railDnd · boundaryToTarget（边界 → moveRow/moveCol 目标下标）', () => {
  it('5 行表矩阵：拖 1→4（下侧边界 b>from 时 to=b−1）落点在第 3 行与第 4 行之间', () => {
    const to = boundaryToTarget(1, 4)
    expect(to).toBe(3)
    // 与核内 moveRow 的 splice 语义对照：行 1 落到旧行 3 之后、旧行 4 之前
    expect(applySplice([0, 1, 2, 3, 4], 1, to)).toEqual([0, 2, 3, 1, 4])
  })

  it('5 行表矩阵：拖 4→1（上侧边界 b≤from 时 to=b）落点在第 0 行之后', () => {
    const to = boundaryToTarget(4, 1)
    expect(to).toBe(1)
    expect(applySplice([0, 1, 2, 3, 4], 4, to)).toEqual([0, 4, 1, 2, 3])
  })

  it('5 行表矩阵：拖 1→2 是原位（紧贴自身下缘），to 等于 from', () => {
    expect(boundaryToTarget(1, 2)).toBe(1)
    expect(boundaryIsHome(1, 2)).toBe(true)
  })

  it('5 行表矩阵：拖 3→3 是原位（紧贴自身上缘）', () => {
    expect(boundaryToTarget(3, 3)).toBe(3)
    expect(boundaryIsHome(3, 3)).toBe(true)
  })

  it('原位带 = {from, from+1}，其余边界都不是原位', () => {
    expect(boundaryIsHome(2, 2)).toBe(true)
    expect(boundaryIsHome(2, 3)).toBe(true)
    expect(boundaryIsHome(2, 1)).toBe(false)
    expect(boundaryIsHome(2, 4)).toBe(false)
  })
})

describe('railDnd · pickBoundary（指针位置 → 插入边界 0..n）', () => {
  const rows = rowItems(5)

  it('行轴按 y：越过第 k 项中点计入其后边界；两端收敛到 0 / n', () => {
    expect(pickBoundary(rows, 'row', 0, 10)).toBe(0) // 首项中点(18)之上
    expect(pickBoundary(rows, 'row', 0, 18)).toBe(0) // 恰在中点上不算越过
    expect(pickBoundary(rows, 'row', 0, 20)).toBe(1)
    expect(pickBoundary(rows, 'row', 0, 100)).toBe(3) // 越过 18/54/90 三个中点
    expect(pickBoundary(rows, 'row', 0, 200)).toBe(5) // 末项之下 → 末尾边界
  })

  it('列轴按 x：同一判定，几何取 item.left/width', () => {
    const cols = colItems(3)
    expect(pickBoundary(cols, 'col', 10, 0)).toBe(0)
    expect(pickBoundary(cols, 'col', 31, 0)).toBe(1) // 首列中点 30
    expect(pickBoundary(cols, 'col', 100, 0)).toBe(2) // 越过 30/90
    expect(pickBoundary(cols, 'col', 300, 0)).toBe(3)
  })

  it('空序列收敛到 0（不产生负值/NaN）', () => {
    expect(pickBoundary([], 'row', 0, 50)).toBe(0)
  })
})

describe('railDnd · 会话状态（placeSession 模式，模块级单例）', () => {
  beforeEach(() => resetRailDrag())

  it('阈值常量与 PreviewHost 框选同值（4px）', () => {
    expect(RAIL_DRAG_THRESHOLD).toBe(4)
  })

  it('resetRailDrag 复位全部字段', () => {
    railDrag.active = true
    railDrag.axis = 'col'
    railDrag.from = 2
    railDrag.boundary = 4
    railDrag.legal = true
    railDrag.reason = 'x'
    resetRailDrag()
    expect(railDrag.active).toBe(false)
    expect(railDrag.axis).toBe('row')
    expect(railDrag.from).toBe(-1)
    expect(railDrag.boundary).toBe(-1)
    expect(railDrag.legal).toBe(false)
    expect(railDrag.reason).toBe('')
  })
})
