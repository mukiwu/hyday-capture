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

/** issue #4：模板引擎的 CSS selector 取值走這個訊息，向頁面要指定 selector 的內容 */
export type SelectorsMessage = {
  type: 'HYDAY_EXTRACT_SELECTORS'
  selectors: string[]
  selectorsHtml: string[]
}
export type SelectorsData = {
  selectors: Record<string, string>
  selectorsHtml: Record<string, string>
}

function clean(s: string | null | undefined): string | undefined {
  const t = s?.trim()
  return t ? t : undefined
}

/** 掃頁面 meta 標籤，供 {{meta:key}} 變數取值。name 與 property 都收，先到先得。 */
function collectMeta(): Record<string, string> {
  const meta: Record<string, string> = {}
  for (const el of document.querySelectorAll('meta[name], meta[property]')) {
    const key = el.getAttribute('name') ?? el.getAttribute('property')
    const content = el.getAttribute('content')
    if (key && content && !(key in meta)) meta[key] = content
  }
  return meta
}

/** 從一坨 JSON-LD 資料遞迴收集 @type，供模板 schemaOrg trigger 比對 */
function collectSchemaTypes(data: unknown, out: Set<string>): void {
  if (Array.isArray(data)) {
    for (const item of data) collectSchemaTypes(item, out)
    return
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    const t = obj['@type']
    if (typeof t === 'string') out.add(t)
    else if (Array.isArray(t)) for (const v of t) if (typeof v === 'string') out.add(v)
    if ('@graph' in obj) collectSchemaTypes(obj['@graph'], out)
  }
}

function collectSchemaOrgTypes(): string[] {
  const out = new Set<string>()
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collectSchemaTypes(JSON.parse(s.textContent ?? ''), out)
    } catch {
      // 壞掉的 JSON-LD 跳過，不影響擷取
    }
  }
  return [...out]
}

async function extract(): Promise<ExtractedContent> {
  const { default: Defuddle } = await import('defuddle')
  const result = new Defuddle(document, {
    url: location.href,
    markdown: true, // content 直接輸出 Markdown
  }).parse()

  const schemaOrgTypes = collectSchemaOrgTypes()
  const meta = collectMeta()

  return {
    url: location.href,
    domain: clean(result.domain) ?? location.hostname,
    title: clean(result.title) ?? clean(document.title) ?? location.href,
    contentMarkdown: result.content ?? '',
    author: clean(result.author),
    published: clean(result.published),
    description: clean(result.description),
    image: clean(result.image),
    // issue #4：模板 schemaOrg trigger 與 {{meta:...}} 變數用
    schemaOrgTypes: schemaOrgTypes.length > 0 ? schemaOrgTypes : undefined,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  }
}

/** issue #4：取模板引用到的 CSS selector 的純文字與 HTML，交給引擎的 {{selector:...}} 變數 */
async function extractSelectors(message: Record<string, unknown>): Promise<SelectorsData> {
  const wantText = Array.isArray(message.selectors) ? (message.selectors as string[]) : []
  const wantHtml = Array.isArray(message.selectorsHtml) ? (message.selectorsHtml as string[]) : []
  const selectors: Record<string, string> = {}
  const selectorsHtml: Record<string, string> = {}
  for (const css of wantText) {
    try {
      const el = document.querySelector(css)
      if (el) selectors[css] = (el.textContent ?? '').trim()
    } catch {
      // 無效的 selector 跳過
    }
  }
  for (const css of wantHtml) {
    try {
      const el = document.querySelector(css)
      if (el) selectorsHtml[css] = el.innerHTML
    } catch {
      // 無效的 selector 跳過
    }
  }
  return { selectors, selectorsHtml }
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
 * content script 的訊息分派表。之後的 issue 新增 message 型別時，在這裡加一個
 * handler key，不改動既有分派，避免多個並行擴充撞協定。
 * handler 收到整個 message，用不到就忽略（HYDAY_EXTRACT / HYDAY_EXTRACT_SELECTION 即如此）。
 */
const handlers: Record<string, (message: Record<string, unknown>) => Promise<unknown>> = {
  HYDAY_EXTRACT: extract,
  HYDAY_EXTRACT_SELECTION: extractSelection,
  HYDAY_EXTRACT_SELECTORS: extractSelectors,
}

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string } & Record<string, unknown>,
    _sender,
    sendResponse: (r: { ok: true; data: unknown } | { ok: false; error: string }) => void,
  ) => {
    const handler = message?.type ? handlers[message.type] : undefined
    if (!handler) return // 不是我們的訊息，讓其他 listener 處理，不佔用回應通道
    handler(message).then(
      (data) => sendResponse({ ok: true, data }),
      (err: unknown) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    )
    return true // 非同步回應
  },
)
