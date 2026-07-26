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
}

export type FetchImageResponse =
  | { ok: true; base64: string; contentType: string | null }
  | { ok: false; error: string }

export type ImageBytes = {
  bytes: Uint8Array
  contentType: string | undefined
}

/** 落檔流程只認這個形狀，兩個環境各自注入自己那條路 */
export type ImageFetcher = (url: string) => Promise<ImageBytes>

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

async function readImage(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`圖片下載失敗 ${res.status}`)
  const buffer = await res.arrayBuffer()
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`圖片超過 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB 上限，略過`)
  }
  return { bytes: new Uint8Array(buffer), contentType: res.headers.get('content-type') }
}

/** service worker 端：直接下載 */
export const fetchImageDirect: ImageFetcher = async (url) => {
  const { bytes, contentType } = await readImage(url)
  return { bytes, contentType: contentType ?? undefined }
}

/** popup 端：請 service worker 代發 */
export const fetchImageViaWorker: ImageFetcher = async (url) => {
  const request: FetchImageRequest = { type: FETCH_IMAGE_MESSAGE, url }
  const result = (await chrome.runtime.sendMessage(request)) as FetchImageResponse | undefined
  if (!result) throw new Error('圖片下載沒有回應（service worker 可能已休眠）')
  if (!result.ok) throw new Error(result.error)
  return { bytes: fromBase64(result.base64), contentType: result.contentType ?? undefined }
}

/** service worker 的訊息處理：回 base64 給呼叫端 */
export async function handleFetchImageMessage(url: string): Promise<FetchImageResponse> {
  try {
    const { bytes, contentType } = await readImage(url)
    return { ok: true, base64: toBase64(bytes), contentType }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
