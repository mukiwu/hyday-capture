/**
 * Facebook 影片（Reel 與 watch 頁）的擷取路徑。
 *
 * 這兩種頁面都不是文章，原生抽取讀 DOM 只會撈到分頁導覽、按讚數、
 * 播放速度控制項這些介面碎屑（2026-10-10 實案：「1.00«–+»」「641」「你的留言已送出」）。
 * 所以這條路只拿三樣東西：影片的說明、作者、發布時間，正文就是影片連結加說明。
 * Hyday 會把單獨一行的影片連結換成 Facebook 官方的嵌入播放器
 *
 * 資料來源有兩層：
 * 1. 頁面初次載入時塞在 `<script type="application/json">` 裡的 story JSON，最完整
 * 2. 在 Reel 牆上滑到下一支時網址會換、script 不會跟著換，只能讀畫面上那張卡片
 */

const FACEBOOK_HOST = /(^|\.)facebook\.com$/i
const TITLE_MAX = 60

export type FacebookVideo = {
  caption?: string
  author?: string
  published?: string
}

/**
 * 認得單支影片的網址，收斂成標準網址：Reel 留 `/reel/<id>`，watch 頁與粉專的
 * `/videos/<id>` 一律收成 `watch/?v=<id>`。`/reel/`、`/watch/` 首頁沒有特定影片，不算
 */
export function parseFacebookVideoUrl(url: string): { id: string; url: string } | undefined {
  try {
    const parsed = new URL(url)
    if (!FACEBOOK_HOST.test(parsed.hostname)) return undefined
    const reel = parsed.pathname.match(/^\/reel\/(\d+)\/?$/)?.[1]
    if (reel) return { id: reel, url: `https://www.facebook.com/reel/${reel}` }
    const watch = /^\/watch\/?$/.test(parsed.pathname) ? parsed.searchParams.get('v') : null
    const video = (watch && /^\d+$/.test(watch) ? watch : undefined) ??
      parsed.pathname.match(/^\/[^/]+\/videos\/(\d+)\/?$/)?.[1]
    if (video) return { id: video, url: `https://www.facebook.com/watch/?v=${video}` }
    return undefined
  } catch {
    return undefined
  }
}

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined
}

function storyHasVideo(story: JsonObject, videoId: string): boolean {
  const attachments = story.attachments
  return (
    Array.isArray(attachments) &&
    attachments.some((attachment) => object(object(attachment)?.media)?.id === videoId)
  )
}

/**
 * 在頁面 JSON 裡找出掛著這支影片的 story。認影片 id 而不是第一個有 message 的物件：
 * 同一份 JSON 可能預載了下一支 Reel，拿錯就是把別人的說明存進來
 */
export function videoFromScriptJson(json: unknown, videoId: string): FacebookVideo | undefined {
  const stack: unknown[] = [json]
  while (stack.length > 0) {
    const current = stack.pop()
    if (Array.isArray(current)) {
      stack.push(...current)
      continue
    }
    const record = object(current)
    if (!record) continue
    // 影片本身的 attachment 物件也掛著同一個 id，但沒有 message／actors，
    // 要認的是包著它的貼文本體
    if (storyHasVideo(record, videoId) && (record.message || record.actors)) {
      const caption = object(record.message)?.text
      const actor = Array.isArray(record.actors) ? object(record.actors[0]) : undefined
      const time = record.creation_time
      return {
        caption: typeof caption === 'string' ? caption.trim() || undefined : undefined,
        author: typeof actor?.name === 'string' ? actor.name.trim() || undefined : undefined,
        published: typeof time === 'number' ? new Date(time * 1000).toISOString() : undefined,
      }
    }
    // watch 頁的格式不一樣：影片物件自己帶 owner 與 creation_story，說明藏在裡面
    if (record.id === videoId && object(record.creation_story)) {
      const story = record.creation_story
      const caption = findValue(story, (node) => {
        const text = object(node.message)?.text
        return typeof text === 'string' ? text : undefined
      })
      const time = findValue(story, (node) =>
        typeof node.creation_time === 'number' ? node.creation_time : undefined,
      )
      const owner = object(record.owner)?.name
      return {
        caption: caption?.trim() || undefined,
        author: typeof owner === 'string' ? owner.trim() || undefined : undefined,
        published: time !== undefined ? new Date(time * 1000).toISOString() : undefined,
      }
    }
    stack.push(...Object.values(record))
  }
  return undefined
}

/** 深度優先找第一個符合的值，用來在 creation_story 這種層數不固定的結構裡挖東西 */
function findValue<T>(root: unknown, pick: (node: JsonObject) => T | undefined): T | undefined {
  const stack: unknown[] = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (Array.isArray(current)) {
      stack.push(...[...current].reverse())
      continue
    }
    const record = object(current)
    if (!record) continue
    const found = pick(record)
    if (found !== undefined) return found
    stack.push(...Object.values(record).reverse())
  }
  return undefined
}

