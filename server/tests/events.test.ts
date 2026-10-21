import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseEventbrite, parseLuma, parsePartiful, eventbritePlace, eventbriteUrl, lumaUrl } from '../events/sources.ts'
import { dedupe, inWindow, parseInterests, rankEvents } from '../events/aggregate.ts'
import { zonedToUtc } from '../events/time.ts'
import { createFetcher, UpstreamError, type Fetcher } from '../events/fetch.ts'
import { searchEvents } from '../events/search.ts'
import { createEventsHandler } from '../events/handler.ts'
import type { RawEvent } from '../events/types.ts'

// Trimmed copies of real public responses captured 2026-10-17.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const LUMA = fixture('luma.json'), EVENTBRITE = fixture('eventbrite.html'), PARTIFUL = fixture('partiful.html')
const NOW = new Date('2026-10-17T19:00:00Z') // Saturday noon in San Francisco
const SF = { lat: 37.7749, lon: -122.4194 }
const none = parseInterests('')
const base: RawEvent = { source: 'luma', sourceId: 'x', title: 'Sample', url: 'https://luma.com/x', start: '2026-10-18T03:00:00.000Z', timezone: 'America/Los_Angeles', price: { kind: 'unknown' }, tags: [], lat: 37.77, lon: -122.42 }

test('Luma listings parse prices honestly and flag sold-out events', () => {
  const { events } = parseLuma(LUMA)
  assert.equal(events.length, 4)
  const byTitle = (t: string) => events.find((e) => e.title.startsWith(t))!
  assert.deepEqual(byTitle('Arm').price, { kind: 'free' })
  assert.deepEqual(byTitle('Best In The Bay').price, { kind: 'paid', label: '$20' })
  assert.deepEqual(byTitle('Noisebridge').price, { kind: 'paid', label: 'pay what you can, suggested $32' })
  assert.equal(byTitle('Financial Literacy').soldOut, true)
  assert.equal(byTitle('Arm').url, 'https://luma.com/lu5xqt42')
  assert.equal(byTitle('Arm').approximateLocation, true, 'guest-only addresses are obfuscated by Luma')
  assert.throws(() => parseLuma('{"unexpected":true}'))
})

test('Eventbrite page data converts local times in the listed zone and keeps price unknown', () => {
  const events = parseEventbrite(EVENTBRITE)
  assert.equal(events.length, 3)
  const shipyard = events.find((e) => e.title.startsWith('Shipyard'))!
  assert.equal(shipyard.start, '2026-10-17T18:00:00.000Z')
  const west = events.find((e) => e.title === 'WILD WILD WEST')!
  assert.equal(west.end, '2026-10-18T09:00:00.000Z', 'ends 2 AM the next day, Pacific time')
  assert.ok(events.every((e) => e.price.kind === 'unknown' && e.timezone === 'America/Los_Angeles'))
  assert.ok(shipyard.tags.length > 0)
  assert.throws(() => parseEventbrite('<html>changed</html>'), /structure changed/)
  assert.equal(eventbritePlace('San Francisco', 'California', 'United States', 'us'), 'ca--san-francisco')
  assert.equal(eventbritePlace('São Paulo', undefined, 'Brazil', 'br'), 'brazil--sao-paulo')
  assert.equal(eventbritePlace(undefined, 'CA', 'United States', 'us'), undefined)
})

test('Partiful explore data dedupes repeated sections and keeps location approximate', () => {
  const events = parsePartiful(PARTIFUL)
  assert.equal(events.length, 3)
  assert.ok(events.every((e) => e.approximateLocation && e.price.kind === 'unknown' && e.url.startsWith('https://partiful.com/e/')))
  assert.equal(events.find((e) => e.title.startsWith('Thirst'))!.lat, 37.77)
  assert.throws(() => parsePartiful('<html></html>'))
})

