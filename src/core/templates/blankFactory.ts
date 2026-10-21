import type { TemplateInstance } from '../types'
import { LIMITS } from '../theme/layoutScales'

/**
 * FR-C6 / T05：按向导参数生成空白表实例（blank-v1 为底稿的可参数化版本）。
 * 行列数与表头层级在源头钳制（≤ LIMITS 20×12；层级 1~3 且不超过行数），
 * 槽位 id 沿用 u<单调序号> 策略（§1.4.4），进编辑台后照常可结构编辑。
 */
export interface BlankOptions {
  rows?: number
  cols?: number
  headerLevels?: number
}

function clampInt(v: number | undefined, min: number, max: number, dflt: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

export function createBlankInstance(opts?: BlankOptions): TemplateInstance {
  const rows = clampInt(opts?.rows, 1, LIMITS.maxRows, 5)
  const cols = clampInt(opts?.cols, 1, LIMITS.maxCols, 4)
  // 表头层级不能超过行数（至少给表体留一行）
  const headerLevels = Math.min(clampInt(opts?.headerLevels, 1, 3, 1), rows)

  const slots: Record<string, string> = {}
  const grid: (string | null)[][] = []
  let seq = 1
  for (let r = 0; r < rows; r++) {
    const row: string[] = []
    for (let c = 0; c < cols; c++) {
      const id = `u${seq++}`
      slots[id] = ''
      row.push(id)
    }
    grid.push(row)
  }

  return {
    schemaVersion: '1.2',
    templateId: 'blank-new',
    themeId: 'T-A',
    zebraOn: true,
    highlight: { recommendCol: null },
    meta: {
      displayName: '新建空白表',
      description: `从零开始的 ${rows} 行 ${cols} 列空表，行列与表头层级都可以再调`,
      templateType: 'blank',
      origin: 'preset',
    },
    slots,
    blocks: [],
    layout: {
      rowCount: rows,
      colCount: cols,
      headerLevels: headerLevels as 1 | 2 | 3,
      merges: [],
      structuralMerges: [],
      allowedMerges: [{ start: [0, 0], end: [rows - 1, cols - 1] }],
      blockSlots: [],
      slotGrid: grid,
    },
  }
}
