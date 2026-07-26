/**
 * 分段流失的一般解，字串那半邊。
 *
 * 問題：原文視覺上有分段，但結構上不是真的段落。已知兩種表示法，連續 `<br>`（電子報、
 * Substack）與 pre-wrap 文字節點裡的真換行（X、Threads 這類）。後者更麻煩，HTML 把它當
 * 空白，抽取器在我們拿到內容之前就正規化成空格了，資訊直接消失。
 *
 * 解法不維護站台名單：轉 markdown 之前，在 DOM 上把那些邊界換成一個純文字標記（那部分是
 * 瀏覽器端的事，見擴充的 extract/hardenParagraphs.ts），標記是純字母所以能原封不動穿過
 * 抽取與 turndown；轉完之後由這支把標記換成空行分段。
 *
 * 落成空行分段而不是硬換行是拍板的判準：原文作者按 enter 的意圖就是分段，`<br>` 或
 * pre-wrap 換行只是那個平台的實作方式（2026-07-26）。
 */

import { mapOutsideFences } from './fences'

/** 段落邊界的佔位標記。純字母無 markdown 特殊字元，才不會被跳脫或當語法 */
export const PARAGRAPH_BREAK_TOKEN = 'HYDAYPARABREAK'

// 標記本身，連同前後的空白與 turndown 硬換行（行尾兩個空白）一起吃掉
const TOKEN_RUN = new RegExp(`(?:[ \\t]*\\n?)*(?:${PARAGRAPH_BREAK_TOKEN}(?:[ \\t]*\\n?)*)+`, 'g')

/** 把 DOM 前處理插入的段落標記換成空行分段 */
export function applyParagraphBreaks(markdown: string): string {
  return mapOutsideFences(markdown, (chunk) =>
    chunk.replace(TOKEN_RUN, '\n\n').replace(/\n{3,}/g, '\n\n'),
  ).trim()
}
