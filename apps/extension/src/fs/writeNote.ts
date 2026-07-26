/**
 * 用 File System Access API 把原料檔寫進 hyday vault 的 clippings 子資料夾。
 * 這是薄薄的瀏覽器 adapter，檔名與碰撞後綴等純邏輯在 @hyday-capture/organize-engine。
 */
import { appendCollisionSuffix, type RawClippingOutput } from '@hyday-capture/organize-engine'

/**
 * 原料檔的固定落點（vault 底下的子資料夾名）。明面資料夾不是隱藏佇列：
 * 使用者在 Finder 與 hyday 的筆記列表都看得到，狀態靠標籤而非位置表達，
 * hyday 也只在這個資料夾裡找該整理的東西（見 hyday v2 的 docs/clippings-line.md）
 */
export const CLIPPINGS_DIR = 'clippings'

export type WriteResult = {
  filename: string
  collided: boolean
}

/** 確認對資料夾有讀寫權限，需要時在使用者手勢下請求 */
export async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts = { mode: 'readwrite' } as const
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return false
    throw err
  }
}

/**
 * 取得（必要時建立）vault 底下的 clippings 子資料夾。
 * 根目錄的 readwrite 權限涵蓋子孫，所以這裡不需要再請求權限。
 */
export async function ensureClippingsDir(
  vaultDir: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return vaultDir.getDirectoryHandle(CLIPPINGS_DIR, { create: true })
}

/**
 * 把原料檔寫進 clippings。檔名碰撞時加時間戳後綴，絕不覆蓋既有檔案。
 * 傳入的是 vault 根目錄的 handle，子資料夾在這裡解析，呼叫端不必知道落點。
 */
export async function writeClippingToVault(
  vaultDir: FileSystemDirectoryHandle,
  clipping: RawClippingOutput,
  capturedAt: Date,
): Promise<WriteResult> {
  const dir = await ensureClippingsDir(vaultDir)

  let filename = clipping.filename
  let collided = false
  if (await fileExists(dir, filename)) {
    filename = appendCollisionSuffix(clipping.filename, capturedAt)
    collided = true
  }

  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(clipping.markdown)
  } finally {
    await writable.close()
  }

  return { filename: `${CLIPPINGS_DIR}/${filename}`, collided }
}
