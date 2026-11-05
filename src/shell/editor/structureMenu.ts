import { reactive } from 'vue'
import type { StructuralAxis } from './railGeometry'

/**
 * 结构菜单开合的模块级会话状态（增量设计 A2，placeSession 模式）：
 * 供轨道（鼠标 `…`）与 PreviewHost（键盘 Shift+F10）两个入口打开同一套菜单（UX-S09）。
 * 非持久化、会话内；按需渲染（关闭即卸载，控体积）。
 * T02：增 rangeEnd——菜单作用对象从单项扩展到区间选择 [index, rangeEnd]
 * （index 为区间起点，写入前已由 store 归一化；null/等于 index = 单选，行为与文案同现状）。
 */
export const structureMenuState = reactive({
  open: false,
  axis: 'row' as StructuralAxis,
  index: 0,
  rangeEnd: null as number | null,
})

export function openStructureMenu(
  axis: StructuralAxis,
  index: number,
  rangeEnd: number | null = null,
): void {
  structureMenuState.axis = axis
  structureMenuState.index = index
  structureMenuState.rangeEnd = rangeEnd
  structureMenuState.open = true
}

export function closeStructureMenu(): void {
  structureMenuState.open = false
}

/** Esc 关闭菜单后把焦点归还画布（UX-S09「归还焦点到画布」） */
export function returnFocusToCanvas(): void {
  const canvas = document.querySelector<HTMLElement>('[data-testid="preview-canvas"]')
  canvas?.focus({ preventScroll: true })
}
