/**
 * 擷取管線：抓分頁 → content script 用 Defuddle 抽取 → 排成原料檔 → 落檔到 clippings。
 *
 * 各入口（工具列 popup、右鍵、快捷鍵、選取）都走 buildRawClipping，產出一致。
 * 這裡刻意不做整理：模板、概念標籤與 AI 都移交 hyday app 端（見 ADR 0002 改寫版），
 * 所以管線裡沒有 loadTemplates／scanTagVocabulary／requestSelectors，那些模組留在
 * repo 等 app 端接手時搬運。
 */
import { buildRawClipping, type ExtractedContent } from '@hyday-capture/organize-engine'
import { getVaultDirHandle } from '../storage/dirHandle'
import {
  ensureReadWritePermission,
  writeClippingToVault,
  type WriteResult,
} from '../fs/writeNote'
import { requestExtraction } from '../extract/requestExtraction'
import { localizeImages } from './localizeImages'
import { fetchImageDirect, type ImageFetcher } from '../net/imageFetch'

export type CaptureErrorCode =
  | 'NO_OUTPUT_DIR'
  | 'NO_ACTIVE_TAB'
  // 背景入口（右鍵、快捷鍵）專用：SW 沒有 document，不能 requestPermission，
  // 權限還沒 granted 時用這個 code 讓呼叫端把使用者帶去有手勢的頁面重新授權
  | 'PERMISSION_PROMPT_REQUIRED'
  // 右鍵擷取連結時，另開的背景分頁載入逾時
  | 'LINK_LOAD_TIMEOUT'

export class CaptureError extends Error {
  constructor(
    public code: CaptureErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'CaptureError'
  }
}

async function getActiveTab(): Promise<{ id: number; url: string }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || tab.id === undefined || !tab.url) {
    throw new CaptureError('NO_ACTIVE_TAB', '找不到可擷取的分頁')
  }
  return { id: tab.id, url: tab.url }
}

/** 取回已選的 vault 資料夾 handle，沒選過就丟 NO_OUTPUT_DIR */
export async function getVaultDir(): Promise<FileSystemDirectoryHandle> {
  const dir = await getVaultDirHandle()
  if (!dir) {
    throw new CaptureError('NO_OUTPUT_DIR', '尚未選擇 hyday vault 資料夾，請先到設定頁選一個')
  }
  return dir
}

/** 只查不請求，判斷現在能不能直接寫 */
export async function hasWritePermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  return (await dir.queryPermission({ mode: 'readwrite' })) === 'granted'
}

/**
 * 請求寫入權限。**必須在使用者的點擊 handler 裡呼叫，而且要是該 handler 的第一個 await**：
 * File System Access 的 requestPermission 需要 user activation，而 activation 是短暫的、
 * 前面先 await 別的東西就會過期。popup 一開啟就自動擷取的時機點沒有 activation，
 * 直接呼叫會拿到 `User activation is required to request permissions`
 * （2026-07-26 踩過：重載擴充會把資料夾權限重設成 prompt，於是每次開 popup 都失敗）
 */
export async function requestWritePermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  return ensureReadWritePermission(dir)
}

/**
 * 工具列入口：擷取當前分頁並落檔，回傳最終寫入的檔名。
 * 呼叫端要先確認 hasWritePermission，這支不請求權限（理由見 requestWritePermission）。
 *
 * @param fetchImage 圖片下載的實作。popup 走 SW 代發、SW 自己直接下載，見 net/imageFetch
 */
export async function captureActiveTab(
  dir: FileSystemDirectoryHandle,
  fetchImage: ImageFetcher,
  userNote?: string,
): Promise<WriteResult> {
  const tab = await getActiveTab()
  // 於擷取起點取時間，與背景入口一致（createdAt 反映擷取當下，不受抽取耗時影響）
  const now = new Date()
  const extracted = await requestExtraction(tab.id)
  return writeClipping(dir, extracted, now, false, fetchImage, userNote)
}

/** 兩條入口共用的收尾：圖片本機化、排成原料檔、落檔 */
async function writeClipping(
  dir: FileSystemDirectoryHandle,
  extracted: ExtractedContent,
  now: Date,
  selectionOnly: boolean,
  fetchImage: ImageFetcher,
  userNote?: string,
): Promise<WriteResult> {
  const localized = await localizeImages(extracted.contentMarkdown, dir, fetchImage)
  const clipping = buildRawClipping({
    extracted: { ...extracted, contentMarkdown: localized.markdown },
    now,
    selectionOnly,
    userNote,
  })
  return writeClippingToVault(dir, clipping, now)
}

