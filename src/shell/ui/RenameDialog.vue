<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PtButton from './PtButton.vue'

/**
 * PX-10：重命名小弹层（ConfirmDialog 同风格：遮罩 + 白底卡片 + 明确语义双按钮）。
 * - 打开时回填原名并聚焦全选，回车提交、Esc / 点遮罩取消
 * - 空名（纯空白）时「保存」置灰，不产生空名模板
 * - 提交只 emit 修剪后的名字；持久化与 toast 由调用方处理
 * 注：标题 prop 命名为 heading（非 title），与 E4「壳层无裸 title 属性」静态守卫口径一致。
 */
const props = defineProps<{
  /** 弹窗标题（如「重命名模板」） */
  heading: string
  /** 标题下的一句说明，可省 */
  message?: string
  /** 打开时回填的原名 */
  initialName: string
  /** 确认按钮文案，缺省「保存」 */
  confirmText?: string
}>()

const emit = defineEmits<{
  confirm: [name: string]
  cancel: []
}>()

const open = defineModel<boolean>('open', { default: false })

const name = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

const canSave = () => name.value.trim() !== ''

watch(open, async (v) => {
  if (!v) return
  name.value = props.initialName
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.select()
})

function onWinKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

function close() {
  open.value = false
  emit('cancel')
}

function submit() {
  const t = name.value.trim()
  if (!t) return
  open.value = false
  emit('confirm', t)
}

onMounted(() => window.addEventListener('keydown', onWinKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onWinKey))
</script>

<template>
  <div
    v-if="open"
    class="rename-overlay"
    data-testid="rename-overlay"
    @click.self="close"
  >
    <div
      class="rename-box"
      role="dialog"
      aria-modal="true"
      :aria-label="heading"
      data-testid="rename-dialog"
    >
      <h3 data-testid="rename-title">{{ heading }}</h3>
      <p v-if="message" class="msg" data-testid="rename-message">{{ message }}</p>
      <input
        ref="inputEl"
        v-model="name"
        class="rename-input"
        data-testid="rename-input"
        type="text"
        maxlength="40"
        :aria-label="heading"
        @keydown.enter.prevent="submit"
      />
      <div class="actions">
        <PtButton variant="ghost" data-testid="rename-cancel" @click="close">取消</PtButton>
        <PtButton :disabled="!canSave()" data-testid="rename-ok" @click="submit">
          {{ confirmText ?? '保存' }}
        </PtButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rename-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rename-box {
  background: var(--pt-surface);
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  padding: 20px;
  width: min(360px, 92vw);
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
}
.rename-box h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.msg {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--pt-muted);
  line-height: 1.6;
}
.rename-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  font: inherit;
  margin-bottom: 16px;
}
.rename-input:focus-visible {
  outline: 2px solid var(--pt-primary);
  outline-offset: 1px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
