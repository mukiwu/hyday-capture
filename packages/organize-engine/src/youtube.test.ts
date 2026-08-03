import { describe, expect, it } from 'vitest'
import { formatYouTubeDescription, parseYouTubeUrl } from './youtube'

describe('parseYouTubeUrl', () => {
  it('辨識 watch 網址並移除追蹤參數', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=aR97E7aKEgg&si=tracking')).toEqual({
      id: 'aR97E7aKEgg',
      url: 'https://www.youtube.com/watch?v=aR97E7aKEgg',
    })
  })

  it('保留有意義的開始時間', () => {
    expect(parseYouTubeUrl('https://youtu.be/aR97E7aKEgg?t=1m30s')).toEqual({
      id: 'aR97E7aKEgg',
      url: 'https://www.youtube.com/watch?v=aR97E7aKEgg&t=90',
      startSeconds: 90,
    })
  })

  it('保留描述常見的 0 秒開始時間', () => {
    expect(parseYouTubeUrl('https://youtu.be/aR97E7aKEgg?t=0')).toEqual({
      id: 'aR97E7aKEgg',
      url: 'https://www.youtube.com/watch?v=aR97E7aKEgg&t=0',
      startSeconds: 0,
    })
  })

  it('拒絕播放清單與非 YouTube URL', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PL123')).toBeNull()
    expect(parseYouTubeUrl('https://example.com/watch?v=aR97E7aKEgg')).toBeNull()
  })
})

describe('formatYouTubeDescription', () => {
  it('保留描述並把分秒與時分秒轉成可點時間戳', () => {
    const video = { id: 'aR97E7aKEgg', url: 'https://www.youtube.com/watch?v=aR97E7aKEgg' }
    expect(formatYouTubeDescription('📌 時間戳\n0:00 開場\n1:24 重點\n1:02:03 結尾', video)).toBe(
      '📌 時間戳\n[0:00](https://www.youtube.com/watch?v=aR97E7aKEgg&t=0) 開場\n[1:24](https://www.youtube.com/watch?v=aR97E7aKEgg&t=84) 重點\n[1:02:03](https://www.youtube.com/watch?v=aR97E7aKEgg&t=3723) 結尾',
    )
  })

  it('沒有描述時不額外產生空白區塊', () => {
    const video = { id: 'aR97E7aKEgg', url: 'https://www.youtube.com/watch?v=aR97E7aKEgg' }
    expect(formatYouTubeDescription('  \n ', video)).toBe('')
  })
})
