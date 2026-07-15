import {
  getOutputDirHandle,
  saveOutputDirHandle,
} from '../storage/dirHandle'
import { ensureReadWritePermission } from '../fs/writeNote'

const pickBtn = document.getElementById('pick') as HTMLButtonElement
const currentEl = document.getElementById('current')!

function setCurrent(cls: string, ...nodes: (string | Node)[]): void {
  currentEl.className = cls
  currentEl.replaceChildren(...nodes)
}

function code(text: string): HTMLElement {
  const el = document.createElement('code')
  el.textContent = text
  return el
}

async function showCurrent(): Promise<void> {
  const handle = await getOutputDirHandle()
  if (!handle) {
    setCurrent('muted', '尚未選擇資料夾')
    return
  }
  const granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  setCurrent(
    granted ? 'ok' : 'muted',
    '目前輸出資料夾：',
    code(handle.name),
    granted ? '' : '（下次擷取時會再請求寫入權限）',
  )
}

async function pickFolder(): Promise<void> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await ensureReadWritePermission(handle)
    await saveOutputDirHandle(handle)
    await showCurrent()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return // 使用者取消
    setCurrent('err', `選擇資料夾失敗：${err instanceof Error ? err.message : String(err)}`)
  }
}

pickBtn.addEventListener('click', () => {
  void pickFolder()
})
void showCurrent()
