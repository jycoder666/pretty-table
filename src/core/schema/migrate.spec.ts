import { describe, expect, it } from 'vitest'
import type { TemplateDefinition, TemplateInstance } from '../types'
import { migrateInstance } from './migrate'
import { COMPARE_ALPHA_V1 } from '../templates'

const PRESETS: TemplateDefinition[] = [COMPARE_ALPHA_V1]

function base100(): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    templateId: 'compare-alpha-v1',
    themeId: 'T-A',
    slots: { 'a.1': '文本' },
    blocks: [],
    layout: { rowCount: 2, colCount: 2, blockSlots: [] },
    meta: { origin: 'preset' },
  }
}

describe('migrateInstance · 读 1.0 补默认值', () => {
  it('缺 slotDefs → 全部按 text；缺 highlight → recommendCol=null', () => {
    const r = migrateInstance(base100(), PRESETS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.schemaVersion).toBe('1.1')
    expect(r.value.slotDefs).toEqual({})
    expect(r.value.highlight).toEqual({ recommendCol: null })
  })

  it('缺 templateType → 按 templateId 映射推断，推断不到为 compare', () => {
    const a = migrateInstance(base100(), PRESETS)
    expect(a.ok && a.value.meta?.templateType).toBe('compare')
    const b = base100()
    b.templateId = 'pricing-basic-v1'
    const rb = migrateInstance(b, PRESETS)
    expect(rb.ok && rb.value.meta?.templateType).toBe('pricing')
    const c = base100()
    c.templateId = 'matrix-grid-v1'
    const rc = migrateInstance(c, PRESETS)
    expect(rc.ok && rc.value.meta?.templateType).toBe('matrix')
  })
})

describe('migrateInstance · 借底稿 slotGrid（§3.4）', () => {
  function presetWithGrid(): TemplateDefinition {
    return {
      schemaVersion: '1.1',
      templateId: 'src-tpl',
      themeId: 'T-A',
      slots: {},
      blocks: [],
      slotDefs: { 's.1': { kind: 'mark' } },
      layout: {
        rowCount: 2,
        colCount: 2,
        blockSlots: [],
        slotGrid: [
          [null, null],
          ['s.0', 's.1'],
        ],
      },
    }
  }

  it('缺 slotGrid 且有 sourceTemplateId、行列一致 → 借用底稿 slotGrid 与 slotDefs', () => {
    const json = base100()
    json.templateId = 'user-copy-1'
    json.meta = { origin: 'user', sourceTemplateId: 'src-tpl' }
    const r = migrateInstance(json, [presetWithGrid()])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toEqual([
      [null, null],
      ['s.0', 's.1'],
    ])
    expect(r.value.slotDefs).toEqual({ 's.1': { kind: 'mark' } })
  })

  it('缺 slotGrid 且借不到 → 实例可用但无 slotGrid（粘贴入口置灰）', () => {
    const json = base100()
    json.templateId = 'orphan-tpl'
    const r = migrateInstance(json, PRESETS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toBeUndefined()
  })

  it('行列不一致 → 不借用', () => {
    const json = base100()
    json.templateId = 'user-copy-2'
    json.layout = { rowCount: 5, colCount: 5, blockSlots: [] }
    json.meta = { origin: 'user', sourceTemplateId: 'src-tpl' }
    const r = migrateInstance(json, [presetWithGrid()])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.layout.slotGrid).toBeUndefined()
  })
})

describe('migrateInstance · 非法值 warn 不拒', () => {
  it('mark 不在三值 → null + warn MARK_UNKNOWN', () => {
    const json = base100()
    json.slots = { 'a.1': { mark: 'maybe' } }
    const r = migrateInstance(json, PRESETS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.slots['a.1']).toEqual({ mark: null })
    expect(r.warnings?.some((w) => w.code === 'MARK_UNKNOWN')).toBe(true)
  })

  it('format 未知 → 回退 number + warn FORMAT_UNKNOWN', () => {
    const json = base100()
    json.slotDefs = { 'a.1': { kind: 'number', format: 'sci' } }
    const r = migrateInstance(json, PRESETS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.slotDefs?.['a.1']?.format).toBe('number')
    expect(r.warnings?.some((w) => w.code === 'FORMAT_UNKNOWN')).toBe(true)
  })

  it('recommendCol 不在 recommendableCols → null + warn', () => {
    const json = base100()
    json.highlight = { recommendCol: 5 }
    json.layout = { rowCount: 2, colCount: 2, blockSlots: [], recommendableCols: [1] }
    const r = migrateInstance(json, PRESETS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.highlight).toEqual({ recommendCol: null })
    expect(r.warnings?.length).toBeGreaterThan(0)
  })

  it('themeTokens 里写语义色映射 → 忽略 + warn（OUT-13）', () => {
    const json = base100()
    json.themeTokens = {
      primary: '#123456',
      markYesColor: '#00ff00',
      recommendBadgeBg: '#ff0000',
    }
    const r = migrateInstance(json, PRESETS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.themeTokens).toEqual({ primary: '#123456' })
    expect(r.warnings?.some((w) => w.code === 'UNKNOWN_FIELD')).toBe(true)
  })
})

describe('migrateInstance · 版本与往返', () => {
  it('读 2.x → TEMPLATE_INVALID', () => {
    const json = base100()
    json.schemaVersion = '2.0'
    const r = migrateInstance(json, PRESETS)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.code).toBe('TEMPLATE_INVALID')
  })

  it('1.1 实例往返 validate 不丢字段；MVP 构建读 1.1 不报错（前向兼容）', () => {
    const inst = migrateInstance(COMPARE_ALPHA_V1, PRESETS)
    expect(inst.ok).toBe(true)
    if (!inst.ok) return
    const v = inst.value as TemplateInstance
    expect(v.schemaVersion).toBe('1.1')
    // 再过一遍迁移（幂等）+ 校验，字段不丢
    const again = migrateInstance(v, PRESETS)
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.value.slotDefs?.['row.2.val.a']).toEqual({ kind: 'mark' })
    expect(again.value.layout.recommendableCols).toEqual([1, 2, 3])
  })
})
