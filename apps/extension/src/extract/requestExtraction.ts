/**
 * Popup 側：向指定分頁的 content script 要抽取結果。
 */
import type { ExtractedContent } from '@hyday-capture/organize-engine'
import type { ExtractMessage, ExtractResponse } from './content'

export class ExtractionError extends Error {
  constructor(
    public code: 'CONTENT_SCRIPT_MISSING' | 'EXTRACT_FAILED',
    message: string,
  ) {
    super(message)
    this.name = 'ExtractionError'
  }
}

export async function requestExtraction(tabId: number): Promise<ExtractedContent> {
  const message: ExtractMessage = { type: 'HYDAY_EXTRACT' }
  let response: ExtractResponse
  try {
    response = (await chrome.tabs.sendMessage(tabId, message)) as ExtractResponse
  } catch {
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