test('time zones: wall-clock conversion survives DST and windows use the event zone', () => {
  assert.equal(zonedToUtc('2026-10-17', '11:00', 'America/Los_Angeles')!.toISOString(), '2026-10-17T18:00:00.000Z')
  assert.equal(zonedToUtc('2026-12-01', '11:00', 'America/Los_Angeles')!.toISOString(), '2026-12-01T19:00:00.000Z')
  assert.equal(zonedToUtc('2026-10-17', '10:00', 'Europe/Lisbon')!.toISOString(), '2026-10-17T09:00:00.000Z')
  assert.equal(zonedToUtc('2026-03-08', '03:30', 'America/New_York')!.toISOString(), '2026-03-08T07:30:00.000Z')
  assert.equal(zonedToUtc('2026-10-17', '11:00', 'Not/AZone'), undefined)
  // 03:00 UTC on Oct 18 is still Saturday evening in San Francisco but Sunday in Lisbon.
  assert.equal(inWindow(base, 'today', NOW), true)
  assert.equal(inWindow({ ...base, timezone: 'Europe/Lisbon' }, 'today', NOW), false)
  assert.equal(inWindow({ ...base, timezone: 'Europe/Lisbon' }, 'tomorrow', NOW), true)
  assert.equal(inWindow({ ...base, start: '2026-10-19T03:00:00.000Z' }, 'weekend', NOW), true, 'Sunday evening')
  assert.equal(inWindow({ ...base, start: '2026-10-19T17:00:00.000Z' }, 'weekend', NOW), false, 'Monday')
  const thursday = new Date('2026-10-15T19:00:00Z')
  assert.equal(inWindow({ ...base, start: '2026-10-17T01:00:00.000Z' }, 'weekend', thursday), true, 'Friday 6 PM')
  assert.equal(inWindow({ ...base, start: '2026-10-16T20:00:00.000Z' }, 'weekend', thursday), false, 'Friday 1 PM')
})

test('ranking excludes expired, canceled, sold-out and online listings; free filter needs a listed free price', () => {
  const raw = [...parseLuma(LUMA).events, ...parseEventbrite(EVENTBRITE), ...parsePartiful(PARTIFUL),
    { ...base, sourceId: 'past', title: 'Already over', start: '2026-10-16T03:00:00.000Z', end: '2026-10-16T05:00:00.000Z' },
    { ...base, sourceId: 'started', title: 'Started without an end time', start: '2026-10-17T18:00:00.000Z' },
    { ...base, sourceId: 'cancel', title: 'CANCELLED: Rooftop jazz' },
    { ...base, sourceId: 'flag', title: 'Flagged canceled', canceled: true },
    { ...base, sourceId: 'online', title: 'Webinar', online: true }]
  const titles = rankEvents(raw, { origin: SF, when: 'any', freeOnly: false, interests: none, now: NOW }).events.map((e) => e.title)
  for (const gone of ['Already over', 'Started without an end time', 'CANCELLED: Rooftop jazz', 'Flagged canceled', 'Webinar']) assert.ok(!titles.includes(gone), gone)
  assert.ok(!titles.some((t) => t.startsWith('Financial Literacy')), 'sold out')
  assert.ok(titles.some((t) => t.startsWith('Arm')), 'ongoing event with a listed end stays')
  assert.ok(titles.includes('WILD WILD WEST'))
  const free = rankEvents(raw, { origin: SF, when: 'any', freeOnly: true, interests: none, now: NOW }).events
  assert.ok(free.length > 0 && free.every((e) => e.price.kind === 'free'))
})

test('interest matching explains reasons and relaxes visibly when nothing matches', () => {
  const raw = [...parseLuma(LUMA).events, ...parseEventbrite(EVENTBRITE), ...parsePartiful(PARTIFUL)]
  assert.deepEqual(parseInterests('music events this weekend in San Francisco', 'San Francisco').terms, ['music'])
  assert.deepEqual(parseInterests('live music near me').terms, ['music'])
  const music = rankEvents(raw, { origin: SF, when: 'any', freeOnly: false, interests: parseInterests('live music'), now: NOW })
  assert.equal(music.relaxed, false)
  assert.ok(music.events[0].title.startsWith('Best In The Bay'))
  assert.match(music.events[0].reasons[0], /music/i)
  const art = rankEvents(raw, { origin: SF, when: 'weekend', freeOnly: false, interests: parseInterests('art'), now: NOW })
  assert.ok(art.events.some((e) => e.title.startsWith('Shipyard Open Studios')))
  assert.ok(art.events.every((e) => e.reasons.includes('This weekend')))
  const zydeco = rankEvents(raw, { origin: SF, when: 'any', freeOnly: false, interests: parseInterests('zydeco'), now: NOW })
  assert.equal(zydeco.relaxed, true)
  assert.ok(zydeco.events.length > 0)
})

test('duplicates across sources merge into one listing with every source link', () => {
  const partiful = parsePartiful(PARTIFUL).find((e) => e.title.startsWith('Thirst'))!
  const lumaCopy: RawEvent = { ...partiful, source: 'luma', sourceId: 'evt-copy', title: 'Thirst Draft — Write Drunk, Edit Never!', url: 'https://luma.com/thirst', start: new Date(Date.parse(partiful.start) + 30 * 60_000).toISOString(), lat: 37.7712, lon: -122.4376, approximateLocation: false, price: { kind: 'free' } }
  const other: RawEvent = { ...lumaCopy, sourceId: 'evt-other', title: 'Thirst Draft: Write Drunk, Edit Never', start: new Date(Date.parse(partiful.start) + 7 * 86_400_000).toISOString() }
  assert.equal(dedupe([partiful, lumaCopy, partiful, other]).length, 2, 'same title a week later is a different event')
  const [merged] = rankEvents([partiful, lumaCopy], { origin: SF, when: 'any', freeOnly: false, interests: none, now: NOW }).events
  assert.deepEqual(merged.sources.map((s) => s.label).sort(), ['Luma', 'Partiful'])
  assert.deepEqual(merged.price, { kind: 'free' })
  assert.equal(merged.approximateDistance, false)
  assert.ok(merged.reasons.includes('Listed on Partiful and Luma') || merged.reasons.includes('Listed on Luma and Partiful'))
})

