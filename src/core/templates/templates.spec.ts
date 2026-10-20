import { describe, expect, it } from 'vitest'
import { listPresetTemplates, getPresetTemplate, PRICING_V1, MATRIX_V1 } from './index'
import { validateInstance, cloneInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'

/** 收集 slotGrid 里所有非空槽位 id */
function gridSlotIds(tpl: typeof PRICING_V1): Set<string> {
  const ids = new Set<string>()
  for (const row of tpl.layout.slotGrid ?? []) {
    for (const sid of row) {
      if (sid) ids.add(sid)
    }
  }
  return ids
}

describe('价目 / 矩阵系统模板（T26 · U-1 §8）', () => {
  it('两份模板 validate / migrate 通过，schemaVersion 1.1，templateType 正确', () => {
    const cases: Array<[string, typeof PRICING_V1, string]> = [
      ['pricing-v1', PRICING_V1, 'pricing'],
      ['matrix-v1', MATRIX_V1, 'matrix'],
    ]
    for (const [id, tpl, type] of cases) {
      expect(tpl.templateId).toBe(id)
      const v = validateInstance(cloneInstance(tpl))
      expect(v.ok).toBe(true)
      expect(v.ok ? v.value.schemaVersion : undefined).toBe('1.1')
      expect(v.ok ? v.value.meta?.templateType : undefined).toBe(type)
      const m = migrateInstance(cloneInstance(tpl), listPresetTemplates())
      expect(m.ok).toBe(true)
      expect(m.ok ? m.value.schemaVersion : undefined).toBe(SCHEMA_VERSION_CURRENT)
      expect(m.ok ? m.value.meta?.templateType : undefined).toBe(type)
    }
  })

  it('slotGrid / slotDefs 完整：格内引用无悬空槽位，slotDefs 键都有槽值', () => {
    for (const tpl of [PRICING_V1, MATRIX_V1]) {
      const ids = gridSlotIds(tpl)
      expect(ids.size).toBeGreaterThan(0)
      for (const sid of ids) {
        expect(tpl.slots[sid]).toBeDefined()
      }
      for (const sid of Object.keys(tpl.slotDefs ?? {})) {
        expect(tpl.slots[sid]).toBeDefined()
      }
      expect(tpl.layout.rowCount).toBe((tpl.layout.slotGrid ?? []).length)
    }
  })

  it('价目：单价/小计/合计金额列 format=currency，数量为千分位数字槽', () => {
    const defs = PRICING_V1.slotDefs ?? {}
    const money: Array<[string, string]> = [
      ['row.2.price', 'CNY'],
      ['row.11.price', 'CNY'],
      ['row.2.subtotal', 'CNY'],
      ['row.11.subtotal', 'CNY'],
      ['total.amount', 'CNY'],
    ]
    for (const [sid, currency] of money) {
      expect(defs[sid]?.format).toBe('currency')
      expect(defs[sid]?.currency).toBe(currency)
      expect(defs[sid]?.fractionDigits).toBe(2)
    }
    for (const r of [2, 5, 8, 11]) {
      expect(defs[`row.${r}.qty`]?.kind).toBe('number')
      expect(defs[`row.${r}.qty`]?.format).toBe('number')
      expect(defs[`row.${r}.qty`]?.fractionDigits).toBe(0)
    }
    // 数量单位由模板固定，用户不可改
    expect(defs['row.2.qty']?.unit).toBe('件')
    expect(defs['row.8.qty']?.unit).toBe('天')
  })

  it('价目：表名与合计行为锁定合并，无用户合并区，不设推荐列', () => {
    expect(PRICING_V1.layout.merges).toContainEqual({ start: [0, 0], end: [0, 5] })
    expect(PRICING_V1.layout.merges).toContainEqual({ start: [12, 0], end: [12, 4] })
    expect(PRICING_V1.layout.allowedMerges).toBeUndefined()
    expect(PRICING_V1.layout.recommendableCols).toEqual([])
    expect(PRICING_V1.highlight?.recommendCol).toBeNull()
  })

  it('矩阵：功能行为符号槽、占比行为百分比槽，首列钉 C0', () => {
    const defs = MATRIX_V1.slotDefs ?? {}
    for (const r of [1, 4]) {
      for (const c of ['a', 'c', 'e']) {
        expect(defs[`feat.${r}.${c}`]?.kind).toBe('mark')
      }
      expect(defs[`pct.${r}.a`]?.format).toBe('percent')
      expect(defs[`pct.${r}.a`]?.kind).toBe('number')
    }
    expect(MATRIX_V1.layout.frozenColCount).toBe(1)
  })

  it('矩阵：「条目」锁定合并 R0–R1，档位默认合并在允许区内', () => {
    expect(MATRIX_V1.layout.structuralMerges).toContainEqual({ start: [0, 0], end: [1, 0] })
    expect(MATRIX_V1.layout.merges).toContainEqual({ start: [0, 1], end: [0, 2] })
    expect(MATRIX_V1.layout.merges).toContainEqual({ start: [0, 3], end: [0, 5] })
    expect(MATRIX_V1.layout.allowedMerges).toContainEqual({ start: [0, 1], end: [0, 5] })
  })

  it('登记后可从模板库取用，共 4 张系统预设', () => {
    expect(getPresetTemplate('pricing-v1')?.meta?.templateType).toBe('pricing')
    expect(getPresetTemplate('matrix-v1')?.meta?.templateType).toBe('matrix')
    expect(getPresetTemplate('pricing-v1')).not.toBeNull()
    expect(listPresetTemplates().map((t) => t.templateId)).toEqual([
      'compare-alpha-v1',
      'detail-alpha-v1',
      'pricing-v1',
      'matrix-v1',
    ])
  })

  it('由价目另存的 1.0 用户模板可借到底稿 slotGrid / slotDefs（读时迁移）', () => {
    const copy = cloneInstance(PRICING_V1)
    copy.templateId = 'user-pricing-1'
    copy.schemaVersion = '1.0'
    copy.meta = { displayName: '我的价目', origin: 'user', sourceTemplateId: 'pricing-v1' }
    const raw = copy as unknown as Record<string, unknown>
    delete raw.slotDefs
    const layout = { ...copy.layout } as unknown as Record<string, unknown>
    delete layout.slotGrid
    copy.layout = layout as typeof copy.layout
    const m = migrateInstance(copy, listPresetTemplates())
    expect(m.ok).toBe(true)
    expect(m.ok ? Object.keys(m.value.slotDefs ?? {}).length : 0).toBeGreaterThan(0)
    expect(m.ok ? m.value.layout.slotGrid?.length : 0).toBe(13)
    expect(m.ok ? (m.value.layout.slotGrid?.[0] ?? [])[0] : undefined).toBe('price.title')
  })
})
