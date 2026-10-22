import {useState} from 'react'
import {useStore} from '../../state/store'
import {go} from '../../state/ui'
import {isAppState} from '../../state/persistence'
import {withoutTrip} from '../../travel/delete'
import {deleteOriginal} from '../../travel/originals'
import {packKey,OFFLINE_SELECTED} from '../../offline/pack'
import {ConfirmationDialog} from '../layout/ConfirmationDialog'
import type {Trip} from '../../types'
export function DeleteTrip({trip}:{trip:Trip}) {
  const {state,dispatch,workspace}=useStore(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  return <footer className="delete-trip"><button className="linkbtn danger" onClick={()=>setOpen(true)}>delete this trip</button>{open&&<ConfirmationDialog title={`Delete ${trip.destination}?`} onClose={()=>{if(!busy)setOpen(false)}}>
    <p>This action is permanent. Please confirm you want to delete this trip, its tasks, journal, photos and saved outfits. Published Tatada share links will stop working.</p>
    <p className="small dim">This does not cancel airline or hotel reservations, or erase provider histories and exported files. Original confirmations on this device and its offline download will also be removed.</p>
    {error&&<p role="alert">{error}</p>}
    <button className="btn danger" disabled={busy} onClick={async()=>{
      setBusy(true);setError('')
      try{
        const next=workspace.deleteTrip?await workspace.deleteTrip(trip.id):withoutTrip(state,trip.id)
        const originals=new Set(trip.bookings.map(b=>b.originalId).filter((id):id is string=>!!id))
        const kept=new Set(next.trips.flatMap(t=>t.bookings.map(b=>b.originalId)))
        let cleanupFailed=false
        try{
          const key=packKey(workspace.storageKey,trip.id)
          localStorage.removeItem(key);if(localStorage.getItem(OFFLINE_SELECTED)===key)localStorage.removeItem(OFFLINE_SELECTED)
          const recoveryKey=workspace.storageKey+':recovery',raw=localStorage.getItem(recoveryKey)
          if(raw){const recovery=JSON.parse(raw);if(isAppState(recovery))localStorage.setItem(recoveryKey,JSON.stringify(withoutTrip(recovery,trip.id)));else cleanupFailed=true}
        }catch{cleanupFailed=true}
        const cleanup=await Promise.allSettled([...originals].filter(id=>!kept.has(id)).map(id=>deleteOriginal(workspace.storageKey,id)))
        if(cleanup.some(r=>r.status==='rejected'))cleanupFailed=true
        dispatch({type:'reset',state:next})
        go(cleanupFailed?'/trips?cleanup=needed':'/trips')
      }catch(e){setError((e as Error).message);setBusy(false)}
    }}>{busy?'deleting…':'confirm and delete trip'}</button>
  </ConfirmationDialog>}</footer>
}
