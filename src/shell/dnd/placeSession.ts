import { computed, ref, shallowRef } from 'vue'
import type { BlockType } from '@/core'
import {
  announce,
  confirmPlace,
  enterPlaceMode,
  idlePlaceMode,
  moveFocus,
  type PlaceMode,
} from './placeMode'
import type { DropTarget } from './slotDnd'

/** Shared place / drag chrome state for editor shell (not Pinia — local to DnD). */
const place = shallowRef<PlaceMode>(idlePlaceMode())
const dragging = ref(false)
const liveAnnounce = ref('')
const catalogTargets = shallowRef<DropTarget[]>([])

export function usePlaceSession() {
  const active = computed(() => place.value.active)
  const blockType = computed(() => place.value.blockType)
  const focusIndex = computed(() => place.value.focusIndex)
  const targets = computed(() => place.value.targets)
  const overlayVisible = computed(() => place.value.active || dragging.value)

  function setCatalogTargets(next: DropTarget[]) {
    catalogTargets.value = next
  }

  function startPlace(type: BlockType, allTargets?: DropTarget[]) {
    const pool = allTargets?.length ? allTargets : catalogTargets.value
    place.value = enterPlaceMode(type, pool)
    liveAnnounce.value = announce(place.value)
  }

  function cancelPlace() {
    place.value = idlePlaceMode()
    liveAnnounce.value = ''
  }

  function stepFocus(dir: 1 | -1) {
    if (!place.value.active) return
    place.value = moveFocus(place.value, dir)
    liveAnnounce.value = announce(place.value)
  }

  function takeConfirm(): { type: BlockType; slotId: string } | null {
    const intent = confirmPlace(place.value)
    if (!intent || intent.kind !== 'addBlock') return null
    const type = intent.block.type
    const slotId = intent.block.slotId
    place.value = idlePlaceMode()
    liveAnnounce.value = ''
    return { type, slotId }
  }

  function setDragging(on: boolean) {
    dragging.value = on
  }

  return {
    place,
    active,
    blockType,
    focusIndex,
    targets,
    catalogTargets,
    dragging,
    overlayVisible,
    liveAnnounce,
    setCatalogTargets,
    startPlace,
    cancelPlace,
    stepFocus,
    takeConfirm,
    setDragging,
  }
}
