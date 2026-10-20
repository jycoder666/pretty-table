<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger'
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', type: 'button' },
)

const emit = defineEmits<{ click: [e: MouseEvent] }>()
</script>

<template>
  <button class="pt-btn" :class="variant" :disabled="disabled" :type="type" @click="emit('click', $event)">
    <slot />
  </button>
</template>

<style scoped>
.pt-btn {
  border: 1px solid var(--pt-border);
  background: var(--pt-paper);
  color: #1a1a1a;
  border-radius: 8px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: transform 120ms ease, background 150ms ease;
}
.pt-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.pt-btn.primary {
  background: var(--pt-primary);
  color: var(--pt-header-text);
  border-color: transparent;
}
.pt-btn.ghost {
  background: transparent;
}
.pt-btn.danger {
  color: var(--pt-emphasis);
}
.pt-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .pt-btn {
    transition: none;
  }
}
</style>
