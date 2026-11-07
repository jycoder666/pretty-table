import type { KpiCard, TemplateInstance } from '../types'
import type { Palette } from '../theme/palettes'
import { sanitizeHex } from '../theme/palettes'
import { FONT_STACK } from '../theme/font'

/**
 * KPI 统计卡（Schema 1.2 扩展 · 表外 hero 区）：清洗 / 内联样式 / HTML 渲染 / 几何常量的单点。
 * 预览（壳层 hero 区）、HTML 导出（model.ts）、PNG 导出（png.ts）三方同源消费，
 * 主题 token 全部从现有 palettes 派生（零新增色值，GC-11 同口径）。
 */

/** 卡片数上限（超出部分读入时截断） */
export const KPI_CARD_MAX = 6

/** ── 几何常量（px；预览 / HTML / PNG 三方一致）── */
export const KPI_GAP = 8
export const KPI_PAD_H = 12
export const KPI_PAD_V = 10
export const KPI_VALUE_FONT = 22
export const KPI_LABEL_FONT = 12
export const KPI_UNIT_FONT = 12
/** 单卡内容高：value 行(≈28) + label 行(≈18) + 上下内边距；hero 总高再含下方间距 */
export const KPI_CARD_HEIGHT = 76
export const KPI_MARGIN_BOTTOM = 10
/** hero 区总增量高度：卡片 + 与表格的间距 */
export const KPI_HERO_EXTRA = KPI_CARD_HEIGHT + KPI_MARGIN_BOTTOM

/** 有效卡片（缺省 / 空数组 → 空数组；无卡片零占位） */
export function effectiveKpiCards(inst: TemplateInstance): KpiCard[] {
  return Array.isArray(inst.kpiCards) ? inst.kpiCards : []
}

/** hero 区高度（PNG 画布增量；无卡片 = 0） */
export function kpiHeroHeight(cards: KpiCard[]): number {
  return cards.length > 0 ? KPI_HERO_EXTRA : 0
}

/**
 * 清洗（validate / migrate 共用）：非数组 → null（调用方删字段）；
 * 项缺 id/label/value 丢弃；value 字符串化（数字保留原值语义）；超上限截断；
 * unit 空串 → 缺省；accent 非 true → 缺省。
 */
export function sanitizeKpiCards(raw: unknown): KpiCard[] | null {
  if (!Array.isArray(raw)) return null
  const out: KpiCard[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.id !== 'string' || !o.id) continue
    if (o.label === undefined || o.value === undefined) continue
    const card: KpiCard = {
      id: o.id,
      label: String(o.label),
      value: typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : String(o.value),
    }
    if (typeof o.unit === 'string' && o.unit !== '') card.unit = o.unit
    if (o.accent === true) card.accent = true
    out.push(card)
    if (out.length >= KPI_CARD_MAX) break
  }
  return out
}

/** 卡片值文本（数字千分位不在此格式化——value 由作者直接书写展示形态） */
export function kpiValueText(card: KpiCard): string {
  return typeof card.value === 'number' ? String(card.value) : card.value
}

/** 单卡语义色派生（accent 卡走 emphasis 系，常规卡走 primary 系） */
export function kpiCardColors(card: KpiCard, palette: Palette): {
  border: string
  background: string
  value: string
  label: string
} {
  return card.accent
    ? {
        border: palette.emphasis,
        background: palette.emphasisSoft,
        value: palette.emphasis,
        label: palette.muted,
      }
    : {
        border: palette.border,
        background: palette.paper,
        value: palette.primary,
        label: palette.muted,
      }
}

/** hero 容器内联样式（HTML 导出；等宽 flex 一排。签名保留 palette 与单卡样式系列一致） */
export function kpiHeroStyle(_palette: Palette): string {
  return [
    'display:flex',
    `gap:${KPI_GAP}px`,
    `margin:0 0 ${KPI_MARGIN_BOTTOM}px`,
    `font-family:${FONT_STACK}`,
  ].join(';')
}

/** 单卡内联样式（HTML 导出；卡片底/边框/圆角全部主题 token 派生） */
export function kpiCardStyle(card: KpiCard, palette: Palette): string {
  const c = kpiCardColors(card, palette)
  return [
    'flex:1 1 0',
    'min-width:0',
    'box-sizing:border-box',
    `border:1px solid ${c.border}`,
    'border-radius:10px',
    `background:${c.background}`,
    `padding:${KPI_PAD_V}px ${KPI_PAD_H}px`,
  ].join(';')
}

/** 卡片数值行内联样式（大数值 + 小单位） */
export function kpiValueStyle(card: KpiCard, palette: Palette): string {
  return [
    `font-size:${KPI_VALUE_FONT}px`,
    'font-weight:700',
    'line-height:1.2',
    `color:${kpiCardColors(card, palette).value}`,
    'font-variant-numeric:tabular-nums',
  ].join(';')
}

