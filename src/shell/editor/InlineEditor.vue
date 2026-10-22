<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { Align } from '@/core'
import type { CellRect } from '../dnd/slotDnd'

/**
 * WP3 就地编辑浮层：双击单元格（或直接键入）在格子上开输入框。
 * 位置由渲染核权威几何给出（滚动时随视口重算，PreviewHost 负责跟随）；
 * 提交走既有文字会话（一次会话一步撤销）。
 *
 * 键位：Enter 提交并下移 / Shift+Enter 提交留在本格 / Tab 提交并右移 /
 * Shift+Tab 提交并左移 / Esc 取消 / 失焦提交。
 */
const props = defineProps<{
  rect: CellRect
  value: string
  align: Align
  /** 直接键入进入编辑：光标落到末尾（不整体选中，避免下一个字符覆盖刚敲的字） */
  typedEntry?: boolean
}>()

const emit = defineEmits<{
  commit: [text: string, move: 'down' | 'right' | 'left' | 'none']
  cancel: []
}>()

const input = ref<HTMLInputElement | null>(null)
/** 取消/提交后 blur 会再触发一次提交，用 settled 挡住 */
let settled = false

/**
 * VTable 双击时会调它内部隐藏输入框（`.table-focus-control`）的 `select()`，
 * 而 `select()` 会把焦点抢过去——我们的输入框刚 focus 就被 blur。
 * 判定这类「抢焦点」的失焦：抢回来，而不是当成用户点了别处。
 */
function isVTableFocusSteal(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return Boolean(el?.classList?.contains('table-focus-control'))
}

function focusSelf() {
  const el = input.value
  if (!el || settled) return
  el.focus()
  if (props.typedEntry) el.setSelectionRange(el.value.length, el.value.length)
  else el.select()
}

onMounted(async () => {
  await nextTick()
  focusSelf()
  // 渲染器的抢焦点发生在它自己的双击处理里，可能晚于本组件挂载：事件派发结束后再确认一次
  setTimeout(focusSelf, 0)
})

function commit(move: 'down' | 'right' | 'left' | 'none') {
  if (settled) return
  settled = true
  emit('commit', input.value?.value ?? '', move)
}

function cancel() {
  if (settled) return
  settled = true
  emit('cancel')
}

function onBlur(ev: FocusEvent) {
  if (isVTableFocusSteal(ev.relatedTarget)) {
    focusSelf()
    return
  }
  commit('none')
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    commit(ev.shiftKey ? 'none' : 'down')
    return
  }
  if (ev.key === 'Tab') {
    ev.preventDefault()
    commit(ev.shiftKey ? 'left' : 'right')
    return
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancel()
  }
  // 其余按键（含方向键）交给输入框自身：编辑中方向键移动光标是预期行为
}
</script>

<template>
  <input
    ref="input"
    class="inline-editor"
    data-testid="inline-editor"
    :value="value"
    :style="{
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      textAlign: align,
    }"
    @keydown="onKeydown"
    @blur="onBlur"
    @click.stop
    @pointerdown.stop
    @dblclick.stop
  />
</template>

<style scoped>
.inline-editor {
  position: absolute;
  z-index: 5;
  box-sizing: border-box;
  margin: 0;
  padding: 0 8px;
  border: 2px solid var(--pt-primary);
  border-radius: 2px;
  background: var(--pt-paper);
  color: var(--pt-text);
  font: inherit;
  font-size: 13px;
  outline: none;
  box-shadow: 0 2px 10px rgb(0 0 0 / 12%);
}
</style>
