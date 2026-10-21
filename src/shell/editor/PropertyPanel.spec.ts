import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import {
  BLANK_V1,
  COMPARE_ALPHA_V1,
  cloneInstance,
  effectivePalette,
  isRoleOverridden,
  resolveTheme,
  roleColorOf,
} from '@/core'
import { applyThemeCssVars } from '../theme/applyCssVars'
import { useEditorStore } from '../stores/editor'
import { panelGroupOpen } from './panelGroups'
import PropertyPanel from './PropertyPanel.vue'

// 组件测试不碰真实 IndexedDB：草稿读写 mock 为空操作，避免异步失败覆盖 toast 断言
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

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

async function setup(inst?: typeof BLANK_V1) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const editor = useEditorStore()
  editor.openTemplate(cloneInstance(inst ?? BLANK_V1))
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
  vi.restoreAllMocks()
  // PX-16：分组展开状态是模块级会话记忆，测试间复位为默认态
  panelGroupOpen.content = true
  panelGroupOpen.style = false
  panelGroupOpen.structure = false
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

describe('PropertyPanel · 结构编辑区（FR-C3 / Q-9）', () => {
  function bodySlot(editor: ReturnType<typeof useEditorStore>): string {
    const grid = editor.current!.layout.slotGrid!
    return grid[3]![1]!
  }

  it('加一行/加一列各算一步；单步撤销回到加列前', async () => {
    const { editor, wrapper } = await setup()
    const rowsBefore = editor.current!.layout.slotGrid!.length
    const colsBefore = editor.current!.layout.colCount
    await wrapper.findAll('button').find((b) => b.text() === '加一行')!.trigger('click')
    expect(editor.current!.layout.slotGrid!.length).toBe(rowsBefore + 1)
    await wrapper.findAll('button').find((b) => b.text() === '加一列')!.trigger('click')
    expect(editor.current!.layout.colCount).toBe(colsBefore + 1)
    // FR-11：撤销一步 = 回到最近一次操作前（加列前），行数保留加行结果
    editor.undo()
    expect(editor.current!.layout.slotGrid!.length).toBe(rowsBefore + 1)
    expect(editor.current!.layout.colCount).toBe(colsBefore)
  })

  it('达上限置灰：可见行数 20 时「加一行」disabled，12 列时「加一列」disabled', async () => {
    const { editor, wrapper } = await setup()
    for (let i = 0; i < 15; i++) editor.apply({ kind: 'addRow' })
    await wrapper.vm.$nextTick()
    const addRowBtn = wrapper.findAll('button').find((b) => b.text() === '加一行')!
    expect(addRowBtn.attributes('disabled')).toBeDefined()
    for (let i = 0; i < 8; i++) editor.apply({ kind: 'addCol' })
    await wrapper.vm.$nextTick()
    const addColBtn = wrapper.findAll('button').find((b) => b.text() === '加一列')!
    expect(addColBtn.attributes('disabled')).toBeDefined()
  })

  it('删非空行：先弹统一确认弹窗；确认后删行，取消则保留（PX-05）', async () => {
    const { editor, wrapper } = await setup()
    const sid = bodySlot(editor)
    editor.setSlotText(sid, '重要数据')
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    const rowsBefore = editor.current!.layout.slotGrid!.length

    // 取消：弹窗出现且文案照搬原文，行保留
    await wrapper.findAll('button').find((b) => b.text() === '删行')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('内容会一起删掉')
    await wrapper.find('[data-testid="confirm-cancel"]').trigger('click')
    await flushPromises()
    expect(editor.current!.layout.slotGrid!.length).toBe(rowsBefore)

    // 确认：删行
    await wrapper.findAll('button').find((b) => b.text() === '删行')!.trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(editor.current!.layout.slotGrid!.length).toBe(rowsBefore - 1)
  })

  it('删空行不弹确认；删表头行被壳层拦截（不发意图）', async () => {
    const { editor, wrapper } = await setup()
    // 未选中 → 删最后一行（空行）→ 无确认直接删
    await wrapper.findAll('button').find((b) => b.text() === '删行')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(false)
    expect(editor.current!.layout.slotGrid!.length).toBe(4)
    // 选中表头行 → 壳层守卫直接返回
    editor.selectionRange = { start: [0, 0], end: [0, 0] }
    await wrapper.findAll('button').find((b) => b.text() === '删行')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(false)
    expect(editor.current!.layout.slotGrid!.length).toBe(4)
  })

  it('删列同样走 hasContentInCol 确认；确认文案含列号（PX-05）', async () => {
    const { editor, wrapper } = await setup()
    const sid = bodySlot(editor)
    editor.setSlotText(sid, '列内容')
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    await wrapper.findAll('button').find((b) => b.text() === '删列')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('第 2 列')
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(editor.current!.layout.colCount).toBe(3)
  })

  it('表头层数 1/2/3：setHeaderLevel 生效；结构操作后清空选区', async () => {
    const { editor, wrapper } = await setup()
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    const seg = wrapper.findAll('[role="radiogroup"]').at(-1)!
    await seg.findAll('button')[2]!.trigger('click')
    expect(editor.current!.layout.headerLevels).toBe(3)
    expect(editor.selectionRange).toBeNull()
  })

  it('删行连带删掉结构合并区 → 核内 STRUCT_LOSS warn 聚合为一条 toast', async () => {
    const withStructMerge = cloneInstance(BLANK_V1)
    withStructMerge.layout.structuralMerges = [{ start: [1, 0], end: [1, 1] }]
    const { editor, wrapper } = await setup(withStructMerge)
    // 行内有内容 → 删行前会弹统一确认弹窗（PX-05）
    const topLeft = editor.current!.layout.slotGrid![1]![0]!
    editor.setSlotText(topLeft, '占位')
    editor.selectionRange = { start: [1, 0], end: [1, 0] }
    await wrapper.findAll('button').find((b) => b.text() === '删行')!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(true)
    await wrapper.find('[data-testid="confirm-ok"]').trigger('click')
    await flushPromises()
    expect(editor.toast).toContain('合并或内容')
  })
})

