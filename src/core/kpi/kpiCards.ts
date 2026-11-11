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

/** Schema 1.3：strip 统计条几何（细分隔条形态，收支账稿） */
export const KPI_STRIP_VALUE_FONT = 26
export const KPI_STRIP_LABEL_FONT = 12
export const KPI_STRIP_PAD_V = 14
export const KPI_STRIP_HEIGHT = 84

/** hero 区高度（PNG 画布增量；无卡片 = 0；strip 形态略高） */
export function kpiHeroHeight(cards: KpiCard[], style?: 'cards' | 'strip' | 'plain'): number {
  if (cards.length === 0) return 0
  return style === 'cards' ? KPI_HERO_EXTRA : KPI_STRIP_HEIGHT + KPI_MARGIN_BOTTOM
}

/** 有效卡片（缺省 / 空数组 → 空数组；无卡片零占位） */
export function effectiveKpiCards(inst: TemplateInstance): KpiCard[] {
  return Array.isArray(inst.kpiCards) ? inst.kpiCards : []
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
    // Schema 1.5：独立数值色（strip 竖条 / plain 数字 / cards 数值同用）
    if (typeof o.color === 'string') {
      const c = sanitizeHex(o.color)
      if (c) card.color = c
    }
    out.push(card)
    if (out.length >= KPI_CARD_MAX) break
  }
  return out
}

/** 卡片值文本（数字千分位不在此格式化——value 由作者直接书写展示形态） */
export function kpiValueText(card: KpiCard): string {
  return typeof card.value === 'number' ? String(card.value) : card.value
}

