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
 *   注册键存在 → 跳过（用户删除后 removeTemplate 只删 tpl: 键不删注册键，故不复活）；
 *   注册键不存在 → 写 tpl:<templateId> 覆盖同 id 旧数据 + 落注册键
 *   （首次播种即视为用户手动初创建，覆盖旧同名条目——用户 2026-11-08 拍板）。
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

// '/tables/*.json' 以项目根为基准（vite build 与 vitest root 一致）。
// P6（体积门禁）：eager:false 懒加载——8 张种子 JSON 移出主包静态图，
// 首次 ensureSeeded 时按需动态加载；播种语义（注册键幂等 + 首次覆盖）完全不变。
const seedFiles = import.meta.glob<TemplateInstance>('/tables/*.json', {
  eager: false,
  import: 'default',
})

/** 内置种子清单（懒加载后填充；数组引用稳定，按文件名排序保证确定性）。
 * validate 挡坏文件（跳过并 warn）在动态加载后进行，与原 eager 口径一致。 */
export const SEED_TEMPLATES: SeedTemplate[] = []

let loaded: Promise<SeedTemplate[]> | null = null

/** 动态加载全部种子 JSON → 校验 → 缓存进 SEED_TEMPLATES（只加载一次；失败可重试） */
function loadSeedTemplates(): Promise<SeedTemplate[]> {
  if (!loaded) {
    loaded = (async () => {
      const items = await Promise.all(
        Object.entries(seedFiles).map(async ([path, load]) => {
          const fileName = seedNameOf(path)
          try {
            const raw = await load()
            const r = validateInstance(raw)
            if (!r.ok) {
              console.warn(`[seedTemplates] 跳过校验不过的内置表 ${fileName}`, r.error)
              return null
            }
            return { fileName, instance: r.value }
          } catch (e) {
            console.warn(`[seedTemplates] 内置表 ${fileName} 加载失败`, e)
            return null
          }
        }),
      )
      const ok = items
        .filter((x): x is SeedTemplate => x !== null)
        .sort((a, b) => a.fileName.localeCompare(b.fileName))
      SEED_TEMPLATES.splice(0, SEED_TEMPLATES.length, ...ok)
      return SEED_TEMPLATES
    })()
    // 加载失败不缓存 rejection：下次 ensureSeeded 重试（与播种失败不阻塞列表的口径一致）
    loaded.catch(() => {
      loaded = null
    })
  }
  return loaded
}

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
  // P6：种子 JSON 懒加载（首次调用时动态 import，之后走缓存）
  const seeds = await loadSeedTemplates()
  const now = new Date().toISOString()
  for (const { fileName, instance } of seeds) {
    const seedKey = SEED_KEY_PREFIX + instance.templateId
    if (await get(seedKey, kvStore)) continue
    // 注册键不存在：覆盖写入（等同用户手动初创建，2026-11-08 拍板）；
    // 深拷贝避免污染动态加载的模块级单例
    const tplKey = TPL_KEY_PREFIX + instance.templateId
    const inst: TemplateInstance = JSON.parse(JSON.stringify(instance))
    inst.meta = { ...inst.meta, displayName: fileName, savedAt: now }
    await set(tplKey, inst, kvStore)
    await set(seedKey, fileName, kvStore)
  }
}
