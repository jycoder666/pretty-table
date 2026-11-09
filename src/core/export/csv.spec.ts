import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { exportCsv } from './csv'
import { cloneInstance } from '../schema/validate'

/**
 * P4 CSV 导出（RFC 4180）：基于 COMPARE_ALPHA_V1 真实结构断言——
 * 首行为表头、合并区仅锚点出值、覆盖位补空串保持矩形、
 * 值含 , " \n 时引号转义、BOM 前缀、\r\n 行分隔、空表 fail。
 */

/** 简易 RFC 4180 解析（测试辅助）：去 BOM，处理引号包裹（含内嵌逗号/换行/加倍引号）后拆行列 */
function rowsOf(csv: string): string[][] {
  const text = csv.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else field += ch
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

describe('exportCsv（P4 · RFC 4180）', () => {
  it('BOM 前缀 + \\r\\n 行分隔；首行是表头（headerLevels 行在前）', () => {
    const r = exportCsv(cloneInstance(COMPARE_ALPHA_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.startsWith('\uFEFF')).toBe(true)
    const lines = r.value.replace(/^\uFEFF/, '').split('\r\n')
    // COMPARE：2 行表头 + 区块行 + 8 行数据，行数 ≥ 10 且末行非空（无悬挂 \r\n）
    expect(lines.length).toBeGreaterThanOrEqual(10)
    // 第二行（表头第 2 行）是对象名列所在行
    expect(lines[1]).toContain('方案 A')
    expect(lines[lines.length - 1]!.length).toBeGreaterThan(0)
  })

  it('普通 3 列数据行原样输出：年费参考一行三值（¥ 值含逗号 → 引号包裹）', () => {
    const r = exportCsv(cloneInstance(COMPARE_ALPHA_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 原始行文本：值内逗号触发 RFC 4180 引号包裹
    const line = r.value.replace(/^\uFEFF/, '').split('\r\n').find((l) => l.includes('年费参考'))!
    expect(line).toBe('年费参考,"¥9,800","¥6,800","¥3,800"')
    // 解析回字段：引号剥除、内嵌逗号保留
    const feeRow = rowsOf(r.value).find((cols) => cols.includes('年费参考'))!
    expect(feeRow).toEqual(['年费参考', '¥9,800', '¥6,800', '¥3,800'])
  })

  it('合并区仅锚点格输出值、被合并占位格输出空串（矩形网格列数不塌）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const r = exportCsv(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const grid = rowsOf(r.value)
    // 每行列数一致（= colCount 4；区块行 colSpan=4 也展开为 1 值 + 3 空串）
    const widths = new Set(grid.map((cols) => cols.length))
    expect(widths.size).toBe(1)
    expect([...widths][0]).toBe(4)
    // R0 表头合并：[0,0]-[1,0] 首列纵向合并（锚点=表头角标签「项目」）、[0,1]-[0,2] 横向合并
    // → 第一行 = [项目, band.1 值, 合并覆盖空串, band.2 值]
    expect(grid[0]).toEqual(['项目', '基础档', '', '进阶档'])
    // 纵向合并覆盖：第二行首列被 R0 的 rowspan 占住 → 空串
    expect(grid[1]![0]).toBe('')
  })

  it('值含逗号 / 引号 / 换行 → 整值双引号包裹，内部 " 加倍', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['obj.name.a'] = '含,逗号'
    inst.slots['obj.name.b'] = '他说"好"'
    inst.slots['obj.name.c'] = '第一行\n第二行'
    const r = exportCsv(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // 换行被引号包裹 → 不产生额外物理行（行数与未改值时一致）
    const plain = exportCsv(cloneInstance(COMPARE_ALPHA_V1))
    expect(plain.ok).toBe(true)
    if (!plain.ok) return
    const lines = r.value.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines.length).toBe(plain.value.replace(/^\uFEFF/, '').split('\r\n').length)
    const body = lines.join('\r\n')
    expect(body).toContain('"含,逗号"')
    expect(body).toContain('"他说""好"""')
    expect(body).toContain('"第一行\n第二行"')
  })

  it('数字槽输出原样字符串、缺槽与空串输出空字段', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    // 无 slotDefs 的普通文本槽放数字 → 原样字符串；缺槽（delete）/ 空串 → 空字段
    inst.slots['row.6.label'] = 42
    delete inst.slots['row.6.val.a']
    inst.slots['row.6.val.b'] = ''
    const r = exportCsv(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const row = rowsOf(r.value).find((cols) => cols.includes('42'))!
    expect(row).toEqual(['42', '', '', '不含'])
  })

  it('空表（无表头行无数据行）→ EXPORT_CSV_FAIL 白话拒绝', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.slotGrid = []
    inst.blocks = []
    inst.layout.blockSlots = []
    const r = exportCsv(inst)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('EXPORT_CSV_FAIL')
    expect(r.error.message).toBe('没有可导出的数据')
  })
})
