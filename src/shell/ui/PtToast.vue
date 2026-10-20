<script setup lang="ts">
defineProps<{ message: string | null }>()
</script>

<template>
  <div v-if="message" class="pt-toast" role="status" aria-live="polite">{{ message }}</div>
</template>

<style scoped>
.pt-toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  background: var(--pt-primary);
  color: var(--pt-header-text);
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 80;
  box-shadow: 0 6px 20px rgb(0 0 0 / 16%);
  animation: in 150ms ease;
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
