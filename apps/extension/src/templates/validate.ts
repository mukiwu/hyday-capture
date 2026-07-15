/**
 * 模板存檔前的把關：確保每組模板都會產出 hyday frontmatter 契約要求的欄位。
 * 引擎本身忠實渲染使用者宣告的 properties（不強加欄位），契約由這層在存檔點守住，
 * 避免使用者手改模板時不小心拿掉必要欄位，產出 hyday 讀不完整的筆記。
 */
import type { Template } from '@hyday-capture/organize-engine'

// spec §128：hyday frontmatter 至少要有這些欄位
export const REQUIRED_PROPERTY_NAMES = [
  'title',
  'type',
  'tags',
  'createdAt',
  'lastModified',
] as const

/** 一組模板缺少的必要 property 名稱（依 spec §128） */
export function missingRequiredProperties(template: Template): string[] {
  const have = new Set(template.properties.map((p) => p.name))
  return REQUIRED_PROPERTY_NAMES.filter((k) => !have.has(k))
}

/** 檢查整組模板，回傳每組缺少的必要欄位；全部合規則回空陣列 */
export function validateTemplates(
  templates: Template[],
): { name: string; missing: string[] }[] {
  return templates
    .map((t) => ({ name: t.name, missing: missingRequiredProperties(t) }))
    .filter((r) => r.missing.length > 0)
}
