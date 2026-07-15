import { describe, it, expect } from 'vitest'
import { organize } from './organize'
import type { AICaller, ExtractedContent } from './types'

// 收進一個已有標籤的資料夾：assert 產出的筆記標籤取自既有詞彙（AC，issue #6）。
// 假 AICaller 回一組含既有詞彙 + 一個詞彙外新標的候選，驗證 organize 把後處理結果接進 frontmatter。

const now = new Date(2026, 6, 15, 9, 30, 5)

function fixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/hello',
    domain: 'example.com',
    title: 'Hello World',
    contentMarkdown: '正文',
    ...overrides,
  }
}

function tagsLine(markdown: string): string {
  const line = markdown.split('\n').find((l) => l.startsWith('tags:'))
  return line ?? ''
}

describe('organize × 錨定式下標', () => {
  it('沒給詞彙且 AI 回空（noop）時，tags 維持空陣列', async () => {
    const noop: AICaller = async () => []
    const { markdown } = await organize({ extracted: fixture(), ai: noop, now })
    expect(tagsLine(markdown)).toBe('tags: []')
  })

  it('給既有詞彙時，frontmatter tags 取自既有詞彙、行內陣列輸出', async () => {
    const ai: AICaller = async () => ['ai', 'note', 'sourcey-new']
    const { markdown } = await organize({
      extracted: fixture(),
      ai,
      now,
      tagVocabulary: ['ai', 'note', 'productivity'],
    })
    const line = tagsLine(markdown)
    expect(line).toContain('ai')
    expect(line).toContain('note')
    // 沿用的兩個既有詞彙都在，行內陣列樣式
    expect(line).toMatch(/^tags: \[.*\]$/)
  })

  it('AI 想把網站名當標籤時，不會寫進 frontmatter', async () => {
    const ai: AICaller = async () => ['example', 'ai']
    const { markdown } = await organize({
      extracted: fixture({ domain: 'example.com' }),
      ai,
      now,
      tagVocabulary: ['ai'],
    })
    const line = tagsLine(markdown)
    expect(line).toContain('ai')
    expect(line).not.toContain('example')
  })
})
