/**
 * 模板 JSON 导出/导入（跨设备同步基础设施 · 核内单点，壳只做文件 IO）。
 *
 * - instanceToJSON：TemplateInstance → 漂亮的 JSON 文本。写前先走既有
 *   validate → migrate 清洗链（与读档同源），落盘即规范形态：
 *   schemaVersion 恒为当前版本、meta 一定存在且带 displayName。
 * - instanceFromJSON：JSON 文本 → TemplateInstance。parse → validate →
 *   migrate 全链清洗；任何一步不合法安全拒绝（inst=null + 白话 reason），
 *   绝不把半残实例交给壳层入库。
 *
 * 纯数据函数：无 Vue/Pinia/DOM 依赖（G-AR-01 壳→store→核）。
 */
import type { TemplateInstance } from '../types'
import { fail, ok, type CoreWarning, type Result } from '../errors'
import { cloneInstance, validateInstance } from '../schema/validate'
import { migrateInstance, SCHEMA_VERSION_CURRENT } from '../schema/migrate'
import { listPresetTemplates } from '../templates'

/** caption 槽文字（displayName 缺省时的表名回退源，FR-25 同源） */
function captionText(inst: TemplateInstance): string | null {
  const sid = inst.layout?.captionSlot
  if (!sid) return null
  const v = inst.slots?.[sid]
  if (typeof v === 'string') return v.trim() || null
  if (v && typeof v === 'object' && 'text' in v) {
    return String((v as { text?: unknown }).text ?? '').trim() || null
  }
  return null
}

/**
 * 序列化：实例 → JSON 文本（validate+migrate 规范化后落盘）。
 * 产出保证含 schemaVersion（恒当前版本）与 meta.displayName
 * （缺省时回退 caption 槽文字，再回退 templateId）。
 * templateId 若是共享底稿 id（预设 / blank-new）→ 加盖 user- 唯一 id：
 * 不同表各自导出不互相碰撞（导入同 id 覆盖，两个 blank 底稿表不能互相顶掉）；
 * 已另存的 user-id 原样保留（同一张表跨设备再导入 = 覆盖更新，不产生重复卡）。
 * 实例非法（连 validate 都过不了）→ fail，不产出半残文件。
 */
export function instanceToJSON(inst: TemplateInstance): Result<string> {
  const v = validateInstance(inst)
  if (!v.ok) return v
  const m = migrateInstance(v.value, listPresetTemplates())
  const clean = m.ok ? m.value : v.value

  clean.schemaVersion = SCHEMA_VERSION_CURRENT
  clean.meta = { ...clean.meta }
  const name =
    String(clean.meta.displayName ?? '').trim() ||
    captionText(clean) ||
    clean.templateId
  clean.meta.displayName = name

  if (isSharedBaseId(clean.templateId)) {
    clean.templateId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  return ok(JSON.stringify(cloneInstance(clean), null, 2))
}

/** 共享底稿 id（blank 向导产物与系统预设）：导出时需加盖唯一 id，避免跨表同 id 覆盖 */
function isSharedBaseId(id: string): boolean {
  if (id === 'blank-new') return true
  return listPresetTemplates().some((p) => p.templateId === id)
}

export interface TransferParseResult {
  /** 成功 = 清洗后的模板实例；失败恒为 null（半残实例不出核） */
  inst: TemplateInstance | null
  /** 失败原因（白话，可直接进 toast）；成功为 null */
  reason: string | null
  /** validate/migrate 聚合的宽容告警（图片损坏清空、颜色回退等） */
  warnings: CoreWarning[]
}

/** 传输格式的硬门槛：meta.displayName 必须存在且非空（导出侧恒写出） */
function hasDisplayName(o: unknown): boolean {
  if (!o || typeof o !== 'object') return false
  const meta = (o as { meta?: unknown }).meta
  if (!meta || typeof meta !== 'object') return false
  const name = (meta as { displayName?: unknown }).displayName
  return typeof name === 'string' && name.trim().length > 0
}

/**
 * 反序列化：JSON 文本 → 实例。非法输入安全拒绝（inst=null + reason）：
 * - 空文本 / JSON.parse 失败 / 顶层不是对象
 * - 缺 meta.displayName（传输格式门槛）
 * - 结构缺件（templateId/slots/blocks/layout/themeId）或版本过新（validate/migrate）
 * - 内容为空（slots 无键且 blocks 空）
 * 宽容项（旧版本、坏图、坏色）按既有链清洗为 warnings，不拒整表。
 */
export function instanceFromJSON(text: string): TransferParseResult {
  if (typeof text !== 'string' || !text.trim()) {
    return { inst: null, reason: '文件是空的', warnings: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { inst: null, reason: '不是有效的 JSON 文件', warnings: [] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { inst: null, reason: '文件内容不是模板数据', warnings: [] }
  }
  if (!hasDisplayName(parsed)) {
    return { inst: null, reason: '缺少模板表名（meta.displayName）', warnings: [] }
  }

  const v = validateInstance(parsed)
  if (!v.ok) {
    return { inst: null, reason: v.error.message, warnings: [] }
  }
  const m = migrateInstance(v.value, listPresetTemplates())

  // 内容为空闸：slots 无键且 blocks 空（validate 只查字段存在，不查内容）
  const cand = (m.ok ? m.value : v.value) as TemplateInstance
  const slotKeys = cand.slots ? Object.keys(cand.slots).length : 0
  if (slotKeys === 0 && cand.blocks.length === 0) {
    return { inst: null, reason: '模板内容是空的', warnings: [] }
  }

  const warnings: CoreWarning[] = [...(v.warnings ?? []), ...(m.ok ? (m.warnings ?? []) : [])]
  return { inst: cand, reason: null, warnings }
}
