import { useEffect, useState } from 'react'
import { localToday } from '../magic/dates'
/** Re-check after midnight, tab resume, or a device timezone change. No location is inferred. */
export function useToday() {
  const [today, setToday] = useState(localToday)
  useEffect(() => {
    const refresh = () => setToday(localToday())
    const timer = window.setInterval(refresh, 30_000)
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  return today
}
