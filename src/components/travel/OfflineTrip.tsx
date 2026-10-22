import { Disclosure } from '../layout/Disclosure'
import {stopSentence} from '../../assistant/stop'
import {fmtDay,fmtTime} from '../../magic/dates'
import {TripGuide} from './TripGuide'
import { useEffect, useState } from 'react'
import type { Trip } from '../../types'
import { useStore } from '../../state/store'
import { useServer } from '../../state/server'
import { makePack, packKey, loadSelectedPack, OFFLINE_SELECTED, prepareOfflineShell, type TripPack } from '../../offline/pack'
import { readOriginal, downloadOriginal } from '../../travel/originals'
import { Btn } from '../layout/ui'
import { NextStep } from './NextStep'

export function OfflineDownload({ trip, inline = false }: { trip: Trip; inline?: boolean }) {
  const { workspace } = useStore(), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const key = packKey(workspace.storageKey, trip.id)
  const [saved, setSaved] = useState<TripPack | null>(() => { try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null } })
  return <Disclosure inline={inline} className="offline-download" title="Keep this trip offline">
    <p className="small dim">Itinerary, reservations, addresses, saved guidance and originals on this device. Live status needs internet. Anyone using this browser can open the saved pack.</p>
    {saved && <p className="small">Downloaded {new Date(saved.savedAt).toLocaleString()} · {saved.trip.bookings.length} reservations · {saved.trip.itinerary?.length ?? 0} stops · {saved.tickets.length} originals. Update after edits. Server last synced: {saved.lastSyncedAt?new Date(saved.lastSyncedAt).toLocaleString():'not recorded; device copy only'}.</p>}
    <div className="ac-buttons"><Btn disabled={busy} onClick={async () => { setBusy(true); setMessage('Downloading app and checking originals…'); try {
      await prepareOfflineShell()
      const tickets: string[] = [], missing: string[] = []
      for (const b of trip.bookings) if (b.originalId) { if (await readOriginal(workspace.storageKey, b.originalId)) tickets.push(b.originalId); else missing.push(b.title) }
      const pack = makePack(workspace.storageKey, trip, tickets,new Date(),workspace.lastSyncedAt)
      localStorage.setItem(key, JSON.stringify(pack)); localStorage.setItem(OFFLINE_SELECTED, key); setSaved(pack)
      setMessage(missing.length ? `Trip saved. Missing originals: ${missing.join(', ')}. Re-upload them on this device.` : 'Ready for offline launch. You can put your phone away.')
    } catch (e) { setMessage((e as Error).message) } finally { setBusy(false) } }}>{saved ? 'update offline trip' : 'download trip'}</Btn>
    {saved && <Btn kind="ghost" disabled={busy} onClick={() => { localStorage.removeItem(key); if (localStorage.getItem(OFFLINE_SELECTED) === key) localStorage.removeItem(OFFLINE_SELECTED); setSaved(null); setMessage('Offline pack deleted. Original confirmations remain beside their records until you delete them.') }}>remove download</Btn>}</div>
    {message && <p role="status">{message}</p>}
  </Disclosure>
}
/** Cold launch uses only the expressly downloaded pack, without restoring authentication or opening the private vault. */
export function OfflineTrip({ pack }: { pack: TripPack }) {
  const server = useServer(), [message, setMessage] = useState('')
  useEffect(() => { const reconnect = () => void server.refresh(); window.addEventListener('online', reconnect); return () => window.removeEventListener('online', reconnect) }, [server.refresh])
  return <div className="frame"><main className="app"><div className="screen"><h1>{pack.trip.destination}</h1><p role="status">Offline essentials · saved {new Date(pack.savedAt).toLocaleString()}</p><p className="small dim">Server last synced: {pack.lastSyncedAt?new Date(pack.lastSyncedAt).toLocaleString():'not recorded; device copy only'}. Saved information only. No live flight status or directions. Your full workspace and pending edits reopen after reconnection and sign-in.</p>
    <NextStep trip={pack.trip} offline />
    <h2>Reservations</h2>{pack.trip.bookings.map(b => <article className="ticket" key={b.id}><div><h3>{b.title}</h3><p>{b.when}</p><p>{b.address}</p><p>{b.detail}</p><code>{b.ref}</code>{b.originalId && pack.tickets.includes(b.originalId) && <button className="linkbtn" onClick={async () => { try { const file = await readOriginal(pack.workspace, b.originalId!); if (!file) throw new Error('Original was deleted on this device.'); downloadOriginal(file) } catch (e) { setMessage((e as Error).message) } }}>open original ticket</button>}</div></article>)}
    {pack.trip.localAddress && <p>{pack.trip.localAddress}</p>}<h2>Your days</h2>{pack.trip.itinerary?.map(i => <article className="offline-stop" key={i.id}><p>{fmtDay(i.day)} {i.time?fmtTime(i.time):''} · {stopSentence(i.title)}</p>{i.note&&<details><summary>details</summary><p className="small">{i.note}</p></details>}</article>)}
    {pack.trip.planGuide&&<TripGuide guide={pack.trip.planGuide}/>}
    <details><summary>Saved guidance</summary>{pack.trip.research?.map(r => <div key={r.id}><p className="small dim">Checked {r.checkedAt}; may have changed.</p>{r.sections.map((s, i) => <p key={i}>{s.text}</p>)}</div>)}</details>
    <Btn kind="ghost" onClick={() => void server.refresh()}>reconnect</Btn>{message && <p role="alert">{message}</p>}
  </div></main></div>
}
export { loadSelectedPack }
