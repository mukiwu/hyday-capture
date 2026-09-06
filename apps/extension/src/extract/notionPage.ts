/**
 * Notion 頁面的擷取路徑。
 *
 * Notion 把格式全交給 CSS：畫面上的條列、粗體、分隔線，在 DOM 裡是 div 加樣式，
 * 沒有 li、strong、hr（2026-09-05 實測那頁 146 個 block，0 個 p、0 個 li）。
 * 原生抽取讀的就是這層 DOM，條列會變成沒有符號的段落、粗體會變純文字。
 *
 * 但 Notion 自己知道格式：它的 copy handler 會把選取內容轉成乾淨的語意 HTML。
 * 所以這條路不自己翻譯 DOM，改成問 Notion 要它自己的那份。
 */

/** Notion 自家網域；公開分享頁走 *.notion.site 子網域 */
const NOTION_HOSTS = new Set([
  'notion.so',
  'www.notion.so',
  'notion.com',
  'www.notion.com',
  'app.notion.com',
])

export function isNotionUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return NOTION_HOSTS.has(host) || host.endsWith('.notion.site')
  } catch {
    return false
  }
}

/** Notion 的內部圖片協定，形如 attachment:<uuid>:<檔名> */
const ATTACHMENT_ID = /attachment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
/**
 * 同一張圖在 DOM 裡被 proxy 網址包了編碼，逐層解到看得見協定為止。
 * 實測最多兩層（proxy 外層加內層 S3 網址），設 3 留一層餘裕。
 */
const MAX_DECODE_DEPTH = 3

/**
 * 抽出圖片的 attachment id。剪貼簿那份給的是裸的 attachment: 協定，頁面 DOM 給的是
 * app.notion.com/image/ 的 proxy 網址、把它包在路徑裡編碼，兩邊要解到同一個 id 才配得起來。
 */
export function attachmentIdFrom(src: string): string | undefined {
  let current = src
  for (let depth = 0; depth <= MAX_DECODE_DEPTH; depth += 1) {
    const found = current.match(ATTACHMENT_ID)
    if (found) return found[1]
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      // 壞掉的百分號編碼就停在這層，配不到而已，不該讓擷取失敗
      return undefined
    }
    if (decoded === current) return undefined
    current = decoded
  }
  return undefined
}

const IMG_TAG = /<img\b[^>]*>/gi
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i

/**
 * 把剪貼簿那份 HTML 裡的 attachment: 圖片換成頁面上那張可下載的網址。
 *
 * Notion 的 copy 是從它自己的資料模型產的，內容比畫面完整：摺疊的 toggle、還沒捲到的
 * 區塊都在裡面（2026-09-05 實測 8 張圖，DOM 只渲染了其中 5 張）。多出來的那幾張沒有
 * 可下載的網址，整個拿掉而不是留著 attachment: 壞連結——圖片是加分項，文字才是主體。
 */
export function resolveAttachmentImages(
  html: string,
  resolve: (attachmentId: string) => string | undefined,
): string {
  return html.replace(IMG_TAG, (tag) => {
    const src = tag.match(SRC_ATTR)
    const value = src?.[1] ?? src?.[2]
    if (!value) return tag
    const id = attachmentIdFrom(value)
    if (!id) return tag
    const resolved = resolve(id)
    if (!resolved) return ''
    // 替換用函式而不是字串：網址裡的 $& 或 $1 在替換字串裡會被當成樣板展開
    return tag.replace(SRC_ATTR, () => `src="${resolved}"`)
  })
}

/** Notion 一律把站名接在網頁標題後面 */
const TITLE_SUFFIX = / \| Notion$/

/** 網頁標題去掉站名後綴；只剩站名或空白就交回 undefined，讓呼叫端另外找 */
export function notionTitleFrom(documentTitle: string): string | undefined {
  const trimmed = documentTitle.trim()
  if (trimmed === 'Notion') return undefined
  const title = trimmed.replace(TITLE_SUFFIX, '').trim()
  return title || undefined
}

/** 內容級標籤；Notion 給的空殼只有 meta 與空 span，一個都不會有 */
const CONTENT_TAG = /<(?:p|li|ul|ol|h[1-6]|blockquote|pre|code|img|hr|table)\b/i

