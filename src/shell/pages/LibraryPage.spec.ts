import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { COMPARE_ALPHA_V1, cloneInstance, type TemplateInstance } from '@/core'
import { useLibraryStore } from '../stores/library'
import { useEditorStore } from '../stores/editor'
import LibraryPage from './LibraryPage.vue'

/** repo 层 mock（PX-01 / PX-10）：不依赖 IndexedDB，删除/保存走可控 mock */
const { removeMock, listMock, saveMock } = vi.hoisted(() => ({
  removeMock: vi.fn<(templateId: string) => Promise<void>>(),
  listMock: vi.fn<() => Promise<TemplateInstance[]>>(),
  saveMock: vi.fn<(inst: TemplateInstance) => Promise<void>>(),
}))

vi.mock('../repo/idbTemplateRepo', () => ({
  createIdbTemplateRepo: () => ({
    list: listMock,
    get: vi.fn<() => Promise<null>>(async () => null),
    save: saveMock,
    remove: removeMock,
  }),
}))

function fakeMine(id: string): TemplateInstance {
  const inst = cloneInstance(COMPARE_ALPHA_V1)
  inst.templateId = id
  inst.meta = {
    ...inst.meta,
    displayName: `我的模板 ${id}`,
    origin: 'user',
    savedAt: new Date().toISOString(),
  }
  return inst
}

async function mountPage() {
  const wrapper = mount(LibraryPage)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
  listMock.mockReset().mockResolvedValue([])
  removeMock.mockReset().mockResolvedValue(undefined)
  saveMock.mockReset().mockResolvedValue(undefined)
})

/** 取第 n 张「使用此模板」按钮（库页含系统预设与我的模板两个分区） */
function useBtnAt(wrapper: ReturnType<typeof mount>, n: number) {
  return wrapper.findAll('button').filter((b) => b.text().includes('使用此模板'))[n]!
}

/** PX-05：确认改走统一确认弹窗；helper 等弹窗出现并点「确认 / 取消」 */
async function answerConfirm(wrapper: ReturnType<typeof mount>, yes: boolean) {
  const btn = wrapper.find(`[data-testid="confirm-${yes ? 'ok' : 'cancel'}"]`)
  expect(btn.exists()).toBe(true)
  await btn.trigger('click')
  await flushPromises()
}

describe('LibraryPage · 换模板替换确认（PX-02 / FR-10 / PX-05）', () => {
  it('编辑台有未保存改动时换模板：弹确认弹窗，确认后切换', async () => {
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.setSlotText('obj.name.a', '未保存的方案')
    expect(editor.dirty).toBe(true)
    const wrapper = await mountPage()
    // blank 居首后：点第 3 张预设，避免与当前打开的 compare-alpha-v1 同模板
    await useBtnAt(wrapper, 2).trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('未另存的修改会丢失')
    expect(wrapper.find('[data-testid="confirm-ok"]').text()).toBe('替换')
    await answerConfirm(wrapper, true)
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(false)
    expect(editor.current?.templateId).not.toBe(COMPARE_ALPHA_V1.templateId)
  })

  it('有改动但取消确认：不切换', async () => {
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.setSlotText('obj.name.a', '未保存的方案')
    const wrapper = await mountPage()
    await useBtnAt(wrapper, 2).trigger('click')
    await flushPromises()
    await answerConfirm(wrapper, false)
    expect(editor.current?.templateId).toBe(COMPARE_ALPHA_V1.templateId)
  })

  it('无未保存改动：直接切换，不弹确认', async () => {
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.markSaved()
    const wrapper = await mountPage()
    await useBtnAt(wrapper, 2).trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(false)
    expect(editor.current?.templateId).not.toBe(COMPARE_ALPHA_V1.templateId)
  })
})

