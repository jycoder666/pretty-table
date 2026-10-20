<script setup lang="ts">
import { useEditorStore } from '../stores/editor'

// 仅调试构建可达（GC-19）：由 App.vue 的 PT_DEBUG 守卫动态加载
const editor = useEditorStore()
</script>

<template>
  <aside class="debug">
    <strong>pt-debug</strong>
    <div>page: {{ editor.page }}</div>
    <div>dirty: {{ editor.dirty }}</div>
    <div>theme: {{ editor.current?.themeId }}</div>
    <div>version: {{ editor.state?.version }}</div>
  </aside>
</template>

<style scoped>
.debug {
  position: fixed;
  left: 8px;
  bottom: 8px;
  background: #111;
  color: #eee;
  font: 12px/1.4 ui-monospace, monospace;
  padding: 8px 10px;
  border-radius: 8px;
  opacity: 0.85;
  z-index: 90;
}
</style>
