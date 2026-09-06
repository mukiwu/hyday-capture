/**
 * 把擷取內容裡的遠端圖片下載進 vault 的 assets/，內文改成本機相對路徑。
 *
 * 原則是不要因為圖片而讓擷取失敗：單張下載或寫檔失敗就跳過那張、保留原本的遠端網址，
 * 整批出錯也只是回原文。圖片是加分項，文字才是主體。
 */
import { assetFileName, findRemoteImageUrls, rewriteImageUrls } from '@hyday-capture/organize-engine'
import { ensureAssetsDir, writeAssetIfAbsent } from '../fs/writeAssets'
import type { ImageFetcher } from '../net/imageFetch'

export type LocalizeResult = {
  markdown: string
  /** 這次真的落地的張數，供呼叫端回報 */
  saved: number
  /** 下載或寫檔失敗、維持遠端網址的張數 */
  skipped: number
}

export async function localizeImages(
  markdown: string,
  vaultDir: FileSystemDirectoryHandle,
  fetchImage: ImageFetcher,
  sourceUrl?: string,
): Promise<LocalizeResult> {
  const urls = findRemoteImageUrls(markdown)
  if (urls.length === 0) return { markdown, saved: 0, skipped: 0 }

  let assetsDir: FileSystemDirectoryHandle
  try {
    assetsDir = await ensureAssetsDir(vaultDir)
  } catch (err) {
    console.warn('[hyday-capture] 建不出 assets 資料夾，圖片維持遠端網址', err)
    return { markdown, saved: 0, skipped: urls.length }
  }

  const mapping: Record<string, string> = {}
  let saved = 0
  let skipped = 0

  // 逐張下載不併發：一篇圖不多，順序做對來源站也比較客氣
  for (const url of urls) {
    try {
      const { bytes, contentType } = await fetchImage(url, sourceUrl)
      const filename = assetFileName(url, contentType)
      if (!filename) {
        // 判不出 Hyday 供得出來的副檔名，存了也是壞圖，保留遠端網址
        skipped += 1
        continue
      }
      const written = await writeAssetIfAbsent(assetsDir, filename, bytes)
      if (written) saved += 1
      mapping[url] = filename
    } catch (err) {
      skipped += 1
      console.warn(`[hyday-capture] 圖片略過：${url}`, err)
    }
  }

  return { markdown: rewriteImageUrls(markdown, mapping), saved, skipped }
}
