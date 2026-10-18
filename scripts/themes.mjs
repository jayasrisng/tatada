// Theme check: system preference on first load, toggle persistence, and
// screenshots of key screens in both themes on mobile and desktop.
//   npm run dev (+ npm run server for the Magic proposal), then node scripts/themes.mjs
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = new URL('./out/themes/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const failures = []
const check = (ok, msg) => (console.log(`${ok ? '✓' : '✗'} ${msg}`), ok || failures.push(msg))
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? 'chrome', headless: true })

const themeOf = (page) => page.evaluate(() => document.documentElement.dataset.theme)

// First load follows the system; a choice persists over the system setting.
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`)
  check((await themeOf(page)) === scheme, `first load follows system ${scheme}`)
  await page.getByRole('button', { name: /Switch to/ }).click()
  const flipped = scheme === 'light' ? 'dark' : 'light'
  check((await themeOf(page)) === flipped, `toggle switches to ${flipped}`)
  await page.reload()
  check((await themeOf(page)) === flipped, `choice (${flipped}) persists over system ${scheme} after reload`)
  await ctx.close()
}

const sizes = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } }
for (const theme of ['dark', 'light']) {
  for (const [size, viewport] of Object.entries(sizes)) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: size === 'mobile' ? 2 : 1, colorScheme: theme })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${BASE}/`)
    await page.evaluate(() => localStorage.clear())
    const shot = async (name, hash) => {
      if (hash) await page.goto(`${BASE}/#${hash}`)
      await page.waitForTimeout(450)
      await page.screenshot({ path: `${OUT}${theme}-${size}-${name}.png` })
    }
    await shot('home', '/')
    check(await page.locator('.magic-orb .buddy').isVisible(), `${theme}/${size}: Magic buddy on the central button`)
    check((await page.locator('img[src*="wajo"]').count()) === 0, `${theme}/${size}: no Wajo logo in Tatada's UI`)
    check((await page.locator('.magic-label').textContent()) === 'ask Fo', `${theme}/${size}: button labeled "ask Fo"`)
    await page.locator('.magic-orb').click()
    check(await page.getByRole('dialog', { name: 'Magic' }).isVisible(), `${theme}/${size}: Magic button opens Magic`)
    check(await page.getByText('powered by Wajo Fo').isVisible(), `${theme}/${size}: attribution shown`)
    await shot('magic')
    await page.keyboard.press('Escape')
    await shot('trip', '/trip/lisbon')
    await shot('decision', '/trip/lisbon/notebook')
    await page.getByRole('tab', { name: 'Stay' }).click()
    await shot('decision')
    await shot('tasks', '/tasks')
    await shot('print', '/trip/lisbon/print')
    check(errors.length === 0, `${theme}/${size}: no page errors`)
    await ctx.close()
  }
}
await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} problem(s)`)
  process.exit(1)
}
console.log(`\nok · screenshots in ${OUT}`)
