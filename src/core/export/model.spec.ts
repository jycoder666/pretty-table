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

// ── 自定义格式 T03：档位 px / 自定义色内联 / min-width 求和 / 任意结构（FR-C1/C2/C8）──

import { BLANK_V1 } from '../templates'
import { applyStructuralIntent } from '../store/structure'
import { applyEditIntent } from '../store/intent'
import { renderExportHtml } from './model'
import { resolveTheme, PALETTES } from '../theme/palettes'
import { FONT_SIZE_TIERS, PADDING_TIERS } from '../theme/layoutScales'
import type { TemplateInstance } from '../types'

describe('buildExportModel · 排版档位与自定义色（T03）', () => {
  it('档位 px 进内联样式：font-size / padding', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { fontSizeTier: 1, paddingTier: 3 }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const cell = m.value.bodyRows.flat().find((c) => c.text !== '')
    expect(cell?.style).toContain(`font-size:${FONT_SIZE_TIERS[0]}px`)
    expect(cell?.style).toContain(`padding:${PADDING_TIERS[2]}px`)
  })

  it('自定义色进 HTML 内联与 option 同一色值（Palette 单点合成）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = { primary: '#112233', emphasis: '#445566' }
    // option 侧（消费同一 Palette）
    const palette = resolveTheme(inst.themeId, inst.themeTokens).palette
    expect(palette.primary).toBe('#112233')
    // model 侧：表头格 background 与强调色均来自同一合成结果
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const headerCell = m.value.headRows.flat().find((c) => c.tag === 'th')
    expect(headerCell?.style).toContain('background:#112233')
    expect(headerCell?.style).toContain(`color:${palette.headerText}`)
    expect(headerCell?.style).toContain(`border:1px solid ${resolveTheme('T-A').palette.border}`)
    // 强调（red）格
    inst.slots['row.3.val.a'] = { text: '加红', emphasize: 'red' }
    const m2 = buildExportModel(inst)
    expect(m2.ok && m2.value.bodyRows.flat().some((c) => c.style.includes('color:#445566'))).toBe(true)
  })

  it('恢复预设（themeTokens 移除）后内联样式与纯预设逐格相等', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = { primary: '#112233' }
    const m1 = buildExportModel(inst)
    delete inst.themeTokens
    const m2 = buildExportModel(inst)
    const m3 = buildExportModel(cloneInstance(COMPARE_ALPHA_V1))
    expect(m1.ok && m2.ok && m3.ok).toBe(true)
    if (!(m1.ok && m2.ok && m3.ok)) return
    const styles = (x: typeof m1.value) => x.headRows.flat().concat(x.bodyRows.flat()).map((c) => c.style)
    expect(JSON.stringify(styles(m2.value))).toBe(JSON.stringify(styles(m3.value)))
    // 纯预设色值即 T-A 色板
    expect(styles(m3.value).some((s) => s.includes(`background:${PALETTES['T-A'].primary}`))).toBe(true)
  })

  it('minWidthPx 按 colWidths 求和；未设列宽沿用窄屏默认', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.layout.style = { colWidths: [200, null, 300, 100] }
    const m = buildExportModel(inst)
    expect(m.ok && m.value.minWidthPx).toBe(200 + 120 + 300 + 100)
    const m2 = buildExportModel(cloneInstance(PRICING_V1))
    expect(m2.ok && m2.value.minWidthPx).toBe(96 + 5 * 120)
  })
})

describe('buildExportModel · 结构编辑后任意行列数（T03 回归红线）', () => {
  it('1×1 极小表导出模型不炸', () => {
    const inst: TemplateInstance = {
      schemaVersion: '1.2',
      templateId: 'spec-1x1',
      themeId: 'T-A',
      slots: { u1: '唯一格' },
      blocks: [],
      layout: { rowCount: 1, colCount: 1, headerLevels: 1, blockSlots: [], slotGrid: [['u1']] },
    }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.headRows).toHaveLength(1)
    expect(m.value.bodyRows).toHaveLength(0)
    const html = renderExportHtml(m.value)
    expect(html).toContain('>唯一格</th>')
  })

  it('blank 加行加列至 20×12 + 自定义色/档位 → 导出模型与 HTML 不炸', () => {
    let cur = cloneInstance(BLANK_V1)
    for (let i = 0; i < 15; i++) {
      const r = applyStructuralIntent(cur, { kind: 'addRow' })
      if (r.ok) cur = r.value
    }
    for (let i = 0; i < 8; i++) {
      const r = applyStructuralIntent(cur, { kind: 'addCol' })
      if (r.ok) cur = r.value
    }
    expect(cur.layout.rowCount).toBe(20)
    expect(cur.layout.colCount).toBe(12)
    cur.themeTokens = { primary: '#112233' }
    cur.layout.style = { fontSizeTier: 3, rowHeightTier: 3, colWidths: Array(12).fill(80) }
    const m = buildExportModel(cur)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.headRows).toHaveLength(1)
    expect(m.value.bodyRows.length).toBeGreaterThan(15)
    expect(m.value.minWidthPx).toBe(12 * 80)
    const html = renderExportHtml(m.value)
    expect(html).toContain('background:#112233')
    expect(html).toContain(`font-size:${FONT_SIZE_TIERS[2]}px`)
    expect(html).toContain('min-width:960px')
  })

  it('结构编辑（表头上调 + 合并）导出：rowspan/colspan 随收缩后 merges 输出', () => {
    const inst = cloneInstance(BLANK_V1)
    const up = applyStructuralIntent(inst, { kind: 'setHeaderLevel', levels: 2 })
    expect(up.ok).toBe(true)
    if (!up.ok) return
    let cur = up.value
    // 合并顶层表头 [0,1]-[0,3]
    cur.slots[cur.layout.slotGrid![0]![1]!] = '大类'
    const merged = applyEditIntent(cur, { kind: 'merge', range: { start: [0, 1], end: [0, 3] } })
    expect(merged.ok).toBe(true)
    if (!merged.ok) return
    cur = merged.value
    const m = buildExportModel(cur)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    expect(m.value.headRows).toHaveLength(2)
    expect(m.value.headRows[0]!.some((c) => c.colSpan === 3 && c.text === '大类')).toBe(true)
  })
})
