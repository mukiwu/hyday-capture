import { describe, it, expect } from 'vitest'
import {
  selectTemplate,
  renderTemplate,
  interpolate,
  collectSelectorRefs,
} from './render'
import type { Template } from './types'
import type { ExtractedContent } from '../types'

const now = new Date(2026, 6, 15, 9, 30, 5) // 2026-07-15 09:30:05 本地

function extractedFixture(overrides: Partial<ExtractedContent> = {}): ExtractedContent {
  return {
    url: 'https://example.com/blog/hello',
    domain: 'example.com',
    title: 'Hello World',
    contentMarkdown: '正文一\n\n正文二',
    author: 'MUKi',
    published: '2026-07-01',
    description: '描述',
    image: 'https://example.com/cover.png',
    ...overrides,
  }
}

function tpl(overrides: Partial<Template> = {}): Template {
  return {
    name: 'default',
    properties: [],
    body: '',
    ...overrides,
  }
}

describe('selectTemplate（trigger 比對）', () => {
  const a = tpl({ name: 'A', triggers: [{ type: 'urlPrefix', value: 'https://threads.net' }] })
  const b = tpl({ name: 'B', triggers: [{ type: 'regex', value: 'youtube\\.com/watch' }] })
  const c = tpl({ name: 'C', triggers: [{ type: 'schemaOrg', value: 'Recipe' }] })
  const def = tpl({ name: 'Default' })

  it('網址前綴命中', () => {
    const picked = selectTemplate([def, a, b, c], { url: 'https://threads.net/@x/post/1' })
    expect(picked?.name).toBe('A')
  })

  it('正規表達式命中', () => {
    const picked = selectTemplate([def, a, b, c], {
      url: 'https://www.youtube.com/watch?v=abc',
    })
    expect(picked?.name).toBe('B')
  })

  it('schema.org 型別命中，大小寫不敏感', () => {
    const picked = selectTemplate([def, a, b, c], {
      url: 'https://cook.example.com/x',
      schemaOrgTypes: ['recipe'],
    })
    expect(picked?.name).toBe('C')
  })

  it('第一個命中的勝出（依清單順序）', () => {
    const first = tpl({ name: 'first', triggers: [{ type: 'urlPrefix', value: 'https://' }] })
    const second = tpl({ name: 'second', triggers: [{ type: 'urlPrefix', value: 'https://example' }] })
    const picked = selectTemplate([first, second], { url: 'https://example.com/x' })
    expect(picked?.name).toBe('first')
  })

  it('皆不中則用最上面那組當預設', () => {
    const picked = selectTemplate([def, a, b], { url: 'https://nowhere.test/x' })
    expect(picked?.name).toBe('Default')
  })

  it('壞掉的正規表達式當不命中，不炸掉', () => {
    const bad = tpl({ name: 'bad', triggers: [{ type: 'regex', value: '(' }] })
    const picked = selectTemplate([def, bad], { url: 'https://x.test' })
    expect(picked?.name).toBe('Default')
  })

  it('清單為空回 undefined', () => {
    expect(selectTemplate([], { url: 'https://x.test' })).toBeUndefined()
  })
})

describe('interpolate（變數代入）', () => {
  const extracted = extractedFixture({
    meta: { 'og:title': 'OG 標題' },
    selectors: { '.price': '$42' },
    selectorsHtml: { '.card': '<p>卡片 <strong>粗</strong></p>' },
  })
  const ctx = { extracted, now, noteType: 'article' as const }

  it('頁面基本變數', () => {
    expect(interpolate('{{title}} / {{author}} / {{domain}}', ctx)).toBe(
      'Hello World / MUKi / example.com',
    )
  })
  it('url 與 content', () => {
    expect(interpolate('{{url}}', ctx)).toBe('https://example.com/blog/hello')
    expect(interpolate('{{content}}', ctx)).toContain('正文一')
  })
  it('date 變數代入擷取時間', () => {
    expect(interpolate('{{date}}', ctx)).toBe('2026-07-15 09:30:05')
  })
  it('type 變數', () => {
    expect(interpolate('{{type}}', ctx)).toBe('article')
  })
  it('meta 取值，key 可含冒號', () => {
    expect(interpolate('{{meta:og:title}}', ctx)).toBe('OG 標題')
  })
  it('CSS selector 純文字取值', () => {
    expect(interpolate('{{selector:.price}}', ctx)).toBe('$42')
  })
  it('CSS selector HTML 取值可再接 markdown filter', () => {
    expect(interpolate('{{selectorHtml:.card|markdown}}', ctx)).toBe('卡片 **粗**')
  })
  it('未知變數代成空字串', () => {
    expect(interpolate('[{{nope}}]', ctx)).toBe('[]')
  })
  it('缺值的可選欄位代成空字串，可用 default 補', () => {
    const bare = { extracted: extractedFixture({ author: undefined }), now, noteType: 'article' as const }
    expect(interpolate('{{author|default:"匿名"}}', bare)).toBe('匿名')
  })
  it('變數可接 filter 串', () => {
    expect(interpolate('{{published|date:"YYYY/MM/DD"}}', ctx)).toBe('2026/07/01')
  })
})

