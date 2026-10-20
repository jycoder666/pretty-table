import { beforeEach, describe, expect, it } from 'vitest'
import { getPngScale, setPngScale } from './prefs'

const KEY = 'pt.pref.pngScale'

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
