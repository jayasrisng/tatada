import { useState } from 'react'
import { uid, useStore } from '../state/store'
import { go } from '../state/ui'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, TopBar } from '../components/ui'
import type { ChecklistItem, Trip } from '../types'
import { addDays, isIsoDate, localToday, nightsBetween } from '../magic/dates'

const PLACES = ['Lisbon', 'Mexico City', 'Kyoto', 'Big Sur', 'Copenhagen']
const VIBES = ['food', 'slow mornings', 'museums', 'nature', 'nightlife', 'design', 'beaches', 'walkable']
const NEEDS = ['vegetarian', 'no flights before 9am', 'no red-eyes', 'step-free', 'traveling with a dog']
const DEALS = ['Amex Gold', 'AAA', 'student', 'Marriott Bonvoy', 'TAP Miles&Go']
const WHO = ['solo', 'with partner', 'with friends', 'with kids']
const TINTS: Trip['tint'][] = ['blue', 'orange', 'pink', 'green', 'yellow']

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function dateProblem(start: string, end: string, today = localToday()): string | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return 'Pick both dates.'
  if (start < today) return 'The trip can\'t start in the past.'
  if (end < start) return 'Coming back has to be on or after leaving.'
  if (nightsBetween(start, end) > 60) return 'That\'s over 60 nights. Split it into separate trips.'
  return null
}

