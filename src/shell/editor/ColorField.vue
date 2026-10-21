<script setup lang="ts">
import { ref, watch } from 'vue'
import { ROLE_SWATCHES, sanitizeHex, type RoleColorKey } from '@/core'

/**
 * 单个角色色的编辑控件（FR-C1）：
 * 预设色板点选 + input[type=color] 原生取色 + hex 文本输入（change 时提交，不逐字符）。
 * 非法 hex 不写入：回退显示当前生效色，由父层 toast 提示。
 * 提交语义：hex 为 null = 恢复该角色预设（setThemeToken value:null 删覆盖）。
 */
const props = defineProps<{
  role: RoleColorKey
  label: string
  /** 当前生效色（预设或覆盖合成结果） */
  value: string
  /** 该角色是否被覆盖（覆盖时显示「恢复预设」入口） */
  overridden?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  commit: [hex: string | null]
  invalid: [raw: string]
}>()

const hexText = ref(props.value)
watch(
  () => props.value,
  (v) => {
    hexText.value = v
  },
)

function commitText() {
  const raw = hexText.value.trim()
  if (raw === '') {
    // 清空 = 恢复该角色预设
    hexText.value = props.value
    if (props.overridden) emit('commit', null)
    return
  }
  const hex = sanitizeHex(raw)
  if (!hex) {
    emit('invalid', raw)
    hexText.value = props.value
    return
  }
  hexText.value = hex
  if (hex.toLowerCase() === props.value.toLowerCase()) return
  emit('commit', hex)
}

function onSwatch(hex: string) {
  hexText.value = hex
  if (hex.toLowerCase() === props.value.toLowerCase()) return
  emit('commit', hex)
}

function onNative(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  hexText.value = hex
  emit('commit', hex)
}

function onReset() {
  hexText.value = props.value
  emit('commit', null)
}
</script>

<template>
  <div class="color-field" :data-testid="`color-field-${role}`">
    <div class="head">
      <span class="name">{{ label }}</span>
      <button
        v-if="overridden"
        type="button"
        class="reset"
        :disabled="disabled"
        @click="onReset"
      >
        恢复预设
      </button>
    </div>
    <div class="swatches" role="listbox" :aria-label="`${label}预设色`">
      <button
        v-for="hex in ROLE_SWATCHES[role]"
        :key="hex"
        type="button"
        class="dot"
        :class="{ on: hex.toLowerCase() === value.toLowerCase() }"
        :style="{ '--c': hex }"
        :disabled="disabled"
        :aria-label="`${label} ${hex}`"
        @click="onSwatch(hex)"
      />
    </div>
    <div class="inputs">
      <input
        type="color"
        :value="value"
        :disabled="disabled"
        :aria-label="`${label}取色器`"
        @change="onNative"
      />
      <input
        v-model="hexText"
        class="hex"
        type="text"
        placeholder="#RRGGBB"
        spellcheck="false"
        :disabled="disabled"
        :aria-label="`${label}色值`"
        @change="commitText"
      />
    </div>
  </div>
</template>

<style scoped>
.color-field {
  margin-bottom: 10px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.name {
  font-size: 12px;
  color: var(--pt-muted);
}
.reset {
  border: none;
  background: none;
  color: var(--pt-primary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}
.reset:disabled {
  opacity: 0.5;
  cursor: default;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 6px 0;
}
.dot {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--pt-border);
  background: var(--c);
  cursor: pointer;
  padding: 0;
}
.dot.on {
  outline: 2px solid var(--pt-primary);
  outline-offset: 1px;
}
.dot:disabled {
  opacity: 0.5;
  cursor: default;
}
.inputs {
  display: flex;
  align-items: center;
  gap: 6px;
}
.inputs input[type='color'] {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.hex {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 4px 8px;
  font: inherit;
  font-size: 12px;
  font-family: ui-monospace, monospace;
}
</style>
