import { describe, expect, it } from 'vitest'
import {
  IMAGE_LIMITS,
  canSetImage,
  checkImageBudget,
  coverCrop,
  isImageDataUrl,
  validateImageDataUrl,
} from './imageGuard'
import { BLANK_V1, COMPARE_ALPHA_V1, PRICING_V1 } from '../templates'
import { cloneInstance } from '../schema/validate'
import type { TemplateInstance } from '../types'

// ── 测试素材：按格式拼真实 magic bytes 的 data URL（jsdom 下用 btoa）─────────

function bytesToDataUrl(mime: string, bytes: number[]): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/${mime};base64,${btoa(bin)}`
}

function pngUrl(w: number, h: number): string {
  return bytesToDataUrl('png', [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    (w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255,
    (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255,
    8, 2, 0, 0, 0,
  ])
}

function jpegUrl(w: number, h: number): string {
  return bytesToDataUrl('jpeg', [
    0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1,
    0xff, 0xc0, 0, 0x11, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 1, 2, 0,
  ])
}

function gifUrl(w: number, h: number): string {
  return bytesToDataUrl('gif', [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
    w & 255, (w >> 8) & 255, h & 255, (h >> 8) & 255,
    0, 0,
  ])
}

function webpVp8xUrl(w: number, h: number): string {
  return bytesToDataUrl('webp', [
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0,
    0, 0, 0, 0,
    (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255,
    (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255,
  ])
}

/** 粗略字节数的 PNG data URL（1×1 头 + 补零字节；只用于体积/预算断言） */
function junkImage(decodedBytes: number): string {
  const head = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 1, 0, 0, 0, 1,
    8, 2, 0, 0, 0,
  ]
  let bin = ''
  for (const b of head) bin += String.fromCharCode(b)
  bin += '\0'.repeat(Math.max(0, decodedBytes - head.length))
  return 'data:image/png;base64,' + btoa(bin)
}

describe('imageGuard · IMAGE_LIMITS（IA-1 / IA-2 + 主控裁定像素上限）', () => {
  it('单图 2MB、每表 10 张、总预算 20MB、单图 2400 万像素', () => {
    expect(IMAGE_LIMITS.maxBytes).toBe(2 * 1024 * 1024)
    expect(IMAGE_LIMITS.maxCount).toBe(10)
    expect(IMAGE_LIMITS.maxTotalBytes).toBe(20 * 1024 * 1024)
    expect(IMAGE_LIMITS.maxPixels).toBe(24_000_000)
  })
})

describe('imageGuard · validateImageDataUrl', () => {
  it('白名单四格式（png/jpeg/webp/gif）通过并返回格式', () => {
    expect(validateImageDataUrl(pngUrl(100, 80))).toMatchObject({ ok: true, value: 'png' })
    expect(validateImageDataUrl(jpegUrl(100, 80))).toMatchObject({ ok: true, value: 'jpeg' })
    expect(validateImageDataUrl(gifUrl(100, 80))).toMatchObject({ ok: true, value: 'gif' })
    expect(validateImageDataUrl(webpVp8xUrl(100, 80))).toMatchObject({ ok: true, value: 'webp' })
  })

  it('非 data URL / 白名单外 mime（svg）→ IMAGE_FORMAT_UNSUPPORTED', () => {
    expect(validateImageDataUrl('hello').ok).toBe(false)
    const r = validateImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+')
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_FORMAT_UNSUPPORTED')
  })

  it('魔数与 mime 不符 → IMAGE_FORMAT_UNSUPPORTED', () => {
    const r = validateImageDataUrl(bytesToDataUrl('png', [0x68, 0x65, 0x6c, 0x6c, 0x6f])) // "hello"
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_FORMAT_UNSUPPORTED')
  })

  it('解码后字节数超 2MB → IMAGE_TOO_LARGE（IA-1）', () => {
    const r = validateImageDataUrl(junkImage(2 * 1024 * 1024 + 3))
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_TOO_LARGE')
  })

  it('恰好 2MB 边界通过', () => {
    expect(validateImageDataUrl(junkImage(2 * 1024 * 1024)).ok).toBe(true)
  })

  it('像素超 2400 万 → IMAGE_TOO_LARGE（IA-1 增补：宽×高）', () => {
    const r = validateImageDataUrl(pngUrl(5000, 5000)) // 2500 万
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_TOO_LARGE')
  })

  it('恰好 2400 万像素通过（边界）', () => {
    expect(validateImageDataUrl(pngUrl(4800, 5000)).ok).toBe(true)
  })

  it('base64 畸形（长度非 4 倍数）→ IMAGE_DECODE_FAIL', () => {
    const r = validateImageDataUrl('data:image/png;base64,QUFBQ')
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_DECODE_FAIL')
  })
})

describe('imageGuard · isImageDataUrl（迁移 / 导出端复用，绝不抛错）', () => {
  it('白名单 data URL → true；其余一律 false 且不抛错', () => {
    expect(isImageDataUrl(pngUrl(2, 2))).toBe(true)
    expect(isImageDataUrl('data:image/svg+xml;base64,AAAA')).toBe(false)
    expect(isImageDataUrl('javascript:alert(1)')).toBe(false)
    expect(isImageDataUrl('<img src=x onerror=alert(1)>')).toBe(false)
    expect(isImageDataUrl(123)).toBe(false)
    expect(isImageDataUrl(null)).toBe(false)
    expect(isImageDataUrl(undefined)).toBe(false)
    expect(isImageDataUrl({ image: 'x' })).toBe(false)
  })
})

describe('imageGuard · canSetImage（规则判定，不扩 SlotDef）', () => {
  it('可写 text 槽（kind 缺省或 text）→ ok', () => {
    expect(canSetImage(cloneInstance(BLANK_V1), 'u1').ok).toBe(true)
    expect(canSetImage(cloneInstance(COMPARE_ALPHA_V1), 'row.3.val.a').ok).toBe(true)
  })

  it('mark 槽 / number 槽 → IMAGE_NOT_ALLOWED', () => {
    for (const slotId of ['row.2.val.a', 'row.5.val.a']) {
      const r = canSetImage(cloneInstance(COMPARE_ALPHA_V1), slotId)
      expect(r.ok).toBe(false)
      expect(!r.ok ? r.error.code : '').toBe('IMAGE_NOT_ALLOWED')
    }
  })

  it('locked 槽 → IMAGE_NOT_ALLOWED', () => {
    const inst = cloneInstance(BLANK_V1)
    inst.slotDefs = { u1: { locked: true } }
    const r = canSetImage(inst, 'u1')
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_NOT_ALLOWED')
  })

  it('readonly 格（价目表列头）→ IMAGE_NOT_ALLOWED', () => {
    const r = canSetImage(cloneInstance(PRICING_V1), 'head.c0')
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_NOT_ALLOWED')
  })

  it('不存在的槽 / 区块槽 → IMAGE_NOT_ALLOWED', () => {
    expect(canSetImage(cloneInstance(BLANK_V1), 'nope').ok).toBe(false)
    expect(canSetImage(cloneInstance(COMPARE_ALPHA_V1), 'gap-g1').ok).toBe(false)
  })
})

describe('imageGuard · checkImageBudget（替换先扣旧图）', () => {
  it('已有 10 张 → 第 11 张拒（IMAGE_BUDGET_EXCEEDED）', () => {
    const inst = cloneInstance(BLANK_V1)
    for (let i = 1; i <= 10; i++) inst.slots[`u${i}`] = { image: junkImage(1_500_000) }
    const r = checkImageBudget(inst, { image: junkImage(1_500_000) }, 'u11')
    expect(r.ok).toBe(false)
    expect(!r.ok ? r.error.code : '').toBe('IMAGE_BUDGET_EXCEEDED')
    expect(!r.ok ? r.error.details : undefined).toBeDefined()
  })

  it('总额超 20MB → 拒；不超 → 放行（边界）', () => {
    const inst = cloneInstance(BLANK_V1)
    // 9 张 × 2,000,004 字节 ≈ 18.0MB；再放 2,974,500 字节 → 超 20,971,520
    for (let i = 1; i <= 9; i++) inst.slots[`u${i}`] = { image: junkImage(2_000_004) }
    const bad = checkImageBudget(inst, { image: junkImage(2_974_500) }, 'u10')
    expect(bad.ok).toBe(false)
    expect(!bad.ok ? bad.error.code : '').toBe('IMAGE_BUDGET_EXCEEDED')
    // 边界内放行
    const fine = checkImageBudget(inst, { image: junkImage(2_000_004) }, 'u10')
    expect(fine.ok).toBe(true)
  })

  it('替换同槽旧图：旧图先扣除再算（数量与总额都不重复计）', () => {
    const inst = cloneInstance(BLANK_V1)
    for (let i = 1; i <= 9; i++) inst.slots[`u${i}`] = { image: junkImage(2_000_004) }
    inst.slots['u10'] = { image: junkImage(2_000_004) } // 第 10 张在目标槽上
    // 不扣旧图会判 11 张；扣除后 9 + 1 = 10 张、总额 ≈ 20.0MB ≤ 上限 → 放行
    const r = checkImageBudget(inst, { image: junkImage(2_000_004) }, 'u10')
    expect(r.ok).toBe(true)
  })
})

describe('imageGuard · coverCrop（cover 铺满裁剪，唯一实现）', () => {
  it('源图比格子更「宽」→ 裁宽度', () => {
    expect(coverCrop(1000, 500, 100, 100)).toEqual({ sw: 500, sh: 500 })
  })

  it('源图比格子更「高」→ 裁高度', () => {
    expect(coverCrop(500, 1000, 100, 50)).toEqual({ sw: 500, sh: 250 })
  })

  it('极端比例不产生 0 尺寸', () => {
    const { sw, sh } = coverCrop(1, 10_000, 100, 1)
    expect(sw).toBeGreaterThanOrEqual(1)
    expect(sh).toBeGreaterThanOrEqual(1)
  })
})

describe('imageGuard · canSetImage/checkImageBudget 不修改入参', () => {
  it('调用后实例原样（纯函数约定）', () => {
    const inst: TemplateInstance = cloneInstance(BLANK_V1)
    const snapshot = JSON.stringify(inst)
    canSetImage(inst, 'u1')
    checkImageBudget(inst, { image: junkImage(1000) }, 'u2')
    expect(JSON.stringify(inst)).toBe(snapshot)
  })
})
