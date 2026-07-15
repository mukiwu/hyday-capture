import type { OrganizeInput, OrganizeOutput } from './types'
import { detectNoteType } from './noteType'
import { safeFileStem } from './filename'
import { serializeFrontmatter, formatTimestamp } from './frontmatter'
import { anchoredTagging } from './tagging'
import { selectTemplate, renderTemplate } from './template'

/**
 * 整理引擎入口：把抽取好的頁面資料整理成一則 hyday .md。
 * 純函式（AI 與時間都注入），輸入相同則輸出相同。
 */
export async function organize(input: OrganizeInput): Promise<OrganizeOutput> {
  const { extracted, now, templates } = input

  // 錨定式開放下標（issue #6，ADR 0004）：模板路徑與預設路徑共用同一組標籤，
  // 注入的 AI 回空則得空陣列。放在最前面算一次，兩條輸出路徑都拿得到。
  const tags = await anchoredTagging({
    extracted,
    vocabulary: input.tagVocabulary ?? [],
    ai: input.ai,
  })

  const stem = safeFileStem(extracted.title, extracted.url)

  // issue #4：有模板就依 Source 規則選一組產出；標籤以 {{tags}} 變數供模板取用
  if (templates && templates.length > 0) {
    const template = selectTemplate(templates, {
      url: extracted.url,
      schemaOrgTypes: extracted.schemaOrgTypes,
    })
    if (template) {
      const markdown = renderTemplate(template, { extracted, now, tags })
      return { filename: `${stem}.md`, markdown }
    }
  }

  // 預設輸出（無模板時的相容行為）
  const type = detectNoteType(extracted.url)
  const title = extracted.title.trim() || stem
  const timestamp = formatTimestamp(now)

  const frontmatter = serializeFrontmatter([
    ['title', title],
    ['type', type],
    // spec §128 要求至少含 tags；由錨定式下標填入（issue #6）
    ['tags', tags],
    ['createdAt', timestamp],
    ['lastModified', timestamp],
    ['sourceUrl', extracted.url],
    ['sourceDomain', extracted.domain],
  ])

  const body = extracted.contentMarkdown.trim()
  const markdown = body
    ? `${frontmatter}\n\n# ${title}\n\n${body}\n`
    : `${frontmatter}\n\n# ${title}\n`

  return { filename: `${stem}.md`, markdown }
}
