<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useDroppable } from '@dnd-kit/vue'
import type { DropTarget, SlotTone } from './slotDnd'

const props = withDefaults(
  defineProps<{
    target: DropTarget
    index: number
    focused: boolean
    tone?: SlotTone
    badge?: string
    caption?: string
    hostLeft: number
    hostTop: number
    tabindex: number
  }>(),
  { tone: 'guide', badge: '', caption: '' },
)

defineEmits<{
  keydown: [KeyboardEvent]
  click: []
}>()

const el = ref<HTMLButtonElement | null>(null)
useDroppable({
  id: toRef(() => props.target.blockSlotId),
  element: el,
  disabled: toRef(() => props.tone === 'idle'),
  data: toRef(() => ({
    blockSlotId: props.target.blockSlotId,
    accept: props.target.accept,
  })),
})

const style = () => {
  const r = props.target.rect
  return {
    left: `${r.left + props.hostLeft}px`,
    top: `${r.top + props.hostTop}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  }
}

const aria = () => {
  if (props.badge) return props.badge
  if (props.caption) return props.caption
  return '表内槽位'
}
</script>

<template>
  <button
    ref="el"
    type="button"
    class="slot-hit"
    :class="[tone, { focused }]"
    role="button"
    :tabindex="tabindex"
    :data-pt-slot-index="index"
    :data-pt-slot-id="target.blockSlotId"
    :data-pt-slot-tone="tone"
    :style="style()"
    :aria-label="aria()"
    @keydown="$emit('keydown', $event)"
    @click="$emit('click')"
  >
    <span v-if="badge" class="badge">{{ badge }}</span>
    <span v-else-if="caption" class="cap">{{ caption }}</span>
  </button>
</template>

<style scoped>
.slot-hit {
  position: absolute;
  margin: 0;
  padding: 0;
  border: 2px dashed var(--pt-border, #c5d0de);
  border-radius: 6px;
  background: transparent;
  color: var(--pt-muted, #6b7280);
  font-size: 12px;
  cursor: pointer;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 160ms ease, border-color 160ms ease;
}
.slot-hit.idle {
  cursor: pointer;
  color: #8b95a5;
  background: color-mix(in srgb, var(--pt-paper, #fff) 55%, transparent);
}
.slot-hit.guide {
  border-color: var(--pt-border, #c5d0de);
  background: color-mix(in srgb, var(--pt-primary, #2f5b9a) 6%, transparent);
}
.slot-hit.hot,
.slot-hit.focused,
.slot-hit:focus-visible {
  border-color: var(--pt-primary, #2f5b9a);
  background: color-mix(in srgb, var(--pt-primary, #2f5b9a) 18%, transparent);
  outline: none;
}
.slot-hit.replace {
  border-color: var(--pt-primary, #2f5b9a);
  border-style: solid;
  background: color-mix(in srgb, var(--pt-primary, #2f5b9a) 14%, transparent);
}
.slot-hit.pulse {
  border-color: #c24141;
  background: color-mix(in srgb, #c24141 16%, transparent);
  animation: pt-reject 420ms ease 1;
}
.badge,
.cap {
  pointer-events: none;
  padding: 0 6px;
  line-height: 1.2;
}
.badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--pt-primary, #2f5b9a);
  background: var(--pt-paper, #fff);
  border-radius: 999px;
  padding: 2px 8px;
}
@keyframes pt-reject {
  0% { transform: none; }
  40% { box-shadow: 0 0 0 3px color-mix(in srgb, #c24141 45%, transparent); }
  100% { box-shadow: none; }
}
@media (prefers-reduced-motion: reduce) {
  .slot-hit,
  .slot-hit.pulse {
    animation: none;
    transition: none;
  }
}
</style>
