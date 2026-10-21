<script setup lang="ts">
import { computed } from 'vue'
import { effectivePalette, type MergeRange, type TemplateInstance } from '@/core'

/**
 * PX-06 模板卡缩略图：纯 CSS 骨架示意（不用 canvas / 截图 / 新依赖）。
 * - 表头行数按 headerLevels、行列数按 slotGrid/colCount、合并区按 merges 占位
 * - 颜色取实例生效 Palette（resolveTheme 合成 + 角色覆盖）映射为局部 CSS 变量，
 *   零新增色值字面量
 * - 固定宽高比防跳动；数据量大时按比例截断渲染（最多示意 8 行 × 6 列），
 *   右下角画省略提示
 */
const props = defineProps<{ instance: TemplateInstance }>()

/** 最多示意的行 / 列数，超出部分截断并画省略提示 */
const MAX_ROWS = 8
const MAX_COLS = 6

interface ThumbCell {
  key: string
  header: boolean
  zebra: boolean
  colStart: number
  rowStart: number
  colSpan: number
  rowSpan: number
}

const layout = computed(() => props.instance.layout)
const headerLevels = computed(() => layout.value.headerLevels ?? 1)
const totalRows = computed(() => layout.value.slotGrid?.length ?? layout.value.rowCount)
const totalCols = computed(() => Math.max(layout.value.colCount, 0))
const showRows = computed(() => Math.min(totalRows.value, MAX_ROWS))
const showCols = computed(() => Math.min(totalCols.value, MAX_COLS))
const truncated = computed(
  () => totalRows.value > showRows.value || totalCols.value > showCols.value,
)

/** 生效配色 → 缩略图局部 CSS 变量（随主题与角色覆盖同步） */
const thumbVars = computed(() => {
  const p = effectivePalette(props.instance)
  return {
    '--th-primary': p.primary,
    '--th-header-text': p.headerText,
    '--th-zebra': p.zebra,
    '--th-border': p.border,
    '--th-paper': p.paper,
  }
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${showCols.value}, 1fr)`,
  gridTemplateRows: `repeat(${showRows.value}, 1fr)`,
}))

/** 合并区在示意范围内的占位：起点格跨行/跨列，其余格覆盖掉不渲染 */
const cells = computed<ThumbCell[]>(() => {
  const merges: MergeRange[] = [
    ...(layout.value.structuralMerges ?? []),
    ...(layout.value.merges ?? []),
  ]
  const covered = new Set<string>()
  const spanAt = new Map<string, { colSpan: number; rowSpan: number }>()
  for (const m of merges) {
    if (m.start[0] >= showRows.value || m.start[1] >= showCols.value) continue
    const colSpan = Math.max(Math.min(m.end[1], showCols.value - 1) - m.start[1] + 1, 1)
    const rowSpan = Math.max(Math.min(m.end[0], showRows.value - 1) - m.start[0] + 1, 1)
    spanAt.set(`${m.start[0]},${m.start[1]}`, { colSpan, rowSpan })
    for (let r = m.start[0]; r <= Math.min(m.end[0], showRows.value - 1); r++) {
      for (let c = m.start[1]; c <= Math.min(m.end[1], showCols.value - 1); c++) {
        if (r === m.start[0] && c === m.start[1]) continue
        covered.add(`${r},${c}`)
      }
    }
  }
  const out: ThumbCell[] = []
  for (let r = 0; r < showRows.value; r++) {
    for (let c = 0; c < showCols.value; c++) {
      const key = `${r},${c}`
      if (covered.has(key)) continue
      const span = spanAt.get(key)
      out.push({
        key: `${r}-${c}`,
        header: r < headerLevels.value,
        // 表身偶数行画斑马纹（与表格 zebra 节奏一致的示意）
        zebra: r >= headerLevels.value && (r - headerLevels.value) % 2 === 1,
        colStart: c + 1,
        rowStart: r + 1,
        colSpan: span?.colSpan ?? 1,
        rowSpan: span?.rowSpan ?? 1,
      })
    }
  }
  return out
})
</script>

<template>
  <div class="thumb" data-testid="tpl-thumb" :style="thumbVars" aria-hidden="true">
    <div class="cells" :style="gridStyle">
      <i
        v-for="cell in cells"
        :key="cell.key"
        :class="{ header: cell.header, zebra: cell.zebra }"
        :style="{
          gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
          gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
        }"
      />
    </div>
    <span v-if="truncated" class="more">…</span>
  </div>
</template>

<style scoped>
.thumb {
  position: relative;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--th-border);
  border-radius: 8px;
  background: var(--th-paper);
  overflow: hidden;
  flex-shrink: 0;
}
.cells {
  position: absolute;
  inset: 6px;
  display: grid;
  gap: 2px;
}
.cells i {
  display: block;
  border: 1px solid var(--th-border);
  border-radius: 2px;
  background: var(--th-paper);
}
.cells i.header {
  background: var(--th-primary);
  border-color: var(--th-primary);
}
.cells i.zebra {
  background: var(--th-zebra);
}
.more {
  position: absolute;
  right: 5px;
  bottom: 1px;
  font-size: 12px;
  line-height: 1;
  color: var(--pt-muted);
}
</style>
