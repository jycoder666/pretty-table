import type { Align, Emphasis } from '../types'
import type { Palette } from './palettes'
import { FONT_STACK } from './font'

export function cellInlineStyle(
  palette: Palette,
  cell: {
    role: 'header' | 'body' | 'label' | 'block'
    zebraRow?: boolean
    align?: Align
    emphasize?: Emphasis[]
  },
): string {
  const parts: string[] = [
    `font-family:${FONT_STACK}`,
    'font-size:13px',
    'padding:8px 10px',
    `border:1px solid ${palette.border}`,
  ]

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
  if (em.includes('bg')) parts.push(`background:${palette.emphasisSoft}`)

  return parts.join(';')
}
