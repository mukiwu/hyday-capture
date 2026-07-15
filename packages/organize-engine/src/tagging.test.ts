import { describe, it, expect } from 'vitest'
import { anchoredTagging, applyAnchoredPolicy, MAX_TAGS, MAX_NEW_TAGS } from './tagging'
import type { AICaller, ExtractedContent } from './types'

// 假 AICaller：忽略 prompt 與 context，回一組固定候選標籤，
// 讓引擎的後處理把關 deterministic，測試才能斷言錨定政策。
function aiReturning(tags: string[]): AICaller {
  return async () => tags
}

function fixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/hello',
    domain: 'example.com',
    title: 'Hello World',
    contentMarkdown: '正文',
    ...overrides,
  }
}

describe('anchoredTagging 錨定政策（假 AICaller）', () => {
  it('沿用優先：AI 回既有詞彙加一個新標，既有的全部保留、新標保留', async () => {
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: ['ai', 'note', 'productivity'],
      ai: aiReturning(['ai', 'note', 'brand-new']),
    })
    expect(tags).toContain('ai')
    expect(tags).toContain('note')
    expect(tags).toContain('brand-new')
  })

  it('至多一個新標：AI 丟一堆詞彙外的新標，只留一個', async () => {
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: ['ai'],
      ai: aiReturning(['ai', 'newone', 'newtwo', 'newthree']),
    })
    const fresh = tags.filter((t) => t !== 'ai')
    expect(fresh.length).toBe(MAX_NEW_TAGS)
    expect(tags).toContain('ai')
  })

  it('上限約五：候選很多時砍到五個，且優先留既有詞彙', async () => {
    const vocab = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: vocab,
      ai: aiReturning([...vocab, 'newbie']),
    })
    expect(tags.length).toBe(MAX_TAGS)
    // 沿用優先：新標被既有詞彙擠掉
    expect(tags.every((t) => vocab.includes(t))).toBe(true)
  })

  it('過濾來源類：網站名與 books 這種來源類新標會被丟掉', async () => {
    const tags = await anchoredTagging({
      extracted: fixture({ domain: 'example.com' }),
      vocabulary: ['ai'],
      ai: aiReturning(['ai', 'example', 'example.com', 'books']),
    })
    expect(tags).not.toContain('example')
    expect(tags).not.toContain('example.com')
    expect(tags).not.toContain('books')
    expect(tags).toContain('ai')
  })

  it('沿用時輸出用詞彙原本的大小寫，不用 AI 回的樣子', async () => {
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: ['Productivity'],
      ai: aiReturning(['productivity']),
    })
    expect(tags).toContain('Productivity')
    expect(tags).not.toContain('productivity')
  })

  it('去掉 # 前綴並修剪，能對到既有詞彙', async () => {
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: ['ai'],
      ai: aiReturning(['  #ai  ']),
    })
    expect(tags).toEqual(['ai'])
  })

  it('重複候選只出現一次', async () => {
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: ['ai'],
      ai: aiReturning(['ai', 'ai', '#ai']),
    })
    expect(tags).toEqual(['ai'])
  })

  it('空候選回空陣列（例如注入的 noopAI）', async () => {
    const tags = await anchoredTagging({
      extracted: fixture(),
      vocabulary: ['ai'],
      ai: aiReturning([]),
    })
    expect(tags).toEqual([])
  })

  it('冷啟動空詞彙時近似開放模式：可留多個新標，仍受上限五節制且濾來源類', async () => {
    const tags = await anchoredTagging({
      extracted: fixture({ domain: 'example.com' }),
      vocabulary: [],
      ai: aiReturning(['one', 'two', 'three', 'four', 'five', 'six', 'example']),
    })
    expect(tags.length).toBe(MAX_TAGS)
    expect(tags).not.toContain('example')
  })
})

describe('applyAnchoredPolicy 純函式（不經 AI）', () => {
  it('沿用優先＋至多一新＋上限五 一次到位', () => {
    const out = applyAnchoredPolicy(['ai', 'note', 'x', 'y', 'z'], ['ai', 'note'], fixture())
    expect(out).toEqual(['ai', 'note', 'x'])
  })
})
