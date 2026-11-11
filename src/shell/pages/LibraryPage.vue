<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useLibraryStore } from '../stores/library'
import { useEditorStore } from '../stores/editor'
import { createBlankInstance, instanceFromJSON } from '@/core'
import PtButton from '../ui/PtButton.vue'
import ConfirmDialog from '../ui/ConfirmDialog.vue'
import { confirmAction } from '../ui/confirm'
import TemplateThumb from './TemplateThumb.vue'
import RenameDialog from '../ui/RenameDialog.vue'
import { errorCopy, warnCopy } from '../editor/errorCopy'
import type { TemplateInstance } from '@/core'

const library = useLibraryStore()
const editor = useEditorStore()

onMounted(() => {
  void library.refreshMine()
})

// ── FR-20 类型筛选（增强期交互口径 §2.1）：chips 同时过滤系统预设与我的模板两段 ──
type FilterType = 'compare' | 'detail' | 'pricing' | 'matrix' | 'stat'
const FILTER_CHIPS: { type: FilterType | ''; label: string }[] = [
  { type: '', label: '全部' },
  { type: 'compare', label: '多列对比' },
  { type: 'detail', label: '单主体明细' },
  { type: 'pricing', label: '价目清单' },
  { type: 'matrix', label: '宽表矩阵' },
  { type: 'stat', label: '统计看板' },
]
const filter = ref<FilterType | ''>('')

/** 有模板才显示 Chip（UX-CAT-d）：类型存在于系统预设或我的模板中才出 chip */
const visibleChips = computed(() =>
  FILTER_CHIPS.filter(
    (c) =>
      c.type === '' ||
      library.presets.some((t) => t.meta?.templateType === c.type) ||
      library.mine.some((t) => t.meta?.templateType === c.type),
  ),
)

const filteredPresets = computed(() =>
  filter.value === ''
    ? library.presets
    : library.presets.filter((t) => t.meta?.templateType === filter.value),
)
const filteredMine = computed(() =>
  filter.value === ''
    ? library.mine
    : library.mine.filter((t) => t.meta?.templateType === filter.value),
)

/** 当前筛选类型的全称（用于「我的模板」按类型空态文案） */
const filterLabel = computed(
  () => FILTER_CHIPS.find((c) => c.type === filter.value)?.label ?? '',
)

/** FR-20 §2.2 防误解小字：价目「不会自动计算」、矩阵「列多时左右滑动」；其余类型无小字 */
function typeHint(t: TemplateInstance): string | null {
  switch (t.meta?.templateType) {
    case 'pricing':
      return '行数由模板定好；小计请自己填写，不会自动计算'
    case 'matrix':
      return '列多时左右滑动，首列固定'
    default:
      return null
  }
}

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
    stat: '统计看板',
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

/** PX-01：删除「我的模板」，二次确认后经 repo 删除并刷新列表；
 * P3：删除前留内存快照，成功后进入 10 秒撤销态（撤销条），不再直接 toast「已删除」 */
async function removeTpl(t: TemplateInstance) {
  const go = await confirmAction({
    title: '删除模板',
    message: '删除后这张模板就没了，确定删除？',
    confirmText: '删除',
    danger: true,
  })
  if (!go) return
  const snapshot = JSON.parse(JSON.stringify(t)) as TemplateInstance
  const ok = await library.removeTemplate(t.templateId)
  if (!ok) {
    editor.showToast(errorCopy('TEMPLATE_DELETE_FAIL'))
    return
  }
  startUndo(snapshot)
}

// ── P3 删除 10 秒撤销：底部撤销条，倒计时归零自动丢弃快照 ──
const UNDO_SECONDS = 10
const undoLeft = ref(0)
const undoSnapshot = ref<TemplateInstance | null>(null)
let undoTimer: number | null = null

function stopUndoTimer() {
  if (undoTimer !== null) {
    window.clearInterval(undoTimer)
    undoTimer = null
  }
}

/** 进入/重置撤销态：撤销期间再次删除另一张 → 替换快照与计时（新删除优先） */
function startUndo(t: TemplateInstance) {
  undoSnapshot.value = t
  undoLeft.value = UNDO_SECONDS
  stopUndoTimer()
  undoTimer = window.setInterval(() => {
    undoLeft.value -= 1
    if (undoLeft.value <= 0) discardUndo()
  }, 1000)
}

