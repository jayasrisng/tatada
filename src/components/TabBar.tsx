import { Doodle, MagicBuddy } from './Doodle'
import { go, useUI } from '../state/ui'
import { useStore } from '../state/store'

const TABS = [
  { id: '', label: 'Home', icon: 'home' },
  { id: 'trips', label: 'Trips', icon: 'suitcase' },
  { id: 'magic', label: 'Magic', icon: 'sparkle' },
  { id: 'tasks', label: 'Tasks', icon: 'check' },
  { id: 'style', label: 'Style', icon: 'shirt' },
] as const

export function TabBar({ current, tripId }: { current: string; tripId?: string }) {
  const { openMagic } = useUI()
  const { state } = useStore()
  // Compact pending count: open tasks plus requests waiting for the traveler.
  const pending = state.items.filter((i) => !i.done).length + state.actions.filter((a) => a.status === 'needs_input' || a.status === 'proposed').length

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) =>
        t.id === 'magic' ? (
          <button key={t.id} className="tab-magic" onClick={() => openMagic({ tripId })} aria-label="Ask Magic">
            <MagicBuddy size={50} />
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
