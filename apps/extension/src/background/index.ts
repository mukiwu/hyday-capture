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
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if ((message as FetchImageRequest)?.type !== FETCH_IMAGE_MESSAGE) return undefined
  void handleFetchImageMessage((message as FetchImageRequest).url).then(sendResponse)
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
  await clearBadge()
  const opts: CaptureOptions =
    plan.source === 'link'
      ? { linkUrl: plan.linkUrl }
      : { tabId, selectionOnly: plan.selectionOnly }

  try {
    await captureFromBackground(opts)
    void flashBadge('✓', '#147a3d')
  } catch (err) {
    if (needsDocumentGesture(err)) {
      // SW 無法在無手勢下請求權限，帶使用者去設定頁重新授權（那裡有手勢 + document）
      chrome.runtime.openOptionsPage()
      void flashBadge('!', '#e37400')
    } else {
      console.error('[hyday-capture] 背景擷取失敗', err)
      void flashBadge('!', '#b3261e')
    }
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
