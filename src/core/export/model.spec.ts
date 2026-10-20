import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, MATRIX_V1, PRICING_V1 } from '../templates'
import { buildExportModel } from './model'
import { cloneInstance } from '../schema/validate'

function flatten(rows: { tag: string; text: string }[][]): string {
  return rows.flat().map((c) => `${c.tag}:${c.text}`).join('|')
}

describe('buildExportModel（T28 · ExportModel）', () => {
  it('价目：captionSlot 作 caption，表头 th scope=col，首列 th scope=row', () => {
    const m = buildExportModel(cloneInstance(PRICING_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.caption).toBe('装修项目价目表')
    expect(m.value.headRows).toHaveLength(2)
    // R0 表名合并行与 R1 列头都是 th scope=col
    for (const row of m.value.headRows) {
      for (const cell of row) {
        expect(cell.tag).toBe('th')
        expect(cell.scope).toBe('col')
      }
    }
    // 表体首个条目行的「序号」为 th scope=row（bodyRows[0] 是区块行，跳过）
    const seq = m.value.bodyRows.flat().find((c) => c.text === '1')
    expect(seq?.tag).toBe('th')
    expect(seq?.scope).toBe('row')
  })

  it('价目：合计行 C0–C4 合并 → colSpan 5，跳格不重复输出', () => {
    const m = buildExportModel(cloneInstance(PRICING_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const last = m.value.bodyRows[m.value.bodyRows.length - 1] ?? []
    expect(last).toHaveLength(2) // 合并格 + 合计金额
    expect(last[0]?.colSpan).toBe(5)
    expect(last[0]?.text).toBe('合计')
    expect(last[1]?.text).toBe('¥15,978.00')
  })

  it('矩阵：符号格输出字形 + aria-label，百分比格按比例显示', () => {
    const m = buildExportModel(cloneInstance(MATRIX_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const flat = flatten(m.value.bodyRows)
    expect(flat).toContain('td:✓')
    expect(flat).toContain('td:✗')
    expect(flat).toContain('td:◐')
    const flatCells = m.value.bodyRows.flat()
    const yes = flatCells.find((c) => c.text === '✓')
    expect(yes?.ariaLabel).toBe('支持')
    const no = flatCells.find((c) => c.text === '✗')
    expect(no?.ariaLabel).toBe('不支持')
    const partial = flatCells.find((c) => c.text === '◐')
    expect(partial?.ariaLabel).toBe('部分支持')
    expect(flatCells.some((c) => c.text === '98%')).toBe(true)
  })

  it('矩阵：「条目」rowspan=2，档位分组 colspan 输出，首列 sticky', () => {
    const m = buildExportModel(cloneInstance(MATRIX_V1))
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const corner = m.value.headRows[0]?.[0]
    expect(corner?.rowSpan).toBe(2)
    expect(corner?.text).toBe('条目')
    const spans = m.value.headRows[0]?.map((c) => c.colSpan) ?? []
    expect(spans).toContain(2)
    expect(spans).toContain(3)
    // 首列格带 sticky（R1 首格因角合并被跳过，检查角落格与首个条目行）
    expect(m.value.headRows[0]?.[0]?.style).toContain('position:sticky;left:0')
    const entryRow = m.value.bodyRows.find((r) => r.length > 1 && r[0]?.scope === 'row')
    expect(entryRow?.[0]?.style).toContain('position:sticky;left:0')
  })

  it('推荐列：最深表头带 badge，列内单元格带主色描边', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.highlight = { recommendCol: 1 }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const deepest = m.value.headRows[m.value.headRows.length - 1] ?? []
    // 角标挂在可推荐列的表头格上（该行首格因角合并被跳过，输出顺序前移）
    expect(deepest.some((c) => c.badge === '推荐')).toBe(true)
    for (const row of m.value.bodyRows) {
      if (row.length === 1) continue // 区块行整行 colspan，不在推荐列语义内
      expect(row[1]?.style).toContain('border:2px solid')
    }
  })

  it('emphFooter 区块 → tfoot 整行 th colspan', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.blocks.push({
      id: 'foot-1',
      type: 'emphFooter',
      slotId: 'footer-1',
      props: { text: '以上价格含税' },
    })
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.footRows).toHaveLength(1)
    expect(m.value.footRows[0]?.[0]?.text).toBe('以上价格含税')
    expect(m.value.footRows[0]?.[0]?.colSpan).toBe(inst.layout.colCount)
    expect(m.value.footRows[0]?.[0]?.tag).toBe('th')
  })

  it('minWidthPx = 首列 96 + 其余列 × 120；空槽导出为空串', () => {
    for (const inst of [PRICING_V1, MATRIX_V1]) {
      const m = buildExportModel(cloneInstance(inst))
      expect(m.ok).toBe(true)
      if (!m.ok) continue
      expect(m.value.minWidthPx).toBe(96 + (inst.layout.colCount - 1) * 120)
      expect(m.value.bodyRows.flat().some((c) => c.text === '填写内容')).toBe(false)
    }
  })
})
