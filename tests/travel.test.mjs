import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.env.TATADA_TEST_BUILD, 'package.json'))
const { countryCode, allCountries } = require('./travel/countries.js')
const { visitedCountries, plannedCountries, placeTree, travelStats, tripOfTheMoment } = require('./travel/history.js')
const { metadataLabels, geocodeProposal, applyLabels, setField, needsGeocode, mapsable, toTravelPhoto, tripsFor, toGarments, summarize, dateProblem, roundedPoint } = require('./travel/importer.js')
const { reducer } = require('./state/reducer.js')
const { seed } = require('./data/seed.js')
const { buildExport, parseImport } = require('./state/portability.js')
const { isAppState } = require('./state/persistence.js')

const blank = (over = {}) => ({ id: over.id ?? 'p1', fileName: 'a.jpg', fingerprint: over.fingerprint ?? 'f1', image: 'data:image/jpeg;base64,AA', capturedAt: '2024-05-01T10:00:00', dateSource: 'exif', fields: { place: '', city: '', country: '' }, sources: {}, inHistory: false, inCloset: false, geocode: 'none', clothes: 'off', pieces: [], ...over })
let n = 0
const id = () => `id${++n}`

test('country labels match by name, alias and code; unknown stays unknown', () => {
  for (const [label, code] of [['Portugal', 'PT'], ['USA', 'US'], ['United States of America', 'US'], ['España', 'ES'], ['Türkiye', 'TR'], ['  france ', 'FR'], ['de', 'DE'], ['Bosnia and Herz.', 'BA']]) assert.equal(countryCode(label), code, label)
  assert.equal(countryCode('Atlantis'), undefined)
  assert.ok(allCountries().some((c) => c.code === 'SG'), 'small countries without a map shape are still listed')
})

test('photo metadata prefills labels; geocoding proposes city/country only, never a place', () => {
  assert.deepEqual(metadataLabels({ City: 'Lisboa', Country: 'Portugal', Sublocation: 'Miradouro da Graça' }), { place: 'Miradouro da Graça', city: 'Lisboa', country: 'Portugal' })
  assert.deepEqual(metadataLabels({ City: 'Kyoto', CountryCode: 'JP' }), { city: 'Kyoto', country: 'Japan' })
  assert.deepEqual(metadataLabels({ Make: 'Apple' }), {})
  assert.deepEqual(metadataLabels(null), {})
  const proposal = geocodeProposal({ name: 'Pastelaria Batalha', osm_value: 'cafe', city: 'Porto', country: 'Portugal', countrycode: 'PT' })
  assert.deepEqual(proposal, { city: 'Porto', country: 'Portugal' }, 'the nearest business name is not used')
  assert.deepEqual(geocodeProposal({ name: 'Sintra', osm_value: 'town', countrycode: 'PT' }), { city: 'Sintra', country: 'Portugal' })
  assert.deepEqual(geocodeProposal(undefined), {})
  assert.deepEqual(roundedPoint(38.712345, -9.139876), { lat: 38.712, lon: -9.14 })
})

test('labels fill only blanks, remember their source, and typed values win', () => {
  let d = applyLabels(blank(), { city: 'Lisboa', country: 'Portugal' }, 'metadata')
  assert.deepEqual(d.sources, { city: 'metadata', country: 'metadata' })
  d = applyLabels(setField(d, 'city', 'Lisbon'), { city: 'Sintra', place: 'X' }, 'geocoded')
  assert.equal(d.fields.city, 'Lisbon'); assert.equal(d.sources.city, 'you'); assert.equal(d.fields.place, 'X'); assert.equal(d.sources.place, 'geocoded')
  assert.equal(needsGeocode(blank({ lat: 1, lon: 2 })), true)
  assert.equal(needsGeocode(blank({ lat: 1, lon: 2, fields: { place: '', city: 'A', country: 'B' } })), false)
  assert.equal(needsGeocode(blank()), false, 'no coordinates, nothing to look up')
  assert.equal(needsGeocode(blank({ lat: 1, lon: 2, inHistory: true })), false, 'duplicates are not looked up again')
})

test('unknown location and date stay blank; only photos with a country join the map', () => {
  const unknown = blank({ capturedAt: '', dateSource: 'you' })
  assert.equal(mapsable(unknown), false)
  const p = toTravelPhoto(setField(unknown, 'country', 'Portugal'))
  assert.deepEqual([p.city, p.country, p.capturedAt, p.place, p.lat], ['', 'Portugal', '', undefined, undefined])
  assert.equal(p.labelSource, 'you')
  assert.equal(dateProblem(blank({ capturedAt: '2999-01-01T00:00:00' }), '2026-10-18'), 'future')
  assert.equal(mapsable(blank({ inHistory: true, fields: { place: '', city: '', country: 'PT' } })), false)
})

