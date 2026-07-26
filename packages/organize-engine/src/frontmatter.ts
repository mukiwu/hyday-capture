/**
 * 產生 hyday 手寫 YAML 解析器讀得懂的 frontmatter：只用簡單純量與陣列，
 * 不用多行純量、anchor 或任意巢狀 map。
 */

export type FrontmatterValue = string | number | boolean | string[]

/**
 * 序列化成 hyday frontmatter 慣用的 YYYY-MM-DD HH:mm:ss（本地時間）。
 * 不含 'T'，避免被當成 ISO timestamp，讓 hyday 以字串讀入。
 */
export function formatTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

// 日期或日期時間形狀的值。標準 YAML 會把這些 coerce 成 timestamp 型別，
// hyday 自己的手寫解析器雖然一律當字串，但 hyday 寫檔時是加引號的
// （見 v1 noteService 的 frontmatter 序列化，vault 裡 350 篇都是引號形），
// 外部工具寫出跟 app 自己不同的形狀會變成雜訊，所以這類值一律加引號
const DATE_LIKE_VALUE = /^\d{4}-\d{2}-\d{2}([ T].*)?$/

/**
 * 只在值會被 YAML 誤解時才加雙引號（冒號加空白、行首指示字元等），
 * 一般網址的 :// 不會被引號包住；日期與時間戳一律加引號，理由見
 * DATE_LIKE_VALUE 的註解。值裡的雙引號與反斜線做跳脫。
 */
export function yamlScalar(value: string): string {
  const needsQuote =
    value === '' ||
    DATE_LIKE_VALUE.test(value) ||
    /^\s|\s$/.test(value) || // 前後空白
    /[\r\n]/.test(value) || // 含換行，一定要用引號字串攤平成一行
    /^[!&*[\]{},#|>@`"'%]/.test(value) || // 不可作為 plain scalar 開頭的指示字元
    /^[-?:](\s|$)/.test(value) || // - ? : 開頭且後接空白或結尾
    /:(\s|$)/.test(value) || // 冒號後接空白或結尾（mapping 指示）
    /\s#/.test(value) // 空白加井號（註解指示）
  if (!needsQuote) return value
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
  return `"${escaped}"`
}

function serializeValue(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    // 行內陣列，hyday 手寫解析器可讀
    return `[${value.map(yamlScalar).join(', ')}]`
  }
  if (typeof value === 'string') return yamlScalar(value)
  return String(value)
}

/**
 * 陣列的兩種寫法。inline 是 `key: [a, b]`，block 是 key 換行加縮排 `- a`。
 * 兩種 hyday 的 noteIndex 都讀得懂，但 v2 屬性面板的 parseFrontmatterEntries
 * 只認 block（inline 會被讀成字串），使用者 vault 既有筆記也都是 block，
 * 所以新寫的檔案用 block；inline 保留為預設，既有呼叫端行為不變。
 */
export type ArrayStyle = 'inline' | 'block'

/**
 * 依序列化欄位。只有 undefined 會被略過；空陣列照實輸出成 `key: []`，
 * 讓「不要這個鍵」與「這個鍵是空陣列」語義分明（issue #6 的 tags 需要這個區別）。
 * 回傳含頭尾 --- 的完整 frontmatter 區塊。
 */
export function serializeFrontmatter(
  fields: Array<readonly [string, FrontmatterValue | undefined]>,
  opts: { arrayStyle?: ArrayStyle } = {},
): string {
  const lines = ['---']
  for (const [key, value] of fields) {
    if (value === undefined) continue
    if (opts.arrayStyle === 'block' && Array.isArray(value) && value.length > 0) {
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${yamlScalar(item)}`)
      continue
    }
    lines.push(`${key}: ${serializeValue(value)}`)
  }
  lines.push('---')
  return lines.join('\n')
}
