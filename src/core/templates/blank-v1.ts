import type { TemplateInstance } from '../types'
import { footerSlot, leftTagSlots } from './blockSlotHelpers'

/**
 * FR-C6 · Q-10：新建空白表底稿 — 5 行 × 4 列、单层表头、全部格可写槽；
 * R-4：配 footer 注脚槽与逐正文行 leftTag 槽（空置时占位，可拖入区块）。
 * 进编辑台后行列数与表头层级照常可再改（structure intents）。
 * 槽位 id 从 u1 起按单调策略编号（§1.4.4），结构编辑续号不重用。
 */

const BLANK_SLOTS: Record<string, string> = (() => {
  const slots: Record<string, string> = {}
  for (let i = 1; i <= 20; i++) slots[`u${i}`] = ''
  return slots
})()

function blankGrid(): (string | null)[][] {
  const grid: (string | null)[][] = []
  for (let r = 0; r < 5; r++) {
    const row: string[] = []
    for (let c = 0; c < 4; c++) row.push(`u${r * 4 + c + 1}`)
    grid.push(row)
  }
  return grid
}

export const BLANK_V1: TemplateInstance = {
  schemaVersion: '1.2',
  templateId: 'blank-v1',
  themeId: 'T-A',
  zebraOn: true,
  highlight: { recommendCol: null },
  meta: {
    displayName: '新建空白表',
    description: '从零开始的 5 行 4 列空表，行列与表头层级都可以再调',
    templateType: 'blank',
    origin: 'preset',
  },
  slots: BLANK_SLOTS,
  blocks: [],
  layout: {
    rowCount: 5,
    colCount: 4,
    headerLevels: 1,
    merges: [],
    structuralMerges: [],
    // 兼容语义：结构编辑后合并不再受 allowedMerges 硬闸（§1.4.1），全表保留供旧读取方使用
    allowedMerges: [{ start: [0, 0], end: [4, 3] }],
    // R-4：空白表也配 footer + leftTag 槽（空白表用户的注脚/标签诉求最典型）
    blockSlots: [footerSlot(4), ...leftTagSlots(1, 4)],
    slotGrid: blankGrid(),
  },
}
