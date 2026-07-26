import { describe, it, expect } from 'vitest'
import { isSelfPermalink } from './postBoundary'

const PAGE = 'https://www.facebook.com/max.cc.lai/posts/pfbid02em2tT6'

describe('isSelfPermalink', () => {
  it('同路徑就算，查詢字串不同不影響（貼文時間戳連結會帶追蹤參數）', () => {
    expect(isSelfPermalink(`${PAGE}?__cft__[0]=AZan_2jj`, PAGE)).toBe(true)
  })

  it('相對路徑也解得出來', () => {
    expect(isSelfPermalink('/max.cc.lai/posts/pfbid02em2tT6', PAGE)).toBe(true)
  })

  it('結尾斜線不算差異', () => {
    expect(isSelfPermalink(`${PAGE}/`, PAGE)).toBe(true)
  })

  it('別人的貼文不算', () => {
    expect(isSelfPermalink('https://www.facebook.com/elct9620/posts/pfbid0KoQ3', PAGE)).toBe(false)
  })

  it('跨網域不算', () => {
    expect(isSelfPermalink('https://x.com/max.cc.lai/posts/pfbid02em2tT6', PAGE)).toBe(false)
  })

  it('純錨點與空 href 不算', () => {
    expect(isSelfPermalink('#comments', PAGE)).toBe(false)
    expect(isSelfPermalink('', PAGE)).toBe(false)
    expect(isSelfPermalink(null, PAGE)).toBe(false)
  })

  it('壞掉的 href 不會炸', () => {
    expect(isSelfPermalink('http://[not a url', PAGE)).toBe(false)
  })
})
