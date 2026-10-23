<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { canAddCol, canAddRow, moveGate, previewStructuralImpact } from '@/core'
import { useEditorStore } from '../stores/editor'
import { railItemViewportRect } from './railGeometry'
import {
  closeStructureMenu,
  returnFocusToCanvas,
  structureMenuState,
} from './structureMenu'
import { useStructureActions } from './useStructureActions'

/**
 * 结构菜单浮层（增量设计 A2）：前插/后插/删除/上移/下移（或左移/右移），
 * 每项带禁用原因（title + 置灰）；鼠标（轨道 …）与键盘（Shift+F10）共用同一套（UX-S09）。
 * position:fixed 定位（锚点由 railGeometry 算出）；按需渲染（关闭即卸载，控体积）。
 * 键盘焦点管理：打开聚焦首项、↑↓ 移动、Enter 执行、Esc 关闭并归还焦点到画布。
 */
const editor = useEditorStore()
const actions = useStructureActions()
const root = ref<HTMLElement | null>(null)
const focusIndex = ref(0)

const LOCK_TIP = '请先确认或取消粘贴'

interface MenuItem {
  key: string
  label: string
  disabled: boolean
  reason: string
  run: () => void
}

const items = computed<MenuItem[]>(() => {
  const inst = editor.current
  if (!inst || !structureMenuState.open) return []
  const { axis, index } = structureMenuState
  const isRow = axis === 'row'
  const lockedNow = editor.pastePending
  const tip = (ok: boolean, okTip: string, blockTip: string): string =>
    lockedNow ? LOCK_TIP : ok ? okTip : blockTip
  const unit = isRow ? '行' : '列'
  const impact = previewStructuralImpact(inst, axis, index)
  const prev = moveGate(inst, isRow ? 0 : 1, index, index - 1)
  const next = moveGate(inst, isRow ? 0 : 1, index, index + 1)
  const addOk = isRow ? canAddRow(inst) : canAddCol(inst)
  const insert = (before: boolean) =>
    isRow ? actions.insertRowAt(index, before) : actions.insertColAt(index, before)
  const limitTip = isRow ? '最多 20 行，加不下了' : '最多 12 列，加不下了'
  const ins = (before: boolean): MenuItem => ({
    key: before ? 'before' : 'after',
    label: `${before ? '前' : '后'}插一${unit}`,
    disabled: lockedNow || !addOk,
    reason: tip(addOk, `在这一${unit}${before ? '前' : '后'}面插入一${unit}`, limitTip),
    run: () => void insert(before),
  })
  const move = (delta: -1 | 1, gate: ReturnType<typeof moveGate>): MenuItem => {
    const word = isRow ? (delta < 0 ? '上移' : '下移') : delta < 0 ? '左移' : '右移'
    const okTip = `把这一${unit}往${isRow ? (delta < 0 ? '上' : '下') : delta < 0 ? '左' : '右'}挪一格`
    return {
      key: delta < 0 ? 'prev' : 'next',
      label: word,
      disabled: lockedNow || !gate.ok,
      reason: tip(gate.ok, okTip, gate.ok ? '' : gate.error.message),
      run: () => actions.moveBy(axis, index, delta),
    }
  }
  return [
    ins(true),
    ins(false),
    {
      key: 'remove',
      label: `删除该${unit}`,
      disabled: lockedNow || !!impact.blockedReason,
      reason: lockedNow ? LOCK_TIP : (impact.blockedReason ?? `删除第 ${index + 1} ${unit}`),
      run: () => void actions.removeAt(axis, index),
    },
    move(-1, prev),
    move(1, next),
  ]
})

const MENU_W = 148
const MENU_H_EST = 200

/** 菜单锚点：行菜单贴行轨道项右缘（host 左缘），列菜单贴列轨道项下缘（host 上缘） */
const pos = computed(() => {
  const inst = editor.current
  if (!inst || !structureMenuState.open) return null
  const r = railItemViewportRect(inst, structureMenuState.axis, structureMenuState.index)
  if (!r) return null
  const left =
    structureMenuState.axis === 'row' ? r.left + r.width : Math.min(r.left, window.innerWidth - MENU_W - 8)
  const top =
    structureMenuState.axis === 'col' ? r.top + r.height : Math.min(r.top, window.innerHeight - MENU_H_EST - 8)
  return { left: Math.max(8, left), top: Math.max(8, top) }
})

/** 打开即聚焦首个可用项；焦点序随可用项集合收敛 */
function focusEnabled(dir: 1 | -1): void {
  const buttons = root.value?.querySelectorAll<HTMLButtonElement>('button.menu-item:not(:disabled)')
  if (!buttons || buttons.length === 0) return
  focusIndex.value = (focusIndex.value + dir + buttons.length) % buttons.length
  buttons[focusIndex.value]?.focus()
}

function onOpen() {
  focusIndex.value = 0
  void nextTick(() => {
    const first = root.value?.querySelector<HTMLButtonElement>('button.menu-item:not(:disabled)')
    first?.focus()
  })
}

watch(
  () => structureMenuState.open,
  (open) => {
    if (open) onOpen()
  },
)

// A8：已开菜单在 pastePending 置真时自动关闭（粘贴预览期菜单不可达）
watch(
  () => editor.pastePending,
  (pending) => {
    if (pending && structureMenuState.open) closeStructureMenu()
  },
)

function runItem(it: MenuItem) {
  if (it.disabled) return
  closeStructureMenu()
  returnFocusToCanvas()
  it.run()
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ev.stopPropagation()
    closeStructureMenu()
    returnFocusToCanvas()
    return
  }
  if (ev.key === 'ArrowDown') {
    ev.preventDefault()
    focusEnabled(1)
    return
  }
  if (ev.key === 'ArrowUp') {
    ev.preventDefault()
    focusEnabled(-1)
  }
}
</script>

<template>
  <div
    v-if="structureMenuState.open && pos"
    ref="root"
    class="struct-menu"
    role="menu"
    :aria-label="structureMenuState.axis === 'row' ? '行操作菜单' : '列操作菜单'"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @keydown="onKeydown"
    @click.stop
  >
    <button
      v-for="(it, i) in items"
      :key="it.key"
      type="button"
      role="menuitem"
      class="menu-item"
      :class="{ focused: i === focusIndex }"
      :disabled="it.disabled"
      :aria-label="it.disabled ? `${it.label}：${it.reason}` : it.label"
      :data-testid="`menu-${structureMenuState.axis}-${it.key}`"
      @click="runItem(it)"
      @focus="focusIndex = i"
      @mouseenter="focusIndex = i"
    >
      {{ it.label }}<span v-if="it.disabled" class="menu-reason">（{{ it.reason }}）</span>
    </button>
  </div>
</template>

<style scoped>
.struct-menu {
  position: fixed;
  z-index: 60;
  display: flex;
  flex-direction: column;
  min-width: 148px;
  padding: 4px;
  background: var(--pt-paper);
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 16%);
}
.menu-item {
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 13px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.menu-item.focused,
.menu-item:hover:not(:disabled) {
  background: var(--pt-tag);
  color: var(--pt-primary);
}
.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* 禁用原因内联展示（白话；E4 守卫不走裸 title） */
.menu-reason {
  font-size: 11px;
  color: var(--pt-muted);
}
</style>
