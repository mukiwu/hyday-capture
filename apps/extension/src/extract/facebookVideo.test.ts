import { describe, expect, it } from 'vitest'
import {
  embedBlockedFromHtml,
  facebookVideoMarkdown,
  facebookVideoTitle,
  parseFacebookVideoUrl,
  videoFromScriptJson,
} from './facebookVideo'

describe('parseFacebookVideoUrl', () => {
  it('認得 /reel/<id>，收斂成標準網址', () => {
    expect(parseFacebookVideoUrl('https://m.facebook.com/reel/2299075694249375/?s=1')).toEqual({
      id: '2299075694249375',
      url: 'https://www.facebook.com/reel/2299075694249375',
    })
  })

  it('認得 watch 頁與粉專的 /videos/<id>，收斂成 watch 網址', () => {
    const watch = { id: '1636149924880102', url: 'https://www.facebook.com/watch/?v=1636149924880102' }
    expect(parseFacebookVideoUrl('https://www.facebook.com/watch/?v=1636149924880102&ref=x')).toEqual(watch)
    expect(parseFacebookVideoUrl('https://www.facebook.com/somepage/videos/1636149924880102/')).toEqual(watch)
  })

  it('Reel 首頁、watch 首頁與其他網站不算', () => {
    expect(parseFacebookVideoUrl('https://www.facebook.com/reel/')).toBeUndefined()
    expect(parseFacebookVideoUrl('https://www.facebook.com/watch/')).toBeUndefined()
    expect(parseFacebookVideoUrl('https://www.facebook.com/someone/posts/1')).toBeUndefined()
    expect(parseFacebookVideoUrl('https://example.com/reel/123')).toBeUndefined()
  })
})

describe('videoFromScriptJson', () => {
  const story = (videoId: string, text: string) => ({
    attachments: [{ media: { id: videoId } }],
    message: { text },
    creation_time: 1789635022,
    actors: [{ name: '作者名' }],
  })

  it('從頁面 JSON 找出這支 Reel 的說明、作者與發布時間', () => {
    const json = { require: [[{ __bbox: { result: { data: story('42', '說明\n#tag') } } }]] }
    expect(videoFromScriptJson(json, '42')).toEqual({
      caption: '說明\n#tag',
      author: '作者名',
      published: new Date(1789635022 * 1000).toISOString(),
    })
  })

  it('略過同樣掛著這支影片、但不是貼文本體的物件', () => {
    const json = { b: story('42', '真正的說明'), a: { attachments: [{ media: { id: '42' } }] } }
    expect(videoFromScriptJson(json, '42')?.caption).toBe('真正的說明')
  })

  it('watch 頁的格式：說明在 creation_story 裡、作者在 owner', () => {
    const json = {
      data: {
        attachments: [
          {
            media: {
              id: '42',
              owner: { name: '粉專名' },
              creation_story: {
                comet_sections: {
                  message: { story: { message: { text: '影片說明' } } },
                  metadata: [{ story: { creation_time: 1791598200 } }],
                },
              },
            },
          },
        ],
      },
    }
    expect(videoFromScriptJson(json, '42')).toEqual({
      caption: '影片說明',
      author: '粉專名',
      published: new Date(1791598200 * 1000).toISOString(),
    })
  })

  it('JSON 裡是別支 Reel 時不誤用', () => {
    expect(videoFromScriptJson({ data: story('other', '別人的') }, '42')).toBeUndefined()
  })
})

describe('facebookVideoMarkdown', () => {
  it('影片連結在前，說明逐行保留，行首 # 不會變成標題', () => {
    expect(facebookVideoMarkdown('https://www.facebook.com/reel/42', '第一行\n#搞笑 #日常\n\n第三行')).toBe(
      'https://www.facebook.com/reel/42\n\n第一行  \n\\#搞笑 #日常\n\n第三行',
    )
  })

  it('沒有說明時只留連結', () => {
    expect(facebookVideoMarkdown('https://www.facebook.com/reel/42', undefined)).toBe(
      'https://www.facebook.com/reel/42',
    )
  })
})

describe('embedBlockedFromHtml', () => {
  it('嵌入頁只有錯誤卡、沒有 <video>，就是被擋', () => {
    expect(
      embedBlockedFromHtml('<div class="_3i0o">無法使用</div><div class="_3i0p">這段影片可能含有屬於其他人的內容，因此無法嵌入。</div>'),
    ).toBe(true)
  })

  it('嵌入頁有 <video> 就能播', () => {
    expect(embedBlockedFromHtml('<video height="281" width="500" preload="auto"></video>')).toBe(false)
  })
})

describe('facebookVideoMarkdown 無法嵌入', () => {
  it('被擋的影片在連結下面寫上原因', () => {
    expect(facebookVideoMarkdown('https://www.facebook.com/reel/42', '說明', { embedBlocked: true })).toBe(
      'https://www.facebook.com/reel/42\n\n> 這支影片無法在筆記裡播放，原因通常是影片用了有版權的音樂或別人的片段，版權方設定不准嵌入\n\n說明',
    )
  })
})

describe('facebookVideoTitle', () => {
  it('拿說明第一行當標題，過長截斷', () => {
    expect(facebookVideoTitle('🥔 韓式煎餅\n第二行', '作者')).toBe('🥔 韓式煎餅')
    expect(facebookVideoTitle('字'.repeat(80), '作者')).toBe('字'.repeat(60) + '…')
  })

  it('說明第一行只有 hashtag 或沒說明時退回作者名', () => {
    expect(facebookVideoTitle('#搞笑 #日常', '作者')).toBe('作者 的影片')
    expect(facebookVideoTitle(undefined, undefined)).toBe('Facebook 影片')
  })
})
