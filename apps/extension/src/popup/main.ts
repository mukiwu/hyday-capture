/**
 * 工具列 popup：開啟即自動擷取當前分頁（一鍵動線）。
 *
 * 唯一的例外是寫入權限還沒到手的時候。File System Access 的 requestPermission 需要
 * user activation，而 popup 開場的自動執行沒有 activation（重載擴充或瀏覽器重啟後，
 * 資料夾權限會被重設成 prompt，就會走到這條），所以那時改成顯示一顆按鈕，
 * 由使用者點擊帶出 activation，授權完成後接著擷取。
 */
import {
  captureActiveTab,
  getVaultDir,
  hasWritePermission,
  requestWritePermission,
  CaptureError,
} from '../capture/capture'
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
    const suffix = result.collided ? '（原檔名已存在，改用不重複檔名）' : ''
    setStatus('ok', '已擷取，寫入 ', code(result.filename), suffix)
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

async function run(): Promise<void> {
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
