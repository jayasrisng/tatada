/** Separate from passport/visa vault and ordinary workspace sync. Non-extractable device key; browser access still grants document access. */
export interface Original { id: string; name: string; mime: string; bytes: Uint8Array; addedAt: string }
interface SealedOriginal { id: string; name: string; mime: string; addedAt: string; iv: Uint8Array; ciphertext: ArrayBuffer }
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('tatada-confirmations', 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('files'); r.result.createObjectStore('keys') }
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Confirmation storage is unavailable.'))
  })
}
async function operation<T>(store: 'files' | 'keys', mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  try { return await new Promise<T>((resolve, reject) => { const tx = db.transaction(store, mode), r = run(tx.objectStore(store)); tx.oncomplete = () => resolve(r.result); tx.onabort = tx.onerror = () => reject(new Error('Could not save confirmation. Check device storage.')) }) } finally { db.close() }
}
async function deviceKey(workspace: string) {
  const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const db = await database()
  try { return await new Promise<CryptoKey>((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite'), store = tx.objectStore('keys'), r = store.get(workspace)
    let key: CryptoKey
    r.onsuccess = () => { key = r.result ?? candidate; if (!r.result) store.put(key, workspace) }
    tx.oncomplete = () => resolve(key); tx.onabort = tx.onerror = () => reject(new Error('Could not open device encryption key.'))
  }) } finally { db.close() }
}
export async function saveOriginal(workspace: string, file: Original) {
  const key = await deviceKey(workspace), iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${workspace}:${file.id}`) }, key, file.bytes as BufferSource)
  await operation('files', 'readwrite', s => s.put({ id: file.id, name: file.name, mime: file.mime, addedAt: file.addedAt, iv, ciphertext }, `${workspace}:${file.id}`))
}
export async function readOriginal(workspace: string, id: string): Promise<Original | undefined> {
  const file = await operation<SealedOriginal | undefined>('files', 'readonly', s => s.get(`${workspace}:${id}`))
  if (!file) return
  const key = await operation<CryptoKey | undefined>('keys', 'readonly', s => s.get(workspace))
  if (!key) throw new Error('The encryption key is unavailable on this device.')
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: file.iv as BufferSource, additionalData: new TextEncoder().encode(`${workspace}:${id}`) }, key, file.ciphertext)
  return { id, name: file.name, mime: file.mime, addedAt: file.addedAt, bytes: new Uint8Array(bytes) }
}
export async function deleteOriginal(workspace: string, id: string) { await operation('files', 'readwrite', s => s.delete(`${workspace}:${id}`)) }
export async function clearOriginals(workspace: string) {
  const db = await database()
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(['files', 'keys'], 'readwrite'); const r = tx.objectStore('files').openCursor(); r.onsuccess = () => { const c = r.result; if (c) { if (typeof c.key === 'string' && c.key === `${workspace}:${(c.value as SealedOriginal).id}`) c.delete(); c.continue() } }; tx.objectStore('keys').delete(workspace); tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error('Could not delete local confirmations.')) }) } finally { db.close() }
}
export function downloadOriginal(file: Original) {
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.mime })), a = document.createElement('a')
  a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Metadata inventory also exposes retained originals whose reservation was removed, so they can always be deleted. */
export async function listOriginals(workspace: string): Promise<Omit<Original,'bytes'>[]> {
  const db=await database()
  try{return await new Promise((resolve,reject)=>{const rows:Omit<Original,'bytes'>[]=[];const tx=db.transaction('files'),r=tx.objectStore('files').openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(typeof c.key==='string'&&c.key===`${workspace}:${(c.value as SealedOriginal).id}`){const v=c.value as SealedOriginal;rows.push({id:v.id,name:v.name,mime:v.mime,addedAt:v.addedAt})}c.continue()}};tx.oncomplete=()=>resolve(rows);tx.onabort=tx.onerror=()=>reject(new Error('Could not list device confirmations.'))})}finally{db.close()}
}
