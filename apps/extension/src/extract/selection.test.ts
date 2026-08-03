import { describe, expect, it } from 'vitest'
import { buildSelectionExtractedContent } from './selection'

describe('buildSelectionExtractedContent', () => {
  it('選取正文仍保留頁面抽到的 metadata', () => {
    expect(
      buildSelectionExtractedContent('選取的段落', {
        url: 'https://example.com/article',
        domain: 'example.com',
        title: '文章標題',
        author: '作者',
        published: '2026-07-15',
        description: '摘要',
        image: 'https://example.com/cover.png',
      }),
    ).toEqual({
      url: 'https://example.com/article',
      domain: 'example.com',
      title: '文章標題',
      contentMarkdown: '選取的段落',
      author: '作者',
      published: '2026-07-15',
      description: '摘要',
      image: 'https://example.com/cover.png',
    })
  })
})
