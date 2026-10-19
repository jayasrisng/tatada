// Browser smoke test with behavioral assertions. Uses the locally installed
// Chrome. Needs `npm run dev` and `npm run server` (mock Fo) running.
//   npm run smoke            (BASE=http://localhost:5173 by default)
// Screenshots land in scripts/out/. Any failed assertion or console error exits 1.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const API_BASE = process.env.API_BASE ?? new URL(BASE).origin
const OUT = new URL('./out/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const failures = []
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`)
  if (!ok) failures.push(msg)
}

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(e.message))
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png` })
const visit = async (hash) => {
  await page.goto(`${BASE}/#${hash}`)
  await page.waitForTimeout(350)
}
const statusOf = async (loc, want, timeout = 20000) => {
  const end = Date.now() + timeout
  let got = null
  while (Date.now() < end) {
    got = await loc.getAttribute('data-status').catch(() => null)
    if (got === want) return got
    await page.waitForTimeout(250)
  }
  return got
}
const magic = () => page.getByRole('dialog', { name: 'Magic' })
const serverCard = () => magic().locator('[data-server-action]').last()

try {
  const status = await page.request.post(`${API_BASE}/api/session`, { headers: { 'x-tatada': '1', origin: new URL(BASE).origin } }).then((r) => r.json()).catch(() => null)
  check(status?.provider === 'mock', 'Tatada server reachable in mock mode (run `npm run server`)')

  await page.goto(`${BASE}/`)
  await page.evaluate(() => localStorage.clear())
  await visit('/')
  await shot('01-home')
  check(/Lisbon[\s\S]*in \d+ days/.test(await page.locator('.home-trip').innerText()), 'home shows the next trip with its countdown')
  check(await page.locator('.world-map path').first().waitFor({ timeout: 6000 }).then(() => true, () => false), 'home canvas is the world map')

  /* ── trip creation with date validation ── */
  await visit('/new')
  await page.getByLabel('Destination').fill('Porto')
  await page.getByRole('button', { name: 'next' }).click()
  const dates = page.locator('input[type=date]')
  check((await dates.nth(0).inputValue()) > new Date().toISOString().slice(0, 10), 'default start date is in the future')
  await dates.nth(1).fill('2020-01-01')
  check(await page.getByRole('alert').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'invalid range shows an error')
  check(await page.getByRole('button', { name: 'next' }).isDisabled(), 'next is disabled for an invalid range')
  const start = await dates.nth(0).inputValue()
  const end = new Date(Date.parse(start) + 3 * 86400000).toISOString().slice(0, 10)
  await dates.nth(1).fill(end)
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'next' }).click()
  await page.getByRole('button', { name: 'make my trip' }).click()
  await page.waitForURL(/#\/trip\/.+\/notebook/)
  const portoUrl = page.url()
  check(await page.getByRole('heading', { name: 'Porto' }).first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'new trip opens its workspace')
  check(await page.getByText('Live research isn\'t connected yet').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'empty notebook is honest about research')
  check((await page.getByText('sample research').count()) === 0, 'no fake sample research on a new trip')
  await shot('02-new-trip-notebook')

  /* ── persistence after reload ── */
  await page.reload()
  await page.waitForTimeout(400)
  check(await page.getByRole('heading', { name: 'Porto' }).first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'new trip survives a reload')

  /* ── non-Lisbon early check-in: missing details are asked for, then the server takes it ── */
  await page.locator('.tab-magic').click()
  await magic().getByRole('tab', { name: 'scripted helper' }).click()
  await magic().getByRole('textbox', { name: 'Ask Magic' }).fill('Ask my stay for early check-in')
  await magic().getByRole('button', { name: 'Send' }).click()
  const form = magic().locator('.details-form').last()
  await form.waitFor()
  check(!(await magic().locator('.bubble.tatada').last().textContent()).match(/Casa do Largo|CDL-|Lisbon|Nov 7/), 'no Lisbon details leak into another trip')
  await form.getByLabel('Where are you staying?').fill('Casa Ribeira')
  await form.getByLabel('Their email address').fill('desk+confirm@ribeira.example')
  await form.getByLabel('Check-in date').fill(start)
  await form.getByLabel('When do you expect to arrive?').fill('10:30')
  await form.getByRole('button', { name: 'use these details' }).click()
  await serverCard().waitFor()
  const card = serverCard()
  check(/Casa Ribeira/.test(await card.textContent()), 'server proposal uses the trip\'s own stay')
  check(await card.getByText('MOCK FO', { exact: true }).first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'mock provider is labeled')
  await shot('03-server-proposal')
  await card.getByRole('button', { name: 'Approve & send' }).click()
  check((await statusOf(serverCard(), 'verified')) === 'verified', 'approved request is verified with evidence')
  check(/early check-in works/.test(await serverCard().textContent()) && /Send record/.test(await serverCard().textContent()), 'result shows the reply and the send record')
  await shot('04-server-verified')

  /* ── reload recovery for server actions ── */
  await page.reload()
  await page.waitForTimeout(500)
  await page.locator('.tab-magic').click()
  await magic().getByRole('tab', { name: 'scripted helper' }).click()
  check((await statusOf(serverCard(), 'verified', 6000)) === 'verified', 'server action status is restored after a reload')
  await page.keyboard.press('Escape')

  /* ── real Fo chat (mock provider): truthful status, exact preview, risk gate, history ── */
  await page.keyboard.press('Escape')
  await visit('/')
  await page.locator('.tab-magic').click()
  check(await magic().getByRole('tab', { name: 'nearby & events', selected: true }).first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'Magic opens discovery choices')
  await magic().getByRole('tab', { name: 'Fo chat', exact: true }).click()
  check(await magic().getByText('Connected to mock Fo').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'connection state shown truthfully (mock)')
  const foBox = magic().getByRole('textbox', { name: 'Message to Fo' })
  await foBox.fill('What should I pack for the hills?')
  await magic().getByRole('button', { name: 'Preview message' }).click()
  const preview = magic().getByTestId('fo-preview')
  await preview.waitFor()
  check(/What should I pack for the hills\?/.test(await preview.locator('.fo-message').textContent()) && /Tatada ref T-/.test(await preview.locator('.fo-message').textContent()), 'preview shows the exact outgoing text')
  check((await page.request.get(`${API_BASE}/api/fo/chats?tripId=`).then((r) => r.json())).chats.every((c) => c.turns.length === 0), 'opening and previewing sent nothing')
  await preview.getByRole('button', { name: 'Send to Fo' }).click()
  check(await magic().getByText('mock Fo says').first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'Fo\'s reply appears, labeled as Fo\'s words')
  await foBox.fill('Book a table for two at 8')
  await magic().getByRole('button', { name: 'Preview message' }).click()
  const risky = magic().getByTestId('fo-preview')
  await risky.waitFor()
  check(await risky.getByRole('button', { name: 'Send to Fo' }).isDisabled(), 'risky request needs separate confirmation')
  await risky.getByRole('button', { name: 'Edit' }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  await page.waitForTimeout(500)
  await page.locator('.tab-magic').click()
  await magic().getByRole('tab', { name: 'Fo chat', exact: true }).click()
  check(await magic().getByText('What should I pack for the hills?').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'Fo conversation history survives a reload')
  await page.keyboard.press('Escape')

  /* ── focus trap + restoration ── */
  await visit('/trips')
  const opener = page.locator('.tab-magic')
  await opener.focus()
  await page.keyboard.press('Enter')
  await magic().waitFor()
  let inside = true
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab')
    inside &&= await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))
  }
  check(inside, 'Tab stays inside Magic')
  check(await page.evaluate(() => document.querySelector('main')?.hasAttribute('inert')), 'background is inert while Magic is open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  check(await page.evaluate(() => document.activeElement?.classList.contains('tab-magic')), 'focus returns to the opener')

  /* ── cancellation + context switching on Lisbon ── */
  await page.evaluate(() => localStorage.clear())
  await visit('/trip/lisbon')
  const lisbonItem = page.locator('.crow', { hasText: 'Early check-in + airport transfer' })
  await lisbonItem.locator('.fo-pill').click()
  check((await magic().getByRole('textbox', { name: 'Ask Magic' }).inputValue()).length > 0, 'task star prepares a request without sending it')
  await magic().getByRole('button', { name: 'Send', exact: true }).click()
  await serverCard().waitFor()
  await serverCard().getByRole('button', { name: 'Not now' }).click()
  await page.waitForTimeout(400)
  check((await statusOf(serverCard(), 'cancelled', 4000)) === 'cancelled', 'cancel before approval works')

  // Switch context to Big Sur with the Lisbon task still linked, then complete a request there.
  await page.keyboard.press('Escape')
  await visit('/trip/lisbon')
  await page.locator('.crow', { hasText: 'Early check-in + airport transfer' }).locator('.fo-pill').click()
  await magic().getByRole('button', { name: 'Big Sur' }).click()
  await magic().getByRole('textbox', { name: 'Ask Magic' }).fill('what should I pack?')
  await magic().getByRole('button', { name: 'Send' }).click()
  await magic().getByRole('textbox', { name: 'Ask Magic' }).fill('what should I pack?')
  await magic().getByRole('button', { name: 'Send' }).click()
  await page.waitForTimeout(300)
  check(/already on your list/.test(await magic().locator('.bubble.tatada').last().textContent()), 'repeated packing request adds nothing twice')
  await page.keyboard.press('Escape')
  await visit('/trip/lisbon')
  check(!(await lisbonItem.locator('.ccheck').getAttribute('aria-checked')).includes('true'), 'Lisbon task is untouched by another trip\'s request')

  /* ── checklist + pending count persistence after reload ── */
  const pendingBefore = Number(await page.locator('.tabbar .dot').innerText())
  const toggle = page.locator('.crow', { hasText: 'Travel insurance' }).locator('.ccheck')
  await toggle.click()
  await visit('/')
  await page.reload()
  await page.waitForTimeout(500)
  check(Number(await page.locator('.tabbar .dot').innerText()) === pendingBefore - 1, 'compact pending count follows checked tasks after reload')
  await visit('/trip/lisbon')
  check((await page.locator('.crow', { hasText: 'Travel insurance' }).locator('.ccheck').getAttribute('aria-checked')) === 'true', 'checked task persists after reload')

  /* ── other screens + recovery routes ── */
  await visit('/trip/lisbon/notebook')
  await page.getByRole('button', { name: 'compare' }).click()
  await shot('05-compare')
  await visit('/style')
  check((await page.getByRole('group', { name: 'Style for' }).getByRole('button', { name: 'today', exact: true }).getAttribute('aria-pressed')) === 'true', 'Style starts with today, not a trip')
  await page.getByRole('group', { name: 'Style for' }).getByRole('button', { name: 'Lisbon', exact: true }).click()
  await page.getByRole('tab', { name: 'itinerary' }).click()
  check(await page.getByRole('heading', { name: /Sat, Nov 7/ }).first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'itinerary day labels are computed from dates')
  await page.getByRole('button', { name: '+ add to Sun' }).click()
  await page.getByLabel('Plan').fill('Fado night')
  await page.getByRole('button', { name: 'dressy', exact: true }).click()
  check((await page.getByLabel('Plan').count()) === 1, 'choosing a dress code does not submit the form')
  await page.getByRole('button', { name: 'save' }).click()
  check(await page.getByRole('button', { name: /Edit Fado night/ }).isVisible(), 'itinerary item added')
  await page.getByRole('button', { name: 'Delete Fado night' }).click()
  check((await page.getByRole('button', { name: /Edit Fado night/ }).count()) === 0, 'itinerary item deleted')
  await page.getByRole('tab', { name: 'swipe' }).click()
  await page.getByRole('button', { name: 'pack it' }).click()
  await page.getByRole('button', { name: 'skip' }).click()
  await page.getByRole('tab', { name: 'board' }).click()
  check((await page.locator('.board-look').count()) === 1, 'swiping right puts one look on the moodboard')
  await page.getByRole('button', { name: /add \d+ to packing checklist/ }).click()
  check(await page.getByRole('button', { name: 'all on your checklist' }).isVisible(), 'packing list added to the checklist once')
  await shot('06-style')
  await shot('06-style')
  await visit('/trip/lisbon/print')
  check(await page.getByLabel('Epson printer email').waitFor({ timeout: 6000 }).then(() => true, () => false), 'first print asks for the Epson printer address')
  await shot('07-print')
  await visit('/trip/does-not-exist/print')
  check(await page.getByText('nothing to print here').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'unknown print route offers recovery')
  await page.goto(portoUrl)
  await page.waitForTimeout(300)
  await visit('/welcome')
  check(await page.getByText('Mock Fo').first().waitFor({ timeout: 4000 }).then(() => true, () => false), 'profile shows Fo connection mode')
  await shot('08-welcome')
} catch (e) {
  failures.push(`crashed: ${e.message}`)
  await shot('99-crash').catch(() => {})
} finally {
  await browser.close()
}

if (errors.length) failures.push(`console errors:\n  ${errors.join('\n  ')}`)
if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`\nok · screenshots in ${OUT}`)
