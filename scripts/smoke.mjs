// Smoke test: walks the main screens on a phone-sized viewport using the
// locally installed Chrome, fails on console errors, and saves screenshots
// to scripts/out/. Usage: npm run dev (in another terminal), then npm run smoke.
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = new URL('./out/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(e.message))

const shot = async (name) => page.screenshot({ path: `${OUT}${name}.png` })
const visit = async (hash, name) => {
  await page.goto(`${BASE}/#${hash}`)
  await page.waitForTimeout(500)
  await shot(name)
}

await page.goto(BASE)
await page.evaluate(() => localStorage.clear())

await visit('/', '01-home')
await visit('/trips', '02-trips')
await visit('/trip/lisbon', '03-trip-plan')
await visit('/trip/lisbon/notebook', '04-notebook')
await page.getByRole('button', { name: 'compare' }).click()
await shot('05-compare')
await visit('/trip/kyoto/journal', '06-journal')
await visit('/tasks', '07-tasks')
await visit('/style', '08-style')
await visit('/trip/lisbon/print', '09-print-card')
await visit('/trip/kyoto/print/journal', '10-print-journal')
await visit('/new', '11-new-trip')
await visit('/welcome', '12-welcome')

// Full Fo flow: dinner call with a mid-call question.
await visit('/trip/lisbon', '13-before-fo')
await page.locator('.fo-pill').nth(1).click()
await page.waitForSelector('.action-card')
await shot('14-proposal')
await page.getByRole('button', { name: 'Approve' }).click()
await page.waitForSelector('.ac-question', { timeout: 15000 })
await shot('15-needs-input')
await page.getByRole('button', { name: '7:00pm Saturday' }).click()
await page.waitForSelector('.status-verified', { timeout: 20000 })
await shot('16-verified')

// Drag a canvas card and check it persists.
await page.getByRole('button', { name: 'Close Magic' }).click()
await visit('/', '17-home-after')
const card = page.locator('.cc-style')
const box = await card.boundingBox()
await page.mouse.move(box.x + 20, box.y + 20)
await page.mouse.down()
await page.mouse.move(box.x + 120, box.y + 60, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(400)
await shot('18-home-dragged')

await browser.close()
if (errors.length) {
  console.error('Console errors:\n' + errors.join('\n'))
  process.exit(1)
}
console.log(`ok · screenshots in ${OUT}`)
