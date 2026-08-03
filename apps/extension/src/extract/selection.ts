import type { ExtractedContent } from '@hyday-capture/organize-engine'

export type ExtractedPageMetadata = Omit<ExtractedContent, 'contentMarkdown'>

/** 以頁面抽到的 metadata 包住使用者選取的正文，避免選取入口遺失作者等欄位。 */
export function buildSelectionExtractedContent(
  contentMarkdown: string,
  metadata: ExtractedPageMetadata,
): ExtractedContent {
  return { ...metadata, contentMarkdown }
}
