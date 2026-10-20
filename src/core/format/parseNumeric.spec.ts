import { describe, expect, it } from 'vitest'
import { parseNumeric } from './parseNumeric'

type R = { ok: boolean; value?: number }

const v = (raw: string, format: 'number' | 'percent' | 'currency'): R => {
  const r = parseNumeric(raw, format)
  return r.ok ? { ok: true, value: r.value } : { ok: false }
}

describe('parseNumeric · number（只收纯数字）', () => {
  it('纯数字与千分位', () => {
    expect(v('1,234.5', 'number')).toEqual({ ok: true, value: 1234.5 })
    expect(v('1234.5', 'number')).toEqual({ ok: true, value: 1234.5 })
    expect(v('100', 'number')).toEqual({ ok: true, value: 100 })
  })

  it('带 %/¥/￥/$/「元」→ ok:false', () => {
    expect(v('25%', 'number').ok).toBe(false)
    expect(v('¥1,200', 'number').ok).toBe(false)
    expect(v('￥1,200', 'number').ok).toBe(false)
    expect(v('$12', 'number').ok).toBe(false)
    expect(v('1200元', 'number').ok).toBe(false)
  })
})

describe('parseNumeric · percent（裸数字 ÷100 存比例，E-9=A）', () => {
  it('裸数字按字面百分数存比例', () => {
    expect(v('25', 'percent')).toEqual({ ok: true, value: 0.25 })
    expect(v('0.5', 'percent')).toEqual({ ok: true, value: 0.005 })
    expect(v('1,234.5', 'percent')).toEqual({ ok: true, value: 12.345 })
  })

  it('带 % 按字面', () => {
    expect(v('25%', 'percent')).toEqual({ ok: true, value: 0.25 })
    expect(v('0.5%', 'percent')).toEqual({ ok: true, value: 0.005 })
  })

  it('带货币符号 → ok:false', () => {
    expect(v('¥25', 'percent').ok).toBe(false)
    expect(v('$25', 'percent').ok).toBe(false)
  })
})

describe('parseNumeric · currency（¥/￥/$ 前缀、「元」后缀、千分位）', () => {
  it('可识别写法', () => {
    expect(v('¥1,200', 'currency')).toEqual({ ok: true, value: 1200 })
    expect(v('￥1200', 'currency')).toEqual({ ok: true, value: 1200 })
    expect(v('$12', 'currency')).toEqual({ ok: true, value: 12 })
    expect(v('1200元', 'currency')).toEqual({ ok: true, value: 1200 })
    expect(v('1,200', 'currency')).toEqual({ ok: true, value: 1200 })
    expect(v('¥1200.5', 'currency')).toEqual({ ok: true, value: 1200.5 })
  })

  it('带 % → ok:false', () => {
    expect(v('25%', 'currency').ok).toBe(false)
  })
})

describe('parseNumeric · 非法输入', () => {
  it("parseNumeric('abc' | '' | '1.2.3', 任一) → ok:false", () => {
    for (const raw of ['abc', '', '1.2.3', '1,2,3', '¥', '元', '25%%', '￥￥12']) {
      expect(v(raw, 'number').ok).toBe(false)
      expect(v(raw, 'percent').ok).toBe(false)
      expect(v(raw, 'currency').ok).toBe(false)
    }
  })
})
