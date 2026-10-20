import { describe, expect, it } from 'vitest'
import { parsePaste } from './parser'

describe('parsePaste · Parser（设计增量 §2.1 步 2～3）', () => {
  it('1. TSV 3×2 → h=3,w=2；末尾空行空列去掉', () => {
    const r = parsePaste({ text: 'a\tb\nc\td\ne\tf\n\n' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.h).toBe(3)
    expect(r.value.w).toBe(2)
  })

  it('1b. 全空尾列去掉（Excel 尾换行 + 尾空列）', () => {
    const r = parsePaste({ text: 'a\tb\t\nc\td\t\n' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.w).toBe(2)
  })

  it('2. 引号包裹的格内换行/制表符保留在单格内', () => {
    const r = parsePaste({ text: '"x\ty"\tz\n"a\nb"\tc' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.w).toBe(2)
    const c00 = r.value.cells.find((c) => c.r === 0 && c.c === 0)!
    const c10 = r.value.cells.find((c) => c.r === 1 && c.c === 0)!
    expect(c00.raw).toBe('x\ty')
    expect(c10.raw).toBe('a\nb')
  })

  it('3. 短行不补齐：缺格不产出；源中明确空格 → kind:"empty"', () => {
    const r = parsePaste({ text: 'a\t\tb\nc\td' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.w).toBe(3)
    expect(r.value.cells.find((c) => c.r === 0 && c.c === 1)).toEqual({
      r: 0,
      c: 1,
      raw: '',
      kind: 'empty',
    })
    expect(r.value.cells.find((c) => c.r === 1 && c.c === 2)).toBeUndefined()
  })

  it('4. text/plain 为空时取 text/html 第一个 table 的 textContent；HTML 不进入输出', () => {
    const r = parsePaste({
      text: '',
      html: '<div><span>x</span><table><tr><td>1</td><td><b>2</b></td></tr><tr><td>3</td><td>4</td></tr></table></div>',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.h).toBe(2)
    expect(r.value.w).toBe(2)
    expect(r.value.cells.every((c) => !/[<>]/.test(c.raw))).toBe(true)
    expect(r.value.cells.find((c) => c.r === 0 && c.c === 1)?.raw).toBe('2')
  })

  it('5. 无文本 → PASTE_EMPTY；>64KB → PASTE_PARSE_FAILED；解析后 0 行 → PASTE_PARSE_FAILED', () => {
    const none = parsePaste({})
    expect(none.ok).toBe(false)
    expect(none.ok ? '' : none.error.code).toBe('PASTE_EMPTY')
    const big = parsePaste({ text: 'a'.repeat(64 * 1024 + 1) })
    expect(big.ok).toBe(false)
    expect(big.ok ? '' : big.error.code).toBe('PASTE_PARSE_FAILED')
    const empty = parsePaste({ text: '""' })
    expect(empty.ok).toBe(false)
    expect(empty.ok ? '' : empty.error.code).toBe('PASTE_PARSE_FAILED')
  })

  it('6. 逗号不拆列（delimiter 固定 \\t）', () => {
    const r = parsePaste({ text: 'a,b\tc\nd,e\tf' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.w).toBe(2)
    expect(r.value.cells.find((c) => c.r === 0 && c.c === 0)?.raw).toBe('a,b')
  })
})
