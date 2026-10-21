import { describe, expect, it } from 'vitest'
import type { TemplateInstance } from '../types'
import { parsePaste } from './parser'
import { planPaste } from './planner'
import { validatePaste } from './validator'
import { makePasteFixture } from './planner.spec'
import { cloneInstance } from '../schema/validate'

function plan2x2(inst: TemplateInstance, anchor: [number, number], text = '1\t2\n3\t4') {
  const grid = parsePaste({ text })
  expect(grid.ok).toBe(true)
  const p = planPaste(inst, 0, anchor, grid.ok ? grid.value : { h: 0, w: 0, cells: [] })
  expect(p.ok).toBe(true)
  return p.ok ? p.value : null
}

const codes = (errs: { code: string }[]) => errs.map((e) => e.code)

describe('validatePaste · errors[] 排序与整块拒收（Q-020）', () => {
  it('12. 只命中合并格 → errors=[PASTE_HITS_MERGED]，details 含命中区间', () => {
    const inst = makePasteFixture()
    inst.layout.merges = [{ start: [1, 0], end: [1, 1] }]
    const plan = plan2x2(inst, [1, 0])!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_HITS_MERGED'])
    expect(v.errors[0]!.details).toEqual({
      merges: [{ start: [1, 0], end: [1, 1] }],
    })
  })

  it('13. 只跨区块行 → errors=[PASTE_HITS_BLOCK]（默认启用），details.blockSlotId', () => {
    const inst = makePasteFixture()
    const plan = plan2x2(inst, [2, 0])! // visible 2,3：第 2 逻辑行 + 区块行
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_HITS_BLOCK'])
    expect(v.errors[0]!.details).toMatchObject({ blockSlotId: 'gap-1' })
  })

  it('14. 只命中 slotGrid=null 或 slotDefs.locked → errors=[PASTE_HITS_LOCKED]，details 列全部命中格', () => {
    const inst = makePasteFixture()
    inst.layout.slotGrid![0]![1] = null
    inst.slotDefs = { ...inst.slotDefs, 'b.1': { kind: 'text', locked: true } }
    const plan = plan2x2(inst, [0, 0])!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_HITS_LOCKED'])
    expect(v.errors[0]!.details).toMatchObject({
      cells: [
        { row: 0, col: 1, slotId: null },
        { row: 1, col: 0, slotId: 'b.1' },
      ],
    })
  })

  it('15. 只超出 → errors=[PASTE_OUT_OF_RANGE]，extraRows/extraCols 按可见网格算（区块行算 1 行）', () => {
    const inst = makePasteFixture() // 可见 7 行 × 2 列
    const plan = plan2x2(inst, [6, 0], '1\t2\t3\n4\t5\t6')!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_OUT_OF_RANGE'])
    expect(v.errors[0]!.details).toEqual({ extraRows: 1, extraCols: 1 })
  })

  it('16. 同时命中区块 + 超出 → errors 顺序 [HITS_BLOCK, OUT_OF_RANGE]，主码 HITS_BLOCK', () => {
    const inst = makePasteFixture()
    const plan = plan2x2(inst, [6, 0], '1\t2\t3')! // 末行起粘 1×3：超 1 列
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_OUT_OF_RANGE'])
    // 再造区块+超出：起点末行、高 2 → 超出可见网格，同时第三目标行不存在（不重复报区块）；
    // 用中间起点覆盖区块行且超列
    const plan2 = plan2x2(inst, [2, 0], '1\t2\t3\n4\t5\t6')!
    const v2 = validatePaste(inst, plan2)
    expect(v2.ok).toBe(false)
    if (v2.ok) return
    expect(codes(v2.errors)).toEqual(['PASTE_HITS_BLOCK', 'PASTE_OUT_OF_RANGE'])
    expect(v2.errors[0]!.code).toBe('PASTE_HITS_BLOCK')
  })

  it('17. 同时命中合并 + 锁定 + 超出 → [HITS_MERGED, HITS_LOCKED, OUT_OF_RANGE]', () => {
    const inst = makePasteFixture()
    inst.layout.merges = [{ start: [1, 0], end: [1, 1] }]
    inst.layout.slotGrid![0]![1] = null
    const plan = plan2x2(inst, [0, 0], '1\t2\t3\n4\t5\t6')!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_HITS_MERGED', 'PASTE_HITS_LOCKED', 'PASTE_OUT_OF_RANGE'])
  })

  it('18. 区块/合并/锁定只检查可见网格内部分（超出部分不重复报）', () => {
    const inst = makePasteFixture()
    inst.layout.merges = [{ start: [0, 0], end: [0, 1] }]
    inst.layout.slotGrid![0]![0] = null
    // 起点末行（f.2），h=2：第二行完全超出（不产生合并/锁定重复报告，只有 OUT_OF_RANGE）
    const plan = plan2x2(inst, [6, 1])!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(codes(v.errors)).toEqual(['PASTE_OUT_OF_RANGE'])
  })
})

