<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useEditorStore } from './shell/stores/editor'
import { applyThemeCssVars } from './shell/theme/applyCssVars'
import { DEFAULT_THEME_ID } from './core'
import LibraryPage from './shell/pages/LibraryPage.vue'
import EditorPage from './shell/pages/EditorPage.vue'
import PtToast from './shell/ui/PtToast.vue'
import { wantsDebugPanel } from './shell/debug/flags'

const editor = useEditorStore()
const showDebug = wantsDebugPanel()

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
    <aside v-if="showDebug" class="debug">
      <strong>pt-debug</strong>
      <div>page: {{ editor.page }}</div>
      <div>dirty: {{ editor.dirty }}</div>
      <div>theme: {{ editor.current?.themeId }}</div>
      <div>version: {{ editor.state?.version }}</div>
    </aside>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--pt-paper, #f7f9fc);
  color: #1a1a1a;
}
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
