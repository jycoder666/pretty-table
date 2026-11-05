<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import SlotHit from './SlotHit.vue'
import { usePlaceSession } from './placeSession'
import { classifyDragSlots, type DropTarget, type SlotTone } from './slotDnd'
import type { BlockType } from '@/core'

const props = defineProps<{
  targets: DropTarget[]
  hostLeft: number
  hostTop: number
  /** 已被区块占用的槽 */
  occupiedSlotIds?: string[]
}>()

const emit = defineEmits<{
  place: [slotId: string]
  cancel: []
  /** 直接点空槽：单类型立刻放入；多类型只提示去组件库选 */
  fill: [slotId: string, type: BlockType]
  hint: [message: string]
}>()

const session = usePlaceSession()

const occupied = computed(() => new Set(props.occupiedSlotIds ?? []))

const idleTargets = computed(() =>
  props.targets.filter((t) => {
    if (occupied.value.has(t.blockSlotId)) return false
    // 左栏标签贴在首列正文上，空闲时不盖一层虚框（拖入时才高亮）
    return !(t.accept.length === 1 && t.accept[0] === 'leftTag')
  }),
)

const dragChrome = computed(() => {
  const type = session.dragType.value
  if (!session.dragging.value || !type) return []
  const marks = classifyDragSlots({
    targets: props.targets,
    type,
    occupied: occupied.value,
    hoverId: session.hoverSlotId.value,
    relocating: session.relocating.value,
  })
  const byId = new Map(marks.map((m) => [m.blockSlotId, m]))
  return props.targets
    .filter((t) => byId.has(t.blockSlotId))
    .map((t) => ({ target: t, ...(byId.get(t.blockSlotId)!) }))
})

/**
 * BugFix（2026-11 全量门禁修复，tc094 复现 + diag 实证）：已占用可互换槽位的 droppable
 * 此前只在 hover 命中后才渲染——鸡生蛋死锁：dnd-kit 碰撞检测测不到未注册的 droppable，「拖到
 * 占用槽互换」在真实指针路径上永远 miss（dragChrome mid-drag 恒空 → operation.target 恒 null）。
 * 修复：占用且接受该类型的槽位在拖拽期间以隐形 hit 注册 droppable（视觉零变化），
 * hover 命中后由既有 chrome（replace 态「将互换」）承接可见高亮。
 */
const dragGhostTargets = computed(() => {
  const type = session.dragType.value
  if (!session.dragging.value || !type) return []
  return props.targets.filter(
    (t) =>
      t.accept.includes(type) &&
      occupied.value.has(t.blockSlotId) &&
      session.hoverSlotId.value !== t.blockSlotId,
  )
})

const placeTargets = computed(() => {
  if (!session.active.value || !session.blockType.value) return [] as DropTarget[]
  return props.targets.filter((t) => t.accept.includes(session.blockType.value!))
})

watch(
  () => [session.active.value, session.focusIndex.value, placeTargets.value.length] as const,
  async ([active]) => {
    if (!active) return
    await nextTick()
    const el = document.querySelector<HTMLElement>(
      `[data-pt-slot-index="${session.focusIndex.value}"]`,
    )
    el?.focus()
  },
)

function onSlotKeydown(e: KeyboardEvent, slotId: string) {
  if (!session.active.value) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    emit('place', slotId)
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault()
    session.stepFocus(1)
    return
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
    e.preventDefault()
    session.stepFocus(-1)
  }
}

function onSlotClick(slotId: string) {
  if (!session.active.value) return
  emit('place', slotId)
}

function onIdleClick(t: DropTarget) {
  if (t.accept.length === 1) {
    emit('fill', t.blockSlotId, t.accept[0]!)
    return
  }
  emit('hint', '从左侧点选分区色条或分组标题，再点这个槽')
}

function captionFor(tone: SlotTone, accept: DropTarget['accept']): string {
  if (tone === 'pulse' || tone === 'replace') return ''
  if (accept.length === 1 && accept[0] === 'emphFooter') return '拖入强调注脚'
  if (accept.length === 1 && accept[0] === 'leftTag') return '拖入左栏标签'
  return '拖入区块'
}
</script>

<template>
  <div
    class="slot-overlay"
    :class="{
      interactive: session.active.value,
      dragging: session.dragging.value,
      'has-idle': !session.overlayVisible.value && idleTargets.length > 0,
    }"
  >
    <div class="sr-only" aria-live="polite">{{ session.liveAnnounce.value }}</div>

    <template v-if="session.dragging.value">
      <SlotHit
        v-for="item in dragChrome"
        :key="item.target.blockSlotId"
        :target="item.target"
        :index="-1"
        :focused="false"
        :tone="item.tone"
        :badge="item.badge"
        :caption="captionFor(item.tone, item.target.accept)"
        :host-left="hostLeft"
        :host-top="hostTop"
        :tabindex="-1"
      />
      <!-- BugFix（tc094）：占用槽位隐形 droppable——只为碰撞判定注册，不接管指针、无视觉 -->
      <SlotHit
        v-for="t in dragGhostTargets"
        :key="`ghost-${t.blockSlotId}`"
        :target="t"
        :index="-1"
        :focused="false"
        tone="guide"
        ghost
        :badge="''"
        :caption="''"
        :host-left="hostLeft"
        :host-top="hostTop"
        :tabindex="-1"
      />
    </template>

    <template v-else-if="session.active.value">
      <SlotHit
        v-for="(t, i) in placeTargets"
        :key="t.blockSlotId"
        :target="t"
        :index="i"
        :focused="session.focusIndex.value === i"
        tone="hot"
        :caption="captionFor('hot', t.accept)"
        :host-left="hostLeft"
        :host-top="hostTop"
        :tabindex="0"
        @keydown="(e: KeyboardEvent) => onSlotKeydown(e, t.blockSlotId)"
        @click="onSlotClick(t.blockSlotId)"
      />
    </template>

    <template v-else>
      <SlotHit
        v-for="t in idleTargets"
        :key="t.blockSlotId"
        :target="t"
        :index="-1"
        :focused="false"
        tone="idle"
        :caption="captionFor('idle', t.accept)"
        :host-left="hostLeft"
        :host-top="hostTop"
        :tabindex="-1"
        @click="onIdleClick(t)"
      />
    </template>
  </div>
</template>

<style scoped>
.slot-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: var(--pt-z-content);
}
.slot-overlay.interactive :deep(.slot-hit),
.slot-overlay.dragging :deep(.slot-hit),
.slot-overlay.has-idle :deep(.slot-hit) {
  pointer-events: auto;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
