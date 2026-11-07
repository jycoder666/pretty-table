import { get, set } from 'idb-keyval'
import type { TemplateInstance } from '@/core'
import { validateInstance } from '@/core'
import { kvStore } from './kvStore'
import { TPL_KEY_PREFIX } from './idbTemplateRepo'

/**
 * 内置需求表自动播种（tables/*.json →「我的模板」）：
 * - tables/ 下 8 张中文命名 JSON 经 import.meta.glob 构建期收为内置种子，
 *   文件名去扩展名即显示名（与 meta.displayName 原值无关，以后者为准会被覆盖）。
 * - 幂等策略：每张种子设注册键 seed:<templateId> 追踪是否已种过——
 *   注册键存在 → 跳过（含用户删除后：removeTemplate 只删 tpl: 键不删注册键，故不复活）；
 *   注册键不存在但 tpl:<templateId> 已有值（用户跨机导入过同 id 模板）→ 不覆盖用户数据，
 *   只补登记注册键，此后不再尝试；
 *   两者皆无 → 写 tpl:<templateId>（displayName=文件名、savedAt=播种时刻）+ 注册键。
 * - 跨标签页同时首播的竞态窗口内可能同键重复写同内容，最终幂等无重复卡，可接受。
 */

/** 种子注册键前缀：值为种子文件名（调试友好），存在即表示该种子已处理过 */
const SEED_KEY_PREFIX = 'seed:'

export interface SeedTemplate {
  /** 文件名去扩展名，播种时的 displayName */
  fileName: string
  instance: TemplateInstance
}

function seedNameOf(globPath: string): string {
  const base = globPath.split('/').pop() ?? ''
  try {
    return decodeURIComponent(base).replace(/\.json$/, '')
  } catch {
    return base.replace(/\.json$/, '')
  }
}

// '/tables/*.json' 以项目根为基准（vite build 与 vitest root 一致）；eager 构建期内联
const seedFiles = import.meta.glob<TemplateInstance>('/tables/*.json', {
  eager: true,
  import: 'default',
})

/** 内置种子清单：glob 收集 → 文件名提取 → validate 挡坏文件（跳过并 warn），按文件名排序保证确定性 */
export const SEED_TEMPLATES: SeedTemplate[] = Object.entries(seedFiles)
  .flatMap(([path, raw]) => {
    const fileName = seedNameOf(path)
    const r = validateInstance(raw)
    if (!r.ok) {
      console.warn(`[seedTemplates] 跳过校验不过的内置表 ${fileName}`, r.error)
      return []
    }
    return [{ fileName, instance: r.value }]
  })
  .sort((a, b) => a.fileName.localeCompare(b.fileName))

let inflight: Promise<void> | null = null

/** 应用启动幂等播种（refreshMine 前调用）；同会话并发调用共享同一次执行 */
export function ensureSeeded(): Promise<void> {
  if (!inflight) {
    inflight = runSeed().finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function runSeed(): Promise<void> {
  const now = new Date().toISOString()
  for (const { fileName, instance } of SEED_TEMPLATES) {
    const seedKey = SEED_KEY_PREFIX + instance.templateId
    if (await get(seedKey, kvStore)) continue
    const tplKey = TPL_KEY_PREFIX + instance.templateId
    if (await get(tplKey, kvStore)) {
      // 用户库已有同 id 模板（跨机导入等）：不覆盖，仅登记注册键
      await set(seedKey, fileName, kvStore)
      continue
    }
    // 深拷贝后写库，避免污染 glob eager 的模块级单例
    const inst: TemplateInstance = JSON.parse(JSON.stringify(instance))
    inst.meta = { ...inst.meta, displayName: fileName, savedAt: now }
    await set(tplKey, inst, kvStore)
    await set(seedKey, fileName, kvStore)
  }
}
