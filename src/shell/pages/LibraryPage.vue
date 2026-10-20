<script setup lang="ts">
import { onMounted } from 'vue'
import { useLibraryStore } from '../stores/library'
import { useEditorStore } from '../stores/editor'
import PtButton from '../ui/PtButton.vue'
import type { TemplateInstance } from '@/core'

const library = useLibraryStore()
const editor = useEditorStore()

onMounted(() => {
  void library.refreshMine()
})

const typeLabel = (t: TemplateInstance) => {
  const m: Record<string, string> = {
    compare: '对比',
    detail: '明细',
    pricing: '价目',
    matrix: '矩阵',
  }
  return m[t.meta?.templateType ?? ''] ?? '模板'
}

function useTpl(t: TemplateInstance) {
  if (editor.dirty && editor.page === 'editor') {
    if (!confirm('会替换当前的表，确定继续？')) return
  }
  editor.openTemplate(t)
}
</script>

<template>
  <div class="library">
    <header class="hero">
      <h1>pretty-table</h1>
      <p>选一张模板，填字换皮，复制 HTML 或导出 PNG。数据只存在本机浏览器。</p>
    </header>

    <section>
      <h2>系统预设</h2>
      <div class="grid">
        <article v-for="t in library.presets" :key="t.templateId" class="card">
          <span class="chip">{{ typeLabel(t) }}</span>
          <h3>{{ t.meta?.displayName }}</h3>
          <p>{{ t.meta?.description }}</p>
          <PtButton type="button" @click.stop="() => useTpl(t)">使用此模板</PtButton>
        </article>
      </div>
    </section>

    <section>
      <h2>我的模板</h2>
      <p v-if="library.listError" class="err">
        {{ library.listError }}
        <PtButton variant="ghost" type="button" @click.stop="() => library.refreshMine()">重试</PtButton>
      </p>
      <p v-else-if="!library.mine.length" class="empty">还没有我的模板。在编辑台「另存为模板」后会出现在这里。</p>
      <div v-else class="grid">
        <article v-for="t in library.mine" :key="t.templateId" class="card">
          <span class="chip mine">我的</span>
          <h3>{{ t.meta?.displayName || '未命名模板' }}</h3>
          <p>{{ t.meta?.savedAt ? new Date(t.meta.savedAt).toLocaleString() : '' }}</p>
          <PtButton type="button" @click.stop="() => useTpl(t)">使用此模板</PtButton>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.library {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 20px 64px;
}
.hero h1 {
  margin: 0 0 8px;
  font-size: 28px;
  color: var(--pt-primary);
  letter-spacing: -0.02em;
}
.hero p {
  margin: 0 0 28px;
  color: #4b5563;
  max-width: 36em;
}
section + section {
  margin-top: 36px;
}
h2 {
  font-size: 16px;
  margin: 0 0 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.card {
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.card h3 {
  margin: 0;
  font-size: 16px;
}
.card p {
  margin: 0;
  flex: 1;
  color: #6b7280;
  font-size: 13px;
}
.chip {
  align-self: flex-start;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--pt-tag);
  color: var(--pt-tag-text);
}
.chip.mine {
  background: var(--pt-emphasis-soft);
  color: var(--pt-emphasis);
}
.empty,
.err {
  color: #6b7280;
  font-size: 14px;
}
.err {
  color: var(--pt-emphasis);
}
</style>