/** 单卡语义色派生（accent 卡走 emphasis 系；card.color 覆盖数值/边框色，Schema 1.5） */
export function kpiCardColors(card: KpiCard, palette: Palette): {
  border: string
  background: string
  value: string
  label: string
} {
  if (card.accent) {
    return {
      border: card.color ?? palette.emphasis,
      background: palette.emphasisSoft,
      value: card.color ?? palette.emphasis,
      label: palette.muted,
    }
  }
  return {
    border: card.color ?? palette.border,
    background: palette.paper,
    value: card.color ?? palette.primary,
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
export function renderKpiHeroHtml(
  cards: KpiCard[],
  palette: Palette,
  style?: 'cards' | 'strip' | 'plain',
): string {
  if (style === 'strip') return renderKpiStripHtml(cards, palette)
  if (style === 'plain') return renderKpiPlainHtml(cards, palette)
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

// ── Schema 1.3：strip 统计条（细分隔条形态；HTML / PNG / 预览三方同源，几何常量上方）──

/** strip 容器内联样式 */
export function kpiStripStyle(palette: Palette): string {
  return [
    'display:flex',
    `margin:0 0 ${KPI_MARGIN_BOTTOM}px`,
    `font-family:${FONT_STACK}`,
  ].join(';')
}

/** strip 单项内联样式（首项无分隔线；有竖条色的卡左侧换 4px 竖条，账本稿三色） */
export function kpiStripItemStyle(card: KpiCard, palette: Palette, index: number): string {
  const bar = kpiStripBarColor(card, palette)
  return [
    'flex:1 1 0',
    'min-width:0',
    `padding:${KPI_STRIP_PAD_V}px 16px`,
    ...(bar ? [`border-left:4px solid ${bar}`, 'padding-left:12px'] : []),
    ...(index > 0 && !bar ? [`border-left:1px solid ${palette.border}`] : []),
  ].join(';')
}

export function kpiStripLabelStyle(palette: Palette): string {
  return [
    `font-size:${KPI_STRIP_LABEL_FONT}px`,
    `color:${palette.muted}`,
    'letter-spacing:0.08em',
    'margin:0 0 6px',
  ].join(';')
}

/** strip 数值行内联样式（accent 卡荧光底；card.color 覆盖数值色，Schema 1.5） */
export function kpiStripValueStyle(card: KpiCard, palette: Palette): string {
  const base = [
    `font-size:${KPI_STRIP_VALUE_FONT}px`,
    'font-weight:700',
    'line-height:1.2',
    `color:${card.color ?? (card.accent ? palette.emphasis : palette.primary)}`,
    'font-variant-numeric:tabular-nums',
  ]
  if (card.accent) {
    base.push(`background:${palette.emphasisSoft}`, 'padding:0 6px', 'border-radius:3px')
  }
  return base.join(';')
}

/** Schema 1.5：strip 左竖条色（card.color 优先；无 color 时无竖条，保持原分隔线形态） */
export function kpiStripBarColor(card: KpiCard, palette: Palette): string | null {
  if (card.color) return card.color
  if (card.accent) return palette.emphasis
  return null
}

// ── Schema 1.5：plain 无框大数字形态（习惯打卡稿：label 上 / 衬线大数字下 / 无框无分隔）──

export const KPI_PLAIN_VALUE_FONT = 34
export const KPI_PLAIN_LABEL_FONT = 12

export function kpiPlainStyle(palette: Palette): string {
  return ['display:flex', `margin:0 0 ${KPI_MARGIN_BOTTOM}px`, `font-family:${FONT_STACK}`].join(';')
}

export function kpiPlainItemStyle(_card: KpiCard, _palette: Palette, _index: number): string {
  return ['flex:1 1 0', 'min-width:0', `padding:${KPI_STRIP_PAD_V}px 4px`].join(';')
}

export function kpiPlainLabelStyle(palette: Palette): string {
  return [
    `font-size:${KPI_PLAIN_LABEL_FONT}px`,
    `color:${palette.muted}`,
    'letter-spacing:0.08em',
    'margin:0 0 4px',
  ].join(';')
}

export function kpiPlainValueStyle(card: KpiCard, palette: Palette): string {
  return [
    `font-size:${KPI_PLAIN_VALUE_FONT}px`,
    'font-weight:700',
    'line-height:1.15',
    `color:${card.color ?? (card.accent ? palette.emphasis : palette.primary)}`,
    'font-variant-numeric:tabular-nums',
  ].join(';')
}

/** plain 高度（含下间距） */
export const KPI_PLAIN_HEIGHT = KPI_PLAIN_VALUE_FONT * 1.4 + KPI_PLAIN_LABEL_FONT * 1.6 + KPI_STRIP_PAD_V + KPI_MARGIN_BOTTOM

/** strip 区 HTML */
export function renderKpiStripHtml(cards: KpiCard[], palette: Palette): string {
  const items = cards
    .map((card, i) => {
      const unit = card.unit
        ? ` <span style="${esc(kpiUnitStyle(palette))}">${esc(card.unit)}</span>`
        : ''
      return `<div style="${esc(kpiStripItemStyle(card, palette, i))}"><p style="${esc(kpiStripLabelStyle(palette))}">${esc(card.label)}</p><div style="${esc(kpiStripValueStyle(card, palette))}">${esc(kpiValueText(card))}${unit}</div></div>`
    })
    .join('')
  return `<div class="pt-kpi" data-pt-kpi="1" style="${esc(kpiStripStyle(palette))}">${items}</div>`
}

/**
 * PNG 合成时绘制 strip 统计条（canvas 2d；与 HTML 同一几何常量与语义色）。
 * 返回绘制占用高度（含下方间距）；无卡片返回 0。签名带 style 与 kpiHeroHeight 对齐。
 */
export function drawKpiHero(
  ctx: CanvasRenderingContext2D,
  cards: KpiCard[],
  palette: Palette,
  x: number,
  y: number,
  contentWidth: number,
  scale: number,
  style?: 'cards' | 'strip' | 'plain',
): number {
  if (cards.length === 0) return 0
  if (style === 'strip') return drawKpiStrip(ctx, cards, palette, x, y, contentWidth, scale)
  if (style === 'plain') return drawKpiPlain(ctx, cards, palette, x, y, contentWidth, scale)
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

/** strip 形态 canvas 绘制（标签上行 / 大数值下行 / 项间细分隔线 / accent 荧光底） */
function drawKpiStrip(
  ctx: CanvasRenderingContext2D,
  cards: KpiCard[],
  palette: Palette,
  x: number,
  y: number,
  contentWidth: number,
  scale: number,
): number {
  const n = cards.length
  const itemW = contentWidth / n
  const padV = KPI_STRIP_PAD_V * scale
  const padH = 16 * scale
  cards.forEach((card, i) => {
    const cx = x + i * itemW
    if (i > 0) {
      ctx.strokeStyle = palette.border
      ctx.lineWidth = scale
      ctx.beginPath()
      ctx.moveTo(cx, y + padV * 0.6)
      ctx.lineTo(cx, y + KPI_STRIP_HEIGHT * scale - padV * 0.6)
      ctx.stroke()
    }
    // Schema 1.5：card.color / accent → 左竖条（账本稿三色竖条；文字右移让位）
    const bar = kpiStripBarColor(card, palette)
    if (bar) {
      ctx.fillStyle = bar
      ctx.fillRect(cx + 4 * scale, y + padV * 0.6, 4 * scale, KPI_STRIP_HEIGHT * scale - padV * 1.2)
    }
    const textX = cx + padH + (bar ? 10 * scale : 0)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = palette.muted
    ctx.font = `${KPI_STRIP_LABEL_FONT * scale}px ${FONT_STACK}`
    ctx.fillText(card.label, textX, y + padV * 0.6)
    const valueY = y + padV * 0.6 + KPI_STRIP_LABEL_FONT * 1.4 * scale
    const valueText = kpiValueText(card)
    ctx.font = `700 ${KPI_STRIP_VALUE_FONT * scale}px ${FONT_STACK}`
    if (card.accent) {
      // 荧光底（与 HTML kpiStripValueStyle 同源：emphasisSoft 圆角矩形垫在数值下）
      const vw = ctx.measureText(valueText).width
      ctx.fillStyle = palette.emphasisSoft
      const hlH = KPI_STRIP_VALUE_FONT * 1.25 * scale
      const hlY = valueY + KPI_STRIP_VALUE_FONT * scale * 0.12
      const hlX = textX - 3 * scale
      const r = Math.min(3 * scale, hlH / 2)
      ctx.beginPath()
      ctx.moveTo(hlX + r, hlY)
      ctx.arcTo(hlX + vw + 6 * scale, hlY, hlX + vw + 6 * scale, hlY + hlH, r)
      ctx.arcTo(hlX + vw + 6 * scale, hlY + hlH, hlX, hlY + hlH, r)
      ctx.arcTo(hlX, hlY + hlH, hlX, hlY, r)
      ctx.arcTo(hlX, hlY, hlX + vw + 6 * scale, hlY, r)
      ctx.closePath()
      ctx.fill()
    }
    ctx.fillStyle = card.color ?? (card.accent ? palette.emphasis : palette.primary)
    ctx.fillText(valueText, textX, valueY)
    if (card.unit) {
      const vw = ctx.measureText(valueText).width
      ctx.fillStyle = palette.muted
      ctx.font = `${KPI_UNIT_FONT * scale}px ${FONT_STACK}`
      ctx.fillText(card.unit, textX + vw + 3 * scale, valueY + (KPI_STRIP_VALUE_FONT - KPI_UNIT_FONT) * 0.9 * scale)
    }
  })
  return (KPI_STRIP_HEIGHT + KPI_MARGIN_BOTTOM) * scale
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


/** plain 区 HTML（无框大数字；衬线由消费端模板字体决定——这里用主题字体栈） */
export function renderKpiPlainHtml(cards: KpiCard[], palette: Palette): string {
  const items = cards
    .map((card) => {
      const unit = card.unit
        ? ` <span style="${esc(kpiUnitStyle(palette))}">${esc(card.unit)}</span>`
        : ''
      return `<div style="${esc(kpiPlainItemStyle(card, palette, 0))}"><p style="${esc(kpiPlainLabelStyle(palette))}">${esc(card.label)}</p><div style="${esc(kpiPlainValueStyle(card, palette))}">${esc(kpiValueText(card))}${unit}</div></div>`
    })
    .join('')
  return `<div class="pt-kpi" data-pt-kpi="1" style="${esc(kpiPlainStyle(palette))}">${items}</div>`
}

/** plain 形态 canvas 绘制（label 上 / 大数字下 / 无框无分隔） */
export function drawKpiPlain(
  ctx: CanvasRenderingContext2D,
  cards: KpiCard[],
  palette: Palette,
  x: number,
  y: number,
  contentWidth: number,
  scale: number,
): number {
  const n = cards.length
  const itemW = contentWidth / n
  const padV = KPI_STRIP_PAD_V * scale
  const labelFs = KPI_PLAIN_LABEL_FONT * scale
  const valueFs = KPI_PLAIN_VALUE_FONT * scale
  cards.forEach((card, i) => {
    const cx = x + i * itemW
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillStyle = palette.muted
    ctx.font = `${labelFs}px ${FONT_STACK}`
    ctx.fillText(card.label, cx + 4 * scale, y + padV)
    ctx.fillStyle = card.color ?? (card.accent ? palette.emphasis : palette.primary)
    ctx.font = `700 ${valueFs}px ${FONT_STACK}`
    ctx.fillText(kpiValueText(card), cx + 4 * scale, y + padV + labelFs * 1.7)
    if (card.unit) {
      const vw = ctx.measureText(kpiValueText(card)).width
      ctx.fillStyle = palette.muted
      ctx.font = `${KPI_UNIT_FONT * scale}px ${FONT_STACK}`
      ctx.fillText(card.unit, cx + 4 * scale + vw + 4 * scale, y + padV + labelFs * 1.7 + valueFs * 0.28)
    }
  })
  return (KPI_PLAIN_HEIGHT + 0) * scale
}
