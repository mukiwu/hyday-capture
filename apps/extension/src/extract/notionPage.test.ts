import { describe, expect, it, vi } from 'vitest'
import {
  attachmentIdFrom,
  isNotionUrl,
  isUsableNotionHtml,
  notionTitleFrom,
  calloutsToBlockquotes,
  resolveAttachmentImages,
  stripNotionIcons,
  unlinkAttachments,
  withNotionFallback,
} from './notionPage'

describe('isNotionUrl', () => {
  it('認得 Notion 會出現的幾個網域', () => {
    expect(isNotionUrl('https://app.notion.com/p/raymondhouch/01-161e6e226632')).toBe(true)
    expect(isNotionUrl('https://www.notion.so/Page-abc123')).toBe(true)
    expect(isNotionUrl('https://notion.so/abc123')).toBe(true)
    expect(isNotionUrl('https://muki.notion.site/Page-abc123')).toBe(true)
  })

  it('不是 Notion 的站就不走這條路', () => {
    expect(isNotionUrl('https://muki.tw/notion-tips/')).toBe(false)
    expect(isNotionUrl('https://www.youtube.com/watch?v=aR97E7aKEgg')).toBe(false)
  })

  it('拿網域當前綴的釣魚網址不算', () => {
    expect(isNotionUrl('https://notion.so.evil.com/page')).toBe(false)
    expect(isNotionUrl('https://fakenotion.so/page')).toBe(false)
  })

  it('壞掉的網址不會炸', () => {
    expect(isNotionUrl('http://[not a url')).toBe(false)
    expect(isNotionUrl('')).toBe(false)
  })
})

describe('attachmentIdFrom', () => {
  // 2026-09-05 實測：剪貼簿 HTML 的 img 是 attachment: 內部協定，
  // 同一張圖在頁面 DOM 裡是 app.notion.com/image/ 的 proxy 網址，
  // 兩邊都認得出同一個 id，才配得回可下載的網址
  const ID = 'a0dc42cd-6080-4832-b43c-e52dcc17793e'
  const FROM_CLIPBOARD = `attachment:${ID}:lifehacker_divider.png`

  it('認得剪貼簿那份的 attachment 協定', () => {
    expect(attachmentIdFrom(FROM_CLIPBOARD)).toBe(ID)
  })

  it('認得 DOM 裡包了一層編碼的 proxy 網址', () => {
    const src = `https://app.notion.com/image/attachment%3A${ID}%3Alifehacker_divider.png?table=block&width=1420`
    expect(attachmentIdFrom(src)).toBe(ID)
  })

  it('proxy 網址把 S3 網址整個包進路徑時，再往內解一層也認得', () => {
    const inner = `https%3A%2F%2Fs3-us-west-2.amazonaws.com%2Fpublic.notion-static.com%2Fattachment%253A${ID}%253Alifehacker_divider.png`
    expect(attachmentIdFrom(`https://app.notion.com/image/${inner}?table=block`)).toBe(ID)
  })

  it('兩邊抽出來的 id 相同，圖片才配得起來', () => {
    const fromDom = `https://app.notion.com/image/attachment%3A${ID}%3Alifehacker_divider.png?table=block`
    expect(attachmentIdFrom(FROM_CLIPBOARD)).toBe(attachmentIdFrom(fromDom))
  })

  it('一般圖片網址沒有 attachment id', () => {
    expect(attachmentIdFrom('https://muki.tw/wp-content/uploads/2026/01/cover.jpg')).toBeUndefined()
    expect(attachmentIdFrom('')).toBeUndefined()
  })

  it('壞掉的百分號編碼不會炸', () => {
    expect(attachmentIdFrom('https://app.notion.com/image/%E0%A4%A')).toBeUndefined()
  })
})

