import { useEffect } from 'react'

/** A brief greeting once per app mount; it never delays a deep link or onboarding. */
export function Arrival({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 1800)
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onDone() }
    window.addEventListener('keydown', escape)
    return () => { clearTimeout(timer); window.removeEventListener('keydown', escape) }
  }, [onDone])
  return <div className="arrival" role="dialog" aria-modal="true" aria-labelledby="arrival-title">
    <svg width="100" height="100" viewBox="0 0 96 96" fill="none" aria-hidden="true"><path d="M48 18 54 40 77 34 60 49 77 65 54 58 48 80 42 58 19 65 36 49 19 34 42 40Z" /></svg>
    <p id="arrival-title">Hey {name || 'star'}.</p><span>Your next story is out there.</span>
    <button onClick={onDone} autoFocus>let’s go</button>
  </div>
}