/**
 * Notion 給的這份有沒有東西。
 *
 * copy handler 認得文件焦點：焦點不在頁面上時（剛開分頁、焦點還在網址列，或擴充的
 * popup 正開著），它只回一個 90 字元上下的空殼（2026-09-05 實測）。空殼轉出來是一則
 * 幾乎空白的筆記，比退回原生抽取還糟，所以這裡擋掉、讓呼叫端退回去。
 *
 * 判準用「有沒有內容標籤」而不是長度門檻：合法的短頁面就是可以只有一句話，
 * 用長度判會把它誤殺（同 boundaryFallback 不用長度門檻的理由）。
 */
export function isUsableNotionHtml(html: string): boolean {
  return CONTENT_TAG.test(html)
}

/**
 * Notion 內建的裝飾圖示，src 一律是 /icons/ 開頭的站內相對路徑。
 *
 * 兩種形狀都收：copy 出來的 HTML 給的是跳脫過的字面文字（&lt;img src=&quot;/icons/…&quot; /&gt;），
 * 不是真的標籤；真標籤那條留著，哪天 Notion 改了不必再修一次。
 */
const NOTION_ICON_IMG =
  /(?:&lt;|<)img\b[^<>]*?(?:&quot;|")\/icons\/[^<>]*?(?:\/&gt;|\/>|&gt;|>)/gi

/**
 * 拿掉 Notion 內建的裝飾圖示：callout 的燈泡、上下一單元的箭頭那些。
 *
 * 它們的 src 是 /icons/xxx.svg 這種站內相對路徑，下載流程只認 http 網址所以抓不到，
 * 留著就是筆記裡一行壞掉的 img（2026-09-06 實案）。這些圖示本來也不是內容。
 * 要在轉 Markdown 前拿掉，等 turndown 把它跳脫成 \<img …> 就只剩字串可以刮。
 */
export function stripNotionIcons(html: string): string {
  return html.replace(NOTION_ICON_IMG, '')
}

// 同樣兩種形狀都收，實際遇到的是跳脫過的字面文字那種
const ASIDE_OPEN = /(?:&lt;|<)aside\b[^<>]*?(?:&gt;|>)/gi
const ASIDE_CLOSE = /(?:&lt;|<)\/aside\s*(?:&gt;|>)/gi

/**
 * Notion 的 callout 換成引用。
 *
 * copy 出來的 HTML 把 callout 寫成跳脫過的字面文字 &lt;aside&gt;（不是真的標籤，
 * 2026-09-06 實測那頁 7 個），turndown 只會把它原樣吐成 \<aside> 落進筆記，
 * Hyday 也渲染不出來。Hyday 認得的區塊裡，引用跟 callout 的語意最接近。
 */
export function calloutsToBlockquotes(html: string): string {
  return html.replace(ASIDE_OPEN, '<blockquote>').replace(ASIDE_CLOSE, '</blockquote>')
}

/** href 是 attachment: 內部協定的連結；音檔、PDF 這些非圖片附件複製出來長這樣 */
const ATTACHMENT_LINK =
  /<a\b[^>]*\bhref\s*=\s*(?:"attachment:[^"]*"|'attachment:[^']*')[^>]*>([\s\S]*?)<\/a>/gi

/**
 * 拆掉指向 attachment: 內部協定的連結，只留連結文字。
 *
 * Notion 的音檔 block 複製出來是一條這種連結，轉成 Markdown 後落進筆記變成
 * [1.發刊詞.mp3](attachment:…)，在 Hyday 裡點不開（2026-09-06 實案）。Hyday 的資產
 * 白名單只收圖片，就算下載了也吃不下，所以不試著抓，把檔名留成文字最誠實。
 * 圖片走的是 attachment: 的 img src，由 resolveAttachmentImages 負責，這支只管 <a>。
 */
export function unlinkAttachments(html: string): string {
  // 替換用函式，連結文字裡的 $ 才不會被當成樣板展開
  return html.replace(ATTACHMENT_LINK, (_tag, text: string) => text)
}

/** Notion 的正文容器；側欄、麵包屑、留言都在這個容器外面 */
const PAGE_CONTENT = '.notion-page-content'
/** 設完選取到送 copy 事件之間讓出的時間；實測下一個 macrotask 就夠，這裡留餘裕 */
const SELECTION_SETTLE_MS = 50

/**
 * 問 Notion 要它自己那份語意 HTML。
 *
 * 作法是選取正文、對它送一個 copy 事件，Notion 的 handler 會把內容寫進我們自備的
 * DataTransfer。因為用的是自己的 DataTransfer 而不是真的複製，系統剪貼簿不會被動到；
 * 事件是合成的，也不需要使用者手勢（2026-09-05 在唯讀分享頁實測可行）。
 *
 * 時序是關鍵（2026-09-06 踩過）：Notion 的 handler 不讀 DOM Selection，讀的是它自己靠
 * selectionchange 非同步更新的選取狀態。設完選取在同一個 tick 送 copy 事件，它以為什麼都
 * 沒選、只回一個 55 字元的 notionvc 註解；讓出一個 macrotask 再送就回完整內容。先前那幾次
 * 「同步送也成功」是撿到前一次殘留選取狀態的運氣，換一頁就沒這個運氣。
 *
 * 已知限制：handler 也認 document.hasFocus()，文件沒有焦點時同樣只回空殼（2026-09-05 實測）。
 * 擴充的 popup 開著時頁面就是沒有焦點，那條入口會被 isUsableNotionHtml 擋下並退回原生抽取。
 *
 * 拿不到就回 null，呼叫端照原本的原生抽取走。
 */
export async function copyNotionHtml(doc: Document = document): Promise<string | null> {
  const content = doc.querySelector(PAGE_CONTENT)
  const selection = doc.defaultView?.getSelection()
  if (!content || !selection) return null

  // 使用者當下的選取要原封不動還回去，擷取不該動到他正在看的東西
  const saved = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null
  try {
    const range = doc.createRange()
    range.selectNodeContents(content)
    selection.removeAllRanges()
    selection.addRange(range)

    // 讓 Notion 先把 selectionchange 消化掉，見檔頭。實測讓出一個 tick 就夠，多給一點餘裕
    await new Promise((resolve) => setTimeout(resolve, SELECTION_SETTLE_MS))

    const data = new DataTransfer()
    content.dispatchEvent(
      new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
    )
    const html = data.getData('text/html')
    return isUsableNotionHtml(html) ? html : null
  } catch (err) {
    console.warn('[hyday-capture] 跟 Notion 要格式失敗，改用原生抽取', err)
    return null
  } finally {
    selection.removeAllRanges()
    if (saved) selection.addRange(saved)
  }
}

/** 掃頁面上的 img 建索引，交回一支查詢函式，供剪貼簿那份的圖片配回可下載的網址 */
export function lookupNotionImage(doc: Document = document): (id: string) => string | undefined {
  const index = new Map<string, string>()
  for (const img of doc.querySelectorAll('img')) {
    const src = img.currentSrc || img.src
    if (!src) continue
    const id = attachmentIdFrom(src)
    if (id && !index.has(id)) index.set(id, src)
  }
  return (id) => index.get(id)
}

/** Notion 這條路的入口：拿到接好圖片網址的語意 HTML，拿不到就回 null 讓呼叫端退回 */
export async function notionContentHtml(doc: Document = document): Promise<string | null> {
  const html = await copyNotionHtml(doc)
  if (!html) return null
  const withImages = resolveAttachmentImages(html, lookupNotionImage(doc))
  return calloutsToBlockquotes(stripNotionIcons(unlinkAttachments(withImages)))
}

/**
 * Notion 這條路的安全網，跟 boundaryFallback 是同一條不變量：站台專屬的路徑只能讓結果
 * 變好，不能讓原本抽得到的頁面變成抽不到。
 *
 * 光靠「每一步都回 null」守不住，因為這條路上有會拋錯的步驟——markdown 轉換器的載入
 * （defuddle 換版改了匯出形狀就會拋）與轉換本身。那些錯誤跟通用路徑無關，不該把整個
 * 擷取拖下水。所以退回這件事做成結構保證，而不是靠呼叫端記得包 try/catch。
 *
 * 原生抽取自己拋錯就照實往上報，那是真的抽不到，跟這條路無關。
 */
export async function withNotionFallback<T>(
  parseNotion: () => Promise<T | null>,
  parseNative: () => Promise<T>,
): Promise<T> {
  try {
    const notion = await parseNotion()
    if (notion) return notion
  } catch (err) {
    console.warn('[hyday-capture] Notion 路徑失敗，改用原生抽取', err)
  }
  return parseNative()
}
