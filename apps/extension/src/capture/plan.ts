/**
 * 從各入口的原始資訊算出「這次要擷取什麼」的純邏輯。
 *
 * 右鍵選單、快捷鍵這些入口拿到的是 chrome.contextMenus / chrome.commands 的原始資料，
 * 這支把它們正規化成一個與平台無關的 CapturePlan，讓 background 的 orchestration 變薄、好測。
 * 這裡不碰任何瀏覽器 API，可以直接用 Vitest 覆蓋。
 */

/** 右鍵選單各項目的固定 id，background 建立選單與分派都用這組常數 */
export const MENU_IDS = {
  page: 'hyday-capture-page',
  selection: 'hyday-capture-selection',
  link: 'hyday-capture-link',
} as const

/** 一次擷取的意圖：要嘛擷取某個分頁（可只取選取內容），要嘛擷取一個連結 */
export type CapturePlan =
  | { source: 'active-tab'; selectionOnly: boolean }
  | { source: 'link'; linkUrl: string }

/** chrome.contextMenus.OnClickData 中我們會用到的欄位 */
export type ContextMenuInfo = {
  menuItemId: string | number
  linkUrl?: string
  selectionText?: string
}

/**
 * 把右鍵選單的點擊資訊換算成擷取意圖。
 * - 點連結項：以該連結 URL 為來源（background 會另開背景分頁擷取它）
 * - 點選取項：擷取當前分頁的選取內容
 * - 點頁面項：擷取整頁
 * 不是我們的選單項回 null，讓呼叫端略過。
 */
export function planFromContextMenu(info: ContextMenuInfo): CapturePlan | null {
  switch (info.menuItemId) {
    case MENU_IDS.link:
      return info.linkUrl ? { source: 'link', linkUrl: info.linkUrl } : null
    case MENU_IDS.selection:
      return { source: 'active-tab', selectionOnly: true }
    case MENU_IDS.page:
      return { source: 'active-tab', selectionOnly: false }
    default:
      return null
  }
}

/** 已知的快捷鍵指令。目前只有「擷取當前頁面」 */
export const CAPTURE_PAGE_COMMAND = 'capture-page'

/** 把快捷鍵指令換算成擷取意圖，未知指令回 null */
export function planFromCommand(command: string): CapturePlan | null {
  if (command === CAPTURE_PAGE_COMMAND) {
    return { source: 'active-tab', selectionOnly: false }
  }
  return null
}
