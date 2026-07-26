// 改向後的正式輸出路徑：擷取端只產原料檔，整理權在 hyday app 端（ADR 0002）
export {
  buildRawClipping,
  rawClippingFilename,
  normalizeCapturedTitle,
  INBOX_TAG,
} from './rawClipping'
export type { RawClippingInput, RawClippingOutput } from './rawClipping'
export { PARAGRAPH_BREAK_TOKEN, applyParagraphBreaks } from './paragraphBreaks'
export {
  ASSETS_DIR,
  assetFileName,
  extensionForContentType,
  findRemoteImageUrls,
  rewriteImageUrls,
} from './imageAssets'
// organize 與模板、下標留著給 app 端接手時搬運，擷取流程已不再呼叫
export { organize } from './organize'
export { detectNoteType } from './noteType'
export { safeFileStem, appendCollisionSuffix } from './filename'
export { serializeFrontmatter, formatTimestamp, yamlScalar } from './frontmatter'
export type { ArrayStyle } from './frontmatter'
export { anchoredTagging, applyAnchoredPolicy, MAX_TAGS, MAX_NEW_TAGS } from './tagging'
export type { AnchoredTaggingInput } from './tagging'
export type {
  AICaller,
  NoteType,
  ExtractedContent,
  OrganizeInput,
  OrganizeOutput,
} from './types'
// issue #4 模板引擎
export {
  selectTemplate,
  renderTemplate,
  interpolate,
  collectSelectorRefs,
  applyFilters,
  parseFilter,
  formatDate,
  htmlToMarkdown,
  FILTERS,
} from './template'
export type {
  Template,
  Trigger,
  TriggerType,
  TemplateProperty,
  PropertyType,
  TemplateSource,
  RenderContext,
  Filter,
} from './template'
