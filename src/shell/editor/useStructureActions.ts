import {
  moveGate,
  previewStructuralImpact,
  type StructuralImpact,
} from '@/core'
import { useEditorStore, type StructuralAxis } from '../stores/editor'
import { editableCellAt } from './cellNav'
import { ensureRowVisible } from './railGeometry'
import { confirmAction } from '../ui/confirm'

/**
 * 结构动作单点组合逻辑（增量设计 A1/A6/A9）：
 * 目标解析 → 影响预检（previewStructuralImpact / moveGate，core 单口径）→
 * 确认分流（空删即删、含内容走 confirmAction）→ dispatch（既有 apply/moveRow/moveCol，
 * 一动作一快照）→ 成功后选择迁移与最小滚动 → Toast（空删附撤销动作，复用 undo()）。
 * 壳层不新造 remap；所有禁区判定以 core 返回为准；pastePending 期全部拦截（防线纵深）。
 */
export function useStructureActions() {
  const editor = useEditorStore()

  /** 粘贴预览期统一拦截（键盘/鼠标动作入口的最后一道防线，onKeydown 早退之外） */
  function locked(): boolean {
    if (editor.pastePending) {
      editor.showToast('请先确认或取消粘贴')
      return true
    }
    return false
  }

  /**
   * 插入行（before=true 前插 / false 后插）。core 对插入位有钳制
   * （不许插进表头区），Toast 写 1 基实际位置；成功后选中新行第一个可编辑 text 格
   * （兜底 [newRow, 0]），落入单元格选择 + 最小纵向滚动。
   */
  async function insertRowAt(index: number, before: boolean): Promise<void> {
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const headerLevels = inst.layout.headerLevels ?? 1
    const rowCount = inst.layout.rowCount
    const lo = Math.min(headerLevels, rowCount)
    // 与 core doAddRow 同式：afterRow = before ? index − 1 : index，insertAt = clamp(afterRow + 1)
    const afterRow = before ? index - 1 : index
    const insertAt = Math.max(lo, Math.min(rowCount, afterRow + 1))
    if (!editor.apply({ kind: 'addRow', afterRow })) return
    const newRow = insertAt
    const ni = editor.current
    let targetCell: [number, number] = [newRow, 0]
    let slotId: string | null = null
    if (ni) {
      for (let c = 0; c < ni.layout.colCount; c++) {
        const t = editableCellAt(ni, newRow, c)
        if (t.kind === 'text') {
          targetCell = [newRow, c]
          slotId = t.slotId
          break
        }
      }
    }
    editor.structuralSelection = null
    editor.selectionRange = { start: targetCell, end: targetCell }
    if (slotId) editor.selectedSlotId = slotId
    ensureRowVisible(editor.current, newRow)
    editor.showToast(`已在第 ${newRow + 1} 行${before ? '前' : '后'}插入一行`)
  }

  /**
   * 插入列。第 0 列是标签列（core 钳制到 ≥1），Toast 写实际位置；
   * 成功后选中新列第一个表头格 [0, newCol]。
   */
  async function insertColAt(index: number, before: boolean): Promise<void> {
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const colCount = inst.layout.colCount
    const afterCol = before ? index - 1 : index
    // 与 core doAddCol 同式：insertAt = clamp(afterCol, [0, colCount−1]) + 1
    const insertAt = Math.max(0, Math.min(colCount - 1, afterCol)) + 1
    if (!editor.apply({ kind: 'addCol', afterCol })) return
    const newCol = insertAt
    editor.structuralSelection = null
    editor.selectionRange = { start: [0, newCol], end: [0, newCol] }
    editor.selectedSlotId = editor.current?.layout.slotGrid?.[0]?.[newCol] ?? null
    editor.showToast(`已在第 ${newCol + 1} 列${before ? '前' : '后'}插入一列`)
  }

  /** 删除确认框摘要（previewStructuralImpact 三计数 → 白话影响说明） */
  function deleteSummary(axis: StructuralAxis, n: number, impact: StructuralImpact): string {
    const unit = axis === 'row' ? '行' : '列'
    const parts: string[] = []
    if (impact.filledCellCount > 0) parts.push(`${impact.filledCellCount} 格内容`)
    if (impact.affectedMergeCount > 0) parts.push(`${impact.affectedMergeCount} 处合并区`)
    if (impact.affectedBlockCount > 0) parts.push(`${impact.affectedBlockCount} 个区块`)
    const detail = parts.length
      ? `这一${unit}的 ${parts.join('、')}会一起删除，`
      : ''
    return `删除第 ${n} ${unit}后，${detail}删除后可用撤销恢复。确定删除？`
  }

  /** 删除后同轴相邻项：原位置新邻居（删 i 后仍在 i 的项）优先，否则 i−1（A6 规则 4） */
  function neighborIndex(index: number, oldCount: number): number {
    return index < oldCount - 1 ? index : index - 1
  }

  /**
   * 删除行/列。blockedReason（越界/表头/最低结构）与执行守卫同源，直接白话 toast；
   * 空行列删即删 + 撤销 Toast（5s）；含内容走 confirmAction 影响摘要，确认后普通 Toast。
   */
  async function removeAt(axis: StructuralAxis, index: number): Promise<void> {
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const impact = previewStructuralImpact(inst, axis, index)
    if (impact.blockedReason) {
      editor.showToast(impact.blockedReason)
      return
    }
    const n = index + 1
    const hasContent = impact.filledCellCount > 0 || impact.affectedBlockCount > 0
    if (hasContent) {
      const go = await confirmAction({
        title: `删除第 ${n} ${axis === 'row' ? '行' : '列'}`,
        message: deleteSummary(axis, n, impact),
        confirmText: '删除',
        danger: true,
      })
      if (!go) return
    }
    const oldCount = axis === 'row' ? inst.layout.rowCount : inst.layout.colCount
    const applied =
      axis === 'row'
        ? editor.apply({ kind: 'removeRow', row: index })
        : editor.apply({ kind: 'removeCol', col: index })
    if (!applied) return
    // 选择迁移：同轴相邻项（可能是表头行——可选中不可删，符合 PRD §5.2）
    editor.structuralSelection = { axis, index: neighborIndex(index, oldCount) }
    const msg = axis === 'row' ? `已删除第 ${n} 行` : `已删除第 ${n} 列`
    // 确认后 Toast 不复述撤销按钮（确认框已说明可用撤销恢复，A9）；空删即删才附撤销动作
    if (hasContent) {
      editor.showToast(msg)
    } else {
      editor.showToast(msg, { action: { label: '撤销', run: () => editor.undo() } })
    }
  }

  /** 单步移动（菜单上移/下移/左移/右移）：moveGate 预检 → dispatch → 选区跟随 + 既有 Toast */
  function moveBy(axis: StructuralAxis, index: number, delta: number): void {
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const to = index + delta
    const gate = moveGate(inst, axis === 'row' ? 0 : 1, index, to)
    if (!gate.ok) {
      editor.showToast(gate.error.message)
      return
    }
    const moved = axis === 'row' ? editor.moveRow(index, to) : editor.moveCol(index, to)
    if (!moved) return
    // 选区跟随被移动对象（连续两次不误挪）；Toast 由 store.moveRow/moveCol 产出
    editor.structuralSelection = { axis, index: to }
  }

  return {
    insertRowAt,
    insertColAt,
    removeAt,
    moveBy,
  }
}