// ── issue #7：右鍵選單、快捷鍵等在 background service worker 觸發的入口 ──
// SW 沒有 document，不能呼叫 File System Access 的 requestPermission（需要手勢 + document）。
// 策略：只 queryPermission，已 granted 就直接在 SW 走完整條管線落檔；
// 還沒授權則丟 PERMISSION_PROMPT_REQUIRED，交由 background 把使用者帶去設定頁重新授權。
// 原料檔與落檔沿用 buildRawClipping / writeClippingToVault，與工具列入口產出一致。

export type CaptureOptions = {
  /** 目標分頁 id；省略則自動抓當前 active 分頁 */
  tabId?: number
  /** 只擷取使用者在頁面上選取的內容，而非整頁 */
  selectionOnly?: boolean
  /** 使用者擷取當下的選填隨手一句話 */
  userNote?: string
  /** 右鍵點連結時的目標連結；提供時改為另開背景分頁擷取該連結，而非當前頁 */
  linkUrl?: string
}

/** 取回 hyday vault，並在「不請求權限」的前提下確認已有寫入權（SW 專用） */
async function resolveVaultDirWithoutPrompt(): Promise<FileSystemDirectoryHandle> {
  const dir = await getVaultDirHandle()
  if (!dir) {
    throw new CaptureError('NO_OUTPUT_DIR', '尚未選擇 hyday vault 資料夾，請先到設定頁選一個')
  }
  if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    throw new CaptureError(
      'PERMISSION_PROMPT_REQUIRED',
      '需要在設定頁重新授權寫入權限後再擷取',
    )
  }
  return dir
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 等背景分頁載入完成（content script 在 document_idle 注入，約在 complete 前後就緒） */
function waitForTabComplete(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new CaptureError('LINK_LOAD_TIMEOUT', '連結載入逾時，無法擷取'))
    }, timeoutMs)
    const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo): void => {
      if (id === tabId && info.status === 'complete') {
        cleanup()
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated)
    // 監聽器掛上前可能已經 complete，補查一次避免漏接
    void chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') {
        cleanup()
        resolve()
      }
    })
  })
}

/** content script 剛注入時可能還沒掛好 listener，重試幾次補過 race */
async function requestExtractionWithRetry(
  tabId: number,
  opts?: { selectionOnly?: boolean },
  attempts = 3,
): Promise<ExtractedContent> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await requestExtraction(tabId, opts)
    } catch (err) {
      lastErr = err
      await delay(400)
    }
  }
  throw lastErr
}

/** 右鍵點連結：另開一個背景分頁載入該連結，擷取它的正文後把分頁關掉 */
async function extractFromLink(linkUrl: string): Promise<ExtractedContent> {
  const tab = await chrome.tabs.create({ url: linkUrl, active: false })
  const tabId = tab.id
  if (tabId === undefined) {
    throw new CaptureError('NO_ACTIVE_TAB', '無法開啟連結分頁')
  }
  try {
    await waitForTabComplete(tabId)
    return await requestExtractionWithRetry(tabId)
  } finally {
    await chrome.tabs.remove(tabId).catch(() => undefined)
  }
}

/**
 * 背景入口（右鍵、快捷鍵）的擷取管線。與工具列入口共用原料檔與落檔，
 * 差別只在權限採「只查不請求」，且支援擷取選取內容或連結。
 */
export async function captureFromBackground(opts: CaptureOptions): Promise<WriteResult> {
  // 先確認資料夾與權限，沒過就別白開背景分頁
  const dir = await resolveVaultDirWithoutPrompt()
  const now = new Date()

  if (opts.linkUrl) {
    // 連結擷取是整頁擷取（使用者選的是連結不是段落）
    const extracted = await extractFromLink(opts.linkUrl)
    return writeClipping(dir, extracted, now, false, fetchImageDirect, opts.userNote)
  }

  const selectionOnly = Boolean(opts.selectionOnly)
  const tabId = opts.tabId ?? (await getActiveTab()).id
  const extracted = await requestExtraction(tabId, { selectionOnly })
  return writeClipping(dir, extracted, now, selectionOnly, fetchImageDirect, opts.userNote)
}

/** background 判斷這個錯誤是否該把使用者帶去有手勢的設定頁（而非單純報錯） */
export function needsDocumentGesture(err: unknown): boolean {
  return (
    err instanceof CaptureError &&
    (err.code === 'NO_OUTPUT_DIR' || err.code === 'PERMISSION_PROMPT_REQUIRED')
  )
}