describe('LibraryPage · 我的模板删除入口（PX-01）', () => {
  it('只有「我的模板」卡片有删除入口，系统预设没有', async () => {
    listMock.mockResolvedValue([fakeMine('user-x1'), fakeMine('user-x2')])
    const wrapper = await mountPage()
    const delBtns = wrapper.findAll('button').filter((b) => b.text().includes('删除'))
    expect(delBtns.length).toBe(2)
    // 预设分区（系统预设标题之后）不出现删除按钮
    const presetSection = wrapper.findAll('section')[0]!
    expect(presetSection.text()).not.toContain('删除')
  })

  it('确认后删除成功：repo 删除 + 列表刷新 + toast「已删除」', async () => {
    const editor = useEditorStore()
    listMock.mockResolvedValueOnce([fakeMine('user-x1')]).mockResolvedValue([])
    const wrapper = await mountPage()
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-ok"]').text()).toBe('删除')
    await answerConfirm(wrapper, true)
    expect(removeMock).toHaveBeenCalledWith('user-x1')
    expect(useLibraryStore().mine).toHaveLength(0)
    expect(editor.toast).toBe('已删除')
  })

  it('取消确认：不删除', async () => {
    const library = useLibraryStore()
    listMock.mockResolvedValue([fakeMine('user-x1')])
    const wrapper = await mountPage()
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    await answerConfirm(wrapper, false)
    expect(removeMock).not.toHaveBeenCalled()
    expect(library.mine).toHaveLength(1)
  })

  it('删除失败（故障注入 TEMPLATE_DELETE_FAIL）：toast 白话文案，不露错误码', async () => {
    removeMock.mockRejectedValue({ code: 'TEMPLATE_DELETE_FAIL', message: 'remove fail' })
    const editor = useEditorStore()
    listMock.mockResolvedValue([fakeMine('user-x1')])
    const wrapper = await mountPage()
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    await answerConfirm(wrapper, true)
    expect(removeMock).toHaveBeenCalledWith('user-x1')
    expect(editor.toast).toBe('删除失败，请重试')
    expect(editor.toast).not.toContain('TEMPLATE_DELETE_FAIL')
  })
})

describe('LibraryPage · 模板卡缩略图（PX-06）', () => {
  it('预设卡与我的模板卡顶部都有缩略图；空白向导卡不占缩略图', async () => {
    listMock.mockResolvedValue([fakeMine('user-x1')])
    const library = useLibraryStore()
    const wrapper = await mountPage()
    const thumbs = wrapper.findAll('[data-testid="tpl-thumb"]')
    // 预设 + 我的，每卡一张
    expect(thumbs).toHaveLength(library.presets.length + library.mine.length)
    // 空白专属卡不放缩略图
    expect(wrapper.find('[data-testid="blank-card"] [data-testid="tpl-thumb"]').exists()).toBe(
      false,
    )
    // 每张缩略图带 aria-hidden（纯示意装饰）
    for (const t of thumbs) expect(t.attributes('aria-hidden')).toBe('true')
  })
})

describe('LibraryPage · 新建空白表专属卡与向导（FR-C6 / Q-10 / T05）', () => {
  async function openWizard() {
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="blank-open"]').trigger('click')
    return wrapper
  }

  it('空白表卡常驻预设区首位，含一句引导文案；普通预设卡仍可识别', async () => {
    const wrapper = await mountPage()
    const card = wrapper.find('[data-testid="blank-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('不套模板，从一张空表开始填')
    // 空白卡不提供「使用此模板」按钮，不影响既有预设卡的选取
    expect(card.findAll('button').some((b) => b.text().includes('使用此模板'))).toBe(false)
    expect(useBtnAt(wrapper, 0).exists()).toBe(true)
  })

  it('默认 5 行 × 4 列、1 层表头，创建后直接进编辑台', async () => {
    const editor = useEditorStore()
    const wrapper = await openWizard()
    await wrapper.find('[data-testid="blank-create"]').trigger('click')
    expect(editor.page).toBe('editor')
    expect(editor.current?.layout.rowCount).toBe(5)
    expect(editor.current?.layout.colCount).toBe(4)
    expect(editor.current?.layout.headerLevels).toBe(1)
    expect(editor.current?.meta?.templateType).toBe('blank')
  })

  it('向导改 6 行 3 列 2 层：实例按参数生成', async () => {
    const editor = useEditorStore()
    const wrapper = await openWizard()
    const rows = wrapper.find('[data-testid="blank-rows"]')
    ;(rows.element as HTMLInputElement).value = '6'
    await rows.trigger('input')
    const cols = wrapper.find('[data-testid="blank-cols"]')
    ;(cols.element as HTMLInputElement).value = '3'
    await cols.trigger('input')
    const levels = wrapper.find('[data-testid="blank-levels"]')
    ;(levels.element as HTMLSelectElement).value = '2'
    await levels.trigger('change') // select 的 v-model 监听 change
    await wrapper.find('[data-testid="blank-create"]').trigger('click')
    expect(editor.current?.layout.rowCount).toBe(6)
    expect(editor.current?.layout.colCount).toBe(3)
    expect(editor.current?.layout.headerLevels).toBe(2)
    expect(editor.current?.layout.slotGrid).toHaveLength(6)
  })

  it('超界输入在源头钳制：99 行 → 20 行', async () => {
    const editor = useEditorStore()
    const wrapper = await openWizard()
    const rows = wrapper.find('[data-testid="blank-rows"]')
    ;(rows.element as HTMLInputElement).value = '99'
    await rows.trigger('input')
    await wrapper.find('[data-testid="blank-create"]').trigger('click')
    expect(editor.current?.layout.rowCount).toBe(20)
  })

  it('有未另存改动时创建：先弹替换确认，取消则不动', async () => {
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.setSlotText('obj.name.a', '未保存')
    const wrapper = await openWizard()
    await wrapper.find('[data-testid="blank-create"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="confirm-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="confirm-message"]').text()).toContain('未另存的修改会丢失')
    await answerConfirm(wrapper, false)
    expect(editor.current?.templateId).toBe(COMPARE_ALPHA_V1.templateId)
    await wrapper.find('[data-testid="blank-create"]').trigger('click')
    await flushPromises()
    await answerConfirm(wrapper, true)
    expect(editor.current?.meta?.templateType).toBe('blank')
  })
})

