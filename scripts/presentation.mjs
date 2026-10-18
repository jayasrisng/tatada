// Hosted presentation checks: unavailable API, isolated preview, truthful disconnect.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const BASE = (process.env.BASE ?? 'http://localhost:5173').replace(/\/$/, '')
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true })
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  const writes = []
  await ctx.route('**/api/**', (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().url())
    return route.abort()
  })
  await page.goto(`${BASE}/`)
  await page.getByText('The live connection is unavailable right now.').waitFor()
  await page.getByRole('button', { name: 'explore a sample trip', exact: true }).click()
  await page.locator('.cc-trips').waitFor()
  const initialWrites = writes.length
  await page.goto(`${BASE}/#/trip/lisbon`)
  await page.reload()
  // Reload returns to the explicit unavailable state; opting in restores the preview.
  await page.getByRole('button', { name: 'explore a sample trip', exact: true }).click()
  await page.locator('.fo-pill').nth(1).click()
  await page.getByRole('dialog', { name: 'Magic' }).getByRole('button', { name: 'Send', exact: true }).click()
  const action = page.locator('.action-card').last()
  await action.getByRole('button', { name: 'Approve', exact: true }).click()
  await page.getByRole('button', { name: '7:00pm Saturday', exact: true }).click({ timeout: 15000 })
  await page.locator('.status-verified').waitFor({ timeout: 20000 })
  assert.equal(writes.filter((url) => !url.endsWith('/api/session')).length, 0, 'preview never sends actions or workspace data')
  assert.ok(writes.length >= initialWrites)
  console.log('✓ hosted preview is opt-in, restores sample data, and never calls live actions')
  await ctx.close()

  const owner = await browser.newContext({ viewport: { width: 390, height: 844 } })
  let connected = true
  let fail = true
  let logoutCalls = 0
  await owner.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const cors = { 'access-control-allow-origin': new URL(BASE).origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'access-control-allow-headers': 'Content-Type,X-Tatada' }
    const reply = (body, status = 200) => route.fulfill({ status, json: body, headers: cors })
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    if (path === '/api/session') return reply({ provider: 'live', authenticated: true, foConnected: connected, owner: true, account: { id: 'owner', kind: 'owner', since: 0 }, liveRecipients: [] })
    if (path === '/api/workspace') return reply({ version: 1, state: null })
    if (path === '/api/auth/logout') {
      logoutCalls++
      if (fail) return reply({ error: 'Temporary failure' }, 500)
      connected = false
      return reply({ ok: true })
    }
    return reply({ actions: [] })
  })
  const profile = await owner.newPage()
  await profile.goto(`${BASE}/#/welcome`)
  await profile.getByRole('button', { name: 'disconnect', exact: true }).click()
  await profile.getByRole('alert').filter({ hasText: 'Could not disconnect Fo' }).waitFor()
  assert.equal(connected, true)
  fail = false
  await profile.getByRole('button', { name: 'disconnect', exact: true }).click()
  await profile.getByText('Fo is not authorized.', { exact: false }).waitFor()
  assert.equal(logoutCalls, 2)
  assert.equal(connected, false)
  console.log('✓ disconnect uses the current endpoint, reports failure, and updates authorization state')
  await owner.close()
} finally { await browser.close() }
