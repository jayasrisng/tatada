import { useState } from 'react'
import { useStore } from '../state/store'
import { go } from '../state/ui'
import { Doodle } from '../components/Doodle'
import { Btn, Chip, Paper } from '../components/ui'

const STYLES = ['slow mornings', 'food', 'museums', 'nature', 'nightlife', 'design', 'budget-savvy', 'treat-yourself']
const DIETS = ['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher', 'no restrictions']
const MEMBERS = ['Amex Gold', 'Chase Sapphire', 'AAA', 'TAP Miles&Go', 'United MileagePlus', 'Marriott Bonvoy', 'student']

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

export function Welcome() {
  const { state, dispatch, resetDemo } = useStore()
  const [step, setStep] = useState(0)
  const [p, setP] = useState(state.profile)

  const finish = () => {
    dispatch({ type: 'onboard', profile: p })
    go('/')
  }

  return (
    <div className="screen welcome">
      {step === 0 && (
        <div className="welcome-hero">
          <Doodle name="sparkle" size={64} className="spin-slow hero-star" />
          <h1 className="logo big">tatada</h1>
          <p className="welcome-line">less managing travel.<br />more traveling.</p>
          <Btn kind="solid" onClick={() => setStep(1)}>
            let's begin
          </Btn>
          {state.onboarded && (
            <div className="welcome-dev">
              <button className="linkbtn" onClick={() => go('/')}>back home</button>
              <button className="linkbtn" onClick={() => (resetDemo(true), setStep(0))}>reset demo data</button>
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="wizard-body">
          <h1 className="wizard-q">what should I call you?</h1>
          <input className="chalk-input big" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="your name" autoFocus aria-label="Your name" />
          <h2 className="wizard-q small">home airport</h2>
          <input className="chalk-input" value={p.homeAirport} maxLength={4} onChange={(e) => setP({ ...p, homeAirport: e.target.value.toUpperCase() })} placeholder="SFO" aria-label="Home airport" />
          <div className="wizard-foot">
            <Btn kind="solid" disabled={!p.name.trim()} onClick={() => setStep(2)}>next</Btn>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="wizard-body">
          <h1 className="wizard-q">how do you like to travel?</h1>
          <div className="chips wrap">
            {STYLES.map((x) => (
              <Chip key={x} tint="pink" on={p.style.includes(x)} onClick={() => setP({ ...p, style: toggle(p.style, x) })}>{x}</Chip>
            ))}
          </div>
          <h2 className="wizard-q small">food</h2>
          <div className="chips wrap">
            {DIETS.map((x) => (
              <Chip key={x} tint="blue" on={p.diet.includes(x)} onClick={() => setP({ ...p, diet: toggle(p.diet, x) })}>{x}</Chip>
            ))}
          </div>
          <div className="wizard-foot">
            <Btn kind="solid" onClick={() => setStep(3)}>next</Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h1 className="wizard-q">cards & memberships?</h1>
          <p className="dim">so I can find perks and discounts you already have.</p>
          <div className="chips wrap">
            {MEMBERS.map((x) => (
              <Chip key={x} tint="green" on={p.memberships.includes(x)} onClick={() => setP({ ...p, memberships: toggle(p.memberships, x) })}>{x}</Chip>
            ))}
          </div>
          <Paper className="promise" tilt={-1}>
            <span className="paper-label">my promise</span>
            <p>I'll never book, pay, email, or call anyone without showing you first.</p>
          </Paper>
          <div className="wizard-foot">
            <Btn kind="solid" icon="sparkle" onClick={finish}>all set</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
