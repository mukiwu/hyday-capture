import type { NoteType } from './types'

// 影音站網域，比對時看 hostname 是否以這些結尾，涵蓋 www.、m. 等子網域
const VIDEO_HOSTS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'bilibili.com',
  'twitch.tv',
  'dailymotion.com',
  'nicovideo.jp',
]

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?|heic|heif)$/i

/**
 * 用網址啟發式判斷筆記類型。
 * 圖片副檔名為 img，影音站網域為 video，其餘一律 article。
 */
export function detectNoteType(url: string): NoteType {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'article'
  }

  if (IMAGE_EXT.test(parsed.pathname)) return 'img'

  const host = parsed.hostname.toLowerCase()
  const isVideo = VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  if (isVideo) return 'video'

  return 'article'
}
