/**
 * MV3 service worker。
 *
 * v1 走路骨架的擷取由工具列 popup 完成（popup 是有使用者手勢的 document，
 * File System Access 的權限請求在那裡最穩）。這支背景目前只做安裝時的引導：
 * 首次安裝就打開設定頁，讓使用者先選輸出資料夾。
 * 右鍵選單、快捷鍵等其他入口在 issue #7 補上。
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage()
  }
})
