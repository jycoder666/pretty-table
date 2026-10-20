import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { COMPARE_ALPHA_V1, cloneInstance, type TemplateInstance } from '@/core'
import { useLibraryStore } from '../stores/library'
import { useEditorStore } from '../stores/editor'
import LibraryPage from './LibraryPage.vue'

/** repo 层 mock（PX-01）：不依赖 IndexedDB，删除走可控的 remove mock */
const { removeMock, listMock } = vi.hoisted(() => ({
  removeMock: vi.fn(),
  listMock: vi.fn(),
}))

vi.mock('../repo/idbTemplateRepo', () => ({
  createIdbTemplateRepo: () => ({
    list: listMock,
    get: vi.fn(async () => null),
    save: vi.fn(async () => {}),
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
})

/** 取第 n 张「使用此模板」按钮（库页含系统预设与我的模板两个分区） */
function useBtnAt(wrapper: ReturnType<typeof mount>, n: number) {
  return wrapper.findAll('button').filter((b) => b.text().includes('使用此模板'))[n]!
}

describe('LibraryPage · 换模板替换确认（PX-02 / FR-10）', () => {
  it('编辑台有未保存改动时换模板：弹确认，确认后切换', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.setSlotText('obj.name.a', '未保存的方案')
    expect(editor.dirty).toBe(true)
    const wrapper = await mountPage()
    // 点第 2 张预设，避免与当前打开的 compare-alpha-v1 同模板
    await useBtnAt(wrapper, 1).trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(confirmSpy.mock.calls[0]?.[0]).toContain('未另存的修改会丢失')
    expect(editor.current?.templateId).not.toBe(COMPARE_ALPHA_V1.templateId)
  })

  it('有改动但取消确认：不切换', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.setSlotText('obj.name.a', '未保存的方案')
    const wrapper = await mountPage()
    await useBtnAt(wrapper, 1).trigger('click')
    await flushPromises()
    expect(editor.current?.templateId).toBe(COMPARE_ALPHA_V1.templateId)
  })

  it('无未保存改动：直接切换，不弹确认', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COMPARE_ALPHA_V1))
    editor.markSaved()
    const wrapper = await mountPage()
    await useBtnAt(wrapper, 1).trigger('click')
    await flushPromises()
    expect(confirmSpy).not.toHaveBeenCalled()
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const editor = useEditorStore()
    listMock.mockResolvedValueOnce([fakeMine('user-x1')]).mockResolvedValue([])
    const wrapper = await mountPage()
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    expect(removeMock).toHaveBeenCalledWith('user-x1')
    expect(useLibraryStore().mine).toHaveLength(0)
    expect(editor.toast).toBe('已删除')
  })

  it('取消确认：不删除', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const library = useLibraryStore()
    listMock.mockResolvedValue([fakeMine('user-x1')])
    const wrapper = await mountPage()
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    expect(removeMock).not.toHaveBeenCalled()
    expect(library.mine).toHaveLength(1)
  })

  it('删除失败（故障注入 TEMPLATE_DELETE_FAIL）：toast 白话文案，不露错误码', async () => {
    removeMock.mockRejectedValue({ code: 'TEMPLATE_DELETE_FAIL', message: 'remove fail' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const editor = useEditorStore()
    listMock.mockResolvedValue([fakeMine('user-x1')])
    const wrapper = await mountPage()
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    expect(removeMock).toHaveBeenCalledWith('user-x1')
    expect(editor.toast).toBe('删除失败，请重试')
    expect(editor.toast).not.toContain('TEMPLATE_DELETE_FAIL')
  })
})
