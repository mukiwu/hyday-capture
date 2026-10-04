import { describe, it, expect } from 'vitest'
import { buildRawClipping, rawClippingFilename } from './rawClipping'
import type { ExtractedContent } from './types'

// 固定時間，讓檔名前綴與時間戳可斷言
const NOW = new Date(2026, 6, 26, 14, 32, 8)

function fixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/why-sqlite',
    domain: 'example.com',
    title: '為什麼 SQLite 不需要伺服器',
    contentMarkdown: '正文第一段\n\n正文第二段',
    ...overrides,
  }
}

/** 取 frontmatter 區塊（含頭尾 ---）與其後的本文 */
function split(markdown: string): { fm: string; body: string } {
  const m = markdown.match(/^---\n([\s\S]*?)\n---\n*([\s\S]*)$/)
  if (!m) throw new Error('沒有 frontmatter 區塊')
  return { fm: m[1] ?? '', body: m[2] ?? '' }
}

describe('rawClippingFilename', () => {
  it('檔名帶擷取時間前綴，同一天多篇排得出順序', () => {
    expect(rawClippingFilename('為什麼 SQLite 不需要伺服器', 'https://example.com/x', NOW)).toBe(
      '2026-07-26-1432 為什麼 SQLite 不需要伺服器.md',
    )
  })

  it('標題空白時退回網址衍生的名字，前綴照樣有', () => {
    const name = rawClippingFilename('   ', 'https://example.com/blog/why-sqlite', NOW)
    expect(name).toBe('2026-07-26-1432 why-sqlite.md')
  })

  // 2026-07-26 踩過：X 的 document.title 是整條推文，檔名長到 121 字
  it('標題超長時檔名收在可讀範圍，不長到整條貼文', () => {
    const long = '聊聊 QoderWake，可能是目前對 AI 數字員工這個概念落地最認真的一個產品，'.repeat(6)
    const name = rawClippingFilename(long, 'https://x.com/a/status/1', NOW)
    expect(name.length).toBeLessThanOrEqual(80)
    expect(name.startsWith('2026-07-26-1432 ')).toBe(true)
    expect(name.endsWith('.md')).toBe(true)
  })

  it('標題含路徑分隔字元時清成安全檔名', () => {
    const name = rawClippingFilename('a/b:c*d', 'https://example.com/x', NOW)
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
    expect(name.startsWith('2026-07-26-1432 ')).toBe(true)
  })
})

