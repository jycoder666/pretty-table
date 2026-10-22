import { describe, expect, it } from 'vitest'
import { toVTableTheme } from './vtableTheme'
import { PALETTES } from './palettes'

describe('toVTableTheme · 选区底色（F4 回归守卫）', () => {
  it('selectionStyle 显式 transparent：不落 vtable 兜底 rgba(0,0,255,0.1) 蓝色蒙层', () => {
    // 选区高亮由壳层 .selection-cell 自绘（R-2）；若这里留空，vtable 1.26.8 的
    // create-select-border.js 会兜底纯蓝 10% 底铺在画布选中格上，令预览中
    // 选中的图片格整格偏色（导出无选区故不偏）——即 F4「预览画布颜色漂移」
    const theme = toVTableTheme(PALETTES['T-A'], { zebraOn: true })
    const sel = theme.selectionStyle as { cellBgColor: string; cellBorderColor: string }
    expect(sel.cellBgColor).toBe('transparent')
    expect(sel.cellBorderColor).toBe('transparent')
  })

  it('透明底导出（transparentUnderlay）不影响 selectionStyle 契约', () => {
    const theme = toVTableTheme(PALETTES['T-A'], { zebraOn: false, transparentUnderlay: true })
    expect(theme.underlayBackgroundColor).toBe('transparent')
    expect((theme.selectionStyle as { cellBgColor: string }).cellBgColor).toBe('transparent')
  })
})
