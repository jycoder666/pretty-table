/**
 * Schema 1.5：模板封面（导出 PNG → 自动缩略为 meta.cover dataURL）。
 * 宽度压到 ≤520px（保持比例），webp 优先（体积小），超限降质量一次。
 * 读 blob 用 FileReader（dataURL 喂 Image）——不经 URL.createObjectURL，
 * 不触碰下载 URL 的生命周期计数（revoke 口径单点在 blobDownload）。
 * 解码/编码失败返回 null（封面是非关键附属数据，静默跳过）。
 */
const COVER_MAX_W = 520
const COVER_MAX_CHARS = 400_000

export async function blobToCoverDataUrl(blob: Blob): Promise<string | null> {
  try {
    const dataUrl = await blobToDataUrl(blob)
    const img = await loadImage(dataUrl)
    const scale = Math.min(1, COVER_MAX_W / (img.naturalWidth || COVER_MAX_W))
    const w = Math.max(1, Math.round((img.naturalWidth || COVER_MAX_W) * scale))
    const h = Math.max(1, Math.round((img.naturalHeight || COVER_MAX_W) * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    let out = canvas.toDataURL('image/webp', 0.82)
    if (out.length > COVER_MAX_CHARS) out = canvas.toDataURL('image/webp', 0.6)
    if (out.length > COVER_MAX_CHARS) return null
    return out
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('封面读取失败'))
    reader.readAsDataURL(blob)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('封面解码失败'))
    img.src = src
  })
}
