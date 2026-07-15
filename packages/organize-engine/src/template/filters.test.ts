import { describe, it, expect } from 'vitest'
import {
  applyFilters,
  parseFilter,
  formatDate,
  htmlToMarkdown,
} from './filters'

describe('parseFilter', () => {
  it('無參數', () => {
    expect(parseFilter('upper')).toEqual({ name: 'upper', args: [] })
  })
  it('單一帶引號參數', () => {
    expect(parseFilter('date:"YYYY-MM-DD"')).toEqual({
      name: 'date',
      args: ['YYYY-MM-DD'],
    })
  })
  it('多參數，引號內的逗號不切分', () => {
    expect(parseFilter('replace:"a,b","c"')).toEqual({
      name: 'replace',
      args: ['a,b', 'c'],
    })
  })
  it('冒號後為空視為無參數', () => {
    expect(parseFilter('date:')).toEqual({ name: 'date', args: [] })
  })
})

describe('formatDate', () => {
  it('date-only 字串不因時區漂移', () => {
    expect(formatDate('2026-07-01', 'YYYY-MM-DD')).toBe('2026-07-01')
  })
  it('帶時間的字串可只取日期', () => {
    expect(formatDate('2026-07-01T13:45:09Z', 'YYYY-MM-DD')).toBe('2026-07-01')
  })
  it('空白分隔的時間戳可格式化', () => {
    expect(formatDate('2026-07-15 09:30:05', 'YYYY-MM-DD HH:mm:ss')).toBe(
      '2026-07-15 09:30:05',
    )
  })
  it('支援月份縮寫 MMM', () => {
    expect(formatDate('2026-07-01', 'MMM DD, YYYY')).toBe('Jul 01, 2026')
  })
  it('無法解析原樣回傳', () => {
    expect(formatDate('not a date')).toBe('not a date')
  })
})

describe('htmlToMarkdown', () => {
  it('段落與粗斜體', () => {
    expect(htmlToMarkdown('<p>Hello <strong>bold</strong> and <em>it</em></p>')).toBe(
      'Hello **bold** and *it*',
    )
  })
  it('連結', () => {
    expect(htmlToMarkdown('<a href="https://x.com">link</a>')).toBe(
      '[link](https://x.com)',
    )
  })
  it('清單', () => {
    const md = htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')
    expect(md).toContain('- one')
    expect(md).toContain('- two')
  })
  it('標題', () => {
    expect(htmlToMarkdown('<h2>Title</h2>')).toBe('## Title')
  })
})

describe('applyFilters 串接', () => {
  it('左到右套用', () => {
    expect(applyFilters('  hello  ', ['trim', 'upper'])).toBe('HELLO')
  })
  it('大小寫與首字大寫', () => {
    expect(applyFilters('HELLO', ['lower', 'capitalize'])).toBe('Hello')
  })
  it('title case', () => {
    expect(applyFilters('hello world', ['title'])).toBe('Hello World')
  })
  it('default 在值為空時補上', () => {
    expect(applyFilters('', ['default:"未命名"'])).toBe('未命名')
    expect(applyFilters('有值', ['default:"未命名"'])).toBe('有值')
  })
  it('list 塑形成無序清單', () => {
    expect(applyFilters('a\nb\nc', ['list'])).toBe('- a\n- b\n- c')
  })
  it('callout 塑形，可指定型別與標題', () => {
    expect(applyFilters('內文', ['callout:"tip","重點"'])).toBe(
      '> [!tip] 重點\n> 內文',
    )
  })
  it('blockquote 每行加上引用符號', () => {
    expect(applyFilters('a\nb', ['blockquote'])).toBe('> a\n> b')
  })
  it('未知 filter 略過不炸', () => {
    expect(applyFilters('x', ['bogus'])).toBe('x')
  })
  it('date filter 串接', () => {
    expect(applyFilters('2026-07-01', ['date:"YYYY/MM/DD"'])).toBe('2026/07/01')
  })
})
