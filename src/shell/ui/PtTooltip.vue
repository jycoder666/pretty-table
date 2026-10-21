<script setup lang="ts">
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent, TooltipArrow } from 'reka-ui'

/**
 * R-5 全界面统一 tooltip（交互升级 T04）：
 * - Reka UI Tooltip 管行为（延时 / 碰撞翻转 / 键盘 focus 触发），壳自绘样式（CSS 变量，GC-11）
 * - props.text = 白话单句；默认插槽 = 触发器
 * - 禁用态按钮不派发指针事件 → 触发器统一包一层 span（组件内部处理，调用方不写 span），
 *   悬停落在外层 span 上照常触发；键盘 focus 经 focusin 冒泡同样可达
 * - TooltipProvider 内置于组件（delayDuration 300 / skipDelayDuration 300），
 *   使用点无需页面根部再包 Provider（偏差记录：设计建议 Provider 常驻页面根部，
 *   实现为组件自包含，行为一致且组件测试/复用零配置）
 */
const props = defineProps<{
  text: string
  /** 出现延时 ms（设计建议 300，交互可调） */
  delayDuration?: number
}>()

const delay = () => props.delayDuration ?? 300
</script>

<template>
  <TooltipProvider :delay-duration="delay()" :skip-delay-duration="300">
    <TooltipRoot :delay-duration="delay()">
      <TooltipTrigger as-child>
        <span class="pt-tooltip-trigger"><slot /></span>
      </TooltipTrigger>
      <TooltipContent class="pt-tooltip-content" :side-offset="6" role="tooltip">
        {{ props.text }}
        <TooltipArrow class="pt-tooltip-arrow" />
      </TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
</template>

<style scoped>
.pt-tooltip-trigger {
  display: inline-flex;
}
.pt-tooltip-content {
  z-index: 70;
  max-width: 240px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--pt-muted);
  color: var(--pt-header-text);
  font-size: 12px;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgb(0 0 0 / 18%);
}
.pt-tooltip-arrow {
  fill: var(--pt-muted);
  width: 10px;
  height: 5px;
}
</style>
