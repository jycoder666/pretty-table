import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import {
  BLANK_V1,
  cloneInstance,
  effectivePalette,
  isRoleOverridden,
  resolveTheme,
  roleColorOf,
} from '@/core'
import { applyThemeCssVars } from '../theme/applyCssVars'
import { useEditorStore } from '../stores/editor'
import PropertyPanel from './PropertyPanel.vue'

/**
 * FR-C1 颜色自定义区：预设色板点选 / hex 输入（非法不写入 + 提示）/ 恢复预设。
 * CSS 变量刷新由 App/EditorPage 的 version watch 完成；此处以等价的
 * applyThemeCssVars(effectivePalette(...)) 合成链核验取值正确。
 */

function syncCssVars() {
  const editor = useEditorStore()
  if (editor.current) {
    applyThemeCssVars(editor.current.themeId, effectivePalette(editor.current))
  }
}

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const editor = useEditorStore()
  editor.openTemplate(cloneInstance(BLANK_V1))
  const wrapper = mount(PropertyPanel, { global: { plugins: [pinia] } })
  syncCssVars()
  return { editor, wrapper }
}

function hexInputOf(wrapper: ReturnType<typeof mount>, role: string) {
  return wrapper.find(`[data-testid="color-field-${role}"] input.hex`)
}

/** 模拟真实输入：input 事件喂 v-model，change 事件提交（失焦/回车） */
async function typeHex(wrapper: ReturnType<typeof mount>, role: string, raw: string) {
  const input = hexInputOf(wrapper, role)
  ;(input.element as HTMLInputElement).value = raw
  await input.trigger('input')
  await input.trigger('change')
}

beforeEach(() => {
  document.documentElement.style.cssText = ''
  document.documentElement.removeAttribute('data-theme')
})

describe('PropertyPanel · 颜色自定义区（FR-C1）', () => {
  it('渲染六角色色控件，未覆盖时生效色 = 主题预设', async () => {
    const { editor, wrapper } = await setup()
    for (const [role, label] of [
      ['primary', '表头底色'],
      ['headerText', '表头文字'],
      ['zebra', '斑马纹'],
      ['emphasis', '强调色'],
      ['border', '边框色'],
      ['background', '表格底色'],
    ] as const) {
      expect(wrapper.find(`[data-testid="color-field-${role}"]`).exists()).toBe(true)
      expect(wrapper.find(`[data-testid="color-field-${role}"] .name`).text()).toBe(label)
      expect((hexInputOf(wrapper, role).element as HTMLInputElement).value).toBe(
        roleColorOf(editor.current, role).toLowerCase(),
      )
    }
    expect(wrapper.find('[data-testid="color-field-primary"]').text()).not.toContain('恢复预设')
    expect(wrapper.findAll('button').some((b) => b.text() === '全部恢复预设')).toBe(true)
  })

  it('非法 hex 不写入：实例与 CSS 变量都不变，弹提示，输入框回退', async () => {
    const { editor, wrapper } = await setup()
    const before = roleColorOf(editor.current, 'primary')
    const cssBefore = document.documentElement.style.getPropertyValue('--pt-primary')
    await typeHex(wrapper, 'primary', '123456') // 缺 # → 非法
    await wrapper.vm.$nextTick()
    expect(roleColorOf(editor.current, 'primary')).toBe(before)
    expect(document.documentElement.style.getPropertyValue('--pt-primary')).toBe(cssBefore)
    expect(editor.toast).toContain('颜色格式不对')
    expect((hexInputOf(wrapper, 'primary').element as HTMLInputElement).value).toBe(
      before.toLowerCase(),
    )
  })

  it('合法 hex 写入：生效色与 CSS 变量同步为覆盖值，出现单角色「恢复预设」', async () => {
    const { editor, wrapper } = await setup()
    await typeHex(wrapper, 'primary', '#123456')
    await syncAndFlush(wrapper)
    expect(roleColorOf(editor.current, 'primary')).toBe('#123456')
    expect(document.documentElement.style.getPropertyValue('--pt-primary')).toBe('#123456')
    expect(isRoleOverridden(editor.current, 'primary')).toBe(true)
    expect(wrapper.find('[data-testid="color-field-primary"]').text()).toContain('恢复预设')
  })

  it('预设色板点选写入；点回主题预设值时覆盖自动裁剪', async () => {
    const { editor, wrapper } = await setup()
    const base = resolveTheme(editor.current!.themeId).palette
    const dots = wrapper.findAll('[data-testid="color-field-primary"] .dot')
    expect(dots.length).toBeGreaterThanOrEqual(8)
    // 点一个 ≠ 主题预设的色 → 成为覆盖
    const other = dots.find(
      (d) => (d.element as HTMLButtonElement).getAttribute('title')!.toLowerCase() !== base.primary.toLowerCase(),
    )!
    const otherHex = (other.element as HTMLButtonElement).getAttribute('title')!
    await other.trigger('click')
    expect(roleColorOf(editor.current, 'primary')).toBe(otherHex.toLowerCase())
    // 点回主题预设色 → setThemeToken 同值裁剪 → 回到未覆盖
    const presetDot = dots.find(
      (d) =>
        (d.element as HTMLButtonElement).getAttribute('title')!.toLowerCase() ===
        base.primary.toLowerCase(),
    )
    await presetDot!.trigger('click')
    expect(isRoleOverridden(editor.current, 'primary')).toBe(false)
    expect(roleColorOf(editor.current, 'primary')).toBe(base.primary)
  })

  it('单角色「恢复预设」删除该角色覆盖；「全部恢复预设」清空全部覆盖', async () => {
    const { editor, wrapper } = await setup()
    // 制造两个覆盖
    await typeHex(wrapper, 'primary', '#123456')
    await typeHex(wrapper, 'border', '#654321')
    expect(isRoleOverridden(editor.current, 'primary')).toBe(true)
    expect(isRoleOverridden(editor.current, 'border')).toBe(true)
    // 单角色恢复
    await wrapper
      .find('[data-testid="color-field-primary"] button.reset')
      .trigger('click')
    expect(isRoleOverridden(editor.current, 'primary')).toBe(false)
    expect(isRoleOverridden(editor.current, 'border')).toBe(true)
    // 全部恢复
    const resetAll = wrapper.findAll('button').find((b) => b.text() === '全部恢复预设')!
    await resetAll.trigger('click')
    for (const k of ['primary', 'border'] as const) {
      expect(isRoleOverridden(editor.current, k)).toBe(false)
    }
  })
})

async function syncAndFlush(wrapper: ReturnType<typeof mount>) {
  syncCssVars()
  await wrapper.vm.$nextTick()
}
