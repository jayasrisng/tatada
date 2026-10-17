/* Date helpers. ISO dates are calendar dates, so everything runs in UTC to
 * keep weekday labels stable regardless of the viewer's time zone. */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

export const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) &&
  new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s

export const isTime = (s: unknown): s is string => typeof s === 'string' && HH_MM.test(s)

const utc = (iso: string) => new Date(iso + 'T00:00:00Z')

/** "Sat, Nov 7" */
export const fmtDay = (iso: string) =>
  utc(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "Saturday" */
export const weekday = (iso: string) => utc(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

/** "11:30" → "11:30am" */
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`
}

export const addDays = (iso: string, n: number) => {
  const d = utc(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const localToday = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

export const nightsBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000)

/** Every calendar day from start to end inclusive. */
export const daysOf = (start: string, end: string) => {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 60; d = addDays(d, 1)) out.push(d)
  return out
}