describe('resolveAttachmentImages', () => {
  // Notion 剪貼簿那份的 img 只帶 src 與 alt（2026-09-05 實測 8 張都是）
  const ID = 'a0dc42cd-6080-4832-b43c-e52dcc17793e'
  const PROXY = `https://app.notion.com/image/attachment%3A${ID}%3Adivider.png?table=block&width=1420`
  const resolve = (id: string) => (id === ID ? PROXY : undefined)

  it('配得到的圖換成頁面上那張可下載的網址', () => {
    const html = `<p>前言</p><img src="attachment:${ID}:divider.png" alt="divider.png"><p>後語</p>`
    expect(resolveAttachmentImages(html, resolve)).toBe(
      `<p>前言</p><img src="${PROXY}" alt="divider.png"><p>後語</p>`,
    )
  })

  it('配不到的圖整個拿掉，不留壞掉的內部協定', () => {
    // 摺疊的 toggle 或還沒捲到的圖，剪貼簿有、DOM 上沒渲染，就抓不到可下載的網址
    const missing = 'ffffffff-0000-0000-0000-000000000000'
    const html = `<p>前言</p><img src="attachment:${missing}:hidden.png" alt="hidden.png"><p>後語</p>`
    expect(resolveAttachmentImages(html, resolve)).toBe('<p>前言</p><p>後語</p>')
  })

  it('本來就是一般網址的圖不動它', () => {
    const html = '<img src="https://muki.tw/cover.jpg" alt="封面">'
    expect(resolveAttachmentImages(html, resolve)).toBe(html)
  })

  it('一篇多張圖各自處理', () => {
    const missing = 'ffffffff-0000-0000-0000-000000000000'
    const html = `<img src="attachment:${ID}:a.png"><img src="attachment:${missing}:b.png"><img src="attachment:${ID}:c.png">`
    expect(resolveAttachmentImages(html, resolve)).toBe(
      `<img src="${PROXY}"><img src="${PROXY}">`,
    )
  })

  it('網址裡的 $ 不會被當成替換樣板吃掉', () => {
    // String.replace 的替換字串裡 $& 代表整個 match、$1 代表第一組，
    // 網址帶到這些字元時會被展開成別的東西，落地就是一條壞連結
    const tricky = 'https://app.notion.com/image/x.png?sig=a$&b$1c'
    const html = `<img src="attachment:${ID}:a.png">`
    expect(resolveAttachmentImages(html, () => tricky)).toBe(`<img src="${tricky}">`)
  })

  it('沒有圖片的內容原樣回去', () => {
    const html = '<h2>標題</h2><ul><li>條列</li></ul>'
    expect(resolveAttachmentImages(html, resolve)).toBe(html)
  })
})

describe('notionTitleFrom', () => {
  it('去掉 Notion 接在後面的站名', () => {
    expect(notionTitleFrom('01｜怎麼跳脫普通人賽道，成為掌控生活的現代人？ | Notion')).toBe(
      '01｜怎麼跳脫普通人賽道，成為掌控生活的現代人？',
    )
  })

  it('標題本身有直線時只削掉最後那段站名', () => {
    expect(notionTitleFrom('讀書筆記 | 原子習慣 | Notion')).toBe('讀書筆記 | 原子習慣')
  })

  it('沒有站名後綴就原樣留著', () => {
    expect(notionTitleFrom('一份沒有後綴的標題')).toBe('一份沒有後綴的標題')
  })

  it('標題結尾剛好是 Notion 兩個字但不是站名後綴時不動它', () => {
    // 這條釘住的是「只削 ` | Notion` 後綴」這個行為，防止之後有人把正則放寬成 /Notion$/
    expect(notionTitleFrom('我的 Notion 筆記')).toBe('我的 Notion 筆記')
  })

  it('只有站名或空白時交回 undefined，讓呼叫端自己找替代', () => {
    expect(notionTitleFrom('Notion')).toBeUndefined()
    expect(notionTitleFrom('  ')).toBeUndefined()
  })
})

