<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import SlotHit from './SlotHit.vue'
import { usePlaceSession } from './placeSession'
import type { DropTarget } from './slotDnd'

const props = defineProps<{
  targets: DropTarget[]
  hostLeft: number
  hostTop: number
}>()

const emit = defineEmits<{
  place: [slotId: string]
  cancel: []
}>()

const session = usePlaceSession()

const visibleTargets = computed(() => {
  if (!session.overlayVisible.value) return [] as DropTarget[]
  if (session.active.value && session.blockType.value) {
    return props.targets.filter((t) => t.accept.includes(session.blockType.value!))
  }
  return props.targets.filter(
    (t) => t.accept.includes('sectionBar') || t.accept.includes('groupHeader'),
  )
})

watch(
  () => [session.active.value, session.focusIndex.value, visibleTargets.value.length] as const,
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
</script>

<template>
  <div class="slot-overlay" :class="{ interactive: session.overlayVisible.value }">
    <div class="sr-only" aria-live="polite">{{ session.liveAnnounce.value }}</div>
    <template v-if="session.overlayVisible.value">
      <SlotHit
        v-for="(t, i) in visibleTargets"
        :key="t.blockSlotId"
        :target="t"
        :index="i"
        :focused="session.active.value && session.focusIndex.value === i"
        :host-left="hostLeft"
        :host-top="hostTop"
        :tabindex="session.active.value ? 0 : -1"
        @keydown="(e) => onSlotKeydown(e, t.blockSlotId)"
        @click="onSlotClick(t.blockSlotId)"
      />
    </template>
  </div>
</template>

<style scoped>
.slot-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.slot-overlay.interactive :deep(.slot-hit) {
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