describe('LibraryPage · 我的模板卡类型标识与重命名（PX-10）', () => {
  it('我的模板卡显示类型 chip（复用系统模板 typeLabel），预设卡不受影响', async () => {
    listMock.mockResolvedValue([fakeMine('user-cmp')])
    const wrapper = await mountPage()
    // 我的模板卡有「我的」+ 类型两个 chip
    const card = wrapper
      .findAll('article')
      .find((a) => a.find('[data-testid="rename-btn"]').exists())!
    const chips = card.findAll('.chip')
    expect(chips.map((c) => c.text())).toEqual(['我的', '对比'])
    // 预设卡仍是单类型 chip，无「我的」、无重命名入口
    const presetSection = wrapper.findAll('section')[0]!
    expect(presetSection.text()).not.toContain('我的')
    expect(presetSection.text()).not.toContain('重命名')
  })

  it('点「重命名」弹小弹层并回填原名；保存后经 repo 原键覆盖持久化 + toast', async () => {
    listMock.mockResolvedValue([fakeMine('user-rn')])
    const library = useLibraryStore()
    const editor = useEditorStore()
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="rename-btn"]').trigger('click')
    const dialog = wrapper.find('[data-testid="rename-dialog"]')
    expect(dialog.exists()).toBe(true)
    expect((wrapper.find('[data-testid="rename-input"]').element as HTMLInputElement).value).toBe(
      '我的模板 user-rn',
    )
    const input = wrapper.find('[data-testid="rename-input"]')
    ;(input.element as HTMLInputElement).value = '体检对比·终版'
    await input.trigger('input')
    await wrapper.find('[data-testid="rename-ok"]').trigger('click')
    await flushPromises()
    // repo.save 以同 templateId 覆盖写入改名后的实例（原键覆盖，不新增卡）
    expect(saveMock).toHaveBeenCalledTimes(1)
    const saved = saveMock.mock.calls[0]![0] as TemplateInstance
    expect(saved.templateId).toBe('user-rn')
    expect(saved.meta?.displayName).toBe('体检对比·终版')
    expect(saved.meta?.origin).toBe('user')
    expect(editor.toast).toBe('已重命名')
    // 弹层收起
    expect(wrapper.find('[data-testid="rename-dialog"]').exists()).toBe(false)
    void library
  })

  it('取消 / 空名不写 repo', async () => {
    listMock.mockResolvedValue([fakeMine('user-keep')])
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="rename-btn"]').trigger('click')
    // 空名：保存置灰
    const input = wrapper.find('[data-testid="rename-input"]')
    ;(input.element as HTMLInputElement).value = '   '
    await input.trigger('input')
    expect((wrapper.find('[data-testid="rename-ok"]').element as HTMLButtonElement).disabled).toBe(
      true,
    )
    // 取消
    await wrapper.find('[data-testid="rename-cancel"]').trigger('click')
    expect(wrapper.find('[data-testid="rename-dialog"]').exists()).toBe(false)
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('保存失败：toast 白话文案，不露错误码，弹层收起', async () => {
    saveMock.mockRejectedValue({ code: 'TEMPLATE_SAVE_FAIL', message: 'save fail' })
    listMock.mockResolvedValue([fakeMine('user-err')])
    const editor = useEditorStore()
    const wrapper = await mountPage()
    await wrapper.find('[data-testid="rename-btn"]').trigger('click')
    const input = wrapper.find('[data-testid="rename-input"]')
    ;(input.element as HTMLInputElement).value = '新名字'
    await input.trigger('input')
    await wrapper.find('[data-testid="rename-ok"]').trigger('click')
    await flushPromises()
    expect(editor.toast).toBe('重命名失败，请重试')
    expect(editor.toast).not.toContain('TEMPLATE_SAVE_FAIL')
  })
})

