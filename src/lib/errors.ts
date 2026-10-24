/**
 * 错误规范化：把任意抛出的东西转成可以安全展示给用户的中文文案。
 * 注意：绝不把原始错误对象直接渲染到界面（可能包含内部细节）。
 */

export class AppError extends Error {
  /** 用户可见的安全文案 */
  readonly userMessage: string

  constructor(userMessage: string, cause?: unknown) {
    super(userMessage, { cause })
    this.name = 'AppError'
    this.userMessage = userMessage
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage
  if (error instanceof Error && error.message) {
    // 网络层错误给统一文案，不透出内部细节
    return '操作没有成功，请稍后再试。'
  }
  return '出了点小问题，请稍后再试。'
}
