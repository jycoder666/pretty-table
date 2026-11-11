import { describe, it, expect } from 'vitest'
import {
  clampCellScale,
  sanitizeDot,
  sanitizeGantt,
  sanitizeSlotDeco,
  sanitizeStyle13,
} from './sanitize13'
import { sanitizePoster, posterPadding } from '../theme/posterStyle'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from './migrate'
import { validateInstance } from './validate'

describe('sanitize13 · 格内装饰清洗', () => {
  it('clampCellScale：越界钳到最近档（1 / 1.25 / 1.5），非法 undefined', () => {
    expect(clampCellScale(1.2)).toBe(1.25)
    expect(clampCellScale(1.6)).toBe(1.5)
    expect(clampCellScale(0.4)).toBe(1)
    expect(clampCellScale('x')).toBeUndefined()
    expect(clampCellScale(NaN)).toBeUndefined()
  })

  it('sanitizeGantt：0-1 钳制、to<from 收口、缺 from/to 整键删', () => {
    expect(sanitizeGantt({ from: -0.2, to: 1.4 })).toEqual({ from: 0, to: 1 })
    expect(sanitizeGantt({ from: 0.5, to: 0.3 })).toEqual({ from: 0.5, to: 0.5 })
    expect(sanitizeGantt({ from: 0.1, to: 0.5, milestone: true })).toEqual({
      from: 0.1,
      to: 0.5,
      milestone: true,
    })
    expect(sanitizeGantt({ to: 0.5 })).toBeUndefined()
    expect(sanitizeGantt('x')).toBeUndefined()
  })

  it('sanitizeDot：color 非法删键（回主题 emphasis），合法保留', () => {
    expect(sanitizeDot({ color: '#C0653A' })).toEqual({ color: '#c0653a' })
    expect(sanitizeDot({ color: 'nope' })).toEqual({})
    expect(sanitizeDot(null)).toBeUndefined()
  })

  it('sanitizeSlotDeco：hex 规范化 / stars 0-5 / 非法键删除 / 布尔严格 true', () => {
    const obj: Record<string, unknown> = {
      sub: '李老师 · 302',
      color: '#ABCDEF',
      bg: 'zzz',
      cellScale: 2,
      stars: 7,
      dot: { color: '#abc' },
      gantt: { from: 0.2, to: 0.8 },
      node: 'yes',
      leader: true,
      boxed: false,
    }
    sanitizeSlotDeco(obj)
    expect(obj.sub).toBe('李老师 · 302')
    expect(obj.color).toBe('#abcdef')
    expect(obj.bg).toBeUndefined()
    expect(obj.cellScale).toBe(1.5)
    expect(obj.stars).toBeUndefined()
    expect(obj.dot).toEqual({ color: '#aabbcc' })
    expect(obj.gantt).toEqual({ from: 0.2, to: 0.8 })
    expect(obj.node).toBeUndefined()
    expect(obj.leader).toBe(true)
    expect(obj.boxed).toBeUndefined()
  })

  it('sanitizeStyle13：枚举越界删键，合法保留', () => {
    const s = {
      fontFamily: 'mono',
      borderScheme: 'diagonal',
      headerShape: 3,
    } as unknown as Parameters<typeof sanitizeStyle13>[0]
    sanitizeStyle13(s)
    expect(s.fontFamily).toBeUndefined()
    expect(s.borderScheme).toBeUndefined()
    expect(s.headerShape).toBeUndefined()
    const ok = { fontFamily: 'serif', borderScheme: 'rows', headerShape: 'pill' } as const
    sanitizeStyle13({ ...ok })
    expect(ok.fontFamily).toBe('serif')
  })
})

describe('sanitizePoster · 海报层清洗', () => {
  it('全空 → null（删字段零占位）', () => {
    expect(sanitizePoster({})).toBeNull()
    expect(sanitizePoster('x')).toBeNull()
    expect(sanitizePoster({ bg: 'solid' })).toBeNull()
  })

  it('枚举 / hex / 行数 / 留白钳制', () => {
    const p = sanitizePoster({
      bg: 'stripes',
      bgColor: '#0D2018',
      accent: 'zzz',
      title: '三年级 2 班 · 课程表',
      metaLines: ['阳光小学', '2026 秋季学期', '第 12 周', 'a', 'b', 'c', 'd'],
      padding: 999,
    })
    expect(p).not.toBeNull()
    expect(p?.bg).toBeUndefined()
    expect(p?.bgColor).toBe('#0d2018')
    expect(p?.accent).toBeUndefined()
    expect(p?.title).toBe('三年级 2 班 · 课程表')
    expect(p?.metaLines).toHaveLength(6)
    expect(p?.padding).toBe(80)
  })

  it('posterPadding：缺省 40，钳制 16-80', () => {
    expect(posterPadding(undefined)).toBe(40)
    expect(posterPadding({ padding: 4 })).toBe(16)
    expect(posterPadding({ padding: 120 })).toBe(80)
  })
})

describe('schema 1.3 迁移与校验闭环', () => {
  const base = () => ({
    schemaVersion: '1.2',
    templateId: 'user-test-13',
    themeId: 'T-B',
    slots: {
      u1: { text: '语文', sub: '周老师 · 302', bg: '#F2D8C6', stars: 4 },
      u2: { text: '偏高', dot: { color: '#c0653a' } },
      u3: { text: '', gantt: { from: 0.1, to: 0.6, milestone: true } },
    },
    blocks: [],
    layout: {
      rowCount: 3,
      colCount: 3,
      blockSlots: [],
      slotGrid: [
        ['u1', 'u2', 'u3'],
        [null, null, null],
        [null, null, null],
      ],
      style: { fontFamily: 'serif', borderScheme: 'rows', headerShape: 'pill' },
    },
  })

  it('migrate：1.2 实例带 1.3 字段 → 版本写 1.3、字段保真', () => {
    const r = migrateInstance(base(), [])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.schemaVersion).toBe(SCHEMA_VERSION_CURRENT)
    expect(r.value.schemaVersion).toBe('1.3')
    const u1 = r.value.slots['u1'] as unknown as Record<string, unknown>
    expect(u1.sub).toBe('周老师 · 302')
    expect(u1.bg).toBe('#f2d8c6')
    expect(u1.stars).toBe(4)
  })

  it('validate：非法 1.3 值清洗不拒（宽容口径）', () => {
    const json = base() as Record<string, unknown>
    ;(json.slots as Record<string, unknown>)['u1'] = {
      text: 'x',
      bg: 'nope',
      stars: 99,
      node: 'yes',
    }
    json.poster = { bg: 'dots', title: 't', metaLines: 'not-array' }
    const r = validateInstance(json)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u1 = r.value.slots['u1'] as unknown as Record<string, unknown>
    expect(u1.bg).toBeUndefined()
    expect(u1.stars).toBeUndefined()
    expect(u1.node).toBeUndefined()
    expect(r.value.poster?.bg).toBe('dots')
    expect(r.value.poster?.metaLines).toBeUndefined()
  })
})
