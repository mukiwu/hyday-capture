/**
 * 把下載回來的圖片寫進 vault 的 assets/。
 * 檔名由引擎的 assetFileName 決定（含網址短碼），所以同一個網址永遠對到同一個檔，
 * 已存在就不重寫，重抓同一篇不會多存一份也不會蓋掉。
 */
import { ASSETS_DIR } from '@hyday-capture/organize-engine'

async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false
    throw err
  }
}

/** 取得（必要時建立）vault 底下的 assets 資料夾 */
export async function ensureAssetsDir(
  vaultDir: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return vaultDir.getDirectoryHandle(ASSETS_DIR, { create: true })
}

/** 寫入圖片，已存在則跳過。回傳這次是否真的寫了檔 */
export async function writeAssetIfAbsent(
  assetsDir: FileSystemDirectoryHandle,
  filename: string,
  bytes: Uint8Array,
): Promise<boolean> {
  if (await fileExists(assetsDir, filename)) return false

  const handle = await assetsDir.getFileHandle(filename, { create: true })
  const writable = await handle.createWritable()
  try {
    // 用 Blob 包一層，避免 TS 對 BufferSource 與 Uint8Array<ArrayBufferLike> 的型別打架
    await writable.write(new Blob([bytes as unknown as BlobPart]))
  } finally {
    await writable.close()
  }
  return true
}
