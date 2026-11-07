import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { exportHtml } from './html'
import { cloneInstance } from '../schema/validate'
import { buildExportModel } from './model'
import { applyEditIntent } from '../store/intent'
import { measurePng } from './pngSize'
import {
  KPI_CARD_MAX,
  effectiveKpiCards,
  kpiHeroHeight,
  sanitizeKpiCards,
} from '../kpi/kpiCards'

// ── schema 1.2 扩展：表外 KPI 统计卡 + 单元格条形格式的导出与意图 ──

describe('exportHtml · KPI 统计卡（schema 1.2 扩展）', () => {
  it('kpiCards 导出：hero 区含卡片节点、内联样式与文案（accent 卡走强调色）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.kpiCards = [
      { id: 'k1', label: '本月收入', value: '21,800', unit: '元' },
      { id: 'k2', label: '结余率', value: '29', unit: '%', accent: true },
    ]
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // hero 节点 + 两张卡（flex 一排）
    expect(r.value).toContain('data-pt-kpi="1"')
    expect(r.value).toContain('display:flex')
    // 卡片节点与内联样式（底/边框/圆角全主题 token 派生）
    expect(r.value).toContain('border-radius:10px')
    expect(r.value).toContain('font-weight:700')
    // 文案与数值/单位（转义后原样出现）
    expect(r.value).toContain('21,800')
    expect(r.value).toContain('本月收入')
    expect(r.value).toContain('结余率')
    // hero 区在表格上方（<table 之前）
    expect(r.value.indexOf('data-pt-kpi')).toBeLessThan(r.value.indexOf('<table'))
  })

  it('空 kpiCards / 缺省：导出 HTML 零占位（无 kpi 节点、无 hero 容器）', () => {
    for (const cards of [undefined, []] as (undefined | [])[]) {
      const inst = cloneInstance(COMPARE_ALPHA_V1)
      inst.kpiCards = cards
      const r = exportHtml(inst)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.value).not.toContain('data-pt-kpi')
      expect(r.value).not.toContain('display:flex')
      expect(r.value).toContain('<table')
    }
  })

  it('清洗：非数组删字段、缺 id/label/value 项丢弃、超 6 张截断', () => {
    expect(sanitizeKpiCards('bad')).toBeNull()
    expect(sanitizeKpiCards([{}, { id: 'a' }, { id: 'b', label: 'x' }])).toEqual([])
    const over = Array.from({ length: 9 }, (_, i) => ({
      id: `k${i}`,
      label: `L${i}`,
      value: i,
    }))
    expect(sanitizeKpiCards(over)).toHaveLength(KPI_CARD_MAX)
  })

  it('意图链：addKpiCard / updateKpiCard / moveKpiCard / removeKpiCard 依序生效', () => {
    let inst = cloneInstance(COMPARE_ALPHA_V1)
    const add1 = applyEditIntent(inst, {
      kind: 'addKpiCard',
      card: { id: 'a', label: '甲', value: '1' },
    })
    expect(add1.ok).toBe(true)
    inst = add1.ok ? add1.value : inst
    const add2 = applyEditIntent(inst, {
      kind: 'addKpiCard',
      card: { id: 'b', label: '乙', value: '2', accent: true },
    })
    inst = add2.ok ? add2.value : inst
    expect(effectiveKpiCards(inst).map((c) => c.id)).toEqual(['a', 'b'])
    const mv = applyEditIntent(inst, { kind: 'moveKpiCard', cardId: 'b', dir: -1 })
    expect(mv.ok && effectiveKpiCards(mv.value).map((c) => c.id)).toEqual(['b', 'a'])
    inst = mv.ok ? mv.value : inst
    const up = applyEditIntent(inst, {
      kind: 'updateKpiCard',
      cardId: 'a',
      patch: { label: '甲改', value: 9, unit: '元' },
    })
    expect(up.ok && effectiveKpiCards(up.value)[1]).toMatchObject({
      id: 'a',
      label: '甲改',
      value: 9,
      unit: '元',
    })
    inst = up.ok ? up.value : inst
    const rm = applyEditIntent(inst, { kind: 'removeKpiCard', cardId: 'b' })
    expect(rm.ok && effectiveKpiCards(rm.value).map((c) => c.id)).toEqual(['a'])
    inst = rm.ok ? rm.value : inst
    const rmLast = applyEditIntent(inst, { kind: 'removeKpiCard', cardId: 'a' })
    expect(rmLast.ok && rmLast.value.kpiCards).toBeUndefined()
  })

  it('满 6 张再添加被拒；PNG 尺寸预估含 hero 高（空卡不增高）', () => {
    let inst = cloneInstance(COMPARE_ALPHA_V1)
    for (let i = 0; i < KPI_CARD_MAX; i++) {
      const r = applyEditIntent(inst, {
        kind: 'addKpiCard',
        card: { id: `k${i}`, label: `L${i}`, value: i },
      })
      expect(r.ok).toBe(true)
      inst = r.ok ? r.value : inst
    }
    const over = applyEditIntent(inst, {
      kind: 'addKpiCard',
      card: { id: 'kx', label: 'X', value: 0 },
    })
    expect(over.ok).toBe(false)
    // 尺寸口径：有卡比无卡高出 hero 高度；无卡 = 0 增量
    const withKpi = measurePng(inst, 1)
    const base = measurePng(cloneInstance(COMPARE_ALPHA_V1), 1)
    expect(withKpi.outHeight - base.outHeight).toBe(kpiHeroHeight(effectiveKpiCards(inst)))
    expect(kpiHeroHeight([])).toBe(0)
  })
})

