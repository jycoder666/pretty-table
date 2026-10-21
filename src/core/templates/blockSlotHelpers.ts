import type { BlockSlotDef } from '../types'

/**
 * 左栏标签块槽位工厂（交互升级 R-4）：按正文逻辑行逐行配 left-N 槽。
 * 每行一格、accept 仅 leftTag；价目模板因首列锁定合并语义不使用本工厂。
 */
export function leftTagSlots(fromRow: number, toRow: number): BlockSlotDef[] {
  const slots: BlockSlotDef[] = []
  for (let r = fromRow; r <= toRow; r++) {
    slots.push({
      id: `left-r${r}`,
      accept: ['leftTag'],
      region: 'left-tag',
      rowHint: `left-${r}`,
    })
  }
  return slots
}

/** 表底注脚槽（每表 1 个；emphFooter 只准放 footer 槽，共享知识 §7.8） */
export function footerSlot(lastRow: number): BlockSlotDef {
  return {
    id: 'footer-1',
    accept: ['emphFooter'],
    region: 'footer',
    rowHint: `after-${lastRow}`,
  }
}
