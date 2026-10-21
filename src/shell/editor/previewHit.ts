import { buildVisualRows, colWidthAt, type TemplateInstance } from '@/core'

/**
 * 预览点选命中（PX-04）：屏幕坐标 → 可视行列。
 * 列宽消费核内生效列宽（layout.style.colWidths，缺省首列 120 / 其余 140），
 * 行高消费 buildVisualRows 的行高序列（行高档位 / 区块行 32px 联动），
 * 不再使用壳层硬编码几何，保证与 toOption 渲染同源。
 */
export function locateVisual(
  inst: TemplateInstance,
  x: number,
  y: number,
): { row: number; col: number } | null {
  const { rowHeights } = buildVisualRows(inst)
  const colCount = inst.layout.colCount

  // 行：按行高序列累加定位（含区块行）
  let accY = 0
  let row = -1
  for (let r = 0; r < rowHeights.length; r++) {
    const h = rowHeights[r] ?? 36
    if (y < accY + h) {
      row = r
      break
    }
    accY += h
  }
  if (row < 0) return null

  // 列：按生效列宽累加定位
  let accX = 0
  for (let c = 0; c < colCount; c++) {
    const w = colWidthAt(inst, c)
    if (x < accX + w) return { row, col: c }
    accX += w
  }
  return null
}