test('a mixed-location batch becomes separate trips; undated photos create none', () => {
  const photos = [
    toTravelPhoto(blank({ id: 'a', fields: { place: 'Time Out Market', city: 'Lisbon', country: 'Portugal' }, sources: { city: 'metadata' }, capturedAt: '2024-05-01T10:00:00' })),
    toTravelPhoto(blank({ id: 'b', fields: { place: '', city: 'Lisbon', country: 'Portugal' }, capturedAt: '2024-05-02T10:00:00' })),
    toTravelPhoto(blank({ id: 'c', fields: { place: '', city: 'Porto', country: 'Portugal' }, capturedAt: '2024-05-03T10:00:00' })),
    toTravelPhoto(blank({ id: 'd', fields: { place: '', city: 'Kyoto', country: 'Japan' }, capturedAt: '', dateSource: 'you' })),
  ]
  const { photos: linked, trips } = tripsFor(photos, [], '2026-10-18', id)
  assert.deepEqual(trips.map((t) => [t.destination, t.start, t.end, t.status]), [['Lisbon', '2024-05-01', '2024-05-02', 'past'], ['Porto', '2024-05-03', '2024-05-03', 'past']])
  assert.equal(linked.find((p) => p.id === 'd').tripId, undefined)
  assert.equal(linked.find((p) => p.id === 'a').tripId, linked.find((p) => p.id === 'b').tripId)
  const again = tripsFor(photos, trips, '2026-10-18', id)
  assert.equal(again.trips.length, 0, 'existing trips covering the dates are reused')
  const s = summarize(linked, [])
  assert.deepEqual(s.locations.map((l) => [l.city, l.places]), [['Lisbon', ['Time Out Market']], ['Porto', []], ['Kyoto', []]])
  const stats = travelStats(linked)
  assert.deepEqual([stats.countries, stats.cities, stats.places], [2, 3, 1], 'photos are not places; only confirmed place names count')
})

test('only pieces confirmed as still owned and named reach the closet, tagged with their photo', () => {
  const d = blank({ fingerprint: 'abc', pieces: [{ name: 'Blue shirt', category: 'top', color: '#00f', image: 'data:x', own: true }, { name: 'Old jeans', category: 'bottom', color: '#333', image: 'data:y', own: false }, { name: '  ', category: 'shoes', color: '#000', image: 'data:z', own: true }] })
  const g = toGarments(d, id, 5)
  assert.deepEqual(g.map((x) => [x.name, x.category, x.sourceFingerprint, x.source]), [['Blue shirt', 'top', 'abc', 'camera']])
})

test('visited vs planned countries, hand edits, and the concise list', () => {
  const photos = [{ id: '1', fingerprint: '1', filename: 'x', capturedAt: '', dateSource: 'you', city: 'Lisbon', country: 'Portugal', place: 'LX Factory', image: 'd' }, { id: '2', fingerprint: '2', filename: 'y', capturedAt: '', dateSource: 'you', city: 'Paris', country: 'France', image: 'd' }]
  const visited = visitedCountries(photos, { JP: 'visited', FR: 'not_visited' })
  assert.deepEqual([...visited].sort(), ['JP', 'PT'])
  const trips = [{ ...seed().trips[0], country: 'Iceland', status: 'upcoming' }, { ...seed().trips[0], id: 'x', country: 'Japan', status: 'past' }]
  assert.deepEqual([...plannedCountries(trips)], ['IS'])
  const tree = placeTree(photos, visited)
  assert.deepEqual(tree.map((c) => [c.name, c.cities.map((x) => [x.name, x.places])]), [['Japan', []], ['Portugal', [['Lisbon', ['LX Factory']]]]], 'France unticked by hand is hidden')
})

test('the trip of the moment: current first, else nearest upcoming, else none', () => {
  const t = (id, start, end, status = 'upcoming') => ({ ...seed().trips[0], id, start, end, status })
  assert.deepEqual(tripOfTheMoment([t('a', '2026-11-01', '2026-11-05'), t('b', '2026-10-17', '2026-10-20')], '2026-10-18'), { trip: t('b', '2026-10-17', '2026-10-20'), now: true })
  assert.equal(tripOfTheMoment([t('a', '2026-12-01', '2026-12-05'), t('c', '2026-11-01', '2026-11-02')], '2026-10-18').trip.id, 'c')
  assert.equal(tripOfTheMoment([t('p', '2020-01-01', '2020-01-02', 'past')], '2026-10-18'), undefined)
})

test('country marks persist through the validator, reducer and export/import', () => {
  let s = reducer(seed(), { type: 'markCountry', code: 'JP', mark: 'visited' })
  s = reducer(s, { type: 'markCountry', code: 'PT', mark: 'not_visited' })
  assert.deepEqual(s.countryMarks, { JP: 'visited', PT: 'not_visited' })
  assert.deepEqual(reducer(s, { type: 'markCountry', code: 'JP', mark: null }).countryMarks, { PT: 'not_visited' })
  assert.equal(isAppState(s), true)
  assert.equal(isAppState({ ...s, countryMarks: { JP: 'maybe' } }), false)
  const restored = parseImport(JSON.stringify(buildExport(s, [])))
  assert.equal(restored.ok, true); assert.deepEqual(restored.state.countryMarks, s.countryMarks)
  const old = seed(); delete old.countryMarks
  assert.equal(isAppState(old), true, 'saves from before this change still load')
})
