import type { Palette } from './palettes'
import { FONT_STACK } from './font'
import type { TypeMetrics } from '../adapter/toOption'

export function toVTableTheme(
  palette: Palette,
  opts: { zebraOn: boolean; transparentUnderlay?: boolean; metrics?: TypeMetrics },
): Record<string, unknown> {
  const underlay = opts.transparentUnderlay ? 'transparent' : palette.paper
  const fs = opts.metrics?.fontSize ?? 13
  const pv = opts.metrics?.padV ?? 8
  const ph = opts.metrics?.padH ?? 10
  return {
    underlayBackgroundColor: underlay,
    defaultStyle: {
      color: '#1a1a1a',
      bgColor: palette.paper,
      borderColor: palette.border,
      fontSize: fs,
      fontFamily: FONT_STACK,
      padding: [pv, ph, pv, ph],
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
