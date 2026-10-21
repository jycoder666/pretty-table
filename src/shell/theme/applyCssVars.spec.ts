import { beforeEach, describe, expect, it } from 'vitest'
import { PALETTES } from '@/core'
import { applyThemeCssVars } from './applyCssVars'

let el: HTMLElement

beforeEach(() => {
  el = document.createElement('div')
})

describe('applyThemeCssVars — 预设与自定义配色同步', () => {
  it('无 palette 入参：按预设主题合成（既有行为不变）', () => {
    applyThemeCssVars('T-A', undefined, el)
    expect(el.style.getPropertyValue('--pt-primary')).toBe(PALETTES['T-A'].primary)
    expect(el.style.getPropertyValue('--pt-paper')).toBe(PALETTES['T-A'].paper)
    expect(el.dataset.theme).toBe('T-A')
  })

  it('传入生效配色（含角色色覆盖）：CSS 变量取覆盖后的值', () => {
    const pal = { ...PALETTES['T-A'], primary: '#123456' }
    applyThemeCssVars('T-A', pal, el)
    expect(el.style.getPropertyValue('--pt-primary')).toBe('#123456')
    expect(el.style.getPropertyValue('--pt-paper')).toBe(PALETTES['T-A'].paper)
  })

  it('palette 为 null 时回落预设（打开非编辑页等场景）', () => {
    applyThemeCssVars('T-A', null, el)
    expect(el.style.getPropertyValue('--pt-primary')).toBe(PALETTES['T-A'].primary)
  })
})
