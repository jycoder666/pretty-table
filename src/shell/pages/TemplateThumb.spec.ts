import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { BLANK_V1, COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import TemplateThumb from './TemplateThumb.vue'

/**
 * PX-06：模板卡缩略图——纯 CSS 骨架示意。
 * 核验：行列占位数、表头行、合并区跨格、截断省略提示、颜色走 CSS 变量。
 */

describe('TemplateThumb · 模板卡缩略图（PX-06）', () => {
  it('空白表（5×4、无合并）：逐格占位，无截断提示', () => {
    const wrapper = mount(TemplateThumb, { props: { instance: cloneInstance(BLANK_V1) } })
    const thumb = wrapper.find('[data-testid="tpl-thumb"]')
    expect(thumb.exists()).toBe(true)
    // 5 行 4 列全部渲染，无合并覆盖
    expect(thumb.findAll('i')).toHaveLength(20)
    expect(thumb.find('.more').exists()).toBe(false)
    // 单层表头：第一行是表头样式
    expect(thumb.findAll('i.header')).toHaveLength(4)
  })

  it('对比模板（10×4、表头 2 层、有合并区）：合并占位跨格，行超 8 截断出省略提示', () => {
    const wrapper = mount(TemplateThumb, { props: { instance: cloneInstance(COMPARE_ALPHA_V1) } })
    const thumb = wrapper.find('[data-testid="tpl-thumb"]')
    // 示意 8 行 × 4 列 = 32 格；锁定合并 [0,0]-[1,0] 覆盖 (1,0)、合并 [0,1]-[0,2] 覆盖 (0,2)
    expect(thumb.findAll('i')).toHaveLength(30)
    expect(thumb.find('.more').exists()).toBe(true)
    // 两层表头：前 2 行都是表头格；但 (1,0) 与 (0,2) 被合并区覆盖 → 8 - 2 = 6
    expect(thumb.findAll('i.header')).toHaveLength(6)
  })

  it('列超 6 时按 6 列截断；颜色取生效 Palette 的 CSS 变量（零色值字面量）', () => {
    const inst = cloneInstance(BLANK_V1)
    inst.layout.colCount = 9
    inst.layout.slotGrid = inst.layout.slotGrid!.map((row) => row.slice(0, 9))
    const wrapper = mount(TemplateThumb, { props: { instance: inst } })
    const thumb = wrapper.find('[data-testid="tpl-thumb"]')
    // 示意 5 行 × 6 列 = 30 格
    expect(thumb.findAll('i')).toHaveLength(30)
    expect(thumb.find('.more').exists()).toBe(true)
    const style = thumb.attributes('style') ?? ''
    expect(style).toContain('--th-primary')
    expect(style).toContain('--th-paper')
  })
})
