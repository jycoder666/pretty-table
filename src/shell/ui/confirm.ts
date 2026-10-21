import { reactive } from 'vue'

/**
 * PX-05：统一确认弹窗的 Promise 化 API。
 * 壳内各破坏性操作（离开 / 删除 / 换模板 / 删区块 / 删非空行列）统一走
 * confirmAction()，由 ConfirmDialog.vue 消费 confirmState 渲染；
 * 替代 window.confirm 的「确定 / 取消」歧义按钮。
 */

export interface ConfirmOptions {
  /** 弹窗标题：一句话点明即将发生的动作 */
  title: string
  /** 描述文案：照搬原 confirm 的问句原文，一字不改 */
  message: string
  /** 确认按钮文案：写明具体动作（如「删除」「替换」），不再用「确定」 */
  confirmText: string
  /** 取消按钮文案，缺省「取消」 */
  cancelText?: string
  /** 破坏性操作：确认按钮使用 danger 色变量 */
  danger?: boolean
}

interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
  /** 当前未决 promise 的 resolve；null = 无未决请求 */
  resolver: ((v: boolean) => void) | null
  /** 打开那一刻的焦点元素（触发按钮）；关闭时归还焦点（最小焦点管理） */
  returnFocusEl: HTMLElement | null
}

export const confirmState = reactive<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  danger: false,
  resolver: null,
  returnFocusEl: null,
})

/** 弹确认框并等待用户选择；resolve(true) = 确认，resolve(false) = 取消 / 关闭 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  // 同一时间只保留最后一次请求：上一个未决 promise 以「取消」收场，避免悬挂
  if (confirmState.resolver) confirmState.resolver(false)
  return new Promise((resolve) => {
    confirmState.title = opts.title
    confirmState.message = opts.message
    confirmState.confirmText = opts.confirmText ?? '确认'
    confirmState.cancelText = opts.cancelText ?? '取消'
    confirmState.danger = opts.danger ?? false
    // 焦点归还锚点：打开瞬间的 document.activeElement（触发按钮）；不可聚焦时为 null
    confirmState.returnFocusEl =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmState.resolver = resolve
    confirmState.open = true
  })
}

/** ConfirmDialog 内部收口：关闭弹窗并结算未决 promise */
export function settleConfirm(result: boolean): void {
  const wasOpen = confirmState.open
  confirmState.open = false
  const resolver = confirmState.resolver
  confirmState.resolver = null
  resolver?.(result)
  // 最小焦点管理：关闭后把焦点归还给触发元素（ConfirmDialog 打开时聚焦确认按钮，两半闭环）
  if (wasOpen) confirmState.returnFocusEl?.focus()
}
