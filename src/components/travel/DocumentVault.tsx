import { useEffect, useRef, useState } from 'react'
import { documentBytes, encryptVault, newVault, readVault, unlockVault, validEnvelope, writeVault, type TravelDocument, type VaultEnvelope } from '../../privacy/vault'
import { useStore } from '../../state/store'
import { Btn } from '../layout/ui'

const FIELDS = ['Full name', 'Nationality', 'Date of birth', 'Document number', 'Expiration date', 'Sex / gender as recorded', 'Issuing country', 'Program / visa notes']
export function DocumentVault() {
  const { workspace } = useStore()
  const [envelope, setEnvelope] = useState<VaultEnvelope | null | undefined>(undefined)
  const [restoring, setRestoring] = useState<VaultEnvelope | null>(null)
  const [key, setKey] = useState<CryptoKey | null>(null), [docs, setDocs] = useState<TravelDocument[]>([])
  const [passphrase, setPassphrase] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string[]>([]), [editing, setEditing] = useState<TravelDocument | null>(null)
  const upload = useRef<HTMLInputElement>(null), restore = useRef<HTMLInputElement>(null)
  const namespace = workspace.storageKey
  const lock = () => { setKey(null); setDocs([]); setEditing(null); setSelected([]); setPassphrase('') }
  useEffect(() => { let alive = true; readVault(namespace).then((v) => { if (alive) setEnvelope(v ?? null) }).catch(() => { if (alive) setMessage('Private browser storage is unavailable.') }); return () => { alive = false } }, [namespace])
  useEffect(() => {
    if (!key) return
    let timer = window.setTimeout(lock, 5 * 60_000)
    const activity = () => { clearTimeout(timer); timer = window.setTimeout(lock, 5 * 60_000) }
    window.addEventListener('pointerdown', activity); window.addEventListener('keydown', activity)
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity) }
  }, [key])
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMessage(''); try { await fn() } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) } }
  const save = async (next: TravelDocument[]) => {
    if (!key || !envelope) return
    if (JSON.stringify(next).length > 28_000_000 || next.length > 30) throw new Error('This vault holds up to 30 documents and 20 MB of original files. Remove an old file first.')
    const out = await encryptVault(key, envelope.salt, next, envelope.revision + 1)
    await writeVault(namespace, out, envelope.revision); setEnvelope(out); setDocs(next)
  }
  const backup = () => {
    if (!envelope) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: 'application/json' })), a = document.createElement('a')
    a.href = url; a.download = 'tatada-encrypted-documents.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Backup downloaded. Keep your passphrase separately.')
  }
  return <section className="privacy-card" aria-label="Private travel documents">
    <p className="small dim">Encrypted here. Keep your passphrase safe; it cannot be reset.</p>
    {!key ? <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
      const target = restoring ?? envelope
      if (target) {
        const out = await unlockVault(passphrase, target)
        if (restoring) { const saved = await encryptVault(out.key, target.salt, out.docs, (envelope?.revision ?? 0) + 1); await writeVault(namespace, saved, envelope?.revision ?? 0); setEnvelope(saved); setRestoring(null) }
        setKey(out.key); setDocs(out.docs);window.dispatchEvent(new Event('tatada-vault-ready'))
      }
      else { const out = await newVault(passphrase); await writeVault(namespace, out.envelope, 0); setEnvelope(out.envelope); setKey(out.key); setDocs([]);window.dispatchEvent(new Event('tatada-vault-ready')) }
      setPassphrase('')
    }) }}>
      <label>Vault passphrase<input className="chalk-input" placeholder="At least 12 characters" type="password" autoComplete="off" minLength={12} required value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></label>
      {restoring && <button type="button" className="linkbtn" onClick={() => { setRestoring(null); setMessage('Restore canceled. Existing device data is unchanged.') }}>cancel restore</button>}
      <Btn type="submit" disabled={busy || envelope === undefined}>{busy ? 'unlocking…' : restoring ? 'unlock and restore backup' : envelope ? 'unlock documents' : 'create private vault'}</Btn>
    </form> : <>
      <div className="ac-buttons"><Btn data-tour="vault-upload" onClick={() => upload.current?.click()} disabled={busy}>add a document</Btn><Btn kind="ghost" onClick={lock}>lock</Btn></div>
      <input aria-label="Upload vault document" hidden type="file" ref={upload} accept="application/pdf,image/jpeg,image/png" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => { const bytes = await documentBytes(f); setEditing({ id: crypto.randomUUID(), kind: 'passport', name: f.name, mime: f.type, file: bytes, addedAt: Date.now(), fields: {} }) }) }} />
      {editing && <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await save([...docs.filter((d) => d.id !== editing.id), editing]); setEditing(null);window.dispatchEvent(new Event('tatada-document-saved')) }) }}>
        <label>Document type<select className="chalk-input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>{['passport', 'visa', 'TSA PreCheck', 'Global Entry', 'other'].map((v) => <option key={v}>{v}</option>)}</select></label>
        <p className="small dim">Enter the fields you want available for travel. Nothing is extracted, inferred, or sent automatically.</p>
        <details><summary>Details (optional)</summary>{FIELDS.map((field) => <label key={field}>{field}<input className="chalk-input" placeholder={{'Full name':'Alex Morgan','Nationality':'Canadian','Date of birth':'YYYY-MM-DD','Document number':'Document number','Expiration date':'YYYY-MM-DD','Sex / gender as recorded':'As printed','Issuing country':'Canada','Program / visa notes':'Optional travel notes'}[field]} maxLength={300} value={editing.fields[field] ?? ''} onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, [field]: e.target.value } })} /></label>)}</details>
        <div className="ac-buttons"><Btn data-tour="vault-save" type="submit" disabled={busy}>save encrypted</Btn><Btn kind="ghost" type="button" onClick={() => setEditing(null)}>cancel</Btn></div>
      </form>}
      {docs.map((doc) => <details key={doc.id}><summary>{doc.kind} · {doc.name}</summary>
        <ul className="disclosure-list">{Object.entries(doc.fields).filter(([, value]) => value).map(([field, value]) => { const id = `${doc.id}:${field}`; return <li key={id}><label><input type="checkbox" checked={selected.includes(id)} onChange={(e) => setSelected((all) => e.target.checked ? [...all, id] : all.filter((v) => v !== id))} /> {field}: {value}</label></li> })}</ul>
        <div className="ac-buttons"><button className="linkbtn" onClick={() => setEditing(doc)}>edit fields</button><button className="linkbtn" onClick={() => { const bytes = Uint8Array.from(atob(doc.file), (c) => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: doc.mime })); const a = document.createElement('a'); a.href = url; a.download = doc.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>download original</button><button className="linkbtn danger" disabled={busy} onClick={() => void run(async () => { await save(docs.filter((d) => d.id !== doc.id)); setSelected((all) => all.filter((v) => !v.startsWith(doc.id + ':'))) })}>remove</button></div>
      </details>)}
      {selected.length > 0 && <p className="small">Document sharing with external providers is disabled in v0.1. The encrypted vault and originals stay on this device.</p>}
    </>}
    {envelope && <button className="linkbtn" onClick={backup}>encrypted backup</button>}
    <button className="linkbtn" disabled={busy} onClick={() => restore.current?.click()}>restore encrypted backup</button>
    <input type="file" hidden ref={restore} accept="application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => { if (f.size > 40_000_000) throw new Error('Backup is too large.'); const value: unknown = JSON.parse(await f.text()); if (!validEnvelope(value)) throw new Error('Not a supported encrypted vault backup.'); lock(); setRestoring(value); setMessage('Backup loaded for review. Enter its passphrase, then unlock. Existing device data has not been overwritten.'); }) }} />
    {message && <p className="small" role="status">{message}</p>}
  </section>
}
