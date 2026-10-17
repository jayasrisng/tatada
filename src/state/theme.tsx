import { useEffect, useState } from 'react'

/*
 * Theme: 'dark' (chalkboard) or 'light' (whiteboard). Follows the system on
 * first load; once the traveler picks one, that choice sticks. index.html
 * applies the same rule before first paint so there's no flash.
 */
export type Theme = 'dark' | 'light'
const KEY = 'tatada:theme'

const stored = (): Theme | null => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}
const system = (): Theme => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f7f5ef' : '#1d2723')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system())

  useEffect(() => {
    apply(theme)
  }, [theme])

  // Until the traveler chooses, keep following the system setting.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!mq) return
    const on = () => !stored() && setTheme(system())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* still switches for this session */
    }
    setTheme(next)
  }
  return { theme, toggle }
}
