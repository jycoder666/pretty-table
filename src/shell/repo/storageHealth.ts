/**
 * 存储健康（P1）：persist 申请 + 配额估算，全部容错
 * （不支持的环境 / 异常一律返回 null，不抛错、不阻塞调用方）。
 */

/**
 * 申请持久化存储（navigator.storage.persist，免浏览器容量压力下的自动驱逐）。
 * 返回 true/false = 浏览器明确答复；null = 环境不支持或调用异常。
 */
export async function requestPersist(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/**
 * 配额估算（navigator.storage.estimate）：usage / quota（字节）与占比 ratio（0–1）。
 * 环境不支持、配额未知（quota≤0）或异常时返回 null。
 */
export async function getEstimate(): Promise<{
  usage: number
  quota: number
  ratio: number
} | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
    const est = await navigator.storage.estimate()
    const usage = est.usage ?? 0
    const quota = est.quota ?? 0
    if (quota <= 0) return null
    return { usage, quota, ratio: usage / quota }
  } catch {
    return null
  }
}
