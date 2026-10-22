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
    // 选区高亮：本应用自绘（壳 .selection-cell 叠加层，主题 primary 10% + 2px 描边，R-2），
    // 必须关掉 VTable 内建选区底色——vtable 1.26.8 在 selectionStyle.cellBgColor 缺省时
    // 兜底 rgba(0,0,255,0.1)（create-select-border.js），会在画布上给选中格蒙一层纯蓝，
    // 使预览里选中的图片格整格偏色（导出无选区故不偏），即 F4「预览画布颜色漂移」的成因。
    selectionStyle: {
      cellBgColor: 'transparent',
      cellBorderColor: 'transparent',
    },
  }
}
