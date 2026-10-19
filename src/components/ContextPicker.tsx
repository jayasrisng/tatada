import type {Trip} from '../types'
import {Chip} from './ui'
/** The same Today/trip control everywhere; trip mode keeps its selected trip. */
export function ContextPicker({trips,value,onChange,locked,label,commonLabel='Today'}:{trips:Trip[];value?:string;onChange:(id?:string)=>void;locked?:boolean;label:string;commonLabel?:string}) {
  return <div className="chips context-picker no-print" role="group" aria-label={label}>
    {!locked&&<Chip on={!value} onClick={()=>onChange(undefined)}>{commonLabel}</Chip>}
    {trips.filter(t=>!locked||t.id===value).map(t=><Chip key={t.id} on={t.id===value} tint={t.tint} onClick={()=>onChange(t.id)}>{t.destination}</Chip>)}
  </div>
}
