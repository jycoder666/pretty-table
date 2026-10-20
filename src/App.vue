<script setup lang="ts">
import { defineAsyncComponent, onMounted, watch, type Component } from 'vue'
import { useEditorStore } from './shell/stores/editor'
import { applyThemeCssVars } from './shell/theme/applyCssVars'
import { DEFAULT_THEME_ID } from './core'
import LibraryPage from './shell/pages/LibraryPage.vue'
import EditorPage from './shell/pages/EditorPage.vue'
import PtToast from './shell/ui/PtToast.vue'

const editor = useEditorStore()

/** GC-19：调试开关构建期常量；生产构建折叠为 false，DebugPanel 动态导入被摇树 */
const PT_DEBUG = import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV
const debugPanel: Component | null = PT_DEBUG
  ? defineAsyncComponent(() => import('./shell/debug/DebugPanel.vue'))
  : null

onMounted(async () => {
  applyThemeCssVars(DEFAULT_THEME_ID)
  await editor.tryRestoreDraft()
})

watch(
  () => editor.current?.themeId,
  (id) => {
    if (id) applyThemeCssVars(id)
  },
)
</script>

<template>
  <div class="app">
    <LibraryPage v-if="editor.page === 'library'" />
    <EditorPage v-else />
    <PtToast :message="editor.toast" />
    <component :is="debugPanel" v-if="debugPanel" />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--pt-paper, #f7f9fc);
  color: #1a1a1a;
}
</style>
