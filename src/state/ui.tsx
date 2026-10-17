import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/* Tiny hash router: #/trips/lisbon/notebook?x=1 → ['trips', 'lisbon', 'notebook'] */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean)
  const [parts, setParts] = useState(read)
  useEffect(() => {
    const on = () => {
      setParts(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return parts
}

/** Query parameters after the hash route, e.g. #/welcome?fo=connected. */
export const hashQuery = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '')

export const go = (path: string) => {
  window.location.hash = path.startsWith('/') ? path : `/${path}`
}

interface MagicOpts {
  tripId?: string
  prefill?: string
  itemId?: string
  autoSend?: boolean
}

interface UI {
  magic: (MagicOpts & { open: boolean }) | null
  openMagic: (o?: MagicOpts) => void
  closeMagic: () => void
}

const Ctx = createContext<UI | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [magic, setMagic] = useState<UI['magic']>(null)
  const opener = useRef<HTMLElement | null>(null)
  const openMagic = (o: MagicOpts = {}) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setMagic({ ...o, open: true })
  }
  const closeMagic = () => {
    setMagic(null)
    // Return focus to whatever opened Magic, once the background is interactive again.
    const el = opener.current
    requestAnimationFrame(() => el?.isConnected && el.focus())
  }
  return (
    <Ctx.Provider value={{ magic, openMagic, closeMagic }}>
      {children}
    </Ctx.Provider>
  )
}

export function useUI() {
  const u = useContext(Ctx)
  if (!u) throw new Error('useUI outside provider')
  return u
}