describe('isUsableNotionHtml', () => {
  // 2026-09-05 實測：文件沒有焦點時（剛開分頁、焦點還在網址列），Notion 的 copy handler
  // 只回一個 90 字元上下的空殼，一個內容標籤都沒有。拿這種東西去轉 Markdown 會落下
  // 一則幾乎空白的筆記，比退回原生抽取還糟
  it('有內容標籤才算拿到東西', () => {
    expect(isUsableNotionHtml('<h2>標題</h2><p>一段話</p><ul><li>條列</li></ul>')).toBe(true)
  })

  it('只有一句話的短頁面也算數，不用長度門檻', () => {
    // 跟 boundaryFallback 同一個理由：合法的短內容不該被門檻誤殺
    expect(isUsableNotionHtml('<p>就一句話</p>')).toBe(true)
  })

  it('沒有內容標籤的空殼不算', () => {
    expect(isUsableNotionHtml("<meta charset='utf-8'><span></span>")).toBe(false)
  })

  it('空字串不算', () => {
    expect(isUsableNotionHtml('')).toBe(false)
    expect(isUsableNotionHtml('   ')).toBe(false)
  })

  it('只有圖片的頁面也算拿到東西', () => {
    expect(isUsableNotionHtml('<img src="attachment:x:y.png">')).toBe(true)
  })
})

describe('withNotionFallback', () => {
  // 跟 boundaryFallback 同一條不變量：站台專屬的路徑只能讓結果變好，
  // 不能讓原本抽得到的頁面變成抽不到。這裡把它做成結構保證，不是靠註解與紀律
  it('Notion 那條拿得到就用它的結果，不必再跑原生抽取', async () => {
    const native = vi.fn(async () => '原生')
    expect(await withNotionFallback(async () => 'notion', native)).toBe('notion')
    expect(native).not.toHaveBeenCalled()
  })

  it('Notion 那條交回 null 就退回原生抽取', async () => {
    expect(await withNotionFallback(async () => null, async () => '原生')).toBe('原生')
  })

  it('Notion 那條拋錯也退回原生抽取，不讓整個擷取跟著失敗', async () => {
    // 實例：defuddle 換版改了匯出形狀，markdown 轉換器載入時會拋錯。
    // 通用路徑不吃那個匯出，所以那種情況只該讓 Notion 這條失效，不該讓 Notion 頁擷取不到
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await withNotionFallback(
      async () => {
        throw new Error('轉換器不見了')
      },
      async () => '原生',
    )
    expect(result).toBe('原生')
    warn.mockRestore()
  })

  it('原生抽取自己抽不到才往上報，那是真的失敗', async () => {
    await expect(
      withNotionFallback(
        async () => null,
        async () => {
          throw new Error('抽取不到正文')
        },
      ),
    ).rejects.toThrow('抽取不到正文')
  })
})

describe('calloutsToBlockquotes', () => {
  // 2026-09-06 實測：Notion 的 callout 在 copy 出來的 HTML 裡不是 <aside> 標籤，
  // 而是「跳脫過的字面文字」&lt;aside&gt;（那頁 7 個）。turndown 只會把它原樣吐成
  // \<aside> 落進筆記，Hyday 渲染不出來。callout 語意上最接近引用
  it('跳脫成字面文字的 callout 換成引用', () => {
    const html = '&lt;aside&gt;<p>這段是提示</p>&lt;/aside&gt;'
    expect(calloutsToBlockquotes(html)).toBe('<blockquote><p>這段是提示</p></blockquote>')
  })

  it('一篇有好幾個 callout 都換掉', () => {
    const html = '&lt;aside&gt;<p>一</p>&lt;/aside&gt;<p>中間</p>&lt;aside&gt;<p>二</p>&lt;/aside&gt;'
    expect(calloutsToBlockquotes(html)).toBe(
      '<blockquote><p>一</p></blockquote><p>中間</p><blockquote><p>二</p></blockquote>',
    )
  })

  it('哪天 Notion 改成送真的標籤也接得住', () => {
    expect(calloutsToBlockquotes('<aside class="x"><p>提示</p></aside>')).toBe(
      '<blockquote><p>提示</p></blockquote>',
    )
  })

  it('沒有 callout 的內容原樣回去', () => {
    const html = '<p>一般段落</p>'
    expect(calloutsToBlockquotes(html)).toBe(html)
  })
})

