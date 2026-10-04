/**
 * MV3 service worker：工具列以外的擷取入口都在這裡接。
 *
 * 右鍵選單（chrome.contextMenus）與快捷鍵（chrome.commands）觸發時都在 SW 執行，
 * 這裡沒有 document，所以不能呼叫 File System Access 的 requestPermission。
 * 對策見 capture.ts 的 captureFromBackground：只 queryPermission，已授權就直接落檔；
 * 還沒授權（或還沒選資料夾）就把使用者帶去設定頁，在有手勢的 document 重新授權。
 */
import {
  captureFromBackground,
  needsDocumentGesture,
  type CaptureOptions,
} from '../capture/capture'
import {
  MENU_IDS,
  planFromContextMenu,
  planFromCommand,
  type CapturePlan,
} from '../capture/plan'
import { BACKGROUND_STATUS_KEY, type BackgroundCaptureStatus } from '../capture/backgroundStatus'
import {
  FETCH_IMAGE_MESSAGE,
  handleFetchImageMessage,
  type FetchImageRequest,
} from '../net/imageFetch'

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 首次安裝先引導選 hyday vault
    chrome.runtime.openOptionsPage()
  }
  // 安裝與更新都重建選單，避免 id 殘留或重複
  createContextMenus()
})

function createContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_IDS.page,
      title: '擷取這個頁面到 Hyday',
      contexts: ['page'],
    })
    chrome.contextMenus.create({
      id: MENU_IDS.selection,
      title: '擷取選取內容到 Hyday',
      contexts: ['selection'],
    })
    chrome.contextMenus.create({
      id: MENU_IDS.link,
      title: '擷取這個連結到 Hyday',
      contexts: ['link'],
    })
  })
}

// popup 與 content script 直接跨網域抓圖會被目標站的 CORS 擋掉（圖片 CDN 多半不送
// Access-Control-Allow-Origin），由這裡帶著 host_permissions 代發，見 net/imageFetch
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if ((message as FetchImageRequest)?.type !== FETCH_IMAGE_MESSAGE) return undefined
  const extensionOrigin = chrome.runtime.getURL('')
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(extensionOrigin)) {
    sendResponse({ ok: false, error: '拒絕非擴充頁面的圖片下載請求' })
    return false
  }
  const request = message as FetchImageRequest
  void handleFetchImageMessage(request.url, request.sourceUrl).then(sendResponse)
  return true // 非同步回覆，保持訊息通道開著
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const plan = planFromContextMenu(info)
  if (plan) void runCapture(plan, tab?.id)
})

chrome.commands.onCommand.addListener((command, tab) => {
  const plan = planFromCommand(command)
  if (plan) void runCapture(plan, tab?.id)
})

/** 把 CapturePlan 換成 captureFromBackground 的參數，跑管線並回報結果 */
async function runCapture(plan: CapturePlan, tabId: number | undefined): Promise<void> {
  // 先寫狀態再開 popup，否則 popup 讀不到狀態會自己擷取一次當前分頁
  await setStatus({ state: 'running', at: Date.now() })
  void showPopup()
  await clearBadge()
  const opts: CaptureOptions =
    plan.source === 'link'
      ? { linkUrl: plan.linkUrl }
      : { tabId, selectionOnly: plan.selectionOnly }

  try {
    const result = await captureFromBackground(opts)
    await setStatus({
      state: 'done',
      at: Date.now(),
      filename: result.filename,
      collided: result.collided,
      skippedImages: result.images.skipped,
    })
    if (result.images.skipped > 0) {
      console.warn(`[hyday-capture] ${result.images.skipped} 張圖片未能保存，已保留原網址`)
      void flashBadge('!', '#e37400')
    } else {
      void flashBadge('✓', '#147a3d')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await setStatus({ state: 'error', at: Date.now(), message })
    if (needsDocumentGesture(err)) {
      // SW 無法在無手勢下請求權限，帶使用者去設定頁重新授權（那裡有手勢 + document）
      chrome.runtime.openOptionsPage()
      void flashBadge('!', '#e37400')
      return
    }
    console.error('[hyday-capture] 背景擷取失敗', err)
    void flashBadge('!', '#b3261e')
  }
  // 擷取途中使用者可能已經把 popup 關掉，結束時再開一次讓結果一定看得到
  void showPopup()
}

async function setStatus(status: BackgroundCaptureStatus): Promise<void> {
  await chrome.storage.session.set({ [BACKGROUND_STATUS_KEY]: status })
}

// 右鍵與快捷鍵沒有自己的畫面，借工具列 popup 顯示進度與結果。
// openPopup 在視窗沒有焦點或舊版 Chrome 會失敗，那時仍有 badge 當備援
async function showPopup(): Promise<void> {
  try {
    await chrome.action.openPopup()
  } catch {
    // 已開著或無法開啟都不影響擷取
  }
}

// 背景入口沒有 popup 可顯示狀態，用工具列圖示的 badge 做輕量回饋
async function clearBadge(): Promise<void> {
  await chrome.action.setBadgeText({ text: '' })
}

async function flashBadge(text: string, color: string): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color })
  await chrome.action.setBadgeText({ text })
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' })
  }, 4000)
}
