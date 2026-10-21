<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useDraggable } from '@dnd-kit/vue'
import type { BlockType } from '@/core'

const props = withDefaults(
  defineProps<{
    type: BlockType
    label: string
    enabled?: boolean
    hint: string
    active: boolean
  }>(),
  { enabled: true },
)

const emit = defineEmits<{
  activate: []
  keyPlace: []
}>()

const el = ref<HTMLLIElement | null>(null)

useDraggable({
  id: toRef(() => `lib-${props.type}`),
  element: el,
  disabled: toRef(() => !props.enabled),
  data: toRef(() => ({ blockType: props.type })),
})

function onClick() {
  if (!props.enabled) return
  emit('activate')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.enabled) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('keyPlace')
  }
}
</script>

<template>
  <li
    ref="el"
    :class="[{ disabled: !enabled, active }]"
    :tabindex="enabled ? 0 : -1"
    role="button"
    :aria-disabled="!enabled"
    :aria-describedby="`hint-${type}`"
    @click="onClick"
    @keydown="onKeydown"
  >
    <!-- E4：裸 title 删除——提示信息已由 aria-describedby + sr-only hint 覆盖，title 属重复 -->
    <!-- R-1 拖拽把手：整卡仍可拖（保留现有手势，不缩热区），把手提供视觉锚点 -->
    <span class="handle" role="img" aria-label="拖动区块">⠿</span>
    {{ label }}
    <span :id="`hint-${type}`" class="hint-sr">{{ hint }}</span>
  </li>
</template>

<style scoped>
li {
  border: 1px dashed var(--pt-border);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  cursor: grab;
  background: var(--pt-paper);
  list-style: none;
  outline: none;
}
li:focus-visible {
  box-shadow: 0 0 0 2px var(--pt-primary);
}
li.active {
  border-color: var(--pt-primary);
  background: var(--pt-tag);
}
li.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.handle {
  display: inline-block;
  margin-right: 6px;
  color: var(--pt-muted);
  cursor: grab;
  user-select: none;
}
li.disabled .handle {
  color: var(--pt-border);
  cursor: not-allowed;
}
.hint-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
