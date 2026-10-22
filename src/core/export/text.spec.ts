import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, MATRIX_V1, PRICING_V1 } from '../templates'
import { cloneInstance } from '../schema/validate'
import type { TemplateInstance } from '../types'
import { buildExportModel, renderExportText } from './model'
import { exportText } from './text'

/**
 * 纯文本导出（设计增量 §5.2 剪贴板行）：ExportModel → TSV。
 * 验收口径：caption 占首行、矩形网格（合并格补空）、与 HTML textContent 同口径、空槽不泄占位。
 */

function lines(inst: TemplateInstance): string[] {
  const m = buildExportModel(cloneInstance(inst))
  expect(m.ok).toBe(true)
  if (!m.ok) return []
  return renderExportText(m.value).split('\n')
}

/** caption 之后的表格行（caption 单独占一行，列数与表体不同） */
function gridRows(inst: TemplateInstance): string[] {
  return lines(inst).slice(1)
}

describe('renderExportText（TSV 纯文本风味）', () => {
  it('价目：caption 占首行，表格各行按制表符分列且列数一致（矩形网格）', () => {
    const all = lines(PRICING_V1)
    expect(all[0]).toBe('装修项目价目表')
    const widths = new Set(gridRows(PRICING_V1).map((r) => r.split('\t').length))
    expect([...widths]).toEqual([6])
  })

  it('价目：合计行 colspan=5 → 锚点写文本，其余 4 列补空串', () => {
    const total = gridRows(PRICING_V1).find((r) => r.startsWith('合计'))
    expect(total).toBeDefined()
    expect(total!.split('\t')).toEqual(['合计', '', '', '', '', '¥15,978.00'])
  })

  it('矩阵：rowspan=2 的角格 → 被覆盖行的首列为空串，行仍满列', () => {
    const rows = gridRows(MATRIX_V1)
    const widths = new Set(rows.map((r) => r.split('\t').length))
    expect([...widths]).toEqual([6])
    // 「条目」跨两行：角格所在行之后的表头行首列补空
    const cornerIdx = rows.findIndex((r) => r.startsWith('条目\t'))
    expect(cornerIdx).toBeGreaterThan(-1)
    expect(rows[cornerIdx + 1]!.split('\t')[0]).toBe('')
  })

  it('角标：recommendCol 的表头格输出「文本+角标」（与 HTML textContent 同口径）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.highlight = { recommendCol: 1 }
    expect(gridRows(inst).some((r) => r.includes('推荐'))).toBe(true)
  })

  it('空槽不泄占位：文本里不出现占位文案', () => {
    expect(lines(PRICING_V1).join('\n')).not.toContain('填写')
  })

  it('exportText 与 renderExportText 同源；无空行、无尾随换行', () => {
    const r = exportText(cloneInstance(PRICING_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const rows = lines(PRICING_V1)
    expect(r.value).toBe(rows.join('\n'))
    expect(rows.every((l) => l.length > 0)).toBe(true)
    expect(r.value.endsWith('\n')).toBe(false)
  })
})
