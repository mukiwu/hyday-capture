import { describe, it, expect } from 'vitest'
import {
  ASSETS_DIR,
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
  it('把遠端網址換成 vault 相對路徑', () => {
    const md = '![圖片](https://e.com/1.png)'
    const out = rewriteImageUrls(md, { 'https://e.com/1.png': 'photo-1234abcd.png' })
    expect(out).toBe(`![圖片](${ASSETS_DIR}/photo-1234abcd.png)`)
  })

  it('沒對應到的網址原樣留著，不要弄掉來源', () => {
    const md = '![a](https://e.com/1.png)\n![b](https://e.com/2.png)'
    const out = rewriteImageUrls(md, { 'https://e.com/1.png': 'x-1234abcd.png' })
    expect(out).toContain(`${ASSETS_DIR}/x-1234abcd.png`)
    expect(out).toContain('https://e.com/2.png')
  })

  it('連結包住圖片時只換內層圖片，外層連結不動', () => {
    const md = '[![圖](https://pbs.twimg.com/media/A?format=jpg)](https://x.com/a/photo/1)'
    const out = rewriteImageUrls(md, {
      'https://pbs.twimg.com/media/A?format=jpg': 'A-abcd1234.jpg',
    })
    expect(out).toBe(`[![圖](${ASSETS_DIR}/A-abcd1234.jpg)](https://x.com/a/photo/1)`)
  })

  it('圍籬裡的不改', () => {
    const md = '```md\n![a](https://e.com/1.png)\n```'
    expect(rewriteImageUrls(md, { 'https://e.com/1.png': 'x.png' })).toBe(md)
  })

  it('保留 title', () => {
    const out = rewriteImageUrls('![a](https://e.com/1.png "標題")', {
      'https://e.com/1.png': 'x-abcd1234.png',
    })
    expect(out).toBe(`![a](${ASSETS_DIR}/x-abcd1234.png "標題")`)
  })
})
