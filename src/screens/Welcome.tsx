import {Popup} from '../components/layout/Popup'
import { ProfileCredits } from '../components/account/ProfileCredits'
import {useServer} from '../state/server'
import {BetaOwner} from '../components/account/Beta'
import {SecurityGate} from '../components/account/SecurityGate'
import {ProfilePrinting} from '../components/printing/ProfilePrinting'
import {browserOnly} from '../config'
import {AccountRecovery} from '../components/account/AccountRecovery'
import { lazy, Suspense, useState, useEffect } from 'react'
import { useStore } from '../state/store'
import { go } from '../state/ui'
import { Doodle } from '../components/layout/Doodle'
import { Btn, Chip, Paper } from '../components/layout/ui'
import { FoConnection } from '../components/assistant/FoConnection'
import { AccountPanel } from '../components/account/AccountPanel'

const DocumentVault = lazy(() => import('../components/travel/DocumentVault').then((m) => ({ default: m.DocumentVault })))
const STYLES = ['slow mornings', 'food', 'museums', 'nature', 'nightlife', 'design', 'budget-savvy', 'treat-yourself']
const DIETS = ['vegetarian', 'vegan', 'gluten-free', 'halal', 'kosher', 'no restrictions']
const MEMBERS = ['Amex Gold', 'Chase Sapphire', 'AAA', 'TAP Miles&Go', 'United MileagePlus', 'Marriott Bonvoy', 'student']

const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

