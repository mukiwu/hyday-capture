import { describe, it, expect } from 'vitest'
import { organize } from './organize'
import type { AICaller, ExtractedContent } from './types'

// 假 AICaller：回固定答案，讓輸出可預期。issue #3 尚未呼叫 AI，這裡先注入備用。
const fakeAI: AICaller = async () => []

const now = new Date(2026, 6, 15, 9, 30, 5) // 2026-07-15 09:30:05 本地時間

function fixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/hello',
    domain: 'example.com',
    title: 'Hello World',
    contentMarkdown: '這是正文第一段。\n\n這是第二段。',
    author: 'MUKi',
    published: '2026-07-01',
    description: '一段描述',
    image: 'https://example.com/cover.png',
    ...overrides,
  }
}

describe('organize', () => {
  it('輸出 { filename, markdown }，檔名取自標題', async () => {
    const out = await organize({ extracted: fixture(), ai: fakeAI, now })
    expect(out.filename).toBe('Hello World.md')
    expect(out.markdown).toContain('# Hello World')
    expect(out.markdown).toContain('這是正文第一段。')
  })

  it('frontmatter 含 title/type/createdAt/lastModified/sourceUrl/sourceDomain', async () => {
    const { markdown } = await organize({ extracted: fixture(), ai: fakeAI, now })
    const fm = markdown.slice(0, markdown.indexOf('\n---', 4) + 4)
    expect(fm).toContain('title: Hello World')
    expect(fm).toContain('type: article')
    // spec §128：至少含 tags；issue #6 前先出空陣列
    expect(fm).toContain('tags: []')
    expect(fm).toContain('createdAt: "2026-07-15 09:30:05"')
    expect(fm).toContain('lastModified: "2026-07-15 09:30:05"')
    expect(fm).toContain('sourceUrl: https://example.com/blog/hello')
    expect(fm).toContain('sourceDomain: example.com')
    // 時間戳一律加引號，避免 YAML 把它 coerce 成 timestamp 型別（與 hyday 自己寫檔一致）
    expect(fm).toContain('"2026-07-15 09:30:05"')
    // 網址不被引號包住
    expect(fm).not.toContain('"https://example.com/blog/hello"')
  })

  it('frontmatter 起於檔案開頭且結構完整', async () => {
    const { markdown } = await organize({ extracted: fixture(), ai: fakeAI, now })
    expect(markdown.startsWith('---\n')).toBe(true)
    expect(markdown).toMatch(/^---\n[\s\S]*?\n---\n/)
  })

  describe('類型判斷', () => {
    it('圖片副檔名網址判為 img', async () => {
      const { markdown } = await organize({
        extracted: fixture({ url: 'https://cdn.example.com/a/photo.JPG', domain: 'cdn.example.com' }),
        ai: fakeAI,
        now,
      })
      expect(markdown).toContain('type: img')
    })

    it('YouTube 判為 video', async () => {
      const { markdown } = await organize({
        extracted: fixture({ url: 'https://www.youtube.com/watch?v=abc123', domain: 'youtube.com' }),
        ai: fakeAI,
        now,
      })
      expect(markdown).toContain('type: video')
    })

    it('youtu.be 短網址判為 video', async () => {
      const { markdown } = await organize({
        extracted: fixture({ url: 'https://youtu.be/abc123', domain: 'youtu.be' }),
        ai: fakeAI,
        now,
      })
      expect(markdown).toContain('type: video')
    })

    it('一般文章判為 article', async () => {
      const { markdown } = await organize({ extracted: fixture(), ai: fakeAI, now })
      expect(markdown).toContain('type: article')
    })
  })

  it('標題含 YAML 特殊字元時，frontmatter 值加引號', async () => {
    const { markdown } = await organize({
      extracted: fixture({ title: 'Breaking: something #big' }),
      ai: fakeAI,
      now,
    })
    expect(markdown).toContain('title: "Breaking: something #big"')
  })

  it('正文為空時仍產出合法筆記，只有標題', async () => {
    const { markdown } = await organize({
      extracted: fixture({ contentMarkdown: '' }),
      ai: fakeAI,
      now,
    })
    expect(markdown).toContain('# Hello World')
    expect(markdown.startsWith('---\n')).toBe(true)
  })

  it('標題為日期樣式時，檔名不落成 journal 風格', async () => {
    const { filename } = await organize({
      extracted: fixture({ title: '2026-07-15' }),
      ai: fakeAI,
      now,
    })
    expect(filename).not.toMatch(/^\d{4}[-.]\d{2}[-.]\d{2}\.md$/)
    expect(filename.endsWith('.md')).toBe(true)
  })
})
