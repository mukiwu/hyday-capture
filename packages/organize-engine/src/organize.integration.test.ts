import { describe, it, expect } from 'vitest'
import { organize } from './organize'
import type { AICaller, ExtractedContent, Template } from './index'

// 整合測試：模板路徑（issue #4）與錨定式下標（issue #6）合流。
// 擴充實際擷取一定帶模板，所以錨定算出的標籤必須經 {{tags}} 變數流進模板輸出，
// 否則使用者永遠看不到自動標籤。這裡鎖住那條接線。

const now = new Date(2026, 6, 15, 9, 30, 5)

function fixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/hello',
    domain: 'example.com',
    title: 'Hello World',
    contentMarkdown: '正文內容',
    ...overrides,
  }
}

// 貼近擴充內建預設模板：tags 用 {{tags}} 的 list property
const defaultTemplate: Template = {
  name: '預設文章',
  properties: [
    { name: 'title', value: '{{title}}', type: 'text' },
    { name: 'type', value: '{{type}}', type: 'text' },
    { name: 'tags', value: '{{tags}}', type: 'list' },
    { name: 'sourceUrl', value: '{{url}}', type: 'text' },
  ],
  body: '# {{title}}\n\n{{content}}',
}

describe('organize 模板路徑 + 錨定式下標', () => {
  it('AI 候選標籤經 {{tags}} 流進模板 frontmatter，且套用錨定政策', async () => {
    // AI 回：既有標籤 ai、一個新標 machine-learning、一個來源類 example（應被擋）
    const ai: AICaller = async () => ['ai', 'machine-learning', 'example']
    const { markdown } = await organize({
      extracted: fixture(),
      ai,
      now,
      tagVocabulary: ['ai'],
      templates: [defaultTemplate],
    })
    expect(markdown).toContain('tags: [ai, machine-learning]')
    expect(markdown).not.toContain('example]') // 來源類（網站名）被過濾
    expect(markdown).toContain('title: Hello World')
    expect(markdown).toContain('type: article')
  })

  it('AI 回空時模板輸出 tags: []，不會漏鍵', async () => {
    const ai: AICaller = async () => []
    const { markdown } = await organize({
      extracted: fixture(),
      ai,
      now,
      tagVocabulary: [],
      templates: [defaultTemplate],
    })
    expect(markdown).toContain('tags: []')
  })
})
