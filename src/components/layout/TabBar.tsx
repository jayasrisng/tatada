import { Doodle, MagicBuddy } from './Doodle'
import { go, useUI, useRoute } from '../../state/ui'
import { useStore } from '../../state/store'

const TABS = [
  { id: '', label: 'Home', icon: 'home' },
  { id: 'trips', label: 'Trips', icon: 'suitcase' },
  { id: 'magic', label: 'Magic', icon: 'sparkle' },
  { id: 'tasks', label: 'Tasks', icon: 'check' },
  { id: 'style', label: 'Closet', icon: 'shirt' },
] as const

export function TabBar({ current, tripId }: { current: string; tripId?: string }) {
  const { openMagic, focusTripId } = useUI()
  const { state } = useStore()
  const route = useRoute()
  // Match the open rows shown by Tasks, including ideas and memories.
  const pending = state.items.filter((i) => !i.done).length

  const focused = state.trips.find(t => t.id === focusTripId)
  if (focused) return <nav className="trip-nav" aria-label="Trip navigation">
    {[{id:'plan',label:'Overview',icon:'home'},{id:'itinerary',label:'Itinerary',icon:'compass'},{id:'notebook',label:'Bookings',icon:'ticket'},{id:'journal',label:'Journal',icon:'book'}].map(t => <button key={t.id} data-tour={`section-${t.id}`} className={`trip-nav-tab ${route[0]==='trip' && (route[2] ?? 'plan')===t.id?'on':''}`} aria-label={t.label} title={t.label} aria-current={route[0]==='trip' && (route[2] ?? 'plan')===t.id?'page':undefined} onClick={()=>go(`/trip/${focused.id}/${t.id}`)}><Doodle name={t.icon} size={27}/><span>{t.label}</span></button>)}
  </nav>
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) =>
        t.id === 'magic' ? (
          <button key={t.id} data-tour="magic" className="tab-magic" onClick={() => openMagic({ tripId: focusTripId ?? tripId })} aria-label="Ask Magic">
            <MagicBuddy size={50} />
            <span className="tab-magic-label" aria-hidden="true">Magic</span>
          </button>
        ) : (
          <button key={t.id} data-tour={`nav-${t.id}`} className={`tab ${current === t.id ? 'on' : ''}`} onClick={() => go(`/${t.id}`)} aria-current={current === t.id ? 'page' : undefined}>
            <Doodle name={t.icon} size={24} />
            <span>{t.label}</span>
            {t.id === 'tasks' && pending > 0 && <i className="dot" aria-label={`${pending} pending`}>{pending > 99 ? '99+' : pending}</i>}
          </button>
        ),
      )}
    </nav>
  )
}