describe('buildRawClipping frontmatter', () => {
  // 用縮排列表不用行內陣列：hyday v2 的 noteIndex 三種形都吃，但屬性面板的
  // parseFrontmatterEntries 只認縮排列表（行內會被讀成字串），使用者 vault 既有
  // 的筆記也全是縮排列表形
  it('只帶 inbox 標籤，不下任何概念標籤，且用縮排列表形', () => {
    const { fm } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(fm).toContain('tags:\n  - inbox')
    expect(fm).not.toContain('tags: [')
  })

  it('時間用 Hyday canonical 的 dash 格式，不是點分隔也不是 ISO', () => {
    const { fm } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(fm).toContain('createdAt: "2026-07-26 14:32:08"')
    expect(fm).toContain('lastModified: "2026-07-26 14:32:08"')
  })

  it('記來源網址與網域', () => {
    const { fm } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(fm).toContain('sourceUrl: https://example.com/blog/why-sqlite')
    expect(fm).toContain('sourceDomain: example.com')
  })

  // 2026-07-26 踩過：X 的分頁標題帶未讀計數，落檔變成「(21) X 上的 老鬼：...」
  it('標題去掉瀏覽器分頁的未讀計數前綴', () => {
    const extracted = fixture({ title: '(21) X 上的 老鬼：「聊聊 QoderWake」' })
    const out = buildRawClipping({ extracted, now: NOW })
    expect(split(out.markdown).fm).toContain('title: X 上的 老鬼：「聊聊 QoderWake」')
    expect(out.filename).toBe('2026-07-26-1432 X 上的 老鬼：「聊聊 QoderWake」.md')
  })

  // 社群貼文的分頁標題就是整篇內容，看得出是哪一則就夠，完整內容在正文裡；
  // Hyday 整理那一步會再給它一個像樣的標題
  it('標題超過 60 字就截斷加省略號', () => {
    const long = '聊'.repeat(200)
    const { fm } = split(buildRawClipping({ extracted: fixture({ title: long }), now: NOW }).markdown)
    const line = fm.split('\n').find((l) => l.startsWith('title:')) ?? ''
    const value = line.slice('title: '.length)
    expect(value.length).toBe(60)
    expect(value.endsWith('…')).toBe(true)
  })

  it('60 字以內的標題原樣不動', () => {
    const title = '聊'.repeat(60)
    const { fm } = split(buildRawClipping({ extracted: fixture({ title }), now: NOW }).markdown)
    expect(fm).toContain(`title: ${title}`)
    expect(fm).not.toContain('…')
  })

  it('檔名不帶省略號，走自己的長度上限', () => {
    const out = buildRawClipping({ extracted: fixture({ title: '聊'.repeat(200) }), now: NOW })
    expect(out.filename).not.toContain('…')
  })

  it('標題裡真正的括號數字不被誤刪', () => {
    const extracted = fixture({ title: '(2026) 年度回顧' })
    const { fm } = split(buildRawClipping({ extracted, now: NOW }).markdown)
    expect(fm).toContain('title: (2026) 年度回顧')
  })

  it('不寫 createdBy，那個欄位 Hyday 從來沒讀過', () => {
    const { fm } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(fm).not.toContain('createdBy')
  })

  it('抓得到作者與發佈日就記，發佈日正規化成 YYYY-MM-DD', () => {
    const extracted = fixture({ author: 'Richard Hipp', published: '2026-03-11T08:00:00.000Z' })
    const { fm } = split(buildRawClipping({ extracted, now: NOW }).markdown)
    expect(fm).toContain('author: Richard Hipp')
    expect(fm).toMatch(/publishedAt: "2026-03-\d{2}"/)
  })

  it('發佈日解析不出來就照原樣留著，不丟資訊', () => {
    const extracted = fixture({ published: '民國一百年春' })
    const { fm } = split(buildRawClipping({ extracted, now: NOW }).markdown)
    expect(fm).toContain('publishedAt: 民國一百年春')
  })

  it('抓不到作者與發佈日就不寫那兩行', () => {
    const { fm } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(fm).not.toContain('author:')
    expect(fm).not.toContain('publishedAt:')
  })
})

