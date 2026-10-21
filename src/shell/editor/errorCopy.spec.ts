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

  it('图片类错误码（R-3 / 交互升级 T04）：白话文案，不露码', () => {
    expect(errorCopy('IMAGE_TOO_LARGE')).toContain('图片太大')
    expect(errorCopy('IMAGE_BUDGET_EXCEEDED')).toContain('上限')
    expect(errorCopy('IMAGE_FORMAT_UNSUPPORTED')).toContain('PNG')
    expect(errorCopy('IMAGE_NOT_ALLOWED')).toContain('不能放图片')
    expect(errorCopy('IMAGE_DECODE_FAIL')).toContain('读不出来')
    // 读时清洗 warn：IMAGE_INVALID 聚合白话
    expect(warnCopy('IMAGE_INVALID')).toContain('已清空')
  })

  it('PNG 导出空图守卫（P1 首帧竞态）：白话文案，不露码', () => {
    expect(errorCopy('EXPORT_PNG_EMPTY')).toBe('表格渲染尚未完成，请稍后重试')
  })
})
