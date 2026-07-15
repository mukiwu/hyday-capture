/**
 * Pipe filter：左到右套用在變數值上。全部是純字串轉換，不碰 DOM，
 * 讓引擎維持平台無關（ADR 0006）。
 */

/** 日期 token 格式化，支援 YYYY MM DD HH mm ss，以及月份縮寫 MMM */
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * 直接用正規表達式拆常見 ISO 樣式（YYYY-MM-DD、可帶 T 或空白的 HH:mm:ss），
 * 從字面數字取值，不經 Date 物件，避免 date-only 字串被當 UTC、date-time 字串
 * 被當本地時間而漂移。拆不出來才退回 Date 以 UTC 盡力解析。
 */
function parseDateParts(s: string): DateParts | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (m) {
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4] ?? '0'),
      minute: Number(m[5] ?? '0'),
      second: Number(m[6] ?? '0'),
    }
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  }
}

/** 把日期字串按格式輸出，無法解析時原樣回傳 */
export function formatDate(input: string, format = 'YYYY-MM-DD'): string {
  const trimmed = input.trim()
  if (trimmed === '') return ''
  const c = parseDateParts(trimmed)
  if (!c) return input
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const map: Record<string, string> = {
    YYYY: p(c.year, 4),
    MMM: MONTHS_SHORT[c.month - 1] ?? '',
    MM: p(c.month),
    DD: p(c.day),
    HH: p(c.hour),
    mm: p(c.minute),
    ss: p(c.second),
  }
  // 長 token 先換，避免 MM 先吃掉 MMM
  return format.replace(/YYYY|MMM|MM|DD|HH|mm|ss/g, (t) => map[t] ?? t)
}

/**
 * 極輕量的 HTML 轉 Markdown，純正規表達式，不依賴 DOM。
 * 涵蓋常見標籤，足夠給模板的 meta/selector HTML 取值塑形；
 * 需要 DOM 精準轉換的情境由宿主 adapter 先轉好再餵進來。
 */
export function htmlToMarkdown(html: string): string {
  let s = html
  // 換行類先處理
  s = s.replace(/<\s*br\s*\/?>/gi, '\n')
  s = s.replace(/<\/\s*(p|div)\s*>/gi, '\n\n')
  // 標題
  s = s.replace(/<\s*h([1-6])[^>]*>([\s\S]*?)<\/\s*h\1\s*>/gi, (_m, level: string, inner: string) => {
    return `\n${'#'.repeat(Number(level))} ${inner.trim()}\n`
  })
  // 粗體、斜體
  s = s.replace(/<\s*(strong|b)[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_m, _t, inner: string) => `**${inner}**`)
  s = s.replace(/<\s*(em|i)[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_m, _t, inner: string) => `*${inner}*`)
  // 連結與圖片
  s = s.replace(/<\s*img[^>]*?alt=["']([^"']*)["'][^>]*?src=["']([^"']*)["'][^>]*?>/gi, '![$1]($2)')
  s = s.replace(/<\s*img[^>]*?src=["']([^"']*)["'][^>]*?>/gi, '![]($1)')
  s = s.replace(/<\s*a[^>]*?href=["']([^"']*)["'][^>]*?>([\s\S]*?)<\/\s*a\s*>/gi, '[$2]($1)')
  // 清單項目
  s = s.replace(/<\s*li[^>]*>([\s\S]*?)<\/\s*li\s*>/gi, (_m, inner: string) => `- ${inner.trim()}\n`)
  s = s.replace(/<\/?\s*(ul|ol)\s*>/gi, '\n')
  // 行內程式碼與引用
  s = s.replace(/<\s*code[^>]*>([\s\S]*?)<\/\s*code\s*>/gi, (_m, inner: string) => `\`${inner}\``)
  s = s.replace(/<\s*blockquote[^>]*>([\s\S]*?)<\/\s*blockquote\s*>/gi, (_m, inner: string) =>
    inner
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n'),
  )
  // 去掉剩餘標籤
  s = s.replace(/<[^>]+>/g, '')
  // 常見 HTML entity
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // 收斂多餘空行
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 把值攤成非空行陣列，順手剝掉既有的清單符號 */
function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim())
    .filter((line) => line !== '')
}

export type Filter = (value: string, args: string[]) => string

export const FILTERS: Record<string, Filter> = {
  upper: (v) => v.toUpperCase(),
  lower: (v) => v.toLowerCase(),
  trim: (v) => v.trim(),
  capitalize: (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v),
  title: (v) => v.replace(/\b\w/g, (c) => c.toUpperCase()),
  // 值為空時給預設值
  default: (v, args) => (v.trim() === '' ? (args[0] ?? '') : v),
  // 日期格式化：date 或 date:"YYYY-MM-DD HH:mm:ss"
  date: (v, args) => formatDate(v, args[0] ?? 'YYYY-MM-DD'),
  // HTML 轉 Markdown
  markdown: (v) => htmlToMarkdown(v),
  // 清單塑形：每行一項，輸出 markdown 無序清單
  list: (v) => toLines(v).map((line) => `- ${line}`).join('\n'),
  // 引用塑形：每行加上 >
  blockquote: (v) =>
    v
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n'),
  // callout 塑形：callout 或 callout:"type" 或 callout:"type","title"
  callout: (v, args) => {
    const type = args[0]?.trim() || 'note'
    const title = args[1]?.trim()
    const head = title ? `> [!${type}] ${title}` : `> [!${type}]`
    const bodyLines = v
      .trim()
      .split('\n')
      .map((line) => `> ${line}`)
    return [head, ...bodyLines].join('\n')
  },
  // 取代：replace:"from","to"
  replace: (v, args) => {
    const from = args[0] ?? ''
    const to = args[1] ?? ''
    if (from === '') return v
    return v.split(from).join(to)
  },
}

/**
 * 解析 filter 段，例如 `date:"YYYY-MM-DD"` 或 `replace:"a","b"`。
 * 回傳 filter 名稱與參數陣列，參數可加引號（引號內的逗號不切分）。
 */
export function parseFilter(spec: string): { name: string; args: string[] } {
  const colon = spec.indexOf(':')
  if (colon === -1) return { name: spec.trim(), args: [] }
  const name = spec.slice(0, colon).trim()
  const rest = spec.slice(colon + 1)
  const args: string[] = []
  let buf = ''
  let quote: '"' | "'" | null = null
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i]
    if (quote) {
      if (ch === quote) quote = null
      else buf += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === ',') {
      args.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  args.push(buf.trim())
  // 全空（例如 `date:`）視為無參數
  if (args.length === 1 && args[0] === '') return { name, args: [] }
  return { name, args }
}

/** 依序套用一串 filter，未知 filter 略過（不炸掉整個模板） */
export function applyFilters(value: string, filterSpecs: string[]): string {
  let out = value
  for (const spec of filterSpecs) {
    if (spec.trim() === '') continue
    const { name, args } = parseFilter(spec)
    const fn = FILTERS[name]
    if (fn) out = fn(out, args)
  }
  return out
}
