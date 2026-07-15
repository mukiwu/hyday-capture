/**
 * Content script：跑在頁面裡，收到擷取請求才用 Defuddle 抽出正文與 metadata。
 * Defuddle 需要 live DOM，所以只能在頁面 context 執行，這是瀏覽器專屬的薄 adapter。
 * Defuddle 以動態 import 延後載入，平常不擷取時不拖慢頁面。
 */
import type { ExtractedContent } from '@hyday-capture/organize-engine'

export type ExtractMessage =
  | { type: 'HYDAY_EXTRACT' }
  | { type: 'HYDAY_EXTRACT_SELECTION' }
export type ExtractResponse =
  | { ok: true; data: ExtractedContent }
  | { ok: false; error: string }

function clean(s: string | null | undefined): string | undefined {
  const t = s?.trim()
  return t ? t : undefined
}

async function extract(): Promise<ExtractedContent> {
  const { default: Defuddle } = await import('defuddle')
  const result = new Defuddle(document, {
    url: location.href,
    markdown: true, // content 直接輸出 Markdown
  }).parse()

  return {
    url: location.href,
    domain: clean(result.domain) ?? location.hostname,
    title: clean(result.title) ?? clean(document.title) ?? location.href,
    contentMarkdown: result.content ?? '',
    author: clean(result.author),
    published: clean(result.published),
    description: clean(result.description),
    image: clean(result.image),
  }
}

/**
 * 只擷取使用者在頁面上「選取的內容」，而非整頁。
 * 讀 window.getSelection() 取選取範圍的純文字當正文，metadata 沿用頁面本身
 * （標題用 document.title、來源用當前網址）。v1 選取內容以純文字落檔，夠乾淨也零相依；
 * 更保留格式的 HTML→Markdown 轉換屬整理引擎的 filter 職責，不在這支重造。
 */
async function extractSelection(): Promise<ExtractedContent> {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''
  if (!text) {
    throw new Error('沒有選取任何內容，請先選取一段文字再擷取')
  }
  return {
    url: location.href,
    domain: location.hostname,
    title: clean(document.title) ?? location.href,
    contentMarkdown: text,
  }
}

/**
 * content script 的訊息分派表。之後的 issue（例如模板引擎的 CSS selector 取值）
 * 新增 message 型別時，在這裡加一個 handler，不要改動既有分派，避免多個並行擴充撞協定。
 */
const handlers: Record<string, () => Promise<unknown>> = {
  HYDAY_EXTRACT: extract,
  HYDAY_EXTRACT_SELECTION: extractSelection,
}

chrome.runtime.onMessage.addListener(
  (message: { type?: string }, _sender, sendResponse: (r: ExtractResponse) => void) => {
    const handler = message?.type ? handlers[message.type] : undefined
    if (!handler) return // 不是我們的訊息，讓其他 listener 處理，不佔用回應通道
    handler().then(
      (data) => sendResponse({ ok: true, data: data as ExtractedContent }),
      (err: unknown) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    )
    return true // 非同步回應
  },
)
