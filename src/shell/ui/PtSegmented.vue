<script setup lang="ts">
import { type PropType } from 'vue'

/**
 * 三档分段选择（FR-C2 排版微调）：行高 / 字号 / 内边距 / 表头层数共用。
 * 选项 value 用 number（档位 1~3）；再点当前项不重复提交（父层判断或忽略）。
 */
defineProps({
  options: { type: Array as PropType<{ value: number; label: string }[]>, required: true },
  modelValue: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})

defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

<template>
  <div class="seg" role="radiogroup">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      class="opt"
      :class="{ on: modelValue === o.value }"
      :aria-checked="modelValue === o.value"
      :disabled="disabled"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  overflow: hidden;
}
.opt {
  border: none;
  background: transparent;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  color: inherit;
}
.opt + .opt {
  border-left: 1px solid var(--pt-border);
}
.opt.on {
  background: var(--pt-tag);
  color: var(--pt-tag-text);
  font-weight: 600;
}
.opt:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
