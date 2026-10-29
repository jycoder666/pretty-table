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
 * A 手感：拖中只弱引导合法空槽；当前命中变强高亮；非法槽不弱高亮。
 * 松手后回到空槽占位（「拖入…」），不是整层消失。
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

  it('拖中：合法空槽弱引导，非法槽不出现；命中后变强高亮；松手回到占位', async () => {
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
    let hits = wrapper.findAll('.slot-hit')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.attributes('data-pt-slot-id')).toBe('footer-1')
    expect(hits[0]!.attributes('data-pt-slot-tone')).toBe('guide')

    session.setHoverSlot('footer-1')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.slot-hit').attributes('data-pt-slot-tone')).toBe('hot')

    session.setHoverSlot('gap-1')
    await wrapper.vm.$nextTick()
    const tones = wrapper.findAll('.slot-hit').map((n) => n.attributes('data-pt-slot-tone'))
    expect(tones).toContain('pulse')
    expect(tones).toContain('guide')
    expect(tones.filter((t) => t === 'hot')).toHaveLength(0)

    session.setDragging(false)
    await wrapper.vm.$nextTick()
    hits = wrapper.findAll('.slot-hit')
    expect(hits).toHaveLength(2)
    expect(hits.every((n) => n.attributes('data-pt-slot-tone') === 'idle')).toBe(true)
    expect(wrapper.text()).toContain('拖入区块')
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
