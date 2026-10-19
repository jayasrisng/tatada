// Print workflow in a phone viewport.
//   MODE=browser  default browser-only build: PDF preview only, nothing saved or sent
//   MODE=mock     backend (single-owner, mock delivery): setup, exact preview, approval, duplicates
//   MODE=live     backend with live Fo (read-only checks only): the attachment blocker is shown, nothing sent
// BASE is the frontend URL. DATA is the backend's data file (mock mode) for outbox assertions.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
const base = (process.env.BASE ?? 'http://127.0.0.1:5181').replace(/\/$/, '')
const mode = process.env.MODE ?? 'browser'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [], api = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('request', (r) => { if (r.url().includes('/api/')) api.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  await p.goto(`${base}/#/trip/lisbon/print?ask=${encodeURIComponent('Print two copies double-sided in black and white')}`)
  await p.getByLabel('Print request').waitFor()
  for (const chip of ['black & white', 'two-sided', '2 copies']) assert.equal(await p.getByRole('button', { name: chip, exact: true }).getAttribute('aria-pressed'), 'true', chip)

  if (mode === 'browser') {
    await p.getByRole('button', { name: 'repeat pages ×2' }).click()
    await p.getByRole('button', { name: 'yes, it does' }).click()
    await p.getByRole('button', { name: 'show the PDF' }).click()
    await p.locator('.print-preview iframe').waitFor()
    assert.match(await p.locator('.print-note').innerText(), /No printer address is saved/)
    assert.equal(await p.getByRole('button', { name: /approve/ }).count(), 0, 'nothing can be emailed without the backend')
    assert.deepEqual(api, [], 'browser-only mode makes no API calls')
    await p.screenshot({ path: 'scripts/out/print-browser.png', fullPage: true })
    console.log('Passed (browser): request parsing, explicit choices, local PDF preview, no saved printer, no API calls, no send.')
  } else {
    // First use: Print asks for the printer.
    await p.getByLabel('Epson printer email').waitFor()
    await p.getByLabel('Epson printer email').fill('me@gmail.com')
    await p.getByRole('button', { name: 'save printer' }).click()
    await p.getByText(/Epson Connect address/).first().waitFor()
    await p.getByLabel('Epson printer email').fill('tatada-desk@print.epsonconnect.com')
    await p.locator('input[name=plainPaper]').first().check()
    for (const name of ['colorInk', 'autoDuplex', 'bodyPrintingOff', 'senderApproved']) await p.locator(`input[name=${name}]`).first().check()
    await p.getByRole('button', { name: 'save printer' }).click()
    await p.locator('.print-dest').waitFor()
    await p.reload()
    await p.locator('.print-dest').waitFor()
    assert.match(await p.locator('.print-dest').innerText(), /tatada-desk=\+bk\+dl@print\.epsonconnect\.com/, 'printer persists across sessions; documented suffixes shown')
    await p.getByRole('button', { name: 'repeat pages ×2' }).click()
    await p.getByRole('button', { name: 'show the PDF' }).click()
    await p.locator('.print-summary').waitFor({ timeout: 30000 })
    const summary = await p.locator('.print-summary').innerText()
    assert.match(summary, /printer\s+tatada-desk=\+bk\+dl@print\.epsonconnect\.com/)
    assert.match(summary, /every page repeated 2 times/)
    // The preview is the stored attachment: hash the bytes the iframe shows and compare with the job.
    const job = await p.evaluate(async () => (await (await fetch('/api/print/jobs')).json()).jobs[0])
    const shown = await p.evaluate(async () => { const src = document.querySelector('.print-preview iframe').src; const buf = await (await fetch(src)).arrayBuffer(); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('') })
    assert.equal(shown, job.pdfHash, 'preview bytes = approved attachment')
    if (mode === 'live') {
      assert.match(summary, /Can't send yet: Fo can't attach files yet: ask_fo accepts only message, conversationId, newConversation/)
      assert.equal(await p.getByRole('button', { name: /approve/ }).count(), 0)
      await p.screenshot({ path: 'scripts/out/print-live-blocked.png', fullPage: true })
      console.log('Passed (live Fo, read-only): printer setup persists, documented suffixes, exact preview, real attachment blocker shown, nothing sent.')
    } else {
      assert.match(summary, /Mock sender/)
      // Editing a setting invalidates the prepared job.
      await p.getByRole('button', { name: 'color', exact: true }).click()
      await p.locator('.print-summary').waitFor({ state: 'detached', timeout: 5000 }) // an edit clears the prepared job and its approval
      await p.getByRole('button', { name: 'black & white', exact: true }).click()
      await p.getByRole('button', { name: 'show the PDF' }).click()
      await p.locator('.print-summary').waitFor()
      // Rapid repeated clicks send once.
      // Three taps in the same tick, before React can disable the button.
      await p.getByRole('button', { name: 'approve & email to printer' }).waitFor()
      await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'approve & email to printer'); b.click(); b.click(); b.click() })
      await p.getByText(/Email submitted to your printer/).waitFor()
      assert.match(await p.locator('.print-steps').innerText(), /email submitted/)
      assert.doesNotMatch(await p.locator('.print-summary').innerText(), /\b(was|been|has|successfully) printed\b|status:? printed/i, 'never claims it printed')
      await p.screenshot({ path: 'scripts/out/print-submitted.png', fullPage: true })
      await p.reload()
      await p.getByText(/Email submitted to your printer/).waitFor()
      // Same document again → explicit duplicate confirmation.
      await p.getByRole('button', { name: 'start a new print' }).click()
      await p.getByRole('button', { name: 'repeat pages ×2' }).click()
      await p.getByRole('button', { name: 'show the PDF' }).click()
      await p.getByRole('button', { name: 'approve & email to printer' }).click()
      await p.getByText(/just submitted/).waitFor()
      assert.equal(await p.getByRole('button', { name: 'yes, print it again' }).count(), 1)
      if (process.env.DATA) {
        await new Promise((r) => setTimeout(r, 300))
        const outbox = Object.values(JSON.parse(readFileSync(process.env.DATA, 'utf8')).mock.printOutbox ?? {})
        assert.equal(outbox.length, 1, 'exactly one email despite repeated clicks, reload and the duplicate attempt')
        assert.equal(outbox[0].to, 'tatada-desk=+bk+dl@print.epsonconnect.com')
      }
      console.log('Passed (mock): first-use setup, validation, persistence, documented suffixes, exact preview hash, edit invalidation, one send for repeated clicks, honest status, reload, duplicate confirmation.')
    }
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }
