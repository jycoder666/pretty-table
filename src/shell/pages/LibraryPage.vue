<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLibraryStore } from '../stores/library'
import { useEditorStore } from '../stores/editor'
import { createBlankInstance } from '@/core'
import PtButton from '../ui/PtButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { confirmAction } from '../ui/confirm'
import TemplateThumb from './TemplateThumb.vue'
import RenameDialog from '../ui/RenameDialog.vue'
import { errorCopy } from '../editor/errorCopy'
import type { TemplateInstance } from '@/core'

const library = useLibraryStore()
const editor = useEditorStore()

onMounted(() => {
  void library.refreshMine()
})

// ── 新建空白表（FR-C6 / Q-10 / T05）：专属卡 + 最小向导，默认 5×4 / 1 层 ──
const blankOpen = ref(false)
const blankRows = ref(5)
const blankCols = ref(4)
const blankLevels = ref(1)

function createBlank() {
  // 与换模板同一口径：有未另存改动先确认（FR-10 / PX-05 统一确认弹窗）
  if (editor.dirty && editor.current) {
    void confirmAction({
      title: '替换当前的表格',
      message: '换一张模板会替换当前的表格，未另存的修改会丢失。确定继续？',
      confirmText: '替换',
      danger: true,
    }).then((go) => {
      if (!go) return
      doCreateBlank()
    })
    return
  }
  doCreateBlank()
}

function doCreateBlank() {
  editor.openTemplate(
    createBlankInstance({
      rows: blankRows.value,
      cols: blankCols.value,
      headerLevels: blankLevels.value,
    }),
  )
  blankOpen.value = false
}

const typeLabel = (t: TemplateInstance) => {
  const m: Record<string, string> = {
    compare: '对比',
    detail: '明细',
    pricing: '价目',
    matrix: '矩阵',
    blank: '空白',
  }
  return m[t.meta?.templateType ?? ''] ?? '模板'
}

/** PX-10：重命名「我的模板」（小弹层，改名后经 repo 原键覆盖持久化） */
const renameOpen = ref(false)
const renameTarget = ref<TemplateInstance | null>(null)

function openRename(t: TemplateInstance) {
  renameTarget.value = t
  renameOpen.value = true
}

async function onRename(name: string) {
  const t = renameTarget.value
  if (!t) return
  const ok = await library.renameTemplate(t.templateId, name)
  editor.showToast(ok ? '已重命名' : '重命名失败，请重试')
  renameTarget.value = null
}

async function useTpl(t: TemplateInstance) {
  // PX-02（FR-10 一律二次确认）：只要存在有未另存改动的编辑实例，从库页换模板就确认；
  // 不再依赖 page === 'editor'（库页时 page 已是 'library'，原条件恒假导致静默覆盖）。
  // PX-05：确认走统一确认弹窗，按钮写明「替换」。
  if (editor.dirty && editor.current) {
    const go = await confirmAction({
      title: '替换当前的表格',
      message: '换一张模板会替换当前的表格，未另存的修改会丢失。确定继续？',
      confirmText: '替换',
      danger: true,
    })
    if (!go) return
  }
  editor.openTemplate(t)
}

/** PX-01：删除「我的模板」，二次确认后经 repo 删除并刷新列表 */
async function removeTpl(t: TemplateInstance) {
  const go = await confirmAction({
    title: '删除模板',
    message: '删除后这张模板就没了，确定删除？',
    confirmText: '删除',
    danger: true,
  })
  if (!go) return
  const ok = await library.removeTemplate(t.templateId)
  if (ok) editor.showToast('已删除')
  else editor.showToast(errorCopy('TEMPLATE_DELETE_FAIL'))
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
        <!-- 新建空白表专属卡（FR-C6 / Q-10）：区别于普通预设卡，带最小向导 -->
        <article class="card blank-card" data-testid="blank-card">
          <span class="chip">空白</span>
          <h3>新建空白表</h3>
          <p>不套模板，从一张空表开始填。</p>
          <PtButton
            v-if="!blankOpen"
            type="button"
            data-testid="blank-open"
            @click.stop="blankOpen = true"
          >
            配置并新建
          </PtButton>
          <div v-else class="wiz" data-testid="blank-wizard">
            <label class="wiz-row">
              行数
              <input
                v-model.number="blankRows"
                type="number"
                min="1"
                max="20"
                data-testid="blank-rows"
              />
            </label>
            <label class="wiz-row">
              列数
              <input
                v-model.number="blankCols"
                type="number"
                min="1"
                max="12"
                data-testid="blank-cols"
              />
            </label>
            <label class="wiz-row">
              表头层级
              <select v-model.number="blankLevels" data-testid="blank-levels">
                <option :value="1">1 层</option>
                <option :value="2">2 层</option>
                <option :value="3">3 层</option>
              </select>
            </label>
            <div class="actions">
              <PtButton type="button" data-testid="blank-create" @click.stop="createBlank">
                创建
              </PtButton>
              <PtButton variant="ghost" type="button" @click.stop="blankOpen = false">取消</PtButton>
            </div>
          </div>
        </article>

        <article v-for="t in library.presets" :key="t.templateId" class="card">
          <!-- PX-06：模板卡缩略图（纯 CSS 骨架示意，固定宽高比） -->
          <TemplateThumb :instance="t" />
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
          <!-- PX-06：我的模板卡同款缩略图 -->
          <TemplateThumb :instance="t" />
          <!-- PX-10：类型标识（复用系统模板 typeLabel）+「我的」标识 -->
          <div class="chips">
            <span class="chip mine">我的</span>
            <span class="chip" data-testid="tpl-type-chip">{{ typeLabel(t) }}</span>
          </div>
          <h3>{{ t.meta?.displayName || '未命名模板' }}</h3>
          <p>{{ t.meta?.savedAt ? new Date(t.meta.savedAt).toLocaleString() : '' }}</p>
          <div class="actions">
            <PtButton type="button" @click.stop="() => useTpl(t)">使用此模板</PtButton>
            <!-- PX-10：重命名入口 -->
            <PtButton variant="ghost" type="button" data-testid="rename-btn" @click.stop="openRename(t)">
              重命名
            </PtButton>
            <PtButton variant="ghost" type="button" @click.stop="() => removeTpl(t)">删除</PtButton>
          </div>
        </article>
      </div>
    </section>

    <!-- PX-05：统一确认弹窗（删除模板 / 换模板替换） -->
    <ConfirmDialog />
    <!-- PX-10：重命名小弹层（ConfirmDialog 同风格） -->
    <RenameDialog
      v-model:open="renameOpen"
      heading="重命名模板"
      :initial-name="renameTarget?.meta?.displayName ?? ''"
      @confirm="onRename"
    />
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
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.blank-card {
  border-style: dashed;
}
.wiz {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wiz-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.wiz-row input,
.wiz-row select {
  width: 72px;
  border: 1px solid var(--pt-border);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit;
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
/* PX-10：我的模板卡双 chip（我的 + 类型）同行排布 */
.chips {
  display: flex;
  align-items: center;
  gap: 6px;
}
.chips .chip {
  align-self: auto;
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
