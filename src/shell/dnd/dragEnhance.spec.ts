import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, type VNode } from 'vue'
import { DragDropProvider } from '@dnd-kit/vue'
import SlotOverlay from './SlotOverlay.vue'
import BlockDraggable from './BlockDraggable.vue'
import { usePlaceSession } from './placeSession'
import { pointerOnlySensors } from './dndKitAdapter'
import type { BlockType } from '@/core'

/**
 * R-1 表内拖拽优化（交互升级 T04，纯壳层）：
 * - 拖起后 accept 匹配 targets 全部高亮、不匹配弱化（低透明度虚框）
 * - 松手（setDragging(false)）回到空态
 * - 拖拽把手可见（⠿ + aria-label「拖动区块」）
 */
function target(id: string, accept: BlockType[]) {
  return { blockSlotId: id, rect: new DOMRect(0, 0, 100, 30), accept }
}

/** dnd-kit useDraggable/useDroppable 需要 Provider 上下文，测试内包一层 */
function withProvider(render: () => VNode) {
  return defineComponent({
    setup() {
      return () => h(DragDropProvider, { sensors: pointerOnlySensors }, { default: render })
    },
  })
}

describe('SlotOverlay · R-1 拖拽高亮 / 弱化', () => {
  beforeEach(() => {
    const session = usePlaceSession()
    session.setDragging(false)
    session.cancelPlace()
  })

  it('拖拽进行中：accept 匹配 targets 全部可见高亮，不匹配弱化（dim）', async () => {
    const session = usePlaceSession()
    const wrapper = mount(
      withProvider(() =>
        h(SlotOverlay, {
          targets: [target('gap-1', ['sectionBar']), target('footer-1', ['emphFooter'])],
          hostLeft: 0,
          hostTop: 0,
        }),
      ),
    )
    session.setDragging(true, 'emphFooter')
    await wrapper.vm.$nextTick()
    const hits = wrapper.findAll('.slot-hit')
    expect(hits).toHaveLength(2)
    expect(hits[0]!.classes()).toContain('dim')
    expect(hits[1]!.classes()).not.toContain('dim')
    // 松手回空态
    session.setDragging(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.slot-hit')).toHaveLength(0)
    wrapper.unmount()
  })

  it('无拖拽且无待放置时不渲染任何 target', () => {
    const wrapper = mount(
      withProvider(() =>
        h(SlotOverlay, {
          targets: [target('gap-1', ['sectionBar']), target('footer-1', ['emphFooter'])],
          hostLeft: 0,
          hostTop: 0,
        }),
      ),
    )
    expect(wrapper.findAll('.slot-hit')).toHaveLength(0)
    wrapper.unmount()
  })
})

describe('BlockDraggable · R-1 拖拽把手', () => {
  it('把手可见 + aria-label「拖动区块」；启用态卡片可拖', () => {
    const wrapper = mount(
      withProvider(() =>
        h(BlockDraggable, {
          type: 'emphFooter',
          label: '强调注脚',
          hint: '拖入表底注脚槽',
          active: false,
        }),
      ),
    )
    const handle = wrapper.find('.handle')
    expect(handle.exists()).toBe(true)
    expect(handle.attributes('aria-label')).toBe('拖动区块')
    expect(handle.text()).toContain('⠿')
    expect(wrapper.find('li').attributes('aria-disabled')).toBe('false')
    wrapper.unmount()
  })

  it('把手随卡片存在（保留整卡拖拽手势，不缩热区）', () => {
    const wrapper = mount(
      withProvider(() =>
        h(BlockDraggable, {
          type: 'sectionBar',
          label: '分区色条',
          hint: '拖入表内虚线槽',
          active: false,
        }),
      ),
    )
    expect(wrapper.find('.handle').exists()).toBe(true)
    wrapper.unmount()
  })
})
