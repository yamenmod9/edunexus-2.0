import { expect, test } from '@playwright/test'

/**
 * The Phase 5 exit criterion: the full student journey in a real browser.
 * register -> practice -> a complete adaptive test -> score report.
 *
 * Runs against the Vite dev server on :5173 proxying the Flask API on :5055,
 * with the local SQLite database. It expects a form to already exist; the
 * admin test below builds one if the bank allows.
 *
 * The resize test additionally expects the first Reading & Writing question of
 * the Quick Check form to carry a passage - CLAUDE.md section 5 says every R&W
 * question has one - because a question with nothing beside it deliberately
 * renders as a single centred column with no divider to drag.
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

/**
 * Starts the short "Quick Check" form rather than whichever card happens to be
 * first. Full-length forms carry 98 questions; clicking through them in the
 * browser turns a 40-second suite into a 7-minute one, and the behaviour under
 * test does not depend on module length.
 */
async function startQuickCheck(page) {
  await page.getByRole('link', { name: 'Tests' }).click()
  // The div must contain both the form's name and its button: filtering on the
  // text alone matches the innermost wrapper, which holds the heading and not
  // the button.
  const card = page
    .locator('div')
    .filter({ hasText: 'Quick Check' })
    .filter({ has: page.getByRole('button', { name: 'Start test' }) })
    .last()
  await card.getByRole('button', { name: 'Start test' }).click()
}


test('a visitor is sent to the login screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('the trademark disclaimer shows signed out and signed in', async ({ page }) => {
  // A nominative-use disclaimer that quietly regresses away is a compliance
  // problem, not a cosmetic one - so it is pinned on both shells. The
  // non-affiliation clause is the load-bearing half; assert on that.
  const notice = page.getByText(/not affiliated with, and does not endorse, this site/)

  await page.goto('/login')
  await expect(notice).toBeVisible()

  await register(page, uniqueEmail('footer'))
  await expect(notice).toBeVisible()
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
  await expect(page.getByRole('button', { name: 'Check answer' }).first()).toBeVisible()

  // The bank must not hand a student the key before they answer.
  const body = await page.content()
  expect(body).not.toContain('correct_answer')

  await page.locator('fieldset label').first().click()
  await page.getByRole('button', { name: 'Check answer' }).first().click()
  await expect(page.getByRole('status').first()).toContainText(/Correct|answer is/)
})

test('a student cannot see the admin area', async ({ page }) => {
  await register(page, uniqueEmail('nonadmin'))
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0)

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

/**
 * Answers every question in the current module and submits it.
 *
 * Navigation is by the Next button rather than the seat grid: the Bluebook
 * chrome keeps the grid behind the "Question N of M" popup, which is exactly
 * the point of it, so a test that reached in for the seats would be testing a
 * layout the student never sees.
 */
async function answerModule(page) {
  const nav = page.getByRole('button', { name: /^Question \d+ of \d+$/ })
  await expect(nav).toBeVisible()
  const count = Number(/of (\d+)/.exec(await nav.textContent())[1])

  for (let q = 0; q < count; q += 1) {
    const choices = page.locator('fieldset label')
    // "B" is the correct choice in the seeded demo bank.
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

test('the full adaptive test runs through to a score report', async ({ page }) => {
  test.setTimeout(120_000)
  await register(page, uniqueEmail('test-taker'))

  await startQuickCheck(page)

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

    await answerModule(page)
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

test('the progress page shows an empty state, then fills in after a finished test', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await register(page, uniqueEmail('progress'))

  await page.getByRole('link', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
  await expect(page.getByText('Finish a full adaptive test')).toBeVisible()

  await startQuickCheck(page)

  for (let module = 0; module < 4; module += 1) {
    await expect(page.getByText(/Module \d+ of 4/)).toBeVisible()
    await answerModule(page)
  }
  await expect(page).toHaveURL(/\/result$/)

  await page.getByRole('link', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
  await expect(page.getByText('Based on 1 finished attempt')).toBeVisible()
  await expect(page.getByText('Latest total score')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'By domain' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'View report' }).first()).toBeVisible()
})

test('the passage and question panes can be resized, and the split sticks', async ({
  page,
}) => {
  await register(page, uniqueEmail('split'))
  await startQuickCheck(page)

  const divider = page.getByRole('separator')
  await expect(divider).toBeVisible()
  await expect(divider).toHaveAttribute('aria-valuenow', '50')

  // Keyboard, because that is the route a drag cannot cover.
  await divider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(divider).toHaveAttribute('aria-valuenow', '54')

  // The split is a statement about how this student reads, so it outlives
  // the question they happened to be on.
  await page.reload()
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '54')
})

test('an in-progress test can be resumed after a reload', async ({ page }) => {
  await register(page, uniqueEmail('resume'))
  await startQuickCheck(page)
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  await expect(page.getByRole('button', { name: 'Question 1 of 2' })).toBeVisible()
  await page.locator('fieldset label').first().click()

  await page.reload()
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()
  await expect(page.getByRole('radio').first()).toBeChecked()

  // And the dashboard advertises it.
  await page.goto('/')
  await expect(page.getByText('Test in progress')).toBeVisible()
})
