import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  listPresetTemplates,
  type TemplateInstance,
  cloneInstance,
  instanceToJSON,
  instanceFromJSON,
} from '@/core'
import { createIdbTemplateRepo } from '../repo/idbTemplateRepo'
import { ensureSeeded } from '../repo/seedTemplates'
import { triggerBlobDownload } from '../export/blobDownload'

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
      // 内置需求表播种（tables/*.json →「我的模板」，幂等）：先种后列，
      // 保证库页任意时刻进入都能看到种子；播种失败不阻塞列表（注册键未写，下次刷新重试）
      try {
        await ensureSeeded()
      } catch {
        /* noop */
      }
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

  /** Schema 1.5：导出 PNG 后自动写入模板封面（meta.cover，库页卡片展示）。
   * 模板不存在（预设未另存）静默跳过；失败不抛（封面是非关键附属数据）。 */
  async function setTemplateCover(templateId: string, cover: string) {
    try {
      // 直读 repo（不依赖 mine 缓存——用户可能未进过库页直接在编辑台导出）
      const t = await repo.get(templateId)
      if (!t) return false
      t.meta = { ...t.meta, cover }
      await repo.save(t)
      const idx = mine.value.findIndex((x) => x.templateId === templateId)
      if (idx >= 0) mine.value[idx] = t
      return true
    } catch {
      return false
    }
  }

  /** PX-10：重命名「我的模板」（改 meta.displayName 后经 repo.save 原键覆盖持久化）。
   * 返回是否成功，提示文案由页面层决定。 */
  async function renameTemplate(templateId: string, displayName: string): Promise<boolean> {
    const t = mine.value.find((x) => x.templateId === templateId)
    if (!t) return false
    const next = cloneInstance(t)
    next.meta = { ...next.meta, displayName }
    try {
      await repo.save(next)
      await refreshMine()
      return true
    } catch {
      return false
    }
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

  /**
   * JSON 导入（跨设备同步）：沿用 repo.save 的键机制（tpl:<templateId>）——
   * 同 id 直接覆盖（同一份文件重复导入幂等，不产生重复卡）。
   * origin 归一 user、savedAt 记导入时刻；templateId 沿用文件里的，
   * 缺失时（理论上 instanceFromJSON 已挡）兜底生成新 id。
   * 返回是否成功，提示文案由页面层决定。
   */
  async function importTemplate(inst: TemplateInstance): Promise<boolean> {
    const saved = cloneInstance(inst)
    if (!saved.templateId) {
      saved.templateId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    }
    saved.meta = { ...saved.meta, origin: 'user', savedAt: new Date().toISOString() }
    try {
      await repo.save(saved)
      await refreshMine()
      return true
    } catch {
      return false
    }
  }

  /**
   * P2 全量备份：「我的模板」全部 → 单文件 JSON 下载。
   * 每张先经核内 instanceToJSON 规范化（validate+migrate）再回填 payload；
   * 规范化失败的个别卡跳过不计入 count。文件名 pretty-table-backup-<YYYYMMDD-HHmm>.json。
   */
  async function backupAll(): Promise<{ ok: boolean; count: number; error?: string }> {
    if (mine.value.length === 0) return { ok: false, count: 0, error: '还没有可备份的模板' }
    const templates: unknown[] = []
    for (const t of mine.value) {
      const r = instanceToJSON(t)
      if (!r.ok) continue
      try {
        templates.push(JSON.parse(r.value))
      } catch {
        /* 单张序列化异常跳过，不挡整包 */
      }
    }
    if (templates.length === 0) return { ok: false, count: 0, error: '备份失败，请重试' }
    const payload = {
      app: 'pretty-table',
      version: 1,
      exportedAt: new Date().toISOString(),
      templates,
    }
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      triggerBlobDownload(blob, `pretty-table-backup-${stamp}.json`)
    } catch {
      return { ok: false, count: 0, error: '备份失败，请重试' }
    }
    return { ok: true, count: templates.length }
  }

  /**
   * P2 导入备份：逐张 instanceFromJSON 校验（非法跳过计数）→ repo.save 同 id 覆盖 → refreshMine。
   * text 解析失败 / 不是本应用备份 → imported=0 + error（页面 toast）。
   */
  async function restoreBackup(
    text: string,
  ): Promise<{ imported: number; skipped: number; error?: string }> {
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return { imported: 0, skipped: 0, error: '不是 pretty-table 备份文件' }
    }
    const p = payload as { app?: unknown; templates?: unknown }
    if (
      !p ||
      typeof p !== 'object' ||
      p.app !== 'pretty-table' ||
      !Array.isArray(p.templates)
    ) {
      return { imported: 0, skipped: 0, error: '不是 pretty-table 备份文件' }
    }
    let imported = 0
    let skipped = 0
    for (const item of p.templates) {
      // instanceFromJSON 只吃文本：逐张回填字符串再走核内校验链
      let raw: string
      try {
        raw = JSON.stringify(item)
      } catch {
        skipped++
        continue
      }
      const r = instanceFromJSON(raw)
      if (!r.inst) {
        skipped++
        continue
      }
      try {
        await repo.save(r.inst)
        imported++
      } catch {
        skipped++
      }
    }
    await refreshMine()
    return { imported, skipped }
  }

  /**
   * P3 删除撤销：把删除前的内存快照原样重新落库（同 id 恢复）+ 刷新列表。
   * 返回是否成功，提示文案由页面层决定。
   */
  async function undoRemove(snapshot: TemplateInstance): Promise<boolean> {
    try {
      await repo.save(snapshot)
      await refreshMine()
      return true
    } catch {
      return false
    }
  }

  return {
    presets,
    mine,
    listError,
    loading,
    refreshMine,
    saveAsTemplate,
    setTemplateCover,
    renameTemplate,
    removeTemplate,
    importTemplate,
    backupAll,
    restoreBackup,
    undoRemove,
  }
})
