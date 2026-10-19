import { useState } from 'react'
import { useStore } from '../state/store'
import { listOriginals, readOriginal, downloadOriginal, deleteOriginal, type Original } from '../travel/originals'

export function OriginalLibrary() {
  const { workspace } = useStore()
  const [rows, setRows] = useState<Omit<Original, 'bytes'>[] | null>(null)
  const [error, setError] = useState('')
  const load = () => listOriginals(workspace.storageKey).then(setRows).catch(() => setError('Could not read device confirmation storage.'))
  const download = async (id: string) => {
    try {
      const file = await readOriginal(workspace.storageKey, id)
      if (!file) throw new Error('File is no longer on this device.')
      downloadOriginal(file)
    } catch (e) { setError((e as Error).message) }
  }
  const remove = async (id: string) => {
    try { await deleteOriginal(workspace.storageKey, id); await load() }
    catch (e) { setError((e as Error).message) }
  }
  return <details className="original-library" onToggle={e => { if (e.currentTarget.open) void load() }}>
    <summary>Original confirmations on this device</summary>
    <p className="small dim">Includes originals kept after removing reservation details. Download backups or delete individual files here. Files are separate from your passport vault and server export.</p>
    {rows?.map(r => <p className="small" key={r.id}>
      {r.name}{' '}
      <button className="linkbtn" aria-label={`Download original ${r.name}`} onClick={() => void download(r.id)}>download</button>{' '}
      <button className="linkbtn" aria-label={`Delete original ${r.name}`} onClick={() => void remove(r.id)}>delete file</button>
    </p>)}
    {rows?.length === 0 && <p className="small dim">No original confirmations on this device.</p>}
    {error && <p role="alert">{error}</p>}
  </details>
}
