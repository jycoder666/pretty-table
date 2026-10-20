import { describe, expect, it } from 'vitest'
import {
  MARK_GLYPH,
  MARK_LABEL,
  MARK_WORDS,
  RECOMMEND_BADGE_TEXT,
  formatNumber,
  parseMark,
} from './formatTokens'

describe('FormatTokens 常量', () => {
  it('符号与标签固定（FR-21）', () => {
    expect(MARK_GLYPH).toEqual({ yes: '✓', no: '✗', partial: '◐' })
    expect(MARK_LABEL).toEqual({ yes: '支持', no: '不支持', partial: '部分支持' })
    expect(RECOMMEND_BADGE_TEXT).toBe('推荐')
  })

  it('识别词表覆盖常见写法（E-2）', () => {
    expect(MARK_WORDS.yes).toContain('是')
    expect(MARK_WORDS.yes).toContain('支持')
    expect(MARK_WORDS.yes).toContain('✓')
    expect(MARK_WORDS.yes).toContain('√')
    expect(MARK_WORDS.yes).toContain('Y')
    expect(MARK_WORDS.no).toContain('否')
    expect(MARK_WORDS.no).toContain('不支持')
    expect(MARK_WORDS.partial).toContain('部分支持')
  })
})

describe('formatNumber（Intl zh-CN）', () => {
  it('percent：默认最多 2 位小数、末尾 0 不显示（Q-009）', () => {
    expect(formatNumber(0.25, { format: 'percent' })).toBe('25%')
    expect(formatNumber(0.1234, { format: 'percent' })).toBe('12.34%')
    expect(formatNumber(0.125, { format: 'percent' })).toBe('12.5%')
    expect(formatNumber(0.5, { format: 'percent' })).toBe('50%')
  })

  it('number 与 currency', () => {
    expect(formatNumber(1234.5, { format: 'number' })).toBe('1,235')
    expect(formatNumber(1234.5, { format: 'currency' })).toBe('¥1,234.50')
    expect(formatNumber(1200, { format: 'currency', fractionDigits: 0 })).toBe('¥1,200')
  })

  it('unit 加窄空格（U+202F）后缀', () => {
    expect(formatNumber(30, { format: 'number', unit: '元/月' })).toBe('30\u202F元/月')
  })

  it('locale 写死 zh-CN，不随浏览器语言变化', () => {
    const before = Intl.NumberFormat().resolvedOptions().locale
    // 即使宿主 locale 非 zh-CN，输出仍一致
    expect(formatNumber(0.25, { format: 'percent' })).toBe('25%')
    expect(formatNumber(1234.5, { format: 'number' })).toBe('1,235')
    expect(before.length).toBeGreaterThan(0)
  })

  it('底稿声明固定位数时以底稿为准', () => {
    expect(formatNumber(0.125, { format: 'percent', fractionDigits: 0 })).toBe('13%')
    expect(formatNumber(1234.5, { format: 'number', fractionDigits: 2 })).toBe('1,234.50')
  })
})

describe('parseMark（E-2 词表）', () => {
  it('词表内词 → 对应值（含大小写与全角符号）', () => {
    expect(parseMark('是')).toBe('yes')
    expect(parseMark('支持')).toBe('yes')
    expect(parseMark('✓')).toBe('yes')
    expect(parseMark('√')).toBe('yes')
    expect(parseMark('Y')).toBe('yes')
    expect(parseMark('yes')).toBe('yes')
    expect(parseMark('否')).toBe('no')
    expect(parseMark('✗')).toBe('no')
    expect(parseMark('N')).toBe('no')
    expect(parseMark('部分支持')).toBe('partial')
    expect(parseMark('部分')).toBe('partial')
  })

  it('词表外 → null', () => {
    expect(parseMark('面议')).toBeNull()
    expect(parseMark('仅限会员')).toBeNull()
    expect(parseMark('')).toBeNull()
    expect(parseMark('  ')).toBeNull()
  })
})
