/**
 * 调试开关（GC-19）：仅调试构建生效。
 * 生产构建里调用点用 PT_DEBUG 常量守卫后，本模块会被整体摇树。
 */

export function isDebugBuild(): boolean {
  return import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV
}

export function wantsDebugPanel(): boolean {
  if (!isDebugBuild()) return false
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get('pt-debug') === '1'
}

export function pngMaxOverride(): number | undefined {
  if (!isDebugBuild()) return undefined
  if (typeof location === 'undefined') return undefined
  const v = new URLSearchParams(location.search).get('pt-png-max')
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