describe('PropertyPanel · 格式微调区（FR-C2）', () => {
  it('行高/字号/内边距三档写入 style；缺省显示「标准」档', async () => {
    const { editor, wrapper } = await setup()
    expect(editor.current!.layout.style?.rowHeightTier).toBeUndefined()
    const segs = wrapper.findAll('[role="radiogroup"]')
    // 前 3 个分段组：行高 / 字号 / 内边距
    await segs[0]!.findAll('button')[0]!.trigger('click')
    expect(editor.current!.layout.style?.rowHeightTier).toBe(1)
    await segs[1]!.findAll('button')[2]!.trigger('click')
    expect(editor.current!.layout.style?.fontSizeTier).toBe(3)
    await segs[2]!.findAll('button')[2]!.trigger('click')
    expect(editor.current!.layout.style?.paddingTier).toBe(3)
  })

  it('列宽输入：合法值 clamp 后写入，留空回默认（null）', async () => {
    const { editor, wrapper } = await setup()
    const input = wrapper.find('input[aria-label="第2列宽"]')
    ;(input.element as HTMLInputElement).value = '500' // 超上限 → clamp 到 360
    await input.trigger('input')
    await input.trigger('change')
    expect(editor.current!.layout.style?.colWidths?.[1]).toBe(360)
    const input2 = wrapper.find('input[aria-label="第2列宽"]')
    ;(input2.element as HTMLInputElement).value = ''
    await input2.trigger('input')
    await input2.trigger('change')
    expect(editor.current!.layout.style?.colWidths?.[1]).toBeNull()
  })
})

