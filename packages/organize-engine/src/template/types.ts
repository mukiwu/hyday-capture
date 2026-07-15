/**
 * 模板引擎的契約型別，仿 Obsidian Web Clipper。與平台無關，只用純字串邏輯，
 * 不碰 DOM。CSS selector 與 meta 的實際取值由宿主 adapter 先抽好，塞進
 * ExtractedContent 的 selectors/meta，引擎只讀已抽好的字串。
 */
import type { NoteType } from '../types'

/**
 * Source 規則的三種比對層級：
 * - urlPrefix：網址前綴比對
 * - regex：對網址做正規表達式比對
 * - schemaOrg：頁面 schema.org @type 比對（大小寫不敏感）
 */
export type TriggerType = 'urlPrefix' | 'regex' | 'schemaOrg'

export type Trigger = {
  type: TriggerType
  value: string
}

/**
 * property 的型別，決定序列化成 YAML 時的形狀。
 * text 走純量、number/boolean 走對應純量、date/datetime 走日期格式，
 * list/multitext 走行內陣列。
 */
export type PropertyType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'list'
  | 'multitext'

/** 一個 frontmatter 欄位的定義：名稱、值運算式（含 {{變數}}）、型別 */
export type TemplateProperty = {
  name: string
  value: string
  type: PropertyType
}

/**
 * 一組模板。triggers 為空或未定義代表這組只能當預設（最上面那組）。
 * body 與 properties 的值運算式都支援 {{變數|filter|filter}}。
 */
export type Template = {
  name: string
  /** Source 規則，第一個命中的模板勝出；皆不中則用清單最上面那組 */
  triggers?: Trigger[]
  /** frontmatter 欄位定義 */
  properties: TemplateProperty[]
  /** 筆記本體，含 {{變數}} 的 Markdown */
  body: string
  /** 可選：直接指定 type property 用的類型；未給則由網址啟發式判斷 */
  noteType?: NoteType
}
