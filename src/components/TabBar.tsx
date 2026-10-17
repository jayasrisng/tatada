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
  const waiting = state.actions.filter((a) => a.status === 'needs_input' || a.status === 'proposed').length

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) =>
        t.id === 'magic' ? (
          <button key={t.id} className="tab-magic" onClick={() => openMagic({ tripId })} aria-label="Magic">
            <MagicBuddy size={50} />
          </button>
        ) : (
          <button key={t.id} className={`tab ${current === t.id ? 'on' : ''}`} onClick={() => go(`/${t.id}`)} aria-current={current === t.id ? 'page' : undefined}>
            <Doodle name={t.icon} size={24} />
            <span>{t.label}</span>
            {t.id === 'tasks' && waiting > 0 && <i className="dot">{waiting}</i>}
          </button>
        ),
      )}
    </nav>
  )
}