describe('LibraryPage · FR-20 类型筛选（TC-070）：chips / 防误解小字 / 按类型空态', () => {
  /** 点第 n 个筛选 chip（顺序：全部/多列对比/单主体明细/价目清单/宽表矩阵） */
  async function clickChip(wrapper: ReturnType<typeof mount>, testid: string) {
    await wrapper.find(`[data-testid="filter-chip-${testid}"]`).trigger('click')
    await flushPromises()
  }

  it('chips 顺序：全部/多列对比/单主体明细/价目清单/宽表矩阵，默认「全部」选中', async () => {
    const wrapper = await mountPage()
    const chips = wrapper.findAll('[data-testid="type-filter"] .fchip')
    expect(chips.map((c) => c.text().trim())).toEqual([
      '全部',
      '多列对比',
      '单主体明细',
      '价目清单',
      '宽表矩阵',
    ])
    expect(
      (wrapper.find('[data-testid="filter-chip-all"]').element as HTMLButtonElement).classList.contains(
        'active',
      ),
    ).toBe(true)
  })

  it('点「价目清单」chip：系统段只剩价目卡、空白卡隐藏；我的模板段按类型空态', async () => {
    listMock.mockResolvedValue([fakeMine('user-cmp')]) // 我的模板是对比类
    const wrapper = await mountPage()
    await clickChip(wrapper, 'pricing')
    const presetSection = wrapper.findAll('section')[0]!
    const names = presetSection.findAll('article.card h3').map((h) => h.text())
    expect(names).toEqual(['价目清单'])
    // 空白专属卡在类型筛选下隐藏
    expect(wrapper.find('[data-testid="blank-card"]').exists()).toBe(false)
    // 我的模板段：该类为空 → 按类型空态（非报错样式）
    const mineEmpty = wrapper.find('[data-testid="mine-type-empty"]')
    expect(mineEmpty.exists()).toBe(true)
    expect(mineEmpty.text()).toContain('还没有存过价目清单模板')
    expect(mineEmpty.text()).toContain('另存为模板')
    // 「清空筛选」入口只在系统段空态出现（系统段有价目卡，不出现）
    expect(wrapper.find('[data-testid="clear-filter"]').exists()).toBe(false)
  })

  it('系统段筛选无结果：「没有这类模板」+ 清空筛选，点击后回「全部」', async () => {
    const library = useLibraryStore()
    // 构造一个 chips 可见但系统段无结果的类型：我的模板有 compare，仓库临时移除系统预设
    library.presets = library.presets.filter((t) => t.meta?.templateType !== 'compare')
    listMock.mockResolvedValue([fakeMine('user-cmp')])
    const wrapper = await mountPage()
    await clickChip(wrapper, 'compare')
    const empty = wrapper.find('[data-testid="preset-type-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('没有这类模板')
    expect(wrapper.find('[data-testid="clear-filter"]').exists()).toBe(true)
    await wrapper.find('[data-testid="clear-filter"]').trigger('click')
    await flushPromises()
    expect(
      (wrapper.find('[data-testid="filter-chip-all"]').element as HTMLButtonElement).classList.contains(
        'active',
      ),
    ).toBe(true)
    // 回「全部」后价目/矩阵卡与空白卡恢复
    expect(wrapper.find('[data-testid="blank-card"]').exists()).toBe(true)
  })

  it('防误解小字：价目卡「不会自动计算」、矩阵卡「首列固定」，对比/明细卡无小字', async () => {
    const wrapper = await mountPage()
    const hints = wrapper.findAll('[data-testid="tpl-hint"]').map((p) => p.text())
    expect(hints.some((h) => h.includes('行数由模板定好；小计请自己填写，不会自动计算'))).toBe(true)
    expect(hints.some((h) => h.includes('列多时左右滑动，首列固定'))).toBe(true)
    expect(hints).toHaveLength(2) // 仅价目 + 矩阵两类有防误解小字
  })
})
