import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtractionError, requestExtraction } from './requestExtraction'

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome
})

describe('requestExtraction', () => {
  it('收到取消 signal 時立即結束 pending request，不必等逾時', async () => {
    const sendMessage = vi.fn(() => new Promise<never>(() => undefined))
    ;(globalThis as { chrome?: unknown }).chrome = { tabs: { sendMessage } }
    const controller = new AbortController()

    const resultPromise = Promise.race([
      requestExtraction(42, { signal: controller.signal, timeoutMs: 1_000 }).then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      // 現有實作沒有取消能力時，讓 pending 在測試內轉成明確失敗。
      new Promise<{ kind: 'pending' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'pending' }), 100),
      ),
    ])
    controller.abort()

    const result = await resultPromise
    if (result.kind !== 'rejected') throw new Error(`expected cancellation, got ${result.kind}`)
    expect(result.error).toBeInstanceOf(ExtractionError)
    expect(result.error).toMatchObject({ code: 'EXTRACT_CANCELLED' })
  })

  it('content script 沒有回應時在逾時後結束，不讓 popup 永遠停在擷取中', async () => {
    const sendMessage = vi.fn(() => new Promise<never>(() => undefined))
    ;(globalThis as { chrome?: unknown }).chrome = { tabs: { sendMessage } }

    const resultPromise = Promise.race([
      requestExtraction(42, { timeoutMs: 20 }).then(
        () => ({ kind: 'resolved' as const }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      ),
      // 讓現有的「永遠 pending」實作在測試裡變成明確失敗，而不是卡住 test runner。
      new Promise<{ kind: 'pending' }>((resolve) =>
        setTimeout(() => resolve({ kind: 'pending' }), 100),
      ),
    ])

    const result = await resultPromise

    if (result.kind !== 'rejected') throw new Error(`expected rejection, got ${result.kind}`)
    expect(result.error).toBeInstanceOf(ExtractionError)
    expect(result.error).toMatchObject({ code: 'EXTRACT_TIMEOUT' })
    expect(sendMessage).toHaveBeenCalledWith(42, { type: 'HYDAY_EXTRACT' })
  })
})
