import type { Booking, Profile, Trip } from '../types'
/** QR contains just this saved flight. Never an airline check-in credential. */
export function flightNotes(booking: Booking, trip: Trip, profile: Profile) {
  return [booking.simulated ? 'TATADA SAMPLE - NOT A BOARDING PASS' : 'TATADA FLIGHT NOTES - NOT A BOARDING PASS',
    `Traveler: ${profile.name || 'Not saved'}`, `Party: ${trip.travelers}`,
    `Airline: ${booking.flight?.airline || 'Not saved'}`, `Flight: ${booking.flight?.number || 'Not saved'}`,
    `Route: ${booking.flight ? `${booking.flight.from} -> ${booking.flight.to}` : booking.title}`,
    `When: ${booking.when}`, ...(booking.ref ? [`Reference: ${booking.ref}`] : [])].join('\n')
}
