/**
 * 用 File System Access API 把整理好的 .md 寫進使用者選定的資料夾。
 * 這是薄薄的瀏覽器 adapter，純邏輯在 note/buildNote.ts。
 */
import { appendCollisionSuffix, type BuiltNote } from '../note/buildNote'

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
 * 把筆記寫進資料夾。檔名碰撞時加時間戳後綴，絕不覆蓋既有筆記。
 * 呼叫端須先確保 note.filename 不落在 .hyday、templates、assets（見 buildNote 的檔名規則）。
 */
export async function writeNoteToDir(
  dir: FileSystemDirectoryHandle,
  note: BuiltNote,
  capturedAt: Date,
): Promise<WriteResult> {
  let filename = note.filename
  let collided = false
  if (await fileExists(dir, filename)) {
    filename = appendCollisionSuffix(note.filename, capturedAt)
    collided = true
  }

  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(note.markdown)
  } finally {
    await writable.close()
  }

  return { filename, collided }
}
