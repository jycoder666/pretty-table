<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  canAddCol,
  canAddRow,
  LIMITS,
  moveBlockGate,
  moveGate,
  previewStructuralImpact,
  previewStructuralRange,
  visibleRowCount,
  type Result,
} from '@/core'
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
 * T02 区间化：structureMenuState.rangeEnd 存在时菜单作用于区间 [index, rangeEnd]——
 * N=1 文案与 testid 与现状完全一致（tc095 零破坏）；N>1 显示「前插 N 行 / 删除所选 N 行」，
 * move 项调 moveBlockGate（整块移动），remove 项调 previewStructuralRange（区间聚合口径）。
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
  const rangeEnd = structureMenuState.rangeEnd
  // T02：区间归一化；rangeEnd 无效（null 或等于 index）→ 单选，走既有单点口径
  const isRange = rangeEnd !== null && rangeEnd !== index
  const lo = isRange ? Math.min(index, rangeEnd) : index
  const hi = isRange ? Math.max(index, rangeEnd) : index
  const n = hi - lo + 1
  const isRow = axis === 'row'
  const lockedNow = editor.pastePending
  const tip = (ok: boolean, okTip: string, blockTip: string): string =>
    lockedNow ? LOCK_TIP : ok ? okTip : blockTip
  const unit = isRow ? '行' : '列'
  const addOk = isRange
    ? isRow
      ? visibleRowCount(inst) + (n - 1) < LIMITS.maxRows
      : inst.layout.colCount + (n - 1) < LIMITS.maxCols
    : isRow
      ? canAddRow(inst)
      : canAddCol(inst)
  const insert = (before: boolean) =>
    isRange
      ? isRow
        ? actions.insertRowsAt(before ? lo : hi, before, n)
        : actions.insertColsAt(before ? lo : hi, before, n)
      : isRow
        ? actions.insertRowAt(index, before)
        : actions.insertColAt(index, before)
  const limitTip = isRow ? '最多 20 行，加不下了' : '最多 12 列，加不下了'
  const ins = (before: boolean): MenuItem => ({
    key: before ? 'before' : 'after',
    label: n > 1 ? `${before ? '前' : '后'}插 ${n} ${unit}` : `${before ? '前' : '后'}插一${unit}`,
    disabled: lockedNow || !addOk,
    reason: tip(
      addOk,
      `在这一${unit}${before ? '前' : '后'}面插入${n > 1 ? ` ${n} ${unit}` : `一${unit}`}`,
      limitTip,
    ),
    run: () => void insert(before),
  })
  // 移动项：单选走既有 moveGate ±1；区间走 moveBlockGate（整块一次置换）
  const move = (delta: -1 | 1, gate: Result<true>, blockGate: Result<true>): MenuItem => {
    const word = isRow ? (delta < 0 ? '上移' : '下移') : delta < 0 ? '左移' : '右移'
    const okTip = `把这一${unit}往${isRow ? (delta < 0 ? '上' : '下') : delta < 0 ? '左' : '右'}挪一格`
    const g = isRange ? blockGate : gate
    return {
      key: delta < 0 ? 'prev' : 'next',
      label: word,
      disabled: lockedNow || !g.ok,
      reason: tip(g.ok, okTip, g.ok ? '' : g.error.message),
      run: () => {
        if (isRange) actions.moveBlockBy(axis, lo, n, delta)
        else actions.moveBy(axis, index, delta)
      },
    }
  }
  if (!isRange) {
    const impact = previewStructuralImpact(inst, axis, index)
    const prev = moveGate(inst, isRow ? 0 : 1, index, index - 1)
    const next = moveGate(inst, isRow ? 0 : 1, index, index + 1)
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
      move(-1, prev, prev),
      move(1, next, next),
    ]
  }
  const impact = previewStructuralRange(inst, axis, lo, hi)
  const prev = moveBlockGate(inst, isRow ? 0 : 1, lo, n, lo - 1)
  const next = moveBlockGate(inst, isRow ? 0 : 1, lo, n, lo + 1)
  return [
    ins(true),
    ins(false),
    {
      key: 'remove',
      label: `删除所选 ${n} ${unit}`,
      disabled: lockedNow || !!impact.blockedReason,
      reason: lockedNow ? LOCK_TIP : (impact.blockedReason ?? `删除第 ${lo + 1}–${hi + 1} ${unit}`),
      run: () => void actions.removeRange(axis, lo, hi),
    },
    move(-1, prev, prev),
    move(1, next, next),
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
  z-index: var(--pt-z-toolbar);
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
  /* T10：hover 轻反馈具名过渡（120~150ms，禁 all） */
  transition: background 130ms ease, color 130ms ease;
}
.menu-item.focused {
  background: var(--pt-tag);
  color: var(--pt-primary);
}
@media (hover: hover) {
  .menu-item:hover:not(:disabled) {
    background: var(--pt-tag);
    color: var(--pt-primary);
  }
}
.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* T11：窄视口/触屏菜单项命中高 ≥44px（桌面布局零变化） */
@media (hover: none), (max-width: 480px) {
  .menu-item {
    min-height: 44px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .menu-item {
    transition: none;
  }
}
/* 禁用原因内联展示（白话；E4 守卫不走裸 title） */
.menu-reason {
  font-size: 11px;
  color: var(--pt-muted);
}
</style>
