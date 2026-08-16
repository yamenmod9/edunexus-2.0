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
  await expect(page.getByRole('button', { name: 'Check answer' }).first()).toBeVisible()
  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Check answer' }).first().click()
  await expect(page.getByRole('status').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/03-practice.png`, fullPage: true })

  await page.getByRole('link', { name: 'Tests' }).click()
  await page.screenshot({ path: `${shots}/04-tests.png`, fullPage: true })

  await page.getByRole('button', { name: 'Start test' }).first().click()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()
  await page.getByRole('radio').nth(1).check()
  await page.screenshot({ path: `${shots}/05-test-player.png`, fullPage: true })

  await page.getByRole('button', { name: 'Review and continue' }).click()
  await page.screenshot({ path: `${shots}/06-module-review.png`, fullPage: true })
  await page.getByRole('button', { name: /Submit module and continue/ }).click()

  // Play out the rest so the score report has something in it.
  for (let module = 1; module < 4; module += 1) {
    const count = await page.getByRole('button', { name: /^Question \d+/ }).count()
    for (let q = 0; q < count; q += 1) {
      await page.getByRole('button', { name: new RegExp(`^Question ${q + 1}[,$]`) }).click()
      const radios = page.getByRole('radio')
      if (await radios.count()) await radios.nth(1).check()
    }
    await page.getByRole('button', { name: 'Review and continue' }).click()
    await page
      .getByRole('button', { name: /Submit module and continue|Finish test/ })
      .click()
  }

  await expect(page).toHaveURL(/\/result$/)
  await page.screenshot({ path: `${shots}/07-score-report.png`, fullPage: true })

  await page.getByRole('button', { name: 'Review questions' }).first().click()
  await page.screenshot({ path: `${shots}/08-question-review.png`, fullPage: true })

  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/tests')
  await page.screenshot({ path: `${shots}/09-mobile-tests.png`, fullPage: true })
})
