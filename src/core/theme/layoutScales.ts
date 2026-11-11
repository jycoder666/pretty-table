import type { TemplateInstance } from '../types'

/**
 * 排版档位与规模上限常量（自定义格式设计增量 §1.3 / §1.4.1）。
 * 纯常量 + 纯函数；具体 px 值实现期与 UX 校准即可，不动架构。
 * 规模上限单点（GC-21）：核内意图与壳置灰都读这里的 LIMITS。
 */

export const LIMITS: { readonly maxRows: 20; readonly maxCols: 12 } = { maxRows: 20, maxCols: 12 }

/**
 * 最低结构守卫（增量设计 A3）：删行/删列的单点口径，执行守卫与 UI 预检同源。
 * - STRUCTURE_MIN_ROWS = 2：1 表头行 + 1 内容行（表头行本就不可删，故只需拦「删掉最后一条内容行」）
 * - STRUCTURE_MIN_COLS = 1：至少保留 1 列
 */
export const STRUCTURE_MIN_ROWS = 2
export const STRUCTURE_MIN_COLS = 1

/**
 * 合并上限单点（GC-21 纪律；编辑台灵活操作升级 2026-11-03 拍板值 6/8/30）。
 * mergeGuard 的跨度/数量两闸读这里，拒绝文案数字与单测边界同步；
 * 白名单闸（allowedMerges containsRange）不受此常量影响，仍是方向红线。
 */
export const MERGE_MAX_SPAN_ROWS = 6
export const MERGE_MAX_SPAN_COLS = 8
export const MERGE_MAX_CLUSTERS = 30

/** 列宽钳制范围（px） */
export const COL_WIDTH_RANGE: readonly [number, number] = [64, 360]

/** 逐行行高钳制范围（px，LayoutStyle.rowHeights 用；上限容纳特高图文行） */
export const ROW_HEIGHT_RANGE: readonly [number, number] = [24, 160]

/** 行高档位：紧凑 / 标准 / 宽松 / 特高（多行单元格，如体检样张 88px 行） */
export const ROW_HEIGHT_TIERS: readonly [number, number, number, number] = [32, 40, 48, 80]
/** 字号档位：正文小 / 标准 / 大 */
export const FONT_SIZE_TIERS: readonly [number, number, number] = [12, 13, 15]
/** 内边距档位：紧 / 标准 / 松 */
export const PADDING_TIERS: readonly [number, number, number] = [6, 10, 14]

/**
 * 强调 mark 设计常量（2026-11-10 四新 mark；画布 toOption / HTML inlineStyle 双链路同源单点）：
 * - DISPLAY_FONT_SIZE：'display' 提档字号（独立于全局字号档位 FONT_SIZE_TIERS）
 * - BAR_MARK_LEFT_WIDTH：'bar' 左强调竖条宽（画布左缘边框 / HTML border-left）
 */
export const DISPLAY_FONT_SIZE = 26
export const BAR_MARK_LEFT_WIDTH = 6

export type Tier = 1 | 2 | 3 | 4

/** 档位钳制：非 1~4 的输入收口到最近合法档位 */
export function clampTier(t: number): Tier {
  const n = Math.round(Number(t))
  if (!Number.isFinite(n)) return 2
  return (n < 1 ? 1 : n > 4 ? 4 : n) as Tier
}

/** 三档钳制：字号/内边距仍只有 1~3 档（行高才有第 4 档特高），值超界收口到 3 */
export function clampTier3(t: number): 1 | 2 | 3 {
  const n = Math.round(Number(t))
  if (!Number.isFinite(n)) return 2
  return (n < 1 ? 1 : n > 3 ? 3 : n) as 1 | 2 | 3
}

/** 列宽钳制：超界收口到边界值，不报错崩（FR-C2 验收） */
export function clampColWidth(px: number): number {
  const [min, max] = COL_WIDTH_RANGE
  const n = Number(px)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** 逐行行高钳制（与 clampColWidth 对称；非法输入回退下界） */
export function clampRowHeight(px: number): number {
  const [min, max] = ROW_HEIGHT_RANGE
  const n = Number(px)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * 可见行数（GC-21 单点）= 逻辑行数（slotGrid 行数）+ 已占用区块行数。
 * 区块行按「between-rows 区块槽的 after-N 锚点被占用」去重计数；footer / left-tag 等不占行。
 */
export function visibleRowCount(inst: TemplateInstance): number {
  const logical = inst.layout.slotGrid?.length ?? inst.layout.rowCount
  const anchors = new Set<number>()
  for (const b of inst.blocks) {
    const def = inst.layout.blockSlots.find((s) => s.id === b.slotId)
    const m = def?.rowHint ? /^after-(\d+)$/.exec(def.rowHint) : null
    if (m) anchors.add(Number(m[1]))
  }
  return logical + anchors.size
}
