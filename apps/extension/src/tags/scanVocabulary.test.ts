import { describe, it, expect } from 'vitest'
import { tagsFromMarkdown, scanTagVocabulary } from './scanVocabulary'

describe('tagsFromMarkdown', () => {
  it('行內陣列 frontmatter，去引號', () => {
    expect(tagsFromMarkdown('---\ntags: [ai, "note", \'x\']\n---\n')).toEqual(['ai', 'note', 'x'])
  })

  it('區塊清單 frontmatter', () => {
    expect(tagsFromMarkdown('---\ntags:\n  - ai\n  - note\n---\n')).toEqual(['ai', 'note'])
  })

  it('單一純量 frontmatter', () => {
    expect(tagsFromMarkdown('---\ntags: solo\n---\n')).toEqual(['solo'])
  })

  it('內文 hashtag，含 CJK、巢狀與連字號', () => {
    const t = tagsFromMarkdown('本文\n\n#中文標籤 #a/b #c-d\n')
    expect(t).toContain('中文標籤')
    expect(t).toContain('a/b')
    expect(t).toContain('c-d')
  })

  it('markdown 標題的 # 不算 hashtag', () => {
    expect(tagsFromMarkdown('# 這是標題\n\n只有內文沒有標籤')).toEqual([])
  })

  it('程式碼區塊裡的 # 不算 hashtag', () => {
    const t = tagsFromMarkdown('內文\n\n```\n#notag\n```\n\n行內 `#alsono`')
    expect(t).not.toContain('notag')
    expect(t).not.toContain('alsono')
  })

  it('frontmatter tags 與內文 hashtag 一起收', () => {
    const t = tagsFromMarkdown('---\ntags: [ai]\n---\n\n內文 #productivity')
    expect(t).toContain('ai')
    expect(t).toContain('productivity')
  })
})

// 假的 File System Access handle，讓走訪邏輯能在 node 下測，不碰真檔案系統
function fileHandle(name: string, content: string): FileSystemHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => ({ text: async () => content }) as unknown as File,
  } as unknown as FileSystemHandle
}

function dirHandle(name: string, children: FileSystemHandle[]): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const c of children) yield c
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('scanTagVocabulary', () => {
  it('走訪 .md 抽 frontmatter tags 與內文 #tag，跨檔去重', async () => {
    const root = dirHandle('root', [
      fileHandle('a.md', '---\ntags: [ai, note]\n---\n\n內文 #productivity #ai\n'),
      fileHandle('b.md', '---\ntags:\n  - design\n---\n\n#note\n'),
      fileHandle('skip.txt', '#nope'),
      dirHandle('.hyday', [fileHandle('x.md', 'tags: [secret]')]),
      dirHandle('templates', [fileHandle('t.md', '#tmpl')]),
    ])
    const vocab = await scanTagVocabulary(root)
    expect(vocab).toContain('ai')
    expect(vocab).toContain('note')
    expect(vocab).toContain('productivity')
    expect(vocab).toContain('design')
    // 非 .md 不掃，.hyday 與 templates 目錄跳過
    expect(vocab).not.toContain('nope')
    expect(vocab).not.toContain('secret')
    expect(vocab).not.toContain('tmpl')
    // 去重：ai 出現在 a.md 的 frontmatter 與內文，只留一個
    expect(vocab.filter((t) => t === 'ai').length).toBe(1)
  })

  it('遞迴進一般子目錄', async () => {
    const root = dirHandle('root', [
      dirHandle('sub', [fileHandle('c.md', '---\ntags: [nested]\n---\n')]),
    ])
    expect(await scanTagVocabulary(root)).toContain('nested')
  })

  it('大小寫不敏感去重，保留第一次看到的樣子', async () => {
    const root = dirHandle('root', [
      fileHandle('a.md', '---\ntags: [Productivity]\n---\n'),
      fileHandle('b.md', '#productivity'),
    ])
    const vocab = await scanTagVocabulary(root)
    expect(vocab).toEqual(['Productivity'])
  })
})
