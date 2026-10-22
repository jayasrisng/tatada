import {useEffect, useState, type ReactNode} from 'react'
import {Doodle} from '../layout/Doodle'
import {ChalkCheck} from '../layout/ui'

/** Completing a stage folds it; its checkbox and details remain reversible. */
export function JourneyStage({id,title,done,current,onComplete,action,children}: {
  id:string; title:string; done:boolean; current:boolean; onComplete:()=>void; action:ReactNode; children:ReactNode
}) {
  const [open,setOpen]=useState(!done)
  useEffect(()=>setOpen(!done),[done])
  return <li className={`journey-stage${done?' complete':''}${current?' current':''}`}>
    <header>
      <ChalkCheck checked={done} onChange={onComplete} label={`Complete ${title}`}/>
      <h3>{title}{(current||done)&&<small className="journey-stage-status">{current?'current':'done'}</small>}</h3>
      {action}
      <button type="button" className="iconbtn journey-stage-expand" aria-expanded={open} aria-controls={id} aria-label={`${open?'Hide':'Show'} ${title} details`} onClick={()=>setOpen(v=>!v)}><Doodle name="chevron" size={20}/></button>
    </header>
    <div id={id} hidden={!open} className="journey-stage-body">{children}</div>
  </li>
}
