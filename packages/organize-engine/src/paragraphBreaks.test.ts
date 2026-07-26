import { describe, it, expect } from 'vitest'
import { PARAGRAPH_BREAK_TOKEN as T, applyParagraphBreaks } from './paragraphBreaks'

describe('applyParagraphBreaks', () => {
  it('標記換成空行分段', () => {
    expect(applyParagraphBreaks(`第一段${T}第二段`)).toBe('第一段\n\n第二段')
  })

  it('標記前後的空白一起吃掉，不留行尾空白', () => {
    expect(applyParagraphBreaks(`第一段 ${T} 第二段`)).toBe('第一段\n\n第二段')
  })

  it('turndown 的硬換行（行尾兩空白）連著標記時一起收成空行', () => {
    expect(applyParagraphBreaks(`第一段  \n${T}  \n第二段`)).toBe('第一段\n\n第二段')
  })

  it('連續多個標記只產生一個空行', () => {
    expect(applyParagraphBreaks(`第一段${T}${T}${T}第二段`)).toBe('第一段\n\n第二段')
  })

  it('頭尾的標記不留空行', () => {
    expect(applyParagraphBreaks(`${T}內容${T}`)).toBe('內容')
  })

  it('沒有標記的文字原樣不動', () => {
    const md = '# 標題\n\n段落一\n\n| a | b |\n| --- | --- |\n| 1 | 2 |'
    expect(applyParagraphBreaks(md)).toBe(md)
  })

  it('程式碼圍籬裡的內容不被動到', () => {
    const md = '```js\nconst a = 1\n\n\nconst b = 2\n```'
    expect(applyParagraphBreaks(md)).toBe(md)
  })

  it('圍籬外的三個以上換行收成空行，圍籬內不收', () => {
    const md = `一\n\n\n\n二\n\n\`\`\`\nx\n\n\n\ny\n\`\`\``
    expect(applyParagraphBreaks(md)).toBe('一\n\n二\n\n```\nx\n\n\n\ny\n```')
  })

  it('清單項之間的標記變成獨立行，讓 - 開頭真的成為清單', () => {
    const out = applyParagraphBreaks(`實際用起來：${T}- 第一項${T}- 第二項`)
    expect(out).toBe('實際用起來：\n\n- 第一項\n\n- 第二項')
  })
})
