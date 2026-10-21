<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PtButton from './PtButton.vue'
import { confirmState, settleConfirm } from './confirm'

/**
 * PX-05：统一确认弹窗（标题 + 描述 + 明确语义双按钮）。
 * - 确认按钮：实心主色；破坏性操作（danger）用现有 danger 色变量
 * - 取消按钮：ghost
 * - Esc / 点遮罩 = 取消；无新增依赖，样式复用 Dialog 覆盖层模式与 CSS 变量
 * - 最小焦点管理（无 reka Dialog 焦点陷阱，自制遮罩卡片自管）：
 *   打开聚焦确认按钮；关闭由 settleConfirm 把焦点归还触发元素（confirm.ts）
 */
const overlayRef = ref<HTMLElement | null>(null)

// post flush：v-if 渲染完成后同步聚焦，避免与快速关闭（Esc）产生焦点竞态
watch(
  () => confirmState.open,
  (open) => {
    if (!open) return
    overlayRef.value?.querySelector<HTMLElement>('[data-testid="confirm-ok"]')?.focus()
  },
  { flush: 'post' },
)

function onKey(e: KeyboardEvent) {
  if (!confirmState.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    settleConfirm(false)
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    v-if="confirmState.open"
    ref="overlayRef"
    class="confirm-overlay"
    data-testid="confirm-overlay"
    @click.self="settleConfirm(false)"
  >
    <div
      class="confirm-box"
      role="alertdialog"
      aria-modal="true"
      :aria-label="confirmState.title"
      data-testid="confirm-dialog"
    >
      <h3 data-testid="confirm-title">{{ confirmState.title }}</h3>
      <p data-testid="confirm-message">{{ confirmState.message }}</p>
      <div class="actions">
        <PtButton variant="ghost" data-testid="confirm-cancel" @click="settleConfirm(false)">
          {{ confirmState.cancelText }}
        </PtButton>
        <PtButton
          :variant="confirmState.danger ? 'danger' : 'primary'"
          data-testid="confirm-ok"
          @click="settleConfirm(true)"
        >
          {{ confirmState.confirmText }}
        </PtButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
}
.confirm-box {
  background: var(--pt-surface);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  padding: 20px;
  width: min(360px, 92vw);
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
}
.confirm-box h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.confirm-box p {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--pt-muted);
  line-height: 1.6;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
