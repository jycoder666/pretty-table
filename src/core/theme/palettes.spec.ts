import { describe, expect, it } from 'vitest'
import { PALETTES, sanitizeHex, resolveTheme } from './palettes'

describe('sanitizeHex（FR-C1 输入钳制）', () => {
  it('#RRGGBB 合法 → 规范小写', () => {
    expect(sanitizeHex('#2F5B9A')).toBe('#2f5b9a')
    expect(sanitizeHex('#FFFFFF')).toBe('#ffffff')
  })

  it('#RGB 合法 → 扩展为 6 位小写', () => {
    expect(sanitizeHex('#F0A')).toBe('#ff00aa')
    expect(sanitizeHex('#abc')).toBe('#aabbcc')
  })

  it('非法输入 → null', () => {
    expect(sanitizeHex('2F5B9A')).toBeNull()
    expect(sanitizeHex('#12')).toBeNull()
    expect(sanitizeHex('#12345')).toBeNull()
    expect(sanitizeHex('#1234567')).toBeNull()
    expect(sanitizeHex('#GGHHII')).toBeNull()
    expect(sanitizeHex('')).toBeNull()
    expect(sanitizeHex('red')).toBeNull()
  })

  it('容忍首尾空白', () => {
    expect(sanitizeHex(' #2f5b9a ')).toBe('#2f5b9a')
  })
})

describe('resolveTheme · headerText 覆盖（schema 1.2）', () => {
  it('tokens.headerText 覆盖 palette.headerText；未覆盖走预设', () => {
    const r1 = resolveTheme('T-A', { primary: '#2f5b9a', headerText: '#123456' })
    expect(r1.palette.headerText).toBe('#123456')
    const r2 = resolveTheme('T-A', { primary: '#2f5b9a' })
    expect(r2.palette.headerText).toBe(PALETTES['T-A'].headerText)
  })

  it('其余角色覆盖语义不变（background→paper 等）', () => {
    const r = resolveTheme('T-A', { primary: '#2f5b9a', background: '#abcdef', emphasis: '#111111' })
    expect(r.palette.paper).toBe('#abcdef')
    expect(r.palette.emphasis).toBe('#111111')
  })
})
