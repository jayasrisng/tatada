import {useEffect,useState} from 'react'
import type {Booking} from '../../types'
import {checkInWindow} from '../../travel/checkin'
export function FlightCheckIn({booking}:{booking:Booking}) {
 const [now,setNow]=useState(Date.now)
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer)},[])
 const window=checkInWindow(booking)
 if(booking.simulated)return null
 if(!window)return <p className="small dim">Check-in timing: confirm with your operating airline. Save the exact departure time and time zone for a countdown.</p>
 if(now>=window.departure)return null
 const remaining=window.opens-now,minutes=Math.ceil((window.opens-now)/60000)
 return <section className="flight-check-in" aria-label="Airline check-in"><strong>{remaining>0?`Check-in opens in ${Math.floor(minutes/60)}h ${minutes%60}m`:'Scheduled check-in window is open'}</strong><p className="small">{new Date(window.opens).toLocaleString('en-US',{timeZone:window.zone})} · {window.zone}</p><a href={window.url} target="_blank" rel="noreferrer">open {window.name} check-in ↗</a><p className="small dim">Calculated from your saved departure and the airline’s <a href={window.source} target="_blank" rel="noreferrer">24-hour policy</a>. Confirm eligibility with the operating airline. Your airline issues the boarding pass after check-in.</p></section>
}
