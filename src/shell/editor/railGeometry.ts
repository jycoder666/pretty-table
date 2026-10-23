import { reactive } from 'vue'
import type { TemplateInstance } from '@/core'
import { logicalToVisualRow } from './selection'
import type { CellRect } from '../dnd/slotDnd'

/**
 * 轨道几何桥（增量设计 A4，模块级 reactive，placeSession 模式）：
 * PreviewHost 是唯一写入方；行/列轨道与结构菜单只读。
 * 几何全部来自渲染核权威坐标（getCellViewportRects / estimateCellRects 降级同源），
 * 轨道零新几何计算。坐标口径：
 * - cellRects 为「.vtable-root 原点」的内容坐标（对 host DOM 纵滚不感知，横滚感知）
 * - 行轨道项 y = originTop + rect.top − scrollTop（冻结对齐，host 滚动监听写入 scrollTop）
 * - 列轨道项 x = originLeft + rect.left（同排元素 hostLeft − stripLeft = 0，无需 scrollTop 修正）
 */

/** 轨道条边长（EditorPage 布局与菜单锚点共用一个常量，防止错位） */
export const RAIL_SIZE = 28

/** 轴参数化：一套轨道组件两用（行/列） */
export type StructuralAxis = 'row' | 'col'

/** 轨道项（host 内容坐标 + 展示信息；轨道组件换算成条内坐标） */
export interface RailItem {
  /** 逻辑行号 / 列号（0 基） */
  index: number
  /** 序号展示：行 1/2/3…、列 A/B/C…（MUST NOT 读取业务表头或首列文案，A4 防误判） */
  label: string
  /** host 内容坐标 */
  top: number
  left: number
  width: number
  height: number
  /** 行轴：是否表头行（菜单「删除」禁用依据）；列轴恒 false */
  header: boolean
}

export interface RailHostRect {
  left: number
  top: number
  width: number
  height: number
}

export const railGeometry = reactive({
  /** readGeometry() 结果（渲染核优先，回退 estimateCellRects） */
  cellRects: [] as CellRect[][],
  /** host border-box 视口坐标 + 尺寸（refresh 时 getBoundingClientRect） */
  hostLeft: 0,
  hostTop: 0,
  hostWidth: 0,
  hostHeight: 0,
  /** hostOrigin（mount 元素 offsetLeft/Top），随布局自动正确 */
  originLeft: 0,
  originTop: 0,
  /** host DOM scrollTop（host scroll 监听写入，rAF 合帧） */
  scrollTop: 0,
  /** 渲染核是否已挂载（e2e / 降级判定） */
  ready: false,
})

/** PreviewHost refresh 时整包同步（唯一写入入口） */
export function syncRailGeometry(
  rects: CellRect[][],
  hostRect: RailHostRect,
  origin: { left: number; top: number },
  ready: boolean,
): void {
  railGeometry.cellRects = rects
  railGeometry.hostLeft = hostRect.left
  railGeometry.hostTop = hostRect.top
  railGeometry.hostWidth = hostRect.width
  railGeometry.hostHeight = hostRect.height
  railGeometry.originLeft = origin.left
  railGeometry.originTop = origin.top
  railGeometry.ready = ready
}

/** host DOM 纵向滚动 → 行轨道冻结对齐（rAF 合帧后写入） */
export function setRailScrollTop(top: number): void {
  railGeometry.scrollTop = top
}

/** PreviewHost 卸载时清空（防悬挂几何被下一个页面读到） */
export function resetRailGeometry(): void {
  railGeometry.cellRects = []
  railGeometry.hostLeft = 0
  railGeometry.hostTop = 0
  railGeometry.hostWidth = 0
  railGeometry.hostHeight = 0
  railGeometry.originLeft = 0
  railGeometry.originTop = 0
  railGeometry.scrollTop = 0
  railGeometry.ready = false
  attachRailHost(null)
}

// ── host 元素引用（插入后最小纵向滚动用；非响应式，仅 PreviewHost 挂/卸时写）──

let hostEl: HTMLElement | null = null

export function attachRailHost(el: HTMLElement | null): void {
  hostEl = el
}

