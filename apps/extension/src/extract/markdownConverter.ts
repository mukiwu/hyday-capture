/**
 * defuddle/full 的 HTML→Markdown 轉換器（內部走 turndown）。
 *
 * 陷阱（2026-09-05 踩過）：這個入口是 webpack 打的 UMD bundle，結尾把整包收斂成 `n = n.default`，
 * 所以 `import { createMarkdownContent } from 'defuddle/full'` 型別上成立、執行時拿到
 * undefined，實際的函式掛在 default 上。這跟 content.ts 註解裡那個「型別接受
 * markdown: true 但執行時忽略」是同一類陷阱，都要靠實際跑過才發現。
 *
 * 轉換設定由 defuddle 那邊給定：atx 標題、`-` 條列、fenced code、`---` 分隔線，
 * 正好是 Hyday 吃得下的那組語法，所以直接沿用而不自己接一份 turndown。
 */
export type MarkdownConverter = (html: string, url: string) => string

export async function loadMarkdownConverter(): Promise<MarkdownConverter> {
  const { default: Defuddle } = await import('defuddle/full')
  const convert = (Defuddle as unknown as { createMarkdownContent?: MarkdownConverter })
    .createMarkdownContent
  if (typeof convert !== 'function') {
    throw new Error('defuddle 的 markdown 轉換器不見了，可能是版本改了匯出形狀')
  }
  return convert
}
