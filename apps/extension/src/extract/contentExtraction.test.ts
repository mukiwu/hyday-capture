import { describe, expect, it } from 'vitest'
import { normalizeExtractedMarkdown } from './contentExtraction'

describe('normalizeExtractedMarkdown', () => {
  it('正文為空時明確拒絕，避免產出假成功的空原料檔', () => {
    expect(() => normalizeExtractedMarkdown('   ')).toThrow('抽取不到正文')
  })

  it('保留有效的 Markdown 正文', () => {
    expect(normalizeExtractedMarkdown('第一段\n\n第二段')).toBe('第一段\n\n第二段')
  })
})
