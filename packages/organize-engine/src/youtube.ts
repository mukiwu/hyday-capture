/** YouTube 單支影片的最小引用，供擷取端與未來 app adapter 共用。 */
export type YouTubeVideo = {
  id: string
  url: string
  startSeconds?: number
}

const YOUTUBE_TIMESTAMP_RE =
  /(^|[\s([（【])([0-9]{1,4}):([0-5][0-9])(?::([0-5][0-9]))?(?=$|[^0-9:])/gm

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

function parseStartSeconds(value: string | null): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value)) {
    const seconds = Number(value)
    return seconds >= 0 ? seconds : undefined
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value)
  if (!match) return undefined
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)
  return seconds >= 0 ? seconds : undefined
}

/**
 * 接受 YouTube 常見單支影片網址，移除追蹤／播放清單參數，只保留影片 id 與開始時間（含 0 秒）。
 * 輸出格式與 hyday-v2 的 youtubeEmbed seam 相同：整行 URL 會被升級成影片 embed。
 */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const value = input.trim()
  if (!value || /\s/.test(value)) return null

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  const host = parsed.hostname.toLowerCase()
  let id: string | null = null
  if (host === 'youtu.be') {
    id = parsed.pathname.split('/').filter(Boolean)[0] ?? null
  } else if (YOUTUBE_HOSTS.has(host)) {
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts[0] === 'watch') id = parsed.searchParams.get('v')
    else if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) id = parts[1] ?? null
  } else {
    return null
  }
  if (!id || !VIDEO_ID_RE.test(id)) return null

  const startSeconds =
    parseStartSeconds(parsed.searchParams.get('t')) ??
    parseStartSeconds(parsed.searchParams.get('start')) ??
    parseStartSeconds(new URLSearchParams(parsed.hash.replace(/^#/, '')).get('t'))
  const hasStart = startSeconds !== undefined
  const url = `https://www.youtube.com/watch?v=${id}${hasStart ? `&t=${startSeconds}` : ''}`
  return { id, url, ...(hasStart ? { startSeconds } : {}) }
}

/** 產生 hyday-v2 可辨識的 YouTube 時間戳網址。 */
export function youtubeTimestampUrl(video: YouTubeVideo, seconds: number): string {
  const start = Math.max(0, Math.floor(seconds))
  return `https://www.youtube.com/watch?v=${video.id}&t=${start}`
}

function timestampSeconds(minutesOrHours: string, secondsOrMinutes: string, seconds?: string): number {
  if (seconds === undefined) return Number(minutesOrHours) * 60 + Number(secondsOrMinutes)
  return Number(minutesOrHours) * 3600 + Number(secondsOrMinutes) * 60 + Number(seconds)
}

/**
 * 保留 YouTube 原始描述，只把作者常用的 `0:00`／`1:24`／`1:02:03` 時間戳
 * 轉成 hyday-v2 能攔截並 seek 的 Markdown link。描述不是 Markdown 來源，這裡不
 * 重新轉義或改寫其他文字，避免擷取時丟掉作者的排版與連結。
 */
export function formatYouTubeDescription(description: string | undefined, video: YouTubeVideo): string {
  const text = description?.replace(/\r\n?/g, '\n').trim()
  if (!text) return ''

  return text
    .split('\n')
    .map((line) =>
      line.replace(
        YOUTUBE_TIMESTAMP_RE,
        (
          _match: string,
          prefix: string,
          minutesOrHours: string,
          secondsOrMinutes: string,
          seconds?: string,
        ) => {
          const token = `${minutesOrHours}:${secondsOrMinutes}${seconds === undefined ? '' : `:${seconds}`}`
          const start = timestampSeconds(minutesOrHours, secondsOrMinutes, seconds)
          return `${prefix}[${token}](${youtubeTimestampUrl(video, start)})`
        },
      ),
    )
    .join('\n')
}

/** Defuddle 字幕的章節標題行，例如 `### Introduction example` */
const TRANSCRIPT_CHAPTER_RE = /^###\s+(.+?)\s*$/
/** Defuddle 字幕的句首時間戳，例如 `**0:04** · This is a 3.` */
const TRANSCRIPT_TIMESTAMP_RE = /^\*\*(\d{1,4}):([0-5][0-9])(?::([0-5][0-9]))?\*\*/

/**
 * 從 Defuddle 的 YouTube 字幕 Markdown 抽出章節大綱。
 *
 * 字幕逐字稿動輒三千字以上，整篇落進原料檔會淹掉筆記本身；章節標題加起始時間戳
 * 才是使用者回頭找片段時真正用得到的索引。章節標題是 YouTube 作者自己下的
 * （Defuddle 用 `###` 標），起始時間取該章節底下第一個句首時間戳。
 *
 * 沒有章節的影片回空字串，不硬湊——那種影片的逐字稿沒有結構可言，
 * 給一串沒有標題的時間戳沒有意義。
 */
export function youtubeChapterOutline(transcript: string, video: YouTubeVideo): string {
  const lines = transcript.replace(/\r\n?/g, '\n').split('\n')
  const outline: string[] = []
  let chapter: string | undefined

  for (const line of lines) {
    const heading = TRANSCRIPT_CHAPTER_RE.exec(line)
    if (heading) {
      chapter = heading[1]
      continue
    }
    if (!chapter) continue

    const stamp = TRANSCRIPT_TIMESTAMP_RE.exec(line)
    if (!stamp) continue

    const [, first, second, third] = stamp
    const token = `${first}:${second}${third === undefined ? '' : `:${third}`}`
    const seconds = timestampSeconds(first!, second!, third)
    outline.push(`- [${token}](${youtubeTimestampUrl(video, seconds)}) ${chapter}`)
    chapter = undefined
  }

  return outline.join('\n')
}
