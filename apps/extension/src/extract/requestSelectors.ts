/**
 * issue #4：向 content script 要模板引用到的 CSS selector 內容。
 * 選模板前不知道會用到哪些 selector，所以由 organize-engine 的 collectSelectorRefs
 * 掃出清單後，才向頁面拿這些值，再併回 ExtractedContent。
 */
import type { SelectorsMessage, SelectorsData } from './content'

const EMPTY: SelectorsData = { selectors: {}, selectorsHtml: {} }

export async function requestSelectors(
  tabId: number,
  refs: { selectors: string[]; selectorsHtml: string[] },
): Promise<SelectorsData> {
  if (refs.selectors.length === 0 && refs.selectorsHtml.length === 0) return EMPTY
  const message: SelectorsMessage = {
    type: 'HYDAY_EXTRACT_SELECTORS',
    selectors: refs.selectors,
    selectorsHtml: refs.selectorsHtml,
  }
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as
      | { ok: true; data: SelectorsData }
      | { ok: false; error: string }
    if (response?.ok) return response.data
  } catch {
    // 取 selector 失敗不該擋住整個擷取，回空讓變數代成空字串
  }
  return EMPTY
}
