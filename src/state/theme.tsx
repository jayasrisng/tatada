import { useEffect, useState } from 'react'

/*
 * Theme: 'dark' (chalkboard) or 'light' (whiteboard). Defaults to blackboard on
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
const system = (): Theme => 'dark'

function apply(t: Theme) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#f7f5ef' : '#191a1d')
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => stored() ?? system())

  useEffect(() => {
    apply(theme)
  }, [theme])

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
