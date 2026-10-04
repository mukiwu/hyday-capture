/**
 * 工具列 popup：開啟即自動擷取當前分頁（一鍵動線）。
 *
 * 唯一的例外是寫入權限還沒到手的時候。File System Access 的 requestPermission 需要
 * user activation，而 popup 開場的自動執行沒有 activation（重載擴充或瀏覽器重啟後，
 * 資料夾權限會被重設成 prompt，就會走到這條），所以那時改成顯示一顆按鈕，
 * 由使用者點擊帶出 activation，授權完成後接著擷取。
 *
 * 右鍵、快捷鍵這些背景入口也借這個 popup 回報：background 開 popup 前會先在
 * storage.session 寫下擷取狀態，popup 讀到就只顯示那份狀態，不自己再擷取。
 */
import {
  captureActiveTab,
  getVaultDir,
  hasWritePermission,
  requestWritePermission,
  CaptureError,
} from '../capture/capture'
import {
  BACKGROUND_STATUS_KEY,
  pickBackgroundStatus,
  type BackgroundCaptureStatus,
} from '../capture/backgroundStatus'
import { ExtractionError } from '../extract/requestExtraction'
import { fetchImageViaWorker } from '../net/imageFetch'

const statusEl = document.getElementById('status')!
let activeCapture: AbortController | undefined
let popupClosed = false

function setStatus(cls: string, ...nodes: (string | Node)[]): void {
  statusEl.className = cls
  statusEl.replaceChildren(...nodes)
}

function code(text: string): HTMLElement {
  const el = document.createElement('code')
  el.textContent = text
  return el
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.textContent = label
  el.addEventListener('click', onClick)
  return el
}

function reportError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  setStatus('err', `擷取失敗：${message}`)
}

function reportSaved(filename: string, collided: boolean, skippedImages: number): void {
  const suffix = collided ? '（原檔名已存在，改用不重複檔名）' : ''
  if (skippedImages > 0) {
    setStatus(
      'warn',
      '已擷取，寫入 ',
      code(filename),
      suffix,
      document.createElement('br'),
      `${skippedImages} 張圖片未能保存，已保留原網址`,
    )
  } else {
    setStatus('ok', '已擷取，寫入 ', code(filename), suffix)
  }
}

async function capture(dir: FileSystemDirectoryHandle): Promise<void> {
  if (popupClosed) return
  const controller = new AbortController()
  activeCapture = controller
  setStatus(
    'muted',
    '擷取中…',
    document.createElement('br'),
    button('停止擷取', () => controller.abort()),
  )
  try {
    const result = await captureActiveTab(dir, fetchImageViaWorker, undefined, controller.signal)
    reportSaved(result.filename, result.collided, result.images.skipped)
  } catch (err) {
    if (
      (err instanceof ExtractionError && err.code === 'EXTRACT_CANCELLED') ||
      (err instanceof DOMException && err.name === 'AbortError')
    ) {
      setStatus('muted', '已停止擷取')
      return
    }
    reportError(err)
  } finally {
    if (activeCapture === controller) activeCapture = undefined
  }
}

// Chrome action popup 失去焦點時會觸發 pagehide。不要讓切換分頁後的舊擷取繼續掛著，
// 重新開 popup 時也不會把上一個 pending request 誤認成目前這次擷取。
window.addEventListener('pagehide', () => {
  popupClosed = true
  activeCapture?.abort()
})

/** 權限未到手時的修復動線。requestWritePermission 必須是點擊 handler 的第一個 await */
function askPermission(dir: FileSystemDirectoryHandle): void {
  setStatus(
    'muted',
    '需要你允許寫入 Hyday Vault 資料夾（重載擴充或重開瀏覽器後會需要再允許一次）',
    document.createElement('br'),
    button('允許寫入並擷取', () => {
      void requestWritePermission(dir).then((granted) => {
        if (granted) return capture(dir)
        setStatus('err', '沒有取得寫入權限，擷取取消')
      })
    }),
  )
}

function showBackgroundStatus(status: BackgroundCaptureStatus): void {
  if (status.state === 'running') {
    setStatus('muted', '擷取中…')
    return
  }
  if (status.state === 'done') {
    reportSaved(status.filename, status.collided, status.skippedImages)
  } else {
    setStatus('err', `擷取失敗：${status.message}`)
  }
  // 結果已經看到了，清掉才不會讓下次點工具列只顯示舊結果
  void chrome.storage.session.remove(BACKGROUND_STATUS_KEY)
}

/** 有背景擷取正在進行或剛結束就顯示它並回 true，popup 不再自己擷取 */
async function followBackgroundCapture(): Promise<boolean> {
  const stored = await chrome.storage.session.get(BACKGROUND_STATUS_KEY)
  const status = pickBackgroundStatus(
    stored[BACKGROUND_STATUS_KEY] as BackgroundCaptureStatus | undefined,
    Date.now(),
  )
  if (!status) return false
  showBackgroundStatus(status)
  if (status.state === 'running') {
    chrome.storage.session.onChanged.addListener((changes) => {
      const next = changes[BACKGROUND_STATUS_KEY]?.newValue as BackgroundCaptureStatus | undefined
      if (next) showBackgroundStatus(next)
    })
  }
  return true
}

async function run(): Promise<void> {
  if (await followBackgroundCapture()) return

  let dir: FileSystemDirectoryHandle
  try {
    dir = await getVaultDir()
  } catch (err) {
    if (err instanceof CaptureError && err.code === 'NO_OUTPUT_DIR') {
      setStatus(
        'err',
        err.message,
        document.createElement('br'),
        button('開啟設定頁', () => chrome.runtime.openOptionsPage()),
      )
      return
    }
    reportError(err)
    return
  }

  if (await hasWritePermission(dir)) {
    if (popupClosed) return
    await capture(dir)
    return
  }
  askPermission(dir)
}

void run()
