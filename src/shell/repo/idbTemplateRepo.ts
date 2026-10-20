import { get, set, del, keys } from 'idb-keyval'
import type { TemplateInstance } from '@/core'
import { validateInstance } from '@/core'
import type { TemplateRepo } from './templateRepo'
import { kvStore } from './kvStore'
import { faultGate } from '../debug/fault'

const PREFIX = 'tpl:'

/** GC-19：调试开关构建期常量；生产构建折叠为 false，faultGate 调用被摇树 */
const PT_DEBUG = import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV

export function createIdbTemplateRepo(): TemplateRepo {
  return {
    async list() {
      if (PT_DEBUG && faultGate('TEMPLATE_LIST_FAIL')) throw { code: 'TEMPLATE_LIST_FAIL', message: 'list fail' }
      const ks = (await keys(kvStore)) as string[]
      const out: TemplateInstance[] = []
      for (const k of ks) {
        if (typeof k !== 'string' || !k.startsWith(PREFIX)) continue
        const v = await get(k, kvStore)
        const r = validateInstance(v)
        if (r.ok) out.push(r.value)
      }
      return out.sort((a, b) =>
        String(b.meta?.savedAt ?? '').localeCompare(String(a.meta?.savedAt ?? '')),
      )
    },
    async get(templateId: string) {
      const v = await get(PREFIX + templateId, kvStore)
      if (!v) return null
      const r = validateInstance(v)
      return r.ok ? r.value : null
    },
    async save(inst: TemplateInstance) {
      if (PT_DEBUG && faultGate('TEMPLATE_SAVE_FAIL')) {
        throw { code: 'TEMPLATE_SAVE_FAIL', message: 'save fail', details: { reason: 'io' } }
      }
      const plain = JSON.parse(JSON.stringify(inst)) as TemplateInstance
      await set(PREFIX + plain.templateId, plain, kvStore)
    },
    async remove(templateId: string) {
      // 故障注入（GC-19 / PX-01）：?pt-fault=TEMPLATE_DELETE_FAIL → 删除失败
      if (PT_DEBUG && faultGate('TEMPLATE_DELETE_FAIL')) {
        throw { code: 'TEMPLATE_DELETE_FAIL', message: 'remove fail', details: { reason: 'io' } }
      }
      await del(PREFIX + templateId, kvStore)
    },
  }
}
