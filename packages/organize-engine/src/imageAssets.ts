/**
 * 把擷取內容裡的遠端圖片換成 vault 內的本機檔，這支負責純邏輯（找網址、決定檔名、改寫）。
 * 實際下載與寫檔在擴充端（瀏覽器 I/O），見 fs/writeAssets.ts。
 *
 * 為什麼要下載（2026-07-26 拍板）：社群平台的圖片網址會過期或需要登入態，只留網址等於
 * 留一堆之後會爛掉的連結，跟筆記永遠存本機那條原則也對不上。
 *
 * 副檔名一律收斂到 Hyday 的白名單，因為 Hyday 的 hyday-asset 協定只供這幾種，
 * 存成別的副檔名會拿到 415、圖就是壞的（見 v2 electron/vault.cjs 的 ASSET_MIME）。
 */
import { mapOutsideFences, scanOutsideFences } from './fences'

/** 圖片落點，vault 底下的固定資料夾。Hyday 的 hyday-asset 協定只認 assets/ 開頭 */
export const ASSETS_DIR = 'assets'

/** Hyday 供得出來的副檔名，與 v2 electron/vault.cjs 的 ASSET_MIME 對齊 */
const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}
const ALLOWED_EXTENSIONS = new Set(Object.values(CONTENT_TYPE_EXTENSION))

// markdown 圖片語法。角括號寫法與後面的 title 都收，被連結包住時只吃內層的 ![]()
const IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(\s+"[^"]*")?\s*\)/g
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|]/g
const MAX_STEM = 40

/** content-type 對到白名單副檔名，不在名單內回 null */
export function extensionForContentType(contentType: string | undefined): string | null {
  if (!contentType) return null
  const base = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return CONTENT_TYPE_EXTENSION[base] ?? null
}

/** 撈出內容裡所有遠端圖片網址（去重、保持出現順序），圍籬內與非遠端的都跳過 */
export function findRemoteImageUrls(markdown: string): string[] {
  const seen = new Set<string>()
  scanOutsideFences(markdown, (chunk) => {
    for (const match of chunk.matchAll(IMAGE_RE)) {
      const url = match[1]
      if (url && /^https?:\/\//i.test(url)) seen.add(url)
    }
  })
  return [...seen]
}

/** FNV-1a：只是要一個穩定短碼區分同名不同來源的圖，不是安全用途 */
function shortHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 決定圖片在 assets/ 裡的檔名：`<網址最後一段>-<網址短碼>.<副檔名>`。
 * 短碼讓不同來源的同名圖不互相蓋掉，也讓同一個網址重抓時得到同一個檔名。
 * 判不出白名單副檔名就回 null，呼叫端該保留原本的遠端網址而不是存一個壞檔。
 */
/**
 * 取網址裡「看起來像檔名」的最後一段。
 *
 * CDN 轉檔服務（Substack、Cloudinary、imgix 這類）會把原始網址整個 URL-encode 塞進路徑
 * 最後一段，直接拿來當檔名會得到 `https%3A%2F%2F...` 這種怪東西（2026-07-26 踩過）。
 * 所以解碼後如果本身又是個網址，就往裡面再取一層。
 */
function lastPathSegment(url: string, depth = 0): string {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    pathname = url.split('?')[0] ?? url
  }
  const last = pathname.split('/').filter(Boolean).pop() ?? 'image'
  let decoded = last
  try {
    decoded = decodeURIComponent(last)
  } catch {
    // 壞的百分號編碼就用原字串
  }
  if (depth < 2 && /^https?:\/\//i.test(decoded)) return lastPathSegment(decoded, depth + 1)
  return decoded
}

export function assetFileName(url: string, contentType?: string): string | null {
  const last = lastPathSegment(url)
  const dot = last.lastIndexOf('.')
  const rawExt = dot > 0 ? last.slice(dot + 1).toLowerCase() : ''
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : extensionForContentType(contentType)
  if (!ext) return null

  const rawStem = dot > 0 ? last.slice(0, dot) : last
  const stem =
    rawStem
      .replace(UNSAFE_FILENAME_CHARS, '-')
      .replace(/\s+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, MAX_STEM) || 'image'
  return `${stem}-${shortHash(url)}.${ext}`
}

/** 把已下載的圖片網址改寫成 vault 相對路徑；沒對應到的原樣留著 */
export function rewriteImageUrls(markdown: string, mapping: Record<string, string>): string {
  return mapOutsideFences(markdown, (chunk) =>
    chunk.replace(IMAGE_RE, (whole, url: string, title: string | undefined) => {
      const name = mapping[url]
      if (!name) return whole
      const alt = whole.slice(0, whole.indexOf('](') + 1)
      return `${alt}(${ASSETS_DIR}/${name}${title ?? ''})`
    }),
  )
}
