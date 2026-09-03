import { describe, it, expect } from 'vitest'
import { isSelfPermalink, isNavLikeContainer } from './postBoundary'

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

  it('同路徑但帶 fragment 是頁內跳轉，不算永久連結（WordPress 留言表單的取消回覆連結）', () => {
    // muki.tw 實案（2026-08-05）：/文章路徑/#respond 被誤認成自我永久連結，
    // 留言表單被標成正文容器，抽出空內容報「抽取不到正文」
    const wp = 'https://muki.tw/ai-workflows-through-constraints/'
    expect(isSelfPermalink('/ai-workflows-through-constraints/#respond', wp)).toBe(false)
    expect(isSelfPermalink(`${wp}#comments`, wp)).toBe(false)
  })

  it('壞掉的 href 不會炸', () => {
    expect(isSelfPermalink('http://[not a url', PAGE)).toBe(false)
  })
})

describe('isNavLikeContainer', () => {
  it('文字幾乎全部來自連結，判定為導覽/分頁列', () => {
    // platform.claude.com 文件頁實案：分頁列 173 字裡有 155 字來自 <a>
    expect(isNavLikeContainer(173, 155)).toBe(true)
  })

  it('文字主要是本文，即使夾雜幾個連結也不算導覽列', () => {
    expect(isNavLikeContainer(2000, 120)).toBe(false)
  })

  it('沒有文字時不算導覽列，避免除以零誤判', () => {
    expect(isNavLikeContainer(0, 0)).toBe(false)
  })

  it('剛好等於門檻比例不算超過', () => {
    expect(isNavLikeContainer(100, 80)).toBe(false)
  })
})
