import { describe, expect, it } from 'vitest'
import { PALETTES } from './palettes'
import { semanticColor } from './semantic'

describe('semanticColor（只映射既有 token，不新增色值）', () => {
  it('yes/partial → primary；no → emphasis（设计增量 §4.3）', () => {
    for (const id of ['T-A', 'T-B', 'T-C'] as const) {
      const p = PALETTES[id]
      expect(semanticColor(p, 'yes')).toBe(p.primary)
      expect(semanticColor(p, 'partial')).toBe(p.primary)
      expect(semanticColor(p, 'no')).toBe(p.emphasis)
    }
  })

  it('推荐角标：底 emphasis、字 headerText；推荐列浅底 emphasis 同档浅底', () => {
    for (const id of ['T-A', 'T-B', 'T-C'] as const) {
      const p = PALETTES[id]
      expect(semanticColor(p, 'recommendBadgeBg')).toBe(p.emphasis)
      expect(semanticColor(p, 'recommendBadgeText')).toBe(p.headerText)
      expect(semanticColor(p, 'recommendColBg')).toBe(p.emphasisSoft)
    }
  })

  it('切主题颜色跟变（TC-PT-073/074）', () => {
    expect(semanticColor(PALETTES['T-A'], 'yes')).not.toBe(semanticColor(PALETTES['T-B'], 'yes'))
    expect(semanticColor(PALETTES['T-B'], 'no')).toBe(PALETTES['T-B'].emphasis)
  })
})
