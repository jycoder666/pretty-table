<script setup lang="ts">
import PtButton from './PtButton.vue'

/**
 * 全局 Toast（增量设计 A9/T03）：纯文本口径不变（2600ms / 撤销型 5000ms 由 store 控制，
 * 组件无定时器）；新增 action 撤销按钮（flex 布局：文案 + 动作按钮）。
 * data-seq：连续同一句话时节点不重建，端到端用例靠它确认「这一次」提示已落地。
 */
defineProps<{
  message: string | null
  seq?: number
  /** 动作按钮（如「撤销」）；点击经 @action 冒泡给 store.runToastAction */
  action?: { label: string } | null
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <!-- data-seq：连续同一句话时节点不重建，端到端用例靠它确认「这一次」提示已落地 -->
  <div v-if="message" class="pt-toast" role="status" aria-live="polite" :data-seq="seq">
    <span class="pt-toast-msg">{{ message }}</span>
    <PtButton
      v-if="action"
      variant="ghost"
      class="pt-toast-action"
      data-testid="toast-action"
      @click="emit('action')"
    >
      {{ action.label }}
    </PtButton>
  </div>
</template>

<style scoped>
.pt-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--pt-primary);
  color: var(--pt-header-text);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 80;
  box-shadow: 0 6px 20px rgb(0 0 0 / 16%);
  animation: in 150ms ease;
}
/* 撤销按钮：主色底上保持可读（token 合成，无新色值） */
.pt-toast :deep(.pt-toast-action) {
  background: transparent;
  color: var(--pt-header-text);
  border-color: color-mix(in srgb, var(--pt-header-text) 55%, transparent);
  padding: 4px 10px;
  font-size: 13px;
}
@keyframes in {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .pt-toast {
    animation: none;
  }
}
</style>
