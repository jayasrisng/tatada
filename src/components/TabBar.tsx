import { useState } from 'react'
import { Doodle, MagicBuddy } from './Doodle'
import { go, useUI } from '../state/ui'
import { useStore } from '../state/store'

const TABS = [
  { id: '', label: 'Home', icon: 'home' },
  { id: 'trips', label: 'Trips', icon: 'suitcase' },
  { id: 'magic', label: 'Magic', icon: 'sparkle' },
  { id: 'tasks', label: 'Tasks', icon: 'check' },
  { id: 'style', label: 'Closet', icon: 'shirt' },
] as const

export function TabBar({ current, tripId }: { current: string; tripId?: string }) {
  const { openMagic, focusTripId, setFocusTrip } = useUI()
  const { state } = useStore()
  const [menu, setMenu] = useState(false)
  // Match the open rows shown by Tasks, including ideas and memories.
  const pending = state.items.filter((i) => !i.done).length

  const focused = state.trips.find(t => t.id === focusTripId)
  if (focused) return <nav className="trip-nav" aria-label="Main">
    {menu && <div className="trip-nav-menu" role="group" aria-label="Trip sections" onKeyDown={e=>{if(e.key==='Escape')setMenu(false)}}>
      <p className="small dim">{focused.destination}</p>
      {[['Plan',`/trip/${focused.id}`],['Flights',`/trip/${focused.id}/notebook?category=flight`],['Stay',`/trip/${focused.id}/notebook?category=stay`],['Getting around',`/trip/${focused.id}/notebook?category=move`],['Eat',`/trip/${focused.id}/notebook?category=eat`],['Journal',`/trip/${focused.id}/journal`],['Tasks','/tasks'],['Closet','/style']].map(([label,path])=><button key={label} onClick={()=>{go(path);setMenu(false)}}>{label}</button>)}
      <button className="trip-mode-exit" onClick={()=>{setFocusTrip(undefined);setMenu(false);go('/')}}>leave trip mode</button>
    </div>}
    <button className="trip-nav-overview" aria-label="Home" onClick={()=>{go('/');setMenu(false)}}>overview</button>
    <button className="trip-nav-magic iconbtn" onClick={()=>openMagic({tripId:focused.id,assistant:true})} aria-label="Ask Magic"><Doodle name="sparkle" size={28} /></button>
    <button className="iconbtn" aria-label="Trip menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Doodle name={menu?'x':'menu'} size={24} /></button>
  </nav>
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) =>
        t.id === 'magic' ? (
          <button key={t.id} className="tab-magic" onClick={() => openMagic({ tripId: focusTripId ?? tripId })} aria-label="Ask Magic">
            <MagicBuddy size={50} />
            <span className="tab-magic-label" aria-hidden="true">Magic</span>
          </button>
        ) : (
          <button key={t.id} className={`tab ${current === t.id ? 'on' : ''}`} onClick={() => go(`/${t.id}`)} aria-current={current === t.id ? 'page' : undefined}>
            <Doodle name={t.icon} size={24} />
            <span>{t.label}</span>
            {t.id === 'tasks' && pending > 0 && <i className="dot" aria-label={`${pending} pending`}>{pending > 99 ? '99+' : pending}</i>}
          </button>
        ),
      )}
    </nav>
  )
}
