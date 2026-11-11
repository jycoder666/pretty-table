import type { PosterSpec, PosterWash, TemplateInstance } from '../types'
import type { Palette } from './palettes'
import { sanitizeHex } from './palettes'
import { FONT_STACK, fontStackOf } from './font'

/**
 * Schema 1.3：页面海报层几何 / 内联样式 / 语义色的单点（GC-11 同口径：新增 hex 只在此）。
 * 预览 DOM（PreviewHost）、PNG 合成（png.ts drawPoster）、HTML 导出（model.ts）三方消费；
 * PNG 无法用 CSS，纹理几何常量（点距 / 横线间距）在此对齐，drawPoster 按同值手绘。
 */

/** 纸面四周留白：缺省 40px，读入钳制 16-80 */
export const POSTER_PAD_DEFAULT = 40
export const POSTER_PAD_MIN = 16
export const POSTER_PAD_MAX = 80

/** 文字规格（px，scale=1；PNG 按 scale 乘）——预览 / HTML / PNG 三方同源 */
export const POSTER_KICKER_FONT = 11
export const POSTER_TITLE_FONT = 34
export const POSTER_SUBTITLE_FONT = 14
export const POSTER_META_FONT = 11
export const POSTER_FOOTER_FONT = 11

/** 纹理几何常量（CSS 与 canvas 手绘同值） */
export const POSTER_DOTS_SIZE = 22
export const POSTER_DOTS_R = 1
export const POSTER_RULED_GAP = 34
export const POSTER_RULED_W = 1

/** 标题块与表格 / 注脚与表格的间距 */
export const POSTER_HEADER_GAP = 20
export const POSTER_FOOTER_GAP = 16

/** Schema 1.5：chips 徽章卡 / legend 图例行几何 */
export const POSTER_CHIP_FONT = 12
export const POSTER_CHIP_H = 28
export const POSTER_CHIP_GAP = 10
export const POSTER_LEGEND_FONT = 12

export function posterPadding(poster: PosterSpec | undefined): number {
  const p = poster?.padding
  if (typeof p !== 'number' || !Number.isFinite(p)) return POSTER_PAD_DEFAULT
  return Math.min(POSTER_PAD_MAX, Math.max(POSTER_PAD_MIN, Math.round(p)))
}

/** 海报语义色派生（全部从 palette 落地，数据 hex 仅覆盖） */
export function posterColors(
  poster: PosterSpec | undefined,
  palette: Palette,
): {
  bg: string
  texture: string
  accent: string
  title: string
  sub: string
  meta: string
  footer: string
} {
  const bg = (poster?.bgColor && sanitizeHex(poster.bgColor)) || palette.paper
  const accent = (poster?.accent && sanitizeHex(poster.accent)) || palette.emphasis
  const texture = (poster?.bgAccent && sanitizeHex(poster.bgAccent)) || palette.border
  return {
    bg,
    texture,
    accent,
    title: (poster?.textColor && sanitizeHex(poster.textColor)) || palette.primary,
    sub: palette.muted,
    meta: palette.muted,
    footer: palette.muted,
  }
}

/** 海报字体栈（标题可衬线） */
export function posterTitleFont(poster: PosterSpec | undefined): string {
  return fontStackOf(poster?.titleFont)
}

/** 海报有无内容（决定 PNG / HTML 是否多出标题区与注脚区高度） */
export function hasPoster(inst: TemplateInstance): boolean {
  const p = inst.poster
  if (!p || typeof p !== 'object') return false
  return Boolean(
    p.kicker || p.title || p.subtitle || p.metaLines?.length || p.footerLines?.length || p.pageBadge,
  )
}

/**
 * 标题区高度（px @scale1）：左块（眉标/标题/副标题）与右块（meta 行）取大者 + 下间距；
 * 无任何标题内容 → 0。内容宽度只影响折行（meta/标题按单行估算，几何恒定，三方一致）。
 */
