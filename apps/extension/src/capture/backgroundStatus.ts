/**
 * 背景入口（右鍵、快捷鍵）擷取的狀態，存在 chrome.storage.session 交給 popup 顯示。
 *
 * 背景入口沒有自己的畫面，擷取開始時 background 打開工具列 popup，popup 讀到這份狀態
 * 就顯示背景擷取的進度與結果，而不是自己再擷取一次當前分頁。
 */

export const BACKGROUND_STATUS_KEY = 'backgroundCaptureStatus'

export type BackgroundCaptureStatus = { at: number } & (
  | { state: 'running' }
  | { state: 'done'; filename: string; collided: boolean; skippedImages: number }
  | { state: 'error'; message: string }
)

// 完成的結果只在剛結束時有意義，過了就該讓工具列 popup 回到一鍵擷取
const FINISHED_TTL_MS = 15_000
// 進行中的狀態若一直沒更新，多半是 service worker 中途被收掉，不能永遠擋住 popup
const RUNNING_TTL_MS = 3 * 60_000

/** popup 開啟時判斷要不要顯示背景擷取狀態；回 undefined 表示照常自己擷取 */
export function pickBackgroundStatus(
  status: BackgroundCaptureStatus | undefined,
  now: number,
): BackgroundCaptureStatus | undefined {
  if (!status) return undefined
  const ttl = status.state === 'running' ? RUNNING_TTL_MS : FINISHED_TTL_MS
  return now - status.at <= ttl ? status : undefined
}
