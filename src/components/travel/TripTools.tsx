import { useEffect, useRef, useState } from 'react'
import type { Trip } from '../../types'
import { useUI } from '../../state/ui'
import { Doodle } from '../layout/Doodle'
import { OfflineDownload } from './OfflineTrip'
import { TripResearch } from './TripResearch'
import { TripSharing } from './TripSharing'
import { TripCalendar } from './TripCalendar'

const tools = [
  {id:'offline',icon:'download',label:'Offline',title:'Keep this trip offline'},
  {id:'briefing',icon:'compass',label:'Good to know',title:'Before you get there'},
  {id:'share',icon:'share',label:'Share',title:'Share trip'},
  {id:'calendar',icon:'calendar',label:'Calendar',title:'Calendar'},
] as const
type Tool = typeof tools[number]

export function TripTools({trip}:{trip:Trip}) {
  const [selected,setSelected]=useState<Tool>()
  const opener=useRef<HTMLButtonElement|null>(null)
  const close=()=>{setSelected(undefined);requestAnimationFrame(()=>{if(opener.current?.isConnected)opener.current.focus()})}
  const {magic}=useUI()
  useEffect(()=>{if(magic)setSelected(undefined)},[magic])
  return <>
    <div className="trip-utility-icons" role="group" aria-label="Trip tools">{tools.map(tool=><button key={tool.id} className="iconbtn" aria-label={tool.title} title={tool.title} aria-haspopup="dialog" onClick={e=>{opener.current=e.currentTarget;setSelected(tool)}}><Doodle name={tool.icon} size={27}/><span>{tool.label}</span></button>)}</div>
    {selected&&<ToolPopup key={selected.id} tool={selected} trip={trip} onClose={close}/>}
  </>
}

function ToolPopup({tool,trip,onClose}:{tool:Tool;trip:Trip;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close()},[])
  return <dialog ref={dialog} className="trip-tool-popup" aria-labelledby="trip-tool-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose()}}}>
    <header><h2 id="trip-tool-title">{tool.title}</h2><button className="iconbtn" aria-label="Close popup" onClick={onClose} autoFocus><Doodle name="x" size={22}/></button></header>
    {tool.id==='offline'&&<OfflineDownload trip={trip} inline/>}
    {tool.id==='briefing'&&<><p className="small dim">Local tips and things to check before you leave.</p><TripResearch trip={trip}/></>}
    {tool.id==='share'&&<TripSharing trip={trip} inline/>}
    {tool.id==='calendar'&&<TripCalendar trip={trip} inline/>}
  </dialog>
}
