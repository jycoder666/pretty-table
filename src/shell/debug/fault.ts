const always = new Set<string>()
const once = new Set<string>()

export function parseFaultQuery(search: string) {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const raw = sp.get('pt-fault')
  if (!raw) return
  for (const part of raw.split(',')) {
    if (part.endsWith('!')) always.add(part.slice(0, -1))
    else once.add(part)
  }
}

export function faultGate(code: string): boolean {
  if (always.has(code)) return true
  if (once.has(code)) {
    once.delete(code)
    return true
  }
  return false
}

if (typeof location !== 'undefined') {
  parseFaultQuery(location.search)
}
