/**
 * hyday 慣例的檔名處理：用標題做安全化檔名，避開會被誤判成 journal 的日期樣式，
 * 碰撞時加時間戳後綴。與平台無關的純邏輯。
 */

// 檔案系統不安全字元：路徑分隔與保留字元（換行/tab 等空白交給後面的 \s+ 收斂）
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g
const DATE_LIKE_NAME = /^\d{4}[-.]\d{2}[-.]\d{2}$/

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

// 檔名長度上限，留餘裕給碰撞後綴與副檔名，避免超過作業系統的檔名限制。
// 60 是可讀性上限不是系統上限：社群貼文的分頁標題就是整篇內容，X 實測會產出
// 121 字的檔名（2026-07-26 踩過），在 Finder 與筆記列表都難認
const MAX_STEM_LENGTH = 60

/** 把標題整理成檔案系統安全、且不會被 hyday 誤判成 journal 的檔名主幹 */
export function safeFileStem(title: string, fallbackUrl: string): string {
  let stem = cleanForFilename(title ?? '')
  if (stem === '') stem = fallbackStemFromUrl(fallbackUrl)
  if (stem.length > MAX_STEM_LENGTH) {
    stem = stem.slice(0, MAX_STEM_LENGTH).replace(/[. ]+$/, '')
  }
  if (DATE_LIKE_NAME.test(stem)) stem = `${stem} capture`
  return stem
}

/** 檔名碰撞時，在副檔名前插入緊湊時間戳後綴 */
export function appendCollisionSuffix(filename: string, at: Date): string {
  const dot = filename.lastIndexOf('.')
  const stem = dot === -1 ? filename : filename.slice(0, dot)
  const ext = dot === -1 ? '' : filename.slice(dot)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp =
    `${p(at.getFullYear(), 4)}${p(at.getMonth() + 1)}${p(at.getDate())}-` +
    `${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`
  return `${stem} ${stamp}${ext}`
}
