export function isDebugBuild(): boolean {
  return import.meta.env.VITE_PT_DEBUG === '1' || import.meta.env.DEV
}

export function wantsDebugPanel(): boolean {
  if (typeof location === 'undefined') return false
  return isDebugBuild() && new URLSearchParams(location.search).get('pt-debug') === '1'
}

export function pngMaxOverride(): number | undefined {
  if (typeof location === 'undefined') return undefined
  const v = new URLSearchParams(location.search).get('pt-png-max')
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
