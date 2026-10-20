/**
 * 导出偏好（T27）：只存本机偏好，不进模板 JSON（增强期设计增量 §5.1）。
 * 键：pt.pref.pngScale，值 1/2/3，缺省 2。
 */

export type PngScale = 1 | 2 | 3

const PNG_SCALE_KEY = 'pt.pref.pngScale'
const VALID_SCALES: readonly number[] = [1, 2, 3]

/** 读 PNG 倍率偏好；缺省 / 存值非法 / localStorage 不可用时回退 2 */
export function getPngScale(): PngScale {
  try {
    const raw = localStorage.getItem(PNG_SCALE_KEY)
    const v = raw === null ? NaN : Number(raw)
    return VALID_SCALES.includes(v) ? (v as PngScale) : 2
  } catch {
    return 2
  }
}

/** 记住上次选择的倍率；localStorage 不可用时静默忽略（仅偏好，不影响导出） */
export function setPngScale(scale: PngScale): void {
  try {
    localStorage.setItem(PNG_SCALE_KEY, String(scale))
  } catch {
    /* ignore */
  }
}
