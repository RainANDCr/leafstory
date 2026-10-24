/**
 * 本地模式的照片存储（IndexedDB，按 Blob 原样保存）。
 * 元数据行里的 storagePath 即此处的 mediaKey。
 */

const DB_NAME = 'leafstory-media'
const STORE = 'media'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('此环境不支持本地照片存储'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('本地照片数据库打开失败'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result: T | undefined
    const request = run(store)
    if (request) {
      request.onsuccess = () => {
        result = request.result
      }
    }
    tx.oncomplete = () => {
      db.close()
      resolve(result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('本地照片读写失败'))
    }
  })
}

export async function putMedia(key: string, blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, key))
}

export async function getMedia(key: string): Promise<Blob | undefined> {
  return withStore<Blob>('readonly', (store) => store.get(key) as IDBRequest<Blob>)
}

export async function deleteMedia(key: string): Promise<void> {
  await withStore('readwrite', (store) => {
    store.delete(key)
  })
}
