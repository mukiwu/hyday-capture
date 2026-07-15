import { describe, it, expect } from 'vitest'
import { safeFileStem, appendCollisionSuffix } from './filename'

describe('safeFileStem', () => {
  it('去掉檔案系統不安全字元，保留連字號', () => {
    const stem = safeFileStem('state-of-the-art: a/b?c', 'https://example.com')
    expect(stem).not.toMatch(/[\\/:*?"<>|]/)
    expect(stem).toContain('state-of-the-art')
  })

  it('標題為空時退回網址推出的主幹', () => {
    expect(safeFileStem('   ', 'https://example.com/blog/my-post')).toBe('my-post')
  })

  it('純日期樣式加後綴，不落成 journal 檔名', () => {
    expect(safeFileStem('2026-07-15', 'https://example.com')).not.toMatch(
      /^\d{4}[-.]\d{2}[-.]\d{2}$/,
    )
  })

  it('過長標題會截斷', () => {
    const long = 'x'.repeat(300)
    expect(safeFileStem(long, 'https://example.com').length).toBeLessThanOrEqual(120)
  })
})

describe('appendCollisionSuffix', () => {
  const at = new Date(2026, 6, 15, 9, 30, 5)

  it('在副檔名前插入時間戳後綴，保留副檔名', () => {
    const out = appendCollisionSuffix('My Note.md', at)
    expect(out).toBe('My Note 20260715-093005.md')
  })

  it('沒有副檔名時直接接在後面', () => {
    expect(appendCollisionSuffix('README', at)).toBe('README 20260715-093005')
  })

  it('標題本身含點時，只在最後一個點前插入', () => {
    const out = appendCollisionSuffix('v1.2 spec.md', at)
    expect(out).toBe('v1.2 spec 20260715-093005.md')
  })

  it('後綴讓連續兩次擷取不同名，不會互相覆蓋', () => {
    expect(appendCollisionSuffix('A.md', at)).not.toBe('A.md')
  })
})
