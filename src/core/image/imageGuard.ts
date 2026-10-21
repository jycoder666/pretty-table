import { fail, ok, type Result } from '../errors'
import type { ImageSlotObject, TemplateInstance } from '../types'

/**
 * 核内图片守卫（交互升级设计增量 §1.2.4，R-3）。
 * 纯函数、零依赖：壳层上传 / 粘贴与核内 setSlot 意图共用同一套校验，
 * 超预算的数据不可能写进 store（IA-1 / IA-2 预算闸）。
 * 约定：除本模块外任何模块不得解析 data URL 内容，只透传（共享知识 §7.1）。
 */

export const IMAGE_LIMITS = {
  /** IA-1 单图 2MB（按 base64 解码后字节数） */
  maxBytes: 2 * 1024 * 1024,
  /** IA-2 每表 ≤10 张 */
  maxCount: 10,
  /** IA-2 单表总预算 20MB */
  maxTotalBytes: 20 * 1024 * 1024,
  /** IA-1 增补（主控已裁定）：单图像素上限 宽×高 ≤ 2400 万（约 6000×4000） */
  maxPixels: 24_000_000,
} as const

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif'

/** 白名单：仅 png / jpeg / webp / gif 的 base64 data URL（无引号/标签注入面，GC-22） */
const DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/

/** 迁移 / 导出端复用：只做白名单正则判定，绝不抛错、不解码 */
export function isImageDataUrl(v: unknown): v is string {
  return typeof v === 'string' && DATA_URL_RE.test(v)
}

/** data URL 解码后的字节数（base64 长度换算 + padding 修正） */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return 0
  const len = dataUrl.length - comma - 1
  if (len <= 0) return 0
  let pad = 0
  if (dataUrl.endsWith('==')) pad = 2
  else if (dataUrl.endsWith('=')) pad = 1
  return Math.max(0, Math.floor((len * 3) / 4) - pad)
}

function decodeBase64(dataUrl: string): Uint8Array | null {
  try {
    const comma = dataUrl.indexOf(',')
    const bin = atob(comma < 0 ? '' : dataUrl.slice(comma + 1))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

// ── magic bytes 与尺寸解析（魔数校验加固，IA-3）────────────────

function hasMagic(format: ImageFormat, b: Uint8Array): boolean {
  switch (format) {
    case 'png':
      return (
        b.length >= 8 &&
        b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
        b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
      )
    case 'jpeg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    case 'gif':
      return b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38
    case 'webp':
      return (
        b.length >= 12 &&
        b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
      )
  }
}

/** 尺寸解析：尽力而为；解析不出（变体/截断）返回 null，由调用方放行不误拒 */
function imageSize(format: ImageFormat, b: Uint8Array): { w: number; h: number } | null {
  switch (format) {
    case 'png': {
      if (b.length < 24) return null
      const w = (((b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!) >>> 0)
      const h = (((b[20]! << 24) | (b[21]! << 16) | (b[22]! << 8) | b[23]!) >>> 0)
      return w > 0 && h > 0 ? { w, h } : null
    }
    case 'gif': {
      if (b.length < 10) return null
      const w = b[6]! | (b[7]! << 8)
      const h = b[8]! | (b[9]! << 8)
      return w > 0 && h > 0 ? { w, h } : null
    }
    case 'jpeg': {
      // 扫描 SOFn 段取宽高（渐进式 JPEG 同样覆盖）
      let pos = 2
      while (pos + 9 < b.length) {
        if (b[pos] !== 0xff) {
          pos++
          continue
        }
        const marker = b[pos + 1]!
        if (marker === 0xff) {
          pos++
          continue
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          pos += 2
          continue
        }
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf)
        if (isSof) {
          const h = (b[pos + 5]! << 8) | b[pos + 6]!
          const w = (b[pos + 7]! << 8) | b[pos + 8]!
          return w > 0 && h > 0 ? { w, h } : null
        }
        const len = (b[pos + 2]! << 8) | b[pos + 3]!
        if (len < 2) return null
        pos += 2 + len
      }
      return null
    }
    case 'webp': {
      if (b.length < 30) return null
      const fourcc = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!)
      if (fourcc === 'VP8 ') {
        // 有损：帧头 3 字节 + 起始码 9D 01 2A + 宽高（各 14 bit LE）
        if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
        const w = (b[26]! | (b[27]! << 8)) & 0x3fff
        const h = (b[28]! | (b[29]! << 8)) & 0x3fff
        return w > 0 && h > 0 ? { w, h } : null
      }
      if (fourcc === 'VP8L') {
        // 无损：签名 0x2F + 打包位（宽高各 14 bit）
        if (b[20] !== 0x2f) return null
        const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0
        const w = (bits & 0x3fff) + 1
        const h = ((bits >>> 14) & 0x3fff) + 1
        return w > 0 && h > 0 ? { w, h } : null
      }
      if (fourcc === 'VP8X') {
        // 扩展：画布宽高各 24 bit LE − 1
        const w = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16))
        const h = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16))
        return w > 0 && h > 0 ? { w, h } : null
      }
      return null
    }
  }
}

const MSG_FORMAT = '只支持 jpg / png / webp / gif 这几种格式'
const MSG_TOO_LARGE_BYTES = '这张图超过 2MB 了，压缩一下再试'
const MSG_TOO_LARGE_PIXELS = '这张图尺寸太大了，压缩一下再试'
const MSG_DECODE_FAIL = '图片读不出来，文件可能已损坏'
const MSG_NOT_ALLOWED = '这个格子不能放图片'

