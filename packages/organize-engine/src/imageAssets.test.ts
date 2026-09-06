import { describe, it, expect } from 'vitest'
import {
  assetFileName,
  extensionForContentType,
  findRemoteImageUrls,
  rewriteImageUrls,
  unwrapLinkedImages,
} from './imageAssets'

describe('findRemoteImageUrls', () => {
  it('撈出 markdown 圖片語法裡的 http 網址', () => {
    const md = '前文\n\n![圖片](https://cdn.example.com/a/photo.png)\n\n後文'
    expect(findRemoteImageUrls(md)).toEqual(['https://cdn.example.com/a/photo.png'])
  })

  it('圖片被連結包住也撈得到（社群平台常見形狀）', () => {
    const md = '[![圖片](https://pbs.twimg.com/media/ABC?format=jpg)](https://x.com/a/photo/1)'
    expect(findRemoteImageUrls(md)).toEqual(['https://pbs.twimg.com/media/ABC?format=jpg'])
  })

  it('帶 title 與角括號的寫法都收', () => {
    const md = '![a](<https://e.com/1.png> "標題")\n![b](https://e.com/2.png "標題")'
    expect(findRemoteImageUrls(md)).toEqual(['https://e.com/1.png', 'https://e.com/2.png'])
  })

  it('檔名帶括號的網址不會被切一半', () => {
    // Notion 實案（2026-09-06）：檔名是 01.滿版字卡(ch1,3).jpg，網址中段就帶著括號。
    // 正則在第一個右括號截斷，抓到半截網址、下載必然失敗，圖片就留在遠端。
    // CommonMark 本來就允許 link destination 帶成對的括號
    const url = 'https://app.notion.com/image/attachment%3A2982633b%3A01.card(ch13).jpg?table=block'
    expect(findRemoteImageUrls(`![字卡](${url})`)).toEqual([url])
  })

  it('角括號寫法裡的括號也完整收得到', () => {
    const url = 'https://e.com/photo(2026).png'
    expect(findRemoteImageUrls(`![a](<${url}>)`)).toEqual([url])
  })

  it('重複網址只回一次', () => {
    const md = '![a](https://e.com/1.png)\n![b](https://e.com/1.png)'
    expect(findRemoteImageUrls(md)).toEqual(['https://e.com/1.png'])
  })

  it('data URI、相對路徑、已在 assets 的都不算遠端', () => {
    const md = [
      '![a](data:image/png;base64,AAA)',
      '![b](assets/local.png)',
      '![c](./assets/local2.png)',
      '![d](/relative.png)',
    ].join('\n')
    expect(findRemoteImageUrls(md)).toEqual([])
  })

  it('程式碼圍籬裡的圖片語法不算', () => {
    const md = '```md\n![a](https://e.com/1.png)\n```\n\n![b](https://e.com/2.png)'
    expect(findRemoteImageUrls(md)).toEqual(['https://e.com/2.png'])
  })

  it('純連結（非圖片）不算', () => {
    expect(findRemoteImageUrls('[連結](https://e.com/page.png)')).toEqual([])
  })
})

describe('extensionForContentType', () => {
  it('對應到 Hyday 白名單內的副檔名', () => {
    expect(extensionForContentType('image/jpeg')).toBe('jpg')
    expect(extensionForContentType('image/png; charset=binary')).toBe('png')
    expect(extensionForContentType('image/svg+xml')).toBe('svg')
  })

  it('白名單外的型別回 null，寧可不存也不要存成 Hyday 供不了的檔', () => {
    expect(extensionForContentType('image/tiff')).toBeNull()
    expect(extensionForContentType('text/html')).toBeNull()
    expect(extensionForContentType(undefined)).toBeNull()
  })
})

