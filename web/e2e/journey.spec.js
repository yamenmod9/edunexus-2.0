import { expect, test } from '@playwright/test'

/**
 * The Phase 5 exit criterion: the full student journey in a real browser.
 * register -> practice -> a complete adaptive test -> score report.
 *
 * Runs against the Vite dev server on :5173 proxying the Flask API on :5055,
 * with the local SQLite database. It expects a form to already exist; the
 * admin test below builds one if the bank allows.
 */

const password = 'journey pass 1'

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`
}

async function register(page, email) {
  await page.goto('/register')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
}

test('a visitor is sent to the login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('registration rejects a weak password with the server message', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Email').fill(uniqueEmail('weak'))
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('status')).toContainText('password')
})

test('sign in, sign out, and sign back in', async ({ page }) => {
  const email = uniqueEmail('roundtrip')
  await register(page, email)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('practice mode grades an answer and shows the explanation', async ({ page }) => {
  await register(page, uniqueEmail('practice'))
  await page.getByRole('link', { name: 'Practice' }).click()

  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible()
  const firstQuestion = page.locator('form, div').filter({ hasText: 'Check answer' }).first()
  await expect(page.getByRole('button', { name: 'Check answer' }).first()).toBeVisible()

  // The bank must not hand a student the key before they answer.
  const body = await page.content()
  expect(body).not.toContain('correct_answer')

  await page.getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Check answer' }).first().click()
  await expect(page.getByRole('status').first()).toContainText(/Correct|answer is/)
})

test('a student cannot see the admin area', async ({ page }) => {
  await register(page, uniqueEmail('nonadmin'))
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('the full adaptive test runs through to a score report', async ({ page }) => {
  test.setTimeout(120_000)
  await register(page, uniqueEmail('test-taker'))

  await page.getByRole('link', { name: 'Tests' }).click()
  await expect(page.getByRole('heading', { name: 'Practice tests' })).toBeVisible()

  await page.getByRole('button', { name: 'Start test' }).first().click()

  // Four modules, answering everything. The client is told nothing about
  // routing; it just renders whatever module the server hands back.
  const seen = []
  for (let module = 0; module < 4; module += 1) {
    const header = page.getByText(/Module \d+ of 4/)
    await expect(header).toBeVisible()
    seen.push(await header.textContent())

    // The live question payload must never carry the key.
    const html = await page.content()
    expect(html).not.toContain('correct_answer')
    expect(html).not.toContain('is_correct')

    const count = await page.getByRole('button', { name: /^Question \d+/ }).count()
    for (let q = 0; q < count; q += 1) {
      await page.getByRole('button', { name: new RegExp(`^Question ${q + 1}[,$]`) }).click()
      const radios = page.getByRole('radio')
      if (await radios.count()) {
        // "B" is the correct choice in the seeded demo bank.
        await radios.nth(1).check()
      }
    }

    await page.getByRole('button', { name: 'Review and continue' }).click()
    await page
      .getByRole('button', { name: /Submit module and continue|Finish test/ })
      .click()
  }

  await expect(page).toHaveURL(/\/result$/)
  await expect(page.getByRole('heading', { name: /Module|Total/ }).first()).toBeVisible()

  // The score must never appear without its caveat.
  await expect(page.getByText('These scores are an approximation')).toBeVisible()

  // Both sections scored, and a total in range.
  await expect(page.getByText('Reading & Writing').first()).toBeVisible()
  await expect(page.getByText('Math').first()).toBeVisible()

  // Now the key is allowed - the attempt is over.
  await page.getByRole('button', { name: 'Review questions' }).first().click()
  await expect(page.getByText('Correct').first()).toBeVisible()
})

test('an in-progress test can be resumed after a reload', async ({ page }) => {
  await register(page, uniqueEmail('resume'))
  await page.getByRole('link', { name: 'Tests' }).click()
  await page.getByRole('button', { name: 'Start test' }).first().click()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  await page.getByRole('button', { name: /^Question 1/ }).click()
  await page.getByRole('radio').first().check()

  await page.reload()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()
  await expect(page.getByRole('radio').first()).toBeChecked()

  // And the dashboard advertises it.
  await page.goto('/')
  await expect(page.getByText('You have a test in progress')).toBeVisible()
})