/**
 * 三连校验之一：data URL 白名单 + 单图双上限（2MB / 2400 万像素，IA-1）。
 * 通过返回格式；失败 store 不变（fail 结果由调用方转白话 toast）。
 */
export function validateImageDataUrl(v: string): Result<ImageFormat> {
  if (typeof v !== 'string') {
    return fail('IMAGE_FORMAT_UNSUPPORTED', MSG_FORMAT)
  }
  const m = DATA_URL_RE.exec(v)
  if (!m) return fail('IMAGE_FORMAT_UNSUPPORTED', MSG_FORMAT)
  const format = m[1] as ImageFormat
  const bytes = dataUrlBytes(v)
  if (bytes > IMAGE_LIMITS.maxBytes) {
    return fail('IMAGE_TOO_LARGE', MSG_TOO_LARGE_BYTES, { bytes })
  }
  const bin = decodeBase64(v)
  if (!bin) return fail('IMAGE_DECODE_FAIL', MSG_DECODE_FAIL, { bytes })
  // 魔数与声明的 mime 不符 → 内容不是该格式（或已损坏）
  if (!hasMagic(format, bin)) {
    return fail('IMAGE_FORMAT_UNSUPPORTED', MSG_FORMAT, { bytes })
  }
  // 尺寸解析不出（罕见变体/截断）→ 放行，交浏览器解码兜底（不误拒）
  const size = imageSize(format, bin)
  if (size && size.w * size.h > IMAGE_LIMITS.maxPixels) {
    return fail('IMAGE_TOO_LARGE', MSG_TOO_LARGE_PIXELS, {
      width: size.w,
      height: size.h,
      pixels: size.w * size.h,
    })
  }
  return ok(format)
}

/**
 * 三连校验之二：槽位是否允许设图（规则判定，不扩 SlotDef）。
 * 槽位存在于 slotGrid、不在 readonlyCells、slotDefs.locked !== true、
 * kind 缺省或 'text' → 可设图；mark / number 槽语义不符，拒绝。
 */
export function canSetImage(inst: TemplateInstance, slotId: string): Result<void> {
  let found = false
  let readonly = false
  const grid = inst.layout.slotGrid
  if (grid) {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]
      if (!row) continue
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== slotId) continue
        found = true
        if (inst.layout.readonlyCells?.some(([rr, cc]) => rr === r && cc === c)) readonly = true
      }
    }
  }
  if (!found) return fail('IMAGE_NOT_ALLOWED', MSG_NOT_ALLOWED, { slotId })
  if (readonly) return fail('IMAGE_NOT_ALLOWED', MSG_NOT_ALLOWED, { slotId })
  const def = inst.slotDefs?.[slotId]
  if (def?.locked === true) {
    return fail('IMAGE_NOT_ALLOWED', MSG_NOT_ALLOWED, { slotId })
  }
  if (def?.kind !== undefined && def.kind !== 'text') {
    return fail('IMAGE_NOT_ALLOWED', MSG_NOT_ALLOWED, { slotId, kind: def.kind })
  }
  return ok(undefined)
}

/**
 * 三连校验之三：每表图片预算（IA-2）。
 * 替换时旧图（目标槽现有图）先扣除再算；超数量 / 超总额 fail（details 带已达值）。
 */
export function checkImageBudget(
  inst: TemplateInstance,
  incoming: ImageSlotObject,
  targetSlotId: string,
): Result<void> {
  const others: string[] = []
  for (const [id, v] of Object.entries(inst.slots)) {
    if (id === targetSlotId) continue
    if (v !== null && typeof v === 'object' && 'image' in v) {
      others.push((v as ImageSlotObject).image)
    }
  }
  const count = others.length + 1
  if (count > IMAGE_LIMITS.maxCount) {
    return fail('IMAGE_BUDGET_EXCEEDED', '图片最多 10 张，先删几张再试', {
      count,
      maxCount: IMAGE_LIMITS.maxCount,
    })
  }
  const totalBytes =
    others.reduce((acc, u) => acc + dataUrlBytes(u), 0) + dataUrlBytes(incoming.image)
  if (totalBytes > IMAGE_LIMITS.maxTotalBytes) {
    return fail('IMAGE_BUDGET_EXCEEDED', '图片总共最多 20MB，先删几张再试', {
      count,
      totalBytes,
      maxTotalBytes: IMAGE_LIMITS.maxTotalBytes,
    })
  }
  return ok(undefined)
}

/**
 * cover 铺满裁剪参数（唯一实现，预览/PNG customLayout 自持裁剪与 HTML object-fit:cover 共用，共享知识 §7.3）：
 * 以格子宽高比为准居中裁源图。返回源图上的裁剪宽高。
 */
export function coverCrop(nw: number, nh: number, cw: number, ch: number): { sw: number; sh: number } {
  if (nw <= 0 || nh <= 0 || cw <= 0 || ch <= 0) {
    return { sw: Math.max(1, Math.round(nw)), sh: Math.max(1, Math.round(nh)) }
  }
  const targetRatio = cw / ch
  const sourceRatio = nw / nh
  if (sourceRatio > targetRatio) {
    // 源图更「宽」→ 高度铺满，裁宽度
    return { sw: Math.max(1, Math.round(nh * targetRatio)), sh: nh }
  }
  // 源图更「高」→ 宽度铺满，裁高度
  return { sw: nw, sh: Math.max(1, Math.round(nw / targetRatio)) }
}