export function NewTrip() {
  const { state, dispatch } = useStore()
  const p = state.profile
  const [step, setStep] = useState(0)
  const [where, setWhere] = useState('')
  // Rolling defaults: a long weekend about a month out.
  const [start, setStart] = useState(() => addDays(localToday(), 30))
  const [end, setEnd] = useState(() => addDays(localToday(), 34))
  const dateError = dateProblem(start, end)
  const [who, setWho] = useState('with partner')
  const [count, setCount] = useState(2)
  const [budget, setBudget] = useState(2000)
  const [vibe, setVibe] = useState<string[]>(p.style)
  const [needs, setNeeds] = useState<string[]>(p.diet)
  const [deals, setDeals] = useState<string[]>(p.memberships)

  const steps = [
    {
      q: 'where to?',
      ok: where.trim().length > 1,
      body: (
        <>
          <input className="chalk-input big" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="a city, a coast, a feeling…" autoFocus aria-label="Destination" />
          <div className="chips wrap">
            {PLACES.map((x) => (
              <Chip key={x} on={where === x} onClick={() => setWhere(x)}>
                {x}
              </Chip>
            ))}
          </div>
        </>
      ),
    },
    {
      q: 'when?',
      ok: !dateError,
      body: (
        <>
          <div className="date-row">
            <label>
              <span>leave</span>
              <input
                type="date"
                className="chalk-input"
                value={start}
                min={localToday()}
                onChange={(e) => {
                  const v = e.target.value
                  setStart(v)
                  // Keep the trip length when the start moves past the end.
                  if (isIsoDate(v) && end < v) setEnd(addDays(v, Math.max(0, nightsBetween(start, end))))
                }}
                aria-invalid={!!dateError}
              />
            </label>
            <Doodle name="arrow" size={28} />
            <label>
              <span>back</span>
              <input type="date" className="chalk-input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} aria-invalid={!!dateError} />
            </label>
          </div>
          {dateError ? <p className="ac-problem" role="alert">{dateError}</p> : <p className="dim small">{nightsBetween(start, end)} nights</p>}
        </>
      ),
    },
    {
      q: 'who\'s coming?',
      ok: count > 0,
      body: (
        <>
          <div className="chips wrap">
            {WHO.map((x) => (
              <Chip key={x} on={who === x} onClick={() => (setWho(x), setCount(x === 'solo' ? 1 : Math.max(count, 2)))}>
                {x}
              </Chip>
            ))}
          </div>
          <div className="stepper">
            <button onClick={() => setCount(Math.max(1, count - 1))} aria-label="Fewer travelers">−</button>
            <span>
              {count} {count === 1 ? 'traveler' : 'travelers'}
            </span>
            <button onClick={() => setCount(count + 1)} aria-label="More travelers">+</button>
          </div>
        </>
      ),
    },
    {
      q: 'budget?',
      ok: true,
      body: (
        <div className="budget">
          <span className="budget-num">${budget.toLocaleString()}</span>
          <input type="range" min={500} max={10000} step={100} value={budget} onChange={(e) => setBudget(+e.target.value)} aria-label="Budget" />
          <span className="dim">for the whole trip, everyone</span>
        </div>
      ),
    },
    {
      q: 'what\'s the vibe?',
      ok: true,
      body: (
        <div className="chips wrap">
          {VIBES.map((x) => (
            <Chip key={x} on={vibe.includes(x)} tint="pink" onClick={() => setVibe(toggle(vibe, x))}>
              {x}
            </Chip>
          ))}
        </div>
      ),
    },
    {
      q: 'anything I should know?',
      ok: true,
      body: (
        <>
          <p className="dim small">needs</p>
          <div className="chips wrap">
            {NEEDS.map((x) => (
              <Chip key={x} on={needs.includes(x)} tint="blue" onClick={() => setNeeds(toggle(needs, x))}>
                {x}
              </Chip>
            ))}
          </div>
          <p className="dim small">discounts & memberships</p>
          <div className="chips wrap">
            {DEALS.map((x) => (
              <Chip key={x} on={deals.includes(x)} tint="green" onClick={() => setDeals(toggle(deals, x))}>
                {x}
              </Chip>
            ))}
          </div>
        </>
      ),
    },
  ]

  const create = () => {
    if (dateError || !where.trim()) return
    const id = uid()
    const dest = where.trim()
    const trip: Trip = {
      id,
      destination: dest,
      country: '',
      start,
      end,
      travelers: count,
      companions: who,
      budget,
      vibe,
      constraints: needs,
      discounts: deals,
      status: 'planning',
      tint: TINTS[state.trips.length % TINTS.length],
      // No research has run, so there's no take and no options to show.
      summary: {},
      options: [],
      bookings: [],
      memories: [],
    }
    const base: [ChecklistItem['phase'], string, ChecklistItem['kind']][] = [
      ['discover', `Pick a neighborhood in ${dest}`, 'idea'],
      ['plan', 'Choose flights', 'booking'],
      ['plan', 'Book a place to stay', 'booking'],
      ['plan', 'One dinner worth planning around', 'booking'],
      ['prepare', 'Check passport / ID', 'doc'],
      ['prepare', 'Packing list', 'pack'],
      ['travel', 'Download offline map', 'task'],
      ['remember', 'One memory note a day', 'memory'],
    ]
    const items = base.map(([phase, text, kind]) => ({ id: uid(), tripId: id, phase, text, kind, done: false }))
    dispatch({ type: 'addTrip', trip, items })
    go(`/trip/${id}/notebook`)
  }

  const s = steps[step]
  return (
    <div className="screen wizard">
      <TopBar back={step === 0 ? '/trips' : undefined} right={<span className="dim small">{step + 1} / {steps.length}</span>} />
      {step > 0 && (
        <button className="linkbtn wizard-back" onClick={() => setStep(step - 1)}>
          ← back
        </button>
      )}
      <div className="dots" aria-hidden>
        {steps.map((_, i) => (
          <i key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <h1 className="wizard-q">{s.q}</h1>
      <div className="wizard-body" key={step}>
        {s.body}
      </div>
      <div className="wizard-foot">
        {step < steps.length - 1 ? (
          <Btn kind="solid" disabled={!s.ok} onClick={() => setStep(step + 1)}>
            next
          </Btn>
        ) : (
          <Btn kind="solid" icon="sparkle" disabled={!!dateError || !where.trim()} onClick={create}>
            make my trip
          </Btn>
        )}
      </div>
    </div>
  )
}

