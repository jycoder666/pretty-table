import type { Align, Emphasis } from '../types'
import type { Palette } from './palettes'
import { FONT_STACK, SERIF_FONT_STACK } from './font'
import { BAR_MARK_LEFT_WIDTH, DISPLAY_FONT_SIZE } from './layoutScales'
import type { TypeMetrics } from '../adapter/toOption'

export function cellInlineStyle(
  palette: Palette,
  cell: {
    role: 'header' | 'body' | 'label' | 'block'
    zebraRow?: boolean
    align?: Align
    emphasize?: Emphasis[]
  },
  metrics?: TypeMetrics,
  opts?: { gridLines?: 'all' | 'rows'; hairline?: boolean },
): string {
  const fs = metrics?.fontSize ?? 13
  const pv = metrics?.padV ?? 8
  const ph = metrics?.padH ?? 10
  // gridLines 'rows'（与画布 styleForCell 同源）：只留行间横线，且横线随 hairline（zebraRange
  // 数据区）限定——区间外注脚/列头行无任何边线声明
  const rowsOnly = opts?.gridLines === 'rows'
  const borderPart = !rowsOnly
    ? `border:1px solid ${palette.border}`
    : opts?.hairline === false
      ? ''
      : `border-bottom:1px solid ${palette.border}`
  const parts: string[] = [
    `font-family:${FONT_STACK}`,
    `font-size:${fs}px`,
    `padding:${pv}px ${ph}px`,
    borderPart,
  ].filter(Boolean)

  if (cell.role === 'header') {
    parts.push(`background:${palette.primary}`, `color:${palette.headerText}`, 'font-weight:bold')
  } else if (cell.role === 'block') {
    parts.push(`background:${palette.primary}`, `color:${palette.headerText}`, 'font-weight:600')
  } else if (cell.role === 'label') {
    parts.push(
      `background:${cell.zebraRow ? palette.zebra : palette.paper}`,
      'color:#333',
      'font-weight:600',
    )
  } else {
    parts.push(
      `background:${cell.zebraRow ? palette.zebra : palette.paper}`,
      'color:#1a1a1a',
    )
  }

  if (cell.align) parts.push(`text-align:${cell.align}`)

  const em = cell.emphasize ?? []
  if (em.includes('bold')) parts.push('font-weight:700')
  if (em.includes('red')) parts.push(`color:${palette.emphasis}`)
  if (em.includes('green')) parts.push(`color:${palette.success}`)
  if (em.includes('bg')) parts.push(`background:${palette.emphasisSoft}`)
  // 2026-11-10 四新 mark（与 toOption.styleForCell 画布侧同源同序，后写声明覆盖前写）：
  if (em.includes('serif')) parts.push(`font-family:${SERIF_FONT_STACK}`)
  if (em.includes('display')) parts.push(`font-size:${DISPLAY_FONT_SIZE}px`)
  if (em.includes('muted')) parts.push(`color:${palette.muted}`)
  // 汇总带左强调竖条：写在 border 简写之后，CSS 后者覆盖左缘
  if (em.includes('bar')) {
    parts.push(`border-left:${BAR_MARK_LEFT_WIDTH}px solid ${palette.headerText}`)
  }
  // 下缘重强调线（与画布 styleForCell 'rule' 同源同值）：列头行下的全宽深色粗线等
  if (em.includes('rule')) {
    parts.push(`border-bottom:3px solid ${palette.headerText}`)
  }

  return parts.join(';')
}
