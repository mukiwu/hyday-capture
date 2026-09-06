import { describe, expect, it } from 'vitest'
import { loadMarkdownConverter } from './markdownConverter'

describe('loadMarkdownConverter', () => {
  it('取得到真正的轉換器', async () => {
    // defuddle/full 是 webpack UMD bundle，結尾把整個模組收斂成 default，
    // 所以 `import { createMarkdownContent }` 型別上成立、執行時是 undefined。
    // 這條測試守住取法，換版本改了匯出形狀會在這裡紅，而不是擷取到一半才炸
    expect(typeof (await loadMarkdownConverter())).toBe('function')
  })
})
