import {
  moveBlockGate,
  moveGate,
  previewStructuralImpact,
  previewStructuralRange,
  type EditIntent,
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
 *
 * T02 批量扩展（A4）：insertRowsAt/insertColsAt/removeRange/moveBlockBy——
 * 批量插删全走 applyBatch（一批一快照、任一失败整批回滚）；块移动是单条
 * moveRowBlock/moveColBlock 意图（不拼批）。N=1 时委托既有单点函数（文案/testid/交互零变化）。
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

  // ── T02 批量动作（A4）：全部经 applyBatch 一步撤销；N=1 委托既有单点路径 ──

  /**
   * 在 index 前/后插 N 行。意图序（A4）：addRow{afterRow: i+k}，k=0..N−1
   * （每条插在上一条之后；core 对插入位的钳制逐条生效）。失败整批回滚，store 不变。
   * 成功：区间整体选中新对象组 + 最小滚动 + Toast 写明数量与位置。
   */
  async function insertRowsAt(index: number, before: boolean, count: number): Promise<void> {
    if (count <= 1) return insertRowAt(index, before)
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const intents: EditIntent[] = []
    for (let k = 0; k < count; k++) {
      intents.push({ kind: 'addRow', afterRow: before ? index - 1 + k : index + k })
    }
    // 首条插入位（与既有单点路径/core doAddRow 同式钳制）：选择迁移与 Toast 以实际落点为准
    const headerLevels = inst.layout.headerLevels ?? 1
    const rowCount = inst.layout.rowCount
    const lo = Math.min(headerLevels, rowCount)
    const firstAfter = before ? index - 1 : index
    const insertAt = Math.max(lo, Math.min(rowCount, firstAfter + 1))
    if (!editor.applyBatch(intents)) return
    editor.structuralSelection = { axis: 'row', index: insertAt, rangeEnd: insertAt + count - 1 }
    ensureRowVisible(editor.current, insertAt)
    editor.showToast(`已在第 ${insertAt + 1} 行${before ? '上方' : '下方'}插入 ${count} 行`)
  }

  /** 在 index 前/后插 N 列（与 insertRowsAt 同构；首列标签列钳制经 core afterCol≥0 同式） */
  async function insertColsAt(index: number, before: boolean, count: number): Promise<void> {
    if (count <= 1) return insertColAt(index, before)
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const colCount = inst.layout.colCount
    const afterCol = before ? index - 1 : index
    const insertAt = Math.max(0, Math.min(colCount - 1, afterCol)) + 1
    const intents: EditIntent[] = []
    for (let k = 0; k < count; k++) {
      intents.push({ kind: 'addCol', afterCol: before ? index - 1 + k : index + k })
    }
    if (!editor.applyBatch(intents)) return
    editor.structuralSelection = { axis: 'col', index: insertAt, rangeEnd: insertAt + count - 1 }
    editor.showToast(`已在第 ${insertAt + 1} 列${before ? '左侧' : '右侧'}插入 ${count} 列`)
  }

  /**
   * 删区间 [from, to]（含端点，内部归一化）。预检走 previewStructuralRange（与执行守卫同源）：
   * blockedReason 直接白话 toast；含内容弹一次确认框（摘要为区间聚合口径）。
   * 执行：removeRow/Col 意图 k 从 to 降序到 from（降序使低位 index 不漂移），
   * applyBatch 一批一快照；失败整批回滚。成功后选择迁移到同轴相邻项（单值）。
   */
  async function removeRange(axis: StructuralAxis, from: number, to: number): Promise<void> {
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const n = hi - lo + 1
    const impact = previewStructuralRange(inst, axis, lo, hi)
    if (impact.blockedReason) {
      editor.showToast(impact.blockedReason)
      return
    }
    const unit = axis === 'row' ? '行' : '列'
    const rangeText = n === 1 ? `${lo + 1}` : `${lo + 1}–${hi + 1}`
    const hasContent = impact.filledCellCount > 0 || impact.affectedBlockCount > 0
    if (hasContent) {
      // 确认摘要（A4）：三计数来自 previewStructuralRange（跨区间合并区只计一次）
      const parts: string[] = []
      if (impact.filledCellCount > 0) parts.push(`${impact.filledCellCount} 格内容`)
      if (impact.affectedMergeCount > 0) parts.push(`${impact.affectedMergeCount} 处合并区`)
      if (impact.affectedBlockCount > 0) parts.push(`${impact.affectedBlockCount} 个区块`)
      const detail = parts.length ? `这一段的 ${parts.join('、')}会一起删除，` : ''
      const go = await confirmAction({
        title: `删除第 ${rangeText} ${unit}`,
        message: `删除第 ${rangeText} ${unit}后，${detail}删除后可用撤销恢复。确定删除？`,
        confirmText: '删除',
        danger: true,
      })
      if (!go) return
    }
    const oldCount = axis === 'row' ? inst.layout.rowCount : inst.layout.colCount
    const intents: EditIntent[] = []
    for (let k = hi; k >= lo; k--) {
      intents.push(axis === 'row' ? { kind: 'removeRow', row: k } : { kind: 'removeCol', col: k })
    }
    if (!editor.applyBatch(intents)) return
    // 选择迁移：区间后仍有项 → 落在区间起点；已是末段 → 前一项（单值，可含表头行）
    editor.structuralSelection = { axis, index: lo < oldCount - n ? lo : lo - 1 }
    const msg = `已删除第 ${rangeText} ${unit}`
    // 与单点路径同口径：确认路径不挂撤销按钮；空区间即删才附「撤销」动作
    if (hasContent) {
      editor.showToast(msg)
    } else {
      editor.showToast(msg, { action: { label: '撤销', run: () => editor.undo() } })
    }
  }

  /**
   * 区间整体移动 ±1（菜单上移/下移/左移/右移的块版本）：单条 moveRowBlock/moveColBlock
   * 意图（不拼批，一次置换）。moveBlockGate 预检不过 → 白话原因 toast；成功后
   * 选区跟块走 + Toast 由 store wrapper（moveRowBlock/moveColBlock）产出。
   */
  function moveBlockBy(axis: StructuralAxis, from: number, count: number, delta: number): void {
    if (locked()) return
    const inst = editor.current
    if (!inst) return
    const to = from + delta
    const gate = moveBlockGate(inst, axis === 'row' ? 0 : 1, from, count, to)
    if (!gate.ok) {
      editor.showToast(gate.error.message)
      return
    }
    // 成功路径的选择迁移与 Toast 都在 store wrapper 内（选区跟块走）
    if (axis === 'row') editor.moveRowBlock(from, count, to)
    else editor.moveColBlock(from, count, to)
  }

  return {
    insertRowAt,
    insertColAt,
    removeAt,
    moveBy,
    insertRowsAt,
    insertColsAt,
    removeRange,
    moveBlockBy,
  }
}
