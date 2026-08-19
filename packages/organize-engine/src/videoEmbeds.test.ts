import { describe, expect, it } from 'vitest'
import { convertVideoEmbedsToMarkdown } from './videoEmbeds'

describe('convertVideoEmbedsToMarkdown', () => {
  it('把 HTTPS MP4 video src 改成 Hyday 影片 Markdown', () => {
    expect(
      convertVideoEmbedsToMarkdown('<video controls src="https://example.com/path/xxx.mp4"></video>'),
    ).toBe('[xxx.mp4](https://example.com/path/xxx.mp4)')
  })

  it('從所有 source 候選中選第一個 HTTPS MP4，並保留網址參數', () => {
    expect(
      convertVideoEmbedsToMarkdown(
        '<video src="blob:https://example.com/id"><source src="https://cdn.example.com/movie.webm"><source type="video/mp4" src="https://cdn.example.com/a%20b.mp4?token=1&amp;x=2"></video>',
      ),
    ).toBe('[a b.mp4](https://cdn.example.com/a%20b.mp4?token=1&x=2)')
  })

  it('依文章網址解析相對與 protocol-relative MP4 網址', () => {
    const sourceUrl = 'https://www.example.com/posts/article'
    const input = [
      '<video src="../media/demo.mp4"></video>',
      '<embed src="//cdn.example.com/video/clip.mp4">',
    ].join('\n')
    expect(convertVideoEmbedsToMarkdown(input, sourceUrl)).toBe(
      '[demo.mp4](https://www.example.com/media/demo.mp4)\n[clip.mp4](https://cdn.example.com/video/clip.mp4)',
    )
  })

  it('支援直接指向 HTTPS MP4 的 iframe、embed 與 object', () => {
    const input = [
      '<iframe src="https://cdn.example.com/one.mp4"></iframe>',
      '<embed src="https://cdn.example.com/two.mp4">',
      '<object data="https://cdn.example.com/three.mp4"></object>',
    ].join('\n')
    expect(convertVideoEmbedsToMarkdown(input)).toBe(
      '[one.mp4](https://cdn.example.com/one.mp4)\n' +
        '[two.mp4](https://cdn.example.com/two.mp4)\n' +
        '[three.mp4](https://cdn.example.com/three.mp4)',
    )
  })

  it('把 YouTube iframe 改成 Hyday 能辨識的 canonical 裸網址', () => {
    expect(
      convertVideoEmbedsToMarkdown(
        '<iframe src="https://www.youtube.com/embed/aR97E7aKEgg?start=65&amp;rel=0" allowfullscreen></iframe>',
      ),
    ).toBe('https://www.youtube.com/watch?v=aR97E7aKEgg&t=65')
  })

  it('HTTP、非 MP4 與只有 type 提示的來源維持原 HTML', () => {
    const input = [
      '<video src="http://cdn.example.com/insecure.mp4"></video>',
      '<video src="https://cdn.example.com/movie.m4v"></video>',
      '<video src="https://cdn.example.com/movie.webm"></video>',
      '<video src="https://cdn.example.com/movie.ogv"></video>',
      '<video src="https://cdn.example.com/movie.ogg"></video>',
      '<video src="https://cdn.example.com/movie.mov"></video>',
      '<video src="https://cdn.example.com/movie.m3u8"></video>',
      '<embed type="video/mp4" src="https://media.example.com/download/lesson">',
    ].join('\n')
    expect(convertVideoEmbedsToMarkdown(input)).toBe(input)
  })

  it('Vimeo 與僅帶影片提示的 iframe 維持原 HTML', () => {
    const input = [
      '<iframe src="https://player.vimeo.com/video/12345" allowfullscreen></iframe>',
      '<iframe title="教學影片" src="https://media.example.com/embed/lesson"></iframe>',
    ].join('\n')
    expect(convertVideoEmbedsToMarkdown(input)).toBe(input)
  })

  it('讓轉換結果單獨佔一行', () => {
    expect(
      convertVideoEmbedsToMarkdown(
        '前文 <video src="https://cdn.example.com/demo.mp4"></video> 後文',
      ),
    ).toBe('前文 \n[demo.mp4](https://cdn.example.com/demo.mp4)\n 後文')
  })

  it('不改寫程式碼圍籬裡的 HTML 範例', () => {
    const input = '```html\n<video src="https://example.com/demo.mp4"></video>\n```'
    expect(convertVideoEmbedsToMarkdown(input)).toBe(input)
  })
})
