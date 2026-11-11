import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PropertyPanel from './PropertyPanel.vue'
import { useEditorStore } from '../stores/editor'
import { cloneInstance } from '@/core'

/** 课程表种子（tables/ 真实文件经 validate）——直接内联关键槽，避免文件路径依赖 */
const COURSE = {
  schemaVersion: '1.3' as const,
  templateId: 'user-test-course',
  themeId: 'T-C',
  zebraOn: false,
  highlight: { recommendCol: null },
  meta: { displayName: '课程表测试', templateType: 'blank' as const, origin: 'preset' as const },
  slots: {
    u1: { text: '周一', sub: 'MONDAY' },
    u2: { text: '数学', sub: '李老师 · 302', bg: '#d9e8d4', color: '#3e6b4f', align: 'center' as const },
  },
  blocks: [],
  layout: {
    rowCount: 2,
    colCount: 2,
    headerLevels: 1 as const,
    blockSlots: [],
    slotGrid: [
      ['u1', null],
      ['u2', null],
    ],
    style: { borderScheme: 'none' as const, headerShape: 'pill' as const, pillInsetV: 4 },
  },
  slotDefs: {},
  kpiCards: [],
}

describe('PropertyPanel · 槽位装饰字段编辑（Schema 1.5）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    document.body.innerHTML = ''
  })

  async function openWithCourse() {
    const pinia = createPinia()
    setActivePinia(pinia)
    const editor = useEditorStore()
    editor.openTemplate(cloneInstance(COURSE))
    // 选中数学格（逻辑 r1 c0）
    editor.selectedSlotId = 'u2'
    const wrapper = mount(PropertyPanel, { global: { plugins: [pinia] } })
    await wrapper.vm.$nextTick()
    return { wrapper, editor }
  }

  it('副行小字输入框显示模板自带 sub（李老师 · 302）', async () => {
    const { wrapper } = await openWithCourse()
    const sub = wrapper.find('#slot-sub')
    expect(sub.exists()).toBe(true)
    expect((sub.element as HTMLInputElement).value).toBe('李老师 · 302')
  })

  it('改主字不再丢失副行/逐格色（mergeSlotValue 装饰透传回归）', async () => {
    const { wrapper, editor } = await openWithCourse()
    const ta = wrapper.find('textarea')
    await ta.setValue('数学（改）')
    await wrapper.vm.$nextTick()
    const v = editor.current!.slots['u2'] as unknown as Record<string, unknown>
    expect(v.text).toBe('数学（改）')
    expect(v.sub).toBe('李老师 · 302')
    expect(v.bg).toBe('#d9e8d4')
    expect(v.color).toBe('#3e6b4f')
    expect(v.align).toBe('center')
  })

  it('改副行小字：一步生效且主字/颜色保留；清空即删除键', async () => {
    const { wrapper, editor } = await openWithCourse()
    const sub = wrapper.find('#slot-sub')
    await sub.setValue('王老师 · 303')
    await sub.trigger('change')
    await wrapper.vm.$nextTick()
    let v = editor.current!.slots['u2'] as unknown as Record<string, unknown>
    expect(v.sub).toBe('王老师 · 303')
    expect(v.text).toBe('数学')
    expect(v.bg).toBe('#d9e8d4')
    // 清空 → 删键
    await sub.setValue('')
    await sub.trigger('change')
    await wrapper.vm.$nextTick()
    v = editor.current!.slots['u2'] as unknown as Record<string, unknown>
    expect(v.sub).toBeUndefined()
  })

  it('同行尾注（unit）：text 槽可写可清', async () => {
    const { wrapper, editor } = await openWithCourse()
    const unit = wrapper.find('#slot-unit')
    expect(unit.exists()).toBe(true)
    await unit.setValue('主项')
    await unit.trigger('change')
    await wrapper.vm.$nextTick()
    let v = editor.current!.slots['u2'] as unknown as Record<string, unknown>
    expect(v.unit).toBe('主项')
    await unit.setValue('')
    await unit.trigger('change')
    await wrapper.vm.$nextTick()
    v = editor.current!.slots['u2'] as unknown as Record<string, unknown>
    expect(v.unit).toBeUndefined()
  })

  it('结构化槽（match/cells/champion）无通用文字区、纯文字写入被拒', async () => {
    const { wrapper, editor } = await openWithCourse()
    // 注入 match 槽
    editor.apply({
      kind: 'setSlot',
      slotId: 'u2',
      value: { match: { a: '甲队', sa: '2', b: '乙队', sb: '1', winA: true } },
    })
    await wrapper.vm.$nextTick()
    // 通用 textarea 不出现；专属编辑器出现
    expect(wrapper.find('[data-testid="slot-text"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="match-editor"]').exists()).toBe(true)
    // 纯文字写入被拒：结构数据原样保留
    editor.setSlotText('u2', '想覆盖它')
    await wrapper.vm.$nextTick()
    const v = editor.current!.slots['u2'] as unknown as { match?: { a: string } }
    expect(v.match?.a).toBe('甲队')
  })

  it('海报组：改大标题走 setPoster 意图（一步撤销）', async () => {
    const { editor } = await openWithCourse()
    // 面板海报组输入由 computed setter 驱动——直接模拟 setter 链：
    // 先确认 setPoster 意图在 store 可用（面板内同一 apply 通道）
    editor.apply({ kind: 'setPoster', poster: { title: '三年级 3 班 · 课程表', bg: 'dots' } })
    expect(editor.current!.poster?.title).toBe('三年级 3 班 · 课程表')
    // 撤销 → 回到无 poster
    editor.undo()
    expect(editor.current!.poster?.title).toBeUndefined()
  })
})
