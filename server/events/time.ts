// Time-zone helpers built on Intl only (works in Node, Deno and browsers).

export const validTimeZone = (tz: unknown): tz is string => {
  if (typeof tz !== 'string' || !tz) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

/** Wall-clock parts of an instant in a zone. */
export function zonedParts(at: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  }).formatToParts(at).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    epochAsUtc: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)),
  }
}

/** Converts a local date ('YYYY-MM-DD') and time ('HH:mm') in `timeZone` to a UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | undefined {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!d || !t || !validTimeZone(timeZone)) return undefined
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  // Two passes settle the offset, including across DST transitions.
  let guess = wall
  for (let i = 0; i < 2; i++) guess = wall - (zonedParts(new Date(guess), timeZone).epochAsUtc - guess)
  return Number.isFinite(guess) ? new Date(guess) : undefined
}

export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
