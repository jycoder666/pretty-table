import { describe, expect, it } from 'vitest'
import { STAT_V1, listPresetTemplates, getPresetTemplate } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { exportHtml } from '../export/html'

// ── schema 1.2 扩展：统计看板系统模板（表外 KPI 卡 + 分组明细表）──

describe('stat-v1 统计看板模板', () => {
  it('validate / migrate 通过，templateType=stat，登记进模板库可取用', () => {
    const v = validateInstance(cloneInstance(STAT_V1))
    expect(v.ok).toBe(true)
    const m = migrateInstance(cloneInstance(STAT_V1), listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
    expect(STAT_V1.meta?.templateType).toBe('stat')
    expect(STAT_V1.meta?.displayName).toBe('统计看板')
    // 库内可取：getPresetTemplate 命中、listPresetTemplates 含它
    expect(getPresetTemplate('stat-v1')?.meta?.templateType).toBe('stat')
    expect(listPresetTemplates().map((t) => t.templateId)).toContain('stat-v1')
  })

  it('结构合法：7 行 3 列（1 表头 + 6 数据行）、格内引用无悬空槽位', () => {
    const grid = STAT_V1.layout.slotGrid ?? []
    expect(grid).toHaveLength(7)
    for (const row of grid) expect(row).toHaveLength(3)
    const ids = new Set(grid.flat().filter((x): x is string => !!x))
    expect(ids.size).toBeGreaterThan(0)
    for (const sid of ids) expect(STAT_V1.slots[sid]).toBeDefined()
    for (const sid of Object.keys(STAT_V1.slotDefs ?? {})) {
      expect(STAT_V1.slots[sid]).toBeDefined()
    }
    expect(STAT_V1.layout.rowCount).toBe(7)
    expect(STAT_V1.layout.colCount).toBe(3)
  })

  it('2 张 KPI 卡：本月收入 21,800 元 / 结余率 29%（accent）', () => {
    const cards = STAT_V1.kpiCards ?? []
    expect(cards).toHaveLength(2)
    expect(cards[0]).toMatchObject({ label: '本月收入', value: '21,800', unit: '元' })
    expect(cards[1]).toMatchObject({ label: '结余率', value: '29', unit: '%', accent: true })
  })

  it('分组明细：金额列 CNY 货币槽、占比列百分比槽；导出 HTML 含 KPI 卡与表格', () => {
    const defs = STAT_V1.slotDefs ?? {}
    for (let r = 1; r <= 6; r++) {
      expect(defs[`stat.amount.${r}`]?.format).toBe('currency')
      expect(defs[`stat.ratio.${r}`]?.format).toBe('percent')
    }
    const r = exportHtml(cloneInstance(STAT_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('data-pt-kpi="1"')
    expect(r.value).toContain('本月收入')
    expect(r.value).toContain('<table')
    expect(r.value).toContain('收入构成')
    expect(r.value).toContain('支出构成')
  })
})
