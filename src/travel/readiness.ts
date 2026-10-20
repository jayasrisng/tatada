import type { ChecklistItem, Trip } from '../types'

/** Preparation guidance from existing records; never evidence of a live reservation. */
export function tripReadiness(trip: Trip, items: ChecklistItem[]) {
  const tasks = items.filter(item => item.tripId === trip.id && ['task','booking','doc','pack'].includes(item.kind))
  const open = tasks.filter(item => !item.done)
  const nextTask = open.find(item => item.priority) ?? open[0]
  const stops = trip.itinerary ?? []
  const sampleBookings = trip.bookings.filter(booking => booking.simulated).length
  const next = nextTask ? { text: nextTask.text, section: 'plan' } : !stops.length
    ? { text: 'Build and review your first itinerary.', section: 'itinerary' }
    : trip.end > trip.start && !trip.bookings.some(booking => booking.kind === 'stay')
      ? { text: 'Add your accommodation, or note your overnight plan.', section: 'plan' }
      : { text: 'Review your saved arrangements and local times before departure.', section: 'plan' }
  return { next, open: open.length, completed: tasks.length - open.length, stops: stops.length, sampleBookings, savedBookings: trip.bookings.length - sampleBookings }
}
