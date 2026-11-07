import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPngScale, setPngScale } from './prefs'

const KEY = 'pt.pref.pngScale'

// Node 26 实验性 localStorage 需 --localstorage-file 启动参数，vitest 环境未注入：
// prefs.ts 本就要求「localStorage 不可用时静默回退」，此处给同接口内存桩保证测试可跑。
if (typeof localStorage === 'undefined') {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
  })
}

describe('PNG 倍率偏好（pt.pref.pngScale）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认 2×', () => {
    expect(getPngScale()).toBe(2)
  })

  it('记住上次选择（刷新后仍为上次值）', () => {
    setPngScale(3)
    expect(getPngScale()).toBe(3)
    setPngScale(1)
    expect(getPngScale()).toBe(1)
    expect(localStorage.getItem(KEY)).toBe('1')
  })

  it('存值非法（超出 1/2/3）回退默认 2', () => {
    localStorage.setItem(KEY, '9')
    expect(getPngScale()).toBe(2)
  })
})
