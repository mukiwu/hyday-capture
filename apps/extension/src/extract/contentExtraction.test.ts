import { describe, expect, it } from 'vitest'
import { normalizeExtractedMarkdown } from './contentExtraction'

describe('normalizeExtractedMarkdown', () => {
  it('正文為空時明確拒絕，避免產出假成功的空原料檔', () => {
    expect(() => normalizeExtractedMarkdown('   ')).toThrow('抽取不到正文')
  })

	it('保留有效的 Markdown 正文', () => {
		expect(normalizeExtractedMarkdown('第一段\n\n第二段')).toBe('第一段\n\n第二段')
	})

	it('YouTube 頁面沒有正文時改以正規化影片網址作為正文', () => {
		expect(
			normalizeExtractedMarkdown('', 'https://www.youtube.com/watch?v=aR97E7aKEgg&si=tracking'),
		).toBe('https://www.youtube.com/watch?v=aR97E7aKEgg')
	})

  it('一般影片 HTML 在截取後改成 Hyday 影片 Markdown', () => {
    expect(
      normalizeExtractedMarkdown(
        '前文\n\n<video controls><source src="https://example.com/path/xxx.mp4"></video>\n\n後文',
        'https://example.com/article',
      ),
    ).toBe('前文\n\n[xxx.mp4](https://example.com/path/xxx.mp4)\n\n後文')
  })

  it('文章裡的 YouTube iframe 轉成 canonical 裸網址', () => {
    const iframe = '<iframe src="https://www.youtube.com/embed/aR97E7aKEgg"></iframe>'
    expect(normalizeExtractedMarkdown(iframe, 'https://example.com/article')).toBe(
      'https://www.youtube.com/watch?v=aR97E7aKEgg',
    )
  })
})
