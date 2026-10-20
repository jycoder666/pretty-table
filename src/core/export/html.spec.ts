import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1 } from '../templates'
import { exportHtml } from './html'
import { cloneInstance } from '../schema/validate'

describe('exportHtml', () => {
  it('escapes slot text and omits placeholder', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['obj.name.a'] = '<script>x</script>'
    inst.slots['obj.name.b'] = ''
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('&lt;script&gt;')
    expect(r.value).not.toContain('<script>')
    expect(r.value).not.toContain('填写内容')
    expect(r.value).toContain('pt-table')
    expect(r.value).toContain('rowspan')
  })
})
