// Home map, Today context, and the shared photo import (locations + closet) in a phone viewport.
// Map/geocoding/model traffic is controlled: Photon is mocked; the clothing model download is blocked
// to prove a clothing failure never blocks locations. Never touches the user's own browser saves.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const base = (process.env.BASE ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [], geocodes = []
  p.on('pageerror', (e) => errors.push(e.message))
  await p.route('https://photon.komoot.io/reverse?**', (r) => { geocodes.push(new URL(r.request().url())); r.fulfill({ json: { features: [{ properties: { name: 'Café Majestic', osm_value: 'cafe', city: 'Porto', country: 'Portugal', countrycode: 'PT' } }] } }) })
  await p.route(/huggingface\.co|hf\.co|cdn\.jsdelivr\.net/, (r) => r.abort())
  const saved = () => p.evaluate(() => JSON.parse(localStorage.getItem('tatada:v1:preview')))

  // Home: map canvas, next trip with countdown, compact pending count.
  await p.goto(`${base}/`)
  await p.locator('.world-map path').first().waitFor()
  assert.match(await p.locator('.home-trip').innerText(), /Lisbon[\s\S]*in \d+ days · Nov/)
  assert.ok(await p.locator('.world-map path.planned').count() >= 2, 'Portugal and the US (Big Sur) are planned')
  assert.equal(await p.locator('.world-map path.visited').count(), 0, 'sample trips are not counted as visited')
  const pending = (await saved()).items.filter((i) => !i.done).length
  assert.equal(await p.locator('.tabbar .dot').innerText(), String(pending))

  // Magic and Style default to Today; they never silently pick Lisbon.
  await p.locator('.tab-magic').click()
  await p.locator('.magic-context button[aria-pressed="true"]', { hasText: 'today' }).waitFor({ timeout: 5000 })
  assert.equal(await p.locator('.magic-context').getByRole('button', { name: 'Lisbon', exact: true }).getAttribute('aria-pressed'), 'false')
  await p.getByRole('button', { name: 'Close Magic' }).click()
  await p.goto(`${base}/#/trip/${(await saved()).trips.find((t) => t.destination === 'Lisbon').id}`)
  await p.locator('.tab-magic').click()
  await p.locator('.magic-context button[aria-pressed="true"]', { hasText: 'Lisbon' }).waitFor({ timeout: 5000 }) // explicit trip page context
  await p.getByRole('button', { name: 'Close Magic' }).click()
  await p.goto(`${base}/#/style`)
  assert.equal(await p.getByRole('group', { name: 'Style for' }).getByRole('button', { name: 'today', exact: true }).getAttribute('aria-pressed'), 'true')

  // One import: metadata labels, consented reverse geocoding (coordinates only), unknown stays blank, clothes in parallel.
  await p.goto(`${base}/#/trips/map`)
  await p.getByRole('button', { name: 'add photos', exact: true }).click()
  await p.getByLabel('Photos to import').setInputFiles(['scripts/fixtures/photos/lisbon-meta.jpg', 'scripts/fixtures/photos/porto-gps.jpg', 'scripts/fixtures/photos/unknown.jpg', 'public/wardrobe/white-sweater.png'])
  await p.locator('.pi-row').nth(3).waitFor()
  assert.equal(await p.getByLabel('City for lisbon-meta.jpg').inputValue(), 'Lisboa')
  assert.equal(await p.getByLabel('Place for lisbon-meta.jpg').inputValue(), 'Miradouro da Graça')
  assert.equal(await p.getByLabel('Date for lisbon-meta.jpg').inputValue(), '2024-05-01')
  assert.equal(await p.getByLabel('City for porto-gps.jpg').inputValue(), '', 'nothing proposed before consent')
  assert.equal(geocodes.length, 0, 'no coordinates leave the device before consent')
  for (const f of ['City', 'Country', 'Place', 'Date']) assert.equal(await p.getByLabel(`${f} for unknown.jpg`).inputValue(), '', `unknown ${f} stays blank`)
  await p.getByRole('button', { name: 'look up', exact: true }).click()
  await p.waitForFunction(() => document.querySelector('[aria-label="City for porto-gps.jpg"]')?.value === 'Porto')
  assert.equal(await p.getByLabel('Place for porto-gps.jpg').inputValue(), '', 'the nearby café is not invented as the place')
  assert.equal(geocodes.length, 1)
  assert.deepEqual([geocodes[0].searchParams.get('lat'), geocodes[0].searchParams.get('lon')], ['41.146', '-8.611'], 'rounded coordinates only')
  assert.match(await p.locator('.pi-row').nth(1).innerText(), /suggested from GPS/)
  // The transparent garment PNG needs no model; the JPEGs fail to load the blocked model and offer retry.
  await p.getByLabel('I still own piece 1 in white-sweater.png').waitFor({ timeout: 60000 })
  await p.getByLabel('Name of piece 1 in white-sweater.png').fill('White sweater')
  await p.getByLabel('Category of piece 1 in white-sweater.png').selectOption('layer')
  await p.getByLabel('I still own piece 1 in white-sweater.png').check()
  await p.waitForFunction(() => !/finding clothes/.test(document.querySelector('.pi-actions .btn-solid')?.textContent ?? ''), null, { timeout: 120000 })
  assert.ok(await p.getByRole('button', { name: 'retry' }).count() >= 1, 'clothing failures are recoverable')
  await p.getByLabel('Country for white-sweater.png').fill('')
  await p.screenshot({ path: 'scripts/out/import-review.png', fullPage: true })
  await p.getByRole('button', { name: /^add 2 to map · 1 to closet$/ }).click()
  await p.getByRole('region', { name: 'Import result' }).or(p.locator('[aria-label="Import result"]')).waitFor()
  const result = await p.locator('[aria-label="Import result"]').innerText()
  assert.match(result, /Lisboa, Portugal · Miradouro da Graça/); assert.match(result, /Porto, Portugal/); assert.match(result, /White sweater/)
  const state = await saved()
  assert.equal(state.photoHistory.length, 2, 'only photos with a country join the map')
  assert.deepEqual(state.photoHistory.map((x) => x.labelSource).sort(), ['geocoded', 'metadata'])
  assert.equal(state.wardrobe.filter((g) => g.sourceFingerprint).length, 1)
  await p.getByRole('button', { name: 'done', exact: true }).click()
  assert.match(await p.locator('.travel-stats-line').innerText(), /1 country · 2 cities · 1 place/)
  assert.equal(await p.locator('.world-map path.visited').count(), 1)
  assert.equal(await p.locator('.photo-timeline img, .travel-history img').count(), 0, 'no permanent gallery in map history')

  // Hand-edited countries, persistence, and duplicate imports.
  await p.getByRole('button', { name: 'edit countries' }).click()
  await p.getByLabel('Find a country').fill('japan')
  await p.getByRole('checkbox', { name: /Japan/ }).check()
  assert.match(await p.locator('.travel-stats-line').innerText(), /2 countries/)
  await p.reload()
  await p.locator('.travel-stats-line').waitFor()
  assert.match(await p.locator('.travel-stats-line').innerText(), /2 countries · 2 cities · 1 place/)
  await p.getByRole('button', { name: 'add photos', exact: true }).click()
  await p.getByLabel('Photos to import').setInputFiles(['scripts/fixtures/photos/lisbon-meta.jpg', 'public/wardrobe/white-sweater.png'])
  await p.locator('.pi-row').nth(1).waitFor()
  assert.match(await p.locator('.pi-row').first().innerText(), /already on your map/)
  assert.match(await p.locator('.pi-row').nth(1).innerText(), /already in your closet/)
  await p.screenshot({ path: 'scripts/out/import-duplicates.png', fullPage: true })
  // The trip journal still shows existing photos (journal not redesigned).
  await p.goto(`${base}/#/trip/${state.photoHistory.find((x) => x.city === 'Porto').tripId}/journal`)
  await p.locator('.trip-photo-timeline img').waitFor()
  assert.deepEqual(errors, [])
  console.log('Passed: home map + countdown + pending count, Today vs explicit trip context, metadata/geocoded/unknown labels, consent and rounded coordinates, mixed batch, recoverable clothing failure, closet confirm, country checkboxes, reload, duplicates, journal photos.')
} finally { await browser.close() }