const EMBED_BLOCKED_NOTE =
  '這支影片無法在筆記裡播放，原因通常是影片用了有版權的音樂或別人的片段，版權方設定不准嵌入'

/**
 * 嵌入頁（plugins/video.php）能播時一定有 <video>；被版權方擋掉時只剩錯誤卡。
 * 錯誤卡的文字跟介面語言走，所以看有沒有 <video>，不比對字串
 */
export function embedBlockedFromHtml(html: string): boolean {
  return !/<video[\s>]/i.test(html)
}

/** 擷取時跟 Facebook 要一次嵌入頁；拿不到就當作不知道，不寫原因，免得誤報 */
export async function isEmbedBlocked(videoUrl: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(videoUrl)}&show_text=false`,
      { credentials: 'omit' },
    )
    if (!response.ok) return false
    return embedBlockedFromHtml(await response.text())
  } catch {
    return false
  }
}

/**
 * 說明是純文字，換行就是作者排的版。逐行保留成硬換行、空行保留成分段；
 * 行首的 `#hashtag` 要跳脫，不然整行會變成 Markdown 標題
 */
export function facebookVideoMarkdown(
  reelUrl: string,
  caption: string | undefined,
  { embedBlocked = false }: { embedBlocked?: boolean } = {},
): string {
  const head = embedBlocked ? `${reelUrl}\n\n> ${EMBED_BLOCKED_NOTE}` : reelUrl
  if (!caption?.trim()) return head
  const body = caption
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/^(\s*)#/, '$1\\#'))
        .join('  \n'),
    )
    .join('\n\n')
  return `${head}\n\n${body}`
}

/** Reel 沒有標題，拿說明第一行；第一行只剩 hashtag 就沒意義，退回作者名 */
export function facebookVideoTitle(caption: string | undefined, author: string | undefined): string {
  const firstLine = caption
    ?.split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  const meaningful = firstLine?.replace(/#\S+/g, '').trim()
  if (firstLine && meaningful) {
    const chars = Array.from(firstLine)
    return chars.length > TITLE_MAX ? chars.slice(0, TITLE_MAX).join('') + '…' : firstLine
  }
  return author ? `${author} 的影片` : 'Facebook 影片'
}

function fromScripts(document: Document, videoId: string): FacebookVideo | undefined {
  for (const script of Array.from(document.querySelectorAll('script[type="application/json"]'))) {
    const source = script.textContent ?? ''
    if (!source.includes(videoId)) continue
    try {
      const reel = videoFromScriptJson(JSON.parse(source), videoId)
      if (reel) return reel
    } catch {
      // 壞掉的 JSON 跳過，換下一份
    }
  }
  return undefined
}

/** 牆上同時掛著好幾張卡片，取最靠近畫面頂端、還在畫面內的那張（就是正在看的） */
function currentOwnerLink(document: Document): HTMLElement | undefined {
  const links = Array.from(
    document.querySelectorAll<HTMLElement>('a[aria-label$="see owner profile"]'),
  )
  const viewport = document.defaultView?.innerHeight ?? Infinity
  const visible = links
    .map((link) => ({ link, top: link.getBoundingClientRect().top }))
    .filter(({ top }) => top >= 0 && top < viewport)
    .sort((a, b) => a.top - b.top)
  return visible[0]?.link ?? links[0]
}

/**
 * 從畫面上的卡片讀。說明預設被截斷成一行加「查看更多」，先點開再讀；
 * 點開只是展開文字，不會觸發任何送出動作
 */
async function fromCard(document: Document): Promise<FacebookVideo | undefined> {
  const owner = currentOwnerLink(document)
  if (!owner) return undefined
  const author = owner.innerText.trim() || owner.getAttribute('aria-label')?.replace(/, see owner profile$/, '')

  // 往上找到同時包住作者與說明的那層
  let card: HTMLElement | null = owner
  for (let depth = 0; card && depth < 20; depth += 1) {
    card = card.parentElement
    const spans = card ? Array.from(card.querySelectorAll('span[dir="auto"]')) : []
    if (spans.some((span) => !owner.contains(span))) break
  }
  if (!card) return { author }

  const more = Array.from(card.querySelectorAll<HTMLElement>('[role="button"]')).find((el) =>
    /^(查看更多|See more)$/.test(el.innerText.trim()),
  )
  if (more) {
    more.click()
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  const caption = Array.from(card.querySelectorAll<HTMLElement>('span[dir="auto"]'))
    .map((span) => span.innerText.trim())
    .filter((text) => text && text !== author)
    .sort((a, b) => b.length - a.length)[0]
  return { author, caption }
}

export async function extractFacebookVideo(document: Document, videoId: string): Promise<FacebookVideo> {
  return fromScripts(document, videoId) ?? (await fromCard(document)) ?? {}
}
