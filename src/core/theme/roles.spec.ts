import { describe, expect, it } from 'vitest'
import { PALETTES, cloneInstance, type TemplateInstance, type ThemeId } from '../index'
import {
  ROLE_KEYS,
  ROLE_LABELS,
  effectivePalette,
  isRoleOverridden,
  roleColorOf,
} from './roles'
import { BLANK_V1 } from '../templates'

function inst(): TemplateInstance {
  return cloneInstance(BLANK_V1)
}

describe('theme/roles — 六角色色壳层消费辅助', () => {
  it('无覆盖时：生效配色 = 预设配色，六角色均未覆盖', () => {
    const i = inst()
    expect(effectivePalette(i)).toEqual(PALETTES[i.themeId as ThemeId])
    for (const k of ROLE_KEYS) {
      expect(isRoleOverridden(i, k)).toBe(false)
    }
  })

  it('roleColorOf 映射正确：background 读 Palette.paper，其余同名', () => {
    const i = inst()
    expect(roleColorOf(i, 'primary')).toBe(PALETTES[i.themeId as ThemeId].primary)
    expect(roleColorOf(i, 'background')).toBe(PALETTES[i.themeId as ThemeId].paper)
    expect(roleColorOf(i, 'headerText')).toBe(PALETTES[i.themeId as ThemeId].headerText)
  })

  it('带覆盖实例：生效色取合成结果，该角色判为已覆盖，其余仍预设', () => {
    const i = inst()
    i.themeTokens = { primary: '#123456' }
    expect(roleColorOf(i, 'primary')).toBe('#123456')
    expect(isRoleOverridden(i, 'primary')).toBe(true)
    expect(isRoleOverridden(i, 'zebra')).toBe(false)
  })

  it('six roles 全列出且有中文标签', () => {
    expect(ROLE_KEYS).toEqual([
      'primary',
      'headerText',
      'zebra',
      'emphasis',
      'border',
      'background',
    ])
    for (const k of ROLE_KEYS) {
      expect(ROLE_LABELS[k].length).toBeGreaterThan(0)
    }
  })

  it('空入参安全：null 返回 #000000 / 未覆盖 / null 配色', () => {
    expect(effectivePalette(null)).toBeNull()
    expect(roleColorOf(null, 'primary')).toBe('#000000')
    expect(isRoleOverridden(null, 'primary')).toBe(false)
  })
})