export function kpiUnitStyle(palette: Palette): string {
  return [
    `font-size:${KPI_UNIT_FONT}px`,
    'font-weight:400',
    `color:${palette.muted}`,
  ].join(';')
}

export function kpiLabelStyle(palette: Palette): string {
  return [
    `font-size:${KPI_LABEL_FONT}px`,
    `color:${palette.muted}`,
    'margin:2px 0 0',
    'line-height:1.4',
  ].join(';')
}

/** 转义（与 export/model.ts escapeHtml 同口径；此处独立实现避免环依赖） */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** hero 区 HTML（全内联样式；model.ts 渲染进导出产物，置于表格上方） */
export function renderKpiHeroHtml(cards: KpiCard[], palette: Palette): string {
  const cardHtml = cards
    .map((card) => {
      const unit = card.unit
        ? ` <span style="${esc(kpiUnitStyle(palette))}">${esc(card.unit)}</span>`
        : ''
      return `<div style="${esc(kpiCardStyle(card, palette))}"><div style="${esc(kpiValueStyle(card, palette))}">${esc(kpiValueText(card))}${unit}</div><p style="${esc(kpiLabelStyle(palette))}">${esc(card.label)}</p></div>`
    })
    .join('')
  return `<div class="pt-kpi" data-pt-kpi="1" style="${esc(kpiHeroStyle(palette))}">${cardHtml}</div>`
}

/**
 * PNG 合成时绘制 hero 区（canvas 2d；与 HTML 同一几何常量与语义色）。
 * 返回绘制占用高度（含下方间距）；无卡片返回 0。
 */
export function drawKpiHero(
  ctx: CanvasRenderingContext2D,
  cards: KpiCard[],
  palette: Palette,
  x: number,
  y: number,
  contentWidth: number,
  scale: number,
): number {
  if (cards.length === 0) return 0
  const n = cards.length
  const gap = KPI_GAP * scale
  const cardW = (contentWidth - gap * (n - 1)) / n
  const cardH = KPI_CARD_HEIGHT * scale
  /** 圆角矩形路径（手动 arcTo，不依赖 ctx.roundRect 的环境支持） */
  const roundRectPath = (cx0: number, cy0: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.moveTo(cx0 + r, cy0)
    ctx.arcTo(cx0 + w, cy0, cx0 + w, cy0 + h, r)
    ctx.arcTo(cx0 + w, cy0 + h, cx0, cy0 + h, r)
    ctx.arcTo(cx0, cy0 + h, cx0, cy0, r)
    ctx.arcTo(cx0, cy0, cx0 + w, cy0, r)
    ctx.closePath()
  }
  cards.forEach((card, i) => {
    const cx = x + i * (cardW + gap)
    const c = kpiCardColors(card, palette)
    // 圆角卡片底 + 边框
    const r = Math.min(10 * scale, cardH / 2)
    roundRectPath(cx, y, cardW, cardH, r)
    ctx.fillStyle = c.background
    ctx.fill()
    ctx.strokeStyle = c.border
    ctx.lineWidth = scale
    ctx.stroke()
    // 数值（+ 单位）与标签
    const padH = KPI_PAD_H * scale
    const padV = KPI_PAD_V * scale
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = c.value
    ctx.font = `700 ${KPI_VALUE_FONT * scale}px ${FONT_STACK}`
    const valueText = kpiValueText(card)
    ctx.fillText(valueText, cx + padH, y + padV)
    if (card.unit) {
      const vw = ctx.measureText(valueText).width
      ctx.fillStyle = palette.muted
      ctx.font = `${KPI_UNIT_FONT * scale}px ${FONT_STACK}`
      ctx.fillText(card.unit, cx + padH + vw + 2 * scale, y + padV + (KPI_VALUE_FONT - KPI_UNIT_FONT) * scale)
    }
    ctx.fillStyle = c.label
    ctx.font = `${KPI_LABEL_FONT * scale}px ${FONT_STACK}`
    ctx.fillText(card.label, cx + padH, y + padV + KPI_VALUE_FONT * 1.25 * scale)
  })
  return KPI_HERO_EXTRA * scale
}

/**
 * 槽值 bar 清洗（validate / migrate / setSlotBar 共用）：
 * ratio 非法 → null（整键不收）；color 非法 hex → 删（回主题 primary）。
 */
export function sanitizeBar(raw: unknown): { ratio: number; color?: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const ratio = (raw as { ratio?: unknown }).ratio
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null
  const r = Math.min(1, Math.max(0, ratio))
  const colorRaw = (raw as { color?: unknown }).color
  const color = typeof colorRaw === 'string' ? sanitizeHex(colorRaw) : undefined
  return { ratio: r, ...(color ? { color } : {}) }
}
