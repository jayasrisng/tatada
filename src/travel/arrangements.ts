import type {Booking} from '../types'
import {validZone} from './confirmations'
import {isIsoDate,isTime} from '../magic/dates'
export interface ArrangementDraft {kind:Booking['kind'];title:string;date:string;time:string;end:string;ref:string;detail:string;contact:string;airline:string;number:string;from:string;to:string;sample:boolean;address:string;arrival:string;departureZone?:string;arrivalZone?:string;paidAmount?:string;currency?:string}
export function arrangementDraft(start:string,end:string,b?:Booking):ArrangementDraft {
  const date=b?.checkIn??b?.at?.slice(0,10)??b?.when.match(/\d{4}-\d{2}-\d{2}/)?.[0]??(b?'':start)
  return {paidAmount:b?.paidPrice?.amount??'',currency:b?.paidPrice?.currency??'USD',kind:b?.kind??'flight',title:b?.title??'',date,time:b?.at?.slice(11)??'',end:b?.checkOut??end,ref:b?.ref??'',detail:b?.detail??'',contact:b?.contact??'',airline:b?.flight?.airline??'',number:b?.flight?.number??'',from:b?.flight?.from??'',to:b?.flight?.to??'',sample:b?.simulated??false,address:b?.address??'',arrival:b?.arrivesAt??'',departureZone:b?.departureZone??'',arrivalZone:b?.arrivalZone??''}
}
/** Records only user-supplied details; saving never calls a booking or messaging provider. */
export function savedArrangement(v:ArrangementDraft,id:string,previous?:Booking):Booking {
  if(!['flight','stay','transfer','dinner','activity'].includes(v.kind))throw new Error('Choose the type of travel detail.')
  if(!isIsoDate(v.date))throw new Error('Choose a valid date.')
  if(v.time&&!isTime(v.time))throw new Error('Choose a valid time.')
  if(v.kind==='stay'&&(!isIsoDate(v.end)||v.end<=v.date))throw new Error('Check-out must be after check-in.')
  if(v.kind==='flight'&&(!v.from.trim()||!v.to.trim()))throw new Error('Add where the flight leaves from and arrives.')
  if(v.kind!=='flight'&&!v.title.trim())throw new Error('Add a name for this detail.')
  if(v.contact.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contact.trim()))throw new Error('Check the contact email.')
  if(v.kind==='flight'&&v.arrival&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.arrival)||!isIsoDate(v.arrival.slice(0,10))||!isTime(v.arrival.slice(11))))throw new Error('Choose a valid arrival date and time.')
  if(v.departureZone&&!validZone(v.departureZone)||v.arrivalZone&&!validZone(v.arrivalZone))throw new Error('Use an IANA time zone, such as America/Los_Angeles.')
  if(v.paidAmount&&(!/^\d{1,9}(?:\.\d{1,2})?$/.test(v.paidAmount)||!v.currency||! /^[A-Z]{3}$/.test(v.currency)))throw new Error('Use a valid paid total and a three-letter currency, such as USD.')
  const title=v.kind==='flight'?`${v.from.trim()} → ${v.to.trim()}`:v.title.trim()
  const original=previous?arrangementDraft(v.date,v.end,previous):undefined
  const keepWhen=original&&original.kind===v.kind&&original.date===v.date&&original.time===v.time&&original.end===v.end&&original.arrival===v.arrival
  return {...previous,paidPrice:v.paidAmount?{amount:v.paidAmount,currency:v.currency!}:undefined,id,kind:v.kind,title,when:keepWhen?previous!.when:v.kind==='stay'?`${v.date} → ${v.end}`:`${v.date}${v.time?' · '+v.time:''}${v.kind==='flight'&&v.arrival?' · arrival '+v.arrival.replace('T',' '):''}`,ref:v.ref.trim(),detail:v.detail.trim(),simulated:v.sample,contact:v.contact.trim()||undefined,departureZone:v.departureZone||undefined,arrivalZone:v.arrivalZone||undefined,address:v.address.trim()||undefined,arrivesAt:v.kind==='flight'?v.arrival:undefined,
    ...(v.kind==='stay'?{checkIn:v.date,checkOut:v.end,at:v.time?v.date+'T'+v.time:undefined}:{at:keepWhen?previous?.at:v.date+(v.time?'T'+v.time:'')}),
    ...(v.kind==='flight'?{flight:{airline:v.airline.trim(),number:v.number.trim(),from:v.from.trim(),to:v.to.trim()}}:{}),}
}
