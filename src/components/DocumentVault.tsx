import { useEffect, useRef, useState } from 'react'
import { documentBytes, encryptVault, newVault, readVault, unlockVault, validEnvelope, writeVault, type TravelDocument, type VaultEnvelope } from '../privacy/vault'
import { useStore } from '../state/store'
import { useUI } from '../state/ui'
import { Btn } from './ui'

const FIELDS = ['Full name', 'Nationality', 'Date of birth', 'Document number', 'Expiration date', 'Sex / gender as recorded', 'Issuing country', 'Program / visa notes']
export function DocumentVault() {
  const { workspace } = useStore(), { openMagic } = useUI()
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
    setMessage('Encrypted backup downloaded. Keep your passphrase separately. Ordinary trip exports do not contain these documents.')
  }
  return <section className="privacy-card" aria-label="Private travel documents">
    <h3>Your travel documents</h3>
    <p className="small dim">Passport, visa, TSA PreCheck, Global Entry, or other travel papers. Encrypted on this device, separate from your trips. Unlock with your passphrase; auto-locks after 5 minutes of inactivity. No password reset or automatic device sync.</p>
    {!key ? <form onSubmit={(e) => { e.preventDefault(); void run(async () => {
      const target = restoring ?? envelope
      if (target) {
        const out = await unlockVault(passphrase, target)
        if (restoring) { const saved = await encryptVault(out.key, target.salt, out.docs, (envelope?.revision ?? 0) + 1); await writeVault(namespace, saved, envelope?.revision ?? 0); setEnvelope(saved); setRestoring(null) }
        setKey(out.key); setDocs(out.docs)
      }
      else { const out = await newVault(passphrase); await writeVault(namespace, out.envelope, 0); setEnvelope(out.envelope); setKey(out.key); setDocs([]) }
      setPassphrase('')
    }) }}>
      <label>Vault passphrase<input className="chalk-input" placeholder="Vault passphrase" type="password" autoComplete="off" minLength={12} required value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></label>
      {restoring && <button type="button" className="linkbtn" onClick={() => { setRestoring(null); setMessage('Restore canceled. Existing device data is unchanged.') }}>cancel restore</button>}
      <Btn type="submit" disabled={busy || envelope === undefined}>{busy ? 'unlocking…' : restoring ? 'unlock and restore backup' : envelope ? 'unlock documents' : 'create private vault'}</Btn>
    </form> : <>
      <div className="ac-buttons"><Btn onClick={() => upload.current?.click()} disabled={busy}>add a document</Btn><Btn kind="ghost" onClick={lock}>lock</Btn></div>
      <input hidden type="file" ref={upload} accept="application/pdf,image/jpeg,image/png" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => { const bytes = await documentBytes(f); setEditing({ id: crypto.randomUUID(), kind: 'passport', name: f.name, mime: f.type, file: bytes, addedAt: Date.now(), fields: {} }) }) }} />
      {editing && <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await save([...docs.filter((d) => d.id !== editing.id), editing]); setEditing(null) }) }}>
        <label>Document type<select className="chalk-input" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })}>{['passport', 'visa', 'TSA PreCheck', 'Global Entry', 'other'].map((v) => <option key={v}>{v}</option>)}</select></label>
        <p className="small dim">Enter the fields you want available for travel. Nothing is extracted, inferred, or sent automatically.</p>
        {FIELDS.map((field) => <label key={field}>{field}<input className="chalk-input" placeholder={field} maxLength={300} value={editing.fields[field] ?? ''} onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, [field]: e.target.value } })} /></label>)}
        <div className="ac-buttons"><Btn type="submit" disabled={busy}>save encrypted</Btn><Btn kind="ghost" type="button" onClick={() => setEditing(null)}>cancel</Btn></div>
      </form>}
      {docs.map((doc) => <details key={doc.id}><summary>{doc.kind} · {doc.name}</summary>
        <ul className="disclosure-list">{Object.entries(doc.fields).filter(([, value]) => value).map(([field, value]) => { const id = `${doc.id}:${field}`; return <li key={id}><label><input type="checkbox" checked={selected.includes(id)} onChange={(e) => setSelected((all) => e.target.checked ? [...all, id] : all.filter((v) => v !== id))} /> {field}: {value}</label></li> })}</ul>
        <div className="ac-buttons"><button className="linkbtn" onClick={() => setEditing(doc)}>edit fields</button><button className="linkbtn" onClick={() => { const bytes = Uint8Array.from(atob(doc.file), (c) => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: doc.mime })); const a = document.createElement('a'); a.href = url; a.download = doc.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>download original</button><button className="linkbtn danger" disabled={busy} onClick={() => void run(async () => { await save(docs.filter((d) => d.id !== doc.id)); setSelected((all) => all.filter((v) => !v.startsWith(doc.id + ':'))) })}>remove</button></div>
      </details>)}
      {selected.length > 0 && <><p className="small">Only the checked text fields will be copied into your Fo message draft. Sending that message shares them with Wajo. Original documents stay here.</p><Btn onClick={() => { const fields = docs.flatMap((doc) => Object.entries(doc.fields).filter(([field]) => selected.includes(`${doc.id}:${field}`)).map(([field, value]) => `${field}: ${value}`)); openMagic({ prefill: `I want help with my travel using these reviewed document fields:\n${fields.join('\n')}\nPlease ask what I need before taking any action.`, assistant: true }) }}>review selected fields with Fo</Btn></>}
    </>}
    {envelope && <button className="linkbtn" onClick={backup}>encrypted backup</button>}
    <button className="linkbtn" disabled={busy} onClick={() => restore.current?.click()}>restore encrypted backup</button>
    <input type="file" hidden ref={restore} accept="application/json" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(async () => { if (f.size > 40_000_000) throw new Error('Backup is too large.'); const value: unknown = JSON.parse(await f.text()); if (!validEnvelope(value)) throw new Error('Not a supported encrypted vault backup.'); lock(); setRestoring(value); setMessage('Backup loaded for review. Enter its passphrase, then unlock. Existing device data has not been overwritten.'); }) }} />
    {message && <p className="small" role="status">{message}</p>}
  </section>
}
