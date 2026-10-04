import { describe, it, expect, vi } from 'vitest'
import { parseWithBoundaryFallback } from './boundaryFallback'

const result = (content: string | null) => ({ content })

describe('parseWithBoundaryFallback', () => {
  it('沒有邊界 selector 時只抽一次，不帶 selector', async () => {
    const parse = vi.fn().mockReturnValue(result('正文'))
    const r = await parseWithBoundaryFallback(undefined, parse)
    expect(r.content).toBe('正文')
    expect(parse).toHaveBeenCalledTimes(1)
    expect(parse).toHaveBeenCalledWith(undefined)
  })

  it('邊界容器抽得到內容就用它，不重抽', async () => {
    const parse = vi.fn().mockReturnValue(result('貼文本體'))
    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)
    expect(r.content).toBe('貼文本體')
    expect(parse).toHaveBeenCalledTimes(1)
    expect(parse).toHaveBeenCalledWith('[data-hyday-content]')
  })

  it('邊界容器抽出空內容時，退回不帶 selector 的原生抽取（誤標不能讓擷取失敗）', async () => {
    // muki.tw 實案（2026-08-05）：留言表單被誤標成正文容器，抽出空字串。
    // 安全網的不變量：邊界標記只能讓結果變好，最壞退回原生抽取，不能變成失敗
    const parse = vi
      .fn()
      .mockReturnValueOnce(result(''))
      .mockReturnValueOnce(result('全文'))
    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)
    expect(r.content).toBe('全文')
    expect(parse).toHaveBeenNthCalledWith(1, '[data-hyday-content]')
    expect(parse).toHaveBeenNthCalledWith(2, undefined)
  })

  it('空白也算空內容', async () => {
    const parse = vi
      .fn()
      .mockReturnValueOnce(result('  \n\t '))
      .mockReturnValueOnce(result('全文'))
    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)
    expect(r.content).toBe('全文')
  })

  it('帶 selector 抽取拋錯時，退回原生抽取而不是直接失敗', async () => {
    const parse = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('selector 抽取炸了')
      })
      .mockReturnValueOnce(result('全文'))
    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)
    expect(r.content).toBe('全文')
  })

  it('兩次都空就回傳原生抽取的結果，讓上層照原本邏輯報抽取失敗', async () => {
    const parse = vi.fn().mockReturnValue(result(''))
    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)
    expect(r.content).toBe('')
    expect(parse).toHaveBeenCalledTimes(2)
  })
})

describe('parseWithBoundaryFallback（非同步抽取）', () => {
  // Defuddle 的 YouTube 字幕只有 parseAsync 拿得到，抽取因此整條改成非同步。
  // 安全網的不變量不能因為換成 Promise 就失效：reject 不會被同步 try/catch 接住
  it('非同步抽取在邊界容器拿到內容時就用它，不重抽', async () => {
    const parse = vi
      .fn()
      .mockResolvedValueOnce(result('貼文本體'))
      .mockResolvedValueOnce(result('整片動態消息'))

    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)

    expect(r.content).toBe('貼文本體')
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it('非同步抽取 reject 時，退回不帶 selector 的原生抽取', async () => {
    const parse = vi
      .fn()
      .mockRejectedValueOnce(new Error('selector 抽取炸了'))
      .mockResolvedValueOnce(result('全文'))

    const r = await parseWithBoundaryFallback('[data-hyday-content]', parse)

    expect(r.content).toBe('全文')
    expect(parse).toHaveBeenNthCalledWith(1, '[data-hyday-content]')
    expect(parse).toHaveBeenNthCalledWith(2, undefined)
  })
})
