<script setup lang="ts">
import { ref, watch } from 'vue'
import { DialogRoot, DialogContent, DialogTitle, DialogPortal, DialogOverlay } from 'reka-ui'
import PtButton from '../ui/PtButton.vue'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ defaultName?: string }>()
const emit = defineEmits<{ save: [name: string] }>()

const name = ref('')
watch(open, (v) => {
  if (v) name.value = props.defaultName ?? '我的模板'
})

function submit() {
  const n = name.value.trim() || '我的模板'
  emit('save', n)
  open.value = false
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="overlay" />
      <DialogContent class="dialog">
        <DialogTitle>另存为模板</DialogTitle>
        <p>只新增不覆盖。重名也可以保存。</p>
        <label>
          名称
          <input v-model="name" autofocus @keydown.enter.prevent="submit" />
        </label>
        <div class="actions">
          <PtButton variant="ghost" @click="open = false">取消</PtButton>
          <PtButton @click="submit">保存</PtButton>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: 40;
}
.dialog {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  width: min(400px, 92vw);
  z-index: 50;
  border: 1px solid var(--pt-border);
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  margin: 12px 0;
}
input {
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