describe('exportHtml · 单元格条形格式（schema 1.2 扩展）', () => {
  it('bar 槽导出：色条 div 宽度百分比 + 数值文本，默认条色 = 主题 primary', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = { text: '66%', bar: { ratio: 0.66 } }
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('width:66%')
    expect(r.value).toContain('>66%<')
    // 默认条色 = T-A primary（palette 原样输出）
    expect(r.value).toContain('background:#2F5B9A')
    // 无 <style>/<script> 红线不回归
    expect(r.value).not.toMatch(/<style/i)
    expect(r.value).not.toMatch(/<script/i)
  })

  it('自定义条色与 clamp：ratio 越界收口 0~1，color 非法回主题色', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = {
      text: '120%',
      bar: { ratio: 1.2, color: '#c0392b' },
    }
    const m = buildExportModel(inst)
    expect(m.ok).toBe(true)
    if (!m.ok) return
    const barCell = m.value.bodyRows
      .flat()
      .find((c) => c.bar !== undefined)
    expect(barCell?.bar).toEqual({ ratio: 1, color: '#c0392b' })
    const r = exportHtml(inst)
    expect(r.ok && r.value).toContain('width:100%')
  })

  it('setSlotBar 意图：写入保留文本/对齐，bar=null 清除恢复纯文本', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    const sid = 'row.2.val.a'
    inst.slots[sid] = { text: '原文案', align: 'center' }
    const set = applyEditIntent(inst, { kind: 'setSlotBar', slotId: sid, bar: { ratio: 0.5 } })
    expect(set.ok).toBe(true)
    if (!set.ok) return
    const after = set.value.slots[sid] as { text: string; align?: string; bar?: { ratio: number } }
    expect(after.text).toBe('原文案')
    expect(after.align).toBe('center')
    expect(after.bar).toEqual({ ratio: 0.5 })
    // 改文案不丢 bar（bar 是格式不是内容）
    const edit = applyEditIntent(set.value, { kind: 'setSlot', slotId: sid, value: '新文案' })
    expect(edit.ok && (edit.value.slots[sid] as { bar?: unknown }).bar).toEqual({ ratio: 0.5 })
    // 清除
    const clear = applyEditIntent(edit.ok ? edit.value : set.value, {
      kind: 'setSlotBar',
      slotId: sid,
      bar: null,
    })
    expect(clear.ok && (clear.value.slots[sid] as { bar?: unknown }).bar).toBeUndefined()
    // 非法比例被拒
    const bad = applyEditIntent(inst, {
      kind: 'setSlotBar',
      slotId: sid,
      bar: { ratio: Number.NaN },
    })
    expect(bad.ok).toBe(false)
  })
})