const fakeFetcher = (routes: Record<string, string | Error>, stale: string[] = []): Fetcher & { calls: string[] } => {
  const calls: string[] = []
  const f = async (url: string) => {
    calls.push(url)
    const hit = Object.entries(routes).find(([k]) => url.includes(k))
    if (!hit) throw new UpstreamError('Source answered 404.', 404)
    if (hit[1] instanceof Error) throw hit[1]
    const old = stale.some((s) => url.includes(s))
    return { body: hit[1], stale: old, fetchedAt: NOW.getTime() - (old ? 75 : 3) * 60_000 }
  }
  return Object.assign(f, { calls })
}

test('one failing source still returns partial results with a short explanation', async () => {
  const fetcher = fakeFetcher({ 'api.lu.ma': LUMA, 'eventbrite.com/d/ca--san-francisco/events/': EVENTBRITE, 'partiful.com': new UpstreamError('Source timed out.') })
  const result = await searchEvents({ ...SF, city: 'San Francisco', region: 'California', country: 'United States', countryCode: 'US', q: '', when: 'any', freeOnly: false }, fetcher, NOW)
  const state = Object.fromEntries(result.sources.map((s) => [s.source, s.state]))
  assert.deepEqual(state, { luma: 'ok', eventbrite: 'ok', partiful: 'failed' })
  assert.equal(result.sources.find((s) => s.source === 'partiful')!.note, 'Source timed out.')
  assert.ok(result.events.length >= 5)
})

