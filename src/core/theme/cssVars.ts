import type { Palette } from './palettes'

export function toCssVars(palette: Palette): Record<`--pt-${string}`, string> {
  return {
    '--pt-paper': palette.paper,
    '--pt-primary': palette.primary,
    '--pt-header-text': palette.headerText,
    '--pt-zebra': palette.zebra,
    '--pt-emphasis': palette.emphasis,
    '--pt-emphasis-soft': palette.emphasisSoft,
    '--pt-border': palette.border,
    '--pt-tag': palette.tag,
    '--pt-tag-text': palette.tagText,
    '--pt-muted': palette.muted,
  }
}
