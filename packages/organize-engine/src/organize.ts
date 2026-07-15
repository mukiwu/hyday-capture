import type { OrganizeInput, OrganizeOutput } from './types'
import { detectNoteType } from './noteType'
import { safeFileStem } from './filename'
import { serializeFrontmatter, formatTimestamp } from './frontmatter'

/**
 * 整理引擎入口：把抽取好的頁面資料整理成一則 hyday .md。
 * 純函式（AI 與時間都注入），輸入相同則輸出相同。
 */
export async function organize(input: OrganizeInput): Promise<OrganizeOutput> {
  const { extracted, now } = input

  const type = detectNoteType(extracted.url)
  const stem = safeFileStem(extracted.title, extracted.url)
  const title = extracted.title.trim() || stem
  const timestamp = formatTimestamp(now)

  const frontmatter = serializeFrontmatter([
    ['title', title],
    ['type', type],
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
