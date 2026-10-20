import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listPresetTemplates,
  type TemplateInstance,
  cloneInstance,
} from '@/core'
import { createIdbTemplateRepo } from '../repo/idbTemplateRepo'

const repo = createIdbTemplateRepo()

export const useLibraryStore = defineStore('library', () => {
  const presets = ref<TemplateInstance[]>(listPresetTemplates())
  const mine = ref<TemplateInstance[]>([])
  const listError = ref<string | null>(null)
  const loading = ref(false)

  async function refreshMine() {
    loading.value = true
    listError.value = null
    try {
      mine.value = await repo.list()
    } catch {
      listError.value = '我的模板加载失败，请重试'
    } finally {
      loading.value = false
    }
  }

  async function saveAsTemplate(inst: TemplateInstance, displayName: string) {
    const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const saved = cloneInstance(inst)
    saved.templateId = id
    saved.meta = {
      ...saved.meta,
      displayName,
      origin: 'user',
      sourceTemplateId: inst.templateId,
      savedAt: new Date().toISOString(),
    }
    await repo.save(saved)
    await refreshMine()
    return saved
  }

  /** PX-01：删除「我的模板」（IndexedDB 键 tpl:<templateId>），成功后刷新列表。
   * 返回是否成功，提示文案由页面层决定。 */
  async function removeTemplate(templateId: string): Promise<boolean> {
    try {
      await repo.remove(templateId)
      await refreshMine()
      return true
    } catch {
      return false
    }
  }

  return { presets, mine, listError, loading, refreshMine, saveAsTemplate, removeTemplate }
})