describe('PropertyPanel · 槽位标题改人话（PX-07）', () => {
  it('空槽显示「第 X 行 · 第 Y 列」，不露 u 序号 / 内部 ID', async () => {
    const { editor, wrapper } = await setup()
    // BLANK_V1：slotGrid[1][2] = 'u7'（第 2 行第 3 列），值为空
    editor.selectedSlotId = 'u7'
    await wrapper.vm.$nextTick()
    const headline = wrapper.find('[data-testid="slot-headline"]')
    expect(headline.text()).toBe('第 2 行 · 第 3 列')
    expect(headline.text()).not.toContain('u7')
    expect(headline.text()).not.toMatch(/r\d+c\d+/)
  })

  it('有内容的槽显示前 8 字摘要，超出截断加 …', async () => {
    const { editor, wrapper } = await setup()
    editor.selectedSlotId = 'u7'
    editor.setSlotText('u7', '这是一个超过八个字的槽位内容')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="slot-headline"]').text()).toBe(
      '当前内容：这是一个超过八个…',
    )
  })

  it('摘要恰为 8 字时不加省略号；数值/标记槽取显示文本', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    // 恰好 8 字
    editor.setSlotText('row.3.val.a', '一二三四五六七八')
    editor.selectedSlotId = 'row.3.val.a'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="slot-headline"]').text()).toBe('当前内容：一二三四五六七八')
    // 数值槽：取数字显示文本
    editor.selectedSlotId = 'row.5.val.a'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="slot-headline"]').text()).toContain('9,800')
    // 标记槽：取标记文案（partial → 部分支持）
    editor.selectedSlotId = 'row.2.val.c'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="slot-headline"]').text()).toBe('当前内容：部分支持')
  })

  it('区块标题：有文字显示摘要，禁止露出区块槽内部 ID', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectedBlockId = 'preset-g1'
    await wrapper.vm.$nextTick()
    const headline = wrapper.find('[data-testid="block-headline"]')
    expect(headline.text()).toBe('当前内容：分组一')
    expect(headline.text()).not.toContain('gap-g1')
  })

  it('空区块回退位置：rowHint after-1 的 gap 区块显示「区块 · 第 3 行」（0 基锚点 → 1 基 N+2）', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectedBlockId = 'preset-g1'
    // 清空区块文字 → headline 走位置回退；preset-g1 挂在 gap-g1（rowHint after-1）
    editor.updateBlockText('')
    await wrapper.vm.$nextTick()
    // after-1 = 插在 1 基第 2 行之后 → 显示第 3 行（与 buildVisualRows 可视行插入位置同源）
    expect(wrapper.find('[data-testid="block-headline"]').text()).toBe('区块 · 第 3 行')
  })
})