function colLabel(c: number): string {
  // 上限 12 列，单字母足够；超界兜底 A1 式序号
  return c < 26 ? String.fromCharCode(65 + c) : `A${c - 26 + 1}`
}

/** 行轨道项：每条逻辑行经 logicalToVisualRow 映射可视行（区块行无逻辑行号 → 天然无轨道项） */
export function rowRailItems(inst: TemplateInstance): RailItem[] {
  const items: RailItem[] = []
  const headerLevels = inst.layout.headerLevels ?? 1
  const gridLen = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  for (let r = 0; r < gridLen; r++) {
    const vr = logicalToVisualRow(inst, r)
    const rect = vr !== null ? railGeometry.cellRects[vr]?.[0] : undefined
    if (!rect) continue
    items.push({
      index: r,
      label: String(r + 1),
      top: railGeometry.originTop + rect.top,
      left: 0,
      width: 0,
      height: rect.height,
      header: r < headerLevels,
    })
  }
  return items
}

/** 列轨道项：取首个有几何的可视行（区块行不影响列轨道），x/width 来自该行各列矩形 */
export function colRailItems(inst: TemplateInstance): RailItem[] {
  const items: RailItem[] = []
  const first = railGeometry.cellRects.findIndex((row) => row && row.length > 0)
  if (first < 0) return items
  const row = railGeometry.cellRects[first]!
  for (let c = 0; c < inst.layout.colCount && c < row.length; c++) {
    const rect = row[c]!
    items.push({
      index: c,
      label: colLabel(c),
      top: 0,
      left: railGeometry.originLeft + rect.left,
      width: rect.width,
      height: 0,
      header: false,
    })
  }
  return items
}

/** 单个轨道项的 host 内容坐标（菜单锚点 / 最小滚动共用） */
export function railItemRect(
  inst: TemplateInstance,
  axis: StructuralAxis,
  index: number,
): { top: number; left: number; width: number; height: number } | null {
  if (axis === 'row') {
    const item = rowRailItems(inst).find((it) => it.index === index)
    if (!item) return null
    return { top: item.top, left: 0, width: RAIL_SIZE, height: item.height }
  }
  const item = colRailItems(inst).find((it) => it.index === index)
  if (!item) return null
  return { top: 0, left: item.left, width: item.width, height: RAIL_SIZE }
}

/** 轨道项的视口坐标（position:fixed 菜单锚点用；行项贴 host 左缘外、列项贴 host 上缘外） */
export function railItemViewportRect(
  inst: TemplateInstance,
  axis: StructuralAxis,
  index: number,
): { left: number; top: number; width: number; height: number } | null {
  const item = railItemRect(inst, axis, index)
  if (!item) return null
  const geo = railGeometry
  if (axis === 'row') {
    return {
      left: geo.hostLeft - RAIL_SIZE,
      top: geo.hostTop + item.top - geo.scrollTop,
      width: RAIL_SIZE,
      height: item.height,
    }
  }
  return {
    left: geo.hostLeft + item.left,
    top: geo.hostTop - RAIL_SIZE,
    width: item.width,
    height: RAIL_SIZE,
  }
}

/**
 * 插入成功后的最小幅度纵向滚动（A4；横向为 VTable 内部滚动无编程 API，不做）。
 * 下一帧读新几何（apply 后 version watch 已同步刷新 cellRects），目标行不在可视区时
 * 手算 delta 做 block:nearest 语义的最小位移（边缘留 8px 呼吸空间）。
 */
export function ensureRowVisible(inst: TemplateInstance, index: number): void {
  requestAnimationFrame(() => {
    const el = hostEl
    if (!el) return
    const item = railItemRect(inst, 'row', index)
    if (!item) return
    const geo = railGeometry
    const topV = geo.hostTop + item.top - geo.scrollTop
    const bottomV = topV + item.height
    const hostBottomV = geo.hostTop + geo.hostHeight
    if (topV < geo.hostTop) {
      el.scrollTop -= geo.hostTop - topV + 8
    } else if (bottomV > hostBottomV) {
      el.scrollTop += bottomV - hostBottomV + 8
    }
  })
}
