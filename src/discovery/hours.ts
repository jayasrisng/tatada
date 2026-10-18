/*
 * Conservative reader for OpenStreetMap `opening_hours`. It understands the
 * common weekly forms ("Mo-Fr 07:00-18:00; Sa,Su 08:00-17:00", "24/7",
 * "Mo off", times past midnight). Anything else (months, dates, sunrise,
 * comments, open ends) returns undefined so the app says "hours not listed"
 * instead of guessing. Public-holiday rules are ignored and flagged.
 */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
export interface WeeklyHours { days: [number, number][][]; holidayCaveat: boolean }

const minutes = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m && Number(m[1]) <= 48 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : undefined }

function daySet(selector: string): number[] | undefined {
  const out = new Set<number>()
  for (const part of selector.split(',')) {
    const range = /^([A-Z][a-z])(?:-([A-Z][a-z]))?$/.exec(part.trim())
    if (!range) return undefined
    const a = DAYS.indexOf(range[1]), b = range[2] ? DAYS.indexOf(range[2]) : a
    if (a < 0 || b < 0) return undefined
    for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break }
  }
  return [...out]
}

export function parseOpeningHours(value?: string): WeeklyHours | undefined {
  const text = value?.trim()
  if (!text || text.length > 300) return undefined
  if (text === '24/7') return { days: DAYS.map(() => [[0, 1440]]), holidayCaveat: false }
  const days: [number, number][][] = DAYS.map(() => [])
  let holidayCaveat = false
  // ';' starts a rule that replaces earlier ones for its days; ', ' before a day adds to them.
  for (const rule of text.split(/\s*;\s*/).filter(Boolean)) {
    const touched = new Set<number>()
    for (const piece of rule.split(/,\s+(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/)) {
      const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(.*)$/.exec(piece.trim())
      if (!m) return undefined
      let selector = m[1] ?? 'Mo-Su'
      const times = m[2].trim()
      if (/\b(PH|SH)\b/.test(selector)) {
        holidayCaveat = true
        selector = selector.split(',').filter((s) => !/^(PH|SH)$/.test(s)).join(',')
        if (!selector) continue
      }
      const set = daySet(selector)
      if (!set) return undefined
      const intervals: [number, number][] = []
      if (!/^(off|closed)$/i.test(times)) {
        for (const span of times.split(/\s*,\s*/)) {
          const [a, b] = span.split('-')
          const start = minutes(a ?? ''), end0 = minutes(b ?? '')
          if (start === undefined || end0 === undefined || start >= 1440) return undefined
          const end = end0 <= start ? end0 + 1440 : end0
          intervals.push([start, end])
        }
      }
      for (const d of set) {
        if (!touched.has(d)) { days[d] = []; touched.add(d) }
        days[d] = [...days[d], ...intervals].sort((x, y) => x[0] - y[0])
      }
    }
  }
  return { days, holidayCaveat }
}

export type OpenStatus =
  | { state: 'open'; closesAt?: number; closesTomorrow?: boolean; allDay?: boolean }
  | { state: 'closed'; opensAt?: number; inDays?: number }

/** weekday: 0 = Monday … 6 = Sunday, in the place's local time. */
export function openStatus(hours: WeeklyHours, weekday: number, minute: number): OpenStatus {
  const today = hours.days[weekday], yesterday = hours.days[(weekday + 6) % 7]
  if (hours.days.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] >= 1440)) return { state: 'open', allDay: true }
  const late = yesterday.find(([, end]) => end > 1440 && minute < end - 1440)
  if (late) return { state: 'open', closesAt: late[1] - 1440 }
  const now = today.find(([start, end]) => minute >= start && minute < end)
  if (now) return { state: 'open', closesAt: now[1] % 1440, closesTomorrow: now[1] > 1440 }
  const later = today.find(([start]) => start > minute)
  if (later) return { state: 'closed', opensAt: later[0], inDays: 0 }
  for (let i = 1; i < 7; i++) {
    const next = hours.days[(weekday + i) % 7][0]
    if (next) return { state: 'closed', opensAt: next[0], inDays: i }
  }
  return { state: 'closed' }
}

/** Current UTC offset of a zone in minutes, or undefined for an unknown zone. */
export function zoneOffset(zone: string, at: Date): number | undefined {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at).map((x) => [x.type, Number(x.value)]))
    return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000)
  } catch { return undefined }
}

/** Wall-clock weekday (0 = Monday) and minute of the day in a zone. */
export function localTimeIn(zone: string, at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', weekday: 'short', hour: 'numeric', minute: 'numeric' }).formatToParts(at).map((x) => [x.type, x.value]))
  return { weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday), minute: Number(p.hour) * 60 + Number(p.minute) }
}