describe('validatePaste · 数值换算与 notice（Q-011/Q-010）', () => {
  function run(inst: TemplateInstance, anchor: [number, number], text: string) {
    const grid = parsePaste({ text })
    expect(grid.ok).toBe(true)
    const p = planPaste(inst, 0, anchor, grid.ok ? grid.value : { h: 0, w: 0, cells: [] })
    expect(p.ok).toBe(true)
    if (!p.ok) return null
    const v = validatePaste(inst, p.value)
    expect(v.ok).toBe(true)
    return v.ok ? v.value : null
  }

  it('19. percent/currency/number 的换算规则', () => {
    const inst = makePasteFixture()
    // 可见 [2,0] = 逻辑 c.1（percent 槽）
    expect(run(inst, [2, 0], '25')!.writes[0]!.value).toEqual({ num: 0.25 })
    expect(run(inst, [2, 0], '0.5')!.writes[0]!.value).toEqual({ num: 0.005 })
    expect(run(inst, [2, 0], '25%')!.writes[0]!.value).toEqual({ num: 0.25 })
    // 可见 [4,0] = 逻辑 d.1（currency 槽）
    const v = run(inst, [4, 0], '¥1,200\t8')!
    expect(v.writes[0]).toEqual({ slotId: 'd.1', value: { num: 1200 } })
    expect(v.writes[1]).toEqual({ slotId: 'd.2', value: { text: '8' } })
  })

  it('19b. number 槽带货币符号 → 文字 + notice PASTE_NOTICE_AS_TEXT；mark 词表外 → 文字 + notice', () => {
    const inst = makePasteFixture()
    // 可见 [5,0] = 逻辑 e.1（number）/ e.2；可见 [6,0] = f.1（mark）
    const v = run(inst, [5, 0], '¥1,200\t仅限会员')!
    const bySlot = Object.fromEntries(v.writes.map((w) => [w.slotId, w.value]))
    expect(bySlot['e.1']).toEqual({ text: '¥1,200' })
    const v2 = run(inst, [6, 0], '仅限会员')!
    expect(v2.writes[0]!.value).toEqual({ text: '仅限会员' })
    expect(v2.notices).toHaveLength(1)
    expect(v2.notices[0]!.code).toBe('PASTE_NOTICE_AS_TEXT')
    expect(v2.notices[0]!.details).toMatchObject({ cells: [{ row: 6, col: 0, slotId: 'f.1' }] })
  })

  it('19c. mark 槽词表内 → {mark:"yes"}', () => {
    const inst = makePasteFixture()
    const v = run(inst, [6, 0], '是')!
    expect(v.writes[0]).toEqual({ slotId: 'f.1', value: { mark: 'yes' } })
    expect(v.notices).toHaveLength(0)
  })

  it('20. notice 不导致拒收；percent 裸数字不产生任何改写提醒（Q-010）', () => {
    const inst = makePasteFixture()
    const grid = parsePaste({ text: '25' })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    const p = planPaste(inst, 0, [2, 0], grid.value)
    expect(p.ok).toBe(true)
    if (!p.ok) return
    const v = validatePaste(inst, p.value)
    expect(v.ok).toBe(true)
    expect(v.ok ? v.value.notices : []).toHaveLength(0)
    expect(v.ok ? v.value.writes[0] : null).toEqual({ slotId: 'c.1', value: { num: 0.25 } })
  })

  it('20b. 全部通过（纯文字）→ 无 notices、逐格 writes', () => {
    const inst = cloneInstance(makePasteFixture())
    const plan = plan2x2(inst, [0, 0], '甲\t乙\n丙\t丁')!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value.writes).toHaveLength(4)
    expect(v.value.notices).toHaveLength(0)
  })
})

// ── 交互升级 T02：图片格槽位 × TSV 粘贴边界（R-3：图片不走文本粘贴）──

describe('validatePaste · 图片槽边界（R-3）', () => {
  it('text 槽存 {image} 时粘贴文字 → 按文字覆盖（TSV 流程无图片语义，不报错）', () => {
    const inst = makePasteFixture()
    const target = inst.layout.slotGrid![0]![0]!
    inst.slots[target] = { image: 'data:image/png;base64,AAAA' }
    const plan = plan2x2(inst, [0, 0], '新文字\t2\n3\t4')!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const write = v.value.writes.find((w) => w.slotId === target)
    expect(write?.value).toEqual({ text: '新文字' })
  })

  it('data URL 文本粘进槽位 → 按普通文字写入（渲染层不会当作图片，GC-22 无注入面）', () => {
    const inst = makePasteFixture()
    const plan = plan2x2(inst, [0, 0], 'data:image/png;base64,AAAA\t2\n3\t4')!
    const v = validatePaste(inst, plan)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    const target = inst.layout.slotGrid![0]![0]!
    const write = v.value.writes.find((w) => w.slotId === target)
    expect(write?.value).toEqual({ text: 'data:image/png;base64,AAAA' })
  })
})
