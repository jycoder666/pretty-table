import { reactive } from 'vue'
import type { RailItem, StructuralAxis } from './railGeometry'

/**
 * 轨道拖拽会话（灵活操作升级 A5/T03，placeSession 模式）：
 * 模块级单例，不进 Pinia、不进核、不进 VTable（ADR-001 红线）——
 * 手势状态机全在壳层；指针事件在 StructureRail 内接线，这里只放会话状态与落点纯函数。
 *
 * 手势仲裁（2026-11-03 拍板）：轨道项「按下+移动」这一个指针手势只归换位把手；
 * 区间选择只有 Shift+点击（T02）与键盘 Shift+↑/↓（P1-3）两条路径，不存在拖选手势。
 *
 * 落点判定：boundary = 插入边界在原序中的位置 0..n（0=最前，n=最后）；
 * boundary ∈ {from, from+1} = 原位（不显示指示线、松手无声结束）。
 */

/** 起拖位移阈值（px；与 PreviewHost 框选同阈值范式） */
export const RAIL_DRAG_THRESHOLD = 4

export const railDrag = reactive({
  active: false,
  axis: 'row' as StructuralAxis,
  /** 起拖轨道项 index（0 基） */
  from: -1,
  /** 指示线落点：插入边界在原序中的位置 0..n；-1 = 无效/未判定 */
  boundary: -1,
  /** moveGate 实时判定：合法落点 = 主色指示线，非法 = 警示色 */
  legal: false,
  /** moveGate 白话原因（非法时） */
  reason: '',
})

/** 复位会话（pointerup / pointercancel / 组件卸载时调用） */
export function resetRailDrag(): void {
  railDrag.active = false
  railDrag.axis = 'row'
  railDrag.from = -1
  railDrag.boundary = -1
  railDrag.legal = false
  railDrag.reason = ''
}

/**
 * 边界 → moveRow/moveCol 的目标下标。
 * moveRow 语义 = 先 splice(from,1) 再 splice(to,0)（moveOps.ts），即：
 * 边界 b 在 from 下侧（b > from）时目标 to = b − 1，上侧（b ≤ from）时 to = b。
 * 用例矩阵见 railDnd.spec.ts（5 行表：拖 1→4、4→1、1→2、3→3 原位）。
 */
export function boundaryToTarget(from: number, boundary: number): number {
  return boundary > from ? boundary - 1 : boundary
}

/** boundary 是否为原位（from 自身或紧贴其下缘）——原位不显示指示线、松手不动 */
export function boundaryIsHome(from: number, boundary: number): boolean {
  return boundary === from || boundary === from + 1
}

/**
 * 指针位置 → 插入边界（0..n）。纯函数，可单测：
 * 行轴按 y、列轴按 x，几何 = 传入的轨道项序列（host 内容坐标，来自 railGeometry 既有
 * item 序列——不得自算）。判定口径：指针越过第 k 项中点即计入其后的边界。
 * 指针在全部项之外（条端以外）时收敛到 0 / n，指示线贴首/末项边缘。
 */
export function pickBoundary(
  items: RailItem[],
  axis: StructuralAxis,
  x: number,
  y: number,
): number {
  let boundary = 0
  for (const it of items) {
    const center = axis === 'row' ? it.top + it.height / 2 : it.left + it.width / 2
    if ((axis === 'row' ? y : x) > center) boundary++
  }
  return boundary
}
