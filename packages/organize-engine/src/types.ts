/**
 * 整理引擎的契約型別。與平台無關，Chrome 擴充與未來的 React Native app 共用同一份。
 */

/** AI 呼叫以注入介面傳入，讓引擎完全 deterministic；測試時給假實作 */
export type AICaller = (prompts: string[], context: string) => Promise<string[]>

/**
 * hyday 內建型別中，hyday-capture 只自動判這三種。
 * card 與 link 不自動判，交給使用者在 hyday 自行調整。
 */
export type NoteType = 'img' | 'video' | 'article'

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
}

export type OrganizeInput = {
  extracted: ExtractedContent
  /** 注入的 AI 呼叫；issue #6 的錨定式下標會用到，issue #3 尚未呼叫 */
  ai: AICaller
  /** 注入現在時間，讓 createdAt/lastModified 可預期 */
  now: Date
}

export type OrganizeOutput = {
  filename: string
  markdown: string
}
