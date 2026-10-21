<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useDroppable } from '@dnd-kit/vue'
import type { DropTarget } from './slotDnd'

const props = defineProps<{
  target: DropTarget
  index: number
  focused: boolean
  /** R-1：拖拽进行中 accept 不匹配 → 弱化（低透明度虚框） */
  dimmed?: boolean
  hostLeft: number
  hostTop: number
  tabindex: number
}>()

defineEmits<{
  keydown: [KeyboardEvent]
  click: []
}>()

const el = ref<HTMLButtonElement | null>(null)
useDroppable({
  id: toRef(() => props.target.blockSlotId),
  element: el,
  data: toRef(() => ({
    blockSlotId: props.target.blockSlotId,
    accept: props.target.accept,
  })),
})

const style = () => {
  const r = props.target.rect
  return {
    left: `${r.left - props.hostLeft}px`,
    top: `${r.top - props.hostTop}px`,
    width: `${r.width}px`,
    height: `${Math.max(r.height, 28)}px`,
  }
}
</script>

<template>
  <button
    ref="el"
    type="button"
    class="slot-hit"
    :class="{ focused, dim: dimmed }"
    role="button"
    :tabindex="tabindex"
    :data-pt-slot-index="index"
    :data-pt-slot-id="target.blockSlotId"
    :style="style()"
    :aria-label="`槽位 ${target.blockSlotId}`"
    @keydown="$emit('keydown', $event)"
    @click="$emit('click')"
  />
</template>

<style scoped>
.slot-hit {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 2px dashed var(--pt-primary, #2f5b9a);
  border-radius: 6px;
  background: color-mix(in srgb, var(--pt-primary, #2f5b9a) 12%, transparent);
  cursor: pointer;
  box-sizing: border-box;
}
.slot-hit.focused,
.slot-hit:focus-visible {
  outline: 2px solid var(--pt-primary, #2f5b9a);
  outline-offset: 1px;
  background: color-mix(in srgb, var(--pt-primary, #2f5b9a) 22%, transparent);
}
/* R-1：不可放置（accept 不匹配）→ 低透明度弱化虚框 */
.slot-hit.dim {
  opacity: 0.35;
  border-color: var(--pt-border, #c5d0de);
  background: transparent;
}
</style>
