/**
 * 故障注入（GC-19）：仅调试构建可用。
 * 生产构建里 VITE_PT_DEBUG 经 vite define 折叠为空串、DEV 为 false，
 * 调用点再用 PT_DEBUG 常量守卫后，本模块会被整体摇树（?pt-fault 不进包）。
 */

/** 与各调用点的 PT_DEBUG 常量保持同一表达式，保证可静态求值 */
const DEBUG_ENABLED = import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV

const always = new Set<string>()
const once = new Set<string>()

export function parseFaultQuery(search: string) {
  if (!DEBUG_ENABLED) return
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw = sp.get('pt-fault')
  if (!raw) return
  for (const part of raw.split(',')) {
    if (part.endsWith('!')) always.add(part.slice(0, -1))
    else once.add(part)
  }
}

export function faultGate(code: string): boolean {
  if (!DEBUG_ENABLED) return false
  if (always.has(code)) return true
  if (once.has(code)) {
    once.delete(code)
    return true
  }
  return false
}

if (DEBUG_ENABLED && typeof location !== 'undefined') {
  parseFaultQuery(location.search)
}
