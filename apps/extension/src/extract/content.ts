/**
 * Content script：跑在頁面裡，收到擷取請求才用 Defuddle 抽出正文與 metadata。
 * Defuddle 需要 live DOM，所以只能在頁面 context 執行，這是瀏覽器專屬的薄 adapter。
 * Defuddle 以動態 import 延後載入，平常不擷取時不拖慢頁面。
 */
import { parseYouTubeUrl, type ExtractedContent } from '@hyday-capture/organize-engine'
import { hardenParagraphs } from './hardenParagraphs'
import { markPostBoundary } from './postBoundary'
import { parseWithBoundaryFallback } from './boundaryFallback'
import { normalizeExtractedMarkdown } from './contentExtraction'
import { buildSelectionExtractedContent, type ExtractedPageMetadata } from './selection'
import { extractYouTubePageMetadata } from './youtubePage'
import {
  isNotionUrl,
  notionContentHtml,
  notionTitleFrom,
  withNotionFallback,
} from './notionPage'
import { loadMarkdownConverter } from './markdownConverter'
import {
  extractFacebookVideo,
  facebookVideoMarkdown,
  facebookVideoTitle,
  isEmbedBlocked,
  parseFacebookVideoUrl,
} from './facebookVideo'

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

type ParsedPage = {
  contentMarkdown: string
  metadata: ExtractedPageMetadata
}

/**
 * Notion 不是文章型頁面：格式全在 CSS 裡，原生抽取讀 DOM 只會拿到沒有符號的條列與
 * 掉光的粗體。改成問 Notion 要它 copy handler 產的語意 HTML，再轉 Markdown。
 * 這條路任何一步不成立都回 null，退回原生抽取由 withNotionFallback 保證。
 */
async function parseNotionPage(): Promise<ParsedPage | null> {
  const html = await notionContentHtml(document)
  if (!html) return null

  // 跟原生抽取共用同一個 markdown 轉換器（turndown），輸出風格才一致
  const toMarkdown = await loadMarkdownConverter()
  const contentMarkdown = toMarkdown(html, location.href)
  if (!contentMarkdown.trim()) return null

  const schemaOrgTypes = collectSchemaOrgTypes()
  const meta = collectMeta()
  return {
    contentMarkdown,
    metadata: {
      url: location.href,
      domain: location.hostname,
      // 標題退回網址而不是 document.title：走到這裡代表網頁標題只剩「Notion」兩個字，
      // 拿它當筆記標題比拿網址還沒用
      title: notionTitleFrom(document.title) ?? location.href,
      // 作者與發布時間 Notion 頁面沒有可靠來源；description 的 meta 是 Notion 全站共用的
      // 產品介紹句，抓進來會讓每篇筆記的摘要都一樣，寧可留空（同 YouTube 那條的整站 meta 問題）
      schemaOrgTypes: schemaOrgTypes.length > 0 ? schemaOrgTypes : undefined,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    },
  }
}

/**
 * 原生抽取：Defuddle 讀 live DOM 評分挑正文，適用一般文章型頁面。
 * 站台專屬的路徑抽不到時一律退回這裡。
 */
async function parseNativePage(): Promise<ParsedPage> {
  // 必須是 `defuddle/full`：markdown 轉換器（內部走 turndown）只打包在 full 入口，
  // core 入口的型別同樣接受 markdown: true 但執行時直接忽略，落地會變成一坨 HTML
  // （2026-07-26 踩過：Substack 與 X 擷取回來的全文是單行 HTML，段落是 <br>）。
  // 轉換需要全域 document.implementation.createHTMLDocument，content script 有。
  const { default: Defuddle } = await import('defuddle/full')
  // 分段流失的一般解：抽取前把「視覺上是分段、結構上不是」的邊界標成文字標記，
  // 轉完 markdown 再換成空行分段。pre-wrap 的真換行一定要在這一步處理，抽取器會把它
  // 正規化成空格、之後救不回來。詳見 hardenParagraphs 與引擎的 paragraphBreaks
  const restoreDom = hardenParagraphs(document)
  // feed 型網站（FB、Threads 這類）的永久連結頁，DOM 裡同時有目標貼文與整片動態消息，
  // 內容評分很容易挑錯。用「指向當前網址的連結」標出目標貼文交給抽取器，見 postBoundary。
  // 邊界是啟發式、會誤判，parseWithBoundaryFallback 保證誤判最壞只退回原生抽取，
  // 不會讓抽得到的頁面變成抽不到，見 boundaryFallback
  const boundary = markPostBoundary(document, location.href)
  let result: Awaited<ReturnType<InstanceType<typeof Defuddle>['parseAsync']>>
  try {
    // parseAsync 而不是 parse：站台專屬 extractor 的非同步路徑只有這支跑得到
    // （YouTube 的字幕就在那條，同步 parse 抽出來的正文是空的）。沒有非同步
    // extractor 的站，parseAsync 的行為等同 parse，不會多花時間
    result = await parseWithBoundaryFallback(boundary.selector, (selector) =>
      new Defuddle(document, {
        url: location.href,
        markdown: true, // content 直接輸出 Markdown
        contentSelector: selector,
      }).parseAsync(),
    )
  } finally {
    boundary.restore()
    restoreDom()
  }

  const schemaOrgTypes = collectSchemaOrgTypes()
  const meta = collectMeta()

  return {
    contentMarkdown: result.content ?? '',
    metadata: {
      url: location.href,
      domain: clean(result.domain) ?? location.hostname,
      title: clean(result.title) ?? clean(document.title) ?? location.href,
      author: clean(result.author),
      published: clean(result.published),
      description: clean(result.description),
      image: clean(result.image),
      // issue #4：模板 schemaOrg trigger 與 {{meta:...}} 變數用
      schemaOrgTypes: schemaOrgTypes.length > 0 ? schemaOrgTypes : undefined,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    },
  }
}
/**
 * 向 Defuddle 的 YouTube extractor 要字幕 Markdown（`### 章節` 加 `**0:04**` 句首時間戳）。
 * 逐字稿本身不落地，引擎只從中抽章節大綱，見 organize-engine 的 youtubeChapterOutline。
 *
 * 只有 parseAsync 跑得到這條：extractor 靠 InnerTube API 取字幕軌，同步 parse 抽出來的
 * 正文是空的（實測 wordCount 0）。這是額外的網路往返，抽不到或超時就當作沒有字幕——
 * 影片連結與描述才是主體，字幕是加分項，不能讓它把整次擷取拖垮。
 */
