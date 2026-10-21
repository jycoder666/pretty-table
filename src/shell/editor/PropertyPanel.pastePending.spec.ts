import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { COMPARE_ALPHA_V1, cloneInstance } from '@/core'
import { useEditorStore } from '../stores/editor'
import { panelGroupOpen } from './panelGroups'
import PropertyPanel from './PropertyPanel.vue'

// 组件测试不碰真实 IndexedDB：草稿读写 mock 为空操作（与 PropertyPanel.spec 同口径）
vi.mock('../repo/draftRepo', () => ({
  saveDraft: vi.fn<() => Promise<void>>(async () => {}),
  loadDraft: vi.fn<() => Promise<null>>(async () => null),
  clearDraft: vi.fn<() => Promise<void>>(async () => {}),
}))

/**
 * C2 测试债收口：pastePending 禁用态系统性断言。
 *
 * PX-15 / FR-17：粘贴预览期间属性面板全部编辑入口置灰。此前仅主题 / 斑马纹 /
 * 合并拆分有抽查，本 spec mount 真组件按组遍历断言（主题组 / 斑马纹 / 颜色组 /
 * 格式微调组 / 结构组 / 内容组 / 图片组），pastePending=false 后抽查恢复可用，
 * 防止未来新增控件漏接 :disabled="editor.pastePending"。
 * 已知未接线（不在此断言）：图片「替换/上传」的 file input 依赖 canImage /
 * selectedImage 出现与否控制，不是 disabled 属性——属设计现状，不做假断言。
 */

const T04_IMG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const COLOR_ROLES = ['primary', 'headerText', 'zebra', 'emphasis', 'border', 'background'] as const

async function setupWithPreview() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const editor = useEditorStore()
  editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
  // 图片区锚点：进预览前给文本槽设一张图（普通意图，不受预览期限制）
  editor.selectedSlotId = 'row.3.val.a'
  editor.setImageDataUrl('row.3.val.a', T04_IMG)
  // 选区命中既有合并区 [0,1]-[0,2]：非预览期合并/拆分都可用，
  // 预览期两者仍置灰 → 证明置灰由 pastePending 单独决定
  editor.selectionRange = { start: [0, 1], end: [0, 2] }
  const okStart = editor.pasteStart({ text: '1\t2\n3\t4' })
  expect(okStart).toBe(true)
  expect(editor.pastePending).toBe(true)
  const wrapper = mount(PropertyPanel, { global: { plugins: [pinia] } })
  await flushPromises()
  return { editor, wrapper }
}

/** 按可见文案找按钮（v-show 收起的组照样能找到，无需展开） */
function btn(wrapper: ReturnType<typeof mount>, label: string) {
  const b = wrapper.findAll('button').find((x) => x.text().trim() === label)
  expect(b).toBeDefined()
  return b!
}

/** 按 h4 标题定位分组容器内的全部原生按钮（推荐列 / 结构等动态渲染组） */
function sectionButtons(wrapper: ReturnType<typeof mount>, title: string): HTMLButtonElement[] {
  const h4 = wrapper.findAll('h4').find((h) => h.text() === title)
  expect(h4).toBeDefined()
  return Array.from((h4!.element.parentElement as HTMLElement).querySelectorAll('button'))
}

beforeEach(() => {
  // PX-16：分组展开状态是模块级会话记忆，测试间复位为默认态
  panelGroupOpen.content = true
  panelGroupOpen.style = false
  panelGroupOpen.structure = false
})

