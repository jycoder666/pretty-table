/**
 * parseNumeric（增强期设计增量 §2.1 步 6 / 需求 Q-011 + GC-16 E-9=A）：
 * - number   只收纯数字（可带千分位）；带 %/¥/￥/$/「元」→ ok:false
 * - percent  收裸数字与带 % 数字；裸数字 ÷100 存比例（25 → 0.25，0.5 → 0.005）；
 *            带货币符号 → ok:false
 * - currency 收 ¥/￥/$ 前缀、「元」后缀、千分位；带 % → ok:false
 * 解析不了的格由调用方按文字写入并提示 PASTE_NOTICE_AS_TEXT，本函数不产生提示。
 */

export type ParseNumericFormat = 'number' | 'percent' | 'currency'
export type ParseNumericResult = { ok: true; value: number } | { ok: false }

const CURRENCY_PREFIX = /^[¥￥$]/
const NUMERIC =
  /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-?\d+(?:\.\d+)?$/

/** 全角数字转半角并去掉所有空白（含全角空格） */
function normalize(raw: string): string {
  return raw
    .replace(/\u00A0|\u202F|\u3000/g, '')
    .replace(/\s+/g, '')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, '.')
}

function toNumber(s: string): number | null {
  if (!NUMERIC.test(s)) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parseNumeric(raw: string, format: ParseNumericFormat): ParseNumericResult {
  const s = normalize(raw)
  if (s === '') return { ok: false }

  const hasCurrency = /[¥￥$]/.test(s)
  const hasPercent = s.includes('%')
  const hasYuanSuffix = s.endsWith('元')

  if (format === 'number') {
    if (hasCurrency || hasPercent || hasYuanSuffix) return { ok: false }
    const v = toNumber(s)
    return v === null ? { ok: false } : { ok: true, value: v }
  }

  if (format === 'percent') {
    if (hasCurrency || hasYuanSuffix) return { ok: false }
    const body = hasPercent ? s.slice(0, -1) : s
    if (body === '' || body.includes('%')) return { ok: false }
    const v = toNumber(body)
    if (v === null) return { ok: false }
    // E-9=A：裸数字与带 % 一律按字面百分数，存比例（÷100）
    return { ok: true, value: v / 100 }
  }

  // currency
  if (hasPercent) return { ok: false }
  let body = s
  if (CURRENCY_PREFIX.test(body)) body = body.slice(1)
  if (body.endsWith('元')) body = body.slice(0, -1)
  const v = toNumber(body)
  if (v === null) return { ok: false }
  return { ok: true, value: v }
}
