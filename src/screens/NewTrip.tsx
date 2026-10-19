import { useState } from 'react'
import { uid, useStore } from '../state/store'
import { go, useUI } from '../state/ui'
import { Btn, Chip, TopBar } from '../components/ui'
import { FoVoice } from '../components/FoVoice'
import { SpeechButton } from '../components/SpeechButton'
import { ResearchPanel } from '../components/ResearchPanel'
import type { ChecklistItem, Trip } from '../types'
import { addDays, isIsoDate, localToday, nightsBetween } from '../magic/dates'

export function dateProblem(start: string, end: string, today = localToday()): string | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return 'Pick both dates.'
  if (start < today) return 'The trip can\'t start in the past.'
  if (end < start) return 'Coming back has to be on or after leaving.'
  if (nightsBetween(start, end) > 365) return 'For a trip longer than a year, create one stage at a time.'
  return null
}
const NEEDS: [string, string, ChecklistItem['kind']][] = [
  ['flights', 'Compare flights for my dates', 'booking'], ['stay', 'Find a place to stay', 'booking'], ['transport', 'Plan local transport', 'task'], ['car', 'Compare rental cars', 'booking'], ['insurance', 'Compare travel insurance and exclusions', 'task'], ['food', 'Find meals and places to eat', 'idea'], ['experiences', 'Explore things to do', 'idea'], ['documents', 'Check travel document requirements', 'doc'], ['packing', 'Plan what to pack', 'pack'],
]
export function NewTrip() {
  const { state, dispatch } = useStore(), { openMagic } = useUI()
  const [brief, setBrief] = useState(''), [details, setDetails] = useState(false), [destination, setDestination] = useState(''), [country, setCountry] = useState('')
  const [start, setStart] = useState(() => addDays(localToday(), 30)), [end, setEnd] = useState(() => addDays(localToday(), 34))
  const [scope, setScope] = useState<string[]>(['flights', 'stay']), [companions, setCompanions] = useState('solo'), [count, setCount] = useState(1), [budget, setBudget] = useState('')
  const [needs, setNeeds] = useState((state.profile.personalNeeds ?? []).join('; ')), [discounts, setDiscounts] = useState(state.profile.memberships.join('; ')), [error, setError] = useState('')
  const context = `Dream: ${brief || 'not supplied yet'}. Home bases: ${(state.profile.homeBases ?? [state.profile.homeAirport]).filter(Boolean).join(', ') || 'not supplied'}. I want help only with: ${scope.join(', ') || 'deciding what I need'}.`
  return <div className="screen wizard">
    <TopBar back="/trips" />
    <p className="small dim">a ta-ta-da moment, waiting to happen</p>
    <h1 className="wizard-q">Hey star.<br />Where does your mind wander?</h1>
    <p>Tell Fo your dreams. A family visit, a month away, one little adventure. We’ll plan only what you need.</p>
    <FoVoice />
    <label>Your idea<textarea className="chalk-input" value={brief} maxLength={2000} onChange={(e) => setBrief(e.target.value)} placeholder="I’m visiting family. I only need flights—the rest is taken care of." /></label>
    <SpeechButton onText={(text) => setBrief((previous) => [previous, text].filter(Boolean).join(' '))} />
    <div className="ac-buttons"><Btn icon="sparkle" onClick={() => openMagic({ assistant: true, prefill: `Help me shape this trip: ${brief || 'I want to explore, but haven’t decided where yet.'}\nAsk only what matters, and do not book or send anything yet.` })}>talk it through</Btn><Btn kind="ghost" onClick={() => setDetails((v) => !v)} aria-expanded={details}>{details ? 'hide trip details' : 'I’m ready to make a trip'}</Btn></div>
    {brief.trim() && <details className="new-trip-ideas"><summary>Compare a few ideas</summary><ResearchPanel title="Think it through" context={context} prompt={`Help me shape this trip: ${brief}. Explain useful options and ask relevant missing questions. No bookings or invented availability.`} /></details>}
    {details && <form onSubmit={(e) => {
      e.preventDefault(); const problem = dateProblem(start, end)
      if (problem) return setError(problem)
      if (!destination.trim()) return setError('Where are you going?')
      const id = uid(), trip: Trip = { id, destination: destination.trim(), country: country.trim(), start, end, travelers: count, companions, budget: budget ? Number(budget) : 0, vibe: state.profile.style, constraints: [brief.trim(), ...needs.split(';').map((v) => v.trim())].filter(Boolean), discounts: discounts.split(';').map((v) => v.trim()).filter(Boolean), status: 'planning', tint: 'blue', summary: {}, options: [], bookings: [], memories: [] }
      const items: ChecklistItem[] = NEEDS.filter(([key]) => scope.includes(key)).map(([, text, kind]) => ({ id: uid(), tripId: id, phase: kind === 'pack' || kind === 'doc' ? 'prepare' : 'plan', text, kind, done: false }))
      dispatch({ type: 'addTrip', trip, items }); go(`/trip/${id}`)
    }}>
      <h2 className="section-h">Just the things that matter</h2>
      <label>Destination<input className="chalk-input" required placeholder="Where are we going?" value={destination} maxLength={120} onChange={(e) => setDestination(e.target.value)} /></label>
      <label>Country (optional)<input className="chalk-input" placeholder="Country (optional)" value={country} maxLength={120} onChange={(e) => setCountry(e.target.value)} /></label>
      <div className="date-row"><label>Leave<input type="date" className="chalk-input" required min={localToday()} value={start} onChange={(e) => setStart(e.target.value)} /></label><label>Return<input type="date" className="chalk-input" required min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
      <p>What needs planning?</p><div className="chips wrap">{NEEDS.map(([key]) => <Chip key={key} on={scope.includes(key)} onClick={() => setScope((all) => all.includes(key) ? all.filter((v) => v !== key) : [...all, key])}>{key}</Chip>)}</div>
      <button className="linkbtn" type="button" onClick={() => { setScope(['flights']); setCompanions('visiting family') }}>Only flights—staying with family</button>
      <label>Who’s coming?<input className="chalk-input" placeholder="Who’s coming?" value={companions} maxLength={150} onChange={(e) => setCompanions(e.target.value)} /></label>
      <label>Travelers<input className="chalk-input" type="number" min={1} max={100} required value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
      <label>Budget in USD (optional)<input className="chalk-input" type="number" min={0} placeholder="Budget in USD (optional)" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
      <label>Needs, pets, accessibility, or anything else<input className="chalk-input" placeholder="Needs, pets, accessibility…" value={needs} maxLength={2000} onChange={(e) => setNeeds(e.target.value)} /></label>
      <label>Discount eligibility and memberships (separate with ;)<input className="chalk-input" placeholder="Memberships or discounts…" value={discounts} maxLength={1500} onChange={(e) => setDiscounts(e.target.value)} /></label>
      <p className="small dim">Membership names help research. No loyalty account is connected and no discount is applied until a provider verifies it.</p>
      {error && <p role="alert">{error}</p>}<Btn type="submit" kind="solid">make my trip</Btn>
    </form>}
  </div>
}
