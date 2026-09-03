import type { ExtractedContent, YouTubeVideo } from '@hyday-capture/organize-engine'

export type YouTubePageMetadata = Partial<Pick<ExtractedContent, 'title' | 'author' | 'published' | 'description'>>

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined
}

function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  const record = object(value)
  if (!record) return undefined
  if (typeof record.simpleText === 'string') return record.simpleText.trim() || undefined
  if (Array.isArray(record.runs)) {
    const joined = record.runs
      .map((run) => object(run)?.text)
      .filter((part): part is string => typeof part === 'string')
      .join('')
      .trim()
    return joined || undefined
  }
  return undefined
}

/** 從 `<script>` 中取出 assignment 後面的 JSON object，不用脆弱的 `.*?};`。 */
function parseAssignedObject(source: string, marker: string): unknown {
  const markerIndex = source.search(new RegExp(`(?:var\\s+)?${marker}\\s*=\\s*`))
  if (markerIndex < 0) return undefined
  const assignment = source.slice(markerIndex)
  const start = assignment.indexOf('{')
  if (start < 0) return undefined

  let depth = 0
  let quote: '"' | "'" | undefined
  let escaped = false
  for (let index = start; index < assignment.length; index += 1) {
    const char = assignment[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(assignment.slice(start, index + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

/** 從 YouTube 的 `ytInitialPlayerResponse` 取描述與頁面 metadata。 */
export function parseYouTubePlayerResponseScript(
  source: string,
  videoId?: string,
): YouTubePageMetadata | undefined {
  const response = object(parseAssignedObject(source, 'ytInitialPlayerResponse'))
  const details = object(response?.videoDetails)
  if (!details) return undefined
  if (videoId && details.videoId !== videoId) return undefined

  const microformat = object(object(response?.microformat)?.playerMicroformatRenderer)
  const result: YouTubePageMetadata = {
    title: text(details.title) ?? text(microformat?.title),
    author: text(details.author) ?? text(microformat?.ownerChannelName),
    published: text(microformat?.publishDate) ?? text(microformat?.uploadDate),
    description: text(details.shortDescription) ?? text(microformat?.description),
  }
  return Object.values(result).some(Boolean) ? result : undefined
}

function metaContent(document: Document, selector: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() || undefined
}

function elementText(document: Document, selector: string): string | undefined {
  return document.querySelector(selector)?.textContent?.trim() || undefined
}

function fallbackTitle(document: Document): string | undefined {
  const title =
    metaContent(document, 'meta[itemprop="name"]') ??
    metaContent(document, 'meta[property="og:title"]') ??
    document.title.trim()
  return title.replace(/\s+-\s+YouTube\s*$/i, '').trim() || undefined
}

/** Shorts 頁（/shorts/<id>）用的是完全不同的 reel UI，`/watch` 頁的 DOM/meta fallback 選不到東西 */
function isShortsPage(document: Document): boolean {
  return (document.location?.pathname ?? '').startsWith('/shorts/')
}

function authorFallback(document: Document): string | undefined {
  return (
    metaContent(document, 'meta[itemprop="author"]') ??
    elementText(document, '#owner #channel-name, ytd-channel-name a, yt-reel-channel-bar-view-model a')
  )
}

/**
 * `/watch` 頁的 `<meta name/itemprop="description">` 是逐片填的，可以放心當 fallback；
 * Shorts 頁這兩個 meta 卻是整站通用文案（"在 YouTube 上盡情享受..."），不是這支影片的敘述——
 * 用了反而比留空還糟，見過真的把這段通用文案存成敘述的實案（2026-09-03）。
 * Shorts 也沒有獨立於標題之外的敘述容器，找不到就讓它是 undefined，不瞎猜。
 */
function descriptionFallback(document: Document): string | undefined {
  if (isShortsPage(document)) return undefined
  return (
    metaContent(document, 'meta[itemprop="description"]') ??
    metaContent(document, 'meta[name="description"]') ??
    elementText(document, '#description-inline-expander, ytd-watch-metadata #description')
  )
}

/** Content script 的薄 adapter：script JSON 優先，DOM/meta 只作頁面變形時的 fallback。 */
export function extractYouTubePageMetadata(document: Document, video: YouTubeVideo): YouTubePageMetadata {
  for (const script of Array.from(document.scripts)) {
    const parsed = parseYouTubePlayerResponseScript(script.textContent ?? '', video.id)
    if (parsed) {
      return {
        ...parsed,
        title: parsed.title ?? fallbackTitle(document),
        author: parsed.author ?? authorFallback(document),
        description: parsed.description ?? descriptionFallback(document),
      }
    }
  }

  return {
    title: fallbackTitle(document),
    author: authorFallback(document),
    published:
      metaContent(document, 'meta[itemprop="datePublished"]') ??
      metaContent(document, 'meta[itemprop="uploadDate"]'),
    description: descriptionFallback(document),
  }
}
