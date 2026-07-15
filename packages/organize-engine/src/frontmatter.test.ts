import { describe, it, expect } from 'vitest'
import { serializeFrontmatter, yamlScalar, formatTimestamp } from './frontmatter'

describe('yamlScalar', () => {
  it('一般字串不加引號', () => {
    expect(yamlScalar('Hello World')).toBe('Hello World')
  })
  it('網址的 :// 不加引號', () => {
    expect(yamlScalar('https://example.com/x')).toBe('https://example.com/x')
  })
  it('冒號加空白時加引號', () => {
    expect(yamlScalar('Title: subtitle')).toBe('"Title: subtitle"')
  })
  it('沒有其他觸發時，含雙引號的值仍是 plain scalar，不加引號', () => {
    expect(yamlScalar('say "hi"')).toBe('say "hi"')
  })
  it('需要引號的值裡若含雙引號會跳脫', () => {
    // 有冒號加空白會觸發引號，內部雙引號需跳脫
    expect(yamlScalar('He said: "hi"')).toBe('"He said: \\"hi\\""')
  })
  it('含換行的值加引號並把換行跳脫成 \\n，攤平成一行', () => {
    expect(yamlScalar('line1\nline2')).toBe('"line1\\nline2"')
  })
})

describe('serializeFrontmatter', () => {
  it('undefined 欄位跳過，空陣列照實輸出成 key: []', () => {
    const fm = serializeFrontmatter([
      ['title', 'A'],
      ['author', undefined],
      ['tags', []],
    ])
    expect(fm).toBe('---\ntitle: A\ntags: []\n---')
  })

  it('陣列以行內陣列輸出，供 hyday 手寫解析器讀', () => {
    const fm = serializeFrontmatter([['tags', ['ai', 'note']]])
    expect(fm).toContain('tags: [ai, note]')
  })
})

describe('formatTimestamp', () => {
  it('輸出 YYYY-MM-DD HH:mm:ss，不含 T', () => {
    expect(formatTimestamp(new Date(2026, 6, 15, 9, 30, 5))).toBe('2026-07-15 09:30:05')
  })
})
