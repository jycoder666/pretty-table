import { describe, expect, it } from 'vitest'
import type { CoreError } from '@/core'
import { pasteCopy } from './pasteCopy'

const err = (code: string, details?: unknown): CoreError =>
  ({ code: code as CoreError['code'], message: '', details })

describe('pasteCopy（文案以 03-ux 交互 §1.3 为准）', () => {
  it('单条：区块 / 合并 / 锁定各有固定白话', () => {
    expect(pasteCopy([err('PASTE_HITS_BLOCK')])).toBe(
      '这块区域跨过了分区色条，没法连着填。请分两次粘贴，或先移除色条',
    )
    expect(pasteCopy([err('PASTE_HITS_MERGED')])).toContain('合并的格子')
    expect(pasteCopy([err('PASTE_HITS_LOCKED')])).toContain('模板固定的格子')
  })

  it('超出：多出 N 行 M 列（S3 文案）', () => {
    expect(pasteCopy([err('PASTE_OUT_OF_RANGE', { extraRows: 0, extraCols: 1 })])).toBe(
      '放不下：多出 1 列。表格不会自动加列，请少复制 1 列，或换个更靠左的起点',
    )
    expect(pasteCopy([err('PASTE_OUT_OF_RANGE', { extraRows: 2, extraCols: 0 })])).toContain(
      '多出 2 行',
    )
    expect(pasteCopy([err('PASTE_OUT_OF_RANGE', { extraRows: 2, extraCols: 1 })])).toContain(
      '多出 2 行 1 列',
    )
  })

  it('多原因一次提示：区块在前、超出在后，用「；另外」连接', () => {
    const text = pasteCopy([
      err('PASTE_HITS_BLOCK'),
      err('PASTE_OUT_OF_RANGE', { extraRows: 0, extraCols: 1 }),
    ])
    expect(text).toBe(
      '这块区域跨过了分区色条，没法连着填。请分两次粘贴，或先移除色条；另外放不下：多出 1 列。表格不会自动加列，请少复制 1 列，或换个更靠左的起点',
    )
  })

  it('notices 追加在句尾（其中 N 格按文字填入）', () => {
    const text = pasteCopy([err('PASTE_HITS_BLOCK')], [
      { code: 'PASTE_NOTICE_AS_TEXT', message: '其中 2 格按文字填入' },
    ])
    expect(text.endsWith('；其中 2 格按文字填入')).toBe(true)
  })

  it('STALE / COMMIT_FAILED 固定文案', () => {
    expect(pasteCopy([err('PASTE_STALE')])).toBe('表格刚被改过，请重新粘贴')
    expect(pasteCopy([err('PASTE_COMMIT_FAILED')])).toBe('粘贴失败，表格未改动')
  })

  it('未知码兜底文案不露码', () => {
    expect(pasteCopy([err('PASTE_NO_ANCHOR')])).not.toMatch(/PASTE_/)
    expect(pasteCopy([err('WHATEVER')])).toContain('表格保持原样')
  })
})
