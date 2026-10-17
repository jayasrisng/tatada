import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/* Tiny hash router: #/trips/lisbon/notebook → ['trips', 'lisbon', 'notebook'] */
export function useRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
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
  return (
    <Ctx.Provider value={{ magic, openMagic: (o = {}) => setMagic({ ...o, open: true }), closeMagic: () => setMagic(null) }}>
      {children}
    </Ctx.Provider>
  )
}

export function useUI() {
  const u = useContext(Ctx)
  if (!u) throw new Error('useUI outside provider')
  return u
}
