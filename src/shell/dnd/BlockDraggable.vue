<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useDraggable } from '@dnd-kit/vue'
import type { BlockType } from '@/core'

const props = defineProps<{
  type: BlockType
  label: string
  enabled: boolean
  hint: string
  active: boolean
}>()

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
    :title="hint"
    @click="onClick"
    @keydown="onKeydown"
  >
    {{ label }}
    <span :id="`hint-${type}`" class="hint-sr">{{ hint }}</span>
    <span v-if="!enabled" class="soon">即将开放</span>
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
.soon {
  display: block;
  font-size: 11px;
  color: #9ca3af;
}
.hint-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
