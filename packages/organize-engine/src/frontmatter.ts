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

/**
 * 只在值會被 YAML 誤解時才加雙引號（冒號加空白、行首指示字元等），
 * 一般網址的 :// 與時間戳的 09:30:05 不會被引號包住。
 * 值裡的雙引號與反斜線做跳脫。
 */
export function yamlScalar(value: string): string {
  const needsQuote =
    value === '' ||
    /^\s|\s$/.test(value) || // 前後空白
    /^[!&*[\]{},#|>@`"'%]/.test(value) || // 不可作為 plain scalar 開頭的指示字元
    /^[-?:](\s|$)/.test(value) || // - ? : 開頭且後接空白或結尾
    /:(\s|$)/.test(value) || // 冒號後接空白或結尾（mapping 指示）
    /\s#/.test(value) // 空白加井號（註解指示）
  if (!needsQuote) return value
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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
 * 依序列化欄位，undefined 的欄位略過。回傳含頭尾 --- 的完整 frontmatter 區塊。
 */
export function serializeFrontmatter(
  fields: Array<readonly [string, FrontmatterValue | undefined]>,
): string {
  const lines = ['---']
  for (const [key, value] of fields) {
    if (value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    lines.push(`${key}: ${serializeValue(value)}`)
  }
  lines.push('---')
  return lines.join('\n')
}
