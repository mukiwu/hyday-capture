/**
 * 輸出資料夾的 FileSystemDirectoryHandle 存進 IndexedDB，跨 session 存活。
 * handle 是結構化可複製物件，能直接存進 IndexedDB，日後取回仍指向同一個資料夾，
 * 但寫入權限可能需要再次確認，見 fs/writeNote.ts 的 ensurePermission。
 */

const DB_NAME = 'hyday-capture'
const DB_VERSION = 1
const STORE = 'settings'
const KEY_OUTPUT_DIR = 'outputDir'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        tx.oncomplete = () => {
          db.close()
          resolve(req.result)
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error)
        }
      }),
  )
}

export function saveOutputDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  return withStore('readwrite', (store) => store.put(handle, KEY_OUTPUT_DIR)).then(() => undefined)
}

export function getOutputDirHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  return withStore<FileSystemDirectoryHandle | undefined>('readonly', (store) =>
    store.get(KEY_OUTPUT_DIR),
  )
}

export function clearOutputDirHandle(): Promise<void> {
  return withStore('readwrite', (store) => store.delete(KEY_OUTPUT_DIR)).then(() => undefined)
}
