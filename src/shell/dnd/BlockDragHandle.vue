<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useDraggable } from '@dnd-kit/vue'
import type { BlockType } from '@/core'
import PtTooltip from '../ui/PtTooltip.vue'
import type { CellRect } from './slotDnd'

/**
 * WP4 表内区块拖动把手：已占用槽位的区块行左侧浮一个小把手，
 * 拖到别的槽位即可移动；目标槽已被占用时两个区块互换（核内校验 accept）。
 * 位置由渲染核权威几何给出（滚动 / 列宽变化后跟随），与选区叠加层同一坐标系。
 * 提示走 PtTooltip（E4：壳层 .vue 不留裸 title 属性）；根节点是定位容器，
 * 父组件传下来的 class（如 inert）落在容器上。
 */
const props = defineProps<{
  blockId: string
  slotId: string
  type: BlockType
  label: string
  rect: CellRect
  hostLeft: number
  hostTop: number
}>()

const el = ref<HTMLButtonElement | null>(null)

useDraggable({
  id: toRef(() => `blk-${props.blockId}`),
  element: el,
  data: toRef(() => ({
    blockType: props.type,
    blockId: props.blockId,
    fromSlotId: props.slotId,
  })),
})

const style = () => ({
  left: `${props.rect.left - props.hostLeft + 4}px`,
  top: `${props.rect.top - props.hostTop + Math.max(0, (props.rect.height - 22) / 2)}px`,
})
</script>

<template>
  <div class="block-handle-wrap" :style="style()">
    <PtTooltip :text="`拖动${label}到别的槽位：空槽是移动，已有区块则互换`">
      <button
        ref="el"
        type="button"
        class="block-handle"
        :data-pt-block-id="blockId"
        :aria-label="`拖动${label}换位`"
      >
        ⠿
      </button>
    </PtTooltip>
  </div>
</template>

<style scoped>
.block-handle-wrap {
  position: absolute;
  z-index: 3;
}
.block-handle {
  width: 22px;
  height: 22px;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  background: var(--pt-paper);
  color: var(--pt-muted);
  font-size: 12px;
  line-height: 1;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.block-handle:hover,
.block-handle:focus-visible {
  border-color: var(--pt-primary);
  color: var(--pt-primary);
  outline: none;
}
</style>