/** 丢弃快照收起撤销条（倒计时归零 / 手动撤销后调用） */
function discardUndo() {
  stopUndoTimer()
  undoSnapshot.value = null
  undoLeft.value = 0
}

/** 点撤销：快照重新落库（library.undoRemove 同 id 恢复）+ toast「已恢复」 */
async function undoRemoveTpl() {
  const snap = undoSnapshot.value
  if (!snap) return
  discardUndo()
  const ok = await library.undoRemove(snap)
  editor.showToast(ok ? '已恢复' : '恢复失败，请重试')
}

onUnmounted(stopUndoTimer)

// ── P2 全量备份 / 导入备份：「我的模板」整包下载与还原 ──
const restoreFileRef = ref<HTMLInputElement | null>(null)

/** 备份全部：mine 全量 → 单文件 JSON 下载（store 内完成规范化与下载触发） */
async function onBackupAll() {
  const r = await library.backupAll()
  if (r.ok) editor.showToast(`已导出 ${r.count} 张模板`)
  else editor.showToast(r.error ?? '备份失败，请重试')
}

function onRestoreClick() {
  restoreFileRef.value?.click()
}

/** 导入备份：选 .json → store 逐张校验入库 → toast 结果（跳过张数 >0 才显示后半句） */
async function onRestoreFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 读入前立刻清空 value：同一路径连续选同一文件也触发 change
  input.value = ''
  if (!file) return
  let text: string
  try {
    text = await file.text()
  } catch {
    editor.showToast('文件读取失败，请重试')
    return
  }
  const r = await library.restoreBackup(text)
  if (r.error) {
    editor.showToast(r.error)
    return
  }
  const tail = r.skipped > 0 ? `，跳过 ${r.skipped} 张` : ''
  editor.showToast(`导入 ${r.imported} 张${tail}`)
}

// ── 模板 JSON 导入（跨设备同步）：文件选择或粘贴文本 → 核内校验 → 入「我的模板」──
const importOpen = ref(false)
const importText = ref('')

function openImport() {
  importText.value = ''
  importOpen.value = true
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    importText.value = await file.text()
  } catch {
    editor.showToast('文件读取失败，请重试')
    return
  }
  // 读入后立刻清空 input.value：同一路径连续选同一文件也触发 change
  input.value = ''
}

async function confirmImport() {
  const text = importText.value
  if (!text.trim()) {
    editor.showToast('请先选择文件或粘贴模板 JSON')
    return
  }
  const r = instanceFromJSON(text)
  if (!r.inst) {
    editor.showToast(r.reason ?? '导入失败，请重试')
    return
  }
  const ok = await library.importTemplate(r.inst)
  if (!ok) {
    editor.showToast(errorCopy('TEMPLATE_SAVE_FAIL'))
    return
  }
  const name = r.inst.meta?.displayName ?? '模板'
  const warnTail = r.warnings.length ? `；${r.warnings.map((w) => warnCopy(w.code)).join('；')}` : ''
  editor.showToast(`已导入「${name}」${warnTail}`)
  importOpen.value = false
}
</script>

