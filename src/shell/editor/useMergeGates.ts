import { computed, type ComputedRef } from 'vue'
import { canMerge, canSplit } from '@/core'
import { useEditorStore } from '../stores/editor'

/**
 * 合并/拆分闸门（WP1）：右栏「结构」组与画布选区工具条共用同一份判定，
 * 避免两处 UI 出现「一边能点、一边置灰」的口径分叉。
 * reason 直接取核内 message（已是白话），供 tooltip/置灰原因展示。
 * 单格选区例外：覆写为可执行指引「拖选多个格子后可合并」（核内「单格无需合并」
 * 只答了为什么，没答怎么办；判定仍走 canMerge，阈值/白名单闸不动）。
 */
export interface MergeGate {
  ok: boolean
  reason: string
}

export function useMergeGates(): {
  mergeGate: ComputedRef<MergeGate>
  splitGate: ComputedRef<MergeGate>
} {
  const editor = useEditorStore()

  const mergeGate = computed<MergeGate>(() => {
    const inst = editor.current
    if (!inst || editor.pastePending) {
      return { ok: false, reason: editor.pastePending ? '粘贴预览期间不可操作' : '先打开一张表格' }
    }
    if (!editor.selectionRange) {
      return { ok: false, reason: '先选中要合并的格子：点起点格后按住 Shift 点终点格，或直接拖出一块矩形' }
    }
    const r = canMerge(inst.layout, editor.selectionRange)
    if (r.ok) return { ok: true, reason: '' }
    // 单格选区：给「怎么办」的指引，替代核内的纯否句（单格这一支必先于其他闸命中）
    const sel = editor.selectionRange
    if (sel.start[0] === sel.end[0] && sel.start[1] === sel.end[1]) {
      return { ok: false, reason: '拖选多个格子后可合并' }
    }
    return { ok: false, reason: r.error.message }
  })

  const splitGate = computed<MergeGate>(() => {
    const inst = editor.current
    if (!inst || editor.pastePending) {
      return { ok: false, reason: editor.pastePending ? '粘贴预览期间不可操作' : '先打开一张表格' }
    }
    if (!editor.selectionRange) {
      return { ok: false, reason: '先选中一个已合并的格子再拆分' }
    }
    const r = canSplit(inst.layout, editor.selectionRange)
    return r.ok ? { ok: true, reason: '' } : { ok: false, reason: r.error.message }
  })

  return { mergeGate, splitGate }
}
