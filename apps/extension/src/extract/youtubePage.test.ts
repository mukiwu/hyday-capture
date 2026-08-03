import { describe, expect, it } from 'vitest'
import { parseYouTubePlayerResponseScript } from './youtubePage'

describe('parseYouTubePlayerResponseScript', () => {
  it('保留 YouTube 原始描述的換行與 metadata', () => {
    const source = String.raw`var ytInitialPlayerResponse = {"videoDetails":{"videoId":"aR97E7aKEgg","title":"影片標題","author":"作者","shortDescription":"0:00 開場\n1:24 重點"},"microformat":{"playerMicroformatRenderer":{"publishDate":"2026-07-22"}}};`

    expect(parseYouTubePlayerResponseScript(source, 'aR97E7aKEgg')).toEqual({
      title: '影片標題',
      author: '作者',
      published: '2026-07-22',
      description: '0:00 開場\n1:24 重點',
    })
  })

  it('腳本不是同一支影片時不誤用描述', () => {
    const source = 'var ytInitialPlayerResponse = {"videoDetails":{"videoId":"other-video"}};'
    expect(parseYouTubePlayerResponseScript(source, 'aR97E7aKEgg')).toBeUndefined()
  })
})
