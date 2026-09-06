import {
  getVaultDirHandle,
  saveVaultDirHandle,
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
  const handle = await getVaultDirHandle()
  if (!handle) {
    setCurrent('muted', '尚未設定 Hyday Vault 資料夾')
    return
  }
  const granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  if (granted) {
    setCurrent('ok', '目前 Hyday Vault：', code(handle.name))
    return
  }

  // 資料夾還在，但寫入權限失效了（例如瀏覽器重啟或擴充更新後）。
  // 右鍵、快捷鍵這些背景入口無法自行請求權限，會把使用者帶來這裡，
  // 提供一顆有手勢的按鈕就地重新授權，不用整個資料夾重選一次。
  const reauth = document.createElement('button')
  reauth.textContent = '重新授權寫入權限'
  reauth.addEventListener('click', () => {
    // requestPermission 必須是點擊後的第一個 await，同 popup/main.ts 立下的規則：
    // File System Access 的權限請求吃 transient activation，前面多一個 queryPermission 的
    // IPC 來回就可能把 activation 用掉，Chrome 會直接不彈對話框、回 prompt 或拋錯。
    // 這裡順手把 Chrome 的實際回應顯示出來，之前 catch 吞掉錯誤，使用者只看到「沒反應」
    const activeAtClick = (navigator as Navigator & { userActivation?: { isActive: boolean } })
      .userActivation?.isActive
    void (async () => {
      try {
        const state = await handle.requestPermission({ mode: 'readwrite' })
        console.info('[hyday-capture] 重新授權', { activeAtClick, state })
        if (state === 'granted') await showCurrent()
        else {
          setCurrent(
            'err',
            `未取得寫入權限（Chrome 回應：${state}），請再試一次；若仍無法授權，請嘗試下方重新選擇資料夾。`,
          )
        }
      } catch (err) {
        console.error('[hyday-capture] 重新授權失敗', { activeAtClick, err })
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
        setCurrent(
          'err',
          `未取得寫入權限（${detail}），請再試一次；若仍無法授權，請嘗試下方重新選擇資料夾。`,
        )
      }
    })()
  })
  setCurrent(
    'muted',
    '目前 Hyday Vault：',
    code(handle.name),
    ' (尚未取得寫入權限)',
    document.createElement('br'),
    reauth,
  )
}

async function pickFolder(): Promise<void> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    const granted = await ensureReadWritePermission(handle)
    if (!granted) {
      // 沒拿到寫入權就存 handle，之後每次擷取都會失敗，使用者卻以為設好了
      setCurrent(
        'err',
        '未取得寫入權限，資料夾尚未儲存。請重新選擇並允許寫入權限。',
      )
      return
    }
    await saveVaultDirHandle(handle)
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
