import type { Palette } from './palettes'
import { FONT_STACK } from './font'

export function toVTableTheme(
  palette: Palette,
  opts: { zebraOn: boolean; transparentUnderlay?: boolean },
): Record<string, unknown> {
  const underlay = opts.transparentUnderlay ? 'transparent' : palette.paper
  return {
    underlayBackgroundColor: underlay,
    defaultStyle: {
      color: '#1a1a1a',
      bgColor: palette.paper,
      borderColor: palette.border,
      fontSize: 13,
      fontFamily: FONT_STACK,
      padding: [8, 10, 8, 10],
    },
    headerStyle: {
      color: palette.headerText,
      bgColor: palette.primary,
      fontWeight: 'bold',
      borderColor: palette.border,
      fontFamily: FONT_STACK,
    },
    bodyStyle: {
      color: '#1a1a1a',
      bgColor(args: { row: number }) {
        if (!opts.zebraOn) return palette.paper
        return args.row % 2 === 0 ? palette.paper : palette.zebra
      },
      borderColor: palette.border,
      fontFamily: FONT_STACK,
    },
    frameStyle: {
      borderColor: palette.border,
      borderLineWidth: 1,
    },
  }
}
