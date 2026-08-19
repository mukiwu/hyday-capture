import { mapOutsideFences } from './fences'
import { parseYouTubeUrl } from './youtube'

const MP4_PATHNAME = /\.mp4$/i

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function attributeValue(attributes: string, name: string): string | undefined {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\u0060]+))`, 'i'),
  )
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value ? decodeHtmlAttribute(value.trim()) : undefined
}

function resolveUrl(value: string | undefined, sourceUrl?: string): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    if (!sourceUrl) return null
    try {
      return new URL(value, sourceUrl)
    } catch {
      return null
    }
  }
}

function resolveHttpsMp4(value: string | undefined, sourceUrl?: string): URL | null {
  const parsed = resolveUrl(value, sourceUrl)
  return parsed?.protocol === 'https:' && MP4_PATHNAME.test(parsed.pathname) ? parsed : null
}

function videoCandidates(attributes: string, inner = ''): Array<string | undefined> {
  const candidates = [attributeValue(attributes, 'src'), attributeValue(attributes, 'data-src')]
  for (const source of inner.matchAll(/<source\b([^>]*)>/gi)) {
    const sourceAttributes = source[1] ?? ''
    candidates.push(attributeValue(sourceAttributes, 'src'), attributeValue(sourceAttributes, 'data-src'))
  }
  return candidates
}

function firstHttpsMp4(candidates: Array<string | undefined>, sourceUrl?: string): URL | null {
  for (const candidate of candidates) {
    const parsed = resolveHttpsMp4(candidate, sourceUrl)
    if (parsed) return parsed
  }
  return null
}

function videoLabel(url: URL): string {
  const rawName = url.pathname.split('/').pop() || '影片.mp4'
  let decoded = rawName
  try {
    decoded = decodeURIComponent(rawName)
  } catch {
    // URL 已符合播放契約時，不因檔名 percent encoding 不完整而丟掉影片。
  }
  return decoded.replace(/[\[\]]/g, '\\$&')
}

function markdownDestination(value: string): string {
  return value.replace(/[()]/g, '\\$&')
}

function videoLink(url: URL): string {
  return `[${videoLabel(url)}](${markdownDestination(url.href)})`
}

/** 讓播放器 seam 看到的連結一定單獨佔一行，同時避免無謂的首尾空行。 */
function standaloneLine(value: string, whole: string, offset: number, input: string): string {
  const before = input.slice(0, offset)
  const after = input.slice(offset + whole.length)
  const needsLeadingNewline = !/(?:^|\n)[ \t]*$/.test(before)
  const needsTrailingNewline = !/^[ \t]*(?:\n|$)/.test(after)
  return `${needsLeadingNewline ? '\n' : ''}${value}${needsTrailingNewline ? '\n' : ''}`
}

function convertChunk(chunk: string, sourceUrl?: string): string {
  let out = chunk.replace(
    /<video\b([^>]*)>([\s\S]*?)<\/video\s*>|<video\b([^>]*?)\/?>/gi,
    (
      whole,
      pairedAttributes: string | undefined,
      inner: string | undefined,
      loneAttributes: string | undefined,
      offset: number,
      input: string,
    ) => {
      const candidates = videoCandidates(pairedAttributes ?? loneAttributes ?? '', inner ?? '')
      const mp4 = firstHttpsMp4(candidates, sourceUrl)
      return mp4 ? standaloneLine(videoLink(mp4), whole, offset, input) : whole
    },
  )

  out = out.replace(
    /<iframe\b([^>]*)>([\s\S]*?)<\/iframe\s*>|<iframe\b([^>]*?)\/?>/gi,
    (
      whole,
      pairedAttributes: string | undefined,
      _inner: string | undefined,
      loneAttributes: string | undefined,
      offset: number,
      input: string,
    ) => {
      const attributes = pairedAttributes ?? loneAttributes ?? ''
      const rawUrl = attributeValue(attributes, 'src') ?? attributeValue(attributes, 'data-src')
      const resolved = resolveUrl(rawUrl, sourceUrl)
      const youtube = resolved ? parseYouTubeUrl(resolved.href) : null
      if (youtube) return standaloneLine(youtube.url, whole, offset, input)

      const mp4 = resolveHttpsMp4(rawUrl, sourceUrl)
      return mp4 ? standaloneLine(videoLink(mp4), whole, offset, input) : whole
    },
  )

  out = out.replace(
    /<embed\b([^>]*)\/?>/gi,
    (whole, attributes: string | undefined, offset: number, input: string) => {
      const attrs = attributes ?? ''
      const rawUrl = attributeValue(attrs, 'src') ?? attributeValue(attrs, 'data-src')
      const mp4 = resolveHttpsMp4(rawUrl, sourceUrl)
      return mp4 ? standaloneLine(videoLink(mp4), whole, offset, input) : whole
    },
  )

  out = out.replace(
    /<object\b([^>]*)>([\s\S]*?)<\/object\s*>/gi,
    (whole, attributes: string | undefined, _inner: string, offset: number, input: string) => {
      const attrs = attributes ?? ''
      const rawUrl = attributeValue(attrs, 'data') ?? attributeValue(attrs, 'src')
      const mp4 = resolveHttpsMp4(rawUrl, sourceUrl)
      return mp4 ? standaloneLine(videoLink(mp4), whole, offset, input) : whole
    },
  )

  return out
}

/**
 * 只把 Hyday 明確支援的 HTTPS MP4 轉成播放器 Markdown，並將 YouTube iframe
 * 降成 canonical 裸網址。其他影音平台或疑似影片 HTML 均保留原文。
 */
export function convertVideoEmbedsToMarkdown(markdown: string, sourceUrl?: string): string {
  return mapOutsideFences(markdown, (chunk) => convertChunk(chunk, sourceUrl))
}
