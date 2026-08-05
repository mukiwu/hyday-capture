/**
 * feed 型網站的內容邊界偵測。
 *
 * 問題：FB、Threads、Reddit 這類站的永久連結頁，DOM 裡同時有目標貼文與整片動態消息，
 * 抽取器的內容評分很容易挑錯區塊。FB 實測抓到的是「建立貼文、限時動態、別人的貼文」
 * 那一整片，目標貼文本體完全不在裡面（2026-07-26）。
 *
 * 通用訊號：貼文的時間戳是一個指向它自己永久連結的連結，而我們正站在那個永久連結上。
 * 所以「頁面上指向當前網址的連結」就標出了目標貼文的位置，從它往上找貼文容器即可。
 * 這個訊號跟站台無關，不用維護名單。
 *
 * 安全網有兩層：這裡找不到可信的容器就回 null，呼叫端照原本的行為走；
 * 就算標錯了容器，boundaryFallback 會在抽出空內容時退回原生抽取。
 * 兩層合起來才守得住「最壞情況是沒變好，不會變差」。
 */

/** 貼文容器的語意標記，HTML5 的 article 與 ARIA 的 role=article */
const POST_CONTAINER = 'article, [role="article"]'
/** 標給抽取器的臨時屬性，抽完就拿掉 */
const MARK_ATTR = 'data-hyday-content'
/** 容器至少要有這麼多字才算貼文，否則多半是導覽或工具列 */
const MIN_POST_TEXT = 120
/** 沒有語意容器時往上找的層數上限 */
const MAX_CLIMB = 8
/** 容器佔整頁文字的比例上限，超過就是挑到整片 feed 了 */
const MAX_BODY_RATIO = 0.6

/**
 * 這個 href 是不是指向「當前這一頁」。只比對 origin 與 pathname：
 * 貼文的時間戳連結常常帶一堆追蹤參數（FB 的 __cft__ 之類），查詢字串不能算差異。
 * 純錨點（#foo）與空 href 不算；帶 fragment 的同路徑連結（/文章/#respond 這種
 * WordPress 留言區連結）是頁內跳轉，也不算——feed 型網站的時間戳永久連結不帶 fragment。
 */
export function isSelfPermalink(href: string | null, pageUrl: string): boolean {
  if (!href) return false
  const raw = href.trim()
  if (raw === '' || raw.startsWith('#')) return false
  try {
    const target = new URL(raw, pageUrl)
    const page = new URL(pageUrl)
    if (target.origin !== page.origin) return false
    if (target.hash) return false
    const strip = (p: string) => p.replace(/\/+$/, '')
    return strip(target.pathname) === strip(page.pathname)
  } catch {
    return false
  }
}

function textLength(el: Element): number {
  return (el.textContent ?? '').trim().length
}

/**
 * 從指向本頁的連結往上找貼文容器。優先語意容器（article／role=article），
 * 沒有的話往上爬到字數夠的第一層，並擋掉大到等於整片 feed 的容器
 */
function containerFor(anchor: Element, bodyTextLength: number): Element | null {
  const semantic = anchor.closest(POST_CONTAINER)
  if (semantic && textLength(semantic) >= MIN_POST_TEXT) {
    return textLength(semantic) <= bodyTextLength * MAX_BODY_RATIO ? semantic : null
  }

  let cursor: Element | null = anchor.parentElement
  for (let i = 0; cursor && i < MAX_CLIMB; i++, cursor = cursor.parentElement) {
    if (cursor.tagName === 'BODY' || cursor.tagName === 'MAIN') break
    const len = textLength(cursor)
    if (len < MIN_POST_TEXT) continue
    return len <= bodyTextLength * MAX_BODY_RATIO ? cursor : null
  }
  return null
}

export type PostBoundary = {
  /** 傳給抽取器的 contentSelector，沒偵測到就是 undefined */
  selector: string | undefined
  restore: () => void
}

/**
 * 偵測並標記目標貼文的容器。回傳要給抽取器的 selector 與還原函式。
 * 呼叫端務必在抽取結束後（含失敗時）呼叫還原。
 */
export function markPostBoundary(doc: Document = document, pageUrl = location.href): PostBoundary {
  const noop = { selector: undefined, restore: () => {} }
  try {
    const anchors = Array.from(doc.body.querySelectorAll('a[href]')).filter((a) =>
      isSelfPermalink(a.getAttribute('href'), pageUrl),
    )
    if (anchors.length === 0) return noop

    const bodyTextLength = textLength(doc.body)
    const candidates = new Set<Element>()
    for (const anchor of anchors) {
      const container = containerFor(anchor, bodyTextLength)
      if (container) candidates.add(container)
    }
    if (candidates.size === 0) return noop

    // 多個候選時取字最多的那個，通常就是貼文本體而不是它的某個子區塊
    const best = [...candidates].sort((a, b) => textLength(b) - textLength(a))[0]
    if (!best) return noop

    best.setAttribute(MARK_ATTR, '')
    return {
      selector: `[${MARK_ATTR}]`,
      restore: () => best.removeAttribute(MARK_ATTR),
    }
  } catch (err) {
    console.warn('[hyday-capture] 內容邊界偵測失敗，照原本的抽取走', err)
    return noop
  }
}
