import type { DotFormat, GanttFormat, LayoutStyle, SlotObject } from '../types'
import { sanitizeHex } from '../theme/palettes'

/**
 * Schema 1.3 槽值 / 表级样式清洗（validate / migrate 共用单点）：
 * 全部可选字段，宽容不拒（非法删键或落缺省，与 sanitizeBar / sanitizeKpiCards 同口径）。
 * 就地修改传入对象（调用方已持有清洗目标），返回值供「整键删除」判定。
 */

/** 字号倍率档位（1 / 1.25 / 1.5）：读入钳到最近档 */
const CELL_SCALES: readonly number[] = [1, 1.25, 1.5]

export function clampCellScale(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  let best = CELL_SCALES[0]!
  let dist = Math.abs(v - best)
  for (const s of CELL_SCALES) {
    const d = Math.abs(v - s)
    if (d < dist) {
      best = s
      dist = d
    }
  }
  return best
}

/** 逐格颜色清洗：非法 hex → undefined（删键回主题） */
export function sanitizeCellColor(v: unknown): string | undefined {
  return typeof v === 'string' ? (sanitizeHex(v) ?? undefined) : undefined
}

/** 状态圆点清洗：非对象 → undefined；color 非法删键（圆点回主题 emphasis） */
export function sanitizeDot(raw: unknown): DotFormat | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const color = sanitizeCellColor((raw as { color?: unknown }).color)
  return color ? { color } : {}
}

/** 甘特条清洗：from/to 钳制 0-1 且 from<=to（非法整键删除） */
export function sanitizeGantt(raw: unknown): GanttFormat | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.from !== 'number' || !Number.isFinite(o.from)) return undefined
  if (typeof o.to !== 'number' || !Number.isFinite(o.to)) return undefined
  const from = Math.min(1, Math.max(0, o.from))
  let to = Math.min(1, Math.max(0, o.to))
  if (to < from) to = from
  const color = sanitizeCellColor(o.color)
  return { from, to, ...(color ? { color } : {}), ...(o.milestone === true ? { milestone: true } : {}) }
}

/**
 * 槽值对象 1.3 扩展字段清洗（sub/color/bg/cellScale/stars/dot/gantt/node/leader/boxed）。
 * 只处理 Text/Num 槽对象（image/mark 不动）；无任何 1.3 字段命中时零改动。
 */
export function sanitizeSlotDeco(obj: Record<string, unknown>): void {
  if ('sub' in obj) {
    if (typeof obj.sub !== 'string' || obj.sub === '') delete obj.sub
    else obj.sub = obj.sub.slice(0, 200)
  }
  if ('color' in obj) {
    const c = sanitizeCellColor(obj.color)
    if (c) obj.color = c
    else delete obj.color
  }
  if ('bg' in obj) {
    const c = sanitizeCellColor(obj.bg)
    if (c) obj.bg = c
    else delete obj.bg
  }
  if ('cellScale' in obj) {
    const s = clampCellScale(obj.cellScale)
    if (s !== undefined && s !== 1) obj.cellScale = s
    else delete obj.cellScale
  }
  if ('stars' in obj) {
    const n = typeof obj.stars === 'number' && Number.isFinite(obj.stars) ? Math.round(obj.stars) : -1
    if (n >= 0 && n <= 5) {
      if (n === 0) delete obj.stars
      else obj.stars = n
    } else delete obj.stars
  }
  if ('dot' in obj) {
    const d = sanitizeDot(obj.dot)
    if (d) obj.dot = d
    else delete obj.dot
  }
  if ('gantt' in obj) {
    const g = sanitizeGantt(obj.gantt)
    if (g) obj.gantt = g
    else delete obj.gantt
  }
  if ('node' in obj && obj.node !== true) delete obj.node
  if ('leader' in obj && obj.leader !== true) delete obj.leader
  if ('boxed' in obj && obj.boxed !== true) delete obj.boxed
}

/** 槽值是否为 Text/Num 形态（可携带 1.3 装饰字段；match/cells/champion 不带装饰字段） */
export function isRichSlotObject(v: unknown): v is SlotObject {
  return Boolean(
    v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      !('image' in v) &&
      !('mark' in v) &&
      !('match' in v) &&
      !('cells' in v) &&
      !('champion' in v),
  )
}

/** Schema 1.5：对阵卡清洗（队名/比分字符串化截断；非法整键删） */
export function sanitizeMatch(raw: unknown): { a: string; sa: string; b: string; sb: string; winA?: boolean; winB?: boolean } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 40) : typeof v === 'number' ? String(v) : '')
  const a = str(o.a)
  const b = str(o.b)
  if (!a && !b) return null
  const out: { a: string; sa: string; b: string; sb: string; winA?: boolean; winB?: boolean } = {
    a,
    sa: str(o.sa),
    b,
    sb: str(o.sb),
  }
  if (o.winA === true) out.winA = true
  if (o.winB === true) out.winB = true
  return out
}

/** Schema 1.5：打卡矩阵清洗（pattern 只留 0/1，上限 31；非法整键删） */
export function sanitizeCells(raw: unknown): { pattern: string; today?: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.pattern !== 'string') return null
  const pattern = [...o.pattern].filter((c) => c === '0' || c === '1').join('').slice(0, 31)
  if (!pattern) return null
  const out: { pattern: string; today?: number } = { pattern }
  if (typeof o.today === 'number' && Number.isFinite(o.today)) {
    const t = Math.round(o.today)
    if (t >= 0 && t < pattern.length) out.today = t
  }
  return out
}

/** Schema 1.5：冠军卡清洗 */
export function sanitizeChampion(raw: unknown): { title?: string; name: string; note?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = typeof o.name === 'string' ? o.name.slice(0, 40) : ''
  if (!name) return null
  const out: { title?: string; name: string; note?: string } = { name }
  if (typeof o.title === 'string' && o.title) out.title = o.title.slice(0, 20)
  if (typeof o.note === 'string' && o.note) out.note = o.note.slice(0, 40)
  return out
}

const BORDER_SCHEMES: readonly string[] = ['full', 'rows', 'cols', 'none']

/** layout.style 1.3 字段清洗（fontFamily / borderScheme / headerShape 枚举越界删键） */
export function sanitizeStyle13(style: LayoutStyle): void {
  if (style.fontFamily !== undefined && style.fontFamily !== 'sans' && style.fontFamily !== 'serif') {
    delete style.fontFamily
  }
  if (style.borderScheme !== undefined && !BORDER_SCHEMES.includes(style.borderScheme)) {
    delete style.borderScheme
  }
  if (
    style.headerShape !== undefined &&
    style.headerShape !== 'flat' &&
    style.headerShape !== 'pill'
  ) {
    delete style.headerShape
  }
  if ('plainHeader' in style && style.plainHeader !== true) delete style.plainHeader
  if ('pillInsetV' in style) {
    const v = style.pillInsetV
    if (typeof v === 'number' && Number.isFinite(v)) {
      const clamped = Math.min(20, Math.max(0, Math.round(v)))
      if (clamped === 6) delete style.pillInsetV
      else style.pillInsetV = clamped
    } else delete style.pillInsetV
  }
}
