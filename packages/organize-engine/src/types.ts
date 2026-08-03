/**
 * 整理引擎的契約型別。與平台無關，Chrome 擴充與未來的 React Native app 共用同一份。
 */
import type { Template } from './template/types'

/** AI 呼叫以注入介面傳入，讓引擎完全 deterministic；測試時給假實作 */
export type AICaller = (prompts: string[], context: string) => Promise<string[]>

/**
 * hyday 內建型別中，hyday-capture 會產出這四種。
 * img 與 video 由網址啟發式判定、card 是選取擷取、其餘一律 article；
 * link 不自動判，交給使用者在 hyday 自行調整。
 */
export type NoteType = 'img' | 'video' | 'article' | 'card'

/** Defuddle（或其他宿主的抽取器）產出的頁面資料，是引擎的輸入 */
export type ExtractedContent = {
  /** 來源網址 */
  url: string
  /** 來源網域 */
  domain: string
  title: string
  /** 正文，已轉成 Markdown */
  contentMarkdown: string
  author?: string
  published?: string
  description?: string
  image?: string
  // 以下為 issue #4 模板引擎新增的可選欄位，由宿主 adapter（content script）先抽好。
  // 引擎不碰 DOM，只讀這些 already-extracted 字串。
  /** 頁面 schema.org @type（可多個），供模板 schemaOrg trigger 比對 */
  schemaOrgTypes?: string[]
  /** meta 標籤鍵值（例如 og:title、twitter:card），供 {{meta:key}} 變數取值 */
  meta?: Record<string, string>
  /** CSS selector 取到的純文字，供 {{selector:css}} 變數取值 */
  selectors?: Record<string, string>
  /** CSS selector 取到的 HTML，供 {{selectorHtml:css}} 變數取值 */
  selectorsHtml?: Record<string, string>
}

export type OrganizeInput = {
  extracted: ExtractedContent
  /** 注入的 AI 呼叫；issue #6 的錨定式下標會用到，issue #3 尚未呼叫 */
  ai: AICaller
  /** 注入現在時間，讓 createdAt/lastModified 可預期 */
  now: Date
  /**
   * 掃描 vault 得到的既有標籤詞彙（issue #6）。錨定式下標優先沿用這裡的標籤；
   * 未給則視為空詞彙、近似開放模式。掃描屬瀏覽器 I/O，由擴充 adapter 提供，不進引擎。
   */
  tagVocabulary?: string[]
  /**
   * 可選的模板組（issue #4）。提供且非空時，依 Source 規則選一組模板產出筆記；
   * 未提供則走原本的預設輸出行為，維持既有相容性。
   */
  templates?: Template[]
}

export type OrganizeOutput = {
  filename: string
  markdown: string
}