describe('buildRawClipping 筆記類型', () => {
  it('整頁擷取是 article', () => {
    const { fm } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(fm).toContain('type: article')
  })

  it('只擷取選取段落是 card', () => {
    const out = buildRawClipping({ extracted: fixture(), now: NOW, selectionOnly: true })
    expect(split(out.markdown).fm).toContain('type: card')
  })

	it('圖片頁是 img', () => {
		const extracted = fixture({ url: 'https://example.com/a/photo.png' })
		const { fm } = split(buildRawClipping({ extracted, now: NOW }).markdown)
		expect(fm).toContain('type: img')
	})

	it('影音頁在原料階段先視為 article，交由 hyday app 後續整理', () => {
		const extracted = fixture({ url: 'https://www.youtube.com/watch?v=abc' })
		const { fm } = split(buildRawClipping({ extracted, now: NOW }).markdown)
		expect(fm).toContain('type: article')
	})

	it('YouTube 擷取產出 video，保留描述並把時間戳轉成可點連結', () => {
		const extracted = fixture({
			url: 'https://www.youtube.com/watch?v=aR97E7aKEgg&si=tracking',
			contentMarkdown: 'YouTube 原文、留言或推薦內容不應落地',
			description: '📌 時間戳\n0:00 開場\n1:24 重點',
		})
		const out = buildRawClipping({ extracted, now: NOW })
		const { fm, body } = split(out.markdown)

		expect(fm).toContain('type: video')
		expect(fm).toContain('sourceUrl: https://www.youtube.com/watch?v=aR97E7aKEgg')
		expect(body.trim()).toBe(
			'https://www.youtube.com/watch?v=aR97E7aKEgg\n\n📌 時間戳\n[0:00](https://www.youtube.com/watch?v=aR97E7aKEgg&t=0) 開場\n[1:24](https://www.youtube.com/watch?v=aR97E7aKEgg&t=84) 重點',
		)
		expect(body).not.toContain('YouTube 原文')
	})

  it('YouTube 有字幕章節時，描述後面附上可點的章節大綱', () => {
    const extracted = fixture({
      url: 'https://www.youtube.com/watch?v=aR97E7aKEgg',
      description: '📌 時間戳\n0:00 開場',
      transcriptMarkdown: [
        '## Transcript',
        '',
        '### 開場白',
        '',
        '**0:04** · 哈囉。',
        '',
        '### 進入正題',
        '',
        '**1:07** · 我們開始吧。',
        '',
      ].join('\n'),
    })
    const { body } = split(buildRawClipping({ extracted, now: NOW }).markdown)

    expect(body.trim()).toBe(
      [
        'https://www.youtube.com/watch?v=aR97E7aKEgg',
        '',
        '📌 時間戳',
        '[0:00](https://www.youtube.com/watch?v=aR97E7aKEgg&t=0) 開場',
        '',
        '## 章節',
        '',
        '- [0:04](https://www.youtube.com/watch?v=aR97E7aKEgg&t=4) 開場白',
        '- [1:07](https://www.youtube.com/watch?v=aR97E7aKEgg&t=67) 進入正題',
      ].join('\n'),
    )
  })

  it('在 YouTube 頁面只擷取選取內容時，不因帶著字幕資料而出錯', () => {
    const extracted = fixture({
      url: 'https://www.youtube.com/watch?v=aR97E7aKEgg',
      contentMarkdown: '我選取的那一段話',
      transcriptMarkdown: '### 開場白\n\n**0:04** · 哈囉。\n',
    })
    const { body } = split(
      buildRawClipping({ extracted, now: NOW, selectionOnly: true }).markdown,
    )

    expect(body.trim()).toBe('我選取的那一段話')
  })

  it('選取擷取的型別壓過網址啟發式', () => {
    const extracted = fixture({ url: 'https://example.com/a/photo.png' })
    const out = buildRawClipping({ extracted, now: NOW, selectionOnly: true })
    expect(split(out.markdown).fm).toContain('type: card')
  })
})

describe('buildRawClipping 本文', () => {
  it('本文就是抽好的正文，不重複放標題當 H1', () => {
    const { body } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(body.trim()).toBe('正文第一段\n\n正文第二段')
    expect(body).not.toContain('# 為什麼 SQLite')
  })

  it('有隨手一句話就放在正文最前面的引言', () => {
    const out = buildRawClipping({
      extracted: fixture(),
      now: NOW,
      userNote: '這篇的第三節可以拿去講 vault 設計',
    })
    const { body } = split(out.markdown)
    expect(body.startsWith('> 這篇的第三節可以拿去講 vault 設計\n')).toBe(true)
    expect(body).toContain('正文第一段')
  })

  it('隨手一句話含換行時每行都當引言，不破壞 markdown', () => {
    const out = buildRawClipping({ extracted: fixture(), now: NOW, userNote: '第一行\n第二行' })
    const { body } = split(out.markdown)
    expect(body.startsWith('> 第一行\n> 第二行\n')).toBe(true)
  })

  it('沒打隨手一句話就沒有引言區塊', () => {
    const { body } = split(buildRawClipping({ extracted: fixture(), now: NOW }).markdown)
    expect(body.startsWith('>')).toBe(false)
  })

  it('只有空白的隨手一句話視同沒打', () => {
    const out = buildRawClipping({ extracted: fixture(), now: NOW, userNote: '   \n  ' })
    expect(split(out.markdown).body.startsWith('>')).toBe(false)
  })

  it('正文空白時仍產出合法檔案，不留一堆空行', () => {
    const out = buildRawClipping({ extracted: fixture({ contentMarkdown: '' }), now: NOW })
    expect(out.markdown.endsWith('\n')).toBe(true)
    expect(out.markdown).not.toMatch(/\n{3,}$/)
  })
})
