import { ref } from 'vue'

/**
 * 左栏开合的模块级会话记忆（增量设计 T03，panelGroups 模式）：
 * 默认窄栏（44px 竖排「组件」入口），点击「组件」或开始拖拽时展开；
 * 会话内记忆，不持久化。
 */
export const libraryRailOpen = ref(false)

export function openLibraryRail(): void {
  libraryRailOpen.value = true
}

export function closeLibraryRail(): void {
  libraryRailOpen.value = false
}
