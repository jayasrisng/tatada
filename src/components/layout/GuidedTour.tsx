import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../state/store'
import { go, useUI, useRoute } from '../../state/ui'
import { MagicBuddy } from './Doodle'

interface Step { path:string; target:string; text:string; click?:boolean; world?:boolean; focus?:boolean }
export function GuidedTour({onClose}:{onClose:()=>void}) {
  const route = '/' + useRoute().join('/')
  const {state}=useStore()
  const {setFocusTrip,closeMagic}=useUI()
  const [tripId]=useState(()=>state.trips.find(t=>t.status!=='past')?.id ?? state.trips[0]?.id)
  const [index,setIndex]=useState(0)
  const [box,setBox]=useState<{top:number;left:number;width:number;height:number}>()
  const next=useRef<HTMLButtonElement>(null)
  const steps:Step[]=[
    {path:'/',target:'[data-tour="nav-trips"]',text:'Your trips live here. Tap the suitcase.',click:true},
    {path:'/trips',target:'.tour-new-trip',text:'A new adventure? Start here.',click:true},
    {path:'/new',target:'.trip-intake textarea',text:'Tell me where, when, and what you love. Review your plan before saving.'},
    ...(tripId?[
      {path:`/trip/${tripId}/plan`,target:'[data-tour="pending"]',text:'Overview keeps your to-dos together.'},
      {path:`/trip/${tripId}/plan`,target:'[data-tour="section-itinerary"]',text:'Your days, in order. Tap Itinerary.',click:true},
      {path:`/trip/${tripId}/itinerary`,target:'[data-tour="section-notebook"]',text:'Rides, stays, experiences and food go here.',click:true},
      {path:`/trip/${tripId}/notebook`,target:'[data-tour="trip-mode"]',text:'One trip at a time. Tap to enter trip mode.',click:true},
      {path:`/trip/${tripId}/journal`,focus:true,target:'[data-tour="section-journal"]',text:'Keep the good bits in your Journal.'},
      {path:`/trip/${tripId}/plan`,focus:true,target:'[data-tour="map-location"]',text:'Find your saved places here. Use my location only when you want nearby help.'},
      {path:`/trip/${tripId}/itinerary`,focus:true,target:'[aria-label="Itinerary tools"]',text:'Talk, plan, pack, or edit details. Each icon opens just what you need.'},
      {path:`/trip/${tripId}/notebook`,focus:true,target:'[role="tablist"]',text:'Bookings separates transportation, stays, experiences and Eat. Saved itinerary meals appear in Eat, where you can find options along your route.'},
      {path:`/trip/${tripId}/plan`,focus:true,target:'.trip-shell-bar button',text:'My World takes you back to the full workspace. Tap it anytime.',click:true},
    ]:[]),
    {path:tripId?`/trip/${tripId}/plan`:'/',target:tripId?'[data-tour="trip-help"] summary':'[data-tour="magic"]',text:tripId?'Check the loose ends with Fo here.':'I’m right here when you need a hand.'},
    {path:'/',target:'[data-tour="nav-style"]',text:'Your closet and outfits live here. Add clothes you own, then plan looks for your trip.',world:true,click:true},
    {path:'/style',target:'.style .seg',text:'Outfits, mix & match, closet, day plan and packing all use the same wardrobe.',world:true},
    {path:'/',target:'[data-tour="nav-tasks"]',text:'Tasks brings every trip’s loose ends together. Tick things off as you go.',world:true,click:true},
    {path:'/welcome',target:'[data-tour="preferences"]',text:'Add food preferences, home base and personal needs—vegan, halal, mobility, infant care, or work. Only share what helps.',world:true},
    {path:'/welcome',target:'[data-tour="documents"]',text:'Upload confirmations with their bookings. Private passes and IDs belong in Documents; originals stay on this device.'},
    {path:'/welcome',target:'[data-tour="wajo"]',text:'Connect Wajo for Fo. Ask with a trip open so Fo has that trip’s context. Review proposed changes before saving.'},
    {path:'/welcome',target:'[data-tour="printer"]',text:'Printer email is enough for printing setup. Preview the PDF and approve each send. No printer? Download it instead.'},
  ]
  const step=steps[index]
  useEffect(()=>{setFocusTrip(undefined);closeMagic()},[]) // A tour starts in the full workspace.
  useEffect(()=>{
    let target:HTMLElement|null=null, frame=0, attempts=0
    if(step.focus&&tripId)setFocusTrip(tripId);else setFocusTrip(undefined)
    setBox(undefined);go(step.path)
    if (route !== step.path) return
    const measure=()=>{if(target?.isConnected){const r=target.getBoundingClientRect();setBox({top:r.top-5,left:r.left-5,width:r.width+10,height:r.height+10})}}
    const advance=()=>setIndex(i=>Math.min(i+1,steps.length-1))
    const locate=()=>{
      target=document.querySelector<HTMLElement>(step.target)
      if(!target){if(attempts++<120)frame=requestAnimationFrame(locate);return}
      target.classList.add('star-tour-target');target.setAttribute('aria-describedby','star-tour-copy')
      target.scrollIntoView({block:'center',behavior:'instant'});measure();next.current?.focus({preventScroll:true})
      if(step.click)target.addEventListener('click',advance)
    }
    frame=requestAnimationFrame(locate)
    window.addEventListener('resize',measure);window.addEventListener('scroll',measure,true)
    const observer=new ResizeObserver(measure);observer.observe(document.body)
    return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure,true);target?.classList.remove('star-tour-target');target?.removeAttribute('aria-describedby');target?.removeEventListener('click',advance)}
  },[index,step.path,step.target,route])
  useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[onClose])
  return <aside className="star-tour" aria-label="Star guide">
    {box&&<div className="star-tour-ring" style={box} aria-hidden="true"/>}
    <div className={`star-tour-card ${box&&box.top>window.innerHeight/2?'at-top':'at-bottom'}`}>
      <MagicBuddy size={54}/><div className="star-tour-message"><select aria-label="Guide topic" value="" onChange={e=>{if(e.target.value)setIndex(Number(e.target.value))}}><option value="">Jump to…</option>{steps.map((s,i)=>{const label=i===0?'Trips':s.target==='[data-tour="trip-mode"]'?'Trip Mode':s.target==='[data-tour="map-location"]'?'Map':s.target==='.style .seg'?'Style':s.target==='[data-tour="preferences"]'?'Profile':s.target==='[data-tour="wajo"]'?'Fo':null;return label?<option key={i} value={String(i)}>{label}</option>:null})}</select><p id="star-tour-copy" aria-live="polite">{step.text}</p><div className="star-tour-actions"><span className="small dim">{index+1}/{steps.length}</span><button className="linkbtn" onClick={onClose}>Skip</button>{index>0&&<button className="linkbtn" onClick={()=>setIndex(i=>i-1)}>Back</button>}<button ref={next} className="btn btn-solid" onClick={()=>index===steps.length-1?onClose():setIndex(i=>i+1)}>{index===steps.length-1?'Done':'Next'}</button></div></div>
    </div>
  </aside>
}
