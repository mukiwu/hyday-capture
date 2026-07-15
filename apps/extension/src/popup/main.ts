import { captureActiveTab, CaptureError } from '../capture/capture'

const statusEl = document.getElementById('status')!

function setStatus(cls: string, ...nodes: (string | Node)[]): void {
  statusEl.className = cls
  statusEl.replaceChildren(...nodes)
}

function code(text: string): HTMLElement {
  const el = document.createElement('code')
  el.textContent = text
  return el
}

async function run(): Promise<void> {
  try {
    const result = await captureActiveTab()
    const suffix = result.collided ? '（原檔名已存在，改用不重複檔名）' : ''
    setStatus('ok', '已擷取，寫入 ', code(result.filename), suffix)
  } catch (err) {
    if (err instanceof CaptureError && err.code === 'NO_OUTPUT_DIR') {
      const btn = document.createElement('button')
      btn.textContent = '開啟設定頁'
      btn.addEventListener('click', () => chrome.runtime.openOptionsPage())
      setStatus('err', err.message, document.createElement('br'), btn)
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    setStatus('err', `擷取失敗：${message}`)
  }
}

void run()
