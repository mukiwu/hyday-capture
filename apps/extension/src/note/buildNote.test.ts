import { describe, it, expect } from 'vitest'
import { buildCaptureNote, appendCollisionSuffix } from './buildNote'

// 走路骨架的 seam：把當前分頁的 title + url 變成最小 frontmatter 的 .md
// 只驗外部行為（產出的 markdown 與 filename），不驗實作細節
describe('buildCaptureNote', () => {
  const capturedAt = new Date(2026, 6, 15, 9, 30, 5) // 2026-07-15 09:30:05 本地時間

  it('產出帶最小 frontmatter 的 markdown，至少含 title、sourceUrl、createdAt', () => {
    const { markdown } = buildCaptureNote({
      title: 'Hello World',
      url: 'https://example.com/post',
      capturedAt,
    })

    expect(markdown.startsWith('---\n')).toBe(true)
    expect(markdown).toContain('title: Hello World')
    expect(markdown).toContain('sourceUrl: https://example.com/post')
    expect(markdown).toContain('createdAt: 2026-07-15 09:30:05')
    // frontmatter 收尾且有正文標題
    expect(markdown).toMatch(/\n---\n/)
    expect(markdown).toContain('# Hello World')
  })

  it('檔名用標題安全化，副檔名 .md', () => {
    const { filename } = buildCaptureNote({
      title: 'My First Note',
      url: 'https://example.com',
      capturedAt,
    })
    expect(filename).toBe('My First Note.md')
  })

  it('檔名去掉檔案系統不安全字元', () => {
    const { filename } = buildCaptureNote({
      title: 'a/b\\c:d*e?f"g<h>i|j',
      url: 'https://example.com',
      capturedAt,
    })
    expect(filename).not.toMatch(/[\\/:*?"<>|]/)
    expect(filename.endsWith('.md')).toBe(true)
  })

  it('標題含 YAML 特殊字元時 frontmatter 值會被引號包起來', () => {
    const { markdown } = buildCaptureNote({
      title: 'Colon: and #hash',
      url: 'https://example.com',
      capturedAt,
    })
    expect(markdown).toContain('title: "Colon: and #hash"')
  })

  it('標題為空時退回可用的預設檔名，而非空檔名', () => {
    const { filename } = buildCaptureNote({
      title: '   ',
      url: 'https://example.com/some-page',
      capturedAt,
    })
    expect(filename).not.toBe('.md')
    expect(filename.endsWith('.md')).toBe(true)
  })

  it('標題安全化後若是純日期樣式，不落成 journal 風格檔名', () => {
    const { filename } = buildCaptureNote({
      title: '2026-07-15',
      url: 'https://example.com',
      capturedAt,
    })
    // hyday 用 YYYY-MM-DD.md / YYYY.MM.DD.md 認 journal，擷取筆記不可長這樣
    expect(filename).not.toMatch(/^\d{4}[-.]\d{2}[-.]\d{2}\.md$/)
    expect(filename.endsWith('.md')).toBe(true)
  })
})

describe('appendCollisionSuffix', () => {
  it('碰撞時在副檔名前加時間戳後綴，仍為 .md', () => {
    const capturedAt = new Date(2026, 6, 15, 9, 30, 5)
    const out = appendCollisionSuffix('My Note.md', capturedAt)
    expect(out).not.toBe('My Note.md')
    expect(out.startsWith('My Note')).toBe(true)
    expect(out.endsWith('.md')).toBe(true)
    expect(out).toContain('20260715')
  })
})
