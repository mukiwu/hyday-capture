import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureAssetsDir, writeAssetIfAbsent } from '../fs/writeAssets'
import type { ImageFetcher } from '../net/imageFetch'
import { localizeImages } from './localizeImages'

vi.mock('../fs/writeAssets', () => ({
  ensureAssetsDir: vi.fn(),
  writeAssetIfAbsent: vi.fn(),
}))

const IMAGE_URL = 'https://cdnfile.sspai.com/2026/08/13/example.png?format=webp'
const SOURCE_URL = 'https://sspai.com/post/113420'

describe('localizeImages', () => {
  beforeEach(() => {
    vi.mocked(ensureAssetsDir).mockResolvedValue({} as FileSystemDirectoryHandle)
    vi.mocked(writeAssetIfAbsent).mockResolvedValue(true)
  })

  it('把來源頁網址交給每張圖片的下載器，讓防盜連 CDN 能驗證 Referer', async () => {
    const fetchImage = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: 'image/webp',
    })) as ImageFetcher

    const result = await localizeImages(
      `![](${IMAGE_URL})`,
      {} as FileSystemDirectoryHandle,
      fetchImage,
      SOURCE_URL,
    )

    expect(fetchImage).toHaveBeenCalledWith(IMAGE_URL, SOURCE_URL)
    expect(result).toMatchObject({ saved: 1, skipped: 0 })
    expect(result.markdown).toMatch(/^!\[\]\(assets\/example-[0-9a-f]{8}\.png\)$/u)
  })
})
