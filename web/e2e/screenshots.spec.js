import { expect, test } from '@playwright/test'

/**
 * Not assertions - these capture what the app actually looks like, so a change
 * to the UI can be eyeballed rather than inferred from a passing test.
 * Run with: npx playwright test e2e/screenshots.spec.js
 */

const password = 'shot pass 1'
const shots = 'screenshots'

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`
}

test('capture the student journey', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/login')
  await page.screenshot({ path: `${shots}/01-login.png`, fullPage: true })

  await page.goto('/register')
  const email = uniqueEmail('shots')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.screenshot({ path: `${shots}/02-dashboard.png`, fullPage: true })

  await page.getByRole('link', { name: 'Practice' }).click()
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible()
  await page.screenshot({ path: `${shots}/03a-practice-categories.png`, fullPage: true })

  await page.getByRole('button', { name: 'Algebra', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Check answer' }).first()).toBeVisible()
  await page.locator('fieldset label').first().click()
  await page.getByRole('button', { name: 'Check answer' }).first().click()
  await expect(page.getByRole('status').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/03-practice.png`, fullPage: true })

  // The practice player is full-bleed like the test player, so the app nav is
  // not on it - go back to the shell before reaching for a nav link.
  await page.goto('/tests')
  // Wait for the list, or the capture is of a spinner.
  await expect(page.getByRole('button', { name: 'Start test' }).first()).toBeVisible()
  await page.screenshot({ path: `${shots}/04-tests.png`, fullPage: true })

  const card = page
    .locator('div')
    .filter({ hasText: 'Quick Check' })
    .filter({ has: page.getByRole('button', { name: 'Start test' }) })
    .last()
  await card.getByRole('button', { name: 'Start test' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.locator('fieldset label').nth(1).click()
  await page.screenshot({ path: `${shots}/05-test-player.png`, fullPage: true })

  // The navigator popup and the cross-out tool, both of which are the point of
  // the Bluebook chrome and neither of which shows in a plain capture.
  await page.getByRole('button', { name: 'Cross out' }).click()
  await page.getByRole('button', { name: /^Question \d+ of \d+$/ }).click()
  await page.screenshot({ path: `${shots}/05b-test-navigator.png`, fullPage: true })
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.locator('fieldset label').nth(1).click()
  await page.getByRole('button', { name: 'Review', exact: true }).click()
  await page.screenshot({ path: `${shots}/06-module-review.png`, fullPage: true })
  await page.getByRole('button', { name: /Submit module and continue/ }).click()

  // Play out the rest so the score report has something in it.
  for (let module = 1; module < 4; module += 1) {
    const nav = page.getByRole('button', { name: /^Question \d+ of \d+$/ })
    await expect(nav).toBeVisible()
    const count = Number(/of (\d+)/.exec(await nav.textContent())[1])
    for (let q = 0; q < count; q += 1) {
      const choices = page.locator('fieldset label')
      if (await choices.count()) await choices.nth(1).click()
      if (q < count - 1) {
        await page.getByRole('button', { name: 'Next', exact: true }).click()
      }
    }
    await page.getByRole('button', { name: 'Review', exact: true }).click()
    await page
      .getByRole('button', { name: /Submit module and continue|Finish test/ })
      .click()
  }

  await expect(page).toHaveURL(/\/result$/)
  const reportUrl = page.url()
  await page.screenshot({ path: `${shots}/07-score-report.png`, fullPage: true })

  await page.getByRole('button', { name: 'Review questions' }).first().click()
  await page.screenshot({ path: `${shots}/08-question-review.png`, fullPage: true })

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/tests')
  await expect(page.getByRole('button', { name: 'Start test' }).first()).toBeVisible()
  await page.screenshot({ path: `${shots}/09-mobile-tests.png`, fullPage: true })

  // The same screens in dark. Half the palette only ever renders here, so a
  // light-only capture set cannot show a dark-mode regression at all.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('radio', { name: 'Dark' }).click()

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.screenshot({ path: `${shots}/10-dark-dashboard.png`, fullPage: true })

  await page.goto('/practice')
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible()
  await page.screenshot({ path: `${shots}/11-dark-practice-categories.png`, fullPage: true })

  await page.getByRole('button', { name: 'Algebra', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible()
  await page.screenshot({ path: `${shots}/11b-dark-practice.png`, fullPage: true })

  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
  await page.screenshot({ path: `${shots}/12-dark-progress.png`, fullPage: true })

  await page.goto(reportUrl)
  await expect(page.getByRole('heading', { name: 'Modules' })).toBeVisible()
  await page.screenshot({ path: `${shots}/13-dark-score-report.png`, fullPage: true })
})
