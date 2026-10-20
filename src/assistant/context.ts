import type { ChecklistItem, Profile, Trip } from '../types'

/** Bounded, current trip details. Private references, documents and contacts stay out. */
export function tripContext(trip: Trip, profile: Profile, items: ChecklistItem[]) {
  const short = (value: string, length = 120) => value.slice(0, length)
  const itinerary = (trip.itinerary ?? []).map(stop => ({ day: stop.day, time: stop.time, title: short(stop.title), done: !!stop.done }))
  const tasks = items.filter(item => item.tripId === trip.id && !item.done).map(item => short(item.text))
  const context = {
    tripId: trip.id, destination: short(trip.destination), country: short(trip.country), start: trip.start, end: trip.end,
    travelers: trip.travelers, budget: trip.budget, timeZone: trip.timeZone,
    preferences: { diet: profile.diet.map(v => short(v, 60)).slice(0, 8), interests: trip.vibe.map(v => short(v, 60)).slice(0, 8), needs: trip.constraints.map(v => short(v)).slice(0, 8) },
    arrangements: trip.bookings.slice(0, 8).map(booking => ({ kind: booking.kind, title: short(booking.title), sample: booking.simulated, at: booking.at, checkIn: booking.checkIn, checkOut: booking.checkOut, address: short(booking.address ?? '') })),
    planning: trip.planning ? { transport: trip.planning.transport, origin: short(trip.planning.origin), arriveBy: trip.planning.arriveBy, homeBy: trip.planning.homeBy, goals: short(trip.planning.goals, 300) } : undefined,
    itinerary: itinerary.slice(0, 20), openTasks: tasks.slice(0, 10), omittedStops: Math.max(0, itinerary.length - 20), omittedTasks: Math.max(0, tasks.length - 10),
  }
  // Drop whole entries rather than cutting JSON  in half.
  while (JSON.stringify(context).length > 5900 && (context.itinerary.length || context.openTasks.length || context.arrangements.length)) {
    if (context.itinerary.length) { context.itinerary.pop(); context.omittedStops++ }
    else if (context.openTasks.length) { context.openTasks.pop(); context.omittedTasks++ }
    else context.arrangements.pop()
  }
  return `Trip context: ${JSON.stringify(context)}`
}

export function adviceText(text: string) {
  return text.replace(/```tatada-proposal\s*\n[\s\S]*?```/g, '').trim() || 'Review the suggested trip update below.'
}
