/**
 * 圖片下載。兩個執行環境各有一條路，形狀統一成 ImageFetcher 交給落檔流程。
 *
 * - service worker（右鍵、快捷鍵入口）：帶著 host_permissions 直接 fetch，不受 CORS 限制
 * - popup：content script 與 popup 直接跨網域 fetch 會被目標站的 CORS 擋掉（圖片 CDN
 *   多半不送 Access-Control-Allow-Origin，因為 <img> 本來不需要），所以繞去 SW 代發
 *
 * 訊息通道只能帶 JSON，所以位元組用 base64 過橋。
 */

export const FETCH_IMAGE_MESSAGE = 'HYDAY_FETCH_IMAGE'

/** 單張圖的大小上限，避免一張大圖把 vault 撐大或把訊息通道塞爆 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export type FetchImageRequest = {
  type: typeof FETCH_IMAGE_MESSAGE
  url: string
  /** 原文章網址；只取 origin 當 Referer，供有防盜連的圖片 CDN 驗證來源站。 */
  sourceUrl?: string
}

export type FetchImageResponse =
  | { ok: true; base64: string; contentType: string | null }
  | { ok: false; error: string }

export type ImageBytes = {
  bytes: Uint8Array
  contentType: string | undefined
}

/** 落檔流程只認這個形狀，兩個環境各自注入自己那條路 */
export type ImageFetcher = (url: string, sourceUrl?: string) => Promise<ImageBytes>

// Session rule 只活到瀏覽器關閉或擴充更新；每張圖各用一個 id，避免兩個入口同時擷取時
// 互相拆掉對方的規則。實際規則仍會在單張下載完成後立刻移除。
let nextReferrerRuleId = 40_000

function sourceOrigin(sourceUrl: string | undefined): string | undefined {
  if (!sourceUrl) return undefined
  try {
    const parsed = new URL(sourceUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    return `${parsed.origin}/`
  } catch {
    return undefined
  }
}

function exactUrlRegex(url: string): string {
  const canonical = new URL(url).href
  return `^${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

/**
 * 有些 CDN（少數派實測）會拒絕 extension-origin 的裸 fetch，但接受來源網站的 Referer。
 * Fetch API 不允許程式直接設定 Referer，所以用 Chrome 官方的 session DNR rule，只套在：
 * 本 extension 發起、沒有 tab 的 service worker XHR、而且 URL 完全相等的這一個請求。
 */
async function withSourceReferrer<T>(
  url: string,
  sourceUrl: string | undefined,
  request: () => Promise<T>,
): Promise<T> {
  const referer = sourceOrigin(sourceUrl)
  const dnr = chrome.declarativeNetRequest
  if (!referer || !dnr?.updateSessionRules) return request()

  const ruleId = nextReferrerRuleId++
  const rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        {
          header: 'Referer',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: referer,
        },
      ],
    },
    condition: {
      regexFilter: exactUrlRegex(url),
      initiatorDomains: [chrome.runtime.id],
      resourceTypes: [
        'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType,
      ],
      tabIds: [chrome.tabs.TAB_ID_NONE],
    },
  } satisfies chrome.declarativeNetRequest.Rule

  try {
    await dnr.updateSessionRules({ removeRuleIds: [ruleId], addRules: [rule] })
  } catch (err) {
    // 規則建不起來時仍試原本的裸 fetch；沒有防盜連的網站不該跟著壞掉。
    console.warn('[hyday-capture] 無法替圖片請求帶來源頁，改用一般下載', err)
    return request()
  }

  try {
    return await request()
  } finally {
    try {
      await dnr.updateSessionRules({ removeRuleIds: [ruleId] })
    } catch (err) {
      // 規則已嚴格鎖定單一 URL 與本 extension；清理失敗不該把已下載的圖片判成失敗。
      console.warn('[hyday-capture] 圖片來源頁暫時規則清理失敗', err)
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  // 分段組字串，一次丟幾百 KB 進 String.fromCharCode 會爆 call stack
  const CHUNK = 0x8000
  let out = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(out)
}

function fromBase64(base64: string): Uint8Array {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * 這個狀態碼是不是「你沒登入」而不是「這張圖不存在」。
 * 只有這兩種才值得帶登入態重試；404、500 再要一次也是一樣的結果。
 */
export function needsCredentialedRetry(status: number): boolean {
  return status === 401 || status === 403
}

async function readImage(
  url: string,
  sourceUrl?: string,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  return withSourceReferrer(url, sourceUrl, async () => {
    // 先匿名要一次。多數站台這樣就給，也不必無謂地把登入態送出去
    let res = await fetch(url)
    if (needsCredentialedRetry(res.status)) {
      // 圖片鎖在登入態後面時，帶上使用者在該站既有的 cookie 再試一次。
      // Notion 實案（2026-09-06）：app.notion.com/image/ 匿名回 401
      // {"name":"UnauthorizedError"}，而使用者本人在瀏覽器裡是看得到那張圖的
      res = await fetch(url, { credentials: 'include' })
    }
    if (!res.ok) throw new Error(`圖片下載失敗 ${res.status}`)
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`圖片超過 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB 上限，略過`)
    }
    return { bytes: new Uint8Array(buffer), contentType: res.headers.get('content-type') }
  })
}

/** service worker 端：直接下載 */
export const fetchImageDirect: ImageFetcher = async (url, sourceUrl) => {
  const { bytes, contentType } = await readImage(url, sourceUrl)
  return { bytes, contentType: contentType ?? undefined }
}

/** popup 端：請 service worker 代發 */
export const fetchImageViaWorker: ImageFetcher = async (url, sourceUrl) => {
  const request: FetchImageRequest = { type: FETCH_IMAGE_MESSAGE, url, sourceUrl }
  const result = (await chrome.runtime.sendMessage(request)) as FetchImageResponse | undefined
  if (!result) throw new Error('圖片下載沒有回應（service worker 可能已休眠）')
  if (!result.ok) throw new Error(result.error)
  return { bytes: fromBase64(result.base64), contentType: result.contentType ?? undefined }
}

/** service worker 的訊息處理：回 base64 給呼叫端 */
export async function handleFetchImageMessage(
  url: string,
  sourceUrl?: string,
): Promise<FetchImageResponse> {
  try {
    const { bytes, contentType } = await readImage(url, sourceUrl)
    return { ok: true, base64: toBase64(bytes), contentType }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
