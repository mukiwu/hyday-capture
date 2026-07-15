/**
 * 走路骨架的核心 seam：把一則擷取的 title + url 轉成最小 frontmatter 的 hyday .md
 *
 * 這裡只放與平台無關的純邏輯，瀏覽器 I/O（抓分頁、選資料夾、寫檔）留在 adapter。
 * issue #3 會把這段抽進獨立的整理引擎套件，這裡是它的雛形。
 */

export type CaptureInput = {
  title: string
  url: string
  capturedAt: Date
}

export type BuiltNote = {
  filename: string
  markdown: string
}

// 檔案系統不安全字元：路徑分隔與保留字元（換行/tab 等空白交給後面的 \s+ 收斂）
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g
const DATE_LIKE_NAME = /^\d{4}[-.]\d{2}[-.]\d{2}$/

/** 把標題整理成檔案系統安全、且不會被 hyday 誤判成 journal 的檔名主幹 */
export function safeFileStem(title: string, fallbackUrl: string): string {
  let stem = cleanForFilename(title ?? '')

  if (stem === '') {
    stem = fallbackStemFromUrl(fallbackUrl)
  }

  // 純日期樣式會被 hyday 當成 journal，加後綴打破比對
  if (DATE_LIKE_NAME.test(stem)) {
    stem = `${stem} capture`
  }

  return stem
}

function cleanForFilename(s: string): string {
  return s
    .replace(UNSAFE_FILENAME_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Windows 不允許結尾的點與空白
    .replace(/[. ]+$/, '')
}

function fallbackStemFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    const stem = cleanForFilename(last ?? u.hostname)
    return stem || 'capture'
  } catch {
    return 'capture'
  }
}

/** 格式化成 hyday frontmatter 慣用的 YYYY-MM-DD HH:mm:ss（本地時間） */
export function formatTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  )
}

/** 緊湊時間戳，給碰撞後綴用 */
function compactTimestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}-` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

/**
 * 序列化成 hyday 手寫 YAML 解析器讀得懂的簡單純量。
 * 只在值會被 YAML 誤解時才加雙引號（例如冒號加空白、行首指示字元），
 * 一般網址的 :// 不會被引號包住。值裡的雙引號與反斜線做跳脫。
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

export function buildCaptureNote(input: CaptureInput): BuiltNote {
  const stem = safeFileStem(input.title, input.url)
  const title = input.title.trim() || stem

  const frontmatter = [
    '---',
    `title: ${yamlScalar(title)}`,
    `sourceUrl: ${yamlScalar(input.url)}`,
    `createdAt: ${formatTimestamp(input.capturedAt)}`,
    '---',
  ].join('\n')

  const markdown = `${frontmatter}\n\n# ${title}\n`

  return { filename: `${stem}.md`, markdown }
}

/** 檔名碰撞時，在副檔名前插入時間戳後綴 */
export function appendCollisionSuffix(filename: string, capturedAt: Date): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  return `${stem} ${compactTimestamp(capturedAt)}${ext}`
}
