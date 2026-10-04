/**
 * 原料檔（raw clipping）的產生器，是改向後擷取端唯一的輸出路徑。
 *
 * 職責只有把抽好的頁面資料排成一個 .md：來源事實進 frontmatter、乾淨正文當本文。
 * 不套模板、不下概念標籤、不呼叫 AI，那些都移交 hyday app 端（見 ADR 0002 改寫版）。
 * 純函式，時間注入，輸入相同則輸出相同。
 */
import type { NoteType, ExtractedContent } from './types'
import { detectNoteType } from './noteType'
import { formatYouTubeDescription, parseYouTubeUrl, youtubeChapterOutline } from './youtube'
import { safeFileStem } from './filename'
import { serializeFrontmatter, formatTimestamp } from './frontmatter'

/** 待整理的信號，只有使用者能拿掉；hyday 對標籤只加不減 */
export const INBOX_TAG = 'inbox'

export type RawClippingInput = {
  extracted: ExtractedContent
  /** 注入現在時間，讓檔名前綴與時間戳可預期 */
  now: Date
  /** 只擷取使用者選取的段落（而非整頁）時為 true，型別記成 card */
  selectionOnly?: boolean
  /** 使用者擷取當下隨手打的一句話，選填 */
  userNote?: string
}

export type RawClippingOutput = {
  filename: string
  markdown: string
}

/** 檔名的時間前綴：同一天抓好幾篇時排得出順序，也幾乎不會撞名 */
function timePrefix(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}`
  )
}

/**
 * 瀏覽器分頁標題的未讀計數前綴，例如 X 的 `(21) X 上的 老鬼：...`。
 * 限 1 到 3 位數，`(2026) 年度回顧` 這種真的以括號數字開頭的標題不會被誤刪
 */
const TAB_UNREAD_PREFIX = /^\(\d{1,3}\)\s+/

/** 抽取到的標題只做一件事：拿掉分頁標題的未讀計數噪音。其餘一律原樣保留 */
export function normalizeCapturedTitle(raw: string): string {
  return raw.replace(TAB_UNREAD_PREFIX, '').trim()
}

/**
 * frontmatter 標題的長度上限。社群貼文的分頁標題就是整篇內容（X 實測 300 多字），
 * 掛在筆記列表上會炸掉版面。看得出是哪一則就夠，完整內容反正在正文裡，
 * Hyday 整理那一步還會再給它一個像樣的標題。檔名不吃這個上限，它有自己的
 */
const MAX_TITLE_LENGTH = 60

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title
  return `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
}

/** 原料檔的檔名：擷取時間前綴加安全化的標題 */
export function rawClippingFilename(title: string, fallbackUrl: string, now: Date): string {
  return `${timePrefix(now)} ${safeFileStem(normalizeCapturedTitle(title), fallbackUrl)}.md`
}

/**
 * 發佈日正規化成 YYYY-MM-DD。已是那個形狀就原樣採用（不繞 Date，免得時區把日期
 * 推前一天）；能被 Date 解析的其他形狀換算成本地日期；解析不出來就照原樣留著，
 * 寧可留一個怪字串也不要丟掉資訊。
 */
function normalizePublished(raw: string): string {
  const value = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 判定原料檔筆記類型：選取是 card、YouTube 是 video、圖片是 img，其餘是 article。 */
function resolveNoteType(url: string, selectionOnly: boolean): NoteType {
  if (selectionOnly) return 'card'
  if (parseYouTubeUrl(url)) return 'video'
  return detectNoteType(url) === 'img' ? 'img' : 'article'
}

/** 隨手一句話排成 markdown 引言，多行的每一行都加 `>` 免得破壞區塊 */
function asBlockquote(note: string): string {
  return note
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`.trimEnd())
    .join('\n')
}

export function buildRawClipping(input: RawClippingInput): RawClippingOutput {
  const { extracted, now, selectionOnly = false, userNote } = input

  const cleanTitle = normalizeCapturedTitle(extracted.title)
  const stem = safeFileStem(cleanTitle, extracted.url)
  const title = truncateTitle(cleanTitle || stem)
  const timestamp = formatTimestamp(now)
  const published = extracted.published?.trim()
  const author = extracted.author?.trim()
  const youtube = selectionOnly ? null : parseYouTubeUrl(extracted.url)
  const sourceUrl = youtube?.url ?? extracted.url

  const frontmatter = serializeFrontmatter(
    [
      ['title', title],
      ['type', resolveNoteType(extracted.url, selectionOnly)],
      // 只有 inbox。概念標籤由 hyday 整理時下，擷取端不猜
      ['tags', [INBOX_TAG]],
      ['createdAt', timestamp],
      ['lastModified', timestamp],
      ['sourceUrl', sourceUrl],
      ['sourceDomain', extracted.domain],
      ['author', author || undefined],
      ['publishedAt', published ? normalizePublished(published) : undefined],
    ],
    { arrayStyle: 'block' },
  )

  // 本文不重複放標題當 H1，標題在 frontmatter 已經有了
  const blocks: string[] = []
  const note = userNote?.trim()
  if (note) blocks.push(asBlockquote(note))
  // 選取擷取時 youtube 是 null（選取的型別壓過網址啟發式），此時字幕一律不理
  const outline =
    youtube && extracted.transcriptMarkdown
      ? youtubeChapterOutline(extracted.transcriptMarkdown, youtube)
      : ''
  const content = youtube
    ? [
        youtube.url,
        formatYouTubeDescription(extracted.description, youtube),
        outline ? `## 章節\n\n${outline}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : extracted.contentMarkdown.trim()
  if (content) blocks.push(content)

  const body = blocks.join('\n\n')
  return {
    filename: rawClippingFilename(extracted.title, extracted.url, now),
    markdown: body ? `${frontmatter}\n\n${body}\n` : `${frontmatter}\n`,
  }
}