describe('assetFileName', () => {
  it('用網址最後一段當名字，副檔名合法就沿用', () => {
    const name = assetFileName('https://cdn.example.com/a/photo.png')
    expect(name).toMatch(/^photo-[0-9a-f]{8}\.png$/)
  })

  it('網址沒有副檔名時吃 content-type', () => {
    const name = assetFileName('https://pbs.twimg.com/media/HIsTuFUbkAAJfNR', 'image/jpeg')
    expect(name).toMatch(/^HIsTuFUbkAAJfNR-[0-9a-f]{8}\.jpg$/)
  })

  it('查詢字串不進檔名', () => {
    const name = assetFileName('https://pbs.twimg.com/media/ABC?format=jpg&name=small', 'image/jpeg')
    expect(name).not.toContain('?')
    expect(name).not.toContain('format')
  })

  it('同網址永遠得到同檔名，重抓不會多存一份', () => {
    const url = 'https://e.com/a/photo.png'
    expect(assetFileName(url)).toBe(assetFileName(url))
  })

  it('不同網址但同檔名不會互相蓋掉', () => {
    const a = assetFileName('https://a.com/photo.png')
    const b = assetFileName('https://b.com/photo.png')
    expect(a).not.toBe(b)
  })

  it('判不出合法副檔名就回 null', () => {
    expect(assetFileName('https://e.com/a/thing', 'image/tiff')).toBeNull()
    expect(assetFileName('https://e.com/a/thing')).toBeNull()
  })

  // 2026-07-26 踩過：Substack 走 CDN 轉檔，網址最後一段是整個 URL-encode 過的原始網址，
  // 直接拿來當檔名會得到 https%3A%2F%2Fsubstack-post-media.s3.ama-xxxx.png
  it('CDN 轉檔網址（最後一段是編碼過的網址）取到真正的檔名', () => {
    const url =
      'https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fcover.png'
    const name = assetFileName(url)
    expect(name).toMatch(/^cover-[0-9a-f]{8}\.png$/)
  })

  it('編碼過的內層網址沒有合法副檔名時退回 content-type', () => {
    const url =
      'https://cdn.example.com/fetch/https%3A%2F%2Fmedia.example.com%2Fpublic%2Fimages%2Fabc'
    expect(assetFileName(url, 'image/webp')).toMatch(/^abc-[0-9a-f]{8}\.webp$/)
  })

  it('最後一段帶命名空間前綴時只取冒號後那截當名字', () => {
    // Notion 實案（2026-09-06）：附件網址解到底是 attachment:<uuid>:01.滿版字卡(ch13).jpg，
    // uuid 就把 40 字元的名字吃滿，落檔是 attachment-2982633b-e0c1-4cdc-ad75-d825b-xxxx.jpg，
    // 看不出是哪張圖。冒號本來就是檔名的非法字元，它前面那段幾乎一定是命名空間不是名字
    const url =
      'https://app.notion.com/image/attachment%3A2982633b-e0c1-4cdc-ad75-d825b070f77b%3A01.%E6%BB%BF%E7%89%88%E5%AD%97%E5%8D%A1(ch13).jpg?table=block&width=1410'
    expect(assetFileName(url)).toMatch(/^01\.滿版字卡-ch13-[0-9a-f]{8}\.jpg$/)
  })

  it('冒號後那截沒有副檔名時照樣退回 content-type', () => {
    expect(assetFileName('https://cdn.example.com/image:12345', 'image/png')).toMatch(
      /^12345-[0-9a-f]{8}\.png$/,
    )
  })

  it('沒有冒號的一般網址取名方式完全不變', () => {
    expect(assetFileName('https://cdn.example.com/2026/08/cover-final.png')).toMatch(
      /^cover-final-[0-9a-f]{8}\.png$/,
    )
  })

  it('括號也換掉，Markdown 的連結語法認它當界定符', () => {
    // 檔名唯一的用途是被 ![]() 引用，路徑裡的 ) 很多解析器會當成連結結尾，
    // 後面的字元變成普通文字、圖就壞了。跟空格換成 - 是同一個理由
    const name = assetFileName('https://e.com/a/photo(2026).png')
    expect(name).not.toMatch(/[()]/)
    expect(name).toMatch(/^photo-2026-[0-9a-f]{8}\.png$/)
  })

  it('檔名有不安全字元時清掉', () => {
    const name = assetFileName('https://e.com/a/a:b*c.png')
    expect(name).not.toMatch(/[\\/:*?"<>|]/)
  })
})

describe('unwrapLinkedImages', () => {
  // 2026-07-26 踩過：FB／X 的圖片外面包一層照片檢視頁的連結，Hyday 讀進去會變成
  // p > a > img，而 img 在 Plate 是 block 元素、塞在 inline 連結裡渲染不出來，畫面空白
  it('圖片外層只有連結時把連結拆掉', () => {
    const md = '[![圖片](https://cdn.e.com/a.jpg)](https://www.facebook.com/photo/?fbid=123)'
    expect(unwrapLinkedImages(md)).toBe('![圖片](https://cdn.e.com/a.jpg)')
  })

  it('外層連結網址含中括號（FB 的追蹤參數）也拆得掉', () => {
    const md = '[![](assets/a.jpg)](https://www.facebook.com/photo/?fbid=1&__cft__[0]=AZbBmn_eMW)'
    expect(unwrapLinkedImages(md)).toBe('![](assets/a.jpg)')
  })

  it('一個連結包多張圖時全部拆出來', () => {
    const md = '[![](a.jpg) ![頭像](b.jpg)](https://e.com/story/1)'
    expect(unwrapLinkedImages(md)).toBe('![](a.jpg) ![頭像](b.jpg)')
  })

  it('連結裡除了圖還有文字就不動，那是有意義的連結', () => {
    const md = '[![](a.jpg) 看照片](https://e.com/1)'
    expect(unwrapLinkedImages(md)).toBe(md)
  })

  it('沒被連結包住的圖片不動', () => {
    expect(unwrapLinkedImages('![a](x.jpg)')).toBe('![a](x.jpg)')
  })

  it('純文字連結不動', () => {
    expect(unwrapLinkedImages('[看這裡](https://e.com/1)')).toBe('[看這裡](https://e.com/1)')
  })

  it('圍籬裡的不動', () => {
    const md = '```md\n[![](a.jpg)](https://e.com/1)\n```'
    expect(unwrapLinkedImages(md)).toBe(md)
  })
})

describe('rewriteImageUrls', () => {
  it('把遠端網址換成 Hyday vault 資產路徑', () => {
    const md = '![圖片](https://e.com/1.png)'
    const out = rewriteImageUrls(md, { 'https://e.com/1.png': 'photo-1234abcd.png' })
    expect(out).toBe('![圖片](assets/photo-1234abcd.png)')
  })

  it('沒對應到的網址原樣留著，不要弄掉來源', () => {
    const md = '![a](https://e.com/1.png)\n![b](https://e.com/2.png)'
    const out = rewriteImageUrls(md, { 'https://e.com/1.png': 'x-1234abcd.png' })
    expect(out).toContain('assets/x-1234abcd.png')
    expect(out).toContain('https://e.com/2.png')
  })

  it('連結包住圖片時只換內層圖片，外層連結不動', () => {
    const md = '[![圖](https://pbs.twimg.com/media/A?format=jpg)](https://x.com/a/photo/1)'
    const out = rewriteImageUrls(md, {
      'https://pbs.twimg.com/media/A?format=jpg': 'A-abcd1234.jpg',
    })
    expect(out).toBe('[![圖](assets/A-abcd1234.jpg)](https://x.com/a/photo/1)')
  })

  it('圍籬裡的不改', () => {
    const md = '```md\n![a](https://e.com/1.png)\n```'
    expect(rewriteImageUrls(md, { 'https://e.com/1.png': 'x.png' })).toBe(md)
  })

  it('保留 title', () => {
    const out = rewriteImageUrls('![a](https://e.com/1.png "標題")', {
      'https://e.com/1.png': 'x-abcd1234.png',
    })
    expect(out).toBe('![a](assets/x-abcd1234.png "標題")')
  })
})
