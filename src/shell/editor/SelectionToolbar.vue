<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editor'
import { useMergeGates } from './useMergeGates'
import PtButton from '../ui/PtButton.vue'
import PtTooltip from '../ui/PtTooltip.vue'
import type { CellRect } from '../dnd/slotDnd'

/**
 * 选区工具条（WP1）：合并/拆分的历史入口只在右栏「结构」组里，而该组默认收起
 * → 功能等于藏起来。这里把三个动结构的动作直接贴到选区上方：
 *   合并选区 / 拆分 / 清空内容
 * 位置由 WP0 的渲染器权威几何（选区各格矩形）算出，横滚/冻结列/列宽变化后同样跟随。
 */

const props = defineProps<{
  /** 选区各格矩形（容器坐标系，来自渲染核或同源算术回退） */
  rects: CellRect[]
  /** 宿主可视高度（决定工具条放选区上方还是下方） */
  hostHeight: number
}>()

const editor = useEditorStore()
const { mergeGate, splitGate } = useMergeGates()

/** 选区外接框 → 工具条贴其上沿；上方空间不足则改贴下沿 */
const pos = computed(() => {
  if (props.rects.length === 0) return null
  let left = Number.POSITIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let right = 0
  let bottom = 0
  for (const r of props.rects) {
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.left + r.width)
    bottom = Math.max(bottom, r.top + r.height)
  }
  const BAR_H = 38
  const above = top >= BAR_H + 4
  return {
    left: Math.max(0, left),
    top: above ? top - BAR_H : bottom + 4,
    width: Math.max(0, right - left),
  }
})

// A6 双保险：整行/整列选择时隐藏（工具条是单元格语义，留旧选区会误导）
const visible = computed(
  () => Boolean(editor.selectionRange) && !editor.structuralSelection && pos.value !== null,
)
</script>

<template>
  <div
    v-if="visible && pos"
    class="selection-bar"
    data-testid="selection-bar"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @click.stop
  >
    <PtTooltip :text="mergeGate.reason || '把选中的格子合并成一格（保留左上格内容）'">
      <PtButton
        variant="ghost"
        :disabled="!mergeGate.ok"
        data-testid="selection-merge"
        @click="editor.mergeSelection()"
      >
        合并
      </PtButton>
    </PtTooltip>
    <PtTooltip :text="splitGate.reason || '把选中的合并区拆回格子'">
      <PtButton
        variant="ghost"
        :disabled="!splitGate.ok"
        data-testid="selection-split"
        @click="editor.splitSelection()"
      >
        拆分
      </PtButton>
    </PtTooltip>
    <PtTooltip text="清掉选区里的内容（格子保留）">
      <PtButton
        variant="ghost"
        :disabled="editor.pastePending"
        data-testid="selection-clear"
        @click="editor.clearSelection()"
      >
        清空内容
      </PtButton>
    </PtTooltip>
  </div>
</template>

<style scoped>
.selection-bar {
  position: absolute;
  z-index: 4;
  display: flex;
  gap: 2px;
  padding: 3px 6px;
  background: var(--pt-paper);
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
  white-space: nowrap;
}
</style>