describe('PropertyPanel · pastePending 禁用面系统断言（PX-15 / FR-17）', () => {
  it('粘贴预览期：主题 / 斑马纹 / 颜色 / 格式微调各组全部置灰', async () => {
    const { wrapper } = await setupWithPreview()

    // 主题组：三个主题按钮
    const themeBtns = wrapper.findAll('.theme-btn')
    expect(themeBtns.length).toBe(3)
    for (const b of themeBtns) expect((b.element as HTMLButtonElement).disabled).toBe(true)

    // 斑马纹开关
    const zebra = wrapper.find('.zebra input[type="checkbox"]')
    expect((zebra.element as HTMLInputElement).disabled).toBe(true)

    // 颜色组：六角色 hex 输入 + 「全部恢复预设」
    for (const role of COLOR_ROLES) {
      const hex = wrapper.find(`[data-testid="color-field-${role}"] input.hex`)
      expect(hex.exists(), `角色 ${role} 的 hex 输入应存在`).toBe(true)
      expect((hex.element as HTMLInputElement).disabled).toBe(true)
    }
    expect((btn(wrapper, '全部恢复预设').element as HTMLButtonElement).disabled).toBe(true)

    // 格式微调组：行高 / 字号 / 内边距三个分段组 + 逐列列宽输入（compare-alpha 共 4 列）
    const segs = wrapper.findAll('[role="radiogroup"]').slice(0, 3)
    expect(segs.length).toBe(3)
    for (const seg of segs) {
      for (const b of seg.findAll('button')) {
        expect((b.element as HTMLButtonElement).disabled).toBe(true)
      }
    }
    for (let c = 0; c < 4; c++) {
      const input = wrapper.find(`input[aria-label="第${c + 1}列宽"]`)
      expect((input.element as HTMLInputElement).disabled).toBe(true)
    }
  })

  it('粘贴预览期：结构 / 内容 / 图片各组全部置灰', async () => {
    const { editor, wrapper } = await setupWithPreview()

    // 结构组：加一行 / 删行 / 加一列 / 删列 + 表头层数分段 + 合并/拆分 + 推荐列
    for (const label of ['加一行', '删行', '加一列', '删列']) {
      expect((btn(wrapper, label).element as HTMLButtonElement).disabled).toBe(true)
    }
    const headerSeg = wrapper.findAll('[role="radiogroup"]').at(-1)!
    for (const b of headerSeg.findAll('button')) {
      expect((b.element as HTMLButtonElement).disabled).toBe(true)
    }
    expect((wrapper.find('[data-testid="merge-btn"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((wrapper.find('[data-testid="split-btn"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    for (const b of sectionButtons(wrapper, '推荐列')) {
      expect(b.disabled).toBe(true)
    }

    // 内容组：对齐三键 + 强调三键（红字/加粗/底色）+ mark 槽三选一
    for (const label of ['左', '中', '右', '红字', '加粗', '底色']) {
      expect((btn(wrapper, label).element as HTMLButtonElement).disabled).toBe(true)
    }
    // 切到 mark 槽（纯 UI 选中态，不发意图，预览期允许）
    editor.selectedSlotId = 'row.2.val.c'
    await wrapper.vm.$nextTick()
    const markGroup = wrapper.find('[data-testid="group-content"] [role="radiogroup"]')
    expect(markGroup.exists()).toBe(true)
    for (const b of markGroup.findAll('button')) {
      expect((b.element as HTMLButtonElement).disabled).toBe(true)
    }

    // 图片组：已设图槽位显示「移除图片」，预览期置灰（file input 靠出现与否控制，属设计现状）
    editor.selectedSlotId = 'row.3.val.a'
    await wrapper.vm.$nextTick()
    const removeImg = wrapper.find('[data-testid="image-remove"]')
    expect(removeImg.exists()).toBe(true)
    expect((removeImg.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('取消预览后恢复：各组代表控件重新可用（合并/拆分随命中合并区可用）', async () => {
    const { editor, wrapper } = await setupWithPreview()
    editor.cancelPaste()
    expect(editor.pastePending).toBe(false)
    await wrapper.vm.$nextTick()

    // 主题组 + 斑马纹
    for (const b of wrapper.findAll('.theme-btn')) {
      expect((b.element as HTMLButtonElement).disabled).toBe(false)
    }
    expect(
      (wrapper.find('.zebra input[type="checkbox"]').element as HTMLInputElement).disabled,
    ).toBe(false)
    // 颜色组代表 + 全部恢复预设
    expect(
      (wrapper.find('[data-testid="color-field-primary"] input.hex')
        .element as HTMLInputElement).disabled,
    ).toBe(false)
    expect((btn(wrapper, '全部恢复预设').element as HTMLButtonElement).disabled).toBe(false)
    // 格式微调代表：第一分段组 + 第 1 列宽
    for (const b of wrapper.findAll('[role="radiogroup"]')[0]!.findAll('button')) {
      expect((b.element as HTMLButtonElement).disabled).toBe(false)
    }
    expect(
      (wrapper.find('input[aria-label="第1列宽"]').element as HTMLInputElement).disabled,
    ).toBe(false)
    // 结构组代表：加一行 + 合并/拆分（选区命中既有合并区，非预览期双双可用）
    expect((btn(wrapper, '加一行').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.find('[data-testid="merge-btn"]').element as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect((wrapper.find('[data-testid="split-btn"]').element as HTMLButtonElement).disabled).toBe(
      false,
    )
    // 内容组代表：对齐 / mark 槽
    for (const label of ['左', '中', '右']) {
      expect((btn(wrapper, label).element as HTMLButtonElement).disabled).toBe(false)
    }
    editor.selectedSlotId = 'row.2.val.c'
    await wrapper.vm.$nextTick()
    for (const b of wrapper.find('[data-testid="group-content"] [role="radiogroup"]').findAll('button')) {
      expect((b.element as HTMLButtonElement).disabled).toBe(false)
    }
    // 图片组：移除图片恢复可用
    editor.selectedSlotId = 'row.3.val.a'
    await wrapper.vm.$nextTick()
    expect((wrapper.find('[data-testid="image-remove"]').element as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
})