export function posterHeaderHeight(poster: PosterSpec | undefined): number {
  if (!poster) return 0
  const left =
    (poster.kicker ? POSTER_KICKER_FONT * 1.5 + 6 : 0) +
    (poster.title ? POSTER_TITLE_FONT * 1.3 + 8 : 0) +
    (poster.subtitle ? POSTER_SUBTITLE_FONT * 1.6 + 4 : 0)
  const right = poster.metaLines?.length
    ? poster.metaLines.length * POSTER_META_FONT * 1.7 + 4
    : 0
  // Schema 1.5：chips / legend 追加在标题块下（不与右侧 meta 竞争高度）
  const extra =
    (poster.chips?.length ? POSTER_CHIP_H + 10 : 0) +
    (poster.legend ? POSTER_LEGEND_FONT * 1.6 + 6 : 0)
  if (left <= 0 && right <= 0 && extra <= 0) return 0
  return Math.max(left, right) + extra + POSTER_HEADER_GAP
}

/** 注脚区高度（行数 × 行高 + 上间距）；无内容 → 0 */
export function posterFooterHeight(poster: PosterSpec | undefined): number {
  const n = poster?.footerLines?.length ?? 0
  const badge = poster?.pageBadge ? 1 : 0
  const lines = Math.max(n, badge)
  if (lines === 0) return 0
  return lines * POSTER_FOOTER_FONT * 1.7 + POSTER_FOOTER_GAP
}

/** 纹理 CSS（inline background-image；solid / 缺省 → '' 零占位） */
export function posterTextureCss(poster: PosterSpec | undefined, palette: Palette): string {
  const mode = poster?.bg ?? 'solid'
  if (mode === 'solid') return ''
  const c = posterColors(poster, palette)
  if (mode === 'dots') {
    return `radial-gradient(circle, ${c.texture} ${POSTER_DOTS_R}px, transparent ${POSTER_DOTS_R}px)`
  }
  if (mode === 'ruled') {
    return `repeating-linear-gradient(to bottom, transparent 0 ${POSTER_RULED_GAP - POSTER_RULED_W}px, ${c.texture} ${POSTER_RULED_GAP - POSTER_RULED_W}px ${POSTER_RULED_GAP}px)`
  }
  // gradient：基色 → bgAccent 第二色
  return `linear-gradient(160deg, ${c.bg} 0%, ${c.texture} 100%)`
}

/**
 * Schema 1.4：角部颜色洗 CSS 层（径向渐变；多层逗号叠加，调用方拼在纹理层之后——
 * CSS 多背景先声明的在上层，故顺序 = [纹理, ...washes]）。solid 基色时洗层直接叠在 background-color 上。
 */
export function posterWashCssLayers(poster: PosterSpec | undefined): string[] {
  const washes = poster?.bgWashes ?? []
  return washes.map((w) => {
    const pct = Math.round(Math.min(1, Math.max(0.02, w.r ?? 0.35)) * 100)
    // 终点必须用「同色 alpha 0」而非 transparent（transparent=黑 alpha 0，
    // 非预乘插值会经过半透明黑导致洗层发灰——canvas 端同坑，三端统一同色渐隐）
    return `radial-gradient(circle at ${(w.x * 100).toFixed(1)}% ${(w.y * 100).toFixed(1)}%, ${w.color} 0%, ${hexToRgba0(w.color)} ${pct}%)`
  })
}