describe('renderTemplate（frontmatter 產生與 body）', () => {
  it('properties 依型別序列化成型別正確的 YAML', () => {
    const template = tpl({
      properties: [
        { name: 'title', value: '{{title}}', type: 'text' },
        { name: 'type', value: '{{type}}', type: 'text' },
        { name: 'createdAt', value: '{{date}}', type: 'datetime' },
        { name: 'published', value: '{{published}}', type: 'date' },
        { name: 'wordy', value: '42', type: 'number' },
        { name: 'featured', value: 'true', type: 'boolean' },
        { name: 'tags', value: 'ai\nnote', type: 'list' },
        { name: 'source', value: '{{url}}', type: 'text' },
      ],
      body: '# {{title}}\n\n{{content}}',
    })
    const md = renderTemplate(template, { extracted: extractedFixture(), now })

    expect(md.startsWith('---\n')).toBe(true)
    expect(md).toContain('title: Hello World')
    expect(md).toContain('type: article')
    expect(md).toContain('createdAt: 2026-07-15 09:30:05')
    expect(md).toContain('published: 2026-07-01')
    // 時間戳與網址不被引號包住
    expect(md).not.toContain('"2026-07-15 09:30:05"')
    expect(md).toContain('source: https://example.com/blog/hello')
    // number 是純量不加引號
    expect(md).toContain('wordy: 42')
    expect(md).not.toContain('wordy: "42"')
    // boolean 是純量
    expect(md).toContain('featured: true')
    expect(md).not.toContain('featured: "true"')
    // list 走行內陣列
    expect(md).toContain('tags: [ai, note]')
    // body 有代入
    expect(md).toContain('# Hello World')
    expect(md).toContain('正文一')
  })

  it('標題含 YAML 特殊字元時值加引號（重用 yamlScalar）', () => {
    const template = tpl({
      properties: [{ name: 'title', value: '{{title}}', type: 'text' }],
      body: '{{content}}',
    })
    const md = renderTemplate(template, {
      extracted: extractedFixture({ title: 'Breaking: something #big' }),
      now,
    })
    expect(md).toContain('title: "Breaking: something #big"')
  })

  it('改模板 body，輸出隨之改變', () => {
    const extracted = extractedFixture()
    const a = renderTemplate(tpl({ body: '模板 A：{{title}}' }), { extracted, now })
    const b = renderTemplate(tpl({ body: '模板 B：{{domain}}' }), { extracted, now })
    expect(a).toContain('模板 A：Hello World')
    expect(b).toContain('模板 B：example.com')
    expect(a).not.toBe(b)
  })

  it('noteType 可由模板覆蓋', () => {
    const template = tpl({
      noteType: 'video',
      properties: [{ name: 'type', value: '{{type}}', type: 'text' }],
      body: '',
    })
    const md = renderTemplate(template, { extracted: extractedFixture(), now })
    expect(md).toContain('type: video')
  })
})

describe('collectSelectorRefs', () => {
  it('掃出 body 與 property 裡引用的 selector', () => {
    const t = tpl({
      properties: [{ name: 'price', value: '{{selector:.price}}', type: 'text' }],
      body: '{{selectorHtml:.card|markdown}} 與 {{selector:.author}}',
    })
    const refs = collectSelectorRefs([t])
    expect(refs.selectors.sort()).toEqual(['.author', '.price'])
    expect(refs.selectorsHtml).toEqual(['.card'])
  })

  it('沒有 selector 引用時回空', () => {
    const refs = collectSelectorRefs([tpl({ body: '{{title}}' })])
    expect(refs).toEqual({ selectors: [], selectorsHtml: [] })
  })
})
