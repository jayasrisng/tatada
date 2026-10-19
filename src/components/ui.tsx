import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Doodle, Scribble, type DoodleName } from './Doodle'
import { localToday } from '../magic/dates'
import { go } from '../state/ui'

type Tint = 'yellow' | 'pink' | 'blue' | 'green' | 'orange' | 'chalk'

export function Btn({
  kind = 'chalk',
  icon,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'chalk' | 'solid' | 'ghost' | 'danger'; icon?: DoodleName }) {
  return (
    <button className={`btn btn-${kind} ${className ?? ''}`} {...rest}>
      {icon && <Doodle name={icon} size={20} />}
      {children && <span>{children}</span>}
    </button>
  )
}

export function Chip({
  children,
  on,
  tint = 'chalk',
  onClick,
  icon,
}: {
  children: ReactNode
  on?: boolean
  tint?: Tint
  onClick?: () => void
  icon?: DoodleName
}) {
  const El = onClick ? 'button' : 'span'
  return (
    // type="button": a chip inside a form must never submit it.
    <El className={`chip tint-${tint} ${on ? 'on' : ''}`} onClick={onClick} aria-pressed={onClick ? !!on : undefined} {...(onClick ? { type: 'button' as const } : {})}>
      {icon && <Doodle name={icon} size={15} stroke={2.4} />}
      {children}
    </El>
  )
}

/** A hand-drawn bordered box. The wobbly border lives on a pseudo-element so text stays crisp. */
export function Box({
  children,
  className,
  tint,
  dashed,
  onClick,
}: {
  children: ReactNode
  className?: string
  tint?: Tint
  dashed?: boolean
  onClick?: () => void
}) {
  return (
    <div
      className={`box ${tint ? `tint-${tint}` : ''} ${dashed ? 'dashed' : ''} ${onClick ? 'tappable' : ''} ${className ?? ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick()) : undefined}
    >
      {children}
    </div>
  )
}

export function Paper({ children, className, tilt = 0 }: { children: ReactNode; className?: string; tilt?: number }) {
  return (
    <div className={`paper ${className ?? ''}`} style={{ transform: `rotate(${tilt}deg)` }}>
      {children}
    </div>
  )
}

export function ChalkCheck({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button className={`ccheck ${checked ? 'on' : ''}`} onClick={onChange} role="checkbox" aria-checked={checked} aria-label={label}>
      <svg viewBox="0 0 32 32" width="28" height="28" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path className="ccheck-box" strokeWidth="2" d="M5.8 6.6c6.8-.6 13.6-.5 20.3.2.6 6.3.5 12.6-.3 18.9-6.6.6-13.2.5-19.8-.2-.7-6.3-.8-12.6-.2-18.9z" />
        <path className="ccheck-tick" strokeWidth="2.8" d="M9.4 16.4l4.6 5.2 11-14.4" />
      </svg>
    </button>
  )
}

export function Heading({ children, sub, tint = 'var(--yellow)', small }: { children: ReactNode; sub?: ReactNode; tint?: string; small?: boolean }) {
  return (
    <div className={`heading ${small ? 'small' : ''}`}>
      <h1>{children}</h1>
      <Scribble color={tint} width={small ? 80 : 130} />
      {sub && <p className="sub">{sub}</p>}
    </div>
  )
}

export function TopBar({ back, right, title }: { back?: string; right?: ReactNode; title?: ReactNode }) {
  return (
    <div className="topbar">
      {back ? (
        <button className="iconbtn" onClick={() => (back === 'history' ? history.back() : go(back))} aria-label="Back">
          <Doodle name="back" size={26} />
        </button>
      ) : (
        <span />
      )}
      {title && <div className="topbar-title">{title}</div>}
      <div className="topbar-right">{right}</div>
    </div>
  )
}

/** Unmissable marker that a result was simulated, not executed. */
export function SimStamp({ real }: { real?: boolean }) {
  return <span className={`stamp ${real ? 'real' : 'sim'}`}>{real ? 'REAL · via Fo' : 'SIMULATED'}</span>
}

export function SampleNote({ children }: { children: ReactNode }) {
  return (
    <p className="sample-note">
      <Doodle name="eye" size={16} /> {children}
    </p>
  )
}

export const fmtRange = (a: string, b: string) => {
  const o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }
  const s = new Date(a + 'T00:00:00Z')
  const e = new Date(b + 'T00:00:00Z')
  const sameMonth = s.getUTCMonth() === e.getUTCMonth()
  return `${s.toLocaleDateString('en-US', o)} – ${sameMonth ? e.getUTCDate() : e.toLocaleDateString('en-US', o)}`
}

/** Days until a date, from today's local date. */
const d = new Date()
export const TODAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const daysUntil = (iso: string) =>
  Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(localToday() + 'T00:00:00Z')) / 86400000)