/** hex → 同色 alpha 0 的 rgba 字串（非法 hex 返回 transparent 兜底） */
function hexToRgba0(hex: string): string {
  const h = sanitizeHex(hex)
  if (!h) return 'rgba(0,0,0,0)'
  const n = parseInt(h.slice(1), 16)
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},0)`
}

/** 纹理 CSS 的 background-size / repeat 追加（dots 需要平铺尺寸；其余铺满） */
export function posterTextureCssExtra(poster: PosterSpec | undefined): string {
  const mode = poster?.bg ?? 'solid'
  if (mode === 'dots') {
    return `background-size:${POSTER_DOTS_SIZE}px ${POSTER_DOTS_SIZE}px;background-repeat:repeat`
  }
  if (mode === 'solid') return ''
  return 'background-size:100% 100%;background-repeat:no-repeat'
}

/** Schema 1.5：chips 容器 / 单卡内联样式（第 0 个黑底白字，其余白底描边） */
export function posterChipsWrapStyle(palette: Palette): string {
  return [
    'display:flex',
    `gap:${POSTER_CHIP_GAP}px`,
    `margin:${POSTER_TITLE_FONT * 0.3}px 0 0`,
    `font-family:${FONT_STACK}`,
  ].join(';')
}

export function posterChipStyle(palette: Palette, index: number): string {
  const ink = palette.primary
  return index === 0
    ? [
        `font-size:${POSTER_CHIP_FONT}px`,
        `background:${ink}`,
        'color:#ffffff',
        `padding:0 ${POSTER_CHIP_H / 2.6}px`,
        `height:${POSTER_CHIP_H}px`,
        'line-height:' + POSTER_CHIP_H + 'px',
        'border-radius:3px',
        'font-weight:600',
        'white-space:nowrap',
      ].join(';')
    : [
        `font-size:${POSTER_CHIP_FONT}px`,
        `background:transparent`,
        `color:${ink}`,
        `padding:0 ${POSTER_CHIP_H / 2.6}px`,
        `height:${POSTER_CHIP_H}px`,
        'line-height:' + (POSTER_CHIP_H - 2) + 'px',
        'border-radius:3px',
        `border:1px solid ${palette.border}`,
        'white-space:nowrap',
      ].join(';')
}

/** Schema 1.5：legend 图例行内联样式 */
export function posterLegendStyle(palette: Palette): string {
  return [
    `font-size:${POSTER_LEGEND_FONT}px`,
    `color:${palette.muted}`,
    `margin:${POSTER_TITLE_FONT * 0.3}px 0 0`,
    'line-height:1.5',
  ].join(';')
}

/** 海报层容器内联样式（预览 / HTML 同源：bg + 纹理 + 留白） */
export function posterWrapStyle(poster: PosterSpec | undefined, palette: Palette): string {
  const c = posterColors(poster, palette)
  const pad = posterPadding(poster)
  const parts = [
    `background-color:${c.bg}`,
    `padding:${pad}px`,
    `font-family:${fontStackOf(poster?.titleFont)}`,
  ]
  const tex = posterTextureCss(poster, palette)
  const washes = posterWashCssLayers(poster)
  const layers = [tex, ...washes].filter(Boolean)
  if (layers.length > 0) {
    parts.push(`background-image:${layers.join(',')}`)
    const extra = posterTextureCssExtra(poster)
    if (extra) parts.push(...(extra.split(';') as string[]))
  }
  return parts.join(';')
}

/** 标题区各元素内联样式（预览 / HTML 同源；PNG 用同名字号常量手绘） */
export function posterHeaderStyles(
  poster: PosterSpec | undefined,
  palette: Palette,
): { wrap: string; kicker: string; title: string; subtitle: string; meta: string } {
  const c = posterColors(poster, palette)
  return {
    wrap: [
      'display:flex',
      'justify-content:space-between',
      'align-items:flex-start',
      `margin:0 0 ${POSTER_HEADER_GAP}px`,
    ].join(';'),
    kicker: [
      `font-size:${POSTER_KICKER_FONT}px`,
      `color:${c.accent}`,
      'letter-spacing:0.32em',
      'margin:0 0 6px',
    ].join(';'),
    title: [
      `font-size:${POSTER_TITLE_FONT}px`,
      'font-weight:700',
      'line-height:1.3',
      `color:${c.title}`,
      `font-family:${posterTitleFont(poster)}`,
      'margin:0',
    ].join(';'),
    subtitle: [
      `font-size:${POSTER_SUBTITLE_FONT}px`,
      `color:${c.sub}`,
      'margin:4px 0 0',
      'line-height:1.6',
    ].join(';'),
    meta: [
      `font-size:${POSTER_META_FONT}px`,
      `color:${c.meta}`,
      'text-align:right',
      'line-height:1.7',
      'margin:0',
      'white-space:pre-line',
    ].join(';'),
  }
}

/** 注脚区各元素内联样式 */
export function posterFooterStyles(
  poster: PosterSpec | undefined,
  palette: Palette,
): { wrap: string; line: string; badge: string } {
  const c = posterColors(poster, palette)
  return {
    wrap: [
      'display:flex',
      'justify-content:space-between',
      'align-items:flex-end',
      `margin:${POSTER_FOOTER_GAP}px 0 0`,
    ].join(';'),
    line: [
      `font-size:${POSTER_FOOTER_FONT}px`,
      `color:${c.footer}`,
      'line-height:1.7',
      'margin:0',
      'white-space:pre-line',
    ].join(';'),
    badge: [
      `font-size:${POSTER_FOOTER_FONT}px`,
      `color:${c.accent}`,
      'letter-spacing:0.2em',
      'white-space:nowrap',
    ].join(';'),
  }
}

/**
 * poster 清洗（validate / migrate 共用）：非对象 → null（删字段）；
 * 枚举越界落缺省；hex 非法删键；字符串截断到 200 字符；metaLines/footerLines 逐行清洗、
 * 上限 6 行；padding 钳制。宽容不拒（与 sanitizeKpiCards 同口径）。
 */
export function sanitizePoster(raw: unknown): PosterSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out: PosterSpec = {}
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' ? v.slice(0, 200) : undefined
  const hex = (v: unknown): string | undefined =>
    typeof v === 'string' ? (sanitizeHex(v) ?? undefined) : undefined
  // solid 为缺省形态（与无 poster 同视觉），不计为有效内容；仅非 solid 纹理入档
  if (o.bg === 'dots' || o.bg === 'ruled' || o.bg === 'gradient') out.bg = o.bg
  out.bgColor = hex(o.bgColor)
  out.bgAccent = hex(o.bgAccent)
  out.accent = hex(o.accent)
  out.textColor = hex(o.textColor)
  out.kicker = str(o.kicker)
  out.title = str(o.title)
  out.subtitle = str(o.subtitle)
  out.pageBadge = str(o.pageBadge)
  out.titleFont = o.titleFont === 'serif' ? 'serif' : o.titleFont === 'sans' ? 'sans' : undefined
  const lines = (v: unknown): string[] | undefined => {
    if (!Array.isArray(v)) return undefined
    const arr = v
      .map((x) => (typeof x === 'string' ? x.slice(0, 200) : ''))
      .filter((x) => x !== '')
      .slice(0, 6)
    return arr.length > 0 ? arr : undefined
  }
  out.metaLines = lines(o.metaLines)
  out.footerLines = lines(o.footerLines)
  // Schema 1.5：chips（≤6 项、每项 ≤24 字）/ legend（≤80 字）
  if (Array.isArray(o.chips)) {
    const chips = o.chips
      .map((x) => (typeof x === 'string' ? x.trim().slice(0, 24) : ''))
      .filter((x) => x !== '')
      .slice(0, 6)
    if (chips.length > 0) out.chips = chips
  }
  if (typeof o.legend === 'string' && o.legend.trim()) out.legend = o.legend.trim().slice(0, 80)
  if (Array.isArray(o.bgWashes)) {
    const washes: PosterWash[] = []
    for (const raw of o.bgWashes.slice(0, 6)) {
      if (!raw || typeof raw !== 'object') continue
      const w = raw as Record<string, unknown>
      const color = typeof w.color === 'string' ? sanitizeHex(w.color) : null
      if (!color) continue
      const num = (v: unknown, dflt: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : dflt
      washes.push({ color, x: num(w.x, 0.5), y: num(w.y, 0.5), r: num(w.r, 0.35) })
    }
    if (washes.length > 0) out.bgWashes = washes
  }
  if (typeof o.padding === 'number' && Number.isFinite(o.padding)) {
    out.padding = Math.min(POSTER_PAD_MAX, Math.max(POSTER_PAD_MIN, Math.round(o.padding)))
  }
  // 全空 → null（删字段，零占位）
  const empty = !out.bg && !out.bgColor && !out.bgAccent && !out.accent && !out.textColor &&
    !out.kicker && !out.title && !out.subtitle && !out.pageBadge && !out.titleFont &&
    !out.metaLines && !out.footerLines && out.padding === undefined && !out.bgWashes &&
    !out.chips && !out.legend
  return empty ? null : out
}
