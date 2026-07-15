import type { OrganizeInput, OrganizeOutput } from './types'
import { detectNoteType } from './noteType'
import { safeFileStem } from './filename'
import { serializeFrontmatter, formatTimestamp } from './frontmatter'
import { selectTemplate, renderTemplate } from './template'

/**
 * 整理引擎入口：把抽取好的頁面資料整理成一則 hyday .md。
 * 純函式（AI 與時間都注入），輸入相同則輸出相同。
 */
export async function organize(input: OrganizeInput): Promise<OrganizeOutput> {
  const { extracted, now, templates } = input

  // issue #4：有模板就依 Source 規則選一組產出；沒有就落到下面的預設行為（維持相容）
  if (templates && templates.length > 0) {
    const template = selectTemplate(templates, {
      url: extracted.url,
      schemaOrgTypes: extracted.schemaOrgTypes,
    })
    if (template) {
      const markdown = renderTemplate(template, { extracted, now })
      const stem = safeFileStem(extracted.title, extracted.url)
      return { filename: `${stem}.md`, markdown }
    }
  }

  const type = detectNoteType(extracted.url)
  const stem = safeFileStem(extracted.title, extracted.url)
  const title = extracted.title.trim() || stem
  const timestamp = formatTimestamp(now)

  const frontmatter = serializeFrontmatter([
    ['title', title],
    ['type', type],
    // spec §128 要求至少含 tags；issue #6 的錨定式下標會填入內容，這裡先出空陣列
    ['tags', []],
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
