import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import {
  BLANK_V1,
  COMPARE_ALPHA_V1,
  DETAIL_ALPHA_V1,
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
    // E4：色点不再带裸 title，hex 从内联 CSS 变量 --c 读取
    const hexOf = (d: { element: Element }) =>
      (d.element as HTMLElement).style.getPropertyValue('--c').toLowerCase()
    // 点一个 ≠ 主题预设的色 → 成为覆盖
    const other = dots.find((d) => hexOf(d) !== base.primary.toLowerCase())!
    const otherHex = hexOf(other)
    await other.trigger('click')
    expect(roleColorOf(editor.current, 'primary')).toBe(otherHex)
    // 点回主题预设色 → setThemeToken 同值裁剪 → 回到未覆盖
    const presetDot = dots.find((d) => hexOf(d) === base.primary.toLowerCase())
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

describe('PropertyPanel · 结构组：摘要卡与低频设置（增量设计 T03）', () => {
  it('组头摘要卡常显（组体收起也可见）：N 行 × M 列 · K 层表头', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    const summary = wrapper.find('[data-testid="structure-summary"]')
    expect(summary.exists()).toBe(true)
    // 组体默认收起，摘要仍渲染
    expect(
      wrapper.find('[data-testid="group-structure"] .group-body').attributes('style') ?? '',
    ).toContain('display: none')
    const rows = editor.current!.layout.slotGrid!.length
    const cols = editor.current!.layout.colCount
    const levels = editor.current!.layout.headerLevels ?? 1
    expect(summary.text()).toBe(`${rows} 行 × ${cols} 列 · ${levels} 层表头`)
    // 行列数随结构操作联动
    editor.apply({ kind: 'addRow' })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="structure-summary"]').text()).toBe(
      `${rows + 1} 行 × ${cols} 列 · ${levels} 层表头`,
    )
  })

  it('高频入口已移除：加删行列与换位按钮不再出现（入口移至行/列轨道）', async () => {
    const { wrapper } = await setup()
    const labels = ['加一行', '删行', '加一列', '删列', '行上移', '行下移', '列左移', '列右移']
    for (const label of labels) {
      expect(wrapper.findAll('button').some((b) => b.text().trim() === label)).toBe(false)
    }
  })

  it('表头层数 1/2/3：setHeaderLevel 生效；结构操作后清空选区', async () => {
    const { editor, wrapper } = await setup()
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    const seg = wrapper.findAll('[role="radiogroup"]').at(-1)!
    await seg.findAll('button')[2]!.trigger('click')
    expect(editor.current!.layout.headerLevels).toBe(3)
    expect(editor.selectionRange).toBeNull()
  })

  it('组体只留低频设置：表头层数 / 合并拆分 / 推荐列（compare-alpha 有可推荐列）', async () => {
    const { wrapper } = await setup(COMPARE_ALPHA_V1)
    await wrapper.find('[data-testid="group-head-structure"]').trigger('click')
    const body = wrapper.find('[data-testid="group-structure"] .group-body')
    expect(body.text()).toContain('表头层数')
    expect(body.text()).toContain('合并 / 拆分')
    expect(body.text()).toContain('推荐列')
    expect(body.find('[data-testid="merge-btn"]').exists()).toBe(true)
    expect(body.find('[data-testid="split-btn"]').exists()).toBe(true)
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

  it('无选区：合并/拆分都置灰（原因改走 PtTooltip，不留裸 title）', async () => {
    const { wrapper } = await setup(COMPARE_ALPHA_V1)
    expect(mergeBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(mergeBtn(wrapper).attributes('title')).toBeUndefined()
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(splitBtn(wrapper).attributes('title')).toBeUndefined()
  })

  it('单格选区：合并置灰（单格无需合并），拆分置灰（没有可拆分的合并）', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    await wrapper.vm.$nextTick()
    expect(mergeBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
  })

  it('选区命中已有合并（同范围）：合并置灰（已经是合并区），拆分可用', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    // compare-alpha-v1 有合并区 [0,1]-[0,2]
    // WP1 收紧：同区间再合并只是把同一区间压一遍（旧实现会重复追加 merges）→ 合并置灰
    editor.selectionRange = { start: [0, 1], end: [0, 2] }
    await wrapper.vm.$nextTick()
    expect(mergeBtn(wrapper).attributes('disabled')).toBeDefined()
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
    // [0,0]-[1,0] 是锁定合并（structuralMerges）→ 不能拆分（原因走 PtTooltip）
    expect(splitBtn(wrapper).attributes('disabled')).toBeDefined()
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

  it('默认收起组内的功能入口不丢失：结构组展开后表头层数可直接点按生效', async () => {
    const { editor, wrapper } = await setup()
    // 结构组默认收起（v-show 隐藏），入口仍在文档中可操作
    expect(wrapper.find('[data-testid="group-structure"] .group-body').isVisible()).toBe(false)
    const seg = wrapper.findAll('[role="radiogroup"]').at(-1)!
    await seg.findAll('button')[1]!.trigger('click')
    expect(editor.current!.layout.headerLevels).toBe(2)
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

// ── R-3 图片区（交互升级 T04）──

const T04_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function pngFile(): File {
  const bin = atob(T04_IMG.split(',')[1]!)
  const bytes = new Uint8Array([...bin].map((ch) => ch.charCodeAt(0)))
  return new File([bytes], 'a.png', { type: 'image/png' })
}

describe('PropertyPanel · 图片区（R-3 / 交互升级 T04）', () => {
  it('选中文本槽显示「上传图片」；设图后 headline 显示「图片」+ 缩略图 + 替换/移除', async () => {
    const { editor, wrapper } = await setup()
    editor.selectedSlotId = 'u7'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="image-area"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="image-file"]').exists()).toBe(true)
    // 设图后：headline「图片」、缩略图、替换与移除入口
    editor.setImageDataUrl('u7', T04_IMG)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="slot-headline"]').text()).toBe('图片')
    expect(wrapper.find('[data-testid="image-thumb"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="image-file-replace"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="image-remove"]').exists()).toBe(true)
  })

  it('选择图片文件 → uploadImage 写入 {image}；移除后可撤销复原', async () => {
    const { editor, wrapper } = await setup()
    editor.selectedSlotId = 'u7'
    await wrapper.vm.$nextTick()
    const input = wrapper.find('[data-testid="image-file"]')
    Object.defineProperty(input.element, 'files', { value: [pngFile()] })
    await input.trigger('change')
    await flushPromises()
    // FileReader 异步完成（宏任务），用 vi.waitFor 等写入
    await vi.waitFor(() => {
      expect(editor.current!.slots['u7']).toMatchObject({ image: T04_IMG })
    })
    // 移除（setSlot('') 经 mergeSlotValue 回文字空槽：空串或 {text:''}）
    await wrapper.find('[data-testid="image-remove"]').trigger('click')
    await flushPromises()
    const v = editor.current!.slots['u7']
    const shown =
      typeof v === 'string'
        ? v
        : typeof v === 'object' && v !== null && 'text' in v
          ? String(v.text)
          : 'x'
    expect(shown).toBe('')
    editor.undo()
    expect(editor.current!.slots['u7']).toMatchObject({ image: T04_IMG })
  })

  it('mark 槽不显示图片区（kind 闸）', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectedSlotId = 'row.2.val.a'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="image-area"]').exists()).toBe(false)
  })

  it('十项清单：合并/拆分按钮迁移到 PtTooltip，不留裸 title（C-2 抽查）', async () => {
    const { editor, wrapper } = await setup(COMPARE_ALPHA_V1)
    editor.selectionRange = { start: [3, 1], end: [3, 1] }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="merge-btn"]').attributes('title')).toBeUndefined()
    expect(wrapper.find('[data-testid="split-btn"]').attributes('title')).toBeUndefined()
  })
})

// ── R-4 区块样式档位控件（QA Bug #2 收尾）──

describe('PropertyPanel · 区块样式档位（R-4 / QA Bug #2）', () => {
  it('选中 leftTag 区块显示「样式档位」两档（深色底/浅色底）；切档写 styleTier 且可撤销', async () => {
    const { editor, wrapper } = await setup(DETAIL_ALPHA_V1)
    editor.addBlock('leftTag', 'left-r2')
    const blk = editor.current!.blocks.find((b) => b.type === 'leftTag')!
    editor.selectedBlockId = blk.id
    await wrapper.vm.$nextTick()
    const seg = wrapper.find('[data-testid="block-tier"]')
    expect(seg.exists()).toBe(true)
    const buttons = seg.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]!.text()).toBe('深色底')
    expect(buttons[1]!.text()).toBe('浅色底')
    // 缺省显示 1 档；切 2 档 → updateBlock 写 styleTier=2
    expect(buttons[0]!.classes()).toContain('on')
    await buttons[1]!.trigger('click')
    expect(editor.current!.blocks.find((b) => b.id === blk.id)!.props!.styleTier).toBe(2)
    editor.undo()
    // addBlock 时核内 applyAddBlock 已把 styleTier 归一化为缺省 1 档 → 撤销回到 1（非 undefined）
    expect(editor.current!.blocks.find((b) => b.id === blk.id)!.props!.styleTier).toBe(1)
  })

  it('选中 emphFooter 区块显示字号档（常规/略大）；普通文字区块不显示档位控件', async () => {
    const { editor, wrapper } = await setup(DETAIL_ALPHA_V1)
    // sectionBar / groupHeader 是既有文字区块 → 无档位控件
    editor.selectedBlockId = editor.current!.blocks[0]!.id
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="block-tier"]').exists()).toBe(false)
    // emphFooter → 字号两档
    editor.addBlock('emphFooter', 'footer-1')
    const blk = editor.current!.blocks.find((b) => b.type === 'emphFooter')!
    editor.selectedBlockId = blk.id
    await wrapper.vm.$nextTick()
    const buttons = wrapper.find('[data-testid="block-tier"]').findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['常规', '略大'])
    await buttons[1]!.trigger('click')
    expect(editor.current!.blocks.find((b) => b.id === blk.id)!.props!.styleTier).toBe(2)
  })
})

