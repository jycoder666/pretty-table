import { reactive } from 'vue'

/**
 * PX-16：属性面板分组折叠。
 * 原则「改外观的归样式、动结构的归结构」：
 * - content   内容：槽位文字/标记/数字编辑、对齐/强调、区块文字编辑
 * - style     样式：主题、颜色六角色、行高/字号/内边距、列宽
 * - structure 结构：表头层级、合并/拆分、删区块、推荐列
 *   （增量设计 T03：结构组头变为摘要卡「N 行 × M 列 · K 层表头」常显；
 *   高频的行列增删与换位入口移至画布旁行/列轨道，组体只留低频设置。
 *   默认收起语义不变——组头摘要常显，组体收起。）
 */
export type PanelGroupKey = 'content' | 'style' | 'structure'

export const PANEL_GROUPS: ReadonlyArray<{ key: PanelGroupKey; label: string }> = [
  { key: 'content', label: '内容' },
  { key: 'style', label: '样式' },
  { key: 'structure', label: '结构' },
]

/**
 * 展开状态放模块级（会话内记忆，PX-16）：
 * 切槽位 / 选区块 / 面板重挂载都不重置用户的手动展开选择。
 * 默认态：「内容」展开，「样式」「结构」收起。
 */
export const panelGroupOpen = reactive<Record<PanelGroupKey, boolean>>({
  content: true,
  style: false,
  structure: false,
})

/** 点击组头整行切换（组间不互斥，可多组同开） */
export function togglePanelGroup(key: PanelGroupKey): void {
  panelGroupOpen[key] = !panelGroupOpen[key]
}