<template>
  <div class="library">
    <header class="hero">
      <h1>pretty-table</h1>
      <p>选一张模板，填字换皮，复制 HTML 或导出 PNG。数据只存在本机浏览器。</p>
    </header>

    <!-- FR-20 §2.1：类型筛选 chips（筛选同时作用于系统预设与我的模板两段） -->
    <nav class="filters" data-testid="type-filter" aria-label="按模板类型筛选">
      <button
        v-for="c in visibleChips"
        :key="c.type || 'all'"
        type="button"
        class="chip fchip"
        :class="{ active: filter === c.type }"
        :data-testid="`filter-chip-${c.type || 'all'}`"
        @click.stop="filter = c.type"
      >
        {{ c.label }}
      </button>
    </nav>

    <section>
      <h2>系统预设</h2>
      <!-- FR-20 §2.3：筛选无结果（系统段）→ 提示 + 清空筛选入口，非报错样式 -->
      <p v-if="!filteredPresets.length" class="empty" data-testid="preset-type-empty">
        没有这类模板，试试「全部」
        <PtButton variant="ghost" type="button" data-testid="clear-filter" @click.stop="filter = ''">
          清空筛选
        </PtButton>
      </p>
      <div v-else class="grid">
        <!-- 新建空白表专属卡（FR-C6 / Q-10）：区别于普通预设卡，带最小向导；按类型筛选时隐藏 -->
        <article v-if="filter === ''" class="card blank-card" data-testid="blank-card">
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

        <article v-for="t in filteredPresets" :key="t.templateId" class="card">
          <!-- PX-06：模板卡缩略图（纯 CSS 骨架示意，固定宽高比） -->
          <TemplateThumb :instance="t" />
          <span class="chip">{{ typeLabel(t) }}</span>
          <h3>{{ t.meta?.displayName }}</h3>
          <p>{{ t.meta?.description }}</p>
          <!-- FR-20 §2.2：防误解小字（价目「不会自动计算」/ 矩阵「首列固定」） -->
          <p v-if="typeHint(t)" class="hint" data-testid="tpl-hint">{{ typeHint(t) }}</p>
          <PtButton type="button" @click.stop="() => useTpl(t)">使用此模板</PtButton>
        </article>
      </div>
    </section>

    <section>
      <div class="mine-head">
        <h2>我的表格</h2>
        <div class="mine-tools">
          <!-- P2 全量备份：mine 全部 → 单文件 JSON 下载 -->
          <PtButton
            variant="ghost"
            type="button"
            data-testid="backup-all-btn"
            @click.stop="onBackupAll"
          >
            备份全部
          </PtButton>
          <!-- P2 导入备份：隐藏 file input 选 .json 整包还原 -->
          <PtButton
            variant="ghost"
            type="button"
            data-testid="restore-backup-btn"
            @click.stop="onRestoreClick"
          >
            导入备份
          </PtButton>
          <!-- 模板 JSON 导入（跨设备同步）：文件或粘贴文本，核内校验后入库 -->
          <PtButton variant="ghost" type="button" data-testid="import-btn" @click.stop="openImport">
            导入模板
          </PtButton>
        </div>
      </div>
      <input
        ref="restoreFileRef"
        type="file"
        accept=".json,application/json"
        class="restore-file"
        aria-label="选择备份 JSON 文件"
        data-testid="restore-backup-file"
        @change="onRestoreFile"
      />
      <p v-if="library.listError" class="err">
        {{ library.listError }}
        <PtButton variant="ghost" type="button" @click.stop="() => library.refreshMine()">重试</PtButton>
      </p>
      <!-- FR-20 §2.3：我的模板该类为空 → 按类型空态文案（筛选中时优先于通用空态；非报错样式） -->
      <p v-else-if="filter !== '' && !filteredMine.length" class="empty" data-testid="mine-type-empty">
        还没有存过{{ filterLabel }}模板。选一张系统模板改好后，点「另存为模板」就会出现在这里
      </p>
      <p v-else-if="!library.mine.length" class="empty">还没有我的模板。在编辑台「另存为模板」后会出现在这里。</p>
      <div v-else class="grid">
        <article v-for="t in filteredMine" :key="t.templateId" class="card">
          <!-- PX-06：我的模板卡同款缩略图 -->
          <TemplateThumb :instance="t" />
          <!-- PX-10：类型标识（复用系统模板 typeLabel）+「我的」标识 -->
          <div class="chips">
            <span class="chip mine">我的</span>
            <span class="chip" data-testid="tpl-type-chip">{{ typeLabel(t) }}</span>
          </div>
          <h3>{{ t.meta?.displayName || '未命名模板' }}</h3>
          <p>{{ t.meta?.savedAt ? new Date(t.meta.savedAt).toLocaleString() : '' }}</p>
          <!-- FR-20 §2.2：防误解小字同源（我的模板卡同样提示） -->
          <p v-if="typeHint(t)" class="hint" data-testid="tpl-hint">{{ typeHint(t) }}</p>
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
    <!-- P3：删除 10 秒撤销条（fixed 底部居中，倒计时归零自动消失） -->
    <div v-if="undoLeft > 0 && undoSnapshot" class="undo-bar" data-testid="undo-bar" role="status">
      <span>已删除《{{ undoSnapshot.meta?.displayName || '未命名模板' }}》</span>
      <PtButton variant="ghost" type="button" data-testid="undo-btn" @click.stop="undoRemoveTpl">
        撤销
      </PtButton>
      <span class="undo-count">· {{ undoLeft }}s</span>
    </div>
    <!-- PX-10：重命名小弹层（ConfirmDialog 同风格） -->
    <RenameDialog
      v-model:open="renameOpen"
      heading="重命名模板"
      :initial-name="renameTarget?.meta?.displayName ?? ''"
      @confirm="onRename"
    />

    <!-- 模板 JSON 导入小弹层：选 .json 文件或粘贴文本，导入走核内 instanceFromJSON 校验 -->
    <div v-if="importOpen" class="import-overlay" data-testid="import-dialog">
      <div
        class="import-box"
        role="dialog"
        aria-modal="true"
        aria-label="导入模板"
      >
        <div class="import-head">
          <strong>导入模板</strong>
          <PtButton variant="ghost" type="button" data-testid="import-close" @click.stop="importOpen = false">
            关闭
          </PtButton>
        </div>
        <p class="import-hint">选择本机导出的 .pretty-table.json 文件，或把模板 JSON 文本粘贴到下面。</p>
        <input
          type="file"
          accept=".json,application/json"
          data-testid="import-file"
          aria-label="选择模板 JSON 文件"
          @change="onImportFile"
        />
        <textarea
          v-model="importText"
          class="import-text"
          rows="8"
          placeholder="粘贴模板 JSON 文本"
          data-testid="import-text"
        />
        <div class="import-actions">
          <PtButton variant="ghost" type="button" @click.stop="importOpen = false">取消</PtButton>
          <PtButton type="button" data-testid="import-confirm" @click.stop="confirmImport">导入</PtButton>
        </div>
      </div>
    </div>
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
  /* T10：卡面数字位（保存时间等）对齐不跳（属性式） */
  font-variant-numeric: tabular-nums;
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
  /* T10：数值输入（行数/列数/层级）对齐（属性式） */
  font-variant-numeric: tabular-nums;
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
/* FR-20 §2.1：类型筛选 chips（复用 chip 药丸视觉，按钮态 + 选中态） */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}
.fchip {
  align-self: auto;
  font: inherit;
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--pt-border);
  cursor: pointer;
}
.fchip.active {
  background: var(--pt-primary);
  border-color: var(--pt-primary);
  color: #fff;
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
/* FR-20 §2.2：卡片防误解小字（比描述更弱一级） */
.hint {
  font-size: 12px;
  color: var(--pt-muted);
}
/* 模板 JSON 导入：小节标题行 + 弹层（ExportDrawer 预览小窗同风格） */
.mine-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
/* P2：标题右侧工具组（备份全部 / 导入备份 / 导入模板），窄屏允许换行 */
.mine-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.mine-tools > :deep(button) {
  flex: none;
}
/* P2：导入备份的隐藏 file input（只经按钮触发 click） */
.restore-file {
  display: none;
}
/* P3：删除撤销条（fixed 底部居中；配色全部走 CSS 变量派生，无硬编码色值） */
.undo-bar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: var(--pt-z-toolbar);
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  padding: 8px 14px;
  border: 1px solid var(--pt-border);
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
  font-size: 13px;
  white-space: nowrap;
}
.undo-count {
  color: var(--pt-muted);
  /* 倒计时数字对齐不跳（属性式） */
  font-variant-numeric: tabular-nums;
}
.import-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  z-index: var(--pt-z-toolbar);
  display: flex;
  align-items: center;
  justify-content: center;
}
.import-box {
  background: #fff;
  border: 1px solid var(--pt-border);
  border-radius: 12px;
  padding: 16px;
  width: min(560px, 92vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 6px 18px rgb(0 0 0 / 12%);
}
.import-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.import-hint {
  margin: 0;
  font-size: 13px;
  color: #6b7280;
}
.import-box input[type='file'] {
  font: inherit;
  font-size: 13px;
}
.import-text {
  width: 100%;
  box-sizing: border-box;
  font: 12px/1.4 ui-monospace, monospace;
  border: 1px solid var(--pt-border);
  border-radius: 8px;
  padding: 8px;
  resize: vertical;
}
.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
