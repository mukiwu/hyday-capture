import { applyParagraphBreaks, unwrapLinkedImages } from '@hyday-capture/organize-engine'

/** 把 Defuddle 的正文整理成可寫入原料檔的 Markdown，空正文視為抽取失敗。 */
export function normalizeExtractedMarkdown(raw: string): string {
  const markdown = unwrapLinkedImages(applyParagraphBreaks(raw))
  if (!markdown.trim()) {
    throw new Error('抽取不到正文，請改用選取內容擷取或手動處理')
  }
  return markdown
}