function WelcomeContent() {
  const {info}=useServer()
  const { state, dispatch, resetDemo, workspace } = useStore()
  const [panel,setPanel]=useState<'vault'|'data'|'sources'|'printer-tips'>()
  useEffect(()=>{const open=(e:Event)=>setPanel((e as CustomEvent).detail);window.addEventListener('tatada-tour-panel',open);return()=>window.removeEventListener('tatada-tour-panel',open)},[])
  const [step, setStep] = useState(0)
  const [p, setP] = useState(state.profile)
  const [newBase, setNewBase] = useState('')
  const [newNeed, setNewNeed] = useState('')
  const [newMembership, setNewMembership] = useState('')

  const finish = () => {
    setStep(0);dispatch({ type: 'onboard', profile: p })
    window.dispatchEvent(new Event('tatada-profile-saved'))
    go(state.onboarded ? '/' : '/tour')
  }

  return (
    <div className="screen welcome">
      {state.onboarded && <button className="iconbtn profile-close" aria-label="Close profile" onClick={() => go('/')}><Doodle name="x" size={24} /></button>}
      {step === 0 && state.onboarded && <div className="profile-overview">
        <h1 className="wizard-q">{state.profile.name ? `Hello, ${state.profile.name}.` : 'Your space'}</h1>
        <button className="btn btn-solid profile-tour-button" onClick={() => go('/tour')}>Take a quick tour <span aria-hidden="true">↗</span></button>
        <section className="profile-connection" data-tour="wajo"><h2>Wajo</h2><FoConnection compact/></section>
        <section className="profile-connection" data-tour="printer"><h2>Printer email address</h2><ProfilePrinting/></section>
        <div className="profile-shortcuts"><button className="btn" data-tour="preferences" onClick={()=>setStep(1)}>Preferences</button><button className="btn" data-tour="documents" onClick={()=>setPanel('vault')}>Vault</button><button className="btn" data-tour="saved-data" onClick={()=>setPanel('data')}>Export / import</button></div>
        {panel&&<Popup title={{vault:'This is your vault.',data:'Your data',sources:'Sources', 'printer-tips':'Printer tips'}[panel]} onClose={()=>setPanel(undefined)}>
          {panel==='vault'&&<Suspense fallback={<p>Opening vault…</p>}><DocumentVault/></Suspense>}
          {panel==='data'&&<AccountPanel compact/>}{panel==='sources'&&<ProfileCredits inline/>}
          {panel==='printer-tips'&&<ul><li>Find your printer email in Epson Connect.</li><li>Allow Fo’s sender address in Epson settings.</li><li>Turn off email body and sender information printing.</li><li>Set paper size in Epson. Duplex needs printer support.</li><li>Review the PDF before sending.</li></ul>}
        </Popup>}
        <section className="try-lessons" aria-label="Optional lessons"><h2>Try this</h2><div className="lesson-links">{[['photo','Journal photo'],['outfit','Add an outfit'],['voice','Try voice'],['vault','Your vault'],['sharing','Export / import']].map(([id,label])=><button className="linkbtn" key={id} onClick={()=>go('/tour?lesson='+id)}>{label}</button>)}</div></section>
        <nav className="profile-footer" aria-label="Policies"><a href="#/policies/terms">T&amp;C</a><a href="#/policies/privacy">Privacy</a><a href="#/welcome" onClick={e=>{e.preventDefault();setPanel('printer-tips')}}>Printer tips</a><a href="#/welcome" onClick={e=>{e.preventDefault();setPanel('sources')}}>Sources</a></nav>
        {(workspace.kind==='demo'||workspace.kind==='local-demo')&&<button className="linkbtn" onClick={()=>(resetDemo(true),setStep(0))}>reset demo data</button>}

      </div>}
      {step === 0 && !state.onboarded && (
        <div className="welcome-hero">
          <Doodle name="sparkle" size={64} className="spin-slow hero-star" />
          <h1 className="logo big">tatada</h1>
          <p className="welcome-line">Hey Star.<br />Less scrolling. More living.</p>
          <p className="welcome-description">A plan for your days. A copy for the road. Space for the memories.</p>
          {!browserOnly&&info.available&&<section className="welcome-setup"><p className="small">{info.foConnected?'✓ Wajo connected. Add your printer and you’re ready to plan.':'Connect Wajo and add your printer when you’re ready.'}</p>{!info.foConnected&&<FoConnection/>}<ProfilePrinting/></section>}
          <Btn kind="solid" onClick={finish}>Show me around</Btn>
          <button className="linkbtn" onClick={() => { setStep(0);dispatch({ type: 'onboard', profile: p }); go('/') }}>Skip tour and start planning</button>
          <button className="linkbtn" onClick={()=>setStep(1)}>Add travel preferences</button>
          <p className="small dim">Preferences are optional. You can add them anytime.</p>
          {(workspace.kind === 'demo' || workspace.kind === 'local-demo') && <button className="linkbtn" onClick={() => (resetDemo(true), setStep(0))}>reset demo data</button>}
        </div>
      )}

      {!browserOnly&&workspace.kind!=='device'&&step===0&&<AccountRecovery/>}
      {step === 1 && (
        <div className="wizard-body">
          <h1 className="wizard-q">Hey Star, what should we call you?</h1>
          <input className="chalk-input big" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="your name" autoFocus aria-label="Your name" />
          <h2 className="wizard-q small">home airport</h2>
          <input className="chalk-input" value={p.homeAirport} maxLength={4} onChange={(e) => setP({ ...p, homeAirport: e.target.value.toUpperCase() })} placeholder="SFO" aria-label="Home airport" />
          <h2 className="wizard-q small">your home bases</h2><p className="small dim">Home can be more than one place. Change these whenever life moves.</p>
          <ul className="profile-list">{(p.homeBases ?? []).map((base) => <li key={base}>{base}<button className="iconbtn" aria-label={`Remove home base ${base}`} onClick={() => setP({ ...p, homeBases: p.homeBases?.filter((v) => v !== base) })}>×</button></li>)}</ul>
          <form className="field-row" onSubmit={(e) => { e.preventDefault(); const value = newBase.trim(); if (value && !(p.homeBases ?? []).includes(value)) setP({ ...p, homeBases: [...(p.homeBases ?? []), value].slice(0, 20) }); setNewBase('') }}><input className="chalk-input" aria-label="Add home base" placeholder="a city or a place you call home" maxLength={120} value={newBase} onChange={(e) => setNewBase(e.target.value)} /><Btn type="submit" kind="ghost">+</Btn></form>
          <div className="wizard-foot">
            <Btn kind="ghost" onClick={()=>setStep(0)}>back</Btn><Btn kind="solid" disabled={!p.name.trim()} onClick={() => setStep(2)}>next</Btn>
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
            <Btn kind="ghost" onClick={()=>setStep(1)}>back</Btn><Btn kind="solid" onClick={() => setStep(3)}>next</Btn>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="wizard-body">
          <h1 className="wizard-q">cards & memberships?</h1>
          <p className="dim">Add the names of your cards and memberships. Fo can use them when looking for perks.</p>
          <div className="chips wrap">
            {MEMBERS.map((x) => (
              <Chip key={x} tint="green" on={p.memberships.includes(x)} onClick={() => setP({ ...p, memberships: toggle(p.memberships, x) })}>{x}</Chip>
            ))}
          </div>
          <form className="field-row" onSubmit={(e) => { e.preventDefault(); if (newMembership.trim()) setP({ ...p, memberships: [...new Set([...p.memberships, newMembership.trim()])] }); setNewMembership('') }}><input className="chalk-input" maxLength={120} aria-label="Add membership or discount eligibility" placeholder="military, student, loyalty program…" value={newMembership} onChange={(e) => setNewMembership(e.target.value)} /><Btn type="submit" kind="ghost">+</Btn></form>
          <h2 className="wizard-q small">anything that helps us care for you?</h2><p className="small dim">Accessibility, pets, family needs, or anything else. Optional; share only what you want.</p>
          <ul className="profile-list">{(p.personalNeeds ?? []).map((need) => <li key={need}>{need}<button className="iconbtn" aria-label={`Remove ${need}`} onClick={() => setP({ ...p, personalNeeds: p.personalNeeds?.filter((v) => v !== need) })}>×</button></li>)}</ul>
          <form className="field-row" onSubmit={(e) => { e.preventDefault(); if (newNeed.trim()) setP({ ...p, personalNeeds: [...new Set([...(p.personalNeeds ?? []), newNeed.trim()])] }); setNewNeed('') }}><input className="chalk-input" maxLength={200} aria-label="Add a personal travel need" placeholder="Add a travel need…" value={newNeed} onChange={(e) => setNewNeed(e.target.value)} /><Btn kind="ghost" type="submit">+</Btn></form>
          <Paper className="promise" tilt={-1}>
            <span className="paper-label">my promise</span>
            <p>I'll never book, pay, email, or call anyone without showing you first.</p>
          </Paper>
          <div className="wizard-foot">
            <Btn kind="ghost" onClick={()=>setStep(2)}>back</Btn><Btn kind="solid" icon="sparkle" onClick={finish}>{state.onboarded ? 'save details' : 'all set'}</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

export function Welcome(){return <SecurityGate><WelcomeContent/><BetaOwner/></SecurityGate>}
