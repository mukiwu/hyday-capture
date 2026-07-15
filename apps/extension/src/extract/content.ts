/**
 * Content script：跑在頁面裡，收到擷取請求才用 Defuddle 抽出正文與 metadata。
 * Defuddle 需要 live DOM，所以只能在頁面 context 執行，這是瀏覽器專屬的薄 adapter。
 * Defuddle 以動態 import 延後載入，平常不擷取時不拖慢頁面。
 */
import type { ExtractedContent } from '@hyday-capture/organize-engine'

export type ExtractMessage = { type: 'HYDAY_EXTRACT' }
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
 * content script 的訊息分派表。之後的 issue（例如模板引擎的 CSS selector 取值）
 * 新增 message 型別時，在這裡加一個 handler，不要改動既有分派，避免多個並行擴充撞協定。
 */
const handlers: Record<string, () => Promise<unknown>> = {
  HYDAY_EXTRACT: extract,
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
