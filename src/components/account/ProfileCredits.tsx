import { useStore } from '../../state/store'

export function ProfileCredits() {
  const {state}=useStore()
  return <details className="profile-section"><summary>Sources &amp; credits</summary>
    <p>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · <a href="#/policies/sources">All credits</a></p>
    {state.trips.filter(t=>t.research?.length).map(t=><details key={t.id}><summary>{t.destination}</summary>{t.research?.map(note=><div key={note.id}><p className="small dim">Checked {new Date(note.checkedAt).toLocaleString()}{!note.searched?' · Unverified':''}</p><ul>{[...new Map(note.sections.flatMap(s=>s.sources).map(s=>[s.url,s])).values()].map(s=><li key={s.url}><a href={/^https:\/\//.test(s.url)?s.url:undefined} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul></div>)}</details>)}
  </details>
}
