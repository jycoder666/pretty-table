import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PtSegmented from './PtSegmented.vue'

const opts = [
  { value: 1, label: '紧凑' },
  { value: 2, label: '标准' },
  { value: 3, label: '宽松' },
]

describe('PtSegmented — 三档分段选择', () => {
  it('渲染全部选项，当前项高亮', () => {
    const w = mount(PtSegmented, { props: { options: opts, modelValue: 2 } })
    const btns = w.findAll('button')
    expect(btns.map((b) => b.text())).toEqual(['紧凑', '标准', '宽松'])
    expect(btns[1]!.classes()).toContain('on')
    expect(btns[1]!.attributes('aria-checked')).toBe('true')
  })

  it('点选 emits update:modelValue', async () => {
    const w = mount(PtSegmented, { props: { options: opts, modelValue: 1 } })
    await w.findAll('button')[2]!.trigger('click')
    expect(w.emitted('update:modelValue')![0]).toEqual([3])
  })

  it('disabled 时点击不触发', async () => {
    const w = mount(PtSegmented, { props: { options: opts, modelValue: 1, disabled: true } })
    await w.findAll('button')[2]!.trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