async function youtubeTranscriptMarkdown(): Promise<string | undefined> {
  try {
    const { default: Defuddle } = await import('defuddle/full')
    const result = await new Defuddle(document, {
      url: location.href,
      markdown: true,
    }).parseAsync()
    // 認 extractorType 而不是認有沒有內容：extractor 沒接手時 Defuddle 會拿頁面上
    // 的推薦影片、留言去湊一份「正文」，那種東西當字幕解析只會生出假章節
    if (result.extractorType !== 'youtube') return undefined
    return result.content?.trim() || undefined
  } catch (err) {
    console.warn('[hyday-capture] YouTube 字幕抽取失敗，只留影片連結與描述', err)
    return undefined
  }
}

async function parsePage(): Promise<ParsedPage> {
  const youtube = parseYouTubeUrl(location.href)
  if (youtube) {
    // YouTube 頁面不是文章；正文交給 Hyday 的裸 URL → embed seam，描述與字幕
    // 另存 metadata，由 raw clipping 轉成可點的時間戳與章節大綱。
    // 走這條而不是原生抽取，留言與推薦影片才不會被誤當成原文。
    const schemaOrgTypes = collectSchemaOrgTypes()
    const meta = collectMeta()
    const youtubeMetadata = extractYouTubePageMetadata(document, youtube)
    const transcriptMarkdown = await youtubeTranscriptMarkdown()
    return {
      contentMarkdown: youtube.url,
      metadata: {
        url: location.href,
        domain: location.hostname,
        title: clean(youtubeMetadata.title) ?? clean(document.title) ?? youtube.url,
        author: clean(youtubeMetadata.author),
        published: clean(youtubeMetadata.published),
        description: youtubeMetadata.description,
        transcriptMarkdown,
        schemaOrgTypes: schemaOrgTypes.length > 0 ? schemaOrgTypes : undefined,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      },
    }
  }

  const facebookVideo = parseFacebookVideoUrl(location.href)
  if (facebookVideo) {
    // Reel 牆與 watch 頁都不是文章，原生抽取只會撈到按讚數與播放控制項，見 facebookVideo
    const [video, embedBlocked] = await Promise.all([
      extractFacebookVideo(document, facebookVideo.id),
      isEmbedBlocked(facebookVideo.url),
    ])
    return {
      contentMarkdown: facebookVideoMarkdown(facebookVideo.url, video.caption, { embedBlocked }),
      metadata: {
        url: facebookVideo.url,
        domain: location.hostname,
        title: facebookVideoTitle(video.caption, video.author),
        author: clean(video.author),
        published: clean(video.published),
      },
    }
  }

  if (isNotionUrl(location.href)) {
    // 退回原生抽取這件事交給 withNotionFallback 做成結構保證，不是靠這裡記得包 try/catch
    return withNotionFallback(parseNotionPage, async () => {
      const native = await parseNativePage()
      // 退回時 Defuddle 會拿 Notion 全站的 og:title（Where teams and agents work together）
      // 當標題，落檔連是哪一篇都看不出來（2026-09-06 實案）。網頁標題才是這一頁的名字
      const title = notionTitleFrom(document.title)
      return title ? { ...native, metadata: { ...native.metadata, title } } : native
    })
  }

  return parseNativePage()
}


async function extract(): Promise<ExtractedContent> {
  const page = await parsePage()
  return {
    ...page.metadata,
    contentMarkdown: normalizeExtractedMarkdown(page.contentMarkdown, page.metadata.url),
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
  const page = await parsePage()
  return buildSelectionExtractedContent(text, page.metadata)
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
