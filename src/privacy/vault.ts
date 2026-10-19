/** Local-only document vault. The passphrase and non-extractable key never enter app state, exports, or the backend. */
export interface TravelDocument { id: string; kind: string; name: string; mime: string; file: string; addedAt: number; fields: Record<string, string> }
export interface VaultEnvelope { version: 1; salt: string; iv: string; ciphertext: string; revision: number }
const encoder = new TextEncoder()
const encode = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s) }
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
const AAD = encoder.encode('tatada-private-documents-v1')
export async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters. There is no password reset for this local vault.')
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 600_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}
export async function encryptVault(key: CryptoKey, salt: string, docs: TravelDocument[], revision: number): Promise<VaultEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, encoder.encode(JSON.stringify({ marker: 'tatada-vault-v1', docs })))
  return { version: 1, salt, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)), revision }
}
export async function newVault(passphrase: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(16)), key = await deriveVaultKey(passphrase, bytes)
  return { key, envelope: await encryptVault(key, encode(bytes), [], 1) }
}
export function validEnvelope(value: unknown): value is VaultEnvelope {
  const v = value as VaultEnvelope
  return !!v && v.version === 1 && Number.isSafeInteger(v.revision) && v.revision > 0 && typeof v.salt === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(v.salt) && typeof v.iv === 'string' && /^[A-Za-z0-9+/]{16}$/.test(v.iv) && typeof v.ciphertext === 'string' && v.ciphertext.length >= 24 && v.ciphertext.length <= 40_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(v.ciphertext)
}
export async function unlockVault(passphrase: string, envelope: VaultEnvelope) {
  if (!validEnvelope(envelope)) throw new Error('This is not a supported encrypted Tatada vault.')
  try {
    const key = await deriveVaultKey(passphrase, decode(envelope.salt))
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: AAD }, key, decode(envelope.ciphertext))
    const data = JSON.parse(new TextDecoder().decode(plaintext))
    if (data.marker !== 'tatada-vault-v1' || !Array.isArray(data.docs) || data.docs.length > 30 || !data.docs.every((d: TravelDocument) => d && typeof d.id === 'string' && typeof d.name === 'string' && typeof d.file === 'string' && ['application/pdf', 'image/jpeg', 'image/png'].includes(d.mime) && typeof d.fields === 'object' && d.fields && Object.values(d.fields).every((v) => typeof v === 'string'))) throw new Error('Invalid vault data')
    return { key, docs: data.docs as TravelDocument[] }
  } catch { throw new Error('Could not unlock. Check your passphrase, or restore an intact encrypted backup.') }
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('tatada-private-vault', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('vaults')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(new Error('Private storage is unavailable in this browser.'))
  })
}
export async function readVault(workspace: string): Promise<VaultEnvelope | undefined> {
  const db = await database()
  try { return await new Promise((resolve, reject) => { const r = db.transaction('vaults').objectStore('vaults').get(workspace); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) } finally { db.close() }
}
export async function writeVault(workspace: string, envelope: VaultEnvelope, expectedRevision: number) {
  const db = await database()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('vaults', 'readwrite'), store = tx.objectStore('vaults'), r = store.get(workspace)
      r.onsuccess = () => { if ((r.result?.revision ?? 0) !== expectedRevision) { tx.abort(); return } store.put(envelope, workspace) }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(new Error('The vault changed in another tab. Lock and unlock it before editing again.'))
      tx.onerror = () => reject(new Error('Could not save private documents. Storage may be full.'))
    })
  } finally { db.close() }
}
export function documentBytes(file: File): Promise<string> {
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Choose a PDF, JPEG, or PNG up to 8 MB.')
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(new Error('Could not read this document.')); r.readAsDataURL(file) })
}

export async function deleteVault(workspace: string) {
  const db = await database()
  try { await new Promise<void>((resolve,reject)=>{const tx=db.transaction('vaults','readwrite');tx.objectStore('vaults').delete(workspace);tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('Could not delete this device’s vault.'))}) } finally {db.close()}
}