describe('PropertyPanel · 合并/拆分按钮随选区置灰（PX-08）', () => {
  function mergeBtn(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('[data-testid="merge-btn"]')
  }
  function splitBtn(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('[data-testid="split-btn"]')
  }

  it('无选区：合并/拆分都置灰，title 给白话原因', async () => {
    const { wrapper } = await setup(COMPARE_ALPHA_V1)
    expect(mergeBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(mergeBtn(wrapper).attributes('title')).toContain('矩形区域')
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(splitBtn(wrapper).attributes('title')).toContain('选中一个已合并的格子')
  })

  it('单格选区：合并置灰（单格无需合并），拆分置灰（没有可拆分的合并）', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    await wrapper.vm.$nextTick()
    expect(mergeBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(mergeBtn(wrapper).attributes('title')).toBe('单格无需合并')
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(splitBtn(wrapper).attributes('title')).toBe('没有可拆分的合并')
  })

  it('选区命中已有合并（同范围）：合并与拆分都可用', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    // compare-alpha-v1 有合并区 [0,1]-[0,2]
    editor.selectionRange = { start: [0, 1], end: [0, 2] }
    await wrapper.vm.$nextTick()
    expect(mergeBtn(wrapper).attributes('disabled')).toBeUndefined()
    expect(splitBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('二维矩形选区（既不同行也不同列）：合并可用（R-2 任意矩形合并）', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    // 2×2 纯矩形（不碰锁定合并 / 现有合并 / readonly）→ 闸门放行
    editor.selectionRange = { start: [3, 1], end: [4, 2] }
    await wrapper.vm.$nextTick()
    expect(mergeBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('拆分随选区命中合并区置灰联动：普通格拆分置灰，合并格可拆', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    await wrapper.vm.$nextTick()
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
    editor.selectionRange = { start: [0, 0], end: [1, 0] }
    await wrapper.vm.$nextTick()
    // [0,0]-[1,0] 是锁定合并（structuralMerges）→ 不能拆分
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(splitBtn(wrapper).attributes('title')).toContain('不能拆分')
  })
})

describe('PropertyPanel · 分组折叠（PX-16）', () => {
  function head(wrapper: ReturnType<typeof mount>, key: string) {
    return wrapper.find(`[data-testid="group-head-${key}"]`)
  }
  /** v-show 收起 = inline style 带 display:none（jsdom 对游离节点 computed style 有缓存，翻转后不能用 isVisible 判定） */
  function bodyStyle(wrapper: ReturnType<typeof mount>, key: string) {
    return wrapper.find(`[data-testid="group-${key}"] .group-body`).attributes('style') ?? ''
  }

  it('默认态：内容展开、样式/结构收起；组头是带 aria-expanded 的按钮', async () => {
    const { wrapper } = await setup()
    for (const key of ['content', 'style', 'structure']) {
      expect(head(wrapper, key).element.tagName).toBe('BUTTON')
    }
    expect(head(wrapper, 'content').attributes('aria-expanded')).toBe('true')
    expect(head(wrapper, 'style').attributes('aria-expanded')).toBe('false')
    expect(head(wrapper, 'structure').attributes('aria-expanded')).toBe('false')
    // 展开态与可见性一致
    expect(bodyStyle(wrapper, 'content')).not.toContain('display: none')
    expect(bodyStyle(wrapper, 'style')).toContain('display: none')
    expect(bodyStyle(wrapper, 'structure')).toContain('display: none')
  })

  it('点击组头整行切换；组间不互斥（可多组同开）', async () => {
    const { wrapper } = await setup()
    await head(wrapper, 'style').trigger('click')
    await head(wrapper, 'structure').trigger('click')
    expect(head(wrapper, 'style').attributes('aria-expanded')).toBe('true')
    expect(head(wrapper, 'structure').attributes('aria-expanded')).toBe('true')
    expect(head(wrapper, 'content').attributes('aria-expanded')).toBe('true')
    expect(bodyStyle(wrapper, 'style')).not.toContain('display: none')
    // 再点收起
    await head(wrapper, 'style').trigger('click')
    await wrapper.vm.$nextTick()
    expect(head(wrapper, 'style').attributes('aria-expanded')).toBe('false')
    expect(bodyStyle(wrapper, 'style')).toContain('display: none')
    // 结构组不受影响
    expect(head(wrapper, 'structure').attributes('aria-expanded')).toBe('true')
    expect(bodyStyle(wrapper, 'structure')).not.toContain('display: none')
  })

  it('会话内记忆：切槽位 / 选区块不重置用户展开状态', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    await head(wrapper, 'structure').trigger('click')
    expect(head(wrapper, 'structure').attributes('aria-expanded')).toBe('true')
    // 切槽位
    editor.selectedSlotId = 'row.3.val.a'
    await wrapper.vm.$nextTick()
    expect(head(wrapper, 'structure').attributes('aria-expanded')).toBe('true')
    // 选区块
    editor.selectedBlockId = 'preset-g1'
    await wrapper.vm.$nextTick()
    expect(head(wrapper, 'structure').attributes('aria-expanded')).toBe('true')
    // 面板重挂载（同会话）也不重置
    wrapper.unmount()
    const { wrapper: wrapper2 } = await setup(COMPARE_ALPHA_V1)
    expect(head(wrapper2, 'structure').attributes('aria-expanded')).toBe('true')
    expect(head(wrapper2, 'content').attributes('aria-expanded')).toBe('true')
  })

  it('默认收起组内的功能入口不丢失：结构组「加一行」可直接点按生效', async () => {
    const { editor, wrapper } = await setup()
    const rowsBefore = editor.current!.layout.slotGrid!.length
    // 结构组默认收起（v-show 隐藏），入口仍在文档中可操作
    expect(wrapper.find('[data-testid="group-structure"] .group-body').isVisible()).toBe(false)
    await wrapper.findAll('button').find((b) => b.text() === '加一行')!.trigger('click')
    expect(editor.current!.layout.slotGrid!.length).toBe(rowsBefore + 1)
  })

  it('删区块入口归入结构组；区块文字编辑留在内容组', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectedBlockId = 'preset-g1'
    await wrapper.vm.$nextTick()
    const contentBody = wrapper.find('[data-testid="group-content"] .group-body')
    const structureBody = wrapper.find('[data-testid="group-structure"] .group-body')
    expect(contentBody.text()).toContain('区块')
    expect(contentBody.find('textarea').exists()).toBe(true)
    expect(structureBody.text()).toContain('删除区块')
  })
})

async function syncAndFlush(wrapper: ReturnType<typeof mount>) {
  syncCssVars()
  await wrapper.vm.$nextTick()
}
