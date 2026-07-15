import type { OrganizeInput, OrganizeOutput } from './types'
import { detectNoteType } from './noteType'
import { safeFileStem } from './filename'
import { serializeFrontmatter, formatTimestamp } from './frontmatter'
import { anchoredTagging } from './tagging'

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

  // 錨定式開放下標（issue #6，ADR 0004）：沿用既有詞彙優先，注入的 AI 回空則得空陣列
  const tags = await anchoredTagging({
    extracted,
    vocabulary: input.tagVocabulary ?? [],
    ai: input.ai,
  })

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
