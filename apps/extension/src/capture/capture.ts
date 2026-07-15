/**
 * 擷取管線：抓當前分頁 → content script 用 Defuddle 抽取 → 整理引擎 organize → 落檔。
 * 各入口（工具列、之後的右鍵與快捷鍵）都走這一條，產出一致。
 */
import { organize, type ExtractedContent } from '@hyday-capture/organize-engine'
import { getOutputDirHandle } from '../storage/dirHandle'
import { ensureReadWritePermission, writeNoteToDir, type WriteResult } from '../fs/writeNote'
import { requestExtraction } from '../extract/requestExtraction'
import { noopAI } from '../ai/noopAI'
import { scanTagVocabulary } from '../tags/scanVocabulary'

export type CaptureErrorCode =
  | 'NO_OUTPUT_DIR'
  | 'PERMISSION_DENIED'
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

/** 擷取當前分頁並落檔，回傳最終寫入的檔名 */
export async function captureActiveTab(): Promise<WriteResult> {
  const dir = await getOutputDirHandle()
  if (!dir) {
    throw new CaptureError('NO_OUTPUT_DIR', '尚未選擇輸出資料夾，請先到設定頁選一個')
  }
  if (!(await ensureReadWritePermission(dir))) {
    throw new CaptureError('PERMISSION_DENIED', '沒有取得寫入資料夾的權限')
  }

  const tab = await getActiveTab()
  const extracted = await requestExtraction(tab.id)
  const now = new Date()
  // issue #6：掃輸出資料夾既有標籤詞彙，餵給引擎的錨定式下標；掃描失敗不擋擷取
  const tagVocabulary = await scanTagVocabulary(dir).catch(() => [] as string[])
  const note = await organize({ extracted, ai: noopAI, now, tagVocabulary })
  return writeNoteToDir(dir, note, now)
}

// ── issue #7：右鍵選單、快捷鍵等在 background service worker 觸發的入口 ──
// SW 沒有 document，不能呼叫 File System Access 的 requestPermission（需要手勢 + document）。
// 策略：只 queryPermission，已 granted 就直接在 SW 走完整條管線落檔；
// 還沒授權則丟 PERMISSION_PROMPT_REQUIRED，交由 background 把使用者帶去設定頁重新授權。
// 落檔與整理沿用上面工具列入口的同一組函式（requestExtraction / organize / writeNoteToDir），產出一致。

export type CaptureOptions = {
  /** 目標分頁 id；省略則自動抓當前 active 分頁 */
  tabId?: number
  /** 只擷取使用者在頁面上選取的內容，而非整頁 */
  selectionOnly?: boolean
  /** 右鍵點連結時的目標連結；提供時改為另開背景分頁擷取該連結，而非當前頁 */
  linkUrl?: string
}

/** 取回輸出資料夾，並在「不請求權限」的前提下確認已有寫入權（SW 專用） */
async function resolveOutputDirWithoutPrompt(): Promise<FileSystemDirectoryHandle> {
  const dir = await getOutputDirHandle()
  if (!dir) {
    throw new CaptureError('NO_OUTPUT_DIR', '尚未選擇輸出資料夾，請先到設定頁選一個')
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

/** 擷取指定（或當前）分頁，可只取選取內容 */
async function extractFromTab(
  tabId: number | undefined,
  selectionOnly: boolean,
): Promise<ExtractedContent> {
  const id = tabId ?? (await getActiveTab()).id
  return requestExtraction(id, { selectionOnly })
}

/**
 * 背景入口（右鍵、快捷鍵）的擷取管線。與工具列入口共用整理與落檔，
 * 差別只在權限採「只查不請求」，且支援擷取選取內容或連結。
 */
export async function captureFromBackground(opts: CaptureOptions): Promise<WriteResult> {
  // 先確認資料夾與權限，沒過就別白開背景分頁
  const dir = await resolveOutputDirWithoutPrompt()

  const extracted = opts.linkUrl
    ? await extractFromLink(opts.linkUrl)
    : await extractFromTab(opts.tabId, Boolean(opts.selectionOnly))

  const now = new Date()
  const note = await organize({ extracted, ai: noopAI, now })
  return writeNoteToDir(dir, note, now)
}

/** background 判斷這個錯誤是否該把使用者帶去有手勢的設定頁（而非單純報錯） */
export function needsDocumentGesture(err: unknown): boolean {
  return (
    err instanceof CaptureError &&
    (err.code === 'NO_OUTPUT_DIR' || err.code === 'PERMISSION_PROMPT_REQUIRED')
  )
}
