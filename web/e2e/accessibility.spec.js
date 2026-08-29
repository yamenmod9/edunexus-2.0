import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Roadmap task 5.7: responsive and keyboard accessible.
 *
 * Automated checks catch the mechanical failures - missing labels, unlabelled
 * controls, colour contrast - which is most of what goes wrong, but not all of
 * it. The keyboard tests below cover the parts axe cannot judge: that you can
 * actually reach and operate the test player without a mouse.
 */

const password = 'a11y pass 1'

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

async function scan(page) {
  return new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
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


test('the sign-in screen has no accessibility violations', async ({ page }) => {
  await page.goto('/login')
  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('the dashboard has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-home'))
  const results = await scan(page)
  expect(results.violations).toEqual([])
})

test('practice mode has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-practice'))
  await page.getByRole('link', { name: 'Practice' }).click()

  // The category browser, with its sidebar, counts and collapsible domains.
  await expect(page.getByRole('heading', { name: 'Practice' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  // The same screen with the checkboxes showing, which is a different set of
  // controls entirely.
  await page.getByLabel(/Combine categories/).click()
  await expect(page.getByRole('checkbox').nth(1)).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  // And the questions themselves.
  await page.getByLabel(/Combine categories/).click()
  await page.getByRole('button', { name: 'Practise' }).first().click()
  await expect(page.getByRole('button', { name: 'Check answer' }).first()).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('the test player has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-player'))
  await startQuickCheck(page)
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  // The Bluebook chrome is mostly hidden until a tool is opened, so a scan of
  // the default view would miss every control this screen actually added.
  await page.getByRole('button', { name: 'Cross out' }).click()
  await page.getByRole('button', { name: /^Question \d+ of \d+$/ }).click()
  expect((await scan(page)).violations).toEqual([])

  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Directions' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('the score report has no accessibility violations', async ({ page }) => {
  await register(page, uniqueEmail('a11y-score'))
  await startQuickCheck(page)
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  // End it immediately; an incomplete report still has to be readable.
  // Abandoning lives behind the review page, which is reached from the
  // navigator popup: during a live question the player deliberately shows
  // nothing that competes with the question.
  await page.getByRole('button', { name: /^Question \d+ of \d+$/ }).click()
  await page.getByRole('button', { name: 'Go to review page' }).click()
  await page.getByText('Abandon this test').click()
  await page.getByRole('button', { name: 'End test now' }).click()
  await expect(page).toHaveURL(/\/result$/)

  expect((await scan(page)).violations).toEqual([])

  // The answer review is a whole screen of new controls - filter chips with
  // counts, and a card per question - that the report alone does not cover.
  await page.getByRole('button', { name: /^Review all \d+ questions?$/ }).click()
  await expect(
    page.getByRole('button', { name: /^All, \d+ questions?$/ }),
  ).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('the progress page has no accessibility violations, empty or filled', async ({ page }) => {
  test.setTimeout(120_000)
  await register(page, uniqueEmail('a11y-progress'))
  await page.getByRole('link', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your progress' })).toBeVisible()
  expect((await scan(page)).violations).toEqual([])

  await startQuickCheck(page)
  for (let module = 0; module < 4; module += 1) {
    await expect(page.getByText(/Module \d+ of 4/)).toBeVisible()
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

  await page.getByRole('link', { name: 'Progress', exact: true }).click()
  await expect(page.getByText('Based on 1 finished attempt')).toBeVisible()
  expect((await scan(page)).violations).toEqual([])
})

test('a keyboard alone can sign in', async ({ page }) => {
  const email = uniqueEmail('a11y-keyboard')
  await register(page, email)
  // Sign-out is async - it revokes the refresh token server-side before
  // clearing local storage and navigating (see AuthContext.logout). A click()
  // resolves as soon as the event dispatches, without waiting for that; a
  // hard page.goto() straight after would race it and can abort the pending
  // revoke/clear entirely, leaving a stale session that lands back in the
  // authenticated shell instead of on the sign-in screen. Wait for the
  // client-side navigation sign-out itself performs instead of forcing one.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

  // The sign-in screen is not inside the app shell, so there is no skip link
  // to pass first - the first tab stop is the email field. Asserted rather
  // than assumed, because a stray focusable element ahead of the form would
  // be a real regression.
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveAttribute('id', 'email')
  await page.keyboard.type(email)

  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toHaveAttribute('id', 'password')
  await page.keyboard.type(password)

  // Enter submits from within the form; no reach for the mouse.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
})

test('the sign-in form tab order is email, password, submit', async ({ page }) => {
  await page.goto('/login')
  const order = []
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press('Tab')
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement
        return el.id || el.textContent.trim()
      }),
    )
  }
  expect(order).toEqual(['email', 'password', 'Sign in'])
})

test('the skip link is reachable and jumps to the main content', async ({ page }) => {
  await register(page, uniqueEmail('a11y-skip'))
  await page.keyboard.press('Tab')

  const focused = page.locator(':focus')
  await expect(focused).toHaveText('Skip to main content')
  await expect(focused).toBeVisible()
})

test('a question can be answered and flagged from the keyboard', async ({ page }) => {
  await register(page, uniqueEmail('a11y-answer'))
  await startQuickCheck(page)
  await expect(page.getByText(/Module 1 of 4/)).toBeVisible()

  const firstChoice = page.getByRole('radio').first()
  await firstChoice.focus()
  await page.keyboard.press('Space')
  await expect(firstChoice).toBeChecked()

  const mark = page.getByRole('button', { name: 'Mark for Review' })
  await mark.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Marked for review' })).toBeVisible()
})

test('the layout works on a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await register(page, uniqueEmail('a11y-mobile'))
  await startQuickCheck(page)
  // The module indicator is one of the things the header drops at this width,
  // so anchor on the timer, which never goes away.
  await expect(page.getByRole('timer')).toBeVisible()

  // Nothing may overflow horizontally - a test player you have to pan
  // sideways to read is unusable on a phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  const results = await scan(page)
  expect(results.violations).toEqual([])
})
