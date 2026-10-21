/**
 * E3 多次撤销：撤销/重做快照拷贝（snapshotForUndo）。
 *
 * 约定（内存依据，勿破坏）：
 * - 槽值对象含 `image` 键时，整个槽对象只做浅拷贝 `{ ...v }` —— data URL 字符串不可变，
 *   且槽值从不被原地修改（所有写入都产生新对象），按引用共享安全。
 *   纯文字快照每步 < 50KB；含图快照共享 data URL 后每步增量恒定，
 *   50 深的栈不会因图片体积放大内存。
 * - 其余结构（slots / blocks / layout / meta 等）递归深拷贝，快照之间互不串扰。
 * - 只处理 JSON 同构数据（plain object / array / primitive），与 cloneInstance 的
 *   JSON 深拷贝语义兼容；快照不落盘（schema 1.2 不动）。
 */

/** 递归拷贝：含 image 键的对象整体浅拷贝（引用共享），其余逐键深拷贝 */
function copyStructure(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map((item) => copyStructure(item))
  const obj = v as Record<string, unknown>
  // 图片槽：data URL 字符串不可变且槽值从不原地改 → 浅拷贝共享引用
  if ('image' in obj) return { ...obj }
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(obj)) {
    out[k] = copyStructure(obj[k])
  }
  return out
}

/**
 * 生成一份可入撤销栈的快照。
 * 与 cloneInstance（JSON 全量深拷贝）不同：image 槽对象浅拷贝共享，
 * 用于 undoStack / redoStack 的入栈拷贝。
 */
export function snapshotForUndo<T>(inst: T): T {
  return copyStructure(inst) as T
}
