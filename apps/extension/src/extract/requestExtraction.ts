/**
 * Popup 側：向指定分頁的 content script 要抽取結果。
 */
import type { ExtractedContent } from '@hyday-capture/organize-engine'
import type { ExtractMessage, ExtractResponse } from './content'

export class ExtractionError extends Error {
  constructor(
    public code:
      | 'CONTENT_SCRIPT_MISSING'
      | 'EXTRACT_FAILED'
      | 'EXTRACT_TIMEOUT'
      | 'EXTRACT_CANCELLED',
    message: string,
  ) {
    super(message)
    this.name = 'ExtractionError'
  }
}

export type ExtractionOptions = {
  /** 只擷取使用者在頁面上選取的內容，而非整頁 */
  selectionOnly?: boolean
  /** content script 沒有完成回覆時的保護上限；主要供測試與特殊入口調整 */
  timeoutMs?: number
  /** popup 關閉或使用者按停止時，中止等待中的抽取 */
  signal?: AbortSignal
}

/** content script 若沒有回應，popup 不應無限期停留在「擷取中」。 */
export const EXTRACTION_TIMEOUT_MS = 15_000

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
  signal?: AbortSignal,
  onAbort?: () => Error,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
    const finishResolve = (value: T): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }
    const finishReject = (error: unknown): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const abort = (): void =>
      finishReject(onAbort?.() ?? new DOMException('Aborted', 'AbortError'))

    timer = setTimeout(() => finishReject(onTimeout()), timeoutMs)
    // 無論 signal 是否已經 aborted，都先接住底層 promise 的 rejection，避免
    // Chrome message port 在取消後晚到的錯誤變成 unhandled rejection。
    promise.then(
      finishResolve,
      (error: unknown) => finishReject(error instanceof Error ? error : new Error(String(error))),
    )

    if (signal) {
      if (signal.aborted) {
        abort()
        return
      }
      signal.addEventListener('abort', abort, { once: true })
    }
  })
}

export async function requestExtraction(
  tabId: number,
  opts?: ExtractionOptions,
): Promise<ExtractedContent> {
  if (opts?.signal?.aborted) {
    throw new ExtractionError('EXTRACT_CANCELLED', '已停止擷取')
  }
  const message: ExtractMessage = opts?.selectionOnly
    ? { type: 'HYDAY_EXTRACT_SELECTION' }
    : { type: 'HYDAY_EXTRACT' }
  let response: ExtractResponse
  try {
    response = await withTimeout(
      Promise.resolve(chrome.tabs.sendMessage(tabId, message)) as Promise<ExtractResponse>,
      opts?.timeoutMs ?? EXTRACTION_TIMEOUT_MS,
      () =>
        new ExtractionError(
          'EXTRACT_TIMEOUT',
          '擷取回應逾時，請重新整理目前分頁後再試',
        ),
      opts?.signal,
      () => new ExtractionError('EXTRACT_CANCELLED', '已停止擷取'),
    )
  } catch (err) {
    if (
      err instanceof ExtractionError &&
      (err.code === 'EXTRACT_TIMEOUT' || err.code === 'EXTRACT_CANCELLED')
    ) {
      throw err
    }
    // content script 不在，通常是擴充安裝前就開著的分頁，或受限頁面
    throw new ExtractionError(
      'CONTENT_SCRIPT_MISSING',
      '這個分頁還沒準備好，請重新整理頁面後再擷取',
    )
  }
  if (!response?.ok) {
    throw new ExtractionError('EXTRACT_FAILED', response?.error ?? '抽取內容失敗')
  }
  return response.data
}