describe('PropertyPanel · 主题切换 pastePending 禁用（PX-15）', () => {
  async function setupWithPreview() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    const wrapper = mount(PropertyPanel, { global: { plugins: [pinia] } })
    // 与 EditorToolbar.spec 同口径：进入粘贴预览期（可写槽作锚点）
    editor.selectedSlotId = 'row.3.val.a'
    editor.pasteStart({ text: '1\t2\n3\t4' })
    expect(editor.pastePending).toBe(true)
    await flushPromises()
    return { editor, wrapper }
  }

  it('粘贴预览期：三个主题按钮与斑马纹开关禁用，tooltip 说明原因', async () => {
    const { editor, wrapper } = await setupWithPreview()
    const themeBtns = wrapper.findAll('.theme-btn')
    expect(themeBtns.length).toBe(3)
    for (const b of themeBtns) expect(b.attributes('disabled')).toBeDefined()
    const zebra = wrapper.find('.zebra input[type="checkbox"]')
    expect(zebra.attributes('disabled')).toBeDefined()
    // tooltip 说明与 pastePending 其他禁用态同源（GC-25：人话，不露状态码）
    expect(wrapper.text()).not.toContain('pastePending')
    editor.cancelPaste()
  })

  it('非预览期：主题按钮与斑马纹开关可用（行为不回退）', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    const wrapper = mount(PropertyPanel, { global: { plugins: [pinia] } })
    for (const b of wrapper.findAll('.theme-btn')) {
      expect(b.attributes('disabled')).toBeUndefined()
    }
    expect(wrapper.find('.zebra input[type="checkbox"]').attributes('disabled')).toBeUndefined()
    // E4 顺带核对：合并/拆分按钮不留裸 title（E2 守卫）
    expect(wrapper.find('[data-testid="merge-btn"]').attributes('title')).toBeUndefined()
    expect(wrapper.find('[data-testid="split-btn"]').attributes('title')).toBeUndefined()
  })

  it('预览期置灰原因走 PtTooltip 文案：经外层 span 触发后断言主题/斑马纹原因（P2 验收补齐）', async () => {
    // jsdom 无 ResizeObserver（reka PopperContent 需要）；tooltip 300ms 延时走 fake timers
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    )
    vi.useFakeTimers()
    let wrapper: ReturnType<typeof mount> | null = null
    try {
      // 与 PtTooltip.spec 同口径：attachTo document（reka 指针事件需要触发器在文档中）
      const pinia = createPinia()
      setActivePinia(pinia)
      const editor = useEditorStore()
      editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
      wrapper = mount(PropertyPanel, { global: { plugins: [pinia] }, attachTo: document.body })
      editor.selectedSlotId = 'row.3.val.a'
      editor.pasteStart({ text: '1\t2\n3\t4' })
      expect(editor.pastePending).toBe(true)
      await flushPromises()
      // PtTooltip 触发器统一包一层 span（.pt-tooltip-trigger）；主题按钮被包了 3 层
      const themeTriggers = wrapper
        .findAll('.pt-tooltip-trigger')
        .filter((t) => t.find('.theme-btn').exists())
      expect(themeTriggers.length).toBe(3)
      // 触发第一个主题按钮的 tooltip → 锁定置灰原因文案（GC-25：人话，不露状态码）
      await themeTriggers[0]!.trigger('pointermove')
      await vi.advanceTimersByTimeAsync(300)
      expect(document.body.textContent).toContain('粘贴预览期间不能切换主题，先确认或取消粘贴')
      // 斑马纹开关同源原因文案
      const zebraTrigger = wrapper
        .findAll('.pt-tooltip-trigger')
        .find((t) => t.find('.zebra input[type="checkbox"]').exists())!
      expect(zebraTrigger).toBeDefined()
      await zebraTrigger.trigger('pointermove')
      await vi.advanceTimersByTimeAsync(300)
      expect(document.body.textContent).toContain('粘贴预览期间不能切换斑马纹')
      editor.cancelPaste()
    } finally {
      wrapper?.unmount()
      vi.useRealTimers()
      vi.unstubAllGlobals()
      document.body.innerHTML = ''
    }
  })
})
