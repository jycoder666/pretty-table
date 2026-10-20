import type { SlotDef } from '../types'

/**
 * FormatTokens（增强期设计增量 §4.2）：全局常量 + 唯一数值格式化实现。
 * 预览 / HTML / PNG / Markdown 共用；locale 写死 zh-CN，不随浏览器语言变化。
 */

export const MARK_GLYPH = { yes: '✓', no: '✗', partial: '◐' } as const

export const MARK_LABEL = { yes: '支持', no: '不支持', partial: '部分支持' } as const

/** E-2 识别词表（只在 kind=mark 槽生效；词表外文字按原样写入） */
export const MARK_WORDS: {
  yes: readonly string[]
  no: readonly string[]
  partial: readonly string[]
} = {
  yes: [
    '是', '对', '有', '支持', '包含', '含', '具备', '可以', '允许',
    '✓', '√', 'Y', 'y', 'yes', 'Yes', 'YES', 'true', 'True', 'TRUE',
  ],
  no: [
    '否', '非', '无', '没有', '不支持', '不包含', '不含', '不具备', '不可以', '不允许',
    '✗', '×', 'X', 'x', 'N', 'n', 'no', 'No', 'NO', 'false', 'False', 'FALSE',
  ],
  partial: [
    '部分', '部分支持', '部分包含', '含部分', '有限支持', '◐',
    'half', 'Half', 'HALF', 'partial', 'Partial', 'PARTIAL',
  ],
}

export const RECOMMEND_BADGE_TEXT = '推荐' as const

const NARROW_SPACE = '\u202F'
const FORMAT_LOCALE = 'zh-CN'

/**
 * 唯一的数值格式化实现（FR-22）：
 * - number   → 千分位 decimal
 * - percent  → style:"percent"（0.25 → 25%），默认最多 2 位小数、末尾 0 不显示（Q-009）
 * - currency → style:"currency"（默认 CNY），缺省 2 位小数
 * - unit     → 窄空格（U+202F）后缀
 * 底稿声明了 fractionDigits 时以底稿为准。
 */
export function formatNumber(v: number, def: SlotDef): string {
  const format = def.format ?? 'number'
  let text: string
  if (format === 'percent') {
    const nf = new Intl.NumberFormat(FORMAT_LOCALE, {
      style: 'percent',
      minimumFractionDigits: def.fractionDigits ?? 0,
      maximumFractionDigits: def.fractionDigits ?? 2,
    })
    text = nf.format(v)
  } else if (format === 'currency') {
    const nf = new Intl.NumberFormat(FORMAT_LOCALE, {
      style: 'currency',
      currency: def.currency ?? 'CNY',
      minimumFractionDigits: def.fractionDigits ?? 2,
      maximumFractionDigits: def.fractionDigits ?? 2,
    })
    text = nf.format(v)
  } else {
    const nf = new Intl.NumberFormat(FORMAT_LOCALE, {
      style: 'decimal',
      minimumFractionDigits: def.fractionDigits ?? 0,
      maximumFractionDigits: def.fractionDigits ?? 0,
    })
    text = nf.format(v)
  }
  return def.unit ? `${text}${NARROW_SPACE}${def.unit}` : text
}

/** 词表内词 → 三态；词表外 → null（调用方按文字处理） */
export function parseMark(raw: string): 'yes' | 'no' | 'partial' | null {
  const t = raw.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  for (const kind of ['yes', 'no', 'partial'] as const) {
    const words = MARK_WORDS[kind]
    if (words.includes(t)) return kind
  }
  for (const kind of ['yes', 'no', 'partial'] as const) {
    if (MARK_WORDS[kind].some((w) => w.toLowerCase() === lower)) return kind
  }
  return null
}
