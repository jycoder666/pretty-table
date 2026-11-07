import { describe, expect, it } from 'vitest'
import type { TemplateInstance } from '../types'
import { COMPARE_ALPHA_V1, createBlankInstance } from '../templates'
import { instanceFromJSON, instanceToJSON } from './transfer'

/** 一张带内容的最小对比表实例（已另存形态：user- 唯一 id + displayName 齐全） */
function sampleInst(): TemplateInstance {
  const inst = JSON.parse(JSON.stringify(COMPARE_ALPHA_V1)) as TemplateInstance
  inst.templateId = 'user-1000-abcd1'
  inst.meta = { ...inst.meta, displayName: '跨设备同步测试表', origin: 'user' }
  return inst
}

describe('instanceToJSON · 序列化', () => {
  it('产出含 schemaVersion（当前版本）与 meta.displayName', () => {
    const r = instanceToJSON(sampleInst())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const o = JSON.parse(r.value) as TemplateInstance
    expect(typeof o.schemaVersion).toBe('string')
    expect(o.meta?.displayName).toBe('跨设备同步测试表')
    expect(o.templateId).toBe('user-1000-abcd1')
  })

  it('displayName 缺省 → 回退 caption 槽文字，再回退 templateId', () => {
    const inst = createBlankInstance({ rows: 3, cols: 3 })
    delete inst.meta?.displayName
    const r = instanceToJSON(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const o = JSON.parse(r.value) as TemplateInstance
    expect(o.meta?.displayName).toBeTruthy()
  })

  it('结构缺件（缺 slots）→ fail 不产出文件', () => {
    const bad = { templateId: 'x', blocks: [], layout: {} } as unknown as TemplateInstance
    const r = instanceToJSON(bad)
    expect(r.ok).toBe(false)
  })

  it('共享底稿 id（blank-new / 预设 id）→ 导出加盖 user- 唯一 id；user-id 原样保留', () => {
    const blank = createBlankInstance({ rows: 3, cols: 3 })
    const rb = instanceToJSON(blank)
    expect(rb.ok).toBe(true)
    if (!rb.ok) return
    const ob = JSON.parse(rb.value) as TemplateInstance
    expect(ob.templateId).toMatch(/^user-\d+-/)
    expect(ob.templateId).not.toBe('blank-new')

    const preset = JSON.parse(JSON.stringify(COMPARE_ALPHA_V1)) as TemplateInstance
    const rp = instanceToJSON(preset)
    if (!rp.ok) throw new Error('preset export failed')
    const op = JSON.parse(rp.value) as TemplateInstance
    expect(op.templateId).toMatch(/^user-\d+-/)
    expect(op.templateId).not.toBe(COMPARE_ALPHA_V1.templateId)

    const saved = sampleInst()
    const rs = instanceToJSON(saved)
    if (!rs.ok) throw new Error('saved export failed')
    const os = JSON.parse(rs.value) as TemplateInstance
    expect(os.templateId).toBe(saved.templateId)
  })
})

describe('instanceFromJSON · round-trip', () => {
  it('导出 → 导入深等价（meta/slots/layout/themeTokens/kpiCards 全等）', () => {
    const inst = sampleInst()
    const r = instanceToJSON(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const back = instanceFromJSON(r.value)
    expect(back.inst).not.toBeNull()
    expect(back.reason).toBeNull()
    const exported = JSON.parse(r.value) as TemplateInstance
    expect(back.inst).toEqual(exported)
  })

  it('导出文本幂等：再导出与首导出逐字节一致', () => {
    const inst = sampleInst()
    const first = instanceToJSON(inst)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const back = instanceFromJSON(first.value)
    expect(back.inst).not.toBeNull()
    const second = instanceToJSON(back.inst as TemplateInstance)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value).toBe(first.value)
  })
})

describe('instanceFromJSON · 非法输入拒绝（null + 原因）', () => {
  it('非法 JSON 文本 → 拒绝', () => {
    const r = instanceFromJSON('{not json!!')
    expect(r.inst).toBeNull()
    expect(r.reason).toContain('JSON')
  })

  it('空文本 → 拒绝', () => {
    expect(instanceFromJSON('').inst).toBeNull()
    expect(instanceFromJSON('   ').inst).toBeNull()
    expect(instanceFromJSON('null').inst).toBeNull()
    expect(instanceFromJSON('[1,2]').inst).toBeNull()
  })

  it('缺 meta.displayName → 拒绝（传输格式硬门槛）', () => {
    const inst = sampleInst()
    delete inst.meta?.displayName
    const r = instanceFromJSON(JSON.stringify(inst))
    expect(r.inst).toBeNull()
    expect(r.reason).toContain('displayName')
  })

  it('缺 templateId / slots / blocks / layout / themeId → 拒绝并带原因', () => {
    const inst = sampleInst()
    delete (inst as Partial<TemplateInstance>).templateId
    expect(instanceFromJSON(JSON.stringify(inst)).reason).toContain('templateId')

    const noSlots = sampleInst()
    delete (noSlots as Partial<TemplateInstance>).slots
    expect(instanceFromJSON(JSON.stringify(noSlots)).reason).toContain('slots')

    const noBlocks = sampleInst()
    delete (noBlocks as Partial<TemplateInstance>).blocks
    expect(instanceFromJSON(JSON.stringify(noBlocks)).reason).toContain('blocks')

    const noLayout = sampleInst()
    delete (noLayout as Partial<TemplateInstance>).layout
    expect(instanceFromJSON(JSON.stringify(noLayout)).reason).toContain('layout')

    const noTheme = sampleInst()
    delete (noTheme as Partial<TemplateInstance>).themeId
    expect(instanceFromJSON(JSON.stringify(noTheme)).reason).toContain('themeId')
  })

  it('内容为空（slots 无键且 blocks 空）→ 拒绝', () => {
    const inst = sampleInst()
    inst.slots = {}
    inst.blocks = []
    const r = instanceFromJSON(JSON.stringify(inst))
    expect(r.inst).toBeNull()
    expect(r.reason).toContain('空')
  })

  it('版本过新（schemaVersion 2.x）→ 拒绝', () => {
    const inst = sampleInst()
    inst.schemaVersion = '2.0'
    const r = instanceFromJSON(JSON.stringify(inst))
    expect(r.inst).toBeNull()
    expect(r.reason).toContain('版本')
  })

  it('坏图片槽值 → 宽容清洗不拒整表（warnings 带 IMAGE_INVALID）', () => {
    const inst = sampleInst()
    const sid = Object.keys(inst.slots)[0] as string
    inst.slots[sid] = { image: 'data:text/html;base64,PGI+' }
    const r = instanceFromJSON(JSON.stringify(inst))
    expect(r.inst).not.toBeNull()
    expect(r.warnings.some((w) => w.code === 'IMAGE_INVALID')).toBe(true)
    expect(r.inst?.slots[sid]).toBeUndefined()
  })
})
