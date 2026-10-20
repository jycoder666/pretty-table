import { get, set, del } from 'idb-keyval'
import type { TemplateInstance } from '@/core'
import { validateInstance } from '@/core'
import { kvStore } from './kvStore'
import { faultGate } from '../debug/fault'

const KEY = 'draft:current'

/** GC-19：调试开关构建期常量；生产构建折叠为 false，faultGate 调用被摇树 */
const PT_DEBUG = import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV

export interface DraftPayload {
  instance: TemplateInstance
  savedAt: string
}

export async function saveDraft(instance: TemplateInstance): Promise<void> {
  if (PT_DEBUG && faultGate('DRAFT_SAVE_FAIL')) throw { code: 'DRAFT_SAVE_FAIL', message: 'draft save fail' }
  // JSON round-trip: IndexedDB structuredClone cannot clone Vue reactive proxies
  const plain = JSON.parse(JSON.stringify(instance)) as TemplateInstance
  const payload: DraftPayload = { instance: plain, savedAt: new Date().toISOString() }
  await set(KEY, payload, kvStore)
}

export async function loadDraft(): Promise<DraftPayload | null> {
  if (PT_DEBUG && faultGate('DRAFT_RESTORE_FAIL')) throw { code: 'DRAFT_RESTORE_FAIL', message: 'draft restore fail' }
  const v = await get(KEY, kvStore)
  if (!v || typeof v !== 'object') return null
  const p = v as DraftPayload
  const r = validateInstance(p.instance)
  if (!r.ok) {
    await del(KEY, kvStore)
    return null
  }
  return { instance: r.value, savedAt: p.savedAt }
}

export async function clearDraft(): Promise<void> {
  await del(KEY, kvStore)
}
