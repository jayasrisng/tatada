import { Store } from '../store.ts'
import { MockFoAdapter } from '../fo.ts'
import { ActionService } from '../actions.ts'
import type { ActionDraft, ActionStatus, PublicAction } from '../types.ts'

export const draft = (over: Partial<ActionDraft> = {}): ActionDraft => ({
  intent: 'early_checkin',
  tripId: 'kyoto-2027',
  checklistItemId: 'item-1',
  to: 'stay@gion-machiya.example',
  toName: 'Gion Machiya House',
  subject: 'Early check-in request · Thu, Mar 18',
  body: 'Hello Gion Machiya House team,\n\nWould an early check-in be possible?\n\nThank you,\nMei',
  transferQuote: false,
  shared: ['Your name', 'Arrival time'],
  ...over,
})

export function setup(o: { store?: Store; liveRecipients?: string[] } = {}) {
  const clock = { t: 1_000_000 }
  const store = o.store ?? Store.memory()
  const fo = new MockFoAdapter(store)
  const service = new ActionService({ store, fo, now: () => clock.t, timeoutMs: 60_000, pollWaitSeconds: 0, liveRecipients: o.liveRecipients })
  return { clock, store, fo, service }
}

const STOP: ActionStatus[] = ['verified', 'unverified', 'failed', 'timeout', 'cancelled', 'needs_input', 'proposed']

/** Advance the fake clock and run the worker until the action settles. */
export async function settle(s: ReturnType<typeof setup>, owner: string, id: string, maxSteps = 60): Promise<PublicAction> {
  for (let i = 0; i < maxSteps; i++) {
    s.clock.t += 2500
    await s.service.runDue()
    const a = s.service.get(owner, id)
    if (STOP.includes(a.status)) return a
  }
  return s.service.get(owner, id)
}

export const approve = (s: ReturnType<typeof setup>, owner: string, a: PublicAction, key = 'key-' + a.id) =>
  s.service.approve(owner, a.id, { contentHash: a.contentHash, idempotencyKey: key })
