import { describe, it, expect } from 'vitest'
import { organize } from './organize'
import type { AICaller, ExtractedContent, Template } from './index'

const fakeAI: AICaller = async () => []
const now = new Date(2026, 6, 15, 9, 30, 5)

function fixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/hello',
    domain: 'example.com',
    title: 'Hello World',
    contentMarkdown: '正文第一段。',
    author: 'MUKi',
    published: '2026-07-01',
    ...overrides,
  }
}

const articleTemplate: Template = {
  name: 'Article',
  properties: [
    { name: 'title', value: '{{title}}', type: 'text' },
    { name: 'type', value: '{{type}}', type: 'text' },
    { name: 'createdAt', value: '{{date}}', type: 'datetime' },
    { name: 'source', value: '{{url}}', type: 'text' },
  ],
  body: '# {{title}}\n\n{{content}}',
}

const threadsTemplate: Template = {
  name: 'Threads',
  triggers: [{ type: 'urlPrefix', value: 'https://www.threads.net' }],
  properties: [
    { name: 'title', value: '{{author}} on Threads', type: 'text' },
    { name: 'type', value: '{{type}}', type: 'text' },
  ],
  body: '> {{content}}\n\n— {{author}}',
}

describe('organize 接上模板引擎', () => {
  it('未提供 templates 時走預設行為（既有輸出不變）', async () => {
    const { markdown } = await organize({ extracted: fixture(), ai: fakeAI, now })
    expect(markdown).toContain('tags: []')
    expect(markdown).toContain('createdAt: "2026-07-15 09:30:05"')
  })

  it('提供 templates 時依 trigger 選模板產出', async () => {
    const { markdown } = await organize({
      extracted: fixture({
        url: 'https://www.threads.net/@muki/post/1',
        author: 'muki',
      }),
      ai: fakeAI,
      now,
      templates: [articleTemplate, threadsTemplate],
    })
    expect(markdown).toContain('title: muki on Threads')
    expect(markdown).toContain('> 正文第一段。')
    // 沒選到 Article 模板，就不會有 createdAt
    expect(markdown).not.toContain('createdAt:')
  })

  it('皆不中則用最上面那組預設模板', async () => {
    const { markdown, filename } = await organize({
      extracted: fixture(),
      ai: fakeAI,
      now,
      templates: [articleTemplate, threadsTemplate],
    })
    expect(markdown).toContain('title: Hello World')
    expect(markdown).toContain('createdAt: "2026-07-15 09:30:05"')
    // 檔名仍取自標題
    expect(filename).toBe('Hello World.md')
  })

  it('空 templates 陣列也走預設行為', async () => {
    const { markdown } = await organize({
      extracted: fixture(),
      ai: fakeAI,
      now,
      templates: [],
    })
    expect(markdown).toContain('tags: []')
  })
})
