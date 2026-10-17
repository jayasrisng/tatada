import type { CSSProperties } from 'react'

/*
 * Hand-drawn icon set. The paths are deliberately a little wobbly, and the
 * #chalk filter (see ChalkDefs) roughens the strokes so they read as chalk.
 */
const P: Record<string, string> = {
  suitcase:
    'M6.5 11.2c6.4-.5 12.8-.4 19.2.1.9 4.6.8 9.5-.2 14.3-6.2.6-12.5.5-18.8-.1-.9-4.7-1-9.5-.2-14.3z M12.3 11c-.2-1.9 0-3.4.4-4.6 2.3-.5 4.6-.4 6.8.1.4 1.4.5 2.9.3 4.5 M11 11.6l.2 13.6 M21.2 11.5l-.3 13.7',
  check: 'M5.8 6.6c6.8-.6 13.6-.5 20.3.2.6 6.3.5 12.6-.3 18.9-6.6.6-13.2.5-19.8-.2-.7-6.3-.8-12.6-.2-18.9z M10.4 16.4l4.1 4.2 8.6-10.3',
  tick: 'M7 16.8l5.6 5.7L25.4 8.6',
  star: 'M16 4.2l3.1 8 8.4.4-6.6 5.4 2.4 8.4-7.3-4.8-7.1 4.9 2.2-8.4-6.7-5.4 8.5-.5z',
  sparkle: 'M16 3.5c.8 6.3 3.4 10.5 12.4 12.4-8.8 1.6-11.3 5.6-12.4 12.6-1-7-3.7-11-12.5-12.5 8.9-2 11.6-6.2 12.5-12.5z M26 3.8l.6 2.6 2.5.7-2.5.8-.6 2.5-.7-2.5-2.5-.8 2.5-.7z',
  home: 'M5.3 15.4L16.1 5.6l10.7 9.9 M8.2 13.1c-.2 4.4-.1 8.7.3 13 4.9.3 9.9.3 14.9-.1.3-4.3.3-8.6.1-12.9 M13.6 26.1c-.2-2.6 0-4.9.4-7 1.4-.3 2.8-.3 4.2 0 .3 2.3.4 4.6.2 7',
  plane: 'M4.5 18.6c7.4-2.4 14.9-5.6 22.6-9.6 1.3.7 1.6 1.7.6 2.9-4.3 4-9 7.1-14.1 9.4 M11 13.6L6.8 9.4l2.5-1 8 2.8 M13.4 20.9l2.6 6.1 2.1-1 .3-7.8 M4.5 18.6l4.6 2',
  bed: 'M4.6 9.3l.3 16.6 M4.8 20.6c7.6-.4 15.1-.3 22.7.1l-.1 5.4 M5 15.4c2.4-.4 4.8-.4 7.2.1l.1 4.8 M12.4 15.8c4.7-.8 9.6-.9 14.6.2.5 1.5.6 3 .5 4.6',
  tram: 'M8.6 7.4c5-.6 10-.6 14.9 0 .8 4.9.8 9.8 0 14.7-5 .6-10 .6-14.9 0-.8-4.9-.8-9.8 0-14.7z M8.9 14.6c4.7.3 9.4.3 14.2 0 M11.4 18.3h.2 M20.6 18.3h.2 M11 22.4l-2.4 4.2 M21 22.4l2.5 4.2 M12.8 4.3c2.2-.3 4.3-.3 6.5 0 M16 4.4v3',
  fork: 'M10.3 4.6c-.3 3.3-.3 6.4.1 9.4 1.6 1.2 3.3 1.2 5 0 .4-3 .4-6.1 0-9.4 M12.9 4.8v22.4 M21.6 27.2c-.1-7.3 0-14.6.3-22 3 1.9 4.2 5.8 3.6 11.7l-3.7.6',
  ticket: 'M4.8 9.6c7.5-.5 15-.5 22.5.1 0 1.8-.1 3.7-.3 5.5-1.6.2-1.6 2.6 0 2.8.2 1.8.3 3.6.2 5.4-7.5.6-15 .6-22.5 0 0-1.8.1-3.6.3-5.4 1.6-.4 1.6-2.4 0-2.8-.2-1.8-.3-3.7-.2-5.6z M20.2 10.2v1.8 M20.3 14.7v2.2 M20.2 19.8v2',
  camera: 'M4.8 10.6c7.4-.4 14.9-.4 22.4.1.5 4.9.5 9.8-.1 14.7-7.4.5-14.8.5-22.2 0-.6-4.9-.7-9.8-.1-14.8z M11.3 10.4l1.8-3.5c2-.3 3.9-.3 5.8 0l1.9 3.6 M16 13.7c2.4 0 4.1 1.6 4.1 3.9 0 2.4-1.7 4-4.1 4-2.3 0-4-1.6-4-4 0-2.3 1.7-3.9 4-3.9z',
  shirt: 'M11.6 5.2c1.3 2 2.8 3 4.4 3s3.1-1 4.4-3l6.6 3.6-2.4 5.5-3-1.4c.4 4.7.4 9.3 0 13.9-3.8.4-7.5.4-11.2 0-.4-4.6-.4-9.2 0-13.9l-3 1.4L5 8.8z',
  pencil: 'M7.2 24.8l1.5-5.8L21.9 5.6c1.5-.6 3.4 1.2 3.1 3L11.8 22.2zM18.7 8.9l3.7 3.8 M7.3 24.8l4.4-2.6',
  arrow: 'M4.4 21.2c5.3-6.4 12.4-9.7 21.2-10 M20.9 6.6c1.8 1.4 3.4 2.9 4.9 4.7-1.4 1.8-3 3.4-4.8 4.9',
  plus: 'M16.2 6.2c-.3 6.5-.3 13.1.1 19.6 M6.3 16.1c6.5-.4 13-.4 19.5.1',
  x: 'M7.6 7.4c5.7 5.6 11.3 11.4 16.8 17.4 M24.3 7.2C18.6 12.8 13.1 18.6 7.7 24.6',
  phone: 'M9.4 4.9l4.2 5.6-2.4 2.9c1.6 3.3 4 5.9 7.4 7.6l3-2.3 5.4 4.4-2.6 3.8C14.3 25.6 6.8 18 5.2 7.6z',
  mail: 'M4.7 8.6c7.6-.5 15.1-.5 22.6.1.4 5 .4 10-.1 15-7.5.5-15 .5-22.5 0-.4-5.1-.4-10.1 0-15.1z M5.2 9.3l10.8 8.4 10.9-8.5',
  pin: 'M16 27.6c-4.8-5.7-7.9-10-7.9-14.1 0-4.7 3.5-8.3 7.9-8.3s7.9 3.6 7.9 8.3c0 4.1-3.1 8.4-7.9 14.1z M16 10.3c1.8 0 3 1.2 3 3s-1.2 3-3 3-3-1.2-3-3 1.2-3 3-3z',
  printer: 'M9.4 12.1V5.2c4.4-.3 8.8-.3 13.2 0v6.9 M5.3 12.3c7.1-.4 14.2-.4 21.4.1.4 3.5.4 7-.1 10.5H22 M9.9 22.9H5.4c-.4-3.5-.4-7 0-10.5 M9.7 18.4c4.2-.3 8.4-.3 12.6 0l.1 8.6c-4.3.3-8.5.3-12.8 0z M12.4 21.6h7 M12.4 24.1h5',
  book: 'M16 8.1c-3.4-2.4-7.2-3-11.2-1.9-.4 5.9-.4 11.9 0 17.8 4-1 7.8-.5 11.2 1.9 3.4-2.4 7.2-2.9 11.2-1.9.4-5.9.4-11.9 0-17.8-4-1.1-7.8-.5-11.2 1.9z M16 8.3l.1 17.5',
  sun: 'M16 11.2c2.8 0 4.8 2 4.8 4.8s-2 4.8-4.8 4.8-4.8-2-4.8-4.8 2-4.8 4.8-4.8z M16 3.8v3.1 M16 25.2v3 M3.9 16h3 M25.1 16h3 M7.4 7.4l2.1 2.1 M22.5 22.5l2.1 2.1 M24.6 7.4l-2.1 2.1 M9.5 22.5l-2.1 2.1',
  heart: 'M16 26.4C9 21.6 4.8 17.6 4.9 12.6c.1-3.6 2.7-6.2 6-6.1 2.2 0 3.9 1.2 5.1 3.4 1.2-2.2 2.9-3.4 5.1-3.4 3.3-.1 5.9 2.5 6 6.1.1 5-4.1 9-11.1 13.8z',
  back: 'M19.8 6.4c-3.6 3-6.8 6.2-9.5 9.7 2.8 3.4 6 6.6 9.6 9.5',
  trash: 'M6.4 9.2c6.4-.4 12.8-.4 19.2 0 M12.8 8.9c0-1.6.3-2.8.8-3.8 1.6-.3 3.2-.3 4.8 0 .5 1 .8 2.2.8 3.8 M8.6 9.6l1.3 16.6c4.1.4 8.1.4 12.2 0l1.3-16.6 M13.5 13.4l.4 8.8 M18.6 13.4l-.4 8.8',
  lock: 'M8.1 14.5c5.3-.4 10.5-.4 15.8 0 .5 3.8.5 7.6 0 11.4-5.3.5-10.5.5-15.8 0-.5-3.8-.5-7.6 0-11.4z M11.4 14.3c-.3-5.6 1.3-8.6 4.6-8.6s4.9 3 4.6 8.6 M16 18.8v3',
  receipt: 'M7.6 4.8c5.6-.3 11.2-.3 16.8 0 .4 7.6.4 15.2 0 22.6l-2.8-1.8-2.8 1.8-2.8-1.8-2.8 1.8-2.8-1.8-2.8 1.8c-.4-7.4-.4-15 0-22.6z M11.4 10.6h9.3 M11.4 14.7h9.1 M11.4 18.8h5.6',
  note: 'M6.6 5.6c6.4-.4 12.9-.4 19.3.1.4 5.3.4 10.6-.1 15.8l-6 5.1c-4.4.3-8.8.3-13.2-.1-.5-7-.5-14 0-20.9z M19.7 26.3c-.3-2-.2-3.9.3-5.6 1.9-.3 3.8-.4 5.7-.2',
  search: 'M13.8 5.6c4.6 0 8 3.4 8 8s-3.4 8-8 8-8.1-3.4-8.1-8 3.5-8 8.1-8z M19.6 19.6l6.6 6.7',
  compass: 'M16 4.6c6.6 0 11.4 4.8 11.4 11.4S22.6 27.4 16 27.4 4.6 22.6 4.6 16 9.4 4.6 16 4.6z M20.8 11.2l-2.6 7-7 2.6 2.6-7z',
  bolt: 'M17.8 4.4L8.6 17.6l6.8.2-1.4 10 9.6-13.4-6.9-.1z',
  eye: 'M3.9 16.1c3.4-5.2 7.4-7.8 12.1-7.8s8.7 2.6 12.1 7.8c-3.4 5.1-7.4 7.6-12.1 7.6s-8.7-2.5-12.1-7.6z M16 12.6c2 0 3.4 1.4 3.4 3.4s-1.4 3.4-3.4 3.4-3.4-1.4-3.4-3.4 1.4-3.4 3.4-3.4z',
  moon: 'M20.6 4.8c-6.3 1-10.7 6.2-10.4 12.4.3 6.2 5.4 11 11.7 10.9 2-.1 3.9-.6 5.6-1.6-6.7-.4-11.6-5.9-11.2-12.5.2-3.5 1.8-6.7 4.3-9.2z M24.6 9.4l.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5z',
  umbrella: 'M4.5 16.2C5.6 9.7 10 6.1 16 6.1s10.4 3.6 11.5 10.1c-7.6-.6-15.3-.6-23 0z M16 16.2v8.5c0 1.8-1 2.7-2.4 2.7s-2.3-1-2.3-2.4 M16 3.9v2.2',
}

