import type {Booking} from '../types'
import {localInstant} from './next'
export function checkInWindow(booking:Booking) {
 if(booking.simulated||booking.kind!=='flight'||!booking.at||!booking.departureZone)return
 const airline=(booking.flight?.airline??'').trim(),number=(booking.flight?.number??'').trim()
 const policy=/\bsouthwest\b/i.test(airline)||/^WN\s*\d/i.test(number)?{name:'Southwest',url:'https://www.southwest.com/checkin/',source:'https://support.southwest.com/helpcenter/article/basic-fare-seat-assignment'}:/^united(?: airlines)?$/i.test(airline)||/^UA\s*\d/i.test(number)?{name:'United',url:'https://www.united.com/en/us/checkin',source:'https://www.united.com/pt/pt/checkin/'}:undefined
 const departure=localInstant(booking.at,booking.departureZone)
 if(!policy||departure===undefined)return
 return {...policy,opens:departure-24*3600000,departure,zone:booking.departureZone}
}