describe('stripNotionIcons', () => {
  // callout 的燈泡、上下一單元的箭頭都是 Notion 內建圖示，src 是 /icons/ 開頭的站內
  // 相對路徑：下載流程只認 http 網址所以抓不到，留著就是筆記裡一行壞掉的 img。
  // 它們在 copy 出來的 HTML 裡同樣是跳脫過的字面文字，引號還是 &quot; 實體
  const ICON =
    '&lt;img src=&quot;/icons/light-bulb_orange.svg&quot; alt=&quot;/icons/light-bulb_orange.svg&quot; width=&quot;40px&quot; /&gt;'

  it('拿掉跳脫成字面文字的內建圖示', () => {
    expect(stripNotionIcons(`&lt;aside&gt;${ICON}<p>提示</p>&lt;/aside&gt;`)).toBe(
      '&lt;aside&gt;<p>提示</p>&lt;/aside&gt;',
    )
  })

  it('一篇有好幾個圖示都拿掉，中間的內容留著', () => {
    expect(stripNotionIcons(`${ICON}<p>一</p>${ICON}<p>二</p>`)).toBe('<p>一</p><p>二</p>')
  })

  it('哪天 Notion 改成送真的標籤也接得住', () => {
    expect(stripNotionIcons('<p><img src="/icons/arrow-right_gray.svg" /></p>')).toBe('<p></p>')
  })

  it('內容圖片不受影響', () => {
    const html = '<img src="https://app.notion.com/image/attachment%3Aabc%3Aphoto.jpg?table=block">'
    expect(stripNotionIcons(html)).toBe(html)
  })

  it('相對路徑但不是 Notion 圖示的不亂動', () => {
    const html = '<img src="/uploads/2026/cover.png">'
    expect(stripNotionIcons(html)).toBe(html)
  })
})

describe('unlinkAttachments', () => {
  // 2026-09-06 實案：Notion 的音檔 block 複製出來是一條 href 為 attachment: 內部協定的連結，
  // 落進筆記變成 [1.發刊詞.mp3](attachment:…) 點不開。Hyday 的資產白名單只收圖片，
  // 就算下載了也吃不下，拆掉連結留檔名文字最誠實
  it('attachment 協定的連結拆掉只留文字', () => {
    const html = '<p><a href="attachment:9095764d-e621-4bf4-a88e-f6c8a40f7d42:1.%E7%99%BC%E5%88%8A%E8%A9%9E.mp3">1.發刊詞.mp3</a></p>'
    expect(unlinkAttachments(html)).toBe('<p>1.發刊詞.mp3</p>')
  })

  it('單引號寫法的也拆', () => {
    expect(unlinkAttachments("<a href='attachment:x:y.pdf'>簡報.pdf</a>")).toBe('簡報.pdf')
  })

  it('連結文字裡的行內標記留著', () => {
    expect(unlinkAttachments('<a href="attachment:x:y.mp3"><strong>音檔</strong></a>')).toBe(
      '<strong>音檔</strong>',
    )
  })

  it('一般網址的連結不動', () => {
    const html = '<a href="https://raymondhouch.com/about/">官網的關於我</a>'
    expect(unlinkAttachments(html)).toBe(html)
  })

  it('圖片不歸這支管', () => {
    const html = '<img src="attachment:x:y.png">'
    expect(unlinkAttachments(html)).toBe(html)
  })
})
