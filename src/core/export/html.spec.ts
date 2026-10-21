import { describe, expect, it } from 'vitest'
import { COMPARE_ALPHA_V1, MATRIX_V1, PRICING_V1 } from '../templates'
import { exportHtml } from './html'
import { cloneInstance } from '../schema/validate'

describe('exportHtml（T28 · 语义化 + 窄屏）', () => {
  it('FR-05 回归：转义槽位文本，不泄占位（沿用 T15 用例）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['obj.name.a'] = '<script>x</script>'
    inst.slots['obj.name.b'] = ''
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('&lt;script&gt;')
    expect(r.value).not.toContain('<script>')
    expect(r.value).not.toContain('填写内容')
    expect(r.value).toContain('rowspan')
  })

  it('输出 caption/thead/tbody，表头 th scope=col、左栏 th scope=row', () => {
    const r = exportHtml(cloneInstance(PRICING_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('<thead>')
    expect(r.value).toContain('<tbody>')
    expect(r.value).toContain('<caption')
    expect(r.value).toContain('scope="col"')
    expect(r.value).toContain('scope="row"')
  })

  it('无 <style>/<script>/外链，样式全部内联', () => {
    const r = exportHtml(cloneInstance(MATRIX_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).not.toMatch(/<style/i)
    expect(r.value).not.toMatch(/<script/i)
    expect(r.value).not.toMatch(/https?:\/\//)
    expect(r.value).not.toMatch(/\sclass="/)
    expect(r.value).toContain('style="')
  })

  it('符号格：字形 + aria-label（支持/不支持/部分支持）', () => {
    const r = exportHtml(cloneInstance(MATRIX_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('aria-label="支持"')
    expect(r.value).toContain('aria-label="不支持"')
    expect(r.value).toContain('aria-label="部分支持"')
    expect(r.value).toContain('>✓</td>')
    expect(r.value).toContain('>✗</td>')
  })

  it('推荐列表头含 <span>推荐</span>，列内联描边', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.highlight = { recommendCol: 1 }
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('<span style="font-size:11px">推荐</span>')
    expect(r.value).toContain('border:2px solid')
  })

  it('外包横滚容器 + table min-width + 首列 sticky（375px 不撑破）', () => {
    const r = exportHtml(cloneInstance(MATRIX_V1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('overflow-x:auto')
    expect(r.value).toMatch(/min-width:\d+px/)
    expect(r.value).toContain('position:sticky;left:0')
    // min-width = 96 + 5×120 = 696
    expect(r.value).toContain('min-width:696px')
  })
})

// ── 自定义格式 T03：自定义色 / 档位 / colWidths 进最终 HTML（FR-C1/C2/C8）──

describe('exportHtml · 自定义格式（T03）', () => {
  it('自定义角色色进内联样式；转义与无 script/外链红线不回归', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.themeTokens = { primary: '#112233', emphasis: '#445566' }
    inst.slots['obj.name.a'] = '<b>加粗</b>'
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('background:#112233')
    expect(r.value).not.toMatch(/<script/i)
    expect(r.value).not.toMatch(/https?:\/\//)
    expect(r.value).toContain('&lt;b&gt;加粗&lt;/b&gt;')
  })

  it('colWidths 求和进 table min-width', () => {
    const inst = cloneInstance(PRICING_V1)
    inst.layout.style = { colWidths: [100, 100, 100, 100, 100, 100] }
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain('min-width:600px')
  })
})

// ── 交互升级 T03：导出同源（图片格 <img> 输出）──

describe('exportHtml · 图片格（交互升级 T03）', () => {
  const T03_IMG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  it('图片格输出 <img src> 白名单 data URI（object-fit:cover，src 不转义）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = { image: T03_IMG }
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toContain(`<img src="${T03_IMG}"`)
    expect(r.value).toContain('object-fit:cover')
  })

  it('GC-22：非白名单 image 值不进 src（防御性兜底，不产生注入）', () => {
    const inst = cloneInstance(COMPARE_ALPHA_V1)
    inst.slots['row.2.val.a'] = { image: '"><script>alert(1)</script>' }
    const r = exportHtml(inst)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).not.toContain('alert(1)')
    expect(r.value).not.toContain('<script')
  })
})
