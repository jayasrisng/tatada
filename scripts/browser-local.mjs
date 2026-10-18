// Run against a browser-only Vite server, including a /tatada/ deployment base.
// Uses an isolated browser context; never changes the user's browser saves.
import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = (process.env.BASE ?? 'http://127.0.0.1:5174').replace(/\/$/, '')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const temp = mkdtempSync(join(tmpdir(), 'tatada-local-check-'))
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const apiRequests = [], errors = []
  page.on('request', (r) => { if (/\/api\//.test(r.url())) apiRequests.push(r.url()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/#/style`)
  await page.getByRole('button', { name: 'add from photos', exact: true }).first().waitFor()
  assert.equal(await page.getByRole('group', { name: 'Style for' }).getByRole('button', { name: 'today', exact: true }).getAttribute('aria-pressed'), 'true', 'Style starts with today, not a trip')
  await page.getByRole('tab', { name: 'closet', exact: true }).click()
  const loaded = await page.locator('.closet-item img').evaluateAll(async (imgs) => {
    await Promise.all(imgs.map((img) => img.decode().catch(() => {})))
    return imgs.every((img) => img.naturalWidth > 0)
  })
  assert.equal(loaded, true, 'all individual garment images must load beneath the app base')
  await page.getByRole('tab', { name: 'swipe', exact: true }).click()
  const before = await page.locator('.swipe-why').innerText()
  await page.getByRole('group', { name: 'Style for', exact: true }).getByRole('button', { name: 'Big Sur', exact: true }).click()
  assert.notEqual(await page.locator('.swipe-why').innerText(), before, 'switching trips must reset the deck')
  await page.getByRole('button', { name: 'pack it', exact: true }).click()
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('tatada:v1:preview')))
  const kept = state.looks.find((l) => l.tripId === 'bigsur' && l.verdict === 'keep')
  const trip = state.trips.find((t) => t.id === 'bigsur')
  assert.ok(kept && kept.day >= trip.start && kept.day <= trip.end, 'saved look belongs to the selected trip dates')
  await page.getByRole('button', { name: 'add from photos', exact: true }).first().click()
  await page.getByLabel('Photos to import').setInputFiles('public/wardrobe/white-sweater.png')
  await page.getByLabel('Name of piece 1 in white-sweater.png').fill('Upload test sweater')
  await page.getByLabel('I still own piece 1 in white-sweater.png').check()
  await page.getByRole('button', { name: /^add 0 to map · 1 to closet$/ }).click()
  await page.locator('[aria-label="Import result"]').waitFor()
  await page.reload()
  await page.getByRole('tab', { name: 'closet', exact: true }).click()
  assert.equal(await page.getByText('Upload test sweater', { exact: true }).count(), 1, 'camera/upload persists across reload')
  await page.goto(`${base}/#/welcome`)
  assert.equal(await page.getByRole('link', { name: /sign in|authorize Fo/i }).count(), 0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'export', exact: true }).click()
  const path = join(temp, 'backup.json')
  await (await download).saveAs(path)
  const backup = JSON.parse(readFileSync(path, 'utf8'))
  assert.ok(backup.state.wardrobe.some((g) => g.name === 'Upload test sweater' && g.isolated))
  assert.ok(backup.state.looks.some((l) => l.id === kept.id))
  await page.getByLabel('Import a Tatada export').setInputFiles(path)
  await page.getByRole('alertdialog', { name: 'Confirm import' }).getByRole('button', { name: 'replace', exact: true }).click()
  await page.goto(`${base}/#/style`)
  await page.getByRole('tab', { name: 'closet', exact: true }).click()
  assert.equal(await page.getByText('Upload test sweater', { exact: true }).count(), 1, 'restoring backup keeps uploaded clothes')
  assert.equal(await page.evaluate((id) => JSON.parse(localStorage.getItem('tatada:v1:preview')).looks.some((l) => l.id === id), kept.id), true)
  mkdirSync('scripts/out', { recursive: true })
  await page.screenshot({ path: 'scripts/out/isolated-closet.png', fullPage: true })
  await page.getByRole('tab', { name: 'mix', exact: true }).click()
  await page.screenshot({ path: 'scripts/out/isolated-outfit.png', fullPage: true })
  assert.deepEqual(apiRequests, [], 'browser-only app must never contact sign-in or backend APIs')
  assert.deepEqual(errors, [])
  console.log('Passed: garment assets, trip switching, camera/upload, reload, backup restore, no sign-in or API requests.')
} finally {
  await browser.close()
  rmSync(temp, { recursive: true, force: true })
}
