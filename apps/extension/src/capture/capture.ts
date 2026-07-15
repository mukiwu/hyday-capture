/**
 * 擷取管線：抓當前分頁 → content script 用 Defuddle 抽取 → 整理引擎 organize → 落檔。
 * 各入口（工具列、之後的右鍵與快捷鍵）都走這一條，產出一致。
 */
import { organize } from '@hyday-capture/organize-engine'
import { getOutputDirHandle } from '../storage/dirHandle'
import { ensureReadWritePermission, writeNoteToDir, type WriteResult } from '../fs/writeNote'
import { requestExtraction } from '../extract/requestExtraction'
import { noopAI } from '../ai/noopAI'

export type CaptureErrorCode = 'NO_OUTPUT_DIR' | 'PERMISSION_DENIED' | 'NO_ACTIVE_TAB'

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
  const note = await organize({ extracted, ai: noopAI, now })
  return writeNoteToDir(dir, note, now)
}