export type DoodleName = keyof typeof P

export function Doodle({
  name,
  size = 26,
  stroke = 2.1,
  className,
  style,
  title,
}: {
  name: DoodleName | string
  size?: number
  stroke?: number
  className?: string
  style?: CSSProperties
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`doodle ${className ?? ''}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d={P[name] ?? P.star} />
    </svg>
  )
}

/** Global SVG filters shared by every chalk element. Mounted once. */
export function ChalkDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <filter id="chalk" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="2.2" numOctaves="1" seed="8" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="mask" />
          <feComposite in="d" in2="mask" operator="in" />
        </filter>
        {/* Dry-erase marker: smooth, slightly wavering ink with a soft edge; no chalk grain. */}
        <filter id="marker" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="0.25" />
        </filter>
        <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  )
}

/** A hand-drawn underline that sits under headings. */
export function Scribble({ color = 'var(--yellow)', width = 120 }: { color?: string; width?: number }) {
  return (
    <svg className="scribble" width={width} height="12" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden>
      <path d="M2 8.5c18-3.6 40-5 62-4.4 18 .5 36 1.8 54 .4 M10 10.5c22-2 48-2.6 74-1.6" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" style={{ filter: 'var(--stroke-filter)' }} />
    </svg>
  )
}

/** Curvy hand-drawn arrow used as decoration. */
export function CurvyArrow({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg className={className} width="74" height="54" viewBox="0 0 74 54" fill="none" aria-hidden style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
      <path d="M4 6c10 2 24 8 30 18 5 9 3 18 -2 20 -6 2 -9 -6 -2 -10 9 -6 22 -2 34 10 M58 34l7 9.6-11.4 1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'var(--stroke-filter)' }} />
    </svg>
  )
}

/** Wajo's official Fo icon (see public/brand/README.md), inside a hand-drawn ring. */
export function FoMark({ size = 64, ring = true }: { size?: number; ring?: boolean }) {
  return (
    <span className="fo-mark" style={{ width: size, height: size }}>
      <img src="/brand/wajo-fo.png" alt="" width={size} height={size} draggable={false} />
      {ring && (
        <svg className="fo-ring" viewBox="0 0 100 100" aria-hidden>
          <path d="M50 3.5c26 .4 46.2 20.6 46 46.8-.2 25.6-21 46.5-46.6 46.2C23.9 96.2 3.6 75.4 3.9 49.6 4.2 23.1 25.1 3.8 52.4 4.6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}