test('cached copies carry when they were checked, and stale ones say they could not refresh', async () => {
  const fetcher = fakeFetcher({ 'api.lu.ma': LUMA, 'eventbrite.com/d/ca--san-francisco/events/': EVENTBRITE, 'partiful.com': PARTIFUL }, ['eventbrite.com'])
  const result = await searchEvents({ ...SF, city: 'San Francisco', region: 'California', countryCode: 'US', q: '', when: 'any', freeOnly: false }, fetcher, NOW)
  const byId = Object.fromEntries(result.sources.map((s) => [s.source, s]))
  assert.equal(byId.luma.checkedAt, new Date(NOW.getTime() - 3 * 60_000).toISOString())
  assert.equal(byId.luma.stale, false)
  assert.equal(byId.eventbrite.stale, true)
  assert.equal(byId.eventbrite.checkedAt, new Date(NOW.getTime() - 75 * 60_000).toISOString())
  assert.match(byId.eventbrite.note!, /Couldn't refresh/)
})

test('uncovered locations are explained without requesting those sources', async () => {
  const fetcher = fakeFetcher({ 'api.lu.ma': '{"entries":[],"has_more":false}' })
  const result = await searchEvents({ lat: 38.72, lon: -9.14, city: 'Lisbon', country: 'Portugal', countryCode: 'PT', q: 'jazz', when: 'week', freeOnly: false }, fetcher, NOW)
  const byId = Object.fromEntries(result.sources.map((s) => [s.source, s]))
  assert.equal(byId.partiful.state, 'not_covered')
  assert.equal(byId.eventbrite.state, 'not_covered')
  assert.equal(byId.luma.state, 'empty')
  assert.ok(!fetcher.calls.some((u) => u.includes('partiful')))
  assert.ok(fetcher.calls.some((u) => u.includes('/d/portugal--lisbon/jazz--events/')), 'interest page first')
})

test('fetcher caches, shares in-flight requests, serves stale copies on failure and caps size', async () => {
  let clock = 0, calls = 0, fail = false
  const impl = (async (url: string) => {
    calls++
    if (fail) throw new TypeError('network down')
    if (url.includes('huge')) return new Response('x'.repeat(10), { headers: { 'content-length': '9000000' } })
    return new Response(`body ${calls}`)
  }) as typeof fetch
  const get = createFetcher(impl, () => clock)
  const [a, b] = await Promise.all([get('https://example.com/a'), get('https://example.com/a')])
  assert.equal(calls, 1); assert.equal(a.body, 'body 1'); assert.equal(b.body, 'body 1')
  clock += 11 * 60_000; fail = true
  assert.deepEqual(await get('https://example.com/a'), { body: 'body 1', stale: true, fetchedAt: 0 }, 'stale copy keeps its original fetch time')
  clock += 3 * 60 * 60_000
  await assert.rejects(get('https://example.com/a'), /could not be reached/)
  fail = false
  await assert.rejects(get('https://example.com/huge'), /too large/)
  for (let i = 0; i < 20; i++) await get(`https://limited.example/${i}`).catch(() => {})
  await assert.rejects(get('https://limited.example/one-more'), /Too many requests/)
})

test('events HTTP handler validates input, rate-limits and only grants CORS to allowed origins', async () => {
  const handle = createEventsHandler({ fetcher: fakeFetcher({ 'api.lu.ma': LUMA }), now: () => NOW, allowedOrigins: ['https://jayasrisng.com'], perMinute: 3 })
  const bad = await handle(new Request('http://x/events-api/search?lat=999&lon=0'))
  assert.equal(bad.status, 400)
  const ok = await handle(new Request('http://x/events-api/search?lat=37.77&lon=-122.42&city=Nowhere&when=bogus', { headers: { origin: 'https://jayasrisng.com' } }))
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://jayasrisng.com')
  const body = await ok.json() as { events: unknown[]; sources: unknown[] }
  assert.ok(Array.isArray(body.events) && body.sources.length === 3)
  const evil = await handle(new Request('http://x/events-api/search?lat=1&lon=1', { headers: { origin: 'https://evil.example' } }))
  assert.equal(evil.headers.get('access-control-allow-origin'), null)
  assert.equal((await handle(new Request('http://x/events-api/search?lat=1&lon=1'))).status, 429)
  assert.equal((await handle(new Request('http://x/events-api/search', { method: 'POST' }))).status, 405)
})

test('hosted protections: origin required, per-instance cap, source cooldown, bounded cache keys and memory', async () => {
  const hosted = createEventsHandler({ fetcher: fakeFetcher({ 'api.lu.ma': LUMA }), now: () => NOW, allowedOrigins: ['https://jayasrisng.com'], requireOrigin: true, perMinute: 50, instancePerMinute: 2 })
  const ask = (origin?: string, client = 'a') => hosted(new Request('http://x/tatada-events/search?lat=37.77&lon=-122.42&city=Nowhere', { headers: origin ? { origin } : {} }), client)
  assert.equal((await ask()).status, 403, 'scripts without an Origin are refused')
  assert.equal((await ask('https://evil.example')).status, 403)
  assert.equal((await hosted(new Request('http://x/tatada-events/health'))).status, 200)
  assert.equal((await ask('https://jayasrisng.com', 'a')).status, 200)
  assert.equal((await ask('https://jayasrisng.com', 'b')).status, 200)
  assert.equal((await ask('https://jayasrisng.com', 'c')).status, 429, 'instance-wide cap applies across clients')

  // Snapped coordinates share one upstream page; odd interest words fall back to the city page.
  assert.equal(lumaUrl(37.7749, -122.4194), lumaUrl(37.7801, -122.4111))
  assert.match(lumaUrl(37.7749, -122.4194), /latitude=37\.78&longitude=-122\.42/)
  assert.equal(eventbriteUrl('ca--san-francisco', 'jazz'), 'https://www.eventbrite.com/d/ca--san-francisco/jazz--events/')
  assert.equal(eventbriteUrl('ca--san-francisco', 'x'.repeat(40)), 'https://www.eventbrite.com/d/ca--san-francisco/events/')

  let clock = 0, calls = 0
  const limited = createFetcher((async () => { calls++; return new Response('slow down', { status: 429, headers: { 'retry-after': '600' } }) }) as typeof fetch, () => clock)
  await assert.rejects(limited('https://api.lu.ma/a'), /429/)
  await assert.rejects(limited('https://api.lu.ma/b'), /slow down/)
  clock += 9 * 60_000
  await assert.rejects(limited('https://api.lu.ma/c'), /slow down/)
  clock += 2 * 60_000
  await assert.rejects(limited('https://api.lu.ma/d'), /429/)
  assert.equal(calls, 2, 'no upstream calls during the requested cooldown')

  const big = 'x'.repeat(3_900_000)
  let served = 0
  const cached = createFetcher((async () => { served++; return new Response(big) }) as typeof fetch, () => clock)
  for (let i = 0; i < 12; i++) await cached(`https://h${i}.example/`)
  await cached('https://h11.example/')
  assert.equal(served, 12, 'recent entries stay cached')
  await cached('https://h0.example/')
  assert.equal(served, 13, 'oldest entries are evicted beyond ~40 MB')
})
