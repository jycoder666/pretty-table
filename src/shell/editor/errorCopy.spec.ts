import { describe, expect, it } from 'vitest'
import { errorCopy, warnCopy } from './errorCopy'

describe('errorCopy — 错误/警告白话文案', () => {
  it('结构编辑相关错误码（T04 新增）', () => {
    expect(errorCopy('LIMIT_ROWS')).toBe('最多 20 行，加不下了')
    expect(errorCopy('LIMIT_COLS')).toBe('最多 12 列')
    expect(errorCopy('MERGE_CONFLICT')).toBe('和已有的合并区叠不上，请先拆开再合并')
  })

  it('既有错误码不受影响', () => {
    expect(errorCopy('SLOT_MISS')).toBe('请放到表内虚线槽位')
    expect(errorCopy('NOT_A_CODE' as never, '兜底')).toBe('兜底')
  })

  it('warnCopy：STRUCT_LOSS / UNKNOWN_FIELD 有白话映射，未知码兜底', () => {
    expect(warnCopy('STRUCT_LOSS')).toContain('合并或内容')
    expect(warnCopy('UNKNOWN_FIELD')).toContain('忽略')
    expect(warnCopy('MARK_UNKNOWN')).toBe('部分内容已按默认处理')
  })
})
