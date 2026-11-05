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
/* T09 补焦点环：与 main.css 全局 :focus-visible 同口径（此为共享按钮的显式兜底，防父级 outline 覆盖） */
.pt-btn:focus-visible {
  outline: 2px solid var(--pt-primary);
  outline-offset: 2px;
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
/* T11：窄视口/触屏命中区 ≥44×44（视觉允许随 min 撑高；桌面零变化） */
@media (hover: none), (max-width: 480px) {
  .pt-btn {
    min-width: 44px;
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pt-btn {
    transition: none;
  }
}
</style>
