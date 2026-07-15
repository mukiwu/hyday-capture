/**
 * 擷取管線的骨架：抓當前分頁 → 產最小筆記 → 寫進輸出資料夾。
 * issue #3 之後這裡會改成呼叫整理引擎，入口保持不變。
 */
import { buildCaptureNote } from '../note/buildNote'
import { getOutputDirHandle } from '../storage/dirHandle'
import { ensureReadWritePermission, writeNoteToDir, type WriteResult } from '../fs/writeNote'

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

export type TabInfo = { title: string; url: string }

async function getActiveTab(): Promise<TabInfo> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !tab.url) {
    throw new CaptureError('NO_ACTIVE_TAB', '找不到可擷取的分頁')
  }
  return { title: tab.title ?? tab.url, url: tab.url }
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

  const { title, url } = await getActiveTab()
  const capturedAt = new Date()
  const note = buildCaptureNote({ title, url, capturedAt })
  return writeNoteToDir(dir, note, capturedAt)
}
