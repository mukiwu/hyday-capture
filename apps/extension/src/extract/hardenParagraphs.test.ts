// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { hardenParagraphs } from './hardenParagraphs'

describe('hardenParagraphs 的還原', () => {
  it('抽取期間頁面自己重畫、標記被移走時，還原不拋錯', () => {
    // Facebook watch 頁實案（2026-10-10）：抽取是非同步的，等待期間 React 重畫把
    // 標記所在的節點換掉，還原時 insertBefore 找不到標記，整次擷取跟著失敗
    document.body.innerHTML = '<div id="post">第一段<br><br>第二段</div>'
    const restore = hardenParagraphs(document)

    document.getElementById('post')!.replaceChildren(document.createTextNode('重畫後的內容'))

    expect(() => restore()).not.toThrow()
    expect(document.getElementById('post')!.textContent).toBe('重畫後的內容')
  })

  it('頁面沒被動過時，還原回原本的 br', () => {
    document.body.innerHTML = '<div id="post">第一段<br><br>第二段</div>'
    const restore = hardenParagraphs(document)
    restore()
    expect(document.getElementById('post')!.innerHTML).toBe('第一段<br><br>第二段')
  })
})
