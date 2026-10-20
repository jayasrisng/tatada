import {FlightCheckIn} from './FlightCheckIn'
import {FlightStatus} from './FlightStatus'
import {humanWhen} from '../travel/display'
import {useEffect, useState} from 'react'
import type {Booking, Profile, Trip} from '../types'
import {flightNotes} from '../print/flight'
export function FlightTicket({booking,trip,profile}:{booking:Booking;trip:Trip;profile:Profile}) {
  const [qr,setQr]=useState(''), [failed,setFailed]=useState(false)
  const notes=flightNotes(booking,trip,profile)
  useEffect(()=>{let live=true;setQr('');setFailed(false);import('qrcode').then(({default:QRCode})=>QRCode.toDataURL(notes,{width:360,margin:4,errorCorrectionLevel:'M',color:{dark:'#171d1c',light:'#ffffff'}})).then(url=>{if(live)setQr(url)},()=>{if(live)setFailed(true)});return()=>{live=false}},[notes])
  return <article className="flight-keepsake" aria-label={`${booking.title} flight ticket`}>
    <header><span>tatada / a little way to go</span><span>{booking.simulated?'sample keepsake':'flight notes'}</span></header>
    <h3>{booking.flight ? <>{booking.flight.from}<span aria-hidden="true"> ↗ </span>{booking.flight.to}</> : booking.title}</h3>
    <div className="flight-keepsake-body"><div><span className="flight-label">TRAVELER</span><strong>{profile.name || 'Name not saved'}</strong><p>{booking.flight?.airline || 'Airline not saved'}<br/><b>{booking.flight?.number || 'Flight number not saved'}</b></p><p>{humanWhen(booking.when)}</p><small>{trip.travelers} {trip.travelers===1?'traveler':'travelers'}{booking.ref ? ` · ref ${booking.ref}`:''}</small></div><figure><details><summary>Flight-notes QR</summary>{qr && <img src={qr} alt="QR code containing this saved flight’s notes"/>}<figcaption>{failed?'QR unavailable · details are shown here':'saved notes only · not an airline boarding pass'}</figcaption></details></figure></div>
    <div className="flight-paid-price">{booking.paidPrice?<><strong>{booking.paidPrice.currency} {booking.paidPrice.amount}</strong><span>saved paid total · entered or imported</span></>:<span>Paid price not saved</span>}</div>
    <FlightCheckIn booking={booking}/><FlightStatus trip={trip} booking={booking}/><footer>{booking.simulated?'Sample journey. Not valid for boarding.':'Use your airline boarding pass at the airport.'}</footer>
  </article>
}
